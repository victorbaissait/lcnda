'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📤 Liens entre les outils — 🎬 Montage vidéo et 🎧 Studio son (docs/design/outils-liens.html) :   node tests/test-liens-montage.js
 *  - Montage : plusieurs images reçues ({list}) posées l'une après l'autre sur Vidéo 1 (Ken Burns) ;
 *    newMontage(onDone, {audio, subs}) : le son et ses sous-titres sur la piste « Sous-titres » ;
 *    ⤓ Exporter → 🎞 GIF animé (encodeur GIF du Studio d'animation) ; Fichier → 📤 Envoyer vers… (la vidéo, vers le site).
 *  - Studio son : Fichier → 📤 Envoyer vers… : le son (+ la transcription en sous-titres) vers un nouveau montage ;
 *    la transcription (texte, heures en petits titres) vers le Traitement de texte.
 * Le test fabrique ses images, son son, sa base et son serveur PHP dans un dossier temporaire, puis efface tout.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let chromium = null;
for (const m of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (_) { /* suivant */ } }
const phpPath = findPhp([devBundledPhp()]);
const ffmpeg = ['/usr/bin/ffmpeg', 'ffmpeg'].find(f => spawnSync(f, ['-version']).status === 0);
if (!chromium || !phpPath || !ffmpeg) { console.log(`— sauté : ${!chromium ? 'Playwright' : !phpPath ? 'PHP' : 'ffmpeg'} absent`); console.log('\n0 vérification (sauté).'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-liens-montage-'));
const mediaDir = path.join(tmp, 'media'); fs.mkdirSync(mediaDir);
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const ff = args => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('ffmpeg : ' + r.stderr); };
let failed = 0, proc = null, browser = null;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    try {
        ff(['-f', 'lavfi', '-i', 'color=c=red:s=320x240', '-frames:v', '1', path.join(mediaDir, 'mazaud.png')]);
        ff(['-f', 'lavfi', '-i', 'color=c=green:s=320x240', '-frames:v', '1', path.join(mediaDir, 'lacombe.png')]);
        ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x240', '-frames:v', '1', path.join(mediaDir, 'durand.png')]);
        ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=6', '-c:a', 'pcm_s16le', path.join(mediaDir, 'voix.wav')]);
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; $p = db(); $p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Louis','DURAND','male')"); $ids = [];
            foreach ([['Maison MAZAUD','image','mazaud.png'],['Ferme LACOMBE','image','lacombe.png'],['Mariage DURAND','image','durand.png'],['Souvenirs de Louis DURAND','audio','voix.wav']] as $m) { $p->prepare("INSERT INTO media(title,media_type,filename,thumbnail) VALUES(?,?,?,?)")->execute([$m[0], $m[1], $m[2], $m[1] === 'image' ? $m[2] : '']); $ids[] = (int) $p->lastInsertId(); }
            echo json_encode($ids);`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
        const [I1, I2, I3, SND] = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')));
        const IMGS = [{ mediaId: I1, filename: 'mazaud.png', title: 'Maison MAZAUD' }, { mediaId: I2, filename: 'lacombe.png', title: 'Ferme LACOMBE' }, { mediaId: I3, filename: 'durand.png', title: 'Mariage DURAND' }];
        const SOUND = { id: SND, filename: 'voix.wav', title: 'Souvenirs de Louis DURAND', media_type: 'audio' };
        const port = await freePort();
        proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
        browser = await chromium.launch({ ...(fs.existsSync(exe) ? { executablePath: exe } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });
        const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
        await ctx.addInitScript(() => { try { localStorage.removeItem('genealogie-montage-prefs'); localStorage.setItem('genealogie-audio-mode', 'studio'); } catch (_) {} });
        const p = await ctx.newPage(); const errors = [];
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.newMontage && window.LCNDA_EXT?.sendTo && window.LCNDA_EXT?.openAudioStudio && window.LCNDA_EXT?.animExport, null, { timeout: 30000 });
        const M = 'document.querySelector("dialog.h-avx[open]").__montage';
        const openMontage = async () => { await p.waitForSelector('dialog.h-avx[open] [data-mt-canvas]'); await p.waitForFunction(m => { try { return eval(m)?.eng; } catch (_) { return false; } }, M); };
        const closeAll = () => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => { d.dispatchEvent(new Event('lcnda-test-close')); d.close(); }); });
        const menuItems = () => p.$$eval('.ui-actmenu-i', bs => bs.map(b => b.textContent.trim()));
        const clickMenu = async re => { await p.waitForSelector('.ui-actmenu-i'); const i = (await menuItems()).findIndex(x => re.test(x)); assert.ok(i >= 0, `pas de « ${re} » dans ${JSON.stringify(await menuItems())}`); await (await p.$$('.ui-actmenu-i'))[i].click(); };

        await t('Montage : plusieurs images reçues ({list}) l’une après l’autre sur Vidéo 1, avec un lent zoom', async () => {
            await p.evaluate(list => { window.LCNDA_EXT._montageSeedVisual = { list }; window.LCNDA_EXT.newMontage(); }, IMGS);
            await openMontage();
            await p.waitForFunction(m => eval(m).P.v1.length === 3, M, { timeout: 15000 });
            const s = await p.evaluate(m => { const P = eval(m).P; return P.v1.map(c => ({ src: P.sources[c.s].src, kind: P.sources[c.s].kind, kb: c.kb, len: c.to - c.from })); }, M);
            assert.deepEqual(s.map(x => x.src), ['media/mazaud.png', 'media/lacombe.png', 'media/durand.png']);
            assert.ok(s.every(x => x.kind === 'image' && x.kb === 'auto' && x.len >= 3 && x.len <= 8), JSON.stringify(s));
            assert.equal(await p.evaluate(() => window.LCNDA_EXT._montageSeedVisual), null, 'la commande est consommée');
        });

        await t('Montage : ⤓ Exporter → 🎞 GIF animé (plusieurs images, petit, en boucle)', async () => {
            await p.evaluate(m => { eval(m).P.v1.forEach(c => { c.to = c.from + 1.5; }); }, M); // un film court : l'essai va plus vite
            await p.evaluate(() => document.querySelector('dialog.h-avx[open] [data-mt-cmd="export"]').click());
            await p.waitForSelector('dialog.ui-export[open] [data-fmt="gif"]');
            await p.click('dialog.ui-export[open] [data-fmt="gif"]');
            const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('dialog.ui-export[open] [data-ui-go]')]);
            assert.match(dl.suggestedFilename(), /\.gif$/);
            const buf = fs.readFileSync(await dl.path());
            assert.equal(buf.slice(0, 6).toString('latin1'), 'GIF89a');
            const w = buf.readUInt16LE(6), h = buf.readUInt16LE(8); assert.ok(w <= 480 && h <= 480 && w > 50, `taille ${w}×${h}`);
            let frames = 0; for (let i = 0; i < buf.length - 2; i++) if (buf[i] === 0x21 && buf[i + 1] === 0xF9 && buf[i + 2] === 4) frames++;
            assert.ok(frames >= 20, `${frames} images dans le GIF`);
            assert.ok(buf.includes(Buffer.from('NETSCAPE2.0')), 'tourne en boucle');
            assert.equal(buf[buf.length - 1], 0x3B, 'fin du GIF');
            await p.waitForSelector('dialog.ui-export[open]', { state: 'detached', timeout: 15000 }).catch(() => {});
            await p.waitForFunction(m => eval(m).eng, M);
        });

        await t('Montage : Fichier → 📤 Envoyer vers… fabrique la vidéo, la range dans les médias, l’envoie au site', async () => {
            await p.evaluate(m => { eval(m).P.v1.forEach(c => { c.to = c.from + 1; c.tr = { type: 'none', d: 1 }; }); }, M);
            assert.ok(await p.$('dialog.h-avx[open] [data-mt-cmd="sendto"]'), 'l’entrée est dans le menu Fichier');
            await p.evaluate(() => { window.__siteGot = null; window.LCNDA_EXT.siteReceive = x => { window.__siteGot = x; }; });
            await p.evaluate(() => document.querySelector('dialog.h-avx[open] [data-mt-cmd="sendto"]').click());
            await p.waitForSelector('dialog.confirm-box-dialog[open] [data-cb-ok]'); await p.click('dialog.confirm-box-dialog[open] [data-cb-ok]');
            await p.waitForSelector('.ui-actmenu-i', { timeout: 60000 });
            const items = await menuItems();
            assert.ok(items.some(x => /site/.test(x)), JSON.stringify(items));
            assert.ok(!items.some(x => /montage/i.test(x)), 'pas vers le montage lui-même : ' + JSON.stringify(items));
            await clickMenu(/site/);
            await p.waitForFunction(() => window.__siteGot, null, { timeout: 15000 });
            const got = await p.evaluate(() => window.__siteGot);
            assert.equal(got.type, 'video'); assert.ok(got.media.id > 0 && /\.(webm|mp4)$/.test(got.media.filename), JSON.stringify(got));
            assert.ok(fs.existsSync(path.join(mediaDir, got.media.filename)), 'le fichier est dans les médias');
            // pas changé depuis : la même vidéo, sans la refaire (pas de question)
            await p.evaluate(() => document.querySelector('dialog.h-avx[open] [data-mt-cmd="sendto"]').click());
            await p.waitForSelector('.ui-actmenu-i'); assert.equal(await p.$('dialog.confirm-box-dialog[open]'), null);
            await p.keyboard.press('Escape');
        });

        await t('Montage : newMontage(onDone, {audio, subs}) — le son et ses sous-titres', async () => {
            await closeAll();
            await p.evaluate(s => window.LCNDA_EXT.newMontage(null, { audio: s, subs: [{ start: 0.5, end: 2, text: 'Bonjour, ici MAZAUD' }, { start: 2.5, end: 4.2, text: 'Et LACOMBE' }] }), SOUND);
            await openMontage();
            await p.waitForFunction(m => eval(m).P.audio.length === 1 && eval(m).P.texts.length === 2, M, { timeout: 15000 });
            const s = await p.evaluate(m => { const P = eval(m).P; return { a: P.sources[P.audio[0].s], t: P.texts.map(x => ({ at: x.at, dur: x.dur, text: x.text, sub: x.sub, track: P.tracks.find(tr => tr.id === x.track)?.name })) }; }, M);
            assert.equal(s.a.src, 'media/voix.wav'); assert.equal(s.a.mediaId, SND);
            assert.deepEqual(s.t.map(x => [x.at, Math.round(x.dur * 10) / 10, x.text, x.sub, x.track]), [[0.5, 1.5, 'Bonjour, ici MAZAUD', true, 'Sous-titres'], [2.5, 1.7, 'Et LACOMBE', true, 'Sous-titres']]);
            await closeAll();
        });

        const AS = 'document.querySelector("dialog.h-as[open]")._as';
        await t('Studio son : Fichier → 📤 Envoyer vers… → la transcription vers le Traitement de texte (heures en petits titres)', async () => {
            await p.evaluate(s => window.LCNDA_EXT.openAudioStudio(s), SOUND);
            await p.waitForSelector('dialog.h-as[open] [data-as-canvas]'); await p.waitForTimeout(300);
            await p.evaluate(m => { const a = eval(m); a.st.transcript.push({ t: 1, who: 'Louis DURAND', text: 'Bonjour à la famille MAZAUD' }, { t: 3.5, who: '', text: 'On était chez LACOMBE' }); }, AS);
            const subs = await p.evaluate(m => eval(m).transcriptSubs(), AS);
            assert.deepEqual(subs, [{ start: 1, end: 3.5, text: 'Louis DURAND : Bonjour à la famille MAZAUD' }, { start: 3.5, end: 6, text: 'On était chez LACOMBE' }]);
            await p.click('dialog.h-as [data-ui-menu="Fichier"]'); await clickMenu(/Envoyer vers/);
            const items = await menuItems(); assert.ok(items.some(x => /Le son/.test(x)) && items.some(x => /transcription/.test(x)), JSON.stringify(items));
            await clickMenu(/La transcription/);
            await p.waitForSelector('.ui-actmenu-i');
            const dest = await menuItems();
            assert.ok(dest.some(x => /Traitement de texte/.test(x)), JSON.stringify(dest));
            if (await p.evaluate(() => !!window.LCNDA_EXT.keynoteWithObject)) assert.ok(dest.some(x => /présentation/.test(x)), JSON.stringify(dest));
            await p.evaluate(() => { window.__doc = null; const o = window.LCNDA_EXT.openTextDoc; window.LCNDA_EXT.openTextDoc = ctx => { window.__doc = { name: ctx.name, html: ctx.data.sections[0].html }; window.LCNDA_EXT.openTextDoc = o; }; });
            await clickMenu(/Traitement de texte/);
            await p.waitForFunction(() => window.__doc);
            const doc = await p.evaluate(() => window.__doc);
            assert.match(doc.name, /Transcription — Souvenirs de Louis DURAND/);
            assert.match(doc.html, /<h4>[^<]*0:01[^<]*— Louis DURAND<\/h4><p>Bonjour à la famille MAZAUD<\/p>/);
            assert.match(doc.html, /<h4>[^<]*0:03[^<]*<\/h4><p>On était chez LACOMBE<\/p>/);
        });

        await t('Studio son : 📤 le son → un nouveau montage, la transcription en sous-titres', async () => {
            await p.evaluate(m => eval(m).runCmd('sendto'), AS);
            await clickMenu(/Le son/);
            await p.waitForSelector('.ui-actmenu-i');
            const dest = await menuItems();
            assert.ok(dest.some(x => /nouveau montage/.test(x)) && dest.some(x => /site/.test(x)), JSON.stringify(dest));
            assert.equal(await p.$('dialog.confirm-box-dialog[open]'), null, 'le son n’a pas changé : il part tel quel, sans copie');
            await clickMenu(/nouveau montage/);
            await openMontage();
            await p.waitForFunction(m => eval(m).P.audio.length === 1 && eval(m).P.texts.length === 2, M, { timeout: 15000 });
            const s = await p.evaluate(m => { const P = eval(m).P; return { a: P.sources[P.audio[0].s].src, t: P.texts.map(x => [x.at, x.text, x.sub]) }; }, M);
            assert.equal(s.a, 'media/voix.wav');
            assert.deepEqual(s.t, [[1, 'Louis DURAND : Bonjour à la famille MAZAUD', true], [3.5, 'On était chez LACOMBE', true]]);
            await closeAll();
        });

        await t('Studio son : le son modifié est d’abord rangé (une copie), puis envoyé', async () => {
            await p.evaluate(s => window.LCNDA_EXT.openAudioStudio(s), SOUND);
            await p.waitForSelector('dialog.h-as[open] [data-as-canvas]'); await p.waitForTimeout(300);
            await p.evaluate(m => eval(m).addFx('eqg'), AS);
            await p.evaluate(m => eval(m).sendSound(document.body), AS);
            await p.waitForSelector('dialog.confirm-box-dialog[open] [data-cb-ok]'); await p.click('dialog.confirm-box-dialog[open] [data-cb-ok]');
            await p.waitForSelector('.ui-actmenu-i', { timeout: 30000 });
            await p.evaluate(() => { window.__siteGot = null; window.LCNDA_EXT.siteReceive = x => { window.__siteGot = x; }; });
            await clickMenu(/site/);
            await p.waitForFunction(() => window.__siteGot);
            const got = await p.evaluate(() => window.__siteGot);
            assert.equal(got.type, 'audio'); assert.notEqual(got.media.id, SND, 'une copie, pas l’original'); assert.ok(fs.existsSync(path.join(mediaDir, got.media.filename)));
            await closeAll();
        });

        await t('aucune erreur dans la page', async () => assert.deepEqual(errors, []));
    } catch (e) { failed++; console.error('✗ préparation', e && e.stack || e); }
    finally {
        try { await browser?.close(); } catch (_) {}
        try { proc?.kill(); } catch (_) {}
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(failed ? `\n${failed} vérification(s) en échec.` : '\nToutes les vérifications des liens (montage, son) réussies.');
    process.exit(failed ? 1 : 0);
})();
