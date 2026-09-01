#!/usr/bin/env node
/**
 * Quick diagnostic: check positions, distances, and pingSync behavior.
 * Run: node tools/v2.9-capture/diagnose.mjs
 */
import { spawn, execSync } from 'node:child_process';
import { findChrome } from './chrome.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PORT = 5179;
const URL = `http://localhost:${PORT}`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const chromePath = findChrome();
  if (!chromePath) { console.error('No Chrome'); process.exit(1); }
  const puppeteer = await import('puppeteer-core');

  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'development' },
  });

  for (let i = 0; i < 30; i++) {
    try { execSync(`curl -s http://localhost:${PORT}/`, { timeout: 2000 }); break; }
    catch { await sleep(1000); }
  }

  const browser = await puppeteer.default.launch({
    executablePath: chromePath, headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--enable-webgl2'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(3000);

  console.log('=== Starting M01 ===');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const start = btns.find(b => b.textContent?.includes('开始游戏'));
    if (start) start.click();
  });
  await sleep(1500);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const m01 = btns.find(b => b.textContent?.includes('M01'));
    if (m01) m01.click();
  });
  await sleep(1500);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const c = btns.find(b => b.textContent?.includes('开始') || b.textContent?.includes('确认'));
    if (c) c.click();
  });
  await sleep(1000);

  // Get out of briefing
  await page.evaluate(() => window.__SD?.step(20));
  console.log('=== Initial positions ===');
  const pos0 = await page.evaluate(() => window.__SD?.positions());
  console.log(JSON.stringify(pos0, null, 2));
  const d0 = await page.evaluate(() => {
    const p = window.__SD?.positions();
    if (!p || p.length < 2) return -1;
    const pl = p.find(x => x.isPlayer);
    const en = p.find(x => !x.isPlayer);
    if (!pl || !en) return -1;
    return Math.sqrt((en.x - pl.x) ** 2 + (en.y - pl.y) ** 2);
  });
  console.log(`Initial distance: ${d0.toFixed(3)} km`);

  // Move forward with holdKeySim - 2400 ticks = 120s sim time
  console.log('\n=== Moving forward 2400 ticks (120s sim time) ===');
  const moveStart = Date.now();
  await page.evaluate(() => window.__SD?.holdKeySim('KeyW', 2400));
  const moveMs = Date.now() - moveStart;
  console.log(`Move took ${moveMs}ms wall clock`);

  const d1 = await page.evaluate(() => {
    const p = window.__SD?.positions();
    if (!p || p.length < 2) return { dist: -1 };
    const pl = p.find(x => x.isPlayer);
    const en = p.find(x => !x.isPlayer);
    if (!pl || !en) return { dist: -1 };
    return {
      dist: Math.sqrt((en.x - pl.x) ** 2 + (en.y - pl.y) ** 2),
      simTime: window.__SD?.simTime(),
      positions: p,
    };
  });
  console.log(`After move: distance=${d1.dist.toFixed(3)} km, simTime=${d1.simTime}`);
  console.log('Positions:', JSON.stringify(d1.positions, null, 2));

  // PingSync
  console.log('\n=== PingSync ===');
  await page.evaluate(() => window.__SD?.pingSync());
  const contacts = await page.evaluate(() => window.__SD?.contacts());
  console.log(`Contacts after ping: ${contacts.length}`);
  console.log(JSON.stringify(contacts, null, 2));
  const sonar = await page.evaluate(() => window.__SD?.sonarState());
  console.log('Sonar:', JSON.stringify(sonar));

  if (contacts.length === 0) {
    console.log('\n=== Waiting for cooldown, try again ===');
    await page.evaluate(() => window.__SD?.step(120));
    await page.evaluate(() => window.__SD?.pingSync());
    const c2 = await page.evaluate(() => window.__SD?.contacts());
    console.log(`2nd ping contacts: ${c2.length}`);
    console.log(JSON.stringify(c2, null, 2));
  }

  await browser.close();
  vite.kill();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
