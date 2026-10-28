"""T008 global inventory (D017): visible and accessible English DOM of every route, with the
text inside lang="es" blocks set apart. Flags Spanish-looking text outside those blocks so each
remaining match can be classified (interface to fix vs. user/provider/market content).
Usage: python3 t008-dom-inventory.py <base-url> [--all]   (cookie locale=en; routes on stdin)
--all prints every visible/accessible string outside lang="es" (copy review, AC-015)."""
import re, sys, urllib.request
from html.parser import HTMLParser

BASE = sys.argv[1]
SPANISH = re.compile(r"[áéíóúñÁÉÍÓÚÑ¿¡]|\b(de|del|la|las|los|el|y|en|para|con|sin|una|que|por|tu|sus?|empresa|auditor[ií]a|medici[oó]n|pregunta|respuesta|ver|añadir|guardar)\b", re.I)
SKIP = {"script", "style", "noscript", "template"}
ATTRS = ("aria-label", "placeholder", "title", "alt")

class Collector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []  # (tag, is_es, skip)
        self.outside, self.inside = [], []
    def _es(self): return any(s[1] for s in self.stack)
    def _skip(self): return any(s[2] for s in self.stack)
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        void = tag in {"meta", "link", "input", "img", "br", "hr", "source", "path", "circle", "rect", "line"}
        es = a.get("lang") == "es"
        if not self._skip():
            for k in ATTRS:
                if a.get(k):
                    (self.inside if (self._es() or es) else self.outside).append(f"[{k}] {a[k]}")
        if not void:
            self.stack.append((tag, es, tag in SKIP))
    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break
    def handle_data(self, data):
        text = " ".join(data.split())
        if text and not self._skip():
            (self.inside if self._es() else self.outside).append(text)

def fetch(path):
    req = urllib.request.Request(BASE + path, headers={"Cookie": "locale=en"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")

routes = sys.stdin.read().split()
for path in routes:
    status, html = fetch(path)
    body = html.split("<body", 1)[-1].split(">", 1)[-1]
    c = Collector(); c.feed(body)
    if "--all" in sys.argv:
        print(f"=== {path}  HTTP {status}")
        seen = []
        for t in c.outside:
            if t not in seen:
                seen.append(t)
                print("   ·", t)
        continue
    flagged = sorted({t for t in c.outside if SPANISH.search(t)})
    print(f"=== {path}  HTTP {status}  outside-lang-es={len(c.outside)}  inside-lang-es={len(c.inside)}  flagged={len(flagged)}")
    for t in flagged:
        print("   ·", t[:150])
