# Backlog: Serverseitige Training-Notifications

Stand: 09.03.2026

## Ziel
Reminder sollen **nicht** mehr nur im Browser laufen, sondern serverseitig geplant und versendet werden:  
„Training startet in 5 Minuten“ basierend auf `schedules.days`, `schedules.notify_time`, `schedules.timezone`.

## Scope (MVP)
- Web Push serverseitig (PWA/Browser), inkl. Opt-in/Opt-out.
- Fallback: E-Mail Reminder (wenn kein Push-Abo vorhanden).
- Idempotenter Versand und Retry bei Fehlern.

## Priorisiertes Backlog

## P0 (kritisch, zuerst)
- [ ] `NOTIF-001` Architektur entscheiden und fixieren.
Akzeptanz: dokumentierte Entscheidung für Scheduler/Worker (z. B. Supabase Edge Function + Cron), inkl. Retry-Strategie.

- [ ] `NOTIF-002` DB-Schema für Notification-Preferences und Job-Queue anlegen.
Akzeptanz: Migration mit Tabellen:
`notification_preferences` (user_id, enabled, channels, reminder_offset_min, push_subscription, email_enabled, updated_at) und  
`notification_jobs` (id, user_id, channel, send_at_utc, status, attempts, error, provider_message_id, created_at, sent_at).

- [ ] `NOTIF-003` API für Push-Subscription speichern/löschen bauen.
Akzeptanz: Auth-gesicherte Endpoints; Subscription wird pro User gespeichert und validiert.

- [ ] `NOTIF-004` Job-Erzeugung bei Schedule-Änderung und täglich für Folgetage.
Akzeptanz: Bei Änderung von Tagen/Uhrzeit/Timezone werden zukünftige Jobs sauber neu erzeugt (keine Duplikate).

- [ ] `NOTIF-005` Versand-Worker (jede Minute) implementieren.
Akzeptanz: Fällige Jobs werden versendet, Status auf `sent`/`failed`, Retry-Backoff funktioniert.

- [ ] `NOTIF-006` Dashboard-Client Reminder-Timer entfernen.
Akzeptanz: Keine lokale `setTimeout`-Reminder-Logik mehr für Trainingserinnerungen.

## P1 (wichtig, danach)
- [ ] `NOTIF-007` Settings UI erweitern um Notification-Schalter.
Akzeptanz: User kann global aktivieren/deaktivieren, Kanal wählen (Push, E-Mail), und 5-Minuten-Offset konfigurieren.

- [ ] `NOTIF-008` E-Mail-Template und Versand integrieren.
Akzeptanz: Einheitliches deutsches Reminder-Template, Versand über gewählten Provider, Logs vorhanden.

- [ ] `NOTIF-009` Observability + Admin-Debug.
Akzeptanz: Übersicht für offene/fehlgeschlagene Jobs, letzte Fehlerursachen, manuelles Requeue.

## P2 (nice-to-have)
- [ ] `NOTIF-010` Quiet Hours / Pause-Logik.
Akzeptanz: Keine Reminder in gesperrten Zeitfenstern.

- [ ] `NOTIF-011` A/B Tests für Reminder-Texte.
Akzeptanz: Variantenzuordnung + KPI-Tracking (Session-Start nach Reminder).

- [ ] `NOTIF-012` Mehrsprachige Reminder (DE/EN) aus Nutzerprofil.
Akzeptanz: Nachrichtensprache folgt `user_personality.language`.

## Technische Leitplanken
- Alle Zeiten serverseitig in UTC speichern; Rendering/Planung immer mit User-Timezone.
- Idempotenz-Schlüssel pro User + geplante Zeit + Kanal.
- RLS für alle Notification-Tabellen; nur User-eigene Preferences les-/schreibbar.
- Jobs niemals hart löschen, nur Status ändern (Audit/Debug).

## Definition of Done (MVP)
1. User stellt Tage/Uhrzeit in Settings ein.
2. Server erzeugt Reminder-Job 5 Minuten vor Training.
3. Reminder wird ohne offenen Browser versendet.
4. Bei Versandfehler erfolgt Retry + Fehlereintrag.
5. Clientseitiger Reminder-Timer ist entfernt.
