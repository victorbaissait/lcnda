#!/usr/bin/env node
/* ⚖️ Comparer les lectures — ✍ « Ma lecture » sous chaque ligne (assets/js/heritage-transcribe-compare.js) et
 * ≡ l'aperçu d'une version « Par lignes » (assets/js/heritage-transcribe-contexte.js) :
 *  1. sans navigateur : les repères « — page N — », les mots de ma lecture qu'aucune lecture ne dit, une lecture d'un seul bloc
 *     découpée d'après mes lignes (mêmes n° que l'éditeur), une lecture avec ses lignes ;
 *  2. dans l'Atelier : le réglage (décoché au départ, retenu) et le bouton de l'en-tête ; une ligne « ✍ Ma lecture » sous chaque
 *     ligne (pas sous « — page 2 — ») ; taper la choisit ; Entrée, Tab, ↑ ↓ ; « ⇣ copier » (↶ Annuler) ; ses mots surlignés ;
 *     en fermant : une version « ✍ Ma lecture (Comparer) » et un brouillon remis à la réouverture ; « Mettre dans le texte » la prend ;
 *  3. l'aperçu d'une version : « ¶ Texte suivi / ≡ Par lignes » (retenu), n° et couleurs de zone comme l'éditeur, « ≈ découpé d'après
 *     tes lignes », « ⚖️ Comparer ligne à ligne », des boutons légers ; 4. un téléphone (390 px). Personnes fictives.
 *   node tests/test-comparer-ma-lecture.js */
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
const C = require('../assets/js/heritage-transcribe-compare.js');
require('../assets/js/heritage-transcribe-contexte.js');
const X = global.LCNDA_EXT.txCtx;

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const L1 = 'Aujourd hui vingt-huit octobre mil huit cent treize';
const HTR = `${L1}\npardevant nous Begnin juge de paix\n— page 2 —\nde Strasbourg est comparu Gaspard Baitser`;
const DEEP1 = 'Aujourd hui Vingt hui octobre mil huit cent huit\npar devant nous M. Beguin juge de paix\nde Strasbourg est comparu Gaspard Bäiller';
const FLAT = 'Aujourd hui vingt huit octobre mil huit cent treize par devant nous Beguin juge de paix de Strasbourg est comparu Gaspard Baillet';
const ZONES = [{id: 'z1', x: 10, y: 10, w: 300, h: 30, s: 0, e: L1.length, note: '', c: '#7cc4f0'}];

