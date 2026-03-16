import { describe, expect, it, vi } from 'vitest'
import { ActionBus } from '@/lib/voice-module/core/ActionBus'

describe('ActionBus', () => {
  it('dispatches voice actions', () => {
    const bus = new ActionBus()
    const handler = vi.fn()

    bus.on(handler)
    bus.dispatch({ source: 'voice', action: 'next_exercise', payload: {} })

    expect(handler).toHaveBeenCalledWith({ source: 'voice', action: 'next_exercise', payload: {} })
  })

  it('dispatches ui actions', () => {
    const bus = new ActionBus()
    const handler = vi.fn()

    bus.on(handler)
    bus.dispatch({ source: 'ui', action: 'next_exercise', payload: {} })

    expect(handler).toHaveBeenCalledWith({ source: 'ui', action: 'next_exercise', payload: {} })
  })

  it('off removes handlers', () => {
    const bus = new ActionBus()
    const handler = vi.fn()

    bus.on(handler)
    bus.off(handler)
    bus.dispatch({ source: 'ui', action: 'pause_workout', payload: {} })

    expect(handler).not.toHaveBeenCalled()
  })
})
