'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import type { Schedule } from '@/lib/types'

interface PhysioInfo {
  id: string
  name: string | null
  address: string | null
}

interface Props {
  userId: string
  initialEmail: string
  initialName: string
  initialSchedule: Schedule | null
  physioInfo: PhysioInfo | null
  isSelfCreatedPlan: boolean
}

const WEEK_DAYS = [
  { day: 1, label: 'Mo' },
  { day: 2, label: 'Di' },
  { day: 3, label: 'Mi' },
  { day: 4, label: 'Do' },
  { day: 5, label: 'Fr' },
  { day: 6, label: 'Sa' },
  { day: 0, label: 'So' },
]

function normalizeTime(timeValue: string | undefined) {
  if (!timeValue) return '07:30'
  return timeValue.slice(0, 5)
}

export default function SettingsClient({
  userId,
  initialEmail,
  initialName,
  initialSchedule,
  physioInfo,
  isSelfCreatedPlan,
}: Props) {
  const supabase = createClient()

  const [selectedDays, setSelectedDays] = useState<number[]>(initialSchedule?.days ?? [1, 3, 5])
  const [notifyTime, setNotifyTime] = useState(normalizeTime(initialSchedule?.notify_time))
  const [timezone, setTimezone] = useState(
    initialSchedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Berlin'
  )
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [scheduleMessage, setScheduleMessage] = useState<string>()
  const [profileMessage, setProfileMessage] = useState<string>()
  const [emailMessage, setEmailMessage] = useState<string>()
  const [passwordMessage, setPasswordMessage] = useState<string>()
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)

  const toggleDay = (day: number) => {
    setSelectedDays(prev => {
      if (prev.includes(day)) return prev.filter(item => item !== day)
      return [...prev, day].sort((a, b) => a - b)
    })
  }

  const saveSchedule = async () => {
    if (selectedDays.length === 0) {
      setScheduleMessage('Bitte mindestens einen Trainingstag auswählen.')
      return
    }
    setScheduleLoading(true)
    setScheduleMessage(undefined)

    const { error } = await supabase
      .from('schedules')
      .upsert(
        {
          user_id: userId,
          days: selectedDays,
          notify_time: notifyTime,
          timezone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      setScheduleMessage('Rhythmus konnte nicht gespeichert werden.')
    } else {
      setScheduleMessage('Rhythmus gespeichert.')
    }
    setScheduleLoading(false)
  }

  const saveName = async () => {
    setProfileLoading(true)
    setProfileMessage(undefined)

    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim() || null })
      .eq('id', userId)

    if (error) {
      setProfileMessage('Name konnte nicht aktualisiert werden.')
    } else {
      setProfileMessage('Name gespeichert.')
    }
    setProfileLoading(false)
  }

  const saveEmail = async () => {
    setEmailLoading(true)
    setEmailMessage(undefined)
    const { error } = await supabase.auth.updateUser({ email: email.trim() })

    if (error) {
      setEmailMessage(error.message)
    } else {
      setEmailMessage('Bestätigungs-Mail gesendet. Bitte neues Postfach prüfen.')
    }
    setEmailLoading(false)
  }

  const savePassword = async () => {
    if (newPassword.length < 8) {
      setPasswordMessage('Passwort muss mindestens 8 Zeichen haben.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('Passwort-Bestätigung stimmt nicht überein.')
      return
    }

    setPasswordLoading(true)
    setPasswordMessage(undefined)
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setPasswordMessage(error.message)
    } else {
      setPasswordMessage('Passwort aktualisiert.')
      setNewPassword('')
      setConfirmPassword('')
    }
    setPasswordLoading(false)
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-1 text-lg font-bold text-[var(--text-primary)]">Trainingsrhythmus</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Lege fest, wann du trainierst. 5 Minuten vorher kann eine Erinnerung erscheinen.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {WEEK_DAYS.map(({ day, label }) => {
            const active = selectedDays.includes(day)
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className="rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
                style={{
                  borderColor: active ? 'var(--teal)' : 'var(--border)',
                  background: active ? 'var(--teal-light)' : 'var(--sand)',
                  color: active ? 'var(--teal)' : 'var(--text-secondary)',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="notifyTime" className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Uhrzeit
            </label>
            <Input id="notifyTime" type="time" value={notifyTime} onChange={event => setNotifyTime(event.target.value)} />
          </div>
          <div>
            <label htmlFor="timezone" className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Zeitzone
            </label>
            <Input id="timezone" value={timezone} onChange={event => setTimezone(event.target.value)} />
          </div>
        </div>

        <button
          type="button"
          onClick={saveSchedule}
          disabled={scheduleLoading}
          className="btn-primary mt-4 w-full rounded-xl py-3 text-sm disabled:opacity-60"
        >
          {scheduleLoading ? 'Speichern...' : 'Rhythmus speichern'}
        </button>
        {scheduleMessage && (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">{scheduleMessage}</p>
        )}
      </section>

      <section className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 text-lg font-bold text-[var(--text-primary)]">Konto</h2>

        <div className="space-y-2">
          <label htmlFor="name" className="block text-xs font-semibold text-[var(--text-secondary)]">Name</label>
          <Input id="name" value={name} onChange={event => setName(event.target.value)} placeholder="Dein Name" />
          <button
            type="button"
            onClick={saveName}
            disabled={profileLoading}
            className="rounded-xl border border-[var(--border)] bg-[var(--sand)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
          >
            {profileLoading ? 'Speichern...' : 'Name speichern'}
          </button>
          {profileMessage && <p className="text-xs text-[var(--text-secondary)]">{profileMessage}</p>}
        </div>

        <div className="mt-5 space-y-2">
          <label htmlFor="email" className="block text-xs font-semibold text-[var(--text-secondary)]">E-Mail</label>
          <Input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="du@email.de" />
          <button
            type="button"
            onClick={saveEmail}
            disabled={emailLoading}
            className="rounded-xl border border-[var(--border)] bg-[var(--sand)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
          >
            {emailLoading ? 'Speichern...' : 'E-Mail ändern'}
          </button>
          {emailMessage && <p className="text-xs text-[var(--text-secondary)]">{emailMessage}</p>}
        </div>

        <div className="mt-5 space-y-2">
          <label htmlFor="password" className="block text-xs font-semibold text-[var(--text-secondary)]">Neues Passwort</label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            placeholder="Mindestens 8 Zeichen"
          />
          <Input
            id="passwordConfirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={event => setConfirmPassword(event.target.value)}
            placeholder="Passwort wiederholen"
          />
          <button
            type="button"
            onClick={savePassword}
            disabled={passwordLoading}
            className="rounded-xl border border-[var(--border)] bg-[var(--sand)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
          >
            {passwordLoading ? 'Speichern...' : 'Passwort ändern'}
          </button>
          {passwordMessage && <p className="text-xs text-[var(--text-secondary)]">{passwordMessage}</p>}
        </div>
      </section>

      <section className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-2 text-lg font-bold text-[var(--text-primary)]">Zugeordneter Physiotherapeut</h2>
        {physioInfo ? (
          <div className="space-y-2 text-sm text-[var(--text-primary)]">
            <p><span className="font-semibold">ID:</span> {physioInfo.id}</p>
            <p><span className="font-semibold">Name:</span> {physioInfo.name ?? 'Nicht hinterlegt'}</p>
            <p><span className="font-semibold">Anschrift:</span> {physioInfo.address ?? 'Nicht hinterlegt'}</p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            {isSelfCreatedPlan
              ? 'Du hast deinen Plan selbst erstellt (AI-gestützt).'
              : 'Derzeit ist kein Physiotherapeut zugeordnet.'}
          </p>
        )}
      </section>
    </div>
  )
}
