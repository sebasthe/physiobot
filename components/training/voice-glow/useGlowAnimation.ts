import { useMemo } from 'react'
import type { TurnState } from '@/lib/voice-module'
import type { GlowUniforms } from './shader'

interface GlowProfile {
  speed: number
  amplitude: number
  frequency: number
  scale: number
  blur: number
  brightness: number
}

const PROFILES: Record<string, GlowProfile> = {
  idle: { speed: 8, amplitude: 0.4, frequency: 0.35, scale: 0.22, blur: 1.0, brightness: 0.5 },
  listening: { speed: 20, amplitude: 0.65, frequency: 0.7, scale: 0.28, blur: 0.6, brightness: 1.4 },
  processing: { speed: 28, amplitude: 0.35, frequency: 0.9, scale: 0.25, blur: 0.8, brightness: 1.2 },
  speaking: { speed: 55, amplitude: 0.6, frequency: 1.1, scale: 0.3, blur: 0.4, brightness: 1.6 },
}

const INACTIVE_PROFILE: GlowProfile = {
  speed: 6, amplitude: 0.25, frequency: 0.3, scale: 0.2, blur: 1.2, brightness: 0.4,
}

const ACCENT_COLOR: [number, number, number] = [0.165, 0.616, 0.541]

const STATE_COLORS: Record<string, [number, number, number]> = {
  idle: ACCENT_COLOR,
  listening: [0.94, 0.45, 0.29],
  processing: [0.85, 0.60, 0.31],
  speaking: ACCENT_COLOR,
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

export type AnimatedGlowUniforms = Omit<GlowUniforms, 'uTime' | 'uResolution'>

export function useGlowAnimation(
  state: TurnState,
  active: boolean,
  intensity?: number,
): AnimatedGlowUniforms {
  return useMemo(() => {
    const profile = active ? (PROFILES[state] ?? PROFILES.idle) : INACTIVE_PROFILE
    const color = active ? (STATE_COLORS[state] ?? ACCENT_COLOR) : ACCENT_COLOR

    const intensityFactor = intensity != null ? clamp(intensity, 0, 1) : 1
    const effectiveScale = profile.scale * (0.7 + intensityFactor * 0.6)
    const effectiveBrightness = profile.brightness * (0.6 + intensityFactor * 0.4)

    return {
      uSpeed: profile.speed,
      uAmplitude: profile.amplitude,
      uFrequency: profile.frequency,
      uScale: effectiveScale,
      uBlur: profile.blur,
      uBrightness: effectiveBrightness,
      uColor: color,
      uColorShift: active ? 0.15 : 0.05,
    }
  }, [state, active, intensity])
}
