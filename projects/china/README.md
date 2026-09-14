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
- Existing `TEMPLAR_AUTH_SECRET` and Cloudflare/Alchemy secrets remain required; no AI or voice
  provider key is needed
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
pnpm --filter china-web exec playwright install chromium
pnpm --filter china-web test:e2e
```

The **China auth diagnostics** workflow reads deployed issuer/binding metadata and reports account
verification/access checks without logging emails, user IDs, cookies, or tokens. Its optional owner
handoff probe creates one 60-second, single-use code for an already verified platform owner, runs
it through the live central exchange and app callback, checks owner access and signed-out denial,
then cleans up. It never changes Google/browser sessions or creates users. Callback failures show
a fixed diagnostic stage instead of blaming every failure on the invite list.

Unit tests cover real SQLite queries, encrypted SSO sessions, signed owner access, guest revocation, CSRF, grading,
idempotent progress, cheers, UI flows, and microphone cleanup. Browser tests cover desktop/mobile,
the real unauthenticated endpoint, lessons, and escaped offline downloads. Authenticated browser
fixtures exist only in test request interception—there is no production auth bypass.

## Learning design

Ten missions, easiest to hardest: first words → survival requests → water/prices → ordering food →
payments → sights/signs → trains → nightlife → KTV → help/getting home.

- No assumed Chinese knowledge: characters, pinyin, tones, short chunks, and model audio first
- Learn → listen/repeat/record → recognition/listening checks; typed pinyin or Chinese is optional
- Teach sign vocabulary before testing it; emergency phrases remain unlocked
- Server-graded exercises; one completion stamp per mission, no repeat-point farming
- Reviews at 1/3/7/14/30 days; mistakes return in five minutes
- Crew names, progress, activity, and one cheer per member per completion persist in D1

Edit `apps/web/src/lib/curriculum.ts` for stories, phrases, or the roster. Preserve mission IDs and
phrase order once people have progress: stored mastery uses mission ID plus phrase index.

## Voice, privacy, and travel limitations

- Playback uses the device's Mandarin speech voice. Install a Chinese (China) voice if missing;
  availability and offline playback depend on browser/OS
- Microphone recordings stay in memory in the current tab, stop after 20 seconds, and are released
  on navigation. No recording uploads, speech-recognition vendor, or pronunciation scoring
- Text recall ignores tone marks; it does **not** assess tones. Ask the best man for native feedback
- Private responses use `no-store`; the public client bundle contains no curriculum or roster
- Google sign-in may be inaccessible on mainland networks. Sign in and download the text-only HTML
  pocket guide before departure; the full app is not offline-enabled
- Offline downloads are readable by anyone with the file. They contain phrases and an optional
  hotel address, not the roster, progress, or scenario stories
- Review current official travel/payment/attraction guidance linked in the pocket guide. Carry
  translated allergy information and seek qualified help for medical or legal emergencies
