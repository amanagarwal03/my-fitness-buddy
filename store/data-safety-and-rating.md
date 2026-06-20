# Data Safety, Content Rating & Target Audience — answers to copy

Pre-filled answers for the Play Console forms. Read each before submitting — you
are legally attesting these are accurate, so adjust if you change the app.

═══════════════════════════════════════════════════════════════════════
## 1) DATA SAFETY  (App content → Data safety)
═══════════════════════════════════════════════════════════════════════

### Overview answers
- **Does your app collect or share any of the required user data types?** → **Yes**
- **Is all of the user data encrypted in transit?** → **Yes**
- **Do you provide a way for users to request that their data be deleted?** → **Yes**
  (account/data deletion by email request; in-app deletion if/when added)

### Data types collected
For each below: Collected = **Yes**, Shared = **No** (unless noted), Processed
ephemerally = No (unless noted), Required (not optional) where it's needed to use
the app. Purposes: **App functionality** and **Account management** for all.

| Data type | Category | Collected | Shared | Purpose |
|---|---|---|---|---|
| Email address | Personal info | Yes | No | App functionality, Account management |
| Photos (meal photos) | Photos and videos | Yes | **Yes*** | App functionality |
| Health info (height, weight, BMI) | Health and fitness | Yes | No | App functionality |
| Fitness info (workouts, sets, meals/calories) | Health and fitness | Yes | No | App functionality |

*\*Photos "shared":* meal photos are sent to **Google's Gemini API** for nutrition
analysis. In Play's terms this can count as sharing/transfer to a third party for
processing. Declaring it as **Shared → App functionality** is the safe, honest choice.

### NOT collected (answer No to these)
- Location (approximate or precise) — **No**
- Financial info — **No**
- Contacts — **No**
- Calendar, SMS, call logs — **No**
- Web browsing history — **No**
- App activity / search history — **No**
- Device or other identifiers / advertising ID — **No**
- Audio (microphone) — **No** *(see app tweak note: remove RECORD_AUDIO permission)*

### Security practices
- Data encrypted in transit: **Yes**
- Users can request data deletion: **Yes**
- Committed to Play Families Policy: **No** (app is not targeting children)
- Independent security review: **No**

═══════════════════════════════════════════════════════════════════════
## 2) CONTENT RATING  (App content → Content rating questionnaire)
═══════════════════════════════════════════════════════════════════════

- Category: **Utility, Productivity, Communication, or Other** → choose
  **Health & Fitness / Reference, Social** style — when in doubt pick **"Other"**.
- Violence: **No**
- Sexuality / nudity: **No**
- Profanity / crude humor: **No**
- Controlled substances (drugs, alcohol, tobacco): **No**
- Gambling / contests: **No**
- User-generated content shared with others: **Yes** (coach sharing shows your
  meals/workouts to people you authorize) — there's no public feed or open UGC.
- Does the app share user's current physical location with other users? **No**
- Data collection (digital purchases, personal info): personal info **Yes**,
  digital purchases **No**.

Expected result: **Everyone / PEGI 3** (a general-audience rating).

═══════════════════════════════════════════════════════════════════════
## 3) TARGET AUDIENCE & CONTENT  (App content → Target audience and content)
═══════════════════════════════════════════════════════════════════════

- **Target age group:** **18 and over** (recommended — avoids the stricter
  Families/children policies; the app tracks body weight and is meant for adults).
- Appeals to children? **No**
- Ads: **No ads in app** → answer accordingly (no ads).

═══════════════════════════════════════════════════════════════════════
## 4) OTHER "App content" declarations
═══════════════════════════════════════════════════════════════════════

- **Privacy policy URL:** your hosted privacy-policy.html link.
- **Ads:** This app does **not** contain ads → **No**.
- **App access:** The whole app is behind a login. Provide Google reviewers a test
  account → create one (e.g. demo@yourdomain or a throwaway Gmail) with a password,
  confirm its email, and enter those credentials in the "All functionality is
  available without special access? → No → provide instructions/credentials" form.
- **Government app:** No.
- **Financial features:** No.
- **Health apps declaration:** If prompted, this is a general wellness/fitness
  tracker; it does **not** provide medical advice or diagnosis.
- **Data deletion:** provide the deletion method — email request (and in-app if added).

═══════════════════════════════════════════════════════════════════════
## 5) IMPORTANT release-path note
═══════════════════════════════════════════════════════════════════════

- **Internal testing** (≤100 testers by email): available as soon as the account is
  verified and the AAB is uploaded. Use this first — fastest way to get real users.
- **Production (public listing):** for **new personal developer accounts**, Google
  requires running a **closed test with ≥20 testers for 14 continuous days** before
  you can apply for production access. Plan for this if you want a public listing.
