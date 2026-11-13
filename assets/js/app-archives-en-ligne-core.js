/* LCNDA — 🔍 Archives en ligne : la couche commune à tous les lots « sources ouvertes ». Calculs purs, SANS RÉSEAU
 * (window.LCNDA_ARCHIVES ; aussi require() dans Node pour les tests).
 *
 * Elle ne connaît AUCUNE adresse : elle réunit les registres que chaque lot expose déjà (window.LCNDA_SOURCES_OUVERTES,
 * …_2, …_3, LCNDA_SO4, …_5, …_6, …_7 et la recherche SocFace) en UNE liste de sites, une seule entrée par site :
 *  - LOTS                      chaque lot : son registre, sa clé de réglage (« ⚙️ Adresses des sites ») et ce que son import lit
 *  - ZONES, COUNTRIES, THEMES  rangement : pays (France, Europe, Amériques, Monde), puis thème (soldats, état civil, presse…)
 *  - collect(registres, opt)   → [{id, lot, key, label, icon, country, zone, theme, verified, paid, kind, also: […], …}]
 *  - MERGED                    les doublons entre lots (Minutier, SIV, inscrits maritimes, Maitron, annuaires, SocFace) :
 *                              le site gardé reçoit l'autre en « Aussi : … » (son adresse, sa ligne d'aide)
 *  - store(n, ls) / custom(n, ls) / writeStore(n, valeurs, ls)  les réglages de chaque lot, dans LEUR clé et LEUR forme
 *  - url(entrée, p, ls)        l'adresse remplie par le lot lui-même (avec l'adresse que la personne a écrite)
 *  - outOfTime(entrée, p)      hors de l'époque de la personne (mêmes règles que les lots : années de vie ou de naissance)
 *  - filter(liste, f) / counts(liste, f) / sections(liste)   filtres « Gratuites seulement », C1, pays, thème, focus
 *  - resolve(ids)              un identifiant d'un doublon → celui du site gardé
 *  - detectLink(adresse, registres)  quel lot sait importer un lien collé (ses propres parseLink, sinon le nom du site)
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_ARCHIVES = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
    const FREE_KEY = 'genealogie-sources-gratuites';
    const VIEW_KEY = 'genealogie-archives-en-ligne-vue';
    const CUSTOM_KEY = 'genealogie-web-search-custom';

    /** les lots : registre (global), réglages (clé, forme), import (ce qu'il lit) */
    const LOTS = {
        1: {global: 'LCNDA_SOURCES_OUVERTES', ui: 'sourcesOuvertes', store: 'genealogie-sources-ouvertes-sites', import: '🎖 Mémoire des hommes, Léonore, registre matricule, presse ancienne'},
        2: {global: 'LCNDA_SOURCES_OUVERTES_2', ui: 'sourcesOuvertes2', store: 'genealogie-sources-ouvertes-2-sites', import: '🏛 Naturalisation, notaire, colonies, marin, déportation, Journal officiel, annuaire, patrimoine'},
        3: {global: 'LCNDA_SOURCES_OUVERTES_3', ui: 'sourcesOuvertes3', store: 'genealogie-sources-ouvertes-3-sites', import: '🌍 Prisonnier 14-18, élu, brevet, thèse, acte d’Italie, d’Espagne…, FreeBMD, Open Archives'},
        4: {global: 'LCNDA_SO4', ui: 'sourcesOuvertes4', store: 'genealogie-sources-ouvertes-4-sites', import: '🗿 Monument aux morts, tombe, acte d’Europe, presse étrangère'},
        5: {global: 'LCNDA_SOURCES_OUVERTES_5', ui: 'sourcesOuvertes5', store: 'genealogie-sources-ouvertes-5-sites', import: '🌳 FamilySearch, WikiTree, Québec, passagers, Sainte-Hélène, Maitron, mémoriaux'},
        6: {global: 'LCNDA_SOURCES_OUVERTES_6', ui: 'sourcesOuvertes6', store: 'genealogie-sources-ouvertes-6-sites', import: '📚 Bibliothèque, auteur, HisKi, Old Bailey, notaire de Paris'},
        7: {global: 'LCNDA_SOURCES_OUVERTES_7', ui: 'sourcesOuvertes7', store: 'genealogie-sources-ouvertes-7-sites', format: 'so7', import: '🇪🇺 Archives d’Europe, Juste, enfant assisté, monument, cadastre'},
    };
    const LOT_IDS = [1, 2, 3, 4, 5, 6, 7];
    const STORE_KEYS = LOT_IDS.map(n => LOTS[n].store);
    const prefix = n => (Number(n) === 1 ? 'so_' : `so${n}_`);

    /* ═════ rangement : pays puis thème ═════ */
    const ZONES = [
        {id: 'fr', icon: '🇫🇷', label: 'France'},
        {id: 'eu', icon: '🇪🇺', label: 'Europe'},
        {id: 'am', icon: '🌎', label: 'Amériques'},
        {id: 'monde', icon: '🌍', label: 'Monde'},
    ];
    const COUNTRIES = {
        'France': ['fr', '🇫🇷'], 'Belgique': ['eu', '🇧🇪'], 'Suisse': ['eu', '🇨🇭'], 'Allemagne': ['eu', '🇩🇪'], 'Pays-Bas': ['eu', '🇳🇱'],
        'Italie': ['eu', '🇮🇹'], 'Espagne': ['eu', '🇪🇸'], 'Portugal': ['eu', '🇵🇹'], 'Royaume-Uni': ['eu', '🇬🇧'], 'Irlande': ['eu', '🇮🇪'],
        'Norvège': ['eu', '🇳🇴'], 'Suède': ['eu', '🇸🇪'], 'Danemark': ['eu', '🇩🇰'], 'Finlande': ['eu', '🇫🇮'], 'Pologne': ['eu', '🇵🇱'],
        'Tchéquie': ['eu', '🇨🇿'], 'Hongrie': ['eu', '🇭🇺'], 'Russie': ['eu', '🇷🇺'], 'Europe': ['eu', '🇪🇺'],
        'Canada': ['am', '🇨🇦'], 'États-Unis': ['am', '🇺🇸'],
        'Israël': ['monde', '🇮🇱'], 'Australie': ['monde', '🇦🇺'], 'Nouvelle-Zélande': ['monde', '🇳🇿'], 'Monde': ['monde', '🌍'],
    };
    const THEMES = [
        {id: 'soldats', icon: '🎖', label: 'Soldats et guerres'},
        {id: 'decorations', icon: '🏅', label: 'Décorations'},
        {id: 'memoire', icon: '🕯', label: 'Mémoire (déportés, fusillés, Justes)', respect: true},
        {id: 'registres', icon: '📜', label: 'État civil et registres'},
        {id: 'arbres', icon: '🌳', label: 'Arbres et grandes bases'},
        {id: 'migrations', icon: '🚢', label: 'Émigration et outre-mer'},
        {id: 'mer', icon: '⚓', label: 'Marins'},
        {id: 'notaires', icon: '✒', label: 'Notaires et justice'},
        {id: 'metiers', icon: '🏭', label: 'Métiers, élus, savants'},
        {id: 'presse', icon: '📰', label: 'Presse et Journal officiel'},
        {id: 'livres', icon: '📚', label: 'Livres, bibliothèques, auteurs'},
        {id: 'tombes', icon: '🪦', label: 'Cimetières et monuments'},
        {id: 'lieux', icon: '📍', label: 'Lieux, cartes, patrimoine'},
        {id: 'enfants', icon: '👶', label: 'Enfants assistés'},
        {id: 'photos', icon: '📷', label: 'Photographes'},
        {id: 'mine', icon: '⭐', label: 'Mes sites'},
    ];
    const themeOf = id => THEMES.find(t => t.id === id) || THEMES[THEMES.length - 1];
    /** rubrique d'un lot → pays et thème (« lot:rubrique ») ; une ligne de SITE_META l'emporte pour un site précis (« lot:clé ») */
    const GROUP_META = {
        '1:mdh': ['France', 'soldats'], '1:leonore': ['France', 'decorations'], '1:matricules': ['France', 'soldats'], '1:presse': ['France', 'presse'],
        '2:an': ['France', 'notaires'], '2:anom': ['France', 'migrations'], '2:shd': ['France', 'soldats'], '2:memoire': ['France', 'memoire'],
        '2:jo': ['France', 'presse'], '2:annuaires': ['France', 'metiers'], '2:patrimoine': ['France', 'lieux'], '2:etranger': ['Europe', 'registres'],
        '3:fr_guerre': ['France', 'soldats'], '3:fr_elus': ['France', 'metiers'], '3:fr_savants': ['France', 'metiers'], '3:fr_paris': ['France', 'registres'],
        '3:fr_musees': ['France', 'livres'], '3:sud': ['Europe', 'registres'], '3:nord': ['Europe', 'registres'], '3:uk': ['Royaume-Uni', 'registres'],
        '3:amerique': ['Canada', 'registres'], '3:shoah': ['Monde', 'memoire'],
        '4:fr_guerres': ['France', 'soldats'], '4:fr_cimetieres': ['France', 'tombes'], '4:fr_lieux': ['France', 'lieux'], '4:fr_autres': ['France', 'migrations'],
        '4:europe': ['Europe', 'registres'], '4:presse_etr': ['Monde', 'presse'],
        '5:monde': ['Monde', 'arbres'], '5:quebec': ['Canada', 'migrations'], '5:emigration': ['États-Unis', 'migrations'], '5:fr_service': ['France', 'soldats'],
        '5:fr_travail': ['France', 'metiers'], '5:fr_fonds': ['France', 'livres'], '5:fr_lieux': ['France', 'lieux'], '5:photo': ['France', 'photos'], '5:urss': ['Russie', 'memoire'],
        '6:fr_bn': ['France', 'livres'], '6:fr_auteurs': ['France', 'livres'], '6:fr_mer': ['France', 'mer'], '6:fr_notaires': ['France', 'notaires'],
        '6:fi': ['Finlande', 'registres'], '6:uk': ['Royaume-Uni', 'registres'], '6:payant': ['Monde', 'arbres'],
        '7:europe': ['Europe', 'registres'], '7:fr_memoire': ['France', 'memoire'], '7:fr_enfants': ['France', 'enfants'], '7:fr_cercles': ['France', 'registres'],
        '7:aide': ['Monde', 'lieux'], '7:allemagne': ['Allemagne', 'registres'], '7:centre': ['Europe', 'lieux'], '7:bibliotheque': ['Monde', 'arbres'],
    };
    const SITE_META = {
        '1:europeana': ['Europe', 'presse'], '1:retronews': [null, null, {paid: 'partiel'}],
        '2:an_naturalisation': [null, 'migrations'], '2:shd_marins': [null, 'mer'],
        '2:be_arch': ['Belgique'], '2:ch_canton': ['Suisse'], '2:ellis': ['États-Unis', 'migrations'],
        '3:antenati_nom': ['Italie'], '3:pares': ['Espagne'], '3:torre_tombo': ['Portugal'], '3:openarchives': ['Pays-Bas'], '3:geneteka': ['Pologne'],
        '3:nara': ['États-Unis'], '3:arolsen_fr': ['Allemagne'], '3:yv_justes': ['Israël'], '3:archiveorg_local': ['Monde'], '3:joconde': [null, 'lieux'],
        '4:memorialgenweb': [null, 'tombes'], '4:memorialgenweb_commune': [null, 'tombes'], '4:huguenots': [null, 'migrations'], '4:roles_equipage': [null, 'mer'],
        '4:geopatronyme': [null, 'lieux'], '4:billiongraves': ['Monde'],
        '4:digitalarkivet': ['Norvège'], '4:riksarkivet': ['Suède'], '4:danishfamilysearch': ['Danemark'], '4:irishgenealogy': ['Irlande'],
        '4:portafontium': ['Tchéquie'], '4:hungaricana': ['Hongrie'], '4:jewishgen': ['Monde'],
        '4:chroniclingamerica': ['États-Unis'], '4:trove': ['Australie'], '4:paperspast': ['Nouvelle-Zélande'], '4:delpher': ['Pays-Bas'],
        '5:sainte_helene': [null, 'decorations'], '5:consulaire_nantes': [null, 'registres'], '5:pamyat_naroda': [null, 'soldats'],
        '6:oldbailey': [null, 'notaires'], '6:filae': ['France'], '6:geneanet_premium': ['France'],
        '7:cfyv_justes': [null, 'memoire'], '7:monumentsmorts': [null, 'tombes'], '7:genwiki': ['Allemagne'], '7:gov': ['Allemagne'],
        '7:archivni_mapy': ['Tchéquie'], '7:arcanum_adt': ['Hongrie', 'presse'],
    };
    /** les doublons : le site de gauche n'a pas sa propre ligne, il est rangé dans celui de droite (« Aussi : … » s'il a une autre adresse) */
    const MERGED = {
        'so6_minutier': {into: 'so2_an_minutier', also: false},
        'so6_siv': {into: 'so2_an_siv', also: false},
        'so6_marins_shd': {into: 'so2_shd_marins', also: false},
        'so2_maitron_fusilles': {into: 'so5_maitron', also: '🕯 Maitron des fusillés 1940-1944'},
        'so5_gallica_annuaires': {into: 'so2_annuaires_gallica', also: '📷 Le photographe dans l’annuaire'},
        'socface': {into: 'so_francearchives_noms', also: '🧾 Recensements 1836-1936 (SocFace)'},
    };
    const resolve = id => { let x = String(id || ''); for (let i = 0; i < 4 && MERGED[x]; i++) x = MERGED[x].into; return x; };

    const normVerified = v => (v === true || v === 'oui' ? 'oui' : v === 'partiel' ? 'partiel' : v === 'mine' ? 'mine' : 'non');
    const normPaid = (s, extra) => {
        const v = extra?.paid ?? (s.partlyPaid ? 'partiel' : s.paid);
        if (v === true || v === 'oui') return s.group === 'payant' && s.partlyPaid ? 'partiel' : 'oui';
        if (v === 'partiel' || v === 'bibliotheque') return v;
        return '';
    };
    const countryOf = (raw, fallback) => {
        const c = String(raw || '').trim();
        if (COUNTRIES[c]) return c;
        if (/^europe|autriche|centrale/i.test(c)) return 'Europe';
        if (/^international|monde/i.test(c)) return 'Monde';
        return COUNTRIES[fallback] ? fallback : 'Monde';
    };
    const groupsOf = G => (Array.isArray(G?.GROUPS) ? G.GROUPS.map(g => ({...g, id: g.id || g.key})) : Object.entries(G?.GROUPS || {}).map(([id, g]) => ({...g, id})));

    /**
     * Toutes les entrées, une par site. registres = {1: LCNDA_SOURCES_OUVERTES, 2: …, socface: LCNDA_SOCFACE} ;
     * opt.mine = sites ajoutés par la personne [{key, label, url, group, paid, from}], opt.hidden = identifiants cachés (⚙️).
     */
    function collect(regs = {}, opt = {}) {
        const out = [], byId = new Map();
        LOT_IDS.forEach(n => {
            const G = regs[n]; if (!G || !Array.isArray(G.SITES) || typeof G.url !== 'function') return;
            const groups = groupsOf(G);
            G.SITES.forEach((s, i) => {
                if (!s || !s.key) return;
                const g = groups.find(x => x.id === s.group) || {};
                const gm = GROUP_META[`${n}:${s.group}`] || [g.country || s.country || 'Monde', 'registres'];
                const sm = SITE_META[`${n}:${s.key}`] || [];
                const country = countryOf(sm[0] || (gm[0] === 'Europe' || gm[0] === 'Monde' || gm[0] === 'Canada' ? s.country || gm[0] : gm[0]), gm[0]);
                const id = `${prefix(n)}${s.key}`;
                const e = {
                    id, lot: n, key: s.key, label: String(s.label || s.key), icon: s.icon || g.icon || '🔍', group: s.group || '', groupLabel: g.label || '',
                    country, zone: COUNTRIES[country][0], flag: COUNTRIES[country][1], theme: sm[1] || gm[1], order: n * 1000 + i,
                    verified: normVerified(s.verified), paid: normPaid(s, sm[2]), account: !!s.account, sensitive: !!(s.sensitive || g.respect),
                    copy: !!s.copy, note: s.note || '', years: Array.isArray(s.years) ? s.years : null, yearsOf: s.yearsOf || '', needs: s.needs || '',
                    byPlace: !!(s.byPlace || s.scope === 'place' || s.needs === 'place' || (n === 6 && s.group === 'fr_bn')), nameOnly: s.scope === 'name',
                    byPhotographer: !!s.byPhotographer, where: s.where || s.on || [], kind: s.kind || g.kind || '', data: !!s.data, region: s.region || '',
                    hidden: false, also: [], merged: [],
                };
                e.text = fold([e.label, e.country, e.groupLabel, e.note, themeOf(e.theme).label, e.paid ? 'payant' : 'gratuit'].join(' '));
                byId.set(id, e); out.push(e);
            });
        });
        if (regs.socface && typeof regs.socface.searchUrl === 'function') {
            const e = {id: 'socface', lot: 'socface', key: 'socface', label: 'Recensements 1836-1936 (SocFace, FranceArchives)', icon: '🧾', group: 'socface', groupLabel: 'Recensements',
                country: 'France', zone: 'fr', flag: '🇫🇷', theme: 'registres', order: 900, verified: 'partiel', paid: '', kind: 'socface', where: ['fiche'], also: [], merged: [], years: [1836, 1936], yearsOf: ''};
            e.text = fold(`${e.label} recensements socface franceArchives`);
            byId.set(e.id, e); out.push(e);
        }
        (opt.mine || []).forEach((m, i) => {
            if (!m || !m.key || !m.label) return;
            const id = m.from === 'lot7' ? `${prefix(7)}${m.key}` : `mine_${m.key}`;
            const e = {id, lot: m.from === 'lot7' ? 7 : 'mine', key: m.key, label: String(m.label), icon: m.icon || '⭐', group: 'mine', groupLabel: 'Mes sites', country: 'Monde', zone: 'monde', flag: '⭐',
                theme: 'mine', order: 20000 + i, verified: 'mine', paid: m.paid === 'oui' || m.paid === true ? 'oui' : m.paid === 'partiel' || m.paid === 'bibliotheque' ? m.paid : '', tpl: m.url, mine: true, from: m.from || 'app',
                kind: m.from === 'lot7' ? 'acte' : '', where: ['fiche', 'lieu'], also: [], merged: [], note: 'Un site que tu as ajouté.'};
            e.text = fold(`${e.label} mes sites ${m.url}`);
            byId.set(id, e); out.push(e);
        });
        // les doublons rejoignent le site gardé
        Object.entries(MERGED).forEach(([from, m]) => {
            const a = byId.get(from), b = byId.get(resolve(m.into)); if (!a || !b) return;
            a.mergedInto = b.id; b.merged.push(a.id);
            if (m.also) b.also.push({id: a.id, label: m.also});
            b.text += ' ' + a.text;
            if (!b.kind && a.kind) b.kind = a.kind;
        });
        const hidden = new Set(opt.hidden || []);
        out.forEach(e => { e.hidden = hidden.has(e.id) || (e.lot === 7 && hidden.has(e.key)); });
        return opt.all ? out : out.filter(e => !e.mergedInto);
    }
    /** toutes les entrées, doublons compris (mergedInto = le site gardé) : l'adresse et l'aide de chaque lot restent lisibles */
    const collectAll = (regs = {}, opt = {}) => collect(regs, {...opt, all: true});

    /* ═════ réglages de chaque lot (clé et forme d'origine) ═════ */
    const lsGet = (ls, k) => { try { return ls ? ls.getItem(k) : null; } catch (_) { return null; } };
    const lsSet = (ls, k, v) => { try { if (!ls) return; if (v == null) ls.removeItem(k); else ls.setItem(k, v); } catch (_) { /* stockage plein ou bloqué */ } };
    const parse = v => { try { const o = JSON.parse(v || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (_) { return {}; } };
    /** le réglage brut d'un lot (lot 7 : {hidden, urls, cercles, mine}, sinon {clé: modèle}) */
    const store = (n, ls) => parse(lsGet(ls, LOTS[n].store));
    /** les adresses à soi d'un lot, sous la forme que son url() attend */
    const custom = (n, ls) => { const o = store(n, ls); if (LOTS[n].format === 'so7') return {...(o.urls && typeof o.urls === 'object' ? o.urls : {}), cercles: o.cercles || {}}; return o; };
    /** écrit les adresses d'un lot {clé: modèle} (vides retirées) en gardant le reste de son réglage */
    function writeUrls(n, urls, ls) {
        const clean = {}; Object.entries(urls || {}).forEach(([k, v]) => { v = String(v || '').trim(); if (v) clean[k] = v.slice(0, 600); });
        if (LOTS[n].format === 'so7') { const o = store(n, ls); o.urls = clean; const empty = !Object.keys(clean).length && !(o.hidden || []).length && !Object.keys(o.cercles || {}).length && !(o.mine || []).length; lsSet(ls, LOTS[n].store, empty ? null : JSON.stringify(o)); return; }
        lsSet(ls, LOTS[n].store, Object.keys(clean).length ? JSON.stringify(clean) : null);
    }
    /** les sites cachés (⚙️ « Montrer ») : gardés dans le réglage du lot 7 (clé du lot 7, identifiants des autres lots) */
    const hiddenIds = ls => { const o = store(7, ls); return Array.isArray(o.hidden) ? o.hidden.map(String) : []; };
    function writeHidden(ids, ls) { const o = store(7, ls); o.hidden = [...new Set(ids)].slice(0, 400); lsSet(ls, LOTS[7].store, JSON.stringify(o)); }
    const freeOnly = ls => lsGet(ls, FREE_KEY) !== '0';
    /** « Mes sites » : ceux de « Chercher sur internet » (genealogie-web-search-custom) et ceux du lot 7 */
    function mineSites(ls) {
        let app = []; try { app = JSON.parse(lsGet(ls, CUSTOM_KEY) || '[]'); } catch (_) { app = []; }
        const a = (Array.isArray(app) ? app : []).filter(s => s && s.key && s.label && /^https?:\/\//i.test(String(s.url || ''))).map(s => ({...s, from: 'app'}));
        const b = (store(7, ls).mine || []).filter(s => s && s.key && s.label && /^https?:\/\//i.test(String(s.url || ''))).map(s => ({...s, from: 'lot7'}));
        return [...a, ...b];
    }

    /* ═════ adresses ═════ */
    const cleanUrl = u => { try { const x = new URL(String(u || '').trim()); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (_) { return ''; } };
    /** remplit un modèle de « Mes sites » (le même que Chercher sur internet : {nom} {prénom} {lieu} {année}…) */
    function fillMine(tpl, p = {}, regs = {}) {
        const f = regs[5]?.fillCustom || regs[7]?.fillCustom;
        if (f) { try { return cleanUrl(f(tpl, {...p, year: p.birthYear || p.y1, name: [p.first, p.last].filter(Boolean).join(' ')})); } catch (_) { /* modèle cassé */ } }
        const enc = v => encodeURIComponent(String(v ?? ''));
        return cleanUrl(String(tpl || '').replace(/\{nom\}/g, enc(p.last)).replace(/\{pr[ée]nom\}/g, enc(p.first)).replace(/\{nom_complet\}/g, enc([p.first, p.last].filter(Boolean).join(' '))).replace(/\{lieu\}/g, enc(p.place)).replace(/\{ann[ée]e\}/g, enc(p.birthYear || p.y1)));
    }
    /** l'adresse d'une entrée (vide si elle manque de quelque chose : unité, département…) */
    function url(e, p = {}, regs = {}, ls = null) {
        if (!e) return '';
        if (e.mine) return fillMine(e.tpl, p, regs);
        if (e.lot === 'socface') { try { return cleanUrl(regs.socface.searchUrl({last: p.last, first: p.first, place: p.place, y1: Math.max(1836, Number(p.y1) || 1836), y2: Math.min(1936, Number(p.y2) || 1936)})); } catch (_) { return ''; } }
        const G = regs[e.lot]; if (!G) return '';
        try { return G.url(e.key, p, custom(e.lot, ls)) || ''; } catch (_) { return ''; }
    }
    const hasCustom = (e, ls) => !!(e && !e.mine && LOTS[e.lot] && custom(e.lot, ls)[e.key] && typeof custom(e.lot, ls)[e.key] === 'string');
    /** il faut au moins un nom (ou un lieu pour un site qui cherche par lieu) */
    function ready(e, p = {}) {
        const name = !!(String(p.last || '').trim() || String(p.first || '').trim());
        if (e.needs === 'fsId') return !!String(p.fsId || '').trim();
        if (e.nameOnly) return !!String(p.last || '').trim();
        if (name) return true;
        if (e.byPlace && String(p.place || p.county || '').trim()) return true;
        if (e.byPhotographer && String(p.photographer || '').trim()) return true;
        if (e.needs === 'port' && String(p.port || '').trim()) return true;
        if (e.needs === 'place' && String(p.place || p.what || '').trim()) return true;
        if (e.key === 'anmt' && String(p.employer || '').trim()) return true;
        if (e.copy) return true;
        return false;
    }
    /** hors de l'époque : mêmes règles que les lots (années de vie croisées, ou années de naissance) */
    function outOfTime(e, p = {}) {
        if (!e?.years) return false;
        const a = Number(p.y1) || Number(p.birthYear) || 0, b = Number(p.y2) || Number(p.deathYear) || (a ? a + 90 : 0), by = Number(p.birthYear) || 0;
        if (e.yearsOf === 'birth') return !!(by && (by < e.years[0] || by > e.years[1]));
        if (e.yearsOf === 'birthBefore') return !!(by && by > e.years[1]);
        return !!(a && b && (b < e.years[0] || a > e.years[1]));
    }

    /* ═════ filtres ═════ */
    /** f = {q, zone, country, theme, free, focus: Set d'ids, p, showOld, showHidden} → les entrées montrées */
    function filter(list, f = {}) {
        const q = fold(f.q || '');
        return list.filter(e => {
            if (e.hidden && !f.showHidden) return false;
            if (f.free && (e.paid === 'oui' || e.paid === 'bibliotheque')) return false;
            if (f.focus && !f.focus.has(e.id)) return false;
            if (!f.showOld && f.p && outOfTime(e, f.p)) return false;
            if (q && !q.split(' ').every(w => e.text.includes(w))) return false;
            if (f.zone && e.zone !== f.zone) return false;
            if (f.country && e.country !== f.country) return false;
            if (f.theme && e.theme !== f.theme) return false;
            return true;
        });
    }
    /** les nombres des pastilles : par zone, par pays (dans la zone choisie), par thème (dans le pays ou la zone choisie) */
    function counts(list, f = {}) {
        const base = filter(list, {...f, zone: '', country: '', theme: ''});
        const zone = {}, country = {}, theme = {};
        base.forEach(e => { zone[e.zone] = (zone[e.zone] || 0) + 1; });
        base.filter(e => !f.zone || e.zone === f.zone).forEach(e => { country[e.country] = (country[e.country] || 0) + 1; });
        base.filter(e => (!f.zone || e.zone === f.zone) && (!f.country || e.country === f.country)).forEach(e => { theme[e.theme] = (theme[e.theme] || 0) + 1; });
        return {all: base.length, zone, country, theme};
    }
    const zoneRank = z => Math.max(0, ZONES.findIndex(x => x.id === z));
    const countryRank = c => Object.keys(COUNTRIES).indexOf(c);
    const themeRank = t => THEMES.findIndex(x => x.id === t);
    /** rangées en rubriques : pays, puis thème ; dans une rubrique, les payants à la fin */
    function sections(list, {first = []} = {}) {
        const map = new Map();
        [...list].sort((a, b) => zoneRank(a.zone) - zoneRank(b.zone) || countryRank(a.country) - countryRank(b.country) || themeRank(a.theme) - themeRank(b.theme)
            || (first.includes(b.id) - first.includes(a.id)) || ((a.paid === 'oui' || a.paid === 'bibliotheque') - (b.paid === 'oui' || b.paid === 'bibliotheque')) || a.order - b.order)
            .forEach(e => { const k = `${e.country}|${e.theme}`; if (!map.has(k)) map.set(k, {id: k, country: e.country, flag: e.flag, theme: themeOf(e.theme), list: []}); map.get(k).list.push(e); });
        return [...map.values()];
    }

    /* ═════ un lien collé : quel lot sait le lire ═════ */
    const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } };
    /** → {lot, site, label} ou null ; prefer = un lot à essayer d'abord (celui d'où l'on vient) */
    function detectLink(link, regs = {}, {prefer = 0, entries = null} = {}) {
        const u = cleanUrl(link); if (!u) return null;
        const h = host(u);
        if (regs.socface && /francearchives\.gouv\.fr$/.test(h) && /recensement/i.test(u)) return {lot: 'socface', site: 'socface', label: 'Recensements SocFace'};
        const order = [Number(prefer) || 0, ...LOT_IDS].filter((n, i, a) => n && a.indexOf(n) === i);
        const read = n => { const G = regs[n]; if (!G?.parseLink) return null; try { return G.parseLink(u); } catch (_) { return null; } };
        for (const strict of [true, false]) for (const n of order) { // d'abord un lot qui a ce site dans sa liste, puis un lot qui reconnaît seulement le nom
            const r = read(n); if (!r || !r.site) continue;
            const s = (regs[n].SITES || []).find(x => x.key === r.site);
            if (strict && !s) continue;
            return {lot: n, site: r.site, label: s?.label || r.site, info: r};
        }
        // sans parseLink (lot 3) ou rien reconnu : le nom du site dans les adresses connues
        const list = entries || collect(regs);
        for (const e of list) {
            if (e.mine || e.lot === 'socface') continue;
            const G = regs[e.lot]; const s = (G?.SITES || []).find(x => x.key === e.key) || {};
            const hosts = [s.home, s.search, s.domain && `https://${s.domain}/`].map(host).filter(x => x && x !== 'google.com');
            if (hosts.some(x => x === h || h.endsWith('.' + x))) return {lot: e.lot, site: e.key, label: e.label};
        }
        return null;
    }

    /** un texte collé sans lien : le lot dont detectKind reconnaît la sorte (WikiTree, CICR, Juste…) → {lot, kind, label} ou null */
    function detectText(text, regs = {}, {prefer = 0} = {}) {
        const t = String(text || ''); if (t.trim().length < 12) return null;
        const order = [Number(prefer) || 0, 5, 3, 7, 2, 1, 4, 6].filter((n, i, a) => n && a.indexOf(n) === i);
        for (const n of order) {
            const G = regs[n]; if (!G?.detectKind) continue;
            let k = ''; try { k = G.detectKind(t); } catch (_) { k = ''; }
            if (k && k !== 'acte' && k !== 'document') return {lot: n, kind: k, label: G.KIND_LABEL?.[k] || G.KINDS?.[k]?.label || k};
        }
        return null;
    }

    /** les registres présents dans la page (navigateur) */
    function registries(win = (typeof window !== 'undefined' ? window : {})) {
        const r = {}; LOT_IDS.forEach(n => { if (win[LOTS[n].global]) r[n] = win[LOTS[n].global]; }); if (win.LCNDA_SOCFACE) r.socface = win.LCNDA_SOCFACE; return r;
    }

    const WHERE_LABEL = {fiche: '👤 Pour sa fiche', militaire: '🎖 Militaire', emigration: '🧳 Émigration', inventeur: '💡 Inventeur', medecin: '⚕ Médecin, polytechnicien', elu: '🏛 Élu',
        artiste: '🖼 Artiste', lieu: '📍 Ce lieu', recompense: '🏆 Récompenses', employeur: '🏭 Employeur', photo: '📷 Photographe', placement: '👶 Enfant placé', carte: '🗺 Carte'};

    return {FREE_KEY, VIEW_KEY, CUSTOM_KEY, LOTS, LOT_IDS, STORE_KEYS, ZONES, COUNTRIES, THEMES, GROUP_META, SITE_META, MERGED, WHERE_LABEL,
        prefix, themeOf, resolve, collect, collectAll, store, custom, writeUrls, hiddenIds, writeHidden, freeOnly, mineSites, cleanUrl, fillMine, url, hasCustom,
        ready, outOfTime, filter, counts, sections, detectLink, detectText, registries, groupsOf, fold};
});
