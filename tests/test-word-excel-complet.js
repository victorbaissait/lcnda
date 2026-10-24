'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📝 + 🧾 Le « Word » et l'« Excel » de l'app, commande par commande :   node tests/test-word-excel-complet.js
 *  A. Tableur (moteur, Node) : TOUTES les fonctions de la liste, en français et en anglais, avec la valeur attendue ;
 *     si LibreOffice est là, le même classeur exporté en .xlsx et en .ods est recalculé par LibreOffice et comparé ;
 *     XLSX et ODS : notes, validation, filtre, mise en forme conditionnelle, volets, noms, VRAI() / FAUX() (LibreOffice) ;
 *     si python3 + openpyxl sont là : un vrai classeur Excel est fabriqué puis lu.
 *  B. Traitement de texte (moteur, Node) : numéros des listes, RTF (accents, fusions, vraies listes, titres, en-tête,
 *     commentaire, note, titre du document), Markdown (en-tête YAML), Word (« List Bullet 2 », en-tête hérité, titres numérotés
 *     « sans numéro ») ; si python-docx / pandoc / LibreOffice sont là : de vrais fichiers sont fabriqués, lus, réécrits, relus.
 *  C. Navigateur (Playwright ; sinon sauté), base neuve : tableur (Maj + flèche dans une formule, noms gardés à l'import,
 *     ❓ Aide par-dessus l'éditeur) ; traitement de texte (puces / numéros sans paragraphe vide ni taille écrite en dur,
 *     caractères spéciaux, tri et en-tête de tableau deux fois de suite, personne posée au bon endroit, ❓ Aide, collages
 *     Word et Google Docs) ; aucune erreur dans la console.
 *  L'audit complet (≈ 300 commandes) : scripts du rapport (scratchpad) ; ici ce qui protège les corrections.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const S = require('../assets/js/app-tableur-engine.js');
const T = require('../assets/js/app-texte-formats.js');

const appRoot = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-word-excel-'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const has = (cmd, args = ['--version']) => { try { return spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000 }).status === 0; } catch (_) { return false; } };
const HAS_LO = !process.env.SANS_LIBREOFFICE && has('soffice'), HAS_PY = has('python3'), HAS_OPENPYXL = HAS_PY && spawnSync('python3', ['-I', '-c', 'import openpyxl'], { encoding: 'utf8' }).status === 0;
const HAS_PYDOCX = HAS_PY && spawnSync('python3', ['-I', '-c', 'import docx'], { encoding: 'utf8' }).status === 0, HAS_PANDOC = has('pandoc');
const LO = ['-env:UserInstallation=file://' + path.join(dir, 'lo-profil'), '--headless'];
const toAB = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const blobBuf = async b => Buffer.from(await b.arrayBuffer());
const show = v => (v instanceof S.SErr ? v.code : v instanceof S.SDate ? v.serial : v);
const close = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b);

/** LibreOffice (par UNO) ouvre un classeur, recalcule tout (calculateAll : il ne se fie pas aux valeurs gardées dans le fichier) et rend les cases de la 1re feuille */
const HAS_UNO = HAS_LO && HAS_PY && spawnSync('python3', ['-c', 'import uno'], { encoding: 'utf8' }).status === 0;
function loValues(file, port) {
    const py = path.join(dir, 'lo_calc.py'), out = file + '.json';
    fs.writeFileSync(py, `import sys, json, subprocess, time, os, uno
from com.sun.star.beans import PropertyValue
src, out, port, prof = os.path.abspath(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--nologo', '--norestore', '-env:UserInstallation=file://' + prof, '--accept=socket,host=127.0.0.1,port=' + port + ';urp;'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    local = uno.getComponentContext(); res = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local); ctx = None
    for i in range(120):
        try: ctx = res.resolve('uno:socket,host=127.0.0.1,port=' + port + ';urp;StarOffice.ComponentContext'); break
        except Exception: time.sleep(0.5)
    desk = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
    p = PropertyValue(); p.Name = 'Hidden'; p.Value = True
    doc = desk.loadComponentFromURL(uno.systemPathToFileUrl(src), '_blank', 0, (p,)); doc.calculateAll(); sh = doc.Sheets.getByIndex(0); d = {}
    for r in range(200):
        for c in range(14):
            cell = sh.getCellByPosition(c, r)
            if cell.getType().value == 'EMPTY': continue
            d[cell.AbsoluteName.split('.')[-1].replace('$', '')] = {'s': cell.getString(), 'n': cell.getValue(), 'err': cell.getError() if cell.getType().value == 'FORMULA' else 0}
    doc.close(True)
    try: desk.terminate()
    except Exception: pass
finally:
    proc.terminate(); proc.wait(timeout=30)
json.dump(d, open(out, 'w'))
`);
    const r = spawnSync('python3', [py, file, out, String(port), path.join(dir, 'lo-uno')], { encoding: 'utf8', timeout: 240000 });
    if (r.status) return null; return JSON.parse(fs.readFileSync(out, 'utf8'));
}

