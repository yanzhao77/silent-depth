/**
 * SILENT DEPTH V2.1 — Quality Presets
 *
 * Configurable quality levels that affect:
 * - Shadow quality
 * - Ocean resolution
 * - Particle count
 * - Post-processing
 * - LOD distances
 * - Rain density
 *
 * Levels: LOW, MEDIUM, HIGH (default), ULTRA
 */

export type QualityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface QualitySettings {
  shadowMapSize: number;
  shadowEnabled: boolean;
  oceanSegments: number;
  particleCount: number;
  rainCount: number;
  postProcessing: boolean;
  bloomStrength: number;
  vignetteStrength: number;
  lodDistanceMultiplier: number;
  antialias: boolean;
  pixelRatioMax: number;
}

const PRESETS: Record<QualityLevel, QualitySettings> = {
  LOW: {
    shadowMapSize: 512,
    shadowEnabled: false,
    oceanSegments: 128,
    particleCount: 15,
    rainCount: 1500,
    postProcessing: false,
    bloomStrength: 0,
    vignetteStrength: 0,
    lodDistanceMultiplier: 0.5,
    antialias: false,
    pixelRatioMax: 1,
  },
  MEDIUM: {
    shadowMapSize: 1024,
    shadowEnabled: true,
    oceanSegments: 200,
    particleCount: 30,
    rainCount: 2500,
    postProcessing: true,
    bloomStrength: 0.08,
    vignetteStrength: 0.8,
    lodDistanceMultiplier: 0.8,
    antialias: true,
    pixelRatioMax: 1.5,
  },
  HIGH: {
    shadowMapSize: 2048,
    shadowEnabled: true,
    oceanSegments: 300,
    particleCount: 40,
    rainCount: 4000,
    postProcessing: true,
    bloomStrength: 0.15,
    vignetteStrength: 1.2,
    lodDistanceMultiplier: 1.0,
    antialias: true,
    pixelRatioMax: 2,
  },
  ULTRA: {
    shadowMapSize: 4096,
    shadowEnabled: true,
    oceanSegments: 400,
    particleCount: 60,
    rainCount: 6000,
    postProcessing: true,
    bloomStrength: 0.2,
    vignetteStrength: 1.5,
    lodDistanceMultiplier: 1.5,
    antialias: true,
    pixelRatioMax: 2,
  },
};

let _currentLevel: QualityLevel = 'HIGH';
let _currentSettings: QualitySettings = { ...PRESETS.HIGH };

export function getQualityLevel(): QualityLevel {
  return _currentLevel;
}

export function getQualitySettings(): QualitySettings {
  return _currentSettings;
}

export function setQualityLevel(level: QualityLevel): void {
  _currentLevel = level;
  _currentSettings = { ...PRESETS[level] };
}

/**
 * Auto-detect quality level based on device capabilities.
 * Called once at init.
 */
export function autoDetectQuality(): QualityLevel {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'LOW';

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : '';

  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const isIntegratedGPU = /Intel|Mesa|SwiftShader/i.test(renderer);

  let level: QualityLevel = 'HIGH';

  if (isMobile || isIntegratedGPU) {
    level = 'MEDIUM';
  }
  if (maxTextureSize < 4096 || maxRenderbufferSize < 4096) {
    level = 'LOW';
  }
  if (isMobile && maxTextureSize < 8192) {
    level = 'LOW';
  }

  setQualityLevel(level);
  return level;
}
