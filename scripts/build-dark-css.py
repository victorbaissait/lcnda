#!/usr/bin/env python3
"""Mode sombre automatique : pour chaque couleur claire écrite en dur dans une feuille CSS
(fond clair, texte foncé, bordure claire), écrit la règle sombre qui va avec, même teinte.

Le bloc produit est remplacé à chaque passage, entre deux balises, en fin de fichier.
On ne touche pas à ce qui doit rester « papier » (page, diapositive, aperçu, nuancier…)
ni aux sélecteurs qui ont déjà leur règle sombre écrite à la main.

    python3 scripts/build-dark-css.py assets/css/heritage.css assets/css/app.css
"""
import colorsys, re, sys

START = '/* ═════ Mode sombre automatique (scripts/build-dark-css.py, ne pas modifier à la main) ═════ */'
END = '/* ═════ fin du mode sombre automatique ═════ */'
DARK = ':root[data-theme="dark"] '
# ce qui représente du papier, une image ou une couleur choisie : reste tel quel
KEEP = re.compile(r'(paper|page|slide|sheet|thumb|preview|-pv\b|print|canvas|svg|artboard|swatch|sw-|nuance|colou?r|legend|leaflet|tile|qr\b|kn-stage|ly-spread|ly-doc|h-dt-pv|vx-art|board-canvas|map-|cover|theme|h-hs-stage|h-hs-plan)', re.I)
HEX = re.compile(r'#([0-9a-fA-F]{3,8})\b')
RGB = re.compile(r'rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+%?))?\s*\)')

def parse_hex(h):
    if len(h) in (3, 4): h = ''.join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    a = int(h[6:8], 16) / 255 if len(h) == 8 else 1
    return r, g, b, a

def fmt(r, g, b, a):
    s = '#%02x%02x%02x' % tuple(round(max(0, min(1, v)) * 255) for v in (r, g, b))
    return s if a >= .999 else 'rgba(%d,%d,%d,%.2f)' % (round(r * 255), round(g * 255), round(b * 255), a)

def shift(rgba, role):
    r, g, b, a = rgba
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if role == 'bg':
        if l < .78 or a < .3: return None            # déjà foncé, ou presque transparent
        l2, s2 = .13 + (1 - l) * .45, s * .55
    elif role == 'fg':
        if l > .42: return None                        # déjà clair
        l2, s2 = max(.78, 1 - l * .9), s * .8
    else:  # bordure
        if l < .72: return None
        l2, s2 = .3, s * .5
    return fmt(*colorsys.hls_to_rgb(h, l2, s2), a)

def convert(value, role):
    changed = False
    def rep_hex(m):
        nonlocal changed
        n = shift(parse_hex(m.group(1)), role)
        if n: changed = True; return n
        return m.group(0)
    def rep_rgb(m):
        nonlocal changed
        a = m.group(4); a = (float(a[:-1]) / 100 if a and a.endswith('%') else float(a)) if a else 1
        n = shift((int(m.group(1)) / 255, int(m.group(2)) / 255, int(m.group(3)) / 255, a), role)
        if n: changed = True; return n
        return m.group(0)
    v = HEX.sub(rep_hex, value); v = RGB.sub(rep_rgb, v)
    if role != 'fg': v = re.sub(r'\bwhite\b', lambda m: shift((1, 1, 1, 1), role) or m.group(0), v)
    return v if v != value else None

def rules(css):
    """(media, sélecteurs, déclarations) pour chaque règle, @media compris (un niveau)."""
    out, i, n = [], 0, len(css)
    def scan(text, media):
        pos = 0
        while True:
            o = text.find('{', pos)
            if o < 0: return
            head = text[pos:o].strip(); depth, j = 1, o + 1
            while j < len(text) and depth:
                depth += {'{': 1, '}': -1}.get(text[j], 0); j += 1
            body = text[o + 1:j - 1]
            head = re.sub(r'/\*.*?\*/', '', head, flags=re.S).strip()
            if head.startswith('@media'): scan(body, head)
            elif not head.startswith('@'): out.append((media, head, body))
            pos = j
    scan(re.sub(r'/\*.*?\*/', '', css, flags=re.S), None)
    return out

def build(css):
    css = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\n?', '', css, flags=re.S)
    all_rules = rules(css)
    handmade = set()
    for _, sel, _ in all_rules:
        if 'data-theme="dark"' in sel or "data-theme='dark'" in sel:
            for s in sel.split(','): handmade.add(re.sub(r':root\[data-theme=["\']dark["\']\]\s*', '', s).strip())
    blocks = {}
    for media, sel, body in all_rules:
        if 'data-theme' in sel or 'prefers-color-scheme' in (media or '') or (media and 'print' in media): continue
        sels = [s.strip() for s in sel.split(',') if s.strip() and not KEEP.search(s) and s.strip() not in handmade and not s.strip().startswith((':root', 'html', 'body'))]
        if not sels: continue
        decls = []
        for d in body.split(';'):
            if ':' not in d: continue
            k, v = d.split(':', 1); k = k.strip().lower(); v = v.strip()
            role = 'bg' if k in ('background', 'background-color') else 'fg' if k == 'color' else 'bd' if k.startswith('border') and 'radius' not in k and 'width' not in k and 'style' not in k else None
            if not role or 'var(' in v: continue
            if role == 'bg' and 'url(' in v: continue
            n = convert(v, role)
            if n: decls.append(f'{k}:{n}')
        if decls:
            blocks.setdefault(media, []).append(','.join(DARK + s for s in sels) + '{' + ';'.join(decls) + '}')
    lines = [START]
    for media, rs in blocks.items():
        lines.append(f'{media}{{' + '\n'.join(rs) + '}' if media else '\n'.join(rs))
    lines.append(END)
    return css.rstrip('\n') + '\n' + '\n'.join(lines) + '\n', sum(len(r) for r in blocks.values())

if __name__ == '__main__':
    for path in sys.argv[1:]:
        css = open(path, encoding='utf-8').read()
        new, n = build(css)
        open(path, 'w', encoding='utf-8').write(new)
        print(f'{path} : {n} règles sombres')
