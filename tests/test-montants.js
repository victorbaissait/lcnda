#!/usr/bin/env node
/* 💰📏 Les montants et les mesures, là où ils sont écrits (app-montants-core.js, 🪙 Convertisseur d'autrefois, Atelier, inventaires).
 *  1. calcul : nombres en lettres (« trois cents », « quatre-vingt-seize »), sommes et mesures repérées dans une phrase (« un arpent et demi »,
 *     « douze livres dix sols six deniers », « cinq pieds deux pouces »), « dix livres de pain » = un poids ; livre parisis et de Lorraine ;
 *     chaque région de mesures a sa source et ses départements ; les prix sourcés de l'année ;
 *  2. Atelier : les sommes et les mesures soulignées en vert, la bulle (≈ € d'aujourd'hui, en mètres, la source), un réglage pour l'éteindre ;
 *     « Voir le calcul » ouvre le Convertisseur avec l'année de l'acte ;
 *  3. inventaire après décès : « ≈ € d'aujourd'hui » sur la fiche, pour chaque objet et pour le total du formulaire.
 *   node tests/test-montants.js */
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
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

global.window = {LCNDA_EXT: {}};
require('../assets/js/heritage-calendar-more.js');
const CM = window.LCNDA_EXT.calendarMore;
const F = require('../assets/js/app-autrefois-engine.js'); window.LCNDA_AUTREFOIS = F;
const M = require('../assets/js/app-montants-core.js');
const TEXT = 'Ont vendu pour la somme de trois cents livres tournois un arpent et demi de pré, plus douze livres dix sols six deniers et dix livres de pain ; ledit haut de cinq pieds deux pouces.';

