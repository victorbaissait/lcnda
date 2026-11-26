/* LCNDA — 🗂 Listes → 🧰 Données, rangées par THÈME (maquette validée docs/design/listes-categories.html, décisions du 2026-11-26).
 *
 *  - 20 thèmes (« de quoi ça parle ») : les 19 de la maquette + 🏆 Sport. Une liste = un seul thème ; la recherche trouve tout.
 *  - Le thème d'une liste : son champ `theme` (un id ci-dessous) ; sinon la table id → thème de la maquette (THEME_OF, en bas) ;
 *    sinon ses mots (words de chaque thème, comparés à son nom) ; sinon « 📦 À ranger » (montré seulement s'il y en a une).
 *  - Registre : LCNDA_EXT.dataListThemes = [{id, icon, label, hint, words: [...]}] (un fichier peut en ajouter, avant ou après nous).
 *  - Écran « 🧰 Toutes les données » : une recherche sur toutes les listes, des pastilles calculées toutes seules (Toutes ·
 *    📍 Avec une carte = geo() · 📅 Avec des dates = period() · ⤓ À installer), puis les thèmes en cartes ; en cherchant, les listes
 *    trouvées rangées par thème, les thèmes sans résultat pâlis.
 *  - Un thème (Listes → data_theme_<id>) s'ouvre sur sa liste réunie quand il en a une (🔀, app-listes-reunies.js), sinon sur ses
 *    listes ; un onglet « Les N listes » ; au choix dans Réglages → 🧰 Listes de données.
 *  - Colonne de gauche : le groupe « 🧰 Données » montre les thèmes (repliés : la liste ouverte se montre sous son thème) au lieu de
 *    toutes les listes. Les 4 groupes d'avant (Le lieu, La personne, Le monde, Chercher) : au choix dans les Réglages
 *    (localStorage « genealogie-listes-vue » = 'groupes'). Le champ `group` reste : les fiches du lieu et de la personne s'en servent.
 *  Réglages (clés « genealogie-… », gardées aussi dans la base) : genealogie-listes-vue ('themes' | 'groupes'),
 *    genealogie-listes-theme-ouvre ('reunie' | 'listes'), genealogie-listes-famille-km (👪 « Dans la famille », 15 km au départ).
 *  Essai : tests/test-listes-themes.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const E = () => ext.dataListsEngine || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const writeLS = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (_) {} };
    const K_VUE = 'genealogie-listes-vue', K_OUVRE = 'genealogie-listes-theme-ouvre', K_KM = 'genealogie-listes-famille-km', K_SPLIT = 'genealogie-listes-reunies-separes';
    const mode = () => (readLS(K_VUE, 'themes') === 'groupes' ? 'groupes' : 'themes');
    const openMode = () => (readLS(K_OUVRE, 'reunie') === 'listes' ? 'listes' : 'reunie');
    const OVERVIEW = 'donnees', TKEY = 'data_theme_', SETTINGS_TAB = 'listes_donnees_reglages';

    /* ═════════════ les 20 thèmes ═════════════ */
    const DEFAULT_THEMES = [
        ['seismes', '🌋', 'Séismes, volcans et terrains', 'EPICA, NOAA, volcans, avalanches, cavités…', 'seisme, tremblement, volcan, eruption, avalanche, cavite, gouffre, terrain, glissement, fossile, roche, geolog, tsunami'],
        ['eaux', '🌊', 'Eaux, crues et mers', 'Inondations, repères de crues, marées, épaves…', 'crue, inondation, maree, epave, naufrage, phare, thermal, eaux, lavoir, fontaine, riviere, fleuve, mer, littoral, cote, port, etang'],
        ['ciel', '⛅', 'Climat, ciel et saisons', 'Vendanges, météo, vents, comètes, éclipses…', 'meteo, climat, vent, dicton, comete, eclipse, etoile, asteroide, meteorite, saison, glacier, hiver, secheresse, ciel, aurore, vendange'],
        ['guerres', '⚔️', 'Guerres et soldats', 'Morts pour la France, batailles, régiments…', 'guerre, bataille, soldat, regiment, militaire, necropole, monument aux morts, camp, siege, decoration, uniforme, poilu, armee, fort, bastion, rempart, maginot, vauban, aviateur, resistan, deporte'],
        ['monuments', '🏛', 'Monuments et patrimoine', 'Châteaux, Mérimée, Palissy, sites antiques…', 'chateau, merimee, palissy, monument, historique, patrimoine, antique, inscription, romaine, jardin, bastide, armoiries, manoir, abbaye'],
        ['village', '🏘', 'Petit patrimoine du village', 'Fours, lavoirs, croix, bornes, halles…', 'four, pigeonnier, borne, octroi, croix, calvaire, cadran, halle, kiosque, marianne, liberte, ecole, village, plaque'],
        ['images', '🖼', 'Musées, images et sons', 'Joconde, Mémoire, films, 78 tours…', 'musee, joconde, photo, image, film, tableau, gravure, enregistrement, son, coiffe, costume, mode, atlas, collection'],
        ['lieux', '🗺', 'Lieux et noms de lieux', 'GOV, DicoTopo, lieux-dits, villages disparus…', 'lieux-dits, lieu-dit, toponym, nom des lieux, anciens noms, commune, village disparu, rue, homonyme, territoire, pays traditionnel, population'],
        ['pouvoirs', '👑', 'Pouvoirs, lois et frontières', 'Frontières, préfets, maires, seigneurs…', 'frontiere, territoire, chef de l etat, prefet, maire, seigneur, election, loi, droit, coutume, gabelle, nationalite, depute, doleance, noblesse, ancien regime'],
        ['noms', '👶', 'Prénoms et noms de famille', 'Prénoms par pays, blasons, romans…', 'prenom, nom de famille, patronyme, blason, roman, personnage, porteurs'],
        ['personnes', '🔎', 'Retrouver une personne', 'Décès INSEE, Léonore, annuaires…', 'deces, insee, leonore, annuaire, celebre, eleve, personne, individu, relation, laureat, registre, passager'],
        ['metiers', '⚒️', 'Métiers et industries', 'Mines, moulins, forges, outils, grèves…', 'metier, industri, mine, carriere, moulin, usine, forge, saline, atelier, outil, greve, ouvri, foire, fabrique, manufacture, chantier, sucrerie, coutell'],
        ['terre', '🌾', 'Champs, bêtes et plantes', 'AOC, races, fruits anciens, loups…', 'aoc, race, animal, fruit, variete, cepage, potager, loup, oiseau, fleur, arbre, foret, paysage, berger, transhumance, culture, fleau, rose, plante'],
        ['routes', '🚂', 'Routes, trains et bateaux', 'Gares, voies romaines, relais de poste…', 'gare, train, voie romaine, chemin, relais, poste, pont, canal, ecluse, tunnel, funiculaire, tramway, navire, bateau, voyage, route, ascension, sommet'],
        ['croire', '✝️', 'Croire, soigner, enfermer', 'Églises, saints, hospices, prisons…', 'eglise, chapelle, saint, eveque, pape, pelerinage, temple, synagogue, hopital, hospice, prison, couvent, cimetiere, affaire, criminelle, lazaret, sanatorium, culte, diocese'],
        ['prix', '💶', 'Prix, monnaies et chiffres', 'Prix des denrées, pièces, timbre…', 'prix, monnaie, piece, timbre, mesure, esperance de vie, chiffre, salaire, denree'],
        ['livres', '📚', 'Livres, journaux et écritures', 'Journaux, almanachs, latin…', 'livre, journal, almanach, latin, abreviation, ecriture, mot, dictionnaire, conte, chanson, recueil, dictee'],
        ['fetes', '🎉', 'Fêtes, jeux et vie de tous les jours', 'Fêtes, jeux, chansons, plats…', 'fete, tradition, jeu, chanson, plat, jouet, musique, danse, opera, spectacle, rosiere, legende, marque, exposition'],
        ['evenements', '🌍', 'Grands événements et dates', 'Le monde autour, nouveautés…', 'evenement, epidemie, nouveaute, calendrier, jours celebres, grands mouvements, traite'],
        ['sport', '🏆', 'Sport', 'Compétitions, Tour de France, clubs, Jeux olympiques…', 'sport, competition, tour de france, club, olympi, cycli, football, rugby, champion, stade, course, hippodrome, boxe, tennis']];
    const RANGER = {id: 'aranger', icon: '📦', label: 'À ranger', hint: 'Les listes qui n’ont pas encore de thème', words: []};
    /** la table id → thème de la maquette (§ 1, « La répartition, liste par liste ») ; décision 2 : Tour de France et clubs vont dans 🏆 Sport */
    const THEME_OF = {};
    const put = (th, ids) => ids.split(/\s+/).filter(Boolean).forEach(id => { THEME_OF[id] = th; });
    put('seismes', 'hist_seismes ha_catastrophes l10t_volcans tf_volcans l10t_avalanches l10t_mvt l10t_cavites tm_sol te_fossiles');
    put('eaux', 'hist_crues hist_catnat mr_reperes l8a_marees l8a_eaux tb_eau l10t_epaves ha_phares');
    put('ciel', 'hist_vendanges meteo_stations tq_climat tq_glaciers l10r_vents l10r_dictons l8a_ciels ciel_cometes eclipses link_lune_eclipses tq_meteorites te_etoiles l9_etoiles tm_asteroides');
    put('guerres', 'bo_mpf ha_batailles ha_guerres te_religion l8b_regiments td_necropoles pm_monuments td_camps tf_ballons l9_decorations l9_uniformes');
    put('monuments', 'chateaux lp_merimee lp_palissy fiches_edifices tq_sites te_inscriptions l10t_quebec l10v_maisons l10v_vue cc_armoiries l8a_jardins th_bastides');
    put('village', 'tb_village tb_bornes tb_croix tf_cocher tm_cadrans th_halles th_kiosques th_marianne te_libertes l9_villes tr_ecoles');
    put('images', 'mr_musee l10v_tableaux l10v_photos cplus_images pm_films l8a_images et_mode l9a_sons th_trudaine cc_oeuvres et_photos tr_coiffes');
    put('lieux', 'gov_noms link_gov_search lp_lieuxdits lp_dicotopo wikidata_anciens_noms tm_noms tm_disparus br_rues_paris l8a_homonymes l10t_algerie l10t_suisse l10r_pays hist_communes mes_territoires');
    put('pouvoirs', 'pays_frontieres territoires l8b_nationalite dp_chefs_etat dp_prefets dp_maires l8c_seigneurs dp_ancien_regime l9_gabelle l10r_coutumes dp_lois elections pm_doleances');
    put('noms', 'pp_prenoms tr_prenoms l8b_prenoms_famille l8b_personnages l8b_noms_romans cc_rietstap cc_rues l10t_nom');
    put('personnes', 'insee_deces link_insee link_bo_search bo_leonore wikidata_personnes pm_ecoles l9_sejours adn_ancien reseau ba_annuaires tf_montyon');
    put('metiers', 'mr_casias mr_mines mr_moulins tf_forges tf_salines th_ateliers th_textes l8a_saints l8a_outils l8a_maladies et_greves l8a_budgets l8c_foires');
    put('terre', 'et_fleaux tr_aoc tr_races tm_fruits tm_cultivars tb_cepages tf_potager pm_faune l9a_oiseaux l9a_fleurs tq_arbres l10v_forets ta_paysage tb_berger');
    put('routes', 'hist_gares ha_voies_romaines ha_compostelle l10t_relais et_ouvrages tf_ponts th_funiculaires th_tramways th_traces th_eclusieres ha_navires l9_voyages l9_sommets');
    put('croire', 'cplus_churches dp_eveques l9_papes l10r_saints l10r_tempsclos pm_fontaines l10o_pelerinages tb_cultes l8c_eglises ha_institutions cplus_cemeteries tm_affaires');
    put('prix', 'prix_europe tq_poche tq_timbre tm_mesures tq_esperance tc_sgf_deces link_pays_chiffres');
    put('livres', 'et_livres l9a_livres l9a_recettes l9_coutumes l10o_contes l9_journaux cplus_newspapers td_almanachs td_latin l10r_cappelli l10r_ecritures tm_mots pm_parlers');
    put('fetes', 'tm_fetes td_jeux l8c_expos l8c_spectacles pm_musique wikidata_chansons l9a_chansons tf_rosieres tm_legendes cc_plats l9a_marques l9a_jouets');
    put('evenements', 'link_world_events link_historical_context link_grands_mouvements wikidata_evenements l8c_dates et_nouveautes l8b_calendrier');
    put('sport', 'l8c_clubs l8c_tour ti_hippodromes');
    // lots G et I (venus après la maquette ; § 7 : aviateurs → 🔎, forts → ⚔️, sémaphores → 🏛, lazarets → ✝️)
    put('personnes', 'tg_filles tg_aviateurs'); put('guerres', 'tg_carignan tg_compagnons tg_forts tg_poudres'); put('pouvoirs', 'tg_deputes');
    put('monuments', 'tg_semaphores'); put('croire', 'tg_lazarets ti_sanas ti_centrales'); put('village', 'tg_wallace'); put('routes', 'tg_lloyd ti_romains');
    put('metiers', 'ti_navals ti_autos ti_sucreries ti_dico'); put('eaux', 'ti_maregraphe'); put('livres', 'ti_tour ti_ecole ti_chansons');

    /* le registre : ce que d'autres fichiers ont déjà mis (avant nous) passe devant, puis les thèmes de départ */
    const adopt = arr => { if (!Array.isArray(arr)) arr = []; DEFAULT_THEMES.forEach(([id, icon, label, hint, words]) => { if (!arr.some(t => t && t.id === id)) arr.push({id, icon, label, hint, words: words.split(/\s*,\s*/)}); }); return arr; };
    let THEMES = adopt(ext.dataListThemes);
    Object.defineProperty(ext, 'dataListThemes', {get: () => THEMES, set: v => { THEMES = adopt(v); stamp++; }, configurable: true});
    let stamp = 0;
    const themes = () => THEMES.filter(t => t && t.id && t.label);
    const themeById = id => (id === RANGER.id ? RANGER : themes().find(t => t.id === id) || null);

    /** le thème d'une liste : `theme`, la table, ses mots, sinon « À ranger » */
    const memo = new Map();
    function themeOf(d) {
        if (!d) return RANGER.id;
        const key = `${d.id}|${d.theme || ''}|${stamp}|${THEMES.length}`;
        if (memo.has(key)) return memo.get(key);
        let th = d.theme && themeById(d.theme) ? d.theme : THEME_OF[d.id];
        if (!th) {
            const name = ` ${fold(`${d.label} ${d.id}`).replace(/[^a-z0-9]+/g, ' ')} `; let best = 0;
            for (const t of themes()) { let n = 0; for (const w of t.words || []) { const f = fold(w).replace(/[^a-z0-9]+/g, ' ').trim(); if (f.length > 2 && name.includes(` ${f}`)) n += f.length > 4 ? 2 : 1; } if (n > best) { best = n; th = t.id; } }
        }
        th = th || RANGER.id; memo.set(key, th); return th;
    }
    /** l'index : thème → listes montrées (les liens ↗ compris), recalculé quand le registre change */
    let IDX = null, IDX_SIG = '';
    function index() {
        const ds = (E().list?.() || []).filter(d => E().shown?.(d) !== false);
        const sig = `${ds.length}|${stamp}|${THEMES.length}|${ds.map(d => d.id).join(',').length}`;
        if (IDX && sig === IDX_SIG) return IDX;
        const by = new Map([...themes(), RANGER].map(t => [t.id, []]));
        ds.forEach(d => { const th = themeOf(d); (by.get(th) || by.get(RANGER.id)).push(d); });
        IDX = {ds, by}; IDX_SIG = sig; return IDX;
    }
    const themeList = () => [...themes(), RANGER].filter(t => (index().by.get(t.id) || []).length);
    const mergedOf = id => (index().by.get(id) || []).filter(d => d.merged);
    const plainOf = id => (index().by.get(id) || []).filter(d => !d.merged);
    const listKey = d => (d.link ? 'link:' + d.id : E().keyOf(d));

    /* ═════════════ la colonne de gauche ═════════════ */
    const tkey = id => TKEY + id;
    function sync(L, G, ds) {
        if (!Array.isArray(L)) return;
        ext.lists = ext.lists || {};
        for (const t of [...themes(), RANGER]) {
            const k = tkey(t.id), lab = `${t.icon} ${T(t.label)}`, row = L.find(x => x[0] === k);
            if (row) row[2] = lab; else L.push([k, '92', lab]);
            ext.lists[k] = token => { tabOf.delete(t.id); return renderTheme(t.id, token); }; // venu de la colonne, d'un lien : le réglage décide de l'onglet
        }
        if (!G) return;
        const tools = G[3].filter(k => !String(k).startsWith('data_') && k !== OVERVIEW);
        if (mode() === 'themes') { // chaque thème, puis ses listes (cachées, sauf celle qui est ouverte : elle se montre sous son thème)
            const by = new Map(); ds.forEach(d => { const th = themeOf(d); if (!by.has(th)) by.set(th, []); by.get(th).push(E().keyOf(d)); });
            G[3].splice(0, G[3].length, OVERVIEW, ...tools, ...[...themes(), RANGER].flatMap(t => [tkey(t.id), ...(by.get(t.id) || [])]));
        } else G[3].push(...[...themes(), RANGER].map(t => tkey(t.id)));
        document.documentElement.classList.toggle('ld-themes-on', mode() === 'themes');
    }
    const prevShown = ext.listShown;
    ext.listShown = k => {
        const s = String(k);
        if (s.startsWith(TKEY)) return mode() === 'themes' && !!(index().by.get(s.slice(TKEY.length)) || []).length;
        if (mode() === 'themes' && s.startsWith('data_') && s !== A().state?.listType) return false;
        return prevShown ? prevShown(k) : true;
    };

    /* ═════════════ « 🧰 Toutes les données » : recherche, pastilles, thèmes ═════════════ */
    const ws = () => document.getElementById('workspace');
    const notInstalled = new Set(); let installChecked = false;
    async function checkInstalls(onDone) {
        const ds = index().ds.filter(d => d.installed && !d.link);
        await Promise.all(ds.map(async d => { const ok = await E().isInstalled(d); if (ok) notInstalled.delete(d.id); else notInstalled.add(d.id); }));
        installChecked = true; onDone?.();
    }
    const textOf = new Map();
    const hay = d => { const k = `${d.id}|${d.label}`; if (!textOf.has(k)) { const t = themeById(themeOf(d)); textOf.set(k, fold([T(d.label), d.label, d.id, d.source, t ? T(t.label) : '', ...(d.fields || []).map(f => T(f.label)), ...(d.keywords || [])].join(' '))); } return textOf.get(k); };
    const CHIPS = [['all', '', 'Toutes'], ['geo', '📍', 'Avec une carte'], ['dates', '📅', 'Avec des dates'], ['install', '⤓', 'À installer']];
    const chipOk = (c, d) => (c === 'geo' ? !!d.geo : c === 'dates' ? !!d.period : c === 'install' ? notInstalled.has(d.id) : true);
    const cardOf = d => `<button type="button" class="ld-card${d.merged ? ' is-merged' : ''}" data-ld-go="${esc(listKey(d))}"><span class="ld-card-ico" aria-hidden="true">${esc(d.merged ? '🔀' : d.icon || '📋')}</span><span class="ld-card-txt"><b>${esc(T(d.label))}</b>${d.merged ? `<small class="muted">${esc(d.mergeLine?.() || T('liste réunie'))}</small>` : d.source ? `<small class="muted">${esc(d.source)}</small>` : ''}</span><span class="ld-card-state" data-ld-state="${esc(d.id)}">${d.link ? `<span class="ldt-tag">${esc(T('lien'))}</span>` : d.merged ? `<span class="ldt-tag is-merged">${esc(T('liste réunie'))}</span>` : notInstalled.has(d.id) ? `<span class="ldt-tag">${esc(T('à installer'))}</span>` : ''}</span></button>`;
    async function overview(host, token) {
        const app = A(), I = index(), all = I.ds;
        let chip = 'all', q = '';
        host.innerHTML = `<section class="page collection-page ld-page ld-overview ldt-overview">${UI().pageHeader ? UI().pageHeader({where: `${T('Listes')} · 🧰 ${T('Données')}`, icon: '🧰', title: T('Toutes les données'), help: esc(T('Des listes toutes prêtes pour comprendre la vie de ta famille, rangées par thème. Lecture seule.')),
                actions: [`<button type="button" class="button small secondary" data-ldt-settings title="${esc(T('Par thème ou par groupe, ce qu’ouvre un thème, le rayon « Dans la famille »'))}">⚙ ${esc(T('Réglages des listes'))}</button>`]}) : ''}
            <input type="search" class="ld-q ldt-q" data-ld-ov-q placeholder="${esc(T('Chercher dans les {n} listes (ex. séisme, moulin, Nice, 1887)…', {n: nf(all.length)}))}" aria-label="${esc(T('Chercher dans toutes les listes'))}">
            <div class="ldt-chips" role="group" aria-label="${esc(T('Montrer'))}"><span class="ldt-chips-lab">${esc(T('Montrer'))}</span>${CHIPS.map(([c, ic, l]) => `<button type="button" class="ldt-chip" data-ldt-chip="${c}" aria-pressed="${c === 'all'}">${ic ? `${ic} ` : ''}${esc(T(l))} <i data-ldt-n="${c}"></i></button>`).join('')}</div>
            <p class="ldt-found muted" data-ldt-found aria-live="polite"></p>
            <div class="ldt-results" data-ldt-results></div>
            <div class="ldt-themes" data-ldt-themes></div></section>`;
        const page = host.querySelector('.ldt-overview'), res = page.querySelector('[data-ldt-results]'), grid = page.querySelector('[data-ldt-themes]'), found = page.querySelector('[data-ldt-found]');
        const counts = () => CHIPS.forEach(([c]) => { const el = page.querySelector(`[data-ldt-n="${c}"]`); if (el) el.textContent = c === 'install' && !installChecked ? '…' : nf(all.filter(d => !d.link || c === 'all').filter(d => chipOk(c, d)).length); });
        const paint = () => {
            const words = fold(q).split(/[^a-z0-9'-]+/).filter(Boolean), searching = !!words.length || chip !== 'all';
            const VX = ext.listesValeurs, byVal = new Set(); // 🔎 « le mot est dans ses valeurs » (app-listes-reunies-plus.js : un index fait une fois, en tâche de fond)
            const hit = d => chipOk(chip, d) && (chip === 'all' || !d.link) && (words.every(w => hay(d).includes(w)) || (!!VX && !!words.length && words.every(w => hay(d).includes(w) || VX.has(d, w)) && !!byVal.add(d.id)));
            const tl = themeList(), hits = new Map(tl.map(t => [t.id, (I.by.get(t.id) || []).filter(hit)]));
            const nHits = [...hits.values()].reduce((a, b) => a + b.length, 0), nThemes = [...hits.values()].filter(x => x.length).length;
            found.textContent = searching ? (nHits ? T('{n} listes trouvées, dans {t} thèmes.', {n: nf(nHits), t: nf(nThemes)}) : T('Aucune liste ne correspond.')) : '';
            found.hidden = !searching;
            res.innerHTML = searching ? tl.filter(t => hits.get(t.id).length).map(t => `<section class="ld-group ldt-group" data-ldt-group="${esc(t.id)}"><h3>${esc(t.icon)} ${esc(T(t.label))}</h3><div class="ld-cards">${hits.get(t.id).sort((a, b) => (b.merged ? 1 : 0) - (a.merged ? 1 : 0) || (byVal.has(a.id) ? 1 : 0) - (byVal.has(b.id) ? 1 : 0)).map(d => (byVal.has(d.id) ? cardOf(d).replace('</b>', `</b><small class="ldt-inval">🔎 ${esc(T('le mot est dans ses valeurs'))}</small>`) : cardOf(d))).join('')}</div></section>`).join('') : '';
            grid.innerHTML = tl.map(t => { const n = (I.by.get(t.id) || []).length, h = hits.get(t.id).length, mg = mergedOf(t.id);
                return `<button type="button" class="ldt-theme${searching && !h ? ' is-dim' : ''}" data-ldt-theme="${esc(t.id)}"><span class="ldt-ic" aria-hidden="true">${esc(t.icon)}</span><span class="ldt-txt"><b>${esc(T(t.label))} <i>${nf(searching ? h : n)}</i></b><small class="muted">${esc(T(t.hint || ''))}</small>${mg.length ? `<span class="ldt-mg">🔀 ${esc(mg.map(m => T(m.label)).join(' · '))}</span>` : ''}</span></button>`; }).join('');
            page.querySelectorAll('[data-ldt-chip]').forEach(b => { const on = b.dataset.ldtChip === chip; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
        };
        counts(); paint();
        let tq = 0;
        page.querySelector('[data-ld-ov-q]').addEventListener('input', e => { clearTimeout(tq); tq = setTimeout(() => { q = e.target.value; paint(); ext.listesValeurs?.warm(q, () => { if (page.isConnected && q.trim()) paint(); }); }, 60); });
        page.addEventListener('click', e => {
            const t = e.target; let b;
            if ((b = t.closest('[data-ldt-chip]'))) { chip = b.dataset.ldtChip; paint(); return; }
            if ((b = t.closest('[data-ldt-theme]'))) return openTheme(b.dataset.ldtTheme);
            if (t.closest('[data-ldt-settings]')) return goSettings();
            if ((b = t.closest('[data-ld-go]'))) return go(b.dataset.ldGo);
        });
        checkInstalls(() => { if (!page.isConnected) return; counts(); if (chip === 'install') paint(); page.querySelectorAll('[data-ld-state]').forEach(el => { if (notInstalled.has(el.dataset.ldState) && !el.textContent) el.innerHTML = `<span class="ldt-tag">${esc(T('à installer'))}</span>`; }); });
        void token; void app;
    }
    function go(v) {
        if (v.startsWith('link:')) { const d = (E().list?.() || []).find(x => x.id === v.slice(5)); try { d?.link(); } catch (x) { toast(x.message, 'error'); } return; }
        E().openKey?.(v);
    }
    function openTheme(id) { const st = A().state; if (!st) return; tabOf.delete(id); E().openKey?.(tkey(id)); }
    function goSettings() { const st = A().state; if (!st) return; st.maintenanceTab = SETTINGS_TAB; A().persistUiState?.(); A().setModule?.('maintenance'); }

    /* ═════════════ un thème : sa liste réunie, ou ses listes ═════════════ */
    const tabOf = new Map(); // thème → onglet choisi pendant la visite ('lists' ou l'id d'une liste réunie)
    const curTheme = () => { const k = String(A().state?.listType || ''); return k.startsWith(TKEY) ? k.slice(TKEY.length) : ''; };
    function renderTheme(id, token) {
        const host = ws(), t = themeById(id); if (!host || !t) return;
        const mg = mergedOf(id), want = tabOf.get(id) || (openMode() === 'reunie' && mg.length ? mg[0].id : 'lists');
        const m = mg.find(x => x.id === want);
        if (m) return E().render(m, token); // la page de la liste (moteur commun) ; pageTop() y pose les onglets du thème
        return renderThemeLists(id, token);
    }
    const tabsHtml = (id, on) => {
        const mg = mergedOf(id), plain = plainOf(id);
        return `<nav class="ldt-tabs" aria-label="${esc(T('Ce thème'))}"><button type="button" class="ldt-back" data-ldt-back>← ${esc(T('Tous les thèmes'))}</button>
            <span class="segmented ldt-seg" role="tablist">${mg.map(m => `<button type="button" role="tab" data-ldt-tab="${esc(m.id)}" aria-selected="${on === m.id}" class="${on === m.id ? 'is-active' : ''}">🔀 ${esc(T(m.label))}${m.sourceCount ? ` <i>${nf(m.sourceCount())}</i>` : ''}</button>`).join('')}<button type="button" role="tab" data-ldt-tab="lists" aria-selected="${on === 'lists'}" class="${on === 'lists' ? 'is-active' : ''}">${esc(T('Les {n} listes', {n: nf(plain.length)}))}</button></span></nav>`;
    };
    const bindTabs = (box, id) => box.addEventListener('click', e => {
        if (e.target.closest('[data-ldt-back]')) { const st = A().state; if (st) E().openKey?.(OVERVIEW); return; }
        const b = e.target.closest('[data-ldt-tab]'); if (!b) return;
        tabOf.set(id, b.dataset.ldtTab); const st = A().state; if (st) renderTheme(id, ++st.workspaceToken);
    });
    /** appelé par le moteur à chaque page de liste : dans un thème, ses onglets en haut */
    function pageTop(page, d) {
        const id = curTheme(); if (!id || !d.merged || themeOf(d) !== id) return;
        const box = document.createElement('div'); box.innerHTML = tabsHtml(id, d.id); const nav = box.firstElementChild;
        page.querySelector('.page-header')?.after(nav); bindTabs(nav, id);
    }
    function renderThemeLists(id, token) {
        const host = ws(), t = themeById(id), plain = plainOf(id), mg = mergedOf(id);
        host.innerHTML = `<section class="page collection-page ld-page ld-overview ldt-theme-page" data-ldt-page="${esc(id)}">${UI().pageHeader ? UI().pageHeader({where: `${T('Listes')} · 🧰 ${T('Données')}`, icon: t.icon, title: T(t.label), help: esc(T(t.hint || ''))}) : ''}
            ${mg.length ? '' : `<nav class="ldt-tabs"><button type="button" class="ldt-back" data-ldt-back>← ${esc(T('Tous les thèmes'))}</button></nav>`}
            <input type="search" class="ld-q ldt-q" data-ldt-q placeholder="${esc(T('Chercher dans ce thème…'))}" aria-label="${esc(T('Chercher dans ce thème'))}">
            <div class="ld-cards" data-ldt-cards>${[...mg, ...plain].map(cardOf).join('')}</div></section>`;
        const page = host.querySelector('.ldt-theme-page');
        if (mg.length) { const box = document.createElement('div'); box.innerHTML = tabsHtml(id, 'lists'); page.querySelector('.page-header')?.after(box.firstElementChild); }
        bindTabs(page.querySelector('.ldt-tabs'), id);
        page.querySelector('[data-ldt-q]').addEventListener('input', e => { const w = fold(e.target.value).split(/\s+/).filter(Boolean); page.querySelectorAll('.ld-card').forEach(c => { const d = (E().list?.() || []).find(x => listKey(x) === c.dataset.ldGo); c.hidden = !!w.length && !(d && w.every(x => hay(d).includes(x))); }); });
        page.querySelector('[data-ldt-cards]').addEventListener('click', e => { const b = e.target.closest('[data-ld-go]'); if (b) go(b.dataset.ldGo); });
        if (!installChecked) checkInstalls(() => { if (!page.isConnected) return; page.querySelectorAll('[data-ld-state]').forEach(el => { if (notInstalled.has(el.dataset.ldState) && !el.textContent) el.innerHTML = `<span class="ldt-tag">${esc(T('à installer'))}</span>`; }); });
        void token;
    }
    /** le sur-titre d'une liste : son thème (en mode thèmes) */
    const whereOf = d => { if (mode() !== 'themes') return ''; const t = themeById(themeOf(d)); return t ? `${t.icon} ${T(t.label)}` : ''; };

    /* ═════════════ Réglages → 🧰 Listes de données ═════════════ */
    const TAB = [SETTINGS_TAB, '25k3', '🧰 Listes de données'];
    function register() { const app = A(); if (!Array.isArray(app?.defaultMaintenanceTabs)) return false; if (!app.defaultMaintenanceTabs.some(x => x[0] === TAB[0])) app.defaultMaintenanceTabs.push(TAB); return true; }
    if (!register()) document.addEventListener('DOMContentLoaded', () => { if (!register()) setTimeout(register, 500); });
    const famKm = () => { const n = Number(readLS(K_KM, '15')); return Number.isFinite(n) && n > 0 ? Math.min(500, n) : 15; };
    const splitCount = () => { try { const v = JSON.parse(readLS(K_SPLIT, '{}')) || {}; return Object.values(v).reduce((a, x) => a + (Array.isArray(x) ? x.length : 0), 0); } catch (_) { return 0; } };
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => {
        const host = ws(); if (!host) return; const ro = kiosk();
        const radio = (name, v, cur, label, sub = '') => `<label class="checkbox-line"><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''} ${ro ? 'disabled' : ''}> <span>${esc(T(label))}${sub ? `<small class="muted"> — ${esc(T(sub))}</small>` : ''}</span></label>`;
        host.innerHTML = `<section class="page ldt-settings" data-ldt-settings-page>${UI().pageHeader ? UI().pageHeader({where: T('Réglages'), icon: '🧰', title: T('Listes de données'), help: esc(T('Comment Listes → 🧰 Données est rangé, et ce que montrent les listes réunies.')), saved: true}) : ''}
            ${ro ? `<p class="ldt-ro muted">🔒 ${esc(T('Mode consultation : les réglages ne changent pas.'))}</p>` : ''}
            <section class="maintenance-panel"><h3>🗂 ${esc(T('L’écran Listes → Données'))}</h3>
                ${radio('ldt-vue', 'themes', mode(), 'Par thème (20 thèmes)', 'Séismes, Guerres, Monuments… ; une recherche sur toutes les listes')}
                ${radio('ldt-vue', 'groupes', mode(), 'Les 4 groupes d’avant', 'Le lieu, La personne, Le monde, Chercher')}</section>
            <section class="maintenance-panel"><h3>🔀 ${esc(T('Un thème s’ouvre…'))}</h3>
                ${radio('ldt-ouvre', 'reunie', openMode(), 'Sur sa liste réunie quand il en a une', 'tous les séismes d’un coup, sans doublon')}
                ${radio('ldt-ouvre', 'listes', openMode(), 'Sur ses listes, une par une')}</section>
            <section class="maintenance-panel"><h3>👪 ${esc(T('« Dans la famille »'))}</h3>
                <label class="ldt-km">${esc(T('Qui vivait à moins de'))} <input type="number" min="1" max="500" step="1" inputmode="numeric" data-ldt-km value="${famKm()}" ${ro ? 'disabled' : ''}> km</label>
                <p class="muted"><small>${esc(T('Calculé ici, avec les lieux et les dates de ta généalogie : rien ne part sur Internet. Les fiches confidentielles n’y sont jamais. Une liste peut demander plus loin (un séisme se ressent à 150 km).'))}</small></p></section>
            <section class="maintenance-panel"><h3>✂ ${esc(T('Lignes séparées dans les listes réunies'))}</h3>
                <p data-ldt-split>${esc(splitCount() ? T('{n} séparations gardées (« ✂ Ce ne sont pas les mêmes »).', {n: nf(splitCount())}) : T('Aucune : l’app réunit tout ce qui se ressemble.'))}</p>
                ${splitCount() && !ro ? `<button type="button" class="button small secondary" data-ldt-unsplit>↺ ${esc(T('Tout réunir à nouveau'))}</button>` : ''}</section></section>`;
        const page = host.querySelector('[data-ldt-settings-page]');
        const after = () => { try { E().sync?.(); } catch (_) {} try { ext.listesReunies?.reset?.(); } catch (_) {} if (A().state?.module === 'maintenance' && A().state.maintenanceTab === TAB[0]) ext.maintenance[TAB[0]](); };
        const change = (msg, key, v) => { if (ro) return; if (A().undoLocalChange) A().undoLocalChange(msg, [key], () => writeLS(key, v), after); else { writeLS(key, v); toast(msg); } try { E().sync?.(); } catch (_) {} UI().markSaved?.(page); };
        page.addEventListener('change', e => {
            const t = e.target;
            if (t.name === 'ldt-vue') change(t.value === 'themes' ? T('Listes → Données : par thème') : T('Listes → Données : les 4 groupes d’avant'), K_VUE, t.value);
            if (t.name === 'ldt-ouvre') change(t.value === 'reunie' ? T('Un thème s’ouvre sur sa liste réunie') : T('Un thème s’ouvre sur ses listes'), K_OUVRE, t.value);
            if (t.matches('[data-ldt-km]')) { const n = Math.round(Number(t.value)); if (!(n > 0 && n <= 500)) { toast(T('Écris une distance entre 1 et 500 km.'), 'error'); t.value = famKm(); return; } change(T('« Dans la famille » : à {n} km', {n}), K_KM, n); }
        });
        page.querySelector('[data-ldt-unsplit]')?.addEventListener('click', () => { if (A().undoLocalChange) A().undoLocalChange(T('Les listes réunies réunissent tout à nouveau'), [K_SPLIT], () => writeLS(K_SPLIT, null), after); else writeLS(K_SPLIT, null); after(); });
        void token;
    };

    ext.listesThemes = {mode, openMode, themeOf, themes: () => [...themes(), RANGER], themeList, index, sync, overview, pageTop, whereOf, renderTheme, famKm, keyOf: tkey, settingsTab: SETTINGS_TAB, THEME_OF};
    try { E().sync?.(); } catch (_) {}
})();
