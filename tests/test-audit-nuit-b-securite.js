#!/usr/bin/env node
'use strict';
/* 🔒 Audit de nuit B — sécurité des téléchargements (lots A–D), de la traduction hors ligne (Argos), de CORINE et du serveur d'IA
 * locale (Unsloth / compatible OpenAI).
 *  1. PHP (ligne de commande) : pas de SSRF (hôtes permis seulement, https, pas de « user@hôte », pas de redirection), pas
 *     d'injection (code INSEE, langue de la traduction, région OSM, jeton de la corbeille), l'installateur d'Argos refuse une
 *     langue inconnue, l'IA locale ne parle qu'à 127.0.0.1 / localhost / ::1.
 *  2. Serveur (php -S, base temporaire, GENEALOGY_TEST=1 : rien ne part sur Internet, les « sites » sont des fichiers) :
 *     une réponse piégée de Wikidata (lien « javascript: », balises dans les titres) ne pose aucun lien dangereux ; une fiche
 *     vivante n'envoie rien à la Bibliothèque du Congrès ; en mode consultation : ni installation, ni téléchargement, ni
 *     recherche en ligne (seulement ce qui est déjà gardé), ni changement du serveur d'IA ; un faux appareil invité est refusé.
 *  3. Écran : les textes venus de Wikisource sont écrits comme du texte (aucun script ne s'exécute), un lien « javascript: »
 *     devient « # ».
 *   node tests/test-audit-nuit-b-securite.js */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha10 = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const phpPath = findPhp([devBundledPhp()]) || 'php';

