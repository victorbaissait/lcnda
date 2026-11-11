'use strict';
/**
 * 🌐 Zone « reste2 » (balayage final) : 🧬 ADN (tests, correspondances, groupes, groupes automatiques, placer un cousin,
 * chromosomes, calculateur, lignées, réglages), 👤 Visages, 🔍 Comparer deux photos, 🧭 outils de la Carte (trajets, grande
 * carte, relief 3D, mes couches), 🏛 frontières anciennes, 👶 transmission des prénoms et 📊 Ta famille et la France, plus les
 * oublis signalés (calculette, traitements par lot, mois des diagrammes…) — assets/i18n/src/reste2.tsv.
 *     node tests/test-i18n-reste2.js
 *  1. sans navigateur : chaque i18n('…') des fichiers de la zone a sa traduction dans les 7 langues, mêmes variables {x} ;
 *     reste2.tsv : 8 colonnes, pas de clé en double ni déjà dans un autre .tsv ; le français ne change pas ;
 *  2. navigateur (Playwright, port 20680) : en de, pl, en, les écrans de la zone n’ont presque plus de français
 *     (scripts/i18n-remaining.js), en français rien ne change, à 390 px rien ne déborde en allemand, aucune erreur JS.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const REMAIN = require('../scripts/i18n-remaining.js');
const appRoot = path.resolve(__dirname, '..');
const FILES = ['heritage-dna.js', 'heritage-faces.js', 'heritage-photo-compare.js', 'heritage-cartes-outils.js', 'heritage-cartes-plus.js', 'heritage-prenoms-france.js'];
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
const MAX_PER_SCREEN = 6; // noms propres (provinces, sociétés de test), données d’exemple, valeurs tapées
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ═════ 1. Sans navigateur ═════ */
    const dicts = Object.fromEntries(LANGS.map(l => [l, JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/i18n', `${l}.json`), 'utf8'))]));
    const vars = s => (String(s).match(/\{[a-z_][a-z0-9_]*\}/gi) || []).sort().join(',');
    await t('chaque texte i18n(…) de la zone est traduit dans les 7 langues, mêmes variables', () => {
        const miss = [];
        for (const f of FILES) {
            const src = fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8');
            assert.match(src, /const i18n = \(s, v\) =>/, `${f} : l’aide i18n`);
            const re = /\bi18n\(\s*'((?:\\.|[^'\\])*)'\s*(?=[,)])(,\s*\{\s*ctx\s*:\s*'([a-z0-9-]+)')?/g; let m;
            while ((m = re.exec(src))) {
                const s = m[1].replace(/\\(.)/g, '$1'); if (!/\p{L}/u.test(s)) continue;
                const k = m[3] ? `${m[3]}|${s}` : s;
                for (const l of LANGS) {
                    const v = dicts[l][k] ?? dicts[l][s];
                    if (v == null) { miss.push(`${f} [${l}] ${k}`); continue; }
                    const one = typeof v === 'object' ? Object.values(v)[0] : v;
                    if (vars(one) !== vars(s)) miss.push(`${f} [${l}] variables : ${k}`);
                }
            }
        }
        assert.deepEqual(miss, []);
    });
    await t('textes choisis par une condition (ternaires) et oublis signalés : traduits', () => {
        const keys = ['Dans la <b>grappe {n}</b> — ancêtres communs de la grappe : {couple}.', 'Dans la <b>grappe {n}</b> — ancêtres probables de la grappe : {couple}.',
            '{n} entre {lo} et {hi} cM pour ce test (bornes dans ⚙️ Réglages)', '{n} groupes créés ou mis à jour.', 'Une femme reçoit un X de chaque parent. Un père ne transmet que le X qu’il tient de sa mère : certains ancêtres ne peuvent donc pas avoir donné d’X. {n} :',
            '✓ Analyse finie : {n}{more}.', '<b>{n}</b> identifiés', 'Il fallait environ {dur} pour aller de {from} à {to} en {year} ({how}, ≈ {what}).', '{km} sur l’eau', 'Itinéraire ajouté à « {name} »',
            '🏛 Département de 1790 : {name}', 'prénom expliqué sur {n}', 'Ressemblance très forte — ce n’est pas une preuve', 'Janv.', 'Juil.', 'Archive', '{n} vie à raconter : {list}', 'JEU', 'Simple', 'Scientifique', 'Ruban', 'chiffres', 'ex. mariage-1925'];
        const miss = keys.flatMap(k => LANGS.filter(l => dicts[l][k] == null).map(l => `[${l}] ${k}`));
        assert.deepEqual(miss, []);
    });
    await t('reste2.tsv : 8 colonnes, pas de clé en double ni déjà ailleurs', () => {
        const dir = path.join(appRoot, 'assets/i18n/src'), other = new Set();
        for (const f of fs.readdirSync(dir)) if (f.endsWith('.tsv') && f !== 'reste2.tsv') fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach(l => { if (l && l[0] !== '#') other.add(l.split(/\t| ¦ /)[0]); });
        const seen = new Map(), bad = [];
        fs.readFileSync(path.join(dir, 'reste2.tsv'), 'utf8').split('\n').forEach((l, i) => {
            if (!l || l[0] === '#' || l.startsWith('fr ¦')) return;
            const cells = l.split(/\t| ¦ /), k = cells[0];
            if (cells.length !== 8) bad.push(`ligne ${i + 1} : ${cells.length} colonnes`);
            if (seen.has(k)) bad.push(`« ${k} » en double (lignes ${seen.get(k)} et ${i + 1})`);
            if (other.has(k)) bad.push(`« ${k} » déjà dans un autre .tsv`);
            seen.set(k, i + 1);
        });
        assert.deepEqual(bad, []);
    });
    await t('français : t() rend le texte tel quel', () => {
        const I = require(path.join(appRoot, 'assets/js/app-i18n.js'));
        assert.equal(I.t('Grappe {n}', {n: 3}), 'Grappe 3');
        assert.equal(I.t('Il fallait environ {dur} pour aller de {from} à {to} en {year} ({how}, ≈ {what}).', {dur: '4 jours', from: 'Tulle', to: 'Paris', year: '1820', how: 'en diligence', what: '480 km de route'}),
            'Il fallait environ 4 jours pour aller de Tulle à Paris en 1820 (en diligence, ≈ 480 km de route).');
    });

    /* ═════ 2. Navigateur ═════ */
    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— Playwright ou PHP absent : navigateur sauté'); if (failed) process.exit(1); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-reste2-')); fs.mkdirSync(path.join(tmp, 'media'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(__dirname, 'tresors-seed.php')], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !/ok$/.test(seed.stdout)) throw new Error(seed.stderr || seed.stdout);
    const port = 20680, base = `http://127.0.0.1:${port}/`;
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch();
    const open = async (lang, width = 1300) => {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        await ctx.addInitScript(l => { try { localStorage.setItem('lcnda-langue', l); localStorage.setItem('genealogie-adn-prefs', JSON.stringify({ack: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.dismiss());
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.adn && window.LCNDA_EXT?.openFaces && window.LCNDA_EXT?.cartesOutils, null, { timeout: 30000 });
        // un test ADN et deux correspondances, pour que les pages ne soient pas vides
        await page.evaluate(async () => {
            const A = window.LCNDA_APP, post = (a, b) => A.api(a, {}, {method: 'POST', body: b});
            const d = await A.api('dna'); if (d.kits.length) return;
            const k = (await post('save_dna_kit', {label: 'Test', company: 'MyHeritage DNA', test_type: 'autosomal', haplo_y: 'R-M269', data: {}})).result.id;
            await post('save_dna_match', {kit_id: k, name: 'Paul Lefèvre', shared_cm: 230, segments: 9, longest_cm: 41, side: 'paternal', status: 'todo', data: {shared_matches: 'Anne Roux'}});
            await post('save_dna_match', {kit_id: k, name: 'Anne Roux', shared_cm: 120, segments: 6, longest_cm: 30, data: {shared_matches: 'Paul Lefèvre'}});
        });
        return { page, errors, ctx };
    };
    const textsOf = (page, sel) => page.evaluate(sel => {
        const out = [];
        for (const root of document.querySelectorAll(sel)) {
            const off = el => el.closest('[data-i18n-off],script,style,code,textarea,kbd,.pk-chip,select option:not(:checked),.h-dna-gchip,.cp-fr-label');
            const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
            while ((n = w.nextNode())) { const el = n.parentElement; if (!el || off(el) || !el.getClientRects().length) continue; const x = n.textContent.trim(); if (x) out.push(x); }
            root.querySelectorAll('[title],[aria-label],[placeholder]').forEach(el => { if (off(el)) return; ['title', 'aria-label', 'placeholder'].forEach(a => { const v = el.getAttribute(a); if (v) out.push(v.trim()); }); });
        }
        return out;
    }, sel);
    const dlg = async (p, fn, sel) => { await p.evaluate(fn); await p.waitForSelector(sel, { timeout: 15000 }); await p.waitForTimeout(600); return sel; };
    const adn = sec => async p => { await p.evaluate(s => { window.LCNDA_APP.state.adnTab = s; window.LCNDA_APP.setModule('adn'); }, sec); await p.waitForSelector(`.h-dna-page[data-dna-sec="${sec}"]`, { timeout: 15000 }); await p.waitForTimeout(700); return '.h-dna-page'; };
    const stats = type => async p => { await p.evaluate(ty => { const s = window.LCNDA_APP.state; s.graphMode = 'stats'; s.graphStatsType = ty; window.LCNDA_APP.setModule('graphiques'); }, type); await p.waitForSelector('#workspace .pf-page', { timeout: 15000 }); await p.waitForTimeout(500); return '#workspace .pf-page'; };
    const SCREENS = [
        ['ADN · synthèse', adn('home')], ['ADN · mes tests', adn('kits')], ['ADN · correspondances', adn('matches')], ['ADN · groupes (Leeds)', adn('groups')],
        ['ADN · groupes automatiques', adn('auto')], ['ADN · placer un cousin', adn('place')], ['ADN · chromosomes', adn('chromo')],
        ['ADN · calculateur', async p => { await adn('calc')(p); await p.fill('[data-dna-calc]', '230'); await p.dispatchEvent('[data-dna-calc]', 'change'); await p.waitForSelector('.h-dna-ref .is-fit', { timeout: 10000 }); await p.waitForTimeout(400); return '.h-dna-page'; }],
        ['ADN · lignées', adn('lines')], ['ADN · réglages', adn('settings')],
        ['ADN · une correspondance', async p => { await adn('matches')(p); await p.click('[data-dna-match]'); await p.waitForSelector('dialog[open] [data-dna-guess]', { timeout: 10000 }); await p.waitForTimeout(400); return 'dialog[open]'; }],
        ['visages', p => dlg(p, () => window.LCNDA_EXT.openFaces(), '.h-faces[open] .fc-srcs')],
        ['comparer deux photos', p => dlg(p, () => { window.LCNDA_EXT.openPhotoCompare({}); }, '.h-pc-dlg[open]')],
        ['distances et temps de trajet', p => dlg(p, () => window.LCNDA_EXT.cartesOutils.openTravel({from: {id: 1, title: 'Tulle', lat: 45.267, lon: 1.771}, to: {id: 3, title: 'Paris', lat: 48.857, lon: 2.352}, year: 1820}), '.cpo-travel-dlg[open] .cpo-phrase')],
        ['grande carte à imprimer', p => dlg(p, () => window.LCNDA_EXT.cartesOutils.openPoster(), '.cpo-poster-dlg[open]')],
        ['frontières anciennes (réglages)', async p => { await p.evaluate(() => { const s = window.LCNDA_APP.state; s.maintenanceTab = 'frontieres'; window.LCNDA_APP.setModule('maintenance'); }); await p.waitForSelector('#workspace .cp-settings', { timeout: 15000 }); await p.waitForTimeout(500); return '#workspace .cp-settings'; }],
        ['transmission des prénoms', stats('name_transmission')],
        ['ta famille et la France', stats('family_vs_france')],
    ];
    const close = p => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
    try {
        await t('français : rien ne change, aucune erreur', async () => {
            const { page, errors, ctx } = await open('fr');
            await SCREENS[7][1](page);
            const txt = (await textsOf(page, '.h-dna-page')).join(' | ');
            assert.match(txt, /Calculateur de cM/); assert.match(txt, /Tableau de référence/); assert.match(txt, /Cousin issu de germain/);
            await SCREENS[13][1](page);
            assert.match((await textsOf(page, 'dialog[open]')).join(' | '), /Il fallait environ .* pour aller de Tulle à Paris en 1820/);
            await close(page);
            assert.deepEqual(errors, []); await ctx.close();
        });
        for (const [lang, re] of [['de', /Referenztabelle/], ['pl', /Tabela referencyjna/], ['en', /Reference table/]]) {
            await t(`${lang} : écrans de la zone traduits, aucune erreur JS`, async () => {
                const { page, errors, ctx } = await open(lang), isFr = REMAIN.make(lang), report = [];
                for (const [name, show] of SCREENS) {
                    const sel = await show(page);
                    const texts = await textsOf(page, sel);
                    if (name === 'ADN · calculateur') assert.match(texts.join(' '), re);
                    const fr = [...new Set(texts.filter(isFr))];
                    if (fr.length) report.push(`${name} (${fr.length}) : ${fr.slice(0, 6).join(' | ')}`);
                    assert.ok(fr.length <= MAX_PER_SCREEN, `${lang} · ${name} : ${fr.length} textes restés en français : ${fr.join(' | ')}`);
                    await close(page);
                }
                if (report.length) console.log(`  ${lang} : français restant\n   ` + report.join('\n   '));
                assert.deepEqual(errors, []); await ctx.close();
            });
        }
        await t('de à 390 px : ADN, visages et trajets ne débordent pas', async () => {
            const { page, errors, ctx } = await open('de', 390);
            for (const i of [2, 7, 11, 13]) {
                await SCREENS[i][1](page);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2 && [...document.querySelectorAll('dialog[open]')].every(d => d.getBoundingClientRect().right <= window.innerWidth + 2)), `${SCREENS[i][0]} déborde`);
                await close(page);
            }
            assert.deepEqual(errors, []); await ctx.close();
        });
    } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    if (failed) { console.error(`${failed} échec(s)`); process.exit(1); }
    console.log('✓ test-i18n-reste2 : tout passe');
})().catch(e => { console.error(e); process.exit(1); });
