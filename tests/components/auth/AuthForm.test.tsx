import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import AuthForm from '@/components/auth/AuthForm'
import { I18nProvider } from '@/components/i18n/I18nProvider'

function renderWithI18n(node: ReactNode) {
  return render(<I18nProvider initialLocale="de">{node}</I18nProvider>)
}

describe('AuthForm', () => {
  it('renders email and password fields', () => {
    renderWithI18n(<AuthForm mode="login" onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/e-?mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/passwort/i)).toBeInTheDocument()
  })

  it('calls onSubmit with email and password', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWithI18n(<AuthForm mode="login" onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText(/e-?mail/i), 'test@example.com')
    await user.type(screen.getByLabelText(/passwort/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /anmelden/i }))
    expect(onSubmit).toHaveBeenCalledWith({ email: 'test@example.com', password: 'secret123' })
  })

  it('shows register button text when mode is register', () => {
    renderWithI18n(<AuthForm mode="register" onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /registrieren/i })).toBeInTheDocument()
  })
})
