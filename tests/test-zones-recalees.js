#!/usr/bin/env node
/* 🧲 Atelier de transcription : les zones reliées aux lignes, décalées d'un caractère sur les anciennes transcriptions.
 * La cause : la case du texte était remplie par du HTML (<textarea>texte</textarea>), qui mange le saut de ligne du tout début :
 * un texte qui commençait par une ligne vide perdait 1 caractère et toutes les zones commençaient une lettre trop tard (le « A » de
 * « Aujourd'hui » hors de la couleur), et le cadre 🔦 des mots choisis ne s'affichait plus pour un choix à la 1re lettre d'une ligne.
 *  1. une ancienne transcription (zones +1 sur chaque ligne) : à l'ouverture, les zones sont recalées, message « N lignes recalées
 *     sur le texte » avec ↶ Annuler ; une zone de plusieurs lignes et une zone sans texte (signature) ne bougent pas ;
 *  2. Édition → « 🧲 Recaler les zones sur les lignes » (avec ↶ Annuler) ;
 *  3. 🔦 un choix qui commence à la 1re lettre d'une ligne, sur deux lignes, au clavier : le cadre sur l'image ;
 *  4. la cause : un texte qui commence par une ligne vide garde ce saut de ligne (les zones restent justes) ; \r\n → \n avec les zones ;
 *     une lettre écrite au tout début d'une ligne reliée reste dans sa zone.
 *   node tests/test-zones-recalees.js
 * Personnes et lieux fictifs. */
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
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 20).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LINES = ['Mariage de Pierre FAUVEL et Jeanne ROUSSIN', 'Aujourd’hui Vingt-huit janvier mil sept cent', 'quatre-vingt-dix, après la publication', 'protestation faite au prône de la messe', 'paroissiale de ce lieu, sans opposition'];
const BODY = LINES.join('\n');
const lineRanges = body => { const out = []; let pos = 0; body.split('\n').forEach(l => { out.push({s: pos, e: pos + l.length}); pos += l.length + 1; }); return out; };
const R = lineRanges(BODY);
// l'ancienne transcription : chaque zone de ligne commence (et finit) un caractère trop tard ; lignes 4-5 : une zone voulue sur deux
// lignes (juste) ; une zone de signature sans texte
const OLD_ZONES = [0, 1, 2].map(i => ({id: 'l' + i, x: 30, y: 30 + i * 60, w: 520, h: 40, s: R[i].s + 1, e: R[i].e + 1, src: 'deep'}))
    .concat([{id: 'l34', x: 30, y: 210, w: 520, h: 100, s: R[3].s, e: R[4].e, src: 'deep'}, {id: 'sig', x: 300, y: 400, w: 200, h: 60, s: 0, e: 0, kind: 'sign', note: 'Signature du curé'}]);
// la cause : un texte qui commence par une ligne vide, ses zones justes
const NL_BODY = '\n' + BODY, NL_R = lineRanges(NL_BODY);
const NL_ZONES = [1, 2, 3].map(i => ({id: 'n' + i, x: 30, y: 30 + (i - 1) * 60, w: 520, h: 40, s: NL_R[i].s, e: NL_R[i].e, src: 'deep'}));
// \r\n : les zones posées sur le texte avec \r\n
const CR_BODY = LINES.slice(0, 3).join('\r\n'), CR_R = (() => { const out = []; let pos = 0; LINES.slice(0, 3).forEach(l => { out.push({s: pos, e: pos + l.length}); pos += l.length + 2; }); return out; })();
const CR_ZONES = CR_R.map((r, i) => ({id: 'c' + i, x: 30, y: 30 + i * 60, w: 520, h: 40, s: r.s, e: r.e, src: 'deep'}));

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-zones-recalees-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = (code, extra = {}) => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env: {...env, ...extra}});
    const seed = php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','FAUVEL','male','deceased',1)");
