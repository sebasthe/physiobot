# Backlog: GDPR-Readiness fuer PhysioBot als Health-App

Stand: 09.03.2026

## Format
Das Dokument ist ein **GDPR-basiertes Backlog** fuer PhysioBot.

Es ist bewusst nicht nur eine To-do-Liste, sondern:
- zuerst ein **Slicing** in sinnvoll auslieferbare Arbeitspakete,
- danach eine **Priorisierung**,
- danach ein **GDPR-basierter Backlog** mit konkreten Themen.

## Zielbild
PhysioBot bleibt klar als Health-App fuer Physiotherapie positioniert, wird aber so aufgesetzt, dass:
- Verarbeitung von Gesundheitsdaten bewusst, dokumentiert und begrenzt erfolgt,
- die App mit vertretbarem Risiko produktionsfaehig wird,
- die kritischsten GDPR-Luecken zuerst geschlossen werden,
- rechtliche und technische Massnahmen ineinandergreifen statt nebeneinander zu laufen.

## Repo-spezifischer Ist-Zustand
Heute werden bereits sensible und gesundheitsnahe Daten verarbeitet, u. a. in:
- `health_profiles` fuer Beschwerden, Ziele, Fitnesslevel und Trainingsparameter
- `user_personality` fuer Motivations- und Kommunikationsprofil
- `sessions` fuer Session-Historie und Feedback
- `physio_patients` fuer die Zuordnung zwischen Patient und Physiotherapeut
- `mem0` fuer persistente Erinnerungen, teils mit persoenlichem Kontext
- Anthropic fuer Plan- und Message-Generierung
- optional ElevenLabs fuer Voice-Ausgabe

Konsequenz:
- Die App verarbeitet **personenbezogene Daten**.
- Ein grosser Teil davon ist **Gesundheitsdaten** oder laesst Gesundheitsrueckschluesse zu.
- Die Personalisierung motivationaler Botschaften ist **Profiling**.

## Slicing

## Slice 1: Compliance-Fundament vor Produktivbetrieb
Zweck:
Alles, was vor Launch oder Pilot zwingend da sein muss, damit ihr keine offenen Grundsatzluecken mit in den Betrieb nehmt.

Enthaelt:
- Verzeichnis der Verarbeitungstaetigkeiten
- Datenfluss- und Vendor-Inventar
- Rechtsgrundlagen und Zwecktrennung
- Privacy Notice
- Consent-Strategie fuer Gesundheitsdaten und Personalisierung
- DPA/Transfer-Pruefung fuer alle Anbieter
- DPIA-Start

Warum zuerst:
Ohne diesen Slice wisst ihr nicht belastbar, welche Verarbeitung ihr eigentlich legitimiert, begrenzt oder absichern muesst.

## Slice 2: Datenminimierung und Drittland-/Vendor-Risiko senken
Zweck:
Die heikelsten Datenfluesse zu externen Prozessoren reduzieren, bevor ihr nachgelagerte Prozesse perfektioniert.

Enthaelt:
- Payload-Minimierung fuer Anthropic, Mem0 und ElevenLabs
- Abschaltbarkeit von Mem0/Voice je nach Consent und Region
- Klassifikation, welche Daten lokal bleiben muessen
- Guardrails fuer keine unnötigen Freitexte in Drittservices

Warum so frueh:
Jeder unnoetige externe Datenabfluss vergroessert das Rechts- und Reputationsrisiko.

## Slice 3: Nutzerrechte und operative GDPR-Faehigkeit
Zweck:
Damit ihr auf reale Anfragen reagieren koennt statt nur eine Privacy Notice zu veroeffentlichen.

Enthaelt:
- Export
- Loeschung
- Berichtigung
- Consent-Widerruf
- Retention/Deletion Jobs
- Support-Playbook

Warum danach:
Die Fluesse muessen erst verstanden und begrenzt werden, bevor man sie korrekt exportieren und loeschen kann.

## Slice 4: Security, Governance und Incident Readiness
Zweck:
Die organisatorische Seite absichern, die bei Health-Daten besonders relevant ist.

Enthaelt:
- Rollen- und Zugriffskonzept
- Audit Logging
- Secrets/Key Management
- Incident/Breach-Runbook
- interne Freigabeprozesse fuer neue Datenfelder und neue Vendoren

Warum nicht ganz am Ende:
Ein Teil davon muss parallel laufen, ist aber selten der erste Blocker fuer den Backlog-Schnitt.

