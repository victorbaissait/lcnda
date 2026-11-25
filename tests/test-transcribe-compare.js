#!/usr/bin/env node
/* ⚖️ Comparer les lectures (assets/js/heritage-transcribe-compare.js) :
 *  1. sans navigateur : aligner mot par mot (mots changés, ajoutés, enlevés, lignes gardées), la majorité, ligne par ligne, les mots qui diffèrent ;
 *  2. serveur : une lecture (source « htr:… », « deep:… ») est gardée comme version, jamais effacée par les versions automatiques ;
 *  3. dans l'Atelier : Fichier → ⚖️ Comparer les lectures… ; 3 lectures, les passages qui diffèrent, choisir une variante, la majorité,
 *     ligne par ligne, « Mettre dans le texte » (le texte d'avant dans 🕘 Versions, ↶ Annuler), « Garder la fusion comme lecture » ;
 *     les lectures (main, IA, OCR) sont gardées toutes seules (réglage, coché au départ). Personnes fictives.
 *   node tests/test-transcribe-compare.js */
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

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HTR = 'Aujourd’hui vingt-huit octobre mil huit cent treize\npardevant nous Begnin juge de paix\nde Strasbourg est comparu Gaspard Baitser';
const DEEP1 = 'Aujourd’hui Vingt hui octobre mil huit cent huit\npar devant nous M. Beguin juge de paix\nde Strasbourg est comparu Gaspard Bäiller';
const DEEP2 = 'Aujourd’hui vingt-huit octobre mil huit cent treize\npar devant nous Beguin juge de paix\nde Strasbourg est comparu Gaspard Baillet';

