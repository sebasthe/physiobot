import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserTTS } from '@/lib/voice-module/providers/tts/BrowserTTS'

const mockSpeak = vi.fn()
const mockCancel = vi.fn()
const mockResume = vi.fn()
const mockGetVoices = vi.fn()

vi.stubGlobal('speechSynthesis', {
  speak: mockSpeak,
  cancel: mockCancel,
  resume: mockResume,
  getVoices: mockGetVoices,
  speaking: false,
  pending: false,
  paused: false,
})

vi.stubGlobal('SpeechSynthesisUtterance', vi.fn().mockImplementation((text: string) => ({
  text,
  lang: '',
  rate: 1,
  volume: 1,
  voice: null,
  onend: null as (() => void) | null,
  onerror: null as (() => void) | null,
})))

describe('BrowserTTS', () => {
  let tts: BrowserTTS

  beforeEach(() => {
    tts = new BrowserTTS({ language: 'de-DE' })
    vi.clearAllMocks()
    mockGetVoices.mockReturnValue([])
    ;(globalThis.speechSynthesis as SpeechSynthesis & { paused: boolean }).paused = false
    ;(globalThis.speechSynthesis as SpeechSynthesis & { pending: boolean }).pending = false
    ;(globalThis.speechSynthesis as SpeechSynthesis & { speaking: boolean }).speaking = false
  })

  it('implements TTSProvider interface', () => {
    expect(tts.speak).toBeDefined()
    expect(tts.stop).toBeDefined()
    expect(tts.isSpeaking).toBeDefined()
  })

  it('calls speechSynthesis.speak', async () => {
    mockSpeak.mockImplementation((utterance: { onend?: () => void }) => {
      setTimeout(() => utterance.onend?.(), 0)
    })

    await tts.speak('Hallo')

    expect(mockSpeak).toHaveBeenCalled()
  })

  it('prepares browser speech synthesis during the user gesture window', async () => {
    mockSpeak.mockImplementation((utterance: { onend?: () => void }) => {
      setTimeout(() => utterance.onend?.(), 0)
    })
    mockGetVoices.mockReturnValue([{ lang: 'de-DE', name: 'Anna' }])
    ;(globalThis.speechSynthesis as SpeechSynthesis & { paused: boolean }).paused = true

    await tts.prepare?.()

    expect(mockResume).toHaveBeenCalledTimes(1)
    expect(mockGetVoices).toHaveBeenCalled()
    expect(mockSpeak).toHaveBeenCalledTimes(1)

    const utterance = mockSpeak.mock.calls[0]?.[0]
    expect(utterance?.text).toBe('.')
    expect(utterance?.lang).toBe('de-DE')
    expect(utterance?.volume).toBe(0)
  })

  it('does not cancel speech synthesis when idle', () => {
    tts.stop()

    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('stop cancels active speech', () => {
    ;(tts as unknown as { speaking: boolean }).speaking = true

    tts.stop()

    expect(mockCancel).toHaveBeenCalledTimes(1)
  })
})
