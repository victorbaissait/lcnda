"""Wikitexte → texte simple (assez pour des phrases courtes et vérifiables), sections, liens. Pas de dépendance."""
import re

MOIS = 'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre'


def _date(m):
    parts = [p.strip() for p in m.group(1).split('|') if p.strip() and '=' not in p]
    if len(parts) >= 2 and parts[1].isdigit() and 1 <= int(parts[1]) <= 12:
        parts[1] = MOIS.split('|')[int(parts[1]) - 1]
    return ' '.join(parts[:3])


def plain(t):
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    t = re.sub(r'<ref[^>/]*/>', '', t)
    t = re.sub(r'<ref[^>]*>.*?</ref>', '', t, flags=re.S)
    t = re.sub(r'<br\s*/?>', ' ', t)
    t = re.sub(r'</?(small|big|span|sup|sub|center|b|i|u|s|poem|blockquote|div)[^>]*>', '', t)
    t = re.sub(r'\[\[(?:Fichier|File|Image|Catégorie|Category):[^\[\]]*(?:\[\[[^\]]*\]\][^\[\]]*)*\]\]', '', t)
    for _ in range(3):
        t = re.sub(r'\{\{\s*(?:[Dd]ate(?: républicaine)?-?|[Dd]ate de naissance|[Dd]ate de décès)\s*\|([^{}]*)\}\}', _date, t)
    t = re.sub(r'\{\{\s*(?:s|s-|siècle|sp|s2-)\s*\|\s*([IVXL]+)[^{}]*\}\}', r'\1e siècle', t)
    t = re.sub(r'\{\{\s*([IVXL]+)e siècle\s*\}\}', r'\1e siècle', t)
    t = re.sub(r'\{\{\s*(\d+)\s*(e|er|re|ère|eme)\s*\|\s*([^{}|]*)\}\}', r'\1\2 \3', t)
    t = re.sub(r'\{\{\s*(1er|1re|\d+e)\s*\}\}', r'\1', t)
    t = re.sub(r'\{\{\s*(?:nobr|nowrap|lang\|[a-z-]+|citation|nobr romains|romain|smallcaps|petites capitales)\s*\|([^{}]*)\}\}', lambda m: m.group(1).split('|')[-1], t)
    t = re.sub(r'\{\{\s*(?:nombre|unité)\s*\|([^{}|]*)\|([^{}|]*)[^{}]*\}\}', r'\1 \2', t)
    t = re.sub(r'\{\{\s*(?:nombre|unité|formatnum:)\s*\|?([^{}|]*)\}\}', r'\1', t)
    t = re.sub(r"\{\{\s*page h'\|([^{}|]*)(?:\|([^{}|]*))?\}\}", lambda m: m.group(2) or m.group(1), t)
    t = re.sub(r'\{\{\s*,\s*\}\}', '', t)
    for _ in range(5):
        t = re.sub(r'\{\{[^{}]*\}\}', '', t)
    t = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', t)
    t = re.sub(r'\[https?://[^\s\]]+\s*([^\]]*)\]', r'\1', t)
    t = re.sub(r"'''?", '', t)
    t = re.sub(r'&nbsp;|&#160;', ' ', t)
    t = re.sub(r'(?<![\d])1 (' + MOIS + r')\b', r'1er \1', t)
    t = re.sub(r'[ \t]+', ' ', t)
    return t


def links(t):
    """[(cible, texte)] des liens internes"""
    out = []
    for m in re.finditer(r'\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]', t):
        out.append((m.group(1).strip(), plain(m.group(2) or m.group(1)).strip()))
    return out


def sections(t):
    """[(niveau, titre, corps)] ; le corps s'arrête au titre suivant, quel que soit son niveau"""
    heads = list(re.finditer(r'^(={2,6})\s*(.*?)\s*\1\s*$', t, re.M))
    out = [(1, '', t[:heads[0].start()] if heads else t)]
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(t)
        out.append((len(h.group(1)), h.group(2), t[h.end():end]))
    return out


def infobox_field(t, name):
    m = re.search(r'\{\{\s*Infobox[^\n]*\n(.*?)\n\}\}', t, re.S)
    if not m:
        return ''
    box = m.group(1)
    f = re.search(r'^[ \t]*\|[ \t]*' + name + r'[ \t]*=[ \t]*(.*?)(?=^[ \t]*\||\Z)', box, re.S | re.M)
    return plain(f.group(1)).strip() if f else ''


def squash(s, n=360):
    s = re.sub(r'\s+', ' ', s).strip(' ;,.-–*:')
    if len(s) <= n:
        return s
    cut = s[:n]
    i = max(cut.rfind('. '), cut.rfind(' ; '), cut.rfind(', '))
    return (cut[:i] if i > n * 0.5 else cut.rsplit(' ', 1)[0]) + '…'
