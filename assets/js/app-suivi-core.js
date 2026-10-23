/* LCNDA — 🐾 Suivi des animaux : le moteur (sans écran). Aussi chargé par Node pour les tests : require('…/app-suivi-core.js').
 *
 *  - les couleurs de base des bagues (RING_COLORS) et la couleur la plus proche d'une couleur choisie à la main (C2) ;
 *  - les profils de marques selon l'espèce (PROFILES : oiseau, compagnie, cheval, ferme, poisson, marin, sauvage, primate) ;
 *  - la lecture d'un code avec ses doutes : « 7? » (caractère pas lu), « 7[K|X] » (K ou X) → parseReading / formatReading ;
 *  - les animaux candidats d'une observation (candidates) : couleurs vues sur les pattes, code (même partiel ou douteux :
 *    score plus bas), n° de puce / tatouage / boucle, distance au dernier endroit vu ;
 *  - géographie : distances, trajet, zone fréquentée (enveloppe convexe), un point toutes les N min, couper en nuits ;
 *  - lecteurs écrits à la main : GPX, KML, GeoJSON, CSV (Movebank, colliers Tractive, Weenect, Invoxia, Kippy…), XML sans
 *    DOCTYPE ni ENTITY, tailles bornées ; et les exports CSV, Movebank (CSV), GPX, KML.
 */
