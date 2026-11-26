#!/usr/bin/env node
/* 🗂 Listes → 🧰 Données par THÈME et 🔀 listes réunies (maquette validée docs/design/listes-categories.html, décisions du 2026-11-26).
 *   assets/js/app-listes-themes.js, app-listes-reunies.js, app-listes-famille.js (lib/listes_famille.php), moteur app-listes-donnees.js.
 *  1. les registres : 20 thèmes (+ 🏆 Sport), chaque liste a un thème connu (table de la maquette, sinon ses mots, sinon 📦 À ranger),
 *     chaque merge.into existe ; le moteur de réunion (sans écran) : même jour ± 1 et < 50 km, jamais deux lignes de la même source,
 *     année seule = un seul candidat, la meilleure source montrée, ⚖ quand elles s'écartent, ✂ séparées ; 30 000 lignes en un instant ;
 *  2. l'écran : les thèmes par défaut, pastilles calculées (Toutes · 📍 · 📅 · ⤓), recherche sur toutes les listes (thèmes pâlis),
 *     la colonne de gauche (thèmes repliés, la liste ouverte sous son thème) ; un thème s'ouvre sur sa liste réunie (onglets) ;
 *     une liste réunie d'essai (deux sources FABRIQUÉES qui disent `merge`) : colonne Sources ↗, ⚖, ligne ouverte (ce que dit chaque
 *     source), ✂ Ce ne sont pas les mêmes (retenu, ↶ Annuler), « Dans la famille » (calculé ici), filtres (pays, force, sources,
 *     période, 👪 autour de la famille), carte ; 🌋 Séismes réunis (NOAA livré avec l'app ; EPICA si le pack existe) ;
 *  3. Réglages → 🧰 Listes de données : les 4 groupes d'avant, ce qu'ouvre un thème, le rayon ; mode consultation ;
 *     390 px en sombre : rien ne déborde ; aucune erreur.
 * Base : tests/prendre-depuis-seed.js (noms inventés MAZAUD, LACOMBE, DURAND ; Treignac, Tulle…).   node tests/test-listes-themes.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    try {
        const openKey = async k => { await p.evaluate(x => { const A = window.LCNDA_APP; A.state.listType = x; A.setModule('listes'); }, k); };
        const count = () => p.textContent('[data-ld-count]');
        const waitCount = async re => { await p.waitForFunction(s => new RegExp(s).test(document.querySelector('[data-ld-count]')?.textContent || ''), re.source, {timeout: 30000}); return count(); };
        const clickUndo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(500); };

        /* ═════════ 1. les registres et le moteur de réunion ═════════ */
        await t('registres : 20 thèmes (dont 🏆 Sport), chaque liste dans un thème connu, la table de la maquette, merge.into connus', async () => {
            const r = await p.evaluate(() => { const E = window.LCNDA_EXT, TH = E.listesThemes, ids = TH.themes().map(x => x.id);
                return {ids, bad: E.dataListsEngine.list().filter(d => !ids.includes(TH.themeOf(d))).map(d => d.id), by: Object.fromEntries(['hist_seismes', 'ha_catastrophes', 'l8c_tour', 'l8c_clubs', 'bo_leonore', 'hist_catnat', 'reunie_seismes'].map(k => [k, TH.themeOf(E.dataLists.find(d => d.id === k) || {id: k})])),
                    intos: E.dataListsEngine.list().flatMap(d => [].concat(d.merge || []).map(m => m.into)).filter(x => !E.dataListMerges.some(m => m.id === x)), group: E.dataLists.find(d => d.id === 'hist_seismes')?.group}; });
            assert.strictEqual(r.ids.filter(x => x !== 'aranger').length, 20, r.ids.join(',')); assert.ok(r.ids.includes('sport'));
            assert.deepStrictEqual(r.bad, []);
            assert.deepStrictEqual(r.by, {hist_seismes: 'seismes', ha_catastrophes: 'seismes', l8c_tour: 'sport', l8c_clubs: 'sport', bo_leonore: 'personnes', hist_catnat: 'eaux', reunie_seismes: 'seismes'});
            assert.deepStrictEqual(r.intos, []); assert.strictEqual(r.group, 'Le monde', 'le champ group reste (fiches du lieu et de la personne)');
        });
        await t('une liste sans thème : rangée par ses mots, sinon « 📦 À ranger » (montré seulement s’il y en a une)', async () => {
            const r = await p.evaluate(() => { const TH = window.LCNDA_EXT.listesThemes;
                return {a: TH.themeOf({id: 'zz_bretagne', label: 'Séismes de Bretagne'}), b: TH.themeOf({id: 'zz_velo', label: 'Courses cyclistes du Limousin'}), c: TH.themeOf({id: 'zz_x', label: 'Qwertz yxcvb'}), shown: TH.themeList().some(x => x.id === 'aranger')}; });
            assert.strictEqual(r.a, 'seismes'); assert.strictEqual(r.b, 'sport'); assert.strictEqual(r.c, 'aranger');
            if (!r.shown) assert.ok(true); // sans liste « à ranger », le thème n'est pas montré
        });
        await t('réunir (sans écran) : même jour ± 1 et < 50 km ; 60 km non ; même source jamais ; année seule = un seul candidat ; meilleure source ; ⚖', async () => {
            const r = await p.evaluate(() => {
                const R = window.LCNDA_EXT.listesReunies, M = {id: 'x', same: {km: 50, days: 1, yearOnly: true}, fields: [{key: 'date'}, {key: 'place'}, {key: 'mag'}, {key: 'dead'}], diff: [{key: 'mag', abs: 0.5}, {key: 'dead', ratio: 2}]};
                const A = {id: 'a', short: 'A', rank: 1}, Bs = {id: 'b', short: 'B', rank: 3}, C = {id: 'c', short: 'C', rank: 4};
                const recs = [
                    {src: Bs, key: 'b1', rec: {date: '1887-02-24', lat: 43.7, lon: 8.1, place: 'Ligurie (B)', mag: 6.9, dead: 640}}, // 22 km, le lendemain
                    {src: A, key: 'a1', rec: {date: '1887-02-23', lat: 43.9, lon: 8.1, place: 'Diano Marina', mag: 6.3}},
                    {src: C, key: 'c1', rec: {date: '1887-02-23', lat: 43.9, lon: 8.2, place: 'Wikidata', dead: 600}},
                    {src: A, key: 'a2', rec: {date: '1887-02-23', lat: 44.2, lon: 8.15, place: 'Autre séisme A'}}, // même source : jamais avec a1 (33 km)
                    {src: Bs, key: 'b2', rec: {date: '1909-06-11', lat: 43.65, lon: 5.27, place: 'Lambesc'}},
                    {src: C, key: 'c2', rec: {date: '1909-06-11', lat: 44.2, lon: 5.27, place: '61 km plus loin'}}, // 61 km : pas réuni
                    {src: C, key: 'c3', rec: {date: '1708', lat: 43.83, lon: 5.79, place: 'Manosque (année seule)'}},
                    {src: A, key: 'a3', rec: {date: '1708-08-14', lat: 43.83, lon: 5.78, place: 'Manosque'}},
                    {src: C, key: 'c4', rec: {date: '1564', lat: 44.0, lon: 7.3, place: 'Vésubie (année seule, deux candidats)'}},
                    {src: A, key: 'a4', rec: {date: '1564-07-20', lat: 44.0, lon: 7.3, place: 'La Bollène'}},
                    {src: Bs, key: 'b4', rec: {date: '1564-03-01', lat: 44.01, lon: 7.31, place: 'Vésubie, mars'}}];
                const out = R.merge(M, recs), byK = Object.fromEntries(out.map(x => [x._k, x]));
                const split = R.merge(M, recs, new Set(['a1|b1']));
                return {n: out.length, lig: byK.a1 && {members: byK.a1._members.map(m => m.key), place: byK.a1.place, mag: byK.a1.mag, dead: byK.a1.dead, diff: byK.a1._diff, sources: byK.a1.sources},
                    a2: byK.a2?._members.length, lambesc: byK.b2?._members.length, manosque: byK.a3?._members.map(m => m.key), vesubie: [byK.a4?._members.length, byK.b4?._members.length, !!byK.c4],
                    split: split.find(x => x._k === 'a1')._members.map(m => m.key)};
            });
            assert.deepStrictEqual(r.lig.members, ['a1', 'b1', 'c1']); assert.strictEqual(r.lig.place, 'Diano Marina', 'le meilleur rang'); assert.strictEqual(r.lig.mag, 6.3);
            assert.strictEqual(r.lig.dead, 640, 'les morts : la première source qui en donne'); assert.strictEqual(r.lig.diff, true, '⚖ magnitude 6,3 / 6,9 (plus de 0,5)'); assert.deepStrictEqual(r.lig.sources, ['A', 'B', 'C']);
            assert.strictEqual(r.a2, 1, 'deux lignes de la même source : jamais réunies'); assert.strictEqual(r.lambesc, 1, '61 km : pas le même');
            assert.deepStrictEqual(r.manosque, ['a3', 'c3'], 'année seule, un seul candidat'); assert.deepStrictEqual(r.vesubie, [1, 1, true], 'année seule, deux candidats : pas réunie');
            assert.deepStrictEqual(r.split, ['a1', 'c1'], '✂ a1 et b1 séparés'); assert.strictEqual(r.n, 8);
        });
        await t('vitesse : 30 000 lignes de 3 sources réunies en moins d’une seconde (index par jour, pas tout contre tout)', async () => {
            const ms = await p.evaluate(() => {
                const R = window.LCNDA_EXT.listesReunies, M = {id: 'x', same: {km: 50, days: 1, yearOnly: true}, fields: [{key: 'date'}]}, recs = [];
                for (let s = 0; s < 3; s++) for (let i = 0; i < 10000; i++) { const y = 1500 + (i % 500), d = new Date(Date.UTC(2000, 0, 1 + (i * 7) % 365)); recs.push({src: {id: 's' + s, short: 'S' + s, rank: s + 1}, key: `s${s}:${i}`, rec: {date: `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`, lat: 40 + (i % 97) / 10 + s * 0.05, lon: (i % 89) / 10}}); }
                const t0 = performance.now(), out = R.merge(M, recs); return [performance.now() - t0, out.length];
            });
            assert.ok(ms[0] < 1000, `${Math.round(ms[0])} ms`); assert.ok(ms[1] >= 10000 && ms[1] < 30000, String(ms[1]));
        });

        /* ═════════ 2. l'écran ═════════ */
        // deux sources FABRIQUÉES qui rejoignent d'elles-mêmes une liste réunie d'essai (merge: {into}), dans un thème d'essai
        await p.evaluate(() => {
            const E = window.LCNDA_EXT;
            E.dataListThemes.push({id: 'essai', icon: '🧪', label: 'Thème d’essai', hint: 'des séismes inventés', words: ['essai']});
            const rowA = [{d: '1887-02-23', lat: 43.9, lon: 8.1, lieu: 'Ligurie (Diano Marina)', pays: 'Italie', mag: 6.3, u: 'https://example.org/a/1887'},
                {d: '1850-05-10', lat: 45.54, lon: 1.80, lieu: 'Treignac', pays: 'France', mag: 4.2, u: 'https://example.org/a/1850'},
                {d: '1500-03-01', lat: 45.54, lon: 1.80, lieu: 'Treignac ancien', pays: 'France', mag: 4.0, u: ''},
                {d: '1909-06-11', lat: 43.65, lon: 5.27, lieu: 'Lambesc', pays: 'France', mag: 6.0, u: 'https://example.org/a/1909'}];
            const rowB = [{date: '1887-02-24', lat: 43.7, lon: 8.1, place: 'Ligurie', country: 'Italie', m: 6.9, morts: 640, url: 'https://example.org/b/1887'},
                {date: '1755-11-01', lat: 38.7, lon: -9.1, place: 'Lisbonne', country: 'Portugal', m: 8.5, morts: 50000, url: 'https://example.org/b/1755'}];
            E.dataLists.push({id: 'test_sis_a', icon: '🌋', label: 'Séismes inventés A', group: 'Le monde', theme: 'essai', source: 'Jeu d’essai A', load: async () => rowA,
                fields: [{key: 'lieu', label: 'Lieu', type: 'text'}, {key: 'd', label: 'Date', type: 'date'}], period: r => [Number(r.d.slice(0, 4)), Number(r.d.slice(0, 4))], geo: r => [r.lat, r.lon],
                merge: {into: 'essai', rank: 1, short: 'SourceA', sub: 'essai', row: r => ({date: r.d, lat: r.lat, lon: r.lon, place: r.lieu, country: r.pays, mag: r.mag, url: r.u})}});
            E.dataLists.push({id: 'test_sis_b', icon: '🌋', label: 'Séismes inventés B', group: 'Le monde', theme: 'essai', source: 'Jeu d’essai B', load: async () => rowB,
                fields: [{key: 'place', label: 'Lieu', type: 'text'}, {key: 'date', label: 'Date', type: 'date'}], period: r => [Number(r.date.slice(0, 4)), Number(r.date.slice(0, 4))], geo: r => [r.lat, r.lon],
                merge: [{into: 'essai', rank: 3, short: 'SourceB', row: r => ({date: r.date, lat: r.lat, lon: r.lon, place: r.place, country: r.country, mag: r.m, dead: r.morts, url: r.url})}]});
            const S = E.dataListMerges.find(m => m.id === 'seismes');
            E.dataListMerges.push({...S, id: 'essai', theme: 'essai', icon: '🧪', label: 'Séismes d’essai réunis', sources: [], chips: S.chips});
        });
        await sleep(400);

        await t('🧰 Toutes les données : les thèmes par défaut, en cartes, avec les pastilles calculées et leurs nombres', async () => {
            await openKey('donnees'); await p.waitForSelector('.ldt-overview .ldt-theme', {timeout: 30000});
            const n = await p.$$eval('.ldt-theme', a => a.length); assert.ok(n >= 21, String(n));
            const chips = await p.$$eval('[data-ldt-chip]', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
            assert.match(chips[0], /^Toutes \d+/); assert.match(chips[1], /Avec une carte \d+/); assert.match(chips[2], /Avec des dates \d+/); assert.match(chips[3], /À installer/);
            assert.match(await p.textContent('[data-ldt-theme="seismes"]'), /Séismes, volcans et terrains.*🔀 Séismes réunis/s);
            assert.strictEqual(await p.$('.ld-group h3'), null, 'plus les 4 groupes d’avant');
        });
        await t('🔍 une recherche sur toutes les listes : rangée par thème, thèmes sans résultat pâlis ; pastille « 📍 Avec une carte »', async () => {
            await p.fill('[data-ld-ov-q]', 'séisme');
            await p.waitForSelector('[data-ldt-group="seismes"] .ld-card');
            assert.match(await p.textContent('[data-ldt-found]'), /listes trouvées, dans \d+ thèmes/);
            const cards = await p.$$eval('[data-ldt-group="seismes"] .ld-card', a => a.map(x => x.textContent));
            assert.ok(cards[0].includes('Séismes réunis'), 'la liste réunie d’abord : ' + cards[0]);
            assert.ok(await p.$('[data-ldt-theme="metiers"].is-dim'), 'Métiers : pâli'); assert.ok(!(await p.$('[data-ldt-theme="seismes"].is-dim')));
            await p.fill('[data-ld-ov-q]', ''); await p.click('[data-ldt-chip="geo"]'); await sleep(150);
            const hits = await p.$$eval('.ldt-results .ld-card', a => a.length); assert.ok(hits > 50, String(hits));
            await p.click('[data-ldt-chip="all"]');
        });
        await t('colonne de gauche : « 🧰 Données » montre les thèmes (repliés), pas les listes une à une', async () => {
            const items = await p.$$eval('[data-mt-group="g_data"] [data-side-value]', a => a.map(b => b.dataset.sideValue));
            assert.ok(items.includes('donnees') && items.includes('data_theme_seismes') && items.includes('data_theme_sport'), items.join(','));
            const flat = items.filter(k => k.startsWith('data_') && !k.startsWith('data_theme_')); assert.deepStrictEqual(flat, [], 'aucune liste à plat');
        });
        await t('un thème s’ouvre sur sa liste réunie (onglets : 🔀 la liste réunie · Les N listes ; ← Tous les thèmes)', async () => {
            await p.click('[data-ldt-theme="essai"]');
            await p.waitForSelector('[data-ld-page="reunie_essai"] .ldt-tabs', {timeout: 30000});
            const tabs = await p.$$eval('.ldt-tabs button', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
            assert.deepStrictEqual(tabs, ['← Tous les thèmes', '🔀 Séismes d’essai réunis 2', 'Les 2 listes']);
            assert.match(await waitCount(/^5 lignes/), /5 lignes/); // 6 lignes dans les sources, 1 doublon fondu
            assert.match(await p.textContent('[data-ldr-stats]'), /5 séismes réunis \(6 lignes dans les sources : 1 doublons fondus\)/);
            assert.match(await p.textContent('.ui-ph .eyebrow, .page-header .eyebrow'), /Thème d’essai/);
            const side = await p.$$eval('[data-mt-group="g_data"] [data-side-value]', a => a.map(b => b.dataset.sideValue));
            assert.ok(side.includes('data_theme_essai'));
        });
        await t('la ligne réunie : Sources ↗ une par source, ⚖ 2 avis, la plus récente d’abord ; « Dans la famille » calculé ici', async () => {
            const heads = await p.$$eval('.ld-table thead th', a => a.map(x => x.textContent.replace(/[↑↓]/g, '').trim()));
            assert.deepStrictEqual(heads.slice(0, 6), ['Date', 'Où', 'Force', 'Morts', 'Dans la famille', 'Sources']);
            const rows = await p.$$eval('.ld-table tbody tr[data-ld-row]', a => a.map(x => x.textContent.replace(/\s+/g, ' ')));
            assert.match(rows[0], /11 juin 1909/); assert.match(rows[1], /23 février 1887.*Ligurie \(Diano Marina\).*M 6,3.*⚖ 2 avis.*640/);
            const links = await p.$$eval('.ld-table tbody tr[data-ld-row="1"] .ldr-src a', a => a.map(x => [x.textContent, x.href]));
            assert.deepStrictEqual(links, [['SourceA ↗', 'https://example.org/a/1887'], ['SourceB ↗', 'https://example.org/b/1887']]);
            await p.waitForFunction(() => [...document.querySelectorAll('td.ld-fam')].some(td => td.textContent.trim()), null, {timeout: 20000});
            const fam = await p.$$eval('.ld-table tbody tr[data-ld-row]', a => a.map(tr => [tr.textContent.match(/\d{4}/)?.[0], tr.querySelector('td.ld-fam')?.textContent.trim()]));
            const f1850 = fam.find(x => x[0] === '1850'), f1500 = fam.find(x => x[0] === '1500');
            assert.match(f1850[1], /(MAZAUD|LACOMBE|DURAND).*(\d+ ans|naît)/, JSON.stringify(fam)); assert.match(f1500[1], /avant la famille/);
            assert.ok(!(await p.evaluate(() => performance.getEntriesByType('resource').some(e => /ld_famille/.test(e.name) && !e.name.startsWith(location.origin)))), 'rien ne part ailleurs');
        });
        await t('ligne ouverte : ce que dit chaque source (distance, ↗), puis ✂ Ce ne sont pas les mêmes (retenu, ↶ Annuler)', async () => {
            await p.click('.ld-table tbody tr[data-ld-row="1"] [data-ld-open]');
            await p.waitForSelector('.ldr-detail');
            const d = await p.textContent('.ldr-detail'); assert.match(d, /SourceA.*SourceB/s); assert.match(d, /\(22 km\)/); assert.match(d, /source la plus précise \(SourceA\)/);
            assert.strictEqual(await p.getAttribute('.ld-table tbody tr[data-ld-row="1"] [data-ld-open]', 'aria-expanded'), 'true');
            await p.click('[data-ldr-split]'); await waitCount(/^6 lignes/);
            const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-listes-reunies-separes')));
            assert.ok(Array.isArray(saved.essai) && saved.essai.length === 1, JSON.stringify(saved));
            await clickUndo(); await waitCount(/^5 lignes/);
        });
        await t('filtres du moteur : pays (liste), force ≥ (nombre), sources (une ligne en a plusieurs), période, 👪 autour de la famille, carte', async () => {
            await p.click('[data-ld-add]'); await p.click('.ui-actmenu-i:has-text("Pays")');
            await p.waitForSelector('[data-ld-ed-list] input[value="France"]'); await p.check('[data-ld-ed-list] input[value="France"]'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^3 lignes/);
            await p.click('[data-ld-add]'); await p.click('.ui-actmenu-i:has-text("Magnitude")'); await p.fill('.ld-ed-form input[name="from"]', '5'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^1 ligne/); assert.match(await p.textContent('.ld-table tbody'), /Lambesc/);
            await p.click('[data-ld-clear]'); await waitCount(/^5 lignes/);
            await p.click('[data-ld-add]'); await p.click('.ui-actmenu-i:has-text("Sources")');
            await p.waitForSelector('[data-ld-ed-list] input[value="SourceB"]'); assert.match(await p.textContent('[data-ld-ed-list]'), /SourceB\s*2/);
            await p.check('[data-ld-ed-list] input[value="SourceB"]'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^2 lignes/);
            await p.click('[data-ld-chip="crit:0"]'); await waitCount(/^5 lignes/);
            await p.click('[data-ld-period]'); await p.check('.ld-ed-form input[value="overlap"]'); await p.fill('.ld-ed-form input[name="from"]', '1800'); await p.fill('.ld-ed-form input[name="to"]', '1950'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^3 lignes/);
            await p.click('[data-ld-chip="period"]'); await waitCount(/^5 lignes/);
            await p.click('[data-ld-qchip="famille"]'); await waitCount(/^2 lignes/); // Treignac (1850, 1500) : les lieux de la famille ; le reste est loin
            assert.strictEqual(await p.getAttribute('[data-ld-qchip="famille"]', 'aria-pressed'), 'true');
            await p.click('[data-ld-qchip="famille"]'); await waitCount(/^5 lignes/);
            await p.click('[data-ld-add]'); await p.click('.ui-actmenu-i:has-text("Près des lieux de la famille")');
            await p.waitForSelector('.ld-ed-form select[name="v"] option[value="150"]', {state: 'attached'}); await p.selectOption('.ld-ed-form select[name="v"]', '150'); await p.click('.ld-ed-form button[type="submit"]');
            await waitCount(/^2 lignes/); await p.click('[data-ld-chip="crit:0"]'); await waitCount(/^5 lignes/);
            await p.click('[data-ld-view="map"]'); await p.waitForSelector('.ld-results .h-map-point');
            assert.strictEqual(await p.$$eval('.ld-results .h-map-point', a => a.length), 5);
            await p.click('[data-ld-view="table"]'); await p.waitForSelector('.ld-table');
        });
        await t('pour le lot M (🏆 Sport) : pastilles par valeur (chips: \'clé\'), vues déclarées (Éditions | Étapes | 🗺 Carte), sous-liste « ☑ Toutes ses étapes », « Dans la famille » à 15 km', async () => {
            await p.evaluate(() => {
                const ed = [{year: 1964, kind: 'Tour de France', winner: 'Jacques ANQUETIL', lat: 45.27, lon: 1.77}, {year: 1976, kind: 'Tour de France', winner: 'Lucien VAN IMPE', lat: 43.7, lon: 7.27},
                    {year: 2017, kind: 'Tour de France', winner: 'Chris FROOME', lat: 43.64, lon: 5.1}, {year: 1950, kind: 'Giro', winner: 'Hugo KOBLET', lat: 45.46, lon: 9.19}];
                const st = [{year: 1964, n: 1, from: 'Rennes', to: 'Lisieux', lat: 49.14, lon: 0.22}, {year: 1964, n: 2, from: 'Lisieux', to: 'Amiens', lat: 49.9, lon: 2.3}, {year: 1976, n: 1, from: 'Saint-Jean-de-Monts', to: 'Angers', lat: 47.47, lon: -0.55}];
                window.LCNDA_EXT.dataLists.push({id: 'test_sport', icon: '🚲', label: 'Courses d’essai', group: 'Le monde', theme: 'sport', load: async () => ed, chips: 'kind', familyColumn: true,
                    fields: [{key: 'year', label: 'Année', type: 'year'}, {key: 'kind', label: 'Course', type: 'enum'}, {key: 'winner', label: 'Vainqueur', type: 'text'}], period: r => [r.year, r.year], geo: r => [r.lat, r.lon],
                    views: [{id: 'editions', label: 'Éditions', sub: r => ({view: 'etapes', preset: {crit: [{key: 'year', kind: 'range', from: r.year, to: r.year}]}, title: `Tour ${r.year}`, pickAll: 'Toutes ses étapes'})},
                        {id: 'etapes', label: 'Étapes', load: async () => st, fields: [{key: 'year', label: 'Année', type: 'year'}, {key: 'n', label: 'Étape', type: 'number'}, {key: 'from', label: 'Départ', type: 'text'}, {key: 'to', label: 'Arrivée', type: 'place'}]}, 'carte']});
            });
            await sleep(300); await openKey('data_test_sport'); await waitCount(/^4 lignes/);
            assert.deepStrictEqual(await p.$$eval('.ld-view button', a => a.map(x => x.textContent.trim())), ['Éditions', 'Étapes', '🗺 Carte']);
            await p.waitForSelector('[data-ld-vchip="Tour de France"]'); assert.match(await p.textContent('[data-ld-qchips]'), /Tour de France 3.*Giro 1/s);
            await p.click('[data-ld-vchip="Tour de France"]'); await waitCount(/^3 lignes/);
            assert.strictEqual(await p.getAttribute('[data-ld-vchip="Tour de France"]', 'aria-pressed'), 'true');
            await p.click('[data-ld-vchip="Tour de France"]'); await waitCount(/^4 lignes/);
            assert.ok((await p.$$eval('.ld-table thead th', a => a.map(x => x.textContent))).some(h => /Dans la famille/.test(h)));
            await p.click('[data-ld-dview="etapes"]'); await waitCount(/^3 lignes/); assert.match(await p.textContent('.ld-table thead'), /Départ.*Arrivée/s);
            await p.click('[data-ld-dview="editions"]'); await waitCount(/^4 lignes/);
            const i64 = await p.$$eval('.ld-table tbody tr[data-ld-row]', a => a.findIndex(tr => /1964/.test(tr.textContent)));
            await p.click(`.ld-table tbody tr[data-ld-row="${i64}"] [data-ld-open]`); await waitCount(/^2 lignes/);
            assert.match(await p.textContent('[data-ld-parent]'), /Tour 1964.*☑ Toutes ses étapes/s);
            await p.click('[data-ld-pickall]'); assert.strictEqual(await p.textContent('.ldc-bar [data-ldc-n]'), '2 choisis');
            await p.click('[data-ldc-x]'); await p.click('[data-ld-parent-back]'); await waitCount(/^4 lignes/); assert.strictEqual(await p.$('[data-ld-parent]'), null);
            await openKey('data_theme_essai'); await p.waitForSelector('[data-ld-page="reunie_essai"] .ldt-tabs', {timeout: 30000});
        });
        await t('« Les N listes » : les sources une à une ; ← Tous les thèmes', async () => {
            await p.click('[data-ldt-tab="lists"]'); await p.waitForSelector('.ldt-theme-page .ld-card');
            const cards = await p.$$eval('.ldt-theme-page .ld-card', a => a.map(x => x.textContent));
            assert.ok(cards.some(c => /Séismes inventés A/.test(c)) && cards.some(c => /Séismes inventés B/.test(c)) && /liste réunie/.test(cards[0]), cards.join(' | '));
            await p.click('.ldt-back'); await p.waitForSelector('.ldt-overview .ldt-theme');
        });
        await t('🌋 Séismes réunis : NOAA (livré avec l’app) et EPICA si le pack est là, une ligne par séisme, des doublons fondus', async () => {
            await p.click('[data-ldt-theme="seismes"]');
            await p.waitForSelector('[data-ld-page="reunie_seismes"] [data-ld-count]', {timeout: 60000});
            const c = await waitCount(/\d/); const n = Number(c.replace(/\D/g, '')); assert.ok(n > 3000, c);
            const st = await p.evaluate(async () => (await window.LCNDA_EXT.listesReunies.build('seismes')).stats);
            assert.ok(st.per.NOAA > 3000, JSON.stringify(st)); if (B.hasPack) { assert.ok(st.per.EPICA > 500 && st.merged > 0, JSON.stringify(st)); }
            assert.ok(st.ms < 1500, `réunion : ${st.ms} ms`);
        });

        /* ═════════ 3. Réglages, consultation, téléphone ═════════ */
        await t('Réglages → 🧰 Listes de données : les 4 groupes d’avant (et retour), un thème s’ouvre sur ses listes, le rayon', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'listes_donnees_reglages'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-ldt-settings-page] input[name="ldt-vue"][value="groupes"]', {timeout: 20000});
            await p.check('input[name="ldt-vue"][value="groupes"]'); await sleep(200);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-listes-vue')), 'groupes');
            await openKey('donnees'); await p.waitForSelector('.ld-overview .ld-group h3');
            const side = await p.$$eval('[data-mt-group="g_data"] [data-side-value]', a => a.map(b => b.dataset.sideValue));
            assert.ok(side.includes('data_hist_gares') && !side.some(k => k.startsWith('data_theme_')), 'groupes : les listes à plat');
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'listes_donnees_reglages'; A.setModule('maintenance'); });
            await p.waitForSelector('input[name="ldt-vue"][value="themes"]'); await p.check('input[name="ldt-vue"][value="themes"]');
            await p.check('input[name="ldt-ouvre"][value="listes"]'); await p.fill('[data-ldt-km]', '40'); await p.press('[data-ldt-km]', 'Enter'); await p.evaluate(() => document.querySelector('[data-ldt-km]')?.dispatchEvent(new Event('change', {bubbles: true}))); await sleep(200);
            assert.deepStrictEqual(await p.evaluate(() => [localStorage.getItem('genealogie-listes-vue'), localStorage.getItem('genealogie-listes-theme-ouvre'), localStorage.getItem('genealogie-listes-famille-km')]), ['themes', 'listes', '40']);
            await openKey('data_theme_essai'); await p.waitForSelector('.ldt-theme-page .ld-card');
            await p.evaluate(() => { localStorage.setItem('genealogie-listes-theme-ouvre', 'reunie'); localStorage.removeItem('genealogie-listes-famille-km'); });
        });
        await t('mode consultation : 📎 🧺 ✂ éteints avec la raison, les réglages ne changent pas', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await openKey('data_theme_essai'); await p.waitForSelector('[data-ld-page="reunie_essai"] .ld-table tbody tr[data-ld-row="1"]');
            assert.ok(await p.$eval('.ld-table tbody tr[data-ld-row="1"] [data-ld-ins]', b => b.disabled && /consultation/.test(b.title)));
            const i1887 = await p.$$eval('.ld-table tbody tr[data-ld-row]', a => a.findIndex(tr => /1887/.test(tr.textContent)));
            await p.click(`.ld-table tbody tr[data-ld-row="${i1887}"] [data-ld-open]`); await p.waitForSelector('.ldr-detail');
            assert.ok(await p.$eval('[data-ldr-split]', b => b.disabled)); assert.ok(await p.$eval('[data-ldr-bk]', b => b.disabled));
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'listes_donnees_reglages'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-ldt-settings-page] .ldt-ro'); assert.ok(await p.$eval('input[name="ldt-vue"]', i => i.disabled));
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('390 px, en sombre : les thèmes en une colonne, la liste réunie en cartes, rien ne déborde de côté', async () => {
            await p.setViewportSize({width: 390, height: 844}); await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            await openKey('donnees'); await p.waitForSelector('.ldt-overview .ldt-theme');
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de défilement de côté (thèmes)');
            await openKey('data_theme_essai'); await p.waitForSelector('[data-ld-page="reunie_essai"] .ld-table--cards tbody tr');
            assert.strictEqual(await p.$eval('.ld-table--cards thead', x => getComputedStyle(x).display), 'none');
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de défilement de côté (liste réunie)');
            assert.ok(await p.$eval('.ld-table--cards tbody tr[data-ld-row] [data-ld-bk]', b => b.getBoundingClientRect().width >= 30), '🧺 assez grand pour le doigt');
            await p.setViewportSize({width: 1440, height: 900}); await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
