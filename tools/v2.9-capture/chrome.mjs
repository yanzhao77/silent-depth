/**
 * SILENT DEPTH V2.9 — Chrome detection for capture tool.
 * Finds system Chrome on macOS/Linux/Windows. Returns null if unavailable.
 */
import { existsSync } from 'node:fs';

const MAC_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
];

const LINUX_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

const WIN_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];

export function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const paths =
    process.platform === 'darwin'
      ? MAC_PATHS
      : process.platform === 'win32'
        ? WIN_PATHS
        : LINUX_PATHS;
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}
