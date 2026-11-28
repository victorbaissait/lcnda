#!/usr/bin/env python3
"""🐄 Les animaux de son pays : races locales (vaches, chevaux, moutons, chèvres, porcs, volailles, chiens, ânes) → assets/data/tr-races.json.gz

Sources (téléchargées par ce script, réponses gardées dans TR_RAW) :
  - Wikidata (CC0 1.0) : les races (P31 = une sorte de race d'une de ces espèces), pays d'origine (P495, sinon P17), image (P18),
    article de Wikipédia en français ;
  - Wikipédia en français (CC BY-SA 4.0) : pour les races de France, le paramètre « origine » de l'infobox « Race » de l'article
    (ex. Salers : « [[Cantal (département)|Cantal]], {{FRA}} ») → les départements, par les éléments Wikidata des liens
    (P374 code INSEE, P2586 code de département, ou région → ses départements). Le texte de l'infobox est gardé tel quel (« o »).
  (l'auteur et la licence de chaque image sont lus en ligne par l'app quand l'image s'affiche : lib/terroir.php tr_credit)
Lancer : python3 build_races.py   (TR_RAW = dossier des réponses gardées ; TR_OUT = dossier de sortie, assets/data/ par défaut)
"""
import re
from tr_common import wm, qid, write, fold, DEP, DEP_BY_NAME, dep_of, communes, reg2dep, wikitexts, page_items, wpurl, infobox_param, links_of, plain, TODAY

SPECIES = {'bovin': 'Q12045585', 'cheval': 'Q1160573', 'mouton': 'Q15622363', 'chevre': 'Q15622387', 'porc': 'Q18786396', 'poule': 'Q15304943',
           'oie': 'Q59453852', 'canard': 'Q110536225', 'dindon': 'Q110529992', 'chien': 'Q39367', 'ane': 'Q61901018'}
# pays d'Europe (et voisins) gardés : ceux d'où viennent la plupart des familles des utilisateurs de l'app
COUNTRIES = {'Q142': 'FR', 'Q31': 'BE', 'Q39': 'CH', 'Q32': 'LU', 'Q38': 'IT', 'Q29': 'ES', 'Q45': 'PT', 'Q183': 'DE', 'Q40': 'AT', 'Q55': 'NL',
             'Q145': 'GB', 'Q27': 'IE', 'Q36': 'PL', 'Q213': 'CZ', 'Q214': 'SK', 'Q28': 'HU', 'Q218': 'RO', 'Q219': 'BG', 'Q41': 'GR', 'Q35': 'DK',
             'Q34': 'SE', 'Q20': 'NO', 'Q33': 'FI', 'Q215': 'SI', 'Q224': 'HR', 'Q403': 'RS', 'Q225': 'BA', 'Q222': 'AL', 'Q212': 'UA', 'Q159': 'RU',
             'Q211': 'LV', 'Q37': 'LT', 'Q191': 'EE', 'Q184': 'BY', 'Q217': 'MD', 'Q347': 'LI', 'Q235': 'MC', 'Q228': 'AD', 'Q233': 'MT', 'Q229': 'CY',
             'Q16': 'CA', 'Q30': 'US', 'Q262': 'DZ', 'Q1028': 'MA', 'Q948': 'TN', 'Q43': 'TR', 'Q189': 'IS', 'Q221': 'MK', 'Q236': 'ME'}


