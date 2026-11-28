'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📎 Taille des fichiers ajoutés et images immenses (lib/media_limits.php, upload.php, assets/js/app-media-limits.js) :
 *     node tests/test-taille-fichiers.js
 *  1. PHP seul : conseillés par défaut (100 Mo image ou document, 250 Mo son ou vidéo, 120 millions de points), seuls les
 *     choix proposés sont gardés, la limite de points (12 000 × 10 000 passe, un point de plus non), le message clair ;
 *  2. un vrai « php -S » : une image de 30 Mo est acceptée (avant : « dépasse 25 Mo ») ; réglée à 25 Mo, la même est refusée
 *     avec un message qui le dit ; une image immense (13 000 × 10 000) est gardée avec un avertissement, et la lecture
 *     d'écriture ne la décode pas ; sans jeton CSRF ou en mode consultation, le réglage ne change pas ;
 *  3. navigateur (1440 px) : Réglages → « 📁 Fichiers des médias » (trois menus, « (conseillé) » sur le choix conseillé, pas
 *     d'unité dans les libellés), un changement enregistré puis « ↶ Annuler » ; les limites dans le navigateur (menu de
 *     choix des médias, outils d'image) ; l'aide (FAQ) en parle ; aucune erreur JavaScript.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-taille-fichiers-'));
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout.trim().split('\n').pop(); };
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log(`✓ ${name}`); } catch (e) { failed++; console.log(`✗ ${name}\n  ${String(e.stack || e).split('\n').slice(0, 5).join('\n  ')}`); } };

