#!/usr/bin/env node
/* 📎 « Insérer une info » à l'endroit du curseur (assets/js/app-inserer.js ; serveur : GET cx_search, lib/connexions.php).
 * Base : tests/prendre-depuis-seed.js. La gare de Vulaines-sur-Seine - Samoreau vient du pack « Histoire du lieu » s'il est là, sinon d'une ligne FABRIQUÉE.
 *  4 champs différents : la conclusion d'une piste d'enquête (la source va dans les pièces de la piste), une note sur une fiche (classement :
 *  ses événements d'abord), un champ d'une fenêtre quelconque (« [↗ source] » dans le texte), un texte riche (contenteditable : un lien) ;
 *  « /gare vulaines » + Entrée = 1 geste après la frappe ; parcourir : une LISTE (→, chercher dedans, ←), une CATÉGORIE (Le lieu, Ma base › Actes) ;
 *  un ENSEMBLE (cocher 2 lignes, en liste à puces) ; ↶ Annuler ; ⌥⌘K ; « 🔍 Chercher partout » dans « Prendre depuis… » ; de l'air ; 390 px ; aucune erreur.
 *   node tests/test-inserer.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await t.before?.(); await fn(); console.log('✓ ' + name); } catch (e) { fails++; if (process.env.PD_SHOT && t.page) await t.page.screenshot({path: `${process.env.PD_SHOT}/qi-${name.split(' ')[0]}.png`}).catch(() => {}); console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page; t.page = p;
    const ROW = {name: 'Vulaines-sur-Seine - Samoreau', year: 1897, code: '77533', source: 'Wikidata', lat: 48.43055, lon: 2.75302};
    if (!B.hasPack) { // une ligne FABRIQUÉE (pas de pack « Histoire du lieu » ici)
        await B.ctx.route(/api\.php\?action=ld_status/, r => r.fulfill({contentType: 'application/json', body: JSON.stringify({installed: {hist_gares: true}})}));
        await B.ctx.route(/api\.php\?action=ld_query/, r => { const u = new URL(r.request().url()); let q = {}; try { q = JSON.parse(u.searchParams.get('query') || '{}'); } catch (_) {} const ok = !q.q || /vulaines|samoreau/i.test(q.q); r.fulfill({contentType: 'application/json', body: JSON.stringify({rows: ok ? [ROW] : [], total: ok ? 1 : 0})}); });
        await B.ctx.route(/api\.php\?action=cx_search/, async r => { const res = await r.fetch(); const j = await res.json(); const q = new URL(r.request().url()).searchParams.get('q') || ''; if (/vulaines/i.test(q)) j.lists = [{src: 'hist_gares', rows: [ROW]}, ...(j.lists || [])]; r.fulfill({response: res, body: JSON.stringify(j)}); });
        await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.insertInfo && window.LCNDA_EXT?.dataListsEngine, null, {timeout: 60000});
    }
    const QI = '.cx-qi';
    const typeSlash = async (sel, q) => { await p.focus(sel); await p.keyboard.type('/'); await p.waitForSelector(QI); await p.keyboard.type(q); await p.waitForFunction(x => [...document.querySelectorAll('.cx-qi .cx-qi-r')].some(r => r.textContent.includes(x)), 'Vulaines', {timeout: 15000}); };
    const closeAll = () => p.evaluate(() => { window.LCNDA_EXT.insertInfo.close(); document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
    const clickUndo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(600); };
    try {
        await t('1 · la conclusion d’une piste : « /gare vulaines » + Entrée → « … — ouverture : 1897 [↗ …] » au curseur ; la source dans les pièces de la piste ; ↶', async () => {
            await B.openInv(1); await p.click('[data-edit-investigation-item="1"]'); await p.waitForSelector('#investigation-item-dialog[open] textarea[name="notes"]');
            await p.fill('#investigation-item-dialog textarea[name="notes"]', 'Le registre dit :\n'); await p.focus('#investigation-item-dialog textarea[name="notes"]');
            await p.evaluate(() => { const ta = document.querySelector('#investigation-item-dialog textarea[name="notes"]'); ta.setSelectionRange(ta.value.length, ta.value.length); });
            let keys = 0; await typeSlash('#investigation-item-dialog textarea[name="notes"]', 'gare vulaines');
            const first = await p.textContent(`${QI} .cx-qi-r.is-on`); assert.match(first, /Vulaines-sur-Seine - Samoreau/); assert.match(first, /« Ouverture » seulement/);
            await p.keyboard.press('Enter'); keys++;
            const v = await p.inputValue('#investigation-item-dialog textarea[name="notes"]');
            assert.match(v, /^Le registre dit :\nGare Vulaines-sur-Seine - Samoreau — ouverture : 1897 \[↗ /); assert.ok(!/\/gare/.test(v), 'le « / » et la recherche sont partis');
            await sleep(1200);
            const links = (await B.api('investigation', {id: 1})).items.find(i => i.id === 1).links || [];
            assert.ok(links.some(l => /Vulaines/.test(l.label) && /Ouverture : 1897/.test(l.value) && /Gares/.test(l.origin?.label || '')), JSON.stringify(links).slice(0, 300));
            assert.strictEqual(keys, 1, '« / » + la recherche + Entrée');
            await clickUndo(); assert.strictEqual(await p.inputValue('#investigation-item-dialog textarea[name="notes"]'), 'Le registre dit :\n');
            assert.ok(!((await B.api('investigation', {id: 1})).items.find(i => i.id === 1).links || []).some(l => /Vulaines/.test(l.label)));
        });
        await t('2 · une note sur une fiche : ses événements d’abord ; ← → choisissent quoi insérer (la date seule)', async () => {
            await closeAll(); await B.go('personnes', {currentPersonId: 1}); await p.waitForSelector('[data-add-note-inline]', {timeout: 20000}); await p.click('[data-add-note-inline]');
            await p.waitForSelector('#note-dialog[open] textarea[name="body"]'); await p.focus('#note-dialog textarea[name="body"]');
            const pid = Number(await p.evaluate(() => document.querySelector('#note-form').elements.person_id.value)); const pr = (await B.api('person', {id: pid})).person, who = `${pr.first_name} ${pr.last_name}`;
            await p.keyboard.type('/'); await p.waitForSelector(QI); await p.keyboard.type('Naissance');
            await p.waitForFunction(x => (document.querySelector('.cx-qi .cx-qi-r.is-on')?.textContent || '').includes(x), who, {timeout: 15000}); // la personne de la fiche d'abord
            const chips = await p.$$eval(`${QI} .cx-qi-r.is-on .cx-qi-ch button`, a => a.map(x => x.textContent));
            const k = chips.findIndex(x => /Date/.test(x)); assert.ok(k >= 0, chips.join('|')); for (let i = 0; i < k; i++) await p.keyboard.press('ArrowRight');
            await p.keyboard.press('Enter');
            assert.match(await p.inputValue('#note-dialog textarea[name="body"]'), /— date : \d+ \S+ \d{4}|— date : \d{4}/);
        });
        await t('3 · un champ d’une fenêtre quelconque (Tâche, rappel…) : 📎 sur le champ, parcourir une LISTE (→ « Gares », chercher, ←) et une CATÉGORIE (Ma base › Actes)', async () => {
            await closeAll();
            await p.evaluate(() => window.LCNDA_EXT.openDialog({title: 'Essai', body: '<label>Texte<textarea name="t" rows="6" style="width:100%"></textarea></label>', submitLabel: 'OK', onSubmit: () => true}));
            await p.waitForSelector('dialog[open] textarea[name="t"]'); await p.focus('dialog[open] textarea[name="t"]'); await p.waitForSelector('.cx-qi-btn'); await p.click('.cx-qi-btn');
            await p.waitForSelector(QI); await p.waitForFunction(() => /Parcourir/i.test(document.querySelector('.cx-qi')?.textContent || ''));
            await p.keyboard.type('gares'); await p.waitForFunction(() => [...document.querySelectorAll('.cx-qi .cx-qi-r')].some(r => /Liste : Gares/.test(r.textContent)), null, {timeout: 15000});
            const idx = await p.$$eval(`${QI} .cx-qi-r`, a => a.findIndex(r => /Liste : Gares/.test(r.textContent)));
            await p.evaluate(i => { const r = document.querySelectorAll('.cx-qi .cx-qi-r')[i]; r.click(); }, idx);
            await p.waitForFunction(() => /🚂 Gares/.test(document.querySelector('.cx-qi [data-qi-crumb]')?.textContent || ''));
            await p.keyboard.type('vulaines'); await p.waitForFunction(() => [...document.querySelectorAll('.cx-qi .cx-qi-r')].some(r => /Samoreau/.test(r.textContent)), null, {timeout: 15000});
            await p.keyboard.press('Backspace'); for (let i = 0; i < 8; i++) await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace');
            await p.waitForFunction(() => !/Gares/.test(document.querySelector('.cx-qi [data-qi-crumb]')?.textContent || ''), null, {timeout: 5000});
            await p.fill(`${QI} [data-qi-q]`, ''); await p.waitForFunction(() => [...document.querySelectorAll('.cx-qi .cx-qi-r')].some(r => /Ma base/.test(r.textContent)), null, {timeout: 15000});
            const ma = await p.$$eval(`${QI} .cx-qi-r`, a => a.findIndex(r => /Ma base/.test(r.textContent))); await p.evaluate(i => document.querySelectorAll('.cx-qi .cx-qi-r')[i].click(), ma);
            await p.waitForFunction(() => /Ma base/.test(document.querySelector('.cx-qi [data-qi-crumb]')?.textContent || '') && [...document.querySelectorAll('.cx-qi .cx-qi-r')].some(r => /Actes/.test(r.textContent)), null, {timeout: 15000});
            const ac = await p.$$eval(`${QI} .cx-qi-r`, a => a.findIndex(r => /Actes/.test(r.textContent))); await p.evaluate(i => document.querySelectorAll('.cx-qi .cx-qi-r')[i].click(), ac);
            await p.waitForFunction(() => [...document.querySelectorAll('.cx-qi .cx-qi-r')].some(r => /Acte de baptême · Jean MAZAUD/.test(r.textContent)), null, {timeout: 15000});
            assert.match(await p.textContent(`${QI} [data-qi-crumb]`), /Ma base › 📜 Actes/);
            const r = await p.$$eval(`${QI} .cx-qi-r`, a => a.findIndex(x => /Acte de baptême · Jean MAZAUD/.test(x.textContent))); for (let i = 0; i < r; i++) await p.keyboard.press('ArrowDown');
            await p.keyboard.press('Enter');
            assert.match(await p.inputValue('dialog[open] textarea[name="t"]'), /12 mars 1785/); assert.match(await p.inputValue('dialog[open] textarea[name="t"]'), /\[↗ /);
        });
        await t('4 · un texte riche (contenteditable) : un ENSEMBLE — 2 lignes cochées dans une liste, en liste à puces, avec une ligne de source', async () => {
            await closeAll();
            await p.evaluate(() => { const d = document.createElement('div'); d.id = 'cx-qi-rich'; d.contentEditable = 'true'; d.style.cssText = 'position:fixed;top:120px;left:120px;width:600px;height:200px;border:1px solid #888;padding:12px;background:#fff;z-index:5'; d.innerHTML = '<p>Les comètes de l’époque :</p><p><br></p>'; document.body.appendChild(d); const r = document.createRange(); r.setStart(d.lastChild, 0); r.collapse(true); d.focus(); getSelection().removeAllRanges(); getSelection().addRange(r); });
            await p.keyboard.type('/'); await p.waitForSelector(QI); await p.keyboard.type('comètes');
            await p.waitForFunction(() => [...document.querySelectorAll('.cx-qi .cx-qi-r')].some(r => /Liste : Grandes comètes/.test(r.textContent)), null, {timeout: 15000});
            const idx = await p.$$eval(`${QI} .cx-qi-r`, a => a.findIndex(r => /Liste : Grandes comètes/.test(r.textContent))); await p.evaluate(i => document.querySelectorAll('.cx-qi .cx-qi-r')[i].click(), idx);
            await p.waitForFunction(() => document.querySelectorAll('.cx-qi .cx-qi-r .cx-qi-tk').length > 3, null, {timeout: 15000});
            await p.evaluate(() => { const rows = [...document.querySelectorAll('.cx-qi .cx-qi-r')].filter(r => r.querySelector('.cx-qi-tk')); rows[0].querySelector('[data-qi-tick]').click(); });
            await p.waitForFunction(() => [...document.querySelectorAll('.cx-qi .cx-qi-r')].filter(r => r.querySelector('.cx-qi-tk')).length > 3);
            await p.evaluate(() => { const rows = [...document.querySelectorAll('.cx-qi .cx-qi-r')].filter(r => r.querySelector('.cx-qi-tk')); rows[1].querySelector('[data-qi-tick]').click(); });
            await p.waitForFunction(() => /Les 2 lignes cochées/.test(document.querySelector('.cx-qi')?.textContent || ''));
            const k = await p.$$eval(`${QI} .cx-qi-r`, a => a.findIndex(r => /Les 2 lignes cochées/.test(r.textContent))); await p.evaluate(i => document.querySelectorAll('.cx-qi .cx-qi-r')[i].click(), k);
            await p.waitForFunction(() => document.querySelectorAll('#cx-qi-rich li').length === 2, null, {timeout: 10000});
            assert.match(await p.textContent('#cx-qi-rich'), /Source : Wikipédia/);
            await clickUndo(); assert.strictEqual(await p.locator('#cx-qi-rich li').count(), 0);
            await p.evaluate(() => document.getElementById('cx-qi-rich').remove());
        });
        await t('⌥⌘K (Ctrl+Alt+K) ouvre la fenêtre au curseur ; Échap la ferme et rend le curseur ; un ensemble demandé en français est proposé', async () => {
            await closeAll(); await p.evaluate(() => window.LCNDA_EXT.openDialog({title: 'Essai', body: '<textarea name="t" rows="4"></textarea>', submitLabel: 'OK', onSubmit: () => true}));
            await p.focus('dialog[open] textarea[name="t"]'); await p.keyboard.press('Control+Alt+K'); await p.waitForSelector(QI);
            await p.keyboard.type('les comètes de 1858 à 1860'); await p.waitForFunction(() => /L’ensemble : Grandes comètes/.test(document.querySelector('.cx-qi')?.textContent || ''), null, {timeout: 15000});
            await p.keyboard.press('Escape'); assert.strictEqual(await p.locator(QI).count(), 0); assert.ok(await p.evaluate(() => document.activeElement?.name === 't'));
        });
        await t('« 🔍 Chercher partout » dans « Prendre depuis… » : une info choisie est cochée', async () => {
            await closeAll(); await B.openInv(1); await p.evaluate(() => window.LCNDA_EXT.connexions.openTake({tab: 'event'})); await p.waitForSelector('.cx-take [data-cx-everywhere]');
            await p.click('.cx-take [data-cx-everywhere]'); await p.waitForSelector(QI); await p.keyboard.type('gare vulaines');
            await p.waitForFunction(() => /Samoreau/.test(document.querySelector('.cx-qi .cx-qi-r.is-on')?.textContent || ''), null, {timeout: 15000}); await p.keyboard.press('Enter');
            await p.waitForFunction(() => /1 cochée/.test(document.querySelector('.cx-take [data-cx-n]')?.textContent || ''));
        });
        await t('de l’air : rien de collé aux bords de la petite fenêtre ; 390 px : elle tient dans l’écran', async () => {
            await closeAll(); await p.evaluate(() => window.LCNDA_EXT.openDialog({title: 'Essai', body: '<textarea name="t" rows="4"></textarea>', submitLabel: 'OK', onSubmit: () => true}));
            await p.focus('dialog[open] textarea[name="t"]'); await p.keyboard.type('/'); await p.waitForSelector(QI); await p.keyboard.type('MAZAUD'); await sleep(900);
            const bad = await p.evaluate(() => { const b = document.querySelector('.cx-qi'), r = b.getBoundingClientRect(); return [...b.querySelectorAll('input, button, .cx-qi-r, .cx-qi-g')].filter(e => e.getClientRects().length).filter(e => { const q = e.getBoundingClientRect(); return q.left - r.left < 12 || r.right - q.right < 12; }).map(e => e.outerHTML.slice(0, 80)); });
            assert.deepStrictEqual(bad, []);
            await p.keyboard.press('Escape'); await p.setViewportSize({width: 390, height: 800}); await sleep(200);
            await p.fill('dialog[open] textarea[name="t"]', ''); await p.focus('dialog[open] textarea[name="t"]'); await p.keyboard.type('/'); await p.waitForSelector(QI);
            assert.ok(await p.evaluate(() => { const r = document.querySelector('.cx-qi').getBoundingClientRect(); return r.left >= 0 && r.right <= 390 && document.documentElement.scrollWidth <= 390; }));
            await p.keyboard.press('Escape'); await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
