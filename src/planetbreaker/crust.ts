import * as THREE from 'three';
import { CRUST_FIELD, CRUST_INNER, FIELD_WIDTH, FIELD_HEIGHT, RADIUS } from './targeting';

// Radial walls close each removable crust tile. The same byte values control
// these walls, the outer surface shader, and projectile collision tests.
export function crustWalls(uniforms: Record<string, THREE.IUniform>) {
  const positions: number[] = [],
    aValues: number[] = [],
    bValues: number[] = [],
    depths: number[] = [];
  const point = (u: number, v: number, r: number) => [
    -Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI) * r,
    Math.cos(v * Math.PI) * r,
    Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI) * r,
  ];
  function edge(u1: number, v1: number, u2: number, v2: number, a: number, b: number) {
    if (a === b) return;
    const quad = [
      point(u1, v1, RADIUS),
      point(u2, v2, RADIUS),
      point(u2, v2, CRUST_INNER),
      point(u1, v1, CRUST_INNER),
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(...quad[i]);
      aValues.push(a / 255);
      bValues.push(b / 255);
      depths.push(i < 2 ? 0 : 1);
    }
  }
  for (let y = 0; y < FIELD_HEIGHT; y++)
    for (let x = 0; x < FIELD_WIDTH; x++) {
      const a = CRUST_FIELD[y * FIELD_WIDTH + x],
        u = x / FIELD_WIDTH,
        v = y / FIELD_HEIGHT;
      edge(
        u + 1 / FIELD_WIDTH,
        v,
        u + 1 / FIELD_WIDTH,
        v + 1 / FIELD_HEIGHT,
        a,
        CRUST_FIELD[y * FIELD_WIDTH + ((x + 1) % FIELD_WIDTH)],
      );
      if (y < FIELD_HEIGHT - 1)
        edge(
          u,
          v + 1 / FIELD_HEIGHT,
          u + 1 / FIELD_WIDTH,
          v + 1 / FIELD_HEIGHT,
          a,
          CRUST_FIELD[(y + 1) * FIELD_WIDTH + x],
        );
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('fieldA', new THREE.Float32BufferAttribute(aValues, 1));
  geometry.setAttribute('fieldB', new THREE.Float32BufferAttribute(bValues, 1));
  geometry.setAttribute('depth', new THREE.Float32BufferAttribute(depths, 1));
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.DoubleSide,
      vertexShader: `attribute float fieldA;attribute float fieldB;attribute float depth;varying float vA;varying float vB;varying float vDepth;varying vec3 vN;uniform float breakup;void main(){vA=fieldA;vB=fieldB;vDepth=depth;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position*(1.+breakup*.6),1.);}`,
      fragmentShader: `varying float vA;varying float vB;varying float vDepth;varying vec3 vN;uniform float damage;uniform float breakup;void main(){float h=smoothstep(.3,.95,damage)*.75;if((vA>=h)==(vB>=h)||breakup>.02)discard;float light=.15+abs(dot(normalize(vN),normalize(vec3(-3,4,5))))*.45;vec3 c=mix(vec3(.12,.055,.025)*light,vec3(.6,.045,.006),vDepth*.8);gl_FragColor=vec4(c,1.);}`,
    }),
  );
}
