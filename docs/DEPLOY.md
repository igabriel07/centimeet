# Στήσιμο παραγωγής με ελάχιστο κόστος (Φάση 1)

Στόχος: **~€0 τον μήνα** για τους πρώτους ~300 χρήστες (~600 αναζητήσεις/μήνα).
Το μόνο σταθερό κόστος είναι ο λογαριασμός Apple Developer (€99/χρόνο) αν βγει και στο iOS.

| Κομμάτι | Υπηρεσία | Κόστος |
|---|---|---|
| Βάση, λογαριασμοί, μηνύματα | Supabase — Free | €0 |
| Backend (API) | Google Cloud Run (σβήνει όταν δεν χρησιμοποιείται) | €0 (δωρεάν όριο) |
| Χάρτες: μαγαζιά, χρόνοι | Google Maps Platform με `COST_MODE=lean` + φρένο κόστους | €0 (δωρεάν όρια) |
| Αναζήτηση διεύθυνσης | Photon (OpenStreetMap) | €0 |
| Email με κωδικό σύνδεσης | Brevo ή Resend — Free | €0 |
| Builds / ενημερώσεις εφαρμογής | Expo EAS — Free | €0 |

> **Πώς δεν πληρώνουμε κατά λάθος:** το backend μετρά κάθε κλήση Google σε πίνακα της βάσης και
> σταματά στο **90% του δωρεάν ορίου** κάθε υπηρεσίας. Μετά, μέχρι το τέλος του μήνα, η εφαρμογή
> δουλεύει με εκτιμώμενους χρόνους και μαγαζιά από OpenStreetMap (με σχετική ένδειξη). Αν ο μετρητής
> δεν απαντά, το Google **μπλοκάρεται** (ασφαλής πλευρά). Επιπλέον όριο: 10 αναζητήσεις/χρήστη/ημέρα.

---

## 1. Supabase