(async () => {
    await t('calcul : les nombres en lettres', async () => {
        for (const [w, n] of [['trois cents', 300], ['dix-huit', 18], ['quatre-vingt-seize', 96], ['quatre-vingts', 80], ['deux mille cinq cents', 2500], ['1 200', 1200], ['vingt et un', 21], ['soixante-dix', 70], ['six-vingts', 120]]) assert.strictEqual(M.numberAt(w), n, w);
        assert.strictEqual(M.numberAt('bonjour'), null);
    });
    await t('calcul : les sommes et les mesures d’une phrase (un poids n’est pas une somme)', async () => {
        const h = M.scan(TEXT);
        assert.deepStrictEqual(h.map(x => [x.type, x.raw, x.norm]), [['money', 'trois cents livres tournois', '300 livres tournois'], ['measure', 'un arpent et demi', '1.5 arpent'],
            ['money', 'douze livres dix sols six deniers', '12 livres 10 sols 6 deniers'], ['measure', 'cinq pieds deux pouces', '5 pieds 2 pouces']]);
        h.forEach(x => assert.strictEqual(TEXT.slice(x.s, x.e), x.raw));
        assert.deepStrictEqual(M.scan('Le franc et quitte, vingt pieds'), [{s: 20, e: 31, type: 'measure', raw: 'vingt pieds', norm: '20 pieds'}]);
    });
    await t('calcul : la bulle (euros, pain, source ; mètres, source par région)', async () => {
        const [money, measure] = M.scan(TEXT);
        const a = M.explain(money, {year: 1785, calendarMore: CM});
        assert.match(a.lines[0], /^300 livres \(1785\) ≈ [\d\s\u202f]+ € d’aujourd’hui$/); assert.match(a.lines[1], /kg de pain/); assert.strictEqual(a.url, F.SOURCE_URL);
        assert.deepStrictEqual(a.convert, {tab: 'argent', value: '300 livres tournois', year: 1785});
        assert.match(M.explain(money, {}).lines[0], /date de l’acte/);
        const b = M.explain(measure, {region: 'paris', calendarMore: CM});
        assert.match(b.lines[0], /1,5 arpent de Paris = 51,28 a/); assert.match(b.source, /Tables de comparaison/); assert.match(b.url, /^https:\/\/fr\.wikipedia\.org\//);
        assert.match(M.explain({type: 'measure', norm: '2 journaux'}, {region: 'bretagne', calendarMore: CM}).source, /Ille-et-Vilaine/);
        CM.REGIONS.forEach(r => { assert.ok(r.src && /^https:\/\/fr\.wikipedia\.org\//.test(r.url) && r.deps.length, r.id); });
        assert.strictEqual(CM.regionOfDept('35'), 'bretagne'); assert.strictEqual(CM.regionOfDept('6'), 'provence'); assert.strictEqual(CM.regionOfDept('19'), '');
    });
    await t('calcul : monnaies de compte (livre parisis, livre de Lorraine) ; les prix sourcés de l’année', async () => {
        assert.deepStrictEqual([F.readSum('12 livres parisis').value, F.readSum('10 livres de Lorraine').value], [3600, 1860]);
        assert.match(F.readSum('10 livres de Lorraine').label, /Lorraine \(= 7 livres 15 sous\)/);
        const doc = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/prix-reference.json'), 'utf8'));
        assert.deepStrictEqual(M.prices(1789, doc).map(p => p.id), ['pain-paris-1789']); assert.deepStrictEqual(M.prices(1600, doc), []);
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-montants-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
act_transcriptions_ensure($pdo);
$a = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,body,data_json,date_text,place,updated_at) VALUES(?,?,?,?,?,?,?,?)");
$a->execute([1, 'Vente MAZAUD, 1785', 'autre', getenv('TX_BODY'), '{"zones":[],"people":[]}', '12 mars 1785', 'Paris (75)', '2026-01-01']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env: {...env, TX_BODY: TEXT}});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_MONTANTS && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const D = 'dialog.h-tx-dlg';
        const spans = () => p.evaluate(D => [...document.querySelectorAll(`${D} [data-tx-mirror] .h-tx-ab.is-amount`)].map(s => s.textContent), D);
        await t('Atelier : sommes et mesures soulignées ; la bulle ; « Voir le calcul » → le Convertisseur avec l’année de l’acte', async () => {
            await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({id: 1}));
            await p.waitForSelector(`${D} [data-tx-body]`, {timeout: 15000}); await sleep(800);
            assert.deepStrictEqual(await spans(), ['trois cents livres tournois', 'un arpent et demi', 'douze livres dix sols six deniers', 'cinq pieds deux pouces']);
            const r = await p.evaluate(D => { const s = document.querySelector(`${D} [data-tx-mirror] .h-tx-ab.is-amount`).getBoundingClientRect(); return {x: s.left + s.width / 2, y: s.top + s.height / 2}; }, D);
            await p.mouse.move(r.x - 80, r.y - 60); await p.mouse.move(r.x, r.y, {steps: 4});
            await p.waitForFunction(D => !document.querySelector(`${D} [data-tx-abtip]`).hidden, D, {timeout: 3000});
            const tip = await p.textContent(`${D} [data-tx-abtip]`);
            assert.match(tip, /300 livres \(1785\) ≈ .+ € d’aujourd’hui/); assert.match(tip, /kg de pain/); assert.match(tip, /INSEE/);
            await p.click(`${D} [data-tx-abtip] [data-tx-abopen]`);
            await p.waitForSelector('dialog.af-dialog[open] [data-af-sum]', {timeout: 5000});
            assert.deepStrictEqual(await p.evaluate(() => [document.querySelector('dialog.af-dialog [data-af-sum]').value, document.querySelector('dialog.af-dialog [data-af-year]').value]), ['300 livres tournois', '1785']);
            await p.evaluate(() => document.querySelector('dialog.af-dialog').close()); await sleep(200);
            // la mesure : sa source
            const r2 = await p.evaluate(D => { const s = [...document.querySelectorAll(`${D} [data-tx-mirror] .h-tx-ab.is-amount`)][1].getBoundingClientRect(); return {x: s.left + s.width / 2, y: s.top + s.height / 2}; }, D);
            await p.mouse.move(r2.x, r2.y + 40); await p.mouse.move(r2.x, r2.y, {steps: 4}); await sleep(400);
            assert.match(await p.textContent(`${D} [data-tx-abtip]`), /51,28 a.*Tables de comparaison/s);
            await p.evaluate(() => window.LCNDA_EXT.txView.setAmountsOn(false)); await sleep(300);
            assert.deepStrictEqual(await spans(), [], 'le réglage les éteint');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-tx-montants')), '0');
            await p.evaluate(() => window.LCNDA_EXT.txView.setAmountsOn(true));
            await p.evaluate(D => { const d = document.querySelector(D); d.querySelector('[data-tx-cmd="close"]')?.click(); }, D); await sleep(300);
            await p.evaluate(() => document.querySelectorAll('.confirm-dialog, dialog.h-tx-dlg').forEach(d => { try { d.close(); } catch (_) {} d.remove(); }));
        });
        await t('Convertisseur : les prix sourcés de l’année ; la source des mesures', async () => {
            await p.evaluate(() => window.LCNDA_EXT.autrefois.open({tab: 'argent', value: '300 livres', year: '1789'}));
            await p.waitForFunction(() => /Les prix de cette année-là/.test(document.querySelector('dialog.af-dialog [data-af-out="argent"]')?.textContent || ''), null, {timeout: 5000});
            assert.match(await p.textContent('dialog.af-dialog [data-af-out="argent"]'), /14 sous et demi.*Rudé/s);
            await p.evaluate(() => document.querySelector('dialog.af-dialog').close()); await sleep(200);
            await p.evaluate(() => window.LCNDA_EXT.autrefois.open({tab: 'mesures', value: '3 arpents'}));
            await p.waitForFunction(() => /Source/.test(document.querySelector('dialog.af-dialog [data-af-out="mesures"]')?.textContent || ''), null, {timeout: 5000});
            await p.evaluate(() => document.querySelector('dialog.af-dialog').close()); await sleep(200);
        });
        await t('inventaire après décès : « ≈ € d’aujourd’hui » sur la fiche, par objet et au total', async () => {
            const r = await p.evaluate(async () => { const x = await window.LCNDA_APP.api('save_probate_inventory', {}, {method: 'POST', body: {person_id: 1, date_text: '12 mars 1782', notary: 'Me Dubois', place_text: 'Tulle', currency: 'livre',
                items: [{room: 'Cuisine', category: 'meubles', description: 'Une table de noyer', quantity: '1', value_text: '3 l 10 s'}, {room: 'Étable', category: 'betail', description: 'Deux vaches', quantity: '2', value_text: '60 l'}]}}); return x.result || x; });
            assert.ok(r.id || r.ok, JSON.stringify(r));
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('.h-probate-total', {timeout: 20000});
            assert.match(await p.textContent('.h-probate-total'), /≈ [\d\s\u202f]+ € d’aujourd’hui/);
            await p.evaluate(() => document.querySelector('[data-h-open-list="probate"][data-h-edit]:not([data-h-edit="0"])').click());
            await p.waitForSelector('#h-probate-form [data-h-item-eur]', {timeout: 20000}); await sleep(300);
            const cells = await p.evaluate(() => [...document.querySelectorAll('#h-probate-form [data-h-item-eur]')].map(c => c.textContent).filter(Boolean));
            assert.strictEqual(cells.length, 2); cells.forEach(c => assert.match(c, /^≈ [\d\s\u202f,]+ €$/));
            assert.match(await p.textContent('#h-probate-form .h-probate-live'), /€ d’aujourd’hui/);
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