## Slice 5: Produktgrenzen und Health-App-Guardrails
Zweck:
Sicherstellen, dass das Produkt zwar Health-App bleibt, aber keine unbeabsichtigten medizinischen Risiken oder Scope-Creeps aufmacht.

Enthaelt:
- saubere Abgrenzung Coaching vs. Diagnose/Therapieentscheidung
- Copy/UX fuer Einwilligung und Transparenz
- Governance fuer neue Features mit Gesundheitsbezug

Warum spaeter:
Wichtig fuer Stabilitaet und Skalierung, aber nicht der schnellste Risikohebel.

## Priorisierungsmodell
Jedes Themenpaket wird nach sechs Kriterien bewertet:

- `Pflichtgrad`: regulatorische Notwendigkeit fuer Launch oder Pilot
- `Risikoreduktion`: wie stark das Thema rechtliches/operatives Risiko senkt
- `Nutzen`: wie stark das Thema Vertrauensfaehigkeit, Vertrieb und Skalierung verbessert
- `Aufwand`: geschaetzter Implementierungsaufwand
- `Abhaengigkeit`: wie viele andere Themen davon blockiert werden
- `Time-to-Mitigate`: wie schnell man damit eine echte Luecke schliessen kann

Skala:
- `1` niedrig
- `2` eher niedrig
- `3` mittel
- `4` hoch
- `5` sehr hoch

Interpretation:
- Hoher `Pflichtgrad` + hohe `Risikoreduktion` schlagen hohen `Nutzen`.
- Niedriger `Aufwand` ist nur dann relevant, wenn das Thema nicht an der Sache vorbeigeht.
- Hohe `Abhaengigkeit` zieht Themen nach vorne.

## Priorisierte Themenpakete

| Prio | Paket | Pflichtgrad | Risikoreduktion | Nutzen | Aufwand | Abhaengigkeit | Time-to-Mitigate | Kurzbegruendung |
|---|---|---:|---:|---:|---:|---:|---:|---|
| P0 | GDPR-Fundament und Verarbeitungsinventar | 5 | 5 | 5 | 2 | 5 | 5 | Blockiert praktisch alle Folgeentscheidungen |
| P0 | Vendor-/Transfer-Check inkl. DPA und DPIA-Kickoff | 5 | 5 | 5 | 3 | 5 | 4 | Externe AI- und Memory-Provider sind der heikelste Hebel |
| P0 | Consent-Architektur fuer Gesundheitsdaten und Profiling | 5 | 5 | 5 | 3 | 5 | 4 | Ohne belastbare Einwilligungslogik wird der Betrieb angreifbar |
| P0 | Privacy Notice und In-App-Transparenz | 5 | 4 | 5 | 2 | 4 | 5 | Muss frueh sichtbar und textlich stabil sein |
| P1 | Datenminimierung in Anthropic, Mem0, ElevenLabs | 4 | 5 | 4 | 4 | 4 | 3 | Reduziert reale Exposition deutlich |
| P1 | Export, Loeschung, Widerruf und Retention | 5 | 4 | 4 | 4 | 4 | 3 | Operative GDPR-Faehigkeit statt reiner Policy |
| P1 | Security- und Access-Governance | 4 | 4 | 4 | 3 | 3 | 3 | Gerade bei Health-Daten nicht optional |
| P2 | Produkt-Guardrails fuer Health-App-Scope | 3 | 3 | 4 | 2 | 2 | 2 | Wichtig fuer nachhaltige Steuerung, aber nicht zuerst |

## GDPR-Backlog

## P0

### `GDPR-001` Verarbeitungsinventar und Datenklassifikation
- `Goal`: Vollstaendige Sicht auf alle personenbezogenen und gesundheitsbezogenen Datenfluesse herstellen.
- `Theme`: Compliance-Fundament.
- `Problem`: Aktuell ist das Wissen ueber Datenfluesse implizit im Code verteilt. Das ist zu schwach fuer Rechtsgrundlage, Privacy Notice, DPIA und Vendor-Steuerung.
- `Action`:
  - Dateninventar pro Tabelle, API, Drittanbieter und UI-Flow dokumentieren.
  - Datenklassen markieren: Account, Gesundheitsdaten, Profiling, Telemetrie, Session-Daten.
  - Pro Datensatz Herkunft, Empfaenger, Speicherort, Zweck und Retention definieren.
  - Ergebnis als living doc im Repo halten.
