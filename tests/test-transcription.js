'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de la transcription d'actes (lib/transcriptions.php, api.php htr_recognize, assets/js/heritage-transcribe*.js) :
 *   node tests/test-transcription.js
 *  1. réglages « Mieux voir » forgés bornés, nombres infinis refusés sans perdre les zones, ↶ Annuler d'une suppression
 *     (même numéro, deux fois de suite, image supprimée entre-temps), liste page par page (recherche sans accents, filtres, bornes) ;
 *  2. un vrai « php -S » : image améliorée envoyée au lecteur d'écriture (HTR) — taille, type réel, dimensions, fichier
 *     temporaire toujours effacé, rien qu'on puisse forger dans le chemin —, jeton CSRF, mode consultation ;
 *  3. dans le navigateur (si Playwright est là) : le worker « Mieux voir » s'arrête à la fermeture, même pendant un calcul
 *     ou en ouvrant une fiche ; image cassée sans attente sans fin ; image énorme ramenée à une taille raisonnable ;
 *     petits boutons icône (app-harmony) rapides sur une longue liste et à la bonne taille.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-transcription-'));
const dir = path.join(tmp, 'data'), phpTmp = path.join(tmp, 'phptmp');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true }); fs.mkdirSync(phpTmp);
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', TMPDIR: phpTmp };
const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }

/* ─── des images fabriquées ici ─── */
const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
/** un PNG gris w × h (ou seulement son en-tête annonçant w × h, si headerOnly) */
function png(w, h, { headerOnly = false, shade = 200 } = {}) {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (headerOnly) return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(16))), chunk('IEND', Buffer.alloc(0))]);
    const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (x + y) % 37 < 3 ? 40 : shade; }
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
fs.writeFileSync(path.join(dir, 'media', 'acte.png'), png(600, 400));
fs.writeFileSync(path.join(dir, 'media', 'enorme.png'), png(9000, 6000));
fs.writeFileSync(path.join(dir, 'media', 'casse.png'), Buffer.from('pas une image du tout'));

