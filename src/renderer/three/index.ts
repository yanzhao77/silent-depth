/**
 * SILENT DEPTH V2.0 — Three.js Renderer Entry Point (src/renderer/three/index.ts)
 *
 * Orchestrates all Three.js sub-renderers into a single render pipeline.
 * This is the main interface consumed by src/main.ts.
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
  private _tacticalOverlay: TacticalOverlay | null = null;
  private _tacticalCanvas: HTMLCanvasElement | null = null;
  private _disposed = false;

  constructor(opts: ThreeRendererOptions) {
    this._sceneMgr = new SceneManager({
      canvas: opts.canvas,
      width: opts.width,
      height: opts.height,
    });

    const scene = this._sceneMgr.scene;

    this._cameraMgr = new CameraManager(opts.width, opts.height);
    this._ocean = new OceanRenderer();
    this._ships = new ShipRenderer(scene);
    this._submarine = new SubmarineRenderer(scene);
    this._sky = new SkyRenderer(scene);
    this._lighting = new LightingManager(scene);
    this._weather = new WeatherRenderer(scene);
    this._effects = new EffectsManager(scene);
    this._periscopeView = new PeriscopeView();

    // Create tactical overlay canvas
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

  /**
   * Render one frame from a RenderState.
   * Call once per rAF tick.
   */
  render(state: RenderState, dt: number): void {
    if (this._disposed) return;

    // Update all sub-renderers
    this._ocean.update(state.weather, state.wallTime, state.player.position.x, state.player.position.z);
    this._sky.update(state.weather, state.wallTime);
    this._lighting.update(state.weather);
    this._weather.update(state.weather, state.player.position.x, state.player.position.z, dt);
    this._submarine.update(state.player, state.wallTime, dt);
    this._ships.update(state.ships, state.wallTime);
    this._effects.update(state.effects, dt);

    // Update camera
    this._cameraMgr.update(state.player, dt);

    // Render
    this._sceneMgr.render(this._cameraMgr.activeCamera);

    // Update 2D overlays
    this._periscopeView.update(state);
    if (this._tacticalOverlay && this._tacticalCanvas) {
      // Only show tactical overlay in world mode or when explicitly requested
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
    if (this._tacticalCanvas) {
      this._tacticalCanvas.remove();
    }
    this._sceneMgr.dispose();
  }
}
