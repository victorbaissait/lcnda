'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des cartes de photos (lib/photomaps.php, assets/js/heritage-photomaps-time.js) :   node tests/test-photomaps.js
 *  1. lecture des métadonnées sur des fichiers fabriqués ici : JPEG (EXIF GPS, date et heure, décalage horaire, orientation),
 *     PNG (eXIf, gros-boutiste, sud-ouest), WebP (EXIF), HEIC (élément Exif), MP4 (©xyz, mvhd) et MOV (clés QuickTime
 *     ISO6709 + creationdate avec fuseau), fichiers abîmés ; dates C4 avec heure (PHP) ;
 *  2. un vrai « php -S » : créer une carte, importer (placée par le GPS / à placer), ajouter depuis la base, déplacer,
 *     revenir au GPS, date et heure à la main, personnes, retirer puis remettre, supprimer puis remettre, toutes les cartes,
 *     vignettes, menu de choix, jeton CSRF, mode consultation, valeurs forgées ;
 *  3. la frise : pas de lecture (« 1 mois 12 j 3 h 49 min 28 s »…), calcul dans le calendrier, dates avec heure, graduations.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-photomaps-'));
const dir = path.join(tmp, 'data'), fx = path.join(tmp, 'fx');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true }); fs.mkdirSync(fx);
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const php = (code, extra = []) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code, ...extra], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };

