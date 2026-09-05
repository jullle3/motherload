import * as THREE from 'three';
import { Game, WIDTH, HEIGHT, RELIC, ORES } from './game';
export class WorldView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera();
  rig = new THREE.Group();
  terrain: THREE.InstancedMesh;
  minerals: THREE.InstancedMesh;
  relic: THREE.Mesh;
  drill: THREE.Mesh;
  flame: THREE.Mesh;
  lamp: THREE.PointLight;
  dummy = new THREE.Object3D();
  lastRevision = -1;
  known = new Set<number>();
  low = false;
  reduced = false;
  shake = 0;
  particles: { mesh: THREE.Mesh; life: number; vx: number; vy: number }[] = [];
  constructor(
    public host: HTMLElement,
    public game: Game,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    host.append(this.renderer.domElement);
    this.scene.background = new THREE.Color('#101a22');
    this.scene.add(new THREE.AmbientLight('#cadfe1', 2));
    const sun = new THREE.DirectionalLight('#ffd3a4', 3);
    sun.position.set(-10, 20, 25);
    this.scene.add(sun);
    this.terrain = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.97, 0.97, 1.2),
      new THREE.MeshStandardMaterial({ roughness: 0.95 }),
      WIDTH * HEIGHT,
    );
    this.terrain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.terrain.frustumCulled = false;
    this.scene.add(this.terrain);
    this.minerals = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.23),
      new THREE.MeshStandardMaterial({
        roughness: 0.4,
        metalness: 0.5,
        emissive: '#59666c',
        emissiveIntensity: 0.3,
      }),
      WIDTH * HEIGHT,
    );
    this.minerals.frustumCulled = false;
    this.scene.add(this.minerals);
    for (let i = 0; i < WIDTH * HEIGHT; i++) {
      const t = game.tiles[i],
        y = Math.floor(i / WIDTH),
        x = i % WIDTH;
      this.dummy.position.set(x + 0.5, -y - 0.5, 0);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.terrain.setMatrixAt(i, this.dummy.matrix);
      const colors = ['#715548', '#425764', '#423f59'];
      const c = new THREE.Color(t.heat ? '#ac4c34' : colors[Math.min(t.hardness, 2)]);
      c.multiplyScalar(0.8 + ((i * 17 + game.seed) % 19) / 45);
      this.terrain.setColorAt(i, c);
      this.dummy.position.z = 0.8;
      this.dummy.scale.setScalar(t.ore >= 0 ? 1 : 0);
      this.dummy.rotation.set(0.2, 0.5, i);
      this.dummy.updateMatrix();
      this.minerals.setMatrixAt(i, this.dummy.matrix);
      this.minerals.setColorAt(i, new THREE.Color(t.ore >= 0 ? ORES[t.ore].color : '#000000'));
    }
    const box = (
      w: number,
      h: number,
      d: number,
      color: string,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = this.scene,
    ) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
      );
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    // Distant planetary landscape, made entirely from original geometry.
    box(WIDTH, HEIGHT, 1, '#1e2930', WIDTH / 2, -HEIGHT / 2, -1.2);
    const rng = (i: number) => Math.abs(Math.sin(i * 127.1 + game.seed) * 43758.5453) % 1;
    for (let i = 0; i < 70; i++) {
      const star = new THREE.Mesh(
        new THREE.SphereGeometry(0.015 + rng(i) * 0.025, 4, 4),
        new THREE.MeshBasicMaterial({ color: '#b4c3c7' }),
      );
      star.position.set(rng(i + 8) * 58 - 5, 2 + rng(i + 17) * 17, -4);
      this.scene.add(star);
    }
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 32, 24),
      new THREE.MeshStandardMaterial({ color: '#8b9694', roughness: 1 }),
    );
    moon.position.set(34, 9, -6);
    this.scene.add(moon);
    for (let i = 0; i < 20; i++) {
      const w = 3 + rng(i) * 4,
        h = 2 + rng(i + 2) * 4;
      const shape = new THREE.BufferGeometry();
      shape.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, h, 0], 3),
      );
      const m = new THREE.Mesh(
        shape,
        new THREE.MeshBasicMaterial({ color: i % 2 ? '#283b41' : '#344347' }),
      );
      m.position.set(i * 3 - 4, 0, -3);
      this.scene.add(m);
      const face = new THREE.BufferGeometry();
      face.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-w, 0, 0, -0.4, 0, 0, 0, h, 0], 3),
      );
      const shade = new THREE.Mesh(face, new THREE.MeshBasicMaterial({ color: '#20333b' }));
      shade.position.set(i * 3 - 4, 0, -2.95);
      this.scene.add(shade);
    }
    box(48, 0.16, 2, '#9b7d61', 24, 0.05, 0); // surface lip: visual only, terrain remains drillable
    box(6, 0.14, 1.8, '#c3b5a1', 24.5, 0.15, 0.1);
    box(3.4, 1.6, 1.5, '#68716c', 19.4, 0.95, -0.4);
    box(3.8, 0.22, 1.8, '#b0b2a0', 19.4, 1.85, -0.4);
    box(0.9, 0.65, 0.1, '#a8d5cc', 19.7, 1.15, 0.42);
    box(0.55, 1.2, 0.1, '#253b41', 18.3, 0.8, 0.42);
    box(3.3, 0.12, 0.1, '#e6ad64', 19.4, 0.42, 0.45);
    box(0.12, 4, 0.14, '#919e99', 22, 2, -0.7);
    box(1, 0.6, 0.08, '#dda566', 22.5, 3.6, -0.7);
    for (let i = 0; i < 3; i++) box(0.75, 0.65, 0.75, '#a67e52', 28 + i * 0.9, 0.45, 0);
    box(0.72, 0.44, 0.5, '#eeb65d', 0, 0, 0, this.rig);
    box(0.38, 0.26, 0.44, '#92d9da', 0.04, 0.27, 0.02, this.rig);
    box(0.82, 0.14, 0.6, '#303c42', 0, -0.27, 0, this.rig);
    for (const x of [-0.28, 0, 0.28]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.65, 8),
        new THREE.MeshStandardMaterial({ color: '#202b32' }),
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, -0.24, 0);
      this.rig.add(wheel);
    }
    this.drill = new THREE.Mesh(
      new THREE.ConeGeometry(0.23, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: '#b9c6c4', metalness: 0.65, roughness: 0.3 }),
    );
    this.drill.position.y = -0.48;
    this.drill.rotation.z = Math.PI;
    this.rig.add(this.drill);
    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.5, 7),
      new THREE.MeshBasicMaterial({ color: '#83edee', transparent: true, opacity: 0.8 }),
    );
    this.flame.rotation.z = Math.PI;
    this.flame.position.set(0, -0.6, -0.1);
    this.rig.add(this.flame);
    this.scene.add(this.rig);
    this.lamp = new THREE.PointLight('#b9eaff', 12, 9);
    this.scene.add(this.lamp);
    this.relic = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4),
      new THREE.MeshStandardMaterial({
        color: '#c7ffde',
        emissive: '#62ffb9',
        emissiveIntensity: 2,
        wireframe: true,
      }),
    );
    this.relic.position.set(24.5, -153.5, 1);
    this.scene.add(this.relic);
    this.resize();
    this.sync();
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    const halfH = 10;
    const halfW = (halfH * w) / h;
    Object.assign(this.camera, {
      left: -halfW,
      right: halfW,
      top: halfH,
      bottom: -halfH,
      near: 0.1,
      far: 100,
    });
    this.camera.updateProjectionMatrix();
  }
  sync() {
    if (this.lastRevision === this.game.revision) return;
    for (const i of this.game.dug) {
      if (this.known.has(i)) continue;
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.terrain.setMatrixAt(i, this.dummy.matrix);
      this.minerals.setMatrixAt(i, this.dummy.matrix);
    }
    for (const i of this.known)
      if (!this.game.dug.has(i)) {
        this.dummy.position.set((i % WIDTH) + 0.5, -Math.floor(i / WIDTH) - 0.5, 0);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.terrain.setMatrixAt(i, this.dummy.matrix);
      }
    this.known = new Set(this.game.dug);
    this.terrain.instanceMatrix.needsUpdate = true;
    this.minerals.instanceMatrix.needsUpdate = true;
    this.lastRevision = this.game.revision;
  }
  burst(x: number, y: number) {
    if (this.low) return;
    this.shake = 0.12;
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.06),
        new THREE.MeshBasicMaterial({ color: i % 2 ? '#efbd75' : '#b5d6ce' }),
      );
      mesh.position.set(x, -y, 1);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        life: 0.5,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3,
      });
    }
  }
  draw(dt: number) {
    this.sync();
    const r = this.game.rig;
    this.rig.position.set(r.x, -r.y, 1);
    this.flame.visible = this.game.thrust;
    this.flame.scale.y = 0.7 + Math.random() * 0.5;
    const side = this.game.target >= 0 && Math.floor(this.game.target / WIDTH) === Math.floor(r.y);
    this.drill.position.set(side ? this.game.facing * 0.53 : 0, side ? 0 : -0.48, 0);
    this.drill.rotation.z = side ? (-this.game.facing * Math.PI) / 2 : Math.PI;
    this.drill.rotation.y += this.game.target >= 0 ? dt * 30 : 0;
    this.relic.visible = !this.game.dug.has(RELIC) && !this.game.won;
    this.relic.rotation.y += dt;
    this.lamp.position.set(r.x, -r.y, 3);
    this.lamp.intensity = this.low ? 0 : 12;
    const targetY = r.y < 2 ? 2 : -r.y + 2;
    this.camera.position.x += (r.x - this.camera.position.x) * Math.min(1, dt * 6);
    this.camera.position.y += (targetY - this.camera.position.y) * Math.min(1, dt * 6);
    this.camera.position.z = 30;
    if (!this.reduced && this.shake > 0)
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
    this.shake = Math.max(0, this.shake - dt);
    for (const p of this.particles) {
      p.life -= dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.vy -= dt * 7;
    }
    this.particles = this.particles.filter((p) => {
      if (p.life > 0) return true;
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
      return false;
    });
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = Array.isArray(o.material) ? o.material : [o.material];
        m.forEach((x) => x.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
