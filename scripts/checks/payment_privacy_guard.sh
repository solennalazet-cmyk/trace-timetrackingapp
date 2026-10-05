#!/usr/bin/env bash
# Runs the payment privacy checks in a rolled-back transaction (nothing persists).
set -u
out=$(psql "${SUPABASE_DB_URL:-}" -v ON_ERROR_STOP=1 -q -f "$(dirname "$0")/payment_privacy_guard.sql" 2>&1)
code=$?
echo "$out" | grep -oE "(PASS|FAIL).*" | sed 's/^/  /'
if [ $code -eq 0 ] && ! echo "$out" | grep -q FAIL; then echo "ALL PASS"; else echo "$out" | grep -i error | head -5; exit 1; fi
