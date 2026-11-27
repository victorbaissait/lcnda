#!/usr/bin/env node
/* 📥 « Prendre depuis… » et 📍 « Mettre dans… » : des essais d'usage, comme un généalogiste (base réaliste : tests/prendre-depuis-seed.js).
 * Chaque scénario note ses clics (et frappes) et son temps ; le résumé à la fin les liste. Les étapes qui demandent le pack « Histoire du lieu »
 * (gares, séismes) sont sautées sans lui (/tmp/histoire-pack/histoire-locale.sqlite ou LCNDA_HIST_DB=…).
 *  U1 depuis l'enquête, les naissances à Treignac 1780-1800, en prendre 3 · U2 un acte + son image + une source d'un coup (et « déjà dans l'enquête »)
 *  U3 « Dis ce qu'il te faut » : 6 façons de demander (faute de frappe, « autour de 5 km de », un mois, un numéro de département, un nom)
 *  U4 Données : la météo du jour du mariage et les cimetières autour de Treignac, « tout le tableau » · U5 une liste dans la fenêtre → la page en grand → « Prendre les 3 cochées »
 *  U6 De l'extérieur : un tableau collé, une adresse, un PDF · U7 le panier : garder, fermer, rouvrir, prendre · U8 au clavier seulement (et les noms lus à voix haute)
 *  U9 téléphone 390 px de bout en bout · U10 chaos : double-clic sur Prendre, fermer pendant le chargement, base vide, 5 000 événements (temps de recherche)
 *  S1–S5 des éléments PRÉCIS des listes : une gare, la comète de Donati (et seulement son année), un mélange de 5 de listes différentes (panier puis enquête),
 *        le doublon (« déjà dans l'enquête »), trouver vite dans une liste · L1–L3 « ☑ Choisir des lignes » sur la page d'une liste (2 sur 5, Maj+clic, « Mettre dans » ces 2, les 20 premières)
 *  M1 « Mettre dans… » : en-tête, « Comment ? », une seule loupe, groupes, la dernière retenue, 390 px, sombre.
 *   node tests/test-prendre-depuis-usage.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const report = [];
const ONLY = process.env.PD_ONLY ? new RegExp(process.env.PD_ONLY) : null;
const t = async (name, fn) => {
    if (ONLY && !ONLY.test(name)) return;
    const m = {clicks: 0, t0: Date.now(), notes: []}; t.m = m;
    try { await t.before?.(); await fn(m); report.push(`✓ ${name.split(' ')[0]} · ${m.clicks} clics/frappes · ${((Date.now() - m.t0) / 1000).toFixed(1)} s${m.notes.length ? ' · ' + m.notes.join(' ; ') : ''}`); console.log('✓ ' + name); }
    catch (e) { fails++; if (process.env.PD_SHOT && t.page) await t.page.screenshot({path: `${process.env.PD_SHOT}/${name.split(' ')[0]}.png`}).catch(() => {}); report.push(`✗ ${name.split(' ')[0]}`); console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); }
};

(async () => {
    const B = await start({big: true});
    const p = B.page, D = '.cx-take'; t.page = p;
    const C = async (sel, o) => { t.m.clicks++; await p.click(sel, o); };
    const K = async key => { t.m.clicks++; await p.keyboard.press(key); };
    const F = async (sel, v) => { t.m.clicks++; await p.fill(sel, v); };
    const L = (sel, o) => p.locator(sel, o);
    const check = async loc => { t.m.clicks++; await loc.check(); };
    const shown = (k, q = '') => p.waitForFunction(([k2, q2]) => (document.querySelector('.cx-take [data-cx-res]')?.dataset.cxShown || '').startsWith(`${k2}|${q2}|`), [k, q], {timeout: 20000});
    const used = async (kind, ids) => (await B.api('cx_used', {kind, ids: ids.join(',')})).used || {};
    const inv = async () => B.api('investigation', {id: 1});
    const linksOf = async () => (await inv()).items.flatMap(i => i.links || []);
    const closeAll = () => p.evaluate(() => { window.LCNDA_EXT.insertInfo?.close?.(); document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
    const openTake = async () => { await closeAll(); await B.openInv(1); await p.mouse.click(700, 300); await K('Control+Alt+O'); await p.waitForSelector(`${D}[open]`); };
    const waitDelivered = () => p.waitForFunction(() => !document.querySelector('.cx-take[open]'), null, {timeout: 15000}).then(() => sleep(800));
    const rowsOfList = () => p.waitForSelector(`${D} [data-cx-lrows] .cx-rlist li`, {timeout: 30000});
    const listQ = async q => { await F(`${D} [data-cx-lq]`, q); await p.waitForFunction(x => [...document.querySelectorAll('.cx-take [data-cx-lrows] .cx-rlist li')].length && [...document.querySelectorAll('.cx-take [data-cx-lrows] .cx-rlist li')].every(li => li.textContent.toLowerCase().includes(x.toLowerCase().split(' ')[0])), q, {timeout: 20000}); };
    const openList = async id => { await C(`${D} [data-cx-tab="lists"]`); await C(`${D} [data-cx-list="${id}"]`); await rowsOfList(); };
    const basket = () => B.api('cx_basket');
    /** choisir une source de « Données » et attendre que son formulaire soit là */
    const ds = async id => { if (await p.$(`${D} [data-cx-dchange]`)) { await p.click(`${D} [data-cx-dchange]`); t.m.clicks++; } await p.click(`${D} [data-cx-dpick] [data-ld-pick="${id}"]`); t.m.clicks++; // 🧰 le choix commun d'une source (dataListPicker)
        await p.waitForFunction(() => { const s2 = document.querySelector('.cx-take .cx-dchosen b'), b = document.querySelector('.cx-take [data-cx-run]'); const lab = s2?.textContent.replace(/^\S+\s/, '').trim(); return b && lab && b.textContent.includes(lab); }, null, {timeout: 15000}); };
    /** le lieu d'une source de « Données » (celui d'avant est repris : on le retire d'abord) */
    const setPlace = async name => {
        const x = L(`${D} .pk[data-picker="place"] .pk-chip [data-pk="remove"]`); if (await x.count()) { await x.first().click(); t.m.clicks++; }
        await p.waitForSelector(`${D} .pk[data-picker="place"] input.pk-input:visible`, {timeout: 10000});
        await F(`${D} .pk[data-picker="place"] input.pk-input:visible`, name); await C(`${D} .pk-list [role="option"]:has-text("${name}"), ${D} .pk-item:has-text("${name}")`);
    };
    const clearBasket = () => p.evaluate(async () => { await window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: 'basket_clear'}}); await window.LCNDA_EXT.connexions.refresh(); });
    const hasList = id => p.evaluate(x => (window.LCNDA_EXT.dataListsEngine.list() || []).some(d => d.id === x), id);
    t.before = async () => { await closeAll(); await p.evaluate(() => document.querySelectorAll('.ui-actmenu').forEach(x => x.remove())); };
    try {
        await t('U1 · depuis l’enquête, les naissances à Treignac entre 1780 et 1800 ; en prendre 3', async m => {
            await openTake();
            await C(`${D} [data-cx-tab="event"]`); await F(`${D} [data-cx-q]`, 'Treignac 1780-1800'); await shown('event', 'Treignac 1780-1800');
            await C(`${D} [data-cx-chip="n"]`); await p.waitForFunction(() => /\|n\|/.test(document.querySelector('.cx-take [data-cx-res]').dataset.cxShown));
            const n = await L(`${D} .cx-rlist li`).count(); assert.strictEqual(n, 25);
            const ids = [];
            for (let i = 0; i < 3; i++) { await check(L(`${D} .cx-rlist li`).nth(i).locator('input')); }
            ids.push(...await p.evaluate(() => [...document.querySelectorAll('.cx-take .cx-rlist li.is-on [data-cx-ri]')].map(cb => cb.dataset.cxRi)));
            assert.match(await p.textContent(`${D} [data-cx-takehere]`), /Prendre \(3\)/);
            const refs = await p.evaluate(() => [...document.querySelectorAll('.cx-take .cx-rlist li.is-on')].map(li => li.innerText.split('\n')[0]));
            await C(`${D} [data-cx-takehere]`); await waitDelivered();
            const evs = (await B.api('picker_search', {kind: 'event', q: 'Treignac', year_from: 1780, year_to: 1800, limit: 100})).groups[0].items.filter(x => /Naissance/.test(x.title));
            const taken = evs.filter(x => refs.some(r => r.includes(x.who))).map(x => x.id);
            const u = await used('event', taken); assert.ok(taken.length >= 3 && taken.slice(0, 3).every(id => (u[id] || []).some(v => v.investigation_id === 1)), JSON.stringify(u));
            m.notes.push('la période « 1780-1800 » est comprise dans la recherche (avant : impossible) ; pastille « Naissances »');
        });
        await t('U2 · un acte + son image + une source, d’un coup → l’enquête ; ensuite « ✓ déjà dans l’enquête »', async m => {
            await openTake();
            await C(`${D} [data-cx-tab="act"]`); await shown('act');
            await check(L(`${D} .cx-rlist li`, {hasText: 'Acte de baptême · Jean MAZAUD'}).first().locator('input'));
            await C(`${D} [data-cx-tab="media"]`); await F(`${D} [data-cx-q]`, 'Registre de Treignac'); await shown('media', 'Registre de Treignac');
            await check(L(`${D} .cx-rlist li`, {hasText: 'Registre de Treignac'}).first().locator('input'));
            await C(`${D} [data-cx-tab="source"]`); await F(`${D} [data-cx-q]`, 'Treignac'); await shown('source', 'Treignac');
            await check(L(`${D} .cx-rlist li`, {hasText: 'Registres paroissiaux de Treignac'}).first().locator('input'));
            assert.match(await p.textContent(`${D} [data-cx-prev]`), /3 éléments choisis/);
            await C(`${D} [data-cx-takehere]`); await waitDelivered();
            assert.ok(((await used('act', [1]))[1] || []).some(v => v.investigation_id === 1), 'l’acte');
            assert.ok(((await used('media', [3]))[3] || []).some(v => v.investigation_id === 1), 'son image');
            assert.ok(((await used('source', [1]))[1] || []).some(v => v.investigation_id === 1), 'la source');
            await openTake(); await C(`${D} [data-cx-tab="act"]`); await shown('act');
            assert.match(await L(`${D} .cx-rlist li`, {hasText: 'Acte de baptême · Jean MAZAUD'}).first().innerText(), /déjà dans l’enquête/);
            await C(`${D} [data-cx-chip="notused"]`); await p.waitForFunction(() => /notused/.test(document.querySelector('.cx-take [data-cx-res]').dataset.cxShown));
            assert.strictEqual(await L(`${D} .cx-rlist li`, {hasText: 'Acte de baptême · Jean MAZAUD'}).count(), 0, '« Pas encore dans l’enquête » le cache');
            m.notes.push('3 rubriques, cases gardées d’une rubrique à l’autre ; « Pas encore dans l’enquête » filtre');
        });
        await t('U3 · « Dis ce qu’il te faut » : 6 façons de demander', async m => {
            const ask = q => p.evaluate(x => window.LCNDA_EXT.connexions.parseAsk(x, window.LCNDA_EXT.dataListsEngine.list()), q);
            const a = await ask('les décès à Tulle du 1er au 30 juin 1980'); assert.strictEqual(a.id, 'insee_deces'); assert.ok(a.preset.crit.some(c => c.kind === 'daterange' && c.from === '1980-06-01'));
            const b = await ask('chatteaux autour de 5 km de Treignac'); assert.strictEqual(b.id, 'chateaux', 'faute de frappe'); assert.strictEqual(b.preset.near?.km, 5); assert.match(b.preset.near.title, /Treignac/);
            const c = await ask('les gares du 19'); assert.strictEqual(c.id, 'hist_gares'); assert.ok(c.preset.crit.some(x => x.op === 'starts' && x.value === '19'), JSON.stringify(c.preset));
            const d = await ask('séismes en mars 1356'); assert.strictEqual(d.id, 'hist_seismes'); assert.ok(d.preset.crit.some(x => x.kind === 'daterange' && x.from === '1356-03-01' && x.to === '1356-03-31'), JSON.stringify(d.preset));
            const e = await ask('la comète de Donati'); assert.strictEqual(e.id, 'ciel_cometes'); assert.match(e.preset.q, /Donati/);
            const f = await ask('la gare de Saint-Amand-Montrond'); assert.strictEqual(f.id, 'hist_gares'); assert.match(f.preset.q, /Saint-Amand-Montrond/);
            // dans la fenêtre : « J'ai compris : … » et la liste ouverte avec ses critères
            await openTake(); await C(`${D} [data-cx-tab="lists"]`); await F(`${D} [data-cx-ask]`, 'la comète de Donati'); await K('Enter');
            await rowsOfList(); assert.match(await p.textContent(`${D} .cx-understood`), /J’ai compris : « la comète de Donati »/);
            assert.strictEqual(await L(`${D} [data-cx-lrows] .cx-rlist li`).count(), 1);
            m.notes.push('compris : typo « chatteaux », « autour de 5 km de », « du 19 », « en mars 1356 », un nom propre (Donati) → recherche dans la liste (corrigés ici)');
        });
        await t('U4 · Données : la météo du jour du mariage (Auch, 3 février 1978) et les cimetières autour de Treignac, « tout le tableau » → l’enquête', async m => {
            await openTake(); await C(`${D} [data-cx-tab="data"]`); await ds('meteo_jour');
            await p.waitForSelector(`${D} .pk[data-picker="place"]`);
            await setPlace('Auch');
            await F(`${D} [name="cx_date"]`, '1978-02-03'); await C(`${D} [data-cx-run]`);
            await p.waitForSelector(`${D} [data-cx-dres] li`, {timeout: 30000});
            await check(L(`${D} [data-cx-dres] li`, {hasText: 'Température la plus haute'}).first().locator('input'));
            await ds('commune_plus_cemeteries');
            await p.waitForSelector(`${D} .pk[data-picker="place"]`);
            await setPlace('Treignac');
            await C(`${D} [data-cx-run]`); await p.waitForSelector(`${D} [data-cx-dres] li:has-text("Tout le tableau")`, {timeout: 30000});
            assert.match(await p.textContent(`${D} [data-cx-dres]`), /carte/); assert.ok(!/https?:/.test(await p.textContent(`${D} [data-cx-dres]`)));
            await check(L(`${D} [data-cx-dres] li`, {hasText: 'Tout le tableau'}).first().locator('input'));
            assert.match(await p.textContent(`${D} [data-cx-n]`), /2 cochées/);
            await C(`${D} [data-cx-takehere]`); await waitDelivered();
            const ls = await linksOf();
            assert.ok(ls.some(l => /Température/.test(l.label + l.value) && l.origin?.url !== undefined), 'la météo, avec sa source');
            const set = ls.find(l => l.entity_type === 'set' && /Cimetières/.test(l.label)); assert.ok(set && set.data.rows.length === 2, 'les 2 cimetières en un tableau');
            m.notes.push('la date et le lieu se tapent (l’enquête ne les donne pas) ; liens « ↗ carte · ↗ itinéraire » au lieu d’adresses');
        });
        await t('U5 · une liste dans la fenêtre → la page Listes en grand → « Prendre les 3 cochées » → retour dans la fenêtre', async m => {
            await openTake(); await openList('ciel_cometes');
            for (let i = 0; i < 2; i++) await check(L(`${D} [data-cx-lrows] .cx-rlist li`).nth(i).locator('input'));
            await C(`${D} [data-cx-lfull]`); await p.waitForSelector('.cx-ltake [data-cx-ltake-sel]', {timeout: 20000});
            await p.waitForSelector('.ld-table [data-ld-ck][aria-checked="true"]'); // les cases de la liste (une seule sorte)
            await check(L('.ld-table tbody tr:not(.is-picked) [data-ld-ck]').first());
            assert.match(await p.textContent('.cx-ltake [data-cx-ltake-sel]'), /Prendre les 3 cochées/);
            const before = (await linksOf()).filter(l => l.entity_type === 'row').length;
            await C('.cx-ltake [data-cx-ltake-sel]');
            await p.waitForSelector(`${D}[open]`, {timeout: 20000});
            assert.strictEqual((await linksOf()).filter(l => l.entity_type === 'row').length, before + 3);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.module), 'enquetes');
            assert.match(await p.textContent(`${D} [data-cx-n]`), /Rien de coché/, 'les lignes prises ne restent pas cochées');
            m.notes.push('« Prendre les 3 cochées » range et ramène à l’enquête, fenêtre rouverte');
        });
        await t('U6 · De l’extérieur : un tableau collé, l’adresse d’un fichier, un PDF', async m => {
            await openTake(); await C(`${D} [data-cx-tab="outside"]`);
            await C(`${D} summary:has-text("Coller un tableau")`);
            await F(`${D} [data-cx-paste]`, 'Nom;Date du décès;Commune\nMAZAUD Jean;03/06/1859;Tulle\nLACOMBE Marie;20/06/1859;Tulle');
            await C(`${D} [data-cx-pastego]`); await p.waitForSelector(`${D} [data-cx-iall]`); await C(`${D} [data-cx-iall]`);
            await C(`${D} summary:has-text("L’adresse d’un fichier")`); await F(`${D} [data-cx-url]`, 'https://example.org/deces.csv'); await C(`${D} [data-cx-urlgo]`);
            await p.waitForFunction(() => /deces\.csv/.test(document.querySelector('.cx-take [data-cx-imp]')?.textContent || ''), null, {timeout: 15000});
            await C(`${D} [data-cx-iall]`);
            const hasUp = await p.evaluate(() => !!window.LCNDA_EXT.rtUploadCopy);
            if (hasUp) {
                await p.setInputFiles(`${D} [data-cx-media]`, {name: 'scan_0031.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')}); m.clicks++;
                await p.waitForFunction(() => /scan_0031\.pdf/.test(document.querySelector('.cx-take [data-cx-imp]')?.textContent || ''), null, {timeout: 15000}).catch(() => m.notes.push('PDF : pas pris par l’envoi de médias ici'));
            } else m.notes.push('envoi de médias absent : PDF non essayé');
            const n = Number((await p.textContent(`${D} [data-cx-n]`)).match(/\d+/)?.[0] || 0); assert.ok(n >= 2, n);
            await C(`${D} [data-cx-takehere]`); await waitDelivered();
            assert.ok((await linksOf()).some(l => l.entity_type === 'set' && /deces\.csv/.test(l.label)));
        });
        await t('U7 · le panier : garder pour plus tard, fermer, rouvrir, prendre depuis le panier', async m => {
            await clearBasket();
            await openTake(); await C(`${D} [data-cx-tab="place"]`); await F(`${D} [data-cx-q]`, 'Treignac'); await shown('place', 'Treignac');
            await check(L(`${D} .cx-rlist li`).first().locator('input'));
            await C(`${D} [data-cx-tab="note"]`); await shown('note');
            await check(L(`${D} .cx-rlist li`, {hasText: 'moulin'}).first().locator('input'));
            await C(`${D} [data-cx-tobasket]`); await sleep(800);
            assert.strictEqual((await basket()).items.length, 2);
            await openTake(); assert.strictEqual(await p.getAttribute(`${D} [data-cx-tab="basket"]`, 'aria-selected'), 'true', 'la fenêtre s’ouvre sur le panier quand il n’est pas vide');
            await shown('basket'); for (let i = 0; i < 2; i++) await check(L(`${D} .cx-rlist li`).nth(i).locator('input'));
            await C(`${D} [data-cx-takehere]`); await waitDelivered();
            assert.strictEqual((await basket()).items.length, 0, 'pris du panier = sorti du panier');
        });
        await t('U8 · au clavier seulement (Tab, flèches, Espace, Entrée, Échap) ; les noms lus à voix haute', async m => {
            await openTake();
            await p.focus(`${D} [data-cx-tab][aria-selected="true"]`);
            await p.focus(`${D} [data-cx-tab="person"]`); await K('ArrowDown'); // → Événements
            assert.strictEqual(await p.getAttribute(`${D} [data-cx-tab="event"]`, 'aria-selected'), 'true');
            await p.focus(`${D} [data-cx-q]`); await p.keyboard.type('MAZAUD'); m.clicks++; await shown('event', 'MAZAUD');
            await K('ArrowDown'); assert.ok(await p.evaluate(() => document.activeElement.matches('.cx-take .cx-rt')));
            await K('Space'); await K('ArrowDown'); await K('Space');
            assert.match(await p.textContent(`${D} [data-cx-n]`), /2 cochées/);
            assert.ok(await p.evaluate(() => document.activeElement.closest('li').classList.contains('is-focus')), 'la ligne en cours est montrée à droite');
            const names = await p.evaluate(() => ({cb: document.querySelector('.cx-take .cx-rlist [data-cx-ri]').getAttribute('aria-label'), gut: document.querySelector('.cx-take [data-cx-gut]').getAttribute('aria-label'), rail: document.querySelector('.cx-take .cx-rail').getAttribute('aria-label'), h: document.querySelector('.cx-take').getAttribute('aria-labelledby')}));
            assert.match(names.cb, /^Prendre « .*MAZAUD/); assert.ok(names.gut && names.rail && names.h, JSON.stringify(names));
            await p.focus(`${D} [data-cx-takehere]`); await K('Enter'); await waitDelivered();
            await openTake(); await K('Escape'); await p.waitForFunction(() => !document.querySelector('.cx-take[open]'));
        });
        await t('U9 · téléphone 390 px : de bout en bout', async m => {
            await p.setViewportSize({width: 390, height: 800}); await sleep(300);
            try {
                await openTake(); await C(`${D} [data-cx-quoi]`); await C(`${D} [data-cx-tab="event"]`);
                await F(`${D} [data-cx-q]`, 'LACOMBE Chamberet'); await shown('event', 'LACOMBE Chamberet');
                for (let i = 0; i < 2; i++) await check(L(`${D} .cx-rlist li`).nth(i).locator('input'));
                assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390 && document.querySelector('.cx-take').scrollWidth <= 390));
                const r = await p.evaluate(() => document.querySelector('.cx-take [data-cx-takehere]').getBoundingClientRect()); assert.ok(r.bottom <= 800 && r.width > 300, JSON.stringify(r));
                await C(`${D} [data-cx-takehere]`); await waitDelivered();
            } finally { await p.setViewportSize({width: 1440, height: 900}); }
        });
        await t('U10 · chaos : double-clic sur « Prendre », fermer pendant le chargement, 5 000 événements (recherche rapide)', async m => {
            await openTake(); await C(`${D} [data-cx-tab="place"]`); await F(`${D} [data-cx-q]`, 'Eymoutiers'); await shown('place', 'Eymoutiers');
            await check(L(`${D} .cx-rlist li`, {hasText: 'Eymoutiers'}).first().locator('input'));
            const before = (await inv()).items.length;
            await p.dblclick(`${D} [data-cx-takehere]`); m.clicks++; await waitDelivered(); await sleep(600);
            assert.strictEqual((await inv()).items.length, before + 1, 'une seule piste créée');
            await openTake(); await C(`${D} [data-cx-tab="media"]`); await K('Escape'); await sleep(800); // fermé pendant le chargement
            const t0 = Date.now(); const r = await B.api('picker_search', {kind: 'event', q: 'Tulle', limit: 100}); const ms = Date.now() - t0;
            assert.ok(r.groups[0].total >= 5000, r.groups[0].total); assert.ok(ms < 300, `recherche serveur : ${ms} ms`);
            await openTake(); await C(`${D} [data-cx-tab="event"]`);
            const t1 = Date.now(); await F(`${D} [data-cx-q]`, 'Tulle'); await shown('event', 'Tulle'); const ui = Date.now() - t1;
            assert.ok(ui < 1500, `affiché en ${ui} ms`);
            await p.evaluate(() => { const r2 = document.querySelector('.cx-take [data-cx-res]'); r2.scrollTop = r2.scrollHeight; });
            m.notes.push(`5 000 événements : serveur ${ms} ms, à l’écran ${ui} ms (avec 200 ms d’attente de frappe) ; 100 premiers + « précise la recherche »`);
            assert.match(await p.textContent(`${D} [data-cx-res]`), /Les 100 premiers seulement/);
        });
        const pack = B.hasPack;
        await t('S1 · une gare précise (« Saint-Amand ») depuis « Gares et ouverture du train » → l’enquête, avec titre, année, source et lien', async m => {
            if (!pack || !(await hasList('hist_gares'))) { m.notes.push('sauté : pas de pack Histoire du lieu'); return; }
            await openTake(); await openList('hist_gares'); await listQ('Saint-Amand-Montrond');
            const li = L(`${D} [data-cx-lrows] .cx-rlist li`).first(); await C(`${D} [data-cx-lrows] .cx-rlist li .cx-rt`);
            assert.match(await p.textContent(`${D} [data-cx-prev]`), /Gare/);
            await check(li.locator('input')); await C(`${D} [data-cx-takehere]`); await waitDelivered();
            const l = (await linksOf()).find(x => x.entity_type === 'row' && /Saint-Amand/.test(x.label));
            assert.ok(l && /Gares/.test(l.origin.label) && /Wikidata/.test(l.origin.label) && /^https?:/.test(l.origin.url || ''), JSON.stringify(l));
        });
        await t('S2 · la comète de Donati : en entier au panier, puis seulement son année (« Prendre seulement une info »)', async m => {
            await clearBasket();
            await openTake(); await openList('ciel_cometes'); await listQ('Donati');
            await C(`${D} [data-cx-lrows] .cx-rlist li .cx-rt`);
            const part = L(`${D} [data-cx-prev] .cx-parts li`, {hasText: /1858/}).first(); await check(part.locator('input'));
            await check(L(`${D} [data-cx-lrows] .cx-rlist li`).first().locator('input'));
            await C(`${D} [data-cx-tobasket]`); await sleep(800);
            const b = (await basket()).items;
            assert.ok(b.some(x => x.kind === 'row' && /Donati/.test(x.title) && /Wikipédia/.test(x.origin?.label || '')), 'la ligne entière');
            assert.ok(b.some(x => x.kind === 'datum' && /1858/.test(x.value) && /Donati/.test(x.title)), 'seulement l’année');
        });
        await t('S3 · un mélange de listes différentes d’un coup : une comète + 2 cimetières + la météo du mariage (+ une gare) → le panier, puis l’enquête', async m => {
            await clearBasket();
            await openTake(); await openList('ciel_cometes'); await listQ('Halley'); await check(L(`${D} [data-cx-lrows] .cx-rlist li`).first().locator('input'));
            if (pack && await hasList('hist_gares')) { await C(`${D} [data-cx-lback]`); await C(`${D} [data-cx-list="hist_gares"]`); await rowsOfList(); await listQ('Treignac'); await check(L(`${D} [data-cx-lrows] .cx-rlist li`).first().locator('input')); }
            await C(`${D} [data-cx-tab="data"]`); await ds('commune_plus_cemeteries');
            await setPlace('Treignac');
            await C(`${D} [data-cx-run]`); await p.waitForSelector(`${D} [data-cx-dres] li:has-text("Mas-Vieux")`, {timeout: 30000});
            await check(L(`${D} [data-cx-dres] li`, {hasText: 'Cimetière de Treignac'}).first().locator('input')); await check(L(`${D} [data-cx-dres] li`, {hasText: 'Mas-Vieux'}).first().locator('input'));
            await ds('meteo_jour');
            await setPlace('Auch');
            await F(`${D} [name="cx_date"]`, '1978-02-03'); await C(`${D} [data-cx-run]`); await p.waitForSelector(`${D} [data-cx-dres] li:has-text("Température la plus haute")`, {timeout: 30000});
            await check(L(`${D} [data-cx-dres] li`, {hasText: 'Température la plus haute'}).first().locator('input'));
            const want = pack ? 5 : 4;
            assert.match(await p.textContent(`${D} [data-cx-prev]`), new RegExp(`${want} éléments choisis`));
            const icons = await p.$$eval(`${D} .cx-sum li > span:first-child`, a => a.map(x => x.textContent));
            assert.ok(new Set(icons).size >= 2, 'des icônes différentes : ' + icons.join(' '));
            await C(`${D} [data-cx-tobasket]`); await sleep(1000);
            const b = (await basket()).items; assert.strictEqual(b.length, want);
            assert.ok(b.every(x => x.origin?.label), 'chacun garde sa source'); assert.ok(b.some(x => /OpenStreetMap|Cimetières/.test(x.origin.label)) && b.some(x => /Wikipédia/.test(x.origin.label)));
            await openTake(); await shown('basket'); for (let i = 0; i < want; i++) await check(L(`${D} .cx-rlist li`).nth(i).locator('input'));
            await C(`${D} [data-cx-takehere]`); await waitDelivered();
            assert.strictEqual((await basket()).items.length, 0);
            const ls = await linksOf(); assert.ok(ls.some(l => /comète/.test(l.label) && /Halley/.test(l.value)) && ls.some(l => /Mas-Vieux/.test(l.label)), "la comète et les cimetières");
        });
        await t('S4 · le doublon : la même comète une 2e fois → « ✓ déjà dans l’enquête »', async m => {
            await openTake(); await openList('ciel_cometes'); await listQ('Halley');
            assert.match(await L(`${D} [data-cx-lrows] .cx-rlist li`).first().innerText(), /déjà dans l’enquête/);
        });
        await t('S5 · trouver vite dans une liste (« Donati », « gare Saint-Amand » demandé en français)', async m => {
            await openTake(); await C(`${D} [data-cx-tab="lists"]`); await F(`${D} [data-cx-ask]`, 'comete donati'); await K('Enter'); await rowsOfList();
            assert.strictEqual(await L(`${D} [data-cx-lrows] .cx-rlist li`).count(), 1);
            if (pack && await hasList('hist_gares')) { await C(`${D} [data-cx-lback]`); await F(`${D} [data-cx-ask]`, 'la gare de Saint-Amand-Montrond'); await K('Enter'); await rowsOfList();
                assert.match(await p.textContent(`${D} [data-cx-lrows]`), /Saint-Amand/); }
            m.notes.push(`${m.clicks} gestes pour trouver une ligne précise`);
        });
        // 🚂 « la date d'ouverture de la gare de Vulaines-sur-Seine–Samoreau, et l'envoyer quelque part » (3 chemins ; sans le pack : une ligne FABRIQUÉE)
        if (!pack) {
            const ROW = {name: 'Vulaines-sur-Seine - Samoreau', year: 1897, code: '77533', source: 'Wikidata', lat: 48.43055, lon: 2.75302};
            await B.ctx.route(/api\.php\?action=ld_status/, r => r.fulfill({contentType: 'application/json', body: JSON.stringify({installed: {hist_gares: true}})}));
            await B.ctx.route(/api\.php\?action=ld_query/, r => { const u = new URL(r.request().url()); let q = {}; try { q = JSON.parse(u.searchParams.get('query') || '{}'); } catch (_) {}
                const ok = !q.q || /vulaines|samoreau/i.test(q.q); r.fulfill({contentType: 'application/json', body: JSON.stringify({rows: ok ? [ROW] : [], total: ok ? 1 : 0})}); });
            await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.connexions && window.LCNDA_EXT?.dataListsEngine, null, {timeout: 60000});
        }
        const gareRow = () => L('.ld-table tbody tr', {hasText: 'Vulaines-sur-Seine - Samoreau'}).filter({hasText: /18\d\d/}).first();
        const yearCell = async () => { const tr = gareRow(); await tr.waitFor({timeout: 30000}); const n = await tr.locator('td').count(); for (let i = 0; i < n; i++) if (/^\s*18\d\d\s*$/.test(await tr.locator('td').nth(i).innerText())) return tr.locator('td').nth(i); throw new Error('pas de case « Ouverture »'); };
        const isGare = x => /Vulaines-sur-Seine - Samoreau/.test(x.title) && /^Ouverture : 18\d\d$/.test(x.value) && /Gares et ouverture du train/.test(x.origin?.label || '') && /ODbL|CC0/.test(x.origin?.label || '') && /^https?:/.test(x.origin?.url || '');
        await t('G1 · gare de Vulaines (a) : page Listes → chercher « vulaines » → clic sur l’année → « Mettre « Ouverture : 1897 » dans… » → le panier (≤ 4 gestes)', async m => {
            await clearBasket(); await p.evaluate(() => localStorage.setItem('genealogie-cx-put-recents', JSON.stringify(['basket'])));
            await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('hist_gares', {q: '', crit: [], period: null, near: null}));
            await p.waitForSelector('.ld-page[data-ld-page="hist_gares"] [data-ld-q]', {timeout: 30000});
            m.clicks = 0; const t0 = Date.now();
            await F('[data-ld-q]', 'vulaines'); const cell = await yearCell(); await cell.click(); m.clicks++;
            await C('.ui-actmenu button:has-text("Mettre « Ouverture")'); await p.waitForSelector('.cx-put[open] [data-cx-dest="basket"].is-on');
            await C('.cx-put [data-cx-putgo]'); await sleep(800);
            const b = (await basket()).items; assert.ok(b.some(isGare), JSON.stringify(b).slice(0, 400));
            assert.ok(m.clicks <= 4, m.clicks + ' gestes'); m.notes.push(`${m.clicks} gestes, ${((Date.now() - t0) / 1000).toFixed(1)} s ; clic droit sur la ligne : chaque info proposée`);
            await cell.click({button: 'right'}); await p.waitForSelector('.ui-actmenu'); assert.match(await p.textContent('.ui-actmenu'), /Prendre seulement « Code Insee : 77533 »/); await p.keyboard.press('Escape');
        });
        await t('G2 · gare de Vulaines (b) : depuis l’enquête, « Prendre depuis… » → Listes → Gares → « vulaines » → la ligne → seulement « Ouverture » → Prendre', async m => {
            await openTake(); m.clicks = 0;
            await openList('hist_gares'); await listQ('vulaines');
            await C(`${D} [data-cx-lrows] .cx-rlist li:has-text("Vulaines-sur-Seine - Samoreau") .cx-rt >> nth=0`);
            const part = L(`${D} [data-cx-prev] .cx-parts li`, {hasText: /Ouverture/}).first(); await check(part.locator('input'));
            await C(`${D} [data-cx-takehere]`); await waitDelivered();
            const l = (await linksOf()).find(x => /Vulaines/.test(x.label) && /ouverture/i.test(x.label + x.value)); assert.ok(l && /18\d\d/.test(l.value) && /Gares/.test(l.origin?.label || ''), JSON.stringify(l));
            m.notes.push(`${m.clicks} gestes`);
        });
        await t('G3 · gare de Vulaines (c) : « 🧺 Prendre « Ouverture : 1897 » » sur la page, puis plus tard, sur l’enquête : 🧺 → « Mettre dans… » → l’enquête', async m => {
            await clearBasket(); await closeAll();
            await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('hist_gares', {q: 'vulaines', crit: [], period: null, near: null}));
            m.clicks = 0; const cell = await yearCell(); await cell.click(); m.clicks++; await C('.ui-actmenu button:has-text("Prendre « Ouverture")'); await sleep(800);
            assert.ok((await basket()).items.some(isGare));
            await B.openInv(1); await p.waitForSelector('#cx-pill:not([hidden])'); await C('#cx-pill'); await C('.cx-panel [data-cx-put]');
            await p.waitForSelector('.cx-put[open] [data-cx-here="1"].is-on'); await C('.cx-put [data-cx-putgo]'); await sleep(1500);
            assert.ok((await linksOf()).some(l => /Vulaines/.test(l.label) && /Ouverture/.test(l.value))); assert.strictEqual((await basket()).items.length, 0);
            m.notes.push(`${m.clicks} gestes en tout (2 sur la liste, 3 plus tard)`);
        });
        await t('G4 · 📎 depuis une piste : « /gare vulaines » puis Entrée → « … — ouverture : 18xx [↗ …] » au curseur, la source gardée dans la piste', async m => {
            await closeAll(); await B.openInv(1); await p.click('[data-edit-investigation-item="1"]'); await p.waitForSelector('#investigation-item-dialog[open] textarea[name="notes"]');
            await p.fill('#investigation-item-dialog textarea[name="notes"]', ''); await p.focus('#investigation-item-dialog textarea[name="notes"]'); m.clicks = 0;
            await p.keyboard.type('/gare vulaines'); m.clicks += 1; // la frappe compte pour 1
            await p.waitForFunction(() => /Samoreau/.test(document.querySelector('.cx-qi .cx-qi-r.is-on')?.textContent || '') && /Ouverture/.test(document.querySelector('.cx-qi .cx-qi-r.is-on .cx-qi-ch button.is-on')?.textContent || ''), null, {timeout: 20000});
            await K('Enter');
            assert.match(await p.inputValue('#investigation-item-dialog textarea[name="notes"]'), /^Gare Vulaines-sur-Seine - Samoreau — ouverture : 18\d\d \[↗ /);
            await sleep(1200); assert.ok(((await inv()).items.find(i => i.id === 1).links || []).some(l => /Vulaines/.test(l.label) && /Ouverture : 18\d\d/.test(l.value)));
            m.notes.push(`la frappe + ${m.clicks - 1} touche`);
            await p.keyboard.press('Escape'); await closeAll();
        });
        await t('G5 · 📎 depuis une note de l’Atelier : 5 infos mises de côté dans un nouveau panier (Maj+Entrée), puis dans une piste de l’enquête : en insérer 2', async m => {
            await closeAll(); await B.go('enquetes', {enquetesTab: 'atelier', currentInvestigationId: 0});
            await p.evaluate(() => window.LCNDA_EXT.openDialog({title: 'Note de l’Atelier', body: '<textarea name="t" rows="6" style="width:100%"></textarea>', submitLabel: 'OK', onSubmit: () => true}));
            await p.waitForSelector('dialog[open] textarea[name="t"]'); await p.focus('dialog[open] textarea[name="t"]'); m.clicks = 0;
            await p.keyboard.type('/'); m.clicks++; await p.waitForSelector('.cx-qi [data-qi-bnew]');
            await C('.cx-qi [data-qi-bnew]'); await p.keyboard.type('Pièces du mariage'); m.clicks++; await K('Enter');
            await p.waitForFunction(() => /Pièces du mariage/.test(document.querySelector('.cx-qi [data-qi-bk]')?.textContent || ''), null, {timeout: 10000});
            const grab = async (q, re) => { await p.fill('.cx-qi [data-qi-q]', q); m.clicks++; await p.waitForFunction(x => new RegExp(x).test(document.querySelector('.cx-qi .cx-qi-r.is-on')?.textContent || ''), re, {timeout: 20000}); await K('Shift+Enter'); await p.waitForFunction(n => new RegExp(`${n} mis de côté`).test(document.querySelector('.cx-qi [data-qi-bk]')?.textContent || ''), String(grab.n = (grab.n || 0) + 1), {timeout: 10000}); };
            await grab('gare vulaines', 'Samoreau'); await grab('Treignac', 'Treignac'); await grab('Registres paroissiaux de Treignac', 'Registres'); await grab('Acte de baptême', 'baptême'); await grab('Eymoutiers', 'Eymoutiers');
            const b = (await B.api('cx_basket', {all: 1})); const bk = b.baskets.find(x => x.name === 'Pièces du mariage'); assert.ok(bk && bk.count === 5, JSON.stringify(bk));
            m.notes.push(`5 infos en ${m.clicks} gestes (sans quitter la note)`);
            await K('Escape'); await closeAll();
            await B.openInv(1); await p.click('[data-edit-investigation-item="1"]'); await p.waitForSelector('#investigation-item-dialog[open] textarea[name="notes"]');
            await p.fill('#investigation-item-dialog textarea[name="notes"]', ''); await p.focus('#investigation-item-dialog textarea[name="notes"]');
            for (const [q, re] of [['Eymoutiers', 'Eymoutiers'], ['baptême', 'baptême']]) { await p.keyboard.type('/'); await p.waitForSelector('.cx-qi'); await p.keyboard.type(q); await p.waitForFunction(x => new RegExp(x).test(document.querySelector('.cx-qi .cx-qi-r.is-on')?.textContent || ''), re, {timeout: 20000}); await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); }
            const v = await p.inputValue('#investigation-item-dialog textarea[name="notes"]'); assert.match(v, /Eymoutiers/); assert.match(v, /baptême/);
            await closeAll(); await p.evaluate(() => { localStorage.removeItem('genealogie-connexions-panier'); return window.LCNDA_EXT.connexions.refresh(); }); // le panier par défaut, pour la suite
        });
        await t('L1 · page d’une liste : les cases de la liste, 2 sur 5, Maj+clic pour une suite, « Prendre… » propose « les 2 cochées » ou « les 5 trouvées »', async m => {
            await clearBasket();
            await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('ciel_cometes', {q: 'comète', crit: [], period: {mode: 'overlap', from: 1800, to: 1910}, near: null}));
            await p.waitForSelector('.ld-page[data-ld-page="ciel_cometes"] [data-ld-take]', {timeout: 20000}); await p.waitForSelector('.ld-table tbody tr');
            assert.strictEqual(await L('.ld-table .cx-ldck').count(), 0, 'une seule sorte de cases (celles de la liste)'); assert.strictEqual(await L('[data-ld-choose]').count(), 0);
            const n = await L('.ld-table tbody tr').count(); assert.ok(n >= 4, n + ' lignes');
            const bx = i => L('.ld-table tbody tr').nth(i).locator('[data-ld-ck]');
            await bx(0).click(); await bx(2).click(); m.clicks += 2;
            assert.match(await p.textContent('.ldc-bar [data-ldc-n]'), /2 lignes cochées/);
            await bx(3).click({modifiers: ['Shift']}); m.clicks++;
            assert.match(await p.textContent('.ldc-bar [data-ldc-n]'), /3 lignes cochées/, 'Maj+clic : de la 3e à la 4e');
            await bx(3).click(); await bx(2).click(); m.clicks += 2;
            assert.match(await p.textContent('.ldc-bar [data-ldc-n]'), /1 ligne cochée/);
            await bx(1).click(); m.clicks++;
            await p.click('.ld-sort >> nth=1'); await p.waitForSelector('.ld-table tbody [data-ld-ck]'); m.clicks++;
            assert.strictEqual(await L('.ld-table tbody [data-ld-ck][aria-checked="true"]').count(), 2, 'les cases tiennent après un tri');
            await C('[data-ld-take]'); await p.waitForSelector('.ui-actmenu');
            const menu = await p.textContent('.ui-actmenu'); assert.match(menu, /Les 2 cochées au panier/); assert.match(menu, /Tout au panier, comme un ensemble \(\d+ lignes\)/);
            await C('.ui-actmenu button:has-text("Les 2 cochées au panier, comme un ensemble")'); await sleep(800);
            const s = (await basket()).items.find(x => x.kind === 'set'); assert.ok(s && s.data.rows.length === 2 && /2 lignes choisies/.test(s.title), JSON.stringify(s?.title));
        });
        await t('L2 · … « Mettre les 2 cochées dans… » : l’en-tête dit « 2 lignes », « Comment ? » en deux cartes', async m => {
            await C('[data-ld-take]'); await C('.ui-actmenu button:has-text("Mettre les 2 cochées dans")');
            await p.waitForSelector('.cx-put[open]');
            assert.match(await p.textContent('.cx-put h2'), /Mettre « Grandes comètes et aurores » \(2 lignes\) dans…/);
            assert.strictEqual(await L('.cx-put .cx-how').count(), 2);
            await C('.cx-put .cx-how:has-text("Une ligne = un élément")'); await C('.cx-put [data-cx-dest="basket"]');
            assert.match(await p.textContent('.cx-put [data-cx-putsay]'), /2 éléments/);
            await C('.cx-put [data-cx-putgo]'); await sleep(800);
            await C('[data-ldc-x]'); assert.ok(await p.isHidden('.ldc-bar'), '✕ Décocher : plus rien de coché');
        });
        await t('L3 · une longue liste (24 comètes) : « Les 20 premières » et « De la ligne 10 à 20 », dans l’ordre affiché', async m => {
            await clearBasket();
            // une liste de plus de 20 lignes (les comètes : 24 ; légère, livrée avec l'app), triée par nom
            await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('ciel_cometes', {q: '', crit: [], period: null, near: null, sort: 'name', dir: 'asc'}));
            await p.waitForSelector('.ld-page[data-ld-page="ciel_cometes"] [data-ld-take]', {timeout: 30000}); await p.waitForSelector('.ld-table tbody tr', {timeout: 30000});
            await C('[data-ld-take]'); await C('.ui-actmenu button:has-text("Les 20 premières")'); await sleep(1500);
            let s = (await basket()).items.find(x => x.kind === 'set'); assert.ok(s && s.data.rows.length === 20 && /lignes 1 à 20/.test(s.title), s?.title);
            const first = await p.textContent('.ld-table tbody tr td:not(.cx-ldck)'); // la 1re case de la ligne (une seule sorte de cases : plus de colonne à part) assert.strictEqual(String(s.data.rows[0][0]).trim(), first.trim(), 'dans l’ordre affiché');
            await clearBasket();
            await C('[data-ld-take]'); await C('.ui-actmenu button:has-text("De la ligne")');
            await p.waitForSelector('dialog[open] input[name="v"]'); await F('dialog[open] input[name="v"]', '10-20'); await K('Enter'); await sleep(1500);
            s = (await basket()).items.find(x => x.kind === 'set'); assert.ok(s && s.data.rows.length === 11 && /lignes 10 à 20/.test(s.title), s?.title);
            await clearBasket();
        });
        await t('M1 · « Mettre dans… » : une seule loupe, groupes, « ce que ça donne », la dernière destination retenue, 390 px, sombre', async m => {
            await p.evaluate(() => window.LCNDA_EXT.connexions.putInto([{kind: 'datum', title: 'Naissance — date', value: '12 mars 1785'}]));
            await p.waitForSelector('.cx-put[open]');
            assert.match(await p.textContent('.cx-put h2'), /Mettre « Naissance — date » dans…/);
            assert.strictEqual(await L('.cx-put .cx-how').count(), 0, '« Comment ? » seulement pour un ensemble');
            assert.ok(!/🔍|🔎/.test(await p.getAttribute('.cx-put [data-cx-dq]', 'placeholder')));
            const sects = await p.$$eval('.cx-put h4.cx-sect', a => a.map(x => x.textContent)); assert.ok(sects.includes('Récemment utilisées') && sects.some(x => /Ma recherche/.test(x)) && sects.includes('Écrire et montrer') && sects.includes('Ranger'), sects.join('|'));
            assert.match(await p.textContent('.cx-put [data-cx-dest="basket"]'), /Ça donne/);
            assert.strictEqual(await p.getAttribute('.cx-put [data-cx-dest].is-on', 'data-cx-dest'), 'basket', 'la dernière (le panier, L2) est déjà choisie');
            await F('.cx-put [data-cx-dq]', 'livre'); assert.strictEqual(await L('.cx-put [data-cx-dest]:visible').count(), 1);
            await K('Enter'); assert.match(await p.textContent('.cx-put [data-cx-putgo]'), /Mettre dans Le Livre de famille/);
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            const bg = await p.evaluate(() => getComputedStyle(document.querySelector('.cx-put')).backgroundColor); assert.ok(/28, 31, 36/.test(bg), bg);
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
            await p.setViewportSize({width: 390, height: 800}); await sleep(200);
            assert.ok(await p.evaluate(() => document.querySelector('.cx-put').getBoundingClientRect().right <= 390 && document.documentElement.scrollWidth <= 390));
            await p.setViewportSize({width: 1440, height: 900});
            await K('Escape');
        });
        await t('U10b · base vide (une seule fiche) : chaque rubrique dit pourquoi c’est vide et quoi faire', async m => {
            const E = await start({empty: true});
            try {
                await E.page.evaluate(() => window.LCNDA_EXT.connexions.openTake()); await E.page.waitForSelector(`${D}[open]`);
                for (const k of ['event', 'act', 'media', 'source', 'note', 'place', 'recent', 'basket']) {
                    await E.page.click(`${D} [data-cx-tab="${k}"]`); await E.page.waitForFunction(x => (document.querySelector('.cx-take [data-cx-res]')?.dataset.cxShown || '').startsWith(x + '|'), k, {timeout: 15000});
                    assert.ok(await E.page.locator(`${D} .cx-empty .cx-empty-row button`).count(), k);
                }
                assert.deepStrictEqual(E.errs, []);
            } finally { await E.stop(); }
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log('\n── Résumé (clics/frappes, temps, remarques) ──\n' + report.join('\n'));
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
