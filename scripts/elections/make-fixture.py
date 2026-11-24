#!/usr/bin/env python3
"""LCNDA — 🗳 petit pack d'élections FABRIQUÉ (chiffres inventés) pour les tests : rien n'est vrai.

    python3 scripts/elections/make-fixture.py DOSSIER

Écrit dans DOSSIER/zips des archives « leg1877_csv.zip », « leg1936_csv.zip », « pres1848_csv.zip », « pres1965_csv.zip »
au format supposé des fichiers de Cagé et Piketty (une ligne par commune, colonnes voix…), une liste de députés,
puis lance scripts/elections/build-elections.py dessus : DOSSIER/elections.sqlite (meta.fixture = 1).
"""
import csv
import io
import os
import subprocess
import sys
import zipfile

COMMUNES = [('19', 'Corrèze', '19272', 'Tulle', 9000), ('19', 'Corrèze', '19031', 'Brive-la-Gaillarde', 15000), ('32', 'Gers', '32160', 'Lectoure', 3000)]


def zcsv(path, name, header, rows):
    s = io.StringIO(); w = csv.writer(s); w.writerow(header); w.writerows(rows)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(name, s.getvalue())


def main(out):
    zd = os.path.join(out, 'zips'); os.makedirs(zd, exist_ok=True)
    head = ['dep', 'nomdep', 'codecommune', 'nomcommune', 'inscrits', 'votants', 'exprimes']
    # 1877 : républicains / conservateurs ; Tulle → 62 % républicains
    rows = []
    for dep, nd, code, nom, ins in COMMUNES:
        e = int(ins * 0.7); r = round(e * (0.62 if code == '19272' else 0.48))
        rows.append([dep, nd, code, nom, ins, int(ins * 0.72), e, r, e - r])
    zcsv(os.path.join(zd, 'leg1877_csv.zip'), 'leg1877comm.csv', head + ['voixREP', 'voixCONS'], rows)
    rows = []
    for dep, nd, code, nom, ins in COMMUNES:
        e = int(ins * 0.8); g = round(e * 0.55); c = round(e * 0.15)
        rows.append([dep, nd, code, nom, ins, int(ins * 0.82), e, g, c, e - g - c])
    zcsv(os.path.join(zd, 'leg1936_csv.zip'), 'leg1936comm.csv', head + ['voixG', 'voixC', 'voixD'], rows)
    rows = []
    for dep, nd, code, nom, ins in COMMUNES:
        e = int(ins * 0.75); b = round(e * 0.7); c = round(e * 0.2)
        rows.append([dep, nd, code, nom, ins, int(ins * 0.76), e, b, c, e - b - c])
    zcsv(os.path.join(zd, 'pres1848_csv.zip'), 'pres1848comm.csv', head + ['voixBONAPARTE', 'voixCAVAIGNAC', 'voixLEDRUROLLIN'], rows)
    rows = []
    for dep, nd, code, nom, ins in COMMUNES:
        e = int(ins * 0.8); a = round(e * 0.44); b = round(e * 0.32)
        rows.append([dep, nd, code, nom, ins, int(ins * 0.83), e, a, b, e - a - b])
    zcsv(os.path.join(zd, 'pres1965_csv.zip'), 'pres1965comm.csv', head + ['voixDEGAULLE', 'voixMITTERRAND', 'voixLECANUET'], rows)
    dp = os.path.join(out, 'deputes.csv')
    with open(dp, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f); w.writerow(['qid', 'nom', 'naissance', 'deces', 'sycomore', 'debut', 'fin', 'dep'])
        w.writerow(['Q999001', 'Jean Mazaud', '1830', '1900', '99001', '1877-10-14', '1881-10-27', '19'])
        w.writerow(['Q999002', 'Pierre Lafon', '1850', '1920', '99002', '1906-05-06', '1910-05-31', '32'])
    here = os.path.dirname(os.path.abspath(__file__))
    subprocess.run([sys.executable, '-I', os.path.join(here, 'build-elections.py'), '--dossier', out, '--source-dir', zd, '--deputes-csv', dp, '--fixture'], check=True)


if __name__ == '__main__':
    main(sys.argv[1])
