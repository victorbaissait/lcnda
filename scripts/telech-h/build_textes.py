#!/usr/bin/env python3
"""Lot H — Les métiers et les pays d'autrefois dans Wikipédia (CC BY-SA 4.0) : th-textes.

Pour chaque sujet, on lit quelques articles de Wikipédia en français (texte brut, action=raw : une requête par article) et on garde
les phrases qui parlent du sujet (mot-clé) ET nomment une commune de France (lien vers un article qui, sur Wikidata, a un code
INSEE P374). La phrase est recopiée telle quelle (sans les références), avec le titre et l'adresse de l'article : « les contributeurs
de Wikipédia », CC BY-SA 4.0. Le lieu (position, code INSEE) vient de Wikidata (CC0). Rien n'est inventé ni résumé.
Sujets : coutellerie (Thiers, Nogent…), ganterie et mégisserie (Millau, Grenoble, Annonay…), vannerie et osier, chocolat et
biscuits, conserveries et sardineries, terre-neuvas (ports d'armement pour la morue), la mer nourricière (huîtres, goémoniers, pêche
à pied), plantes à teinture (garance, pastel du Lauragais).
Aussi, pour chaque sujet, une ou deux phrases d'introduction (sans commune) : « ctx ».
Lancer : python3 -I scripts/telech-h/build_textes.py [dossier de sortie]
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
# sujet : (articles, mot-clé exigé dans la phrase)
THEMES = {
    'coutellerie': (['Coutellerie', 'Coutellerie de Thiers', 'Couteau'], r'coutel|couteau|émouleur|rémouleur'),
    'ganterie': (['Gant', 'Mégisserie'], r'gant|mégis'),
    'vannerie': (['Vannerie', 'Osier'], r'vann|osier|panier'),
    'chocolat': (['Chocolaterie', 'Biscuit', 'Chocolat'], r'chocolat|biscuit'),
    'conserverie': (["Conserve de sardines à l'huile", 'Conserve', 'Sardina pilchardus'], r'sardin|conserver?ie|friture'),
    'terreneuvas': (['Terre-neuvas', 'Grande pêche', 'Morue'], r'morue|terre-neuv|grande pêche|\barmateurs?\b|\barmement'),
    'mer': (['Ostréiculture', 'Goémonier', 'Pêche à pied'], r'huîtr|ostréi|goémon|varech|pêche à pied|conchyli|mytili|moules?\b|parcs? à huîtres'),
    'teinture': (['Garance des teinturiers', 'Pastel des teinturiers', 'Pays de Cocagne'], r'garance|pastel|teintur|cocagne|guède|coque'),
}
BROKEN = re.compile(r'\s[,.;:)]|\(\s*\)|[,:;]$|\b(le|la|du|au|des|de|en)\s*[,.]|[a-z]{2}[A-Z][a-z]|\benviron\s+(des|de|les)\b')
# les articles de communes connues pour ce métier : la phrase (avec le mot du métier) est rattachée à la commune de l'article
TOWNS = {
    'coutellerie': ['Thiers', 'Nogent (Haute-Marne)', 'Laguiole (Aveyron)'],
    'ganterie': ['Millau', 'Grenoble', 'Annonay', 'Saint-Junien', 'Chaumont (Haute-Marne)'],
    'vannerie': ['Villaines-les-Rochers', 'Fayl-Billot', 'Origny-en-Thiérache'],
    'chocolat': ['Noisiel', 'Blois'],
    'conserverie': ['Douarnenez', 'Concarneau', 'Quiberon'],
    'terreneuvas': ['Fécamp', 'Saint-Malo', 'Granville (Manche)', 'Bègles', 'Saint-Pierre (Saint-Pierre-et-Miquelon)'],
    'mer': ['Cancale', 'Marennes (Charente-Maritime)', 'Arcachon', 'Plouguerneau'],
    'teinture': ['Avignon', 'Albi', 'Lauragais'],
}
SKIP = re.compile(r'^\s*(\{\{|\[\[(Fichier|File|Image|Catégorie)|\||!|=|<|\*\s*\[\[(Fichier|Catégorie)|__)', re.I)


def sentences(par):
    """découpe un paragraphe de wikitexte en phrases (le texte des liens gardé pour la suite)"""
    par = re.sub(r'<ref[^>/]*/>', '', par)
    par = re.sub(r'<ref[^>]*>.*?</ref>', '', par, flags=re.S)
    out, cur, depth = [], '', 0
    i = 0
    while i < len(par):
        ch = par[i]
        cur += ch
        if par.startswith('[[', i) or par.startswith('{{', i):
            depth += 1; cur += par[i + 1]; i += 2; continue
        if par.startswith(']]', i) or par.startswith('}}', i):
            depth = max(0, depth - 1); cur += par[i + 1]; i += 2; continue
        if depth == 0 and ch in '.!?' and (i + 1 == len(par) or par[i + 1] == ' ') and not re.search(r'\b(av|apr|J\.-C|St|Mme|M|Dr|etc|env|cf|p|vol|n°|s)\.$', cur.strip()):
            out.append(cur.strip()); cur = ''
        i += 1
    if cur.strip():
        out.append(cur.strip())
    return out


def main():
    rows, ctx, arts = [], {}, {}
    for k, (titles, kw) in THEMES.items():
        kre = re.compile(kw, re.I)
        cand = []
        towns = set(TOWNS.get(k, []))
        for t in titles + TOWNS.get(k, []):
            try:
                w = wm.wp_raw(t)
            except Exception as e:  # noqa
                print(f'  {t} : {e}'); continue
            m = re.match(r'#(redirect|redirection)\s*\[\[([^\]]+)\]\]', w.strip(), re.I)
            if m:
                t = m.group(2).split('#')[0]; w = wm.wp_raw(t)
            arts[t] = wm.wp_url(t)
            pars = [p for p in w.split('\n') if p.strip() and not SKIP.match(p)]
            for j, p in enumerate(pars):
                for s in sentences(p.lstrip('*: ')):
                    plain = wm.plain(s)
                    if plain[:1] in '-–•' or not (40 <= len(plain) <= 360) or plain.count('|') or plain.count('{') or BROKEN.search(plain):
                        continue  # trop court, trop long, ou un modèle perdu (« depuis le , ») : on ne cite pas une phrase abîmée
                    ys = [int(y) for y in re.findall(r'\b(1[0-9]{3}|20[0-9]{2})\b', plain)]
                    if ys and (min(ys) >= 1960 or max(ys) >= 1990):
                        continue  # une phrase d'aujourd'hui (chiffre d'affaires, label…) : hors sujet pour des ancêtres
                    if j < 2 and not ctx.get(k) and t not in towns and kre.search(plain):
                        ctx.setdefault(k, []).append({'q': plain, 'title': t, 'url': wm.wp_url(t)})
                    if kre.search(plain):
                        cand.append((t, plain, wm.links(s) + ([t] if t in towns else [])))
        places = wm.wd_of_titles([l for _, _, ls in cand for l in ls])
        seen = set()
        for t, plain, ls in cand:
            low = plain.lower()
            hits = [m.start() for m in kre.finditer(plain)]
            for l in ls:
                p = places.get(l)
                if not p or not p['insee'] or p['lat'] is None or (p['insee'], plain) in seen:
                    continue
                nm = re.sub(r'\s*\(.*\)$', '', l).lower()
                at = low.find(nm)
                if l == t and t in towns:
                    if sum(1 for r in rows if r[0] == k and r[1] == t) >= 3:
                        continue  # trois phrases au plus par commune
                elif at < 0 or not any(abs(at - h) <= 80 for h in hits):
                    continue  # la commune doit être nommée près du mot du métier (« Lyon, Paris ou Bordeaux » : non)
                seen.add((p['insee'], plain))
                y = re.search(r'\b(1[0-9]{3})\b', plain)
                rows.append([k, l, p['insee'], p['lat'], p['lon'], int(y.group(1)) if y else None, plain, t, p['q']])
        print(f'  {k} : {sum(1 for r in rows if r[0] == k)} phrases avec une commune, {len(ctx.get(k, []))} d’introduction')
    meta = {'source': 'Wikipédia (en français)', 'licence': 'CC BY-SA 4.0 — les contributeurs de Wikipédia', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'url': 'https://fr.wikipedia.org/wiki/Coutellerie', 'built': wm.today(),
            'what': 'Phrases de Wikipédia qui nomment une commune : coutellerie, ganterie, vannerie, chocolat et biscuits, conserveries, terre-neuvas, la mer nourricière, plantes à teinture (lieux : Wikidata, CC0)',
            'articles': arts, 'ctx': ctx, 'fields': ['k', 'commune', 'insee', 'lat', 'lon', 'y', 'quote', 'title', 'q'], 'rows': rows}
    size = wm.write_gz(OUT, 'th-textes.json.gz', meta)
    print(f'th-textes : {len(rows)} phrases, {size} octets')


if __name__ == '__main__':
    main()
