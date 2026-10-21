#!/usr/bin/env python3
"""🎨 Designs au choix (A1 à A10) : écrit assets/css/designs-gen.css.

Les feuilles de l'app écrivent leurs ombres, leurs fonds blancs, leurs marges et leurs « boutons qui s'enfoncent » en dur
(« box-shadow: 4px 4px 0 rgba(5,93,255,.28) », « background: white », « padding: 12px »…). Pour qu'un design choisi
dans Maintenance → 🎨 Designs au choix change toute l'app d'un coup, ce script recopie chacune de ces règles, précédée
de l'attribut qui la commande sur <html> :

  :root[data-lc-sh="douces"|"aucune"]   ombres douces ou sans ombre (A1)  ; [data-lc-sh="franches"][data-lc-acc] : à la couleur d'accent
  :root[data-lc-r]                      coins arrondis (A1, var(--lc-r)) sur les cadres
  :root[data-lc-cards]                  fonds blancs (et fonds sombres neutres du mode sombre) pris dans la palette du style (A1)
  :root[data-lc-density]                marges intérieures et écarts × var(--lc-sp) (A2)
  :root[data-lc-mhover="off"]           plus de bouton qui s'enfonce au survol (A8)

Sans ces attributs (« Comme avant », le départ), aucune règle ne s'applique. Les règles gardent leurs @media et l'ordre
des feuilles (même ordre que dans index.php), donc qui gagne sur qui ne change pas.

    python3 scripts/build-designs-css.py      (à relancer après un gros changement des feuilles CSS,
                                              puis monter le ?v= de designs-gen.css dans index.php)
"""
import colorsys, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'css', 'designs-gen.css')
SKIP = {'apparence-traits.css', 'designs.css', 'designs-gen.css'}

PX = re.compile(r'^(-?\d*\.?\d+)px$')
HEX = re.compile(r'#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b')
RGB = re.compile(r'rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+%?))?\s*\)')
# ce qui ne doit pas changer : papier, aperçus, images, couleurs choisies, cartes géographiques, réglages eux-mêmes…
KEEP_RE = re.compile(r'(paper|slide|sheet|thumb|preview|-pv\b|print|canvas|svg|artboard|swatch|sw-|nuance|colou?r|legend|leaflet|tile|qr\b|kn-stage|ly-spread|ly-doc|'
                  r'h-dt-pv|vx-art|board-canvas|map-|cover|theme|h-hs-stage|h-hs-plan|lcd-|lck-|lc-av|lc-hero|ms-|a11y-|toast-color|cb-|ui-cb|pdf|photo|img\b|video|audio)', re.I)
class _Keep:
    """KEEP.search(sélecteur), sans regarder « :root[data-theme=\"dark\"] » (« theme » est un mot à garder ailleurs)"""
    def search(self, sel):
        return KEEP_RE.search(re.sub(r'\[data-theme=[^\]]*\]', '', sel))


KEEP = _Keep()
NO_RADIUS = re.compile(r'(dot\b|-dot|\bav\b|-av\b|avatar|portrait|thumb|marker|\bpin\b|-pin|radio|checkbox|switch|toggle|knob|handle|swatch|\bsw\b|color|circle|round|segmented|'
                       r'\btd\b|\bth\b|\btr\b|table|cell|kbd|\btab\b|-tab\b|tabs\b|seg|\bhr\b|sep\b|-line\b|\bbar\b|-bar\b|scroll|::|map|leaflet|tile|canvas|svg|chip|badge|'
                       r'\bmt-|grip|spin|cursor|caret|range|slider|lcd-|lck-|lc-|relation-chip|status|life|tree\b|tree-|stamp|diamond|card-index|side-number|nav-item|'
                       r'brand|topbar|sidebar\b|sidebar-top|sidebar-footer|workspace|app-shell|data-list|calendar|event-icon|icon-action|rotate)', re.I)
NO_DENSITY = re.compile(r'(\.tree\b|tree li|tree ul|lcd-|lck-|lc-|ui-toggle|ui-num|ui-range|kbd|badge|::|card-index|side-number|life-dot|status-dot|icon-action|range|'
                        r'map|leaflet|tile|canvas|svg|board|ly-|kn-|vx-|h-hs|h-ed|house|sheet|slide|print|pdf|dialog\.is-full|editor|artboard)', re.I)


def sheets():
    html = open(os.path.join(ROOT, 'index.php'), encoding='utf-8').read()
    names = re.findall(r'<link rel="stylesheet" href="assets/css/([a-z0-9-]+\.css)', html)
    return [n for n in names if n not in SKIP and os.path.isfile(os.path.join(ROOT, 'assets', 'css', n))]


