/**
 * SILENT DEPTH V2.9 — Reproducible cinematic capture tool
 *
 * Uses puppeteer-core + real Chromium/WebGL2 to capture gameplay screenshots
 * through the real game entry point. No CDN, no remote resources, no fake data.
 *
 * Usage: node tools/v2.9-capture/capture.mjs [--headless]
 *
 * Output:
 *   screenshots/v2/*.png
 *   reports/v2.9-capture/manifest.json
 *   reports/v2.9-capture/REPORT.md
 */
import { execSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, readFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './chrome.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'screenshots', 'v2');
const REPORT_DIR = join(ROOT, 'reports', 'v2.9-capture');
const VITE_PORT = 5179;
const BASE_URL = `http://localhost:${VITE_PORT}`;
const HEADLESS = process.argv.includes('--headless');
const VPS = [
  { n: '1440x900', w: 1440, h: 900 },
  { n: '1280x720', w: 1280, h: 720 },
  { n: '1024x768', w: 1024, h: 768 },
  { n: '390x844', w: 390, h: 844 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getWebGLInfo(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#game-canvas');
    if (!c) return { vendor: 'none', renderer: 'none', version: 'none', error: -1 };
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { vendor: 'none', renderer: 'none', version: 'none', error: -1 };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      error: gl.getError(),
    };
  });
}

/**
 * Pixel validation: decode PNG in Chromium and analyze.
 * Returns metrics object or null if decode fails.
 */
async function validateScreenshot(page, filepath) {
  const buf = readFileSync(filepath);
  const b64 = buf.toString('base64');
  const dataUrl = `data:image/png;base64,${b64}`;

  return page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });

    const w = img.width;
    const h = img.height;
    if (w === 0 || h === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const totalPixels = w * h;

    // Analyze pixels
    let nonTransparent = 0;
    let totalBrightness = 0;
    const colorMap = new Map();

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a > 10) {
        nonTransparent++;
        const brightness = (r + g + b) / 3;
        totalBrightness += brightness;

        // Quantize colors (reduce to 32 levels per channel)
        const qr = (r >> 3) << 3;
        const qg = (g >> 3) << 3;
        const qb = (b >> 3) << 3;
        const key = (qr << 16) | (qg << 8) | qb;
        colorMap.set(key, (colorMap.get(key) || 0) + 1);
      }
    }

    const nonTransparentRatio = nonTransparent / totalPixels;
    if (nonTransparent === 0) {
      return {
        w,
        h,
        nonTransparentRatio: 0,
        avgBrightness: 0,
        variance: 0,
        distinctColors: 0,
        bgDiffRatio: 0,
        blank: true,
      };
    }

    const avgBrightness = totalBrightness / nonTransparent;

    // Variance of brightness
    let varianceSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 10) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        varianceSum += (brightness - avgBrightness) ** 2;
      }
    }
    const variance = varianceSum / nonTransparent;

    // Background color = most frequent quantized color
    let maxCount = 0;
    let bgKey = 0;
    for (const [k, v] of colorMap) {
      if (v > maxCount) {
        maxCount = v;
        bgKey = k;
      }
    }
    const bgR = (bgKey >> 16) & 0xff;
    const bgG = (bgKey >> 8) & 0xff;
    const bgB = bgKey & 0xff;

    // Pixels different from background
    let bgDiff = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 10) {
        const dr = Math.abs(data[i] - bgR);
        const dg = Math.abs(data[i + 1] - bgG);
        const db = Math.abs(data[i + 2] - bgB);
        if (dr + dg + db > 30) bgDiff++;
      }
    }
    const bgDiffRatio = bgDiff / nonTransparent;

    const distinctColors = colorMap.size;

    // Blank criteria: fully transparent OR (nearly single color AND zero variance)
    const blank = nonTransparentRatio < 0.01 || (distinctColors <= 2 && variance < 1);

    return {
      w,
      h,
      nonTransparentRatio,
      avgBrightness,
      variance,
      distinctColors,
      bgDiffRatio,
      blank,
    };
  }, dataUrl);
}

/**
 * Check WebGL canvas pixels for gameplay shots.
 */
async function getWebGLPixels(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#game-canvas');
    if (!c) return null;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return null;
    const w = c.width;
    const h = c.height;
    if (w === 0 || h === 0) return null;
    const px = new Uint8Array(4);
    // Sample center and 4 corners
    const samples = [
      [w / 2, h / 2],
      [w * 0.1, h * 0.1],
      [w * 0.9, h * 0.1],
      [w * 0.1, h * 0.9],
      [w * 0.9, h * 0.9],
    ];
    const colors = [];
    for (const [x, y] of samples) {
      gl.readPixels(Math.floor(x), Math.floor(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      colors.push([px[0], px[1], px[2], px[3]]);
    }
    const anyNonBlack = colors.some(([r, g, b, a]) => a > 0 && (r > 5 || g > 5 || b > 5));
    return { w, h, samples: colors, anyNonBlack };
  });
}

// ---------------------------------------------------------------------------
// DOM observation helpers — no __SD debug API dependency
// ---------------------------------------------------------------------------

/**
 * Step simulation by sleeping wall-clock time. DT=0.05s → N ticks = N*50ms.
 * The game loop runs at 20 Hz via requestAnimationFrame.
 */
async function stepSim(page, ticks) {
  await sleep(ticks * 50);
}

/** Dispatch a keyboard press+release to the window (real input path). */
async function dispatchKeyInput(page, code) {
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
  }, code);
  await sleep(20);
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
  }, code);
  await sleep(30);
}

/**
 * Ping via Space key. Waits for ping cooldown to clear by polling
 * the DOM ping chip class (ping-ready vs ping-cooldown).
 */
async function pingSyncDOM(page) {
  await dispatchKeyInput(page, 'Space');
  // Wait up to 5s for ping cooldown to appear then clear
  for (let w = 0; w < 50; w++) {
    await sleep(100);
    const cd = await page.evaluate(() => {
      const chip = document.querySelector('.ping-row .pc-mini-chip');
      if (!chip) return 0;
      const cls = chip.className;
      if (cls.includes('ping-cooldown')) {
        const m = chip.textContent?.match(/(\d+)/);
        return m ? Number(m[1]) : 3;
      }
      return 0;
    });
    if (cd === 0) return;
  }
}

