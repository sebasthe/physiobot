import { describe, it, expect } from 'vitest'
import {
  FRAGMENT_SHADER,
  VERTEX_SHADER,
  UNIFORM_DEFS,
  type GlowUniforms,
} from '@/components/training/voice-glow/shader'

describe('voice-glow shader', () => {
  it('exports a non-empty fragment shader string', () => {
    expect(typeof FRAGMENT_SHADER).toBe('string')
    expect(FRAGMENT_SHADER.length).toBeGreaterThan(100)
    expect(FRAGMENT_SHADER).toContain('void main()')
  })

  it('exports a vertex shader string', () => {
    expect(typeof VERTEX_SHADER).toBe('string')
    expect(VERTEX_SHADER).toContain('gl_Position')
  })

  it('exports uniform definitions matching GlowUniforms keys', () => {
    const keys = Object.keys(UNIFORM_DEFS)
    expect(keys).toContain('uTime')
    expect(keys).toContain('uSpeed')
    expect(keys).toContain('uAmplitude')
    expect(keys).toContain('uFrequency')
    expect(keys).toContain('uScale')
    expect(keys).toContain('uBlur')
    expect(keys).toContain('uBrightness')
    expect(keys).toContain('uColor')
    expect(keys).toContain('uColorShift')
    expect(keys).toContain('uResolution')
  })

  it('each uniform def has type and default', () => {
    for (const [key, def] of Object.entries(UNIFORM_DEFS)) {
      expect(def).toHaveProperty('type')
      expect(def).toHaveProperty('default')
      expect(['1f', '2f', '3f']).toContain(def.type)
    }
  })
})
