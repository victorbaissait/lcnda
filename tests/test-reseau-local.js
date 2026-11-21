'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🖧 Plusieurs ordinateurs : essai de sécurité de la porte du wifi (electron/lan-gate.js) et des règles de PHP pour un
 * appareil invité (lib/reseau_local.php).      node tests/test-reseau-local.js
 *
 *  0. sans serveur : adresses privées seulement (10/8, 172.16/12, 192.168/16, fe80::/10, fd00::/8), le choix de l'adresse à
 *     écouter, PHP et le relais toujours sur 127.0.0.1, rien de la porte dans la généalogie, textes traduits ;
 *  1. avec le vrai PHP (electron/php-server.js) et la porte (adresse de la maison simulée : elle écoute sur 127.0.0.1 et
 *     l'adresse de l'appareil est donnée par l'essai) :
 *     coupée par défaut (rien n'écoute) ; refus d'ouvrir sans adresse privée ou sans mot de passe ; appareil non appairé ;
 *     adresse publique simulée et autre réseau privé (connexion coupée) ; mauvais nom d'hôte ; mauvaise origine ; appairage
 *     (code d'invitation à usage unique, code à 6 chiffres identique des deux côtés, jeton donné une seule fois, gardé haché) ;
 *     jeton faux ; mot de passe de la généalogie exigé par appareil (séance par appareil) ; invité en lecture seule (écrire,
 *     changer de généalogie, poser / retirer le mot de passe, restaurer une copie, sortir du mode consultation, envoyer un
 *     fichier, exporter, lire le registre, imiter le processus principal) ; registre avec l'appareil ; le secret interne ne
 *     sort jamais ; jeton retiré (refusé tout de suite, connexion ouverte coupée) ; code faux répété (pause) ; 5 refus
 *     (pause) ; demande expirée ; l'interrupteur coupé ferme bien le port.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs, PhpServer } = require('../electron/php-server');
const { LanGate, isPrivateAddress, pickLanAddress, sameNetwork, cleanName, COOKIE, MAX_FAILS } = require('../electron/lan-gate');

const appRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const PW = 'Mazaud-Bureau-2026-secret';

(async () => {
    /* ═════ 0. sans serveur ═════ */
    await t('adresses privées seulement : 10/8, 172.16/12, 192.168/16, fe80::/10, fd00::/8 ; tout le reste refusé', () => {
        for (const ip of ['10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.254', '192.168.1.34', '::ffff:192.168.1.5', 'fe80::1', 'fe80::1%en0', 'febf::1', 'fd12:3456::1', '[fd00::1]']) assert.ok(isPrivateAddress(ip), ip);
        for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '192.169.0.1', '192.0.2.2', '100.64.0.1', '127.0.0.1', '::1', '0.0.0.0', '::', '169.254.1.1', 'fc00::1', 'fec0::1', '2001:db8::1', '::ffff:8.8.8.8', '', 'localhost', 'abc', '192.168.1', '999.1.1.1']) assert.ok(!isPrivateAddress(ip), ip);
        assert.ok(sameNetwork('192.168.1.34', {ip: '192.168.1.20', prefix: 24}));
        assert.ok(!sameNetwork('192.168.2.34', {ip: '192.168.1.20', prefix: 24}));
        assert.ok(!sameNetwork('10.0.0.5', {ip: '192.168.1.20', prefix: 24}));
        assert.ok(sameNetwork('fd00::5', {ip: 'fd00::1', prefix: 64}));
    });
    await t('l’adresse écoutée : la première IPv4 privée d’une interface active ; aucune (ex. 192.0.2.2, publique) → rien', () => {
        assert.equal(pickLanAddress({lo: [{address: '127.0.0.1', internal: true}], eth0: [{address: '192.0.2.2', internal: false, cidr: '192.0.2.2/24'}]}), null);
        assert.equal(pickLanAddress({en0: [{address: 'fe80::1', internal: false, cidr: 'fe80::1/64'}]}), null, 'lien local seul : non');
        const a = pickLanAddress({en0: [{address: 'fd00::7', internal: false, cidr: 'fd00::7/64'}, {address: '192.168.1.20', internal: false, cidr: '192.168.1.20/24'}]});
        assert.equal(a.ip, '192.168.1.20'); assert.equal(a.prefix, 24);
        assert.equal(cleanName('  Portable\u0000 de‮ Marie  '), 'Portable de Marie');
        assert.equal([...cleanName('x'.repeat(200))].length, 40);
    });
    await t('PHP et le relais n’écoutent que 127.0.0.1 ; la porte écoute l’adresse privée choisie (jamais 0.0.0.0) ; le secret est ajouté après la vérification', () => {
        const ps = read('electron/php-server.js');
        assert.match(ps, /'-S', `127\.0\.0\.1:\$\{b\.port\}`/); assert.match(ps, /server\.listen\(this\.port, '127\.0\.0\.1'/);
        const g = read('electron/lan-gate.js');
        assert.match(g, /server\.listen\(\{ port, host: bind, exclusive: true \}\)/);
        assert.match(g, /bind = address && address\.ip/);
        assert.doesNotMatch(g, /host: '0\.0\.0\.0'|host: '::'|listen\(\s*port\s*\)/);
        assert.ok(g.indexOf("if (!dev) {") < g.indexOf('headers[SECRET_HEADER] = target.secret'), 'le jeton est vérifié avant d’ajouter le secret');
        assert.match(g, /key\.startsWith\('x-carnet'\)[^\n]*continue/, 'les en-têtes x-carnet-* venus du réseau sont retirés');
        const m = read('electron/main.js');
        assert.match(m, /powerMonitor\.on\('suspend'/); assert.match(m, /gate\.close\('quit'/);
        assert.match(m, /if \(!fromApp\(event\) \|\| !gate\)/, 'seule la grande fenêtre de l’ordinateur principal pilote la porte');
    });
    await t('rien de la porte dans la généalogie : appareils et jetons hachés dans le dossier de données de l’ordinateur', () => {
        const g = read('electron/lan-gate.js');
        assert.match(g, /path\.join\(o\.dataDir, 'reseau-local'\)/);
        assert.match(read('lib/migrations.php'), /const SCHEMA_VERSION = 99;/);
        assert.match(read('lib/migrations.php'), /98 => 'schema_v98'/);
    });
    await t('textes : FAQ et traductions dans les 31 langues', () => {
        const faq = read('assets/js/heritage-more.js');
        assert.match(faq, /Comment ouvrir ma généalogie sur un autre ordinateur de la maison \?/);
        assert.match(faq, /Comment autoriser ou retirer un appareil/);
        const keys = ['Plusieurs ordinateurs', 'Demandes d’accès', 'Se connecter à l’ordinateur principal', 'Appareil invité : lecture seule. Cela ne se fait que sur l’ordinateur principal.', '✓ Autoriser « {name} »'];
        for (const l of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl', 'cs', 'sv', 'da', 'sk', 'nb', 'ro', 'fi', 'hu', 'hr', 'sl', 'lt', 'lv', 'et', 'is', 'tr', 'lb', 'sq', 'mt', 'vi', 'id', 'ru', 'uk', 'el', 'bg']) {
            const j = JSON.parse(read(`assets/i18n/${l}.json`));
            for (const k of keys) assert.ok(j[k], `${l} : ${k}`);
        }
    });

    /* ═════ 1. le serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-reseau-'));
    const dataDir = path.join(tmp, 'data'), mediaDir = path.join(tmp, 'media');
    fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(mediaDir, { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dataDir, GENEALOGY_MEDIA_DIR: mediaDir, GENEALOGY_SKIP_REFERENCE: '1' };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(1,'Jean','MAZAUD','male','deceased'),(2,'Louise','LACOMBE','female','deceased')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const sql = q => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p=new PDO('sqlite:'.$argv[1]);echo json_encode($p->query($argv[2])->fetchAll(PDO::FETCH_ASSOC));`, path.join(dataDir, 'genealogy.sqlite'), q], { encoding: 'utf8' }).stdout;

    for (const k of Object.keys(env)) process.env[k] = env[k];
    const server = new PhpServer({ phpPath, appRoot, pool: 2, dataDir, mediaDir, sessionDir: path.join(tmp, 'sessions'), logFile: path.join(tmp, 'logs', 'php.log') });
    server.on('error', () => {});
    await server.start();
    const secrets = [server.secret, server.gateSecret, server.localSecret];
    let peer = '192.168.1.34';
    const HOME = { ip: '192.168.1.20', prefix: 24 };
    const gate = new LanGate({ server, dataDir, appRoot, test: { bind: '127.0.0.1', address: HOME, peer: () => peer } });
    const seen = [];
    const leaks = r => { const all = JSON.stringify(r.headers) + r.body.toString('latin1'); for (const s of secrets) assert.ok(!all.includes(s), 'un secret interne est sorti sur le réseau'); };

    /** une demande « venue du wifi » : Host = l'adresse de la maison, l'adresse de l'appareil est `peer` */
    const ask = (method, p, { cookie = '', body = null, origin, host, headers = {}, agent = false } = {}) => new Promise((resolve, reject) => {
        const h = { host: host || `${HOME.ip}:${gate.port}`, ...headers };
        if (cookie) h.cookie = cookie;
        if (origin !== undefined) h.origin = origin;
        let data = null;
        if (body !== null) { data = typeof body === 'string' ? body : JSON.stringify(body); h['content-type'] = h['content-type'] || 'application/json'; h['content-length'] = Buffer.byteLength(data); }
        const req = http.request({ host: '127.0.0.1', port: gate.port, method, path: p, headers: h, agent }, res => {
            const chunks = [], socket = res.socket; res.on('data', c => chunks.push(c));
            res.on('end', () => { const r = { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), socket }; r.json = () => JSON.parse(r.body.toString()); r.text = () => r.body.toString(); seen.push(r); leaks(r); resolve(r); });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => req.destroy(new Error('timeout')));
        req.end(data === null ? undefined : data);
    });
    /** une petite boîte à cookies : la séance PHP de l'appareil (changée au déverrouillage) et son jeton */
    const jar = () => { const c = {}; return { header: () => Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '), take: r => { for (const sc of [].concat(r.headers['set-cookie'] || [])) { const [kv] = sc.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); } }, c }; };
    const refusedConn = (p = '/') => new Promise(resolve => { const req = http.request({ host: '127.0.0.1', port: gate.port, path: p, headers: { host: `${HOME.ip}:${gate.port}` }, agent: false }, res => { res.resume(); resolve(`HTTP ${res.statusCode}`); }); req.on('error', e => resolve(e.code || e.message)); req.end(); });
    const connectTo = port => new Promise(resolve => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); resolve('ouvert'); }); s.on('error', e => resolve(e.code)); });
    /** la fenêtre de l'ordinateur principal (avec le secret, sans la porte) */
    const main = jar();
    const mainAsk = async (p, o = {}) => { const r = await server.request(p, { ...o, headers: { ...(o.headers || {}), cookie: main.header() } }); main.take(r); return r; };
    const mainCsrf = async () => { const r = await mainAsk('/'); return JSON.parse((r.body.toString().match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""'); };
    const mainPost = async (action, body) => { const csrf = await mainCsrf(); const data = JSON.stringify({ ...body, csrf }); return mainAsk('/api.php?action=' + action, { method: 'POST', body: data, headers: { 'content-type': 'application/json', 'x-csrf-token': csrf } }); };

    try {
        await t('coupée par défaut : rien n’écoute, aucun port ; ouvrir sans adresse privée est refusé (192.0.2.2 est publique)', async () => {
            assert.equal(typeof gate.on, 'function', 'gate.on reste la fonction des événements (main.js : gate.on(« request », …))');
            assert.equal(gate.isOn, false); assert.equal(gate.port, 0); assert.equal(gate.status().on, false);
            const real = new LanGate({ server, dataDir: path.join(tmp, 'autre'), appRoot, interfaces: () => ({ eth0: [{ address: '192.0.2.2', internal: false, cidr: '192.0.2.2/24' }], lo: [{ address: '127.0.0.1', internal: true }] }) });
            const r = await real.open({ passwordOk: true });
            assert.deepEqual(r, { ok: false, error: 'noprivate' }); assert.equal(real.isOn, false);
            const s = real.settings;
            assert.deepEqual(s, { relaunch: 'coupe', wake: 'rouvre', password: 'obligatoire', preventSleep: 'non', invite: 'demande', duration: 'toujours', stale: 'proposer', network: 'couper' }, 'les options conseillées au départ');
        });
        await t('mot de passe de la généalogie obligatoire (réglage conseillé) : refus d’ouvrir sans lui', async () => {
            assert.deepEqual(await gate.open({ passwordOk: false }), { ok: false, error: 'nopw' });
            assert.equal(gate.isOn, false);
        });
        await t('ouverte : un port ; appareil non appairé → seulement la page « Demander l’accès » (rien de la généalogie), API et médias 401', async () => {
            const r = await gate.open({ passwordOk: true });
            assert.equal(r.ok, true); assert.ok(gate.port > 0); assert.equal(r.url, `http://192.168.1.20:${gate.port}`);
            const home = await ask('GET', '/');
            assert.equal(home.status, 200); assert.match(home.text(), /__lan\/f\/appairage\.js/); assert.doesNotMatch(home.text(), /MAZAUD|LACOMBE|INSTALL_CSRF/);
            for (const p of ['/api.php?action=bootstrap', '/api.php?action=person&id=1', '/media/x.jpg', '/upload.php', '/telecharger.php', '/assets/js/app.js', '/__health']) {
                const x = await ask('GET', p); assert.ok([401, 404].includes(x.status), `${p} → ${x.status}`); assert.doesNotMatch(x.text(), /MAZAUD/);
            }
            assert.equal((await ask('POST', '/api.php?action=save_person', { body: { first_name: 'X' }, origin: `http://192.168.1.20:${gate.port}` })).status, 401);
            assert.equal((await ask('GET', '/assets/i18n/en.json')).status, 200, 'les mots de la page');
            for (const p of ['/assets/i18n/../../lib/verrou.php', '/__lan/f/../../../lib/verrou.php', '/__lan/f/%2e%2e%2flib%2fverrou.php', '/__lan/f/i18n-../../x.json']) {
                const x = await ask('GET', p); assert.ok([401, 404].includes(x.status), `${p} → ${x.status}`); assert.doesNotMatch(x.text(), /<\?php/);
            }
        });
        await t('adresse publique simulée (8.8.8.8), autre réseau privé (10.0.0.5), boucle locale : connexion coupée avant toute lecture', async () => {
            for (const ip of ['8.8.8.8', '10.0.0.5', '192.168.2.9', '127.0.0.1', '::1']) { peer = ip; const r = await refusedConn('/'); assert.match(r, /ECONNRESET|socket hang up|EPIPE/, `${ip} : ${r}`); }
            peer = '192.168.1.34';
        });
        await t('mauvais nom d’hôte (DNS rebinding) → 421 ; écriture d’une autre origine → 403', async () => {
            assert.equal((await ask('GET', '/', { host: 'evil.example:80' })).status, 421);
            assert.equal((await ask('GET', '/', { host: `127.0.0.1:${gate.port}` })).status, 421);
            assert.equal((await ask('POST', '/__lan/demande', { body: { name: 'x' }, origin: 'http://evil.example' })).status, 403);
        });

        let device = null;
        const guest = jar();
        await t('appairage : code d’invitation à usage unique, même code à 6 chiffres des deux côtés, accepté sur l’ordinateur principal, jeton donné une seule fois', async () => {
            const inv = gate.status().invite; assert.match(inv.code, /^[A-Z0-9]{6}$/); assert.ok(inv.expires - Date.now() <= 10 * 60e3 + 1000);
            const d = await ask('POST', '/__lan/demande', { body: { name: 'Portable de Marie', invite: `${inv.code.slice(0, 3)}-${inv.code.slice(3).toLowerCase()}` }, origin: `http://192.168.1.20:${gate.port}` });
            assert.equal(d.status, 200, d.text()); const j = d.json(); assert.match(j.code, /^\d{6}$/);
            const st = gate.status(); assert.equal(st.requests.length, 1); assert.equal(st.requests[0].code, j.code, 'le même code sur les deux écrans'); assert.equal(st.requests[0].ip, '192.168.1.34'); assert.equal(st.requests[0].name, 'Portable de Marie');
            peer = '192.168.1.41';
            assert.equal((await ask('POST', '/__lan/demande', { body: { name: 'Intrus', invite: inv.code } })).status, 403, 'le code d’invitation ne sert qu’une fois');
            peer = '192.168.1.34';
            assert.equal((await ask('GET', `/__lan/etat?id=${j.id}&k=faux`)).status, 404, 'sans la clé de la demande : rien');
            assert.equal((await ask('GET', `/__lan/etat?id=${j.id}&k=${j.poll}`)).json().state, 'attente');
            assert.equal(gate.accept('inconnu').ok, false);
            const a = gate.accept(j.id); assert.equal(a.ok, true); device = a.device;
            const ok = await ask('GET', `/__lan/etat?id=${j.id}&k=${j.poll}`);
            assert.equal(ok.json().state, 'accepte');
            const sc = String([].concat(ok.headers['set-cookie'])[0]);
            assert.match(sc, new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43}; Path=/; HttpOnly; SameSite=Strict; Max-Age=\\d+$`));
            guest.take(ok);
            assert.equal((await ask('GET', `/__lan/etat?id=${j.id}&k=${j.poll}`)).status, 404, 'le jeton ne se redonne pas');
            const file = fs.readFileSync(path.join(dataDir, 'reseau-local', 'appareils.json'), 'utf8');
            const token = guest.c[COOKIE];
            assert.ok(!file.includes(token), 'le jeton n’est pas gardé en clair');
            assert.ok(file.includes(require('node:crypto').createHash('sha256').update(token).digest('hex')), 'seulement son empreinte');
            if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dataDir, 'reseau-local', 'appareils.json')).mode & 0o077, 0, 'fichier lisible par son seul propriétaire');
        });
        await t('jeton faux, jeton d’un autre format, jeton dans un autre en-tête → refusé', async () => {
            for (const c of [`${COOKIE}=${'A'.repeat(43)}`, `${COOKIE}=${guest.c[COOKIE].slice(0, 42)}B`, `${COOKIE}=`, `${COOKIE}=../../x`, 'PHPSESSID=abc']) {
                assert.equal((await ask('GET', '/api.php?action=bootstrap', { cookie: c })).status, 401, c);
            }
            assert.equal((await ask('GET', '/api.php?action=bootstrap', { headers: { authorization: `Bearer ${guest.c[COOKIE]}` } })).status, 401);
        });
        await t('généalogie sans mot de passe : l’appareil accepté ne voit rien (« Il faut un mot de passe »)', async () => {
            const r = await ask('GET', '/', { cookie: guest.header() }); assert.equal(r.status, 423); assert.match(r.text(), /Il faut un mot de passe/); assert.doesNotMatch(r.text(), /MAZAUD/);
            const a = await ask('GET', '/api.php?action=bootstrap', { cookie: guest.header() }); assert.equal(a.status, 423); assert.equal(a.json().lan_nopw, true);
        });
        await t('mot de passe posé sur l’ordinateur principal → l’appareil doit le donner lui-même (séance par appareil)', async () => {
            const set = await mainPost('glock_set', { password: PW, password2: PW, minutes: 15, ack: 1 });
            assert.equal(set.status, 200, set.body.toString());
            const page = await ask('GET', '/', { cookie: guest.header() }); guest.take(page);
            assert.equal(page.status, 200); assert.match(page.text(), /data-glock-screen/); assert.match(page.text(), /Appareil invité/); assert.doesNotMatch(page.text(), /data-glock-others/, 'pas de changement de généalogie');
            assert.doesNotMatch(page.text(), /MAZAUD/);
            assert.equal((await ask('GET', '/api.php?action=bootstrap', { cookie: guest.header() })).status, 423);
            const csrf = JSON.parse(page.text().match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
            const origin = `http://192.168.1.20:${gate.port}`;
            const bad = await ask('POST', '/api.php?action=glock_unlock', { cookie: guest.header(), origin, body: { password: 'faux-faux-faux', csrf }, headers: { 'x-csrf-token': csrf } });
            assert.equal(bad.status, 401);
            await new Promise(r => setTimeout(r, 1200)); // essais freinés (lib/verrou.php)
            const good = await ask('POST', '/api.php?action=glock_unlock', { cookie: guest.header(), origin, body: { password: PW, csrf }, headers: { 'x-csrf-token': csrf } });
            assert.equal(good.status, 200, good.text()); guest.take(good);
            const boot = await ask('GET', '/api.php?action=bootstrap', { cookie: guest.header() });
            assert.equal(boot.status, 200); assert.match(boot.text(), /MAZAUD/);
            const k = (await ask('GET', '/api.php?action=kiosk_state', { cookie: guest.header() })).json();
            assert.equal(k.on, true); assert.equal(k.guest, 'Portable de Marie');
            const idx = await ask('GET', '/', { cookie: guest.header() });
            assert.match(idx.text(), /window\.LCNDA_GUEST = \{"name":"Portable de Marie"\}/);
            assert.equal((await server.request('/api.php?action=bootstrap')).status, 423, 'une autre séance (sans le mot de passe) reste fermée');
        });

        await t('invité en lecture seule : écrire, changer de généalogie, poser ou retirer le mot de passe, restaurer une copie… tout est refusé', async () => {
            const page = await ask('GET', '/', { cookie: guest.header() });
            const csrf = JSON.parse(page.text().match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
            const origin = `http://192.168.1.20:${gate.port}`;
            const post = (action, body = {}, p = '/api.php?action=' + action) => ask('POST', p, { cookie: guest.header(), origin, body: { ...body, csrf }, headers: { 'x-csrf-token': csrf } });
            for (const [action, body] of [['save_person', { id: 1, first_name: 'Pirate', last_name: 'MAZAUD' }], ['delete_person', { id: 1 }], ['genealogy_switch', { id: 'autre' }], ['genealogy_create', { name: 'X' }],
                ['glock_set', { password: 'abcdefgh1', password2: 'abcdefgh1', minutes: 15, ack: 1 }], ['glock_remove', { old: PW }], ['glock_change', { old: PW, password: 'x'.repeat(10), password2: 'x'.repeat(10) }],
                ['autobackup_restore', { file: 'x.db' }], ['autobackup_now', {}], ['autobackup_settings', { dir: '/tmp' }], ['backup_sqlite', {}], ['offsite_copy_now', {}], ['kiosk_exit', { password: 'x' }], ['kiosk_enter', { password: 'xxxx' }],
                ['switch_database', { key: 'x' }], ['access_log_settings', { months: 0 }], ['access_note', { what: 'dashboard_csv' }], ['premier_example_open', {}], ['import_local_path', { path: '/etc/passwd' }], ['museum_sign', { text: 'x' }]]) {
                const r = await post(action, body);
                assert.equal(r.status, 423, `${action} → ${r.status} ${r.text().slice(0, 120)}`); assert.equal(r.json().lan_guest, true, action);
            }
            assert.equal((await post('', {}, '/upload.php')).status, 423, 'envoyer un fichier');
            assert.equal((await ask('GET', '/telecharger.php', { cookie: guest.header() })).status, 423);
            for (const a of ['export_gedcom', 'export_sqlite', 'export_full_backup', 'access_log', 'access_log_csv', 'autobackup_tick', 'autobackup_check&dir=/', 'database_profiles']) {
                const r = await ask('GET', '/api.php?action=' + a, { cookie: guest.header() }); assert.equal(r.status, 423, `${a} → ${r.status}`);
            }
            const s = await post('save_settings', { settings: { 'genealogie-theme': 'x' } });
            assert.equal(s.status, 200); assert.equal(s.json().saved, 0, 'réglages d’affichage : rien n’est écrit');
            assert.equal(JSON.parse(sql("SELECT first_name FROM persons WHERE id=1"))[0].first_name, 'Jean', 'rien n’a changé');
            assert.equal(JSON.parse(sql("SELECT count(*) n FROM app_lock"))[0].n, 1, 'le mot de passe est toujours là');
        });
        await t('l’invité ne peut pas imiter le processus principal ni un autre appareil (en-têtes x-carnet-* retirés par la porte)', async () => {
            const h = { 'x-carnet-secret': server.secret, 'x-carnet-local': server.localSecret, 'x-carnet-gate': server.gateSecret, 'x-carnet-device': 'ffffffffffffffff', 'x-carnet-device-pw': '0', 'x-forwarded-for': '127.0.0.1' };
            const n = await ask('GET', '/api.php?action=lan_note&kind=lan_ok&label=pirate', { cookie: guest.header(), headers: h });
            assert.equal(n.status, 403, 'le registre ne s’écrit pas depuis un appareil');
            const r = await ask('GET', '/api.php?action=autobackup_close', { cookie: guest.header(), headers: h });
            assert.equal(r.status, 423);
            const k = (await ask('GET', '/api.php?action=kiosk_state', { cookie: guest.header(), headers: h })).json();
            assert.equal(k.guest, 'Portable de Marie', 'toujours lui, en lecture seule');
            // sans la porte : un en-tête d'appareil sans la signature est refusé (jamais pris pour la fenêtre principale)
            const forged = await server.request('/api.php?action=kiosk_state', { headers: { 'x-carnet-device': 'ffffffffffffffff' } });
            assert.equal(forged.status, 403);
            const forged2 = await server.request('/api.php?action=kiosk_state', { headers: { 'x-carnet-device': device.id, 'x-carnet-gate': 'faux' } });
            assert.equal(forged2.status, 403);
        });
        await t('📜 registre : l’appareil réel (colonne device), les gestes de la porte notés par le processus principal seulement', async () => {
            const r = await server.request(`/api.php?action=lan_note&kind=lan_ok&label=${encodeURIComponent('Portable de Marie')}`, { headers: { 'x-carnet-local': server.localSecret } });
            assert.equal(r.status, 200);
            const bad = await server.request('/api.php?action=lan_note&kind=lan_ok&label=x'); assert.equal(bad.status, 403, 'sans le second secret : refusé');
            const rows = JSON.parse(sql("SELECT kind, obj_label, machine, device FROM access_log ORDER BY id"));
            const fail = rows.find(x => x.kind === 'unlock_fail'), ok = rows.find(x => x.kind === 'unlock_ok' && x.device);
            assert.equal(fail.device, 'Portable de Marie'); assert.equal(ok.device, 'Portable de Marie');
            assert.ok(rows.some(x => x.kind === 'lock_set' && x.device === ''), 'le mot de passe posé sur l’ordinateur principal : sans appareil');
            assert.ok(rows.some(x => x.kind === 'lan_ok' && x.obj_label === 'Portable de Marie' && x.device === ''));
            assert.ok(!rows.some(x => x.obj_label === 'pirate'));
        });
        await t('le secret interne ne sort jamais sur le réseau (toutes les réponses lues)', () => {
            assert.ok(seen.length > 40);
            for (const r of seen) leaks(r);
        });
        await t('appareil retiré : refusé tout de suite, sa connexion déjà ouverte est coupée ; ↶ Annuler dans les 10 s', async () => {
            const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
            const r1 = await ask('GET', '/api.php?action=kiosk_state', { cookie: guest.header(), agent });
            assert.equal(r1.status, 200);
            const sock = r1.socket; let closed = false; sock.on('close', () => { closed = true; });
            assert.equal(gate.remove(device.id).ok, true);
            await new Promise(r => setTimeout(r, 200));
            assert.ok(closed, 'la connexion ouverte est coupée');
            assert.equal((await ask('GET', '/api.php?action=kiosk_state', { cookie: guest.header() })).status, 401);
            assert.equal((await ask('GET', '/', { cookie: guest.header() })).status, 200); // la page « Demander l'accès »
            assert.match((await ask('GET', '/', { cookie: guest.header() })).text(), /appairage\.js/);
            assert.equal(gate.undoRemove(device.id).ok, true);
            assert.equal((await ask('GET', '/api.php?action=kiosk_state', { cookie: guest.header() })).status, 200, 'remis');
            gate.remove(device.id); gate.removed.get(device.id).removedAt -= 11000;
            assert.equal(gate.undoRemove(device.id).ok, false, 'après 10 s : il faut l’autoriser de nouveau');
            assert.equal((await ask('GET', '/api.php?action=kiosk_state', { cookie: guest.header() })).status, 401);
            agent.destroy();
        });
        await t('code d’invitation faux répété : 5 essais, puis plus aucune demande pendant 15 min (même avec le bon code)', async () => {
            gate.newInvite(); gate.fails.invite = 0;
            for (let i = 0; i < MAX_FAILS; i++) { peer = `192.168.1.${100 + i}`; const r = await ask('POST', '/__lan/demande', { body: { name: 'Essai', invite: 'ZZZZZZ' } }); assert.equal(r.status, 403, `essai ${i + 1}`); }
            const good = gate.status().invite;
            assert.equal(good, null, 'plus de code tant que c’est en pause');
            const r = await ask('POST', '/__lan/demande', { body: { name: 'Essai', invite: gate.invite ? gate.invite.code : 'ZZZZZZ' } });
            assert.equal(r.status, 429); assert.ok(r.json().wait > 800);
            assert.equal(gate.status().pauseReason, 'code');
            gate.fails.pauseUntil = 0; // fin de la pause (pour la suite de l'essai)
        });
        await t('5 demandes refusées d’affilée → pause ; une demande sans réponse expire au bout de 2 min (refusée)', async () => {
            gate.setSettings({ invite: 'sans' });
            for (let i = 0; i < MAX_FAILS; i++) {
                peer = `192.168.1.${150 + i}`;
                const d = (await ask('POST', '/__lan/demande', { body: { name: `Inconnu ${i}` } })).json();
                assert.ok(d.id); assert.equal(gate.refuse(d.id).ok, true);
                assert.equal((await ask('GET', `/__lan/etat?id=${d.id}&k=${d.poll}`)).json().state, 'refuse');
            }
            assert.equal((await ask('POST', '/__lan/demande', { body: { name: 'Encore' } })).status, 429);
            assert.equal(gate.status().pauseReason, 'refus');
            gate.fails.pauseUntil = 0;
            peer = '192.168.1.200';
            const d = (await ask('POST', '/__lan/demande', { body: { name: 'Lent' } })).json();
            assert.equal((await ask('POST', '/__lan/demande', { body: { name: 'Lent' } })).status, 409, 'une seule demande à la fois par appareil');
            gate.requests.get(d.id).at -= 121000;
            assert.equal((await ask('GET', `/__lan/etat?id=${d.id}&k=${d.poll}`)).json().state, 'expire');
            assert.equal(gate.accept(d.id).ok, false, 'trop tard pour l’accepter');
        });
        await t('⏻ Tout couper : le port est fermé (connexion refusée) ; un accès « pour cette fois seulement » ne survit pas', async () => {
            gate.fails.pauseUntil = 0; gate.fails.refused = 0;
            gate.setSettings({ duration: 'fermeture' });
            peer = '192.168.1.60';
            const d = (await ask('POST', '/__lan/demande', { body: { name: 'Une fois' } })).json();
            gate.accept(d.id);
            const port = gate.port;
            assert.equal(await connectTo(port), 'ouvert');
            await gate.close('main');
            assert.equal(gate.isOn, false);
            assert.equal(await connectTo(port), 'ECONNREFUSED', 'plus rien n’écoute');
            assert.ok(!gate.status().devices.some(x => x.name === 'Une fois'));
            assert.equal(gate.status().devices.length, 0);
            const again = new LanGate({ server, dataDir, appRoot, test: { bind: '127.0.0.1', address: HOME, peer: () => peer } });
            assert.equal(again.isOn, false, 'au lancement suivant : coupée');
            assert.equal(again.state.port, port, 'le port est gardé pour la prochaine ouverture');
            assert.equal(again.settings.duration, 'fermeture', 'les réglages sont gardés');
        });
    } finally {
        try { await gate.close('quit'); } catch (_) {}
        await server.stop();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    finish();
})().catch(e => { console.error(e); process.exit(1); });

function finish() {
    if (failed) { console.error(`\n${failed} essai(s) en échec, ${passed} réussi(s)`); process.exit(1); }
    console.log(`\nTous les essais de la porte du wifi passent (${passed}).`);
    process.exit(0);
}
