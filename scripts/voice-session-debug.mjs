import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const BASE_URL = process.env.VOICE_DEBUG_BASE_URL ?? 'http://localhost:3000'
const ARTIFACT_ROOT = path.resolve(ROOT_DIR, process.env.VOICE_DEBUG_ARTIFACT_DIR ?? 'artifacts/voice-debug')
const AUTH_STATE = path.join(ARTIFACT_ROOT, '.auth-state.json')
const HEADLESS = !isEnabled(process.env.VOICE_DEBUG_HEADFUL)
const TRY_LLM = !isDisabled(process.env.VOICE_DEBUG_SEND_MESSAGE)
const REQUIRE_AUDIO = !isDisabled(process.env.VOICE_DEBUG_REQUIRE_AUDIO)
const REQUIRE_LLM = isEnabled(process.env.VOICE_DEBUG_REQUIRE_LLM)
const TRY_MIC = isEnabled(process.env.VOICE_DEBUG_TRY_MIC)
const REQUIRE_MIC = isEnabled(process.env.VOICE_DEBUG_REQUIRE_MIC)
const MESSAGE = process.env.VOICE_DEBUG_MESSAGE ?? 'Ich bin bereit. Was ist der naechste Schritt?'
const EVENT_TIMEOUT_MS = Number(process.env.VOICE_DEBUG_EVENT_TIMEOUT_MS ?? 15000)
const SESSION_TIMEOUT_MS = Number(process.env.VOICE_DEBUG_SESSION_TIMEOUT_MS ?? 30000)
const AUDIO_REQUEST_SIGNAL_TYPES = [
  'tts.browser.speak.request',
  'tts.elevenlabs.speak.request',
  'tts.kokoro.speak.request',
  'speechSynthesis.speak.call',
  'audio.play.call',
]
const AUDIO_RESOLVED_SIGNAL_TYPES = [
  'tts.browser.speak.ended',
  'tts.elevenlabs.speak.ended',
  'tts.kokoro.speak.ended',
  'tts.kokoro.audio.play.ended',
  'tts.kokoro.audio.play.resolve',
  'speechSynthesis.utterance.end',
  'audio.play.resolve',
  'audio.event.playing',
]
const LLM_SIGNAL_TYPES = [
  'llm.fetch-sse.response',
  'session-player.voice-error',
]
const MIC_SIGNAL_TYPES = [
  'voice-session.start-listening.started',
  'stt.browser.listening',
  'stt.elevenlabs.listening',
  'session-player.listening-failure',
]

const env = await loadEnv()
const EMAIL = env.USERNAME ?? process.env.USERNAME
const PASSWORD = env.PASSWORD ?? process.env.PASSWORD

if (!EMAIL || !PASSWORD) {
  console.error('USERNAME and PASSWORD not found in .env.local')
  process.exit(1)
}

const viewport = (process.env.VOICE_DEBUG_VIEWPORT ?? 'mobile') === 'desktop'
  ? { width: 1440, height: 900 }
  : { width: 430, height: 932 }

const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
const runDir = path.join(ARTIFACT_ROOT, runStamp)

await mkdir(runDir, { recursive: true })

const { chromium } = await loadPlaywright()
const browser = await chromium.launch({
  headless: HEADLESS,
  args: TRY_MIC ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : [],
})

const context = await browser.newContext({
  viewport,
  permissions: TRY_MIC ? ['microphone'] : [],
})

const page = await context.newPage()
const consoleMessages = []
const pageErrors = []
const requestFailures = []
const voiceResponses = []
const screenshots = []

page.on('console', message => {
  const entry = {
    type: message.type(),
    text: message.text(),
  }
  consoleMessages.push(entry)
  console.log(`[console:${entry.type}] ${entry.text}`)
})

page.on('pageerror', error => {
  const entry = {
    message: error.message,
    stack: error.stack ?? '',
  }
  pageErrors.push(entry)
  console.error('[pageerror]', entry.message)
})