(function (root) {
    'use strict';
    const MAX_TEXT = 40 * 1024 * 1024, MAX_POINTS = 500000;

    /* ═════ Couleurs des bagues (couleurs standard d'office ; toute autre couleur par l'outil commun C2) ═════ */
    const RING_COLORS = [
        ['blanc', 'blanc', '#ffffff', 'B'], ['noir', 'noir', '#111111', 'N'], ['rouge', 'rouge', '#d7262e', 'R'], ['orange', 'orange', '#f07d1a', 'O'],
        ['jaune', 'jaune', '#f2c500', 'J'], ['vert_clair', 'vert clair', '#7fd34e', 'Vc'], ['vert', 'vert foncé', '#1a8a3a', 'V'], ['bleu_clair', 'bleu clair', '#5ab4f0', 'Bc'],
        ['bleu', 'bleu foncé', '#1d4fb8', 'Bf'], ['violet', 'violet', '#7b3fb5', 'Vi'], ['rose', 'rose', '#f28cc0', 'Ro'], ['gris', 'gris', '#9a9a9a', 'Gr'],
        ['marron', 'marron', '#8a5a2b', 'Ma'], ['metal', 'métal', '#c0c4c8', 'M']];
    const FAMILY = {vert_clair: 'vert', vert: 'vert', bleu_clair: 'bleu', bleu: 'bleu', rose: 'rouge', rouge: 'rouge', orange: 'jaune', jaune: 'jaune', gris: 'gris', metal: 'gris', blanc: 'blanc', noir: 'noir', violet: 'violet', marron: 'marron'};
    const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    /** La couleur de base la plus proche (clé) d'une couleur « #rrggbb » ; une clé de base est rendue telle quelle */
    function colorKey(c) {
        if (!c) return '';
        if (RING_COLORS.some(r => r[0] === c)) return c;
        const rgb = hexRgb(c); if (!rgb) return '';
        let best = '', bd = Infinity;
        RING_COLORS.forEach(([k, , hex]) => { if (k === 'metal') return; const o = hexRgb(hex), d = (o[0] - rgb[0]) ** 2 * 2 + (o[1] - rgb[1]) ** 2 * 4 + (o[2] - rgb[2]) ** 2 * 3; if (d < bd) { bd = d; best = k; } });
        return best;
    }
    const colorInfo = k => RING_COLORS.find(r => r[0] === k) || null;
    const ringKey = r => !r ? '' : r.metal ? 'metal' : colorKey(r.color);
    const abbr = r => { const k = ringKey(r); return k ? colorInfo(k)[3] : '?'; };

    /* ═════ Profils : les marques proposées selon l'espèce, et comment on retrouve l'animal ═════ */
    const MARKS = {
        metal: {icon: '🔩', label: 'Bague métal', num: 'Numéro', scheme: 'Centre (CRBPO — Muséum, Paris…)'},
        color_rings: {icon: '🎨', label: 'Bagues de couleur', rings: true},
        wing_tag: {icon: '🏷️', label: 'Marque d’aile', num: 'Code', color: true},
        gps_tag: {icon: '📡', label: 'Balise GPS', num: 'N° de la balise', model: 'Modèle (OrniTrack-10…)', interval: true},
        chip: {icon: '💉', label: 'Puce électronique', num: 'N° de puce (15 chiffres)'},
        tattoo: {icon: '✒️', label: 'Tatouage', num: 'Tatouage'},
        collar: {icon: '⭕', label: 'Collier', num: 'Inscription', color: true},
        medal: {icon: '🏅', label: 'Médaille', num: 'Inscription'},
        gps_collar: {icon: '📡', label: 'Collier GPS', num: 'N° du collier', model: 'Modèle (Tractive, Weenect, Invoxia, Kippy…)', interval: true},
        sire: {icon: '🪪', label: 'N° SIRE / UELN', num: 'UELN'},
        signalement: {icon: '🐴', label: 'Signalement', num: 'Marques blanches, épis…'},
        ear_tag: {icon: '🏷️', label: 'Boucle d’oreille', num: 'N° national', color: true},
        pit: {icon: '🔹', label: 'Transpondeur PIT', num: 'Code'},
        scute: {icon: '🐢', label: 'Marque d’écaille', num: 'Code'},
        forearm_ring: {icon: '🦇', label: 'Bague d’avant-bras', num: 'Code'},
        transmitter: {icon: '📻', label: 'Émetteur', num: 'Fréquence ou n°', model: 'Modèle'},
        photo_id: {icon: '📸', label: 'Photo-identification', num: 'N° au catalogue', photo: true, hint: 'nageoire dorsale, caudale, cicatrices, motifs du pelage ou du visage'},
        satellite: {icon: '🛰️', label: 'Balise satellite (Argos)', num: 'PTT / n° Argos', model: 'Modèle', interval: true},
        fin_tag: {icon: '🏷️', label: 'Marque de nageoire', num: 'Code', color: true},
        vhf_collar: {icon: '📻', label: 'Collier GPS / VHF', num: 'Fréquence ou n°', model: 'Modèle', interval: true},
        ear_notch: {icon: '✂️', label: 'Encoche d’oreille', num: 'Code des encoches'},
        other: {icon: '✎', label: 'Autre marque', num: 'Texte de la marque'},
    };
    const PROFILES = {
        oiseau: {icon: '🐦', label: 'Oiseau', tab: '🔖 Bagues et marques', marks: ['metal', 'color_rings', 'wing_tag', 'gps_tag', 'other'], find: 'rings', unit: 'oiseaux',
            behaviors: ['se_nourrit', 'niche', 'groupe', 'toilette', 'dortoir', 'crie', 'vol', 'couple'], causes: ['vitre', 'voiture', 'chat', 'peche', 'poison', 'piege', 'inconnue']},
        compagnie: {icon: '🐈', label: 'Chat, chien…', tab: '🔖 Marques', marks: ['chip', 'tattoo', 'collar', 'medal', 'gps_collar', 'other'], find: 'number', unit: 'animaux',
            behaviors: ['se_nourrit', 'chasse', 'dort', 'joue', 'bagarre', 'rentre'], causes: ['voiture', 'bagarre', 'chute', 'poison', 'maladie', 'inconnue']},
        cheval: {icon: '🐎', label: 'Cheval', tab: '🔖 Marques', marks: ['chip', 'sire', 'signalement', 'other'], find: 'number', unit: 'chevaux',
            behaviors: ['broute', 'galop', 'troupeau', 'repos'], causes: ['chute', 'clôture', 'coup', 'colique', 'inconnue']},
        ferme: {icon: '🐄', label: 'Vache, mouton, chèvre', tab: '🔖 Marques', marks: ['ear_tag', 'tattoo', 'chip', 'other'], find: 'number', unit: 'bêtes',
            behaviors: ['broute', 'troupeau', 'repos', 'mise_bas'], causes: ['clôture', 'chien', 'maladie', 'inconnue']},
        poisson: {icon: '🐟', label: 'Poisson, tortue, chauve-souris', tab: '🔖 Marques', marks: ['pit', 'scute', 'forearm_ring', 'transmitter', 'other'], find: 'number', unit: 'animaux',
            behaviors: ['nage', 'chasse', 'repos', 'hiberne', 'ponte'], causes: ['peche', 'eolienne', 'chat', 'poison', 'inconnue']},
        marin: {icon: '🐬', label: 'Animal marin', tab: '🔖 Marques', marks: ['photo_id', 'satellite', 'fin_tag', 'pit', 'other'], find: 'number', unit: 'individus', sea: true,
            behaviors: ['surface', 'saut', 'plonge', 'chasse', 'groupe', 'proue', 'repos'], causes: ['filet', 'bateau', 'plastique', 'bruit', 'echouage', 'inconnue']},
        sauvage: {icon: '🦊', label: 'Mammifère sauvage', tab: '🔖 Marques', marks: ['vhf_collar', 'ear_tag', 'ear_notch', 'tattoo', 'chip', 'photo_id', 'other'], find: 'number', unit: 'animaux', camtrap: true,
            behaviors: ['se_nourrit', 'chasse', 'groupe', 'repos', 'marquage', 'jeunes', 'piege_photo'], causes: ['voiture', 'tondeuse', 'piege', 'chien', 'poison', 'chasse', 'inconnue']},
        primate: {icon: '🐒', label: 'Primate', tab: '🔖 Marques', marks: ['photo_id', 'chip', 'tattoo', 'vhf_collar', 'other'], find: 'number', unit: 'individus', camtrap: true,
            behaviors: ['se_nourrit', 'toilettage', 'groupe', 'repos', 'outils', 'conflit', 'jeunes'], causes: ['conflit', 'braconnage', 'maladie', 'piege', 'inconnue']},
        autre: {icon: '🐾', label: 'Autre', tab: '🔖 Marques', marks: ['chip', 'tattoo', 'photo_id', 'other'], find: 'number', unit: 'animaux',
            behaviors: ['se_nourrit', 'groupe', 'repos'], causes: ['voiture', 'inconnue']},
    };
    const BEHAVIORS = {se_nourrit: '🍽 Se nourrit', niche: '🪺 Niche', groupe: '👥 En groupe', toilette: '🪶 Toilette', dortoir: '💤 Au dortoir', crie: '📣 Crie', vol: '🕊 En vol', couple: '💞 En couple',
        chasse: '🎯 Chasse', dort: '💤 Dort', joue: '🧶 Joue', bagarre: '⚔️ Bagarre', rentre: '🏠 Rentré', broute: '🌾 Broute', galop: '🐎 Galope', troupeau: '🐄 En troupeau', repos: '😴 Au repos', mise_bas: '🍼 Mise bas',
        nage: '🌊 Nage', hiberne: '❄️ Hiberne', ponte: '🥚 Ponte', surface: '🌊 En surface', saut: '🐬 Saute', plonge: '⤵️ Plonge', proue: '⛵ À la proue', marquage: '🧭 Marque son territoire',
        jeunes: '🍼 Avec des jeunes', piege_photo: '📷 Piège photo', toilettage: '🤲 Toilettage', outils: '🪵 Utilise un outil', conflit: '⚔️ Conflit', changed: '🔖 Bague changée'};
    const CAUSES = {voiture: '🚗 Voiture', vitre: '🪟 Vitre', chat: '🐈 Chat', piege: '🪤 Piège', peche: '🎣 Fil de pêche', poison: '☠️ Poison', tondeuse: '🌿 Tondeuse', bagarre: '⚔️ Bagarre', chute: '⬇️ Chute',
        maladie: '🦠 Maladie', 'clôture': '🚧 Clôture', coup: '🦶 Coup', colique: '🩺 Colique', chien: '🐕 Chien', eolienne: '🌬 Éolienne', filet: '🕸 Filet de pêche', bateau: '🚤 Bateau', plastique: '🛍 Plastique',
        bruit: '🔊 Bruit', echouage: '🏖 Échouage', chasse: '🎯 Chasse', conflit: '⚔️ Conflit avec un autre', braconnage: '🚫 Braconnage', inconnue: '❓ Inconnue'};
    const HEALTH_STATES = [['sain', 'Bonne santé', 'green'], ['blesse', 'Blessé', 'red'], ['malade', 'Malade', 'red'], ['soins', 'En soins', 'blue'], ['relache', 'Relâché', 'green'], ['mort', '† Mort', 'black']];
    const HEALTH_WHAT = [['blessure', '🩹 Blessure'], ['maladie', '🦠 Maladie'], ['maigreur', '🦴 Maigreur'], ['parasites', '🪱 Parasites'], ['controle', '🩺 Contrôle'], ['vaccin', '💉 Vaccin, traitement']];
    const GROUP_KINDS = ['groupe', 'clan', 'meute', 'troupe', 'pod', 'harde', 'colonie', 'famille', 'bande'];
    const ROLES = ['alpha', 'dominant', 'dominante', 'subordonné', 'matriarche', 'reproducteur', 'jeune', 'satellite', 'sentinelle', 'éclaireur'];
    const END_REASONS = [['depart', 'est parti de lui-même'], ['exclu', 'a été exclu, chassé du groupe'], ['mort', 'est mort'], ['transfert', 'est passé dans un autre groupe'], ['role', 'a changé de rôle'], ['inconnu', 'n’est plus revu']];
    /** Le profil d'après l'espèce de la fiche et le nom de l'espèce (même règle que lib/suivi.php) */
    function guessProfile(species, taxon = '', breed = '') {
        const t = `${taxon} ${breed}`.toLowerCase();
        if (/chimpanz|gorille|bonobo|orang|macaque|babouin|singe|lémur|lemur|gibbon|capucin|primate/.test(t)) return 'primate';
        if (/dauphin|baleine|orque|cachalot|phoque|otarie|marsouin|dugong|lamantin|requin|tortue marine|tortue luth|morse|béluga|beluga|rorqual|globicéphale|raie manta/.test(t)) return 'marin';
        return ({oiseau: 'oiseau', chien: 'compagnie', chat: 'compagnie', lapin: 'compagnie', rongeur: 'compagnie', cheval: 'cheval', ferme: 'ferme', poisson: 'poisson', reptile: 'poisson', marin: 'marin'})[species]
            || (species === 'sauvage' ? (/chauve|pipistrelle|murin|noctule/.test(t) ? 'poisson' : 'sauvage') : (/loup|renard|cerf|chevreuil|sanglier|ours|lynx|blaireau|hérisson|herisson|loutre|castor|bouquetin|chamois|éléphant|elephant|lion|tigre|zèbre|girafe/.test(t) ? 'sauvage' : 'autre'));
    }
    const profileOf = a => PROFILES[a?.profile] ? a.profile : guessProfile(a?.species || '', a?.taxon || '', a?.breed || '');

    /* ═════ Lecture d'un code : « 7? » (pas lu), « 7[K|X] » (K ou X) ═════ */
    /** → {chars: [['7'], ['K','X'] | null…], unknown, doubtful, text} ; « … » ou « * » à la fin = la suite n'a pas été lue */
    function parseReading(raw) {
        const s = String(raw || '').toUpperCase().replace(/\s+/g, '').slice(0, 60);
        const chars = []; let open = false, partial = false;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (c === '[' || c === '(') { const end = s.indexOf(c === '[' ? ']' : ')', i); if (end < 0) break; const opts = s.slice(i + 1, end).split(/[|/,]/).join('').replace(/[^0-9A-Z]/g, ''); chars.push(opts ? [...new Set(opts.split(''))] : null); i = end; continue; }
            if (c === '?' || c === '_') { chars.push(null); continue; }
            if (c === '…' || c === '*' || (c === '.' && s.slice(i, i + 3) === '...')) { partial = true; break; }
            if (/[0-9A-Z]/.test(c)) chars.push([c]);
            void open;
        }
        const unknown = chars.filter(c => c === null).length, doubtful = chars.filter(c => c && c.length > 1).length;
        return {chars, unknown, doubtful, partial, text: formatReading(chars) + (partial ? '…' : '')};
    }
    const formatReading = chars => (chars || []).map(c => c === null ? '?' : c.length === 1 ? c[0] : `[${c.join('|')}]`).join('');
    const norm = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    /** Score d'un code gravé ou écrit (« 7K ») pour une lecture : 1 = sûr ; un caractère pas lu compte 0,5, un doute entre n caractères 1 − 0,15 × (n − 1) ; 0 si un caractère sûr ne va pas */
    function scoreCode(reading, code) {
        const r = typeof reading === 'string' ? parseReading(reading) : reading, c = norm(code);
        if (!r || !r.chars.length || !c) return 0;
        if (r.partial ? r.chars.length > c.length : r.chars.length !== c.length) return 0;
        let sum = 0;
        for (let i = 0; i < r.chars.length; i++) {
            const set = r.chars[i];
            if (set === null) { sum += .5; continue; }
            if (!set.includes(c[i])) return 0;
            sum += set.length === 1 ? 1 : Math.max(.5, 1 - .15 * (set.length - 1));
        }
        const s = sum / r.chars.length;
        return r.partial ? s * (.6 + .4 * r.chars.length / c.length) : s;
    }
    /** Un n° (puce, tatouage, boucle) tapé en partie : « 250 26 9… », « …4471 », avec ? et [3|8] → score 0–1 */
    function scoreNumber(typed, code) {
        const c = norm(code), t = String(typed || '').toUpperCase().replace(/\s+/g, '');
        if (!c || !t) return 0;
        const parts = t.split(/…|\.\.\.|\*/);
        const toRe = part => parseReading(part).chars.map(ch => ch === null ? '[0-9A-Z]' : `[${ch.join('')}]`).join('');
        const bits = parts.map(toRe);
        const anchored = !/^(…|\.\.\.|\*)/.test(t), open = /(…|\.\.\.|\*)$/.test(t) || parts.length > 1;
        let re; try { re = new RegExp((anchored ? '^' : '') + bits.filter(Boolean).join('[0-9A-Z]*') + (open ? '' : '$')); } catch (_) { return 0; }
        if (!re.test(c)) return 0;
        const pr = parseReading(parts.join(''));
        const known = pr.chars.length, doubt = pr.unknown * .5 + pr.doubtful * .15;
        const cover = Math.min(1, known / c.length);
        return Math.max(.05, (open ? .7 + .3 * cover : 1) - doubt / Math.max(1, known));
    }

    /* ═════ Couleurs vues sur les pattes : {L:[haut, bas], R:[haut, bas]} ; valeur = clé de couleur, '#hex', '?', 'none', 'metal', ou null (pas regardé) ═════ */
    function scoreColors(seen, combo) {
        if (!seen || !combo) return null;
        const one = (s, ring) => {
            if (s === 'none') return ring ? 0 : 1;
            if (s === '?') return ring ? .7 : 0;
            if (!ring) return 0;
            const a = s === 'metal' ? 'metal' : colorKey(s), b = ringKey(ring);
            if (a === b) return 1;
            return FAMILY[a] && FAMILY[a] === FAMILY[b] ? .4 : 0;
        };
        const run = mirror => {
            let n = 0, sum = 0, zero = false;
            for (const leg of ['L', 'R']) for (const i of [0, 1]) {
                const s = seen?.[leg]?.[i]; if (s == null || s === '') continue;
                const ring = combo?.[mirror ? (leg === 'L' ? 'R' : 'L') : leg]?.[i] || null;
                const v = one(s, ring); n++; sum += v; if (v === 0) zero = true;
            }
            return n ? {score: sum / n, n, zero} : null;
        };
        const d = run(false), m = run(true);
        if (!d) return null;
        if (m && !m.zero && (d.zero || m.score > d.score + .01)) return {score: m.score * .75, mirrored: true, n: m.n};
        return {score: d.zero ? 0 : d.score, mirrored: false, n: d.n};
    }
    /** Le code court que lisent les observateurs : « G V/M · D R/B « 7K » » */
    function comboText(colors, code = '') {
        if (!colors) return code ? `« ${code} »` : '';
        const leg = l => (colors[l] || []).map(r => r ? abbr(r) : '∅').join('/');
        const codes = ['L', 'R'].flatMap(l => (colors[l] || []).map(r => r?.code).filter(Boolean));
        return `G ${leg('L')} · D ${leg('R')}${codes.length ? ` « ${codes.join(' ')} »` : code ? ` « ${code} »` : ''}`;
    }
    const ringsOf = a => (a.marks || []).find(m => m.kind === 'color_rings' && !m.end_iso && !m.end_date)?.colors || null;
    const ringCodeOf = a => { const c = ringsOf(a); return c ? ['L', 'R'].flatMap(l => (c[l] || []).map(r => r?.code).filter(Boolean)).join('') : ''; };
    const numbersOf = a => [...(a.marks || []).filter(m => !m.end_iso && !m.end_date && m.code && m.kind !== 'color_rings').map(m => ({code: m.code, kind: m.kind})), ...['microchip', 'tattoo', 'ueln'].filter(k => a[k]).map(k => ({code: a[k], kind: k}))];

    /* ═════ Géographie ═════ */
    const RAD = Math.PI / 180;
    const km = (la1, lo1, la2, lo2) => { const a = Math.sin((la2 - la1) * RAD / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin((lo2 - lo1) * RAD / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(a))); };
    const pathKm = pts => { let d = 0; for (let i = 1; i < pts.length; i++) d += km(pts[i - 1][1], pts[i - 1][2], pts[i][1], pts[i][2]); return d; };
    /** Zone fréquentée : l'enveloppe convexe des points [[t, lat, lon]] (ou [lat, lon]) → {hull: [[lat, lon]…], km2} */
    function hull(points) {
        const P = points.map(p => p.length >= 3 ? [p[1], p[2]] : [p[0], p[1]]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
        if (P.length < 3) return {hull: P, km2: 0};
        const lat0 = P.reduce((s, p) => s + p[0], 0) / P.length, kx = 111.32 * Math.cos(lat0 * RAD), ky = 110.57;
        const xy = [...new Map(P.map(p => [`${p[0].toFixed(6)},${p[1].toFixed(6)}`, [p[1] * kx, p[0] * ky, p]])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        if (xy.length < 3) return {hull: xy.map(p => p[2]), km2: 0};
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lower = [], upper = [];
        for (const p of xy) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
        for (let i = xy.length - 1; i >= 0; i--) { const p = xy[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
        const H = lower.slice(0, -1).concat(upper.slice(0, -1));
        let area = 0; for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length]; area += a[0] * b[1] - b[0] * a[1]; }
        return {hull: H.map(p => p[2]), km2: Math.abs(area) / 2};
    }
    /** Un point toutes les N minutes (les points triés par l'heure) */
    function thin(points, everyMin) {
        const step = Math.max(0, Number(everyMin) || 0) * 60; if (!step) return points.slice();
        const out = []; let last = -Infinity;
        for (const p of points) if (p[0] - last >= step) { out.push(p); last = p[0]; }
        return out;
    }
    /** Couper en nuits (une sortie = un trajet) : un trou de plus de gapMin minutes commence un nouveau trajet */
    function splitTrips(points, gapMin = 120) {
        const trips = []; let cur = [];
        for (const p of points) { if (cur.length && p[0] - cur[cur.length - 1][0] > gapMin * 60) { trips.push(cur); cur = []; } cur.push(p); }
        if (cur.length) trips.push(cur);
        return trips.filter(t => t.length > 1).map(t => ({points: t, t0: t[0][0], t1: t[t.length - 1][0], km: pathKm(t)}));
    }
    /** Le plus loin d'un point (la maison) : {km, at (instant)} */
    function farthest(points, home) {
        let best = {km: 0, at: null};
        if (!home || !Number.isFinite(home.lat)) return best;
        for (const p of points) { const d = km(home.lat, home.lon, p[1], p[2]); if (d > best.km) best = {km: d, at: p[0]}; }
        return best;
    }

    /* ═════ Les animaux qui correspondent à une observation ═════ */
    /**
     * animals : [{id, title, marks, microchip, tattoo, ueln, last_obs:{lat, lon, iso}, gps_last, deceased}] ;
     * seen : {reading (« 7? »), colors ({L, R}), number (« 250 26 9… »), lat, lon, iso (date de l'observation)}
     * → [{animal, score (0–1), pct, label, parts: {colors, code, number}, mirrored, km, reasons}] du plus probable au moins probable.
     */
    function candidates(animals, seen = {}) {
        const reading = seen.reading ? parseReading(seen.reading) : null;
        const hasColors = seen.colors && ['L', 'R'].some(l => (seen.colors[l] || []).some(v => v != null && v !== ''));
        const out = [];
        for (const a of animals || []) {
            let w = 0, s = 0; const parts = {}, reasons = []; let mirrored = false;
            if (hasColors) {
                const c = scoreColors(seen.colors, ringsOf(a));
                if (!c) continue;
                if (c.score <= 0) continue;
                parts.colors = c.score; w += .55; s += .55 * c.score; mirrored = c.mirrored; if (c.mirrored) reasons.push('pattes inversées');
            }
            if (reading && reading.chars.length) {
                const codes = [ringCodeOf(a), ...numbersOf(a).map(n => n.code)].filter(Boolean);
                const best = Math.max(0, ...codes.map(c => scoreCode(reading, c)));
                if (best <= 0) continue;
                parts.code = best; w += .45; s += .45 * best;
            }
            if (seen.number) {
                const best = Math.max(0, ...numbersOf(a).map(n => scoreNumber(seen.number, n.code)));
                if (best <= 0) continue;
                parts.number = best; w += 1; s += best;
            }
            if (!w) continue;
            let score = s / w;
            const last = a.last_obs && Number.isFinite(a.last_obs.lat) ? a.last_obs : a.gps_last || null;
            let dist = null;
            if (last && Number.isFinite(seen.lat) && Number.isFinite(last.lat)) {
                dist = km(seen.lat, seen.lon, last.lat, last.lon);
                score *= dist < 1 ? 1 : dist < 3 ? .95 : dist < 10 ? .87 : dist < 50 ? .75 : .6;
                if (dist < 1) reasons.push('vu près d’ici');
            }
            const lastIso = a.last_obs?.iso || '';
            if (lastIso && seen.iso && /^\d{4}-\d{2}-\d{2}/.test(lastIso) && /^\d{4}-\d{2}-\d{2}/.test(seen.iso)) {
                const days = (Date.parse(seen.iso.slice(0, 10)) - Date.parse(lastIso.slice(0, 10))) / 864e5;
                if (days > 180) { score *= .85; reasons.push(`pas vu depuis ${Math.round(days / 30)} mois`); }
            }
            if (a.deceased) { score *= .3; reasons.push('mort'); }
            out.push({animal: a, score, pct: Math.round(score * 100), parts, mirrored, km: dist, reasons});
        }
        out.sort((x, y) => y.score - x.score || String(x.animal.title).localeCompare(String(y.animal.title)));
        out.forEach((c, i) => { c.label = c.pct >= 80 ? 'très probable' : c.pct >= 50 ? 'possible' : 'peu probable'; c.tie = i === 0 && out[1] && Math.abs(out[1].score - c.score) < .05; });
        return out;
    }
    /** Fiabilité d'une lecture : 'full' (lue en entier), 'partial' (lecture partielle ou douteuse), 'colors' (couleurs seules), 'doubt' (deux animaux autant) */
    function reliability({reading, colors, tie = false} = {}) {
        if (tie) return 'doubt';
        const r = reading ? parseReading(reading) : null;
        const cs = colors ? ['L', 'R'].flatMap(l => (colors[l] || [])).filter(v => v != null && v !== '') : [];
        if (!r?.chars.length) return cs.length ? (cs.includes('?') ? 'partial' : 'colors') : '';
        return r.unknown || r.doubtful || r.partial || cs.includes('?') ? 'partial' : 'full';
    }

    /* ═════ Lecteurs de fichiers (écrits à la main) ═════ */
    function checkText(text) {
        const t = String(text ?? '');
        if (t.length > MAX_TEXT) throw new Error('Fichier trop gros (40 Mo au plus).');
        return t.replace(/^﻿/, '');
    }
    function checkXml(text) {
        const t = checkText(text);
        if (/<!DOCTYPE|<!ENTITY/i.test(t)) throw new Error('Fichier refusé : il contient une déclaration DOCTYPE ou ENTITY.');
        return t;
    }
    const xmlUnesc = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n)))).replace(/&amp;/g, '&');
    const tag = (body, name) => { const m = new RegExp(`<(?:[a-z]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[a-z]+:)?${name}>`, 'i').exec(body); return m ? xmlUnesc(m[1]).trim() : ''; };
    const attr = (s, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(s); return m ? (m[2] ?? m[3]) : ''; };
    /** Une date-heure écrite de bien des façons → secondes (UTC si le texte le dit, sinon l'heure de l'ordinateur ; utc = true pour Movebank) */
    function readStamp(v, utc = false) {
        let s = String(v ?? '').trim(); if (!s) return null;
        if (/^\d{9,13}(\.\d+)?$/.test(s)) { const n = Number(s); return Math.round(n > 1e11 ? n / 1000 : n); }
        let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|UTC|[+-]\d{2}:?\d{2})?$/i.exec(s);
        let y, mo, d, h = 0, mi = 0, se = 0, tz = '';
        if (m) { [, y, mo, d] = m; h = m[4] || 0; mi = m[5] || 0; se = m[6] || 0; tz = m[7] || ''; }
        else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T,]+(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?\s*(Z|UTC)?$/i.exec(s))) { [, d, mo, y] = m; h = m[4] || 0; mi = m[5] || 0; se = m[6] || 0; tz = m[7] || ''; }
        else { const t = Date.parse(s); return Number.isFinite(t) ? Math.round(t / 1000) : null; }
        [y, mo, d, h, mi, se] = [y, mo, d, h, mi, se].map(Number);
        if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 60) return null;
        if (tz && /^[+-]/.test(tz)) { const sign = tz[0] === '-' ? -1 : 1, z = tz.replace(/[^0-9]/g, ''); const off = sign * (Number(z.slice(0, 2)) * 60 + Number(z.slice(2, 4) || 0)); return Math.round(Date.UTC(y, mo - 1, d, h, mi, se) / 1000) - off * 60; }
        return Math.round((tz || utc ? Date.UTC(y, mo - 1, d, h, mi, se) : new Date(y, mo - 1, d, h, mi, se).getTime()) / 1000);
    }
    const okPt = (t, la, lo) => Number.isFinite(t) && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0);
    function finish(points, format, extra = {}) {
        if (points.length > MAX_POINTS) throw new Error(`Trop de points (${MAX_POINTS.toLocaleString('fr-FR')} au plus).`);
        const pts = points.filter(p => okPt(p[0], p[1], p[2])).sort((a, b) => a[0] - b[0]);
        const seen = new Set(), out = [];
        for (const p of pts) { if (seen.has(p[0])) continue; seen.add(p[0]); out.push(p); }
        if (!out.length) throw new Error('Aucun point lisible : il faut une date, une heure, une latitude et une longitude.');
        return {format, points: out, ignored: points.length - out.length, ...extra};
    }
    /** Les blocs <nom …>…</nom> d'un fichier, en un seul passage (un bloc jamais fermé s'arrête au début du suivant :
     *  sans ça, un fichier plein de balises ouvertes demandait des heures, le navigateur restait figé) */
    function blocks(t, nameRe) {
        const re = new RegExp(`<(\\/?)(${nameRe})\\b([^>]*?)(\\/?)>`, 'gi'), out = [];
        let cur = null, m;
        while ((m = re.exec(t))) {
            if (!m[1]) {
                if (cur) out.push({attrs: cur.attrs, body: ''});
                if (m[4]) { out.push({attrs: m[3], body: ''}); cur = null; } else cur = {name: m[2].toLowerCase(), attrs: m[3], start: re.lastIndex};
            } else if (cur && m[2].toLowerCase() === cur.name) { out.push({attrs: cur.attrs, body: t.slice(cur.start, m.index)}); cur = null; }
            if (out.length > MAX_POINTS) break;
        }
        if (cur) out.push({attrs: cur.attrs, body: ''});
        return out;
    }
    function parseGPX(text) {
        const t = checkXml(text), pts = [];
        for (const b of blocks(t, '(?:[a-z]+:)?(?:trkpt|wpt|rtept)')) {
            const body = b.body, time = readStamp(tag(body, 'time'));
            const ele = parseFloat(tag(body, 'ele'));
            pts.push([time, parseFloat(attr(b.attrs, 'lat')), parseFloat(attr(b.attrs, 'lon')), Number.isFinite(ele) ? ele : null]);
            if (pts.length > MAX_POINTS) break;
        }
        const name = tag(t.slice(0, 20000), 'name'), creator = attr(t.slice(0, 2000), 'creator');
        return finish(pts, /tractive/i.test(creator + name) ? 'Tractive (GPX)' : 'GPX', {name, ids: name ? [name] : []});
    }
    function parseKML(text) {
        const t = checkXml(text), pts = [];
        // gx:Track : <when> puis <gx:coord>lon lat alt</gx:coord>, dans le même ordre
        const tracks = blocks(t, 'gx:Track').map(b => b.body);
        for (const tr of tracks) {
            const whens = [...tr.matchAll(/<when>([^<]*)<\/when>/gi)].map(x => readStamp(xmlUnesc(x[1])));
            const coords = [...tr.matchAll(/<gx:coord>([^<]*)<\/gx:coord>/gi)].map(x => xmlUnesc(x[1]).trim().split(/\s+/).map(Number));
            coords.forEach((c, i) => pts.push([whens[i], c[1], c[0], Number.isFinite(c[2]) ? c[2] : null]));
        }
        // Placemark daté (TimeStamp/when) avec un Point
        for (const pm of blocks(t, 'Placemark').map(b => b.body)) {
            if (/<gx:Track/i.test(pm)) continue;
            const when = readStamp(tag(pm, 'when')), c = tag(pm, 'coordinates').split(/\s+/)[0]?.split(',').map(Number);
            if (c && c.length >= 2) pts.push([when, c[1], c[0], Number.isFinite(c[2]) ? c[2] : null]);
        }
        return finish(pts, 'KML', {name: tag(t.slice(0, 20000), 'name')});
    }
    function parseGeoJSON(text) {
        let j; try { j = JSON.parse(checkText(text)); } catch (_) { throw new Error('GeoJSON illisible.'); }
        const feats = Array.isArray(j?.features) ? j.features : j?.type === 'Feature' ? [j] : [];
        const pts = [];
        for (const f of feats.slice(0, MAX_POINTS + 1)) {
            const g = f?.geometry, p = f?.properties || {};
            const time = readStamp(p.time ?? p.timestamp ?? p.date ?? p.datetime ?? '');
            if (g?.type === 'Point' && Array.isArray(g.coordinates)) pts.push([time, Number(g.coordinates[1]), Number(g.coordinates[0]), Number(g.coordinates[2]) || null]);
            else if (g?.type === 'LineString' && Array.isArray(p.times || p.coordTimes)) (g.coordinates || []).forEach((c, i) => pts.push([readStamp((p.times || p.coordTimes)[i]), Number(c[1]), Number(c[0]), Number(c[2]) || null]));
        }
        return finish(pts, 'GeoJSON');
    }
    /** Un petit lecteur CSV (guillemets, séparateur , ; ou tabulation deviné) */
    function csvRows(text, sep) {
        const t = checkText(text);
        if (!sep) { const head = t.slice(0, 4000).split(/\r?\n/)[0] || ''; const c = {',': (head.match(/,/g) || []).length, ';': (head.match(/;/g) || []).length, '\t': (head.match(/\t/g) || []).length}; sep = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; }
        const rows = []; let row = [], cell = '', q = false;
        for (let i = 0; i < t.length; i++) {
            const ch = t[i];
            if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
            if (ch === '"' && cell === '') { q = true; continue; }
            if (ch === sep) { row.push(cell); cell = ''; continue; }
            if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; if (rows.length > MAX_POINTS + 1) break; continue; }
            cell += ch;
        }
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        return {rows: rows.filter(r => r.some(v => String(v).trim() !== '')), sep};
    }
    const keyOf = h => String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    function parseCSV(text, filename = '') {
        const {rows, sep} = csvRows(text);
        if (rows.length < 2) throw new Error('Le tableau est vide.');
        const head = rows[0].map(keyOf);
        const find = (...names) => { for (const n of names) { const i = head.findIndex(h => h === n); if (i >= 0) return i; } for (const n of names) { const i = head.findIndex(h => h.startsWith(n + ' ') || h.endsWith(' ' + n)); if (i >= 0) return i; } return -1; };
        const iLat = find('location lat', 'latitude', 'lat', 'gps lat', 'y'), iLon = find('location long', 'longitude', 'lon', 'lng', 'long', 'gps lon', 'x');
        const iStamp = find('timestamp', 'study local timestamp', 'datetime', 'date time', 'date heure', 'gps time', 'fix time', 'time utc', 'utc', 'recorded at', 'created at');
        const iDate = find('date', 'jour', 'day'), iTime = find('time', 'heure', 'hour');
        const iId = find('individual local identifier', 'tag local identifier', 'animal', 'individual', 'name', 'nom', 'tracker', 'device', 'collar');
        const iAlt = find('height above msl', 'height above ellipsoid', 'altitude', 'alt', 'ele', 'elevation');
        if (iLat < 0 || iLon < 0) throw new Error('Colonnes latitude et longitude introuvables.');
        if (iStamp < 0 && iDate < 0) throw new Error('Colonne de date introuvable : il faut date, heure, latitude, longitude.');
        const movebank = head.includes('location lat') || head.includes('individual local identifier');
        const fn = String(filename || '').toLowerCase(), all = head.join(' ');
        const format = movebank ? 'Movebank (CSV)' : /tractive/.test(fn + all) ? 'Tractive (CSV)' : /weenect/.test(fn + all) ? 'Weenect (CSV)' : /invoxia/.test(fn + all) ? 'Invoxia (CSV)' : /kippy/.test(fn + all) ? 'Kippy (CSV)' : 'CSV';
        const num = v => { const s = String(v ?? '').trim().replace(/\s/g, ''); return s === '' ? NaN : Number(sep === ';' || /^-?\d+,\d+$/.test(s) ? s.replace(',', '.') : s); };
        const pts = [], ids = new Set();
        for (const r of rows.slice(1)) {
            const stamp = iStamp >= 0 ? readStamp(r[iStamp], movebank) : readStamp(`${r[iDate] ?? ''}${iTime >= 0 ? ' ' + (r[iTime] ?? '') : ''}`.trim(), movebank);
            const alt = iAlt >= 0 ? num(r[iAlt]) : NaN;
            pts.push([stamp, num(r[iLat]), num(r[iLon]), Number.isFinite(alt) ? alt : null]);
            if (iId >= 0 && r[iId]) ids.add(String(r[iId]).trim().slice(0, 80));
        }
        return finish(pts, format, {ids: [...ids].slice(0, 50)});
    }
    /** Le bon lecteur d'après le nom du fichier (ou le contenu) */
    function parseTrack(text, filename = '') {
        const f = String(filename).toLowerCase(), head = String(text || '').slice(0, 400).trim();
        if (/\.gpx$/.test(f) || /<gpx\b/i.test(head)) return parseGPX(text);
        if (/\.kml$/.test(f) || /<kml\b/i.test(head)) return parseKML(text);
        if (/\.(geo)?json$/.test(f) || /^\{/.test(head)) return parseGeoJSON(text);
        if (/\.(csv|tsv|txt)$/.test(f) || /[,;\t]/.test(head)) return parseCSV(text, filename);
        throw new Error('Format inconnu : GPX, KML, GeoJSON ou CSV.');
    }

    /* ═════ Exports ═════ */
    const xesc = s => String(s ?? '').replace(/[<>&"']/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'}[c]));
    const iso = t => new Date(t * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const csvCell = (v, sep = ';') => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s; };
    const toCSV = (rows, sep = ';') => '﻿' + rows.map(r => r.map(v => csvCell(v, sep)).join(sep)).join('\r\n') + '\r\n';
    /** tracks : [{name, tag, points: [[t, lat, lon, alt]]}] → Movebank (CSV, heures en UTC) */
    function toMovebank(tracks) {
        const rows = [['event-id', 'visible', 'timestamp', 'location-long', 'location-lat', 'height-above-msl', 'sensor-type', 'individual-taxon-canonical-name', 'tag-local-identifier', 'individual-local-identifier']];
        let n = 0;
        for (const tr of tracks) for (const p of tr.points) rows.push([++n, 'true', new Date(p[0] * 1000).toISOString().replace('T', ' ').replace('Z', ''), p[2], p[1], p[3] ?? '', 'gps', tr.taxon || '', tr.tag || '', tr.name || '']);
        return toCSV(rows, ',').replace(/^﻿/, '');
    }
    function toGPX(tracks) {
        return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="LCNDA — Suivi des animaux" xmlns="http://www.topografix.com/GPX/1/1">\n${tracks.map(tr => `<trk><name>${xesc(tr.name)}</name>${(tr.segments || [tr.points]).map(seg => `<trkseg>\n${seg.map(p => `<trkpt lat="${p[1]}" lon="${p[2]}">${p[3] != null ? `<ele>${p[3]}</ele>` : ''}<time>${iso(p[0])}</time></trkpt>`).join('\n')}\n</trkseg>`).join('')}</trk>`).join('\n')}${(tracks.waypoints || []).map(w => `<wpt lat="${w.lat}" lon="${w.lon}"><name>${xesc(w.name)}</name>${w.t ? `<time>${iso(w.t)}</time>` : ''}</wpt>`).join('\n')}\n</gpx>\n`;
    }
    function toKML(tracks) {
        return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>Suivi des animaux</name>\n${tracks.map(tr => `<Placemark><name>${xesc(tr.name)}</name><gx:Track>${tr.points.map(p => `<when>${iso(p[0])}</when>`).join('')}${tr.points.map(p => `<gx:coord>${p[2]} ${p[1]} ${p[3] ?? 0}</gx:coord>`).join('')}</gx:Track></Placemark>`).join('\n')}\n</Document></kml>\n`;
    }

    const api = {RING_COLORS, MARKS, PROFILES, BEHAVIORS, CAUSES, HEALTH_STATES, HEALTH_WHAT, GROUP_KINDS, ROLES, END_REASONS, colorKey, colorInfo, ringKey, abbr, guessProfile, profileOf,
        parseReading, formatReading, scoreCode, scoreNumber, scoreColors, comboText, ringsOf, ringCodeOf, numbersOf, candidates, reliability, norm,
        km, pathKm, hull, thin, splitTrips, farthest, readStamp, parseGPX, parseKML, parseGeoJSON, parseCSV, csvRows, parseTrack, toCSV, toMovebank, toGPX, toKML, csvCell, MAX_TEXT, MAX_POINTS};
    root.LCNDA_SUIVI = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
