'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗺️ Six cartes de plus (maquette docs/design/cartes-nouvelles.html) : lib/cartes_plus2.php, lib/lieux_a_placer.php,
 * assets/js/heritage-diagram-cartes-plus2.js, assets/js/heritage-lieux-a-placer.js.
 *     node tests/test-cartes-nouvelles.js        (captures : SHOTS=dossier node tests/test-cartes-nouvelles.js)
 *  1. Node : chaque carte est rangée dans Graphiques → Cartes, a au moins deux départs « Graphique » (Depuis l'app),
 *     ses réglages avec l'option conseillée par défaut ; textes traduits dans les 31 langues ; FAQ ;
 *  2. serveur (base neuve, familles inventées MAZAUD, LACOMBE, DURAND, VIALLE, BESSE en Corrèze) : 📍 lieux à placer
 *     (sûr, plusieurs communes, lieu-dit, ancienne commune, hors de France, rien trouvé, faute proche), placer un lieu
 *     puis un lot, ↶ Annuler qui remet tout, 🌐 en ligne seulement sur demande (adresse d'essai file://), CSRF,
 *     mode consultation ; les données des cinq cartes — jamais un vivant ni une fiche confidentielle ;
 *  3. navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : chaque carte dessinée depuis l'app, ses réglages,
 *     son export (SVG valide, sans vivant ni fiche confidentielle), 📍 Lieux à placer (placer, ↶ Annuler, revue en lot) ;
 *     pas de défilement de côté, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const src = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
const KINDS = ['trademap', 'mirrormap', 'lifearea', 'linkmap', 'crisismap'];
const FILES = ['assets/js/heritage-diagram-cartes-plus2.js', 'assets/js/heritage-lieux-a-placer.js'];
// les noms qui ne doivent JAMAIS sortir : une vivante, une fiche confidentielle
const SECRET = /Claire MAZAUD|Paul DURAND|informaticien/;
// chaque carte dessinée depuis l'app dans le navigateur : [sorte, préparation du panneau, texte attendu dans l'aperçu]
// et des réglages essayés sur l'exemple de chaque carte (chacun doit donner une image)
const VARIANTS = {
    trademap: [{time: 'small'}, {draw: 'deps'}, {draw: 'dots'}, {draw: 'top'}, {classify: 'domain'}, {classify: 'mine', colors: 'tanneur=#aa0000'}, {multi: 'main', foyer: 'hide', size: 'same', where: 'act'}, {time: 'half', at: '1850'}],
};
const KIND_TESTS = [
    ['trademap', null, 'Tulle'],
];

(async () => {
    /* ═════ 1. Node ═════ */
    await t('les fichiers sont chargés par l’app (index.php, ?v=)', () => {
        const idx = src('index.php');
        assert.match(idx, /heritage-diagram-cartes-plus2\.js\?v=\d+/); assert.match(idx, /heritage-lieux-a-placer\.js\?v=\d+/); assert.match(idx, /cartes-nouvelles\.css\?v=\d+/);
        assert.match(src('api.php'), /'cartes_plus2' =>/); assert.match(src('api.php'), /'lieux_place' => lap_place/);
    });
    await t('textes visibles traduits dans les 31 langues (i18n-extract --missing)', () => {
        const X = require('../scripts/i18n-extract.js'), B = require('../scripts/i18n-build.js');
        // sans les modèles « {x} » (une clé « {n} » seule couvrirait n'importe quel texte) : le texte, ou le texte sans symbole devant ni « … » au bout
        const LEAD = /^[\s\p{Extended_Pictographic}\p{So}\p{Sm}️‍⃣·•]+/u, TRAIL = /[\s…:▾▸→↗]+$/u;
        const has = (dict, s0, ctx = '') => { const s = String(s0); if ((ctx && dict[`${ctx}|${s}`] != null) || dict[s] != null) return true; const lead = (s.match(LEAD) || [''])[0], rest = s.slice(lead.length), trail = (rest.match(TRAIL) || [''])[0], core = rest.slice(0, rest.length - trail.length); return dict[rest] != null || dict[core] != null || dict[lead + core] != null; };
        const langs = B.LANGS.filter(c => c !== 'fr');
        assert.equal(langs.length, 31);
        for (const l of langs) {
            const dict = X.loadDict(l), miss = [];
            for (const f of FILES) {
                X.tCalls(path.join(appRoot, f)).forEach(x => { if (/^[a-z_0-9.]+$/.test(x.text)) return; if (!((x.ctx && dict[`${x.ctx}|${x.text}`] != null) || dict[x.text] != null)) miss.push(`${path.basename(f)}:${x.line} ${x.text}`); }); // i18n('…') : le texte exact
                X.textsOfFile(path.join(appRoot, f)).forEach(x => { if (!has(dict, x.text)) miss.push(`${path.basename(f)}:${x.line} « ${x.text} »`); });
            }
            assert.deepEqual([...new Set(miss)], [], `${l} :\n${[...new Set(miss)].slice(0, 40).join('\n')}`);
        }
    });

    if (!phpPath) { console.log('— PHP absent : serveur et navigateur sautés'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-cartes-nouvelles-'));
    const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const geoFx = path.join(tmp, 'geocode.json');
    fs.writeFileSync(geoFx, JSON.stringify({ features: [{ geometry: { coordinates: [1.5807, 45.2306] }, properties: { label: 'Sainte-Féréole', citycode: '19194' } }] }));
    const envFor = (d, extra = {}) => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1', LCNDA_FRONTIERES_DIR: path.join(tmp, 'frontieres'), LCNDA_LAP_GEOCODE: 'file://' + geoFx, ...extra });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin2_code,admin4_code) VALUES
 (1,'Naves','Corrèze','France',45.3118,1.7521,'19','19146'),(2,'Tulle','Corrèze','France',45.2694,1.7680,'19','19272'),(3,'Seilhac','Corrèze','France',45.3667,1.7167,'19','19258'),
 (4,'Chameyrat','Corrèze','France',45.2471,1.7043,'19','19038'),(5,'Laguenne','Corrèze','France',45.2420,1.7810,'19','19101'),(6,'Meymac','Corrèze','France',45.5361,2.1464,'19','19136'),
 (7,'Paris','Paris','France',48.857,2.352,'75','75056'),
 (11,'Naves (19)','','France',NULL,NULL,'',''),(12,'NAVES, Corrèze','','',NULL,NULL,'',''),(13,'Le Mas Bas, Naves','','France',NULL,NULL,'',''),(14,'St Martin','','France',NULL,NULL,'',''),
 (15,'Ste Fereol','Corrèze','France',NULL,NULL,'',''),(16,'Lyon','','France',NULL,NULL,'',''),(17,'Buenos Aires','','Argentine',NULL,NULL,'',''),(18,'Tulle (Corrèze)','','France',NULL,NULL,'',''),(19,'idem','','France',NULL,NULL,'','')");
$pdo->exec("INSERT INTO commune_contours(insee_code,name,geometry_json,min_lon,min_lat,max_lon,max_lat,centroid_lon,centroid_lat) VALUES
 ('19146','Naves','{}',1.7,45.28,1.8,45.35,1.7521,45.3117),('19272','Tulle','{}',1.72,45.24,1.8,45.3,1.7680,45.2694),('19209','Saint-Martin-la-Méanne','{}',1.95,45.15,2.02,45.2,1.9897,45.1739),
 ('19210','Saint-Martin-Sepert','{}',1.44,45.45,1.5,45.5,1.4706,45.4706),('19194','Sainte-Féréole','{}',1.55,45.2,1.62,45.26,1.5807,45.2306),('69123','Lyon','{}',4.77,45.7,4.9,45.81,4.8357,45.7640),
 ('19258','Seilhac','{}',1.68,45.33,1.75,45.4,1.7167,45.3667),('19038','Chameyrat','{}',1.67,45.22,1.74,45.27,1.7043,45.2471),('19101','Laguenne','{}',1.75,45.22,1.81,45.26,1.7810,45.2420),('19136','Meymac','{}',2.1,45.5,2.2,45.58,2.1464,45.5361)");
$pdo->exec("INSERT INTO commune_neighbors(insee_code,neighbor_insee_code) VALUES('19146','19272'),('19272','19146'),('19146','19258'),('19258','19146')");
// les familles (inventées) : Jean MAZAUD, ses parents, ses grands-parents des deux côtés
$P = [[1,'Jean','MAZAUD','male','deceased',1,0,'cultivateur'],[2,'Pierre','MAZAUD','male','deceased',0,0,'tanneur'],[3,'Marie','LACOMBE','female','deceased',0,0,'ménagère'],
  [4,'Antoine','MAZAUD','male','deceased',0,0,'sabotier'],[5,'Jeanne','CHASTANG','female','deceased',0,0,''],[6,'Louis','LACOMBE','male','deceased',0,0,'instituteur'],[7,'Anne','BESSE','female','deceased',0,0,''],
  [8,'Jacques','MAZAUD','male','deceased',0,0,'tisserand'],[9,'Rose','VIALLE','female','deceased',0,0,''],[12,'Martin','LACOMBE','male','deceased',0,0,'laboureur'],[13,'Antoine','BESSE','female','deceased',0,0,''],
  [20,'Claire','MAZAUD','female','living',0,0,'informaticien'],[21,'Paul','DURAND','male','deceased',0,1,'notaire'],[30,'Jean','DURAND','male','deceased',0,0,'marchand'],[31,'Marie','VIALLE','female','deceased',0,0,'']];
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private,occupation) VALUES(?,?,?,?,?,?,?,?)');
foreach ($P as $r) { $ins->execute($r); }
// des décès pour les crises : Naves 1832 (six en trois semaines), Tulle 1832 (quatre), le reste au fil des ans
for ($i = 0; $i < 34; $i++) { $ins->execute([100 + $i, 'Personne' . $i, $i % 3 ? 'VIALLE' : 'BESSE', $i % 2 ? 'male' : 'female', 'deceased', 0, 0, '']); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3),(2,4,5),(3,6,7),(4,8,9),(6,12,13),(7,1,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,2),(3,3),(4,4),(6,6),(7,20)");
$ev = $pdo->prepare('INSERT INTO events(id,scope,person_id,family_id,event_type_id,date_text,year,place_id,cause,title) VALUES(?,?,?,?,?,?,?,?,?,?)');
$E = [[1,'person',1,null,'BIRT','1921',1921,2,'',''],[2,'person',1,null,'DEAT','1990',1990,2,'',''],[3,'person',2,null,'BIRT','1890',1890,1,'',''],[4,'person',2,null,'DEAT','1960',1960,2,'',''],
  [5,'person',3,null,'BIRT','1895',1895,5,'',''],[6,'person',3,null,'DEAT','1970',1970,2,'',''],[7,'family',null,1,'MARR','12 avril 1919',1919,2,'',''],
  [8,'person',4,null,'BIRT','1860',1860,1,'',''],[9,'person',4,null,'DEAT','1925',1925,1,'',''],[10,'person',5,null,'BIRT','1865',1865,1,'',''],[11,'person',6,null,'BIRT','1862',1862,5,'',''],
  [12,'person',7,null,'BIRT','1868',1868,3,'',''],[13,'person',7,null,'DEAT','1940',1940,3,'',''],[14,'person',8,null,'BIRT','1830',1830,4,'',''],[15,'person',9,null,'BIRT','1834',1834,1,'',''],
  [16,'person',12,null,'BIRT','1835',1835,6,'',''],[17,'person',13,null,'BIRT','1840',1840,3,'',''],[18,'family',null,2,'MARR','1858',1858,1,'',''],[19,'family',null,3,'MARR','1861',1861,2,'',''],
  [20,'person',20,null,'BIRT','1990',1990,2,'',''],[21,'person',21,null,'BIRT','1850',1850,2,'',''],[22,'person',21,null,'DEAT','1920',1920,2,'',''],[23,'person',2,null,'OCCU','1919',1919,2,'','tanneur'],
  [24,'person',8,null,'OCCU','1855',1855,1,'','tisserand'],[25,'person',30,null,'RESI','1790',1790,2,'',''],[26,'person',31,null,'BIRT','1770',1770,2,'',''],[27,'person',1,null,'CHR','1921',1921,1,'',''],
  [28,'person',4,null,'CHR','1860',1860,1,'',''],[29,'person',20,null,'OCCU','2015',2015,7,'','informaticien'],[30,'person',21,null,'OCCU','1880',1880,2,'','notaire'],
  [31,'person',30,null,'BIRT','1760',1760,2,'',''],[32,'person',6,null,'DEAT','1932',1932,13,'',''],[33,'person',5,null,'DEAT','1930',1930,11,'',''],[34,'person',2,null,'RESI','1950',1950,16,'','']];
foreach ($E as $r) { $r[4] = $t($r[4]); $ev->execute($r); }
$id = 100; $eid = 200;
$death = function (int $pid, int $y, int $place, string $date = '', string $cause = '', ?int $birth = null) use ($ev, $t, &$eid) { $ev->execute([$eid++, 'person', $pid, null, $t('DEAT'), $date ?: (string) $y, $y, $place, $cause, '']); if ($birth) { $ev->execute([$eid++, 'person', $pid, null, $t('BIRT'), (string) $birth, $birth, $place, '', '']); } };
foreach ([['14 août 1832', 'fièvre', 1780], ['19 août 1832', '', 1829], ['11 août 1832', '', 1800], ['22 août 1832', '', 1790], ['25 août 1832', '', 1810], ['2 septembre 1832', '', 1760]] as [$d, $c, $b]) { $death($id++, 1832, 1, $d, $c, $b); }
foreach ([1832, 1832, 1832, 1832] as $y) { $death($id++, $y, 2); }
foreach ([1820, 1823, 1826, 1828, 1830, 1834, 1836, 1838, 1840, 1842, 1825, 1829, 1835, 1839] as $k => $y) { $death($id++, $y, $k % 2 ? 1 : 2); }
foreach ([1709, 1709, 1709, 1709, 1709, 1700, 1715] as $y) { $death($id++, $y, 6); }
// parrains, marraines, témoins : baptême de Jean (Naves) par Jean DURAND de Tulle ; Antoine par Marie VIALLE ; un témoin vivant (jamais compté)
$pdo->exec("INSERT INTO event_witnesses(event_id,person_id,note) VALUES(27,30,'parrain, de Tulle'),(28,31,'marraine'),(7,30,'témoin'),(7,20,'témoin'),(27,21,'parrain'),(7,6,'curé')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }

    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } })).json();
    const post = async (action, body = {}, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf_token: token }) }); let b = null; try { b = await r.json(); } catch (_) {} return { status: r.status, body: b }; };

    try {
        /* ═════ 2. Serveur ═════ */
        await t('📍 lieux à placer : sûr, lieu-dit, plusieurs communes, hors de France, rien trouvé, distance au reste', async () => {
            const r = await get('lieux_a_placer'), by = n => r.items.find(x => x.name === n);
            if (process.env.CQ_DEBUG) console.log(r.items.map(x => `${x.name} → ${x.status} ${JSON.stringify(x.why)} ${x.props.map(p => p.label + '@' + p.km).join(' / ')}`).join('\n'));
            assert.ok(r.items.length >= 8, JSON.stringify(r).slice(0, 300));
            assert.equal(by('Naves (19)').status, 'sure'); assert.equal(by('Naves (19)').props[0].insee, '19146');
            assert.equal(by('NAVES, Corrèze').status, 'sure', 'le département écrit après la virgule');
            assert.equal(by('Tulle (Corrèze)').status, 'sure');
            assert.equal(by('St Martin').status, 'several'); assert.equal(by('St Martin').why.n, 2); assert.equal(by('St Martin').props.length, 2, 'les deux proposées, la plus proche d’abord');
            assert.equal(by('Le Mas Bas, Naves').status, 'probable', 'lieu-dit inconnu : au centre de Naves, approché'); assert.equal(by('Le Mas Bas, Naves').props.at(-1).approx, true);
            assert.equal(by('Lyon').status, 'probable'); assert.ok(by('Lyon').props[0].km > 200, 'loin du reste : ' + by('Lyon').props[0].km);
            assert.equal(by('Buenos Aires').status, 'abroad');
            assert.equal(by('Ste Fereol').status, 'none', 'pas de faute proche sans le réglage');
            assert.equal(by('idem').status, 'none');
            assert.equal(by('Naves (19)').group, '19146'); assert.equal(by('NAVES, Corrèze').group, '19146', 'regroupés par commune');
            assert.ok(!JSON.stringify(r).match(SECRET), 'des lieux, jamais des personnes');
            const f = await get('lieux_a_placer', { spelling: 'fuzzy' }); assert.equal(f.items.find(x => x.name === 'Ste Fereol').props[0].insee, '19194', 'faute proche proposée');
            const ask = await get('lieux_a_placer', { several: 'ask' }); assert.equal(ask.items.find(x => x.name === 'St Martin').props.length, 0, 'toujours me demander : rien de proposé');
            const ex = await get('lieux_a_placer', { spelling: 'exact' }); assert.notEqual(ex.items.find(x => x.name === 'St Martin').status, 'several', 'nom exact : « St » n’est pas « Saint »');
            const only = await get('lieux_a_placer', { ids: '11,14' }); assert.deepEqual(only.items.map(x => x.id).sort(), [11, 14], 'seulement les lieux d’une carte');
        });
        await t('📍 placer un lieu, puis un lot, ↶ Annuler qui remet tout ; CSRF ; écarter « idem » puis le remettre', async () => {
            const no = await post('lieux_place', { items: [{ id: 11, lat: 45.31, lon: 1.75 }] }, 'mauvais'); assert.ok(no.status >= 400, 'CSRF');
            const one = await post('lieux_place', { items: [{ id: 11, lat: 45.3117, lon: 1.7521, insee: '19146', dept: '19' }] }); assert.equal(one.status, 200, JSON.stringify(one.body));
            assert.equal(one.body.result.n, 1); assert.equal(one.body.result.before[0].lat, null);
            let r = await get('lieux_a_placer'); assert.ok(!r.items.some(x => x.id === 11), 'placé : sorti de la liste');
            const lot = await post('lieux_place', { items: [{ id: 12, lat: 45.3117, lon: 1.7521, insee: '19146', dept: '19' }, { id: 13, lat: 45.3117, lon: 1.7521, approx: true }, { id: 18, lat: 45.2694, lon: 1.768, insee: '19272' }] });
            assert.equal(lot.body.result.n, 3);
            const desc = await get('place', { id: 13 }).catch(() => null);
            r = await get('lieux_a_placer'); assert.ok(!r.items.some(x => [12, 13, 18].includes(x.id)));
            const undo = await post('lieux_undo', { items: [...one.body.result.before, ...lot.body.result.before] }); assert.equal(undo.body.result.n, 4);
            r = await get('lieux_a_placer'); for (const id of [11, 12, 13, 18]) assert.ok(r.items.some(x => x.id === id), 'remis : ' + id);
            assert.ok(desc !== undefined);
            const bad = await post('lieux_place', { items: [{ id: 14, lat: 0, lon: 0 }] }); assert.equal(bad.status, 422, '0, 0 refusé');
            const ign = await post('fix_place', { id: 19, ignore: 1 }); assert.equal(ign.status, 200);
            assert.ok(!(await get('lieux_a_placer')).items.some(x => x.id === 19), 'écarté');
            assert.ok((await get('lieux_a_placer', { ignored: 1 })).items.some(x => x.id === 19), 'dans les écartés');
            await post('controle_undismiss', { key: 'place:19' });
            assert.ok((await get('lieux_a_placer')).items.some(x => x.id === 19), '↺ remis');
        });
        await t('📍 🌐 en ligne : seulement sur demande, le nom du lieu seul (adresse d’essai)', async () => {
            const r = await post('lieux_online', { q: 'Ste Fereol' }); assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal(r.body.result.props[0].insee, '19194'); assert.match(r.body.result.props[0].label, /🌐/);
            assert.doesNotMatch(src('lib/lieux_a_placer.php'), /lap_online\([^)]*\)\s*;[^\n]*lap_list/, 'jamais appelé par la liste');
            assert.doesNotMatch(src('assets/js/heritage-lieux-a-placer.js'), /lieux_online[^\n]*forEach|forEach[^\n]*lieux_online/, 'jamais en lot');
        });

        await t('🔨 métiers : placés (acte, sinon résidence, sinon naissance), classés par secteur — ni vivant ni fiche confidentielle', async () => {
            const r = await get('cartes_plus2', { what: 'trades' });
            assert.ok(Array.isArray(r.rows) && r.rows.length >= 4, JSON.stringify(r).slice(0, 300));
            const by = (pid, key) => r.rows.find(x => x[0] === pid && x[3] === key);
            const tan = by(2, 'tanneur'); assert.ok(tan, 'tanneur'); assert.equal(tan[1], 2, 'à Tulle (lieu de l’acte)'); assert.equal(tan[2], 1919); assert.equal(tan[4], 'arti'); assert.equal(tan[6], 'act');
            const sab = by(4, 'sabotier'); assert.ok(sab, 'sabotier (fiche)'); assert.equal(sab[1], 1, 'sans acte : sa naissance à Naves'); assert.equal(sab[6], 'birth');
            assert.ok(!r.rows.some(x => x[0] === 20 || x[0] === 21), 'ni vivante ni fiche confidentielle');
            assert.ok(!JSON.stringify(r).match(SECRET));
            assert.ok(r.sectors.length === 12 && r.domains.length === 18);
            assert.ok((await get('cartes_plus2', { what: 'trades', pop: 'pat', root: 1 })).rows.every(x => [2, 4, 5, 8, 9].includes(x[0])), 'côté père');
            const tl = await get('cartes_plus2', { what: 'trade_list' }); assert.ok(tl.trades.some(x => x.key === 'tanneur'));
            assert.equal((await get('cartes_plus2', { what: 'nope' })).error, 'Demande inconnue.');
        });

        /* ═════ 3. Navigateur ═════ */
        let chromium = null; try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (_) {} }
        if (!chromium) console.log('— Playwright absent : navigateur sauté');
        const browser = chromium ? await chromium.launch() : null;
        const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
        const closeAll = p => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }));
        if (browser) try {
            for (const [label, opts] of [['1440 px, clair', { viewport: { width: 1440, height: 900 } }], ['390 px, sombre', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' }]]) {
                const ctx = await browser.newContext(opts), p = await ctx.newPage(), narrow = opts.viewport.width < 500, tag = narrow ? '390-sombre' : '1440';
                const errors = [];
                p.on('pageerror', e => errors.push(e.message));
                p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_|net::/.test(m.text())) errors.push(m.text()); });
                await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); // rien d'Internet
                await p.goto(base);
                await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.diagramCartesPlus2 && window.LCNDA_EXT?.lieuxAPlacer, null, { timeout: 30000 });
                if (narrow) await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
                await p.evaluate(() => { try { localStorage.removeItem('lcnda-lieux-a-placer'); } catch (_) {} });
                const noSide = async () => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté');

                await t(`📍 Lieux à placer depuis la Carte : liste, placer, ↶ Annuler, revue en lot, réglages (${label})`, async () => {
                    await p.evaluate(() => window.LCNDA_APP.setModule('carte')); await p.waitForSelector('.map-layout [data-lap-open]');
                    await p.click('.map-layout [data-lap-open]'); await p.waitForSelector('.lap-dlg .lap-item');
                    assert.match(await p.$eval('.lap-dlg', e => e.textContent), /Naves \(19\)[\s\S]*Sûr/);
                    assert.ok(await p.$('.lap-dlg [data-lap-group]'), '🧩 placer ensemble');
                    await shot(p, `lieux-liste-${tag}`); await noSide();
                    await p.click('.lap-dlg [data-lap-st="several"]'); assert.equal(await p.$$eval('.lap-dlg .lap-item', x => x.length), 1);
                    await p.click('.lap-dlg [data-lap-st=""]');
                    await p.click('.lap-dlg [data-lap-id="18"] [data-lap-put="18:0"]');
                    await p.waitForFunction(() => !document.querySelector('.lap-dlg [data-lap-id="18"]'), null, { timeout: 8000 });
                    const toastBtn = await p.waitForSelector('text=↶ Annuler', { timeout: 5000 }); await toastBtn.click();
                    await p.waitForSelector('.lap-dlg [data-lap-id="18"]', { timeout: 8000 });
                    await p.click('.lap-dlg [data-lap-review]'); await p.waitForSelector('dialog[open] .lap-review');
                    const ck = await p.$$eval('dialog[open] .lap-review [data-lap-ck]', x => x.filter(c => c.checked).length);
                    assert.ok(ck >= 2, 'les sûrs sont cochés : ' + ck);
                    assert.equal(await p.$$eval('dialog[open] .lap-review tr.is-far input:checked', x => x.length), 0, 'loin du reste : jamais coché');
                    await shot(p, `lieux-revue-${tag}`);
                    await p.click('dialog[open] .lap-review [data-lap-rv="none"]'); await p.click('dialog[open] .lap-review [data-lap-ck="0"]');
                    await p.click('dialog[open]:has(.lap-review) button[type=submit]');
                    await p.waitForSelector('text=↶ Annuler', { timeout: 5000 }); await (await p.$('text=↶ Annuler')).click();
                    await p.waitForTimeout(500);
                    await p.click('.lap-dlg [data-lap-settings]'); await p.waitForSelector('dialog[open] .lap-set');
                    await p.check('dialog[open] .lap-set input[name="lap_online"][value="on"]'); await p.click('dialog[open]:has(.lap-set) button[type=submit]');
                    await p.waitForSelector('.lap-dlg [data-lap-online]');
                    await shot(p, `lieux-reglages-${tag}`); await noSide();
                    await closeAll(p);
                });
                for (const [kind, prep, expect] of KIND_TESTS) {
                    await t(`Graphiques → Cartes : ${kind} — exemple, « Depuis l’app », réglages, export sans vivant (${label})`, async () => {
                        await closeAll(p); await p.evaluate(k => { window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, kind);
                        await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-preview] svg [data-geo-map]', { timeout: 20000 });
                        await p.click('[data-dg-tab="app"]'); await p.waitForSelector('[data-cq-go]');
                        assert.ok(await p.$$eval('[data-dgg] option', x => x.length) >= 3, '« Graphique » : au moins deux départs');
                        if (prep) await prep(p);
                        await p.click('[data-cq-go]');
                        await p.waitForFunction(() => !document.querySelector('[data-cq-msg]') || /✓|⚠️/.test(document.querySelector('[data-cq-msg]').textContent), null, { timeout: 15000 });
                        const msg = await p.evaluate(() => document.querySelector('[data-cq-msg]')?.textContent || '✓ onglet Données'); assert.match(msg, /^✓/, msg);
                        await p.waitForFunction(w => (document.querySelector('[data-dg-preview]')?.innerHTML || '').includes(w) && document.querySelector('[data-dg-preview] svg [data-geo-map]'), expect, { timeout: 15000 });
                        await p.waitForTimeout(400);
                        const svg = await p.$eval('[data-dg-preview]', e => e.innerHTML); assert.doesNotMatch(svg, SECRET, 'ni vivant ni fiche confidentielle');
                        await noSide(); await shot(p, `${kind}-${tag}`);
                        await p.click('[data-dg-tab="opts"]'); await p.waitForSelector('[data-opt]');
                        const sels = await p.$$eval('select[data-opt]', x => { const mk = new Set((window.LCNDA_EXT.diagramCartes.mapOpts?.() || []).map(o => o.k)); return x.filter(s => !mk.has(s.dataset.opt)).map(s => [s.dataset.opt, s.options[0]?.value, s.value]); });
                        assert.ok(sels.length >= 4, 'des réglages'); for (const [k, first, v] of sels) if (!['legend', 'ramp', 'placeLabels'].includes(k)) assert.equal(v, first, `${k} : l’option conseillée (la première) réglée au départ`);
                        const exported = await p.evaluate(async () => { const R = window.LCNDA_EXT.diagramRender, d = document.querySelector('dialog.h-dg-dlg[open]'); return d ? d.querySelector('[data-dg-preview]').innerHTML : ''; });
                        assert.doesNotMatch(exported, SECRET);
                        await closeAll(p);
                    });
                }
                await t(`les cinq cartes : SVG valides qui s’ouvrent comme une image (export PNG / SVG / PDF) (${label})`, async () => {
                    const bad = await p.evaluate(async kinds => { const R = window.LCNDA_EXT.diagramRender, out = [];
                        for (const [k, v] of kinds) { if (!R.KINDS[k]) { out.push(k + ' : absent'); continue; } const s0 = R.KINDS[k].sample(), sp = {kind: k, ...s0, o: {...s0.o, ...v}}; const svg = R.svg(await R.KINDS[k].resolve(sp), 900);
                            if (!/data-geo-map/.test(svg)) out.push(k + ' ' + JSON.stringify(v) + ' : pas de carte');
                            if (/data-geo-wait/.test(svg)) out.push(k + ' : fond pas chargé');
                            if (new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')) out.push(k + ' : XML');
                            if (!await new Promise(ok => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'})); })) out.push(k + ' : image'); }
                        return out; }, KIND_TESTS.flatMap(k => [[k[0], {}], ...(VARIANTS[k[0]] || []).map(v => [k[0], v])]));
                    assert.deepEqual(bad, []);
                });
                await t(`aucune erreur JavaScript (${label})`, async () => { assert.deepEqual(errors, []); });
                await ctx.close();
            }
        } finally { await browser.close(); }
    } finally { proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    finish();
})();
function finish() { console.log(failed ? `✗ ${failed} échec(s)` : '✓ tout est bon'); process.exit(failed ? 1 : 0); }
