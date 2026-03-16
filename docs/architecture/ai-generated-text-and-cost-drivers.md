# AI-Generated Text and Cost Drivers

Purpose: Explain where PhysioBot currently generates AI text, how often each path runs, and which current behaviors are most likely to increase API costs.

## Scope

This page focuses on current code paths that call Anthropic for text generation or structured JSON generation.

It also points out related paid speech and memory paths when they materially affect the overall API bill.

This is a code-based runtime map, not invoice telemetry. The repo does not currently have one central ledger that records provider usage by feature.

## Summary

| Flow | What is generated | When it runs | Typical frequency | Main model |
| --- | --- | --- | --- | --- |
| Initial plan creation | training plan text/JSON | when a new plan is created | once per creation request | Claude Haiku |
| Session plan adjustment | updated plan text/JSON | after feedback submission with plan adjustment enabled | once per submitted session | Claude Haiku |
| Session insight extraction | structured session insights JSON | after feedback submission when a transcript exists | once per submitted session with transcript | Claude Sonnet |
| Adaptive cue preview | short exercise intro cue | when the current exercise changes | once per exercise | Claude Haiku or Sonnet |
| Adaptive cue playback | short exercise intro cue | when the intro is actually spoken | once per exercise | Claude Haiku or Sonnet |
| Adaptive repeat cue | repeated short cue | when the user asks to repeat | once per repeat action | Claude Haiku or Sonnet |
| Live voice reply | coaching reply text | when a real user turn is sent to voice orchestration | once per user turn | Claude Haiku or Sonnet |

## The Most Important Current Multipliers

- Voice sessions are not just "one AI call per session". They are recurring runtime calls.
- Exercise intro cues are currently requested twice: once for preview and once again for actual playback.
- End-of-session feedback can add up to two more Anthropic calls.
- Safety and motivation turns can route from Haiku to Sonnet, which increases cost per turn.
- If ElevenLabs is active, speech costs sit on top of the text-generation costs.

## Plain-Language Cost Map

The current product has four main AI text-generation moments:

1. When a plan is created.
2. When a finished session is reviewed and the plan is adapted.
3. When a finished session transcript is summarized into structured memory.
4. During a live voice session, both for exercise cues and for actual back-and-forth conversation.

The first two are easy to expect.

The last two are the ones that are easier to miss:

- voice sessions generate text repeatedly, not once
- adaptive exercise cues can generate text even before the user speaks

## Detailed Flows

## 1. Initial Plan Creation

Route: `/api/generate-plan`

What happens:

- user profile and health profile are loaded
- relevant memories are fetched from Mem0
- Claude generates a structured plan
- the generated exercises are stored as a new `training_plans` row

Frequency:

- usually once when a new plan is created
- not a per-session cost unless the product or user triggers plan creation again

Cost note:

- this is a clear one-time generation event
- it is not the most likely cause of a sudden cost increase by itself

## 2. Session Plan Adjustment

Route: `/api/feedback`

What happens:

- the session is marked complete
- gamification is updated
- if `skipPlanAdjustment` is `false` and feedback exists, Claude generates an updated exercise plan
- the new plan is stored as a new `training_plans` row and becomes the active plan

Frequency:

- once per submitted feedback flow
- in practice, this can be once after every completed session if the user submits feedback normally

Cost note:

- this is a recurring post-session Anthropic call
- it is easy to underestimate because it happens after the workout, not during it

## 3. Session Insight Extraction

Path: `/api/feedback` -> `extractSessionInsights()`

What happens:

- if a transcript exists, Claude Sonnet analyzes the conversation
- the model returns structured JSON such as motivation hints, personality preferences, training patterns, and life context
- the extracted insights are written to Mem0 if privacy rules allow it

Frequency:

- once per submitted feedback flow when a transcript exists
- voice sessions are likely to produce such a transcript

Important nuance:

- skipping plan adjustment does not skip this path
- the feedback page still sends the transcript, and insight extraction still runs if transcript data exists

Cost note:

- this is not user-visible prose, but it is still a paid Anthropic generation call
- it uses Sonnet, so the cost per call is more meaningful than a small Haiku helper call

