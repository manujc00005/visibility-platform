#!/bin/bash
# T008 (AC-013 repeated after T002–T007): GET/HEAD, <html lang>, <title> and <h1> per cookie,
# plus weighted Accept-Language without cookie and a hostile header that must not be reflected.
# Usage: bash t008-matrix.sh <scratch-dir>   (expects `next start -p 3105` running)
set +u
PORT=3105; S="$1"
path_list=(/ /workspaces /workspaces/new /workspaces/00000000-0000-4000-8000-000000000000)
row() { # $1 label, then curl header args
  local label="$1"; shift
  for path in "${path_list[@]}"; do
    body="$S/body.html"
    code=$(curl -s -o "$body" -w '%{http_code}' "$@" "http://localhost:$PORT$path")
    lang=$(grep -o '<html[^>]*' "$body" | grep -o 'lang="[^"]*"' | head -1)
    title=$(grep -o '<title>[^<]*' "$body" | sed 's/<title>//' | head -1)
    h1=$(grep -o '<h1[^>]*>[^<]*' "$body" | sed 's/<h1[^>]*>//' | head -1)
    head=$(curl -s -I "$@" "http://localhost:$PORT$path" | head -1 | tr -d '\r')
    printf '%-26s %-52s GET=%s HEAD=%-24s %-10s title="%s" h1="%s"\n' "$label" "$path" "$code" "$head" "$lang" "$title" "$h1"
  done
}
row "sin cookie"
row "cookie es" -H "Cookie: locale=es"
row "cookie en" -H "Cookie: locale=en"
row "cookie xx" -H "Cookie: locale=xx"
row "AL en-GB,es;q=0.8" -H "Accept-Language: en-GB,es;q=0.8"
row "AL es;q=0.2,en;q=0.9" -H "Accept-Language: es;q=0.2,en;q=0.9"
row "AL en + cookie es" -H "Accept-Language: en" -H "Cookie: locale=es"
echo "--- Accept-Language hostil (no debe reflejarse en el HTML) ---"
curl -s -H 'Accept-Language: <script>alert(1)</script>;q=1, en-XSS' -o "$S/hostile.html" "http://localhost:$PORT/"
printf 'lang=%s  reflejado=%s\n' "$(grep -o '<html[^>]*lang="[^"]*"' "$S/hostile.html" | grep -o 'lang="[^"]*"')" "$(grep -c 'alert(1)\|en-XSS' "$S/hostile.html")"
