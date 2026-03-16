import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VoiceGlowFrame from '@/components/training/VoiceGlowFrame'

describe('VoiceGlowFrame', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('renders the static timer frame when glow is inactive', () => {
    render(
      <VoiceGlowFrame active={false} state="idle">
        <span>30</span>
      </VoiceGlowFrame>,
    )

    expect(screen.getByTestId('timer-ring-fallback')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('renders the animated glow frame when voice is active', () => {
    render(
      <VoiceGlowFrame active state="speaking">
        <span>12</span>
      </VoiceGlowFrame>,
    )

    expect(screen.getByTestId('voice-glow-frame')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})
