#!/usr/bin/env node
/* 🔀 Listes réunies (suite) — assets/js/app-listes-reunies-plus.js (+ le moteur app-listes-reunies.js, app-listes-donnees.js,
 *   app-listes-themes.js ; app-paniers-core.js pour les thèmes des sortes du panier).
 *  1. les déclarations : 🌋 Éruptions, 🌊 Crues, ⚔️ Batailles, 🏛 Monuments, 🎖 Soldats réunis (chacune dans son thème, avec ses
 *     colonnes, 👪 Dans la famille, la colonne Sources ↗) ; 🗺 Anciens noms : une seule liste réunie dans « Lieux » (celle du lot J,
 *     sinon une attente), jamais en double ;
 *  2. le moteur : `same.by` à plusieurs clés (Wikidata OU Mérimée), `many` (plusieurs repères d'une même crue), une crue = ± 3 jours
 *     ET < 10 km ; soldats : même nom et même naissance (« MOULIN Jean » = « Jean Moulin »), seulement des personnes décédées ;
 *     les éruptions livrées avec l'app (Wikipédia + NOAA) réunies par le numéro NOAA ;
 *  3. 🔎 « le mot est dans ses valeurs » : l'écran « 🧰 Toutes les données » trouve une liste par un mot de ses lignes, sans bloquer la frappe ;
 *  4. 👪 les cercles des lieux de la famille sur la carte d'une liste (rayon : le réglage) ; 🧺 les sortes du panier → les thèmes ;
 *     mode consultation ; aucune erreur.
 * Base : tests/prendre-depuis-seed.js (noms inventés ; Treignac, Tulle…).   node tests/test-listes-reunies-plus.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    try {
        await p.waitForFunction(() => window.LCNDA_EXT?.listesReuniesPlus && window.LCNDA_EXT?.listesValeurs, null, {timeout: 30000});
        const openKey = async k => { await p.evaluate(x => { const A = window.LCNDA_APP, H = window.LCNDA_EXT.dataHome; if (x === 'donnees' && H) H._st.view = 'themes'; A.state.listType = x; A.setModule('listes'); }, k); }; // 📊 Récap d'abord (app-donnees-accueil.js) : ici, la vue 🧰 Thèmes

        await t('déclarations : 5 listes réunies, chacune dans son thème, colonnes + Sources ↗ + 👪 ; anciens noms une seule fois', async () => {
            const r = await p.evaluate(() => { const E = window.LCNDA_EXT, TH = E.listesThemes;
                const ids = ['eruptions', 'crues', 'batailles', 'monuments', 'soldats'];
                const ms = E.dataListMerges.map(m => m.id);
                return {dup: ms.filter((x, i) => ms.indexOf(x) !== i), have: ids.map(id => !!E.dataLists.find(d => d.id === `reunie_${id}`)),
                    themes: Object.fromEntries(ids.map(id => [id, TH.themeOf(E.dataLists.find(d => d.id === `reunie_${id}`))])),
                    fam: ids.map(id => !!E.dataLists.find(d => d.id === `reunie_${id}`)?.familyColumn), src: ids.map(id => E.dataLists.find(d => d.id === `reunie_${id}`).fields.some(f => f.key === 'sources' && typeof f.html === 'function')),
                    lieux: E.dataListMerges.filter(m => m.theme === 'lieux' || /anciens?_?noms/.test(m.id)).length,
                    intos: E.dataListsEngine.list().flatMap(d => [].concat(d.merge || []).map(m => m.into)).filter(x => !E.dataListMerges.some(m => m.id === x))}; });
            assert.deepStrictEqual(r.dup, [], 'aucune liste réunie en double'); assert.deepStrictEqual(r.have, [true, true, true, true, true]);
            assert.deepStrictEqual(r.themes, {eruptions: 'seismes', crues: 'eaux', batailles: 'guerres', monuments: 'monuments', soldats: 'guerres'});
            assert.deepStrictEqual(r.fam, [true, true, true, true, true]); assert.deepStrictEqual(r.src, [true, true, true, true, true]);
            assert.strictEqual(r.lieux, 1, 'anciens noms : exactement une liste réunie (lot J, ou l’attente)'); assert.deepStrictEqual(r.intos, []);
        });
        await t('moteur : `by` à plusieurs clés (Wikidata OU Mérimée) ; `many` ; une crue = ± 3 jours et < 10 km', async () => {
            const r = await p.evaluate(() => { const R = window.LCNDA_EXT.listesReunies, D = Object.fromEntries(window.LCNDA_EXT.listesReuniesPlus.defs().map(m => [m.id, m]));
                const mer = {id: 'm', short: 'Mérimée', rank: 1}, wd = {id: 'w', short: 'Wikidata', rank: 2}, g = {id: 'g', short: 'G', rank: 3};
                const mon = R.merge(D.monuments, [
                    {src: g, key: 'g1', rec: {qid: 'Q1', name: 'Fort (G)'}}, {src: mer, key: 'm1', rec: {merimee: 'PA001', name: 'Château de X'}},
                    {src: wd, key: 'w1', rec: {qid: 'Q1', merimee: 'PA001', name: 'Château X (Wikidata)'}}, {src: wd, key: 'w2', rec: {qid: 'Q2', name: 'Autre'}}, {src: mer, key: 'm2', rec: {merimee: 'PA002', name: 'Rien à voir'}}]);
                const bdhi = {id: 'b', short: 'BDHI', rank: 1}, rep = {id: 'r', short: 'Repères', rank: 2, many: true}, cat = {id: 'c', short: 'CatNat', rank: 3};
                const cr = R.merge(D.crues, [
                    {src: bdhi, key: 'b1', rec: {date: '1910-01-21', lat: 48.85, lon: 2.35, place: 'Paris'}},
                    {src: rep, key: 'r1', rec: {date: '1910-01-28', lat: 48.86, lon: 2.34}}, // 7 jours : non
                    {src: rep, key: 'r2', rec: {date: '1910-01-23', lat: 48.87, lon: 2.36}}, {src: rep, key: 'r3', rec: {date: '1910-01-20', lat: 48.84, lon: 2.33}}, // ± 3 jours, < 10 km : oui, les deux
                    {src: cat, key: 'c1', rec: {date: '1910-01-22', lat: 49.0, lon: 2.35}}, // 17 km : non
                    {src: cat, key: 'c2', rec: {date: '1910-01-22', lat: 48.9, lon: 2.35}}]); // 6 km : oui
                const k = Object.fromEntries(mon.map(x => [x._k, x._members.map(m => m.key)])), c = cr.find(x => x._k === 'b1');
                return {mon: k, monN: mon.length, crue: c._members.map(m => m.key).sort(), srcs: c.sources, crN: cr.length};
            });
            assert.deepStrictEqual(r.mon.m1, ['m1', 'w1', 'g1'], 'Mérimée ↔ Wikidata (même PA) ↔ lot G (même Q)'); assert.strictEqual(r.monN, 3);
            assert.deepStrictEqual(r.crue, ['b1', 'c2', 'r2', 'r3']); assert.deepStrictEqual(r.srcs, ['BDHI', 'Repères', 'CatNat'], 'chaque source une fois dans « Sources »');
            assert.strictEqual(r.crN, 3);
        });
        await t('soldats : même nom et même naissance, jamais une personne vivante ; éruptions : clé NOAA, volcan + année', async () => {
            const r = await p.evaluate(() => { const X = window.LCNDA_EXT.listesReuniesPlus, D = Object.fromEntries(X.defs().map(m => [m.id, m]));
                const comp = D.soldats.sources.find(s => s.list === 'tg_compagnons');
                return {a: X.personKey('Jean Moulin', 1899), b: X.personKey('Jean MOULIN', '1899'), c: X.personKey('Jean Moulin', null), liv: comp.when({name: 'Luc MAZAUD', born: 1990, died: null}), old: comp.when({name: 'X Y', born: 1890, died: null}), dead: comp.when({name: 'X Y', born: 1920, died: 1944}),
                    v1: X.volcKey('Tambora', 1815), v2: X.volcKey('Laki (Lakagígar)', 1783), v3: X.volcKey('non identifié', 1641), n: X.noaaId('https://www.ngdc.noaa.gov/hazel/view/hazards/volcano/event-more-info/4052'), iso: X.iso('12/03/1890')}; });
            assert.strictEqual(r.a, 'jean moulin|1899'); assert.strictEqual(r.a, r.b); assert.strictEqual(r.c, '');
            assert.strictEqual(r.liv, false, 'vivant : jamais'); assert.strictEqual(r.old, true); assert.strictEqual(r.dead, true);
            assert.strictEqual(r.v1, 'tambora|1815'); assert.strictEqual(r.v2, 'laki|1783'); assert.strictEqual(r.v3, ''); assert.strictEqual(r.n, '4052'); assert.strictEqual(r.iso, '1890-03-12');
        });
        await t('🌋 Éruptions réunies (données livrées) : Huaynaputina 1600 = Wikipédia + NOAA ; source ↗ par ligne', async () => {
            const r = await p.evaluate(async () => { const E = window.LCNDA_EXT, R = E.listesReunies, M = E.dataListMerges.find(m => m.id === 'eruptions');
                const act = (await Promise.all(R.sourcesOf(M).map(async s => [s.list, await E.dataListsEngine.isInstalled(s.d) && E.dataListsEngine.shown(s.d)]))).filter(x => x[1]).map(x => x[0]);
                const b = await R.build('eruptions'); const h = b.rows.find(x => /huaynaputina/i.test(x.volcano || ''));
                return {act, n: b.rows.length, h: h && {srcs: h.sources, urls: h._members.map(m => m.rec.url).filter(u => /^https:\/\//.test(u)).length, year: h.year}}; });
            if (r.act.length < 2) { console.log(`  (sources installées : ${r.act.join(', ') || 'aucune'} — réunion non vérifiée sur les vraies données)`); return; }
            assert.ok(r.n > 10, String(r.n)); assert.ok(r.h, 'Huaynaputina trouvé'); assert.ok(r.h.srcs.length >= 2, JSON.stringify(r.h)); assert.ok(r.h.urls >= 2, 'une source ↗ par ligne');
        });
        await t('🔎 « le mot est dans ses valeurs » : un mot des lignes (pas du nom) trouve la liste, la frappe n’attend pas', async () => {
            await openKey('donnees'); await p.waitForSelector('.ldt-overview [data-ld-ov-q]');
            const w = await p.evaluate(async () => { const E = window.LCNDA_EXT, d = E.dataListsEngine.list().find(x => x.id === 'ha_batailles');
                const rows = await E.dataListsEngine.loadAll(d); const f = E.dataListsEngine.fold; const hay = f(`${d.label} ${d.id} ${d.source}`);
                const r = rows.find(x => /^[A-Za-z]{6,}$/.test(String(x.place || '')) && !hay.includes(f(x.place))); return r ? f(r.place) : ''; });
            assert.ok(w, 'un mot des valeurs');
            const t0 = Date.now(); await p.fill('[data-ld-ov-q]', w); const typed = Date.now() - t0;
            assert.ok(typed < 1500, `frappe : ${typed} ms`);
            await p.waitForSelector('[data-ld-go="data_ha_batailles"] .ldt-inval', {timeout: 60000});
            assert.match(await p.textContent('[data-ld-go="data_ha_batailles"]'), /le mot est dans ses valeurs/);
            assert.ok(await p.evaluate(x => window.LCNDA_EXT.listesValeurs.has(window.LCNDA_EXT.dataListsEngine.list().find(d => d.id === 'ha_batailles'), x.slice(0, 4)), w), 'le début du mot suffit');
            await p.fill('[data-ld-ov-q]', '');
        });
        await t('👪 la carte d’une liste : un cercle vert autour des lieux de la famille (rayon = réglage), sans recadrer ; rien pour une liste sans famille', async () => {
            const r = await p.evaluate(async () => { const E = window.LCNDA_EXT; await E.listesFamille.ready();
                const pts = [{lat: 45.27, lon: 1.77}], d = {familyColumn: true}, st = {chips: [], crit: []};
                const a = E.listesCarteFamille(d, st, pts, () => {}); localStorage.setItem('genealogie-listes-famille-km', '30'); const b = E.listesCarteFamille(d, st, pts, () => {}); localStorage.removeItem('genealogie-listes-famille-km');
                return {n: a.length, km: a[0]?.km, nofit: a.every(c => c.nofit && c.color), km30: b[0]?.km, none: E.listesCarteFamille({}, st, pts, () => {}).length,
                    chip: E.listesCarteFamille({}, {chips: ['famille'], crit: []}, pts, () => {}).length}; });
            assert.ok(r.n >= 1, 'Treignac / Tulle près de Tulle'); assert.strictEqual(r.km, 15); assert.strictEqual(r.km30, 30); assert.ok(r.nofit);
            assert.strictEqual(r.none, 0); assert.ok(r.chip >= 1, 'pastille 👪 allumée : les cercles aussi');
            await openKey('data_reunie_batailles'); await p.waitForSelector('[data-ld-page="reunie_batailles"] [data-ld-view="map"]', {timeout: 30000});
            await p.click('[data-ld-page="reunie_batailles"] [data-ld-view="map"]');
            await p.waitForFunction(() => document.querySelectorAll('[data-ld-results] .mm-circle').length > 0, null, {timeout: 30000});
            await p.evaluate(() => localStorage.removeItem('lcnda-ld:reunie_batailles'));
        });
        await t('🧺 les sortes du panier → les thèmes des listes ; leur liste réunie en dernier recours', async () => {
            const r = await p.evaluate(() => { const C = window.LCNDA_EXT.paniersCore; return {sei: C.themeOf('sei'), bat: C.themeOf('bat'), inn: C.themeOf('inn'), mh: C.SMART.find(c => c.k === 'mh').merged, g: C.byTheme().map(g => g.theme.id)}; });
            assert.strictEqual(r.sei.id, 'seismes'); assert.ok(r.sei.icon && r.sei.label, 'icône et nom du registre des thèmes'); assert.strictEqual(r.bat.id, 'guerres'); assert.strictEqual(r.inn.id, 'eaux');
            assert.strictEqual(r.mh, 'reunie_monuments'); assert.deepStrictEqual([...new Set(r.g)], r.g, 'un groupe par thème');
        });
        await t('mode consultation : une liste réunie s’ouvre, ✂ éteint', async () => {
            await p.evaluate(() => { document.body.classList.add('is-kiosk'); localStorage.removeItem('lcnda-ld:reunie_batailles'); });
            await openKey('donnees'); await p.waitForSelector('.ldt-overview'); await openKey('data_reunie_batailles'); await p.waitForSelector('[data-ld-page="reunie_batailles"] .ld-table tbody tr[data-ld-row]', {timeout: 30000});
            await p.click('.ld-table tbody tr[data-ld-row="0"] [data-ld-open]'); await p.waitForSelector('.ldr-detail');
            assert.ok(await p.$$eval('.ldr-detail [data-ldr-split], .ldr-detail [data-ldr-bk]', bs => bs.every(b => b.disabled)));
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('aucune erreur dans la page', async () => { await sleep(300); assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