- `Akzeptanz`:
  - Tabelle aller personenbezogenen Daten mit Quelle, Zweck, System, Retention und Empfaengern vorhanden.
  - Explizit gekennzeichnet, welche Felder Gesundheitsdaten sind.
  - Anthropic, Mem0, ElevenLabs und Supabase sind im Datenfluss enthalten.
- `Bewertung`: Nutzen 5, Risiko 5, Aufwand 2

### `GDPR-002` Rechtsgrundlagen und Zwecktrennung festziehen
- `Goal`: Jede Verarbeitung hat eine benannte und begruendete Rechtsgrundlage.
- `Theme`: Legal Core.
- `Problem`: Heute ist nicht sauber getrennt zwischen Auth, Training, Gesundheitsprofil, motivationale Personalisierung, Langzeit-Memory und Voice.
- `Action`:
  - Processing-Purposes definieren.
  - Pro Purpose Rechtsgrundlage festlegen.
  - Gesundheitsdaten und Profiling separat behandeln.
  - Dokumentieren, welche Verarbeitung ohne Einwilligung nicht stattfindet.
- `Akzeptanz`:
  - Entscheidungsmatrix pro Purpose vorhanden.
  - Consent-pflichtige Verarbeitungen sind benannt.
  - Nicht zwingende Features sind technisch abschaltbar definierbar.
- `Bewertung`: Nutzen 5, Risiko 5, Aufwand 2

### `GDPR-003` Vendor- und Transfer-Assessment abschliessen
- `Goal`: Alle externen Verarbeiter sind vertraglich und regulatorisch eingeordnet.
- `Theme`: Third-Party Risk.
- `Problem`: Aktuell gehen Daten an mehrere Anbieter, teils mit moeglichen Drittlandtransfers und unklarer vertraglicher Absicherung je Use Case.
- `Action`:
  - DPA-Status fuer Supabase, Anthropic, ElevenLabs, Mem0 pruefen und dokumentieren.
  - Transferpfade und evtl. SCC/TIA dokumentieren.
  - Freigabeentscheidung je Vendor treffen: `allowed`, `allowed with guardrails`, `blocked`.
  - Health-Daten-Einsatz explizit vendor-spezifisch bewerten.
- `Akzeptanz`:
  - Vendor-Register mit Vertrag, Region, Unterauftragsverarbeitung und Restriktionen vorhanden.
  - Jeder produktive Vendor hat eine dokumentierte Freigabe.
  - Offene juristische Punkte sind mit Owner und Termin versehen.
- `Bewertung`: Nutzen 5, Risiko 5, Aufwand 3

### `GDPR-004` DPIA anstossen und scopen
- `Goal`: Datenschutz-Folgenabschaetzung frueh starten statt erst kurz vor Launch.
- `Theme`: High-Risk Processing.
- `Problem`: Health-Daten, Profiling, Langzeit-Memory und AI-Provider sprechen stark fuer eine DPIA. Ohne DPIA fehlt euch ein belastbarer Risikorahmen.
- `Action`:
  - DPIA-Scope, Systeme, Datenklassen und Risiken erfassen.
  - Eintrittswahrscheinlichkeit/Impact bewerten.
  - Gegenmassnahmen und Restrisiken benennen.
  - Offene Punkte an Legal/Data Protection Review uebergeben.
- `Akzeptanz`:
  - DPIA-Draft existiert.
  - Top-Risiken und Controls sind benannt.
  - No-Go-Kriterien fuer Launch sind dokumentiert.
- `Bewertung`: Nutzen 5, Risiko 5, Aufwand 3

### `GDPR-005` Consent-Architektur fuer Gesundheitsdaten, Profiling und externe Verarbeitung
- `Goal`: Einwilligungen sind granular, nachweisbar und widerrufbar.
- `Theme`: User Consent.
- `Problem`: Fuer motivationale Personalisierung, Session-Memory und externe AI-Verarbeitung reicht ein impliziter Produktgebrauch nicht.
- `Action`:
  - Consent-Schema definieren fuer:
    - Gesundheitsprofil und Trainingspersonalisierung
    - motivationale Personalisierung/Profiling
    - Langzeit-Memory
    - optionale Voice-Verarbeitung ueber ElevenLabs
  - Consent-Versionierung und Audit-Trail einbauen.
  - Widerruf mit sauberem Fallback-Verhalten definieren.
- `Akzeptanz`:
  - DB-Modell fuer Consents inkl. Version, Timestamp und Source vorhanden.
  - UI-Flow fuer Opt-in/Opt-out spezifiziert.
  - Jede optionale Verarbeitung hat ein technisches Fallback.
