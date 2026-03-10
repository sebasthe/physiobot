'use client'
import { useState } from 'react'
import { Lock, Mail } from 'lucide-react'
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
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-white/30" />
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="deine@email.de"
            autoComplete="email"
            className="pl-11"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-white/30" />
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="pl-11"
          />
        </div>
      </div>
      {error && (
        <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isLoading}
        className="btn-primary w-full rounded-2xl py-4 text-base disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? '...' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
      </button>
    </form>
  )
}
