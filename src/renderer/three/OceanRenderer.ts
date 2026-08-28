/**
 * SILENT DEPTH V2.2 — Ocean Renderer
 *
 * GPU-only procedural ocean. Wave, wind, fog and night values are read from the
 * render contract; no simulation values are changed or inferred here.
 */

import * as THREE from 'three';
import type { RenderWeather } from '../types';

const OCEAN_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uWaveHeight;
uniform float uWindSpeed;
uniform float uStorm;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vFoam;
varying float vCrest;

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
  // Horizontal motion stays restrained, stopping storm swells from looking like
  // sliding walls while retaining a coherent wind direction.
  return vec3(d.x * amplitude * 0.22 * cos(phase), amplitude * sin(phase), d.y * amplitude * 0.22 * cos(phase));
}

vec3 waveField(vec2 p, float time) {
  float sea = clamp(uWaveHeight * 0.001, 0.00014, 0.0031);
  float wind = clamp(uWindSpeed / 18.0, 0.08, 1.25);
  vec3 broad = wave(p, sea * (0.74 + uStorm * 0.18), 0.58, vec2(1.0, 0.21), 0.030 * wind, time);
  broad += wave(p, sea * 0.47, 0.36, vec2(0.46, 0.89), 0.041 * wind, time * 1.07);
  vec3 chop = wave(p, sea * (0.24 + uStorm * 0.12), 0.155, vec2(-0.62, 0.78), 0.066 * wind, time * 1.23);
  chop += wave(p, sea * 0.14, 0.091, vec2(0.91, -0.38), 0.089 * wind, time * 0.93);
  // Low-amplitude irregularity breaks periodic sine bands without noisy spikes.
  float micro = noise(p * 44.0 + vec2(time * 0.045, -time * 0.032)) - 0.5;
  micro += (noise(p * 83.0 - vec2(time * 0.062, time * 0.051)) - 0.5) * 0.48;
  return broad + chop + vec3(0.0, micro * sea * (0.12 + uStorm * 0.10), 0.0);
}