/* ─── fabriquer un bloc TIFF (EXIF) ─── */
function tiff({ le = true, orientation = 0, taken = '', offset = '', lat = null, lon = null, alt = null, gpsDate = '', gpsTime = null }) {
    const u16 = n => { const b = Buffer.alloc(2); le ? b.writeUInt16LE(n) : b.writeUInt16BE(n); return b; };
    const u32 = n => { const b = Buffer.alloc(4); le ? b.writeUInt32LE(n >>> 0) : b.writeUInt32BE(n >>> 0); return b; };
    const rat = (num, den) => Buffer.concat([u32(num), u32(den)]);
    const dms = v => { v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = (v - d - m / 60) * 3600; return Buffer.concat([rat(d, 1), rat(m, 1), rat(Math.round(s * 10000), 10000)]); };
    const ascii = s => Buffer.from(s + '\0', 'latin1');
    // ifd : [[tag, type, count, Buffer valeur]] ; les pointeurs (8769, 8825) sont remplis après
    const ifd0 = [], exif = [], gps = [];
    if (orientation) ifd0.push([0x0112, 3, 1, Buffer.concat([u16(orientation), u16(0)])]);
    if (taken) exif.push([0x9003, 2, 20, ascii(taken)]);
    if (offset) exif.push([0x9011, 2, offset.length + 1, ascii(offset)]);
    if (lat !== null) { gps.push([1, 2, 2, ascii(lat < 0 ? 'S' : 'N')], [2, 5, 3, dms(lat)], [3, 2, 2, ascii(lon < 0 ? 'W' : 'E')], [4, 5, 3, dms(lon)]); }
    if (alt !== null) gps.push([5, 1, 1, Buffer.from([alt < 0 ? 1 : 0, 0, 0, 0])], [6, 5, 1, rat(Math.round(Math.abs(alt) * 10), 10)]);
    if (gpsTime) gps.push([7, 5, 3, Buffer.concat(gpsTime.map(x => rat(x, 1)))]);
    if (gpsDate) gps.push([0x1D, 2, 11, ascii(gpsDate)]);
    const size = list => 2 + list.length * 12 + 4 + list.reduce((a, e) => a + (e[3].length > 4 ? e[3].length + (e[3].length % 2) : 0), 0);
    const off0 = 8, offE = off0 + size(ifd0) + (exif.length ? 12 : 0) + (gps.length ? 12 : 0), offG = offE + (exif.length ? size(exif) : 0);
    if (exif.length) ifd0.push([0x8769, 4, 1, u32(offE)]);
    if (gps.length) ifd0.push([0x8825, 4, 1, u32(offG)]);
    ifd0.sort((a, b) => a[0] - b[0]);
    const write = (list, start) => {
        let data = Buffer.alloc(0), dataAt = start + 2 + list.length * 12 + 4;
        const entries = list.map(([tag, type, count, val]) => {
            let field;
            if (val.length <= 4) field = Buffer.concat([val, Buffer.alloc(4 - val.length)]);
            else { field = u32(dataAt + data.length); data = Buffer.concat([data, val, Buffer.alloc(val.length % 2)]); }
            return Buffer.concat([u16(tag), u16(type), u32(count), field]);
        });
        return Buffer.concat([u16(list.length), ...entries, u32(0), data]);
    };
    return Buffer.concat([Buffer.from(le ? 'II' : 'MM', 'latin1'), u16(42), u32(8), write(ifd0, off0), exif.length ? write(exif, offE) : Buffer.alloc(0), gps.length ? write(gps, offG) : Buffer.alloc(0)]);
}
const exifApp1 = t => { const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t]); const h = Buffer.from([0xFF, 0xE1, 0, 0]); h.writeUInt16BE(body.length + 2, 2); return Buffer.concat([h, body]); };
const withExifJpeg = (jpg, t) => Buffer.concat([jpg.subarray(0, 2), exifApp1(t), jpg.subarray(2)]);
const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const pngChunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
const withExifPng = (png, t) => { const iend = png.length - 12; return Buffer.concat([png.subarray(0, 33), pngChunk('eXIf', t), png.subarray(33, iend), png.subarray(iend)]); };
const withExifWebp = (webp, t) => { const d = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t]); const h = Buffer.alloc(8); h.write('EXIF', 0, 'latin1'); h.writeUInt32LE(d.length, 4); const out = Buffer.concat([webp, h, d, Buffer.alloc(d.length % 2)]); out.writeUInt32LE(out.length - 8, 4); return out; };
const box = (type, ...parts) => { const body = Buffer.concat(parts); const h = Buffer.alloc(8); h.writeUInt32BE(body.length + 8); h.write(type, 4, 'latin1'); return Buffer.concat([h, body]); };
const full = (v, f = 0) => Buffer.from([v, (f >> 16) & 255, (f >> 8) & 255, f & 255]);
const be16 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; }, be32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
function heic(t) {
    const exifData = Buffer.concat([be32(0), t]);
    const ftyp = box('ftyp', Buffer.from('heic', 'latin1'), be32(0), Buffer.from('mif1heic', 'latin1'));
    const build = off => box('meta', full(0), box('hdlr', full(0), be32(0), Buffer.from('pict', 'latin1'), Buffer.alloc(12), Buffer.from([0])),
        box('iinf', full(0), be16(2), box('infe', full(2), be16(1), be16(0), Buffer.from('hvc1', 'latin1'), Buffer.from([0])), box('infe', full(2), be16(2), be16(0), Buffer.from('Exif', 'latin1'), Buffer.from([0]))),
        box('iloc', full(0), Buffer.from([0x44, 0x00]), be16(2), be16(1), be16(0), be16(1), be32(off + 8 + exifData.length), be32(4), be16(2), be16(0), be16(1), be32(off + 8), be32(exifData.length)));
    const meta0 = build(0), off = ftyp.length + meta0.length; // mdat juste après
    return Buffer.concat([ftyp, build(off), box('mdat', exifData, Buffer.from('xxxx'))]);
}
function mp4({ xyz = '', created = 0, keys = null }) {
    const mvhd = box('mvhd', full(0), be32(created), be32(created), be32(1000), be32(2500), Buffer.alloc(80));
    const parts = [mvhd];
    if (xyz) parts.push(box('udta', box('©xyz', be16(xyz.length), be16(0x15c7), Buffer.from(xyz, 'latin1'))));
    if (keys) {
        const names = Object.keys(keys);
        const keysBox = box('keys', full(0), be32(names.length), ...names.map(n => Buffer.concat([be32(n.length + 8), Buffer.from('mdta', 'latin1'), Buffer.from(n, 'latin1')])));
        const ilst = box('ilst', ...names.map((n, i) => { const idx = Buffer.alloc(4); idx.writeUInt32BE(i + 1); const data = box('data', be32(1), be32(0), Buffer.from(keys[n], 'utf8')); const hh = Buffer.alloc(8); hh.writeUInt32BE(data.length + 8); idx.copy(hh, 4); return Buffer.concat([hh, data]); }));
        parts.push(box('meta', box('hdlr', full(0), be32(0), Buffer.from('mdta', 'latin1'), Buffer.alloc(12), Buffer.from([0])), keysBox, ilst)); // QuickTime : « meta » sans version
    }
    return Buffer.concat([box('ftyp', Buffer.from('qt  ', 'latin1'), be32(0)), box('mdat', Buffer.alloc(64)), box('moov', ...parts)]);
}
const MAC_EPOCH = 2082844800;

