import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Debouncer, SilenceEscalator } from '@/lib/voice-module/core/resilience'

describe('Debouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces rapid calls', () => {
    const handler = vi.fn()
    const debouncer = new Debouncer(300)

    debouncer.call(handler)
    debouncer.call(handler)
    debouncer.call(handler)

    expect(handler).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('cancels the pending call', () => {
    const handler = vi.fn()
    const debouncer = new Debouncer(300)

    debouncer.call(handler)
    debouncer.cancel()
    vi.advanceTimersByTime(300)

    expect(handler).not.toHaveBeenCalled()
  })
})

describe('SilenceEscalator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires nudge after the first threshold', () => {
    const onNudge = vi.fn()
    const escalator = new SilenceEscalator({
      nudgeAfterMs: 30_000,
      checkAfterMs: 60_000,
      pauseAfterMs: 90_000,
      onNudge,
      onCheck: vi.fn(),
      onPause: vi.fn(),
    })

    escalator.start()
    vi.advanceTimersByTime(30_000)

    expect(onNudge).toHaveBeenCalledTimes(1)
  })

  it('fires check after the second threshold', () => {
    const onCheck = vi.fn()
    const escalator = new SilenceEscalator({
      nudgeAfterMs: 30_000,
      checkAfterMs: 60_000,
      pauseAfterMs: 90_000,
      onNudge: vi.fn(),
      onCheck,
      onPause: vi.fn(),
    })

    escalator.start()
    vi.advanceTimersByTime(60_000)

    expect(onCheck).toHaveBeenCalledTimes(1)
  })

  it('fires pause after the third threshold', () => {
    const onPause = vi.fn()
    const escalator = new SilenceEscalator({
      nudgeAfterMs: 30_000,
      checkAfterMs: 60_000,
      pauseAfterMs: 90_000,
      onNudge: vi.fn(),
      onCheck: vi.fn(),
      onPause,
    })

    escalator.start()
    vi.advanceTimersByTime(90_000)

    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('reset clears all timers and restarts the thresholds', () => {
    const onNudge = vi.fn()
    const escalator = new SilenceEscalator({
      nudgeAfterMs: 30_000,
      checkAfterMs: 60_000,
      pauseAfterMs: 90_000,
      onNudge,
      onCheck: vi.fn(),
      onPause: vi.fn(),
    })

    escalator.start()
    vi.advanceTimersByTime(15_000)
    escalator.reset()
    vi.advanceTimersByTime(29_000)
    expect(onNudge).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1_000)
    expect(onNudge).toHaveBeenCalledTimes(1)
  })
})
