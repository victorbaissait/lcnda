#!/usr/bin/env node
/* 🧾 ALTO et 📄 PAGE, et les zones typées de l'Atelier (assets/js/heritage-transcribe-xml.js) :
 *  1. sans navigateur : une zone « ⛔ à ne pas lire » n'est jamais exportée ; une mention en marge fait son bloc, dans l'ordre des zones ;
 *     ALTO : lignes et mots placés ; PAGE : régions typées, ordre de lecture, un fichier par page ;
 *  2. serveur : la sorte de zone est gardée (une sorte inconnue ne l'est pas) ;
 *  3. dans l'Atelier : la barre de la zone choisit sa sorte (↶), la zone ⛔ est grise ; l'export propose ALTO et PAGE ; la lecture
 *     imprimée saute les lignes d'une zone ⛔. Personnes fictives.
 *   node tests/test-transcribe-xml.js */
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
global.window = global;
const X = require('../assets/js/heritage-transcribe-xml.js');

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BODY = 'Mention : décédé en 1850\nLe vingt mai mil huit cent dix\nest né Jean MAZAUD fils de Pierre\nCachet de la mairie';
// la ligne 1 dans la marge (zone m), les lignes 2-3 au centre, la ligne 4 dans une zone ⛔
const DATA = {zones: [
    {id: 'm', x: 10, y: 20, w: 120, h: 60, s: 0, e: 0, note: '', c: '', kind: 'margin'},
    {id: 'l1', x: 20, y: 30, w: 100, h: 20, s: 0, e: 24, note: '', c: '', src: 'htr'},
    {id: 'l2', x: 160, y: 40, w: 400, h: 24, s: 25, e: 55, note: '', c: '', src: 'htr'},
    {id: 'l3', x: 160, y: 70, w: 400, h: 24, s: 56, e: 89, note: '', c: '', src: 'htr'},
    {id: 'k', x: 150, y: 200, w: 300, h: 80, s: 0, e: 0, note: '', c: '', kind: 'skip'},
    {id: 'l4', x: 200, y: 220, w: 200, h: 20, s: 90, e: 109, note: '', c: '', src: 'htr'},
    {id: 'bad', x: 1, y: 1, w: 5, h: 5, s: 0, e: 0, note: '', c: '', kind: 'n’importe'}], people: []};
const line = (txt, z) => ({text: txt, box: z ? {x: z.x, y: z.y, w: z.w, h: z.h} : null});
const PAGES = () => { const L = BODY.split('\n'), Z = id => DATA.zones.find(z => z.id === id); return [{n: '1', file: 'acte.png', w: 600, h: 300, zones: DATA.zones.filter(z => z.kind), lines: [line(L[0], Z('l1')), line(L[1], Z('l2')), line(L[2], Z('l3')), line(L[3], Z('l4'))].map((l, i) => ({...l, id: i + 1}))}]; };

