'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Sécurité des imports et des exports (audit « pentest ») :   node tests/test-securite-imports-exports.js
 * Un vrai « php -S » sur une base neuve (dossiers temporaires), noms fictifs (MAZAUD, LACOMBE, DURAND), fichiers piégés fabriqués ici.
 *  1. livre de famille en mode confidentialité : la biographie ne nomme plus le conjoint vivant ni l'enfant confidentiel ;
 *  2. sources en RIS / BibTeX : une source jointe seulement à un événement confidentiel ne sort pas ; refusé en consultation ;
 *  3. photos qui sortent de l'app (livre en ePub, musée) : sans EXIF (GPS, appareil), l'orientation gardée, sans réencoder ;
 *  4. archive de dossier de succession, paquet MacFamilyTree, dossier partagé à deux ordinateurs : jamais un « .php » ni un
 *     « .svg » écrit dans les médias (sous Apache, media/ est servi tel quel) ; .htaccess : media/ ne sert ni page ni script ;
 *  5. CSV : « Qui a vu quoi » protège aussi la tabulation et le retour chariot (injection de formule) ; les tableaux CSV fabriqués
 *     par la page passent par csvSafe ;
 *  6. XSS stocké : un GEDCOM aux noms, lieux, notes, sources piégés (<img onerror>, <script>, javascript:) importé, puis la fiche,
 *     le livre de famille (HTML, ePub) et la copie « Partager avec la famille » ouverts dans un vrai navigateur : rien ne s'exécute.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-secu-'));
const dir = path.join(tmp, 'data');
const work = path.join(tmp, 'fabrique');
const MEDIA = path.join(dir, 'media');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(MEDIA, { recursive: true });
fs.mkdirSync(work, { recursive: true });

