import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'fs/promises';
import path from 'path';

// Parse .env.local to get credentials (USERNAME is a reserved shell var)
async function loadEnv() {
  const env = {};
  try {
    const raw = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    }
  } catch {}
  return env;
}

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = 'screenshots';
const AUTH_STATE = '/tmp/physiobot-auth-state.json';

const dotenv = await loadEnv();
const EMAIL = dotenv.USERNAME ?? process.env.USERNAME;
const PASSWORD = dotenv.PASSWORD ?? process.env.PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('USERNAME and PASSWORD not found in .env.local');
  process.exit(1);
}

// Screens that require authentication
const SCREENS = [
  { name: '01-dashboard',              path: '/dashboard' },
  { name: '02-schedule',               path: '/schedule' },
  { name: '03-plan',                   path: '/plan' },
  { name: '04-settings',              path: '/settings' },
  { name: '05-onboarding-health',      path: '/onboarding/health-profile' },
  { name: '06-onboarding-personality', path: '/onboarding/personality' },
  { name: '07-training-session',       path: '/training/session' },
  { name: '08-training-feedback',      path: '/training/feedback' },
];

// Public screens (no auth needed)
const PUBLIC_SCREENS = [
  { name: '00-login',    path: '/auth/login' },
  { name: '00-register', path: '/auth/register' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
];

async function login(browser) {
  console.log('Logging in as', EMAIL, '...');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log('Login successful');

  await context.storageState({ path: AUTH_STATE });
  await context.close();
}

async function screenshotAll(browser) {
  await mkdir(OUT_DIR, { recursive: true });

  for (const viewport of VIEWPORTS) {
    // Authenticated context
    const authContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      storageState: AUTH_STATE,
    });
    const authPage = await authContext.newPage();

    // Public context (no auth)
    const pubContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const pubPage = await pubContext.newPage();

    for (const screen of PUBLIC_SCREENS) {
      try {
        await pubPage.goto(`${BASE_URL}${screen.path}`, { waitUntil: 'networkidle', timeout: 15000 });
        await pubPage.waitForTimeout(600);
        const file = `${OUT_DIR}/${screen.name}-${viewport.name}.png`;
        await pubPage.screenshot({ path: file, fullPage: true });
        console.log(`✓ ${file}`);
      } catch (err) {
        console.warn(`✗ ${screen.name} (${viewport.name}): ${err.message}`);
      }
    }

    for (const screen of SCREENS) {
      try {
        await authPage.goto(`${BASE_URL}${screen.path}`, { waitUntil: 'networkidle', timeout: 15000 });
        await authPage.waitForTimeout(800);
        const file = `${OUT_DIR}/${screen.name}-${viewport.name}.png`;
        await authPage.screenshot({ path: file, fullPage: true });
        console.log(`✓ ${file}`);
      } catch (err) {
        console.warn(`✗ ${screen.name} (${viewport.name}): ${err.message}`);
      }
    }

    await authContext.close();
    await pubContext.close();
  }
}

async function run() {
  const browser = await chromium.launch();
  await login(browser);
  await screenshotAll(browser);
  await browser.close();
  console.log(`\nDone! Screenshots saved to ./${OUT_DIR}`);
}

run().catch(err => { console.error(err); process.exit(1); });
