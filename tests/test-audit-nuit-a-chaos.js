#!/usr/bin/env node
/* 🌀 Audit de nuit A — l'utilisateur chaotique : paniers, 📁 dossiers, onglet Paniers, « Prendre depuis… », « 📎 Insérer une info », « ＋ Mes listes ».
 *  1. double clics / courses : six « Tout au panier » identiques en même temps (un seul élément, aucune erreur « database is locked »),
 *     six « Nouveau panier » en même temps, deux imports du même fichier .lcnda-panier, un double clic sur « 📥 Prendre » ;
 *  2. entrées absurdes : chaque opération reçoit n'importe quoi (tableaux, nombres énormes, textes de 3 000 « é », NUL) → 200 ou 422, jamais 500 / 502 ;
 *  3. beaucoup : 10 000 paniers, 1 000 dossiers (dont une chaîne de 200 niveaux), 30 000 éléments → l'onglet Paniers et « Prendre depuis… » s'ouvrent ;
 *     une liste de 100 000 lignes collée (5 Mo) → enregistrée, rouverte ;
 *  4. clavier seul dans l'onglet Paniers ; 390 px et thème sombre (Mes listes, « Prendre depuis… », « Insérer une info ») : rien ne déborde ;
 *  5. en anglais : l'historique d'un panier et les noms par défaut écrits par le serveur ne restent pas en français ;
 *  6. aucune erreur JavaScript.
 *   node tests/test-audit-nuit-a-chaos.js */
