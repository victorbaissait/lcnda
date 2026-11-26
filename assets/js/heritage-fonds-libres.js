/**
 * LCNDA — 🗺 Fonds de carte libres (en plus de ceux de l'app), choisis par l'utilisateur, licences lues le 2026-11-25.
 * Chaque fond : un nom, un aperçu (Réglages), l'attribution exacte écrite SUR la carte, sa licence et « ↗ source » dans
 * Réglages → Cartes et fonds de carte → « Fonds de carte libres » (À propos des données). Ils arrivent dans TOUS les menus
 * « Fond » (Carte, Superposition, cartes des diagrammes, carte vectorielle, fiche lieu, photos…) par le registre commun d'app.js :
 *   window.LCNDA_EXT.mapBackgrounds = {clé: {label, url(z,x,y), …}}   (adresse d'une tuile, '' = fond de secours)
 *   window.LCNDA_EXT.tileCategories = [{id, label, items:[[clé, nom]]}]
 *   window.LCNDA_EXT.tileHiddenByDefault() → les fonds masqués au départ (Esri : pas une carte libre)
 *   window.LCNDA_EXT.fondsLibres = {FONDS, ESRI_KEYS, attributionOf, sourcesOf, esriShown, setEsriShown, about}
 * Esri (server.arcgisonline.com) : gardé en option, MASQUÉ au départ (« genealogie-fonds-esri » = '1' pour le montrer) ;
 * un fond Esri déjà choisi reste choisi (le menu garde toujours le fond en cours) avec l'avertissement sur la carte.
 * Hors ligne : la carte du monde Natural Earth (domaine public) est dessinée sous les communes (lib/offline_map.php).
 * Rien n'est envoyé d'autre que les tuiles de carte habituelles (aucun nom, aucune personne). Pas de téléchargement en masse :
 * seulement les tuiles affichées (et une tuile d'aperçu, quand on clique « 👁 Aperçu »).
 * Essai : tests/test-fonds-carte-libres.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    const READ = '2026-11-25';
    const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // tuile vide (couche à superposer hors de sa zone)

    /* ───── adresses ───── */
    const lonOf = (x, z) => (x + 0.5) / 2 ** z * 360 - 180;
    const latOf = (y, z) => { const n = Math.PI - 2 * Math.PI * (y + 0.5) / 2 ** z; return 180 / Math.PI * Math.atan(Math.sinh(n)); };
    const inBox = (x, y, z, [w, s, e, n]) => { const lo = lonOf(x, z), la = latOf(y, z); return lo >= w && lo <= e && la >= s && la <= n; };
    /** une tuile WMTS de la Géoplateforme (data.geopf.fr), d'après sa fiche GetCapabilities (couche, style, jeu de tuiles, format) */
    const geopf = (layer, style, tms, fmt, z, x, y) => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=${style}&TILEMATRIXSET=${tms}&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=${fmt}`;
    /** le cadre d'une tuile en Web Mercator (EPSG:3857), pour un WMS */
    const bbox3857 = (z, x, y) => { const R = 20037508.342789244, s = 2 * R / 2 ** z; return [-R + x * s, R - (y + 1) * s, -R + (x + 1) * s, R - y * s].map(v => v.toFixed(2)).join(','); };
    const FR = [-5.5, 41.2, 9.8, 51.3], ES = [-9.6, 35.8, 4.4, 43.9], AT = [8.78, 46.35, 17.19, 49.04];

    /* ───── les fonds (licence lue sur la page officielle ou dans la fiche de métadonnées du service, le 2026-11-25) ───── */
    const LO = {licence: 'Licence Ouverte / Open Licence 2.0 (Etalab)', licenceUrl: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/'};
    const FONDS = [
        {key: 'ign_relief', cat: 'calques', label: 'Relief ombré (IGN, à superposer)', overlay: true, where: 'France et outre-mer', preview: [45.9, 6.9, 10],
            url: (z, x, y) => z > 15 ? BLANK : geopf('ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', 'estompage_grayscale', 'PM_0_15', 'image/png', z, x, y),
            attr: '© IGN — Géoplateforme, estompage (BD ALTI®) · Licence Ouverte 2.0', ...LO, source: 'https://cartes.gouv.fr/rechercher-une-donnee/dataset/IGNF_BD-ALTI', sourceLabel: 'cartes.gouv.fr — BD ALTI® (estompage)'},
        {key: 'ign_limites', cat: 'calques', label: 'Limites des communes et départements (IGN, à superposer)', overlay: true, where: 'France et outre-mer', preview: [45.75, 4.85, 10],
            url: (z, x, y) => z < 6 || z > 16 ? BLANK : geopf('LIMITES_ADMINISTRATIVES_EXPRESS.LATEST', 'normal', 'PM_6_16', 'image/png', z, x, y),
            attr: '© IGN — Géoplateforme, ADMIN EXPRESS · Licence Ouverte 2.0', ...LO, source: 'https://cartes.gouv.fr/rechercher-une-donnee/dataset/IGNF_ADMIN-EXPRESS', sourceLabel: 'cartes.gouv.fr — ADMIN EXPRESS'},
        {key: 'orm_rail', cat: 'calques', label: 'Chemins de fer (OpenRailwayMap, à superposer)', overlay: true, where: 'Monde', preview: [48.85, 2.35, 10],
            url: (z, x, y) => z > 19 ? BLANK : `https://tiles.openrailwaymap.org/standard/${z}/${x}/${y}.png`,
            attr: 'Données © contributeurs OpenStreetMap (ODbL) · style © OpenRailwayMap (CC BY-SA)', licence: 'Données : ODbL 1.0 (OpenStreetMap) ; style des tuiles : CC BY-SA. Usage : application gratuite et publique, pas de téléchargement en masse.',
            licenceUrl: 'https://wiki.openstreetmap.org/wiki/OpenRailwayMap/API', source: 'https://www.openrailwaymap.org/', sourceLabel: 'openrailwaymap.org'},
        {key: 'ign_ortho_2000', cat: 'libres_fr', label: 'Photos aériennes 2000-2005 (IGN)', where: 'France et outre-mer', preview: [48.85, 2.35, 13],
            url: (z, x, y) => z < 6 || z > 18 ? '' : geopf('ORTHOIMAGERY.ORTHOPHOTOS2000-2005', 'normal', 'PM_6_18', 'image/jpeg', z, x, y),
            attr: '© IGN — Géoplateforme, BD ORTHO® 2000-2005 · Licence Ouverte 2.0', ...LO, source: 'https://cartes.gouv.fr/rechercher-une-donnee/dataset/IGNF_BD-ORTHO', sourceLabel: 'cartes.gouv.fr — BD ORTHO®'},
        {key: 'ign_ortho_2006', cat: 'libres_fr', label: 'Photos aériennes 2006-2010 (IGN)', where: 'France et outre-mer', preview: [48.85, 2.35, 13],
            url: (z, x, y) => z < 6 || z > 18 ? '' : geopf('ORTHOIMAGERY.ORTHOPHOTOS2006-2010', 'normal', 'PM_6_18', 'image/jpeg', z, x, y),
            attr: '© IGN — Géoplateforme, BD ORTHO® 2006-2010 · Licence Ouverte 2.0', ...LO, source: 'https://cartes.gouv.fr/rechercher-une-donnee/dataset/IGNF_BD-ORTHO', sourceLabel: 'cartes.gouv.fr — BD ORTHO®'},
        {key: 'brgm_geol', cat: 'libres_fr', label: 'Carte géologique (BRGM)', where: 'France', preview: [45.75, 4.85, 11],
            // au 1/1 000 000 de loin, au 1/250 000 entre 9 et 11, au 1/50 000 de près (zoom 15 au plus)
            url: (z, x, y) => z <= 8 ? geopf('BRGM_SCAN_F_GEOL1M', 'normal', 'PM_0_11', 'image/jpeg', z, x, y) : z <= 11 ? geopf('BRGM_SCAN_F_GEOL250', 'normal', 'PM_0_14', 'image/jpeg', z, x, y)
                : z <= 15 ? geopf('BRGM_SCAN_D_GEOL50', 'normal', 'PM_0_15', 'image/jpeg', z, x, y) : '',
            attr: '© BRGM — cartes géologiques (Géoplateforme) · Licence Ouverte 2.0', ...LO, source: 'https://cartes.gouv.fr/rechercher-une-donnee/dataset/BRGM_CARTES-GEOLOGIQUES', sourceLabel: 'cartes.gouv.fr — Cartes géologiques du BRGM'},
        {key: 'topplus', cat: 'libres_europe', label: 'TopPlusOpen (Allemagne et Europe, BKG)', where: 'Allemagne (détaillée), Europe et monde', preview: [50.94, 6.96, 11],
            url: (z, x, y) => z > 18 ? '' : `https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/${z}/${y}/${x}.png`,
            attr: () => `© BKG (${new Date().getFullYear()}) dl-de/by-2-0 · Datenquellen : sgx.geodatenzentrum.de`, attrUrl: 'https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_topplusopen.html',
            licence: 'Datenlizenz Deutschland – Namensnennung – 2.0 (dl-de/by-2-0)', licenceUrl: 'https://www.govdata.de/dl-de/by-2-0',
            source: 'https://sg.geodatenzentrum.de/web_public/gdz/lizenz/deu/nutzungsbedingungen_topplusopen.pdf', sourceLabel: 'BKG — conditions d’utilisation de TopPlusOpen'},
        {key: 'basemap_at', cat: 'libres_europe', label: 'basemap.at (Autriche)', where: 'Autriche', preview: [48.21, 16.37, 12],
            url: (z, x, y) => z > 19 || !inBox(x, y, z, AT) ? '' : `https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/${z}/${y}/${x}.png`,
            attr: 'Datenquelle : basemap.at (CC BY 4.0)', attrUrl: 'https://basemap.at/', licence: 'CC BY 4.0 (Open Government Data Österreich)', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/deed.fr',
            source: 'https://basemap.at/', sourceLabel: 'basemap.at'},
        {key: 'ign_es_minutas', cat: 'ign_es', label: 'Minutes cartographiques (Espagne, 1870-1950, IGN)', where: 'Espagne', preview: [40.42, -3.70, 12],
            url: (z, x, y) => z < 6 || !inBox(x, y, z, ES) ? '' : `https://www.ign.es/wms/minutas-cartograficas?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Minutas&STYLES=&CRS=EPSG:3857&BBOX=${bbox3857(z, x, y)}&WIDTH=256&HEIGHT=256&FORMAT=image/png`,
            attr: '© Instituto Geográfico Nacional de España — CC BY 4.0 ign.es', attrUrl: 'https://www.ign.es/web/politica-datos', licence: 'CC BY 4.0 (IGN España)', licenceUrl: 'https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf',
            source: 'https://www.idee.es/csw-inspire-idee/static/api/records/spaignwms_primera-edicion-mtn', sourceLabel: 'IDEE — fiche du service des minutes du MTN'},
        {key: 'nasa_bluemarble', cat: 'nasa', label: 'Blue Marble — relief et fonds marins (NASA)', where: 'Monde (zoom 8 au plus)', preview: [46, 2, 4],
            url: (z, x, y) => z > 8 ? '' : `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default//GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpg`,
            attr: 'Imagerie NASA Blue Marble — services GIBS de la NASA (ESDIS) · domaine public', attrUrl: 'https://www.earthdata.nasa.gov/gibs',
            licence: 'Domaine public (données de la NASA, sans restriction d’usage ; citation demandée)', licenceUrl: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api',
            source: 'https://www.earthdata.nasa.gov/gibs', sourceLabel: 'NASA Earthdata — GIBS'},
    ];
    const CATS = [
        {id: 'calques', label: 'Couches à superposer (mode Superposition)'},
        {id: 'libres_fr', label: 'France — IGN et BRGM en plus (Licence Ouverte)'},
        {id: 'libres_europe', label: 'Europe — fonds libres'},
    ];
    // déjà dans l'app : on ne fait qu'ajouter leur attribution et leur licence (lues aussi le 2026-11-25)
    const EXISTING = [
        {keys: ['swisstopo_dufour', 'swisstopo_siegfried', 'swisstopo'], label: 'Swisstopo — Carte Dufour, Carte Siegfried, carte nationale', where: 'Suisse',
            attr: '© swisstopo', licence: 'Géodonnées gratuites de swisstopo (OGD) : usage libre, même commercial, en citant la source', licenceUrl: 'https://www.swisstopo.admin.ch/fr/conditions-geodonnees', source: 'https://www.geo.admin.ch/fr/conditions-generales-dutilisation-fsdi', sourceLabel: 'geo.admin.ch — conditions d’utilisation'},
        {keys: ['nls_6inch', 'nls_natgrid', 'nls_25inch', 'nls_1inch', 'gsgs3906', 'london_1940s'], label: 'Cartes anciennes de la National Library of Scotland', where: 'Écosse, Angleterre, Pays de Galles',
            attr: 'Cartes : National Library of Scotland (CC BY)', licence: 'CC BY (calques géoréférencés de la NLS) ; attribution à la NLS avec un lien', licenceUrl: 'https://www.nls.uk/copyright', source: 'https://maps.nls.uk/', sourceLabel: 'maps.nls.uk'},
        {keys: ['usgs_topo', 'usgs_imagery'], label: 'USGS — The National Map (topographie et images actuelles)', where: 'États-Unis',
            attr: 'USGS The National Map · domaine public', licence: 'Domaine public (gouvernement fédéral des États-Unis)', licenceUrl: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits', source: 'https://www.usgs.gov/programs/national-geospatial-program/national-map', sourceLabel: 'usgs.gov — The National Map'},
        {keys: ['offline'], label: 'Hors ligne : carte du monde Natural Earth + contours des communes', where: 'Monde, sans Internet',
            attr: 'Made with Natural Earth (domaine public) · communes : contours de ta base', licence: 'Domaine public (Natural Earth 4.1.0, 1:50 m, via world-atlas 2.0.2, licence ISC)', licenceUrl: 'https://www.naturalearthdata.com/about/terms-of-use/', source: 'https://www.naturalearthdata.com/', sourceLabel: 'naturalearthdata.com'},
    ];
    const ESRI_KEYS = ['light', 'minimal', 'roads', 'dark', 'satellite', 'esri_topo', 'esri_street', 'esri_ocean', 'esri_natgeo', 'esri_physical', 'esri_relief'];
    const ESRI_TERMS = 'https://www.esri.com/en-us/legal/terms/full-master-agreement';
    // refusés comme fonds (licence pas assez claire, service non officiel ou adresse invérifiable) : un lien seulement
    const LINKS_ONLY = [
        {label: 'Topotijdreis — 200 ans de cartes des Pays-Bas (Kadaster)', url: 'https://www.topotijdreis.nl/', why: 'aucune licence ouverte trouvée pour ces tuiles (servies par Esri/ArcGIS Online) : lien seulement'},
        {label: 'Geoportail Luxembourg — cartes et photos anciennes', url: 'https://map.geoportail.lu/', why: 'le service « opendata » est en CC0, mais le nom des couches anciennes n’a pas pu être vérifié (site non joignable d’ici) : lien seulement'},
        {label: 'USGS topoView — cartes topographiques anciennes des États-Unis (1884-2006)', url: 'https://ngmdb.usgs.gov/topoview/', why: 'domaine public, mais pas de service de tuiles officiel de l’USGS (celui qui existe est hébergé par Esri) : lien seulement'},
        {label: 'Sentinel-2 cloudless (EOX)', url: 'https://s2maps.eu/', why: 'l’image 2016 est en CC BY 4.0, mais le service de tuiles d’EOX n’est gratuit que pour un usage non commercial et le nom de la couche 2016 n’a pas pu être vérifié : pas ajouté'},
    ];

    /* ───── esri : masqué au départ ───── */
    const ESRI_KEY = 'genealogie-fonds-esri';
    const esriShown = () => { try { return localStorage.getItem(ESRI_KEY) === '1'; } catch (_) { return false; } };
    function setEsriShown(on) {
        const before = {flag: (() => { try { return localStorage.getItem(ESRI_KEY); } catch (_) { return null; } })(), hidden: (() => { try { return localStorage.getItem('genealogie-tile-hidden'); } catch (_) { return null; } })()};
        try {
            localStorage.setItem(ESRI_KEY, on ? '1' : '0');
            if (on) { const h = JSON.parse(localStorage.getItem('genealogie-tile-hidden') || '[]'); if (Array.isArray(h)) localStorage.setItem('genealogie-tile-hidden', JSON.stringify(h.filter(k => !ESRI_KEYS.includes(k)))); }
        } catch (_) {}
        return () => { try { before.flag === null ? localStorage.removeItem(ESRI_KEY) : localStorage.setItem(ESRI_KEY, before.flag); before.hidden === null ? localStorage.removeItem('genealogie-tile-hidden') : localStorage.setItem('genealogie-tile-hidden', before.hidden); } catch (_) {} };
    }

    /* ───── branchement dans le registre commun ───── */
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    ext.mapBackgrounds = ext.mapBackgrounds || {};
    FONDS.forEach(f => { ext.mapBackgrounds[f.key] = {label: f.label, url: f.url, overlay: !!f.overlay}; });
    ext.tileCategories = ext.tileCategories || [];
    CATS.forEach(c => { if (!ext.tileCategories.some(x => x.id === c.id)) ext.tileCategories.push({id: c.id, label: c.label, items: FONDS.filter(f => f.cat === c.id).map(f => [f.key, f.label])}); });
    // l'Espagne et la NASA : dans les catégories de l'app du même nom (app.js y ajoute les fonds qui manquent)
    ['ign_es', 'nasa'].forEach(id => { const items = FONDS.filter(f => f.cat === id).map(f => [f.key, f.label]); const c = ext.tileCategories.find(x => x.id === id); if (c) items.forEach(it => { if (!c.items.some(([k]) => k === it[0])) c.items.push(it); }); else ext.tileCategories.push({id, label: id, items}); });
    ext.tileHiddenByDefault = () => (esriShown() ? [] : ESRI_KEYS);

    /* ───── attribution d'après l'adresse des tuiles ───── */
    const SOURCES = [
        [/data\.geopf\.fr\/wmts\?.*LAYER=BRGM_/, 'brgm_geol'], [/LAYER=ELEVATION\.ELEVATIONGRIDCOVERAGE\.SHADOW/, 'ign_relief'], [/LAYER=LIMITES_ADMINISTRATIVES/, 'ign_limites'],
        [/LAYER=ORTHOIMAGERY\.ORTHOPHOTOS2000-2005/, 'ign_ortho_2000'], [/LAYER=ORTHOIMAGERY\.ORTHOPHOTOS2006-2010/, 'ign_ortho_2006'],
        [/data\.geopf\.fr\//, 'ign'], [/server\.arcgisonline\.com\//, 'esri'], [/sgx\.geodatenzentrum\.de\/wmts_topplus_open/, 'topplus'], [/mapsneu\.wien\.gv\.at\/basemap\//, 'basemap_at'],
        [/www\.ign\.es\/wms\/minutas-cartograficas/, 'ign_es_minutas'], [/www\.ign\.es\//, 'ign_es'], [/tiles\.openrailwaymap\.org\//, 'orm_rail'], [/gibs\.earthdata\.nasa\.gov\/.*BlueMarble/, 'nasa_bluemarble'],
        [/gibs\.earthdata\.nasa\.gov\//, 'nasa'], [/wmts\.geo\.admin\.ch\//, 'swisstopo'], [/mapseries-tilesets\.s3\.amazonaws\.com\//, 'nls'], [/basemap\.nationalmap\.gov\//, 'usgs'],
        [/action=offline_tile/, 'offline'], [/opentopomap\.org\//, 'otm'], [/(^|\/\/)([a-c]\.)?tile[^/]*\.openstreetmap\.(org|fr|de)\/|openhistoricalmap\.org\//, 'osm'],
    ];
    const OTHER_ATTR = {
        ign: ['© IGN — Géoplateforme · Licence Ouverte 2.0', 'https://cartes.gouv.fr/cgu'],
        esri: ['© Esri et ses fournisseurs — conditions d’utilisation d’Esri : usage limité, pas une carte libre', ESRI_TERMS, true],
        ign_es: ['© Instituto Geográfico Nacional de España — CC BY 4.0 ign.es', 'https://www.ign.es/web/politica-datos'],
        nasa: ['Imagerie NASA — services GIBS (ESDIS) · domaine public', 'https://www.earthdata.nasa.gov/gibs'],
        swisstopo: ['© swisstopo', 'https://www.swisstopo.admin.ch/fr/conditions-geodonnees'],
        nls: ['Cartes : National Library of Scotland (CC BY)', 'https://maps.nls.uk/'],
        usgs: ['USGS The National Map · domaine public', 'https://www.usgs.gov/programs/national-geospatial-program/national-map'],
        offline: ['Made with Natural Earth (domaine public) · communes : contours de ta base', 'https://www.naturalearthdata.com/'],
        otm: ['© contributeurs OpenStreetMap · SRTM · style © OpenTopoMap (CC BY-SA)', 'https://opentopomap.org/about'],
        osm: ['© contributeurs OpenStreetMap', 'https://www.openstreetmap.org/copyright'],
    };
    /** l'attribution d'une source : [texte, lien, avertissement?] */
    function attributionOf(id) {
        const f = FONDS.find(x => x.key === id);
        if (f) return [typeof f.attr === 'function' ? f.attr() : f.attr, f.attrUrl || f.source, false];
        return OTHER_ATTR[id] || null;
    }
    /** les sources d'une liste d'adresses de tuiles (dans l'ordre, sans doublon) */
    function sourcesOf(urls) {
        const out = [];
        (urls || []).forEach(u => { const hit = SOURCES.find(([re]) => re.test(String(u || ''))); if (hit && !out.includes(hit[1])) out.push(hit[1]); });
        return out;
    }
    const attrHtml = ids => ids.map(id => { const a = attributionOf(id); if (!a) return ''; return a[2] ? `<span class="lfc-warn">⚠️ ${link(a[1], a[0] + ' ↗')}</span>` : link(a[1], a[0]); }).filter(Boolean).join(' · ');

    // sur chaque carte : l'attribution exacte des fonds affichés (la légende de la Carte, sinon une petite ligne en bas à droite)
    let scanTimer = 0;
    function scan() {
        scanTimer = 0; if (!root.document) return;
        const byHost = new Map();
        document.querySelectorAll('img[src]').forEach(img => {
            const src = img.getAttribute('src') || ''; if (!/^https:\/\/|action=offline_tile/.test(src)) return;
            const box = img.parentElement; if (!box) return;
            const host = box.closest('.map-stage') || (box.matches('.map-tiles, [class*="tiles"]') ? box.parentElement : box);
            if (!host || host.closest('.uft-dlg, .lfc-panel')) return;
            if (!byHost.has(host)) byHost.set(host, []); byHost.get(host).push(src);
        });
        byHost.forEach((urls, host) => {
            const ids = sourcesOf(urls); if (!ids.length) return;
            const key = ids.join('|'), cap = host.querySelector(':scope > .map-caption');
            if (cap) {
                if (cap.dataset.lfc === key) return;
                if (!cap.dataset.lfcOrig) cap.dataset.lfcOrig = cap.innerHTML;
                cap.innerHTML = attrHtml(ids) + (navigator.onLine === false ? '' : ` · ${esc(T('connexion requise pour les tuiles'))}`); cap.dataset.lfc = key; cap.dataset.lfcSources = key; return;
            }
            if (ids.every(id => id === 'osm')) return; // les cartes de l'app citent déjà OpenStreetMap
            let el = host.querySelector(':scope > .lfc-attr');
            if (!el) { if (getComputedStyle(host).position === 'static') return; el = document.createElement('div'); el.className = 'lfc-attr'; host.appendChild(el); }
            if (el.dataset.lfc === key) return; el.innerHTML = attrHtml(ids); el.dataset.lfc = key; el.dataset.lfcSources = key;
        });
    }
    const later = () => { if (!scanTimer) scanTimer = setTimeout(scan, 250); };

    /* ───── Réglages → Cartes et fonds de carte : « Fonds de carte libres » ───── */
    const sampleTile = ([lat, lon, z]) => { const n = 2 ** z, x = Math.floor((lon + 180) / 360 * n), r = lat * Math.PI / 180; return {z, x, y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)}; };
    const catLabel = id => (CATS.find(c => c.id === id) || {ign_es: {label: 'Espagne (IGN España)'}, nasa: {label: 'NASA (satellite)'}}[id] || {label: id}).label;
    function panelHtml() {
        const row = f => `<tr data-lfc-row="${esc(f.key)}"><td><b>${esc(T(f.label))}</b><br><small class="muted">${esc(T(f.where))} · ${esc(T('menu « {c} »', {c: T(catLabel(f.cat))}))}${f.overlay ? ' · ' + esc(T('à choisir en mode Superposition, transparence réglable')) : ''}</small></td>
            <td><small>${esc(typeof f.attr === 'function' ? f.attr() : f.attr)}</small></td><td>${link(f.licenceUrl, T(f.licence))}</td><td>${link(f.source, '↗ ' + T('source'))}<br><small class="muted">${esc(f.sourceLabel || '')}</small></td>
            <td><button type="button" class="button small secondary" data-lfc-preview="${esc(f.key)}">👁 ${esc(T('Aperçu'))}</button><span class="lfc-prev" data-lfc-prev="${esc(f.key)}"></span></td></tr>`;
        const ex = e => `<tr><td><b>${esc(T(e.label))}</b><br><small class="muted">${esc(T(e.where))} · ${esc(T('déjà dans l’app'))}</small></td><td><small>${esc(e.attr)}</small></td><td>${link(e.licenceUrl, T(e.licence))}</td><td>${link(e.source, '↗ ' + T('source'))}<br><small class="muted">${esc(e.sourceLabel)}</small></td><td></td></tr>`;
        const on = esriShown();
        return `<section class="maintenance-panel lfc-panel" data-lfc-panel><h3>🗺 ${esc(T('Fonds de carte libres'))}</h3>
            <p class="muted">${esc(T('Ces fonds sont dans tous les menus « Fond » (Carte, Superposition, cartes des diagrammes, carte vectorielle, fiche d’un lieu…). L’attribution de chaque fond est écrite sur la carte. Les couches « à superposer » se choisissent en mode Superposition de la Carte, avec la transparence réglable.'))}</p>
            <div class="lfc-esri"><label class="checkbox-line"><input type="checkbox" data-lfc-esri ${on ? 'checked' : ''}><span><b>${esc(T('Montrer les fonds Esri dans les menus'))}</b><br>
                <small class="lfc-warn">⚠️ ${esc(T('Conditions d’utilisation d’Esri : usage limité, pas une carte libre.'))} ${link(ESRI_TERMS, '↗ ' + T('leurs conditions'))}</small><br>
                <small class="muted">${esc(T('Masqués au départ. Un fond Esri déjà choisi reste choisi, avec cet avertissement sur la carte. Équivalents libres pour les photos vues du ciel : « Orthophotos actuelles HD IGN » (France), « Photos aériennes 2000-2005 / 2006-2010 » (IGN), « Orthophotos PNOA » (Espagne), « Blue Marble » et « Landsat » (NASA, monde).'))}</small></span></label></div>
            <h4>${esc(T('À propos des données'))}</h4><p class="muted">${esc(T('Licences lues le {d} sur la page officielle de chaque source (ou dans la fiche de métadonnées du service). Seules les tuiles affichées sont demandées, jamais en masse ; aucun nom ni aucune personne n’est envoyé.', {d: READ}))}</p>
            <div class="cplus-scroll"><table class="data-table lfc-table"><thead><tr><th>${esc(T('Fond'))}</th><th>${esc(T('Attribution sur la carte'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Aperçu'))}</th></tr></thead>
            <tbody>${FONDS.map(row).join('')}${EXISTING.map(ex).join('')}</tbody></table></div>
            <h4>${esc(T('Pas ajoutés comme fonds (seulement un lien)'))}</h4><ul class="hist-ul">${LINKS_ONLY.map(l => `<li>${link(l.url, l.label + ' ↗')}<br><small class="muted">${esc(T(l.why))}</small></li>`).join('')}</ul>
            <p class="muted">${esc(T('Sans Internet, les cartes passent toutes seules au fond « Hors ligne » : la carte du monde Natural Earth (domaine public, livrée avec l’app, 0,4 Mo) et les contours des communes de ta base.'))}</p></section>`;
    }
    function injectPanel() {
        if (!root.document) return;
        const ed = document.querySelector('.tile-layer-editor'); if (!ed || ed.parentElement?.querySelector(':scope > [data-lfc-panel]')) return;
        ed.insertAdjacentHTML('afterend', panelHtml());
    }
    function A() { return root.LCNDA_APP || {}; }
        function refreshMaps() { try { const st = A().state; if (st && st.module === 'carte') A().setModule?.('carte', false); } catch (_) {} }

    if (root.document) {
        document.addEventListener('click', e => {
            const pv = e.target.closest?.('[data-lfc-preview]');
            if (pv) {
                const f = FONDS.find(x => x.key === pv.dataset.lfcPreview), box = document.querySelector(`[data-lfc-prev="${CSS.escape(pv.dataset.lfcPreview)}"]`); if (!f || !box) return;
                const {z, x, y} = sampleTile(f.preview), url = (A().mapTileUrl || ((b, zz, xx, yy) => f.url(zz, xx, yy)))(f.key, z, x, y);
                box.innerHTML = `<img class="lfc-thumb" alt="${esc(T('Aperçu : {n}', {n: T(f.label)}))}" referrerpolicy="no-referrer" src="${esc(url)}"><small class="muted">${esc(typeof f.attr === 'function' ? f.attr() : f.attr)}</small>`;
                return;
            }
            // « Fonds de cartes » enregistré avec un fond Esri coché : on montre Esri (sinon il resterait caché)
            const sv = e.target.closest?.('[data-order-save="tile-layers"]');
            if (sv && !esriShown()) {
                const checked = [...document.querySelectorAll('#tile-cat-order .order-row')].some(r => ESRI_KEYS.includes(r.dataset.orderKey) && r.querySelector('.order-visible input')?.checked);
                if (checked) setEsriShown(true);
            }
        }, true);
        document.addEventListener('change', e => {
            const cb = e.target.closest?.('[data-lfc-esri]'); if (!cb) return;
            const on = cb.checked, undo = setEsriShown(on);
            const redo = () => { try { A().renderDesignTools?.(); } catch (_) {} refreshMaps(); };
            A().undoToast?.(on ? T('Fonds Esri montrés dans les menus (pas des cartes libres).') : T('Fonds Esri masqués dans les menus.'), {icon: '🗺', undo: () => { undo(); redo(); }});
            setTimeout(redo, 0);
        });
        const mo = new MutationObserver(muts => {
            if (muts.some(m => m.type === 'childList' && [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.tile-layer-editor') || n.querySelector?.('.tile-layer-editor'))))) injectPanel();
            later();
        });
        const start = () => { mo.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['src']}); injectPanel(); later(); };
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, {once: true});
        root.addEventListener?.('offline', later); root.addEventListener?.('online', later);
        if (!document.getElementById('lfc-css')) {
            const st = document.createElement('style'); st.id = 'lfc-css'; st.textContent = `
.lfc-attr{position:absolute;right:4px;bottom:4px;z-index:7;max-width:calc(100% - 8px);box-sizing:border-box;font:11px/1.3 system-ui,sans-serif;background:rgba(255,255,255,.82);color:#333;padding:4px 6px;border-radius:3px;pointer-events:auto;text-align:right}
.lfc-attr a,.map-caption a{color:inherit}.lfc-warn,.lfc-warn a{color:#8a4b00;font-weight:600}
.lfc-panel{grid-column:1/-1}.lfc-panel .lfc-esri{border:2px solid var(--line,#c9ced8);padding:8px 10px;margin:8px 0}.lfc-table td{vertical-align:top}.lfc-thumb{display:block;width:96px;height:96px;border:1px solid var(--line,#c9ced8);margin-top:4px;background:#e6ecf0}
`; document.head.appendChild(st);
        }
    }
    function about() { return {read: READ, fonds: FONDS.map(({key, label, licence, licenceUrl, source, attr}) => ({key, label, licence, licenceUrl, source, attr: typeof attr === 'function' ? attr() : attr})), existing: EXISTING, linksOnly: LINKS_ONLY, esri: {keys: ESRI_KEYS, terms: ESRI_TERMS}}; }

    /* ───── « Où chercher » : les cartes qui ne sont qu'en lien ───── */
    function registerOuChercher() {
        const M = root.LCNDA_OUC_MONDE; if (!M || !Array.isArray(M.SITES)) return false;
        const add = s => { if (!M.SITES.some(x => x.key === s.key)) M.SITES.push(s); };
        if (!M.SITES.some(x => x.key === 'l10v_topotijdreis')) add({key: 'lfc_topotijdreis', icon: '🗺', group: 'Monde', label: T('Topotijdreis — 200 ans de cartes des Pays-Bas (Kadaster)'), cats: ['cartes'], period: [1815, 2025], access: 'online', url: () => 'https://www.topotijdreis.nl/',
            rel: {countries: ['nl'], from: 1815, to: 2025, base: 0.4, why: () => T('Les cartes topographiques des Pays-Bas année par année depuis 1815')}});
        add({key: 'lfc_geoportail_lu', icon: '🗺', group: 'Monde', label: T('Geoportail Luxembourg — cartes et photos anciennes'), cats: ['cartes'], period: [1770, 2025], access: 'online', url: () => 'https://map.geoportail.lu/',
            rel: {countries: ['lu'], from: 1770, to: 2025, base: 0.4, why: () => T('Les cartes topographiques et photos aériennes anciennes du Luxembourg, sur le géoportail officiel')}});
        add({key: 'lfc_usgs_topoview', icon: '🗺', group: 'Monde', label: T('USGS topoView — cartes topographiques anciennes des États-Unis'), cats: ['cartes'], period: [1884, 2006], access: 'online', url: () => 'https://ngmdb.usgs.gov/topoview/',
            rel: {countries: ['us'], from: 1880, to: 2006, base: 0.4, why: () => T('Toutes les éditions des cartes topographiques de l’USGS depuis 1884 (domaine public)')}});
        return true;
    }
    if (!registerOuChercher() && root.document) document.addEventListener('DOMContentLoaded', registerOuChercher, {once: true});

    ext.fondsLibres = {FONDS, CATS, EXISTING, ESRI_KEYS, ESRI_TERMS, LINKS_ONLY, attributionOf, sourcesOf, esriShown, setEsriShown, about, scan, panelHtml, registerOuChercher};
    if (typeof module === 'object' && module.exports) module.exports = ext.fondsLibres;
})(typeof window !== 'undefined' ? window : globalThis);
