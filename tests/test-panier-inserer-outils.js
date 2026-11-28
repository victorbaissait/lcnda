#!/usr/bin/env node
/* 🧺 le panier et 📎 « Insérer une info » DANS LES OUTILS (assets/js/heritage-connexions-outils.js, assets/js/app-inserer.js ; audit : docs/audit-panier-inserer.md).
 * Base : tests/prendre-depuis-seed.js (MAZAUD / LACOMBE / DURAND, inventés). Pour chaque outil changé :
 *   📝 Traitement de texte · 🎞️ Présentation · 🧾 Tableur · ✒️ Dessin vectoriel · 🌐 Mon site web · 📊 Diagrammes (📎 seulement) · 📖 Livre de famille
 *  — le groupe 📎 · 📥 dans sa barre ; « Ici : … » (Prendre depuis… / Vider le panier ici) quand sa fenêtre est devant ; 🧺 « Depuis le panier » arrive
 *    à sa façon AVEC SA SOURCE (note de bas de page, notes de la diapositive, colonne Source, étiquette, ligne « Source : », Mot de la fin) ; ↶ Annuler ;
 *    📎 dans ses textes (la source à sa façon) ; « 🧺 Prendre la sélection » ; mode consultation : rien n'est ajouté, pas de boutons ; 390 px ; aucune erreur.
 *   node tests/test-panier-inserer-outils.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; if (process.env.PD_SHOT && t.page) await t.page.screenshot({path: `${process.env.PD_SHOT}/po-${name.split(' ')[0]}.png`}).catch(() => {}); console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page; t.page = p;
    const ITEM = {kind: 'datum', ref_id: 0, title: 'Naissance de Léonard MAZAUD', value: '3 mai 1872', origin: {kind: 'screen', label: 'Registres paroissiaux de Treignac (1770–1800)'}};
    const fillBasket = () => p.evaluate(async it => { const b = await window.LCNDA_APP.api('cx_basket', {}); if ((b.items || []).length) await window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: 'basket_remove', ids: b.items.map(x => x.id)}});
        await window.LCNDA_EXT.connexions.take([it], {quiet: true}); await window.LCNDA_EXT.connexions.refresh(); }, ITEM);
    const closeAll = () => p.evaluate(() => { window.LCNDA_EXT.insertInfo?.close(); document.querySelectorAll('.ui-actmenu').forEach(x => x.remove()); document.querySelectorAll('dialog[open]').forEach(d => { d.dataset.ownClose = ''; d.close(); d.remove(); }); document.querySelectorAll('.toast').forEach(x => x.remove()); });
    const clickUndo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(700); };
    const menuPick = async (bar, label) => { await p.click(`${bar} [data-cx-tool-add]`); const b = p.locator('.ui-actmenu button', {hasText: label}).first(); await b.waitFor({timeout: 6000}); await b.click(); await sleep(900); };
    const here = id => p.evaluate(x => { const d = window.LCNDA_EXT.dropTargets.find(t => t.id === x); return d?.here?.()?.label || null; }, id);
    /** 📎 de la barre, sans curseur dans un texte : l'info cherchée arrive dans l'outil (comme du panier) */
    const qiPick = async (bar, q) => { await p.click(`${bar} [data-cx-tool-ins]`); await p.waitForSelector('.cx-qi'); await p.keyboard.type(q);
        await p.waitForFunction(x => [...document.querySelectorAll('.cx-qi .cx-qi-r')].some(r => r.textContent.includes(x)), 'MAZAUD', {timeout: 15000}); await p.keyboard.press('Enter'); await sleep(900); };
    try {
        await t('1 · 📝 Traitement de texte : 📎 · 📥 dans la barre ; « Ici » ; du panier : un paragraphe, la source en note de bas de page ; ↶ ; 📎 au curseur → une note ; 🧺 Prendre la sélection', async () => {
            await fillBasket();
            await p.evaluate(() => window.LCNDA_EXT.openTextDoc({name: 'Récit LACOMBE'})); await p.waitForSelector('.wp-dlg[open] .cx-tool-btns [data-cx-tool-add]', {timeout: 20000}); await sleep(400);
            assert.match(await here('tool_textdoc') || '', /Récit LACOMBE/);
            await menuPick('.wp-dlg', 'Depuis le panier');
            const fn = await p.evaluate(() => [...document.querySelectorAll('.wp-dlg .wp-body sup.wp-fn')].map(s => s.dataset.note));
            assert.ok(fn.some(n => /Treignac/.test(n)), JSON.stringify(fn));
            assert.match(await p.textContent('.wp-dlg .wp-body'), /Naissance de Léonard MAZAUD — 3 mai 1872/);
            await clickUndo();
            assert.ok(!/Léonard MAZAUD/.test(await p.textContent('.wp-dlg .wp-body')), 'annulé');
            // 📎 au curseur : « / » dans le texte, la source → une note de bas de page (pas de « [↗ …] »)
            await p.click('.wp-dlg .wp-body'); await p.keyboard.type('Il naît.'); await p.keyboard.press('Enter'); await p.keyboard.type('/'); await p.waitForSelector('.cx-qi'); await p.keyboard.type('Léonard MAZAUD');
            await p.waitForFunction(() => [...document.querySelectorAll('.cx-qi .cx-qi-r')].some(r => /Léonard MAZAUD/.test(r.textContent)), null, {timeout: 15000});
            await p.evaluate(() => { const rs = [...document.querySelectorAll('.cx-qi .cx-qi-r')]; const r = rs.find(x => /Naissance de Léonard/.test(x.textContent)) || rs.find(x => /Léonard MAZAUD/.test(x.textContent)); r.click(); }); await sleep(900);
            const body = await p.evaluate(() => document.querySelector('.wp-dlg .wp-body').innerHTML);
            assert.ok(!/\[↗/.test(body), 'la source n’est pas dans le texte : ' + body.slice(0, 300)); assert.match(body, /Léonard MAZAUD/);
            // 🧺 Prendre la sélection
            const n0 = await p.evaluate(() => window.LCNDA_EXT.connexions.count());
            await p.evaluate(() => { const b = document.querySelector('.wp-dlg .wp-body p'); const r = document.createRange(); r.selectNodeContents(b); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
            await menuPick('.wp-dlg', 'Prendre la sélection'); await sleep(600);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.connexions.count()), n0 + 1);
        });
        await t('2 · 🎞️ Présentation : du panier, une diapositive, la source dans les notes ; ↶ ; 📎 de la barre → une diapositive sourcée ; 🧺 la diapositive', async () => {
            await closeAll(); await fillBasket();
            await p.evaluate(() => window.LCNDA_EXT.keynoteFromText('<h1>Les MAZAUD</h1>', 'Les MAZAUD')); await p.waitForSelector('.kn-dlg[open] .cx-tool-btns [data-cx-tool-add]', {timeout: 20000}); await sleep(400);
            assert.ok(await here('tool_keynote'));
            const n0 = await p.evaluate(() => window.LCNDA_EXT.keynoteCurrent.show.slides.length);
            await menuPick('.kn-dlg', 'Depuis le panier');
            const s = await p.evaluate(() => { const k = window.LCNDA_EXT.keynoteCurrent; return {n: k.show.slides.length, notes: k.show.slides[k.cur].notes}; });
            assert.strictEqual(s.n, n0 + 1); assert.match(s.notes, /Source : Registres paroissiaux de Treignac/);
            await clickUndo(); assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.keynoteCurrent.show.slides.length), n0);
            await qiPick('.kn-dlg', 'Léonard MAZAUD');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.keynoteCurrent.show.slides.length), n0 + 1);
            const c0 = await p.evaluate(() => window.LCNDA_EXT.connexions.count());
            await menuPick('.kn-dlg', 'Prendre la sélection'); await sleep(500);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.connexions.count()), c0 + 1);
        });
        await t('3 · 🎞️ 📎 dans une zone de texte de la diapositive : la source va dans les notes de l’orateur', async () => {
            const r = await p.evaluate(async () => { const H = window.LCNDA_EXT.insertInfo.hosts.find(h => h.id === 'tool_keynote'); const el = document.createElement('div'); el.contentEditable = 'true'; document.querySelector('.kn-dlg .kn-canvas, .kn-dlg').appendChild(el);
                const ok = H.match(el), out = H.render({text: 'X [↗ Registres de Tulle]', html: 'X [↗ Registres de Tulle]', items: []}, el); const undo = H.cite(el, [{kind: 'datum', title: 'X', origin: {label: 'Registres de Tulle'}}]);
                const k = window.LCNDA_EXT.keynoteCurrent, notes = k.show.slides[k.cur].notes; undo?.(); el.remove(); return {ok, out, notes, after: k.show.slides[k.cur].notes}; });
            assert.ok(r.ok); assert.strictEqual(r.out.html.trim(), 'X'); assert.match(r.notes, /Source : Registres de Tulle/); assert.ok(!/Tulle/.test(r.after || ''), 'annulé');
        });
        await t('4 · 🧾 Tableur : du panier, une ligne sous les données avec une colonne « Source » ; ↶ ; 🧺 les cellules choisies', async () => {
            await closeAll(); await fillBasket();
            await p.evaluate(() => window.LCNDA_EXT.openRowsInSheet({name: 'Naissances DURAND', rows: [['Nom', 'Année'], ['Pierre DURAND', '1859']]})); await p.waitForSelector('.xl-dlg[open] .cx-tool-btns [data-cx-tool-add]', {timeout: 20000}); await sleep(400);
            assert.ok(await here('tool_sheet'));
            await menuPick('.xl-dlg', 'Depuis le panier');
            const m = await p.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current; return window.LCNDA_SHEET.matrix(ed.wb, ed.calc, ed.si); });
            const flat = JSON.stringify(m); assert.match(flat, /Naissance de Léonard MAZAUD/); assert.match(flat, /Registres paroissiaux de Treignac/); assert.match(flat, /Source/); assert.match(flat, /Pierre DURAND/);
            await clickUndo();
            assert.ok(!/Léonard/.test(JSON.stringify(await p.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current; return window.LCNDA_SHEET.matrix(ed.wb, ed.calc, ed.si); }))), 'annulé');
            const c0 = await p.evaluate(() => window.LCNDA_EXT.connexions.count());
            await p.evaluate(() => { const ed = window.LCNDA_EXT.tableurInternals.current; ed.setSel(0, 0, 1, 1); });
            await menuPick('.xl-dlg', 'Prendre la sélection'); await sleep(500);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.connexions.count()), c0 + 1);
        });
        await t('5 · ✒️ Dessin vectoriel : du panier, une étiquette et sa source ; ↶', async () => {
            await closeAll(); await fillBasket();
            await p.evaluate(() => window.LCNDA_EXT.openVectorEditor({})); await p.waitForSelector('.vx-dlg[open] .cx-tool-btns [data-cx-tool-add]', {timeout: 20000}); await sleep(500);
            const texts = () => p.evaluate(() => { const out = []; const w = l => (l || []).forEach(o => { if (o.children) w(o.children); if (o.type === 'text') out.push(o.text); }); w(window.LCNDA_EXT.vectorCurrent.doc.objs); return out; });
            await menuPick('.vx-dlg', 'Depuis le panier');
            const tx = await texts(); assert.ok(tx.some(x => /Léonard MAZAUD/.test(x)) && tx.some(x => /Source : Registres paroissiaux de Treignac/.test(x)), JSON.stringify(tx));
            await clickUndo(); assert.ok(!(await texts()).some(x => /Léonard/.test(x)), 'annulé');
        });
        await t('6 · 🌐 Mon site web : du panier, un bloc sur la page avec « Source : » ; ↶', async () => {
            await closeAll(); await fillBasket();
            await p.evaluate(() => window.LCNDA_EXT.openWebsite({data: window.LCNDA_EXT.siteWeb.blankSite(), name: 'Site LACOMBE'})); await p.waitForSelector('.sw-dlg[open] .cx-tool-btns [data-cx-tool-add]', {timeout: 20000}); await sleep(600);
            assert.ok(await here('tool_site'));
            await menuPick('.sw-dlg', 'Depuis le panier');
            const h = await p.evaluate(() => window.LCNDA_EXT.siteWeb.current.page().html);
            assert.match(h, /Naissance de Léonard MAZAUD/); assert.match(h, /Source : Registres paroissiaux de Treignac/);
            await clickUndo(); assert.ok(!/Léonard/.test(await p.evaluate(() => window.LCNDA_EXT.siteWeb.current.page().html)), 'annulé');
        });
        await t('7 · 📊 Diagrammes : 📎 dans le titre (une ligne) : le texte sans « [↗ ] », la source dans « Source / note en bas » ; ↶', async () => {
            await closeAll();
            await p.evaluate(() => window.LCNDA_EXT.openDiagramEditor(null, {spec: window.LCNDA_EXT.diagramsInternals.presetSpec({kind: Object.keys(window.LCNDA_EXT.diagramRender.KINDS)[0]}), name: 'Essai DURAND'})); await p.waitForSelector('.h-dg-dlg[open] .cx-tool-btns', {timeout: 20000}); await sleep(500);
            assert.ok(await p.$('.h-dg-dlg .cx-tool-btns [data-cx-tool-ins]'), 'le 📎 dans la barre'); assert.ok(!await p.$('.h-dg-dlg .cx-tool-btns [data-cx-tool-add]'), 'rien à recevoir : pas de 📥');
            await p.click('.h-dg-dlg [data-cx-tool-ins]'); await p.waitForSelector('.cx-qi'); assert.ok(await p.$('.h-dg-dlg [data-opt="title"]'), 'l’onglet Réglages, le titre'); await p.keyboard.type('Léonard MAZAUD');
            await p.waitForFunction(() => [...document.querySelectorAll('.cx-qi .cx-qi-r')].some(r => /Naissance de Léonard/.test(r.textContent)), null, {timeout: 15000});
            await p.evaluate(() => [...document.querySelectorAll('.cx-qi .cx-qi-r')].find(x => /Naissance de Léonard/.test(x.textContent)).click()); await sleep(800);
            const v = await p.evaluate(() => ({t: document.querySelector('.h-dg-dlg [data-opt="title"]').value, s: document.querySelector('.h-dg-dlg [data-opt="source"]')?.value}));
            assert.match(v.t, /Naissance de Léonard MAZAUD/); assert.ok(!/↗/.test(v.t), v.t); assert.match(v.s || '', /Treignac/);
            await clickUndo(); const w = await p.evaluate(() => ({t: document.querySelector('.h-dg-dlg [data-opt="title"]').value, s: document.querySelector('.h-dg-dlg [data-opt="source"]')?.value}));
            assert.ok(!/Léonard/.test(w.t) && !/Treignac/.test(w.s || ''), JSON.stringify(w));
        });
        await t('8 · 📖 Livre de famille : « Ici : le Livre » ; du panier, un paragraphe du « Mot de la fin » avec la source ; ↶', async () => {
            await closeAll(); await fillBasket();
            await B.go('maintenance', {maintenanceTab: 'export'}); await p.waitForSelector('#family-book-form .cx-tool-btns [data-cx-tool-add]', {timeout: 20000});
            assert.match(await here('tool_book') || '', /Livre/);
            const v0 = await p.inputValue('#family-book-form textarea[name="epilogue"]');
            await menuPick('#family-book-form', 'Depuis le panier');
            const v = await p.inputValue('#family-book-form textarea[name="epilogue"]'); assert.match(v, /Naissance de Léonard MAZAUD — 3 mai 1872\nSource : Registres paroissiaux de Treignac/);
            assert.match(await p.evaluate(() => localStorage.getItem('genealogie-family-book')), /Léonard MAZAUD/, 'gardé avec le livre');
            await clickUndo(); assert.strictEqual(await p.inputValue('#family-book-form textarea[name="epilogue"]'), v0);
        });
        await t('9 · 🔒 mode consultation : pas de boutons, « Ici » se tait, recevoir est refusé ; 🧺 éteint : rien non plus', async () => {
            await closeAll(); await fillBasket();
            await p.evaluate(() => window.LCNDA_EXT.openTextDoc({name: 'Consultation'})); await p.waitForSelector('.wp-dlg[open] .cx-tool-btns', {timeout: 20000});
            await p.evaluate(() => document.body.classList.add('is-kiosk')); await sleep(300); await p.evaluate(() => window.LCNDA_EXT.toolConnexions.paint());
            assert.ok(!await p.$('.wp-dlg .cx-tool-btns'), 'pas de boutons'); assert.strictEqual(await here('tool_textdoc'), null);
            const r = await p.evaluate(async () => { const d = window.LCNDA_EXT.dropTargets.find(t => t.id === 'tool_textdoc'); try { await d.receive([{kind: 'text', title: 'X', value: 'Y'}], {inst: window.LCNDA_EXT.textDocKit.current}); return 'reçu'; } catch (e) { return e.message; } });
            assert.match(r, /consultation/i);
            assert.ok(!/\bY\b/.test(await p.textContent('.wp-dlg .wp-body')));
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
            await p.evaluate(() => { localStorage.setItem('genealogie-connexions', JSON.stringify({on: false})); window.LCNDA_EXT.toolConnexions.paint(); });
            assert.ok(!await p.$('.wp-dlg .cx-tool-btns'), 'panier éteint : pas de boutons'); assert.strictEqual(await here('tool_textdoc'), null);
            await p.evaluate(() => { localStorage.removeItem('genealogie-connexions'); window.LCNDA_EXT.toolConnexions.paint(); });
            assert.ok(await p.$('.wp-dlg .cx-tool-btns'));
            await p.evaluate(() => { localStorage.setItem('genealogie-inserer', JSON.stringify({on: false})); window.LCNDA_EXT.toolConnexions.paint(); });
            assert.ok(await p.$eval('.wp-dlg [data-cx-tool-ins]', b => b.hidden), '📎 éteint : caché');
            await p.evaluate(() => { localStorage.removeItem('genealogie-inserer'); window.LCNDA_EXT.toolConnexions.paint(); });
        });
        await t('12 · 🧺 clic droit partout (un seul écouteur) : un événement de la fiche → « 🧺 Prendre « … » » garde la SORTE et le numéro ; ↶', async () => {
            await closeAll(); await B.go('personnes', {currentPersonId: 1}); await p.waitForSelector('#workspace .event-row[data-event-id]', {timeout: 20000}); await sleep(500);
            const id = Number(await p.getAttribute('#workspace .event-row[data-event-id]', 'data-event-id'));
            const n = async () => ((await B.api('cx_basket', {})).items || []).length, c0 = await n();
            await p.click('#workspace .event-row[data-event-id] .event-date, #workspace .event-row[data-event-id] strong', {button: 'right'});
            const b = p.locator('.ui-actmenu button', {hasText: '🧺'}).first(); await b.waitFor({timeout: 6000});
            assert.match(await b.textContent(), /Prendre « /); await b.click(); await sleep(900);
            const its = (await B.api('cx_basket', {})).items || [];
            assert.ok(its.some(x => x.kind === 'event' && Number(x.ref_id) === id), JSON.stringify(its.map(x => [x.kind, x.ref_id, x.title])).slice(0, 300));
            assert.strictEqual(await n(), c0 + 1);
            await clickUndo(); assert.strictEqual(await n(), c0);
        });
        await t('13 · 🧺 un échantillon de chaque écran : fiche (événements, médias, proches), listes, tableau de bord, enquêtes, documents, données, graphiques — des éléments à prendre (proches compris)', async () => {
            const scan = () => p.evaluate(() => { const seen = new Map(); document.querySelectorAll('#workspace *').forEach(el => { if (seen.size > 400) return; for (const a of el.attributes) { if (/^data-.*(person|event|media|place|act|source)/.test(a.name) && /^\d+$/.test(a.value)) { const it = window.LCNDA_EXT.toolConnexions.entityAt(el); if (it) seen.set(`${it.kind}:${it.ref_id}`, it.kind); break; } } });
                const k = {}; seen.forEach(v => { k[v] = (k[v] || 0) + 1; }); return k; });
            const out = {};
            const W = {personnes: '#workspace .event-row[data-event-id]', dashboard: '#workspace [data-open-dashboard-person]', graphiques: '#workspace [data-open-person], #workspace [data-h-person], #workspace [data-tree-person]'};
            for (const [m, extra] of [['personnes', {currentPersonId: 1}], ['dashboard', {}], ['graphiques', {}], ['listes', {}], ['documents', {}], ['donnees', {}]]) {
                await closeAll(); await B.go(m, extra); if (W[m]) await p.waitForSelector(W[m], {timeout: 25000}).catch(() => {}); await sleep(1500); out[m] = await scan(); }
            console.log('    ', JSON.stringify(out));
            assert.ok(out.personnes.event && out.personnes.person, 'la fiche : événements et proches'); assert.ok(out.dashboard.person, 'le tableau de bord : ses fiches');
            assert.ok(Object.values(out).filter(k => Object.keys(k).length).length >= 3, 'au moins 3 écrans');
        });
        await t('14 · 📎 « Insérer… » dans « 📤 Envoyer vers… » (texte, tableau) et dans un export qui donne un tableau', async () => {
            await closeAll();
            assert.ok(await p.evaluate(() => (window.LCNDA_EXT.sendTargetsFor('rows') || []).some(t => t.key === 'cx_insert') && (window.LCNDA_EXT.sendTargetsFor('text') || []).some(t => t.key === 'cx_insert')));
            await p.evaluate(() => { window.LCNDA_UI.openExportDialog({title: 'Naissances MAZAUD', formats: [{id: 'pdf', run: async () => {}}, window.LCNDA_EXT.sheetExportFormat(() => [['Nom', 'Année'], ['Léonard MAZAUD', '1872']], 'Naissances')]}); });
            await p.waitForSelector('dialog.ui-export[open] [data-fmt="cx_insert"]', {timeout: 8000});
            await p.click('dialog.ui-export [data-fmt="cx_insert"]'); await p.click('dialog.ui-export [data-ui-go]');
            const b = p.locator('.ui-actmenu button', {hasText: 'Copier le texte'}).first(); await b.waitFor({timeout: 6000}); // le menu « Insérer un bloc » : curseur, note…, copier
            await p.evaluate(() => document.querySelectorAll('.ui-actmenu').forEach(x => x.remove()));
        });
        await t('11 · 🎞 Studio d’animation, 🎚️ Retouche : « Mettre dans… » une image du panier (par « 📤 Envoyer vers… ») ; un texte ne leur va pas', async () => {
            const r = await p.evaluate(() => ['send_anim-new', 'send_retouch'].map(id => { const d = window.LCNDA_EXT.dropTargets.find(t => t.id === id); return {id, ok: !!d && d.enabled() !== false, kinds: d?.kinds}; }));
            r.forEach(x => { assert.ok(x.ok, x.id); assert.deepStrictEqual(x.kinds, ['media']); });
        });
        await t('10 · 390 px et sombre : le groupe tient dans la barre, ne colle pas aux bords ; aucune erreur JS', async () => {
            await closeAll(); await p.evaluate(() => window.LCNDA_EXT.openTextDoc({name: 'Étroit'})); await p.waitForSelector('.wp-dlg[open] .cx-tool-btns', {timeout: 20000}); await p.setViewportSize({width: 390, height: 800}); await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await sleep(500);
            const r = await p.evaluate(() => { const g = document.querySelector('.wp-dlg .cx-tool-btns'), b = g.getBoundingClientRect(); return {l: b.left, r: innerWidth - b.right, w: b.width, bg: getComputedStyle(g.querySelector('.cx-tool-b')).backgroundColor}; });
            assert.ok(r.w > 20 && r.l >= 4, JSON.stringify(r)); assert.notStrictEqual(r.bg, 'rgb(255, 255, 255)', 'sombre');
            await p.setViewportSize({width: 1440, height: 900}); await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
            const errs = B.errs.filter(e => !/ResizeObserver|net::|Failed to fetch|AbortError/.test(e)); assert.deepStrictEqual(errs, []);
        });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
