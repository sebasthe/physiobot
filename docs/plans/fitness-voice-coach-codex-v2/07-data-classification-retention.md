# Data Classification and Retention

## Purpose
Define data classes now so the fitness MVP does not create a retention and compliance mess later.

---

## Data classes

### Class A – Operational / low sensitivity
Examples:
- session id
- current exercise id
- timer state
- button clicks
- tool execution status
- transport diagnostics

Typical handling:
- can be logged more freely
- short to medium retention
- no special memory treatment

---

### Class B – Personal coaching data
Examples:
- stable motivations
- coaching style preference
- workout adherence patterns
- frustration signals
- motivational barriers

Typical handling:
- structured storage only
- selective long-term retention
- memory reset/delete supported
- retrieval limited to coaching use

---

### Class C – Sensitive wellness / possible health-adjacent signals
Examples:
- pain mention
- dizziness mention
- mention of recurring discomfort
- exercise limitations

Typical handling:
- stricter routing
- redacted or restricted logging
- avoid casual long-term storage in Stage 1
- in Stage 2 apply medical-mode policy

---

### Class D – Medical / rehab-sensitive context
Examples:
- rehab protocol details
- injury recovery references
- post-surgery limitations
- therapy-specific restrictions
- clinician plan linkage

Typical handling:
- Stage 2 only or tightly restricted
- explicit sensitivity tagging
- stronger retention rules
- separate export/delete coverage
- restricted retrieval

---

## Retention guidance

### Session audio
Default:
- do not retain by default

### Session transcripts
Default:
- ephemeral if used for runtime support
- avoid using as long-term memory source directly

### Session summaries
Default:
- short retention unless product need justifies longer
- safer than raw transcript retention

### Long-term coaching memory
Default:
- only structured, high-value entries
- support reset/delete by user scope

### Sensitive/medical memories
Default:
- stricter retention class
- separate policy path
- explicit deletion/export coverage

---

## Logging rules

### Allowed in standard operational logs
- tool success/failure
- latency metrics
- session lifecycle events
- stage mode
- coarse error diagnostics

### Avoid in standard logs
- raw transcript text by default
- sensitive user statements
- memory payload bodies unless necessary and redacted
- health-related detail in plain text

### Separate restricted logs if needed
- sensitive routing events
- deletion/export audit events
- policy enforcement events

---

## Export and deletion requirements

The architecture should support deletion/export for:
- user profile-linked memories
- strategy summary
- session summaries
- personal coaching preferences
- sensitive memories and stage-specific restricted data

Do not assume that deleting one table is enough. Hidden copies in logs, caches, or analytics sinks must be accounted for.

---

## Implementation recommendation

Represent retention and sensitivity in code.

Example concepts:
- `data_class`
- `sensitivity_level`
- `retention_class`
- `deletion_scope`
- `export_scope`
- `stage_mode`

This should be attached to records and APIs early.