foreach ([1,2,3] as $i) { $im = imagecreatetruecolor(600, 500); imagefill($im, 0, 0, imagecolorallocate($im, 232, 220, 190)); $ink = imagecolorallocate($im, 60, 45, 30);
  for ($l = 0; $l < 5; $l++) for ($x = 40; $x < 540; $x += 9) imagefilledrectangle($im, $x, 40 + $l * 60, $x + 5, 60 + $l * 60, $ink);
  imagepng($im, MEDIA_DIR . "/acte$i.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')");
foreach ([1,2,3] as $i) $m->execute([$i, "Mariage FAUVEL $i", "acte$i.png", "acte$i.png"]);
act_transcriptions_ensure($pdo);
$a = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(?,?,?,?,?,?,?)");
$a->execute([1, 'Mariage FAUVEL (ancien)', 'mariage', 1, getenv('B1'), getenv('D1'), '2026-01-01 10:00:00']);
$a->execute([2, 'Mariage FAUVEL (ligne vide)', 'mariage', 2, getenv('B2'), getenv('D2'), '2026-01-01 10:00:00']);
$a->execute([3, 'Mariage FAUVEL (CRLF)', 'mariage', 3, getenv('B3'), getenv('D3'), '2026-01-01 10:00:00']);
echo json_encode(['ok' => 1]);`, {B1: BODY, D1: JSON.stringify({zones: OLD_ZONES, people: [], status: 'doing'}), B2: NL_BODY, D2: JSON.stringify({zones: NL_ZONES, people: [], status: 'doing'}),
        B3: CR_BODY, D3: JSON.stringify({zones: CR_ZONES, people: [], status: 'doing'})});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }

    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txSnap && window.LCNDA_EXT?.txCtx, null, {timeout: 30000});
        const D = 'dialog.h-tx-dlg';
        const closeAtelier = async () => { await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); if (d) d.querySelector('[data-tx-cmd="close"]')?.click(); }); await sleep(250);
            await p.evaluate(() => { const c = [...document.querySelectorAll('dialog[open]')].find(d => /Fermer sans enregistrer/.test(d.textContent) && !d.classList.contains('h-tx-dlg')); c?.querySelector('button.danger, [value="default"], button[type="submit"]')?.click(); }); await sleep(250);
            await p.evaluate(() => { document.querySelectorAll('dialog.h-tx-dlg').forEach(d => { try { d.close(); } catch (_) {} d.remove(); }); document.querySelectorAll('.ui-toast').forEach(x => x.remove()); }); };
        const openTx = async id => { await closeAtelier(); await p.evaluate(i => window.LCNDA_EXT.openActTranscriber({id: i}), id);
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000}); await sleep(600); };
        const st = () => p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), g = d.txApi.get();
            return {body: d.querySelector('[data-tx-body]').value, zones: g.data.zones.map(z => ({id: z.id, s: z.s, e: z.e})), marks: [...d.querySelectorAll('[data-tx-mirror] mark.h-tx-zm')].map(m => m.textContent), snap: JSON.parse(d.dataset.txSnap || 'null')}; });
        const toastOf = re => p.evaluate(src => { const rx = new RegExp(src); return [...document.querySelectorAll('.ui-toast')].filter(x => rx.test(x.textContent)).map(x => x.textContent).at(-1) || ''; }, re);
        const undoLast = async re => { const ok = await p.evaluate(src => { const rx = new RegExp(src); const tt = [...document.querySelectorAll('.ui-toast')].filter(x => rx.test(x.textContent)).at(-1); const b = tt && [...tt.querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)); if (b) b.click(); return !!b; }, re); assert.ok(ok, 'pas de ↶ Annuler pour ' + re); await sleep(500); };
        const select = (s, e) => p.evaluate(([a, b]) => { const x = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); x.focus(); x.setSelectionRange(a, b); }, [s, e]);
        const words = async () => { await sleep(150); return p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); return {n: Number(d.dataset.txWords || 0), boxes: [...d.querySelectorAll('[data-tx-wbox]')].map(r => ({x: Number(r.getAttribute('x')), y: Number(r.getAttribute('y'))}))}; }); };

        await t('la recherche des zones décalées (snapZones) : +1 recalé, plusieurs lignes et signature laissées, un mot dans la ligne laissé', async () => {
            const r = await p.evaluate(([b, z]) => window.LCNDA_EXT.txSnap.snapZones(b, z), [BODY, OLD_ZONES]);
            assert.deepEqual(r.fixes.map(f => [f.id, f.s, f.e]), [0, 1, 2].map(i => ['l' + i, R[i].s, R[i].e]));
            assert.equal(r.left, 0);
            const w = await p.evaluate(([b, s]) => window.LCNDA_EXT.txSnap.snapZones(b, [{id: 'w', s, e: s + 11}]), [BODY, R[1].s]); // « Aujourd’hui » : un mot, pas une ligne
            assert.equal(w.fixes.length, 0, 'une zone sur un mot reste'); assert.equal(w.left, 0);
            const n = await p.evaluate(b => window.LCNDA_EXT.txSnap.normBody(b, [[{s: 47, e: 92}]]), 'a\r\nb'); assert.equal(n, 'a\nb');
        });

        await t('1. une ancienne transcription : à l’ouverture, les zones commencent au début de chaque ligne, message + ↶ Annuler', async () => {
            await openTx(1);
            const s = await st();
            assert.equal(s.body, BODY);
            ['l0', 'l1', 'l2'].forEach((id, i) => { const z = s.zones.find(q => q.id === id); assert.deepEqual([z.s, z.e], [R[i].s, R[i].e], `zone ${id} recalée`); });
            assert.deepEqual(s.zones.find(q => q.id === 'l34'), {id: 'l34', s: R[3].s, e: R[4].e}, 'la zone de deux lignes ne bouge pas');
            assert.deepEqual(s.zones.find(q => q.id === 'sig'), {id: 'sig', s: 0, e: 0}, 'la signature (sans texte) ne bouge pas');
            assert.equal(s.marks[1], LINES[1], 'la couleur commence au « A » de « Aujourd’hui »');
            assert.ok(s.marks[1].startsWith('A'));
            assert.match(await toastOf('recalées'), /3 lignes recalées sur le texte/);
            assert.deepEqual(s.snap, {fixed: 3, left: 0, auto: true});
        });

        await t('3. 🔦 un choix à la 1re lettre d’une ligne : le cadre sur l’image (souris, deux lignes, clavier)', async () => {
            await select(R[1].s, R[1].s + 'Aujourd’hui Vingt-huit'.length);
            let w = await words(); assert.equal(w.n, 1, 'un cadre pour « Aujourd’hui Vingt-huit »'); assert.ok(Math.abs(w.boxes[0].x - 30) < 2, 'le cadre commence au bord de la zone : ' + w.boxes[0].x);
            await select(R[1].s + 12, R[2].s + 5); w = await words(); assert.equal(w.n, 2, 'un choix sur deux lignes : deux cadres');
            // au clavier (Maj + flèche), sans événement « select » envoyé à la main
            await select(R[2].s, R[2].s); await p.keyboard.down('Shift'); for (let i = 0; i < 6; i++) await p.keyboard.press('ArrowRight'); await p.keyboard.up('Shift');
            w = await words(); assert.equal(w.n, 1, 'Maj + flèches : le cadre');
            // plus rien de choisi : plus de cadre
            await select(0, 0); await sleep(100); assert.equal((await words()).n, 0);
        });

        await t('1b. ↶ Annuler remet les zones d’avant (décalées) ; le cadre 🔦 s’affiche quand même pour un choix à la 1re lettre', async () => {
            await undoLast('recalées');
            const s = await st();
            ['l0', 'l1', 'l2'].forEach((id, i) => { const z = s.zones.find(q => q.id === id); assert.deepEqual([z.s, z.e], [R[i].s + 1, R[i].e + 1], `zone ${id} remise`); });
            assert.ok(!s.marks[1].startsWith('A'), 'de nouveau décalée');
            await select(R[1].s, R[1].s + 'Aujourd’hui'.length); assert.equal((await words()).n, 1, 'le cadre malgré la zone décalée');
        });

        await t('2. Édition → « 🧲 Recaler les zones sur les lignes », puis ↶ Annuler', async () => {
            await p.click(`${D} [data-ui-menu="Édition"]`); await sleep(150);
            await p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Recaler les zones sur les lignes'}).first().click(); await sleep(400);
            let s = await st();
            ['l0', 'l1', 'l2'].forEach((id, i) => { const z = s.zones.find(q => q.id === id); assert.deepEqual([z.s, z.e], [R[i].s, R[i].e]); });
            assert.equal(s.marks[1], LINES[1]); assert.deepEqual(s.snap, {fixed: 3, left: 0, auto: false});
            assert.deepEqual(s.zones.find(q => q.id === 'l34'), {id: 'l34', s: R[3].s, e: R[4].e});
            await undoLast('recalées'); s = await st(); assert.equal(s.zones.find(q => q.id === 'l1').s, R[1].s + 1);
            // une deuxième fois : rien à recaler après un recalage
            await p.click(`${D} [data-ui-menu="Édition"]`); await sleep(150); await p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Recaler les zones sur les lignes'}).first().click(); await sleep(300);
            await p.click(`${D} [data-ui-menu="Édition"]`); await sleep(150); await p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Recaler les zones sur les lignes'}).first().click(); await sleep(300);
            assert.match(await toastOf('déjà calées'), /déjà calées/);
        });

        await t('4a. la cause : un texte qui commence par une ligne vide garde son saut de ligne ; zones justes, rien de recalé', async () => {
            await openTx(2);
            const s = await st();
            assert.equal(s.body, NL_BODY, 'le saut de ligne du début est gardé');
            assert.deepEqual(s.zones.map(z => [z.s, z.e]), [1, 2, 3].map(i => [NL_R[i].s, NL_R[i].e]));
            assert.equal(s.marks[1], LINES[1]); assert.equal(await toastOf('recalées'), '');
            // et enregistré tel quel : les zones restent justes à la réouverture
            await p.click(`${D} [data-tx-cmd="save"]`); await sleep(800);
            await openTx(2); const s2 = await st(); assert.equal(s2.body, NL_BODY); assert.equal(s2.marks[0], LINES[0]);
        });

        await t('4b. un texte avec \\r\\n : ramené à \\n, les zones suivent (aucune ne glisse d’une ligne à l’autre)', async () => {
            await openTx(3);
            const s = await st(); assert.equal(s.body, LINES.slice(0, 3).join('\n'));
            assert.deepEqual(s.marks, LINES.slice(0, 3));
        });

        await t('4c. une lettre écrite au tout début d’une ligne reliée reste dans sa zone', async () => {
            await p.evaluate(at => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); a.setSelectionRange(at, at); }, LINES[0].length + 1);
            await p.keyboard.type('X'); await sleep(200);
            const s = await st(); assert.equal(s.marks[1], 'X' + LINES[1], 'le « X » est dans la couleur de la ligne');
            assert.equal(s.marks[0], LINES[0], 'la ligne d’avant ne bouge pas');
            await p.evaluate(at => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.setSelectionRange(at, at); }, LINES[0].length + 1);
            await p.keyboard.press('Enter'); await sleep(200); // un retour à la ligne, lui, pousse la zone (une ligne vide avant)
            const s2 = await st(); assert.equal(s2.body.split('\n')[1], ''); assert.equal(s2.marks[1], 'X' + LINES[1]);
        });

        await closeAtelier();
        assert.deepEqual(errs, [], 'erreurs de la page : ' + errs.join(' | '));
    } catch (e) { fails++; console.log('✗ ' + (e.stack || e)); }
    finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
