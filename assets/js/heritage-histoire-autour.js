/**
 * LCNDA — 🧭 Histoire autour : ce qui s'est passé autour des lieux et des vies de la famille.
 * Données livrées avec l'app (assets/data/ha-*.json.gz, refaites par scripts/histoire-autour/build.py, lues à la demande) :
 *   ⚔️ ha-batailles      batailles et sièges datés et placés (Wikidata, CC0)
 *   🛣️ ha-voies-romaines  routes de l'Empire romain, tracés simplifiés (Itiner-e 2024, de Soto et al. 2025, CC BY 4.0)
 *   🐚 ha-compostelle    chemins de Saint-Jacques balisés d'aujourd'hui (OpenStreetMap, © OpenStreetMap contributors, ODbL)
 *   🏥 ha-institutions   hôpitaux, hôtels-Dieu, hospices, enfants trouvés, prisons, bagnes, asiles, couvents (Wikidata, CC0)
 *   🌋 ha-catastrophes   séismes, éruptions, tsunamis importants du monde (NOAA NCEI/WDS, domaine public)
 *   ⚓ ha-navires        navires datés (Wikidata, CC0)
 *   🗼 ha-phares         phares, hauteur, portée (Wikidata, CC0 ; portée complétée par OpenStreetMap seamark, ODbL)
 * Ce que ça montre (une phrase d'abord, le détail plié « ▸ plus » ; rien quand il n'y a rien) :
 *   · fiche d'une personne, bloc « 🧭 Histoire autour » (à côté de « 🏘 Le lieu à son époque ») : la bataille près de ses
 *     lieux pendant sa vie, l'institution où elle est née ou morte, son navire (marin), le phare (gardien de phare),
 *     les catastrophes loin de la France métropolitaine (outre-mer, émigrés) ;
 *   · fiche d'un village : la voie romaine, le chemin de Compostelle, les batailles, les institutions, la lumière des phares ;
 *   · Monographie de commune : une partie par sujet (registre LCNDA_EXT.monographSections) ;
 *   · Listes : une liste par sujet (registre LCNDA_EXT.dataLists, filtres combinables, carte, distance) ;
 *   · à la demande : registre LCNDA_EXT.dataSources ;
 *   · Réglages → « 🧭 Histoire autour » : chaque sujet s'éteint (localStorage « genealogie-histoire-autour »), À propos des données.
 * Tout se calcule dans le navigateur ; le serveur donne seulement la vie d'une personne (ha_life, lib/histoire_autour.php).
 *   window.LCNDA_EXT.histoireAutour = {load, core…, personInto, placeInto}   (Node : module.exports = core)
 * Essai : tests/test-histoire-autour.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const RAD = Math.PI / 180;
    function km(a, b, c, d) { const x = Math.sin((c - a) * RAD / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin((d - b) * RAD / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const NM = 1.852;
    /** {fields, rows} → [{champ: valeur}] */
    const table = f => (f.rows || []).map(r => Object.fromEntries(f.fields.map((k, i) => [k, r[i] ?? null])));
    /** ligne codée [lat0, lon0, dlat, dlon, …] (entiers, 1/q degré) → [[lat, lon], …] */
    function decLine(a, q = 1e4) { const out = []; let la = 0, lo = 0; for (let i = 0; i + 1 < a.length; i += 2) { la += a[i]; lo += a[i + 1]; out.push([la / q, lo / q]); } return out; }
    function boxOf(lines) { let a = 90, b = 180, c = -90, d = -180; for (const l of lines) for (const [la, lo] of l) { if (la < a) a = la; if (la > c) c = la; if (lo < b) b = lo; if (lo > d) d = lo; } return [a, b, c, d]; }
    const inBox = (box, lat, lon, k) => { const dl = k / 111, dn = k / (111 * Math.max(0.1, Math.cos(lat * RAD))); return lat >= box[0] - dl && lat <= box[2] + dl && lon >= box[1] - dn && lon <= box[3] + dn; };
    /** distance (km) d'un point à une polyligne : projection locale, assez juste à quelques dizaines de km */
    function lineKm(lat, lon, pts) {
        const kx = 111.32 * Math.cos(lat * RAD), ky = 110.574;
        let best = Infinity;
        for (let i = 0; i < pts.length; i++) {
            const ax = (pts[i][1] - lon) * kx, ay = (pts[i][0] - lat) * ky;
            if (i === 0) { best = Math.min(best, Math.hypot(ax, ay)); continue; }
            const bx = (pts[i - 1][1] - lon) * kx, by = (pts[i - 1][0] - lat) * ky, dx = ax - bx, dy = ay - by, L = dx * dx + dy * dy;
            const t = L ? Math.max(0, Math.min(1, -(bx * dx + by * dy) / L)) : 0;
            best = Math.min(best, Math.hypot(bx + t * dx, by + t * dy));
        }
        return best;
    }
    function lineLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += km(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); return s; }

    /* ── les fichiers, préparés pour le calcul ── */
    const KIND_WORD = {hopital: 'hôpital', hoteldieu: 'hôtel-Dieu', hospice: 'hospice', orphelinat: 'orphelinat', enfants: 'hospice des enfants trouvés', prison: 'prison', bagne: 'bagne', asile: 'asile', couvent: 'couvent, monastère', leproserie: 'léproserie'};
    const PREP = {
        batailles: f => table(f).map(r => ({...r, bel: r.bel ? String(r.bel).split('|') : []})),
        voies: f => f.rows.map(r => { const lines = r[6].map(l => decLine(l, f.q)); return {name: f.names[r[0]] || '', main: r[1], cert: r[2], from: r[3], to: r[4], itin: f.itin[r[5]] || '', lines, box: boxOf(lines), km: Math.round(lines.reduce((s, l) => s + lineLen(l), 0))}; }),
        compostelle: f => table(f).map(r => { const lines = r.lines.map(l => decLine(l, f.q)); return {...r, lines, box: boxOf(lines), km: Math.round(lines.reduce((s, l) => s + lineLen(l), 0))}; }),
        institutions: f => table(f).map(r => ({...r, kinds: String(r.kinds || '').split(',').filter(Boolean)})),
        catastrophes: f => table(f),
        navires: f => table(f).map(r => ({...r, key: shipKey(r.n)})),
        phares: f => table(f).map(r => ({...r, rangeKm: r.range ? Math.round(r.range * NM * 10) / 10 : null}))
    };

    /* ── la vie d'une personne (réponse de ha_life) ── */
    function lifeSpan(life) {
        const ys = (life.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life.person?.birth), d = num(life.person?.death);
        const from = b ?? (ys.length ? Math.min(...ys) : null), to = d ?? (ys.length ? Math.max(...ys, from ?? -Infinity) : from);
        return {from, to, birth: b, death: d};
    }
    const geoPlaces = life => (life.places || []).filter(p => num(p.lat) !== null && num(p.lon) !== null && !(Number(p.lat) === 0 && Number(p.lon) === 0));
    const age = (life, y) => (num(life.person?.birth) !== null && y !== null ? y - Number(life.person.birth) : null);

    /** ⚔️ les batailles à moins de `radius` km d'un lieu de sa vie, pendant sa vie (connue) */
    function battlesForLife(list, life, radius = 30) {
        const {from, to} = lifeSpan(life), pls = geoPlaces(life);
        if (from === null || !pls.length) return [];
        const out = [];
        for (const b of list) {
            if (b.y < from || b.y > to) continue;
            let best = null;
            for (const p of pls) { const k = km(p.lat, p.lon, b.lat, b.lon); if (k <= radius && (!best || k < best.km)) best = {km: k, place: p.name}; }
            if (best) out.push({...best, b, age: age(life, b.y)});
        }
        return out.sort((a, c) => a.b.y - c.b.y || String(a.b.d).localeCompare(String(c.b.d)));
    }
    /** ⚔️ les batailles près d'un lieu (toutes époques, ou entre deux années) */
    function battlesNear(list, lat, lon, radius = 15, years = null) {
        return list.filter(b => !years || (b.y >= years.from && b.y <= years.to)).map(b => ({b, km: km(lat, lon, b.lat, b.lon)})).filter(x => x.km <= radius).sort((a, c) => a.b.y - c.b.y);
    }
    /** 🛣️ / 🐚 les lignes à moins de `radius` km d'un point : [{row, km}] (une fois par nom, la plus proche) */
    function linesNear(rows, lat, lon, radius = 2) {
        const by = new Map();
        for (const r of rows) {
            if (!inBox(r.box, lat, lon, radius)) continue;
            let k = Infinity; for (const l of r.lines) k = Math.min(k, lineKm(lat, lon, l));
            if (k > radius) continue;
            const key = r.name || r.osm || Math.random(), cur = by.get(key);
            if (!cur || k < cur.km || (k === cur.km && r.cert > cur.row.cert)) by.set(key, {row: r, km: k});
        }
        return [...by.values()].sort((a, b) => a.km - b.km);
    }
    /** 🏥 les institutions près d'un point, ouvertes l'année `year` si elle est donnée */
    function institutionsNear(list, lat, lon, radius = 3, {kinds = null, year = null} = {}) {
        return list.filter(i => (!kinds || i.kinds.some(k => kinds.includes(k))) && (year === null || ((i.from === null || i.from <= year) && (i.to === null || i.to >= year))))
            .map(i => ({i, km: km(lat, lon, i.lat, i.lon)})).filter(x => x.km <= radius).sort((a, b) => a.km - b.km);
    }
    // les mots d'une adresse ou d'une note qui disent l'institution
    const INST_WORDS = [[/hotel[- ]?dieu/, ['hoteldieu', 'hopital', 'hospice']], [/enfants?[- ]trouv|tour d.abandon|hospice des enfants/, ['enfants', 'hospice', 'hoteldieu', 'orphelinat']],
        [/orphelinat/, ['orphelinat', 'enfants']], [/hospice|maison de charite|hopital general|charite/, ['hospice', 'hoteldieu', 'hopital']], [/hopital|hospital|clinique|maternite|infirmerie/, ['hopital', 'hoteldieu', 'hospice']],
        [/asile|alienes|maison de sante|hopital psychiatrique/, ['asile', 'hopital']], [/bagne|forcat|transporte|relegue/, ['bagne', 'prison']], [/prison|maison centrale|maison d.arret|detenu|maison de correction|penitencier/, ['prison', 'bagne']],
        [/couvent|abbaye|monastere|prieure|carmel|religieuse|moine|novice/, ['couvent']], [/leproserie|maladrerie|ladrerie/, ['leproserie']]];
    const FOUNDLING = /enfant trouv|enfant abandonn|abandonne|expose (?:au|a la|dans)|de pere et mere inconnus|de parents inconnus|pupille|assistance publique|tour d.abandon|enfant naturel|nourrice/;
    const TAGW = {BIRT: 'birth', BAPM: 'birth', CHR: 'birth', DEAT: 'death', BURI: 'death'};
    /** 🏥 « Mort à l'Hôtel-Dieu de Tulle » : un acte (naissance, décès…) dont l'adresse ou le texte nomme une institution proche */
    function institutionsForLife(list, life) {
        const out = [], seen = new Set();
        for (const e of life.events || []) {
            if (num(e.lat) === null || num(e.lon) === null) continue;
            const words = fold(`${e.address || ''} ${e.title || ''} ${e.description || ''} ${e.place_full || ''}`);
            const hit = INST_WORDS.find(([re]) => re.test(words)); if (!hit) continue;
            const y = num(e.year);
            const near = institutionsNear(list, e.lat, e.lon, 15, {kinds: hit[1], year: y});
            if (!near.length) continue;
            // le nom qui ressemble le plus aux mots de l'acte, puis le plus proche
            const tok = new Set(words.split(/[^a-z0-9]+/).filter(w => w.length > 3));
            const score = x => fold(x.i.n).split(/[^a-z0-9]+/).filter(w => w.length > 3 && tok.has(w)).length;
            near.sort((a, b) => score(b) - score(a) || a.km - b.km);
            const best = near[0]; if (seen.has(best.i.q + e.tag)) continue; seen.add(best.i.q + e.tag);
            out.push({event: e, what: TAGW[e.tag] || 'event', i: best.i, km: best.km, named: score(best) > 0, others: near.slice(1, 4)});
        }
        // enfant trouvé ? les hospices autour du lieu de naissance, ouverts cette année-là
        const txt = fold(`${life.text || ''} ${(life.events || []).map(e => `${e.title} ${e.description} ${e.address}`).join(' ')}`);
        let foundling = null;
        if (FOUNDLING.test(txt)) {
            const b = (life.events || []).find(e => TAGW[e.tag] === 'birth' && num(e.lat) !== null);
            if (b) {
                const near = institutionsNear(list, b.lat, b.lon, 25, {kinds: ['enfants', 'hospice', 'hoteldieu', 'orphelinat'], year: num(b.year)});
                if (near.length) foundling = {event: b, list: near.slice(0, 5)};
            }
        }
        return {acts: out, foundling};
    }

    /* ── 🌋 la France métropolitaine (contour grossier, assez pour dire « hors de la métropole ») ── */
    const METRO = [[51.1, 2.5], [50.2, 4.2], [49.5, 6.4], [49.0, 8.2], [47.6, 7.6], [46.4, 6.1], [46.0, 7.0], [44.1, 7.7], [43.7, 7.5], [43.0, 6.0], [42.4, 3.2], [42.7, 1.7], [42.8, -0.3], [43.4, -1.8], [44.6, -1.3], [46.3, -1.8], [47.3, -2.6], [47.8, -4.7], [48.6, -4.9], [48.9, -1.6], [49.7, -1.9], [49.4, 0.2], [50.1, 1.5], [51.1, 2.5]];
    const CORSE = [[43.05, 9.2], [43.05, 9.6], [41.35, 9.35], [41.35, 8.75], [42.6, 8.5], [43.05, 9.2]];
    function inPoly(poly, lat, lon) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [yi, xi] = poly[i], [yj, xj] = poly[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; }
    const inMetro = (lat, lon) => inPoly(METRO, lat, lon) || inPoly(CORSE, lat, lon);
    const FR_WORD = /^(france|fr|fra|republique francaise)$/;
    /** un lieu hors de la France métropolitaine (outre-mer, autre pays) */
    function farPlace(p) {
        if (num(p.lat) === null) return false;
        const c = fold(p.country);
        if (c && !FR_WORD.test(c)) return true;
        return !inMetro(Number(p.lat), Number(p.lon));
    }
    /** rayon (km) où un événement NOAA a sans doute touché un lieu : règle simple de l'app, dite sous la ligne */
    function reachKm(ev) {
        if (ev.k === 'vo') return (num(ev.mag) ?? 0) >= 4 ? 80 : 40;
        if (ev.k === 'ts') return 150;
        const m = num(ev.mag), it = num(ev.int);
        if (m !== null) return m >= 8 ? 400 : m >= 7 ? 250 : m >= 6 ? 120 : 60;
        return it !== null && it >= 9 ? 150 : 80;
    }
    const metroFrenchEvent = ev => /^france$/i.test(String(ev.country || '').trim()) && inMetro(ev.lat, ev.lon);
    /** 🌋 les catastrophes près de ses lieux hors de la métropole, pendant sa vie (les séismes de France : bloc « 🏘 Le lieu à son époque ») */
    function disastersForLife(list, life) {
        const {from, to} = lifeSpan(life), pls = geoPlaces(life).filter(farPlace);
        if (from === null || !pls.length) return [];
        const out = [];
        for (const ev of list) {
            if (ev.y < from || ev.y > to || metroFrenchEvent(ev)) continue;
            let best = null;
            for (const p of pls) { const k = km(p.lat, p.lon, ev.lat, ev.lon); if (k <= reachKm(ev) && (!best || k < best.km)) best = {km: k, place: p.name}; }
            if (best) out.push({...best, ev, age: age(life, ev.y)});
        }
        return out.sort((a, b) => a.ev.y - b.ev.y || (a.ev.m || 0) - (b.ev.m || 0) || (a.ev.d || 0) - (b.ev.d || 0));
    }
    function disastersNear(list, lat, lon, years = null) {
        return list.filter(ev => (!years || (ev.y >= years.from && ev.y <= years.to)) && !metroFrenchEvent(ev)).map(ev => ({ev, km: km(lat, lon, ev.lat, ev.lon)})).filter(x => x.km <= reachKm(x.ev)).sort((a, b) => a.ev.y - b.ev.y);
    }

    /* ── ⚓ le navire du marin ── */
    const SAILOR = /\b(marin|matelot|mousse|novice|marine|navigateur|capitaine (?:au long cours|de navire|de vaisseau|de fregate|de corvette|marchand)|maitre (?:d.equipage|au cabotage|de manoeuvre)|quartier[- ]maitre|timonier|gabier|canonnier|chauffeur|mecanicien de la marine|officier de marine|lieutenant de vaisseau|enseigne de vaisseau|armateur|pecheur|terre[- ]neuvas|caboteur|pilote|sailor|seaman|mariner|ship|inscrit maritime|inscription maritime|equipage)\b/;
    const isSailor = life => SAILOR.test(fold([...(life.jobs || []).map(j => j.text), life.text || ''].join(' ')));
    const SHIPWORD = '(?:navire|vaisseau|fregate|corvette|brick|brig|aviso|cuirasse|croiseur|trois[- ]mats|quatre[- ]mats|goelette|paquebot|batiment|vapeur|steamer|torpilleur|contre[- ]torpilleur|sous[- ]marin|transport|canonniere|chaloupe|bateau|barque|lougre|cotre|chasse[- ]maree|porte[- ]avions|patrouilleur|escorteur|ship|hms|uss|sms)';
    /** « Méduse (1810) », « La Méduse », « HMS Victory », « French ship Bretagne » → « meduse », « victory », « bretagne » */
    function shipKey(name) {
        let s = fold(name).replace(/\([^)]*\)/g, ' ').replace(/[«»"“”]/g, ' ');
        s = s.replace(/^(?:(?:french|british|german|spanish|italian|us|u\.s\.|japanese|russian|dutch) )?(?:ship|navire|steamship|ss|rms|hms|hmhs|uss|sms|ms|mv|frs|fs|hnlms|bap|ins|ard|kms|hmcs|hmas|cs|ps|rv|ns) /, '');
        s = s.replace(/^(?:le|la|les|l')\s*/, '').replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim();
        return s;
    }
    /** les noms de navires écrits dans un texte : après « à bord du », « embarqué sur », « frégate », ou entre guillemets */
    function shipCandidates(text) {
        const t = fold(text).replace(/[’]/g, "'"), out = new Set();
        const add = s => { const k = shipKey(s.split(/[,.;:()\n]| (?:en|le \d|du \d|de \d|a |au |pour |puis |depuis |comme |ou |et )/)[0]); if (k.length >= 3) { out.add(k); const w = k.split(' '); for (let n = Math.min(4, w.length); n >= 1; n--) out.add(w.slice(0, n).join(' ')); } };
        const reA = new RegExp(`(?:a bord (?:du|de la|de l'|de|des)|embarque\\w* (?:sur|a bord)(?: le| la| l')?|servi\\w* sur(?: le| la| l')?|${SHIPWORD})\\s+(?:(?:le|la|l')\\s*)?["«]?\\s*([a-z0-9][a-z0-9' -]{2,40})`, 'g');
        let m; while ((m = reA.exec(t))) add(m[1]);
        const reQ = /[«"“]\s*([^»"”]{3,40})\s*[»"”]/g; while ((m = reQ.exec(t))) add(m[1]);
        return [...out].filter(k => k.length >= 3 && !/^(de|du|des|la|le|les|un|une|son|sa|ses|ce|cette|guerre|commerce|ligne|marine|pont|retour|port|l etat)$/.test(k));
    }
    /** ⚓ un navire de Wikidata dont le nom est écrit dans ses textes, et dont les dates vont avec sa vie */
    function shipsForLife(list, life, {force = false} = {}) {
        if (!force && !isSailor(life)) return [];
        const cands = new Set(shipCandidates([life.text || '', ...(life.events || []).map(e => `${e.title || ''} ${e.description || ''}`)].join('\n')));
        if (!cands.size) return [];
        const {from, to} = lifeSpan(life);
        const out = [];
        for (const s of list) {
            if (!s.key || s.key.length < 3 || !cands.has(s.key)) continue;
            if (from !== null && ((s.to !== null && s.to < from + 12) || (to !== null && s.from > to))) continue; // en service quand il pouvait naviguer
            out.push(s);
        }
        const fr = s => (/france|francais/i.test(fold(s.flag)) ? 0 : 1);
        return out.sort((a, b) => fr(a) - fr(b) || b.key.length - a.key.length || a.from - b.from).slice(0, 6);
    }

    /* ── 🗼 phares ── */
    const KEEPER = /gardien (?:de|du) phare|garde[- ]phare|gardien de feu|gardien des feux|electricien de phare|maitre de phare|lighthouse keeper|\bphare\b/;
    const isKeeper = life => KEEPER.test(fold([...(life.jobs || []).map(j => j.text)].join(' '))) || /gardien (?:de|du) phare|garde[- ]phare/.test(fold(life.text || ''));
    function lighthousesNear(list, lat, lon, radius = 30) { return list.map(l => ({l, km: km(lat, lon, l.lat, l.lon)})).filter(x => x.km <= radius).sort((a, b) => a.km - b.km); }
    /** les phares dont la lumière arrivait jusqu'à ce point (portée connue) */
    function lighthousesReaching(list, lat, lon) { return list.filter(l => l.rangeKm).map(l => ({l, km: km(lat, lon, l.lat, l.lon)})).filter(x => x.km <= x.l.rangeKm && x.km > 0.05).sort((a, b) => a.km - b.km); }
    function lighthousesForLife(list, life) {
        if (!isKeeper(life)) return [];
        const out = new Map();
        for (const p of geoPlaces(life)) for (const x of lighthousesNear(list, p.lat, p.lon, 30).slice(0, 3)) { const cur = out.get(x.l.q); if (!cur || x.km < cur.km) out.set(x.l.q, {...x, place: p.name}); }
        return [...out.values()].sort((a, b) => a.km - b.km).slice(0, 4);
    }

    const core = {km, fold, table, decLine, lineKm, lineLen, PREP, lifeSpan, battlesForLife, battlesNear, linesNear, institutionsNear, institutionsForLife, inMetro, farPlace, reachKm,
        disastersForLife, disastersNear, shipKey, shipCandidates, isSailor, shipsForLife, isKeeper, lighthousesNear, lighthousesReaching, lighthousesForLife, KIND_WORD, NM};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const DATA_V = 1;
    const FILES = {batailles: 'ha-batailles', voies: 'ha-voies-romaines', compostelle: 'ha-compostelle', institutions: 'ha-institutions', catastrophes: 'ha-catastrophes', navires: 'ha-navires', phares: 'ha-phares'};
    const KEY = 'genealogie-histoire-autour';
    const TAB = ['histoire_autour', '25k6', '🧭 Histoire autour'];
    const PARTS = [
        ['batailles', '⚔️ Batailles près du village', 'Les batailles et les sièges à moins de 30 km de ses lieux, pendant sa vie ; sur la fiche d’un village, ceux des alentours.'],
        ['voies', '🛣️ Voies romaines', 'La voie romaine qui passait près du village (Itiner-e).'],
        ['compostelle', '🐚 Chemins de Compostelle', 'Le chemin de Saint-Jacques qui passe par le village (OpenStreetMap).'],
        ['institutions', '🏥 Hôpitaux, hospices, prisons, couvents', 'L’institution où une personne est née ou morte (d’après l’adresse de l’acte) ; les enfants trouvés ; celles du village.'],
        ['catastrophes', '🌋 Catastrophes du monde', 'Séismes, éruptions et tsunamis près de ses lieux hors de la France métropolitaine (outre-mer, émigrés).'],
        ['navires', '⚓ Le navire du marin', 'Pour un marin : un navire connu dont le nom est écrit dans ses notes ou ses actes.'],
        ['phares', '🗼 Phares', 'Pour un gardien de phare : les phares près de chez lui ; sur la fiche d’un village : les phares dont la lumière arrivait jusque-là.']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const dec = (n, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');
    const kmTxt = k => (k < 1 ? T('{n} m', {n: String(Math.max(50, Math.round(k * 1000 / 50) * 50))}) : k < 10 ? T('{n} km', {n: dec(k)}) : T('{n} km', {n: String(Math.round(k))}));
    const yTxt = y => (y < 0 ? T('{n} av. J.-C.', {n: String(-y)}) : String(y));
    function dateTxt(d, y) {
        const [yy, mm, dd] = String(d || '').split('-').map(Number);
        if (yy && mm && dd) return `${dd === 1 ? '1er' : dd} ${T(MONTHS[mm - 1])} ${yTxt(yy)}`;
        if (yy && mm) return `${T(MONTHS[mm - 1])} ${yTxt(yy)}`;
        return yTxt(y);
    }
    /** « Le 16 août 1870 », « En août 1870 », « En 1870 » */
    function whenTxt(d, y) { const [yy, mm, dd] = String(d || '').split('-').map(Number); return yy && mm && dd ? T('Le {d}', {d: dateTxt(d, y)}) : T('En {d}', {d: dateTxt(d, y)}); }
    const isoOf = (y, m, d) => (m ? `${y}-${String(m).padStart(2, '0')}${d ? '-' + String(d).padStart(2, '0') : ''}` : '');
    const dmyTxt = (y, m, d) => dateTxt(m ? `${y}-${String(m).padStart(2, '0')}${d ? '-' + String(d).padStart(2, '0') : ''}` : '', y);
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    const ageTxt = n => (n === 0 ? T('moins d’un an') : n === 1 ? T('1 an') : T('{n} ans', {n: String(n)}));
    const he = P => (P?.gender === 'female' ? T('Elle') : P?.gender === 'male' ? T('Il') : (P?.first ? esc(P.first) : T('Cette personne')));
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const wdUrl = q => `https://www.wikidata.org/wiki/${encodeURIComponent(q)}`;
    const wpUrl = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const refLinks = r => `<span class="ha-links">${r.frwiki ? link(wpUrl(r.frwiki), '↗ Wikipédia') + ' ' : ''}${r.q ? link(wdUrl(r.q), '↗ Wikidata') : ''}</span>`;
    const row = (icon, html, src, extra = '') => `<div class="hist-row ha-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="ha-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const files = {}, data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf)); // déjà décompressé en route
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir les fichiers de l’histoire autour.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    /** charge un sujet : {meta, rows} (rows préparées pour le calcul) ; null si le fichier n'est pas livré */
    function load(kind) {
        if (!data[kind]) data[kind] = fetch(`assets/data/${FILES[kind]}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: FILES[kind]})); return readMaybeGz(r); })
            .then(f => { if (!f) return null; files[kind] = f; const {rows, fields, names, itin, ...meta} = f; return {meta, rows: PREP[kind](f)}; })
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const SRC = {
        batailles: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0)`,
        voies: () => `${link('https://doi.org/10.5281/zenodo.17122148', 'Itiner-e 2024')} — de Soto, Pažout, Brughmans et al. (2025) (CC BY 4.0)`,
        compostelle: () => `${link('https://www.openstreetmap.org/copyright', '© OpenStreetMap contributors')} (ODbL)`,
        institutions: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0)`,
        catastrophes: () => `${link('https://www.ngdc.noaa.gov/hazard/', 'NOAA NCEI/WDS')} — ${esc(T('séismes, éruptions et tsunamis importants (domaine public)'))}`,
        navires: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0)`,
        phares: (osm) => `${link('https://www.wikidata.org', 'Wikidata')} (CC0)${osm ? ` · ${esc(T('portée :'))} ${link('https://www.openstreetmap.org/copyright', '© OpenStreetMap contributors')} (ODbL)` : ''}`
    };
    const SRC_TXT = {batailles: 'Wikidata (CC0)', voies: 'Itiner-e 2024, de Soto et al. 2025 (CC BY 4.0)', compostelle: '© OpenStreetMap contributors (ODbL)', institutions: 'Wikidata (CC0)',
        catastrophes: 'NOAA NCEI/WDS (domaine public)', navires: 'Wikidata (CC0)', phares: 'Wikidata (CC0) ; portée : © OpenStreetMap contributors (ODbL)'};
    const SRC_URL = {batailles: 'https://www.wikidata.org', voies: 'https://doi.org/10.5281/zenodo.17122148', compostelle: 'https://www.openstreetmap.org/copyright', institutions: 'https://www.wikidata.org',
        catastrophes: 'https://www.ngdc.noaa.gov/hazard/', navires: 'https://www.wikidata.org', phares: 'https://www.wikidata.org'};
    async function loadSome(kinds) { const out = {}; await Promise.all(kinds.map(async k => { try { out[k] = await load(k); } catch (e) { console.error(e); out[k] = null; } })); return out; }

    /* ─────────── les phrases ─────────── */
    const battleName = b => esc(String(b.n).replace(/^(Bataille|Siège|Combat|Prise|Bombardement|Massacre|Blocus|Escarmouche|Affaire)\b/, w => w.toLowerCase()));
    const battleDate = b => dateTxt(b.d, b.y);
    function battleLi(x, withAge, P) {
        const b = x.b, extra = [b.war ? esc(b.war) : '', b.bel.length ? esc(b.bel.slice(0, 4).join(' / ')) : ''].filter(Boolean).join(' · ');
        return `<li><b>${battleDate(b)}</b> : ${battleName(b)}, ${esc(x.place ? T('à {k} de {p}', {k: kmTxt(x.km), p: x.place}) : T('à {k}', {k: kmTxt(x.km)}))}${withAge && x.age !== null && x.age >= 0 ? ` (${esc(T('{p} a {a}', {p: P?.first || he(P), a: ageTxt(x.age)}))})` : ''}${extra ? ` <small class="muted">— ${extra}</small>` : ''} ${refLinks(b)}</li>`;
    }
    function battlesHtml(list, life) {
        if (!list.length) return '';
        const P = life.person, top = [...list].sort((a, b) => a.km - b.km)[0];
        const lead = T('{when}, {n} à {k} de {p}.', {when: whenTxt(top.b.d, top.b.y), n: battleName(top.b), k: kmTxt(top.km), p: esc(top.place)}) + (top.age !== null && top.age >= 0 ? ` ${T('{he} avait {a}.', {he: he(P), a: ageTxt(top.age)})}` : '');
        const others = list.length > 1 ? ` <span class="muted">${esc(T('({n} en tout pendant sa vie, à moins de 30 km)', {n: String(list.length)}))}</span>` : '';
        return row('⚔️', lead + others, SRC.batailles(), more(`<ul class="hist-ul">${list.map(x => battleLi(x, true, P)).join('')}</ul>`, list.length));
    }
    const KIND_DE = {hopital: 'l’hôpital', hoteldieu: 'l’hôtel-Dieu', hospice: 'l’hospice', orphelinat: 'l’orphelinat', enfants: 'l’hospice des enfants trouvés', prison: 'la prison', bagne: 'le bagne', asile: 'l’asile', couvent: 'le couvent', leproserie: 'la léproserie'};
    const instDates = i => [i.from !== null ? T('fondé en {y}', {y: yTxt(i.from)}) : '', i.to !== null ? T('fermé en {y}', {y: yTxt(i.to)}) : ''].filter(Boolean).join(', ');
    function institutionsHtml(r, life) {
        if (!r.acts.length && !r.foundling) return '';
        const P = life.person, out = [];
        const VERB = {birth: P?.gender === 'female' ? 'Née' : 'Né', death: P?.gender === 'female' ? 'Morte' : 'Mort'};
        for (const a of r.acts) {
            const d = instDates(a.i), y = num(a.event.year);
            const verb = VERB[a.what] || (a.event.type ? cap(a.event.type) : T('Événement'));
            const lead = a.named ? T('{v} {y} à {i}{d}.', {v: T(verb), y: y !== null ? T('en {y}', {y: String(y)}) : '', i: `<b>${esc(a.i.n)}</b>`, d: d ? ` (${esc(d)})` : ''})
                : T('{v} {y} « {addr} » : c’était peut-être {i}{d}, à {k}.', {v: T(verb), y: y !== null ? T('en {y}', {y: String(y)}) : '', addr: esc(a.event.address || a.event.description || a.event.place || ''), i: `<b>${esc(a.i.n)}</b>`, d: d ? ` (${esc(d)})` : '', k: kmTxt(a.km)});
            const oth = a.others.length ? `<ul class="hist-ul">${a.others.map(o => `<li>${esc(o.i.n)} <small class="muted">${esc([o.i.kinds.map(k => T(KIND_WORD[k])).join(', '), instDates(o.i), kmTxt(o.km)].filter(Boolean).join(' · '))}</small> ${refLinks(o.i)}</li>`).join('')}</ul>` : '';
            out.push(row('🏥', `${lead.replace(/ {2,}/g, ' ')} ${refLinks(a.i)}`, SRC.institutions(), more(oth ? `<p class="muted">${esc(T('Aussi tout près :'))}</p>${oth}` : '', a.others.length)));
        }
        if (r.foundling) {
            const f = r.foundling, y = num(f.event.year), top = f.list[0];
            const lead = T('Enfant trouvé ? Près de {p}{y} : {i}, à {k}.', {p: esc(f.event.place || ''), y: y !== null ? `, ${T('en {y}', {y: String(y)})}` : '', i: `<b>${esc(top.i.n)}</b>${instDates(top.i) ? ` (${esc(instDates(top.i))})` : ''}`, k: kmTxt(top.km)});
            const list = `<ul class="hist-ul">${f.list.map(o => `<li>${esc(o.i.n)} <small class="muted">${esc([o.i.kinds.map(k => T(KIND_WORD[k])).join(', '), instDates(o.i), kmTxt(o.km)].filter(Boolean).join(' · '))}</small> ${refLinks(o.i)}</li>`).join('')}</ul>
                <small class="muted hist-hyp">${esc(T('Ses notes parlent d’un enfant trouvé, abandonné ou de parents inconnus : les registres d’admission de ces hospices sont aux Archives départementales (série X ou H-dépôt).'))}</small>`;
            out.push(row('👶', lead, SRC.institutions(), more(list, f.list.length)));
        }
        return out.join('');
    }
    const EV_WORD = {eq: 'séisme', vo: 'éruption', ts: 'tsunami'};
    function disasterTitle(ev) {
        const titled = x => String(x).toLowerCase().replace(/(^|[\s'(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
        const where = [ev.k !== 'vo' && ev.loc ? titled(String(ev.loc).replace(/^[^:]+:\s*/, '').replace(/\s+/g, ' ')) : '', ev.country].filter(Boolean);
        const uniq = [...new Set(where.map(w => w.trim()))].join(', ');
        if (ev.k === 'vo') return T('éruption du volcan {v}{w}', {v: esc(ev.volcano || '?'), w: uniq ? ` (${esc(uniq)})` : ''});
        if (ev.k === 'ts') return T('tsunami{w}', {w: uniq ? ` (${esc(uniq)})` : ''}) + (num(ev.mag) ? `, ${esc(T('vague de {m} m', {m: dec(ev.mag)}))}` : '');
        return T('séisme{w}', {w: uniq ? ` (${esc(uniq)})` : ''}) + (num(ev.mag) ? `, ${esc(T('magnitude {m}', {m: dec(ev.mag)}))}` : '');
    }
    const deathsTxt = ev => (num(ev.deaths) ? T('{n} morts', {n: nf(ev.deaths)}) : '');
    function disastersHtml(list, life) {
        if (!list.length) return '';
        const P = life.person, worst = [...list].sort((a, b) => (num(b.ev.deaths) || 0) - (num(a.ev.deaths) || 0) || a.km - b.km)[0], ev = worst.ev;
        const lead = T('{when}, {t}{deaths}, à {k} de {p}.', {when: whenTxt(isoOf(ev.y, ev.m, ev.d), ev.y), t: disasterTitle(ev), deaths: deathsTxt(ev) ? ` : ${esc(deathsTxt(ev))}` : '', k: kmTxt(worst.km), p: esc(worst.place)})
            + (worst.age !== null && worst.age >= 0 ? ` ${T('{he} avait {a}.', {he: he(P), a: ageTxt(worst.age)})}` : '');
        const li = list.map(x => `<li><b>${dmyTxt(x.ev.y, x.ev.m, x.ev.d)}</b> : ${disasterTitle(x.ev)}${deathsTxt(x.ev) ? ` — ${esc(deathsTxt(x.ev))}` : ''} <small class="muted">${esc(T('à {k} de {p}', {k: kmTxt(x.km), p: x.place}))}</small></li>`).join('');
        return row('🌋', cap(lead), SRC.catastrophes(), more(`<ul class="hist-ul">${li}</ul><small class="muted hist-hyp">${esc(T('Sans doute ressenti : règle simple de l’app — séisme à 60 km (magnitude < 6), 120 km (6), 250 km (7), 400 km (8 et plus) ; éruption à 40 km (80 km si très forte) ; tsunami à 150 km de son origine. Seulement pour les lieux hors de la France métropolitaine (les séismes de France sont dans « 🏘 Le lieu à son époque »).'))}</small>`, list.length));
    }
    const shipImg = s => (s.img ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(s.img)}?width=320` : '');
    const shipFacts = s => [s.type, s.from !== null ? T('mis à l’eau ou en service en {y}', {y: yTxt(s.from)}) : '', s.wreck !== null ? T('naufrage en {y}', {y: yTxt(s.wreck)}) : (s.to !== null ? T('fin de service en {y}', {y: yTxt(s.to)}) : ''), s.port ? T('port d’attache : {p}', {p: s.port}) : '', s.flag].filter(Boolean).join(' · ');
    function shipsHtml(list, life) {
        if (!list.length) return '';
        const s = list[0];
        const lead = T('Marin : un navire de ce nom est écrit dans ses notes — {n} ({f}). {he} a peut-être servi à son bord.', {n: `<b>${esc(s.n)}</b>`, f: esc(shipFacts(s)), he: he(life.person)});
        const li = list.slice(1).map(x => `<li>${esc(x.n)} <small class="muted">${esc(shipFacts(x))}</small> ${refLinks(x)}</li>`).join('');
        const img = shipImg(s) ? `<img class="ha-img" loading="lazy" alt="${esc(s.n)}" src="${esc(shipImg(s))}">` : '';
        return row('⚓', `${lead} ${refLinks(s)}`, SRC.navires() + (s.img ? ` · ${esc(T('image : Wikimedia Commons'))}` : ''), more(`${img}${li ? `<p class="muted">${esc(T('D’autres navires du même nom :'))}</p><ul class="hist-ul">${li}</ul>` : ''}<small class="muted hist-hyp">${esc(T('Rapprochement par le nom seulement : vérifie dans son dossier d’inscrit maritime ou son registre matricule.'))}</small>`, list.length - 1 || null));
    }
    const lightFacts = l => [l.lit !== null ? T('allumé en {y}', {y: yTxt(l.lit)}) : l.from !== null ? T('construit en {y}', {y: yTxt(l.from)}) : '', l.to !== null ? T('éteint en {y}', {y: yTxt(l.to)}) : '', l.height ? T('{h} m de haut', {h: dec(l.height)}) : '', l.focal ? T('feu à {h} m au-dessus de la mer', {h: dec(l.focal)}) : ''].filter(Boolean).join(' · ');
    const rangeTxt = l => (l.range ? T('portée {nm} milles marins, soit {k} km', {nm: dec(l.range), k: String(Math.round(l.rangeKm))}) : '');
    function lightsKeeperHtml(list, life, osm) {
        if (!list.length) return '';
        const x = list[0], l = x.l;
        const lead = T('Gardien de phare : {n} est à {k} de {p}{f}.', {n: `<b>${esc(l.n)}</b>`, k: kmTxt(x.km), p: esc(x.place), f: [lightFacts(l), rangeTxt(l)].filter(Boolean).length ? ` (${esc([lightFacts(l), rangeTxt(l)].filter(Boolean).join(' ; '))})` : ''});
        const li = list.slice(1).map(y => `<li>${esc(y.l.n)} <small class="muted">${esc([kmTxt(y.km), lightFacts(y.l), rangeTxt(y.l)].filter(Boolean).join(' · '))}</small> ${refLinks(y.l)}</li>`).join('');
        return row('🗼', `${lead} ${refLinks(l)} <button type="button" class="link-button" data-ha-card="phares" data-ha-q="${esc(l.q)}">${esc(T('🗺 jusqu’où allait sa lumière'))}</button>`, SRC.phares(osm), more(li ? `<ul class="hist-ul">${li}</ul>` : '', list.length - 1 || null));
    }

    /* ─────────── 🧭 la fiche d'une personne ─────────── */
    const lifeMemo = new Map();
    const lifeOf = id => { if (!lifeMemo.has(id)) lifeMemo.set(id, A().api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    /** remplit un élément avec les lignes de la personne ; renvoie le nombre de lignes */
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || ['batailles', 'institutions', 'navires', 'phares', 'catastrophes']).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (e) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const need = want.filter(k => k !== 'navires' || isSailor(life) || opts.force).filter(k => k !== 'phares' || isKeeper(life) || opts.force);
        const D = await loadSome(need);
        if (!host.isConnected && !opts.detached) return 0;
        const html = [];
        if (D.batailles) html.push(battlesHtml(battlesForLife(D.batailles.rows, life, 30), life));
        if (D.institutions) html.push(institutionsHtml(institutionsForLife(D.institutions.rows, life), life));
        if (D.navires) html.push(shipsHtml(shipsForLife(D.navires.rows, life, {force: !!opts.force}), life));
        if (D.phares) html.push(lightsKeeperHtml(lighthousesForLife(D.phares.rows, {...life, jobs: opts.force ? [{text: 'gardien de phare'}] : life.jobs}), life, D.phares.meta.osm_ok));
        if (D.catastrophes) html.push(disastersHtml(disastersForLife(D.catastrophes.rows, life), life));
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life ha-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.histoire_autour = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PARTS.some(([k]) => on(k))) return '';
        return A().card(index, T('🧭 Histoire autour'), '', `<div class="ha-block" data-ha-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-ha-person]').forEach(async h => {
            const id = Number(h.dataset.haPerson); lifeMemo.delete(id);
            const n = await personInto(h, id);
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    function roadsHtml(list) {
        if (!list.length) return '';
        const x = list[0], r = x.row;
        const what = r.main ? T('la voie romaine') : T('une voie romaine secondaire');
        const lead = x.km < 0.3 ? T('{w} « {n} » passait ici.', {w: cap(what), n: esc(r.name.replace(/-/g, ' – '))}) : T('{w} « {n} » passait à {k}.', {w: cap(what), n: esc(r.name.replace(/-/g, ' – ')), k: kmTxt(x.km)});
        const CERT = ['tracé hypothétique', 'tracé supposé', 'tracé sûr'];
        const facts = rr => [T(CERT[rr.cert] || ''), rr.itin ? T('sur l’{i}', {i: rr.itin}) : '', rr.from !== null && rr.from !== undefined ? T('vers {y}', {y: yTxt(rr.from)}) : ''].filter(Boolean).join(' · ');
        const li = list.map(y => `<li><b>${esc(y.row.name.replace(/-/g, ' – '))}</b> ${esc(T('à {k}', {k: kmTxt(y.km)}))} <small class="muted">${esc([y.row.main ? T('voie principale') : T('voie secondaire'), facts(y.row)].filter(Boolean).join(' · '))}</small></li>`).join('');
        return row('🛣️', `${lead} <small class="muted">(${esc(facts(r))})</small>`, SRC.voies(), more(`<ul class="hist-ul">${li}</ul><small class="muted hist-hyp">${esc(T('Les noms sont ceux des villes antiques aux deux bouts du tronçon (ex. Lugdunum = Lyon). Tracés simplifiés à environ 100 m.'))}</small>`, list.length > 1 ? list.length : null));
    }
    function caminoHtml(list) {
        if (!list.length) return '';
        const x = list[0], r = x.row;
        const lead = x.km < 0.5 ? T('Sur le chemin de Compostelle : {n}.', {n: `<b>${esc(r.name)}</b>`}) : T('Le chemin de Compostelle {n} passe à {k}.', {n: `<b>${esc(r.name)}</b>`, k: kmTxt(x.km)});
        const li = list.map(y => `<li><b>${esc(y.row.name)}</b> ${esc(T('à {k}', {k: kmTxt(y.km)}))}${y.row.ref ? ` <small class="muted">${esc(y.row.ref)}</small>` : ''} ${y.row.osm ? link(`https://www.openstreetmap.org/relation/${y.row.osm}`, '↗ OpenStreetMap') : ''}</li>`).join('');
        return row('🐚', lead, SRC.compostelle(), more(`<ul class="hist-ul">${li}</ul><small class="muted hist-hyp">${esc(T('Ce sont les chemins balisés d’aujourd’hui, qui suivent souvent les routes des pèlerins d’autrefois.'))}</small>`, list.length > 1 ? list.length : null));
    }
    function battlesPlaceHtml(list, years) {
        if (!list.length) return '';
        const top = [...list].sort((a, b) => a.km - b.km)[0];
        const lead = (list.length > 1 ? T('{n} batailles ou sièges à moins de 15 km{y}. La plus proche : {b} ({d}), à {k}.', {n: String(list.length), y: years ? ` ${T('entre {a} et {b}', {a: years.from, b: years.to})}` : '', b: battleName(top.b), d: battleDate(top.b), k: kmTxt(top.km)})
            : T('{b} ({d}), à {k}.', {b: battleName(top.b), d: battleDate(top.b), k: kmTxt(top.km)}));
        return row('⚔️', cap(lead), SRC.batailles(), more(`<ul class="hist-ul">${list.map(x => battleLi(x, false)).join('')}</ul>`, list.length));
    }
    function instPlaceHtml(list) {
        if (!list.length) return '';
        const top = list[0];
        const lead = list.length > 1 ? T('{n} institutions à moins de 3 km : {i}{d}, à {k}…', {n: String(list.length), i: `<b>${esc(top.i.n)}</b>`, d: instDates(top.i) ? ` (${esc(instDates(top.i))})` : '', k: kmTxt(top.km)})
            : T('{i}{d}, à {k}.', {i: `<b>${esc(top.i.n)}</b>`, d: instDates(top.i) ? ` (${esc(instDates(top.i))})` : '', k: kmTxt(top.km)});
        const li = list.map(o => `<li>${esc(o.i.n)} <small class="muted">${esc([o.i.kinds.map(k => T(KIND_WORD[k])).join(', '), instDates(o.i), kmTxt(o.km)].filter(Boolean).join(' · '))}</small> ${refLinks(o.i)}</li>`).join('');
        return row('🏥', lead, SRC.institutions(), more(`<ul class="hist-ul">${li}</ul><small class="muted hist-hyp">${esc(T('Leurs archives (registres d’entrée, de décès, d’enfants trouvés) sont souvent aux Archives départementales ou municipales.'))}</small>`, list.length > 1 ? list.length : null));
    }
    function lightsPlaceHtml(list, osm) {
        if (!list.length) return '';
        const x = list[0], l = x.l;
        const lead = T('La lumière du phare {n} arrivait jusqu’ici : {r} ; le phare est à {k}.', {n: `<b>${esc(l.n)}</b>`, r: esc(rangeTxt(l)), k: kmTxt(x.km)});
        const li = list.map(y => `<li>${esc(y.l.n)} <small class="muted">${esc([kmTxt(y.km), rangeTxt(y.l), lightFacts(y.l)].filter(Boolean).join(' · '))}</small> <button type="button" class="link-button" data-ha-card="phares" data-ha-q="${esc(y.l.q)}">🗺</button></li>`).join('');
        return row('🗼', `${lead} <button type="button" class="link-button" data-ha-card="phares" data-ha-q="${esc(l.q)}">${esc(T('🗺 voir sur la carte'))}</button>`, SRC.phares(osm), more(`<ul class="hist-ul">${li}</ul><small class="muted hist-hyp">${esc(T('La portée est la distance où l’on voit le feu par temps clair (1 mille marin = 1,852 km).'))}</small>`, list.length > 1 ? list.length : null));
    }
    function disastersPlaceHtml(list, name) {
        if (!list.length) return '';
        const worst = [...list].sort((a, b) => (num(b.ev.deaths) || 0) - (num(a.ev.deaths) || 0))[0], ev = worst.ev;
        const lead = T('{n} catastrophes connues près de {p}. La plus meurtrière : {when}, {t}{deaths}.', {n: String(list.length), p: esc(name || T('ce lieu')), when: whenTxt(isoOf(ev.y, ev.m, ev.d), ev.y).toLowerCase(), t: disasterTitle(ev), deaths: deathsTxt(ev) ? ` (${esc(deathsTxt(ev))})` : ''});
        const li = list.map(x => `<li><b>${dmyTxt(x.ev.y, x.ev.m, x.ev.d)}</b> : ${disasterTitle(x.ev)}${deathsTxt(x.ev) ? ` — ${esc(deathsTxt(x.ev))}` : ''} <small class="muted">${esc(T('à {k}', {k: kmTxt(x.km)}))}</small></li>`).join('');
        return row('🌋', lead, SRC.catastrophes(), more(`<ul class="hist-ul">${li}</ul>`, list.length));
    }
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    /** le HTML d'un sujet pour un lieu ('' = rien à dire) */
    async function placePart(kind, place, opts = {}) {
        const ll = placeLL(place); if (!ll) return '';
        const D = await load(kind).catch(() => null); if (!D) return '';
        const years = opts.years || null;
        switch (kind) {
            case 'voies': return roadsHtml(linesNear(D.rows, ll.lat, ll.lon, 2));
            case 'compostelle': return caminoHtml(linesNear(D.rows, ll.lat, ll.lon, 2));
            case 'batailles': return battlesPlaceHtml(battlesNear(D.rows, ll.lat, ll.lon, 15, years), years);
            case 'institutions': return instPlaceHtml(institutionsNear(D.rows, ll.lat, ll.lon, 3));
            case 'phares': return lightsPlaceHtml(lighthousesReaching(D.rows, ll.lat, ll.lon), D.meta.osm_ok);
            case 'catastrophes': return farPlace({lat: ll.lat, lon: ll.lon, country: place.country || ''}) ? disastersPlaceHtml(disastersNear(D.rows, ll.lat, ll.lon, years), place.name) : '';
            default: return '';
        }
    }
    const PLACE_KINDS = ['voies', 'compostelle', 'batailles', 'institutions', 'phares', 'catastrophes'];
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place, opts).catch(() => '')));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel ha-panel"><h3>${esc(T('🧭 Histoire autour'))}</h3><div class="hist-life ha-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]');
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(), lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null};
    }
    function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-ha])'); if (!village) return;
        village.dataset.ha = '1';
        const place = villagePlace(village); if (!placeLL(place)) return;
        const anchor = village.querySelector('[data-mr-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="ha-place" data-ha-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-ha-host]'), place);
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune : une partie par sujet ─────────── */
    const MONO = [['voies', 'ha_voies', '🛣️', 'Voie romaine'], ['compostelle', 'ha_compostelle', '🐚', 'Chemin de Compostelle'], ['batailles', 'ha_batailles', '⚔️', 'Batailles et sièges des alentours'],
        ['institutions', 'ha_institutions', '🏥', 'Hôpitaux, hospices, prisons, couvents'], ['phares', 'ha_phares', '🗼', 'La lumière des phares'], ['catastrophes', 'ha_catastrophes', '🌋', 'Catastrophes du monde']];
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label]) => ({
        id, icon, label, group: kind === 'catastrophes' || kind === 'batailles' ? 'Le monde' : 'Le lieu', defaultOn: true, enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host) => {
            const html = await placePart(kind, place, {}); if (!html) return false;
            host.innerHTML = `<div class="hist-life ha-life">${html}</div>`; return true;
        }})));

    /* ─────────── 🗂 la carte d'une ligne (Listes, boutons 🗺) : faits, liens, petite carte avec le cercle de portée ─────────── */
    function miniMap(lat, lon, rKm, pts) {
        if (!A().lngToX || !A().mapTileUrl) return '';
        const W = 520, H = 320;
        let z = 12; if (rKm) { while (z > 3 && (rKm / (40075 * Math.cos(lat * RAD) / 2 ** (z + 8))) > Math.min(W, H) / 2 - 16) z--; }
        const px = A().lngToX(lon, z), py = A().latToY(lat, z), tiles = [];
        for (let x = Math.floor((px - W / 2) / 256); x <= Math.floor((px + W / 2) / 256); x++) for (let y = Math.floor((py - H / 2) / 256); y <= Math.floor((py + H / 2) / 256); y++) tiles.push(`<img alt="" loading="lazy" src="${esc(A().mapTileUrl('osmfr', z, x, y))}" style="left:${x * 256 - px + W / 2}px;top:${y * 256 - py + H / 2}px">`);
        const rPx = rKm ? rKm / (40075 * Math.cos(lat * RAD) / 2 ** (z + 8)) : 0;
        const line = (pts || []).map(l => `<polyline points="${l.map(([a, b]) => `${(A().lngToX(b, z) - px + W / 2).toFixed(1)},${(A().latToY(a, z) - py + H / 2).toFixed(1)}`).join(' ')}"/>`).join('');
        return `<div class="ha-map" style="width:${W}px;height:${H}px">${tiles.join('')}<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${rPx ? `<circle cx="${W / 2}" cy="${H / 2}" r="${rPx.toFixed(1)}" class="ha-range"/>` : ''}${line}<circle cx="${W / 2}" cy="${H / 2}" r="5" class="ha-dot"/></svg></div>`;
    }
    function openCard(kind, r) {
        let title = r.n || r.name || '', body = '';
        if (kind === 'phares') {
            body = `<p>${esc([lightFacts(r), r.country].filter(Boolean).join(' · '))}</p>${r.range ? `<p><b>${esc(T('Jusqu’où allait sa lumière :'))}</b> ${esc(rangeTxt(r))}${r.rangeSrc === 'osm' ? ` <small class="muted">(${esc(T('portée d’OpenStreetMap'))})</small>` : ''}.</p>` : `<p class="muted">${esc(T('Sa portée n’est pas connue dans les données.'))}</p>`}
                ${miniMap(r.lat, r.lon, r.rangeKm, null)}${r.img ? `<img class="ha-img" loading="lazy" alt="" src="${esc(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(r.img)}?width=320`)}">` : ''}`;
        } else if (kind === 'batailles') {
            body = `<p><b>${esc(dateTxt(r.d, r.y))}</b>${r.y2 && r.y2 !== r.y ? ` → ${esc(dateTxt(r.d2, r.y2))}` : ''}</p><p>${esc([r.war, r.bel && r.bel.length ? r.bel.join(' / ') : '', r.loc, r.country].filter(Boolean).join(' · '))}</p>${miniMap(r.lat, r.lon, 0, null)}`;
        } else if (kind === 'navires') {
            body = `<p>${esc(shipFacts(r))}${r.operator ? ` · ${esc(r.operator)}` : ''}</p>${shipImg(r) ? `<img class="ha-img" loading="lazy" alt="" src="${esc(shipImg(r))}">` : ''}`;
        } else if (kind === 'institutions') {
            body = `<p>${esc([r.kinds.map(k => T(KIND_WORD[k])).join(', '), instDates(r), r.commune, r.country].filter(Boolean).join(' · '))}</p>${miniMap(r.lat, r.lon, 0, null)}`;
        } else if (kind === 'catastrophes') {
            title = cap(disasterTitle(r).replace(/<[^>]+>/g, ''));
            body = `<p><b>${esc(dmyTxt(r.y, r.m, r.d))}</b>${deathsTxt(r) ? ` — ${esc(deathsTxt(r))}` : ''}</p>${miniMap(r.lat, r.lon, reachKm(r), null)}<small class="muted">${esc(T('Le cercle : la zone où l’app pense qu’il a été ressenti (règle simple).'))}</small>`;
        } else if (kind === 'voies' || kind === 'compostelle') {
            title = kind === 'voies' ? r.name.replace(/-/g, ' – ') : r.name;
            const c = r.lines[0][Math.floor(r.lines[0].length / 2)];
            body = `<p>${esc(kind === 'voies' ? [r.main ? T('voie principale') : T('voie secondaire'), T(['tracé hypothétique', 'tracé supposé', 'tracé sûr'][r.cert] || ''), r.itin, T('{n} km', {n: nf(r.km)})].filter(Boolean).join(' · ') : [r.ref, r.network, r.from && r.to ? `${r.from} → ${r.to}` : '', T('{n} km', {n: nf(r.km)})].filter(Boolean).join(' · '))}</p>${miniMap(c[0], c[1], Math.max(2, Math.min(r.km / 2, 120)), r.lines)}`;
        }
        const src = (SRC[kind] || (() => ''))(r.rangeSrc === 'osm');
        const links = kind === 'compostelle' ? link(`https://www.openstreetmap.org/relation/${r.osm}`, '↗ OpenStreetMap') : refLinks(r);
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l ha-dialog';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">${esc(T('🧭 HISTOIRE AUTOUR'))}</span><h2>${esc(title)}</h2></div><button type="button" class="icon-button" data-ha-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="ha-body">${body}<p>${links}</p><small class="hist-src">${esc(T('Source :'))} ${src}</small></div><div class="modal-actions"><span class="spacer"></span><button type="submit" class="button secondary">${esc(T('Fermer'))}</button></div></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.querySelector('[data-ha-x]').addEventListener('click', () => dlg.close()); dlg.showModal();
    }
    document.addEventListener('click', async e => {
        const b = e.target.closest?.('[data-ha-card]'); if (!b) return;
        e.preventDefault();
        const D = await load(b.dataset.haCard).catch(() => null); const r = D?.rows.find(x => x.q === b.dataset.haQ); if (r) openCard(b.dataset.haCard, r);
    });

    /* ─────────── 📋 Listes : une liste par sujet (moteur commun app-listes-donnees.js) ─────────── */
    const rowsOf = kind => load(kind).then(D => (D ? D.rows : []));
    const yr = v => (num(v) === null ? null : Number(v));
    const CERT_TXT = ['hypothétique', 'supposé', 'sûr'];
    const isoD = (y, m, d) => (y > 0 && m ? `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}${d ? '-' + String(d).padStart(2, '0') : ''}` : '');
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'ha_batailles', icon: '⚔️', label: T('Batailles et sièges'), group: 'Le monde', source: SRC_TXT.batailles, sourceUrl: SRC_URL.batailles,
            load: async () => (await rowsOf('batailles')).map(b => ({...b, name: b.n, year: b.y, date: b.d || '', end: b.y2, belligerents: b.bel.join(' / '), place: b.loc, url: b.frwiki ? wpUrl(b.frwiki) : wdUrl(b.q)})),
            fields: [{key: 'name', label: T('Bataille'), type: 'text'}, {key: 'date', label: T('Date'), type: 'date'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'war', label: T('Guerre'), type: 'enum'},
                {key: 'belligerents', label: T('Camps'), type: 'text'}, {key: 'place', label: T('Lieu'), type: 'text'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'url', label: T('Article'), type: 'url'}],
            period: r => [r.y, r.y2 ?? r.y], geo: r => [r.lat, r.lon], open: r => openCard('batailles', r)},
        {id: 'ha_voies_romaines', icon: '🛣️', label: T('Voies romaines'), group: 'Le monde', source: SRC_TXT.voies, sourceUrl: SRC_URL.voies,
            load: async () => (await rowsOf('voies')).map(r => ({...r, kind: r.main ? T('voie principale') : T('voie secondaire'), certainty: T(CERT_TXT[r.cert] || ''), itinerary: r.itin, length: r.km})),
            fields: [{key: 'name', label: T('Voie (villes antiques)'), type: 'text'}, {key: 'kind', label: T('Importance'), type: 'enum', values: [T('voie principale'), T('voie secondaire')]}, {key: 'certainty', label: T('Tracé'), type: 'enum', values: CERT_TXT.map(x => T(x))},
                {key: 'from', label: T('Construite vers'), type: 'year'}, {key: 'itinerary', label: T('Itinéraire antique'), type: 'text'}, {key: 'length', label: T('Longueur (km)'), type: 'number'}],
            period: r => [yr(r.from), yr(r.to)], geo: r => r.lines[0][Math.floor(r.lines[0].length / 2)], geoLine: r => r.lines[0], geoLines: r => r.lines, open: r => openCard('voies', r)},
        {id: 'ha_compostelle', icon: '🐚', label: T('Chemins de Compostelle'), group: 'Le monde', source: SRC_TXT.compostelle, sourceUrl: SRC_URL.compostelle,
            load: async () => (await rowsOf('compostelle')).map(r => ({...r, length: r.km, url: `https://www.openstreetmap.org/relation/${r.osm}`})),
            fields: [{key: 'name', label: T('Chemin'), type: 'text'}, {key: 'ref', label: T('Balisage'), type: 'text'}, {key: 'network', label: T('Réseau'), type: 'enum'}, {key: 'from', label: T('Départ'), type: 'text'}, {key: 'to', label: T('Arrivée'), type: 'text'}, {key: 'length', label: T('Longueur (km)'), type: 'number'}, {key: 'url', label: 'OpenStreetMap', type: 'url'}],
            geo: r => r.lines[0][0], geoLine: r => r.lines[0], geoLines: r => r.lines, open: r => openCard('compostelle', r)},
        {id: 'ha_institutions', icon: '🏥', label: T('Hôpitaux, hospices, enfants trouvés, prisons, couvents'), group: 'Le lieu', source: SRC_TXT.institutions, sourceUrl: SRC_URL.institutions,
            load: async () => (await rowsOf('institutions')).map(r => ({...r, name: r.n, kind: r.kinds.map(k => T(KIND_WORD[k])).join(', '), founded: r.from, closed: r.to, url: r.frwiki ? wpUrl(r.frwiki) : wdUrl(r.q)})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'kind', label: T('Genre'), type: 'enum', values: Object.values(KIND_WORD).map(x => T(x))}, {key: 'founded', label: T('Fondé'), type: 'year'}, {key: 'closed', label: T('Fermé'), type: 'year'},
                {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'url', label: T('Article'), type: 'url'}],
            period: r => [yr(r.from), yr(r.to)], geo: r => [r.lat, r.lon], open: r => openCard('institutions', r)},
        {id: 'ha_catastrophes', icon: '🌋', label: T('Séismes, éruptions et tsunamis du monde'), group: 'Le monde', source: SRC_TXT.catastrophes, sourceUrl: SRC_URL.catastrophes,
            load: async () => (await rowsOf('catastrophes')).map(r => ({...r, kind: T(EV_WORD[r.k]), year: r.y, date: isoD(r.y, r.m, r.d), place: [r.volcano, r.loc].filter(Boolean).join(' — '), magnitude: r.k === 'vo' ? null : r.mag, vei: r.k === 'vo' ? r.mag : null})),
            fields: [{key: 'kind', label: T('Catastrophe'), type: 'enum', values: Object.values(EV_WORD).map(x => T(x))}, {key: 'date', label: T('Date'), type: 'date'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'place', label: T('Lieu'), type: 'text'},
                {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'magnitude', label: T('Magnitude ou vague (m)'), type: 'number'}, {key: 'vei', label: T('Force de l’éruption (VEI)'), type: 'number'}, {key: 'deaths', label: T('Morts'), type: 'number'}],
            period: r => [r.y, r.y], geo: r => [r.lat, r.lon], geoCircle: r => ({lat: r.lat, lon: r.lon, km: reachKm(r)}), open: r => openCard('catastrophes', r)},
        {id: 'ha_navires', icon: '⚓', label: T('Navires'), group: 'Chercher', source: SRC_TXT.navires, sourceUrl: SRC_URL.navires,
            load: async () => (await rowsOf('navires')).map(r => ({...r, name: r.n, launched: r.from, end: r.to, url: r.frwiki ? wpUrl(r.frwiki) : wdUrl(r.q)})),
            fields: [{key: 'name', label: T('Navire'), type: 'text'}, {key: 'type', label: T('Genre'), type: 'enum'}, {key: 'launched', label: T('Mis à l’eau ou en service'), type: 'year'}, {key: 'end', label: T('Fin de service'), type: 'year'},
                {key: 'wreck', label: T('Naufrage'), type: 'year'}, {key: 'port', label: T('Port d’attache'), type: 'text'}, {key: 'flag', label: T('Pavillon'), type: 'enum'}, {key: 'operator', label: T('Armateur'), type: 'text'}, {key: 'url', label: T('Article'), type: 'url'}],
            period: r => [yr(r.from), yr(r.to)], open: r => openCard('navires', r)},
        {id: 'ha_phares', icon: '🗼', label: T('Phares et leur portée'), group: 'Le lieu', source: SRC_TXT.phares, sourceUrl: SRC_URL.phares,
            load: async () => (await rowsOf('phares')).map(r => ({...r, name: r.n, lit: r.lit ?? r.from, built: r.from, off: r.to, rangeNm: r.range, rangeKmV: r.rangeKm, url: r.frwiki ? wpUrl(r.frwiki) : wdUrl(r.q)})),
            fields: [{key: 'name', label: T('Phare'), type: 'text'}, {key: 'lit', label: T('Allumé en'), type: 'year'}, {key: 'off', label: T('Éteint en'), type: 'year'}, {key: 'rangeNm', label: T('Portée (milles marins)'), type: 'number'}, {key: 'rangeKmV', label: T('Portée (km)'), type: 'number'},
                {key: 'height', label: T('Hauteur (m)'), type: 'number'}, {key: 'focal', label: T('Hauteur du feu (m)'), type: 'number'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'url', label: T('Article'), type: 'url'}],
            period: r => [yr(r.lit ?? r.from), yr(r.to)], geo: r => [r.lat, r.lon], geoCircle: r => (r.rangeKm ? {lat: r.lat, lon: r.lon, km: r.rangeKm} : null), open: r => openCard('phares', r)});

    /* ─────────── 🧰 le registre commun des données : à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', country: pl.country || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    const EMPTY = {batailles: 'Aucune bataille connue à moins de 15 km de ce lieu.', voies: 'Aucune voie romaine connue à moins de 2 km.', compostelle: 'Aucun chemin de Compostelle balisé à moins de 2 km.',
        institutions: 'Aucune institution connue à moins de 3 km.', phares: 'Aucun phare dont la lumière arrivait jusqu’ici.', catastrophes: 'Rien (ce sujet est pour les lieux hors de la France métropolitaine).'};
    async function runPlace(kind, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl || !placeLL(pl)) { host.innerHTML = emptyLine(T('Choisis un lieu placé sur la carte.'), '📍'); return null; }
        const y = num(ctx.year), html = await placePart(kind, pl, {years: y !== null && kind === 'batailles' ? {from: y - 10, to: y + 10} : null});
        host.innerHTML = html ? `<div class="hist-life ha-life">${html}</div>` : emptyLine(T(EMPTY[kind]), 'ℹ️');
        return !!html;
    }
    async function runPerson(parts, ctx, host, empty) {
        const id = personOfCtx(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true});
        if (!n) host.innerHTML = emptyLine(T(empty), 'ℹ️');
        return n;
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'ha_personne', icon: '🧭', label: T('Histoire autour de sa vie (batailles, institutions, catastrophes)'), group: 'La personne', needs: ['person'], installed: () => true,
            run: (ctx, host) => runPerson(['batailles', 'institutions', 'catastrophes'], ctx, host, 'Rien trouvé autour de sa vie : il faut des lieux placés sur la carte et des dates.')},
        {id: 'ha_navire', icon: '⚓', label: T('Le navire du marin'), group: 'La personne', needs: ['person'], installed: () => true,
            run: (ctx, host) => runPerson(['navires'], ctx, host, 'Aucun navire connu n’est nommé dans ses notes ou ses actes.')},
        {id: 'ha_gardien_phare', icon: '🗼', label: T('Les phares près de ses lieux'), group: 'La personne', needs: ['person'], installed: () => true,
            run: (ctx, host) => runPerson(['phares'], ctx, host, 'Aucun phare connu à moins de 30 km de ses lieux.')},
        ...MONO.map(([kind, id, icon, label]) => ({id, icon, label: T(label), group: kind === 'catastrophes' || kind === 'batailles' ? 'Le monde' : 'Le lieu', needs: kind === 'batailles' ? ['place', 'year'] : ['place'], installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})));

    /* ─────────── ⚙️ Réglages → 🧭 Histoire autour ─────────── */
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(Object.keys(FILES).map(async k => { try { const D = await load(k); if (D) metas[k] = {meta: D.meta, n: D.rows.length}; } catch (_) {} }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-ha-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const rows = PARTS.map(([k, label]) => { const m = metas[k]; if (!m) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(T('Fichier absent.'))}</td></tr>`;
            const mm = m.meta; return `<tr><td>${esc(T(label))}</td><td>${link(mm.url, mm.source)}${mm.paper ? ` · ${link(mm.paper, T('l’article'))}` : ''}</td><td>${esc(nf(m.n))}</td><td>${esc(mm.licence)}${mm.mention ? ` — « ${esc(mm.mention)} »` : ''}${mm.range_osm && mm.osm_ok ? `<br><small>${esc(T('portée : {s}', {s: `${mm.range_osm.mention} (${mm.range_osm.licence})`}))}</small>` : ''}</td><td>${esc(mm.built || '')}</td></tr>`; }).join('');
        ws.innerHTML = `<section class="page cplus-settings ha-settings" data-ha-settings>${UI().pageHeader ? UI().pageHeader({title: T('Histoire autour'), icon: '🧭', where: T('Réglages · Données'), help: esc(T('Batailles, voies romaines, chemins de Compostelle, hôpitaux et hospices, catastrophes, navires et phares, autour des lieux et des vies de ta famille. Tout est livré avec l’app : rien n’est envoyé sur Internet.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🧭 Histoire autour »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="muted">${esc(T('Les rapprochements (une bataille à moins de 30 km, une institution nommée dans l’adresse d’un acte, un navire nommé dans une note) sont faits par l’app : ce sont des pistes, à vérifier dans les archives.'))}</p></div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-ha-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.haTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'metiers_rivieres'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'histoire_autour')) { let i = B.findIndex(b => b[0] === 'histoire'); if (i < 0) i = B.findIndex(b => b[0] === 'world'); B.splice(i < 0 ? B.length : i + 1, 0, ['histoire_autour', '🧭 Histoire autour']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.histoire_autour ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.histoireAutour = {...core, load, settings, personInto, placeInto, placePart, openCard, lifeOf, openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