// les images de départ, faites par GD
php(String.raw`$d=$argv[1]; $im=imagecreatetruecolor(320,200); imagefill($im,0,0,imagecolorallocate($im,30,120,200)); imagestring($im,5,20,90,'LCNDA',imagecolorallocate($im,255,255,255));
imagejpeg($im,"$d/base.jpg",85); imagepng($im,"$d/base.png"); if(function_exists('imagewebp')) imagewebp($im,"$d/base.webp",80); echo 'ok';`, [fx]);
const baseJpg = fs.readFileSync(path.join(fx, 'base.jpg'));
const files = {
    gps: withExifJpeg(baseJpg, tiff({ orientation: 6, taken: '2023:07:14 10:22:05', offset: '+02:00', lat: 48.8584, lon: 2.2945, alt: 35 })),
    gps2: withExifJpeg(baseJpg, tiff({ taken: '2023:07:14 18:05:00', lat: 48.8606, lon: 2.3376 })),
    nogps: withExifJpeg(baseJpg, tiff({ taken: '2023:07:15 09:00:00' })),
    plain: baseJpg,
    gpsOnlyTime: withExifJpeg(baseJpg, tiff({ lat: 40.4168, lon: -3.7038, gpsDate: '2022:05:01', gpsTime: [12, 30, 15] })),
    zero: withExifJpeg(baseJpg, tiff({ lat: 0, lon: 0, taken: '0000:00:00 00:00:00' })),
    png: withExifPng(fs.readFileSync(path.join(fx, 'base.png')), tiff({ le: false, lat: -33.8568, lon: 151.2153, taken: '2019:12:31 23:59:59' })),
    heic: heic(tiff({ taken: '2021:03:02 08:15:30', lat: 45.764, lon: 4.8357 })),
    mp4: mp4({ xyz: '+43.2965+005.3698/', created: MAC_EPOCH + Date.UTC(2020, 7, 1, 10, 0, 0) / 1000 }),
    mov: mp4({ created: MAC_EPOCH + 1, keys: { 'com.apple.quicktime.location.ISO6709': '+37.7749-122.4194+010.000/', 'com.apple.quicktime.creationdate': '2018-04-05T16:20:00-0700' } }),
    broken: Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, 0xFF, 0xFF]), Buffer.from('Exif\0\0MM\0*\0\0\0\x08\xff\xff', 'latin1')]),
};
if (fs.existsSync(path.join(fx, 'base.webp'))) files.webp = withExifWebp(fs.readFileSync(path.join(fx, 'base.webp')), tiff({ lat: 51.5007, lon: -0.1246, taken: '2017:06:01 12:00:00' }));
const ext = {mp4: 'mp4', mov: 'mov', png: 'png', heic: 'heic', webp: 'webp'};
for (const [k, b] of Object.entries(files)) fs.writeFileSync(path.join(fx, `${k}.${ext[k] || 'jpg'}`), b);
// une vraie petite vidéo (ffmpeg, si présent) avec un lieu et une date
const ffmpeg = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg'].find(f => fs.existsSync(f));
if (ffmpeg) spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=160x120:rate=10', '-pix_fmt', 'yuv420p', '-metadata', 'location=+44.8378-000.5792/', '-metadata', 'creation_time=2024-02-03T11:12:13Z', path.join(fx, 'real.mp4')]);
const hasReal = ffmpeg && fs.existsSync(path.join(fx, 'real.mp4'));

const meta = JSON.parse(php(String.raw`require 'lib/photomaps.php'; $o=[]; foreach (glob($argv[1].'/*') as $f) { $o[basename($f)] = pm_meta_read($f); }
$dates=[]; foreach (['7 mai 1925 à 14 h 30','12/08/2019 18:42:07','2019-08-12 18:42','14 juillet 2023','vers 1950','avant 1800','entre 1880 et 1885','juillet 1936','an II','années 1950','31 février 2020','14 juillet 2023 à 25 h','n importe quoi'] as $s) { $dates[$s]=pm_date_parse($s); }
echo json_encode(['meta'=>$o,'dates'=>$dates,'frdt'=>pm_fr_datetime('2023-07-14 10:22:05')]);`, [fx]));

/* ─── serveur ─── */
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
{ const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Lucie','Martin','female')"); $p->exec("INSERT INTO persons(first_name,last_name,gender,is_locked) VALUES('Paul','Verrou','male',1)");
$p->exec("INSERT INTO places(name,country,latitude,longitude) VALUES('Rennes','France',48.1173,-1.6778)");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); } }

