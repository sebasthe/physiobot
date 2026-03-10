import { describe, expect, it, vi } from 'vitest'
import { VoiceEventEmitter } from '@/lib/voice-module/core/events'
import type { TranscriptMessage } from '@/lib/voice-module/core/types'

describe('VoiceEventEmitter', () => {
  it('emits and listens to turnStateChanged', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()

    emitter.on('turnStateChanged', handler)
    emitter.emit('turnStateChanged', 'listening')

    expect(handler).toHaveBeenCalledWith('listening')
  })

  it('emits toolCall events', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()

    emitter.on('toolCall', handler)
    emitter.emit('toolCall', { name: 'next_exercise', input: {} })

    expect(handler).toHaveBeenCalledWith({ name: 'next_exercise', input: {} })
  })

  it('emits transcript events', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()
    const message: TranscriptMessage = { role: 'user', content: 'Weiter', timestamp: Date.now() }

    emitter.on('transcript', handler)
    emitter.emit('transcript', message)

    expect(handler).toHaveBeenCalledWith(message)
  })

  it('emits error events', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()

    emitter.on('error', handler)
    emitter.emit('error', new Error('mic failed'))

    expect(handler).toHaveBeenCalledWith(expect.any(Error))
  })

  it('off removes listener', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()

    emitter.on('turnStateChanged', handler)
    emitter.off('turnStateChanged', handler)
    emitter.emit('turnStateChanged', 'idle')

    expect(handler).not.toHaveBeenCalled()
  })

  it('removeAllListeners clears everything', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()

    emitter.on('turnStateChanged', handler)
    emitter.on('toolCall', handler)
    emitter.removeAllListeners()
    emitter.emit('turnStateChanged', 'idle')
    emitter.emit('toolCall', { name: 'pause_workout', input: {} })

    expect(handler).not.toHaveBeenCalled()
  })
})
