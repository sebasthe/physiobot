import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserSTT } from '@/lib/voice-module/providers/stt/BrowserSTT'

class MockSpeechRecognition {
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: { results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
}

vi.stubGlobal('webkitSpeechRecognition', MockSpeechRecognition)

describe('BrowserSTT', () => {
  let stt: BrowserSTT

  beforeEach(() => {
    stt = new BrowserSTT({ language: 'de-DE' })
  })

  it('implements STTProvider interface', () => {
    expect(stt.start).toBeDefined()
    expect(stt.stop).toBeDefined()
    expect(stt.isActive).toBeDefined()
  })

  it('is not active before start', () => {
    expect(stt.isActive()).toBe(false)
  })

  it('starts recognition with correct language', async () => {
    await stt.start()

    const recognition = (stt as unknown as { recognition: MockSpeechRecognition | null }).recognition
    expect(stt.isActive()).toBe(true)
    expect(recognition?.lang).toBe('de-DE')
    expect(recognition?.interimResults).toBe(true)
  })

  it('emits partial and committed transcripts', async () => {
    const partial = vi.fn()
    const committed = vi.fn()

    stt.onPartialTranscript = partial
    stt.onCommittedTranscript = committed

    await stt.start()

    const recognition = (stt as unknown as { recognition: MockSpeechRecognition | null }).recognition
    recognition?.onresult?.({
      results: [{ isFinal: false, 0: { transcript: 'Wei' } }],
    })
    recognition?.onresult?.({
      results: [{ isFinal: true, 0: { transcript: 'Weiter' } }],
    })

    expect(partial).toHaveBeenCalledWith('Wei')
    expect(committed).toHaveBeenCalledWith('Weiter')
  })

  it('cleans up on stop', async () => {
    await stt.start()

    const recognition = (stt as unknown as { recognition: MockSpeechRecognition | null }).recognition
    stt.stop()

    expect(stt.isActive()).toBe(false)
    expect(recognition?.abort).toHaveBeenCalled()
  })
})
