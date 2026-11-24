#!/usr/bin/env python3
"""🕰️ La vraie heure de l'acte — extrait compact de la base des fuseaux horaires IANA (tzdata, domaine public).

Télécharge les sources de la version TAG (github.com/eggert/tz), garde seulement les fuseaux des pays utilisés,
ajoute deux fuseaux « historiques » écrits à partir des règles et des commentaires de tzdata :
  - Europe/Paris~libre : la zone libre 1940–1942 (règles « France » de tzdata, que le fichier europe dit suivies
    « dans beaucoup de lieux français » ; Paris et la zone occupée étaient à l'heure allemande « C-Eur ») ;
  - Europe/Paris~alsace : l'Alsace-Moselle allemande de 1871 à 1918 (règles de Europe/Berlin), française ensuite ;
compile avec zic (-b fat), lit les fichiers TZif produits et écrit assets/data/tz-europe-amerique.json :
  zones[nom] = [[minute UTC du changement, décalage en secondes, été ? 1 : 0, abréviation], …] (le premier : avant tout changement).
Le temps moyen local (LMT) n'est pas gardé tel quel : l'app le recalcule avec la longitude de la commune.

Usage : python3 -I scripts/ciel-heure/build-tz.py [dossier-de-travail]
"""
import json, os, re, struct, subprocess, sys, tempfile, urllib.request, hashlib

TAG = '2026f'
BASE = f'https://raw.githubusercontent.com/eggert/tz/{TAG}/'
ZONES = ['Europe/Paris', 'Europe/Brussels', 'Europe/Luxembourg', 'Europe/Zurich', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid',
         'Europe/London', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Toronto']
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'data', 'tz-europe-amerique.json')


def fetch(work, name):
    p = os.path.join(work, name)
    if not os.path.exists(p):
        with urllib.request.urlopen(BASE + name) as r, open(p, 'wb') as f:
            f.write(r.read())
    return open(p, encoding='utf-8').read()


def blocks(text):
    """les zones (nom → lignes) et les règles (nom → lignes) d'un fichier source"""
    zones, rules, cur = {}, {}, None
    for line in text.splitlines():
        s = line.split('#', 1)[0].rstrip()
        if not s.strip():
            continue
        if s.startswith('Zone'):
            cur = s.split()[1]; zones[cur] = [s]
        elif s.startswith('Rule'):
            cur = None; rules.setdefault(s.split()[1], []).append(s)
        elif s.startswith('Link'):
            cur = None
        elif cur and s[0] in ' \t':
            zones[cur].append(s)
    return zones, rules


def tzif(path):
    """les changements (secondes UTC, décalage, été, abréviation) d'un fichier TZif version 2+"""
    b = open(path, 'rb').read()
    def head(o):
        return struct.unpack('>4sc15x6l', b[o:o + 44])
    _, v, isut, isstd, leap, timec, typec, charc = head(0)
    o = 44 + timec * 5 + typec * 6 + charc + leap * 8 + isstd + isut
    _, v, isut, isstd, leap, timec, typec, charc = head(o); o += 44
    times = struct.unpack(f'>{timec}q', b[o:o + timec * 8]); o += timec * 8
    idx = b[o:o + timec]; o += timec
    types = [struct.unpack('>lBB', b[o + 6 * k:o + 6 * k + 6]) for k in range(typec)]; o += typec * 6
    chars = b[o:o + charc]
    ab = lambda i: chars[i:chars.index(b'\0', i)].decode()
    first = types[0]
    out = [[None, first[0], first[1], ab(first[2])]]
    for t, i in zip(times, idx):
        off, dst, a = types[i]
        out.append([t, off, dst, ab(a)])
    return out


