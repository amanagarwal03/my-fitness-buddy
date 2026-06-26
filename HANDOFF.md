# My Fitness Buddy — Handoff

> Last updated: 2026-06-26. Read this top-to-bottom before starting work, then
> read `AGENTS.md` (Expo SDK 56 docs rule) and `src/` for the area you're touching.

## What it is
Expo SDK 54 / React Native 0.81 app (TypeScript, expo-router, React Compiler). Nutrition tracking (photo → Gemini nutrition analysis, barcode, food search, goals, BMI, body composition) + workout tracking (sets, cardio, progress, sessions) + coach sharing. Backend: Supabase (auth PKCE, Postgres w/ RLS, Storage, Edge Functions `analyze-meal` + `food-search`). Repo: `/Users/amanagarwal03/Desktop/Claude Projects/My Fitness Buddy`.

## Where it's live
- **Web app (mobile site):** https://myfitnessbuddyapp.netlify.app/ — built with `npx expo export --platform web` → `dist/`. **Redeploy:** drag the `dist/` folder onto the **Deploys tab** drop zone (NOT /drop, which makes a new site). `dist/_redirects` (`/* /index.html 200`) is what makes routing work.
- **Privacy policy:** https://myfitnessbuddypartner.netlify.app/
- **Play Console:** app `com.myfitnessbuddy.app`, Internal testing.
- **Supabase:** project ref `cywwfeebpklgyesauqvt`.

---

## ✅ DONE — Onboarding redesign (this session)

`src/app/onboarding.tsx` step-1 "About you" was rebuilt; `npx tsc --noEmit` is clean. What shipped:
1. **Filled-vs-empty clarity** — name/height/weight inputs get a primary-tinted 1.5px border once they hold a value (`filledBorder` helper), so a filled field no longer reads like a greyed placeholder.
2. **Card gender selector** — `GenderSelect` extracted to `src/components/gender-select.tsx` (exports the component + `Gender` type) and now used by BOTH `onboarding.tsx` and `(tabs)/profile.tsx` (local copy + its styles removed from profile).
3. **DOB calendar** — text field replaced with `<DobPicker value={dob} onChange={setDob} />`.
4. **Unit dropdowns** — new `MeasureField` + `UnitDropdown` (local to onboarding): height has a cm/in dropdown (default cm), weight has kg/lbs (default kg). Toggling a unit converts the shown value; height stored canonically as `height_cm` (in→cm via `CM_PER_IN`), weight via `toKg`. Inputs run through `sanitizeDecimal`.

Original asks kept below for reference.

---

### Original task spec — Onboarding redesign

`src/app/onboarding.tsx` was the only feature still to build. User's complaints + asks (verbatim intent):
1. **Placeholders are confusing** for name / height / weight — can't tell if a field is already filled. Make filled-vs-empty visually obvious (e.g. clearer labels, filled-state styling, or remove ambiguous greyed placeholders).
2. **Gender selection is unintuitive.** Replace the `SegmentedControl` with the nicer **card selector**. That card UI already exists as `GenderSelect` — but it's a **local (non-exported) component inside `src/app/(tabs)/profile.tsx`**. ⇒ First extract it to a shared `src/components/gender-select.tsx`, then use it in both profile and onboarding.
3. **No calendar for DOB.** Replace the text `Field` (currently `formatDobInput`) with the existing `src/components/dob-picker.tsx` (`<DobPicker value={dob} onChange={setDob} />`, stores ISO `YYYY-MM-DD`). Same component profile already uses.
4. **No inches option for height + want unit dropdowns.** Add a **dropdown unit selector next to BOTH the height field (cm / in) AND the weight field (kg / lbs), each with a sensible default selected** (default cm + kg). Height is currently cm-only. Convert in→cm on save (height stored as `height_cm`); weight already uses `toKg(value, unit)` from `src/lib/units.ts`.

Current file structure to preserve: 3-step wizard (`step` state), gradient hero, segmented progress bar, `handleFieldFocus` keyboard scroll, `finish()` upserts `profiles` + `nutrition_goals`, then `markOnboarded()` + `router.replace('/(tabs)/nutrition')`. Keep all that; only redo the step-1 "About you" inputs.

Verify with `npx tsc --noEmit` (cannot visually verify authed screens — test creds fail on this dev Supabase). Note: expo typed-routes `.d.ts` only regenerates when the dev server boots (`preview_start`), NOT on `expo export` — if tsc complains about a route, boot the server once.

---