(async () => {
    /* ── 1. le calcul ── */
    await t('les repères « — page N — » ne sont pas des lignes ; les mots de ma lecture qu’aucune lecture ne dit', () => {
        assert.ok(C.isSep('— page 2 —') && C.isSep('  — Seite 3 — ') && !C.isSep('page 2') && !C.isSep('— le maire —'));
        assert.deepStrictEqual(C.myDiff(['nous Begnin juge', 'nous Beguin juge'], 'nous Beguin juges', true).filter(x => x.d).map(x => x.w), ['juges']);
        assert.deepStrictEqual(C.myDiff(['a b'], '', true), []);
    });
    await t('≡ par lignes : une lecture d’un seul bloc découpée d’après mes lignes (mêmes n° que l’éditeur, repère sauté, couleurs)', () => {
        const V = X.versionLines(FLAT, HTR, [{s: 0, e: L1.length, c: '#7cc4f0'}]);
        assert.strictEqual(V.approx, true);
        assert.deepStrictEqual(V.rows.map(r => [r.n, r.sep]), [[1, false], [2, false], [3, true], [4, false]]);
        assert.match(V.rows[0].text, /treize$/); assert.match(V.rows[1].text, /^par devant nous Beguin/); assert.match(V.rows[3].text, /^de Strasbourg.*Baillet$/);
        assert.strictEqual(V.rows[0].c, '#7cc4f0'); assert.strictEqual(V.rows[1].c, null, 'sans zone : sans couleur');
        const W = X.versionLines(DEEP1, HTR, []);
        assert.strictEqual(W.approx, false, 'ses propres lignes'); assert.deepStrictEqual(W.rows.map(r => r.n), [1, 2, 4], 'chacune avec le n° de ma ligne');
    });

    /* ── 2. serveur et Atelier ── */
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-txme-'));
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
$pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(1,'Mariage de Gaspard','mariage',1,?,?,'2026-01-01')")->execute([getenv('TX_BODY'), json_encode(['zones' => json_decode(getenv('TX_ZONES'), true), 'people' => []])]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env: {...env, TX_BODY: HTR, TX_ZONES: JSON.stringify(ZONES)}});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txCompare && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (a, q = {}) => p.evaluate(async ([x, y]) => window.LCNDA_APP.api(x, y), [a, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const r1 = await post('save_act_transcription_version', {act_id: 1, label: '🔬 Lecture approfondie · qwen3-vl:32b', body: DEEP1, auto: 0, source: 'deep:qwen3-vl:32b'}); assert.ok(r1.id, JSON.stringify(r1));
        const r2 = await post('save_act_transcription_version', {act_id: 1, label: '🔬 Lecture approfondie · qwen3-vl:4b', body: FLAT, auto: 0, source: 'deep:qwen3-vl:4b'}); assert.ok(r2.id);
        const openAtelier = async pg => { await pg.evaluate(() => window.LCNDA_EXT.openActTranscriber({id: 1})); await pg.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000}); await sleep(600); };
        const openCmp = async pg => { await pg.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg button, dialog.h-tx-dlg summary')].find(b => /^\s*Fichier\b/.test(b.textContent))?.click());
            await pg.waitForSelector('.ui-actmenu'); await pg.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Comparer les lectures/.test(b.textContent)).click());
            await pg.waitForSelector('.h-txc [data-txc-maon]', {timeout: 15000}); await sleep(200); };
        await openAtelier(p);
        const body = () => p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value);
        const active = () => p.evaluate(() => document.activeElement?.dataset?.txcMe ?? null);
        const val = i => p.$eval(`.h-txc [data-txc-me="${i}"]`, e => e.value);

        await t('le réglage « ✍ Ma lecture » : sous « Garder chaque nouvelle lecture », décoché au départ ; le bouton de l’en-tête l’allume (retenu)', async () => {
            await openCmp(p);
            const st = await p.evaluate(() => { const keep = document.querySelector('.h-txc [data-txc-keepon]').closest('label'), me = document.querySelector('.h-txc [data-txc-maon]').closest('label');
                return {next: keep.nextElementSibling === me, on: document.querySelector('.h-txc [data-txc-maon]').checked, rows: document.querySelectorAll('.h-txc [data-txc-me]').length, txt: me.textContent, pressed: document.querySelector('.h-txc [data-txc-maq]').getAttribute('aria-pressed')}; });
            assert.ok(st.next, 'juste sous le réglage « Garder… »'); assert.strictEqual(st.on, false); assert.strictEqual(st.rows, 0); assert.strictEqual(st.pressed, 'false'); assert.match(st.txt, /Ma lecture/);
            await p.click('.h-txc [data-txc-maq]'); await p.waitForSelector('.h-txc [data-txc-me]');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-tx-cmp-ma-lecture')), '1');
            assert.ok(await p.$eval('.h-txc [data-txc-maon]', e => e.checked), 'le réglage suit');
            assert.ok(await p.$eval('.h-txc [data-txc-mode="line"]', e => e.classList.contains('is-active')), 'ligne par ligne');
        });
        await t('une ligne « ✍ Ma lecture » sous chaque ligne, pas sous « — page 2 — » ; vide, « ta lecture de la ligne N… »', async () => {
            const st = await p.evaluate(() => ({me: [...document.querySelectorAll('.h-txc [data-txc-me]')].map(e => [e.dataset.txcMe, e.value, e.placeholder]), sep: [...document.querySelectorAll('.h-txc tr.h-txc-sep')].map(r => [r.textContent.trim(), !!r.querySelector('input')]),
                radios: document.querySelectorAll('.h-txc [data-txc-line$="|-1"]').length}));
            assert.strictEqual(st.me.length, 3); assert.ok(st.me.every(m => m[1] === '')); assert.match(st.me[0][2], /ligne 1/); assert.match(st.me[2][2], /ligne 3/);
            assert.deepStrictEqual(st.sep, [['— page 2 —', false]]); assert.strictEqual(st.radios, 3);
        });
        await t('taper la choisit ; ses mots qu’aucune lecture ne dit surlignés ; Entrée, ↑, Tab passent d’une ligne à l’autre', async () => {
            await p.click('.h-txc [data-txc-me="0"]'); await p.keyboard.type('Aujourd hui vingt-neuf octobre mil huit cent treize');
            assert.ok(await p.$eval('.h-txc [data-txc-line="0|-1"]', e => e.checked), 'sa case cochée');
            assert.ok(await p.$eval('.h-txc [data-txc-line="0|-1"]', e => e.closest('.h-txc-lv').classList.contains('is-on')));
            assert.deepStrictEqual(await p.$$eval('.h-txc [data-txc-me="0"] ~ * mark, .h-txc .h-txc-me-f:has([data-txc-me="0"]) .h-txc-me-bk mark', l => l.map(m => m.textContent)), ['vingt-neuf']);
            if (process.env.SHOT) await p.screenshot({path: path.join(process.env.SHOT, 'ma-lecture.png')});
            await p.keyboard.press('Enter'); assert.strictEqual(await active(), '1');
            await p.keyboard.press('ArrowUp'); assert.strictEqual(await active(), '0');
            await p.keyboard.press('Tab'); assert.strictEqual(await active(), '1');
            await p.keyboard.press('ArrowDown'); assert.strictEqual(await active(), '3', 'le repère de page sauté');
        });
        await t('« ⇣ copier » : la lecture choisie de la ligne dans ma lecture ; ↶ Annuler remet ce que j’avais tapé', async () => {
            await p.evaluate(() => [...document.querySelectorAll('.h-txc [data-txc-line^="1|"]')].find(x => /M\. Beguin/.test(x.closest('label').textContent)).click()); await sleep(100);
            await p.click('.h-txc [data-txc-mecp="1"]'); await sleep(100);
            assert.strictEqual(await val(1), 'par devant nous M. Beguin juge de paix'); assert.ok(await p.$eval('.h-txc [data-txc-line="1|-1"]', e => e.checked));
            await p.click('.h-txc [data-txc-me="1"]', {clickCount: 3}); await p.keyboard.type('par devant nous Beguin juge de paix');
            await p.click('.h-txc [data-txc-mecp="1"]'); await sleep(100);
            assert.strictEqual(await val(1), 'par devant nous M. Beguin juge de paix', 'copié depuis la lecture choisie avant');
            await p.evaluate(() => [...[...document.querySelectorAll('.ui-toast')].filter(x => /Ma lecture de la ligne 2/.test(x.textContent)).at(-1).querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)).click()); await sleep(150);
            assert.strictEqual(await val(1), 'par devant nous Beguin juge de paix');
        });
        await t('en fermant : gardée comme version « ✍ Ma lecture (Comparer) » ; le brouillon remis à la réouverture', async () => {
            await sleep(400); await p.click('.h-txc [data-txc-x]'); await sleep(700);
            const v = (await api('act_transcription_versions', {act_id: 1})).items.filter(x => x.source === 'mine');
            assert.strictEqual(v.length, 1); assert.strictEqual(v[0].label, '✍ Ma lecture (Comparer)');
            const one = await api('act_transcription_version', {id: v[0].id});
            assert.strictEqual(one.body, 'Aujourd hui vingt-neuf octobre mil huit cent treize\npar devant nous Beguin juge de paix\n— page 2 —\nde Strasbourg est comparu Gaspard Baitser');
            assert.ok(await p.evaluate(() => !!localStorage.getItem('genealogie-tx-cmp-draft-1')));
            await openCmp(p); await p.waitForSelector('.h-txc [data-txc-me]');
            assert.strictEqual(await val(0), 'Aujourd hui vingt-neuf octobre mil huit cent treize'); assert.strictEqual(await val(1), 'par devant nous Beguin juge de paix');
            assert.ok(await p.$eval('.h-txc [data-txc-line="0|-1"]', e => e.checked), 'toujours choisie');
            await p.click('.h-txc [data-txc-x]'); await sleep(500);
            assert.strictEqual((await api('act_transcription_versions', {act_id: 1})).items.filter(x => x.source === 'mine').length, 1, 'pas deux fois la même');
        });
        await t('« Mettre dans le texte » prend ma lecture là où elle est choisie ; le brouillon s’efface ; ↶ Annuler', async () => {
            await openCmp(p); await p.waitForSelector('.h-txc [data-txc-me]');
            await p.click('.h-txc [data-txc-me="3"]'); await p.keyboard.type('de Strasbourg est comparu Gaspard Baillet');
            await p.click('.h-txc [data-txc-apply]'); await sleep(700);
            assert.strictEqual((await body()).trim(), 'Aujourd hui vingt-neuf octobre mil huit cent treize\npar devant nous Beguin juge de paix\n— page 2 —\nde Strasbourg est comparu Gaspard Baillet');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-tx-cmp-draft-1')), null);
            assert.strictEqual((await api('act_transcription_versions', {act_id: 1})).items.filter(x => x.source === 'mine').length, 2, 'la nouvelle lecture gardée');
            await p.evaluate(() => [...[...document.querySelectorAll('.ui-toast')].filter(x => /Lectures fusionnées/.test(x.textContent)).at(-1).querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)).click()); await sleep(200);
            assert.strictEqual((await body()).trim(), HTR);
        });
        await t('éteint : plus de « Ma lecture », la fusion reprend les lectures', async () => {
            await openCmp(p); await p.click('.h-txc [data-txc-mode="line"]'); await p.waitForSelector('.h-txc .h-txc-lines');
            await p.click('.h-txc [data-txc-maq]'); await sleep(100);
            assert.strictEqual(await p.$$eval('.h-txc [data-txc-me]', l => l.length), 0); assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-tx-cmp-ma-lecture')), '0');
            await p.click('.h-txc [data-txc-maq]'); await p.waitForSelector('.h-txc [data-txc-me]');
            await p.click('.h-txc [data-txc-x]'); await sleep(300);
        });

        /* ── 3. l'aperçu d'une version ── */
        const chip = async rx => { await p.evaluate(async () => { await new Promise(r => setTimeout(r, 50)); }); await p.waitForFunction(() => document.querySelectorAll('dialog.h-tx-dlg [data-tx-v]').length > 2, null, {timeout: 10000});
            await p.evaluate(src => { const b = [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-v]')].find(x => new RegExp(src).test(x.textContent)); b.click(); }, rx); await p.waitForSelector('dialog.h-tx-dlg [data-tx-vmode]'); };
        await t('≡ l’aperçu « Par lignes » : n° et couleurs de l’éditeur, « ≈ découpé d’après tes lignes » ; retenu', async () => {
            await p.evaluate(() => localStorage.removeItem('genealogie-tx-apercu-lignes'));
            await chip('4b');
            assert.ok(await p.$eval('dialog.h-tx-dlg [data-tx-vmode="flow"]', e => e.getAttribute('aria-checked') === 'true'), 'texte suivi au départ');
            assert.strictEqual(await p.$$eval('dialog.h-tx-dlg .h-tx-vl', l => l.length), 0);
            await p.click('dialog.h-tx-dlg [data-tx-vmode="lines"]');
            const st = await p.evaluate(() => ({rows: [...document.querySelectorAll('dialog.h-tx-dlg .h-tx-vl')].map(r => [r.querySelector('.h-tx-vn').textContent, r.classList.contains('is-sep'), r.querySelector('mark.h-tx-zm')?.style.getPropertyValue('--zc') || '']),
                approx: document.querySelector('dialog.h-tx-dlg .h-tx-vapprox')?.textContent || ''}));
            assert.deepStrictEqual(st.rows, [['1', false, '#7cc4f0'], ['2', false, ''], ['3', true, ''], ['4', false, '']]);
            assert.match(st.approx, /découpé d’après tes lignes/);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-tx-apercu-lignes')), '1');
            await chip('32b');
            assert.ok(await p.$eval('dialog.h-tx-dlg [data-tx-vmode="lines"]', e => e.getAttribute('aria-checked') === 'true'), 'retenu');
            assert.deepStrictEqual(await p.$$eval('dialog.h-tx-dlg .h-tx-vl .h-tx-vn', l => l.map(x => x.textContent)), ['1', '2', '4'], 'ses lignes à elle, avec mes n°');
            assert.strictEqual(await p.$$eval('dialog.h-tx-dlg .h-tx-vapprox', l => l.length), 0);
            if (process.env.SHOT) await p.screenshot({path: path.join(process.env.SHOT, 'apercu-lignes.png')});
        });
        await t('l’aperçu : des boutons légers sur une ligne qui passe à la ligne, « Supprimer » discret', async () => {
            const st = await p.evaluate(() => { const bs = [...document.querySelectorAll('dialog.h-tx-dlg .h-tx-vbtns .button')], del = document.querySelector('dialog.h-tx-dlg [data-tx-vdel]'), cs = getComputedStyle(del);
                return {shadow: bs.map(b => getComputedStyle(b).boxShadow), wrap: getComputedStyle(bs[0].parentNode).flexWrap, delBg: cs.backgroundColor, delBorder: parseFloat(cs.borderTopWidth)}; });
            assert.ok(st.shadow.every(s => s === 'none'), st.shadow.join(' | ')); assert.strictEqual(st.wrap, 'wrap');
            assert.ok(/rgba\(0, 0, 0, 0\)|transparent/.test(st.delBg), st.delBg); assert.ok(st.delBorder <= 1.5);
        });
        await t('« ⚖️ Comparer ligne à ligne » (≡ Par lignes, Ma lecture allumée) : Comparer en ligne par ligne, la version cochée', async () => {
            assert.strictEqual(await p.$eval('dialog.h-tx-dlg [data-tx-vcmpl]', e => e.hidden), false);
            await p.click('dialog.h-tx-dlg [data-tx-vcmpl]'); await p.waitForSelector('.h-txc .h-txc-lines', {timeout: 15000});
            const st = await p.evaluate(id => ({on: document.querySelector(`.h-txc [data-txc-pick="${id}"]`)?.checked, me: document.querySelectorAll('.h-txc [data-txc-me]').length}), r1.id);
            assert.ok(st.on); assert.strictEqual(st.me, 3);
            await p.click('.h-txc [data-txc-x]'); await sleep(200);
            await p.click('dialog.h-tx-dlg [data-tx-vmode="flow"]'); assert.strictEqual(await p.$eval('dialog.h-tx-dlg [data-tx-vcmpl]', e => e.hidden), true);
        });

        /* ── 4. un téléphone ── */
        await t('390 px : Ma lecture tient dans l’écran (pas de défilement de côté)', async () => {
            const q = await (await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})).newPage();
            q.on('pageerror', e => errs.push(e.message));
            await q.goto(base); await q.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
            await q.evaluate(() => localStorage.setItem('genealogie-tx-cmp-ma-lecture', '1'));
            await openAtelier(q);
            await q.evaluate(() => window.LCNDA_EXT.txCompare.open({actId: 1, title: 'Mariage', current: () => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value, api: (a, b) => window.LCNDA_APP.api(a, b), post: (a, b) => window.LCNDA_APP.api(a, {}, {method: 'POST', body: b}), apply: () => {}, mode: 'line'}));
            await q.waitForSelector('.h-txc [data-txc-me]');
            const st = await q.evaluate(() => { const d = document.querySelector('.h-txc'), f = [...d.querySelectorAll('[data-txc-me], [data-txc-mecp]')].map(e => e.getBoundingClientRect());
                return {over: d.scrollWidth - d.clientWidth, right: Math.max(...f.map(r => r.right)), w: Math.min(...[...d.querySelectorAll('[data-txc-me]')].map(e => e.getBoundingClientRect().width)), font: getComputedStyle(d.querySelector('[data-txc-me]')).fontSize}; });
            if (process.env.SHOT) { await q.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await q.click('.h-txc [data-txc-me="0"]'); await q.keyboard.type('Aujourd hui vingt-neuf'); await q.screenshot({path: path.join(process.env.SHOT, 'phone-dark.png')}); }
            assert.ok(st.over <= 1, `défilement de côté : ${st.over}`); assert.ok(st.right <= 390, `dépasse : ${st.right}`); assert.ok(st.w >= 120, `champ trop étroit : ${st.w}`); assert.strictEqual(st.font, '16px');
            await q.close();
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); }
    console.log(fails ? `${fails} essai(s) en échec` : '✍ Ma lecture et ≡ l’aperçu par lignes marchent.');
    process.exit(fails ? 1 : 0);
})();