(async () => {
    /* ── 1. le calcul ── */
    await t('mot par mot : les passages qui diffèrent, avec ce que dit chaque lecture ; le reste est commun', () => {
        const P = C.merge([HTR, DEEP1, DEEP2], {base: 0, loose: true}), d = P.filter(p => !p.same);
        assert.deepStrictEqual(d.map(p => p.opts), [['vingt-huit', 'Vingt hui', 'vingt-huit'], ['treize', 'huit', 'treize'], ['pardevant', 'par devant', 'par devant'], ['Begnin', 'M. Beguin', 'Beguin'], ['Baitser', 'Bäiller', 'Baillet']]);
        assert.strictEqual(C.textOf(P), HTR, 'sans choix : la référence telle quelle, lignes comprises');
    });
    await t('la majorité : ce que le plus de lectures disent (égalité : la référence)', () => {
        const P = C.majority(C.merge([HTR, DEEP1, DEEP2], {loose: true}), 0, true);
        assert.strictEqual(C.textOf(P), 'Aujourd’hui vingt-huit octobre mil huit cent treize\npar devant nous Begnin juge de paix\nde Strasbourg est comparu Gaspard Baitser');
    });
    await t('choisir une variante, ou écrire autrement', () => {
        const P = C.merge([HTR, DEEP1, DEEP2], {loose: true}), d = P.filter(p => !p.same);
        d[3].pick = 2; d[4].custom = 'Baillet (?)';
        assert.match(C.textOf(P), /nous Beguin juge/); assert.match(C.textOf(P), /Gaspard Baillet \(\?\)$/);
    });
    await t('un mot ajouté ou enlevé, un texte d’un seul bloc (sans lignes) contre un texte en lignes', () => {
        const P = C.merge(['le parrain a été Jean', 'le parrain a été maître Jean'], {loose: true}); assert.deepStrictEqual(P.filter(p => !p.same).map(p => p.opts), [['', 'maître']]);
        const Q = C.merge(['a b c\nd e f', 'a b c d e f'], {loose: true}); assert.strictEqual(C.textOf(Q), 'a b c\nd e f');
        const strict = C.merge(['Maître, Jean', 'maitre Jean'], {loose: false}); assert.strictEqual(strict.filter(p => !p.same).length, 1);
        assert.strictEqual(C.merge(['Maître, Jean', 'maitre Jean'], {loose: true}).filter(p => !p.same).length, 0, 'majuscules, accents, ponctuation ignorés');
    });
    await t('ligne par ligne : chaque ligne de la référence et ce que disent les autres ; les mots qui diffèrent', () => {
        const L = C.linesOf([HTR, DEEP1], {loose: true});
        assert.strictEqual(L.length, 3); assert.deepStrictEqual(L[0].variants, ['Aujourd’hui vingt-huit octobre mil huit cent treize', 'Aujourd’hui Vingt hui octobre mil huit cent huit']);
        assert.deepStrictEqual(C.diffWords('pardevant nous Begnin', 'par devant nous M. Beguin', true).filter(x => x.d).map(x => x.w), ['par', 'devant', 'M.', 'Beguin']);
    });
    await t('le nom des lectures', () => {
        assert.strictEqual(C.labelOf('deep', 'qwen3-vl:32b', 'Page 1'), '🔬 Lecture approfondie · qwen3-vl:32b · Page 1');
        assert.strictEqual(C.labelOf('htr', 'catmus-medieval.mlmodel'), '✍ Écriture à la main · catmus-medieval');
    });
    const src = fs.readFileSync(path.join(root, 'assets/js/heritage-transcribe.js'), 'utf8');
    await t('les lectures gardées toutes seules : écriture à la main, OCR, lecture approfondie (une page, toutes les pages)', () => {
        assert.match(src, /keepReading\(\(j\.lines \|\| \[\]\)\.map\(l => l\.text \|\| ''\)\.join\('\\n'\), 'htr'/);
        assert.match(src, /keepReading\(lines\.map\(l => l\.text\.replace\(\/\\s\+\$\/, ''\)\)\.join\('\\n'\), 'ocr'/);
        assert.match(src, /keepReading\(txt, 'deep', R\.model[,)]/); assert.match(src, /onReading: \(txt, model(?:, info)?\) => keepReading\(txt, 'deep', model[,)]/); // + ce que la lecture retient (🕘 la bande « Versions »)
        assert.match(fs.readFileSync(path.join(root, 'assets/js/heritage-transcribe-acte.js'), 'utf8'), /o\.onReading\?\.\(j\.text, pick\(\)[,)]/);
    });

    /* ── 2 et 3. serveur et Atelier ── */
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-txc-'));
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
$pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(1,'Mariage de Gaspard','mariage',1,?,?,'2026-01-01')")->execute([getenv('TX_BODY'), '{"zones":[],"people":[]}']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env: {...env, TX_BODY: HTR}});
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txCompare && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (a, q = {}) => p.evaluate(async ([x, y]) => window.LCNDA_APP.api(x, y), [a, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        await t('serveur : une lecture gardée avec sa source, jamais effacée par les versions automatiques', async () => {
            const r1 = await post('save_act_transcription_version', {act_id: 1, label: '🔬 Lecture approfondie · qwen3-vl:32b', body: DEEP1, auto: 1, source: 'deep:qwen3-vl:32b'}); assert.ok(r1.id, JSON.stringify(r1));
            await post('save_act_transcription_version', {act_id: 1, label: '🔬 Lecture approfondie · qwen3-vl:4b', body: DEEP2, auto: 0, source: 'deep:qwen3-vl:4b'});
            for (let i = 0; i < 65; i++) await post('save_act_transcription_version', {act_id: 1, label: 'auto ' + i, body: 'x' + i, auto: 1});
            const v = (await api('act_transcription_versions', {act_id: 1})).items, deep = v.filter(x => /^deep:/.test(x.source));
            assert.strictEqual(deep.length, 2, 'les deux lectures restent'); assert.ok(deep.every(x => x.auto === 0)); assert.ok(v.filter(x => x.auto).length <= 60, 'les automatiques sont limitées');
            const one = await api('act_transcription_version', {id: r1.id}); assert.strictEqual(one.source, 'deep:qwen3-vl:32b');
            const del = await post('delete_act_transcription_version', {id: r1.id}); await post('restore_act_transcription_version', {version: del.version});
            assert.ok((await api('act_transcription_versions', {act_id: 1})).items.some(x => x.source === 'deep:qwen3-vl:32b'), '↶ remise avec sa source');
        });
        const D = 'dialog.h-tx-dlg';
        await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({id: 1}));
        await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, {timeout: 15000}); await sleep(600);
        const body = () => p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value);
        await t('Fichier → ⚖️ Comparer les lectures… : le texte à l’écran et les lectures gardées, les passages qui diffèrent', async () => {
            await p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg button, dialog.h-tx-dlg summary')].find(b => /^\s*Fichier\b/.test(b.textContent))?.click());
            await p.waitForSelector('.ui-actmenu'); await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Comparer les lectures/.test(b.textContent)).click());
            await p.waitForSelector('.h-txc [data-txc-d]', {timeout: 15000});
            const st = await p.evaluate(() => ({on: [...document.querySelectorAll('.h-txc [data-txc-pick]:checked')].length, diffs: document.querySelectorAll('.h-txc [data-txc-d]').length, count: document.querySelector('.h-txc [data-txc-count]').textContent}));
            assert.strictEqual(st.on, 3, 'l’écran + 2 lectures'); assert.strictEqual(st.diffs, 5); assert.match(st.count, /5 passages/);
        });
        await t('🖼 l’image de l’acte à côté des lectures : zoom (molette, ＋ −, ajuster), glisser ; se cache (retenu)', async () => {
            await p.waitForFunction(() => document.querySelector('.h-txc [data-txc-pic]')?.naturalWidth > 0, null, {timeout: 10000});
            assert.ok(await p.evaluate(() => document.querySelector('.h-txc .h-txc-split').classList.contains('has-img')));
            const tf = () => p.evaluate(() => document.querySelector('.h-txc [data-txc-pic]').style.transform);
            const t0 = await tf(); await p.click('.h-txc [data-txc-z="1"]'); const t1 = await tf(); assert.notEqual(t0, t1, '＋ zoome');
            await p.click('.h-txc [data-txc-z="0"]'); assert.equal(await tf(), t0, '⤢ ajuste');
            const box = await p.$eval('.h-txc [data-txc-stage]', e => { const r = e.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; });
            await p.mouse.move(box.x, box.y); await p.mouse.wheel(0, -300); await sleep(100); assert.notEqual(await tf(), t0, 'molette');
            await p.click('.h-txc [data-txc-imgon]', {force: true}).catch(async () => { await p.evaluate(() => document.querySelector('.h-txc [data-txc-imgon]').click()); });
            assert.equal(await p.evaluate(() => document.querySelector('.h-txc [data-txc-img]').hidden), true);
            assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-tx-comparer-image')), '0');
            await p.evaluate(() => document.querySelector('.h-txc [data-txc-imgon]').click()); assert.equal(await p.evaluate(() => document.querySelector('.h-txc [data-txc-img]').hidden), false);
        });
        await t('choisir une variante d’un clic ; la majorité ; ligne par ligne', async () => {
            await p.evaluate(() => document.querySelectorAll('.h-txc [data-txc-d]')[4].click()); await p.waitForSelector('.ui-actmenu');
            await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Baillet/.test(b.textContent)).click()); await sleep(150);
            assert.strictEqual(await p.$eval('.h-txc [data-txc-d="9"], .h-txc [data-txc-d]:last-of-type', e => e.textContent), 'Baillet');
            await p.click('.h-txc [data-txc-maj]'); await sleep(150);
            assert.match(await p.$eval('.h-txc .h-txc-text', e => e.textContent), /par devant nous/);
            await p.click('.h-txc [data-txc-mode="line"]'); await p.waitForSelector('.h-txc .h-txc-lines');
            assert.strictEqual(await p.$$eval('.h-txc .h-txc-lines tr.is-diff', l => l.length), 3);
            // ligne par ligne : on choisit chaque ligne (ici : la 2e et la 3e selon la lecture qui a « par devant » et « Baillet »)
            await p.evaluate(() => { const pickLine = (i, rx) => { const lab = [...document.querySelectorAll(`.h-txc [data-txc-line^="${i}|"]`)].find(x => rx.test(x.closest('label').textContent)); lab.click(); }; pickLine(1, /par devant nous Beguin/); pickLine(2, /Baillet/); }); await sleep(100);
        });
        await t('« Mettre dans le texte » : le texte fusionné dans l’acte, l’ancien dans 🕘 Versions, ↶ Annuler', async () => {
            await p.click('.h-txc [data-txc-apply]'); await sleep(500);
            const b = await body(); assert.match(b, /par devant nous/); assert.match(b, /Gaspard Baillet/);
            await sleep(300);
            const v = (await api('act_transcription_versions', {act_id: 1})).items; assert.ok(v.some(x => /Fusion des lectures/.test(x.label)), 'le texte d’avant gardé');
            await p.evaluate(() => [...[...document.querySelectorAll('.ui-toast')].filter(x => /Lectures fusionnées/.test(x.textContent)).at(-1).querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)).click()); await sleep(200);
            assert.strictEqual((await body()).trim(), HTR);
        });
        await t('« Garder la fusion comme lecture » ; le réglage « garder chaque lecture » (coché au départ)', async () => {
            await p.evaluate(() => [...document.querySelectorAll('dialog.h-tx-dlg button, dialog.h-tx-dlg summary')].find(b => /^\s*Fichier\b/.test(b.textContent))?.click());
            await p.waitForSelector('.ui-actmenu'); await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Comparer les lectures/.test(b.textContent)).click());
            await p.waitForSelector('.h-txc [data-txc-save]');
            assert.ok(await p.$eval('.h-txc [data-txc-keepon]', e => e.checked));
            await p.click('.h-txc [data-txc-maj]'); await p.click('.h-txc [data-txc-save]'); await sleep(500);
            assert.ok((await api('act_transcription_versions', {act_id: 1})).items.some(x => x.source === 'merge'));
            await p.click('.h-txc [data-txc-keepon]'); assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-tx-garder-lectures')), '0');
            await p.click('.h-txc [data-txc-keepon]');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Comparer les lectures marche.');
    process.exit(fails ? 1 : 0);
})();