1. Νέο project στο [supabase.com](https://supabase.com), περιοχή **EU (Frankfurt)**.
2. **SQL editor** → τρέξε **με τη σειρά** όλα τα αρχεία του `supabase/migrations/`.
3. **Authentication → Providers → Email:** ενεργοποίησε το Email OTP· στο template βάλε τον κωδικό `{{ .Token }}`.
4. **Authentication → SMTP Settings:** σύνδεσε δικό σου SMTP — το ενσωματωμένο email του Supabase είναι μόνο για δοκιμές (λίγα emails την ώρα).
   - **Brevo** (δωρεάν, ~300 emails/ημέρα): αρκεί επιβεβαιωμένη διεύθυνση αποστολέα.
   - **Resend** (δωρεάν, ~100 emails/ημέρα): θέλει δικό σου domain (~€10/χρόνο).
5. **Project Settings → API keys:**
   - publishable / anon key → `apps/mobile/.env` (`EXPO_PUBLIC_SUPABASE_ANON_KEY`)
   - **secret / service role key → μόνο στο backend** (`SUPABASE_SERVICE_ROLE_KEY`) — ποτέ στην εφαρμογή.

> Το δωρεάν πλάνο «παγώνει» το project μετά από 1 εβδομάδα χωρίς καμία χρήση. Με ενεργούς χρήστες δεν συμβαίνει·
> αν συμβεί, το ξυπνάς από το dashboard.

## 2. Google Cloud: κλειδί Maps

1. [console.cloud.google.com](https://console.cloud.google.com) → νέο project + **billing account** (ζητά κάρτα, ακόμη κι αν μένεις στα δωρεάν όρια).
2. **APIs & Services → Library:** ενεργοποίησε **Places API (New)** και **Routes API**. (Geocoding δεν χρειάζεται στη λιτή λειτουργία.)
3. **Credentials → Create API key → Edit:**
   - *API restrictions*: μόνο **Places API (New)** και **Routes API**.
4. **Billing → Budgets & alerts:** π.χ. €5 / €20 / €50. Τα alerts μόνο ειδοποιούν — το πραγματικό φρένο είναι ο μετρητής του backend.
5. **APIs & Services → Quotas:** όπου υπάρχει, βάλε χαμηλότερο όριο (π.χ. αιτήματα ανά λεπτό) ως δεύτερη γραμμή άμυνας.

## 3. Backend στο Cloud Run

> Στην πράξη (Νοέμβριος 2026) προέκυψαν τα εξής — ακολουθήστε τα:
> - Το secret key του Supabase με το CLI: `supabase projects api-keys --reveal` (χωρίς `--reveal` επιστρέφεται **κρυμμένο** και ο μετρητής κόστους μπλοκάρει το Google).
> - Το API τρέχει με **δικό του service account** (`centimeet-api@…`) που διαβάζει μόνο τα 2 secrets· ο προεπιλεγμένος λογαριασμός compute χρειάζεται `roles/run.builder` για τα builds από κώδικα.
> - Το `.gcloudignore` στέλνει στο Cloud Build μόνο τον κώδικα του API (ποτέ `.env`). Έλεγχος: `gcloud meta list-files-for-upload .`
> - Καθαρισμός παλιών images (μένουμε στο δωρεάν 0,5 GB):
>   `gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy --location=europe-west1 --policy=docs/gcp/artifact-cleanup.json --no-dry-run`
> - Budget alert: `gcloud billing budgets create --billing-account=… --budget-amount=1EUR --filter-projects=projects/<αριθμός project> --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0`

Χρειάζεσαι το [gcloud CLI](https://cloud.google.com/sdk/docs/install) συνδεδεμένο στο ίδιο project.

```bash
# Κρυφά κλειδιά στο Secret Manager (δωρεάν για λίγα secrets)
printf '%s' 'ΤΟ_GOOGLE_KEY'          | gcloud secrets create google-maps-key --data-file=-
printf '%s' 'ΤΟ_SUPABASE_SECRET_KEY' | gcloud secrets create supabase-secret --data-file=-

# Deploy από τη ρίζα του repo (χρησιμοποιεί το Dockerfile)
gcloud run deploy centimeet-api \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --service-account centimeet-api@ΤΟ-PROJECT.iam.gserviceaccount.com \
  --min-instances 0 --max-instances 2 \
  --memory 512Mi \
  --set-env-vars "USE_MOCK_PROVIDERS=false,COST_MODE=lean,REQUIRE_AUTH=true,SUPABASE_URL=https://ΤΟ-PROJECT.supabase.co" \
  --set-secrets "GOOGLE_MAPS_API_KEY=google-maps-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-secret:latest"
```

Θα πάρεις URL τύπου `https://centimeet-api-xxxxx.europe-west1.run.app`. Έλεγχος:

```bash
curl https://centimeet-api-xxxxx.europe-west1.run.app/health
# {"ok":true,"mock":false,"costMode":"lean"}
```

- `--allow-unauthenticated` = το URL είναι δημόσιο· την ταυτότητα τη ελέγχει το ίδιο το API (`REQUIRE_AUTH=true`, token του Supabase).
- `--min-instances 0`: χωρίς κίνηση δεν πληρώνεις τίποτα· η πρώτη κλήση μετά από ησυχία αργεί 1–3″.
- `--max-instances 2`: όριο ακόμη και σε απρόοπτη κίνηση.

## 4. Εφαρμογή

Στο `apps/mobile/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://ΤΟ-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=…
EXPO_PUBLIC_API_URL=https://centimeet-api-xxxxx.europe-west1.run.app
```

## 5. Σύνδεση με Google (δωρεάν)

Η εφαρμογή δείχνει «Συνέχεια με Google» / «Εγγραφή με Google». Μέχρι να ενεργοποιηθεί, το κουμπί
απαντά «δεν είναι ακόμα διαθέσιμη» (το ελέγχει από το `/auth/v1/settings` του Supabase).

1. Google Cloud Console (ίδιο project) → **Google Auth Platform → Branding**: όνομα «CentiMeet», email υποστήριξης,
   λογότυπο προαιρετικά. **Audience → External** και **Publish app** (για τα βασικά scopes `email`, `profile`
   δεν χρειάζεται έλεγχος από το Google).
2. **Clients → Create client → Web application**:
   - *Authorized redirect URIs*: `https://<PROJECT>.supabase.co/auth/v1/callback`
3. Στο `supabase/.env`: `GOOGLE_OAUTH_CLIENT_ID=…` και `GOOGLE_OAUTH_SECRET=…`
4. Στο `supabase/config.toml` → `[auth.external.google] enabled = true` → `supabase config push`.

Redirect URLs της εφαρμογής (`additional_redirect_urls`): `centimeet://**` (builds), `exp://**` (Expo Go)
και `http://localhost:8081/**` (προεπισκόπηση στον browser). Τα δύο τελευταία είναι μόνο για ανάπτυξη —
αφαιρέστε τα πριν το δημόσιο λανσάρισμα.

> **iOS:** η Apple απαιτεί «Sign in with Apple» όταν μια εφαρμογή προσφέρει σύνδεση με Google
> (App Review 4.8). Χρειάζεται τον λογαριασμό Apple Developer — προστίθεται πριν το πρώτο build iOS.

## Παρακολούθηση κόστους

Οι μετρητές του μήνα είναι στον πίνακα `api_usage` (Supabase → Table editor):

| key | δωρεάν όριο Google | σταματάμε στο (0.9) |
|---|---|---|
| `google:places_search` (μαγαζιά) | 1.000 | 900 |
| `google:place_details` | 1.000 | 900 |
| `google:parking_search` | 5.000 | 4.500 |
| `google:matrix_pro` (χρόνοι με κίνηση, στοιχεία) | 5.000 | 4.500 |
| `google:matrix_essentials` (χρόνοι χωρίς κίνηση, στοιχεία) | 10.000 | 9.000 |
| `google:routes_pro` / `google:routes_essentials` (πλάνο) | 5.000 / 10.000 | 4.500 / 9.000 |

Αν φτάνετε συχνά στο όριο πριν το τέλος του μήνα:
- `GOOGLE_BUDGET_FACTOR=1.3` → επιτρέπει ~30% πάνω από το δωρεάν (λίγα ευρώ), ή
- `COST_MODE=growth` όταν έρθουν οι συμφωνίες με μαγαζιά (Φάση 2).

> ⚠️ Τα δωρεάν όρια/τιμές είναι του Google (Νοέμβριος 2026) και μπορεί να αλλάξουν — ελέγχετε το
> [pricing](https://developers.google.com/maps/billing-and-pricing/pricing) και ενημερώστε το
> `GOOGLE_FREE_MONTHLY` στο `apps/api/src/lib/usage.ts`. Επίσης επιβεβαιώστε στο billing report σε ποιο
> SKU χρεώνονται οι συγκοινωνίες (ο μετρητής τις λογαριάζει ως Essentials).
