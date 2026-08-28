/**
 * SILENT DEPTH V2.4 — Ocean Renderer
 *
 * GPU procedural ocean with a presentation-only wake field. Wave, wind, fog,
 * night and storm values are read from the render contract; no simulation
 * values are changed or inferred here. The wake field is supplied by the
 * WakeSystem, which derives bow waves, stern foam, turbulent wakes and Kelvin
 * V-wakes purely from RenderState position / heading / speed.
 *
 * Four spatial layers are represented:
 *   Near   — high-frequency ripple, strongest close to the camera.
 *   Mid    — the default mixed swell.
 *   Far    — low-frequency broad swell that grows with camera distance.
 *   Horizon— a separate low-detail distant plane blended into the fog colour.
 */

import * as THREE from 'three';
import type { RenderWeather } from '../types';
import { MAX_WAKES, type WakeSource } from './wake/WakeSystem';

const OCEAN_VERTEX = /* glsl */ `
#define MAX_WAKES ${MAX_WAKES}
uniform float uTime;
uniform float uWaveHeight;
uniform float uWindSpeed;
uniform float uStorm;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vFoam;
varying float vCrest;
varying float vTrough;
varying float vCamDist;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 wave(vec2 position, float amplitude, float wavelength, vec2 direction, float speed, float time) {
  float k = 6.2831853 / wavelength;
  vec2 d = normalize(direction);
  float phase = k * dot(d, position) - speed * time;
  return vec3(d.x * amplitude * 0.22 * cos(phase), amplitude * sin(phase), d.y * amplitude * 0.22 * cos(phase));
}

vec3 waveField(vec2 p, float time, float camDist) {
  float sea = clamp(uWaveHeight * 0.001, 0.00014, 0.0031);
  float wind = clamp(uWindSpeed / 18.0, 0.08, 1.25);

  // Distance weighting creates the Near / Mid / Far reading of the sea. Close
  // water carries sharp ripples; distant water settles into broad swell.
  float nearW = 1.0 - smoothstep(6.0, 26.0, camDist);
  float farW = smoothstep(10.0, 55.0, camDist);

  vec3 broad = wave(p, sea * (0.74 + uStorm * 0.18) * (1.0 + farW * 0.35), 0.58, vec2(1.0, 0.21), 0.030 * wind, time);
  broad += wave(p, sea * 0.47, 0.36, vec2(0.46, 0.89), 0.041 * wind, time * 1.07);
  vec3 chop = wave(p, sea * (0.24 + uStorm * 0.12), 0.155, vec2(-0.62, 0.78), 0.066 * wind, time * 1.23);
  chop += wave(p, sea * 0.14, 0.091, vec2(0.91, -0.38), 0.089 * wind, time * 0.93);

  // High-frequency near detail breaks up the close surface only.
  float micro = noise(p * 44.0 + vec2(time * 0.045, -time * 0.032)) - 0.5;
  micro += (noise(p * 83.0 - vec2(time * 0.062, time * 0.051)) - 0.5) * 0.48;
  vec3 microV = vec3(0.0, micro * sea * (0.12 + uStorm * 0.10) * (0.35 + nearW * 0.9), 0.0);

  return broad + chop + microV;
}

void main() {
  vec3 worldPre = (modelMatrix * vec4(position, 1.0)).xyz;
  float camDist = distance(worldPre.xz, cameraPosition.xz);
  vec3 pos = position;
  vec3 displacement = waveField(pos.xz, uTime, camDist);
  pos += displacement;
  float epsilon = 0.006;
  vec3 dx = waveField(position.xz + vec2(epsilon, 0.0), uTime, camDist);
  vec3 dz = waveField(position.xz + vec2(0.0, epsilon), uTime, camDist);
  vec3 tangent = normalize(vec3(epsilon, dx.y - displacement.y, 0.0));
  vec3 bitangent = normalize(vec3(0.0, dz.y - displacement.y, epsilon));
  vNormal = normalize(cross(bitangent, tangent));
  float slope = length(vec2(dx.y - displacement.y, dz.y - displacement.y)) / epsilon;
  float sea = clamp(uWaveHeight * 0.001, 0.00014, 0.0031);
  vCrest = smoothstep(sea * 0.28, sea * 1.02, max(displacement.y, 0.0));
  vTrough = clamp(-displacement.y / max(sea, 0.0001), 0.0, 1.0);
  vFoam = smoothstep(0.16, 0.46 + (1.0 - uStorm) * 0.14, slope) * smoothstep(0.14, 0.95, uWaveHeight);
  vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  vCamDist = camDist;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const OCEAN_FRAGMENT = /* glsl */ `
