/* LCNDA — 🧩 Tous les types d'œuvres (maquette I de docs/design/profils-et-oeuvres.html), sur le moteur de types
 * (docs/TYPES.md : ART.define, ART.ft, ART.views…). Ce fichier est le NOYAU du domaine « œuvres » :
 *  - les 12 familles et le catalogue des types (ART.oeuvres.catalog) : les types déjà validés (A–H : peinture, disque,
 *    morceau, livre, film, exposition…), ceux de ce domaine (clés « o_… ») et les types de l'utilisateur (« Mes types ») ;
 *  - un petit langage pour décrire un type (OE.make) : groupes communs (photos, où est-elle, provenance, expositions,
 *    bibliographie, états et restaurations, crédits, prix…) + les champs propres du type ;
 *  - des sortes de champs en plus (employeur / organisme, revue, source : le menu de choix unique) et des vues (fiches
 *    « parties » d'une fiche : fontes d'une sculpture, mises en scène d'une pièce…) ;
 *  - « ＋ Nouvelle œuvre » : la fenêtre « Quelle sorte d'œuvre ? » (recherche, filtres par famille, ⚙️ Gérer les types).
 * Les types eux-mêmes : heritage-oeuvres-fiches.js (J, K, T détaillés) et heritage-oeuvres-types.js (tous les autres) ;
 * « ✎ Créer un type d'œuvre » : heritage-oeuvres-wizard.js (L) ; métiers d'art et artisan d'art : heritage-oeuvres-metiers.js (S).
 * Côté serveur : lib/oeuvres.php (les clés permises).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART?.define) return;
    const A = () => window.LCNDA_APP, X = () => window.LCNDA_EXT || {}, P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const U = ART.util, esc = U.esc, clone = U.clone;
    const OE = ART.oeuvres = ART.oeuvres || {};

    /* ═════════ Les 12 familles (domain = rangement du moteur ; chain = la ligne grise de la maquette) ═════════ */
    OE.FAMILIES = [
        {key: 'visual', icon: '🖼️', label: 'Arts visuels', domain: 'art', chain: 'Chaînes : Gravure → états → tirages · Sculpture → modèle → fontes · Photo → négatif → tirages → éditions · Installation → lieux successifs'},
        {key: 'music', icon: '🎵', label: 'Musique', domain: 'music', chain: 'Chaîne : Œuvre → mouvements → interprétations → enregistrements → parutions'},
        {key: 'stage', icon: '🎭', label: 'Scène', domain: 'film', chain: 'Chaîne : Œuvre → mise en scène / production → représentations (setlist, distribution du soir) → tournée'},
        {key: 'writing', icon: '✍️', label: 'Écrit', domain: 'books', chain: 'Chaînes : Texte → éditions → exemplaires · BD : série → albums → planches originales'},
        {key: 'screen', icon: '🎬', label: 'Image animée et son', domain: 'film', chain: 'Chaîne : Série → saisons → épisodes → diffusions'},
        {key: 'design', icon: '🔨', label: 'Design et métiers d’art', domain: 'art', chain: 'Fiches détaillées : affiche, ferronnerie ; chaque métier de la liste officielle propose son type d’œuvre (bouton ci-dessus)'},
        {key: 'space', icon: '🏛', label: 'Espace et paysage', domain: 'art', chain: 'Chaîne : Projet → plans → chantier → états successifs (transformations, démolition)'},
        {key: 'digital', icon: '💻', label: 'Numérique et jeux', domain: 'autre', chain: 'Chaîne : Œuvre → versions / éditions / extensions → plateformes'},
        {key: 'hobby', icon: '🧩', label: 'Modélisme et loisirs créatifs', domain: 'autre', chain: 'Maquette : échelle, matériaux, kit (marque, réf.), heures de travail, concours'},
        {key: 'taste', icon: '🍷', label: 'Saveurs et senteurs', domain: 'autre', chain: 'Ingrédients, millésimes, médailles aux concours, étiquettes (images)'},
        {key: 'link', icon: '🔗', label: 'Fiches qui relient', domain: 'autre', chain: 'Ce ne sont pas des œuvres : elles regroupent des œuvres et des personnes'},
        {key: 'mine', icon: '✎', label: 'Mes types', domain: 'autre', chain: 'Tes types ont les mêmes outils que les autres (champs affichés, liste, export, catalogue)'}];
    OE.fam = k => OE.FAMILIES.find(f => f.key === k) || OE.FAMILIES[OE.FAMILIES.length - 1];

    /* ═════════ Le catalogue : [clé, icône, nom, famille, drapeaux, mots de recherche, autres clés possibles]
       drapeaux : v = déjà validé (A–H), d = fiche détaillée (J, K, T) ; « alt » = clé d'un autre domaine qui la remplace ═════════ */
    const C0 = [
        ['work', '🖼️', 'Peinture', 'visual', 'v', 'tableau huile toile gouache'], ['o_dessin', '✏️', 'Dessin', 'visual', '', 'crayon fusain sanguine encre croquis'],
        ['o_aquarelle', '🎨', 'Aquarelle · pastel · gouache', 'visual', '', 'lavis'], ['o_gravure', '🪵', 'Gravure · estampe', 'visual', '', 'eau-forte burin lithographie sérigraphie bois linogravure taille-douce'],
        ['o_sculpture', '🗿', 'Sculpture', 'visual', 'd', 'bronze fonte marbre plâtre terre cuite statue buste statuette'], ['o_installation', '🧱', 'Installation', 'visual', '', 'art contemporain'],
        ['o_photo', '📷', 'Photographie', 'visual', '', 'négatif tirage autochrome daguerréotype plaque'], ['o_collage', '✂️', 'Collage · assemblage', 'visual', ''],
        ['o_fresque', '🏛', 'Fresque · peinture murale', 'visual', '', 'mural'], ['o_streetart', '🧯', 'Street art · graffiti', 'visual', '', 'pochoir tag'],
        ['o_mosaique', '◼️', 'Mosaïque', 'visual', '', 'tesselles'], ['o_vitrail', '🪟', 'Vitrail', 'visual', '', 'verrière maître verrier'],
        ['o_icone', '📜', 'Icône · enluminure', 'visual', '', 'manuscrit miniature'], ['o_calligraphie', '🖋', 'Calligraphie', 'visual', ''],
        ['o_illustration', '🖍', 'Illustration', 'visual', '', 'dessin de presse caricature'], ['o_landart', '🌾', 'Land art', 'visual', ''], ['o_performance', '🧍', 'Performance', 'visual', '', 'happening'],
        ['track_work', '🎵', 'Morceau · chanson', 'music', 'v', 'chanson valse bourrée'], ['recording', '🎙', 'Enregistrement', 'music', 'v', 'prise mixage'], ['release', '💿', 'Parution (disque)', 'music', 'v', 'vinyle cd 45 tours 78 tours'],
        ['master', '📀', 'Album', 'music', 'v'], ['o_concerto', '🎻', 'Concerto', 'music', 'd', 'soliste orchestre'], ['o_symphonie', '🎼', 'Symphonie', 'music', '', 'orchestre'],
        ['o_sonate', '🎹', 'Sonate · musique de chambre', 'music', '', 'quatuor trio duo'], ['o_savante', '🎼', 'Autre musique savante', 'music', '', 'suite prélude fugue étude'],
        ['o_opera', '🎭', 'Opéra (partition)', 'music', '', 'opérette lyrique'], ['o_oratorio', '⛪', 'Oratorio · cantate · messe', 'music', '', 'requiem motet liturgie'],
        ['o_musfilm', '🎞', 'Musique de film', 'music', '', 'bande originale'], ['o_musscene', '🩰', 'Musique de scène · de ballet', 'music'],
        ['o_arrangement', '📝', 'Arrangement · orchestration', 'music'], ['o_jingle', '📻', 'Indicatif · jingle', 'music', '', 'générique'],
        ['o_hymne', '🎺', 'Hymne · fanfare · chorale', 'music', '', 'harmonie marche chœur'], ['o_partition', '📄', 'Partition éditée', 'music', '', 'éditeur cotage'], ['concert', '🎤', 'Concert · tournée', 'music', 'v'],
        ['o_piece', '🎭', 'Pièce de théâtre', 'stage', 'd', 'comédie drame tragédie théâtre'], ['o_opera_prod', '🎭', 'Opéra (production)', 'stage', '', 'mise en scène lyrique'],
        ['o_ballet', '🩰', 'Ballet · danse', 'stage', '', 'chorégraphie danseur'], ['o_comedie_musicale', '🎶', 'Comédie musicale', 'stage'],
        ['o_seul_en_scene', '🎤', 'Seul en scène · humour', 'stage', '', 'sketch one-man-show humoriste'], ['o_cirque', '🎪', 'Arts du cirque', 'stage', '', 'trapèze jonglage clown dressage'],
        ['o_marionnettes', '🪆', 'Marionnettes', 'stage', '', 'guignol'], ['o_cabaret', '💃', 'Cabaret · revue · music-hall', 'stage'], ['o_conte', '📖', 'Conte · récit', 'stage', '', 'conteur veillée'],
        ['o_magie', '🎩', 'Magie · illusion', 'stage', '', 'prestidigitation'], ['o_lecture', '🗣', 'Lecture · mise en voix', 'stage'], ['o_rue', '🚶', 'Spectacle de rue', 'stage', '', 'arts de la rue'],
        ['o_son_lumiere', '🎆', 'Son et lumière · fête', 'stage', '', 'feu d’artifice défilé carnaval'], ['o_representation', '🎟', 'Représentation (setlist)', 'stage', '', 'setlist soirée date', ['performance', 'show', 'representation']],
        ['o_tournee', '🚌', 'Tournée', 'stage', '', '', ['tour']], ['o_festival', '🎪', 'Festival', 'stage', '', 'fête', ['festival']],
        ['book', '📚', 'Livre (édition)', 'writing', 'v', 'isbn édition'], ['text', '📝', 'Texte (roman, nouvelle…)', 'writing', 'v', 'roman nouvelle'], ['o_recueil', '📖', 'Recueil de poésie', 'writing', '', 'poèmes'],
        ['o_poeme', '🪶', 'Poème', 'writing', '', 'poésie vers'], ['o_article', '📰', 'Article · chronique', 'writing', '', 'journal presse'], ['o_essai', '🎓', 'Essai · thèse · mémoire', 'writing'],
        ['o_paroles', '🎶', 'Paroles de chanson', 'writing', '', 'parolier'], ['o_scenario', '🎬', 'Scénario', 'writing'], ['o_livret', '📜', 'Livret (opéra, ballet)', 'writing'],
        ['o_bd', '💬', 'Bande dessinée', 'writing', '', 'planche album BD'], ['o_traduction', '🌐', 'Traduction', 'writing'], ['o_correspondance', '✉️', 'Correspondance publiée', 'writing', '', 'lettres'],
        ['o_revue', '🗞', 'Revue · fanzine fondé', 'writing'], ['o_collectif', '📕', 'Ouvrage collectif · dictionnaire', 'writing', '', 'encyclopédie'], ['o_discours', '🗣', 'Discours (texte)', 'writing', '', 'allocution'],
        ['film', '🎬', 'Film', 'screen', 'v', 'cinéma long métrage'], ['o_court', '🎞', 'Court métrage', 'screen'], ['o_documentaire', '🎥', 'Documentaire', 'screen'],
        ['o_animation', '🐭', 'Cinéma d’animation', 'screen', '', 'dessin animé'], ['o_serie', '📺', 'Série TV', 'screen', '', 'saison épisode feuilleton', ['series', 'tv_series']],
        ['o_emission_tv', '📺', 'Émission de télévision', 'screen', '', 'télé'], ['o_emission_radio', '📻', 'Émission de radio', 'screen'], ['o_podcast', '🎧', 'Podcast', 'screen'],
        ['o_feuilleton', '📻', 'Feuilleton radio', 'screen'], ['o_clip', '📹', 'Clip vidéo', 'screen'], ['o_pub', '📢', 'Film publicitaire', 'screen', '', 'publicité réclame'],
        ['o_amateur', '📼', 'Film amateur · de famille', 'screen', '', 'super 8 9,5 mm'], ['o_video', '▶️', 'Vidéo en ligne', 'screen', '', 'youtube'], ['o_doublage', '🗣', 'Doublage · voix', 'screen', '', 'voix off'],
        ['o_affiche', '🪧', 'Affiche · graphisme', 'design', 'd', 'lithographie imprimeur placard'], ['o_logo', '🔤', 'Logo · identité visuelle', 'design'], ['o_police', '🅰️', 'Police de caractères', 'design', '', 'typographie fonte'],
        ['o_design', '🪑', 'Design d’objet', 'design'], ['o_mode', '👗', 'Mode (collection → modèle)', 'design', '', 'couture défilé'],
        ['o_ferronnerie', '⚒️', 'Ferronnerie d’art', 'design', 'd', 'fer forgé grille rampe forgeron serrurier'], ['o_ceramique', '🏺', 'Céramique · faïence · porcelaine', 'design', '', 'poterie grès'],
        ['o_verre', '🫙', 'Verre · cristal', 'design', '', 'soufflé'], ['o_orfevrerie', '💍', 'Orfèvrerie · bijou', 'design', '', 'argent or joaillerie bijouterie'],
        ['o_tapisserie', '🧵', 'Tapisserie · tissage', 'design', '', 'lice aubusson'], ['o_broderie', '🪡', 'Broderie · dentelle', 'design'], ['o_ebenisterie', '🪵', 'Ébénisterie · marqueterie', 'design', '', 'meuble'],
        ['o_reliure', '📕', 'Reliure', 'design'], ['o_lutherie', '🎻', 'Lutherie · facture d’instruments', 'design', '', 'violon accordéon orgue'], ['o_horlogerie', '🕰', 'Horlogerie', 'design', '', 'montre pendule'],
        ['o_medaille', '🏅', 'Médaille · sceau', 'design'], ['o_exlibris', '🔖', 'Ex-libris', 'design'],
        ['o_architecture', '🏠', 'Architecture · bâtiment', 'space', '', 'maison immeuble église'], ['o_jardin', '🌳', 'Jardin · paysage', 'space', '', 'parc'], ['o_urbanisme', '🗺', 'Urbanisme · aménagement', 'space'],
        ['o_monument', '🗽', 'Monument · mémorial', 'space', '', 'monument aux morts'], ['o_decor', '🎭', 'Décor · scénographie', 'space'], ['o_deco_interieure', '🛋', 'Décoration intérieure', 'space'], ['o_ouvrage_art', '🌉', 'Ouvrage d’art (pont…)', 'space', '', 'pont viaduc barrage'],
        ['o_jeu_video', '🕹', 'Jeu vidéo', 'digital'], ['o_jeu_societe', '🎲', 'Jeu de société', 'digital'], ['o_jdr', '🐉', 'Jeu de rôle · scénario', 'digital'], ['o_logiciel', '💾', 'Logiciel · application', 'digital'],
        ['o_site', '🌐', 'Site web', 'digital', '', 'internet'], ['o_art_numerique', '✨', 'Art numérique · génératif', 'digital'], ['o_modele3d', '🧊', 'Modèle 3D', 'digital'],
        ['o_maquette', '✈️', 'Maquette · modèle réduit', 'hobby', '', 'modélisme kit'], ['o_reseau', '🚂', 'Réseau ferroviaire miniature', 'hobby', '', 'train'], ['o_diorama', '🏞', 'Diorama', 'hobby'],
        ['o_figurine', '🪖', 'Figurine peinte', 'hobby', '', 'soldat de plomb'], ['o_automate', '⚙️', 'Automate', 'hobby'], ['o_tricot', '🧶', 'Tricot · couture (patron)', 'hobby', '', 'crochet'],
        ['o_scrapbook', '📒', 'Album · scrapbooking', 'hobby'], ['o_florale', '💐', 'Création florale', 'hobby', '', 'bouquet'],
        ['o_recette', '🍲', 'Recette · plat créé', 'taste', '', 'cuisine'], ['o_cuvee', '🍷', 'Cuvée · spiritueux', 'taste', '', 'vin millésime liqueur'], ['o_parfum', '🌹', 'Parfum', 'taste'],
        ['o_terroir', '🧀', 'Produit du terroir', 'taste'], ['o_variete', '🍎', 'Variété créée (rose, pomme…)', 'taste', '', 'obtention'],
        ['exhibition', '🏛', 'Exposition', 'link', 'v', 'salon'], ['o_festival', '🎪', 'Festival', 'link', '', 'fête', ['festival']], ['o_prix', '🏆', 'Prix · concours', 'link', '', 'récompense'],
        ['o_serie_coll', '🗂', 'Série · collection', 'link'], ['o_commande', '🤝', 'Commande · mécène', 'link', '', 'mécénat'], ['o_atelier', '🏚', 'Atelier · studio', 'link']];
    OE.catalog = C0.map(([key, icon, label, fam, flags = '', words = '', alt = []]) => ({key, icon, label, fam, validated: flags.includes('v'), detailed: flags.includes('d'), words, alt}));
    /** la définition à utiliser pour une entrée (celle d'un autre domaine si elle existe : « alt ») */
    OE.keyOf = e => (e.alt || []).find(k => ART.defs[k]) || e.key;
    OE.entry = key => OE.catalog.find(e => e.key === key || (e.alt || []).includes(key)) || null;
    OE.famOf = key => { const e = OE.entry(key); if (e) return e.fam; const d = ART.defs[key]; return d?.family || (d?.userType ? 'mine' : ({art: 'visual', music: 'music', books: 'writing', film: 'screen'}[d?.domain] || 'link')); };

    /* ═════════ Sortes de champs en plus : employeur / organisme, revue, source (le menu de choix unique) ═════════ */
    const pkItems = el => { const pk = el.querySelector('.pk'); if (!pk) return []; try { const v = JSON.parse(pk.dataset.pkValue || '[]'); return Array.isArray(v) ? v : v ? [v] : []; } catch (_) { return []; } };
    const refType = (kind, idKey, icon, label, tile) => ({label, badge: icon, tile,
        edit: (f, v) => { const vals = (f.many ? (Array.isArray(v) ? v : []) : [v]).filter(x => x && typeof x === 'object').map(x => Number(x[idKey]) > 0 ? {id: Number(x[idKey]), title: x.title || ''} : (x.txt ? `txt:${x.txt}` : null)).filter(Boolean);
            return P().pickerField({hiddenName: false, name: '', kind, allowFree: f.free !== false, multiple: !!f.many, value: f.many ? vals : (vals[0] || null)}); },
        get: (el, f) => { const l = pkItems(el).map(it => it.free || !it.id ? (it.title ? {txt: String(it.title)} : null) : {[idKey]: Number(it.id), title: it.title || ''}).filter(Boolean); return f.many ? l : (l[0] || null); },
        read: (f, v) => (f.many ? (Array.isArray(v) ? v : []) : [v]).filter(Boolean).map(x => `<span class="ar-ochip ${x[idKey] ? 'is-link' : 'is-free'}"><i>${esc(f.icon || icon)}</i>${esc(x.title || x.txt || '')}</span>`).join(' '),
        text: (f, v) => (f.many ? (Array.isArray(v) ? v : []) : [v]).filter(Boolean).map(x => x.title || x.txt || '').join(', '),
        empty: v => Array.isArray(v) ? !v.length : !(v && (v[idKey] || v.txt))});
    ART.ft.employer = refType('employer', 'empid', '🏭', 'Organisme, entreprise', '🏭 Organisme');
    ART.ft.periodical = refType('periodical', 'perid', '📰', 'Journal, revue', '📰 Journal, revue');
    ART.ft.source = refType('source', 'sid', '📚', 'Source', '📚 Source');

    /** une valeur calculée affichée comme une ligne ordinaire (« Personnages : 7 (4 F, 3 H) ») — rien à saisir */
    ART.ft.o_inline = {label: 'Calculé (ligne)', badge: 'auto', value: () => true, empty: () => false, edit: () => '<span class="muted">calculé tout seul</span>', collect: () => {},
        read: (f, v, ctx) => ART.views[f.view]?.read?.(ctx, ctx?.item, f) || '', text: (f, v, ctx) => ART.views[f.view]?.text?.(ctx, ctx?.item, f) || ''};

    /** des personnes avec un rôle, sur une seule ligne de la fiche (« Concepteur : 👤 Pierre MARTIN dessin et forge ») */
    ART.ft.o_ppl = {...ART.ft.people, label: 'Personnes et rôles (en ligne)', block: false, wide: true,
        read: (f, v, ctx) => ART.normPeople(v).map(r => U.personChip(r, r.role || '', ctx)).join(' ')};

    /* ═════════ Le petit langage pour décrire un type ═════════
       un champ : [clé, libellé, sorte, {options}] ; options.h = masqué au départ (dans « ⚙️ Champs affichés ») */
    const F = a => { if (!Array.isArray(a)) return a; const [key, label, type = 'text', o = {}] = a; const {h, ...rest} = o; return {key, label, type, star: !h, ...rest}; };
    OE.F = F;
    const fromWork = k => { const f = ART.fieldsOf(ART.defs.work || {groups: []}).find(x => x.key === k); return f ? clone(f) : null; };
    const PHOTO = [['face', 'Face'], ['dos', 'Dos'], ['detail', 'Détail'], ['signature', 'Signature, marque'], ['ancienne', 'Photo ancienne'], ['autre', 'Autre']];
    OE.PRIZE_STATUS = [['laureat', 'lauréat'], ['nomme', 'nommé'], ['or', 'médaille d’or'], ['argent', 'médaille d’argent'], ['bronze', 'médaille de bronze'], ['mention', 'mention']];
    /** les groupes communs, à prendre à la carte */
    const G = OE.G = {
        photos: (labels = PHOTO, label = 'Photos') => ({key: 'photos', label, zone: 'left', fields: [{key: 'photos', label, type: 'photos', star: true, labels}]}),
        ids: fields => ({key: 'numbers', label: 'Numéros', icon: '🔢', zone: 'left', fields: fields.map(F)}),
        credits: (label = 'Crédits', rolePh = 'rôle (auteur, interprète…)', o = {}) => ({key: o.key || 'credits', label, zone: 'main', fields: [{key: o.key || 'credits', label, type: 'people', star: o.h ? false : true, addLabel: o.add || 'Une personne', rolePh, section: true}]}),
        rows: (key, label, cols, o = {}) => ({key, label, icon: o.icon || '', zone: o.zone || 'main', fields: [{key, label, type: 'rows', star: !o.h, addLabel: o.add || 'Une ligne', cols: cols.map(F), view: o.view, bare: o.zone === 'right', section: true, unitWord: o.unit}]}),
        side: (key, label, icon, fields) => ({key, label, icon, zone: 'right', fields: fields.map(F)}),
        sec: (key, label, fields, icon = '') => ({key, label, icon, zone: 'main', fields: fields.map(F)}),
        where: () => G.side('where', 'Où est-elle', '📍', [['holder', 'Collection', 'text', {ph: 'Collection privée, musée…'}], ['owner', 'Propriétaire', 'person', {roleWord: 'propriétaire'}], ['location', 'Lieu', 'place', {short: 'Où'}], ['location_detail', 'Pièce, réserve, cote', 'text']]),
        prov: () => ({key: 'prov', label: 'Provenance', zone: 'main', fields: [fromWork('provenance') || F(['provenance', 'Provenance', 'longtext'])].map(f => ({...f, star: false}))}),
        expos: () => ({key: 'expos', label: 'Expositions', zone: 'main', fields: [fromWork('exhibitions') || F(['exhibitions', 'Expositions', 'longtext'])].map(f => ({...f, star: false}))}),
        biblio: () => ({key: 'biblio', label: 'Bibliographie', zone: 'main', fields: [fromWork('literature') || F(['literature', 'Bibliographie', 'longtext'])].map(f => ({...f, star: false}))}),
        states: () => ({key: 'states', label: 'États et restaurations', icon: '🩺', zone: 'right', fields: [fromWork('states') || F(['states', 'États', 'longtext'])].map(f => ({...f, star: false}))}),
        value: () => G.side('value', 'Valeur et assurance', '💶', [['value', 'Estimée', 'money', {h: 1}], ['value_by', 'Par', 'text', {h: 1}], ['insured', 'Assurée', 'text', {h: 1}]]),
        related: kinds => ({key: 'related', label: 'Œuvres liées', icon: '🔗', zone: 'right', fields: [{key: 'related', label: 'Œuvres liées', type: 'rows', star: false, bare: true, addLabel: 'Une œuvre liée',
            cols: [{key: 'w', label: 'Œuvre', type: 'item', kinds, w: 'l'}, {key: 'rel', label: 'Lien', w: 's', ph: 'étude pour, d’après…'}]}]}),
        prizes: () => G.rows('prizes', 'Prix et concours', [['year', 'Année', 'text', {w: 's'}], ['prize', 'Prix, concours', 'text', {w: 'l'}], ['org', 'Décerné par', 'text', {w: 'm'}], ['status', 'Résultat', 'select', {choices: OE.PRIZE_STATUS, w: 's'}]], {add: 'Un prix', h: 1, unit: 'prix'}),
        web: () => G.rows('links', 'Liens', [['label', 'Nom (site, base, archive…)', 'text', {w: 'm'}], ['url', 'Adresse', 'url', {w: 'l'}]], {add: 'Un lien', zone: 'right', icon: '🌐', h: 1}),
        docs: (label = 'Documents') => G.rows('docs', label, [['what', 'Pièce (dessin, devis, lettre, contrat…)', 'text', {w: 'l'}], ['date', 'Date', 'text', {w: 's'}], ['where', 'Où, cote', 'text', {w: 'm'}]], {add: 'Un document', zone: 'right', icon: '📄', h: 1}),
        notes: () => ({key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}),
    };
    /** pour un objet : où est-il, provenance, expositions, bibliographie, états, valeur */
    G.object = () => [G.where(), G.prov(), G.expos(), G.biblio(), G.states(), G.value()];

    const DEF_SORTS = [['year', 'Par année'], ['recent', 'Les plus récents'], ['az', 'A → Z'], ['za', 'Z → A'], ['perso', 'Mon ordre']];
    const lab = (choices, k) => ((choices || []).map(c => Array.isArray(c) ? c : [c, c]).find(c => String(c[0]) === String(k)) || [, k || ''])[1];
    OE.lab = lab;
    /** les filtres de « Filtrer ▾ » d'un type, tirés de ses champs (choix fixes, période, lieu, personne, sans photo) */
    OE.autoFilters = (def, extra = []) => store => {
        const list = store.of(def.key), fs = ART.fieldsOf(def, store.customFields?.(def.key) || []), out = [];
        fs.filter(f => (f.type === 'select' || f.type === 'list') && (f.filter !== false) && (f.choices || []).length).slice(0, 4).forEach(f => {
            const has = k => list.filter(it => (Array.isArray(it.data[f.key]) ? it.data[f.key] : [it.data[f.key]]).map(String).includes(String(k))).length;
            const opts = (f.choices || []).map(c => Array.isArray(c) ? c : [c, c]).filter(([k]) => k !== '' && has(k)).map(([k, l]) => [k, `${l} (${has(k)})`]);
            if (opts.length) out.push({id: `f_${f.key}`, label: f.short || f.label, group: f.short || f.label, type: 'check', options: opts, test: (it, v) => !v?.length || v.some(x => (Array.isArray(it.data[f.key]) ? it.data[f.key] : [it.data[f.key]]).map(String).includes(String(x)))});
        });
        out.push({id: 'from', label: 'De', group: 'Période', type: 'text', placeholder: '1900', test: (it, v) => !v || (Number(it.year) || 0) >= Number(v)},
            {id: 'to', label: 'À', group: 'Période', type: 'text', placeholder: '1950', test: (it, v) => !v || (Number(it.year) || 9999) <= Number(v)});
        const pf = fs.find(f => f.type === 'place');
        if (pf) out.push({id: 'place', label: pf.label, type: 'place', chipPrefix: 'À', test: (it, v) => !v || (typeof v === 'object' ? U.place(it.data[pf.key])?.plid === Number(v.id) : U.placeTitle(it.data[pf.key]).toLowerCase().includes(String(v).replace(/^txt:/, '').toLowerCase()))});
        const pe = fs.find(f => f.type === 'person');
        if (pe) out.push({id: 'person', label: pe.label, type: 'person', chipPrefix: pe.label, test: (it, v) => !v || (typeof v === 'object' ? U.person(it.data[pe.key])?.pid === Number(v.id) : U.nameOf(it.data[pe.key]).toLowerCase().includes(String(v).replace(/^txt:/, '').toLowerCase()))});
        if (fs.some(f => f.type === 'photos')) out.push({id: 'nophoto', label: 'Sans photo', group: 'Autres', type: 'check', test: (it, v) => !v || !ART.arr(it.data.photos).length});
        return [...out, ...extra.map(x => typeof x === 'function' ? x(store) : x).flat()];
    };

    /** décrire un type : OE.make({key, icon, label, many, fem, fam, main: [...champs], groups: [...], object: true, …}) */
    OE.make = spec => {
        const fam = OE.fam(spec.fam || OE.entry(spec.key)?.fam || 'link');
        const head = [F(['title', spec.titleLabel || 'Titre', 'text', {head: true, ph: spec.titlePh}])];
        if (spec.date !== false) head.push(F([spec.dateKey || 'date', spec.dateLabel || 'Date', 'date', {head: !spec.dateShown}]));
        const main = {key: 'main', label: spec.mainLabel || spec.label, zone: 'main', fields: [...head, ...(spec.main || []).map(F)]};
        const groups = [main];
        if (spec.photos !== false) groups.push(G.photos(spec.photos || PHOTO, spec.photosLabel || 'Photos'));
        groups.push(...(spec.groups || []));
        if (spec.object) groups.push(...G.object().filter(g => !groups.some(x => x.key === g.key)));
        if (spec.prizes !== false && !groups.some(g => g.key === 'prizes')) groups.push(G.prizes());
        if (!groups.some(g => g.key === 'links')) groups.push(G.web());
        groups.push(G.notes());
        const firstF = (spec.main || []).map(F).filter(f => !['rows', 'people', 'computed', 'longtext', 'photos'].includes(f.type) && f.star).slice(0, 3).map(f => f.key);
        const def = {
            key: spec.key, icon: spec.icon || OE.entry(spec.key)?.icon || '✦', label: spec.label || OE.entry(spec.key)?.label, many: spec.many, fem: !!spec.fem,
            domain: fam.domain, family: fam.key, hidden: !!spec.hidden, quiet: !!spec.quiet, parentField: spec.parentField || '', searchHint: spec.searchHint,
            eyebrow: spec.eyebrow || (it => [spec.label, ...(spec.eyebrowKeys || []).map(k => { const f = ART.fieldsOf(ART.defs[spec.key]).find(x => x.key === k); return f ? ART.text(ART.ctx({genderOf: () => 'u', personTitle: () => ''}, it), it, f) : ''; })].filter(Boolean).join(' · ')),
            heading: spec.heading, badges: spec.badges, crumbExtra: spec.crumbExtra, newData: spec.newData, upgrade: spec.upgrade, beforeSave: spec.beforeSave,
            cardLine: spec.cardLine || (it => [it.data?.date || it.year, ...firstF.slice(0, 2).map(k => { const v = it.data?.[k]; return typeof v === 'string' ? v : v?.title || v?.txt || ''; })].filter(Boolean).join(' · ')),
            groups, list: spec.list || ['photos', 'title', 'date', ...firstF], card: spec.card || ['date', ...firstF.slice(0, 2)], export: spec.export || [],
            listExtra: spec.listExtra, sorts: spec.sorts || DEF_SORTS, summary: spec.summary, chain: spec.chain || '', chainNote: spec.chainNote || '',
        };
        def.filters = OE.autoFilters(def, spec.filters || []);
        const d = ART.define(def);
        d.filters = OE.autoFilters(d, spec.filters || []);
        return d;
    };

    /* ═════════ Les fiches « parties » d'une fiche (fontes d'une sculpture, mises en scène d'une pièce, représentations…) ═════════
       champ {type: 'computed', view: 'o_children', child: 'o_cast', childField: 'sculpture', cols: [[clé, libellé, (it, ctx) => html]], add: 'Une fonte'} */
    OE.childrenOf = (store, it, child, field) => !it?.id ? [] : store.items.filter(x => x.kind === child && (Number(x.parent_id) === Number(it.id) || U.ref(x.data?.[field])?.iid === Number(it.id)));
    OE.newChildBtn = (it, child, field, label) => it?.id ? `<button type="button" class="button small secondary" data-oe-newchild="${esc(child)}" data-oe-field="${esc(field)}">＋ ${esc(label)}</button>` : '';
    ART.views.o_children = {
        meta: (ctx, it, f) => { const n = OE.childrenOf(ctx.store, it, ART.oeuvres.kindOf(f.child), f.childField).length; return n ? esc(U.plural(n, f.unit || 'fiche')) : ''; },
        actions: (ctx, it, f) => OE.newChildBtn(it, ART.oeuvres.kindOf(f.child), f.childField, f.add || `${ART.defs[OE.kindOf(f.child)]?.label || 'partie'}`),
        text: (ctx, it, f) => U.plural(OE.childrenOf(ctx.store, it, OE.kindOf(f.child), f.childField).length, f.unit || 'fiche'),
        read: (ctx, it, f) => {
            const kind = OE.kindOf(f.child), l = ART.sortItems ? ART.sortItems(OE.childrenOf(ctx.store, it, kind, f.childField), 'perso') : OE.childrenOf(ctx.store, it, kind, f.childField), cd = ART.defs[kind];
            if (!it.id) return '<p class="muted">Enregistre d’abord la fiche, puis ajoute ses parties.</p>';
            if (!l.length) return `<p class="muted">${esc(f.empty || 'Aucune pour l’instant.')}</p>`;
            const cols = f.cols || [['title', 'Titre'], ['date', 'Date']];
            const cell = (c, x) => { if (typeof c[2] === 'function') return c[2](x, ART.ctx(ctx.store, x)); const fd = ART.fieldsOf(cd || {groups: []}).find(y => y.key === c[0]); return fd ? ART.read(ART.ctx(ctx.store, x), x, fd) : esc(x.data?.[c[0]] ?? ''); };
            return `<div class="ar-scroll"><table class="ar-t oe-ctable"><thead><tr>${cols.map(c => `<th>${esc(c[1])}</th>`).join('')}<th></th></tr></thead><tbody>${l.map(x => `<tr class="is-click ${f.rowClass ? esc(f.rowClass(x)) : ''}" data-ar-row-open="${x.id}">${cols.map(c => `<td>${cell(c, x)}</td>`).join('')}<td class="d">↗</td></tr>`).join('')}</tbody></table></div>`;
        },
    };
    /** la clé d'un type, ou celle qui la remplace (un autre domaine) */
    OE.kindOf = k => { const e = OE.entry(k); return e ? OE.keyOf(e) : k; };
    // « ＋ Ajouter une fonte » : la nouvelle fiche part reliée à celle-ci
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-oe-newchild]'); if (!b) return; const C = b.closest('.ar-dlg')?._C; if (!C) return;
        e.preventDefault(); e.stopPropagation();
        const it = b.dataset.oeParent ? C.store.get(Number(b.dataset.oeParent)) : C.current(); if (!it?.id) return;
        const kind = b.dataset.oeNewchild, field = b.dataset.oeField, n = OE.childrenOf(C.store, it, kind, field).length;
        let pre = {}; try { pre = OE.childPreset?.[kind]?.(it, n) || {}; } catch (_) {}
        C.newItem(kind, {...pre, [field]: {iid: it.id, title: it.title, kind: it.kind}});
    }, true);

    /* ═════════ « ＋ Nouvelle œuvre » : Quelle sorte d'œuvre ? ═════════ */
    const PREFS = 'genealogie-oeuvres-prefs';
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    OE.norm = norm;
    OE.hiddenTypes = store => new Set(store?.global?.hiddenTypes || []);
    /** toutes les entrées montrées, famille par famille (les types de l'utilisateur dans « Mes types », ceux d'autres domaines rangés aussi) */
    OE.entries = store => {
        const out = OE.catalog.filter(e => ART.defs[OE.keyOf(e)]).map(e => ({...e, kind: OE.keyOf(e)}));
        const known = new Set(OE.catalog.flatMap(e => [e.key, ...(e.alt || [])]));
        Object.values(ART.defs).forEach(d => { if (known.has(d.key) || d.hidden || d.domain === 'profile' || d.key === 'profile' || d.key.startsWith('profile_') || d.quiet || ['org', 'copy'].includes(d.key)) return;
            const prof = ART.PF?.kindProfile?.(d.key) || d.profile; if (prof && prof !== 'artist') return; // les fiches des autres profils (mandat, club, brevet…) ne sont pas des œuvres
            out.push({key: d.key, kind: d.key, icon: d.icon, label: d.label, fam: d.userType ? (d.family && d.family !== 'mine' && OE.FAMILIES.some(f => f.key === d.family) && !d.mine ? d.family : 'mine') : OE.famOf(d.key), user: !!d.userType, words: ''}); });
        // les types de l'utilisateur sont aussi dans « Mes types » (même s'ils sont rangés dans une autre famille)
        out.filter(e => e.user && e.fam !== 'mine').forEach(e => out.push({...e, fam: 'mine'}));
        return out;
    };
    OE.openChooser = (C, {mode = null} = {}) => {
        const store = C.store, prefs = readJ(PREFS, {});
        let q = '', fam = '', showHidden = false, act = mode || prefs.act || 'new';
        const dlg = document.createElement('dialog'); dlg.className = 'modal oe-dlg'; dlg.dataset.ownClose = '1'; dlg.dataset.dndOff = ''; dlg.dataset.ordOff = '';
        dlg.innerHTML = `<div class="oe-shell"><header class="ar-top oe-top"><span class="ar-ticon">🎨</span><div class="ar-tname"><span class="eyebrow">${esc(store.name.toLocaleUpperCase('fr-FR'))} · ŒUVRES</span><h2>Quelle sorte d’œuvre ?</h2></div>
            <span class="segmented oe-act" role="tablist"><button type="button" data-oe-act="new">＋ Nouvelle fiche</button><button type="button" data-oe-act="list">☰ Voir la liste</button></span><span class="spacer"></span>
            <button type="button" class="button small secondary" data-oe-manage title="Cacher les types qui ne te servent jamais, modifier, exporter ou importer tes types">⚙️ Gérer les types</button>
            <button type="button" class="button small" data-oe-newtype>＋ Créer mon propre type…</button><button type="button" class="icon-button" data-oe-close aria-label="Fermer" title="Fermer">×</button></header>
            <div class="oe-body"><input type="search" class="oe-q" data-oe-q placeholder="Chercher un type… (ex. : bronze, opéra, affiche, ferronnerie, podcast)" aria-label="Chercher un type" autocomplete="off">
            <div class="ui-filters oe-famfilt" data-oe-famfilt></div><div class="oe-fams" data-oe-fams></div><div class="oe-metiers" data-oe-metiers></div>
            <div class="oe-info" data-oe-info aria-live="polite"></div>
            <div class="oe-legend"><span><span class="oe-tyc v">validé</span> déjà dans les fiches de base</span><span><span class="oe-tyc d">fiche détaillée</span></span><span><span class="oe-tyc u">créé par toi</span></span><label class="ui-toggle"><input type="checkbox" data-oe-showhidden><i></i>Montrer les types cachés</label></div></div></div>`;
        document.body.appendChild(dlg); dlg.showModal();
        const $ = s => dlg.querySelector(s);
        const close = () => { dlg.close(); dlg.remove(); };
        dlg.addEventListener('cancel', e => { e.preventDefault(); if (document.querySelector('.oe-dlg ~ dialog[open]')) return; if (q) { q = ''; $('[data-oe-q]').value = ''; paint(); return; } close(); });
        const count = k => store.of(k).length;
        const match = e => { if (!q) return true; const s = norm(`${e.label} ${e.words || ''} ${e.kind}`); return norm(q).split(/\s+/).filter(Boolean).every(w => s.includes(w)); };
        function paint() {
            const hidden = OE.hiddenTypes(store), all = OE.entries(store).filter(e => showHidden || !hidden.has(e.kind)), shown = all.filter(match);
            const fams = OE.FAMILIES.filter(f => f.key === 'mine' || all.some(e => e.fam === f.key));
            const nOf = k => shown.filter(e => e.fam === k).length;
            $('[data-oe-famfilt]').innerHTML = `<button type="button" class="${fam ? '' : 'is-active'}" data-oe-fam="">Tout (${shown.length})</button>${fams.map(f => `<button type="button" class="${fam === f.key ? 'is-active' : ''}" data-oe-fam="${f.key}">${esc(f.icon)} ${esc(f.label)} (${nOf(f.key)})</button>`).join('')}`;
            const chip = e => { const n = count(e.kind), hid = hidden.has(e.kind); return `<button type="button" class="oe-tyc ${e.validated ? 'v' : ''} ${e.detailed ? 'd' : ''} ${e.user ? 'u' : ''} ${hid ? 'is-hidden' : ''}" data-oe-kind="${esc(e.kind)}" title="${esc(act === 'list' ? 'Voir la liste' : 'Nouvelle fiche')} : ${esc(e.label)}">${esc(e.icon)} ${esc(e.label)}${n ? ` <small class="oe-n">${n}</small>` : ''}</button>`; };
            $('[data-oe-fams]').innerHTML = fams.filter(f => !fam || f.key === fam).map(f => { const l = shown.filter(e => e.fam === f.key); if (q && !l.length && f.key !== 'mine') return '';
                return `<section class="oe-famc ${f.key === 'mine' ? 'mine' : ''}"><div class="oe-fh"><b>${esc(f.icon)} ${esc(f.label)}</b><span class="spacer"></span><small>${esc(U.plural(l.length, 'type'))}</small></div><div class="oe-fb">${l.map(chip).join('') || (f.key === 'mine' ? '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🧩</span><span class="empty-line-text">Pas encore de type à toi.</span></p>' : '')}
                    ${f.key === 'design' && OE.openMetiers ? '<div class="oe-mine-btns"><button type="button" class="button small secondary" data-oe-metiers-open>⚒️ Les 16 domaines des métiers d’art…</button></div>' : ''}
                    ${f.key === 'mine' ? '<div class="oe-mine-btns"><button type="button" class="button small secondary" data-oe-newtype>＋ Créer mon propre type…</button><button type="button" class="button small secondary" data-oe-import>⤒ Importer un type</button></div>' : ''}<div class="oe-ch">${esc(f.chain)}</div></div></section>`; }).join('') || A().emptyState({icon: '🔍', text: `Aucun type pour « ${q} »`, hint: 'Vérifie l’orthographe, ou crée ton propre type.', action: {label: '＋ Créer mon propre type…', attrs: 'data-oe-newtype'}});
            dlg.querySelectorAll('[data-oe-act]').forEach(b => b.classList.toggle('is-active', b.dataset.oeAct === act));
            // les métiers d'art qui répondent (« dinandier » → pièce de métier d'art)
            const mbox = $('[data-oe-metiers]'); mbox.innerHTML = '';
            if (q.length >= 3 && OE.searchMetiers) { const hits = OE.searchMetiers(q).slice(0, 12); if (hits.length) mbox.innerHTML = `<div class="oe-mh">⚒️ Métiers d’art</div>${hits.map(h => `<button type="button" class="oe-tyc" data-oe-kind="${esc(h.type)}" data-oe-metier="${esc(h.nom)}" data-oe-domaine="${esc(h.domaine)}">${esc(h.icon || '⚒️')} ${esc(h.label)} <small class="oe-n">${esc(ART.defs[h.type]?.label || '')}</small></button>`).join('')}`; }
        }
        const info = btn => { const k = btn?.dataset?.oeKind, d = ART.defs[k]; if (!d) { $('[data-oe-info]').textContent = ''; return; }
            const stars = ART.fieldsOf(d).filter(f => f.star && !['title', '_linked', 'notes', 'photos'].includes(f.key)).map(f => f.label).slice(0, 12).join(', ');
            $('[data-oe-info]').innerHTML = `<b>${esc(d.icon)} ${esc(d.label)}</b>${d.chain ? ` <span class="oe-k">${esc(d.chain)}</span>` : ''} <span class="oe-s">★</span> ${esc(stars)}${ART.fieldsOf(d).some(f => !f.star) ? ` <span class="ar-g">— le reste est dans « ⚙️ Champs affichés »</span>` : ''}`; };
        function go(kind, preset = {}) {
            if (!ART.defs[kind]) return;
            close();
            const S = C.S; S.view = 'list'; S.kind = kind; S.id = 0; S.back = [];
            C.prefs.extraTabs = [...new Set([...(C.prefs.extraTabs || []), kind])]; C.savePrefs();
            C.paint(true);
            if (act === 'new') C.newItem(kind, preset);
        }
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
            if (d.oeClose !== undefined) return close();
            if (d.oeAct) { act = d.oeAct; prefs.act = act; writeJ(PREFS, prefs); return paint(); }
            if (d.oeFam !== undefined) { fam = d.oeFam; return paint(); }
            if (d.oeKind) return go(d.oeKind, d.oeMetier ? {metier: d.oeMetier, metier_domain: d.oeDomaine} : {});
            if (d.oeNewtype !== undefined) { close(); return ART.newTypeDialog?.(C); }
            if (d.oeManage !== undefined) { return OE.manageTypes(C, paint); }
            if (d.oeMetiersOpen !== undefined) { close(); return OE.openMetiers(C); }
            if (d.oeImport !== undefined) { const ok = await OE.importType?.(C); if (ok) { await C.reload(); paint(); } }
        });
        dlg.addEventListener('change', e => { if (e.target.matches('[data-oe-showhidden]')) { showHidden = e.target.checked; paint(); } });
        dlg.addEventListener('input', e => { if (e.target.matches('[data-oe-q]')) { q = e.target.value.trim(); paint(); } });
        dlg.addEventListener('mouseover', e => { const b = e.target.closest('[data-oe-kind]'); if (b) info(b); });
        dlg.addEventListener('focusin', e => { const b = e.target.closest('[data-oe-kind]'); if (b) info(b); });
        // clavier : ↓ depuis la case va au premier type ; ← → ↑ ↓ passent d'un type à l'autre ; Entrée choisit
        dlg.addEventListener('keydown', e => {
            const chips = [...dlg.querySelectorAll('[data-oe-kind]')];
            if (e.target.matches('[data-oe-q]')) { if (e.key === 'ArrowDown' && chips[0]) { e.preventDefault(); chips[0].focus(); } if (e.key === 'Enter' && chips[0]) { e.preventDefault(); chips[0].click(); } return; }
            const i = chips.indexOf(e.target); if (i < 0) return;
            const mv = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4}[e.key]; if (!mv) return; e.preventDefault();
            const j = i + mv; if (j < 0) return $('[data-oe-q]').focus(); chips[Math.min(j, chips.length - 1)]?.focus();
        });
        paint();
        setTimeout(() => $('[data-oe-q]')?.focus(), 30);
        return dlg;
    };

    /* ═════════ ⚙️ Gérer les types : cacher, modifier, exporter, importer, supprimer (H7 : « ↶ Annuler ») ═════════ */
    OE.manageTypes = (C, after) => {
        const store = C.store;
        const paint = dg => { const hidden = OE.hiddenTypes(store), all = OE.entries(store).filter((e, i, l) => l.findIndex(x => x.kind === e.kind) === i);
            dg.querySelector('[data-oe-mlist]').innerHTML = OE.FAMILIES.map(f => { const l = all.filter(e => (e.user ? 'mine' : e.fam) === f.key); if (!l.length) return '';
                return `<details class="ar-pgrp" ${f.key === 'mine' ? 'open' : ''}><summary><span>${esc(f.icon)} ${esc(f.label)}</span><span class="c">${l.filter(e => !hidden.has(e.kind)).length} sur ${l.length}</span></summary>${l.map(e => `<div class="ar-fr ${hidden.has(e.kind) ? 'off' : ''}" data-k="${esc(e.kind)}"><span></span><button type="button" class="ar-eye" data-m-eye title="${hidden.has(e.kind) ? 'Montrer' : 'Cacher'}">${hidden.has(e.kind) ? '🚫' : '👁'}</button><span class="lbl">${esc(e.icon)} ${esc(e.label)}</span><span class="ty">${esc(U.plural(store.of(e.kind).length, 'fiche'))}</span>
                    <span class="tools">${e.user ? '<button type="button" data-m-edit title="Modifier ce type">✎</button><button type="button" data-m-export title="⤓ Exporter le type (pour le donner)">⤓</button><button type="button" data-m-del title="Supprimer ce type">🗑</button>' : ''}</span></div>`).join('')}</details>`; }).join(''); };
        X().openDialog({eyebrow: 'ŒUVRES', title: '⚙️ Gérer les types', submitLabel: 'Fermer', wide: true,
            body: `<p class="ar-phelp">👁 cache un type qui ne te sert jamais (ses fiches restent). Tes types : ✎ modifier, ⤓ exporter pour le donner à un cousin, 🗑 supprimer.</p><div class="ar-plist oe-mlist" data-oe-mlist></div><div class="ar-pbtns"><button type="button" class="button small secondary" data-m-new>＋ Créer mon propre type…</button><button type="button" class="button small secondary" data-m-import>⤒ Importer un type</button></div>`,
            onOpen: dg => { paint(dg); dg.addEventListener('click', async e => {
                const b = e.target.closest('button'); if (!b) return; const k = b.closest('[data-k]')?.dataset.k, d = b.dataset;
                try {
                    if (d.mEye !== undefined) { const g = store.global = store.global || {}; const h = new Set(g.hiddenTypes || []); if (h.has(k)) h.delete(k); else h.add(k); g.hiddenTypes = [...h]; await ART.persistSettings(store); paint(dg); after?.(); return; }
                    if (d.mEdit !== undefined) { dg.close(); document.querySelector('.oe-dlg')?.close(); document.querySelector('.oe-dlg')?.remove(); return ART.newTypeDialog?.(C, {key: k}); }
                    if (d.mExport !== undefined) return OE.exportType(k);
                    if (d.mNew !== undefined) { dg.close(); document.querySelector('.oe-dlg')?.close(); document.querySelector('.oe-dlg')?.remove(); return ART.newTypeDialog?.(C); }
                    if (d.mImport !== undefined) { if (await OE.importType(C)) { await C.reload(); paint(dg); after?.(); } return; }
                    if (d.mDel !== undefined) {
                        const t = (store.types || []).find(x => x.key === k); if (!t) return;
                        if (store.of(k).length) { A().toast(`Ce type a encore ${U.plural(store.of(k).length, 'fiche')} : supprime-les d’abord.`, 'error'); return; }
                        await ART.write('delete_type', {key: k}); delete ART.defs[k]; await C.reload(); paint(dg); after?.();
                        A().undoToast(`Type « ${t.label} » supprimé`, {undo: async () => { await ART.write('save_type', {key: k, label: t.label, def: t.def}); await C.reload(); paint(dg); after?.(); }});
                    }
                } catch (er) { A().toast(er.message, 'error'); }
            }); },
            onSubmit: () => true});
    };
    OE.exportType = k => { const t = ART.defs[k]; if (!t) return; const d = clone({...t}); delete d.filters; A().exportSettingFile?.('types-oeuvres', t.label, {type: {label: t.label, def: {...d, groups: (d.groups || []).filter(g => g.key !== '_linked' && g.key !== '_mine'), userType: undefined}}}); };
    OE.importType = async C => {
        const got = await A().importSettingFile?.('types-oeuvres', {names: Object.values(ART.defs).map(d => d.label), check: x => x && x.type && typeof x.type.label === 'string' && x.type.def && Array.isArray(x.type.def.groups)});
        if (!got) return false;
        try { const r = await ART.write('save_type', {key: '', label: got.nom, def: {...got.donnees.type.def, label: got.nom}}); A().toast(`Type « ${got.nom} » importé : il est dans « ✎ Mes types ».`); return r.key; }
        catch (e) { A().toast(e.message, 'error'); return false; }
    };

    // « ＋ » des onglets du catalogue, et « ＋ Nouvelle œuvre » : la fenêtre « Quelle sorte d'œuvre ? » (au lieu de la petite liste)
    document.addEventListener('click', e => {
        const b = e.target.closest('.ar-dlg [data-ar-cmd="morekinds"]'); if (!b) return; const C = b.closest('.ar-dlg')?._C; if (!C) return;
        e.preventDefault(); e.stopPropagation(); OE.openChooser(C, {mode: b.dataset.oeMode || null});
    }, true);

    /* ═════════ La page de l'artiste : « 🧩 Autres œuvres » (toutes les fiches des types de ce domaine, par famille) ═════════ */
    ART.pageSections.oeuvres = {icon: '🧩', label: 'Autres œuvres', w: 'ligne', render: C => {
        const st = C.store, base = new Set(['work', 'release', 'master', 'track_work', 'recording', 'book', 'text', 'film', 'exhibition', 'concert', 'copy', 'org', 'profile']);
        const kinds = Object.keys(ART.defs).filter(k => !base.has(k) && !ART.defs[k].hidden && !k.startsWith('profile') && st.of(k).length);
        const n = kinds.reduce((a, k) => a + st.of(k).length, 0);
        const body = kinds.length ? OE.FAMILIES.map(f => { const ks = kinds.filter(k => (ART.defs[k].userType ? 'mine' : OE.famOf(k)) === f.key); if (!ks.length) return '';
            return `<div class="oe-pfam"><b>${esc(f.icon)} ${esc(f.label)}</b> ${ks.map(k => `<button type="button" class="ar-ochip is-link" data-ar-tab="${esc(k)}"><i>${esc(ART.defs[k].icon)}</i>${esc(ART.defs[k].many || ART.defs[k].label)} · ${st.of(k).length}</button>`).join('')}</div>`; }).join('') : '<p class="muted">Sculptures, affiches, pièces, concertos, ferronnerie… : « ＋ Nouvelle œuvre ».</p>';
        return {count: n || '', body, actions: '<button type="button" class="button small secondary" data-ar-cmd="morekinds" data-oe-mode="new">＋ Nouvelle œuvre</button>'};
    }};
})();