def main():
    types = {}
    for r in wm.sparql('SELECT ?t ?root WHERE { VALUES ?root { ' + ' '.join('wd:' + v for v in SPECIES.values()) + ' } ?t wdt:P279* ?root . }', 'races-types', gap=1):
        sp = next((k for k, v in SPECIES.items() if v == qid(r['root'])), None)
        if sp: types.setdefault(qid(r['t']), sp)
    q = ('SELECT ?b ?t ?c ?c17 ?img ?wp ?fr ?en ?d WHERE { VALUES ?t { ' + ' '.join('wd:' + t for t in sorted(types)) + ' } ?b wdt:P31 ?t . '
         'OPTIONAL { ?b wdt:P495 ?c } OPTIONAL { ?b wdt:P17 ?c17 } OPTIONAL { ?b wdt:P18 ?img } '
         'OPTIONAL { ?wp schema:about ?b ; schema:isPartOf <https://fr.wikipedia.org/> } '
         'OPTIONAL { ?b rdfs:label ?fr FILTER(lang(?fr)="fr") } OPTIONAL { ?b rdfs:label ?en FILTER(lang(?en)="en") } '
         'OPTIONAL { ?b schema:description ?d FILTER(lang(?d)="fr") } }')
    B = {}
    for r in wm.sparql(q, 'races-all', gap=1):
        b = qid(r['b'])
        o = B.setdefault(b, {'sp': set(), 'c': set(), 'img': '', 'wp': '', 'fr': '', 'en': '', 'd': ''})
        o['sp'].add(types[qid(r['t'])])
        for k in ('c', 'c17'):
            if r.get(k) and qid(r[k]) in COUNTRIES: o['c'].add(COUNTRIES[qid(r[k])])
        if r.get('img') and not o['img']: o['img'] = re.sub(r'^.*Special:FilePath/', '', r['img'])
        if r.get('wp') and not o['wp']: o['wp'] = r['wp'].rsplit('/wiki/', 1)[1]
        for k in ('fr', 'en', 'd'):
            if r.get(k) and not o[k]: o[k] = r[k]
    import urllib.parse
    for o in B.values():
        o['img'] = urllib.parse.unquote(o['img']); o['wp'] = urllib.parse.unquote(o['wp']).replace('_', ' ')
    B = {b: o for b, o in B.items() if (o['c'] or o['wp']) and (o['fr'] or o['en'])}
    print('races (pays connu ou article en français) :', len(B), flush=True)

    # 🇫🇷 les races de France (ou sans pays sur Wikidata) : l'origine dans l'infobox de Wikipédia
    fr = {b: o for b, o in B.items() if ('FR' in o['c'] or not o['c']) and o['wp']}
    T = wikitexts([o['wp'] for o in fr.values()], section0=True)
    origin = {}
    for b, o in fr.items():
        tx = T.get(o['wp'], ('', ''))[1]
        v = infobox_param(tx, 'origine') or infobox_param(tx, 'région') or infobox_param(tx, "région d'origine")
        if v: origin[b] = v
        if not o['c'] and v and re.search(r'\{\{\s*(FRA|France)\s*\}\}|\bFrance\b', v): o['c'].add('FR')  # pays lu dans l'infobox
    print('origine lue dans l’infobox :', len(origin), flush=True)
    targets = sorted({t for v in origin.values() for t, _ in links_of(v)})
    P2Q = page_items(targets)
    E = wm.entities(sorted(set(P2Q.values())), props='claims|labels', languages='fr')
    up = sorted({p for e in E.values() for p in wm.ids(e, 'P131')} - set(E))
    if up: E.update(wm.entities(up, props='claims|labels', languages='fr'))
    R2D = reg2dep(); C = communes()
    RL = {}  # nom replié d'une région (ou ancienne région) → son élément
    for r in wm.sparql('SELECT ?r ?l WHERE { VALUES ?r { ' + ' '.join('wd:' + q for q in sorted(R2D)) + ' } ?r rdfs:label ?l FILTER(lang(?l)="fr") }', 'races-regions', gap=1):
        RL.setdefault(fold(r['l']), qid(r['r']))

    def deps_of_item(q, depth=0):
        e = E.get(q) or {}
        ins = next((v for v in wm.claims(e, 'P374') if isinstance(v, str)), '')
        if ins and ins in C: return 'commune', [dep_of(ins)], ins
        code = next((v for v in wm.claims(e, 'P2586') if isinstance(v, str)), '')
        if code in DEP: return 'dep', [code], ''
        if q in R2D: return 'region', sorted(R2D[q]), ''
        if depth == 0 and wm.ids(e, 'P17') == ['Q142']:  # un lieu-dit, un pays, une vallée de France : son département
            for p in wm.ids(e, 'P131'):
                lvl, d, i = deps_of_item(p, 1)
                if d and lvl in ('commune', 'dep'): return 'dep', d, ''
        if depth == 0:
            lab = fold(wm.label(e, ('fr',)))
            if lab in RL: return 'region', sorted(R2D[RL[lab]]), ''
        return '', [], ''

    def point_of(q):
        co = next((x for x in wm.claims(E.get(q), 'P625') if isinstance(x, dict)), None)
        return (round(co['latitude'], 3), round(co['longitude'], 3)) if co else None

    B = {b: o for b, o in B.items() if o['c']}
    print('races gardées (pays connu) :', len(B), flush=True)
    out = []
    for b, o in B.items():
        row = {'q': b, 'n': o['fr'] or o['en'], 'sp': sorted(o['sp'])[0], 'c': sorted(o['c'])}
        if o['d']: row['d'] = o['d'][:140]
        if o['img']: row['img'] = o['img']
        if o['wp']: row['wp'] = o['wp']
        if b in origin:
            v = origin[b]; deps = set(); lvl = ''; ins = ''; pts = []
            for t, txt in links_of(v):
                q = P2Q.get(t) or P2Q.get(t[:1].upper() + t[1:])
                if not q or q == 'Q142' or fold(txt) in ('nord', 'sud', 'est', 'ouest', 'centre', 'france', 'sud ouest', 'nord ouest', 'sud est', 'nord est'): continue
                l, d, i = deps_of_item(q)
                if d:
                    deps |= set(d); lvl = lvl or l; ins = ins or i
                elif point_of(q): pts.append(point_of(q))
            if not deps and pts:  # une province, un massif, un pays (Poitou, Massif central…) : son centre, sans limites précises
                row['lat'], row['lon'] = pts[0]; lvl = 'province'
            if not deps:  # pas de lien utile : les noms de départements ou de régions écrits en clair
                cap = ' '.join(w for w in re.split(r'[\s,;()/]+', plain(v)) if w[:1].isupper())  # les noms propres seulement (« nord de la Bretagne » ≠ le Nord)
                for name, code in DEP_BY_NAME.items():
                    if re.search(r'\b' + re.escape(name) + r'\b', fold(cap)): deps.add(code); lvl = lvl or 'dep'
                if not deps:
                    for name, rq in RL.items():
                        if re.search(r'\b' + re.escape(name) + r'\b', fold(cap)): deps |= R2D[rq]; lvl = lvl or 'region'
            row['o'] = plain(v)[:120]
            if deps and len(deps) <= 20: row['deps'] = sorted(deps); row['lvl'] = lvl
            elif lvl == 'province': row['lvl'] = lvl
            if ins: row['insee'] = ins
        out.append(row)
    out.sort(key=lambda r: (r['sp'], fold(r['n'])))
    by = {}
    for r in out: by[r['sp']] = by.get(r['sp'], 0) + 1
    print('par espèce :', by, '· France avec départements :', sum(1 for r in out if r.get('deps')), '· avec un centre seulement :', sum(1 for r in out if r.get('lvl') == 'province'), flush=True)
    write('races', {'v': 1, 'built': TODAY,
                    'attr': 'Wikidata (races : P31, pays d’origine P495/P17, image P18) ; région d’origine des races de France : paramètre « origine » de l’infobox des articles de Wikipédia en français',
                    'licence': 'CC0 1.0 (Wikidata) ; CC BY-SA 4.0 (Wikipédia, texte « origine »)', 'url': 'https://www.wikidata.org/', 'rows': out})


if __name__ == '__main__':
    main()