#define MAX_WAKES ${MAX_WAKES}
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform vec3 uSubsurfaceColor;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform vec3 uSunDirection;
uniform float uIsNight;
uniform float uStorm;
uniform float uTime;

uniform int uWakeCount;
uniform vec2 uWakePos[MAX_WAKES];
uniform float uWakeHeading[MAX_WAKES];
uniform float uWakeSpeed[MAX_WAKES];
uniform float uWakeWidth[MAX_WAKES];

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vFoam;
varying float vCrest;
varying float vTrough;
varying float vCamDist;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Mirrors WakeSystem.wakeFoamIntensity on the GPU.
float shipWake(vec2 wp) {
  float total = 0.0;
  for (int i = 0; i < MAX_WAKES; i++) {
    if (i < uWakeCount) {
      vec2 pos = uWakePos[i];
      float h = uWakeHeading[i];
      vec2 fwd = vec2(sin(h), -cos(h));
      vec2 rgt = vec2(fwd.y, -fwd.x);
      vec2 d = wp - pos;
      float along = dot(d, fwd);
      float lat = dot(d, rgt);
      float speedF = smoothstep(0.8, 9.0, uWakeSpeed[i]);
      if (speedF > 0.001) {
        float bow = smoothstep(0.0055, 0.0006, abs(along - 0.0016)) * smoothstep(0.0042, 0.0004, abs(lat));
        float behind = -along;
        float reach = 0.020 + uWakeSpeed[i] * 0.0042;
        float sternMask = smoothstep(0.0, 0.0022, behind) * (1.0 - smoothstep(reach * 0.45, reach, behind));
        float halfW = (0.0014 + behind * 0.085) * uWakeWidth[i];
        float center = 1.0 - smoothstep(halfW * 0.5, halfW, abs(lat));
        float turb = sternMask * center;
        float vHalf = 0.354 * behind;
        float vLine = (1.0 - smoothstep(0.0007, 0.0026, abs(abs(lat) - vHalf)))
          * smoothstep(0.001, 0.018, behind)
          * (1.0 - smoothstep(reach * 0.7, reach * 1.15, behind));
        float breakup = 0.78 + 0.22 * sin(behind * 150.0 - lat * 70.0 + pos.x * 9.0);
        float raw = max(max(bow, turb * breakup), vLine);
        total = max(total, min(1.0, raw * speedF));
      }
    }
  }
  return total;
}

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 normal = faceforward(normalize(vNormal), -viewDir, normalize(vNormal));
  vec3 lightDir = normalize(uSunDirection);
  float NdotL = max(dot(normal, lightDir), 0.0);
  float viewUp = clamp(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
  float fresnel = 0.025 + 0.975 * pow(1.0 - max(dot(viewDir, normal), 0.0), 5.0);

  vec3 waterColor = mix(uDeepColor, uShallowColor, viewUp * (0.28 + NdotL * 0.28));
  float ambient = mix(0.17, 0.075, uIsNight);
  vec3 diffuse = waterColor * (ambient + NdotL * mix(0.50, 0.28, uStorm));
  vec3 halfDir = normalize(lightDir + viewDir);
  float specular = pow(max(dot(normal, halfDir), 0.0), mix(112.0, 28.0, uStorm));
  specular *= mix(0.46, 0.14, uIsNight) * mix(1.0, 0.56, uStorm);
  vec3 reflectedSky = mix(uFogColor * 0.67, vec3(0.16, 0.28, 0.38), fresnel);
  vec3 color = mix(diffuse, reflectedSky, fresnel * 0.62) + vec3(specular);

  float forwardScatter = pow(max(dot(viewDir, -lightDir), 0.0), 9.0) * (1.0 - uStorm) * 0.10;
  color += uSubsurfaceColor * forwardScatter * viewUp;

  // Storm foam bands: wind-aligned streaks driven by the broad wave direction.
  float bandCoord = dot(vWorldPosition.xz, normalize(vec2(1.0, 0.21)));
  float bands = smoothstep(0.55, 0.95, sin(bandCoord * 36.0 + uTime * 0.7) * 0.5 + 0.5)
    * smoothstep(0.0, 0.4, vCrest) * uStorm;

  float wake = shipWake(vWorldPosition.xz);
  float foam = clamp(vFoam * 0.72 + vCrest * (0.20 + uStorm * 0.30) + wake * 0.95 + bands * 0.7, 0.0, 1.0);
  color = mix(color, uFoamColor, foam * mix(0.34, 0.82, uStorm));

  // Dark troughs: storm wave valleys read darker for extra contrast.
  color *= 1.0 - vTrough * (0.18 + uStorm * 0.22);

  float distanceToCamera = length(vWorldPosition - cameraPosition);
  float fogFactor = 1.0 - exp(-uFogDensity * distanceToCamera * 16.0);
  color = mix(color, uFogColor, clamp(fogFactor, 0.0, 0.96));
  gl_FragColor = vec4(color, 1.0);
}
`;

const FAR_OCEAN_FRAGMENT = /* glsl */ `
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFogColor;
uniform vec3 uSunDirection;
uniform float uIsNight;
uniform float uStorm;
uniform float uTime;

