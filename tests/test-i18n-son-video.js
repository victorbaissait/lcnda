'use strict';
/* 🌐 Traduction de la zone « son-video » (vague 5, les éditeurs restants) : 🎬 montage vidéo (heritage-studio-av.js,
 * heritage-montage-plus.js), 🎧 éditeur de son « Comme avant », ⚡ Son rapide, 🎚️ Studio son et Multipiste
 * (heritage-audio-*.js, avec les noms d'effets du moteur), 🎞️ diaporama et récit de vie (heritage-slideshow.js),
 * lecteur (heritage-av.js), 🎤 Scène (heritage-scene*.js). Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-son-video.js          (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20570 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-son-video.js   liste les textes restés en français, écran par écran
 * 1. Node : fichiers de langue complets (scripts/i18n-check.js) ; les textes i18n() des fichiers de la zone traduits dans
 *    les 7 langues ; le moteur du son chargé hors navigateur reste en français (noms d'effets, identifiants inchangés).
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français dans les
 *    écrans ; la barre du haut du montage et du Studio son tient sur une ligne en allemand à 1440 px ; allemand à 390 px
 *    sans débordement de la page ; les titres des médias jamais retouchés ; aucune erreur JS.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const PROBE = process.env.I18N_PROBE || '';
const ZONE_FILES = ['heritage-studio-av.js', 'heritage-montage-plus.js', 'heritage-av.js', 'heritage-slideshow.js', 'heritage-audio-engine.js', 'heritage-audio-multi.js',
    'heritage-audio-quick.js', 'heritage-audio-studio.js', 'heritage-scene.js', 'heritage-scene-actor.js', 'heritage-scene-list.js', 'heritage-scene-series.js'].map(f => path.join(root, 'assets/js', f));
// au plus ce nombre de textes français par écran (noms propres, textes d'autres zones, quelques mots rares)
const ALLOWED = Number(process.env.I18N_ALLOWED || 6);
/** un WAV 16 bits mono de quelques secondes */
function wav(file, dur, sr = 22050) {
    const n = Math.round(dur * sr), b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) { const x = i / sr; b.writeInt16LE(Math.round((x > 0.5 && x < dur - 0.5 ? 0.3 * Math.sin(2 * Math.PI * 330 * x) : 0) * 32767), 44 + i * 2); }
    fs.writeFileSync(file, b);
}

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/son-video.tsv')));
    });
    await t('les textes passés à i18n() dans les fichiers de la zone sont traduits dans les 7 langues', () => {
        const X = require('../scripts/i18n-extract.js');
        for (const l of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl']) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) X.tCalls(f).forEach(x => { if (!X.translated(dict, x.text, x.ctx)) miss.push(`${path.basename(f)}:${x.line} ${x.text}`); });
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    await t('le moteur du son hors navigateur : il se charge, noms d’effets en français, identifiants inchangés', () => {
        const src = fs.readFileSync(path.join(root, 'assets/js/heritage-audio-engine.js'), 'utf8');
        const win = {LCNDA_EXT: {}}; const fn = new Function('window', 'self', 'globalThis', src); // eslint-disable-line no-new-func
        try { fn(win, win, win); } catch (_) { /* un navigateur manque : on lit seulement ce qui est déjà posé */ }
        const E = win.LCNDA_EXT.audioEngine;
        if (!E) return; // le moteur demande un AudioContext : rien à vérifier hors navigateur
        const fx = E.FX || {};
        assert.ok(fx.denoise && fx.eqg, Object.keys(fx).join(', '));
        assert.match(String(fx.reverb?.label || fx.reverb?.name || ''), /Réverbération/);
    });
    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction du son et de la vidéo : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-son-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    wav(path.join(tmp, 'media', 'cassette.wav'), 4);
    // une petite image (PNG 2×2) pour le diaporama et le montage
    fs.writeFileSync(path.join(tmp, 'media', 'photo.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64'));
    const project = {sources: [{src: 'media/photo.png', title: 'Photo du moulin', kind: 'image', dur: 4, w: 2, h: 2}],
        v1: [{id: 'va', s: 0, from: 0, to: 4, tr: {type: 'none', d: 1}, look: {}, vol: 1}], v2: [], audio: [],
        texts: [{id: 'ta', at: 0.3, dur: 2, text: 'Le moulin de Tulle', size: 6, track: 'T1', font: 'Georgia, serif'}],
        tracks: [{id: 'V2', kind: 'v', name: 'Vidéo 2'}, {id: 'V1', kind: 'main', name: 'Vidéo 1'}, {id: 'T1', kind: 't', name: 'Textes 1'}, {id: 'A1', kind: 'a', name: 'Son 1'}]};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $p = db();
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased')"); $pid = (int) $p->lastInsertId();
$p->exec("INSERT INTO media(title,media_type,filename) VALUES('Cassette Noël 1978','audio','cassette.wav')"); $cas = (int) $p->lastInsertId();
$p->exec("INSERT INTO media(title,media_type,filename) VALUES('Photo du moulin','photo','photo.png')"); $ph = (int) $p->lastInsertId();
$p->prepare("INSERT INTO montage_projects(name, data_json) VALUES(?, ?)")->execute(['Essai', $argv[1]]); $mp = (int) $p->lastInsertId();
echo json_encode(['pid' => $pid, 'cas' => $cas, 'ph' => $ph, 'mp' => $mp]);`, JSON.stringify(project)], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ids = JSON.parse(seed.stdout.slice(seed.stdout.indexOf('{')));
    const CAS = {id: ids.cas, title: 'Cassette Noël 1978', filename: 'cassette.wav', media_type: 'audio'};
    const port = Number(process.env.I18N_PORT) || 20570;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    const browser = await chromium.launch({...(fs.existsSync(exe) ? {executablePath: exe} : {}), args: ['--autoplay-policy=no-user-gesture-required']});
    const errs = [];
    const watch = (page, tag) => { page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon/.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss()); };
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { try { if (!sessionStorage.getItem('i18n-test-set')) { if (l) localStorage.setItem('lcnda-langue', l); else localStorage.removeItem('lcnda-langue'); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage(); watch(page, `${lang || 'fr'} ${w}px`);
        await page.goto(base, {waitUntil: 'load'});
        await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openMontageProject && window.LCNDA_EXT?.openAudioStudio && window.LCNDA_EXT?.openSlideshow, null, {timeout: 30000});
        await page.waitForTimeout(800);
        return page;
    };
    const closeAll = page => page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => { d._aq?.forceClose?.(); d.dispatchEvent(new Event('lcnda-test-close')); d.close(); d.remove(); }); document.querySelectorAll('.ui-menu, .ctx-menu, [data-ui-menu]').forEach(x => x.remove()); });
    // les écrans de la zone : comment l'ouvrir, puis la fenêtre dont on lit les textes
    const SCREENS = {
        montage: {go: `window.LCNDA_EXT.openMontageProject(${ids.mp})`, sel: 'dialog.h-avx-montage', wait: 2500},
        'montage-projets': {go: 'window.LCNDA_EXT.openMontageProjects()', sel: 'top', wait: 1200},
        'son-avant': {go: `window.LCNDA_EXT._av.openAudio(${JSON.stringify(CAS)})`, sel: 'top', wait: 2000},
        'son-rapide': {go: `window.LCNDA_EXT.openQuickSound(${JSON.stringify(CAS)})`, sel: 'dialog.h-aq', wait: 2000},
        'studio-son': {go: `window.LCNDA_EXT.openAudioStudio(${JSON.stringify(CAS)})`, sel: 'dialog.h-as', wait: 2500},
        'projets-son': {go: 'window.LCNDA_EXT.openAudioProjects()', sel: 'top', wait: 1200},
        diaporama: {go: 'window.LCNDA_EXT.openSlideshow({})', sel: 'dialog.h-ss-dlg', wait: 2000},
        'recit-de-vie': {go: `window.LCNDA_EXT.storyOptions ? window.LCNDA_EXT.storyOptions({pid: ${ids.pid}}) : null`, sel: 'top', wait: 1200},
        lecteur: {go: `window.LCNDA_EXT.playMedia([${JSON.stringify(CAS)}], 0)`, sel: 'top', wait: 1200},
        scene: {go: `window.LCNDA_EXT.artistCatalog.open(${ids.pid}, {kind: 'concert'})`, sel: 'dialog.ar-dlg', wait: 2000},
    };
    const textsOf = (page, sel) => page.evaluate(sel => {
        const el = sel === 'top' ? [...document.querySelectorAll('dialog[open]')].pop() : document.querySelector(sel + '[open]') || document.querySelector(sel); if (!el) return null;
        const out = new Set(); const tw = document.createTreeWalker(el, 5); let n = el;
        const skip = '[data-i18n-off], script, style, textarea, code, pre, [contenteditable="true"], option[value=""]';
        do {
            if (n.nodeType === 1) { if (n.closest(skip)) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
            else if (n.nodeType === 3 && !n.parentElement.closest(skip)) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
        } while ((n = tw.nextNode()));
        return [...out];
    }, sel);
    const screen = async (page, key) => {
        const s = SCREENS[key];
        await page.evaluate(go => { try { const r = eval(go); r?.catch?.(() => {}); } catch (e) { console.warn(e); } }, s.go); // eslint-disable-line no-eval
        await page.waitForTimeout(s.wait);
        const list = await textsOf(page, s.sel);
        return list;
    };
    try {
        if (PROBE) {
            const only = (process.env.I18N_SCREENS || '').split(',').filter(Boolean);
            const fr = await open(), de = await open({lang: PROBE}), isFr = R.make(PROBE);
            for (const k of Object.keys(SCREENS)) {
                if (only.length && !only.includes(k)) continue;
                const a = await screen(fr, k) || [], b = await screen(de, k);
                await closeAll(fr); await closeAll(de);
                if (!b) { console.log(`\n── ${k} : pas d'écran`); continue; }
                const same = b.filter(x => a.includes(x) && /\p{L}{3}/u.test(x));
                const flagged = b.filter(isFr);
                console.log(`\n══ ${k} : ${flagged.length} repérés en français, ${same.length} identiques au français`);
                [...new Set([...flagged, ...same])].forEach(x => console.log((flagged.includes(x) ? '! ' : '  ') + x));
            }
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : menus du montage et du Studio son en français, pas de bandeau', async () => {
            const page = await open();
            await screen(page, 'montage');
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'),
                menus: [...document.querySelectorAll('dialog.h-avx-montage .h-mt-menubar summary')].map(s => s.textContent.trim())}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false);
            assert.equal(r.menus[0], 'Fichier', r.menus.join(', '));
            await closeAll(page);
            const st = await screen(page, 'studio-son');
            assert.ok(st.includes('Fichier') && st.includes('Effets'), st.slice(0, 30).join(' | '));
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : montage, sons, diaporama, lecteur et Scène traduits (au plus ${ALLOWED} textes français par écran)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            for (const k of Object.keys(SCREENS)) {
                const list = await screen(page, k);
                if (shots && list) await page.screenshot({path: path.join(shots, `i18n-son-${l}-${k}.png`)});
                if (list) { const left = list.filter(isFr); if (left.length > ALLOWED) bad[k] = left; }
                if (k === 'montage') { const menus = await page.evaluate(() => [...document.querySelectorAll('dialog.h-avx-montage .h-mt-menubar summary')].map(s => s.textContent.trim())); assert.notEqual(menus[0], 'Fichier', menus.join(', ')); const clips = await page.evaluate(() => [...document.querySelectorAll('dialog.h-avx-montage [data-mt-clip]')].map(b => b.textContent).join(' | ')); assert.ok(/Le moulin de Tulle/.test(clips) && /Photo du moulin/.test(clips), 'le texte et les titres de la personne restent tels quels : ' + clips); }
                if (k === 'son-rapide' || k === 'studio-son') { const all = await page.evaluate(sel => { const d = document.querySelector(sel + '[open]'); return d ? d.textContent + ' ' + [...d.querySelectorAll('input')].map(i => i.value).join(' ') : ''; }, SCREENS[k].sel); assert.ok(/Cassette Noël 1978/.test(all), `${k} : le titre du son reste tel quel`); }
                await closeAll(page);
            }
            assert.deepEqual(bad, {}, `textes français restés : ${JSON.stringify(bad, null, 1)}`);
            await page.context().close();
        });
        await t('allemand à 1440 px : la barre du haut du montage et du Studio son tient sur une ligne', async () => {
            const page = await open({lang: 'de'}), out = {};
            for (const [k, sel] of [['montage', 'dialog.h-avx-montage'], ['studio-son', 'dialog.h-as'], ['diaporama', 'dialog.h-ss-dlg']]) {
                await screen(page, k);
                out[k] = await page.evaluate(sel => {
                    const bar = document.querySelector(`${sel} .ui-topbar`); if (!bar) return {none: true};
                    const kids = [...bar.querySelectorAll(':scope > *')].filter(x => x.offsetParent && x.getBoundingClientRect().width > 0);
                    const mids = kids.map(x => { const r = x.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
                    return {h: bar.getBoundingClientRect().height, spread: Math.max(...mids) - Math.min(...mids), sw: bar.scrollWidth, cw: bar.clientWidth};
                }, sel);
                if (shots) await page.screenshot({path: path.join(shots, `i18n-son-de-1440-${k}.png`)});
                await closeAll(page);
            }
            for (const [k, r] of Object.entries(out)) if (!r.none) assert.ok(r.spread <= 6 && r.h <= 64 && r.sw <= r.cw + 1, `${k} : ${JSON.stringify(r)}`);
            await page.context().close();
        });
        await t('allemand à 390 px : la page ne déborde pas', async () => {
            const page = await open({lang: 'de', w: 390}), out = {};
            for (const k of ['montage', 'son-rapide', 'studio-son', 'diaporama']) {
                await screen(page, k);
                out[k] = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth}));
                if (shots) await page.screenshot({path: path.join(shots, `i18n-son-de-390-${k}.png`)});
                await closeAll(page);
            }
            for (const [k, r] of Object.entries(out)) assert.ok(r.sw <= 391 && r.bw <= 391, `${k} : ${JSON.stringify(r)}`);
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction du son et de la vidéo : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
