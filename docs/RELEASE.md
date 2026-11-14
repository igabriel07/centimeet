# Κυκλοφορία στο App Store & Google Play

Προϋπόθεση: έχει στηθεί το backend σύμφωνα με το [DEPLOY.md](DEPLOY.md) (Supabase + Cloud Run).

| Τι | Κόστος |
|---|---|
| Apple Developer Program | €99 / χρόνο (απαιτείται για App Store) |
| Google Play Console | $25 εφάπαξ |
| Expo EAS (builds, ενημερώσεις) | δωρεάν πλάνο |
| Sentry (σφάλματα) | δωρεάν πλάνο |

---

## 1. Μία φορά: EAS

```bash
npm install -g eas-cli
cd apps/mobile
eas login
eas init                  # δημιουργεί project, γράφει extra.eas.projectId στο app.json (χρειάζεται για τα push)
eas update:configure      # αυτόματες ενημερώσεις JS χωρίς νέα έκδοση στο store
```

Μεταβλητές για τα builds (**Expo dashboard → Project → Environment variables**, environment `production`):

| Μεταβλητή | Τιμή |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL του Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | publishable / anon key |
| `EXPO_PUBLIC_API_URL` | URL του Cloud Run |
| `EXPO_PUBLIC_CONTACT_EMAIL`, `EXPO_PUBLIC_LEGAL_OPERATOR` | στοιχεία σας (εμφανίζονται στην πολιτική απορρήτου) |
| `EXPO_PUBLIC_REVIEW_EMAIL` | το email του λογαριασμού ελέγχου (βλ. §4) |
| `EXPO_PUBLIC_SENTRY_DSN` | προαιρετικό |
| `GOOGLE_MAPS_ANDROID_API_KEY` (secret) | κλειδί «Maps SDK for Android» (§2) |

## 2. Χάρτης στο Android

Στο Google Cloud (ίδιο project με το backend):
1. Ενεργοποίησε **Maps SDK for Android** (δωρεάν, χωρίς όριο).
2. Νέο API key → *Application restrictions: Android apps* → package `app.centimeet` + SHA‑1.
   Το SHA‑1 το βλέπεις με `eas credentials` (Android → production keystore) και, μετά την πρώτη ανάρτηση,
   στο Play Console → App integrity (App signing key) — πρόσθεσε **και τα δύο**.
3. *API restrictions*: μόνο Maps SDK for Android. Βάλ' το στο `GOOGLE_MAPS_ANDROID_API_KEY` του EAS.

Στο iOS ο χάρτης είναι της Apple (δωρεάν, χωρίς κλειδί).

## 3. Push ειδοποιήσεις

- **Android:** χρειάζεται Firebase (FCM, δωρεάν): `eas credentials` → Android → *Push Notifications: FCM V1* και ανέβασε το service account JSON ([οδηγός Expo](https://docs.expo.dev/push-notifications/fcm-credentials/)).
- **iOS:** το EAS φτιάχνει μόνο του το push key στο πρώτο build (απάντησε «ναι» όταν ρωτήσει).
- Τις ειδοποιήσεις τις στέλνει η βάση (pg_net → Expo). Έλεγχος: Supabase → Database → Extensions → **pg_net** ενεργό.

## 4. Λογαριασμός για τον έλεγχο της Apple / Google

Οι ελεγκτές δεν μπορούν να πάρουν τον κωδικό από το email σου. Γι' αυτό:
1. Supabase → Authentication → Users → **Add user** → email π.χ. `review@το-domain-σου.gr` + password, *Auto confirm*.
2. Βάλε αυτό το email στο `EXPO_PUBLIC_REVIEW_EMAIL`. Μόνο γι' αυτό το email η εφαρμογή δείχνει πεδίο κωδικού.
3. Στα στοιχεία ελέγχου (App Store Connect → App Review Information / Play Console → App access) δώσε email + password.
4. Φτιάξε από πριν 1–2 φίλους/εξόδους σε αυτόν τον λογαριασμό ώστε ο ελεγκτής να δει την εφαρμογή «ζωντανή».

## 5. Πολιτική απορρήτου: δημόσιο URL

Τα stores ζητούν URL. Το κείμενο είναι στο `apps/mobile/src/legal/content.ts` (ίδιο με αυτό της εφαρμογής):
```bash
npm run legal:export    # → docs/legal/privacy.md, docs/legal/terms.md
```
Δημοσίευσέ τα δωρεάν, π.χ. με **GitHub Pages** (Settings → Pages → φάκελος `/docs`) ή ως δημόσιο Google Doc / Notion.
⚠️ Συμπλήρωσε τα στοιχεία σου και ζήτα έναν γρήγορο νομικό έλεγχο πριν το launch.

## 6. Build & ανάρτηση

```bash
cd apps/mobile
eas build --profile preview --platform android     # APK για δοκιμή σε δικά σας κινητά
eas build --profile production --platform all      # για τα stores
eas submit --profile production --platform ios     # → TestFlight / App Store Connect
eas submit --profile production --platform android # → Play Console (internal testing)
```

Διορθώσεις μόνο σε JS (όχι νέα native πακέτα) χωρίς νέα έκδοση στο store:
```bash
eas update --channel production --message "Διόρθωση …"
```

## 7. Στοιχεία καταχώρησης στα stores

- **Όνομα:** CentiMeet · **Υπότιτλος:** Το δίκαιο σημείο συνάντησης για την παρέα
- **Κατηγορία:** Ταξίδια ή Κοινωνική δικτύωση · **Ηλικία:** 12+ (iOS, λόγω μηνυμάτων μεταξύ χρηστών) / PEGI 12
- **Data safety / App Privacy** (σύμφωνα με την πολιτική απορρήτου): email, όνομα, *ακριβής τοποθεσία* (μόνο όταν τη ζητά ο χρήστης· σκοπός: λειτουργία της εφαρμογής), μηνύματα, αναγνωριστικό συσκευής (push token), αναφορές σφαλμάτων. Δεν γίνεται tracking, δεν πωλούνται δεδομένα. Ο χρήστης μπορεί να διαγράψει τον λογαριασμό μέσα από την εφαρμογή.
- **Περιεχόμενο από χρήστες (UGC):** η Apple ζητά αναφορά & αποκλεισμό — υπάρχουν (παρατεταμένο πάτημα σε μήνυμα ή φίλο). Οι αναφορές μπαίνουν στον πίνακα `reports`: **έλεγξέ τες μέσα σε 24 ώρες** (το υπόσχονται οι όροι χρήσης). Ανέφερέ το στις σημειώσεις για τον ελεγκτή.
- **Screenshots:** τουλάχιστον iPhone 6.9″, iPad 13″ (υποστηρίζεται tablet) και κινητό Android.

## 8. Πριν πατήσεις «Submit» — checklist

- [ ] `npm run typecheck && npm test && npm run test:db` πράσινα (τρέχουν και στο CI)
- [ ] Supabase: όλα τα migrations, SMTP, pg_net, λογαριασμός ελέγχου
- [ ] Cloud Run: `/health` → `"mock":false,"costMode":"lean"`, `REQUIRE_AUTH=true`
- [ ] Πολιτική απορρήτου & όροι: συμπληρωμένα στοιχεία, δημόσιο URL
- [ ] Δοκιμή σε πραγματικό κινητό (preview build): σύνδεση, φίλος, έξοδος, πρόσκληση με push, δήλωση, προτάσεις, πλάνο, διαγραφή λογαριασμού
- [ ] Budget alerts στο Google Cloud