def parse(css):
    """[(prelude, body)] où body est une chaîne de déclarations, ou une liste (bloc @media / @supports)"""
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == '{':
                depth += 1
            elif css[k] == '}':
                depth -= 1
            k += 1
        inner = css[j + 1:k - 1]
        if prelude.startswith('@'):
            if re.match(r'@(media|supports|layer|container)\b', prelude):
                out.append((prelude, parse(inner)))
            # @keyframes, @font-face, @page… : laissés tels quels
        else:
            out.append((prelude, inner))
        i = k
    return out


def decls(body):
    res = []
    for d in re.split(r';(?![^()]*\))', body):
        if ':' not in d:
            continue
        p, v = d.split(':', 1)
        p, v = p.strip().lower(), v.strip()
        imp = ''
        if v.endswith('!important'):
            v, imp = v[:-10].strip(), ' !important'
        res.append((p, v, imp))
    return res


def split_top(v, sep=','):
    parts, depth, cur = [], 0, ''
    for ch in v:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == sep and depth == 0:
            parts.append(cur)
            cur = ''
        else:
            cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def prefix(sel, attr):
    sel = sel.strip()
    if sel.startswith(':root'):
        return ':root' + attr + sel[5:]
    if re.match(r'^html\b', sel):
        return ':root' + attr + sel[4:]
    return ':root' + attr + ' ' + sel


def sels_of(sel):
    return [s.strip() for s in re.split(r',(?![^()]*\))', sel) if s.strip()]


def hard_shadow(part):
    toks = re.findall(r'[a-zA-Z-]+\([^)]*\)|[^\s]+', part)
    if 'inset' in toks:
        return None
    lens = [t for t in toks if PX.match(t) or t == '0']
    if len(lens) < 2:
        return None
    nums = [float(PX.match(t).group(1)) if PX.match(t) else 0 for t in lens]
    blur = nums[2] if len(nums) > 2 else 0
    if blur != 0 or (nums[0] == 0 and nums[1] == 0):
        return None
    color = ' '.join(t for t in toks if t not in lens)
    return nums[0], nums[1], color


BLUES = {(5, 93, 255), (0, 102, 204), (77, 159, 255), (85, 153, 255), (59, 111, 224)}


def accent_color(color):
    m = RGB.search(color)
    if m and tuple(int(m.group(i)) for i in (1, 2, 3)) in BLUES:
        a = m.group(4)
        a = (float(a[:-1]) / 100 if a.endswith('%') else float(a)) if a else 1
        return 'color-mix(in srgb,var(--blue) %d%%,transparent)' % round(a * 100)
    return None


def lightness(color):
    c = color.strip().lower()
    if c == 'white':
        return 1, 0
    m = re.fullmatch(r'#([0-9a-f]{3}|[0-9a-f]{6})', c)
    if not m:
        return None
    h = m.group(1)
    if len(h) == 3:
        h = ''.join(x * 2 for x in h)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hh, l, s = colorsys.rgb_to_hls(r, g, b)
    return l, s


def scale_len(v):
    toks = v.split()
    if not toks or any(not (PX.match(t) or t in ('0', 'auto')) for t in toks):
        return None
    if not any(PX.match(t) and float(PX.match(t).group(1)) >= 2 for t in toks):
        return None
    if any(PX.match(t) and float(PX.match(t).group(1)) < 0 for t in toks):
        return None
    return ' '.join('calc(%spx * var(--lc-sp))' % PX.match(t).group(1) if PX.match(t) and float(PX.match(t).group(1)) >= 2 else t for t in toks)