- `Bewertung`: Nutzen 5, Risiko 5, Aufwand 3

### `GDPR-006` Privacy Notice und In-App-Transparenz
- `Goal`: Nutzer verstehen vor Dateneingabe, was mit ihren Daten passiert.
- `Theme`: Transparency.
- `Problem`: Ohne konkrete Privacy Notice und kontextuelle Hinweise ist die Verarbeitung von Health-Daten und Profiling weder transparent noch belastbar erklaert.
- `Action`:
  - Privacy Notice strukturieren nach Datenkategorien, Zwecken, Empfaengern, Transfers, Retention und Rechten.
  - In Onboarding und Settings kontextuelle Hinweise einfuehren.
  - Besondere Hinweise fuer motivationale Personalisierung und Long-Term Memory.
- `Akzeptanz`:
  - Vollstaendige Privacy Notice vorhanden.
  - Vor Eingabe sensibler Daten wird auf Zweck und Empfaenger hingewiesen.
  - Settings zeigen aktiven Consent-Status und relevante Verarbeitung.
- `Bewertung`: Nutzen 5, Risiko 4, Aufwand 2

## P1

### `GDPR-007` Outbound Payloads minimieren
- `Goal`: Externe Anbieter sehen nur die Daten, die fuer den jeweiligen Use Case minimal noetig sind.
- `Theme`: Data Minimization.
- `Problem`: Aktuell koennen Freitexte, Health-Kontext und persoenliche Motivation in zu reichhaltiger Form an AI- oder Memory-Dienste fliessen.
- `Action`:
  - Prompt-/Payload-Review fuer Anthropic, Mem0 und ElevenLabs.
  - Strukturierte Attribute statt Rohtext, wo moeglich.
  - Redaction Layer fuer Namen, Freitexte und irrelevanten Kontext.
  - Feature-Flags pro Vendor und Purpose.
- `Akzeptanz`:
  - Jeder Outbound-Call hat ein minimiertes Payload-Schema.
  - Freitextweitergabe ist bewusst begrenzt.
  - Vendor-spezifische Abschaltung per Config moeglich.
- `Bewertung`: Nutzen 4, Risiko 5, Aufwand 4

### `GDPR-008` Nutzerrechte: Export, Loeschung, Berichtigung, Widerruf
- `Goal`: Betroffenenrechte sind nicht nur juristisch versprochen, sondern technisch ausfuehrbar.
- `Theme`: Data Subject Rights.
- `Problem`: Derzeit gibt es keine belastbaren Self-Service- oder Admin-Workflows ueber alle Speicherorte hinweg.
- `Action`:
  - Export ueber Supabase-Daten plus externe Memories definieren.
  - Loeschpfad fuer Tabellen, Session-Daten und Mem0 aufsetzen.
  - Consent-Widerruf an Datenfluss und Feature-Verhalten koppeln.
  - Admin-/Support-Prozess fuer Sonderfaelle dokumentieren.
- `Akzeptanz`:
  - Exportformat und Loeschlauf dokumentiert und testbar.
  - Widerruf stoppt zukuenftige Verarbeitung.
  - Externe Speicherorte sind im Loeschpfad enthalten.
- `Bewertung`: Nutzen 4, Risiko 4, Aufwand 4

### `GDPR-009` Retention- und Deletion-Policy implementieren
- `Goal`: Daten bleiben nicht unbegrenzt liegen.
- `Theme`: Storage Limitation.
- `Problem`: Ohne definierte Fristen sammeln sich Session-Historie, Memories und Feedback unkontrolliert an.
- `Action`:
  - Retention-Matrix pro Datenklasse festlegen.
  - Soft-/Hard-Delete-Regeln unterscheiden.
  - Scheduled Cleanup Jobs einfuehren.
  - Retention in Privacy Notice und interner Doku verankern.
- `Akzeptanz`:
  - Jede Datenklasse hat eine Frist.
  - Cleanup-Jobs und Audit-Logs sind spezifiziert.
  - Keine Tabelle bleibt ohne definierte Retention.
- `Bewertung`: Nutzen 4, Risiko 4, Aufwand 3

### `GDPR-010` Security- und Access-Governance haerten
- `Goal`: Zugriff auf sensible Daten ist nachvollziehbar und minimal.
- `Theme`: Security.
- `Problem`: RLS ist vorhanden, aber Governance fuer Admin-Zugriff, Secrets, Audit und Incident Handling ist noch nicht als Gesamtpaket beschrieben.
- `Action`:
  - Rollen- und Berechtigungskonzept dokumentieren.
  - Audit Logging fuer privilegierte Aktionen einfuehren.
  - Secret Rotation und Zugriff auf produktive Env Vars regeln.
  - Incident- und Breach-Runbook erstellen.
