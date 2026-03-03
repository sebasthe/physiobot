import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import AuthForm from '@/components/auth/AuthForm'

describe('AuthForm', () => {
  it('renders email and password fields', () => {
    render(<AuthForm mode="login" onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/passwort/i)).toBeInTheDocument()
  })

  it('calls onSubmit with email and password', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<AuthForm mode="login" onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/passwort/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /anmelden/i }))
    expect(onSubmit).toHaveBeenCalledWith({ email: 'test@example.com', password: 'secret123' })
  })

  it('shows register button text when mode is register', () => {
    render(<AuthForm mode="register" onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /registrieren/i })).toBeInTheDocument()
  })
})
