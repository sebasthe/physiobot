'use client'
import { useState } from 'react'
import { AlertTriangle, Calendar, Download, Eye, Mail, ShieldPlus, Trash2, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useSoftNavigation } from '@/lib/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Language, PrivacyConsent, Schedule } from '@/lib/types'
import { saveUserLanguagePreference } from '@/lib/user-personality'

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
  initialPrivacyConsent: PrivacyConsent
  physioInfo: PhysioInfo | null
  isSelfCreatedPlan: boolean
}

interface MemoryItem {
  id: string
  content: string
  dataClass: 'A' | 'B' | 'C' | 'D'
  category?: string | null
  createdAt?: string | null
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
  initialPrivacyConsent,
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
  const [privacyConsent, setPrivacyConsent] = useState<PrivacyConsent>(initialPrivacyConsent)
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [showMemories, setShowMemories] = useState(false)

  const [scheduleMessage, setScheduleMessage] = useState<string>()
  const [languageMessage, setLanguageMessage] = useState<string>()
  const [profileMessage, setProfileMessage] = useState<string>()
  const [emailMessage, setEmailMessage] = useState<string>()
  const [passwordMessage, setPasswordMessage] = useState<string>()
  const [privacyMessage, setPrivacyMessage] = useState<string>()
  const [memoryMessage, setMemoryMessage] = useState<string>()
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [languageLoading, setLanguageLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [privacyLoading, setPrivacyLoading] = useState(false)
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [accountDeletionLoading, setAccountDeletionLoading] = useState(false)

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
    const previousLanguage = language
    setLanguage(newLanguage)
    setLanguageLoading(true)
    setLanguageMessage(undefined)

    const { error } = await saveUserLanguagePreference(supabase, userId, newLanguage)

    if (error) {
      setLanguage(previousLanguage)
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

  const savePrivacyConsent = async (nextConsent: PrivacyConsent) => {
    setPrivacyConsent(nextConsent)
    setPrivacyLoading(true)
    setPrivacyMessage(undefined)

    const { error } = await supabase
      .from('profiles')
      .update({ privacy_consent: nextConsent })
      .eq('id', userId)

    if (error) {
      setPrivacyConsent(privacyConsent)
      setPrivacyMessage('Datenschutz-Einstellung konnte nicht gespeichert werden.')
    } else {
      setPrivacyMessage('Datenschutz-Einstellung gespeichert.')
    }

    setPrivacyLoading(false)
  }

  const loadMemories = async () => {
    setMemoryLoading(true)
    setMemoryMessage(undefined)

    try {
      const response = await fetch('/api/privacy/memories', {
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({})) as { memories?: MemoryItem[]; error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Erinnerungen konnten nicht geladen werden.')
      }

      setMemories(payload.memories ?? [])
      setShowMemories(true)
      if ((payload.memories ?? []).length === 0) {
        setMemoryMessage('Keine gespeicherten Erinnerungen gefunden.')
      }
    } catch (error) {
      setMemoryMessage(error instanceof Error ? error.message : 'Erinnerungen konnten nicht geladen werden.')
    } finally {
      setMemoryLoading(false)
    }
  }

  const clearMemories = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Alle gespeicherten Erinnerungen wirklich loeschen?')) {
      return
    }

    setMemoryLoading(true)
    setMemoryMessage(undefined)

    try {
      const response = await fetch('/api/privacy/memories', {
        method: 'DELETE',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Erinnerungen konnten nicht geloescht werden.')
      }

      setMemories([])
      setShowMemories(true)
      setMemoryMessage('Erinnerungen geloescht.')
    } catch (error) {
      setMemoryMessage(error instanceof Error ? error.message : 'Erinnerungen konnten nicht geloescht werden.')
    } finally {
      setMemoryLoading(false)
    }
  }

  const deleteAccountData = async () => {
    if (
      typeof window !== 'undefined'
      && !window.confirm('Konto und gespeicherte Daten jetzt loeschen? Dieser Schritt ist nicht rueckgaengig.')
    ) {
      return
    }

    setAccountDeletionLoading(true)
    setPrivacyMessage(undefined)

    try {
      const response = await fetch('/api/privacy/delete', {
        method: 'POST',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Kontodaten konnten nicht geloescht werden.')
      }

      router.push('/auth/login')
    } catch (error) {
      setPrivacyMessage(error instanceof Error ? error.message : 'Kontodaten konnten nicht geloescht werden.')
    } finally {
      setAccountDeletionLoading(false)
    }
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

      <section className="glass-card rounded-[28px] border-white/5 md:self-start">
        <div className="p-6">
          <h2 className="font-display text-xl uppercase tracking-tight text-white">Datenschutz</h2>
        </div>
        <div className="space-y-5 px-6 pb-6 pt-0">
          <div className="space-y-3">
            <p className="text-xs text-white/40">
              Lege fest, wie viel persoenlichen Kontext PhysioBot zwischen Sessions behalten darf.
            </p>
            <div className="grid gap-3">
              {[
                { value: 'full' as PrivacyConsent, label: 'Voll', hint: 'Coach- und Gesundheitskontext bleibt verfuegbar.' },
                { value: 'minimal' as PrivacyConsent, label: 'Minimal', hint: 'Nur betriebliche Telemetrie bleibt erhalten.' },
                { value: 'none' as PrivacyConsent, label: 'Keine Speicherung', hint: 'Keine neuen persoenlichen Erinnerungen speichern.' },
              ].map(option => {
                const active = privacyConsent === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={privacyLoading}
                    onClick={() => savePrivacyConsent(option.value)}
                    className={`rounded-2xl border px-4 py-4 text-left transition-all disabled:opacity-60 ${
                      active
                        ? 'border-[var(--accent)] bg-[rgba(42,157,138,0.12)]'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="text-sm font-semibold text-white">{option.label}</div>
                    <div className="mt-1 text-xs text-white/45">{option.hint}</div>
                  </button>
                )
              })}
            </div>
            {privacyMessage && <p className="text-xs text-white/40">{privacyMessage}</p>}
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={loadMemories}
                disabled={memoryLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/8 disabled:opacity-60"
              >
                <Eye size={16} />
                {memoryLoading ? 'Laden...' : 'Erinnerungen ansehen'}
              </button>
              <button
                type="button"
                onClick={clearMemories}
                disabled={memoryLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/8 disabled:opacity-60"
              >
                <Trash2 size={16} />
                Erinnerungen loeschen
              </button>
              <a
                href="/api/privacy/export"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/8"
              >
                <Download size={16} />
                Daten exportieren
              </a>
              <button
                type="button"
                onClick={deleteAccountData}
                disabled={accountDeletionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(231,111,81,0.45)] bg-[rgba(231,111,81,0.12)] py-4 text-sm font-semibold text-[rgb(255,194,178)] transition-colors hover:bg-[rgba(231,111,81,0.18)] disabled:opacity-60"
              >
                <AlertTriangle size={16} />
                {accountDeletionLoading ? 'Loeschen...' : 'Konto loeschen'}
              </button>
            </div>
            {memoryMessage && <p className="text-xs text-white/40">{memoryMessage}</p>}
            {showMemories && (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                {memories.length === 0 ? (
                  <p className="text-sm text-white/45">Keine Erinnerungen verfuegbar.</p>
                ) : (
                  memories.map(memory => (
                    <div key={memory.id} className="rounded-xl border border-white/10 bg-[rgba(0,0,0,0.18)] p-4">
                      <div className="mb-2 flex items-center justify-between gap-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getDataClassBadgeClasses(memory.dataClass)}`}>
                          Klasse {memory.dataClass}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                          {memory.createdAt ? new Date(memory.createdAt).toLocaleDateString() : 'Ohne Datum'}
                        </span>
                      </div>
                      <p className="text-sm text-white/80">{memory.content}</p>
                      {memory.category && <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-white/35">{memory.category}</p>}
                    </div>
                  ))
                )}
              </div>
            )}
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

function getDataClassBadgeClasses(dataClass: MemoryItem['dataClass']) {
  if (dataClass === 'A') return 'bg-[rgba(38,70,83,0.35)] text-[rgb(155,213,231)]'
  if (dataClass === 'B') return 'bg-[rgba(42,157,138,0.18)] text-[rgb(127,239,214)]'
  if (dataClass === 'C') return 'bg-[rgba(244,162,97,0.16)] text-[rgb(255,212,162)]'
  return 'bg-[rgba(231,111,81,0.16)] text-[rgb(255,194,178)]'
}
