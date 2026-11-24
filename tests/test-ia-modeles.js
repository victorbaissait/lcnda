#!/usr/bin/env node
/* 🔬 Lecture approfondie : les modèles d'IA au choix. Chacun avec ses avantages et inconvénients, « 🧪 à l'essai » s'il n'a pas été
 * essayé, le modèle conseillé pour la mémoire de CET ordinateur, et « Avancé : autre modèle (Ollama) » (les modèles déjà installés,
 * seulement ceux qui lisent une image). Faux Ollama : rien ne part sur Internet.
 *   node tests/test-ia-modeles.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ia-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    // le faux Ollama : 3 modèles installés (le conseillé, un autre qui lit les images, un qui ne lit que du texte)
    const chats = [];
    const fake = http.createServer((req, res) => { let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/version') return void res.end('{"version":"0.12.0"}');
        if (req.url === '/api/tags') return void res.end(JSON.stringify({models: [{name: 'qwen3-vl:8b-instruct'}, {name: 'ma-vision:latest'}, {name: 'texte-seul:7b'}]}));
        if (req.url === '/api/show') { const m = JSON.parse(body || '{}').model; return void res.end(JSON.stringify({capabilities: m === 'ma-vision:latest' ? ['completion', 'vision'] : ['completion']})); }
        if (req.url === '/api/chat') { const j = JSON.parse(body || '{}'); chats.push(j.model); res.setHeader('Content-Type', 'application/x-ndjson');
            res.write(JSON.stringify({message: {role: 'assistant', content: 'Lu par ' + j.model + '\n'}, done: false}) + '\n'); return void res.end(JSON.stringify({message: {content: ''}, done: true}) + '\n'); }
        res.statusCode = 404; res.end('{}'); }); });
    const oport = await freePort(); await new Promise(r => fake.listen(oport, '127.0.0.1', r));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', LCNDA_OLLAMA_URL: `http://127.0.0.1:${oport}`, LCNDA_RAM_GB: '8'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null; $p1 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p1->exec("INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES('Jean','MAZAUD','male','deceased',1)"); $p1 = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    // PHP lancé sans bloquer : le faux Ollama (dans ce même programme) doit pouvoir répondre pendant ce temps
    const statusWith = ram => new Promise((res, rej) => { const c = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/bootstrap.php'; require_once 'lib/transcription_actes.php'; echo json_encode(tx_deep_status());`], {cwd: root, env: {...env, LCNDA_RAM_GB: String(ram)}});
        let out = ''; c.stdout.on('data', d => { out += d; }); c.on('close', () => { try { res(JSON.parse(out)); } catch (e) { rej(new Error(out.slice(0, 300))); } }); });
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        await t('le catalogue : chaque modèle avec ses avantages, ses inconvénients, sa licence, la mémoire conseillée ; « à l’essai » s’il n’a pas été essayé', async () => {
            const st = await statusWith(8);
            assert.ok(st.models.length >= 8);
            st.models.forEach(m => { assert.ok(m.pros && m.cons && m.license && m.ram_gb > 0 && m.size_gb > 0, JSON.stringify(m)); });
            assert.deepEqual(st.models.filter(m => m.tried).map(m => m.tag), ['qwen3-vl:8b-instruct', 'qwen3-vl:4b-instruct']);
            assert.ok(st.models.some(m => m.ram_gb >= 64), 'un modèle pour les ordinateurs à 64 Go');
        });
        await t('le modèle conseillé suit la mémoire de l’ordinateur (8 Go → 4B ; 16 et 64 Go → 8B) ; trop gros = signalé', async () => {
            const a = await statusWith(8), b = await statusWith(16), c = await statusWith(64);
            assert.equal(a.ram_gb, 8); assert.equal(a.models.find(m => m.recommended).tag, 'qwen3-vl:4b-instruct'); assert.equal(a.models.find(m => m.tag === 'qwen3-vl:8b-instruct').fits, false);
            assert.equal(b.models.find(m => m.recommended).tag, 'qwen3-vl:8b-instruct'); assert.equal(c.models.find(m => m.recommended).tag, 'qwen3-vl:8b-instruct');
            assert.equal(a.models.filter(m => m.recommended).length, 1);
        });
        await t('« Avancé » : les modèles installés hors de la liste, et s’ils lisent une image', async () => {
            const st = await statusWith(8);
            assert.deepEqual(st.others.map(m => [m.tag, m.vision]), [['ma-vision:latest', true], ['texte-seul:7b', false]]);
        });
        const p = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.txActe?.openDeep && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        await t('la fenêtre : le conseillé pour cet ordinateur (8 Go), avantages et inconvénients, « 🧪 Autres modèles à essayer », « Avancé »', async () => {
            await p.evaluate(() => window.LCNDA_EXT.txActe.openDeep({setupOnly: true}));
            await p.waitForSelector('.h-txa-models .h-txa-model', {timeout: 15000});
            const r = await p.evaluate(() => { const box = document.querySelector('.h-txa-models'); const main = [...box.children].filter(x => x.matches('label'));
                return {main: main.map(l => l.textContent.replace(/\s+/g, ' ').trim()), test: box.querySelectorAll('details')[0]?.querySelectorAll('label').length || 0, sum: [...box.querySelectorAll('details > summary')].map(s => s.textContent.trim()),
                    adv: [...(box.querySelectorAll('details')[1]?.querySelectorAll('input') || [])].map(i => [i.value, i.disabled]), mem: document.querySelector('.h-txa-grid')?.textContent || ''}; });
            assert.ok(r.main.some(x => /Qwen3-VL 4B/.test(x) && /conseillé pour cet ordinateur \(8 Go\)/.test(x)), JSON.stringify(r.main));
            assert.ok(r.main.some(x => /Qwen3-VL 8B/.test(x) && /👍/.test(x) && /👎/.test(x) && /trop gros pour cet ordinateur/.test(x)), 'avantages, inconvénients, trop gros');
            assert.match(r.sum[0], /🧪 Autres modèles à essayer \(\d+\)/); assert.ok(r.test >= 6);
            assert.match(r.sum[1], /Avancé : autre modèle \(Ollama\)/);
            assert.deepEqual(r.adv, [['ma-vision:latest', false], ['texte-seul:7b', true]], 'un modèle qui ne lit pas les images ne se choisit pas');
            assert.match(r.mem, /cet ordinateur : 8 Go/);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });
        const png = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==';
        await t('lire avec un modèle installé « autre » qui lit les images : la demande part vers lui', async () => {
            const r = await p.evaluate(async b => { const A = window.LCNDA_APP; const s = await A.api('tx_deep_read', {}, {method: 'POST', body: {model: 'ma-vision:latest', language: 'fra', image_b64: b}});
                const id = (s.result || s).id; let j = null; for (let i = 0; i < 60; i++) { j = await A.api('tx_deep_job', {id}); if (j.state !== 'running') break; await new Promise(x => setTimeout(x, 150)); } return j; }, png);
            assert.equal(r.state, 'done', JSON.stringify(r)); assert.match(r.text, /Lu par ma-vision:latest/); assert.ok(chats.includes('ma-vision:latest'));
        });
        await t('un modèle qui ne lit pas les images, ou inconnu : refusé avec une phrase claire ; jamais téléchargé hors de la liste', async () => {
            const e1 = await p.evaluate(async b => { try { await window.LCNDA_APP.api('tx_deep_read', {}, {method: 'POST', body: {model: 'texte-seul:7b', language: 'fra', image_b64: b}}); return ''; } catch (e) { return e.message; } }, png);
            assert.match(e1, /ne sait pas lire une image/);
            const e2 = await p.evaluate(async () => { try { await window.LCNDA_APP.api('tx_deep_pull', {}, {method: 'POST', body: {model: 'ma-vision:latest'}}); return ''; } catch (e) { return e.message; } });
            assert.match(e2, /inconnu/);
            const e3 = await p.evaluate(async b => { try { await window.LCNDA_APP.api('tx_deep_read', {}, {method: 'POST', body: {model: 'pas-la:1b', language: 'fra', image_b64: b}}); return ''; } catch (e) { return e.message; } }, png);
            assert.match(e3, /inconnu/);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fake.close(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les modèles d’IA au choix marchent.');
    process.exit(fails ? 1 : 0);
})();
