/**
 * LCNDA — 🕰 Son époque et son travail : ce que la vie de tous les jours devait à son temps.
 * Données livrées avec l'app (assets/data/et-*.json.gz, refaites par scripts/epoque-travail/build.py, lues à la demande) :
 *   🐛 et-fleaux      les fléaux des cultures et des élevages (phylloxéra, oïdium, mildiou, pébrine…), par département, avec la
 *                     phrase de la source (Wikipédia, CC BY-SA 4.0)
 *   ✊ et-greves      grèves et conflits du travail datés et placés (Wikidata, CC0 ; et les catégories « Grève en France »… de Wikipédia)
 *   🌉 et-ouvrages    ponts, canaux, écluses, tunnels, aqueducs datés (Wikidata, CC0)
 *   💡 et-nouveautes  les nouveautés et leur arrivée en France ou dans le monde, chacune avec sa phrase (Wikipédia, CC BY-SA 4.0)
 *   📚 et-livres      les livres célèbres, par année de parution (Wikidata, CC0)
 *   👗 et-mode        gravures de mode et photos par décennie (Wikimedia Commons : auteur et licence de chaque image ; les images
 *                     ne sont pas livrées, elles s'affichent depuis Commons) + 📷 les formats des photos anciennes (Wikipédia)
 * Ce que ça montre (une phrase d'abord, le détail plié « ▸ plus » ; rien quand il n'y a rien) :
 *   · fiche d'une personne, bloc « 🕰 Son époque » : le fléau qui touche son métier dans son département, la grève près de
 *     chez lui (≤ 20 km) pendant sa vie active, l'ouvrage d'art de son métier (éclusier, batelier, terrassier…), ce qui n'existait
 *     pas encore à sa naissance et ce qui existait à sa mort, la mode de ses 20 ans et de son mariage, le livre de ses 20 ans ;
 *   · fiche d'un village et Monographie de commune : 🐛 fléaux du département, ✊ grèves des alentours, 🌉 ouvrages d'art ;
 *   · Listes (registre LCNDA_EXT.dataLists) ; à la demande (LCNDA_EXT.dataSources) ;
 *   · 📷 « Dater une photo ancienne » : le petit guide des formats + les gravures de mode des décennies possibles, côte à côte
 *     (bouton « 📷 Dater » dans la visionneuse des photos) ;
 *   · Réglages → « 🕰 Son époque » : chaque sujet s'éteint (localStorage « genealogie-epoque-travail »), À propos des données.
 * Le serveur donne seulement la vie d'une personne (ha_life, lib/histoire_autour.php, lecture seule). Tout le reste se calcule ici.
 *   window.LCNDA_EXT.epoqueTravail = {load, core…, personInto, placeInto, openPhotoDating}   (Node : module.exports = core)
 * Essai : tests/test-epoque-travail.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const RAD = Math.PI / 180;
    function km(a, b, c, d) { const x = Math.sin((c - a) * RAD / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin((d - b) * RAD / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const table = f => (f.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries(f.fields.map((k, i) => [k, r[i] ?? null])) : r));

    /* ── la vie d'une personne (réponse de ha_life) ── */
    function lifeSpan(life) {
        const ys = (life.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life.person?.birth), d = num(life.person?.death);
        const from = b ?? (ys.length ? Math.min(...ys) : null), to = d ?? (ys.length ? Math.max(...ys, from ?? -Infinity) : from);
        return {from, to, birth: b, death: d};
    }
    const geoPlaces = life => (life.places || []).filter(p => num(p.lat) !== null && num(p.lon) !== null && !(Number(p.lat) === 0 && Number(p.lon) === 0));
    const age = (life, y) => (num(life.person?.birth) !== null && y !== null ? y - Number(life.person.birth) : null);
    const jobsText = life => (life.jobs || []).map(j => j.text).join(' ; ');
    /** le premier métier qui répond à une règle → son texte (« vigneron ») ou '' */
    function jobMatch(life, rx) { const re = rx instanceof RegExp ? rx : new RegExp(rx, 'i'); const j = (life.jobs || []).find(x => re.test(fold(x.text)) || re.test(String(x.text || '').toLowerCase())); return j ? String(j.text).trim() : ''; }
    /** le département (code « 19 », « 2A ») d'un lieu : code INSEE, sinon le nom du département dans la fiche du lieu */
    const DEPT_NAMES = {'ain': '01', 'aisne': '02', 'allier': '03', 'alpes-de-haute-provence': '04', 'basses-alpes': '04', 'hautes-alpes': '05', 'alpes-maritimes': '06', 'ardeche': '07', 'ardennes': '08', 'ariege': '09', 'aube': '10', 'aude': '11', 'aveyron': '12', 'bouches-du-rhone': '13', 'calvados': '14', 'cantal': '15', 'charente': '16', 'charente-maritime': '17', 'charente-inferieure': '17', 'cher': '18', 'correze': '19', 'cote-d\'or': '21', 'cotes-d\'armor': '22', 'cotes-du-nord': '22', 'creuse': '23', 'dordogne': '24', 'doubs': '25', 'drome': '26', 'eure': '27', 'eure-et-loir': '28', 'finistere': '29', 'gard': '30', 'haute-garonne': '31', 'gers': '32', 'gironde': '33', 'herault': '34', 'ille-et-vilaine': '35', 'indre': '36', 'indre-et-loire': '37', 'isere': '38', 'jura': '39', 'landes': '40', 'loir-et-cher': '41', 'loire': '42', 'haute-loire': '43', 'loire-atlantique': '44', 'loire-inferieure': '44', 'loiret': '45', 'lot': '46', 'lot-et-garonne': '47', 'lozere': '48', 'maine-et-loire': '49', 'manche': '50', 'marne': '51', 'haute-marne': '52', 'mayenne': '53', 'meurthe-et-moselle': '54', 'meuse': '55', 'morbihan': '56', 'moselle': '57', 'nievre': '58', 'nord': '59', 'oise': '60', 'orne': '61', 'pas-de-calais': '62', 'puy-de-dome': '63', 'pyrenees-atlantiques': '64', 'basses-pyrenees': '64', 'hautes-pyrenees': '65', 'pyrenees-orientales': '66', 'bas-rhin': '67', 'haut-rhin': '68', 'rhone': '69', 'haute-saone': '70', 'saone-et-loire': '71', 'sarthe': '72', 'savoie': '73', 'haute-savoie': '74', 'paris': '75', 'seine': '75', 'seine-maritime': '76', 'seine-inferieure': '76', 'seine-et-marne': '77', 'yvelines': '78', 'seine-et-oise': '78', 'deux-sevres': '79', 'somme': '80', 'tarn': '81', 'tarn-et-garonne': '82', 'var': '83', 'vaucluse': '84', 'vendee': '85', 'vienne': '86', 'haute-vienne': '87', 'vosges': '88', 'yonne': '89', 'territoire de belfort': '90', 'essonne': '91', 'hauts-de-seine': '92', 'seine-saint-denis': '93', 'val-de-marne': '94', 'val-d\'oise': '95', 'corse-du-sud': '2A', 'haute-corse': '2B'};
    function deptOf(p) {
        const ins = String(p?.insee || '').trim().toUpperCase();
        if (/^(\d{5}|2[AB]\d{3})$/.test(ins)) return ins.startsWith('97') ? ins.slice(0, 3) : ins.slice(0, 2);
        const c = fold(p?.county || p?.dept || '').replace(/\s*\(.*\)$/, '').replace(/^departement (du |de la |de l'|des |de )?/, '').replace(/ /g, '-').replace('territoire-de-belfort', 'territoire de belfort');
        if (DEPT_NAMES[c]) return DEPT_NAMES[c];
        // « Tulle, Corrèze, Limousin, France » : un morceau du nom complet
        for (const part of String(p?.full || '').split(/[,·|()–—]/).map(s => fold(s).replace(/ /g, '-'))) if (DEPT_NAMES[part]) return DEPT_NAMES[part];
        return '';
    }
    const isFrance = p => !p?.country || /^(france|fr|fra|republique francaise)$/.test(fold(p.country));

    /* ── 🐛 les fléaux ── */
    /** les lignes du fichier → [{f, y, prec, deps, zone, sentence, url, title, …fleau}] (une par département et par fléau : la plus ancienne) */
    function prepFleaux(f) {
        const meta = f.fleaux || {};
        return (f.rows || []).map(r => ({...r, ...(meta[r.f] ? {icon: meta[r.f].icon, name: meta[r.f].name, jobs: meta[r.f].jobs} : {})}));
    }
    /** pour un département : le premier passage de chaque fléau (« * » = toute la France) */
    function fleauxForDept(rows, dep) {
        const by = new Map();
        for (const r of rows) {
            if (!(r.deps || []).includes(dep) && !(r.deps || []).includes('*')) continue;
            const cur = by.get(r.f);
            const exact = (r.deps || []).includes(dep);
            // un passage propre au département passe avant « toute la France » ; sinon le plus ancien
            if (!cur || (exact && !cur.exact) || (exact === cur.exact && r.y < cur.r.y)) by.set(r.f, {r, exact});
        }
        return [...by.values()].map(x => ({...x.r, exact: x.exact})).sort((a, b) => a.y - b.y);
    }
    const STRONG = {phylloxera: /vigner|viticult|vigne|tonnel|vendang/i, oidium: /vigner|viticult|vigne|vendang/i, mildiou_vigne: /vigner|viticult|vigne/i, black_rot: /vigner|viticult|vigne/i,
        mildiou_pdt: /cultivateur|laboureur|agricult|fermier|metayer|paysan|jardinier|maraich|menager/i, pebrine: /sericicult|magnan|vers? a soie|fileu|moulin|soie|devideu|ovalist/i};
    /** 🐛 le fléau qui touche son métier, dans un département où il vivait, pendant sa vie (adulte ou enfant : on le dit) */
    function fleauxForLife(rows, life) {
        const {from, to} = lifeSpan(life);
        if (from === null) return [];
        const deps = new Map();
        for (const p of life.places || []) { if (!isFrance(p)) continue; const d = deptOf(p); if (d && !deps.has(d)) deps.set(d, p); }
        if (!deps.size) return [];
        const out = [], seen = new Set();
        for (const [dep, p] of deps) {
            for (const r of fleauxForDept(rows, dep)) {
                if (seen.has(r.f)) continue;
                const yEnd = r.prec === 'decennie' ? r.y + 9 : r.prec === 'apres' ? r.y + 10 : r.y;
                const adult = life.person?.birth != null ? Number(life.person.birth) + 14 : from; // « il était vigneron » : déjà en âge de travailler
                if (yEnd < adult || r.y > to) continue;
                const strong = jobMatch(life, STRONG[r.f] || /$^/), weak = strong ? '' : jobMatch(life, r.jobs || '$^');
                if (!strong && !weak) continue;
                seen.add(r.f);
                out.push({r, dep, place: p.name || '', job: strong || weak, strong: !!strong, age: age(life, r.y)});
            }
        }
        return out.sort((a, b) => Number(b.strong) - Number(a.strong) || Number(!!b.r.exact) - Number(!!a.r.exact) || a.r.y - b.r.y);
    }

    /* ── ✊ les grèves ── */
    // l'industrie d'une grève (clé posée par build.py) → les métiers qui en sont
    const IND_JOBS = {mine: /mineur|houilleur|herscheur|galibot|porion|ardoisier|carrier|piqueur|boiseur|charbonn|mines?\b/, rail: /cheminot|chemin de fer|aiguilleur|garde-barriere|poseur de voie|homme d'equipe|mecanicien|chauffeur|lampiste|chef de gare|serre-frein|employe (de|a la) (compagnie|gare)/,
        port: /docker|portefaix|debardeur|arrimeur|charbonnier du port|ouvrier du port/, textile: /tisser|tisseu|fileu|filateur|canut|soie|ovalist|teintur|bonnet|dentel|cardeu|peigneu|lainier|cotonn|ourdiss|devideu|tullist|passementi/,
        metal: /metallurg|siderurg|forgeron|forgeur|fondeur|lamineu|puddleu|ajusteur|tourneur|chaudronn|mouleur|ouvrier d'usine|riveur|metallo/, peche: /pecheu?r|sardini|marin|matelot|conserv|friteuse/,
        agri: /vigner|viticult|cultivateur|laboureur|journalier|ouvrier agricole|fermier|metayer|bucheron|resinier|paysan/, batiment: /macon|terrassier|charpentier|couvreur|platrier|tailleur de pierre|manoeuvre|cimentier|paveur/,
        verre: /verrier|souffleur de verre|verrerie/, poste: /postier|facteur|telegraph|employe des postes|ptt/, transport: /cocher|conducteur|traminot|wattman|chauffeur|camionneur|charretier|voiturier|roulier/,
        vetement: /couturi|modiste|lingere|midinette|tailleu|chapeli|cordonn|piqueuse|giletiere|ganti|corsetiere|brodeuse/, tabac: /cigari|tabac|allumett/, enseignement: /instituteur|institutrice|professeur|enseignant/,
        sante: /infirmi|medecin|hospitali/, imprimerie: /typograph|imprimeu|compositeur|relieu|lithograph/};
    const IND_WORD = {mine: 'les mines', rail: 'les chemins de fer', port: 'le port', textile: 'le textile', metal: 'la métallurgie', peche: 'la pêche', agri: 'les champs et les vignes', batiment: 'le bâtiment',
        verre: 'la verrerie', poste: 'les postes', transport: 'les transports', vetement: 'le vêtement', tabac: 'le tabac', enseignement: 'l’école', sante: 'la santé', imprimerie: 'l’imprimerie'};
    /** ✊ les grèves à moins de `radius` km de ses lieux (ou de la région touchée) pendant sa vie active (14–70 ans, ou toute la vie connue) */
    function strikesForLife(rows, life, radius = 20) {
        const {from, to, birth} = lifeSpan(life), pls = geoPlaces(life);
        if (from === null) return [];
        const a = birth !== null ? birth + 14 : from, z = Math.min(to ?? from, birth !== null ? birth + 70 : Infinity);
        const out = [];
        for (const s of rows) {
            if (s.y < a || s.y > z) continue;
            const ind = s.ind && IND_JOBS[s.ind] ? jobMatch(life, IND_JOBS[s.ind]) : '';
            if (s.r === -1 || s.lat === null) {
                // une grève de tout un pays : seulement si elle touche son métier et son pays
                if (!ind || !pls.some(p => (fold(p.country || 'france') === fold(s.country || '')) || (isFrance(p) && /france/i.test(s.country || '')))) continue;
                out.push({s, km: null, place: '', job: ind, age: age(life, s.y), national: true});
                continue;
            }
            let best = null;
            for (const p of pls) { const k = Math.max(0, km(p.lat, p.lon, s.lat, s.lon) - (s.r || 0)); if (k <= radius && (!best || k < best.km)) best = {km: k, place: p.name}; }
            if (best) out.push({s, ...best, job: ind, age: age(life, s.y)});
        }
        return out.sort((x, y) => Number(!!y.job) - Number(!!x.job) || (x.national ? 1 : 0) - (y.national ? 1 : 0) || (x.km ?? 99) - (y.km ?? 99) || x.s.y - y.s.y);
    }
    function strikesNear(rows, lat, lon, radius = 20) {
        return rows.filter(s => s.lat !== null && s.r !== -1).map(s => ({s, km: Math.max(0, km(lat, lon, s.lat, s.lon) - (s.r || 0))})).filter(x => x.km <= radius).sort((a, b) => a.s.y - b.s.y);
    }

    /* ── 🌉 les ouvrages d'art ── */
    const KIND = {pont: 'pont', canal: 'canal', ecluse: 'écluse', tunnel: 'tunnel', aqueduc: 'aqueduc'};
    // métier → les ouvrages qui le concernent, et à quelle distance
    const WORKS_JOBS = [
        [/eclusier|garde[- ]ecluse|pontier|garde[- ]canal|gardien d'ecluse/, ['ecluse', 'canal'], 8, 'keeper'],
        [/batelier|marinier|haleur|flotteur|voiturier par eau|patron de peniche|peniche|chalandier|gabarier|passeur/, ['canal', 'ecluse', 'pont'], 10, 'boat'],
        [/pontonnier|gardien de pont|peage du pont|receveur du pont/, ['pont'], 5, 'keeper'],
        [/terrassier|mineur de tunnel|puisatier|cantonnier|macon|tailleur de pierre|charpentier|manoeuvre|carrier|poseur de voie|ouvrier des ponts|conducteur des ponts|piqueur des ponts|ponts et chaussees|ingenieur/, ['pont', 'tunnel', 'canal', 'ecluse', 'aqueduc'], 15, 'build']];
    /** 🌉 les ouvrages de son métier près de ses lieux : construits pendant sa vie active (bâtisseurs) ou en service (éclusier, batelier) */
    function worksForLife(rows, life) {
        const {from, to, birth} = lifeSpan(life), pls = geoPlaces(life);
        if (from === null || !pls.length) return [];
        const out = new Map();
        for (const [rx, kinds, radius, mode] of WORKS_JOBS) {
            const job = jobMatch(life, rx); if (!job) continue;
            const a = birth !== null ? birth + 14 : from;
            for (const w of rows) {
                if (!kinds.includes(w.k)) continue;
                if (mode === 'build' ? (w.y < a || w.y > to) : w.y > to) continue;
                let best = null;
                for (const p of pls) { const k = km(p.lat, p.lon, w.lat, w.lon); if (k <= radius && (!best || k < best.km)) best = {km: k, place: p.name}; }
                if (!best) continue;
                const cur = out.get(w.q); if (!cur || best.km < cur.km) out.set(w.q, {w, ...best, job, mode, age: age(life, w.y)});
            }
        }
        return [...out.values()].sort((x, y) => (x.mode === 'build') - (y.mode === 'build') || x.km - y.km || y.w.sl - x.w.sl);
    }
    function worksNear(rows, lat, lon, radius = 5, years = null) {
        return rows.filter(w => !years || (w.y >= years.from && w.y <= years.to)).map(w => ({w, km: km(lat, lon, w.lat, w.lon)})).filter(x => x.km <= radius).sort((a, b) => a.km - b.km || a.w.y - b.w.y);
    }

    /* ── 💡 les nouveautés ── */
    /** {before: pas encore là à sa naissance, during: arrivées pendant sa vie, after: arrivées après sa mort, known: là à sa mort} */
    function novelties(rows, life) {
        const {birth, death, from, to} = lifeSpan(life);
        const b = birth ?? from, d = death ?? (to !== from ? to : null);
        if (b === null) return null;
        const sorted = [...rows].sort((x, y) => x.y - y.y);
        const notYet = sorted.filter(r => r.y > b), during = d !== null ? sorted.filter(r => r.y > b && r.y <= d) : [], after = d !== null ? sorted.filter(r => r.y > d) : [];
        const known = d !== null ? sorted.filter(r => r.y <= d) : [];
        return {b, d, notYet, during, after, known, all: sorted};
    }

    /* ── 👗 la mode, 📚 les livres ── */
    const decadeOf = y => (y === null ? null : Math.floor(y / 10) * 10);
    function marriageYear(life) { const e = (life.events || []).find(x => /^(MARR|MARB|MARC|MARL|ENGA)$/.test(String(x.tag || '').toUpperCase()) && num(x.year) !== null); return e ? Number(e.year) : null; }
    /** les images d'une décennie, mêlées (femmes, hommes, France) pour en montrer des deux */
    function fashionOf(decades, y, n = 6) {
        const dd = decadeOf(y); if (dd === null) return [];
        const list = decades[String(dd)] || []; if (!list.length) return [];
        const by = {femmes: [], hommes: [], gravure: []}; for (const g of list) (by[g.who] || (by[g.who] = [])).push(g);
        const out = []; const cats = ['hommes', 'gravure', 'femmes'];
        for (let i = 0; out.length < n && i < 30; i++) for (const c of cats) { const g = by[c][i]; if (g && out.length < n && !out.includes(g)) out.push(g); }
        return out;
    }
    /** 📚 les livres d'une année : le plus connu en français d'abord, puis le plus connu du monde */
    function booksOf(rows, y) {
        const lst = rows.filter(r => r.y === y).sort((a, b) => b.sl - a.sl);
        const fr = lst.filter(r => r.fr), world = lst.filter(r => !r.fr);
        return [...fr.slice(0, 1), ...world.slice(0, 1), ...lst.filter(r => r !== fr[0] && r !== world[0])];
    }

    /* ── 📷 dater une photo ── */
    /** les formats possibles pour une année (ou toutes si y = null) */
    const photoFormatsFor = (photos, y) => photos.filter(p => y === null || (p.from <= y && (p.to === null || p.to === undefined || p.to >= y)));

    const core = {km, fold, table, lifeSpan, deptOf, jobMatch, prepFleaux, fleauxForDept, fleauxForLife, strikesForLife, strikesNear, worksForLife, worksNear, novelties, decadeOf, marriageYear, fashionOf, booksOf, photoFormatsFor, IND_JOBS, KIND};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const DATA_V = 1;
    const FILES = {fleaux: 'et-fleaux', greves: 'et-greves', ouvrages: 'et-ouvrages', nouveautes: 'et-nouveautes', livres: 'et-livres', mode: 'et-mode'};
    const KEY = 'genealogie-epoque-travail';
    const TAB = ['epoque_travail', '25k7', '🕰 Son époque'];
    const PARTS = [
        ['fleaux', '🐛 Les fléaux de son métier', 'Le phylloxéra, l’oïdium, le mildiou, la pébrine… quand ils arrivent dans son département et touchent son métier.'],
        ['greves', '✊ Les grèves près de chez lui', 'Les grèves à moins de 20 km de ses lieux pendant sa vie active (surtout celles de son métier).'],
        ['ouvrages', '🌉 Ponts, canaux, tunnels', 'Pour un éclusier, un batelier, un terrassier… les ouvrages d’art près de chez lui ; sur la fiche d’un village, ceux des alentours.'],
        ['nouveautes', '💡 Les nouveautés de sa vie', 'Ce qui n’existait pas encore à sa naissance, ce qui existait à sa mort : train, photo, timbre, téléphone, avion, radio…'],
        ['mode', '👗 La mode de ses 20 ans', 'Les gravures de mode de ses 20 ans et de son mariage (Wikimedia Commons, avec Internet).'],
        ['livres', '📚 Les livres de ses 20 ans', 'Le livre célèbre paru l’année de ses 20 ans.']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const dec = (n, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');
    const kmTxt = k => (k < 1 ? T('moins d’1 km') : k < 10 ? T('{n} km', {n: dec(k)}) : T('{n} km', {n: String(Math.round(k))}));
    function dateTxt(d, y) { const [yy, mm, dd] = String(d || '').split('-').map(Number); if (yy && mm && dd) return `${dd === 1 ? '1er' : dd} ${T(MONTHS[mm - 1])} ${yy}`; if (yy && mm) return `${T(MONTHS[mm - 1])} ${yy}`; return String(y ?? ''); }
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    const ageTxt = n => (n === 0 ? T('moins d’un an') : n === 1 ? T('1 an') : T('{n} ans', {n: String(n)}));
    const he = P => (P?.gender === 'female' ? T('elle') : P?.gender === 'male' ? T('il') : T('cette personne'));
    const He = P => cap(he(P));
    const nameOf = P => (P?.first ? esc(P.first) : He(P));
    const link = (url, label) => (url ? `<a href="${esc(/^\s*(?:javascript|data|vbscript|file):/i.test(String(url)) ? '#' : url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label)); // une adresse venue d’un site (Wikidata, loc.gov…) : jamais « javascript: »
    const srcLink = url => (url ? `<a class="et-src-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : '');
    const wdUrl = q => `https://www.wikidata.org/wiki/${encodeURIComponent(q)}`;
    const wpUrl = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const refLinks = r => `<span class="et-links">${r.frwiki ? link(wpUrl(r.frwiki), '↗ Wikipédia') + ' ' : ''}${r.q ? link(wdUrl(r.q), '↗ Wikidata') : ''}</span>`;
    const row = (icon, html, src, extra = '') => `<div class="hist-row et-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="et-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const quote = r => (r.sentence ? `<blockquote class="et-quote">« ${esc(r.sentence)} » ${srcLink(r.url)}</blockquote>` : '');

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir les fichiers de « Son époque ».'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const PREP = {fleaux: f => prepFleaux(f), greves: f => table(f), ouvrages: f => table(f), nouveautes: f => f.rows || [], livres: f => table(f), mode: f => f};
    /** charge un sujet : {meta, rows} ; null si le fichier n'est pas livré */
    function load(kind) {
        if (!data[kind]) data[kind] = fetch(`assets/data/${FILES[kind]}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: FILES[kind]})); return readMaybeGz(r); })
            .then(f => { if (!f) return null; const {rows, fields, decades, photos, fleaux, ...meta} = f; return {meta, raw: f, rows: PREP[kind](f)}; })
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const SRC = {
        fleaux: url => `${link(url || 'https://fr.wikipedia.org', 'Wikipédia')} (CC BY-SA 4.0)`,
        greves: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0) · ${link('https://fr.wikipedia.org/wiki/Cat%C3%A9gorie:Gr%C3%A8ve_en_France', T('catégories de Wikipédia'))}`,
        ouvrages: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0)`,
        nouveautes: () => `${link('https://fr.wikipedia.org', 'Wikipédia')} (CC BY-SA 4.0)`,
        livres: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0)`,
        mode: () => `${link('https://commons.wikimedia.org', 'Wikimedia Commons')} — ${esc(T('auteur et licence sous chaque image'))}`
    };
    const SRC_TXT = {fleaux: 'Wikipédia (CC BY-SA 4.0)', greves: 'Wikidata (CC0) ; catégories de Wikipédia', ouvrages: 'Wikidata (CC0)', nouveautes: 'Wikipédia (CC BY-SA 4.0)', livres: 'Wikidata (CC0)', mode: 'Wikimedia Commons (licence de chaque image)'};
    const SRC_URL = {fleaux: 'https://fr.wikipedia.org/wiki/Phyllox%C3%A9ra', greves: 'https://www.wikidata.org/wiki/Q49776', ouvrages: 'https://www.wikidata.org', nouveautes: 'https://fr.wikipedia.org', livres: 'https://www.wikidata.org', mode: 'https://commons.wikimedia.org/wiki/Category:Fashion_plates_by_decade'};
    /* un téléchargement coupé (page rechargée, onglet fermé, app arrêtée) n'est pas une erreur à montrer : la partie reste vide, sans rien dans la console */
    let leaving = false;
    if (root.addEventListener) { root.addEventListener('pagehide', () => { leaving = true; }); root.addEventListener('beforeunload', () => { leaving = true; }); }
    const cutOff = e => leaving || e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || '')));
    const report = e => { if (!cutOff(e)) console.error(e); };
    async function loadSome(kinds) { const out = {}; await Promise.all(kinds.map(async k => { try { out[k] = await load(k); } catch (e) { report(e); out[k] = null; } })); return out; }

    /* ─────────── les phrases ─────────── */
    const fleauWhen = r => (r.prec === 'decennie' ? T('dans les années {y}', {y: String(r.y)}) : r.prec === 'apres' ? T('après {y}', {y: String(r.y)}) : T('en {y}', {y: String(r.y)}));
    const DEPT = {};
    const deptName = code => DEPT[code] || code;
    function fleauxHtml(list, life) {
        if (!list.length) return '';
        const P = life.person, x = list[0], r = x.r;
        const lead = x.strong ? T('{f} touche {z} {when} : {he} était {job}.', {f: cap(esc(r.name)), z: esc(r.zone), when: fleauWhen(r), he: he(P), job: `<b>${esc(x.job)}</b>`})
            : T('{f} touche {z} {when} ; {he} était {job} (peut-être avait-{p} des vignes ou des cultures touchées).', {f: cap(esc(r.name)), z: esc(r.zone), when: fleauWhen(r), he: he(P), job: `<b>${esc(x.job)}</b>`, p: P?.gender === 'female' ? 'elle' : 'il'});
        const ag = x.age !== null && x.age >= 0 ? ` <span class="muted">(${esc(T('{n} a {a}', {n: P?.first || He(P), a: ageTxt(x.age)}))})</span>` : '';
        const others = list.slice(1).map(y => `<li>${esc(y.r.icon || '🐛')} <b>${esc(cap(y.r.name))}</b> : ${esc(fleauWhen(y.r))}, ${esc(y.r.zone)}${y.age !== null && y.age >= 0 ? ` <small class="muted">(${esc(ageTxt(y.age))})</small>` : ''} ${srcLink(y.r.url)}<br><small class="muted">« ${esc(y.r.sentence)} »</small></li>`).join('');
        const det = `${quote(r)}${others ? `<p class="muted">${esc(T('Les autres fléaux de son métier pendant sa vie :'))}</p><ul class="hist-ul">${others}</ul>` : ''}<small class="muted hist-hyp">${esc(r.exact ? T('Son département ({d}) est dans la zone que nomme la source.', {d: x.dep}) : T('La source parle de toute la France.'))} ${esc(T('Le métier vient de sa fiche (profession, recensements).'))}</small>`;
        return row(r.icon || '🐛', lead + ag, SRC.fleaux(r.url), more(det, list.length > 1 ? list.length : null));
    }
    function strikeName(s) { return esc(String(s.n).replace(/^(Grève|Grèves|Mouvement|Révolte|Fusillade|Massacre)\b/, w => w.toLowerCase())); }
    function strikeLi(x) {
        const s = x.s;
        return `<li><b>${esc(dateTxt(s.d, s.y))}</b>${s.y2 ? `–${esc(String(s.y2))}` : ''} : ${strikeName(s)}${x.km !== null && x.km !== undefined ? ` <small class="muted">${esc(x.place ? T('à {k} de {p}', {k: kmTxt(x.km), p: x.place}) : T('à {k}', {k: kmTxt(x.km)}))}</small>` : ''}${s.ind ? ` <small class="muted">· ${esc(T(IND_WORD[s.ind] || ''))}</small>` : ''} ${refLinks(s)}</li>`;
    }
    function strikesHtml(list, life) {
        if (!list.length) return '';
        const P = life.person, top = list[0], s = top.s;
        const when = s.d ? T('Le {d}', {d: dateTxt(s.d, s.y)}) : T('En {y}', {y: String(s.y)});
        let lead;
        if (top.national) lead = T('{when}, {n} : {he} était {job}, du même métier.', {when, n: strikeName(s), he: he(P), job: `<b>${esc(top.job)}</b>`});
        else lead = T('{when}, {n}, à {k} de {p}.', {when, n: strikeName(s), k: kmTxt(top.km), p: esc(top.place)}) + (top.job ? ` <b>${esc(T('{He} était {job} : c’était son métier.', {He: He(P), job: top.job}))}</b>` : (top.age !== null && top.age >= 0 ? ` ${esc(T('{He} avait {a}.', {He: He(P), a: ageTxt(top.age)}))}` : ''));
        const others = list.length > 1 ? ` <span class="muted">${esc(T('({n} en tout pendant sa vie active)', {n: String(list.length)}))}</span>` : '';
        return row('✊', `${lead}${others} ${refLinks(s)}`, SRC.greves(), more(`<ul class="hist-ul">${list.map(strikeLi).join('')}</ul><small class="muted hist-hyp">${esc(T('À moins de 20 km de ses lieux, entre ses 14 et 70 ans. Une grève de toute une région compte depuis le bord de la région (rayon estimé d’après sa surface) ; une grève de tout le pays, seulement si elle touche son métier.'))}</small>`, list.length > 1 ? list.length : null));
    }
    const worksFacts = w => [T(KIND[w.k] || w.k), T('{y}', {y: String(w.y)}), w.cross ? T('sur {c}', {c: w.cross}) : '', w.mat ? T('en {m}', {m: w.mat}) : ''].filter(Boolean).join(' · ');
    function worksHtml(list, life) {
        if (!list.length) return '';
        const P = life.person, x = list[0], w = x.w;
        const lead = x.mode === 'build'
            ? T('En {y}, on construit {k} {n}, à {km} de {p} : {he} était {job}{a}.', {y: String(w.y), k: T(w.k === 'ecluse' ? 'l’écluse' : w.k === 'aqueduc' ? 'l’aqueduc' : 'le ' + (KIND[w.k] || w.k)), n: `<b>${esc(w.n)}</b>`, km: kmTxt(x.km), p: esc(x.place), he: he(P), job: `<b>${esc(x.job)}</b>`, a: x.age !== null && x.age >= 0 ? `, ${T('à {a}', {a: ageTxt(x.age)})}` : ''})
            : T('{He} était {job} : {n} ({f}) est à {km} de {p}.', {He: He(P), job: `<b>${esc(x.job)}</b>`, n: `<b>${esc(w.n)}</b>`, f: esc(worksFacts(w)), km: kmTxt(x.km), p: esc(x.place)});
        const li = list.slice(1, 25).map(y => `<li>${esc(y.w.n)} <small class="muted">${esc([worksFacts(y.w), kmTxt(y.km)].join(' · '))}</small> ${refLinks(y.w)}</li>`).join('');
        return row('🌉', `${lead} ${refLinks(w)}`, SRC.ouvrages(), more(li ? `<ul class="hist-ul">${li}</ul>` : '', list.length > 1 ? list.length - 1 : null));
    }
    const novLabel = r => `${esc(r.n)} <small class="muted">(${esc(String(r.y))})</small>`;
    function timelineStrip(nv, P) {
        const a = Math.min(nv.b - 10, ...nv.all.slice(0, 1).map(r => r.y)), z = Math.max((nv.d ?? nv.b + 60) + 10, nv.all.length ? Math.min(nv.all[nv.all.length - 1].y, (nv.d ?? nv.b + 60) + 40) : 0);
        const span = Math.max(1, z - a), pos = y => `${Math.max(0, Math.min(100, (y - a) / span * 100)).toFixed(1)}%`;
        const shown = nv.all.filter(r => r.y >= a && r.y <= z);
        const life = `<span class="et-tl-life" style="left:${pos(nv.b)};width:${(((nv.d ?? nv.b) - nv.b) / span * 100).toFixed(1)}%" title="${esc(T('sa vie'))}"></span>`;
        const marks = shown.map((r, i) => `<span class="et-tl-mark ${i % 2 ? 'et-tl-low' : ''}" style="left:${pos(r.y)}" title="${esc(`${r.y} — ${r.n}`)}"><span aria-hidden="true">${esc(r.icon)}</span><small>${esc(String(r.y))}</small></span>`).join('');
        return `<div class="et-tl" role="img" aria-label="${esc(T('Les nouveautés autour de sa vie, de {a} à {z}', {a: String(a), z: String(z)}))}"><div class="et-tl-axis"></div>${life}${marks}<span class="et-tl-end" style="left:0">${esc(String(a))}</span><span class="et-tl-end" style="right:0">${esc(String(z))}</span></div>
            <p class="muted et-tl-legend"><span class="et-tl-key"></span> ${esc(T('sa vie : {b}–{d}', {b: String(nv.b), d: nv.d !== null ? String(nv.d) : '?'}))}</p>`;
    }
    function noveltiesHtml(nv, life) {
        if (!nv || !nv.all.length) return '';
        const P = life.person, notYet = nv.notYet.slice(0, 4), recent = nv.d !== null ? nv.known.filter(r => r.y > nv.b).slice(-3) : [];
        if (!notYet.length && !recent.length) return '';
        const parts = [];
        if (notYet.length) parts.push(T('Quand {n} naît, en {y}, il n’y a pas encore {l}.', {n: nameOf(P), y: String(nv.b), l: notYet.map(r => esc(r.n)).join(', ')}));
        if (recent.length) parts.push(T('Quand {he} meurt, en {y}, il y a {l}.', {he: he(P), y: String(nv.d), l: recent.map(r => esc(r.n)).join(', ')}));
        const li = rs => `<ul class="hist-ul">${rs.map(r => `<li>${esc(r.icon)} ${novLabel(r)}${r.scope === 'Monde' ? ` <small class="muted">${esc(T('dans le monde'))}</small>` : ` <small class="muted">${esc(T('en France'))}</small>`} ${srcLink(r.url)}<br><small class="muted">« ${esc(r.sentence)} »</small></li>`).join('')}</ul>`;
        const det = `${timelineStrip(nv, P)}${nv.during.length ? `<p><b>${esc(T('Arrivé pendant sa vie :'))}</b></p>${li(nv.during)}` : ''}${nv.after.length ? `<p><b>${esc(T('{He} n’a pas connu :', {He: He(P)}))}</b> ${nv.after.slice(0, 12).map(r => novLabel(r)).join(', ')}</p>` : ''}
            <small class="muted hist-hyp">${esc(T('L’année est celle de l’arrivée en France ou de l’invention dans le monde : dans les campagnes, beaucoup de choses sont arrivées bien plus tard.'))}</small>`;
        return row('💡', parts.join(' '), SRC.nouveautes(), more(det, nv.during.length || null));
    }
    const thumb = g => `<figure class="et-fig"><a href="${esc(g.page)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(g.title)}" src="${esc(g.t)}" onerror="this.closest('figure').classList.add('et-off')"></a><figcaption>${esc(g.title)}<br><small>${esc([g.artist, g.date].filter(Boolean).join(', '))} · ${g.licurl ? link(g.licurl, g.lic) : esc(g.lic)} · ${link(g.page, '↗ Commons')}</small></figcaption></figure>`;
    function fashionHtml(mode, life) {
        const dec = mode?.raw?.decades; if (!dec) return '';
        const b = num(life.person?.birth), m = marriageYear(life), y20 = b !== null ? b + 20 : null;
        const items = [];
        if (y20 !== null && y20 <= 1970) { const imgs = fashionOf(dec, y20, 6); if (imgs.length) items.push({what: T('À ses 20 ans ({y})', {y: String(y20)}), y: y20, imgs}); }
        if (m !== null && decadeOf(m) !== decadeOf(y20)) { const imgs = fashionOf(dec, m, 6); if (imgs.length) items.push({what: T('À son mariage ({y})', {y: String(m)}), y: m, imgs}); }
        if (!items.length) return '';
        const lead = items.map(it => T('{w} : la mode des années {d}', {w: esc(it.what), d: String(decadeOf(it.y))})).join(' ; ') + '.';
        const det = items.map(it => `<p><b>${esc(it.what)}</b> — ${esc(T('gravures et photos des années {d}, pour les femmes et pour les hommes :', {d: String(decadeOf(it.y))}))}</p><div class="et-figs">${it.imgs.map(thumb).join('')}</div>`).join('')
            + `<small class="muted hist-hyp">${esc(T('Les images viennent de Wikimedia Commons : il faut Internet pour les voir. Ce sont surtout des gravures de mode de Paris : à la campagne, on s’habillait plus simplement, et le costume du pays restait souvent.'))}</small>`;
        return row('👗', `${lead} <button type="button" class="link-button" data-et-photo>${esc(T('📷 Dater une photo'))}</button>`, SRC.mode(), more(det));
    }
    const bookLine = b => `<i>${esc(b.t)}</i>${b.a ? ` (${esc(b.a)})` : ''}`;
    function booksHtml(rows, life) {
        const b = num(life.person?.birth); if (b === null) return '';
        const y = b + 20, list = booksOf(rows, y); if (!list.length) return '';
        const x = list[0];
        const lead = T('L’année de ses 20 ans ({y}) paraît {b}.', {y: String(y), b: bookLine(x)});
        const li = list.slice(1, 10).map(r => `<li>${bookLine(r)}${r.fr ? '' : ` <small class="muted">${esc(T('dans le monde'))}</small>`} ${refLinks(r)}</li>`).join('');
        return row('📚', `${lead} ${refLinks(x)}`, SRC.livres(), more(li ? `<p class="muted">${esc(T('Parus aussi en {y} :', {y: String(y)}))}</p><ul class="hist-ul">${li}</ul>` : '', list.length > 1 ? list.length - 1 : null));
    }

    /* ─────────── 🕰 la fiche d'une personne ─────────── */
    const lifeMemo = new Map();
    const lifeOf = id => { if (!lifeMemo.has(id)) lifeMemo.set(id, A().api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    /** remplit un élément avec les lignes de la personne ; renvoie le nombre de lignes */
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PARTS.map(p => p[0])).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (e) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const D = await loadSome(want);
        if (!host.isConnected && !opts.detached) return 0;
        const html = [];
        if (D.fleaux) html.push(fleauxHtml(fleauxForLife(D.fleaux.rows, life), life));
        if (D.greves) html.push(strikesHtml(strikesForLife(D.greves.rows, life, 20), life));
        if (D.ouvrages) html.push(worksHtml(worksForLife(D.ouvrages.rows, life), life));
        if (D.nouveautes) html.push(noveltiesHtml(novelties(D.nouveautes.rows, life), life));
        if (D.mode) html.push(fashionHtml(D.mode, life));
        if (D.livres) html.push(booksHtml(D.livres.rows, life));
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life et-life" data-et-y20="${num(life.person?.birth) !== null ? Number(life.person.birth) + 20 : ''}">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.epoque_travail = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PARTS.some(([k]) => on(k))) return '';
        return A().card(index, T('🕰 Son époque'), '', `<div class="et-block" data-et-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-et-person]').forEach(async h => {
            const id = Number(h.dataset.etPerson); lifeMemo.delete(id);
            const n = await personInto(h, id);
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    function fleauxPlaceHtml(list, dep) {
        if (!list.length) return '';
        const top = list[0];
        const lead = list.length > 1 ? T('{n} fléaux des cultures connus dans ce département. Le premier : {f} touche {z} {when}.', {n: String(list.length), f: esc(top.name), z: esc(top.zone), when: fleauWhen(top)}) : T('{f} touche {z} {when}.', {f: cap(esc(top.name)), z: esc(top.zone), when: fleauWhen(top)});
        const li = list.map(r => `<li>${esc(r.icon || '🐛')} <b>${esc(cap(r.name))}</b> : ${esc(fleauWhen(r))}, ${esc(r.zone)} ${srcLink(r.url)}<br><small class="muted">« ${esc(r.sentence)} »</small></li>`).join('');
        return row('🐛', cap(lead), SRC.fleaux(top.url), more(`<ul class="hist-ul">${li}</ul><small class="muted hist-hyp">${esc(T('Département {d}. Les familles de vignerons, de magnaniers et de cultivateurs en ont souffert : ruine, départs, changements de métier.', {d: dep}))}</small>`, list.length > 1 ? list.length : null));
    }
    function strikesPlaceHtml(list) {
        if (!list.length) return '';
        const top = list[list.length - 1].s.y < 1850 ? list[0] : [...list].sort((a, b) => a.km - b.km)[0];
        const lead = list.length > 1 ? T('{n} grèves ou conflits du travail connus à moins de 20 km. Le plus proche : {s} ({y}), à {k}.', {n: String(list.length), s: strikeName(top.s), y: String(top.s.y), k: kmTxt(top.km)}) : T('{s} ({y}), à {k}.', {s: strikeName(top.s), y: String(top.s.y), k: kmTxt(top.km)});
        return row('✊', cap(lead), SRC.greves(), more(`<ul class="hist-ul">${list.map(strikeLi).join('')}</ul>`, list.length > 1 ? list.length : null));
    }
    function worksPlaceHtml(list) {
        if (!list.length) return '';
        const top = list[0];
        const lead = list.length > 1 ? T('{n} ponts, canaux, écluses ou tunnels datés à moins de 5 km. Le plus proche : {w} ({f}), à {k}.', {n: String(list.length), w: `<b>${esc(top.w.n)}</b>`, f: esc(worksFacts(top.w)), k: kmTxt(top.km)}) : T('{w} ({f}), à {k}.', {w: `<b>${esc(top.w.n)}</b>`, f: esc(worksFacts(top.w)), k: kmTxt(top.km)});
        const li = list.slice(0, 40).map(y => `<li>${esc(y.w.n)} <small class="muted">${esc([worksFacts(y.w), kmTxt(y.km)].join(' · '))}</small> ${refLinks(y.w)}</li>`).join('');
        return row('🌉', lead, SRC.ouvrages(), more(`<ul class="hist-ul">${li}</ul><small class="muted hist-hyp">${esc(T('L’année est celle de la construction ou de la mise en service écrite dans Wikidata. Les moulins et les rivières sont dans « Métiers des rivières » ; les voies romaines dans « Histoire autour ».'))}</small>`, list.length > 1 ? list.length : null));
    }
    /** le HTML d'un sujet pour un lieu ('' = rien à dire) */
    async function placePart(kind, place, opts = {}) {
        if (kind === 'fleaux') {
            const dep = deptOf({insee: place.insee || place.admin4_code || '', county: place.county || '', full: [place.name, place.county, place.state].filter(Boolean).join(', ')});
            if (!dep || !isFrance(place)) return '';
            const D = await load('fleaux').catch(() => null); if (!D) return '';
            return fleauxPlaceHtml(fleauxForDept(D.rows, dep).filter(r => r.exact), dep);
        }
        const ll = placeLL(place); if (!ll) return '';
        const D = await load(kind).catch(() => null); if (!D) return '';
        if (kind === 'greves') return strikesPlaceHtml(strikesNear(D.rows, ll.lat, ll.lon, 20));
        if (kind === 'ouvrages') return worksPlaceHtml(worksNear(D.rows, ll.lat, ll.lon, 5, opts.years || null));
        return '';
    }
    const PLACE_KINDS = ['fleaux', 'greves', 'ouvrages'];
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place, opts).catch(() => '')));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel et-panel"><h3>${esc(T('🕰 Le travail et son époque'))}</h3><div class="hist-life et-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || '', state: head};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'et_place', host: '[data-et-host]', icon: '🕰', label: 'Son époque et son travail', group: 'Son histoire'});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-et])'); if (!village) return;
        village.dataset.et = '1';
        const place = villagePlace(village);
        const anchor = village.querySelector('[data-ha-host]') || village.querySelector('[data-mr-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="et-place" data-et-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-et-host]'), place);
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(report); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune : une partie par sujet ─────────── */
    const MONO = [['fleaux', 'et_fleaux', '🐛', 'Les fléaux des cultures'], ['greves', 'et_greves', '✊', 'Grèves des alentours'], ['ouvrages', 'et_ouvrages', '🌉', 'Ouvrages d’art']];
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label]) => ({
        id, icon, label, group: 'Le lieu', defaultOn: true, enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host, ctx) => {
            let pl = place;
            if (kind === 'fleaux' && !pl.insee && ctx?.village) { try { const v = await ctx.village(); if (v?.insee) pl = {...pl, insee: v.insee}; } catch (_) {} }
            const html = await placePart(kind, pl, {}); if (!html) return false;
            host.innerHTML = `<div class="hist-life et-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📷 Dater une photo ancienne ─────────── */
    async function openPhotoDating(opts = {}) {
        const M = await load('mode').catch(() => null);
        const photos = M?.raw?.photos || [], dec = M?.raw?.decades || {};
        const decades = Object.keys(dec).map(Number).sort((a, b) => a - b);
        let pick = opts.year ? decadeOf(opts.year) : (decades.find(d => d >= 1860) ?? decades[0]);
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l et-dialog';
        const fmt = `<table class="data-table et-photo-tbl"><thead><tr><th>${esc(T('Format'))}</th><th>${esc(T('Années'))}</th><th>${esc(T('Source'))}</th></tr></thead><tbody>${photos.map(p => `<tr><td>${esc(p.n)}<br><small class="muted">« ${esc(p.sentence)} »${p.sentence_to ? ` — « ${esc(p.sentence_to)} »` : ''}</small></td><td>${esc(p.to ? `${p.from}–${p.to}` : T('depuis {y}', {y: String(p.from)}))}</td><td>${srcLink(p.url)}</td></tr>`).join('')}</tbody></table>`;
        const img = opts.src ? `<figure class="et-fig et-fig-photo"><img alt="" src="${esc(opts.src)}"><figcaption>${esc(opts.title || T('Ta photo'))}</figcaption></figure>` : '';
        const draw = () => {
            const imgs = fashionOf(dec, pick, 8);
            dlg.querySelector('[data-et-cmp]').innerHTML = `${img}${imgs.map(thumb).join('') || `<p class="muted">${esc(T('Pas d’image pour cette décennie.'))}</p>`}`;
            dlg.querySelectorAll('[data-et-dec]').forEach(b => b.classList.toggle('is-active', Number(b.dataset.etDec) === pick));
        };
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">${esc(T('📷 DATER UNE PHOTO ANCIENNE'))}</span><h2>${esc(T('De quand date cette photo ?'))}</h2></div><button type="button" class="icon-button" data-et-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="et-body"><p>${esc(T('1. Regarde le support : plaque de métal, verre, petit carton… Chaque format n’a existé qu’à certaines années.'))}</p>${fmt}
            <p>${esc(T('2. Compare les vêtements avec les gravures de mode de chaque décennie (manches, cols, chapeaux, coiffures) :'))}</p>
            <div class="et-decs">${decades.map(d => `<button type="button" class="chip" data-et-dec="${d}">${esc(T('années {d}', {d: String(d)}))}</button>`).join('')}</div>
            <div class="et-figs et-cmp" data-et-cmp></div>
            <small class="hist-src">${esc(T('Source :'))} ${link('https://fr.wikipedia.org', 'Wikipédia')} (CC BY-SA 4.0) · ${SRC.mode()}</small>
            <small class="muted hist-hyp">${esc(T('La mode de Paris arrivait plus tard à la campagne : une photo peut avoir quelques années de plus que la mode qu’elle montre.'))}</small></div>
            <div class="modal-actions"><span class="spacer"></span><button type="submit" class="button secondary">${esc(T('Fermer'))}</button></div></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.querySelector('[data-et-x]').addEventListener('click', () => dlg.close());
        dlg.addEventListener('click', e => { const b = e.target.closest('[data-et-dec]'); if (b) { pick = Number(b.dataset.etDec); draw(); } });
        draw(); dlg.showModal();
        return dlg;
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-et-photo]'); if (!b) return;
        e.preventDefault(); const y = Number(b.closest('[data-et-y20]')?.dataset.etY20) || null; openPhotoDating({year: y});
    });
    // la visionneuse : « 📷 Dater » à côté de « ＋ Identifier quelqu'un »
    const lbButton = () => {
        const lb = document.getElementById('lightbox'), tg = document.getElementById('lightbox-tag-toggle');
        if (!lb?.open || !tg) return;
        const st = A()?.state, item = st?.lightboxMedia?.[st.lightboxIndex];
        let b = document.getElementById('lightbox-et-date');
        const ok = on('mode') && item && /\.(jpe?g|png|gif|webp|tiff?)$/i.test(item.filename || '');
        if (!ok) { if (b) b.hidden = true; return; }
        if (!b) {
            b = document.createElement('button'); b.type = 'button'; b.id = 'lightbox-et-date'; b.className = 'button small secondary'; b.textContent = '📷 ' + T('Dater'); b.title = T('Dater une photo ancienne : les formats de photo et la mode de chaque décennie');
            tg.insertAdjacentElement('afterend', b);
            b.addEventListener('click', () => { const s = A().state, it = s.lightboxMedia?.[s.lightboxIndex]; if (!it) return; const y = num(String(it.date_text || it.year || '').match(/1[6-9]\d\d/)?.[0]); openPhotoDating({src: `media/${encodeURIComponent(it.filename)}`, title: it.title || '', year: y}); });
        }
        b.hidden = false;
    };
    const watchLb = () => { const lb = document.getElementById('lightbox'); if (!lb || lb._etWatch) return; lb._etWatch = true; new MutationObserver(() => setTimeout(lbButton, 0)).observe(lb, {attributes: true, attributeFilter: ['open']});
        const cap2 = document.getElementById('lightbox-counter'); if (cap2) new MutationObserver(() => setTimeout(lbButton, 0)).observe(cap2, {childList: true, characterData: true, subtree: true}); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchLb); else watchLb();

    /* ─────────── 📋 Listes ─────────── */
    const rowsOf = kind => load(kind).then(D => (D ? D.rows : []));
    const IND_VALUES = Object.values(IND_WORD).map(x => T(x));
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'et_fleaux', icon: '🐛', label: T('Fléaux des cultures (phylloxéra, oïdium, mildiou, pébrine)'), group: 'Le lieu', source: SRC_TXT.fleaux, sourceUrl: SRC_URL.fleaux, enabled: () => on('fleaux'),
            load: async () => (await rowsOf('fleaux')).map(r => ({...r, name: cap(r.name), year: r.y, when: fleauWhen(r), depts: (r.deps || []).join(', ').replace('*', T('toute la France')), quote: r.sentence, src: r.url})),
            fields: [{key: 'name', label: T('Fléau'), type: 'enum'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'when', label: T('Quand'), type: 'text'}, {key: 'zone', label: T('Où (d’après la source)'), type: 'text'},
                {key: 'depts', label: T('Départements'), type: 'text'}, {key: 'quote', label: T('La phrase de la source'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.y, r.prec === 'decennie' ? r.y + 9 : r.y]},
        {id: 'et_greves', icon: '✊', label: T('Grèves et conflits du travail'), group: 'Le monde', source: SRC_TXT.greves, sourceUrl: SRC_URL.greves, enabled: () => on('greves'),
            load: async () => (await rowsOf('greves')).map(s => ({...s, name: s.n, year: s.y, end: s.y2, date: s.d || '', industry: s.ind ? T(IND_WORD[s.ind]) : '', src: s.frwiki ? wpUrl(s.frwiki) : wdUrl(s.q)})),
            fields: [{key: 'name', label: T('Grève'), type: 'text'}, {key: 'date', label: T('Date'), type: 'date'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'end', label: T('Fin'), type: 'year'},
                {key: 'industry', label: T('Métier'), type: 'enum', values: IND_VALUES}, {key: 'place', label: T('Lieu'), type: 'text'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: s => [s.y, s.y2 ?? s.y], geo: s => (s.lat !== null && s.r !== -1 ? [s.lat, s.lon] : null), geoCircle: s => (s.r > 0 ? {lat: s.lat, lon: s.lon, km: s.r} : null)},
        {id: 'et_ouvrages', icon: '🌉', label: T('Ponts, canaux, écluses, tunnels, aqueducs'), group: 'Le lieu', source: SRC_TXT.ouvrages, sourceUrl: SRC_URL.ouvrages, enabled: () => on('ouvrages'),
            load: async () => (await rowsOf('ouvrages')).map(w => ({...w, name: w.n, kind: T(KIND[w.k] || w.k), year: w.y, src: w.frwiki ? wpUrl(w.frwiki) : wdUrl(w.q)})),
            fields: [{key: 'name', label: T('Ouvrage'), type: 'text'}, {key: 'kind', label: T('Genre'), type: 'enum', values: Object.values(KIND).map(x => T(x))}, {key: 'year', label: T('Construit ou ouvert'), type: 'year'},
                {key: 'cross', label: T('Franchit'), type: 'text'}, {key: 'mat', label: T('Matériau'), type: 'enum'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: w => [w.y, null], geo: w => [w.lat, w.lon]},
        {id: 'et_nouveautes', icon: '💡', label: T('Les nouveautés : train, photo, timbre, téléphone, avion, radio…'), group: 'Le monde', source: SRC_TXT.nouveautes, sourceUrl: SRC_URL.nouveautes, enabled: () => on('nouveautes'),
            load: async () => (await rowsOf('nouveautes')).map(r => ({...r, name: `${r.icon} ${r.n}`, year: r.y, where: r.scope === 'Monde' ? T('dans le monde') : T('en France'), quote: r.sentence, src: r.url})),
            fields: [{key: 'name', label: T('Nouveauté'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'where', label: T('Où'), type: 'enum', values: [T('en France'), T('dans le monde')]}, {key: 'quote', label: T('La phrase de la source'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.y, null]},
        {id: 'et_livres', icon: '📚', label: T('Livres célèbres, par année de parution'), group: 'Le monde', source: SRC_TXT.livres, sourceUrl: SRC_URL.livres, enabled: () => on('livres'),
            load: async () => (await rowsOf('livres')).map(r => ({...r, title: r.t, author: r.a, year: r.y, lang: r.fr ? T('en français') : T('autre langue'), fame: r.sl, src: r.frwiki ? `https://www.wikidata.org/wiki/Special:GoToLinkedPage/frwiki/${r.q}` : wdUrl(r.q)})),
            fields: [{key: 'title', label: T('Titre'), type: 'text'}, {key: 'author', label: T('Auteur'), type: 'text'}, {key: 'year', label: T('Paru en'), type: 'year'}, {key: 'lang', label: T('Langue'), type: 'enum', values: [T('en français'), T('autre langue')]},
                {key: 'fame', label: T('Wikipédias (renommée)'), type: 'number'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.y, null]},
        {id: 'et_mode', icon: '👗', label: T('La mode par décennie (gravures et photos)'), group: 'Le monde', source: SRC_TXT.mode, sourceUrl: SRC_URL.mode, enabled: () => on('mode'),
            load: async () => { const M = await load('mode'); const out = []; for (const [d, list] of Object.entries(M?.raw?.decades || {})) for (const g of list) out.push({name: g.title, decade: Number(d), who: T({gravure: 'gravure de mode', hommes: 'mode des hommes', femmes: 'mode des femmes'}[g.who] || g.who), artist: g.artist, licence: g.lic, src: g.page, img: g.t}); return out; },
            fields: [{key: 'name', label: T('Image'), type: 'text'}, {key: 'decade', label: T('Décennie'), type: 'year'}, {key: 'who', label: T('Genre'), type: 'enum'}, {key: 'artist', label: T('Auteur'), type: 'text'}, {key: 'licence', label: T('Licence'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.decade, r.decade + 9], open: r => openPhotoDating({year: r.decade})},
        {id: 'et_photos', icon: '📷', label: T('Formats des photos anciennes (pour dater une photo)'), group: 'Chercher', source: SRC_TXT.nouveautes, sourceUrl: 'https://fr.wikipedia.org/wiki/Daguerr%C3%A9otype', enabled: () => on('mode'),
            load: async () => ((await load('mode'))?.raw?.photos || []).map(p => ({...p, name: p.n, quote: p.sentence, src: p.url})),
            fields: [{key: 'name', label: T('Format'), type: 'text'}, {key: 'from', label: T('De'), type: 'year'}, {key: 'to', label: T('À'), type: 'year'}, {key: 'quote', label: T('La phrase de la source'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: p => [p.from, p.to], open: () => openPhotoDating({})});

    /* ─────────── 🧰 le registre commun des données : à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', country: pl.country || '', county: pl.county || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    const EMPTY = {fleaux: 'Aucun fléau des cultures connu dans ce département (dans nos sources).', greves: 'Aucune grève connue à moins de 20 km.', ouvrages: 'Aucun pont, canal, écluse ou tunnel daté à moins de 5 km.'};
    async function runPlace(kind, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        const html = await placePart(kind, pl, {});
        host.innerHTML = html ? `<div class="hist-life et-life">${html}</div>` : emptyLine(T(EMPTY[kind]), 'ℹ️');
        return !!html;
    }
    async function runPerson(parts, ctx, host, empty) {
        const id = personOfCtx(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true});
        if (!n) host.innerHTML = emptyLine(T(empty), 'ℹ️');
        return n;
    }
    async function runYear(kind, ctx, host) {
        const y = num(ctx.year); if (y === null) { host.innerHTML = emptyLine(T('Choisis une année.'), '📅'); return null; }
        let html = '';
        if (kind === 'livres') { const rows = await rowsOf('livres'), list = booksOf(rows, y); if (list.length) html = row('📚', T('En {y} paraît {b}.', {y: String(y), b: bookLine(list[0])}) + ' ' + refLinks(list[0]), SRC.livres(), more(`<ul class="hist-ul">${list.slice(1, 12).map(r => `<li>${bookLine(r)} ${refLinks(r)}</li>`).join('')}</ul>`, list.length - 1 || null)); }
        if (kind === 'nouveautes') { const rows = await rowsOf('nouveautes'), have = rows.filter(r => r.y <= y), notYet = rows.filter(r => r.y > y); if (rows.length) html = row('💡', T('En {y}, il y a déjà {a} ; il n’y a pas encore {b}.', {y: String(y), a: have.slice(-4).map(r => esc(r.n)).join(', ') || '—', b: notYet.slice(0, 4).map(r => esc(r.n)).join(', ') || '—'}), SRC.nouveautes(), more(`<ul class="hist-ul">${rows.map(r => `<li>${esc(r.icon)} ${novLabel(r)} ${srcLink(r.url)}</li>`).join('')}</ul>`)); }
        if (kind === 'mode') { const M = await load('mode'), imgs = fashionOf(M?.raw?.decades || {}, y, 8); if (imgs.length) html = row('👗', T('La mode des années {d}.', {d: String(decadeOf(y))}), SRC.mode(), `<div class="et-figs">${imgs.map(thumb).join('')}</div>`); }
        host.innerHTML = html ? `<div class="hist-life et-life">${html}</div>` : emptyLine(T('Rien pour cette année dans nos sources.'), 'ℹ️');
        return !!html;
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'et_personne', icon: '🕰', label: T('Son époque et son travail (fléaux, grèves, nouveautés, mode, livres)'), group: 'La personne', needs: ['person'], installed: () => true,
            run: (ctx, host) => runPerson(PARTS.map(p => p[0]), ctx, host, 'Rien trouvé : il faut sa date de naissance, ses lieux placés sur la carte et son métier.')},
        ...MONO.map(([kind, id, icon, label]) => ({id, icon, label: T(label), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})),
        {id: 'et_livres_annee', icon: '📚', label: T('Les livres parus cette année-là'), group: 'Le monde', needs: ['year'], installed: () => true, run: (ctx, host) => runYear('livres', ctx, host)},
        {id: 'et_nouveautes_annee', icon: '💡', label: T('Ce qui existait déjà cette année-là'), group: 'Le monde', needs: ['year'], installed: () => true, run: (ctx, host) => runYear('nouveautes', ctx, host)},
        {id: 'et_mode_annee', icon: '👗', label: T('La mode de cette décennie'), group: 'Le monde', needs: ['year'], installed: () => true, run: (ctx, host) => runYear('mode', ctx, host)},
        {id: 'et_dater_photo', icon: '📷', label: T('Dater une photo ancienne'), group: 'Chercher', needs: [], installed: () => true, run: async (ctx, host) => { host.innerHTML = `<button type="button" class="button" data-et-photo>${esc(T('📷 Ouvrir le guide'))}</button>`; await openPhotoDating({year: num(ctx?.year)}); return true; }});

    /* ─────────── ⚙️ Réglages → 🕰 Son époque ─────────── */
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(Object.keys(FILES).map(async k => { try { const D = await load(k); if (D) metas[k] = {meta: D.meta, n: k === 'mode' ? Object.values(D.raw.decades || {}).reduce((a, b) => a + b.length, 0) : D.rows.length}; } catch (_) {} }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-et-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const rows = PARTS.map(([k, label]) => { const m = metas[k]; if (!m) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(T('Fichier absent.'))}</td></tr>`;
            const mm = m.meta; return `<tr><td>${esc(T(label))}</td><td>${link(mm.url, mm.source)}${mm.note ? `<br><small class="muted">${esc(mm.note)}</small>` : ''}</td><td>${esc(nf(m.n))}</td><td>${esc(mm.licence)}${mm.mention ? ` — « ${esc(mm.mention)} »` : ''}</td><td>${esc(mm.built || '')}</td></tr>`; }).join('');
        ws.innerHTML = `<section class="page cplus-settings et-settings" data-et-settings>${UI().pageHeader ? UI().pageHeader({title: T('Son époque'), icon: '🕰', where: T('Réglages · Données'), help: esc(T('Les fléaux des cultures, les grèves, les ponts et canaux, les nouveautés, la mode et les livres, autour de la vie et du métier de chacun. Les données sont livrées avec l’app ; seules les images de mode viennent d’Internet.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🕰 Son époque »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes.'))}</p>${PARTS.map(tg).join('')}
                <p><button type="button" class="button secondary" data-et-photo>${esc(T('📷 Dater une photo ancienne'))}</button></p></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="muted">${esc(T('Les rapprochements (un fléau dans son département, une grève à moins de 20 km, un ouvrage près de chez lui) sont faits par l’app d’après son métier, ses lieux et ses dates : ce sont des pistes.'))}</p></div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-et-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.etTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'histoire_autour'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'epoque_travail')) { let i = B.findIndex(b => b[0] === 'histoire_autour'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire'); if (i < 0) i = B.findIndex(b => b[0] === 'world'); B.splice(i < 0 ? B.length : i + 1, 0, ['epoque_travail', '🕰 Son époque']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.epoque_travail ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.epoqueTravail = {...core, load, settings, personInto, placeInto, placePart, lifeOf, openPhotoDating, openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
