#!/usr/bin/env node
/* 🖥 Le serveur d'IA au choix (lib/ia_serveur.php, assets/js/ia-serveur.js) : Ollama (par défaut, inchangé), Unsloth, ou un autre
 * serveur compatible OpenAI. Un FAUX Unsloth (/v1/models, /v1/chat/completions, avec ou sans clé) et un FAUX Ollama, dans ce
 * programme : rien ne part sur Internet.
 *  1. sans réglage : Ollama, comme avant ; 2. ↻ Tester : la liste des modèles (nom Unsloth reconnu dans la liste conseillée) ;
 *  3. serveur éteint : « personne ne répond » ; 4. adresse hors de cet ordinateur : refusée (rien d'enregistré) ;
 *  5. 🔎 Chercher : les ports habituels ; 6. clé demandée, puis gardée (jamais renvoyée au navigateur) ;
 *  7. 🔍 lecture approfondie avec image → /v1/chat/completions en flux, image en data: URL ; 8. appel d'outils (assistant) traduit ;
 *  9. ⤓ télécharger refusé avec une phrase claire ; 10. retour à Ollama : son chemin d'origine ; 11. Réglages → 🤖 IA, ⓘ, 390 px.
 *   node tests/test-ia-unsloth.js */
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
const KEY = 'sk-unsloth-essai123';

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ias-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    // le faux Unsloth : compatible OpenAI, clé demandée quand needKey
    const uns = {needKey: false, chats: [], auth: [], models: 0};
    const fakeU = http.createServer((req, res) => { let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        uns.auth.push(req.headers.authorization || '');
        if (uns.needKey && req.headers.authorization !== 'Bearer ' + KEY) { res.statusCode = 401; return void res.end(JSON.stringify({detail: 'Not authenticated'})); }
        if (req.method === 'GET' && req.url === '/v1/models') { uns.models++; return void res.end(JSON.stringify({object: 'list', data: [{id: 'unsloth/Qwen3-VL-8B-Instruct-GGUF', object: 'model'}, {id: 'texte-seul-7b', object: 'model'}]})); }
        if (req.method === 'POST' && req.url === '/v1/chat/completions') {
            const j = JSON.parse(body || '{}'); uns.chats.push(j);
            if (j.tools) { // l'assistant : un appel d'outil, puis une réponse
                const hasTool = j.messages.some(m => m.role === 'tool');
                const msg = hasTool ? {role: 'assistant', content: 'Réponse finale.'} : {role: 'assistant', content: null, tool_calls: [{id: 'call_abc', type: 'function', function: {name: 'chercher_personnes', arguments: '{"nom":"MAZAUD"}'}}]};
                return void res.end(JSON.stringify({id: 'x', object: 'chat.completion', model: j.model, choices: [{index: 0, message: msg, finish_reason: hasTool ? 'stop' : 'tool_calls'}], usage: {prompt_tokens: 10, completion_tokens: 3}}));
            }
            if (!j.stream) return void res.end(JSON.stringify({choices: [{index: 0, message: {role: 'assistant', content: 'Bonjour.'}, finish_reason: 'stop'}]}));
            res.setHeader('Content-Type', 'text/event-stream');
            const send = o => res.write('data: ' + JSON.stringify(o) + '\n\n');
            send({choices: [{index: 0, delta: {role: 'assistant', content: ''}}]});
            send({choices: [{index: 0, delta: {content: 'Le 3 mars 1850\n'}}]});
            send({choices: [{index: 0, delta: {content: 'Jean MAZAUD [?]'}}]});
            send({choices: [{index: 0, delta: {}, finish_reason: 'stop'}]});
            send({choices: [], usage: {prompt_tokens: 812, completion_tokens: 9}});
            res.write('data: [DONE]\n\n'); return void res.end();
        }
        res.statusCode = 404; res.end('{"error":{"message":"not found"}}'); }); });
    const uport = await freePort(); await new Promise(r => fakeU.listen(uport, '127.0.0.1', r));
    // le faux Ollama (le chemin d'origine)
    const oll = {hits: [], chats: []};
    const fakeO = http.createServer((req, res) => { let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
        res.setHeader('Content-Type', 'application/json'); oll.hits.push(req.url);
        if (req.url === '/api/version') return void res.end('{"version":"0.12.0"}');
        if (req.url === '/api/tags') return void res.end(JSON.stringify({models: [{name: 'qwen3-vl:8b-instruct'}]}));
        if (req.url === '/api/show') return void res.end(JSON.stringify({capabilities: ['completion', 'vision']}));
        if (req.url === '/api/chat') { const j = JSON.parse(body || '{}'); oll.chats.push(j); res.setHeader('Content-Type', 'application/x-ndjson');
            res.write(JSON.stringify({message: {role: 'assistant', content: 'Lu par Ollama\n'}, done: false}) + '\n'); return void res.end(JSON.stringify({message: {content: ''}, done: true}) + '\n'); }
        res.statusCode = 404; res.end('{}'); }); });
    const oport = await freePort(); await new Promise(r => fakeO.listen(oport, '127.0.0.1', r));
    const dead = await freePort();
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4',
        LCNDA_OLLAMA_URL: `http://127.0.0.1:${oport}`, LCNDA_RAM_GB: '16', LCNDA_IA_PROBE_PORTS: `ollama:${oport},unsloth:${uport},openai:${dead}`};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null; $p1 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p1->exec("INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES('Jean','MAZAUD','male','deceased',1)"); $p1 = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    // du PHP lancé sans bloquer (les faux serveurs sont dans ce même programme)
    const phpAsync = code => new Promise((res, rej) => { const c = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, env}); let out = '', err = '';
        c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { err += d; }); c.on('close', () => { try { res(JSON.parse(out)); } catch (e) { rej(new Error((out + err).slice(0, 400))); } }); });
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const settingsFile = path.join(tmp, 'genealogie-ia-serveur.json');
    try {
        const p = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openDialog, null, {timeout: 30000});
        assert.ok(await p.evaluate(() => !!window.LCNDA_EXT?.iaServeur && !!window.LCNDA_EXT?.assistantIA), 'index.php charge assets/js/ia-serveur.js');
        const api = (a, q) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y || {}).catch(e => ({error: e.message})), [a, q]);
        const post = (a, b) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}).then(r => r.result ?? r).catch(e => ({error: e.message})), [a, b]);
        const png = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==';
        const readJob = () => p.evaluate(async b => { const A = window.LCNDA_APP; const s = await A.api('tx_deep_read', {}, {method: 'POST', body: {model: 'qwen3-vl:8b-instruct', language: 'fra', image_b64: b}});
            const id = (s.result || s).id; let j = null; for (let i = 0; i < 80; i++) { j = await A.api('tx_deep_job', {id}); if (j.state !== 'running') break; await new Promise(x => setTimeout(x, 150)); } return j; }, png);

        await t('sans réglage : Ollama, à l’adresse d’avant (LCNDA_OLLAMA_URL), le chemin d’origine', async () => {
            const g = await api('ia_srv_get');
            assert.equal(g.kind, 'ollama'); assert.equal(g.saved, false); assert.equal(g.url, `http://127.0.0.1:${oport}`);
            assert.deepEqual(Object.keys(g.kinds), ['ollama', 'unsloth', 'openai']);
            assert.equal(g.kinds.ollama.url, 'http://127.0.0.1:11434'); assert.equal(g.kinds.unsloth.url, 'http://127.0.0.1:8888'); assert.equal(g.kinds.openai.url, 'http://127.0.0.1:1234');
            const st = await api('tx_deep_status'); assert.equal(st.running, true); assert.ok(oll.hits.includes('/api/version'));
            assert.equal(uns.models, 0, 'Unsloth pas appelé');
        });
        await t('↻ Tester la connexion (Unsloth) : la liste des modèles de /v1/models ; un nom Unsloth reconnu dans la liste conseillée ; lit les images (deviné)', async () => {
            const r = await post('ia_srv_test', {kind: 'unsloth', url: `http://127.0.0.1:${uport}`});
            assert.equal(r.ok, true, JSON.stringify(r));
            assert.deepEqual(r.models.map(m => [m.id, m.name, m.vision]), [['unsloth/Qwen3-VL-8B-Instruct-GGUF', 'qwen3-vl:8b-instruct', true], ['texte-seul-7b', 'texte-seul-7b', false]]);
            assert.ok(!fs.existsSync(settingsFile), 'un test n’enregistre rien');
        });
        await t('serveur éteint : « unreachable » (le navigateur dit « personne ne répond ») ; Ollama testé par /api/tags', async () => {
            const r = await post('ia_srv_test', {kind: 'openai', url: `http://127.0.0.1:${dead}`});
            assert.equal(r.ok, false); assert.equal(r.error, 'unreachable');
            const o = await post('ia_srv_test', {kind: 'ollama', url: `http://127.0.0.1:${oport}`});
            assert.equal(o.ok, true); assert.deepEqual(o.models.map(m => m.id), ['qwen3-vl:8b-instruct']);
        });
        await t('adresse hors de cet ordinateur (Internet, réseau local, ruse) : refusée, rien d’enregistré, aucune demande partie', async () => {
            for (const url of ['http://example.com:8888', 'http://192.168.1.5:8888', 'http://10.0.0.2:1234', 'http://127.0.0.1.evil.com:8888', 'https://127.0.0.1:8888', 'http://user:pw@127.0.0.1:8888', 'http://127.0.0.1:8888/v1', 'file:///etc/passwd', 'http://evil.com#@127.0.0.1:8888']) {
                const s = await post('ia_srv_save', {kind: 'unsloth', url}); assert.match(String(s.error || ''), /cet ordinateur|refusée/, url + ' ' + JSON.stringify(s));
                const r = await post('ia_srv_test', {kind: 'unsloth', url}); assert.match(String(r.error || ''), /cet ordinateur|refusée/, url);
            }
            assert.ok(!fs.existsSync(settingsFile));
            assert.equal((await post('ia_srv_save', {kind: 'pas-un-serveur', url: ''})).error !== undefined, true);
        });
        await t('🔎 Chercher sur cet ordinateur : les serveurs qui répondent (Ollama, Unsloth), pas le port éteint', async () => {
            const r = await post('ia_srv_detect', {});
            assert.deepEqual(r.found.map(f => [f.kind, f.url, f.ok, f.models]), [['ollama', `http://127.0.0.1:${oport}`, true, 1], ['unsloth', `http://127.0.0.1:${uport}`, true, 2]]);
            assert.equal(r.tried.length, 3);
        });
        await t('Unsloth qui demande une clé : dit clairement, trouvé quand même ; la clé enregistrée n’est jamais renvoyée au navigateur', async () => {
            uns.needKey = true;
            const r = await post('ia_srv_test', {kind: 'unsloth', url: `http://127.0.0.1:${uport}`});
            assert.equal(r.ok, false); assert.equal(r.needs_key, true); assert.match(r.error, /clé d’API/);
            const d = await post('ia_srv_detect', {}); assert.deepEqual(d.found.filter(f => f.kind === 'unsloth').map(f => [f.ok, f.needs_key]), [[false, true]]);
            assert.match(String((await post('ia_srv_save', {kind: 'unsloth', url: `http://127.0.0.1:${uport}`, key: 'pas une clé !'})).error || ''), /illisible/);
            const s = await post('ia_srv_save', {kind: 'unsloth', url: `http://127.0.0.1:${uport}/`, key: KEY});
            assert.equal(s.kind, 'unsloth'); assert.equal(s.url, `http://127.0.0.1:${uport}`); assert.equal(s.has_key, true);
            const g = await api('ia_srv_get'); assert.equal(g.has_key, true); assert.ok(!JSON.stringify(g).includes(KEY) && !JSON.stringify(s).includes(KEY), 'la clé ne revient pas');
            const ok = await post('ia_srv_test', {kind: 'unsloth', url: `http://127.0.0.1:${uport}`}); assert.equal(ok.ok, true, 'la clé gardée sert au test');
            // enregistrer sans retaper la clé la garde
            await post('ia_srv_save', {kind: 'unsloth', url: `http://127.0.0.1:${uport}`, key: '', keep_key: 1});
            assert.equal(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).key, KEY);
        });
        await t('Unsloth choisi : l’état de la lecture approfondie et de l’assistant viennent de /v1/models (modèle conseillé reconnu, déjà là)', async () => {
            const st = await api('tx_deep_status');
            assert.equal(st.running, true); assert.match(st.version, /Unsloth/);
            assert.equal(st.models.find(m => m.tag === 'qwen3-vl:8b-instruct').present, true);
            assert.deepEqual(st.others.map(o => [o.tag, o.vision]), [['texte-seul-7b', false]]);
            const a = await api('aia_status'); assert.equal(a.ready, true); assert.equal(a.server.kind, 'unsloth'); assert.equal(a.server.has_key, true); assert.equal(a.model.tag, 'qwen3-vl:8b-instruct');
            assert.ok(!JSON.stringify(a).includes(KEY));
        });
        await t('🔍 lecture approfondie avec une image : /v1/chat/completions en flux, image en data: URL, le vrai nom du modèle, la clé ; texte rendu', async () => {
            const n0 = uns.chats.length, hitsO = oll.chats.length;
            const r = await readJob();
            assert.equal(r.state, 'done', JSON.stringify(r)); assert.equal(r.text, 'Le 3 mars 1850\nJean MAZAUD [?]');
            const c = uns.chats.slice(n0).find(x => x.stream);
            assert.ok(c, 'demande partie vers Unsloth'); assert.equal(c.model, 'unsloth/Qwen3-VL-8B-Instruct-GGUF'); assert.equal(c.temperature, 0); assert.equal(c.max_tokens, 4096);
            const parts = c.messages[0].content; assert.ok(Array.isArray(parts));
            assert.equal(parts[0].type, 'text'); assert.match(parts[0].text, /paléographe/);
            assert.equal(parts[1].type, 'image_url'); assert.equal(parts[1].image_url.url, 'data:image/png;base64,' + png);
            assert.ok(!('think' in c) && !('keep_alive' in c) && !('images' in c.messages[0]), 'rien de propre à Ollama');
            assert.equal(uns.auth[uns.auth.length - 1], 'Bearer ' + KEY);
            assert.equal(oll.chats.length, hitsO, 'Ollama pas appelé');
            const e = await p.evaluate(async b => { try { await window.LCNDA_APP.api('tx_deep_read', {}, {method: 'POST', body: {model: 'texte-seul-7b', language: 'fra', image_b64: b}}); return ''; } catch (x) { return x.message; } }, png);
            assert.match(e, /ne sait pas lire une image/);
        });
        await t('🤖 assistant : appel d’outils traduit (identifiant, arguments en texte, réponse d’outil reliée), réponse rendue « à la Ollama »', async () => {
            const out = await phpAsync(String.raw`require 'lib/bootstrap.php'; require_once 'lib/transcription_actes.php';
                $tools = [['type' => 'function', 'function' => ['name' => 'chercher_personnes', 'description' => 'x', 'parameters' => ['type' => 'object', 'properties' => new stdClass()]]]];
                $m = [['role' => 'system', 'content' => 'Sois bref.'], ['role' => 'user', 'content' => 'Les MAZAUD ?']];
                $r1 = tx_deep_http('POST', '/api/chat', ['model' => 'qwen3-vl:8b-instruct', 'stream' => false, 'think' => false, 'messages' => $m, 'tools' => $tools, 'options' => ['temperature' => 0.2, 'num_predict' => 2048]], 30);
                $msg = $r1['json']['message'];
                $m[] = ['role' => 'assistant', 'content' => '', 'tool_calls' => $msg['tool_calls']]; $m[] = ['role' => 'tool', 'content' => '{"personnes":[]}', 'tool_name' => 'chercher_personnes'];
                $r2 = tx_deep_http('POST', '/api/chat', ['model' => 'qwen3-vl:8b-instruct', 'stream' => false, 'messages' => $m, 'tools' => $tools], 30);
                $r3 = tx_deep_http('POST', '/api/pull', ['model' => 'qwen3-vl:8b-instruct', 'stream' => true], 30, function ($j) { return true; });
                echo json_encode(['r1' => $r1, 'r2' => $r2, 'r3' => $r3], JSON_UNESCAPED_UNICODE);`);
            assert.equal(out.r1.ok, true); assert.equal(out.r1.json.message.tool_calls[0].function.name, 'chercher_personnes');
            assert.equal(out.r1.json.prompt_eval_count, 10);
            assert.equal(out.r2.json.message.content, 'Réponse finale.');
            const last = uns.chats[uns.chats.length - 1];
            const a = last.messages.find(x => x.role === 'assistant'), tm = last.messages.find(x => x.role === 'tool');
            assert.equal(a.tool_calls[0].id, 'call_abc'); assert.equal(typeof a.tool_calls[0].function.arguments, 'string');
            assert.equal(tm.tool_call_id, 'call_abc'); assert.ok(!('tool_name' in tm));
            assert.equal(out.r3.ok, false); assert.match(out.r3.json.error, /se télécharge dans sa propre application/);
        });
        await t('serveur choisi éteint : l’assistant le dit avec son nom et son adresse', async () => {
            fs.writeFileSync(settingsFile, JSON.stringify({kind: 'openai', url: `http://127.0.0.1:${dead}`}));
            const a = await api('aia_status'); assert.equal(a.ready, false); assert.match(a.message, new RegExp(`ne répond pas à l’adresse http://127.0.0.1:${dead}`));
            const r = await readJob().catch(e => ({error: e.message})); assert.ok(r.error || r.state === 'error', 'pas de lecture');
        });
        await t('↶ retour à Ollama : le chemin d’origine reprend (/api/chat avec « images »)', async () => {
            const s = await post('ia_srv_save', {kind: 'ollama', url: `http://127.0.0.1:${oport}`}); assert.equal(s.kind, 'ollama'); assert.equal(s.has_key, false);
            const n0 = oll.chats.length, u0 = uns.chats.length;
            const r = await readJob();
            assert.equal(r.state, 'done', JSON.stringify(r)); assert.match(r.text, /Lu par Ollama/);
            const c = oll.chats[n0]; assert.equal(c.model, 'qwen3-vl:8b-instruct'); assert.equal(c.messages[0].images[0], png); assert.equal(c.think, false);
            assert.equal(uns.chats.length, u0);
            assert.ok(!('key' in JSON.parse(fs.readFileSync(settingsFile, 'utf8'))), 'pas de clé pour Ollama');
            await post('ia_srv_reset', {}); assert.equal((await api('ia_srv_get')).saved, false);
        });
        await t('Réglages → 🤖 IA : les trois choix, l’adresse par défaut de chacun, ↻ Tester, 🔎 Chercher, ⓘ « Ollama ou Unsloth ? » avec ses sources', async () => {
            await p.evaluate(() => window.LCNDA_EXT.assistantIA ? window.LCNDA_EXT.assistantIA.openSettings() : null);
            await p.waitForSelector('[data-ias-host] input[name="ias_kind"]', {timeout: 15000}); // dans la page des réglages, au-dessus de « Sur cet ordinateur »
            const sel = '[data-ias-host]';
            await p.waitForSelector(sel + ' input[name="ias_kind"]');
            const labels = await p.$$eval(sel + ' .ias-kinds label', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()));
            assert.match(labels[0], /Ollama \(conseillé\)/); assert.match(labels[1], /Unsloth/); assert.match(labels[2], /Autre serveur compatible OpenAI \(LM Studio, llama\.cpp, Jan…\)/);
            assert.equal(await p.$eval(sel + ' input[name="ias_kind"]:checked', i => i.value), 'ollama');
            assert.equal(await p.$eval(sel + ' [data-ias-keyrow]', x => x.hidden), true);
            await p.click(sel + ' input[name="ias_kind"][value="unsloth"]');
            assert.equal(await p.$eval(sel + ' [data-ias-keyrow]', x => x.hidden), false);
            await p.fill(sel + ' input[name="ias_url"]', `http://127.0.0.1:${uport}`); await p.fill(sel + ' input[name="ias_key"]', KEY);
            await p.click(sel + ' [data-ias-test]'); await p.waitForSelector(sel + ' [data-ias-result]');
            assert.match(await p.$eval(sel + ' [data-ias-out]', x => x.textContent), /Unsloth répond.*2 modèle\(s\)/s);
            await p.click(sel + ' input[name="ias_kind"][value="openai"]');
            assert.equal(await p.$eval(sel + ' input[name="ias_url"]', i => i.value), `http://127.0.0.1:${uport}`, 'une adresse tapée n’est pas écrasée');
            await p.fill(sel + ' input[name="ias_url"]', 'http://127.0.0.1:8888'); await p.click(sel + ' input[name="ias_kind"][value="ollama"]');
            assert.equal(await p.$eval(sel + ' input[name="ias_url"]', i => i.value), 'http://127.0.0.1:11434', 'l’adresse par défaut suit le choix');
            await p.click(sel + ' [data-ias-detect]'); await p.waitForSelector(sel + ' [data-ias-found]');
            assert.equal(await p.$eval(sel + ' [data-ias-found]', x => x.dataset.iasFound), '2');
            await p.click(sel + ' [data-ias-why]');
            await p.waitForSelector('dialog[open] .ias-explain');
            const d = await p.$eval('dialog[open] .ias-explain', x => ({text: x.textContent, links: [...x.querySelectorAll('a')].map(a => a.href)}));
            assert.match(d.text, /Ollama/); assert.match(d.text, /ENTRAÎNER/); assert.match(d.text, /NVIDIA ou AMD/); assert.match(d.text, /100 % local/);
            assert.deepEqual(d.links, ['https://github.com/unslothai/unsloth', 'https://github.com/ollama/ollama']);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(x => x.close()));
            await p.setViewportSize({width: 390, height: 800}); await sleep(200);
            const over = await p.evaluate(s => { const h = document.querySelector(s); return h.scrollWidth - h.clientWidth; }, sel);
            assert.ok(over <= 1, 'pas de débordement à 390 px : ' + over);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fakeU.close(); fakeO.close(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Le serveur d’IA au choix (Ollama, Unsloth, compatible OpenAI) marche.');
    process.exit(fails ? 1 : 0);
})();
