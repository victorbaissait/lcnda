#!/usr/bin/env node
'use strict';
/* ✂️ Téléchargement coupé — les modules « heritage-*.js » plus anciens ne crient plus « TypeError: Failed to fetch ».
 * Quand un fichier de données (assets/data/…json.gz) ou une demande au serveur (api.php) est coupé en route (page rechargée,
 * application arrêtée, réseau perdu), la partie qui l'attendait reste vide ou montre son état calme (« pas disponible »),
 * sans rien dans la console et sans le texte brut « Failed to fetch » à l'écran.
 *  1. Tous les fichiers de données coupés net : fiche d'une personne, fiche d'un village, carte, chronologie.
 *  2. Fichiers de données qui traînent puis sont coupés, page rechargée en plein téléchargement (fiche, village).
 *  3. Le serveur ne répond plus (api.php coupé) après l'ouverture : fiche et village.
 *  Une vraie erreur (fichier illisible) se voit toujours dans la console (contrôle : le filtre ne cache pas tout).
 *   node tests/test-fetch-coupe.js      (FETCHCOUPE_DEBUG=1 : montre chaque message attrapé)  */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 12).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CUT = /Failed to fetch|NetworkError when attempting|Load failed|AbortError|The user aborted|signal is aborted/i;

(async () => {
    if (!chromium) { console.log('— Playwright absent : essai sauté'); process.exit(0); }
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-fetch-coupe-'));
    const net0 = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-fetch-coupe-net-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4',
        GENEALOGY_TEST: '1', LCNDA_TEST_TD_DIR: net0, LCNDA_TEST_TELECHA_DIR: net0, GENEALOGY_TD_SIMULATE: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.267,1.770,'19272'),(2,'Verdun','Meuse','France',49.1598,5.3844,'55545')");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,'cultivateur'),(2,'Anne','LACOMBE','female','deceased',0,'couturière')");
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT',1890,1],[1,'DEAT',1916,2],[2,'BIRT',1895,1],[2,'DEAT',1970,1]] as [$p,$g,$y,$pl]) { $ins->execute([$p,$tag($g),(string)$y,$y,(string)$y,$pl]); }
$pdo->exec('INSERT INTO families(partner1_id, partner2_id) VALUES(1,2)');
echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/ok/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 150; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    // mode : 'cut' (fichiers de données coupés net), 'slow' (ils traînent puis sont coupés), 'api' (le serveur se tait après l'ouverture), 'bad' (fichier illisible)
    const open = async (mode) => {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); // pas d'Internet
        const flags = {api: false};
        await ctx.route(/\/assets\/data\//, async r => {
            if (process.env.FETCHCOUPE_DEBUG) console.log('  ✂ ' + mode + ' ' + r.request().url().replace(/^.*assets\/data\//, ''));
            if (mode === 'cut') return r.abort('failed').catch(() => {});
            if (mode === 'slow') { await sleep(900); return r.abort('failed').catch(() => {}); } // (pas de « continue » après coup : le serveur PHP resterait bloqué)
            if (mode === 'bad') return r.fulfill({status: 200, contentType: 'application/json', body: '{pas du json'}).catch(() => {});
            return r.continue().catch(() => {});
        });
        await ctx.route(/\/api\.php/, r => (flags.api ? r.abort('failed') : r.continue()).catch(() => {}));
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} });
        const p = await ctx.newPage();
        const msgs = [];
        p.on('pageerror', e => msgs.push('[pageerror] ' + (e.stack && e.stack.includes(e.message) ? e.stack : e.message)));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) msgs.push('[console] ' + m.text() + ' @ ' + (m.location()?.url || '')); });
        p.on('dialog', d => d.dismiss());
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, {timeout: 40000}); await p.waitForTimeout(600);
        return {p, ctx, msgs, flags};
    };
    const person = (p, id) => p.evaluate(i => { const A = window.LCNDA_APP; A.state.currentPersonId = i; return A.setModule('personnes'); }, id).catch(() => {});
    const village = (p, key) => p.evaluate(k => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = k; return A.setModule('listes'); }, key).catch(() => {});
    const mod = (p, m) => p.evaluate(x => window.LCNDA_APP.setModule(x), m).catch(() => {});
    const pageText = p => p.evaluate(() => document.body.innerText).catch(() => '');
    const judge = (msgs, texts) => {
        const bad = msgs.filter(m => CUT.test(m));
        if (process.env.FETCHCOUPE_DEBUG) console.log(msgs.join('\n---\n'));
        // chaque message est résumé par les modules de sa pile (heritage-…:ligne), pour savoir tout de suite lequel crie
        const who = bad.map(m => (m.split('\n')[0].slice(0, 120) + ' ← ' + ([...m.matchAll(/(heritage-[\w-]+\.js)\?v=\d+:(\d+)/g)].map(x => x[1] + ':' + x[2]).join(' < ') || '(pile sans module : ' + m.replace(/\s+/g, ' ').slice(0, 200) + ')')));
        assert.deepStrictEqual([...new Set(who)], [], 'coupure bruyante');
        texts.forEach(([where, s]) => assert.ok(!/Failed to fetch|NetworkError|Load failed/.test(s), `« Failed to fetch » affiché (${where}) : ${(s.match(/.{0,80}(Failed to fetch|NetworkError|Load failed).{0,40}/) || [''])[0]}`));
    };
    try {
        await t('fichiers de données coupés net : fiche, village, carte, chronologie — rien dans la console, rien de brut à l’écran', async () => {
            const {p, ctx, msgs} = await open('cut');
            const texts = [];
            await person(p, 1); await p.waitForTimeout(3500); texts.push(['fiche 1', await pageText(p)]);
            await person(p, 2); await p.waitForTimeout(2500); texts.push(['fiche 2', await pageText(p)]);
            await village(p, '19272'); await p.waitForTimeout(3500); texts.push(['village Tulle', await pageText(p)]);
            await village(p, '55545'); await p.waitForTimeout(2500); texts.push(['village Verdun', await pageText(p)]);
            for (const m of ['carte', 'chronologie', 'dashboard']) { await mod(p, m); await p.waitForTimeout(2000); texts.push([m, await pageText(p)]); }
            judge(msgs, texts);
            await ctx.close();
        });
        await t('fichiers coupés : onglets « Autrefois » (prix d’Europe, la loi en l’an…, boussole), pays en chiffres, châteaux, fonds de diagramme — « réessaie », pas « Failed to fetch »', async () => {
            const {p, ctx, msgs} = await open('cut');
            const r = await p.evaluate(async () => {
                const X = window.LCNDA_EXT, out = {tabs: {}}, wait = ms => new Promise(res => setTimeout(res, ms));
                for (const tb of X.autrefoisTabs || []) {
                    const h = document.createElement('div'); document.body.appendChild(h);
                    try { await tb.mount(h, {year: '1850'}); } catch (e) { out.tabs[tb.id] = 'rejet : ' + e.message; h.remove(); continue; }
                    await wait(400); out.tabs[tb.id] = h.innerText; h.remove();
                }
                if (X.chateauxTerritoires?.castlesInto) { const h = document.createElement('div'); document.body.appendChild(h); out.castles = [await X.chateauxTerritoires.castlesInto(h, {lat: 45.267, lon: 1.77}).catch(e => 'rejet : ' + e.message), h.innerText]; h.remove(); }
                if (X.diagramCartes?.load) { const id = Object.keys(X.diagramCartes.MAPS || {})[0]; out.dc = id ? await X.diagramCartes.load(id).then(() => 'ok', e => String(e?.message)) : ''; }
                return out;
            });
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'pays_chiffres'; return A.setModule('listes'); }).catch(() => {}); await p.waitForTimeout(2500);
            const texts = [...Object.entries(r.tabs).map(([k, v]) => ['onglet ' + k, v]), ['châteaux', String(r.castles?.[1] || '')], ['pays en chiffres', await pageText(p)]];
            judge(msgs, texts);
            if (process.env.FETCHCOUPE_DEBUG) console.log(JSON.stringify(r).slice(0, 1500));
            assert.ok('europe' in r.tabs, 'onglet « Ailleurs en Europe » absent : ' + Object.keys(r.tabs).join(', '));
            for (const k of ['europe', 'loi']) if (k in r.tabs) assert.match(r.tabs[k], /réessaie/, `onglet ${k} : ${r.tabs[k].slice(0, 200)}`);
            if (r.castles) assert.deepStrictEqual(r.castles, [false, ''], 'châteaux : la partie reste vide');
            assert.match(await pageText(p), /réessaie/, 'pays en chiffres : « réessaie »');
            await ctx.close();
        });
        await t('fichiers qui traînent, page rechargée en plein téléchargement (fiche et village) : rien dans la console', async () => {
            const {p, ctx, msgs} = await open('slow');
            for (const wait of [200, 500, 800, 1200]) {
                await person(p, 1); await p.waitForTimeout(wait);
                await p.reload({waitUntil: 'domcontentloaded'}).catch(() => {});
                await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, {timeout: 40000}).catch(() => {});
                await village(p, '19272'); await p.waitForTimeout(wait);
                await p.reload({waitUntil: 'domcontentloaded'}).catch(() => {});
                await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, {timeout: 40000}).catch(() => {});
            }
            await person(p, 1); await p.waitForTimeout(3000);
            judge(msgs, [['fiche après rechargements', await pageText(p)]]);
            await ctx.close();
        });
        await t('le serveur ne répond plus (api.php coupé) après l’ouverture : fiche et village — rien de brut', async () => {
            const {p, ctx, msgs, flags} = await open('ok');
            await person(p, 1); await p.waitForTimeout(1500);
            flags.api = true;
            const texts = [];
            await person(p, 2); await p.waitForTimeout(3000); texts.push(['fiche 2', await pageText(p)]);
            await village(p, '19272'); await p.waitForTimeout(3000); texts.push(['village', await pageText(p)]);
            judge(msgs, texts);
            await ctx.close();
        });
        await t('contrôle : un fichier de données illisible reste signalé (une vraie erreur ne disparaît pas)', async () => {
            const {p, ctx, msgs} = await open('bad');
            await person(p, 1); await p.waitForTimeout(3500);
            await village(p, '19272'); await p.waitForTimeout(3000);
            if (process.env.FETCHCOUPE_DEBUG) console.log(msgs.join('\n---\n'));
            assert.ok(msgs.some(m => /JSON|Unexpected token|SyntaxError|illisible|pas du json/i.test(m)), 'aucune erreur pour un fichier illisible : ' + msgs.join(' | ').slice(0, 400));
            await ctx.close();
        });
    } finally {
        await browser.close().catch(() => {});
        proc.kill();
        for (const d of [tmp, net0]) fs.rmSync(d, {recursive: true, force: true});
        console.log(`${fails ? '✗' : '✓'} téléchargement coupé : ${count} vérifications${fails ? `, ${fails} en échec` : ''}`);
        process.exit(fails ? 1 : 0);
    }
})();