def main():
    work = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='tz-')
    os.makedirs(work, exist_ok=True)
    texts = {n: fetch(work, n) for n in ['europe', 'northamerica', 'backzone', 'LICENSE']}
    zones, rules = {}, {}
    for n in ['europe', 'northamerica', 'backzone']:
        z, r = blocks(texts[n])
        for k, v in z.items():
            zones.setdefault(k, v)  # europe/northamerica d'abord ; backzone seulement pour Luxembourg
        for k, v in r.items():
            rules.setdefault(k, v)
    zones['Europe/Luxembourg'] = blocks(texts['backzone'])[0]['Europe/Luxembourg']
    paris = zones['Europe/Paris']
    assert '1940 Jun 14 23:00' in paris[2] and paris[3].strip().startswith('1:00\tC-Eur'), 'Europe/Paris a changé : revoir les fuseaux historiques'
    # la zone libre : les règles « France » de tzdata continuent (heure d'été d'hiver UTC+1, « Midsummer » UTC+2) jusqu'au
    # 2 novembre 1942 3:00, quand l'heure de la zone occupée (C-Eur) s'applique partout
    extra = {'Europe/Paris~libre': ['Zone\tEurope/Paris~libre\t0:09:21 -\tLMT\t1891 Mar 16', '\t\t\t0:09:21\t-\tPMT\t1911 Mar 11',
                                    '\t\t\t0:00\tFrance\tWE%sT\t1942 Nov  2  3:00'] + paris[3:],
             # l'Alsace-Moselle : heure allemande (Europe/Berlin) du traité de Francfort au retour à la France
             'Europe/Paris~alsace': ['Zone\tEurope/Paris~alsace\t0:31:00 -\tLMT\t1893 Apr', '\t\t\t1:00\tC-Eur\tCE%sT\t1918 Nov 11 11:00u'] + paris[2:]}
    src = []
    need = set()
    for z in ZONES:
        src += zones[z]
    for z in extra.values():
        src += z
    for line in src:
        f = line.split()
        if f[0] == 'Zone':
            f = f[2:]
        if len(f) > 1 and re.match(r'^[A-Za-z]', f[1]) and f[1] != '-':
            need.add(f[1])
    body = []
    for n in sorted(need):
        body += rules[n]
    zsrc = os.path.join(work, 'ciel-heure.zi')
    open(zsrc, 'w').write('\n'.join(body + src) + '\n')
    zout = os.path.join(work, 'zic')
    subprocess.run(['zic', '-b', 'fat', '-d', zout, zsrc], check=True)
    data = {}
    for z in ZONES + list(extra):
        rows = tzif(os.path.join(zout, z))
        keep = []
        for t, off, dst, a in rows:
            m = None if t is None else t // 60
            if m is not None and m < -6311390400 // 60:  # rien avant 1770
                continue
            if keep and keep[-1][1:] == [off, dst, a]:
                continue
            keep.append([m, off, dst, a])
        data[z] = keep
    sha = {n: hashlib.sha256(texts[n].encode()).hexdigest()[:16] for n in ['europe', 'northamerica', 'backzone']}
    doc = {'title': 'Fuseaux horaires historiques (extrait de tzdata)', 'version': TAG,
           'source': f'IANA Time Zone Database (tzdata) {TAG}, fichiers europe, northamerica et backzone — github.com/eggert/tz',
           'url': f'https://github.com/eggert/tz/tree/{TAG}', 'licence': 'Domaine public (fichier LICENSE de tzdata : « all files in the tz code and data … are in the public domain »)',
           'sha256_16': sha,
           'note': 'Chaque fuseau : [minute UTC du changement (null = avant tout changement), décalage en secondes, heure d’été 1/0, abréviation]. '
                   '« LMT » = temps moyen local : l’app le recalcule avec la longitude de la commune. '
                   'Europe/Paris~libre (zone libre 1940–1942) et Europe/Paris~alsace (Alsace-Moselle 1871–1918) sont écrits à partir des règles « France », « C-Eur » et des commentaires du fichier europe.',
           'zones': data}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    print(OUT, os.path.getsize(OUT), 'octets', {z: len(v) for z, v in data.items()})


if __name__ == '__main__':
    main()
