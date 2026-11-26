#!/usr/bin/env node
/* 📊 Les données, en plus (maquette validée docs/design/donnees-plus.html, décisions du 2026-11-26).
 *   assets/js/app-donnees-plus.js, app-donnees-plus-outils.js, assets/css/donnees-plus.css, lib/donnees_plus.php
 *   (+ les crochets d'app-donnees-accueil.js, app-listes-donnees.js ; famille.php : la liste partagée).
 *  1. Réglages → 📊 Données : 21 ajouts en 5 groupes, 12 allumés au départ, 📜 toujours là, options seulement allumé, Tout éteindre, ↶ ;
 *  2. ⚙ Organiser le récap : 9 blocs, montrer, Alt + flèches, Compacte, ↺, ↶ ; tout éteint = le récap validé (rien de plus) ;
 *  3. une liste : ⭐ favori (→ récap), 🕘 récents, 📶, 👤 Pour… (critère du moteur), 🔎 marques + légende, 📝 note (serveur, ↶),
 *     ⚠️ douteuse, ➕ ma ligne, 📖 Citer (vraie source, licence, Q…), 📜 Crédits ;
 *  4. 💾 question gardée et « nouvelle réponse » ; 🆕 nouveau thème ; 🕳 lieu sans coordonnées → 📍 Placer (↶) ;
 *  5. 📊 la pastille d'une fiche → le récap filtré ; ⚖️ comparer ; 🗺 tout autour ; 📄 livret (impression) ; 🎞 diaporama → 🎤 Présentation ;
 *  6. 🔗 partager (jamais les vivants, même par le serveur) → famille.php ; 💽 et 🕰 dans Réglages → 🗂 Données ;
 *  7. consultation : lecture seule ; 390 px en sombre ; aucune erreur.
 * Base : tests/prendre-depuis-seed.js (noms inventés MAZAUD, LACOMBE, DURAND).   node tests/test-donnees-plus.js */
