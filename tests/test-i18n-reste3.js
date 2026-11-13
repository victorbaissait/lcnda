'use strict';
/**
 * 🌐 Zone « reste3 » (balayage final) : les textes restés en français dans app.js, heritage.js, heritage-more.js (hors FAQ)
 * et app-maintenance.js — convertisseur de calendriers, OCR par lot, import, prévention, glossaire, étiquettes, branches,
 * hypothèses, doublons, export, éditeurs de blocs et de listes, copie chez un cousin, lecture d’écriture, listes
 * (départs, enfants placés, armoiries, poilus, inventaires, papiers, circuits, cartes anciennes, résistants, villages).
 * Traductions : assets/i18n/src/reste3.tsv.   node tests/test-i18n-reste3.js
 *  1. sans navigateur : chaque i18n('…') ajouté a ses 7 traductions, mêmes variables {x} ; reste3.tsv : 8 colonnes, pas de
 *     clé en double ni déjà dans un autre .tsv ; la lettre envoyée à la mairie reste en français (côté serveur, non touché) ;
 *  2. navigateur (Playwright, port 20690) : en de, pl, en, les écrans de la zone n’ont presque plus de français
 *     (scripts/i18n-remaining.js), en français rien ne change, à 390 px rien ne déborde en allemand, aucune erreur JS.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const REMAIN = require('../scripts/i18n-remaining.js');
const appRoot = path.resolve(__dirname, '..');
const FILES = ['app.js', 'heritage.js', 'heritage-more.js', 'app-maintenance.js'];
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
const MAX_PER_SCREEN = 6; // données d’exemple, noms propres, valeurs tapées, morceaux encore composés à la main
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ═════ 1. Sans navigateur ═════ */
    const dicts = Object.fromEntries(LANGS.map(l => [l, JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/i18n', `${l}.json`), 'utf8'))]));
    const tsv = fs.readFileSync(path.join(appRoot, 'assets/i18n/src/reste3.tsv'), 'utf8').split('\n');
    const own = new Set(tsv.filter(l => l && l[0] !== '#' && !l.startsWith('fr ¦')).map(l => l.split(/\t| ¦ /)[0].replace(/^=/, '')));
    await t('chaque clé de reste3.tsv est dans les 7 langues, mêmes variables', () => {
        const vars = s => (String(s).match(/\{[a-z_][a-z0-9_]*\}/gi) || []).sort().join(',');
        const miss = [];
        for (const k of own) for (const l of LANGS) {
            const v = dicts[l][k];
            if (v == null) { miss.push(`[${l}] ${k}`); continue; }
            const one = typeof v === 'object' ? Object.values(v)[0] : v;
            if (vars(one) !== vars(k)) miss.push(`[${l}] variables : ${k}`);
        }
        assert.deepEqual(miss, []);
    });
    await t('les phrases i18n(…) ajoutées dans les 4 fichiers sont traduites (7 langues)', () => {
        const miss = [];
        for (const f of FILES) {
            const src = fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8');
            assert.match(src, /const i18n = \(/, `${f} : l’aide i18n`);
            const re = /\bi18n\(\s*'((?:\\.|[^'\\])*)'\s*(?=[,)])/g; let m;
            while ((m = re.exec(src))) {
                const s = m[1].replace(/\\(.)/g, '$1');
                if (!own.has(s)) continue; // les autres clés appartiennent à d’autres zones
                for (const l of LANGS) if (dicts[l][s] == null) miss.push(`${f} [${l}] ${s}`);
            }
        }
        assert.deepEqual(miss, []);
    });
    await t('reste3.tsv : 8 colonnes, pas de clé en double ni déjà ailleurs', () => {
        const dir = path.join(appRoot, 'assets/i18n/src'), other = new Set();
        for (const f of fs.readdirSync(dir)) if (f.endsWith('.tsv') && f !== 'reste3.tsv') fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach(l => { if (l && l[0] !== '#') other.add(l.split(/\t| ¦ /)[0]); });
        const seen = new Map(), bad = [];
        tsv.forEach((l, i) => {
            if (!l || l[0] === '#' || l.startsWith('fr ¦')) return;
            const cells = l.split(/\t| ¦ /), k = cells[0];
            if (cells.length !== 8) bad.push(`ligne ${i + 1} : ${cells.length} colonnes`);
            if (seen.has(k)) bad.push(`« ${k} » en double (lignes ${seen.get(k)} et ${i + 1})`);
            if (other.has(k)) bad.push(`« ${k} » déjà dans un autre .tsv`);
            seen.set(k, i + 1);
        });
        assert.deepEqual(bad, []);
    });
    await t('la lettre à la mairie reste en français (seule l’interface autour se traduit)', () => {
        const src = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-more.js'), 'utf8');
        assert.match(src, /api\('act_request_letter'/); // le texte vient du serveur, en français, sans passer par i18n()
        assert.doesNotMatch(src, /i18n\(r\.letter|i18n\(form\.letter/);
        assert.equal(dicts.de['Lettre (tu peux la retoucher)'], 'Brief (du kannst ihn anpassen)');
    });

    /* ═════ 2. Navigateur ═════ */
    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— Playwright ou PHP absent : navigateur sauté'); if (failed) process.exit(1); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-reste3-')); fs.mkdirSync(path.join(tmp, 'media'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(__dirname, 'tresors-seed.php')], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !/ok$/.test(seed.stdout)) throw new Error(seed.stderr || seed.stdout);
    const port = 20690, base = `http://127.0.0.1:${port}/`;
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch();
    const open = async (lang, width = 1300) => {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        await ctx.addInitScript(l => { try { localStorage.setItem('lcnda-langue', l); localStorage.setItem('genealogie-visite-guidee', JSON.stringify({ never: true, done: true })); } catch (_) {} }, lang);
        const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.dismiss());
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.lists?.field_trips && window.LCNDA_EXT?.maintenance?.my_lists, null, { timeout: 30000 });
        return { page, errors, ctx };
    };
    const textsOf = (page, sel) => page.evaluate(sel => {
        const out = [];
        for (const root of document.querySelectorAll(sel)) {
            const off = el => el.closest('[data-i18n-off],script,style,code,textarea,kbd,pre,[data-person-id],.person-name,.table-link,select');
            const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
            while ((n = w.nextNode())) { const el = n.parentElement; if (!el || off(el) || !el.getClientRects().length) continue; const x = n.textContent.replace(/\s+/g, ' ').trim(); if (x) out.push(x); }
            root.querySelectorAll('[title],[aria-label],[placeholder]').forEach(el => { if (off(el)) return; ['title', 'aria-label', 'placeholder'].forEach(a => { const v = el.getAttribute(a); if (v) out.push(v.trim()); }); });
        }
        return out;
    }, sel);
    const settings = tab => async p => { await p.evaluate(async tab => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); const A = window.LCNDA_APP; A.state.maintenanceTab = tab; await A.setModule('maintenance'); }, tab); await p.waitForTimeout(1500); return '#workspace'; };
    const list = id => async p => { await p.evaluate(async id => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); const A = window.LCNDA_APP; A.state.listType = id; await A.setModule('listes'); }, id); await p.waitForTimeout(1500); return '#workspace'; };
    const SCREENS = [
        ['calendrier / mesures', async p => { await settings('calendar_measures')(p); return '#workspace .page-header, .calendar-tools-grid > section:nth-child(-n+3)'; }], // les autres cadres viennent d’autres zones (heritage-tools.js, heritage-calendar-more.js)
        ['OCR par lot, patronymes', settings('bulk')],
        ['prévention', settings('safety')],
        // Import et Export : la plupart des cadres viennent d’autres zones (heritage-imports-plus.js, heritage-echanges.js, heritage-partage.js…)
        ['étiquettes', settings('labels')],
        ['types d’événements', settings('event_types')],
        ['branches', settings('branches')],
        ['glossaire', settings('faq')],
        ['éditeur de blocs', settings('block_editor')],
        ['éditeur de listes', settings('my_lists')],
        ['copie chez un cousin', settings('cousin_vault')],
        ['lecture d’écriture', settings('htr')],
        ['départs', list('voyages_list')],
        ['enfants placés', list('placements_list')],
        ['armoiries', list('coats_of_arms')],
        ['poilus', list('poilus_list')],
        ['inventaires après décès', list('probate')],
        ['papiers de famille', list('family_papers')],
        ['circuits', list('field_trips')],
        ['cartes anciennes', list('old_maps')],
        ['résistants', list('resistance_list')],
        ['villages', list('villages')],
        ['épidémies, guerres, hivers', list('historical_context')],
        ['recensements', list('census_households')],
    ];
    try {
        await t('français : rien ne change, aucune erreur', async () => {
            const { page, errors, ctx } = await open('fr');
            await SCREENS[0][1](page);
            const txt = (await textsOf(page, '#workspace')).join(' | ');
            assert.match(txt, /Conversions utiles pour les actes anciens/); assert.match(txt, /5 ou 6 jours/);
            await SCREENS.find(x => x[0] === 'circuits')[1](page);
            assert.match((await textsOf(page, '#workspace')).join(' | '), /Aucun circuit|circuit/);
            assert.deepEqual(errors, []); await ctx.close();
        });
        for (const [lang, re] of [['de', /Nützliche Umrechnungen/], ['pl', /Przydatne przeliczenia/], ['en', /Useful conversions/]]) {
            await t(`${lang} : écrans de la zone traduits, aucune erreur JS`, async () => {
                const { page, errors, ctx } = await open(lang), isFr = REMAIN.make(lang), report = [], bad = [];
                for (const [name, show] of SCREENS) {
                    const sel = await show(page);
                    const texts = await textsOf(page, sel);
                    if (name === 'calendrier / mesures') assert.match(texts.join(' '), re);
                    const fr = [...new Set(texts.filter(isFr))];
                    if (fr.length) report.push(`${name} (${fr.length}) : ${(process.env.I18N_PROBE ? fr : fr.slice(0, 6)).join(' | ')}`);
                    if (fr.length > MAX_PER_SCREEN) bad.push(`${lang} · ${name} : ${fr.length} textes restés en français`);
                }
                if (report.length) console.log(`  ${lang} : français restant\n   ` + report.join('\n   '));
                assert.deepEqual(bad, []);
                assert.deepEqual(errors, []); await ctx.close();
            });
        }
        await t('de à 390 px : convertisseur, éditeur de listes, circuits ne débordent pas', async () => {
            const { page, errors, ctx } = await open('de', 390);
            for (const [name, show] of SCREENS.filter(x => ['calendrier / mesures', 'éditeur de listes', 'circuits'].includes(x[0]))) {
                await show(page);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), `${name} déborde`);
            }
            assert.deepEqual(errors, []); await ctx.close();
        });
    } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    if (failed) { console.error(`${failed} échec(s)`); process.exit(1); }
    console.log('✓ test-i18n-reste3 : tout passe');
})().catch(e => { console.error(e); process.exit(1); });
