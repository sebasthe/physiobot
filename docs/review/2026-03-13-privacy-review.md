# Privacy Review

Date: 2026-03-13

Summary:
The patch introduces multiple privacy-related regressions: retention cleanup cannot delete telemetry under current RLS, and the account-deletion fallback reports success while leaving protected data behind. It also adds a settings control that silently fails for users without a `user_personality` row.

## Findings

### [P1] Handle RLS failures in fallback account deletion
File: `/Users/sebastian/Dev/physioBot/app/api/privacy/delete/route.ts:39-42`

When `SUPABASE_SERVICE_ROLE_KEY` is absent or `admin.deleteUser()` fails, this branch falls back to deleting `pain_log` and `voice_telemetry_events` with the end-user client. Both tables currently only have SELECT/INSERT RLS policies, so Supabase returns an `error` for these deletes instead of throwing; because the responses are ignored here, the route still returns `success: true` while leaving pain reports and telemetry behind in exactly the environments where the fallback path is supposed to help.

### [P2] Use a client that can actually purge retained telemetry
File: `/Users/sebastian/Dev/physioBot/lib/privacy/retention.ts:15-20`

This retention cleanup runs through the authenticated request client, but `voice_telemetry_events` only exposes read/insert policies today. For normal users the delete resolves with an `error` and `count = null`, so `enforceRetention()` silently reports `deletedCount: 0` and the advertised 90-day retention never removes old operational telemetry.

### [P2] Upsert missing personality rows before saving language
File: `/Users/sebastian/Dev/physioBot/app/settings/SettingsClient.tsx:133-136`

The settings page already loads `user_personality` with `maybeSingle()` and falls back to `'de'`, so some users can reach this control without a row in that table. In that case `.update(...).eq('user_id', userId)` matches zero rows without returning an error, and this handler shows a success message even though the selected coach language is lost on the next reload.
