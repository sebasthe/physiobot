import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElevenLabsSTT } from '@/lib/voice-module/providers/stt/ElevenLabsSTT'

const trackStop = vi.fn()
const mockTrack = {
  stop: trackStop,
  applyConstraints: vi.fn().mockResolvedValue(undefined),
}

const mockMediaStream = {
  getTracks: () => [mockTrack],
  getAudioTracks: () => [mockTrack],
}

const mockGetUserMedia = vi.fn().mockResolvedValue(mockMediaStream)

Object.defineProperty(globalThis, 'navigator', {
  value: { mediaDevices: { getUserMedia: mockGetUserMedia } },
  configurable: true,
})

class MockWebSocket {
  static OPEN = 1

  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  readyState = MockWebSocket.OPEN
  bufferedAmount = 0
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = 3
    this.onclose?.()
  })

  constructor() {
    setTimeout(() => this.onopen?.(), 0)
  }
}

const mockProcessorNode = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  onaudioprocess: null as ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null,
}

const mockSourceNode = {
  connect: vi.fn(),
  disconnect: vi.fn(),
}

const mockGainNode = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  gain: { value: 0 },
}

const mockCloseAudioContext = vi.fn().mockResolvedValue(undefined)
const mockResumeAudioContext = vi.fn().mockResolvedValue(undefined)

vi.stubGlobal('WebSocket', MockWebSocket)
vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
  sampleRate: 48000,
  destination: {},
  state: 'running',
  resume: mockResumeAudioContext,
  createMediaStreamSource: () => mockSourceNode,
  createScriptProcessor: () => mockProcessorNode,
  createGain: () => mockGainNode,
  close: mockCloseAudioContext,
})))

describe('ElevenLabsSTT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sttToken: 'test-token' }),
    }))
  })

  it('implements STTProvider interface', () => {
    const stt = new ElevenLabsSTT({ language: 'de', tokenEndpoint: '/api/voice/tokens' })

    expect(stt.start).toBeDefined()
    expect(stt.stop).toBeDefined()
    expect(stt.isActive).toBeDefined()
  })

  it('is not active before start', () => {
    const stt = new ElevenLabsSTT({ language: 'de', tokenEndpoint: '/api/voice/tokens' })

    expect(stt.isActive()).toBe(false)
  })

  it('calls onCommittedTranscript when websocket sends committed message', async () => {
    const stt = new ElevenLabsSTT({ language: 'de', tokenEndpoint: '/api/voice/tokens' })
    const handler = vi.fn()
    stt.onCommittedTranscript = handler

    await stt.start()

    const ws = (stt as unknown as { ws: MockWebSocket }).ws
    ws?.onmessage?.({
      data: JSON.stringify({ type: 'committed_transcript', text: 'Naechste Uebung' }),
    })

    expect(handler).toHaveBeenCalledWith('Naechste Uebung')
  })

  it('cleans up on stop', async () => {
    const stt = new ElevenLabsSTT({ language: 'de', tokenEndpoint: '/api/voice/tokens' })

    await stt.start()

    const ws = (stt as unknown as { ws: MockWebSocket }).ws
    stt.stop()

    expect(stt.isActive()).toBe(false)
    expect(ws?.close).toHaveBeenCalled()
    expect(trackStop).toHaveBeenCalled()
    expect(mockCloseAudioContext).toHaveBeenCalled()
  })
})
