import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserTTS } from '@/lib/voice-module/providers/tts/BrowserTTS'

const mockSpeak = vi.fn()
const mockCancel = vi.fn()

vi.stubGlobal('speechSynthesis', {
  speak: mockSpeak,
  cancel: mockCancel,
  speaking: false,
})

vi.stubGlobal('SpeechSynthesisUtterance', vi.fn().mockImplementation((text: string) => ({
  text,
  lang: '',
  rate: 1,
  onend: null as (() => void) | null,
  onerror: null as (() => void) | null,
})))

describe('BrowserTTS', () => {
  let tts: BrowserTTS

  beforeEach(() => {
    tts = new BrowserTTS({ language: 'de-DE' })
    vi.clearAllMocks()
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

  it('stop cancels speech', () => {
    tts.stop()

    expect(mockCancel).toHaveBeenCalled()
  })
})
