/* LCNDA — 📜 Aide à la lecture des actes anciens : les données et les calculs (sans page ni réseau).
 * window.LCNDA_AIDE_LECTURE (aussi require() dans Node pour les essais : tests/test-lecture-convertisseur.js).
 *  - ENTRIES      le dictionnaire : latin des registres, formules des actes (baptême, mariage, sépulture…), abréviations
 *                 (dont celles des recensements relues par SocFace : cult., jlier, Vve, id., d°) ; {t, d, k, a, ex}
 *  - LETTERS      les formes des anciennes lettres (s long, r rond, e/c, u/n, ligatures…), chacune dessinée en SVG (traits maison)
 *  - EXERCISES    des exercices de paléographie : un texte « comme sur le registre » et sa lecture, corrigée mot à mot
 *  - search(q, {kind, acte, limit})   le dictionnaire, les lettres et les exercices, du plus proche au moins proche
 *  - correct(exercice, réponse)       la correction mot à mot : {words: [{exp, got, st: ok|faux|manque|trop, hint}], ok, total, score}
 *  - glyphSvg(lettre)                 le dessin d'une lettre (SVG, trait en currentColor : suit le thème clair ou sombre)
 * L'écran est dans heritage-lecture-autrefois.js (LCNDA_EXT.readingAid). Les « vieux mots » des Trésors (ext.tresorWords)
 * et les abréviations de la lecture automatique (LCNDA_LECTURE.ABBREV) sont ajoutés à la recherche quand ils sont chargés.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_AIDE_LECTURE = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    /** pour chercher et comparer : sans accents, sans majuscules, ſ = s, æ = ae, œ = oe, & = et */
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/ſ/g, 's').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();

    /* ═════════ Le dictionnaire ═════════
     * k : latin | formule | abrev ; a : bapteme | mariage | sepulture | recensement | notaire | general ; ex : un exemple tel qu'on le lit */
    const E = (k, a, rows) => rows.map(([t, d, ex]) => ({t, d, k, a, ex: ex || ''}));
    const ENTRIES = [
        /* ── Abréviations et formules courtes (registres et notaires) ── */
        ...E('abrev', 'general', [
            ['led., lad., lesd.', 'ledit, ladite, lesdits : la personne ou la chose déjà nommée plus haut', '« led. Jean Martin »'],
            ['dud., desd.', 'dudit, desdits', '« de lad. paroisse, dud. lieu »'],
            ['susd., sd.', 'susdit, susdite : la personne nommée ci-dessus'],
            ['d., dit, dite', 'surnom ou nom de terre : « Jean Martin dit Lafleur »'],
            ['Vve, vve, veufve', 'veuve', '« Marie Roux Vve de Pierre Bonnet »'],
            ['fe, fme, fem.', 'femme (épouse)'],
            ['épx, épse', 'époux, épouse'],
            ['Me, Mtre', 'maître (notaire, avocat, chirurgien, artisan reçu maître)'],
            ['Mre', 'messire (noble ou prêtre)'],
            ['Sr, Sieur', 'sieur : homme de condition (bourgeois, marchand, officier)'],
            ['Sgr, Seigr', 'seigneur'],
            ['Ecr, Ec.', 'écuyer (titre de noblesse)'],
            ['Dlle, Damlle', 'demoiselle : femme de rang, même mariée, sous l’Ancien Régime'],
            ['hon., honn.', 'honnête (« honnête homme ») : qualificatif social'],
            ['md, mard, marchd', 'marchand'],
            ['labr, labour.', 'laboureur (paysan qui possède un attelage)'],
            ['manouv.', 'manouvrier, journalier'],
            ['par., psse, paroe, ꝑoisse', 'paroisse'],
            ['bapt., bap.', 'baptisé, baptême'],
            ['inh.', 'inhumé'],
            ['pnt, pt, pnts', 'présent, présents'],
            ['soubs., soussig.', 'soussignés'],
            ['n’a sceu signer', 'n’a pas su signer (ne savait pas écrire)'],
            ['aagé de', 'âgé de'],
            ['7bre, 8bre, 9bre, Xbre, 10bre', 'septembre, octobre, novembre, décembre', '« le 3e 7bre » = le 3 septembre'],
            ['&, &c', 'et, et cetera'],
            ['ledit jour et an que dessus', 'à la date déjà écrite en tête de l’acte'],
            ['an VI, 12 brumaire', 'date du calendrier républicain (🪙 Convertisseur d’autrefois → Calendrier républicain)'],
            ['+, †, croix', 'décédé'],
            ['Mʳ, Mᵉ, Mˡˡᵉ', 'monsieur, maître, mademoiselle (lettres en exposant)'],
            ['ledᵗ, ladᵗᵉ', 'ledit, ladite (lettres en exposant)'],
            ['q̃, qͥ, qᵉ', 'que, qui, que'],
            ['nre, notre', 'notaire (ou notre, selon la phrase)'],
            ['pr, pour', 'pour (p barré : par, per)'],
            ['tesm., tém.', 'témoin'],
            ['not. roy.', 'notaire royal'],
        ]),
        /* ── Abréviations des recensements et des listes (les mêmes que relit SocFace) ── */
        ...E('abrev', 'recensement', [
            ['cult., cultr', 'cultivateur', '« Martin Jean cult. 45 »'],
            ['cultrice', 'cultivatrice'],
            ['jlier, journ., journr', 'journalier, journalière', '« Roux Anne jlière »'],
            ['id., idem', 'idem : « la même chose que la ligne au-dessus »', '« Martin Pierre id. » = même métier, même lieu…'],
            ['d°, do, dito', 'dito : « comme au-dessus » (même valeur que la ligne précédente)', '« d° » dans la colonne du lieu = même lieu'],
            ['″, 〃 (guillemets de répétition)', 'même chose que la ligne au-dessus (comme id. et d°)'],
            ['prop., propre, propr', 'propriétaire'],
            ['dom., domest.', 'domestique'],
            ['serv., servte', 'servante'],
            ['ménag., menagre', 'ménagère'],
            ['s. p., sans prof.', 'sans profession'],
            ['ch. de mén., chef de men.', 'chef de ménage'],
            ['fs, fe, flle', 'fils, fille (ou femme, selon la colonne)'],
            ['b.-fils, b.-père', 'beau-fils, beau-père'],
            ['pt-fils, pte-fille', 'petit-fils, petite-fille'],
            ['vf, vv', 'veuf, veuve'],
            ['célib.', 'célibataire'],
            ['instit.', 'instituteur'],
            ['tiss., tisserd', 'tisserand'],
            ['menuis., menuisr', 'menuisier'],
            ['négt, nég.', 'négociant'],
            ['pens., pensre', 'pensionnaire'],
        ]),
        /* ── Formules du baptême ── */
        ...E('formule', 'bapteme', [
            ['a été baptisé(e)', 'l’enfant a reçu le baptême (souvent le jour même ou le lendemain de la naissance)'],
            ['né(e) d’hier, né(e) ce jourd’hui', 'né la veille, né le jour même'],
            ['fils légitime, fille légitime', 'enfant de parents mariés entre eux'],
            ['en légitime mariage', 'enfant de parents mariés entre eux'],
            ['fils naturel, fille naturelle', 'enfant né hors mariage'],
            ['de père inconnu', 'le père n’est pas nommé'],
            ['le parrain a été…, la marraine…', 'ceux qui ont tenu l’enfant sur les fonts : souvent des grands-parents, oncles ou tantes'],
            ['tenu sur les fonts par', 'porté au baptême par (le parrain, la marraine)'],
            ['ondoyé(e) à la maison pour péril de mort', 'baptisé en urgence par la sage-femme ou un parent, l’enfant risquant de mourir'],
            ['les cérémonies ont été suppléées', 'le prêtre a fait plus tard les rites du baptême d’un enfant déjà ondoyé'],
            ['baptisé sous condition', 'baptisé une seconde fois « au cas où » le premier baptême n’aurait pas été valable'],
            ['qui ont déclaré ne savoir signer, de ce enquis', 'ils ne savaient pas écrire leur nom ; le curé le leur a demandé'],
            ['posthume', 'enfant né après la mort de son père'],
            ['enfant exposé, enfant trouvé', 'enfant abandonné, recueilli (souvent sans parents nommés)'],
            ['gémeaux, jumeaux', 'deux enfants nés de la même couche'],
        ]),
        /* ── Formules du mariage ── */
        ...E('formule', 'mariage', [
            ['après la publication de trois bans', 'le mariage a été annoncé trois dimanches de suite à la messe'],
            ['sans opposition ni empêchement', 'personne ne s’y est opposé, aucune raison ne l’interdisait'],
            ['dispense de deux bans', 'l’évêque a permis de ne publier qu’un ban (mariage pressé)'],
            ['dispense de consanguinité au 3e degré', 'les époux étaient parents (cousins issus de germains) ; l’Église l’a permis'],
            ['dispense d’affinité', 'les époux étaient parents par alliance (par exemple le veuf épouse la sœur de sa femme)'],
            ['ont reçu la bénédiction nuptiale', 'ils ont été mariés à l’église'],
            ['ont contracté mariage', 'ils se sont mariés'],
            ['fiancés, ont été fiancés', 'promesse de mariage, souvent la veille ou quelques jours avant'],
            ['majeur(e) de vingt-cinq ans', 'âgé de plus de 25 ans : peut se marier sans l’accord de ses parents (avant 1792)'],
            ['mineur(e)', 'n’a pas encore l’âge de la majorité : le consentement des parents ou du tuteur est cité'],
            ['du consentement de ses père et mère', 'les parents sont d’accord (souvent présents)'],
            ['veuf de…, veuve de…', 'dont le conjoint précédent est mort : cherche ce premier mariage'],
            ['en premières noces, en secondes noces', 'premier mariage, deuxième mariage'],
            ['garçon, fille', 'jamais marié(e) auparavant'],
            ['légitimant l’enfant né d’eux', 'en se mariant, les parents reconnaissent un enfant né avant le mariage'],
        ]),
        /* ── Formules de la sépulture ── */
        ...E('formule', 'sepulture', [
            ['a été inhumé(e) dans le cimetière', 'a été enterré au cimetière de la paroisse'],
            ['a été inhumé(e) dans l’église', 'enterré dans l’église : souvent un notable, un prêtre ou un bienfaiteur'],
            ['décédé(e) d’hier, décédé(e) ce jourd’hui', 'mort la veille, mort le jour même'],
            ['muni(e) des sacrements', 'il a reçu les derniers sacrements avant de mourir'],
            ['âgé(e) d’environ…', 'l’âge est une estimation, souvent fausse de quelques années'],
            ['mort subitement', 'mort sans avoir pu recevoir les sacrements'],
            ['son corps a été inhumé', 'son corps a été enterré'],
            ['en présence de ses parents et amis', 'les témoins de l’enterrement (souvent des fils, gendres, voisins)'],
            ['trouvé noyé, trouvé mort', 'mort par accident : il y a parfois un rapport du juge'],
            ['à l’âge de… jours', 'enfant mort tout petit : très fréquent avant 1850'],
        ]),
        /* ── Formules de tous les actes ── */
        ...E('formule', 'general', [
            ['feu, feue', 'défunt, défunte : « fils de feu Jean » = son père Jean est déjà mort'],
            ['défunt, deffunct', 'mort : même sens que feu'],
            ['ledit, ladite, lesdits', 'celui (celle, ceux) dont on vient de parler'],
            ['dudit lieu', 'du lieu qu’on vient de nommer (le même village)'],
            ['de cette paroisse', 'de la paroisse où l’acte est écrit'],
            ['de la paroisse de…', 'd’une autre paroisse : cherche aussi dans ses registres'],
            ['natif de, originaire de', 'né à'],
            ['demeurant à', 'qui habite à'],
            ['icelui, icelle', 'celui-ci, celle-ci'],
            ['ce jourd’hui', 'aujourd’hui'],
            ['l’an de grâce', 'l’année (de l’ère chrétienne)'],
            ['soussigné(s)', 'qui signe(nt) en bas de l’acte'],
            ['en foi de quoi', 'pour attester ce qui précède (fin d’acte)'],
            ['puîné, puînée', 'né après un aîné, cadet'],
            ['ledit jour', 'le jour déjà écrit plus haut'],
            ['officier public', 'l’officier d’état civil (le maire ou son adjoint), après 1792'],
            ['comparant', 'qui se présente devant l’officier ou le notaire'],
            ['a déclaré ne savoir signer', 'ne savait pas écrire son nom'],
        ]),
        /* ── Le latin des registres ── */
        ...E('latin', 'bapteme', [
            ['baptizavi', 'j’ai baptisé'], ['baptizatus, baptizata', 'baptisé, baptisée'], ['natus, nata', 'né, née'], ['hodie, heri', 'aujourd’hui, hier'],
            ['filius, filia', 'fils, fille'], ['legitimus, legitima', 'légitime'], ['filius legitimus et naturalis', 'fils légitime et naturel : né de parents mariés'],
            ['ex legitimo matrimonio', 'né du mariage légitime'], ['naturalis, illegitimus, spurius', 'naturel, illégitime (né hors mariage)'], ['gemelli', 'jumeaux'],
            ['infans, proles', 'enfant'], ['pater, mater', 'père, mère'], ['patrinus, matrina', 'parrain, marraine'], ['susceptores, levantes', 'parrain et marraine (ceux qui ont tenu l’enfant)'],
            ['cui impositum est nomen', 'à qui on a donné le nom (le prénom) de'], ['domi baptizatus ob periculum mortis', 'ondoyé à la maison en danger de mort'],
            ['sub conditione', 'sous condition (baptême refait au cas où le premier n’était pas valable)'], ['expositus, exposita', 'enfant trouvé, abandonné'],
        ]),
        ...E('latin', 'mariage', [
            ['conjuges', 'les époux (le couple)'], ['matrimonium contraxerunt', 'ils se sont mariés'], ['matrimonio juncti', 'unis par le mariage'],
            ['sponsus, sponsa', 'fiancé, fiancée ou époux, épouse'], ['uxor, maritus', 'épouse, mari'],
            ['proclamationibus factis, bannis', 'les bans ayant été publiés'], ['praemissis tribus bannorum publicationibus', 'après la publication des trois bans'],
            ['nullo detecto impedimento', 'sans qu’on ait trouvé d’empêchement'], ['per verba de praesenti', 'par paroles de présent (l’échange des consentements)'],
            ['mutuo consensu', 'par consentement mutuel'], ['benedictionem nuptialem impertitus sum', 'j’ai donné la bénédiction nuptiale'],
            ['in facie ecclesiae', 'devant l’Église (publiquement)'], ['dispensatione obtenta', 'la dispense ayant été obtenue'],
            ['dispensatio in tertio gradu consanguinitatis', 'dispense de parenté au 3e degré (cousins issus de germains)'], ['affinitatis', 'de parenté par alliance'],
            ['viduus, vidua', 'veuf, veuve'], ['relicta', 'veuve de (« laissée par »)'],
        ]),
        ...E('latin', 'sepulture', [
            ['obiit', 'il est mort, elle est morte'], ['sepultus est, sepulta est', 'il a été inhumé, elle a été inhumée'], ['cujus corpus sepultum est', 'dont le corps a été inhumé'],
            ['in coemeterio', 'au cimetière'], ['in ecclesia', 'dans l’église'], ['omnibus sacramentis munitus', 'muni de tous les sacrements'],
            ['animam Deo reddidit', 'a rendu son âme à Dieu (est mort)'], ['requiescat in pace (R.I.P.)', 'qu’il repose en paix'],
            ['annorum circiter quadraginta', 'âgé d’environ quarante ans'], ['aetatis suae', 'de son âge'], ['circiter', 'environ'],
            ['quondam, q., defunctus, def.', 'feu, défunt'],
        ]),
        ...E('latin', 'general', [
            ['anno Domini, Anno Dñi', 'l’an du Seigneur'], ['die, mensis', 'le jour, du mois'], ['ejusdem mensis', 'du même mois'], ['eodem die, eodem anno', 'le même jour, la même année'],
            ['pridie', 'la veille'], ['hujus parochiae, ex hac parochia', 'de cette paroisse'], ['parochianus', 'paroissien'], ['ejusdem loci, dicti loci', 'du même lieu, dudit lieu'],
            ['praedictus, dictus, supradictus', 'ledit, susdit'], ['oriundus ex', 'originaire de'], ['incola', 'habitant'],
            ['testes, praesentibus', 'témoins, en présence de'], ['infrascriptus, subsignatus', 'soussigné'], ['ego infrascriptus parochus', 'moi, curé soussigné'],
            ['parochus, curatus, rector', 'curé'], ['vicarius', 'vicaire'], ['sacerdos, presbyter', 'prêtre'], ['Dnus, Dni, Dno', 'Dominus (seigneur, maître, ou titre d’un prêtre)'],
            ['R. D., Rdus', 'Reverendus Dominus : le révérend (un prêtre)'],
            ['Januarii … Decembris', 'de janvier … de décembre'], ['Septembris, 7bris', 'de septembre'], ['primo, secundo, tertio die', 'le premier, deuxième, troisième jour'],
            ['millesimo septingentesimo', 'mil sept cent'], ['millesimo sexcentesimo', 'mil six cent'], ['millesimo octingentesimo', 'mil huit cent'],
            ['vigesimo, trigesimo, quadragesimo', 'vingtième, trentième, quarantième (dans une année : 20, 30, 40)'],
            ['quinquagesimo, sexagesimo, septuagesimo', 'cinquantième, soixantième, soixante-dixième (50, 60, 70)'], ['octogesimo, nonagesimo', 'quatre-vingtième, quatre-vingt-dixième (80, 90)'],
            ['agricola', 'cultivateur'], ['faber', 'forgeron'], ['sutor', 'cordonnier'], ['textor', 'tisserand'], ['molitor', 'meunier'], ['sartor', 'tailleur'], ['miles', 'soldat'], ['mercator', 'marchand'], ['nauta', 'marinier'],
        ]),
    ];
    const KINDS = {latin: '🏛 Latin', formule: '📜 Formules', abrev: '✂️ Abréviations', mot: '📖 Vieux mots'};
    const ACTES = {bapteme: '👶 Baptême', mariage: '💍 Mariage', sepulture: '⚱️ Sépulture', recensement: '🏠 Recensement', general: 'Tous les actes', notaire: '🖋 Notaire'};

    /* ═════════ Les anciennes lettres, dessinées (SVG maison) ═════════
     * Une cellule de 40 × 60 : haut des grandes lettres y = 8, haut des petites y = 26, ligne d'écriture y = 46, bas des jambages y = 58.
     * Chaque lettre : des traits (chemins SVG) ; un « glyphe » peut être une suite de lettres (ex. ['slong', 't']). */
    const G = {
        slong: ['M31 12 C25 5 17 9 17 19 L17 58', 'M12 29 L17 29'],
        f: ['M31 12 C25 5 17 9 17 19 L17 46', 'M10 29 L26 29'],
        s: ['M27 29 C22 24 13 26 15 32 C17 37 27 36 27 41 C27 47 16 48 12 43'],
        rrond: ['M12 31 C14 25 25 25 24 32 C23 38 14 42 12 46 L27 46'],
        r: ['M14 26 L14 46', 'M14 33 C17 27 22 25 27 28'],
        e: ['M14 37 L27 34 C27 27 17 26 14 33 C12 41 18 47 27 43'],
        c: ['M27 30 C22 25 14 28 14 36 C14 44 22 47 27 42'],
        u: ['M12 26 L12 40 C12 47 22 47 24 40', 'M24 26 L24 46'],
        n: ['M12 26 L12 46', 'M12 33 C14 26 24 26 24 33 L24 46'],
        m: ['M7 26 L7 46', 'M7 33 C9 26 17 26 17 33 L17 46', 'M17 33 C19 26 27 26 27 33 L27 46'],
        i: ['M20 26 L20 46', 'M20 18 L20 19'],
        isans: ['M20 26 L20 46'],
        t: ['M18 14 L18 41 C18 47 24 47 27 43', 'M11 26 L26 26'],
        l: ['M18 8 L18 41 C18 47 24 47 27 43'],
        o: ['M20 26 C11 26 11 46 20 46 C29 46 29 26 20 26'],
        a: ['M26 30 C22 25 13 27 13 37 C13 46 24 46 26 38', 'M26 28 L26 46'],
        d: ['M26 30 C22 25 13 27 13 37 C13 46 24 46 26 38', 'M26 8 L26 46'],
        doncial: ['M25 37 C25 28 12 28 12 37 C12 46 25 47 25 37 C25 24 23 14 9 12'],
        h: ['M12 8 L12 46', 'M12 33 C16 26 25 26 25 34 L25 46 C25 55 19 59 14 56'],
        p: ['M13 26 L13 58', 'M13 31 C19 24 28 28 28 35 C28 43 20 46 13 41'],
        pper: ['M13 26 L13 58', 'M13 31 C19 24 28 28 28 35 C28 43 20 46 13 41', 'M6 52 L21 50'],
        ppro: ['M13 26 L13 58', 'M13 31 C19 24 28 28 28 35 C28 43 20 46 13 41', 'M13 52 C5 52 4 44 13 42'],
        q: ['M26 30 C22 25 13 27 13 37 C13 46 24 46 26 38', 'M26 28 L26 58'],
        qtilde: ['M26 30 C22 25 13 27 13 37 C13 46 24 46 26 38', 'M26 28 L26 58', 'M10 18 C14 13 18 22 28 15'],
        otilde: ['M20 26 C11 26 11 46 20 46 C29 46 29 26 20 26', 'M10 18 C14 13 18 22 28 15'],
        con: ['M26 30 C22 23 12 27 14 33 C16 38 24 36 24 30 L20 48'],
        us: ['M27 10 C25 6 19 8 20 12 C21 15 26 14 26 10 L23 22'],
        et: ['M29 46 L12 22 C10 14 23 12 22 20 C21 26 10 30 10 38 C10 47 23 48 29 35'],
        tiron: ['M10 26 L27 26 L15 52'],
        y: ['M11 26 L19 44', 'M28 26 L16 58'],
        z: ['M12 27 L27 27 L12 46 L27 46'],
        zh: ['M12 27 L26 27 L16 40 C26 40 28 50 22 55 C18 59 12 56 12 53'],
        x: ['M12 26 L27 46', 'M27 26 L12 46'],
        ff: ['M24 12 C19 5 13 9 13 19 L13 46', 'M36 12 C31 5 25 9 25 19 L25 46', 'M7 29 L32 29'],
        F: ['M30 9 L13 9 L13 46', 'M13 27 L25 27'],
        I: ['M14 9 L28 9', 'M21 9 L21 46', 'M14 46 L28 46'],
        J: ['M14 9 L28 9', 'M21 9 L21 50 C21 57 13 58 11 52'],
        v: ['M11 26 L19 46 L28 26'],
        vInit: ['M8 18 C12 14 15 18 17 26 L21 46 L30 14 C31 10 34 10 35 12'],
        ctlig: ['M22 30 C17 25 9 28 9 36 C9 44 17 47 22 42', 'M22 30 C22 14 34 12 34 20 L34 41 C34 47 39 47 41 43', 'M28 26 L40 26'],
        stlig: ['M14 12 C10 6 5 10 5 20 L5 46', 'M5 18 C13 6 28 8 28 20 L28 41 C28 47 34 47 36 43', 'M22 27 L35 27'],
        sup_r: ['M13 18 L13 6', 'M13 10 C15 6 18 5 21 6'],
        sup_e: ['M13 13 L22 12 C22 7 15 6 13 11 C12 16 16 19 22 16'],
        M: ['M5 46 L8 9 L18 34 L28 9 L31 46'],
        seven: ['M8 26 L22 26 L12 46'],
        b: ['M12 8 L12 46 C20 47 26 44 26 37 C26 30 19 27 12 31'],
        k: ['M12 8 L12 46', 'M25 26 L12 38 L26 46'],
        g: ['M26 30 C22 25 13 27 13 37 C13 46 24 46 26 38', 'M26 28 L26 52 C26 59 15 59 13 54'],
        dash: ['M8 37 L30 37'],
    };
    const W = {m: 34, ff: 40, ctlig: 44, stlig: 40, M: 36};
    /** le dessin d'une suite de lettres (ids de G) : <svg> en traits currentColor ; `title` pour les lecteurs d'écran */
    function glyphSvg(ids, {title = '', h = 60} = {}) {
        const list = (Array.isArray(ids) ? ids : [ids]).filter(id => G[id]);
        let x = 0, body = '';
        for (const id of list) { body += `<g transform="translate(${x} 0)">${G[id].map(d => `<path d="${d}"/>`).join('')}</g>`; x += (W[id] || 36) - 4; }
        const w = Math.max(40, x + 4);
        return `<svg class="la-glyph" viewBox="0 0 ${w} 64" width="${Math.round(w * h / 64)}" height="${h}" role="img" aria-label="${title.replace(/"/g, '&quot;')}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line class="la-base" x1="0" y1="46" x2="${w}" y2="46"/>${body}</svg>`;
    }
    /** [id, nom, ce qu'on voit (dessin), se lit, comparer avec (dessin), remarque, mots-clés] */
    const LETTERS = [
        ['slong', 's long (ſ)', ['slong'], 's', ['f'], 'Au début et au milieu des mots ; il descend sous la ligne et n’a qu’une petite pointe à gauche. Le f, lui, est barré des deux côtés. « ſœur » = sœur, « eſté » = esté.', 's long ſ f confusion'],
        ['rrond', 'r rond (ꝛ)', ['o', 'rrond'], 'r', ['z'], 'Après o, b, p (et souvent ailleurs) : il ressemble à un 2 ou à un z. « oꝛ » = or.', 'r rond 2 z'],
        ['ec', 'e et c', ['e', 'c'], 'e, c', [], 'La boucle du e est parfois si petite qu’il devient un c ; regarde le sens de la phrase. « ceux » et « eeux » : un seul existe.', 'e c boucle confusion'],
        ['un', 'u et n (jambages)', ['u', 'n'], 'u, n', ['m'], 'Même nombre de petits traits (jambages) : u est ouvert en haut, n en bas. « m » = 3 jambages, « in », « ui », « ni » aussi : compte-les.', 'u n m jambages minimes in ui'],
        ['iJ', 'i et j, I et J', ['I', 'J'], 'i ou j', [], 'Même lettre jusqu’au XVIIe siècle : « iour » = jour, « Iean » = Jean. Le i n’a pas toujours son point.', 'i j iour Iean'],
        ['uv', 'u et v', ['vInit', 'n'], 'u ou v', [], 'v au début du mot, u ailleurs, quel que soit le son : « vne » = une, « auoir » = avoir.', 'u v vne auoir'],
        ['doncial', 'd oncial (∂)', ['doncial'], 'd', ['d'], 'La hampe se recourbe vers la gauche, comme ∂.', 'd oncial ∂'],
        ['hz', 'h bouclé et z', ['h', 'zh'], 'h, z', [], 'Le h descend sous la ligne avec une boucle ; le z aussi : « hz » se confondent. « nez » peut valoir « nés ».', 'h z boucle'],
        ['ff', 'ff au début d’un nom', ['ff'], 'F', ['F'], 'Deux f minuscules = un F majuscule : « ffrançois » = François, « ffontaine » = Fontaine.', 'ff majuscule F François'],
        ['tilde', 'trait ou tilde sur une voyelle', ['otilde'], 'om, on', [], 'Le trait remplace un m ou un n : « cõme » = comme, « mõsieur » = monsieur.', 'tilde trait m n omis cõme'],
        ['pper', 'p barré (ꝑ)', ['pper'], 'per, par', [], 'Trait à travers la queue du p : « ꝑoisse » = paroisse, « ꝑsonne » = personne.', 'p barré per par paroisse'],
        ['ppro', 'p bouclé (ꝓ)', ['ppro'], 'pro', [], 'Boucle autour de la queue du p : « ꝓcureur » = procureur.', 'p bouclé pro procureur'],
        ['qtilde', 'q surmonté (q̃)', ['qtilde'], 'que, qui', [], 'Un signe sur le q : « q̃ » = que, « qͥ » = qui.', 'q que qui'],
        ['con', '9 au début (ꝯ)', ['con'], 'con, com', [], 'Le signe en forme de 9 sur la ligne : « ꝯtrat » = contrat.', 'con com 9 tironien contrat'],
        ['us', '9 en haut (ꝰ)', ['n', 'us'], '-us', [], 'Petit 9 en fin de mot, en haut : « filiꝰ » = filius (latin).', 'us 9 filius latin'],
        ['et', 'et (& et ⁊)', ['et', 'tiron'], 'et', [], '« & » et le signe en forme de 7 (⁊) valent « et » ; « &c » = et cetera.', 'et & tironien'],
        ['ct', 'ligature c-t', ['ctlig'], 'ct', [], 'Un arc relie le c au t : « acte », « fait » (faict). Ne lis pas une lettre en plus.', 'ligature ct acte'],
        ['st', 'ligature s long-t', ['stlig'], 'st', [], 'Le s long et le t sont liés par un arc : « eſté » = esté (été), « eſt » = est.', 'ligature st esté'],
        ['sup', 'lettres en exposant', ['M', 'sup_r'], 'abréviation', [], 'La fin du mot est écrite en petit, en haut : « Mʳ » = monsieur, « ledᵗ » = ledit, « 7ᵇʳᵉ » = septembre.', 'exposant Mr ledit 7bre'],
        ['sept', '7bre, 8bre, 9bre, Xbre', ['seven', 'b', 'sup_r', 'sup_e'], 'septembre…', [], 'Les mois en chiffres : 7bre = septembre, 8bre = octobre, 9bre = novembre, Xbre = décembre (le 7e, 8e, 9e, 10e mois du calendrier romain).', 'septembre octobre novembre décembre 7bre'],
        ['yfinal', 'y en fin de mot', ['y'], 'i', [], '« cecy », « luy », « icy », « may » : y = i.', 'y i luy may'],
        ['smuet', 's muet devant consonne', ['e', 'slong', 't'], 'ê, â…', [], 'Il est devenu un accent circonflexe : « eſtoit » = était, « teſte » = tête, « maiſtre » = maître.', 's muet circonflexe estoit'],
        ['roman', 'chiffres romains en j', ['i', 'i', 'i', 'J'], '4', [], 'Le dernier i s’allonge en j : « iiij » = 4, « vj » = 6, « iiijxx » = quatre-vingts.', 'chiffres romains iiij vj'],
        ['ponct', 'pas de ponctuation ni d’accent', ['dash'], '—', [], 'Les phrases s’enchaînent et les mots sont coupés en fin de ligne sans tiret : lis à voix haute.', 'ponctuation accent coupure'],
    ].map(([id, name, seen, read, cmp, note, keys]) => ({id, name, seen, read, cmp, note, keys}));

    /* ═════════ Les exercices de paléographie ═════════
     * Textes rédigés sur le modèle des registres et des recensements (formules de l'époque, personnes d'exemple, toutes nées bien avant 1950).
     * src : les mots comme sur le registre ; « vu=lu » quand la lecture diffère, « vu=lu|autre » pour accepter une autre lecture. */
    const EXERCISES = [
        {id: 'bapt1742', icon: '👶', title: 'Un baptême de 1742', level: 'facile', acte: 'bapteme', year: 1742,
            tip: 'Repère le s long (ſ), l’esperluette (&) et l’abréviation de paroisse.',
            src: 'Le vingt ſix=six de may=may|mai mil ſept=sept cent quarante deux a eſté=esté|été baptiſé=baptisé Jean filz=filz|fils legitime de Pierre Martin laboureur &=et de Marie Durand ſa=sa femme de cette par.=paroisse Le parrain a eſté=esté|été Jean Bonnet &=et la marraine Anne Roux qui ont declaré ne ſcavoir=scavoir|savoir ſigner=signer'},
        {id: 'mar1768', icon: '💍', title: 'Un mariage de 1768', level: 'moyen', acte: 'mariage', year: 1768,
            tip: 'Ici : le p barré (ꝑ), « led. », « Vve », « dud. » et un mois en chiffres.',
            src: 'Le 12e=douze|douzieme|12 7bre=septembre 1768 apres la publication de trois bans faite en cette ꝑoiſſe=paroisse ſans=sans opposition ont eſté=esté|été mariés Claude Morel garçon fils de feu Jacques Morel &=et de Jeanne Petit dud.=dudit lieu &=et Marie Bonnet Vve=veuve de Pierre Garnier led.=ledit Morel a ſigné=signé'},
        {id: 'sep1781', icon: '⚱️', title: 'Une sépulture de 1781', level: 'moyen', acte: 'sepulture', year: 1781,
            tip: 'Le tilde (õ, ã) remplace un m ou un n ; « aagé » = âgé.',
            src: 'Le trois mars mil ſept=sept cent quatre vingt un a eſté=esté|été inhumé dans le cimetiere de cette ꝑoiſſe=paroisse le corps de Jacques Roux veuf de feue Anne Martin aagé=aagé|âgé|age d’environ ſoixante=soixante ans decedé d’hier muny=muny|muni des ſacremens=sacremens|sacrements en preſence=presence|présence de ſes=ses enfans=enfans|enfants qui ont declaré ne ſcavoir=scavoir|savoir ſigner=signer de ce enquis'},
        {id: 'bapt1695', icon: '🏛', title: 'Un baptême en latin (1695)', level: 'difficile', acte: 'bapteme', year: 1695,
            tip: 'Latin : « Dñi » = Domini, « filiꝰ » = filius, « ꝑochiæ » = parochiae, « æ » = ae.',
            src: 'Anno Dñi=Domini millesimo sexcentesimo nonagesimo quinto die decima mensis Januarii baptizatus fuit Joannes filiꝰ=filius legitimus Petri Garnier et Annæ=Annae Leroy conjugum hujus ꝑochiæ=parochiae Patrinus fuit Joannes Leroy matrina vero Maria Garnier'},
        {id: 'nais_anX', icon: '🗓', title: 'Une naissance en l’an X', level: 'moyen', acte: 'bapteme', year: 1801,
            tip: 'Calendrier républicain : brumaire an X = octobre-novembre 1801 (🪙 Convertisseur d’autrefois).',
            src: 'Du quinze brumaire an dix de la Republique françaiſe=française acte de naiſſance=naissance de Marie Louiſe=Louise née hier fille de Jacques Bernard cultivateur &=et de Jeanne Roux ſon=son épouſe=épouse le ſexe=sexe de l’enfant a eſté=esté|été reconnu être feminin'},
        {id: 'rec1836', icon: '🏠', title: 'Une page de recensement (1836)', level: 'facile', acte: 'recensement', year: 1836,
            tip: 'Les abréviations des recensements : cult., fe, fs, Vve, jlière, id., d° (développe-les).',
            src: 'Martin Jean cult.=cultivateur Durand Marie ſa=sa fe=femme Martin Pierre leur fs=fils Roux Anne Vve=veuve jlière=journaliere|journalière Roux Louis ſon=son fs=fils id.=idem|journalier Bonnet Claude d°=dito|idem'},
    ];
    /** un exercice → {shown: [mots comme sur le registre], words: [{shown, exp, alts}]} */
    function parseExercise(ex) {
        const words = String(ex.src || '').split(/\s+/).filter(Boolean).map(tok => {
            const i = tok.indexOf('=');
            if (i <= 0) return {shown: tok, exp: tok, alts: [tok]};
            const shown = tok.slice(0, i).trim(), alts = tok.slice(i + 1).split('|').map(s => s.trim()).filter(Boolean);
            return {shown, exp: alts[0] || shown, alts: alts.length ? alts : [shown]};
        });
        return {words, shown: words.map(w => w.shown).join(' ').replace(/ \./g, '.'), answer: words.map(w => w.exp).join(' ')};
    }
    /** un mot ramené à l'essentiel pour comparer : u/v et i/j confondus (comme sur le registre), sans ponctuation */
    const wkey = s => fold(s).replace(/&/g, 'et').replace(/[.,;:!?«»"()[\]’'-]/g, '').replace(/v/g, 'u').replace(/j/g, 'i').replace(/y$/, 'i');
    const tokens = s => String(s ?? '').replace(/[’]/g, "'").replace(/([.,;:!?»)])/g, ' ').replace(/[«(]/g, ' ').split(/\s+/).map(w => w.trim()).filter(w => w && wkey(w));
    /** pourquoi le mot vu se lit autrement (une phrase), d'après les lettres qui changent */
    function hintFor(shown, exp) {
        const s = String(shown), out = [];
        if (/ſ/.test(s)) out.push('ſ (s long) = s');
        if (/ꝑ/.test(s)) out.push('ꝑ = par / per');
        if (/ꝓ/.test(s)) out.push('ꝓ = pro');
        if (/ꝰ/.test(s)) out.push('ꝰ = -us');
        if (/[ãõñẽ]/.test(s)) out.push('le tilde remplace un m ou un n');
        if (/æ/.test(s)) out.push('æ = ae');
        if (/^&$/.test(s)) out.push('& = et');
        if (/^\d+bre$/i.test(s)) out.push('7bre = septembre, 8bre = octobre, 9bre = novembre, Xbre = décembre');
        if (/\.$|°$/.test(s) && !out.length) out.push(`« ${s} » est une abréviation de « ${exp} »`);
        if (/^(fe|fs|vve|jliere|jlière)$/i.test(fold(s))) out.push(`« ${s} » est une abréviation de « ${exp} »`);
        return out.join(' ; ');
    }
    /**
     * Corrige une lecture mot à mot (alignement sur la plus longue suite commune, comme une comparaison de textes).
     * → {words: [{exp, got, st: 'ok' | 'faux' | 'manque' | 'trop', hint, shown}], ok, total, score (0–100)}
     */
    function correct(ex, answer) {
        const P = parseExercise(ex), exp = P.words, got = tokens(answer);
        const match = (e, g) => e.alts.some(a => wkey(a) === wkey(g)) || wkey(e.shown) === wkey(g) && wkey(e.shown) === wkey(e.exp);
        const n = exp.length, m = got.length, L = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));
        for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = match(exp[i], got[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
        const words = []; let i = 0, j = 0;
        while (i < n || j < m) {
            if (i < n && j < m && match(exp[i], got[j])) { words.push({exp: exp[i].exp, got: got[j], st: 'ok', shown: exp[i].shown}); i++; j++; continue; }
            // un mot remplacé par un autre (faux) plutôt qu'un oublié + un en trop, quand les deux suites avancent ensemble
            if (i < n && j < m && L[i + 1][j + 1] === L[i][j]) { words.push({exp: exp[i].exp, got: got[j], st: 'faux', shown: exp[i].shown, hint: hintFor(exp[i].shown, exp[i].exp) || `on lit « ${exp[i].exp} »`}); i++; j++; continue; }
            if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) { words.push({exp: exp[i].exp, got: '', st: 'manque', shown: exp[i].shown, hint: hintFor(exp[i].shown, exp[i].exp)}); i++; continue; }
            words.push({exp: '', got: got[j], st: 'trop'}); j++;
        }
        const ok = words.filter(w => w.st === 'ok').length;
        return {words, ok, total: n, extra: words.filter(w => w.st === 'trop').length, score: n ? Math.round(100 * Math.max(0, ok - words.filter(w => w.st === 'trop').length * .5) / n) : 0};
    }

    /* ═════════ La recherche ═════════ */
    /** les entrées en plus quand elles sont chargées : vieux mots des Trésors, abréviations de la lecture automatique */
    function extraEntries() {
        const out = [], W = root?.LCNDA_EXT?.tresorWords?.WORDS || [], AB = root?.LCNDA_LECTURE?.ABBREV || {};
        W.forEach(([t, d]) => out.push({t, d, k: 'mot', a: 'general', ex: '', src: 'Trésors'}));
        Object.entries(AB).forEach(([t, d]) => { if (t.length > 1) out.push({t: `${t}.`, d, k: 'abrev', a: 'recensement', ex: '', src: 'lecture automatique'}); });
        return out;
    }
    let mergedCache = null;
    function allEntries() {
        const extra = extraEntries();
        if (mergedCache && mergedCache.n === extra.length) return mergedCache.list;
        const seen = new Set(), list = [];
        const add = e => { const key = `${e.k}|${fold(e.t)}`; const termKeys = fold(e.t).split(/\s*,\s*/).map(x => x.replace(/\.$/, '')); if (seen.has(key) || e.src && termKeys.some(x => seen.has(`term|${x}`))) return; seen.add(key); fold(e.t).split(/\s*,\s*/).forEach(x => seen.add(`term|${x.replace(/\.$/, '')}`)); list.push(e); };
        ENTRIES.forEach(add); extra.forEach(add);
        mergedCache = {n: extra.length, list};
        return list;
    }
    /** les morceaux d'un terme (« Vve, vve, veufve » → 3 mots à comparer) */
    const parts = t => fold(t).split(/\s*[,;]\s*|\s+…\s+/).map(x => x.replace(/[.()]/g, '').trim()).filter(Boolean);
    function scoreOf(q, hay, termParts) {
        if (!q) return 1;
        const qk = q.replace(/[.]/g, '');
        if (termParts.some(p => p === qk)) return 100;
        if (termParts.some(p => p.startsWith(qk))) return 70;
        if (termParts.some(p => p.includes(qk))) return 50;
        const words = qk.split(' ').filter(Boolean);
        if (words.every(w => hay.includes(w))) return 20 + (words.some(w => termParts.some(p => p.includes(w))) ? 10 : 0);
        return 0;
    }
    /**
     * search('vve', {kind, acte, limit}) → [{type: 'entry'|'letter'|'exercise', score, item}] (du plus proche au moins proche)
     * kind : latin | formule | abrev | mot | lettre | exercice ; acte : bapteme | mariage | sepulture | recensement | general
     */
    function search(q, {kind = '', acte = '', limit = 0} = {}) {
        const f = fold(q).replace(/\s+/g, ' ').trim(), out = [];
        if (!kind || !['lettre', 'exercice'].includes(kind)) allEntries().forEach(e => {
            if (kind && e.k !== kind) return; if (acte && e.a !== acte) return;
            const s = scoreOf(f, fold(`${e.t} ${e.d} ${e.ex}`), parts(e.t)); if (s) out.push({type: 'entry', score: s + (e.src ? -1 : 0), item: e});
        });
        if ((!kind || kind === 'lettre') && !acte) LETTERS.forEach(l => { const s = scoreOf(f, fold(`${l.name} ${l.read} ${l.note} ${l.keys}`), parts(`${l.name}, ${l.keys}`).concat(fold(l.keys).split(' '))); if (s) out.push({type: 'letter', score: s - 2, item: l}); });
        if ((!kind || kind === 'exercice')) EXERCISES.forEach(x => { if (acte && x.acte !== acte) return; const s = scoreOf(f, fold(`${x.title} ${x.tip} ${x.level}`), parts(x.title)); if (s) out.push({type: 'exercise', score: s - 3, item: x}); });
        // sans recherche : le dictionnaire de A à Z, les lettres et les exercices dans leur ordre (du plus courant au plus rare, du plus facile au plus difficile)
        const order = x => (x.type === 'entry' ? 0 : x.type === 'letter' ? 1 + LETTERS.indexOf(x.item) / 1000 : 2 + EXERCISES.indexOf(x.item) / 1000);
        out.sort((a, b) => b.score - a.score || (a.type !== 'entry' || b.type !== 'entry' ? order(a) - order(b) : fold(a.item.t).localeCompare(fold(b.item.t), 'fr')));
        return limit ? out.slice(0, limit) : out;
    }
    /** combien d'entrées par sorte (pour les pastilles « Tout (n) ») */
    function counts(q, acte = '') {
        const r = search(q, {acte}), c = {all: r.length, latin: 0, formule: 0, abrev: 0, mot: 0, lettre: 0, exercice: 0};
        r.forEach(x => { if (x.type === 'entry') c[x.item.k]++; else if (x.type === 'letter') c.lettre++; else c.exercice++; });
        return c;
    }

    return {fold, ENTRIES, KINDS, ACTES, LETTERS, EXERCISES, G, glyphSvg, parseExercise, correct, tokens, search, counts, allEntries, _reset: () => { mergedCache = null; }};
});