varying vec3 vWorldPosition;
varying vec3 vNormal;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uSunDirection);
  float NdotL = max(dot(normal, lightDir), 0.0);
  vec3 waterColor = mix(uDeepColor, uShallowColor, NdotL * 0.4);
  float ambient = mix(0.14, 0.06, uIsNight);
  vec3 color = waterColor * (ambient + NdotL * mix(0.42, 0.24, uStorm));
  // Distant water dissolves into the fog colour near the horizon.
  float distanceToCamera = length(vWorldPosition - cameraPosition);
  float fogFactor = 1.0 - exp(-0.010 * distanceToCamera * 8.0);
  color = mix(color, uFogColor, clamp(fogFactor, 0.0, 0.97));
  gl_FragColor = vec4(color, 1.0);
}
`;

const FAR_OCEAN_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uWaveHeight;
uniform float uWindSpeed;
uniform float uStorm;
varying vec3 vWorldPosition;
varying vec3 vNormal;

vec3 wave(vec2 position, float amplitude, float wavelength, vec2 direction, float speed, float time) {
  float k = 6.2831853 / wavelength; vec2 d = normalize(direction);
  float phase = k * dot(d, position) - speed * time;
  return vec3(d.x * amplitude * 0.22 * cos(phase), amplitude * sin(phase), d.y * amplitude * 0.22 * cos(phase));
}

void main() {
  float sea = clamp(uWaveHeight * 0.001, 0.00014, 0.0031);
  float wind = clamp(uWindSpeed / 18.0, 0.08, 1.25);
  vec3 displacement = wave(position.xz, sea * (1.1 + uStorm * 0.4), 1.6, vec2(1.0, 0.21), 0.020 * wind, uTime);
  displacement += wave(position.xz, sea * 0.6, 0.9, vec2(0.46, 0.89), 0.028 * wind, uTime * 1.05);
  vec3 pos = position + displacement;
  float epsilon = 0.02;
  vec3 dx = wave(position.xz + vec2(epsilon, 0.0), sea * (1.1 + uStorm * 0.4), 1.6, vec2(1.0, 0.21), 0.020 * wind, uTime);
  vec3 dz = wave(position.xz + vec2(0.0, epsilon), sea * 0.6, 0.9, vec2(0.46, 0.89), 0.028 * wind, uTime * 1.05);
  vNormal = normalize(cross(normalize(vec3(epsilon, dz.y - displacement.y, 0.0)), normalize(vec3(0.0, dz.y - displacement.y, epsilon))));
  vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export class OceanRenderer {
  readonly mesh: THREE.Mesh;
  readonly farMesh: THREE.Mesh;
  private readonly _material: THREE.ShaderMaterial;
  private readonly _farMaterial: THREE.ShaderMaterial;
  private readonly _geometry: THREE.PlaneGeometry;
  private readonly _farGeometry: THREE.PlaneGeometry;
  private readonly _wakePos: THREE.Vector2[];
  private readonly _wakeHeading: number[];
  private readonly _wakeSpeed: number[];
  private readonly _wakeWidth: number[];

  constructor(segments: number = 300) {
    this._wakePos = Array.from({ length: MAX_WAKES }, () => new THREE.Vector2());
    this._wakeHeading = new Array(MAX_WAKES).fill(0);
    this._wakeSpeed = new Array(MAX_WAKES).fill(0);
    this._wakeWidth = new Array(MAX_WAKES).fill(1);

    this._geometry = new THREE.PlaneGeometry(80, 80, segments, segments);
    this._geometry.rotateX(-Math.PI / 2);
    this._material = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERTEX,
      fragmentShader: OCEAN_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uWaveHeight: { value: 0.3 },
        uWindSpeed: { value: 2 },
        uStorm: { value: 0 },
        uWakeCount: { value: 0 },
        uWakePos: { value: this._wakePos },
        uWakeHeading: { value: this._wakeHeading },
        uWakeSpeed: { value: this._wakeSpeed },
        uWakeWidth: { value: this._wakeWidth },
        uDeepColor: { value: new THREE.Color(0x020914) },
        uShallowColor: { value: new THREE.Color(0x143b50) },
        uFoamColor: { value: new THREE.Color(0xc9d7df) },
        uSubsurfaceColor: { value: new THREE.Color(0x1a5061) },
        uFogDensity: { value: 0.002 },
        uFogColor: { value: new THREE.Color(0x061522) },
        uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uIsNight: { value: 0 },
      },
      transparent: false,
      side: THREE.FrontSide,
    });
    this.mesh = new THREE.Mesh(this._geometry, this._material);
    this.mesh.name = 'procedural-ocean';
    this.mesh.receiveShadow = true;

    // Distant horizon plane — low-frequency swell that dissolves into fog.
    this._farGeometry = new THREE.PlaneGeometry(600, 600, 120, 120);
    this._farGeometry.rotateX(-Math.PI / 2);
    this._farMaterial = new THREE.ShaderMaterial({
      vertexShader: FAR_OCEAN_VERTEX,
      fragmentShader: FAR_OCEAN_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uWaveHeight: { value: 0.3 },
        uWindSpeed: { value: 2 },
        uStorm: { value: 0 },
        uDeepColor: { value: new THREE.Color(0x020914) },
        uShallowColor: { value: new THREE.Color(0x143b50) },
        uFogColor: { value: new THREE.Color(0x061522) },
        uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uIsNight: { value: 0 },
      },
      transparent: false,
      side: THREE.FrontSide,
      fog: false,
    });
    this.farMesh = new THREE.Mesh(this._farGeometry, this._farMaterial);
    this.farMesh.name = 'distant-ocean-horizon';
    this.farMesh.renderOrder = -1;
  }

  update(
    weather: RenderWeather,
    wallTime: number,
    playerX: number,
    playerZ: number,
    playerSpeedKt: number,
    playerHeadingDeg: number,
    wakes?: WakeSource[],
  ): void {
    this.mesh.position.set(playerX, 0, playerZ);
    this.farMesh.position.set(playerX, 0, playerZ);
    const uniforms = this._material.uniforms;
    uniforms['uTime']!.value = wallTime;
    uniforms['uWaveHeight']!.value = weather.waveHeight;
    uniforms['uWindSpeed']!.value = weather.windSpeed;
    uniforms['uFogDensity']!.value = weather.fogDensity;
    uniforms['uIsNight']!.value = weather.isNight ? 1 : 0;
    uniforms['uStorm']!.value = weather.kind === 'Storm' ? 1 : 0;

    if (wakes && wakes.length > 0) {
      const count = Math.min(wakes.length, MAX_WAKES);
      for (let i = 0; i < count; i++) {
        const w = wakes[i]!;
        this._wakePos[i]!.set(w.x, w.z);
        this._wakeHeading[i] = w.headingRad;
        this._wakeSpeed[i] = w.speedKt;
        this._wakeWidth[i] = w.widthScale;
      }
      uniforms['uWakeCount']!.value = count;
    } else {
      // Fallback: keep the single legacy player wake so the ocean never looks
      // dead even if the caller has not wired the WakeSystem yet.
      this._wakePos[0]!.set(playerX, playerZ);
      this._wakeHeading[0] = (playerHeadingDeg * Math.PI) / 180;
      this._wakeSpeed[0] = playerSpeedKt;
      this._wakeWidth[0] = 0.6;
      uniforms['uWakeCount']!.value = 1;
    }

    this.applyWeatherPalette(uniforms, weather);

    const far = this._farMaterial.uniforms;
    far['uTime']!.value = wallTime;
    far['uWaveHeight']!.value = weather.waveHeight;
    far['uWindSpeed']!.value = weather.windSpeed;
    far['uStorm']!.value = weather.kind === 'Storm' ? 1 : 0;
    far['uIsNight']!.value = weather.isNight ? 1 : 0;
    this.applyWeatherPalette(far, weather);
  }

  private applyWeatherPalette(
    uniforms: Record<string, THREE.IUniform>,
    weather: RenderWeather,
  ): void {
    const set = (name: string, hex: number): void => {
      const u = uniforms[name];
      if (u) (u.value as THREE.Color).setHex(hex);
    };
    if (weather.isNight) {
      set('uDeepColor', 0x01070e);
      set('uShallowColor', 0x0b2130);
      set('uFoamColor', 0x627b8a);
      set('uSubsurfaceColor', 0x0b2834);
      set('uFogColor', 0x02080e);
      if (uniforms['uSunDirection']) (uniforms['uSunDirection']!.value as THREE.Vector3).set(0.22, 0.62, 0.48).normalize();
    } else if (weather.kind === 'Storm') {
      set('uDeepColor', 0x020914);
      set('uShallowColor', 0x112c3d);
      set('uFoamColor', 0xaebdc5);
      set('uSubsurfaceColor', 0x173b4a);
      set('uFogColor', 0x112235);
      if (uniforms['uSunDirection']) (uniforms['uSunDirection']!.value as THREE.Vector3).set(0.16, 0.34, 0.42).normalize();
    } else if (weather.kind === 'Fog') {
      set('uDeepColor', 0x071420);
      set('uShallowColor', 0x2b4859);
      set('uFoamColor', 0xa7b4bd);
      set('uSubsurfaceColor', 0x2b505c);
      set('uFogColor', 0x718493);
      if (uniforms['uSunDirection']) (uniforms['uSunDirection']!.value as THREE.Vector3).set(0.42, 0.56, 0.30).normalize();
    } else if (weather.kind === 'Cloudy') {
      set('uDeepColor', 0x04111c);
      set('uShallowColor', 0x1a3a4d);
      set('uFoamColor', 0xaab9c4);
      set('uSubsurfaceColor', 0x1d4655);
      set('uFogColor', 0x102435);
      if (uniforms['uSunDirection']) (uniforms['uSunDirection']!.value as THREE.Vector3).set(0.38, 0.55, 0.28).normalize();
    } else {
      set('uDeepColor', 0x03111e);
      set('uShallowColor', 0x1a4e68);
      set('uFoamColor', 0xd4e2e7);
      set('uSubsurfaceColor', 0x2e7887);
      set('uFogColor', 0x0c2638);
      if (uniforms['uSunDirection']) (uniforms['uSunDirection']!.value as THREE.Vector3).set(0.46, 0.76, 0.34).normalize();
    }
  }

  dispose(): void {
    this._geometry.dispose();
    this._material.dispose();
    this._farGeometry.dispose();
    this._farMaterial.dispose();
  }
}
