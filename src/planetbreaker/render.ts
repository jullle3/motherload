import * as THREE from 'three';
import { KEYS, PLANET, WEAPONS, type WeaponKey } from './config';
import { PlanetGame, type Attack, type Point } from './game';

const noiseGLSL = `
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.53+noise(p*2.03)*.27+noise(p*4.07)*.13+noise(p*8.13)*.07;}
`;
const vertex = `varying vec3 vP;varying vec3 vN;varying vec3 vW;varying vec2 vUv;
uniform float breakup;
void main(){vP=position;vUv=uv;vN=normalize(mat3(modelMatrix)*normal);vec3 p=position*(1.+breakup*.6);vec4 w=modelMatrix*vec4(p,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const surfaceFragment = `precision highp float;
varying vec3 vP;varying vec3 vN;varying vec3 vW;varying vec2 vUv;
uniform float damage;uniform float time;uniform float breakup;uniform sampler2D scars;
${noiseGLSL}
void main(){
 vec3 p=normalize(vP),N=normalize(vN),L=normalize(vec3(-3.,4.,5.)),V=normalize(cameraPosition-vW);
 float continent=fbm(p*3.1+vec3(7.2,1.1,3.4));float detail=fbm(p*55.);
 float land=smoothstep(.485,.515,continent);float mountain=smoothstep(.58,.72,continent);
 vec3 sea=mix(vec3(.014,.055,.095),vec3(.035,.23,.29),smoothstep(.38,.5,continent));
 vec3 ground=mix(vec3(.14,.22,.12),vec3(.36,.34,.22),smoothstep(.51,.62,continent));
 ground=mix(ground,vec3(.63,.65,.58),mountain);ground*=.7+detail*.55;
 vec3 color=mix(sea,ground,land);float ice=smoothstep(.86,.98,abs(p.y)+noise(p*25.)*.035);color=mix(color,vec3(.77,.88,.89),ice);
 float scar=texture2D(scars,vUv).r;
 float field=noise(p*8.1+vec3(2.));float cracks=1.-smoothstep(.018,.045,abs(field-.5));
 float fracture=smoothstep(.22,.55,damage);float holes=smoothstep(.56,.95,damage);
 if(damage>.55 && field<holes*.72) discard;
 if(breakup>.03 && noise(p*18.)<breakup) discard;
 color=mix(color,vec3(.045,.025,.018),scar*.85);
 color=mix(color,color*.28,fracture*.6);
 float day=max(dot(N,L),0.);float light=.06+day*.96;
 float spec=pow(max(dot(reflect(-L,N),V),0.),95.)*(1.-land)*(1.-scar)*(1.-damage);
 vec3 hot=mix(vec3(1.,.065,.008),vec3(1.,.6,.12),noise(p*40.+time*.07));
 float glow=cracks*fracture*(.5+.5*noise(p*30.))+scar*.18;
 vec3 result=color*light+vec3(.55,.76,.85)*spec*.7+hot*glow*1.6;
 float rim=pow(1.-max(dot(N,V),0.),4.);result+=vec3(.04,.28,.45)*rim*day*(1.-damage);
 gl_FragColor=vec4(result,1.);
}`;
type Effect = {
  group: THREE.Group;
  line: THREE.Line;
  flash: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  head: THREE.Mesh;
  age: number;
  active: boolean;
  target: THREE.Vector3;
  source: THREE.Vector3;
  key: WeaponKey;
  impacted: boolean;
};

export class PlanetView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  private world = new THREE.Group();
  private surface: THREE.Mesh;
  private cloud: THREE.Mesh;
  private atmosphere: THREE.Mesh;
  private core: THREE.Mesh;
  private finalRing = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 1, 128),
    new THREE.MeshBasicMaterial({
      color: '#ffc58c',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  private uniforms: Record<string, THREE.IUniform>;
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private effects: Effect[] = [];
  private fleet: Record<WeaponKey, THREE.Group[]> = {
    laser: [],
    missile: [],
    plasma: [],
    siege: [],
  };
  private debris: THREE.InstancedMesh;
  private ray = new THREE.Raycaster();
  private time = 0;
  private completionTime = -1;
  private lastShots = -1;
  private shotIndex = 0;
  private scratch = new THREE.Vector3();
  private resizeObserver: ResizeObserver;
  private dummy = new THREE.Object3D();
  low = false;
  reduced = false;
  onImpact?: (key: WeaponKey) => void;
  constructor(
    private host: HTMLElement,
    private fire: (p: Point) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor('#040a10', 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Aurelia. Click the planet to fire a mining laser.',
    );
    this.camera.position.set(0, 0.15, 9.6);
    this.scene.add(this.world);
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.wrapS = THREE.RepeatWrapping;
    this.uniforms = {
      damage: { value: 0 },
      time: { value: 0 },
      breakup: { value: 0 },
      scars: { value: this.texture },
    };
    this.surface = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 128, 80),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: vertex,
        fragmentShader: surfaceFragment,
      }),
    );
    this.world.add(this.surface);
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(1.38, 80, 48),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: vertex,
        fragmentShader: `precision highp float;varying vec3 vP;varying vec3 vN;varying vec3 vW;varying vec2 vUv;uniform float time;uniform float breakup;${noiseGLSL}void main(){vec3 p=normalize(vP);float n=fbm(p*9.+vec3(time*.025));vec3 c=mix(vec3(.12,.008,.002),vec3(1.,.19,.012),smoothstep(.32,.65,n));c+=vec3(1.,.65,.15)*pow(n,6.)*3.;gl_FragColor=vec4(c*(1.-breakup),1.);}`,
      }),
    );
    this.world.add(this.core);
    this.finalRing.rotation.x = -0.3;
    this.scene.add(this.finalRing);
    this.cloud = new THREE.Mesh(
      new THREE.SphereGeometry(1.826, 80, 48),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: vertex,
        transparent: true,
        depthWrite: false,
        fragmentShader: `precision highp float;varying vec3 vP;varying vec3 vN;varying vec3 vW;varying vec2 vUv;uniform float damage;${noiseGLSL}void main(){vec3 p=normalize(vP);float n=fbm(p*6.+vec3(fbm(p*11.)*2.));float a=smoothstep(.53,.7,n)*.82*(1.-smoothstep(.05,.65,damage));float l=.12+max(dot(normalize(vN),normalize(vec3(-3,4,5))),0.);gl_FragColor=vec4(vec3(.8,.89,.94)*l,a);}`,
      }),
    );
    this.world.add(this.cloud);
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.89, 80, 48),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: vertex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        fragmentShader: `varying vec3 vN;varying vec3 vW;uniform float damage;void main(){float rim=pow(max(0.,1.-abs(dot(normalize(vN),normalize(cameraPosition-vW)))),3.);gl_FragColor=vec4(mix(vec3(.07,.43,.8),vec3(1.,.14,.02),damage),rim*.62*(1.-damage));}`,
      }),
    );
    this.world.add(this.atmosphere);
    this.scene.add(new THREE.HemisphereLight('#afddff', '#172132', 2));
    const sun = new THREE.DirectionalLight('#e3f7ff', 3);
    sun.position.set(-3, 4, 5);
    this.scene.add(sun);
    const stars = new Float32Array(1500 * 3);
    let seed = PLANET.seed;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < stars.length; i += 3) {
      stars[i] = (rand() - 0.5) * 60;
      stars[i + 1] = (rand() - 0.5) * 36;
      stars[i + 2] = -8 - rand() * 25;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    this.scene.add(
      new THREE.Points(
        starGeometry,
        new THREE.PointsMaterial({
          color: '#95b7d1',
          size: 0.035,
          transparent: true,
          opacity: 0.65,
          sizeAttenuation: true,
        }),
      ),
    );
    // Thin orbital guides frame the world without covering its surface.
    for (const radius of [2.35, 2.7]) {
      const pts = Array.from(
        { length: 161 },
        (_, i) =>
          new THREE.Vector3(
            Math.cos((i / 160) * Math.PI * 2) * radius,
            Math.sin((i / 160) * Math.PI * 2) * radius,
            0,
          ),
      );
      const orbit = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: '#4b7e96', transparent: true, opacity: 0.14 }),
      );
      orbit.rotation.set(0.85, 0.4, -0.35);
      this.scene.add(orbit);
    }
    this.debris = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.08, 0),
      new THREE.MeshStandardMaterial({
        color: '#655348',
        roughness: 0.95,
        emissive: '#a72b08',
        emissiveIntensity: 0.3,
      }),
      100,
    );
    this.debris.count = 0;
    this.scene.add(this.debris);
    for (let i = 0; i < 32; i++) {
      const group = new THREE.Group();
      group.visible = false;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array(36 * 3), 3),
        ),
        new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending }),
      );
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(1, 12, 8),
        new THREE.MeshBasicMaterial({
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.84, 1, 48),
        new THREE.MeshBasicMaterial({
          transparent: true,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 8, 6),
        new THREE.MeshBasicMaterial({ color: '#fff3d7' }),
      );
      group.add(line, flash, ring, head);
      this.scene.add(group);
      this.effects.push({
        group,
        line,
        flash,
        ring,
        head,
        age: 0,
        active: false,
        target: new THREE.Vector3(),
        source: new THREE.Vector3(),
        key: 'laser',
        impacted: false,
      });
    }
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        this.camera,
      );
      const hit = this.ray.intersectObject(this.surface)[0];
      if (hit) {
        const p = this.world.worldToLocal(hit.point).normalize();
        this.fire(p.toArray() as Point);
      }
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.low ? 1 : 1.75));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.position.z = this.camera.aspect < 0.9 ? 8.7 / this.camera.aspect ** 0.65 : 8.3;
    this.camera.updateProjectionMatrix();
  }
  get finished() {
    return this.uniforms.breakup.value >= 1;
  }
  settings(low: boolean, reduced: boolean) {
    this.low = low;
    this.reduced = reduced;
    this.resize();
  }
  private structure(key: WeaponKey) {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({
      color: '#43596c',
      metalness: 0.75,
      roughness: 0.32,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: '#111e2e',
      metalness: 0.6,
      roughness: 0.4,
    });
    const glow = new THREE.MeshBasicMaterial({ color: WEAPONS[key].color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.12, 0.26), metal);
    g.add(body);
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(key === 'siege' ? 0.2 : 0.3, 0.025, 0.17),
        dark,
      );
      panel.position.x = side * 0.23;
      g.add(panel);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.008, 0.018), glow);
      strip.position.set(side * 0.23, 0.019, 0.04);
      g.add(strip);
    }
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.055, key === 'siege' ? 0.4 : 0.22, 8),
      metal,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.15;
    g.add(barrel);
    const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glow);
    emitter.position.z = 0.28;
    g.add(emitter);
    if (key === 'missile')
      for (const x of [-0.09, 0.09]) {
        const pod = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.28), metal);
        pod.position.set(x, 0.1, 0);
        g.add(pod);
      }
    if (key === 'plasma') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 24), glow);
      ring.position.z = -0.12;
      g.add(ring);
    }
    if (key === 'siege') g.scale.setScalar(1.35);
    this.scene.add(g);
    return g;
  }
  private updateScars(game: PlanetGame) {
    if (game.state.shots === this.lastShots) return;
    this.lastShots = game.state.shots;
    const c = this.canvas.getContext('2d')!;
    c.fillStyle = '#000';
    c.fillRect(0, 0, 1024, 512);
    game.state.surfaceDamage.forEach((damage, i) => {
      if (!damage) return;
      const x = ((i % 64) + 0.5) * 16,
        y = (Math.floor(i / 64) + 0.5) * 16,
        r = 8 + Math.min(8, damage);
      for (const offset of [-1024, 0, 1024]) {
        const grad = c.createRadialGradient(x + offset, y, 0, x + offset, y, r);
        grad.addColorStop(0, `rgba(255,255,255,${Math.min(0.65, damage * 0.1)})`);
        grad.addColorStop(1, '#0000');
        c.fillStyle = grad;
        c.fillRect(x + offset - r, y - r, r * 2, r * 2);
      }
    });
    for (const p of game.state.scars) {
      const u = (Math.atan2(p[2], -p[0]) / (Math.PI * 2) + 1) % 1;
      const v = Math.acos(Math.max(-1, Math.min(1, p[1]))) / Math.PI;
      const r = 5 + game.fraction * 13;
      for (const offset of [-1024, 0, 1024]) {
        const x = u * 1024 + offset,
          y = v * 512;
        const grad = c.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.45, '#c0c0c0');
        grad.addColorStop(0.75, '#555');
        grad.addColorStop(1, '#0000');
        c.fillStyle = grad;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    this.texture.needsUpdate = true;
  }
  private attack(event: Attack) {
    const e = this.effects.slice(0, this.low ? 12 : 32).find((e) => !e.active);
    if (!e) return;
    e.active = true;
    e.age = 0;
    e.key = event.weapon;
    e.impacted = false;
    e.target.fromArray(event.point).multiplyScalar(1.81);
    this.world.localToWorld(e.target);
    const structures = this.fleet[event.weapon];
    if (event.manual || !structures.length) e.source.set(-2.7, -1.6, 2.8);
    else e.source.copy(structures[this.shotIndex++ % structures.length].position);
    e.group.visible = true;
    e.flash.material.color.set(WEAPONS[event.weapon].color);
    e.ring.material.color.set(WEAPONS[event.weapon].color);
    (e.line.material as THREE.LineBasicMaterial).color.set(WEAPONS[event.weapon].color);
  }
  render(dt: number, game: PlanetGame) {
    this.time += dt;
    this.uniforms.time.value = this.time;
    this.uniforms.damage.value = game.fraction;
    if (!this.reduced) {
      this.world.rotation.y += dt * 0.035;
      this.world.rotation.z = 0.12;
      this.cloud.rotation.y += dt * 0.009;
    }
    this.world.updateMatrixWorld(true);
    this.updateScars(game);
    if (game.complete && this.completionTime < 0) this.completionTime = this.time;
    if (!game.complete) this.completionTime = -1;
    const end =
      this.completionTime < 0
        ? 0
        : Math.min(1, (this.time - this.completionTime) / (this.reduced ? 1 : 7));
    this.uniforms.breakup.value = end;
    this.core.scale.setScalar(1 - end * 0.99);
    this.core.visible = end < 0.99;
    this.finalRing.visible = end > 0 && end < 1 && !this.reduced;
    this.finalRing.scale.setScalar(1 + end * 14);
    this.finalRing.material.opacity = Math.sin(end * Math.PI) * 0.6;
    this.surface.visible = end < 1;
    this.cloud.visible = end < 0.1;
    this.atmosphere.visible = end < 0.1;
    for (const k of KEYS) {
      const count = Math.min(game.state.counts[k], this.low ? 3 : 5);
      while (this.fleet[k].length < count) this.fleet[k].push(this.structure(k));
      this.fleet[k].forEach((g, i) => {
        g.visible = i < count;
        const a =
          (KEYS.indexOf(k) * Math.PI) / 2 + i * 0.23 + (this.reduced ? 0 : this.time * 0.04);
        g.position.set(
          Math.cos(a) * (2.35 + i * 0.09),
          Math.sin(a) * 1.9,
          Math.sin(a * 1.3) * 0.9 + 0.5,
        );
        g.lookAt(0, 0, 0);
      });
    }
    for (const event of game.events.splice(0)) {
      const salvo = event.manual ? 1 : Math.min(game.state.counts[event.weapon], this.low ? 2 : 3);
      for (let i = 0; i < salvo; i++) this.attack(event);
    }
    for (const e of this.effects) {
      if (!e.active) continue;
      e.age += dt;
      const flight = e.key === 'missile' ? 1.1 : e.key === 'siege' ? 0.65 : 0.32;
      const t = Math.min(1, e.age / flight),
        impact = Math.max(0, e.age - flight);
      const pos = e.line.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 36; i++) {
        const s = (i / 35) * t;
        const p = this.scratch.lerpVectors(e.source, e.target, s);
        if (e.key === 'missile') p.y += Math.sin(s * Math.PI) * 0.65;
        pos.setXYZ(i, p.x, p.y, p.z);
        if (i === 35) e.head.position.copy(p);
      }
      pos.needsUpdate = true;
      e.line.frustumCulled = false;
      (e.line.material as THREE.LineBasicMaterial).opacity = impact
        ? Math.max(0, 1 - impact * 4)
        : 0.8;
      e.head.visible = !impact;
      e.flash.visible = e.ring.visible = impact > 0;
      if (impact && !e.impacted) {
        e.impacted = true;
        this.onImpact?.(e.key);
      }
      e.flash.position.copy(e.target);
      e.ring.position.copy(e.target);
      e.ring.lookAt(e.target.clone().multiplyScalar(2));
      const strength = { laser: 0.16, missile: 0.28, plasma: 0.4, siege: 0.58 }[e.key];
      e.flash.scale.setScalar(strength * (1 + impact * 2));
      e.flash.material.opacity = Math.max(0, 0.8 - impact * 1.8) * (this.reduced ? 0.35 : 1);
      e.ring.scale.setScalar(0.05 + impact * strength * 4);
      e.ring.material.opacity = Math.max(0, 0.65 - impact * 0.75);
      if (impact > 1) {
        e.active = false;
        e.group.visible = false;
      }
    }
    const debrisCount =
      game.fraction < 0.25 ? 0 : Math.floor((game.fraction * 60 + end * 40) * (this.low ? 0.5 : 1));
    this.debris.count = debrisCount;
    for (let i = 0; i < debrisCount; i++) {
      const a = i * 2.39996,
        y = 1 - 2 * ((i * 0.618034 + 0.5) % 1),
        r = Math.sqrt(1 - y * y),
        drift = this.reduced ? 0 : this.time * (0.012 + (i % 4) * 0.002);
      this.dummy.position
        .set(Math.cos(a + drift) * r, y, Math.sin(a + drift) * r)
        .multiplyScalar(1.95 + (i % 7) * 0.085 + end * (1.5 + (i % 5)));
      this.dummy.rotation.set(a + drift, a, drift);
      this.dummy.scale.setScalar(0.35 + (i % 5) * 0.3 + end * 0.6);
      this.dummy.updateMatrix();
      this.debris.setMatrixAt(i, this.dummy.matrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.resizeObserver.disconnect();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.texture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
