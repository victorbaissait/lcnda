'use strict';
/* 🌐 Traduction de l'app (vague 1 : le socle et le cadre). Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n.js            (I18N_SHOTS=dossier pour garder des captures)
 * 1. Node : t() avec repli sur le français, contexte, variables ; pluriels des 8 langues (Intl.PluralRules) ; nombres ;
 *    fichiers de langue complets et à jour (scripts/i18n-check.js) ; bandeau IA dans chaque langue ; i18n-extract.
 * 2. Serveur : lib/i18n.php traduit les messages d'erreur (en-tête X-LCNDA-Lang), le français ne change pas.
 * 3. Navigateur (Playwright, sinon sauté) : en français rien ne change (pas de bandeau, html lang="fr") ; choisir la
 *    langue dans Réglages → Apparence (K2 + ↶ Annuler qui remet le français à l'identique) ; langue gardée au
 *    rechargement ; <html lang> ; bandeau (×, « Remontrer », « Signaler une erreur » pré-rempli) ; dans chacune des
 *    7 langues, plus de texte français dans le cadre de 3 écrans (tableau de bord, Listes → Personnes (H10),
 *    Réglages → Apparence) ; allemand à 390 px sans débordement ; sombre ; premier lancement ; aucune erreur JS.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];

(async () => {
    /* ═════ 1. Node ═════ */
    const I = require('../assets/js/app-i18n.js');
    await t('le français est la référence : t() rend le texte tel quel, plural() comme avant', () => {
        I.setLang('fr', {persist: false});
        assert.equal(I.lang, 'fr');
        assert.equal(I.t('Enregistrer'), 'Enregistrer');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Réglages gardés sous « Ma vue ».');
        assert.equal(I.t('Voir les {n} suivants ↓', {n: 1234}), `Voir les ${(1234).toLocaleString('fr-FR')} suivants ↓`);
        assert.equal(I.plural(0, 'personne'), '0 personne');
        assert.equal(I.plural(1, 'personne'), '1 personne');
        assert.equal(I.plural(2, 'cheval', 'chevaux'), '2 chevaux');
        assert.equal(I.plural(3, 'lieux'), '3 lieux');
        assert.equal(I.plural(2, 'personne'), I.frPlural(2, 'personne'));
    });
    await t('t() : traduction, repli sur le français, contexte, variables, dans les 7 langues', () => {
        for (const l of LANGS) {
            I.setLang(l, {persist: false});
            assert.equal(I.lang, l);
            assert.notEqual(I.t('Enregistrer'), 'Enregistrer', l);
            assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas', `${l} : repli`);
            assert.equal(I.t('Enregistrer', {ctx: 'rien'}), I.t('Enregistrer'), `${l} : contexte inconnu → le mot sans contexte`);
            const s = I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'});
            assert.ok(s.includes('Ma vue') && !s.includes('{') && s !== 'Réglages gardés sous « Ma vue ».', `${l} : variables`);
            assert.ok(/IA|AI|KI|SI/.test(I.t(I.AI_NOTE)) && I.t(I.AI_NOTE) !== I.AI_NOTE, `${l} : bandeau IA traduit`);
            assert.ok(I.t('Signaler une erreur') !== 'Signaler une erreur', `${l} : « Signaler une erreur »`);
        }
        I.setLang('fr', {persist: false});
    });
    await t('pluriels des 8 langues (Intl.PluralRules), nombres selon la langue', () => {
        const want = {
            fr: [[0, '0 personne'], [1, '1 personne'], [2, '2 personnes']],
            en: [[1, '1 person'], [2, '2 people'], [0, '0 people']],
            es: [[1, '1 persona'], [3, '3 personas']], de: [[1, '1 Person'], [3, '3 Personen']],
            it: [[1, '1 persona'], [3, '3 persone']], pt: [[1, '1 pessoa'], [3, '3 pessoas']],
            pl: [[1, '1 osoba'], [3, '3 osoby'], [5, '5 osób'], [22, '22 osoby'], [25, '25 osób']],
            nl: [[1, '1 persoon'], [3, '3 personen']],
        };
        for (const [l, rows] of Object.entries(want)) { I.setLang(l, {persist: false}); for (const [n, s] of rows) assert.equal(I.plural(n, 'personne'), s, `${l} ${n}`); }
        I.setLang('pl', {persist: false}); assert.equal(I.plural(2, 'animal', 'animaux'), '2 zwierzęta'); assert.equal(I.plural(5, 'animal', 'animaux'), '5 zwierząt');
        I.setLang('en', {persist: false}); assert.equal(I.fmtNumber(1234.5), '1,234.5'); assert.equal(I.t('Voir les {n} suivants ↓', {n: 1500}), 'See the next 1,500 ↓');
        I.setLang('de', {persist: false}); assert.equal(I.fmtNumber(1234.5), '1.234,5'); assert.ok(/Nov/.test(I.fmtDate(new Date(2026, 10, 10))));
        I.setLang('fr', {persist: false});
    });
    await t('le filet de la page : symbole devant, « … » au bout, modèles {x}, « a · b »', () => {
        I.setLang('de', {persist: false});
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Person hinzufügen…');
        assert.equal(I.translateText('🐾 Animaux'), '🐾 Tiere');
        assert.equal(I.translateText(' Tableau de bord '), ' Übersicht ');
        assert.equal(I.translateText('Infos Chiffres clés'), 'Infos: Kennzahlen');
        assert.equal(I.translateText('Listes · Personnes et familles'), 'Listen · Personen und Familien');
        assert.equal(I.translateText('Ajouter Truc inconnu'), null, 'pas de phrase à moitié traduite');
        assert.equal(I.translateText('Marie DURAND'), null, 'les données ne bougent pas');
        I.setLang('fr', {persist: false});
        assert.equal(I.translateText('Tableau de bord'), null, 'en français : rien');
    });
    await t('fichiers de langue : complets, à jour, mêmes variables (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const {check} = require('../scripts/i18n-check.js'); const c = check();
        assert.ok(c.keys >= 1000, `assez de textes (${c.keys})`); assert.deepEqual(c.errors, []);
        for (const l of LANGS) { const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${l}.json`), 'utf8')); assert.equal(j._meta.lang, l); assert.equal(j._meta.ai, true); }
    });
    await t('i18n-extract : textes en dur, appels t() et --missing', () => {
        const X = require('../scripts/i18n-extract.js');
        assert.ok(X.looksFrench('Enregistrer les réglages') && !X.looksFrench('data-pk-opts') && !X.looksFrench('#workspace .page-header'));
        const found = X.textsOfFile(path.join(root, 'assets/js/app-mots.js')).map(x => x.text);
        assert.ok(found.includes('↺ Remettre comme au départ'));
        assert.ok(X.tCalls(path.join(root, 'assets/js/app-picker.js')).some(x => x.text === '{what} trouvés'));
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-extract.js'), 'assets/js/app-mots.js', '--missing', 'de'], {cwd: root, encoding: 'utf8'});
        assert.equal(r.status, 0); assert.ok(!/↺ Remettre comme au départ/.test(r.stdout), 'déjà traduit → pas listé');
    });
    await t('branché partout : index.php, FAQ, mode d’emploi, glossaire', () => {
        const index = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
        const a = index.indexOf('assets/js/app-i18n.js?v='), b = index.indexOf('assets/js/app.js?v=');
        assert.ok(a > 0 && a < b, 'app-i18n.js chargé avant app.js');
        assert.ok(!/app-i18n\.js\?v=\d+" defer/.test(index), 'sans defer');
        assert.ok(/<html lang="<\?= htmlspecialchars\(i18n_page_lang\(\)/.test(index), '<html lang> écrit par le serveur');
        assert.ok(fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8').includes('Changer la langue de l’app'), 'FAQ');
        for (const f of ['docs/I18N.md', 'docs/i18n-glossaire.md']) assert.ok(fs.existsSync(path.join(root, f)), f);
        assert.ok(fs.readFileSync(path.join(root, 'docs/UI.md'), 'utf8').includes('## 🌐 Langue de l’app'));
    });

    /* ═════ 2. Serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (phpPath) await t('lib/i18n.php : messages d’erreur dans la langue de la page, français inchangé', () => {
        const run = (lang) => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$_SERVER['HTTP_X_LCNDA_LANG']=${JSON.stringify(lang)}; require 'lib/i18n.php'; echo json_encode([i18n_lang(), i18n_t('Action inconnue'), i18n_t('Personne introuvable'), i18n_t('Un texte inconnu {x}', ['x' => 3])], JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8'});
        const fr = JSON.parse(run('fr').stdout), de = JSON.parse(run('de').stdout), bad = JSON.parse(run('xx').stdout);
        assert.deepEqual(fr, ['fr', 'Action inconnue', 'Personne introuvable', 'Un texte inconnu 3']);
        assert.deepEqual(de, ['de', 'Unbekannte Aktion', 'Person nicht gefunden', 'Un texte inconnu 3']);
        assert.equal(bad[0], 'fr', 'une langue inconnue → français');
    });

    /* ═════ 3. Navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-i18n-'));
    const tmpEmpty = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-i18n-vide-'));
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.mkdirSync(path.join(tmpEmpty, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living'),('Louis','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.I18N_PORT) || await freePort(), port2 = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(tmp), stdio: 'ignore'});
    const proc2 = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port2}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(tmpEmpty), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`, base2 = `http://127.0.0.1:${port2}/`;
    for (const b of [base, base2]) for (let i = 0; i < 100; i++) { try { await fetch(b + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const watch = (page, tag) => { page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss()); };
    const open = async ({w = 1440, lang = '', dark = false, url = base} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        await ctx.addInitScript(l => { try { if (l && !sessionStorage.getItem('i18n-test-set')) { localStorage.setItem('lcnda-langue', l); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage(); watch(page, `${lang || 'fr'} ${w}px${dark ? ' sombre' : ''}`);
        await page.goto(url, {waitUntil: 'load'}); await page.waitForTimeout(1500);
        if (dark) await page.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
        return page;
    };
    const go = (page, kind, id) => page.evaluate(async ([kind, id]) => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close());
        if (kind === 'list') { A.state.listType = id; await A.setModule('listes'); } else if (kind === 'maint') { A.state.maintenanceTab = id; await A.setModule('maintenance'); } else await A.setModule(id); }, [kind, id]);
    const SCREENS = [['dashboard', 'mod', 'dashboard'], ['liste', 'list', 'persons'], ['apparence', 'maint', 'look_theme']];
    // le cadre : menus, colonne de gauche, en-tête de page, barre des listes, titres des widgets, le premier cadre de l'Apparence
    const ZONES = ['.topbar', '#sidebar .sidebar-top', '#sidebar-content', '#sidebar-footer', '#workspace .page-header', '.ui-listbar', '#workspace .ui-sortbar', '#workspace thead',
        '.dashboard-widget > header', '.dashboard-widget .widget-head', '.dashboard-widget h3', '#workspace .empty-box', '#lc-i18n-banner', '[data-lc-lang-field]', '#workspace .reg-a-tabs'];
    const frameTexts = page => page.evaluate(Z => {
        const out = new Set(), seen = new Set();
        const take = el => { const tw = document.createTreeWalker(el, 5); let n = el; do { if (n.nodeType === 1) { if (n.closest('[data-i18n-off], script, style, textarea, select')) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
            else if (n.nodeType === 3 && !n.parentElement.closest('[data-i18n-off], script, style, textarea, select, [data-person-id], .person-name, tbody')) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); } } while ((n = tw.nextNode())); };
        Z.forEach(z => document.querySelectorAll(z).forEach(el => { if (!seen.has(el)) { seen.add(el); take(el); } }));
        // Apparence : le libellé de chaque réglage du premier cadre (pas ses choix) et le titre des cadres visibles
        document.querySelectorAll('#workspace .design-primary-grid > label').forEach(l => { if (!l.offsetParent) return; const s = [...l.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join(' ').replace(/\s+/g, ' ').trim(); if (s) out.add(s); });
        document.querySelectorAll('#workspace .page > section > h3, #workspace .page > section > header h3').forEach(h => { if (h.offsetParent) out.add(h.textContent.replace(/\s+/g, ' ').trim()); });
        return [...out];
    }, ZONES);
    try {
        await t('en français, rien ne change : html lang="fr", pas de bandeau, pas d’en-tête de langue envoyé', async () => {
            const page = await open();
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), nav: document.querySelector('.main-nav').innerText, i18n: window.LCNDA_I18N.lang, data: !!window.LCNDA_I18N_DATA, title: document.title, plural: window.LCNDA_APP.plural(2, 'personne')}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false); assert.equal(r.i18n, 'fr'); assert.equal(r.data, false);
            assert.ok(r.nav.includes('Tableau de bord') && r.nav.includes('Réglages')); assert.equal(r.title, 'Carnet numérique des ancêtres'); assert.equal(r.plural, '2 personnes');
            await page.context().close();
        });
        await t('Réglages → Apparence : choisir la langue (tout en haut), K2 « ↶ Annuler » remet le français à l’identique', async () => {
            const page = await open();
            await go(page, 'maint', 'look_theme'); await page.waitForTimeout(1200);
            const frBefore = await page.evaluate(() => ({nav: document.querySelector('.main-nav').innerText, side: document.querySelector('#sidebar-content').innerText, head: document.querySelector('#workspace .page-header').innerText}));
            const first = await page.evaluate(() => { const g = document.querySelector('#workspace .design-primary-grid'); const l = g && [...g.children].find(c => c.offsetParent); return l ? l.hasAttribute('data-lc-lang-field') : false; });
            assert.ok(first, 'la langue est le premier réglage du premier cadre');
            const opts = await page.$$eval('select[data-lc-lang] option', o => o.map(x => x.value + ':' + x.textContent));
            assert.equal(opts.length, 8); assert.ok(opts.some(o => /^de:.*Deutsch/.test(o)) && opts.some(o => /^pl:.*Polski/.test(o)));
            await page.selectOption('select[data-lc-lang]', 'en');
            await page.waitForFunction(() => /✓ Saved/.test(document.querySelector('#workspace .page-header .ui-ph-saved')?.textContent || '') && [...document.querySelectorAll('.toast')].some(x => /↶ Undo/.test(x.innerText)), null, {timeout: 6000}).catch(() => {});
            const en = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav').innerText, banner: document.getElementById('lc-i18n-banner')?.innerText || '', saved: localStorage.getItem('lcnda-langue'), cookie: document.cookie, toast: [...document.querySelectorAll('.toast')].map(x => x.innerText).join(' | ')}));
            assert.equal(en.lang, 'en'); assert.equal(en.saved, 'en'); assert.ok(/lcnda_lang=en/.test(en.cookie));
            assert.ok(en.nav.includes('Dashboard') && en.nav.includes('Settings'), en.nav);
            assert.ok(/Translated by an AI/.test(en.banner) && /Report a mistake/.test(en.banner), en.banner);
            const saved = await page.waitForFunction(() => /✓ Saved/.test(document.querySelector('#workspace .page-header')?.innerText || ''), null, {timeout: 6000}).then(() => true, () => false);
            assert.ok(saved, `« ✓ Enregistré » à droite du titre : ${await page.evaluate(() => document.querySelector('#workspace .page-header')?.outerHTML.slice(-400))}`);
            assert.ok(/↶ Undo/.test(en.toast), en.toast);
            await page.locator('.toast .ui-toast-btn', {hasText: '↶ Undo'}).first().click(); await page.waitForTimeout(1500);
            const back = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav').innerText, side: document.querySelector('#sidebar-content').innerText, head: document.querySelector('#workspace .page-header').innerText, banner: !!document.getElementById('lc-i18n-banner'), saved: localStorage.getItem('lcnda-langue')}));
            assert.equal(back.lang, 'fr'); assert.equal(back.banner, false); assert.equal(back.saved, null);
            assert.equal(back.nav, frBefore.nav, 'menu remis à l’identique'); assert.equal(back.side, frBefore.side, 'colonne remise à l’identique');
            const clean = x => x.replace(/✓ Enregistré/g, '').replace(/\s+/g, ' ').trim();
            assert.equal(clean(back.head), clean(frBefore.head), 'en-tête remis à l’identique');
            await page.context().close();
        });
        await t('langue gardée au rechargement, <html lang> écrit par le serveur, bandeau : ×, « Remontrer », « Signaler une erreur »', async () => {
            const page = await open({lang: 'de'});
            await page.reload({waitUntil: 'load'}); await page.waitForTimeout(1500);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, inline: !!window.LCNDA_I18N_DATA && window.LCNDA_I18N_DATA._meta.lang, nav: document.querySelector('.main-nav').innerText}));
            assert.equal(r.lang, 'de'); assert.equal(r.inline, 'de', 'dictionnaire écrit dans la page par le serveur (cookie)'); assert.ok(r.nav.includes('Übersicht'));
            const html = await (await page.context().request.get(base)).text();
            assert.ok(/<html lang="de">/.test(html), 'le serveur écrit <html lang="de">');
            // « Signaler une erreur » : la fenêtre « Signaler un problème », pré-remplie « traduction »
            await page.click('#lc-i18n-banner [data-i18n-report]'); await page.waitForTimeout(1200);
            const what = await page.evaluate(() => document.querySelector('dialog[open] [data-rp-what]')?.value || '');
            assert.ok(/^\[traduction · Deutsch \(de\)\]/.test(what), what);
            assert.ok(/Problem melden/.test(await page.evaluate(() => document.querySelector('dialog[open] h2')?.textContent || '')), 'titre de la fenêtre traduit');
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await page.click('#lc-i18n-banner [data-i18n-close]'); await page.waitForTimeout(200);
            assert.equal(await page.$('#lc-i18n-banner'), null, '× referme le bandeau');
            await page.reload({waitUntil: 'load'}); await page.waitForTimeout(1300);
            assert.equal(await page.$('#lc-i18n-banner'), null, 'reste fermé');
            await go(page, 'maint', 'look_theme'); await page.waitForTimeout(1200);
            await page.click('[data-lc-lang-banner]'); await page.waitForTimeout(200);
            assert.ok(await page.$('#lc-i18n-banner'), '« Remontrer le bandeau »');
            const r2 = await page.evaluate(async () => { try { await window.LCNDA_APP.api('action_qui_n_existe_pas'); return ''; } catch (e) { return e.message; } });
            assert.equal(r2, 'Unbekannte Aktion', 'message d’erreur du serveur traduit');
            await page.context().close();
        });
        for (const l of LANGS) await t(`${l} : plus de texte français dans le cadre (tableau de bord, liste H10, Réglages → Apparence)`, async () => {
            const isFr = R.make(l);
            const page = await open({lang: l});
            const bad = {};
            for (const [name, kind, id] of SCREENS) {
                await go(page, kind, id); await page.waitForTimeout(1300);
                const left = (await frameTexts(page)).filter(isFr);
                if (left.length) bad[name] = left;
                if (shots && (l === 'en' || l === 'de' || l === 'pl')) await page.screenshot({path: path.join(shots, `i18n-${l}-${name}-1440.png`)});
            }
            assert.deepEqual(bad, {}, `textes français restés : ${JSON.stringify(bad, null, 1)}`);
            assert.equal(await page.evaluate(() => document.documentElement.lang), l);
            await page.context().close();
        });
        await t('allemand à 390 px (mots longs) : pas de débordement, rien de coupé hors de l’écran', async () => {
            const page = await open({lang: 'de', w: 390});
            for (const [name, kind, id] of SCREENS) {
                await go(page, kind, id); await page.waitForTimeout(1300);
                const r = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, banner: (() => { const b = document.getElementById('lc-i18n-banner'); if (!b) return null; const x = b.getBoundingClientRect(); return [Math.round(x.left), Math.round(x.right)]; })(),
                    wide: [...document.querySelectorAll('#workspace .page-header h2, .ui-listbar, #lc-i18n-banner')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className || e.tagName)}));
                assert.ok(r.sw <= 391 && r.bw <= 391, `${name} : la page déborde (${r.sw} px)`);
                assert.deepEqual(r.wide, [], `${name} : ${r.wide.join(', ')}`);
                if (r.banner) assert.ok(r.banner[0] >= 0 && r.banner[1] <= 390, `${name} : bandeau dans l’écran ${r.banner}`);
                if (shots) await page.screenshot({path: path.join(shots, `i18n-de-${name}-390.png`)});
            }
            await page.context().close();
        });
        await t('sombre (1440 px, néerlandais) : le bandeau suit le thème, sans erreur', async () => {
            const page = await open({lang: 'nl', dark: true});
            await go(page, 'mod', 'dashboard'); await page.waitForTimeout(1200);
            const r = await page.evaluate(() => { const b = document.getElementById('lc-i18n-banner'); return {theme: document.documentElement.dataset.theme, bg: b && getComputedStyle(b).backgroundColor, txt: b && b.innerText}; });
            assert.equal(r.theme, 'dark'); assert.ok(r.txt && /AI/.test(r.txt));
            const [rr, gg, bb] = (r.bg.match(/\d+/g) || []).map(Number); assert.ok(rr + gg + bb < 300, `fond sombre (${r.bg})`);
            if (shots) await page.screenshot({path: path.join(shots, 'i18n-nl-dashboard-sombre.png')});
            await page.context().close();
        });
        await t('premier lancement : le menu des langues, l’écran traduit tout de suite', async () => {
            const page = await open({url: base2});
            assert.ok(await page.$('#install-screen select[data-lc-lang-pick]'), 'menu des langues sur l’écran d’installation');
            assert.ok(/La base généalogique doit être importée/.test(await page.locator('#install-screen').innerText()));
            await page.selectOption('#install-screen select[data-lc-lang-pick]', 'it'); await page.waitForTimeout(600);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, txt: document.querySelector('#install-screen').innerText, saved: localStorage.getItem('lcnda-langue')}));
            assert.equal(r.lang, 'it'); assert.equal(r.saved, 'it'); assert.ok(/La base genealogica deve essere importata/.test(r.txt), r.txt.slice(0, 300));
            if (shots) await page.screenshot({path: path.join(shots, 'i18n-it-premier-lancement.png')});
            await page.selectOption('#install-screen select[data-lc-lang-pick]', 'fr'); await page.waitForTimeout(400);
            assert.ok(/La base généalogique doit être importée/.test(await page.locator('#install-screen').innerText()), 'retour au français à l’identique');
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); proc2.kill();
        fs.rmSync(tmp, {recursive: true, force: true}); fs.rmSync(tmpEmpty, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