- `Akzeptanz`:
  - Access-Matrix vorhanden.
  - Audit-Pflichten fuer sensible Admin-Aktionen definiert.
  - Incident-Runbook mit Ownern vorhanden.
- `Bewertung`: Nutzen 4, Risiko 4, Aufwand 3

## P2

### `GDPR-011` Produkt-Guardrails fuer Health-App-Scope
- `Goal`: Das Produkt bleibt im gewollten Health-App-Rahmen und driftet nicht unbeabsichtigt in heiklere medizinische Anwendungsfaelle.
- `Theme`: Product Governance.
- `Problem`: Neue Features koennen stillschweigend neue Datenkategorien, neue Provider oder medizinisch heiklere Entscheidungen einbauen.
- `Action`:
  - Review-Checkliste fuer neue Health-Features definieren.
  - Copy-Grenzen fuer keine Diagnose-/Heilversprechen festlegen.
  - Vendor- und Datenfreigabe als Pflichtschritt in Feature-Planung verankern.
- `Akzeptanz`:
  - Definition of Ready fuer sensible Features existiert.
  - Produkt- und Prompt-Grenzen sind dokumentiert.
  - Neue externe Datenweitergabe braucht explizite Freigabe.
- `Bewertung`: Nutzen 4, Risiko 3, Aufwand 2

### `GDPR-012` Vertriebs- und Trust-Artefakte fuer Physio-Zielgruppe
- `Goal`: Datenschutz wird nicht nur compliant, sondern verkaufbar und vertrauensbildend.
- `Theme`: Commercial Readiness.
- `Problem`: Physios und spaeter Praxen werden Datenschutz sehr frueh als Vertrauensfilter nutzen.
- `Action`:
  - Privacy Summary fuer Sales/Onboarding erstellen.
  - Data Processing Overview fuer B2B-Partner vorbereiten.
  - Klar erklaeren, welche Daten wo verarbeitet werden und welche Optionen deaktivierbar sind.
- `Akzeptanz`:
  - Einseitiger Privacy Summary vorhanden.
  - Vendor-/Region-Uebersicht fuer Partnergespraeche verfuegbar.
  - Produktoptionen je Datenschutzprofil sind beschreibbar.
- `Bewertung`: Nutzen 4, Risiko 2, Aufwand 2

## Empfohlene Ausfuehrungsreihenfolge
1. `GDPR-001` Verarbeitungsinventar
2. `GDPR-002` Rechtsgrundlagen und Zwecktrennung
3. `GDPR-003` Vendor-/Transfer-Assessment
4. `GDPR-004` DPIA-Kickoff
5. `GDPR-005` Consent-Architektur
6. `GDPR-006` Privacy Notice und In-App-Transparenz
7. `GDPR-007` Payload-Minimierung
8. `GDPR-009` Retention/Deletion
9. `GDPR-008` Betroffenenrechte-Workflows
10. `GDPR-010` Security/Governance
11. `GDPR-011` Produkt-Guardrails
12. `GDPR-012` Trust-Artefakte fuer Vertrieb

## Definition of Done fuer die erste belastbare GDPR-Stufe
Die erste belastbare Stufe ist erreicht, wenn:
- Dateninventar, Purpose-Matrix und Vendor-Register stehen,
- eine DPIA mindestens als belastbarer Draft existiert,
- Consent fuer sensible und optionale Verarbeitungen technisch modelliert ist,
- eine Privacy Notice live-faehig ist,
- Payloads zu externen AI-/Memory-Providern minimiert und dokumentiert sind,
- ein Loesch- und Exportpfad spezifiziert ist,
- Incident- und Governance-Grundlagen stehen.

## Empfehlung fuer den naechsten konkreten Sprint
Fokus nur auf den kleinsten sinnvollen P0-Block:
- `GDPR-001` Verarbeitungsinventar
- `GDPR-002` Rechtsgrundlagen/Zwecktrennung
- `GDPR-003` Vendor-/Transfer-Assessment
- `GDPR-005` Consent-Architektur
- `GDPR-006` Privacy Notice

Damit schafft ihr zuerst die Entscheidungsgrundlage und vermeidet, vorschnell an UI oder Loeschjobs zu bauen, waehrend die eigentliche Rechts- und Datenarchitektur noch unklar ist.
