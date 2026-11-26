#!/usr/bin/env node
/* 📈 L'onglet Diagrammes (assets/js/app-diagrammes-onglet.js ; l'outil : heritage-diagrams.js ; serveur : lib/diagrams.php ;
 *   maquette validée docs/design/onglet-diagrammes.html, partie « Décisions »).
 *  1. caché au départ ; allumé par « ＋ Ajouter un onglet » (genealogie-menu-added), numéroté 03 à côté de Graphiques ;
 *  2. ＋ Nouveau par les trois portes (🖼 un dessin, 💬 « Je veux représenter… », 📊 Partir des données), l'éditeur DANS la page
 *     (pas de fenêtre), enregistré tout seul (« ✓ Enregistré »), ↶ ↷, « ← Mes diagrammes » ;
 *  3. un diagramme posé sur une fiche : « ↗ Ouvrir » arrive dans l'onglet ; ← du navigateur ramène à la fiche ;
 *  4. 📁 dossiers (créer, glisser une carte dessus), ⭐ favoris, 🕘 récents ;
 *  5. 🗑 corbeille sans question, ↶ Annuler, ↺ Remettre (dans son dossier), vider (↶ Annuler), effacé après 30 jours (date simulée) ;
 *  6. là où il est posé : « Diagramme à la corbeille — Remettre » ;
 *  7. ☑ Choisir : la barre du bas (⭐, 📁, 🗑) ; ⚙ (vue en liste, vignettes, « Montrer aussi mes graphiques ») ;
 *  8. un lien direct #diagrammes/N, ← → du navigateur ;
 *  9. onglet éteint : tout comme avant (Graphiques, la fenêtre de l'éditeur, la question avant de supprimer) ; allumé : Graphiques et
 *     Listes → « Graphiques et diagrammes » ouvrent dans l'onglet ;
 * 10. mode consultation : ni ＋, ni ⭐, ni dossier, ni corbeille ; ⋯ = Ouvrir, Exporter ; le diagramme s'ouvre en lecture ;
 * 11. 390 px et sombre : rien ne déborde, rien de collé ; aucune erreur.
 * Base : tests/prendre-depuis-seed.js (familles MAZAUD, LACOMBE, DURAND).   node tests/test-onglet-diagrammes.js */