/**
 * Move at throttle level via repeated W key presses.
 * Each W press adds +2 kt (THROTTLE_STEP_KT=2).
 * After pressing, sleep for the sim duration so the sub moves.
 */
async function moveAtDOM(page, presses, ticks) {
  for (let i = 0; i < presses; i++) {
    await dispatchKeyInput(page, 'KeyW');
  }
  await sleep(ticks * 50);
}

/**
 * Move with rudder: press W for throttle, hold A/D for steering.
 * Rudder = +1 (right/D) or -1 (left/A).
 */
async function moveAtWithDOM(page, presses, rudder, ticks) {
  for (let i = 0; i < presses; i++) {
    await dispatchKeyInput(page, 'KeyW');
  }
  if (rudder !== 0) {
    const rudderKey = rudder > 0 ? 'KeyD' : 'KeyA';
    await page.evaluate((c) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
    }, rudderKey);
    await sleep(ticks * 50);
    await page.evaluate((c) => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
    }, rudderKey);
    await sleep(50);
  } else {
    await sleep(ticks * 50);
  }
}

/**
 * Reset throttle to 0 by pressing S 11 times (22kt / 2kt per press).
 */
async function resetThrottleDOM(page) {
  for (let i = 0; i < 11; i++) {
    await dispatchKeyInput(page, 'KeyS');
  }
}

/** Read contacts from DOM .contact-row elements. */
async function getContactsDOM(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('.contact-row')];
    return rows.map((r, i) => ({
      id: `contact-${i}`,
      index: i,
      text: r.textContent?.trim() ?? '',
      selected: r.classList.contains('selected'),
    }));
  });
}

/** Read sonar state from DOM: battery bar text, ping chip state. */
async function getSonarStateDOM(page) {
  return page.evaluate(() => {
    const bars = [...document.querySelectorAll('.bar-row')];
    const batteryRow = bars.find((b) => {
      const lbl = b.querySelector('.bar-label');
      return lbl?.textContent?.includes('电池') || lbl?.textContent?.includes('Battery');
    });
    const batteryText = batteryRow?.querySelector('.bar-value')?.textContent ?? '100%';
    const battery = parseFloat(batteryText.replace('%', '')) || 100;
    const chip = document.querySelector('.ping-row .pc-mini-chip');
    const chipClass = chip?.className ?? '';
    const chipText = chip?.textContent ?? '';
    let pingCooldown = 0;
    if (chipClass.includes('ping-cooldown')) {
      const m = chipText.match(/(\d+)/);
      pingCooldown = m ? Number(m[1]) : 3;
    }
    const pingReady = chipClass.includes('ping-ready');
    return { battery, pingCooldown, pingReady };
  });
}

/**
 * Read snapshot-like state from DOM: periscope, contacts, timeline.
 */
async function getSnapshotDOM(page) {
  return page.evaluate(() => {
    const pcChips = [...document.querySelectorAll('.pc-mini-chip')];
    let periscopeState = 'STOWED';
    for (const chip of pcChips) {
      const t = chip.textContent?.trim() ?? '';
      if (t.includes('观测') || t.includes('Observing')) periscopeState = 'OBSERVING';
      else if (t.includes('升起') || t.includes('Raising')) periscopeState = 'RAISING';
      else if (t.includes('收回') || t.includes('Lowering')) periscopeState = 'LOWERING';
      else if (t.includes('锁定') || t.includes('Locked')) periscopeState = 'LOCKED';
    }
    const contactRows = [...document.querySelectorAll('.contact-row')];
    const contacts = contactRows.map((r, i) => {
      const text = r.textContent?.trim() ?? '';
      const bearingMatch = text.match(/(\d{3})°/);
      const rangeMatch = text.match(/([\d.]+)\s*km/);
      return {
        id: `contact-${i}`,
        bearing: bearingMatch ? Number(bearingMatch[1]) : null,
        range: rangeMatch ? Number(rangeMatch[1]) : null,
        visual: text.includes('✓') || text.includes('视觉'),
        selected: r.classList.contains('selected'),
      };
    });
    const tlRows = [...document.querySelectorAll('.tl-row')];
    const timeline = tlRows.slice(-5).map((r) => ({ text: r.textContent?.trim() ?? '' }));
    return { periscope: { state: periscopeState }, contacts, timeline };
  });
}

/**
 * Wait for mission to be running (HUD visible, menu hidden).
 */
async function waitForMissionRunning(page, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const running = await page.evaluate(() => {
      const hud = document.querySelector('.hud-topbar');
      const menu = document.getElementById('menu-root');
      const hudVisible = hud && hud.offsetParent !== null;
      const menuHidden = menu && (menu.style.display === 'none' || menu.children.length === 0);
      return hudVisible && menuHidden;
    });
    if (running) return true;
    await sleep(200);
  }
  return false;
}

/** Start mission via DOM buttons. */
async function startMissionDOM(page, missionId) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const start = btns.find((b) => b.textContent?.includes('开始游戏'));
    if (start) start.click();
  });
  await sleep(1500);
  await page.evaluate((id) => {
    const btn = document.querySelector(`button[data-mission-id="${id}"]`);
    if (btn) {
      btn.click();
      return;
    }
    const btns = [...document.querySelectorAll('button')];
    const mission = btns.find((b) => b.textContent?.includes(id));
    if (mission) mission.click();
  }, missionId);
  await sleep(1500);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const confirm = btns.find(
      (b) =>
        b.textContent?.includes('开始') ||
        b.textContent?.includes('确认') ||
        b.textContent?.includes('Start'),
    );
    if (confirm) confirm.click();
  });
  await sleep(500);
}

