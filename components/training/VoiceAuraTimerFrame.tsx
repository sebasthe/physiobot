'use client'

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { TurnState } from '@/lib/voice-module'

interface VoiceAuraTimerFrameProps {
  state: TurnState
  active: boolean
  intensity?: number
  className?: string
  children: ReactNode
}

interface AuraFrame {
  energy: number
  phase: number
}

interface AuraProfile {
  base: number
  wave: number
  jitter: number
  speed: number
  phaseSpeed: number
  response: number
}

interface AuraPalette {
  ring: string
  glow: string
  glowStrong: string
  edge: string
}

const AURA_VIEWBOX_SIZE = 200
const AURA_CENTER = AURA_VIEWBOX_SIZE / 2
const AURA_POINTS = 80
const FALLBACK_RING_CLASSNAME =
  'border-[8px] border-[rgba(110,235,220,0.86)] shadow-[0_0_48px_rgba(66,209,192,0.12)]'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function resolveAuraProfile(state: TurnState, active: boolean): AuraProfile {
  if (!active) {
    return {
      base: 0.18,
      wave: 0.03,
      jitter: 0.02,
      speed: 0.4,
      phaseSpeed: 0.5,
      response: 5,
    }
  }

  switch (state) {
    case 'listening':
      return {
        base: 0.6,
        wave: 0.16,
        jitter: 0.12,
        speed: 1.75,
        phaseSpeed: 1.9,
        response: 7,
      }
    case 'processing':
      return {
        base: 0.34,
        wave: 0.08,
        jitter: 0.04,
        speed: 0.8,
        phaseSpeed: 1.15,
        response: 6,
      }
    case 'speaking':
      return {
        base: 0.74,
        wave: 0.18,
        jitter: 0.08,
        speed: 1.2,
        phaseSpeed: 2.6,
        response: 8,
      }
    default:
      return {
        base: 0.22,
        wave: 0.04,
        jitter: 0.02,
        speed: 0.5,
        phaseSpeed: 0.6,
        response: 5,
      }
  }
}

function resolveAuraPalette(state: TurnState): AuraPalette {
  switch (state) {
    case 'listening':
      return {
        ring: 'rgba(240, 114, 74, 0.84)',
        glow: 'rgba(240, 114, 74, 0.24)',
        glowStrong: 'rgba(255, 208, 186, 0.48)',
        edge: '#FFD7C8',
      }
    case 'processing':
      return {
        ring: 'rgba(217, 154, 78, 0.82)',
        glow: 'rgba(217, 154, 78, 0.24)',
        glowStrong: 'rgba(255, 231, 189, 0.38)',
        edge: '#FFE9C0',
      }
    case 'speaking':
      return {
        ring: 'rgba(143, 232, 217, 0.92)',
        glow: 'rgba(102, 224, 207, 0.26)',
        glowStrong: 'rgba(213, 255, 248, 0.5)',
        edge: '#D4FFF8',
      }
    default:
      return {
        ring: 'rgba(110, 235, 220, 0.86)',
        glow: 'rgba(69, 205, 183, 0.16)',
        glowStrong: 'rgba(185, 255, 246, 0.36)',
        edge: '#D4FFF8',
      }
  }
}

function buildAuraPath(radiusX: number, radiusY: number, energy: number, phase: number, skew = 1) {
  const points = Array.from({ length: AURA_POINTS + 1 }, (_, index) => {
    const progress = index / AURA_POINTS
    const angle = progress * Math.PI * 2
    const wobble =
      Math.sin(angle * (3.2 * skew) + phase * 1.6) * 0.42
      + Math.sin(angle * (5.4 * skew) - phase * 1.1) * 0.24
      + Math.cos(angle * (2.1 * skew) + phase * 0.65) * 0.18
    const radialScale = 1 + wobble * energy * 0.18
    const horizontalScale = 1 + Math.cos(angle * 2 - phase * 0.45) * energy * 0.045
    const verticalScale = 1 + Math.sin(angle * 3 + phase * 0.3) * energy * 0.04

    const x = AURA_CENTER + Math.cos(angle) * radiusX * radialScale * horizontalScale
    const y = AURA_CENTER + Math.sin(angle) * radiusY * radialScale * verticalScale

    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  })

  return `${points.join(' ')} Z`
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  return prefersReducedMotion
}

