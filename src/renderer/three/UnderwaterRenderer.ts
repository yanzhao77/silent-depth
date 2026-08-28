/**
 * SILENT DEPTH V2.6 — Underwater Renderer
 *
 * Presentation-only underwater atmosphere: suspended "marine snow" particles
 * that follow the camera (no world-space allocation) and a caustic light plane
 * on the underside of the surface, visible only in shallow water. All colours
 * and intensities come from the pure `UnderwaterVisual` derived in weather.ts,
 * so nothing here changes gameplay or sonar truth.
 */

import * as THREE from 'three';
import type { UnderwaterVisual } from '../weather';
import { createVisualRng } from '../visualRng';

const MAX_PARTICLES = 64;
const PARTICLE_FIELD_HALF = 0.25; // km cube around the camera

const PARTICLE_VERTEX = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uSize;
varying float vAlpha;
void main() {
  vec3 p = position;
  // Slow vertical drift + horizontal sway so the snow feels alive.
  p.y += sin(uTime * 0.15 + aSeed * 6.28) * 0.01;
  p.x += sin(uTime * 0.10 + aSeed * 3.14) * 0.008;
  p.z += cos(uTime * 0.12 + aSeed * 4.20) * 0.008;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (200.0 / max(0.05, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
  vAlpha = 0.30 + 0.35 * fract(aSeed * 7.13);
}
`;

const PARTICLE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float soft = smoothstep(0.25, 0.0, r);
  gl_FragColor = vec4(uColor, soft * vAlpha * uOpacity);
}
`;

const CAUSTIC_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CAUSTIC_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uCaustics;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 9.0;
  float c = sin(p.x * 3.0 + uTime) * sin(p.y * 3.0 - uTime * 0.7);
  c += sin(p.x * 5.0 - uTime * 1.3) * sin(p.y * 4.0 + uTime);
  c = pow(max(c * 0.25 + 0.5, 0.0), 3.0);
  gl_FragColor = vec4(uColor * c * uCaustics, c * uCaustics);
}
`;

export class UnderwaterRenderer {
  private readonly _scene: THREE.Scene;
  private readonly _particles: THREE.Points;
  private readonly _particleMaterial: THREE.ShaderMaterial;
  private readonly _particleGeometry: THREE.BufferGeometry;
  private readonly _caustic: THREE.Mesh;
  private readonly _causticMaterial: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    const rng = createVisualRng(0x1e2c3d4);
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const seeds = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      positions[i * 3] = (rng.next() * 2 - 1) * PARTICLE_FIELD_HALF;
      positions[i * 3 + 1] = (rng.next() * 2 - 1) * PARTICLE_FIELD_HALF;
      positions[i * 3 + 2] = (rng.next() * 2 - 1) * PARTICLE_FIELD_HALF;
      seeds[i] = rng.next();
    }
    this._particleGeometry = new THREE.BufferGeometry();
    this._particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._particleGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this._particleGeometry.setDrawRange(0, 0);
    this._particleMaterial = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 1.4 },
        uColor: { value: new THREE.Color(0x9fc4d6) },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this._particles = new THREE.Points(this._particleGeometry, this._particleMaterial);
    this._particles.name = 'underwater-particles';
    this._particles.visible = false;
    this._particles.frustumCulled = false;
    scene.add(this._particles);

    this._causticMaterial = new THREE.ShaderMaterial({
      vertexShader: CAUSTIC_VERTEX,
      fragmentShader: CAUSTIC_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uCaustics: { value: 0 },
        uColor: { value: new THREE.Color(0x2e7887) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const plane = new THREE.PlaneGeometry(1.6, 1.6, 1, 1);
    plane.rotateX(Math.PI / 2); // horizontal, facing down toward the diver
    this._caustic = new THREE.Mesh(plane, this._causticMaterial);
    this._caustic.name = 'underwater-caustic';
    this._caustic.visible = false;
    this._caustic.frustumCulled = false;
    scene.add(this._caustic);
  }

  update(
    underwater: UnderwaterVisual | null,
    cameraPos: THREE.Vector3,
    wallTime: number,
  ): void {
    if (!underwater) {
      this._particles.visible = false;
      this._caustic.visible = false;
      return;
    }

    // Particles follow the camera within a bounded cube; only the resolved
    // count (quality × depth factor) is drawn, so deep water stays sparse.
    this._particles.visible = underwater.particleCount > 0;
    if (this._particles.visible) {
      this._particles.position.copy(cameraPos);
      this._particleGeometry.setDrawRange(0, underwater.particleCount);
      this._particleMaterial.uniforms['uTime']!.value = wallTime;
      this._particleMaterial.uniforms['uColor']!.value.setHex(underwater.fogColor);
      this._particleMaterial.uniforms['uOpacity']!.value = 0.5 + 0.5 * underwater.particleFactor;
    }

    // Caustic plane sits on the underside of the surface, above the diver.
    const hasCaustics = underwater.causticsIntensity > 0.001;
    this._caustic.visible = hasCaustics;
    if (hasCaustics) {
      this._caustic.position.set(cameraPos.x, 0, cameraPos.z);
      this._causticMaterial.uniforms['uTime']!.value = wallTime;
      this._causticMaterial.uniforms['uCaustics']!.value = underwater.causticsIntensity;
      this._causticMaterial.uniforms['uColor']!.value.setHex(underwater.waterTint);
    }
  }

  dispose(): void {
    this._scene.remove(this._particles);
    this._scene.remove(this._caustic);
    this._particleGeometry.dispose();
    this._particleMaterial.dispose();
    this._caustic.geometry.dispose();
    this._causticMaterial.dispose();
  }
}
