# Swedish Fifty Spec

## Summary

Swedish Fifty is a mobile-first web app for learning enough Swedish to participate in real trip conversations in about 50 days.

The first version is designed around Eric's July 23-30 Sweden trip, with Stockholm as the primary setting and family conversation as the primary motivation. It should feel like a coach and travel prep companion, not a generic language course.

The product thesis: a short daily mission built from the learner's real trip context will produce more useful Swedish than broad vocabulary progression. The app should prioritize "would a Swede understand me?" over perfect grammar, while still rewarding correctness as a secondary signal.

## User Context

- Trip dates: July 23-30.
- Trip length: about 8 days.
- Location: Stockholm most of the time, with possible travel to southern Sweden.
- Family context:
  - Mom speaks perfect English and Swedish.
  - Aunt speaks good English and perfect Swedish.
  - Grandma speaks okay English and perfect Swedish.
- Current Swedish level: very little Swedish.
- Pronunciation: decent starting point.
- Primary goals:
  - Speak more Swedish.
  - Understand more spoken Swedish.
  - Participate in casual family conversations.
  - Communicate with Swedish-speaking people around Stockholm when necessary.
- Daily study budget: 5-15 minutes.
- Preferred formats:
  - short conversations
  - audio drills
  - speaking aloud
  - push-to-talk voice input

## Product Shape

Swedish Fifty is an adaptive daily speaking coach.

Each day, the learner opens the app and gets one strong mission. The app generates that mission on demand based on permanent memory of the learner's prior mistakes, strengths, and readiness by scenario.

The app should avoid a rigid syllabus feel. It should have a clear 50-day calendar, but the content inside each day should adapt to how the learner is actually doing.

## MVP Scope

### Required

- Mobile-friendly web app.
- Login required.
- Stripe premium tier.
- One free mission after signup.
- One primary daily mission, not unlimited generic drills.
- AI-generated daily lesson when the user opens the app.
- Adaptive lesson generation based on permanent mistake memory.
- Push-to-talk voice input.
- ElevenLabs as the first voice API driver, using the official `@elevenlabs/elevenlabs-js` SDK.
- Configurable ElevenLabs voice model selection.
- Text and audio output for Swedish prompts.
- Roleplay biased toward realistic Swedish speakers.
- Coach behavior outside roleplay.
- Gradual increase in Swedish used by the coach.
- 50-day calendar visible in the app.
- Scenario readiness tracking.
- Casual family Swedish and polite public Swedish.
- Lessons centered on Eric's trip template by default.

### Not Required For MVP

- Offline support.
- Multi-language support.
- A fully generic trip builder.
- Real-time open microphone conversation.
- Panic button mode.
- Native mobile apps.
- Perfect pronunciation scoring.
- Deep grammar curriculum.

## Core Learning Loop

1. User opens the app.
2. App checks the current day, trip timeline, scenario readiness, and remembered weaknesses.
3. App generates one mission for today.
4. User listens to a short Swedish dialogue.
5. User repeats or answers using push-to-talk.
6. App transcribes the answer.
7. App evaluates whether a Swede would understand the answer.
8. App runs a short roleplay that behaves like a real Swedish speaker.
9. App debriefs as a coach.
10. App stores durable learning signals for future lesson generation.

## Mission Anatomy

Each mission should fit into 5-15 minutes.

Recommended structure:

1. Context setup: one or two sentences in English.
2. Listen: short Swedish dialogue at learner-appropriate difficulty.
3. Replay: slower or chunked playback.
4. Speak: 3-6 push-to-talk prompts.
5. Roleplay: short adaptive conversation.
6. Debrief: concise feedback.
7. Memory update: durable weaknesses, strengths, and next focus.

The UI should make one next action obvious. Avoid course-like clutter.

## Scenario Tracks

Readiness should be tracked by real trip scenario rather than generic XP.

Initial tracks:

- Family conversation
- Grandma's birthday
- Stockholm transit
- Food and cafes
- Ferry and day travel
- City interactions
- Listening comprehension

Each readiness score should represent practical confidence, not completion percentage.

Example readiness signals:

