#!/usr/bin/env node
/* 📜 L'Atelier par étapes (maquette validée docs/design/atelier-etapes.html ; points 11, 13, 14, 15, 23, 24 et 33 de l'audit) :
 *  - une étape à la fois, sur ordinateur aussi : seuls les boutons de l'étape choisie, chacun une seule fois ;
 *  - 🧠 « Aider l'IA » : un seul bouton, à la place choisie (Réglages : étape Lire, barre du haut, étape Corriger) ;
 *  - 🧾 « Ce que l'app a trouvé » : A (fermé en Lire / Corriger, ouvert en Repérer / Ajouter), B (toujours fermé, retenu), C (ouvert, plus petit) ;
 *  - 👁 Corriger : « N / M relues », les ronds ○ devant les lignes, « ✓ J'ai relu », « Relue » toute seule ;
 *  - en haut, seulement l'état de l'enregistrement ; les messages en bas ; 🎯 Suivre la ligne ; ſ favoris + « ＋ » (📌, un arrêt de Tab) ;
 *  - la couleur d'une zone par son nom ; un seul réglage de l'état ; « 📋 Copier le texte » dans Fichier ; 🕘 Versions juste au-dessus de « 📄 Ce texte… » ;
 *  - 1440 et 390 px, clair et sombre ; aucune erreur JavaScript.
 *   node tests/test-atelier-etapes.js   (captures : SHOTS=/chemin node tests/test-atelier-etapes.js)
 * Personnes fictives. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const SHOTS = process.env.SHOTS || '';

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LINES = ['L’an mil sept cent quatre vingt dix, le vingt trois', 'mars, a été baptisé Jean, né d’hier, fils légitime', 'de Pierre MAZAUD, labr, et de Marie LACOMBE,', 'son épouse, de cette paroisse de Saint Martin.', 'Le parrain a été Jean DURAND, la marraine', 'Anne MAZAUD, qui ont déclaré ne savoir signer.', 'Delpeiroux curé [?]'];
const BODY = LINES.join('\n');

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-atelier-etapes-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    let at = 0; const zones = LINES.map((l, i) => { const z = {id: 'z' + (i + 1), x: 40, y: 40 + i * 64, w: 520, h: 46, s: at, e: at + l.length}; at += l.length + 1; return z; });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1)");
$im = imagecreatetruecolor(600, 500); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); $ink = imagecolorallocate($im, 60, 45, 30);
for ($l = 0; $l < 7; $l++) for ($x = 50; $x < 550; $x += 9) imagefilledrectangle($im, $x, 50 + $l * 64, $x + 5, 70 + $l * 64, $ink);
imagepng($im, MEDIA_DIR . '/acte.png');
$pdo->exec("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(1,'Baptême','acte.png','acte.png','image')");
act_transcriptions_ensure($pdo);
$a = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(?,?,?,?,?,?,?)");
$a->execute([1, 'Baptême de Jean MAZAUD, 1790', 'bapteme', 1, getenv('TX_BODY'), getenv('TX_DATA'), '2026-01-01']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env: {...env, TX_BODY: BODY, TX_DATA: JSON.stringify({zones, people: [], status: 'doing'})}});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (/DBG/.test(m.text())) console.log(m.text()); });
        const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, {recursive: true}); await p.screenshot({path: path.join(SHOTS, name)}); } };
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txView, null, {timeout: 30000});
        const theme = th => p.evaluate(x => { if (x) document.documentElement.setAttribute('data-theme', x); else document.documentElement.removeAttribute('data-theme'); }, th);
        const D = 'dialog.h-tx-dlg';
        const ev = (fn, a) => p.evaluate(fn, a);
        const openAct = async () => {
            await ev(() => { const d = document.querySelector('dialog.h-tx-dlg'); if (d) d.querySelector('[data-tx-cmd="close"]')?.click(); }); await sleep(200);
            await ev(() => document.querySelectorAll('.confirm-dialog, dialog.h-tx-dlg').forEach(d => { try { d.close(); } catch (_) {} d.remove(); }));
            await ev(() => window.LCNDA_EXT.openActTranscriber({id: 1}));
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000}); await sleep(700);
        };
        const step = async k => { await p.click(`${D} [data-tx-step="${k}"]`); await sleep(120); };
        /** ce qui se voit : les commandes visibles (data-tx-cmd), les étapes montrées */
        const seen = () => ev(() => { const d = document.querySelector('dialog.h-tx-dlg'), vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden'; };
            const cmds = [...d.querySelectorAll('[data-tx-cmd]')].filter(b => vis(b) && !b.closest('[data-tx-readpanel], .ed-status, .h-tx-left, .h-tx-rail, [data-tx-barwrap]')).map(b => b.dataset.txCmd);
            return {cmds, panes: [...d.querySelectorAll('[data-tx-pane]')].filter(vis).map(x => x.dataset.txPane), view: d.dataset.txFlowView, ia: [...d.querySelectorAll('[data-tx-cmd="aideia"]')].length, iaWhere: d.querySelector('[data-tx-cmd="aideia"]').closest('[data-tx-iaslot]')?.dataset.txIaslot,
                found: d.dataset.txFound, foundVis: vis(d.querySelector('[data-tx-found]')), addN: [...d.querySelectorAll('[data-tx-cmd="found"]')].filter(vis).length}; });
        const prog = () => ev(() => JSON.parse(document.querySelector('dialog.h-tx-dlg').dataset.txProg || '{}'));
        const rest = k => ev(x => document.querySelector(`dialog.h-tx-dlg [data-tx-step="${x}"] [data-tx-steprest]`).textContent, k);
        const body = () => ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value);
        await ev(() => { ['genealogie-tx-aide-ia-place', 'genealogie-tx-trouve-mode', 'genealogie-tx-trouve-ouvert', 'genealogie-tx-car-favoris', 'genealogie-tx-suivre'].forEach(k => localStorage.removeItem(k)); });
        await openAct();

        /* ─── 1. une étape à la fois ─── */
        const EXPECT = {read: ['readmenu', 'aideia', 'template'], fix: ['fix', 'review', 'aide'], find: ['detect'], add: ['found']};
        await t('à l’ouverture : l’étape en cours (Corriger) ; seuls ses boutons ; la frise est un vrai jeu d’onglets', async () => {
            const s = await seen(); assert.equal(s.view, 'fix'); assert.deepEqual(s.panes, ['fix']);
            assert.ok(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cpanel]').hidden), 'le panneau « ＋ » est fermé à l’ouverture');
            assert.equal(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="fix"]').getAttribute('aria-selected')), 'true');
            await shot('etapes-1440-corriger.png');
        });
        await t('chaque étape montre seulement ses boutons, chacun une seule fois (1440 px)', async () => {
            for (const k of ['read', 'fix', 'find', 'add']) {
                await step(k); const s = await seen(); assert.deepEqual(s.panes, [k], k);
                const inPane = s.cmds.filter(c => !['save', 'export', 'close', 'htrstop'].includes(c));
                assert.deepEqual(inPane.sort(), [...EXPECT[k]].sort(), `${k} : ${inPane.join(', ')}`);
                assert.equal(new Set(s.cmds).size, s.cmds.length, 'pas de doublon : ' + s.cmds.join(', '));
                assert.equal(s.ia, 1, 'un seul « 🧠 Aider l’IA » dans tout l’Atelier');
                await shot(`etapes-1440-${k}.png`);
            }
            assert.equal(await ev(() => document.querySelectorAll('dialog.h-tx-dlg [data-tx-addbar], dialog.h-tx-dlg .h-tx-extra').length), 0, 'plus de barre « Ajouter » en double');
        });
        await t('« ✨ Lire ▾ » appelé d’une autre étape : l’Atelier passe à l’étape Lire', async () => {
            await step('add'); await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="readmenu"]').click()); await sleep(200);
            const s = await seen(); assert.equal(s.view, 'read'); assert.ok(await p.isVisible(`${D} [data-tx-readpanel]`)); await p.keyboard.press('Escape');
            assert.equal(await ev(() => document.querySelectorAll('dialog.h-tx-dlg [data-tx-readpanel] [data-tx-cmd="aideia"]').length), 0, 'plus de 2e « Aider l’IA » dans le menu');
        });

        /* ─── 2. 🧠 Aider l'IA : un seul bouton, sa place se règle ─── */
        await t('🧠 « Aider l’IA » : étape Lire au départ ; Réglages → barre du haut, puis étape Corriger ; toujours un seul', async () => {
            const html = await ev(() => window.LCNDA_EXT.transcribePrefs.html()); assert.match(html, /data-txb-ia/); assert.match(html, /Dans l’étape Lire, à côté de « ✨ Lire ▾ » \(conseillé\)/); assert.match(html, /data-txb-trouve/);
            let s = await seen(); assert.equal(s.iaWhere, 'read');
            await ev(() => window.LCNDA_EXT.txView.setIaPlace('top')); await sleep(150); await step('add'); s = await seen();
            assert.equal(s.iaWhere, 'top'); assert.ok(s.cmds.includes('aideia'), 'visible en haut quelle que soit l’étape'); assert.equal(s.ia, 1);
            assert.equal(await ev(() => localStorage.getItem('genealogie-tx-aide-ia-place')), 'top'); await shot('etapes-ia-haut.png');
            await ev(() => window.LCNDA_EXT.txView.setIaPlace('fix')); await sleep(150); await step('read'); s = await seen(); assert.ok(!s.cmds.includes('aideia'));
            await step('fix'); s = await seen(); assert.equal(s.iaWhere, 'fix'); assert.ok(s.cmds.includes('aideia')); assert.equal(s.ia, 1);
            // le réglage dans la fenêtre des Réglages (le même panneau que ⚙️) : le choisir change l'Atelier ouvert
            await ev(() => { const box = document.createElement('div'); box.id = 'tst-prefs'; document.body.appendChild(box); box.innerHTML = window.LCNDA_EXT.transcribePrefs.html(); window.LCNDA_EXT.transcribePrefs.bind(box, () => {}); const sel = box.querySelector('[data-txb-ia]'); sel.value = 'read'; sel.dispatchEvent(new Event('change', {bubbles: true})); box.remove(); });
            await sleep(150); assert.equal((await seen()).iaWhere, 'read');
        });

        /* ─── 3. 🧾 Ce que l'app a trouvé ─── */
        await t('🧾 « Ce que l’app a trouvé » (A, conseillé) : fermé en Lire et Corriger (une ligne), ouvert en Repérer et Ajouter ; à la main jusqu’au changement d’étape', async () => {
            await step('fix'); let s = await seen(); assert.equal(s.found, 'folded'); assert.ok(!s.foundVis);
            assert.match(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-foundsum]').textContent), /Repérer/);
            const edFolded = await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-editor]').getBoundingClientRect().height);
            await step('find'); s = await seen(); assert.equal(s.found, 'open'); assert.ok(s.foundVis);
            const edOpen = await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-editor]').getBoundingClientRect().height);
            assert.ok(edFolded > edOpen + 80, `la case du texte gagne la place : ${edFolded} / ${edOpen}`);
            await p.click(`${D} [data-tx-foundtoggle]`); s = await seen(); assert.equal(s.found, 'folded', 'fermé à la main');
            await step('fix'); await step('find'); s = await seen(); assert.equal(s.found, 'open', 'au changement d’étape, la règle revient');
            await step('fix'); await p.click(`${D} [data-tx-foundtoggle]`); assert.equal((await seen()).found, 'open');
            assert.equal(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-foundtoggle]').getAttribute('aria-expanded')), 'true');
        });
        await t('🧾 réglage B (toujours fermé, retenu) et C (toujours ouvert, plus petit)', async () => {
            await ev(() => window.LCNDA_EXT.txView.setTrouveMode('B')); await sleep(150); await step('find');
            let s = await seen(); assert.equal(s.found, 'folded', 'B : fermé même en Repérer');
            await p.click(`${D} [data-tx-foundtoggle]`); assert.equal(await ev(() => localStorage.getItem('genealogie-tx-trouve-ouvert')), '1');
            await step('fix'); s = await seen(); assert.equal(s.found, 'open', 'B : le choix est retenu');
            await openAct(); assert.equal((await seen()).found, 'open', 'B : retenu à la réouverture');
            await p.click(`${D} [data-tx-foundtoggle]`);
            await ev(() => window.LCNDA_EXT.txView.setTrouveMode('C')); await sleep(150); await step('fix');
            s = await seen(); assert.equal(s.found, 'open'); assert.ok(s.foundVis);
            const c = await ev(() => { const d = document.querySelector('dialog.h-tx-dlg'); return {small: d.querySelector('[data-tx-found]').classList.contains('is-small'), head: !d.querySelector('[data-tx-foundtoggle]').hidden, h: d.querySelector('[data-tx-found]').getBoundingClientRect().height}; });
            assert.ok(c.small && !c.head && c.h <= 221, JSON.stringify(c)); await shot('etapes-trouve-C.png');
            await ev(() => window.LCNDA_EXT.txView.setTrouveMode('A')); await sleep(150);
        });

        /* ─── 4. 👁 Corriger : « N / M relues », ○ devant les lignes, « J'ai relu » ─── */
        const gutter = n => ev(x => { const d = document.querySelector('dialog.h-tx-dlg'), sp = d.querySelector(`[data-tx-mirror] .h-tx-ln[data-n="${x}"]`), a = d.querySelector('[data-tx-body]').getBoundingClientRect(), r = sp.getBoundingClientRect();
            return {x: Math.round(a.left + parseFloat(getComputedStyle(d.querySelector('.h-tx-ln.is-tk'), '::after').left) + 10), y: Math.round(r.top + 10), tk: sp.classList.contains('is-tk'), rv: sp.classList.contains('is-rv')}; }, n);
        await t('👁 Corriger : « 0 / 7 relues », un rond ○ devant chaque ligne ; un clic la coche (✓), ⌥ Entrée coche la ligne et passe à la suivante', async () => {
            await step('fix'); assert.equal(await rest('fix'), '0 / 7 relues');
            assert.equal(await ev(() => document.querySelectorAll('dialog.h-tx-dlg [data-tx-mirror] .h-tx-ln.is-tk').length), 7);
            const g = await gutter(1); assert.ok(g.tk && !g.rv, JSON.stringify(g));
            await p.mouse.click(g.x, g.y); await sleep(200);
            assert.equal(await rest('fix'), '1 / 7 relues'); assert.ok((await gutter(1)).rv); assert.equal((await prog()).reviewed, 1);
            await ev(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); const i = a.value.indexOf('\n') + 3; a.setSelectionRange(i, i); });
            await p.keyboard.press('Alt+Enter'); await sleep(200);
            assert.equal(await rest('fix'), '2 / 7 relues'); assert.ok((await gutter(2)).rv);
            assert.equal(await ev(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); return a.value.slice(0, a.selectionStart).split('\n').length; }), 3, 'la ligne suivante est choisie');
            assert.match(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="fix"]').className), /is-half/);
            await shot('etapes-corriger-relues.png');
            await p.mouse.click((await gutter(1)).x, (await gutter(1)).y); await sleep(150); assert.equal(await rest('fix'), '1 / 7 relues', 'un 2e clic l’enlève');
            assert.equal(await ev(() => document.querySelectorAll('dialog.h-tx-dlg .h-tx-ln.is-tk').length), 7);
            await step('read'); assert.equal(await ev(() => document.querySelectorAll('dialog.h-tx-dlg .h-tx-ln.is-tk').length), 0, 'les ronds seulement à l’étape Corriger');
        });
        await t('👁 « ✓ J’ai relu » : Corriger fait (✓), l’acte passe tout seul à « Relue » (un message) ; « Relu (dit par toi) » l’annule', async () => {
            await step('fix'); assert.equal((await prog()).state, 'doing');
            await p.click(`${D} [data-tx-relu]`); await sleep(250);
            const pr = await prog(); assert.equal(pr.state, 'checked'); assert.ok(pr.fixDone);
            assert.equal(await rest('fix'), 'relu (dit par toi)'); assert.equal(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-step="fix"] i').textContent), '✓');
            assert.ok(await ev(() => [...document.querySelectorAll('.ui-toast, .toast')].some(x => /Corriger : fait/.test(x.textContent))));
            assert.equal((await seen()).view, 'fix', 'plus de passage tout seul à l’étape suivante');
            await shot('etapes-jai-relu.png');
            await p.click(`${D} [data-tx-unrelu]`); await sleep(250); assert.equal((await prog()).state, 'doing', 'l’état mis tout seul revient'); assert.equal(await rest('fix'), '1 / 7 relues');
        });

        /* ─── 5. l'état de l'acte : un seul réglage ─── */
        await t('état de l’acte : un seul réglage (À faire · En cours · Relue · Finie), à côté de la frise', async () => {
            const s = await ev(() => { const d = document.querySelector('dialog.h-tx-dlg'); return {btns: [...d.querySelectorAll('[data-tx-setstate]')].map(b => b.textContent.trim()), old: d.querySelectorAll('[data-tx-state], [data-tx-pstate], .h-tx-meta select:not([data-tx="kind"])').length, inFlow: !!d.querySelector('[data-tx-flow] [data-tx-states]'), role: d.querySelector('[data-tx-states]').getAttribute('role')}; });
            assert.deepEqual(s.btns, ['À faire', 'En cours', 'Relue', 'Finie']); assert.equal(s.old, 0); assert.ok(s.inFlow); assert.equal(s.role, 'radiogroup');
            await p.click(`${D} [data-tx-setstate="done"]`); await sleep(100); assert.equal((await prog()).state, 'done');
            assert.equal(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-setstate="done"]').getAttribute('aria-checked')), 'true');
            await p.click(`${D} [data-tx-setstate="doing"]`); await sleep(100); assert.equal((await prog()).state, 'doing');
        });

        /* ─── 6. en haut, seulement l'enregistrement ; les messages en bas ─── */
        await t('barre du haut : « ● modifié », puis « ✓ Enregistré · il y a N s » tout seul (≈ 4 s) ; au survol, l’heure ; les messages vont en bas', async () => {
            await ev(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value += ' '; a.dispatchEvent(new Event('input')); });
            assert.match(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-status]').textContent), /^● modifié$/);
            await p.waitForFunction(() => /^✓ Enregistré · il y a \d+ s$/.test(document.querySelector('dialog.h-tx-dlg [data-tx-status]').textContent), null, {timeout: 12000});
            assert.match(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-status]').title), /Enregistré à \d/);
            await p.click(`${D} [data-tx-tool="zone"]`); await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-tool="pan"]').click());
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="loupe"]').click()); await sleep(100);
            const m = await ev(() => ({top: document.querySelector('dialog.h-tx-dlg [data-tx-status]').textContent, say: document.querySelector('dialog.h-tx-dlg [data-tx-say]').textContent, inBar: !!document.querySelector('dialog.h-tx-dlg .ed-status [data-tx-say]')}));
            assert.match(m.say, /Loupe/); assert.doesNotMatch(m.top, /Loupe/); assert.ok(m.inBar);
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="loupe"]').click());
            await step('find'); assert.match(await ev(() => document.querySelector('dialog.h-tx-dlg .ed-status').textContent), /Repérer/, 'la consigne de l’étape, en bas');
        });

        /* ─── 7. ſ caractères : favoris + « ＋ », 📌, un arrêt de Tab ─── */
        await t('ſ la barre courte : les favoris + « ＋ » ; un seul arrêt de Tab, ← → pour choisir', async () => {
            const b = await ev(() => { const d = document.querySelector('dialog.h-tx-dlg'), favs = [...d.querySelectorAll('[data-tx-favs] > button')]; return {n: favs.length, tab0: favs.filter(x => x.tabIndex === 0).length, last: favs.at(-1).textContent, chars: favs.map(x => x.textContent)}; });
            assert.ok(b.n <= 12, 'barre courte : ' + b.n); assert.equal(b.tab0, 1); assert.equal(b.last, '＋'); assert.ok(b.chars.includes('ſ') && b.chars.includes('[?]'));
            await p.focus(`${D} [data-tx-favs] > button[tabindex="0"]`); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
            assert.equal(await ev(() => document.activeElement.textContent), b.chars[2]);
            await p.keyboard.press('End'); assert.equal(await ev(() => document.activeElement.textContent), '＋');
            await p.keyboard.press('Tab'); assert.equal(await ev(() => !!document.activeElement.closest('[data-tx-chars]')), false, 'Tab sort de la barre en une fois');
            await p.keyboard.press('Shift+Tab'); assert.equal(await ev(() => document.activeElement.textContent), '＋', '⇧Tab revient sur le dernier choisi');
        });
        await t('ſ « ＋ » : tous les caractères en groupes (ꝑ ꝓ ꝗ ꝯ ꝰ ⁊ ℞, ỹ ā ē ō ū, ᵉ ʳ ˢ, accents, signes) ; 📌 épingle, retenu sur cet ordinateur', async () => {
            await p.click(`${D} [data-tx-charplus]`); await sleep(150);
            const pn = await ev(() => { const x = document.querySelector('dialog.h-tx-dlg [data-tx-cpanel]'); return {open: !x.hidden, groups: [...x.querySelectorAll('h4')].map(h => h.textContent), chars: [...x.querySelectorAll('[data-tx-pc]')].map(b => b.dataset.txChar), focus: !!document.activeElement.closest('[data-tx-cpanel]')}; });
            assert.ok(pn.open && pn.focus); assert.deepEqual(pn.groups, ['Lettres anciennes et abréviations', 'Lettres surmontées', 'Lettres en haut (Mᵉ, 8ᵇʳᵉ)', 'Accents et lettres liées', 'Signes']);
            for (const c of ['ſ', 'ꝑ', 'ꝓ', 'ꝗ', 'ꝯ', 'ꝰ', '⁊', '℞', 'ỹ', 'ā', 'ē', 'ō', 'ū', 'ᵉ', 'ʳ', 'ˢ', 'ᵗ', 'ᵐ', 'é', 'œ', '«', '[illisible]']) assert.ok(pn.chars.includes(c), c);
            await shot('etapes-caracteres.png');
            // toucher un caractère l'écrit
            await ev(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.setSelectionRange(0, 0); });
            await p.click(`${D} [data-tx-cpanel] [data-tx-char="ꝯ"]`); assert.ok((await body()).startsWith('ꝯ'));
            await ev(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.setRangeText('', 0, 1); a.dispatchEvent(new Event('input')); });
            // 📌 : choisir ses favoris
            await p.click(`${D} [data-tx-carpin]`); assert.equal(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-carpin]').getAttribute('aria-pressed')), 'true');
            await p.click(`${D} [data-tx-cpanel] [data-tx-char="ꝯ"]`); await p.click(`${D} [data-tx-cpanel] [data-tx-char="ſ"]`); await sleep(100);
            assert.ok(!(await body()).startsWith('ꝯ'), 'en mode 📌, toucher n’écrit pas');
            const favs = await ev(() => JSON.parse(localStorage.getItem('genealogie-tx-car-favoris')));
            assert.ok(favs.includes('ꝯ') && !favs.includes('ſ'), JSON.stringify(favs));
            assert.ok(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cpanel] [data-tx-char="ꝯ"]').classList.contains('is-pinned')));
            await shot('etapes-caracteres-epingler.png');
            await p.keyboard.press('Escape'); assert.ok(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cpanel]').hidden), 'Échap ferme');
            await openAct(); const bar = await ev(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-favs] > [data-tx-char]')].map(b => b.dataset.txChar));
            assert.ok(bar.includes('ꝯ') && !bar.includes('ſ'), 'retenu à la réouverture : ' + bar.join(' '));
        });

        /* ─── 8. couleur de zone ─── */
        await t('couleur de zone : une pastille et son nom (pas « #9BE08F ») ; 8 couleurs qui ont un nom', async () => {
            await ev(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); a.setSelectionRange(2, 2); a.dispatchEvent(new MouseEvent('click', {bubbles: true})); }); await sleep(200);
            let z = await ev(() => { const b = document.querySelector('dialog.h-tx-dlg [data-tx-zonebar]'); return {text: b.textContent, name: b.querySelector('[data-tx-zcname]')?.textContent, color: !!b.querySelector('input[type=color]')}; });
            assert.equal(z.name, 'jaune'); assert.ok(!/#[0-9a-f]{6}/i.test(z.text) && !z.color, z.text);
            await p.click(`${D} [data-tx-zcbtn]`); const names = await ev(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-zcpop] [data-tx-zc]')].map(b => b.textContent.trim()));
            assert.deepEqual(names, ['jaune', 'bleu clair', 'vert clair', 'rose', 'lilas', 'orange', 'turquoise', 'gris']);
            await shot('etapes-couleur.png');
            await p.click(`${D} [data-tx-zcpop] [data-tx-zc="#b8bcc4"]`); await sleep(100);
            z = await ev(() => ({name: document.querySelector('dialog.h-tx-dlg [data-tx-zcname]').textContent, c: document.querySelector('dialog.h-tx-dlg').txApi.get().data.zones.find(q => q.id === 'z1').c}));
            assert.deepEqual(z, {name: 'gris', c: '#b8bcc4'});
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-hist="undo"]').click()); await sleep(100);
        });

        /* ─── 9. 🎯 Suivre la ligne ─── */
        await t('🎯 Suivre la ligne : l’image zoome sur la largeur de la ligne active (⌥↓), retenu sur cet ordinateur', async () => {
            const z0 = await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-world]').getAttribute('transform'));
            await p.click(`${D} [data-tx-follow]`); assert.equal(await ev(() => localStorage.getItem('genealogie-tx-suivre')), '1');
            assert.equal(await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-follow]').getAttribute('aria-pressed')), 'true');
            await ev(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); a.setSelectionRange(3, 3); }); await p.keyboard.press('Alt+ArrowDown'); await sleep(200);
            const f = await ev(() => { const d = document.querySelector('dialog.h-tx-dlg'), r = d.querySelector('[data-tx-zones] rect.is-sel').getBoundingClientRect(), st = d.querySelector('[data-tx-stage]').getBoundingClientRect(); return {id: d.dataset.txFollowed, w: r.width, sw: st.width, inside: r.left >= st.left - 1 && r.right <= st.right + 1 && r.top >= st.top && r.bottom <= st.bottom, tr: d.querySelector('[data-tx-world]').getAttribute('transform')}; });
            assert.equal(f.id, 'z2'); assert.ok(f.w > f.sw * .85 && f.inside, JSON.stringify(f)); assert.notEqual(f.tr, z0);
            await shot('etapes-suivre.png');
            await p.click(`${D} [data-tx-follow]`); assert.equal(await ev(() => localStorage.getItem('genealogie-tx-suivre')), '0');
        });

        /* ─── 10. Fichier → Copier ; Versions au-dessus de « 📄 Ce texte… » ─── */
        await t('« 📋 Copier le texte » est dans le menu Fichier (une seule fois)', async () => {
            const items = async m => { await ev(x => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-menus] button')].find(b => b.textContent.trim() === x).click(), m); await p.waitForSelector('.ui-actmenu'); const l = await ev(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].map(b => b.textContent)); await p.keyboard.press('Escape'); await sleep(100); return l; };
            const fi = await items('Fichier'), ed = await items('Édition');
            assert.equal(fi.filter(x => /Copier le texte/.test(x)).length, 1, fi.join(' | ')); assert.ok(!ed.some(x => /Copier le texte/.test(x)), ed.join(' | '));
            assert.equal(await ev(() => document.querySelectorAll('dialog.h-tx-dlg [data-tx-cmd="copy"]').length), 0, 'plus de bouton à part');
        });
        await t('🕘 la bande Versions reste juste au-dessus de « 📄 Ce texte est celui du document… »', async () => {
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(800);
            await ev(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value += '\nencore une ligne'; a.dispatchEvent(new Event('input')); document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click(); });
            await p.waitForFunction(() => !document.querySelector('dialog.h-tx-dlg [data-tx-vers]').hidden, null, {timeout: 10000});
            const o = await ev(() => { const d = document.querySelector('dialog.h-tx-dlg'), v = d.querySelector('[data-tx-vers]'), n = d.querySelector('[data-tx-docnote]'), pv = d.querySelector('[data-tx-vprev]');
                return {next: v.nextElementSibling === pv && pv.nextElementSibling === n, vb: Math.round(v.getBoundingClientRect().bottom), nt: Math.round(n.getBoundingClientRect().top), noteVis: !n.hidden, ed: Math.round(d.querySelector('[data-tx-editor]').getBoundingClientRect().bottom), vt: Math.round(v.getBoundingClientRect().top)}; });
            assert.ok(o.next && o.noteVis, JSON.stringify(o)); assert.ok(o.vb <= o.nt && o.nt - o.vb < 20, 'juste au-dessus : ' + JSON.stringify(o)); assert.ok(o.vt >= o.ed, 'sous le texte');
            await shot('etapes-versions.png');
        });

        /* ─── 11. sombre ─── */
        await t('sombre : la frise, l’état, les étapes, les caractères et « Ce que l’app a trouvé » lisibles ; rien ne dépasse', async () => {
            await theme('dark'); await step('fix'); await p.click(`${D} [data-tx-charplus]`); await sleep(200);
            const c = await ev(() => { const d = document.querySelector('dialog.h-tx-dlg'), bg = s => getComputedStyle(d.querySelector(s)).backgroundColor, fg = s => getComputedStyle(d.querySelector(s)).color;
                return {head: bg('[data-tx-foundtoggle]'), states: bg('[data-tx-states]'), panel: bg('[data-tx-cpanel]'), stateFg: fg('[data-tx-setstate="todo"]'), on: bg('[data-tx-setstate].is-on'), sw: document.documentElement.scrollWidth}; });
            const lum = s => { const [r, g, b] = s.match(/\d+/g).map(Number); return (r + g + b) / 3; };
            assert.ok(lum(c.head) < 80 && lum(c.states) < 80 && lum(c.panel) < 80 && lum(c.stateFg) > 150, JSON.stringify(c)); assert.ok(c.sw <= 1441);
            await shot('etapes-sombre.png'); await p.keyboard.press('Escape'); await theme('');
        });

        /* ─── 12. téléphone ─── */
        await t('390 px : les onglets Image / Texte / Personnes restent ; seulement l’étape choisie ; « ＋ » s’ouvre par le bas ; rien ne dépasse, clair et sombre', async () => {
            await p.setViewportSize({width: 390, height: 844}); await sleep(500);
            for (const th of ['', 'dark']) {
                await theme(th); await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-ptab="text"]').click()); await sleep(200);
                const s = await ev(() => { const d = document.querySelector('dialog.h-tx-dlg'), vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                    return {tabs: [...d.querySelectorAll('[data-tx-ptab]')].filter(vis).map(b => b.dataset.txPtab), panes: [...d.querySelectorAll('[data-tx-pane]')].filter(vis).length, sw: document.documentElement.scrollWidth,
                        out: [...d.querySelectorAll('*')].filter(el => !el.closest('svg, .h-tx-stage, [data-tx-readpanel], [data-tx-panel], [data-tx-favs]') && vis(el)).filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map(el => el.className)}; });
                assert.deepEqual(s.tabs, ['image', 'text', 'people']); assert.equal(s.panes, 1); assert.ok(s.sw <= 391, 'largeur ' + s.sw); assert.deepEqual(s.out, []);
                await shot(`etapes-390-texte${th ? '-sombre' : ''}.png`);
                await p.click(`${D} [data-tx-charplus]`); await sleep(200);
                const pn = await ev(() => { const r = document.querySelector('dialog.h-tx-dlg [data-tx-cpanel]').getBoundingClientRect(); return {l: r.left, r: r.right, b: Math.round(r.bottom), h: innerHeight}; });
                assert.ok(pn.l >= 0 && pn.r <= 391 && Math.abs(pn.b - pn.h) <= 2, 'par le bas : ' + JSON.stringify(pn));
                await shot(`etapes-390-caracteres${th ? '-sombre' : ''}.png`); await p.keyboard.press('Escape');
                await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-ptab="people"]').click()); await sleep(200);
                const pe = await ev(() => { const d = document.querySelector('dialog.h-tx-dlg'), f = d.querySelector('[data-tx-found]').getBoundingClientRect(); return {found: f.height > 0, flow: d.querySelector('[data-tx-flow]').getBoundingClientRect().height > 0}; });
                assert.ok(pe.found && pe.flow, 'Personnes : ce que l’app a trouvé, et la frise (état, « ✓ Ajouter ») ' + JSON.stringify(pe));
                await shot(`etapes-390-personnes${th ? '-sombre' : ''}.png`);
            }
            await theme(''); await p.setViewportSize({width: 1440, height: 900}); await sleep(300);
        });

        await t('les textes de l’Atelier par étapes sont traduits (en es de it pt pl nl)', async () => {
            const KEYS = ['J’ai relu', '{n} / {total} relues', 'État de l’acte', 'Suivre la ligne', 'Plus de caractères', 'Choisir mes favoris', 'couleur|vert clair', 'il y a {n} s', '« Aider l’IA » : un seul bouton', 'Toujours ouvert, plus petit'];
            const missing = []; for (const c of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl']) { const d = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n', c + '.json'), 'utf8')); KEYS.forEach(k => { if (!d[k]) missing.push(`${c}: ${k}`); }); }
            assert.deepEqual(missing, []);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'L’Atelier par étapes : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
