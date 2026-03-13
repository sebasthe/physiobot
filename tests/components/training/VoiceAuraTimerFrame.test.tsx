import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VoiceAuraTimerFrame from '@/components/training/VoiceAuraTimerFrame'

describe('VoiceAuraTimerFrame', () => {
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

  it('renders the static timer frame when aura is inactive', () => {
    render(
      <VoiceAuraTimerFrame active={false} state="idle">
        <span>30</span>
      </VoiceAuraTimerFrame>,
    )

    expect(screen.getByTestId('timer-ring-fallback')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('renders the animated aura frame when voice is active', () => {
    render(
      <VoiceAuraTimerFrame active state="speaking">
        <span>12</span>
      </VoiceAuraTimerFrame>,
    )

    expect(screen.getByTestId('voice-aura-frame')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})
