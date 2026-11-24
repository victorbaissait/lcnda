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
        ['Dakar', 'Africa/Dakar', 'Sénégal', 14.72, -17.47], ['Saint-Louis du Sénégal', 'Africa/Dakar', 'Sénégal', 16.03, -16.49], ['Bamako', 'Africa/Bamako', 'Mali', 12.64, -8], ['Abidjan', 'Africa/Abidjan', 'Côte d’Ivoire', 5.36, -4.01],
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
    const api = {CITIES, partsAt, offsetOf, sunUp, clockSvg, SET};
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

    /* ── 🗺 la carte des fuseaux : bandes de 15°, la nuit en grisé, les villes ── */
    async function mapHtml(cities, t = Date.now()) {
        const W = 960, H = 470, X = lon => (lon + 180) / 360 * W, Y = lat => (90 - lat) / 180 * H;
        let land = '';
        try { const G = await ext.diagramCartes?.load('monde-50m'); land = (G?.zones || []).map(z => `<path d="${z.polys.map(pp => pp.map(r => { let s = ''; for (let i = 0; i < r.length; i += 2) s += (i ? 'L' : 'M') + X(r[i]).toFixed(1) + ' ' + Y(r[i + 1]).toFixed(1); return s + 'Z'; }).join('')).join('')}"/>`).join(''); } catch (_) {}
        const bands = Array.from({length: 25}, (_, i) => { const x0 = X(-187.5 + i * 15), off = i - 12; return `<rect x="${x0.toFixed(1)}" y="0" width="${(W / 24).toFixed(1)}" height="${H}" class="${i % 2 ? 'hz-b1' : 'hz-b2'}"/><text x="${Math.min(W - 10, Math.max(10, x0 + W / 48)).toFixed(1)}" y="14" class="hz-bl">${off > 0 ? '+' : ''}${off}</text>`; }).join('');
        // la nuit : chaque colonne de 2°, du haut au bas, là où le soleil est couché
        let night = ''; for (let lon = -180; lon < 180; lon += 2) { let y0 = null; for (let lat = 88; lat >= -90; lat -= 2) { const n = sunUp(lat, lon + 1, t) === false; if (n && y0 === null) y0 = lat; if ((!n || lat === -90) && y0 !== null) { night += `M${X(lon).toFixed(1)} ${Y(y0).toFixed(1)}h${(W / 180 + .8).toFixed(1)}V${Y(n ? lat - 2 : lat).toFixed(1)}h-${(W / 180 + .8).toFixed(1)}Z`; y0 = null; } } }
        const dots = cities.filter(c => Number.isFinite(c.lat)).map(c => { const p = partsAt(c.tz, t); return `<g class="hz-dot"><circle cx="${X(c.lon).toFixed(1)}" cy="${Y(c.lat).toFixed(1)}" r="4"/><text x="${(X(c.lon) + (X(c.lon) > W - 150 ? -6 : 6)).toFixed(1)}" y="${(Y(c.lat) + 4).toFixed(1)}" text-anchor="${X(c.lon) > W - 150 ? 'end' : 'start'}">${esc(c.name)} ${pad(p.h)}:${pad(p.mi)}</text></g>`; }).join('');
        return `<svg viewBox="0 0 ${W} ${H}" class="hz-map" role="img" aria-label="${esc(T('Carte des fuseaux horaires'))}"><rect width="${W}" height="${H}" class="hz-sea"/>${bands}<g class="hz-land">${land}</g><path class="hz-night" d="${night}"/>${dots}</svg>
            <p class="muted hz-note">${esc(T('Les bandes montrent les fuseaux théoriques (15° chacun) ; l’heure réelle de chaque pays peut en différer (heure légale, heure d’été).'))}</p>`;
    }

    /* ── 🔁 comparer : à telle heure ici, quelle heure ailleurs ── */
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
        ws.innerHTML = `<section class="page hz-page">${A().pageHeader ? '' : ''}<div class="page-header"><div><span class="eyebrow">${esc(T('Listes'))}</span><h1>🕰 ${esc(T('Heures du monde'))}</h1>
            <p class="muted">${esc(T('Ici ({z}) : il est {h}.', {z: HERE, h: `${pad(here.h)}:${pad(here.mi)}`}))}</p></div>
            <div class="page-actions"><button type="button" class="button" data-hz-add>＋ ${esc(T('Ajouter une ville'))}</button><button type="button" class="button secondary" data-hz-style-open>🎨 ${esc(T('Style des horloges'))}</button></div></div>
            <div class="segmented hz-views" role="tablist">${views.map(([k, l]) => `<button type="button" class="${view === k ? 'is-active' : ''}" data-hz-view="${k}" aria-pressed="${view === k}">${esc(l)}</button>`).join('')}</div>
            <div class="hz-body" data-hz-body>${body}</div></section>`;
        startTick();
        const again = () => render(A().state?.workspaceToken);
        ws.querySelector('.hz-page').addEventListener('click', e => {
            const v = e.target.closest('[data-hz-view]'); if (v) { ls.set(VIEW_KEY, v.dataset.hzView); return again(); }
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
    ext.dashboard.clocks_widget = {load: () => Promise.resolve(null), render: (index, widget) => {
        const c = widget?.config || {}, all = mine(), list = Array.isArray(c.cities) ? all.filter(x => c.cities.includes(x.id)) : all, st = styleOf(widget);
        const html = list.length ? clocksHtml(list, st) : `<p class="empty-line">${esc(T('Aucune ville : ajoute-en dans Listes → Heures du monde.'))}</p>`;
        return A().card(index, `🕰 ${T('Horloges du monde')}`, '', html + `<p><button type="button" class="link-button" data-h-open-list="world_clocks">↗ ${esc(T('Heures du monde'))}</button></p>`);
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
    ext.horloges = {...api, mine, styleOf, clocksHtml, mapHtml, compareHtml, addDialog, styleDialog, render, HERE};
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
.hz-land path{fill:#f1eee6;stroke:#b9b2a2;stroke-width:.4}.hz-night{fill:rgba(20,25,45,.32)}.hz-dot circle{fill:#c0392b;stroke:#fff;stroke-width:1.5}.hz-dot text{font:600 11px system-ui;fill:#111;paint-order:stroke;stroke:#fff;stroke-width:3px}
.hz-note{font-size:12.5px;margin:6px 0 0}
.hz-add{width:min(620px,96vw)}.hz-add [data-hz-q]{width:100%}.hz-res{list-style:none;padding:0;margin:8px 0;max-height:46vh;overflow:auto}.hz-pick{display:block;width:100%;text-align:left;padding:6px 8px;border:0;border-bottom:1px solid var(--line,#e4e6ea);background:none;cursor:pointer}.hz-pick:hover{background:var(--surface-2,#f4f5f7)}
.hz-style{width:min(980px,96vw)}.hz-sgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.hz-sform{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.hz-sform label{display:grid;gap:3px;font-size:13px}.hz-sform .ui-toggle{display:flex}
.hz-col input{width:60px;height:30px}.hz-presets{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.hz-prev{border:2px dashed var(--line,#c9ced8);padding:10px;align-self:start}
.hz-wcities{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0}
@media (max-width:760px){.hz-sgrid{grid-template-columns:1fr}.hz-sform{grid-template-columns:1fr}}
`; document.head.appendChild(s); }
})(typeof window !== 'undefined' ? window : null);
