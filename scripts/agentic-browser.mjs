import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const BASE_URL = process.env.AGENT_BROWSER_BASE_URL ?? 'http://localhost:3000'
const ARTIFACT_ROOT = path.resolve(ROOT_DIR, process.env.AGENT_BROWSER_ARTIFACT_DIR ?? 'artifacts/agentic-browser')
const DEVICE = process.env.AGENT_BROWSER_DEVICE ?? 'mobile'
const HEADLESS = !isEnabled(process.env.AGENT_BROWSER_HEADFUL)
const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_BROWSER_TIMEOUT_MS ?? 20000)
const DEFAULT_SETTLE_MS = Number(process.env.AGENT_BROWSER_SETTLE_MS ?? 900)

const env = await loadEnv()
const EMAIL = env.USERNAME ?? process.env.USERNAME
const PASSWORD = env.PASSWORD ?? process.env.PASSWORD

const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
const runDir = path.join(ARTIFACT_ROOT, runStamp)
const screenshotDir = path.join(runDir, 'screenshots')
const videoDir = path.join(runDir, 'video')
const tracePath = path.join(runDir, 'trace.zip')
const harPath = path.join(runDir, 'network.har')
const statePath = path.join(runDir, 'session.json')

await mkdir(screenshotDir, { recursive: true })
await mkdir(videoDir, { recursive: true })

const { chromium, devices } = await loadPlaywright()
const { deviceOptions, deviceLabel, videoSize } = resolveDeviceProfile(DEVICE, devices)

const browser = await chromium.launch({
  headless: HEADLESS,
  slowMo: Number(process.env.AGENT_BROWSER_SLOWMO_MS ?? 0) || 0,
})

const context = await browser.newContext({
  ...deviceOptions,
  recordHar: {
    path: harPath,
    content: 'embed',
    mode: 'full',
  },
  recordVideo: {
    dir: videoDir,
    size: videoSize,
  },
})

await context.tracing.start({ screenshots: true, snapshots: true })

const page = await context.newPage()
const commandLog = []
const consoleMessages = []
const pageErrors = []
const requestFailures = []
const requestStarts = new Map()
const requestLog = []
let screenshotCount = 0
let closed = false

page.on('console', message => {
  const entry = {
    at: new Date().toISOString(),
    type: message.type(),
    text: message.text(),
  }
  consoleMessages.push(entry)
})

page.on('pageerror', error => {
  pageErrors.push({
    at: new Date().toISOString(),
    message: error.message,
    stack: error.stack ?? '',
  })
})

page.on('request', request => {
  requestStarts.set(request, Date.now())
})

page.on('requestfinished', async request => {
  const startedAt = requestStarts.get(request) ?? Date.now()
  const response = await request.response().catch(() => null)
  requestLog.push({
    at: new Date().toISOString(),
    url: sanitizeUrl(request.url()),
    method: request.method(),
    resourceType: request.resourceType(),
    status: response?.status() ?? null,
    durationMs: Date.now() - startedAt,
  })
  requestStarts.delete(request)
})

page.on('requestfailed', request => {
  const startedAt = requestStarts.get(request) ?? Date.now()
  const entry = {
    at: new Date().toISOString(),
    url: sanitizeUrl(request.url()),
    method: request.method(),
    resourceType: request.resourceType(),
    failure: request.failure()?.errorText ?? 'unknown',
    durationMs: Date.now() - startedAt,
  }
  requestFailures.push(entry)
  requestLog.push({
    ...entry,
    status: null,
  })
  requestStarts.delete(request)
})

await page.addInitScript(initBrowserStore)
await persistState()

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

respond({
  ok: true,
  event: 'ready',
  baseUrl: BASE_URL,
  runDir,
  device: deviceLabel,
  headless: HEADLESS,
})