page.on('requestfailed', request => {
  const entry = {
    url: sanitizeUrl(request.url()),
    method: request.method(),
    failure: request.failure()?.errorText ?? 'unknown',
  }
  requestFailures.push(entry)
  console.warn('[requestfailed]', entry.method, entry.url, entry.failure)
})

page.on('response', async response => {
  const url = response.url()
  if (!url.includes('/api/voice')) return

  const contentType = response.headers()['content-type'] ?? ''
  let body = ''

  if (contentType.includes('application/json') || contentType.includes('text/')) {
    try {
      body = await response.text()
    } catch {
      body = '<unreadable body>'
    }
  }

  voiceResponses.push({
    url: sanitizeUrl(url),
    method: response.request().method(),
    status: response.status(),
    contentType,
    body,
  })
})

await page.addInitScript(({ storageKey }) => {
  const MAX_EVENTS = 500

  try {
    window.localStorage.setItem(storageKey, '1')
  } catch {
    // Storage can fail in sandboxed environments.
  }

  window.__PHYSIOBOT_VOICE_DEBUG__ = { enabled: true }
  window.__PHYSIOBOT_VOICE_DEBUG_STORE__ = window.__PHYSIOBOT_VOICE_DEBUG_STORE__ ?? {
    enabled: true,
    events: [],
    seq: 0,
  }
  window.__PHYSIOBOT_VOICE_DEBUG_STORE__.enabled = true

  const sanitizeUrl = input => String(input).replace(/([?&]token=)[^&]+/g, '$1redacted')

  const ensureStore = () => {
    const store = window.__PHYSIOBOT_VOICE_DEBUG_STORE__
    if (!store) {
      window.__PHYSIOBOT_VOICE_DEBUG_STORE__ = {
        enabled: true,
        events: [],
        seq: 0,
      }
    }

    return window.__PHYSIOBOT_VOICE_DEBUG_STORE__
  }

  const pushEvent = (type, payload = {}) => {
    const store = ensureStore()
    const event = {
      seq: store.seq + 1,
      type,
      ts: Date.now(),
      at: new Date().toISOString(),
      payload,
    }

    store.seq = event.seq
    store.events.push(event)
    if (store.events.length > MAX_EVENTS) {
      store.events.splice(0, store.events.length - MAX_EVENTS)
    }
  }

  pushEvent('e2e.init', {
    hasSpeechSynthesis: typeof speechSynthesis !== 'undefined',
    hasSpeechUtterance: typeof SpeechSynthesisUtterance !== 'undefined',
    userAgent: navigator.userAgent,
  })

  window.addEventListener('error', event => {
    pushEvent('window.error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  })

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason
    pushEvent('window.unhandledrejection', {
      message: reason?.message ?? String(reason),
      name: reason?.name,
    })
  })

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const input = args[0]
    const init = args[1]
    const url = typeof input === 'string'
      ? input
      : input instanceof Request
        ? input.url
        : String(input)
    const method = input instanceof Request
      ? input.method
      : init?.method ?? 'GET'

    if (url.includes('/api/voice')) {
      pushEvent('fetch.request', {
        url: sanitizeUrl(url),
        method,
      })
    }

    try {
      const response = await originalFetch(...args)
      if (url.includes('/api/voice')) {
        pushEvent('fetch.response', {
          url: sanitizeUrl(url),
          method,
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type') ?? '',
        })
      }
      return response
    } catch (error) {
      if (url.includes('/api/voice')) {
        pushEvent('fetch.error', {
          url: sanitizeUrl(url),
          method,
          message: error?.message ?? String(error),
        })
      }
      throw error
    }
  }

  const OriginalAudio = window.Audio
  window.Audio = function PatchedAudio(...args) {
    const audio = new OriginalAudio(...args)
    const originalPlay = audio.play.bind(audio)

    audio.play = () => {
      pushEvent('audio.play.call', {
        src: sanitizeUrl(audio.currentSrc || audio.src),
      })

      const result = originalPlay()
      if (result && typeof result.then === 'function') {
        return result.then(value => {
          pushEvent('audio.play.resolve', {
            src: sanitizeUrl(audio.currentSrc || audio.src),
          })
          return value
        }).catch(error => {
          pushEvent('audio.play.reject', {
            src: sanitizeUrl(audio.currentSrc || audio.src),
            message: error?.message ?? String(error),
            name: error?.name,
          })
          throw error
        })
      }

      pushEvent('audio.play.no-promise', {
        src: sanitizeUrl(audio.currentSrc || audio.src),
      })
      return result
    }

    audio.addEventListener('playing', () => {
      pushEvent('audio.event.playing', {
        src: sanitizeUrl(audio.currentSrc || audio.src),
      })
    })

    audio.addEventListener('ended', () => {
      pushEvent('audio.event.ended', {
        src: sanitizeUrl(audio.currentSrc || audio.src),
      })
    })

    audio.addEventListener('error', () => {
      pushEvent('audio.event.error', {
        code: audio.error?.code,
        message: audio.error?.message,
        src: sanitizeUrl(audio.currentSrc || audio.src),
      })
    })

    return audio
  }
  window.Audio.prototype = OriginalAudio.prototype

  if (typeof speechSynthesis !== 'undefined') {
    const originalSpeak = speechSynthesis.speak.bind(speechSynthesis)
    speechSynthesis.speak = utterance => {
      const previousEnd = utterance.onend
      const previousError = utterance.onerror

      utterance.onend = event => {
        pushEvent('speechSynthesis.utterance.end', {
          elapsedTime: event?.elapsedTime,
          utterance: utterance.text,
        })
        previousEnd?.(event)
      }

      utterance.onerror = event => {
        pushEvent('speechSynthesis.utterance.error', {
          error: event?.error,
          utterance: utterance.text,
        })
        previousError?.(event)
      }

      pushEvent('speechSynthesis.speak.call', {
        text: utterance.text,
        lang: utterance.lang,
        rate: utterance.rate,
      })

      return originalSpeak(utterance)
    }

    const originalCancel = speechSynthesis.cancel.bind(speechSynthesis)
    speechSynthesis.cancel = () => {
      pushEvent('speechSynthesis.cancel.call', {})
      return originalCancel()
    }
  }

  if (typeof window.WebSocket === 'function') {
    const OriginalWebSocket = window.WebSocket
    window.WebSocket = function PatchedWebSocket(url, protocols) {
      const socket = protocols === undefined
        ? new OriginalWebSocket(url)
        : new OriginalWebSocket(url, protocols)
      const safeUrl = sanitizeUrl(url)
      const originalSend = socket.send.bind(socket)

      pushEvent('websocket.create', { url: safeUrl })

      socket.send = data => {
        pushEvent('websocket.send', {
          url: safeUrl,
          size: typeof data === 'string' ? data.length : 0,
        })
        return originalSend(data)
      }

      socket.addEventListener('open', () => {
        pushEvent('websocket.open', { url: safeUrl })
      })

      socket.addEventListener('message', event => {
        pushEvent('websocket.message', {
          url: safeUrl,
          size: typeof event.data === 'string' ? event.data.length : 0,
        })
      })

      socket.addEventListener('close', event => {
        pushEvent('websocket.close', {
          url: safeUrl,
          code: event.code,
          wasClean: event.wasClean,
        })
      })

      socket.addEventListener('error', () => {
        pushEvent('websocket.error', { url: safeUrl })
      })

      return socket
    }

    window.WebSocket.prototype = OriginalWebSocket.prototype
  }
}, { storageKey: 'physiobot:voice-debug' })

