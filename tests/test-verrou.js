'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔐 B7 mot de passe d'une généalogie et 📜 B8 « Qui a vu quoi » (maquette docs/design/onglets-et-successoral-outils.html) :
 *     node tests/test-verrou.js      (captures : /tmp/claude-0/sp/succ/sec-*.png)
 *  0. sans serveur : les gardes sont posés sur chaque point d'entrée PHP, PHP n'écoute que 127.0.0.1, rien n'écrit dans
 *     access_log en dehors de lib/verrou.php, textes traduits ;
 *  1. le serveur (PHP réel) : poser / changer / retirer (jeton CSRF, ancien mot de passe, 8 à 1024 caractères, unicode,
 *     octet nul) ; TOUTES les actions d'api.php (extraites du code), upload.php, telecharger.php, les médias, index.php
 *     renvoient 423 sans rien de la base ; essais freinés (1 s, 2 s, 4 s…), compteur gardé après un redémarrage de PHP ;
 *     cookie HttpOnly + SameSite=Strict, identifiant changé à l'ouverture, l'ancien ne sert plus ; reverrouillage après le
 *     délai (horloge avancée), « Verrouiller maintenant », relance de l'app (GENEALOGY_BOOT_ID), changement de généalogie ;
 *     sauvegardes : jamais en clair hors du dossier, la sauvegarde complète chiffrée avec le même mot de passe ; tableau de
 *     bord des dossiers vu d'une autre généalogie : « verrouillée », rien lu ; mode consultation + verrou ; 📜 chaque action
 *     notée, aucune action pour modifier ou effacer, purge au-delà de la durée, rien de sensible ; le mot de passe n'est
 *     écrit nulle part (base, réglages, sessions, sauvegardes, exports, journal de PHP, navigateur, registre) ;
 *  2. le navigateur (Playwright) à 1440 px, 390 px et en sombre : écran de verrou (rien de la base), nom piégé jamais
 *     exécuté, ouverture, Réglages 🔐 et 📜, reverrouillage après le délai et « 🔐 Verrouiller maintenant » (la page est vidée).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs, PhpServer } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const UX = process.env.SHOTS || '/tmp/claude-0/sp/succ';
const XSS = '<img src=x onerror=window.__xss=1>';
const SQLI = "'; DROP TABLE persons; --";
const PW = 'Zèbre-Mazaud-1789-secret';         // le mot de passe cherché partout ensuite
const PW_TAIL = 'Mazaud-1789-secret';           // la partie en ASCII (attrape aussi les écritures échappées)
const PW2 = 'Nouveau-Lacombe-2026-secret';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
const finish = () => { if (failed) { console.error(`\n${failed} test(s) en échec`); process.exit(1); } console.log('\nTous les tests du verrou et du registre passent.'); process.exit(0); };