'use strict';
const assert = require('assert');
const path = require('path');
const {spawnSync} = require('child_process');
const {start, sleep} = require('./prendre-depuis-seed.js');
const {detect} = require('./test-rien-de-colle.js');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const root = path.join(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]) || 'php';
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: B.tmp, GENEALOGY_SKIP_REFERENCE: '1'}, timeout: 120000}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const cx = (op, body = {}) => p.evaluate(([o, b]) => window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: o, ...b}}).then(r => r?.result ?? r), [op, body]);
    /** plusieurs requêtes EN MÊME TEMPS (comme un double clic, deux onglets) → [{status, text}] */
    const burst = (action, bodies) => p.evaluate(async ([a, bs]) => Promise.all(bs.map(b => fetch('api.php?action=' + a, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': window.LCNDA_APP.state.csrf}, body: JSON.stringify(b)}).then(async r => ({status: r.status, text: await r.text()})))), [action, bodies]);
    const closeAll = () => p.evaluate(() => { window.LCNDA_EXT.insertInfo?.close?.(); document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.cx-panel, .ui-actmenu').forEach(x => x.remove()); });
    try {
        /* ═════ 1. courses ═════ */
        await t('six « Tout au panier » identiques en même temps : un seul élément, aucune erreur (le verrou d’écriture est pris tout de suite)', async () => {
            const b = (await cx('basket_new', {name: 'Course'})).id;
            const item = {kind: 'datum', title: 'Moulin de Treignac', value: '1790'};
            const rs = await burst('cx_write', Array.from({length: 6}, () => ({op: 'basket_add', basket_id: b, items: [item, {kind: 'person', ref_id: 2, title: 'Pierre LACOMBE'}]})));
            assert.deepStrictEqual(rs.map(r => r.status), [200, 200, 200, 200, 200, 200], rs.map(r => r.text.slice(0, 120)).join('\n'));
            assert.strictEqual((await B.api('cx_basket', {basket_id: b})).items.length, 2, 'pas de doublon');
            // en même temps que d'autres écritures (une liste, une fiche reliée, l'historique)
            const mix = await Promise.all([burst('cx_write', Array.from({length: 4}, (_, i) => ({op: 'basket_add', basket_id: b, items: [{kind: 'datum', title: 'Info ' + i, value: String(i)}]}))),
                burst('cx_write', Array.from({length: 4}, (_, i) => ({op: 'pn_meta', basket_id: b, pinned: i % 2, log: 'épingle ' + i}))),
                burst('ulist_write', Array.from({length: 3}, (_, i) => ({op: 'create', name: 'Course ' + i, columns: [{key: 'a', label: 'A'}]})))]);
            const bad = mix.flat().filter(r => r.status !== 200); assert.deepStrictEqual(bad.map(r => r.text.slice(0, 160)), []);
        });
        await t('six « Nouveau panier » / « Nouveau dossier » en même temps ; deux imports du même .lcnda-panier dans le même panier : rien en double', async () => {
            const n0 = (await B.api('cx_basket', {})).baskets.length;
            const rs = await burst('cx_write', Array.from({length: 6}, (_, i) => (i % 2 ? {op: 'basket_new', name: 'Neuf ' + i} : {op: 'folder_new', name: 'Dossier ' + i})));
            assert.ok(rs.every(r => r.status === 200), rs.map(r => r.text.slice(0, 120)).join('\n'));
            assert.strictEqual((await B.api('cx_basket', {})).baskets.length, n0 + 6, '3 paniers + 3 dossiers (chacun avec son panier)');
            const into = (await cx('basket_new', {name: 'Import double'})).id;
            const file = JSON.stringify({format: 'lcnda-panier', version: 1, name: 'Partagé', items: Array.from({length: 30}, (_, i) => ({kind: 'datum', title: 'Ligne ' + i, value: String(i)}))});
            const ri = await burst('cx_write', [{op: 'pn_share_import', body: file, basket_id: into}, {op: 'pn_share_import', body: file, basket_id: into}]);
            assert.ok(ri.every(r => r.status === 200), ri.map(r => r.text.slice(0, 160)).join('\n'));
            assert.strictEqual((await B.api('cx_basket', {basket_id: into})).items.length, 30, 'pas de doublon');
        });
        await t('double clic sur « 📥 Prendre » dans « Prendre depuis… » : les pièces n’arrivent qu’une fois dans l’enquête', async () => {
            const count = async () => { const r = await B.api('investigation', {id: 1}); return (r.items || []).length + (r.items || []).reduce((n, i) => n + (i.links || []).length + (i.linked_event_id ? 1 : 0), 0); };
            const pick = async () => { await closeAll(); await B.openInv(1); await p.evaluate(() => window.LCNDA_EXT.connexions.openTake({tab: 'event'})); await p.waitForSelector('.cx-take [data-cx-q]');
                await p.fill('.cx-take [data-cx-q]', 'Treignac 1780-1800'); await p.waitForFunction(() => document.querySelectorAll('.cx-take [data-cx-res] .cx-rlist li input').length >= 3, null, {timeout: 20000}); await p.locator('.cx-take .cx-rlist li input').first().check(); };
            await pick(); const a0 = await count(); await p.click('.cx-take [data-cx-takehere]'); await p.waitForFunction(() => !document.querySelector('.cx-take[open]'), null, {timeout: 15000}); await sleep(1200);
            const one = (await count()) - a0;
            await pick(); await p.locator('.cx-take .cx-rlist li input').nth(1).check(); await p.locator('.cx-take .cx-rlist li input').first().uncheck();
            // ce qui part au serveur : une seule demande inv_receive (le bouton se bloque au premier clic)
            const sent = []; const spy = r => { if (/action=cx_write/.test(r.url()) && /"inv_receive"/.test(r.postData() || '')) sent.push(1); }; p.on('request', spy);
            await p.dblclick('.cx-take [data-cx-takehere]').catch(() => {}); await sleep(2500); p.off('request', spy);
            assert.strictEqual(sent.length, 1, `double clic : ${sent.length} envois`); assert.ok(one > 0);
        });

        /* ═════ 2. n'importe quoi ═════ */
        await t('n’importe quoi dans chaque opération (cx_write, pn_*, ulist_write, lp_write) et chaque lecture : 200 ou 422, jamais 500 / 502 ni avertissement PHP', async () => {
            const ops = ['basket_add', 'basket_remove', 'basket_restore', 'basket_new', 'basket_edit', 'basket_duplicate', 'item_set', 'item_order', 'basket_rename', 'basket_move', 'folder_new', 'folder_edit', 'folder_move', 'folder_delete', 'folder_undelete',
                'item_move', 'item_unmove', 'basket_undelete', 'inv_receive', 'item_link_remove', 'item_link_restore', 'link_add', 'link_remove', 'reminder_add', 'to_mylist', 'fetch_url',
                'pn_meta', 'pn_status', 'pn_status_set', 'pn_log', 'pn_undo', 'pn_create', 'pn_dup', 'pn_share_build', 'pn_share_preview', 'pn_share_import', 'pn_share_accounts', 'pn_share_send', 'op_inconnue'];
            const junk = [null, true, -1, 1e308, '9'.repeat(40), '', 'é'.repeat(3000), '\u0000', [], [[1]], {a: {b: 'c'}}, [{id: 'x'}], '<script>'];
            let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
            const keys = ['basket_id', 'ids', 'items', 'rows', 'name', 'icon', 'color', 'note', 'folder_id', 'dests', 'id', 'done', 'status', 'basket', 'folder', 'folders_removed', 'baskets_removed', 'mode', 'parent_id', 'before',
                'investigation_id', 'item_id', 'title', 'a_type', 'a_id', 'b_type', 'b_id', 'due', 'labels', 'cover', 'query', 'sort', 'live', 'view', 'log', 'label', 'undo', 'log_id', 'include', 'list', 'body', 'keep', 'account_id', 'url'];
            const bodies = []; for (const op of ops) for (let k = 0; k < 6; k++) { const b = {op}; for (const key of keys) if (rnd(4) === 0) b[key] = junk[rnd(junk.length)]; if (op === 'fetch_url') b.url = 'http://127.0.0.1/x'; bodies.push(b); }
            const out = [];
            for (let i = 0; i < bodies.length; i += 8) out.push(...(await burst('cx_write', bodies.slice(i, i + 8))).map((r, j) => ({...r, op: bodies[i + j].op})));
            const ul = []; for (const op of ['places', 'create', 'begin', 'append', 'commit', 'revert', 'abort', 'meta', 'add_rows', 'remove_batch', 'delete', 'restore']) for (let k = 0; k < 4; k++) { const b = {op}; for (const key of ['id', 'stage', 'rows', 'columns', 'name', 'icon', 'source_url', 'mode', 'batch', 'values']) if (rnd(3) === 0) b[key] = junk[rnd(junk.length)]; ul.push(b); }
            out.push(...(await burst('ulist_write', ul)).map((r, j) => ({...r, op: 'ulist ' + ul[j].op})));
            const lp = []; for (const op of ['link', 'reject', 'unlink', 'unreject', 'create', 'uncreate']) for (let k = 0; k < 4; k++) { const b = {op}; for (const key of ['id', 'person_id', 'list', 'row_key', 'first_name', 'event', 'gender', 'url']) if (rnd(3) === 0) b[key] = junk[rnd(junk.length)]; lp.push(b); }
            out.push(...(await burst('lp_write', lp)).map((r, j) => ({...r, op: 'lp ' + lp[j].op})));
            const reads = await p.evaluate(async () => { const qs = ['cx_basket&all[]=1&log[]=1', 'cx_links&a_type[]=x', 'cx_used&kind=event&ids[]=1', 'cx_search&q[]=a', 'cx_search&q=' + encodeURIComponent('"*) OR 1=1 --'), 'cx_notes&q=%25', 'cx_count&basket_id=-9', 'ulist_rows&id=1&offset=-5&limit=99999999', 'lp_links&list[]=x', 'cx_item_links&item_id=abc'];
                return Promise.all(qs.map(q => fetch('api.php?action=' + q).then(async r => ({status: r.status, text: await r.text(), op: q})))); });
            out.push(...reads);
            const bad = out.filter(r => !([200, 422].includes(r.status) || (r.op === 'fetch_url' && r.status === 502 && /Pas de réponse|Adresse refusée/.test(r.text))) || /Warning|Notice|Deprecated|Fatal|must be of type|Undefined/i.test(r.text.slice(0, 300)));
            assert.deepStrictEqual(bad.map(r => `${r.op} → ${r.status} ${r.text.slice(0, 200)}`), []);
            assert.ok((await B.api('cx_basket', {})).baskets.length > 0, 'il reste au moins un panier');
        });

        /* ═════ 3. beaucoup ═════ */
        await t('10 000 paniers, 1 000 dossiers (une chaîne de 200 niveaux), 30 000 éléments : l’onglet Paniers, « Prendre depuis… » et le menu des paniers s’ouvrent vite', async () => {
            php(String.raw`$p = new PDO('sqlite:' . getenv('GENEALOGY_DATA_DIR') . '/genealogy.sqlite'); $p->exec('PRAGMA busy_timeout=30000'); mt_srand(3); $p->beginTransaction();
$f = $p->prepare('INSERT INTO cx_folders(id,name,parent_id) VALUES(?,?,?)'); for ($i = 1; $i <= 1000; $i++) { $f->execute([100000 + $i, "Grand dossier $i", $i === 1 ? 0 : 100000 + ($i <= 200 ? $i - 1 : mt_rand(1, $i - 1))]); }
$b = $p->prepare('INSERT INTO cx_baskets(name, folder_id) VALUES(?,?)'); for ($i = 1; $i <= 10000; $i++) { $b->execute(["Grand panier $i", 100000 + mt_rand(1, 1000)]); }
$lo = (int) $p->query("SELECT min(id) FROM cx_baskets WHERE name LIKE 'Grand panier %'")->fetchColumn();
$it = $p->prepare("INSERT INTO cx_basket_items(basket_id, kind, title, value, position) VALUES(?, 'datum', ?, ?, ?)"); for ($i = 1; $i <= 30000; $i++) { $it->execute([$lo + mt_rand(0, 9999), "Grand élément $i", "valeur $i", $i]); }
$p->commit(); echo 'ok';`);
            let t0 = Date.now(); const r = await B.api('cx_basket', {}); const tApi = Date.now() - t0; assert.ok(r.baskets.length > 10000); assert.ok(tApi < 8000, `cx_basket : ${tApi} ms`);
            t0 = Date.now(); await closeAll(); await B.go('paniers'); await p.waitForSelector('[data-pn] [data-pn-tree] .pn-tr', {timeout: 60000}); const tTab = Date.now() - t0;
            assert.ok(tTab < 30000, `onglet Paniers : ${tTab} ms`);
            t0 = Date.now(); await p.evaluate(() => window.LCNDA_EXT.connexions.openTake({tab: 'basket'})); await p.waitForSelector('.cx-take [data-cx-ttree]', {timeout: 60000}); const tTake = Date.now() - t0;
            assert.ok(tTake < 30000, `« Prendre depuis… » panier : ${tTake} ms`);
            await closeAll();
            const deep = await p.evaluate(() => Math.max(...[...document.querySelectorAll('[data-pn-tree] .pn-tr')].map(e => e.getBoundingClientRect().left)));
            assert.ok(deep < 4000, 'la chaîne de 200 dossiers ne part pas à l’infini : ' + deep);
            console.log(`   (cx_basket ${tApi} ms · onglet ${tTab} ms · Prendre depuis… ${tTake} ms)`);
            php(String.raw`$p = new PDO('sqlite:' . getenv('GENEALOGY_DATA_DIR') . '/genealogy.sqlite'); $p->exec('PRAGMA busy_timeout=30000'); $p->exec("DELETE FROM cx_basket_items WHERE title LIKE 'Grand élément %'"); $p->exec("DELETE FROM cx_baskets WHERE name LIKE 'Grand panier %'"); $p->exec('DELETE FROM cx_folders WHERE id > 100000'); echo 'ok';`);
            await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.connexions && window.LCNDA_EXT?.listesPerso, null, {timeout: 60000});
        });
        await t('une liste de 100 000 lignes collée (5 Mo) : lue, comprise, enregistrée par paquets, rouverte, 100 000 lignes', async () => {
            const r = await p.evaluate(async () => {
                const L = window.LCNDA_EXT.listesPerso, lines = ['Nom\tCommune\tAnnée\tNote'];
                for (let i = 0; i < 100000; i++) lines.push(`Personne ${i} MAZAUD\tTulle\t${1700 + i % 300}\tune note assez longue pour faire le poids ${i}`);
                const text = lines.join('\n'); const t0 = performance.now();
                const v = await L.understand(await L.readInput({text})); const t1 = performance.now();
                const id = await L.save({name: 'Cent mille'}, v); const t2 = performance.now();
                return {mb: text.length / 1048576, rows: v.body.length, read: Math.round(t1 - t0), save: Math.round(t2 - t1), id};
            });
            assert.ok(r.mb > 5, r.mb + ' Mo'); assert.strictEqual(r.rows, 100000);
            assert.ok(r.read < 30000 && r.save < 120000, JSON.stringify(r));
            const meta = (await B.api('ulist_index', {})).lists.find(l => l.id === r.id); assert.strictEqual(meta.row_count, 100000);
            const t0 = Date.now(); await p.evaluate(i => window.LCNDA_EXT.listesPerso.open(i), r.id); await p.waitForSelector('.ld-table tbody tr[data-ld-row]', {timeout: 60000}); const tOpen = Date.now() - t0;
            assert.ok(tOpen < 60000, 'ouverture : ' + tOpen);
            console.log(`   (${r.mb.toFixed(1)} Mo lus en ${r.read} ms, enregistrés en ${r.save} ms, rouverte en ${tOpen} ms)`);
            await p.evaluate(i => window.LCNDA_APP.api('ulist_write', {}, {method: 'POST', body: {op: 'delete', id: i}}), r.id);
        });

        /* ═════ 4. clavier, 390 px, sombre ═════ */
        await t('clavier seul : dans l’onglet Paniers, Tab atteint l’arbre et Entrée ouvre un panier', async () => {
            await closeAll(); await B.go('paniers'); await p.waitForSelector('[data-pn] [data-pn-tree] .pn-tr[data-pn-b]', {timeout: 20000}); await sleep(400);
            const ok = await p.evaluate(() => [...document.querySelectorAll('[data-pn-tree] .pn-tr[data-pn-b]')].slice(0, 20).every(e => e.matches('button, a[href], [tabindex]') || e.querySelector('button, [tabindex]')));
            assert.ok(ok, 'les lignes de l’arbre se prennent au clavier');
            await p.focus('[data-pn] [data-pn-a="search"]'); for (let k = 0; k < 80 && !(await p.evaluate(() => !!document.activeElement?.closest('[data-pn-tree] .pn-tr[data-pn-b]'))); k++) await p.keyboard.press('Tab');
            assert.ok(await p.evaluate(() => !!document.activeElement?.closest('[data-pn-tree] .pn-tr[data-pn-b]')), 'Tab n’atteint pas l’arbre'); const name = await p.evaluate(() => document.activeElement.closest('.pn-tr')?.textContent || '');
            await p.keyboard.press('Enter'); await sleep(900);
            const shown = await p.evaluate(() => document.querySelector('[data-pn-main] .pn-bn')?.textContent || ''); assert.ok(shown && name.includes(shown.trim().slice(0, 8)), `${shown} / ${name}`);
            const ring = await p.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return s.outlineStyle !== 'none' || s.boxShadow !== 'none'; }); assert.ok(ring, 'on voit où est le focus');
        });
        await t('390 px et thème sombre : « ＋ Mes listes », « Prendre depuis… », « 📎 Insérer une info » — rien ne déborde, rien de collé, fond sombre', async () => {
            const page2 = await B.ctx.newPage(); const errs2 = []; page2.on('pageerror', e => errs2.push(e.message));
            await page2.setViewportSize({width: 390, height: 860});
            await page2.addInitScript(() => { const cur = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); localStorage.setItem('genealogie-design', JSON.stringify({...cur, preset: 'dark'})); });
            await page2.goto(B.base); await page2.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.connexions && window.LCNDA_EXT?.listesPerso && window.LCNDA_EXT?.insertInfo, null, {timeout: 60000});
            await page2.evaluate(() => window.LCNDA_APP.applyDesign?.()); assert.strictEqual(await page2.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
            const noSide = async what => { const w = await page2.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); assert.ok(w[0] <= w[1] + 1, `${what} : défilement de côté ${w}`); };
            const glued = async (sel, what) => { const f = await page2.evaluate(detect, {root: sel, min: 4}); assert.deepStrictEqual(f.map(x => `${what} : ${x.kind} « ${x.label} » ${x.bad.map(b => b.side + ' ' + b.gap + 'px').join(',')}`), []); };
            const dark = async (sel, what) => { const c = await page2.evaluate(s => { let e = document.querySelector(s); while (e && /rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(e).backgroundColor)) e = e.parentElement; const m = (getComputedStyle(e || document.body).backgroundColor.match(/\d+/g) || []).map(Number); return m.slice(0, 3).reduce((a, b) => a + b, 0) / 3; }, sel); assert.ok(c < 90, `${what} : fond clair en thème sombre (${c})`); };
            // Mes listes : la fenêtre « Créer ma liste »
            await page2.evaluate(() => window.LCNDA_EXT.listesPerso.create()); await page2.waitForSelector('[data-lpx-file]', {state: 'attached', timeout: 20000}); await sleep(600);
            const lpx = await page2.evaluate(() => { const e = document.querySelector('[data-lpx-file]').closest('section, .lpx-new, .card, #workspace > *') || document.querySelector('#workspace'); e.setAttribute('data-audit-lpx', ''); return true; });
            await noSide('Créer ma liste'); await glued('[data-audit-lpx]', 'Créer ma liste'); await dark('[data-audit-lpx]', 'Créer ma liste');
            await page2.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            // Prendre depuis… (sans enquête : le panier)
            await page2.evaluate(() => window.LCNDA_EXT.connexions.openTake({tab: 'basket'})); await page2.waitForSelector('.cx-take[open]', {timeout: 20000}); await sleep(600);
            await noSide('Prendre depuis…'); await dark('.cx-take[open]', 'Prendre depuis…');
            const over = await page2.evaluate(() => { const d = document.querySelector('.cx-take[open]').getBoundingClientRect(); return [d.left, d.right, window.innerWidth]; }); assert.ok(over[0] >= -1 && over[1] <= over[2] + 1, 'la fenêtre tient : ' + over);
            await page2.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            // Insérer une info
            await page2.evaluate(() => { const ta = document.createElement('textarea'); ta.id = 'qi-ta'; ta.style.cssText = 'position:fixed;top:100px;left:16px;width:300px;height:80px'; document.body.appendChild(ta); window.LCNDA_EXT.insertInfo.open(ta, {onPick: () => {}}); });
            await page2.waitForSelector('.cx-qi [data-qi-q]'); await page2.fill('.cx-qi [data-qi-q]', 'MAZAUD'); await sleep(1500);
            const qi = await page2.evaluate(() => { const r = document.querySelector('.cx-qi').getBoundingClientRect(); return [r.left, r.right, window.innerWidth]; }); assert.ok(qi[0] >= 0 && qi[1] <= qi[2], 'Insérer une info tient dans l’écran : ' + qi);
            await noSide('Insérer une info'); await dark('.cx-qi', 'Insérer une info');
            assert.deepStrictEqual(errs2, []); await page2.close();
        });

        /* ═════ 5. en anglais ═════ */
        await t('en anglais : l’historique d’un panier (créé, copié, récupéré), le rappel et les noms par défaut écrits par le serveur sont en anglais', async () => {
            await p.evaluate(() => { localStorage.setItem('lcnda-langue', 'en'); }); await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.connexions, null, {timeout: 60000});
            try {
                const lang = await p.evaluate(() => window.LCNDA_I18N?.getLang?.() || document.documentElement.lang); assert.match(String(lang), /^en/);
                const b = (await cx('pn_create', {name: '', items: [{kind: 'datum', title: 'x', value: 'y'}]})).id;
                const d = (await cx('pn_dup', {basket_id: b})).id;
                await cx('pn_share_import', {basket_id: b, body: JSON.stringify({format: 'lcnda-panier', version: 1, items: [{title: 'z'}]})});
                await cx('pn_meta', {basket_id: b, due: '2027-01-10', remind: 1});
                const f = (await cx('folder_new', {}));
                const all = await B.api('cx_basket', {all: 1}); const names = [all.baskets.find(x => x.id === b).name, all.baskets.find(x => x.id === d).name, all.folders.find(x => x.id === f.id).name, all.baskets.find(x => x.id === f.basket_id).name];
                assert.deepStrictEqual(names, ['Basket', 'Basket (copy)', 'Folder', 'New basket'], JSON.stringify(names));
                const log = (await B.api('cx_basket', {basket_id: b, log: 1})).log.map(l => l.label).concat((await B.api('cx_basket', {basket_id: d, log: 1})).log.map(l => l.label));
                const fr = log.filter(l => /Panier créé|Copié|Copie de|Récupéré|éléments|déjà dedans/.test(l)); assert.deepStrictEqual(fr, [], JSON.stringify(log));
                const rem = php(String.raw`$p = new PDO('sqlite:' . getenv('GENEALOGY_DATA_DIR') . '/genealogy.sqlite'); echo $p->query("SELECT title || ' | ' || notes FROM standalone_reminders WHERE title LIKE '🧺%' ORDER BY id DESC LIMIT 1")->fetchColumn();`);
                assert.ok(/Basket/.test(rem) && !/Panier|Onglet/.test(rem), rem);
            } finally { await p.evaluate(() => localStorage.setItem('lcnda-langue', 'fr')); await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, {timeout: 60000}); }
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
