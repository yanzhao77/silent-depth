/**
 * SILENT DEPTH V2.1 — Post Processing
 *
 * Lightweight cinematic post-processing:
 * - Vignette (darkened edges)
 * - Color grading (cold blue tint for naval atmosphere)
 * - Subtle bloom on bright areas
 * - Depth-based underwater tint
 *
 * Uses a full-screen quad with custom shader.
 * No external dependencies — pure Three.js.
 */

import * as THREE from 'three';

const POST_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uVignetteStrength;
uniform vec3 uColorTint;
uniform float uBloomStrength;
uniform float uUnderwaterAmount;
uniform vec3 uUnderwaterTint;
uniform vec2 uResolution;
uniform float uTime;

varying vec2 vUv;

float sdLuminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  vec3 c = color.rgb;

  // Color grading
  c *= uColorTint;

  // Simple bloom (threshold + bright boost)
  float lum = sdLuminance(c);
  float bloomMask = smoothstep(0.6, 1.2, lum);
  c += c * bloomMask * uBloomStrength;

  // Underwater absorption, suspended-particle turbidity and shallow shafts.
  // This stays screen-space and deterministic so it cannot affect detection.
  if (uUnderwaterAmount > 0.01) {
    vec2 texel = 1.0 / uResolution;
    vec3 offsetA = texture2D(tDiffuse, vUv + vec2(texel.x * 1.5, 0.0)).rgb;
    vec3 offsetB = texture2D(tDiffuse, vUv - vec2(texel.x * 1.5, 0.0)).rgb;
    float turbidity = smoothstep(0.12, 0.88, uUnderwaterAmount) * 0.26;
    vec3 scattered = (c + offsetA + offsetB) / 3.0;
    vec3 absorbed = mix(c, c * uUnderwaterTint, uUnderwaterAmount * 0.86);
    absorbed = mix(absorbed, scattered * uUnderwaterTint, turbidity);
    float shallow = 1.0 - smoothstep(0.18, 0.78, uUnderwaterAmount);
    float shaftBand = pow(max(0.0, sin(vUv.x * 19.0 + uTime * 0.12) * 0.5 + 0.5), 10.0);
    float shaftFade = smoothstep(0.80, 0.04, vUv.y) * shallow * 0.028;
    absorbed += vec3(0.035, 0.090, 0.110) * shaftBand * shaftFade;
    c = absorbed;
  }

  // Vignette
  vec2 center = vUv - 0.5;
  float dist = length(center);
  float vignette = 1.0 - dist * dist * uVignetteStrength * 2.0;
  vignette = smoothstep(0.0, 0.7, clamp(vignette, 0.0, 1.0));
  c *= vignette;

  // Film grain
  float grain = (fract(sin(dot(vUv * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012;
  c += grain;

  gl_FragColor = vec4(c, color.a);
}
`;

export class PostProcessing {
  private _renderer: THREE.WebGLRenderer;
  private _scene: THREE.Scene;
  private _camera: THREE.OrthographicCamera;
  private _quad: THREE.Mesh;
  private _material: THREE.ShaderMaterial;
  private _renderTarget: THREE.WebGLRenderTarget;
  private _enabled = true;

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number) {
    this._renderer = renderer;
    this._scene = new THREE.Scene();
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this._material = new THREE.ShaderMaterial({
      vertexShader: POST_VERTEX,
      fragmentShader: POST_FRAGMENT,
      uniforms: {
        tDiffuse: { value: null },
        uVignetteStrength: { value: 1.2 },
        uColorTint: { value: new THREE.Vector3(1.0, 1.0, 1.02) },
        uBloomStrength: { value: 0.15 },
        uUnderwaterAmount: { value: 0 },
        uUnderwaterTint: { value: new THREE.Vector3(0.3, 0.6, 0.8) },
        uResolution: { value: new THREE.Vector2(width, height) },
        uTime: { value: 0 },
      },
    });

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    this._quad = new THREE.Mesh(quadGeo, this._material);
    this._scene.add(this._quad);

    this._renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
  }

  get enabled(): boolean { return this._enabled; }
  set enabled(v: boolean) { this._enabled = v; }

  resize(width: number, height: number): void {
    this._renderTarget.setSize(width, height);
    this._material.uniforms['uResolution']!.value.set(width, height);
  }

  /**
   * Render scene through post-processing pipeline.
   * @param renderScene - the scene to render
   * @param camera - active camera
   * @param wallTime - time for animations
   * @param depthFraction - 0 = surface, 1 = deep underwater
   */
  render(
    renderScene: THREE.Scene,
    camera: THREE.Camera,
    wallTime: number,
    depthFraction: number,
  ): void {
    if (!this._enabled) {
      this._renderer.render(renderScene, camera);
      return;
    }

    // Render scene to off-screen target
    this._renderer.setRenderTarget(this._renderTarget);
    this._renderer.render(renderScene, camera);
    this._renderer.setRenderTarget(null);

    // Apply post-processing quad
    const u = this._material.uniforms;
    u['tDiffuse']!.value = this._renderTarget.texture;
    u['uTime']!.value = wallTime;
    u['uUnderwaterAmount']!.value = depthFraction;
    // Red absorbs first; deeper water remains blue-green but retains enough
    // local contrast for the player hull and known contacts to read.
    u['uUnderwaterTint']!.value.set(
      0.52 - depthFraction * 0.29,
      0.76 - depthFraction * 0.18,
      0.88 - depthFraction * 0.08,
    );
    u['uVignetteStrength']!.value = 1.08 + depthFraction * 0.38;

    this._renderer.render(this._scene, this._camera);
  }

  dispose(): void {
    this._renderTarget.dispose();
    this._material.dispose();
    this._quad.geometry.dispose();
  }
}