(async () => {
    /* ═════ 0. sans serveur ═════ */
    await t('gardes posés : api.php (avant le mode consultation), upload.php, index.php, telecharger.php, router.php (médias)', () => {
        const api = read('api.php');
        const g = api.indexOf('glock_guard('), k = api.indexOf('kiosk_guard((string) $action');
        assert.ok(g > 0 && k > g, 'glock_guard avant kiosk_guard');
        assert.ok(g < api.indexOf("$action === 'website_live_rev'") && g < api.indexOf("$action === 'genealogies'") && g < api.indexOf('$pdo = db();') && g < api.indexOf('sa_early('), 'avant toute lecture');
        const up = read('upload.php'); assert.ok(up.indexOf('glock_guard(') > 0 && up.indexOf('glock_guard(') < up.indexOf('db()'));
        const ix = read('index.php'); assert.ok(ix.indexOf('glock_request_blocked()') > 0 && ix.indexOf('glock_request_blocked()') < ix.indexOf('premier_db_ready'));
        assert.match(read('telecharger.php'), /glock_request_blocked\(\)/);
        const ro = read('router.php'); assert.ok(ro.indexOf('glock_request_blocked()') > 0 && ro.indexOf('glock_request_blocked()') < ro.indexOf('return router_serve_media'));
        // tous les fichiers PHP qu'on peut appeler : ceux de la racine (router.php refuse lib/, data/…) ; les deux pages de présentation n'ont aucun code PHP
        const roots = fs.readdirSync(appRoot).filter(f => f.endsWith('.php')).sort();
        assert.deepEqual(roots, ['api.php', 'carnet-numerique-des-ancetres-en.php', 'carnet-numerique-des-ancetres.php', 'index.php', 'router.php', 'telecharger.php', 'upload.php'], 'inventaire des points d’entrée à revoir');
        for (const f of ['carnet-numerique-des-ancetres.php', 'carnet-numerique-des-ancetres-en.php']) assert.doesNotMatch(read(f), /<\?(php|=)/, f);
        assert.match(ro, /\$blocked = \[[^\]]*'lib'[^\]]*'data'|'data', 'lib'/, 'router refuse lib/ et data/');
    });
    await t('empreinte : Argon2id (sinon bcrypt coût 12), SHA-384 avant (1024 caractères, octet nul), password_verify ; jamais de mot de passe dans un message ni un journal', () => {
        const v = read('lib/verrou.php');
        assert.match(v, /PASSWORD_ARGON2ID/); assert.match(v, /PASSWORD_BCRYPT, \['cost' => 12\]/); assert.match(v, /password_verify\(glock_prehash/);
        assert.doesNotMatch(v, /error_log\([^;]*\$pw/); assert.doesNotMatch(v, /error_log\([^;]*password/i);
        assert.doesNotMatch(v, /\$_SESSION\[[^\]]*\]\s*=\s*\$pw|'password' => \$pw/);
    });
    await t('📜 access_log : seul lib/verrou.php l’écrit ; un seul DELETE (la purge), aucun UPDATE', () => {
        const files = ['api.php', 'upload.php', 'index.php', ...fs.readdirSync(path.join(appRoot, 'lib')).filter(f => f.endsWith('.php')).map(f => 'lib/' + f)];
        let deletes = 0;
        for (const f of files) {
            const s = read(f);
            assert.doesNotMatch(s, /UPDATE\s+access_log/i, f);
            const ins = (s.match(/INSERT[^;]*access_log/gi) || []).length; if (f !== 'lib/verrou.php') assert.equal(ins, 0, f);
            deletes += (s.match(/DELETE\s+FROM\s+access_log/gi) || []).length;
        }
        assert.equal(deletes, 1, 'seulement access_log_purge');
        assert.match(read('lib/verrou.php'), /function access_log_purge[\s\S]*DELETE FROM access_log WHERE at < \?/);
    });
    await t('Electron : PHP et le relais n’écoutent que 127.0.0.1 ; un nouveau GENEALOGY_BOOT_ID à chaque lancement', () => {
        const ps = read('electron/php-server.js');
        assert.match(ps, /'-S', `127\.0\.0\.1:\$\{b\.port\}`/); assert.match(ps, /server\.listen\(this\.port, '127\.0\.0\.1'/);
        assert.doesNotMatch(ps, /0\.0\.0\.0|'::'|listen\(\s*this\.port\s*\)/);
        assert.match(ps, /GENEALOGY_BOOT_ID: this\.bootId/); assert.match(ps, /this\.bootId = crypto\.randomBytes/);
    });
    await t('textes : FAQ (2 questions), traductions présentes dans les 31 langues pour les phrases du verrou', () => {
        const faq = read('assets/js/heritage-more.js'); assert.match(faq, /Que protège le mot de passe d’une généalogie \?/); assert.match(faq, /Qui a vu mes dossiers \?/);
        for (const l of ['en', 'de', 'ru', 'bg', 'id', 'mt']) { const j = JSON.parse(read(`assets/i18n/${l}.json`)); for (const k of ['« {name} » est verrouillée', 'Mot de passe incorrect.', 'Qui a vu quoi', 'Verrouiller maintenant']) assert.ok(j[k] || (j.strings && j.strings[k]), `${l} : ${k}`); }
    });

    /* ═════ 1. le serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-verrou-'));
    const dir = path.join(tmp, 'data'), mediaDir = path.join(dir, 'media'), sessDir = path.join(tmp, 'sessions'), clock = path.join(tmp, 'clock.txt'), logFile = path.join(tmp, 'php.log');
    fs.mkdirSync(mediaDir, { recursive: true }); fs.mkdirSync(sessDir, { recursive: true }); fs.writeFileSync(clock, '0');
    const baseEnv = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: mediaDir, GENEALOGY_SESSION_DIR: sessDir, GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_MACHINE_NAME: 'PC-Bureau', LCNDA_TEST_CLOCK_FILE: clock, GENEALOGY_TEST: '1', GENEALOGY_LOCAL_SECRET: 'secret-local-essai' };
    const advance = s => fs.writeFileSync(clock, String(Number(fs.readFileSync(clock, 'utf8')) + s));
    const php = (code, env = baseEnv) => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; ${code}`], { cwd: appRoot, encoding: 'utf8', env });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(?,?,?,?,?)');
foreach ([[1,'Jean','MAZAUD','male','deceased'],[10,'Paul','MAZAUD','male','deceased'],[13,'André','MAZAUD','male','living'],[20,'Jeanne','LACOMBE','female','living'],[22,'Sylvie','ROUSSILHE','female','living'],[23,'<img src=x onerror=window.__xss=1>','PIÈGE','female','living']] as $r) { $ins->execute($r); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(100,1,null)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(100,10),(100,13)");
$pdo->prepare('INSERT INTO living_contacts(person_id,first_name,last_name,address,postal_code,city) VALUES(?,?,?,?,?,?)')->execute([13,'André','MAZAUD','12 rue des Écoles','87000','Limoges']);
$pdo->prepare("INSERT INTO media(id,filename,title,media_type) VALUES(1,'photo-mazaud.jpg','Photo MAZAUD','image')")->execute();
file_put_contents(MEDIA_DIR.'/photo-mazaud.jpg', base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z'));
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: baseEnv });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }

    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.PORT) || await freePort();
    const base = `http://127.0.0.1:${port}/`;
    let proc = null;
    const startServer = async (extra = {}) => {
        const log = fs.openSync(logFile, 'a');
        proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'display_errors=0', '-d', 'log_errors=1', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...baseEnv, GENEALOGY_BOOT_ID: 'boot-1', ...extra }, stdio: ['ignore', log, log] });
        for (let i = 0; i < 100; i++) { try { await fetch(base + '__health'); return; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        throw new Error('le serveur PHP ne démarre pas');
    };
    const stopServer = async () => { if (!proc) return; const p = proc; proc = null; await new Promise(r => { p.once('exit', r); p.kill('SIGTERM'); setTimeout(() => { try { p.kill('SIGKILL'); } catch (_) {} }, 2000); }); };
    await startServer();

    /** une séance : son cookie (mis à jour à chaque Set-Cookie) et son jeton CSRF (celui de la page) */
    class Sess {
        constructor() { this.cookie = ''; this.csrf = ''; this.cookies = []; }
        take(r) { const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean); for (const c of sc) { this.cookies.push(c); const kv = c.split(';')[0]; if (kv.startsWith('PHPSESSID=')) this.cookie = kv; } }
        async req(p, { method = 'GET', body = null, headers = {}, form = null } = {}) {
            const h = { ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers };
            let b = null;
            if (form) { b = form; } else if (body !== null) { h['Content-Type'] = 'application/json'; b = typeof body === 'string' ? body : JSON.stringify(body); }
            const r = await fetch(base + p, { method, headers: h, body: b, redirect: 'manual' });
            this.take(r);
            const buf = Buffer.from(await r.arrayBuffer()); const text = buf.toString('utf8');
            let json = null; try { json = JSON.parse(text); } catch (_) {}
            return { status: r.status, headers: r.headers, text, json, buf };
        }
        async init() { const r = await this.req(''); const m = r.text.match(/window\.INSTALL_CSRF = ("[^"]*")/); this.csrf = m ? JSON.parse(m[1]) : ''; return r; }
        get(action, q = {}) { return this.req(`api.php?action=${action}&${new URLSearchParams(q)}`); }
        post(action, body = {}, { csrf = true, token = null } = {}) { const tk = token ?? this.csrf; return this.req(`api.php?action=${action}`, { method: 'POST', body: csrf ? { ...body, csrf: tk } : body, headers: csrf ? { 'X-CSRF-Token': tk } : {} }); }
    }
    const SECRETS = /MAZAUD|LACOMBE|ROUSSILHE|Paul|André|Limoges|rue des Écoles|PIÈGE|onerror|photo-mazaud|2026-014|Succession de/;
    const owner = new Sess(); await owner.init();
    let other = '', caseId = 0;
    try {
        await t('poser : jeton CSRF absent ou faux → refusé (419), trop court, pas pareil, sans « j’ai compris », 1025 caractères → 422', async () => {
            assert.equal((await owner.post('glock_set', { password: PW, password2: PW, ack: 1 }, { csrf: false })).status, 419);
            assert.equal((await owner.post('glock_set', { password: PW, password2: PW, ack: 1 }, { token: 'faux' })).status, 419);
            assert.equal((await owner.post('glock_set', { password: 'court7!', password2: 'court7!', ack: 1 })).status, 422);
            assert.equal((await owner.post('glock_set', { password: PW, password2: PW + 'x', ack: 1 })).status, 422);
            assert.equal((await owner.post('glock_set', { password: PW, password2: PW })).status, 422);
            const long = 'é'.repeat(1025); assert.equal((await owner.post('glock_set', { password: long, password2: long, ack: 1 })).status, 422);
            assert.equal((await owner.post('glock_set', { password: PW, password2: PW, ack: 1, minutes: 7 })).status, 422, 'délai inconnu');
            assert.equal((await owner.get('glock_state')).json.locked, false);
        });
        await t('serveur : un dossier de succession dans la généalogie (pour le registre et le tableau de bord)', async () => {
            const r = await owner.post('successoral_write', { op: 'save', deceased_id: 10, number: '2026-014', notary_text: 'Me VIALLE' });
            assert.equal(r.status, 200, r.text); caseId = r.json.result.id;
            const g = await owner.post('genealogy_create', { name: '⚖️ Dossiers à part' }); assert.equal(g.status, 200, g.text); other = g.json.id;
            const init = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; $p = new PDO('sqlite:' . genealogy_dir(${JSON.stringify(other)}) . '/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT . '/data/schema.sql')); $p->exec("INSERT INTO persons(first_name,last_name) VALUES('Autre','PERSONNE')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: baseEnv });
            assert.match(init.stdout, /ok/, init.stderr);
        });
        await t('poser : 🔐 posé, empreinte Argon2id (ou bcrypt 12) dans la base ET dans verrou.json, jamais le mot de passe ; la séance qui le pose reste ouverte', async () => {
            const r = await owner.post('glock_set', { password: PW, password2: PW, ack: 1, minutes: 15 });
            assert.equal(r.status, 200, r.text); assert.equal(r.json.locked, true);
            const row = JSON.parse(php(`echo json_encode(db()->query('SELECT hash, lock_id, minutes FROM app_lock')->fetchAll());`).stdout);
            assert.equal(row.length, 1); assert.match(row[0].hash, /^\$argon2id\$|^\$2y\$12\$/); assert.equal(row[0].minutes, 15);
            const mark = JSON.parse(fs.readFileSync(path.join(dir, 'verrou.json'), 'utf8')); assert.equal(mark.hash, row[0].hash); assert.equal(mark.lock_id, row[0].lock_id);
            assert.ok(!JSON.stringify(mark).includes(PW_TAIL));
            assert.equal((await owner.get('people')).status, 200, 'la séance qui pose le mot de passe reste ouverte');
            assert.equal((await owner.post('glock_set', { password: PW2, password2: PW2, ack: 1 })).status, 422, 'déjà posé : changer plutôt');
        });

        // ── toutes les actions d'api.php, sans la séance ──
        const acts = JSON.parse(php(String.raw`
$src = file_get_contents('api.php'); $acts = [];
preg_match_all("/\\\$action\s*===\s*'([a-z0-9_]+)'/", $src, $m); foreach ($m[1] as $a) { $acts[$a] = 1; }
preg_match_all("/in_array\(\s*\\\$action\s*,\s*\[([^\]]*)\]/", $src, $m); foreach ($m[1] as $l) { preg_match_all("/'([a-z0-9_]+)'/", $l, $mm); foreach ($mm[1] as $a) { $acts[$a] = 1; } }
preg_match_all("/in_array\(\s*\\\$action\s*,\s*([A-Z0-9_]+)\s*,/", $src, $m); foreach (array_unique($m[1]) as $c) { if (defined($c)) { foreach (constant($c) as $a) { $acts[$a] = 1; } } }
preg_match_all("/case\s+'([a-z0-9_]+)'\s*:/", $src, $m); foreach ($m[1] as $a) { $acts[$a] = 1; }
$off = 0; while (($p = strpos($src, 'match ($action)', $off)) !== false) { $b = strpos($src, '{', $p); $d = 0; for ($i = $b; $i < strlen($src); $i++) { if ($src[$i] === '{') { $d++; } elseif ($src[$i] === '}') { $d--; if (!$d) { break; } } }
  preg_match_all("/^\s*((?:'[a-z0-9_]+'\s*,\s*)*'[a-z0-9_]+')\s*=>/m", substr($src, $b, $i - $b), $mm); foreach ($mm[1] as $k) { preg_match_all("/'([a-z0-9_]+)'/", $k, $kk); foreach ($kk[1] as $a) { $acts[$a] = 1; } } $off = $i; }
foreach (['sd_status', 'sd_auto', 'sd_setup', 'sd_sync', 'sd_undo', 'meteo_pack_import', 'meteo_pack_remove', 'access_log', 'access_log_csv', 'access_log_settings', 'access_note', 'glock_set', 'glock_change', 'glock_remove', 'glock_minutes', 'upload', 'nexistepas'] as $a) { $acts[$a] = 1; }
echo json_encode(array_keys($acts));`).stdout);
        const ALLOWED = { glock_state: 'state', genealogies: 'list', glock_unlock: 'unlock', glock_lock_now: 'lock', genealogy_switch: 'switch', schema_status: 'schema' };
        await t(`toutes les actions d’api.php (${acts.length}, lues dans le code) en GET et en POST : 423 sans rien de la base ; seule la liste blanche répond`, async () => {
            assert.ok(acts.length > 800, 'actions trouvées : ' + acts.length);
            const s = new Sess(); const page = await s.init();
            assert.equal(page.status, 200); assert.doesNotMatch(page.text, SECRETS, 'écran de verrou : rien de la base');
            const odd = [];
            for (const a of acts) {
                for (const method of ['GET', 'POST']) {
                    if (ALLOWED[a] && (a !== 'genealogy_switch' || method === 'POST')) continue;
                    const r = method === 'GET' ? await s.get(a, { id: 1, person_id: 10, case_id: caseId, op: 'get' }) : await s.post(a, { id: 1, person_id: 10, case_id: caseId, op: 'get', password: 'x', set: { 'genealogie-x': '1' } });
                    if (r.status !== 423 || r.headers.get('x-lcnda-glock') !== '1' || (a !== 'desk_widget_page' && (!r.json || r.json.glock !== true))) odd.push(`${method} ${a} → ${r.status}`);
                    if (SECRETS.test(r.text)) odd.push(`${method} ${a} : donnée visible`);
                }
            }
            assert.deepEqual(odd, []);
            // la liste blanche : rien de la base non plus
            const st = await s.get('glock_state'); assert.deepEqual(Object.keys(st.json).sort(), ['genealogy', 'locked', 'name', 'unlocked', 'wait', 'zip_aes']); assert.equal(st.json.unlocked, false);
            const gl = await s.get('genealogies'); assert.equal(gl.json.locked_view, true); assert.ok(gl.json.genealogies.every(g => Object.keys(g).sort().join() === 'active,id,locked,main,name'), 'les noms seulement');
            const sc = await s.get('schema_status'); assert.deepEqual(Object.keys(sc.json).sort(), ['expected', 'version']);
            assert.doesNotMatch(gl.text + st.text + sc.text, SECRETS);
            // un nom d'action qui n'est pas une chaîne
            assert.equal((await s.req('api.php?action[]=people')).status, 423);
        });
        await t('les autres points d’entrée : upload.php, telecharger.php, médias (/media/…), index.php → refusés sans rien de la base', async () => {
            const s = new Sess(); await s.init();
            const fd = new FormData(); fd.append('csrf', s.csrf); fd.append('person_id', '10'); fd.append('files', new Blob([Buffer.from('xx')], { type: 'image/jpeg' }), 'a.jpg');
            const up = await s.req('upload.php', { method: 'POST', form: fd }); assert.equal(up.status, 423); assert.equal(up.json.glock, true);
            const dl = await s.req('telecharger.php'); assert.equal(dl.status, 423); assert.doesNotMatch(dl.text, SECRETS);
            const m = await s.req('media/photo-mazaud.jpg'); assert.equal(m.status, 423); assert.equal(m.buf.length < 40, true); assert.equal(m.headers.get('x-lcnda-glock'), '1');
            const m2 = await owner.req('media/photo-mazaud.jpg'); assert.equal(m2.status, 200, 'séance ouverte : le média passe'); assert.equal(m2.headers.get('content-type'), 'image/jpeg');
            const ix = await s.req(''); assert.match(ix.text, /est verrouillée/); assert.doesNotMatch(ix.text, /LCNDA_SETTINGS|LCNDA_GRAPHS|app\.js/); assert.equal(ix.headers.get('cache-control'), 'no-store, private');
            const live = await s.req('api.php?action=website_live&token=' + 'a'.repeat(32)); assert.equal(live.status, 423, 'aperçu en direct');
        });

        await t('mauvais mot de passe : refus (401, toujours la même phrase), délai 1 s, 2 s, 4 s ; trop tôt → 429 sans vérifier ; chaque essai noté', async () => {
            const s = new Sess(); await s.init();
            const waits = [];
            for (let i = 0; i < 3; i++) {
                const r = await s.post('glock_unlock', { password: 'mauvais-' + i });
                assert.equal(r.status, 401); assert.equal(r.json.error, 'Mot de passe incorrect.'); waits.push(r.json.wait);
                if (i < 2) advance(r.json.wait);
            }
            assert.deepEqual(waits, [1, 2, 4]);
            const early = await s.post('glock_unlock', { password: PW }); assert.equal(early.status, 429, 'même le bon mot de passe attend'); assert.ok(early.json.wait >= 3);
            assert.ok(Number(early.headers.get('retry-after')) >= 3);
            const st = await s.get('glock_state'); assert.ok(st.json.wait >= 3);
            const fails = JSON.parse(php(`echo json_encode(db()->query("SELECT kind, what, machine, obj_label FROM access_log WHERE kind='unlock_fail'")->fetchAll());`).stdout);
            assert.equal(fails.length, 3, 'chaque essai vérifié est noté (pas ceux faits trop tôt)'); assert.ok(fails.every(f => f.machine === 'PC-Bureau' && f.what === 'open' && f.obj_label === ''));
        });
        await t('compteur gardé sur le disque : après un redémarrage de PHP, le délai est toujours là ; puis le bon mot de passe ouvre et remet à zéro', async () => {
            const s = new Sess(); await s.init();
            await s.post('glock_unlock', { password: 'mauvais-3' }).then(r => assert.ok([401, 429].includes(r.status)));
            await stopServer(); await startServer();
            const s2 = new Sess(); await s2.init();
            const r = await s2.post('glock_unlock', { password: PW }); assert.equal(r.status, 429, 'toujours freiné après le redémarrage');
            const tries = JSON.parse(fs.readFileSync(path.join(dir, 'verrou-essais.json'), 'utf8')); assert.ok(tries.fails >= 3);
            advance(61);
            const ok = await s2.post('glock_unlock', { password: PW }); assert.equal(ok.status, 200, ok.text);
            assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'verrou-essais.json'), 'utf8')).fails, 0);
        });
        await t('CSRF : déverrouiller, verrouiller, changer, retirer sans jeton ou avec un faux → 419 (et pas compté comme un essai)', async () => {
            const s = new Sess(); await s.init();
            const before = fs.readFileSync(path.join(dir, 'verrou-essais.json'), 'utf8');
            for (const a of ['glock_unlock', 'glock_lock_now', 'glock_touch', 'glock_change', 'glock_remove', 'glock_minutes']) {
                assert.equal((await s.post(a, { password: PW, old: PW, password2: PW }, { csrf: false })).status, a.startsWith('glock_change') || a === 'glock_remove' || a === 'glock_minutes' ? 423 : 419, a + ' sans jeton');
                assert.equal((await s.post(a, { password: PW, old: PW }, { token: 'a'.repeat(48) })).status, a.startsWith('glock_change') || a === 'glock_remove' || a === 'glock_minutes' ? 423 : 419, a + ' faux jeton');
            }
            // séance ouverte : changer / retirer avec un faux jeton → 419
            for (const a of ['glock_change', 'glock_remove', 'glock_minutes', 'glock_set']) assert.equal((await owner.post(a, { old: PW, password: PW2, password2: PW2 }, { token: 'b'.repeat(48) })).status, 419, a);
            assert.equal(fs.readFileSync(path.join(dir, 'verrou-essais.json'), 'utf8'), before, 'aucun essai compté');
        });
        await t('changer ou retirer sans l’ancien mot de passe, ou avec un faux → refusé ; le verrou reste', async () => {
            const s = new Sess(); await s.init(); advance(61); assert.equal((await s.post('glock_unlock', { password: PW })).status, 200);
            for (const [a, body] of [['glock_change', { password: PW2, password2: PW2 }], ['glock_remove', {}], ['glock_minutes', { minutes: 0 }], ['glock_change', { old: 'faux-faux-faux', password: PW2, password2: PW2 }], ['glock_remove', { old: PW + ' ' }]]) {
                advance(61); const r = await s.post(a, body); assert.equal(r.status, 401, `${a} ${JSON.stringify(body)} : ${r.status}`); assert.equal(r.json.error, 'Mot de passe incorrect.');
            }
            advance(61);
            assert.equal(JSON.parse(php(`echo json_encode(glock_info()['locked']);`).stdout), true);
        });
        await t('cookie HttpOnly + SameSite=Strict ; l’identifiant change à l’ouverture ; l’ancien ne sert plus', async () => {
            const s = new Sess(); await s.init();
            const c0 = s.cookies.find(c => c.startsWith('PHPSESSID')); assert.match(c0, /HttpOnly/i); assert.match(c0, /SameSite=Strict/i); assert.match(c0, /path=\//i);
            const oldCookie = s.cookie;
            advance(61); const r = await s.post('glock_unlock', { password: PW }); assert.equal(r.status, 200);
            assert.notEqual(s.cookie, oldCookie, 'nouvel identifiant'); assert.match(s.cookies[s.cookies.length - 1], /HttpOnly/i); assert.match(s.cookies[s.cookies.length - 1], /SameSite=Strict/i);
            assert.equal((await s.get('people')).status, 200);
            const oldS = new Sess(); oldS.cookie = oldCookie; const o = await oldS.get('people'); assert.equal(o.status, 423, 'ancien identifiant : verrouillé'); assert.notEqual(oldS.cookie, oldCookie, 'identifiant inconnu refusé (mode strict)');
            assert.ok(!fs.existsSync(path.join(sessDir, 'sess_' + decodeURIComponent(oldCookie.split('=')[1]))), 'l’ancienne session est effacée');
        });
        await t('reverrouillage : après 15 min sans geste (horloge avancée), noté une fois ; un geste (glock_touch) repousse ; « Verrouiller maintenant » ; relance de l’app', async () => {
            const s = new Sess(); await s.init(); advance(61); assert.equal((await s.post('glock_unlock', { password: PW })).status, 200);
            advance(10 * 60); assert.equal((await s.post('glock_touch', {})).status, 200);
            advance(10 * 60); assert.equal((await s.get('people')).status, 200, 'le geste a repoussé le délai');
            const bg = await s.get('due_reminders'); assert.equal(bg.status, 200);
            advance(16 * 60);
            const r = await s.get('people'); assert.equal(r.status, 423); assert.doesNotMatch(r.text, SECRETS);
            assert.equal((await s.get('people')).status, 423);
            assert.equal(Number(php(`echo db()->query("SELECT count(*) FROM access_log WHERE kind='lock_idle'")->fetchColumn();`).stdout), 1, 'noté une fois');
            assert.equal((await s.post('glock_touch', {})).status, 423, 'un geste ne rouvre pas');
            advance(61); assert.equal((await s.post('glock_unlock', { password: PW })).status, 200);
            const now = await s.post('glock_lock_now', {}); assert.equal(now.status, 200);
            for (const a of ['people', 'person', 'dashboard', 'successoral']) assert.equal((await s.get(a, { id: 10, op: 'list' })).status, 423, a);
            // relance de l'app : un autre GENEALOGY_BOOT_ID
            advance(61); assert.equal((await s.post('glock_unlock', { password: PW })).status, 200);
            await stopServer(); await startServer({ GENEALOGY_BOOT_ID: 'boot-2' });
            assert.equal((await s.get('people')).status, 423, 'l’app relancée : verrouillée');
            assert.equal((await owner.get('people')).status, 423, 'aussi la séance qui l’avait posé');
            advance(61); assert.equal((await owner.post('glock_unlock', { password: PW })).status, 200);
        });
        await t('changer de généalogie : celle qu’on quitte ne reste pas ouverte ; on peut quitter l’écran de verrou vers une autre', async () => {
            const s = new Sess(); await s.init(); advance(61); assert.equal((await s.post('glock_unlock', { password: PW })).status, 200);
            assert.equal((await s.post('genealogy_switch', { id: other })).status, 200);
            await s.init(); assert.equal((await s.get('people')).status, 200, 'l’autre (sans mot de passe) s’ouvre');
            assert.equal((await s.post('genealogy_switch', { id: '' })).status, 200);
            await s.init(); assert.equal((await s.get('people')).status, 423, 'revenir : il faut le mot de passe');
            // depuis l'écran de verrou : changer de généalogie (et rien d'autre)
            assert.equal((await s.post('genealogy_switch', { id: other }, { csrf: false })).status, 419);
            assert.equal((await s.post('genealogy_rename', { id: '', name: 'x' })).status, 423);
            assert.equal((await s.post('genealogy_switch', { id: other })).status, 200);
            await s.init(); assert.equal((await s.get('people')).status, 200);
            await s.post('genealogy_switch', { id: '' }); await owner.init(); advance(61); assert.equal((await owner.post('glock_unlock', { password: PW })).status, 200);
        });
        await t('tableau de bord des dossiers depuis une autre généalogie : « 🔐 verrouillée », rien lu (ni n°, ni défunt, ni échéance) ; aucune lecture croisée', async () => {
            const s = new Sess(); await s.init();
            assert.equal((await s.post('genealogy_switch', { id: other })).status, 200); await s.init();
            const idx = await s.get('successoral', { op: 'index' }); assert.equal(idx.status, 200, idx.text);
            const main = idx.json.bases.find(b => b.id === ''); assert.equal(main.locked, true); assert.deepEqual(main.cases, []); assert.equal(main.error, false);
            assert.doesNotMatch(idx.text, /2026-014|MAZAUD|VIALLE/);
            const gl = await s.get('genealogies'); assert.equal(gl.json.genealogies.find(g => g.id === '').locked, true);
            const op = await s.get('successoral', { op: 'other_people', from: '', q: 'MAZ' }); assert.doesNotMatch(op.text, /MAZAUD/);
            const dm = await s.post('successoral_write', { op: 'due_mark', gid: '', kind: 'deadline', id: 1, act: 'done' }); assert.equal(dm.status, 422); assert.match(dm.json.error, /verrouillée|introuvable/);
            await s.post('genealogy_switch', { id: '' });
        });
        await t('sauvegardes : ni .db téléchargé, ni copie dans un dossier choisi, ni copie hors de l’ordinateur, ni dossier partagé ; les copies à côté de la base restent permises', async () => {
            await owner.init();
            assert.equal((await owner.get('export_sqlite')).status, 423);
            assert.equal((await owner.post('backup_sqlite', { dir: path.join(tmp, 'cle'), mode: 'manual' })).status, 423);
            assert.ok(!fs.existsSync(path.join(tmp, 'cle')) || !fs.readdirSync(path.join(tmp, 'cle')).length);
            assert.equal((await owner.post('offsite_copy_now', {})).status, 423);
            assert.equal((await owner.post('sd_setup', { dir: path.join(tmp, 'dropbox') })).status, 423);
            const local = await owner.post('backup_sqlite', { mode: 'manual' }); assert.equal(local.status, 200, local.text);
            assert.equal((await owner.get('export_full_backup')).status, 422, 'sans mot de passe : refusée');
        });
        await t('sauvegarde complète : forcément chiffrée (AES-256) avec le mot de passe de la généalogie ; un autre mot de passe est refusé', async () => {
            assert.equal((await owner.post('export_full_backup', {})).status, 422);
            advance(61); const bad = await owner.post('export_full_backup', { password: 'un-autre-mot-de-passe' }); assert.equal(bad.status, 401);
            advance(61); const r = await owner.post('export_full_backup', { password: PW }); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/zip');
            const zp = path.join(tmp, 'sauvegarde.zip'); fs.writeFileSync(zp, r.buf);
            const chk = JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$z = new ZipArchive(); $z->open(${JSON.stringify(zp)}); $o = [];
                for ($i = 0; $i < $z->numFiles; $i++) { $s = $z->statIndex($i); $o[$s['name']] = $s['encryption_method']; }
                $plain = @$z->getFromName('genealogie.db'); $z->setPassword(${JSON.stringify(PW)}); $ok = $z->getFromName('genealogie.db');
                echo json_encode(['enc' => $o, 'plain' => $plain !== false && $plain !== '', 'ok' => $ok !== false && str_starts_with($ok, 'SQLite format 3')]);`], { encoding: 'utf8' }).stdout);
            assert.equal(chk.enc['genealogie.db'], 259, 'AES-256 (ZipArchive::EM_AES_256)'); assert.equal(chk.enc['media/photo-mazaud.jpg'], 259);
            assert.equal(chk.plain, false, 'illisible sans le mot de passe'); assert.equal(chk.ok, true, 'lisible avec');
            assert.ok(!r.buf.includes(Buffer.from('MAZAUD')), 'pas de nom en clair dans l’archive');
        });
        await t('🗓 sauvegarde automatique dans un dossier choisi : la généalogie protégée n’y est jamais copiée en clair ; une copie chiffrée y est faite à l’ouverture', async () => {
            const usb = path.join(tmp, 'usb'); fs.mkdirSync(usb);
            assert.equal((await owner.post('autobackup_settings', { dir: usb, freq: 'day', keep: 5 })).status, 200);
            const now = await owner.post('autobackup_now', {}); assert.equal(now.status, 200, now.text);
            assert.ok((now.json.locked || []).length >= 1, 'notée « verrouillée »');
            const all = d => fs.readdirSync(d, { recursive: true }).map(String);
            assert.ok(!all(usb).some(f => /\.db$/.test(f)), 'aucune base en clair : ' + all(usb).join(','));
            const s = new Sess(); await s.init(); advance(61);
            const u = await s.post('glock_unlock', { password: PW }); assert.equal(u.status, 200); assert.equal(u.json.backup.ok, true, JSON.stringify(u.json));
            const zips = all(usb).filter(f => /genealogie-protegee-.*\.zip$/.test(f)); assert.equal(zips.length, 1);
            const enc = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$z = new ZipArchive(); $z->open(${JSON.stringify(path.join(usb, zips[0]))}); echo $z->statName('genealogie.db')['encryption_method'];`], { encoding: 'utf8' }).stdout;
            assert.equal(enc, '259');
            assert.equal((await owner.post('autobackup_settings', { dir: '', freq: 'off' })).status, 200);
        });
        await t('injection : mots de passe piégés (HTML, SQL, 1024 caractères, unicode, octet nul) posés puis ouverts ; 1023 + 1 octet nul ; jamais exécutés', async () => {
            for (const pw of [XSS, SQLI, 'ü'.repeat(1024), '🔐日本語パスワード-Ωμέγα', 'avec\u0000nul-octet', 'x'.repeat(100) + 'y']) {
                advance(61); assert.equal((await owner.post('glock_change', { old: PW, password: pw, password2: pw })).status, 200, JSON.stringify(pw.slice(0, 20)));
                const s = new Sess(); await s.init(); advance(61);
                assert.equal((await s.post('glock_unlock', { password: pw.slice(0, -1) })).status, 401, 'pas tronqué'); advance(61);
                if (pw.includes('\u0000')) { advance(61); assert.equal((await s.post('glock_unlock', { password: pw.split('\u0000')[0] })).status, 401, 'octet nul compté'); advance(61); }
                assert.equal((await s.post('glock_unlock', { password: pw })).status, 200);
                advance(61); assert.equal((await owner.post('glock_unlock', { password: pw })).status, 200);
                advance(61); assert.equal((await owner.post('glock_change', { old: pw, password: PW, password2: PW })).status, 200);
            }
            assert.equal(Number(php(`echo db()->query('SELECT count(*) FROM persons')->fetchColumn();`).stdout), 6, 'la table persons est toujours là');
        });
        await t('📜 registre : ouverture de dossier (une fois par séance), impression, export, courriers en série, verrou ; rien de sensible', async () => {
            await owner.get('successoral', { op: 'get', id: caseId }); await owner.get('successoral', { op: 'get', id: caseId });
            assert.equal((await owner.post('successoral_write', { op: 'journal', case_id: caseId, kind: 'pdf', text: 'Tableau pour le notaire : PDF, 12 rue des Écoles' })).status, 200);
            assert.equal((await owner.post('successoral_write', { op: 'file_letters', case_id: caseId, kind: 'relance', objet: 'Relance', date_envoi: '2026-11-20', letters: [{ person_id: 13, letter: 'Monsieur,', recipient_address: '12 rue des Écoles' }] })).status, 200);
            assert.equal((await owner.get('export_gedcom')).status, 200);
            assert.equal((await owner.post('access_note', { what: 'dashboard_csv', n: '<b>6</b>' })).status, 200);
            assert.equal((await owner.post('access_note', { what: XSS })).status, 422);
            const rows = (await owner.get('access_log')).json.rows;
            const kinds = rows.map(r => r.kind);
            for (const k of ['case_open', 'print', 'letters', 'export', 'unlock_ok', 'unlock_fail', 'lock_set', 'lock_change', 'lock_now', 'lock_idle']) assert.ok(kinds.includes(k), k);
            assert.equal(rows.filter(r => r.kind === 'case_open' && r.obj_id === caseId).length >= 1, true);
            const opens = rows.filter(r => r.kind === 'case_open'); assert.equal(new Set(opens.map(r => r.id)).size, opens.length);
            const caseRow = rows.find(r => r.kind === 'print'); assert.equal(caseRow.obj_type, 'case'); assert.match(caseRow.obj_label, /^2026-014/); assert.equal(caseRow.what, 'succ_pdf', 'jamais le texte venu de la page');
            assert.ok(rows.some(r => r.kind === 'export' && r.what === 'gedcom')); assert.ok(rows.some(r => r.what === 'dashboard_csv|0' || r.what === 'dashboard_csv|6'));
            assert.ok(rows.every(r => r.machine === 'PC-Bureau'));
            const all = JSON.stringify(rows); assert.doesNotMatch(all, /rue des Écoles|Limoges|87000|€|Monsieur/); assert.ok(!all.includes(PW_TAIL));
            // ouverture : une seule fois par séance
            const n1 = rows.filter(r => r.kind === 'case_open').length; await owner.get('successoral', { op: 'get', id: caseId });
            assert.equal((await owner.get('access_log')).json.rows.filter(r => r.kind === 'case_open').length, n1);
            // le CSV du registre est noté dans le registre
            const csv = await owner.get('access_log_csv'); assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/); assert.match(csv.text, /Date;Sorte;Objet/);
            assert.ok((await owner.get('access_log')).json.rows.some(r => r.kind === 'export' && r.what === 'access_csv'));
            const forCase = (await owner.get('access_log', { case_id: caseId })).json.rows; assert.ok(forCase.length >= 3 && forCase.every(r => r.obj_type === 'case' && r.obj_id === caseId));
        });
        await t('📜 aucune action pour modifier ou effacer une ligne ; save_settings ne touche pas la durée ; la purge (> 12 mois) est notée', async () => {
            const count = () => Number(php(`echo db()->query('SELECT count(*) FROM access_log')->fetchColumn();`).stdout);
            const n0 = count();
            for (const a of ['access_log_delete', 'access_log_write', 'access_log_update', 'access_log_clear', 'access_delete', 'access_log_purge', 'delete_access_log']) {
                const r = await owner.post(a, { id: 1, ids: [1], all: 1 }); assert.notEqual(r.status, 200, a + ' : ' + r.status);
            }
            assert.ok(!acts.some(a => /access|registre/.test(a) && !['access_log', 'access_log_csv', 'access_log_settings', 'access_note'].includes(a)), 'aucune autre action du registre dans api.php');
            assert.equal((await owner.post('save_settings', { set: { 'lcnda-qui-a-vu': JSON.stringify({ months: 3 }) } })).json.saved, 0);
            assert.equal(count() >= n0, true);
            php(`db()->prepare("INSERT INTO access_log(at, kind, what, machine) VALUES(?, 'export', 'gedcom', 'vieux-poste')")->execute([date('Y-m-d H:i:s', strtotime('-13 months'))]); db()->prepare("INSERT INTO access_log(at, kind, what, machine) VALUES(?, 'export', 'gedcom', 'poste-recent')")->execute([date('Y-m-d H:i:s', strtotime('-11 months'))]);`);
            assert.equal((await owner.post('access_log_settings', { months: 5 })).status, 422);
            const r = await owner.post('access_log_settings', { months: 12 }); assert.equal(r.status, 200); assert.equal(r.json.purged, 1);
            const rows = (await owner.get('access_log')).json.rows;
            assert.ok(!rows.some(x => x.machine === 'vieux-poste')); assert.ok(rows.some(x => x.machine === 'poste-recent'));
            assert.ok(rows.some(x => x.kind === 'purge' && x.what === '1|12'));
            const r3 = await owner.post('access_log_settings', { months: 3 }); assert.equal(r3.json.purged, 1, '11 mois > 3 mois');
            assert.ok((await owner.get('access_log')).json.rows.some(x => x.kind === 'retention' && x.what === '12|3'));
            assert.equal((await owner.post('access_log_settings', { months: 12 })).status, 200);
        });
        await t('mode consultation + verrou : le verrou passe avant ; ouverte, la consultation s’applique (rien ne s’écrit, ni le mot de passe, ni le registre lu)', async () => {
            assert.equal((await owner.post('kiosk_enter', { password: 'consult1' })).status, 200);
            try {
                assert.equal((await owner.post('glock_lock_now', {})).status, 200, 'verrouiller reste permis en consultation');
                const k = await owner.get('kiosk_state'); assert.equal(k.status, 423); assert.equal(k.json.glock, true);
                advance(61); assert.equal((await owner.post('glock_unlock', { password: PW })).status, 200);
                assert.equal((await owner.get('kiosk_state')).json.on, true);
                const w = await owner.post('save_person', { id: 10, first_name: 'X' }); assert.equal(w.status, 423); assert.equal(w.json.kiosk, true);
                for (const a of ['glock_change', 'glock_remove', 'glock_minutes']) { const r = await owner.post(a, { old: PW, password: PW2, password2: PW2, minutes: 0 }); assert.equal(r.status, 423, a); assert.equal(r.json.kiosk, true, a); }
                assert.equal((await owner.get('access_log')).status, 403, 'le registre ne se lit pas en consultation');
                assert.equal((await owner.get('access_log_csv')).status, 403);
            } finally { assert.equal((await owner.post('kiosk_exit', { password: 'consult1' })).status, 200); }
        });
        await t('changer le mot de passe : les autres séances ouvertes sont refermées ; le délai « jamais » ; retirer (avec l’ancien) ouvre tout', async () => {
            const s = new Sess(); await s.init(); advance(61); assert.equal((await s.post('glock_unlock', { password: PW })).status, 200);
            advance(61); assert.equal((await owner.post('glock_change', { old: PW, password: PW2, password2: PW2 })).status, 200);
            assert.equal((await s.get('people')).status, 423, 'l’autre séance est refermée'); assert.equal((await owner.get('people')).status, 200);
            advance(61); assert.equal((await owner.post('glock_minutes', { old: PW2, minutes: 0 })).status, 200);
            advance(24 * 3600); assert.equal((await owner.get('people')).status, 200, 'jamais : pas de délai');
            advance(61); assert.equal((await owner.post('glock_minutes', { old: PW2, minutes: 15 })).status, 200);
            advance(61); assert.equal((await owner.post('glock_remove', { old: PW2 })).status, 200);
            assert.ok(!fs.existsSync(path.join(dir, 'verrou.json'))); assert.equal(Number(php(`echo db()->query('SELECT count(*) FROM app_lock')->fetchColumn();`).stdout), 0);
            const s3 = new Sess(); await s3.init(); assert.equal((await s3.get('people')).status, 200);
            assert.equal((await owner.post('glock_set', { password: PW, password2: PW, ack: 1 })).status, 200, 'remis pour la suite');
        });
        await t('verrou.json supprimé ou remplacé : la base garde le verrou (la limite : modifier la base demande déjà de pouvoir la lire)', async () => {
            const mark = path.join(dir, 'verrou.json'), saved = fs.readFileSync(mark, 'utf8');
            fs.unlinkSync(mark);
            const s = new Sess(); await s.init(); assert.equal((await s.get('people')).status, 423, 'toujours verrouillée sans le fichier');
            const fake = php(`echo json_encode(['hash' => password_hash(glock_prehash('connu-de-l-intrus'), PASSWORD_BCRYPT), 'lock_id' => 'x', 'minutes' => 15]);`).stdout;
            fs.writeFileSync(mark, fake);
            advance(61); assert.equal((await s.post('glock_unlock', { password: 'connu-de-l-intrus' })).status, 401, 'un fichier remplacé ne suffit pas');
            advance(61); assert.equal((await s.post('glock_unlock', { password: PW })).status, 200, 'le vrai mot de passe ouvre');
            assert.equal(JSON.parse(fs.readFileSync(mark, 'utf8')).hash, JSON.parse(saved).hash, 'le fichier est remis d’accord avec la base');
        });

        /* ═════ 1 bis. audit indépendant : une AUTRE généalogie protégée, visée depuis une généalogie ouverte ═════ */
        let coffre = '', coffreDir = '';
        const attacker = new Sess();
        await t('audit — préparation : « Coffre » a des copies en clair (sauvegarde, avant migration) ; à la pose du mot de passe elles sont chiffrées (AES-256) et plus en clair', async () => {
            const g = await owner.post('genealogy_create', { name: 'Coffre' }); assert.equal(g.status, 200); coffre = g.json.id; coffreDir = path.join(dir, 'genealogies', coffre);
            const mk = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; $p = new PDO('sqlite:' . genealogy_dir(${JSON.stringify(coffre)}) . '/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT . '/data/schema.sql')); $p->exec("INSERT INTO persons(first_name,last_name) VALUES('Héritier','SECRETCOFFRE')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: baseEnv });
            assert.match(mk.stdout, /ok/, mk.stderr);
            fs.mkdirSync(path.join(coffreDir, 'media'), { recursive: true }); fs.writeFileSync(path.join(coffreDir, 'media', 'secret-coffre.jpg'), Buffer.from('\xFF\xD8\xFF\xE0SECRET-PHOTO-COFFRE', 'latin1'));
            assert.equal((await owner.post('genealogy_switch', { id: coffre })).status, 200); await owner.init();
            assert.equal((await owner.post('backup_sqlite', { mode: 'manual' })).status, 200);
            fs.copyFileSync(path.join(coffreDir, 'genealogy.sqlite'), path.join(coffreDir, 'backups', 'genealogie-backup-20260101-000000-abcd-migration-v93-v94.db'));
            const set = await owner.post('glock_set', { password: PW, password2: PW, ack: 1 }); assert.equal(set.status, 200, set.text);
            assert.ok(set.json.copies.protected >= 2, JSON.stringify(set.json.copies)); assert.deepEqual(set.json.copies.left, []);
            const left = fs.readdirSync(path.join(coffreDir, 'backups'));
            assert.ok(!left.some(f => f.endsWith('.db')), 'plus aucune copie en clair : ' + left.join(','));
            const zips = left.filter(f => f.endsWith('-protegee.zip')); assert.ok(zips.length >= 2);
            const enc = spawnSync(phpPath, ['-r', `$z = new ZipArchive(); $z->open(${JSON.stringify(path.join(coffreDir, 'backups', zips[0]))}); echo $z->statName('genealogie.db')['encryption_method'], '|', (int) (@$z->getFromName('genealogie.db') !== false);`], { encoding: 'utf8' }).stdout;
            assert.equal(enc, '259|0', 'chiffrée, illisible sans le mot de passe');
            await owner.post('glock_lock_now', {});
            await attacker.init(); assert.equal((await attacker.get('people')).status, 423);
            assert.equal((await attacker.post('genealogy_switch', { id: other })).status, 200); await attacker.init();
            assert.equal((await attacker.get('people')).status, 200, 'l’attaquant est dans une généalogie ouverte');
        });
        await t('audit A1 : dossier « Scans » pointé sur les médias d’une généalogie protégée (ou sur ceux de l’app) → refusé ; un ancien réglage pareil n’importe rien', async () => {
            for (const d of [path.join(coffreDir, 'media'), mediaDir, coffreDir, path.join(dir, 'genealogies'), path.join(coffreDir, 'media', '..', 'media'), appRoot]) {
                const r = await attacker.post('save_scan_inbox_settings', { dir: d, enabled: 1, move_imported: 1 }); assert.equal(r.status, 422, d + ' : ' + r.text);
            }
            php(`ht_save_setting(db(), 'lcnda-scan-inbox', ['dir' => ${JSON.stringify(path.join(coffreDir, 'media'))}, 'enabled' => true, 'move_imported' => true]); echo 'ok';`, { ...baseEnv, GENEALOGY_DATA_DIR: dir });
            const run = await attacker.post('scan_inbox_run', {}); assert.ok(!(run.json && run.json.imported && run.json.imported.length), run.text);
            assert.ok(fs.existsSync(path.join(coffreDir, 'media', 'secret-coffre.jpg')), 'rien n’a été déplacé');
        });
        await t('audit A2 : sauvegarde automatique pointée sur les copies d’une généalogie protégée → refusée ; « revenir à une copie » d’une autre protégée → refusé', async () => {
            for (const d of [path.join(coffreDir, 'backups'), coffreDir, path.join(dir, 'backups'), mediaDir, path.join(dir, 'cache')]) {
                const r = await attacker.post('autobackup_settings', { dir: d, freq: 'day' }); assert.equal(r.status, 422, d + ' : ' + r.text);
            }
            // un ancien réglage pareil (écrit avant la correction) : ni copies listées, ni restauration
            fs.writeFileSync(path.join(dir, 'sauvegarde-auto.json'), JSON.stringify({ freq: 'day', dir: path.join(coffreDir, 'backups'), keep: 10 }));
            const st = await attacker.get('autobackup_status'); assert.deepEqual(st.json.copies, []); assert.doesNotMatch(st.text, /genealogie-backup/);
            const r = await attacker.post('autobackup_restore', { name: 'genealogie-backup-20260101-000000-abcd-migration-v93-v94.db' }); assert.notEqual(r.status, 200);
            // le sous-dossier « genealogie-<id> » d'un dossier choisi (clé USB) : une copie de « Coffre » faite AVANT son mot de passe
            const usb = path.join(tmp, 'usb-audit'), sub0 = path.join(usb, 'genealogie-' + coffre), sub = path.join(sub0, 'genealogie-' + other); fs.mkdirSync(sub, { recursive: true });
            const preLock = 'genealogie-backup-20250101-000000-beef-auto.db';
            const v = spawnSync(phpPath, ['-r', `$p = new PDO('sqlite:' . ${JSON.stringify(path.join(coffreDir, 'genealogy.sqlite'))}); $p->exec('VACUUM INTO ' . $p->quote(${JSON.stringify(path.join(sub, preLock))})); $q = new PDO('sqlite:' . ${JSON.stringify(path.join(sub, preLock))}); $q->exec('DELETE FROM app_lock'); echo 'ok';`], { encoding: 'utf8' }); assert.match(v.stdout, /ok/, v.stderr);
            fs.writeFileSync(path.join(dir, 'sauvegarde-auto.json'), JSON.stringify({ freq: 'day', dir: sub0, keep: 10 })); // la copie est cherchée dans …/genealogie-<celle d'ici>
            const r2 = await attacker.post('autobackup_restore', { name: preLock }); assert.equal(r2.status, 423, r2.text);
            // une copie qui porte le verrou de « Coffre », posée dans un dossier quelconque
            const any0 = path.join(tmp, 'usb-autre'), any = path.join(any0, 'genealogie-' + other); fs.mkdirSync(any, { recursive: true });
            const withLock = 'genealogie-backup-20250102-000000-cafe-auto.db';
            spawnSync(phpPath, ['-r', `$p = new PDO('sqlite:' . ${JSON.stringify(path.join(coffreDir, 'genealogy.sqlite'))}); $p->exec('VACUUM INTO ' . $p->quote(${JSON.stringify(path.join(any, withLock))}));`], { encoding: 'utf8' });
            fs.writeFileSync(path.join(dir, 'sauvegarde-auto.json'), JSON.stringify({ freq: 'day', dir: any0, keep: 10 }));
            const r3 = await attacker.post('autobackup_restore', { name: withLock }); assert.equal(r3.status, 423, r3.text);
            assert.doesNotMatch((await attacker.get('people')).text, /SECRETCOFFRE/);
            fs.unlinkSync(path.join(dir, 'sauvegarde-auto.json'));
        });
        await t('inventaire des chemins venus de la page : sauvegarde (et son état), copie hors de l’ordinateur, deux ordinateurs, import d’un fichier du disque → refus d’un dossier interne', async () => {
            const bad = [path.join(coffreDir, 'backups'), path.join(coffreDir, 'media'), path.join(dir, 'genealogies', coffre, 'x', '..', 'backups'), path.join(coffreDir, 'nouveau-sous-dossier')];
            for (const d of bad) {
                assert.equal((await attacker.post('backup_sqlite', { dir: d, mode: 'manual' })).status, 422, 'backup_sqlite ' + d);
                assert.equal((await attacker.get('backup_sqlite_status', { dir: d })).status, 422, 'backup_sqlite_status ' + d);
                assert.equal((await attacker.post('save_offsite_settings', { dirs: [{ path: d }] })).status, 422, 'offsite ' + d);
                assert.equal((await attacker.post('sd_setup', { folder: d })).status, 422, 'sd_setup ' + d);
            }
            assert.equal((await attacker.get('autobackup_check', { dir: path.join(coffreDir, 'backups') })).json.ok, false);
            const own = await attacker.post('backup_sqlite', { mode: 'manual' }); assert.equal(own.status, 200, 'son propre dossier reste permis');
            const loc = await attacker.req('api.php?action=import_local_path', { method: 'POST', body: { path: path.join(coffreDir, 'genealogy.sqlite'), csrf: attacker.csrf }, headers: { 'X-CSRF-Token': attacker.csrf, 'x-carnet-local': 'secret-local-essai' } });
            assert.equal(loc.status, 422, loc.text); assert.doesNotMatch(loc.text, /SECRETCOFFRE/);
            // un lien symbolique vers le dossier d'une généalogie protégée
            const link = path.join(tmp, 'lien-coffre'); try { fs.symlinkSync(path.join(coffreDir, 'media'), link); } catch (_) {}
            if (fs.existsSync(link)) assert.equal((await attacker.post('save_scan_inbox_settings', { dir: link, enabled: 1 })).status, 422, 'lien symbolique résolu');
        });
        await t('renommer ou mettre de côté une généalogie protégée depuis une autre → refusé', async () => {
            assert.equal((await attacker.post('genealogy_rename', { id: coffre, name: 'piège' })).status, 422);
            assert.equal((await attacker.post('genealogy_remove', { id: coffre })).status, 422);
            assert.ok(fs.existsSync(path.join(coffreDir, 'genealogy.sqlite')));
        });
        await t('restaurer dans une généalogie protégée ne retire jamais le verrou (copie d’avant le mot de passe)', async () => {
            // « Coffre » : propriétaire ouvre, remet une copie faite AVANT la pose (sans app_lock) depuis son propre dossier
            await owner.init(); assert.equal((await owner.post('genealogy_switch', { id: coffre })).status, 200); await owner.init(); advance(61);
            assert.equal((await owner.post('glock_unlock', { password: PW })).status, 200);
            const name = 'genealogie-backup-20250103-000000-d00d-manual.db';
            spawnSync(phpPath, ['-r', `$p = new PDO('sqlite:' . ${JSON.stringify(path.join(coffreDir, 'genealogy.sqlite'))}); $p->exec('VACUUM INTO ' . $p->quote(${JSON.stringify(path.join(coffreDir, 'backups', name))})); $q = new PDO('sqlite:' . ${JSON.stringify(path.join(coffreDir, 'backups', name))}); $q->exec('DELETE FROM app_lock');`], { encoding: 'utf8' });
            const r = await owner.post('autobackup_restore', { name }); assert.equal(r.status, 200, r.text);
            const row = spawnSync(phpPath, ['-r', `$p = new PDO('sqlite:' . ${JSON.stringify(path.join(coffreDir, 'genealogy.sqlite'))}); echo $p->query('SELECT count(*) FROM app_lock')->fetchColumn();`], { encoding: 'utf8' }).stdout;
            assert.equal(row, '1', 'le verrou est remis dans la base restaurée');
            const s2 = new Sess(); await s2.init(); assert.equal((await s2.get('people')).status, 423);
            await owner.post('glock_lock_now', {});
        });
        await t('force brute en parallèle : 8 essais en même temps → un seul vérifié, les autres freinés (429), compteur +1', async () => {
            const s = new Sess(); await s.init(); advance(120);
            const essais = () => { try { return JSON.parse(fs.readFileSync(path.join(coffreDir, 'verrou-essais.json'), 'utf8')).fails || 0; } catch (_) { return 0; } };
            const before = essais();
            const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => s.post('glock_unlock', { password: 'parallele-' + i })));
            const codes = rs.map(r => r.status).sort(); assert.equal(codes.filter(c => c === 401).length, 1, codes.join(',')); assert.equal(codes.filter(c => c === 429).length, 7);
            assert.equal(essais(), before + 1);
        });
        await t('course : changer de généalogie pendant des lectures, depuis l’écran de verrou → jamais une donnée de la protégée', async () => {
            for (let i = 0; i < 10; i++) {
                const s = new Sess(); await s.init();
                const rs = await Promise.all([s.post('genealogy_switch', { id: other }), s.get('people'), s.get('people'), s.req('media/secret-coffre.jpg')]);
                for (const r of rs) assert.doesNotMatch(r.text, /SECRETCOFFRE|SECRET-PHOTO-COFFRE/);
                await attacker.post('genealogy_switch', { id: coffre });
            }
        });
        await t('en-têtes : réponses d’api.php et médias d’une généalogie protégée en no-store', async () => {
            await owner.init(); advance(61); assert.equal((await owner.post('glock_unlock', { password: PW })).status, 200);
            const m = await owner.req('media/secret-coffre.jpg'); assert.equal(m.status, 200); assert.equal(m.headers.get('cache-control'), 'no-store, private'); assert.equal(m.headers.get('etag') !== null, true);
            const again = await owner.req('media/secret-coffre.jpg', { headers: { 'If-None-Match': m.headers.get('etag') } }); assert.equal(again.status, 200, 'pas de 304 servi depuis un cache');
            assert.equal((await owner.get('people')).headers.get('cache-control'), 'no-store, private');
            await owner.post('glock_lock_now', {});
        });
        await t('porte d’horloge de test : ignorée sans GENEALOGY_TEST=1 ; l’app installée ne transmet ni l’horloge ni le nom d’ordinateur imposé', () => {
            fs.writeFileSync(path.join(tmp, 'clock-loin.txt'), '999999');
            const env2 = { ...baseEnv, LCNDA_TEST_CLOCK_FILE: path.join(tmp, 'clock-loin.txt') }; delete env2.GENEALOGY_TEST;
            const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/verrou.php'; echo abs(glock_now() - time()) < 5 ? 'ok' : 'avancée';`], { cwd: appRoot, encoding: 'utf8', env: env2 });
            assert.equal(r.stdout, 'ok');
            const ps = read('electron/php-server.js'); assert.match(ps, /if \(o\.packaged \|\| isPackagedApp\(\)\) \{ for \(const k of \['LCNDA_TEST_CLOCK_FILE', 'GENEALOGY_TEST', 'GENEALOGY_MACHINE_NAME'\]\) delete env\[k\]; \}/);
            assert.equal(require('../electron/php-server').isPackagedApp(), false);
        });
        await t('retour à la généalogie principale pour la suite', async () => {
            assert.equal((await owner.post('genealogy_switch', { id: '' })).status, 200); await owner.init(); advance(61);
            assert.equal((await owner.post('glock_unlock', { password: PW })).status, 200);
            php(`db()->exec("UPDATE succ_cases SET title=" . db()->quote('<img src=x onerror=window.__xss=1> MAZAUD') . " WHERE id=${caseId}");`);
            await owner.get('successoral', { op: 'get', id: caseId }); // une ligne au registre avec ce titre piégé
            await owner.post('glock_lock_now', {});
        });

        /* ═════ 2. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (chromium) {
            await owner.init(); advance(61); await owner.post('glock_unlock', { password: PW });
            assert.equal((await owner.post('genealogy_rename', { id: '', name: 'Ma famille ' + XSS })).status, 200);
            await owner.post('glock_lock_now', {});
            const browser = await chromium.launch();
            fs.mkdirSync(UX, { recursive: true });
            const storageDump = [];
            const ctxOf = async (w, h, dark) => {
                const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light' });
                if (dark) await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-design', JSON.stringify({ preset: 'dark' })); } catch (_) {} });
                return ctx;
            };
            const unlockUi = async p => {
                advance(61);
                await p.fill('#glock-pw', PW); await p.click('[data-glock-open]');
                await p.waitForSelector('#workspace', { timeout: 20000 }); await p.waitForTimeout(1500);
            };
            const settings = async (p, tab) => { await p.evaluate(tb => { window.LCNDA_APP.state.maintenanceTab = tb; window.LCNDA_APP.setModule('maintenance'); }, tab); await p.waitForTimeout(1200); };
            await t('navigateur : l’écran de verrou (1440, 390, sombre) — rien de la base, nom piégé jamais exécuté, mauvais mot de passe freiné', async () => {
                for (const [w, h, dark, tag] of [[1440, 900, false, '1440'], [390, 844, false, '390'], [1440, 900, true, 'sombre']]) {
                    const ctx = await ctxOf(w, h, dark); const p = await ctx.newPage();
                    const errs = []; p.on('pageerror', e => errs.push(String(e)));
                    await p.goto(base); await p.waitForTimeout(600);
                    assert.match(await p.locator('h1').innerText(), /Ma famille <img src=x onerror=window\.__xss=1> » est verrouillée/);
                    assert.equal(await p.evaluate(() => window.__xss), undefined);
                    const html = await p.content(); assert.doesNotMatch(html, /MAZAUD|LACOMBE|Limoges|photo-mazaud|LCNDA_SETTINGS/);
                    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'pas de défilement de côté');
                    if (dark) assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
                    if (tag === '1440') {
                        await p.fill('#glock-pw', 'pas-le-bon'); await p.click('[data-glock-open]');
                        await p.waitForFunction(() => /incorrect/.test(document.querySelector('[data-glock-msg]').textContent), null, { timeout: 5000 });
                        assert.match(await p.locator('[data-glock-open]').innerText(), /Patiente \d+ s/, 'bouton freiné');
                        assert.equal(await p.inputValue('#glock-pw'), '', 'champ vidé');
                        await p.click('[data-glock-forgot]'); await p.click('[data-glock-others]'); await p.waitForTimeout(500);
                        assert.match(await p.locator('[data-glock-list]').innerText(), /Dossiers à part/);
                    }
                    await p.screenshot({ path: path.join(UX, `sec-verrou-${tag}.png`) });
                    assert.deepEqual(errs, []);
                    await ctx.close();
                }
            });
            await t('navigateur : ouvrir, Réglages 🔐 et 📜 (1440, 390, sombre), Mes généalogies 🔐, registre d’un dossier ; rien du mot de passe dans le navigateur', async () => {
                for (const [w, h, dark, tag] of [[1440, 900, false, '1440'], [390, 844, false, '390'], [1440, 900, true, 'sombre']]) {
                    const ctx = await ctxOf(w, h, dark); const p = await ctx.newPage();
                    const errs = []; p.on('pageerror', e => errs.push(String(e)));
                    await p.goto(base); await p.waitForTimeout(500); await unlockUi(p);
                    assert.equal(await p.evaluate(() => window.LCNDA_GLOCK.on), true);
                    await settings(p, 'verrou'); assert.match(await p.locator('#workspace').innerText(), /n’empêche pas de lire le fichier/);
                    await p.screenshot({ path: path.join(UX, `sec-reglages-${tag}.png`), fullPage: tag === '390' });
                    await settings(p, 'qui_a_vu'); assert.match(await p.locator('#workspace').innerText(), /Mot de passe refusé/);
                    assert.equal(await p.evaluate(() => window.__xss), undefined);
                    await p.screenshot({ path: path.join(UX, `sec-registre-${tag}.png`), fullPage: tag === '390' });
                    if (tag === '1440') {
                        await p.evaluate(id => window.LCNDA_EXT.accessLogDialog({ caseId: id, number: '2026-014' }), caseId); await p.waitForTimeout(500);
                        await p.screenshot({ path: path.join(UX, 'sec-dossier-registre-1440.png') }); await p.keyboard.press('Escape');
                        await p.evaluate(() => window.LCNDA_EXT.openGenealogies()); await p.waitForTimeout(700);
                        assert.match(await p.locator('#h-gen-dialog').innerText(), /protégée par un mot de passe/);
                        await p.screenshot({ path: path.join(UX, 'sec-genealogies-1440.png') }); await p.keyboard.press('Escape');
                    }
                    storageDump.push(await p.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie })));
                    assert.deepEqual(errs.filter(e => !/ERR_TUNNEL|Failed to load/.test(e)), []);
                    await ctx.close();
                }
            });
            await t('navigateur : après le délai la page est vidée et rechargée sur l’écran de verrou ; « 🔐 Verrouiller maintenant » (bouton du haut) aussi', async () => {
                const ctx = await ctxOf(1440, 900, false); const p = await ctx.newPage();
                await p.goto(base); await p.waitForTimeout(400); await unlockUi(p);
                assert.match(await p.locator('body').innerText(), /Réglages|Tableau de bord/);
                advance(16 * 60);
                await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
                await p.waitForSelector('[data-glock-screen]', { timeout: 15000 }); await p.waitForTimeout(300);
                assert.doesNotMatch(await p.content(), /MAZAUD|LACOMBE|photo-mazaud/);
                assert.equal(await p.evaluate(() => !!window.LCNDA_APP), false, 'plus rien de l’app en mémoire');
                // bouton « retour » (bfcache) : jamais la page d'avant, toujours rien de la base
                await p.goBack({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(800);
                assert.doesNotMatch(await p.content(), /MAZAUD|LACOMBE|photo-mazaud|SECRETCOFFRE/, 'retour arrière après reverrouillage');
                await p.goForward({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(500);
                assert.doesNotMatch(await p.content(), /MAZAUD|LACOMBE|photo-mazaud/);
                // stockage du navigateur après reverrouillage : ni nom, ni adresse, ni mot de passe
                const st = await p.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
                assert.doesNotMatch(st, /MAZAUD|LACOMBE|ROUSSILHE|Limoges|rue des Écoles|SECRETCOFFRE/, 'stockage après reverrouillage');
                if (!(await p.$('[data-glock-screen]'))) { await p.goto(base); await p.waitForSelector('[data-glock-screen]'); }
                // bouton du haut (montré par le réglage)
                await unlockUi(p);
                assert.equal(await p.locator('#glock-now').isVisible(), false, 'caché au départ');
                assert.ok(await p.evaluate(() => window.LCNDA_APPARENCE.TOPBAR_ITEMS.some(b => b[0] === 'glock')), 'dans « Boutons en haut à droite »');
                await p.evaluate(() => window.LCNDA_APPARENCE.topbarSetShown('glock', true)); // ce que fait la case de Réglages → Apparence
                await p.waitForSelector('#glock-now', { state: 'visible', timeout: 5000 });
                await p.screenshot({ path: path.join(UX, 'sec-bouton-haut-1440.png'), clip: { x: 700, y: 0, width: 740, height: 80 } });
                advance(61); await owner.init(); assert.equal((await owner.post('glock_unlock', { password: PW })).status, 200);
                await p.click('#glock-now');
                await p.waitForSelector('[data-glock-screen]', { timeout: 15000 });
                assert.equal((await owner.get('people')).status, 200, 'une autre séance n’est pas touchée');
                storageDump.push(await p.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } })));
                await ctx.close();
            });
            await browser.close();
            await t('le mot de passe n’est écrit nulle part dans le navigateur (localStorage, sessionStorage, cookies)', () => {
                assert.ok(storageDump.length >= 3); for (const d of storageDump) assert.ok(!d.includes(PW_TAIL) && !d.includes(PW2.slice(8)));
            });
        } else console.log('— Playwright absent : partie navigateur sautée');

        await t('le mot de passe n’est écrit nulle part sur le disque : bases (et -wal), verrou.json, essais, sessions, sauvegardes, exports, journal de PHP, registre', async () => {
            await owner.init(); advance(61); await owner.post('glock_unlock', { password: PW });
            const g = await owner.get('export_gedcom'); fs.writeFileSync(path.join(tmp, 'export.ged'), g.buf);
            const c = await owner.get('export_csv'); fs.writeFileSync(path.join(tmp, 'export.csv'), c.buf);
            await stopServer();
            const needles = [PW, PW2, PW_TAIL, PW2.slice(8), XSS + 'x'].map(s => Buffer.from(s, 'utf8'));
            const latin = Buffer.from(PW_TAIL, 'utf16le');
            const hits = []; let files = 0;
            const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else { files++; const b = fs.readFileSync(p); for (const n of [...needles.slice(0, 4), latin]) if (b.includes(n)) hits.push(p); } } };
            walk(tmp);
            assert.ok(files > 10, 'fichiers lus : ' + files);
            assert.deepEqual([...new Set(hits)], []);
            assert.match(fs.readFileSync(logFile, 'utf8'), /POST \/api\.php\?action=glock_unlock/, 'le journal de PHP a bien été lu');
        });
    } finally {
        await stopServer();
    }
    await t('PhpServer (app de bureau) : écoute 127.0.0.1 seulement, pas les autres adresses de l’ordinateur', async () => {
        const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-verrou-srv-'));
        const s = new PhpServer({ phpPath, appRoot, pool: 2, dataDir: path.join(d2, 'data'), mediaDir: path.join(d2, 'media'), sessionDir: path.join(d2, 's'), logFile: path.join(d2, 'php.log') });
        s.on('error', () => {});
        await s.start();
        try {
            assert.match(s.origin, /^http:\/\/127\.0\.0\.1:\d+$/); assert.ok(s.bootId && s.bootId.length === 32);
            const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && !i.internal && i.family === 'IPv4').map(i => i.address);
            for (const ip of ips) {
                for (const p of [s.port, ...s.backends.map(b => b.port)]) {
                    const r = await new Promise(res => { const c = net.connect({ host: ip, port: p, timeout: 1500 }, () => { c.destroy(); res('ouvert'); }); c.on('error', e => res(e.code)); c.on('timeout', () => { c.destroy(); res('timeout'); }); });
                    assert.notEqual(r, 'ouvert', `${ip}:${p}`);
                }
            }
            const r = await s.request('/api.php?action=glock_state'); assert.equal(r.status, 200);
        } finally { await s.stop(); }
    });
    finish();
})().catch(e => { console.error(e); process.exit(1); });