let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.message ? e.message : e) + '\n      ' + (e && e.stack ? (e.stack.split('\n').find(l => l.includes('test-securite-imports-exports')) || '').trim() : '')); } }
function php(code, ...args) {
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=1G', '-r', code, ...args], { cwd: appRoot, encoding: 'utf8', env: envFor(dir), maxBuffer: 64 * 1048576 });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().slice(0, 800));
    return r.stdout;
}
const DB = path.join(dir, 'genealogy.sqlite');
const sql = q => JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);$d->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);echo json_encode($d->query($argv[2])->fetchAll(),JSON_UNESCAPED_UNICODE);`, DB, q));
const one = q => sql(q)[0] || {};
const exec = q => php(`$d=new PDO('sqlite:'.$argv[1]);$d->exec($argv[2]);`, DB, q);
const sqliteFile = (file, script) => { try { fs.unlinkSync(file); } catch (_) {} php('$d=new PDO("sqlite:".$argv[1]);$d->exec($argv[2]);', file, script); return fs.readFileSync(file); };
/** Une archive zip fabriquée par PHP : [[nom, contenu (texte ou Buffer)]] */
function makeZip(entries) {
    const spec = path.join(work, 'zip-' + crypto.randomBytes(4).toString('hex') + '.json');
    const out = spec.replace(/\.json$/, '.zip');
    fs.writeFileSync(spec, JSON.stringify(entries.map(([n, c]) => [n, Buffer.from(c).toString('base64')])));
    php('$z=new ZipArchive();$z->open($argv[2],ZipArchive::CREATE|ZipArchive::OVERWRITE);foreach(json_decode(file_get_contents($argv[1]),true) as [$n,$c]){$z->addFromString($n,base64_decode($c));}$z->close();', spec, out);
    return fs.readFileSync(out);
}
/** Les fichiers d'un zip reçu : {nom: Buffer} */
function unzip(buf) {
    const f = path.join(work, 'recu-' + crypto.randomBytes(4).toString('hex') + '.zip'); fs.writeFileSync(f, buf);
    const list = JSON.parse(php('$z=new ZipArchive();$z->open($argv[1]);$o=[];for($i=0;$i<$z->numFiles;$i++){$n=$z->getNameIndex($i);$o[$n]=base64_encode((string)$z->getFromIndex($i));}echo json_encode($o);', f));
    return Object.fromEntries(Object.entries(list).map(([k, v]) => [k, Buffer.from(v, 'base64')]));
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

/** Une vraie photo JPEG (fabriquée par PHP) avec un bloc EXIF : orientation 6, appareil « GPSLEAK-APPAREIL », position GPS, et un commentaire */
const GPS_JPEG = Buffer.from(php(String.raw`$im=imagecreatetruecolor(40,20);imagefill($im,0,0,imagecolorallocate($im,200,40,40));ob_start();imagejpeg($im);$j=ob_get_clean();
$make="GPSLEAK-APPAREIL\0";$n=3;$dataOff=8+2+12*$n+4;
$ifd=pack('v',$n).pack('vvVvv',0x0112,3,1,6,0).pack('vvVV',0x010F,2,strlen($make),$dataOff).pack('vvVV',0x8825,4,1,$dataOff+strlen($make)).pack('V',0);
$gps=pack('v',2).pack('vvVV',0x0001,2,2,ord('N')).pack('vvVV',0x0003,2,2,ord('E')).pack('V',0);
$app1="Exif\0\0"."II*\0".pack('V',8).$ifd.$make.$gps;
$l=(ord($j[4])<<8)|ord($j[5]);
echo base64_encode(substr($j,0,4+$l)."\xFF\xE1".pack('n',strlen($app1)+2).$app1."\xFF\xFE".pack('n',2+14).'COMMENT-SECRET'.substr($j,4+$l));`), 'base64');
/** Lecture de l'EXIF d'une image par PHP : {orientation, make, gps} */
function exifOf(buf) {
    const f = path.join(work, 'exif-' + crypto.randomBytes(4).toString('hex') + '.jpg'); fs.writeFileSync(f, buf);
    return JSON.parse(php('$e=@exif_read_data($argv[1]);echo json_encode(["orientation"=>$e["Orientation"]??0,"make"=>$e["Make"]??"","gps"=>isset($e["GPSLatitudeRef"])||isset($e["GPSLongitudeRef"]),"decode"=>(bool)@imagecreatefromstring(file_get_contents($argv[1]))]);', f));
}

const X = t => `<img src=x onerror="(top.__x=top.__x||[]).push('${t}')">`;
const GED = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Pierre${X('prenom')} /MAZAUD/
1 SEX M
1 OCCU Meunier${X('metier')}
1 BIRT
2 DATE 12 MAR 1850
2 PLAC Ussac${X('lieu')}, Corrèze
1 DEAT
2 DATE 1910
1 NOTE Note ${X('note')} <script>(top.__x=top.__x||[]).push('script')</script>
1 WWW javascript:(top.__x=top.__x||[]).push('lien')
1 SOUR @S1@
2 PAGE page${X('page')}
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jeanne /LACOMBE/
1 SEX F
1 BIRT
2 DATE 3 JUN 1990
1 FAMS @F1@
0 @I3@ INDI
1 NAME Louis /DURAND/
1 SEX M
1 RESN confidential
1 BIRT
2 DATE 1880
1 DEAT
2 DATE 1950
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1878
2 PLAC Brive${X('lieumariage')}
0 @S1@ SOUR
1 TITL Registre${X('source')}
1 WWW javascript:(top.__x=top.__x||[]).push('lien-source')
0 TRLR
`;

