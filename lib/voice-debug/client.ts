'use client'

const STORAGE_KEY = 'physiobot:voice-debug'
const EVENT_NAME = 'physiobot:voice-debug'
const MAX_EVENTS = 500

export interface VoiceDebugEvent {
  seq: number
  type: string
  ts: number
  at: string
  payload: Record<string, unknown>
}

interface VoiceDebugStore {
  enabled: boolean
  events: VoiceDebugEvent[]
  seq: number
}

declare global {
  interface Window {
    __PHYSIOBOT_VOICE_DEBUG__?: boolean | { enabled?: boolean }
    __PHYSIOBOT_VOICE_DEBUG_STORE__?: VoiceDebugStore
  }
}

function readEnvFlag(): boolean {
  const value = process.env.NEXT_PUBLIC_VOICE_DEBUG?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function readStorageFlag(scope: Window): boolean {
  try {
    return scope.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function readQueryFlag(scope: Window): boolean {
  try {
    const params = new URLSearchParams(scope.location.search)
    const value = params.get('voiceDebug')?.trim().toLowerCase()
    return value === '1' || value === 'true' || value === 'yes' || value === 'on'
  } catch {
    return false
  }
}

function readGlobalFlag(scope: Window): boolean {
  const flag = scope.__PHYSIOBOT_VOICE_DEBUG__
  if (typeof flag === 'boolean') {
    return flag
  }

  if (flag && typeof flag === 'object' && typeof flag.enabled === 'boolean') {
    return flag.enabled
  }

  return false
}

function resolveRuntimeFlag(scope: Window): boolean {
  return readEnvFlag() || readGlobalFlag(scope) || readStorageFlag(scope) || readQueryFlag(scope)
}

function getScope(): Window | null {
  return typeof window === 'undefined' ? null : window
}

function ensureStore(scope: Window): VoiceDebugStore {
  const existing = scope.__PHYSIOBOT_VOICE_DEBUG_STORE__
  if (existing) {
    existing.enabled = resolveRuntimeFlag(scope)
    return existing
  }

  const store: VoiceDebugStore = {
    enabled: resolveRuntimeFlag(scope),
    events: [],
    seq: 0,
  }

  scope.__PHYSIOBOT_VOICE_DEBUG_STORE__ = store
  return store
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  )
}

export function isVoiceDebugEnabled(): boolean {
  const scope = getScope()
  if (!scope) return readEnvFlag()
  return ensureStore(scope).enabled
}

export function setVoiceDebugEnabled(enabled: boolean): void {
  const scope = getScope()
  if (!scope) return

  scope.__PHYSIOBOT_VOICE_DEBUG__ = { enabled }

  try {
    if (enabled) {
      scope.localStorage.setItem(STORAGE_KEY, '1')
    } else {
      scope.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Storage is optional in sandboxed browser contexts.
  }

  ensureStore(scope).enabled = enabled
}

export function clearVoiceDebugEvents(): void {
  const scope = getScope()
  if (!scope) return

  const store = ensureStore(scope)
  store.events = []
  store.seq = 0
}

export function getVoiceDebugEvents(): VoiceDebugEvent[] {
  const scope = getScope()
  if (!scope) return []
  return [...ensureStore(scope).events]
}

export function getVoiceDebugSnapshot(): {
  enabled: boolean
  eventCount: number
  lastEventType?: string
} {
  const scope = getScope()
  if (!scope) {
    return {
      enabled: readEnvFlag(),
      eventCount: 0,
    }
  }

  const store = ensureStore(scope)
  const lastEvent = store.events[store.events.length - 1]
  return {
    enabled: store.enabled,
    eventCount: store.events.length,
    lastEventType: lastEvent?.type,
  }
}

export function describeVoiceDebugText(text: string): Record<string, unknown> {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return {
      textLength: 0,
      textPreview: '',
    }
  }

  return {
    textLength: normalized.length,
    textPreview: normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized,
  }
}

export function recordVoiceDebugEvent(type: string, payload: Record<string, unknown> = {}): void {
  const scope = getScope()
  if (!scope) return

  const store = ensureStore(scope)
  if (!store.enabled) return

  const event: VoiceDebugEvent = {
    seq: store.seq + 1,
    type,
    ts: Date.now(),
    at: new Date().toISOString(),
    payload: sanitizePayload(payload),
  }

  store.seq = event.seq
  store.events.push(event)
  if (store.events.length > MAX_EVENTS) {
    store.events.splice(0, store.events.length - MAX_EVENTS)
  }

  scope.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: event }))

  if (process.env.NODE_ENV !== 'test') {
    console.info(`[voice-debug] ${type}`, event.payload)
  }
}
