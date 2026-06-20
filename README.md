# My Fitness Buddy

A mobile fitness app (Expo / React Native + TypeScript) with two halves:

- **Nutrition** — photograph a meal → Gemini vision estimates calories + macros + micronutrients → track against daily goals; BMI from your profile.
- **Workout** — log sets by body part (kg/lbs auto-converting), see progress charts (daily/weekly/monthly), and time your sessions.

Backend is **Supabase** (email auth + Postgres). The LLM API key never ships in the app — it lives only in a Supabase **Edge Function** (`analyze-meal`).

---

## Architecture

```
Expo app ──(JWT)──▶ Supabase Edge Function `analyze-meal` ──▶ Gemini (vision)
   │
   └── Supabase Postgres + Auth (RLS-scoped per user)
```

Key folders:

- `src/app/` — screens (expo-router). `(auth)`, `(tabs)`, `workout/*`, `result`, `goals`.
- `src/lib/` — `supabase.ts`, `auth.tsx`, `analyzeMeal.ts`, `units.ts`, `bmi.ts`, `image.ts`, `date.ts`, `types.ts`.
- `src/components/ui.tsx` — shared UI primitives.
- `supabase/migrations/0001_init.sql` — schema, RLS, seeded exercises.
- `supabase/functions/analyze-meal/` — the Claude vision Edge Function.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at https://supabase.com.
2. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
3. Copy the env template and fill it in:

   ```bash
   cp .env.example .env
   ```

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-public-key>
   ```

### 3. Apply the database schema

Easiest: open **SQL Editor** in the Supabase dashboard, paste the contents of
`supabase/migrations/0001_init.sql`, and run it. (This creates the tables, RLS
policies, and seeds the exercise catalog.)

Or with the Supabase CLI linked to your project:

```bash
supabase db push
```

### 4. Deploy the `analyze-meal` Edge Function

Using the Supabase CLI (`npm i -g supabase` or `brew install supabase/tap/supabase`):

```bash
supabase login
supabase link --project-ref <your-ref>

# Store your Gemini key as a secret (NOT in the app). Free key: https://aistudio.google.com/apikey
supabase secrets set GEMINI_API_KEY=...

# Deploy the function:
supabase functions deploy analyze-meal
```

> Local testing instead of deploying:
> `supabase functions serve analyze-meal --env-file ./supabase/.env.local`
> with `GEMINI_API_KEY=...` in that file.

### 5. Run the app

```bash
npx expo start
```

Open in **Expo Go** on your phone (scan the QR) or press `i` / `a` for a simulator.

---

## Using it

1. **Sign up** with email + password.
2. **Profile tab** — enter height + weight to see your BMI; pick your kg/lbs preference.
3. **Nutrition tab** — "Edit goals" to set daily targets; "Scan a meal" → camera or
   gallery → review the estimate → "Save to today's log". Progress bars fill as you log.
4. **Workout tab** — "Start session" to time a workout; pick a body part → an exercise →
   log your sets (weights auto-convert with the kg/lbs toggle) → "View progress" for charts.

---

## Notes

- **Estimates, not lab values.** Gemini estimates portion sizes from a photo; each meal
  result shows a confidence level and the assumptions it made.
- **Units.** Weights are stored canonically in **kg**; the kg/lbs toggle only affects display.
- **Cost.** Each meal analysis is one Gemini vision call (free tier covers personal use;
  rate-limited). The Edge Function is the right place to add per-user rate limiting later.
- **Security.** All tables use Row Level Security so each user only sees their own data; the
  Gemini key exists only as a Supabase function secret.
