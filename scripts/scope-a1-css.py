#!/usr/bin/env python3
"""🎨 Le style (traits, ombres, coins) ne touche plus toute l'app : seulement les fiches et la colonne de gauche.

Les règles écrites « :root[data-lc-r] .card {…} » (attribut posé sur <html>) deviennent
« :root .card:is([data-lc-r], [data-lc-r] *) {…} » : elles ne s'appliquent qu'à l'intérieur d'un élément qui porte
l'attribut (la fiche ouverte, la colonne de gauche — app-designs.js et app-colonne.js les y posent). Les aperçus
(iframes) posent l'attribut sur leur <html> : tout l'aperçu suit, comme avant.

Attributs concernés : data-lc-style, data-lc-lines, data-lc-sh, data-lc-r. « .lc-frame » (Apparence → ✎ Mes thèmes)
reste sur <html> : « :root:is(.lc-frame,[data-lc-lines]) X » donne « :root.lc-frame X » et la version limitée.
Même spécificité qu'avant. Le script ne touche qu'une fois chaque règle (relancé, il ne change rien).

    python3 scripts/scope-a1-css.py          (build-designs-css.py le lance aussi sur designs-gen.css)
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ['designs.css', 'designs-gen.css', 'apparence-traits.css']
A1 = re.compile(r'^\[data-lc-(style|lines|sh|r)(?:[\]=])')
LEAD = re.compile(r'^(:root|html)((?:\[[^\]]*\]|:is\([^()]*\)|:not\([^()]*\)|:root|\.[\w-]+)*)')
PART = re.compile(r'\[[^\]]*\]|:is\([^()]*\)|:not\([^()]*\)|:root|\.[\w-]+')


def split_top(s, seps=','):
    out, depth, cur, q = [], 0, '', ''
    for ch in s:
        if q:
            cur += ch
            if ch == q:
                q = ''
            continue
        if ch in '"\'':
            q = ch
        elif ch in '([':
            depth += 1
        elif ch in ')]':
            depth -= 1
        elif ch in seps and depth == 0:
            out.append(cur); cur = ''
            continue
        cur += ch
    out.append(cur)
    return out


def last_compound_start(rest):
    """l'indice où commence le dernier sélecteur composé de rest (après le dernier espace / > / + / ~ de premier niveau)"""
    depth, q, pos = 0, '', 0
    for i, ch in enumerate(rest):
        if q:
            if ch == q:
                q = ''
            continue
        if ch in '"\'':
            q = ch
        elif ch in '([':
            depth += 1
        elif ch in ')]':
            depth -= 1
        elif depth == 0 and ch in ' >+~':
            pos = i + 1
    return pos


def scope_one(sel):
    s = sel.strip()
    m = LEAD.match(s)
    if not m:
        return [s]
    parts = PART.findall(m.group(2))
    a1 = [p for p in parts if A1.match(p)]
    frame = [p for p in parts if p.startswith(':is(') and '.lc-frame' in p and '[data-lc-lines]' in p]
    if not a1 and not frame:
        return [s]
    others = ''.join(p for p in parts if p not in a1 and p not in frame)
    rest = s[m.end():]
    # :is(.lc-frame,[data-lc-lines]) : la version « Mes thèmes » reste sur <html>, l'autre est limitée
    variants = [('.lc-frame', a1), ('', a1 + ['[data-lc-lines]'])] if frame else [('', a1)]
    out = []
    for extra, sp in variants:
        head, S = m.group(1) + others + extra, ''.join(sp)
        if not S:
            out.append(head + rest)
        elif not rest.strip():  # des variables : sur l'élément qui porte l'attribut ; aussi sur <html> lui-même (les aperçus)
            out.append(head + S); out.append(head + ' ' + S)
        else:
            i = last_compound_start(rest)
            comp = rest[i:]
            j = comp.find('::')
            k = j if j >= 0 else len(comp)
            out.append(head + rest[:i] + comp[:k] + ':is(%s, %s *)' % (S, S) + comp[k:])
    return out


def scope_css(css):
    """chaque « sélecteurs {» (au premier niveau ou dans un @media) ; les @-règles et le reste ne bougent pas"""
    res, i, n = [], 0, len(css)
    pat = re.compile(r'([^{}]+)\{')
    while i < n:
        m = pat.search(css, i)
        if not m:
            res.append(css[i:]); break
        res.append(css[i:m.start()])
        pre = m.group(1)
        k = pre.rfind('*/') + 2 if '*/' in pre else 0  # un commentaire collé devant le sélecteur reste devant
        com, body = pre[:k], pre[k:]
        lead = body[:len(body) - len(body.lstrip())]
        sel = body.strip()
        if sel.startswith('@') or not sel:
            res.append(pre + '{')
        else:
            sels = [x.strip() for x in split_top(sel) if x.strip()]
            outs = {x: scope_one(x) for x in sels}
            done = {t for x in sels for t in outs[x] if t != x}  # une forme déjà limitée (lancement d'avant) ne se relimite pas
            new = []
            for x in sels:
                for t in ([x] if x in done else outs[x]):
                    if t not in new:
                        new.append(t)
            res.append(pre + '{' if new == sels else com + lead + ', '.join(new) + ' {')
        i = m.end()
    return ''.join(res)


def main(names):
    for name in names:
        p = os.path.join(ROOT, 'assets', 'css', name)
        css = open(p, encoding='utf-8').read()
        out = scope_css(css)
        if out != css:
            open(p, 'w', encoding='utf-8').write(out)
        print(name, 'limité aux fiches et à la colonne' if out != css else 'déjà fait')


if __name__ == '__main__':
    main(sys.argv[1:] or FILES)