const seed = php(String.raw`require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php';
$pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,is_start,living_status) VALUES('Célestin','Vergnolle','male',1,'deceased')");
$im = imagecreatetruecolor(64, 48); imagefill($im, 0, 0, imagecolorallocate($im, 90, 120, 160)); ob_start(); imagejpeg($im); $jpg = ob_get_clean();
echo json_encode(['pid' => (int) $pdo->lastInsertId(), 'jpg' => base64_encode($jpg)]);`);
const ids = JSON.parse(seed);
const smallJpeg = Buffer.from(ids.jpg, 'base64');
const bigJpeg = Buffer.concat([smallJpeg, Buffer.alloc(30 * 1024 * 1024, 0)]); // 30 Mo : une vraie image JPEG suivie de remplissage
const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
/** une image PNG immense par sa taille (13 000 × 10 000 points), petite comme fichier : seul son en-tête est lu */
const hugePng = (() => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(13000, 0); ihdr.writeUInt32BE(10000, 4); ihdr[8] = 8; ihdr[9] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(13001 * 20, 200))), chunk('IEND', Buffer.alloc(0))]); })();

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    /* ─── 1. PHP seul ─── */
    await t('conseillés par défaut, seuls les choix proposés sont gardés, limite de points et message', () => {
        const o = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); $o = ['def' => media_limits($pdo), 'img' => media_max_bytes('image', $pdo), 'pdf' => media_max_bytes('pdf', $pdo), 'av' => media_max_bytes('video', $pdo), 'au' => media_max_bytes('audio', $pdo)];
            $o['ok'] = media_pixels_too_big(12000, 10000, $pdo); $o['ko'] = media_pixels_too_big(12001, 10000, $pdo);
            $o['msg'] = $o['ko'] ? media_too_big_message($o['ko']) : '';
            try { media_limits_save($pdo, ['image_mb' => 77]); $o['bad'] = 'gardé'; } catch (Throwable $e) { $o['bad'] = $e->getMessage(); }
            $pdo->prepare("INSERT OR REPLACE INTO app_settings(key,value) VALUES('lcnda-media-limits', ?)")->execute([json_encode(['image_mb' => 31, 'av_mb' => 500, 'mpx' => 'x'])]);
            $o['mixed'] = media_limits($pdo); $pdo->exec("DELETE FROM app_settings WHERE key='lcnda-media-limits'");
            $o['page'] = media_limits_for_page($pdo);
            echo json_encode($o, JSON_UNESCAPED_UNICODE);`));
        assert.deepEqual(o.def, { image_mb: 100, av_mb: 250, mpx: 120 });
        assert.equal(o.img, 100 * 1048576); assert.equal(o.pdf, 100 * 1048576); assert.equal(o.av, 250 * 1048576); assert.equal(o.au, 250 * 1048576);
        assert.equal(o.ok, null, '12 000 × 10 000 = 120 millions : passe');
        assert.deepEqual(o.ko, { w: 12001, h: 10000, mpx: 121, max: 120 });
        assert.match(o.msg, /bien gardée/); assert.match(o.msg, /120 millions de points/); assert.match(o.msg, /Réglages → Fichiers des médias/);
        assert.equal(o.bad, 'Valeur de réglage inconnue.');
        assert.deepEqual(o.mixed, { image_mb: 100, av_mb: 500, mpx: 120 }, 'une valeur rangée qui n’est pas un choix : la conseillée');
        assert.deepEqual(o.page.defaults, { image_mb: 100, av_mb: 250, mpx: 120 }); assert.deepEqual(o.page.choices.image_mb, [25, 50, 100, 200, 500]);
    });
    await t('les autres envois d’images suivent le même réglage (carte des photos, retouche), le téléphone par le wifi garde ses limites', () => {
        const pm = fs.readFileSync(path.join(appRoot, 'lib/photomaps.php'), 'utf8'), st = fs.readFileSync(path.join(appRoot, 'lib/studio.php'), 'utf8'), up = fs.readFileSync(path.join(appRoot, 'upload.php'), 'utf8');
        assert.match(pm, /\$limit = media_limits\(\)\[\$kind === 'video' \? 'av_mb' : 'image_mb'\]/);
        assert.match(st, /max\(60, media_limits\(\)\['image_mb'\]\)/);
        assert.ok(!/\$limitMb=\$isAudioVideo\?250:25/.test(up), 'plus de 25 Mo écrit en dur dans upload.php');
        assert.ok(!/media_limits/.test(fs.readFileSync(path.join(appRoot, 'lib/telephone_wifi.php'), 'utf8')), 'lib/telephone_wifi.php garde ses propres limites');
        assert.ok(!/25e6|25 Mo au plus/.test(fs.readFileSync(path.join(appRoot, 'assets/js/heritage-vector.js'), 'utf8')), 'plus de « 25 Mo au plus » dans le dessin');
        for (const f of ['lib/questions_proches.php', 'lib/photomaps.php', 'lib/htr_setup.php']) assert.match(fs.readFileSync(path.join(appRoot, f), 'utf8'), /media_pixels_too_big/, f + ' lit les dimensions avant de décoder');
    });

    /* ─── 2. le serveur ─── */
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'upload_max_filesize=8G', '-d', 'post_max_size=8G', '-d', 'memory_limit=1024M', '-S', // comme l'app (electron/php-server.js, serve.sh)
         `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, PHP_CLI_SERVER_WORKERS: '3' }, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    let browser = null;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(x => setTimeout(x, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.getSetCookie?.() || [r.headers.get('set-cookie') || '']).map(c => c.split(';')[0]).filter(Boolean).join('; '); return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const limitsInPage = JSON.parse(html.match(/window\.LCNDA_MEDIA_LIMITS = (\{.*?\});<\/script>/)[1]);
        const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const upload = async (buf, name, type) => { const fd = new FormData(); fd.append('person_id', String(ids.pid)); fd.append('csrf', csrf); fd.append('files[]', new Blob([buf], { type }), name); const r = await fetch(base + 'upload.php', { method: 'POST', headers: { Cookie: cookie }, body: fd }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        await t('la page connaît les limites (window.LCNDA_MEDIA_LIMITS)', () => { assert.deepEqual(limitsInPage.limits, { image_mb: 100, av_mb: 250, mpx: 120 }); });
        let bigId = 0;
        await t('une image de 30 Mo est acceptée (100 Mo conseillés) ; réglée à 25 Mo, refusée avec un message clair', async () => {
            const ok = await upload(bigJpeg, 'img003.jpg', 'image/jpeg');
            assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.ok(ok.body.ok && ok.body.media.length === 1); assert.ok(!ok.body.notice, 'pas d’avertissement pour une image de taille normale');
            const s = await post('save_media_limits', { image_mb: 25 });
            assert.equal(s.status, 200); assert.equal(s.body.result.limits.image_mb, 25);
            const ko = await upload(bigJpeg, 'img003.jpg', 'image/jpeg');
            assert.equal(ko.status, 422); assert.equal(ko.body.error, 'img003.jpg dépasse 25 Mo, la taille la plus grande réglée pour une image ou un document (Réglages → Fichiers des médias).');
            assert.equal((await post('save_media_limits', { image_mb: 100 })).body.result.limits.image_mb, 100);
            assert.equal((await post('save_media_limits', { image_mb: 99 })).status, 422, 'une valeur qui n’est pas proposée est refusée');
        });
        await t('une image immense est gardée, avec un avertissement ; la lecture d’écriture ne la décode pas', async () => {
            const r = await upload(hugePng, 'plan-cadastral.png', 'image/png');
            assert.equal(r.status, 200, JSON.stringify(r.body)); bigId = Number(r.body.media[0]);
            assert.match(r.body.notice || '', /plan-cadastral\.png : Cette image est très grande \(13000 × 10000 points, 130 millions\)/);
            assert.match(r.body.notice, /bien gardée/);
            const h = await post('htr_recognize', { media_id: bigId });
            assert.equal(h.status, 422); assert.match(h.body.error || '', /très grande/, JSON.stringify(h.body));
            assert.ok(fs.readdirSync(path.join(dir, 'media')).length >= 2, 'les fichiers sont gardés');
        });
        await t('sans jeton CSRF ou en mode consultation, le réglage ne change pas', async () => {
            const bad = await post('save_media_limits', { image_mb: 500 }, 'faux');
            assert.ok(bad.status >= 400, String(bad.status));
            fs.writeFileSync(path.join(dir, 'consultation.json'), JSON.stringify({ hash: 'x', since: '2026-11-01' }));
            const k = await post('save_media_limits', { image_mb: 500 });
            fs.unlinkSync(path.join(dir, 'consultation.json'));
            assert.equal(k.status, 423);
            const g = await (await fetch(base + 'api.php?action=media_limits', { headers: { Cookie: cookie } })).json();
            assert.equal(g.limits.image_mb, 100);
        });

        /* ─── 3. navigateur ─── */
        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        await t('Playwright présent pour l’essai dans le navigateur', () => assert.ok(pw, 'Playwright absent'));
        if (!pw) return;
        browser = await pw.chromium.launch();
        const errors = [];
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|tile|openstreetmap/, x => x.abort());
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_APP?.api && window.LCNDA_APP.mediaLimits && window.LCNDA_EXT?.maintenance?.media_files);
        await t('Réglages → 📁 Fichiers des médias : trois menus, « (conseillé) », pas d’unité dans les libellés', async () => {
            await page.evaluate(() => { location.hash = '#maintenance/media_files'; });
            await page.waitForSelector('[data-mf-page] select[data-mf-key="mpx"]');
            const o = await page.evaluate(() => [...document.querySelectorAll('[data-mf-page] select[data-mf-key]')].map(s => ({ k: s.dataset.mfKey, v: s.value, label: s.closest('label').querySelector('span').textContent, rec: [...s.options].filter(x => /\(conseillé\)/.test(x.textContent)).map(x => x.value), opts: [...s.options].map(x => x.textContent) })));
            assert.deepEqual(o.map(x => [x.k, x.v]), [['image_mb', '100'], ['av_mb', '250'], ['mpx', '120']]);
            assert.deepEqual(o.map(x => x.rec), [['100'], ['250'], ['120']], 'le conseillé est marqué');
            assert.ok(o.every(x => !/\b(Mo|Go|px|MB)\b|\(/.test(x.label)), 'pas d’unité dans les libellés : ' + o.map(x => x.label));
            assert.equal(o[0].opts[2], '100 Mo (conseillé)'); assert.equal(o[1].opts.at(-1), '2 Go');
            assert.match(await page.textContent('[data-mf-page]'), /sauvegardes plus lourdes/);
            assert.match(await page.evaluate(() => document.querySelector('#sidebar')?.textContent || ''), /Fichiers des médias/, 'la page est dans la liste des Réglages');
        });
        await t('un changement est enregistré, puis « ↶ Annuler » le défait', async () => {
            await page.selectOption('[data-mf-page] select[data-mf-key="image_mb"]', '200');
            await page.waitForFunction(() => window.LCNDA_APP.mediaLimits.get().image_mb === 200, null, { timeout: 8000 });
            assert.equal((await page.evaluate(() => window.LCNDA_APP.api('media_limits'))).limits.image_mb, 200, 'enregistré dans la base');
            await page.click('.toast button:has-text("↶ Annuler"), [class*="toast"] button:has-text("↶ Annuler")');
            await page.waitForFunction(() => window.LCNDA_APP.mediaLimits.get().image_mb === 100 && document.querySelector('[data-mf-page] select[data-mf-key="image_mb"]')?.value === '100', null, { timeout: 8000 });
            assert.equal((await page.evaluate(() => window.LCNDA_APP.api('media_limits'))).limits.image_mb, 100, 'défait dans la base');
        });
        await t('dans le navigateur : la même limite pour le menu de choix des médias, et les outils d’image refusent une image immense', async () => {
            const o = await page.evaluate(async () => {
                const L = window.LCNDA_APP.mediaLimits, out = {};
                out.big = L.fileError({ name: 'img003.jpg', size: 150 * 1048576, type: 'image/jpeg' });
                out.small = L.fileError({ name: 'img004.jpg', size: 30 * 1048576, type: 'image/jpeg' });
                out.son = L.fileError({ name: 'veillée.mp3', size: 200 * 1048576, type: 'audio/mpeg' });
                try { await window.LCNDA_MEDIA_PICKER.importMediaFile({ name: 'img003.jpg', size: 150 * 1048576, type: 'image/jpeg' }, ['image']); out.picker = 'envoyé'; } catch (e) { out.picker = e.message; }
                out.huge = L.tooBig(13000, 10000); out.normal = L.tooBig(6000, 4000);
                await new Promise(r => setTimeout(r, 300));
                out.toast = [...document.querySelectorAll('.toast, [class*="toast"]')].map(x => x.textContent).join(' | ');
                return out;
            });
            assert.match(o.big, /^img003\.jpg dépasse 100 Mo/); assert.equal(o.small, ''); assert.equal(o.son, '', '250 Mo pour un son');
            assert.match(o.picker, /dépasse 100 Mo/, 'le menu de choix des médias refuse avant d’envoyer');
            assert.equal(o.huge, true); assert.equal(o.normal, false);
            assert.match(o.toast, /très grande \(13\s?000 × 10\s?000 points, 130 millions\)/);
        });
        await t('l’aide (FAQ) dit ce que ça implique : disque, sauvegardes, mémoire ; et la mention en marge', async () => {
            const src = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-more.js'), 'utf8');
            assert.match(src, /Quelle taille de photo, de scan, de son ou de vidéo puis-je ajouter \?', 'Réglages → « 📁 Fichiers des médias »[^']*sur le disque[^']*sauvegardes complètes[^']*mémoire/);
            assert.match(src, /Pourquoi « Mieux voir », la lecture ou la retouche ne traitent-ils pas une très grande image \?/);
            assert.match(src, /Lire l’acte : et les mentions écrites à la verticale dans la marge \?/);
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
    } catch (e) { failed++; console.error(e); }
    finally { if (browser) await browser.close(); proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
    console.log(failed ? `✗ ${failed} échec(s)` : '✓ tout est bon');
    process.exit(failed ? 1 : 0);
})();
