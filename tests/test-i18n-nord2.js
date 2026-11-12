'use strict';
/* 🌐 Les deux langues ajoutées après cs / sv / da : slovaque (sk) et norvégien bokmål (nb). Mode d'emploi : docs/I18N.md (« Ajouter une langue »).
 *     node tests/test-i18n-nord2.js           (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20740 par défaut)
 * 1. Node : les langues déclarées partout (24 avec le roumain, le finnois, le hongrois, le croate, le slovène, le lituanien, le letton, l’estonien, l’islandais, le turc et le luxembourgeois : test-i18n-nord3.js à test-i18n-nord9.js) (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord2/*.tsv
 *    (« fr ¦ sk ¦ nb ») lus avec nord/ (tout sous-dossier de src/) ; une clé absente en sk / nb = avertissement compté, une variable
 *    ou un pluriel faux = erreur ; les zones de base (cadre, composants, colonnes, premier, touches, reglages, faq) traduites en
 *    entier ; i18n-todo.js donne le tchèque (pour sk) et le danois (pour nb) en aide ; pluriels slovaques (1 / 2 à 4 / 5 et plus) ;
 *    repli sur le français ; le français ne change pas ; FAQ sk / nb (vides, repli) ; serveur (lib/i18n.php).
 * 2. Navigateur (Playwright, sinon sauté) : premier lancement en slovaque ; choisir le norvégien dans Réglages → Apparence (↶ Annuler) ;
 *    le cadre traduit sur le tableau de bord en sk et nb ; bandeau IA ; pluriels ; slovaque à 390 px sans débordement ;
 *    français inchangé ; aucune erreur JS.
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
const NEW = ['sk', 'nb'];
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq'];

(async () => {
    /* ═════ 1. Node ═════ */
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    await t('28 langues déclarées partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES, ['fr', 'en', 'es', 'de', 'it', 'pt', 'pl', 'nl', 'cs', 'sv', 'da', 'sk', 'nb', 'ro', 'fi', 'hu', 'hr', 'sl', 'lt', 'lv', 'et', 'is', 'tr', 'lb', 'sq', 'mt', 'vi', 'id']);
        assert.deepEqual(NEW.map(c => [I.info(c).name, I.info(c).flag, I.info(c).locale]), [['Slovenčina', '🇸🇰', 'sk-SK'], ['Norsk (bokmål)', '🇳🇴', 'nb-NO']]);
        assert.ok(/const I18N_LANGS = \[[^\]]*'da', 'sk', 'nb'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(3, 5), NEW); assert.deepEqual(B.LANGS, [...B.CORE, ...B.NEW_LANGS]);
        assert.deepEqual(B.FORMS.sk, ['one', 'few', 'many']); assert.equal(B.FORMS.nb, undefined, 'nb : one|other');
        assert.deepEqual([B.NAMES.sk, B.NAMES.nb], ['Slovenčina', 'Norsk (bokmål)']);
        assert.deepEqual(F.NEW_LANGS.slice(3, 5), NEW); assert.equal(F.LANGS.length, 7);
        for (const c of NEW) {
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.equal(j._meta.lang, c); assert.equal(j._meta.ai, true); assert.equal(j._meta.name, I.info(c).name);
            assert.ok(/nord2\/\*\.tsv/.test(j._meta.note), j._meta.note);
            const fq = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/faq/${c}.json`), 'utf8'));
            assert.equal(fq._meta.lang, c); assert.equal(fq._meta.version, F.VERSION);
            assert.ok(fs.existsSync(path.join(root, `assets/i18n/faq/src/${c}`)), `faq/src/${c}/`);
        }
        assert.ok(fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8').includes(`const FAQ_I18N_V = ${F.VERSION};`));
        assert.ok(new RegExp(`app-i18n\\.js\\?v=${I.VERSION}"`).test(fs.readFileSync(path.join(root, 'index.php'), 'utf8')), '?v= de app-i18n.js = VERSION');
        const sel = I.selectHtml(); assert.ok(/🇸🇰 Slovenčina \(SK\)/.test(sel) && /🇳🇴 Norsk \(bokmål\) \(NB\)/.test(sel), sel);
        const faq = F.entries().find(e => e.q === 'Changer la langue de l’app');
        assert.ok(/Vingt-huit langues : .*Dansk, Slovenčina, Norsk \(bokmål\), .*Tiếng Việt, Bahasa Indonesia ;/.test(faq.a), 'FAQ française : « Vingt-huit langues »');
        const st = F.status();
        for (const c of [...F.LANGS, 'cs', 'sv', 'da']) assert.ok(!st[c].stale.includes(faq.id) && !st[c].missing.includes(faq.id), `${c} : la question « Changer la langue » est à jour`);
    });
    await t('nord2/ : 1re ligne « fr ¦ sk ¦ nb », dossier choisi tout seul (dirOf), fichiers de base présents', () => {
        for (const z of BASE_ZONES) {
            const f = path.join(root, 'assets/i18n/src/nord2', `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], 'fr ¦ sk ¦ nb');
        }
        assert.deepEqual(B.dirOf('sk'), {dir: 'nord2', head: 'fr ¦ sk ¦ nb'}); assert.equal(B.dirOf('nb').dir, 'nord2'); assert.equal(B.dirOf('cs').dir, 'nord');
        assert.ok(B.extraDirs().map(d => path.basename(d)).includes('nord2'));
    });
    await t('i18n-check : 0 erreur ; sk / nb comptés (avertissement) ; --strict-new en fait des erreurs', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        for (const c of NEW) assert.ok(new RegExp(`(⚠️ ${c} : \\d+ textes encore sans traduction)|(✓ ${c} : tout est traduit)`).test(r.stdout), `${c} compté`);
        const {check} = require('../scripts/i18n-check.js'); const c = check();
        assert.deepEqual(c.errors, []);
        if (c.missingNew.sk.length) {
            const s = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js'), '--strict-new', '--lang', 'sk'], {encoding: 'utf8', maxBuffer: 64 << 20});
            assert.equal(s.status, 1, 'strict : une clé absente en sk devient une erreur');
        }
    });
    await t('nord/ et nord2/ fusionnés par clé ; variable ou pluriel faux = erreur ; clé absente = avertissement', () => {
        const {check} = require('../scripts/i18n-check.js');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-nord2-'));
        fs.mkdirSync(path.join(tmp, 'nord')); fs.mkdirSync(path.join(tmp, 'nord2'));
        fs.writeFileSync(path.join(tmp, 'z.tsv'), 'fr ¦ en ¦ es ¦ de ¦ it ¦ pt ¦ pl ¦ nl\nBonjour {name} ¦ Hello {name} ¦ Hola {name} ¦ Hallo {name} ¦ Ciao {name} ¦ Olá {name} ¦ Cześć {name} ¦ Hallo {name}\n=chat ¦ cat|cats ¦ gato|gatos ¦ Katze|Katzen ¦ gatto|gatti ¦ gato|gatos ¦ kot|koty|kotów ¦ kat|katten\nonglet|Fiche ¦ Record ¦ Ficha ¦ Eintrag ¦ Scheda ¦ Ficha ¦ Karta ¦ Profiel\n');
        fs.writeFileSync(path.join(tmp, 'nord', 'z.tsv'), 'fr ¦ cs ¦ sv ¦ da\nBonjour {name} ¦ Ahoj {name} ¦ Hej {name} ¦ Hej {name}\n=chat ¦ kočka|kočky|koček ¦ katt|katter ¦ kat|katte\nonglet|Fiche ¦ Karta ¦ Post ¦ Post\n');
        fs.writeFileSync(path.join(tmp, 'nord2', 'z.tsv'), 'fr ¦ sk ¦ nb\nBonjour {name} ¦ Ahoj {meno} ¦ Hei {name}\n=chat ¦ mačka|mačky ¦ katt|katter\n');
        const r = check({src: tmp});
        assert.ok(r.errors.some(e => /\[sk\] variables différentes/.test(e) && /nord2\/z\.tsv:2/.test(e)), r.errors.join('\n'));
        assert.ok(r.errors.some(e => /\[sk\] pluriel incomplet \(2\/3/.test(e)), 'sk : 3 formes');
        assert.ok(!r.errors.some(e => /\[(nb|cs|sv|da)\]/.test(e)), r.errors.join('\n'));
        assert.deepEqual(r.missingNew.nb.map(x => x.replace(/^.*« /, '')), ['onglet|Fiche »'], 'nb : onglet|Fiche manque → avertissement');
        assert.deepEqual(r.missingNew.cs, [], 'cs complet');
        assert.ok(!r.warns.some(w => /en double/.test(w)), 'la même clé dans nord/ et nord2/ n’est pas un doublon');
        assert.ok(check({src: tmp, strictNew: true}).errors.some(e => /\[nb\] manque : « onglet\|Fiche »/.test(e)));
        const bj = B.readSources({src: tmp}).find(x => x.key === 'Bonjour {name}');
        assert.deepEqual([bj.vals.en, bj.vals.cs, bj.vals.nb], ['Hello {name}', 'Ahoj {name}', 'Hei {name}']);
        fs.rmSync(tmp, {recursive: true, force: true});
    });
    await t('les zones de base sont traduites en entier en sk et nb ; i18n-todo.js donne le tchèque et le danois en aide', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) { const r = todo('sk,nb', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.ok(r.total > 0); assert.equal(r.dir, 'nord2'); }
        const all = todo('sk', 'all'); assert.equal(all.zones.find(z => z.zone === 'cadre').missing, 0);
        const r = todo('sk,nb', 'listes'); assert.deepEqual(r.near, ['cs', 'da']);
        if (r.items.length) { assert.ok(r.items[0].cs !== undefined && r.items[0].da !== undefined); }
        const out = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-todo.js'), 'sk,nb', 'listes', '--limit', '3'], {encoding: 'utf8'});
        assert.equal(out.status, 0, out.stderr);
        assert.ok(/nord2\/listes\.tsv \(1re ligne : fr ¦ sk ¦ nb\)/.test(out.stdout), out.stdout.slice(0, 400));
        const lines = out.stdout.split('\n').filter(l => l && !l.startsWith('#'));
        if (r.items.length) { assert.equal(lines.length, 3); assert.ok(lines.every(l => l.split('\t').length === 6), 'clé ⇥ en ⇥ de ⇥ cs ⇥ da ⇥ langues'); }
        const sk = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-todo.js'), 'nb', 'listes', '--skeleton', '--limit', '2'], {encoding: 'utf8'});
        const sl = sk.stdout.split('\n').filter(l => l && !l.startsWith('#'));
        if (r.items.length) assert.ok(sl.every(l => l.split(' ¦ ').length === 3), sl.join('\n'));
    });
    await t('t() en sk et nb : traduit, repli sur le français, variables, contexte, bandeau IA', () => {
        const want = {sk: ['Uložiť', 'Nastavenia', 'Nahlásiť chybu', 'Prehľad'], nb: ['Lagre', 'Innstillinger', 'Rapporter en feil', 'Oversikt']};
        for (const l of NEW) {
            I.setLang(l, {persist: false});
            assert.equal(I.lang, l);
            assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord')], want[l]);
            assert.ok(/\b(AI|KI)\b/.test(I.t(I.AI_NOTE)) && I.t(I.AI_NOTE) !== I.AI_NOTE, `${l} : bandeau`);
            assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas', `${l} : repli`);
            const s = I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}); assert.ok(s.includes('Ma vue') && !s.includes('{') && s !== 'Réglages gardés sous « Ma vue ».');
            assert.ok(s.includes({sk: '„Ma vue“', nb: '«Ma vue»'}[l]), `${l} : guillemets ${s}`);
            assert.equal(I.t('Espace', {ctx: 'touche'}), {sk: 'Medzerník', nb: 'Mellomrom'}[l]);
            assert.equal(I.translateText('＋ Ajouter une personne…'), {sk: '＋ Pridať osobu…', nb: '＋ Legg til en person…'}[l]);
        }
        I.setLang('fr', {persist: false});
    });
    await t('pluriels : slovaque 1 / 2 à 4 / 5 et plus, norvégien à deux formes ; nombres', () => {
        I.setLang('sk', {persist: false});
        const sk = [[1, '1 osoba'], [2, '2 osoby'], [4, '4 osoby'], [5, '5 osôb'], [0, '0 osôb'], [11, '11 osôb'], [22, '22 osôb'], [101, '101 osôb']];
        for (const [n, s] of sk) assert.equal(I.plural(n, 'personne'), s, `sk ${n}`);
        assert.equal(I.plural(1.5, 'personne'), '1,5 osoby', 'sk : « many » (1,5) = la forme « 2 à 4 »');
        assert.equal(I.plural(3, 'animal', 'animaux'), '3 zvieratá'); assert.equal(I.plural(7, 'animal', 'animaux'), '7 zvierat');
        assert.equal(I.fmtNumber(1234.5).replace(/\s/g, ' '), '1 234,5');
        const j = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/sk.json'), 'utf8'));
        assert.deepEqual(j.personne, {one: 'osoba', few: 'osoby', many: 'osoby', other: 'osôb'});
        I.setLang('nb', {persist: false});
        assert.equal(I.plural(1, 'personne'), '1 person'); assert.equal(I.plural(3, 'personne'), '3 personer'); assert.equal(I.plural(0, 'personne'), '0 personer');
        assert.equal(I.plural(3, 'animal', 'animaux'), '3 dyr'); assert.equal(I.fmtNumber(1234.5).replace(/\s/g, ' '), '1 234,5');
        I.setLang('fr', {persist: false});
    });
    await t('le français ne change pas', () => {
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes'); assert.equal(I.plural(1, 'personne'), '1 personne');
        assert.equal(I.translateText('Tableau de bord'), null);
    });
    const phpPath = findPhp([devBundledPhp()]);
    if (phpPath) await t('serveur (lib/i18n.php) : en-tête sk / nb reconnu, traduction ou repli sur le français', () => {
        const run = lang => JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$_SERVER['HTTP_X_LCNDA_LANG']=${JSON.stringify(lang)}; require 'lib/i18n.php'; echo json_encode([i18n_lang(), i18n_t('Enregistrer'), i18n_t('Un texte inconnu {x}', ['x' => 3]), i18n_t('personne', ['n' => 5])], JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8'}).stdout);
        assert.deepEqual(run('sk'), ['sk', 'Uložiť', 'Un texte inconnu 3', 'osôb']);
        assert.deepEqual(run('nb'), ['nb', 'Lagre', 'Un texte inconnu 3', 'personer']);
        assert.deepEqual(run('fr'), ['fr', 'Enregistrer', 'Un texte inconnu 3', 'personne']);
    });

    /* ═════ 2. Navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} sk, nb : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
    // les clés des zones de base : un texte français resté à l'écran qui en vient est une faute (les autres zones se traduisent ensuite)
    const BASE_KEYS = new Set(B.readSources().filter(r => BASE_ZONES.includes(r.file.replace(/\.tsv$/, ''))).map(r => norm(r.key.replace(/^[a-z0-9-]+\|/, ''))));
    const LEAD = /^[\s\p{Extended_Pictographic}\p{So}\p{Sm}️‍⃣·•]+/u, TRAIL = /[\s…:▾▸→↗]+$/u;
    const ofBase = s => { const f = norm(s), rest = f.replace(LEAD, ''), core = rest.replace(TRAIL, ''); return BASE_KEYS.has(f) || BASE_KEYS.has(rest) || BASE_KEYS.has(core); };
    const shots = process.env.I18N_SHOTS || '';
    const work = process.env.I18N_TMP || os.tmpdir();
    const tmp = fs.mkdtempSync(path.join(work, 'carnet-i18n-nord2-')), tmpEmpty = fs.mkdtempSync(path.join(work, 'carnet-i18n-nord2-vide-'));
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.mkdirSync(path.join(tmpEmpty, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living'),('Louis','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20740, base = `http://127.0.0.1:${port}/`;
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
        await t('premier lancement : le menu propose 28 langues (sk, nb avant ro, fi, hu, hr, sl, lt, lv, et, is, tr, lb, sq, mt, vi, id) ; l’écran passe en slovaque tout de suite', async () => {
            const page = await open();
            const opts = await page.$$eval('#install-screen select[data-lc-lang-pick] option', o => o.map(x => x.value));
            assert.deepEqual(opts.slice(11, 13), NEW); assert.equal(opts.length, 28);
            await page.selectOption('#install-screen select[data-lc-lang-pick]', 'sk'); await page.waitForTimeout(600);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, txt: document.querySelector('#install-screen').innerText}));
            assert.equal(r.lang, 'sk'); assert.ok(/Je potrebné importovať genealogickú databázu/.test(r.txt) && /Vytvoriť prvú osobu/.test(r.txt), r.txt.slice(0, 300));
            if (shots) await page.screenshot({path: path.join(shots, 'i18n-sk-premier-lancement.png')});
            await page.selectOption('#install-screen select[data-lc-lang-pick]', 'nb'); await page.waitForTimeout(600);
            assert.ok(/Slektsdatabasen må importeres/.test(await page.locator('#install-screen').innerText()), 'norvégien');
            await page.selectOption('#install-screen select[data-lc-lang-pick]', 'fr'); await page.waitForTimeout(400);
            assert.ok(/La base généalogique doit être importée/.test(await page.locator('#install-screen').innerText()), 'retour au français');
            await page.context().close();
        });
        await serve(tmp);
        await t('Réglages → Apparence : 28 langues ; choisir le norvégien, puis ↶ Annuler remet le français', async () => {
            const page = await open();
            await go(page, 'maint', 'look_theme'); await page.waitForTimeout(1200);
            const nav0 = await page.evaluate(() => document.querySelector('.main-nav').innerText);
            const opts = await page.$$eval('select[data-lc-lang] option', o => o.map(x => x.value + ':' + x.textContent));
            assert.equal(opts.length, 28); assert.ok(opts.some(o => /^sk:.*Slovenčina/.test(o)) && opts.some(o => /^nb:.*Norsk \(bokmål\)/.test(o)), opts.join(' '));
            await page.selectOption('select[data-lc-lang]', 'nb'); await page.waitForTimeout(1200);
            const nb = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav').innerText, banner: document.getElementById('lc-i18n-banner')?.innerText || '', saved: localStorage.getItem('lcnda-langue'), toast: [...document.querySelectorAll('.toast')].map(x => x.innerText).join(' | ')}));
            assert.equal(nb.lang, 'nb'); assert.equal(nb.saved, 'nb');
            assert.ok(nb.nav.includes('Oversikt') && nb.nav.includes('Innstillinger'), nb.nav);
            assert.ok(/Oversatt av KI/.test(nb.banner) && /Rapporter en feil/.test(nb.banner), nb.banner);
            assert.ok(/↶ Angre/.test(nb.toast), nb.toast);
            await page.locator('.toast .ui-toast-btn', {hasText: '↶ Angre'}).first().click(); await page.waitForTimeout(1500);
            const back = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav').innerText, banner: !!document.getElementById('lc-i18n-banner')}));
            assert.equal(back.lang, 'fr'); assert.equal(back.banner, false); assert.equal(back.nav, nav0, 'français remis à l’identique');
            await page.context().close();
        });
        for (const l of NEW) await t(`${l} : le cadre traduit sur le tableau de bord (menus, colonne, en-tête, widgets), bandeau, pluriels`, async () => {
            const isFr = R.make(l);
            const page = await open({lang: l});
            await go(page, 'mod', 'dashboard'); await page.waitForTimeout(1500);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav').innerText, banner: document.getElementById('lc-i18n-banner')?.innerText || '', plural: [1, 2, 5].map(n => window.LCNDA_APP.plural(n, 'personne')), title: document.title}));
            assert.equal(r.lang, l);
            const want = {sk: ['Prehľad', 'Nastavenia', 'Preklad vytvorila AI', ['1 osoba', '2 osoby', '5 osôb'], 'Digitálny zápisník predkov'], nb: ['Oversikt', 'Innstillinger', 'Oversatt av KI', ['1 person', '2 personer', '5 personer'], 'Digital notatbok om aner']}[l];
            assert.ok(r.nav.includes(want[0]) && r.nav.includes(want[1]), r.nav);
            assert.ok(r.banner.includes(want[2]), r.banner); assert.deepEqual(r.plural, want[3]); assert.equal(r.title, want[4]);
            const navLeft = r.nav.split('\n').map(norm).filter(Boolean).filter(isFr);
            assert.deepEqual(navLeft, [], 'menu principal : plus de français');
            const left = (await frameTexts(page)).filter(isFr);
            const mine = left.filter(ofBase);
            assert.deepEqual(mine, [], `textes des zones de base restés en français : ${mine.join(' | ')}`);
            if (left.length) console.log(`  (${l} : ${left.length} textes d’autres zones encore en français, à traduire ensuite : ${left.slice(0, 8).join(' | ')}${left.length > 8 ? '…' : ''})`);
            if (shots) await page.screenshot({path: path.join(shots, `i18n-${l}-dashboard-1440.png`)});
            await page.context().close();
        });
        await t('slovaque à 390 px : pas de débordement (tableau de bord, liste des personnes, Apparence)', async () => {
            const page = await open({lang: 'sk', w: 390});
            for (const [name, kind, id] of [['dashboard', 'mod', 'dashboard'], ['liste', 'list', 'persons'], ['apparence', 'maint', 'look_theme']]) {
                await go(page, kind, id); await page.waitForTimeout(1300);
                const r = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, banner: (() => { const b = document.getElementById('lc-i18n-banner'); if (!b) return null; const x = b.getBoundingClientRect(); return [Math.round(x.left), Math.round(x.right)]; })(),
                    wide: [...document.querySelectorAll('#workspace .page-header h2, .ui-listbar, #lc-i18n-banner')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className || e.tagName)}));
                assert.ok(r.sw <= 391 && r.bw <= 391, `${name} : la page déborde (${r.sw} px)`);
                assert.deepEqual(r.wide, [], `${name} : ${r.wide.join(', ')}`);
                if (r.banner) assert.ok(r.banner[0] >= 0 && r.banner[1] <= 390, `${name} : bandeau dans l’écran ${r.banner}`);
                if (shots) await page.screenshot({path: path.join(shots, `i18n-sk-${name}-390.png`)});
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
    console.log(`${failed ? '✗' : '✓'} sk, nb : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
