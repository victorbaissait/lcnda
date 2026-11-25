/* LCNDA — 🕰 Heures du monde : quelle heure il est dans telle ville ou telle région, comparée à l'heure d'ici.
 *  - Listes → « 🕰 Heures du monde » : tes villes (ajoutées d'un menu de choix : plus de 200 villes, ou n'importe quel fuseau), l'heure
 *    qu'il y fait, le décalage avec ici (« +6 h »), jour ou nuit, la date si elle n'est pas la même ; « 🔁 Comparer » : quand il
 *    est 9 h ici, il est… (une réglette d'heures) ; la carte des fuseaux (bandes de 15°, nuit en grisé, villes en points).
 *  - Tableau de bord : le widget « 🕰 Horloges du monde », très personnalisable : aiguilles ou chiffres (ou les deux), forme du
 *    cadran (rond, carré, arrondi, hexagone), chiffres (arabes, romains, traits, rien), couleurs (fond, cadran, aiguilles,
 *    trotteuse, texte), secondes, 12 ou 24 h, date, décalage, disposition, taille.
 * Rien n'est envoyé sur Internet : l'heure vient de l'ordinateur et des fuseaux du navigateur (Intl). Réglages : localStorage.
 *   window.LCNDA_EXT.horloges = {CITIES, partsAt, offsetOf, clockSvg, sunUp, open}
 * Essai : tests/test-horloges.js */
