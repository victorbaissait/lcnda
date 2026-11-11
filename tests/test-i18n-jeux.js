'use strict';
/* 🌐 Traduction de la zone « jeux » (dernière vague) : le cadre commun des jeux (L2), Jeu de l’oie, Qui est-ce ?, Memory, La bonne date,
 * Morpion, Bataille navale, Câbles, Échecs, Dames, Dominos, Yams, 🌀 Labyrinthe, 🧩 Puzzle, 🂠 Patiences, 🂡 Jeux de cartes à plusieurs.
 * (Le bunker a son propre test.) Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-jeux.js                (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20610 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-jeux.js   liste les textes français restés sur chaque écran (sans rien vérifier)
 * 1. Node : fichiers de langue complets (scripts/i18n-check.js) ; chaque texte i18n('…') et chaque mot de pluriel des fichiers de la
 *    zone a sa traduction dans les 7 langues ; les noms et règles des patiences et des jeux de cartes aussi ; dans Node, les moteurs
 *    (patiences, jeux de cartes, labyrinthe) restent en français.
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, l’écran de préparation de chaque jeu et une
 *    partie commencée (patience, belote, labyrinthe, morpion, échecs, dames, yams…) n’ont presque plus de français ; rien ne déborde
 *    à 390 px en allemand ; aucune erreur JS.
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
const PROBE = process.env.I18N_PROBE || '';
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
const ZONE_FILES = ['app-jeu.js', 'app-jeu-famille.js', 'app-jeu-famille-logique.js', 'app-jeu-quiestce.js', 'app-jeu-memory.js', 'app-jeu-timeline.js', 'app-jeu-morpion.js',
    'app-jeu-naval.js', 'app-jeu-cables.js', 'app-jeu-plateau.js', 'app-jeu-echecs.js', 'app-jeu-dames.js', 'app-jeu-dominos.js', 'app-jeu-yams.js',
    'app-labyrinthe.js', 'app-puzzle.js', 'app-jeu-patience.js', 'app-jeu-cartes.js', 'app-jeu-cartes-regles.js'].map(f => path.join(root, 'assets/js', f));
// au plus ce nombre de textes français par écran (noms propres des jeux, mots venus d'une autre zone)
const ALLOWED = Number(process.env.I18N_ALLOWED || 4);
// les écrans de préparation : la valeur du menu « Jeu ▾ »
const VARIANTS = ['goose', 'snakes', 'horses', 'puzzle', 'laby', 'quiz', 'memory', 'timeline', 'morpion', 'naval', 'cables', 'patience', 'cartes', 'echecs', 'dames', 'dominos', 'yams'];
// les parties qu'on commence (celles qui ne demandent pas d'images)
const STARTS = ['patience', 'cartes', 'laby', 'morpion', 'echecs', 'dames', 'dominos', 'yams', 'naval', 'cables'];

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/jeux.tsv')));
    });
    const X = require('../scripts/i18n-extract.js');
    const un = s => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    await t('chaque i18n(\'…\') et chaque mot de pluriel des fichiers de la zone a sa traduction dans les 7 langues', () => {
        for (const l of LANGS) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) {
                const src = fs.readFileSync(f, 'utf8'); let m;
                const rx = /\bi18n\(\s*'((?:[^'\\]|\\.)*)'/g;
                while ((m = rx.exec(src))) {
                    const s = un(m[1]), after = src.slice(rx.lastIndex, rx.lastIndex + 200), arg = /^\s*,\s*\{[^{}]*\}/.exec(after), cx = arg && /ctx:\s*'(\w+)'/.exec(arg[0]);
                    const k = cx ? `${cx[1]}|${s}` : s; if (/\p{L}{2}/u.test(s) && dict[k] == null && dict[s] == null) miss.push(`${path.basename(f)} ${k}`);
                }
                const rp = /\bplural\([^,()]*(?:\([^()]*\)[^,()]*)*,\s*'((?:[^'\\]|\\.)*)'/g;
                while ((m = rp.exec(src))) { const s = un(m[1]); if (!dict[s] || typeof dict[s] !== 'object') miss.push(`${path.basename(f)} pluriel ${s}`); }
            }
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    global.window = global;
    require('../assets/js/app-jeu-patience-regles.js'); require('../assets/js/app-jeu-cartes-regles.js');
    await t('noms, présentations et règles des patiences et des jeux de cartes traduits (clés exactes)', () => {
        const keys = new Set();
        window.LCNDA_PATIENCES.GAMES.forEach(g => { if (/\p{Ll}/u.test(g.desc || '')) keys.add(g.desc); if (g.stockLabel) keys.add(g.stockLabel); });
        window.LCNDA_PATIENCES.FAMILIES.forEach(f => { keys.add(f[1]); keys.add(f[2]); });
        window.LCNDA_CARTES.GAMES.forEach(g => { keys.add(g.name); keys.add(g.desc); g.rules.forEach(r => keys.add(r)); });
        Object.values(window.LCNDA_CARTES.helpers.CONTRACTS).filter(Boolean).forEach(k => keys.add(k));
        Object.values(window.LCNDA_CARTES.helpers.TITLES).flat().forEach(k => keys.add(k));
        for (const l of LANGS) { const dict = X.loadDict(l); const miss = [...keys].filter(k => dict[k] == null); assert.deepEqual(miss, [], `${l} : ${miss.join(' | ')}`); }
    });
    await t('dans Node, les moteurs restent en français (noms des cartes, messages, journal)', () => {
        const C = window.LCNDA_CARTES;
        assert.equal(C.cardName({r: 12, s: 2}), 'Dame de pique');
        assert.equal(C.cardName({r: 1, s: 4}, 'tarot'), 'le Petit (atout 1)');
        const st = C.create('huit', {n: 3, seed: 'i18n'});
        assert.deepEqual(st.names, ['Toi', 'Ouest', 'Est']);
        const r = C.play(st, {t: 'play', c: -1}); assert.equal(r.ok, false); assert.equal(r.msg, 'Cette carte n’est pas dans ta main.');
        assert.equal(C.play({...st, over: true}, {t: 'pass'}).msg, 'La partie est finie.');
        assert.ok(window.LCNDA_PATIENCES.GAMES.some(g => /^Klondike/.test(g.name)), 'les noms des patiences restent tels quels');
        const L = require('../assets/js/app-labyrinthe-core.js'); assert.ok(L, 'le moteur du labyrinthe se charge dans Node');
    });

    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction des jeux : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-jeux-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    // une petite famille (données : jamais traduites), toutes décédées
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$names = [['Joseph','Martin','male',1840],['Marie','Durand','female',1845],['Louis','Martin','male',1870],['Jeanne','Roche','female',1872],['Pierre','Martin','male',1898],['Anne','Bost','female',1900],['Jean','Martin','male',1925],['Rose','Faure','female',1928]];
foreach ($names as $n) $p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('$n[0]','$n[1]','$n[2]','deceased')");
$p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20610;
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
        await page.goto(base, {waitUntil: 'load'});
        await page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_APP.state.csrf && window.LCNDA_JEUX_FAMILLE?.KEYS?.includes('cartes') && window.LCNDA_LABY);
        await page.evaluate(async () => { await window.LCNDA_APP.setModule('jeu'); });
        await page.waitForSelector('select[name="variant"]');
        await page.waitForTimeout(500);
        return page;
    };
    // l'écran de préparation d'un jeu (une nouvelle partie)
    const setup = async (page, v) => {
        if (!await page.$('select[name="variant"]')) { const nb = await page.$('[data-jf-new], [data-goose-new], [data-lb-new]'); if (nb) await nb.click(); else await page.evaluate(async () => { localStorage.setItem('genealogie-goose-active-v1', ''); await window.LCNDA_APP.setModule('dashboard'); await window.LCNDA_APP.setModule('jeu'); }); await page.waitForSelector('select[name="variant"]'); }
        await page.selectOption('select[name="variant"]', v); await page.waitForTimeout(400);
    };
    // les textes visibles de la page du jeu (hors données : noms des personnes, cases de saisie)
    const texts = page => page.evaluate(() => {
        const el = document.querySelector('.goose-page')?.parentElement || document.querySelector('main'); if (!el) return [];
        const out = new Set();
        const skip = '[data-i18n-off], script, style, textarea, code, pre, svg text, [data-person-id], .person-name, .pk-chip, .cx-por, .jf-player input, .side-button strong, .ui-avatar';
        const tw = document.createTreeWalker(el, 5); let n = el;
        do {
            if (n.nodeType === 1) { if (n.closest(skip) || n.closest('[hidden]')) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
            else if (n.nodeType === 3 && !n.parentElement.closest(skip) && !n.parentElement.closest('[hidden]')) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
        } while ((n = tw.nextNode()));
        el.querySelectorAll('select:not([data-i18n-off]) option').forEach(o => { const s = o.textContent.trim(); if (s) out.add(s); });
        return [...out];
    });
    // commencer la partie depuis l'écran de préparation
    const start = async (page, v) => {
        await setup(page, v);
        // un clic par le code : à 390 px, le bandeau de la langue ou un message peut passer par-dessus le bouton
        await page.evaluate(() => { document.querySelector('[data-jf-seg="scope"][data-v="all"]')?.click(); document.querySelector('#jf-setup-form [type=submit], #lb-setup-form [type=submit], .goose-page form [type=submit]')?.click(); });
        await page.waitForTimeout(1500);
    };
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE});
            for (const v of VARIANTS) { await setup(page, v); const l = (await texts(page)).filter(isFr); console.log(`── préparation ${v} (${l.length})`); l.forEach(s => console.log('   ', s)); }
            for (const v of STARTS) { await start(page, v); const l = (await texts(page)).filter(isFr); console.log(`══ partie ${v} (${l.length})`); l.forEach(s => console.log('   ', s)); }
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : pas de bandeau, html lang="fr", les jeux en français', async () => {
            const page = await open();
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), opts: [...document.querySelectorAll('select[name="variant"] option')].map(o => o.textContent)}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false);
            assert.ok(r.opts.includes('🂡 Jeux de cartes à plusieurs') && r.opts.includes('🌀 Labyrinthe'), r.opts.join(' | '));
            await setup(page, 'cartes'); await page.selectOption('[data-cx-game]', 'president'); await page.waitForTimeout(150);
            assert.match(await page.$eval('[data-cx-pnote]', e => e.textContent), /Président : de 3 à 4 joueurs\. Une seule personne à la table/);
            await setup(page, 'patience');
            assert.match(await page.$eval('[data-jfp-desc]', e => e.textContent), /Klondike/);
            assert.ok((await texts(page)).includes('Dos des cartes'));
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : la préparation des ${VARIANTS.length} jeux et ${STARTS.length} parties sont traduites (au plus ${ALLOWED} textes français chacun)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            const opts = await page.$$eval('select[name="variant"] option', o => o.map(x => x.textContent));
            assert.ok(!opts.includes('🂡 Jeux de cartes à plusieurs'), 'le menu « Jeu ▾ » est traduit');
            for (const v of VARIANTS) { await setup(page, v); const left = (await texts(page)).filter(isFr); if (left.length > ALLOWED) bad[`préparation ${v}`] = left; }
            for (const v of STARTS) {
                await start(page, v); const left = (await texts(page)).filter(isFr); if (left.length > ALLOWED) bad[`partie ${v}`] = left;
                if (shots) await page.screenshot({path: path.join(shots, `i18n-jeux-${l}-${v}.png`)});
            }
            assert.deepEqual(bad, {}, `textes français restés : ${JSON.stringify(bad, null, 1)}`);
            await page.context().close();
        });
        await t('allemand à 390 px : préparations et parties ne débordent pas', async () => {
            const page = await open({lang: 'de', w: 390}), wide = [];
            const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            for (const v of VARIANTS) { await setup(page, v); const o = await over(); if (o > 1) wide.push(`préparation ${v} (+${o}px)`); }
            for (const v of STARTS) { await start(page, v); const o = await over(); if (o > 1) wide.push(`partie ${v} (+${o}px)`); }
            assert.deepEqual(wide, []);
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close();
        proc.kill();
        try { spawnSync('fuser', ['-k', `${port}/tcp`]); } catch (_) {}
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction des jeux : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