def rules_for(sel, body):
    """les règles recopiées d'une règle de l'app : [(attribut, sélecteurs, déclarations)]"""
    ds = decls(body)
    if not ds:
        return []
    sels = sels_of(sel)
    dark = 'data-theme="dark"' in sel or "data-theme='dark'" in sel
    out = []
    has_radius = any(p.startswith('border-radius') or p.endswith('-radius') for p, _, _ in ds)
    for p, v, imp in ds:
        # ── ombres
        if p == 'box-shadow' and v not in ('none', 'inherit', 'initial', 'unset') and 'var(' not in v.replace('var(--blue)', '').replace('var(--ink)', '').replace('var(--blue-soft)', '').replace('var(--blue-bright)', ''):
            parts = split_top(v)
            hs = [hard_shadow(x) for x in parts]
            if parts and all(hs):
                big = max(max(abs(x), abs(y)) for x, y, _ in hs)
                size = 'l' if big >= 6 else 'm' if big >= 3 else 's'
                out.append(('[data-lc-sh="douces"]', sels, 'box-shadow:var(--lc-sh-%s)%s' % (size, imp)))
                out.append(('[data-lc-sh="aucune"]', sels, 'box-shadow:none%s' % imp))
                acc = [accent_color(c) for _, _, c in hs]
                if any(acc):
                    nv = ','.join('%gpx %gpx 0 %s' % (x, y, a or c) for (x, y, c), a in zip(hs, acc))
                    out.append(('[data-lc-sh="franches"][data-lc-acc]', sels, 'box-shadow:%s%s' % (nv, imp)))
        # ── coins arrondis
        if not has_radius and not dark and (p == 'border' or p == 'border-width') and v not in ('0', 'none') and not v.startswith('0 ') and (v == 'var(--line)' or re.search(r'\b(solid|dashed|double)\b', v) or p == 'border-width'):
            ok = [s for s in sels if not NO_RADIUS.search(s) and not KEEP.search(s) and ':hover' not in s and ':focus' not in s and ':active' not in s]
            if ok:
                out.append(('[data-lc-r]', ok, 'border-radius:var(--lc-r)'))
        # ── fonds de la palette
        if p in ('background', 'background-color'):
            vv = v.strip().lower()
            lt = lightness(vv) if (p == 'background-color' or re.fullmatch(r'(white|#[0-9a-f]{3}|#[0-9a-f]{6})', vv)) else None
            ok = [s for s in sels if not KEEP.search(s) and ':hover' not in s]
            if lt and ok:
                l, s = lt
                var = None
                if not dark and l >= .995:
                    var = '--lc-card'
                elif not dark and .94 <= l < .995 and s < .2:
                    var = '--lc-head'
                elif dark and s < .12 and .06 <= l <= .125:
                    var = '--lc-paper'
                elif dark and s < .12 and .125 < l <= .16:
                    var = '--lc-card'
                elif dark and s < .12 and .16 < l <= .23:
                    var = '--lc-head'
                if var:
                    out.append(('[data-lc-cards]', ok, 'background-color:var(%s)%s' % (var, imp)))
                    continue
            # les autres fonds (bleu de la ligne choisie, survol…) sont recopiés tels quels : ils gardent leur rang
            # (sinon un fond blanc recopié passerait devant le fond bleu d'un élément choisi)
            okall = [s for s in sels if not KEEP.search(s)]
            if okall and v.strip().lower() not in ('none', 'transparent', 'inherit', 'initial', 'unset'):
                out.append(('[data-lc-cards]', okall, '%s:%s%s' % (p, v, imp)))
        # ── densité
        if p in ('padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'padding-block', 'padding-inline', 'gap', 'row-gap', 'column-gap', 'grid-gap', 'margin-bottom', 'margin-top'):
            nv = scale_len(v)
            if nv and (not p.startswith('margin') or (PX.match(v) and float(PX.match(v).group(1)) >= 8)):
                ok = [s for s in sels if not NO_DENSITY.search(s)]
                if ok:
                    out.append(('[data-lc-density]', ok, '%s:%s%s' % (p, nv, imp)))
        # ── le bouton qui s'enfonce au survol
        if p == 'transform' and 'translate' in v and 'rotate' not in v and 'scale' not in v:
            ok = [s for s in sels if (':hover' in s or ':active' in s) and not KEEP.search(s)]
            if ok:
                out.append(('[data-lc-mhover="off"]', ok, 'transform:none%s' % imp))
    return out


def emit(items, indent=''):
    lines = []
    for prelude, body in items:
        if isinstance(body, list):
            inner = emit(body, indent + '  ')
            if inner:
                lines.append('%s%s{\n%s\n%s}' % (indent, prelude, '\n'.join(inner), indent))
            continue
        for attr, sels, decl in rules_for(prelude, body):
            lines.append('%s%s{%s}' % (indent, ','.join(prefix(s, attr) for s in sels), decl))
    return lines


def build():
    out = []
    for name in sheets():
        css = open(os.path.join(ROOT, 'assets', 'css', name), encoding='utf-8').read()
        css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
        lines = emit(parse(css))
        if lines:
            out.append('/* %s */\n%s' % (name, '\n'.join(lines)))
    head = ('/* LCNDA — 🎨 Designs au choix : ombres, coins, fonds, densité et survol de toute l’app, recopiés derrière leur attribut.\n'
            ' * FICHIER FABRIQUÉ par scripts/build-designs-css.py : ne pas modifier à la main. Sans attribut data-lc-* sur <html>, rien ne s’applique. */\n')
    open(OUT, 'w', encoding='utf-8').write(head + '\n'.join(out) + '\n')
    print('%s : %d octets, %d règles' % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT), sum(o.count('\n') for o in out)))


if __name__ == '__main__':
    build()
