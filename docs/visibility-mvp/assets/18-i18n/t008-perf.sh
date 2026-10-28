#!/bin/bash
# T008: local response times before (425e23b, port 3106) and after (003, port 3105), same machine,
# same development database, same data. 5 warm-up requests, then N alternating samples per route.
# Prints median and p90 of time to first byte and total time, in ms.
N=${N:-40}
for path in / /workspaces /workspaces/new; do
  for port in 3106 3105; do for i in 1 2 3 4 5; do curl -s -o /dev/null "http://localhost:$port$path"; done; done
  : > /tmp/t008-before.txt; : > /tmp/t008-after.txt
  for i in $(seq 1 $N); do
    curl -s -o /dev/null -w '%{time_starttransfer} %{time_total}\n' "http://localhost:3106$path" >> /tmp/t008-before.txt
    curl -s -o /dev/null -w '%{time_starttransfer} %{time_total}\n' "http://localhost:3105$path" >> /tmp/t008-after.txt
  done
  for label in before after; do
    python3 - "$path" "$label" /tmp/t008-$label.txt <<'PY'
import sys, statistics
path, label, f = sys.argv[1:]
rows = [tuple(map(float, l.split())) for l in open(f) if l.strip()]
def q(xs, p): xs = sorted(xs); return xs[min(len(xs) - 1, int(round(p * (len(xs) - 1))))]
ttfb = [r[0] * 1000 for r in rows]; total = [r[1] * 1000 for r in rows]
print(f"{path:<18} {label:<7} n={len(rows)}  TTFB p50={statistics.median(ttfb):6.1f} p90={q(ttfb,.9):6.1f}  total p50={statistics.median(total):6.1f} p90={q(total,.9):6.1f}")
PY
  done
done
rm -f /tmp/t008-before.txt /tmp/t008-after.txt