void main() {
  vec3 pos = position;
  vec3 displacement = waveField(pos.xz, uTime);
  pos += displacement;
  float epsilon = 0.006;
  vec3 dx = waveField(position.xz + vec2(epsilon, 0.0), uTime);
  vec3 dz = waveField(position.xz + vec2(0.0, epsilon), uTime);
  vec3 tangent = normalize(vec3(epsilon, dx.y - displacement.y, 0.0));
  vec3 bitangent = normalize(vec3(0.0, dz.y - displacement.y, epsilon));
  vNormal = normalize(cross(bitangent, tangent));
  float slope = length(vec2(dx.y - displacement.y, dz.y - displacement.y)) / epsilon;
  float sea = clamp(uWaveHeight * 0.001, 0.00014, 0.0031);
  vCrest = smoothstep(sea * 0.28, sea * 1.02, max(displacement.y, 0.0));
  vFoam = smoothstep(0.16, 0.46 + (1.0 - uStorm) * 0.14, slope) * smoothstep(0.14, 0.95, uWaveHeight);
  vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const OCEAN_FRAGMENT = /* glsl */ `
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform vec3 uSubsurfaceColor;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform vec3 uSunDirection;
uniform float uIsNight;
uniform float uStorm;
uniform vec2 uWakePosition;
uniform float uWakeSpeed;
uniform float uWakeHeading;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vFoam;
varying float vCrest;

float playerWake(vec2 worldXZ) {
  vec2 delta = worldXZ - uWakePosition;
  vec2 direction = vec2(sin(uWakeHeading), cos(uWakeHeading));
  float aftDistance = -dot(delta, direction);
  float lateralDistance = abs(dot(delta, vec2(-direction.y, direction.x)));
  float speedFactor = smoothstep(1.2, 8.5, uWakeSpeed);
  float stern = smoothstep(0.0015, 0.0001, abs(aftDistance + 0.002));
  float aftMask = smoothstep(-0.0008, 0.003, aftDistance) * (1.0 - smoothstep(0.012, 0.040, aftDistance));
  float widening = 0.0018 + aftDistance * 0.18;
  float chevron = 1.0 - smoothstep(widening * 0.52, widening, lateralDistance);
  return max(stern, aftMask * chevron) * speedFactor;
}

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 normal = faceforward(normalize(vNormal), -viewDir, normalize(vNormal));
  vec3 lightDir = normalize(uSunDirection);
  float NdotL = max(dot(normal, lightDir), 0.0);
  float viewUp = clamp(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
  float fresnel = 0.025 + 0.975 * pow(1.0 - max(dot(viewDir, normal), 0.0), 5.0);

  // At a grazing angle the sky dominates reflection; looking down reveals the
  // cold water volume. Storms broaden and dim the highlight, not its hue.
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
  float wake = playerWake(vWorldPosition.xz);
  float foam = clamp(vFoam * 0.72 + vCrest * (0.20 + uStorm * 0.30) + wake * 0.92, 0.0, 1.0);
  color = mix(color, uFoamColor, foam * mix(0.34, 0.78, uStorm));

  float distanceToCamera = length(vWorldPosition - cameraPosition);
  float fogFactor = 1.0 - exp(-uFogDensity * distanceToCamera * 16.0);
  color = mix(color, uFogColor, clamp(fogFactor, 0.0, 0.96));
  gl_FragColor = vec4(color, 1.0);
}
`;

export class OceanRenderer {
  readonly mesh: THREE.Mesh;
  private readonly _material: THREE.ShaderMaterial;
  private readonly _geometry: THREE.PlaneGeometry;

  constructor(segments: number = 300) {
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
        uWakePosition: { value: new THREE.Vector2() },
        uWakeSpeed: { value: 0 },
        uWakeHeading: { value: 0 },
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
  }

  update(
    weather: RenderWeather,
    wallTime: number,
    playerX: number,
    playerZ: number,
    playerSpeedKt: number,
    playerHeadingDeg: number,
  ): void {
    this.mesh.position.set(playerX, 0, playerZ);
    const uniforms = this._material.uniforms;
    uniforms['uTime']!.value = wallTime;
    uniforms['uWaveHeight']!.value = weather.waveHeight;
    uniforms['uWindSpeed']!.value = weather.windSpeed;
    uniforms['uFogDensity']!.value = weather.fogDensity;
    uniforms['uIsNight']!.value = weather.isNight ? 1 : 0;
    uniforms['uStorm']!.value = weather.kind === 'Storm' ? 1 : 0;
    uniforms['uWakePosition']!.value.set(playerX, playerZ);
    uniforms['uWakeSpeed']!.value = playerSpeedKt;
    uniforms['uWakeHeading']!.value = THREE.MathUtils.degToRad(playerHeadingDeg);

    if (weather.isNight) {
      uniforms['uDeepColor']!.value.setHex(0x01070e);
      uniforms['uShallowColor']!.value.setHex(0x0b2130);
      uniforms['uFoamColor']!.value.setHex(0x627b8a);
      uniforms['uSubsurfaceColor']!.value.setHex(0x0b2834);
      uniforms['uFogColor']!.value.setHex(0x02080e);
      uniforms['uSunDirection']!.value.set(0.22, 0.62, 0.48).normalize();
    } else if (weather.kind === 'Storm') {
      uniforms['uDeepColor']!.value.setHex(0x020914);
      uniforms['uShallowColor']!.value.setHex(0x112c3d);
      uniforms['uFoamColor']!.value.setHex(0xaebdc5);
      uniforms['uSubsurfaceColor']!.value.setHex(0x173b4a);
      uniforms['uFogColor']!.value.setHex(0x112235);
      uniforms['uSunDirection']!.value.set(0.16, 0.34, 0.42).normalize();
    } else if (weather.kind === 'Fog') {
      uniforms['uDeepColor']!.value.setHex(0x071420);
      uniforms['uShallowColor']!.value.setHex(0x2b4859);
      uniforms['uFoamColor']!.value.setHex(0xa7b4bd);
      uniforms['uSubsurfaceColor']!.value.setHex(0x2b505c);
      uniforms['uFogColor']!.value.setHex(0x718493);
      uniforms['uSunDirection']!.value.set(0.42, 0.56, 0.30).normalize();
    } else if (weather.kind === 'Cloudy') {
      uniforms['uDeepColor']!.value.setHex(0x04111c);
      uniforms['uShallowColor']!.value.setHex(0x1a3a4d);
      uniforms['uFoamColor']!.value.setHex(0xaab9c4);
      uniforms['uSubsurfaceColor']!.value.setHex(0x1d4655);
      uniforms['uFogColor']!.value.setHex(0x102435);
      uniforms['uSunDirection']!.value.set(0.38, 0.55, 0.28).normalize();
    } else {
      uniforms['uDeepColor']!.value.setHex(0x03111e);
      uniforms['uShallowColor']!.value.setHex(0x1a4e68);
      uniforms['uFoamColor']!.value.setHex(0xd4e2e7);
      uniforms['uSubsurfaceColor']!.value.setHex(0x2e7887);
      uniforms['uFogColor']!.value.setHex(0x0c2638);
      uniforms['uSunDirection']!.value.set(0.46, 0.76, 0.34).normalize();
    }
  }

  dispose(): void {
    this._geometry.dispose();
    this._material.dispose();
  }
}
