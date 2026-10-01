# IELTS Masterclass · Private Speaking audio and model-slide update

This is the **Cloudflare Workers + D1 version** of the existing IELTS Masterclass. Keep the project ZIP private. Customers receive only the live URL and their individual login code. Payments continue outside the website.

## What the practice dashboard now shows

- Learners can study any of the six existing courses **in any order**. There is **no 20-day plan, starting-band selection, goal-band selection, daily checkbox or manually entered quiz score** in the interface.
- Checking the final practice questions in any of the **11 Reading modules** or the app’s **four Listening sections** saves each complete attempt, its date and its app-checked score. The dashboard compares first and most recent scores **within the same practice set** and lists all attempts. Repeat questions are familiar, so improvement on them **does not prove an IELTS band increase**. A genuinely unseen licensed test is needed for that.
- Writing Task 1/2 practice slides include response boxes. Each submission (150+ / 250+ words respectively) is stored as a **separate dated draft**, not overwritten. Word count is activity, not a Writing band score.
- Speaking practice allows repeat **Part 1, Part 2, Part 3 or combined 11–14-minute mocks**. The browser uploads compressed microphone audio privately in D1 chunks; the owner can play it in **/admin → Learner Writing & Speaking submissions**, and authorised school teachers can play their own school’s learners in **/progress**. The learner can replay their own recordings. Older metadata-only sessions have no playable audio. Recordings are not automatically rated or transcribed.
- You and the teacher can see learner activity: the owner sees all non-owner accounts; a school teacher sees **only current students in that school**. The owner or authorised school teacher can attach a specific comment and a **1–5 teaching rating (not an IELTS band)** to a Writing draft or Speaking session. Multiple ratings over time help you see development where work has actually been reviewed.
- Specific practice model answers now appear on the **next slide after the exercise** in Reading, Writing Task 1/2 and Speaking; Listening already places its transcript and answers on the slide immediately after Listen & Answer. Earlier teaching examples unrelated to the end-of-module practice remain where they are.
- Older customer accounts, schools, welcome-name update, feedback and earlier progress records remain intact. Older planning and manually entered data is retained in D1 but does not drive the new learning view. This migration imports the existing first practice attempt, latest stored Writing draft and Speaking metadata into the new history; earlier Writing drafts already overwritten by the previous app cannot be recovered.

**Limits:** A learner can memorise a repeated answer, paste poor-quality 250-word text or run a microphone without speaking well. The activity dashboard does not certify genuine improvement or calculate an IELTS band. Teacher observation, review and fresh licensed tests remain important. Paid users can copy lessons they may legitimately view; no site can fully stop this. Do an independent security/privacy review before scaling.

## Free audio pilot — important consent and capacity limits

**This is not unlimited or guaranteed long-term free storage.** Cloudflare D1 Free has a 500 MB/database limit; this app intentionally caps compressed recordings at **5 MB each**, **eight ready recordings per learner**, **120 MB total reserved app capacity** (including pending uploads), and retains audio for **up to 30 days**. The app deletes old audio during the next audio-upload initiation; expired sound cannot be played even before cleanup. Owners can delete any recording sooner in `/admin` or `/progress`. If a browser ignores the requested low audio bitrate, a full mock may exceed 5 MB; that recording is **not saved**, and the learner is told. Large schools, high traffic, or frequent full mocks can exhaust D1 Free read/write allowances or database capacity. Pending/incomplete uploads count toward storage until retention cleanup. Check D1 usage; never assume this free pilot scales without a paid plan.

Tell learners/schools beforehand that written responses and **voice recordings** are uploaded, who can review them, and that school reassignment changes which teacher may access previous work. Download backups cautiously: D1 exports include private content, including audio BLOBs. The audio model uses D1 rather than R2 because activating R2 requires subscription/checkout even when within an included free tier. No billing/card details are required in this app.

## Updating your *already deployed* progress website (Windows PowerShell)

Production migration status is not confirmed. Wrangler checks migration history and applies **any missing migrations from `0001` through `0006_private_audio.sql`**. If `0004`/`0005` were already deployed, only `0006` is new; do not rerun owner bootstrap. The new Worker must not be deployed before the pending remote migrations succeed.

1. Extract this new ZIP into a **new** `ielts-cloudflare` folder. Open PowerShell in that folder. Keep your older ZIP and SQL backup privately until the update works.
2. Run `npm.cmd install` then `npm.cmd run check`.
3. Recommended fresh private backup: `npx.cmd wrangler d1 export ielts-members --remote --output backup-before-private-audio.sql`. This file contains customer data; keep it private. Do not share its temporary signed download URL.
4. Run **`npm.cmd run db:remote`**. Confirm migration(s), wait for every migration to show ✅. The migrations are additive, not a deletion of your schools or accounts. If Wrangler displays something unexpected, stop and send a screenshot with any signed links/credentials redacted.
5. Run **`npm.cmd run deploy`** only when the migrations succeed. Never upload this project as public Cloudflare Pages files.
6. Test with a separate student account: check Reading and Listening answers and find the practice-specific model on the **next slide**; submit two Writing drafts and read both in `/admin`; record a short Speaking Part 1 after the 30-second minimum, confirm the owner can **play** it in `/admin`, and test a longer compressed mock. School teachers must not see or play a different school’s recordings. Do not use a real learner for experimental scores.