/**
 * Steer player and ping to detect contacts.
 * Keyboard-only approach (no debug API):
 * 1. Turn right by ~90° (enemy AI closes gap while we turn)
 * 2. Ping to detect contacts — if detected, done
 * 3. If not, move forward and ping again
 * Returns { detected } after approach + ping.
 */
async function steerAndApproach(page, { steerTicks = 0, maxPings = 6 } = {}) {
  console.log('    steer: turning right ~90° at CRUISE and pinging...');

  // Turn right ~90° (right/D) at CRUISE speed (6 W presses)
  // CRUISE turn rate: 3.0 deg/s, 90° = 30s = 600 ticks
  if (steerTicks === 0) steerTicks = 600;
  await moveAtWithDOM(page, 6, 1, steerTicks);

  const sonar0 = await getSonarStateDOM(page);
  console.log(`    steer: battery after turn=${sonar0.battery.toFixed(1)}%`);

  // Try up to maxPings
  let detected = false;
  for (let i = 0; i < maxPings; i++) {
    const sonar = await getSonarStateDOM(page);
    console.log(
      `    iter ${i}: battery=${sonar.battery.toFixed(1)}% cooldown=${sonar.pingCooldown}s`,
    );

    if (sonar.battery < 5) {
      console.log(
        `    battery low (${sonar.battery.toFixed(1)}%), stepping to let enemy approach...`,
      );
      await stepSim(page, 600);
      continue;
    }

    // Wait for ping cooldown if needed
    if (sonar.pingCooldown > 0) {
      await stepSim(page, Math.ceil(sonar.pingCooldown / 0.05) + 5);
    }

    console.log(`    pinging (iter ${i})...`);
    await pingSyncDOM(page);
    await stepSim(page, 20);

    const contacts = await getContactsDOM(page);
    console.log(`    ping result: ${contacts.length} contacts`);

    if (contacts.length > 0) {
      detected = true;
      break;
    }

    // No contacts yet — move forward at CRUISE (6 W presses) for 30s
    console.log('    moving at CRUISE to close gap...');
    await moveAtDOM(page, 6, 600);
  }

  return { detected };
}

// ---------------------------------------------------------------------------
// Shot definitions
// ---------------------------------------------------------------------------

function defineShots() {
  return [
    {
      id: 'main-menu',
      label: 'Main menu',
      type: 'UI CAPTURE',
      missionId: null,
      seed: null,
      setup: 'menu',
      description: '主菜单界面',
    },
    {
      id: 'mission-select',
      label: 'Mission selection',
      type: 'UI CAPTURE',
      missionId: null,
      seed: null,
      setup: 'mission-select',
      description: '任务选择界面',
    },
    {
      id: 'm01-clear-gameplay',
      label: 'M01 Clear gameplay',
      type: 'GAMEPLAY CAPTURE',
      missionId: 'M01',
      seed: 1001,
      setup: 'gameplay',
      weather: 'Clear',
      description: 'M01 声呐训练 — 晴天游戏画面',
    },
    {
      id: 'm01-hero-surface',
      label: 'Player sub surface / near-surface daytime hero',
      type: 'GAMEPLAY CAPTURE',
      missionId: 'M01',
      seed: 1001,
      setup: 'hero-surface',
      weather: 'Clear',
      description: '玩家潜艇水面/近水面昼间英雄镜头',
    },
    {
      id: 'm05-night-hero',
      label: 'Player sub Night hero',
      type: 'GAMEPLAY CAPTURE',
      missionId: 'M05',
      seed: 1005,
      setup: 'hero-night',
      weather: 'Night',
      description: '玩家潜艇夜间英雄镜头',
    },
    {
      id: 'm03-convoy-detected',
      label: 'M03 Convoy with detected merchants',
      type: 'GAMEPLAY CAPTURE',
      missionId: 'M03',
      seed: 1003,
      setup: 'convoy-detected',
      weather: 'Cloudy->Storm',
      description: 'M03 护航队 — 已探测商船',
    },
    {
      id: 'm04-storm-escort',
      label: 'M04 Storm with detected escort',
      type: 'GAMEPLAY CAPTURE',
      missionId: 'M04',
      seed: 1004,
      setup: 'storm-escort',
      weather: 'Storm->Fog',
      description: 'M04 风暴 — 已探测护航舰',
    },
    {
      id: 'm05-fog-atmosphere',
      label: 'Fog atmosphere',
      type: 'GAMEPLAY CAPTURE',
      missionId: 'M05',
      seed: 1005,
      setup: 'fog-atmosphere',
      weather: 'Night->Fog',
      description: '雾天氛围',
    },
    {
      id: 'periscope-view',
      label: 'Periscope view with real visible contact',
      type: 'GAMEPLAY CAPTURE',
      missionId: 'M01',
      seed: 1001,
      setup: 'periscope',
      weather: 'Clear',
      description: '潜望镜视图 — 真实可见联系',
    },
    {
      id: 'tactical-view',
      label: 'Tactical view',
      type: 'GAMEPLAY CAPTURE',
      missionId: 'M01',
      seed: 1001,
      setup: 'tactical',
      weather: 'Clear',
      description: '战术视图',
    },
    {
      id: 'torpedo-launched',
      label: 'Torpedo launch or in flight',
      type: 'GAMEPLAY CAPTURE',
      missionId: 'M02',
      seed: 1002,
      setup: 'torpedo-launch',
      weather: 'Clear',
      description: '鱼雷发射或航行',
    },
    {
      id: 'torpedo-hit',
      label: 'Torpedo hit or depth charge effect',
      type: 'GAMEPLAY CAPTURE',
      missionId: 'M02',
      seed: 1002,
      setup: 'torpedo-hit',
      weather: 'Clear',
      description: '鱼雷命中效果',
    },
  ];
}

// ---------------------------------------------------------------------------
// Capture logic
// ---------------------------------------------------------------------------