'use strict';
const assert = require('assert');
const path = require('path');
const {spawnSync} = require('child_process');
const {start, sleep} = require('./prendre-depuis-seed.js');
const {detect} = require('./test-rien-de-colle.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    try {
        const st = () => p.evaluate(() => ({module: window.LCNDA_APP.state.module, hash: location.hash, dialogs: document.querySelectorAll('dialog[open]').length,
            tab: document.querySelector('.main-nav .nav-item.is-active')?.dataset.module || '', page: document.querySelector('#workspace [data-dgo-page]')?.dataset.dgoPage || ''}));
        const idle = async (ms = 500) => { await sleep(ms); await p.waitForFunction(() => !document.querySelector('#workspace .loading-screen'), null, {timeout: 30000}).catch(() => {}); await sleep(200); };
        const closeAll = () => p.evaluate(() => { document.querySelectorAll('.ui-actmenu').forEach(x => x.remove()); document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch (_) {} d.remove(); }); });
        const list = () => p.evaluate(async () => (await window.LCNDA_APP.api('diagrams')).diagrams);
        const trashList = () => p.evaluate(async () => (await window.LCNDA_APP.api('diagrams', {trash: 1})).diagrams);
        const DO = (fn, arg) => p.evaluate(fn, arg);
        const clickUndo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(700); };
        const menuItem = async label => { const b = p.locator('.ui-actmenu button', {hasText: label}).first(); await b.waitFor({timeout: 5000}); await b.click(); await sleep(400); };
        const home = async () => { await DO(() => window.LCNDA_EXT.diagrammesOnglet.go({view: 'home', nav: 'all'})); await p.waitForSelector('#workspace [data-dgo-page="home"]', {timeout: 20000}); await idle(300); };
        const sql = q => { const r = spawnSync('php', ['-r', `$p = new PDO('sqlite:' . getenv('DB')); echo json_encode($p->query(getenv('Q'))->fetchAll(PDO::FETCH_ASSOC));`], {encoding: 'utf8', env: {...process.env, DB: path.join(B.tmp, 'genealogy.sqlite'), Q: q}}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return JSON.parse(r.stdout || '[]'); };
        const PID = 1;
        const pname = await DO(async id => (await window.LCNDA_APP.api('diagram_people', {ids: String(id)})).people[0]?.name || '', PID);

        /* ═════════ 1. caché au départ, puis allumé ═════════ */
        await t('caché au départ : l’onglet n’est pas dans le menu, et un diagramme s’ouvre dans Graphiques comme avant', async () => {
            const s = await DO(() => ({on: window.LCNDA_EXT.diagrammesOnglet.on(), shown: !!document.querySelector('.main-nav .nav-item[data-module="diagrammes"]')?.getClientRects().length, hidden: window.LCNDA_APP.menuHiddenKeys?.() || JSON.parse(localStorage.getItem('genealogie-menu-hidden') || '[]')}));
            assert.strictEqual(s.on, false); assert.strictEqual(s.shown, false, 'pas visible dans le menu');
            assert.ok(s.hidden.includes('diagrammes'), 'genealogie-menu-hidden le contient au départ');
        });
        await t('« ＋ Ajouter un onglet » l’allume : 03 · 📈 Diagrammes, juste après Graphiques, gardé dans genealogie-menu-added', async () => {
            await DO(() => window.LCNDA_EXT.tabsPlus.open()); await p.waitForSelector('[data-tp-item="diagrammes"]', {timeout: 10000});
            const txt = await p.$eval('[data-tp-card="diagrammes"]', c => c.textContent); assert.match(txt, /Diagrammes/);
            await p.click('[data-tp-card="diagrammes"]'); await sleep(500); await closeAll();
            const s = await DO(() => ({on: window.LCNDA_EXT.diagrammesOnglet.on(), btn: document.querySelector('.main-nav .nav-item[data-module="diagrammes"]')?.textContent.trim(), added: JSON.parse(localStorage.getItem('genealogie-menu-added') || '[]'),
                visible: !!document.querySelector('.main-nav .nav-item[data-module="diagrammes"]')?.getClientRects().length}));
            assert.strictEqual(s.on, true); assert.ok(s.visible); assert.ok(s.added.includes('diagrammes')); assert.match(s.btn, /^03\s*📈 Diagrammes$/);
            await p.click('.main-nav .nav-item[data-module="diagrammes"]'); await idle();
            const x = await st(); assert.deepStrictEqual([x.module, x.tab, x.hash, x.page], ['diagrammes', 'diagrammes', '#diagrammes', 'home']);
            assert.ok(await p.$('#sidebar-content [data-side-value="new"]'), '＋ Nouveau dans la colonne');
            assert.ok(await p.$('#sidebar-content [data-side-value="nav:all"]'), '🗂 Tous');
            for (const g of ['fav', 'rec', 'fold', 'st', 'mod', 'tr']) assert.ok(await p.$(`#sidebar-content details[data-dgo-grp="${g}"]`), 'le groupe ' + g);
        });

        /* ═════════ 2. ＋ Nouveau par les trois portes, l'éditeur dans la page ═════════ */
        let D1 = 0, D2 = 0, D3 = 0;
        await t('🖼 « Choisir un dessin » : les ✨ conseillés puis « Tous », dans la page ; l’éditeur s’ouvre DANS l’onglet, enregistré tout seul', async () => {
            await p.click('#workspace [data-dgo-new]'); await idle();
            let s = await st(); assert.strictEqual(s.hash, '#diagrammes/nouveau'); assert.strictEqual(s.dialogs, 0);
            assert.strictEqual(await p.$$eval('#workspace [data-dgo-door]', a => a.length), 3);
            await p.click('[data-dgo-door="gal"]'); await p.waitForSelector('#workspace .h-dg-gallery.h-dg-inline .h-dg-tile', {timeout: 10000});
            assert.strictEqual((await st()).hash, '#diagrammes/nouveau/dessin');
            const nSug = await p.$$eval('#workspace .h-dg-tile', a => a.length); assert.strictEqual(nSug, 5, '5 conseillés au départ (genealogie-diagrammes-conseilles)');
            await p.click('#workspace [data-dg-galall="1"]'); await sleep(300);
            assert.ok(await p.$$eval('#workspace .h-dg-tile', a => a.length) > 40, 'Tous : le catalogue entier');
            await p.click('#workspace [data-dg-galall="0"]'); await sleep(300);
            await p.click('#workspace .h-dg-tile >> nth=0'); await p.waitForSelector('#workspace .h-dg-dlg.h-dg-inline', {timeout: 15000}); await idle(1200);
            s = await st(); assert.strictEqual(s.dialogs, 0, 'aucune fenêtre par-dessus'); assert.match(s.hash, /^#diagrammes\/\d+$/);
            D1 = Number(s.hash.split('/')[1]);
            assert.match(await p.$eval('#workspace [data-ui-status]', e => e.textContent), /Enregistré/);
            assert.match(await p.$eval('#workspace [data-dg-crumb]', e => e.textContent), /^Diagrammes ›/);
            assert.ok(await p.$('#workspace [data-dg-back]'), '« ← Mes diagrammes »');
            assert.ok((await list()).some(d => d.id === D1), 'créé sur le serveur');
            const w = await p.$eval('#workspace .h-dg-inline', e => e.getBoundingClientRect().width); const ws = await p.$eval('#workspace', e => e.clientWidth);
            assert.ok(w > ws * 0.85, `pleine largeur (${w} / ${ws})`);
        });
        await t('modifier → « ✓ Enregistré » tout seul ; ↶ défait, ↷ refait ; « ← Mes diagrammes » revient à la liste', async () => {
            await p.fill('#workspace [data-dg-name]', 'Pyramide des âges — MAZAUD'); await sleep(1800);
            assert.strictEqual((await list()).find(d => d.id === D1).name, 'Pyramide des âges — MAZAUD');
            assert.match(await p.$eval('#workspace [data-dg-crumb]', e => e.textContent), /Pyramide des âges — MAZAUD$/);
            await p.click('#workspace [data-dg-undo]'); await sleep(1400);
            const back = await p.$eval('#workspace [data-dg-name]', e => e.value); assert.notStrictEqual(back, 'Pyramide des âges — MAZAUD');
            assert.strictEqual((await list()).find(d => d.id === D1).name, back, '↶ enregistré aussi');
            await p.click('#workspace [data-dg-redo]'); await sleep(1400);
            assert.strictEqual(await p.$eval('#workspace [data-dg-name]', e => e.value), 'Pyramide des âges — MAZAUD');
            assert.strictEqual((await list()).find(d => d.id === D1).name, 'Pyramide des âges — MAZAUD');
            await p.click('#workspace [data-dg-back]'); await idle();
            const s = await st(); assert.deepStrictEqual([s.hash, s.page], ['#diagrammes', 'home']);
            assert.ok(await p.$(`#workspace [data-dgo-card="${D1}"]`), 'la carte');
            await p.waitForSelector(`#workspace [data-dgo-th="${D1}"] img`, {timeout: 15000}); // la vignette : le vrai dessin, en PNG
        });
        await t('💬 « Je veux représenter… » : une proposition → l’éditeur dans l’onglet', async () => {
            await p.click('#sidebar-content [data-side-value="new"]'); await p.waitForSelector('#workspace [data-dga-q]', {timeout: 10000});
            await p.fill('#workspace [data-dga-q]', 'les prénoms des DURAND'); await p.click('#workspace [data-dga-go]');
            await p.waitForSelector('#workspace [data-dga-pick]', {timeout: 30000}); await p.click('#workspace [data-dga-pick] >> nth=0');
            await p.waitForSelector('#workspace .h-dg-inline', {timeout: 15000}); await idle(1500);
            const s = await st(); assert.match(s.hash, /^#diagrammes\/\d+$/); assert.strictEqual(s.dialogs, 0); D2 = Number(s.hash.split('/')[1]); assert.notStrictEqual(D2, D1);
        });
        await t('📊 « Partir des données » : l’éditeur dans l’onglet, sur « 📊 Partir des données »', async () => {
            await p.click('#sidebar-content [data-side-value="new"]'); await idle(); await p.click('[data-dgo-door="data"]'); await idle();
            assert.strictEqual((await st()).hash, '#diagrammes/nouveau/donnees');
            await p.click('#workspace [data-dgo-fromdata="list"]'); await p.waitForSelector('#workspace .h-dg-inline', {timeout: 15000}); await idle(1500);
            const s = await st(); assert.match(s.hash, /^#diagrammes\/\d+$/); assert.strictEqual(s.dialogs, 0); D3 = Number(s.hash.split('/')[1]);
            assert.ok(await p.$('#workspace [data-dg-tab="app"].is-active'), 'onglet 📊 Partir des données');
            await home();
        });

        /* ═════════ 3. un diagramme posé sur une fiche ═════════ */
        let DF = 0;
        await t('posé sur la fiche d’une personne : « ↗ Ouvrir » arrive dans 📈 Diagrammes ; ← du navigateur ramène à la fiche', async () => {
            DF = await DO(async pid => { const r = await window.LCNDA_APP.api('save_diagram', {}, {method: 'POST', body: {name: 'Frise de vies — les LACOMBE de Nice', kind: 'timeline', spec: window.LCNDA_EXT.diagramsInternals.presetSpec({kind: 'timeline'}), links: [{type: 'person', id: pid}]}}); await window.LCNDA_EXT.diagramList(true); return Number(r.result?.id || r.id); }, PID);
            await DO(pid => { window.LCNDA_APP.state.currentPersonId = pid; window.LCNDA_APP.setModule('personnes'); }, PID);
            await p.waitForSelector(`#workspace [data-dg-embed="${DF}"] [data-dg-open]`, {timeout: 30000}); await idle();
            const before = (await st()).hash;
            await p.click(`#workspace [data-dg-embed="${DF}"] [data-dg-open]`); await p.waitForSelector('#workspace .h-dg-inline', {timeout: 15000}); await idle();
            const s = await st(); assert.deepStrictEqual([s.module, s.tab, s.hash, s.dialogs], ['diagrammes', 'diagrammes', `#diagrammes/${DF}`, 0]);
            assert.match(await p.$eval('#workspace .dgo-edhost .h-dg-dlg', e => e.textContent), /Relier/);
            await p.goBack(); await idle(1200);
            const b = await st(); assert.strictEqual(b.module, 'personnes'); assert.strictEqual(b.hash, before);
            await p.click('.main-nav .nav-item[data-module="diagrammes"]'); await idle();
        });

        /* ═════════ 4. dossiers, glisser, ⭐, récents ═════════ */
        let FID = '';
        await t('📁 un dossier (les mêmes que Graphiques : genealogie-side-folders, « diagram ») ; glisser une carte dessus la range', async () => {
            await home();
            await p.click('#sidebar-content [data-dgo-newfolder]'); await p.waitForSelector('dialog.ask-text-dialog input', {timeout: 5000});
            await p.fill('dialog.ask-text-dialog input', 'Famille MAZAUD'); await p.click('dialog.ask-text-dialog [data-ask-ok]'); await sleep(600);
            FID = await DO(() => window.LCNDA_SIDE_FOLDERS.read('diagram').folders.find(f => f.name === 'Famille MAZAUD')?.id || '');
            assert.match(FID, /^f_/);
            await p.dragAndDrop(`#workspace [data-dgo-card="${D1}"]`, `#sidebar-content [data-dgo-drop="${FID}"]`); await sleep(700);
            assert.strictEqual(await DO(id => window.LCNDA_SIDE_FOLDERS.read('diagram').of[String(id)], D1), FID, 'rangé par le glisser');
            assert.match(await p.$eval(`#sidebar-content [data-dgo-drop="${FID}"] .dgo-n`, e => e.textContent), /^1$/);
            await p.click(`#sidebar-content [data-side-value="nav:${FID}"]`); await idle();
            const s = await st(); assert.strictEqual(s.hash, `#diagrammes/dossier/${FID}`);
            assert.deepStrictEqual(await p.$$eval('#workspace [data-dgo-card]', a => a.map(x => Number(x.dataset.dgoCard))), [D1]);
            assert.match(await p.$eval('#workspace .page-header h2', e => e.textContent), /Famille MAZAUD/);
            // le même rangement dans Graphiques → « Mes diagrammes »
            await DO(() => window.LCNDA_APP.setModule('graphiques')); await idle();
            assert.ok(await p.$(`#sidebar-content [data-sf-folder="${FID}"]`), 'le dossier dans la colonne de Graphiques');
            await p.click('.main-nav .nav-item[data-module="diagrammes"]'); await idle();
        });
        await t('⭐ favori (gardé sur le serveur) et 🕘 récents (le dernier ouvert en tête)', async () => {
            await home();
            await p.click(`#workspace [data-dgo-star="${D2}"]`); await sleep(700);
            assert.strictEqual(Number((await list()).find(d => d.id === D2).favorite), 1);
            assert.ok(await p.$(`#sidebar-content [data-dgo-grp="fav"] [data-side-value="d:${D2}"]`), 'dans ⭐ Favoris');
            await DO(id => window.LCNDA_EXT.diagrammesOnglet.open(id), D3); await p.waitForSelector('#workspace .h-dg-inline'); await idle();
            await home();
            const rec = (await list()).filter(d => d.opened_at).sort((a, b) => (a.opened_at < b.opened_at ? 1 : a.opened_at > b.opened_at ? -1 : 0));
            assert.ok(rec.length >= 2, 'opened_at sur le serveur');
            const side = await p.$$eval('#sidebar-content [data-dgo-grp="rec"] [data-side-value^="d:"]', a => a.map(b => Number(b.dataset.sideValue.slice(2))));
            assert.strictEqual(side[0], D3, 'le dernier ouvert en tête des 🕘 Récents');
            await p.click(`#workspace [data-dgo-star="${D2}"]`); await sleep(600);
            assert.strictEqual(Number((await list()).find(d => d.id === D2).favorite), 0);
        });

        /* ═════════ 5. 🗑 la corbeille ═════════ */
        await t('🗑 supprimer = corbeille, sans question ; ↶ Annuler le remet', async () => {
            await home();
            await p.click(`#workspace [data-dgo-more="${D1}"]`); await menuItem('Mettre à la corbeille');
            assert.strictEqual(await DO(() => document.querySelectorAll('dialog[open]').length), 0, 'pas de question');
            assert.ok(!(await list()).some(d => d.id === D1)); assert.ok((await trashList()).some(d => d.id === D1));
            assert.ok(!(await p.$(`#workspace [data-dgo-card="${D1}"]`)));
            await clickUndo();
            assert.ok((await list()).some(d => d.id === D1), '↶ remis'); assert.ok(await p.$(`#workspace [data-dgo-card="${D1}"]`));
            assert.strictEqual(await DO(id => window.LCNDA_SIDE_FOLDERS.read('diagram').of[String(id)], D1), FID, 'toujours dans son dossier');
        });
        await t('↺ Remettre depuis la 🗑 Corbeille : remis à sa place (son dossier)', async () => {
            await DO(id => window.LCNDA_EXT.diagrammesOnglet.trash([id]), D1); await sleep(800);
            await DO(() => { const d = window.LCNDA_SIDE_FOLDERS.read('diagram'); Object.keys(d.of).forEach(k => { if (!window.LCNDA_EXT.diagramItems().some(([i]) => String(i) === k)) delete d.of[k]; }); window.LCNDA_SIDE_FOLDERS.write('diagram', d); }); // Graphiques oublie le rangement d'un diagramme qu'il ne voit plus
            await DO(() => { document.querySelector('#sidebar-content [data-dgo-grp="tr"]').open = true; }); // le groupe 🗑 se déplie
            await p.click('#sidebar-content [data-side-value="trash"]'); await idle();
            assert.strictEqual((await st()).hash, '#diagrammes/corbeille');
            assert.ok(await p.$(`#workspace [data-dgo-trow="${D1}"]`)); assert.match(await p.$eval(`#workspace [data-dgo-trow="${D1}"]`, e => e.textContent), /30 jours/);
            await p.click(`#workspace [data-dgo-restore="${D1}"]`); await sleep(900);
            assert.ok((await list()).some(d => d.id === D1)); assert.ok(!(await p.$(`#workspace [data-dgo-trow="${D1}"]`)));
            assert.strictEqual(await DO(id => window.LCNDA_SIDE_FOLDERS.read('diagram').of[String(id)], D1), FID, 'de retour dans 📁 Famille MAZAUD');
        });
        await t('vider la corbeille : ↶ Annuler la rend ; sinon effacé pour de bon', async () => {
            await DO(id => window.LCNDA_EXT.diagrammesOnglet.trash([id]), D3); await sleep(700);
            await DO(() => window.LCNDA_EXT.diagrammesOnglet.go({view: 'trash'})); await idle();
            await p.click('#workspace [data-dgo-empty]'); await sleep(500);
            assert.ok(!(await p.$(`#workspace [data-dgo-trow="${D3}"]`)), 'vidée tout de suite à l’écran');
            await clickUndo(); assert.ok(await p.$(`#workspace [data-dgo-trow="${D3}"]`), '↶ la corbeille revient');
            assert.ok((await trashList()).some(d => d.id === D3), 'rien d’effacé');
            await p.click('#workspace [data-dgo-empty]'); await sleep(300); await DO(() => window.LCNDA_EXT.diagrammesOnglet.commitEmpty()); await sleep(800);
            assert.ok(!(await trashList()).some(d => d.id === D3)); assert.strictEqual(sql(`SELECT id FROM diagrams WHERE id=${D3}`).length, 0, 'effacé du serveur');
        });
        await t('plus de 30 jours dans la corbeille (date simulée) : effacé au chargement', async () => {
            const tmp = await DO(async () => { const r = await window.LCNDA_APP.api('save_diagram', {}, {method: 'POST', body: {name: 'Essai de camembert', kind: 'pie', spec: window.LCNDA_EXT.diagramsInternals.presetSpec({kind: 'pie'})}}); return Number(r.result?.id || r.id); });
            const keep = await DO(async () => { const r = await window.LCNDA_APP.api('save_diagram', {}, {method: 'POST', body: {name: 'Hémicycle (copie)', kind: 'parliament', spec: window.LCNDA_EXT.diagramsInternals.presetSpec({kind: 'parliament'})}}); return Number(r.result?.id || r.id); });
            await DO(ids => window.LCNDA_APP.api('trash_diagrams', {}, {method: 'POST', body: {ids}}), [tmp, keep]);
            sql(`UPDATE diagrams SET deleted_at=datetime('now','-31 days') WHERE id=${tmp}`); sql(`UPDATE diagrams SET deleted_at=datetime('now','-29 days') WHERE id=${keep}`);
            assert.strictEqual(sql(`SELECT id FROM diagrams WHERE id=${tmp}`).length, 1);
            const tl = await trashList(); // le chargement purge
            assert.ok(!tl.some(d => d.id === tmp), '31 jours : parti'); assert.ok(tl.some(d => d.id === keep), '29 jours : encore là');
            assert.strictEqual(sql(`SELECT id FROM diagrams WHERE id=${tmp}`).length, 0);
            await DO(() => window.LCNDA_EXT.diagrammesOnglet.go({view: 'trash'})); await idle();
            assert.match(await p.$eval(`#workspace [data-dgo-trow="${keep}"]`, e => e.textContent), /1 jour/);
        });

        /* ═════════ 6. là où il était posé ═════════ */
        await t('posé sur une fiche puis mis à la corbeille : « Diagramme à la corbeille — Remettre » sur la fiche ; « Remettre » le rend', async () => {
            await DO(id => window.LCNDA_EXT.diagrammesOnglet.trash([id]), DF); await sleep(700);
            await DO(pid => { window.LCNDA_APP.state.currentPersonId = pid; window.LCNDA_APP.setModule('personnes'); }, PID);
            await p.waitForSelector(`#workspace [data-dg-embed="${DF}"] .h-dg-trashed`, {timeout: 30000});
            assert.match(await p.$eval(`#workspace [data-dg-embed="${DF}"]`, e => e.textContent), /Diagramme à la corbeille — Remettre/);
            await p.click(`#workspace [data-dg-embed="${DF}"] [data-dg-restore]`);
            await p.waitForSelector(`#workspace [data-dg-embed="${DF}"] .h-dg-svg svg`, {timeout: 15000});
            assert.ok((await list()).some(d => d.id === DF));
            await p.click('.main-nav .nav-item[data-module="diagrammes"]'); await idle();
        });

        /* ═════════ 7. ☑ Choisir, ⚙ ═════════ */
        await t('☑ Choisir : la barre du bas (N choisis) ; ⭐ et 📁 Déplacer pour plusieurs ; 🗑 puis ↶', async () => {
            await home();
            await p.click('#workspace [data-dgo-multi]'); await sleep(300);
            await p.check(`#workspace [data-dgo-ck="${D2}"]`); await sleep(300); await p.check(`#workspace [data-dgo-ck="${DF}"]`); await sleep(300);
            assert.match(await p.$eval('#workspace [data-dgo-seln]', e => e.textContent), /2 choisis/);
            const pos = await p.$eval('#workspace .dgo-selbar', e => getComputedStyle(e).position); assert.strictEqual(pos, 'sticky');
            await p.click('#workspace [data-dgo-bulk="fav"]'); await sleep(800);
            const L = await list(); assert.ok([D2, DF].every(id => Number(L.find(d => d.id === id).favorite) === 1));
            await p.click('#workspace [data-dgo-bulk="move"]'); await menuItem('Famille MAZAUD'); await sleep(400);
            assert.ok(await DO(([a, b, f]) => { const o = window.LCNDA_SIDE_FOLDERS.read('diagram').of; return o[a] === f && o[b] === f; }, [String(D2), String(DF), FID]));
            await p.click('#workspace [data-dgo-bulk="del"]'); await sleep(900);
            assert.ok(!(await list()).some(d => [D2, DF].includes(d.id)));
            await clickUndo();
            assert.strictEqual((await list()).filter(d => [D2, DF].includes(d.id)).length, 2);
            await p.click('#workspace [data-dgo-multi]'); await sleep(300); assert.ok(!(await p.$('#workspace .dgo-selbar')));
        });
        await t('⚙ réglages : la liste au lieu des vignettes, les vignettes éteintes, « Montrer aussi mes graphiques » (éteint au départ)', async () => {
            await home();
            await p.click('#workspace [data-dgo-settings]'); await p.waitForSelector('dialog.dgo-settings[open]');
            assert.strictEqual(await p.$eval('dialog.dgo-settings [data-dgo-tog="graphs"]', e => e.checked), false, 'mes graphiques : pas au départ');
            await p.click('dialog.dgo-settings [data-dgo-set="view"][data-v="list"]'); await sleep(300);
            assert.ok(await p.$('#workspace table.dgo-lt'), 'la liste');
            await p.click('dialog.dgo-settings [data-dgo-tog="graphs"] + i'); await sleep(200);
            assert.strictEqual(JSON.parse(await DO(() => localStorage.getItem('genealogie-diagrammes-onglet'))).graphs, true);
            await p.click('dialog.dgo-settings [data-dgo-tog="graphs"] + i'); await p.click('dialog.dgo-settings [data-dgo-setreset]'); await sleep(200);
            await p.click('dialog.dgo-settings .modal-actions [data-close]'); await sleep(300);
            assert.ok(await p.$('#workspace .dgo-grid'), 'valeurs de départ : les vignettes');
        });

        /* ═════════ 8. lien direct, ← → ═════════ */
        await t('un lien direct #diagrammes/N (après rechargement) ouvre l’éditeur dans l’onglet ; #diagrammes/corbeille aussi', async () => {
            await p.goto(B.base + `#diagrammes/${D2}`); await p.waitForFunction(() => window.LCNDA_APP?.state?.module === 'diagrammes', null, {timeout: 60000});
            await p.waitForSelector('#workspace .h-dg-inline', {timeout: 30000}); await idle();
            let s = await st(); assert.deepStrictEqual([s.hash, s.tab], [`#diagrammes/${D2}`, 'diagrammes']);
            await p.goto(B.base + '#diagrammes/corbeille'); await p.waitForFunction(() => window.LCNDA_APP?.state?.module === 'diagrammes', null, {timeout: 60000});
            await p.waitForSelector('#workspace [data-dgo-page="trash"]', {timeout: 30000});
            s = await st(); assert.strictEqual(s.hash, '#diagrammes/corbeille');
        });
        await t('← → du navigateur : accueil → un diagramme → ← accueil → → le diagramme', async () => {
            await home();
            await p.click(`#workspace [data-dgo-open="${D2}"].dgo-name`); await p.waitForSelector('#workspace .h-dg-inline'); await idle();
            assert.strictEqual((await st()).hash, `#diagrammes/${D2}`);
            await p.goBack(); await p.waitForSelector('#workspace [data-dgo-page="home"]', {timeout: 15000}); await idle();
            assert.strictEqual((await st()).hash, '#diagrammes');
            await p.goForward(); await p.waitForSelector('#workspace .h-dg-inline', {timeout: 15000}); await idle();
            assert.strictEqual((await st()).hash, `#diagrammes/${D2}`);
        });
        await t('onglet allumé : Graphiques → « Mes diagrammes » et Listes → « Graphiques et diagrammes » ouvrent dans 📈 Diagrammes', async () => {
            await DO(() => window.LCNDA_APP.setModule('graphiques')); await idle();
            await p.click(`#sidebar-content [data-side-value="diagram:${D2}"]`); await p.waitForSelector('#workspace .h-dg-inline', {timeout: 15000}); await idle();
            let s = await st(); assert.deepStrictEqual([s.module, s.hash], ['diagrammes', `#diagrammes/${D2}`]);
            await DO(() => { window.LCNDA_APP.state.listType = 'graphs_list'; window.LCNDA_APP.setModule('listes'); }); await p.waitForSelector(`#workspace [data-gr-open="diagram:${D1}"]`, {timeout: 30000, state: 'attached'}); await idle();
            await DO(id => document.querySelector(`#workspace [data-gr-open="diagram:${id}"]`).click(), D1); await p.waitForSelector('#workspace .h-dg-inline', {timeout: 15000}); await idle();
            s = await st(); assert.deepStrictEqual([s.module, s.hash, s.dialogs], ['diagrammes', `#diagrammes/${D1}`, 0]);
        });

        /* ═════════ 9. onglet éteint : comme avant ═════════ */
        await t('onglet éteint : rien ne change — Graphiques, la fenêtre « Nouveau diagramme », la question avant de supprimer', async () => {
            await DO(() => window.LCNDA_EXT.diagrammesOnglet.setOn(false, {undo: false})); await sleep(300);
            assert.strictEqual(await DO(() => !!document.querySelector('.main-nav .nav-item[data-module="diagrammes"]')?.getClientRects().length), false);
            await DO(id => window.LCNDA_EXT.openDiagram(id), D2); await idle(1000);
            let s = await st(); assert.strictEqual(s.module, 'graphiques'); assert.strictEqual(await DO(() => window.LCNDA_APP.state.graphMode), 'diagram');
            assert.ok(await p.$('#workspace .h-dg-page [data-dg-del]'), 'la page de Graphiques');
            await DO(() => document.querySelector('#workspace .h-dg-page [data-dg-del]').click()); await sleep(500);
            assert.ok(await DO(() => document.querySelectorAll('dialog[open]').length) > 0, 'la question d’avant'); await closeAll();
            assert.ok((await list()).some(d => d.id === D2), 'rien de supprimé');
            await DO(() => { window.LCNDA_EXT.openDiagramEditor(null); }); await p.waitForSelector('dialog.h-dg-gallery[open]', {timeout: 10000});
            assert.strictEqual((await st()).module, 'graphiques', 'la fenêtre, par-dessus Graphiques'); await closeAll();
            await p.click(`#sidebar-content [data-side-value="diagram:${D1}"]`); await idle();
            s = await st(); assert.strictEqual(s.module, 'graphiques');
            await DO(() => window.LCNDA_EXT.diagrammesOnglet.setOn(true, {undo: false}));
        });

        /* ═════════ 10. mode consultation ═════════ */
        await t('mode consultation : ni ＋, ni ⭐, ni dossier, ni corbeille ; ⋯ = Ouvrir, Exporter ; le diagramme s’ouvre en lecture', async () => {
            await DO(() => document.body.classList.add('is-kiosk'));
            try {
                await DO(() => window.LCNDA_APP.setModule('diagrammes')); await idle(); await home();
                assert.ok(!(await p.$('#workspace [data-dgo-new]')), 'pas de ＋'); assert.ok(!(await p.$('#sidebar-content [data-side-value="new"]')));
                assert.ok(!(await p.$('#workspace [data-dgo-multi]')), 'pas de ☑ Choisir');
                assert.strictEqual(await p.$eval(`#workspace [data-dgo-star="${D2}"]`, e => e.disabled), true, '⭐ en lecture');
                assert.ok(!(await p.$('#sidebar-content [data-dgo-newfolder]')) && !(await p.$('#sidebar-content [data-dgo-fmore]')), 'pas de dossier à créer ou ranger');
                assert.ok(!(await p.$('#sidebar-content [data-dgo-grp="tr"]')), 'pas de corbeille'); assert.ok(!(await p.$('#sidebar-footer [data-dgo-reorder]')), 'pas de Réordonner');
                assert.ok(await p.$('#workspace .dgo-kiosk'));
                await p.click(`#workspace [data-dgo-more="${D2}"]`); await sleep(400);
                const items = await p.$$eval('.ui-actmenu button', a => a.map(b => b.textContent.trim()));
                assert.strictEqual(items.length, 2, items.join(' | ')); assert.match(items[0], /Ouvrir/); assert.match(items[1], /Exporter/);
                await menuItem('Ouvrir'); await p.waitForSelector('#workspace [data-dgo-page="view"]', {timeout: 15000});
                assert.ok(!(await p.$('#workspace .h-dg-inline')), 'pas d’éditeur'); assert.ok(await p.$('#workspace [data-dgo-export]'));
                await DO(() => window.LCNDA_EXT.diagrammesOnglet.go({view: 'trash'})); await idle();
                assert.strictEqual((await st()).page, 'home', 'la corbeille n’est pas ouverte en consultation');
            } finally { await DO(() => document.body.classList.remove('is-kiosk')); }
        });

        /* ═════════ 11. 390 px, sombre ═════════ */
        await t('390 px en sombre : l’accueil, ＋ Nouveau, l’éditeur et la corbeille ne débordent pas ; rien de collé', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await DO(() => { document.documentElement.dataset.theme = 'dark'; });
            try {
                const check = async (label, go, sel, arg) => {
                    await DO(go, arg); await p.waitForSelector(sel, {timeout: 20000}); await idle(600);
                    const o = await DO(() => { const w = document.getElementById('workspace'); const page = w.querySelector('[data-dgo-page]'); return {doc: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth, ws: w.scrollWidth - w.clientWidth, page: page ? Math.round(page.scrollWidth - page.clientWidth) : 0}; });
                    assert.ok(o.doc <= 1 && o.ws <= 1 && o.page <= 1, `${label} : déborde ${JSON.stringify(o)}`);
                    const bad = await p.evaluate(detect, {root: '#workspace [data-dgo-page]', min: 4});
                    assert.deepStrictEqual(bad.map(b => `${b.item} dans ${b.box} : ${b.bad.map(x => x.kind + x.side).join(',')}`), [], label);
                };
                await check('accueil', () => window.LCNDA_EXT.diagrammesOnglet.go({view: 'home', nav: 'all'}), '#workspace [data-dgo-page="home"] .dgo-card');
                await check('＋ Nouveau', () => window.LCNDA_EXT.diagrammesOnglet.go({view: 'new', door: 'gal'}), '#workspace .h-dg-inline .h-dg-tile');
                await check('l’éditeur', id => window.LCNDA_EXT.diagrammesOnglet.open(id), '#workspace .h-dg-inline .h-dg-pane', D2);
                await check('la corbeille', () => window.LCNDA_EXT.diagrammesOnglet.go({view: 'trash'}), '#workspace [data-dgo-page="trash"]');
                const bg = await DO(() => getComputedStyle(document.querySelector('#workspace .dgo-page h2')).color); assert.ok(!/rgb\(0, 0, 0\)|rgb\(8, 8, 8\)/.test(bg), 'le texte suit le mode sombre : ' + bg);
            } finally { await p.setViewportSize({width: 1440, height: 900}); await DO(() => { delete document.documentElement.dataset.theme; }); }
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
