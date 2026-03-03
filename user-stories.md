# 🧠 AI-gestützter Physiotherapie-Coach  
## Produktanforderungen & User Stories

---

# 🎯 Produktvision

Eine datenschutzkonforme AI-Anwendung für personalisierte Physiotherapie-Trainingsprogramme,  
bei der sensible Gesundheitsdaten ausschließlich in einer Azure EU-Cloud verarbeitet werden.

Die Anwendung kombiniert:
- individuelle Trainingspläne  
- adaptive Trainingssteuerung  
- einen motivierenden Voice-Coach mit Perösnlichkeit von Tony Robins
- sichere Verarbeitung personenbezogener Gesundheitsdaten  

---

# 👤 Zielgruppe

- Personen mit physiotherapeutischem Trainingsbedarf
- Menschen mit Rücken-, Knie-, Schulter- oder Haltungsproblemen
- Nutzer mit Wunsch nach strukturierter, motivierender Trainingsbegleitung
- Datenschutzbewusste Anwender

---

# 🧾 User Stories

## 1️⃣ Registrierung & Datenschutz

**Als Nutzer möchte ich**
- mich registrieren können
- transparent informiert werden, wie meine Gesundheitsdaten verarbeitet werden
- sicher sein, dass meine Daten die EU nicht verlassen

**Akzeptanzkriterien**
- Klare Datenschutzerklärung
- Hinweis auf EU-Cloud-Verarbeitung
- Einwilligung zur Verarbeitung von Gesundheitsdaten
- Möglichkeit zur vollständigen Datenlöschung

---

## 2️⃣ Individuelle Trainingsanalyse

**Als Nutzer möchte ich**
- meine Beschwerden, Einschränkungen und Ziele angeben können
- mein aktuelles Fitnesslevel einschätzen
- Trainingsdauer und Trainingshäufigkeit festlegen
- eine Erinnerung erhalten, wenn die Trainingszeit kruz bevor steht

**Akzeptanzkriterien**
- Geführter Fragenkatalog
- Strukturierte Erfassung von:
  - Schmerzbereichen
  - Bewegungseinschränkungen
  - Trainingsziel (z. B. Schmerzreduktion, Mobilität, Kraftaufbau)
- Speicherung meiner Angaben für spätere Anpassungen

---

## 3️⃣ Personalisierter Trainingsplan

**Als Nutzer möchte ich**
- einen individuell auf mich zugeschnittenen Trainingsplan erhalten
- verständliche Übungsbeschreibungen bekommen
- klare Zeitangaben und Wiederholungszahlen sehen

**Akzeptanzkriterien**
- Plan basiert auf meinen Eingaben
- Übungen sind strukturiert nach:
  - Aufwärmen
  - Hauptübungen
  - Cooldown
- Anpassung an Trainingsdauer

---

## 4️⃣ Motivierender Voice-Coach

**Als Nutzer möchte ich**
- während des Trainings eine motivierende Begleitung hören
- klare Anweisungen erhalten
- positive, energiegeladene Unterstützung bekommen

**Akzeptanzkriterien**
- Startsignal für jede Übung
- Countdown- oder Wiederholungsbegleitung
- Motivationsimpulse
- Anpassung der Intensität an Fortschritt

---

## 5️⃣ Dynamische Anpassung

**Als Nutzer möchte ich**
- mein Feedback nach jeder Trainingseinheit geben können
- angeben können, ob Übungen zu leicht, zu schwer oder schmerzhaft waren
- automatisch angepasste Trainingspläne erhalten

**Akzeptanzkriterien**
- Feedbackformular nach jeder Einheit
- Berücksichtigung von Schmerzmeldungen
- Progressions- oder Reduktionslogik

---

## 6️⃣ Fortschrittsübersicht

**Als Nutzer möchte ich**
- meinen Trainingsfortschritt sehen
- erkennen, wie regelmäßig ich trainiere
- Verbesserungen nachvollziehen können

**Akzeptanzkriterien**
- Übersicht über absolvierte Sessions
- Visualisierung von Trainingsfrequenz
- Historie meiner Zielanpassungen

---

## 7️⃣ Datenschutz & Datenkontrolle

**Als Nutzer möchte ich**
- meine Daten jederzeit einsehen können
- meine Daten exportieren können
- meine Daten löschen können

**Akzeptanzkriterien**
- Transparente Datenübersicht
- Download-Funktion
- Sofortige Löschoption

---

# 🔐 Compliance-Anforderung

- Alle LLM-Verarbeitungen erfolgen in einer Azure EU-Cloud-Region
- Keine Nutzung der Nutzerdaten zu Trainingszwecken
- Keine Weitergabe an Drittanbieter
- Verarbeitung sensibler Gesundheitsdaten gemäß DSGVO

---

# 🚀 MVP-Umfang

Minimal funktionsfähige Version:

- Registrierung
- Eingabe Gesundheitsprofil
- Generierung personalisierter Trainingsplan
- Voice-Coach während Training
- Feedback & einfache Plananpassung
- EU-Cloud-Verarbeitung des LLM