(async () => {
    /* ═════════ 1. PHP en ligne de commande ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-nuitb-sec-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const baseEnv = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    delete baseEnv.GENEALOGY_TEST; delete baseEnv.LCNDA_TEST_TD_DIR; delete baseEnv.LCNDA_TEST_TELECHA_DIR;
    const php = (code, env = baseEnv) => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env, timeout: 60000});
    const seed = php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(4,'Luc','MAZAUD','male','living',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Allanche','Cantal','France',45.2294,2.9337,'15001')");
echo 'ok';`);
    if (seed.status !== 0 || !/ok/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }

    await t('SSRF : td_http (lot D) et ta_http (lot A) refusent tout autre site, le http, « hôte@autre », sans jamais appeler', () => {
        const r = php(String.raw`require 'lib/bootstrap.php'; require 'lib/telech_d.php'; require 'lib/telech_a.php';
$out = [];
foreach (['https://evil.example/x', 'http://query.wikidata.org/sparql', 'https://query.wikidata.org@169.254.169.254/', 'https://169.254.169.254/latest/meta-data/', 'file:///etc/passwd', 'https://www.loc.gov.evil.example/', 'gopher://www.loc.gov/'] as $u) {
    try { td_http('x', $u); $out[] = 'PASSE ' . $u; } catch (Throwable $e) { $out[] = $e->getMessage() === 'Adresse refusée.' ? 'refus' : 'autre: ' . $e->getMessage(); }
}
foreach (['https://evil.example/wmts', 'http://data.geopf.fr/wmts', 'https://data.geopf.fr@127.0.0.1/', 'https://data.geopf.fr.evil.example/'] as $u) {
    try { ta_http('x', $u); $out[] = 'PASSE ' . $u; } catch (Throwable $e) { $out[] = $e->getMessage() === 'Adresse refusée.' ? 'refus' : 'autre: ' . $e->getMessage(); }
}
echo json_encode($out);`);
        assert.strictEqual(r.status, 0, r.stderr);
        const out = JSON.parse(r.stdout.trim().split('\n').pop());
        assert.deepStrictEqual(out, Array(11).fill('refus'), out.join('\n'));
    });
    await t('injections : code INSEE (requête SPARQL), langue d’Argos, région OSM, jeton de la corbeille, titre de Wikipédia', () => {
        const r = php(String.raw`require 'lib/bootstrap.php'; require 'lib/telech_d.php'; require 'lib/telech_d_traduction.php'; require 'lib/telech_a.php';
$o = [];
$o['insee'] = [td_insee(['insee' => '15001" } UNION { ?x ?y ?z']), td_insee(['insee' => '2A004']), td_insee(['insee' => '../15001'])];
foreach (['de; touch /tmp/pwn', '../../etc', 'la', 'xx'] as $k) { try { tdtr_dl_start(['kind' => $k]); $o['dl'][] = 'PASSE'; } catch (LcndaBadInput $e) { $o['dl'][] = 'refus'; } catch (Throwable $e) { $o['dl'][] = 'autre: ' . $e->getMessage(); } }
foreach (['de$(id)', 'en fr'] as $k) { try { tdtr_translate(['text' => 'x', 'from' => $k]); $o['tr'][] = 'PASSE'; } catch (LcndaBadInput $e) { $o['tr'][] = 'refus'; } }
try { tdtr_pack_undo(['kind' => '../venv']); $o['undo'] = 'PASSE'; } catch (LcndaBadInput $e) { $o['undo'] = 'refus'; }
foreach (['../../x', 'bretagne;rm', 'a', str_repeat('a', 50)] as $k) { try { ta_osm_key($k); $o['osm'][] = 'PASSE'; } catch (LcndaBadInput $e) { $o['osm'][] = 'refus'; } }
foreach (['../../../etc', 'zzzzzzzzzzzzzzzz', ''] as $k) { try { td_cache_restore(['token' => $k]); $o['tok'][] = 'PASSE'; } catch (LcndaBadInput $e) { $o['tok'][] = 'refus'; } }
echo json_encode($o);`);
        assert.strictEqual(r.status, 0, r.stderr);
        const o = JSON.parse(r.stdout.trim().split('\n').pop());
        assert.deepStrictEqual(o.insee, ['', '2A004', '']);
        assert.deepStrictEqual(o.dl, ['refus', 'refus', 'refus', 'refus'], 'le latin et les langues inconnues ne lancent rien');
        assert.deepStrictEqual(o.tr, ['refus', 'refus']); assert.strictEqual(o.undo, 'refus');
        assert.deepStrictEqual(o.osm, ['refus', 'refus', 'refus', 'refus']); assert.deepStrictEqual(o.tok, ['refus', 'refus', 'refus']);
        assert.ok(!fs.existsSync('/tmp/pwn'));
        // rien n'a été lancé : pas de dossier venv, pas d'installation en cours
        assert.ok(!fs.existsSync(path.join(tmp, 'traduction', 'venv')));
    });
    await t('Argos : l’installateur (arguments en tableau, sans shell) refuse une langue inconnue ; le traducteur Python ne prend que --check/--install/--remove/--translate', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-argos-'));
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(root, 'scripts/telech-d/argos_install.php'), dir, root, 'de;id', '', '1'], {encoding: 'utf8', timeout: 30000});
        assert.strictEqual(r.status, 2); assert.match(r.stderr, /Langue inconnue/);
        assert.ok(!fs.existsSync(path.join(dir, 'engine.json')));
        const src = fs.readFileSync(path.join(root, 'lib/telech_d_traduction.php'), 'utf8');
        assert.match(src, /proc_open\(\[\$py, '-I'/, 'le Python est lancé en mode isolé (-I), arguments en tableau');
        assert.ok(!/shell_exec|passthru|system\(/.test(src));
        const hs = fs.readFileSync(path.join(root, 'lib/htr_setup.php'), 'utf8');
        assert.match(hs, /array_map\('escapeshellarg', \[\$php, \.\.\.\$args\]\)/, 'le lancement en arrière-plan échappe chaque argument');
    });
    await t('IA locale (Unsloth / compatible OpenAI) : seulement 127.0.0.1, localhost ou ::1 en http, sans chemin ni identifiant', () => {
        const r = php(String.raw`require 'lib/bootstrap.php'; require 'lib/ia_serveur.php';
$o = [];
foreach (['http://127.0.0.1:8888', 'http://localhost:1234', 'http://[::1]:11434', 'http://169.254.169.254', 'http://127.0.0.1.evil.example:80', 'http://localhost@evil.example', 'https://127.0.0.1:8888', 'http://127.0.0.1:8888/v1', 'http://10.0.0.5:11434', 'http://127.0.0.1:8888?x=1', 'http://0x7f000001:8888'] as $u) { $o[] = ia_srv_url_ok($u) ? 1 : 0; }
foreach (['sk-unsloth-abc_1.2', "a\r\nX-Evil: 1", 'a b', str_repeat('k', 201)] as $k) { $o[] = ia_srv_key_ok($k) ? 1 : 0; }
try { ia_srv_save(['kind' => 'unsloth', 'url' => 'http://evil.example:8888']); $o[] = 'PASSE'; } catch (LcndaBadInput $e) { $o[] = 'refus'; }
echo json_encode($o);`);
        assert.strictEqual(r.status, 0, r.stderr);
        assert.deepStrictEqual(JSON.parse(r.stdout.trim().split('\n').pop()), [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 'refus']);
        assert.ok(!fs.existsSync(path.join(tmp, 'genealogie-ia-serveur.json')), 'rien d’enregistré');
    });

    /* ═════════ 2. Serveur ═════════ */
    const net0 = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-nuitb-net-'));
    const netA = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-nuitb-neta-'));
    const calls = d => (fs.existsSync(path.join(d, 'calls.log')) ? fs.readFileSync(path.join(d, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean) : []);
    const XSS = '<img src=x onerror="window.__xss=1">';
    // une réponse de Wikidata « piégée » : un lien javascript:, des balises dans le titre et l'auteur, un faux élément Wikidata
    fs.writeFileSync(path.join(net0, 'wd-ws-15001.json'), JSON.stringify({head: {}, results: {bindings: [
        {w: {value: 'javascript:alert(1)'}, wl: {value: `Notice ${XSS}`}, ws: {value: 'https://fr.wikisource.org/wiki/Notice_sur_Allanche'}, al: {value: `<script>window.__xss=2</script>Auteur`}},
        {w: {value: 'http://www.wikidata.org/entity/Q1'}, wl: {value: 'Lien piégé'}, ws: {value: 'javascript:window.__xss=3'}},
        {w: {value: 'http://www.wikidata.org/entity/Q2'}, wl: {value: 'Autre site'}, ws: {value: 'https://evil.example/wiki/x'}}]}}));
    fs.writeFileSync(path.join(net0, `ws-${sha10('Allanche')}.json`), JSON.stringify({query: {search: [{title: `Voyage ${XSS} (1845)`}]}}));
    const env = {...baseEnv, PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_TD_DIR: net0, LCNDA_TEST_TELECHA_DIR: netA, GENEALOGY_TD_SIMULATE: '1'};
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 150; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    let browser = null;
    try {
        await t('un faux appareil invité (en-tête d’appareil sans la signature de la porte) est refusé, lecture comprise', async () => {
            const r = await fetch(base + 'api.php?action=td_wiki&insee=15001', {headers: {'x-carnet-device': 'aaaaaaaaaaaaaaaa'}});
            assert.strictEqual(r.status, 403);
            assert.strictEqual(calls(net0).length, 0);
        });
        if (!chromium) { console.log('— navigateur absent : partie écran sautée'); return; }
        browser = await chromium.launch();
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
        const p = await ctx.newPage();
        const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechD, null, {timeout: 40000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (x, b = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}).then(r => r?.result || r).catch(e => ({error: e.message, status: e.status})), [x, b]);

        await t('Wikisource / Wikidata piégés : aucun lien « javascript: » ni vers un autre site ; titres gardés comme texte', async () => {
            const s = await api('td_wikisource', {insee: '15001', name: 'Allanche'});
            assert.strictEqual(s.ok, true, JSON.stringify(s));
            assert.ok(s.items.every(i => /^https:\/\/fr\.wikisource\.org\/wiki\//.test(i.url)), JSON.stringify(s.items.map(i => i.url)));
            assert.ok(s.items.every(i => !i.wd || /^https?:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(i.wd)), 'faux élément Wikidata écarté');
            assert.ok(s.items.some(i => i.title.includes('<img')), 'le titre reste tel quel côté serveur (échappé à l’écran)');
        });
        await t('écran : les textes de Wikisource sont écrits comme du texte, aucun script ne s’exécute ; un lien « javascript: » devient « # »', async () => {
            const res = await p.evaluate(async () => {
                const h = document.createElement('div'); document.body.appendChild(h);
                h.innerHTML = await window.LCNDA_EXT.telechD.placePart('wikisource', {id: 1, name: 'Allanche', insee: '15001', lat: 45.2294, lon: 2.9337}) || '';
                await new Promise(r => setTimeout(r, 300));
                const out = {html: h.innerHTML, imgs: h.querySelectorAll('img').length, scripts: h.querySelectorAll('script').length, hrefs: [...h.querySelectorAll('a')].map(a => a.getAttribute('href')), xss: window.__xss || 0, text: h.textContent};
                h.remove(); return out;
            });
            assert.strictEqual(res.xss, 0); assert.strictEqual(res.imgs, 0); assert.strictEqual(res.scripts, 0);
            assert.ok(res.text.includes('<img'), 'le texte se lit');
            assert.ok(res.hrefs.length > 0 && res.hrefs.every(h => /^https:\/\//.test(h)), res.hrefs.join(' '));
        });
        await t('vie privée : une fiche vivante n’envoie rien à la Bibliothèque du Congrès ; aucun nom de personne dans les demandes', async () => {
            const n0 = calls(net0).length;
            const r = await api('td_loc', {kind: 'ellis', from: 1990, to: 1925, pid: 4});
            assert.strictEqual(r.private, true); assert.strictEqual(calls(net0).length, n0);
            const r2 = await api('telech_a_clc', {lat: 45.2294, lon: 2.9337, pid: 4});
            assert.ok(r2.private || r2.ok === false || r2.nopoint || !calls(netA).length, JSON.stringify(r2).slice(0, 200));
            assert.strictEqual(calls(netA).length, 0, 'CORINE : rien pour une fiche vivante');
            assert.ok(![...calls(net0), ...calls(netA)].some(c => /MAZAUD|Jean|Luc/i.test(c)));
        });
        await t('mode consultation : ni installation (Argos, cartes OSM), ni serveur d’IA changé, ni recherche en ligne (seulement ce qui est gardé)', async () => {
            const kept = await api('td_wikisource', {insee: '15001', name: 'Allanche'}); assert.strictEqual(kept.ok, true); // gardé avant
            const on = await post('kiosk_enter', {password: 'secret-1234'}); assert.ok(!on.error, JSON.stringify(on));
            try {
                const n0 = calls(net0).length, a0 = calls(netA).length;
                for (const [act, body] of [['td_tr_dl_start', {kind: 'de'}], ['td_tr_uninstall', {}], ['td_tr_pack_undo', {kind: 'de'}], ['telech_a_osm_dl_start', {key: 'bretagne'}], ['ia_srv_save', {kind: 'unsloth', url: 'http://127.0.0.1:8888'}], ['ia_srv_test', {kind: 'unsloth'}], ['td_cache_clear', {}]]) {
                    const r = await post(act, body); assert.ok(r.error && (r.status === 423 || /consultation/i.test(r.error)), `${act} : ${JSON.stringify(r)}`);
                }
                const w = await api('td_wiki', {insee: '15001'}); // jamais regardé : rien ne part
                assert.strictEqual(w.ok, false); assert.strictEqual(w.kiosk, true, JSON.stringify(w));
                const c = await api('telech_a_clc', {lat: 45.2294, lon: 2.9337, pid: 1});
                assert.ok(c.notcached || c.cached, JSON.stringify(c).slice(0, 200));
                const k2 = await api('td_wikisource', {insee: '15001', name: 'Allanche'}); assert.strictEqual(k2.ok, true, 'ce qui est gardé se lit'); assert.strictEqual(k2.cached, true);
                assert.strictEqual(calls(net0).length, n0, 'aucune demande à Wikidata / Wikipédia'); assert.strictEqual(calls(netA).length, a0, 'aucune tuile CORINE demandée');
                assert.ok(!fs.existsSync(path.join(tmp, 'genealogie-ia-serveur.json')));
            } finally { await post('kiosk_exit', {password: 'secret-1234'}); }
            assert.strictEqual((await api('kiosk_state')).on, false);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        if (browser) await browser.close().catch(() => {});
        proc.kill();
        for (const d of [tmp, net0, netA]) fs.rmSync(d, {recursive: true, force: true});
        console.log(`${fails ? '✗' : '✓'} audit de nuit B (sécurité) : ${count} vérifications${fails ? `, ${fails} en échec` : ''}`);
        process.exit(fails ? 1 : 0);
    }
})();
