'use client'
import { useMemo, useState } from 'react'
import { AlertTriangle, Calendar, Download, Eye, Mail, ShieldPlus, Trash2, User } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Input } from '@/components/ui/input'
import { persistLanguageCookie } from '@/lib/i18n/client'
import { toLocaleTag } from '@/lib/i18n/config'
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
  const { locale, setLocale } = useI18n()
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
  const weekDays = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(toLocaleTag(locale), { weekday: 'short' })
    const monday = new Date(Date.UTC(2024, 0, 1))
    return [0, 1, 2, 3, 4, 5, 6].map(offset => {
      const date = new Date(monday)
      date.setUTCDate(monday.getUTCDate() + offset)
      const jsDay = offset === 6 ? 0 : offset + 1
      return {
        day: jsDay,
        label: formatter.format(date).replace('.', ''),
      }
    })
  }, [locale])
  const copy = locale === 'en'
    ? {
        scheduleTitle: 'Training rhythm',
        timeLabel: 'Time',
        timezoneLabel: 'Time zone',
        saveSchedule: 'Save rhythm',
        selectTrainingDay: 'Please select at least one training day.',
        scheduleError: 'Could not save rhythm.',
        scheduleSaved: 'Rhythm saved.',
        languageTitle: 'App language',
        languageCopy: 'Choose the language for the interface, training plan, and coaching voice. The whole app switches together.',
        achievementsTitle: 'Shortcuts',
        achievementRhythm: 'Rhythm',
        achievementRoutine: 'Routine',
        achievementCoach: 'Coach',
        achievementProfile: 'Profile',
        viewBadges: 'View badges',
        accountTitle: 'Account',
        nameLabel: 'Name',
        namePlaceholder: 'Your name',
        saveName: 'Save name',
        nameError: 'Could not update name.',
        nameSaved: 'Name saved.',
        emailLabel: 'Email',
        emailPlaceholder: 'you@email.com',
        saveEmail: 'Change email',
        emailSaved: 'Confirmation email sent. Please check your inbox.',
        passwordLabel: 'New password',
        passwordPlaceholder: 'At least 8 characters',
        passwordConfirmPlaceholder: 'Repeat password',
        savePassword: 'Change password',
        passwordTooShort: 'Password must be at least 8 characters.',
        passwordMismatch: 'Password confirmation does not match.',
        passwordSaved: 'Password updated.',
        privacyTitle: 'Privacy',
        privacyCopy: 'Choose how much personal context PhysioBot may retain between sessions.',
        privacyFull: 'Full',
        privacyFullHint: 'Coaching and health context stays available.',
        privacyMinimal: 'Minimal',
        privacyMinimalHint: 'Only operational telemetry stays available.',
        privacyNone: 'No storage',
        privacyNoneHint: 'Do not store new personal memories.',
        privacyError: 'Could not save privacy setting.',
        privacySaved: 'Privacy setting saved.',
        loadMemories: 'View memories',
        clearMemories: 'Delete memories',
        exportData: 'Export data',
        deleteAccount: 'Delete account',
        loading: 'Loading...',
        deleting: 'Deleting...',
        noMemoriesFound: 'No stored memories found.',
        memoriesLoadError: 'Could not load memories.',
        clearMemoriesConfirm: 'Delete all stored memories?',
        memoriesDeleted: 'Memories deleted.',
        memoriesDeleteError: 'Could not delete memories.',
        noMemoriesAvailable: 'No memories available.',
        classLabel: 'Class',
        noDate: 'No date',
        deleteAccountConfirm: 'Delete account and stored data now? This step cannot be undone.',
        deleteAccountError: 'Could not delete account data.',
        physioTitle: 'Physiotherapy',
        physioId: 'ID',
        physioName: 'Name',
        physioAddress: 'Address',
        notProvided: 'Not provided',
        selfCreatedPlan: 'You created your plan yourself and currently have no assigned physio.',
        noPhysioAssigned: 'No physiotherapist is currently assigned.',
      }
    : {
        scheduleTitle: 'Trainingsrhythmus',
        timeLabel: 'Uhrzeit',
        timezoneLabel: 'Zeitzone',
        saveSchedule: 'Rhythmus speichern',
        selectTrainingDay: 'Bitte mindestens einen Trainingstag auswählen.',
        scheduleError: 'Rhythmus konnte nicht gespeichert werden.',
        scheduleSaved: 'Rhythmus gespeichert.',
        languageTitle: 'App-Sprache',
        languageCopy: 'Waehle die Sprache fuer Oberflaeche, Trainingsplan und Coaching-Stimme. Die ganze App wechselt gemeinsam.',
        achievementsTitle: 'Erfolge',
        achievementRhythm: 'Rhythmus',
        achievementRoutine: 'Routine',
        achievementCoach: 'Coach',
        achievementProfile: 'Profil',
        viewBadges: 'Badges ansehen',
        accountTitle: 'Konto',
        nameLabel: 'Name',
        namePlaceholder: 'Dein Name',
        saveName: 'Name speichern',
        nameError: 'Name konnte nicht aktualisiert werden.',
        nameSaved: 'Name gespeichert.',
        emailLabel: 'E-Mail',
        emailPlaceholder: 'du@email.de',
        saveEmail: 'E-Mail ändern',
        emailSaved: 'Bestätigungs-Mail gesendet. Bitte neues Postfach prüfen.',
        passwordLabel: 'Neues Passwort',
        passwordPlaceholder: 'Mindestens 8 Zeichen',
        passwordConfirmPlaceholder: 'Passwort wiederholen',
        savePassword: 'Passwort ändern',
        passwordTooShort: 'Passwort muss mindestens 8 Zeichen haben.',
        passwordMismatch: 'Passwort-Bestätigung stimmt nicht überein.',
        passwordSaved: 'Passwort aktualisiert.',
        privacyTitle: 'Datenschutz',
        privacyCopy: 'Lege fest, wie viel persoenlichen Kontext PhysioBot zwischen Sessions behalten darf.',
        privacyFull: 'Voll',
        privacyFullHint: 'Coach- und Gesundheitskontext bleibt verfuegbar.',
        privacyMinimal: 'Minimal',
        privacyMinimalHint: 'Nur betriebliche Telemetrie bleibt erhalten.',
        privacyNone: 'Keine Speicherung',
        privacyNoneHint: 'Keine neuen persoenlichen Erinnerungen speichern.',
        privacyError: 'Datenschutz-Einstellung konnte nicht gespeichert werden.',
        privacySaved: 'Datenschutz-Einstellung gespeichert.',
        loadMemories: 'Erinnerungen ansehen',
        clearMemories: 'Erinnerungen loeschen',
        exportData: 'Daten exportieren',
        deleteAccount: 'Konto loeschen',
        loading: 'Laden...',
        deleting: 'Loeschen...',
        noMemoriesFound: 'Keine gespeicherten Erinnerungen gefunden.',
        memoriesLoadError: 'Erinnerungen konnten nicht geladen werden.',
        clearMemoriesConfirm: 'Alle gespeicherten Erinnerungen wirklich loeschen?',
        memoriesDeleted: 'Erinnerungen geloescht.',
        memoriesDeleteError: 'Erinnerungen konnten nicht geloescht werden.',
        noMemoriesAvailable: 'Keine Erinnerungen verfuegbar.',
        classLabel: 'Klasse',
        noDate: 'Ohne Datum',
        deleteAccountConfirm: 'Konto und gespeicherte Daten jetzt loeschen? Dieser Schritt ist nicht rueckgaengig.',
        deleteAccountError: 'Kontodaten konnten nicht geloescht werden.',
        physioTitle: 'Physiotherapie',
        physioId: 'ID',
        physioName: 'Name',
        physioAddress: 'Anschrift',
        notProvided: 'Nicht hinterlegt',
        selfCreatedPlan: 'Du hast deinen Plan selbst erstellt und nutzt aktuell keinen zugeordneten Physio.',
        noPhysioAssigned: 'Derzeit ist kein Physiotherapeut zugeordnet.',
      }

  const toggleDay = (day: number) => {
    setSelectedDays(prev => {
      if (prev.includes(day)) return prev.filter(item => item !== day)
      return [...prev, day].sort((a, b) => a - b)
    })
  }

  const saveSchedule = async () => {
    if (selectedDays.length === 0) {
      setScheduleMessage(copy.selectTrainingDay)
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
      setScheduleMessage(copy.scheduleError)
    } else {
      setScheduleMessage(copy.scheduleSaved)
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
      setLanguageMessage(locale === 'en' ? 'App language could not be saved.' : 'Sprache konnte nicht gespeichert werden.')
    } else {
      persistLanguageCookie(newLanguage)
      setLocale(newLanguage)
      router.refresh()
      setLanguageMessage(newLanguage === 'en' ? 'Language saved.' : 'Sprache gespeichert.')
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
      setProfileMessage(copy.nameError)
    } else {
      setProfileMessage(copy.nameSaved)
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
      setEmailMessage(copy.emailSaved)
    }
    setEmailLoading(false)
  }

  const savePassword = async () => {
    if (newPassword.length < 8) {
      setPasswordMessage(copy.passwordTooShort)
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage(copy.passwordMismatch)
      return
    }

    setPasswordLoading(true)
    setPasswordMessage(undefined)
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setPasswordMessage(error.message)
    } else {
      setPasswordMessage(copy.passwordSaved)
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
      setPrivacyMessage(copy.privacyError)
    } else {
      setPrivacyMessage(copy.privacySaved)
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
        throw new Error(payload.error ?? copy.memoriesLoadError)
      }

      setMemories(payload.memories ?? [])
      setShowMemories(true)
      if ((payload.memories ?? []).length === 0) {
        setMemoryMessage(copy.noMemoriesFound)
      }
    } catch (error) {
      setMemoryMessage(error instanceof Error ? error.message : copy.memoriesLoadError)
    } finally {
      setMemoryLoading(false)
    }
  }

  const clearMemories = async () => {
    if (typeof window !== 'undefined' && !window.confirm(copy.clearMemoriesConfirm)) {
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
        throw new Error(payload.error ?? copy.memoriesDeleteError)
      }

      setMemories([])
      setShowMemories(true)
      setMemoryMessage(copy.memoriesDeleted)
    } catch (error) {
      setMemoryMessage(error instanceof Error ? error.message : copy.memoriesDeleteError)
    } finally {
      setMemoryLoading(false)
    }
  }

  const deleteAccountData = async () => {
    if (
      typeof window !== 'undefined'
      && !window.confirm(copy.deleteAccountConfirm)
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
        throw new Error(payload.error ?? copy.deleteAccountError)
      }

      router.push('/auth/login')
    } catch (error) {
      setPrivacyMessage(error instanceof Error ? error.message : copy.deleteAccountError)
    } finally {
      setAccountDeletionLoading(false)
    }
  }

  return (
    <div className="space-y-6 md:grid md:grid-cols-2 md:gap-8 md:space-y-0">
      <section className="glass-card rounded-[26px] border-white/5 md:self-start">
        <div className="p-5 sm:p-6">
          <h2 className="font-display text-xl uppercase tracking-tight text-white">{copy.scheduleTitle}</h2>
        </div>
        <div className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
          <div className="mb-5 flex flex-wrap gap-2">
            {weekDays.map(({ day, label }) => {
              const active = selectedDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border text-xs font-semibold transition-all sm:h-12 sm:w-12 ${
                    active ? 'border-[var(--accent)] bg-[rgba(42,157,138,0.12)] text-[var(--accent)]' : 'border-white/10 text-white/40'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="notifyTime" className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                {copy.timeLabel}
              </label>
              <Input
                id="notifyTime"
                type="time"
                value={notifyTime}
                onChange={event => setNotifyTime(event.target.value)}
                className="time-input rounded-xl border-white/5 bg-[var(--surface)] p-3 h-auto text-[0.98rem] tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="timezone" className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                {copy.timezoneLabel}
              </label>
              <Input id="timezone" value={timezone} onChange={event => setTimezone(event.target.value)} className="rounded-xl bg-[var(--surface)] border-white/5 p-3 h-auto" />
            </div>
          </div>
          <button
            type="button"
            onClick={saveSchedule}
            disabled={scheduleLoading}
            className="mt-5 w-full rounded-xl bg-[var(--secondary)] py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60 sm:mt-6 sm:py-5"
          >
            {scheduleLoading ? '...' : copy.saveSchedule}
          </button>
          {scheduleMessage && <p className="mt-3 text-xs text-white/40">{scheduleMessage}</p>}
        </div>
      </section>

      <section className="glass-card rounded-[26px] border-white/5 md:self-start">
        <div className="p-5 sm:p-6">
          <h2 className="font-display text-xl uppercase tracking-tight text-white">{copy.languageTitle}</h2>
        </div>
        <div className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
          <p className="mb-4 text-xs leading-5 text-white/40">
            {copy.languageCopy}
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
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3.5 text-sm font-semibold transition-all disabled:opacity-60 sm:py-4 ${
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

      <section className="glass-card rounded-[26px] border-white/5 md:self-start">
        <div className="p-5 sm:p-6">
          <h2 className="font-display text-xl uppercase tracking-tight text-white">{copy.achievementsTitle}</h2>
        </div>
        <div className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
          <div className="grid grid-cols-4 gap-4">
            {[
              { icon: Calendar, label: copy.achievementRhythm },
              { icon: ShieldPlus, label: copy.achievementRoutine },
              { icon: User, label: copy.achievementCoach },
              { icon: Mail, label: copy.achievementProfile },
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
            className="mt-5 w-full rounded-xl border border-white/5 bg-white/5 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/8 sm:mt-6 sm:py-5"
          >
            {copy.viewBadges}
          </button>
        </div>
      </section>

      <section className="glass-card rounded-[26px] border-white/5 md:self-start">
        <div className="p-5 sm:p-6">
          <h2 className="font-display text-xl uppercase tracking-tight text-white">{copy.accountTitle}</h2>
        </div>
        <div className="space-y-5 px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
          <div className="space-y-2">
            <label htmlFor="name" className="text-[10px] uppercase tracking-[0.18em] text-white/40">{copy.nameLabel}</label>
            <Input id="name" value={name} onChange={event => setName(event.target.value)} placeholder={copy.namePlaceholder} className="rounded-xl bg-[var(--surface)] border-white/5 p-3 h-auto" />
            <button
              type="button"
              onClick={saveName}
              disabled={profileLoading}
              className="w-full rounded-xl bg-[var(--secondary)] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60 sm:py-4"
            >
              {profileLoading ? '...' : copy.saveName}
            </button>
            {profileMessage && <p className="text-xs text-white/40">{profileMessage}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-[10px] uppercase tracking-[0.18em] text-white/40">{copy.emailLabel}</label>
            <Input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={copy.emailPlaceholder} className="rounded-xl bg-[var(--surface)] border-white/5 p-3 h-auto" />
            <button
              type="button"
              onClick={saveEmail}
              disabled={emailLoading}
              className="w-full rounded-xl bg-[var(--secondary)] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60 sm:py-4"
            >
              {emailLoading ? '...' : copy.saveEmail}
            </button>
            {emailMessage && <p className="text-xs text-white/40">{emailMessage}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-[10px] uppercase tracking-[0.18em] text-white/40">{copy.passwordLabel}</label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              placeholder={copy.passwordPlaceholder}
              className="rounded-xl bg-[var(--surface)] border-white/5 p-3 h-auto"
            />
            <Input
              id="passwordConfirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder={copy.passwordConfirmPlaceholder}
              className="rounded-xl bg-[var(--surface)] border-white/5 p-3 h-auto"
            />
            <button
              type="button"
              onClick={savePassword}
              disabled={passwordLoading}
              className="w-full rounded-xl bg-[var(--secondary)] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60 sm:py-4"
            >
              {passwordLoading ? '...' : copy.savePassword}
            </button>
            {passwordMessage && <p className="text-xs text-white/40">{passwordMessage}</p>}
          </div>
        </div>
      </section>

      <section className="glass-card rounded-[26px] border-white/5 md:self-start">
        <div className="p-5 sm:p-6">
          <h2 className="font-display text-xl uppercase tracking-tight text-white">{copy.privacyTitle}</h2>
        </div>
        <div className="space-y-5 px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
          <div className="space-y-3">
            <p className="text-xs text-white/40">
              {copy.privacyCopy}
            </p>
            <div className="grid gap-3">
              {[
                { value: 'full' as PrivacyConsent, label: copy.privacyFull, hint: copy.privacyFullHint },
                { value: 'minimal' as PrivacyConsent, label: copy.privacyMinimal, hint: copy.privacyMinimalHint },
                { value: 'none' as PrivacyConsent, label: copy.privacyNone, hint: copy.privacyNoneHint },
              ].map(option => {
                const active = privacyConsent === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={privacyLoading}
                    onClick={() => savePrivacyConsent(option.value)}
                    className={`rounded-2xl border px-4 py-3.5 text-left transition-all disabled:opacity-60 sm:py-4 ${
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
                {memoryLoading ? copy.loading : copy.loadMemories}
              </button>
              <button
                type="button"
                onClick={clearMemories}
                disabled={memoryLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/8 disabled:opacity-60"
              >
                <Trash2 size={16} />
                {copy.clearMemories}
              </button>
              <a
                href="/api/privacy/export"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/8"
              >
                <Download size={16} />
                {copy.exportData}
              </a>
              <button
                type="button"
                onClick={deleteAccountData}
                disabled={accountDeletionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(231,111,81,0.45)] bg-[rgba(231,111,81,0.12)] py-4 text-sm font-semibold text-[rgb(255,194,178)] transition-colors hover:bg-[rgba(231,111,81,0.18)] disabled:opacity-60"
              >
                <AlertTriangle size={16} />
                {accountDeletionLoading ? copy.deleting : copy.deleteAccount}
              </button>
            </div>
            {memoryMessage && <p className="text-xs text-white/40">{memoryMessage}</p>}
            {showMemories && (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                {memories.length === 0 ? (
                  <p className="text-sm text-white/45">{copy.noMemoriesAvailable}</p>
                ) : (
                  memories.map(memory => (
                    <div key={memory.id} className="rounded-xl border border-white/10 bg-[rgba(0,0,0,0.18)] p-4">
                      <div className="mb-2 flex items-center justify-between gap-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getDataClassBadgeClasses(memory.dataClass)}`}>
                          {copy.classLabel} {memory.dataClass}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                          {memory.createdAt ? new Date(memory.createdAt).toLocaleDateString(toLocaleTag(locale)) : copy.noDate}
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

      <section className="glass-card rounded-[26px] border-white/5 p-5 md:self-start md:p-6">
        <h2 className="mb-2 font-display text-xl uppercase tracking-tight text-white">{copy.physioTitle}</h2>
        {physioInfo ? (
          <div className="space-y-2 text-sm text-white/75">
            <p><span className="font-semibold text-white">{copy.physioId}:</span> {physioInfo.id}</p>
            <p><span className="font-semibold text-white">{copy.physioName}:</span> {physioInfo.name ?? copy.notProvided}</p>
            <p><span className="font-semibold text-white">{copy.physioAddress}:</span> {physioInfo.address ?? copy.notProvided}</p>
          </div>
        ) : (
          <p className="text-sm text-white/40">
            {isSelfCreatedPlan
              ? copy.selfCreatedPlan
              : copy.noPhysioAssigned}
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
