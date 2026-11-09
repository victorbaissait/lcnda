/* LCNDA — 📷 Lecture des métadonnées des photos à importer (⤒ Importer des photos : heritage-photos-import.js).
 * Tout se lit ici, dans le navigateur (et dans Node pour les essais : require('./app-photos-meta.js')) ; rien ne part sur internet.
 *   - Google Photos (Takeout) : le .json posé à côté de chaque photo (« IMG_1234.JPG.json », « …supplemental-metadata.json »,
 *     noms coupés à 46 ou 51 lettres, « IMG_1234(1).JPG » ↔ « IMG_1234.JPG(1).json », « -modifié » / « -edited ») :
 *     date de prise (photoTakenTime), lieu (geoData), description, personnes nommées (people) ; titre de l'album (metadata.json) ;
 *   - Apple Photos (« Exporter » avec titre, mots-clés, légende et lieu) et tout logiciel qui écrit XMP / IPTC / EXIF :
 *     XMP dans le JPEG ou le PNG, ou à côté (« IMG_1234.xmp »), IPTC (APP13), EXIF (date, GPS, description) ;
 *   - un ZIP lu par le seul lecteur de ZIP de l'app (LCNDA_SHEET.unzip : bornes de taille, bombe zip) ; un chemin « ../ »,
 *     absolu ou avec « \ » fait refuser tout le fichier.
 * XML lu par LCNDA_SHEET.parseXml (refuse DOCTYPE et ENTITY). Rien n'est relié tout seul : ce module ne fait que lire.
 */