(async () => {
    await t('⛔ jamais exporté ; la marge fait son bloc, avant le texte (ordre des zones)', () => {
        const P = X.clean(PAGES()); assert.strictEqual(P[0].lines.length, 3, 'la ligne du cachet est sautée');
        const R = X.regions(P[0]); assert.deepStrictEqual(R.map(r => [r.kind, r.lines.length]), [['margin', 1], ['', 2]]);
        assert.deepStrictEqual(R[0].box, {x: 10, y: 20, w: 120, h: 60}, 'le bloc de la marge a la taille de sa zone');
        assert.ok(X.inSkip(DATA.zones, {x: 200, y: 220, w: 200, h: 20})); assert.ok(!X.inSkip(DATA.zones, {x: 160, y: 40, w: 400, h: 24}));
    });
    await t('ALTO : blocs, lignes et mots placés ; caractères protégés', () => {
        const a = X.alto(PAGES(), {title: 'Naissance <Jean> & co'});
        assert.match(a, /<alto xmlns="http:\/\/www\.loc\.gov\/standards\/alto\/ns-v4#"/); assert.match(a, /<Page ID="p1" PHYSICAL_IMG_NR="1" WIDTH="600" HEIGHT="300">/);
        assert.strictEqual((a.match(/<TextBlock /g) || []).length, 2); assert.strictEqual((a.match(/<TextLine /g) || []).length, 3);
        assert.match(a, /<TextBlock ID="b1_1" TAGREFS="margin" HPOS="10" VPOS="20" WIDTH="120" HEIGHT="60">/);
        assert.match(a, /<String CONTENT="MAZAUD" HPOS="\d+" VPOS="70" WIDTH="\d+" HEIGHT="24"\/>/); assert.match(a, /Naissance &lt;Jean&gt; &amp; co/);
        assert.doesNotMatch(a, /Cachet/);
    });
    await t('PAGE : un fichier par page, régions typées, ordre de lecture, lignes avec ligne de base', () => {
        const F = X.page([...PAGES(), {n: '2', file: 'verso.jpg', w: 0, h: 0, zones: [], lines: [{id: 1, text: 'Signé MAZAUD', box: null}]}], {created: '2026-11-24T10:00:00'});
        assert.deepStrictEqual(F.map(f => f.name), ['001_acte.xml', '002_verso.xml']);
        const x = F[0].xml; assert.match(x, /<PcGts xmlns="http:\/\/schema\.primaresearch\.org\/PAGE\/gts\/pagecontent\/2019-07-15">/);
        assert.match(x, /<TextRegion id="r1" type="marginalia"/); assert.match(x, /<TextRegion id="r2" type="paragraph"/);
        assert.match(x, /<RegionRefIndexed index="0" regionRef="r1"\/>/); assert.match(x, /<Coords points="160,40 560,40 560,64 160,64"\/>/);
        assert.match(x, /<Unicode>est né Jean MAZAUD fils de Pierre<\/Unicode>/); assert.doesNotMatch(x, /Cachet/);
        assert.match(F[1].xml, /Signé MAZAUD/);
    });

    /* ── 2 et 3. serveur et Atelier ── */
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-txx-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Gaspard','MAZAUD','male','deceased',1)");
$im = imagecreatetruecolor(600, 300); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . '/acte.png');
$pdo->exec("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(1,'Mariage','acte.png','acte.png','image')");
act_transcriptions_ensure($pdo);
$pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(1,'Mariage de Gaspard','mariage',1,?,?,'2026-01-01')")->execute([getenv('TX_BODY'), getenv('TX_DATA')]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env: {...env, TX_BODY: BODY, TX_DATA: JSON.stringify(DATA)}});
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txXml && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (a, q = {}) => p.evaluate(async ([x, y]) => window.LCNDA_APP.api(x, y), [a, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        await t('serveur : l’acte et ses zones se lisent', async () => {
            const d = await api('act_transcription', {id: 1}); const T = d.item || d.transcription || d;
            const zs = (T.data || JSON.parse(T.data_json || '{}')).zones || [];
            if (!zs.length) throw new Error('zones absentes : ' + JSON.stringify(d).slice(0, 300));
        });
        await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({id: 1}));
        await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000}); await sleep(600);
        await t('la zone ⛔ est grise et en pointillé ; la barre de la zone choisit sa sorte (↶ Annuler)', async () => {
            const k = await p.evaluate(() => { const r = document.querySelector('dialog.h-tx-dlg [data-tx-zone="k"]'); return {cls: r.getAttribute('class'), fill: r.getAttribute('fill'), dash: !!r.getAttribute('stroke-dasharray')}; });
            assert.match(k.cls, /is-k-skip/); assert.strictEqual(k.fill, '#6b7280'); assert.ok(k.dash);
            await p.evaluate(() => { const ta = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); ta.focus(); ta.setSelectionRange(30, 30); ta.dispatchEvent(new MouseEvent('click', {bubbles: true})); }); // un clic dans le texte : sa zone est choisie
            await p.waitForSelector('dialog.h-tx-dlg [data-tx-zkind]', {timeout: 5000});
            const opts = await p.$$eval('dialog.h-tx-dlg [data-tx-zkind] option', o => o.map(x => x.textContent)); assert.ok(opts.some(o => /À ne pas lire/.test(o)) && opts.length === 6, opts.join('|'));
            await p.selectOption('dialog.h-tx-dlg [data-tx-zkind]', 'head');
            assert.match(await p.getAttribute('dialog.h-tx-dlg [data-tx-zone="l2"]', 'class'), /is-k-head/);
            await sleep(600); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-hist="undo"]').click()); await sleep(300);
            assert.doesNotMatch(await p.getAttribute('dialog.h-tx-dlg [data-tx-zone="l2"]', 'class') || '', /is-k-head/, '↶ Annuler');
        });
        await t('Exporter : 🧾 ALTO et 📄 PAGE (sans la ligne de la zone ⛔)', async () => {
            const r = await p.evaluate(async () => { const UI = window.LCNDA_UI, keep = UI.openExportDialog; let ex = null; UI.openExportDialog = o => { ex = o; };
                try { document.querySelector('dialog.h-tx-dlg [data-tx-cmd="export"]').click(); await new Promise(r => setTimeout(r, 200)); } finally { UI.openExportDialog = keep; }
                const got = []; const keepC = URL.createObjectURL; URL.createObjectURL = b => { got.push(b); return keepC.call(URL, b); };
                const keepClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { got.push(this.download); };
                try { for (const id of ['alto', 'pagexml']) await ex.formats.find(f => f.id === id).run({filename: 'acte.xml', checks: {}}); } finally { URL.createObjectURL = keepC; HTMLAnchorElement.prototype.click = keepClick; }
                const texts = []; for (const g of got) texts.push(typeof g === 'string' ? g : await g.text());
                return {ids: ex.formats.map(f => f.id), texts}; });
            assert.ok(r.ids.includes('alto') && r.ids.includes('pagexml') && r.ids.includes('tei'), r.ids.join(','));
            const alto = r.texts.find(x => /<alto /.test(x)), pg = r.texts.find(x => /<PcGts /.test(x));
            assert.ok(alto && pg); assert.doesNotMatch(alto + pg, /Cachet/); assert.match(alto, /TAGREFS="margin"/); assert.match(pg, /type="marginalia"/); assert.match(alto, /WIDTH="600" HEIGHT="300"/);
        });
        await t('enregistrer : la sorte des zones reste ; une sorte inconnue est retirée', async () => {
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(900);
            const d = await api('act_transcription', {id: 1}); const s = JSON.stringify(d);
            assert.match(s, /"id":"k"[^}]*"kind":"skip"/); assert.match(s, /"id":"m"[^}]*"kind":"margin"/); assert.doesNotMatch(s, /n’importe/);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); }
    console.log(fails ? `${fails} essai(s) en échec` : 'ALTO, PAGE et les zones typées marchent.');
    process.exit(fails ? 1 : 0);
})();
