# User Stories

## Stage 1 – Fitness app

### Epic: Workout execution
- As a user, I want the coach to know which exercise I am currently doing so that the spoken guidance matches the actual workout.
- As a user, I want to continue the workout either by tapping in the app or by voice so that I can stay in flow.
- As a user, I want the coach to pause when I say “stop” or “pause” so that I can recover without fighting the app.
- As a user, I want the coach to repeat an exercise explanation on request so that I can perform the movement correctly.

### Epic: Realtime coaching
- As a user, I want the coach to motivate me while I am exercising so that I feel guided like with a real trainer.
- As a user, I want to ask short questions during the exercise and get a natural, concise answer so that I can stay focused.
- As a user, I want to interrupt the coach naturally so that the conversation feels fluid.
- As a user, I want the coach to stay on training topic so that the interaction does not become distracting.

### Epic: Motivation
- As a user, I want the coach to encourage me when my energy drops so that I keep going.
- As a user, I want the coach to use a tone that feels firm but supportive so that I feel pushed without being alienated.
- As a user, I want the coach to remember what motivates me over time so that the coaching becomes more personal.

### Epic: Memory and personalization
- As a user, I want the coach to remember my stable motivations and barriers so that future sessions feel more relevant.
- As a user, I want the coach to adapt to my preferred coaching style so that the experience fits me better.
- As a user, I want to be able to reset personalization memory so that I stay in control.

### Epic: Privacy
- As a user, I want privacy-friendly defaults so that I do not accidentally create more stored data than necessary.
- As a user, I want the app to avoid storing raw voice data by default so that I feel safer using voice.
- As a user, I want transparency about what is remembered so that personalization feels trustworthy.

---

## Stage 2 – Medical / physio app

### Epic: Rehab-aware exercise guidance
- As a patient, I want the coach to understand the current rehab exercise and therapy phase so that the spoken guidance is appropriate.
- As a patient, I want the coach to ask about pain or discomfort at suitable moments so that unsafe continuation is avoided.
- As a patient, I want the coach to react carefully if I mention pain, dizziness, or discomfort so that the app behaves responsibly.

### Epic: Medical safety boundaries
- As a patient, I want the coach to stay within safe guidance boundaries so that it does not behave like an uncontrolled diagnosis bot.
- As a patient, I want the app to distinguish routine fitness motivation from medically sensitive situations so that sensitive moments are handled more carefully.

### Epic: Sensitive data handling
- As a patient, I want medically sensitive content to be treated differently from normal workout chatter so that my health-related data receives stronger protection.
- As a patient, I want my health-related memory and coaching data to be deletable and exportable so that I remain in control.

### Epic: Medical personalization
- As a patient, I want the coach to remember meaningful rehab motivations and setbacks over time so that it can support me appropriately across sessions.
- As a patient, I want the system to avoid unnecessarily repeating sensitive health details unless they are actually needed so that the experience remains respectful.

---

## Cross-stage system stories

### Epic: State and control
- As the system, I need a canonical workout/session state so that all components remain synchronized.
- As the system, I need tool-based action execution so that spoken claims and actual app behavior stay aligned.

### Epic: Runtime control
- As the system, I need to distinguish filler sounds from true commands so that breathing, counting, or brief acknowledgements do not constantly derail the session.
- As the system, I need a safety path for sensitive utterances so that riskier situations are handled differently.

### Epic: Memory and strategy
- As the system, I need to store only high-value structured memories so that personalization remains useful and privacy-friendly.
- As the system, I need to maintain a compact strategy summary so that the runtime can personalize behavior without loading full history.

### Epic: Compliance and operability
- As the system, I need retention and deletion-ready storage identifiers so that user data can be managed correctly later.
- As the system, I need stage-aware policy flags so that fitness and medical behavior can differ without forking the entire architecture.
