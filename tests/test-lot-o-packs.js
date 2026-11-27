#!/usr/bin/env node
/* 📖 ⛏ 🏰 📚 📡 ⛴ Lot O, suite (O5 textes rédigés, O6 Wikidata, O7 Internet Archive, O8 OpenStreetMap) : assets/js/app-lot-o-packs.js,
 * scripts/lot-o/*.py, .github/workflows/telech-o.yml, assets/data/lo-*.json.gz ; et les noms des relais remis avec leurs accents.
 * Données fictives (MAZAUD, LACOMBE, DURAND : tests/fixtures/lot-o-seed.php).   node tests/test-lot-o-packs.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gz = f => { const p = path.join(root, 'assets/data', f); return fs.existsSync(p) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(p))) : null; };

(async () => {
    /* ═════════ 0. les fichiers ═════════ */
    await t('📖 textes : chacun sourcé (page de Wikipédia en français), CC BY-SA 4.0, une période ; jamais de métier ni de lieu pour les exécutions', () => {
        const X = gz('lo-textes.json.gz'); assert.ok(X && X.rows.length >= 15); assert.strictEqual(X.licence, 'CC BY-SA 4.0');
        for (const r of X.rows) { const o = Object.fromEntries(X.fields.map((k, i) => [k, r[i]])); assert.match(o.url, /^https:\/\/fr\.wikipedia\.org\/wiki\//, o.id); assert.ok(o.text.length > 80 && o.src && o.from <= o.to, o.id); if (o.id === 'executions') assert.deepStrictEqual([o.jobs, o.places], [[], []]); }
        const src = fs.readFileSync(path.join(root, 'scripts/lot-o/textes.tsv'), 'utf8'); assert.ok(src.split('\n')[0].startsWith('id\ticon'));
    });
    await t('📚 livres : chaque volume gardé a une licence lue dans SA notice ; ⛏ mines : CC0, une position et une année', () => {
        const B = gz('lo-livres.json.gz'); assert.ok(B && B.rows.length >= 5);
        for (const r of B.rows) { assert.match(r[5], /domaine public|NOT_IN_COPYRIGHT/); assert.match(r[6], /^https:\/\/archive\.org\/details\//); }
        assert.ok(!B.rows.some(r => /salaires/i.test(r[1])), 'les Salaires de 1911 : licence non lue, pas dans le pack');
        const M = gz('lo-mines.json.gz'); assert.ok(M && M.rows.length >= 8); assert.strictEqual(M.licence, 'CC0 1.0');
        assert.ok(M.rows.every(r => Number.isFinite(r[4]) && Number.isFinite(r[5]) && r[2] > 1700)); assert.ok(M.rows.some(r => /Courri/.test(r[1])));
        const V = gz('lo-vauban.json.gz'); if (V) { assert.strictEqual(V.licence, 'CC0 1.0'); assert.ok(V.rows.length >= 12); assert.ok(V.rows.filter(r => r[6].includes('unesco')).length >= 10, 'les sites du patrimoine mondial'); }
    });
    await t('🐴 relais : accents remis d’après la liste officielle des communes (« Châtillon-en-Michaille »), sinon le nom du jeu', () => {
        const P = gz('lo-poste.json.gz'); const names = Object.values(P.relays).map(r => r[2]);
        assert.ok(names.includes('Châtillon-en-Michaille')); assert.ok(!names.includes('Chatillon-En-Michaille')); assert.ok(P.built);
    });
    await t('📡 ⛴ fabriqués sur GitHub : l’atelier relit la licence (Wikidata, OSM, notices IA, Zenodo) et garde le sommaire de la branche', () => {
        const wf = fs.readFileSync(path.join(root, '.github/workflows/telech-o.yml'), 'utf8');
        for (const s of ['build_wikidata.py', 'build_osm.py', 'build_ia.py', 'build-poste.py', 'build_textes.py', 'git checkout --ours assets/data/manifest.json', 'donnees-manifest.js']) assert.ok(wf.includes(s), s);
        const osm = fs.readFileSync(path.join(root, 'scripts/lot-o/build_osm.py'), 'utf8'); assert.ok(osm.includes('Open Data Commons Open Database License'));
        assert.ok(fs.readFileSync(path.join(root, 'scripts/lot-o/build_wikidata.py'), 'utf8').includes('Creative Commons CC0 License'));
        assert.ok(fs.readFileSync(path.join(root, 'scripts/lot-o/build_ia.py'), 'utf8').includes('NOT_IN_COPYRIGHT'));
        const gm = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/grands-mouvements.json'), 'utf8')); const sc = gm.mouvements.find(m => m.id === 'scieurs-long');
        assert.ok(sc && sc.saison && /Scieur_de_long/.test(sc.url) && gm.count === gm.mouvements.length);
    });

    /* ═════════ 1. l'écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lotopk-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(__dirname, 'fixtures/lot-o-seed.php')], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok":1/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const kill = () => { try { proc.kill(); } catch (_) {} };
    process.on('exit', kill);
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 150; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-premier-vu', '1'); localStorage.setItem('genealogie-visite-guidee', JSON.stringify({seen: true})); } catch (_) {} });
        const outside = [];
        await ctx.route(u => !u.toString().startsWith(base), r => { outside.push(r.request().url()); r.abort(); });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.lotOPacks && window.LCNDA_EXT?.lotOVie, null, {timeout: 60000});
        const text = sel => p.$eval(sel, el => el.textContent.replace(/\s+/g, ' ').trim());

        await t('fiche : le colporteur a UNE phrase sourcée dans 🌍 (pas de bloc en plus) ; rien pour une personne vivante', async () => {
            const n0 = await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 15; await A.setModule('personnes'); return document.querySelectorAll('#workspace .person-page section.card').length; });
            await p.waitForSelector('[data-world-host] [data-lopk-line]', {timeout: 30000});
            assert.match(await text('[data-world-host] [data-lopk-line]'), /Les colporteurs — Les colporteurs partaient à pied/);
            assert.ok(await p.$('[data-world-host] [data-lopk-line] a[href="https://fr.wikipedia.org/wiki/Colportage"][target="_blank"]'));
            assert.strictEqual(await p.$$eval('[data-lopk-line]', a => a.length), 1);
            assert.strictEqual(await p.$$eval('#workspace .person-page section.card', a => a.length), n0);
            await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 30; await A.setModule('personnes'); }); await sleep(1500);
            assert.strictEqual(await p.$('[data-lopk-line]'), null);
        });
        await t('textFor : métier d’abord, puis lieu, dans la période de la vie ; jamais une exécution', async () => {
            const r = await p.evaluate(async () => { const P = window.LCNDA_EXT.lotOPacks, X = (await P.pack('textes')).list;
                return [P.textFor(X, {birth: '1800', death: '1870', jobs: ['Colporteur']})?.id, P.textFor(X, {birth: '1820', death: '1900', jobs: [], bplace: {name: 'Rennes'}})?.id,
                    P.textFor(X, {birth: '1500', death: '1560', jobs: ['Colporteur']})?.id ?? null, X.some(t => t.id === 'executions') && !P.textFor(X.filter(t => t.id === 'executions'), {birth: '1800', death: '1900', jobs: ['bourreau']})]; });
            assert.deepStrictEqual(r, ['colporteurs', 'incendies', null, true]);
        });
        await t('village : « 🏰 Autour, dans l’histoire » (catastrophe de Courrières près de Courrières) ; calques et Listes des packs présents', async () => {
            await p.evaluate(() => { document.getElementById('workspace').insertAdjacentHTML('beforeend', '<div class="h-village" id="lopk-essai"><div data-pli-host data-pli-lat="50.41" data-pli-lon="2.95" data-pli-name="Courrières"></div><div class="h-village-grid"></div></div>'); });
            await p.waitForSelector('#lopk-essai [data-lopk-panel]', {timeout: 20000});
            assert.match(await text('#lopk-essai [data-lopk-panel]'), /catastrophe\(s\) minière\(s\) à moins de 15 km : .*catastrophe de Courrières \(1906\)/);
            await p.evaluate(() => document.getElementById('lopk-essai').remove());
            await p.waitForFunction(() => (window.LCNDA_EXT.dataLists || []).some(d => d.id === 'lo_mines') && (window.LCNDA_EXT.mapLayerSources || []).some(s => s.id === 'lo_mines'), null, {timeout: 20000});
            const r = await p.evaluate(async () => { const L = window.LCNDA_EXT.dataLists; const ids = L.filter(d => /^lo_/.test(d.id)).map(d => [d.id, d.theme]); const f = await window.LCNDA_EXT.mapLayerSources.find(s => s.id === 'lo_mines').run({}); return {ids, n: f.features.length}; });
            const ids = Object.fromEntries(r.ids); assert.strictEqual(ids.lo_mines, 'metiers'); assert.strictEqual(ids.lo_textes, 'evenements'); assert.strictEqual(ids.lo_livres, 'livres');
            assert.ok(r.n >= 8);
        });
        await t('rien ne sort de l’ordinateur ; aucune erreur JavaScript', () => {
            // (les tuiles du fond de carte, tile.openstreetmap.org, viennent de la carte de l'app, pas du lot O)
            assert.deepStrictEqual(outside.filter(u => !/^https:\/\/tile\.openstreetmap\.org\//.test(u) && /wikidata|archive\.org|openstreetmap|overpass|fr\.wikipedia\.org|zenodo/.test(u)), []);
            assert.deepStrictEqual(errs, []);
        });
    } finally { await browser.close().catch(() => {}); kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `\n✗ ${fails} en échec` : '\n✓ tout passe');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
