#!/bin/bash
BASE="http://localhost:8000/api/secguard"
PASS=0
FAIL=0

ok() { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad() { echo "  [FAIL] $1 (expected $2, got $3)"; FAIL=$((FAIL+1)); }

check() {
  local desc="$1" expect="$2" method="$3" url="$4" data="$5"
  local code
  if [ -z "$data" ]; then
    code=$(curl -s -o /tmp/resp.json -w "%{http_code}" -X "$method" "$url" -H "Content-Type: application/json" -b /tmp/ck.txt -c /tmp/ck.txt 2>/dev/null)
  else
    code=$(curl -s -o /tmp/resp.json -w "%{http_code}" -X "$method" "$url" -H "Content-Type: application/json" -b /tmp/ck.txt -c /tmp/ck.txt -d "$data" 2>/dev/null)
  fi
  if [ "$code" = "$expect" ]; then
    ok "$desc (HTTP $code)"
    return 0
  else
    bad "$desc" "$expect" "$code"
    cat /tmp/resp.json 2>/dev/null | head -3
    return 1
  fi
}

echo "=========================================="
echo " SecGuard API Test"
echo "=========================================="
echo ""
echo "=== 1. Auth ==="

check "POST /auth/register" "200" POST "$BASE/auth/register" \
  '{"username":"apitest","password":"Test123456!","email":"apitest@secguard.local"}'

check "POST /auth/register (dup)" "400" POST "$BASE/auth/register" \
  '{"username":"apitest","password":"Test123456!"}'

check "POST /auth/login" "200" POST "$BASE/auth/login" \
  '{"username":"apitest","password":"Test123456!"}'

check "POST /auth/login (wrong)" "400" POST "$BASE/auth/login" \
  '{"username":"apitest","password":"wrong"}'

check "GET /auth/check" "200" GET "$BASE/auth/check"

check "GET /auth/me" "200" GET "$BASE/auth/me"

echo ""
echo "=== 2. Report CRUD ==="

PROJECTS=$(curl -s -b /tmp/ck.txt "http://localhost:8000/api/v1/projects/" 2>/dev/null)
PROJECT_ID=$(echo "$PROJECTS" | python -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and d else d.get('results',[{}])[0].get('id',1))" 2>/dev/null || echo "1")
echo "  [INFO] project_id=$PROJECT_ID"

check "POST /reports (create)" "200" POST "$BASE/reports" \
  "{\"title\":\"SQL Injection Vuln\",\"description\":\"Found SQL injection in login page, parameter not filtered\",\"severity\":\"critical\",\"project_id\":$PROJECT_ID,\"affected_url\":\"http://example.com/login\"}"

VULN_ID=$(cat /tmp/resp.json | python -c "import sys,json; print(json.load(sys.stdin).get('vuln_id',''))" 2>/dev/null)
echo "  [INFO] vuln_id=$VULN_ID"

check "POST /reports (short desc)" "400" POST "$BASE/reports" \
  "{\"title\":\"XSS\",\"description\":\"x\",\"severity\":\"low\",\"project_id\":$PROJECT_ID}"

check "POST /reports (bad severity)" "400" POST "$BASE/reports" \
  "{\"title\":\"Test\",\"description\":\"This is a test description long enough\",\"severity\":\"invalid\",\"project_id\":$PROJECT_ID}"

check "GET /reports (list)" "200" GET "$BASE/reports?page=1&per_page=20"

check "GET /reports?status=pending" "200" GET "$BASE/reports?status=pending"

check "GET /reports?severity=critical" "200" GET "$BASE/reports?severity=critical"

check "GET /reports?search=SQL" "200" GET "$BASE/reports?search=SQL"

check "GET /reports/{id}" "200" GET "$BASE/reports/$VULN_ID"

check "PUT /reports/{id} (update)" "200" PUT "$BASE/reports/$VULN_ID" \
  '{"title":"SQL Injection Vuln (Updated)","severity":"high"}'

check "GET /reports/NONEXIST" "400" GET "$BASE/reports/NONEXIST"

echo ""
echo "=== 3. Duplicate Check ==="
check "POST /reports/check-duplicate" "200" POST "$BASE/reports/check-duplicate" \
  "{\"title\":\"SQL Injection Vuln\",\"description\":\"Found SQL injection\",\"project_id\":$PROJECT_ID}"

echo ""
echo "=== 4. Status Transitions ==="

check "POST /auth/logout" "200" POST "$BASE/auth/logout"

check "POST /auth/login (admin)" "200" POST "$BASE/auth/login" \
  '{"username":"admin11","password":"admin123"}'

ADMIN_ID=$(cat /tmp/resp.json | python -c "import sys,json; print(json.load(sys.stdin).get('user_id',''))" 2>/dev/null)
echo "  [INFO] admin_id=$ADMIN_ID"

check "POST /reports/{id}/assign" "200" POST "$BASE/reports/$VULN_ID/assign" \
  "{\"assignee_id\":$ADMIN_ID,\"comment\":\"Please fix this SQL injection ASAP\"}"

check "POST /reports/{id}/transition (submit_fix)" "200" POST "$BASE/reports/$VULN_ID/transition" \
  '{"action":"submit_fix","comment":"Fixed by adding parameterized queries"}'

check "POST /reports/{id}/transition (confirm_review)" "200" POST "$BASE/reports/$VULN_ID/transition" \
  '{"action":"confirm_review","comment":"Review passed, fix is effective"}'

check "POST /reports/{id}/transition (close)" "200" POST "$BASE/reports/$VULN_ID/transition" \
  '{"action":"close","comment":"Vulnerability closed"}'

check "POST /reports/{id}/transition (reopen)" "200" POST "$BASE/reports/$VULN_ID/transition" \
  '{"action":"reopen","comment":"Reopened, issue persists"}'

echo ""
echo "=== 5. Audit Logs ==="
check "GET /reports/{id}/audit-logs" "200" GET "$BASE/reports/$VULN_ID/audit-logs"
check "GET /audit-logs" "200" GET "$BASE/audit-logs?page=1&per_page=10"

echo ""
echo "=== 6. Statistics ==="
check "GET /statistics/overview" "200" GET "$BASE/statistics/overview"

echo ""
echo "=== 7. Scan Tasks ==="
check "GET /scans" "200" GET "$BASE/scans"
check "POST /scans (create)" "200" POST "$BASE/scans" \
  '{"target":"http://testphp.vulnweb.com","scanner_type":"deep","name":"Test Scan"}'

echo ""
echo "=== 8. Report Export ==="
check "POST /reports-export (html)" "200" POST "$BASE/reports-export" \
  '{"format":"html"}'
check "POST /reports-export (pdf)" "200" POST "$BASE/reports-export" \
  '{"format":"pdf"}'
check "POST /reports-export (json)" "200" POST "$BASE/reports-export" \
  '{"format":"json"}'

echo ""
echo "=== 9. Assets ==="
check "GET /assets" "200" GET "$BASE/assets"

echo ""
echo "=== 10. Team Management ==="

check "POST /teams/create" "200" POST "$BASE/teams/create" \
  '{"name":"SecGuard Test Team"}'

TEAM_ID=$(cat /tmp/resp.json | python -c "import sys,json; print(json.load(sys.stdin).get('team_id',''))" 2>/dev/null)
echo "  [INFO] team_id=$TEAM_ID"

check "POST /teams/create (dup)" "400" POST "$BASE/teams/create" \
  '{"name":"SecGuard Test Team"}'

check "GET /teams" "200" GET "$BASE/teams"

check "GET /teams?search=SecGuard" "200" GET "$BASE/teams?search=SecGuard"

check "GET /teams/members" "200" GET "$BASE/teams/members"

check "GET /teams/pending" "200" GET "$BASE/teams/pending"

check "GET /teams/my-teams" "200" GET "$BASE/teams/my-teams"

check "GET /teams/pending-invitation" "200" GET "$BASE/teams/pending-invitation"

check "POST /teams/invite" "200" POST "$BASE/teams/invite" \
  '{"username":"apitest"}'

check "POST /teams/invite (nonexistent)" "400" POST "$BASE/teams/invite" \
  '{"username":"no_such_user_xyz"}'

check "POST /auth/logout" "200" POST "$BASE/auth/logout"
check "POST /auth/login (apitest)" "200" POST "$BASE/auth/login" \
  '{"username":"apitest","password":"Test123456!"}'

TEAM_JOIN_DATA="{\"team_id\":$TEAM_ID}"
check "POST /teams/accept-invite" "200" POST "$BASE/teams/accept-invite"

check "POST /teams/accept-invite (no pending)" "400" POST "$BASE/teams/accept-invite"

check "POST /auth/logout" "200" POST "$BASE/auth/logout"
check "POST /auth/login (admin2)" "200" POST "$BASE/auth/login" \
  '{"username":"admin11","password":"admin123"}'

MEMBER_ID=$(curl -s -b /tmp/ck.txt "$BASE/teams/pending" | python -c "import sys,json; items=json.load(sys.stdin).get('items',[]); print(items[0]['id'] if items else 0)" 2>/dev/null)

if [ "$MEMBER_ID" != "0" ]; then
  check "POST .../handle (approve)" "200" POST "$BASE/teams/members/$MEMBER_ID/handle" \
    '{"action":"approve","role":"developer"}'

  check "POST .../handle (change_role)" "200" POST "$BASE/teams/members/$MEMBER_ID/handle" \
    '{"action":"change_role","role":"team_lead"}'
fi

check "GET /admin/teams-dashboard" "200" GET "$BASE/admin/teams-dashboard"

echo ""
echo "=== 11. Cleanup ==="
check "DELETE /reports/{id}" "200" DELETE "$BASE/reports/$VULN_ID" "{}"

echo ""
echo "=========================================="
echo " Results: PASS=$PASS  FAIL=$FAIL"
echo "=========================================="

[ $FAIL -gt 0 ] && exit 1
exit 0
