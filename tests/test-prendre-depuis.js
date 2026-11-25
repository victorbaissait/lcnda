#!/usr/bin/env node
/* 📥 « Prendre depuis… », en clair et aéré (maquette validée docs/design/prendre-depuis.html ; assets/js/heritage-connexions.js,
 * assets/css/connexions.css, lib/picker.php, lib/widget_links.php, lib/connexions.php cx_used). Base : tests/prendre-depuis-seed.js.
 * Ce qui est vérifié (une case par point de la maquette) : les lignes disent qui / quand / où ; les vignettes des médias ; une seule loupe ;
 * pas de champ vide en haut de Listes / Données ; le pied reste en bas quand la liste défile ; de l'air (marges) ; l'aperçu à droite ;
 * plusieurs cases = « N éléments choisis » (×) et « Ce que Prendre va faire » ; 1 cochée / 2 cochées ; une liste s'ouvre DANS la fenêtre,
 * les cases survivent à « ↗ Ouvrir la liste complète » puis « ← Revenir » ; le bandeau de la page Listes (sans guillemets dans les
 * guillemets, cases, pas de bouton en double) ; le groupe « À décrire » ; les rubriques en 3 groupes ; la poignée retenue ;
 * 390 px sans défilement de côté ; thème sombre ; aucune erreur.
 *   node tests/test-prendre-depuis.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await t.before?.(); await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    const D = '.cx-take';
    const open = async () => { await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await B.openInv(1); await p.keyboard.press('Control+Alt+O'); await p.waitForSelector(D); };
    const tab = async (k, q = null) => {
        await p.click(`${D} [data-cx-tab="${k}"]`);
        if (q != null) await p.fill(`${D} [data-cx-q]`, q);
        await p.waitForFunction(([k2, q2]) => (document.querySelector('.cx-take [data-cx-res]')?.dataset.cxShown || '').startsWith(`${k2}|${q2 ?? ''}|`), [k, q], {timeout: 15000});
    };
    const txt = s => p.textContent(s);
    try {
        await t('l’en-tête dit où ça va (« Ajouter à 🕵️ l’enquête « testenquête » ») et explique en une ligne ; rubriques en 3 groupes', async () => {
            await open();
            assert.match(await txt(`${D} h2`), /Ajouter à .*l’enquête « testenquête »/); assert.ok(!/Ici :/.test(await txt(`${D} h2`)));
            assert.match(await txt(`${D} .cx-tk-say`), /Clique une ligne/);
            assert.deepStrictEqual(await p.$$eval(`${D} .cx-rail h5`, a => a.map(x => x.textContent.trim())), ['Mis de côté', 'Dans ma base', 'Ailleurs']);
            assert.strictEqual(await p.locator(`${D} .cx-rail [data-cx-tab]`).count(), 12);
            assert.ok(await p.evaluate(() => { const r = document.querySelector('.cx-take').getBoundingClientRect(); return r.width >= 1200 * 0.98 && r.width <= 1200 && r.height <= 720; }), 'min(1200px, 94vw) × min(720px, 90vh)');
            assert.strictEqual(await p.evaluate(() => document.querySelector('.cx-take').scrollWidth <= document.querySelector('.cx-take').clientWidth + 1), true, 'pas de défilement de côté');
            assert.strictEqual(await p.locator(`${D} .modal-actions`).count(), 0, 'pas de pied « collant » ajouté');
        });
        await t('Événements : chaque ligne dit qui, quand, où et combien de sources ; une seule loupe ; la période « 1780-1800 » est comprise', async () => {
            await tab('event', 'Treignac 1780-1800');
            let rows = await p.$$eval(`${D} .cx-rlist li`, a => a.map(li => li.innerText.replace(/\s+/g, ' ')));
            assert.ok(rows.length >= 25 && rows.every(r => /Treignac/.test(r)), rows.length + ' lignes');
            await p.click(`${D} [data-cx-chip="n"]`); await p.waitForFunction(() => /\|n\|/.test(document.querySelector('.cx-take [data-cx-res]').dataset.cxShown));
            rows = await p.$$eval(`${D} .cx-rlist li`, a => a.map(li => li.innerText.replace(/\s+/g, ' ')));
            assert.strictEqual(rows.length, 25, rows.length + ' naissances');
            assert.ok(rows.every(r => /(MAZAUD|LACOMBE|DURAND)/.test(r) && /\b17[89]\d|1800\b/.test(r) && /Treignac/.test(r)), rows[0]);
            assert.ok(rows.some(r => /sources?|sans source/.test(r)), 'nombre de sources');
            assert.ok(!/🔍/.test(await p.getAttribute(`${D} [data-cx-q]`, 'placeholder')), 'pas de loupe dans le texte d’aide');
            assert.match(await p.evaluate(() => getComputedStyle(document.querySelector('.cx-take .cx-srch'), '::before').content), /🔍/);
            assert.strictEqual(await p.locator(`${D} input[type=search]:visible`).count(), 1);
        });
        await t('Médias : les vignettes sont affichées (et chargées) ; liste ou grille', async () => {
            await tab('media', '');
            await p.waitForFunction(() => [...document.querySelectorAll('.cx-take .cx-th img')].filter(i => i.complete && i.naturalWidth > 0).length >= 5, null, {timeout: 10000});
            await p.click(`${D} [data-cx-mview="grid"]`); await p.waitForSelector(`${D} .cx-mgrid`);
            await p.click(`${D} [data-cx-mview="list"]`);
        });
        await t('Listes et Données : pas de champ de recherche vide en haut (retiré, pas seulement « hidden » écrasé)', async () => {
            for (const k of ['lists', 'data', 'outside']) {
                await p.click(`${D} [data-cx-tab="${k}"]`); await sleep(400);
                assert.strictEqual(await p.evaluate(() => document.querySelector('.cx-take [data-cx-q]').getClientRects().length), 0, k);
            }
        });
        await t('le pied reste en bas quand la liste défile (seule la liste défile) ; de l’air autour de la recherche et de la liste', async () => {
            await tab('event', 'MAZAUD');
            const m = () => p.evaluate(() => { const d = document.querySelector('.cx-take'), f = d.querySelector('.cx-tk-foot').getBoundingClientRect(), r = d.querySelector('[data-cx-res]'), dr = d.getBoundingClientRect();
                return {fb: Math.round(dr.bottom - f.bottom), ft: Math.round(f.top), rb: Math.round(r.getBoundingClientRect().bottom), scroll: r.scrollHeight > r.clientHeight, dScroll: d.scrollTop + d.querySelector('form').scrollTop,
                    pad: parseFloat(getComputedStyle(d.querySelector('.cx-tools')).paddingLeft), rpad: parseFloat(getComputedStyle(r).paddingLeft) + parseFloat(getComputedStyle(r.querySelector('li')).paddingLeft)}; });
            const a = await m(); assert.ok(a.scroll, 'la liste est assez longue pour défiler');
            await p.evaluate(() => { const r = document.querySelector('.cx-take [data-cx-res]'); r.scrollTop = r.scrollHeight; }); await sleep(100);
            const b = await m();
            assert.ok(Math.abs(a.fb) <= 2 && Math.abs(b.fb) <= 2 && a.ft === b.ft, JSON.stringify([a, b]));
            assert.ok(b.rb <= b.ft + 1, 'le pied ne couvre pas la liste'); assert.strictEqual(b.dScroll, 0, 'la fenêtre elle-même ne défile pas');
            assert.ok(a.pad >= 16 && a.rpad >= 16, JSON.stringify(a));
        });
        await t('clic sur une ligne = l’aperçu à droite (tous les champs, ↗ ouvrir, « Déjà utilisé dans / Pas encore », une info seule) ; la case coche', async () => {
            const li = p.locator(`${D} .cx-rlist li`).first();
            await li.locator('.cx-rt').click();
            await p.waitForSelector(`${D} [data-cx-prev] .cx-dl`);
            const pv = await txt(`${D} [data-cx-prev]`);
            assert.match(pv, /Qui/); assert.match(pv, /Date/); assert.match(pv, /Lieu/); assert.match(pv, /ouvrir/); assert.match(pv, /Prendre seulement une info/); assert.match(pv, /Pas encore utilisé|Déjà utilisé dans/);
            assert.strictEqual(await li.locator('input[type=checkbox]').isChecked(), false, 'regarder ne coche pas');
            assert.match(await txt(`${D} [data-cx-n]`), /Rien de coché/);
        });
        await t('1 cochée / 2 cochées ; plusieurs cases → « 3 éléments choisis » avec × et « Ce que Prendre va faire » ; Espace et double-clic cochent', async () => {
            const lis = p.locator(`${D} .cx-rlist li`);
            await lis.nth(0).locator('input[type=checkbox]').check(); assert.match(await txt(`${D} [data-cx-n]`), /^1 cochée$/);
            await lis.nth(1).locator('.cx-rt').focus(); await p.keyboard.press('Space'); assert.match(await txt(`${D} [data-cx-n]`), /^2 cochées$/);
            await lis.nth(2).locator('.cx-rt').dblclick(); assert.match(await txt(`${D} [data-cx-n]`), /^3 cochées$/);
            assert.match(await txt(`${D} [data-cx-prev]`), /3 éléments choisis/); assert.match(await txt(`${D} .cx-will`), /Ce que « Prendre » va faire/);
            await p.locator(`${D} [data-cx-unpick]`).first().click();
            assert.match(await txt(`${D} [data-cx-prev]`), /2 éléments choisis/); assert.match(await txt(`${D} [data-cx-n]`), /^2 cochées$/);
            assert.match(await txt(`${D} .cx-tk-foot`), /Prendre = les ajouter à l’enquête « testenquête »/);
            assert.match(await txt(`${D} [data-cx-takehere]`), /Prendre \(2\)/);
        });
        await t('Actes : sorte, date, lieu, état ; les actes pas décrits à la fin, groupe « À décrire » avec « ✎ Décrire » ; pas de code interne', async () => {
            await tab('act', '');
            const groups = await p.$$eval(`${D} .cx-gh`, a => a.map(x => x.textContent));
            assert.ok(groups.some(g => /À décrire/.test(g)), groups.join('|'));
            const todo = await p.$$eval(`${D} .cx-row.is-todo`, a => a.map(x => x.innerText));
            assert.strictEqual(todo.length, 2); assert.ok(todo.some(x => /Acte sans titre \(importé le/.test(x))); assert.ok(todo.every(x => /Décrire/.test(x)));
            const last = await p.$$eval(`${D} .cx-row`, a => a.map(x => x.classList.contains('is-todo'))); assert.deepStrictEqual(last.slice(-2), [true, true], 'à la fin');
            const first = await txt(`${D} .cx-row:not(.is-todo)`); assert.match(first, /Relue|À faire|Transcrit/); assert.match(first, /\d{4}/);
            assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(await txt(`${D} [data-cx-res]`)));
        });
        await t('la poignée entre la liste et l’aperçu : ← au clavier l’élargit, la largeur est retenue (genealogie-cx-take-split)', async () => {
            const w0 = await p.evaluate(() => document.querySelector('.cx-take [data-cx-prev]').getBoundingClientRect().width);
            await p.focus(`${D} [data-cx-gut]`); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
            const w1 = await p.evaluate(() => document.querySelector('.cx-take [data-cx-prev]').getBoundingClientRect().width);
            assert.ok(w1 > w0 + 40, `${w0} → ${w1}`);
            assert.ok(Number(await p.evaluate(() => localStorage.getItem('genealogie-cx-take-split'))) > 300);
        });
        await t('Listes : une liste s’ouvre DANS la fenêtre (critères, lignes à cocher, ☑ Tout cocher, ▦ Prendre tout le tableau, ← Toutes les listes)', async () => {
            await tab('lists'); await p.click(`${D} [data-cx-list="ciel_cometes"]`);
            await p.waitForSelector(`${D} [data-cx-lrows] .cx-rlist li`, {timeout: 20000});
            assert.ok(await p.evaluate(() => !!document.querySelector('.cx-take[open]')), 'toujours dans la fenêtre');
            for (const s of ['[data-cx-lback]', '[data-cx-lall]', '[data-cx-lset]', '[data-cx-lfull]']) assert.ok(await p.locator(`${D} ${s}`).count(), s);
            await p.fill(`${D} [data-cx-lq]`, 'Donati'); await p.waitForFunction(() => document.querySelectorAll('.cx-take [data-cx-lrows] .cx-rlist li').length === 1, null, {timeout: 10000});
            await p.locator(`${D} [data-cx-lrows] .cx-rlist li`).first().locator('input').check();
            await p.fill(`${D} [data-cx-lq]`, 'Halley'); await p.waitForFunction(() => /Halley/i.test(document.querySelector('.cx-take [data-cx-lrows]')?.textContent || ''), null, {timeout: 10000});
            await p.locator(`${D} [data-cx-lrows] .cx-rlist li`).first().locator('input').check();
            assert.match(await txt(`${D} [data-cx-n]`), /4 cochées/); // 2 événements d'avant + 2 comètes
        });
        await t('« ↗ Ouvrir la liste complète » : la page Listes avec le bandeau « Tu choisis des lignes pour l’enquête testenquête », les cases gardées, pas de « 🧺 Prendre… » en double ; « ← Revenir » rouvre la fenêtre telle qu’on l’a laissée', async () => {
            await p.fill(`${D} [data-cx-lq]`, ''); await sleep(500);
            await p.click(`${D} [data-cx-lfull]`);
            await p.waitForSelector('.ld-page[data-ld-page="ciel_cometes"] .cx-ltake', {timeout: 20000});
            assert.strictEqual(await p.locator('dialog.cx-take[open]').count(), 0);
            const ban = await txt('.cx-ltake');
            assert.match(ban, /Tu choisis des lignes pour l’enquête testenquête/); assert.ok(!/[«»]/.test(ban.split('\n')[0]), 'pas de guillemets dans les guillemets : ' + ban);
            assert.ok(await p.locator('.ld-page [data-ld-take]').isHidden(), '« 🧺 Prendre… » caché pendant le bandeau');
            await p.waitForSelector('.ld-table .cx-ldck input');
            assert.strictEqual(await p.locator('.ld-table tbody .cx-ldck input:checked').count(), 2, 'les 2 comètes cochées dans la fenêtre le restent');
            assert.match(await txt('.cx-ltake [data-cx-ltake-sel]'), /Prendre les 2 cochées/); assert.match(await txt('.cx-ltake [data-cx-ltake]'), /Tout prendre \(\d+\)/);
            await p.locator('.ld-table tbody tr:not(.is-on) .cx-ldck input').first().check();
            assert.match(await txt('.cx-ltake [data-cx-ltake-sel]'), /Prendre les 3 cochées/);
            await p.click('.cx-ltake [data-cx-lback]');
            await p.waitForSelector(`${D}[open] [data-cx-lrows] .cx-rlist li`, {timeout: 20000});
            assert.match(await txt(`${D} [data-cx-n]`), /5 cochées/);
            assert.match(await txt(`${D} h2`), /testenquête/);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.module), 'enquetes', 'revenu sur l’enquête');
        });
        await t('vide : on dit pourquoi et quoi faire (recherche sans résultat)', async () => {
            await tab('person', 'Zzyzzx');
            assert.match(await txt(`${D} .cx-empty`), /Rien pour « Zzyzzx »/); assert.ok(await p.locator(`${D} [data-cx-empty="clear"]`).count());
        });
        await t('De l’extérieur : quatre cartes qui disent ce qu’on obtient', async () => {
            await tab('outside'); assert.strictEqual(await p.locator(`${D} .cx-card`).count(), 4); assert.match(await txt(`${D} .cx-cards`), /Ça donne/);
        });
        await t('Données en 3 étapes ; le bouton dit ce qu’il fait (pas « Voir ») ; les adresses deviennent « ↗ OpenStreetMap »', async () => {
            await tab('data'); await p.selectOption(`${D} [data-cx-ds]`, 'commune_plus_cemeteries');
            await p.waitForSelector(`${D} [data-cx-run]`);
            assert.match(await txt(`${D} [data-cx-run]`), /Chercher/); assert.ok(!/^\s*Voir\s*$/.test(await txt(`${D} [data-cx-run]`)));
            await p.fill(`${D} .pk[data-picker="place"] input:not([type=hidden])`, 'Treignac');
            await p.locator(`${D} .pk-list [role="option"], ${D} .pk-item`, {hasText: 'Treignac'}).first().click();
            await p.click(`${D} [data-cx-run]`);
            await p.waitForSelector(`${D} [data-cx-dres] li`, {timeout: 20000});
            const steps = await p.$$eval(`${D} .cx-step`, a => a.map(x => x.textContent)); assert.deepStrictEqual(steps.map(s => s[0]), ['1', '2', '3']);
            const res = await txt(`${D} [data-cx-dres]`);
            assert.ok(!/https?:\/\//.test(res), 'pas d’adresse brute : ' + res.slice(0, 200)); assert.match(res, /Cimetière de Treignac/);
            const row = (await p.$$eval(`${D} [data-cx-dres] li`, a => a.map(x => x.innerText)))[0];
            assert.ok((row.match(/Cimetière de Treignac/g) || []).length === 1, 'le titre une fois : ' + row);
            assert.match(await txt(`${D} [data-cx-prev]`), /OpenStreetMap/); assert.ok(!/https?:\/\//.test(await txt(`${D} [data-cx-prev]`)));
        });
        await t('thème sombre : la fenêtre est sombre et lisible', async () => {
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await sleep(100);
            const c = await p.evaluate(() => { const d = document.querySelector('.cx-take'); const bg = getComputedStyle(d).backgroundColor, fg = getComputedStyle(d.querySelector('h2')).color; return {bg, fg}; });
            const lum = s => { const [r, g, b] = s.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
            assert.ok(lum(c.bg) < 60 && lum(c.fg) > 180, JSON.stringify(c));
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
        });
        await t('390 px : « Quoi : … ▾ » à la place de la colonne, l’aperçu monte en feuille, « Prendre » en premier, pas de défilement de côté', async () => {
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p.setViewportSize({width: 390, height: 800}); await sleep(300);
            await open();
            const w = await p.evaluate(() => ({sw: document.documentElement.scrollWidth, r: document.querySelector('.cx-take').getBoundingClientRect().right, dsw: document.querySelector('.cx-take').scrollWidth}));
            assert.ok(w.sw <= 390 && w.r <= 390 && w.dsw <= 390, JSON.stringify(w));
            assert.ok(await p.locator(`${D} [data-cx-quoi]`).isVisible()); assert.ok(await p.locator(`${D} .cx-rail`).isHidden());
            await p.click(`${D} [data-cx-quoi]`); assert.ok(await p.locator(`${D} .cx-rail`).isVisible());
            await p.click(`${D} [data-cx-tab="event"]`); assert.ok(await p.locator(`${D} .cx-rail`).isHidden());
            await p.waitForSelector(`${D} .cx-rlist li`); assert.match(await txt(`${D} [data-cx-quoi]`), /Événements/);
            await p.locator(`${D} .cx-rlist li .cx-rt`).first().click();
            assert.ok(await p.locator(`${D} [data-cx-prev]`).isVisible(), 'la feuille monte'); await p.click(`${D} [data-cx-sheetx]`);
            assert.ok(await p.locator(`${D} [data-cx-prev]`).isHidden());
            const order = await p.evaluate(() => { const a = document.querySelector('.cx-take [data-cx-takehere]').getBoundingClientRect(), b = document.querySelector('.cx-take [data-cx-tobasket]').getBoundingClientRect(); return a.top < b.top; });
            assert.ok(order, 'Prendre au-dessus');
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390));
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