(function (root, factory) {
    const S = (root && root.LCNDA_SHEET) || (typeof require === 'function' ? require('./app-tableur-engine.js') : null);
    const M = factory(S);
    if (typeof module === 'object' && module.exports) module.exports = M;
    if (root) root.LCNDA_PHOTOMETA = M;
})(typeof window !== 'undefined' ? window : null, function (S) {
    'use strict';
    const LIMITS = {zipBytes: 1024 * 1048576, zipTotal: 4096 * 1048576, zipEntry: 1024 * 1048576, zipEntries: 60000, files: 2000, sidecar: 2 * 1048576};
    const MEDIA = /\.(jpe?g|png|webp|gif|avif|mp4|mov)$/i, SKIP = /\.(heic|heif|dng|cr2|nef|arw|raf|orf|rw2|tiff?|3gp|mkv|avi|mts|m2ts|wmv)$/i;
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const JUNK_DESC = /^(sony dsc|olympus digital camera|default|image|photo|picture|digital camera|samsung|lg electronics|exif_jpeg_picture|exif jpeg picture|ricoh|minolta dsc|kodak.*|corel.*)$/i;
    const clean = v => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    const cleanText = v => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim();

    /* ── chemins ── */
    /** un chemin d'archive acceptable : ni « .. », ni absolu, ni « \ », ni caractère de contrôle */
    function safePath(name) {
        const n = String(name ?? '');
        if (!n || n.length > 1024 || /[\u0000-\u001f\\]/.test(n) || n.startsWith('/') || /^[a-z]:/i.test(n)) return false;
        return !n.split('/').some(seg => seg === '..' || seg === '.');
    }
    const baseName = p => String(p).split('/').pop();
    const dirName = p => { const i = String(p).lastIndexOf('/'); return i < 0 ? '' : String(p).slice(0, i); };
    const isMedia = p => MEDIA.test(p) && !baseName(p).startsWith('._') && !/(^|\/)__MACOSX\//.test(p);
    const isSkipped = p => SKIP.test(p) && !baseName(p).startsWith('._');

    /* ── dates ── */
    const pad = n => String(n).padStart(2, '0');
    /** « 2019:07:14 10:22:05 », « 2019-07-14T10:22:05+02:00 », « 20190714 » → « 2019-07-14 10:22:05 » (ou « 2019-07-14 », « 2019-07 », « 2019 ») */
    function isoDate(v) {
        const s = clean(v); if (!s) return '';
        let m = s.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if (m) { const [y, mo, d] = [+m[1], +m[2], +m[3]]; if (y < 1826 || mo < 1 || mo > 12 || d < 1 || d > 31 || (y === 0)) return ''; return `${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ${m[4]}:${m[5]}:${m[6] || '00'}` : ''}`; }
        m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
        m = s.match(/^(\d{4})-(\d{2})$/); if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2]}`;
        m = s.match(/^(\d{4})$/); if (m && +m[1] >= 1826) return m[1];
        return '';
    }
    /** « 2019-07-14 10:22:05 » → « 14 juillet 2019 » (comme une date d'acte : C4) */
    function frDate(iso) {
        const m = String(iso || '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/); if (!m) return '';
        if (!m[2]) return m[1];
        const mo = MONTHS[+m[2] - 1]; if (!mo) return m[1];
        return m[3] ? `${+m[3] === 1 ? '1er' : +m[3]} ${mo} ${m[1]}` : `${mo} ${m[1]}`;
    }
    /** horodatage UTC (secondes) → heure locale approchée d'après la longitude (sinon UTC) */
    function fromTimestamp(ts, lon) {
        const n = Number(ts); if (!Number.isFinite(n) || n === 0 || n < -4.6e9) return ''; // avant 1970 : horodatage négatif (photo ancienne scannée)
        const off = Number.isFinite(lon) ? Math.round(lon / 15) * 3600 : 0, d = new Date((n + off) * 1000);
        if (d.getUTCFullYear() < 1826) return '';
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    }
    const goodCoord = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

    /* ── Google Photos (Takeout) ── */
    /** le .json d'une photo de Google Photos → {title, description, taken, lat, lon, people[], url} ; null si ce n'en est pas un */
    function parseTakeoutJson(text) {
        let j; try { j = JSON.parse(String(text)); } catch (_) { return null; }
        if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
        if (!j.photoTakenTime && !j.creationTime && !j.geoData && !j.people && !('imageViews' in j)) return null;
        const geo = [j.geoData, j.geoDataExif].find(g => g && goodCoord(Number(g.latitude), Number(g.longitude)));
        const lat = geo ? Number(geo.latitude) : null, lon = geo ? Number(geo.longitude) : null;
        const taken = fromTimestamp(j.photoTakenTime?.timestamp, lon ?? undefined);
        const people = (Array.isArray(j.people) ? j.people : []).map(p => clean(p?.name)).filter(Boolean).slice(0, 40);
        return {title: clean(j.title).slice(0, 300), description: cleanText(j.description).slice(0, 20000), taken, takenUtc: !geo && !!taken, lat, lon, people,
            url: /^https:\/\/photos\.google\.com\//.test(String(j.url || '')) ? String(j.url) : ''};
    }
    /** metadata.json d'un album de Google Photos → titre de l'album */
    function parseAlbumJson(text) {
        let j; try { j = JSON.parse(String(text)); } catch (_) { return ''; }
        return j && typeof j === 'object' && !j.photoTakenTime ? clean(j.title || j.albumData?.title).slice(0, 80) : '';
    }
    const EDITED = /-(edited|modifié|modifie|bearbeitet|editado|modificato|bewerkt|編集済み)(?=\.[^.]+$)/i;
    /** sépare « IMG_1234(1).JPG » → {base: 'IMG_1234.JPG', idx: '(1)'} */
    function splitIdx(name) { const m = name.match(/^(.*?)(\(\d+\))(\.[^.]+)$/); return m ? {base: m[1] + m[3], idx: m[2]} : {base: name, idx: ''}; }
    /**
     * Associe chaque photo à son .json (Takeout) et à son .xmp (Apple Photos, Lightroom…) dans le même dossier.
     * paths : tous les chemins → Map(chemin de la photo → {json, xmp, album}) (json, xmp, album : chemins ou '').
     */
    function pairSidecars(paths) {
        const byDir = new Map();
        paths.forEach(p => { const d = dirName(p); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(p); });
        const out = new Map();
        for (const [dir, list] of byDir) {
            const jsons = list.filter(p => /\.json$/i.test(p) && !/(^|\/)(metadata|métadonnées|print-subscriptions|shared_album_comments|user-generated-memory-titles)\.json$/i.test(p));
            const album = list.find(p => /(^|\/)(metadata|métadonnées)\.json$/i.test(p)) || '';
            const xmps = new Map(list.filter(p => /\.xmp$/i.test(p)).map(p => [baseName(p).replace(/\.xmp$/i, '').toLowerCase(), p]));
            const keys = jsons.map(p => { const k = baseName(p).replace(/\.json$/i, ''); const m = k.match(/^(.*?)(\(\d+\))$/); return {p, key: (m ? m[1] : k), idx: m ? m[2] : ''}; });
            for (const p of list.filter(isMedia)) {
                const name = baseName(p), {base, idx} = splitIdx(name), orig = base.replace(EDITED, '');
                const want = [orig, `${orig}.supplemental-metadata`];
                let best = null;
                for (const k of keys) {
                    if (k.idx !== idx) continue;
                    const exact = want.includes(k.key) || k.key === orig.replace(/\.[^.]+$/, '');
                    const cut = !exact && k.key.length >= 30 && (want[1].startsWith(k.key) || orig.replace(/\.[^.]+$/, '').startsWith(k.key));
                    if ((exact || cut) && (!best || exact && !best.exact || (exact === best.exact && k.key.length > best.key.length))) best = {...k, exact};
                }
                const noExt = name.replace(/\.[^.]+$/, '').toLowerCase();
                out.set(p, {json: best ? best.p : '', xmp: xmps.get(name.toLowerCase()) || xmps.get(noExt) || xmps.get(orig.replace(/\.[^.]+$/, '').toLowerCase()) || '', album, dir});
            }
        }
        return out;
    }

    /* ── XMP ── */
    const NS = {dc: 'http://purl.org/dc/elements/1.1/', ps: 'http://ns.adobe.com/photoshop/1.0/', exif: 'http://ns.adobe.com/exif/1.0/', xmp: 'http://ns.adobe.com/xap/1.0/',
        core: 'http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/', ext: 'http://iptc.org/std/Iptc4xmpExt/2008-02-29/', mwg: 'http://www.metadataworkinggroup.com/schemas/regions/',
        mp: 'http://ns.microsoft.com/photo/1.2/t/RegionInfo#', mpr: 'http://ns.microsoft.com/photo/1.2/t/Region#', rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'};
    /** « 48,51.5N », « 48,51,30N », « 48.858 » → degrés décimaux */
    function xmpCoord(v) {
        const s = clean(v); if (!s) return null;
        const m = s.match(/^(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?(?:,(\d+(?:\.\d+)?))?\s*([NSEW])?$/i); if (!m) return null;
        let d = Math.abs(+m[1]) + (m[2] ? +m[2] / 60 : 0) + (m[3] ? +m[3] / 3600 : 0);
        if (+m[1] < 0 || /[SW]/i.test(m[4] || '')) d = -d;
        return Number.isFinite(d) ? d : null;
    }
    /** un paquet XMP (texte) → {title, description, keywords[], taken, lat, lon, city, state, country, sublocation, people[]} ; {} s'il est illisible */
    function parseXmp(src) {
        let t = String(src || ''); if (!S?.parseXml) return {};
        if (/<!DOCTYPE|<!ENTITY/i.test(t)) return {refused: true}; // XML piégé (entités) : jamais lu
        const a = t.indexOf('<x:xmpmeta'), b = t.lastIndexOf('</x:xmpmeta>'); if (a >= 0 && b > a) t = t.slice(a, b + 12);
        else { const r1 = t.indexOf('<rdf:RDF'), r2 = t.lastIndexOf('</rdf:RDF>'); if (r1 >= 0 && r2 > r1) t = t.slice(r1, r2 + 10); }
        t = t.replace(/<\?xpacket[^>]*\?>/g, '');
        if (t.length > LIMITS.sidecar) return {};
        let doc; try { doc = S.parseXml(t); } catch (_) { return {}; }
        // espaces de noms : préfixe → adresse (déclarés n'importe où dans le paquet)
        const pre = {}; const walk = (el, fn) => { if (!el || typeof el !== 'object') return; fn(el); (el.c || []).forEach(x => walk(x, fn)); };
        walk(doc, el => Object.entries(el.a || {}).forEach(([k, v]) => { if (k.startsWith('xmlns:')) pre[k.slice(6)] = v; }));
        const qn = n => { const i = n.indexOf(':'); return i < 0 ? ['', n] : [pre[n.slice(0, i)] || n.slice(0, i), n.slice(i + 1)]; };
        const is = (n, ns, local) => { const [u, l] = qn(n); return u === ns && l === local; };
        const text = el => (el == null ? '' : typeof el === 'string' ? el : (el.c || []).map(text).join(''));
        const descs = []; walk(doc, el => { if (is(el.n || '', NS.rdf, 'Description')) descs.push(el); });
        const lis = el => { const out = []; walk(el, x => { if (is(x.n || '', NS.rdf, 'li')) out.push(clean(text(x))); }); return out.filter(Boolean); };
        /** une propriété : attribut d'un rdf:Description, ou élément (texte, ou les rdf:li d'un Bag / Seq / Alt) */
        const prop = (ns, local, many = false) => {
            for (const d of descs) {
                for (const [k, v] of Object.entries(d.a || {})) if (is(k, ns, local)) return many ? [clean(v)].filter(Boolean) : clean(v);
                const el = (d.c || []).find(x => typeof x === 'object' && is(x.n, ns, local));
                if (el) { const l = lis(el); if (l.length) return many ? l : l[0]; const v = clean(text(el)); return many ? [v].filter(Boolean) : v; }
            }
            return many ? [] : '';
        };
        // personnes : IPTC (PersonInImage), régions de visages (MWG, Microsoft)
        const people = new Set(prop(NS.ext, 'PersonInImage', true));
        walk(doc, el => {
            if (is(el.n || '', NS.mwg, 'Name')) { people.add(clean(text(el))); }
            for (const [k, v] of Object.entries(el.a || {})) { if (is(k, NS.mwg, 'Name') && (!el.a['mwg-rs:Type'] || /face/i.test(el.a['mwg-rs:Type']))) people.add(clean(v)); if (is(k, NS.mpr, 'PersonDisplayName')) people.add(clean(v)); }
            if (is(el.n || '', NS.mpr, 'PersonDisplayName')) people.add(clean(text(el)));
        });
        // lieu montré (IPTC Extension) si les champs de Photoshop sont vides
        let loc = {city: prop(NS.ps, 'City'), state: prop(NS.ps, 'State'), country: prop(NS.ps, 'Country'), sublocation: prop(NS.core, 'Location')};
        if (!loc.city) walk(doc, el => { if (!loc.city && (is(el.n || '', NS.ext, 'LocationShown') || is(el.n || '', NS.ext, 'LocationCreated'))) {
            const g = local => { let v = ''; walk(el, x => { if (!v) { for (const [k, val] of Object.entries(x.a || {})) if (is(k, NS.ext, local)) v = clean(val); if (!v && is(x.n || '', NS.ext, local)) v = clean(text(x)); } }); return v; };
            loc = {city: g('City'), state: g('ProvinceState'), country: g('CountryName'), sublocation: g('Sublocation') || loc.sublocation}; } });
        const lat = xmpCoord(prop(NS.exif, 'GPSLatitude')), lon = xmpCoord(prop(NS.exif, 'GPSLongitude'));
        return {title: prop(NS.dc, 'title'), description: prop(NS.dc, 'description'), keywords: prop(NS.dc, 'subject', true),
            taken: isoDate(prop(NS.exif, 'DateTimeOriginal') || prop(NS.ps, 'DateCreated') || prop(NS.xmp, 'CreateDate')),
            lat: goodCoord(lat, lon) ? lat : null, lon: goodCoord(lat, lon) ? lon : null, ...loc, people: [...people].filter(Boolean).slice(0, 40)};
    }

    /* ── EXIF (TIFF) ── */
    function readTiff(u8) {
        const out = {};
        if (u8.length < 8) return out;
        const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), le = u8[0] === 0x49;
        if (!(le || u8[0] === 0x4d)) return out;
        const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
        const SIZES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8};
        const ifd = off => { const tags = {}; if (off < 8 || off + 2 > u8.length) return tags; const n = Math.min(u16(off), 500);
            for (let i = 0; i < n; i++) { const e = off + 2 + i * 12; if (e + 12 > u8.length) break; const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), size = (SIZES[type] || 1) * cnt; const at = size <= 4 ? e + 8 : u32(e + 8); if (at + size > u8.length || size > 1048576) continue; tags[tag] = {type, cnt, at}; }
            return tags; };
        const str = t => { if (!t) return ''; let s = ''; for (let i = 0; i < t.cnt && i < 4000; i++) { const c = u8[t.at + i]; if (!c) break; s += String.fromCharCode(c); } try { return decodeURIComponent(escape(s)); } catch (_) { return s; } };
        const rat = (t, i = 0) => { if (!t || t.type !== 5) return NaN; const a = u32(t.at + i * 8), b = u32(t.at + i * 8 + 4); return b ? a / b : NaN; };
        const ucs2 = t => { if (!t) return ''; let s = ''; for (let i = 0; i + 1 < t.cnt; i += 2) { const c = u8[t.at + i] | (u8[t.at + i + 1] << 8); if (!c) break; s += String.fromCharCode(c); } return s; };
        const ifd0 = ifd(u32(4));
        out.description = clean(str(ifd0[0x010e]));
        const xpk = ucs2(ifd0[0x9c9e]); if (xpk) out.keywords = xpk.split(/\s*;\s*/).map(clean).filter(Boolean).slice(0, 40);
        let taken = '';
        if (ifd0[0x8769]) { const ex = ifd(u32(ifd0[0x8769].at)); taken = isoDate(str(ex[0x9003]) || str(ex[0x9004])); }
        if (!taken) taken = isoDate(str(ifd0[0x0132]));
        out.taken = taken;
        if (ifd0[0x8825]) {
            const g = ifd(u32(ifd0[0x8825].at)), dms = t => rat(t, 0) + rat(t, 1) / 60 + rat(t, 2) / 3600;
            let lat = dms(g[2]), lon = dms(g[4]);
            if (str(g[1]).toUpperCase() === 'S') lat = -lat; if (str(g[3]).toUpperCase() === 'W') lon = -lon;
            if (goodCoord(lat, lon)) { out.lat = Math.round(lat * 1e7) / 1e7; out.lon = Math.round(lon * 1e7) / 1e7; }
        }
        return out;
    }

    /* ── IPTC (IIM, dans le bloc Photoshop APP13) ── */
    function decodeText(bytes, utf8) {
        try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch (_) { if (utf8) return new TextDecoder('utf-8').decode(bytes); }
        try { return new TextDecoder('windows-1252').decode(bytes); } catch (_) { return String.fromCharCode(...bytes); }
    }
    function parseIptc(u8) {
        const out = {keywords: []}; let utf8 = false; const recs = [];
        for (let i = 0; i + 5 <= u8.length && recs.length < 2000;) {
            if (u8[i] !== 0x1c) { i++; continue; }
            const rec = u8[i + 1], ds = u8[i + 2]; let len = (u8[i + 3] << 8) | u8[i + 4], at = i + 5;
            if (len & 0x8000) { const n = len & 0x7fff; if (n > 4) break; len = 0; for (let k = 0; k < n; k++) len = len * 256 + u8[at + k]; at += n; }
            if (at + len > u8.length) break;
            recs.push([rec, ds, u8.subarray(at, at + len)]); i = at + len;
        }
        recs.forEach(([r, d, b]) => { if (r === 1 && d === 90 && b.length >= 3 && b[0] === 0x1b && b[1] === 0x25 && b[2] === 0x47) utf8 = true; });
        for (const [r, d, b] of recs) {
            if (r !== 2) continue;
            const v = clean(decodeText(b, utf8));
            if (d === 5) out.title = v; else if (d === 120) out.description = cleanText(decodeText(b, utf8)); else if (d === 25 && v) out.keywords.push(v);
            else if (d === 55) out.date = v; else if (d === 90) out.city = v; else if (d === 92) out.sublocation = v; else if (d === 95) out.state = v; else if (d === 101) out.country = v;
        }
        out.taken = isoDate(out.date || ''); delete out.date;
        out.keywords = out.keywords.slice(0, 40);
        return out;
    }

    /* ── lire un fichier image ── */
    const ascii = (u8, a, n) => { let s = ''; for (let i = 0; i < n && a + i < u8.length; i++) s += String.fromCharCode(u8[a + i]); return s; };
    /** une image (Uint8Array) → {exif, xmp, iptc} : ce qui est trouvé dans un JPEG, un PNG ou un WebP */
    function readEmbedded(u8) {
        const res = {exif: {}, xmp: {}, iptc: {}};
        try {
            if (u8[0] === 0xff && u8[1] === 0xd8) {
                for (let i = 2; i + 4 < u8.length;) {
                    if (u8[i] !== 0xff) break;
                    const m = u8[i + 1]; if (m === 0xd9 || m === 0xda) break; if (m >= 0xd0 && m <= 0xd7 || m === 0x01) { i += 2; continue; }
                    const len = (u8[i + 2] << 8) | u8[i + 3], s = i + 4, e = i + 2 + len; if (len < 2 || e > u8.length) break;
                    if (m === 0xe1 && ascii(u8, s, 6) === 'Exif\0\0') res.exif = readTiff(u8.subarray(s + 6, e));
                    else if (m === 0xe1 && ascii(u8, s, 29) === 'http://ns.adobe.com/xap/1.0/\0') res.xmp = parseXmp(new TextDecoder('utf-8').decode(u8.subarray(s + 29, e)));
                    else if (m === 0xed && ascii(u8, s, 14) === 'Photoshop 3.0\0') {
                        for (let p = s + 14; p + 12 < e;) { // ressources 8BIM : 0x0404 = IPTC
                            if (ascii(u8, p, 4) !== '8BIM') break;
                            const id = (u8[p + 4] << 8) | u8[p + 5], nl = u8[p + 6], q = p + 6 + ((nl + 2) & ~1), sz = ((u8[q] << 24) | (u8[q + 1] << 16) | (u8[q + 2] << 8) | u8[q + 3]) >>> 0, d = q + 4;
                            if (d + sz > e) break;
                            if (id === 0x0404) res.iptc = parseIptc(u8.subarray(d, d + sz));
                            p = d + sz + (sz & 1);
                        }
                    }
                    i = e;
                }
            } else if (u8[0] === 0x89 && ascii(u8, 1, 3) === 'PNG') {
                for (let i = 8; i + 12 <= u8.length;) {
                    const len = ((u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3]) >>> 0, type = ascii(u8, i + 4, 4), d = i + 8;
                    if (d + len > u8.length) break;
                    if (type === 'eXIf') res.exif = readTiff(u8.subarray(d, d + len));
                    if (type === 'iTXt' && ascii(u8, d, 17) === 'XML:com.adobe.xmp' && u8[d + 18] === 0) { let p = d + 20; while (p < d + len && u8[p]) p++; p++; while (p < d + len && u8[p]) p++; p++; res.xmp = parseXmp(new TextDecoder('utf-8').decode(u8.subarray(p, d + len))); }
                    if (type === 'IEND') break;
                    i = d + len + 4;
                }
            } else if (ascii(u8, 0, 4) === 'RIFF' && ascii(u8, 8, 4) === 'WEBP') {
                for (let i = 12; i + 8 <= u8.length;) {
                    const type = ascii(u8, i, 4), len = (u8[i + 4] | (u8[i + 5] << 8) | (u8[i + 6] << 16) | (u8[i + 7] << 24)) >>> 0, d = i + 8;
                    if (d + len > u8.length) break;
                    if (type === 'EXIF') { const b = u8.subarray(d, d + len); res.exif = readTiff(ascii(b, 0, 6) === 'Exif\0\0' ? b.subarray(6) : b); }
                    if (type === 'XMP ') res.xmp = parseXmp(new TextDecoder('utf-8').decode(u8.subarray(d, d + len)));
                    i = d + len + (len & 1);
                }
            }
        } catch (_) { /* un fichier abîmé : on garde ce qui a été lu */ }
        return res;
    }

    /** tout réunir pour une photo : ce que dit le fichier passe avant le .json (sauf la description et les personnes, propres à Google) */
    function merge({name, embedded = {}, xmpSide = {}, takeout = null, album = ''}) {
        const ex = embedded.exif || {}, xi = {...(embedded.xmp || {}), ...Object.fromEntries(Object.entries(xmpSide || {}).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)))}, ip = embedded.iptc || {};
        const fileTitle = String(name || '').replace(/\.[^.]+$/, '');
        const tk = takeout || {};
        const pick = (...v) => v.map(x => clean(x)).find(Boolean) || '';
        const desc = [tk.description, xi.description, ip.description, JUNK_DESC.test(clean(ex.description)) ? '' : ex.description].map(cleanText).find(Boolean) || '';
        const tkTitle = clean(tk.title).replace(/\.[^.]+$/, '');
        const title = pick(xi.title, ip.title, tkTitle && tkTitle !== fileTitle ? tkTitle : '', fileTitle) || 'Photo';
        const taken = ex.taken || xi.taken || ip.taken || tk.taken || '';
        const coord = [[ex.lat, ex.lon, 'fichier'], [xi.lat, xi.lon, 'fichier'], [tk.lat, tk.lon, 'Google Photos']].find(([a, b]) => goodCoord(a, b)) || [null, null, ''];
        const loc = xi.city || xi.country ? xi : ip.city || ip.country ? ip : {};
        const placeText = [loc.sublocation, loc.city, loc.state, loc.country].map(clean).filter((v, i, l) => v && l.indexOf(v) === i).join(', ');
        const kw = [...(xi.keywords || []), ...(ip.keywords || []), ...(ex.keywords || []), ...(album ? [album] : [])].map(clean).filter(Boolean);
        const keywords = [...new Map(kw.map(k => [k.toLowerCase(), k.slice(0, 80)])).values()].slice(0, 40);
        const people = [...new Map([...(tk.people || []), ...(xi.people || [])].map(clean).filter(Boolean).map(p => [p.toLowerCase(), p.slice(0, 120)])).values()].slice(0, 40);
        return {name: baseName(name), title: title.slice(0, 300), description: desc.slice(0, 20000), taken, dateText: frDate(taken), lat: coord[0], lon: coord[1], coordFrom: coord[2],
            placeText: placeText.slice(0, 200), city: clean(loc.city), country: clean(loc.country), keywords, people, album,
            from: [takeout ? 'Google Photos' : '', Object.keys(xmpSide || {}).length ? 'XMP' : '', Object.keys(embedded.xmp || {}).length || Object.keys(ip).filter(k => k !== 'keywords' || ip.keywords.length).length ? 'métadonnées' : ''].filter(Boolean)};
    }

    /** une clé de lieu commune à plusieurs photos : le texte du lieu, sinon la position arrondie (≈ 1 km) */
    function placeKey(it) {
        if (it.placeText) return 't:' + it.placeText.toLowerCase();
        if (goodCoord(it.lat, it.lon)) return `g:${it.lat.toFixed(2)},${it.lon.toFixed(2)}`;
        return '';
    }

    /**
     * Lire ce qu'on a déposé : un ou plusieurs ZIP (Takeout), ou des photos avec leurs .json / .xmp.
     * files : [{name, size, bytes: async () => Uint8Array}] → {items: [{path, name, read, meta}], skipped: [{name, why}], albums}
     */
    async function collect(files, {onProgress} = {}) {
        const entries = []; // {path, size, read}
        for (const f of files) {
            if (/\.zip$/i.test(f.name)) {
                if (f.size > LIMITS.zipBytes) throw new Error(`« ${f.name} » est trop gros (plus de ${Math.round(LIMITS.zipBytes / 1048576)} Mo) : ouvre-le d’abord sur l’ordinateur et choisis les photos et leurs fichiers .json.`);
                if (!S?.unzip) throw new Error('Lecteur de ZIP absent.');
                const z = await S.unzip(await f.bytes(), {maxTotal: LIMITS.zipTotal, maxEntry: LIMITS.zipEntry, maxEntries: LIMITS.zipEntries, maxFile: LIMITS.zipBytes});
                const bad = z.names.find(n => !safePath(n));
                if (bad !== undefined) throw new Error(`Ce fichier .zip contient un chemin dangereux (« ${String(bad).slice(0, 80)} ») : il n’est pas ouvert.`);
                z.names.filter(n => !n.endsWith('/')).forEach(n => entries.push({path: n, size: 0, read: () => z.read(n), zip: f.name}));
            } else {
                if (!safePath(f.name)) throw new Error(`Nom de fichier refusé : « ${String(f.name).slice(0, 80)} ».`);
                entries.push({path: f.name, size: f.size, read: f.bytes});
            }
        }
        const paths = entries.map(e => e.path), byPath = new Map(entries.map(e => [e.path, e]));
        const pairs = pairSidecars(paths), skipped = [], items = [];
        entries.filter(e => isSkipped(e.path)).forEach(e => skipped.push({name: baseName(e.path), why: /\.(heic|heif)$/i.test(e.path) ? 'HEIC : à convertir en JPEG' : 'format non pris'}));
        const albums = new Map();
        const readText = async p => { const e = byPath.get(p); if (!e) return ''; const b = await e.read(); if (!b || b.length > LIMITS.sidecar) return ''; return new TextDecoder('utf-8').decode(b); };
        let done = 0; const total = pairs.size;
        if (total > LIMITS.files) throw new Error(`Trop de photos d’un coup (${total}) : ${LIMITS.files} au plus. Importe-les en plusieurs fois (un album ou une année à la fois).`);
        for (const [path, side] of pairs) {
            const e = byPath.get(path);
            let takeout = null, xmpSide = {}, album = '';
            if (side.json) takeout = parseTakeoutJson(await readText(side.json));
            if (side.xmp) { xmpSide = parseXmp(await readText(side.xmp)); if (xmpSide.refused) { skipped.push({name: baseName(side.xmp), why: 'fichier XMP piégé, laissé de côté'}); xmpSide = {}; } }
            if (side.album) { if (!albums.has(side.album)) albums.set(side.album, parseAlbumJson(await readText(side.album))); album = albums.get(side.album) || ''; }
            const bytes = await e.read();
            if (!bytes || !bytes.length) { skipped.push({name: baseName(path), why: 'fichier vide'}); continue; }
            const embedded = /\.(jpe?g|png|webp)$/i.test(path) ? readEmbedded(bytes.subarray(0, Math.min(bytes.length, 4 * 1048576))) : {};
            if (embedded.xmp?.refused) embedded.xmp = {};
            items.push({path, name: baseName(path), size: bytes.length, bytes, meta: merge({name: path, embedded, xmpSide, takeout, album})});
            onProgress?.(++done, total);
        }
        return {items, skipped, sidecars: paths.filter(p => /\.(json|xmp)$/i.test(p)).length};
    }

    return {LIMITS, safePath, pairSidecars, parseTakeoutJson, parseAlbumJson, parseXmp, xmpCoord, readTiff, parseIptc, readEmbedded, merge, collect, isoDate, frDate, fromTimestamp, placeKey, isMedia};
});
