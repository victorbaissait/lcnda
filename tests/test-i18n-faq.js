'use strict';
/* 🌐 Traduction de la zone « FAQ et aide » (vague 3) : la page Réglages → FAQ / tuto, la recherche dans la FAQ, la fenêtre
 * « ❓ Aide (FAQ) » des éditeurs et les bulles « En savoir plus (FAQ) → ». Mode d'emploi : docs/I18N.md (« La FAQ »).
 *     node tests/test-i18n-faq.js              (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20480 par défaut)
 *     FAQ_ALLOWED_FR=50 node tests/test-i18n-faq.js   accepte ce nombre de questions encore en français par langue
 * 1. Node : fichiers de langue complets (scripts/i18n-check.js) ; FAQ traduite et .json à jour (scripts/build-faq-i18n.js) ;
 *    même repère de question dans le navigateur et dans le script ; textes tt() de la zone traduits.
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en la page est traduite, la recherche
 *    marche dans la langue et avec les liens en français (data-help-faq, UI.openFaq) ; allemand à 390 px ; aucune erreur JS.
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
const ALLOWED_FR = Number(process.env.FAQ_ALLOWED_FR || 0);
const F = require('../scripts/build-faq-i18n.js');
const LANGS = F.LANGS;
const MORE = path.join(root, 'assets/js/heritage-more.js');

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/faq.tsv')));
    });
    await t(`FAQ traduite dans les 7 langues (au plus ${ALLOWED_FR} réponses encore en français), sans ligne en trop`, () => {
        const st = F.status(), bad = [];
        for (const c of LANGS) {
            const r = st[c];
            if (r.total - r.done > ALLOWED_FR) bad.push(`${c} : ${r.total - r.done} réponses sans traduction à jour`);
            if (r.orphan.length) bad.push(`${c} : lignes en trop ${r.orphan.join(', ')}`);
            if (r.errors.length) bad.push(`${c} : ${r.errors.join(' ; ')}`);
        }
        assert.deepEqual(bad, []);
    });
    await t('les .json de la FAQ sont à jour avec les sources (node scripts/build-faq-i18n.js)', () => {
        const all = F.entries();
        for (const c of LANGS) {
            const j = JSON.parse(fs.readFileSync(path.join(F.DIR, `${c}.json`), 'utf8'));
            assert.equal(j._meta.version, F.VERSION, `${c}.json : version`);
            assert.equal(j._meta.total, all.length, `${c}.json : pas à jour, lance node scripts/build-faq-i18n.js`);
            const st = F.status()[c];
            assert.equal(j._meta.answers, st.done, `${c}.json : pas à jour, lance node scripts/build-faq-i18n.js`);
        }
        const src = fs.readFileSync(MORE, 'utf8');
        assert.ok(src.includes(`const FAQ_I18N_V = ${F.VERSION};`), 'FAQ_I18N_V (heritage-more.js) = VERSION (scripts/build-faq-i18n.js)');
    });
    await t('chaque question a un repère unique, et une traduction garde le symbole de tête de la question', () => {
        const all = F.entries();
        assert.equal(new Set(all.map(e => e.id)).size, all.length);
        for (const c of LANGS) {
            const j = JSON.parse(fs.readFileSync(path.join(F.DIR, `${c}.json`), 'utf8'));
            for (const [id, [q, a]] of Object.entries(j.items)) {
                assert.ok(q && q.trim(), `${c} ${id} : question vide`);
                if (a != null) assert.ok(a.trim(), `${c} ${id} : réponse vide`);
                assert.ok(!/«|»/.test(c === 'en' || c === 'de' || c === 'pl' || c === 'nl' ? q + (a || '') : ''), `${c} ${id} : guillemets français (glossaire : en “…”, de „…“, pl „…”, nl ‘…’)`);
            }
        }
    });
    await t('les textes passés à tt() dans la zone FAQ sont traduits dans les 7 langues', () => {
        const X = require('../scripts/i18n-extract.js');
        const src = fs.readFileSync(MORE, 'utf8'), from = src.slice(0, src.indexOf('const FAQ_I18N_V')).split('\n').length, to = src.slice(0, src.indexOf('ext.faqPopup = question')).split('\n').length + 8;
        const calls = X.tCalls(MORE).filter(x => x.line >= from && x.line <= to);
        assert.ok(calls.length >= 10, `${calls.length} textes`);
        const themes = F.readFaq().map(g => g[0]);
        for (const l of LANGS) {
            const dict = X.loadDict(l), miss = [];
            calls.forEach(x => { if (!X.translated(dict, x.text, x.ctx)) miss.push(`${x.line} ${x.text}`); });
            themes.forEach(th => { if (dict[`faq|${th}`] == null) miss.push(`thème ${th}`); });
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    await t('le français ne change pas', () => {
        const I = require('../assets/js/app-i18n.js');
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Questions fréquentes'), 'Questions fréquentes');
        assert.equal(I.t('Fiches', {ctx: 'faq'}), 'Fiches');
        I.setLang('de', {persist: false});
        assert.equal(I.t('Questions fréquentes'), 'Häufige Fragen');
        I.setLang('fr', {persist: false});
    });

    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction de la FAQ : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-faq-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20480;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const watch = (page, tag) => { page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss()); };
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { try { if (!sessionStorage.getItem('i18n-test-set')) { if (l) localStorage.setItem('lcnda-langue', l); else localStorage.removeItem('lcnda-langue'); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage(); watch(page, `${lang || 'fr'} ${w}px`);
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1500);
        return page;
    };
    const goFaq = async page => { await page.evaluate(async () => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close()); A.state.maintenanceTab = 'faq'; await A.setModule('maintenance'); }); await page.waitForSelector('[data-faq-q]'); await page.waitForTimeout(600); };
    const texts = (page, sel) => page.evaluate(sel => {
        const out = new Set();
        document.querySelectorAll(sel).forEach(el => {
            const tw = document.createTreeWalker(el, 5); let n = el;
            do {
                if (n.nodeType === 1) { if (n.closest('script, style, textarea, code, pre')) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
                else if (n.nodeType === 3 && !n.parentElement.closest('script, style, textarea, code, pre')) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
            } while ((n = tw.nextNode()));
        });
        return [...out];
    }, sel);
    const FIRST = F.entries()[0];
    try {
        await t('en français, rien ne change : la FAQ, ses thèmes et sa recherche restent en français', async () => {
            const page = await open();
            await goFaq(page);
            const r = await page.evaluate(q => ({lang: document.documentElement.lang, h: document.querySelector('.h-faq h3').textContent, first: document.querySelector('.h-faq-item summary').textContent, ph: document.querySelector('[data-faq-q]').placeholder, theme: document.querySelector('[data-faq-all] h4').textContent, fr: document.querySelectorAll('.h-faq-item[lang="fr"]').length, hit: window.LCNDA_EXT.faqSearch(q)[0].q}), FIRST.q);
            assert.deepEqual(r, {lang: 'fr', h: 'Questions fréquentes', first: FIRST.q, ph: 'Pose ta question : comment faire un livre de famille en PDF ?', theme: 'Fiches', fr: 0, hit: FIRST.q});
            await page.fill('[data-faq-q]', 'livre de famille pdf');
            assert.ok(/Les réponses les plus proches|La réponse la plus proche/.test(await page.locator('[data-faq-results]').innerText()));
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : la page FAQ / tuto est traduite, la recherche marche dans la langue et avec les liens en français`, async () => {
            const isFr = R.make(l), page = await open({lang: l});
            await goFaq(page);
            const j = JSON.parse(fs.readFileSync(path.join(F.DIR, `${l}.json`), 'utf8'));
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, h: document.querySelector('.h-faq h3').textContent, first: document.querySelector('.h-faq-item summary').textContent, theme: document.querySelector('[data-faq-all] h4').textContent, fr: document.querySelectorAll('.h-faq-item[lang="fr"]').length, items: document.querySelectorAll('.h-faq-item').length}));
            assert.equal(r.lang, l);
            assert.notEqual(r.h, 'Questions fréquentes');
            assert.equal(r.first, j.items[FIRST.id][0], 'la première question est traduite');
            assert.notEqual(r.theme, 'Fiches');
            assert.ok(r.items >= 700, `${r.items} questions`);
            assert.ok(r.fr <= ALLOWED_FR, `${r.fr} questions encore en français`);
            // le haut de la page (en-tête, cartes, case de recherche) : plus de français
            const head = (await texts(page, '.help-page > header, .help-guide-grid, .h-faq > h3, .h-faq-search, [data-faq-all] > p, [data-faq-all] > h4')).filter(isFr);
            assert.deepEqual(head, [], 'textes français restés en haut de la page');
            // la FAQ elle-même : les réponses traduites ne ressemblent pas à du français
            // (les noms propres français, gardés tels quels dans toutes les langues, ne comptent pas)
            const KEEP_FR = /Morts? pour la France|Mémoire des hommes|Meilleurs? Ouvriers? de France|Maîtres? d’art|Entreprise du patrimoine vivant|Légion d’honneur|Mérite agricole|Des villages de Cassini aux communes d’aujourd’hui|Comité français pour Yad Vashem|Centre d’études acadiennes|[Cc]ertificat d’études/g;
            const left = (await texts(page, '.h-faq-item:not([lang="fr"])')).filter(s => isFr(s.replace(KEEP_FR, '«»')));
            assert.ok(left.length <= 5, `textes de la FAQ qui ont l’air français : ${left.slice(0, 10).join(' | ')}`);
            // recherche dans la langue
            const words = {de: 'Sicherung', pl: 'kopia zapasowa', en: 'backup'}[l];
            await page.fill('[data-faq-q]', words);
            const res = await page.evaluate(() => ({n: document.querySelectorAll('[data-faq-results] .h-faq-item').length, intro: document.querySelector('[data-faq-results] p.muted')?.textContent || ''}));
            assert.ok(res.n >= 1, `recherche « ${words} » : ${res.n} réponse`);
            assert.ok(!/réponse/.test(res.intro), res.intro);
            // un lien de l'app qui cite la question française : la bonne question, affichée traduite dans la case
            await page.evaluate(q => window.LCNDA_UI.openFaq(q), FIRST.q); await page.waitForTimeout(500);
            const link = await page.evaluate(() => ({val: document.querySelector('[data-faq-q]').value, first: document.querySelector('[data-faq-results] .h-faq-item summary')?.textContent}));
            assert.equal(link.first, j.items[FIRST.id][0]);
            assert.equal(link.val, j.items[FIRST.id][0]);
            // un lien data-help-faq avec quelques mots français (« sauvegarde ») trouve encore des réponses
            const hits = await page.evaluate(() => (window.LCNDA_EXT.faqSearch('sauvegarde') || []).map(h => h.q));
            assert.ok(hits.length >= 1, 'data-help-faq « sauvegarde » : aucune réponse');
            // la fenêtre « ❓ Aide (FAQ) » d'un éditeur plein écran
            await page.evaluate(() => window.LCNDA_EXT.faqPopup('Comment se servir du tableur ?')); await page.waitForTimeout(400);
            const pop = await page.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].pop(); return d ? {title: d.querySelector('h2')?.textContent || '', body: d.innerText} : null; });
            assert.ok(pop && !/Aide \(FAQ\)/.test(pop.title) && !/Toutes les questions/.test(pop.body), JSON.stringify(pop).slice(0, 300));
            if (shots) await page.screenshot({path: path.join(shots, `i18n-faq-${l}.png`)});
            await page.context().close();
        });
        await t('la bulle « ? » dans une fenêtre montre la réponse traduite (app-ui.js, data-help-faq)', async () => {
            const page = await open({lang: 'de'});
            await goFaq(page);
            const r = await page.evaluate(async q => {
                const d = document.createElement('dialog'); d.innerHTML = '<p><span data-help="Hilfe" data-help-faq="' + q.replace(/"/g, '&quot;') + '">X</span></p>'; document.body.appendChild(d); d.showModal();
                await new Promise(res => setTimeout(res, 300));
                d.querySelector('.ui-help')?.click(); await new Promise(res => setTimeout(res, 200));
                document.querySelector('.ui-bubble [data-ui-faq]')?.click(); await new Promise(res => setTimeout(res, 200));
                return document.querySelector('.ui-bubble-faq b')?.textContent || '';
            }, FIRST.q);
            const j = JSON.parse(fs.readFileSync(path.join(F.DIR, 'de.json'), 'utf8'));
            assert.equal(r, j.items[FIRST.id][0]);
            await page.context().close();
        });
        await t('allemand à 390 px : la page FAQ / tuto ne déborde pas', async () => {
            const page = await open({lang: 'de', w: 390});
            await goFaq(page);
            await page.fill('[data-faq-q]', 'Sicherung');
            const r = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
            assert.ok(r <= 391, `${r} px`);
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction de la FAQ : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
