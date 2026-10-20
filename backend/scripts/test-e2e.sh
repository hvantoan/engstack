#!/usr/bin/env bash
# End-to-end smoke test against a running engstack API.
# Usage: BASE_URL=http://localhost:8080 ID_TOKEN="dev:e2e@example.com" ./scripts/test-e2e.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
ID_TOKEN="${ID_TOKEN:-dev:e2e@example.com}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
GREEN=$'\033[32m'; RED=$'\033[31m'; CYAN=$'\033[36m'; RESET=$'\033[0m'

check() { # check <label> <condition-exit-code>
  if [ "$2" -eq 0 ]; then
    printf '%sPASS%s %s\n' "$GREEN" "$RESET" "$1"; PASS=$((PASS + 1))
  else
    printf '%sFAIL%s %s\n' "$RED" "$RESET" "$1"; FAIL=$((FAIL + 1))
  fi
}

step() { printf '\n%s== %s ==%s\n' "$CYAN" "$1" "$RESET"; }
status_of() { curl -s -o "$2" -w '%{http_code}' "$1"; }

step "1. Health"
code=$(status_of "$BASE_URL/api/v1/health" "$TMP/health.json")
check "GET /health -> 200" "$([ "$code" = 200 ]; echo $?)"
check "health payload ok" "$(jq -e '.status == "ok" and .version != null' "$TMP/health.json" >/dev/null; echo $?)"

step "2. Topics list"
code=$(status_of "$BASE_URL/api/v1/topics" "$TMP/topics.json")
check "GET /topics -> 200" "$([ "$code" = 200 ]; echo $?)"
check "24 topics returned" "$(jq -e 'length == 24' "$TMP/topics.json" >/dev/null; echo $?)"

step "3. Topic detail"
code=$(status_of "$BASE_URL/api/v1/topics/education" "$TMP/education.json")
check "GET /topics/education -> 200" "$([ "$code" = 200 ]; echo $?)"
check "200 items with topicId + track" \
  "$(jq -e '.items | length == 200 and all(.[]; .topicId == "education" and .track == "ielts")' "$TMP/education.json" >/dev/null; echo $?)"

step "4. Google login"
code=$(status_of "$BASE_URL/api/v1/topics/oxford-b1" "$TMP/oxford.json")
check "oxford items carry track" \
  "$(jq -e '.items | length > 0 and all(.[]; .track == "oxford" and .topicId == "oxford-b1")' "$TMP/oxford.json" >/dev/null; echo $?)"
code=$(curl -s -o "$TMP/login.json" -w '%{http_code}' -X POST "$BASE_URL/api/v1/auth/google" \
  -H 'Content-Type: application/json' -d "{\"id_token\":\"$ID_TOKEN\"}")
check "POST /auth/google -> 200" "$([ "$code" = 200 ]; echo $?)"
ACCESS=$(jq -r '.access_token // empty' "$TMP/login.json")
REFRESH=$(jq -r '.refresh_token // empty' "$TMP/login.json")
check "login returned token pair" "$([ -n "$ACCESS" ] && [ -n "$REFRESH" ]; echo $?)"

step "5. Guest import"
IDS='["education:early-childhood-education","education:lifelong-learning","education:primary-education","education:secondary-education","education:higher-education","oxford-b1:about:preposition","oxford-b1:access:verb","oxford-b1:account:noun","oxford-b1:achieve:verb","oxford-b1:act:verb","legacy-topic:stale-item-1"]'
code=$(curl -s -o "$TMP/import.json" -w '%{http_code}' -X POST "$BASE_URL/api/v1/progress/import-guest" \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' -d "{\"itemIds\":$IDS}")
check "POST /progress/import-guest -> 200" "$([ "$code" = 200 ]; echo $?)"
check "stale ids ignored" "$(jq -e '.imported > 0 and .imported <= 10' "$TMP/import.json" >/dev/null; echo $?)"

step "6. Progress read"
code=$(curl -s -o "$TMP/progress.json" -w '%{http_code}' "$BASE_URL/api/v1/progress" -H "Authorization: Bearer $ACCESS")
check "GET /progress -> 200" "$([ "$code" = 200 ]; echo $?)"
check "progress is a topic map" "$(jq -e 'type == "object" and (.["education"] | type) == "array"' "$TMP/progress.json" >/dev/null; echo $?)"

step "7. Toggle unlearn"
code=$(curl -s -o "$TMP/toggle.json" -w '%{http_code}' -X PUT "$BASE_URL/api/v1/progress/toggle" \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"itemId":"education:early-childhood-education","learned":false}')
check "PUT /progress/toggle -> 200" "$([ "$code" = 200 ]; echo $?)"
curl -s -o "$TMP/progress2.json" "$BASE_URL/api/v1/progress" -H "Authorization: Bearer $ACCESS"
check "item removed from progress" \
  "$(jq -e '[.[][] | select(. == "education:early-childhood-education")] | length == 0' "$TMP/progress2.json" >/dev/null; echo $?)"

step "8. Refresh rotation"
code=$(curl -s -o "$TMP/refresh.json" -w '%{http_code}' -X POST "$BASE_URL/api/v1/auth/refresh" \
  -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$REFRESH\"}")
check "POST /auth/refresh -> 200" "$([ "$code" = 200 ]; echo $?)"
NEW_ACCESS=$(jq -r '.access_token // empty' "$TMP/refresh.json")
NEW_REFRESH=$(jq -r '.refresh_token // empty' "$TMP/refresh.json")
check "rotation returned a new pair" "$([ -n "$NEW_ACCESS" ] && [ "$NEW_REFRESH" != "$REFRESH" ]; echo $?)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/v1/auth/refresh" \
  -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$REFRESH\"}")
check "old refresh token rejected -> 401" "$([ "$code" = 401 ]; echo $?)"

step "9. Logout"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/v1/auth/logout" \
  -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$NEW_REFRESH\"}")
check "POST /auth/logout -> 204" "$([ "$code" = 204 ]; echo $?)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/v1/auth/refresh" \
  -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$NEW_REFRESH\"}")
check "revoked token rejected -> 401" "$([ "$code" = 401 ]; echo $?)"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
