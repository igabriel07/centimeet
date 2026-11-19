#!/usr/bin/env bash
# Φορτώνει δοκιμαστικούς λογαριασμούς & δεδομένα στο ΤΟΠΙΚΟ Supabase (npm run local:seed).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_centimeet psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -o /dev/null < "$DIR/mock_seed.sql"