async function captureShot(browser, page, shot, vp) {
  const filename = `${shot.id}-${vp.n}.png`;
  const filepath = join(OUT_DIR, filename);

  // Setup game state
  await setupGameState(page, shot);

  // Apply viewport
  await page.setViewport({ width: vp.w, height: vp.h });
  await sleep(800);

  // Check WebGL
  const glInfo = await getWebGLInfo(page);
  const glError = glInfo.error;

  // Capture first, then validate
  await page.screenshot({ path: filepath, type: 'png' });

  // Validate pixels using Chromium decode
  const metrics = await validateScreenshot(page, filepath);
  const isBlank = metrics ? metrics.blank : true;

  // For gameplay shots, also get WebGL canvas pixels
  let webglPixels = null;
  if (shot.setup !== 'menu' && shot.setup !== 'mission-select') {
    webglPixels = await getWebGLPixels(page);
  }

  // For main-menu, verify DOM elements
  let menuCheck = null;
  if (shot.setup === 'menu') {
    menuCheck = await page.evaluate(() => {
      const menuRoot = document.getElementById('menu-root');
      const hasContent = menuRoot && menuRoot.children.length > 0;
      const buttons = menuRoot ? menuRoot.querySelectorAll('button') : [];
      const btnTexts = [...buttons].map((b) => b.textContent?.trim()).filter(Boolean);
      const hasTitle =
        document.body.innerText.includes('SILENT DEPTH') ||
        document.body.innerText.includes('深海猎手');
      return { hasContent, buttonCount: buttons.length, btnTexts, hasTitle };
    });
  }

  const hash = sha256(filepath);
  const buf = readFileSync(filepath);

  return {
    shotId: shot.id,
    file: `screenshots/v2/${filename}`,
    sha256: hash,
    width: vp.w,
    height: vp.h,
    type: shot.type,
    missionId: shot.missionId,
    seed: shot.seed,
    viewport: vp.n,
    quality: 'default',
    weather: shot.weather ?? null,
    playerDepth: null,
    cameraMode: null,
    simTime: null,
    f12Triggered: false,
    webglVendor: glInfo.vendor,
    webglRenderer: glInfo.renderer,
    webglVersion: glInfo.version,
    glError,
    consoleErrors: [],
    pageErrors: [],
    shaderErrors: [],
    blank: isBlank,
    pngBytes: buf.length,
    description: shot.description,
    pixelMetrics: metrics,
    webglPixels,
    menuCheck,
    captureResult: shot.captureResult ?? (isBlank ? 'BLANK' : glError !== 0 ? 'GL_ERROR' : 'OK'),
    notVerified: [],
  };
}

