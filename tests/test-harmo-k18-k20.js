'use strict';
/* Harmonisation K18 (bas des éditeurs), K19 (colonne d’outils), K20 (poignées) et les règles validées E1, E5, K2 appliquées partout.
 *     node tests/test-harmo-k18-k20.js        (K18_SHOTS=dossier pour garder des captures)
 * 1. Le code : chaque éditeur pose la barre du bas commune (UI.editorStatus) et la colonne de 36 px (UI.editorRail) ;
 *    plus de variante de zoom (« Ajusté », « Page entière ▾ », « Zoom de la frise », « 137 % » seul…), un seul nom pour l’aimant (🧲 Aimanter),
 *    plus de poignée ☰ / ≡ / ↕, les poignées autour des objets au bleu de l’app ; E5 : plus de menu déroulant de polices (Apparence, Tableaux) ;
 *    K2 : plus de bouton « Enregistrer » dans les réglages de l’agenda / du calendrier, des livres, ni dans les listes à ranger d’Apparence.
 * 2. Le navigateur (Playwright, si présent) : Dessin, Mise en page, Maison, Retouche rapide, Retouche complète, Montage, Son, Transcription,
 *    Diaporama, Présentation, Tableaux — barre du bas en bas, zoom [− 100 % ▾ +] (⌘+ et ⌘0 le changent), colonne de 36 px ;
 *    ↶ ↷ et menus dans la Transcription et la Retouche rapide (vrai historique) ; actions de fin dans « 💾 Enregistrer ▾ » ;
 *    poignées des objets blanches au bord bleu ; ⠿ + Alt + ↓ dans Apparence (enregistré tout seul, « ↶ Annuler ») ;
 *    réglages de l’agenda enregistrés tout seuls (« ✓ Enregistré », « Fermer » seul, « ↶ Annuler ») ; 390 px en mode sombre ; aucune erreur.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
const js = f => fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
const css = f => fs.readFileSync(path.join(root, 'assets/css', f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

const EDITORS = {
    'heritage-vector.js': 'Dessin (carte, arbre, faire-part, sceau)', 'heritage-layout.js': 'Mise en page', 'heritage-house.js': 'Maison',
    'heritage-retouch-simple.js': 'Retouche rapide', 'heritage-studio.js': 'Retouche', 'heritage-studio-av.js': 'Montage et Son',
    'heritage-transcribe.js': 'Transcription', 'heritage-slideshow.js': 'Diaporama', 'heritage-keynote.js': 'Présentation', 'heritage-boards.js': 'Tableaux',
};

(async () => {
    /* ── 1. le code ── */
    await t('K18 / K19 : chaque éditeur pose la barre du bas commune et la colonne de 36 px', () => {
        const bad = [];
        for (const [f, name] of Object.entries(EDITORS)) { const s = js(f); if (!/editorStatus\?*\.?\(/.test(s)) bad.push(`${name} : pas de barre du bas`); if (!/editorRail\?*\.?\(/.test(s)) bad.push(`${name} : pas de colonne d’outils`); }
        assert.deepEqual(bad, []);
        const c = css('editeurs.css');
        assert.match(c, /--ed-tool: 36px/); assert.match(c, /\.ed-rail\.ed-rail \{ width: var\(--ed-tool\)/);
        assert.ok(fs.readFileSync(path.join(root, 'index.php'), 'utf8').match(/app-editeurs\.js\?v=\d+/) && /editeurs\.css\?v=\d+/.test(fs.readFileSync(path.join(root, 'index.php'), 'utf8')), 'chargés par index.php');
    });
    await t('K18 : plus de variante du zoom ni de l’aimant dans les éditeurs', () => {
        const bad = [], rx = [
            [/data-rs-zoom-label|>Ajusté</, 'zoom « Ajusté » (retouche rapide)'], [/<select data-ly-zoom/, 'menu « Page entière ▾ » (mise en page)'], [/<span data-vx-zoom><\/span>/, '« 137 % » seul (dessin)'],
            [/<span class="h-rt-zoom">/, 'zoom en haut (retouche)'], [/'－ ⤢ ＋ Zoom'/, 'zoom de la barre (transcription)'], [/<button[^>]*data-avx-zoom="(in|out|fit)"/, 'zoom ⤢ Tout (son)'],
            [/🧲 Aimants<|Grille et magnétisme|Repères aimantés|'Magnétisme'|Magnétisme activé/, 'un autre nom pour l’aimant'], [/class="h-mt-zoomr"(?![^>]*ed-old-hidden)/, '« Zoom de la frise » visible'],
            [/<label class="kn-sbi" data-kn-zoomw>/, 'zoom de la présentation (menu)'], [/<span class="h-bt-zoom">/, 'zoom en haut (tableaux)']];
        for (const f of [...Object.keys(EDITORS), 'heritage-transcribe-view.js']) { const s = js(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); rx.forEach(([r, w]) => { if (r.test(s)) bad.push(`${f} : ${w}`); }); }
        assert.deepEqual(bad, []);
    });
    await t('K19 : les actions de fin seulement en haut (« 💾 Enregistrer ▾ ») ; la barre de la Maison sans le petit message', () => {
        assert.match(js('heritage-retouch-simple.js'), /<div class="modal-actions ed-old-hidden"/);
        assert.match(js('heritage-studio.js'), /acts\?\.classList\.add\('ed-old-hidden'\)/);
        assert.equal((js('heritage-studio-av.js').match(/<div class="modal-actions ed-old-hidden"/g) || []).length, 2, 'montage et son');
        ['heritage-retouch-simple.js', 'heritage-studio.js', 'heritage-studio-av.js'].forEach(f => assert.match(js(f), /saveMenu\?\.\(/, f));
        assert.ok(!/<span class="h-hs-msg" data-hs-msg><\/span>/.test(js('heritage-house.js')), 'Maison : plus de message dans la barre du haut');
    });
    await t('K20 : ⠿ partout (plus de ☰, ≡, ↕), Alt + ↑ / ↓, poignées des objets au bleu de l’app', () => {
        const bad = [];
        fs.readdirSync(path.join(root, 'assets/js')).filter(f => f.endsWith('.js')).forEach(f => { const s = js(f); const m = s.match(/class="[^"]*grip[^"]*"[^>]*>(↕|☰|≡)</g); if (m) bad.push(`${f} : ${m.length}`); });
        assert.deepEqual(bad, []);
        const d = js('heritage-dnd.js'); assert.match(d, /e\.altKey/); assert.match(d, /ArrowUp/); assert.match(d, /tabIndex = 0/);
        const c = css('editeurs.css');
        assert.match(c, /\.vx-handle, \.h-hs-handle, \.h-tx-handle \{ fill: #fff !important; stroke: var\(--ed-handle-line\)/);
        assert.match(c, /\.kn-h, \.ly-h, \.h-bh, \.h-rt-crop i \{ background: #fff !important; border: 1\.5px solid var\(--ed-handle-line\)/);
        assert.match(c, /\.kn-h-rot, \.ly-h-rot, \.h-bh-rot \{ border-radius: 50% !important/);
        assert.match(c, /color: var\(--ed-grip\) !important; font-size: 16px !important/);
    });
    await t('E1 : ↶ ↷ (vrai historique) et menus dans la Transcription et la Retouche rapide', () => {
        const tx = js('heritage-transcribe.js'), rs = js('heritage-retouch-simple.js');
        assert.match(tx, /data-tx-hist="undo"/); assert.match(tx, /data-tx-hist="redo"/); assert.match(tx, /editorHistory\?\.\(/); assert.match(tx, /editorMenus\?\.\(/);
        assert.match(rs, /data-rs-undo/); assert.match(rs, /editorMenus\?\.\(/); assert.match(rs, /Fichier: \(\) =>/); assert.match(rs, /Édition: \(\) =>/); assert.match(rs, /Affichage: \(\) =>/);
    });
    await t('E5 : plus de menu déroulant de polices (Apparence, Tableaux)', () => {
        const b = js('heritage-boards.js'), a = js('app.js');
        assert.ok(!/<select data-bd-sel="(font|lbFont)"/.test(b), 'Tableaux');
        assert.match(b, /data-bd-fontpick="\$\{key\}"/);
        assert.match(a, /<select name="fontFamily" id="font-family-select" hidden>/, 'Apparence : la liste cachée, le bouton ouvre openFontPicker');
        assert.match(a, /id="detect-local-fonts" title="Choisir la police/);
    });
    await t('K2 : plus de bouton « Enregistrer » dans les réglages de l’agenda, des livres, des listes à ranger d’Apparence', () => {
        const cal = js('heritage-calendars.js'), ly = js('heritage-layout.js');
        const calDlg = cal.slice(cal.indexOf('function settingsDialog'), cal.indexOf('function settingsDialog') + 6000);
        assert.ok(!/submitLabel: 'Enregistrer'/.test(calDlg) && !/onSubmit:/.test(calDlg.slice(0, calDlg.indexOf('\n    }\n'))), 'agenda / calendrier');
        assert.match(calDlg, /autoSaveDialog\?\.\(/);
        const lyDlg = ly.slice(ly.indexOf('function defaultsDialog'), ly.indexOf('/* ═════════════ La bibliothèque'));
        assert.ok(!/submitLabel: 'Enregistrer'/.test(lyDlg) && !/onSubmit:/.test(lyDlg), 'réglages par défaut des livres'); assert.match(lyDlg, /autoSaveDialog\?\.\(/); assert.match(lyDlg, /data-ui-reset/);
        assert.match(css('editeurs.css'), /\.order-editor :is\(\[data-order-save="menu-order"\]/, 'listes à ranger d’Apparence');
        assert.match(js('app-editeurs.js'), /AUTO_ORDER = \['menu-order', 'list-order', 'map-order'/);
    });
    await t('Documentation : K18, K19, K20 dans docs/UI.md (et CLAUDE.md s’il est là)', () => {
        const ui = fs.readFileSync(path.join(root, 'docs/UI.md'), 'utf8');
        ['## K18', '## K19', '## K20', 'UI.editorStatus', 'UI.editorRail', 'UI.autoSaveDialog'].forEach(k => assert.ok(ui.includes(k), k));
        const cm = path.join(root, 'CLAUDE.md'); if (fs.existsSync(cm)) { const c = fs.readFileSync(cm, 'utf8'); ['**K18', '**K19', '**K20'].forEach(k => assert.ok(c.includes(k), `CLAUDE.md ${k}`)); }
    });

    /* ── 2. navigateur ── */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} harmonisation K18 / K19 / K20 : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-k18-'));
    const shots = process.env.K18_SHOTS || '';
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    // une photo grise (PNG fabriqué ici)
    const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
    const png = (w, h) => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (x + y) % 37 < 3 ? 40 : 200;
        return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };
    fs.writeFileSync(path.join(tmp, 'media', 'photo.png'), png(640, 420));
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES('Joseph','Martin','male','deceased',1),('Marie','Durand','female','living',0)");
$p->exec("INSERT INTO media(title,media_type,filename) VALUES('Photo','image','photo.png')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.K18_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(tmp), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (w, dark = false) => {
        const page = await browser.newPage({viewport: {width: w, height: w < 600 ? 844 : 900}, colorScheme: dark ? 'dark' : 'light'});
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        page.on('dialog', d => d.dismiss());
        await page.addInitScript(() => { window.__rej = []; addEventListener('unhandledrejection', e => window.__rej.push(String(e.reason?.message || e.reason))); });
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1800);
        if (dark) await page.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
        return page;
    };
    const closeAll = page => page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.dataset.ownClose = ''; d.close(); }));
    /** la barre du bas, le zoom et la colonne d'outils de l'éditeur du dessus */
    const probe = page => page.evaluate(() => {
        const host = [...document.querySelectorAll('dialog[open]')].at(-1) || document.getElementById('workspace');
        const sb = [...host.querySelectorAll('[data-ed-status]')].find(b => b.getClientRects().length), rail = [...host.querySelectorAll('.ed-rail')].find(x => x.getClientRects().length);
        if (!sb) return {sb: false};
        const R = (host.matches('dialog') ? host : document.documentElement).getBoundingClientRect(), b = sb.getBoundingClientRect();
        return {sb: true, bottomGap: Math.round((host.matches('dialog') ? Math.min(R.bottom, innerHeight) : innerHeight) - b.bottom), zoom: sb.querySelector('[data-ed-zoom-val]')?.textContent || '',
            parts: ['[data-ed-zoom="out"]', '[data-ed-zoom="menu"]', '[data-ed-zoom="in"]'].every(s => sb.querySelector(s)), rail: rail ? Math.round(rail.getBoundingClientRect().width) : 0,
            railBtn: rail ? Math.round([...rail.querySelectorAll(':scope > button')].find(x => x.getClientRects().length)?.getBoundingClientRect().height || 0) : 0,
            overflow: sb.scrollWidth - sb.clientWidth};
    });
    const zoomKeys = async page => { const z0 = await page.evaluate(() => [...document.querySelectorAll('[data-ed-zoom-val]')].filter(x => x.getClientRects().length).at(-1)?.textContent);
        await page.keyboard.press('Control+Equal'); await page.waitForTimeout(250);
        const z1 = await page.evaluate(() => [...document.querySelectorAll('[data-ed-zoom-val]')].filter(x => x.getClientRects().length).at(-1)?.textContent);
        await page.keyboard.press('Control+Digit0'); await page.waitForTimeout(250);
        const z2 = await page.evaluate(() => [...document.querySelectorAll('[data-ed-zoom-val]')].filter(x => x.getClientRects().length).at(-1)?.textContent);
        return [z0, z1, z2]; };
    const wav = () => { const sr = 8000, n = sr * 3, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 8000, true); return URL.createObjectURL(new Blob([buf], {type: 'audio/wav'})); };
    const lightbox = `const A = window.LCNDA_APP; A.state.lightboxMedia = [{id: 1, filename: 'photo.png', thumbnail: 'photo.png', title: 'Photo', media_type: 'image'}]; A.state.lightboxIndex = 0;`;
    const OPENERS = [
        ['Dessin', 'window.LCNDA_EXT.openVectorEditor({})', 'zoom'],
        ['Mise en page', "window.LCNDA_EXT.layoutKit.openEditor({name: 'Essai'})", 'zoom'],
        ['Maison', 'window.LCNDA_EXT.openHouse({})', 'zoom'],
        ['Retouche rapide', `${lightbox} localStorage.setItem('genealogie-retouch-mode', 'simple'); window.LCNDA_EXT.openRetouch('')`, 'zoom'],
        ['Retouche', `${lightbox} window.LCNDA_EXT.openRetouch('', null, {advanced: true})`, 'zoom'],
        ['Montage', 'window.LCNDA_EXT.newMontage()', 'zoom'],
        ['Son', `window.LCNDA_EXT.openAvEditor({id: 0, title: 'Essai', media_type: 'audio', filename: 'essai.wav', src: (${wav})()})`, 'zoom'],
        ['Transcription', "window.LCNDA_EXT.openActTranscriber({mediaId: 1, filename: 'photo.png', title: 'Acte'})", 'zoom'],
        ['Diaporama', 'window.LCNDA_EXT.openSlideshow({})', 'zoom'],
        ['Présentation', 'window.LCNDA_EXT.openKeynote({})', 'zoom'],
        ['Tableaux', "(async () => { const s = await window.LCNDA_APP.api('save_board', {}, {method: 'POST', body: {title: 'Essai', data: {items: []}}}); window.LCNDA_EXT.openBoardById(s.result?.id || s.id); })()", 'zoom'],
    ];
    try {
        const page = await open(1440);
        await t(`K18 / K19 : ${OPENERS.length} éditeurs — barre du bas en bas, zoom [− 100 % ▾ +] au clavier, colonne de 36 px`, async () => {
            const bad = [];
            for (const [name, expr] of OPENERS) {
                await closeAll(page); await page.evaluate(e => { (0, eval)(e); }, expr); await page.waitForTimeout(name === 'Tableaux' ? 2500 : 2000);
                const p = await probe(page);
                if (!p.sb) { bad.push(`${name} : pas de barre du bas`); continue; }
                if (p.bottomGap > 40 || p.bottomGap < -2) bad.push(`${name} : barre à ${p.bottomGap} px du bas`);
                if (!p.parts || !/^\d+ %$/.test(p.zoom)) bad.push(`${name} : zoom « ${p.zoom} »`);
                if (p.rail !== 36) bad.push(`${name} : colonne de ${p.rail} px`);
                if (p.railBtn && (p.railBtn < 30 || p.railBtn > 36)) bad.push(`${name} : cases de ${p.railBtn} px`);
                if (p.overflow > 2) bad.push(`${name} : la barre du bas déborde`);
                const [z0, z1, z2] = await zoomKeys(page);
                if (z0 === z1) bad.push(`${name} : ⌘+ ne zoome pas (${z0})`);
                if (z1 === z2 && name !== 'Son') bad.push(`${name} : ⌘0 n’ajuste pas (${z1} → ${z2})`);
                if (shots) await page.screenshot({path: path.join(shots, `k18-${name.replace(/\W+/g, '-')}.png`)});
            }
            assert.deepEqual(bad, []);
        });
        await t('K18 : le menu du zoom propose Ajuster, 50 %, 100 %, 200 % ; 200 % se lit dans la barre', async () => {
            await closeAll(page); await page.evaluate(() => window.LCNDA_EXT.openVectorEditor({})); await page.waitForTimeout(1500);
            await page.click('dialog[open] [data-ed-zoom="menu"]'); await page.waitForTimeout(200);
            const items = await page.$$eval('.ui-actmenu-i', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
            ['Ajuster à la fenêtre', '50 %', '100 %', '200 %'].forEach(w => assert.ok(items.some(x => x.includes(w)), `${w} dans ${items}`));
            await page.click('.ui-actmenu-i:has-text("200 %")'); await page.waitForTimeout(200);
            assert.equal(await page.textContent('dialog[open] [data-ed-zoom-val]'), '200 %');
            await page.click('dialog[open] .ed-magnet'); const m = await page.getAttribute('dialog[open] .ed-magnet', 'aria-pressed'); await page.click('dialog[open] .ed-magnet');
            assert.notEqual(m, await page.getAttribute('dialog[open] .ed-magnet', 'aria-pressed'), '🧲 s’allume et s’éteint');
        });
        await t('K20 : poignées des objets blanches au bord bleu de l’app (Dessin, Maison, Transcription, Présentation, Mise en page, Tableaux, Retouche)', async () => {
            const got = await page.evaluate(() => {
                const d = [...document.querySelectorAll('dialog[open]')].at(-1), blue = getComputedStyle(document.documentElement).getPropertyValue('--ui-blue').trim();
                const probeEl = document.createElement('div'); probeEl.style.color = blue; d.appendChild(probeEl); const blueRgb = getComputedStyle(probeEl).color; probeEl.remove();
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); d.appendChild(svg);
                const out = {blueRgb};
                ['vx-handle', 'h-hs-handle', 'h-tx-handle'].forEach(c => { const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); r.setAttribute('class', c); svg.appendChild(r); const s = getComputedStyle(r); out[c] = [s.fill, s.stroke]; });
                const kn = document.createElement('div'); kn.className = 'kn'; d.appendChild(kn);
                [['kn-h kn-h-nw', kn], ['ly-h', d], ['h-bh', d]].forEach(([c, host]) => { const e = document.createElement('span'); e.className = c; host.appendChild(e); const s = getComputedStyle(e); out[c] = [s.backgroundColor, s.borderTopColor, s.width]; });
                const rot = document.createElement('span'); rot.className = 'kn-h kn-h-rot'; kn.appendChild(rot); out.rot = getComputedStyle(rot).borderRadius;
                svg.remove(); kn.remove(); return out; });
            ['vx-handle', 'h-hs-handle', 'h-tx-handle'].forEach(c => assert.deepEqual(got[c], ['rgb(255, 255, 255)', got.blueRgb], c));
            ['kn-h kn-h-nw', 'ly-h', 'h-bh'].forEach(c => { assert.equal(got[c][0], 'rgb(255, 255, 255)', c); assert.equal(got[c][1], got.blueRgb, c); });
            assert.equal(got['kn-h kn-h-nw'][2], '9px'); assert.equal(got.rot, '50%', 'un rond pour tourner');
        });
        await t('E1 : Transcription — menus, ↶ ↷ défont et refont le titre, ⌘Z dans une case garde l’annulation de la case', async () => {
            await closeAll(page); await page.evaluate(() => window.LCNDA_EXT.openActTranscriber({mediaId: 1, filename: 'photo.png', title: 'Acte'})); await page.waitForTimeout(1800);
            const D = 'dialog.h-tx-dlg[open]';
            assert.deepEqual(await page.$$eval(`${D} [data-ui-menu]`, l => l.map(x => x.textContent)), ['Fichier', 'Édition', 'Outils', 'Affichage']);
            await page.fill(`${D} [data-tx="title"]`, 'Baptême de Jean'); await page.click(`${D} [data-tx-stage]`, {position: {x: 30, y: 30}}); await page.waitForTimeout(700);
            assert.equal(await page.isEnabled(`${D} [data-tx-hist="undo"]`), true, '↶ allumé');
            await page.click(`${D} [data-tx-hist="undo"]`); await page.waitForTimeout(200);
            assert.equal(await page.inputValue(`${D} [data-tx="title"]`), 'Acte', '↶ remet le titre');
            await page.click(`${D} [data-tx-hist="redo"]`); await page.waitForTimeout(200);
            assert.equal(await page.inputValue(`${D} [data-tx="title"]`), 'Baptême de Jean', '↷ le refait');
            await page.click(`${D} [data-ui-menu="Édition"]`); await page.waitForTimeout(150);
            assert.ok(await page.$('.ui-actmenu-i:has-text("Annuler")'), 'menu Édition'); await page.keyboard.press('Escape');
        });
        await t('E1 / K19 : Retouche rapide — menus, ↶ défait un réglage, actions de fin dans « 💾 Enregistrer ▾ », outils dans la colonne', async () => {
            await closeAll(page); await page.evaluate(e => { (0, eval)(e); }, `${lightbox} localStorage.setItem('genealogie-retouch-mode', 'simple'); window.LCNDA_EXT.openRetouch('')`); await page.waitForTimeout(1800);
            const D = 'dialog.h-retouch-simple[open]';
            assert.deepEqual(await page.$$eval(`${D} [data-ui-menu]`, l => l.map(x => x.textContent)), ['Fichier', 'Édition', 'Outils', 'Affichage']);
            await page.evaluate(D => { const i = document.querySelector(D + ' [data-rs="contrast"]'); i.value = '40'; i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true})); }, D);
            await page.click(`${D} [data-rs-undo]`); assert.equal(await page.inputValue(`${D} [data-rs="contrast"]`), '0', '↶ remet le réglage');
            assert.equal(await page.$$eval(`${D} .modal-actions button`, l => l.filter(b => b.getClientRects().length).length), 0, 'plus de boutons de fin en bas');
            await page.click(`${D} .ed-save-more`); await page.waitForTimeout(150);
            const items = await page.$$eval('.ui-actmenu-i', l => l.map(x => x.textContent));
            assert.ok(items.some(x => /Enregistrer sans l’afficher/.test(x)) && items.some(x => /Copie séparée/.test(x)), items.join(' | ')); await page.keyboard.press('Escape');
            await page.click(`${D} .ed-rail [data-rs-mode="heal"]`); assert.match(await page.textContent(`${D} [data-ed-help]`), /tache/);
        });
        await t('K2 : réglages de Mon agenda — enregistrés tout seuls, « Fermer » seul, « ↶ Annuler »', async () => {
            await closeAll(page); await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.listType = 'my_calendar'; await A.setModule('listes'); }); await page.waitForTimeout(1200);
            await page.locator('#workspace button', {hasText: '⚙️ Réglages'}).first().click(); await page.waitForTimeout(500);
            const foot = await page.$$eval('dialog[open] .modal-actions button', l => l.filter(b => b.getClientRects().length).map(b => b.textContent.trim()));
            assert.deepEqual(foot, ['Fermer']);
            const before = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-cal-agenda') || '{}').style || 'classique');
            await page.selectOption('dialog[open] [name="style"]', 'compact'); await page.waitForTimeout(400);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-cal-agenda') || '{}').style), 'compact', 'enregistré tout de suite');
            assert.match(await page.textContent('dialog[open] [data-ed-saved]'), /Enregistré/);
            await page.locator('.toast button', {hasText: 'Annuler'}).last().click(); await page.waitForTimeout(300);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-cal-agenda') || '{}').style || 'classique'), before, '↶ Annuler remet le style');
            assert.equal(await page.inputValue('dialog[open] [name="style"]'), before, 'et la fenêtre le montre');
        });
        await t('K20 / K2 : Apparence — ⠿ + Alt + ↓ range le menu, enregistré tout seul (plus de bouton « Enregistrer »)', async () => {
            await closeAll(page); await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'design'; await A.setModule('maintenance'); }); await page.waitForTimeout(1500);
            assert.equal(await page.evaluate(() => [...document.querySelectorAll('#workspace [data-order-save="menu-order"]')].filter(b => b.getClientRects().length).length), 0, 'bouton caché');
            assert.equal(await page.evaluate(() => [...document.querySelectorAll('#menu-order .order-grip')].every(g => g.textContent.trim() === '⠿' && g.tabIndex === 0)), true, '⠿ partout, prise au clavier');
            const k0 = await page.evaluate(() => [...document.querySelectorAll('#menu-order .order-row')].map(r => r.dataset.orderKey));
            await page.evaluate(() => document.querySelector('#menu-order .order-row:nth-child(2) .order-grip').focus());
            await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(900);
            const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-menu-order') || '[]'));
            assert.equal(stored[1], k0[2]); assert.equal(stored[2], k0[1]);
            assert.match(await page.evaluate(() => document.querySelector('.ui-ph-saved')?.textContent || ''), /Enregistré/);
            assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#font-family-select')).display), 'none', 'E5 : plus de menu de polices');
            assert.ok(await page.isVisible('#detect-local-fonts'), 'E5 : le bouton de la liste commune');
        });
        await page.close();
        const ph = await open(390, true);
        await t('390 px en mode sombre : barre du bas et colonne dans l’écran (Dessin, Transcription)', async () => {
            const bad = [];
            for (const [name, expr] of [OPENERS[0], OPENERS[7]]) {
                await closeAll(ph); await ph.evaluate(e => { (0, eval)(e); }, expr); await ph.waitForTimeout(1800);
                const p = await probe(ph); if (!p.sb) { bad.push(`${name} : pas de barre`); continue; }
                if (p.rail !== 36) bad.push(`${name} : colonne ${p.rail}`);
                const wide = await ph.evaluate(() => { const sb = [...document.querySelectorAll('dialog[open] [data-ed-status]')].at(-1).getBoundingClientRect(); return sb.right > innerWidth + 1 || sb.left < -1; });
                if (wide) bad.push(`${name} : la barre sort de l’écran`);
                if (shots) await ph.screenshot({path: path.join(shots, `k18-390-${name}.png`)});
            }
            assert.equal(await ph.evaluate(() => document.documentElement.dataset.theme), 'dark');
            assert.deepEqual(bad, []);
        });
        await t('aucune erreur JavaScript', async () => { for (const p of [ph]) errs.push(...await p.evaluate(() => window.__rej || [])); assert.deepEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {} }
    console.log(`${failed ? '✗' : '✓'} harmonisation K18 / K19 / K20 : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
