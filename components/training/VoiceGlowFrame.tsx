'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { TurnState } from '@/lib/voice-module'
import ShaderCanvas from './voice-glow/ShaderCanvas'
import { useGlowAnimation } from './voice-glow/useGlowAnimation'

interface VoiceGlowFrameProps {
  state: TurnState
  active: boolean
  intensity?: number
  className?: string
  children: ReactNode
}

const FALLBACK_RING_CLASSNAME =
  'border-[8px] border-[rgba(110,235,220,0.86)] shadow-[0_0_48px_rgba(66,209,192,0.12)]'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    mq.addListener(handler)
    return () => mq.removeListener(handler)
  }, [])

  return reduced
}

export default function VoiceGlowFrame({
  state,
  active,
  intensity,
  className,
  children,
}: VoiceGlowFrameProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const uniforms = useGlowAnimation(state, active && !prefersReducedMotion, intensity)

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      data-testid={active ? 'voice-glow-frame' : 'timer-ring-fallback'}
      data-voice-state={state}
    >
      {active && !prefersReducedMotion ? (
        <ShaderCanvas
          uniforms={uniforms}
          className="pointer-events-none absolute inset-[-12%] h-[124%] w-[124%]"
        />
      ) : (
        <>
          <div aria-hidden="true" className="absolute inset-0 rounded-full" />
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
