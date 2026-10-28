#!/usr/bin/env python3
"""Traits qui entourent (bordures) d'un thème à soi : écrit assets/css/apparence-traits.css.

Un thème fait dans Réglages → Apparence → « ✎ Mes thèmes » peut changer la couleur et l'épaisseur des traits
qui entourent les cadres, séparément de la couleur du texte. Les feuilles de l'app écrivent ces traits
« 2px solid var(--ink) » (l'encre sert aussi au texte) : ce script recopie chaque règle de bordure de toutes
les feuilles chargées par index.php (dans le même ordre, pour garder qui gagne sur qui), précédée de
:root.lc-frame, avec la couleur var(--lc-frame-color) et l'épaisseur multipliée par var(--lc-frame-k).
La classe lc-frame n'est posée (assets/js/app-apparence.js) que si le thème choisi a ses propres traits :
sans elle, rien ne change.

    python3 scripts/build-frame-css.py        (à relancer après un gros changement des feuilles CSS,
                                              puis monter le ?v= de apparence-traits.css dans index.php)
"""
import colorsys, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'css', 'apparence-traits.css')
SKIP = {'apparence.css', 'apparence-traits.css', 'designs.css', 'designs-gen.css'}

PROP = re.compile(r'^border(-(top|right|bottom|left))?(-(color|width|style))?$')
PX = re.compile(r'^(\d*\.?\d+)px$')
HEX = re.compile(r'^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')
STYLES = {'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'}


def sheets():
    html = open(os.path.join(ROOT, 'index.php'), encoding='utf-8').read()
    names = re.findall(r'<link rel="stylesheet" href="assets/css/([a-z0-9-]+\.css)', html)
    return [n for n in names if n not in SKIP and os.path.isfile(os.path.join(ROOT, 'assets', 'css', n))]


def neutral(color):
    m = HEX.match(color.strip())
    if not m:
        return False
    h = m.group(1)
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return colorsys.rgb_to_hls(r, g, b)[2] < .12


def scale(tok):
    m = PX.match(tok)
    if not m or float(m.group(1)) == 0:
        return tok
    return 'calc(%spx * var(--lc-frame-k))' % m.group(1)


def is_frame_color(color, dark):
    c = color.strip()
    return 'var(--ink)' in c or (dark and neutral(c))


def rewrite(prop, value, dark):
    """La déclaration recopiée (même sens, couleur et épaisseur des traits du thème)."""
    imp = ''
    if value.rstrip().endswith('!important'):
        value, imp = value.rstrip()[:-10].rstrip(), ' !important'
    v = value.strip()
    m = PROP.match(prop)
    kind = m.group(4)
    if v == 'var(--line)':
        return '%s:var(--line)%s' % (prop, imp)
    if kind == 'color':
        return '%s:%s%s' % (prop, 'var(--lc-frame-color)' if is_frame_color(v, dark) else v, imp)
    if kind == 'width':
        return '%s:%s%s' % (prop, ' '.join(scale(t) if PX.match(t) and float(PX.match(t).group(1)) >= 1.5 else t for t in v.split()), imp)
    if kind == 'style':
        return '%s:%s%s' % (prop, v, imp)
    # raccourci : épaisseur, style, couleur dans n'importe quel ordre
    toks = re.findall(r'[a-zA-Z-]+\([^)]*\)|#[0-9a-fA-F]+|[^\s]+', v)
    width = [t for t in toks if PX.match(t) or t in ('0', 'thin', 'medium', 'thick')]
    style = [t for t in toks if t in STYLES]
    color = ' '.join(t for t in toks if t not in width and t not in style)
    thick = any(PX.match(t) and float(PX.match(t).group(1)) >= 1.5 for t in width)
    if color and ('var(--ink)' in color or (dark and thick and neutral(color))):
        out = [scale(t) for t in width] + style + ['var(--lc-frame-color)']
    else:
        out = toks
    return '%s:%s%s' % (prop, ' '.join(out), imp)


# un thème à soi (classe lc-frame) ou un design de Réglages → 🎨 Designs au choix (A1, attribut data-lc-lines)
ON = ':is(.lc-frame,[data-lc-lines])'


def prefix(sel):
    sel = sel.strip()
    if sel.startswith(':root'):
        return ':root' + ON + sel[5:]
    if re.match(r'^html\b', sel):
        return 'html' + ON + sel[4:]
    return ':root' + ON + ' ' + sel


def build():
    out = []
    for name in sheets():
        css = open(os.path.join(ROOT, 'assets', 'css', name), encoding='utf-8').read()
        css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
        rules = []
        for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', css):
            sel = sel.strip()
            if not sel or sel.startswith('@') or re.search(r'^(from|to|\d+%)$', sel) or '@' in sel:
                continue
            decls = []
            dark = 'data-theme="dark"' in sel or "data-theme='dark'" in sel
            for d in body.split(';'):
                if ':' not in d:
                    continue
                p, v = d.split(':', 1)
                p = p.strip().lower()
                if PROP.match(p):
                    decls.append(rewrite(p, v, dark))
            if decls:
                sels = [s for s in re.split(r',(?![^()]*\))', sel) if s.strip() and '::' not in s]
                if sels:
                    rules.append('%s{%s}' % (','.join(prefix(s) for s in sels), ';'.join(decls)))
        if rules:
            out.append('/* %s */\n%s' % (name, '\n'.join(rules)))
    head = ('/* LCNDA — traits qui entourent d’un thème à soi (« ✎ Mes thèmes », et A1 de 🎨 Designs au choix).\n'
            ' * FICHIER FABRIQUÉ par scripts/build-frame-css.py : ne pas modifier à la main. */\n'
            ':root' + ON + '{--line:calc(2px * var(--lc-frame-k)) solid var(--lc-frame-color)}\n')
    open(OUT, 'w', encoding='utf-8').write(head + '\n'.join(out) + '\n')
    print('%s : %d octets' % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT)))


if __name__ == '__main__':
    build()
    # comme build-designs-css.py : les traits d'A1 ne valent que dans les fiches et la colonne de gauche
    import subprocess, sys
    subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'scope-a1-css.py'), 'apparence-traits.css'], check=True)
