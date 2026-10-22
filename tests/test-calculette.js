'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧮 Calculette (fenêtre flottante appelable de partout) :   node tests/test-calculette.js
 *  1. moteur dans Node (app-calculette-engine.js, sans eval) : priorités, fractions exactes, complexes, trigonométrie
 *     (degrés, radians, grades), arithmétique, bases, statistiques, matrices, équations (degré ≤ 4, systèmes),
 *     dérivées et intégrales, mesures et monnaies anciennes, calendrier républicain, âge entre deux dates C4,
 *     erreurs expliquées en français, bornes (calculs trop gros), courbes compilées ;
 *  2. navigateur (Playwright ; sinon sauté), base neuve : bouton 🧮 et ⇧⌘Y (Ctrl+Maj+Y), clavier complet (Entrée,
 *     Échap, ↑ ↓, « ans » après un résultat), ruban cliquable, 📋 copier, mémoire M+ MR MC, erreur affichée, mode
 *     scientifique (rubriques, exemples, unités, dates), 📈 courbes (tracé, zoom, courbe fausse), ⚙️ réglages K2 et
 *     💾 Réglages enregistrés, au-dessus d'une fenêtre ouverte, 390 px en mode sombre, aucune erreur dans la console.
 *  Captures (si CALC_SHOTS=dossier).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

/* ═════════ 1. Le moteur, dans Node ═════════ */
global.window = {LCNDA_EXT: {}};
global.LCNDA_SHEET = require('../assets/js/app-tableur-engine.js');
require('../assets/js/heritage-calendar-more.js');
global.LCNDA_EXT = global.window.LCNDA_EXT;
delete global.window;
const C = require('../assets/js/app-calculette-engine.js');
const run = (s, o) => C.evaluate(s, o);
const val = (s, o) => { const r = run(s, o); assert.ok(r.ok, `« ${s} » : ${r.error}`); return r.text; };
const same = (list, o) => list.forEach(([s, want]) => eq(val(s, o), want, `« ${s} »`));
const bad = (s, re, o) => { const r = run(s, o); ok(!r.ok && re.test(r.error + ' ' + r.hint), `« ${s} » devrait dire ${re} — a dit : ${r.ok ? r.text : r.error + ' ' + r.hint}`); };