**Privacy:** submitted Writing text, practice scores, dates, microphone durations, private Speaking audio chunks and teacher comments are stored in D1; Speaking audio is accessible only to the learner, owner and (for school learners) currently authorised school teachers. Tell schools and learners what is recorded, protect SQL exports, and plan a data retention/deletion process. If a learner is moved to a different school, teachers at the newly assigned school can see that learner's previously recorded activity, writing and any retained audio.

## Initial setup for a new owner: create a D1 database

In your **own Cloudflare account**:

1. In the Cloudflare dashboard, open **Storage & databases → D1** (or search for “D1”).
2. Click **Create database**. Name it **`ielts-members`**. Leave the default location choice if you are unsure.
3. The database ID you supplied, **`7fd6b566-db8c-4321-b572-c796ec748d56`**, is already set in `wrangler.jsonc`. Confirm that the database is named **`ielts-members`**. This ID is not a password; never share your Cloudflare password, API tokens, or login access code.

**Do not upload the original HTML or this whole project into Cloudflare Pages as ordinary public files.** The supplied `wrangler.jsonc` sets `assets.run_worker_first=true` so the Worker checks every asset request before returning a protected course. A wrong deployment configuration could make lessons public.

## Full deployment steps (we can do these together after D1 is created)

You need Node.js **22 or newer** and a computer terminal for Wrangler. If you cannot install Node.js, tell me before proceeding so we can use a dashboard/Git-based approach.

```bash
cd ielts-cloudflare
npm install
npx wrangler login
```

The supplied `wrangler.jsonc` already contains your D1 Database ID. Keep the database name `ielts-members` (or change both config and scripts consistently). Apply schema migrations **to the remote Cloudflare database**:

```bash
npm run db:remote
```

Create your private owner login. The following command generates a random access code, saves only its SHA-256 digest in D1, and prints the code **once**. Run it on your own machine; keep the code privately:

```bash
node scripts/create-owner.mjs you@example.com "Your Name" --remote
```

Then deploy the Worker and its protected assets:

```bash
npm run check
npm run deploy
```

Wrangler will print your `*.workers.dev` address. Open `/login`, use the owner email and generated code, and add a test school or student in `/admin`. After confirming it works, send customers only the website URL and each customer's private code.

### Required security checks before inviting anyone

- In a private/incognito window, `/api/decks/rd` must return **401** and `/course-data/rd.html` must return **404**. Never use a deployment that serves this raw file publicly.
- A paid test account opens a lesson; an expired or paused account gets **403**; a school cannot exceed its seat limit.
- Rotating a code signs out an already signed-in user. An old access code must no longer work.
- Check your Cloudflare usage dashboard regularly. Free-tier limits can block access when exceeded. Keep external backups of your membership database and original course files.

## Local testing (developer use)

```bash
npm install
npm run db:local
node scripts/create-owner.mjs owner@example.com "Owner" --local
npm run dev
```

The owner code printed by the local command is for local testing **only**; local D1 and production D1 are separate. `npm run check` validates the Worker script, frontend scripts, asset sizes and authentication-first configuration. Optional real-browser checks use `npm install --no-save playwright`, `npx playwright install chromium-headless-shell` and (if prompted) `npx playwright install-deps chromium-headless-shell`; against a fresh local fixture run `node tests/browser-smoke.mjs` and `node tests/record-browser.mjs`. This project has also been exercised locally against Wrangler with paid, expired, suspended, and rotated accounts. This release was tested against a fresh **local-only** D1 with six fixture accounts: repeat score history, writing revisions, private chunked audio, Range playback, owner deletion, expiry, teacher reviews, school scoping, protected assets and disabled legacy day/pathway controls. Browser smoke checks exercise the model-answer slides and owner Writing review. The integration script is `tests/progress.integration.mjs`; it requires a separately running Wrangler dev server on port 8787 and `PROGRESS_TEST_DB` pointing at the same **fresh local** D1 persistence directory. It never uses `--remote`.

## Architecture and limits

The six decks are Worker **static assets**, each under 25 MiB; their direct URLs are denied. `run_worker_first=true` is essential: remove it and the access design is unsafe. D1 stores member records, school plans, sessions, login attempts, SHA-256 digests of randomly generated codes, account-linked learning activity, every app-checked practice attempt, separate Writing drafts, Speaking session metadata, older archived entries, and teacher reviews/comments. Speaking audio is stored in D1 BLOB chunks within the pilot limits; it is not stored in R2. The Worker streams course files after checking account status in D1. No payment-card information is collected by this site.

Cloudflare's free tiers have request, CPU and database quotas and can change. This is suitable for an early, small launch, **not** guaranteed unlimited free hosting. If it grows, plan for a paid service and formal backups. The owner remains responsible for customer privacy, terms of sale, and protecting account credentials.
