#!/usr/bin/env node
/* ☑ Prendre plusieurs lignes d'un coup, dans toutes les listes de données (maquette validée docs/design/liste-choix-multiple.html).
 *   assets/js/app-listes-choix.js, branché par le moteur commun app-listes-donnees.js ; 📎 app-inserer.js (insertBlock) ; 🧺 heritage-connexions.js.
 *  une liste d'essai FABRIQUÉE (250 lignes, noms inventés MAZAUD, LACOMBE, DURAND, et une case « =… » piégée) :
 *  - une case au début de chaque ligne (au survol ; toujours au doigt), role=checkbox + aria-checked ; 📎 et 🧺 au bout de chaque ligne ;
 *  - la barre du bas seulement quand ≥ 1 cochée : « N choisis · 📎 Insérer… · 🧺 Mettre dans un panier… · ⤓ Exporter · ✕ » ;
 *  - Maj+clic (une suite), la case de l'en-tête (les lignes affichées, « à moitié »), « ☑ Tout cocher (250) » (même les lignes pas
 *    encore affichées ; un filtre nouveau l'oublie) ; clavier : Espace, Maj+Espace, Échap (le focus reste) ;
 *  - 🧺 : toutes les lignes en UNE écriture, un seul ↶ Annuler ; 🧺 d'une ligne ; 📎 : un bloc (chaque ligne avec sa source) à
 *    l'endroit du curseur, ↶ Annuler ; ⤓ CSV : les lignes cochées, une case « =… » reste du texte ;
 *  - mode consultation : 📎 et 🧺 éteints avec la raison, ⤓ reste ; « Prendre depuis… » (☑ Choisir des lignes) garde ses cases ;
 *  - 390 px en sombre, au doigt : cases visibles, la barre tient dans l'écran ; aucune erreur.
 * Base : tests/prendre-depuis-seed.js.   node tests/test-listes-choix-multiple.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    try {
        await p.evaluate(() => {
            const N = ['MAZAUD', 'LACOMBE', 'DURAND'], P = ['Jean', 'Marie', 'Pierre', 'Jeanne', 'Louis'];
            const rows = Array.from({length: 250}, (_, i) => ({id: i + 1, name: i === 7 ? '=HYPERLINK("http://x","clic") DURAND' : `${P[i % 5]} ${N[i % 3]} n° ${i + 1}`, year: 1800 + i, commune: ['Tulle', 'Treignac', 'Nice'][i % 3], lat: 45 + (i % 10) / 10, lon: 1.7}));
            window.LCNDA_EXT.dataLists.push({id: 'test_choix', icon: '🧪', label: 'Essai choix', group: 'Le lieu', theme: 'personnes', source: 'Jeu d’essai', sourceUrl: 'https://example.org/essai',
                load: async () => rows, fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'year', label: 'Année', type: 'year'}, {key: 'commune', label: 'Commune', type: 'enum'}],
                period: r => [r.year, r.year], geo: r => [r.lat, r.lon]});
        });
        await sleep(300);
        const openList = async () => { await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_test_choix'; A.setModule('listes'); }); await p.waitForSelector('[data-ld-page="test_choix"] .ld-table tbody tr[data-ld-row="99"]', {timeout: 30000}); };
        const ck = i => `.ld-table tbody tr[data-ld-row="${i}"] [data-ld-ck]`;
        const checked = () => p.$$eval('.ld-table tbody [data-ld-ck][aria-checked="true"]', a => a.map(b => Number(b.dataset.ldCk)));
        const barText = () => p.textContent('.ldc-bar [data-ldc-n]');
        const basketN = async () => { const b = await B.api('cx_basket', {}); return (b.items || []).length; };
        const clickUndo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(700); };

        await openList();
        await t('chaque ligne : une case (role=checkbox, aria-checked, au survol sur un ordinateur) au début, 📎 et 🧺 au bout ; pas de barre', async () => {
            const r = await p.$eval('.ld-table tbody tr[data-ld-row="0"]', tr => ({first: tr.firstElementChild.querySelector('[data-ld-ck]')?.getAttribute('role'), aria: tr.querySelector('[data-ld-ck]').getAttribute('aria-checked'),
                last: tr.lastElementChild.textContent.trim(), op: getComputedStyle(tr.querySelector('[data-ld-ck]')).opacity}));
            assert.deepStrictEqual(r, {first: 'checkbox', aria: 'false', last: '📎🧺', op: '0'});
            await p.hover('.ld-table tbody tr[data-ld-row="2"]'); await sleep(250);
            assert.strictEqual(await p.$eval(ck(2), b => getComputedStyle(b).opacity), '1', 'visible au survol');
            assert.ok(await p.isHidden('.ldc-bar'), 'rien de coché : pas de barre');
            assert.match(await p.textContent('[data-ldc-all]'), /Tout cocher \(250\)/);
        });
        await t('un clic coche, Maj+clic coche toute la suite ; la barre du bas : « N choisis · 📎 · 🧺 · ⤓ · ✕ » ; la case de l’en-tête « à moitié »', async () => {
            await p.click(ck(1)); assert.deepStrictEqual(await checked(), [1]); assert.strictEqual(await barText(), '1 ligne cochée');
            await p.click(ck(4), {modifiers: ['Shift']}); assert.deepStrictEqual(await checked(), [1, 2, 3, 4]); assert.strictEqual(await barText(), '4 lignes cochées');
            assert.match((await p.textContent('.ldc-bar')).replace(/\s+/g, ' '), /4 lignes cochées.*📎 Insérer….*🧺 Mettre dans un panier….*⤓ Exporter.*✕ Décocher/);
            assert.strictEqual(await p.getAttribute('[data-ld-ckall]', 'aria-checked'), 'mixed');
            assert.ok(await p.$eval('.ld-table tbody tr[data-ld-row="2"]', tr => tr.classList.contains('is-picked')));
            const box = await p.locator('.ldc-bar').boundingBox(), vw = await p.evaluate(() => innerWidth);
            assert.ok(box.x >= 8 && box.x + box.width <= vw - 8, 'la barre ne touche pas les bords');
            await p.click('[data-ldc-x]'); assert.deepStrictEqual(await checked(), []); assert.ok(await p.isHidden('.ldc-bar'));
        });
        await t('la case de l’en-tête : les 100 lignes affichées, puis plus rien ; les cases tiennent après un tri et « Voir les suivantes »', async () => {
            await p.click('[data-ld-ckall]'); assert.strictEqual((await checked()).length, 100); assert.strictEqual(await barText(), '100 lignes cochées');
            await p.click('[data-ld-ckall]'); assert.strictEqual((await checked()).length, 0);
            await p.click(ck(0)); await p.click(ck(5));
            await p.click('[data-ld-sort="year"]'); await p.waitForFunction(() => /↑/.test(document.querySelector('[data-ld-sort="year"]')?.textContent || ''));
            await p.click('[data-ld-sort="year"]'); await p.waitForFunction(() => /↓/.test(document.querySelector('[data-ld-sort="year"]')?.textContent || ''));
            assert.strictEqual(await barText(), '2 lignes cochées'); assert.deepStrictEqual(await checked(), [], 'les deux sont plus bas, après le tri ↓');
            await p.click('[data-ld-more]'); await p.click('[data-ld-more]'); await p.waitForSelector('.ld-table tbody tr[data-ld-row="249"]');
            assert.deepStrictEqual(await checked(), [244, 249]);
            await p.click('[data-ld-sort="year"]'); await p.waitForFunction(() => /↑/.test(document.querySelector('[data-ld-sort="year"]')?.textContent || ''));
            await p.click('[data-ldc-x]');
        });
        await t('clavier : Espace coche (le focus reste), Maj+Espace toute la suite, Échap décoche tout', async () => {
            await p.focus(ck(2)); await p.keyboard.press('Space'); assert.deepStrictEqual(await checked(), [2]);
            assert.strictEqual(await p.evaluate(() => document.activeElement?.dataset.ldCk), '2', 'le focus reste');
            await p.focus(ck(6)); await p.keyboard.press('Shift+Space'); assert.deepStrictEqual(await checked(), [2, 3, 4, 5, 6]);
            await p.keyboard.press('Escape'); assert.deepStrictEqual(await checked(), []); assert.ok(await p.isHidden('.ldc-bar'));
            assert.strictEqual(await p.evaluate(() => document.activeElement?.dataset.ldCk), '6', 'le focus reste après Échap');
        });
        await t('☑ Tout cocher (250) : même les lignes pas encore affichées ; une décochée → 249 ; un filtre nouveau l’oublie', async () => {
            await p.click('[data-ldc-all]'); assert.strictEqual(await barText(), '250 lignes cochées'); assert.strictEqual((await checked()).length, 100);
            await p.click(ck(3)); assert.strictEqual(await barText(), '249 lignes cochées');
            const n = await p.evaluate(async () => (await window.LCNDA_EXT.listesChoix.selectedRows()).length); assert.strictEqual(n, 249);
            await p.fill('[data-ld-q]', 'Tulle'); await p.waitForFunction(() => /84 lignes/.test(document.querySelector('[data-ld-count]')?.textContent || ''));
            assert.ok(await p.isHidden('.ldc-bar'), '« Tout cocher » oublié avec le filtre');
            await p.click('[data-ldc-all]'); assert.strictEqual(await barText(), '84 lignes cochées');
            await p.click('[data-ldc-x]'); await p.fill('[data-ld-q]', ''); await p.waitForFunction(() => /250 lignes/.test(document.querySelector('[data-ld-count]')?.textContent || ''));
        });
        await t('🧺 Mettre dans un panier… : les 3 lignes en UNE écriture, un seul ↶ Annuler ; 🧺 au bout d’une ligne : une seule', async () => {
            const before = await basketN();
            let writes = 0; const onReq = r => { if (/action=cx_write/.test(r.url()) && /basket_add/.test(r.postData() || '')) writes++; }; p.on('request', onReq);
            await p.click(ck(10)); await p.click(ck(11)); await p.click(ck(12));
            await p.click('[data-ldc-bk]'); if (await p.$('.ui-actmenu-i')) await p.click('.ui-actmenu-i >> nth=0');
            await p.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('🧺'), null, {timeout: 10000});
            assert.strictEqual(await basketN(), before + 3); assert.strictEqual(writes, 1, 'une seule écriture');
            const items = (await B.api('cx_basket', {})).items.slice(-3); assert.ok(items.every(it => /Essai choix/.test(JSON.stringify(it))), 'chaque ligne garde sa liste comme source : ' + JSON.stringify(items[0]).slice(0, 300));
            await clickUndo(); assert.strictEqual(await basketN(), before, 'un seul ↶ Annuler pour les 3');
            await p.click('[data-ldc-x]');
            await p.click('.ld-table tbody tr[data-ld-row="20"] [data-ld-bk]'); if (await p.$('.ui-actmenu-i')) await p.click('.ui-actmenu-i >> nth=0');
            await sleep(900);
            assert.strictEqual(await basketN(), before + 1); p.off('request', onReq);
            await clickUndo(); assert.strictEqual(await basketN(), before);
        });
        await t('📎 Insérer… : un bloc propre à l’endroit du curseur (chaque ligne avec sa source), ↶ Annuler ; « Mettre dans… » et « Copier » proposés', async () => {
            await p.evaluate(() => { const a = document.createElement('textarea'); a.id = 'essai-note'; a.style.cssText = 'position:fixed;left:20px;bottom:20px;width:300px;height:80px;z-index:5'; a.value = 'Note : '; document.body.appendChild(a); a.focus(); a.setSelectionRange(7, 7); });
            await p.click(ck(0)); await p.click(ck(1));
            await p.click('[data-ldc-ins]'); await p.waitForSelector('.ui-actmenu-i');
            const menu = await p.$$eval('.ui-actmenu-i', a => a.map(x => x.textContent));
            assert.ok(menu.some(x => /endroit du curseur/.test(x)) && menu.some(x => /Dans une note, une enquête/.test(x)) && menu.some(x => /Copier le texte/.test(x)), menu.join(' | '));
            await p.click('.ui-actmenu-i:has-text("endroit du curseur")'); await sleep(400);
            const v = await p.inputValue('#essai-note');
            assert.match(v, /^Note : 🧪 Essai choix — 2 lignes\n• Jean MAZAUD n° 1 — 1800 · Tulle \[↗ Essai choix — Jeu d’essai\]\n• Marie LACOMBE n° 2 — 1801 · Treignac \[↗ Essai choix — Jeu d’essai\]/, v);
            await clickUndo(); assert.strictEqual(await p.inputValue('#essai-note'), 'Note : ');
            await p.click('[data-ldc-x]');
            await p.click('.ld-table tbody tr[data-ld-row="2"] [data-ld-ins]'); await p.click('.ui-actmenu-i:has-text("endroit du curseur")'); await sleep(300);
            assert.match(await p.inputValue('#essai-note'), /Pierre DURAND n° 3 — 1802 · Nice \[↗ Essai choix — Jeu d’essai\]/);
            await p.evaluate(() => document.getElementById('essai-note').remove());
        });
        await t('⤓ Exporter : les lignes cochées en CSV ; une case « =… » reste du texte (pas une formule)', async () => {
            await p.click(ck(6)); await p.click(ck(7));
            await p.click('[data-ldc-exp]'); await p.waitForSelector('dialog.ui-export[open]'); // ⤓ la fenêtre d'export commune (CSV choisi d'office)
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('dialog.ui-export [data-ui-go]')]);
            const csv = fs.readFileSync(await dl.path(), 'utf8');
            const lines = csv.replace(/^﻿/, '').trim().split(/\r?\n/);
            assert.strictEqual(lines.length, 3, csv); assert.match(lines[0], /Nom;Année;Commune/); assert.match(lines[1], /Marie MAZAUD n° 7/);
            assert.match(lines[2], /^"?'=HYPERLINK/, 'la formule reste du texte : ' + lines[2]);
            await p.click('[data-ldc-x]');
        });
        await t('mode consultation : 📎 et 🧺 éteints (avec la raison), ⤓ reste', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk')); await openList();
            assert.ok(await p.$eval('.ld-table tbody tr[data-ld-row="0"] [data-ld-bk]', b => b.disabled && /consultation/.test(b.title)));
            await p.click(ck(0));
            assert.ok(await p.$eval('[data-ldc-ins]', b => b.disabled && /consultation/.test(b.title))); assert.ok(await p.$eval('[data-ldc-bk]', b => b.disabled));
            assert.ok(!(await p.$eval('[data-ldc-exp]', b => b.disabled)));
            await p.click('[data-ldc-x]'); await p.evaluate(() => document.body.classList.remove('is-kiosk')); await openList();
        });
        await t('une seule sorte de cases par liste : plus de « ☑ Choisir des lignes » à part (🧺 Prendre… prend les lignes cochées ici)', async () => {
            assert.strictEqual(await p.$('[data-ld-choose]'), null, 'plus de deuxième bouton pour cocher');
            assert.strictEqual(await p.$('.ld-table .cx-ldck'), null, 'pas de deuxième colonne de cases');
            if (!(await p.$('[data-ld-take]'))) return;
            await p.click(ck(0)); await p.click(ck(1)); assert.strictEqual(await barText(), '2 lignes cochées');
            await p.click('[data-ld-take]'); await p.waitForSelector('.ui-actmenu'); assert.match(await p.textContent('.ui-actmenu'), /Les 2 cochées/);
            await p.keyboard.press('Escape'); await p.click('[data-ldc-x]');
        });
        await t('390 px, en sombre, au doigt : les cases toujours visibles, la barre tient dans l’écran', async () => {
            const ctx = await B.browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
            const q = await ctx.newPage(); const errs = []; q.on('pageerror', e => errs.push(e.message));
            await q.goto(B.base); await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.dataListsEngine, null, {timeout: 60000});
            await q.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark');
                const rows = Array.from({length: 30}, (_, i) => ({name: `Louis DURAND n° ${i + 1}`, year: 1900 + i}));
                window.LCNDA_EXT.dataLists.push({id: 'test_choix_tel', icon: '🧪', label: 'Essai téléphone', group: 'Le lieu', load: async () => rows, fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'year', label: 'Année', type: 'year'}]}); });
            await sleep(300);
            await q.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_test_choix_tel'; A.setModule('listes'); });
            await q.waitForSelector('.ld-table tbody tr[data-ld-row="0"] [data-ld-ck]', {timeout: 30000});
            assert.strictEqual(await q.$eval('.ld-table tbody tr[data-ld-row="0"] [data-ld-ck]', b => getComputedStyle(b).opacity), '1', 'au doigt : toujours visible');
            await q.tap('.ld-table tbody tr[data-ld-row="0"] [data-ld-ck]'); await q.tap('.ld-table tbody tr[data-ld-row="1"] [data-ld-ck]');
            await q.waitForSelector('.ldc-bar:not([hidden])');
            const box = await q.locator('.ldc-bar').boundingBox();
            assert.ok(box.x >= 4 && box.x + box.width <= 386 && box.y + box.height <= 844, JSON.stringify(box));
            assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de défilement de côté');
            assert.deepStrictEqual(errs, []); await ctx.close();
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
