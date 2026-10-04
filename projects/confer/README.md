# Confer

Local-first discovery review and drafting at **confer.breli.app**. Breli is the parent domain; the project and product are Confer.

## Run

Requires the repository's Node 24 and pnpm 11 toolchain.

```sh
pnpm install
pnpm dev confer
```

Open `http://127.0.0.1:5189`. The fictional sample matter demonstrates review and drafting; create a separate matter before importing real documents.

## Workflow

1. Create a matter and enter known case details
2. Import a text-based PDF, DOCX, TXT, or pasted numbered responses
3. Check extracted text and detected response counts
4. Review potential findings, add internal notes, or dismiss findings
5. Generate and edit a meet-and-confer letter or motion-to-compel outline
6. Copy text or export TXT / Word

The parser accepts headings such as `REQUEST FOR PRODUCTION NO. 1`, `RESPONSE TO REQUEST FOR PRODUCTION NO. 1`, `SPECIAL INTERROGATORY NO. 17.1`, and `RESPONSE NO. 1`. Generic headings use the selected request type; response-only documents remain marked as missing the original request.

## Boundaries

- Deterministic, rules-based triage—not AI analysis or a legal-sufficiency determination
- Flags generalized objections, conditional responses, unclear production timing, privilege references without a log reference, nonspecific records-based answers, uncertain admissions, and express refusals
- No legal research, invented authorities, calculated court deadlines, sent letters, or filed motions
- Motion output is a working outline with jurisdiction-specific research and procedural placeholders, not a filing-ready motion
- No OCR; scanned PDFs require OCR before import
- Import limits: 10 MB, 200 text pages, 300,000 characters, 250 responses per matter
- Formatting can vary; counsel must verify all detected responses against the original document
- Internal review notes are excluded from letters; motion outlines label them as internal notes
- Existing drafts are snapshots. New review decisions and matter edits do not silently rewrite them

## Privacy

Document extraction and drafting run entirely in the browser. The app has no document-upload API, AI provider, analytics, or external fonts. Original file bytes are not retained; extracted source text is retained in the workspace.

Default storage is **session-only**. Optional device saving uses **unencrypted localStorage** and requires explicit opt-in in workspace settings. Turning saving off removes the saved browser copy. JSON backups contain source text, notes, and drafts and are also unencrypted. Follow firm policies for confidential and privileged material; do not use device saving on shared or untrusted devices.

## Verify

```sh
pnpm --filter confer-web check
pnpm --filter confer-web test:e2e
pnpm --filter confer-web build
pnpm --filter confer typecheck
pnpm check:monorepo
```

Unit tests are in `apps/web/test/`; desktop and mobile Playwright tests are in `apps/web/test/e2e/`. Set `CONFER_TEST_URL` to test a production preview instead of the development server.

## Deploy

`alchemy.run.ts` provisions the static Cloudflare app on `confer.breli.app` using the shared `@templar/deploy` setup. Main-branch CI owns deployment. No auth, database, server-side storage, or external model keys are needed for this local-first version.