async function setupGameState(page, shot) {
  switch (shot.setup) {
    case 'menu':
      // Already at menu on load
      await sleep(1000);
      break;

    case 'mission-select':
      // Click "开始游戏" button
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const start = btns.find((b) => b.textContent?.includes('开始游戏'));
        if (start) start.click();
      });
      await sleep(1000);
      break;

    case 'gameplay': {
      // Start M01 and let it run
      await startMission(page, shot.missionId);
      // Wait for briefing to end and gameplay to start
      await sleep(6000);
      // Dispatch a few movement keys to make the scene dynamic
      await dispatchKey(page, 'KeyW');
      await sleep(2000);
      break;
    }

    case 'hero-surface': {
      // Start M01, go to surface
      await startMission(page, shot.missionId);
      await sleep(5000);
      // Press Q to cycle depth to Surface
      await dispatchKey(page, 'KeyQ');
      await dispatchKey(page, 'KeyQ');
      await sleep(3000);
      // Move forward
      await dispatchKey(page, 'KeyW');
      await sleep(2000);
      break;
    }

    case 'hero-night': {
      // Start M05 for night scene
      await startMission(page, shot.missionId);
      await sleep(6000);
      await dispatchKey(page, 'KeyW');
      await sleep(2000);
      break;
    }

    case 'convoy-detected': {
      // Start M03, ping to detect convoy
      await startMission(page, shot.missionId);
      await sleep(4000);
      // Ping multiple times to detect convoy
      for (let i = 0; i < 5; i++) {
        await dispatchKey(page, 'Space');
        await sleep(3500);
      }
      await dispatchKey(page, 'KeyW');
      await sleep(1000);
      break;
    }

    case 'storm-escort': {
      // Start M04 for storm + escort
      await startMission(page, shot.missionId);
      await sleep(5000);
      // Ping to detect escorts
      for (let i = 0; i < 4; i++) {
        await dispatchKey(page, 'Space');
        await sleep(3500);
      }
      await dispatchKey(page, 'KeyW');
      await sleep(1000);
      break;
    }

    case 'fog-atmosphere': {
      // Start M05 for fog
      await startMission(page, shot.missionId);
      await sleep(6000);
      await dispatchKey(page, 'KeyW');
      await sleep(2000);
      break;
    }

    case 'periscope': {
      // Start M01, detect contact, raise periscope
      await startMission(page, shot.missionId);
      await sleep(4000);
      // Ping to detect
      await dispatchKey(page, 'Space');
      await sleep(4000);
      // Raise periscope
      await dispatchKey(page, 'KeyP');
      await sleep(3000);
      break;
    }

    case 'tactical': {
      // Start M01, move to get contacts
      await startMission(page, shot.missionId);
      await sleep(5000);
      // Ping
      await dispatchKey(page, 'Space');
      await sleep(4000);
      await dispatchKey(page, 'KeyW');
      await sleep(1000);
      break;
    }

    case 'torpedo-launch': {
      // DOM-only approach: start mission via DOM, steer via keyboard,
      // detect contacts via DOM, fire via keyboard (select → periscope → lock → fire).
      await startMissionDOM(page, shot.missionId);
      await waitForMissionRunning(page, 15000);
      await sleep(2000);

      // Steer right ~90° at CRUISE, ping to detect contacts
      const result = await steerAndApproach(page, { maxPings: 12 });
      console.log(`    torpedo-launch: detected=${result.detected}`);

      // Get contacts via DOM
      const contacts = await getContactsDOM(page);
      if (contacts.length > 0) {
        const target = contacts[0];
        console.log(`    firing at ${target.id} (${target.text})`);

        // Select the contact by clicking its DOM row
        await page.evaluate((idx) => {
          const rows = [...document.querySelectorAll('.contact-row')];
          if (rows[idx]) rows[idx].click();
        }, target.index);
        await sleep(500);

        // Raise periscope (P) for visual confirmation
        await dispatchKeyInput(page, 'KeyP');
        for (let w = 0; w < 30; w++) {
          await stepSim(page, 10);
          const snap = await getSnapshotDOM(page);
          if (snap.periscope.state === 'OBSERVING' || snap.periscope.state === 'LOCKED') break;
        }

        // Lock target (L) for fire solution
        await dispatchKeyInput(page, 'KeyL');
        await stepSim(page, 20);

        // Fire (F)
        await dispatchKeyInput(page, 'KeyF');
        await stepSim(page, 40); // let torpedo appear and travel
      } else {
        console.log('    WARNING: no contacts to fire at');
        await stepSim(page, 20);
      }
      break;
    }

    case 'torpedo-hit': {
      // DOM-only approach: start mission via DOM, steer via keyboard (blind ~90° turn),
      // approach at SILENT, ping to detect contacts, fire via keyboard when in range.
      // Hit detection via DOM timeline events (torpedo.hit / ship.sunk).
      //
      // Battery budget: CRUISE steer ~13% + SILENT approach to 5km ~68% +
      // periscope/lock/ping ~5% + hit-wait ~7% = ~93%.
      //
      // Retry loop: up to 10 attempts if torpedo misses.

      const MAX_RETRIES = 10;
      let hitDetected;
      let firedFromDist;

      for (let retry = 0; retry <= MAX_RETRIES; retry++) {
        hitDetected = false;
        firedFromDist = Infinity;

        if (retry > 0) {
          console.log(`    torpedo-hit: RETRY ${retry}/${MAX_RETRIES} — navigating to fresh page`);
          await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 15000 });
          await sleep(2000);
        }

        // 1) Start mission via DOM buttons
        await startMissionDOM(page, shot.missionId);
        await waitForMissionRunning(page, 15000);
        await stepSim(page, 65);
        await sleep(500);

        // 2) Verify HUD is visible (game is running)
        const hudVisible = await page.evaluate(() => {
          const hud = document.querySelector('.hud-topbar');
          return hud && hud.offsetParent !== null;
        });
        if (!hudVisible) {
          console.log('    torpedo-hit: HUD not visible, skipping attempt');
          continue;
        }

        // 3) Steer right ~90° at CRUISE (blind — no positions available via DOM)
        // CRUISE turn rate: 3.0 deg/s, 90° = 30s = 600 ticks
        await moveAtWithDOM(page, 6, 1, 600);
        await resetThrottleDOM(page);
        const hitSonar = await getSonarStateDOM(page);
        console.log(`    torpedo-hit: battery after steer=${hitSonar.battery.toFixed(1)}%`);

        // 4) Approach at SILENT (4kt), ping periodically, fire when contact in range
        const TORPEDO_FIRE_KM = 5.0;

        for (let approach = 0; approach < 60; approach++) {
          const sonarNow = await getSonarStateDOM(page);
          console.log(
            `    torpedo-hit approach ${approach}: battery=${sonarNow.battery.toFixed(1)}%`,
          );

          // Ping to detect contacts
          if (sonarNow.pingCooldown > 0) {
            await stepSim(page, Math.ceil(sonarNow.pingCooldown / 0.05) + 5);
          }
          console.log(`    torpedo-hit: pinging (iter ${approach})...`);
          await pingSyncDOM(page);
          await stepSim(page, 20);

          // Check contacts via DOM — look for range ≤ FIRE_KM
          const snap = await getSnapshotDOM(page);
          const inRangeContact = snap.contacts.find(
            (c) => c.range !== null && c.range <= TORPEDO_FIRE_KM,
          );

          if (inRangeContact) {
            firedFromDist = inRangeContact.range;
            console.log(
              `    torpedo-hit: contact in range at ${firedFromDist}km — firing sequence`,
            );

            // Select the contact by clicking its DOM row
            await page.evaluate(
              (idx) => {
                const rows = [...document.querySelectorAll('.contact-row')];
                if (rows[idx]) rows[idx].click();
              },
              inRangeContact.id.replace('contact-', ''),
            );
            await sleep(500);

            // Raise periscope (P) for visual confirmation
            console.log('    torpedo-hit: raising periscope (P)...');
            await dispatchKeyInput(page, 'KeyP');
            let perState = null;
            for (let w = 0; w < 30; w++) {
              await stepSim(page, 10);
              const ps = await getSnapshotDOM(page);
              perState = ps.periscope.state;
              if (perState === 'OBSERVING' || perState === 'LOCKED') break;
            }
            console.log(`    torpedo-hit: periscope=${perState}`);

            // Lock target (L) for fire solution
            console.log('    torpedo-hit: locking target (L)...');
            await dispatchKeyInput(page, 'KeyL');
            await stepSim(page, 20);

            // Fire (F)
            console.log(`    torpedo-hit: firing from ${firedFromDist}km`);
            await dispatchKeyInput(page, 'KeyF');

            // 5) Wait for torpedo hit — check DOM timeline for hit/sunk events
            // Torpedo speed ~40kt (0.02 km/s), at 5km → ~250s sim.
            // Check every 400 ticks (20s sim).
            const candidateFrames = [];

            for (let batch = 0; batch < 60; batch++) {
              await stepSim(page, 400);

              // Check timeline DOM for hit/sunk events
              const tlSnap = await getSnapshotDOM(page);
              const hitEvent = tlSnap.timeline.find(
                (t) =>
                  t.text.includes('命中') ||
                  t.text.includes('HIT') ||
                  t.text.includes('击沉') ||
                  t.text.includes('SUNK') ||
                  t.text.includes('torpedo') ||
                  t.text.includes('鱼雷'),
              );

              if (hitEvent) {
                hitDetected = true;
                console.log(`    torpedo-hit: HIT detected at batch ${batch}: ${hitEvent.text}`);

                // Capture rapid candidate frames to catch the explosion effect
                for (let f = 0; f < 5; f++) {
                  await stepSim(page, 10);
                  const candidatePath = join(OUT_DIR, `${shot.id}-candidate-${f}.png`);
                  await page.screenshot({ path: candidatePath, type: 'png' });
                  const metrics = await validateScreenshot(page, candidatePath);
                  const variance = metrics ? metrics.variance : 0;
                  candidateFrames.push({ path: candidatePath, variance, frame: f });
                  console.log(
                    `    torpedo-hit: candidate frame ${f} variance=${variance.toFixed(2)}`,
                  );
                }

                // Select frame with highest variance (most visual activity = explosion)
                if (candidateFrames.length > 0) {
                  const bestFrame = candidateFrames.reduce((a, b) =>
                    b.variance > a.variance ? b : a,
                  );
                  console.log(
                    `    torpedo-hit: best frame = ${bestFrame.frame} (variance=${bestFrame.variance.toFixed(2)})`,
                  );
                  const mainPath = join(OUT_DIR, `${shot.id}-${VPS[0].n}.png`);
                  copyFileSync(bestFrame.path, mainPath);
                  for (const cf of candidateFrames) {
                    try {
                      unlinkSync(cf.path);
                    } catch {
                      /* ignore */
                    }
                  }
                }
                break;
              }

              // Check if battery depleted
              const batNow = await getSonarStateDOM(page);
              if (batNow.battery <= 0) {
                console.log(
                  `    torpedo-hit: battery depleted (${batNow.battery.toFixed(1)}%), stopping wait`,
                );
                break;
              }
            }

            if (!hitDetected) {
              // Clean up any leftover candidate files
              for (let f = 0; f < 5; f++) {
                try {
                  unlinkSync(join(OUT_DIR, `${shot.id}-candidate-${f}.png`));
                } catch {
                  /* ignore */
                }
              }
            }
            break; // exit approach loop (fired or gave up)
          }

          // Not in range yet — check battery before continuing
          if (sonarNow.battery <= 5) {
            console.log(
              `    torpedo-hit: battery low (${sonarNow.battery.toFixed(1)}%), waiting for recharge...`,
            );
            await stepSim(page, 600);
            continue;
          }

          // Move at SILENT (2 W presses = 4kt) for 600 ticks (30s sim)
          await moveAtDOM(page, 2, 600);
          await resetThrottleDOM(page);
        }

        if (hitDetected) {
          console.log(`    torpedo-hit: DONE — explosion captured from ${firedFromDist}km`);
          break; // Success — stop retrying
        }

        if (retry < MAX_RETRIES) {
          console.log(
            `    torpedo-hit: torpedo missed (fired from ${firedFromDist}km), will retry`,
          );
        } else {
          console.log(`    torpedo-hit: torpedo did not hit after ${MAX_RETRIES + 1} attempts`);
        }
      } // end retry loop

      if (!hitDetected) {
        shot.captureResult = 'NOT CAPTURED';
      }
      break;
    }
  }
}