(async () => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = '') => { const r = await fetch(`${base}api.php?action=${action}${q ? '&' + q : ''}`, { headers: { Cookie: cookie } }); const t = r.headers.get('content-type') || ''; return { status: r.status, type: t, body: t.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) }; };
    const post = async (body, token = csrf) => { const r = await fetch(base + 'api.php?action=photomap_write', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const upload = async (mapId, names, extra = {}) => {
        const fd = new FormData(); names.forEach(n => fd.append('files[]', new Blob([fs.readFileSync(path.join(fx, n))]), n)); fd.append('map_id', String(mapId)); fd.append('csrf', csrf);
        Object.entries(extra).forEach(([k, v]) => fd.append(k, String(v)));
        const r = await fetch(base + 'api.php?action=photomap_upload', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd }); return { status: r.status, body: await r.json() };
    };
    const out = {};
    try {
        out.empty = await get('photomaps');
        out.allEmpty = await get('photomap_all');
        out.create = await post({ op: 'save_map', name: 'Vacances <b>2023</b>\'); DROP TABLE media;--', description: 'Paris', color: '#CC4700', period_text: 'juillet 2023', shape: 'square', show_track: true, person_id: 1 });
        const mapId = out.create.body.map?.id;
        out.badPeriod = await post({ op: 'save_map', name: 'X', period_text: 'pas une date' });
        out.noName = await post({ op: 'save_map', name: '   ' });
        out.badPerson = await post({ op: 'save_map', name: 'Y', person_id: 999 });
        out.up = await upload(mapId, ['gps.jpg', 'nogps.jpg', 'plain.jpg', 'heic.heic', ...(hasReal ? ['real.mp4'] : [])]);
        out.upDrop = await upload(mapId, ['gps2.jpg', 'png.png'], { drop_lat: 47.2, drop_lon: -1.55 });
        out.one = await get('photomap', `id=${mapId}`);
        const items = out.one.body.items || [];
        const byTitle = t => items.find(i => i.title === t);
        out.items = { gps: byTitle('gps'), nogps: byTitle('nogps'), plain: byTitle('plain'), real: byTitle('real'), png: byTitle('png') };
        // ajouter depuis la base : un média déjà là (et un PDF, ignoré)
        php(String.raw`require 'lib/bootstrap.php'; $p=db(); copy($argv[1].'/gpsOnlyTime.jpg', MEDIA_DIR.'/base1.jpg'); $p->exec("INSERT INTO media(title,media_type,filename,thumbnail) VALUES('déjà là','image','base1.jpg','base1.jpg')"); $p->exec("INSERT INTO media(title,media_type,filename) VALUES('un pdf','pdf','x.pdf')"); echo 'ok';`, [fx]);
        const ids = (await get('picker_search', 'kind=media&q=' + encodeURIComponent('déjà'))).body.groups?.[0]?.items?.map(i => i.id) || [];
        const pdfId = (await get('picker_search', 'kind=media&q=pdf')).body.groups?.[0]?.items?.[0]?.id;
        out.add = await post({ op: 'add_media', map_id: mapId, media_ids: [...ids, pdfId, 'x', -3] });
        out.addAgain = await post({ op: 'add_media', map_id: mapId, media_ids: ids });
        // déplacer, revenir au GPS, date et heure, personnes, lieu
        const g = out.items.gps;
        out.move = await post({ op: 'update_item', id: g.id, lat: 48.85, lon: 2.35, src: 'manual' });
        out.reset = await post({ op: 'reset_gps', id: g.id });
        out.resetNoGps = await post({ op: 'reset_gps', id: out.items.plain.id });
        out.date = await post({ op: 'update_item', id: out.items.plain.id, date_text: '7 mai 1925 à 14 h 30', caption: 'La noce\nde Lucie', people: [1], place_id: 1 });
        out.badDate = await post({ op: 'update_item', id: out.items.plain.id, date_text: '31 février 2020' });
        out.locked = await post({ op: 'update_item', id: out.items.plain.id, people: [1, 2] });
        out.badCoords = await post({ op: 'update_item', id: out.items.plain.id, lat: 123, lon: 4 });
        out.unplace = await post({ op: 'update_item', id: g.id, lat: null, lon: null });
        out.replace = await post({ op: 'update_item', id: g.id, lat: 48.8584, lon: 2.2945, src: 'gps' });
        out.longCaption = await post({ op: 'update_item', id: g.id, caption: 'x'.repeat(5000) });
        out.badId = await post({ op: 'update_item', id: 99999, caption: 'x' });
        // retirer puis remettre ; supprimer la carte puis la remettre
        out.remove = await post({ op: 'remove_items', ids: [out.items.nogps.id] });
        out.afterRemove = await get('photomap', `id=${mapId}`);
        out.restore = await post({ op: 'restore_items', ids: [out.items.nogps.id] });
        out.afterRestore = await get('photomap', `id=${mapId}`);
        out.map2 = await post({ op: 'save_map', name: 'Bordeaux', color: '#2f8f5b' });
        await upload(out.map2.body.map.id, ['webp.webp'].filter(n => fs.existsSync(path.join(fx, n))).concat(['gps.jpg']));
        out.all = await get('photomap_all');
        out.list = await get('photomaps');
        out.del = await post({ op: 'delete_map', id: out.map2.body.map.id });
        out.listDel = await get('photomaps');
        out.undel = await post({ op: 'restore_map', id: out.map2.body.map.id });
        out.listUndel = await get('photomaps');
        out.thumb = await get('photomap_thumb', `m=${g.media_id}`);
        out.thumbVid = out.items.real ? await get('photomap_thumb', `m=${out.items.real.media_id}`) : null;
        out.thumbBad = await get('photomap_thumb', 'm=999999');
        out.picker = await get('picker_search', 'kind=photomap&q=vacances');
        out.pickerIds = await get('picker_search', `kind=photomap&ids=${mapId}`);
        // sécurité
        out.noCsrf = await post({ op: 'save_map', name: 'Z' }, '');
        out.badOp = await post({ op: 'drop' });
        out.badRefuse = await upload(mapId, ['broken.jpg']);
        fs.writeFileSync(path.join(fx, 'evil.php.jpg'), '<?php echo 1; ?>');
        out.evil = await upload(mapId, ['evil.php.jpg']);
        out.missing = await get('photomap', 'id=424242');
        fs.writeFileSync(path.join(dir, 'consultation.json'), JSON.stringify({ hash: '$2y$10$abcdefghijklmnopqrstuuWzGmJ1kGQ5JvH4sCq3zN6E1i0YqM6xG', since: 'x' }));
        out.kioskGet = await get('photomap', `id=${mapId}`);
        out.kioskPost = await post({ op: 'save_map', name: 'K' });
        out.kioskUp = await upload(mapId, ['gps.jpg']);
        fs.unlinkSync(path.join(dir, 'consultation.json'));
        out.mapId = mapId;
    } finally { proc.kill(); }

    /* ─── la frise (navigateur, sans page) ─── */
    const w = {}; vm.runInNewContext(fs.readFileSync(path.join(appRoot, 'assets/js/heritage-photomaps-time.js'), 'utf8'), { window: w });
    const T = w.LCNDA_PMTIME, iso = t => T.tToIso(t, true);

    const M = meta.meta;
    const near = (a, b, e = 1e-4) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);
    const checks = [
        ['JPEG : GPS, date et heure de prise de vue, décalage horaire, orientation, altitude', () => { const m = M['gps.jpg']; near(m.lat, 48.8584); near(m.lon, 2.2945); assert.equal(m.taken, '2023-07-14 10:22:05'); assert.equal(m.tz, '+02:00'); assert.equal(m.orientation, 6); assert.equal(m.alt, 35); }],
        ['JPEG sans GPS : la date seule ; JPEG sans EXIF : rien', () => { assert.equal(M['nogps.jpg'].taken, '2023-07-15 09:00:00'); assert.equal(M['nogps.jpg'].lat, undefined); assert.deepEqual(M['plain.jpg'], []); }],
        ['heure GPS (temps universel) ramenée à l’heure locale estimée d’après la longitude', () => { const m = M['gpsOnlyTime.jpg']; near(m.lat, 40.4168); assert.equal(m.taken, '2022-05-01 12:30:15'); assert.equal(m.tz, '~+00:00'); }],
        ['GPS à 0,0 et date « 0000:00:00 » : ignorés', () => assert.deepEqual(M['zero.jpg'], [])],
        ['PNG (eXIf gros-boutiste, hémisphère sud)', () => { const m = M['png.png']; near(m.lat, -33.8568); near(m.lon, 151.2153); assert.equal(m.taken, '2019-12-31 23:59:59'); }],
        ['WebP (EXIF)', () => { if (!M['webp.webp']) return; near(M['webp.webp'].lat, 51.5007); near(M['webp.webp'].lon, -0.1246); }],
        ['HEIC (élément Exif, iloc)', () => { const m = M['heic.heic']; near(m.lat, 45.764); near(m.lon, 4.8357); assert.equal(m.taken, '2021-03-02 08:15:30'); }],
        ['MP4 : ©xyz, durée, date de création (UTC → heure locale estimée)', () => { const m = M['mp4.mp4']; near(m.lat, 43.2965); near(m.lon, 5.3698); assert.equal(m.duration, 2.5); assert.equal(m.taken, '2020-08-01 10:00:00'); assert.equal(m.tz, '~+00:00'); }],
        ['MOV : clés QuickTime ISO6709 et creationdate avec fuseau (heure locale gardée)', () => { const m = M['mov.mov']; near(m.lat, 37.7749); near(m.lon, -122.4194); assert.equal(m.taken, '2018-04-05 16:20:00'); assert.equal(m.tz, '-07:00'); }],
        ['vraie vidéo ffmpeg (si présent) : lieu et date lus', () => { if (!hasReal) return; const m = M['real.mp4']; near(m.lat, 44.8378); near(m.lon, -0.5792); assert.ok(m.taken.startsWith('2024-02-03 11:12:13')); assert.ok(m.duration > 1.5); }],
        ['fichier abîmé : rien, sans erreur', () => assert.deepEqual(M['broken.jpg'], [])],
        ['dates C4 avec heure (PHP)', () => { const d = meta.dates; assert.deepEqual(d['7 mai 1925 à 14 h 30'], { from: '1925-05-07', to: '1925-05-07', prec: 'time', time: '14:30:00' }); assert.equal(d['12/08/2019 18:42:07'].time, '18:42:07'); assert.equal(d['2019-08-12 18:42'].time, '18:42:00');
            assert.equal(d['14 juillet 2023'].prec, 'day'); assert.equal(d['vers 1950'].prec, 'approx'); assert.deepEqual([d['entre 1880 et 1885'].from, d['entre 1880 et 1885'].to], ['1880-01-01', '1885-12-31']); assert.equal(d['juillet 1936'].to, '1936-07-31');
            assert.equal(d['an II'].from, '1793-09-22'); assert.equal(d['années 1950'].to, '1959-12-31'); assert.equal(d['31 février 2020'], null); assert.equal(d['14 juillet 2023 à 25 h'], null); assert.equal(d['n importe quoi'], null); assert.equal(meta.frdt, '14 juillet 2023 à 10:22:05'); }],
        ['base neuve : aucune carte', () => { assert.deepEqual(out.empty.body.maps, []); assert.deepEqual(out.allEmpty.body.items, []); }],
        ['créer une carte : texte gardé tel quel (pas de SQL), couleur, période, personne', () => { const m = out.create.body.map; assert.equal(m.name, 'Vacances <b>2023</b>\'); DROP TABLE media;--'); assert.equal(m.color, '#cc4700'); assert.equal(m.period_from, '2023-07-01'); assert.equal(m.period_to, '2023-07-31'); assert.equal(m.person_name, 'Lucie Martin'); assert.equal(m.shape, 'square'); }],
        ['carte forgée : refusée', () => { assert.equal(out.badPeriod.status, 422); assert.equal(out.noName.status, 422); assert.equal(out.badPerson.status, 404); }],
        ['import : placé par le GPS, ou dans « À placer » ; date et heure de prise de vue', () => {
            const u = out.up.body; assert.equal(u.ok, true); assert.equal(u.imported.length, hasReal ? 4 : 3); assert.equal(u.placed, hasReal ? 2 : 1); assert.equal(u.unplaced, 2);
            const g = out.items.gps; near(g.lat, 48.8584); assert.equal(g.src, 'gps'); assert.equal(g.taken, '2023-07-14 10:22:05'); assert.equal(g.tz, '+02:00'); assert.equal(g.date_text, '14 juillet 2023 à 10:22:05'); assert.equal(g.date_src, 'exif'); assert.deepEqual(g.gps, [48.8584, 2.2945]);
            assert.equal(out.items.nogps.lat, null); assert.equal(out.items.nogps.taken, '2023-07-15 09:00:00'); assert.equal(out.items.plain.date_text, '');
        }],
        ['HEIC sans outil de conversion : refusé avec une explication (ou converti)', () => { const r = out.up.body.refused.find(x => x.name === 'heic.heic'); if (r) assert.match(r.reason, /HEIC/); }],
        ['vidéo importée : sorte vidéo, durée, vignette ffmpeg', () => { if (!out.items.real) return; assert.equal(out.items.real.kind, 'video'); near(out.items.real.lat, 44.8378); assert.ok(out.items.real.dur > 1.5); assert.equal(out.thumbVid.status, 200); assert.match(out.thumbVid.type, /image\/jpeg/); }],
        ['déposé à un endroit de la carte : posé là s’il n’a pas de GPS ; le GPS gagne sinon', () => { assert.equal(out.upDrop.body.placed, 2); const png = out.items.png; near(png.lat, -33.8568); const g2 = (out.one.body.items || []).find(i => i.title === 'gps2'); near(g2.lat, 48.8606); }],
        ['ajouter depuis la base : placé par le GPS ; un PDF ou un id forgé ignoré ; pas de doublon', () => { assert.equal(out.add.body.added.length, 1); assert.equal(out.add.body.placed, 1); assert.equal(out.add.body.skipped, 1); assert.equal(out.addAgain.body.already, 1); assert.equal(out.addAgain.body.added.length, 0); }],
        ['déplacer puis revenir au GPS ; sans GPS : refusé', () => { assert.equal(out.move.body.item.src, 'manual'); near(out.move.body.item.lat, 48.85); assert.deepEqual(out.move.body.item.gps, [48.8584, 2.2945]); assert.equal(out.reset.body.item.src, 'gps'); near(out.reset.body.item.lat, 48.8584); assert.equal(out.resetNoGps.status, 422); }],
        ['date et heure à la main, légende, personne, lieu', () => { const it = out.date.body.item; assert.equal(it.taken, '1925-05-07 14:30:00'); assert.equal(it.from, '1925-05-07'); assert.equal(it.date_src, 'manual'); assert.equal(it.caption, 'La noce\nde Lucie'); assert.deepEqual(it.people, [{ id: 1, name: 'Lucie Martin' }]); assert.equal(it.place_name, 'Rennes'); }],
        ['date impossible, fiche verrouillée, position impossible, élément inconnu : refusés', () => { assert.equal(out.badDate.status, 422); assert.equal(out.locked.status, 422); assert.match(out.locked.body.error, /verrouillée/); assert.equal(out.badCoords.status, 422); assert.equal(out.badId.status, 404); }],
        ['remettre dans « À placer », reposer ; légende bornée', () => { assert.equal(out.unplace.body.item.lat, null); assert.equal(out.replace.body.item.src, 'gps'); assert.equal(out.longCaption.body.item.caption.length, 1000); }],
        ['retirer puis remettre (↶ Annuler)', () => { assert.equal(out.remove.body.count, 1); assert.ok(!out.afterRemove.body.items.some(i => i.id === out.items.nogps.id)); assert.equal(out.restore.body.count, 1); assert.ok(out.afterRestore.body.items.some(i => i.id === out.items.nogps.id)); }],
        ['toutes les cartes : les éléments des deux cartes ; résumés (nombres, période, vignettes)', () => {
            const maps = out.all.body.maps; assert.equal(maps.length, 2); assert.ok(out.all.body.items.some(i => i.map_id === out.map2.body.map.id)); assert.ok(out.all.body.items.some(i => i.map_id === out.mapId));
            const m = out.list.body.maps.find(x => x.id === out.mapId); assert.ok(m.photos >= 5); assert.equal(m.videos, hasReal ? 1 : 0); assert.ok(m.thumbs.length >= 1 && m.thumbs.length <= 4); assert.equal(m.from, '1925-05-07');
        }],
        ['supprimer une carte puis la remettre (↶ Annuler)', () => { assert.equal(out.listDel.body.maps.length, 1); assert.equal(out.listUndel.body.maps.length, 2); }],
        ['vignette : petite image JPEG, tournée selon l’EXIF ; média inconnu : 404', () => { assert.equal(out.thumb.status, 200); assert.match(out.thumb.type, /image\/jpeg/); assert.ok(out.thumb.body.length < 40000); assert.equal(out.thumbBad.status, 404);
            const dims = php(String.raw`$s=getimagesizefromstring(file_get_contents($argv[1])); echo $s[0].'x'.$s[1];`, [(() => { const f = path.join(fx, 'thumb.jpg'); fs.writeFileSync(f, out.thumb.body); return f; })()]); assert.equal(dims, '150x240'); }],
        ['menu de choix : sorte « photomap »', () => { const it = out.picker.body.groups[0].items[0]; assert.equal(it.kind, 'photomap'); assert.equal(it.id, out.mapId); assert.match(it.meta, /photos/); assert.equal(out.pickerIds.body.groups[0].items.length, 1); }],
        ['sécurité : sans jeton CSRF, opération inconnue, fichier qui n’est pas une image, carte inconnue', () => { assert.equal(out.noCsrf.status, 419); assert.equal(out.badOp.status, 422); assert.equal(out.badRefuse.body.imported.length, 0); assert.equal(out.evil.body.imported.length, 0); assert.match(out.evil.body.refused[0].reason, /format/); assert.equal(out.missing.status, 404); }],
        ['mode consultation : lecture permise, écriture et import refusés', () => { assert.equal(out.kioskGet.status, 200); assert.equal(out.kioskPost.status, 423); assert.equal(out.kioskUp.status, 423); }],
        ['frise : pas de lecture compris', () => {
            const ok = (s, step, label) => { const r = T.parseStep(s); assert.equal(r.ok, true, s); Object.entries(step).forEach(([k, v]) => assert.equal(r.step[k], v, `${s} ${k}`)); if (label) assert.equal(r.label, label); };
            ok('3j', { d: 3 }, '3 jours'); ok('3 j', { d: 3 }); ok('1 mois 12 jours 3 heures 49 minutes 28 secondes', { mo: 1, d: 12, h: 3, mi: 49, s: 28 }, '1 mois 12 jours 3 h 49 min 28 s');
            ok('1 mois 12 j 3 h 49 min 28 s', { mo: 1, d: 12, h: 3, mi: 49, s: 28 }); ok('2 ans 6 mois', { y: 2, mo: 6 }, '2 ans 6 mois'); ok('90 min', { mi: 90 }, '90 min'); ok('1h30', { h: 1, mi: 30 }); ok('1 sem', { w: 1 }, '1 semaine'); ok('10 ans', { y: 10 }); ok('1,5 j', { d: 1, h: 12 }); ok('2 h et 15 min', { h: 2, mi: 15 });
            for (const bad of ['5', '3 zorg', '0 j', '1,5 mois', 'demain']) assert.equal(T.parseStep(bad).ok, false, bad);
            assert.equal(T.parseStep(''), null);
        }],
        ['frise : mois et années dans le calendrier', () => {
            assert.equal(iso(T.addStep(T.utc(2023, 1, 31), { mo: 1 })), '2023-02-28 00:00:00'); assert.equal(iso(T.addStep(T.utc(2024, 1, 31), { mo: 1 })), '2024-02-29 00:00:00');
            assert.equal(iso(T.addStep(T.utc(2024, 2, 29), { y: 1 })), '2025-02-28 00:00:00'); assert.equal(iso(T.addStep(T.utc(2023, 3, 31, 10), { mo: 1 }, -1)), '2023-02-28 10:00:00');
            assert.equal(iso(T.addStep(T.utc(2023, 1, 31, 23, 30), { mo: 1, d: 12, h: 3, mi: 49, s: 28 })), '2023-03-13 03:19:28');
            assert.equal(iso(T.addStep(T.utc(1899, 12, 31), { d: 1 })), '1900-01-01 00:00:00'); assert.equal(iso(T.addStep(T.utc(50, 6, 1), { y: 1 })), '0051-06-01 00:00:00');
        }],
        ['frise : dates avec heure, sans heure à midi, vagues au milieu', () => {
            assert.equal(iso(T.parseDate('7 mai 1925 à 14 h 30').t), '1925-05-07 14:30:00'); assert.equal(iso(T.parseDate('12/08/2019 18:42:07').t), '2019-08-12 18:42:07'); assert.equal(iso(T.parseDate('14 juillet 2023').t), '2023-07-14 12:00:00');
            assert.equal(T.parseDate('31/02/2020'), null); assert.equal(T.parseDate('14 juillet 2023 à 24 h'), null);
            const ex = T.itemTime({ taken: '2023-07-14 10:22:05', from: '2023-07-14' }); assert.equal(ex.exact, true); assert.equal(iso(ex.t), '2023-07-14 10:22:05');
            const day = T.itemTime({ from: '2023-07-14', to: '2023-07-14' }); assert.equal(day.exact, false); assert.equal(iso(day.t), '2023-07-14 12:00:00');
            assert.equal(T.itemTime({}), null);
        }],
        ['frise : graduations qui suivent le zoom (minutes sur une heure, années sur un siècle)', () => {
            const h = T.unitFor(T.HOUR); assert.equal(h[0], 'mi'); assert.equal(JSON.stringify(T.ticks(T.utc(2020, 1, 1, 10), T.utc(2020, 1, 1, 11), h).map(t => T.tickLabel(t, h)).slice(0, 3)), JSON.stringify(['10 h 00', '10 h 15', '10 h 30']));
            const c = T.unitFor(100 * 365.25 * T.DAY); assert.equal(c[0], 'y'); assert.equal(T.tickLabel(T.ticks(T.utc(1900, 1, 1), T.utc(2000, 1, 1), c)[1], c), String(1900 + c[1]));
            assert.equal(T.unitFor(30 * T.SEC)[0], 's'); assert.equal(T.bucketUnit('mo', 1e12)[0], 'mo');
        }],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