(async () => {
    /* ═════ A. Tableur : toutes les fonctions ═════ */
    const data = { A2: 10, A3: 20, A4: 30, A5: 'x', A7: 40, B2: 'laboureur', B3: 'tisserand', B4: 'laboureur', B5: 'meunier', B7: 'Laboureur', C2: 62, C3: 45, C4: 70, C5: 33, C6: 51, C7: 80, D2: 'Jean', D3: 'Marie', D4: 'Pierre', D5: 'Anne', D6: 'Louis', D7: 'Rose', G2: 1, G3: 5, G4: 10, G5: 20, H2: 'a', H3: 'b', H4: 'c', H5: 'd', G7: 1, H7: 5, I7: 10, J7: 20, G8: 'a', H8: 'b', I8: 'c', J8: 'd' };
    // [formule en français, attendu, la même en anglais (Excel), comparée à LibreOffice ?]
    const C = [
        ['=SOMME(A2:A7)', 100, '=SUM(A2:A7)'], ['=MOYENNE(A2:A7)', 25, '=AVERAGE(A2:A7)'], ['=MIN(C2:C7)', 33, '=MIN(C2:C7)'], ['=MAX(C2:C7)', 80, '=MAX(C2:C7)'], ['=NB(A2:A7)', 4, '=COUNT(A2:A7)'], ['=NBVAL(A2:A7)', 5, '=COUNTA(A2:A7)'], ['=NB.VIDE(A2:A7)', 1, '=COUNTBLANK(A2:A7)'],
        ['=PRODUIT(1;2;3;4)', 24, '=PRODUCT(1,2,3,4)'], ['=ARRONDI(2,345;2)', 2.35, '=ROUND(2.345,2)'], ['=ARRONDI(1234,5678;-2)', 1200, '=ROUND(1234.5678,-2)'], ['=ARRONDI.INF(-2,99;0)', -2, '=ROUNDDOWN(-2.99,0)'], ['=ARRONDI.SUP(-2,01;0)', -3, '=ROUNDUP(-2.01,0)'],
        ['=ENT(-2,5)', -3, '=INT(-2.5)'], ['=ABS(-4)', 4, '=ABS(-4)'], ['=MOD(-7;3)', 2, '=MOD(-7,3)'], ['=MOD(1;0)', '#DIV/0!', '=MOD(1,0)'], ['=PUISSANCE(2;10)', 1024, '=POWER(2,10)'], ['=RACINE(16)', 4, '=SQRT(16)'], ['=RACINE(-1)', '#NOMBRE!', '=SQRT(-1)'],
        ['=MEDIANE(C2:C7)', 56.5, '=MEDIAN(C2:C7)'], ['=ECARTYPE(1;2;3;4)', 1.2909944487358056, '=STDEV(1,2,3,4)'], ['=RANG(62;C2:C7)', 3, '=RANK(62,C2:C7)'], ['=RANG(62;C2:C7;1)', 4, '=RANK(62,C2:C7,1)'], ['=GRANDE.VALEUR(C2:C7;2)', 70, '=LARGE(C2:C7,2)'], ['=PETITE.VALEUR(C2:C7;2)', 45, '=SMALL(C2:C7,2)'],
        ['=SI(C2>60;"vieux";"jeune")', 'vieux', '=IF(C2>60,"vieux","jeune")'], ['=SI.CONDITIONS(C3>60;"a";C3>40;"b")', 'b', '=IFS(C3>60,"a",C3>40,"b")'], ['=SI.ERREUR(1/0;"x")', 'x', '=IFERROR(1/0,"x")'], ['=SI.NON.DISP(RECHERCHEV(3;G2:H5;2;FAUX);"absent")', 'absent', '=IFNA(VLOOKUP(3,G2:H5,2,FALSE),"absent")'],
        ['=ET(VRAI;1>0)', true, '=AND(TRUE,1>0)'], ['=OU(FAUX;1>2)', false, '=OR(FALSE,1>2)'], ['=NON(FAUX)', true, '=NOT(FALSE)'], ['=VRAI()', true, '=TRUE()'], ['=FAUX()', false, '=FALSE()'],
        ['=NB.SI(B2:B7;"laboureur")', 3, '=COUNTIF(B2:B7,"laboureur")'], ['=NB.SI(B2:B7;"lab*")', 3, '=COUNTIF(B2:B7,"lab*")'], ['=NB.SI(B2:B7;"<>laboureur")', 3, '=COUNTIF(B2:B7,"<>laboureur")'], ['=NB.SI.ENS(B2:B7;"laboureur";C2:C7;">65")', 2, '=COUNTIFS(B2:B7,"laboureur",C2:C7,">65")'],
        ['=SOMME.SI(B2:B7;"laboureur";C2:C7)', 212, '=SUMIF(B2:B7,"laboureur",C2:C7)'], ['=SOMME.SI.ENS(C2:C7;B2:B7;"laboureur";C2:C7;"<75")', 132, '=SUMIFS(C2:C7,B2:B7,"laboureur",C2:C7,"<75")'], ['=MOYENNE.SI(B2:B7;"laboureur";C2:C7)', 212 / 3, '=AVERAGEIF(B2:B7,"laboureur",C2:C7)'],
        ['=RECHERCHEV(7;G2:H5;2)', 'b', '=VLOOKUP(7,G2:H5,2)'], ['=RECHERCHEV(3;G2:H5;2;FAUX)', '#N/A', '=VLOOKUP(3,G2:H5,2,FALSE)'], ['=RECHERCHEH(7;G7:J8;2)', 'b', '=HLOOKUP(7,G7:J8,2)'], ['=RECHERCHEH(7;G7:J8;2;FAUX)', '#N/A', '=HLOOKUP(7,G7:J8,2,FALSE)'],
        ['=RECHERCHEX("Anne";D2:D7;C2:C7)', 33, '=XLOOKUP("Anne",D2:D7,C2:C7)', false], ['=INDEX(G2:H5;2;2)', 'b', '=INDEX(G2:H5,2,2)'], ['=EQUIV(12;G2:G5;1)', 3, '=MATCH(12,G2:G5,1)'], ['=EQUIV("ma*";D2:D7;0)', 2, '=MATCH("ma*",D2:D7,0)'], ['=CHOISIR(2;"a";"b";"c")', 'b', '=CHOOSE(2,"a","b","c")'],
        ['=CONCAT("a";"b";1)', 'ab1', '=CONCAT("a","b",1)'], ['=CONCATENER(D2;" ";D3)', 'Jean Marie', '=CONCATENATE(D2," ",D3)'], ['=JOINDRE.TEXTE(", ";VRAI;B2:B4)', 'laboureur, tisserand, laboureur', '=TEXTJOIN(", ",TRUE,B2:B4)'],
        ['=GAUCHE("Bonjour";3)', 'Bon', '=LEFT("Bonjour",3)'], ['=DROITE("Bonjour";4)', 'jour', '=RIGHT("Bonjour",4)'], ['=STXT("Bonjour";2;3)', 'onj', '=MID("Bonjour",2,3)'], ['=NBCAR("été")', 3, '=LEN("été")'], ['=MAJUSCULE("été")', 'ÉTÉ', '=UPPER("été")'], ['=MINUSCULE("ÉTÉ")', 'été', '=LOWER("ÉTÉ")'],
        ['=NOMPROPRE("jean-pierre de la tour")', 'Jean-Pierre De La Tour', '=PROPER("jean-pierre de la tour")'], ['=SUPPRESPACE("  a   b ")', 'a b', '=TRIM("  a   b ")'], ['=SUBSTITUE("a-b-c";"-";"+";2)', 'a-b+c', '=SUBSTITUTE("a-b-c","-","+",2)'], ['=CHERCHE("JOUR";"Bonjour")', 4, '=SEARCH("JOUR","Bonjour")'],
        ['=TEXTE(0,256;"0%")', '26%', null, false], ['=TEXTE(0,256;"0 %")', '26 %', null, false], ['=TEXTE(1234,5;"0,00")', '1234,50', null, false], ['=TEXTE(DATE(1925;5;7);"jjjj jj mmmm aaaa")', 'jeudi 07 mai 1925', null, false], ['=TEXTE(DATE(1925;5;7);"j mmm aa")', '7 mai 25', null, false],
        ['=CNUM("12,5")', 12.5, null, false],
        ['=DATE(1925;5;7)', 9259, '=DATE(1925,5,7)'], ['=DATE(2020;13;1)', 44197, '=DATE(2020,13,1)'], ['=DATE(2021;3;0)', 44255, '=DATE(2021,3,0)'], ['=ANNEE(DATE(1925;5;7))', 1925, '=YEAR(DATE(1925,5,7))'], ['=MOIS(DATE(1925;5;7))', 5, '=MONTH(DATE(1925,5,7))'], ['=JOUR(DATE(1925;5;7))', 7, '=DAY(DATE(1925,5,7))'],
        ['=JOURSEM(DATE(1925;5;7))', 5, '=WEEKDAY(DATE(1925,5,7))'], ['=JOURSEM(DATE(1925;5;10);2)', 7, '=WEEKDAY(DATE(1925,5,10),2)'], ['=JOURSEM(DATE(1925;5;10);3)', 6, '=WEEKDAY(DATE(1925,5,10),3)'],
        ['=DATEDIF(DATE(1900;1;15);DATE(1925;5;7);"A")', 25, '=DATEDIF(DATE(1900,1,15),DATE(1925,5,7),"Y")'], ['=DATEDIF(DATE(2020;1;31);DATE(2020;3;1);"M")', 1, '=DATEDIF(DATE(2020,1,31),DATE(2020,3,1),"M")'], ['=DATEDIF(DATE(1900;1;15);DATE(1925;5;7);"J")', 9243, '=DATEDIF(DATE(1900,1,15),DATE(1925,5,7),"D")'],
        ['=DATEDIF(DATE(2020;5;20);DATE(2021;8;3);"AM")', 2, '=DATEDIF(DATE(2020,5,20),DATE(2021,8,3),"YM")'], ['=DATEDIF(DATE(2020;5;20);DATE(2021;8;3);"MJ")', 14, '=DATEDIF(DATE(2020,5,20),DATE(2021,8,3),"MD")'],
        ['=AUJOURDHUI()-AUJOURDHUI()', 0, '=TODAY()-TODAY()'], ['=ENT(MAINTENANT())=AUJOURDHUI()', true, '=INT(NOW())=TODAY()'],
        ['=AGE("12 mars 1850";"3 janvier 1920")', 69, null, false], ['=AGE("12 mars 1850";"3 janvier 1920";"mois")', 837, null, false], ['=ANNEE.ACTE("baptisé le 3 frimaire an XII")', 1803, null, false], ['=DATE.PRECISION("vers 1784")', 'vers', null, false],
        ['=REPUBLICAIN(DATE(1793;9;22))', '1er vendémiaire an II', null, false], ['=SOSA.GENERATION(5)', 3, null, false], ['=SOSA.PERE(5)', 10, null, false], ['=SOSA.MERE(5)', 11, null, false], ['=SOSA.COTE(6)', 'maternel', null, false],
        ['=-2^2', 4, '=-2^2'], ['="a"&"b"&1', 'ab1', '="a"&"b"&1'], ['=10%', 0.1, '=10%'], ['="a"="A"', true, '="a"="A"'], ['=1+"2"', 3, '=1+"2"'],
    ];
    const wb = S.newWorkbook(), sh = wb.sheets[0];
    Object.entries(data).forEach(([k, v]) => { sh.cells[k] = { v }; });
    C.forEach(([f, , en], i) => { sh.cells['L' + (10 + i)] = { v: f }; if (en) sh.cells['M' + (10 + i)] = { v: en }; });
    const calc = new S.Calc(wb);
    const got = C.map((_, i) => show(calc.val(0, 9 + i, 11)));
    C.forEach(([f, exp, en], i) => {
        ok(close(got[i], exp), `${f} → ${JSON.stringify(got[i])} (attendu ${JSON.stringify(exp)})`);
        if (en) ok(close(show(calc.val(0, 9 + i, 12)), exp), `en anglais ${en} → ${JSON.stringify(show(calc.val(0, 9 + i, 12)))}`);
    });
    // chaque fonction de la liste est essayée au moins une fois
    const used = new Set(C.flatMap(([f]) => (f.match(/[A-Z][A-Z.]*(?=\()/g) || []).map(x => S.fnKey(x))));
    eq(Object.keys(S.FN).filter(k => !used.has(k) && !['UNIQUE', 'TRIER', 'FILTRE', 'DATE.ACTE'].includes(k)), [], 'toutes les fonctions de la liste sont essayées');
    { const w2 = S.normalize({ sheets: [{ cells: { A1: 'b', A2: 'a', A3: 'b', A4: 3, A5: 1, B1: '=UNIQUE(A1:A3)', C1: '=TRIER(A4:A5)', D1: '=FILTRE(A4:A5;A4:A5>2)', E1: '=DATE.ACTE("7 mai 1925")' } }] }); const c2 = new S.Calc(w2); eq([c2.val(0, 0, 1), c2.val(0, 1, 1), c2.val(0, 0, 2), c2.val(0, 1, 2), c2.val(0, 0, 3)], ['b', 'a', 1, 3, 3], 'UNIQUE, TRIER, FILTRE débordent'); ok(/1925/.test(c2.val(0, 0, 4)), 'DATE.ACTE'); }
    // formules exportées : DATEDIF « A » → « Y », VRAI() relu, noms gardés, noms LibreOffice COM.MICROSOFT
    eq(S.toEnglish('=DATEDIF(A1;B1;"AM")'), 'DATEDIF(A1,B1,"YM")', 'DATEDIF : unités d’Excel à l’export');
    eq(S.toFrench('VLOOKUP(3,G2:H5,2,FALSE())'), '=RECHERCHEV(3;G2:H5;2;FAUX())', 'FALSE() de LibreOffice compris');
    eq(S.toEnglish('=SOMME(Total)', { Total: 'Feuille!A1:A3' }), 'SUM(Total)', 'un nom du classeur part dans la formule Excel');
    ok(/COM\.MICROSOFT\.IFS/.test(S.odsFormula('=SI.CONDITIONS(A1>1;1;VRAI;2)')), 'ODS : SI.CONDITIONS en COM.MICROSOFT.IFS (comme LibreOffice)');
    eq(S.formulaMode('PRODUCT(1,2,3,4)'), 'en', 'formule anglaise reconnue (virgules)'); eq(S.formulaMode('ARRONDI(2,5)'), 'fr', 'virgule décimale française');

    // XLSX et ODS : ce qui doit faire l'aller-retour
    const xw = S.normalize({ sheets: [{ name: 'Relevé 1836', cells: { A1: { v: 'Nom', note: 'une note' }, A2: 'x', B2: 5, B3: 70, C1: '=SOMME(Tot)', D5: { v: null, note: 'seule' } }, cf: [{ range: 'B2:B3', op: '>', v: '60', style: { fill: '#ffd6d6', b: 1 } }, { range: 'A2:A3', op: 'contains', v: 'x' }, { range: 'B2:B3', op: 'scale' }], dv: [{ range: 'A2:A9', kind: 'list', list: ['a', 'b'] }, { range: 'B2:B9', kind: 'number', min: 0, max: 120 }], filter: { range: 'A1:B3' }, freeze: { r: 1, c: 1 } }], names: { Tot: "'Relevé 1836'!B2:B3" } });
    for (const k of ['Xlsx', 'Ods']) {
        const buf = await blobBuf(await S['to' + k](xw)); fs.writeFileSync(path.join(dir, 'extras.' + k.toLowerCase()), buf);
        const back = S.normalize(await S['from' + k](toAB(buf))), b0 = back.sheets[0], c0 = new S.Calc(back);
        eq([b0.cells.A1.note, b0.cells.D5?.note], ['une note', 'seule'], `${k} : notes`);
        eq(b0.dv.map(d => [d.range, d.kind, d.list || null, d.min ?? null, d.max ?? null]), [['A2:A9', 'list', ['a', 'b'], null, null], ['B2:B9', 'number', null, 0, 120]], `${k} : validation`);
        eq(b0.filter, { range: 'A1:B3' }, `${k} : filtre`); eq(b0.freeze, { r: 1, c: 1 }, `${k} : volets figés`);
        eq([b0.cells.C1.v, show(c0.val(0, 0, 2))], ['=SOMME(Tot)', 75], `${k} : nom gardé dans la formule`);
        if (k === 'Xlsx') eq(b0.cf.map(x => [x.range, x.op, x.style.fill || '']), [['B2:B3', '>', '#ffd6d6'], ['A2:A3', 'contains', ''], ['B2:B3', 'scale', '#638ec6']], 'Xlsx : mise en forme conditionnelle');
    }

    // LibreOffice recalcule les mêmes formules (xlsx et ods)
    if (HAS_UNO) {
        for (const k of ['Xlsx', 'Ods']) {
            const f = path.join(dir, 'fonctions.' + k.toLowerCase()); fs.writeFileSync(f, await blobBuf(await S['to' + k](wb, calc)));
            const port = await new Promise(res => { const s2 = net.createServer(); s2.listen(0, '127.0.0.1', () => { const p = s2.address().port; s2.close(() => res(p)); }); });
            const lo = loValues(f, port); ok(!!lo, `${k} : LibreOffice ouvre et recalcule le classeur`); if (!lo) continue;
            C.forEach(([fr, exp, , cmp], i) => { if (cmp === false) return; const e = lo['L' + (10 + i)]; if (!e) { ok(false, `${k} LibreOffice ${fr} : case vide`); return; }
                if (typeof exp === 'string' && exp.startsWith('#')) ok(e.err || /^#|Err:/.test(e.s), `${k} LibreOffice ${fr} → ${e.s} (une erreur)`);
                else if (typeof exp === 'number') ok(!e.err && Math.abs(e.n - exp) < 1e-9, `${k} LibreOffice ${fr} → ${e.s} (attendu ${exp})`);
                else if (typeof exp === 'boolean') ok(e.n === (exp ? 1 : 0), `${k} LibreOffice ${fr} → ${e.s}`);
                else ok(e.s === exp, `${k} LibreOffice ${fr} → ${e.s} (attendu ${exp})`); });
        }
    } else console.log('  – LibreOffice (UNO) absent : comparaison des formules sautée');
    if (HAS_OPENPYXL) {
        const f = path.join(dir, 'excel.xlsx');
        const r = spawnSync('python3', ['-I', '-c', `import sys
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.workbook.defined_name import DefinedName
wb=Workbook(); ws=wb.active; ws.title='Recensement 1836'
for r in [['Nom','Âge'],['MARTIN',62],['DURAND',45]]: ws.append(r)
ws['C2']='=SUM(B2:B3)'; ws['C3']='=SUM(Ages)'; ws['A2'].comment=Comment('Vu au registre','V'); ws.freeze_panes='A2'; ws.auto_filter.ref='A1:B3'
dv=DataValidation(type='list',formula1='"a,b"'); ws.add_data_validation(dv); dv.add('D2:D5')
wb.defined_names['Ages']=DefinedName('Ages',attr_text="'Recensement 1836'!$B$2:$B$3")
wb.save(sys.argv[1])`, f], { encoding: 'utf8' });
        ok(r.status === 0, 'openpyxl : classeur fabriqué ' + r.stderr);
        const xb = S.normalize(await S.fromXlsx(toAB(fs.readFileSync(f)))), s0 = xb.sheets[0], cx = new S.Calc(xb);
        eq([show(cx.val(0, 1, 2)), show(cx.val(0, 2, 2)), s0.cells.A2.note, s0.freeze, s0.filter, s0.dv[0]?.list], [107, 107, 'Vu au registre', { r: 1, c: 0 }, { range: 'A1:B3' }, ['a', 'b']], 'vrai classeur Excel (openpyxl) : formules, nom, note, volets, filtre, validation');
        const out = path.join(dir, 'reexport.xlsx'); fs.writeFileSync(out, await blobBuf(await S.toXlsx(xb)));
        const rr = spawnSync('python3', ['-I', '-c', `import openpyxl,sys;w=openpyxl.load_workbook(sys.argv[1]);s=w.worksheets[0];print(s['C3'].value,'|',s['A2'].comment.text,'|',s.freeze_panes,'|',s.auto_filter.ref,'|',len(s.data_validations.dataValidation))`, out], { encoding: 'utf8' });
        eq(rr.stdout.trim(), '=SUM(Ages) | Vu au registre | A2 | A1:B3 | 1', 'réexporté puis relu par openpyxl');
    } else console.log('  – openpyxl absent : vrai classeur Excel sauté');
    console.log(`✓ tableur : ${n} vérifications`);

    /* ═════ B. Traitement de texte ═════ */
    const n0 = n;
    const lists = T.newDoc(); lists.sections = [{ blocks: [{ t: 'p', st: 'normal', list: { k: 'ul', l: 0 }, runs: [T.run('un')] }, { t: 'p', st: 'normal', list: { k: 'ul', l: 1 }, runs: [T.run('deux')] }, { t: 'p', st: 'normal', list: { k: 'ol', l: 0 }, runs: [T.run('trois')] }, { t: 'p', st: 'normal', list: { k: 'ol', l: 0 }, runs: [T.run('quatre')] }] }];
    ok(/1\. trois/.test(T.toText(lists)) && /2\. quatre/.test(T.toText(lists)), 'texte : la liste numérotée commence à 1 après des puces');
    ok(/\n1\. trois/.test(T.toMarkdown(lists)), 'Markdown : idem');
    const rtf = T.toRtf(lists); ok(/\\pnlvlblt/.test(rtf) && /\\pnlvlbody/.test(rtf) && /\{\\pntext\\f0 1\.\\tab\}/.test(rtf), 'RTF : de vraies listes (\\pn), numérotée à partir de 1');
    eq(T.fromRtf(rtf).doc.sections[0].blocks.map(b => b.list && b.list.k + b.list.l), ['ul0', 'ul1', 'ol0', 'ol0'], 'RTF : listes relues avec leurs niveaux');
    { const d = T.newDoc(); d.sections = [{ blocks: [T.para([T.run('Le récit — ŒUVRE ☃')])] }]; const r = T.toRtf(d); ok(/r\\u233\\'e9cit/.test(r) && /\\u9731\\'3f/.test(r), 'RTF : accents avec leur copie Windows-1252 (lus par pandoc aussi)'); eq(T.plainOf(T.fromRtf(r).doc.sections[0].blocks[0].runs), 'Le récit — ŒUVRE ☃', 'RTF : accents relus'); }
    { const d = T.newDoc(), c = t => ({ blocks: [T.para([T.run(t)])] }); d.sections = [{ blocks: [{ t: 'table', head: 0, rows: [[{ ...c('A'), rs: 3 }, c('b1'), c('c1')], [c('b2'), { ...c('C'), rs: 2 }], [c('b3')], [{ ...c('Large'), cs: 3 }]] }] }];
        const r = T.toRtf(d); ok(/\\clvmgf/.test(r) && /\\clvmrg/.test(r), 'RTF : cases fusionnées en hauteur écrites');
        eq(T.fromRtf(r).doc.sections[0].blocks[0].rows.map(row => row.map(x => T.blockText(x.blocks[0]) + (x.rs ? ' rs' + x.rs : '') + (x.cs ? ' cs' + x.cs : ''))), [['A rs3', 'b1', 'c1'], ['b2', 'C rs2'], ['b3'], ['Large cs3']], 'RTF : fusions relues'); }
    { // un RTF comme ceux de LibreOffice et pandoc
        const src = String.raw`{\rtf1\ansi\uc1{\fonttbl{\f0 Arial;}}{\stylesheet{\s0 Normal;}{\s1\sbasedon0 heading 1;}{\s2 Quotations;}}{\info{\title Lettre}{\author Victor}}{\header \pard\plain Famille Martin page \chpgn\par}{\footer \pard Pied\par}\pard\plain\s1 Titre du doc\par\pard\plain\s0 Texte{\super\chftn}{\*\footnote\chftn\pard\plain Note pandoc.\par}\par{\listtext\pard\plain \'95\tab}\ilvl1\li720 Puce\par{\*\atnid V}{\*\atnauthor Victor}\chatn{\*\annotation{\*\atnref 0}\pard\plain A verifier}\pard\s2 Citation\par}`;
        const r = T.fromRtf(src), b = r.doc.sections[0].blocks;
        eq([r.doc.title, r.doc.meta.author], ['Lettre', 'Victor'], 'RTF : titre et auteur (\\info)');
        eq(b[0].st, 'h1', 'RTF : « heading 1 » de la feuille de styles devient un titre');
        ok(b[1].runs.some(x => x.note?.text === 'Note pandoc.') && T.plainOf(b[1].runs) === 'Texte', 'RTF : note {\\*\\footnote} de pandoc, sans couper le paragraphe');
        eq(b[2].list, { k: 'ul', l: 1 }, 'RTF : puce (\\listtext) au 2e niveau');
        eq(b[b.length - 1].st, 'quote', 'RTF : style « Quotations » de LibreOffice');
        ok(/Famille Martin page/.test(T.blockText(r.doc.header.blocks[0])) && r.doc.header.blocks[0].runs.some(x => x.field === 'page') && /Pied/.test(T.blockText(r.doc.footer.blocks[0])), 'RTF : en-tête (n° de page) et pied');
        eq(r.doc.comments.map(c => c.text), ['A verifier'], 'RTF : commentaire');
    }
    { const r = T.fromMarkdown('---\ntitle: Famille Martin\nauthor: Victor\n---\n\n# Le récit\n'); eq([r.doc.title, r.doc.meta.author, r.doc.sections[0].blocks[0].st, r.doc.sections[0].blocks.length], ['Famille Martin', 'Victor', 'h1', 1], 'Markdown : en-tête YAML (pandoc, Obsidian) lu, pas recopié'); }
    { // Word : « List Bullet 2 », numérotation « none » des titres, en-tête d'une section précédente
        const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
        const files = [
            { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
            { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>' },
            { name: 'word/header1.xml', data: `<?xml version="1.0"?><w:hdr ${NS}><w:p><w:r><w:t>En-tête hérité</w:t></w:r></w:p></w:hdr>` },
            { name: 'word/styles.xml', data: `<?xml version="1.0"?><w:styles ${NS}><w:style w:type="paragraph" w:styleId="ListBullet2"><w:name w:val="List Bullet 2"/><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>` },
            { name: 'word/numbering.xml', data: `<?xml version="1.0"?><w:numbering ${NS}><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="none"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>` },
            { name: 'word/document.xml', data: `<?xml version="1.0"?><w:document ${NS}><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Titre</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="ListBullet2"/></w:pPr><w:r><w:t>petit-fils</w:t></w:r></w:p><w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rH"/></w:sectPr></w:pPr></w:p><w:p><w:r><w:t>Section 2</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/></w:sectPr></w:body></w:document>` }];
        const r = await T.fromDocx(toAB(await blobBuf(await S.makeZip(files)))), all = r.doc.sections.flatMap(s => s.blocks);
        ok(all[0].st === 'h1' && !all[0].list, 'Word : titre numéroté « sans numéro » (LibreOffice) : pas une liste');
        eq(all.find(b => /petit-fils/.test(T.blockText(b))).list, { k: 'ul', l: 1 }, 'Word : « List Bullet 2 » = 2e niveau');
        eq(T.blockText(r.doc.header.blocks[0]), 'En-tête hérité', 'Word : la dernière section reprend l’en-tête de la précédente');
    }
    if (HAS_PYDOCX) {
        const f = path.join(dir, 'lettre.docx');
        const pr = spawnSync('python3', ['-I', '-c', `import sys
from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
d=Document(); d.core_properties.title='Lettre'; d.add_heading('Lettre aux cousins',1); p=d.add_paragraph('Jean '); r=p.add_run('MARTIN'); r.bold=True
d.add_paragraph('premier',style='List Bullet'); d.add_paragraph('petit-fils',style='List Bullet 2')
t=d.add_table(rows=2,cols=2); t.cell(0,0).text='Nom'; a=t.cell(1,0).merge(t.cell(1,1)); a.text='Fusion'
d.sections[0].header.paragraphs[0].text='En-tête Word'
s=d.add_section(WD_SECTION.NEW_PAGE); s.orientation=WD_ORIENT.LANDSCAPE; s.page_width,s.page_height=s.page_height,s.page_width; d.add_paragraph('Paysage')
d.save(sys.argv[1])`, f], { encoding: 'utf8' });
        ok(pr.status === 0, 'python-docx : document fabriqué ' + pr.stderr);
        const r = await T.readFile('lettre.docx', toAB(fs.readFileSync(f))), all = r.doc.sections.flatMap(s => s.blocks);
        ok(all[0].st === 'h1' && all.some(b => b.list?.l === 1) && all.some(b => b.t === 'table' && b.rows[1][0].cs === 2) && r.doc.sections[1]?.page?.orient === 'landscape' && /En-tête Word/.test(T.blockText(r.doc.header.blocks[0] || { t: 'p', runs: [] })), 'vrai .docx (python-docx) : titre, 2e niveau, fusion, paysage, en-tête');
        const out = path.join(dir, 'lettre-reexport.docx'); fs.writeFileSync(out, await blobBuf(await T.toDocx(r.doc)));
        const rr = spawnSync('python3', ['-I', '-c', 'import docx,sys;d=docx.Document(sys.argv[1]);print(d.paragraphs[0].style.name,"|",len(d.tables),"|",len(d.sections),"|",d.sections[0].header.paragraphs[0].text)', out], { encoding: 'utf8' });
        eq(rr.stdout.trim(), 'Heading 1 | 1 | 2 | En-tête Word', 'réexporté puis relu par python-docx');
    } else console.log('  – python-docx absent : vrai .docx sauté');
    if (HAS_LO) {
        const d = T.newDoc({ title: 'Riche' }); d.header = { blocks: [T.para([T.run('En-tête')])] };
        d.sections = [{ blocks: [T.para([T.run('Le récit')], { st: 'h1' }), T.para([T.run('une fois', { b: 1 }), { note: { id: 'n1', k: 'foot', text: 'Note.' } }]), ...lists.sections[0].blocks, { t: 'table', head: 1, rows: [[{ blocks: [T.para([T.run('Nom')])] }, { blocks: [T.para([T.run('Âge')])] }], [{ rs: 2, blocks: [T.para([T.run('MARTIN')])] }, { blocks: [T.para([T.run('62')])] }], [{ blocks: [T.para([T.run('63')])] }]] }] }, { page: { orient: 'landscape' }, blocks: [T.para([T.run('Paysage')])] }];
        const files = { docx: await blobBuf(await T.toDocx(d)), odt: await blobBuf(await T.toOdt(d)), rtf: Buffer.from(T.toRtf(d)) };
        for (const [k, b] of Object.entries(files)) {
            const f = path.join(dir, 'riche.' + k); fs.writeFileSync(f, b); const od = path.join(dir, 'lo-txt-' + k);
            spawnSync('soffice', [...LO, '--convert-to', 'txt:Text (encoded):UTF8', '--outdir', od, f], { encoding: 'utf8', timeout: 180000 });
            const t = fs.existsSync(path.join(od, 'riche.txt')) ? fs.readFileSync(path.join(od, 'riche.txt'), 'utf8') : '';
            ok(/Le récit/.test(t) && /une fois/.test(t) && /1\. trois/.test(t) && /MARTIN/.test(t) && /Paysage/.test(t), `${k} : ouvert par LibreOffice, texte complet et liste numérotée à 1 (${t.slice(0, 80).replace(/\s+/g, ' ')})`);
        }
    }
    if (HAS_PANDOC) {
        const f = path.join(dir, 'p.md'); fs.writeFileSync(f, '---\ntitle: Famille\n---\n\n# Le récit\n\nJean **MARTIN**[^1].\n\n- un\n    - deux\n\n[^1]: Registre.\n');
        spawnSync('pandoc', [f, '-o', path.join(dir, 'p.docx')]); spawnSync('pandoc', ['-s', f, '-o', path.join(dir, 'p.rtf')]);
        for (const k of ['docx', 'rtf']) { const r = await T.readFile('p.' + k, toAB(fs.readFileSync(path.join(dir, 'p.' + k)))), all = r.doc.sections.flatMap(s => s.blocks); ok(all.some(b => b.st === 'h1') && all.some(b => (b.runs || []).some(x => x.note?.text === 'Registre.')) && all.some(b => b.list?.l === 1), `pandoc → ${k} : titre, note, 2e niveau de liste`); }
    } else console.log('  – pandoc absent');
    console.log(`✓ traitement de texte (moteur) : ${n - n0} vérifications`);

    /* ═════ C. Navigateur ═════ */
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return finish(); }
    const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
    const phpPath = findPhp([devBundledPhp()]);
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Louise','Besse','female')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); } }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=1024M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await pw.chromium.launch();
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.openWorkbook && window.LCNDA_EXT?.openTextDoc && window.LCNDA_EXT.textDocKit?.Editor?.prototype?.toggleList && window.LCNDA_APP?.state?.csrf, null, { timeout: 60000 });
        const ev = (f, a) => page.evaluate(f, a);
        await ev(() => { window.__wait = ms => new Promise(r => setTimeout(r, ms)); window.__dlg = () => [...document.querySelectorAll('dialog[open]')].filter(d => !/wp-dlg|xl-dlg/.test(d.className)).pop() || null; });
        /* tableur */
        await ev(async () => { window.LCNDA_EXT.openWorkbook({ data: window.LCNDA_SHEET.normalize({ sheets: [{ name: 'Feuille 1', cells: { A1: 1, A2: 2, A3: 3 } }] }), name: 'Essai' }); for (let i = 0; i < 100 && !window.LCNDA_EXT.tableurInternals?.current?.dlg?.open; i++) await __wait(30); const e = window.LCNDA_EXT.tableurInternals.current; e.select(4, 0); e.focusGrid(); });
        await page.keyboard.type('=SOMME('); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Shift+ArrowUp'); await page.keyboard.press('Shift+ArrowUp'); await page.keyboard.press('Enter');
        eq(await ev(() => [window.LCNDA_EXT.tableurInternals.current.S().cells.A5.v, window.LCNDA_EXT.tableurInternals.current.calc.val(0, 4, 0)]), ['=SOMME(A2:A4)', 5], 'tableur : Maj + flèche agrandit la plage pointée dans une formule');
        const named = path.join(dir, 'noms.xlsx'); fs.writeFileSync(named, await blobBuf(await S.toXlsx(S.normalize({ sheets: [{ name: 'Feuille 1', cells: { A1: 4, A2: 6, B1: '=SOMME(Paire)' } }], names: { Paire: "'Feuille 1'!A1:A2" } }))));
        await ev(() => window.LCNDA_EXT.tableurInternals.current.run('import')); await page.setInputFiles('dialog.k-import input[type=file]', named); await page.waitForSelector('dialog.k-import [data-k-go]:not([disabled])'); await page.click('dialog.k-import [data-k-go]'); await page.waitForSelector('dialog.k-import', { state: 'detached' });
        eq(await ev(() => { const e = window.LCNDA_EXT.tableurInternals.current, i = e.wb.sheets.length - 1; return [e.wb.sheets[i].name, e.wb.sheets[i].cells.B1.v, e.calc.val(i, 0, 1)]; }), ['Feuille 1 (2)', "=SOMME(Paire)", 10], 'tableur : import dans un classeur — feuille renommée, nom du fichier gardé, formule juste');
        await ev(() => window.LCNDA_EXT.tableurInternals.current.run('help'));
        ok(/Aide/.test(await ev(async () => { for (let i = 0; i < 40 && !__dlg(); i++) await __wait(50); const d = __dlg(); const t = d?.textContent || ''; d?.close(); return t; })), 'tableur : ❓ Aide s’ouvre par-dessus l’éditeur');
        await ev(() => { const e = window.LCNDA_EXT.tableurInternals.current; e.dirty = false; e.dlg.close(); });
        /* traitement de texte */
        await ev(async () => {
            window.__W = () => window.LCNDA_EXT.textDocKit.current; window.__B = () => window.__W().secs[0].body; window.__H = () => window.__B().innerHTML;
            window.__open = async html => { (window.LCNDA_EXT.textDocKit.open || []).forEach(e => { e.dirty = false; e.dlg?.close(); }); window.LCNDA_EXT.openTextDoc({ data: { sections: [{ html }] }, name: 'Essai' }); for (let i = 0; i < 100 && !(window.__W()?.dlg?.open && !window.__W().closed); i++) await __wait(40); await __wait(150); };
            window.__pick = (word, collapse) => { const b = window.__B(), w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) { const i = x.data.indexOf(word); if (i >= 0) { const r = document.createRange(); r.setStart(x, i); r.setEnd(x, i + word.length); if (collapse) r.collapse(collapse === 'start'); b.focus(); getSelection().removeAllRanges(); getSelection().addRange(r); window.__W().lastRange = r.cloneRange(); return; } } };
        });
        eq(await ev(async () => { await __open('<p data-st="normal">Ligne une</p><p data-st="normal">Ligne deux</p>'); const o = []; __pick('une', 'start'); __W().run('ul'); await __wait(80); o.push(__H()); __pick('une', 'start'); __W().run('ul'); await __wait(80); o.push(__H()); __pick('deux', 'start'); __W().run('ol'); await __wait(80); __pick('deux', 'start'); __W().run('ul'); await __wait(80); o.push(__H()); return o; }),
            ['<ul><li data-st="normal">Ligne une</li></ul><p data-st="normal">Ligne deux</p>', '<p data-st="normal">Ligne une</p><p data-st="normal">Ligne deux</p>', '<p data-st="normal">Ligne une</p><ul><li data-st="normal">Ligne deux</li></ul>'],
            'texte : • et 1. sans paragraphe vide ni taille écrite en dur');
        ok(await ev(async () => { __pick('une', 'end'); __W().run('chars'); for (let i = 0; i < 40 && !__dlg(); i++) await __wait(50); const d = __dlg(), b = d.querySelector('[data-g]'), c = b.dataset.g; b.click(); await __wait(80); d.close(); return __B().textContent.includes('une' + c); }), 'texte : un caractère spécial s’écrit au curseur (sous sa fenêtre)');
        eq(await ev(async () => { await __open('<table class="wp-table"><thead><tr><th>Nom</th></tr></thead><tbody><tr><td>Zoé</td></tr><tr><td>Albert</td></tr></tbody></table><p data-st="normal">Fin</p>'); const td = __B().querySelector('tbody td'), r = document.createRange(); r.selectNodeContents(td); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); __W().lastRange = r.cloneRange();
            const col = () => [...__B().querySelectorAll('tbody td')].map(x => x.textContent).join(); __W().run('sortaz'); await __wait(60); const a = col(); __W().run('sortza'); await __wait(60); const b = col(); __W().run('headrow'); await __wait(60); const c = !!__B().querySelector('thead'); __W().run('headrow'); await __wait(60); return [a, b, c, !!__B().querySelector('thead th')]; }),
            ['Albert,Zoé', 'Zoé,Albert', false, true], 'texte : trier deux fois, en-tête retiré puis remis (le curseur reste dans le tableau)');
        await ev(async () => { await __open('<h1 data-st="h1">Le récit</h1><p data-st="normal">Fin du texte.</p>'); __pick('Fin', 'start'); __W().run('person'); });
        await page.waitForSelector('dialog.pk-dialog[open] .pk-input'); await page.keyboard.type('besse', { delay: 30 }); await page.waitForSelector('dialog.pk-dialog[open] .pk-item', { timeout: 15000 }); await page.waitForTimeout(200); await page.keyboard.press('Enter');
        await ev(async () => { for (let i = 0; i < 40; i++) { const it = [...document.querySelectorAll('.ui-actmenu-i')].find(b => /années/.test(b.textContent)); if (it) { it.click(); break; } await __wait(50); } }); await page.waitForTimeout(600);
        ok(await ev(() => /<h1 data-st="h1">Le récit<\/h1><p data-st="normal"><a class="wp-person" data-wp-person="1" data-part="life" href="#">Louise BESSE/.test(__H())), 'texte : la personne choisie va où était le curseur (pas en haut du document)');
        await ev(() => __W().run('help')); ok(/traitement de texte|document/i.test(await ev(async () => { for (let i = 0; i < 40 && !__dlg(); i++) await __wait(50); const d = __dlg(); const t = d?.textContent || ''; d?.close(); return t; })), 'texte : ❓ Aide (FAQ) par-dessus l’éditeur');
        const paste = html => ev(h => { __pick('Fin', 'end'); const dt = new DataTransfer(); dt.setData('text/html', h); __B().dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, html);
        await paste('<p class=MsoListParagraph style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp; </span></span>Élément Word</p><p class=MsoNormal><b>gras</b><o:p></o:p></p>'); await page.waitForTimeout(250);
        ok(await ev(() => /<li data-st="normal">Élément Word<\/li>/.test(__H()) && /<b>gras<\/b>/.test(__H()) && !/Mso|mso-|o:p/.test(__H())), 'collage Word : liste et gras, styles Mso retirés');
        await paste('<b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-weight:700;">Gras GDocs</span><span> normal</span></p><ul><li><p><span>puce GDocs</span></p></li></ul></b>'); await page.waitForTimeout(250);
        ok(await ev(() => /<b>Gras GDocs<\/b>/.test(__H()) && !/<b[^>]*>[^<]*<span[^>]*> normal/.test(__H()) && /<li[^>]*>(<p[^>]*>)?(<span[^>]*>)?puce GDocs/.test(__H())), 'collage Google Docs : gras gardé, le <b> qui enveloppe tout retiré, liste');
        await ev(() => { (window.LCNDA_EXT.textDocKit.open || []).forEach(e => { e.dirty = false; e.dlg?.close(); }); });
        eq(errors, [], 'aucune erreur dans la console');
    } finally { await browser.close(); proc.kill(); }
    finish();
})().catch(e => { console.error(e); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} process.exit(1); });
function finish() { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} console.log(`✓ test-word-excel-complet : ${n} vérifications`); }
