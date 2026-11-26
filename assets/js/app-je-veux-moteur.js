/* LCNDA — 🧭 Je veux… : le moteur (maquette validée docs/design/je-veux.html, parties 5 et 6).
 * Chargé seulement à la première ouverture (⌘K en mode « 🧭 Je veux… », Recherche → 🧭 Je veux faire…, Listes → 🧭 Tout ce que
 * l'app sait faire, Réglages → 🧭 Je veux…) par app-je-veux.js : le démarrage de l'app ne change pas.
 *
 *  - Le registre des intentions : une petite fiche par chose que l'app sait faire {id, fam, icon, name, does, path, words, phrases,
 *    act, obj, needs {person, place, date, list}, ro (marche en consultation), go(ctx), steps (👣 Montre-moi), last (le dernier
 *    bouton, jamais cliqué par l'app : imprimer, fusionner, envoyer, supprimer)}. Les fiches écrites à la main (ci-dessous) +
 *    celles fabriquées toutes seules depuis ce qui existe déjà : onglets (appModules), pages des Réglages (defaultMaintenanceTabs
 *    + leurs mots de « Chercher un réglage… »), listes (defaultListTypes), Graphiques (diagrammes et statistiques), types de
 *    Recherche, outils / actions / « ＋ Créer… » des Raccourcis (LCNDA_EXT.shortcuts.catalog), thèmes des données, catalogue
 *    « ＋ Ajouter un onglet » (ses mots). Une fiche écrite à la main qui couvre une cible (target) remplace la fiche automatique.
 *  - Lire la phrase, sans Internet ni IA : sans accents ni majuscules, petits mots retirés, fautes de frappe rattrapées
 *    (Damerau ≤ 1, ≤ 2 pour les mots longs), synonymes ; un verbe (l'action), des choses (les objets), « dans une fiche »,
 *    « pour mamie », des années ; les personnes et les lieux sont cherchés ensuite par l'écran (picker_search, homonymes avec
 *    leurs dates) et posés avec applyPeople / applyPlace.
 *  - Classer : des points pour l'action, les objets, les mots, les phrases ; 1 à 3 réponses et d'autres idées ; « C'est bien
 *    ça ? » seulement quand l'app n'est pas sûre (verbe ou objet manquant, deux personnes du même nom, réponses trop proches).
 *
 * API : LCNDA_EXT.jeVeuxEngine = {FAM, ACTS, OBJS, POUR, fold, dist, hand(), build({t}), analyse(q, reg), applyPeople(u, cands),
 *       applyPlace(u, place), rank(u, reg), confidence(u, r), pre(it, u), steps(it), set(u, key, value)} ;
 *       LCNDA_EXT.intents = le registre (après build). Essais : tests/test-je-veux.js, tests/test-je-veux-couverture.js. */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const A = () => root.LCNDA_APP || {};
    const S = () => A().state || {};
    const X = () => root.LCNDA_EXT || {};
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
    const strip = s => String(s ?? '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}＋+⤓⤒↗✎☑▶👣⋯·›→]/gu, ' ').replace(/\s+/g, ' ').trim();

    /** Damerau (transposition voisine comptée 1), arrêtée dès que max est dépassé */
    function dist(a, b, max = 2) {
        if (a === b) return 0;
        if (Math.abs(a.length - b.length) > max) return max + 1;
        const n = a.length, m = b.length; let p2 = null, p1 = Array.from({length: m + 1}, (_, j) => j);
        for (let i = 1; i <= n; i++) {
            const c = [i]; let low = i;
            for (let j = 1; j <= m; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                let v = Math.min(p1[j] + 1, c[j - 1] + 1, p1[j - 1] + cost);
                if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
                c[j] = v; if (v < low) low = v;
            }
            if (low > max) return max + 1;
            p2 = p1; p1 = c;
        }
        return p1[m];
    }

    /* ═════ les familles (le catalogue « 🗂 Tout parcourir » et la liste de Listes) ═════ */
    const FAM = {saisir: ['✍️', 'Saisir'], chercher: ['🔎', 'Chercher'], montrer: ['🌳', 'Montrer'], imprimer: ['🖨', 'Imprimer, exporter'], partager: ['📤', 'Partager'],
        ranger: ['🧺', 'Ranger, panier'], verifier: ['✅', 'Vérifier'], donnees: ['📊', 'Données'], outils: ['🛠', 'Outils'], reglages: ['⚙️', 'Réglages']};

    /* ═════ les mots : l'action, la chose, pour qui ═════ */
    const ACTS = {
        imprimer: ['🖨', 'imprimer', /imprim|sur papier|sur une feuille|\bpdf\b|\ba4\b|\ba3\b/],
        fusionner: ['🔗', 'fusionner', /fusion|regroup|reunir|en double|\bmerge/],
        envoyer: ['📤', 'envoyer', /envoy|partag|transmet|donner a|\bmail|courriel|publier/],
        exporter: ['⤓', 'exporter', /export|gedcom|\bcsv\b|excel|tableur/],
        importer: ['⤒', 'importer', /import|heredis|geneanet|ancestry|gramps|myheritage|charger un fichier/],
        sauvegarder: ['💾', 'sauvegarder', /sauveg|copie de secours|backup|\bsauver ma\b|\bsauver la\b/],
        trouver: ['🔎', 'trouver', /trouv|cherch|\bsavoir\b|connaitre|qui (etait|a |sont|est)|retrouv|\bou est\b|\bou sont\b|combien/],
        verifier: ['✅', 'vérifier', /verifi|control|erreur|incoheren|corrig|\bfautes?\b|\bnettoy/],
        mettre: ['📥', 'mettre', /\bmettre\b|\bmets\b|ranger|inserer|coller|\bgarder (dans|pour)/],
        ajouter: ['＋', 'ajouter', /ajout|saisi|nouvel|nouveau|nouvelle|\bentrer\b|\bnoter\b|enregistr|\bcreer une (fiche|personne)/],
        lire: ['📜', 'lire', /\blire\b|dechiffr|transcri|latin|\blecture/],
        retoucher: ['🎚', 'retoucher', /retouch|restaur|repar|ameliorer|colori|recadr|abime/],
        calculer: ['🧮', 'calculer', /calcul|convert|combien de temps|ecart entre/],
        raconter: ['✍️', 'raconter', /racont|\brecit|biograph|ecrire (un|le) livre|\blivre de famille/],
        comparer: ['⚖', 'comparer', /compar|difference entre/],
        apprendre: ['▶', 'apprendre', /apprend|\btuto|visite guidee|comment (ca marche|on fait|faire pour)|\baide\b/],
        changer: ['🎨', 'changer', /chang|\bregl|modifier l|personnalis|mettre en (sombre|clair)|activer|desactiv|allumer|eteindre|\bcacher\b/],
        supprimer: ['🗑', 'supprimer', /supprim|effac|enlever|\bretirer|jeter|\bcorbeille/],
        jouer: ['🎲', 'jouer', /\bjouer\b|\bjeux?\b|puzzle|\bquiz/],
        faire: ['✏️', 'faire', /\bfaire\b|\bfais\b|\bcreer\b|\bcree\b|dessin|represent|construire|fabriqu|generer|\bpreparer/],
        voir: ['👀', 'voir', /\bvoir\b|afficher|regarder|montr|\bouvr|consult|visualis|\bliste des\b/],
    };
    const OBJS = {
        arbre: ['🌳', 'un arbre', /\barbres?\b|ascendan|genealogique|eventail|\bsosa\b/],
        fiche: ['📒', 'une fiche', /\bfiches?\b(?! de)/],
        liste: ['📋', 'une liste', /\blistes?\b|\btableau\b|\blignes\b/],
        lieu: ['📍', 'des lieux', /\blieux?\b|\bcommunes?\b|\bvillages?\b|\bvilles?\b|\bparoisses?\b/],
        personne: ['👤', 'une personne', /\bpersonnes?\b|\bfiches? de\b|\benfants?\b|\bquelqu un\b/],
        diagramme: ['📈', 'un diagramme', /diagramm|graphique|camembert|courbe|\bstatistiques?\b|\bstats?\b|histogramme/],
        metier: ['🧱', 'les métiers', /metiers?|profession/],
        seisme: ['🌋', 'les séismes', /seism|tremblements? de terre|eruption/],
        guerre: ['⚔️', 'la guerre', /\bguerres?\b|soldats?|poilus?|militaire|mort pour la france|1914|1870|regiment/],
        temoin: ['🕸', 'les témoins', /temoins?|parrains?|marraines?/],
        mariage: ['💍', 'un mariage', /mariages?|\bnoces?\b|\bmaries\b|\bepoux\b/],
        photo: ['🖼', 'une photo', /\bphotos?\b|\bimages?\b|\bscans?\b|portraits?|\bcartes? postales?/],
        base: ['🗃', 'toute la base', /\bbase\b|tout l arbre|toute la genealogie|toute ma genealogie|\bma genealogie\b/],
        couleur: ['🎨', 'les couleurs', /couleurs?|\btheme\b|\bsombre\b|\bclair\b|police|taille du texte|apparence/],
        acte: ['📜', 'un acte ancien', /\bactes?\b|\bpapiers\b|registres?|vieux documents?|\bmanuscrit/],
        doublon: ['👥', 'les doublons', /doublons?|en double/],
        carte: ['🗺', 'une carte', /\bcartes?\b(?! postale)|\bplan\b|\bmigrations?\b/],
        famille: ['👪', 'une famille', /\bfamilles?\b|\bparents\b|\bcouple\b/],
        meteo: ['🌦', 'la météo', /meteo|temps qu il|\bhiver\b|orages?|canicule/],
        sauvegarde: ['💾', 'une sauvegarde', /sauvegardes?|copie de secours/],
        source: ['📚', 'les sources', /\bsources?\b|citations?|references?/],
        enquete: ['🔍', 'une enquête', /enquetes?|\bpistes?\b/],
        battue: ['🔦', 'une battue', /battues?/],
        rappel: ['⏰', 'un rappel', /rappels?|a faire|pense bete|\btaches?\b/],
        chrono: ['🕰', 'une chronologie', /chronolog|\bfrises?\b|\bdates\b/],
        recensement: ['🏠', 'les recensements', /recensements?|denombrement/],
        document: ['📄', 'un document', /\bdocuments?\b|\blettres?\b|\bpdf\b/],
        video: ['🎬', 'une vidéo', /\bvideos?\b|\bfilms?\b|montage|\bcassettes?\b/],
        son: ['🎧', 'un son', /\bsons?\b|\baudio\b|enregistrement|\bvoix\b/],
        livre: ['📐', 'un livre', /\blivres?\b|mise en page|\balbum\b|\bbrochure/],
        panier: ['🧺', 'un panier', /paniers?/],
        etiquette: ['🏷', 'une étiquette', /etiquettes?|\btags?\b/],
        onglet: ['🗂', 'un onglet', /onglets?|\bmenu\b/],
        adn: ['🧬', 'l’ADN', /\badn\b|\bdna\b|correspondances? genetique/],
        maison: ['🏠', 'une maison', /\bmaisons?\b|\bpieces?\b/],
        prenom: ['🔤', 'les prénoms', /prenoms?|\bnoms?\b|patronymes?|orthographe|variantes?/],
        mesure: ['🪙', 'une mesure ancienne', /\bmesures?\b|monnaie|\blivres tournois|\bfrancs?\b|toise|calendrier republicain|republicain/],
        deces: ['🪦', 'un décès', /\bdeces\b|\bmorts?\b|\bdecede|insee|sepulture/],
        widget: ['🧱', 'un widget', /widgets?|tableau de bord/],
        raccourci: ['⌨️', 'un raccourci', /raccourcis?|\btouches?\b|clavier/],
        ia: ['🤖', 'l’IA', /\bia\b|intelligence artificielle|\bassistant\b|ollama/],
        archive: ['🏛', 'les archives', /\barchives?\b|\bcotes?\b|\bad\b/],
        visage: ['🙂', 'les visages', /visages?|reconnaissance/],
        succession: ['⚖️', 'une succession', /successions?|heritiers?|notaire/],
        courrier: ['📮', 'un courrier', /courriers?|\bdemandes? d actes?/],
    };
    const POUR = {mamie: ['🧓', 'mamie', 'gros caractères, grand format', /\b(mamie|mamy|meme|grand mere|papi|papy|pepe|grand pere|grands parents|personne agee)\b/],
        cousin: ['🤝', 'un cousin', 'sans les vivants (« Pour partager »)', /\b(cousins?|cousines?|oncles?|tantes?|la famille|un proche|proches)\b/], moi: ['🙂', 'moi', 'pour toi seulement', /\bpour moi\b/]};
    const STOP = new Set('a ai as au aux avec ce ces cet cette dans de des du d en et est etait je j l la le les leur leurs ma me mes mon ne n pas par pour que qu qui sur ta tes ton tu un une veux voudrais voudrai voulais faudrait aimerais souhaite peux puis comment est il elle y on nous chez pres moi toi se sa son ses si ou comme plus tout toute tous toutes avoir etre faut fait truc trucs chose choses quelque quoi bien deux trois quatre mettre'.split(' '));

    /* ═════ ce que ▶ ouvre : les gestes de l'app (rien n'est cliqué à la place de la personne au dernier bouton) ═════ */
    const startId = () => Number(S().currentPersonId) || Number(S().bootstrap?.startPersonId) || 0;
    const pid = c => Number(c?.person?.id) || 0;
    const mod = (m, set) => async (c = {}) => { const st = S(); if (set) set(st, c); return A().setModule?.(m); };
    const maint = tab => mod('maintenance', st => { st.maintenanceTab = tab; });
    const list = type => mod('listes', st => { st.listType = type; st.precisePlaceKey = ''; });
    const graph = gm => mod('graphiques', (st, c) => { st.graphMode = gm; if (pid(c)) st.currentPersonId = pid(c); });
    const research = (kind, more) => mod('recherche', (st, c) => { st.researchKind = kind; if (more) more(st, c); });
    const enq = tab => mod('enquetes', st => { st.enquetesTab = tab; st.currentInvestigationId = 0; st.currentBattueId = 0; });
    const sheet = async (c = {}) => { const id = pid(c) || startId(); if (id && A().openPersonById) return A().openPersonById(id); return A().setModule?.('personnes'); };
    const call = (name, ...a) => () => { const f = name.split('.').reduce((o, k) => o?.[k], X()); return typeof f === 'function' ? f(...a) : undefined; };
    const data = q => async c => { const say = [q, c?.place?.title ? `près de ${c.place.title}` : '', c?.when || ''].filter(Boolean).join(' '); if (X().dataHome?.ask) return X().dataHome.ask(say); return A().setModule?.('donnees'); };

    /* ═════ les intentions écrites à la main ═════
     * H(id, famille, icône, nom, ce que ça fait, chemin, {act, obj, words, phrases, needs, ro, go, last, target(s), into, pour, pr, pre}) */
    const H = (id, fam, icon, name, does, path, o = {}) => ({id, fam, icon, name, does, path, src: 'main', ro: o.ro !== false, act: o.act || [], obj: o.obj || [], words: o.words || '', phrases: o.phrases || [],
        needs: o.needs || {}, go: o.go || null, last: o.last || '', targets: [].concat(o.target || []), into: o.into || '', pour: o.pour || '', pr: o.pr || 0, pre: o.pre || null, steps: o.steps || null, module: o.module || ''});
    function hand() {
        return [
            /* ✍️ Saisir */
            H('add_person', 'saisir', '👤', 'Ajouter une personne', 'Une nouvelle fiche, avec ses dates et ses lieux.', ['Personnes', '＋ Nouvelle personne'], {act: ['ajouter', 'faire'], obj: ['personne', 'fiche'], words: 'creer fiche nouvelle individu', phrases: ['ajouter une personne', 'nouvelle fiche', 'creer une fiche'], ro: false, go: () => A().openNewPersonDialog?.(), target: 'action:new_person', module: 'personnes', last: 'Enregistrer', pr: 1}),
            H('add_family', 'saisir', '⚡', 'Saisir une famille d’un coup', 'Père, mère, mariage et enfants en une seule fenêtre.', ['Personnes', '⚡ ＋ Famille'], {act: ['ajouter'], obj: ['famille', 'mariage'], words: 'pere mere enfants couple fratrie', phrases: ['saisir une famille', 'ajouter une famille'], ro: false, go: async () => { await A().setModule?.('personnes'); return A().openQuickFamilyDialog?.(); }, module: 'personnes', last: 'Enregistrer'}),
            H('add_event', 'saisir', '📅', 'Ajouter un événement à une fiche', 'Naissance, mariage, métier, déménagement… avec sa date et son lieu.', ['Personnes', 'la fiche', '＋ Événement'], {act: ['ajouter', 'mettre'], obj: ['mariage', 'personne', 'deces'], words: 'evenement naissance deces bapteme date deménagement', needs: {person: 1}, ro: false, go: sheet, module: 'personnes'}),
            H('add_parent', 'saisir', '👪', 'Relier un père ou une mère', 'Sur une fiche, le « ＋ » de « Parents » : c’est comme ça que l’arbre se construit.', ['Personnes', 'la fiche', 'Parents ＋'], {act: ['ajouter', 'mettre'], obj: ['famille', 'personne'], words: 'pere mere parent relier lien', needs: {person: 1}, ro: false, go: sheet, module: 'personnes'}),
            H('add_photo', 'saisir', '🖼', 'Ajouter une photo ou un scan', 'Une image sur une fiche : portrait, acte, carte postale.', ['Personnes', 'la fiche', '📎 Médias'], {act: ['ajouter', 'mettre'], obj: ['photo', 'document'], words: 'image portrait scanner joindre', needs: {person: 1}, ro: false, go: sheet, module: 'personnes'}),
            H('add_source', 'saisir', '📚', 'Citer une source', 'Dire d’où vient une information : un acte, un livre, un site.', ['Personnes', 'la fiche', 'Sources ＋'], {act: ['ajouter', 'mettre'], obj: ['source', 'acte'], words: 'citer source reference preuve', needs: {person: 1}, ro: false, go: sheet, module: 'personnes'}),
            H('transcribe', 'saisir', '📜', 'Transcrire un acte', 'Recopier un acte à côté de son image, mot à mot.', ['Listes', 'Transcriptions d’actes', '＋ Nouvelle transcription'], {act: ['lire', 'ajouter'], obj: ['acte'], words: 'recopier ecrire texte transcription', ro: false, go: call('openActTranscriber', {}), target: 'tool:transcription', module: 'listes'}),
            H('add_reminder', 'saisir', '⏰', 'Ajouter un rappel', 'Une chose à faire, avec sa date : écrire aux archives, relancer un cousin.', ['Listes', 'Rappels', '＋ Nouveau rappel'], {act: ['ajouter', 'faire'], obj: ['rappel'], words: 'rappel tache a faire noter penser', ro: false, go: list('reminders'), module: 'listes'}),
            H('new_investigation', 'saisir', '🔍', 'Ouvrir une enquête', 'Suivre une question difficile : pistes, documents, ce qui reste à faire.', ['Enquêtes', '🔍 Enquêtes', '＋ Nouvelle enquête'], {act: ['ajouter', 'faire'], obj: ['enquete'], words: 'enquete piste mystere', ro: false, go: enq('enquetes'), module: 'enquetes', target: 'action:new_investigation'}),
            H('new_battue', 'saisir', '🔦', 'Préparer une battue', 'Fouiller les registres d’une commune ou d’une région, commune par commune.', ['Enquêtes', '🔦 Battue', '＋ Nouvelle battue'], {act: ['ajouter', 'faire', 'trouver'], obj: ['battue', 'lieu', 'acte'], words: 'battue fouiller communes registres', ro: false, go: enq('battue'), module: 'enquetes', target: ['action:new_battue', 'tool:battues']}),
            H('census', 'saisir', '🏠', 'Relever un recensement', 'Les habitants d’une maison, une année de recensement.', ['Listes', 'Recensements'], {act: ['ajouter', 'voir'], obj: ['recensement'], words: 'recensement habitants maison menage', ro: false, go: list('census'), module: 'listes'}),
            /* 🔎 Chercher */
            H('ask', 'chercher', '💬', 'Poser une question sur la famille', 'La réponse courte, avec les fiches : témoins, enfants, cousins, records…', ['Recherche', 'Poser une question en français'], {act: ['trouver'], obj: ['temoin', 'mariage', 'personne', 'guerre', 'famille'], words: 'qui quand combien question temoins enfants freres soeurs', phrases: ['qui etait', 'les enfants de', 'combien de'], pr: 5, needs: {person: 1},
                go: research('question', (st, c) => { st.hQuestion = c.question || c.q || ''; }), target: 'search:question', module: 'recherche'}),
            H('find_person', 'chercher', '👤', 'Retrouver une personne', 'Taper un nom, un prénom ou un surnom : la fiche s’ouvre.', ['Recherche', 'Texte, personne ou lieu'], {act: ['trouver', 'voir'], obj: ['personne', 'fiche'], words: 'nom prenom surnom fiche personne', needs: {person: 1}, go: async c => (pid(c) ? sheet(c) : research('text')(c)), target: 'search:text', module: 'recherche'}),
            H('witness', 'chercher', '🕸', 'Réseau : témoins et voisins', 'Qui était là aux baptêmes et mariages, et qui revient souvent.', ['Graphiques', 'Réseau : témoins et voisins'], {act: ['trouver', 'voir'], obj: ['temoin', 'mariage'], words: 'reseau voisins parrains marraines', needs: {person: 1}, go: graph('social'), target: 'graph:social', module: 'graphiques'}),
            H('gaps', 'chercher', '🔍', 'Que manque-t-il ?', 'Les actes qui manquent à une fiche, et où les chercher.', ['Recherche', '🔍 Que manque-t-il ?'], {act: ['trouver', 'verifier'], obj: ['acte', 'personne'], words: 'manque trou manquant lacune', needs: {person: 1}, go: research('gaps'), target: 'search:gaps', module: 'recherche'}),
            H('where', 'chercher', '🌍', 'Où chercher ?', 'Les archives et les sites à ouvrir pour une personne, un lieu et une époque.', ['Recherche', '🌍 Où chercher ?'], {act: ['trouver'], obj: ['acte', 'archive', 'lieu'], words: 'archives departementales registre site en ligne', go: research('ou_chercher'), target: 'search:ou_chercher', module: 'recherche'}),
            H('walls', 'chercher', '🧩', 'Murs de brique', 'Les ancêtres où tu bloques, et des idées pour passer.', ['Recherche', '🧩 Murs de brique'], {act: ['trouver'], obj: ['personne'], words: 'bloque bloquer mur impasse ancetre inconnu', go: research('murs'), target: 'search:murs', module: 'recherche'}),
            H('insee', 'chercher', '🪦', 'Décès depuis 1970 (INSEE)', 'Chercher un décès dans le fichier de l’INSEE.', ['Recherche', 'Décès (fichier INSEE)'], {act: ['trouver'], obj: ['deces', 'personne'], words: 'deces mort insee 1970 fichier', go: research('insee'), target: 'search:insee', module: 'recherche'}),
            H('web', 'chercher', '🌐', 'Chercher sur internet', 'Les sites de généalogie ouverts avec le nom, les dates et le lieu déjà tapés.', ['Recherche', 'Chercher sur internet'], {act: ['trouver'], obj: ['personne', 'archive'], words: 'internet site web geneanet en ligne', needs: {person: 1}, go: research('web'), target: 'search:web', module: 'recherche'}),
            H('kinship', 'chercher', '🧬', 'Quel lien entre deux personnes ?', 'Le chemin de parenté, et le nom du lien (cousin issu de germain…).', ['Recherche', '🧬 Lien de parenté'], {act: ['trouver', 'voir'], obj: ['famille', 'personne'], words: 'lien parente cousin cousine issu germain relation', phrases: ['quel lien', 'lien de parente'], go: research('kinship'), target: 'search:kinship', module: 'recherche'}),
            H('war', 'chercher', '⚔️', 'Guerres et soldats', 'Morts pour la France, Poilus, régiments : qui a fait la guerre dans ta famille.', ['Données', '⚔️ Guerres et soldats'], {act: ['trouver', 'voir', 'verifier'], obj: ['guerre'], words: 'soldat poilu regiment combattant mort pour la france ancetre ancetres', pr: 1, go: data('les morts pour la France de la famille'), module: 'donnees'}),
            H('journal', 'chercher', '🗓', 'Noter une recherche faite', 'Le journal : ce que tu as déjà regardé, pour ne pas le refaire.', ['Recherche', '🗓 Journal des recherches'], {act: ['ajouter', 'voir'], obj: ['archive', 'acte'], words: 'journal deja cherche fait visite registre consulte', ro: false, go: research('journal'), target: 'search:journal', module: 'recherche'}),
            /* 🌳 Montrer */
            H('tree', 'montrer', '🌳', 'Voir l’arbre des ascendants', 'Les parents, grands-parents… d’une personne, à l’écran.', ['Graphiques', 'Arbre des ascendants'], {act: ['voir', 'faire'], obj: ['arbre'], words: 'ascendants ancetres parents grands parents', needs: {person: 1}, go: graph('ancestors'), target: 'graph:ancestors', module: 'graphiques'}),
            H('desc', 'montrer', '🌲', 'Voir les descendants', 'Les enfants, petits-enfants… d’une personne.', ['Graphiques', 'Arbre des descendants'], {act: ['voir', 'faire'], obj: ['arbre'], words: 'descendants enfants petits enfants posterite', needs: {person: 1}, go: graph('descendants'), target: 'graph:descendants', module: 'graphiques'}),
            H('fan', 'montrer', '🌀', 'Éventail des générations', 'L’arbre en demi-cercle, joli à montrer.', ['Graphiques', 'Éventail des générations'], {act: ['voir', 'faire'], obj: ['arbre'], words: 'eventail roue cercle demi cercle', needs: {person: 1}, go: graph('fan'), target: 'graph:fan', module: 'graphiques'}),
            H('lifemap', 'montrer', '🗺', 'Carte de la vie', 'Les lieux d’une vie, animés sur la carte.', ['Carte', '🗺 Carte de la vie'], {act: ['voir'], obj: ['carte', 'lieu'], words: 'parcours deplacements vie lieux animes', needs: {person: 1}, go: c => X().lifeMap?.open?.(pid(c) || startId()), module: 'carte'}),
            H('map', 'montrer', '🗺', 'Voir les lieux sur la carte', 'Les naissances, mariages et décès de la famille, posés sur la carte.', ['Carte'], {act: ['voir'], obj: ['carte', 'lieu'], words: 'carte lieux villages naissances points', go: mod('carte'), target: 'module:carte', module: 'carte'}),
            H('migrations', 'montrer', '🧭', 'Migrations d’une branche', 'D’où partent et où arrivent les familles, génération après génération.', ['Graphiques', 'Migrations d’une branche'], {act: ['voir', 'faire'], obj: ['carte', 'lieu', 'famille'], words: 'migration deplacement exode demenagement', needs: {person: 1}, go: graph('migrations'), target: 'graph:migrations', module: 'graphiques'}),
            H('diagram', 'montrer', '📈', 'Faire un diagramme', 'Tu dis ce que tu veux montrer, l’app propose les bons dessins (« Je veux représenter… »).', ['Diagrammes', '＋ Nouveau', '💬 Je veux représenter…'], {act: ['faire', 'voir'], obj: ['diagramme', 'metier', 'prenom', 'deces', 'mariage'], words: 'representer statistique chiffres pyramide camembert frise', pr: 2,
                go: async c => { // ＋ Nouveau → 💬 Je veux représenter…, avec la phrase (l'assistant propose les dessins ; rien n'est créé)
                    const d = X().diagrammesOnglet;
                    if (!d?.go || d.on?.() === false) { S().graphMode = 'distribution'; return A().setModule?.('graphiques'); }
                    await d.go({view: 'new', door: 'ask', nav: 'all', id: 0, model: -1});
                    for (let i = 0; i < 40; i++) { const inp = document.querySelector('[data-dga-q]'); if (inp) { if (c.q) { inp.value = c.q; inp.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); } return; } await new Promise(r => setTimeout(r, 100)); }
                }, module: 'diagrammes'}),
            H('occ', 'montrer', '🧱', 'Transmission des métiers', 'Qui faisait quel métier, de père en fils.', ['Graphiques', 'Transmission des métiers'], {act: ['voir', 'faire'], obj: ['metier'], words: 'profession pere fils metier transmis', go: graph('occupations'), target: 'graph:occupations', module: 'graphiques'}),
            H('occtree', 'montrer', '🌲', 'Arbre des métiers', 'L’arbre où chaque case dit le métier.', ['Graphiques', 'Arbre des métiers'], {act: ['voir', 'faire'], obj: ['metier', 'arbre'], words: 'profession', go: graph('occtree'), target: 'graph:occtree', module: 'graphiques'}),
            H('kinship_graph', 'montrer', '🔗', 'Liens de parenté (dessin)', 'Le dessin qui relie deux personnes par leurs ancêtres communs.', ['Graphiques', 'Liens de parenté'], {act: ['voir'], obj: ['famille'], words: 'lien parente ancetre commun', go: graph('kinship'), target: 'graph:kinship', module: 'graphiques'}),
            H('monograph', 'montrer', '🏘', 'Monographie d’une commune', 'Tout ce que la base sait d’un village : actes, familles, chiffres.', ['Graphiques', 'Monographie de commune'], {act: ['voir', 'trouver'], obj: ['lieu'], words: 'monographie village commune paroisse histoire locale', needs: {place: 1}, go: graph('place_monograph'), target: 'graph:place_monograph', module: 'graphiques'}),
            H('timeline', 'montrer', '🕰', 'La chronologie d’une vie', 'Les événements d’une personne dans l’ordre, avec l’histoire autour.', ['Chronologie'], {act: ['voir', 'raconter'], obj: ['chrono', 'personne'], words: 'chronologie frise vie evenements ordre', needs: {person: 1}, go: mod('chronologie', (st, c) => { if (pid(c)) st.currentPersonId = pid(c); }), target: 'module:chronologie', module: 'chronologie'}),
            H('simple', 'montrer', '🧓', 'Mode simple', 'Gros boutons, gros textes, rien à casser : pour montrer l’arbre à quelqu’un.', ['Barre du haut', '🧓 Mode simple'], {act: ['voir', 'changer'], obj: ['arbre'], words: 'montrer personne agee gros boutons simple', pour: 'mamie', go: call('modeSimple.open'), last: '🧓'}),
            H('kiosk', 'montrer', '🔒', 'Mode consultation', 'La famille regarde sans pouvoir rien changer.', ['Barre du haut', '🔒 Mode consultation'], {act: ['voir', 'changer'], obj: ['base'], words: 'regarder sans modifier lecture seule consultation proteger', go: () => document.querySelector('#kiosk-toggle')?.focus(), last: '🔒'}),
            H('dashboard', 'montrer', '🏠', 'Tableau de bord du jour', 'Anniversaires, rappels, chiffres clés : ce qui t’attend aujourd’hui.', ['Tableau de bord'], {act: ['voir'], obj: ['widget'], words: 'accueil aujourd hui anniversaires du jour', go: mod('dashboard'), target: 'module:dashboard', module: 'dashboard'}),
            /* 🖨 Imprimer, exporter */
            H('print_tree', 'imprimer', '🖨', 'Imprimer un arbre', 'Un arbre sur papier, A4 ou A3, portrait ou paysage.', ['Graphiques', 'Arbre des ascendants', '⤓ Exporter'], {act: ['imprimer'], obj: ['arbre'], words: 'pdf feuille papier imprimante gros caracteres', pr: 3, pour: 'mamie', needs: {person: 1}, go: graph('ancestors'), last: '⤓ Exporter', module: 'graphiques'}),
            H('poster', 'imprimer', '🧩', 'Grand format à assembler', 'Un très grand arbre, sur plusieurs feuilles A4 ou A3 à coller.', ['Graphiques', 'Arbre des ascendants', '🧩 Grand format'], {act: ['imprimer', 'faire'], obj: ['arbre'], words: 'affiche poster grand mur assembler', pr: 1, needs: {person: 1}, go: graph('ancestors'), last: '🧩', module: 'graphiques'}),
            H('deco', 'imprimer', '🌳', 'Arbre décoratif à offrir', 'Un bel arbre illustré, à imprimer ou à offrir.', ['Listes', 'Outils de modification', 'Arbre décoratif'], {act: ['imprimer', 'faire'], obj: ['arbre'], words: 'offrir cadeau decoratif joli illustre', needs: {person: 1}, go: call('openDecorTree'), target: 'tool:arbre', ro: false}),
            H('print_sheet', 'imprimer', '📄', 'Imprimer une fiche', 'La fiche d’une personne sur papier.', ['Personnes', 'la fiche', '🖨 Imprimer'], {act: ['imprimer'], obj: ['fiche', 'personne'], words: 'fiche papier', needs: {person: 1}, go: sheet, last: '🖨', module: 'personnes'}),
            H('print_map', 'imprimer', '🗺', 'Imprimer une carte', 'La carte de la famille en grand : A3, A2, A1…', ['Carte', '⤓ Exporter'], {act: ['imprimer'], obj: ['carte'], words: 'carte papier poster a3 a2', go: mod('carte'), last: '⤓', module: 'carte'}),
            H('gedcom', 'imprimer', '⤓', 'Exporter en GEDCOM', 'Un fichier lisible par les autres logiciels de généalogie.', ['Réglages', 'Export propre', 'GEDCOM'], {act: ['exporter', 'envoyer'], obj: ['base', 'arbre'], words: 'fichier logiciel gedcom ged', go: maint('export'), last: 'GEDCOM', module: 'maintenance'}),
            H('export_list', 'imprimer', '📋', 'Exporter une liste en tableur', 'Les lignes d’une liste en CSV ou Excel, pour les trier ailleurs.', ['Listes', 'ta liste', '⤓ Exporter'], {act: ['exporter', 'imprimer'], obj: ['liste'], words: 'csv excel tableur xlsx', go: mod('listes'), last: '⤓', module: 'listes'}),
            H('book', 'imprimer', '📐', 'Faire un livre de famille', 'Un livre mis en page : textes, photos, arbres, prêt à imprimer.', ['Listes', 'Outils de modification', 'Atelier de mise en page'], {act: ['faire', 'raconter', 'imprimer'], obj: ['livre'], words: 'livre album mise en page brochure', ro: false, go: call('openLayoutStudio'), target: 'tool:miseenpage'}),
            H('cards', 'imprimer', '📰', 'Faire-part et affiches', 'Un faire-part, une affiche de cousinade, une carte à envoyer.', ['Listes', 'Outils de modification', 'Faire-part et affiches'], {act: ['faire', 'imprimer'], obj: ['document'], words: 'faire part affiche cousinade invitation carte', ro: false, go: call('openCardMaker'), target: 'tool:fairepart'}),
            /* 📤 Partager */
            H('share_list', 'partager', '📤', 'Envoyer une liste à quelqu’un', 'Les lignes choisies, en fichier tableur (CSV ou Excel), à joindre à un mail.', ['Listes', 'ta liste', '☑ Choisir', '⤓ Exporter'], {act: ['envoyer', 'exporter'], obj: ['liste'], words: 'csv excel tableur mail joindre', pr: 2, go: mod('listes'), last: '⤓', module: 'listes'}),
            H('share_export', 'partager', '🤝', 'Export « Pour partager »', 'Tout l’arbre, sans les vivants ni les fiches confidentielles.', ['Réglages', 'Export propre', 'Pour partager'], {act: ['envoyer', 'exporter'], obj: ['base', 'arbre'], words: 'sans vivants confidentiel partager', pour: 'cousin', go: maint('export'), last: 'Pour partager', module: 'maintenance'}),
            H('cousin', 'partager', '🗄', 'Copie chez un cousin', 'Une copie de secours de ta base, gardée chez quelqu’un de confiance.', ['Réglages', 'Copie chez un cousin'], {act: ['envoyer', 'sauvegarder'], obj: ['base', 'sauvegarde'], words: 'copie confiance garder ailleurs', pour: 'cousin', go: maint('cousin_vault'), target: 'maint:cousin_vault', module: 'maintenance', ro: false}),
            H('sync', 'partager', '👥', 'Travail à deux', 'Deux personnes sur la même généalogie, sans se marcher dessus.', ['Réglages', 'Travail à deux'], {act: ['envoyer', 'faire'], obj: ['base'], words: 'deux ensemble synchroniser travailler a deux', go: maint('sync'), target: 'maint:sync', module: 'maintenance', ro: false}),
            H('slideshow', 'partager', '🎞', 'Faire un diaporama', 'Des photos et des textes qui défilent, pour une fête de famille.', ['Listes', 'Outils de modification', 'Présentation et diaporama'], {act: ['faire', 'voir'], obj: ['photo', 'video'], words: 'diaporama presentation defiler fete', ro: false, go: call('openSlideshow'), target: 'tool:diaporama'}),
            /* 🧺 Ranger, panier */
            H('fiche_add', 'ranger', '📒', 'Mettre dans une fiche', 'Ajouter des lignes (une liste, des données) dans une de tes Fiches, avec « 📥 Prendre depuis… ».', ['Fiches', 'ta fiche', '📥 Prendre depuis…'], {act: ['mettre', 'ajouter'], obj: ['seisme', 'guerre', 'meteo', 'liste', 'fiche'], words: 'prendre depuis inserer fiche thematique', pr: 2, into: 'fiche', ro: false, go: mod('fiches'), last: '📥', module: 'fiches'}),
            H('basket', 'ranger', '🧺', 'Mettre dans un panier', 'Rassembler des fiches, des lieux, des sources pour plus tard.', ['Paniers', '＋ Nouveau panier'], {act: ['mettre', 'ajouter'], obj: ['personne', 'lieu', 'liste', 'panier', 'source'], words: 'rassembler garder plus tard panier', into: 'panier', go: async () => { if (X().connexions?.openBasket) return X().connexions.openBasket(); return A().setModule?.('paniers'); }}),
            H('labels', 'ranger', '🏷', 'Mettre une étiquette', 'Marquer des fiches (« à vérifier », « branche Nice »…).', ['Réglages', 'Étiquettes'], {act: ['mettre', 'ajouter'], obj: ['etiquette', 'personne'], words: 'etiquette tag marquer couleur', ro: false, go: maint('labels'), target: 'maint:labels', module: 'maintenance'}),
            H('branches', 'ranger', '🌿', 'Ranger en branches', 'Isoler une lignée ou un dossier de travail : la branche Durand, la branche de Nice.', ['Réglages', 'Branches'], {act: ['mettre', 'faire'], obj: ['famille'], words: 'branche lignee isoler dossier', ro: false, go: maint('branches'), target: 'maint:branches', module: 'maintenance'}),
            H('documents', 'ranger', '📄', 'Ranger mes documents', 'Tes photos, actes et lettres, de A à Z, rangés en dossiers.', ['Documents'], {act: ['mettre', 'voir'], obj: ['document', 'photo', 'acte'], words: 'ranger dossier classer', go: mod('documents'), target: 'module:documents', module: 'documents'}),
            /* ✅ Vérifier */
            H('control', 'verifier', '✅', 'Contrôle de la base', 'Les dates impossibles, les âges bizarres, les oublis.', ['Réglages', '✅ Contrôle de la base'], {act: ['verifier'], obj: ['base'], words: 'erreurs incoherences impossible bizarre', go: maint('controle'), target: 'maint:controle', module: 'maintenance', ro: false}),
            H('dupes', 'verifier', '👥', 'Fusionner deux personnes', 'Deux fiches pour la même personne : on en garde une.', ['Réglages', 'Fusion de doublons'], {act: ['fusionner'], obj: ['personne', 'doublon', 'fiche'], words: 'doublon double meme personne', ro: false, go: maint('duplicates'), target: 'maint:duplicates', last: 'Fusionner', module: 'maintenance'}),
            H('merge_places', 'verifier', '📍', 'Fusionner deux lieux', 'Deux noms pour le même lieu (« St-Chamas » et « Saint-Chamas ») : on garde le bon, tout suit.', ['Réglages', 'Modifications groupées', '📍 Lieux en double'], {act: ['fusionner'], obj: ['lieu', 'doublon'], words: 'commune village double meme lieu', pr: 2, ro: false, go: maint('bulk'), target: 'maint:bulk', last: 'Fusionner', module: 'maintenance'}),
            H('harmo', 'verifier', '🔤', 'Harmoniser les variantes', 'Mettre la même orthographe partout (noms, lieux, métiers).', ['Réglages', 'Harmoniser les variantes'], {act: ['fusionner', 'verifier', 'changer'], obj: ['prenom', 'lieu', 'metier'], words: 'orthographe variante harmoniser', ro: false, go: maint('harmonize'), target: 'maint:harmonize', module: 'maintenance'}),
            H('changes', 'verifier', '↶', 'Défaire une modification', 'Le journal de ce qui a changé, et ce qui peut se remettre.', ['Réglages', 'Journal des modifications'], {act: ['voir', 'supprimer'], obj: ['base'], words: 'annuler defaire journal modification supprime restaurer retour', go: maint('changes'), target: 'maint:changes', module: 'maintenance'}),
            H('safety', 'verifier', '🛡', 'Comparer deux versions de la base', 'Ce qui a changé entre une sauvegarde et aujourd’hui.', ['Réglages', 'Sécurité & comparaison'], {act: ['comparer', 'verifier'], obj: ['base', 'sauvegarde'], words: 'comparer version difference securite', go: maint('safety'), target: 'maint:safety', module: 'maintenance', ro: false}),
            /* 📊 Données */
            H('data_ask', 'donnees', '📊', 'Demander aux données', 'Une question sur les listes de l’app : météo, séismes, élections…', ['Données', '💬 Demander'], {act: ['trouver', 'voir'], obj: ['seisme', 'meteo', 'guerre'], words: 'question donnees elections', go: async c => data(c.q || '')(c), target: 'module:donnees', module: 'donnees'}),
            H('seismes', 'donnees', '🌋', 'Séismes près d’un lieu', 'Les tremblements de terre connus, autour d’une commune, avec la distance.', ['Données', '🌋 Séismes'], {act: ['voir', 'trouver'], obj: ['seisme'], words: 'tremblement terre seisme', go: data('les séismes près des lieux de la famille'), module: 'donnees'}),
            H('meteo', 'donnees', '🌦', 'Météo d’autrefois', 'Le temps qu’il faisait un jour de mariage ou un hiver terrible.', ['Données', '🌦 Météo d’autrefois'], {act: ['voir', 'trouver'], obj: ['meteo', 'mariage'], words: 'temps hiver orage canicule', go: data('la météo d’autrefois'), module: 'donnees'}),
            H('stats', 'donnees', '📊', 'Chiffres de la famille', 'Âges, prénoms, métiers, naissances par siècle : les statistiques.', ['Graphiques', 'Statistiques'], {act: ['voir', 'trouver'], obj: ['diagramme', 'prenom', 'metier'], words: 'statistiques chiffres moyenne age prenoms frequents', go: mod('graphiques'), module: 'graphiques'}),
            /* 🛠 Outils */
            H('reading', 'outils', '📜', 'Lire un acte ancien', 'Le latin des registres, les abréviations, les vieilles lettres.', ['Outil', '📜 Aide à la lecture'], {act: ['lire', 'trouver'], obj: ['acte'], words: 'latin abreviation dechiffrer vieux papiers paleographie', pr: 1, go: call('readingAid.open')}),
            H('autrefois', 'outils', '🪙', 'Convertir une vieille mesure', 'Livres, francs, toises, calendrier républicain.', ['Outil', '🪙 Convertisseur d’autrefois'], {act: ['calculer', 'changer'], obj: ['mesure'], words: 'convertir mesure monnaie republicain toise', go: call('autrefois.open')}),
            H('calc', 'outils', '🧮', 'Calculette', 'Un âge, un écart entre deux dates, un calcul.', ['Barre du haut', '🧮 Calculette'], {act: ['calculer'], obj: [], words: 'calcul age ecart dates', go: call('calculator.open'), target: 'tool:calculette'}),
            H('ai', 'outils', '🤖', 'Demander à l’assistant IA', 'Une conversation sur ton arbre, avec l’IA de l’ordinateur (si installée).', ['Barre du haut', '🤖 Assistant'], {act: ['trouver'], obj: ['ia', 'personne'], words: 'ia intelligence artificielle assistant', go: call('assistantIA.open')}),
            H('restore', 'outils', '🎚', 'Restaurer une vieille photo', 'Enlever les taches, les plis, raviver les couleurs, pas à pas.', ['Listes', 'Outils de modification', 'Retouche'], {act: ['retoucher'], obj: ['photo'], words: 'restaurer abimee tache pli raviver couleur', ro: false, go: call('openRestore'), target: 'tool:restaurer'}),
            H('retouch', 'outils', '🎚', 'Retoucher une photo', 'Recadrer, éclaircir, redresser une image.', ['Listes', 'Outils de modification', 'Retouche des photos'], {act: ['retoucher'], obj: ['photo'], words: 'recadrer eclaircir redresser', ro: false, go: call('pickRetouch'), target: 'tool:retouche'}),
            H('faces', 'outils', '🙂', 'Reconnaître les visages', 'Retrouver une même personne sur plusieurs photos.', ['Listes', 'Outils de modification', 'Visages'], {act: ['trouver', 'voir'], obj: ['visage', 'photo'], words: 'visage reconnaissance meme personne photos', go: call('openFaces'), target: 'tool:visages'}),
            H('video', 'outils', '🎬', 'Monter une vidéo', 'Des films de famille coupés, assemblés, avec des titres.', ['Listes', 'Outils de modification', 'Montage vidéo'], {act: ['faire', 'retoucher'], obj: ['video'], words: 'montage film cassette', ro: false, go: call('newMontage'), target: 'tool:montage'}),
            H('board', 'outils', '🧩', 'Un tableau pour réfléchir', 'Des fiches, des photos et des flèches sur un grand tableau libre.', ['Enquêtes', '🧩 Tableaux'], {act: ['faire'], obj: ['enquete'], words: 'tableau freeform fleches reflechir mur', ro: false, go: enq('tableaux'), target: 'tool:tableaux', module: 'enquetes'}),
            H('atelier', 'outils', '📚', 'Atelier de recherche', 'Un projet de recherche suivi pas à pas : lire, corriger, repérer, ajouter.', ['Enquêtes', '📚 Atelier'], {act: ['faire', 'lire'], obj: ['acte', 'enquete'], words: 'atelier projet depouillement', go: enq('atelier'), target: 'tool:atelier', module: 'enquetes'}),
            H('game', 'outils', '🎲', 'Jouer avec la famille', 'Jeu de l’oie, puzzle, quiz : apprendre l’arbre en s’amusant.', ['Jeux'], {act: ['jouer'], obj: ['arbre', 'famille'], words: 'jeu quiz puzzle enfants', go: mod('jeu'), target: 'tool:puzzle'}),
            /* ⚙️ Réglages */
            H('backup', 'reglages', '💾', 'Faire une sauvegarde', 'Une copie de toute ta base et de tes photos, maintenant.', ['Réglages', 'Export propre', '💾 Sauvegarde complète'], {act: ['sauvegarder'], obj: ['sauvegarde', 'base'], words: 'copie secours sauvegarde cle usb', pr: 2, go: maint('export'), target: ['action:backup_now', 'maint:export'], last: '💾', module: 'maintenance', ro: false}),
            H('import', 'reglages', '⤒', 'Importer un arbre', 'Un fichier GEDCOM, Gramps, Heredis… ajouté à côté, avec ↶ Annuler.', ['Réglages', 'Import'], {act: ['importer'], obj: ['arbre', 'base'], words: 'gedcom fichier importer', ro: false, go: maint('import'), target: 'maint:import', last: 'Importer', module: 'maintenance'}),
            H('merge_tree', 'reglages', '🌳', 'Fusionner un autre arbre', 'L’arbre d’un cousin ajouté au tien, fiche par fiche.', ['Réglages', 'Fusionner un arbre'], {act: ['fusionner', 'importer'], obj: ['arbre', 'base'], words: 'arbre cousin fusionner deux arbres', ro: false, go: maint('fusion'), target: 'maint:fusion', last: 'Fusionner', module: 'maintenance'}),
            H('theme', 'reglages', '🎨', 'Changer les couleurs', 'Clair, sombre, la couleur principale, la taille du texte.', ['Réglages', 'Apparence', 'Thème et couleurs'], {act: ['changer'], obj: ['couleur'], words: 'sombre clair police taille couleur principale', ro: false, go: async () => maint(A().reglagesA?.() ? 'look_theme' : 'design')(), target: ['maint:look_theme', 'maint:design'], module: 'maintenance'}),
            H('addtab', 'reglages', '＋', 'Ajouter un onglet', 'Montrer un onglet caché ou un raccourci vers une liste.', ['Barre du haut', '＋ Ajouter un onglet'], {act: ['ajouter', 'changer'], obj: ['onglet'], words: 'onglet menu cacher montrer', ro: false, go: call('tabsPlus.open'), target: 'maint:tabs_editor'}),
            H('shortcuts', 'reglages', '⌨️', 'Changer les raccourcis clavier', 'Les touches pour aller plus vite (⌘K, nouvelle fiche…).', ['Réglages', 'Raccourcis clavier'], {act: ['changer', 'voir'], obj: ['raccourci'], words: 'touches clavier raccourci', ro: false, go: maint('raccourcis'), target: 'maint:raccourcis', module: 'maintenance'}),
            H('tour', 'reglages', '▶', 'Relancer la visite guidée', 'Les 6 gestes de base, montrés sur les vrais boutons.', ['Réglages', 'FAQ / tuto', '▶ Visite guidée'], {act: ['apprendre', 'voir'], obj: [], words: 'apprendre tuto debut visite', go: () => A().startTour?.({force: true}), module: 'maintenance'}),
            H('faq', 'reglages', '📖', 'Lire la FAQ', 'Près de mille réponses aux questions qu’on se pose.', ['Réglages', 'FAQ / tuto'], {act: ['apprendre', 'trouver', 'lire'], obj: [], words: 'faq question reponse aide comment', go: async c => { if (window.LCNDA_UI?.openFaq) return window.LCNDA_UI.openFaq(c.q || ''); return maint('faq')(); }, target: 'maint:faq', module: 'maintenance'}),
            H('ia_settings', 'reglages', '🤖', 'Installer l’IA de l’ordinateur', 'Ollama sur cet ordinateur : rien ne part sur Internet.', ['Réglages', '🤖 IA'], {act: ['changer', 'importer'], obj: ['ia'], words: 'ia ollama installer modele', ro: false, go: maint('assistant_ia'), target: 'maint:assistant_ia', module: 'maintenance'}),
            H('je_veux_settings', 'reglages', '🧭', 'Régler « Je veux… »', 'Où il apparaît, 👣 Montre-moi, le nombre de réponses, l’historique.', ['Réglages', '🧭 Je veux…'], {act: ['changer'], obj: [], words: 'je veux guide intention aide', ro: false, go: maint('je_veux'), target: 'maint:je_veux', module: 'maintenance'}),
        ];
    }

    /* ═════ les intentions fabriquées toutes seules ═════ */
    const MAINT_FAM = {controle: 'verifier', controle_seuils: 'verifier', duplicates: 'verifier', harmonize: 'verifier', bulk: 'verifier', branches: 'ranger', changes: 'verifier', safety: 'verifier', base_sante: 'verifier', entretien: 'verifier',
        export: 'imprimer', import: 'reglages', fusion: 'reglages', cousin_vault: 'partager', sync: 'partager', labels: 'ranger', scan_inbox: 'saisir', meteo: 'donnees', elections: 'donnees', insee_deces: 'donnees', sante: 'donnees', wikidata_autour: 'donnees', lieux_patrimoine: 'donnees'};
    const MAINT_RO = ['faq', 'help', 'infos', 'calendar_measures', 'mises_a_jour'];
    const MOD_FAM = {recherche: 'chercher', enquetes: 'chercher', maintenance: 'reglages', donnees: 'donnees', fiches: 'ranger', paniers: 'ranger', documents: 'ranger', personnes: 'montrer'};
    const TOOL_RO = ['calculette', 'puzzle', 'visages', 'musee'];
    const ACTION_RO = ['quick_search', 'print', 'help', 'new_window', 'split'];
    const objsOf = text => { const t = ` ${fold(text)} `; return Object.keys(OBJS).filter(k => OBJS[k][2].test(t)); };
    function auto(t) {
        const app = A(), x = X(), out = [], seen = new Set();
        const tr = s => (t ? t(s) : s);
        const add = (target, fam, icon, name, does, path, o = {}) => {
            if (!target || seen.has(target)) return; seen.add(target);
            const words = `${o.words || ''} ${name}`;
            out.push({id: 'auto:' + target, fam, icon: icon || '🧭', name, does, path, src: 'auto', ro: o.ro !== false, act: o.act || ['voir'], obj: o.obj || objsOf(words), words, phrases: [], needs: {}, go: o.go || (() => x.shortcuts?.openTarget?.(target)),
                last: '', targets: [target], into: '', pour: '', pr: -1, pre: null, steps: null, module: o.module || ''});
        };
        const lab = s => strip(String(s || ''));
        try { Object.entries(app.appModules || {}).filter(([k]) => k !== 'jeu').forEach(([k, v]) => add('module:' + k, MOD_FAM[k] || 'montrer', '🗂', tr(v[1]), tr('L’onglet « {x} », en haut.').replace('{x}', tr(v[1])), [tr(v[1])], {go: mod(k), module: k, words: `onglet ${v[1]}`})); } catch (_) {}
        const kw = x.maintKeywords || {};
        try { (app.defaultMaintenanceTabs || []).forEach(([k, , l]) => add('maint:' + k, MAINT_FAM[k] || 'reglages', '⚙️', lab(tr(l)), tr('La page « {x} » des Réglages.').replace('{x}', lab(tr(l))), [tr('Réglages'), lab(tr(l))], {go: maint(k), module: 'maintenance', words: `${l} ${kw[k] || ''} reglage`, act: ['changer', 'voir'], ro: MAINT_RO.includes(k)})); } catch (_) {}
        try { (app.defaultListTypes || []).forEach(([k, , l]) => add('list:' + k, /^(data_|ld_|reunie_|hist_|ha_)/.test(k) ? 'donnees' : 'montrer', '📋', lab(tr(l)), tr('La liste « {x} », dans Listes.').replace('{x}', lab(tr(l))), [tr('Listes'), lab(tr(l))], {go: list(k), module: 'listes', words: `${l} liste`, obj: [...new Set(['liste', ...objsOf(l)])]})); } catch (_) {}
        try { (app.orderedGraphDiagramItems?.(true) || []).forEach(([k, , l]) => add('graph:' + k, 'montrer', '🌳', lab(tr(l)), tr('Un dessin de Graphiques : « {x} ».').replace('{x}', lab(tr(l))), [tr('Graphiques'), lab(tr(l))], {go: graph(k), module: 'graphiques', words: `${l} dessin graphique`})); } catch (_) {}
        try { (app.orderedGraphStatsItems?.(true) || []).forEach(([k, , l]) => add('stat:' + k, 'donnees', '📊', lab(tr(l)), tr('Une statistique de Graphiques : « {x} ».').replace('{x}', lab(tr(l))), [tr('Graphiques'), lab(tr(l))], {module: 'graphiques', words: `${l} statistique chiffres`, obj: ['diagramme', ...objsOf(l)]})); } catch (_) {}
        try { (x.researchKinds?.rows?.() || []).forEach(r => add('search:' + r.key, 'chercher', '🔎', lab(tr(r.label)), tr('Une recherche : « {x} ».').replace('{x}', lab(tr(r.label))), [tr('Recherche'), lab(tr(r.label))], {go: research(r.key), module: 'recherche', words: `${r.label} recherche chercher`, act: ['trouver']})); } catch (_) {}
        try {
            (x.shortcuts?.catalog?.() || []).forEach(r => {
                const ty = String(r.target).split(':')[0], v = String(r.target).slice(ty.length + 1);
                if (ty === 'tool') add(r.target, 'outils', r.icon, lab(tr(r.label)), tr('L’outil « {x} ».').replace('{x}', lab(tr(r.label))), [tr('Outil'), lab(tr(r.label))], {ro: TOOL_RO.includes(v), words: `${r.label} outil`, act: ['faire', 'voir']});
                else if (ty === 'action') add(r.target, /^new_/.test(v) ? 'saisir' : 'outils', r.icon, lab(tr(r.label)), tr('Tout de suite : « {x} ».').replace('{x}', lab(tr(r.label))), [tr('Action'), lab(tr(r.label))], {ro: ACTION_RO.includes(v), words: r.label, act: /^new_/.test(v) ? ['ajouter', 'faire'] : ['faire']});
                else if (ty === 'create') add(r.target, 'saisir', r.icon, lab(tr(r.label)), tr('Un nouveau projet : « {x} ».').replace('{x}', lab(tr(r.label))), [tr('Outil'), lab(tr(r.label))], {ro: false, words: `${r.label} nouveau creer`, act: ['faire', 'ajouter']});
                else if (ty === 'tab') add(r.target, 'montrer', r.icon, lab(r.label), tr('Ton onglet « {x} ».').replace('{x}', lab(r.label)), [lab(r.label)], {words: r.label});
            });
        } catch (_) {}
        try { (x.listesThemes?.themes?.() || []).forEach(th => { if (!th?.id) return; add('theme:' + th.id, 'donnees', th.icon || '📊', lab(tr(th.label)), tr('Les données du thème « {x} ».').replace('{x}', lab(tr(th.label))), [tr('Données'), lab(tr(th.label))], {go: data(String(th.label || '')), module: 'donnees', words: `${th.label} ${(th.words || []).join(' ')} ${th.hint || ''} donnees`}); }); } catch (_) {}
        // les mots du catalogue « ＋ Ajouter un onglet »
        try { (x.tabsPlus?.catalog?.() || []).forEach(c => { const tg = c.module ? 'module:' + c.module : c.target; const it = out.find(i => i.targets.includes(tg)); if (it) it.words += ` ${c.words || ''} ${c.desc || ''}`; }); } catch (_) {}
        return out;
    }

    /* ═════ le registre ═════ */
    function build({t} = {}) {
        const tr = s => (t ? t(s) : s);
        const main = hand().map(it => ({...it, nameT: tr(it.name), doesT: tr(it.does), pathT: it.path.map(tr)}));
        const covered = new Set(main.flatMap(it => it.targets));
        const autos = auto(t).filter(it => !it.targets.some(tg => covered.has(tg))).map(it => ({...it, nameT: it.name, doesT: it.does, pathT: it.path}));
        const reg = [...main, ...autos];
        reg.forEach(it => {
            it.hay = [...new Set(fold(`${it.name} ${it.nameT} ${it.words} ${it.phrases.join(' ')} ${it.does} ${it.doesT}`).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)))];
            it.phr = it.phrases.map(p => fold(p));
            if (!it.module) { const p0 = fold(it.path[0]); const m = Object.entries(A().appModules || {}).find(([, v]) => fold(v[1]) === p0); if (m) it.module = m[0]; }
        });
        LEX = null;
        ext.intents = reg;
        return reg;
    }
    let LEX = null; // les mots connus, pour rattraper les fautes
    function lexicon(reg) {
        if (LEX && LEX.reg === reg) return LEX.words;
        const w = new Set();
        const seed = 'imprimer imprimante fusionner envoyer partager exporter importer sauvegarder sauvegarde trouver chercher retrouver verifier controler mettre ranger inserer ajouter saisir lire transcrire dechiffrer retoucher restaurer calculer convertir raconter comparer apprendre changer regler supprimer effacer jouer faire creer dessiner representer voir afficher regarder montrer ouvrir arbre arbres ascendants descendants fiche fiches liste listes lieux lieu commune village personne personnes diagramme graphique metier metiers seisme seismes guerre soldat temoin temoins mariage photo photos image base couleurs couleur theme acte actes registre doublon doublons carte famille parents meteo source sources enquete battue rappel chronologie recensement document video montage livre panier etiquette onglet prenom prenoms orthographe mesure monnaie deces widget raccourci archives visage succession courrier mamie cousin ancetre ancetres genealogie'.split(' ');
        seed.forEach(x => w.add(x));
        (reg || []).forEach(it => it.hay.forEach(x => { if (x.length >= 4) w.add(x); }));
        LEX = {reg, words: [...w]};
        return LEX.words;
    }

    /* ═════ lire la phrase ═════ */
    function analyse(q, reg = ext.intents || []) {
        const raw = String(q || '').trim();
        const u = {q: raw, act: '', objs: [], into: '', who: '', whoP: null, whoCands: [], nameWords: [], where: null, whereAuto: false, when: '', pour: '', chg: {}, fixed: [], unread: [], words: []};
        if (!raw) return u;
        const caps = new Set((raw.match(/[A-ZÀ-Ý][\p{L}'-]+/gu) || []).map(w => fold(w)));
        let toks = fold(raw).replace(/[^a-z0-9 -]/g, ' ').replace(/-/g, ' ').split(/\s+/).filter(Boolean);
        // les fautes : « arbe » → « arbre », « imprimé » est déjà « imprime » ; jamais sur un nom propre (majuscule)
        const lex = lexicon(reg), lexSet = new Set(lex);
        toks = toks.map(w => {
            if (w.length < 4 || /\d/.test(w) || STOP.has(w) || lexSet.has(w) || caps.has(w)) return w;
            const t1 = ` ${w} `;
            if (Object.values(ACTS).some(a => a[2].test(t1)) || Object.values(OBJS).some(a => a[2].test(t1)) || Object.values(POUR).some(a => a[3].test(t1))) return w;
            const max = w.length >= 7 ? 2 : 1;
            let best = null, bd = max + 1;
            for (const x of lex) { if (x[0] !== w[0] || Math.abs(x.length - w.length) > max) continue; const d = dist(w, x, max); if (d < bd || (d === bd && best && x.length > best.length)) { bd = d; best = x; } if (bd === 0) break; }
            if (best && bd <= max && best !== w) { u.fixed.push(`${w} → ${best}`); return best; }
            return w;
        });
        const t = ` ${toks.join(' ')} `;
        u.words = toks.filter(w => w.length > 2 && !STOP.has(w));
        // l'action : le premier verbe de la phrase
        let first = 1e9;
        Object.entries(ACTS).forEach(([k, a]) => { const m = t.match(a[2]); if (m && m.index < first) { first = m.index; u.act = k; } });
        const intoM = t.match(/\bdans (une |un |la |le |mes |ma |mon |mes )?(fiche|panier)s?\b/);
        if (intoM) u.into = intoM[2];
        const found = Object.entries(OBJS).map(([k, a]) => { const m = t.match(a[2]); return m ? [k, m.index] : null; }).filter(Boolean).sort((a, b) => a[1] - b[1]).map(x => x[0]);
        u.objs = found.filter(k => !(u.into && k === u.into && found.length > 1));
        if (u.into === 'fiche') u.objs = u.objs.filter(k => k !== 'fiche' || found.length === 1);
        if (/\b(un|mes|mon|nos|notre|les) ancetres?\b/.test(t)) u.who = 'anc';
        if (/chez (nous|moi)|pres de chez|notre (coin|village|ville|region)|par ici|lieux de la famille/.test(t)) { u.where = {id: 0, title: '', auto: true}; u.whereAuto = true; }
        const ys = t.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/g);
        if (ys) u.when = ys.length > 1 ? `${ys[0]} → ${ys[ys.length - 1]}` : ys[0];
        Object.entries(POUR).forEach(([k, a]) => { if (!u.pour && a[3].test(t) && /\b(pour|a|au|avec|mon|ma|mes)\b/.test(t)) u.pour = k; });
        // les mots qui restent : peut-être une personne ou un lieu (cherchés ensuite par l'écran)
        const known = [...Object.values(ACTS).map(a => a[2]), ...Object.values(OBJS).map(a => a[2]), ...Object.values(POUR).map(a => a[3])];
        const fixedTo = new Set(u.fixed.map(f => f.split(' → ')[1]));
        const vocab = new Set(reg.flatMap(it => it.hay));
        const rest = toks.filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w) && !fixedTo.has(w) && !known.some(rx => rx.test(` ${w} `)));
        u.nameWords = rest.filter(w => caps.has(w) || (!vocab.has(w) && w.length > 2));
        u.unread = rest.filter(w => !vocab.has(w) && !u.nameWords.includes(w) && w.length > 2 && !/^(ancetres?|avait|etait|fait|deux)$/.test(w));
        return u;
    }
    /** les personnes trouvées par l'écran (picker_search : {id, title, short}) : une seule → elle ; plusieurs → « lequel ? » */
    function applyPeople(u, cands) {
        const c = (cands || []).filter(p => p && Number(p.id)).slice(0, 6);
        if (!c.length) return u;
        const used = new Set(fold(c.map(p => p.title).join(' ')).split(/[^a-z0-9]+/));
        if (c.length === 1) { u.whoP = c[0]; u.who = 'p'; u.whoCands = []; }
        else { u.who = 'p'; u.whoP = null; u.whoCands = c; }
        u.nameWords = u.nameWords.filter(w => !used.has(w)); u.unread = u.unread.filter(w => !used.has(w));
        return u;
    }
    function applyPlace(u, place) {
        if (!place || !place.title) return u;
        u.where = place; u.whereAuto = false;
        const used = new Set(fold(place.title).split(/[^a-z0-9]+/));
        u.nameWords = u.nameWords.filter(w => !used.has(w)); u.unread = u.unread.filter(w => !used.has(w));
        return u;
    }
    /** une pastille corrigée */
    function set(u, key, v) {
        u.chg[key] = 1;
        if (key === 'act') u.act = v || '';
        else if (key === 'obj') u.objs = v ? [v, ...u.objs.filter(x => x !== v)] : [];
        else if (key === 'into') u.into = v || '';
        else if (key === 'who') { if (v === 'anc') { u.who = 'anc'; u.whoP = null; } else if (v && Number(v.id)) { u.who = 'p'; u.whoP = v; } else { u.who = ''; u.whoP = null; } u.whoCands = []; }
        else if (key === 'where') { u.where = v && v.title ? v : null; u.whereAuto = false; }
        else if (key === 'when') u.when = v || '';
        else if (key === 'pour') u.pour = v || '';
        return u;
    }

    /* ═════ classer ═════ */
    function rank(u, reg = ext.intents || []) {
        const fq = ` ${fold(u.q)} `;
        const words = u.words.filter(w => w.length > 3);
        return reg.map(it => {
            let s = 0;
            if (u.act && it.act.includes(u.act)) s += 4;
            if (u.objs[0] && it.obj.includes(u.objs[0])) s += 6;
            u.objs.slice(1).forEach(o => { if (it.obj.includes(o)) s += 2.5; });
            if (u.into && it.into === u.into) s += 5;
            if (u.pour && it.pour === u.pour) s += 2;
            it.phr.forEach(p => { if (p && fq.includes(` ${p} `)) s += 6; });
            words.forEach(w => { if (it.hay.some(x => x === w || (w.length >= 5 && x.length >= 5 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))) || (w.length >= 6 && dist(w, x, 1) <= 1))) s += 1.5; });
            if (s && it.needs.person && (u.whoP || u.whoCands.length || u.who === 'anc')) s += 1;
            if (s && it.needs.place && u.where) s += 1;
            return {it, s: s ? s + it.pr * 0.3 : 0};
        }).filter(x => x.s >= 2).sort((a, b) => b.s - a.s || (a.it.src === 'main' ? -1 : 1));
    }
    function confidence(u, r) {
        if (!r.length || (!u.act && !u.objs.length && (r[0]?.s || 0) < 6)) return 'none';
        if (u.whoCands.length > 1 && !u.chg.who) return 'low';
        if ((!u.act && !u.chg.act) || (!u.objs.length && !u.chg.obj && r[0].s < 9)) return 'low';
        if (r[0].s < 8) return 'low';
        if (r[1] && r[1].s >= r[0].s - 0.2 && r[1].it.fam !== r[0].it.fam && !u.chg.act && !u.chg.obj) return 'low';
        return 'ok';
    }
    /** « ✓ Prêt pour toi » : seulement ce que ▶ met vraiment */
    function pre(it, u, t = s => s) {
        const out = [];
        if (it.needs.person) { if (u.whoP) out.push(`👤 ${u.whoP.title}`); else if (u.who === 'anc') out.push(`👤 ${t('tes ancêtres (Sosa)')}`); else out.push(`👤 ${t('la personne de départ')}`); }
        if (u.where?.title) out.push(`📍 ${u.where.title}`); else if (u.whereAuto) out.push(`📍 ${t('les lieux de la famille')}`);
        if (u.when) out.push(`📅 ${u.when}`);
        if (['ask', 'data_ask', 'diagram', 'faq'].includes(it.id) && u.q) out.push(`💬 « ${u.q} »`);
        return out;
    }
    /** 👣 les étapes : celles de la fiche, sinon une par morceau du chemin */
    function steps(it, t = s => s) {
        if (it.steps) return it.steps;
        return it.pathT.map((p, i) => ({label: it.path[i], title: i === 0 ? t('Ouvre « {x} »').replace('{x}', p) : t('Puis « {x} »').replace('{x}', p),
            text: i === it.path.length - 1 ? (it.last ? t('C’est ici. Vérifie les choix, puis clique toi-même « {x} » : l’app ne le fait jamais à ta place.').replace('{x}', it.last) : t('C’est ici. Tu peux cliquer le bouton entouré toi-même.')) : t('Le bouton est entouré en bleu.'), i}));
    }

    ext.jeVeuxEngine = {FAM, ACTS, OBJS, POUR, STOP, fold, strip, dist, hand, auto, build, analyse, applyPeople, applyPlace, set, rank, confidence, pre, steps, lexicon};
})(typeof window !== 'undefined' ? window : globalThis);
