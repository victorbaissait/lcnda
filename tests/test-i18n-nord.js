'use strict';
/* 🌐 Les trois langues ajoutées ensuite : tchèque (cs), suédois (sv), danois (da). Mode d'emploi : docs/I18N.md (« Ajouter une langue »).
 *     node tests/test-i18n-nord.js            (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20650 par défaut)
 * 1. Node : les 13 langues déclarées partout (sk, nb : test-i18n-nord2.js) (app-i18n.js, lib/i18n.php, scripts) ; fichiers assets/i18n/src/nord/*.tsv fusionnés ;
 *    une clé absente en cs / sv / da = avertissement compté (--strict-new : erreur), une variable ou un pluriel faux = erreur ;
 *    les zones de base (cadre, composants, colonnes, premier, touches) traduites en entier ; pluriels tchèques (1 / 2 à 4 / 5 et plus) ;
 *    repli sur le français ; le français ne change pas ; scripts/i18n-todo.js ; FAQ (build-faq-i18n.js) ; serveur (lib/i18n.php).
 * 2. Navigateur (Playwright, sinon sauté) : premier lancement en tchèque ; choisir cs / sv / da dans Réglages → Apparence ; le cadre
 *    traduit sur le tableau de bord (menus, colonne de gauche, en-tête, titres des widgets) ; bandeau IA ; pluriels ; tchèque à 390 px
 *    sans débordement ; français inchangé ; aucune erreur JS.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const NEW = ['cs', 'sv', 'da'];
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches'];

(async () => {
    /* ═════ 1. Node ═════ */
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    await t('13 langues déclarées partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES, ['fr', 'en', 'es', 'de', 'it', 'pt', 'pl', 'nl', 'cs', 'sv', 'da', 'sk', 'nb']);
        assert.deepEqual(NEW.map(c => [I.info(c).name, I.info(c).flag, I.info(c).locale]), [['Čeština', '🇨🇿', 'cs-CZ'], ['Svenska', '🇸🇪', 'sv-SE'], ['Dansk', '🇩🇰', 'da-DK']]);
        assert.ok(/const I18N_LANGS = \['fr', 'en', 'es', 'de', 'it', 'pt', 'pl', 'nl', 'cs', 'sv', 'da', 'sk', 'nb'\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(0, 3), NEW); assert.deepEqual(B.LANGS, [...B.CORE, ...B.NEW_LANGS]); assert.deepEqual(B.FORMS.cs, ['one', 'few', 'many']);
        const F = require('../scripts/build-faq-i18n.js');
        assert.deepEqual(F.NEW_LANGS.slice(0, 3), NEW); assert.equal(F.LANGS.length, 7, 'les 7 langues traduites en entier restent à part (test-i18n-faq)');
        for (const c of NEW) {
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.equal(j._meta.lang, c); assert.equal(j._meta.ai, true); assert.equal(j._meta.name, I.info(c).name);
            const fq = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/faq/${c}.json`), 'utf8'));
            assert.equal(fq._meta.lang, c); assert.equal(fq._meta.version, F.VERSION);
        }
        assert.ok(fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8').includes(`const FAQ_I18N_V = ${F.VERSION};`));
        const sel = I.selectHtml(); assert.ok(/Čeština \(CS\)/.test(sel) && /Svenska \(SV\)/.test(sel) && /Dansk \(DA\)/.test(sel));
    });
    await t('i18n-check : 0 erreur, les textes encore sans traduction comptés (avertissement), --strict-new en fait des erreurs', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        for (const c of NEW) assert.ok(new RegExp(`(⚠️ ${c} : \\d+ textes encore sans traduction)|(✓ ${c} : tout est traduit)`).test(r.stdout), `${c} compté`);
        const {check} = require('../scripts/i18n-check.js'); const c = check();
        assert.deepEqual(c.errors, []);
        if (NEW.some(l => c.missingNew[l].length)) {
            const s = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js'), '--strict-new', '--lang', 'cs'], {encoding: 'utf8', maxBuffer: 64 << 20});
            assert.equal(s.status, c.missingNew.cs.length ? 1 : 0, 'strict : une clé absente en cs devient une erreur');
        }
    });
    await t('nord/<zone>.tsv : fusionné par clé ; variable ou pluriel faux = erreur ; clé inconnue = avertissement', () => {
        const {check} = require('../scripts/i18n-check.js');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-nord-'));
        fs.mkdirSync(path.join(tmp, 'nord'));
        fs.writeFileSync(path.join(tmp, 'z.tsv'), 'fr ¦ en ¦ es ¦ de ¦ it ¦ pt ¦ pl ¦ nl\nBonjour {name} ¦ Hello {name} ¦ Hola {name} ¦ Hallo {name} ¦ Ciao {name} ¦ Olá {name} ¦ Cześć {name} ¦ Hallo {name}\n=chat ¦ cat|cats ¦ gato|gatos ¦ Katze|Katzen ¦ gatto|gatti ¦ gato|gatos ¦ kot|koty|kotów ¦ kat|katten\nonglet|Fiche ¦ Record ¦ Ficha ¦ Eintrag ¦ Scheda ¦ Ficha ¦ Karta ¦ Profiel\n');
        fs.writeFileSync(path.join(tmp, 'nord', 'z.tsv'), 'fr ¦ cs ¦ sv ¦ da\nBonjour {name} ¦ Ahoj {name} ¦ Hej {nom} ¦ Hej {name}\n=chat ¦ kočka|kočky ¦ katt|katter ¦ kat|katte\nPas dans le français ¦ x ¦ y ¦ z\n');
        const r = check({src: tmp});
        assert.ok(r.errors.some(e => /\[sv\] variables différentes/.test(e) && /nord\/z\.tsv:2/.test(e)), r.errors.join('\n'));
        assert.ok(r.errors.some(e => /\[cs\] pluriel incomplet \(2\/3/.test(e)), 'cs : 3 formes');
        assert.ok(!r.errors.some(e => /\[(da)\]/.test(e)), 'da juste');
        assert.ok(r.warns.some(w => /Pas dans le français/.test(w)), 'clé inconnue signalée');
        assert.deepEqual(r.missingNew.cs.map(x => x.replace(/^.*« /, '')), ['onglet|Fiche »'], 'onglet|Fiche manque en cs : avertissement, pas erreur');
        assert.ok(!r.errors.some(e => /onglet\|Fiche/.test(e)));
        assert.ok(check({src: tmp, strictNew: true}).errors.some(e => /\[cs\] manque : « onglet\|Fiche »/.test(e)));
        const rows = B.readSources({src: tmp}); const bj = rows.find(x => x.key === 'Bonjour {name}');
        assert.equal(bj.vals.en, 'Hello {name}'); assert.equal(bj.vals.cs, 'Ahoj {name}'); assert.equal(bj.vals.da, 'Hej {name}');
        fs.rmSync(tmp, {recursive: true, force: true});
    });
    await t('les zones de base sont traduites en entier en cs, sv, da (scripts/i18n-todo.js)', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) { const r = todo('cs,sv,da', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.ok(r.total > 0); }
        const all = todo('cs', 'all'); assert.ok(all.zones.find(z => z.zone === 'cadre').missing === 0);
        const out = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-todo.js'), 'cs', 'reglages', '--limit', '3'], {encoding: 'utf8'});
        assert.equal(out.status, 0, out.stderr);
        const lines = out.stdout.split('\n').filter(l => l && !l.startsWith('#'));
        if (todo('cs', 'reglages').items.length) { assert.equal(lines.length, 3); assert.ok(lines.every(l => l.split('\t').length === 3), 'clé ⇥ en ⇥ de'); }
        const bad = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-todo.js'), 'xx', 'cadre'], {encoding: 'utf8'});
        assert.equal(bad.status, 1);
    });
    await t('t() en cs, sv, da : traduit, repli sur le français, variables, contexte, bandeau IA', () => {
        const want = {cs: ['Uložit', 'Nastavení', 'Nahlásit chybu'], sv: ['Spara', 'Inställningar', 'Rapportera ett fel'], da: ['Gem', 'Indstillinger', 'Rapportér en fejl']};
        for (const l of NEW) {
            I.setLang(l, {persist: false});
            assert.equal(I.lang, l);
            assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur')], want[l]);
            assert.ok(/AI/.test(I.t(I.AI_NOTE)) && I.t(I.AI_NOTE) !== I.AI_NOTE, `${l} : bandeau`);
            assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas', `${l} : repli`);
            const s = I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}); assert.ok(s.includes('Ma vue') && !s.includes('{') && s !== 'Réglages gardés sous « Ma vue ».');
            assert.equal(I.t('Maj', {ctx: 'touche'}), {cs: 'Shift', sv: 'Skift', da: 'Skift'}[l]);
            assert.equal(I.translateText('＋ Ajouter une personne…'), {cs: '＋ Přidat osobu…', sv: '＋ Lägg till en person…', da: '＋ Tilføj en person…'}[l]);
        }
        I.setLang('fr', {persist: false});
    });
    await t('pluriels : tchèque 1 / 2 à 4 / 5 et plus (comme le polonais), suédois et danois à deux formes ; nombres', () => {
        I.setLang('cs', {persist: false});
        const cs = [[1, '1 osoba'], [2, '2 osoby'], [4, '4 osoby'], [5, '5 osob'], [0, '0 osob'], [11, '11 osob'], [22, '22 osob'], [101, '101 osob']];
        for (const [n, s] of cs) assert.equal(I.plural(n, 'personne'), s, `cs ${n}`);
        assert.equal(I.plural(1.5, 'personne'), '1,5 osoby', 'cs : « many » (1,5) = la forme « 2 à 4 »');
        assert.equal(I.plural(3, 'animal', 'animaux'), '3 zvířata'); assert.equal(I.plural(7, 'animal', 'animaux'), '7 zvířat');
        assert.equal(I.fmtNumber(1234.5).replace(/\s/g, ' '), '1 234,5');
        I.setLang('sv', {persist: false}); assert.equal(I.plural(1, 'personne'), '1 person'); assert.equal(I.plural(3, 'personne'), '3 personer'); assert.equal(I.plural(0, 'personne'), '0 personer');
        I.setLang('da', {persist: false}); assert.equal(I.plural(1, 'personne'), '1 person'); assert.equal(I.plural(3, 'animal', 'animaux'), '3 dyr'); assert.equal(I.fmtNumber(1234.5), '1.234,5');
        const j = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/cs.json'), 'utf8'));
        assert.deepEqual(j.personne, {one: 'osoba', few: 'osoby', many: 'osoby', other: 'osob'});
        I.setLang('fr', {persist: false});
    });
    await t('le français ne change pas', () => {
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes'); assert.equal(I.plural(1, 'personne'), '1 personne');
        assert.equal(I.translateText('Tableau de bord'), null);
    });
    const phpPath = findPhp([devBundledPhp()]);
    if (phpPath) await t('serveur (lib/i18n.php) : en-tête cs / sv / da reconnu, traduction ou repli sur le français', () => {
        const run = lang => JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$_SERVER['HTTP_X_LCNDA_LANG']=${JSON.stringify(lang)}; require 'lib/i18n.php'; echo json_encode([i18n_lang(), i18n_t('Enregistrer'), i18n_t('Un texte inconnu {x}', ['x' => 3]), i18n_t('personne', ['n' => 5])], JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8'}).stdout);
        assert.deepEqual(run('cs'), ['cs', 'Uložit', 'Un texte inconnu 3', 'osob']);
        assert.deepEqual(run('sv').slice(0, 2), ['sv', 'Spara']); assert.deepEqual(run('da').slice(0, 2), ['da', 'Gem']);
        assert.deepEqual(run('fr'), ['fr', 'Enregistrer', 'Un texte inconnu 3', 'personne']);
    });

    /* ═════ 2. Navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} cs, sv, da : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
    // les clés des zones de base : un texte français resté à l'écran qui en vient est une faute (les autres zones se traduisent ensuite)
    const BASE_KEYS = new Set(B.readSources().filter(r => BASE_ZONES.includes(r.file.replace(/\.tsv$/, ''))).map(r => norm(r.key.replace(/^[a-z0-9-]+\|/, ''))));
    const LEAD = /^[\s\p{Extended_Pictographic}\p{So}\p{Sm}️‍⃣·•]+/u, TRAIL = /[\s…:▾▸→↗]+$/u;
    const ofBase = s => { const f = norm(s), rest = f.replace(LEAD, ''), core = rest.replace(TRAIL, ''); return BASE_KEYS.has(f) || BASE_KEYS.has(rest) || BASE_KEYS.has(core); };
    const shots = process.env.I18N_SHOTS || '';
    const work = process.env.I18N_TMP || os.tmpdir();
    const tmp = fs.mkdtempSync(path.join(work, 'carnet-i18n-nord-')), tmpEmpty = fs.mkdtempSync(path.join(work, 'carnet-i18n-nord-vide-'));
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.mkdirSync(path.join(tmpEmpty, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living'),('Louis','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20650, base = `http://127.0.0.1:${port}/`;
    let proc = null;
    // un seul port : d'abord la base vide (premier lancement), puis la base remplie
    const serve = async dir => {
        if (proc) { proc.kill(); await new Promise(res => setTimeout(res, 400)); }
        proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(dir), stdio: 'ignore'});
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); return; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    };
    const browser = await chromium.launch();
    const errs = [];
    const watch = (page, tag) => { page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss()); };
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { try { if (l && !sessionStorage.getItem('i18n-test-set')) { localStorage.setItem('lcnda-langue', l); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage(); watch(page, `${lang || 'fr'} ${w}px`);
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1500);
        return page;
    };
    const go = (page, kind, id) => page.evaluate(async ([kind, id]) => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close());
        if (kind === 'list') { A.state.listType = id; await A.setModule('listes'); } else if (kind === 'maint') { A.state.maintenanceTab = id; await A.setModule('maintenance'); } else await A.setModule(id); }, [kind, id]);
    const ZONES = ['.topbar', '#sidebar .sidebar-top', '#sidebar-content', '#sidebar-footer', '#workspace .page-header', '.ui-listbar', '.dashboard-widget > header', '.dashboard-widget .widget-head', '.dashboard-widget h3', '#lc-i18n-banner'];
    const frameTexts = page => page.evaluate(Z => {
        const out = new Set();
        Z.forEach(z => document.querySelectorAll(z).forEach(el => { const tw = document.createTreeWalker(el, 5); let n = el; do { if (n.nodeType === 1) { if (n.closest('[data-i18n-off], script, style, textarea, select')) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
            else if (n.nodeType === 3 && !n.parentElement.closest('[data-i18n-off], script, style, textarea, select, [data-person-id], .person-name, tbody')) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); } } while ((n = tw.nextNode())); }));
        return [...out];
    }, ZONES);
    try {
        await serve(tmpEmpty);
        await t('premier lancement : le menu propose cs, sv, da ; l’écran passe en tchèque tout de suite', async () => {
            const page = await open();
            const opts = await page.$$eval('#install-screen select[data-lc-lang-pick] option', o => o.map(x => x.value));
            assert.deepEqual(opts.slice(8, 11), NEW); assert.equal(opts.length, 13);
            await page.selectOption('#install-screen select[data-lc-lang-pick]', 'cs'); await page.waitForTimeout(600);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, txt: document.querySelector('#install-screen').innerText}));
            assert.equal(r.lang, 'cs'); assert.ok(/Je potřeba importovat genealogickou databázi/.test(r.txt) && /Vytvořit první osobu/.test(r.txt), r.txt.slice(0, 300));
            if (shots) await page.screenshot({path: path.join(shots, 'i18n-cs-premier-lancement.png')});
            await page.selectOption('#install-screen select[data-lc-lang-pick]', 'fr'); await page.waitForTimeout(400);
            assert.ok(/La base généalogique doit être importée/.test(await page.locator('#install-screen').innerText()), 'retour au français');
            await page.context().close();
        });
        await serve(tmp);
        await t('Réglages → Apparence : 13 langues ; choisir le suédois, puis ↶ Annuler remet le français', async () => {
            const page = await open();
            await go(page, 'maint', 'look_theme'); await page.waitForTimeout(1200);
            const nav0 = await page.evaluate(() => document.querySelector('.main-nav').innerText);
            const opts = await page.$$eval('select[data-lc-lang] option', o => o.map(x => x.value + ':' + x.textContent));
            assert.equal(opts.length, 13); assert.ok(opts.some(o => /^cs:.*Čeština/.test(o)) && opts.some(o => /^sv:.*Svenska/.test(o)) && opts.some(o => /^da:.*Dansk/.test(o)));
            await page.selectOption('select[data-lc-lang]', 'sv'); await page.waitForTimeout(1200);
            const sv = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav').innerText, banner: document.getElementById('lc-i18n-banner')?.innerText || '', saved: localStorage.getItem('lcnda-langue'), toast: [...document.querySelectorAll('.toast')].map(x => x.innerText).join(' | ')}));
            assert.equal(sv.lang, 'sv'); assert.equal(sv.saved, 'sv');
            assert.ok(sv.nav.includes('Översikt') && sv.nav.includes('Inställningar'), sv.nav);
            assert.ok(/Översatt av en AI/.test(sv.banner) && /Rapportera ett fel/.test(sv.banner), sv.banner);
            assert.ok(/↶ Ångra/.test(sv.toast), sv.toast);
            await page.locator('.toast .ui-toast-btn', {hasText: '↶ Ångra'}).first().click(); await page.waitForTimeout(1500);
            const back = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav').innerText, banner: !!document.getElementById('lc-i18n-banner')}));
            assert.equal(back.lang, 'fr'); assert.equal(back.banner, false); assert.equal(back.nav, nav0, 'français remis à l’identique');
            await page.context().close();
        });
        for (const l of NEW) await t(`${l} : le cadre traduit sur le tableau de bord (menus, colonne, en-tête, widgets), bandeau, pluriels`, async () => {
            const isFr = R.make(l);
            const page = await open({lang: l});
            await go(page, 'mod', 'dashboard'); await page.waitForTimeout(1500);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav').innerText, banner: document.getElementById('lc-i18n-banner')?.innerText || '', plural: window.LCNDA_APP.plural(5, 'personne'), title: document.title}));
            assert.equal(r.lang, l);
            const want = {cs: ['Přehled', 'Nastavení', 'Překlad vytvořila AI', '5 osob', 'Digitální zápisník předků'], sv: ['Översikt', 'Inställningar', 'Översatt av en AI', '5 personer', 'Digital anteckningsbok om anfäderna'], da: ['Oversigt', 'Indstillinger', 'Oversat af en AI', '5 personer', 'Digital notesbog om aner']}[l];
            assert.ok(r.nav.includes(want[0]) && r.nav.includes(want[1]), r.nav);
            assert.ok(r.banner.includes(want[2]), r.banner); assert.equal(r.plural, want[3]); assert.equal(r.title, want[4]);
            const navLeft = r.nav.split('\n').map(norm).filter(Boolean).filter(isFr);
            assert.deepEqual(navLeft, [], 'menu principal : plus de français');
            const left = (await frameTexts(page)).filter(isFr);
            const mine = left.filter(ofBase);
            assert.deepEqual(mine, [], `textes des zones de base restés en français : ${mine.join(' | ')}`);
            if (left.length) console.log(`  (${l} : ${left.length} textes d’autres zones encore en français, à traduire ensuite : ${left.slice(0, 8).join(' | ')}${left.length > 8 ? '…' : ''})`);
            if (shots) await page.screenshot({path: path.join(shots, `i18n-${l}-dashboard-1440.png`)});
            await page.context().close();
        });
        await t('tchèque à 390 px : pas de débordement (tableau de bord, liste des personnes, Apparence)', async () => {
            const page = await open({lang: 'cs', w: 390});
            for (const [name, kind, id] of [['dashboard', 'mod', 'dashboard'], ['liste', 'list', 'persons'], ['apparence', 'maint', 'look_theme']]) {
                await go(page, kind, id); await page.waitForTimeout(1300);
                const r = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, banner: (() => { const b = document.getElementById('lc-i18n-banner'); if (!b) return null; const x = b.getBoundingClientRect(); return [Math.round(x.left), Math.round(x.right)]; })(),
                    wide: [...document.querySelectorAll('#workspace .page-header h2, .ui-listbar, #lc-i18n-banner')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className || e.tagName)}));
                assert.ok(r.sw <= 391 && r.bw <= 391, `${name} : la page déborde (${r.sw} px)`);
                assert.deepEqual(r.wide, [], `${name} : ${r.wide.join(', ')}`);
                if (r.banner) assert.ok(r.banner[0] >= 0 && r.banner[1] <= 390, `${name} : bandeau dans l’écran ${r.banner}`);
                if (shots) await page.screenshot({path: path.join(shots, `i18n-cs-${name}-390.png`)});
            }
            await page.context().close();
        });
        await t('en français, rien ne change : html lang="fr", pas de bandeau, menus en français', async () => {
            const page = await open();
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), nav: document.querySelector('.main-nav').innerText, data: !!window.LCNDA_I18N_DATA, plural: window.LCNDA_APP.plural(5, 'personne')}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false); assert.equal(r.data, false); assert.equal(r.plural, '5 personnes');
            assert.ok(r.nav.includes('Tableau de bord') && r.nav.includes('Réglages'));
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); if (proc) proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true}); fs.rmSync(tmpEmpty, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} cs, sv, da : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
