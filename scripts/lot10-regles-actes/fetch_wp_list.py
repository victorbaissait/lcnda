import sys, json, os
from wp import text, OUT
for t in [l.strip() for l in open(sys.argv[1]) if l.strip()]:
    f = OUT + '/' + t.replace('/', '_') + '.json'
    if os.path.exists(f): continue
    try:
        d = text(t); json.dump(d, open(f, 'w'), ensure_ascii=False); print(t, '->', d['title'], len(d['text']), flush=True)
    except Exception as e: print(t, 'ERR', e, flush=True)
