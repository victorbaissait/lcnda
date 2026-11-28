#!/usr/bin/env node
/* 🔐 Audit de nuit A — sécurité de « Prendre depuis… » / « Mettre dans… », « 📎 Insérer une info » (cx_search), des paniers (onglet Paniers,
 * partage .lcnda-panier), de « ＋ Mes listes » (import, partage), de Listes → Données (noms reliés) et des données mises à jour (router.php).
 *  1. jeton CSRF : toute écriture nouvelle (cx_write, ulist_write, lp_write, donnees_maj_*) refusée sans lui ;
 *  2. mode consultation (= appareil invité du wifi, lib/heritage_tools.php kiosk_state) : rien ne s'écrit ; cx_search / cx_notes ne montrent ni
 *     fiche confidentielle, ni événement confidentiel, ni leurs notes ; ulist_index n'efface rien ;
 *  3. SSRF (cx_fetch_url) : adresses locales, en chiffres, IPv6, file://, identifiants refusés ; jamais par un proxy (http_proxy) ;
 *  4. router.php : pas de sortie de assets/data/ (../, %2e%2e, installed.json piégé) ;
 *  5. XSS : noms de paniers, dossiers, notes, étiquettes, éléments, listes (titres de colonnes, cases), fichier partagé, résultats de cx_search ;
 *  6. partage : jamais un vivant, une fiche ou un événement confidentiel (ni sa note, ni son média), jamais la note d'un élément ; fichier piégé lu en texte ;
 *  7. formules : l'export .xlsx d'un panier garde « =… » en texte ; ↶ / historique : seulement les opérations du panier ; dossiers sans boucle ;
 *     LIKE : « % » et « _ » cherchés tels quels.
 *   node tests/test-audit-nuit-a-securite.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const {spawnSync} = require('child_process');
const {start, sleep} = require('./prendre-depuis-seed.js');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const root = path.join(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]) || 'php';
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">"><svg onload="window.__xss=9">';

(async () => {
    const B = await start();
    const p = B.page;
    const php = (code, env = {}) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: B.tmp, GENEALOGY_MEDIA_DIR: path.join(B.tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', ...env}, timeout: 60000}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const cx = (op, body = {}) => p.evaluate(([o, b]) => window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: o, ...b}}).then(r => r?.result ?? r), [op, body]);
    const cxTry = (op, body = {}) => p.evaluate(([o, b]) => window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: o, ...b}}).then(() => 'ok', e => e.message), [op, body]);
    const raw = (action, body, headers = {}) => p.evaluate(async ([a, b, h]) => { const r = await fetch('api.php?action=' + a, {method: 'POST', headers: {'Content-Type': 'application/json', ...h}, body: JSON.stringify(b)}); return {status: r.status, text: await r.text()}; }, [action, body, headers]);
    const csrf = () => p.evaluate(() => window.LCNDA_APP.state.csrf);
    // des données sensibles : une fiche confidentielle, une fiche vivante, un événement confidentiel, une note sur la fiche confidentielle, un média de la vivante
    php(String.raw`$p = new PDO('sqlite:' . getenv('GENEALOGY_DATA_DIR') . '/genealogy.sqlite'); $p->exec('PRAGMA busy_timeout=20000');
$p->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private) VALUES(900,'Secretus','PRIVATUS','male','deceased',1),(901,'Vivantus','VIVANTOS','male','living',0)");
$t = (int) $p->query("SELECT id FROM event_types WHERE gedcom_tag='OCCU' LIMIT 1")->fetchColumn() ?: (int) $p->query("SELECT id FROM event_types LIMIT 1")->fetchColumn();
$p->exec("INSERT INTO events(id,scope,person_id,event_type_id,title,date_text,year,is_private) VALUES(9000,'person',1,$t,'Rendez-vous Zorglub','1850',1850,1),(9001,'person',900,$t,'Métier Zorglub du secret','1851',1851,0)");
$p->exec("INSERT INTO notes(id,entity_type,entity_id,title,body,created_at) VALUES(9100,'person',900,'Zorglub caché','Note de la fiche confidentielle',datetime('now')),(9101,'event',9000,'Zorglub rendez-vous','Note de l''événement confidentiel',datetime('now'))");
$p->exec("INSERT INTO media(id,title,media_type,filename) VALUES(9200,'Photo de Vivantus','image','img005.png')"); $p->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(9200,'person',901)");
echo 'ok';`);

    try {
        /* ═════ 1. CSRF ═════ */
        await t('jeton CSRF : cx_write, ulist_write, lp_write, donnees_maj_apply / _undo refusés sans jeton (419) ou avec un faux, rien d’écrit', async () => {
            const before = (await B.api('cx_basket', {})).baskets.length;
            for (const [a, b] of [['cx_write', {op: 'basket_new', name: 'pirate'}], ['cx_write', {op: 'pn_share_import', body: '{}'}], ['cx_write', {op: 'fetch_url', url: 'https://example.com/a.csv'}],
                ['ulist_write', {op: 'create', name: 'pirate', columns: [{key: 'a', label: 'a'}]}], ['lp_write', {op: 'create', first_name: 'Pirate'}], ['donnees_maj_apply', {pack: 'l8c-tour'}], ['donnees_maj_undo', {pack: 'l8c-tour'}]]) {
                for (const h of [{}, {'X-CSRF-Token': 'faux'}]) { const r = await raw(a, b, h); assert.strictEqual(r.status, 419, `${a} ${JSON.stringify(h)} → ${r.status} ${r.text.slice(0, 120)}`); }
            }
            assert.strictEqual((await B.api('cx_basket', {})).baskets.length, before);
            assert.ok(!(await B.api('ulist_index', {})).lists.some(l => l.name === 'pirate'));
        });

        /* ═════ 2. consultation ═════ */
        await t('propriétaire : cx_search trouve l’événement confidentiel, la fiche confidentielle et ses notes (contrôle)', async () => {
            const r = await B.api('cx_search', {q: 'Zorglub'}); const kinds = r.base.map(g => g.kind);
            assert.ok(kinds.includes('event') && kinds.includes('note'), JSON.stringify(kinds));
            assert.ok(r.base.find(g => g.kind === 'event').items.some(x => Number(x.id) === 9000), 'l’événement confidentiel (propriétaire)');
            const r2 = await B.api('cx_search', {q: 'PRIVATUS'}); assert.ok(r2.base.some(g => g.kind === 'person' && g.items.some(x => Number(x.id) === 900)));
        });
        // un panier avec ce qu'il faut pour la suite (avant la consultation)
        const sec = (await cx('basket_new', {name: 'Sensible ' + XSS, note: 'note ' + XSS, icon: '<b>x</b>'})).id;
        await cx('basket_add', {basket_id: sec, items: [
            {kind: 'person', ref_id: 900, title: 'Secretus PRIVATUS', value: 'confidentiel'}, {kind: 'person', ref_id: 901, title: 'Vivantus VIVANTOS', value: 'vivant'},
            {kind: 'event', ref_id: 9000, title: 'Rendez-vous Zorglub', value: '1850'}, {kind: 'datum', title: 'Métier secret', value: 'tonnelier', origin: {kind: 'person', person_id: 900}},
            {kind: 'note', ref_id: 9100, title: 'Zorglub caché', value: 'Note de la fiche confidentielle'}, {kind: 'media', ref_id: 9200, title: 'Photo de Vivantus', value: 'photo'},
            {kind: 'event', ref_id: 9001, title: 'Métier Zorglub du secret', value: '1851'},
            {kind: 'person', ref_id: 1, title: 'Jean MAZAUD', value: '1747'}, {kind: 'row', title: 'Gare de Tulle ' + XSS, value: '1871 ' + XSS, data: {columns: ['Nom ' + XSS], row: ['x'], url: 'javascript:alert(1)'}, origin: {kind: 'list', label: 'Gares ' + XSS, url: 'javascript:alert(2)'}},
            {kind: 'datum', title: '=HYPERLINK("http://evil.example";"clic")', value: '=SUM(1;2)', origin: {kind: 'list', label: 'Liste'}}]});
        const secItems = (await B.api('cx_basket', {basket_id: sec})).items;
        assert.strictEqual(secItems.length, 10);
        await cx('item_set', {id: secItems.find(x => x.ref_id === 1).id, note: 'ma note privée ZZNOTEZZ'});

        await t('mode consultation : les écritures nouvelles refusées (423) — paniers, partage, fetch_url, Mes listes, noms reliés, données', async () => {
            await p.evaluate(() => window.LCNDA_APP.api('kiosk_enter', {}, {method: 'POST', body: {password: 'secret-1234'}}));
            const tok = await csrf();
            for (const [a, b] of [['cx_write', {op: 'basket_new', name: 'kiosk'}], ['cx_write', {op: 'pn_share_build', basket_id: sec}], ['cx_write', {op: 'fetch_url', url: 'https://example.com/a.csv'}], ['cx_write', {op: 'pn_undo', log_id: 1}],
                ['ulist_write', {op: 'create', name: 'kiosk', columns: [{key: 'a', label: 'a'}]}], ['lp_write', {op: 'create', first_name: 'Kiosk'}], ['donnees_maj_apply', {pack: 'l8c-tour'}]]) {
                const r = await raw(a, b, {'X-CSRF-Token': tok}); assert.strictEqual(r.status, 423, `${a} ${b.op || ''} → ${r.status} ${r.text.slice(0, 160)}`);
            }
        });
        await t('mode consultation : cx_search / cx_notes ne montrent ni la fiche confidentielle, ni l’événement confidentiel, ni leurs notes, ni le panier qui les montre', async () => {
            const r = await B.api('cx_search', {q: 'Zorglub'});
            const ev = r.base.find(g => g.kind === 'event')?.items || [], nt = r.base.find(g => g.kind === 'note')?.items || [];
            assert.ok(!ev.some(x => [9000, 9001].includes(Number(x.id))), 'événement confidentiel / de la fiche confidentielle : ' + JSON.stringify(ev));
            assert.ok(!nt.some(x => [9100, 9101].includes(Number(x.id))), 'notes : ' + JSON.stringify(nt));
            assert.ok(!(r.basket || []).some(x => x.ref_id === 9000), 'panier : ' + JSON.stringify(r.basket));
            const r2 = await B.api('cx_search', {q: 'PRIVATUS'});
            assert.ok(!r2.base.some(g => g.kind === 'person' && g.items.some(x => Number(x.id) === 900)), JSON.stringify(r2.base));
            assert.ok(!(r2.basket || []).some(x => x.ref_id === 900), 'panier : la fiche confidentielle');
            const n = await B.api('cx_notes', {q: 'Zorglub'}); assert.ok(!n.items.some(x => [9100, 9101].includes(Number(x.id))), JSON.stringify(n.items));
            const n2 = await B.api('cx_notes', {q: ''}); assert.ok(!n2.items.some(x => [9100, 9101].includes(Number(x.id))));
            assert.ok((await B.api('cx_search', {q: 'MAZAUD'})).base.some(g => g.kind === 'person'), 'le reste se trouve toujours');
        });
        await t('mode consultation : « Mes listes » (ulist_index, une lecture) n’efface rien', async () => {
            php(String.raw`$p = new PDO('sqlite:' . getenv('GENEALOGY_DATA_DIR') . '/genealogy.sqlite'); $p->exec('PRAGMA busy_timeout=20000'); require 'lib/listes_perso.php'; ulist_ensure($p);
$p->exec("INSERT INTO ulist_lists(id,name,columns_json,ready,created_at) VALUES(777,'envoi en cours','[]',0,datetime('now','-3 days'))"); echo 'ok';`);
            await B.api('ulist_index', {});
            assert.strictEqual(php(String.raw`$p = new PDO('sqlite:' . getenv('GENEALOGY_DATA_DIR') . '/genealogy.sqlite'); echo (int) $p->query('SELECT count(*) FROM ulist_lists WHERE id=777')->fetchColumn();`), '1');
            await p.evaluate(() => window.LCNDA_APP.api('kiosk_exit', {}, {method: 'POST', body: {password: 'secret-1234'}}));
            assert.strictEqual((await B.api('kiosk_state', {})).on, false);
            await B.api('ulist_index', {}); // le propriétaire : le ménage se fait
            assert.strictEqual(php(String.raw`$p = new PDO('sqlite:' . getenv('GENEALOGY_DATA_DIR') . '/genealogy.sqlite'); echo (int) $p->query('SELECT count(*) FROM ulist_lists WHERE id=777')->fetchColumn();`), '0');
        });

        /* ═════ 3. SSRF ═════ */
        await t('SSRF : cx_fetch_url refuse 127.0.0.1, 127.1, 0x7f.1, 2130706433, [::1], [::ffff:127.0.0.1], 64:ff9b::, localhost(.), 10/8, 169.254, 100.64, 0.0.0.0, file://, gopher://, user@host', async () => {
            const urls = ['http://127.0.0.1/a.csv', 'http://127.1/a.csv', 'http://0x7f.1/a.csv', 'http://2130706433/a.csv', 'http://017700000001/a.csv', 'http://[::1]/a.csv', 'http://[::ffff:127.0.0.1]/a.csv', 'http://[64:ff9b::7f00:1]/a.csv',
                'http://[2002:7f00:1::]/a.csv', 'http://localhost/a.csv', 'http://localhost./a.csv', 'http://x.localhost/a.csv', 'http://10.1.2.3/a.csv', 'http://169.254.169.254/latest/meta-data', 'http://100.64.0.1/a.csv', 'http://0.0.0.0/a.csv',
                'http://[fe80::1]/a.csv', 'http://[fc00::1]/a.csv', 'file:///etc/passwd', 'gopher://example.com/', 'http://user:pw@example.com/a.csv', 'ftp://example.com/a.csv'];
            const out = php(String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; require_once 'lib/connexions.php'; $r = [];
foreach (json_decode(getenv('URLS'), true) as $u) { try { cx_fetch_url(['url' => $u]); $r[$u] = 'TÉLÉCHARGÉ'; } catch (Throwable $e) { $r[$u] = $e->getMessage(); } } echo json_encode($r, JSON_UNESCAPED_UNICODE);`, {GENEALOGY_TEST: '0', URLS: JSON.stringify(urls)});
            const r = JSON.parse(out);
            for (const u of urls) assert.match(r[u], /Adresse refusée|commence par https/, `${u} → ${r[u]}`);
        });
        await t('SSRF : jamais par le proxy de l’ordinateur (http_proxy) — sinon le proxy résoudrait le nom lui-même (DNS rebinding)', async () => {
            let hits = 0; const prox = http.createServer((req, res) => { hits++; res.setHeader('Content-Type', 'text/csv'); res.end('a;b\n1;2\n'); });
            await new Promise(r => prox.listen(0, '127.0.0.1', r)); const port = prox.address().port;
            try {
                const out = php(String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; require_once 'lib/connexions.php';
try { $r = cx_fetch_url(['url' => 'http://198.51.100.20:9/a.csv']); echo 'TÉLÉCHARGÉ ' . base64_decode($r['base64']); } catch (Throwable $e) { echo $e->getMessage(); }`, {GENEALOGY_TEST: '0', http_proxy: `http://127.0.0.1:${port}`, HTTP_PROXY: `http://127.0.0.1:${port}`, https_proxy: `http://127.0.0.1:${port}`});
                assert.strictEqual(hits, 0, 'le proxy a reçu la demande : ' + out);
                assert.ok(!/TÉLÉCHARGÉ/.test(out), out);
            } finally { prox.close(); }
            const src = fs.readFileSync(path.join(root, 'lib/connexions.php'), 'utf8'), fn = src.slice(src.indexOf('function cx_fetch_url'), src.indexOf('function cx_used'));
            assert.match(fn, /CURLOPT_NOPROXY => '\*'/); assert.match(fn, /CURLOPT_FOLLOWLOCATION => false/); assert.match(fn, /link_safe_resolve\(\$url\)/, 'chaque saut de redirection revérifié');
            assert.ok(!/CURLOPT_ENCODING/.test(fn), 'pas de décompression automatique (bombe gzip)');
        });

        /* ═════ 4. router.php ═════ */
        await t('router.php : rien hors de assets/data/ (../, %2e%2e, %2f, \\, données, code) ; installed.json piégé ignoré', async () => {
            const get = async u => { const r = await fetch(B.base.replace(/\/$/, '') + u); return {status: r.status, text: await r.text()}; };
            for (const u of ['/assets/data/../../data/schema.sql', '/assets/data/%2e%2e/%2e%2e/lib/paths.php', '/assets/data/..%2f..%2frouter.php', '/assets/data/%2e%2e%5c%2e%2e%5capi.php', '/genealogy.sqlite', '/data/schema.sql', '/lib/paths.php', '/assets/data/.htaccess', '/tests/test-paniers.js']) {
                const r = await get(u); assert.ok([400, 403, 404].includes(r.status), `${u} → ${r.status}`); assert.ok(!/<\?php|CREATE TABLE|SQLite format/.test(r.text), u);
            }
            const dir = path.join(B.tmp, 'donnees-maj'); fs.mkdirSync(path.join(dir, 'files'), {recursive: true});
            const evil = {'../genealogy.sqlite': 'x', '../../data/schema.sql': 'x', 'a/../../genealogy.sqlite': 'x', 'manifest.json': 'x'};
            fs.writeFileSync(path.join(dir, 'installed.json'), JSON.stringify({packs: {x: {files: Object.fromEntries(Object.keys(evil).map(k => [k, {override: true, shipped: null}]))}}, index: Object.fromEntries(Object.keys(evil).map(k => [k, 'x']))}));
            for (const rel of Object.keys(evil)) { const r = await get('/assets/data/' + rel.split('/').map(encodeURIComponent).join('/')); assert.ok(!/SQLite format|CREATE TABLE/.test(r.text), rel + ' → ' + r.status); }
            const r = await get('/assets/data/manifest.json'); assert.strictEqual(r.status, 200); assert.ok(r.text.startsWith('{'), 'manifest livré (pas remplacé : le fichier téléchargé n’existe pas)');
            const out = php(String.raw`require 'lib/paths.php'; require 'lib/donnees_maj_route.php'; foreach (['../genealogy.sqlite', 'a/../../x', '/etc/passwd', 'a//b', '.hidden', "a\0b"] as $r) { echo var_export(dmaj_route_file($r), true), ','; }`);
            assert.strictEqual(out, 'NULL,NULL,NULL,NULL,NULL,NULL,');
            fs.rmSync(dir, {recursive: true, force: true});
        });

        /* ═════ 5. XSS ═════ */
        const fid = (await cx('folder_new', {name: 'Dossier ' + XSS, icon: '<i>', color: 'red;background:url(x)', basket_name: 'Panier ' + XSS}));
        await cx('pn_meta', {basket_id: sec, labels: [['Étiq ' + XSS, '#ff0000'], ['ok', 'red"><img src=x onerror=window.__xss=7>']], cover: 'g2', log: 'Réglé ' + XSS});
        await t('serveur : couleurs et couverture refusées si ce ne sont pas des valeurs sûres ; LIKE « % » / « _ » cherchés tels quels', async () => {
            const r = await B.api('cx_basket', {all: 1}); const f = r.folders.find(x => x.id === fid.id), b = r.baskets.find(x => x.id === sec);
            assert.strictEqual(f.color, ''); assert.deepStrictEqual(b.labels.map(l => l[1]), ['#ff0000', '#777777']);
            assert.match(await cxTry('pn_meta', {basket_id: sec, cover: 'javascript:alert(1)'}), /Couverture refusée/);
            assert.match(await cxTry('pn_meta', {basket_id: sec, cover: 'data:image/svg+xml;base64,PHN2Zz4='}), /Couverture refusée/);
            const s1 = await B.api('cx_search', {q: '%%'}); assert.ok(s1.basket.every(x => (x.title + x.value).includes('%%')), '« %% » ne trouve pas tout le panier : ' + JSON.stringify(s1.basket.map(x => [x.title, x.value])));
            const s2 = await B.api('cx_search', {q: '__'}); assert.ok(s2.basket.every(x => (x.title + x.value).includes('__')), JSON.stringify(s2.basket.map(x => [x.title, x.value])));
            const n = await B.api('cx_notes', {q: '%'}); assert.ok(!n.items.length || n.items.every(x => /%/.test(x.title + x.body)), 'notes : % pris tel quel');
        });
        await t('XSS : onglet Paniers, vue du panier, « Prendre depuis… » (panier), « 📎 Insérer une info », historique — rien ne s’exécute', async () => {
            await p.evaluate(() => { window.__xss = 0; localStorage.setItem('genealogie-connexions-panier', '0'); });
            await B.go('paniers'); await p.waitForSelector('[data-pn] [data-pn-tree] .pn-tr', {timeout: 20000}); await sleep(500);
            await p.locator('[data-pn-tree] .pn-tr[data-pn-b]', {hasText: 'Sensible'}).first().click(); await sleep(1200);
            for (const v of ['carte', 'frise', 'liste']) { const b = p.locator(`[data-pn-view="${v}"]`); if (await b.count()) { await b.first().click(); await sleep(900); } } // les trois vues
            for (const a of ['more', 'share', 'sort']) { const b = p.locator(`[data-pn-main] [data-pn-a="${a}"]`); if (await b.count()) { await b.first().click().catch(() => {}); await sleep(700); await p.keyboard.press('Escape'); await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.ui-actmenu').forEach(x => x.remove()); }); } }
            await p.evaluate(id => localStorage.setItem('genealogie-connexions-panier', String(id)), sec);
            await p.evaluate(() => window.LCNDA_EXT.connexions.openBasketView()); await p.waitForSelector('dialog.cx-bview[open] .cx-put-body'); await sleep(600);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p.evaluate(() => window.LCNDA_EXT.connexions.openTake({tab: 'basket'})); await p.waitForSelector('.cx-take [data-cx-ttree]', {timeout: 15000}); await sleep(600);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p.evaluate(() => { const ta = document.createElement('textarea'); ta.id = 'xss-ta'; document.body.appendChild(ta); window.LCNDA_EXT.insertInfo.open(ta, {onPick: () => {}}); });
            await p.waitForSelector('.cx-qi [data-qi-q]'); await p.fill('.cx-qi [data-qi-q]', 'Gare de Tulle'); await sleep(1500);
            await p.evaluate(() => { window.LCNDA_EXT.insertInfo.close(); document.getElementById('xss-ta')?.remove(); });
            const r = await p.evaluate(() => ({x: window.__xss, bad: [...document.querySelectorAll('img[src="x"], svg[onload]')].length}));
            assert.strictEqual(r.x, 0, 'un script a tourné'); assert.strictEqual(r.bad, 0, 'une balise est passée');
        });
        await t('XSS : « ＋ Mes listes » — nom, source, titres de colonnes, cases ; et un fichier .lcnda-liste.json piégé', async () => {
            await p.evaluate(() => { window.__xss = 0; });
            const id = await p.evaluate(async x => {
                const A = window.LCNDA_APP, w = b => A.api('ulist_write', {}, {method: 'POST', body: b});
                const c = await w({op: 'create', name: 'Liste ' + x, icon: '<b>', source: 'Source ' + x, licence: x, source_url: 'javascript:alert(1)', columns: [{key: 'nom', label: 'Nom ' + x, type: 'text'}, {key: 'lien', label: 'Lien', type: 'url'}]});
                const s = await w({op: 'begin', id: c.id}); await w({op: 'append', id: c.id, stage: s.stage, rows: [{nom: 'Case ' + x, lien: 'javascript:alert(3)'}, {nom: 'Normal', lien: 'https://example.com/'}]}); await w({op: 'commit', id: c.id, stage: s.stage});
                await window.LCNDA_EXT.listesPerso.reload(c.id); return c.id; }, XSS);
            const meta = (await B.api('ulist_index', {})).lists.find(l => l.id === id); assert.strictEqual(meta.source_url, '', 'source_url : http(s) seulement');
            await p.evaluate(i => window.LCNDA_EXT.listesPerso.open(i), id); await p.waitForFunction(() => document.querySelectorAll('.ld-table tbody tr[data-ld-row]').length === 2, null, {timeout: 15000}); await sleep(500);
            const links = await p.$$eval('.ld-table a[href]', a => a.map(x => x.getAttribute('href'))); assert.ok(!links.some(h => /^\s*javascript:/i.test(h)), JSON.stringify(links));
            // un fichier partagé piégé : lu comme du texte, rien ne tourne
            const shared = JSON.stringify({lcnda_list: 1, name: 'Partagée ' + XSS, icon: XSS, source: XSS, columns: [{key: 'a', label: XSS, type: 'text'}, {key: '__proto__', label: 'p'}], rows: [{a: XSS}, {a: '=HYPERLINK("http://evil")'}]});
            const v = await p.evaluate(async txt => { const L = window.LCNDA_EXT.listesPerso; const v = await L.understand(await L.readInput({text: txt})); return {cols: v.cols.map(c => c.label), body: v.body}; }, shared);
            assert.ok(!JSON.stringify(v.body).includes('HYPERLINK'), 'une formule n’entre pas');
            const r = await p.evaluate(() => ({x: window.__xss, bad: [...document.querySelectorAll('img[src="x"], svg[onload]')].length}));
            assert.strictEqual(r.x, 0); assert.strictEqual(r.bad, 0);
            await p.evaluate(i => window.LCNDA_APP.api('ulist_write', {}, {method: 'POST', body: {op: 'delete', id: i}}), id);
        });

        /* ═════ 6. partage ═════ */
        await t('partage .lcnda-panier : tout coché → ni vivant, ni confidentiel (fiche, événement, sa note, son média, une info de la fiche), ni la note d’un élément, ni lien javascript:', async () => {
            const all = secItems.map(x => x.id);
            const r = (await cx('pn_share_build', {basket_id: sec, include: all})); const s = JSON.stringify(r.share);
            for (const bad of ['PRIVATUS', 'VIVANTOS', 'Vivantus', 'Rendez-vous Zorglub', 'Métier Zorglub', 'Note de la fiche confidentielle', 'Métier secret', 'ZZNOTEZZ', 'javascript:', '<img', '<svg']) assert.ok(!s.includes(bad), `« ${bad} » est parti : ${s.slice(0, 400)}`);
            assert.ok(s.includes('Jean MAZAUD'), 'une fiche cochée (morte, pas confidentielle) part');
            assert.strictEqual(r.counts.blocked, 7, JSON.stringify(r.counts));
            assert.ok(!/"(ref_id|id|person_id)"/.test(s), 'aucun numéro de la base');
            const list = (await cx('pn_share_build', {basket_id: sec, list: 1})).rows;
            for (const ref of [900, 901, 9000, 9001, 9100, 9200]) assert.ok(list.find(x => secItems.find(i => i.id === x.id)?.ref_id === ref)?.blocked, 'bloqué : ' + ref);
        });
        await t('récupérer un .lcnda-panier piégé : HTML, javascript:, clés inconnues, trop gros, trop profond, mauvaise version → refusé ou mis en texte', async () => {
            const evil = {format: 'lcnda-panier', version: 1, name: XSS, icon: '<script>x</script>', items: [{kind: 'person', ref_id: 900, title: '<script>alert(1)</script>Titre', value: XSS, url: 'javascript:alert(1)', status: 'pirate',
                data: {url: 'javascript:x', onclick: 'x', rows: [['<b>a</b>']], __proto__x: 1}, source: '<iframe src=//evil>'}, {kind: 'set', title: 'ok', value: 'data:text/html,<script>'}]};
            const pv = (await cx('pn_share_preview', {body: JSON.stringify(evil)})); const s = JSON.stringify(pv);
            assert.ok(!/<script|<img|<iframe|javascript:|onclick/i.test(s), s);
            assert.strictEqual(pv.items[0].kind, 'datum', 'une « personne » venue d’ailleurs n’est pas une fiche'); assert.strictEqual(pv.items[0].ref_id, 0);
            assert.strictEqual(pv.items[0].status, '');
            for (const [body, re] of [[JSON.stringify({...evil, version: 2}), /n’est pas un panier/], ['x'.repeat(2000001), /trop gros/], [JSON.stringify({format: 'lcnda-panier', version: 1, items: Array(2001).fill({title: 'a'})}), /2 000 au plus/],
                ['{"format":"lcnda-panier","version":1,"items":' + '['.repeat(40) + ']'.repeat(40) + '}', /n’est pas un panier/], ['{"format":"autre","version":1,"items":[]}', /n’est pas un panier/]]) assert.match(await cxTry('pn_share_import', {body}), re);
            const im = (await cx('pn_share_import', {body: JSON.stringify(evil)})); const got = (await B.api('cx_basket', {basket_id: im.basket_id})).items;
            assert.ok(got.every(x => x.ref_id === 0 && !/javascript:/i.test(JSON.stringify(x))), JSON.stringify(got));
        });

        /* ═════ 7. formules, ↶, boucles ═════ */
        await t('export .xlsx d’un panier : « =HYPERLINK(…) » et « =SUM(…) » restent du texte (aucune formule <f>)', async () => {
            const xml = await p.evaluate(async id => {
                const its = (await window.LCNDA_APP.api('cx_basket', {basket_id: id})).items; const SH = window.LCNDA_SHEET;
                // le même chemin que app-paniers.js (exportSheet → toXlsx)
                const m = [['Titre', 'Détail'], ...its.map(it => [it.title, it.value || ''])].map(r => r.map(v => (typeof v === 'string' && /^\s*=/.test(v) ? "'" + v : v)));
                const wb = SH.newWorkbook(); wb.sheets[0].cells = SH.rowsToCells(m); const blob = await SH.toXlsx(wb); const z = await SH.unzip(new Uint8Array(await blob.arrayBuffer())); return z.text('xl/worksheets/sheet1.xml'); }, sec);
            assert.ok(!/<f>/.test(xml), xml.slice(0, 600)); assert.ok(xml.includes('=HYPERLINK('), 'le texte est gardé');
            const src = fs.readFileSync(path.join(root, 'assets/js/app-paniers.js'), 'utf8');
            assert.match(src, /rowsToCells\(matrix\(b\)\.map\(r => r\.map\(v => \(typeof v === 'string' && \/\^\\s\*=\/\.test\(v\) \? "'" \+ v : v\)\)\)\)/, 'app-paniers.js protège l’export');
            const csv = await p.evaluate(() => window.LCNDA_APP.csvSafe ? window.LCNDA_APP.csvSafe('=SUM(1;2)') : null); if (csv != null) assert.strictEqual(csv[0], "'");
        });
        await t('↶ historique : une ligne glissée par la page ne peut défaire que des opérations du panier (pas folder_delete, pas fetch_url, pas pn_share_send)', async () => {
            for (const op of ['folder_delete', 'fetch_url', 'pn_share_send', 'inv_receive', 'item_link_restore']) {
                const lid = (await cx('pn_log', {basket_id: sec, label: 'piège ' + op, undo: {op, body: {folder_id: fid.id, mode: 'all', url: 'http://127.0.0.1/'}}})).id;
                assert.match(await cxTry('pn_undo', {log_id: lid}), /Rien à défaire/, op);
            }
            assert.ok((await B.api('cx_basket', {all: 1})).folders.some(f => f.id === fid.id), 'le dossier est toujours là');
            assert.match(await cxTry('pn_undo', {log_id: -5}), /Rien à défaire/); assert.match(await cxTry('pn_undo', {log_id: '1 OR 1=1'}), /Rien à défaire/);
        });
        await t('dossiers : jamais de boucle, même par un ↶ rejoué avec des parents croisés ; numéros négatifs ou énormes refusés', async () => {
            const a = (await cx('folder_new', {name: 'Boucle A'})).id; const b = (await cx('folder_new', {name: 'Boucle B', parent_id: a})).id;
            const del = (await cx('folder_delete', {folder_id: a, mode: 'all'}));
            del.folders_removed = del.folders_removed.map(f => ({...f, parent_id: f.id === a ? b : a})); // A dans B, B dans A
            await cx('folder_undelete', del);
            const F = (await B.api('cx_basket', {all: 1})).folders, fa = F.find(f => f.id === a), fb = F.find(f => f.id === b);
            assert.ok(fa && fb, 'remis'); assert.ok(fa.parent_id === 0 || fb.parent_id === 0, 'la boucle est cassée : ' + JSON.stringify([fa, fb]));
            assert.ok(fa.depth < 5 && fb.depth < 5);
            assert.match(await cxTry('folder_move', {folder_id: a, parent_id: b}), fb.parent_id === a ? /lui-même/ : /./);
            assert.match(await cxTry('basket_move', {basket_id: sec, folder_id: -3}), /Dossier introuvable/);
            assert.match(await cxTry('basket_move', {basket_id: sec, folder_id: '9'.repeat(30)}), /Dossier introuvable|introuvable/);
            assert.match(await cxTry('item_set', {id: -1, note: 'x'}), /introuvable/);
            const add = (await cx('basket_add', {basket_id: -7, items: [{kind: 'pirate', title: 'Négatif', ref_id: -9}]}));
            const it = (await B.api('cx_basket', {basket_id: add.basket_id})).items.find(x => x.title === 'Négatif'); assert.strictEqual(it.kind, 'datum'); assert.strictEqual(it.ref_id, 0);
        });
        await t('pièces d’une piste : ↶ (item_link_restore) passe par les mêmes règles — un lien javascript: ne revient pas', async () => {
            await cx('item_link_restore', {rows: [{investigation_item_id: 1, entity_type: 'datum', entity_id: 0, label: 'Piège', value: 'v', data_json: '{"url":"x"}', origin_json: '{"url":"javascript:alert(1)","label":"L"}'}]});
            const l = (await B.api('cx_item_links', {item_id: 1})).links.find(x => x.label === 'Piège'); assert.ok(l, 'remis'); assert.ok(!l.origin?.url, JSON.stringify(l.origin));
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