(function (root) {
    'use strict';
    /* ── plus de 200 villes : [nom, fuseau IANA, pays, lat, lon] ── */
    const CITIES = [
        ['Paris', 'Europe/Paris', 'France', 48.86, 2.35], ['Lyon', 'Europe/Paris', 'France', 45.76, 4.84], ['Marseille', 'Europe/Paris', 'France', 43.3, 5.37], ['Bordeaux', 'Europe/Paris', 'France', 44.84, -.58],
        ['Toulouse', 'Europe/Paris', 'France', 43.6, 1.44], ['Strasbourg', 'Europe/Paris', 'France', 48.57, 7.75], ['Lille', 'Europe/Paris', 'France', 50.63, 3.06], ['Nantes', 'Europe/Paris', 'France', 47.22, -1.55],
        ['Ajaccio', 'Europe/Paris', 'France', 41.93, 8.74], ['Monaco', 'Europe/Monaco', 'Monaco', 43.73, 7.42], ['Bruxelles', 'Europe/Brussels', 'Belgique', 50.85, 4.35], ['Liège', 'Europe/Brussels', 'Belgique', 50.63, 5.57],
        ['Luxembourg', 'Europe/Luxembourg', 'Luxembourg', 49.61, 6.13], ['Genève', 'Europe/Zurich', 'Suisse', 46.2, 6.14], ['Zurich', 'Europe/Zurich', 'Suisse', 47.37, 8.54], ['Berne', 'Europe/Zurich', 'Suisse', 46.95, 7.45],
        ['Londres', 'Europe/London', 'Royaume-Uni', 51.51, -.13], ['Édimbourg', 'Europe/London', 'Royaume-Uni', 55.95, -3.19], ['Dublin', 'Europe/Dublin', 'Irlande', 53.35, -6.26], ['Madrid', 'Europe/Madrid', 'Espagne', 40.42, -3.7],
        ['Barcelone', 'Europe/Madrid', 'Espagne', 41.39, 2.17], ['Séville', 'Europe/Madrid', 'Espagne', 37.39, -5.98], ['Las Palmas', 'Atlantic/Canary', 'Espagne (Canaries)', 28.12, -15.43], ['Lisbonne', 'Europe/Lisbon', 'Portugal', 38.72, -9.14],
        ['Porto', 'Europe/Lisbon', 'Portugal', 41.15, -8.61], ['Funchal', 'Atlantic/Madeira', 'Portugal (Madère)', 32.65, -16.91], ['Ponta Delgada', 'Atlantic/Azores', 'Portugal (Açores)', 37.74, -25.67], ['Rome', 'Europe/Rome', 'Italie', 41.9, 12.5],
        ['Milan', 'Europe/Rome', 'Italie', 45.46, 9.19], ['Naples', 'Europe/Rome', 'Italie', 40.85, 14.27], ['Turin', 'Europe/Rome', 'Italie', 45.07, 7.69], ['Palerme', 'Europe/Rome', 'Italie', 38.12, 13.36],
        ['Berlin', 'Europe/Berlin', 'Allemagne', 52.52, 13.4], ['Hambourg', 'Europe/Berlin', 'Allemagne', 53.55, 9.99], ['Munich', 'Europe/Berlin', 'Allemagne', 48.14, 11.58], ['Cologne', 'Europe/Berlin', 'Allemagne', 50.94, 6.96],
        ['Francfort', 'Europe/Berlin', 'Allemagne', 50.11, 8.68], ['Sarrebruck', 'Europe/Berlin', 'Allemagne', 49.24, 6.99], ['Amsterdam', 'Europe/Amsterdam', 'Pays-Bas', 52.37, 4.9], ['Rotterdam', 'Europe/Amsterdam', 'Pays-Bas', 51.92, 4.48],
        ['Vienne', 'Europe/Vienna', 'Autriche', 48.21, 16.37], ['Prague', 'Europe/Prague', 'Tchéquie', 50.08, 14.44], ['Bratislava', 'Europe/Bratislava', 'Slovaquie', 48.15, 17.11], ['Budapest', 'Europe/Budapest', 'Hongrie', 47.5, 19.04],
        ['Varsovie', 'Europe/Warsaw', 'Pologne', 52.23, 21.01], ['Cracovie', 'Europe/Warsaw', 'Pologne', 50.06, 19.94], ['Copenhague', 'Europe/Copenhagen', 'Danemark', 55.68, 12.57], ['Stockholm', 'Europe/Stockholm', 'Suède', 59.33, 18.07],
        ['Oslo', 'Europe/Oslo', 'Norvège', 59.91, 10.75], ['Helsinki', 'Europe/Helsinki', 'Finlande', 60.17, 24.94], ['Reykjavik', 'Atlantic/Reykjavik', 'Islande', 64.15, -21.94], ['Tallinn', 'Europe/Tallinn', 'Estonie', 59.44, 24.75],
        ['Riga', 'Europe/Riga', 'Lettonie', 56.95, 24.11], ['Vilnius', 'Europe/Vilnius', 'Lituanie', 54.69, 25.28], ['Ljubljana', 'Europe/Ljubljana', 'Slovénie', 46.06, 14.51], ['Zagreb', 'Europe/Zagreb', 'Croatie', 45.81, 15.98],
        ['Belgrade', 'Europe/Belgrade', 'Serbie', 44.79, 20.45], ['Sarajevo', 'Europe/Sarajevo', 'Bosnie-Herzégovine', 43.86, 18.41], ['Tirana', 'Europe/Tirane', 'Albanie', 41.33, 19.82], ['La Valette', 'Europe/Malta', 'Malte', 35.9, 14.51],
        ['Athènes', 'Europe/Athens', 'Grèce', 37.98, 23.73], ['Sofia', 'Europe/Sofia', 'Bulgarie', 42.7, 23.32], ['Bucarest', 'Europe/Bucharest', 'Roumanie', 44.43, 26.1], ['Chișinău', 'Europe/Chisinau', 'Moldavie', 47.01, 28.86],
        ['Kyiv', 'Europe/Kyiv', 'Ukraine', 50.45, 30.52], ['Lviv', 'Europe/Kyiv', 'Ukraine', 49.84, 24.03], ['Odessa', 'Europe/Kyiv', 'Ukraine', 46.48, 30.73], ['Minsk', 'Europe/Minsk', 'Biélorussie', 53.9, 27.56],
        ['Moscou', 'Europe/Moscow', 'Russie', 55.76, 37.62], ['Saint-Pétersbourg', 'Europe/Moscow', 'Russie', 59.94, 30.31], ['Iekaterinbourg', 'Asia/Yekaterinburg', 'Russie', 56.84, 60.6], ['Novossibirsk', 'Asia/Novosibirsk', 'Russie', 55.01, 82.93],
        ['Vladivostok', 'Asia/Vladivostok', 'Russie', 43.12, 131.89], ['Istanbul', 'Europe/Istanbul', 'Turquie', 41.01, 28.98], ['Ankara', 'Europe/Istanbul', 'Turquie', 39.93, 32.86], ['Nicosie', 'Asia/Nicosia', 'Chypre', 35.17, 33.36],
        ['Beyrouth', 'Asia/Beirut', 'Liban', 33.89, 35.5], ['Jérusalem', 'Asia/Jerusalem', 'Israël', 31.77, 35.21], ['Amman', 'Asia/Amman', 'Jordanie', 31.95, 35.93], ['Damas', 'Asia/Damascus', 'Syrie', 33.51, 36.29],
        ['Le Caire', 'Africa/Cairo', 'Égypte', 30.04, 31.24], ['Bagdad', 'Asia/Baghdad', 'Irak', 33.31, 44.36], ['Téhéran', 'Asia/Tehran', 'Iran', 35.69, 51.39], ['Riyad', 'Asia/Riyadh', 'Arabie saoudite', 24.71, 46.68],
        ['Dubaï', 'Asia/Dubai', 'Émirats arabes unis', 25.2, 55.27], ['Doha', 'Asia/Qatar', 'Qatar', 25.29, 51.53], ['Erevan', 'Asia/Yerevan', 'Arménie', 40.18, 44.51], ['Tbilissi', 'Asia/Tbilisi', 'Géorgie', 41.72, 44.79],
        ['Bakou', 'Asia/Baku', 'Azerbaïdjan', 40.41, 49.87], ['Kaboul', 'Asia/Kabul', 'Afghanistan', 34.56, 69.21], ['Karachi', 'Asia/Karachi', 'Pakistan', 24.86, 67.01], ['Delhi', 'Asia/Kolkata', 'Inde', 28.61, 77.21],
        ['Mumbai', 'Asia/Kolkata', 'Inde', 19.08, 72.88], ['Pondichéry', 'Asia/Kolkata', 'Inde', 11.94, 79.81], ['Katmandou', 'Asia/Kathmandu', 'Népal', 27.72, 85.32], ['Dacca', 'Asia/Dhaka', 'Bangladesh', 23.81, 90.41],
        ['Colombo', 'Asia/Colombo', 'Sri Lanka', 6.93, 79.86], ['Rangoun', 'Asia/Yangon', 'Birmanie', 16.87, 96.2], ['Bangkok', 'Asia/Bangkok', 'Thaïlande', 13.76, 100.5], ['Hanoï', 'Asia/Ho_Chi_Minh', 'Viêt Nam', 21.03, 105.85],
        ['Hô Chi Minh-Ville', 'Asia/Ho_Chi_Minh', 'Viêt Nam', 10.82, 106.63], ['Phnom Penh', 'Asia/Phnom_Penh', 'Cambodge', 11.56, 104.92], ['Vientiane', 'Asia/Vientiane', 'Laos', 17.98, 102.63], ['Kuala Lumpur', 'Asia/Kuala_Lumpur', 'Malaisie', 3.14, 101.69],
        ['Singapour', 'Asia/Singapore', 'Singapour', 1.35, 103.82], ['Jakarta', 'Asia/Jakarta', 'Indonésie', -6.21, 106.85], ['Bali (Denpasar)', 'Asia/Makassar', 'Indonésie', -8.65, 115.22], ['Manille', 'Asia/Manila', 'Philippines', 14.6, 120.98],
        ['Hong Kong', 'Asia/Hong_Kong', 'Chine', 22.32, 114.17], ['Shanghai', 'Asia/Shanghai', 'Chine', 31.23, 121.47], ['Pékin', 'Asia/Shanghai', 'Chine', 39.9, 116.4], ['Taipei', 'Asia/Taipei', 'Taïwan', 25.03, 121.57],
        ['Séoul', 'Asia/Seoul', 'Corée du Sud', 37.57, 126.98], ['Tokyo', 'Asia/Tokyo', 'Japon', 35.68, 139.69], ['Osaka', 'Asia/Tokyo', 'Japon', 34.69, 135.5], ['Oulan-Bator', 'Asia/Ulaanbaatar', 'Mongolie', 47.89, 106.91],
        ['Almaty', 'Asia/Almaty', 'Kazakhstan', 43.24, 76.89], ['Tachkent', 'Asia/Tashkent', 'Ouzbékistan', 41.3, 69.24], ['Perth', 'Australia/Perth', 'Australie', -31.95, 115.86], ['Darwin', 'Australia/Darwin', 'Australie', -12.46, 130.84],
        ['Adélaïde', 'Australia/Adelaide', 'Australie', -34.93, 138.6], ['Brisbane', 'Australia/Brisbane', 'Australie', -27.47, 153.03], ['Sydney', 'Australia/Sydney', 'Australie', -33.87, 151.21], ['Melbourne', 'Australia/Melbourne', 'Australie', -37.81, 144.96],
        ['Hobart', 'Australia/Hobart', 'Australie', -42.88, 147.33], ['Auckland', 'Pacific/Auckland', 'Nouvelle-Zélande', -36.85, 174.76], ['Wellington', 'Pacific/Auckland', 'Nouvelle-Zélande', -41.29, 174.78], ['Nouméa', 'Pacific/Noumea', 'Nouvelle-Calédonie', -22.28, 166.46],
        ['Papeete', 'Pacific/Tahiti', 'Polynésie française', -17.54, -149.57], ['Mata-Utu', 'Pacific/Wallis', 'Wallis-et-Futuna', -13.28, -176.17], ['Suva', 'Pacific/Fiji', 'Fidji', -18.14, 178.44], ['Honolulu', 'Pacific/Honolulu', 'États-Unis (Hawaï)', 21.31, -157.86],
        ['Anchorage', 'America/Anchorage', 'États-Unis (Alaska)', 61.22, -149.9], ['Los Angeles', 'America/Los_Angeles', 'États-Unis', 34.05, -118.24], ['San Francisco', 'America/Los_Angeles', 'États-Unis', 37.77, -122.42], ['Seattle', 'America/Los_Angeles', 'États-Unis', 47.61, -122.33],
        ['Las Vegas', 'America/Los_Angeles', 'États-Unis', 36.17, -115.14], ['Phoenix', 'America/Phoenix', 'États-Unis', 33.45, -112.07], ['Denver', 'America/Denver', 'États-Unis', 39.74, -104.99], ['Salt Lake City', 'America/Denver', 'États-Unis', 40.76, -111.89],
        ['Chicago', 'America/Chicago', 'États-Unis', 41.88, -87.63], ['La Nouvelle-Orléans', 'America/Chicago', 'États-Unis', 29.95, -90.07], ['Houston', 'America/Chicago', 'États-Unis', 29.76, -95.37], ['Saint-Louis (Missouri)', 'America/Chicago', 'États-Unis', 38.63, -90.2],
        ['New York', 'America/New_York', 'États-Unis', 40.71, -74.01], ['Boston', 'America/New_York', 'États-Unis', 42.36, -71.06], ['Washington', 'America/New_York', 'États-Unis', 38.91, -77.04], ['Miami', 'America/New_York', 'États-Unis', 25.76, -80.19],
        ['Détroit', 'America/Detroit', 'États-Unis', 42.33, -83.05], ['Vancouver', 'America/Vancouver', 'Canada', 49.28, -123.12], ['Calgary', 'America/Edmonton', 'Canada', 51.05, -114.07], ['Winnipeg', 'America/Winnipeg', 'Canada', 49.9, -97.14],
        ['Toronto', 'America/Toronto', 'Canada', 43.65, -79.38], ['Montréal', 'America/Toronto', 'Canada', 45.5, -73.57], ['Québec', 'America/Toronto', 'Canada', 46.81, -71.21], ['Moncton', 'America/Moncton', 'Canada (Acadie)', 46.09, -64.78],
        ['Halifax', 'America/Halifax', 'Canada', 44.65, -63.58], ['Saint-Jean de Terre-Neuve', 'America/St_Johns', 'Canada', 47.56, -52.71], ['Saint-Pierre', 'America/Miquelon', 'Saint-Pierre-et-Miquelon', 46.78, -56.18], ['Mexico', 'America/Mexico_City', 'Mexique', 19.43, -99.13],
        ['La Havane', 'America/Havana', 'Cuba', 23.11, -82.37], ['Port-au-Prince', 'America/Port-au-Prince', 'Haïti', 18.59, -72.31], ['Pointe-à-Pitre', 'America/Guadeloupe', 'Guadeloupe', 16.24, -61.53], ['Fort-de-France', 'America/Martinique', 'Martinique', 14.6, -61.07],
        ['Cayenne', 'America/Cayenne', 'Guyane', 4.92, -52.31], ['Bogota', 'America/Bogota', 'Colombie', 4.71, -74.07], ['Caracas', 'America/Caracas', 'Venezuela', 10.48, -66.9], ['Lima', 'America/Lima', 'Pérou', -12.05, -77.04],
        ['Quito', 'America/Guayaquil', 'Équateur', -.18, -78.47], ['La Paz', 'America/La_Paz', 'Bolivie', -16.49, -68.12], ['Santiago', 'America/Santiago', 'Chili', -33.45, -70.67], ['Buenos Aires', 'America/Argentina/Buenos_Aires', 'Argentine', -34.6, -58.38],
        ['Montevideo', 'America/Montevideo', 'Uruguay', -34.9, -56.16], ['Asunción', 'America/Asuncion', 'Paraguay', -25.26, -57.58], ['São Paulo', 'America/Sao_Paulo', 'Brésil', -23.55, -46.63], ['Rio de Janeiro', 'America/Sao_Paulo', 'Brésil', -22.91, -43.17],
        ['Manaus', 'America/Manaus', 'Brésil', -3.12, -60.02], ['Alger', 'Africa/Algiers', 'Algérie', 36.75, 3.06], ['Oran', 'Africa/Algiers', 'Algérie', 35.7, -.63], ['Constantine', 'Africa/Algiers', 'Algérie', 36.37, 6.61],
        ['Tunis', 'Africa/Tunis', 'Tunisie', 36.81, 10.18], ['Casablanca', 'Africa/Casablanca', 'Maroc', 33.57, -7.59], ['Rabat', 'Africa/Casablanca', 'Maroc', 34.02, -6.84], ['Tripoli', 'Africa/Tripoli', 'Libye', 32.89, 13.19],
        ['Dakar', 'Africa/Dakar', 'Sénégal', 14.72, -17.47], ['Saint-Louis du Sénégal', 'Africa/Dakar', 'Sénégal', 16.03, -16.49], ['Bamako', 'Africa/Bamako', 'Mali', 12.64, -8], ['Abidjan', 'Africa/Abidjan', 'Côte d’Ivoire', 5.36, -4.01], ['Accra', 'Africa/Accra', 'Ghana', 5.6, -.19],
        ['Ouagadougou', 'Africa/Ouagadougou', 'Burkina Faso', 12.37, -1.52], ['Niamey', 'Africa/Niamey', 'Niger', 13.51, 2.11], ['Lomé', 'Africa/Lome', 'Togo', 6.13, 1.22], ['Cotonou', 'Africa/Porto-Novo', 'Bénin', 6.37, 2.39],
        ['Lagos', 'Africa/Lagos', 'Nigeria', 6.52, 3.38], ['Douala', 'Africa/Douala', 'Cameroun', 4.05, 9.77], ['Libreville', 'Africa/Libreville', 'Gabon', .42, 9.47], ['Brazzaville', 'Africa/Brazzaville', 'Congo', -4.26, 15.24],
        ['Kinshasa', 'Africa/Kinshasa', 'RD Congo', -4.44, 15.27], ['Addis-Abeba', 'Africa/Addis_Ababa', 'Éthiopie', 9.03, 38.74], ['Nairobi', 'Africa/Nairobi', 'Kenya', -1.29, 36.82], ['Djibouti', 'Africa/Djibouti', 'Djibouti', 11.59, 43.15],
        ['Dar es Salaam', 'Africa/Dar_es_Salaam', 'Tanzanie', -6.79, 39.21], ['Johannesburg', 'Africa/Johannesburg', 'Afrique du Sud', -26.2, 28.05], ['Le Cap', 'Africa/Johannesburg', 'Afrique du Sud', -33.92, 18.42], ['Antananarivo', 'Indian/Antananarivo', 'Madagascar', -18.88, 47.51],
        ['Saint-Denis (La Réunion)', 'Indian/Reunion', 'La Réunion', -20.88, 55.45], ['Mamoudzou', 'Indian/Mayotte', 'Mayotte', -12.78, 45.23], ['Port-Louis', 'Indian/Mauritius', 'Maurice', -20.16, 57.5], ['Victoria (Seychelles)', 'Indian/Mahe', 'Seychelles', -4.62, 55.45],
    ];
    const SET = n => { try { return new Intl.DateTimeFormat('en-US', {timeZone: n}) && true; } catch (_) { return false; } };
    /** l'heure d'un fuseau à l'instant t : {y, mo, d, h, mi, s, wd} */
    const fmtCache = new Map();
    function partsAt(tz, t = Date.now()) {
        let f = fmtCache.get(tz);
        if (!f) { f = new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short'}); fmtCache.set(tz, f); }
        const o = {}; f.formatToParts(new Date(t)).forEach(p => { o[p.type] = p.value; });
        return {y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday)};
    }
    /** décalage avec UTC, en minutes (heure d'été comprise) */
    function offsetOf(tz, t = Date.now()) { const p = partsAt(tz, t), u = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s); return Math.round((u - Math.floor(t / 1000) * 1000) / 60000); }
    /** le soleil est-il levé (calcul simple : déclinaison et angle horaire) ? */
    function sunUp(lat, lon, t = Date.now()) {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const d = new Date(t), day = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
        const dec = -23.44 * Math.cos(2 * Math.PI / 365 * (day + 10)) * Math.PI / 180, hUtc = d.getUTCHours() + d.getUTCMinutes() / 60;
        const ha = ((hUtc - 12) * 15 + lon) * Math.PI / 180, la = lat * Math.PI / 180;
        return Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha) > -0.0145; // le bord du soleil
    }
    const pad = n => String(n).padStart(2, '0');
    const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    /** le cadran à aiguilles, en SVG (100 × 100) ; o = les réglages du style */
    function clockSvg(p, o = {}) {
        const c = {face: '#ffffff', ring: '#111111', hands: '#111111', second: '#c0392b', text: '#111111', shape: 'round', numbers: 'arabic', seconds: true, ...o};
        const shapeEl = {round: '<circle cx="50" cy="50" r="47"', square: '<rect x="3" y="3" width="94" height="94"', rounded: '<rect x="3" y="3" width="94" height="94" rx="18"',
            hexagon: '<polygon points="50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5"'}[c.shape] || '<circle cx="50" cy="50" r="47"';
        let marks = '';
        for (let i = 0; i < 60; i++) { if (c.numbers === 'none' && i % 5) continue; const a = i * 6 * Math.PI / 180, big = i % 5 === 0, r1 = big ? 38 : 41.5, r2 = 44;
            if (c.numbers === 'ticks' || !big || c.numbers === 'none') marks += `<line x1="${(50 + r1 * Math.sin(a)).toFixed(2)}" y1="${(50 - r1 * Math.cos(a)).toFixed(2)}" x2="${(50 + r2 * Math.sin(a)).toFixed(2)}" y2="${(50 - r2 * Math.cos(a)).toFixed(2)}" stroke="${c.ring}" stroke-width="${big ? 2 : .7}" stroke-linecap="round"/>`; }
        if (c.numbers === 'arabic' || c.numbers === 'roman') for (let i = 0; i < 12; i++) { const a = i * 30 * Math.PI / 180, r = 36;
            marks += `<text x="${(50 + r * Math.sin(a)).toFixed(2)}" y="${(50 - r * Math.cos(a)).toFixed(2)}" text-anchor="middle" dominant-baseline="central" font-size="${c.numbers === 'roman' ? 7.5 : 9}" font-family="Georgia,serif" fill="${c.text}">${c.numbers === 'roman' ? ROMAN[i] : (i || 12)}</text>`; }
        const ah = ((p.h % 12) + p.mi / 60) * 30, am = (p.mi + p.s / 60) * 6, as = p.s * 6;
        const hand = (deg, len, w, col, tail = 6) => `<line x1="50" y1="${50 + tail}" x2="50" y2="${50 - len}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" transform="rotate(${deg.toFixed(2)} 50 50)"/>`;
        return `<svg viewBox="0 0 100 100" class="hz-svg" role="img" aria-label="${pad(p.h)}:${pad(p.mi)}">${shapeEl} fill="${c.face}" stroke="${c.ring}" stroke-width="2.5"/>${marks}
            ${hand(ah, 22, 4, c.hands)}${hand(am, 33, 2.6, c.hands)}${c.seconds ? hand(as, 37, 1, c.second, 9) : ''}<circle cx="50" cy="50" r="2.6" fill="${c.seconds ? c.second : c.hands}"/></svg>`;
    }

    /* ── 🏷 les étiquettes des villes sur la carte : jamais l'une sur l'autre ──
     * groupCities : des villes voisines (moins de `dist`) qui ont la même heure → une seule étiquette (« Montréal · New York 17:26 », dans l'ordre de la liste) ;
     * placeLabels : chaque étiquette essaie 8 places autour de son point (droite, gauche, dessus, dessous, diagonales) ; si toutes
     * touchent une autre étiquette ou un autre point, elle part en colonne à côté, reliée à son point par un trait fin. Tout reste dans la carte. */
    function groupCities(pts, dist) {
        const up = pts.map((_, i) => i), f = i => (up[i] === i ? i : (up[i] = f(up[i])));
        pts.forEach((a, i) => pts.forEach((b, j) => { if (j > i && a.time === b.time && Math.hypot(a.x - b.x, a.y - b.y) < dist) up[f(j)] = f(i); }));
        const m = new Map(); pts.forEach((p, i) => { const k = f(i); if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
        // dans l'ordre de la liste de l'utilisateur, 4 noms au plus par étiquette
        return [...m.values()].flatMap(ix => Array.from({length: Math.ceil(ix.length / 4)}, (_, k) => ix.slice(k * 4, k * 4 + 4)));
    }
    function placeLabels(items, o = {}) {
        const W = o.W ?? 960, H = o.H ?? 470, r = o.r ?? 4, g = o.gap ?? 3, pad = o.pad ?? 2;
        const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const dotBox = d => ({x: d.x - r - 1, y: d.y - r - 1, w: 2 * r + 2, h: 2 * r + 2});
        const dots = items.flatMap(it => it.dots).map(dotBox), placed = [], leaders = [];
        const clamp = b => ({...b, x: Math.min(Math.max(b.x, pad), W - pad - b.w), y: Math.min(Math.max(b.y, pad), H - pad - b.h)});
        // un trait (a → b) qui traverse une boîte ? (quelques points le long du trait)
        const crosses = (a, b, box) => { for (let k = 1; k < 12; k++) { const x = a.x + (b.x - a.x) * k / 12, y = a.y + (b.y - a.y) * k / 12; if (x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h) return true; } return false; };
        const cost = (b, own) => dots.reduce((s, d, i) => s + (own.includes(i) ? 0 : inter(b, d)), 0) + placed.reduce((s, p) => s + inter(b, p) * 4, 0) + leaders.reduce((s, l) => s + (crosses(l.a, l.b, b) ? 50 : 0), 0);
        const near = (b, d) => ({x: Math.min(Math.max(d.x, b.x), b.x + b.w), y: Math.min(Math.max(d.y, b.y), b.y + b.h)});
        let first = 0; const ownOf = items.map(it => it.dots.map(() => first++));
        // les plus serrées d'abord (le plus de voisins proches)
        const crowd = it => items.reduce((s, o2) => s + (o2 !== it && Math.hypot(o2.dots[0].x - it.dots[0].x, o2.dots[0].y - it.dots[0].y) < (it.w + o2.w) ? 1 : 0), 0);
        const order = items.map((it, i) => [i, crowd(it)]).sort((a, b) => b[1] - a[1] || items[a[0]].dots[0].y - items[b[0]].dots[0].y).map(x => x[0]);
        const out = new Array(items.length);
        order.forEach(i => {
            const it = items[i], {w, h} = it, own = ownOf[i];
            const x1 = Math.min(...it.dots.map(d => d.x)) - r, x2 = Math.max(...it.dots.map(d => d.x)) + r, y1 = Math.min(...it.dots.map(d => d.y)) - r, y2 = Math.max(...it.dots.map(d => d.y)) + r, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
            const cands = [[x2 + g, cy - h / 2], [x1 - g - w, cy - h / 2], [cx - w / 2, y1 - g - h], [cx - w / 2, y2 + g], [x2 + g * .5, y1 - h], [x1 - w - g * .5, y1 - h], [x2 + g * .5, y2], [x1 - w - g * .5, y2]]
                .map(([x, y]) => { const b = clamp({x, y, w, h}); return Math.hypot(b.x - x, b.y - y) <= Math.max(h, w / 2) ? b : null; }).filter(Boolean);
            let best = cands.find(b => cost(b, own) === 0);
            let stacked = false;
            if (!best) {
                // 🗂 en colonne à côté : la place libre la plus proche, avec un trait fin jusqu'au point
                stacked = true; const step = h * 1.15, list = [];
                for (let k = 1; k <= 14; k++) for (const s of [1, -1]) for (let j = -8; j <= 8; j++) {
                    const b = clamp({x: s > 0 ? x2 + g + k * h * .9 : x1 - g - w - k * h * .9, y: cy - h / 2 + j * step, w, h});
                    list.push([Math.hypot(b.x + w / 2 - cx, b.y + h / 2 - cy), b]);
                }
                list.sort((a, b) => a[0] - b[0]);
                const ok = b => { if (cost(b, own) > 0) return false; const tip = near(b, {x: cx, y: cy}); return !placed.some(p => crosses({x: cx, y: cy}, tip, p)) && !dots.some((d, di) => !own.includes(di) && crosses({x: cx, y: cy}, tip, d)); };
                best = (list.find(([, b]) => ok(b)) || list.reduce((m, c) => (cost(c[1], own) < cost(m[1], own) ? c : m)))[1];
            }
            placed.push(best);
            const res = {...best, stacked};
            if (stacked) { const tip = near(best, {x: cx, y: cy}), from = it.dots.reduce((m, d) => (Math.hypot(d.x - tip.x, d.y - tip.y) < Math.hypot(m.x - tip.x, m.y - tip.y) ? d : m)); res.leader = {x1: from.x, y1: from.y, x2: tip.x, y2: tip.y}; leaders.push({a: from, b: tip}); }
            out[i] = res;
        });
        return out;
    }
    const api = {groupCities, placeLabels, CITIES, partsAt, offsetOf, sunUp, clockSvg, SET, tzOf: (...a) => tzOf(...a), COUNTRY_TZ: null};
    if (typeof module === 'object' && module.exports) { module.exports = api; return; }

    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {}, A = () => root.LCNDA_APP;
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const ls = {get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
    const KEY = 'genealogie-horloges', STYLE_KEY = 'genealogie-horloges-style';
    const HERE = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; } catch (_) { return 'Europe/Paris'; } })();
    const DEF_CITIES = [['Paris', 'Europe/Paris'], ['Montréal', 'America/Toronto'], ['New York', 'America/New_York'], ['Tokyo', 'Asia/Tokyo']];
    /** mes villes : [{id, name, tz, lat, lon}] */
    const mine = () => { const v = ls.get(KEY, null); const list = Array.isArray(v) ? v : DEF_CITIES.map(([n, tz], i) => { const c = CITIES.find(x => x[0] === n); return {id: 'c' + i, name: n, tz, lat: c?.[3], lon: c?.[4]}; }); return list.filter(c => c && c.tz && SET(c.tz)); };
    const saveMine = v => ls.set(KEY, v.slice(0, 60));
    const STYLE_DEF = {kind: 'both', shape: 'round', numbers: 'arabic', seconds: true, h24: true, date: true, offset: true, daynight: true, size: 120, layout: 'row',
        bg: '#ffffff', face: '#ffffff', ring: '#111111', hands: '#111111', second: '#c0392b', text: '#111111', font: 'system'};
    const styleOf = (w = null) => ({...STYLE_DEF, ...ls.get(STYLE_KEY, {}), ...(w?.config?.style || {})});
    const offTxt = min => { if (!min) return T('même heure'); const s = min > 0 ? '+' : '−', a = Math.abs(min), h = Math.floor(a / 60), m = a % 60; return `${s}${h} h${m ? ' ' + pad(m) : ''}`; };
    const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const timeTxt = (p, st) => (st.h24 ? `${pad(p.h)}:${pad(p.mi)}` : `${(p.h % 12) || 12}:${pad(p.mi)} ${p.h < 12 ? 'AM' : 'PM'}`) + (st.seconds && st.kind === 'digital' ? `:${pad(p.s)}` : '');
    const FONTS = {system: 'system-ui,sans-serif', serif: 'Georgia,serif', mono: 'ui-monospace,Menlo,monospace', rounded: '"Arial Rounded MT Bold","Nunito",system-ui,sans-serif'};
    /** une horloge (ville) : cadran et/ou chiffres, avec la date, le décalage, jour ou nuit */
    function clockHtml(c, st, t = Date.now()) {
        const p = partsAt(c.tz, t), here = partsAt(HERE, t), off = offsetOf(c.tz, t) - offsetOf(HERE, t), up = sunUp(c.lat, c.lon, t);
        const sameDay = p.d === here.d && p.mo === here.mo, day = `${T(DAYS[p.wd])} ${p.d} ${T(MONTHS[p.mo - 1])}`;
        return `<div class="hz-clock" data-hz-tz="${esc(c.tz)}" data-hz-lat="${c.lat ?? ''}" data-hz-lon="${c.lon ?? ''}" style="--hz-size:${Number(st.size) || 120}px;--hz-text:${esc(st.text)};font-family:${FONTS[st.font] || FONTS.system}">
            ${st.kind !== 'digital' ? `<div class="hz-dial">${clockSvg(p, st)}</div>` : ''}
            ${st.kind !== 'analog' ? `<div class="hz-digi" data-hz-digi>${esc(timeTxt(p, st))}</div>` : ''}
            <div class="hz-name">${st.daynight && up !== null ? `<span title="${esc(up ? T('Il fait jour') : T('Il fait nuit'))}">${up ? '☀️' : '🌙'}</span> ` : ''}${esc(c.name)}</div>
            <div class="hz-sub">${st.offset ? `<span>${esc(offTxt(off))}</span>` : ''}${st.date && (!sameDay || st.kind === 'digital') ? `<span>${esc(day)}${sameDay ? '' : ` · ${p.d > here.d || p.mo > here.mo || p.y > here.y ? T('demain') : T('hier')}`}</span>` : ''}</div></div>`;
    }
    /* une seule horloge interne pour toutes les horloges à l'écran : chaque seconde */
    let tick = 0;
    function startTick() {
        if (tick) return;
        tick = setInterval(() => {
            const els = document.querySelectorAll('.hz-clock[data-hz-tz]'); if (!els.length) { clearInterval(tick); tick = 0; return; }
            const t = Date.now();
            els.forEach(el => { const box = el.closest('[data-hz-style]'); const st = box ? JSON.parse(box.dataset.hzStyle) : styleOf(); const p = partsAt(el.dataset.hzTz, t);
                const svg = el.querySelector('.hz-dial'); if (svg) svg.innerHTML = clockSvg(p, st);
                const dg = el.querySelector('[data-hz-digi]'); if (dg) dg.textContent = timeTxt(p, st); });
        }, 1000);
    }
    /** un ensemble d'horloges (widget, liste) ; data-hz-style garde le style pour la mise à jour */
    function clocksHtml(cities, st) { setTimeout(startTick, 0); return `<div class="hz-set hz-${esc(st.layout)}" data-hz-style="${esc(JSON.stringify(st))}" style="--hz-bg:${esc(st.bg)}">${cities.map(c => clockHtml(c, st)).join('')}</div>`; }


    /* ── 🗺 l'heure légale de chaque pays (et des régions des grands pays à plusieurs fuseaux) ── */
    const COUNTRY_TZ = {AD: 'Europe/Andorra', AE: 'Asia/Dubai', AF: 'Asia/Kabul', AG: 'America/Antigua', AI: 'America/Anguilla', AL: 'Europe/Tirane', AM: 'Asia/Yerevan', AO: 'Africa/Luanda', AQ: '', AR: 'America/Argentina/Buenos_Aires',
        AS: 'Pacific/Pago_Pago', AT: 'Europe/Vienna', AW: 'America/Aruba', AX: 'Europe/Mariehamn', AZ: 'Asia/Baku', BA: 'Europe/Sarajevo', BB: 'America/Barbados', BD: 'Asia/Dhaka', BE: 'Europe/Brussels', BF: 'Africa/Ouagadougou',
        BG: 'Europe/Sofia', BH: 'Asia/Bahrain', BI: 'Africa/Bujumbura', BJ: 'Africa/Porto-Novo', BL: 'America/St_Barthelemy', BM: 'Atlantic/Bermuda', BN: 'Asia/Brunei', BO: 'America/La_Paz', BS: 'America/Nassau', BT: 'Asia/Thimphu',
        BW: 'Africa/Gaborone', BY: 'Europe/Minsk', BZ: 'America/Belize', CF: 'Africa/Bangui', CG: 'Africa/Brazzaville', CH: 'Europe/Zurich', CI: 'Africa/Abidjan', CK: 'Pacific/Rarotonga', CM: 'Africa/Douala', CN: 'Asia/Shanghai',
        CO: 'America/Bogota', CR: 'America/Costa_Rica', CU: 'America/Havana', CV: 'Atlantic/Cape_Verde', CW: 'America/Curacao', CY: 'Asia/Nicosia', CZ: 'Europe/Prague', DE: 'Europe/Berlin', DJ: 'Africa/Djibouti', DK: 'Europe/Copenhagen',
        DM: 'America/Dominica', DO: 'America/Santo_Domingo', DZ: 'Africa/Algiers', EE: 'Europe/Tallinn', EG: 'Africa/Cairo', EH: 'Africa/El_Aaiun', ER: 'Africa/Asmara', ET: 'Africa/Addis_Ababa', FI: 'Europe/Helsinki', FJ: 'Pacific/Fiji',
        FK: 'Atlantic/Stanley', FO: 'Atlantic/Faroe', GA: 'Africa/Libreville', GB: 'Europe/London', GD: 'America/Grenada', GE: 'Asia/Tbilisi', GG: 'Europe/Guernsey', GH: 'Africa/Accra', GL: 'America/Nuuk', GM: 'Africa/Banjul',
        GN: 'Africa/Conakry', GQ: 'Africa/Malabo', GR: 'Europe/Athens', GS: 'Atlantic/South_Georgia', GT: 'America/Guatemala', GU: 'Pacific/Guam', GW: 'Africa/Bissau', GY: 'America/Guyana', HK: 'Asia/Hong_Kong', HM: '',
        HN: 'America/Tegucigalpa', HR: 'Europe/Zagreb', HT: 'America/Port-au-Prince', HU: 'Europe/Budapest', IE: 'Europe/Dublin', IL: 'Asia/Jerusalem', IM: 'Europe/Isle_of_Man', IN: 'Asia/Kolkata', IO: 'Indian/Chagos', IQ: 'Asia/Baghdad',
        IR: 'Asia/Tehran', IS: 'Atlantic/Reykjavik', IT: 'Europe/Rome', JE: 'Europe/Jersey', JM: 'America/Jamaica', JO: 'Asia/Amman', JP: 'Asia/Tokyo', KE: 'Africa/Nairobi', KG: 'Asia/Bishkek', KH: 'Asia/Phnom_Penh',
        KM: 'Indian/Comoro', KN: 'America/St_Kitts', KP: 'Asia/Pyongyang', KR: 'Asia/Seoul', KW: 'Asia/Kuwait', KY: 'America/Cayman', KZ: 'Asia/Almaty', LA: 'Asia/Vientiane', LB: 'Asia/Beirut', LC: 'America/St_Lucia',
        LI: 'Europe/Vaduz', LK: 'Asia/Colombo', LR: 'Africa/Monrovia', LS: 'Africa/Maseru', LT: 'Europe/Vilnius', LU: 'Europe/Luxembourg', LV: 'Europe/Riga', LY: 'Africa/Tripoli', MA: 'Africa/Casablanca', MC: 'Europe/Monaco',
        MD: 'Europe/Chisinau', ME: 'Europe/Podgorica', MF: 'America/Marigot', MG: 'Indian/Antananarivo', MH: 'Pacific/Majuro', MK: 'Europe/Skopje', ML: 'Africa/Bamako', MM: 'Asia/Yangon', MO: 'Asia/Macau', MP: 'Pacific/Saipan',
        MR: 'Africa/Nouakchott', MS: 'America/Montserrat', MT: 'Europe/Malta', MU: 'Indian/Mauritius', MV: 'Indian/Maldives', MW: 'Africa/Blantyre', MY: 'Asia/Kuala_Lumpur', MZ: 'Africa/Maputo', NA: 'Africa/Windhoek', NC: 'Pacific/Noumea',
        NE: 'Africa/Niamey', NF: 'Pacific/Norfolk', NG: 'Africa/Lagos', NI: 'America/Managua', NL: 'Europe/Amsterdam', NO: 'Europe/Oslo', NP: 'Asia/Kathmandu', NR: 'Pacific/Nauru', NU: 'Pacific/Niue', NZ: 'Pacific/Auckland',
        OM: 'Asia/Muscat', PA: 'America/Panama', PE: 'America/Lima', PG: 'Pacific/Port_Moresby', PH: 'Asia/Manila', PK: 'Asia/Karachi', PL: 'Europe/Warsaw', PM: 'America/Miquelon', PN: 'Pacific/Pitcairn', PR: 'America/Puerto_Rico',
        PS: 'Asia/Gaza', PW: 'Pacific/Palau', PY: 'America/Asuncion', QA: 'Asia/Qatar', RO: 'Europe/Bucharest', RS: 'Europe/Belgrade', RW: 'Africa/Kigali', SA: 'Asia/Riyadh', SB: 'Pacific/Guadalcanal', SC: 'Indian/Mahe',
        SD: 'Africa/Khartoum', SE: 'Europe/Stockholm', SG: 'Asia/Singapore', SH: 'Atlantic/St_Helena', SI: 'Europe/Ljubljana', SK: 'Europe/Bratislava', SL: 'Africa/Freetown', SM: 'Europe/San_Marino', SN: 'Africa/Dakar', SO: 'Africa/Mogadishu',
        SR: 'America/Paramaribo', SS: 'Africa/Juba', ST: 'Africa/Sao_Tome', SV: 'America/El_Salvador', SX: 'America/Lower_Princes', SY: 'Asia/Damascus', SZ: 'Africa/Mbabane', TC: 'America/Grand_Turk', TD: 'Africa/Ndjamena', TF: 'Indian/Kerguelen',
        TG: 'Africa/Lome', TH: 'Asia/Bangkok', TJ: 'Asia/Dushanbe', TL: 'Asia/Dili', TM: 'Asia/Ashgabat', TN: 'Africa/Tunis', TO: 'Pacific/Tongatapu', TR: 'Europe/Istanbul', TT: 'America/Port_of_Spain', TW: 'Asia/Taipei',
        TZ: 'Africa/Dar_es_Salaam', UA: 'Europe/Kyiv', UG: 'Africa/Kampala', UY: 'America/Montevideo', UZ: 'Asia/Tashkent', VA: 'Europe/Vatican', VC: 'America/St_Vincent', VE: 'America/Caracas', VG: 'America/Tortola', VI: 'America/St_Thomas',
        VN: 'Asia/Ho_Chi_Minh', VU: 'Pacific/Efate', WF: 'Pacific/Wallis', WS: 'Pacific/Apia', XK: 'Europe/Belgrade', YE: 'Asia/Aden', ZA: 'Africa/Johannesburg', ZM: 'Africa/Lusaka', ZW: 'Africa/Harare',
        'x-n-cyprus': 'Asia/Famagusta', 'x-somaliland': 'Africa/Mogadishu', 'x-siachen-glacier': 'Asia/Kolkata', 'x-indian-ocean-ter': 'Indian/Christmas', KI: 'Pacific/Tarawa', FM: 'Pacific/Pohnpei', PF: 'Pacific/Tahiti', TV: 'Pacific/Funafuti'};
    /** le fuseau d'un morceau de pays (lon, lat : le milieu du morceau) ; les grands pays sont découpés par régions */
    function tzOf(iso, lon, lat) {
        const by = (cuts, last) => { for (const [x, z] of cuts) if (lon < x) return z; return last; };
        switch (iso) {
            case 'US': if (lat > 51 && lon < -129) return 'America/Anchorage'; if (lat < 25 && lon < -150) return 'Pacific/Honolulu'; return by([[-114.5, 'America/Los_Angeles'], [-101, 'America/Denver'], [-86.5, 'America/Chicago']], 'America/New_York');
            case 'CA': return by([[-120, 'America/Vancouver'], [-102, 'America/Edmonton'], [-90, 'America/Winnipeg'], [-67, 'America/Toronto'], [-59, 'America/Halifax']], 'America/St_Johns');
            case 'MX': return by([[-114.5, 'America/Tijuana'], [-105.5, 'America/Mazatlan']], 'America/Mexico_City');
            case 'BR': if (lon < -66) return 'America/Rio_Branco'; if (lon < -54 && lat > -18) return 'America/Manaus'; if (lon > -34) return 'America/Noronha'; return 'America/Sao_Paulo';
            case 'RU': if (lon < 23) return 'Europe/Kaliningrad'; if (lon > 128 && lon < 142 && lat < 55) return 'Asia/Vladivostok'; if (lon > 142 && lat < 50) return 'Asia/Sakhalin'; return by([[48, 'Europe/Moscow'], [54, 'Europe/Samara'], [66, 'Asia/Yekaterinburg'], [82, 'Asia/Omsk'], [88, 'Asia/Novosibirsk'], [106, 'Asia/Krasnoyarsk'], [120, 'Asia/Irkutsk'], [135, 'Asia/Yakutsk'], [150, 'Asia/Vladivostok'], [160, 'Asia/Magadan']], 'Asia/Kamchatka');
            case 'AU': if (lon < 129) return 'Australia/Perth'; if (lon < 141) return lat > -26 ? 'Australia/Darwin' : 'Australia/Adelaide'; if (lat < -39.5) return 'Australia/Hobart'; return lat > -29 ? 'Australia/Brisbane' : 'Australia/Sydney';
            case 'ID': return by([[115, 'Asia/Jakarta'], [126, 'Asia/Makassar']], 'Asia/Jayapura');
            case 'CD': return lon < 22 ? 'Africa/Kinshasa' : 'Africa/Lubumbashi';
            case 'MN': return lon < 99 ? 'Asia/Hovd' : 'Asia/Ulaanbaatar';
            case 'CL': return lon < -100 ? 'Pacific/Easter' : 'America/Santiago';
            case 'EC': return lon < -85 ? 'Pacific/Galapagos' : 'America/Guayaquil';
            case 'PT': return lon < -20 ? 'Atlantic/Azores' : lon < -14 ? 'Atlantic/Madeira' : 'Europe/Lisbon';
            case 'ES': return lon < -12 ? 'Atlantic/Canary' : 'Europe/Madrid';
            case 'FR': if (lon < -100) return 'Pacific/Tahiti'; if (lon < -40) return lat > 10 ? 'America/Martinique' : 'America/Cayenne'; if (lon > 160) return 'Pacific/Noumea'; if (lon > 50) return 'Indian/Reunion'; if (lon > 42) return 'Indian/Mayotte'; return 'Europe/Paris';
            case 'NL': return lon < -50 ? 'America/Curacao' : 'Europe/Amsterdam';
            case 'NZ': return lon < 0 || lon > 179 ? 'Pacific/Chatham' : 'Pacific/Auckland';
            case 'KI': return lon < -160 ? (lon < -165 ? 'Pacific/Kanton' : 'Pacific/Kiritimati') : 'Pacific/Tarawa';
            case 'FM': return lon < 150 ? 'Pacific/Chuuk' : lon > 160 ? 'Pacific/Kosrae' : 'Pacific/Pohnpei';
            case 'PF': return lon > -141 ? 'Pacific/Marquesas' : 'Pacific/Tahiti';
            case 'GL': return lon > -25 ? 'America/Scoresbysund' : 'America/Nuuk';
            default: return COUNTRY_TZ[iso] || '';
        }
    }
    /* 🎨 les couleurs des fuseaux : un jeu tout prêt, et chaque fuseau changeable à la main (genealogie-horloges-couleurs) */
    const hsl = (h, sa, l) => { sa /= 100; l /= 100; const a = sa * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }; return `#${f(0)}${f(8)}${f(4)}`; };
    const lerpHex = (a, b, k) => '#' + [0, 2, 4].map(i => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - k) + parseInt(b.slice(1 + i, 3 + i), 16) * k).toString(16).padStart(2, '0')).join('');
    const ramp = stops => x => { const t = Math.max(0, Math.min(1, x)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t)); return lerpHex(stops[i], stops[i + 1], t - i); };
    /** chaque jeu : une fonction (rang du fuseau de 0 = UTC−12 à 1 = UTC+14) → couleur ; « alterne » : deux couleurs, une heure sur deux */
    const PALETTES = [
        ['chaud', 'Du froid au chaud', ramp(['#3b4cc0', '#8ac2dc', '#e6e7a5', '#f0a35b', '#b13339', '#43031c'])],
        ['arcenciel', 'Arc-en-ciel', x => hsl(280 * (1 - x), 70, 58)],
        ['pastel', 'Pastel', x => hsl(360 * x, 60, 82)],
        ['terres', 'Terres et ocres', ramp(['#5b4636', '#8c6d46', '#c49a5a', '#e3c58a', '#a7b77a', '#5f7f4f'])],
        ['ocean', 'Océan', ramp(['#e8f4f8', '#9fd3e3', '#4aa3c4', '#1f6f9a', '#0b3c63'])],
        ['vif', 'Couleurs vives', x => hsl((x * 26 * 47) % 360, 78, 52)],
        ['atlas', 'Atlas d’école (deux tons)', null],
        ['gris', 'Gris', ramp(['#f2f2f2', '#8c8c8c', '#262626'])],
        ['sepia', 'Sépia', ramp(['#f3e6cc', '#c9a774', '#7a5a33', '#3b2a14'])],
    ];
    const COLOR_KEY = 'genealogie-horloges-couleurs';
    const colorPrefs = () => { const v = ls.get(COLOR_KEY, {}); return {palette: PALETTES.some(p => p[0] === v.palette) ? v.palette : 'chaud', custom: v.custom && typeof v.custom === 'object' ? v.custom : {}, atlas: Array.isArray(v.atlas) ? v.atlas : ['#f6e3b4', '#cfe3c1']}; };
    function paletteColor(pal, min, P = colorPrefs()) {
        const x = (min / 60 + 12) / 26;
        if (pal === 'atlas') return (((Math.floor(min / 60) % 2) + 2) % 2 ? P.atlas[1] : P.atlas[0]);
        const f = (PALETTES.find(p => p[0] === pal) || PALETTES[0])[2]; return f(x);
    }
    /** la couleur d'un fuseau (en minutes depuis UTC) : la sienne si on l'a choisie, sinon celle du jeu */
    const offColor = (min, P = colorPrefs()) => P.custom[String(min)] || paletteColor(P.palette, min, P);
    const fmtOffset = o => `UTC${o >= 0 ? '+' : '−'}${Math.floor(Math.abs(o) / 60)}${Math.abs(o) % 60 ? ':' + pad(Math.abs(o) % 60) : ''}`;
    /** la fenêtre « 🎨 Couleurs des fuseaux » : un jeu tout prêt, puis chaque fuseau (ceux de la carte d'abord) */
    function colorsDialog(used, onDone) {
        const before = ls.get(COLOR_KEY, {}); let P = colorPrefs();
        const all = [...new Set([...used, ...Array.from({length: 27}, (_, i) => (i - 12) * 60)])].sort((a, b) => a - b);
        const dg = document.createElement('dialog'); dg.className = 'modal hz-colors'; document.body.appendChild(dg);
        const paint = () => { dg.querySelector('[data-hzc-body]').innerHTML = `
            <h3>${esc(T('Jeux de couleurs tout prêts'))}</h3><div class="hz-pals">${PALETTES.map(([k, l]) => `<button type="button" class="hz-pal${P.palette === k ? ' is-on' : ''}" data-hzc-pal="${k}" aria-pressed="${P.palette === k}"><span class="hz-pal-sw">${Array.from({length: 14}, (_, i) => `<i style="background:${paletteColor(k, (k === 'atlas' ? i - 6 : i * 2 - 12) * 60, P)}"></i>`).join('')}</span>${esc(T(l))}</button>`).join('')}</div>
            ${P.palette === 'atlas' ? `<p class="hz-atlas">${esc(T('Les deux tons :'))} <input type="color" data-hzc-atlas="0" value="${P.atlas[0]}"> <input type="color" data-hzc-atlas="1" value="${P.atlas[1]}"></p>` : ''}
            <h3>${esc(T('Chaque fuseau'))} <small class="muted">${esc(T('(en gras : ceux de la carte ; ↺ revient au jeu)'))}</small></h3>
            <div class="hz-offs">${all.map(o => `<label class="hz-off${used.includes(o) ? ' is-used' : ''}${P.custom[String(o)] ? ' is-own' : ''}"><input type="color" value="${offColor(o, P)}" data-hzc-off="${o}"><span>${esc(fmtOffset(o))}</span>${P.custom[String(o)] ? `<button type="button" class="icon-button small" data-hzc-reset="${o}" title="${esc(T('Revenir à la couleur du jeu'))}" aria-label="${esc(T('Revenir à la couleur du jeu'))}">↺</button>` : ''}</label>`).join('')}</div>`; };
        dg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">🕰 ${esc(T('Heures du monde'))}</span><h2>🎨 ${esc(T('Couleurs des fuseaux'))}</h2></div><button type="button" class="icon-button" data-hzc-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <div data-hzc-body></div>
            <div class="modal-actions"><button type="button" class="button secondary" data-hzc-all>↺ ${esc(T('Tout remettre comme au départ'))}</button><span class="spacer"></span><button type="button" class="button secondary" data-hzc-x>${esc(T('Annuler'))}</button><button type="button" class="button" data-hzc-ok>${esc(T('Enregistrer'))}</button></div></form>`;
        dg.showModal(); paint();
        const close = () => { dg.close(); dg.parentNode?.removeChild(dg); };
        dg.addEventListener('input', e => { const o = e.target.dataset.hzcOff, a = e.target.dataset.hzcAtlas; if (o !== undefined) { P.custom[o] = e.target.value; e.target.closest('.hz-off').classList.add('is-own'); } if (a !== undefined) { P.atlas[Number(a)] = e.target.value; } });
        dg.addEventListener('change', e => { if (e.target.dataset.hzcOff !== undefined || e.target.dataset.hzcAtlas !== undefined) paint(); });
        dg.addEventListener('click', e => {
            if (e.target.closest('[data-hzc-x]')) return close();
            const pl = e.target.closest('[data-hzc-pal]'); if (pl) { P.palette = pl.dataset.hzcPal; return paint(); }
            const rs = e.target.closest('[data-hzc-reset]'); if (rs) { e.preventDefault(); delete P.custom[rs.dataset.hzcReset]; return paint(); }
            if (e.target.closest('[data-hzc-all]')) { P = {palette: 'chaud', custom: {}, atlas: ['#f6e3b4', '#cfe3c1']}; return paint(); }
            if (e.target.closest('[data-hzc-ok]')) { ls.set(COLOR_KEY, P); close(); onDone?.(); A().undoToast?.(T('Couleurs des fuseaux enregistrées.'), {undo: () => { ls.set(COLOR_KEY, before); onDone?.(); }}); }
        });
        return dg;
    }

    /* ── 🗺 la carte des fuseaux : par pays et régions (l'heure légale, été compris) ou en bandes de 15°, la nuit en grisé, les villes ── */
    const MAPMODE_KEY = 'genealogie-horloges-carte', WHO_KEY = 'genealogie-horloges-pays';
    async function mapHtml(cities, t = Date.now(), mode = ls.get(MAPMODE_KEY, 'real')) {
        const W = 960, H = 470, X = lon => (lon + 180) / 360 * W, Y = lat => (90 - lat) / 180 * H;
        // un contour qui passe la ligne de changement de date (-180 ↔ 180) : on lève le crayon au lieu de traverser toute la carte
        const ring = r => { let s = '', jumped = false; for (let i = 0; i < r.length; i += 2) { const jump = i && Math.abs(r[i] - r[i - 2]) > 180; if (jump) jumped = true; s += (i && !jump ? 'L' : 'M') + X(r[i]).toFixed(1) + ' ' + Y(r[i + 1]).toFixed(1); } return jumped ? s : s + 'Z'; };
        let land = '', used = new Map(), clipDefs = '', clipSeq = 0; const CP = colorPrefs(), who = new Map(); // fuseau → {pays ou région → fuseau IANA}
        try {
            const G = await ext.diagramCartes?.load('monde-50m');
            land = (G?.zones || []).map(z => {
                if (mode !== 'real') return `<path d="${z.polys.map(pp => pp.map(ring).join('')).join('')}"/>`;
                // chaque morceau du pays (île, outre-mer, région d'un grand pays) avec son fuseau
                const groups = new Map();
                z.polys.forEach(pp => { const r = pp[0]; if (!r?.length) return; let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (let i = 0; i < r.length; i += 2) { a = Math.min(a, r[i]); b = Math.max(b, r[i]); c = Math.min(c, r[i + 1]); d = Math.max(d, r[i + 1]); }
                    const big = ['US', 'CA', 'RU', 'BR', 'AU', 'MX', 'ID', 'CD', 'MN', 'GL'].includes(z.id) && b - a > 8;
                    if (big && b - a > 300) { a = Math.min(...Array.from({length: r.length / 2}, (_, i) => r[i * 2]).filter(v => v > 0), a > 0 ? a : 19); b = 180; } // la Russie : on dessine ses carrés de 19° à 180° (la pointe passée la ligne garde l'heure du Kamtchatka)
                    if (!big) { const tz = tzOf(z.id, (a + b) / 2, (c + d) / 2); if (!groups.has(tz)) groups.set(tz, []); groups.get(tz).push(pp.map(ring).join('')); return; }
                    // un grand morceau à plusieurs fuseaux : découpé en tranches de longitude (clipPath)
                    const dd = pp.map(ring).join(''), byTz = new Map();
                    // des carrés de 2° (longitude × latitude), rangés par fuseau ; les carrés voisins d'une même ligne sont réunis
                    for (let y = Math.floor(c / 2) * 2; y < d; y += 2) for (let x = Math.floor(a / 2) * 2; x < b; x += 2) { const tz = tzOf(z.id, x + 1, y + 1); if (!byTz.has(tz)) byTz.set(tz, []); const L = byTz.get(tz), last = L[L.length - 1]; if (last && last[2] === y && last[1] === x) last[1] = x + 2; else L.push([x, x + 2, y]); }
                    byTz.forEach((ranges, tz) => { const id = 'hzc' + (++clipSeq); clipDefs += `<clipPath id="${id}">${ranges.map(([x0, x1, y0]) => `<rect x="${(X(x0) - .3).toFixed(1)}" y="${(Y(y0 + 2) - .3).toFixed(1)}" width="${(X(x1) - X(x0) + .6).toFixed(1)}" height="${(Y(y0) - Y(y0 + 2) + .6).toFixed(1)}"/>`).join('')}</clipPath>`;
                        if (!groups.has(tz)) groups.set(tz, []); groups.get(tz).push({clip: id, d: dd}); });
                });
                return [...groups].map(([tz, ds]) => { const off = tz && SET(tz) ? offsetOf(tz, t) : null; if (off !== null) { used.set(off, (used.get(off) || 0) + 1); if (!who.has(off)) who.set(off, new Map()); const multi = Object.values(groups).length > 1 || groups.size > 1 || ['US', 'CA', 'RU', 'BR', 'AU', 'MX', 'ID', 'CD', 'MN', 'GL', 'FR', 'PT', 'ES', 'NL', 'CL', 'EC', 'NZ', 'KI', 'FM', 'PF'].includes(z.id); const nm = multi ? `${z.name} (${tz.split('/').pop().replace(/_/g, ' ')})` : z.name; who.get(off).set(nm, tz); }
                    const fill = off === null ? '#e6e3da' : offColor(off, CP), title = `<title>${esc(z.name)}${tz ? ` — ${esc(tz)} (UTC${off >= 0 ? '+' : '−'}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? ':' + pad(Math.abs(off) % 60) : ''})` : ''}</title>`;
                    const plain = ds.filter(x => typeof x === 'string').join(''), clipped = ds.filter(x => typeof x !== 'string');
                    return (plain ? `<path d="${plain}" style="fill:${fill}" data-hz-off="${off ?? ''}">${title}</path>` : '') + clipped.map(cd => `<path d="${cd.d}" style="fill:${fill}" data-hz-off="${off ?? ''}" clip-path="url(#${cd.clip})">${title}</path>`).join(''); }).join('');
            }).join('');
        } catch (_) {}
        const clips = clipDefs;
        const bands = mode === 'real' ? '' : Array.from({length: 25}, (_, i) => { const x0 = X(-187.5 + i * 15), off = i - 12; return `<rect x="${x0.toFixed(1)}" y="0" width="${(W / 24).toFixed(1)}" height="${H}" class="${i % 2 ? 'hz-b1' : 'hz-b2'}"/><text x="${Math.min(W - 10, Math.max(10, x0 + W / 48)).toFixed(1)}" y="14" class="hz-bl">${off > 0 ? '+' : ''}${off}</text>`; }).join('');
        let night = ''; for (let lon = -180; lon < 180; lon += 2) { let y0 = null; for (let lat = 88; lat >= -90; lat -= 2) { const n = sunUp(lat, lon + 1, t) === false; if (n && y0 === null) y0 = lat; if ((!n || lat === -90) && y0 !== null) { night += `M${X(lon).toFixed(1)} ${Y(y0).toFixed(1)}h${(W / 180 + .8).toFixed(1)}V${Y(n ? lat - 2 : lat).toFixed(1)}h-${(W / 180 + .8).toFixed(1)}Z`; y0 = null; } } }
        // les villes : un point chacune ; les étiquettes sont posées après coup (layoutMap), selon la largeur à l'écran
        const dots = cities.filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon)).map((c, i) => { const p = partsAt(c.tz, t), tm = `${pad(p.h)}:${pad(p.mi)}`;
            return `<g class="hz-dot" tabindex="0" data-hz-ci="${i}" data-hz-name="${esc(c.name)}" data-hz-time="${tm}" aria-label="${esc(c.name)} ${tm}"><title>${esc(c.name)} ${tm}</title><circle cx="${X(c.lon).toFixed(1)}" cy="${Y(c.lat).toFixed(1)}" r="4"/></g>`; }).join('');
        const fmtOff = o => `${o >= 0 ? '+' : '−'}${Math.floor(Math.abs(o) / 60)}${Math.abs(o) % 60 ? ':' + pad(Math.abs(o) % 60) : ''}`;
        const legend = mode === 'real' ? `<div class="hz-legend">${[...used.keys()].sort((a, b) => a - b).map(o => `<button type="button" class="hz-leg" data-hz-leg="${o}" title="${esc(T('Changer sa couleur'))}"><i style="background:${offColor(o, CP)}"></i>UTC${fmtOff(o)}</button>`).join('')}<button type="button" class="button small secondary" data-hz-colors data-hz-used="${[...used.keys()].join(',')}">🎨 ${esc(T('Couleurs des fuseaux'))}</button></div>` : '';
        const seg = `<div class="segmented hz-mapmode">${[['real', T('Par pays et régions (heure légale)')], ['bands', T('Fuseaux théoriques (bandes de 15°)')]].map(([k, l]) => `<button type="button" class="${mode === k ? 'is-active' : ''}" data-hz-mapmode="${k}" aria-pressed="${mode === k}">${esc(l)}</button>`).join('')}</div>`;
        // 📋 sous la carte : quels pays et régions pour chaque fuseau (se montre et se cache, retenu)
        const coll = new Intl.Collator(root.LCNDA_I18N?.lang || 'fr');
        const table = mode === 'real' && who.size ? `<details class="hz-who" data-hz-who ${ls.get(WHO_KEY, false) ? 'open' : ''}><summary>📋 ${esc(T('Quels pays et régions pour chaque fuseau'))} <small class="muted">${esc(T('{n} fuseaux', {n: String(who.size)}))}</small></summary>
            <input type="search" class="hz-who-q" data-hz-who-q placeholder="${esc(T('Chercher un pays, une région, un fuseau…'))}">
            <div class="hz-who-list">${[...who.keys()].sort((x, y) => x - y).map(o => `<section data-hz-who-off="${o}"><h4><i style="background:${offColor(o, CP)}"></i>${esc(fmtOffset(o))}</h4><p>${[...who.get(o).keys()].sort(coll.compare).map(n => `<span data-hz-who-n="${esc(n.toLowerCase())}">${esc(n)}</span>`).join('')}</p></section>`).join('')}</div></details>` : '';
        return `${seg}<svg viewBox="0 0 ${W} ${H}" class="hz-map is-${mode}" role="img" aria-label="${esc(T('Carte des fuseaux horaires'))}"><defs>${clips}</defs><rect width="${W}" height="${H}" class="hz-sea"/>${bands}<g class="hz-land">${land}</g><path class="hz-night" d="${night}"/><g class="hz-dots">${dots}</g><g class="hz-leaders"></g><g class="hz-labels"></g></svg><ul class="hz-citykey" data-hz-citykey hidden></ul>${legend}${table}
            <p class="muted hz-note">${esc(mode === 'real' ? T('Chaque pays à son heure légale d’aujourd’hui (heure d’été comprise) ; les grands pays sont découpés par régions, de façon approchée. Survole un pays pour son fuseau.') : T('Les bandes montrent les fuseaux théoriques (15° chacun) ; l’heure réelle de chaque pays peut en différer (heure légale, heure d’été).'))}</p>`;
    }

    /* ── 🔁 comparer : à telle heure ici, quelle heure ailleurs ── */
    /** 🏷 pose les étiquettes des villes selon la largeur réelle de la carte (refait quand la fenêtre change de taille) ;
     *  en dessous de 560 px : des numéros sur la carte et la liste des villes en dessous */
    const NARROW_PX = 560;
    let measureCtx = null;
    const textW = (s, px) => { try { measureCtx = measureCtx || document.createElement('canvas').getContext('2d'); measureCtx.font = `600 ${px}px system-ui, sans-serif`; return measureCtx.measureText(s).width; } catch (_) { return String(s).length * px * .6; } };
    function layoutMap(svg) {
        if (!svg?.isConnected) return;
        const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number), W = vb[2], H = vb[3], px = svg.getBoundingClientRect().width; if (!px || !W) return;
        const k = W / px, narrow = px < NARROW_PX, fpx = narrow ? 11 : 12;
        svg.dataset.hzPx = String(Math.round(px)); svg.classList.toggle('is-narrow', narrow);
        const els = [...svg.querySelectorAll('.hz-dot')], rDot = (narrow ? 4.5 : 4) * k;
        const pts = els.map(el => { const c = el.querySelector('circle'); c.setAttribute('r', rDot.toFixed(2)); return {x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')), name: el.dataset.hzName, time: el.dataset.hzTime}; });
        // les voisines à la même heure ensemble ; numérotées d'ouest en est
        const groups = groupCities(pts, 22 * k).sort((a, b) => pts[a[0]].x - pts[b[0]].x);
        const items = groups.map((ix, gi) => { const full = `${ix.map(i => pts[i].name).join(' · ')} ${pts[ix[0]].time}`, txt = narrow ? String(gi + 1) : full;
            return {txt, full, ix, w: (textW(txt, fpx) + (narrow ? 7 : 9)) * k, h: (fpx + 6) * k, dots: ix.map(i => pts[i])}; });
        const pos = placeLabels(items, {W, H, r: rDot, gap: 3 * k, pad: 2 * k});
        groups.forEach((ix, gi) => ix.forEach(i => { els[i].dataset.hzG = String(gi); }));
        svg.querySelector('.hz-leaders').innerHTML = pos.map((b, gi) => b.leader ? `<line class="hz-leader" data-hz-g="${gi}" x1="${b.leader.x1.toFixed(1)}" y1="${b.leader.y1.toFixed(1)}" x2="${b.leader.x2.toFixed(1)}" y2="${b.leader.y2.toFixed(1)}"/>` : '').join('');
        const labs = svg.querySelector('.hz-labels'); labs.style.fontSize = (fpx * k).toFixed(2) + 'px';
        labs.innerHTML = pos.map((b, gi) => `<g class="hz-lab${b.stacked ? ' is-stacked' : ''}" data-hz-g="${gi}"><rect x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="${(3 * k).toFixed(1)}"/><text x="${(b.x + b.w / 2).toFixed(1)}" y="${(b.y + b.h / 2).toFixed(1)}">${esc(items[gi].txt)}</text></g>`).join('');
        const key = svg.parentNode?.querySelector('[data-hz-citykey]');
        if (key) { key.hidden = !narrow; key.innerHTML = narrow ? items.map((it, gi) => `<li data-hz-g="${gi}" tabindex="0"><b>${gi + 1}</b> ${esc(it.full)}</li>`).join('') : ''; }
        if (!svg.dataset.hzWired) {
            svg.dataset.hzWired = '1';
            const hl = g => { const box = svg.parentNode || svg; box.querySelectorAll('.is-hl').forEach(x => x.classList.remove('is-hl')); if (g == null) return;
                box.querySelectorAll(`[data-hz-g="${g}"]`).forEach(x => x.classList.add('is-hl')); const lab = svg.querySelector(`.hz-lab[data-hz-g="${g}"]`); lab?.parentNode.appendChild(lab); };
            const on = e => { const x = e.target.closest?.('[data-hz-g]'); hl(x ? x.dataset.hzG : null); };
            for (const el of [svg, key].filter(Boolean)) { el.addEventListener('pointerover', on); el.addEventListener('focusin', on); el.addEventListener('pointerleave', () => hl(null)); el.addEventListener('focusout', () => hl(null)); }
            if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => { if (!svg.isConnected) return ro.disconnect(); const w = Math.round(svg.getBoundingClientRect().width); if (w && Math.abs(w - Number(svg.dataset.hzPx || 0)) > 1) layoutMap(svg); }); ro.observe(svg); }
        }
    }

    function compareHtml(cities, h) {
        const t0 = new Date(); const here = partsAt(HERE), base = Date.now() + ((h - here.h) * 60 - here.mi) * 60000 - here.s * 1000;
        return `<table class="hz-cmp"><thead><tr><th>${esc(T('Ville'))}</th>${Array.from({length: 24}, (_, k) => `<th class="${k === h ? 'is-on' : ''}">${k}</th>`).join('')}</tr></thead><tbody>${cities.map(c => {
            const off = Math.round((offsetOf(c.tz, base) - offsetOf(HERE, base)) / 60);
            return `<tr><th>${esc(c.name)}<small>${esc(offTxt(offsetOf(c.tz, base) - offsetOf(HERE, base)))}</small></th>${Array.from({length: 24}, (_, k) => { const v = ((k + off) % 24 + 24) % 24, cls = v >= 8 && v < 20 ? 'hz-day' : v >= 6 && v < 22 ? 'hz-mid' : 'hz-nite'; return `<td class="${cls}${k === h ? ' is-on' : ''}">${v}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table>
            <p class="muted hz-note">${esc(T('Clique une heure d’ici (en haut) : sa colonne montre l’heure de chaque ville. Vert : de 8 h à 20 h ; gris : la nuit.'))}</p>${t0 ? '' : ''}`;
    }

    /* ── ＋ ajouter une ville : les plus de 200 villes, puis tous les fuseaux du navigateur ── */
    function addDialog(onDone) {
        const zones = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch (_) { return []; } })();
        const dg = document.createElement('dialog'); dg.className = 'modal hz-add'; document.body.appendChild(dg);
        dg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">🕰 ${esc(T('Heures du monde'))}</span><h2>${esc(T('Ajouter une ville'))}</h2></div><button type="button" class="icon-button" data-hz-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <input type="search" data-hz-q placeholder="${esc(T('Une ville, un pays ou un fuseau (ex. Montréal, Japon, Asia/Tokyo)'))}" autocomplete="off">
            <ul class="hz-res" data-hz-res></ul>
            <details class="hz-own"><summary>${esc(T('Une ville qui n’est pas dans la liste'))}</summary><div class="form-grid"><label>${esc(T('Nom'))}<input data-hz-own-name maxlength="80"></label><label>${esc(T('Fuseau'))}<select data-hz-own-tz>${zones.map(z => `<option${z === HERE ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select></label></div><button type="button" class="button small" data-hz-own>＋ ${esc(T('Ajouter'))}</button></details>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-hz-x>${esc(T('Fermer'))}</button></div></form>`;
        dg.showModal();
        const close = () => { dg.close(); dg.parentNode?.removeChild(dg); };
        const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const paint = () => { const q = fold(dg.querySelector('[data-hz-q]').value.trim());
            const hits = CITIES.filter(c => !q || fold(c[0] + ' ' + c[2] + ' ' + c[1]).includes(q)).slice(0, 40).map(c => ({name: c[0], tz: c[1], sub: c[2], lat: c[3], lon: c[4]}));
            const zh = q ? zones.filter(z => fold(z).includes(q) && !hits.some(h => h.tz === z)).slice(0, 20).map(z => ({name: z.split('/').pop().replace(/_/g, ' '), tz: z, sub: z})) : [];
            dg.querySelector('[data-hz-res]').innerHTML = [...hits, ...zh].map((c, i) => `<li><button type="button" class="hz-pick" data-hz-pick='${esc(JSON.stringify(c))}'><b>${esc(c.name)}</b> <small class="muted">${esc(c.sub)} · ${esc(partsAt(c.tz).h)}:${pad(partsAt(c.tz).mi)}</small></button></li>`).join('') || `<li class="muted">${esc(T('Aucune ville ne correspond.'))}</li>`; };
        paint();
        dg.querySelector('[data-hz-q]').addEventListener('input', paint);
        dg.addEventListener('click', e => {
            if (e.target.closest('[data-hz-x]')) return close();
            const pk = e.target.closest('[data-hz-pick]'); if (pk) { const c = JSON.parse(pk.dataset.hzPick); add({name: c.name, tz: c.tz, lat: c.lat, lon: c.lon}); return; }
            if (e.target.closest('[data-hz-own]')) { const n = dg.querySelector('[data-hz-own-name]').value.trim(), tz = dg.querySelector('[data-hz-own-tz]').value; if (!n) return A().toast(T('Donne un nom à la ville.'), 'error'); add({name: n, tz}); }
        });
        function add(c) { const list = mine(); if (list.some(x => x.tz === c.tz && x.name === c.name)) return A().toast(T('Elle y est déjà.')); const it = {id: 'c' + Date.now().toString(36), ...c}; saveMine([...list, it]); onDone?.(); A().toast(T('« {n} » ajoutée.', {n: c.name}), 'success'); }
        return dg;
    }

    /* ── la liste (Listes → 🕰 Heures du monde) ── */
    const VIEW_KEY = 'genealogie-horloges-vue';
    let cmpHour = null;
    async function render(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const st = styleOf(), list = mine(), view = ls.get(VIEW_KEY, 'clocks'), here = partsAt(HERE);
        if (cmpHour === null) cmpHour = here.h;
        const views = [['clocks', '🕰 ' + T('Horloges')], ['compare', '🔁 ' + T('Comparer')], ['map', '🗺 ' + T('Carte des fuseaux')]];
        const body = !list.length ? A().emptyState({icon: '🕰', text: T('Aucune ville pour l’instant'), hint: T('« ＋ Ajouter une ville » : plus de 200 villes, ou n’importe quel fuseau horaire.')})
            : view === 'compare' ? compareHtml(list, cmpHour) : view === 'map' ? await mapHtml(list) : `<div class="hz-list">${list.map((c, i) => `<div class="hz-item" data-hz-id="${esc(c.id)}">${clocksHtml([c], st)}<div class="hz-item-act"><button type="button" class="icon-button small" data-hz-up="${i}" ${i ? '' : 'disabled'} aria-label="${esc(T('Monter'))}">↑</button><button type="button" class="icon-button small" data-hz-down="${i}" ${i < list.length - 1 ? '' : 'disabled'} aria-label="${esc(T('Descendre'))}">↓</button><button type="button" class="icon-button small" data-hz-del="${esc(c.id)}" aria-label="${esc(T('Retirer'))}">🗑</button></div></div>`).join('')}</div>`;
        if (token != null && token !== A().state?.workspaceToken) return;
        const UIx = window.LCNDA_UI || {};
        const head = UIx.pageHeader ? UIx.pageHeader({title: `🕰 ${T('Heures du monde')}`, help: T('Ici ({z}) : il est {h}.', {z: HERE, h: `${pad(here.h)}:${pad(here.mi)}`}),
                actions: [`<button type="button" class="button" data-hz-add>＋ ${esc(T('Ajouter une ville'))}</button>`, `<button type="button" class="button secondary" data-hz-style-open>🎨 ${esc(T('Style des horloges'))}</button>`]})
            : `<div class="page-header"><div><h2>🕰 ${esc(T('Heures du monde'))}</h2></div><div class="page-actions"><button type="button" class="button" data-hz-add>＋ ${esc(T('Ajouter une ville'))}</button><button type="button" class="button secondary" data-hz-style-open>🎨 ${esc(T('Style des horloges'))}</button></div></div>`;
        ws.innerHTML = `<section class="page hz-page">${head}
            <div class="segmented hz-views" role="tablist">${views.map(([k, l]) => `<button type="button" class="${view === k ? 'is-active' : ''}" data-hz-view="${k}" aria-pressed="${view === k}">${esc(l)}</button>`).join('')}</div>
            <div class="hz-body" data-hz-body>${body}</div></section>`;
        startTick();
        ws.querySelectorAll('.hz-map').forEach(layoutMap);
        ws.querySelector('[data-hz-who-q]')?.addEventListener('input', e => { const q = e.target.value.trim().toLowerCase(); ws.querySelectorAll('[data-hz-who-off]').forEach(sec => { let any = false; sec.querySelectorAll('[data-hz-who-n]').forEach(x => { const on = !q || x.dataset.hzWhoN.includes(q) || sec.querySelector('h4').textContent.toLowerCase().includes(q); x.hidden = !on; if (on) any = true; }); sec.hidden = !any; }); });
        const again = () => render(A().state?.workspaceToken);
        ws.querySelector('.hz-page').addEventListener('click', e => {
            const v = e.target.closest('[data-hz-view]'); if (v) { ls.set(VIEW_KEY, v.dataset.hzView); return again(); }
            const sm = e.target.closest('[data-hz-who] > summary'); if (sm) { setTimeout(() => ls.set(WHO_KEY, !!sm.parentNode.open), 0); return; }
            const mm = e.target.closest('[data-hz-mapmode]'); if (mm) { ls.set(MAPMODE_KEY, mm.dataset.hzMapmode); return again(); }
            const cl = e.target.closest('[data-hz-colors],[data-hz-leg]'); if (cl) { const used = [...ws.querySelectorAll('[data-hz-leg]')].map(b => Number(b.dataset.hzLeg)); const dg = colorsDialog(used, again); if (cl.dataset.hzLeg !== undefined) dg.querySelector(`[data-hzc-off="${cl.dataset.hzLeg}"]`)?.focus(); return; }
            if (e.target.closest('[data-hz-add]')) return addDialog(again);
            if (e.target.closest('[data-hz-style-open]')) return styleDialog(null, again);
            const th = e.target.closest('.hz-cmp thead th'); if (th && /^\d+$/.test(th.textContent)) { cmpHour = Number(th.textContent); return again(); }
            const del = e.target.closest('[data-hz-del]'); if (del) { const before = mine(), gone = before.find(c => c.id === del.dataset.hzDel); saveMine(before.filter(c => c.id !== gone.id)); again(); A().undoToast?.(T('« {n} » retirée', {n: gone.name}), {undo: () => { saveMine(before); again(); }}); return; }
            const mv = e.target.closest('[data-hz-up],[data-hz-down]'); if (mv) { const l = mine(), i = Number(mv.dataset.hzUp ?? mv.dataset.hzDown), j = mv.dataset.hzUp !== undefined ? i - 1 : i + 1; [l[i], l[j]] = [l[j], l[i]]; saveMine(l); again(); }
        });
    }

    /* ── 🎨 le style : réglages et aperçu en direct (pour la liste, ou pour un widget) ── */
    const STYLE_FIELDS = () => [
        ['kind', 'select', T('L’heure'), [['both', T('Aiguilles et chiffres')], ['analog', T('Aiguilles')], ['digital', T('Chiffres')]]],
        ['shape', 'select', T('Forme du cadran'), [['round', T('Rond')], ['square', T('Carré')], ['rounded', T('Carré arrondi')], ['hexagon', T('Hexagone')]]],
        ['numbers', 'select', T('Sur le cadran'), [['arabic', '1 2 3'], ['roman', 'I II III'], ['ticks', T('Des traits')], ['none', T('Rien')]]],
        ['font', 'select', T('Police'), [['system', T('Moderne')], ['serif', T('Classique')], ['mono', T('Machine à écrire')], ['rounded', T('Arrondie')]]],
        ['layout', 'select', T('Disposition'), [['row', T('En ligne')], ['grid', T('En grille')], ['list', T('En liste')]]],
        ['size', 'range', T('Taille'), [60, 240]],
        ['bg', 'color', T('Fond')], ['face', 'color', T('Cadran')], ['ring', 'color', T('Bord et traits')], ['hands', 'color', T('Aiguilles')], ['second', 'color', T('Trotteuse')], ['text', 'color', T('Texte')],
        ['seconds', 'toggle', T('Les secondes')], ['h24', 'toggle', T('24 heures (sinon AM / PM)')], ['date', 'toggle', T('La date (quand elle change)')], ['offset', 'toggle', T('Le décalage avec ici')], ['daynight', 'toggle', T('Jour ☀️ ou nuit 🌙')]];
    function styleFormHtml(st) {
        return `<div class="hz-sform">${STYLE_FIELDS().map(([k, type, label, opts]) => type === 'select' ? `<label>${esc(label)}<select data-hz-s="${k}">${opts.map(([v, l]) => `<option value="${v}"${st[k] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
            : type === 'range' ? `<label>${esc(label)} <small data-hz-sv="${k}">${st[k]} px</small><input type="range" min="${opts[0]}" max="${opts[1]}" step="5" value="${st[k]}" data-hz-s="${k}"></label>`
            : type === 'color' ? `<label class="hz-col">${esc(label)}<input type="color" value="${esc(st[k])}" data-hz-s="${k}"></label>`
            : `<label class="ui-toggle"><input type="checkbox" data-hz-s="${k}" ${st[k] ? 'checked' : ''}><i></i>${esc(label)}</label>`).join('')}</div>`;
    }
    const readStyle = root => { const o = {}; root.querySelectorAll('[data-hz-s]').forEach(el => { const k = el.dataset.hzS; o[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value; }); return o; };
    const PRESETS = [['Classique', {kind: 'analog', shape: 'round', numbers: 'arabic', face: '#ffffff', ring: '#111111', hands: '#111111', second: '#c0392b', text: '#111111', bg: '#ffffff', font: 'serif'}],
        ['Gare', {kind: 'analog', shape: 'round', numbers: 'ticks', face: '#ffffff', ring: '#000000', hands: '#000000', second: '#d0021b', text: '#000000', bg: '#f4f4f4', font: 'system'}],
        ['Nuit', {kind: 'both', shape: 'rounded', numbers: 'ticks', face: '#1d2230', ring: '#c8a24a', hands: '#f3ead2', second: '#c8a24a', text: '#f3ead2', bg: '#12151d', font: 'system'}],
        ['Ancienne', {kind: 'analog', shape: 'round', numbers: 'roman', face: '#f6ecd2', ring: '#5a3e1b', hands: '#3b2a14', second: '#8a2b0f', text: '#3b2a14', bg: '#efe3c2', font: 'serif'}],
        ['Numérique', {kind: 'digital', font: 'mono', bg: '#0f1a12', text: '#4cff7a', seconds: true}],
        ['Pastel', {kind: 'both', shape: 'hexagon', numbers: 'none', face: '#fde2e4', ring: '#d6457a', hands: '#5b2a3a', second: '#2a6a9a', text: '#5b2a3a', bg: '#fff7f9', font: 'rounded'}]];
    function styleDialog(widget, onDone) {
        let st = widget ? {...styleOf(widget)} : styleOf();
        const sample = mine().slice(0, 3);
        const dg = document.createElement('dialog'); dg.className = 'modal hz-style'; document.body.appendChild(dg);
        const prev = () => { dg.querySelector('[data-hz-prev]').innerHTML = clocksHtml(sample.length ? sample : [{name: 'Paris', tz: 'Europe/Paris'}], st); };
        dg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">🕰 ${esc(T('Heures du monde'))}</span><h2>🎨 ${esc(T('Style des horloges'))}</h2></div><button type="button" class="icon-button" data-hz-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="hz-presets">${PRESETS.map(([n], i) => `<button type="button" class="button small secondary" data-hz-preset="${i}">${esc(T(n))}</button>`).join('')}</div>
            <div class="hz-sgrid"><div data-hz-form>${styleFormHtml(st)}</div><div class="hz-prev" data-hz-prev></div></div>
            <div class="modal-actions"><button type="button" class="button secondary" data-hz-reset>↺ ${esc(T('Comme au départ'))}</button><span class="spacer"></span><button type="button" class="button secondary" data-hz-x>${esc(T('Annuler'))}</button><button type="button" class="button" data-hz-ok>${esc(T('Enregistrer'))}</button></div></form>`;
        dg.showModal(); prev();
        const close = () => { dg.close(); dg.parentNode?.removeChild(dg); };
        dg.addEventListener('input', () => { st = {...st, ...readStyle(dg)}; const sv = dg.querySelector('[data-hz-sv="size"]'); if (sv) sv.textContent = `${st.size} px`; prev(); });
        dg.addEventListener('click', e => {
            if (e.target.closest('[data-hz-x]')) return close();
            const pr = e.target.closest('[data-hz-preset]'); if (pr) { st = {...st, ...PRESETS[Number(pr.dataset.hzPreset)][1]}; dg.querySelector('[data-hz-form]').innerHTML = styleFormHtml(st); return prev(); }
            if (e.target.closest('[data-hz-reset]')) { st = {...STYLE_DEF}; dg.querySelector('[data-hz-form]').innerHTML = styleFormHtml(st); return prev(); }
            if (e.target.closest('[data-hz-ok]')) {
                if (widget) { onDone?.(st); return close(); }
                const before = ls.get(STYLE_KEY, {}); ls.set(STYLE_KEY, st); close(); onDone?.(st);
                A().undoToast?.(T('Style des horloges enregistré.'), {undo: () => { ls.set(STYLE_KEY, before); onDone?.(); }});
            }
        });
        return dg;
    }

    /* ── 🧱 le widget du tableau de bord ── */
    ext.dashboard = ext.dashboard || {}; ext.dashboardConfig = ext.dashboardConfig || {};
    ext.dashboardConfig.clocks_widget = {
        html: w => { const c = w?.config || {}, all = mine(), on = Array.isArray(c.cities) ? c.cities : null, st = styleOf(w);
            return `<fieldset class="hz-wcfg"><legend>🕰 ${esc(T('Horloges du monde'))}</legend><p class="muted">${esc(T('Les villes à montrer (vides : toutes celles de Listes → Heures du monde).'))}</p>
                <div class="hz-wcities">${all.map(x => `<label class="checkbox-line"><input type="checkbox" data-hzw-city value="${esc(x.id)}" ${!on || on.includes(x.id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('')}</div>
                <label class="ui-toggle"><input type="checkbox" data-hzw-own ${c.style ? 'checked' : ''}><i></i>${esc(T('Un style à lui (sinon celui de la liste)'))}</label>
                <div data-hzw-style ${c.style ? '' : 'hidden'}><div class="hz-presets">${PRESETS.map(([n], i) => `<button type="button" class="button small secondary" data-hzw-preset="${i}">${esc(T(n))}</button>`).join('')}</div>${styleFormHtml(st)}</div></fieldset>`; },
        read: ed => { const all = mine(), on = [...ed.querySelectorAll('[data-hzw-city]:checked')].map(x => x.value);
            return {cities: on.length === all.length ? null : on, style: ed.querySelector('[data-hzw-own]')?.checked ? readStyle(ed.querySelector('[data-hzw-style]')) : null}; },
    };
    // les réglages du widget (au dos de la carte) : écoutés sur la page, la fenêtre est fabriquée par le tableau de bord
    document.addEventListener('change', e => { const t = e.target.closest?.('[data-hzw-own]'); if (t) { const box = t.closest('.hz-wcfg')?.querySelector('[data-hzw-style]'); if (box) box.hidden = !t.checked; } });
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-hzw-preset]'); if (!b) return; e.preventDefault(); const box = b.closest('[data-hzw-style]'), cur = {...styleOf(), ...readStyle(box), ...PRESETS[Number(b.dataset.hzwPreset)][1]}; box.querySelector('.hz-sform').outerHTML = styleFormHtml(cur); });
    ext.dashboard.clocks_widget = {load: () => Promise.resolve(null), render: (index, widget, span) => {
        const c = widget?.config || {}, all = mine(), list = Array.isArray(c.cities) ? all.filter(x => c.cities.includes(x.id)) : all, st = styleOf(widget);
        const html = list.length ? clocksHtml(list, st) : `<p class="empty-line">${esc(T('Aucune ville : ajoute-en dans Listes → Heures du monde.'))}</p>`;
        return A().card(index, `🕰 ${T('Horloges du monde')}`, '', html + `<p><button type="button" class="link-button" data-h-open-list="world_clocks">↗ ${esc(T('Heures du monde'))}</button></p>`, span || 'span-6'); // sans la largeur : « card undefined », une colonne de 60 px
    }};

    /* ── au catalogue des listes et des widgets ── */
    ext.lists = ext.lists || {};
    ext.lists.world_clocks = token => render(token);
    const reg = () => {
        const app = A(); if (!app?.defaultListTypes) return false;
        if (!app.defaultListTypes.some(x => x[0] === 'world_clocks')) app.defaultListTypes.push(['world_clocks', '09d', 'Heures du monde']);
        if (app.defaultDashboardBlocks && !app.defaultDashboardBlocks.some(x => x[0] === 'clocks_widget')) { app.defaultDashboardBlocks.push(['clocks_widget', '🕰 Horloges du monde']); if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans.clocks_widget = '6'; }
        if (app.dashboardWidgetInfo && !app.dashboardWidgetInfo.clocks_widget) app.dashboardWidgetInfo.clocks_widget = 'L’heure qu’il est dans les villes de ton choix, comparée à l’heure d’ici : aiguilles ou chiffres, cadran, couleurs, tout se règle.';
        return true;
    };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg);
    ext.horloges = {...api, PALETTES, colorPrefs, offColor, colorsDialog, mine, styleOf, clocksHtml, mapHtml, layoutMap, compareHtml, addDialog, styleDialog, render, HERE};
    if (!document.getElementById('hz-css')) { const s = document.createElement('style'); s.id = 'hz-css'; s.textContent = `
.hz-views{margin:0 0 14px}.hz-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.hz-item{border:2px solid var(--ink,#111);background:var(--surface,#fff);padding:10px;display:grid;gap:6px}.hz-item-act{display:flex;gap:4px;justify-content:flex-end}
.hz-set{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;background:var(--hz-bg,#fff);padding:12px;border-radius:6px}.hz-set.hz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(var(--hz-size,120px) + 30px),1fr))}.hz-set.hz-list{flex-direction:column;align-items:stretch}
.hz-set.hz-list .hz-clock{display:grid;grid-template-columns:auto 1fr auto;align-items:center;text-align:left;gap:4px 12px}.hz-set.hz-list .hz-dial{grid-row:span 2}
.hz-clock{display:grid;justify-items:center;text-align:center;gap:2px;color:var(--hz-text,#111);min-width:0}
.hz-dial{width:var(--hz-size,120px);height:var(--hz-size,120px)}.hz-dial svg{width:100%;height:100%;display:block}
.hz-digi{font-size:calc(var(--hz-size,120px) * .24);font-weight:700;letter-spacing:.03em;font-variant-numeric:tabular-nums;line-height:1.1}
.hz-name{font-weight:700;font-size:14px}.hz-sub{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;font-size:12px;opacity:.75}
.hz-cmp{border-collapse:collapse;font-size:12.5px;width:100%;min-width:760px}.hz-cmp th,.hz-cmp td{border:1px solid var(--line,#e4e6ea);padding:4px 3px;text-align:center}.hz-cmp thead th{cursor:pointer}.hz-cmp tbody th{text-align:left;white-space:nowrap}.hz-cmp tbody th small{display:block;color:var(--muted,#666);font-weight:400}
.hz-cmp .hz-day{background:#e2f0cb}.hz-cmp .hz-mid{background:#fff1d6}.hz-cmp .hz-nite{background:#d9dde6;color:#555}.hz-cmp .is-on{outline:2px solid var(--accent,#055dff);outline-offset:-2px;font-weight:800}
.hz-body{overflow-x:auto}.hz-map{width:100%;height:auto;display:block;border:2px solid var(--ink,#111)}.hz-sea{fill:#dfe8ee}.hz-b1{fill:rgba(5,93,255,.05)}.hz-b2{fill:rgba(5,93,255,.11)}.hz-bl{font:10px system-ui;fill:#335;text-anchor:middle}
.hz-land path{fill:#f1eee6;stroke:#b9b2a2;stroke-width:.4}.hz-map.is-real .hz-land path{stroke:#ffffff;stroke-width:.35}.hz-mapmode{margin:0 0 8px}
.hz-legend{display:flex;flex-wrap:wrap;gap:4px 10px;margin:6px 0 0;font-size:12px;align-items:center}.hz-leg{display:inline-flex;align-items:center;gap:4px;border:0;background:none;padding:2px;cursor:pointer;font:inherit;color:inherit;min-height:0}.hz-leg:hover{outline:1.5px solid var(--accent,#055dff)}
.hz-colors{width:min(900px,96vw)}.hz-pals{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}.hz-pal{display:grid;gap:4px;text-align:left;border:2px solid var(--line,#c9ced8);background:var(--surface,#fff);padding:6px 8px;cursor:pointer;font:600 13px system-ui}.hz-pal.is-on{border-color:var(--accent,#055dff);box-shadow:inset 0 0 0 1px var(--accent,#055dff)}
.hz-pal-sw{display:flex;height:14px}.hz-pal-sw i{flex:1}.hz-offs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}.hz-off{display:flex;align-items:center;gap:6px;font-size:13px;border:1px solid var(--line,#e4e6ea);padding:3px 6px}.hz-off.is-used{font-weight:800}.hz-off.is-own{border-color:var(--accent,#055dff)}.hz-off input{width:34px;height:24px;padding:0}.hz-atlas{display:flex;gap:8px;align-items:center}.hz-legend i{width:14px;height:10px;display:inline-block;border:1px solid rgba(0,0,0,.2)}.hz-night{fill:rgba(20,25,45,.32)}.hz-dot{cursor:default;outline:none}.hz-dot circle{fill:#c0392b;stroke:#fff;stroke-width:1.5px;vector-effect:non-scaling-stroke}.hz-dot.is-hl circle,.hz-dot:focus-visible circle{stroke:var(--accent,#055dff);stroke-width:3px}
.hz-lab rect{fill:rgba(255,255,255,.93);stroke:rgba(17,17,17,.35);stroke-width:1px;vector-effect:non-scaling-stroke}.hz-lab text{font-family:system-ui,sans-serif;font-weight:600;fill:#111;text-anchor:middle;dominant-baseline:central}
.hz-lab.is-hl rect{fill:#fff;stroke:var(--accent,#055dff);stroke-width:2px}.hz-leader{stroke:#333;stroke-width:1px;vector-effect:non-scaling-stroke;opacity:.8}.hz-leader.is-hl{stroke:var(--accent,#055dff);stroke-width:2px;opacity:1}
.hz-citykey{list-style:none;padding:0;margin:6px 0 0;display:flex;flex-wrap:wrap;gap:4px 12px;font-size:13px}.hz-citykey[hidden]{display:none}.hz-citykey li{display:inline-flex;align-items:center;gap:5px}.hz-citykey b{display:inline-grid;place-items:center;min-width:18px;height:18px;border:1px solid rgba(17,17,17,.35);border-radius:4px;font-size:11px;background:#fff}.hz-citykey li.is-hl b{border-color:var(--accent,#055dff);outline:1px solid var(--accent,#055dff)}
.hz-note{font-size:12.5px;margin:6px 0 0}
.hz-who{margin:10px 0 0;border:2px solid var(--ink,#111);background:var(--surface,#fff);padding:8px 12px}.hz-who summary{cursor:pointer;font-weight:800}.hz-who-q{width:100%;margin:8px 0}
.hz-who-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:6px 18px;max-height:420px;overflow:auto}.hz-who-list h4{margin:6px 0 2px;display:flex;align-items:center;gap:6px;font-size:13px}.hz-who-list h4 i{width:14px;height:10px;border:1px solid rgba(0,0,0,.2)}.hz-who-list p{margin:0;font-size:12.5px;line-height:1.45}
.hz-who-list span[hidden]{display:none}.hz-who-list p span:not([hidden]) ~ span:not([hidden])::before{content:", "}
.hz-add{width:min(620px,96vw)}.hz-add [data-hz-q]{width:100%}.hz-res{list-style:none;padding:0;margin:8px 0;max-height:46vh;overflow:auto}.hz-pick{display:block;width:100%;text-align:left;padding:6px 8px;border:0;border-bottom:1px solid var(--line,#e4e6ea);background:none;cursor:pointer}.hz-pick:hover{background:var(--surface-2,#f4f5f7)}
.hz-style{width:min(980px,96vw)}.hz-sgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.hz-sform{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.hz-sform label{display:grid;gap:3px;font-size:13px}.hz-sform .ui-toggle{display:flex}
.hz-col input{width:60px;height:30px}.hz-presets{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.hz-prev{border:2px dashed var(--line,#c9ced8);padding:10px;align-self:start}
.hz-wcities{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0}
@media (max-width:760px){.hz-sgrid{grid-template-columns:1fr}.hz-sform{grid-template-columns:1fr}}
`; document.head.appendChild(s); }
})(typeof window !== 'undefined' ? window : null);