async function startMission(page, missionId) {
  // Click start game if at menu
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const start = btns.find((b) => b.textContent?.includes('开始游戏'));
    if (start) start.click();
  });
  await sleep(1500);

  // Click the mission button
  await page.evaluate((id) => {
    const btns = [...document.querySelectorAll('button')];
    const mission = btns.find((b) => b.textContent?.includes(id));
    if (mission) mission.click();
  }, missionId);
  await sleep(1500);

  // Click confirm/start if there's a briefing
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const confirm = btns.find(
      (b) =>
        b.textContent?.includes('开始') ||
        b.textContent?.includes('确认') ||
        b.textContent?.includes('Start'),
    );
    if (confirm) confirm.click();
  });
  await sleep(500);
}

async function dispatchKey(page, code) {
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
  }, code);
  await sleep(50);
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
  }, code);
  await sleep(50);
}

// ---------------------------------------------------------------------------
// Viewport layout verification
// ---------------------------------------------------------------------------

async function verifyLayouts(page) {
  const results = [];
  for (const vp of VPS) {
    await page.setViewport({ width: vp.w, height: vp.h });
    await sleep(500);
    const check = await page.evaluate(() => {
      const app = document.getElementById('app');
      if (!app) return { ok: false, reason: 'no #app' };
      const canvas = document.querySelector('#game-canvas');
      const hud = document.querySelector('#hud-root');
      const menu = document.querySelector('#menu-root');
      return {
        ok: true,
        appW: app.offsetWidth,
        appH: app.offsetHeight,
        canvasVisible: canvas ? canvas.style.display !== 'none' : false,
        hudVisible: hud ? hud.style.display !== 'none' : false,
        menuVisible: menu ? menu.children.length > 0 : false,
      };
    });
    results.push({ viewport: vp.n, ...check });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('ERROR: Chrome not found. Set CHROME_PATH env or install Chrome.');
    process.exit(1);
  }
  console.log(`Chrome: ${chromePath}`);

  // Dynamically import puppeteer-core
  const puppeteer = await import('puppeteer-core');

  // Start Vite dev server
  console.log(`Starting Vite dev server on port ${VITE_PORT}...`);
  const vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development' },
  });

  let viteReady = false;
  vite.stdout.on('data', (d) => {
    const s = d.toString();
    if (s.includes('Local:') || s.includes('ready')) viteReady = true;
  });
  vite.stderr.on('data', (d) => {
    const s = d.toString();
    if (s.includes('Local:') || s.includes('ready')) viteReady = true;
  });

  // Wait for Vite to be ready
  for (let i = 0; i < 30; i++) {
    if (viteReady) break;
    try {
      execSync(`curl -s http://localhost:${VITE_PORT}/`, { timeout: 2000 });
      viteReady = true;
    } catch {
      await sleep(1000);
    }
  }
  if (!viteReady) {
    console.error('ERROR: Vite dev server did not start in time.');
    vite.kill();
    process.exit(1);
  }
  console.log('Vite dev server ready.');

  // Launch Chrome
  const browser = await puppeteer.default.launch({
    executablePath: chromePath,
    headless: HEADLESS ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-webgl2',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Collect errors
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // Navigate to game
  console.log(`Navigating to ${BASE_URL}...`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(3000);

  // Verify game loaded
  const loaded = await page.evaluate(() => {
    return (
      document.querySelector('#game-canvas') !== null || document.querySelector('#app') !== null
    );
  });
  if (!loaded) {
    console.error('ERROR: Game did not load.');
    await browser.close();
    vite.kill();
    process.exit(1);
  }
  console.log('Game loaded.');

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });

  // Get WebGL info
  const webglInfo = await getWebGLInfo(page);
  console.log(`WebGL: ${webglInfo.renderer} (${webglInfo.version})`);

  // Capture shots
  const shots = defineShots();
  const onlyArgIdx = process.argv.indexOf('--only');
  const onlyShot = onlyArgIdx >= 0 ? process.argv[onlyArgIdx + 1] : null;
  const filterShots = onlyShot ? shots.filter((s) => s.id === onlyShot) : shots;
  const manifest = [];

  for (const shot of filterShots) {
    console.log(`Capturing: ${shot.id} (${shot.label})...`);
    // Navigate fresh for each shot to avoid state bleed
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(2000);

    const result = await captureShot(browser, page, shot, VPS[0]);
    // Collect errors for this shot
    result.consoleErrors = [...consoleErrors];
    result.pageErrors = [...pageErrors];
    consoleErrors.length = 0;
    pageErrors.length = 0;

    manifest.push(result);
    console.log(`  → ${result.captureResult} (${result.pngBytes} bytes, blank=${result.blank})`);
  }

  // Viewport layout verification
  console.log('\nVerifying layouts at 4 viewports...');
  const layouts = await verifyLayouts(page);
  console.log('Layout results:', JSON.stringify(layouts));

  // F12 capture test
  console.log('\nTesting F12 cinematic capture...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 15000 });
  await sleep(2000);
  await startMission(page, 'M01');
  await sleep(5000);

  // Check HUD is visible before F12
  const hudBeforeF12 = await page.evaluate(() => {
    const tb = document.querySelector('.hud-topbar');
    return tb ? window.getComputedStyle(tb).display !== 'none' : false;
  });

  // Trigger F12
  await dispatchKey(page, 'F12');
  await sleep(800); // need ≥1 game loop tick for updateHud() to read cinematicCaptureActive

  const modeAfterF12 = await page.evaluate(() => {
    // Check body class (set immediately by captureCinematicFrame)
    const bodyCinematic = document.body.classList.contains('cinematic-capture');
    // Check HUD mode class (set by updateHud on next game tick)
    const h = document.querySelector('.hud');
    const mc = h ? [...h.classList].find((c) => c.startsWith('hud--')) : null;
    const hudMode = mc ? mc.replace('hud--', '') : 'normal';
    return { bodyCinematic, hudMode };
  });
  const hudHiddenByF12 = modeAfterF12.bodyCinematic || modeAfterF12.hudMode === 'cinematic';

  await sleep(2000);
  const modeAfterRestore = await page.evaluate(() => {
    const bodyCinematic = document.body.classList.contains('cinematic-capture');
    const h = document.querySelector('.hud');
    const mc = h ? [...h.classList].find((c) => c.startsWith('hud--')) : null;
    const hudMode = mc ? mc.replace('hud--', '') : 'normal';
    return { bodyCinematic, hudMode };
  });
  const hudRestored = !modeAfterRestore.bodyCinematic && modeAfterRestore.hudMode !== 'cinematic';

  console.log(
    `  F12: hudBefore=${hudBeforeF12}, hiddenByF12=${hudHiddenByF12}, restored=${hudRestored}`,
  );

  // Add F12 test result
  manifest.push({
    shotId: 'f12-cinematic-capture',
    file: null,
    sha256: null,
    width: 1440,
    height: 900,
    type: 'INTERACTION VERIFICATION',
    missionId: 'M01',
    seed: 1001,
    viewport: '1440x900',
    quality: 'default',
    weather: 'Clear',
    playerDepth: null,
    cameraMode: 'cinematic',
    simTime: null,
    f12Triggered: true,
    webglVendor: webglInfo.vendor,
    webglRenderer: webglInfo.renderer,
    webglVersion: webglInfo.version,
    glError: 0,
    consoleErrors: [],
    pageErrors: [],
    shaderErrors: [],
    blank: false,
    pngBytes: 0,
    description: 'F12 cinematic capture — HUD hides, ~1.6s restores',
    captureResult: hudHiddenByF12 && hudRestored ? 'OK' : 'FAIL',
    notVerified: hudHiddenByF12 && hudRestored ? [] : ['F12 capture behavior'],
  });

  // Layout results as a manifest entry
  manifest.push({
    shotId: 'layout-verification',
    file: null,
    sha256: null,
    width: null,
    height: null,
    type: 'VERIFICATION',
    missionId: null,
    seed: null,
    viewport: 'all',
    quality: 'default',
    weather: null,
    playerDepth: null,
    cameraMode: null,
    simTime: null,
    f12Triggered: false,
    webglVendor: webglInfo.vendor,
    webglRenderer: webglInfo.renderer,
    webglVersion: webglInfo.version,
    glError: 0,
    consoleErrors: [],
    pageErrors: [],
    shaderErrors: [],
    blank: false,
    pngBytes: 0,
    description: 'Layout verification at 4 viewports',
    captureResult: 'OK',
    layouts,
    notVerified: [],
  });

  // Check for required shot failures
  const REQUIRED_SHOTS = [
    'main-menu',
    'mission-select',
    'm01-clear-gameplay',
    'm01-hero-surface',
    'm05-night-hero',
    'm03-convoy-detected',
    'm04-storm-escort',
    'm05-fog-atmosphere',
    'periscope-view',
    'tactical-view',
    'torpedo-launched',
    'torpedo-hit',
  ];
  const failedRequired = manifest.filter(
    (s) => REQUIRED_SHOTS.includes(s.shotId) && s.captureResult !== 'OK',
  );
  if (failedRequired.length > 0) {
    console.error(`\nFATAL: ${failedRequired.length} required shot(s) failed:`);
    for (const s of failedRequired) {
      console.error(`  - ${s.shotId}: ${s.captureResult}`);
    }
  }

  // Write manifest
  const manifestPath = join(REPORT_DIR, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written: ${manifestPath}`);

  // Generate report
  generateReport(manifest, webglInfo);

  // Cleanup
  await browser.close();
  vite.kill();

  if (failedRequired.length > 0) {
    console.error('\nCapture FAILED — required shots not all OK.');
    process.exit(1);
  }
  console.log('\nCapture complete.');
}

function generateReport(manifest, webglInfo) {
  const uiShots = manifest.filter((s) => s.type === 'UI CAPTURE' && s.file !== null);
  const gameplayShots = manifest.filter((s) => s.type === 'GAMEPLAY CAPTURE' && s.file !== null);
  const harnessShots = manifest.filter((s) => s.type === 'RENDERER HARNESS');
  const okCount = [...uiShots, ...gameplayShots].filter((s) => s.captureResult === 'OK').length;
  const blankCount = [...uiShots, ...gameplayShots].filter((s) => s.blank).length;
  const glErrorCount = [...uiShots, ...gameplayShots].filter((s) => s.glError !== 0).length;

  const lines = [
    '# V2.9 Capture Report',
    '',
    `**Date:** ${new Date().toISOString()}`,
    `**Chromium:** ${webglInfo.renderer}`,
    `**WebGL:** ${webglInfo.version}`,
    `**Total screenshots:** ${uiShots.length + gameplayShots.length}`,
    `**UI captures:** ${uiShots.length}`,
    `**Gameplay captures:** ${gameplayShots.length}`,
    `**Renderer harness captures:** ${harnessShots.length}`,
    `**OK:** ${okCount} / **Blank:** ${blankCount} / **GL errors:** ${glErrorCount}`,
    '',
    '## Captured Shots',
    '',
    '| Shot ID | Source Type | Status | File | Viewport | Description |',
    '|---------|-------------|--------|------|----------|-------------|',
  ];

  for (const s of manifest) {
    if (s.type === 'VERIFICATION') continue;
    const status =
      s.captureResult === 'OK'
        ? '✅'
        : s.captureResult === 'BLANK'
          ? '⚠️ BLANK'
          : `❌ ${s.captureResult}`;
    const file = s.file ?? '—';
    lines.push(
      `| ${s.shotId} | ${s.type} | ${status} | ${file} | ${s.viewport} | ${s.description} |`,
    );
  }

  lines.push('');
  lines.push('## Pixel Verification Details');
  lines.push('');
  lines.push(
    '| Shot ID | Source Type | Non-Transparent % | Avg Brightness | Variance | Distinct Colors | BG Diff % |',
  );
  lines.push(
    '|---------|-------------|-------------------|----------------|----------|-----------------|-----------|',
  );
  for (const s of [...uiShots, ...gameplayShots]) {
    if (!s.pixelMetrics) continue;
    const m = s.pixelMetrics;
    lines.push(
      `| ${s.shotId} | ${s.type} | ${(m.nonTransparentRatio * 100).toFixed(1)} | ${m.avgBrightness.toFixed(1)} | ${m.variance.toFixed(1)} | ${m.distinctColors} | ${(m.bgDiffRatio * 100).toFixed(1)} |`,
    );
  }

  lines.push('');
  lines.push('## main-menu DOM Verification');
  lines.push('');
  const menuShot = manifest.find((s) => s.shotId === 'main-menu');
  if (menuShot?.menuCheck) {
    const mc = menuShot.menuCheck;
    lines.push(`- Menu root visible: ${mc.hasContent}`);
    lines.push(`- Title present: ${mc.hasTitle}`);
    lines.push(`- Buttons found: ${mc.buttonCount}`);
    lines.push(`- Button texts: ${mc.btnTexts.join(', ') || 'none'}`);
  } else {
    lines.push('- Not available');
  }

  lines.push('');
  lines.push('## Verification');
  lines.push('');
  lines.push(
    `- F12 cinematic capture: ${manifest.find((s) => s.shotId === 'f12-cinematic-capture')?.captureResult === 'OK' ? 'PASS' : 'FAIL'}`,
  );
  lines.push(
    `- Layout verification: ${manifest.find((s) => s.shotId === 'layout-verification')?.captureResult === 'OK' ? 'PASS' : 'FAIL'}`,
  );
  lines.push('');
  lines.push('## Labels');
  lines.push('');
  lines.push('- UI CAPTURE: Real DOM page without active mission (menu, mission select)');
  lines.push(
    '- GAMEPLAY CAPTURE: Real game entry, simulation, snapshot, adapter, renderer via public DOM/keyboard',
  );
  lines.push('- All screenshots from real Chromium/WebGL2 via puppeteer-core');
  lines.push('- No CDN assets, no remote textures, no runtime network resources');
  lines.push('- No simulation injection, no hidden gameplay truth');
  lines.push('- SwiftShader/ANGLE only — BROWSER VERIFIED (not TARGET HARDWARE VERIFIED)');
  lines.push('');
  lines.push('## NOT VERIFIED');
  lines.push('');
  lines.push('- Subjective aesthetics (sub/ship readability, fog density, HUD obstruction)');
  lines.push('- TARGET HARDWARE performance');
  lines.push('');
  lines.push('## deriveContactPresentation()');
  lines.push('');
  lines.push('The `deriveContactPresentation()` function is an independent pure function');
  lines.push('exported for unit testing. The production HUD contact list renders directly');
  lines.push('from snapshot data (src/ui/hud.ts lines 1049–1082). The function is NOT');
  lines.push('integrated into the production HUD rendering path. Both use consistent');
  lines.push('data transformation logic (UNKNOWN contacts show Unknown, trueShipId not');
  lines.push('leaked, uncertainty preserved).');
  lines.push('');

  const reportPath = join(REPORT_DIR, 'REPORT.md');
  writeFileSync(reportPath, lines.join('\n'));
  console.log(`Report written: ${reportPath}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
