'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧩 Compléter quatre outils existants (maquette validée docs/design/complements-existants.html) :
 *     node tests/test-complements-existants.js      (captures : /tmp/claude-0/sp/compl/*.png ; SHOTS=dossier pour en changer)
 *  1. sans serveur : un réglage par choix de la maquette, l'option conseillée d'abord ; ⏳ délai constaté (moyenne, médiane,
 *     « pas assez de réponses ») ; branche d'un Sosa ; photos du jour rangées par l'heure ; la page du téléphone (aucune requête,
 *     tout échappé, CSP), son .zip et sa somme (les mêmes que le serveur) ;
 *  2. le serveur : migration 98 (idempotente) ; réglages ; A 🏛 notaires et clercs, étude d'un dossier (+ Journal), menu de choix
 *     limité aux études puis les noms tapés, « ✓ Réponse reçue » → recu_le (Registre, Ma semaine, ↶), délai constaté dès 3
 *     réponses, regroupement proposé (nom et ville ; deux études du même nom dans deux villes jamais réunies) appliqué puis ↶,
 *     étude supprimée → le nom reste en texte, ↶ ; B ⚠️ homonyme (toute la base / autres dossiers, années, lieu, fiche
 *     confidentielle par son numéro), « pas la même » retenu + exception du Contrôle, ↶ ; C 📋 doutes lus dans les outils,
 *     « vu » qui revient si la chose change, ↶, CSV noté au registre, consultation sans écriture et vivants masqués ; D 📱 visite
 *     préparée, page emportée (vivants), .zip rapporté (vérifié : somme, chemin, taille, photo, double), rangé (dépouillements,
 *     médias, pièce du dossier), ↶ ; photos du jour ; mode consultation : ni ⤓ ni ⤒ ;
 *  3. le navigateur (Playwright) à 1440, 390 et en sombre : chaque écran s'ouvre, la page du téléphone marche hors ligne et
 *     son fichier se range dans l'app ; un nom piégé n'est jamais exécuté.
 * Tous les noms sont fictifs.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const C = require('../assets/js/heritage-complements-core.js');

const appRoot = path.resolve(__dirname, '..');
const UX = process.env.SHOTS || '/tmp/claude-0/sp/compl';
const XSS = '<img src=x onerror=window.__xss=1>';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const T = Object.fromEntries(C.PAGE_TEXTS.map(k => [k, `[${k}]`]));
T.page_title = 'Visite · {what}'; T.kept = 'gardé {time}'; T.saved = 'fichier {name}';
const zipBuf = files => Buffer.concat(C.zip(files.map(f => ({name: f.name, data: f.data instanceof Uint8Array ? f.data : new TextEncoder().encode(f.data)}))).map(p => Buffer.from(p)));
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

(async () => {
    /* ═════ 1. sans serveur ═════ */
    await t('réglages : un par choix de la maquette, groupés par partie (A B C D), la conseillée d’abord et réglée au départ', () => {
        const want = {etude_where: 'services', delay_stat: 'mean', delay_min: 3, delay_scope: '3y', picker_typed: 'with', notary_pick: 'optional', group_check: 'agree', group_banner: 'show',
            hom_years: 2, hom_place: 'dept', hom_when: 'each', hom_after_ok: 'again', hom_scope: 'base', doutes_name: 'all', doutes_nosource: 'sosa', doutes_seen_back: 'again', doutes_seen_show: 'hide',
            doutes_succ: 'apart', doutes_widget: 'numbers', visite_mode: 'page', visite_living: 'no', visite_photo_px: 2000, visite_found: 'digest', visite_done: 'auto'};
        assert.deepEqual(C.DEFAULTS, want);
        assert.deepEqual(C.SPEC.map(g => g.part), ['A', 'B', 'C', 'D']);
        for (const g of C.SPEC) for (const it of g.items) assert.ok(it.options.length >= 2, it.key);
        const opt = k => C.SPEC.flatMap(g => g.items).find(i => i.key === k).options.map(o => String(o[0]));
        assert.deepEqual(opt('delay_stat'), ['mean', 'median', 'none']); assert.deepEqual(opt('delay_min'), ['3', '5', '1']); assert.deepEqual(opt('hom_years'), ['2', '5', '10']);
        assert.deepEqual(opt('hom_place'), ['dept', 'commune', 'any']); assert.deepEqual(opt('doutes_name'), ['all', 'verify', 'review']); assert.deepEqual(opt('visite_photo_px'), ['2000', '0']);
        assert.equal(C.settings({delay_min: '5', hom_when: 'never', x: 1}).delay_min, 5); assert.equal(C.settings({delay_stat: 'piège'}).delay_stat, 'mean');
        const php = fs.readFileSync(path.join(appRoot, 'lib/complements.php'), 'utf8');
        for (const [k, v] of Object.entries(want)) assert.match(php, new RegExp(`'${k}' => \\[${typeof v === 'number' ? v : `'${v}'`}`), `le serveur a le même réglage ${k}`);
    });
    await t('⏳ délai constaté : moyenne avec le plus court et le plus long, médiane, « pas assez de réponses » sous 3, jamais deviné', () => {
        const rows = [['2026-01-01', '2026-01-12'], ['2026-02-01', '2026-02-28'], ['2026-03-01', '2026-03-15'], ['2026-04-01', '2026-04-19'], ['2026-05-01', '2026-05-21']].map(([a, b]) => ({date_envoi: a, recu_le: b}));
        const now = new Date(2026, 10, 21);
        let d = C.delay(rows, C.DEFAULTS, now); assert.deepEqual([d.n, d.days, d.min, d.max, d.enough], [5, 18, 11, 27, true]);
        d = C.delay(rows, C.settings({delay_stat: 'median'}), now); assert.equal(d.days, 18);
        d = C.delay(rows.slice(0, 2), C.DEFAULTS, now); assert.equal(d.enough, false); assert.equal(d.days, null);
        assert.equal(C.delay([{date_envoi: '2026-01-01', recu_le: ''}, {date_envoi: '2026-01-01'}], C.DEFAULTS, now).n, 0, 'une réponse sans date ne compte pas');
        assert.equal(C.delay([{date_envoi: '2020-01-01', recu_le: '2020-01-05'}], C.settings({delay_min: 1}), now).n, 0, 'seulement les 3 dernières années');
        assert.equal(C.delay([{date_envoi: '2020-01-01', recu_le: '2020-01-05'}], C.settings({delay_min: 1, delay_scope: 'all'}), now).days, 4);
        assert.equal(C.waitLevel(16, 18), ''); assert.equal(C.waitLevel(20, 18), 'yellow'); assert.equal(C.waitLevel(40, 18), 'red'); assert.equal(C.waitLevel(40, null), '');
    });
    await t('Sosa : 2 et ses ancêtres = branche paternelle, 3 et les siens = maternelle', () => {
        assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 13, 16, 31].map(C.branchOf), ['', 'p', 'm', 'p', 'p', 'm', 'm', 'p', 'm', 'p', 'm']);
    });
    await t('⤒ photos du jour : rangées par l’heure, coupées aux plus grands écarts, une part par cote, dans l’ordre des cotes', () => {
        const h = (hh, mm) => new Date(2026, 10, 27, hh, mm).getTime();
        const ph = [{time: h(10, 2)}, {time: h(9, 5)}, {time: h(9, 6)}, {time: h(11, 30)}, {time: h(10, 3)}];
        assert.deepEqual(C.assignPhotos(ph, [7, 8, 9]), {1: 7, 2: 7, 0: 8, 4: 8, 3: 9});
        assert.deepEqual(C.assignPhotos([{time: 1}], [7, 8]), {0: 7}); assert.deepEqual(C.assignPhotos([], [7]), {});
        assert.equal(C.exifTime(new ArrayBuffer(8)), null);
    });
    await t('📱 la page du téléphone : un seul fichier, aucune requête ni bibliothèque extérieure, CSP stricte, textes et données échappés', () => {
        const html = C.visitPageHtml({format: 'lcnda-visite', version: 1, visit: 'a'.repeat(32), checksum: 'b'.repeat(32), center: `AD ${XSS}`, date: '2026-11-27', hours: '9 h–17 h', photos_off: false, photo_px: 2000,
            items: [{id: 4, cote: '2 E 145/7', title: `Naissance de ${XSS}`, place: 'Naves', who: 'Jean MAZAUD', known: ['° 1857 Naves', '</script><script>window.__xss=2</script>'], kind: 'birth'}]}, T);
        assert.ok(!/<img src=x/.test(html), 'nom piégé échappé'); assert.ok(!/<\/script><script>window/.test(html), 'pas de fin de script dans les données');
        assert.match(html, /Content-Security-Policy" content="default-src 'none'; img-src data: blob:/);
        assert.ok(!/(src|href)=["']https?:/i.test(html), 'aucune ressource extérieure'); assert.ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket/.test(html), 'aucune requête');
        assert.match(html, /textContent/); assert.ok(!/innerHTML/.test(C.PAGE_JS), 'jamais innerHTML dans la page'); assert.match(html, /indexedDB\.open/); assert.match(html, /capture','environment'/);
    });
    await t('la somme FNV-1a et le .zip (sans compression, CRC32) de la page : les mêmes que le serveur (PHP)', async () => {
        const s = JSON.stringify([[{id: 4, result: 'found', note: 'Acte n° 14, 2 mars 1857 — témoin « Pierre » / 👶   "x"', photos: ['p1.jpg'], at: ''}], []]);
        assert.equal(C.fnv(''), '811c9dc5'); assert.equal(C.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
        const phpPath = findPhp([devBundledPhp()]);
        if (!phpPath) return;
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compl-zip-'));
        const z = path.join(tmp, 'a.zip'); fs.writeFileSync(z, zipBuf([{name: 'results.json', data: '{"x":1}'}, {name: 'photos/p1.jpg', data: JPG}]));
        const js = path.join(tmp, 's.json'); fs.writeFileSync(js, s);
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; echo vm_fnv(json_encode(json_decode(file_get_contents(${JSON.stringify(js)}), true), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_LINE_TERMINATORS)), '|';
            $zz = new ZipArchive(); $zz->open(${JSON.stringify(z)}); echo $zz->numFiles, '|', $zz->getFromName('results.json'), '|', strlen($zz->getFromName('photos/p1.jpg'));`], {cwd: appRoot, encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: tmp}});
        assert.equal(r.stdout.trim(), `${C.fnv(s)}|2|{"x":1}|${JPG.length}`, r.stderr);
    });

    /* ═════ 2. le serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-compl-'));
    const dir = path.join(tmp, 'data');
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private,is_start) VALUES(?,?,?,?,?,?,?)');
foreach ([[1,'Paul','MAZAUD','male','deceased',0,0],[2,'Jean','MAZAUD','male','living',0,0],[3,'André','MAZAUD','male','deceased',0,0],[4,'Odette','LACOMBE','female','deceased',0,0],[5,'Jean','MAZAUD','male','deceased',0,0],
  [6,'Léonard','MAZAUD','male','deceased',0,0],[7,'Marie','DURAND','female','deceased',0,0],[8,'Louise','LACOMBE','female','deceased',0,0],[9,'Jean-Pierre','MAZAUD','male','living',1,0],[10,'Jean','DURAND','male','deceased',0,0],
  [11,'Marie','LACOMBE','female','deceased',0,0],[12,'<img src=x onerror=window.__xss=1>','MAZAUD','female','living',0,0],[20,'Lucie','MAZAUD','female','living',0,1],[21,'Jeanne','LACOMBE','female','deceased',0,0],[22,'Pierre','MAZAUD','male','deceased',0,0]] as $r) { $ins->execute($r); }
$tag = fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' ORDER BY id LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county) VALUES(1,'Tulle (19)','Corrèze'),(2,'Naves (19)','Corrèze'),(3,'Brest (29)','Finistère'),(4,'Ussel (19)','Corrèze')");
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES(?,?,?,?,?,?,?,?)");
foreach ([[1,'BIRT','1936',1936,null,1],[1,'DEAT','12 mars 2026',2026,'2026-03-12',1],[2,'BIRT','3 avril 1958',1958,'1958-04-03',1],[3,'BIRT','1930',1930,null,1],[3,'DEAT','2010',2010,null,1],[5,'BIRT','1957',1957,null,2],
  [6,'BIRT','1900',1900,null,2],[7,'BIRT','1902',1902,null,2],[9,'BIRT','1958',1958,null,3],[12,'BIRT','1959',1959,null,1],[8,'DEAT','2 janvier 2026',2026,'2026-01-02',4],[10,'DEAT','2024',2024,null,4],[11,'DEAT','2025',2025,null,1],
  [20,'BIRT','1990',1990,null,1],[22,'BIRT','1850',1850,null,2],[21,'BIRT','1843',1843,null,2],[22,'BIRT','1851',1851,null,2]] as [$pp,$tt,$d,$y,$s,$pl]) { $ev->execute(['person',$pp,null,$tag($tt),$d,$y,$s,$pl]); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(100,6,7),(101,3,4),(102,22,21),(103,22,7)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(100,1),(100,3),(101,2),(102,20),(103,6)");
$ev->execute(['family',null,102,$tag('MARR'),'1852',1852,null,2]);
$pdo->exec("INSERT INTO living_contacts(person_id,first_name,last_name,address,postal_code,city,country) VALUES(2,'Jean','MAZAUD','8 rue des Écoles','19000','Tulle','France')");
$pdo->exec("INSERT INTO hypotheses(person_id,type,title,status) VALUES(2,'identity','Jean MAZAUD né à Naves ou à Tulle ?','open')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: ['ignore', 'ignore', 'pipe'] });
    const serverLog = []; proc.stderr.on('data', b => String(b).split('\n').forEach(l => { if (/LCNDA|Fatal|Warning|Notice|Deprecated/.test(l)) serverLog.push(l.slice(0, 400)); }));
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const api = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); const txt = await r.text(); try { return Object.assign(JSON.parse(txt), {_status: r.status}); } catch (_) { return { _raw: txt, _status: r.status, _type: r.headers.get('content-type') }; } };
    const get = (op, q = {}) => api('compl', { op, ...q });
    const post = async (body, action = 'compl_write') => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const w = async (body, action) => { const r = await post(body, action); assert.equal(r.status, 200, `${body.op || action} : ${JSON.stringify(r.body)}`); return r.body.result ?? r.body; };
    const bad = async (body, re, action) => { const r = await post(body, action); assert.ok(r.status >= 400, `${body.op} devait être refusé : ${JSON.stringify(r.body)}`); if (re) assert.match(r.body.error || '', re); return r.body; };
    const upload = async (fields, files) => { const fd = new FormData(); fd.append('csrf', csrf); for (const [k, v] of Object.entries(fields)) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); for (const [k, list] of Object.entries(files)) for (const f of [].concat(list)) fd.append(k, new Blob([f.data]), f.name); const r = await fetch(`${base}api.php?action=compl_write`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code};`], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(`php : ${r.stderr || r.stdout}`); return r; };
    const q = sql => JSON.parse(php(`echo json_encode($pdo->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`).stdout || '[]');
    const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const set = s => w({ op: 'settings_save', settings: s });
    const succ = body => w(body, 'successoral_write');
    let A = 0, B = 0, Cc = 0, D = 0, VIALLE = 0, DURAND = 0, BREST = 0, PIERRE = 0, VISIT = 0;
    try {
        await t('serveur : migration 98 — table des notaires et clercs, colonnes des dossiers, courriers et visites ; relancée sans rien changer', async () => {
            const [v] = q('PRAGMA user_version'); assert.ok(Object.values(v)[0] >= 98);
            const cols = (t2, c) => q(`SELECT count(*) AS n FROM pragma_table_info('${t2}') WHERE name IN (${c.map(x => `'${x}'`).join(',')})`)[0].n;
            assert.equal(cols('archive_service_people', ['service_id', 'name', 'role', 'person_id', 'phone', 'since', 'until', 'deleted_at']), 8);
            assert.equal(cols('succ_cases', ['notary_service_id', 'notary_people_id']), 2); assert.equal(cols('courriers', ['archive_service_id', 'recu_le']), 2);
            assert.equal(cols('archive_visit_plans', ['succ_case_id', 'export_uid', 'export_sum', 'imported_at', 'photos_off', 'import_json']), 6); assert.equal(cols('archive_visit_items', ['person_id', 'act_kind']), 2);
            const before = q("SELECT group_concat(name||sql) AS s FROM (SELECT name, sql FROM sqlite_master ORDER BY name)")[0].s;
            php('compl_schema($pdo); compl_schema($pdo);');
            assert.equal(q("SELECT group_concat(name||sql) AS s FROM (SELECT name, sql FROM sqlite_master ORDER BY name)")[0].s, before, 'idempotente');
            const mg = fs.readFileSync(path.join(appRoot, 'lib/migrations.php'), 'utf8'); assert.ok(Number((mg.match(/const SCHEMA_VERSION = (\d+);/) || [])[1]) >= 98); assert.match(mg, /98 => 'schema_v98'/);
        });
        await t('serveur : réglages — conseillés au départ, chaque option permise, une valeur inconnue ignorée', async () => {
            const s = await get('settings'); assert.deepEqual(s.settings, C.DEFAULTS);
            for (const g of C.SPEC) for (const it of g.items) for (const [v] of it.options) { const r = await set({[it.key]: v}); assert.equal(String(r.settings[it.key]), String(v), `${it.key}=${v}`); }
            const r = await set({delay_min: 99, hom_years: 'abc', inconnu: 1, ...C.DEFAULTS}); assert.deepEqual(r.settings, C.DEFAULTS);
            assert.equal(r.settings.inconnu, undefined);
        });
        await t('A : les dossiers et leurs notaires tapés à la main (fictifs : 2026-014 MAZAUD, 2026-015 LACOMBE, 2024-007, 2025-031)', async () => {
            A = (await succ({ op: 'save', deceased_id: 1, number: '2026-014', notary_text: 'Me VIALLE', notary_ref: '2026/118' })).id;
            B = (await succ({ op: 'save', deceased_id: 8, number: '2026-015', notary_text: 'Me H. Durand' })).id;
            Cc = (await succ({ op: 'save', deceased_id: 10, number: '2024-007', notary_text: 'notaire de Meymac' })).id;
            D = (await succ({ op: 'save', deceased_id: 11, number: '2025-031', notary_text: 'Maître Vialle, Tulle' })).id;
            php(`$pdo->exec("INSERT INTO succ_case_persons(case_id, person_id, role) VALUES(${A}, 2, 'heir'), (${A}, 12, 'heir')");`);
            const svc = async (name, city, extra = {}) => (await w({ name, kind: 'notary', city, ...extra }, 'save_archive_service')).id;
            VIALLE = await svc('Étude VIALLE et associés', 'Tulle', {dept_code: '19', phone: '05 55 00 00 00', email: 'office.vialle@exemple.notaires.fr'});
            DURAND = await svc('Me Hélène DURAND', 'Brive-la-Gaillarde', {dept_code: '19'});
            BREST = await svc('Étude VIALLE', 'Brest', {dept_code: '29'});
            await svc('SCP LACOMBE-BESSE', 'Ussel', {dept_code: '19'});
            PIERRE = (await w({ op: 'etude_person_save', service_id: VIALLE, name: 'Me Pierre VIALLE', role: 'notary', person_id: 0 })).id;
            await w({ op: 'etude_person_save', service_id: VIALLE, name: 'Me Anne VIALLE', role: 'notary' });
            await w({ op: 'etude_person_save', service_id: VIALLE, name: 'M. Bernard DURAND', role: 'clerk', phone: '05 55 00 00 01' });
            await w({ op: 'etude_person_save', service_id: DURAND, name: 'Me Hélène DURAND', role: 'notary' });
            await bad({ op: 'etude_person_save', service_id: VIALLE, name: '' }, /nom/);
            await bad({ op: 'etude_person_save', service_id: VIALLE, name: 'X', since: '2026-13-40' }, /Date/);
            const e = await get('etude', { id: VIALLE });
            assert.deepEqual(e.people.map(p => [p.name, p.role]), [['Me Pierre VIALLE', 'notary'], ['Me Anne VIALLE', 'notary'], ['M. Bernard DURAND', 'clerk']]);
        });
        await t('A1 : un notaire qui part est mis « ancien » (date de fin), retiré puis remis (↶)', async () => {
            const e = await get('etude', { id: VIALLE }); const anne = e.people.find(p => p.name === 'Me Anne VIALLE');
            await w({ op: 'etude_person_save', service_id: VIALLE, id: anne.id, name: anne.name, role: 'notary', until: '2026-06-30' });
            assert.equal((await get('etude', { id: VIALLE })).people.find(p => p.id === anne.id).former, true);
            await w({ op: 'etude_person_delete', id: anne.id }); assert.ok(!(await get('etude', { id: VIALLE })).people.some(p => p.id === anne.id));
            await w({ op: 'etude_person_restore', id: anne.id }); assert.ok((await get('etude', { id: VIALLE })).people.some(p => p.id === anne.id));
        });
        await t('A2 : menu de choix « archive_service » limité aux études, puis « Déjà tapé dans d’autres dossiers » ; l’étude d’un dossier et son notaire, ligne au Journal, ↶', async () => {
            const pk = await api('picker_search', { kind: 'archive_service', q: 'vial', as_kind: 'notary', offset: 0, limit: 30 });
            assert.deepEqual(pk.groups.map(g => g.key), ['etudes', 'typed']);
            assert.deepEqual(pk.groups[0].items.map(i => i.title).sort(), ['Étude VIALLE', 'Étude VIALLE et associés']);
            assert.deepEqual(pk.groups[1].items.map(i => [i.title, i.free]), [['Maître Vialle, Tulle', true], ['Me VIALLE', true]]);
            const plain = await api('picker_search', { kind: 'archive_service', q: 'vial', offset: 0, limit: 30 }); assert.equal(plain.groups.length, 1, 'sans le filtre : comme avant');
            await set({ picker_typed: 'offices' }); assert.equal((await api('picker_search', { kind: 'archive_service', q: 'vial', as_kind: 'notary' })).groups.length, 1); await set({ picker_typed: 'with' });
            const r = await w({ op: 'etude_case_set', case_id: A, service_id: VIALLE, people_id: PIERRE });
            assert.deepEqual(r.prev, { service_id: 0, people_id: 0, text: 'Me VIALLE' });
            const info = await get('etude_case', { case_id: A }); assert.equal(info.etude.id, VIALLE); assert.equal(info.people_id, PIERRE); assert.equal(info.text, 'Me VIALLE', 'le nom tapé reste');
            assert.ok(q(`SELECT text FROM succ_journal WHERE case_id=${A}`).some(j => /🏛 Notaire du dossier : Étude VIALLE et associés \(Me Pierre VIALLE\)/.test(j.text)));
            await bad({ op: 'etude_case_set', case_id: A, service_id: DURAND, people_id: PIERRE }, /pas de cette étude/);
            await bad({ op: 'etude_case_set', case_id: A, service_id: 999999 }, /introuvable/);
            await w({ op: 'etude_case_set', case_id: A, service_id: 0, people_id: 0, text: 'Me VIALLE', undo: 1 }); assert.equal((await get('etude_case', { case_id: A })).etude, null);
            await w({ op: 'etude_case_set', case_id: A, service_id: VIALLE, people_id: PIERRE });
            const sheet = await get('etude', { id: VIALLE }); assert.deepEqual(sheet.cases.map(c => c.number), ['2026-014']); assert.equal(sheet.cases[0].notary, 'Me Pierre VIALLE');
            const idx = await api('successoral', { op: 'index' }).catch(() => null);
            void idx;
        });
        await t('A1 : « ✓ Réponse reçue » note la date (Registre, Ma semaine, ↶) ; le délai constaté seulement à partir de 3 réponses datées', async () => {
            const mk = async (env0, rec) => { const id = (await w({ op: 'etude_courrier_save', service_id: VIALLE, objet: `état des recherches ${env0}`, date_envoi: env0, case_id: A })).id; if (rec) await w({ op: 'courrier_recu', id, recu_le: rec }); return id; };
            await mk(day(-200), day(-189)); await mk(day(-150), day(-123));
            let e = await get('etude', { id: VIALLE }); assert.equal(e.delay.n, 2); assert.equal(e.delay.days, null, 'pas assez de réponses : jamais un chiffre tiré de deux courriers');
            await mk(day(-100), day(-86)); await mk(day(-80), day(-62)); await mk(day(-60), day(-40));
            e = await get('etude', { id: VIALLE }); assert.deepEqual([e.delay.n, e.delay.days, e.delay.min, e.delay.max], [5, 18, 11, 27]);
            await set({ delay_stat: 'median' }); assert.equal((await get('etude', { id: VIALLE })).delay.days, 18); await set({ delay_stat: 'mean' });
            // un courrier en attente : la pastille d'après tes chiffres (jamais une relance automatique)
            const wait = await mk(day(-40), ''); e = await get('etude', { id: VIALLE });
            const k = e.courriers.find(x => x.id === wait); assert.deepEqual(k.waiting, { days: 40, level: 'red' });
            const list = await get('etudes'); const row = list.etudes.find(x => x.id === VIALLE); assert.equal(row.cases_open, 1); assert.equal(row.waiting, 1); assert.equal(row.delay.days, 18);
            // le Registre : statut « Réponse reçue » → recu_le du jour ; une date tapée est gardée ; repassé en attente → effacée
            const reg = (await w({ organisme: 'notaire', destinataire: 'Étude VIALLE', objet: 'test', date_envoi: day(-10), statut: 'en_attente' }, 'save_courrier')).id;
            await w({ id: reg, organisme: 'notaire', destinataire: 'Étude VIALLE', objet: 'test', date_envoi: day(-10), statut: 'reponse_recue' }, 'save_courrier');
            assert.equal(q(`SELECT recu_le FROM courriers WHERE id=${reg}`)[0].recu_le, day(0));
            await w({ id: reg, organisme: 'notaire', destinataire: 'Étude VIALLE', objet: 'test', date_envoi: day(-10), statut: 'reponse_recue', recu_le: day(-3) }, 'save_courrier');
            assert.equal(q(`SELECT recu_le FROM courriers WHERE id=${reg}`)[0].recu_le, day(-3));
            await w({ id: reg, organisme: 'notaire', destinataire: 'Étude VIALLE', objet: 'test', date_envoi: day(-10), statut: 'en_attente' }, 'save_courrier');
            assert.equal(q(`SELECT recu_le FROM courriers WHERE id=${reg}`)[0].recu_le, '');
            // 🗓 Ma semaine : ✓ Réponse reçue, puis ↶
            const m = await w({ op: 'done', key: `courrier:${reg}`, title: 'test' }, 'semaine_mark');
            assert.equal(q(`SELECT recu_le FROM courriers WHERE id=${reg}`)[0].recu_le, day(0));
            await w({ op: 'restore', key: `courrier:${reg}`, prev: m.prev }, 'semaine_mark');
            assert.equal(q(`SELECT recu_le FROM courriers WHERE id=${reg}`)[0].recu_le, '', '↶ : la date repart');
            // un ancien « réponse reçue » sans date ne compte pas (l'app ne devine pas avec updated_at)
            php(`$pdo->exec("INSERT INTO courriers(organisme,destinataire,objet,date_envoi,statut,archive_service_id) VALUES('notaire','x','ancien','${day(-30)}','reponse_recue',${VIALLE})");`);
            assert.equal((await get('etude', { id: VIALLE })).delay.n, 5);
        });
        await t('A3 : regroupement proposé — nom et ville, initiale, « notaire de Meymac » sans proposition, deux VIALLE dans deux villes jamais réunis ; Appliquer puis ↶', async () => {
            const g = await get('etudes_group');
            const flat = Object.fromEntries(g.groups.flatMap(x => x.texts.map(t2 => [t2.text, {to: x.etude.name, checked: t2.checked, why: t2.why.map(y => y.k)}])));
            assert.deepEqual(flat['Maître Vialle, Tulle'], { to: 'Étude VIALLE et associés', checked: true, why: ['name', 'city'] }, 'Tulle, pas Brest');
            assert.equal(flat['Me H. Durand'].to, 'Me Hélène DURAND'); assert.equal(flat['Me H. Durand'].checked, true); assert.ok(flat['Me H. Durand'].why.includes('initial'));
            assert.ok(!flat['Me VIALLE'], 'déjà relié à son étude : plus proposé');
            assert.deepEqual(g.none.flatMap(x => x.texts.map(t2 => t2.text)), ['notaire de Meymac']);
            await set({ group_check: 'none' }); assert.ok((await get('etudes_group')).groups.every(x => x.texts.every(t2 => !t2.checked)), 'toutes décochées (réglage)'); await set({ group_check: 'agree' });
            assert.equal(q(`SELECT notary_service_id FROM succ_cases WHERE id=${D}`)[0].notary_service_id, null, 'rien n’est changé avant « Appliquer »');
            const r = await w({ op: 'etudes_group_apply', links: [{ service_id: VIALLE, case_ids: [D] }, { service_id: DURAND, case_ids: [B] }], create: [{ text: 'notaire de Meymac', case_ids: [Cc] }], courriers: [] });
            assert.deepEqual([r.cases, r.created], [3, 1]);
            assert.deepEqual(q(`SELECT notary_text FROM succ_cases WHERE id IN (${B},${Cc},${D}) ORDER BY id`).map(x => x.notary_text), ['Me H. Durand', 'notaire de Meymac', 'Maître Vialle, Tulle'], 'le nom tapé est gardé');
            assert.equal(q(`SELECT count(*) AS n FROM archive_services WHERE kind='notary' AND name='notaire de Meymac'`)[0].n, 1);
            await w({ op: 'etudes_group_undo' });
            assert.deepEqual(q(`SELECT notary_service_id AS s FROM succ_cases WHERE id IN (${B},${Cc},${D})`).map(x => x.s), [null, null, null]);
            assert.equal(q(`SELECT count(*) AS n FROM archive_services WHERE name='notaire de Meymac'`)[0].n, 0, '↶ : l’étude créée repart');
            await w({ op: 'etudes_group_apply', links: [{ service_id: VIALLE, case_ids: [D] }], create: [], courriers: [] });
        });
        await t('A1 : supprimer une étude — ses dossiers gardent son nom en texte ; ↶ la remet avec ses dossiers et ses courriers', async () => {
            const e0 = await get('etude', { id: VIALLE });
            await w({ id: VIALLE }, 'delete_archive_service');
            assert.deepEqual(q(`SELECT notary_service_id AS s, notary_text AS t FROM succ_cases WHERE id IN (${A},${D}) ORDER BY id`), [{ s: null, t: 'Me VIALLE' }, { s: null, t: 'Maître Vialle, Tulle' }]);
            assert.equal(q(`SELECT count(*) AS n FROM courriers WHERE archive_service_id=${VIALLE}`)[0].n, 0);
            await w({ id: VIALLE }, 'restore_archive_service');
            const e1 = await get('etude', { id: VIALLE });
            assert.deepEqual(e1.cases.map(c => c.number).sort(), ['2025-031', '2026-014']); assert.equal(e1.courriers.length, e0.courriers.length); assert.equal(e1.cases.find(c => c.number === '2026-014').notary, 'Me Pierre VIALLE');
        });
        await t('A : mode consultation — la liste des études se lit, sans dossiers ni courriers ; « Qui a vu quoi » note la fiche qui montre des dossiers', async () => {
            const log = q("SELECT kind, obj_type, what FROM access_log WHERE what='etude'"); assert.ok(log.length >= 1 && log.every(x => x.kind === 'case_open' && x.obj_type === 'service'));
        });
        await t('B : homonyme avant de contacter — même nom et premier prénom, naissance à 2 ans près, même département ; une fiche confidentielle par son numéro', async () => {
            const r = await get('homonym_check', { case_id: A, person_ids: '2', where: 'letter' });
            assert.equal(r.items.length, 1); const it = r.items[0];
            assert.equal(it.person.name, 'Jean MAZAUD'); assert.equal(it.person.parents, 'André MAZAUD × Odette LACOMBE');
            assert.deepEqual(it.others.map(o => [o.id, o.year, o.dy, o.same_dept]), [[5, 1957, 1, true]], 'Naves 1957 ; pas la fiche de Brest (autre département)');
            await set({ hom_place: 'any' });
            const r2 = await get('homonym_check', { case_id: A, person_ids: '2' }); assert.deepEqual(r2.items[0].others.map(o => o.id), [9, 5], 'peu importe le lieu : la fiche confidentielle aussi, la plus proche d’abord (même année)');
            const priv = r2.items[0].others.find(o => o.id === 9); assert.deepEqual([priv.private, priv.name, priv.place, priv.year], [true, '', '', null], 'confidentielle : son numéro seulement');
            await set({ hom_place: 'dept', hom_scope: 'cases' }); assert.equal((await get('homonym_check', { case_id: A, person_ids: '2' })).items.length, 0, 'seulement les autres dossiers : rien');
            await set({ hom_scope: 'base', hom_when: 'never' }); assert.equal((await get('homonym_check', { case_id: A, person_ids: '2' })).items.length, 0); await set({ hom_when: 'each' });
            php(`$pdo->exec("UPDATE events SET year=1953 WHERE person_id=5")`); assert.equal((await get('homonym_check', { case_id: A, person_ids: '2' })).items.length, 0, '5 ans d’écart > 2 ans');
            await set({ hom_years: 5 }); assert.equal((await get('homonym_check', { case_id: A, person_ids: '2' })).items.length, 1); await set({ hom_years: 2 });
            php(`$pdo->exec("UPDATE events SET year=1957 WHERE person_id=5")`);
        });
        await t('B : « ✓ C’est bien lui » au Journal (l’alerte revient, ou plus dans ce dossier) ; « ✕ Pas la même » retenu partout + exception du Contrôle, ↶', async () => {
            await w({ op: 'homonym_ok', case_id: A, person_id: 2, other_id: 5 });
            assert.ok(q(`SELECT text FROM succ_journal WHERE case_id=${A}`).some(j => /Homonyme vu avant le contact \(fiche n° 5\), destinataire confirmé/.test(j.text)));
            assert.equal((await get('homonym_check', { case_id: A, person_ids: '2' })).items.length, 1, 'revient au prochain contact');
            await set({ hom_after_ok: 'case' }); await w({ op: 'homonym_ok', case_id: A, person_id: 2, other_id: 5 }); assert.equal((await get('homonym_check', { case_id: A, person_ids: '2' })).items.length, 0);
            php(`$o = json_decode((string) $pdo->query("SELECT options_json FROM succ_cases WHERE id=${A}")->fetchColumn(), true); unset($o['homonym_ok']); $pdo->prepare('UPDATE succ_cases SET options_json=? WHERE id=?')->execute([json_encode($o ?: new stdClass()), ${A}]);`);
            await set({ hom_after_ok: 'again' });
            const r = await w({ op: 'homonym_no', case_id: A, person_id: 2, other_id: 5 });
            assert.deepEqual([r.a, r.b, r.had, r.dismissed], [2, 5, false, true]);
            assert.equal(q('SELECT count(*) AS n FROM succ_homonym_no WHERE a=2 AND b=5')[0].n, 1); assert.equal(q("SELECT count(*) AS n FROM dismissed_issues WHERE issue_key='dup:2:5'")[0].n, 1);
            assert.equal((await get('homonym_check', { case_id: A, person_ids: '2' })).items.length, 0, 'ne revient plus');
            await w({ op: 'homonym_no_undo', case_id: A, a: 2, b: 5, had: 0, dismissed: 1 });
            assert.equal(q('SELECT count(*) AS n FROM succ_homonym_no WHERE a=2 AND b=5')[0].n, 0); assert.equal(q("SELECT count(*) AS n FROM dismissed_issues WHERE issue_key='dup:2:5'")[0].n, 0);
            await bad({ op: 'homonym_no', case_id: A, person_id: 2, other_id: 2 }, /inconnues/);
        });
        await t('C : tous les doutes lus dans les outils (Contrôle, Hypothèses, Sans source…), branche, gravité ; « vu » qui revient si la chose change ; ↶', async () => {
            php(`$pdo->exec("UPDATE events SET date_text='1925', year=1925 WHERE person_id=22 AND date_text='1851'")`); // un enfant né avant son père : le Contrôle le voit
            let d = await get('doutes');
            const sorts = new Set(d.rows.map(r => r.sort)); assert.ok(sorts.has('hypothese') && sorts.has('source'), [...sorts].join(','));
            const h = d.rows.find(r => r.sort === 'hypothese'); assert.equal(h.level, 'orange'); assert.deepEqual(h.open, { kind: 'hypothese', id: h.open.id });
            const marr = d.rows.find(r => r.sort === 'source' && /Mariage/.test(r.title)); assert.ok(marr, 'le mariage des ancêtres Sosa sans source'); assert.deepEqual(marr.branches, ['p', 'm'], 'Lucie (Sosa 1) : le mariage de ses parents (Sosa 2 et 3) touche les deux branches');
            assert.ok(d.rows.every(r => ['red', 'orange', 'yellow'].includes(r.level)));
            const rank = {red: 0, orange: 1, yellow: 2}; assert.ok(d.rows.every((r, i) => !i || rank[d.rows[i - 1].level] <= rank[r.level]), 'les plus graves d’abord');
            await set({ doutes_nosource: 'none' }); assert.ok(!(await get('doutes')).rows.some(r => r.sort === 'source')); await set({ doutes_nosource: 'sosa' });
            const v = await w({ op: 'doute_vu', key: h.key, fp: h.fp, title: h.title });
            d = await get('doutes'); assert.equal(d.rows.find(r => r.key === h.key).seen, true);
            php(`$pdo->exec("UPDATE hypotheses SET updated_at='2030-01-01 00:00:00' WHERE id=${h.open.id}")`); // la chose change : le vu revient
            d = await get('doutes'); const h2 = d.rows.find(r => r.key === h.key); assert.deepEqual([h2.seen, h2.returned], [false, true]);
            await set({ doutes_seen_back: 'never' }); assert.equal((await get('doutes')).rows.find(r => r.key === h.key).seen, true); await set({ doutes_seen_back: 'again' });
            await w({ op: 'doute_vu_undo', key: h.key, prev: v.prev }); assert.equal((await get('doutes')).rows.find(r => r.key === h.key).seen, false);
            assert.equal(q(`SELECT status FROM hypotheses WHERE id=${h.open.id}`)[0].status, 'open', 'l’outil d’origine n’est pas touché');
            await bad({ op: 'doute_vu', key: '<script>' }, /inconnue/);
            const sum = await get('doutes_summary'); assert.equal(sum.total, sum.counts.red + sum.counts.orange + sum.counts.yellow);
            const csv = await api('compl_export', { op: 'doutes_csv' }); assert.match(csv._type, /text\/csv/); assert.match(csv._raw, /^\uFEFF?"sorte";"gravite"/);
            assert.ok(q("SELECT what FROM access_log WHERE kind='export'").some(x => x.what === 'doutes_csv'), 'export noté dans « Qui a vu quoi »');
            const anc = await get('doutes', { person: 20, anc: 1 }); assert.ok(anc.rows.length >= 1 && anc.rows.every(r => r.people.some(p => [20, 21, 22, 6, 7].includes(p))));
        });
        await t('D1 : préparer une visite (service, date, dossier, cotes cochées) ; ↶ tant qu’elle n’est pas emportée', async () => {
            const ad = (await w({ name: 'Archives départementales de la Corrèze', kind: 'ad', dept_code: '19', city: 'Tulle', opening_hours: '9 h–17 h' }, 'save_archive_service')).id;
            const r = await w({ op: 'visite_prepare', service_id: ad, date: day(6), case_id: A, items: [
                { cote: '2 E 145/7', title: '👶 Naissance · Jean MAZAUD · vers 1958', place: 'Tulle', person_id: 2, kind: 'birth' },
                { cote: '3 E 1204', title: '📜 Contrat de mariage · MAZAUD × LACOMBE', place: 'Tulle', person_id: 3, kind: 'contract' },
                { cote: '1 R 412', title: `🎖 Registre matricule · ${XSS}`, place: 'Tulle', person_id: 12, kind: 'military' }] });
            assert.equal(r.items, 3); VISIT = r.id;
            const v = await get('visite', { id: VISIT }); assert.equal(v.plan.center, 'Archives départementales de la Corrèze'); assert.equal(v.plan.case_id, A); assert.deepEqual(v.items.map(i => i.kind), ['birth', 'contract', 'military']);
            assert.equal(q(`SELECT opening_hours FROM archive_visit_plans WHERE id=${VISIT}`)[0].opening_hours, '9 h–17 h', 'horaires lus dans la fiche du service');
            const u = await w({ op: 'visite_prepare', service_id: ad, items: [{ cote: 'X', title: 'x' }] }); await w({ op: 'visite_prepare_undo', id: u.id });
            assert.equal(q(`SELECT count(*) AS n FROM archive_visit_plans WHERE id=${u.id}`)[0].n, 0);
            await bad({ op: 'visite_prepare', service_id: ad, items: [] }, /Coche/);
        });
        let page = null;
        await t('D2 : emporter — un identifiant et une somme ; les vivants deviennent « Personne vivante » (sauf case cochée), les confidentielles jamais ; noté au registre', async () => {
            page = await w({ op: 'visite_render', id: VISIT });
            assert.match(page.data.visit, /^[a-f0-9]{32}$/); assert.match(page.data.checksum, /^[a-f0-9]{32}$/); assert.equal(page.data.photo_px, 2000);
            const by = Object.fromEntries(page.data.items.map(i => [i.cote, i]));
            assert.equal(by['2 E 145/7'].who, 'Personne vivante'); assert.equal(by['2 E 145/7'].title, 'Personne vivante'); assert.deepEqual(by['2 E 145/7'].known, []);
            assert.equal(by['3 E 1204'].who, 'André MAZAUD'); assert.ok(by['3 E 1204'].known.some(k => /Parents : Léonard MAZAUD × Marie DURAND/.test(k)));
            const p2 = await w({ op: 'visite_render', id: VISIT, living: 1 }); assert.equal(p2.data.visit, page.data.visit, 'le même identifiant tant que rien n’est rapporté');
            assert.equal(p2.data.items.find(i => i.cote === '2 E 145/7').who, 'Jean MAZAUD');
            page = await w({ op: 'visite_render', id: VISIT });
            assert.ok(q("SELECT kind, obj_type, what FROM access_log WHERE what='visite_mobile'").every(x => x.kind === 'export' && x.obj_type === 'case'), 'visite reliée à un dossier : notée sur le dossier');
        });
        const results = (items, extra = [], over = {}) => { const o = { format: 'lcnda-visite', version: 1, visit: page.data.visit, checksum: page.data.checksum, saved_at: new Date().toISOString(), items, extra, ...over }; if (!('sum' in over)) o.sum = C.fnv(JSON.stringify([items, extra])); return JSON.stringify(o); };
        const ids = () => Object.fromEntries(page.data.items.map(i => [i.cote, i.id]));
        await t('D3 : le .zip rapporté est lu strictement — somme, chemin qui sort, nom inattendu, photo qui n’en est pas une, autre visite, trop gros', async () => {
            const I = ids();
            const ok = [{ id: I['2 E 145/7'], result: 'found', note: 'Acte n° 14, 2 mars 1958, témoin Pierre LACOMBE', photos: ['p1.jpg', 'p2.jpg'], at: '' }];
            const tries = [
                [[{ name: 'results.json', data: results(ok, [], { sum: '00000000' }) }, { name: 'photos/p1.jpg', data: JPG }, { name: 'photos/p2.jpg', data: JPG }], /modifié/],
                [[{ name: 'results.json', data: results(ok) }, { name: '../evil.jpg', data: JPG }], /chemin/],
                [[{ name: 'results.json', data: results(ok) }, { name: 'photos/p1.php', data: '<?php echo 1;' }], /inattendues/],
                [[{ name: 'results.json', data: results(ok) }, { name: 'photos/p1.jpg', data: 'pas une image' }, { name: 'photos/p2.jpg', data: JPG }], /pas une image/],
                [[{ name: 'results.json', data: results(ok, [], { visit: 'c'.repeat(32), sum: undefined }) }, { name: 'photos/p1.jpg', data: JPG }, { name: 'photos/p2.jpg', data: JPG }], /pas dans cette généalogie/],
                [[{ name: 'results.json', data: results([{ ...ok[0], photos: ['p9.jpg'] }]) }], /manque/],
                [[{ name: 'results.json', data: results([{ ...ok[0], evil: 1 }]) }], /inattendues/],
                [[{ name: 'results.json', data: '{"format":"lcnda-visite"' }], /illisible/],
            ];
            for (const [files, re] of tries) { const r = await upload({ op: 'visite_analyze' }, { file: { name: 'v.zip', data: zipBuf(files) } }); assert.ok(r.status >= 400, JSON.stringify(r.body)); assert.match(r.body.error || '', re); }
            const r = await upload({ op: 'visite_analyze' }, { file: { name: 'v.zip', data: Buffer.from('pas un zip du tout') } }); assert.match(r.body.error, /zip/);
            assert.equal(q('SELECT count(*) AS n FROM media')[0].n, 0, 'rien n’est écrit');
        });
        await t('D3 : revue cote par cote puis rangement — dépouillements, médias reliés, pièce du dossier reçue, cote ajoutée sur place décochée, visite « faite » ; double refusé ; ↶ défait tout', async () => {
            const I = ids();
            php(`$pdo->exec("DELETE FROM archive_visit_items WHERE id=${I['1 R 412']}")`); // cote retirée depuis sur l'ordinateur
            const items = [{ id: I['2 E 145/7'], result: 'found', note: 'Acte n° 14, 2 mars 1958, témoin Pierre LACOMBE', photos: ['p1.jpg', 'p2.jpg'], at: '' }, { id: I['3 E 1204'], result: 'none', note: 'Vu 1890–1894, pas de contrat.', photos: [], at: '' },
                { id: I['1 R 412'], result: 'partial', note: '', photos: ['p3.jpg'], at: '' }];
            const extra = [{ cote: '2 E 145/8', title: `Décès Léonard MAZAUD 1871 ? ${XSS}`, note: '', result: 'found', photos: [], at: '' }];
            const zipData = zipBuf([{ name: 'results.json', data: results(items, extra) }, ...['p1', 'p2', 'p3'].map(n => ({ name: `photos/${n}.jpg`, data: JPG }))]);
            const an = await upload({ op: 'visite_analyze' }, { file: { name: 'v.zip', data: zipData } });
            assert.equal(an.status, 200, JSON.stringify(an.body)); const rows = an.body.result.rows;
            assert.deepEqual(rows.map(r => [r.cote, r.kind, r.checked, r.removed, r.piece]), [['2 E 145/7', 'item', true, false, true], ['3 E 1204', 'item', true, false, false], ['', 'item', false, true, false], ['2 E 145/8', 'extra', false, false, false]]);
            const choices = rows.map(r => ({ key: r.key, on: r.checked || r.kind === 'extra' }));
            const im = await upload({ op: 'visite_import', choices }, { file: { name: 'v.zip', data: zipData } });
            assert.equal(im.status, 200, JSON.stringify(im.body)); const res = im.body.result;
            assert.deepEqual([res.digests, res.media, res.pieces, res.cotes, res.done], [3, 2, 1, 3, true]);
            assert.equal(q("SELECT state FROM succ_pieces WHERE piece_key='N:2'")[0].state, 'have');
            assert.equal(q('SELECT count(*) AS n FROM media_links WHERE entity_type=\'person\' AND entity_id=2')[0].n, 2, 'photos reliées à Jean MAZAUD');
            assert.equal(q(`SELECT done_at FROM archive_visit_plans WHERE id=${VISIT}`)[0].done_at !== '', true);
            const files = fs.readdirSync(path.join(dir, 'media')); assert.equal(files.length, 2); assert.ok(files.every(f => /^[a-f0-9]{32}\.jpg$/.test(f)), 'noms tirés au hasard');
            assert.equal(q("SELECT count(*) AS n FROM events WHERE person_id=2")[0].n, 1, 'aucune date ni aucun lieu écrit sur une fiche');
            const again = await upload({ op: 'visite_analyze' }, { file: { name: 'v.zip', data: zipData } }); assert.match(again.body.error, /déjà été rangé/);
            await w({ op: 'visite_import_undo', id: VISIT });
            assert.equal(q('SELECT count(*) AS n FROM media')[0].n, 0); assert.equal(fs.readdirSync(path.join(dir, 'media')).length, 0, 'les fichiers aussi');
            assert.equal(q("SELECT count(*) AS n FROM succ_pieces WHERE piece_key='N:2' AND state='have'")[0].n, 0); assert.equal(q(`SELECT done_at FROM archive_visit_plans WHERE id=${VISIT}`)[0].done_at, '');
            assert.equal(q(`SELECT count(*) AS n FROM archive_visit_items WHERE visit_id=${VISIT}`)[0].n, 2, 'la cote ajoutée sur place repart');
            assert.equal(q('SELECT count(*) AS n FROM archive_digest_entries')[0].n, 0, 'les dépouillements créés repartent');
            assert.equal((await upload({ op: 'visite_analyze' }, { file: { name: 'v.zip', data: zipData } })).status, 200, 'après ↶, le fichier se range de nouveau');
            assert.ok(q("SELECT what FROM access_log").some(x => x.what === 'visite_import'));
        });
        await t('D-1 option 2 : ⤒ photos du jour rangées à la cote choisie (« à trier »), une image fausse refusée, ↶', async () => {
            const I = ids();
            const r = await upload({ op: 'visite_photos', id: VISIT, map: { 0: I['2 E 145/7'], 1: I['3 E 1204'], 2: 0 } }, { 'photos[]': [{ name: 'a.jpg', data: JPG }, { name: 'b.jpg', data: JPG }, { name: 'c.jpg', data: JPG }] });
            assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.result.media, 2);
            assert.deepEqual(q('SELECT description FROM media').map(x => x.description), ['à trier', 'à trier']);
            const no = await upload({ op: 'visite_photos', id: VISIT, map: { 0: I['2 E 145/7'] } }, { 'photos[]': [{ name: 'x.jpg', data: Buffer.from('GIF89a…') }] }); assert.match(no.body.error, /pas une image/);
            await w({ op: 'visite_photos_undo', id: VISIT }); assert.equal(q('SELECT count(*) AS n FROM media')[0].n, 0);
        });
        await t('consultation : pas d’export ni d’import ni de « vu » ; la liste des doutes se lit, les vivants y sont « Personne vivante » ; le successoral caché', async () => {
            php(`$pdo->exec("INSERT INTO hypotheses(person_id,type,title,status) VALUES(12,'identity','Hélène est-elle la fille de ${XSS} ?','open')")`);
            assert.equal((await post({ password: 'secret1' }, 'kiosk_enter')).status, 200);
            try {
                await bad({ op: 'visite_render', id: VISIT }, /consultation/); await bad({ op: 'doute_vu', key: 'hypothese:1', fp: 'x' }, /consultation/);
                const csv = await api('compl_export', { op: 'doutes_csv' }); assert.equal(csv._status, 423);
                const d = await get('doutes'); assert.equal(d.kiosk, true); assert.ok(d.rows.some(r => r.masked && r.title === 'Personne vivante'));
                assert.ok(!JSON.stringify(d).includes('<img src=x'));
                assert.equal((await get('homonym_check', { case_id: A, person_ids: '2' }))._status, 403);
                const e = await get('etudes'); assert.ok(e.etudes.length >= 3 && e.etudes.every(x => x.cases_open === undefined && x.courriers === undefined)); assert.deepEqual(e.typed, []);
                const s = await get('etude', { id: VIALLE }); assert.equal(s.cases, undefined); assert.equal(s.courriers, undefined);
            } finally { await post({ password: 'secret1' }, 'kiosk_exit'); }
        });

        /* ═════ 3. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        const browser = await chromium.launch();
        fs.mkdirSync(UX, { recursive: true });
        const open = async (w0, h0, dark, hash = '#listes') => {
            await post({ set: { 'genealogie-usage': JSON.stringify({ usages: ['genealogie', 'successoral'], start: 'last' }), 'genealogie-menu-hidden': '[]', 'genealogie-menu-successoral': '1', ...(dark ? { 'genealogie-design': JSON.stringify({ preset: 'dark' }) } : {}) }, remove: [...(dark ? [] : ['genealogie-design'])] }, 'save_settings');
            const ctx = await browser.newContext({ viewport: { width: w0, height: h0 }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
            await ctx.addInitScript(([dk]) => { try { if (!sessionStorage.getItem('t-init')) { sessionStorage.setItem('t-init', '1'); if (dk) localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); localStorage.setItem('genealogie-usage', JSON.stringify({usages: ['genealogie', 'successoral'], start: 'last'})); localStorage.setItem('genealogie-menu-successoral', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); localStorage.setItem('lcnda-succ-view', '"cases"'); } } catch (_) {} }, [dark]);
            const pg = await ctx.newPage(); const errs = [];
            pg.on('pageerror', e => errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|tile\.openstreetmap|ERR_|net::/.test(m.text())) errs.push('console ' + m.text()); });
            await pg.goto(base + hash); await pg.waitForFunction(() => window.LCNDA_EXT?.complEtudes && window.LCNDA_EXT?.doutes && window.LCNDA_EXT?.successoral?.openCase && window.LCNDA_APP?.setModule, null, { timeout: 30000 });
            return { ctx, pg, errs };
        };
        const noSide = async pg => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'pas de défilement de côté');
        const shot = async (pg, name) => { await pg.waitForTimeout(400); return pg.screenshot({ path: path.join(UX, `${name}.png`) }); };
        const closeAll = pg => pg.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        for (const [w0, h0, dark, tag] of [[1440, 900, false, '1440'], [390, 844, false, '390'], [390, 844, true, '390-sombre']]) {
            const { ctx, pg, errs } = await open(w0, h0, dark);
            await t(`navigateur ${tag} : 🏛 la liste des études (bandeau des noms tapés, délai « 18 j »), la fiche (notaires, dossiers, courriers, délai constaté)`, async () => {
                await pg.evaluate(() => window.LCNDA_EXT.complEtudes.open());
                await pg.waitForSelector('.compl-et [data-ce-row]', { timeout: 15000 });
                const txt = await pg.textContent('.compl-et');
                assert.match(txt, /Étude VIALLE et associés/); assert.match(txt, /18 j/); assert.match(txt, /notaires? tapés? à la main/);
                await noSide(pg); await shot(pg, `A1-liste-${tag}`);
                await pg.click(`[data-ce-open="${VIALLE}"] >> nth=0`);
                await pg.waitForSelector('.compl-ce-sheet .compl-ce-cour', { timeout: 15000 });
                const s = await pg.textContent('.compl-ce-sheet'); assert.match(s, /Me Pierre VIALLE/); assert.match(s, /2026-014/); assert.match(s, /Délai de réponse constaté : 18 j/); assert.match(s, /ni un délai légal/);
                await noSide(pg); await shot(pg, `A1-fiche-${tag}`);
            });
            await t(`navigateur ${tag} : 🧩 regrouper les notaires tapés (propositions, « Appliquer à … »)`, async () => {
                await pg.evaluate(() => window.LCNDA_EXT.complEtudes.group()); await pg.waitForSelector('dialog[open] .compl-ce-g', { timeout: 15000 });
                const txt = await pg.textContent('dialog[open]'); assert.match(txt, /Me H\. Durand/); assert.match(txt, /notaire de Meymac/); assert.match(txt, /Appliquer à \d+ noms/);
                await shot(pg, `A3-regrouper-${tag}`); await closeAll(pg);
            });
            await t(`navigateur ${tag} : 📁 Dossier → « Étude de notaire » (menu de choix limité aux études) ; ⚠️ bandeau dans ✉️ Écrire`, async () => {
                await pg.evaluate(id => window.LCNDA_EXT.successoral.openCase(id, 'dossier'), A);
                await pg.waitForSelector('.compl-ce-case .pk', { timeout: 20000 });
                assert.match(await pg.textContent('.compl-ce-case'), /Étude VIALLE et associés/);
                await shot(pg, `A2-dossier-${tag}`);
                // le même menu de choix, vide (comme dans « ＋ Ouvrir un dossier ») : les études, puis les noms déjà tapés
                await pg.evaluate(() => window.LCNDA_EXT.openDialog({eyebrow: 'TEST', title: 'Étude', body: `<div class="succ-box compl-ce-case">${window.LCNDA_PICKER.pickerField({name: 'x', kind: 'archive_service', allowFree: true, allowCreate: true, filter: {as_kind: 'notary'}, value: null})}</div>`, onSubmit: () => true}));
                const field = pg.locator('dialog[open] .pk input.pk-input');
                await field.click(); await field.fill('dur'); await pg.waitForSelector('dialog[open] .pk-list:not([hidden]) .pk-grp', { timeout: 10000 });
                const list = await pg.textContent('dialog[open] .pk-list'); assert.match(list, /Études de notaire/); assert.match(list, /Me Hélène DURAND/); assert.match(list, /Déjà tapé dans d’autres dossiers/); assert.match(list, /Me H\. Durand/);
                await shot(pg, `A2-menu-${tag}`); await pg.keyboard.press('Escape'); await closeAll(pg);
                // ✉️ Écrire à Jean MAZAUD : le bandeau, « 👁 Voir l'autre »
                await pg.evaluate(async id => { const D = await window.LCNDA_APP.api('successoral', {op: 'get', id}); const host = document.createElement('div'); const dlg = window.LCNDA_EXT.openDialog({eyebrow: 'TEST', title: 'Écrire', body: '<p>Lettre</p>', onSubmit: () => true}); window.LCNDA_EXT.succHomonym.attach(dlg, D, {where: 'letter', ids: () => [2]}); void host; }, A);
                await pg.waitForSelector('dialog[open] .compl-hom-one', { timeout: 15000 });
                assert.match(await pg.textContent('dialog[open] .compl-hom'), /Une autre fiche porte le même nom/);
                await pg.click('dialog[open] [data-compl-hom-see]'); await pg.waitForSelector('dialog[open] .compl-hom-cmp table');
                assert.match(await pg.textContent('dialog[open] .compl-hom-cmp'), /André MAZAUD × Odette LACOMBE/);
                await shot(pg, `B1-courrier-${tag}`);
                // en série : un seul résumé en tête
                await closeAll(pg);
                await pg.evaluate(async id => { const D = await window.LCNDA_APP.api('successoral', {op: 'get', id}); const dlg = window.LCNDA_EXT.openDialog({eyebrow: 'TEST', title: 'En série', body: '<p>…</p>', onSubmit: () => true}); window.LCNDA_EXT.succHomonym.attach(dlg, D, {where: 'serial', ids: () => [2, 12]}); }, A);
                await pg.waitForSelector('dialog[open] .compl-hom-sum', { timeout: 15000 }); assert.match(await pg.textContent('dialog[open] .compl-hom-sum'), /1 héritiers? sur 2/);
                await shot(pg, `B1-serie-${tag}`); await closeAll(pg);
                assert.equal(await pg.evaluate(() => window.__xss), undefined, 'nom piégé jamais exécuté');
            });
            await t(`navigateur ${tag} : 📋 tous les doutes (pastilles, barre H10, ↗, ⋯, 👁 Marquer vu + ↶), widget`, async () => {
                await pg.evaluate(() => window.LCNDA_EXT.doutes.open());
                await pg.waitForSelector('.compl-dt [data-dt-key]', { timeout: 20000 });
                const txt = await pg.textContent('.compl-dt'); assert.match(txt, /Tous les doutes/); assert.match(txt, /Hypothèse ouverte/);
                await noSide(pg); await shot(pg, `C1-liste-${tag}`);
                const key = await pg.getAttribute('.compl-dt [data-dt-key] >> nth=0', 'data-dt-key');
                await pg.click('.compl-dt [data-dt-key] >> nth=0 >> .ui-row-name', { button: 'right' }); // clic droit : le menu ⋯ de la ligne
                await pg.waitForSelector('.compl-dt [data-dt-key] >> nth=0 >> details.compl-dt-more[open]');
                await shot(pg, `C1-menu-${tag}`);
                await pg.click('.compl-dt [data-dt-key] >> nth=0 >> [data-dt-seen]');
                await pg.waitForFunction(k => !document.querySelector(`.compl-dt [data-dt-key="${CSS.escape(k)}"]`), key, { timeout: 8000 });
                await shot(pg, `C1-vu-${tag}`);
                await pg.click('.toast button:has-text("Annuler"), .undo-toast button:has-text("Annuler")').catch(() => {});
                await pg.waitForTimeout(600);
                const w2 = await pg.evaluate(async () => { const W = window.LCNDA_EXT.dashboard.doutes_widget; const data = await W.load(); return W.render(0, {}, '4', data); });
                assert.match(w2, /impossibles/); assert.match(w2, /Tout voir/);
            });
            await t(`navigateur ${tag} : 🗄 préparer depuis « Que manque-t-il ? » ; 📱 emporter (la page) ; la page marche hors ligne ; ⤒ rapporter`, async () => {
                await pg.evaluate(() => { window.LCNDA_APP.state.researchKind = 'gaps'; return window.LCNDA_APP.setModule('recherche'); });
                await pg.waitForSelector('[data-gap-visit]', { timeout: 20000 }).catch(() => {});
                if (await pg.locator('[data-gap-visit]').count()) { await pg.click('[data-gap-visit] >> nth=0'); await pg.waitForSelector('dialog[open] .compl-vp-items', { timeout: 15000 }); await shot(pg, `D1-preparer-${tag}`); await closeAll(pg); }
                await pg.evaluate(() => { window.LCNDA_APP.state.listType = 'archive_visits'; return window.LCNDA_APP.setModule('listes'); });
                await pg.waitForSelector(`[data-vm-export="${VISIT}"]`, { timeout: 20000 });
                await shot(pg, `D1-planificateur-${tag}`);
                await pg.click(`[data-vm-export="${VISIT}"] >> nth=0`); await pg.waitForSelector('dialog[open] .compl-vm-what');
                await shot(pg, `D2-emporter-${tag}`);
                const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('dialog[open] .modal-actions [type=submit]')]);
                const file = path.join(tmp, `page-${tag}.html`); await dl.saveAs(file);
                const htmlPage = fs.readFileSync(file, 'utf8'); assert.match(htmlPage, /Content-Security-Policy/); assert.ok(!htmlPage.includes('<img src=x'));
                // la page, ouverte seule (file://, sans réseau) sur un téléphone
                const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true, offline: true });
                const pp = await phone.newPage(); const perr = []; const reqs = [];
                pp.on('pageerror', e => perr.push(e.message)); pp.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) reqs.push(r.url()); });
                await pp.goto('file://' + file); await pp.waitForSelector('.vm-c');
                await pp.click('.vm-c >> nth=0 >> .vm-res button >> nth=0');
                await pp.fill('.vm-c >> nth=0 >> textarea', 'Acte n° 14, 2 mars 1958');
                const inp = pp.locator('.vm-c >> nth=0 >> input[type=file]'); if (await inp.count()) await inp.setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: JPG });
                await pp.waitForTimeout(600); await pp.click('#vm-add'); await pp.fill('.vm-c >> nth=-1 >> input >> nth=0', '2 E 145/8');
                await pp.screenshot({ path: path.join(UX, `D2-page-telephone-${tag}.png`), fullPage: false });
                const [zdl] = await Promise.all([pp.waitForEvent('download'), pp.click('#vm-save')]);
                const zf = path.join(tmp, `res-${tag}.zip`); await zdl.saveAs(zf);
                assert.deepEqual(perr, []); assert.deepEqual(reqs, [], 'la page n’envoie rien et ne charge rien');
                await phone.close();
                // ⤒ rapporter dans l'app (K13)
                await pg.click(`[data-vm-import="${VISIT}"] >> nth=0`);
                await pg.setInputFiles('dialog[open] input[type=file]', zf);
                await pg.waitForSelector('dialog[open] .compl-vm-rev', { timeout: 15000 });
                assert.match(await pg.textContent('dialog[open] .compl-vm-rev'), /dépouillement du Journal/);
                await shot(pg, `D3-rapporter-${tag}`);
                await pg.click('dialog[open] [data-k-go]'); await pg.waitForFunction(() => !document.querySelector('dialog.k-import[open]'), null, { timeout: 15000 });
                assert.equal(q(`SELECT count(*) AS n FROM archive_visit_items WHERE visit_id=${VISIT} AND result='found'`)[0].n >= 1, true);
                await w({ op: 'visite_import_undo', id: VISIT });
                await noSide(pg);
            });
            await t(`navigateur ${tag} : ⚙️ réglages de chaque partie ; aucune erreur JavaScript`, async () => {
                for (const part of ['A', 'B', 'C', 'D']) { await pg.evaluate(p => window.LCNDA_EXT.compl.openSettings(p), part); await pg.waitForSelector('dialog[open] .compl-set'); if (part === 'B') await shot(pg, `reglages-${tag}`); assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('dialog[open] .modal-actions button')].filter(b => b.offsetWidth).map(b => b.textContent.trim())), ['Fermer']); await closeAll(pg); }
                assert.deepEqual(errs, []);
            });
            await ctx.close();
        }
        await browser.close();
    } finally {
        if (failed && serverLog.length) console.log('— journal du serveur :\n' + serverLog.slice(-30).join('\n'));
        proc.kill();
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    }
    finish();
})();
function finish() { console.log(failed ? `✗ ${failed} essai(s) en échec` : '✓ compléter l’existant : tout est bon'); process.exit(failed ? 1 : 0); }
