#!/bin/bash
set +u
PORT=3105; S="$1"
npx next start -p $PORT > "$S/start.log" 2>&1 &
PID=$!
curl -s --retry 40 --retry-delay 1 --retry-connrefused --retry-all-errors -o /dev/null "http://localhost:$PORT/api/health"
echo "server up: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/api/health)"
for cookie in none "locale=es" "locale=en" "locale=xx"; do
  for path in / /workspaces /workspaces/new /workspaces/00000000-0000-4000-8000-000000000000; do
    H=(); [ "$cookie" != none ] && H=(-H "Cookie: $cookie")
    slug=$(printf '%s%s' "$cookie" "$path" | tr '/=' '_-')
    body="$S/body-$slug.html"
    code=$(curl -s -o "$body" -w '%{http_code}' "${H[@]}" "http://localhost:$PORT$path")
    lang=$(grep -o '<html[^>]*' "$body" | grep -o 'lang="[^"]*"' | head -1)
    dl=$(grep -o 'data-locale="[^"]*"' "$body" | head -1)
    h1=$(grep -o '<h1[^>]*>[^<]*' "$body" | sed 's/<h1[^>]*>//' | head -1)
    headline=$(curl -s -I "${H[@]}" "http://localhost:$PORT$path" | head -1 | tr -d '\r')
    printf 'cookie=%-9s path=%-48s GET=%s %-10s %-17s h1="%s" | HEAD: %s\n' "$cookie" "$path" "$code" "$lang" "$dl" "$h1" "$headline"
  done
done | tee "$S/matrix.txt"
kill $PID
