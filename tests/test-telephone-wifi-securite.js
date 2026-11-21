'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📱 Le téléphone par le wifi : essais de SÉCURITÉ (maquette docs/design/telephone-wifi.html ; electron/lan-gate.js,
 * lib/reseau_local.php, lib/telephone_wifi.php, terrain.php).      node tests/test-telephone-wifi-securite.js
 *
 * Le téléphone de terrain ne doit pouvoir QUE déposer dans 📥 À trier et lire la liste réduite « Pour qui ? ». Chaque cas est
 * vérifié en vrai, contre la porte du wifi et le vrai PHP (electron/php-server.js), l'adresse de la maison simulée (la porte
 * écoute sur 127.0.0.1, l'adresse de l'appareil est donnée par l'essai) :
 *  A. jetons : aucun, faux, d'un appareil retiré, d'un ordinateur invité (autre sorte) ; comparaison en temps constant ;
 *  B. liste blanche : une longue liste d'actions et de chemins (lecture de l'arbre, exports, sauvegardes, réglages,
 *     modifications, suppressions, imports, médias, registre…) refusée au téléphone, par la porte ET par PHP (même si la porte
 *     laissait passer) ; la liste blanche est une liste blanche des deux côtés ;
 *  C. réseau : adresse non privée, Host / Origin / Referer forgés (DNS rebinding), CSRF, porte éteinte, inondation (429) ;
 *  D. fichiers : faux type (.php, .html, SVG avec script, PDF renommés en .jpg), HEIC, polyglotte JPEG+HTML+PHP, trop gros (porte
 *     et PHP), trop de fichiers, trop de photos dans un envoi, total trop gros, boîte pleine, noms avec ../, chemin absolu,
 *     caractères de contrôle, image abîmée, bombe de décompression ; fichiers stockés jamais servis avec un type exécutable ;
 *     nom tiré au hasard ; GPS et métadonnées retirés (octets EXIF du fichier stocké) ou gardés à part (réglage) ;
 *  E. « Pour qui ? » : jamais un vivant ni une fiche confidentielle, ni en recherche par nom, ni par numéro, ni en déposant ;
 *  F. mode consultation, verrou de la généalogie (glock), 📜 Qui a vu quoi (chaque dépôt, avec l'appareil), ↶ Annuler du
 *     téléphone limité à ses propres photos ;
 *  G. horloge simulée (second PHP, GENEALOGY_TEST=1) : mot de passe redemandé après 15 min ; 5 mots de passe faux → ce téléphone
 *     attend 15 min ; photos supprimées vraiment effacées après 30 jours, « ↶ Annuler » ne restaure rien au-delà ;
 *  H. navigateur (Playwright, si présent) : le texte venu du téléphone est échappé dans 📥 À trier et dans 📜 Qui a vu quoi.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs, PhpServer } = require('../electron/php-server');
const { LanGate, COOKIE, TERRAIN_ACTIONS, TERRAIN_RATE } = require('../electron/lan-gate');

const appRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let failed = 0, passed = 0;
const names = [];
const hooks = [];
const t = async (name, fn) => { hooks.forEach(h => h()); try { await fn(); passed++; names.push(['✓', name]); console.log('✓', name); } catch (e) { failed++; names.push(['✗', name]); console.error('✗', name, '\n ', e && e.stack || e); } };
const PW = 'Mazaud-Terrain-2026-secret';
const HOME = { ip: '192.168.1.20', prefix: 24 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ═════ petites fabriques ═════ */
function crcTable() { const tb = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; } return tb; }
const CRC = crcTable();
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const pngChunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
/** un PNG qui annonce des dimensions énormes (bombe de décompression) : seul l'en-tête compte */
function pngBomb(w, h) {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    const idat = require('node:zlib').deflateSync(Buffer.alloc(1024 * 64)); // peu d'octets, des milliards de points annoncés
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}
/** un bloc EXIF (TIFF petit-boutiste) avec une position GPS, un appareil et une date : posé dans un JPEG (APP1) */
function exifBlock(lat = 45.3133, lon = 1.7611) {
    const ents0 = [[0x010F, 2, 'MAZAUD-PHONE\0'], [0x0132, 2, '2026:11:21 14:41:00\0'], [0x8825, 4, null]];
    const rat = v => { const d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 60 * 100); return [[d, 1], [m, 1], [s, 100]]; };
    const gps = [[1, 2, 'N\0'], [2, 5, rat(lat)], [3, 2, 'E\0'], [4, 5, rat(lon)]];
    const parts = []; let size = 8;
    const ifd0At = 8, ifd0Len = 2 + ents0.length * 12 + 4; size += ifd0Len;
    const gpsAt = size, gpsLen = 2 + gps.length * 12 + 4; size += gpsLen;
    const extra = []; // valeurs longues
    const place = buf => { const at = size; extra.push(buf); size += buf.length; return at; };
    const b = Buffer.alloc(4096); b.write('II', 0, 'latin1'); b.writeUInt16LE(42, 2); b.writeUInt32LE(ifd0At, 4);
    const writeIfd = (at, ents) => {
        b.writeUInt16LE(ents.length, at);
        ents.forEach(([tag, type, val], i) => {
            const e = at + 2 + i * 12; b.writeUInt16LE(tag, e); b.writeUInt16LE(type, e + 2);
            if (type === 2) { const s = Buffer.from(val, 'latin1'); b.writeUInt32LE(s.length, e + 4); if (s.length <= 4) s.copy(b, e + 8); else b.writeUInt32LE(place(s), e + 8); }
            else if (type === 5) { const r = Buffer.alloc(val.length * 8); val.forEach(([n, d], j) => { r.writeUInt32LE(n, j * 8); r.writeUInt32LE(d, j * 8 + 4); }); b.writeUInt32LE(val.length, e + 4); b.writeUInt32LE(place(r), e + 8); }
            else if (tag === 0x8825) { b.writeUInt32LE(1, e + 4); b.writeUInt32LE(gpsAt, e + 8); }
        });
        b.writeUInt32LE(0, at + 2 + ents.length * 12);
    };
    writeIfd(ifd0At, ents0); writeIfd(gpsAt, gps);
    let tiff = b.subarray(0, gpsAt + gpsLen);
    tiff = Buffer.concat([tiff, ...extra]);
    void parts;
    return Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
}
const withApp1 = (jpg, payload) => { const len = Buffer.alloc(2); len.writeUInt16BE(payload.length + 2); return Buffer.concat([jpg.subarray(0, 2), Buffer.from([0xFF, 0xE1]), len, payload, jpg.subarray(2)]); };
const withCom = (jpg, text) => { const p = Buffer.from(text, 'latin1'); const len = Buffer.alloc(2); len.writeUInt16BE(p.length + 2); return Buffer.concat([jpg.subarray(0, 2), Buffer.from([0xFF, 0xFE]), len, p, jpg.subarray(2)]); };
/** un envoi multipart (formulaire avec fichiers), écrit à la main pour pouvoir y glisser n'importe quel nom de fichier */
function multipart(fields = {}, files = []) {
    const bd = '----lcnda' + crypto.randomBytes(8).toString('hex');
    const chunks = [];
    for (const [k, v] of Object.entries(fields)) chunks.push(Buffer.from(`--${bd}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
    for (const f of files) chunks.push(Buffer.from(`--${bd}\r\nContent-Disposition: form-data; name="${f.field || 'photo'}"; filename="${f.name || 'photo.jpg'}"\r\nContent-Type: ${f.type || 'image/jpeg'}\r\n\r\n`, 'utf8'), f.data, Buffer.from('\r\n'));
    chunks.push(Buffer.from(`--${bd}--\r\n`));
    return { body: Buffer.concat(chunks), type: `multipart/form-data; boundary=${bd}` };
}

(async () => {
    /* ═════ 0. sans serveur : les listes blanches, la comparaison du jeton ═════ */
    await t('liste blanche des deux côtés : la porte (TERRAIN_ACTIONS) et PHP (TW_PHONE_ACTIONS) connaissent les six mêmes actions, chacune avec sa méthode', () => {
        assert.deepEqual(TERRAIN_ACTIONS, { state: 'GET', list: 'GET', unlock: 'POST', lock: 'POST', deposit: 'POST', undo: 'POST' });
        const php = read('lib/telephone_wifi.php');
        assert.match(php, /const TW_PHONE_ACTIONS = \['state' => 'GET', 'list' => 'GET', 'unlock' => 'POST', 'lock' => 'POST', 'deposit' => 'POST', 'undo' => 'POST'\];/);
        assert.match(php, /if \(!isset\(TW_PHONE_ACTIONS\[\$action\]\)\) \{ tw_phone_json\(\['error' => 'Refusé\.'\], 403\); \}/, 'action inconnue : refusée (liste blanche, pas liste noire)');
        const rl = read('lib/reseau_local.php');
        assert.match(rl, /if \(\$terrain && \$path !== '\/terrain\.php'\) \{/, 'PHP : un téléphone n’atteint que /terrain.php');
        const g = read('electron/lan-gate.js');
        assert.ok(g.indexOf("if (dev.kind === 'terrain') { this._terrain(") < g.indexOf('this._forward(req, res, dev, peer, u);\n    }'), 'la porte aiguille le téléphone avant de transmettre quoi que ce soit');
        assert.match(g, /if \(p !== '\/terrain\.php'\) \{ refuse\(\); return; \}/);
    });
    await t('jeton comparé en temps constant (crypto.timingSafeEqual sur l’empreinte) ; signature de la porte comparée par hash_equals', () => {
        const g = read('electron/lan-gate.js');
        assert.match(g, /const safeEqual = \(a, b\) => \{[^}]*crypto\.timingSafeEqual\(x, y\)/);
        assert.match(g, /const d = this\.devices\.find\(\(x\) => safeEqual\(x\.hash, h\)\);/);
        assert.match(read('lib/reseau_local.php'), /hash_equals\(\$gate, \$given\)/);
        assert.match(read('lib/telephone_wifi.php'), /hash_equals\(\(string\) \$info\['lock_id'\], \$e\['lock'\]\)/);
    });

    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const gdOk = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', 'echo extension_loaded("gd") ? "1" : "0";'], { encoding: 'utf8' }).stdout === '1';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-terrain-'));
    const img = (kind, w = 64, h = 48, extra = '') => { const f = path.join(tmp, `img-${kind}-${w}x${h}-${crypto.randomBytes(3).toString('hex')}.${kind}`);
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$im=imagecreatetruecolor((int)$argv[2],(int)$argv[3]); imagefill($im,0,0,imagecolorallocate($im,190,120,60)); imagestring($im,3,4,4,'MAZAUD',imagecolorallocate($im,10,10,10)); ${extra} if($argv[4]==='jpg') imagejpeg($im,$argv[1],90); elseif($argv[4]==='png') imagepng($im,$argv[1]); else imagewebp($im,$argv[1],90);`, f, String(w), String(h), kind], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error(r.stderr); return fs.readFileSync(f); };
    const seedDb = (dataDir, env) => {
        const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private) VALUES
 (1,'Jean','LACOMBE','male','deceased',0),(2,'Odette','LACOMBE','female','deceased',0),(3,'Marie','LACOMBE','female','living',0),
 (4,'Paul','LACOMBE','male','deceased',1),(5,'Louise','DURAND','female','unknown',0),(6,'Pierre','LACOMBE','male','unknown',0),(7,'Henri','MAZAUD','male','living',1)");
$deat = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='DEAT' AND scope='person' LIMIT 1")->fetchColumn();
$birt = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' AND scope='person' LIMIT 1")->fetchColumn();
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',5,?,'1950',1950),('person',1,?,'1934',1934),('person',1,?,'1871',1871)")->execute([$deat,$deat,$birt]);
$pdo->exec("INSERT INTO archive_visit_plans(id,title,archive_center,visit_date) VALUES(1,'Visite','AD Corrèze','2099-11-27'),(2,'Ancienne','AD Cantal','2001-01-01')");
echo $deat > 0 ? 'ok' : 'deat?';`], { cwd: appRoot, encoding: 'utf8', env });
        if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    };
    const sqlOf = dataDir => (q, ...args) => JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p=new PDO('sqlite:'.$argv[1]);$s=$p->prepare($argv[2]);$s->execute(array_slice($argv,3));echo json_encode($s->fetchAll(PDO::FETCH_ASSOC));`, path.join(dataDir, 'genealogy.sqlite'), q, ...args.map(String)], { encoding: 'utf8' }).stdout || '[]');

    /* ═════ outils communs à une porte et à un PHP ═════ */
    function rig(gate, srvReq, secrets = []) {
        let peer = '192.168.1.52';
        gate.test.peer = () => peer;
        const seen = [];
        const leaks = r => { const all = JSON.stringify(r.headers) + r.body.toString('latin1'); for (const s of secrets) if (s) assert.ok(!all.includes(s), 'un secret interne est sorti sur le réseau'); };
        const ask = (method, p, { cookie = '', body = null, origin, referer, host, headers = {}, type } = {}) => new Promise((resolve, reject) => {
            const h = { host: host || `${HOME.ip}:${gate.port}`, ...headers };
            if (cookie) h.cookie = cookie;
            if (origin !== undefined) h.origin = origin;
            if (referer !== undefined) h.referer = referer;
            let data = null;
            if (body !== null) { data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); h['content-type'] = type || h['content-type'] || 'application/json'; if (h['content-length'] === undefined) h['content-length'] = data.length; }
            const req = http.request({ host: '127.0.0.1', port: gate.port, method, path: p, headers: h, agent: false }, res => {
                const chunks = []; res.on('data', c => chunks.push(c));
                res.on('end', () => { const r = { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }; r.json = () => { try { return JSON.parse(r.body.toString()); } catch (_) { return {}; } }; r.text = () => r.body.toString(); seen.push(r); leaks(r); resolve(r); });
            });
            req.on('error', e => resolve({ status: 0, error: e.code || e.message, headers: {}, body: Buffer.alloc(0), json: () => ({}), text: () => '' }));
            req.setTimeout(60000, () => req.destroy(new Error('timeout')));
            req.end(data === null ? undefined : data);
        });
        const jar = () => { const c = {}; return { header: () => Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '), take: r => { for (const sc of [].concat(r.headers['set-cookie'] || [])) { const [kv] = sc.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); } }, c }; };
        const origin = () => `http://${HOME.ip}:${gate.port}`;
        /** appairer un appareil : la demande, le code à 6 chiffres comparé, accepté ici avec la sorte choisie */
        const pair = async (name, kind, wants = kind) => {
            const inv = gate.status().invite;
            const j = jar();
            const d = await ask('POST', '/__lan/demande', { body: { name, invite: inv ? inv.code : '', kind: wants }, origin: origin() });
            assert.equal(d.status, 200, d.text());
            const st = gate.status().requests.find(r => r.id === d.json().id);
            assert.equal(st.code, d.json().code, 'le même code à 6 chiffres des deux côtés'); assert.equal(st.wants, wants === 'terrain' ? 'terrain' : 'lecture');
            const a = gate.accept(d.json().id, kind); assert.equal(a.ok, true);
            const e = await ask('GET', `/__lan/etat?id=${d.json().id}&k=${d.json().poll}`); assert.equal(e.json().state, 'accepte'); j.take(e);
            return { jar: j, id: a.device.id, kind: a.device.kind };
        };
        /** le téléphone : son état (et donc sa séance PHP), son jeton CSRF */
        const phone = dev => {
            const P = { dev, csrf: '', genealogy: '' };
            P.state = async () => { const r = await ask('GET', '/terrain.php?action=state', { cookie: dev.jar.header() }); dev.jar.take(r); if (r.status === 200) { P.csrf = r.json().csrf; P.genealogy = r.json().genealogy; } return r; };
            P.post = async (action, body = {}, o = {}) => { const r = await ask('POST', `/terrain.php?action=${action}`, { cookie: dev.jar.header(), origin: origin(), body: { ...body, csrf: P.csrf }, headers: { 'x-csrf-token': P.csrf, ...(o.headers || {}) }, ...o }); dev.jar.take(r); if (r.json().csrf) P.csrf = r.json().csrf; return r; };
            P.unlock = (pw = PW) => P.post('unlock', { password: pw });
            P.list = async q => { const r = await ask('GET', `/terrain.php?action=list&q=${encodeURIComponent(q)}`, { cookie: dev.jar.header() }); dev.jar.take(r); return r; };
            P.deposit = async (files, fields = {}, o = {}) => {
                const m = multipart({ csrf: P.csrf, batch: fields.batch || crypto.randomBytes(12).toString('hex'), note: '', for: '', ...fields }, files);
                const r = await ask('POST', '/terrain.php?action=deposit', { cookie: dev.jar.header(), origin: o.origin === undefined ? origin() : o.origin, body: m.body, type: m.type, headers: { 'x-csrf-token': o.csrf ?? P.csrf, ...(o.headers || {}) }, ...(o.referer !== undefined ? { referer: o.referer } : {}) });
                dev.jar.take(r); return r;
            };
            return P;
        };
        /** la fenêtre de l'ordinateur principal */
        const main = jar();
        const mainAsk = async (p, o = {}) => { const r = await srvReq(p, { ...o, headers: { ...(o.headers || {}), cookie: main.header() } }); main.take(r); return r; };
        const mainCsrf = async () => { const r = await mainAsk('/'); return JSON.parse((r.body.toString().match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""'); };
        let csrfM = '';
        const mainPost = async (action, body) => { if (!csrfM) csrfM = await mainCsrf(); const data = JSON.stringify({ ...body, csrf: csrfM }); let r = await mainAsk('/api.php?action=' + action, { method: 'POST', body: data, headers: { 'content-type': 'application/json', 'x-csrf-token': csrfM } }); if (r.status === 419) { csrfM = await mainCsrf(); r = await mainAsk('/api.php?action=' + action, { method: 'POST', body: JSON.stringify({ ...body, csrf: csrfM }), headers: { 'content-type': 'application/json', 'x-csrf-token': csrfM } }); } return r; };
        const mainGet = (action, q = '') => mainAsk(`/api.php?action=${action}${q}`);
        const setTw = async s => { const r = await mainPost('inbox_write', { op: 'settings', settings: s }); assert.equal(r.status, 200, r.body.toString()); return JSON.parse(r.body.toString()).settings; };
        return { ask, jar, pair, phone, origin, mainPost, mainGet, mainAsk, setTw, seen, leaks, setPeer: p => { peer = p; }, refreshCsrf: async () => { csrfM = await mainCsrf(); } };
    }

    /* ═════ A–F : le vrai PHP de l'app (avec ses secrets) et la porte ═════ */
    const dataDir = path.join(tmp, 'data'), mediaDir = path.join(tmp, 'media');
    fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(mediaDir, { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dataDir, GENEALOGY_MEDIA_DIR: mediaDir, GENEALOGY_SKIP_REFERENCE: '1' };
    seedDb(dataDir, env);
    const sql = sqlOf(dataDir);
    for (const k of Object.keys(env)) process.env[k] = env[k];
    const server = new PhpServer({ phpPath, appRoot, pool: 2, dataDir, mediaDir, sessionDir: path.join(tmp, 'sessions'), logFile: path.join(tmp, 'logs', 'php.log') });
    server.on('error', () => {});
    await server.start();
    const gate = new LanGate({ server, dataDir, appRoot, test: { bind: '127.0.0.1', address: HOME, peer: () => '192.168.1.52' } });
    const R = rig(gate, (p, o) => server.request(p, { timeout: 60000, ...o }), [server.secret, server.gateSecret, server.localSecret]);
    const { ask } = R;
    hooks.push(() => gate.rate.clear()); // le débit est essayé à part (C5) : les autres essais ne s'y heurtent pas
    let tel = null, P = null, guest = null;
    const inbox = () => sql("SELECT * FROM phone_inbox ORDER BY id");
    const boxDir = path.join(dataDir, 'a-trier');
    const jpg = img('jpg'), png = img('png');

    try {
        await t('mise en place : mot de passe posé, porte ouverte, un téléphone de terrain et un ordinateur invité appairés (code à 6 chiffres comparé)', async () => {
            const set = await R.mainPost('glock_set', { password: PW, password2: PW, minutes: 15, ack: 1 });
            assert.equal(set.status, 200, set.body.toString());
            await R.refreshCsrf();
            assert.equal((await gate.open({ passwordOk: true })).ok, true);
            tel = await R.pair('Téléphone de Marie', undefined, 'terrain');
            assert.equal(tel.kind, 'terrain', 'la sorte demandée par le téléphone est proposée');
            R.setPeer('192.168.1.41');
            guest = await R.pair('Portable de Paul', 'lecture', 'lecture');
            R.setPeer('192.168.1.52');
            P = R.phone(tel);
            const st = await P.state();
            assert.equal(st.status, 200, st.text()); assert.equal(st.json().needs_pw, true); assert.equal(st.json().locked, true);
            assert.doesNotMatch(st.text(), /LACOMBE|DURAND/, 'avant le mot de passe : aucun nom');
            const devs = gate.status().devices; assert.equal(devs.find(d => d.id === tel.id).kind, 'terrain'); assert.equal(devs.find(d => d.id === guest.id).kind, 'lecture');
        });

        /* ─── A. jetons ─── */
        await t('A1 sans jeton, jeton faux, jeton d’un autre format, jeton dans un autre en-tête → refusé (401), rien transmis à PHP', async () => {
            for (const c of ['', `${COOKIE}=${'A'.repeat(43)}`, `${COOKIE}=${tel.jar.c[COOKIE].slice(0, 42)}x`, `${COOKIE}=../../x`, `${COOKIE}=${tel.jar.c[COOKIE]}A`]) {
                const r = await ask('GET', '/terrain.php?action=state', { cookie: c });
                assert.equal(r.status, 401, `${c} → ${r.status}`);
                const d = await ask('POST', '/terrain.php?action=deposit', { cookie: c, origin: R.origin(), body: multipart({}, [{ data: jpg }]).body, type: 'multipart/form-data' });
                assert.equal(d.status, 401);
            }
            assert.equal((await ask('GET', '/terrain.php?action=state', { headers: { authorization: `Bearer ${tel.jar.c[COOKIE]}` } })).status, 401);
            assert.equal(inbox().length, 0);
        });
        await t('A2 jeton d’un ordinateur invité (sorte « lecture seule ») : /terrain.php refusé par PHP (403), même avec le mot de passe', async () => {
            R.setPeer('192.168.1.41');
            const gj = guest.jar;
            const page = await ask('GET', '/', { cookie: gj.header() }); gj.take(page);
            const csrf = JSON.parse((page.text().match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
            const un = await ask('POST', '/api.php?action=glock_unlock', { cookie: gj.header(), origin: R.origin(), body: { password: PW, csrf }, headers: { 'x-csrf-token': csrf } }); gj.take(un);
            assert.equal(un.status, 200, un.text());
            const st = await ask('GET', '/terrain.php?action=state', { cookie: gj.header() });
            assert.equal(st.status, 403, st.text());
            const m = multipart({ csrf, batch: 'a'.repeat(24) }, [{ data: jpg }]);
            const d = await ask('POST', '/terrain.php?action=deposit', { cookie: gj.header(), origin: R.origin(), body: m.body, type: m.type, headers: { 'x-csrf-token': csrf } });
            assert.ok([403, 423].includes(d.status), `${d.status} ${d.text()}`);
            assert.equal(inbox().length, 0, 'rien déposé par un ordinateur invité');
            R.setPeer('192.168.1.52');
        });
        await t('A3 jeton d’un téléphone retiré : refusé tout de suite (401), ses connexions ouvertes coupées ; ↶ Annuler dans les 10 s seulement', async () => {
            const tmpDev = await R.pair('Vieux téléphone', 'terrain');
            const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
            const r1 = await new Promise(res => http.get({ host: '127.0.0.1', port: gate.port, path: '/terrain.php?action=state', headers: { host: `${HOME.ip}:${gate.port}`, cookie: tmpDev.jar.header() }, agent }, x => { const sock = x.socket; x.resume(); x.on('end', () => { x.sock = sock; res(x); }); }));
            assert.equal(r1.statusCode, 200);
            let closed = false; r1.sock.on('close', () => { closed = true; });
            assert.equal(gate.remove(tmpDev.id).ok, true);
            await sleep(150); assert.ok(closed, 'connexion coupée');
            assert.equal((await ask('GET', '/terrain.php?action=state', { cookie: tmpDev.jar.header() })).status, 401);
            gate.removed.get(tmpDev.id).removedAt -= 11000;
            assert.equal(gate.undoRemove(tmpDev.id).ok, false);
            assert.equal((await ask('GET', '/terrain.php?action=state', { cookie: tmpDev.jar.header() })).status, 401, 'toujours refusé');
            agent.destroy();
        });
        await t('A4 la sorte d’un appareil ne se choisit pas depuis le réseau : « kind » inconnu refusé, en-tête x-carnet-device-kind forgé retiré', async () => {
            const inv = gate.status().invite; R.setPeer('192.168.1.77');
            const d = (await ask('POST', '/__lan/demande', { body: { name: 'Intrus', invite: inv.code, kind: 'admin' }, origin: R.origin() })).json();
            assert.equal(gate.status().requests.find(r => r.id === d.id).wants, 'lecture', 'une sorte inconnue devient la plus fermée proposée');
            assert.deepEqual(gate.accept(d.id, 'admin'), { ok: false, error: 'kind' });
            gate.refuse(d.id); R.setPeer('192.168.1.52');
            // un ordinateur invité qui prétend être un téléphone, ou l'inverse : l'en-tête venu du réseau est retiré par la porte
            const r = await ask('GET', '/api.php?action=bootstrap', { cookie: tel.jar.header(), headers: { 'x-carnet-device-kind': 'lecture', 'x-carnet-gate': server.gateSecret } });
            assert.equal(r.status, 403); assert.doesNotMatch(r.text(), /LACOMBE/);
        });

        /* ─── le téléphone ouvre sa séance ─── */
        await t('séance du téléphone : mot de passe faux refusé (401), bon mot de passe : ouverte ; la liste réduite répond', async () => {
            assert.equal((await P.list('lacombe')).status, 423, 'sans mot de passe : rien');
            const bad = await P.unlock('faux-faux-faux'); assert.equal(bad.status, 401, bad.text());
            await sleep(1200);
            const good = await P.unlock(); assert.equal(good.status, 200, good.text());
            const l = await P.list('lacombe'); assert.equal(l.status, 200, l.text());
        });

        /* ─── B. liste blanche ─── */
        await t('B1 un téléphone ne peut appeler AUCUNE autre action de l’API, ni aucun autre chemin (lecture, export, sauvegarde, réglages, modification, suppression, import, médias, registre…)', async () => {
            const gets = ['bootstrap', 'person&id=1', 'people', 'tree&id=1', 'list&type=persons', 'quick_search&q=LACOMBE', 'map', 'export_gedcom', 'export_csv', 'export_json', 'export_sqlite', 'export_full_backup', 'export_plus',
                'access_log', 'access_log_csv', 'database_profiles', 'genealogies', 'glock_state', 'kiosk_state', 'inbox_list', 'inbox_file&id=1', 'inbox_count', 'inbox_settings', 'compl&op=settings', 'photomaps', 'picker_search&kind=person&q=la',
                'family_share_preview', 'website_export', 'sync_export', 'vault_download', 'autobackup_check&dir=/', 'desk_widget_page', 'schema_status'];
            for (const a of gets) {
                gate.rate.clear(); // le débit est essayé à part (C5)
                const r = await ask('GET', '/api.php?action=' + a, { cookie: tel.jar.header() });
                assert.equal(r.status, 403, `GET ${a} → ${r.status}`); assert.doesNotMatch(r.text(), /LACOMBE|DURAND|MAZAUD/, a);
            }
            const posts = ['save_person', 'delete_person', 'save_event', 'add_event', 'delete_event', 'save_settings', 'inbox_write', 'glock_unlock', 'glock_set', 'glock_remove', 'kiosk_exit', 'kiosk_enter', 'genealogy_switch', 'genealogy_create',
                'switch_database', 'delete_database', 'backup_sqlite', 'autobackup_restore', 'autobackup_now', 'import_local_path', 'import_package', 'init_database', 'import_preview', 'compl_write', 'photomap_write', 'access_log_settings', 'museum_sign', 'lan_note'];
            for (const a of posts) {
                gate.rate.clear();
                const r = await ask('POST', '/api.php?action=' + a, { cookie: tel.jar.header(), origin: R.origin(), body: { csrf: P.csrf, id: 1 }, headers: { 'x-csrf-token': P.csrf } });
                assert.equal(r.status, 403, `POST ${a} → ${r.status}`);
            }
            const paths = [['GET', '/index.php?x=1'], ['GET', '/upload.php'], ['POST', '/upload.php'], ['GET', '/telecharger.php'], ['GET', '/router.php'], ['GET', '/media/x.jpg'], ['GET', '/assets/js/app.js'], ['GET', '/assets/css/ui.css'],
                ['GET', '/__health'], ['GET', '/lib/verrou.php'], ['GET', '/data/genealogy.sqlite'], ['GET', '/a-trier/x.jpg'], ['GET', '/carnet-numerique-des-ancetres.php'], ['GET', '/TERRAIN.PHP?action=state'], ['GET', '/terrain.php/../api.php?action=bootstrap'],
                ['GET', '//api.php?action=bootstrap'], ['GET', '/terrain.php%00?action=state'], ['GET', '/terrain.php?action=bogus'], ['GET', '/terrain.php?action=deposit'], ['POST', '/terrain.php?action=state'], ['POST', '/terrain.php?action=list'],
                ['GET', '/terrain.php?action=unlock'], ['PUT', '/terrain.php?action=deposit'], ['DELETE', '/terrain.php?action=undo'], ['GET', '/terrain.php'], ['GET', '/__lan/f/../../lib/verrou.php'], ['GET', '/__lan/f/appairage.php'], ['GET', '/assets/i18n/../../lib/x.json']];
            for (const [m, p] of paths) {
                gate.rate.clear();
                const r = await ask(m, p, { cookie: tel.jar.header(), origin: R.origin(), ...(m === 'GET' ? {} : { body: { csrf: P.csrf } }) });
                assert.ok([403, 404, 405, 400].includes(r.status), `${m} ${p} → ${r.status}`); assert.doesNotMatch(r.text(), /LACOMBE|DURAND|<\?php/, p);
            }
            // ce qui lui est permis : sa page, ses trois fichiers, les mots de la langue
            for (const p of ['/', '/terrain', '/__lan/f/terrain.js', '/__lan/f/terrain.css', '/__lan/f/i18n.js', '/assets/i18n/en.json']) assert.equal((await ask('GET', p, { cookie: tel.jar.header() })).status, 200, p);
            const page = await ask('GET', '/terrain', { cookie: tel.jar.header() });
            assert.match(page.text(), /__lan\/f\/terrain\.js/); assert.doesNotMatch(page.text(), /LACOMBE|INSTALL_CSRF/);
            assert.match(String(page.headers['content-security-policy']), /default-src 'none'/);
            assert.equal(JSON.stringify(sql("SELECT first_name FROM persons WHERE id=1")), '[{"first_name":"Jean"}]', 'rien n’a changé');
        });
        await t('B2 même si la porte laissait passer : PHP refuse tout autre chemin à un appareil signé « terrain » (liste blanche côté serveur)', async () => {
            const h = { 'x-carnet-gate': server.gateSecret, 'x-carnet-device': tel.id, 'x-carnet-device-name': 'x', 'x-carnet-device-kind': 'terrain', 'x-carnet-device-pw': '1' };
            for (const p of ['/api.php?action=bootstrap', '/api.php?action=export_gedcom', '/api.php?action=inbox_list', '/index.php', '/', '/upload.php', '/telecharger.php', '/media/x.jpg', '/assets/js/app.js']) {
                const r = await server.request(p, { headers: h }); assert.equal(r.status, 403, `${p} → ${r.status}`);
            }
            const r = await server.request('/terrain.php?action=delete_all', { headers: h }); assert.equal(r.status, 403, 'action hors liste');
            const r2 = await server.request('/terrain.php?action=deposit', { headers: h }); assert.equal(r2.status, 405, 'mauvaise méthode');
            const forged = await server.request('/terrain.php?action=state', { headers: { ...h, 'x-carnet-gate': 'faux' } }); assert.equal(forged.status, 403, 'signature de la porte fausse');
            const mainSide = await server.request('/terrain.php?action=state'); assert.equal(mainSide.status, 403, 'la fenêtre principale n’a rien à faire là non plus');
        });

        /* ─── C. réseau ─── */
        await t('C1 adresse non privée, autre réseau, boucle locale : connexion coupée avant toute lecture', async () => {
            for (const ip of ['8.8.8.8', '100.64.0.1', '10.0.0.5', '192.168.2.9', '127.0.0.1', '::1', '2001:db8::1']) {
                R.setPeer(ip);
                const r = await ask('GET', '/terrain.php?action=state', { cookie: tel.jar.header() });
                assert.equal(r.status, 0, `${ip} : ${r.status}`); assert.match(r.error, /ECONNRESET|socket hang up|EPIPE/);
            }
            R.setPeer('192.168.1.52');
        });
        await t('C2 Host forgé (DNS rebinding) → 421 ; Origin ou Referer d’un autre site → 403 (même pour lire) ; écrire sans Origin → 403', async () => {
            for (const host of ['evil.example', 'evil.example:80', `127.0.0.1:${gate.port}`, `192.168.1.20:${gate.port + 1}`, `localhost:${gate.port}`]) assert.equal((await ask('GET', '/terrain.php?action=state', { cookie: tel.jar.header(), host })).status, 421, host);
            for (const o of ['http://evil.example', 'null', `http://192.168.1.20:${gate.port}.evil.example`, `https://192.168.1.20:${gate.port}`]) {
                assert.equal((await ask('GET', '/terrain.php?action=state', { cookie: tel.jar.header(), origin: o })).status, 403, o);
                assert.equal((await P.deposit([{ data: jpg }], {}, { origin: o })).status, 403, o);
            }
            for (const ref of ['http://evil.example/', `http://192.168.1.20:${gate.port}.evil.example/`, 'x']) assert.equal((await ask('GET', '/terrain.php?action=state', { cookie: tel.jar.header(), referer: ref })).status, 403, ref);
            const noOrigin = await ask('POST', '/terrain.php?action=deposit', { cookie: tel.jar.header(), body: multipart({ csrf: P.csrf }, [{ data: jpg }]).body, type: 'multipart/form-data', headers: { 'x-csrf-token': P.csrf } });
            assert.equal(noOrigin.status, 403);
            assert.equal(inbox().length, 0);
        });
        await t('C3 CSRF : sans jeton, jeton faux, jeton d’une autre séance → 419 ; rien déposé', async () => {
            for (const c of ['', 'faux', 'a'.repeat(48)]) { const m = multipart({ csrf: c, batch: 'b'.repeat(24) }, [{ data: jpg }]); const r = await ask('POST', '/terrain.php?action=deposit', { cookie: tel.jar.header(), origin: R.origin(), body: m.body, type: m.type, headers: { 'x-csrf-token': c } }); assert.equal(r.status, 419, `« ${c} » → ${r.status}`); }
            const other = R.phone({ jar: R.jar(), id: '' }); other.dev.jar.c[COOKIE] = tel.jar.c[COOKIE]; await other.state(); // une autre séance du même téléphone
            const r = await ask('POST', '/terrain.php?action=undo', { cookie: tel.jar.header(), origin: R.origin(), body: { csrf: other.csrf, batch: 'c'.repeat(24) }, headers: { 'x-csrf-token': other.csrf } });
            assert.equal(r.status, 419);
            assert.equal(inbox().length, 0);
        });
        await t('C4 corps : Content-Length absent ou découpé (chunked) → 411 ; annoncé trop gros (200 Mo) → 413 sans rien lire', async () => {
            const big = await new Promise(resolve => {
                const req = http.request({ host: '127.0.0.1', port: gate.port, method: 'POST', path: '/terrain.php?action=deposit', agent: false, headers: { host: `${HOME.ip}:${gate.port}`, cookie: tel.jar.header(), origin: R.origin(), 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(200 * 1024 * 1024) } }, res => { res.resume(); resolve(res.statusCode); });
                req.on('error', e => resolve(e.code)); req.write(Buffer.alloc(1024)); setTimeout(() => req.destroy(), 1500);
            });
            assert.equal(big, 413);
            const chunked = await new Promise(resolve => {
                const req = http.request({ host: '127.0.0.1', port: gate.port, method: 'POST', path: '/terrain.php?action=undo', agent: false, headers: { host: `${HOME.ip}:${gate.port}`, cookie: tel.jar.header(), origin: R.origin(), 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, res => { res.resume(); resolve(res.statusCode); });
                req.on('error', e => resolve(e.code)); req.end('{}');
            });
            assert.equal(chunked, 411);
            const small = await ask('POST', '/terrain.php?action=unlock', { cookie: tel.jar.header(), origin: R.origin(), body: JSON.stringify({ password: 'x'.repeat(20000), csrf: P.csrf }), headers: { 'x-csrf-token': P.csrf } });
            assert.equal(small.status, 413, 'le mot de passe : 16 Ko au plus');
        });

        /* ─── D. fichiers ─── */
        await t('D1 une vraie photo : acceptée, rangée dans le dossier de données (jamais dans les médias), nom tiré au hasard, servie seulement en image avec nosniff et sandbox', async () => {
            const r = await P.deposit([{ data: jpg, name: 'IMG_2207.jpg' }], { note: 'Tombe famille LACOMBE, allée 4' });
            assert.equal(r.status, 200, r.text());
            const row = inbox()[0];
            assert.match(row.file, /^[a-f0-9]{32}\.jpg$/); assert.equal(row.status, 'box'); assert.equal(row.device_name, 'Téléphone de Marie'); assert.equal(row.note, 'Tombe famille LACOMBE, allée 4');
            assert.ok(fs.existsSync(path.join(boxDir, row.file))); assert.equal(fs.readdirSync(mediaDir).length, 0, 'rien dans les médias tant que ce n’est pas relié');
            if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(boxDir, row.file)).mode & 0o077, 0);
            const f = await R.mainGet('inbox_file', `&id=${row.id}`);
            assert.equal(f.status, 200); assert.equal(f.headers['content-type'], 'image/jpeg'); assert.equal(f.headers['x-content-type-options'], 'nosniff');
            assert.match(String(f.headers['content-security-policy']), /sandbox/); assert.match(String(f.headers['content-disposition']), /^inline; filename="a-trier-\d+\.jpg"$/);
            const th = await R.mainGet('inbox_file', `&id=${row.id}&thumb=1`); assert.equal(th.headers['content-type'], 'image/jpeg');
            assert.equal((await server.request(`/data/a-trier/${row.file}`)).status, 404, 'le dossier n’est jamais servi');
            assert.equal((await server.request(`/media/../a-trier/${row.file}`)).status, 400);
        });
        await t('D2 faux types : .php, .html, SVG avec script, PDF, texte renommés en .jpg ; HEIC ; GIF → refusés (rien gardé), chacun noté au registre', async () => {
            const before = inbox().length;
            const fakes = [['<?php system($_GET["c"]); ?>', 'shell.jpg'], ['<!doctype html><script>alert(1)</script>', 'page.jpg'], ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>', 'dessin.jpg'],
                ['%PDF-1.4\n1 0 obj<<>>endobj', 'scan-001.jpg'], ['GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'anim.jpg'], ['\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic', 'IMG_0001.HEIC'], ['MZ\x90\x00', 'setup.jpg'], ['', 'vide.jpg']];
            for (const [data, name] of fakes) {
                const r = await P.deposit([{ data: Buffer.from(data, 'latin1'), name, type: 'image/jpeg' }]);
                assert.ok(r.status >= 400 && r.status < 500 || r.status === 415, `${name} → ${r.status}`); assert.ok(r.json().error, name);
            }
            assert.equal(inbox().length, before, 'aucun n’est gardé');
            for (const f of fs.readdirSync(boxDir)) { const b = fs.readFileSync(path.join(boxDir, f)); assert.ok(!b.includes('<?php') && !b.includes('<script') && !b.includes('<svg'), f); }
            assert.ok(sql("SELECT count(*) n FROM access_log WHERE kind='tw_refus'")[0].n >= 7, 'refus notés');
        });
        await t('D3 polyglotte (JPEG valide + HTML + PHP dans un commentaire et après la fin) : acceptée mais RÉENREGISTRÉE, rien de caché ne reste', async () => {
            if (!gdOk) return;
            const evil = Buffer.concat([withCom(jpg, '<script>alert(document.cookie)</script><?php echo "pirate"; ?>'), Buffer.from('<html><script>alert(1)</script></html><?php phpinfo(); ?>', 'latin1')]);
            const r = await P.deposit([{ data: evil, name: 'carte.jpg' }]); assert.equal(r.status, 200, r.text());
            const row = inbox().at(-1); const b = fs.readFileSync(path.join(boxDir, row.file));
            assert.ok(b[0] === 0xFF && b[1] === 0xD8, 'toujours un JPEG');
            for (const bad of ['<script', '<?php', '<html', 'pirate', 'phpinfo']) assert.ok(!b.includes(bad), `« ${bad} » a survécu`);
        });
        await t('D4 GPS et métadonnées RETIRÉS à l’arrivée (réglage conseillé) : plus d’EXIF, plus de GPS, plus d’appareil dans le fichier stocké', async () => {
            const withGps = withApp1(jpg, exifBlock());
            assert.ok(withGps.includes('Exif\0\0') && withGps.includes('MAZAUD-PHONE'));
            const r = await P.deposit([{ data: withGps, name: 'IMG_GPS.jpg' }]); assert.equal(r.status, 200, r.text()); assert.equal(r.json().gps_removed, true);
            const row = inbox().at(-1); const b = fs.readFileSync(path.join(boxDir, row.file));
            for (const bad of ['Exif', 'MAZAUD-PHONE', '2026:11:21', 'II*\0']) assert.ok(!b.includes(bad), `« ${bad} » reste dans le fichier`);
            assert.equal(row.had_gps, 1); assert.equal(row.lat, null, 'la position n’est pas gardée à part non plus'); assert.equal(row.lon, null);
            assert.equal(row.taken_at, '2026-11-21 14:41:00', 'la date de prise de vue est gardée (dans la boîte, pas dans le fichier)');
            const meta = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', "require 'lib/photomaps.php'; echo json_encode(pm_meta_read($argv[1]));", path.join(boxDir, row.file)], { cwd: appRoot, encoding: 'utf8' }).stdout;
            assert.equal(meta, '[]', 'le lecteur de métadonnées de l’app ne trouve plus rien : ' + meta);
            assert.ok(fs.readFileSync(path.join(boxDir, row.file.replace('.jpg', '-v.jpg'))).indexOf('Exif') < 0, 'la vignette non plus');
        });
        await t('D5 réglage « GPS gardé à part » : le fichier reste sans EXIF, la position est rangée dans la boîte (pour la carte, en reliant)', async () => {
            await R.setTw({ gps: 'relier' });
            const r = await P.deposit([{ data: withApp1(jpg, exifBlock(45.5, 2.25)), name: 'tombe.jpg' }]); assert.equal(r.status, 200, r.text()); assert.equal(r.json().gps_removed, false);
            const row = inbox().at(-1); assert.ok(Math.abs(row.lat - 45.5) < 0.01 && Math.abs(row.lon - 2.25) < 0.01, `${row.lat} ${row.lon}`);
            assert.ok(!fs.readFileSync(path.join(boxDir, row.file)).includes('Exif'));
            await R.setTw({ gps: 'retire' });
        });
        await t('D6 trop gros (réglage 1 Mo, PHP), trop de fichiers dans une demande (2 et 25), trop de photos dans un envoi, total d’un envoi trop gros, boîte pleine → refusés', async () => {
            await R.setTw({ max_mb: 1, par_envoi: 2, boite_max: 50 });
            const pad = Buffer.concat([jpg, Buffer.alloc(1.3 * 1024 * 1024, 0x20)]);
            const big = await P.deposit([{ data: pad }]); assert.equal(big.status, 413, big.text()); assert.match(big.json().error, /1 Mo/);
            const n0 = inbox().length;
            const two = await P.deposit([{ data: jpg }, { data: png, name: 'b.png', type: 'image/png' }]); assert.equal(two.status, 422); assert.ok(/Une seule photo/.test(two.json().error) || two.json().error === 'parts', two.text());
            const many = await P.deposit(Array.from({ length: 25 }, (_, i) => ({ data: jpg, name: `p${i}.jpg` }))); assert.equal(many.status, 422);
            // la porte coupe au-delà de 5 parties : PHP seul, lui, refuse aussi deux fichiers (même sous le même nom, où il n'en garderait qu'un)
            const h = { 'x-carnet-gate': server.gateSecret, 'x-carnet-device': tel.id, 'x-carnet-device-name': 'x', 'x-carnet-device-kind': 'terrain', cookie: tel.jar.header().replace(/lcnda_appareil=[^;]*;?\s*/, '') };
            const m2 = multipart({ csrf: P.csrf, batch: 'd'.repeat(24) }, [{ data: Buffer.concat([jpg, Buffer.alloc(6000)]) }, { data: Buffer.concat([jpg, Buffer.alloc(20000)]) }]);
            const direct = await server.request('/terrain.php?action=deposit', { method: 'POST', body: m2.body, headers: { ...h, 'content-type': m2.type, 'x-csrf-token': P.csrf } });
            assert.equal(direct.status, 422, direct.body.toString()); assert.match(JSON.parse(direct.body).error, /Une seule photo/);
            assert.equal(inbox().length, n0, 'rien gardé');
            const other = await P.deposit([{ data: jpg, field: 'autre' }]); assert.equal(other.status, 422, 'un fichier sous un autre nom de champ');
            const nested = await P.deposit([{ data: jpg, field: 'photo[]' }]); assert.equal(nested.status, 422, 'photo[] (tableau)');
            const batch = crypto.randomBytes(12).toString('hex');
            assert.equal((await P.deposit([{ data: jpg }], { batch })).status, 200); assert.equal((await P.deposit([{ data: jpg }], { batch })).status, 200);
            const third = await P.deposit([{ data: jpg }], { batch }); assert.equal(third.status, 413); assert.match(third.json().error, /2 au plus/);
            const b2 = crypto.randomBytes(12).toString('hex');
            sql("INSERT INTO phone_inbox(created_ts, device_id, device_name, batch, file, ext, size, status) VALUES(?,?,?,?,?,?,?,'linked')", Math.floor(Date.now() / 1000), tel.id, 'Téléphone de Marie', b2, 'x', 'jpg', 200 * 1024 * 1024 - 100);
            const tot = await P.deposit([{ data: jpg }], { batch: b2 }); assert.equal(tot.status, 413); assert.match(tot.json().error, /200 Mo/);
            const n = sql("SELECT count(*) n FROM phone_inbox WHERE status='box'")[0].n;
            await R.setTw({ boite_max: 10 });
            for (let i = n; i < 10; i++) sql("INSERT INTO phone_inbox(created_ts, device_id, batch, file, ext, size) VALUES(?,?,?,?,?,1)", 1, 'f'.repeat(16), 'f'.repeat(24), 'x', 'jpg');
            const full = await P.deposit([{ data: jpg }]); assert.equal(full.status, 507); assert.match(full.json().error, /pleine/);
            sql("DELETE FROM phone_inbox WHERE file='x'");
            await R.setTw({ max_mb: 25, par_envoi: 20, boite_max: 500 });
        });
        await t('D7 noms de fichier piégés (../, chemin absolu, \\, caractères de contrôle, .php) : ignorés, le nom est tiré au hasard ; rien n’apparaît ailleurs', async () => {
            const before = new Set(fs.readdirSync(boxDir));
            for (const name of ['../../../evil.php', '/etc/passwd', '..\\..\\win.ini', 'a\x01b\x7f.jpg', 'photo.jpg.php', 'C:\\Windows\\x.jpg', '%2e%2e%2fx.jpg', 'x'.repeat(300) + '.jpg']) {
                const r = await P.deposit([{ data: jpg, name }]); assert.equal(r.status, 200, `${name} → ${r.text()}`);
            }
            const added = fs.readdirSync(boxDir).filter(f => !before.has(f));
            assert.equal(added.length, 16, 'huit photos et leurs vignettes');
            for (const f of added) assert.match(f, /^[a-f0-9]{32}(-v)?\.jpg$/);
            for (const p of [path.join(tmp, 'evil.php'), path.join(dataDir, 'evil.php'), path.join(appRoot, 'evil.php'), path.join(tmp, 'win.ini')]) assert.ok(!fs.existsSync(p), p);
            assert.ok(!JSON.stringify(inbox()).includes('evil') && !JSON.stringify(inbox()).includes('passwd'), 'le nom venu du téléphone n’est gardé nulle part');
        });
        await t('D8 image abîmée, en-tête menteur, bombe de décompression (PNG de 100 000 × 100 000 points, 30 000 × 30 000) → refusées sans être décodées', async () => {
            const before = inbox().length;
            const broken = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), crypto.randomBytes(4000)]);
            assert.equal((await P.deposit([{ data: broken }])).status, 422);
            const lie = Buffer.concat([png.subarray(0, 8), jpg.subarray(8)]); assert.equal((await P.deposit([{ data: lie }])).status, 422);
            for (const [w, h] of [[100000, 100000], [30000, 30000], [8000, 8000], [60000, 1]]) {
                const t0 = Date.now(); const r = await P.deposit([{ data: pngBomb(w, h), name: 'bombe.png', type: 'image/png' }]);
                assert.equal(r.status, 422, `${w}×${h} → ${r.status}`); assert.match(r.json().error, /trop grande/i); assert.ok(Date.now() - t0 < 5000, 'refusée tout de suite');
            }
            assert.equal(inbox().length, before);
        });
        await t('D9 les fichiers de la boîte ne sont jamais servis avec un type exécutable (quelle que soit leur extension en base)', async () => {
            const id = inbox()[0].id;
            sql("UPDATE phone_inbox SET ext='html' WHERE id=?", id);
            assert.equal((await R.mainGet('inbox_file', `&id=${id}`)).status, 404, 'extension hors liste : rien n’est servi');
            sql("UPDATE phone_inbox SET ext='jpg', file='../genealogy.sqlite' WHERE id=?", id);
            assert.equal((await R.mainGet('inbox_file', `&id=${id}`)).status, 404, 'un chemin en base : refusé');
            const back = inbox()[1]; sql("UPDATE phone_inbox SET ext='jpg', file=? WHERE id=?", back.file, id);
            const r = await R.mainGet('inbox_file', `&id=${id}&download=1`); assert.equal(r.headers['content-type'], 'image/jpeg'); assert.match(String(r.headers['content-disposition']), /^attachment/);
        });

        /* ─── E. « Pour qui ? » ─── */
        await t('E1 la liste réduite : visites à venir + personnes décédées ; jamais un vivant ni une fiche confidentielle, ni par nom ni par numéro', async () => {
            const l = (await P.list('lacombe')).json();
            const ids = l.people.map(p => p.id).sort();
            assert.deepEqual(ids, [1, 2], JSON.stringify(l.people));
            assert.equal(l.people.find(p => p.id === 1).years, '1871 – 1934');
            assert.deepEqual(l.visits.map(v => v.id), [1], 'la visite passée n’est pas proposée');
            for (const q of ['Marie', 'marie lacombe', 'LACOMBE Marie', 'Paul', 'Henri', 'mazaud', 'Pierre', '3', '#3', '4', '7', 'id:3', '%', '_', '%%', 'a%', "' OR 1=1 --", '"', '*', '\\']) {
                const r = (await P.list(q)).json();
                for (const p of r.people) assert.ok([1, 2, 5].includes(p.id), `« ${q} » → ${p.name}`);
                assert.doesNotMatch(JSON.stringify(r), /Marie|Paul|Henri|Pierre/, q);
            }
            assert.deepEqual((await P.list('durand')).json().people.map(p => p.id), [5], 'décès connu (état « inconnu ») : proposée');
            assert.ok((await P.list('a')).json().people.length === 0, 'une seule lettre : aucune personne (recherche bornée)');
            assert.ok((await P.list('la')).json().people.length <= 15);
            const keys = Object.keys(l.people[0]).sort(); assert.deepEqual(keys, ['id', 'kind', 'name', 'years'], 'nom et années seulement, aucun lien vers la fiche');
        });
        await t('E2 déposer « pour » un vivant, une fiche confidentielle ou une personne inconnue : refusé avec la MÊME phrase (le téléphone n’apprend rien)', async () => {
            const msgs = new Set();
            for (const f of ['person:3', 'person:4', 'person:7', 'person:999', 'person:0', 'visit:999', 'visit:abc', 'person:1 OR 1', 'family:1', '../person:1']) {
                const r = await P.deposit([{ data: jpg }], { for: f }); assert.equal(r.status, 422, `${f} → ${r.status}`); msgs.add(r.json().error);
            }
            assert.equal(msgs.size, 1, [...msgs].join(' | '));
            const ok = await P.deposit([{ data: jpg }], { for: 'person:1', note: 'Pour Jean' }); assert.equal(ok.status, 200);
            assert.equal(inbox().at(-1).for_id, 1);
            await R.setTw({ liste: 'visites' });
            assert.equal((await P.deposit([{ data: jpg }], { for: 'person:1' })).status, 422, 'réglage « visites seulement » : plus aucune personne');
            assert.deepEqual((await P.list('lacombe')).json().people, []);
            await R.setTw({ liste: 'visites_decedes' });
        });

        /* ─── F. consultation, verrou, registre, ↶ Annuler ─── */
        await t('F1 mode consultation sur l’ordinateur : le téléphone ne dépose plus (réglage conseillé) ; la boîte se lit mais ne se relie pas', async () => {
            fs.writeFileSync(path.join(dataDir, 'consultation.json'), JSON.stringify({ hash: 'x', since: '2026-11-21' }));
            const r = await P.deposit([{ data: jpg }]); assert.equal(r.status, 423); assert.equal(r.json().kiosk, true);
            assert.equal((await R.mainGet('inbox_list')).status, 200, 'la boîte se lit');
            const w = await R.mainPost('inbox_write', { op: 'delete', ids: [inbox()[0].id] }); assert.equal(w.status, 423, 'ni Relier ni Supprimer');
            await R.setTw({ consultation: 'deposer' }).catch(() => {});
            fs.rmSync(path.join(dataDir, 'consultation.json'));
            await R.setTw({ consultation: 'deposer' });
            fs.writeFileSync(path.join(dataDir, 'consultation.json'), JSON.stringify({ hash: 'x', since: '2026-11-21' }));
            assert.equal((await P.deposit([{ data: jpg }])).status, 200, 'réglage « dépose encore »');
            fs.rmSync(path.join(dataDir, 'consultation.json'));
            await R.setTw({ consultation: 'refuser' });
        });
        await t('F2 verrou de la généalogie : après « 🔐 Verrouiller » sur le téléphone, plus de dépôt ni de liste sans le mot de passe ; réglage « déposer avec le jeton seul » : dépôt oui, liste non', async () => {
            assert.equal((await P.post('lock')).status, 200);
            assert.equal((await P.deposit([{ data: jpg }])).status, 423);
            assert.equal((await P.list('lacombe')).status, 423);
            await R.setTw({ mdp: 'liste' });
            assert.equal((await P.deposit([{ data: jpg }])).status, 200);
            assert.equal((await P.list('lacombe')).status, 423, 'la liste demande toujours le mot de passe');
            await R.setTw({ mdp: 'ouverture' });
            await sleep(1100); assert.equal((await P.unlock()).status, 200);
        });
        await t('F3 📜 Qui a vu quoi : chaque dépôt noté avec l’appareil (colonne device) ; les listes vues et les refus aussi', async () => {
            const rows = sql("SELECT kind, obj_label, what, device FROM access_log WHERE kind LIKE 'tw_%' ORDER BY id");
            const dep = rows.filter(r => r.kind === 'tw_depot');
            assert.equal(dep.length, sql("SELECT count(*) n FROM phone_inbox WHERE device_id=?", tel.id)[0].n, 'un par photo déposée');
            assert.ok(dep.every(r => r.device === 'Téléphone de Marie'), JSON.stringify(dep.slice(0, 2)));
            assert.ok(dep.some(r => r.obj_label === 'Jean LACOMBE'), JSON.stringify(dep.map(r => r.obj_label)));
            assert.ok(rows.some(r => r.kind === 'tw_liste' && r.obj_label === 'lacombe' && r.device === 'Téléphone de Marie'));
            assert.ok(rows.some(r => r.kind === 'tw_refus' && r.what === 'type'));
            assert.ok(sql("SELECT count(*) n FROM access_log WHERE kind='unlock_fail' AND device='Téléphone de Marie'")[0].n >= 1, 'mot de passe faux noté');
        });
        await t('F4 « ↶ Annuler » du téléphone : seulement SES photos de CET envoi, encore dans la boîte ; jamais celles d’un autre ni une photo rangée', async () => {
            const batch = crypto.randomBytes(12).toString('hex');
            assert.equal((await P.deposit([{ data: jpg }], { batch })).status, 200); assert.equal((await P.deposit([{ data: jpg }], { batch })).status, 200);
            const other = inbox().find(r => r.device_id === tel.id && r.batch !== batch && r.status === 'box');
            sql("UPDATE phone_inbox SET device_id='0123456789abcdef' WHERE id=?", other.id); // une photo d'un autre téléphone
            sql("UPDATE phone_inbox SET batch=? WHERE id=?", batch, other.id);
            const ids = inbox().filter(r => r.batch === batch && r.device_id === tel.id).map(r => r.id);
            const linked = await R.mainPost('inbox_write', { op: 'link', ids: [ids[0]], kind: 'person', target: 1 }); assert.equal(linked.status, 200, linked.body.toString());
            const u = await P.post('undo', { batch }); assert.equal(u.status, 200); assert.equal(u.json().removed, 1, 'seulement celle encore dans la boîte');
            assert.ok(inbox().some(r => r.id === other.id), 'la photo de l’autre téléphone reste');
            assert.equal(inbox().find(r => r.id === ids[0]).status, 'linked', 'la photo rangée reste');
            assert.equal((await P.post('undo', { batch: '../x' })).status, 422);
            await R.setTw({ annuler_tel: 'jamais' }); assert.equal((await P.post('undo', { batch })).status, 422); await R.setTw({ annuler_tel: 'range' });
        });
        await t('F5 téléphone retiré avec le réglage « ses photos sont supprimées aussi » : elles vont dans « 🗑 Supprimées » (registre par le processus principal seulement)', async () => {
            const dev = await R.pair('Téléphone de Louise', 'terrain'); const P2 = R.phone(dev); await P2.state(); await sleep(1100); assert.equal((await P2.unlock()).status, 200);
            assert.equal((await P2.deposit([{ data: jpg }])).status, 200);
            await R.setTw({ retrait: 'supprimer' });
            const forged = await server.request(`/api.php?action=lan_note&kind=lan_remove&dev=${dev.id}`); assert.equal(forged.status, 403, 'sans le second secret : refusé');
            assert.equal(inbox().filter(r => r.device_id === dev.id && r.status === 'box').length, 1);
            gate.remove(dev.id);
            const r = await server.request(`/api.php?action=lan_note&kind=lan_remove&label=x&dev=${dev.id}`, { headers: { 'x-carnet-local': server.localSecret } }); assert.equal(r.status, 200);
            assert.equal(inbox().filter(r2 => r2.device_id === dev.id && r2.status === 'deleted').length, 1);
            await R.setTw({ retrait: 'garder' });
        });
        await t('C5 inondation : au-delà de 60 demandes en 10 s, le téléphone reçoit 429 (et PHP n’est pas dérangé) ; les demandes d’accès d’un inconnu aussi', async () => {
            let n429 = 0;
            await Promise.all(Array.from({ length: TERRAIN_RATE.n + 30 }, () => ask('GET', '/terrain.php?action=state', { cookie: tel.jar.header() }).then(r => { if (r.status === 429) n429++; })));
            assert.ok(n429 >= 30, `429 : ${n429}`);
            gate.rate.clear();
            R.setPeer('192.168.1.99');
            let p429 = 0; for (let i = 0; i < 100; i++) { const r = await ask('GET', `/__lan/etat?id=${crypto.randomBytes(12).toString('hex')}&k=x`); if (r.status === 429) p429++; else assert.equal(r.status, 404); }
            assert.ok(p429 >= 9, `essais de numéros de demande freinés : ${p429}`);
            R.setPeer('192.168.1.52');
        });
        await t('C6 code d’invitation essayé au hasard : 5 codes faux → plus aucune demande pendant 15 min (même avec le bon) ; le code à 6 chiffres ne se tape jamais : il se compare', async () => {
            gate.newInvite(); gate.fails.invite = 0;
            for (let i = 0; i < 5; i++) { R.setPeer(`192.168.1.${120 + i}`); assert.equal((await ask('POST', '/__lan/demande', { body: { name: 'x', invite: 'ZZZZZZ', kind: 'terrain' } })).status, 403); }
            assert.equal(gate.status().invite, null);
            assert.equal((await ask('POST', '/__lan/demande', { body: { name: 'x', invite: gate.invite ? gate.invite.code : '' } })).status, 429);
            gate.fails.pauseUntil = 0; R.setPeer('192.168.1.52');
            assert.doesNotMatch(read('electron/lan-gate.js'), /body\.code|searchParams\.get\('code'\)/, 'aucune route ne reçoit le code à 6 chiffres');
        });
        await t('le secret interne ne sort jamais sur le réseau (toutes les réponses lues)', () => { assert.ok(R.seen.length > 150); for (const r of R.seen) R.leaks(r); });
        await t('C7 porte éteinte : plus rien ne passe (connexion refusée), même avec un jeton valable', async () => {
            const port = gate.port;
            await gate.close('main');
            const r = await new Promise(resolve => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); resolve('ouvert'); }); s.on('error', e => resolve(e.code)); });
            assert.equal(r, 'ECONNREFUSED');
        });
    } finally {
        try { await gate.close('quit'); } catch (_) {}
        await server.stop();
    }

    /* ═════ G. l'horloge simulée : un second PHP en mode essai (GENEALOGY_TEST=1, sans secret d'app) derrière la même porte ═════ */
    const data2 = path.join(tmp, 'data2'), media2 = path.join(tmp, 'media2'), clock = path.join(tmp, 'horloge.txt');
    fs.mkdirSync(data2, { recursive: true }); fs.mkdirSync(media2, { recursive: true }); fs.writeFileSync(clock, '0');
    const gateSecret = crypto.randomBytes(16).toString('hex');
    const env2 = { ...process.env, GENEALOGY_DATA_DIR: data2, GENEALOGY_MEDIA_DIR: media2, GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_TEST: '1', LCNDA_TEST_CLOCK_FILE: clock, GENEALOGY_GATE_SECRET: gateSecret, GENEALOGY_SESSION_DIR: path.join(tmp, 'sess2'), GENEALOGY_APP_SECRET: '' };
    seedDb(data2, env2);
    const sql2 = sqlOf(data2);
    const port2 = await new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
    const php2 = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'upload_max_filesize=200M', '-d', 'post_max_size=200M', '-S', `127.0.0.1:${port2}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: env2, stdio: 'ignore' });
    const advance = s => fs.writeFileSync(clock, String(Number(fs.readFileSync(clock, 'utf8')) + s));
    const req2 = (p, { method = 'GET', headers = {}, body = null } = {}) => new Promise((resolve, reject) => { const h = { host: `127.0.0.1:${port2}`, ...headers }; if (body !== null) h['content-length'] = Buffer.byteLength(body); const q = http.request({ host: '127.0.0.1', port: port2, path: p, method, headers: h, agent: false }, res => { const c = []; res.on('data', x => c.push(x)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c) })); }); q.on('error', reject); q.end(body === null ? undefined : body); });
    for (let i = 0; i < 100; i++) { try { if ((await req2('/__health')).status === 200) break; } catch (_) {} await sleep(100); }
    const fake = { port: port2, secret: '', gateSecret, origin: `http://127.0.0.1:${port2}` };
    const gate2 = new LanGate({ server: fake, dataDir: data2, appRoot, test: { bind: '127.0.0.1', address: HOME, peer: () => '192.168.1.52' } });
    const R2 = rig(gate2, req2, [gateSecret]);
    hooks.push(() => gate2.rate.clear());
    try {
        let P2 = null;
        await t('G0 mise en place (horloge simulée) : mot de passe sans délai sur l’ordinateur, téléphone appairé et ouvert', async () => {
            const s = await R2.mainPost('glock_set', { password: PW, password2: PW, minutes: 0, ack: 1 }); assert.equal(s.status, 200, s.body.toString());
            await R2.refreshCsrf();
            assert.equal((await gate2.open({ passwordOk: true })).ok, true);
            const dev = await R2.pair('Téléphone de Marie', 'terrain'); P2 = R2.phone(dev); await P2.state();
            assert.equal((await P2.unlock()).status, 200);
            assert.equal((await P2.deposit([{ data: jpg }])).status, 200);
        });
        await t('G1 mot de passe redemandé sur le téléphone après 15 min sans geste (horloge avancée de 16 min) ; les gestes avant ce délai le repoussent', async () => {
            advance(10 * 60); assert.equal((await P2.deposit([{ data: jpg }])).status, 200, 'à 10 min : encore ouvert (et le geste repousse le délai)');
            advance(14 * 60); assert.equal((await P2.list('lacombe')).status, 200, '14 min après le dernier geste : encore ouvert');
            advance(16 * 60);
            const r = await P2.deposit([{ data: jpg }]); assert.equal(r.status, 423); assert.equal(r.json().glock, true);
            assert.equal((await P2.list('lacombe')).status, 423);
            assert.equal((await P2.state()).json().needs_pw, true);
            assert.ok(sql2("SELECT count(*) n FROM access_log WHERE kind='lock_idle' AND device='Téléphone de Marie'")[0].n >= 1, 'noté au registre');
            assert.equal((await P2.unlock()).status, 200);
            assert.equal((await P2.deposit([{ data: jpg }])).status, 200);
        });
        await t('G2 force brute du mot de passe : 5 essais faux depuis ce téléphone → 429 pendant 15 min, même le bon mot de passe ; ensuite il repasse', async () => {
            await P2.post('lock');
            for (let i = 0; i < 4; i++) { advance(120); const r = await P2.unlock('faux-' + i); assert.equal(r.status, 401, `essai ${i + 1} : ${r.status} ${r.text()}`); }
            advance(120); const fifth = await P2.unlock('faux-5'); assert.equal(fifth.status, 429, fifth.text()); assert.ok(fifth.json().wait >= 14 * 60);
            advance(120); const good = await P2.unlock(); assert.equal(good.status, 429, 'le bon mot de passe aussi, pendant la pause'); assert.match(good.json().error, /min/);
            advance(16 * 60); assert.equal((await P2.unlock()).status, 200, 'après 15 min');
            assert.ok(sql2("SELECT count(*) n FROM access_log WHERE kind='unlock_fail' AND device='Téléphone de Marie'")[0].n >= 5);
        });
        await t('G3 freinage commun : deux essais de suite sans attendre → 429 (« Patiente … s »), sans vérifier le mot de passe', async () => {
            await P2.post('lock'); advance(120);
            assert.equal((await P2.unlock('faux-a')).status, 401);
            const again = await P2.unlock(); assert.equal(again.status, 429, 'trop tôt : refusé même juste');
            advance(120); assert.equal((await P2.unlock()).status, 200);
        });
        await t('G4 photo supprimée : gardée 30 jours (↶ Annuler marche), puis VRAIMENT effacée (fichier et vignette) ; ↶ Annuler ne restaure rien au-delà', async () => {
            const box = path.join(data2, 'a-trier');
            const rows = sql2("SELECT id, file FROM phone_inbox WHERE status='box' ORDER BY id");
            const [a, b] = rows;
            assert.equal((await R2.mainPost('inbox_write', { op: 'delete', ids: [a.id, b.id] })).status, 200);
            advance(29 * 86400); await R2.mainPost('glock_touch', {});
            assert.equal((await R2.mainGet('inbox_list', '&view=deleted')).status, 200);
            assert.ok(fs.existsSync(path.join(box, a.file)), 'à 29 jours : encore là');
            const back = await R2.mainPost('inbox_write', { op: 'restore', ids: [a.id] }); assert.equal(back.status, 200, back.body.toString()); assert.equal(JSON.parse(back.body).restored, 1);
            advance(2 * 86400);
            const l = await R2.mainGet('inbox_list', '&view=deleted'); assert.equal(l.status, 200, l.body.toString());
            assert.ok(!fs.existsSync(path.join(box, b.file)), 'à 31 jours : le fichier est effacé');
            assert.ok(!fs.existsSync(path.join(box, b.file.replace('.jpg', '-v.jpg'))), 'la vignette aussi');
            assert.equal(sql2('SELECT count(*) n FROM phone_inbox WHERE id=?', b.id)[0].n, 0, 'la ligne aussi');
            const late = await R2.mainPost('inbox_write', { op: 'restore', ids: [b.id] }); assert.equal(late.status, 422); assert.match(JSON.parse(late.body).error, /Trop tard/);
            assert.ok(fs.existsSync(path.join(box, a.file)), 'la photo remise à temps est toujours là');
        });
        await t('G5 réglage « effacée tout de suite » : après les 10 s de ↶ Annuler, la photo est effacée pour de bon', async () => {
            await R2.setTw({ suppr: 'direct' });
            const row = sql2("SELECT id, file FROM phone_inbox WHERE status='box' ORDER BY id LIMIT 1")[0];
            await R2.mainPost('inbox_write', { op: 'delete', ids: [row.id] });
            advance(5); assert.equal(JSON.parse((await R2.mainPost('inbox_write', { op: 'restore', ids: [row.id] })).body).restored, 1, 'dans les 10 s : ↶ Annuler marche');
            await R2.mainPost('inbox_write', { op: 'delete', ids: [row.id] });
            advance(11); await R2.mainGet('inbox_list');
            assert.ok(!fs.existsSync(path.join(data2, 'a-trier', row.file)));
            assert.equal((await R2.mainPost('inbox_write', { op: 'restore', ids: [row.id] })).status, 422);
            await R2.setTw({ suppr: '30j' });
        });
    } finally {
        try { await gate2.close('quit'); } catch (_) {}
        php2.kill();
    }

    /* ═════ H. navigateur : le texte du téléphone est échappé partout ═════ */
    let chromium = null;
    try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (chromium) {
        const data3 = path.join(tmp, 'data3'), media3 = path.join(tmp, 'media3');
        fs.mkdirSync(data3, { recursive: true }); fs.mkdirSync(media3, { recursive: true });
        const env3 = { ...process.env, GENEALOGY_DATA_DIR: data3, GENEALOGY_MEDIA_DIR: media3, GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_TEST: '1', GENEALOGY_APP_SECRET: '', GENEALOGY_SESSION_DIR: path.join(tmp, 'sess3') };
        seedDb(data3, env3);
        const sql3 = sqlOf(data3);
        const port3 = await new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
        const php3 = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port3}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: env3, stdio: 'ignore' });
        let browser = null;
        try {
            for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port3}/__health`)).ok) break; } catch (_) {} await sleep(100); }
            // une photo « déposée » avec un texte piégé (comme le ferait un téléphone : la boîte et le registre)
            fs.mkdirSync(path.join(data3, 'a-trier'), { recursive: true });
            const name = crypto.randomBytes(16).toString('hex');
            fs.writeFileSync(path.join(data3, 'a-trier', name + '.jpg'), jpg); fs.writeFileSync(path.join(data3, 'a-trier', name + '-v.jpg'), jpg);
            const XSS = '<img src=x onerror="window.__xss=1">"><script>window.__xss=2</script>';
            spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/bootstrap.php'; require 'lib/telephone_wifi.php'; $pdo = db(); tw_schema($pdo); access_log_schema($pdo);
$pdo->prepare("INSERT INTO phone_inbox(created_ts, device_id, device_name, batch, note, file, ext, size, width, height) VALUES(?,?,?,?,?,?,?,?,?,?)")->execute([time(), 'abcdefabcdefabcd', $argv[2], str_repeat('a', 24), $argv[1], $argv[3] . '.jpg', 'jpg', 100, 64, 48]);
$pdo->prepare("INSERT INTO access_log(at, kind, obj_type, obj_id, obj_label, what, machine, device) VALUES(datetime('now'),'tw_depot','inbox',1,?,'','x',?)")->execute([$argv[1], $argv[2]]);`, XSS, `Tél <b>${XSS}`, name], { cwd: appRoot, env: env3, encoding: 'utf8' });
            assert.equal(sql3('SELECT count(*) n FROM phone_inbox')[0].n, 1);
            browser = await chromium.launch();
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { errors.push('dialog ' + d.message()); d.dismiss(); });
            await page.goto(`http://127.0.0.1:${port3}/`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.LCNDA_APP && window.LCNDA_EXT && window.LCNDA_EXT.aTrier, null, { timeout: 60000 });
            await t('H1 📥 À trier : le texte et le nom d’appareil venus du téléphone sont posés comme du texte (aucune balise, aucun script)', async () => {
                await page.evaluate(() => window.LCNDA_EXT.aTrier.open());
                await page.waitForSelector('[data-tw-row]', { timeout: 30000 });
                const st = await page.evaluate(() => ({ xss: window.__xss || 0, imgs: document.querySelectorAll('[data-tw-page] img[src="x"]').length, scripts: [...document.querySelectorAll('[data-tw-page] script')].length, bold: document.querySelectorAll('[data-tw-page] b b, [data-tw-page] .ui-row-main b').length, text: document.querySelector('[data-tw-page]').textContent }));
                assert.equal(st.xss, 0); assert.equal(st.imgs, 0); assert.equal(st.scripts, 0);
                assert.ok(st.text.includes('<img src=x onerror='), 'le texte est montré tel quel');
            });
            await t('H2 📜 Qui a vu quoi : la même chose, échappée', async () => {
                await page.evaluate(() => window.LCNDA_EXT.openAccessLog());
                await page.waitForSelector('.b8-table tbody tr', { timeout: 30000 });
                const st = await page.evaluate(() => ({ xss: window.__xss || 0, imgs: document.querySelectorAll('.b8-table img').length, scripts: document.querySelectorAll('.b8-table script').length, text: document.querySelector('.b8-table').textContent }));
                assert.equal(st.xss, 0); assert.equal(st.imgs, 0); assert.equal(st.scripts, 0); assert.ok(st.text.includes('onerror'));
                assert.deepEqual(errors, []);
            });
        } finally { if (browser) await browser.close(); php3.kill(); }
    } else console.log('— navigateur : Playwright absent, partie H sautée');

    fs.rmSync(tmp, { recursive: true, force: true });
    finish();
})().catch(e => { console.error(e); process.exit(1); });

function finish() {
    if (failed) { console.error(`\n${failed} essai(s) de sécurité en échec, ${passed} réussi(s)`); process.exit(1); }
    console.log(`\nTous les essais de sécurité du téléphone par le wifi passent (${passed}).`);
    process.exit(0);
}