/* ─── 1. la bibliothèque ─── */
const lib = JSON.parse(php(String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,is_start) VALUES('Jean','Durand','male',1)");
$p->exec("INSERT INTO media(title,media_type,filename) VALUES('Acte','image','acte.png'),('Énorme','image','enorme.png'),('Cassé','image','casse.png'),('Éphémère','image','acte.png')");
$p = null; require 'lib/bootstrap.php'; require_once 'lib/transcriptions.php'; $pdo = db();
$o = [];
// réglages forgés : bornés, et rien d'autre n'est gardé
$forged = ['contrast' => 99999, 'bright' => -5, 'rot' => -90, 'sharp' => '1e999', 'sharpR' => 'abc', 'clahe' => 1000, 'channel' => '<script>', 'thr' => 300, 'lvB' => 999, 'lvW' => 0, 'lvG' => 99, 'tilt' => -45, 'mirror' => 'oui', 'evil' => 'x'];
$v = act_transcription_clean_data($pdo, ['view' => $forged, 'status' => 'pirate'])['view'];
$o['view'] = $v; $o['rot45'] = act_transcription_clean_data($pdo, ['view' => ['rot' => 45]])['view']['rot'];
// un nombre infini dans une zone : enregistré quand même (0), sans perdre les personnes
$r = save_act_transcription($pdo, ['title' => 'Baptême de Jean', 'kind' => 'bapteme', 'media_id' => 1, 'date_text' => '3 mars 1790', 'place' => 'Saint-Étienne', 'body' => "Le trois mars\nmil sept cent", 'data' => ['zones' => [['id' => 'z1', 'x' => '1e999', 'y' => 5, 'w' => 10, 'h' => 10, 's' => 0, 'e' => 4]], 'people' => [['name' => 'Jean Durand', 'role' => 'sujet', 'person_id' => 1]], 'status' => 'doing']]);
$id = $r['id']; $g = act_transcription_get($pdo, $id); $o['inf'] = [$g['data']['zones'][0]['x'] ?? null, count($g['data']['people'] ?? []), $g['data']['status'] ?? null];
// ↶ Annuler une suppression : le même numéro revient ; deux fois de suite ne double rien ; sans « restore », pas de résurrection
$full = act_transcription_get($pdo, $id);
delete_act_transcription($pdo, ['id' => $id]);
try { save_act_transcription($pdo, ['id' => $id, 'title' => 'X', 'data' => []]); $o['noflag'] = 'saved'; } catch (Throwable $e) { $o['noflag'] = $e->getMessage(); }
$back = ['id' => $id, 'restore' => 1, 'title' => $full['title'], 'kind' => $full['kind'], 'media_id' => $full['media_id'], 'date_text' => $full['date_text'], 'place' => $full['place'], 'source' => $full['source'], 'body' => $full['body'], 'data' => $full['data']];
$o['restore1'] = save_act_transcription($pdo, $back)['id']; $o['restore2'] = save_act_transcription($pdo, $back)['id'];
$o['count'] = (int) $pdo->query('SELECT count(*) FROM act_transcriptions')->fetchColumn();
$g = act_transcription_get($pdo, $id); $o['restored'] = [$g['title'], $g['body'], $g['data']['people'][0]['name'] ?? null, $g['media_id']];
// un nouvel acte après la suppression ne reprend pas le numéro (AUTOINCREMENT) : le ↶ Annuler ne peut pas écraser un autre acte
$id2 = save_act_transcription($pdo, ['title' => 'Mariage', 'kind' => 'mariage', 'media_id' => 4, 'body' => '', 'data' => ['status' => 'todo']])['id'];
delete_act_transcription($pdo, ['id' => $id2]); $id3 = save_act_transcription($pdo, ['title' => 'Sépulture', 'kind' => 'sepulture', 'body' => 'x', 'data' => []])['id'];
$o['ids'] = [$id2, $id3];
// l'image supprimée entre la suppression et ↶ Annuler : le texte revient sans image
$pdo->exec('DELETE FROM media WHERE id=4');
$o['restoreNoMedia'] = save_act_transcription($pdo, ['id' => $id2, 'restore' => 1, 'title' => 'Mariage', 'kind' => 'mariage', 'media_id' => 4, 'body' => 'Texte', 'data' => []])['id'];
$o['restoreNoMediaGet'] = act_transcription_get($pdo, $id2)['media_id'];
try { save_act_transcription($pdo, ['title' => 'Sans image', 'media_id' => 4, 'data' => []]); $o['badMedia'] = 'saved'; } catch (Throwable $e) { $o['badMedia'] = $e->getMessage(); }
// la liste
$o['pageQ'] = array_column(act_transcriptions_page($pdo, ['q' => 'saint etienne'])['items'], 'title');
$o['pageKind'] = act_transcriptions_page($pdo, ['kinds' => 'mariage,inconnu'])['total'];
$o['pageStatus'] = [act_transcriptions_page($pdo, ['status' => 'doing'])['total'], act_transcriptions_page($pdo, ['status' => 'done'])['total'], act_transcriptions_page($pdo, ['status' => 'pirate'])['total']];
$o['pageBounds'] = [act_transcriptions_page($pdo, ['limit' => 999999, 'offset' => -5])['limit'], act_transcriptions_page($pdo, ['limit' => 999999, 'offset' => -5])['offset']];
$o['pageSort'] = array_column(act_transcriptions_page($pdo, ['sort' => 'az; DROP TABLE act_transcriptions'])['items'], 'title');
$o['pageYear'] = array_column(act_transcriptions_page($pdo, ['from' => 1780, 'to' => 1795])['items'], 'title');
$o['pagePerson'] = array_column(act_transcriptions_page($pdo, ['person' => 1])['items'], 'title');
echo json_encode($o, JSON_UNESCAPED_UNICODE);`));

/* ─── 2. le serveur ─── */
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    const out = {};
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const get = async (action, q = '') => { const r = await fetch(`${base}api.php?action=${action}${q ? '&' + q : ''}`, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const b64 = buf => buf.toString('base64');
        const leftovers = () => fs.readdirSync(phpTmp).filter(f => f.startsWith('lcnda-htr-'));
        out.htrGarbage = await post('htr_recognize', { media_id: 1, image_b64: b64(Buffer.from('<?php system($_GET[1]); ?>')) });
        out.htrNotB64 = await post('htr_recognize', { media_id: 1, image_b64: '%%%***' });
        out.htrGif = await post('htr_recognize', { media_id: 1, image_b64: b64(Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')) });
        out.htrHuge = await post('htr_recognize', { media_id: 1, image_b64: b64(png(30000, 30000, { headerOnly: true })) });
        out.htrHeavy = await post('htr_recognize', { media_id: 1, image_b64: 'A'.repeat(41 * 1024 * 1024) });
        out.htrOk = await post('htr_recognize', { media_id: 1, image_b64: b64(png(300, 200)), model: 'fr-actes' });
        out.htrPath = await post('htr_recognize', { media_id: 1, image_b64: b64(png(300, 200)), model: '../../etc/passwd' });
        out.htrBadMedia = await post('htr_recognize', { media_id: 999, image_b64: b64(png(10, 10)) });
        out.left = leftovers();
        out.noCsrf = await post('save_act_transcription', { title: 'Pirate', data: {} }, 'faux');
        out.page = await get('act_transcriptions_page', 'q=bapteme&limit=5');
        fs.writeFileSync(path.join(dir, 'consultation.json'), JSON.stringify({ hash: '$2y$10$abcdefghijklmnopqrstuuWzGmJ1kGQ5JvH4sCq3zN6E1i0YqM6xG', since: 'x' }));
        out.kioskSave = await post('save_act_transcription', { title: 'En consultation', data: {} });
        out.kioskDel = await post('delete_act_transcription', { id: 1 });
        out.kioskHtr = await post('htr_recognize', { media_id: 1, image_b64: b64(png(10, 10)) });
        out.kioskPage = await get('act_transcriptions_page');
        fs.rmSync(path.join(dir, 'consultation.json'));
        out.count = Number(php(String.raw`require 'lib/bootstrap.php'; echo db()->query('SELECT count(*) FROM act_transcriptions')->fetchColumn();`));

        /* ─── 3. le navigateur ─── */
        if (chromium) {
            const browser = await chromium.launch();
            try {
                const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
                const p = await ctx.newPage(); const errs = [];
                p.on('pageerror', e => errs.push(e.message));
                p.on('console', m => { if (m.type() === 'error' && /UNHANDLED/.test(m.text())) errs.push(m.text()); });
                await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txView, null, { timeout: 30000 });
                await p.evaluate(() => { const W = window.Worker; window.__w = { made: 0, term: 0 }; window.Worker = class extends W { constructor(...a) { super(...a); window.__w.made++; } terminate() { window.__w.term++; super.terminate(); } };
                    window.addEventListener('unhandledrejection', e => console.error('UNHANDLED ' + (e.reason?.message || e.reason))); });
                const sharpen = () => p.evaluate(() => { const i = document.querySelector('dialog.h-tx-dlg [data-tx-view="sharp"]'); i.value = '120'; i.dispatchEvent(new Event('input', { bubbles: true })); });
                const confirmLast = label => p.evaluate(l => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); [...d.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(l))?.click(); }, label);
                const toolCount = () => p.evaluate(() => document.querySelectorAll('dialog.h-tx-dlg').length);
                // a. un calcul puis la fermeture
                await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 1, filename: 'acte.png', title: 'T' }));
                await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-view="sharp"]'));
                await p.waitForTimeout(500); await sharpen();
                await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg')?.dataset.txRender === 'full', null, { timeout: 15000 });
                out.rendered = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href')?.startsWith('blob:') ?? null);
                await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="close"]').click()); await p.waitForTimeout(200); await confirmLast('Fermer sans enregistrer'); await p.waitForTimeout(400);
                out.closeA = [await p.evaluate(() => window.__w), await toolCount()];
                // b. fermée pendant la préparation d'une très grande image
                await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 2, filename: 'enorme.png', title: 'G' }));
                await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-view="sharp"]')); await p.waitForTimeout(600);
                await sharpen(); await p.waitForTimeout(20);
                await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="close"]').click()); await p.waitForTimeout(150); await confirmLast('Fermer sans enregistrer'); await p.waitForTimeout(3000);
                out.closeB = [await p.evaluate(() => window.__w), await toolCount()];
                // c. « ↗ » une fiche depuis l'outil : le worker et les touches s'arrêtent aussi
                await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 1, filename: 'acte.png', title: 'T' })); await p.waitForTimeout(1000);
                await sharpen(); await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg')?.dataset.txRender === 'full', null, { timeout: 15000 });
                await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'), bt = document.createElement('button'); bt.type = 'button'; bt.dataset.txPopen = '1'; d.querySelector('[data-tx-found]').appendChild(bt); bt.click(); });
                await p.waitForTimeout(300); await confirmLast('Ouvrir sans enregistrer'); await p.waitForTimeout(800);
                out.popen = [await p.evaluate(() => window.__w), await toolCount()];
                // d. le « développeur » seul : image cassée → false (pas d'attente sans fin) ; image énorme → réduite ; arrêté → plus rien ne se lance
                out.enh = await p.evaluate(async () => {
                    const TV = window.LCNDA_EXT.txView, r = {};
                    const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(i); i.src = src; });
                    const e1 = TV.enhancer(() => {}), broken = await load('media/casse.png');
                    r.broken = await Promise.race([e1.source(broken, 100, 100), new Promise(res => setTimeout(() => res('attente sans fin'), 8000))]); e1.stop();
                    const big = await load('media/enorme.png'), e2 = TV.enhancer(() => {});
                    r.bigSource = await e2.source(big, big.naturalWidth, big.naturalHeight);
                    const blob = await e2.full({ ...TV.DEFAULT_VIEW, sharp: 50 }), bm = await createImageBitmap(blob); r.full = [bm.width, bm.height];
                    const pending = e2.full({ ...TV.DEFAULT_VIEW, sharp: 50 }).then(() => 'fini', e => 'arrêté : ' + e.message); e2.stop(); r.stopped = await Promise.race([pending, new Promise(res => setTimeout(() => res('attente sans fin'), 8000))]);
                    r.after = await e2.source(big, 100, 100); await e2.render({ ...TV.DEFAULT_VIEW, sharp: 50 }); r.workers = window.__w;
                    return r;
                });
                // e. app-harmony : 1 500 lignes avec 🗑 et ✎ mesurées d'un coup ; un petit bouton dans une barre serrée prend la taille « outil »
                out.harmony = await p.evaluate(async () => {
                    const ws = document.querySelector('#workspace');
                    ws.innerHTML = '<div class="ui-rows">' + Array.from({ length: 1500 }, (_, i) => `<div class="ui-row"><span>Ligne ${i}</span><div class="ui-row-act"><button type="button" class="icon-button" title="Supprimer">🗑</button><button type="button" class="icon-button">✎</button></div></div>`).join('') + '</div><div style="height:16px;display:flex"><button type="button" id="tiny" style="height:16px;padding:0;font-size:9px;line-height:1">🗑</button></div>';
                    const t0 = performance.now(); while (ws.querySelectorAll('button:not([data-ia-done])').length) await new Promise(r => setTimeout(r, 20));
                    const big = ws.querySelector('.ui-row button').getBoundingClientRect(), tiny = document.getElementById('tiny');
                    return { ms: performance.now() - t0, big: [Math.round(big.width), Math.round(big.height)], tiny: tiny.classList.contains('ia-tool'), tinyH: Math.round(tiny.getBoundingClientRect().height) };
                });
                // f. 390 px : « ⋯ Plus » s'ouvre dans l'écran
                await p.setViewportSize({ width: 390, height: 844 });
                await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 1, filename: 'acte.png', title: 'T' })); await p.waitForTimeout(1200);
                out.more390 = await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg .h-tx-more'); d.open = true; const r = d.querySelector(':scope > div').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
                out.errs = errs;
            } finally { await browser.close(); }
        }
    } finally { proc.kill(); }

    const err = r => String(r.body?.error || '');
    const checks = [
        ['réglages forgés : bornés, mot inconnu jeté, rotation au quart de tour', () => {
            const v = lib.view; assert.equal(v.contrast, 300); assert.equal(v.bright, 40); assert.equal(v.rot, 270); assert.equal(v.sharp, 0); assert.equal(v.sharpR, 1.5); assert.equal(v.clahe, 100);
            assert.equal(v.channel, ''); assert.equal(v.thr, 254); assert.equal(v.lvB, 200); assert.equal(v.lvW, 55); assert.equal(v.lvG, 3); assert.equal(v.tilt, -10); assert.equal(v.mirror, true); assert.equal(v.evil, undefined); assert.equal(lib.rot45, 0);
        }],
        ['nombre infini dans une zone : 0, et les personnes et l’état restent', () => assert.deepEqual(lib.inf, [0, 1, 'doing'])],
        ['↶ Annuler une suppression : même numéro, deux fois sans doublon, contenu identique', () => {
            assert.match(lib.noflag, /introuvable/); assert.equal(lib.restore1, lib.restore2); assert.equal(lib.count, 1);
            assert.deepEqual(lib.restored, ['Baptême de Jean', 'Le trois mars\nmil sept cent', 'Jean Durand', 1]);
        }],
        ['un numéro supprimé n’est jamais repris par un nouvel acte', () => assert.ok(lib.ids[1] > lib.ids[0])],
        ['↶ Annuler après la suppression de l’image : le texte revient sans image ; sinon l’image doit exister', () => { assert.equal(lib.restoreNoMedia, lib.ids[0]); assert.equal(lib.restoreNoMediaGet, 0); assert.match(lib.badMedia, /introuvable/); }],
        ['liste : recherche sans accents, sortes, état, bornes, tri inconnu, années, personne', () => {
            assert.deepEqual(lib.pageQ, ['Baptême de Jean']); assert.equal(lib.pageKind, 1); assert.deepEqual(lib.pageStatus, [3, 0, 3]);
            assert.deepEqual(lib.pageBounds, [200, 0]); assert.equal(lib.pageSort.length, 3); assert.deepEqual(lib.pageYear, ['Baptême de Jean']); assert.deepEqual(lib.pagePerson, ['Baptême de Jean']);
        }],
        ['HTR : image améliorée refusée si ce n’est pas un vrai JPEG / PNG', () => { for (const k of ['htrGarbage', 'htrNotB64', 'htrGif']) { assert.equal(out[k].status, 422, k); assert.match(err(out[k]), /illisible/, k); } }],
        ['HTR : image annoncée immense, ou envoi trop lourd : refusés', () => { assert.match(err(out.htrHuge), /trop grande/); assert.match(err(out.htrHeavy), /trop lourde/); }],
        ['HTR : une vraie image passe le contrôle (le message parle du lecteur, pas de l’image) ; modèle forgé refusé ; média absent', () => {
            assert.equal(out.htrOk.status, 422); assert.doesNotMatch(err(out.htrOk), /Image améliorée/); assert.match(err(out.htrPath), /inconnu/); assert.match(err(out.htrBadMedia), /introuvable/i);
        }],
        ['HTR : aucun fichier temporaire ne reste, même en cas d’erreur', () => assert.deepEqual(out.left, [])],
        ['jeton CSRF exigé', () => assert.equal(out.noCsrf.status, 419)],
        ['liste par la route : page lisible', () => { assert.equal(out.page.status, 200); assert.equal(out.page.body.items.length, 1); }],
        ['mode consultation : lecture permise, rien d’écrit (ni HTR)', () => {
            assert.equal(out.kioskSave.status, 423); assert.equal(out.kioskDel.status, 423); assert.equal(out.kioskHtr.status, 423); assert.equal(out.kioskPage.status, 200); assert.equal(out.count, 3);
        }],
    ];
    if (chromium) checks.push(
        ['navigateur : « Mieux voir » calcule dans un worker, arrêté à la fermeture', () => { assert.equal(out.rendered, true); assert.equal(out.closeA[0].term, out.closeA[0].made); assert.equal(out.closeA[1], 0); }],
        ['navigateur : fermée pendant la préparation d’une très grande image, sans erreur', () => { assert.equal(out.closeB[0].term, out.closeB[0].made); assert.equal(out.closeB[1], 0); }],
        ['navigateur : ouvrir une fiche depuis l’outil arrête aussi le worker', () => { assert.equal(out.popen[0].term, out.popen[0].made); assert.equal(out.popen[1], 0); }],
        ['navigateur : image cassée → false tout de suite ; image énorme réduite (≤ 8000 px, ≤ 20 Mpx) ; arrêté → les attentes se terminent, rien ne repart', () => {
            const e = out.enh; assert.equal(e.broken, false); assert.equal(e.bigSource, true);
            assert.ok(Math.max(...e.full) <= 8000 && e.full[0] * e.full[1] <= 20e6 + 20000, String(e.full)); assert.ok(Math.abs(e.full[0] / e.full[1] - 1.5) < .01, String(e.full));
            assert.match(String(e.stopped), /arrêté/); assert.equal(e.after, false); assert.equal(e.workers.made, e.workers.term + 0, JSON.stringify(e.workers));
        }],
        ['navigateur : 3 000 petits boutons transformés vite, 29 px dans une liste, taille « outil » dans une barre serrée', () => {
            assert.ok(out.harmony.ms < 5000, `${Math.round(out.harmony.ms)} ms`); assert.deepEqual(out.harmony.big, [29, 29]); assert.equal(out.harmony.tiny, true); assert.equal(out.harmony.tinyH, 22);
        }],
        ['navigateur : à 390 px, le menu « ⋯ Plus » reste dans l’écran', () => assert.ok(out.more390[0] >= 0 && out.more390[1] <= 390, String(out.more390))],
        ['navigateur : aucune erreur JS', () => assert.deepEqual(out.errs, [])],
    );
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    if (!chromium) console.log('  — navigateur : Playwright absent, partie sautée');
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
