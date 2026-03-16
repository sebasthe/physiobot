import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearVoiceDebugEvents,
  describeVoiceDebugText,
  getVoiceDebugEvents,
  isVoiceDebugEnabled,
  recordVoiceDebugEvent,
  setVoiceDebugEnabled,
} from '@/lib/voice-debug/client'

describe('voice debug client', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearVoiceDebugEvents()
    delete (window as Window & {
      __PHYSIOBOT_VOICE_DEBUG__?: boolean | { enabled?: boolean }
      __PHYSIOBOT_VOICE_DEBUG_STORE__?: unknown
    }).__PHYSIOBOT_VOICE_DEBUG__
    delete (window as Window & {
      __PHYSIOBOT_VOICE_DEBUG__?: boolean | { enabled?: boolean }
      __PHYSIOBOT_VOICE_DEBUG_STORE__?: unknown
    }).__PHYSIOBOT_VOICE_DEBUG_STORE__
  })

  it('is disabled by default', () => {
    expect(isVoiceDebugEnabled()).toBe(false)
  })

  it('records events when enabled', () => {
    setVoiceDebugEnabled(true)
    recordVoiceDebugEvent('voice.test', { value: 1 })

    expect(getVoiceDebugEvents()).toEqual([
      expect.objectContaining({
        type: 'voice.test',
        payload: { value: 1 },
      }),
    ])
  })

  it('does not record events when disabled', () => {
    setVoiceDebugEnabled(false)
    recordVoiceDebugEvent('voice.test', { value: 1 })

    expect(getVoiceDebugEvents()).toHaveLength(0)
  })

  it('summarizes text for debug output', () => {
    expect(describeVoiceDebugText('  Hallo    Welt  ')).toEqual({
      textLength: 10,
      textPreview: 'Hallo Welt',
    })
  })
})