let artifact = null
let summary = null

try {
  logSection('Login')
  await login(page)

  logSection('Open Session')
  await page.goto(`${BASE_URL}/training/session`, {
    waitUntil: 'networkidle',
    timeout: SESSION_TIMEOUT_MS,
  })
  await page.getByTestId('voice-debug-panel').waitFor({ timeout: EVENT_TIMEOUT_MS })
  screenshots.push(await saveScreenshot(page, '01-session-open.png'))

  logSection('Trigger Intro Audio')
  await page.getByRole('button', { name: /nochmal/i }).click()
  await waitForDebugEvent(page, AUDIO_REQUEST_SIGNAL_TYPES, EVENT_TIMEOUT_MS)
  if (REQUIRE_AUDIO) {
    await waitForDebugEvent(page, AUDIO_RESOLVED_SIGNAL_TYPES, EVENT_TIMEOUT_MS).catch(() => undefined)
  }
  screenshots.push(await saveScreenshot(page, '02-after-repeat.png'))

  if (TRY_LLM) {
    logSection('Send Typed Message')
    const input = page.getByPlaceholder('Coach etwas sagen oder tippen...')
    await input.fill(MESSAGE)
    await page.getByRole('button', { name: /nachricht senden/i }).click()
    await waitForDebugEvent(page, LLM_SIGNAL_TYPES, EVENT_TIMEOUT_MS).catch(() => undefined)
    screenshots.push(await saveScreenshot(page, '03-after-message.png'))
  }

  if (TRY_MIC) {
    logSection('Toggle Microphone')
    const micButton = page.getByRole('button', { name: /mikrofon/i }).first()
    await micButton.click()
    await waitForDebugEvent(page, MIC_SIGNAL_TYPES, EVENT_TIMEOUT_MS).catch(() => undefined)
    screenshots.push(await saveScreenshot(page, '04-after-mic.png'))
  }

  const debugEvents = await readDebugEvents(page)
  summary = buildSummary(debugEvents, {
    requireAudio: REQUIRE_AUDIO,
    requireLlm: REQUIRE_LLM,
    requireMic: REQUIRE_MIC,
    tryLlm: TRY_LLM,
    tryMic: TRY_MIC,
    pageErrors,
    requestFailures,
    voiceResponses,
  })

  artifact = {
    meta: {
      baseUrl: BASE_URL,
      viewport,
      requireAudio: REQUIRE_AUDIO,
      requireLlm: REQUIRE_LLM,
      requireMic: REQUIRE_MIC,
      tryLlm: TRY_LLM,
      tryMic: TRY_MIC,
      message: TRY_LLM ? MESSAGE : null,
      generatedAt: new Date().toISOString(),
    },
    summary,
    screenshots,
    debugEvents,
    consoleMessages,
    pageErrors,
    requestFailures,
    voiceResponses,
  }

  await writeFile(
    path.join(runDir, 'voice-session-debug.json'),
    JSON.stringify(artifact, null, 2),
    'utf8',
  )

  console.log('\nSummary:')
  console.log(JSON.stringify(summary, null, 2))
  console.log(`\nArtifact: ${path.join(runDir, 'voice-session-debug.json')}`)

  if (!summary.passed) {
    process.exitCode = 1
  }
} finally {
  await context.close()
  await browser.close()
}

