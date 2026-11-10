'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📜 Aide à la lecture : langues d'Europe du Nord, de l'Est et régionales.   node tests/test-aide-langues-b.js
 *  oc, br, eu, cs, sk, hu, sv, da, no, ro, hr, sl, lt (assets/js/aide-langues/<code>.js, format README-format.md).
 *  1. Node : chaque langue chargée par index.php ; mots des trois actes, mois, nombres, métiers, parenté, formules, exercice corrigé à 100 % ;
 *     recherche sans diacritiques (ő, č, ș, ė, ø, å, đ, c’h…) ; nombres danois par vingtaines ; alphabet cyrillique roumain ; dessins.
 *  2. Navigateur (Playwright ; sinon sauté), base neuve, 1440 px, 390 px et sombre : pastilles, recherches, lettres dessinées,
 *     exercice hongrois corrigé, convertisseur danois, sans erreur de page ni défilement de côté. AIDE_LANGS_SHOTS=dossier pour les captures.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

/* ═════════ 1. Node ═════════ */
const L = require('../assets/js/app-aide-lecture.js');
const B = ['oc', 'br', 'eu', 'cs', 'sk', 'hu', 'sv', 'da', 'no', 'ro', 'hr', 'sl', 'lt'];
const RARE = ['oc', 'br', 'eu'];
const index = fs.readFileSync(path.join(appRoot, 'index.php'), 'utf8');
const G = L.glyphs().g;
for (const c of B) {
    const f = path.join(appRoot, 'assets/js/aide-langues', `${c}.js`), d = require(f);
    ok(d.code === c && d.name && d.script === 'latine' && d.dir === 'ltr' && d.intro, `${c} : code, nom, écriture, intro`);
    ok(index.includes(`assets/js/aide-langues/${c}.js?v=`), `${c} : chargé par index.php`);
    ok(L.langOf(c), `${c} : dans le registre`);
    ok(!/[<>]/.test(JSON.stringify(d.entries)), `${c} : texte sans HTML`);
    const list = L.search('', {lang: c}).filter(r => r.type === 'entry').map(r => r.item);
    for (const k of ['mot', 'mois', 'nombre', 'metier', 'parente', 'formule']) ok(list.filter(e => e.k === k).length >= (k === 'formule' ? 2 : 5), `${c} : ${k} (${list.filter(e => e.k === k).length})`);
    ok(list.filter(e => e.k === 'mois').length >= 12, `${c} : les 12 mois`);
    for (const a of ['bapteme', 'mariage', 'sepulture']) ok(list.some(e => e.a === a && e.k === 'mot'), `${c} : mots du ${a}`);
    ok(list.length >= (RARE.includes(c) ? 110 : 130), `${c} : assez de mots (${list.length})`);
    const exos = L.EXERCISES.filter(x => x.lang === c); ok(exos.length >= 1, `${c} : un exercice`);
    for (const x of exos) {
        eq(L.correct(x, L.parseExercise(x).answer).score, 100, `${c} : ${x.id} corrigé à 100 %`);
        ok(x.year < 1950 && /modèle/i.test(x.tip), `${c} : ${x.id} ancien et dit « modèle »`);
        // tapé sans aucun signe : toujours juste
        eq(L.correct(x, L.fold(L.parseExercise(x).answer).replace(/ø/g, 'o').replace(/đ/g, 'dj')).score, 100, `${c} : ${x.id} juste sans accents`);
    }
    ok((d.letters || []).every(l => [].concat(l.seen || [], l.cmp || []).every(id => G[id])), `${c} : dessins existants`);
    ok((d.sources || []).length && d.sources.every(s => s.label && /^https:\/\//.test(s.url)), `${c} : sources citées`);
    if (RARE.includes(c)) ok(/rare/i.test(d.intro), `${c} : dit que la langue est rare dans les actes`);
}
// — recherche sans diacritiques —
const top = (q, lang) => (L.search(q, {lang}).find(r => r.type === 'entry') || {}).item || {};
const CASES = [['szuletett', 'hu', /született/], ['ozvegy', 'hu', /özvegy/], ['nascut', 'ro', /născut/], ['moasa', 'ro', /moașă/], ['brezna', 'cs', /března/],
    ['zemrel', 'cs', /zemřel/], ['pokrsteny', 'sk', /pokrstený/], ['fodd', 'sv', /född/], ['ar gammal', 'sv', /år gammal/], ['soen', 'da', /Søn/], ['son', 'da', /Søn/],
    ['dobt', 'da', /døbt/], ['rodjen', 'hr', /rođen/], ['roden', 'hr', /rođen/], ['krscen', 'sl', /krščen/], ['krikstas', 'lt', /krikštas/], ['gime', 'lt', /gimė/],
    ['chourvez', 'br', /c’hourvez/], ['merch', 'br', /merc’h/], ['batejat', 'oc', /batejat/], ['etxe', 'eu', /etxe/], ['goian bego', 'eu', /Goian bego/]];
for (const [q, c, re] of CASES) ok(re.test(top(q, c).t || ''), `« ${q} » (${c}) → ${top(q, c).t}`);
ok(/født|fødte|Fødte/.test(top('fodt', 'da').t || '') || /født/.test(top('fodt', '').t || ''), '« fodt » trouve født');
ok(/március/.test(top('marcius', '').t || ''), 'toutes langues : « marcius » trouve március');
// — patronymes, ordre des noms, mois piège —
ok(/fils de/.test(top('-son, -dotter', 'sv').d), 'suédois : patronymes expliqués');
ok(/Madame Jean Kovács/.test(top('-né', 'hu').d), 'hongrois : -né');
ok(/octobre/.test(top('listopad', 'hr').d) && /novembre/.test(top('listopad', 'cs').d), 'listopad : octobre en croate, novembre en tchèque');
// — nombres danois —
const N = L.langOf('da').numerals;
eq([1, 21, 50, 72, 83, 99, 154].map(N.to), ['en', 'enogtyve', 'halvtreds', 'tooghalvfjerds', 'treogfirs', 'nioghalvfems', 'et hundrede og fireoghalvtreds'], 'danois : nombres → mots');
eq(['halvtredsindstyve', 'treogfirsindstyve', 'fyrretyve', 'et hundrede og fem', 'tres', 'xyz'].map(N.from), [50, 83, 40, 105, 60, null], 'danois : mots → nombres');
eq([N.from('atten hundrede og tooghalvtreds'), N.from('sytten hundrede og firsindstyve'), N.to(1852)], [1852, 1780, 'et tusinde otte hundrede og tooghalvtreds'], 'danois : les années');
for (let i = 1; i <= 9999; i++) if (N.from(N.to(i)) !== i) assert.fail(`aller-retour danois ${i}`); n++;
// — roumain : ancien alphabet cyrillique —
const ro = L.langOf('ro'); ok(ro.alphabet.length >= 35 && ro.alphabet.some(a => a.small === 'щ' && a.latin === 'șt'), 'roumain : alphabet cyrillique (щ = șt)');
ok(L.search('', {kind: 'lettre', lang: 'ro'}).filter(r => r.item.lang === 'ro').length >= 8, 'roumain : lettres cyrilliques dessinées');
// — dessins : seulement des traits —
ok(L.LETTERS.filter(l => B.includes(l.lang)).every(l => /<svg[^>]*class="la-glyph"/.test(L.glyphSvg(l.seen)) && !/https?:|<image|xlink|on\w+=/.test(L.glyphSvg(l.seen))), 'dessins SVG maison');
// — la transcription : « Langue du texte » → la langue de l'aide —
eq(['swe', 'dan', 'nor', 'ces', 'slk', 'hun', 'ron', 'hrv', 'slv', 'lit'].map(L.langForOcr), ['sv', 'da', 'no', 'cs', 'sk', 'hu', 'ro', 'hr', 'sl', 'lt'], 'langue de la transcription');
ok(L.known('1785 d. 12 Martii föddes och döptes Anders hustru Kerstin', 'sv').some(k => /föddes/.test(k.word)), 'mots connus en suédois');
console.log(`✓ langues B (Node) : ${n} vérifications`);

/* ═════════ 2. Navigateur ═════════ */
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
(async () => {
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
    const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-aide-langues-b-'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Anders','Persson','male')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
      if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); } }
    const port = Number(process.env.AIDE_LANGS_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const SHOTS = process.env.AIDE_LANGS_SHOTS || '';
    const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
    const browser = await pw.chromium.launch();
    const open = async (width, dark) => {
        const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light' });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        page.on('response', r => { if (r.status() === 404 && /aide-langues/.test(r.url())) errors.push('404 ' + r.url()); });
        await page.goto(base); await page.waitForFunction(codes => window.LCNDA_EXT?.readingAid && window.LCNDA_APP?.state?.csrf && codes.every(c => (window.LCNDA_AIDE_LANGS || []).some(l => l.code === c)), B);
        if (dark) await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        return { ctx, page, errors };
    };
    const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('dialog[open] .la-body, dialog[open] .la-langs')].every(el => el.getBoundingClientRect().right <= window.innerWidth + 1));
    const typeQ = async (page, q) => { await page.fill('dialog[open] .la-search input', ''); await page.type('dialog[open] .la-search input', q); await page.waitForTimeout(350); };
    try {
        /* — 1440 px — */
        const { ctx, page, errors } = await open(1440, false);
        await page.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'dict', lang: ''}));
        await page.waitForSelector('dialog[open] .la-langs');
        // beaucoup de langues : les autres sont derrière « ＋ N autres langues »
        if (await page.$('dialog[open] [data-la-langs-more][aria-expanded="false"]')) await page.click('dialog[open] [data-la-langs-more]');
        const pills = await page.textContent('dialog[open] .la-langs'); if (process.env.AIDE_DEBUG) console.log(pills);
        ok(['Occitan', 'Breton', 'Basque', 'Tchèque', 'Slovaque', 'Hongrois', 'Suédois', 'Danois', 'Norvégien', 'Roumain', 'Croate', 'Slovène', 'Lituanien'].every(x => new RegExp(`${x} \\(\\d+\\)`).test(pills)), 'pastilles des 13 langues avec le nombre');
        await page.click('dialog[open] [data-la-lang="hu"]'); await typeQ(page, 'szuletett');
        ok(/született/.test(await page.textContent('dialog[open] .la-dict')), 'navigateur : « szuletett » → született');
        ok(await page.$('dialog[open] .la-row mark') !== null, 'lettres surlignées malgré ü et é');
        ok(/Hungaricana/.test(await page.textContent('dialog[open] .la-body')), 'hongrois : intro et sources');
        await shot(page, 'b-hongrois-1440');
        await typeQ(page, ''); await page.click('dialog[open] [data-la-lang="da"]'); await typeQ(page, 'soen');
        ok(/Søn/.test(await page.textContent('dialog[open] .la-dict')), 'navigateur : « soen » → Søn');
        await typeQ(page, '');
        await page.waitForSelector('dialog[open] [data-la-num-in]');
        await page.fill('dialog[open] [data-la-num-in]', 'halvtredsindstyve'); await page.waitForTimeout(150);
        ok(/50/.test(await page.textContent('dialog[open] [data-la-num-out]')), 'danois : halvtredsindstyve = 50');
        await page.fill('dialog[open] [data-la-num-in]', '83'); await page.waitForTimeout(150);
        ok(/treogfirs/.test(await page.textContent('dialog[open] [data-la-num-out]')), 'danois : 83 = treogfirs');
        await page.fill('dialog[open] [data-la-num-in]', 'atten hundrede og tooghalvtreds'); await page.waitForTimeout(150);
        ok(/1\s?852/.test(await page.textContent('dialog[open] [data-la-num-out]')), 'danois : année 1852');
        await shot(page, 'b-danois-nombres-1440');
        // lettres : gothique suédois, cyrillique roumain
        await page.click('dialog[open] [data-la-lang="sv"]'); await page.click('dialog[open] [data-la-tab="lettres"]'); await page.waitForSelector('dialog[open] .la-letter');
        ok(/gothique/.test(await page.textContent('dialog[open] .la-letters')), 'suédois : lettres gothiques');
        await page.click('dialog[open] [data-la-lang="ro"]'); await page.waitForSelector('dialog[open] .la-alpha-table');
        ok((await page.$$('dialog[open] .la-alpha-table tbody tr')).length >= 35, 'roumain : alphabet cyrillique');
        ok((await page.$$('dialog[open] .la-letter svg.la-glyph')).length >= 8, 'roumain : lettres dessinées');
        await shot(page, 'b-roumain-lettres-1440');
        // exercice hongrois
        await page.click('dialog[open] [data-la-lang="hu"]'); await page.click('dialog[open] [data-la-tab="exos"]');
        await page.click('dialog[open] [data-la-exo="hu_szul1871"]');
        ok(await page.$eval('dialog[open] .la-old', el => el.getAttribute('lang')) === 'hu', 'exercice : lang="hu"');
        await page.fill('dialog[open] [data-la-answer]', 'Kovacs Janos foldmuves es neje Szabo Maria torvenyes fia Jozsef szuletett 1871 marcius 3 keresztelt marcius 5 keresztszulok Nagy Istvan es neje Toth Erzsebet');
        await page.click('dialog[open] [data-la-correct]'); await page.waitForSelector('dialog[open] .la-words .la-w.is-ok');
        ok((await page.$$('dialog[open] .la-words .la-w.is-ok')).length >= 22, 'exercice hongrois corrigé, tapé sans accents');
        await shot(page, 'b-exercice-hongrois-1440');
        ok(await noSideScroll(page), '1440 : pas de débordement');
        ok(!errors.length, 'sans erreur (1440) : ' + errors.join(' | '));
        await ctx.close();
        /* — 390 px — */
        { const { ctx: c2, page: p2, errors: e2 } = await open(390, false);
            for (const [lang, q, re] of [['cs', 'brezna', /března/], ['hr', 'rodjen', /rođen/], ['lt', 'krikstas', /krikštas/], ['br', 'chourvez', /c’hourvez/]]) {
                await p2.evaluate(o => window.LCNDA_EXT.readingAid.open({tab: 'dict', lang: o[0], q: o[1]}), [lang, q]); await p2.waitForSelector('dialog[open] .la-row');
                ok(re.test(await p2.textContent('dialog[open] .la-dict')), `390 : ${lang} « ${q} »`);
                ok(await noSideScroll(p2), `390 : ${lang} sans défilement de côté`);
                await p2.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            }
            await p2.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'lettres', lang: 'ro'})); await p2.waitForSelector('dialog[open] .la-alpha-table');
            ok(await noSideScroll(p2), '390 : alphabet roumain sans débordement de la page');
            await shot(p2, 'b-roumain-390');
            await p2.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p2.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'exos', lang: 'sv'})); await p2.waitForSelector('dialog[open] [data-la-exo]');
            await p2.click('dialog[open] [data-la-exo="sv_fodde1785"]'); await p2.waitForSelector('dialog[open] .la-old');
            ok(await noSideScroll(p2), '390 : exercice suédois sans débordement');
            await shot(p2, 'b-exercice-suedois-390');
            ok(!e2.length, 'sans erreur (390) : ' + e2.join(' | ')); await c2.close(); }
        /* — sombre — */
        { const { ctx: c3, page: p3, errors: e3 } = await open(1440, true);
            await p3.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'lettres', lang: 'da'})); await p3.waitForSelector('dialog[open] .la-letter');
            ok(/aa = å/.test(await p3.textContent('dialog[open] .la-letters')), 'sombre : lettres danoises');
            const col = await p3.$eval('dialog[open] .la-letter-draw', el => getComputedStyle(el).color); ok(col !== 'rgb(74, 50, 24)', `sombre : trait éclairci (${col})`);
            await shot(p3, 'b-danois-sombre');
            await p3.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p3.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'dict', lang: 'eu'})); await p3.waitForSelector('dialog[open] .la-intro');
            ok(/rare/.test(await p3.textContent('dialog[open] .la-intro')), 'sombre : basque, intro « rare »');
            await shot(p3, 'b-basque-sombre');
            ok(!e3.length, 'sans erreur (sombre) : ' + e3.join(' | ')); await c3.close(); }
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`✓ aide à la lecture, langues B : ${n} vérifications`);
})().catch(e => { console.error(e); process.exit(1); });
