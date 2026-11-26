#!/usr/bin/env node
/* ⚙️ « Organiser la fiche » d'un village : TOUTES les parties (celles de la fiche et celles des autres outils) — heritage-more.js
 * (villageDefs, villageAdopt, villageLayoutDialog), assets/css/fiche-village-organiser.css, registre LCNDA_EXT.villageSectionDefs.
 *  · l'organisateur liste chaque partie déclarée (dont plusieurs des autres outils), groupée, avec la recherche au-delà de 20 lignes ;
 *  · masquer / montrer, ranger (↑ ↓, clavier, glisser) : gardé dans genealogie-village-layout (et dans « Réglages enregistrés ») ;
 *  · à 1/3 et à 1/4, chaque partie tient dans sa colonne (rien ne déborde : tableaux qui défilent, cartes, texte replié) ;
 *  · une partie arrivée après coup (déclarée ou non) est rangée toute seule à la fin, avec « Nouveau » ;
 *  · « ↺ Ordre d'origine » puis « ↶ Annuler » ; à 390 px de large, rien ne dépasse.
 *  · aussi : la fiche d'une personne — chaque bloc des autres outils (LCNDA_EXT.personBlocks) est dans « Blocs de la fiche ».
 * Base temporaire, php -S + Playwright, sans Internet.   node tests/test-fiche-village-organiser.js */
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
let fails = 0;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null; // ONLY=Réglages node tests/… : seulement ces essais
const t = async (name, fn) => { if (ONLY && !ONLY.test(name)) return; try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const phpPath = findPhp([devBundledPhp()]) || 'php';
const KEY = 'genealogie-village-layout';

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-vorg-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,'meunier'),(2,'Marie','LACOMBE','female','deceased',0,'couturière'),(3,'Pierre','MAZAUD','male','deceased',0,'laboureur'),(4,'Anne','DURAND','female','deceased',0,'')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Honfleur','Calvados','France',49.419,0.233,'14333')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT',1840],[1,'DEAT',1915],[2,'BIRT',1845],[2,'DEAT',1920],[3,'BIRT',1870],[3,'MARR',1895],[4,'BIRT',1872],[4,'DEAT',1950],[3,'DEAT',1940]] as [$p,$g,$y]) $ins->execute([$p,$t($g),(string)$y,$y,(string)$y,1]);
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(1,2)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks && window.LCNDA_EXT?.villageLayoutApi, null, {timeout: 30000});
        const openVillage = async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '14333'; A.state.workspaceToken = (A.state.workspaceToken || 0) + 1; A.setModule('listes'); });
            await p.waitForSelector('.h-village .h-village-flow [data-vsec="stats"]', {timeout: 20000});
            // les autres outils posent leurs parties un peu après (données livrées, réponses gardées) : on attend que ça se calme
            let last = -1;
            for (let i = 0; i < 40; i++) { const n = await p.evaluate(() => document.querySelector('.h-village').innerHTML.length); if (n === last) break; last = n; await sleep(250); }
        };
        const strays = () => p.evaluate(() => { const page = document.querySelector('.h-village'), flow = page.querySelector(':scope > .h-village-flow'), kids = [...page.children];
            return [...kids.slice(kids.indexOf(flow) + 1), ...[...flow.children].filter(el => !el.dataset.vplaced)].map(el => el.outerHTML.slice(0, 120)); });
        const openOrg = async () => { await p.evaluate(() => document.querySelector('[data-h-village-layout]').click()); await p.waitForSelector('.vl-dialog [data-vl-body]'); };
        const closeOrg = async () => { await p.click('.vl-dialog .modal-actions [type=submit]'); await p.waitForSelector('.vl-dialog', {state: 'detached'}); };
        const stored = () => p.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
        const flowIds = () => p.$$eval('.h-village-flow > [data-vsec]', n => n.map(x => x.dataset.vsec));

        await openVillage();
        const reg = await p.evaluate(() => [...new Set((window.LCNDA_EXT.villageSectionDefs || []).filter(d => d && d.id && !(d.unwrap && !d.host)).map(d => d.id))]);
        const present = await p.$$eval('.h-village-flow > [data-vsec]', n => n.filter(x => x.innerHTML.trim()).map(x => x.dataset.vsec));
        console.log(`   ${reg.length} parties déclarées par les autres outils ; ${present.length} parties dans la page : ${present.join(', ')}`);

        await t('le registre : au moins 25 parties déclarées par les autres outils (lot 8/9/10, téléchargements, commune, terroir…)', async () => {
            for (const id of ['l10v_place', 'ta_place', 'tb_place', 'tc_place', 'td_place', 'cc_place', 'cplus_place', 'ha_place', 'fe_place', 'trr_place', 'tm_place', 'lp_place', 'mr_place', 'l10_terre_gens', 'l9_place', 'l8c_place']) assert.ok(reg.includes(id), id);
            assert.ok(reg.length >= 25, String(reg.length));
            const list = await p.evaluate(() => window.LCNDA_EXT.villageSections().map(x => x[0]));
            assert.ok(reg.every(id => list.includes(id)), 'LCNDA_EXT.villageSections() (onglets et widgets « Fiche d’un village ») les donne toutes');
        });
        await t('tout ce que les outils ont posé dans la page est rangé dans la grille (rien en dessous, rien sans nom)', async () => {
            assert.deepStrictEqual(await strays(), []);
            const ids = await flowIds();
            assert.strictEqual(new Set(ids).size, ids.length, 'une partie une seule fois');
            assert.ok(present.length >= 18, 'des parties des autres outils sont bien là : ' + present.join(','));
            assert.ok(present.filter(id => reg.includes(id)).length >= 4, 'au moins 4 parties des autres outils dans la page');
        });
        await t('l’organisateur liste toutes les parties (celles d’origine et toutes les nouvelles), groupées, avec la recherche', async () => {
            await openOrg();
            const rows = await p.$$eval('[data-vl-row]', n => n.map(x => x.dataset.vlRow));
            for (const id of ['stats', 'map', 'church', 'families', 'popchart', 'postcards', ...reg]) assert.ok(rows.includes(id), 'ligne ' + id);
            for (const id of present) assert.ok(rows.includes(id), 'partie de la page ' + id);
            const chips = await p.$$eval('[data-vl-grp]', n => n.map(x => x.textContent));
            for (const g of ['Le village', 'Son histoire', 'Autour', 'Données téléchargées']) assert.ok(chips.some(c => c.startsWith(g)), g);
            assert.ok(await p.$('[data-vl-q]'), 'plus de 20 lignes : la recherche');
            await p.fill('[data-vl-q]', 'cimeti');
            const found = await p.$$eval('[data-vl-row]', n => n.map(x => x.dataset.vlRow));
            assert.deepStrictEqual(found, ['cplus_place']);
            await p.fill('[data-vl-q]', '');
            await p.click('[data-vl-grp="Données téléchargées"]');
            const dl = await p.$$eval('[data-vl-row]', n => n.map(x => x.dataset.vlRow));
            assert.ok(dl.includes('ta_place') && dl.includes('td_place') && !dl.includes('stats'), dl.join(','));
            await p.click('[data-vl-grp=""]');
            const widths = await p.$$eval('[data-vl-width="stats"] option', n => n.map(o => o.textContent));
            assert.deepStrictEqual(widths, ['1/4', '1/3', '1/2', '2/3', '3/4', 'pleine']);
            await closeOrg();
        });
        await t('masquer puis remontrer une partie d’un autre outil : la page suit tout de suite, c’est gardé', async () => {
            const id = present.find(x => reg.includes(x));
            await openOrg();
            await p.uncheck(`[data-vl-show="${id}"]`);
            assert.ok(await p.$eval(`.h-village-flow > [data-vsec="${id}"]`, el => el.classList.contains('is-vhidden') && getComputedStyle(el).display === 'none'));
            assert.ok((await stored()).hidden.includes(id));
            await closeOrg(); await openVillage();
            assert.ok(await p.$eval(`.h-village-flow > [data-vsec="${id}"]`, el => getComputedStyle(el).display === 'none'), 'toujours masquée après un nouvel affichage');
            await openOrg(); await p.check(`[data-vl-show="${id}"]`);
            assert.ok(await p.$eval(`.h-village-flow > [data-vsec="${id}"]`, el => getComputedStyle(el).display !== 'none'));
            assert.ok(!(await stored()).hidden.includes(id));
            await closeOrg();
        });
        await t('ranger : ↓, le clavier (⠿ + flèche, Alt + flèche), glisser ⠿ — l’ordre est gardé et la page suit', async () => {
            await openOrg();
            const first = (await stored()).order?.[0] || await p.$eval('[data-vl-row]', r => r.dataset.vlRow);
            await p.click(`[data-vl-move="${first}"][data-dir="1"]`);
            let o = (await stored()).order; assert.strictEqual(o[1], first);
            assert.strictEqual((await flowIds()).filter(x => o.includes(x)).indexOf(first) > 0, true);
            await p.focus(`[data-vl-grip="${first}"]`); await p.keyboard.press('ArrowUp');
            o = (await stored()).order; assert.strictEqual(o[0], first, 'flèche haut sur ⠿');
            assert.strictEqual(await p.evaluate(() => document.activeElement?.dataset.vlGrip), first, 'le focus reste sur la ligne');
            await p.focus(`[data-vl-width="${first}"]`); await p.keyboard.press('Alt+ArrowDown');
            o = (await stored()).order; assert.strictEqual(o[1], first, 'Alt + flèche bas');
            const last = o[o.length - 1];
            await p.evaluate(([from, to]) => { // ⠿ glisser (les événements du navigateur, avec leur DataTransfer)
                const dt = new DataTransfer(), src = document.querySelector(`[data-vl-row="${from}"]`), dst = document.querySelector(`[data-vl-row="${to}"]`), r = dst.getBoundingClientRect();
                const ev = (el, type) => el.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 10, clientY: r.top + 2}));
                ev(src.querySelector('.vl-grip'), 'dragstart'); ev(dst, 'dragover'); ev(dst, 'drop'); ev(src.isConnected ? src : dst, 'dragend');
            }, [last, o[0]]);
            o = (await stored()).order; assert.strictEqual(o[0], last, 'glissé tout en haut');
            assert.strictEqual((await flowIds())[0], last, 'la page suit');
            await closeOrg();
        });
        await t('↺ Ordre d’origine, puis ↶ Annuler (dans la fenêtre)', async () => {
            const before = (await stored()).order;
            await openOrg();
            await p.click('[data-vl-reset]');
            const reset = (await stored()).order;
            assert.strictEqual(reset[0], 'stats'); assert.notDeepStrictEqual(reset, before);
            assert.deepStrictEqual(Object.keys((await stored()).width), []);
            await p.click('[data-vl-undo]');
            assert.deepStrictEqual((await stored()).order, before);
            await closeOrg();
        });
        await t('largeur : chaque partie à 1/3 puis à 1/4 tient dans sa colonne (rien ne déborde, cartes et tableaux compris)', async () => {
            for (const w of ['w4', 'w3']) {
                await p.evaluate(([k, w]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.width = {}; s.hidden = []; window.LCNDA_EXT.villageLayoutApi.defs().forEach(d => { s.width[d.id] = w; }); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, w]);
                await openVillage(); await sleep(300);
                const bad = await p.evaluate(() => {
                    const out = [];
                    document.querySelectorAll('.h-village-flow > [data-vsec]').forEach(el => {
                        if (getComputedStyle(el).display === 'none' || !el.innerHTML.trim()) return;
                        const r = el.getBoundingClientRect();
                        if (r.width > 1440 / 3 + 20) out.push(`${el.dataset.vsec}: ${Math.round(r.width)} px de large`);
                        const over = [...el.querySelectorAll('*')].filter(x => { const b = x.getBoundingClientRect(); if (!b.width || getComputedStyle(x).position === 'fixed') return false;
                            for (let a = x.parentElement; a && a !== el; a = a.parentElement) { const cs = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) { const ab = a.getBoundingClientRect(); if (ab.right <= r.right + 2 && ab.left >= r.left - 2) return false; } }
                            return b.right > r.right + 2 || b.left < r.left - 2; });
                        if (over.length) out.push(`${el.dataset.vsec}: ${over.slice(0, 3).map(x => x.tagName + '.' + [...x.classList].join('.') + ' ' + Math.round(x.getBoundingClientRect().width)).join(' | ')}`);
                    });
                    return out;
                });
                assert.deepStrictEqual(bad, [], w);
                const n = await p.$$eval('.h-village-flow > [data-vsec]', n => n.filter(x => getComputedStyle(x).display !== 'none').length);
                const cols = await p.evaluate(() => { const tops = {}; document.querySelectorAll('.h-village-flow > [data-vsec]').forEach(x => { if (getComputedStyle(x).display === 'none') return; const t = Math.round(x.getBoundingClientRect().top); tops[t] = (tops[t] || 0) + 1; }); return Math.max(...Object.values(tops)); });
                assert.ok(cols >= (w === 'w4' ? 3 : 4) || n < 3, `${w} : ${cols} parties sur une ligne`);
            }
            await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.width = {}; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
        });
        await t('une partie arrivée après coup (déclarée ou non) : rangée à la fin, montrée, « Nouveau » dans l’organisateur', async () => {
            await openVillage();
            await p.evaluate(() => {
                window.LCNDA_EXT.villageSections.register({id: 'essai_neuf', host: '[data-essai-host]', icon: '🧪', label: 'Partie d’essai', group: 'Autour', defaultWidth: '1/3'});
                window.LCNDA_EXT.villageSections.register({id: 'essai_cache', host: '[data-essai2-host]', icon: '🙈', label: 'Partie d’essai cachée', group: 'Autour', defaultShown: false});
                const v = document.querySelector('.h-village');
                v.insertAdjacentHTML('beforeend', '<div data-essai-host><section class="maintenance-panel"><h3>🧪 Essai</h3><p>Un texte assez long pour être replié dans une colonne étroite sans déborder sur la voisine.</p><table><tr><td>uneTrèsLongueCelluleSansEspacesQuiNeDoitPasDéborder_____________________________________</td></tr></table></section></div>');
                v.insertAdjacentHTML('beforeend', '<div data-essai2-host><p>caché</p></div><div class="zz-place"><section class="maintenance-panel"><h3>🧩 Inconnue</h3></section></div>');
                v.querySelector('[data-vsec="stats"]').insertAdjacentHTML('afterend', '<p class="so-row">🔗 un lien</p>');
            });
            await sleep(100);
            assert.deepStrictEqual(await strays(), []);
            const ids = await flowIds();
            assert.ok(ids.indexOf('essai_neuf') > ids.indexOf('stats') && ids.indexOf('x_zz') > ids.indexOf('popchart'), ids.join(','));
            assert.ok(await p.$eval('[data-vsec="essai_neuf"]', el => getComputedStyle(el).display !== 'none' && getComputedStyle(el).gridColumnStart === 'span 4'), 'montrée, à 1/3 comme le veut l’outil');
            assert.ok(await p.$eval('[data-vsec="essai_cache"]', el => getComputedStyle(el).display === 'none'), 'defaultShown: false');
            assert.ok(await p.$eval('[data-vsec="so_links"]', el => !!el.querySelector('.so-row')), 'la rangée de liens va dans « Chercher ce lieu en ligne »');
            const r = await p.$eval('[data-vsec="essai_neuf"]', el => { const b = el.getBoundingClientRect(); return [...el.querySelectorAll('*')].every(x => x.closest('table') && x.tagName !== 'TABLE' || x.getBoundingClientRect().right <= b.right + 2); });
            assert.ok(r, 'le contenu tient dans 1/3');
            await openOrg();
            for (const id of ['essai_neuf', 'essai_cache', 'x_zz']) assert.ok(await p.$(`[data-vl-row="${id}"] .vl-new`), 'Nouveau : ' + id);
            assert.strictEqual(await p.$('[data-vl-row="stats"] .vl-new'), null, 'pas « Nouveau » pour une partie déjà vue');
            assert.match(await p.textContent('[data-vl-row="x_zz"]'), /Inconnue/);
            await closeOrg(); await openOrg();
            assert.strictEqual(await p.$('[data-vl-row="essai_neuf"] .vl-new'), null, 'vue une fois : plus « Nouveau »');
            await closeOrg();
        });
        await t('une partie d’un outil éteint : grisée « (pas activé) » dans l’organisateur', async () => {
            await p.evaluate(() => window.LCNDA_EXT.villageSections.register({id: 'essai_off', host: '[data-essai3-host]', label: 'Outil éteint', group: 'Autour', enabled: () => false}));
            await openOrg();
            assert.ok(await p.$eval('[data-vl-row="essai_off"]', r => r.classList.contains('is-na') && /pas activé/.test(r.textContent)));
            await closeOrg();
        });
        await t('« Réglages enregistrés » garde l’organisation de la fiche (genealogie-village-layout)', async () => {
            assert.strictEqual(await p.evaluate(k => window.LCNDA_EXT.settingsRegistry?.isAllKey(k), KEY), true);
        });
        await t('390 px : la fiche et l’organisateur tiennent dans l’écran (pas de défilement de côté)', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await openVillage();
            const over = await p.evaluate(() => [document.documentElement.scrollWidth, ...[...document.querySelectorAll('.h-village-flow > [data-vsec]')].filter(x => getComputedStyle(x).display !== 'none').map(x => Math.round(x.getBoundingClientRect().right))]);
            assert.ok(over.every(x => x <= 391), over.join(','));
            await openOrg();
            const d = await p.$eval('.vl-dialog', el => { const b = el.getBoundingClientRect(); const btns = [...el.querySelectorAll('.vl-foot button')].map(x => x.getBoundingClientRect()); return {l: b.left, r: b.right, foot: btns.every(x => x.left >= b.left + 4 && x.right <= b.right - 4)}; });
            assert.ok(d.l >= 0 && d.r <= 390 && d.foot, JSON.stringify(d));
            await closeOrg();
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('fiche d’une personne : chaque bloc des autres outils (LCNDA_EXT.personBlocks) est dans « Blocs de la fiche »', async () => {
            // un bloc absent de la liste n'a le droit d'exister que si son outil est éteint (il ne dessine alors rien sur la fiche)
            const missing = await p.evaluate(() => { const keys = (window.LCNDA_APP.defaultPersonBlocks || []).map(b => b[0]);
                return Object.keys(window.LCNDA_EXT.personBlocks || {}).filter(k => !keys.includes(k)).filter(k => { let h = ''; try { h = window.LCNDA_EXT.personBlocks[k](0, {person: {id: 1, kind: 'human'}, events: [], places: []}, {isLocked: false, editOnly: x => x}); } catch (_) { h = ''; } return !!String(h || '').trim(); }); });
            assert.deepStrictEqual(missing, []);
        });
        /* ═════════ « Nouveau » dans les autres listes à ranger (heritage-organiser-nouveau.js) ═════════ */
        await t('« Nouveau » : chaque forme de liste à ranger (ordre des menus, blocs de fiche, Réordonner, monographie, onglet commune)', async () => {
            const r = await p.evaluate(async () => {
                const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
                const N = window.LCNDA_EXT.organiserNouveau, host = document.createElement('div'); document.body.appendChild(host);
                const shapes = {
                    'liste:essai-order': keys => `<div class="order-list" id="essai-order">${keys.map(k => `<div class="order-row" data-order-key="${k}"><span class="order-grip">⠿</span><b>${k}</b></div>`).join('')}</div>`,
                    'fiche-blocs:human': keys => `<div class="fsed" data-fsed-kind="human"><div class="fsed-blocks" data-fsed-list="__loose">${keys.map(k => `<div class="order-row has-visibility fsed-brow" data-fsed-block="${k}" data-order-key="${k}"><b>${k}</b></div>`).join('')}</div></div>`,
                    'reordonner:Réordonner : Essai': keys => `<dialog open><div class="modal-head"><h2>Réordonner : Essai</h2></div><ol class="dashboard-reorder-list">${keys.map((k, i) => `<li class="dashboard-reorder-row" data-index="${i}"><b style="flex:1">${k}</b></li>`).join('')}</ol></dialog>`,
                    'monographie': keys => `<ol class="mp-list" data-mp-order>${keys.map(k => `<li data-k="${k}"><label class="checkbox-line"><input type="checkbox"> <span>${k}</span></label></li>`).join('')}</ol>`,
                    'onglet-commune': keys => `<ol class="h-book-order" data-place-order>${keys.map(k => `<li data-k="${k}"><label class="checkbox-line"><input type="checkbox"> <span>${k}</span></label></li>`).join('')}</ol>`,
                };
                const out = {};
                for (const [scope, html] of Object.entries(shapes)) {
                    host.innerHTML = html(['a', 'b']); await frame();
                    const first = host.querySelectorAll('.org-new').length, stored = (JSON.parse(localStorage.getItem(N.key) || '{}')[scope] || []).join(',');
                    host.innerHTML = html(['a', 'b', 'neuf']); await frame();
                    const badge = [...host.querySelectorAll('.org-new')].map(b => b.previousElementSibling?.textContent.trim());
                    host.innerHTML = html(['a', 'b', 'neuf']); await frame(); // redessinée pendant la visite : le « Nouveau » reste
                    const again = host.querySelectorAll('.org-new').length;
                    N.fresh.clear(); host.innerHTML = html(['a', 'b', 'neuf']); await frame(); // visite suivante : vue
                    out[scope] = {first, stored, badge, again, next: host.querySelectorAll('.org-new').length};
                }
                host.remove(); const st = JSON.parse(localStorage.getItem(N.key) || '{}'); Object.keys(shapes).forEach(k => delete st[k]); localStorage.setItem(N.key, JSON.stringify(st)); N.fresh.clear(); return out;
            });
            for (const [scope, x] of Object.entries(r)) {
                assert.strictEqual(x.first, 0, scope + ' : la première fois, rien de « Nouveau »'); assert.strictEqual(x.stored, 'a,b', scope);
                assert.deepStrictEqual(x.badge, ['neuf'], scope); assert.strictEqual(x.again, 1, scope); assert.strictEqual(x.next, 0, scope);
            }
        });
        await t('« Nouveau » dans Réglages : un bloc de fiche et un widget ajoutés par un outil arrivent dans leur liste, marqués', async () => {
            const visit = async (tab, sel) => { await p.evaluate(t => { try { localStorage.setItem('genealogie-reglages-presentation', 'a'); } catch (_) {} const A = window.LCNDA_APP; A.state.maintenanceTab = t; A.setModule('maintenance'); }, tab);
                for (let i = 0; i < 80 && !(await p.evaluate(x => !!document.querySelector(x), sel)); i++) await sleep(250);
                assert.ok(await p.evaluate(x => !!document.querySelector(x), sel), tab + ' : ' + sel); await sleep(400); };
            const go = async () => { await visit('design', '#dashboard-widget-catalog-order [data-order-key]'); await visit('design_sheets', '[data-fsed-kind="human"] [data-order-key]'); };
            await go();
            await p.evaluate(() => { const A = window.LCNDA_APP; A.defaultPersonBlocks.push(['essai_bloc', '🧪 Bloc d’essai']); window.LCNDA_EXT.personBlocks.essai_bloc = () => ''; A.defaultDashboardBlocks.push(['essai_widget', '🧪 Widget d’essai']); });
            await visit('design_sheets', '[data-fsed-kind="human"] [data-order-key]');
            assert.ok(await p.$('[data-order-key="essai_bloc"] .org-new'), 'bloc de fiche : ' + await p.$$eval('[data-order-key="essai_bloc"]', n => n.map(x => x.outerHTML.slice(0, 200) + ' @' + (x.closest('[id]')?.id || '')).join(' || ')));
            assert.strictEqual(await p.$('[data-fsed-kind="human"] [data-order-key]:not([data-order-key="essai_bloc"]) .org-new'), null, 'seulement le nouveau');
            await visit('design', '#dashboard-widget-catalog-order [data-order-key]');
            assert.ok(await p.$('#dashboard-widget-catalog-order [data-order-key="essai_widget"] .org-new'), 'widget');
            assert.strictEqual(await p.$('#dashboard-widget-catalog-order [data-order-key]:not([data-order-key="essai_widget"]) .org-new'), null, 'seulement le nouveau');
        });
        await t('« Nouveau » dans ⚙︎ Personnaliser de la monographie : une partie ajoutée par un outil', async () => {
            const open = () => p.evaluate(() => { const A = window.LCNDA_APP; A.state.graphPlaceMonograph = {...(A.state.graphPlaceMonograph || {}), id: 1, name: 'Honfleur', county: 'Calvados', showEvents: true}; A.state.graphMode = 'place_monograph'; A.setModule('graphiques'); });
            const panel = async () => { await p.waitForSelector('.place-monograph-sections[data-mp-mounted]', {timeout: 20000}); await sleep(300); await p.evaluate(() => { if (!document.querySelector('.mp-list[data-mp-order]')) document.querySelector('[data-mp-custom]').click(); }); await p.waitForSelector('.mp-list[data-mp-order] li[data-k]'); await sleep(300); };
            await open(); await panel();
            await p.evaluate(() => (window.LCNDA_EXT.monographSections = window.LCNDA_EXT.monographSections || []).push({id: 'essai_mono', icon: '🧪', label: 'Partie d’essai', group: 'Le lieu', defaultOn: true, render: async (place, host) => { host.innerHTML = '<p>essai</p>'; return true; }}));
            await open(); await panel();
            assert.ok(await p.$('.mp-list li[data-k="essai_mono"] .org-new'), await p.$$eval('.mp-list li[data-k]', n => n.map(x => x.dataset.k + (x.querySelector('.org-new') ? '*' : '')).join(',')));
            assert.strictEqual(await p.$$eval('.mp-list .org-new', n => n.length), 1);
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} essai(s) en échec` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