(async () => {
    {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
        if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    }
    const port = await freePort();
    const base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'upload_max_filesize=256M', '-d', 'post_max_size=256M', '-d', 'memory_limit=1G', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...envFor(dir), PHP_CLI_SERVER_WORKERS: '4' }, stdio: ['ignore', 'ignore', 'pipe'] });
    let phpLog = ''; proc.stderr.on('data', d => { phpLog += d; });
    let browser = null;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const parse = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (_) { return { _raw: t.slice(0, 500) }; } };
        const post = async (action, body) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await parse(r) }; };
        const upload = async (action, buf, name, fields = {}) => { const fd = new FormData(); fd.append('file', new Blob([buf]), name); fd.append('csrf', csrf); for (const [k, v] of Object.entries(fields)) fd.append(k, v); const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd }); return { status: r.status, body: await parse(r) }; };
        const get = async q => { const r = await fetch(base + q, { headers: { Cookie: cookie } }); const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, headers: r.headers, buf, text: buf.toString('utf8') }; };

        // ── la base : un GEDCOM piégé ──
        let ids = {};
        await step('départ : un GEDCOM aux champs piégés s’importe (le texte est gardé tel quel, jamais exécuté)', async () => {
            const r = await upload('import_package', Buffer.from(GED), 'famille-piegee.ged');
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal(r.body.stats.persons, 3);
            for (const p of sql('SELECT id, last_name FROM persons')) ids[p.last_name] = p.id;
            exec(`UPDATE persons SET living_status='living' WHERE id=${ids.LACOMBE}`);
            assert.equal(one(`SELECT is_private FROM persons WHERE id=${ids.DURAND}`).is_private, 1, 'RESN confidential → fiche confidentielle');
            assert.match(one(`SELECT first_name FROM persons WHERE id=${ids.MAZAUD}`).first_name, /onerror/);
        });

        // ── 1. livre de famille en mode confidentialité ──
        await step('livre de famille, mode confidentialité : la biographie ne nomme ni le conjoint vivant ni l’enfant confidentiel (HTML, Markdown, ePub)', async () => {
            const plain = await get('api.php?action=export_family_book&format=md');
            assert.equal(plain.status, 200);
            assert.ok(plain.text.includes('LACOMBE') && plain.text.includes('DURAND'), 'sans le mode confidentialité, le livre est complet (témoin)');
            for (const fmt of ['html', 'md', 'txt', 'doc']) {
                const r = await get(`api.php?action=export_family_book&format=${fmt}&privacy=1`);
                assert.equal(r.status, 200, fmt);
                assert.ok(r.text.includes('MAZAUD'), fmt + ' : la fiche de Pierre est là');
                assert.ok(!r.text.includes('LACOMBE'), fmt + ' : le nom de la conjointe vivante est sorti : ' + r.text.slice(Math.max(0, r.text.indexOf('LACOMBE') - 150), r.text.indexOf('LACOMBE') + 20));
                assert.ok(!r.text.includes('DURAND'), fmt + ' : le nom de l’enfant confidentiel est sorti');
            }
            const ep = unzip((await get('api.php?action=export_family_book&format=epub&privacy=1')).buf);
            const all = Object.values(ep).map(b => b.toString('utf8')).join('\n');
            assert.ok(all.includes('MAZAUD') && !all.includes('LACOMBE') && !all.includes('DURAND'), 'ePub : ni vivante ni confidentiel');
            const noLiving = await get('api.php?action=export_family_book&format=md&include_living=0');
            assert.ok(!noLiving.text.includes('LACOMBE'), 'sans les vivants : la conjointe vivante n’est pas nommée non plus');
        });

        // ── 2. sources en RIS / BibTeX ──
        await step('sources RIS / BibTeX : une source jointe seulement à un événement confidentiel ne sort pas ; les autres, oui', async () => {
            exec(`INSERT INTO sources(title) VALUES('Acte CONFIDENTIEL-RIS');
                  UPDATE events SET is_private=1 WHERE id=(SELECT min(e.id) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=${ids.MAZAUD} AND t.gedcom_tag='BIRT');
                  INSERT INTO source_links(entity_type,entity_id,source_record_id) VALUES('event',(SELECT min(e.id) FROM events e WHERE e.is_private=1),(SELECT max(id) FROM sources));`);
            for (const fmt of ['ris', 'bibtex']) {
                const r = await get(`api.php?action=sources_export&format=${fmt}`);
                assert.equal(r.status, 200, fmt + ' ' + r.text.slice(0, 200));
                assert.ok(r.text.includes('Registre'), fmt + ' : la source ordinaire est là');
                assert.ok(!r.text.includes('CONFIDENTIEL-RIS'), fmt + ' : la source de l’événement confidentiel est sortie');
            }
            const log = sql("SELECT what FROM access_log WHERE kind='export' ORDER BY id DESC LIMIT 1")[0] || {};
            assert.match(String(log.what || ''), /^sources/, '« Qui a vu quoi » note l’export des sources');
        });

        await step('mode consultation : l’export des sources (RIS / BibTeX) est refusé comme les autres exports', async () => {
            const k = await post('kiosk_enter', { password: 'consult-2026' });
            assert.equal(k.status, 200, JSON.stringify(k.body));
            try {
                for (const q of ['sources_export&format=ris', 'sources_export&format=bibtex', 'export_gedcom', 'export_family_book&format=html']) {
                    const r = await fetch(`${base}api.php?action=${q}`);
                    assert.equal(r.status, 423, q + ' : ' + r.status);
                    assert.ok(!r.headers.get('content-disposition'), q + ' : rien n’est envoyé');
                }
            } finally {
                const e = await post('kiosk_exit', { password: 'consult-2026' });
                assert.equal(e.status, 200, JSON.stringify(e.body));
            }
        });

        // ── 3. EXIF ──
        await step('livre de famille en ePub : la photo part sans EXIF (ni GPS, ni appareil, ni commentaire), l’orientation est gardée', async () => {
            const before = exifOf(GPS_JPEG);
            assert.deepEqual([before.orientation, before.make.replace(/\0/g, ''), before.gps, before.decode], [6, 'GPSLEAK-APPAREIL', true, true], 'la photo fabriquée a bien son EXIF');
            const name = crypto.randomBytes(16).toString('hex') + '.jpg';
            fs.writeFileSync(path.join(MEDIA, name), GPS_JPEG);
            exec(`INSERT INTO media(title,media_type,filename,thumbnail) VALUES('Photo de Pierre','image','${name}','${name}');
                  INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES((SELECT max(id) FROM media),'person',${ids.MAZAUD},0);`);
            const ep = unzip((await get('api.php?action=export_family_book&format=epub')).buf);
            const imgs = Object.entries(ep).filter(([n]) => /^OEBPS\/img\d+\.jpe?g$/i.test(n));
            assert.ok(imgs.length >= 1, 'la photo est dans l’ePub : ' + Object.keys(ep).join(', '));
            for (const [n, b] of imgs) {
                assert.ok(!b.includes('GPSLEAK') && !b.includes('COMMENT-SECRET'), n + ' : une métadonnée est restée');
                const e = exifOf(b);
                assert.deepEqual([e.gps, e.make, e.orientation, e.decode], [false, '', 6, true], n + ' : ' + JSON.stringify(e));
            }
        });

        await step('musée exporté : la photo d’une œuvre part sans EXIF ; PNG et WebP sans leurs blocs de texte / EXIF', async () => {
            const f = path.join(work, 'oeuvre.jpg'); fs.writeFileSync(f, GPS_JPEG);
            const out = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; require_once 'lib/museum.php';
[$b,$mime,$ext]=museum_shrunk_image($argv[1],2400);
$p=imagecreatetruecolor(4,4);ob_start();imagepng($p);$png=ob_get_clean();$c=fn($t,$d)=>pack('N',strlen($d)).$t.$d.pack('N',crc32($t.$d));
$png2=substr($png,0,33).$c('tEXt',"GPS\0PNG-SECRET").$c('eXIf','II*'."\0".'EXIF-SECRET').substr($png,33);$sp=image_strip_metadata($png2);
$w=imagecreatetruecolor(4,4);ob_start();imagewebp($w);$wp=ob_get_clean();
$vx="VP8X".pack('V',10).chr(0x08)."\0\0\0".substr(pack('V',3),0,3).substr(pack('V',3),0,3);$body=$vx.substr($wp,12)."EXIF".pack('V',12).'WEBP-SECRET!';
$webp="RIFF".pack('V',4+strlen($body))."WEBP".$body;$sw=image_strip_metadata($webp);
echo json_encode(['leak'=>str_contains($b,'GPSLEAK'),'mime'=>$mime,'ok'=>(bool)@imagecreatefromstring($b),
 'png_leak'=>str_contains($sp,'SECRET'),'png_ok'=>(bool)@imagecreatefromstring($sp),
 'webp_leak'=>str_contains($sw,'SECRET'),'webp_ok'=>(bool)@imagecreatefromstring($sw),'webp_flag'=>ord($sw[20])&0x08,'webp_size'=>unpack('V',substr($sw,4,4))[1]+8===strlen($sw),
 'other'=>image_strip_metadata('GIF89a-tel-quel')==='GIF89a-tel-quel','cut'=>image_strip_metadata($cut=substr((string)file_get_contents($argv[1]),0,40))===$cut]);`, f));
            assert.deepEqual(out, { leak: false, mime: 'image/jpeg', ok: true, png_leak: false, png_ok: true, webp_leak: false, webp_ok: true, webp_flag: 0, webp_size: true, other: true, cut: true });
        });

        // ── 4. fichiers déposés dans les médias ──
        await step('archive de dossier de succession piégée : ni « .php » ni « .svg » écrit dans les médias, la vraie photo arrive', async () => {
            const bundle = { format: 'lcnda-succ', case: { id: 1, number: 'S-2026-1', title: 'Succession MAZAUD', deceased_id: 1 }, persons: [{ id: 1, first_name: 'Paul', last_name: 'MAZAUD', gender: 'male' }],
                media: [{ id: 1, title: 'piège', media_type: 'image', filename: 'piege-succ.php', thumbnail: 'piege-succ.svg' }, { id: 2, title: 'piège 2', media_type: 'image', filename: 'sous/piege.phtml', thumbnail: '.htaccess' },
                    { id: 3, title: 'Acte', media_type: 'image', filename: 'acte-succ.jpg', thumbnail: '' }] };
            const zip = makeZip([['dossier.json', JSON.stringify(bundle)], ['medias/piege-succ.php', '<?php echo "PWN";'], ['medias/piege-succ.svg', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
                ['medias/sous/piege.phtml', '<?php echo "PWN";'], ['medias/.htaccess', 'AddHandler php-script .jpg'], ['medias/acte-succ.jpg', GPS_JPEG]]);
            const up = await upload('successoral_write', zip, 'dossier.lcnda-succ.zip', { op: 'reimport_upload' });
            assert.equal(up.status, 200, JSON.stringify(up.body));
            const r = await post('successoral_write', { op: 'reimport', token: up.body.result.token });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            const files = [];
            const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(path.relative(MEDIA, p)); } };
            walk(MEDIA);
            assert.ok(files.includes('acte-succ.jpg'), 'la photo de l’acte est rangée : ' + files.join(', '));
            assert.deepEqual(files.filter(f => /\.(php|phtml|svg)$|htaccess/i.test(f)), [], 'un fichier dangereux a été écrit');
            for (const f of ['piege-succ.php', 'piege-succ.svg', 'sous/piege.phtml']) assert.equal((await get('media/' + f)).status, 404, f);
        });

        await step('paquet MacFamilyTree : une « photo » nommée .php dans resources/ n’est jamais copiée dans les médias', async () => {
            const MFT = pic => `
CREATE TABLE Z_PRIMARYKEY (Z_ENT INTEGER PRIMARY KEY, Z_NAME VARCHAR);
INSERT INTO Z_PRIMARYKEY VALUES (15,'Person'),(14,'Family'),(25,'PersonEvent'),(24,'FamilyEvent'),(28,'Place'),(19,'MediaPicture'),(6,'Note'),(53,'ConclusionPersonEventType'),(52,'ConclusionFamilyEventType');
CREATE TABLE ZBASEOBJECT (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, ZFIRSTNAME VARCHAR, ZLASTNAME VARCHAR, ZGENDER INTEGER, ZMAN INTEGER, ZWOMAN INTEGER,
  ZCONCLUSIONTYPE INTEGER, ZCONCLUSIONTYPE1 INTEGER, ZPERSON1 INTEGER, ZFAMILY INTEGER, ZDATE2 VARCHAR, ZASSIGNEDPLACE INTEGER, ZPLACE VARCHAR, ZCOUNTY VARCHAR, ZSTATE VARCHAR, ZCOUNTRY VARCHAR,
  ZTITLE VARCHAR, ZPICTUREFILEIDENTIFIER VARCHAR, ZTHUMBNAILFILEIDENTIFIER VARCHAR, Z7_OBJECT INTEGER, ZTEXT VARCHAR, ZUSERDESCRIPTION VARCHAR, ZDATE VARCHAR);
INSERT INTO ZBASEOBJECT (Z_PK,Z_ENT,ZFIRSTNAME,ZLASTNAME,ZGENDER) VALUES (1,15,'Antoine','LACOMBE',0);
INSERT INTO ZBASEOBJECT (Z_PK,Z_ENT,ZTITLE,ZPICTUREFILEIDENTIFIER,ZTHUMBNAILFILEIDENTIFIER) VALUES (30,19,'Portrait','${pic}','vignette-mft.svg');
CREATE TABLE ZADDITIONALNAME (Z_PK INTEGER PRIMARY KEY, ZPERSON INTEGER, ZFIRSTNAME VARCHAR, ZLASTNAME VARCHAR);
CREATE TABLE ZCHILDRELATION (Z_PK INTEGER PRIMARY KEY, ZFAMILY INTEGER, ZCHILD INTEGER, ZRELATIONTYPETOMANINFAMILY INTEGER, ZRELATIONTYPETOWOMANINFAMILY INTEGER, ZCUSTOMORDER FLOAT);
CREATE TABLE ZCONCLUSIONTYPE (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, ZIDENTIFIER VARCHAR, ZTYPENAME VARCHAR, ZGEDCOMTAG VARCHAR, ZISUSERCREATED INTEGER, ZISENABLED INTEGER);
CREATE TABLE ZCOORDINATE (Z_PK INTEGER PRIMARY KEY, ZLATITUDE FLOAT, ZLONGITUDE FLOAT);
CREATE TABLE ZMEDIARELATION (Z_PK INTEGER PRIMARY KEY, ZBASEMEDIA INTEGER, ZMEDIACONTAINER INTEGER, Z8_MEDIACONTAINER INTEGER);
INSERT INTO ZMEDIARELATION VALUES (1,30,1,15);`;
            for (const [pic, expectCopied] of [['piege-mft.php', false], ['portrait-mft.jpg', true]]) {
                const db = sqliteFile(path.join(work, 'database'), MFT(pic));
                const z = makeZip([['Famille.mftpkg/database', db], ['Famille.mftpkg/resources/' + pic, pic.endsWith('.jpg') ? GPS_JPEG : '<?php echo "PWN";'], ['Famille.mftpkg/resources/vignette-mft.svg', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>']]);
                const r = await upload('import_package', z, 'famille.mftpkg');
                assert.equal(r.status, 200, JSON.stringify(r.body));
                assert.equal(fs.existsSync(path.join(MEDIA, pic)), expectCopied, pic + (expectCopied ? ' devait être copiée (témoin)' : ' a été copié dans les médias'));
                assert.ok(!fs.existsSync(path.join(MEDIA, 'vignette-mft.svg')), 'la vignette .svg a été copiée');
                const u = await post('import_undo', { token: r.body.undo }); assert.equal(u.status, 200, JSON.stringify(u.body));
            }
        });

        await step('dossier partagé à deux ordinateurs : la copie d’un média refuse « .php », « .phtml », « .svg », « .js » ; une photo passe', async () => {
            const from = path.join(work, 'partage'), to = path.join(work, 'medias-ici');
            fs.mkdirSync(from, { recursive: true }); fs.mkdirSync(to, { recursive: true });
            for (const f of ['a.php', 'b.phtml', 'c.svg', 'd.js', 'e.jpg', 'f.pdf', 'g.docx']) fs.writeFileSync(path.join(from, f), 'x');
            const res = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; require_once 'lib/backup.php'; require_once 'lib/sync_dossier.php';
$o=[];foreach(['a.php','b.phtml','c.svg','d.js','e.jpg','f.pdf','g.docx'] as $f){$o[$f]=sd_media_copy($f,$argv[1],$argv[2]);}echo json_encode($o);`, from, to));
            assert.deepEqual(res, { 'a.php': false, 'b.phtml': false, 'c.svg': false, 'd.js': false, 'e.jpg': true, 'f.pdf': true, 'g.docx': true });
        });

        await step('.htaccess (Apache, MAMP) : aucun script PHP hors de la racine (media/ compris) ; une page, un SVG ou un XML de media/ ne s’ouvre jamais comme une page de l’app', async () => {
            const h = fs.readFileSync(path.join(appRoot, '.htaccess'), 'utf8');
            assert.match(h, /RewriteRule \^\.\+\/\.\+\\\.\(php\\d\?\|phtml\|pht\|phar\|phps\)\$ - \[R=404,L,NC\]/, 'règle des scripts PHP hors de la racine');
            const m = h.match(/<If "%\{REQUEST_URI\} =~ m#\/media\/\.\*\\\.\(([^)]+)\)\$#i">([\s\S]*?)<\/If>/);
            assert.ok(m, 'bloc media/ absent');
            for (const ext of ['html?', 'svgz?', 'xml', 'js']) assert.ok(m[1].split('|').includes(ext), ext);
            assert.match(m[2], /Content-Security-Policy "sandbox/);
            assert.match(m[2], /Content-Disposition "attachment"/);
            assert.match(m[2], /nosniff/);
        });

        await step('serveur intégré (router.php) : un .html, .svg, .php ou .js rangé dans media/ part en téléchargement brut, jamais interprété', async () => {
            for (const [f, body] of [['page.html', '<script>alert(1)</script>'], ['dessin.svg', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], ['x.php', '<?php echo "PWN";'], ['y.js', 'alert(1)']]) {
                fs.writeFileSync(path.join(MEDIA, 'essai-' + f), body);
                const r = await get('media/essai-' + f);
                assert.equal(r.status, 200, f);
                assert.equal(r.headers.get('content-type'), 'application/octet-stream', f);
                assert.equal(r.headers.get('x-content-type-options'), 'nosniff', f);
                assert.ok(!r.text.includes('PWN') || r.text.includes('<?php'), f + ' : exécuté');
                fs.unlinkSync(path.join(MEDIA, 'essai-' + f));
            }
        });

        // ── 5. CSV ──
        await step('« Qui a vu quoi » en CSV : tabulation, retour chariot, =, +, -, @ en tête de cellule sont désamorcés', async () => {
            exec(`INSERT INTO access_log(at,kind,obj_type,obj_id,obj_label,what,machine) VALUES('2026-11-25 10:00','export','person',1,char(9)||'=HYPERLINK("http://evil/")','-1+cmd|'' /C calc''!A0','@SUM(1)');
                  INSERT INTO access_log(at,kind,obj_type,obj_id,obj_label,what,machine) VALUES('2026-11-25 10:01','export','person',1,char(13)||'=1+1','+1','-12');`);
            const r = await get('api.php?action=access_log_csv');
            assert.equal(r.status, 200, r.text.slice(0, 200));
            const cells = r.text.split(/;|\r\n/).map(c => c.replace(/^"|"$/g, ''));
            const bad = cells.filter(c => /^[=+\-@\t\r]/.test(c) && !/^-?\d+$/.test(c));
            assert.deepEqual(bad, [], 'cellules dangereuses : ' + JSON.stringify(bad));
            assert.ok(r.text.includes("\"'\t=HYPERLINK"), 'tabulation désamorcée');
        });

        await step('CSV fabriqués par la page (état des fonds, état d’un recueil, tableau de bord, activité du dossier) : passent par csvSafe', async () => {
            for (const [f, re] of [['assets/js/heritage-recueil-fonds.js', /const q = v => `"\$\{\(A\(\)\.csvSafe/], ['assets/js/heritage-recueil-etat.js', /const q = v => `"\$\{\(A\(\)\.csvSafe/],
                ['assets/js/app-tableau-de-bord.js', /const safe=window\.LCNDA_APP\.csvSafe/], ['assets/js/heritage-successoral-plus2b.js', /const q = v => `"\$\{\(A\(\)\.csvSafe/]]) {
                assert.match(fs.readFileSync(path.join(appRoot, f), 'utf8'), re, f);
            }
            // csvSafe lui-même : la règle de l'app (assets/js/app.js)
            const src = fs.readFileSync(path.join(appRoot, 'assets/js/app.js'), 'utf8');
            const body = src.slice(src.indexOf('function csvSafe(v){'), src.indexOf('function csvCell(v,'));
            const csvSafe = new Function(body + '; return csvSafe;')();
            for (const v of ['=1+1', '+1+cmd', '-1+HYPERLINK("x")', '@SUM(A1)', '\t=1', '\r=1']) assert.equal(csvSafe(v)[0], "'", JSON.stringify(v));
            for (const v of ['-12', '-12,50', '+33 6 12 34 56 78', 'MAZAUD', 12]) assert.equal(String(csvSafe(v))[0] === "'", false, JSON.stringify(v));
        });

        // ── 6. XSS stocké dans un vrai navigateur ──
        await step('navigateur : la fiche piégée, le livre de famille (HTML, ePub) et la copie « Partager avec la famille » n’exécutent rien', async () => {
            const { chromium } = require('playwright');
            browser = await chromium.launch();
            const page = await browser.newPage();
            page.on('dialog', d => d.dismiss().catch(() => {}));
            const fired = async () => page.evaluate(() => ({ x: top.__x || [], js: [...document.querySelectorAll('a[href]')].filter(a => /^\s*(javascript|data|vbscript):/i.test(a.getAttribute('href'))).map(a => a.getAttribute('href')) }));
            await page.goto(base + '#personnes');
            await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, { timeout: 30000 });
            for (const id of [ids.MAZAUD, ids.LACOMBE]) {
                await page.evaluate(i => window.LCNDA_APP.openPersonById(i), id);
                await page.waitForFunction(i => window.LCNDA_APP.state.currentPerson?.person?.id === i && document.querySelector('.person-page h2'), id, { timeout: 20000 });
                await page.waitForTimeout(800);
                assert.deepEqual(await fired(), { x: [], js: [] }, 'fiche ' + id);
            }
            for (const m of ['personnes', 'listes', 'carte', 'dashboard']) { await page.evaluate(x => window.LCNDA_APP.setModule(x), m); await page.waitForTimeout(700); assert.deepEqual((await fired()).x, [], m); }
            const out = path.join(work, 'navigateur'); fs.mkdirSync(out, { recursive: true });
            const files = [];
            fs.writeFileSync(path.join(out, 'livre.html'), (await get('api.php?action=export_family_book&format=html')).buf); files.push(path.join(out, 'livre.html'));
            for (const [n, b] of Object.entries(unzip((await get('api.php?action=export_family_book&format=epub')).buf))) { if (/\.xhtml$/.test(n)) { const p = path.join(out, 'ep-' + path.basename(n)); fs.writeFileSync(p, b); files.push(p); } }
            const share = unzip((await get('api.php?action=family_share_export')).buf);
            assert.ok(share['index.html'], 'copie « Partager avec la famille » : ' + Object.keys(share).join(', '));
            fs.writeFileSync(path.join(out, 'partage.html'), share['index.html']); files.push(path.join(out, 'partage.html'));
            for (const f of files) {
                const p = await browser.newPage(); p.on('dialog', d => d.dismiss().catch(() => {}));
                await p.goto('file://' + f); await p.waitForTimeout(500);
                await p.evaluate(() => [...document.querySelectorAll('button, [data-id], [data-person]')].slice(0, 30).forEach(e => { try { e.click(); } catch (_) {} }));
                await p.waitForTimeout(500);
                const r = await p.evaluate(() => ({ x: window.__x || [], js: [...document.querySelectorAll('a[href]')].filter(a => /^\s*(javascript|data|vbscript):/i.test(a.getAttribute('href'))).map(a => a.getAttribute('href')) }));
                assert.deepEqual(r, { x: [], js: [] }, path.basename(f));
                await p.close();
            }
        });

        await step('journal du serveur : aucune erreur PHP', async () => {
            const errs = phpLog.split('\n').filter(l => /PHP (Fatal|Warning|Parse|Deprecated)|Uncaught/i.test(l));
            assert.deepEqual(errs, []);
        });
    } finally {
        if (browser) await browser.close().catch(() => {});
        proc.kill();
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    }
    console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
    process.exit(failed ? 1 : 0);
})();
