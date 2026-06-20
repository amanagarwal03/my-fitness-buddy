# Privacy Policy — My Fitness Buddy

**Effective date:** June 20, 2026
**Last updated:** June 20, 2026

My Fitness Buddy ("the app", "we", "us") is a personal fitness and nutrition
tracking app. This policy explains what we collect, how it is used, and the
choices you have. If you have questions, contact us at **bestaman03@gmail.com**.

## Who runs this app
My Fitness Buddy is operated by an individual developer (Aman Agarwal). It is
not affiliated with Google, Supabase, or OpenFoodFacts.

## Information we collect
We only collect what the app needs to work. You provide most of it directly.

- **Account information.** Your email address and a password, used to create
  and secure your account. Passwords are handled by our authentication provider
  (Supabase) and are stored salted/hashed — we never see your plain-text password.
- **Profile and body metrics.** Optional height, weight, sex, date of birth, and
  your unit preference (kg/lbs). Used to compute BMI and personalize tracking.
- **Nutrition data.** Meals you log, including meal names, estimated calories and
  macro/micronutrients, timestamps, and — if you choose to add them — **photos of
  your meals**.
- **Workout data.** Exercises, sets (weight, reps), cardio entries (duration,
  speed, incline), and session durations and dates.
- **Sharing data.** If you use the coach-sharing feature, a share code and a
  record of which accounts you have granted read-only access to (and vice versa).

We do **not** collect your contacts, precise location, advertising identifiers,
or browsing history. The app contains no third-party advertising or analytics SDKs.

## Device permissions
- **Camera** — to photograph meals and to scan product barcodes. Used only when
  you initiate it.
- **Photos / media** — to let you pick an existing meal photo from your gallery.

Photos are used solely for the feature you triggered (logging a meal). We do not
scan your photo library in the background.

## How we use your information
- To provide core features: nutrition tracking, BMI, workout logging, and progress.
- To estimate the nutrition of a meal from its photo (see "Third-party services").
- To look up product nutrition when you scan a barcode.
- To enable the optional coach-sharing feature you control.
- To keep your account secure and synced across your devices.

We do not sell your personal information, and we do not use it for advertising.

## Third-party services
The app relies on a small number of service providers to function:

- **Supabase** (backend, authentication, database, and photo storage). Your
  account, profile, meals, workouts, and meal photos are stored in Supabase.
  Meal photos are kept in a private storage bucket and are accessed only through
  short-lived signed links. See https://supabase.com/privacy.
- **Google Gemini API** (meal photo analysis). When you analyze a meal photo, the
  image is sent to Google's Gemini model to estimate nutrition, then the result is
  returned to the app. The image is sent for processing at the moment you request
  analysis. See https://ai.google.dev/gemini-api/terms and
  https://policies.google.com/privacy. **Note:** depending on the API tier in use,
  Google may process and retain submitted content per its API terms; do not
  photograph anything you consider sensitive beyond the meal itself.
- **OpenFoodFacts** (barcode lookups). When you scan a barcode, only the barcode
  number is sent to OpenFoodFacts to retrieve public product nutrition data. No
  personal data is sent. See https://world.openfoodfacts.org/privacy.

## Sharing with other users (coach feature)
Sharing is entirely optional and user-initiated. If you generate a share code and
someone redeems it (or you redeem theirs), the recipient gets **read-only** access
to your meals, workouts, and body metrics. You can revoke access at any time from
within the app, which immediately stops their access.

## Data retention and deletion
We keep your data for as long as your account exists. You can **request deletion
of your account and all associated data** at any time by emailing
**bestaman03@gmail.com** from your account's email address; we will delete it
within 30 days. (We are also adding in-app account deletion.) Deleting your
account removes your profile, meals, meal photos, workouts, and sharing records.

## Security
Data is transmitted over encrypted connections (HTTPS/TLS). Database access is
protected by row-level security so that you can only read and write your own data
(plus anything explicitly shared with you). Meal photos are stored privately and
served via expiring signed URLs.

## Children
My Fitness Buddy is intended for adults and is not directed at children under 13
(or the minimum age in your country). We do not knowingly collect data from
children. If you believe a child has provided data, contact us and we will delete it.

## Changes to this policy
We may update this policy as the app evolves. We will revise the "Last updated"
date above and, for material changes, surface a notice in the app.

## Contact
Questions or requests (including data deletion): **bestaman03@gmail.com**
