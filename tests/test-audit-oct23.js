'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Audit du 23 octobre (météo, Suivi des animaux) : un essai par faille corrigée.   node tests/test-audit-oct23.js
 *  1. 🌦 import d'un pack par morceaux : rien au-delà de la taille annoncée (le disque ne se remplit pas), taille bornée ;
 *     le fichier final doit être une vraie base SQLite du bon schéma (ouverte en lecture seule) ;
 *  2. 🐾 partage .lcsuivi reçu : clés manquantes acceptées (plus d'erreur « champ obligatoire »), contour d'un site, mesures
 *     en mer et heures GPS abîmés nettoyés (la page du Suivi ne tombait plus) ;
 *  3. ↶ Annuler une réception : le profil créé pendant la fusion repart, les propriétaires de l'animal restent, un lieu
 *     servi depuis reste ;
 *  4. confidentialité : une photo où paraît une personne vivante ne part pas dans le .lcsuivi ;
 *  5. la fiche d'un animal montre les observations où il était « avec » un autre ;
 *  6. lecteurs GPX / KML en un seul passage (un fichier plein de balises jamais fermées ne fige plus le navigateur).
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const S = require('../assets/js/app-suivi-core.js');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); } console.log('\nTout est bon.'); };

(async () => {
    /* ═════ 6. les lecteurs, seuls ═════ */
    await t('GPX et KML : 40 000 balises jamais fermées lues en moins de 2 s ; fichiers normaux toujours lus', async () => {
        let t0 = Date.now();
        assert.throws(() => S.parseGPX('<gpx>' + '<trkpt lat="1" lon="2">'.repeat(40000)), /Aucun point/);
        assert.ok(Date.now() - t0 < 2000, `GPX : ${Date.now() - t0} ms`);
        t0 = Date.now();
        assert.throws(() => S.parseKML('<kml>' + '<Placemark>'.repeat(40000)), /Aucun point/);
        assert.ok(Date.now() - t0 < 2000, `KML : ${Date.now() - t0} ms`);
        const g = S.parseGPX(fs.readFileSync(path.join(__dirname, 'fixtures', 'animaux', 'margot-mars.gpx'), 'utf8'));
        assert.equal(g.points.length, 200);
        assert.equal(S.parseKML(S.toKML([{ name: 'A', points: g.points }])).points.length, 200);
        const pm = S.parseKML('<kml><Placemark><TimeStamp><when>2025-01-01T10:00:00Z</when></TimeStamp><Point><coordinates>2.1,48.2,30</coordinates></Point></Placemark></kml>');
        assert.deepEqual(pm.points, [[1735725600, 48.2, 2.1, 30]]);
        assert.deepEqual(S.parseGPX('<gpx><wpt lat="1" lon="2"/><trkpt lat="3" lon="4"><time>2025-01-01T00:00:00Z</time></trkpt></gpx>').points, [[1735689600, 3, 4, null]]);
    });

    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-audit23-'));
    const dir = path.join(tmp, 'data');
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', LCNDA_METEO_DIR: path.join(tmp, 'vide') };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'media', 'photo.jpg'), Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64'));
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Antoine','LEROY','male','deceased',1),(2,'Léa','VIVANTE','female','living',0)");
$pdo->exec("INSERT INTO media(id,filename,title,media_type) VALUES(1,'photo.jpg','Léa et son chat','image')");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(1,'person',2)");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } })).json();
        const post = async (action, body) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const raw = async (q, buf) => { const r = await fetch(`${base}api.php?action=meteo_pack_chunk&${new URLSearchParams(q)}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': csrf }, body: buf }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
        const w = async (op, body) => { const r = await post('suivi_write', { op, ...body }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.result; };
        const sendPack = async buf => {
            const b = await post('meteo_pack_begin', { size: buf.length }); assert.equal(b.status, 200, JSON.stringify(b.body));
            for (let off = 0; off < buf.length; off += 64 * 1024) assert.equal((await raw({ id: b.body.id, offset: off }, buf.subarray(off, off + 64 * 1024))).status, 200);
            return post('meteo_pack_finish', { id: b.body.id });
        };
        const lcmeteo = body => { const head = Buffer.alloc(4096, 32); Buffer.from('LCMETEO1\n' + JSON.stringify({ kind: 'complet', size: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') })).copy(head); return Buffer.concat([head, body]); };

        /* ═════ 1. 🌦 import de pack par morceaux ═════ */
        await t('pack météo : rien au-delà de la taille annoncée, ni d’un pack de plus de 16 Go', async () => {
            const b = await post('meteo_pack_begin', { size: 5000 }); assert.equal(b.status, 200);
            const r1 = await raw({ id: b.body.id, offset: 0 }, Buffer.alloc(1 << 20, 65));
            assert.equal(r1.status, 200); assert.equal(r1.body.received, 5000, 'le morceau est coupé à la taille annoncée');
            const r2 = await raw({ id: b.body.id, offset: 5000 }, Buffer.alloc(1 << 20, 65));
            assert.equal(r2.status, 422, 'plus rien après la taille annoncée');
            const part = path.join(dir, 'meteo', '.envois', b.body.id + '.part');
            assert.equal(fs.statSync(part).size, 5000);
            assert.equal((await post('meteo_pack_begin', { size: 17 * 1024 ** 3 })).status, 422);
        });
        await t('pack météo : un fichier qui n’est pas une base SQLite du bon schéma est refusé (même avec la bonne empreinte)', async () => {
            const notDb = await sendPack(lcmeteo(Buffer.alloc(20000, 66)));
            assert.equal(notDb.status, 422); assert.match(notDb.body.error, /ne peut pas être lu/);
            const sq = path.join(tmp, 'meta-seule.sqlite');
            const mk = spawnSync(phpPath, ['-r', `$p = new PDO('sqlite:${sq}'); $p->exec("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES('kind','complet'),('format','1')"); echo 'ok';`], { encoding: 'utf8' });
            assert.match(mk.stdout, /ok/);
            const half = await sendPack(lcmeteo(fs.readFileSync(sq)));
            assert.equal(half.status, 422, 'une base sans stations ni relevés n’est pas un pack'); assert.match(half.body.error, /ne peut pas être lu/);
            assert.equal(fs.existsSync(path.join(dir, 'meteo', 'meteo-complet.sqlite')), false, 'rien n’a été rangé');
        });

        /* ═════ 2. 🐾 partage reçu, abîmé ═════ */
        const site = 'bbbbbbbb-0000-4000-8000-000000000001';
        await t('partage reçu : clés manquantes acceptées, contour, mesures en mer et heures GPS abîmés nettoyés', async () => {
            const pkg = { format: 'lcnda-suivi', version: 1, animals: [{ uuid: '11111111-2222-4333-8444-555555555555', name: 'Reçu', species: 'oiseau',
                observations: [{ uuid: 'aaaaaaaa-0000-4000-8000-000000000001', date: '1 mai 2025', lat: 48, lon: 2, site, sea: { surface: { x: [1] }, depth_m: 'abc', camera: 'GoPro', evil: '<b>' } }],
                health: [{ date: '2 mai 2025' }], members: [], gps: [[1700000000, 48, 2], [99999999999999, 48, 2], [-99999999999, 48.1, 2.1]] }],
                sites: [{ uuid: site, name: 'Site reçu', outline: [null, 'x', { a: 1 }, [48, 2], [91, 'y'], [48.1, 2.1], [48, 2.2]], counts: [] }], groups: [], free_observations: [{ date: '3 mai 2025' }] };
            const r = await post('suivi_write', { op: 'share_apply', package: pkg, decisions: {}, media_map: {}, source: 'essai' });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            const ov = await get('suivi', { op: 'overview' });
            assert.deepEqual(ov.sites.find(s => s.name === 'Site reçu').outline, [[48, 2], [48.1, 2.1], [48, 2.2]]);
            assert.deepEqual(ov.observations.find(o => o.date === '1 mai 2025').sea, { camera: 'GoPro' });
            assert.deepEqual(ov.animals.find(a => a.title === 'Reçu').gps, { n: 1, t0: 1700000000, t1: 1700000000 });
        });

        /* ═════ 3. ↶ Annuler une réception ═════ */
        await t('↶ Annuler une réception : profil créé pendant la fusion retiré, propriétaires gardés, lieu servi depuis gardé', async () => {
            const pet = (await post('save_pet', { data: { name: 'Rex', species: 'chien', microchip: '250269604777777', owners: [{ person_id: 1, name: 'Antoine LEROY', role: 'propriétaire' }] } })).body.result.id;
            const pkg = { format: 'lcnda-suivi', version: 1, animals: [{ uuid: '', name: 'Rex le grand', species: 'chien', microchip: '250269604777777', taxon: 'Chien de berger', marks: [], observations: [{ uuid: 'cccccccc-0000-4000-8000-000000000001', date: '5 mai 2025', place: { name: 'Lieu reçu', country: 'France', lat: 45, lon: 3 } }], health: [], members: [], gps: [] }], sites: [], groups: [], free_observations: [] };
            const an = (await post('suivi_write', { op: 'share_analyze', package: pkg })).body.result;
            assert.equal(an.animals[0].status, 'match');
            const ap = await w('share_apply', { package: pkg, decisions: { all: 'theirs' }, media_map: {}, source: 'essai' });
            let d = await get('suivi', { op: 'animal', id: pet });
            assert.equal(d.title, 'Rex le grand'); assert.equal(d.profile.taxon, 'Chien de berger');
            const place = d.observations[0].place_id; assert.ok(place);
            const ev = await post('add_event', { scope: 'person', person_id: 1, event_type_id: 1, date_text: '1900', place_id: place }); // le lieu sert maintenant à un événement
            assert.equal(ev.status, 200, JSON.stringify(ev.body));
            await w('share_undo', { receipt: ap.receipt });
            d = await get('suivi', { op: 'animal', id: pet });
            assert.equal(d.title, 'Rex'); assert.equal(d.profile, null, 'le profil créé par la réception repart');
            assert.equal(d.owners.length, 1, 'les propriétaires restent');
            const pl = await get('meteo_place', { id: place }); assert.equal(pl.name, 'Lieu reçu', 'le lieu servi depuis reste');
        });

        /* ═════ 4. confidentialité ═════ */
        await t('📤 partager : une photo où paraît une personne vivante ne part pas', async () => {
            const pet = (await post('save_pet', { data: { name: 'Photogénique', species: 'chat' } })).body.result.id;
            assert.equal((await post('link_collection_media', { collection_type: 'pet', collection_id: pet, media_id: 1 })).status, 200);
            await w('save_profile', { pet_id: pet, taxon: 'Chat' });
            const sh = await get('suivi', { op: 'share', scope: 'pets', ids: String(pet), photos: '1' });
            assert.equal(sh.animals.length, 1); assert.deepEqual(sh.animals[0].photos, []); assert.deepEqual(sh.media, []);
            assert.doesNotMatch(JSON.stringify(sh), /photo\.jpg|VIVANTE/);
        });

        /* ═════ 5. compagnons ═════ */
        await t('la fiche d’un animal montre les observations où il était avec un autre', async () => {
            const a = await w('create_animal', { name: 'Akela', species: 'sauvage' }), b = await w('create_animal', { name: 'Raksha', species: 'sauvage' });
            await w('save_obs', { pet_id: a.id, date: '3 mars 2025', with: [b.id], note: 'ensemble' });
            await w('save_obs', { pet_id: a.id, date: '4 mars 2025', note: 'seul' });
            const d = await get('suivi', { op: 'animal', id: b.id });
            assert.deepEqual(d.observations.map(o => o.note), ['ensemble']);
        });
        /* ═════ 7. 🌐 Mon site web ═════ */
        await t('site exporté : une page « Lisez-moi » n’écrase pas le mode d’emploi LISEZ-MOI.html du .zip', async () => {
            const sv = await post('save_website', { name: 'Site essai', data: { pages: [{ name: 'Accueil', html: '<p>Bonjour</p>' }, { name: 'Lisez-moi', html: '<p>Ma page</p>' }] } });
            assert.equal(sv.status, 200, JSON.stringify(sv.body));
            const zip = Buffer.from(await (await fetch(`${base}api.php?action=website_export&id=${sv.body.result.id}&format=zip`, { headers: { Cookie: cookie } })).arrayBuffer());
            const z = await require('../assets/js/app-tableur-engine.js').unzip(zip);
            const lower = z.names.map(n => n.toLowerCase());
            assert.equal(new Set(lower).size, lower.length, 'deux fichiers du même nom (sans tenir compte des majuscules) : ' + lower.join(', '));
            assert.ok(z.has('LISEZ-MOI.html'));
        });
    } finally {
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    finish();
})();
