'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AuthFormProps {
  mode: 'login' | 'register'
  onSubmit: (data: { email: string; password: string }) => void
  isLoading?: boolean
  error?: string
}

export default function AuthForm({ mode, onSubmit, isLoading, error }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ email, password })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="deine@email.de"
          autoComplete="email"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </div>
      {error && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'rgba(232,93,93,0.08)' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isLoading}
        className="btn-primary w-full rounded-xl py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? '...' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
      </button>
    </form>
  )
}