function useSyntheticAuraFrame(state: TurnState, active: boolean, intensity?: number) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const profile = useMemo(() => resolveAuraProfile(state, active), [active, state])
  const [frame, setFrame] = useState<AuraFrame>({
    energy: intensity ?? profile.base,
    phase: 0,
  })
  const frameRef = useRef(frame)

  useEffect(() => {
    frameRef.current = frame
  }, [frame])

  useEffect(() => {
    if (prefersReducedMotion || !active) {
      const nextFrame = {
        energy: clamp(intensity ?? profile.base, 0.12, 1),
        phase: 0,
      }
      frameRef.current = nextFrame
      setFrame(nextFrame)
      return
    }

    let animationFrame = 0
    let lastTime = 0
    let bufferedTime = 0
    let phase = frameRef.current.phase
    let energy = frameRef.current.energy

    const updateFrame = (now: number) => {
      if (lastTime === 0) {
        lastTime = now
      }

      const deltaSeconds = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      bufferedTime += deltaSeconds

      const syntheticEnergy = intensity ?? clamp(
        profile.base
        + Math.sin(now * 0.0016 * profile.speed) * profile.wave
        + Math.sin(now * 0.0031 * profile.speed + 1.9) * profile.wave * 0.45
        + Math.cos(now * 0.0022 * (profile.speed + 0.4) - 0.8) * profile.jitter,
        0.14,
        1,
      )

      energy += (syntheticEnergy - energy) * Math.min(1, deltaSeconds * profile.response)
      phase += deltaSeconds * profile.phaseSpeed

      if (bufferedTime >= 1 / 30) {
        bufferedTime = 0
        const nextFrame = {
          energy,
          phase,
        }
        frameRef.current = nextFrame
        setFrame(nextFrame)
      }

      animationFrame = window.requestAnimationFrame(updateFrame)
    }

    animationFrame = window.requestAnimationFrame(updateFrame)

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [active, intensity, prefersReducedMotion, profile])

  return {
    ...frame,
    prefersReducedMotion,
  }
}

export default function VoiceAuraTimerFrame({
  state,
  active,
  intensity,
  className,
  children,
}: VoiceAuraTimerFrameProps) {
  const palette = useMemo(() => resolveAuraPalette(state), [state])
  const { energy, phase, prefersReducedMotion } = useSyntheticAuraFrame(state, active, intensity)
  const filterId = useId().replace(/:/g, '')
  const auraPathPrimary = useMemo(
    () => buildAuraPath(72, 72, energy, phase, 1),
    [energy, phase],
  )
  const auraPathSecondary = useMemo(
    () => buildAuraPath(67, 67, clamp(energy * 0.82, 0.1, 1), phase + 0.8, 1.35),
    [energy, phase],
  )
  const auraPathAccent = useMemo(
    () => buildAuraPath(76, 70, clamp(energy * 0.68, 0.1, 1), phase - 0.65, 0.8),
    [energy, phase],
  )

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      data-testid={active ? 'voice-aura-frame' : 'timer-ring-fallback'}
      data-voice-state={state}
    >
      {active ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[-8%] rounded-full blur-3xl"
            style={{
              background: `radial-gradient(circle, ${palette.glowStrong} 0%, ${palette.glow} 38%, transparent 68%)`,
              opacity: 0.72 + energy * 0.12,
              transform: `scale(${1.02 + energy * 0.04})`,
              animation: prefersReducedMotion ? 'none' : 'voice-aura-breathe 6s ease-in-out infinite',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[-3%] rounded-full blur-2xl"
            style={{
              background: `conic-gradient(from ${phase * 42}deg, transparent 0deg, ${palette.glowStrong} 90deg, transparent 190deg, ${palette.glow} 260deg, transparent 360deg)`,
              opacity: 0.44 + energy * 0.18,
              transform: `scale(${1.03 + energy * 0.025})`,
              animation: prefersReducedMotion ? 'none' : 'voice-aura-spin 24s linear infinite',
            }}
          />
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-[-4%] h-[108%] w-[108%]"
            viewBox={`0 0 ${AURA_VIEWBOX_SIZE} ${AURA_VIEWBOX_SIZE}`}
          >
            <defs>
              <filter id={`${filterId}-blur`} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4.8" />
              </filter>
              <linearGradient id={`${filterId}-primary`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={palette.edge} />
                <stop offset="48%" stopColor={palette.ring} />
                <stop offset="100%" stopColor={palette.glowStrong} />
              </linearGradient>
              <linearGradient id={`${filterId}-secondary`} x1="18%" y1="100%" x2="82%" y2="0%">
                <stop offset="0%" stopColor={palette.glowStrong} />
                <stop offset="54%" stopColor={palette.ring} />
                <stop offset="100%" stopColor={palette.edge} />
              </linearGradient>
            </defs>

            <path
              d={auraPathPrimary}
              fill="none"
              filter={`url(#${filterId}-blur)`}
              stroke={`url(#${filterId}-primary)`}
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.38 + energy * 0.24 }}
            />
            <path
              d={auraPathSecondary}
              fill="none"
              stroke={`url(#${filterId}-secondary)`}
              strokeWidth="5.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.6 + energy * 0.12 }}
            />
            <path
              d={auraPathAccent}
              fill="none"
              filter={`url(#${filterId}-blur)`}
              stroke={palette.glowStrong}
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.2 + energy * 0.16 }}
            />
            <circle
              cx={AURA_CENTER}
              cy={AURA_CENTER}
              r="68"
              fill="none"
              stroke={palette.ring}
              strokeWidth="1.5"
              style={{ opacity: 0.36 }}
            />
          </svg>
        </>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full"
          />
          <div
            aria-hidden="true"
            className={cn('absolute inset-0 rounded-full', FALLBACK_RING_CLASSNAME)}
          />
          <div
            aria-hidden="true"
            className="absolute inset-5 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(39, 116, 104, 0.16), transparent 68%)',
            }}
          />
        </>
      )}

      <div className="relative z-10 flex h-full w-full items-center justify-center rounded-full">
        {children}
      </div>
    </div>
  )
}
