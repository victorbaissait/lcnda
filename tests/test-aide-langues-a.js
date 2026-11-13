'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📜 Aide à la lecture — langues du lot A :   node tests/test-aide-langues-a.js
 * portugais (pt), catalan (ca), anglais (en), russe (ru), ukrainien (uk), hébreu (he), yiddish (yi), arménien (hy), arabe (ar).
 *  1. Node : chaque langue est chargée, a des mots, des mois, des nombres, des formules, un exercice corrigé à 100 % ; recherche sans
 *     accents et en lettres latines (krestianin, tichri, marhoum, krikor, geshtorbn…) ; lettres d'avant 1918 (ѣ, ъ, і, ѳ) ; lettres-nombres
 *     (cyrillique, hébreu, arménien, abjad + chiffres d'Orient) ; exercice corrigé aussi en lettres latines ; écriture de droite à gauche.
 *  2. Navigateur (Playwright ; sinon sauté), base neuve, 1440 px, 390 px et sombre : pastilles Langue, hébreu et arabe affichés de droite
 *     à gauche (dir="rtl"), nombres hébreux, alphabet arménien, exercice russe corrigé, sans erreur ni défilement de côté.
 *     AIDE_LANGS_A_SHOTS=dossier pour garder les captures ; AIDE_LANGS_A_PORT pour le port du serveur.
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
const LOT = ['pt', 'ca', 'en', 'ru', 'uk', 'he', 'yi', 'hy', 'ar'];
const RTL = ['he', 'yi', 'ar'];
const index = fs.readFileSync(path.join(appRoot, 'index.php'), 'utf8');
for (const code of LOT) {
    const l = L.langOf(code); ok(l, `${code} : chargé`);
    ok(index.includes(`assets/js/aide-langues/${code}.js?v=`), `${code} : branché dans index.php`);
    eq(l.dir, RTL.includes(code) ? 'rtl' : 'ltr', `${code} : sens d'écriture`);
    const kinds = new Set(l.entries.map(e => e.k));
    ['mot', 'mois', 'nombre', 'formule', 'parente', 'metier'].forEach(k => ok(kinds.has(k), `${code} : a des « ${k} »`));
    ok(l.entries.length >= 60, `${code} : au moins 60 mots (${l.entries.length})`);
    ok(!/[<>]/.test(JSON.stringify(l.entries) + JSON.stringify(l.letters || [])), `${code} : texte sans HTML`);
    ok((l.sources || []).length && l.sources.every(s => /^https:\/\//.test(s.url) && s.label), `${code} : sources citées`);
    ok(l.sources.some(s => /familysearch\.org/.test(s.url) && /Genealogical Word List|Church Records/.test(s.label)), `${code} : liste FamilySearch citée`);
    ok((l.exercises || []).length >= 1, `${code} : au moins un exercice`);
    for (const x of l.exercises) {
        const ex = L.search('', {kind: 'exercice', lang: code}).map(r => r.item).find(y => y.id === x.id); ok(ex, `${x.id} : dans la recherche`);
        ok(x.year < 1950 && /modèle/.test(x.tip) && /exemple/.test(x.tip), `${x.id} : texte modèle, personnes d’exemple, avant 1950`);
        eq(L.correct(ex, L.parseExercise(ex).answer).score, 100, `${x.id} : corrigé à 100 %`);
    }
    // chaque dessin des lettres existe
    for (const t of l.letters || []) [...t.seen, ...(t.cmp || [])].forEach(id => ok(L.glyphSvg(id).includes('<g '), `${code} : dessin « ${id} »`));
    // dans la liste par langue : tout vient de la langue
    const r = L.search('', {lang: code}); ok(r.length > 50 && r.filter(x => x.type === 'entry').every(x => x.item.lang === code), `${code} : filtre langue`);
    // les nombres en lettres, aller-retour
    if (l.numerals) for (const v of [1, 9, 15, 42, 655, 999, 1250, 1812]) { const s = l.numerals.to(v); if (s) eq(l.numerals.from(s), v, `${code} : nombre ${v} ⇄ ${s}`); }
}
ok(['ru', 'uk', 'he', 'yi', 'hy', 'ar'].every(c => typeof L.langOf(c).translit === 'function'), 'écritures non latines : translittération');
ok(['pt', 'ca', 'en'].every(c => L.langOf(c).translit === null), 'écritures latines : pas de translittération');

const first = (q, lang) => L.search(q, {lang, limit: 3})[0]?.item;
// — recherche sans accents —
ok(/veuf/.test(first('viuvo', 'pt').d), 'portugais : « viuvo » trouve viúvo');
ok(/parrain/.test(first('padri', 'ca').d), 'catalan : « padri » trouve padrí');
ok(/célibataire/.test(first('spinster', 'en').d) && /fileuse/.test(first('spinster', 'en').d), 'anglais : spinster (et le piège « fileuse »)');
ok(/ouvrier agricole/.test(L.search('ag. lab', {lang: 'en'}).map(r => r.item.d).join(' ')), 'anglais : ag. lab. (recensement)');
ok(/Special Inquiry|audience/.test(L.search('S.I.', {lang: 'en'}).map(r => r.item.d + r.item.t).join(' ')), 'anglais : Ellis Island « S.I. »');
// — recherche en lettres latines —
ok(/paysan/.test(first('krestianin', 'ru').d), 'russe : « krestianin »');
ok(/paysan/.test(first('krestyanin', 'ru').d), 'russe : « krestyanin » (à l’anglaise)');
ok(/jeune fille/.test(first('devitsa', 'ru').d), 'russe : « devitsa » trouve дѣвица (ѣ = е)');
ok(/jeune fille/.test(first('девица', 'ru').d), 'russe : orthographe d’aujourd’hui trouve l’ancienne');
ok(/né/.test(first('narodyvsia', 'uk').d), 'ukrainien : « narodyvsia » (г = h, и = y)');
ok(/Tichri/.test(first('tichri', 'he').d) && /Tichri/.test(first('tishri', 'he').d), 'hébreu : « tichri », « tishri »');
ok(/ici est enterré/.test(first('po nikbar', 'he').d), 'hébreu : « po nikbar »');
ok(/ici est enterré/.test(first('פ"נ', 'he').d) && /ici est enterré/.test(first('פנ', 'he').d), 'hébreu : פ״נ tapé avec " ou sans signe');
ok(/faisceau de la vie/.test(first('תנצבה', 'he').d), 'hébreu : תנצב״ה sans signe');
ok(/mort/.test(first('geshtorbn', 'yi').d), 'yiddish : « geshtorbn » (YIVO)');
ok(/mort/.test(first('געשטארבן', 'yi').d), 'yiddish : sans les points');
ok(/grand-père/.test(first('zeyde', 'yi').d), 'yiddish : « zeyde »');
ok(/parrain/.test(first('knkahayr', 'hy').d), 'arménien : « knkahayr »');
ok(/défunt/.test(first('marhoum', 'ar').d), 'arabe : « marhoum »');
ok(/défunt/.test(first('المرحوم', 'ar').d), 'arabe : المرحوم');
ok(/Rajab/.test(first('rajab', 'ar').d), 'arabe : « rajab »');
ok(/Ahmed|fils/.test(L.search('ben', {lang: 'ar'}).map(r => r.item.d).join(' ')), 'arabe : « ben »');
ok(/Au nom de Dieu/.test(first('bismillah', 'ar').d), 'arabe : « bismillah »');
ok(/défunt/.test(first('الْمَرْحُوم', 'ar')?.d || first('المرحوم', 'ar').d), 'arabe : avec les voyelles');
// — translittération —
const T = (c, w) => L.langOf(c).translit(w);
ok(T('ru', 'Петръ').includes('petr') && T('ru', 'Ѳедоръ').includes('fedor') && T('ru', 'дѣвица').includes('devitsa'), 'russe : ъ final, ѳ, ѣ');
ok(T('ru', 'Щукин').includes('chtchoukin') && T('ru', 'Щукин').includes('shchukin'), 'russe : à la française et à l’anglaise');
ok(T('uk', 'Галина').includes('halyna') && T('uk', 'Галина').includes('galina'), 'ukrainien : Halyna (et Galina à la russe)');
ok(T('hy', 'Գրիգոր').includes('grigor') && T('hy', 'Գրիգոր').includes('krikor'), 'arménien : Grigor (oriental) et Krikor (occidental)');
ok(T('hy', 'Պետրոսեան').includes('bedrosian') && T('hy', 'Յակոբ').includes('hagop'), 'arménien : Bedrosian, Hagop');
ok(T('yi', 'מײַן').includes('mayn') && T('yi', 'ייִדיש').includes('yidish') && T('yi', 'ווילנע').includes('vilne'), 'yiddish : YIVO');
ok(T('ar', '١٣٢٠').includes('1320'), 'arabe : chiffres d’Orient');
// — nombres —
const N = c => L.langOf(c).numerals;
eq(N('ru').to(1812), '҂аѿв҃і', 'cyrillique : 1812'); eq(N('ru').from('в҃і'), 12, 'cyrillique : в҃і = 12 (11 à 19 : unité d’abord)');
eq(N('he').to(15), 'ט״ו', 'hébreu : 15 = ט״ו'); eq(N('he').to(16), 'ט״ז', 'hébreu : 16 = ט״ז'); eq(N('he').from('תרנ״ה'), 655, 'hébreu : תרנ״ה = 655');
eq(N('he').from('ה׳תש״ה'), 5705, 'hébreu : ה׳תש״ה = 5705'); eq(N('he').from('ט"ו'), 15, 'hébreu : guillemet ordinaire');
eq(N('hy').to(1915), 'ՌՋԺԵ', 'arménien : 1915'); eq(N('hy').from('ՌՄԾ'), 1250, 'arménien : ՌՄԾ = 1250');
eq(N('ar').to(1300), 'غش', 'abjad : 1300'); eq(N('ar').from('١٣٢٠'), 1320, 'chiffres d’Orient : ١٣٢٠'); eq(N('ar').from('xyz'), null, 'abjad : refus');
// — exercices corrigés en lettres latines —
const exo = id => L.search('', {kind: 'exercice'}).map(r => r.item).find(x => x.id === id);
{ const r = L.correct(exo('ru_um1902'), 'Marta 3 umerla 5 pogrebena krestianskaia vdova Ekaterina Ivanova 70 let ot starosti'); ok(r.score === 100, `russe en lettres latines : ${r.score} %`); }
{ const r = L.correct(exo('ru_um1902'), 'Марта 3 умерла 5 погребена крестьянская вдова Екатерина Иванова 70 лѣтъ отъ старости'); ok(r.score < 100 && r.words.some(w => w.st === 'faux' && /ѣ|ъ/.test(w.hint)), 'russe : « лѣтъ » recopié tel quel → l’explication (ѣ = е)'); }
{ const r = L.correct(exo('yi_zeyde1910'), 'mayn zeyde moyshe iz geboyrn in vilne in yor 1870 un iz geshtorbn in 1910'); ok(r.score === 100, `yiddish en lettres latines : ${r.score} %`); }
{ const r = L.correct(exo('he_tombe1895'), 'פ"נ האשה החשובה מרת שרה בת ר\' אברהם נפטרה 15 אדר 5655 תנצבה'); ok(r.score === 100, `hébreu avec chiffres et guillemets : ${r.score} %`); }
{ const r = L.correct(exo('hy_tombe1932'), 'ays e tapan grigori petrosiani 1875 1932 astouats hogin lousavore'); ok(r.score >= 85, `arménien en lettres latines : ${r.score} %`); }
{ const r = L.correct(exo('ar_tombe1902'), 'بسم الله الرحمن الرحيم هذا قبر المرحوم محمد بن احمد توفي 12 رجب سنه 1320 رحمه الله'); ok(r.score === 100, `arabe sans hamza, chiffres latins : ${r.score} %`); }
// — mots connus dans un texte (après « ✨ Lire l'acte ») —
if (typeof L.known === 'function') {
    ok(L.known('the said John was buried', 'en').some(e => /enterré/.test(e.item.d)), 'anglais : mots connus dans un texte');
    ok(L.known('крестьянинъ Петръ', 'ru').length >= 1, 'russe : mots connus dans un texte');
}
// — la transcription choisit la langue —
eq(L.langForOcr('por'), 'pt', 'transcription : por → pt'); eq(L.langForOcr('rus'), 'ru', 'rus → ru'); eq(L.langForOcr('heb'), 'he', 'heb → he'); eq(L.langForOcr('ara'), 'ar', 'ara → ar');
console.log(`✓ langues du lot A (Node) : ${n} vérifications`);

/* ═════════ 2. Navigateur ═════════ */
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
(async () => {
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); console.log(`✓ aide à la lecture, lot A : ${n} vérifications`); return; }
    const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(process.env.AIDE_LANGS_A_TMP || os.tmpdir(), 'carnet-aide-langues-a-'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Ivan','Sidorov','male')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
      if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); } }
    const port = Number(process.env.AIDE_LANGS_A_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const SHOTS = process.env.AIDE_LANGS_A_SHOTS || '';
    const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
    const browser = await pw.chromium.launch();
    const open = async (width, dark) => {
        const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light' });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        page.on('response', r => { if (r.status() === 404 && /aide-langues/.test(r.url())) errors.push('404 ' + r.url()); });
        await page.goto(base);
        await page.waitForFunction(codes => window.LCNDA_EXT?.readingAid && window.LCNDA_APP?.state?.csrf && codes.every(c => (window.LCNDA_AIDE_LANGS || []).some(l => l.code === c)), LOT);
        if (dark) await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        return { ctx, page, errors };
    };
    const typeQ = async (page, q) => { await page.fill('dialog[open] .la-search input', ''); await page.type('dialog[open] .la-search input', q); await page.waitForTimeout(350); };
    /** rien ne dépasse de la fenêtre ni de la page */
    const noOverflow = page => page.evaluate(() => {
        const d = document.querySelector('dialog[open]'); const bad = [];
        if (document.documentElement.scrollWidth > window.innerWidth + 1) bad.push('page');
        if (d) d.querySelectorAll('.la-row, .la-letter, .la-alpha-table, .la-exo, .la-num, .la-intro').forEach(el => { const r = el.getBoundingClientRect(), dr = d.getBoundingClientRect(); if (r.width && (r.right > dr.right + 1 || r.left < dr.left - 1)) bad.push(el.className); });
        return bad;
    });
    try {
        /* — 1440 px — */
        const { ctx, page, errors } = await open(1440, false);
        await page.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'dict'}));
        await page.waitForSelector('dialog[open] .la-langs');
        const more = await page.$('dialog[open] [data-la-langs-more][aria-expanded="false"]'); if (more) await more.click();
        for (const c of LOT) ok(await page.$(`dialog[open] [data-la-lang="${c}"]`), `pastille de langue « ${c} »`);
        // hébreu : lignes de droite à gauche
        await page.click('dialog[open] [data-la-lang="he"]'); await typeQ(page, 'nifter'); await page.waitForSelector('dialog[open] .la-row');
        ok(/décédé/.test(await page.textContent('dialog[open] .la-dict')), 'hébreu : « nifter » à l’écran');
        const heDir = await page.$eval('dialog[open] .la-row dt', el => [el.getAttribute('dir'), getComputedStyle(el).direction, el.getAttribute('lang')]);
        eq(heDir, ['rtl', 'rtl', 'he'], 'hébreu : dir="rtl" lang="he"');
        await shot(page, 'hebreu-1440');
        // nombres hébreux
        await typeQ(page, ''); await page.click('dialog[open] [data-la-tab="lettres"]'); await page.waitForSelector('dialog[open] [data-la-num-in]');
        await page.fill('dialog[open] [data-la-num-in]', 'תרנ״ה'); await page.waitForTimeout(100);
        ok(/655/.test(await page.textContent('dialog[open] [data-la-num-out]')), 'hébreu : תרנ״ה = 655 à l’écran');
        ok((await page.$$('dialog[open] .la-alpha-table tbody tr')).length === 22, 'hébreu : alphabet de 22 lettres');
        ok((await page.$$('dialog[open] .la-letter svg.la-glyph')).length >= 6, 'hébreu : lettres dessinées');
        await shot(page, 'hebreu-lettres-1440');
        // arabe : de droite à gauche, chiffres
        await page.click('dialog[open] [data-la-tab="dict"]'); await page.click('dialog[open] [data-la-lang="ar"]'); await typeQ(page, 'marhoum'); await page.waitForSelector('dialog[open] .la-row');
        eq(await page.$eval('dialog[open] .la-row dt', el => getComputedStyle(el).direction), 'rtl', 'arabe : de droite à gauche');
        await shot(page, 'arabe-1440');
        // russe : exercice corrigé
        await typeQ(page, ''); await page.click('dialog[open] [data-la-lang="ru"]'); await page.click('dialog[open] [data-la-tab="exos"]');
        await page.click('dialog[open] [data-la-exo="ru_um1902"]'); await page.waitForSelector('dialog[open] [data-la-answer]');
        await page.fill('dialog[open] [data-la-answer]', 'Марта 3 умерла 5 погребена крестьянская вдова Екатерина Иванова 70 лет от старости');
        await page.click('dialog[open] [data-la-correct]'); await page.waitForSelector('dialog[open] .la-words .la-w.is-ok');
        ok((await page.$$('dialog[open] .la-words .la-w.is-ok')).length === 13, 'russe : exercice corrigé (13 mots justes)');
        await shot(page, 'russe-exercice-1440');
        eq(await noOverflow(page), [], '1440 : rien ne dépasse');
        ok(!errors.length, 'sans erreur (1440) : ' + errors.join(' | '));
        await ctx.close();
        /* — 390 px — */
        { const { ctx: c2, page: p2, errors: e2 } = await open(390, false);
            for (const [lang, tab, q] of [['he', 'dict', ''], ['yi', 'dict', 'zeyde'], ['ar', 'lettres', ''], ['hy', 'lettres', ''], ['ru', 'lettres', ''], ['en', 'exos', ''], ['pt', 'dict', 'viuvo']]) {
                await p2.evaluate(o => window.LCNDA_EXT.readingAid.open(o), {tab, lang, q}); await p2.waitForSelector('dialog[open] .la-langs');
                await p2.waitForTimeout(150);
                eq(await noOverflow(p2), [], `390 : rien ne dépasse (${lang}, ${tab})`);
                await shot(p2, `${lang}-${tab}-390`);
                await p2.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            }
            ok(!e2.length, 'sans erreur (390) : ' + e2.join(' | ')); await c2.close(); }
        /* — sombre — */
        { const { ctx: c3, page: p3, errors: e3 } = await open(1440, true);
            await p3.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'lettres', lang: 'hy'})); await p3.waitForSelector('dialog[open] .la-alpha-table');
            ok((await p3.$$('dialog[open] .la-alpha-table tbody tr')).length === 38, 'arménien : alphabet de 38 lettres');
            await p3.fill('dialog[open] [data-la-num-in]', '1915'); await p3.waitForTimeout(100);
            ok(/ՌՋԺԵ/.test(await p3.textContent('dialog[open] [data-la-num-out]')), 'arménien : 1915 = ՌՋԺԵ');
            const col = await p3.$eval('dialog[open] .la-letter-draw', el => getComputedStyle(el).color); ok(col !== 'rgb(74, 50, 24)', `sombre : trait éclairci (${col})`);
            await shot(p3, 'armenien-sombre');
            await p3.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p3.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'lettres', lang: 'ru'})); await p3.waitForSelector('dialog[open] .la-letter');
            ok(/yat/.test(await p3.textContent('dialog[open] .la-letters')), 'sombre : lettres russes (yat)');
            await shot(p3, 'russe-lettres-sombre');
            await p3.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p3.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'dict', lang: 'yi', q: 'geshtorbn'})); await p3.waitForSelector('dialog[open] .la-row');
            eq(await p3.$eval('dialog[open] .la-row dt', el => getComputedStyle(el).direction), 'rtl', 'yiddish : de droite à gauche');
            await shot(p3, 'yiddish-sombre');
            ok(!e3.length, 'sans erreur (sombre) : ' + e3.join(' | ')); await c3.close(); }
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`✓ aide à la lecture, lot A : ${n} vérifications`);
})().catch(e => { console.error(e); process.exit(1); });