if (process.exitCode) {
  process.exit(process.exitCode)
}

function buildSummary(debugEvents, options) {
  const pageLevelErrors = [
    ...debugEvents.filter(event => event.type === 'window.error'),
    ...debugEvents.filter(event => event.type === 'window.unhandledrejection'),
  ]

  const audioRequested = hasAnyEvent(debugEvents, [
    'tts.browser.speak.request',
    'tts.elevenlabs.speak.request',
    'tts.kokoro.speak.request',
    'speechSynthesis.speak.call',
    'audio.play.call',
  ])
  const audioResolved = hasAnyEvent(debugEvents, [
    'tts.browser.speak.ended',
    'tts.elevenlabs.speak.ended',
    'tts.kokoro.speak.ended',
    'tts.kokoro.audio.play.ended',
    'tts.kokoro.audio.play.resolve',
    'speechSynthesis.utterance.end',
    'audio.play.resolve',
    'audio.event.playing',
  ])

  const llmRequested = hasAnyEvent(debugEvents, [
    'voice-session.send-message.requested',
    'llm.fetch-sse.request',
  ])
  const llmResponded = debugEvents.some(event =>
    event.type === 'llm.fetch-sse.response'
      && event.payload
      && typeof event.payload === 'object'
      && event.payload.ok === true,
  ) && hasAnyEvent(debugEvents, [
    'llm.fetch-sse.chunk',
    'session-player.transcript.append',
  ])

  const micRequested = hasAnyEvent(debugEvents, [
    'session-player.mic.enable',
    'voice-session.start-listening.requested',
  ])
  const micStarted = debugEvents.some(event =>
    (event.type === 'stt.browser.listening' || event.type === 'stt.elevenlabs.listening')
      && event.payload
      && typeof event.payload === 'object'
      && event.payload.active === true,
  ) || hasAnyEvent(debugEvents, [
    'voice-session.start-listening.started',
  ])

  const voiceHttpFailures = options.voiceResponses.filter(response => response.status >= 400)
  const failedChecks = []

  if (options.requireAudio && !audioResolved) {
    failedChecks.push('audio')
  }

  if (options.requireLlm && !llmResponded) {
    failedChecks.push('llm')
  }

  if (options.requireMic && !micStarted) {
    failedChecks.push('mic')
  }

  if (pageLevelErrors.length > 0 || options.pageErrors.length > 0) {
    failedChecks.push('client-errors')
  }

  return {
    passed: failedChecks.length === 0,
    failedChecks,
    audio: {
      required: options.requireAudio,
      requested: audioRequested,
      resolved: audioResolved,
    },
    llm: {
      attempted: options.tryLlm,
      required: options.requireLlm,
      requested: llmRequested,
      responded: llmResponded,
    },
    mic: {
      attempted: options.tryMic,
      required: options.requireMic,
      requested: micRequested,
      started: micStarted,
    },
    debugEventCount: debugEvents.length,
    pageErrorCount: options.pageErrors.length,
    requestFailureCount: options.requestFailures.length,
    voiceHttpFailureCount: voiceHttpFailures.length,
    lastEventTypes: debugEvents.slice(-8).map(event => event.type),
  }
}

