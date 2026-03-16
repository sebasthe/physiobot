'use client'
import { useState } from 'react'
import { Calendar, Mail, ShieldPlus, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useSoftNavigation } from '@/lib/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Language, Schedule } from '@/lib/types'

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
  initialLanguage: Language
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
  initialLanguage,
  physioInfo,
  isSelfCreatedPlan,
}: Props) {
  const supabase = createClient()
  const router = useSoftNavigation()

  const [selectedDays, setSelectedDays] = useState<number[]>(initialSchedule?.days ?? [1, 3, 5])
  const [notifyTime, setNotifyTime] = useState(normalizeTime(initialSchedule?.notify_time))
  const [timezone, setTimezone] = useState(
    initialSchedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Berlin'
  )
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [language, setLanguage] = useState<Language>(initialLanguage)

  const [scheduleMessage, setScheduleMessage] = useState<string>()
  const [languageMessage, setLanguageMessage] = useState<string>()
  const [profileMessage, setProfileMessage] = useState<string>()
  const [emailMessage, setEmailMessage] = useState<string>()
  const [passwordMessage, setPasswordMessage] = useState<string>()
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [languageLoading, setLanguageLoading] = useState(false)
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

  const saveLanguage = async (newLanguage: Language) => {
    setLanguage(newLanguage)
    setLanguageLoading(true)
    setLanguageMessage(undefined)

    const { error } = await supabase
      .from('user_personality')
      .upsert(
        { user_id: userId, language: newLanguage },
        { onConflict: 'user_id' }
      )

    if (error) {
      setLanguage(language)
      setLanguageMessage('Sprache konnte nicht gespeichert werden.')
    } else {
      setLanguageMessage(newLanguage === 'de' ? 'Sprache gespeichert.' : 'Language saved.')
    }
    setLanguageLoading(false)
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
    <div className="space-y-8 md:grid md:grid-cols-2 md:gap-8 md:space-y-0">
      <section className="glass-card rounded-[28px] border-white/5 md:self-start">
        <div className="p-6">
          <h2 className="font-display text-xl uppercase tracking-tight text-white">Trainingsrhythmus</h2>
        </div>
        <div className="px-6 pb-6 pt-0">
          <div className="mb-6 flex flex-wrap gap-2">
            {WEEK_DAYS.map(({ day, label }) => {
              const active = selectedDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border text-xs font-semibold transition-all ${
                    active ? 'border-[var(--accent)] bg-[rgba(42,157,138,0.12)] text-[var(--accent)]' : 'border-white/10 text-white/40'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="notifyTime" className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                Uhrzeit
              </label>
              <Input id="notifyTime" type="time" value={notifyTime} onChange={event => setNotifyTime(event.target.value)} className="rounded-xl bg-[var(--surface)] border-white/5 p-3 h-auto" />
            </div>
            <div className="space-y-2">
              <label htmlFor="timezone" className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                Zeitzone
              </label>
              <Input id="timezone" value={timezone} onChange={event => setTimezone(event.target.value)} className="rounded-xl bg-[var(--surface)] border-white/5 p-3 h-auto" />
            </div>
          </div>
          <button
            type="button"
            onClick={saveSchedule}
            disabled={scheduleLoading}
            className="mt-6 w-full rounded-xl bg-[var(--secondary)] py-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
          >
            {scheduleLoading ? 'Speichern...' : 'Rhythmus speichern'}
          </button>
          {scheduleMessage && <p className="mt-3 text-xs text-white/40">{scheduleMessage}</p>}
        </div>
      </section>

      <section className="glass-card rounded-[28px] border-white/5 md:self-start">
        <div className="p-6">
          <h2 className="font-display text-xl uppercase tracking-tight text-white">Coach-Sprache</h2>
        </div>
        <div className="px-6 pb-6 pt-0">
          <p className="mb-4 text-xs text-white/40">
            {language === 'de'
              ? 'In welcher Sprache soll dein Coach mit dir sprechen?'
              : 'Which language should your coach use?'}
          </p>
          <div className="flex gap-3">
            {([
              { value: 'de' as Language, label: 'Deutsch', flag: '🇩🇪' },
              { value: 'en' as Language, label: 'English', flag: '🇬🇧' },
            ]).map(({ value, label, flag }) => {
              const active = language === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={languageLoading}
                  onClick={() => saveLanguage(value)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-4 text-sm font-semibold transition-all disabled:opacity-60 ${
                    active
                      ? 'border-[var(--accent)] bg-[rgba(42,157,138,0.12)] text-[var(--accent)]'
                      : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
                  }`}
                >
                  <span>{flag}</span>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
          {languageMessage && <p className="mt-3 text-xs text-white/40">{languageMessage}</p>}
        </div>
      </section>

      <section className="glass-card rounded-[28px] border-white/5 md:self-start">
        <div className="p-6">
          <h2 className="font-display text-xl uppercase tracking-tight text-white">Erfolge</h2>
        </div>
        <div className="px-6 pb-6 pt-0">
          <div className="grid grid-cols-4 gap-4">
            {[
              { icon: Calendar, label: 'Rhythmus' },
              { icon: ShieldPlus, label: 'Routine' },
              { icon: User, label: 'Coach' },
              { icon: Mail, label: 'Profil' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-white/5 text-[var(--accent)]">
                  <Icon size={18} />
                </div>
                <span className="text-center text-[8px] uppercase leading-tight tracking-[0.16em] text-white/40">{label}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => router.push('/badges')}
            className="mt-6 w-full rounded-xl border border-white/5 bg-white/5 py-5 text-sm font-semibold text-white transition-colors hover:bg-white/8"
          >
            Badges ansehen
          </button>
        </div>
      </section>

      <section className="glass-card rounded-[28px] border-white/5 md:self-start">
        <div className="p-6">
          <h2 className="font-display text-xl uppercase tracking-tight text-white">Konto</h2>
        </div>
        <div className="space-y-5 px-6 pb-6 pt-0">
          <div className="space-y-2">
            <label htmlFor="name" className="text-[10px] uppercase tracking-[0.18em] text-white/40">Name</label>
            <Input id="name" value={name} onChange={event => setName(event.target.value)} placeholder="Dein Name" className="rounded-xl bg-[var(--surface)] border-white/5 p-3 h-auto" />
            <button
              type="button"
              onClick={saveName}
              disabled={profileLoading}
              className="w-full rounded-xl bg-[var(--secondary)] py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
            >
              {profileLoading ? 'Speichern...' : 'Name speichern'}
            </button>
            {profileMessage && <p className="text-xs text-white/40">{profileMessage}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-[10px] uppercase tracking-[0.18em] text-white/40">Email</label>
            <Input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="du@email.de" className="rounded-xl bg-[var(--surface)] border-white/5 p-3 h-auto" />
            <button
              type="button"
              onClick={saveEmail}
              disabled={emailLoading}
              className="w-full rounded-xl bg-[var(--secondary)] py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
            >
              {emailLoading ? 'Speichern...' : 'E-Mail ändern'}
            </button>
            {emailMessage && <p className="text-xs text-white/40">{emailMessage}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-[10px] uppercase tracking-[0.18em] text-white/40">Neues Passwort</label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              placeholder="Mindestens 8 Zeichen"
              className="rounded-xl bg-[var(--surface)] border-white/5 p-3 h-auto"
            />
            <Input
              id="passwordConfirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder="Passwort wiederholen"
              className="rounded-xl bg-[var(--surface)] border-white/5 p-3 h-auto"
            />
            <button
              type="button"
              onClick={savePassword}
              disabled={passwordLoading}
              className="w-full rounded-xl bg-[var(--secondary)] py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
            >
              {passwordLoading ? 'Speichern...' : 'Passwort ändern'}
            </button>
            {passwordMessage && <p className="text-xs text-white/40">{passwordMessage}</p>}
          </div>
        </div>
      </section>

      <section className="glass-card rounded-[28px] border-white/5 p-6 md:self-start">
        <h2 className="mb-2 font-display text-xl uppercase tracking-tight text-white">Physiotherapie</h2>
        {physioInfo ? (
          <div className="space-y-2 text-sm text-white/75">
            <p><span className="font-semibold text-white">ID:</span> {physioInfo.id}</p>
            <p><span className="font-semibold text-white">Name:</span> {physioInfo.name ?? 'Nicht hinterlegt'}</p>
            <p><span className="font-semibold text-white">Anschrift:</span> {physioInfo.address ?? 'Nicht hinterlegt'}</p>
          </div>
        ) : (
          <p className="text-sm text-white/40">
            {isSelfCreatedPlan
              ? 'Du hast deinen Plan selbst erstellt und nutzt aktuell keinen zugeordneten Physio.'
              : 'Derzeit ist kein Physiotherapeut zugeordnet.'}
          </p>
        )}
      </section>
    </div>
  )
}