const src = fs.readFileSync(path.join(appRoot, 'assets/js/app-calculette-engine.js'), 'utf8') + fs.readFileSync(path.join(appRoot, 'assets/js/heritage-calculette.js'), 'utf8');
ok(!/\beval\s*\(|new\s+Function\b|\bFunction\s*\(/.test(src), 'jamais eval ni Function');

// priorités, parenthèses, puissances
same([['1+2*3', '7'], ['(1+2)*3', '9'], ['2^3^2', '512'], ['-2^2', '-4'], ['2^-1', '1/2'], ['10-4-3', '3'], ['100/10/2', '5'], ['2(3+4)', '14'], ['(1+2)(3+4)', '21'],
    ['2*3!', '12'], ['5!/3!', '20'], ['3²', '9'], ['√16', '4'], ['√(9/4)', '3/2'], ['2^10', '1024'], ['17 mod 5', '2'], ['-7 mod 3', '2'], ['1,5e3', '1500'], ['1 234,5 + 1', '1235,5'],
    ['12 × 3,5', '42'], ['7 ÷ 2', '7/2'], ['2π/π', '2'], ['|−5|', '5'], ['200 + 10 %', '220'], ['200 − 10 %', '180'], ['50 %', '0,5'], ['(-8)^(1/3)', '-2'], ['8^(2/3)', '4'], ['0^0', '1']]);
// fractions exactes, et décimal quand rien n'a été divisé
same([['1/3 + 1/6', '1/2'], ['2/4', '1/2'], ['1/3 - 1/2', '-1/6'], ['(2/3)^2', '4/9'], ['0,1 + 0,2', '0,3'], ['0,25 × 3', '0,75'], ['frac(0,875)', '7/8'], ['dec(1/8)', '0,125'], ['0,875 en fraction', '7/8']]);
eq(run('1/3').alt.includes('0,3333333333'), true, '1/3 : le décimal en 2e ligne');
eq(run('1/3').html.includes('cm-fr'), true, '1/3 : fraction posée');
// complexes
same([['(1+2i)(3-i)', '5 + 5i'], ['sqrt(-4)', '2i'], ['√(−9)', '3i'], ['i^2', '-1'], ['module(3+4i)', '5'], ['conj(3+4i)', '3 - 4i'], ['re(3+4i)', '3'], ['im(3+4i)', '4'], ['1/(1+i)', '0,5 - 0,5i'], ['e^(i*π)', '-1'], ['arg(1+i)', '45'], ['ln(-1)', '3,141592654i']]);
// trigonométrie : degrés (par défaut), radians, grades ; hyperboliques, log
same([['sin(30)', '0,5'], ['cos(60)', '0,5'], ['tan(45)', '1'], ['tan(135)', '-1'], ['sin(30°)', '0,5'], ['asin(0,5)', '30'], ['acos(0)', '90'], ['sin 30', '0,5'], ['2 sin(30)', '1'], ['sin(30)^2 + cos(30)^2', '1']]);
same([['sin(π/2)', '1'], ['cos(π)', '-1'], ['atan(1)*4', '3,141592654'], ['sin(90°)', '1']], {angle: 'rad'});
same([['sin(100)', '1'], ['cos(200)', '-1']], {angle: 'grad'});
same([['ln(e)', '1'], ['log(1000)', '3'], ['log(0,01)', '-2'], ['log(8;2)', '3'], ['log2(1024)', '10'], ['exp(0)', '1'], ['cosh(0)', '1'], ['sinh(0)', '0'], ['tanh(0)', '0'], ['π', '3,141592654'], ['φ', '1,618033989'], ['e', '2,718281828']]);
eq(val('π', {digits: 15}), '3,14159265358979', '15 chiffres');
// arithmétique, combinatoire, premiers, bases
same([['10!', '3628800'], ['0!', '1'], ['20!', '2432902008176640000'], ['pgcd(84;120)', '12'], ['pgcd(12 ; 18 ; 30)', '6'], ['ppcm(4;6)', '12'], ['ppcm(4;6;10)', '60'], ['C(5;2)', '10'], ['C(49;6)', '13983816'], ['A(5;2)', '20'],
    ['premier(97)', 'VRAI'], ['premier(91)', 'FAUX'], ['facteurs(360)', '2³ × 3² × 5'], ['facteurs(600851475143)', '71 × 839 × 1471 × 6857'], ['premiersuivant(100)', '101'],
    ['arrondi(3,14159;2)', '3,14'], ['arrondi(2,5)', '3'], ['arrondi(-2,5)', '-3'], ['ent(-2,5)', '-3'], ['plafond(2,1)', '3'], ['tronque(-2,7)', '-2'], ['quotient(17;5)', '3'],
    ['hex(255)', '0xFF'], ['bin(10)', '0b1010'], ['oct(64)', '0o100'], ['base(100;3)', '10201'], ['0xFF + 0b11', '258'], ['255 en binaire', '0b11111111'], ['gamma(5)', '24']]);
ok(/^1,772453851$/.test(val('gamma(0,5)')), 'Γ(1/2) = √π');
eq(val('100!').length, 158, '100! : 158 chiffres exacts');
// statistiques sur une liste
same([['moyenne([12 ; 15 ; 9 ; 18])', '13,5'], ['moyenne(2;4;6)', '4'], ['mediane([3;1;4;1;5])', '3'], ['mediane([1;2;3;4])', '2,5'], ['ecarttype([2;4;4;4;5;5;7;9])', '2'], ['variance([1;2;3;4])', '1,25'],
    ['ecarttype_e([1;2;3;4])', '1,290994449'], ['somme([1;2;3])', '6'], ['produit([2;3;4])', '24'], ['min(4;2;8)', '2'], ['max([4;2;8])', '8'], ['etendue([4;2;8])', '6'], ['q1([1;2;3;4;5;6;7;8])', '2'], ['q3([1;2;3;4;5;6;7;8])', '6'],
    ['effectif([4;2;8])', '3'], ['tri([3;1;2])', '[1 ; 2 ; 3]'], ['[1;2;3]*2', '[2 ; 4 ; 6]'], ['moyenne([1/3;2/3])', '1/2']]);
// matrices
same([['det([[1;2];[3;4]])', '-2'], ['det([[2;0;1];[1;3;2];[1;1;2]])', '6'], ['inverse([[1;2];[3;4]])', '[[-2 ; 1] ; [3/2 ; -1/2]]'], ['[[1;2];[3;4]]*[[5;6];[7;8]]', '[[19 ; 22] ; [43 ; 50]]'],
    ['[[1;2];[3;4]]^2', '[[7 ; 10] ; [15 ; 22]]'], ['[[1;2];[3;4]]^-1', '[[-2 ; 1] ; [3/2 ; -1/2]]'], ['transp([[1;2;3]])', '[[1] ; [2] ; [3]]'], ['trace([[1;2];[3;4]])', '5'], ['identite(2)', '[[1 ; 0] ; [0 ; 1]]'],
    ['rang([[1;2];[2;4]])', '1'], ['[[1;2];[3;4]] + [[1;1];[1;1]]', '[[2 ; 3] ; [4 ; 5]]'], ['systeme([[2;1];[1;-1]];[3;0])', '[1 ; 1]'], ['det(inverse([[2;1];[1;1]]))', '1']]);
bad('inverse([[1;2];[2;4]])', /pas d’inverse/);
bad('[[1;2;3]]*[[1;2]]', /Produit impossible/);
bad('det([[1;2;3]])', /carrée/);
// équations : polynômes jusqu'au degré 4 (exacts), systèmes 2 × 2 et 3 × 3, équations quelconques (approchées)
same([['x^2-3x+2=0', 'x = 1 ou x = 2'], ['2x+3=7', 'x = 2'], ['x/2+1=4', 'x = 6'], ['x^3-6x^2+11x-6=0', 'x = 1 ou x = 2 ou x = 3'], ['x^4-5x^2+4=0', 'x = -2 ou x = -1 ou x = 1 ou x = 2'],
    ['x^2+1=0', 'x = -i ou x = i'], ['x^2-2x+1=0', 'x = 1 (double)'], ['(x-1)^3=0', 'x = 1 (triple)'], ['resoudre(x^2 = 4)', 'x = -2 ou x = 2'], ['resoudre(x^2=4;x;0;10)', 'x = 2'], ['racines(1;-3;2)', 'x = 1 ou x = 2'],
    ['resoudre(2x + y = 3 ; x - y = 0)', 'x = 1 ; y = 1'], ['resoudre(x+y+z=6 ; x-y=-1 ; x+z=4)', 'x = 1 ; y = 2 ; z = 3'], ['resoudre(t^2 = 9)', 't = -3 ou t = 3'], ['x+1=x+1', 'Toujours vrai']]);
ok(/√2/.test(run('x^2=2').alt), 'x² = 2 : la valeur exacte ± √2');
ok(/√3/.test(run('x^2+x+1=0').alt) && /i/.test(val('x^2+x+1=0')), 'x² + x + 1 = 0 : racines complexes, forme exacte');
ok(/^x = 0,7390851332$/.test(val('resoudre(cos(x) = x)', {angle: 'rad'})), 'cos(x) = x (approchée)');
eq(val('sin(x)=0,5'), 'x = 30', 'sin(x) = 0,5 en degrés');
ok(/^Aucune solution/.test(val('x+1=x+2')), 'x + 1 = x + 2 : aucune solution');
bad('resoudre(x*y=2 ; x+y=3)', /premier degré/);
bad('resoudre(x+y=1 ; 2x+2y=5)', /aucune solution/);
bad('resoudre(x+y=1 ; 2x+2y=2)', /infinité/);
// dérivées, intégrales, limites, sommes (calculées en radians)
same([['derivee(x^3;2)', '12'], ['derivee(sin(x);0)', '1'], ['derivee(exp(x);0)', '1'], ['integrale(x^2;0;3)', '9'], ['integrale(sin(x);0;π)', '2'], ['integrale(1/x;1;e)', '1'], ['integrale(t^2;t;0;3)', '9'],
    ['limite(sin(x)/x;0)', '1'], ['somme(k^2;k;1;10)', '385'], ['produit(k;k;1;5)', '120']]);
ok(/^2,718281828$/.test(val('derivee(exp(x);1)')), "dérivée de exp en 1 = e");
// unités et mesures anciennes (Paris par défaut), monnaies, poids, températures
same([['3 toises en m', '5,84711 m'], ['12 pieds en m', '3,89807 m'], ['5 toises en pieds', '30 pieds'], ['5 arpents en ha', '1,70943 ha'], ['1 lieue en km', '3,89807 km'], ['3 boisseaux en l', '39,024 l'],
    ['2 toises 3 pieds en m', '4,87259 m'], ['1 livre poids en g', '489,506 g'], ['2 marcs en onces', '16 onces'], ['785 deniers en livres', '3 livres 5 sols 5 deniers'], ['3 livres 5 sous 6 deniers en deniers', '786 deniers'],
    ['2 louis en livres', '48 livres'], ['81 livres en francs', '80 francs'], ['1 écu en sous', '60 sous'], ['100 °F en °C', '37,77777778 °C'], ['90 min en h', '1,5 h'], ['2 km en m', '2000 m'], ['1 ha en m2', '10000 m2'], ['3 toises', '5,84711 m'], ['20 sous', '1 livre']]);
eq(val('2 toises en m', {region: 'lorraine'}), '5,7172 m', 'toise de Lorraine (10 pieds)');
bad('1 journal en ha', /Bretagne|Bourgogne/);
bad('3 toises en litres', /On ne peut pas convertir/);
bad('10 machins en m', /unité/);
// dates des actes (C4) : calendrier républicain, jour de la semaine, âge et écart
same([['3 frimaire an XII', '25 novembre 1803'], ['1er vendémiaire an I en grégorien', '22 septembre 1792'], ['14 juillet 1794 en républicain', '26 messidor an II'], ['14/07/1789 en jour', 'mardi'],
    ['7 mai 1925 → 8 décembre 1960', '35 ans, 7 mois et 1 jour'], ['du 1er mars 1802 au 12/06/1851', '49 ans, 3 mois et 11 jours'], ['âge 1925 → 1960', 'entre 34 et 35 ans']]);
ok(/messidor an II/.test(run('14 juillet 1794').alt), 'une date de la Révolution : son nom républicain en 2e ligne');
ok(/12\s999 jours/.test(run('7 mai 1925 → 8 décembre 1960').alt), 'l’écart en jours');
bad('14/07/1789 en républicain', /22 septembre 1792/);
bad('30 février 1900 → 1960', /impossible/);
eq(val('8/12/1960'), '1/2940', 'sans « en » ni flèche, 8/12/1960 reste une division');
// erreurs expliquées en français
bad('', /Tape un calcul/);
bad('(2+3', /parenthèse fermante/);
bad('2+3)', /de trop/);
bad('2+', /Il manque un nombre après « \+ »/);
bad('*3', /avant « × »/);
bad('1/0', /Division par zéro/);
bad('sni(3)', /Voulais-tu dire « sin »/);
bad('2 3', /Il manque un signe/);
bad('pgcd(12,18)', /« ; »/);
bad('x^2', /n’a pas de valeur/);
bad('tan(90)', /n’existe pas/);
bad('asin(2)', /entre −1 et 1/);
bad('(-1)!', /factorielle/i);
bad('2 $ 3', /signe « \$ »/);
bad('ans + 1', /résultat précédent/);
eq(val('ans + 1', {ans: C.fr(41)}), '42', 'ans = le résultat d’avant');
// séparateur décimal « point »
same([['2.5 + 1', '3.5'], ['pgcd(12,18)', '6'], ['moyenne([1, 2])', '1.5']], {dec: '.'});
// bornes : rien ne bloque
bad('9'.repeat(3000), /trop long/);
bad('('.repeat(120) + '1' + ')'.repeat(120), /parenthèses imbriquées/);
bad('2^2^2^2^2', /trop grand/);
bad('100000!', /trop grande/);
bad('1e9999', /trop grand/);
{ const t = Date.now(); run('facteurs(999999999999999989)'); ok(Date.now() - t < 5000, 'grand nombre premier : vite'); }
// courbes : fonctions compilées (rapides), domaine
{ const f = C.compile('y = x^2 - 1'); eq([f(3), f(0)], [8, -1], 'y = x² − 1'); ok(Number.isNaN(C.compile('1/x')(0)), '1/x en 0 : pas de point'); ok(Number.isNaN(C.compile('sqrt(x)')(-1)), '√x hors domaine'); ok(Math.abs(C.compile('sin(x)')(Math.PI / 2) - 1) < 1e-12, 'courbes en radians');
    assert.throws(() => C.compile('x + y'), /« y »/); n++; }
// jolie écriture
ok(/cm-fr-n/.test(run('1/2 + 3').inputHtml) && /<sup>2<\/sup>/.test(run('x^2=4').inputHtml) && /cm-rt/.test(run('√2').inputHtml), 'fractions, puissances et racines dessinées');
ok(C.functionList().length > 70 && C.unitList().some(u => /toise/.test(u.label)), 'liste des fonctions et des unités pour l’aide');
console.log(`✓ moteur : ${n} vérifications`);

/* ═════════ 2. Dans le navigateur ═════════ */
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
(async () => {
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); console.log(`✓ calculette : ${n} vérifications`); return; }
    const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
    const phpPath = findPhp([devBundledPhp()]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-calculette-'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
      if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); } }
    const port = Number(process.env.CALC_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const SHOTS = process.env.CALC_SHOTS || '';
    const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
    const browser = await pw.chromium.launch();
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.replace(/\/$/, '') });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.calculator && window.LCNDA_CALC && window.LCNDA_APP?.state?.csrf && document.getElementById('calculette-open'));
        const out = () => page.textContent('[data-cm-out]');
        const inp = '[data-cm-input]';
        // ouvrir par le bouton 🧮 ; clavier
        await page.click('#calculette-open'); await page.waitForSelector('.cm-win:not([hidden])');
        ok(await page.evaluate(() => document.activeElement?.matches('[data-cm-input]')), 'le curseur est dans la case');
        await page.keyboard.type('12*3,5'); await page.keyboard.press('Enter');
        ok(/42/.test(await out()), 'Entrée calcule : 42');
        await page.keyboard.type('+8'); eq(await page.inputValue(inp), 'ans+8', 'un opérateur après un résultat continue le calcul');
        await page.keyboard.press('Enter'); ok(/50/.test(await out()), 'ans + 8 = 50');
        await page.keyboard.type('1/3+1/6'); await page.waitForTimeout(250);
        ok(await page.isVisible('[data-cm-pretty] .cm-fr'), 'écriture jolie pendant la frappe (fractions posées)');
        ok(/1\s*2/.test(await out()) && await page.evaluate(() => document.querySelector('[data-cm-result]').classList.contains('is-preview')), 'résultat en aperçu (gris) avant Entrée');
        await page.keyboard.press('Enter');
        eq(await page.locator('.cm-tr').count(), 3, 'le ruban garde les 3 calculs');
        await page.keyboard.press('ArrowUp'); eq(await page.inputValue(inp), '1/3+1/6', '↑ reprend le dernier calcul');
        await page.keyboard.press('ArrowUp'); eq(await page.inputValue(inp), 'ans+8', '↑ encore : celui d’avant');
        await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); eq(await page.inputValue(inp), '', '↓ revient au brouillon');
        // erreur expliquée sous la case (K1)
        await page.keyboard.type('(2+3'); await page.keyboard.press('Enter');
        ok(await page.isVisible('[data-cm-err]') && /parenthèse fermante/.test(await page.textContent('[data-cm-err]')), 'erreur expliquée en français');
        ok(await page.evaluate(() => document.querySelector('[data-cm-input]').classList.contains('is-invalid')), 'la case est encadrée de rouge');
        await page.keyboard.type(')'); await page.waitForTimeout(150); ok(await page.isHidden('[data-cm-err]'), 'l’erreur s’efface dès qu’on corrige');
        await page.keyboard.press('Enter'); ok(/5/.test(await out()), '(2+3) = 5');
        await shot(page, 'calculette-simple');
        // ruban cliquable, 📋 copier (⌘C / Ctrl+C sans sélection)
        await page.click('[data-cm-reuse="1"]'); eq(await page.inputValue(inp), '50', 'un clic sur le ruban reprend le résultat');
        await page.fill(inp, ''); await page.keyboard.press('Control+c');
        await page.waitForTimeout(200);
        eq(await page.evaluate(() => navigator.clipboard.readText()), '5', 'Ctrl+C copie le résultat');
        ok(await page.evaluate(() => document.querySelector('[data-cm-copy]').dataset.shortcut === '⌘C'), 'K12 : la touche dans la bulle du bouton 📋');
        // mémoire
        await page.click('[data-cm-mem="m+"]'); await page.waitForTimeout(100);
        ok(/5/.test(await page.textContent('[data-cm-memv]')), 'M+ garde 5');
        await page.keyboard.type('10'); await page.keyboard.press('Enter'); await page.click('[data-cm-mem="m+"]');
        ok(/15/.test(await page.textContent('[data-cm-memv]')), 'M+ ajoute : 15');
        await page.click('[data-cm-mem="mr"]'); eq(await page.inputValue(inp), '15', 'MR reprend 15');
        await page.click('[data-cm-mem="m-"]'); ok(/^\s*M\s*0\s*$/.test(await page.textContent('[data-cm-memv]')), 'M− retire : 0');
        await page.click('[data-cm-mem="mc"]'); eq((await page.textContent('[data-cm-memv]')).trim(), '', 'MC efface');
        // touches à la souris
        await page.fill(inp, ''); for (const k of ['7', '*', '6', 'eval']) await page.click(`[data-cm-key="${k}"]`);
        ok(/42/.test(await out()), 'les grosses touches : 7 × 6 = 42');
        // Échap : vide, puis ferme ; ⇧⌘Y (Ctrl+Maj+Y) rouvre
        await page.keyboard.type('99'); await page.keyboard.press('Escape'); eq(await page.inputValue(inp), '', 'Échap vide la case');
        await page.keyboard.press('Escape'); ok(await page.isHidden('.cm-win'), 'Échap encore : la calculette se ferme');
        await page.keyboard.press('Control+Shift+Y'); await page.waitForSelector('.cm-win:not([hidden])');
        ok(true, 'Ctrl+Maj+Y rouvre la calculette');
        ok(await page.evaluate(() => /calcul/i.test(JSON.stringify(window.LCNDA_APP.shortcutKit.commands().find(c => c.id === 'calculator')))), 'le raccourci est dans la liste des raccourcis (Maintenance → Raccourcis)');
        // 🧪 scientifique : rubriques, exemples, unités, dates
        await page.click('[data-cm-tab="sci"]'); await page.waitForSelector('[data-cm-sci]:not([hidden])');
        await page.click('[data-cm-group="eq"]'); await page.click('[data-cm-ex="x^2 − 3x + 2 = 0"]');
        ok(/x = 1 ou x = 2/.test(await out()), 'exemple d’équation : x = 1 ou x = 2');
        await page.click('[data-cm-ang="rad"]'); await page.fill(inp, 'cos(π)'); await page.keyboard.press('Enter'); ok(/−1/.test(await out()), 'RAD : cos(π) = −1');
        await page.click('[data-cm-ang="deg"]');
        await page.click('[data-cm-group="fn"]'); await page.fill(inp, ''); await page.click('.cm-fk:has-text("sin")'); await page.keyboard.type('30'); eq(await page.inputValue(inp), 'sin(30)', 'touche sin : la parenthèse est ouverte, le curseur dedans');
        await page.keyboard.press('Enter'); ok(/0,5/.test(await out()), 'sin(30) = 0,5');
        await page.click('[data-cm-group="mat"]'); await page.click('.cm-fk:has-text("▦")'); await page.waitForSelector('.cm-mx-cell');
        const cells = page.locator('.cm-mx-cell'); await cells.nth(0).fill('2'); await cells.nth(1).fill('1'); await cells.nth(2).fill('1'); await cells.nth(3).fill('1');
        await page.fill(inp, 'det('); await page.click('[data-cm-mx-ins]'); await page.locator(inp).press('End'); await page.keyboard.type(')'); await page.keyboard.press('Enter');
        ok(/=\s*1\b/.test(await out()), 'matrice écrite dans la grille : det = 1');
        await page.click('[data-cm-group="un"]'); await page.fill('[data-cm-cv]', '3'); await page.click('.cm-conv button[type=submit]');
        ok(/5,84711\s*m/.test(await out()), 'conversion : 3 toises = 5,84711 m');
        await page.click('[data-cm-group="dt"]'); await page.fill('[data-cm-age] [name=a]', '7 mai 1925'); await page.fill('[data-cm-age] [name=b]', '8 décembre 1960'); await page.click('[data-cm-age] button');
        ok(/35 ans, 7 mois et 1 jour/.test(await out()), 'âge entre deux dates C4');
        await page.fill('[data-cm-rep] [name=d]', '3 frimaire an XII'); await page.click('[data-cm-rep] button'); ok(/25 novembre 1803/.test(await out()), 'républicain → grégorien');
        await shot(page, 'calculette-scientifique');
        // 📈 courbes
        await page.click('[data-cm-tab="plot"]'); await page.waitForSelector('[data-cm-canvas]'); await page.waitForTimeout(300);
        const blue = () => page.evaluate(() => { const c = document.querySelector('[data-cm-canvas]'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 40 && d[i + 1] > 70 && d[i + 1] < 120 && d[i + 2] > 230) k++; return k; });
        ok(await blue() > 200, 'la courbe sin(x) est tracée (en bleu)');
        const z0 = await page.textContent('.cm-plotbar .ed-zoom-v'); await page.click('.cm-plotbar [data-ed-zoom="in"]'); ok(await page.textContent('.cm-plotbar .ed-zoom-v') !== z0, 'zoom commun [− 100 % +]');
        await page.click('[data-cm-curve-add]'); await page.fill('[data-cm-cv-in="2"]', 'sin('); await page.waitForTimeout(150);
        ok(await page.isVisible('[data-cm-cv-err="2"]') && /parenthèse/.test(await page.textContent('[data-cm-cv-err="2"]')), 'courbe fausse : erreur sous la ligne');
        await page.fill('[data-cm-cv-in="2"]', 'x^3/10'); await page.waitForTimeout(150); ok(await page.isHidden('[data-cm-cv-err="2"]'), 'courbe corrigée');
        await page.click('[data-cm-cv-del="2"]'); eq(await page.locator('[data-cm-cv-in]').count(), 2, 'courbe retirée (↶ Annuler dans le message)');
        await page.hover('[data-cm-canvas]', { position: { x: 200, y: 200 } });
        await shot(page, 'calculette-courbes');
        // ⚙️ réglages (K2) et 💾 Réglages enregistrés
        await page.click('[data-cm-tab="simple"]');
        await page.click('[data-cm-settings]'); await page.waitForSelector('dialog[open] select[name=angle]');
        await page.selectOption('dialog[open] select[name=angle]', 'rad'); await page.waitForTimeout(300);
        eq(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-calculette')).angle), 'rad', 'K2 : le réglage est gardé tout de suite');
        ok(await page.isVisible('dialog[open] [data-ed-saved]'), '« ✓ Enregistré » dans la fenêtre');
        ok(await page.isVisible('dialog[open] .ui-presets'), '💾 Réglages enregistrés');
        await page.click('dialog[open] .ui-presets-head'); await page.click('dialog[open] [data-ps-new]'); await page.fill('dialog[open] [data-ps-name]', 'Radians'); await page.click('dialog[open] [data-ps-ok]');
        eq(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-calculette-presets'))[0].data.angle), 'rad', 'réglage enregistré sous un nom');
        ok(await page.evaluate(() => !!document.querySelector('dialog[open] .cm-win')), 'au-dessus d’une fenêtre ouverte, la calculette y passe');
        await page.click('dialog[open] [data-ui-reset]'); await page.waitForTimeout(150);
        eq(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-calculette')).angle), 'deg', '↺ Remettre comme au départ');
        await page.click('dialog[open] .modal-actions [data-h-close]'); await page.waitForTimeout(200);
        ok(await page.evaluate(() => document.querySelector('.cm-win').parentElement === document.body), 'fenêtre fermée : la calculette revient sur la page');
        // dans une fenêtre de saisie : on calcule sans la fermer
        await page.evaluate(() => window.LCNDA_APP.openNewPersonDialog()); await page.waitForSelector('dialog[open]'); await page.waitForTimeout(300);
        await page.click('.cm-win [data-cm-input]'); await page.keyboard.type('2^10'); await page.keyboard.press('Enter');
        ok(/1\s?024/.test(await out()) && await page.evaluate(() => !!document.querySelector('dialog[open]')), 'calcul pendant une saisie : la fenêtre reste ouverte');
        await page.keyboard.press('Escape');
        ok(await page.isHidden('.cm-win') && await page.evaluate(() => !!document.querySelector('dialog[open]')), 'Échap ferme la calculette, pas la fenêtre de saisie');
        await page.evaluate(() => document.querySelector('dialog[open]')?.close());
        await page.keyboard.press('Control+Shift+Y'); await page.waitForSelector('.cm-win:not([hidden])');
        // la place et la taille sont retenues
        const box = await page.locator('.cm-head').boundingBox();
        if (box) { await page.mouse.move(box.x + 60, box.y + 12); await page.mouse.down(); await page.mouse.move(box.x - 300, box.y + 40, { steps: 5 }); await page.mouse.up(); }
        ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('lcnda-calculette-place')) || {}).x < 900), 'glisser le titre déplace la calculette (retenu)');
        eq(errors, [], 'aucune erreur (1440 px)');

        // 390 px, mode sombre
        const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
        const p2 = await ctx2.newPage(); const err2 = [];
        p2.on('pageerror', e => err2.push('pageerror ' + e.message)); p2.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) err2.push('console ' + m.text()); });
        await p2.goto(base); await p2.waitForFunction(() => window.LCNDA_EXT?.calculator && window.LCNDA_APP?.state?.csrf);
        await p2.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); window.LCNDA_EXT.calculator.open({mode: 'simple'}); });
        await p2.waitForSelector('.cm-win:not([hidden])');
        await p2.click('[data-cm-key="7"]'); await p2.click('[data-cm-key="+"]'); await p2.click('[data-cm-key="5"]'); await p2.click('[data-cm-key="eval"]');
        ok(/12/.test(await p2.textContent('[data-cm-out]')), '390 px : 7 + 5 = 12 au doigt');
        const g = await p2.evaluate(() => { const w = document.querySelector('.cm-win').getBoundingClientRect(), bg = getComputedStyle(document.querySelector('.cm-win')).backgroundColor; const m = bg.match(/\d+/g).map(Number); return {w: Math.round(w.width), right: Math.round(w.right), bottom: Math.round(w.bottom), over: document.documentElement.scrollWidth - innerWidth, dark: m[0] + m[1] + m[2] < 150, keys: [...document.querySelectorAll('.cm-key')].every(k => { const r = k.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.height >= 30; })}; });
        eq([g.w, g.right <= 390, g.over, g.dark, g.keys], [390, true, 0, true, true], '390 px : toute la largeur, en bas, pas de défilement de côté, sombre, touches dans l’écran');
        await shot(p2, 'calculette-390-sombre');
        await p2.click('[data-cm-tab="sci"]'); await p2.waitForTimeout(150);
        ok(await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth) === 0, '390 px scientifique : pas de défilement de côté');
        await p2.click('[data-cm-tab="plot"]'); await p2.waitForTimeout(250);
        ok(await p2.evaluate(() => { const c = document.querySelector('[data-cm-canvas]'); return c.clientWidth > 300 && c.clientHeight > 120; }), '390 px : le graphique tient');
        await shot(p2, 'calculette-390-courbes');
        eq(err2, [], 'aucune erreur (390 px sombre)');
        await ctx2.close();
    } finally { await browser.close(); proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
    console.log(`✓ calculette : ${n} vérifications`);
})().catch(e => { console.error(e); process.exit(1); });
