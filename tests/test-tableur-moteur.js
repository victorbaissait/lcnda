'use strict';
/**
 * 🧮 Le moteur commun des tableaux (assets/js/app-tableur-engine.js), sans navigateur :   node tests/test-tableur-moteur.js
 *  1. formules : français et anglais, $A$1, plages, autres feuilles, noms, recalcul par dépendances, boucles, erreurs expliquées ;
 *  2. dates des actes : « vers 1784 », « an II », « 3 frimaire an XII », dates impossibles, ≈ ;
 *  3. fonctions : la liste demandée, tableaux qui débordent (UNIQUE, TRIER, FILTRE) ;
 *  4. CSV : séparateur deviné, guillemets, Windows-1252, BOM, protection contre les formules glissées (= + - @) ;
 *  5. XLSX et ODS : aller-retour (valeurs, formules, feuilles, formats, gras, couleurs, largeurs, fusions, volets) ;
 *  6. fichiers piégés : bombe zip, XML avec DOCTYPE / ENTITY, trop de cellules, zip abîmé, faux .xls ;
 *  7. JSON, recopie (suites, formules), lignes insérées, 10 000 lignes en chaîne sans débordement de pile.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const S = require(path.join(__dirname, '..', 'assets', 'js', 'app-tableur-engine.js'));

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepStrictEqual(a, b, msg); n++; };
const book = cells => { const wb = S.newWorkbook(); Object.entries(cells).forEach(([k, v]) => { wb.sheets[0].cells[k] = {v: S.parseInput(v).v}; }); return wb; };
const val = (wb, ref, si = 0, calc) => { const c = calc || new S.Calc(wb, {now: () => new Date(2026, 9, 21, 10, 22)}); const p = S.parseAddr(ref); return c.val(si, p[0], p[1]); };
const flat = s => String(s).replace(/[\s  ]/g, ' ');

(async () => {
    /* 1. formules */
    {
        const wb = book({A1: 10, A2: '20', A3: '=A1+A2', A4: '=SOMME(A1:A3)', A5: '=SUM(A1,A2)', A6: '=$A$1*2', A7: '=A1^2-3*2', A8: '=-2^2', A9: '="a"&"b"&A1', A10: '=A1>5', A11: '=50%', A12: '=MOYENNE(A1:A2)*2', A13: '=ARRONDI(2,567;2)', A14: '=ARRONDI(2.567;1)'});
        const c = new S.Calc(wb);
        eq([30, 60, 30, 20, 94, 4, 'ab10', true, 0.5, 30, 2.57, 2.6], ['A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14'].map(r => val(wb, r, 0, c)), 'calculs de base (FR et EN, $, ^, &, %)');
        // autres feuilles, noms
        const w2 = book({A1: 5}); w2.sheets.push({...S.newSheet('Relevé 1836'), cells: {B2: {v: 7}, B3: {v: 8}}}); w2.sheets[0].cells.A2 = {v: "='Relevé 1836'!B2+'Relevé 1836'!B3"}; w2.names = {Total: "'Relevé 1836'!B2:B3"}; w2.sheets[0].cells.A3 = {v: '=SOMME(Total)'};
        eq([val(w2, 'A2'), val(w2, 'A3')], [15, 15], 'références à une autre feuille et noms');
        w2.sheets[0].cells.A4 = {v: '=Inconnue!A1'}; eq(val(w2, 'A4').code, '#REF!', 'feuille inconnue → #REF!');
        // recalcul par dépendances seulement
        const w3 = book({A1: 1, B1: '=A1*2', C1: '=B1+1', D1: 5, E1: '=D1+1'}), c3 = new S.Calc(w3);
        eq(val(w3, 'C1', 0, c3), 3);
        w3.sheets[0].cells.A1.v = 10; const changed = c3.setCellChanged(0, [[0, 0]]);
        eq([...changed].sort(), ['0:0:1', '0:0:2'], 'seules B1 et C1 sont recalculées');
        eq(val(w3, 'C1', 0, c3), 21);
        // boucles
        const w4 = book({A1: '=B1+1', B1: '=A1', C1: '=C1'}); const v4 = val(w4, 'A1'); eq(v4.code, '#BOUCLE!'); ok(/tourne en rond/.test(S.explain(v4)), 'boucle expliquée');
        eq(val(w4, 'C1').code, '#BOUCLE!', 'une formule qui se montre elle-même');
        // erreurs expliquées
        const w5 = book({A1: 'Martin', A2: '=A1+1', A3: '=10/B9', A4: '=SOMM(A1)', A5: '=RECHERCHEV("Durand";A1:A2;1;FAUX)', A6: '=SOMME(A1:A2', A7: '=AGE("31 février 1802";"1850")'});
        const ex = r => S.explain(val(w5, r));
        ok(/« Martin » n’est pas un nombre/.test(ex('A2')) && /A1/.test(ex('A2')), '#VALEUR! dit la cellule : ' + ex('A2'));
        ok(/B9 est vide ou vaut 0/.test(ex('A3')), '#DIV/0! nomme la cellule : ' + ex('A3'));
        ok(/Voulais-tu dire SOMME/.test(ex('A4')), '#NOM? propose SOMME');
        ok(/RECHERCHEV n’a pas trouvé « Durand »/.test(ex('A5')), '#N/A expliqué');
        ok(/parenthèse/.test(ex('A6')), 'syntaxe expliquée : ' + ex('A6'));
        ok(/date impossible/.test(ex('A7')), 'date impossible : ' + ex('A7'));
        // calcul sûr : pas d'eval, longueur et profondeur bornées
        const w6 = book({A1: '=' + '('.repeat(500) + '1' + ')'.repeat(500), A2: '=constructor', A3: '=__proto__(1)', A4: '=' + '1+'.repeat(5000) + '1'});
        eq(val(w6, 'A1').code, '#TROP!'); eq(val(w6, 'A2').code, '#NOM?'); eq(val(w6, 'A3').code, '#NOM?'); ok(['#TROP!'].includes(val(w6, 'A4').code), 'formule trop longue');
        const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'assets', 'js', 'app-tableur-engine.js'), 'utf8');
        ok(!/\beval\s*\(|new Function\s*\(|\bFunction\s*\(/.test(src), 'jamais eval ni Function dans le moteur');
    }
    /* 2. dates des actes */
    {
        const wb = book({A1: '=AGE("vers 1784";"an II")', A2: '=AGE("12 mars 1784";"3 frimaire an XII")', A3: '=ANNEE.ACTE("baptisé le 3 frimaire an XII")', A4: '=SOSA.GENERATION(12)', A5: '=ANNEE("vers 1784")', A6: '=DATE.ACTE("08/12/1960")', A7: '=DATE.PRECISION("entre 1880 et 1885")', A8: '=AGE("7 mai 1925";"6 mai 1950")', A9: '=MOIS("7 mai 1925")', A10: '=DATEDIF("1/1/2000";"1/1/2010";"A")', A11: '=REPUBLICAIN("24/11/1803")', A12: '=ANNEE(DATE(2026;10;21))', A13: '=AGE("1900";"1950";"mois")'});
        const c = new S.Calc(wb, {now: () => new Date(2026, 9, 21)});
        eq(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13'].map(r => val(wb, r, 0, c)), [10, 19, 1803, 4, 1784, '8 décembre 1960', 'entre', 24, 5, 10, '2 frimaire an XII', 2026, 600]);
        ok(c.isApprox(0, 0, 0) && c.isApprox(0, 4, 0) && !c.isApprox(0, 1, 0), '≈ pour une date approximative seulement');
        eq(flat(S.formatValue(val(wb, 'A1', 0, c), {}, {approx: true})), '≈ 10', 'affiché « ≈ 10 »');
        ok(S.readActDate('31 février 1802').error, 'date impossible refusée');
        eq(S.readActDate('3 frimaire an XII').y, 1803); eq(S.readActDate('an II').y, 1794); eq(S.readActDate('vers 1784').kind, 'vers');
        eq(S.republicanToGregorian(12, 3, 3), {y: 1803, m: 11, d: 25}, '3 frimaire an XII = 25 novembre 1803');
    }
    /* 3. fonctions */
    {
        const rows = [['Nom', 'Prénom', 'Âge', 'Métier'], ['MARTIN', 'Jean', 62, 'laboureur'], ['MARTIN', 'Marie', 58, 'fileuse'], ['DURAND', 'Pierre', 45, 'tisserand'], ['BERNARD', 'Louis', 71, 'laboureur'], ['MARTIN', 'Jean', 62, 'laboureur']];
        const wb = S.newWorkbook(); wb.sheets[0].cells = S.rowsToCells(rows);
        const F = {
            '=NB(C2:C6)': 5, '=NBVAL(A1:A6)': 6, '=NB.SI(D2:D6;"laboureur")': 3, '=NB.SI(C2:C6;">60")': 3, '=NB.SI.ENS(A2:A6;"MARTIN";C2:C6;">60")': 2,
            '=SOMME.SI(D2:D6;"laboureur";C2:C6)': 195, '=SOMME.SI.ENS(C2:C6;A2:A6;"MARTIN";D2:D6;"lab*")': 124, '=MOYENNE.SI(A2:A6;"MARTIN";C2:C6)': 182 / 3,
            '=SI.ERREUR(1/0;"rien")': 'rien', '=SIERREUR(1/0;"x")': 'x', '=ET(VRAI;C2>60)': true, '=OU(FAUX;C3>60)': false, '=NON(FAUX)': true,
            '=RECHERCHEV("DURAND";A2:D6;2;FAUX)': 'Pierre', '=RECHERCHEX("Louis";B2:B6;C2:C6)': 71, '=INDEX(A1:D6;3;2)': 'Marie', '=EQUIV("DURAND";A1:A6;0)': 4,
            '=CONCAT(A2;" ";B2)': 'MARTIN Jean', '=CONCATENER("a";"b")': 'ab', '=JOINDRE.TEXTE(", ";VRAI;B2:B4)': 'Jean, Marie, Pierre', '=GAUCHE("Martin";3)': 'Mar', '=DROITE("Martin";2)': 'in', '=STXT("Martin";2;3)': 'art',
            '=NBCAR("Été")': 3, '=MAJUSCULE("élise")': 'ÉLISE', '=MINUSCULE("ÉLISE")': 'élise', '=NOMPROPRE("jean-pierre de la fontaine")': 'Jean-Pierre De La Fontaine', '=SUPPRESPACE("  a   b ")': 'a b', '=SUBSTITUE("a-b-c";"-";"/")': 'a/b/c',
            '=TEXTE(1234,5;"0,00")': '1234,50', '=TEXTE(0,35;"0 %")': '35 %', '=CNUM("12,5")': 12.5, '=ANNEE(DATE(1925;5;7))': 1925, '=MOIS("7 mai 1925")': 5, '=JOUR("7 mai 1925")': 7,
            '=ARRONDI.INF(2,9;0)': 2, '=ARRONDI.SUP(2,1;0)': 3, '=ENT(-2,5)': -3, '=ABS(-4)': 4, '=MOD(10;3)': 1, '=PUISSANCE(2;10)': 1024, '=RACINE(81)': 9, '=MEDIANE(C2:C6)': 62,
            '=ARRONDI(ECARTYPE(2;4;4;4;5;5;7;9);4)': 2.1381, '=RANG(71;C2:C6)': 1, '=GRANDE.VALEUR(C2:C6;2)': 62, '=PETITE.VALEUR(C2:C6;1)': 45, '=MIN(C2:C6)': 45, '=MAX(C2:C6)': 71,
            '=SOSA.PERE(6)': 12, '=SOSA.MERE(6)': 13, '=SOSA.COTE(5)': 'paternel', '=SOSA.COTE(6)': 'maternel', '=SUM(C2:C3)': 120, '=VLOOKUP("DURAND",A2:D6,3,FALSE)': 45,
        };
        let row = 10; const at = {};
        Object.keys(F).forEach(f => { const k = 'F' + row++; at[f] = k; wb.sheets[0].cells[k] = {v: f}; });
        const c = new S.Calc(wb);
        Object.entries(F).forEach(([f, want]) => { const got = val(wb, at[f], 0, c); if (typeof want === 'number') ok(typeof got === 'number' && Math.abs(got - want) < 1e-9, `${f} → ${want} (reçu ${S.isErr(got) ? got.code + ' ' + S.explain(got) : got})`); else eq(got, want, f); });
        const fns = ['SOMME', 'MOYENNE', 'MIN', 'MAX', 'NB', 'NBVAL', 'NB.SI', 'NB.SI.ENS', 'SOMME.SI', 'SOMME.SI.ENS', 'MOYENNE.SI', 'SI', 'SI.ERREUR', 'ET', 'OU', 'NON', 'RECHERCHEV', 'RECHERCHEX', 'INDEX', 'EQUIV', 'CONCAT', 'CONCATENER', 'JOINDRE.TEXTE', 'GAUCHE', 'DROITE', 'STXT', 'NBCAR', 'MAJUSCULE', 'MINUSCULE', 'NOMPROPRE', 'SUPPRESPACE', 'SUBSTITUE', 'TEXTE', 'CNUM', 'DATE', 'ANNEE', 'MOIS', 'JOUR', 'DATEDIF', 'AUJOURDHUI', 'MAINTENANT', 'ARRONDI', 'ARRONDI.INF', 'ARRONDI.SUP', 'ENT', 'ABS', 'MOD', 'PUISSANCE', 'RACINE', 'MEDIANE', 'ECARTYPE', 'RANG', 'GRANDE.VALEUR', 'PETITE.VALEUR', 'UNIQUE', 'TRIER', 'FILTRE', 'AGE', 'ANNEE.ACTE', 'SOSA.GENERATION'];
        eq(fns.filter(f => !S.FN[f]), [], 'toutes les fonctions demandées existent');
        ok(fns.filter(f => S.FN[f].en).every(f => S.fnKey(S.FN[f].en) === f), 'chaque nom anglais mène au nom français');
        // débordements
        const w2 = S.newWorkbook(); w2.sheets[0].cells = S.rowsToCells(rows);
        Object.assign(w2.sheets[0].cells, {H1: {v: '=UNIQUE(A2:A6)'}, I1: {v: '=TRIER(C2:C6;1;-1)'}, J1: {v: '=FILTRE(B2:B6;C2:C6>60)'}, K1: {v: '=NB(I1:I5)'}});
        const c2 = new S.Calc(w2);
        eq(['H1', 'H2', 'H3', 'H4'].map(r => val(w2, r, 0, c2)), ['MARTIN', 'DURAND', 'BERNARD', null], 'UNIQUE déborde vers le bas');
        eq(['I1', 'I2', 'I5'].map(r => val(w2, r, 0, c2)), [71, 62, 45], 'TRIER décroissant');
        eq(['J1', 'J2', 'J3'].map(r => val(w2, r, 0, c2)), ['Jean', 'Louis', 'Jean'], 'FILTRE');
        eq(val(w2, 'K1', 0, c2), 5, 'une formule lit les cases d’un débordement');
        w2.sheets[0].cells.H3 = {v: 'bloque'}; c2.setCellChanged(0, [[2, 7]]); eq(val(w2, 'H1', 0, c2).code, '#DEBORD!', 'une case pleine bloque le débordement');
        // AUJOURDHUI / MAINTENANT
        const w3 = book({A1: '=AUJOURDHUI()', A2: '=ANNEE(AUJOURDHUI())', A3: '=AGE("21/10/1926")'}), c3 = new S.Calc(w3, {now: () => new Date(2026, 9, 21, 10, 22)});
        eq(S.formatValue(val(w3, 'A1', 0, c3)), '21/10/2026'); eq(val(w3, 'A2', 0, c3), 2026); eq(val(w3, 'A3', 0, c3), 100);
    }
    /* 4. CSV */
    {
        const csv = 'Nom;Prénom;Âge\r\nMARTIN;"Jean ""le grand""";62\r\n"DURAND";"Marie\nAnne";58,5\r\n';
        eq(S.sniffSep(csv), ';'); eq(S.parseCSV(csv), [['Nom', 'Prénom', 'Âge'], ['MARTIN', 'Jean "le grand"', '62'], ['DURAND', 'Marie\nAnne', '58,5']]);
        eq(S.sniffSep('a,b,c\n1,2,3\n'), ','); eq(S.sniffSep('a\tb;c\n1\t2;3\n'), '\t');
        // Windows-1252 (vieil Excel) et BOM
        const w1252 = Uint8Array.from([0x4e, 0x6f, 0x6d, 0x3b, 0xc2, 0x67, 0x65, 0x0d, 0x0a, 0x46, 0x69, 0x6c, 0x65, 0x75, 0x73, 0x65, 0x3b, 0x53, 0x61, 0x69, 0x6e, 0x74, 0x2d, 0xc9, 0x74, 0x69, 0x65, 0x6e, 0x6e, 0x65]);
        const d = S.decodeBytes(w1252); eq(d.encoding, 'windows-1252'); ok(d.text.includes('Âge') && d.text.includes('Saint-Étienne'), 'accents d’un vieux CSV Excel');
        const bom = new TextEncoder().encode('﻿Nom;Âge\n'); eq(S.decodeBytes(bom).text, 'Nom;Âge\n'); eq(S.decodeBytes(bom).bom, true);
        // export protégé : = + - @ deviennent du texte, les vrais nombres restent
        const out = S.toCSV([['=HYPERLINK("http://x")', "+cmd|' /C calc'!A0", '-12,5', '@SUM(A1)', 'texte;avec', 'ligne\nretour', 3.5, -2]]);
        ok(out.startsWith('﻿'), 'BOM UTF-8 pour Excel');
        eq(S.parseCSV(out.slice(1))[0], ["'=HYPERLINK(\"http://x\")", "'+cmd|' /C calc'!A0", '-12,5', "'@SUM(A1)", 'texte;avec', 'ligne\nretour', '3,5', '-2'], 'injection de formules empêchée');
        // tableau collé (TSV)
        eq(S.parseClipboard('a\tb\n1\t2\n').rows, [['a', 'b'], ['1', '2']]);
        // lecture d'un fichier CSV complet
        const r = await S.readFile('releve.csv', new TextEncoder().encode('Nom;Âge\nMARTIN;62\nDURAND;"1 234,5"\n').buffer);
        eq([r.kind, r.sep, r.wb.sheets[0].name, r.wb.sheets[0].cells.B2.v, r.wb.sheets[0].cells.B3.v], ['csv', ';', 'releve', 62, 1234.5]);
    }
    /* 5. XLSX et ODS : aller-retour */
    {
        const wb = S.newWorkbook(); const sh = wb.sheets[0]; sh.name = 'Relevé 1836';
        sh.cells = S.rowsToCells([['Nom', 'Âge', 'Né vers', 'Part'], ['MARTIN', 62, '=1836-B2', 0.35], ['DURAND', 45, '=1836-B3', 0.5], ['Total', '=SOMME(B2:B3)', '=AGE("vers 1784";"an II")', '=MOYENNE(D2:D3)']]);
        sh.cells.A1.s = S.styleId(wb, {b: 1, fill: '#fff1a8', color: '#c00000'}); sh.cells.D2.s = S.styleId(wb, {fmt: 'pct'}); sh.cells.B4.s = S.styleId(wb, {fmt: 'eur', b: 1, h: 'right', wrap: 1, bd: 'tblr'});
        sh.cells.A5 = {v: '07/05/1925'}; sh.cells.A6 = {v: "'=texte"}; sh.cells.A7 = {v: 'vers 1784'};
        sh.cols = {A: {w: 160}, C: {w: 60, hidden: true}}; sh.merges = ['A8:C8']; sh.cells.A8 = {v: 'fusion'}; sh.freeze = {r: 1, c: 1};
        wb.sheets.push({...S.newSheet('Budget'), cells: {A1: {v: 4.5}, A2: {v: "='Relevé 1836'!B4*2"}}});
        const calc = new S.Calc(wb);
        for (const [kind, write, read] of [['xlsx', S.toXlsx, S.fromXlsx], ['ods', S.toOds, S.fromOds]]) {
            const blob = await write(wb, calc), buf = await blob.arrayBuffer();
            ok(buf.byteLength > 500, `${kind} écrit`);
            const back = await read(buf), b0 = back.sheets[0], st = i => back.styles[i] || {};
            eq(back.sheets.map(s => s.name), ['Relevé 1836', 'Budget'], `${kind} : plusieurs feuilles`);
            eq([b0.cells.A2.v, b0.cells.B2.v, b0.cells.C2.v, b0.cells.B4.v], ['MARTIN', 62, '=1836-B2', '=SOMME(B2:B3)'], `${kind} : valeurs et formules traduites`);
            eq(back.sheets[1].cells.A2.v, "='Relevé 1836'!B4*2", `${kind} : formule vers une autre feuille`);
            ok(st(b0.cells.A1.s).b && st(b0.cells.A1.s).fill === '#fff1a8' && st(b0.cells.A1.s).color === '#c00000', `${kind} : gras et couleurs`);
            eq(st(b0.cells.D2.s).fmt, 'pct', `${kind} : pourcentage`); eq(st(b0.cells.B4.s).fmt, 'eur', `${kind} : monnaie`);
            eq(b0.cells.A5.v, '07/05/1925', `${kind} : date`); eq(b0.cells.A6.v, "'=texte", `${kind} : un texte qui commence par = reste du texte`);
            eq(b0.merges, ['A8:C8'], `${kind} : fusion`); ok(Math.abs(b0.cols.A.w - 160) <= 3, `${kind} : largeur (${b0.cols.A.w})`);
            ok(b0.cols.C?.hidden, `${kind} : colonne masquée`);
            const c2 = new S.Calc(back); eq(c2.val(1, 1, 0), 214, `${kind} : recalcul après lecture`);
            if (kind === 'xlsx') { eq(b0.freeze, {r: 1, c: 1}, 'xlsx : volets figés'); eq(st(b0.cells.B4.s).h, 'right'); ok(st(b0.cells.B4.s).wrap, 'xlsx : renvoi à la ligne'); eq(st(b0.cells.B4.s).bd, 'lrtb'); }
            // AGE n'existe pas en anglais : la valeur est gardée (Excel ne la calculerait pas)
            ok(b0.cells.C4.v === 10 || b0.cells.C4.v === '=AGE("vers 1784";"an II")', `${kind} : fonction de généalogie gardée en valeur`);
        }
        // un vrai fichier Excel : chaînes partagées, formules partagées, _xlfn
        const files = [
            {name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'},
            {name: 'xl/workbook.xml', data: '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Feuil1" sheetId="1" r:id="rId1"/></sheets></workbook>'},
            {name: 'xl/_rels/workbook.xml.rels', data: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'},
            {name: 'xl/sharedStrings.xml', data: '<sst><si><t>Prénom</t></si><si><r><t>Jean</t></r><r><t xml:space="preserve"> Louis</t></r></si></sst>'},
            {name: 'xl/worksheets/sheet1.xml', data: '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><f t="shared" ref="B2:B3" si="0">B1+1</f><v>2</v></c><c r="C2"><f>_xlfn.XLOOKUP(2,B1:B3,A1:A3)</f></c></row><row r="3"><c r="B3"><f t="shared" si="0"/><v>3</v></c></row></sheetData></worksheet>'},
        ];
        const xb = await (await S.makeZip(files)).arrayBuffer(), xw = await S.fromXlsx(xb);
        eq([xw.sheets[0].cells.A2.v, xw.sheets[0].cells.B3.v, xw.sheets[0].cells.C2.v], ['Jean Louis', '=B2+1', '=RECHERCHEX(2;B1:B3;A1:A3)'], 'xlsx d’Excel : chaînes, formules partagées, _xlfn');
    }
    /* 6. fichiers piégés */
    {
        const rej = async (p, rx, msg) => { let e = null; try { await p(); } catch (x) { e = x; } ok(e && rx.test(e.message), `${msg} (${e?.message})`); };
        // bombe zip : 200 Mo de zéros compressés
        const big = new Uint8Array(200 * 1024 * 1024);
        const bomb = await (await S.makeZip([{name: 'xl/workbook.xml', data: big}])).arrayBuffer();
        ok(bomb.byteLength < 2e6, 'la bombe est petite une fois compressée');
        await rej(() => S.fromXlsx(bomb), /trop gros|bombe/, 'bombe zip refusée');
        // une taille annoncée mensongère (petite) mais un contenu énorme
        const liar = new Uint8Array(bomb.slice(0)), dv = new DataView(liar.buffer); for (let i = liar.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x02014b50) { dv.setUint32(i + 24, 1000, true); break; }
        await rej(() => S.fromXlsx(liar.buffer), /bombe|trop gros/, 'taille annoncée mensongère refusée');
        // XML avec entités (milliard de rires) et entité externe
        const lol = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><workbook>&b;</workbook>';
        await rej(async () => S.fromXlsx(await (await S.makeZip([{name: 'xl/workbook.xml', data: lol}])).arrayBuffer()), /DOCTYPE|ENTITY/, 'XML avec ENTITY refusé');
        const xxe = '<?xml version="1.0"?><!DOCTYPE c [<!ENTITY x SYSTEM "file:///etc/passwd">]><office:document-content>&x;</office:document-content>';
        await rej(async () => S.fromOds(await (await S.makeZip([{name: 'content.xml', data: xxe}])).arrayBuffer()), /DOCTYPE|ENTITY/, 'entité externe refusée (ODS)');
        // trop de cellules répétées (ODS) : rien n'explose
        const rep = `<office:document-content xmlns:office="o" xmlns:table="t" xmlns:text="x"><office:body><office:spreadsheet><table:table table:name="A"><table:table-row table:number-rows-repeated="1048576"><table:table-cell table:number-columns-repeated="16384"/></table:table-row><table:table-row table:number-rows-repeated="5"><table:table-cell office:value-type="float" office:value="1" table:number-columns-repeated="400"/></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`;
        const t0 = Date.now(); let wbRep = null, eRep = null; try { wbRep = await S.fromOds(await (await S.makeZip([{name: 'content.xml', data: rep}])).arrayBuffer()); } catch (x) { eRep = x; }
        ok((wbRep && Object.keys(wbRep.sheets[0].cells).length <= 2000) || /trop/.test(eRep?.message || ''), 'cellules répétées bornées'); ok(Date.now() - t0 < 5000, 'et vite');
        await rej(() => S.unzip(new Uint8Array([1, 2, 3, 4]).buffer), /zip valide/, 'faux zip refusé');
        await rej(() => S.readFile('vieux.xls', Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0]).buffer), /\.xls/, 'ancien .xls expliqué');
        await rej(() => S.readFile('gros.csv', new ArrayBuffer(S.LIMITS.fileBytes + 1)), /trop gros/, 'fichier trop gros');
        // couleurs et noms piégés dans un classeur : nettoyés
        const evil = S.normalize({sheets: [{name: 'a]b*c', cells: {A1: {v: 1, s: 1}, ZZZZ9: {v: 2}, 'A1;x': {v: 3}}, cols: {A: {w: 1e9}}}], styles: [{}, {fill: 'red;background:url(http://evil)', color: 'expression(alert(1))', b: 1}]});
        eq(evil.styles[1], {b: 1}, 'couleurs piégées retirées'); eq(evil.sheets[0].name, 'a b c'); eq(Object.keys(evil.sheets[0].cells), ['A1']); eq(evil.sheets[0].cols.A.w, 1200);
    }
    /* 7. JSON, recopie, lignes insérées, grandes feuilles */
    {
        const j = S.fromJson([{nom: 'Martin', age: 62}, {nom: 'Durand', age: 45}]); eq([j.sheets[0].cells.A1.v, j.sheets[0].cells.B3.v], ['nom', 45]);
        const wb = book({A1: 1, A2: '=A1*2'}), out = S.toJsonData(wb); eq(out.sheets[0].rows, [[1], [2]]);
        eq(S.fromJson(JSON.stringify(S.compact(wb))).sheets[0].cells.A2.v, '=A1*2', 'le fichier de l’outil garde les formules');
        eq(S.fillSeries([1836, 1841], 3), [1846, 1851, 1856]); eq(S.fillSeries(['janvier'], 2), ['février', 'mars']); eq(S.fillSeries(['Feuille 1'], 2), ['Feuille 2', 'Feuille 3']); eq(S.fillSeries(['a', 'b'], 3), ['a', 'b', 'a']);
        eq(S.shiftFormula('=A1+$B$1+B$2+$C3+SOMME(D1:D4)', 2, 1), '=B3+$B$1+C$2+$C5+SOMME(E3:E6)');
        eq(S.shiftFormula('=A1', -1, 0), '=#REF!');
        eq(S.adjustFormula('=SOMME(A2:A5)+A7+A3', {own: 'F', target: 'F', axis: 'row', at: 2, n: 2}), '=SOMME(A2:A7)+A9+A5', 'deux lignes insérées avant la ligne 3');
        eq(S.adjustFormula('=A3+SOMME(A2:A5)', {own: 'F', target: 'F', axis: 'row', at: 2, n: -1}), '=#REF!+SOMME(A2:A4)', 'ligne 3 supprimée');
        eq(S.renameInFormula("='Relevé 1836'!A1+Budget!B2", 'Relevé 1836', 'Relevé'), '=Relevé!A1+Budget!B2');
        eq(S.toEnglish('=SI(A1>2,5;SOMME(A1:A3);"non")'), 'IF(A1>2.5,SUM(A1:A3),"non")'); eq(S.toFrench('IF(A1>2.5,SUM(A1:A3),"non")'), '=SI(A1>2,5;SOMME(A1:A3);"non")');
        eq(S.cycleAbs('=A1+B2', 2).f, '=$A$1+B2');
        eq(S.parseInput('0032').v, '0032'); eq(S.parseInput('12,40 €'), {v: 12.4, fmt: 'eur'}); eq(S.parseInput('35 %'), {v: 0.35, fmt: 'pct'}); eq(S.parseInput('1 234,5').v, 1234.5); eq(S.parseInput('VRAI').v, true);
        eq(flat(S.formatValue(1234.5, {fmt: 'num'})), '1 234,50'); eq(flat(S.formatValue(12.4, {fmt: 'eur'})), '12,40 €'); eq(flat(S.formatValue(0.35, {fmt: 'pct'})), '35 %');
        // 10 000 lignes en chaîne : pas de débordement de pile, recalcul rapide
        const big = S.newWorkbook(), cells = big.sheets[0].cells; cells.A1 = {v: 1};
        for (let r = 2; r <= 10000; r++) { cells['A' + r] = {v: `=A${r - 1}+1`}; for (let c = 1; c < 30; c++) cells[S.addr(r - 1, c)] = {v: r * c}; }
        let t = Date.now(); const cb = new S.Calc(big); eq(cb.val(0, 9999, 0), 10000); const t1 = Date.now() - t;
        t = Date.now(); cells.A1.v = 5; cb.setCellChanged(0, [[0, 0]]); eq(cb.val(0, 9999, 0), 10004); const t2 = Date.now() - t;
        ok(t1 < 4000 && t2 < 2000, `10 000 lignes : calcul ${t1} ms, recalcul ${t2} ms`);
        // 3 000 SOMME cumulées (le pire cas : chaque formule relit tout le haut de la colonne)
        const b2 = S.newWorkbook(); for (let r = 0; r < 3000; r++) { b2.sheets[0].cells[S.addr(r, 0)] = {v: r}; b2.sheets[0].cells[S.addr(r, 1)] = {v: `=SOMME(A$1:A${r + 1})`}; }
        t = Date.now(); const c2 = new S.Calc(b2); eq(c2.val(0, 2999, 1), 4498500); b2.sheets[0].cells.A1.v = 1; c2.setCellChanged(0, [[0, 0]]); eq(c2.val(0, 2999, 1), 4498501); ok(Date.now() - t < 6000, `3 000 SOMME cumulées : ${Date.now() - t} ms`);
    }
    console.log(`✓ ${n} vérifications du moteur du tableur`);
})().catch(e => { console.error(e); process.exit(1); });