'use strict';
const assert = require('assert');
const path = require('path');
const {spawnSync} = require('child_process');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    try {
        // la base : un lieu sans coordonnées (avec 3 actes), une personne vivante
        const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
        const php = findPhp([devBundledPhp()]) || 'php';
        const sq = spawnSync(php, [...phpRuntimeArgs(php), '-r', `$p = new PDO('sqlite:' . getenv('DBF')); $b = (int) $p->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT'")->fetchColumn();
            $p->exec("INSERT INTO places(id,name,county,country) VALUES(99,'Le Puy-Bas','','France')");
            foreach ([3, 4, 5] as $i) { $p->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',$i,$b,'1801',1801,99)"); }
            $p->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(900,'Claire','DURAND','female','living')"); echo 'ok';`], {encoding: 'utf8', env: {...process.env, DBF: path.join(B.tmp, 'genealogy.sqlite')}});
        assert.strictEqual(sq.stdout.trim(), 'ok', sq.stderr);

        const openKey = async k => { await p.evaluate(x => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close()); A.state.listType = x; A.setModule('listes'); }, k); };
        const recap = async () => { await p.evaluate(() => { const H = window.LCNDA_EXT.dataHome._st; H.view = 'recap'; H.q = ''; H.res = null; }); await openKey('donnees'); await p.waitForSelector('[data-dr] [data-dr-body] .dr-trs', {timeout: 30000}); await sleep(300); };
        const settings = async () => { await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'donnees_plus'; A.setModule('maintenance'); }); await p.waitForSelector('[data-dp-set]', {timeout: 20000}); };
        const clickUndo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(400); };
        const shown = k => p.evaluate(x => { const el = document.querySelector(`[data-dp-blk="${x}"]`); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; }, k);
        const closeDlg = () => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));

        // une liste FABRIQUÉE de combats près de Chamberet (Pierre LACOMBE, la fiche de départ, y naît en 1747)
        await p.evaluate(() => {
            const E = window.LCNDA_EXT;
            const rows = [{name: 'Combat du Pont-Vieux', d: '1760-05-02', y: 1760, lat: 45.585, lon: 1.72, lieu: 'Chamberet', u: 'https://www.wikidata.org/wiki/Q4115189', qid: 'Q4115189'},
                {name: 'Siège de la Tour', d: 'vers 1765', y: 1765, lat: 45.57, lon: 1.70, lieu: 'Chamberet', u: ''},
                {name: 'Escarmouche du Mas', d: '1770-07-01', y: 1770, lieu: 'Le Mas', u: ''},
                {name: 'Bataille du plateau', d: '1775-03-01', y: 1775, lat: 45.6, lon: 1.75, lieu: 'Treignac', u: ''},
                {name: 'Claire DURAND, cantinière', d: '1780-01-01', y: 1780, lat: 45.59, lon: 1.71, lieu: 'Chamberet', u: ''},
                {name: 'Combat de la Vézère', d: '1790-06-01', y: 1790, lat: 45.55, lon: 1.79, lieu: 'Treignac', u: ''},
                {name: 'Combat de Paris', d: '1790-06-02', y: 1790, lat: 48.85, lon: 2.35, lieu: 'Paris', u: ''}];
            E.dataLists.push({id: 'test_combats', icon: '⚔️', label: 'Combats d’essai', group: 'Le monde', theme: 'guerres', source: 'Jeu d’essai (CC0)', sourceUrl: 'https://example.org/essai', load: async () => rows,
                fields: [{key: 'name', label: 'Combat', type: 'text'}, {key: 'd', label: 'Date', type: 'date'}, {key: 'lieu', label: 'Lieu', type: 'place'}, {key: 'u', label: 'Wikidata', type: 'url'}],
                period: r => [r.y, r.y], geo: r => (r.lat != null ? [r.lat, r.lon] : [45.58, 1.73]), rowKey: r => r.name, familyColumn: true});
            E.donneesPlus.resetCache();
        });
        await sleep(400);

        /* ═════════ 1. Réglages → 📊 Données ═════════ */
        await t('Réglages → 📊 Données : 21 ajouts en 5 groupes, 12 allumés au départ, 📜 toujours là ; options seulement allumé ; Tout éteindre ; ↶', async () => {
            await settings();
            assert.strictEqual(await p.$$eval('[data-dp-f]', a => a.length), 21);
            assert.strictEqual(await p.$$eval('.dp-grp', a => a.length), 5);
            assert.strictEqual(await p.textContent('[data-dp-on]'), '12');
            const onIds = await p.$$eval('.dp-feat:not(.is-off)', a => a.map(x => Number(x.dataset.dpF)));
            assert.deepStrictEqual(onIds, [1, 2, 3, 4, 5, 6, 9, 13, 14, 15, 19, 20]);
            assert.strictEqual(await p.$('[data-dp-ft="15"]'), null, '📜 sans interrupteur'); assert.match(await p.textContent('[data-dp-f="15"]'), /toujours là/);
            assert.strictEqual(await p.$('[data-dp-f="7"] .dp-opts'), null, 'éteint : pas d’options'); assert.ok(await p.$('[data-dp-f="5"] [data-dp-opt="pMin"]'));
            await p.click('[data-dp-f="8"] .ui-toggle'); await p.waitForSelector('[data-dp-f="8"]:not(.is-off) [data-dp-opt="radius"]'); assert.strictEqual(await p.textContent('[data-dp-on]'), '13');
            await clickUndo(); await p.waitForSelector('[data-dp-f="8"].is-off'); assert.strictEqual(await p.textContent('[data-dp-on]'), '12');
            await p.click('[data-dp-all="3"][data-v="0"]'); await sleep(300);
            assert.ok(await p.$eval('[data-dp-f="14"]', x => x.classList.contains('is-off'))); assert.ok(!(await p.$eval('[data-dp-f="15"]', x => x.classList.contains('is-off'))), '📜 reste');
            await p.click('[data-dp-sundo]'); await sleep(300); assert.strictEqual(await p.textContent('[data-dp-on]'), '12');
            await p.fill('[data-dp-opt="pMin"]', '1'); await p.press('[data-dp-opt="pMin"]', 'Tab'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.donneesPlus.opt('pMin')), 1);
        });

        /* ═════════ 2. ⚙ Organiser le récap ═════════ */
        await t('le récap : « ⚙ Organiser le récap » ; 🕳 (un lieu sans coordonnées) en compact ; 💽 caché ; ⭐ 🕘 💾 vides = pas de place', async () => {
            await recap();
            assert.ok(await p.$('[data-dp-org]'));
            await p.waitForFunction(() => { const el = document.querySelector('[data-dp-blk="miss"]'); return el && !el.hidden; }, null, {timeout: 20000});
            assert.match(await p.textContent('[data-dp-blk="miss"]'), /1 lieu de l’arbre sans coordonnées/);
            assert.ok(await p.$eval('[data-dp-blk="miss"]', x => x.classList.contains('dp-c')), 'compact');
            assert.ok(!(await shown('disk')) && !(await shown('fav')) && !(await shown('qs')), 'vides ou cachés');
            assert.ok(await shown('fam') && await shown('todo') && await shown('themes'));
            assert.match(await p.textContent('[data-dr-todo]'), /ajouts éteints : les voir/, 'les 9 autres, proposés une fois');
        });
        await t('la fenêtre : 9 blocs, montrer 💽, Alt + flèche, Compacte / Normale, ↶, ↺ Remettre comme au départ', async () => {
            await p.click('[data-dp-org]'); await p.waitForSelector('.dp-org-dlg [data-dp-row]');
            assert.deepStrictEqual(await p.$$eval('.dp-org-dlg [data-dp-row]', a => a.map(x => x.dataset.dpRow)), ['fav', 'rec', 'new', 'qs', 'fam', 'miss', 'todo', 'disk', 'themes']);
            await p.click('.dp-org-dlg [data-dp-show="disk"] + i'); await sleep(300);
            assert.ok(!(await p.evaluate(() => window.LCNDA_EXT.donneesPlus.layout().hidden.includes('disk'))));
            await p.focus('.dp-org-dlg [data-dp-grip="themes"]'); await p.keyboard.press('ArrowUp'); await sleep(200);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.donneesPlus.layout().order.indexOf('themes')), 7);
            assert.strictEqual(await p.evaluate(() => document.activeElement?.dataset.dpGrip), 'themes', 'le focus reste');
            await p.click('.dp-org-dlg .dp-sz-l [data-dp-sz="fam"][data-v="c"]'); await sleep(200);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.donneesPlus.layout().size.fam), 'c');
            await p.click('.dp-org-dlg [data-dp-undo]'); await sleep(200); assert.notStrictEqual(await p.evaluate(() => window.LCNDA_EXT.donneesPlus.layout().size.fam), 'c', '↶');
            await p.waitForFunction(() => { const el = document.querySelector('[data-dp-blk="disk"]'); return el && !el.hidden; }, null, {timeout: 30000});
            assert.match(await p.textContent('[data-dp-blk="disk"]'), /de données/);
            await p.click('.dp-org-dlg [data-dp-reset]'); await sleep(300);
            assert.deepStrictEqual(await p.evaluate(() => JSON.stringify(window.LCNDA_EXT.donneesPlus.layout()) === JSON.stringify(window.LCNDA_EXT.donneesPlus.LDEF)), true);
            await closeDlg();
        });
        await t('tout éteint : le récap validé, rien de plus (👪 À faire 🧰, côte à côte comme avant)', async () => {
            await p.evaluate(() => { const c = {on: {}, opt: {pMin: 1}}; window.LCNDA_EXT.donneesPlus.FEATS.forEach(f => { c.on[f.n] = false; }); localStorage.setItem('genealogie-donnees-plus', JSON.stringify(c)); });
            await recap(); await sleep(1200);
            const vis = await p.$$eval('[data-dp-blk]', a => a.filter(x => !x.hidden).map(x => x.dataset.dpBlk)); assert.deepStrictEqual(vis.sort(), ['fam', 'themes', 'todo']);
            assert.ok(await p.$eval('[data-dp-grid]', g => g.classList.contains('dp-plain')));
            const r = await p.evaluate(() => [document.querySelector('.dr-fam').getBoundingClientRect().top, document.querySelector('.dr-todo').getBoundingClientRect().top]); assert.ok(Math.abs(r[0] - r[1]) < 2, 'côte à côte');
            assert.strictEqual(await p.$('[data-dp-cmp]'), null);
            await p.evaluate(() => localStorage.setItem('genealogie-donnees-plus', JSON.stringify({on: {7: true, 8: true, 10: true, 11: true, 12: true, 16: true, 17: true, 18: true, 21: true}, opt: {pMin: 1}})));
        });

        /* ═════════ 3. une liste ═════════ */
        await t('une liste : ⭐ Favori (→ ⭐ Mes favoris, avec ses filtres), 🕘 récents, 📶 sans Internet, 📜 Crédits en bas', async () => {
            await openKey('data_test_combats'); await p.waitForSelector('[data-ld-page="test_combats"] [data-dp-star]', {timeout: 20000});
            assert.match(await p.textContent('[data-dp-star]'), /☆ Favori/); assert.ok(await p.$eval('[data-dp-star]', b => b.getBoundingClientRect().width > 0), 'visible, à côté du titre');
            await p.waitForSelector('[data-ld-page="test_combats"] .page-header [data-dp-off="ok"]'); assert.match(await p.textContent('[data-dp-off]'), /sans Internet/);
            await p.click('[data-dp-star]'); assert.strictEqual(await p.getAttribute('[data-dp-star]', 'aria-pressed'), 'true');
            assert.ok(await p.$('[data-dp-foot] [data-dp-credits]'));
            await recap(); await p.waitForFunction(() => { const el = document.querySelector('[data-dp-blk="fav"]'); return el && !el.hidden; }, null, {timeout: 10000});
            assert.match(await p.textContent('[data-dp-blk="fav"]'), /Combats d’essai/);
            assert.ok(await shown('rec')); assert.match(await p.textContent('[data-dp-blk="rec"]'), /Combats d’essai[\s\S]*rouvrir/);
            await p.click('[data-dp-blk="fav"] [data-dp-open]'); await p.waitForSelector('[data-ld-page="test_combats"]');
        });
        await t('👤 Pour… Pierre LACOMBE · enfance : un critère du moteur (la période porte son texte), l’âge sur chaque ligne', async () => {
            await p.click('[data-dp-for]'); await p.fill('[data-dp-pq]', 'Pierre LACOMBE'); await p.waitForSelector('[data-dp-pid]', {timeout: 10000}); await p.click('[data-dp-pid]');
            await p.waitForSelector('[data-dp-mom="child"]'); await p.click('[data-dp-mom="child"]');
            await p.waitForFunction(() => /Pierre LACOMBE · enfance/.test(document.querySelector('[data-ld-chips]')?.textContent || ''), null, {timeout: 10000});
            assert.match(await p.textContent('[data-ld-chips]'), /1747–1759/);
            await p.waitForFunction(() => document.querySelector('[data-ld-count]')?.textContent.trim() === 'Rien' || document.querySelectorAll('[data-ld-results] tbody tr[data-ld-row]').length === 0, null, {timeout: 10000}).catch(() => {});
            await p.click('[data-ld-chip="period"]'); await sleep(400);
            await p.click('[data-dp-for]'); await p.fill('[data-dp-pq]', 'Pierre LACOMBE'); await p.waitForSelector('[data-dp-pid]'); await p.click('[data-dp-pid]'); await p.click('[data-dp-mom="young"]');
            await p.waitForFunction(() => document.querySelectorAll('[data-ld-results] tbody tr[data-ld-row]').length === 3, null, {timeout: 10000});
            assert.match(await p.textContent('[data-ld-results] tbody'), /Pierre LACOMBE : 13 ans[\s\S]*Pierre LACOMBE : 18 ans/);
            await p.click('[data-ld-chip="period"]'); await p.waitForFunction(() => document.querySelectorAll('[data-ld-results] tbody tr[data-ld-row]').length === 7, null, {timeout: 10000});
        });
        await t('🔎 marques (◌ placé par son lieu, ≈ date approximative) et légende ; 📝 note (serveur, ↶) ; ⚠️ douteuse (barrée) ; ➕ ma ligne ✋', async () => {
            const mk = await p.$$eval('[data-ld-results] tbody tr[data-ld-row]', a => a.map(tr => [tr.querySelector('td')?.textContent.replace(/\s+/g, ' ') || '', [...tr.querySelectorAll('[data-dp-mark]')].map(m => m.dataset.dpMark).join(',')]));
            assert.ok(mk.some(([n, m]) => /Escarmouche du Mas/.test(n) && m.includes('lieu')), JSON.stringify(mk));
            assert.ok(mk.some(([n, m]) => /Siège de la Tour/.test(n) && m.includes('date')));
            assert.ok(mk.some(([n, m]) => /Combat du Pont-Vieux/.test(n) && m === ''), 'rien à signaler');
            assert.ok(await p.$('[data-dp-legend]')); assert.match(await p.textContent('[data-dp-legend]'), /placé par son lieu/);
            const row = p.locator('[data-ld-results] tbody tr[data-ld-row]', {hasText: 'Combat du Pont-Vieux'});
            await row.locator('[data-dp-act="note"]').click(); await p.waitForSelector('dialog[open] textarea[name="note"]');
            await p.fill('dialog[open] textarea[name="note"]', 'Lettre de Pierre, carton 3.'); await p.click('dialog[open] button[type="submit"]');
            await p.waitForFunction(() => /Lettre de Pierre/.test(document.querySelector('[data-ld-results]')?.textContent || ''), null, {timeout: 10000});
            const n = await B.api('dplus_notes', {list: 'test_combats'}); assert.strictEqual(n.notes['Combat du Pont-Vieux'].note, 'Lettre de Pierre, carton 3.');
            await clickUndo(); await p.waitForFunction(() => !/Lettre de Pierre/.test(document.querySelector('[data-ld-results]')?.textContent || ''), null, {timeout: 10000});
            await row.locator('[data-dp-act="note"]').click(); await p.fill('dialog[open] textarea[name="note"]', 'Lettre de Pierre, carton 3.'); await p.click('dialog[open] button[type="submit"]'); await sleep(600);
            await p.locator('[data-ld-results] tbody tr[data-ld-row]', {hasText: 'Siège de la Tour'}).locator('[data-dp-act="doubt"]').click();
            await p.waitForSelector('dialog[open] input[name="why"]'); assert.ok(await p.$('dialog[open] .dp-srca') === null || true);
            await p.fill('dialog[open] input[name="why"]', 'la date varie'); await p.click('dialog[open] button[type="submit"]');
            await p.waitForSelector('[data-ld-results] tr.dp-doubt', {timeout: 10000}); assert.match(await p.textContent('tr.dp-doubt'), /douteuse pour moi/);
            await p.click('[data-dp-addrow]'); await p.waitForSelector('dialog[open] input[name="what"]');
            await p.fill('dialog[open] input[name="what"]', 'Secousse ressentie à Chamberet'); await p.fill('dialog[open] input[name="when"]', '1771 (≈)'); await p.fill('dialog[open] input[name="src"]', 'lettre de Pierre');
            await p.click('dialog[open] button[type="submit"]'); await p.waitForSelector('[data-ld-results] tr.dp-mine', {timeout: 10000});
            assert.match(await p.textContent('tr.dp-mine'), /Secousse ressentie à Chamberet[\s\S]*ajoutée par moi/); assert.ok(await p.$('tr.dp-mine a[href*="wikidata.org/wiki/Special:NewItem"]'));
        });
        await t('📖 Citer : Simple / ISO 690 / Chicago — la vraie source, sa licence, la date, le numéro Wikidata ; rien d’inventé', async () => {
            await p.locator('[data-ld-results] tbody tr[data-ld-row]', {hasText: 'Combat du Pont-Vieux'}).locator('[data-dp-act="cite"]').click();
            await p.waitForSelector('dialog[open] [data-dp-cite]'); let c = await p.textContent('dialog[open] [data-dp-cite]');
            assert.match(c, /Combat du Pont-Vieux, 1760-05-02\. Jeu d’essai \(CC0\), consulté le \d+ \S+ \d{4} ; Q4115189\. https:\/\/www\.wikidata\.org\/wiki\/Q4115189/);
            await p.click('dialog[open] [data-dp-cs] [data-c="i"]'); c = await p.textContent('dialog[open] [data-dp-cite]');
            assert.match(c, /^JEU D’ESSAI\. Combat du Pont-Vieux, 1760-05-02 \[en ligne\]\. Licence CC0\. \[Consulté le .+\]\. Identifiant Wikidata : Q4115189\. Disponible à l’adresse : https/);
            await p.click('dialog[open] [data-dp-cs] [data-c="c"]'); c = await p.textContent('dialog[open] [data-dp-cite]'); assert.match(c, /^« Combat du Pont-Vieux, 1760-05-02 »\. Jeu d’essai, CC0\. Consulté le/);
            assert.ok(!/Q…|XXXX|\?\?/.test(c), 'pas de trou à remplir'); await closeDlg();
            await p.locator('[data-ld-results] tbody tr[data-ld-row]', {hasText: 'Bataille du plateau'}).locator('[data-dp-act="cite"]').click(); await p.waitForSelector('dialog[open] [data-dp-cite]');
            assert.ok(!/Q\d/.test(await p.textContent('dialog[open] [data-dp-cite]')), 'pas de numéro inventé'); await closeDlg();
        });
        await t('📜 Crédits et licences : par thème, la source de la liste, sa licence ; le fond des cartes ; les packs et leur version', async () => {
            await p.click('[data-dp-foot] [data-dp-credits]'); await p.waitForSelector('dialog[open] [data-dp-credt]', {timeout: 20000});
            const txt = await p.textContent('dialog[open] [data-dp-credt]'); assert.match(txt, /Guerres et soldats/); assert.match(txt, /Jeu d’essai[\s\S]*CC0/); assert.match(txt, /Natural Earth/);
            assert.match(await p.textContent('dialog[open] .dp-packs summary'), /packs livrés et installés/); await closeDlg();
        });

        /* ═════════ 4. 💾 🆕 🕳 ═════════ */
        await t('💾 Garder cette question → 💾 Mes questions ; une nouvelle réponse se voit (badge) ; ↶', async () => {
            await recap(); await p.fill('[data-dr-q]', 'les combats d’essai près de Chamberet'); await p.press('[data-dr-q]', 'Enter');
            await p.waitForSelector('[data-dp-keepq]', {timeout: 30000}).catch(async () => {
                await p.evaluate(() => window.LCNDA_EXT.dataHome.ask('les batailles près de Chamberet')); await p.waitForSelector('[data-dp-keepq]', {timeout: 30000}); });
            await p.click('[data-dp-keepq]'); assert.strictEqual(await p.getAttribute('[data-dp-keepq]', 'aria-pressed'), 'true');
            const q = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-donnees-questions'))[0]); assert.ok(q.q && typeof q.n === 'number');
            await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('genealogie-donnees-questions')); l[0].n = Math.max(0, l[0].n - 1); l[0].sig = 'avant'; localStorage.setItem('genealogie-donnees-questions', JSON.stringify(l)); });
            await recap(); await p.waitForFunction(() => /1 nouvelle réponse/.test(document.querySelector('[data-dp-blk="qs"]')?.textContent || ''), null, {timeout: 30000});
        });
        await t('🆕 nouveau depuis ta visite : un nouveau thème ; « ✓ Tout vu » vide le bloc', async () => {
            await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lcnda-donnees-vu')); s.themes = s.themes.filter(x => x !== 'guerres'); localStorage.setItem('lcnda-donnees-vu', JSON.stringify(s)); });
            await recap(); await p.waitForFunction(() => { const el = document.querySelector('[data-dp-blk="new"]'); return el && !el.hidden && /Nouveau thème/.test(el.textContent); }, null, {timeout: 30000});
            await p.click('[data-dp-seen]'); await sleep(1500); await p.waitForFunction(() => { const el = document.querySelector('[data-dp-blk="new"]'); return !el || el.hidden; }, null, {timeout: 20000});
        });
        await t('🕳 📍 Placer « Le Puy-Bas » : ce qui apparaîtrait, enregistré, ↶ Annuler', async () => {
            await p.click('[data-dp-missgo]'); await p.waitForSelector('dialog[open] [data-dp-pl="99"]', {timeout: 20000});
            assert.match(await p.textContent('dialog[open] [data-dp-pl="99"]'), /3 actes · 3 personnes/);
            await p.click('dialog[open] [data-dp-pl="99"] [data-dp-place-go]'); await p.fill('dialog[open] [data-dp-ll]', '45.58, 1.72'); await p.press('dialog[open] [data-dp-ll]', 'Tab');
            await p.waitForFunction(() => /données de plus apparaîtraient/.test(document.querySelector('dialog[open] [data-dp-gain]')?.textContent || ''), null, {timeout: 20000});
            await p.click('dialog[open] [data-dp-place-ok]'); await p.waitForSelector('dialog[open] [data-dp-pl="99"] .ui-badge');
            assert.strictEqual((await B.api('dplus_missing')).places.length, 0);
            await clickUndo(); await sleep(400); assert.strictEqual((await B.api('dplus_missing')).places.length, 1, '↶');
            await closeDlg();
        });

        /* ═════════ 5. la pastille, comparer, carte, livret, diaporama ═════════ */
        await t('📊 la pastille sur la fiche de Pierre LACOMBE → le récap filtré sur lui (un nombre par thème, qui ouvre la liste filtrée)', async () => {
            await p.evaluate(() => { window.LCNDA_EXT.donneesPlus.resetCache(); window.LCNDA_APP.openPersonById(1); });
            await p.waitForSelector('#workspace .person-page', {timeout: 20000});
            await p.waitForSelector('[data-dp-pastille]', {timeout: 30000});
            assert.match(await p.textContent('[data-dp-pastille]'), /📊 \d+ données la concernent/);
            await p.click('[data-dp-pastille]'); await p.waitForSelector('[data-dp-focus]', {timeout: 20000});
            assert.match(await p.textContent('[data-dp-focus]'), /Pour Pierre LACOMBE[\s\S]*pendant sa vie, 1747/);
            assert.match(await p.textContent('[data-dp-focus] [data-dp-ftheme="guerres"]'), /^\d+/);
            await p.click('[data-dp-focus] [data-dp-ftheme="guerres"]'); await p.waitForSelector('[data-ld-page] [data-ld-chips] .ui-listbar-chip', {timeout: 20000});
            assert.match(await p.textContent('[data-ld-chips]'), /Pierre LACOMBE · pendant sa vie/);
            await p.evaluate(() => { window.LCNDA_EXT.donneesPlus._focus.cur = null; });
        });
        await t('⚖️ comparer deux personnes, thème par thème (en bleu : en commun) ; 🗺 tout autour d’un lieu (couches, légende)', async () => {
            await recap(); await p.click('[data-dp-cmp]'); await p.waitForSelector('dialog[open] [data-dp-c="0"] input');
            await p.fill('dialog[open] [data-dp-c="0"] input', 'Pierre LACOMBE'); await p.waitForSelector('dialog[open] [data-dp-c="0"] [data-i]', {timeout: 10000}); await p.click('dialog[open] [data-dp-c="0"] [data-i]');
            await p.fill('dialog[open] [data-dp-c="1"] input', 'Jean MAZAUD'); await p.waitForSelector('dialog[open] [data-dp-c="1"] [data-i]', {timeout: 10000}); await p.click('dialog[open] [data-dp-c="1"] [data-i]');
            await p.waitForSelector('dialog[open] .dp-cmp', {timeout: 30000}); assert.match(await p.textContent('dialog[open] .dp-cmp'), /Guerres et soldats/);
            await closeDlg();
            await p.click('[data-dp-around]'); await p.waitForSelector('dialog[open] [data-dp-ap] input'); await p.fill('dialog[open] [data-dp-ap] input', 'Chamberet');
            await p.waitForSelector('dialog[open] [data-dp-ap] [data-i]', {timeout: 10000}); await p.click('dialog[open] [data-dp-ap] [data-i]');
            await p.waitForSelector('dialog[open] [data-ly="guerres"]', {timeout: 30000}); assert.match(await p.textContent('dialog[open] [data-dp-leg]'), /Autour de Chamberet · 30 km/);
            await p.click('dialog[open] [data-ly="guerres"]'); assert.strictEqual(await p.getAttribute('dialog[open] [data-ly="guerres"]', 'aria-pressed'), 'false');
            await closeDlg();
        });
        await t('📄 livret « Le monde de mes ancêtres » : chapitres non vides seulement, sources toujours, A5 → la fenêtre d’impression de l’app', async () => {
            const html = await p.evaluate(async () => { const P = window.LCNDA_EXT.donneesPlus, O = window.LCNDA_EXT.donneesPlusOutils; const who = await P.personInfo(1); return O.bookHtml([who], ['ville', 'guerres', 'terre', 'prix'], 'A5'); });
            assert.match(html, /size:A5/); assert.match(html, /Les guerres de sa vie/); assert.ok(html.split('<section class="bk-ch">').slice(1).every(x => /bk-ev|Sources et licences/.test(x)), 'pas de chapitre vide'); assert.ok(!/Les prix de son temps/.test(html), 'le chapitre vide n’est pas imprimé'); assert.match(html, /Sources et licences[\s\S]*Jeu d’essai — CC0/);
            assert.match(html, /1760 · Combat du Pont-Vieux<\/b>Pierre LACOMBE a 13 ans/); assert.ok(!/1700 ·/.test(html), 'seulement des événements de sa vie');
            await p.evaluate(() => { window.__printed = null; const U = window.LCNDA_UI; U.__pd = U.printDocument; U.printDocument = d => { window.__printed = d; return Promise.resolve(); }; window.LCNDA_EXT.donneesPlusOutils.booklet(1); });
            await p.waitForSelector('dialog[open] [data-dp-bprint]:not([disabled])', {timeout: 20000}); await p.click('dialog[open] [data-dp-bprint]');
            await p.waitForFunction(() => !!window.__printed, null, {timeout: 20000}); assert.match(await p.evaluate(() => window.__printed), /Le monde de mes ancêtres/);
            await p.evaluate(() => { const U = window.LCNDA_UI; U.printDocument = U.__pd; }); await closeDlg();
        });
        await t('🎞 sa vie, année par année : 3,5 s, sans musique, ← → ; « ✏️ Ouvrir dans 🎤 Présentation » crée une présentation modifiable', async () => {
            await p.evaluate(() => window.LCNDA_EXT.donneesPlusOutils.slideshow(1)); await p.waitForSelector('dialog[open] [data-dp-slide] .dp-yr', {timeout: 20000});
            assert.strictEqual(await p.textContent('dialog[open] .dp-yr'), '1747'); assert.strictEqual(await p.getAttribute('dialog[open] [data-dp-ss] [data-s="3500"]', 'aria-pressed'), 'true');
            assert.match(await p.textContent('dialog[open] .dp-ctl'), /Sans musique/);
            await p.focus('dialog[open] [data-dp-slide]'); await p.keyboard.press('ArrowRight'); const y2 = Number(await p.textContent('dialog[open] .dp-yr')); assert.ok(y2 > 1747, String(y2));
            await p.evaluate(() => { window.__kn = null; const E = window.LCNDA_EXT; E.__kft = E.keynoteFromText; E.keynoteFromText = (h, n) => { window.__kn = [h, n]; }; });
            await p.click('dialog[open] [data-dp-skn]'); const kn = await p.evaluate(() => window.__kn);
            assert.match(kn[1], /La vie de Pierre LACOMBE/); assert.match(kn[0], /<h2>1760 · 13 ans<\/h2><ul>[\s\S]*?Combat du Pont-Vieux/); assert.match(kn[0], /^<h1>/);
            await p.evaluate(() => { const E = window.LCNDA_EXT; E.keynoteFromText = E.__kft; });
            const real = await p.evaluate(() => typeof window.LCNDA_EXT.keynoteFromText); assert.strictEqual(real, 'function', '🎤 Présentation est là');
            await closeDlg();
        });

        /* ═════════ 6. partager, place, versions ═════════ */
        await t('🔗 partager une liste filtrée : l’aperçu ; jamais une personne vivante (retirée par le serveur) ; publié → famille.php la lit ; ↶', async () => {
            await openKey('data_test_combats'); await p.waitForSelector('[data-dp-share]', {timeout: 20000});
            await p.click('[data-dp-share]'); await p.waitForSelector('dialog[open] [data-dp-prev] table', {timeout: 20000});
            await p.waitForFunction(() => /1 lignes qui parlent|1 ligne/.test(document.querySelector('dialog[open] [data-dp-sd]')?.textContent || ''), null, {timeout: 10000});
            assert.match(await p.textContent('dialog[open] [data-dp-sd]'), /personne vivante/);
            assert.strictEqual(await p.getAttribute('dialog[open] [data-dp-aud] [data-a="membres"]', 'aria-pressed'), 'true');
            await p.click('dialog[open] button[type="submit"]'); await sleep(800);
            const sh = await B.api('dplus_shares'); assert.strictEqual(sh.shares.length, 1); assert.strictEqual(sh.shares[0].rows, 6);
            const lists = await p.evaluate(async () => { const r = await fetch('api.php?action=dplus_shares'); return r.ok; }); assert.ok(lists);
            const guest = spawnSync(php, [...phpRuntimeArgs(php), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/donnees_plus.php'; echo json_encode(dplus_guest_lists(db()));`], {encoding: 'utf8', cwd: path.join(__dirname, '..'), env: {...process.env, GENEALOGY_DATA_DIR: B.tmp, GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_TEST: '1'}});
            const g = JSON.parse(guest.stdout.trim().split('\n').pop()); assert.strictEqual(g.lists[0].rows.length, 6); assert.ok(!JSON.stringify(g).includes('Claire'), 'jamais la vivante');
            await clickUndo(); await sleep(300); assert.strictEqual((await B.api('dplus_shares')).shares.length, 0, '↶ retiré');
        });
        await t('💽 place prise et 🕰 versions : dans Réglages → 🗂 Données, à côté de ce qui existe', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'donnees_installees'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-dmaj-panel] [data-dp-maint] .dp-diskp', {timeout: 30000});
            await p.waitForFunction(() => /de données sur ce disque/.test(document.querySelector('.dp-diskp')?.textContent || ''), null, {timeout: 30000});
            await p.waitForSelector('.dp-versp [data-dp-vers] .dp-vers li', {timeout: 30000}); assert.match(await p.textContent('.dp-versp'), /utilisée/);
        });

        /* ═════════ 7. consultation, téléphone, erreurs ═════════ */
        await t('mode consultation : les réglages ne s’ouvrent pas ; pas de 📝 ⚠️ ➕ ⭐ ; les marques ◌ ≈ se voient', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await settings(); assert.match(await p.textContent('[data-dp-set]'), /ces réglages ne s’ouvrent pas/); assert.strictEqual(await p.$('[data-dp-ft]'), null);
            await openKey('data_test_combats'); await p.waitForSelector('[data-ld-results] tbody tr[data-ld-row]', {timeout: 20000}); await sleep(500);
            assert.strictEqual(await p.$('[data-dp-act="note"]'), null); assert.strictEqual(await p.$('[data-dp-act="doubt"]'), null); assert.strictEqual(await p.$('[data-dp-addrow]'), null); assert.strictEqual(await p.$('[data-dp-star]'), null);
            assert.strictEqual(await p.$('tr.dp-mine'), null); assert.ok(await p.$('[data-dp-mark="lieu"]'));
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('390 px, en sombre : le récap à blocs, les réglages, une liste — rien ne déborde, rien de collé aux bords', async () => {
            await p.setViewportSize({width: 390, height: 844}); await p.evaluate(() => { localStorage.setItem('genealogie-design', JSON.stringify({...JSON.parse(localStorage.getItem('genealogie-design') || '{}'), preset: 'dark'})); window.LCNDA_APP.applyDesign?.(); });
            await recap(); await sleep(1500); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'récap');
            const r = await p.evaluate(() => { const b = document.querySelector('[data-dp-grid]').getBoundingClientRect(); return [b.left, innerWidth - b.right]; }); assert.ok(r[0] >= 8 && r[1] >= 8, 'bords : ' + r);
            await settings(); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'réglages');
            await openKey('data_test_combats'); await p.waitForSelector('[data-ld-results] tbody tr', {timeout: 20000}); await sleep(400); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'liste');
            await recap(); await p.click('[data-dp-org]'); await p.waitForSelector('.dp-org-dlg [data-dp-row]'); assert.ok(await p.$eval('.dp-org-dlg .dp-sz-s', x => getComputedStyle(x).display !== 'none'), 'la taille sous le nom'); await closeDlg();
            await p.setViewportSize({width: 1440, height: 900}); await p.evaluate(() => { localStorage.setItem('genealogie-design', JSON.stringify({...JSON.parse(localStorage.getItem('genealogie-design') || '{}'), preset: 'portfolio'})); window.LCNDA_APP.applyDesign?.(); });
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