async function waitForDebugEvent(page, types, timeout) {
  await page.waitForFunction(
    eventTypes => {
      const events = window.__PHYSIOBOT_VOICE_DEBUG_STORE__?.events ?? []
      return events.some(event => eventTypes.includes(event.type))
    },
    types,
    { timeout },
  )
}

async function readDebugEvents(page) {
  return page.evaluate(() => window.__PHYSIOBOT_VOICE_DEBUG_STORE__?.events ?? [])
}

async function saveScreenshot(page, filename) {
  const target = path.join(runDir, filename)
  await page.screenshot({ path: target, fullPage: true })
  return target
}

async function login(page) {
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: SESSION_TIMEOUT_MS })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: SESSION_TIMEOUT_MS })
  await page.context().storageState({ path: AUTH_STATE })
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
    console.error('Missing @playwright/test. Install it with `npm install -D @playwright/test` before running `npm run voice:debug`.')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

function logSection(title) {
  console.log(`\n=== ${title} ===`)
}

function sanitizeUrl(url) {
  return String(url).replace(/([?&]token=)[^&]+/g, '$1redacted')
}

function hasAnyEvent(events, types) {
  return events.some(event => types.includes(event.type))
}

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

function isDisabled(value) {
  return ['0', 'false', 'no', 'off'].includes(String(value ?? '').trim().toLowerCase())
}