## ✅ Done in code this session (most still need DEPLOYING — see below)
- **Food search accuracy** — new `supabase/functions/food-search/index.ts` Edge Function proxies search + barcode server-side (OFF's good search endpoint has no CORS header; OFF throttles browsers with no User-Agent). Prefers **USDA FoodData Central** (accurate US-branded label data, real servings), merges with **OpenFoodFacts** in parallel for global + India coverage. **De-dupes by name+brand and ranks most-complete entries first** (`dedupeAndRank`/`qualityBucket`) so one good row per item, not ten. ON Gold Standard whey verified ~24g protein/serving.
- **Barcode reliability** — routes through the Edge Function (server-side UA); 404 → graceful "no food found / may not be a food product"; `ManualEntry` hoisted to module scope so the keyboard no longer closes per keystroke.
- **Food search UX** — MFP-style inline rows (chevron / serving pills / qty stepper / Log), RECENT list, no more full-screen flash on each keystroke.
- **Body composition** — `src/app/(tabs)/body.tsx` (+ `src/lib/bodyStats.ts`): ideal-weight hero, metrics grid (BMI/Body fat/Muscle/Subcutaneous/BMR/Metabolic age), collapsible measurements (Neck/Chest/Biceps/Waist/Hips/Thighs, prefilled estimates), cm/in toggle, goal+activity → recommended kcal w/ Apply-to-goals. Reachable from bottom bar + left nav. Coach read-only view at `src/app/shared/body/[ownerId].tsx` (gated on `share_body`).
- **Desktop "real site" layout** — `src/components/desktop-shell.tsx` left sidebar (Nutrition/Workout/Body/Profile + Share/Goals/Sign out), seamless centered frame.
- **Menu** — `☰` on all screens, back-arrow-next-to-☰ removed (`src/components/side-nav.tsx`); all tabs in the menu.
- **Coach sharing moved OUT of profile INTO `src/app/share.tsx`** ("Share & coaches") with per-toggle upsert (`share_name/age/gender/body`). This fixed the "toggling preferences says error" bug (profile auto-save was upserting `share_body` before its migration existed).
- **Google sign-in button** — official 4-color `src/components/google-g-logo.tsx` + official white button style in `src/app/(auth)/sign-in.tsx`. (The 400 was Google provider not enabled — a dashboard config task, see below.)
- **Web sign-out persistence** — `src/lib/supabase.ts` now uses default localStorage on web (was AsyncStorage); `src/lib/auth.tsx` strips the one-time `?code=` after OAuth exchange. (Best-guess fix; re-check if it recurs — may need refresh-token/JWT-expiry look.)
- Shared components added: `dob-picker.tsx`, `toggle-row.tsx`, `google-g-logo.tsx`.
- Earlier P1+P2: coach workout detail, auto-collapse exercises, web Refresh button, continue-session (10 min), merge-sessions, edit-session kind-aware, `duration-stepper.tsx`.

## 🚀 Deploy / config steps YOU still need to do
1. **Supabase migrations** — apply any unapplied of `0008`–`0013` (latest two: `0012_body_measurements.sql`, `0013_share_body.sql`). Via SQL editor or `npx supabase@latest db push`.
2. **`food-search` Edge Function:**
   - `npx supabase@latest secrets set USDA_API_KEY=<key> --project-ref cywwfeebpklgyesauqvt` (free key: https://api.data.gov/signup). Without it the function still works, falling back to OpenFoodFacts only.
   - `npx supabase@latest functions deploy food-search --project-ref cywwfeebpklgyesauqvt`
   - **NOTE:** this function has uncommitted/redeployed edits from this session (the dedupe+rank). Redeploy it.
3. **Google provider** — enable Google in Supabase Auth → Providers (Google Cloud OAuth client ID/secret), add the Netlify origin to Auth → URL Configuration → Redirect URLs. Until then "Continue with Google" 400s.
4. **Web rebuild + deploy** — `rm -rf dist && npx expo export --platform web`, then drag `dist/` onto Netlify **Deploys** tab.

## ⚠️ State / gotchas
- **Xcode Command Line Tools were MISSING at handoff** — `git` and `tsc` couldn't run from the shell (macOS was prompting to install them). Install CLT (`xcode-select --install`) before relying on git/tsc here. Because of this, **this session's edits are likely uncommitted** — run `git status`, then commit (the `food-search` dedupe wiring at minimum).
- **No GitHub remote yet** — set remote then `git push -u origin main`.
- **Can't visually verify authed screens** — test login fails on this dev Supabase, so rely on `tsc --noEmit` + bundle/console checks on the sign-in screen.
- **RN-on-web rules:** use `showAlert()` from `src/lib/dialog.ts` (not `Alert.alert`); don't pass large data through router params on web; keyboard hook `src/hooks/use-keyboard-aware-scroll.ts` is a no-op on web.
- **`.claude/launch.json`:** `web` (port 8081, the user's own server) + `web-preview` (8082, the preview tool's). The preview tool can't reuse the 8081 server.
- **AGENTS.md rule:** Expo changed — read the versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing Expo code.
- **RLS:** own-data reads of `profiles`/`meals`/`workout_*` MUST filter by `user_id` or another account's rows leak (see auto-memory `rls-share-grant-scoping`).

## 📋 Remaining backlog (after onboarding)
- **P0:** confirm web deploy end-to-end (meal scan, ✕, profile editing, food search, body tab, no white bar); push to GitHub.
- **P3 polish:** web performance pass (trim splash, bundle size, lazy routes); Add-to-Home-Screen / manifest polish.
- **Play Store:** App content forms (Data safety, Content rating, Target audience, reviewer test login); store graphics (icon 512², feature 1024×500, screenshots); Internal → closed test (≥20 testers, 14 days) → production.
- **Optional infra:** user asked about a Supabase read replica in Asia for India latency — not started.
