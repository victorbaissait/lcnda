#!/usr/bin/env node
/* 🔎 Recherche : « 🗺 Carte » qui monte, 🧺 et 📎 dans « ⤓ Exporter ▾ », 📎 🧺 au bout de chaque résultat (assets/js/app-recherche-kit.js).
 *  1. Proximité « Qui d'autre était là ? » (Treignac, 1780–1800, rayon 10 km : Chamberet incluse) : la carte s'ouvre (points + cercle du rayon,
 *     légende aux couleurs de la Carte), retenue (genealogie-proximite-carte) ; un clic sur un point (ou une pastille) ouvre une petite fiche ;
 *     survoler une personne éclaire ses points ; 🧺 tout / les cochés, ↶ ; 📎 dans une note (avec la ligne source = les critères), ↶ ;
 *  2. d'autres sortes : Période ou date (carte + 📎 🧺 par ligne), Nom de lieu avec joker (carte), Texte (🧺 📎, pas de carte),
 *     Chercher et remplacer (rien de nouveau) ;
 *  3. mode consultation : ni 🧺 ni 📎, rien demandé à Internet ; 390 px et sombre ; aucune erreur JS.
 * Base : tests/prendre-depuis-seed.js (noms fictifs MAZAUD, LACOMBE, DURAND ; communes réelles).   node tests/test-proximite-carte-panier.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const ONLY = process.env.PX_ONLY ? new RegExp(process.env.PX_ONLY) : null;
const t = async (name, fn) => { if (ONLY && !ONLY.test(name)) return; try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    const clean = () => p.evaluate(() => { document.querySelectorAll('.ui-actmenu, .cx-qi').forEach(x => x.remove()); document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.toast').forEach(x => x.remove()); });
    const undo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 10000}); await u.click(); await sleep(900); };
    const basketN = async () => ((await B.api('cx_basket', {})).items || []).length;
    const research = async (kind, extra, sel) => {
        await clean();
        await p.evaluate(([k, e]) => { const st = window.LCNDA_APP.state; st.researchKind = k; Object.entries(e).forEach(([key, v]) => { st[key] = typeof v === 'object' && !Array.isArray(v) ? {...(st[key] || {}), ...v} : v; }); st.researchDisplay = 'cards';
            if (st.module !== 'recherche') window.LCNDA_APP.setModule('recherche'); else window.LCNDA_PARTS.renderResearch(); }, [kind, extra]);
        await p.waitForSelector(sel, {timeout: 30000}); await sleep(300);
    };
    const PROX = {proximitySearch: {placeId: 1, placeName: 'Treignac', dateMode: 'range', yearFrom: 1780, yearTo: 1800, radiusKm: 10}};
    const openProx = () => research('proximity', PROX, '#workspace .research-person-card[data-rk-id]');
    /** « ⤓ Exporter ▾ » : la fenêtre d'export commune ; ses formats (📊 CSV, 🖨, puis 🧺 et 📎 là où ça a un sens) */
    const menu = async () => { await clean(); await p.click('#workspace .page-header [data-rp-export]'); await p.waitForSelector('dialog.ui-export'); return p.$$eval('dialog.ui-export .ui-export-fmt', a => a.map(x => x.textContent.trim())); };
    const menuPick = async re => { await p.locator('dialog.ui-export .ui-export-fmt').filter({hasText: re}).first().click(); await p.click('dialog.ui-export [data-ui-go]'); await sleep(300); };
    const actPick = async re => { await p.locator('.ui-actmenu .ui-actmenu-i').filter({hasText: re}).first().click(); };
    try {
        await p.evaluate(() => { try { localStorage.removeItem('genealogie-proximite-carte'); } catch (_) {} });
        await t('Proximité : « 🗺 Carte » avant « ⤓ Exporter ▾ », fermée au départ ; elle monte avec les points, le rayon et la légende', async () => {
            await openProx();
            const order = await p.$$eval('#workspace .page-header .ui-ph-actions > button:not([hidden])', a => a.map(x => (x.matches('[data-rk-map-btn]') ? 'map' : x.matches('[data-rp-export]') ? 'export' : x.matches('[data-rp-print]') ? 'print' : '?')));
            assert.deepStrictEqual(order.filter(x => x !== '?').slice(0, 2), ['map', 'export'], order.join(','));
            assert.ok(await p.$('#workspace .page-header [data-rp-print]'), '🖨 Imprimer reste (à côté, ou dans « ⋯ » : deux boutons au plus, la règle des en-têtes)');
            assert.strictEqual(await p.$$eval('#workspace .page-header [data-rp-export], #workspace .page-header [data-rk-export]', a => a.length), 1, 'un seul « Exporter »');
            assert.strictEqual(await p.$eval('[data-rk-map]', el => el.classList.contains('is-open')), false);
            assert.ok(await p.$eval('[data-rk-map]', el => el.compareDocumentPosition(document.querySelector('#workspace .date-results')) & Node.DOCUMENT_POSITION_FOLLOWING), 'au-dessus des résultats');
            await p.click('[data-rk-map-btn]');
            await p.waitForSelector('[data-rk-map].is-open .h-map-point', {timeout: 15000, state: 'attached'}); await sleep(700);
            assert.strictEqual(await p.getAttribute('[data-rk-map-btn]', 'aria-expanded'), 'true');
            const n = await p.$$eval('[data-rk-map] .h-map-point[data-cf-i]', a => a.length); assert.ok(n > 5, 'des points : ' + n);
            assert.ok(await p.$('[data-rk-map] .mm-circle[points]'), 'le cercle du rayon');
            const leg = await p.textContent('[data-rk-map] [data-rk-legend]');
            assert.match(leg, /Naissances/); assert.match(leg, /Commune cherchée/); assert.match(leg, /Communes voisines incluses/);
            // la couleur des naissances : celle de la Carte (réglage genealogie-carte-couleurs, sinon la couleur de départ)
            const birth = await p.evaluate(() => (window.LCNDA_CARTE_COULEURS ? window.LCNDA_CARTE_COULEURS.color('births') : '#2b8a3e'));
            assert.ok(await p.$eval('[data-rk-map]', (el, c) => el.innerHTML.toLowerCase().includes(c.toLowerCase()), birth), 'couleur des naissances ' + birth);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-proximite-carte')), '1');
            await openProx(); await p.waitForSelector('[data-rk-map].is-open .h-map-point', {timeout: 15000, state: 'attached'});
            assert.ok(true, 'retenue ouverte');
        });
        await t('Proximité : un clic sur un point (ou une pastille) ouvre une petite fiche, sans quitter l’écran ; lien vers la fiche', async () => {
            await sleep(500);
            const where = await p.evaluate(() => {
                const host = document.querySelector('[data-rk-map-host]');
                const vis = el => { const r = el.getBoundingClientRect(); return el.style.display !== 'none' && r.width > 0 ? r : null; };
                const g = [...host.querySelectorAll('.h-map-point[data-cf-i]')].map(x => [x, vis(x)]).find(x => x[1]) || [...host.querySelectorAll('.h-map-cluster')].map(x => [x, vis(x)]).find(x => x[1]);
                if (!g) return null; g[0].scrollIntoView({block: 'center'}); const r = g[0].getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2};
            });
            assert.ok(where, 'un point visible ' + await p.evaluate(() => { const h = document.querySelector('[data-rk-map-host]'); return [document.querySelectorAll('[data-rk-map]').length, document.querySelector('[data-rk-map]')?.className, h?.querySelectorAll('.h-map-point').length, h?.querySelectorAll('.h-map-cluster').length, h?.innerHTML.length].join(','); }));
            await p.mouse.click(where.x, where.y);
            await p.waitForSelector('[data-rk-map] .cf-card', {timeout: 5000});
            let txt = await p.textContent('[data-rk-map] .cf-card');
            if (await p.$('[data-rk-map] .cf-card [data-cf-pick]')) { await p.click('[data-rk-map] .cf-card [data-cf-pick]'); await sleep(300); txt = await p.textContent('[data-rk-map] .cf-card'); }
            assert.match(txt, /Personnes/, txt);
            assert.ok(await p.$('[data-rk-map] .cf-card [data-open-person]'), 'un lien vers la fiche');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.module), 'recherche');
            await p.keyboard.press('Escape');
        });
        await t('Proximité : survoler une personne éclaire ses points sur la carte', async () => {
            const id = await p.$eval('#workspace .research-person-card[data-rk-id]', el => el.dataset.rkId);
            await p.hover(`#workspace .research-person-card[data-rk-id="${id}"] .person-card-name`);
            await sleep(200);
            assert.ok(await p.$('[data-rk-map-host].has-rk-hi'), 'la carte est en mode « éclairé »');
            assert.ok(await p.$('[data-rk-map] .h-map-point.is-rk-hi, [data-rk-map] .h-map-cluster.is-rk-hi'), 'ses points (ou leur pastille)');
            await p.mouse.move(2, 2); await sleep(150);
            await p.hover('#workspace .page-header h2'); await sleep(150);
        });
        await t('Proximité : ⤓ Exporter ▾ → l’export d’avant, 🧺 Mettre dans le panier (tout) et ↶', async () => {
            const items = await menu();
            assert.ok(items.some(x => /CSV/.test(x)) && items.some(x => /Mettre dans le panier/.test(x)) && items.some(x => /Insérer…/.test(x)), items.join(' | '));
            assert.ok(items.findIndex(x => /CSV/.test(x)) < items.findIndex(x => /panier/.test(x)), 'après les exports d’avant');
            const total = await p.$$eval('#workspace .research-person-card', a => a.length);
            const before = await basketN();
            await menuPick(/Mettre dans le panier/); await sleep(1200);
            if (await p.$('.ui-actmenu')) { await p.locator('.ui-actmenu .ui-actmenu-i').first().click(); await sleep(1200); } // plusieurs paniers : le premier
            assert.strictEqual(await basketN(), before + total, 'toutes les personnes');
            await undo(); assert.strictEqual(await basketN(), before, '↶');
        });
        await t('Proximité : ☑ cocher deux personnes → 🧺 seulement elles ; 📎 / 🧺 au bout d’une carte', async () => {
            const boxes = p.locator('#workspace .research-person-card [data-rp-pick]');
            await boxes.nth(0).check(); await boxes.nth(1).check();
            assert.match(await p.textContent('#workspace [data-rp-count]'), /2/);
            const items = await menu(); assert.ok(items.some(x => /panier.*2 cochés/.test(x)), items.join(' | '));
            const before = await basketN();
            await menuPick(/Mettre dans le panier/); await sleep(1200);
            if (await p.$('.ui-actmenu')) { await p.locator('.ui-actmenu .ui-actmenu-i').first().click(); await sleep(1200); }
            assert.strictEqual(await basketN(), before + 2);
            await undo(); assert.strictEqual(await basketN(), before);
            await boxes.nth(0).uncheck(); await boxes.nth(1).uncheck();
            // au bout d'une carte (au survol)
            const card = p.locator('#workspace .research-person-card').nth(2);
            await card.hover(); await sleep(250);
            assert.ok(Number(await card.locator('.rk-row-acts').evaluate(el => getComputedStyle(el).opacity)) > 0.5, 'visible au survol');
            await card.locator('[data-rk-bk]').click(); await sleep(1200);
            if (await p.$('.ui-actmenu')) { await p.locator('.ui-actmenu .ui-actmenu-i').first().click(); await sleep(1200); }
            assert.strictEqual(await basketN(), before + 1);
            await undo(); assert.strictEqual(await basketN(), before);
        });
        await t('Proximité : 📎 Insérer… → dans une note (un tableau Personne · Événement · Date · Commune, la source = les critères), ↶', async () => {
            await p.evaluate(() => { const P = window.LCNDA_PICKER || window.LCNDA_APP; P.__open0 = P.openPicker; P.openPicker = async () => ({id: 1, title: 'Jean MAZAUD'}); });
            const notes = async () => (await B.api('person', {id: 1})).notes || [];
            const before = (await notes()).length;
            await menu(); await menuPick(/Insérer…/); await p.waitForSelector('.ui-actmenu .ui-actmenu-i', {timeout: 5000});
            await actPick(/Dans une note, une enquête/);
            await p.waitForSelector('.cx-put [data-cx-dest="note"]', {timeout: 10000});
            await p.click('.cx-put [data-cx-dest="note"]'); await p.click('.cx-put [data-cx-putgo]'); await sleep(1500);
            const after = await notes(); assert.strictEqual(after.length, before + 1, 'une note de plus');
            const body = after.map(n => n.body || '').find(b => /Proximité/.test(b)) || '';
            assert.match(body, /Personne \| Événement \| Date \| Commune/, body.slice(0, 300));
            assert.match(body, /Source : Recherche · Proximité · qui d’autre était là \? : Treignac/, 'la ligne source');
            assert.match(body, /rayon 10 km/);
            await undo(); assert.strictEqual((await notes()).length, before, '↶ la note disparaît');
            await p.evaluate(() => { const P = window.LCNDA_PICKER || window.LCNDA_APP; P.openPicker = P.__open0; });
        });
        await t('Période ou date : 🗺 Carte (les événements placés) et 📎 🧺 au bout de chaque événement', async () => {
            await research('dates', {dateSearch: {mode: 'range', yearFrom: 1780, yearTo: 1790, values: '', placeId: 0, eventTypeId: '', occupationId: ''}, research: {q: '', category: 'all'}}, '#workspace article.date-result[data-rk-row]');
            assert.ok(await p.$('#workspace [data-rk-map-btn]'));
            if (!(await p.$('[data-rk-map].is-open'))) await p.click('[data-rk-map-btn]');
            await p.waitForSelector('[data-rk-map].is-open .h-map-point', {timeout: 15000, state: 'attached'});
            assert.ok(await p.$('#workspace article.date-result .rk-row-acts [data-rk-ins]'));
            const items = await menu(); assert.ok(items.some(x => /Mettre dans le panier/.test(x)), items.join(' | ')); await clean();
        });
        await t('Nom de lieu avec joker : 🗺 Carte des lieux trouvés, 🧺 📎 dans Exporter', async () => {
            await research('place_name', {placeNameSearch: {q: 'Tr*', country: '', division: ''}}, '#workspace [data-rk-map-btn]');
            assert.ok(await p.$('#workspace [data-rk-map-btn]'), 'les lieux ont des coordonnées');
            await p.click('[data-rk-map-btn]'); await p.waitForSelector('[data-rk-map].is-open .h-map-point', {timeout: 15000, state: 'attached'});
            const items = await menu(); assert.ok(items.some(x => /Insérer…/.test(x))); await clean();
        });
        await t('Texte, personne ou lieu : 🧺 📎 (une liste de personnes), mais pas de carte (rien à placer)', async () => {
            await research('text', {research: {q: 'MAZAUD', category: 'name'}}, '#workspace .research-person-card[data-rk-id]');
            assert.strictEqual(await p.$('#workspace [data-rk-map-btn]'), null);
            const items = await menu(); assert.ok(items.some(x => /Mettre dans le panier/.test(x))); await clean();
            assert.ok(await p.$('#workspace .research-person-card .rk-row-acts'));
        });
        const hasKit = async () => { const items = await menu(); await clean(); return items.some(x => /panier/.test(x)) && items.some(x => /Insérer…/.test(x)); };
        const openMap = async () => { if (!(await p.$('[data-rk-map].is-open'))) await p.click('#workspace [data-rk-map-btn]'); await p.waitForSelector('[data-rk-map].is-open .h-map-point', {timeout: 15000, state: 'attached'}); };
        await t('Multicritère : ☑ cases + barre, 🗺 Carte (les lieux des fiches), 🧺 📎, 📎 🧺 au bout de chaque ligne', async () => {
            await research('saved', {hSearch: {criteria: {last_name: 'MAZAUD', name_mode: 'exact'}, id: 0, name: ''}}, '#h-search-results tr [data-rp-pick]');
            await p.waitForSelector('#workspace [data-rk-map-btn]', {timeout: 10000});
            assert.ok(await p.$('#h-search-results [data-rp-bar]'), 'la barre de sélection');
            await openMap();
            assert.ok(await p.$('#h-search-results tr .rk-row-acts [data-rk-bk]'));
            assert.ok(await hasKit());
            const boxes = p.locator('#h-search-results [data-rp-pick]'); await boxes.nth(0).check();
            const items = await menu(); assert.ok(items.some(x => /panier.*1 coché/.test(x)), items.join(' | ')); await clean(); await boxes.nth(0).uncheck();
        });
        await t('Que manque-t-il ? : 🗺 Carte des communes à visiter, 🧺 📎 les recherches (un « Exporter » ajouté à l’en-tête)', async () => {
            await research('gaps', {}, '#workspace .h-gap');
            assert.ok(await hasKit());
            await p.waitForSelector('#workspace [data-rk-map-btn]', {timeout: 10000}); await openMap();
            assert.match(await p.textContent('[data-rk-map] [data-rk-legend]'), /Commune à visiter/);
            const before = await basketN(), n = await p.$$eval('#workspace .h-gap', a => a.length);
            await menu(); await menuPick(/Mettre dans le panier/); await sleep(1200);
            if (await p.$('.ui-actmenu')) { await p.locator('.ui-actmenu .ui-actmenu-i').first().click(); await sleep(1200); }
            assert.strictEqual(await basketN(), before + n, 'toutes les recherches montrées');
            await undo(); assert.strictEqual(await basketN(), before);
        });
        await t('Dépouillements : 🗺 Carte par commune, 🧺 📎', async () => {
            await p.evaluate(() => window.LCNDA_APP.api('save_archive_digest', {}, {method: 'POST', body: {id: 0, place_id: 1, city_name: 'Treignac', archive_service: 'AD Corrèze', archive_reference: '3 E 271/2', year_text: '1780-1800', record_type: 'naissance', status: 'todo', searched: 'Baptêmes MAZAUD'}}));
            await research('archive_digest', {archiveDigestSearch: {q: '', city: '', placeId: 0, radiusKm: 0, dept: '', region: '', recordType: '', status: ''}, archiveDigestAdding: false, archiveDigestEditId: 0}, '#workspace [data-rk-map-btn]');
            await openMap(); assert.ok(await hasKit());
        });
        await t('Transcriptions : 🧺 📎 (des médias), pas de carte', async () => {
            await research('transcriptions', {transcriptionSearch: {q: 'douze'}}, '#workspace .page-header [data-rp-export]');
            await sleep(300);
            if (await p.$('#workspace .date-result, #workspace table.data-table tbody tr')) { assert.ok(await hasKit()); }
            assert.strictEqual(await p.$('#workspace [data-rk-map-btn]'), null);
        });
        await t('Poser une question : 🧺 📎 sur les fiches trouvées, 🗺 Carte de leurs lieux', async () => {
            await research('question', {hQuestion: 'les MAZAUD'}, '#h-question-out table.data-table');
            await p.waitForSelector('#workspace [data-rk-map-btn]', {timeout: 10000});
            assert.ok(await hasKit());
        });
        await t('Où chercher ? : 🧺 les sites au panier (comme liens), 📎 ; pas de carte', async () => {
            await research('ou_chercher', {oucPerson: 1}, '#workspace .ouc-row a[data-ouc-go]');
            await p.waitForSelector('#workspace .page-header [data-rp-export]', {timeout: 10000});
            assert.strictEqual(await p.$('#workspace [data-rk-map-btn]'), null);
            const before = await basketN(), n = await p.$$eval('#workspace .ouc-row a[data-ouc-go]', a => a.filter(x => /^https?:/.test(x.href)).length);
            await menu(); await menuPick(/Mettre dans le panier/); await sleep(1200);
            if (await p.$('.ui-actmenu')) { await p.locator('.ui-actmenu .ui-actmenu-i').first().click(); await sleep(1200); }
            assert.strictEqual(await basketN(), before + n);
            const last = ((await B.api('cx_basket', {})).items || []).slice(-1)[0] || {};
            assert.ok(/^https?:/.test(last.value || last.origin?.url || ''), 'un lien ' + JSON.stringify(last).slice(0, 200));
            await undo(); assert.strictEqual(await basketN(), before);
        });
        await t('Chercher sur internet : 🧺 📎 les liens des sites', async () => {
            await research('web', {webSearchForm: {first: 'Jean', middle: '', last: 'MAZAUD', place: 'Treignac', placeKind: 'birth', y1: '1780', y2: '1840', spouseFirst: '', spouseLast: '', useMiddle: false, married: false}}, '#workspace a[data-ws-site]');
            assert.ok(await hasKit());
            assert.strictEqual(await p.$('#workspace [data-rk-map-btn]'), null);
        });
        await t('Journal des recherches : rien de nouveau (son export CSV et son compte rendu suffisent)', async () => {
            await research('journal', {}, '#workspace .h-rj');
            await sleep(600);
            assert.strictEqual(await p.$('#workspace [data-rk-own], #workspace [data-rk-map]'), null);
        });
        await t('Chercher et remplacer : rien de nouveau (ni carte, ni 🧺 📎)', async () => {
            await research('replace', {}, '#workspace [data-rp-replace-form]');
            assert.strictEqual(await p.$('#workspace [data-rk-map-btn]'), null);
            const items = await menu(); assert.ok(!items.some(x => /panier|Insérer/.test(x)), items.join(' | ')); await clean();
            assert.strictEqual(await p.$('#workspace .rk-row-acts'), null);
        });
        await t('Mode consultation : ni 🧺 ni 📎 ; la carte reste, sans tuile d’Internet', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await openProx(); await p.waitForSelector('[data-rk-map].is-open .h-map-point', {timeout: 15000, state: 'attached'}); await sleep(800);
            const items = await menu(); assert.ok(!items.some(x => /panier|Insérer/.test(x)), items.join(' | ')); await clean();
            assert.strictEqual(await p.$$eval('#workspace .rk-row-acts', a => a.length), 0);
            const srcs = await p.$$eval('[data-rk-map] img', a => a.map(x => x.getAttribute('src') || ''));
            assert.ok(srcs.every(s => !/^https?:/i.test(s) || s.startsWith(location.origin)), 'pas de tuile en ligne : ' + srcs.filter(s => /^https?:/i.test(s)).slice(0, 2).join(' '));
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('390 px et sombre : la carte prend toute la largeur, les boutons passent à la ligne sans toucher le titre, 9 px entre les cartes', async () => {
            await p.setViewportSize({width: 390, height: 844}); await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            await openProx(); await p.waitForSelector('[data-rk-map].is-open .h-map-point', {timeout: 15000, state: 'attached'}); await sleep(600);
            const m = await p.evaluate(() => {
                const page = document.querySelector('#workspace .page'), map = document.querySelector('[data-rk-map-host]'), h2 = document.querySelector('#workspace .page-header h2'), acts = document.querySelector('#workspace .page-header .ui-ph-actions');
                const R = el => el.getBoundingClientRect(), a = R(h2), b = R(acts), pr = R(page), mr = R(map);
                const cards = [...document.querySelectorAll('#workspace .date-results > article')].slice(0, 2).map(R);
                return {overlap: !(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left), gapTB: b.top - a.bottom, mapW: mr.width, pageW: pr.width - parseFloat(getComputedStyle(page).paddingLeft) - parseFloat(getComputedStyle(page).paddingRight),
                    scroll: document.documentElement.scrollWidth, gap: cards.length > 1 ? Math.round(cards[1].top - cards[0].bottom) : 9, bg: getComputedStyle(map).backgroundColor};
            });
            assert.ok(!m.overlap, 'les boutons ne touchent pas le titre ' + JSON.stringify(m));
            assert.ok(Math.abs(m.mapW - m.pageW) < 4, 'pleine largeur ' + JSON.stringify(m));
            assert.ok(m.scroll <= 392, 'pas de défilement de côté ' + m.scroll);
            assert.strictEqual(m.gap, 9, '9 px entre les cartes');
            assert.notStrictEqual(m.bg, 'rgb(255, 255, 255)', 'sombre');
            await p.setViewportSize({width: 1440, height: 900}); await p.evaluate(() => { document.documentElement.dataset.theme = ''; });
        });
        await t('Aucune erreur JS', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
