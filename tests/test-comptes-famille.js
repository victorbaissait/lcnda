'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 👪 Le site familial, partie MAISON (maquette validée docs/design/site-familial-comptes.html ; lib/comptes_famille.php,
 * famille.php, lib/reseau_local.php, assets/js/app-famille.js, assets/js/heritage-comptes-famille.js).   node tests/test-comptes-famille.js
 *
 * Contre le vrai PHP de l'app (electron/php-server.js) et la vraie porte du wifi (electron/lan-gate.js, adresse de la maison
 * simulée). Base fictive : familles MAZAUD, LACOMBE, DURAND (vivants, fiche confidentielle, événement confidentiel, photos).
 * Relu « comme un pentester » :
 *  A. invitation (jeton, code de 8 chiffres, une seule fois, essais limités) ; mot de passe choisi (8 caractères), haché ;
 *  B. connexion : même message pour un identifiant inconnu, 5 essais ratés → attente, séance à part (cookie lcnda_famille), liée à
 *     l'appareil, refermée quand les droits changent ou que le compte est retiré ; CSRF ;
 *  C. qui voit quoi : vivants « cachés » / « prénom seulement » / « visibles » (🌿), fiche 🔒 jamais, événement 🔒 jamais, photo
 *     avec un vivant jamais, noms cachés retirés des notes, partie de l'arbre (ascendants / descendants), « introuvable » identique ;
 *  D. élévation : 👁 ne propose pas, ✎ ne modifie pas, 🌿 seulement dans sa branche, champs interdits, champs du serveur ignorés,
 *     propositions des autres, appareil relié = plus que la page de la famille (api.php, médias, envois, sauvegardes : refusés) ;
 *  E. 📨 la file : accepter (photo jointe → média), ↶ exactement, « modifié depuis », « existe peut-être déjà » (relier / créer),
 *     refuser avec un petit mot, « Accepter en changeant… », pastille (fc_count), mode consultation ;
 *  F. 📜 journal ; G. le mode réseau local d'avant (appareil sans compte) inchangé, réglage « seulement la famille » ;
 *  H. 🌐 fondations en ligne : paquet « Publier » sans vivants (manifest + SHA-256), « Relever » ; I. essais en tout limités ;
 *  J. navigateur (Playwright) : invitation dans les Réglages → QR → appareil → mot de passe → proposition sur téléphone (390 px)
 *     → 🔔 pastille → file → ✓ Accepter → ↶ ; texte échappé ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs, PhpServer } = require('../electron/php-server');
const { LanGate } = require('../electron/lan-gate');

const appRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const PW = 'Mazaud-Famille-2026-secret';
const HOME = { ip: '192.168.1.20', prefix: 24 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function multipart(fields = {}, files = []) {
    const bd = '----lcnda' + crypto.randomBytes(8).toString('hex');
    const chunks = [];
    const add = (k, v) => { if (v && typeof v === 'object') { for (const [kk, vv] of Object.entries(v)) add(`${k}[${kk}]`, vv); return; } chunks.push(Buffer.from(`--${bd}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8')); };
    for (const [k, v] of Object.entries(fields)) add(k, v);
    for (const f of files) chunks.push(Buffer.from(`--${bd}\r\nContent-Disposition: form-data; name="${f.field || 'photo'}"; filename="${f.name || 'photo.jpg'}"\r\nContent-Type: ${f.type || 'image/jpeg'}\r\n\r\n`, 'utf8'), f.data, Buffer.from('\r\n'));
    chunks.push(Buffer.from(`--${bd}--\r\n`));
    return { body: Buffer.concat(chunks), type: `multipart/form-data; boundary=${bd}` };
}

(async () => {
    /* ═════ 0. sans serveur : listes blanches et branchements ═════ */
    await t('0 listes blanches : famille.php a ses actions et leur méthode ; séance à part ; l’appareil relié ne joint que famille.php ; api.php refuse fc_* aux invités', () => {
        const lib = read('lib/comptes_famille.php');
        assert.match(lib, /const FC_GUEST_ACTIONS = \['state' => 'GET', 'join' => 'POST', 'login' => 'POST', 'logout' => 'POST', 'search' => 'GET', 'person' => 'GET', 'media' => 'GET',\s*'similar' => 'GET', 'mine' => 'GET', 'propose' => 'POST', 'withdraw' => 'POST', 'edit' => 'POST', 'edit_undo' => 'POST'\];/);
        assert.match(lib, /if \(!isset\(FC_GUEST_ACTIONS\[\$action\]\)\) \{ fc_json\(\['error' => 'Refusé\.'\], 403\); \}/);
        assert.match(lib, /if \(\$method === 'POST'\) \{ verify_csrf\(/);
        assert.match(lib, /password_hash\(\$p, PASSWORD_ARGON2ID\)/); assert.match(lib, /PASSWORD_BCRYPT, \['cost' => 12\]/);
        assert.match(read('famille.php'), /session_name\('lcnda_famille'\);\s*require __DIR__ \. '\/lib\/bootstrap\.php';/);
        const rl = read('lib/reseau_local.php');
        assert.match(rl, /if \(fc_device_famille_only\(\(string\) \$d\['id'\]\)\) \{/);
        assert.match(rl, /'fc_state', 'fc_props', 'fc_journal', 'fc_count', 'fc_prop_file', 'fc_publish_preview', 'fc_publish_export'\]/);
        assert.match(rl, /const LAN_GUEST_WRITES = \['glock_unlock', 'glock_lock_now', 'glock_touch', 'save_settings'\];/, 'les écritures d’un invité dans api.php : inchangées');
        assert.match(lib, /if \(function_exists\('lan_device'\) && lan_device\(\)\) \{ json_response\(/, 'défense en profondeur : les actions de l’ordinateur principal refusent un appareil invité');
        assert.match(lib, /fc_pw_hash\(\$pw\) === '' && false/, 'identifiant inconnu : le même temps de calcul');
    });

    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-famille-'));
    const dataDir = path.join(tmp, 'data'), mediaDir = path.join(tmp, 'media');
    fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(mediaDir, { recursive: true });
    const img = (file, kind = 'jpg', w = 64, h = 48) => {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$im=imagecreatetruecolor((int)$argv[2],(int)$argv[3]); imagefill($im,0,0,imagecolorallocate($im,190,120,60)); imagestring($im,3,4,4,'MAZAUD',imagecolorallocate($im,10,10,10)); if($argv[4]==='png') imagepng($im,$argv[1]); else imagejpeg($im,$argv[1],90);`, file, String(w), String(h), kind], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error(r.stderr); return fs.readFileSync(file);
    };
    img(path.join(mediaDir, 'jean.jpg')); img(path.join(mediaDir, 'groupe.jpg'));
    const jpg = img(path.join(tmp, 'acte.jpg')), png = img(path.join(tmp, 'ferme.png'), 'png');
    const env = { ...process.env, GENEALOGY_DATA_DIR: dataDir, GENEALOGY_MEDIA_DIR: mediaDir, GENEALOGY_SKIP_REFERENCE: '1' };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private,is_start) VALUES
 (1,'Jean','MAZAUD','male','deceased',0,1),(2,'Marie','LACOMBE','female','deceased',0,0),(3,'Louis','MAZAUD','male','deceased',0,0),
 (4,'Hélène','MAZAUD','female','living',0,0),(5,'Paul','DURAND','male','deceased',1,0),(6,'Jeanne','DURAND','female','deceased',0,0),
 (7,'Pierre','MAZAUD','male','deceased',0,0),(8,'Lucie','MAZAUD','female','unknown',0,0),(9,'Antoine','LACOMBE','male','deceased',0,0)");
$pdo->exec("INSERT INTO places(id,name,country) VALUES(1,'Naves','France'),(2,'Tulle','France'),(3,'Cimetière-Secret','France')");
$t = fn($g) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$g' AND scope='person' ORDER BY id LIMIT 1")->fetchColumn();
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id,is_private) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT','1851',1851,1,0],[1,'DEAT','1920',1920,2,0],[1,'BURI','12 mai 1920',1920,3,1],[2,'BIRT','1855',1855,1,0],[3,'BIRT','1880',1880,1,0],[3,'DEAT','1950',1950,2,0],
  [4,'BIRT','1990',1990,2,0],[5,'BIRT','1890',1890,1,0],[5,'DEAT','1960',1960,1,0],[6,'BIRT','1885',1885,1,0],[6,'DEAT','1970',1970,1,0],[7,'BIRT','1931',1931,1,0],[7,'DEAT','2000',2000,1,0],
  [8,'BIRT','1985',1985,2,0],[9,'BIRT','1820',1820,1,0],[9,'DEAT','1890',1890,1,0]] as $e) { $ev->execute([$e[0], $t($e[1]), $e[2], $e[3], $e[4], $e[5]]); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,3,6),(3,9,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id,position) VALUES(1,3,1),(1,4,2),(1,5,3),(2,7,1),(2,8,2),(3,2,1)");