- Can greet family naturally.
- Can answer simple follow-up questions.
- Can ask someone to repeat more slowly.
- Can order food politely.
- Can understand basic transit directions.
- Can survive a short Swedish-only exchange.

## 50-Day Arc

The calendar gives structure, but the lesson content remains adaptive.

### Days 1-10: Survival Swedish

Focus on:

- greetings
- thanks
- apologies
- "I speak a little Swedish"
- asking for repetition
- switching to English gracefully
- basic yes/no and short answers

### Days 11-20: Family Swedish

Focus on:

- casual family greetings
- how-are-you exchanges
- talking about the trip
- saying it is good to see someone
- birthday phrases
- simple stories about yourself
- understanding common family questions

### Days 21-30: Stockholm Swedish

Focus on:

- cafes
- restaurants
- public transit
- directions
- tickets
- times
- basic city help

### Days 31-40: Conversation Expansion

Focus on:

- talking about plans
- food preferences
- weather
- travel plans
- family relationships
- where you are from
- what you like
- asking simple follow-up questions

### Days 41-50: Simulation Mode

Focus on realistic mixed scenarios:

- birthday gathering
- dinner with relatives
- ferry ride
- transit confusion
- ordering food
- casual Swedish conversation that does not immediately switch to English

## AI Behavior

### Coach Mode

The coach should:

- speak mostly English at first
- gradually introduce more Swedish when the learner is ready
- keep explanations short
- prioritize practical communication
- give direct feedback
- avoid over-teaching grammar
- point out one or two corrections per mission

### Roleplay Mode

The roleplay character should:

- behave more like a real person than a tutor
- use simple Swedish early
- become more natural as the learner shows progress
- not constantly interrupt to teach
- sometimes ask follow-up questions
- sometimes continue in Swedish instead of switching to English

The app should clearly separate roleplay from debrief. During roleplay, preserve conversational flow. After roleplay, coach.

## Evaluation Model

Primary scoring question:

> Would a Swedish speaker understand what the learner meant?

Secondary scoring questions:

- Was the phrasing natural for the scenario?
- Was the tone appropriate: casual family or polite public?
- Was grammar correct enough?
- Did pronunciation interfere with understanding?
- Did the learner understand the prompt?
- Did the learner freeze or recover?

Avoid punitive scoring. The feedback should be specific and useful.

Example feedback:

- "Understandable, but in Swedish you usually say `Jag skulle vilja...` when ordering politely."
- "You answered the question, but you missed the time phrase. We'll practice times tomorrow."
- "Good family tone. Slightly more natural: `Det ar sa kul att se dig.`"

## Permanent Memory

The app should remember recurring mistakes permanently.

Memory should include:

- recurring vocabulary gaps
- pronunciation issues that affect understanding
- grammar patterns that cause confusion
- scenarios where the learner freezes
- phrases the learner has mastered
- readiness trend per scenario
- Swedish/English balance tolerance
- whether family or public tone is stronger

Memory should drive future mission generation.

Example memory item:

```json
{
  "kind": "weakness",
  "scenario": "family_conversation",
  "pattern": "struggles to answer open-ended follow-up questions",
  "evidence": "Could answer yes/no but froze when asked what he plans to do tomorrow.",
  "nextPractice": "short answers about plans using ska + infinitive"
}
```

## Voice

Voice should start with push-to-talk.

The first voice provider should be ElevenLabs. Implementation should use the official `@elevenlabs/elevenlabs-js` SDK rather than hand-rolled REST calls when practical. The package is documented by ElevenLabs as the official Node SDK, supports text-to-speech conversion and streaming, exposes voice search, and is compatible with Cloudflare Workers.

Voice responsibilities:

- generate Swedish audio for prompts and roleplay
- transcribe learner speech
- support slow replay or chunked playback
- expose enough metadata for intelligibility feedback
- allow the app to choose a voice model by named tier, similar to `@templar/llm`
- expose the resolved ElevenLabs model id in logs and stored attempt metadata

Potential future package:

- `@templar/voice`

The package should eventually own provider abstraction, ElevenLabs SDK integration, browser recording helpers, voice model routing, and voice result types. That package is not part of this spec-only scaffold.

### Voice Model Routing

Voice model selection should be app-configurable and package-mediated, not scattered across app code.

