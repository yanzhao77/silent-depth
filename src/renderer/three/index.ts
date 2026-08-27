/**
 * SILENT DEPTH V2.1 — Three.js Renderer Entry Point
 *
 * Orchestrates all Three.js sub-renderers into a cinematic render pipeline.
 * Includes post-processing for filmic visuals.
 */

import type { RenderState } from '../types';
import { SceneManager } from './SceneManager';
import { CameraManager } from './CameraManager';
import { OceanRenderer } from './OceanRenderer';
import { ShipRenderer } from './ShipRenderer';
import { SubmarineRenderer } from './SubmarineRenderer';
import { SkyRenderer } from './SkyRenderer';
import { LightingManager } from './LightingManager';
import { WeatherRenderer } from './WeatherRenderer';
import { EffectsManager } from './EffectsManager';
import { PeriscopeView } from './PeriscopeView';
import { TacticalOverlay } from './TacticalOverlay';
import { PostProcessing } from './PostProcessing';
import { autoDetectQuality, getQualitySettings, type QualityLevel } from './QualityPresets';

export interface ThreeRendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export class ThreeRenderer {
  private _sceneMgr: SceneManager;
  private _cameraMgr: CameraManager;
  private _ocean: OceanRenderer;
  private _ships: ShipRenderer;
  private _submarine: SubmarineRenderer;
  private _sky: SkyRenderer;
  private _lighting: LightingManager;
  private _weather: WeatherRenderer;
  private _effects: EffectsManager;
  private _periscopeView: PeriscopeView;
  private _postProcessing: PostProcessing;
  private _tacticalOverlay: TacticalOverlay | null = null;
  private _tacticalCanvas: HTMLCanvasElement | null = null;
  private _disposed = false;
  readonly qualityLevel: QualityLevel;

  constructor(opts: ThreeRendererOptions) {
    this.qualityLevel = autoDetectQuality();
    const quality = getQualitySettings();

    this._sceneMgr = new SceneManager({
      canvas: opts.canvas,
      width: opts.width,
      height: opts.height,
      quality,
    });

    const scene = this._sceneMgr.scene;

    this._cameraMgr = new CameraManager(opts.width, opts.height);
    this._ocean = new OceanRenderer(quality.oceanSegments);
    this._ships = new ShipRenderer(scene, quality);
    this._submarine = new SubmarineRenderer(scene, quality);
    this._sky = new SkyRenderer(scene);
    this._lighting = new LightingManager(scene, quality);
    this._weather = new WeatherRenderer(scene, quality.rainCount);
    this._effects = new EffectsManager(scene, quality.particleCount);
    this._periscopeView = new PeriscopeView();
    this._postProcessing = new PostProcessing(
      this._sceneMgr.renderer,
      opts.width,
      opts.height,
    );
    this._postProcessing.setQuality(
      quality.postProcessing,
      quality.bloomStrength,
      quality.vignetteStrength,
    );

    // Tactical overlay
    this._tacticalCanvas = document.createElement('canvas');
    this._tacticalCanvas.id = 'tactical-overlay';
    this._tacticalCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    document.body.appendChild(this._tacticalCanvas);
    this._tacticalOverlay = new TacticalOverlay(this._tacticalCanvas);

    // Add ocean to scene
    scene.add(this._ocean.mesh);
  }

  get cameraManager(): CameraManager {
    return this._cameraMgr;
  }

  render(state: RenderState, dt: number): void {
    if (this._disposed) return;

    // RenderState is the authoritative presentation contract. Synchronizing
    // here lets CameraManager interpolate mode changes rather than jumping.
    if (this._cameraMgr.mode !== state.camera.mode) {
      this._cameraMgr.setMode(state.camera.mode);
    }

    // Update all sub-renderers
    this._ocean.update(state.weather, state.wallTime, state.player.position.x, state.player.position.z);
    this._sky.update(state.weather, state.wallTime);
    this._lighting.update(state.weather);
    this._weather.update(state.weather, state.player.position.x, state.player.position.z, dt);
    this._submarine.update(state.player, state.wallTime, dt);
    this._ships.update(state.ships, state.wallTime);
    this._effects.update(state.effects, dt);

    // Camera
    this._cameraMgr.update(state.player, dt, state.wallTime);

    // Compute underwater fraction for post-processing
    const depthM = state.player.depthM ?? 0;
    const periscopeDepth = 15;
    const shallowDepth = 50;
    const depthFraction = depthM > periscopeDepth
      ? Math.min(1, (depthM - periscopeDepth) / (shallowDepth - periscopeDepth))
      : 0;

    // Render 3D scene with post-processing
    this._postProcessing.render(
      this._sceneMgr.scene,
      this._cameraMgr.activeCamera,
      state.wallTime,
      depthFraction,
    );

    // 2D overlays
    this._periscopeView.update(state, dt);
    if (this._tacticalOverlay && this._tacticalCanvas) {
      if (state.camera.mode === 'world') {
        this._tacticalCanvas.style.display = '';
        this._tacticalOverlay.update(state, this._cameraMgr.activeCamera, this._sceneMgr.width, this._sceneMgr.height);
      } else {
        this._tacticalCanvas.style.display = 'none';
      }
    }
  }

  resize(width: number, height: number): void {
    this._sceneMgr.resize(width, height);
    this._cameraMgr.resize(width, height);
    this._postProcessing.resize(width, height);
  }

  dispose(): void {
    this._disposed = true;
    this._ocean.dispose();
    this._ships.dispose();
    this._submarine.dispose();
    this._sky.dispose();
    this._lighting.dispose();
    this._weather.dispose();
    this._effects.dispose();
    this._periscopeView.dispose();
    this._postProcessing.dispose();
    if (this._tacticalCanvas) {
      this._tacticalCanvas.remove();
    }
    this._sceneMgr.dispose();
  }
}
