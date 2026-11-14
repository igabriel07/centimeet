#!/usr/bin/env bash
# Τρέχει τα migrations + τα SQL tests σε προσωρινό container PostGIS.
# Χρειάζεται μόνο Docker (όχι Supabase CLI). Χρήση: npm run test:db
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"   # supabase/
IMAGE="${DBTEST_IMAGE:-postgis/postgis:17-3.5}"
NAME="centimeet-dbtest-$$"
DB=centimeet_test

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

# Το image κάνει επανεκκίνηση μετά τα init scripts: περιμένουμε το 2ο «ready».
for _ in $(seq 1 90); do
  if [ "$(docker logs "$NAME" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ]; then break; fi
  sleep 1
done

psql_run() { docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }

# Καθαρή βάση από template0 (το image βάζει PostGIS στο public της βάσης postgres)
docker exec "$NAME" createdb -U postgres -T template0 "$DB"

psql_run < "$DIR/tests/_supabase_stub.sql"
for f in "$DIR"/migrations/*.sql; do
  echo "→ migration $(basename "$f")"
  psql_run < "$f"
done
psql_run -o /dev/null < "$DIR/tests/_helpers.sql"
for f in "$DIR"/tests/*.test.sql; do
  echo "→ test $(basename "$f")"
  psql_run -o /dev/null < "$f" 2>&1 | sed -e 's/^psql:<stdin>:[0-9]*: NOTICE:  /  /' -e 's/^NOTICE:  /  /'
  [ "${PIPESTATUS[0]}" -eq 0 ] || exit 1
done
