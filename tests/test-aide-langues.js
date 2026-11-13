'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📜 Aide à la lecture : les langues des actes (une langue = un fichier assets/js/aide-langues/<code>.js).   node tests/test-aide-langues.js
 *  1. Node : chaque fichier du dossier (format README-format.md) ; latin, grec, allemand, italien, espagnol, polonais, néerlandais complets
 *     (mots, mois, nombres, métiers, parenté, formules, exercice corrigé à 100 %) ; recherche sans accents et avec ł, ß, ñ, grec ;
 *     filtre langue ; nombres grecs ; mots connus dans un texte ; transcription → langue.
 *  2. Navigateur (Playwright ; sinon sauté), base neuve, 1440 px, 390 px et sombre : pastilles « Langue » avec le nombre,
 *     « malzonkowie », grec (alphabet, nombres), exercice allemand, la transcription en allemand ouvre l'aide en allemand,
 *     « 🧭 Repérer » montre les mots connus, sans erreur de page. AIDE_LANGS_SHOTS=dossier pour garder les captures.
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
const dir = path.join(appRoot, 'assets/js/aide-langues');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
const MINE = ['la', 'grc', 'de', 'it', 'es', 'pl', 'nl'];
const KINDS = ['mot', 'mois', 'nombre', 'metier', 'parente', 'formule', 'abrev'], ACTES = ['bapteme', 'mariage', 'deces', 'sepulture', 'general', 'recensement'];
ok(fs.existsSync(path.join(dir, 'README-format.md')), 'le format est décrit');
const index = fs.readFileSync(path.join(appRoot, 'index.php'), 'utf8');
const codes = new Set(), waiting = [];
for (const f of files) {
    const d = require(path.join(dir, f)), where = `aide-langues/${f}`;
    ok(d && /^[a-z0-9_-]{2,8}$/.test(d.code) && !codes.has(d.code), `${where} : code unique`); codes.add(d.code);
    // une langue pas encore branchée dans index.php (en cours d'écriture) : seulement signalée
    if (!MINE.includes(d.code) && !index.includes(`assets/js/aide-langues/${f}?v=`)) { waiting.push(f); continue; }
    ok(d.name && /^(latine|cyrillique|grecque|hebraique|hébraïque|armenienne|arménienne|arabe|georgienne|géorgienne)$/.test(d.script) && /^(ltr|rtl)$/.test(d.dir), `${where} : nom, écriture, sens`);
    ok(index.includes(`assets/js/aide-langues/${f}?v=`), `${where} : chargé par index.php`);
    ok(Array.isArray(d.entries) && d.entries.length > 0 && d.entries.every(e => e.t && e.d && KINDS.includes(e.k) && ACTES.includes(e.a || 'general')), `${where} : mots au bon format`);
    ok(!/[<>]/.test(JSON.stringify(d.entries)), `${where} : texte sans HTML`);
    const G = L.glyphs().g;
    ok((d.letters || []).every(l => [].concat(l.seen || [], l.cmp || []).every(id => G[id])), `${where} : chaque lettre a ses dessins`);
    for (const x of d.exercises || []) {
        const X = L.EXERCISES.find(e => e.id === x.id); ok(X && X.lang === d.code, `${where} : exercice ${x.id} chargé`);
        eq(L.correct(X, L.parseExercise(X).answer).score, 100, `${where} : ${x.id} corrigé à 100 % avec la solution`);
        ok(x.year < 1950 && !/\b(19[5-9]\d|20\d\d)\b/.test(x.src), `${where} : ${x.id} ancien`);
    }
    ok((d.sources || []).length && d.sources.every(s => s.label && (!s.url || /^https:\/\//.test(s.url))), `${where} : sources citées`);
}
for (const c of MINE) {
    const d = L.langOf(c); ok(d, `langue ${c} chargée`);
    const list = L.search('', {lang: c}).filter(r => r.type === 'entry').map(r => r.item);
    for (const k of ['mot', 'mois', 'nombre', 'metier', 'parente', 'formule']) ok(list.filter(e => e.k === k).length >= (k === 'formule' ? 2 : 5), `${c} : ${k}`);
    for (const a of ['bapteme', 'mariage', 'sepulture']) ok(list.some(e => e.a === a && e.k === 'mot'), `${c} : mots du ${a}`);
    ok(list.length >= 120, `${c} : au moins 120 mots (${list.length})`);
    ok(L.EXERCISES.filter(x => x.lang === c).length >= 1, `${c} : un exercice`);
}
ok(L.EXERCISES.filter(x => x.lang === 'la').length >= 3, 'latin : trois exercices');
ok(L.EXERCISES.filter(x => x.lang === 'grc').length >= 2 && L.EXERCISES.filter(x => x.lang === 'de').length >= 2, 'grec et allemand : deux exercices');
// — recherche : sans accents, lettres spéciales, grec —
const top = (q, o) => (L.search(q, o).find(r => r.type === 'entry') || {}).item || {};
eq(top('malzonkowie').t, 'małżonkowie', '« malzonkowie » trouve « małżonkowie »');
ok(/Großvater/.test(top('grossvater').t) && /Großvater/.test(top('großvater').t), 'ß = ss');
ok(/Jänner/.test(top('janner').t), 'ä sans tréma');
ok(/legítimo/.test(top('legitimo', {lang: 'es'}).t), 'espagnol sans accent');
for (const q of ['huios', 'yios', 'υιος', 'υἱός', 'ΥΙΟΣ']) eq(top(q).t, 'υἱός', `grec : « ${q} » trouve υἱός`);
ok(/ἐβαπτίσθη/.test(top('ebaptisthe').t) && /ἐβαπτίσθη/.test(top('εβαπτισθη').t), 'grec : en lettres latines ou sans accents');
ok(/χήρα/.test(top('chera', {lang: 'grc'}).t), 'grec : χήρα');
ok(/filius/.test(top('filii').t) && /uxor/.test(top('uxoris').t) && /vidua/.test(top('viduam').t), 'latin : formes déclinées');
ok(/Septembris/.test(top('7bris').t) && /Decembris/.test(top('xbris').t), 'latin : mois abrégés');
// — filtre langue —
const de = L.search('', {lang: 'de'}); ok(de.length && de.every(r => r.item.lang === 'de' || r.type === 'letter' && r.item.lang === 'fr'), 'filtre langue : allemand seulement (+ lettres communes)');
const lc = L.langCounts(''); ok(MINE.every(c => lc[c] > 0) && lc.all === L.search('').filter(r => r.type === 'entry').length, 'nombres par langue');
eq(L.counts('', '', 'la').latin, L.search('', {lang: 'la'}).filter(r => r.type === 'entry').length, 'latin compté');
ok(L.search('', {kind: 'latin'}).every(r => r.item.lang === 'la' || r.type === 'letter'), 'ancienne sorte « latin » = la langue latine');
// — la langue de la transcription —
eq(['deu', 'lat', 'fra+lat', 'grc', 'ell', 'pol', 'nld', 'spa', 'ita', 'fra'].map(L.langForOcr), ['de', 'la', 'la', 'grc', 'grc', 'pl', 'nl', 'es', 'it', ''], 'langue de la transcription → langue de l’aide');
// — nombres grecs —
const N = L.langOf('grc').numerals;
eq([N.to(1), N.to(6), N.to(16), N.to(90), N.to(999), N.to(1852), N.to(1870)], ['αʹ', 'ϛʹ', 'ιϛʹ', 'ϟʹ', 'ϡϟθʹ', '͵αωνβʹ', '͵αωοʹ'], 'nombres → lettres grecques');
eq([N.from('͵αωνβʹ'), N.from('αωνβ΄'.replace('α', '͵α')), N.from('ιστ'), N.from('ρκγ'), N.from('abc')], [1852, 1852, 16, 123, null], 'lettres grecques → nombres');
for (let i = 1; i <= 9999; i += 7) { if (N.from(N.to(i)) !== i) assert.fail(`aller-retour ${i}`); } n++;
// — mots connus dans un texte (après « ✨ Lire l'acte ») —
const kw = L.known('Im Jahre Christi 1823 ist geboren und getauft worden Johann ehelicher Sohn des Michael Weber Wittwe', 'de').map(k => k.word);
ok(['getauft', 'ehelicher', 'Sohn', 'Wittwe'].every(w => kw.includes(w)), `mots connus allemands : ${kw.join(', ')}`);
ok(L.known('Działo się we wsi … małżonki', 'pl').some(k => k.word === 'Działo się'), 'mots connus : expression de deux mots');
eq(L.known('getauft', ''), [], 'sans langue : rien');
// — exercices : explications et lettres latines pour le grec —
const xd = L.EXERCISES.find(x => x.id === 'de_taufe1823'), rd = L.correct(xd, 'Im Jahre Christi 1823 den 14ten Februar');
ok(rd.words.find(w => w.shown === 'Hornung')?.st === 'ok', 'Hornung lu « Februar » : accepté');
const rd2 = L.correct(xd, 'Im Jahre Christi 1823 den 14ten Horn'); ok(/février/.test(rd2.words.find(w => w.shown === 'Hornung')?.hint || ''), 'mot à revoir : l’explication de la langue');
const xg = L.EXERCISES.find(x => x.id === 'grc_bapt1852');
ok(L.correct(xg, 'En etei soteirio 1852 meni Martiou 15 ebaptisthe').words.filter(w => w.st === 'ok').length >= 6, 'grec : lecture en lettres latines acceptée');
ok(L.correct(xg, 'Εν ετει σωτηριω αωνβ μηνι Μαρτιου ιε εβαπτισθη').ok >= 7, 'grec : sans accents, nombres en lettres acceptés');
// — dessins : seulement des traits —
ok(L.LETTERS.every(l => /<svg[^>]*class="la-glyph"/.test(L.glyphSvg(l.seen)) && !/https?:|<image|xlink|on\w+=/.test(L.glyphSvg(l.seen) + L.glyphSvg(l.cmp))), 'dessins SVG maison, sans image ni script');
console.log(`✓ langues (Node) : ${n} vérifications${waiting.length ? ` · pas encore chargés par index.php (non vérifiés) : ${waiting.join(', ')}` : ''}`);

/* ═════════ 2. Navigateur ═════════ */
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
(async () => {
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); console.log(`✓ aide à la lecture, langues : ${n} vérifications`); return; }
    const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-aide-langues-'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Johann','Weber','male')"); $p = null;
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
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.readingAid && window.LCNDA_EXT?.openDialog && window.LCNDA_APP?.state?.csrf && (window.LCNDA_AIDE_LANGS || []).length >= 7);
        if (dark) await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        return { ctx, page, errors };
    };
    const typeQ = async (page, q) => { await page.fill('dialog[open] .la-search input', ''); await page.type('dialog[open] .la-search input', q); await page.waitForTimeout(350); };
    try {
        /* — 1440 px — */
        const { ctx, page, errors } = await open(1440, false);
        await page.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'dict'}));
        await page.waitForSelector('dialog[open] .la-langs');
        const pills = await page.textContent('dialog[open] .la-langs'); if (process.env.AIDE_DEBUG) console.log(pills);
        ok(['Latin', 'Grec', 'Allemand', 'Italien', 'Espagnol', 'Polonais', 'Néerlandais'].every(x => new RegExp(`${x} \\(\\d+\\)`).test(pills)) && /Toutes les langues \([\d\s\u202f\u00a0]+\)/.test(pills), 'pastilles « Langue » avec le nombre');
        if (await page.$('dialog[open] [data-la-langs-more]')) { const before = (await page.$$('dialog[open] [data-la-lang]')).length; await page.click('dialog[open] [data-la-langs-more]'); ok((await page.$$('dialog[open] [data-la-lang]')).length > before, '« ＋ N autres langues » déplie la liste'); await page.click('dialog[open] [data-la-langs-more]'); }
        await page.click('dialog[open] [data-la-lang="pl"]'); await typeQ(page, 'malzonkowie');
        ok(/małżonkowie/.test(await page.textContent('dialog[open] .la-dict')), 'navigateur : « malzonkowie » → małżonkowie');
        ok(await page.$('dialog[open] .la-row mark') !== null, 'lettres surlignées malgré ł et ż');
        ok(await page.$eval('dialog[open] [data-la-lang="pl"]', b => b.classList.contains('is-active')), 'pastille Polonais active');
        ok(/Sources/.test(await page.textContent('dialog[open] .la-body')), 'sources sous la liste');
        await shot(page, 'langues-polonais-1440');
        // grec : alphabet, nombres
        await typeQ(page, ''); await page.click('dialog[open] [data-la-lang="grc"]'); await page.click('dialog[open] [data-la-tab="lettres"]');
        await page.waitForSelector('dialog[open] .la-alpha-table'); ok((await page.$$('dialog[open] .la-alpha-table tbody tr')).length >= 24, 'grec : l’alphabet');
        ok((await page.$$('dialog[open] .la-letter svg.la-glyph')).length >= 8, 'grec : lettres dessinées');
        await page.fill('dialog[open] [data-la-num-in]', '͵αωνβʹ'); await page.waitForTimeout(100);
        ok(/1\s?852/.test(await page.textContent('dialog[open] [data-la-num-out]')), 'grec : ͵αωνβʹ = 1852');
        await page.fill('dialog[open] [data-la-num-in]', '1870'); ok(/͵αωοʹ/.test(await page.textContent('dialog[open] [data-la-num-out]')), 'grec : 1870 = ͵αωοʹ');
        await shot(page, 'langues-grec-lettres-1440');
        await page.click('dialog[open] [data-la-tab="dict"]'); await typeQ(page, 'huios');
        ok(/υἱός/.test(await page.textContent('dialog[open] .la-dict')), 'grec : « huios » trouve υἱός');
        // allemand : exercice
        await typeQ(page, ''); await page.click('dialog[open] [data-la-lang="de"]'); await page.click('dialog[open] [data-la-tab="exos"]');
        await page.click('dialog[open] [data-la-exo="de_taufe1823"]');
        ok(await page.$eval('dialog[open] .la-old', el => el.getAttribute('lang')) === 'de', 'exercice : texte en allemand (lang="de")');
        await page.fill('dialog[open] [data-la-answer]', 'Im Jahre Christi 1823 den 14ten Hornung ist geboren und den 15ten getauft worden Johann Georg ehelicher Sohn des Michael Weber Bauer allhier und der Anna Maria geb. Schmidt');
        await page.click('dialog[open] [data-la-correct]'); await page.waitForSelector('dialog[open] .la-words .la-w.is-ok');
        ok((await page.$$('dialog[open] .la-words .la-w.is-ok')).length >= 25, 'exercice allemand corrigé');
        await shot(page, 'langues-exercice-allemand-1440');
        await page.click('dialog[open] .modal-actions [type=submit]');
        // transcription d'actes en allemand → l'aide s'ouvre en allemand, et « 🧭 Repérer » montre les mots connus
        await page.evaluate(() => window.LCNDA_EXT.openActTranscriber({text: 'ist getauft worden Johann ehelicher Sohn des Michael Weber Wittwe'}));
        await page.waitForSelector('[data-tx-cmd="aide"]'); await page.waitForTimeout(400); await page.evaluate(() => document.querySelectorAll('dialog.mpk-dialog[open]').forEach(d => d.close()));
        await page.selectOption('[data-tx-lang]', 'deu');
        await page.evaluate(() => { const a = document.querySelector('[data-tx-body]'); a.value = 'ist getauft worden Johann ehelicher Sohn des Michael Weber Wittwe'; a.dispatchEvent(new Event('input', {bubbles: true})); a.setSelectionRange(4, 11); });
        await page.click('[data-tx-cmd="aide"]'); await page.waitForSelector('.la-dialog .la-row').catch(async e => { await shot(page, 'debug-tx'); console.log(errors, await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(d => d.className + ' ' + d.textContent.slice(0, 200)))); throw e; });
        ok(await page.$eval('.la-dialog [data-la-lang="de"]', b => b.classList.contains('is-active')), 'transcription en allemand : l’aide s’ouvre en allemand');
        ok(/baptisé/.test(await page.textContent('.la-dialog .la-dict')), 'transcription : « getauft » cherché');
        await shot(page, 'langues-depuis-transcription-1440');
        await page.click('.la-dialog .modal-actions [type=submit]');
        await page.click('[data-tx-cmd="detect"]'); await page.waitForSelector('.h-tx-chip.is-word', {timeout: 5000});
        ok(/getauft/.test(await page.textContent('[data-tx-found]')) && /veuve/.test(await page.textContent('[data-tx-found]')), '« 🧭 Repérer » : les mots connus en allemand');
        ok(await page.evaluate(() => localStorage.getItem('genealogie-tx-lang')) === 'deu', 'la langue du texte est retenue');
        await shot(page, 'langues-transcription-mots-1440');
        ok(!errors.length, 'sans erreur (1440) : ' + errors.join(' | '));
        await ctx.close();
        /* — 390 px — */
        { const { ctx: c2, page: p2, errors: e2 } = await open(390, false);
            await p2.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'dict', lang: 'it', q: 'vedova'})); await p2.waitForSelector('dialog[open] .la-row');
            ok(/veuve/.test(await p2.textContent('dialog[open] .la-dict')), '390 : italien « vedova »');
            ok(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '390 : pas de défilement de côté');
            await shot(p2, 'langues-italien-390');
            await p2.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'lettres', lang: 'grc'})); await p2.waitForSelector('dialog[open] .la-alpha-table');
            await shot(p2, 'langues-grec-390');
            ok(!e2.length, 'sans erreur (390) : ' + e2.join(' | ')); await c2.close(); }
        /* — sombre — */
        { const { ctx: c3, page: p3, errors: e3 } = await open(1440, true);
            await p3.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'lettres', lang: 'de'})); await p3.waitForSelector('dialog[open] .la-letter');
            ok(/Kurrent/.test(await p3.textContent('dialog[open] .la-letters')), 'sombre : lettres Kurrent');
            const col = await p3.$eval('dialog[open] .la-letter-draw', el => getComputedStyle(el).color); ok(col !== 'rgb(74, 50, 24)', `sombre : trait éclairci (${col})`);
            await shot(p3, 'langues-kurrent-sombre');
            await p3.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'dict', lang: 'es'})); await p3.waitForSelector('dialog[open] .la-intro');
            await shot(p3, 'langues-espagnol-sombre');
            ok(!e3.length, 'sans erreur (sombre) : ' + e3.join(' | ')); await c3.close(); }
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`✓ aide à la lecture, langues : ${n} vérifications`);
})().catch(e => { console.error(e); process.exit(1); });