Initial named routes:

- `quality`: Eleven Multilingual v2 (`eleven_multilingual_v2`)
  - Best default for Swedish learning because it emphasizes stability, language diversity, and accent accuracy.
  - Use for new vocabulary, family dialogue, slower listening drills, and high-quality saved audio.
- `fast`: Eleven Flash v2.5 (`eleven_flash_v2_5`)
  - Low-latency and lower-cost option.
  - Use for quick roleplay turns, lightweight previews, and cases where speed matters more than maximum voice quality.
- `balanced`: Eleven Turbo v2.5 (`eleven_turbo_v2_5`)
  - Middle ground between quality and latency.
  - Use when roleplay needs more natural audio than `fast` but should still feel responsive.

Default routing:

- Daily mission dialogue: `quality`
- Slow replay: `quality`
- Roleplay response: `balanced`
- Cheap preview or non-critical UI audio: `fast`

The model route should be overrideable per request for product experiments and cost controls.

## Auth And Payments

The app should require login.

Premium should gate expensive functionality:

- generated daily missions after the free mission
- voice roleplay
- speech transcription
- adaptive debriefs
- permanent memory updates

Free tier:

- one free mission after signup
- enough experience to understand the product

Premium tier:

- subscription through Stripe
- access to the daily adaptive coach

Exact pricing is undecided.

## Data Concepts

These are conceptual entities, not implementation requirements for this spec-only pass.

### User Profile

- user id
- starting level
- target trip dates
- home language
- Swedish confidence
- pronunciation confidence

### Trip Template

- destination: Stockholm
- dates: July 23-30
- trip themes:
  - family
  - birthday
  - transit
  - ferry
  - food
  - possible southern Sweden travel

### Mission

- date
- scenario
- difficulty
- dialogue
- speaking prompts
- roleplay setup
- debrief

### Attempt

- mission id
- prompt id
- transcript
- intended meaning
- intelligibility score
- correctness notes
- pronunciation notes

### Memory Item

- type: weakness, strength, mastered phrase, recurring mistake
- scenario
- evidence
- next practice recommendation

### Scenario Readiness

- scenario key
- score
- confidence label
- evidence summary
- last updated

## UX Principles

- The app should feel calm, focused, and personal.
- The first screen after login should be today's mission, not a marketing page.
- Mobile is the primary viewport.
- The 50-day calendar should be visible but secondary to today's mission.
- Voice controls should be obvious and thumb-friendly.
- The learner should always know whether they are listening, speaking, roleplaying, or reviewing.
- Avoid gamified clutter.
- Avoid random vocabulary.
- Avoid long grammar explanations.

## Example Mission

### Scenario

Dinner with family in Stockholm.

### Listen

Swedish:

```text
Hur var resan hit?
Den var bra, men jag ar lite trott.
Vad roligt att du ar har.
Tack, det ar sa kul att traffa er.
```

Natural English:

```text
How was the trip here?
It was good, but I'm a little tired.
We're so happy you're here.
Thanks, it's so nice to see you all.
```

### Speaking Prompts

- Say that the trip was good.
- Say that you are a little tired.
- Say that it is nice to see everyone.
- Ask how they are doing.

### Roleplay

The AI plays a Swedish-speaking relative. It starts simple, asks one follow-up question, and does not correct the learner until the debrief.

### Debrief

- One thing that was understandable.
- One more natural phrase.
- One thing to practice tomorrow.

## Open Questions

- Exact Stripe pricing.
- Whether to include both literal and natural English translations in the UI.
- Which ElevenLabs Swedish voice should be the default.
- Whether speech-to-text should use ElevenLabs only or a second provider if Swedish transcription quality is weak.
- Whether the first production version should include email/password only or also OAuth.
- Whether mission generation should cache a mission for the day after first open.

## Success Criteria

By the end of the 50-day prep window, the learner should be able to:

- greet Swedish-speaking family naturally
- say simple birthday and family phrases
- answer common questions about the trip
- ask simple follow-up questions
- understand basic family conversation at simplified speed
- order food politely
- ask for help in Stockholm
- handle public transit basics
- recover when they do not understand
- participate in short Swedish exchanges without immediately giving up
