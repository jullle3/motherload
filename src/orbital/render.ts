import * as THREE from 'three';
import { DISCOVERIES, type Machine } from './config';
import { type OrbitalGame } from './game';
export type Selection = Machine | 'market' | 'bay' | 'dock';
export const POSITIONS: Record<Selection, [number, number]> = {
  drone: [-6, -3],
  sorter: [-2, -3],
  furnace: [2, -3],
  electronics: [5.7, -3],
  storage: [-2, 1.7],
  market: [2, 1.7],
  bay: [-6, 1.7],
  dock: [6, 2.8],
};
const COLORS = {
  deck: '#263b40',
  steel: '#51686a',
  cream: '#d5c9a7',
  gold: '#e9b66d',
  mint: '#91c9b3',
  dark: '#172a31',
  orange: '#e98957',
};
export class StationView {
  renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera();
  private target = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private objects = new Map<Selection, THREE.Group>();
  private markers = new Map<Selection, THREE.Mesh>();
  private picking: THREE.Object3D[] = [];
  private drones: THREE.Group[] = [];
  private cargo: THREE.Mesh[] = [];
  private beltCargo: THREE.Mesh[] = [];
  private stacks: THREE.Group[] = [];
  private exhibits: THREE.Group[] = [];
  private ship = new THREE.Group();
  private ray = new THREE.Raycaster();
  private elapsed = 0;
  private signature = '';
  private focus: Selection | null = null;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  low = false;
  reduced = false;
  constructor(
    private host: HTMLElement,
    private onSelect: (selection: Selection) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor('#101e27', 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Orbital station. Select a machine or use the station controls below.',
    );
    this.scene.add(new THREE.HemisphereLight('#c2e2e3', '#343134', 2.5));
    const key = new THREE.DirectionalLight('#fff0ce', 3.2);
    key.position.set(-8, 15, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#83c4dd', 1.6);
    rim.position.set(8, 8, -9);
    this.scene.add(rim);
    this.camera.position.set(16, 18, 23);
    this.camera.lookAt(0, 0, 0);
    const base = new THREE.Group();
    this.scene.add(base);
    this.box(base, 0, -0.45, 0, 17.5, 0.8, 10, COLORS.dark);
    this.box(base, 0, -0.02, 0, 17.2, 0.12, 9.7, COLORS.deck);
    for (let x = -8; x <= 8; x += 2) this.box(base, x, 0.05, 0, 0.025, 0.015, 9.6, '#405356');
    for (let z = -4; z <= 4; z += 2) this.box(base, 0, 0.05, z, 17.1, 0.015, 0.025, '#405356');
    for (const z of [-4.9, 4.9]) {
      this.box(base, 0, 0.12, z, 17.4, 0.18, 0.15, COLORS.steel);
      for (let x = -7; x <= 7; x += 2)
        this.box(base, x, 0.23, z, 0.6, 0.08, 0.19, COLORS.gold, true);
    }
    // Solar wings, structural feet, and cables give the station its silhouette.
    for (const x of [-10.2, 10.2]) {
      this.box(base, x, -0.2, -1, 2.8, 0.12, 7, '#244a62');
      for (let z = -4; z <= 2; z += 0.7) this.box(base, x, -0.11, z, 2.6, 0.03, 0.035, '#6d9faf');
      this.box(base, x, -0.1, -1, 0.04, 0.03, 7, '#8eaab1');
      this.box(base, Math.sign(x) * 8.9, -0.3, -1, 1.8, 0.2, 0.3, COLORS.steel);
    }
    for (const [id, [x, z]] of Object.entries(POSITIONS) as [Selection, [number, number]][]) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.userData.selection = id;
      this.scene.add(group);
      this.objects.set(id, group);
      this.box(group, 0, 0.15, 0, 2.65, 0.2, 2.35, '#3c5356');
      const marker = this.box(group, 0, 0.27, 1.1, 1.7, 0.035, 0.12, COLORS.mint, true);
      this.markers.set(id, marker);
      if (id === 'drone') {
        this.box(group, -0.65, 0.85, -0.55, 1, 1.2, 0.8, COLORS.cream);
        this.box(group, -0.65, 1.51, -0.55, 1.1, 0.12, 0.9, COLORS.gold);
        this.box(group, 0.6, 0.7, -0.4, 0.8, 0.9, 0.75, COLORS.steel);
        this.box(group, 0.6, 1.2, -0.4, 0.9, 0.1, 0.85, COLORS.orange);
      } else if (id === 'sorter') {
        this.box(group, 0, 0.9, -0.1, 1.8, 1.25, 1.4, COLORS.cream);
        this.box(group, 0, 0.95, 0.63, 1.3, 0.55, 0.06, COLORS.dark);
        this.box(group, 0, 1.58, -0.1, 1.95, 0.13, 1.5, COLORS.gold);
      } else if (id === 'furnace') {
        const shell = new THREE.Mesh(
          new THREE.CylinderGeometry(0.85, 1, 1.5, 10),
          this.material(COLORS.steel),
        );
        shell.position.y = 1;
        group.add(shell);
        this.box(group, 0, 0.9, 0.78, 1, 0.6, 0.12, '#f29655', true);
        this.box(group, 0, 1.9, -0.3, 0.6, 0.8, 0.55, COLORS.dark);
        this.box(group, 0, 2.3, -0.3, 0.9, 0.1, 0.7, COLORS.gold);
      } else if (id === 'electronics') {
        this.box(group, 0, 0.9, 0, 1.8, 1.3, 1.5, COLORS.mint);
        this.box(group, 0, 1.1, 0.78, 1.35, 0.6, 0.06, COLORS.dark);
        for (let x = -0.45; x <= 0.46; x += 0.3)
          this.box(group, x, 1.1, 0.83, 0.09, 0.35, 0.03, '#a4edd1', true);
        this.box(group, 0, 1.68, 0, 2, 0.15, 1.7, COLORS.cream);
      } else if (id === 'storage') {
        for (let n = 0; n < 5; n++)
          this.box(
            group,
            (n % 2) * 0.85 - 0.4,
            0.55 + Math.floor(n / 2) * 0.55,
            0,
            0.75,
            0.5,
            1.25,
            n % 2 ? COLORS.cream : COLORS.gold,
          );
      } else if (id === 'market') {
        this.box(group, 0, 0.5, 0, 1.9, 0.5, 1.6, COLORS.steel);
        this.box(group, -0.6, 1.15, -0.4, 0.2, 1.5, 0.2, COLORS.gold);
        this.box(group, 0, 1.6, -0.4, 1.3, 0.7, 0.18, COLORS.dark);
        this.box(group, 0, 1.6, -0.29, 1.05, 0.45, 0.04, COLORS.mint, true);
      } else if (id === 'bay') {
        for (const dx of [-1, 1]) this.box(group, dx, 1.15, -0.5, 0.18, 1.8, 0.18, COLORS.gold);
        this.box(group, 0, 2, -0.5, 2.2, 0.2, 0.25, COLORS.gold);
        this.box(group, 0, 0.7, 0, 1.6, 0.3, 1.25, COLORS.cream);
        this.box(group, 0.45, 1.5, -0.5, 0.1, 0.7, 0.1, COLORS.dark);
      } else {
        this.box(group, 0, 0.42, 0, 2.4, 0.35, 2, COLORS.steel);
        this.box(group, -1.1, 1.25, -0.6, 0.2, 2, 0.25, COLORS.gold);
        this.box(group, 0.2, 2.25, -0.6, 2.8, 0.22, 0.3, COLORS.gold);
      }
      const extras = new THREE.Group();
      group.add(extras);
      this.stacks.push(extras);
      for (let i = 0; i < 3; i++)
        this.box(extras, -0.9 + i * 0.7, 0.45, -0.9, 0.5, 0.4, 0.4, COLORS.mint);
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.userData.selection = id;
          this.picking.push(object);
        }
      });
    }
    for (let x = -5; x < 6; x += 0.3) this.box(base, x, 0.45, -1.25, 0.2, 0.14, 0.62, '#4c6262');
    for (let x = -5; x < 6; x += 1.1) {
      const crate = this.box(base, x, 0.64, -1.25, 0.35, 0.3, 0.36, COLORS.gold);
      this.beltCargo.push(crate);
    }
    for (let i = 0; i < 4; i++) {
      const drone = new THREE.Group();
      this.scene.add(drone);
      this.box(drone, 0, 0, 0, 0.55, 0.35, 0.55, COLORS.cream);
      this.box(drone, 0, 0.02, 0.28, 0.32, 0.12, 0.04, COLORS.mint, true);
      for (const x of [-0.42, 0.42]) {
        this.box(drone, x, -0.08, 0, 0.18, 0.18, 0.4, COLORS.dark);
        this.box(drone, x, -0.2, 0, 0.1, 0.1, 0.2, '#86cbe8', true);
      }
      this.drones.push(drone);
      const scrap = this.box(drone, 0, -0.38, 0, 0.35, 0.25, 0.35, COLORS.orange);
      this.cargo.push(scrap);
    }
    this.box(this.ship, 0, 0, 0, 1.3, 0.55, 3.6, COLORS.cream);
    this.box(this.ship, 0, 0.4, 0.25, 0.8, 0.4, 1.5, COLORS.steel);
    this.box(this.ship, 0, 0.44, 1.1, 0.65, 0.3, 0.1, COLORS.mint, true);
    for (const x of [-0.95, 0.95]) this.box(this.ship, x, -0.12, -0.5, 0.7, 0.2, 1.7, COLORS.gold);
    this.scene.add(this.ship);
    for (let i = 0; i < DISCOVERIES.length; i++) {
      const exhibit = new THREE.Group();
      exhibit.position.set(-7.3 + i * 1.25, 0.1, 4.15);
      this.box(exhibit, 0, 0.13, 0, 0.65, 0.22, 0.55, COLORS.dark);
      this.box(exhibit, 0, 0.26, 0, 0.6, 0.04, 0.5, DISCOVERIES[i].color, true);
      const geometry =
        DISCOVERIES[i].shape === 'artifact'
          ? new THREE.OctahedronGeometry(0.23)
          : DISCOVERIES[i].shape === 'probe'
            ? new THREE.SphereGeometry(0.2, 8, 6)
            : new THREE.BoxGeometry(0.35, 0.25, 0.25);
      const miniature = new THREE.Mesh(geometry, this.material(DISCOVERIES[i].color));
      miniature.position.y = 0.52;
      exhibit.add(miniature);
      if (DISCOVERIES[i].shape === 'satellite')
        this.box(exhibit, 0, 0.5, 0, 0.7, 0.035, 0.2, '#6898b2');
      this.scene.add(exhibit);
      this.exhibits.push(exhibit);
    }
    const stars = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      stars[i * 3] = Math.sin(i * 13.7) * 48;
      stars[i * 3 + 1] = -6 - (i % 8);
      stars[i * 3 + 2] = Math.cos(i * 8.3) * 45;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    this.scene.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color: '#99babf', size: 0.055, sizeAttenuation: true }),
      ),
    );
    this.host.addEventListener('pointerup', this.pick);
    this.resize();
  }
  private material(color: string, glow = false) {
    const key = color + glow;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.76,
        metalness: 0.2,
        emissive: glow ? color : '#000000',
        emissiveIntensity: glow ? 0.5 : 0,
      });
      this.materials.set(key, m);
    }
    return m;
  }
  private box(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    glow = false,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.material(color, glow));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  private pick = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = this.ray
      .intersectObjects(this.picking)
      .find((h) => h.object.visible && h.object.parent?.visible);
    if (hit) this.onSelect(hit.object.userData.selection as Selection);
  };
  select(selection: Selection | null) {
    this.focus = selection;
    this.desired.set(
      selection ? POSITIONS[selection][0] : 0,
      0,
      selection ? POSITIONS[selection][1] : 0,
    );
  }
  resize() {
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.low ? 1 : 1.5));
    this.renderer.setSize(width, height);
    const aspect = width / Math.max(1, height);
    const span = aspect < 1 ? 14 : 11;
    this.camera.left = -span * aspect;
    this.camera.right = span * aspect;
    this.camera.top = span;
    this.camera.bottom = -span;
    this.camera.updateProjectionMatrix();
  }
  draw(game: OrbitalGame, dt: number) {
    this.elapsed += this.reduced ? 0 : dt;
    this.exhibits.forEach((exhibit, i) => (exhibit.visible = game.state.displayed[i]));
    const sig = JSON.stringify([game.e.levels, game.state.bay, game.state.dock]);
    if (sig !== this.signature) {
      this.signature = sig;
      let i = 0;
      for (const [id, object] of this.objects) {
        const level =
          id in game.e.levels
            ? game.e.levels[id as Machine]
            : id === 'bay'
              ? Number(game.state.bay) * 5
              : id === 'dock'
                ? Number(game.state.dock) * 8
                : 2;
        object.scale.y = 1 + Math.floor(level / 3) * 0.06;
        this.stacks[i].children.forEach((o, n) => (o.visible = level >= (n + 1) * 3));
        if (id === 'electronics' || id === 'bay' || id === 'dock')
          object.position.y = (
            id === 'electronics' ? level > 0 : id === 'bay' ? game.state.bay : game.state.dock
          )
            ? 0
            : -0.45;
        i++;
      }
    }
    for (const [id, marker] of this.markers)
      marker.material = this.material(id === this.focus ? '#fff0b4' : '#91c9b3', true);
    const t = this.elapsed;
    this.drones.forEach((drone, i) => {
      drone.visible = i < Math.min(this.low ? 2 : 4, 1 + Math.floor(game.e.levels.drone / 3));
      const phase = ((t * 0.07 + i * 0.23) % 1) * Math.PI * 2;
      drone.position.set(
        -6 + Math.sin(phase) * 3,
        2.5 + Math.sin(phase * 2) * 0.3,
        -3 + Math.cos(phase) * 3,
      );
      drone.rotation.y = phase;
      this.cargo[i].visible = Math.sin(phase) > 0;
    });
    this.beltCargo.forEach((crate, i) => {
      crate.visible = !this.low || i % 2 === 0;
      crate.position.x = -5 + ((i * 1.1 + t * 0.6) % 11);
    });
    this.ship.visible = game.state.dock;
    this.ship.position.set(
      6,
      1.2 + Math.sin(t * 0.25) * 0.08,
      2.8 + (this.reduced ? 0 : Math.max(0, Math.sin(t * 0.035)) * 7),
    );
    this.target.lerp(this.desired, this.reduced ? 1 : Math.min(1, dt * 4));
    this.camera.position.set(this.target.x + 16, 18, this.target.z + 23);
    this.camera.lookAt(this.target);
    const targetZoom = this.focus ? 1.5 : 1;
    this.camera.zoom += (targetZoom - this.camera.zoom) * (this.reduced ? 1 : Math.min(1, dt * 4));
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.host.removeEventListener('pointerup', this.pick);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
    });
    this.materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
