import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAuraAnimation } from '@/components/training/aura/useAuraAnimation'
import type { TurnState } from '@/lib/voice-module'

beforeEach(() => {
  vi.useFakeTimers()
})

describe('useAuraAnimation', () => {
  it('returns shader uniforms object', () => {
    const { result } = renderHook(() => useAuraAnimation('idle', false))
    const u = result.current

    expect(u).toHaveProperty('uSpeed')
    expect(u).toHaveProperty('uAmplitude')
    expect(u).toHaveProperty('uFrequency')
    expect(u).toHaveProperty('uScale')
    expect(u).toHaveProperty('uBrightness')
    expect(u).toHaveProperty('uColor')
    expect(u).toHaveProperty('uColorShift')
    expect(u).toHaveProperty('uBlur')
  })

  it('returns low energy values when inactive', () => {
    const { result } = renderHook(() => useAuraAnimation('idle', false))
    expect(result.current.uSpeed).toBeLessThan(15)
    expect(result.current.uBrightness).toBeLessThanOrEqual(0.6)
  })

  it('returns higher energy for speaking state', () => {
    const { result } = renderHook(() => useAuraAnimation('speaking', true))
    expect(result.current.uSpeed).toBeGreaterThan(30)
    expect(result.current.uBrightness).toBeGreaterThan(1.0)
  })

  it('returns different profiles for each active state', () => {
    const states: TurnState[] = ['idle', 'listening', 'processing', 'speaking']
    const results = states.map(state => {
      const { result } = renderHook(() => useAuraAnimation(state, true))
      return result.current
    })

    const speeds = results.map(r => r.uSpeed)
    const uniqueSpeeds = new Set(speeds)
    expect(uniqueSpeeds.size).toBe(states.length)
  })

  it('uses accent color by default', () => {
    const { result } = renderHook(() => useAuraAnimation('idle', false))
    const [r, g, b] = result.current.uColor
    expect(r).toBeCloseTo(0.165, 1)
    expect(g).toBeCloseTo(0.616, 1)
    expect(b).toBeCloseTo(0.541, 1)
  })

  it('respects external intensity override', () => {
    const { result: low } = renderHook(() => useAuraAnimation('speaking', true, 0.1))
    const { result: high } = renderHook(() => useAuraAnimation('speaking', true, 0.9))
    expect(high.current.uScale).toBeGreaterThan(low.current.uScale)
  })
})