## 4. Live Voice Replies

Route: `/api/voice/realtime/stream`

What happens:

- a committed user utterance is sent to the orchestration layer
- the orchestrator resolves mode, memory, sensitivity, and physio context
- Claude generates a streamed reply
- the client speaks the returned text

Frequency:

- once per real user turn that reaches orchestration
- this is the main repeated text-generation path during live voice usage

Important nuance:

- not every committed utterance becomes a Claude call
- filler, acknowledgments, and simple mapped commands can be short-circuited before the voice LLM request

Cost note:

- this is the most obvious "cost grows with usage" path
- more conversation means more Anthropic requests
- some turns route to Sonnet instead of Haiku when safety or motivation handling is needed

## 5. Adaptive Exercise Cues

Route: `/api/voice/session`

What happens:

- the session player asks for short dynamic exercise cues such as intros and repeats
- these are generated through the same orchestration layer as other voice replies

Current behavior:

- when the current exercise changes, one intro cue is requested for preview
- when the exercise intro is actually played, another intro cue is requested again
- if the user taps repeat, another cue is requested

Frequency:

- at least once per exercise for preview
- at least once per exercise again for playback
- plus once per repeat action

Cost note:

- this is a likely hidden multiplier
- in the current implementation, a normal exercise intro can already cause two separate Anthropic calls before the user says anything

## Example: Why Voice Sessions Can Get Expensive Quickly

Example session:

- 8 exercises
- voice mode enabled
- the user speaks 6 meaningful times
- the user submits feedback at the end

Approximate Anthropic call count:

- 8 adaptive cue preview calls
- 8 adaptive cue playback calls
- 6 live voice reply calls
- 1 session plan adjustment call
- 1 session insight extraction call

Approximate total:

- about 24 Anthropic calls in one session flow

This example does not include:

- the original plan-creation call
- any extra repeat-cue requests
- the possibility that some turns use Sonnet instead of Haiku
- ElevenLabs speech costs

That is why the bill can rise even if the product still feels like "one workout session".

## Model Routing Matters for Cost

Voice orchestration is also a model router.

Current behavior:

- `performance` and `guidance` turns use Haiku
- `safety` and `motivation` turns use Sonnet
- session insight extraction also uses Sonnet

This means two sessions with the same number of turns can still have different costs.

If the session contains more pain, safety, or motivational probing, the average cost per turn can increase.

## Related Paid Paths That Are Not Text Generation

These are not Anthropic text-generation calls, but they can still contribute to a rising API bill.

### ElevenLabs Speech

When `NEXT_PUBLIC_VOICE_PROVIDER=elevenlabs`:

- realtime speech-to-text is active during the live voice session
- text-to-speech is called whenever spoken output is played through ElevenLabs

This includes:

- generated exercise intros
- generated live voice replies
- repeat prompts
- silence prompts

Important nuance:

- the streamed voice reply is spoken in chunks, not always as one single audio request
- so speech costs can multiply inside one turn even when there was only one Anthropic generation call

### Mem0

Mem0 is used for:

- memory search during plan creation
- transcript storage after sessions
- insight storage after extraction
- memory retrieval during voice orchestration

This is separate from text generation, but it is part of the external-service cost footprint.

## What Does Not Currently Add Extra Anthropic Cost

- client-side utterance classification in the browser voice flow does not call Anthropic
- browser TTS does not use paid speech APIs
- Kokoro TTS runs locally and does not use a paid remote text-to-speech API

## Current Conclusion

If API costs rose significantly, the most likely current reasons are:

- higher voice-session usage
- the per-exercise adaptive cue generation pattern
- repeated live voice turns within one session
- post-session insight extraction
- Sonnet routing on safety or motivation turns
- ElevenLabs speech usage on top of the text-generation paths

The biggest "easy to miss" issue in the current code is that exercise intros are generated twice per exercise: once for preview and once again for playback.

## Related Documents

- [Training Plan Lifecycle](training-plan-lifecycle.md)
- [Memory Architecture](memory-architecture.md)
- [Voice Orchestration](voice-orchestration.md)
- [Voice Provider Matrix](voice-provider-matrix.md)