$pdo->exec("INSERT INTO notes(entity_type,entity_id,title,body) VALUES('person',1,'Souvenir','Jean était le grand-père de Lucie MAZAUD et le voisin des LACOMBE.')");
$pdo->exec("INSERT INTO media(id,title,media_type,filename) VALUES(1,'Jean au jardin','image','jean.jpg'),(2,'Toute la famille','image','groupe.jpg')");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(1,'person',1),(2,'person',1),(2,'person',4)");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const sql = (q, ...args) => JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p=new PDO('sqlite:'.$argv[1]);$s=$p->prepare($argv[2]);$s->execute(array_slice($argv,3));echo json_encode($s->fetchAll(PDO::FETCH_ASSOC));`, path.join(dataDir, 'genealogy.sqlite'), q, ...args.map(String)], { encoding: 'utf8' }).stdout || '[]');
    for (const k of Object.keys(env)) process.env[k] = env[k];
    const server = new PhpServer({ phpPath, appRoot, pool: 3, dataDir, mediaDir, sessionDir: path.join(tmp, 'sessions'), logFile: path.join(tmp, 'logs', 'php.log') });
    server.on('error', () => {});
    await server.start();
    const gate = new LanGate({ server, dataDir, appRoot, test: { bind: '127.0.0.1', address: HOME, peer: () => '192.168.1.52' } });
    const secrets = [server.secret, server.gateSecret, server.localSecret];

    /* ═════ outils : la porte, les appareils, la fenêtre principale ═════ */
    let peer = '192.168.1.52';
    gate.test.peer = () => peer;
    const ask = (method, p, { cookie = '', body = null, origin, headers = {}, type } = {}) => new Promise(resolve => {
        const h = { host: `${HOME.ip}:${gate.port}`, ...headers };
        if (cookie) h.cookie = cookie;
        if (origin !== undefined) h.origin = origin;
        let data = null;
        if (body !== null) { data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); h['content-type'] = type || 'application/json'; h['content-length'] = data.length; }
        const req = http.request({ host: '127.0.0.1', port: gate.port, method, path: p, headers: h, agent: false }, res => {
            const chunks = []; res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const r = { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) };
                r.json = () => { try { return JSON.parse(r.body.toString()); } catch (_) { return {}; } }; r.text = () => r.body.toString();
                const all = JSON.stringify(r.headers) + r.body.toString('latin1'); for (const s of secrets) if (s) assert.ok(!all.includes(s), 'un secret interne est sorti sur le réseau');
                resolve(r);
            });
        });
        req.on('error', e => resolve({ status: 0, error: e.code, headers: {}, body: Buffer.alloc(0), json: () => ({}), text: () => '' }));
        req.end(data === null ? undefined : data);
    });
    /** un nouveau « navigateur » du même appareil : le jeton de la porte, sans la séance */
    const fresh = dev => ({ ...dev, jar: (() => { const j = jar(); j.c.lcnda_appareil = dev.jar.c.lcnda_appareil; return j; })() });
    const jar = () => { const c = {}; return { header: () => Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '), take: r => { for (const sc of [].concat(r.headers['set-cookie'] || [])) { const [kv] = sc.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); } }, c }; };
    const origin = () => `http://${HOME.ip}:${gate.port}`;
    const pair = async (name, ip) => {
        peer = ip;
        const inv = gate.status().invite; const j = jar();
        const d = await ask('POST', '/__lan/demande', { body: { name, invite: inv ? inv.code : '', kind: 'lecture' }, origin: origin() });
        assert.equal(d.status, 200, d.text());
        const a = gate.accept(d.json().id, 'lecture'); assert.equal(a.ok, true);
        const e = await ask('GET', `/__lan/etat?id=${d.json().id}&k=${d.json().poll}`); j.take(e);
        return { jar: j, id: a.device.id, ip, name };
    };
    /** un appareil qui parle à la page de la famille */
    const fam = dev => {
        const F = { dev, csrf: '' };
        F.state = async () => { peer = dev.ip; const r = await ask('GET', '/famille.php?action=state', { cookie: dev.jar.header() }); dev.jar.take(r); if (r.json().csrf) F.csrf = r.json().csrf; return r; };
        F.get = async (action, q = '') => { peer = dev.ip; const r = await ask('GET', `/famille.php?action=${action}${q}`, { cookie: dev.jar.header() }); dev.jar.take(r); return r; };
        F.post = async (action, body = {}, o = {}) => {
            peer = dev.ip;
            const csrf = o.csrf !== undefined ? o.csrf : F.csrf;
            const r = await ask('POST', `/famille.php?action=${action}`, { cookie: o.cookie !== undefined ? o.cookie : dev.jar.header(), origin: origin(), body: o.raw ? body : { ...body, csrf }, headers: { 'x-csrf-token': csrf } });
            dev.jar.take(r); if (r.json().csrf) F.csrf = r.json().csrf; return r;
        };
        F.upload = async (action, fields, files) => { peer = dev.ip; const m = multipart({ ...fields, csrf: F.csrf }, files); const r = await ask('POST', `/famille.php?action=${action}`, { cookie: dev.jar.header(), origin: origin(), body: m.body, type: m.type, headers: { 'x-csrf-token': F.csrf } }); dev.jar.take(r); return r; };
        F.login = async (login, pw) => { await F.state(); return F.post('login', { login, password: pw }); };
        return F;
    };
    const main = jar();
    const mainAsk = async (p, o = {}) => { const r = await server.request(p, { timeout: 60000, ...o, headers: { ...(o.headers || {}), cookie: main.header() } }); main.take(r); return r; };
    let csrfM = '';
    const mainCsrf = async () => { const r = await mainAsk('/'); return JSON.parse((r.body.toString().match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""'); };
    const J = r => { try { return JSON.parse(r.body.toString()); } catch (_) { return {}; } };
    const mainPost = async (action, body) => {
        if (!csrfM) csrfM = await mainCsrf();
        let r = await mainAsk('/api.php?action=' + action, { method: 'POST', body: JSON.stringify({ ...body, csrf: csrfM }), headers: { 'content-type': 'application/json', 'x-csrf-token': csrfM } });
        if (r.status === 419) { csrfM = await mainCsrf(); r = await mainAsk('/api.php?action=' + action, { method: 'POST', body: JSON.stringify({ ...body, csrf: csrfM }), headers: { 'content-type': 'application/json', 'x-csrf-token': csrfM } }); }
        return r;
    };
    const mainGet = (action, q = '') => mainAsk(`/api.php?action=${action}${q}`);
    const owner = async (op, body = {}) => { const r = await mainPost('fc_write', { op, ...body }); return { ...J(r), status: r.status }; };

    const devs = {};
    const acc = {};
    let browser = null, php3 = null;
    try {
        await t('mise en place : mot de passe de la généalogie, porte ouverte, quatre appareils acceptés (👁 lecture)', async () => {
            const set = await mainPost('glock_set', { password: PW, password2: PW, minutes: 15, ack: 1 });
            assert.equal(set.status, 200, set.body.toString());
            csrfM = await mainCsrf();
            assert.equal((await gate.open({ passwordOk: true })).ok, true);
            devs.odile = await pair('Téléphone d’Odile', '192.168.1.41');
            devs.henri = await pair('Portable d’Henri', '192.168.1.42');
            devs.lucas = await pair('Tablette de Lucas', '192.168.1.43');
            devs.plain = await pair('Ordinateur du salon', '192.168.1.44');
            devs.intrus = await pair('Intrus', '192.168.1.45');
        });

        /* ─── A. comptes et invitations ─── */
        const inv = {};
        await t('A1 l’ordinateur principal crée trois comptes (✎ tout l’arbre, 🌿 descendants de Louis, 👁 ancêtres de Pierre) : invitation = jeton de 48 et code de 8 chiffres, rien en clair dans la base', async () => {
            let r = await owner('account_new', { name: 'Odile LACOMBE', relation: 'cousine', role: 'proposer', scope_kind: 'tout', living: 'caches', can_attach: 1 });
            assert.equal(r.status, 200, JSON.stringify(r)); acc.odile = r.account; inv.odile = r.invite;
            assert.match(r.invite.token, /^[a-f0-9]{48}$/); assert.match(r.invite.code, /^\d{8}$/);
            r = await owner('account_new', { name: 'Henri DURAND', role: 'branche', scope_kind: 'descendants', scope_person: 3, living: 'visibles' }); acc.henri = r.account; inv.henri = r.invite;
            assert.equal(r.account.living, 'visibles');
            r = await owner('account_new', { name: 'Lucas MAZAUD', role: 'lire', scope_kind: 'ascendants', scope_person: 7, living: 'visibles', can_notes: 1, can_attach: 1 }); acc.lucas = r.account; inv.lucas = r.invite;
            assert.equal(r.account.living, 'prenom', '👁 ne voit jamais les vivants en entier'); assert.equal(r.account.can_attach, 0, '👁 ne joint rien');
            r = await owner('account_new', { name: 'Sans branche', role: 'branche', scope_kind: 'tout' }); assert.equal(r.status, 422, '🌿 sans branche : refusé');
            const rows = sql('SELECT code_hash, token_hash FROM fc_invites');
            const all = JSON.stringify(rows);
            for (const i of Object.values(inv)) { assert.ok(!all.includes(i.code) && !all.includes(i.token), 'seules les empreintes sont gardées'); }
            assert.equal(sql("SELECT count(*) AS n FROM fc_accounts WHERE pw_hash<>''")[0].n, 0);
        });
        const O = fam(devs.odile), H = fam(devs.henri), L = fam(devs.lucas), X = fam(devs.intrus);
        await t('A2 première venue par le lien (jeton) : mot de passe trop court refusé, puis choisi ; le même lien ne sert plus ; haché (pas en clair)', async () => {
            await O.state();
            let r = await O.post('join', { token: inv.odile.token, password: 'court', password2: 'court' }); assert.equal(r.status, 422);
            r = await O.post('join', { token: inv.odile.token, password: 'Odile-Mot-2026', password2: 'Odile-Mot-2027' }); assert.equal(r.status, 422, 'deux mots de passe différents');
            r = await O.post('join', { token: inv.odile.token, password: 'Odile-Mot-2026', password2: 'Odile-Mot-2026' });
            assert.equal(r.status, 200, r.text()); assert.equal(r.json().login, acc.odile.login);
            const st = await O.state(); assert.equal(st.json().logged, true); assert.equal(st.json().account.role, 'proposer');
            const h = sql('SELECT pw_hash FROM fc_accounts WHERE id=?', acc.odile.id)[0].pw_hash;
            assert.ok(h.startsWith('$2y$12$') || h.startsWith('$argon2id$'), h); assert.ok(!h.includes('Odile-Mot'));
            await X.state();
            r = await X.post('join', { token: inv.odile.token, password: 'Autre-Mot-2026', password2: 'Autre-Mot-2026' }); assert.equal(r.status, 403, 'une seule fois');
        });
        await t('A3 par le code de 8 chiffres (Henri, Lucas) ; un code faux : refusé, et 5 codes faux → cet appareil attend (429)', async () => {
            await H.state(); let r = await H.post('join', { code: inv.henri.code.slice(0, 4) + ' ' + inv.henri.code.slice(4), password: 'Henri-Mot-2026', password2: 'Henri-Mot-2026' }); assert.equal(r.status, 200, r.text());
            await L.state(); r = await L.post('join', { code: inv.lucas.code, password: 'Lucas-Mot-2026', password2: 'Lucas-Mot-2026' }); assert.equal(r.status, 200, r.text());
            await X.state();
            const codes = [];
            // (l'intrus a déjà raté une fois : le lien déjà utilisé, en A2)
            for (let i = 0; i < 3; i++) { r = await X.post('join', { code: String(10000000 + i), password: 'Intrus-Mot-2026', password2: 'Intrus-Mot-2026' }); codes.push(r.status); }
            assert.deepEqual(codes, [403, 403, 403]);
            r = await X.post('join', { code: '10000009', password: 'Intrus-Mot-2026', password2: 'Intrus-Mot-2026' }); assert.equal(r.status, 429, r.text());
            assert.ok(Number(r.headers['retry-after']) > 0);
        });

        /* ─── B. connexion et séance ─── */
        await t('B1 connexion : identifiant inconnu et mauvais mot de passe → la même réponse (401) ; bon mot de passe → séance', async () => {
            const O2 = fam(fresh(devs.odile));
            const a = await O2.login('personne.inconnue', 'Odile-Mot-2026');
            const b = await O2.login(acc.odile.login, 'faux-faux-faux');
            assert.equal(a.status, 401); assert.equal(b.status, 401); assert.equal(a.json().error, b.json().error);
            const c = await O2.login(acc.odile.login, 'Odile-Mot-2026'); assert.equal(c.status, 200, c.text());
            assert.ok(/lcnda_famille=/.test([].concat(c.headers['set-cookie'] || []).join(';')), 'cookie de séance à part : lcnda_famille');
            assert.ok([].concat(c.headers['set-cookie'] || []).some(s => /lcnda_famille=.*HttpOnly/i.test(s) && /SameSite=Strict/i.test(s)));
            devs.odile.jar = O2.dev.jar; O.dev.jar = O2.dev.jar; O.csrf = O2.csrf;
        });
        await t('B2 5 mots de passe faux sur le compte de Lucas (depuis un autre appareil) → ce compte attend, même avec le bon mot de passe ; débloqué par l’ordinateur principal', async () => {
            const X2 = fam(fresh(devs.plain));
            await X2.state();
            for (let i = 0; i < 5; i++) { await X2.post('login', { login: acc.lucas.login, password: 'faux' + i }); }
            const L2 = fam(fresh(devs.lucas));
            let r = await L2.login(acc.lucas.login, 'Lucas-Mot-2026'); assert.equal(r.status, 429, r.text());
            assert.ok(sql("SELECT count(*) AS n FROM fc_journal WHERE kind='echec' AND account_id=?", acc.lucas.id)[0].n >= 5, 'les essais ratés sont au journal');
            assert.equal((await owner('unblock', { id: acc.lucas.id })).status, 200);
            r = await L2.login(acc.lucas.login, 'Lucas-Mot-2026'); assert.equal(r.status, 200, r.text());
            devs.lucas.jar = L2.dev.jar; L.dev.jar = L2.dev.jar; L.csrf = L2.csrf;
        });
        await t('B3 séance liée à l’appareil : le cookie d’Odile volé et rejoué depuis un autre appareil → pas connecté ; la séance du propriétaire n’ouvre rien', async () => {
            peer = devs.intrus.ip;
            const stolen = devs.intrus.jar.header() + '; lcnda_famille=' + devs.odile.jar.c.lcnda_famille;
            const r = await ask('GET', '/famille.php?action=state', { cookie: stolen }); assert.equal(r.json().logged, false);
            const p = await ask('GET', '/famille.php?action=person&id=1', { cookie: stolen }); assert.equal(p.status, 401);
            // la séance de la fenêtre principale (PHPSESSID) présentée à la page de la famille : rien
            const q = await ask('GET', '/famille.php?action=person&id=1', { cookie: devs.intrus.jar.header() + '; PHPSESSID=' + (main.c.PHPSESSID || 'x') }); assert.equal(q.status, 401);
            // et la fenêtre principale (sans appareil) n'a pas accès à famille.php
            const w = await mainAsk('/famille.php?action=state'); assert.equal(w.status, 403);
        });
        await t('B4 CSRF : sans jeton, faux jeton, ou le jeton d’un autre → 419, rien n’est écrit', async () => {
            const before = sql('SELECT count(*) AS n FROM fc_proposals')[0].n;
            const body = { kind: 'note', person: 1, text: 'sans jeton' };
            assert.equal((await O.post('propose', body, { csrf: '' })).status, 419);
            assert.equal((await O.post('propose', body, { csrf: 'a'.repeat(48) })).status, 419);
            assert.equal((await O.post('propose', body, { csrf: H.csrf })).status, 419);
            assert.equal(sql('SELECT count(*) AS n FROM fc_proposals')[0].n, before);
        });

        /* ─── C. qui voit quoi ─── */
        await t('C1 ✎ Odile (vivants cachés) : la recherche ne trouve ni vivant ni fiche 🔒 ; une fiche vivante répond EXACTEMENT comme une fiche qui n’existe pas', async () => {
            const s = (await O.get('search', '&q=mazaud')).json().people.map(p => p.name);
            assert.deepEqual(s.sort(), ['Jean MAZAUD', 'Louis MAZAUD', 'Pierre MAZAUD']);
            const d = (await O.get('search', '&q=durand')).json().people.map(p => p.name); assert.deepEqual(d, ['Jeanne DURAND']);
            const viv = await O.get('person', '&id=4'), priv = await O.get('person', '&id=5'), none = await O.get('person', '&id=999'), lucie = await O.get('person', '&id=8');
            for (const r of [viv, priv, lucie]) { assert.equal(r.status, none.status); assert.equal(r.text(), none.text()); }
            assert.equal(none.status, 404);
        });
        await t('C2 la fiche de Jean pour Odile : « Personne vivante » à la place d’Hélène (sans nom ni date), Paul 🔒 absent, inhumation 🔒 absente, photo avec un vivant absente', async () => {
            const r = await O.get('person', '&id=1'); assert.equal(r.status, 200, r.text());
            const txt = r.text(), p = r.json().person;
            assert.doesNotMatch(txt, /Hélène|H\\u00e9l\\u00e8ne|1990|DURAND|Paul|Secret|Inhumation","type":"event","value":\{"date":"12/);
            const kids = p.couples[0].children;
            assert.deepEqual(kids.map(k => k.name || (k.living ? 'VIVANT' : '?')), ['Louis MAZAUD', 'VIVANT']);
            assert.equal(kids[1].first, undefined); assert.equal(kids[1].id, undefined);
            assert.deepEqual(p.photos.map(x => x.id), [1]);
            assert.equal((await O.get('media', '&id=2')).status, 404, 'la photo avec Hélène ne se télécharge pas');
            const m = await O.get('media', '&id=1'); assert.equal(m.status, 200); assert.match(m.headers['content-type'], /^image\/jpeg/); assert.match(m.headers['content-security-policy'] || '', /sandbox/);
            assert.deepEqual(p.notes, [], 'notes : pas cochées pour Odile');
            assert.equal(r.json().can.propose, true); assert.equal(r.json().can.edit, false);
        });
        await t('C3 👁 Lucas (ancêtres de Pierre, prénom seulement, notes) : hors de sa partie = introuvable ; le nom d’une vivante est retiré des notes', async () => {
            assert.equal((await L.get('person', '&id=4')).status, 404); assert.equal((await L.get('person', '&id=8')).status, 404);
            const r = (await L.get('person', '&id=1')).json().person;
            assert.ok(r.notes.length === 1 && r.notes[0].includes('[nom retiré]') && !r.notes[0].includes('Lucie'), JSON.stringify(r.notes));
            assert.deepEqual(r.couples[0].children.map(k => k.name), ['Louis MAZAUD'], 'Hélène est hors de sa partie : rien, pas même « Personne vivante »');
        });
        await t('C4 🌿 Henri (descendants de Louis, vivants visibles) : voit Lucie dans sa branche ; Jean (hors branche) introuvable', async () => {
            const r = await H.get('person', '&id=8'); assert.equal(r.status, 200, r.text()); assert.equal(r.json().person.name, 'Lucie MAZAUD'); assert.equal(r.json().can.edit, true);
            assert.equal((await H.get('person', '&id=1')).status, 404);
        });
        await t('C5 changer les droits d’Odile (prénom seulement) ferme sa séance ; reconnectée : « Hélène » sans nom de famille ni date, et toujours introuvable en recherche', async () => {
            const r = await owner('account_save', { id: acc.odile.id, living: 'prenom' }); assert.equal(r.status, 200); assert.equal(r.prev.living, 'caches');
            assert.equal((await O.get('person', '&id=1')).status, 401, 'séance refermée');
            assert.equal((await O.login(acc.odile.login, 'Odile-Mot-2026')).status, 200);
            const p = (await O.get('person', '&id=1')).json().person;
            assert.deepEqual(p.couples[0].children[1], { first: 'Hélène', living: true });
            assert.doesNotMatch(JSON.stringify(p), /1990/);
            assert.equal((await O.get('search', '&q=helene')).json().people.length, 0);
            assert.equal((await O.get('person', '&id=4')).status, 404);
        });

        /* ─── D. élévation de droits ─── */
        await t('D1 un appareil relié à un compte ne joint plus QUE famille.php : api.php (lecture, écriture, mot de passe, file), médias, envois, sauvegardes → refusés ; « / » mène à la famille', async () => {
            peer = devs.odile.ip;
            const c = devs.odile.jar.header();
            for (const p of ['/api.php?action=bootstrap', '/api.php?action=people', '/api.php?action=fc_props', '/api.php?action=fc_state', '/api.php?action=export_gedcom', '/api.php?action=person&id=4', '/media/jean.jpg', '/telecharger.php', '/terrain.php?action=state']) {
                const r = await ask('GET', p, { cookie: c }); assert.ok([403, 423].includes(r.status), `${p} → ${r.status}`); assert.doesNotMatch(r.text(), /Hélène|LACOMBE/);
            }
            for (const [p, b] of [['/api.php?action=fc_write', { op: 'accept', id: 1 }], ['/api.php?action=glock_unlock', { password: PW }], ['/api.php?action=save_person', { id: 1, first_name: 'X' }], ['/upload.php', {}]]) {
                const r = await ask('POST', p, { cookie: c, origin: origin(), body: b }); assert.ok([403, 423].includes(r.status), `${p} → ${r.status}`);
            }
            const home = await ask('GET', '/', { cookie: c }); assert.equal(home.status, 302); assert.equal(home.headers.location, '/famille.php');
            const page = await ask('GET', '/famille.php', { cookie: c }); assert.equal(page.status, 200);
            assert.match(page.headers['content-security-policy'], /script-src 'self'/); assert.doesNotMatch(page.text(), /MAZAUD|LACOMBE/, 'la page elle-même ne contient aucune donnée');
            assert.equal((await ask('GET', '/assets/js/app-famille.js', { cookie: c })).status, 200);
        });
        await t('D2 liste blanche de famille.php : action inconnue (403), mauvaise méthode (405) ; un en-tête d’appareil forgé sans la signature de la porte → refusé', async () => {
            assert.equal((await O.get('fc_props')).status, 403); assert.equal((await O.get('export')).status, 403);
            assert.equal((await O.get('propose')).status, 405); assert.equal((await O.post('person', {})).status, 405);
            const r = await server.request('/famille.php?action=state', { headers: { 'x-carnet-device': 'abcdef0123456789', 'x-carnet-gate': 'faux', 'x-carnet-device-kind': 'lecture' } });
            assert.equal(r.status, 403);
        });
        await t('D3 👁 Lucas ne propose rien ; ✎ Odile ne modifie pas directement (403, noté au journal) — la base ne bouge pas', async () => {
            const before = sql('SELECT first_name FROM persons WHERE id=1')[0].first_name;
            assert.equal((await L.post('propose', { kind: 'note', person: 1, text: 'x' })).status, 403);
            assert.equal((await L.post('edit', { kind: 'fait', person: 1, field: 'first_name', value: 'Jeannot' })).status, 403);
            assert.equal((await O.post('edit', { kind: 'fait', person: 1, field: 'first_name', value: 'Jeannot' })).status, 403);
            assert.equal(sql('SELECT first_name FROM persons WHERE id=1')[0].first_name, before);
            assert.ok(sql("SELECT count(*) AS n FROM fc_journal WHERE kind='refus'")[0].n >= 2);
        });
        await t('D4 ✎ proposer sur une fiche vivante, 🔒, inexistante → introuvable ; un champ hors liste (is_private, living_status, id) → refusé ; les champs du serveur envoyés (status, direct, account_id) sont ignorés', async () => {
            for (const id of [4, 5, 999]) assert.equal((await O.post('propose', { kind: 'fait', person: id, field: 'occupation', value: 'x' })).status, 404);
            for (const f of ['is_private', 'living_status', 'id', 'first_name; DROP TABLE persons']) assert.equal((await O.post('propose', { kind: 'fait', person: 1, field: f, value: '0' })).status, 422, f);
            assert.equal((await O.post('propose', { kind: 'admin', person: 1 })).status, 422);
            const r = await O.post('propose', { kind: 'fait', person: 1, field: 'occupation', value: 'cultivateur', status: 'acceptee', direct: 1, account_id: acc.henri.id, account_name: 'Toi' });
            assert.equal(r.status, 200, r.text());
            const row = sql('SELECT * FROM fc_proposals WHERE id=?', r.json().id)[0];
            assert.equal(row.status, 'attente'); assert.equal(row.direct, 0); assert.equal(row.account_id, acc.odile.id); assert.equal(row.account_name, 'Odile LACOMBE');
            assert.equal(sql('SELECT occupation FROM persons WHERE id=1')[0].occupation, '', 'rien n’entre sans accord');
            // un événement 🔒 (l'inhumation de Jean) : on ne peut ni le voir ni le « corriger »
            assert.equal((await O.post('propose', { kind: 'fait', person: 1, field: 'BURI', value: { date: '1921' } })).status, 404);
        });
        await t('D5 🌿 Henri écrit directement dans sa branche (métier de Pierre) — journal, ↶ exact ; hors branche (Jean) : introuvable et noté ; ajouter un parent à une branche de descendants : refusé', async () => {
            let r = await H.post('edit', { kind: 'fait', person: 7, field: 'occupation', value: 'menuisier' });
            assert.equal(r.status, 200, r.text()); assert.equal(sql('SELECT occupation FROM persons WHERE id=7')[0].occupation, 'menuisier');
            const id = r.json().id;
            assert.equal(sql("SELECT count(*) AS n FROM fc_journal WHERE kind='modif' AND account_id=? AND device_name=?", acc.henri.id, 'Portable d’Henri')[0].n, 1);
            assert.ok(sql("SELECT count(*) AS n FROM change_log WHERE entity_type='person' AND entity_id=7 AND summary LIKE '%Henri DURAND%'")[0].n >= 1, 'aussi au journal des modifications de l’app');
            assert.equal((await O.post('edit_undo', { id })).status, 403, 'Odile ne peut pas défaire la modification d’Henri');
            r = await H.post('edit_undo', { id }); assert.equal(r.status, 200, r.text()); assert.equal(sql('SELECT occupation FROM persons WHERE id=7')[0].occupation, '');
            r = await H.post('edit', { kind: 'fait', person: 1, field: 'occupation', value: 'x' }); assert.equal(r.status, 404);
            assert.equal(sql("SELECT count(*) AS n FROM fc_journal WHERE kind='hors_branche' AND person_id=1")[0].n, 1);
            r = await H.post('edit', { kind: 'personne', person: 3, relation: 'parent', first_name: 'Inconnu', last_name: 'MAZAUD' }); assert.equal(r.status, 403); assert.equal(r.json().hors_branche, true);
            assert.equal(sql("SELECT count(*) AS n FROM persons WHERE first_name='Inconnu'")[0].n, 0);
            // un enfant ajouté à Pierre : créé, relié, dans la branche ; ↶ par l'ordinateur principal
            r = await H.post('edit', { kind: 'personne', person: 7, relation: 'enfant', first_name: 'Jules', last_name: 'MAZAUD', birth: { date: '1960', place: 'Naves' }, death: { date: '2010' } });
            assert.equal(r.status, 200, r.text());
            const jid = sql("SELECT id FROM persons WHERE first_name='Jules'")[0].id;
            assert.equal(sql('SELECT count(*) AS n FROM family_children WHERE child_id=?', jid)[0].n, 1);
            assert.equal((await H.get('person', `&id=${jid}`)).status, 200);
            const u = await owner('undo', { id: r.json().id }); assert.equal(u.status, 200, JSON.stringify(u)); assert.equal(u.status === 200 && u.status, 200);
            assert.equal(sql("SELECT count(*) AS n FROM persons WHERE first_name='Jules'")[0].n, 0, '↶ : la fiche créée est retirée');
            assert.equal(sql('SELECT count(*) AS n FROM families WHERE partner1_id=7')[0].n, 0, '↶ : la famille créée pour l’occasion aussi');
            // fiche verrouillée
            sql('UPDATE persons SET is_locked=1 WHERE id=7');
            assert.equal((await H.post('edit', { kind: 'fait', person: 7, field: 'occupation', value: 'x' })).status, 423);
            sql('UPDATE persons SET is_locked=0 WHERE id=7');
        });
        await t('D6 retirer / ↶ la proposition d’un autre : introuvable ; retirer la sienne puis ↶ la remettre', async () => {
            const mine = sql("SELECT id FROM fc_proposals WHERE account_id=? AND status='attente' ORDER BY id DESC LIMIT 1", acc.odile.id)[0].id;
            assert.equal((await H.post('withdraw', { id: mine })).status, 404);
            assert.equal((await O.post('withdraw', { id: mine })).status, 200); assert.equal(sql('SELECT status FROM fc_proposals WHERE id=?', mine)[0].status, 'retiree');
            assert.equal((await O.post('withdraw', { id: mine, undo: 1 })).status, 200); assert.equal(sql('SELECT status FROM fc_proposals WHERE id=?', mine)[0].status, 'attente');
        });

        /* ─── E. la file des propositions ─── */
        const P = {};
        await t('E1 ✎ Odile propose : le décès de Louis (avec la photo de l’acte, vérifiée et réenregistrée), un souvenir, une photo, un enfant « Pierre MAZAUD 1931 » (existe peut-être déjà)', async () => {
            let r = await O.upload('propose', { kind: 'fait', person: 3, field: 'DEAT', value: { date: '4 février 1951', place: 'Naves' }, comment: 'C’est écrit sur le livret de famille de ma grand-mère.' }, [{ data: jpg, name: '../../livret.php.jpg' }]);
            assert.equal(r.status, 200, r.text()); P.deces = r.json().id;
            const row = sql('SELECT file FROM fc_proposals WHERE id=?', P.deces)[0];
            assert.match(row.file, /^[a-f0-9]{32}\.jpg$/, 'nom tiré au hasard, jamais celui envoyé');
            assert.ok(fs.existsSync(path.join(dataDir, 'famille-propositions', row.file)));
            r = await O.upload('propose', { kind: 'fait', person: 3, field: 'occupation', value: 'x' }, [{ data: Buffer.from('<?php echo 1; ?>'), name: 'x.jpg' }]); assert.equal(r.status, 415, 'pas une photo');
            r = await O.post('propose', { kind: 'note', person: 1, text: 'Il allait à pied au marché de Tulle <img src=x onerror="window.__xss=1"> chaque samedi.' }); assert.equal(r.status, 200); P.note = r.json().id;
            r = await O.upload('propose', { kind: 'photo', person: 1, caption: 'Jean devant la ferme', origin: 'album de Jeanne' }, [{ data: png, name: 'ferme.png', type: 'image/png' }]); assert.equal(r.status, 200, r.text()); P.photo = r.json().id;
            r = await O.get('similar', '&first=Pierre&last=Mazaud&year=1931'); assert.deepEqual(r.json().people.map(p => p.id), [7]);
            r = await O.get('similar', '&first=Lucie&last=Mazaud&year=1985'); assert.deepEqual(r.json().people, [], '« existe déjà » ne dévoile pas une vivante cachée');
            r = await O.post('propose', { kind: 'personne', person: 3, relation: 'enfant', first_name: 'Pierre', last_name: 'MAZAUD', birth: { date: '1931', place: 'Naves' } }); assert.equal(r.status, 200, r.text()); P.enfant = r.json().id;
            r = await O.post('propose', { kind: 'fait', person: 1, field: 'first_name', value: 'Jean Marie' }); P.prenom = r.json().id;
            assert.ok(J(await mainGet('fc_count')).pending >= 6);
        });
        await t('E2 la file (ordinateur principal) : ancien → nouveau, petit mot, photo jointe servie avec un type sûr, « existe peut-être déjà », « ⚠ modifié depuis »', async () => {
            sql("UPDATE events SET date_text='1952', year=1952 WHERE person_id=3 AND event_type_id=(SELECT id FROM event_types WHERE gedcom_tag='DEAT' AND scope='person' LIMIT 1)");
            const d = J(await mainGet('fc_props', '&status=attente'));
            const deces = d.items.find(x => x.id === P.deces);
            assert.deepEqual(deces.old, { date: '1950', place: 'Tulle' }); assert.deepEqual(deces.new, { date: '4 février 1951', place: 'Naves' });
            assert.equal(deces.changed, '1952, Tulle'); assert.equal(deces.file, true); assert.equal(deces.account, 'Odile LACOMBE'); assert.equal(deces.device, 'Téléphone d’Odile');
            assert.deepEqual(d.items.find(x => x.id === P.enfant).dups.map(x => x.id), [7]);
            const f = await mainGet('fc_prop_file', `&id=${P.deces}`); assert.equal(f.status, 200); assert.match(f.headers['content-type'], /^image\/jpeg/); assert.equal(f.headers['x-content-type-options'], 'nosniff');
            sql("UPDATE events SET date_text='1950', year=1950 WHERE person_id=3 AND event_type_id=(SELECT id FROM event_types WHERE gedcom_tag='DEAT' AND scope='person' LIMIT 1)");
        });
        await t('E3 ✓ Accepter le décès : écrit dans l’arbre, la photo devient un média relié à la fiche et à l’événement ; ↶ remet EXACTEMENT l’ancien (date, lieu, média, fichier) ; ré-accepter', async () => {
            const evBefore = sql("SELECT e.id, e.date_text, e.year, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=3 AND t.gedcom_tag='DEAT'")[0];
            const mBefore = sql('SELECT count(*) AS n FROM media')[0].n;
            let r = await owner('accept', { id: P.deces }); assert.equal(r.status, 200, JSON.stringify(r));
            const ev = sql('SELECT e.date_text, e.year, pl.name FROM events e LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id=?', evBefore.id)[0];
            assert.deepEqual(ev, { date_text: '4 février 1951', year: 1951, name: 'Naves' });
            const med = sql("SELECT m.id, m.filename FROM media m WHERE m.filename LIKE 'famille-%'");
            assert.equal(med.length, 1); assert.ok(fs.existsSync(path.join(mediaDir, med[0].filename)));
            assert.equal(sql("SELECT count(*) AS n FROM media_links WHERE media_id=? AND ((entity_type='person' AND entity_id=3) OR (entity_type='event' AND entity_id=?))", med[0].id, evBefore.id)[0].n, 2);
            r = await owner('undo', { id: P.deces }); assert.equal(r.status, 200, JSON.stringify(r));
            assert.deepEqual(sql('SELECT id, date_text, year, place_id FROM events WHERE id=?', evBefore.id)[0], evBefore);
            assert.equal(sql('SELECT count(*) AS n FROM media')[0].n, mBefore); assert.ok(!fs.existsSync(path.join(mediaDir, med[0].filename)), 'le fichier copié est retiré');
            assert.equal(sql('SELECT status FROM fc_proposals WHERE id=?', P.deces)[0].status, 'attente');
            assert.equal((await owner('accept', { id: P.deces })).status, 200);
            // ↶ refusé si la date a été changée depuis par quelqu'un d'autre (rien n'est écrasé sans le voir)
            sql("UPDATE events SET date_text='5 février 1951' WHERE id=?", evBefore.id);
            r = await owner('undo', { id: P.deces }); assert.equal(r.status, 409); assert.match(r.error, /5 février 1951/);
            sql("UPDATE events SET date_text='4 février 1951' WHERE id=?", evBefore.id);
        });
        await t('E4 personne « existe peut-être déjà » : Accepter sans choix → 409 avec les fiches ; « créer » → une fiche neuve reliée ; ↶ la retire ; « relier » → aucune fiche créée', async () => {
            let r = await owner('accept', { id: P.enfant }); assert.equal(r.status, 409); assert.equal(r.needs_choice, true); assert.deepEqual(r.dups.map(x => x.id), [7]);
            const n0 = sql('SELECT count(*) AS n FROM persons')[0].n;
            r = await owner('accept', { id: P.enfant, choice: 'create' }); assert.equal(r.status, 200, JSON.stringify(r));
            assert.equal(sql('SELECT count(*) AS n FROM persons')[0].n, n0 + 1);
            assert.equal(sql('SELECT count(*) AS n FROM family_children WHERE family_id=2 AND child_id=?', r.created_person)[0].n, 1);
            assert.equal((await owner('undo', { id: P.enfant })).status, 200); assert.equal(sql('SELECT count(*) AS n FROM persons')[0].n, n0);
            r = await owner('accept', { id: P.enfant, choice: 'link', link_to: 7 }); assert.equal(r.status, 200, JSON.stringify(r));
            assert.equal(sql('SELECT count(*) AS n FROM persons')[0].n, n0); assert.equal(sql('SELECT count(*) AS n FROM family_children WHERE child_id=7')[0].n, 1);
        });
        await t('E5 ✕ Refuser avec un petit mot (Odile le lit dans « Mes propositions ») ; ↶ le refus ; « Accepter en changeant… » ; photo acceptée → média', async () => {
            let r = await owner('refuse', { id: P.note, note: 'Merci Odile ! Je garde ça pour plus tard.' }); assert.equal(r.status, 200);
            let m = (await O.get('mine')).json();
            assert.equal(m.items.find(x => x.id === P.note).status, 'refusee'); assert.equal(m.items.find(x => x.id === P.note).note, 'Merci Odile ! Je garde ça pour plus tard.');
            assert.equal((await owner('undo', { id: P.note })).status, 200); assert.equal(sql('SELECT status FROM fc_proposals WHERE id=?', P.note)[0].status, 'attente');
            r = await owner('accept', { id: P.prenom, value: 'Jean-Marie' }); assert.equal(r.status, 200); assert.equal(sql('SELECT first_name FROM persons WHERE id=1')[0].first_name, 'Jean-Marie');
            assert.equal((await owner('undo', { id: P.prenom })).status, 200); assert.equal(sql('SELECT first_name FROM persons WHERE id=1')[0].first_name, 'Jean');
            r = await owner('accept', { id: P.photo }); assert.equal(r.status, 200);
            assert.equal(sql("SELECT count(*) AS n FROM media m JOIN media_links l ON l.media_id=m.id WHERE m.title='Jean devant la ferme' AND l.entity_type='person' AND l.entity_id=1")[0].n, 1);
            r = await owner('accept', { id: P.note }); assert.equal(r.status, 200);
            const n = sql("SELECT title, body FROM notes WHERE entity_type='person' AND entity_id=1 AND title LIKE 'Souvenir d%'")[0];
            assert.match(n.title, /Odile LACOMBE/); assert.ok(n.body.includes('&lt;img'), 'le texte du cousin est échappé dans la note');
            m = (await O.get('mine')).json(); assert.ok(m.count.acceptee >= 3);
            assert.equal((await owner('accept', { id: P.note })).status, 422, 'déjà traitée');
        });
        await t('E6 mode consultation sur l’ordinateur principal : la file ne se lit pas (423), la pastille dit 0 ; rien ne se décide', async () => {
            let r = await mainPost('kiosk_enter', { password: 'conso-1234' }); assert.equal(r.status, 200, r.body.toString());
            assert.equal((await mainGet('fc_props')).status, 423); assert.equal(J(await mainGet('fc_count')).pending, 0);
            assert.equal((await mainPost('fc_write', { op: 'accept', id: P.prenom })).status, 423);
            r = await mainPost('kiosk_exit', { password: 'conso-1234' }); assert.equal(r.status, 200);
        });

        /* ─── F. journal ─── */
        await t('F1 📜 journal : qui a fait quoi (propositions, modification d’Henri avec son appareil, hors branche, connexions, acceptations), filtre par personne', async () => {
            const all = J(await mainGet('fc_journal')).items;
            const kinds = new Set(all.map(x => x.kind));
            for (const k of ['proposition', 'modif', 'hors_branche', 'connexion', 'acceptee', 'refusee', 'annule', 'echec', 'visite', 'invitation']) assert.ok(kinds.has(k), k);
            const h = J(await mainGet('fc_journal', `&account=${acc.henri.id}`)).items; assert.ok(h.length && h.every(x => x.account_id === acc.henri.id));
            const mods = J(await mainGet('fc_journal', '&filter=modifications')).items; assert.ok(mods.every(x => ['modif', 'acceptee', 'annule', 'hors_branche'].includes(x.kind)));
            assert.ok(J(await mainGet('fc_journal')).items.some(x => x.kind === 'acceptee' && x.undo), '↶ possible depuis le journal');
        });

        /* ─── G. le mode réseau local d'avant ─── */
        await t('G1 un appareil sans compte garde le mode d’avant (toute l’app en lecture seule, écritures refusées) ; réglage « seulement la famille » → il ne voit plus que la page de la famille ; ↶', async () => {
            peer = devs.plain.ip;
            const c = () => devs.plain.jar.header();
            let r = await ask('GET', '/', { cookie: c() }); devs.plain.jar.take(r); assert.equal(r.status, 200);
            const csrf = JSON.parse((r.text().match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
            r = await ask('POST', '/api.php?action=glock_unlock', { cookie: c(), origin: origin(), body: { password: PW, csrf }, headers: { 'x-csrf-token': csrf } }); devs.plain.jar.take(r); assert.equal(r.status, 200, r.text());
            r = await ask('GET', '/api.php?action=bootstrap', { cookie: c() }); assert.equal(r.status, 200);
            r = await ask('POST', '/api.php?action=save_person', { cookie: c(), origin: origin(), body: { id: 1, first_name: 'X', csrf }, headers: { 'x-csrf-token': csrf } }); assert.equal(r.status, 423);
            r = await ask('GET', '/api.php?action=fc_props', { cookie: c() }); assert.equal(r.status, 423, 'la file : jamais pour un invité');
            const s = await owner('settings', { settings: { sans_compte: 'famille' } }); assert.equal(s.status, 200); assert.equal(s.prev.sans_compte, 'app');
            r = await ask('GET', '/api.php?action=bootstrap', { cookie: c() }); assert.equal(r.status, 403);
            r = await ask('GET', '/', { cookie: c() }); assert.equal(r.status, 302);
            assert.equal((await owner('settings', { settings: s.prev })).status, 200);
            r = await ask('GET', '/api.php?action=bootstrap', { cookie: c() }); assert.equal(r.status, 200);
        });

        /* ─── H. compte retiré ─── */
        await t('H1 retirer le compte de Lucas : sa séance se ferme, il ne se reconnecte plus, son appareil reste limité à la page de la famille ; ↶ le remet', async () => {
            let r = await owner('account_remove', { id: acc.lucas.id }); assert.equal(r.status, 200);
            assert.equal((await L.get('person', '&id=1')).status, 401);
            assert.equal((await L.login(acc.lucas.login, 'Lucas-Mot-2026')).status, 401);
            peer = devs.lucas.ip; assert.equal((await ask('GET', '/api.php?action=bootstrap', { cookie: devs.lucas.jar.header() })).status, 403);
            r = await owner('account_remove', { id: acc.lucas.id, undo: 1 }); assert.equal(r.status, 200);
            assert.equal((await L.login(acc.lucas.login, 'Lucas-Mot-2026')).status, 200);
        });

        /* ─── I. 🌐 fondations en ligne ─── */
        await t('I1 🌐 paquet « Publier » : aucun vivant, aucune fiche ni événement 🔒 ; manifest (format, SHA-256 de chaque fichier) ; ⤓ .zip', async () => {
            const pre = J(await mainGet('fc_publish_preview', '&photos=1'));
            assert.equal(pre.counts.living, 0); assert.equal(pre.counts.private, 0); assert.ok(pre.counts.living_left_home >= 2); assert.equal(pre.counts.private_left_home, 1);
            const z = await mainGet('fc_publish_export', '&photos=1'); assert.equal(z.status, 200); assert.match(z.headers['content-type'], /zip/);
            const zf = path.join(tmp, 'pub.zip'); fs.writeFileSync(zf, z.body);
            const out = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', '$z=new ZipArchive();$z->open($argv[1]);$o=[];for($i=0;$i<$z->numFiles;$i++){$n=$z->getNameIndex($i);$o[$n]=base64_encode($z->getFromIndex($i));}echo json_encode($o);', zf], { encoding: 'utf8', maxBuffer: 64 << 20 });
            const files = JSON.parse(out.stdout); const get = n => Buffer.from(files[n], 'base64');
            const man = JSON.parse(get('manifest.json'));
            assert.equal(man.format, 'lcnda-site-familial'); assert.equal(man.version, 1); assert.equal(man.counts.living, 0);
            for (const [n, f] of Object.entries(man.files)) assert.equal(crypto.createHash('sha256').update(get(n)).digest('hex'), f.sha256, n);
            const arbre = get('arbre.json').toString();
            assert.doesNotMatch(arbre, /Hélène|Lucie|Paul|Secret|"lv"/); assert.match(arbre, /Jean/);
            P.pub = man.publication; P.arbre = JSON.parse(arbre);
            assert.equal(sql('SELECT count(*) AS n FROM fc_publish WHERE token=?', P.pub)[0].n, 1);
        });
        await t('I2 📨 Relever : un fichier de propositions rapporté → en attente (🌐) ; fiche inconnue ou vivante ignorée ; publication inconnue refusée ; deux fois le même : ignoré', async () => {
            const jean = P.arbre.people.find(p => p.f === 'Jean' && p.l === 'MAZAUD').i;
            const boite = { format: 'lcnda-boite-famille', version: 1, publication: P.pub, items: [
                { compte: 'Odile', kind: 'fait', fiche: jean, field: 'occupation', value: 'tisserand', comment: 'acte de mariage' },
                { compte: 'Odile', kind: 'fait', fiche: 9999, field: 'occupation', value: 'x' },
                { compte: 'Odile', kind: 'fait', fiche: jean, field: 'is_private', value: '0' }] };
            let r = await owner('releve', { boite: JSON.stringify(boite) }); assert.equal(r.status, 200, JSON.stringify(r));
            assert.equal(r.added, 1); assert.equal(r.skipped, 2);
            const row = sql("SELECT * FROM fc_proposals WHERE origin='en_ligne'")[0]; assert.equal(row.person_id, 1); assert.equal(row.account_name, '🌐 Odile'); assert.equal(row.status, 'attente');
            r = await owner('releve', { boite: JSON.stringify(boite) }); assert.equal(r.added, 0);
            r = await owner('releve', { boite: JSON.stringify({ ...boite, publication: 'f'.repeat(32) }) }); assert.equal(r.status, 422);
            r = await owner('releve', { boite: '{"format":"autre"}' }); assert.equal(r.status, 422);
        });

        /* ─── J. navigateur ─── */
        let chromium = null;
        try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
        if (chromium) {
            browser = await chromium.launch({ args: ['--host-resolver-rules=MAP 192.168.1.20 127.0.0.1'] });
            const errors = [];
            const desk = await browser.newContext({ viewport: { width: 1280, height: 860 }, extraHTTPHeaders: { 'x-carnet-secret': server.secret } });
            await desk.exposeBinding('__lanCall', async (_s, cmd) => (cmd === 'status' ? gate.status() : cmd === 'invite' ? gate.newInvite() : { ok: true }));
            await desk.addInitScript(() => { window.lcnda = { reseau: { status: () => window.__lanCall('status'), newInvite: () => window.__lanCall('invite'), onEvent: () => {} } }; });
            const page = await desk.newPage();
            page.on('pageerror', e => errors.push('ordinateur : ' + e.message));
            // la fenêtre principale : sa propre séance (le mot de passe de la généalogie est demandé)
            await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'domcontentloaded' });
            await page.waitForLoadState('networkidle').catch(() => {});
            if (await page.locator('[data-glock-screen]').count()) { await page.fill('#glock-pw', PW); await page.click('[data-glock-open]'); await page.waitForLoadState('domcontentloaded'); }
            await page.waitForFunction(() => window.LCNDA_APP && window.LCNDA_EXT, null, { timeout: 60000 });
            await page.addStyleTag({ url: 'assets/css/comptes-famille.css' });
            await page.addScriptTag({ url: 'assets/js/heritage-comptes-famille.js' });
            await page.waitForFunction(() => window.LCNDA_EXT.siteFamilial, null, { timeout: 10000 });
            let inviteUrl = '';
            await t('J1 ordinateur : Réglages → 👪 Site familial → ＋ Inviter quelqu’un → le code de 8 chiffres et le QR code (/famille.php#i=…&inv=…)', async () => {
                await page.evaluate(() => window.LCNDA_EXT.siteFamilial.open('comptes'));
                await page.waitForSelector('[data-cf-new]', { timeout: 30000 });
                assert.ok(await page.locator('.cf-table tbody tr').count() >= 3);
                await page.click('[data-cf-new]');
                await page.fill('dialog.cf-dialog input[name=name]', 'Marie LACOMBE');
                await page.check('dialog.cf-dialog input[name=role][value=proposer]');
                await page.click('dialog.cf-dialog button[type=submit]');
                await page.waitForSelector('dialog.cf-dialog .cf-code', { timeout: 20000 });
                assert.match((await page.textContent('.cf-code')).trim(), /^\d{4} \d{4}$/);
                inviteUrl = (await page.textContent('.cf-url')).trim();
                assert.match(inviteUrl, new RegExp(`^http://192\\.168\\.1\\.20:${gate.port}/famille\\.php#i=[A-Z0-9]+&inv=[a-f0-9]{48}$`));
                assert.equal(await page.locator('.cf-qr svg').count(), 1);
                await page.click('[data-cf-ok]');
            });
            const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
            const ph = await tel.newPage();
            ph.on('pageerror', e => errors.push('téléphone : ' + e.message));
            await t('J2 téléphone (390 px) : le QR code → « Demander l’accès » → accepté → page de la famille → mot de passe choisi → la fiche de Jean', async () => {
                peer = '192.168.1.61';
                await ph.goto(inviteUrl, { waitUntil: 'domcontentloaded' });
                await ph.waitForSelector('#lan-pair form', { timeout: 20000 });
                await ph.click('#lan-pair button[type=submit]');
                let req = null;
                for (let i = 0; i < 50 && !req; i++) { await sleep(100); req = gate.status().requests[0]; }
                assert.ok(req, 'la demande arrive sur l’ordinateur');
                gate.accept(req.id, 'lecture');
                await ph.waitForURL(/\/famille\.php/, { timeout: 20000 });
                await ph.waitForSelector('[data-fam-joinform]', { timeout: 20000 }).catch(async e => { console.error(ph.url(), (await ph.content()).slice(0, 1500), errors); throw e; });
                assert.equal(new URL(ph.url()).hash, '', 'l’invitation est retirée de l’adresse');
                await ph.fill('[data-fam-joinform] input[name=password]', 'Marie-Mot-2026');
                await ph.fill('[data-fam-joinform] input[name=password2]', 'Marie-Mot-2026');
                await ph.click('[data-fam-joinform] button[type=submit]');
                await ph.waitForSelector('.fam-person h1', { timeout: 20000 });
                assert.equal((await ph.textContent('.fam-person h1')).trim(), 'Jean MAZAUD');
                const txt = await ph.textContent('#fam');
                assert.ok(txt.includes('Personne vivante') && !txt.includes('Hélène') && !txt.includes('Paul DURAND'));
                assert.ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de défilement de côté');
            });
            await t('J3 téléphone : ✎ sur « Décès » de Louis → nouvelle date → « Envoyer la proposition » → ↶ proposé ; « Proposer un ajout » → un enfant → « existe peut-être déjà »', async () => {
                await ph.click('a[data-fam-go="3"]');
                await ph.waitForSelector('.fam-person h1:text("Louis MAZAUD")', { timeout: 20000 });
                await ph.click('[data-fam-edit="BURI"]');
                await ph.fill('[data-fam-factform] input[name=date]', '1951');
                await ph.fill('[data-fam-factform] textarea[name=comment]', '<b>vu</b> sur la tombe');
                await ph.click('[data-fam-factform] button[type=submit]');
                await ph.waitForSelector('#fam-toast:not([hidden]) [data-fam-undo]', { timeout: 20000 });
                await ph.click('[data-fam-add]');
                await ph.click('[data-fam-kind="enfant"]');
                await ph.fill('[data-fam-addform] input[name=first_name]', 'Pierre');
                await ph.fill('[data-fam-addform] input[name=birth_date]', '1931');
                await ph.waitForSelector('[data-fam-similar] .fam-warn', { timeout: 10000 });
                assert.match(await ph.textContent('[data-fam-similar]'), /Pierre MAZAUD/);
                assert.ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            });
            await t('J4 ordinateur : 🔔 pastille → 📨 Propositions en attente (texte du cousin échappé) → ✓ Accepter → ↶ Annuler', async () => {
                await page.evaluate(() => window.LCNDA_EXT.siteFamilial.refresh());
                await page.waitForSelector('#fc-bell-open', { timeout: 20000 });
                assert.ok(Number(await page.textContent('#fc-bell-open [data-cf-bell-n]')) >= 1);
                await page.evaluate(() => { window.__xss = 0; });
                await page.click('#fc-bell-open');
                await page.waitForSelector('[data-cf-prop]', { timeout: 20000 });
                const st = await page.evaluate(() => ({ xss: window.__xss || 0, b: document.querySelectorAll('.cf-props b').length, html: document.querySelector('[data-cf-body]').innerHTML }));
                assert.equal(st.xss, 0); assert.ok(st.html.includes('&lt;b&gt;vu&lt;/b&gt;'), 'le petit mot du cousin est montré comme du texte');
                const row = page.locator('[data-cf-prop]', { hasText: 'Inhumation' }).first();
                const id = Number(await row.getAttribute('data-cf-prop'));
                await row.locator('[data-cf-acc-ok]').click();
                await page.waitForFunction(i => !document.querySelector(`[data-cf-prop="${i}"] [data-cf-acc-ok]`), id, { timeout: 20000 });
                await sleep(300);
                assert.equal(sql("SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=3 AND t.gedcom_tag='BURI'")[0]?.date_text, '1951');
                const undo = page.locator('.toast button', { hasText: 'Annuler' }).first();
                await undo.click();
                await sleep(800);
                assert.equal(sql("SELECT count(*) AS n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=3 AND t.gedcom_tag='BURI'")[0].n, 0, '↶ : l’inhumation ajoutée est retirée');
                assert.deepEqual(errors, []);
            });
        } else console.log('— navigateur : Playwright absent, partie J sautée');

        /* ─── K. essais en tout ─── */
        await t('K1 30 essais ratés en tout (tous appareils) → plus aucun essai pour personne pendant 15 min', async () => {
            const devices = [devs.intrus, devs.plain, devs.henri, devs.odile];
            let last = null;
            for (let i = 0; i < 40; i++) { const F = fam(fresh(devices[i % devices.length])); await F.state(); last = await F.post('login', { login: 'nimporte' + i, password: 'x' }); if (last.status === 429 && i >= 20) break; }
            assert.equal(last.status, 429);
            const F = fam(fresh(devs.odile)); const r = await F.login(acc.odile.login, 'Odile-Mot-2026'); assert.equal(r.status, 429);
        });
    } finally {
        if (browser) await browser.close().catch(() => {});
        if (php3) php3.kill();
        await gate.close('main').catch(() => {});
        await server.stop().catch(() => {});
    }
    if (failed) { try { console.error(fs.readFileSync(path.join(tmp, 'logs', 'php.log'), 'utf8').split('\n').filter(l => /LCNDA famille|Fatal|Warning|Uncaught/.test(l)).slice(-15).join('\n')); } catch (_) {} }
    fs.rmSync(tmp, { recursive: true, force: true });
    finish();
})().catch(e => { console.error(e); process.exit(1); });

function finish() {
    if (failed) { console.error(`\n${failed} essai(s) en échec, ${passed} réussi(s)`); process.exit(1); }
    console.log(`\nTous les essais du site familial passent (${passed}).`);
    process.exit(0);
}