for await (const rawLine of rl) {
  const line = rawLine.trim()
  if (!line) continue

  let command
  try {
    command = JSON.parse(line)
  } catch (error) {
    respond({
      ok: false,
      error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    })
    continue
  }

  try {
    const result = await executeCommand(command)
    respond({ ok: true, ...result })
    if (command.cmd === 'close') break
  } catch (error) {
    respond({
      ok: false,
      command: command.cmd ?? null,
      error: error instanceof Error ? error.message : String(error),
      url: page.url(),
    })
  }
}

await cleanup()

async function executeCommand(command) {
  const startedAt = Date.now()
  const name = typeof command.cmd === 'string' ? command.cmd : 'unknown'
  const settleMs = Number(command.settleMs ?? DEFAULT_SETTLE_MS)
  let payload = {}

  switch (name) {
    case 'goto': {
      const targetUrl = toAbsoluteUrl(command.url ?? '/')
      await page.goto(targetUrl, {
        waitUntil: command.waitUntil ?? 'domcontentloaded',
        timeout: Number(command.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      })
      await settlePage(settleMs)
      payload = {
        url: page.url(),
        snapshot: await collectSnapshot(command.label),
      }
      break
    }

    case 'login': {
      if (!EMAIL || !PASSWORD) {
        throw new Error('Missing USERNAME/PASSWORD in .env.local or environment')
      }

      await page.goto(toAbsoluteUrl('/auth/login'), {
        waitUntil: 'domcontentloaded',
        timeout: Number(command.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      })
      await settlePage(settleMs)

      await humanType(page.locator('#email'), EMAIL, { mask: true })
      await humanType(page.locator('#password'), PASSWORD, { mask: true })
      await humanClick(page.getByRole('button', { name: 'Anmelden' }))
      await page.waitForURL('**/dashboard', { timeout: Number(command.timeoutMs ?? DEFAULT_TIMEOUT_MS) })
      await settlePage(settleMs)

      payload = {
        url: page.url(),
        snapshot: await collectSnapshot(command.label ?? 'dashboard-after-login'),
      }
      break
    }

    case 'click': {
      const locator = resolveLocator(command.target)
      await humanClick(locator)
      if (command.waitForUrl) {
        await page.waitForURL(command.waitForUrl, { timeout: Number(command.timeoutMs ?? DEFAULT_TIMEOUT_MS) })
      }
      if (command.waitForTarget) {
        await resolveLocator(command.waitForTarget).waitFor({
          timeout: Number(command.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        })
      }
      await settlePage(settleMs)
      payload = {
        url: page.url(),
        snapshot: await collectSnapshot(command.label),
      }
      break
    }

    case 'type': {
      const locator = resolveLocator(command.target)
      await humanType(locator, String(command.text ?? ''), { mask: Boolean(command.mask) })
      await settlePage(Number(command.settleMs ?? 250))
      payload = {
        url: page.url(),
        snapshot: await collectSnapshot(command.label),
      }
      break
    }

    case 'press': {
      const locator = resolveLocator(command.target)
      await locator.press(String(command.key ?? 'Enter'))
      await settlePage(settleMs)
      payload = {
        url: page.url(),
        snapshot: await collectSnapshot(command.label),
      }
      break
    }

    case 'scroll': {
      if (command.position === 'bottom') {
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
      } else if (command.position === 'top') {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      } else if (typeof command.deltaY === 'number') {
        await page.evaluate(deltaY => window.scrollBy({ top: deltaY, behavior: 'instant' }), command.deltaY)
      } else if (typeof command.fraction === 'number') {
        await page.evaluate(fraction => {
          const top = Math.max(0, document.body.scrollHeight * fraction)
          window.scrollTo({ top, behavior: 'instant' })
        }, command.fraction)
      } else {
        throw new Error('scroll requires position, deltaY, or fraction')
      }

      await settlePage(Number(command.settleMs ?? 300))
      payload = {
        url: page.url(),
        snapshot: await collectSnapshot(command.label),
      }
      break
    }

    case 'wait': {
      const ms = Number(command.ms ?? 1000)
      await page.waitForTimeout(ms)
      payload = {
        waitedMs: ms,
        url: page.url(),
      }
      break
    }

    case 'snapshot': {
      payload = {
        url: page.url(),
        snapshot: await collectSnapshot(command.label),
      }
      break
    }

    case 'close': {
      payload = {
        url: page.url(),
      }
      break
    }

    default:
      throw new Error(`Unsupported command: ${name}`)
  }

  const entry = {
    at: new Date().toISOString(),
    command: name,
    args: sanitizeCommand(command),
    durationMs: Date.now() - startedAt,
    url: page.url(),
  }
  commandLog.push(entry)
  await persistState()

  return {
    command: name,
    durationMs: entry.durationMs,
    ...payload,
  }
}

function resolveLocator(target) {
  if (!target || typeof target !== 'object') {
    throw new Error('target is required')
  }

  let locator

  switch (target.kind) {
    case 'role':
      locator = page.getByRole(target.role, {
        name: target.name,
        exact: Boolean(target.exact),
      })
      break
    case 'text':
      locator = page.getByText(target.text, {
        exact: Boolean(target.exact),
      })
      break
    case 'label':
      locator = page.getByLabel(target.text, {
        exact: Boolean(target.exact),
      })
      break
    case 'placeholder':
      locator = page.getByPlaceholder(target.text, {
        exact: Boolean(target.exact),
      })
      break
    case 'testId':
      locator = page.getByTestId(target.value)
      break
    case 'css':
      locator = page.locator(target.selector)
      break
    default:
      throw new Error(`Unsupported target kind: ${String(target.kind)}`)
  }

  if (typeof target.nth === 'number') {
    locator = locator.nth(target.nth)
  }

  return locator
}

async function collectSnapshot(label) {
  const filename = await saveScreenshot(label)
  const snapshot = await page.evaluate(() => {
    const store = window.__PHYSIOBOT_AGENT_BROWSER_STORE__ ?? {}

    const isVisible = element => {
      if (!(element instanceof HTMLElement)) return false
      const style = window.getComputedStyle(element)
      if (style.visibility === 'hidden' || style.display === 'none') return false
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }

    const textOf = value => String(value ?? '').replace(/\s+/g, ' ').trim()
    const navEntry = performance.getEntriesByType('navigation')[0]
    const headings = [...document.querySelectorAll('h1, h2, h3')]
      .filter(isVisible)
      .map(node => textOf(node.textContent))
      .filter(Boolean)
      .slice(0, 12)

    const interactives = [...document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"]')]
      .filter(isVisible)
      .map(node => {
        const role = node.getAttribute('role') || node.tagName.toLowerCase()
        const ariaLabel = node.getAttribute('aria-label')
        const text = textOf(node.textContent)
        const placeholder = 'placeholder' in node ? node.placeholder : ''
        const type = 'type' in node ? node.type : ''
        const href = node instanceof HTMLAnchorElement ? node.getAttribute('href') : null
        return {
          role,
          name: text || ariaLabel || placeholder || type || node.id || node.className || 'unnamed',
          text,
          ariaLabel,
          placeholder,
          type,
          href,
        }
      })
      .slice(0, 40)

    const visibleText = textOf(document.body?.innerText ?? '').slice(0, 1600)

    return {
      url: location.href,
      title: document.title,
      headings,
      interactives,
      visibleText,
      scroll: {
        y: Math.round(window.scrollY),
        maxY: Math.round(store.maxScrollY ?? 0),
        maxPercent: roundNumber(store.maxScrollPercent ?? 0),
      },
      metrics: {
        clickCount: Array.isArray(store.clicks) ? store.clicks.length : 0,
        errorCount: Array.isArray(store.errors) ? store.errors.length : 0,
        longTaskCount: Array.isArray(store.longTasks) ? store.longTasks.length : 0,
        cls: roundNumber(store.cls ?? 0),
        lcpMs: typeof store.lcpMs === 'number' ? Math.round(store.lcpMs) : null,
        paints: store.paints ?? {},
        navigation: navEntry ? {
          type: navEntry.type,
          domContentLoadedMs: Math.round(navEntry.domContentLoadedEventEnd),
          loadMs: Math.round(navEntry.loadEventEnd),
          responseStartMs: Math.round(navEntry.responseStart),
          transferSize: navEntry.transferSize,
        } : null,
      },
    }

    function roundNumber(value) {
      return Number(Number(value).toFixed(3))
    }
  })

  return {
    ...snapshot,
    screenshot: filename,
  }
}

async function saveScreenshot(label) {
  screenshotCount += 1
  const safeLabel = slugify(label ?? `shot-${String(screenshotCount).padStart(2, '0')}`)
  const target = path.join(screenshotDir, `${String(screenshotCount).padStart(2, '0')}-${safeLabel}.png`)
  await page.screenshot({
    path: target,
    fullPage: false,
    animations: 'disabled',
  })
  return target
}

async function humanClick(locator) {
  await locator.waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (box) {
    const x = box.x + Math.min(Math.max(box.width * 0.5, 6), box.width - 6)
    const y = box.y + Math.min(Math.max(box.height * 0.5, 6), box.height - 6)
    await page.mouse.move(x, y, { steps: 12 })
    await page.waitForTimeout(120)
  }
  await locator.click({ delay: 80 })
}

async function humanType(locator, text, options = {}) {
  await locator.waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await locator.click()
  await locator.fill('')
  await locator.type(text, { delay: 55 })
}

async function settlePage(ms) {
  await page.waitForLoadState('networkidle', { timeout: DEFAULT_TIMEOUT_MS }).catch(() => undefined)
  await page.waitForTimeout(ms)
}

async function persistState() {
  await writeFile(
    statePath,
    JSON.stringify({
      meta: {
        baseUrl: BASE_URL,
        device: deviceLabel,
        headless: HEADLESS,
        startedAt: runStamp,
        runDir,
      },
      commandLog,
      consoleMessages,
      pageErrors,
      requestFailures,
      requestLog,
    }, null, 2),
    'utf8',
  )
}

async function cleanup() {
  if (closed) return
  closed = true

  await persistState().catch(() => undefined)
  await context.tracing.stop({ path: tracePath }).catch(() => undefined)
  await context.close().catch(() => undefined)
  await browser.close().catch(() => undefined)
}

function respond(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function toAbsoluteUrl(input) {
  if (String(input).startsWith('http://') || String(input).startsWith('https://')) {
    return String(input)
  }

  return `${BASE_URL}${String(input).startsWith('/') ? '' : '/'}${String(input)}`
}

function sanitizeCommand(command) {
  if (!command || typeof command !== 'object') return command
  return Object.fromEntries(
    Object.entries(command).map(([key, value]) => {
      if (key === 'text' || key === 'password') return [key, '<redacted>']
      return [key, value]
    }),
  )
}

function sanitizeUrl(url) {
  return String(url)
    .replace(/([?&]token=)[^&]+/gi, '$1redacted')
    .replace(/([?&]access_token=)[^&]+/gi, '$1redacted')
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'snapshot'
}

function resolveDeviceProfile(device, devices) {
  if (device === 'desktop') {
    return {
      deviceLabel: 'desktop',
      deviceOptions: {
        viewport: { width: 1440, height: 900 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      },
      videoSize: { width: 1440, height: 900 },
    }
  }

  if (device === 'iphone-se') {
    const profile = devices['iPhone SE (3rd gen)'] ?? devices['iPhone SE']
    return {
      deviceLabel: 'iphone-se',
      deviceOptions: profile,
      videoSize: { width: profile.viewport.width, height: profile.viewport.height },
    }
  }

  if (device === 'iphone-17-max') {
    const baseProfile = devices['iPhone 15 Pro Max'] ?? devices['iPhone 14 Pro Max']
    return {
      deviceLabel: 'iphone-17-max',
      deviceOptions: {
        ...baseProfile,
        viewport: { width: 440, height: 956 },
      },
      videoSize: { width: 440, height: 956 },
    }
  }

  if (device === 'mobile') {
    const profile = devices['iPhone 14']
    return {
      deviceLabel: 'mobile',
      deviceOptions: profile,
      videoSize: { width: profile.viewport.width, height: profile.viewport.height },
    }
  }

  throw new Error(`Unsupported AGENT_BROWSER_DEVICE: ${device}`)
}

async function loadEnv() {
  const values = {}

  try {
    const raw = await readFile(path.join(ROOT_DIR, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (match) {
        values[match[1].trim()] = match[2].trim()
      }
    }
  } catch {
    // Optional local env file.
  }

  return values
}

async function loadPlaywright() {
  try {
    return await import('@playwright/test')
  } catch (error) {
    console.error('Missing @playwright/test. Install it before running scripts/agentic-browser.mjs.')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

function initBrowserStore() {
  const MAX_ENTRIES = 400

  const textOf = value => String(value ?? '').replace(/\s+/g, ' ').trim()
  const summarizeNode = node => {
    const element = node instanceof Element ? node : null
    if (!element) return 'unknown'

    const role = element.getAttribute('role') || element.tagName.toLowerCase()
    const text = textOf(element.textContent)
    const ariaLabel = element.getAttribute('aria-label')
    const placeholder = 'placeholder' in element ? element.placeholder : ''
    return text || ariaLabel || placeholder || role
  }

  const store = window.__PHYSIOBOT_AGENT_BROWSER_STORE__ = window.__PHYSIOBOT_AGENT_BROWSER_STORE__ ?? {
    clicks: [],
    errors: [],
    longTasks: [],
    paints: {},
    cls: 0,
    lcpMs: null,
    maxScrollY: 0,
    maxScrollPercent: 0,
  }

  const push = (key, value) => {
    if (!Array.isArray(store[key])) return
    store[key].push(value)
    if (store[key].length > MAX_ENTRIES) {
      store[key].splice(0, store[key].length - MAX_ENTRIES)
    }
  }

  document.addEventListener('click', event => {
    push('clicks', {
      at: new Date().toISOString(),
      target: summarizeNode(event.target),
    })
  }, true)

  window.addEventListener('scroll', () => {
    const maxScrollable = Math.max(1, document.body.scrollHeight - window.innerHeight)
    store.maxScrollY = Math.max(store.maxScrollY, window.scrollY)
    store.maxScrollPercent = Math.max(store.maxScrollPercent, Math.min(1, window.scrollY / maxScrollable))
  }, { passive: true })

  window.addEventListener('error', event => {
    push('errors', {
      at: new Date().toISOString(),
      type: 'error',
      message: event.message,
    })
  })

  window.addEventListener('unhandledrejection', event => {
    push('errors', {
      at: new Date().toISOString(),
      type: 'unhandledrejection',
      message: event.reason?.message ?? String(event.reason),
    })
  })

  if (typeof PerformanceObserver === 'function') {
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'paint') {
            store.paints[entry.name] = Math.round(entry.startTime)
          }
        }
      }).observe({ type: 'paint', buffered: true })
    } catch {
      // Paint observer is optional.
    }

    try {
      new PerformanceObserver(list => {
        const entries = list.getEntries()
        const last = entries[entries.length - 1]
        if (last) {
          store.lcpMs = Math.round(last.startTime)
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {
      // LCP observer is optional.
    }

    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            store.cls += entry.value
          }
        }
      }).observe({ type: 'layout-shift', buffered: true })
    } catch {
      // CLS observer is optional.
    }

    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          push('longTasks', {
            at: new Date().toISOString(),
            startTime: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
          })
        }
      }).observe({ type: 'longtask', buffered: true })
    } catch {
      // Long task observer is optional.
    }
  }
}
