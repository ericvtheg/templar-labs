# China

Private Mandarin clubhouse for the bachelor trip to Beijing and Shanghai. Deployment target:
**https://china.ericventor.com**.

## Access and deployment

- Uses existing Templar Google SSO; no shared passwords or new OAuth client
- Set GitHub Actions repository secret **`CHINA_CREW_EMAILS`** to the invited Google emails
  (comma-, semicolon-, or whitespace-separated)
- The deploy workflow passes the secret to Alchemy, which binds it as encrypted `CREW_EMAILS`
- Verified central Templar administrators retain owner access through the signed SSO admin claim
- Missing/empty allowlists deny all other accounts. Verified email and guest membership are checked
  on **every** private API request, not just sign-in; removing an invite takes effect after redeployment
- Uses the existing shared `ELEVENLABS_API_TOKEN`, `OPENROUTER_API_TOKEN`, `TEMPLAR_AUTH_SECRET`,
  and Cloudflare/Alchemy credentials; no China-specific provider keys
- Voice/model selection lives in `apps/web/src/lib/voice-config.ts`, not environment variables
- A private R2 bucket caches approved speech; D1 coordinates generation and limits paid practice calls
- D1 migrations run through the existing `d1Database` deployment resource

After changing the GitHub secret, run the **Deploy** workflow manually to redeploy. Changing a
secret alone does not update the running Worker. Never commit actual email addresses.

## Local development

Use the monorepo's Node 24 and pnpm 11 setup. Add `CHINA_CREW_EMAILS` to the ignored **root**
`.env`, alongside the existing shared credentials.

```sh
pnpm install
pnpm --filter china dev
```

Local URL: `http://localhost:5187`. Central SSO returns to the local callback. Alchemy generates
`apps/web/.alchemy/local/wrangler.jsonc`; initialize it with the dev command before standalone
Vite builds or browser tests.

```sh
pnpm --filter china-web check
pnpm --filter china typecheck
pnpm --filter china-web build
pnpm --filter china-web exec playwright install chromium webkit
pnpm --filter china-web test:e2e
```

The **China auth diagnostics** workflow reads deployed issuer/binding metadata and reports account
verification/access checks without logging emails, user IDs, cookies, or tokens. Its optional owner
handoff probe creates one 60-second, single-use code for an already verified platform owner, runs
it through the live central exchange and app callback, checks owner access and signed-out denial,
then cleans up. It never changes Google/browser sessions or creates users. Callback failures show
a fixed diagnostic stage instead of blaming every failure on the invite list. Enable **probe_learning**
with the owner probe to test live normal/slow speech, cache hits, signed-out audio denial, transcription,
and AI feedback. This incurs small provider usage, uses a generated hello clip, and deletes its test
coach scene; it never changes the owner’s profile or mastery.

Unit tests cover real SQLite queries, encrypted SSO sessions, signed owner access, guest revocation,
CSRF, grading, matching, private audio/ranges/cache leases, provider limits, scene ownership,
emergency-number ground truth, cheers, UI flows, and microphone cleanup. Browser tests cover
desktop/mobile Chromium and mobile WebKit, including delayed audio playback,
the real unauthenticated endpoint, lessons, and escaped offline downloads. Authenticated browser
fixtures exist only in test request interception—there is no production auth bypass.

## Learning design

Twelve missions: first words → survival requests → groom-approved compliments → water/prices →
food → payments → market bargaining → sights/signs → trains → nightlife → KTV → getting help.

- Interactive foundations unpack 你 + 好, pinyin, isolated sounds, and the third-tone change in 你好
- Remix phrases as flip cards, ears-only listening, or recorded/typed replies; choose the encounter order
- Learn visual sign walls, then connect Chinese to English by tap or drag; market receipts teach unit versus total prices
- AI crew scenarios accept conversational replies, questions, pinyin, and English first attempts within each lesson
- A creator-attributed Chinese restaurant video offers a gist challenge; an original audio scene works when YouTube is blocked
- Sourced trip-hype cards cover history, food, skyline, nightlife, and dated price examples—not guaranteed bookings or discounts
- Core recall and server-verified signs earn one stamp per mission; AI feedback and video self-reflection do not manufacture mastery
- Emergency numbers are fixed facts checked by code, not generated or graded by the LLM
- Reviews at 1/3/7/14/30 days; mistakes return in five minutes
- Crew names, progress, activity, and one cheer per member per completion persist in D1

Edit `apps/web/src/lib/curriculum.ts` for stories, phrases, or the roster. Preserve mission IDs and
phrase order once people have progress: stored mastery uses mission ID plus phrase index.
Matching decks live in `activity-content.ts`; verified facts, price caveats, and source links live in
`trip-hype.ts`. Keep factual corrections separate from the AI’s fictional scene-writing.

## Voice, privacy, and travel limitations

- Listen uses ElevenLabs Multilingual v2 in Chinese; normal and slow variants are generated separately
  and cached in private R2. Only the finite lesson/sign/foundation catalog can be synthesized
- The included voice works with the current account. Library voices require an eligible ElevenLabs
  plan; choosing a native-Mandarin library voice later means changing the code constant
- Browser Mandarin speech is an explicit fallback, never silently presented as ElevenLabs
- Recordings stop after 20 seconds and remain in the tab unless the learner explicitly chooses
  transcription. That action sends audio to ElevenLabs Scribe; the app does not store recordings
- Transcription checks recognized words, not tones or accent. Learners can edit or type instead
- The coach uses Qwen 3.7 Flash with reasoning disabled for interactive latency; selection lives in
  `coach.server.ts`. Scene generation receives the English goal, not the answer to copy
- AI receives lesson context, crew first names, and submitted replies—not Google emails or account IDs
- Coach scenes expire after 30 minutes; expired rows are deleted on the next scene creation. Only
  the latest two reply/feedback exchanges are retained per scene; six replies per scene maximum
- Per-account hourly limits: 60 coach calls and 40 transcriptions. Cached playback remains available
- Private responses use `no-store`; crew-specific curriculum, roster, and progress require auth.
  Generic character foundations and the original fallback listening scene are public client code
- YouTube loads only on request. Video reflections stay in the current view and are self-assessed,
  not falsely graded against an unavailable transcript
- Google sign-in may be inaccessible on mainland networks. Sign in and download the text-only HTML
  pocket guide before departure; the full app is not offline-enabled
- Offline downloads are readable by anyone with the file. They contain phrases and an optional
  hotel address, not the roster, progress, or scenario stories
- Review current official travel/payment/attraction guidance linked in the pocket guide. Carry
  translated allergy information and seek qualified help for medical or legal emergencies
