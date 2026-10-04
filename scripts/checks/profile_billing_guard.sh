#!/usr/bin/env bash
# Proves signed-in users cannot change their own plan/billing fields.
# Usage: TEST_EMAIL=... TEST_PASS=... bash scripts/checks/profile_billing_guard.sh
set -u
URL="https://qiwdhjgwakjzlwnabcmv.supabase.co"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpd2Roamd3YWtqemx3bmFiY212Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1ODY0MTYsImV4cCI6MjA4OTE2MjQxNn0.uCJWUJnbpfukH5JwvqYA1v8X7P0RuBrdWCczjd97R68"
[ -n "${TOKEN:-}" ] || TOKEN=$(curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
[ -n "${TOKEN:-}" ] || { echo "FAIL could not sign in"; exit 1; }
UID_=$(python3 -c "import base64,json,sys;p=sys.argv[1].split('.')[1];p+='='*(-len(p)%4);print(json.loads(base64.urlsafe_b64decode(p))['sub'])" "$TOKEN")
fail=0
patch() { curl -s -o /tmp/pbg.out -w "%{http_code}" -X PATCH "$URL/rest/v1/profiles?id=eq.$UID_" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Prefer: return=minimal" -d "$1"; }
for body in '{"plan":"pro"}' '{"subscription_status":"active"}' '{"billing_interval":"year"}' \
  '{"trial_started_at":"2030-01-01T00:00:00Z"}' '{"stripe_customer_id":"cus_x"}' '{"stripe_subscription_id":"sub_x"}'; do
  code=$(patch "$body"); if [ "$code" -ge 400 ]; then echo "PASS blocked $body ($code)"; else echo "FAIL allowed $body"; fail=1; fi
done
NAME=$(curl -s "$URL/rest/v1/profiles?id=eq.$UID_&select=full_name,business_name" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;r=json.load(sys.stdin)[0];print(json.dumps(r["full_name"])+",\"business_name\":"+json.dumps(r["business_name"]))')
code=$(patch "{\"full_name\":$NAME}")
if [ "$code" -lt 300 ]; then echo "PASS name/business edit allowed"; else echo "FAIL name edit ($code)"; cat /tmp/pbg.out; fail=1; fi
code=$(curl -s -o /tmp/pbg.out -w "%{http_code}" -X POST "$URL/rest/v1/profiles" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d "{\"id\":\"$UID_\",\"plan\":\"pro\"}")
if [ "$code" -ge 400 ]; then echo "PASS insert with plan=pro blocked ($code)"; else echo "FAIL insert allowed"; fail=1; fi
[ $fail = 0 ] && echo ALL PASS || exit 1
