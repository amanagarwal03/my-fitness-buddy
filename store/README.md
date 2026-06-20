# Play Store launch kit — My Fitness Buddy

Everything you need to publish, saved here so it's ready when your Google account
finishes verification. Files in this folder:

- **privacy-policy.md** / **privacy-policy.html** — your privacy policy (host the HTML).
- **store-listing.md** — app name, descriptions, category, screenshot guidance.
- **data-safety-and-rating.md** — pre-filled answers for the Play Console forms.
- **README.md** — this checklist.

---

## 📦 Your built app (AAB to upload)

- **Production AAB (upload this to Play Console):**
  https://expo.dev/artifacts/eas/B9LHzTdJL3QUDV5hEQlO4c1-QVlgz9ZXzQyLORdHbbw.aab
- **Preview APK (sideload for direct testing):**
  https://expo.dev/artifacts/eas/g6wj7EzgxWwYgecnW-5looLtD9abXjTvwTeyQw8bZ7A.apk
- All builds (durable links, re-download anytime):
  https://expo.dev/accounts/amanagarwal03/projects/myfitnessbuddy/builds

> If a direct artifact link ever expires, open the builds page above and download
> from the latest production build. To make a fresh AAB later:
> `eas build -p android --profile production`

---

## 🌐 Step A — Host the privacy policy (do this anytime, free)

Play requires a public URL. Pick one:

- **GitHub Pages (recommended):** create a public repo, add `index.html` (paste the
  contents of `privacy-policy.html`), enable Pages in repo Settings → Pages. URL is
  `https://<username>.github.io/<repo>/`.
- **Netlify Drop:** drag `privacy-policy.html` onto https://app.netlify.com/drop — instant URL.
- **Google Sites / Notion (public page):** paste the text from `privacy-policy.md`.

Save the resulting URL — you'll paste it in the listing and several forms.

---

## ✅ Step B — Once Google verifies your account

1. **Create app** (Play Console → Create app): name "My Fitness Buddy", App, Free.
2. **Internal testing → Create release** → upload the **AAB** above → add release notes.
3. **Add testers** (Internal testing → Testers): enter Gmail addresses, copy the
   join link, send it out. They install via a normal Play Store link.
4. **Fill required forms** using `data-safety-and-rating.md`:
   - Main store listing (use `store-listing.md`) + graphics + screenshots
   - Privacy policy URL (from Step A)
   - Data safety
   - Content rating
   - Target audience & content
   - App access (give reviewers a test login)
5. **Roll out** the internal testing release.

---

## ⚠️ Reality checks

- **Internal testing** = up to 100 testers, available within minutes of upload. Best
  first step.
- **Public production** for a **new personal account** needs a **20-tester, 14-day
  closed test** first. Plan for that before a public listing.
- **Package name** is locked to `com.myfitnessbuddy.app` on first upload — can't change later.
- **Email confirmation:** make sure Supabase "Confirm email" + the redirect URLs
  (`myfitnessbuddy://sign-in`, `myfitnessbuddy://reset-password`) are configured, and
  give Google reviewers a **pre-confirmed** test account so they can log in.

---

## 🔧 Recommended app tweaks before public launch (optional but worth it)

- **Remove the microphone (RECORD_AUDIO) permission** — `expo-camera` adds it by
  default, but the app never records audio. Fewer permissions = cleaner listing and
  one less Data Safety item.
- **Add in-app "Delete account"** — Google increasingly expects an in-app data
  deletion path for apps with accounts (email request currently covers the policy).
