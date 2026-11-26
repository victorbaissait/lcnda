#!/usr/bin/env node
/* 📌 Rattacher des choses de l'app à une piste, et « 📥 Prendre depuis… » pour chaque sous-partie (heritage-connexions.js : pisteAttach,
 * pisteDest, folderDest, « Où ranger : » ; app.js : la fenêtre d'une piste ; app-enquetes.js : 📥 dans un dossier ; lib/connexions.php : inv_receive folder_id).
 *  1. la fenêtre d'une piste : « 📌 Rattaché à cette piste » juste au-dessus de « Personnes liées » ; « 📥 Prendre depuis… » vise CETTE piste
 *     (« Ajouter à 📌 la piste « … » ») ; une fiche prise apparaît dans la fenêtre et sur la ligne de la piste ; ✕ puis ↶ Annuler ;
 *     « 🧺 Depuis le panier » ouvre la rubrique Panier ;
 *  2. Prendre depuis… ouvert sur l'enquête : « Où ranger : » (l'enquête entière, 📌 pistes, 📁 dossiers) change la cible ;
 *  3. un dossier de l'enquête : 📥 Prendre depuis… y range un média (déjà choisi dans « Où ranger : ») ; ↶ remet tout comme avant ;
 *  4. un dossier d'un projet de l'Atelier : « Où ranger : » part de ce dossier, le titre le dit, l'élément y arrive ;
 *  5. le serveur refuse un dossier d'une autre enquête ; 390 px sombre : la section ne déborde pas ; aucune erreur.
 * Base : tests/prendre-depuis-seed.js.   node tests/test-piste-rattacher.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    const post = (x, body) => p.evaluate(([y, b]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: b}).then(r => r?.result ?? r).catch(e => ({error: e.message})), [x, body]);
    const inv = async () => B.api('investigation', {id: 1});
    const clickUndo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(700); };
    const pick = async (tab, q, text) => { await p.click(`.cx-take [data-cx-tab="${tab}"]`); await p.fill('.cx-take [data-cx-q]', q);
        await p.waitForFunction(x => [...document.querySelectorAll('.cx-take .cx-rlist li')].some(li => li.textContent.includes(x)), text, {timeout: 15000});
        await p.locator('.cx-take .cx-rlist li', {hasText: text}).first().locator('input[type=checkbox]').check(); };
    try {
        let piste = 0;
        await t('la fenêtre d’une piste : « 📌 Rattaché à cette piste » au-dessus de « Personnes liées » ; Prendre depuis… vise CETTE piste', async () => {
            await B.openInv(1);
            const d = await inv(); piste = Number(d.items[0].id);
            await p.click(`[data-edit-investigation-item="${piste}"]`); await p.waitForSelector('#investigation-item-dialog[open] [data-cx-patt]');
            const order = await p.evaluate(() => { const s = document.querySelector('[data-cx-patt]'); return s.nextElementSibling?.classList.contains('pk-host'); });
            assert.ok(order, 'juste au-dessus de Personnes liées');
            assert.match(await p.textContent('[data-cx-patt] .cx-patt-h'), /Rattaché à cette piste/);
            await p.click('[data-cx-patt-take]'); await p.waitForSelector('.cx-take');
            assert.match(await p.textContent('.cx-take #cx-take-h'), /Ajouter à 📌 la piste « /);
            await pick('person', 'DURAND', 'DURAND');
            await p.click('.cx-take [data-cx-takehere]');
            await p.waitForFunction(() => /DURAND/.test(document.querySelector('[data-cx-patt]')?.textContent || ''), null, {timeout: 15000});
            const d2 = await inv(); assert.ok(d2.items.find(x => Number(x.id) === piste).links.some(l => /DURAND/.test(l.label)), 'rattaché dans la base');
        });
        await t('✕ retire de la piste, ↶ Annuler le remet ; « 🧺 Depuis le panier » ouvre le panier', async () => {
            await p.click('[data-cx-patt] [data-cx-link-x]');
            await p.waitForFunction(() => !/DURAND/.test(document.querySelector('[data-cx-patt]')?.textContent || ''), null, {timeout: 10000});
            await clickUndo();
            await p.waitForFunction(() => /DURAND/.test(document.querySelector('[data-cx-patt]')?.textContent || ''), null, {timeout: 10000});
            await p.click('[data-cx-patt-basket]'); await p.waitForSelector('.cx-take');
            assert.strictEqual(await p.getAttribute('.cx-take [data-cx-tab="basket"]', 'aria-selected'), 'true');
            await p.evaluate(() => document.querySelector('dialog.cx-take')?.close()); await sleep(200);
            await p.evaluate(() => document.querySelector('#investigation-item-dialog')?.close());
        });
        await t('Prendre depuis… sur l’enquête : « Où ranger : » (enquête entière, 📌 pistes, 📁 dossiers) change la cible', async () => {
            await B.openInv(1); await sleep(300);
            await p.evaluate(() => window.LCNDA_EXT.connexions.openTake()); await p.waitForSelector('.cx-take [data-cx-where]', {timeout: 15000});
            const opts = await p.$$eval('.cx-take [data-cx-where] option', a => a.map(o => o.value + '|' + o.textContent));
            assert.ok(opts[0].startsWith('all|'), opts.join(',')); assert.ok(opts.some(o => o.startsWith('i' + piste + '|📌')));
            await p.selectOption('.cx-take [data-cx-where]', 'i' + piste);
            assert.match(await p.textContent('.cx-take .cx-destpill'), /📌 la piste/);
            await pick('place', 'Tulle', 'Tulle');
            await p.click('.cx-take [data-cx-takehere]');
            await p.waitForFunction(async pid => { const d = await window.LCNDA_APP.api('investigation', {id: 1}); return d.items.find(x => Number(x.id) === pid)?.links?.some(l => /Tulle/.test(l.label)); }, piste, {timeout: 15000});
        });
        await t('un dossier de l’enquête : 📥 Prendre depuis… y range un média ; ↶ remet comme avant ; un dossier d’une autre enquête est refusé', async () => {
            const f = await post('save_investigation_folder', {investigation_id: 1, name: 'Registres'}).catch(() => null);
            let fid = Number(f?.id || 0);
            if (!fid) { const d = await inv(); fid = Number((d.folders || [])[0]?.id || 0); }
            assert.ok(fid, 'un dossier : ' + JSON.stringify(f));
            const media = ((await B.api('list', {type: 'media', limit: 5})).rows || [])[0]; assert.ok(media, 'un média dans la base d’essai');
            await B.go('enquetes', {enquetesTab: 'enquetes', currentInvestigationId: 1, investigationFolderId: fid}); await p.waitForSelector('#take-into-folder', {timeout: 15000});
            await p.click('#take-into-folder'); await p.waitForSelector('.cx-take [data-cx-where]', {timeout: 15000});
            assert.strictEqual(await p.$eval('.cx-take [data-cx-where]', s => s.value), 'f' + fid, 'le dossier déjà choisi');
            assert.match(await p.textContent('.cx-take .cx-destpill'), /📁 Registres/);
            await pick('media', String(media.title || media.filename).slice(0, 12), String(media.title || media.filename).slice(0, 12));
            await p.click('.cx-take [data-cx-takehere]');
            const inFolder = () => p.evaluate(async ([m, f2]) => (await window.LCNDA_APP.api('investigation', {id: 1})).media.some(x => Number(x.id) === m && Number(x.folder_id) === f2), [Number(media.id), fid]);
            for (let i = 0; i < 30 && !(await inFolder()); i++) await sleep(300);
            assert.ok(await inFolder(), 'le média est dans le dossier');
            await clickUndo();
            assert.ok(!(await inFolder()), '↶ : plus dans le dossier');
            // un dossier d'une autre enquête : refusé
            const other = await post('save_investigation', {person_id: 1, title: 'Autre enquête'}).catch(() => null);
            const r = await post('inv_receive', {investigation_id: Number(other?.id || 999), folder_id: fid, items: [{kind: 'text', title: 'x', value: 'x'}]});
            assert.ok(r?.error, 'refusé : ' + JSON.stringify(r));
        });
        await t('un dossier d’un projet de l’Atelier : « Où ranger : » part de ce dossier, le titre le dit ; l’élément y arrive', async () => {
            const pid = Number((await post('save_atelier_project', {title: 'Le livre de la famille', kind: 'livre'})).id);
            const proj = await B.api('atelier_project', {id: pid});
            let fo = (proj.folders || [])[0];
            if (!fo) { const r = await post('save_atelier_folder', {project_id: pid, name: 'Introduction'}); fo = {id: r.id, name: 'Introduction'}; }
            await B.go('enquetes', {enquetesTab: 'atelier', currentInvestigationId: 0, atelier: {project: pid, node: Number(fo.id), sel: []}}); await p.waitForSelector('[data-at-addmenu]', {timeout: 20000});
            await p.click('[data-at-addmenu]'); await p.click('.h-at-menu [data-at-take]'); await p.waitForSelector('.cx-take [data-cx-where]', {timeout: 15000});
            assert.strictEqual(await p.$eval('.cx-take [data-cx-where]', s => s.value), 'f' + fo.id);
            assert.match(await p.textContent('.cx-take .cx-destpill'), new RegExp(`📁 ${fo.name}`));
            await pick('place', 'Tulle', 'Tulle'); await p.click('.cx-take [data-cx-takehere]');
            const there = () => p.evaluate(async ([x, f]) => { const d = await window.LCNDA_APP.api('atelier_project', {id: x}); return d.items.some(i => /Tulle/.test(i.title) && (i.folders || []).map(Number).includes(f)); }, [pid, Number(fo.id)]);
            for (let i = 0; i < 30 && !(await there()); i++) await sleep(300);
            assert.ok(await there(), 'dans le dossier');
        });
        await t('390 px en sombre : la section de la piste ne déborde pas', async () => {
            await p.setViewportSize({width: 390, height: 844}); await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            await B.openInv(1); await p.click(`[data-edit-investigation-item="${piste}"]`); await p.waitForSelector('#investigation-item-dialog[open] [data-cx-patt]');
            const r = await p.evaluate(() => { const b = document.querySelector('[data-cx-patt]').getBoundingClientRect(), vw = document.documentElement.clientWidth; return {l: b.left, r: vw - b.right, over: [...document.querySelectorAll('[data-cx-patt] *')].some(e => e.getBoundingClientRect().right > vw)}; });
            assert.ok(r.l >= 8 && r.r >= 8 && !r.over, JSON.stringify(r));
            await p.evaluate(() => document.querySelector('#investigation-item-dialog')?.close());
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
