/* LCNDA — 🪄 Corrections proposées après « ✨ Lire l'acte » (et à la demande sur le texte de l'Atelier) : calculs purs, sans réseau ni page.
 * window.LCNDA_HTRFIX (navigateur) ou require() (Node, tests/test-htr-correction.js).
 *
 * La lecture d'une écriture à la main (Kraken) donne « novembe », « Répnblique », « tribnnal » : des mots presque justes.
 * On compare chaque mot qui n'est pas dans le lexique (ou que Kraken dit peu sûr) aux mots du lexique, avec une distance
 * d'édition où les lettres qui se ressemblent dans l'écriture ancienne coûtent peu (u/n, m/nn, a/o, a/u, e/c, i/l, r/v,
 * b/l, s/ſ… : celles de LCNDA_LECTURE, app-lecture-auto.js, et quelques-unes en plus), et avec le contexte des dates en
 * toutes lettres (« mil huit cent » + un mot proche de « soixante »). On PROPOSE (1 à 3 mots) ; rien n'est jamais changé seul.
 *
 * Le lexique :
 *  - les mots des actes d'état civil, des jugements, des actes notariés et des registres paroissiaux (ci-dessous, LEX_FR),
 *    les mois et les nombres en toutes lettres ;
 *  - les mots de « 📜 Aide à la lecture » (LCNDA_AIDE_LECTURE : formules, abréviations, mots de chaque langue) ;
 *  - les métiers et prénoms de LCNDA_LECTURE (COMMON_TRADES, FIRST_NAMES, ABBREV) ;
 *  - les noms, prénoms, lieux et métiers de la base (GET htr_lexicon, lib/htr_correction.php : sans vivants ni fiches
 *    confidentielles), le lieu de l'acte ;
 *  - le lexique personnel (« Ajouter au lexique », réglage genealogie-htr-lexique, gardé aussi dans la base).
 * Pour le latin et l'allemand, un lexique plus petit (LEX_LA, LEX_DE + l'Aide à la lecture) ; les autres langues : seulement
 * les mots de l'Aide à la lecture et de la base.
 *
 *  - cost(a, b)                       coût de lecture de a en b (0 = pareil ; une confusion connue 0,3)
 *  - buildLexicon({lang, names, personal, place})   le lexique (un objet à passer à propose)
 *  - propose(texte, lexique, {level, unsure, sure})  [{s, e, word, props: [{value, cost, why}], sure, kind}]
 *  - applyFix(texte, fix, valeur)     le texte avec ce mot remplacé (même casse, même ponctuation autour)
 *  - knows(lexique, mot)              le mot est-il dans le lexique ?
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_HTRFIX = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    const i18n = (s, v) => { const I = (typeof window !== 'undefined' ? window : globalThis).LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const req = name => { try { return typeof require === 'function' ? require(name) : null; } catch (_) { return null; } };
    const LX = () => (root && root.LCNDA_LECTURE) || req('./app-lecture-auto.js');
    const AIDE = () => (root && root.LCNDA_AIDE_LECTURE) || req('./app-aide-lecture.js');
    /** sans accents, sans majuscules, ſ = s, œ = oe, apostrophes droites */
    const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ſ/g, 's').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’‘`]/g, "'");
    const lowAcc = s => String(s ?? '').toLowerCase().replace(/ſ/g, 's').replace(/[’‘`]/g, "'");

    /* ═════════ Le lexique français des actes (état civil, jugements, notaires, registres paroissiaux) ═════════
     * Formes courantes ; les pluriels en -s et les participes en -ée, -és, -ées sont ajoutés tout seuls.
     * Volontairement absents : de petits mots presque jamais écrits dans un acte et qui ressemblent à un mot courant mal lu
     * (« te », « tu », « toi », « mie »…), pour que « Tours te vingt » propose « le ». */
    const LEX_FR = `
        le la les l un une des de du d au aux à a ce cet cette ces se sa son ses leur leurs lui elle elles il ils on nous vous eux
        qui que quoi dont où ou et ni ne pas point plus moins mais car donc or si sans avec chez dans par pour sur sous entre vers
        envers contre outre après avant depuis pendant selon suivant durant devant derrière dessus dessous dedans dehors ici là
        y en tout tous toute toutes même mêmes autre autres tel telle tels telles quel quelle quels quelles chaque aucun aucune
        nul nulle certain certaine plusieurs lequel laquelle lesquels lesquelles duquel desquels auquel auxquels celui celle ceux
        celles ceci cela ça icelui icelle iceux lesdits lesdites ledit ladite dudit desdits desdites audit auxdits susdit susdite
        susdits susdites susnommé susnommée sus-indiqué sus-indiquée sus-dit sus-énoncé ci-dessus ci-dessous ci-après ci-joint ci-devant
        comme comment combien quand lorsque lors alors aussi ainsi encore déjà toujours jamais bien mal très trop peu beaucoup
        assez fort tant autant puis ensuite enfin seulement également notamment savoir sus jusque jusqu lorsqu puisqu quoique
        puisque parce afin attendu vu considérant nonobstant moyennant pourquoi néanmoins cependant toutefois pourtant partant
        oui non ouï mon ma mes ton ta tes notre nos votre vos ledit icelle soit soient fût fut furent
        est sont été être étant était étaient sera seront serait seraient soit avoir ayant eu eue eus eues ai as a avons avez ont
        avait avaient aura auront aurait auraient eut eurent
        fait faite faits faites faire faisant fera feront dit dite dits dites dire disant déclaré déclarée déclarer déclarant
        déclarants déclaration comparu comparue comparus comparant comparante comparants comparution présent présente présents
        présentes présenté présentée présenter présence absent absente absence demeurant demeurante demeurants domicilié
        domiciliée domiciliés domicile résidant résidante résidence habitant habitante habitants né née nés nées naître naissance
        décédé décédée décédés décès mort morte morts mourir trépassé trépas inhumé inhumée inhumation enterré enterrée sépulture
        baptisé baptisée baptême baptiser ondoyé ondoyée marié mariée mariés mariage marier épousé épousée époux épouse épouses
        célébré célébration fiancé fiancée fiançailles veuf veuve veuvage divorce divorcé divorcée légitime légitimes légitimement
        naturel naturelle reconnu reconnue reconnaissance légitimé légitimée adopté adoptée adoption enfant enfants fils fille
        filles père mère pères mères parent parents aïeul aïeule aïeux grand-père grand-mère frère frères sœur sœurs oncle tante
        neveu nièce cousin cousine cousins germain germaine gendre bru belle-mère beau-père beau-frère belle-sœur parrain marraine
        tuteur tutrice tutelle subrogé curateur curatelle orphelin orpheline mineur mineure mineurs majeur majeure majeurs
        consentement consentant consentante consenti assisté assistée autorisé autorisée autorisation
        masculin féminin sexe garçon homme femme femmes hommes personne personnes individu héritier héritière héritiers succession
        signé signée signés signature signatures signer savoir sachant su soussigné soussignée soussignés lecture lu lue relu
        approuvé approuvée rature ratures renvoi renvois mot mots nul nuls paraphé paraphe expédition minute original copie
        conforme collationné certifié certifiée délivré délivrée extrait extraits registre registres double feuillet folio page
        acte actes état civil officier officiers maire adjoint municipal municipalité mairie conseil conseiller commune communes
        canton cantonal arrondissement département départemental préfet préfecture sous-préfet sous-préfecture république
        république française empire impérial impériale royaume royal royale roi reine empereur nation national nationale loi lois
        décret décrets ordonnance ordonnances arrêt arrêté arrêts code article articles titre chapitre section paragraphe
        tribunal tribunaux cour cours justice juge juges jugement jugements judiciaire juridiction audience audiences chambre
        greffe greffier greffière président présidente vice-président procureur procureurs substitut ministère public publique
        réquisition réquisitions réquisitoire requête requêtes requérant requérante requérants requis requise requiert requérir
        demande demandes demandeur demanderesse défendeur défenderesse partie parties avoué avoués avocat avocats huissier
        huissiers notaire notaires commis commise commettons commettre commet nommé nommée nommés nommer rapport rapporteur
        rapporté conclusions conclu conclut concluant entendu entendue entendus entendre ouïr ouïe déposition dépositions
        témoin témoins témoignage testimonial testimoniale testimoniaux preuve preuves enquête enquêtes contre-enquête
        délibéré délibérer délibération délibérations motivé motivée motivées verbal verbale verbales verbaux oral orale
        écrit écrite écrits conformément conforme conformité attendu attendus considérant considérants ordonne ordonné ordonnée
        ordonnons ordonner disons dit déclare déclarons statuant statué rectifié rectifiée rectifier rectification rectifications
        transcrit transcrite transcrire transcription inscrit inscrite inscrire inscription mention mentionné mentionnée
        marge erreur erreurs omission omis omise oubli oublié faute faux fausse vrai vraie véritable véritablement exact exacte
        effectivement bien-fondé fondé fondée fondement indépendamment résulte résulter résultant résultat établi établie
        établit établir constaté constatée constate constater certificat certifie notoriété acte de notoriété jugement rendu
        rendue dépens frais charge charges cause causes motif motifs moyen moyens raison raisons lieu lieux fin fins effet
        effets suite opposition oppose opposer opposé s'oppose empêchement empêchements communiqué communiquée communication
        soit-communiqué vu vue vus vues ensemble précède précédé précédente précédent suivant suivante susmentionné expédié
        dressé dressée dresser rédigé rédigée passé passée reçu reçue retenu contrôlé insinué insinuation enregistré
        enregistrée enregistrement timbre timbré
        monsieur messieurs madame mesdames mademoiselle mesdemoiselles sieur sieurs dame dames demoiselle demoiselles maître
        maîtres messire seigneur seigneurs écuyer chevalier comte comtesse baron baronne marquis marquise duc duchesse noble
        honorable honnête discrète vénérable révérend citoyen citoyenne citoyens bourgeois bourgeoise habitant manant
        curé curés vicaire prêtre prêtres desservant recteur chapelain abbé moine religieux religieuse évêque archevêque
        diocèse paroisse paroisses paroissien paroissienne église églises chapelle cimetière fonts baptismaux sacrement
        sacrements bénédiction nuptiale bans ban publication publications dispense dispenses consanguinité affinité degré
        catholique apostolique romaine sainte saint saints saintes notre-dame dieu ame âme défunt défunte défunts feu feue
        jour jours mois an ans année années âge âgé âgée âgés heure heures matin soir midi minuit après-midi hier aujourd
        aujourd'hui demain veille lendemain présent date dates époque environ moitié demi demie quart siècle
        janvier février mars avril mai juin juillet août septembre octobre novembre décembre
        lundi mardi mercredi jeudi vendredi samedi dimanche
        vendémiaire brumaire frimaire nivôse pluviôse ventôse germinal floréal prairial messidor thermidor fructidor
        sansculottides complémentaire
        zéro un une deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize vingt vingts trente
        quarante cinquante soixante septante octante nonante cent cents mil mille million premier première second seconde
        deuxième troisième quatrième cinquième sixième septième huitième neuvième dixième onzième douzième vingtième centième
        dernier dernière quatre-vingt quatre-vingts dix-sept dix-huit dix-neuf
        maison maisons demeure ferme hameau village bourg ville cité faubourg rue place quartier château domaine terre terres
        champ champs pré prés vigne vignes bois moulin métairie closerie borderie bien biens meuble meubles immeuble immeubles
        héritage propriété propriétaire propriétaires
        contrat mariage testament donation vente achat acquisition échange bail fermage partage inventaire quittance obligation
        procuration constitution rente rentes dot douaire apport communauté société somme sommes francs livres sols sous deniers
        centimes valeur prix paiement payé payée payer créancier débiteur hypothèque
        cultivateur cultivatrice laboureur laboureurs journalier journalière vigneron vigneronne meunier meunière boulanger
        boulangère boucher bouchère charpentier menuisier maçon maçons tailleur couturière tisserand tisserande marchand
        marchande marchands négociant négociante aubergiste cabaretier forgeron maréchal maréchal-ferrant charron tonnelier
        sabotier cordonnier serrurier tanneur cardeur fileuse lingère domestique domestiques servante serviteur valet fermier
        fermière métayer métayère propriétaire rentier rentière bourgeois instituteur institutrice médecin chirurgien
        pharmacien apothicaire notaire huissier militaire soldat sergent caporal capitaine lieutenant colonel général gendarme
        garde garde-champêtre facteur employé employée commis ouvrier ouvrière manœuvre manouvrier berger bergère bouvier
        meunier boulanger charretier voiturier jardinier tonnelier tuilier potier carrier mineur ménagère sans profession
        profession état qualité métier
        lequel laquelle lesquels nous a présenté enfant lui déclarant auquel il a donné prénom prénoms nom noms surnom
        dénommé dénommée appelé appelée appelés nommément
        requérons requiert supplie suppliant suppliante plaise humblement respectueusement exposant exposante expose exposé
        prie prier fera droit droits faire faisons portant porté portée porter rendre rendons rendu ordonner ordonnons commis
        commettre commettant
        cette dernière ledit dernier susdite d'autre part d'une part entre eux eux-mêmes lui-même elle-même
        né vivant vivante vivants décédé lieu-dit dit-on audit
        vu les pièces pièce vu la requête le tout tour tours mari maris ferrant acquéreur acquéreurs vendeur vendeurs vendeuse acheteur
        cédant cessionnaire donateur donataire mandataire comptant contenance terroir levant couchant midi nord ruisseau chemin
        joignant confrontant tenant aboutissant pièce parcelle labourable pré jardin étude garanties garantie je j me moi soi lui-même uni unie unis unies union
        procéder procède procèdent procédé procédant procédons procédure procédures précéder précédant décéder décède décèdent
        décédant céder cède cédé posséder possède possédant possédé préférer préféré régler réglé réglant répéter répété
        célébrer célèbre célébrons compléter complète complété accéder succéder succédé lever levé élever élevé mener mené
        amener amené emmener promener achever achevé acheter acheté appeler appelle appellent jeter
        être suis es sommes êtes fus fûmes furent serons serez sois soyez soyons étions étiez aurons aurez aurions ayez ayons
        aller va vont allé allée venir venu venue venus vient viennent venant tenir tenu tenue tient tiennent tenant
        devoir doit doivent dû due dus dues devant pouvoir peut peuvent pu pouvant vouloir veut veulent voulu voulant
        savoir sait savent su sachant voir voit voient vu voyant prendre prend prennent pris prise prenant mettre met mettent
        mis mise mettant recevoir reçoit reçu reçue recevant connaître connu connue connaissant paraître paru comparaître
        comparaissant apparaître apparu disparu naître naît naissant mourir meurt mourant vivre vit vivant vécu
        écrire écrit écrivant décrire décrit inscrire inscrit transcrire transcrit souscrire souscrit lire lit lisant
        conclure conclut conclu résoudre résolu joindre joint jointe adjoindre adjoint craindre plaindre plaint
        ouvrir ouvert offrir offert couvrir couvert souffrir souffert servir servi servant sortir sorti partir parti partant
        dormir sentir consentir consenti consentant mentir requérir requis acquérir acquis acquise conquérir
        finir fini finie unir réunir réuni réunie bénir béni bénie remplir rempli fournir fourni établir établi agir agi
        choisir choisi saisir saisi jouir joui obéir garantir garanti investir avertir averti nourrir nourri
        rendre rendu rendant vendre vendu vendant entendre entendu attendre attendu défendre défendu descendre descendu
        perdre perdu répondre répondu tendre prétendre prétendu suspendre faire fait faisant défaire refaire satisfaire
        dire disant redire interdire interdit prédit maudire contredit
        `;
    /** les verbes réguliers en -er des actes : l'infinitif, le participe (et ses accords), le présent et l'imparfait */
    const VERBS_ER = `déclarer présenter signer assister publier afficher donner nommer demeurer inhumer baptiser ondoyer marier épouser
        prononcer dresser rédiger approuver constater délivrer mentionner rectifier ordonner juger statuer délibérer enregistrer
        comparer contracter accorder autoriser dispenser opposer reposer exposer imposer déposer proposer supposer composer
        porter apporter rapporter reporter importer exporter emporter supporter constituer instituer substituer attribuer
        trouver prouver éprouver retrouver laisser passer repasser tasser verser renverser verser payer employer envoyer
        renvoyer prier supplier confier certifier justifier notifier signifier vérifier spécifier qualifier modifier identifier
        habiter résider exister consister insister persister assister demander commander recommander mander accepter
        refuser excuser accuser causer reposer user abuser exhiber représenter présumer résumer consommer nommer renommer
        informer former conformer réformer confirmer affirmer fermer enfermer renfermer aimer estimer réclamer proclamer
        appeler rappeler annoncer renoncer prononcer dénoncer énoncer commencer avancer placer remplacer tracer lancer
        changer échanger manger ranger arranger obliger engager dégager partager charger décharger loger juger interroger
        diriger exiger ériger corriger négliger rédiger protéger abréger alléger songer plonger prolonger allonger
        marquer remarquer indiquer expliquer appliquer impliquer compliquer communiquer pratiquer fabriquer
        travailler habiller conseiller réveiller surveiller veiller tailler détailler
        aider garder regarder retarder hasarder accorder raccorder fonder seconder inonder aborder border
        compter conter raconter monter remonter démonter monter chanter planter enter hanter contenter présenter augmenter
        jurer assurer mesurer procurer durer endurer figurer désigner assigner consigner soussigner témoigner éloigner
        tirer retirer attirer désirer admirer inspirer expirer opérer coopérer libérer considérer
        donner pardonner abandonner ordonner raisonner soupçonner sonner tonner
        lever élever entrer rentrer rencontrer montrer démontrer chercher rechercher toucher coucher accoucher boucher
        marcher sécher lécher pécher prêcher empêcher dépêcher
        aller cultiver arriver priver dériver laver relever enlever trouver approuver éprouver`;
    const verbForms = v => { const st = v.slice(0, -2), soft = /[cg]$/.test(st) ? (st.endsWith('c') ? st.slice(0, -1) + 'ç' : st + 'e') : st;
        return [v, st + 'é', soft + 'ant', st + 'e', st + 'ent', soft + 'ons', soft + 'ait', soft + 'aient', soft + 'a']; };
    /* Le latin des registres (en plus de l'Aide à la lecture) */
    const LEX_LA = `
        anno annus anni domini die diei dies mensis mense hujus ejusdem eodem praesenti praesentis currentis
        januarii februarii martii aprilis maii junii julii augusti septembris octobris novembris decembris
        primo secundo tertio quarto quinto sexto septimo octavo nono decimo undecimo duodecimo vigesimo trigesimo
        millesimo septingentesimo octingentesimo nongentesimo sexcentesimo centesimo quinquagesimo sexagesimo septuagesimo
        octogesimo nonagesimo quadragesimo
        ego infrascriptus infrascripta parochus vicarius curatus sacerdos presbyter baptizavi baptizatus baptizata baptizatum
        natum natam natus nata nati heri hodie filium filiam filius filia filii filiae legitimum legitimam legitimi legitimae
        legitimo matrimonio conjugum conjuges conjunxi uxor uxoris uxorem maritus patre matre patris matris pater mater
        patrinus matrina patrini matrinae fuerunt fuit fuere qui quae quod cui cujus nomen nomine impositum est sunt erat
        et ac atque cum in ex de pro per sub a ab ad apud sine non nec testibus testes praesentibus praesentes mecum
        subscripserunt subscripsit signaverunt signavit nescit nesciunt scribere sepultus sepulta sepultum sepelivi defunctus
        defuncta obiit annorum aetatis circiter sacramentis munitus ecclesiae ecclesia parochiae parochia loci hujusce
        `;
    /* L'allemand des registres (en plus de l'Aide à la lecture) */
    const LEX_DE = `
        im am an in zu zum zur von vom und oder der die das des dem den ein eine einer eines einem einen ist sind war waren wurde
        wurden worden hat haben hatte geboren getauft gestorben begraben beerdigt getraut copuliert verheiratet ehelich eheliche
        ehelicher unehelich Sohn Tochter Kind Vater Mutter Eltern Ehefrau Ehemann Witwe Witwer Pate Patin Paten Zeugen Zeuge
        Pfarrer Pfarre Pfarrei Kirche Kirchspiel Jahr Jahre Jahres Tag Tage Monat Monats Januar Februar März April Mai Juni
        Juli August September Oktober November Dezember Jänner eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf
        dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn zwanzig dreißig vierzig fünfzig sechzig siebzig
        achtzig neunzig hundert tausend ersten zweiten dritten alt Alter Bauer Bürger Einwohner wohnhaft hier hiesigen
        `;
    const words = s => String(s).split(/\s+/).map(w => w.trim()).filter(Boolean);
    /** nombres en toutes lettres (les dates) */
    const NUMW = new Set(words('un une deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize vingt vingts trente quarante cinquante soixante septante octante nonante cent cents mil mille').map(norm));
    const UNITS = new Set(words('un deux trois quatre cinq six sept huit neuf dix').map(norm));
    const MONTHS = words('janvier février mars avril mai juin juillet août septembre octobre novembre décembre');
    /** petits mots qui peuvent être dans une date sans être des nombres (« vingt et un », « le », « de ») */
    const NUM_GLUE = new Set(['et', 'le', 'la', 'de', 'du', 'an', 'l', 'mois']);

    /* ═════════ Lettres qui se ressemblent (en plus de LCNDA_LECTURE.CONFUSIONS) ═════════
     * [a, b, coût, pourquoi] dans les deux sens */
    const EXTRA = [
        ['a', 'u', 0.3, '« a » ouvert ressemble à « u »'], ['b', 'l', 0.3, '« b » sans sa panse ressemble à « l »'], ['c', 'l', 0.4, '« l » sans sa boucle ressemble à « c »'],
        ['ct', 'a', 0.5, '« ct » lié ressemble à « a »'], ['e', 'i', 0.6, '« e » fermé ressemble à « i » sans point'], ['r', 'n', 0.6, '« r » et « n » se confondent'],
        ['m', 'nn', 0.3, '« m » et « nn » ont le même nombre de jambages'], ['m', 'ni', 0.3, '« m » et « ni » ont le même nombre de jambages'], ['m', 'ui', 0.3, '« m » et « ui » ont le même nombre de jambages'],
        ['nn', 'un', 0.3, '« nn » et « un » ont les mêmes jambages'], ['nn', 'uu', 0.3, '« nn » et « uu » ont les mêmes jambages'],
        ['z', 's', 0.5, '« z » et « s » se confondent'], ['y', 'j', 0.4, '« y » et « j » se confondent'], ['v', 'u', 0.3, '« v » et « u » sont la même lettre dans l’écriture ancienne'],
        ['i', 'j', 0.3, '« i » et « j » sont la même lettre dans l’écriture ancienne'],
    ];
    let CONF = null, MULTI = null, SUB = null;
    /** ces ressemblances ne valent que pour une majuscule ancienne, en tête du mot (S/L, T/F) */
    const CAP_ONLY = new Set(['s>l', 'l>s', 't>f', 'f>t']);
    function confTable() {
        if (CONF) return CONF;
        CONF = new Map(); MULTI = new Set(); SUB = Object.create(null);
        const put = (a, b, c, w) => { for (const [x, y] of [[norm(a), norm(b)], [norm(b), norm(a)]]) { if (x === y) continue; const k = x + '>' + y, o = CONF.get(k); if (!o || o.c > c) CONF.set(k, {c, w}); if (x.length > 1 || y.length > 1) { MULTI.add(x); MULTI.add(y); } } };
        const L = LX(); (L?.CONFUSIONS || []).forEach(([a, b, w]) => put(a, b, 0.3, w));
        EXTRA.forEach(([a, b, c, w]) => put(a, b, c, i18n(w)));
        CONF.forEach((v, k) => { const [x, y] = k.split('>'); if (x.length === 1 && y.length === 1 && !CAP_ONLY.has(k)) (SUB[x] ||= Object.create(null))[y] = v.c; });
        return CONF;
    }
    /**
     * Coût de lecture de a (lu) en b (le mot juste) : une distance d'édition où une confusion connue coûte 0,3 (1 ou 2 lettres),
     * une lettre doublée ou dédoublée 0,5, deux lettres inversées 0,8, une autre lettre 1 (les accents ne comptent pas) ; une
     * première lettre différente (sans ressemblance) coûte 0,4 de plus. lim : au-delà, on s'arrête (99).
     */
    function cost(a, b, lim = 99, {first = true, cap = null} = {}) {
        return costN(norm(a), norm(b), lim, cap ?? /^[A-ZÀ-ÝŒ]/.test(String(a ?? '')), first);
    }
    /** la même chose pour deux mots déjà passés par norm() */
    function costN(a, b, lim, cap, first) {
        if (a === b) return 0;
        const n = a.length, m = b.length;
        if (Math.abs(n - m) > 4 || Math.abs(n - m) * 0.5 > lim) return 99;
        const C = CONF || confTable(), S = SUB;
        const sub = (x, y, i) => { if (x === y) return 0; const r = S[x]; const c = r ? r[y] : undefined; if (c !== undefined) return c; return cap && i === 1 && CAP_ONLY.has(x + '>' + y) ? 0.3 : 1; };
        let prev = new Float32Array(m + 1); const rows = [prev]; for (let j = 0; j <= m; j++) prev[j] = j;
        const bm = new Array(m + 1).fill(false); for (let j = 2; j <= m; j++) bm[j] = MULTI.has(b.slice(j - 2, j));
        for (let i = 1; i <= n; i++) {
            const cur = new Float32Array(m + 1); cur[0] = i; let rowMin = i;
            const x = a[i - 1], a2 = i > 1 ? a.slice(i - 2, i) : '', multiA = i > 1 && MULTI.has(a2), dupA = i > 1 && a[i - 2] === x;
            for (let j = 1; j <= m; j++) {
                const y = b[j - 1];
                let v = prev[j - 1] + sub(x, y, i);
                const del = prev[j] + (dupA ? 0.5 : 1); if (del < v) v = del;
                const ins = cur[j - 1] + (j > 1 && b[j - 2] === y ? 0.5 : 1); if (ins < v) v = ins;
                if (multiA) { const c = C.get(a2 + '>' + y); if (c && rows[i - 2][j - 1] + c.c < v) v = rows[i - 2][j - 1] + c.c; if (bm[j]) { const c2 = C.get(a2 + '>' + b.slice(j - 2, j)); if (c2 && rows[i - 2][j - 2] + c2.c < v) v = rows[i - 2][j - 2] + c2.c; } }
                if (bm[j]) { const c = C.get(x + '>' + b.slice(j - 2, j)); if (c && prev[j - 2] + c.c < v) v = prev[j - 2] + c.c; }
                if (i > 1 && j > 1 && x === b[j - 2] && a[i - 2] === y && rows[i - 2][j - 2] + 0.8 < v) v = rows[i - 2][j - 2] + 0.8;
                cur[j] = v; if (v < rowMin) rowMin = v;
            }
            rows.push(cur); prev = cur;
            if (rowMin > lim + 0.01) return 99;
        }
        let c = prev[m];
        if (first && a[0] !== b[0] && sub(a[0], b[0], 1) >= 1 && a[1] !== b[0] && a[0] !== b[1] && !C.has(a.slice(0, 2) + '>' + b[0]) && !C.has(a[0] + '>' + b.slice(0, 2)) && !C.has(a.slice(0, 2) + '>' + b.slice(0, 2))) c += 0.4; // la première lettre se lit d'habitude bien
        c = Math.round(c * 100) / 100;
        return c > lim ? 99 : c;
    }
    /** « « n » lu au lieu de « u » » : la phrase de LCNDA_LECTURE.why, sinon une phrase simple */
    function why(read, right) {
        const L = LX(); if (norm(read) === norm(right)) return i18n('Il manque l’accent');
        const w = L?.why ? L.why(norm(read), norm(right)) : ''; return w || i18n('« {x} » ressemble à « {y} »', {x: read, y: right});
    }

    /* ═════════ Le lexique ═════════ */
    /** les formes en plus : pluriels en -s, participes en -ée / -és / -ées, -al → -aux */
    function forms(w) {
        const out = [w]; if (w.length < 3 || /[\s']/.test(w)) return out;
        if (/(eu|au)$/.test(w)) out.push(w + 'x'); else if (!/[sxz]$/.test(w)) out.push(w + 's');
        if (/é$/.test(w)) out.push(w + 'e', w + 's', w + 'es');
        if (/al$/.test(w)) out.push(w.slice(0, -2) + 'aux');
        return out;
    }
    const LANG_LEX = {fr: LEX_FR, la: LEX_LA, de: LEX_DE};
    /** le code de l'Aide à la lecture pour la langue de la lecture (« fra », « fra+lat », « deu »…) */
    function langsOf(lang) {
        const map = {fra: 'fr', fr: 'fr', lat: 'la', la: 'la', deu: 'de', de: 'de', ger: 'de', ita: 'it', spa: 'es', pol: 'pl', nld: 'nl', eng: 'en', grc: 'grc', ell: 'grc', por: 'pt', cat: 'ca', ces: 'cs', dan: 'da', swe: 'sv', hun: 'hu', ron: 'ro', rus: 'ru', ukr: 'uk', slk: 'sk', slv: 'sl', hrv: 'hr', lit: 'lt', nor: 'no', oci: 'oc', bre: 'br', eus: 'eu'};
        const out = String(lang || 'fra').split('+').map(x => map[x.trim().toLowerCase()] || x.trim().toLowerCase()).filter(Boolean);
        return out.length ? [...new Set(out)] : ['fr'];
    }
    /**
     * Le lexique : {common: Map(norm → {form, w}), proper: Map(norm → {form, w}), byLen: Map(longueur → [norm])}.
     * names : {surnames, firstNames, places, trades} (textes ou {value, weight}) ; personal : [mots] ; place : le lieu de l'acte.
     */
    function buildLexicon({lang = 'fra', names = {}, personal = [], place = ''} = {}) {
        const common = new Map(), proper = new Map(), codes = langsOf(lang);
        const addC = (w, wt = 1, only = false) => { w = String(w || '').trim(); if (!w || /[0-9.…()[\]«»]/.test(w)) return; if (/-/.test(w)) w.split('-').forEach(x => { if (x.length >= 2) addC(x, wt, only); }); for (const f of (only ? [w] : forms(w))) { const k = norm(f); if (!k) continue; const o = common.get(k); if (!o) common.set(k, {form: f.toLowerCase(), w: wt, forms: new Set([f.toLowerCase()])}); else { o.forms.add(f.toLowerCase()); if (wt > o.w) o.w = wt; } } };
        /** un nom propre (ou plusieurs : « Saint-Félix-des-Bois » → Saint, Félix, Bois) ; generic : d'une liste générale (prénoms
         *  courants), pas de la base : il ne remplace un mot que de très près */
        const addP = (x, wt = 1, generic = false) => { const w = String(typeof x === 'string' ? x : x?.value || x?.name || '').trim(); if (!w || w.length < 2 || /[0-9]/.test(w)) return;
            w.split(/[\s,()/-]+/).forEach(part => { const p = part.replace(/^['’]+|['’.]+$/g, ''); if (p.length < 3 || !/^[A-ZÀ-ÝŒ]/.test(p)) return; const k = norm(p), f = p[0].toUpperCase() + p.slice(1), o = proper.get(k);
                if (!o) proper.set(k, {form: f, w: wt, generic}); else { o.w = Math.max(o.w, wt); o.generic = o.generic && generic; } }); };
        codes.forEach(c => words(LANG_LEX[c] || '').forEach(w => addC(w, 3)));
        if (codes.includes('fr')) words(VERBS_ER).forEach(v => verbForms(v).forEach(f => addC(f, 2, !/é$/.test(f))));
        // 📜 l'Aide à la lecture : les mots des formules et des listes de chaque langue choisie
        try { const A = AIDE(); (A?.allEntries?.() || []).filter(e => codes.includes(e.lang)).forEach(e => [e.t, ...(e.alt || [])].forEach(t => String(t || '').replace(/\([^)]*\)/g, '').split(/[\s,;/…]+/).forEach(x => { const y = x.replace(/^['’-]+|['’.:-]+$/g, ''); if (y.length >= 2 && !/\./.test(x)) addC(y, 2); }))); } catch (_) {}
        const L = LX();
        if (codes.includes('fr') && L) { (L.COMMON_TRADES || []).forEach(t => words(t).forEach(w => addC(w, 2))); Object.values(L.ABBREV || {}).forEach(t => words(t).forEach(w => addC(w, 2))); }
        (L?.FIRST_NAMES || []).forEach(n => addP(n, 1, true));
        (names.trades || []).forEach(t => words(typeof t === 'string' ? t : t?.value || t?.name || '').forEach(w => { if (w.length >= 3 && !/^[A-ZÀ-Ý]/.test(w)) addC(w, 1); }));
        (names.surnames || []).forEach(n => addP(n, 2)); (names.firstNames || []).forEach(n => addP(n, 2)); (names.places || []).forEach(n => addP(n, 2));
        if (place) addP(place, 5);
        (personal || []).forEach(w => { const s = String(w || '').trim(); if (!s) return; if (/^[A-ZÀ-Ý]/.test(s)) addP(s, 6); else addC(s, 6); });
        // les « petits mots absents » : jamais dans le lexique, même s'ils viennent d'une liste (te, tu, toi, mie)
        if (codes.includes('fr')) ['te', 'tu', 'toi', 'mie', 'tes', 'ton'].forEach(w => { if (!(personal || []).some(p => norm(p) === w)) common.delete(w); });
        const byLen = new Map(); const put = k => { const n = k.length; if (!byLen.has(n)) byLen.set(n, []); byLen.get(n).push(k); };
        common.forEach((_, k) => put(k)); proper.forEach((_, k) => { if (!common.has(k)) put(k); });
        return {common, proper, byLen, codes, fr: codes.includes('fr'), size: common.size + proper.size};
    }
    /** le mot (sans apostrophe ni trait d'union) est-il dans le lexique ? (avec quelques terminaisons : -s, -x, -e, -es) */
    function knows(lex, w) {
        if (/-/.test(String(w))) return String(w).split('-').filter(Boolean).every(x => knows(lex, x));
        const k = norm(w); if (!k) return true;
        if (lex.common.has(k) || lex.proper.has(k) || lex.common.has(k + 's')) return true;
        if (!lex.fr) return false;
        for (const end of ['s', 'x', 'e', 'es']) if (k.length > end.length + 2 && k.endsWith(end) && lex.common.has(k.slice(0, -end.length))) return true;
        return false;
    }

    /* ═════════ Les propositions ═════════ */
    /** jusqu'où on propose, selon la longueur du mot */
    const limitOf = (n, level) => { const b = n <= 2 ? 0.3 : n === 3 ? 0.5 : n === 4 ? 0.6 : n <= 6 ? 1.0 : n <= 8 ? 1.3 : n <= 11 ? 1.6 : 2.0; return level === 'plus' ? b * 1.4 + 0.3 : b; };
    /** même casse que le mot lu : « Décembe » → « Décembre », « DÉCEMBE » → « DÉCEMBRE » */
    function caseLike(read, value, isProper = false) {
        const r = String(read);
        if (r.length > 1 && r === r.toUpperCase() && r !== r.toLowerCase()) return value.toUpperCase();
        if (isProper) return value;
        if (/^[A-ZÀ-ÝŒ]/.test(r)) return value[0].toUpperCase() + value.slice(1);
        return value;
    }
    /** les mots du lexique les plus proches : [{value, cost, proper}] triés */
    function nearest(lex, w, {lim, properOk = true, properLim = 0.35, only = null} = {}) {
        const k = norm(w), n = k.length, out = [], cap = /^[A-ZÀ-ÝŒ]/.test(String(w)); confTable();
        const consider = key => {
            const c0 = lex.common.get(key), p0 = lex.proper.get(key);
            if (only && !only.has(key)) return;
            // vite : même début (ou une lettre qui lui ressemble, ou une lettre en trop devant), ou même fin — sinon trop loin
            if (!only && key[0] !== k[0] && key[0] !== k[1] && !(SUB[k[0]] && SUB[k[0]][key[0]] !== undefined) && !(cap && CAP_ONLY.has(k[0] + '>' + key[0])) && key.slice(-2) !== k.slice(-2)) return;
            const c = costN(k, key, lim, cap, true);
            if (c0 && c <= lim) out.push({value: c0.form, cost: c, w: c0.w, proper: false, key});
            else if (p0 && properOk && c <= Math.min(lim, properLim, p0.generic ? 0.6 : 99)) out.push({value: p0.form, cost: c, w: p0.w, proper: true, key});
        };
        if (only) only.forEach(key => { if (lex.common.has(key) || lex.proper.has(key)) consider(key); });
        else for (let L = Math.max(1, n - 3); L <= n + 3; L++) (lex.byLen.get(L) || []).forEach(consider);
        const best = new Map(); out.forEach(o => { const b = best.get(o.key); if (!b || o.cost < b.cost) best.set(o.key, o); });
        const pre = v => { let i = 0; const x = norm(v); while (i < x.length && i < k.length && x[i] === k[i]) i++; return i; };
        return [...best.values()].sort((a, b) => a.cost - b.cost || b.w - a.w || pre(b.value) - pre(a.value) || a.value.length - b.value.length);
    }
    const ELISION = ['l', 'd', 'n', 's', 'c', 'j', 'm', 't', 'qu', 'jusqu', 'lorsqu', 'puisqu', 'quoiqu', 'presqu', 'aujourd'];
    /** Découpe le texte en mots : [{s, e, t, pre, preEnd}] (le préfixe élidé « d' », « qu' » à part ; les traits d'union coupent) */
    function tokenize(text) {
        const out = [], rx = /[\p{L}ſ\p{M}]+(?:['’][\p{L}ſ\p{M}]+)?/gu; let m;
        while ((m = rx.exec(text))) {
            const raw = m[0], ap = raw.search(/['’]/);
            if (ap > 0) out.push({s: m.index, e: m.index + raw.length, t: raw.slice(ap + 1), pre: raw.slice(0, ap), ap: raw[ap]});
            else out.push({s: m.index, e: m.index + raw.length, t: raw, pre: ''});
        }
        return out;
    }
    /**
     * Les propositions pour un texte. o.level : 'prudent' (par défaut) | 'plus' ; o.unsure : (s, e) → vrai si Kraken dit le mot peu sûr ;
     * o.sure : (s, e) → vrai si Kraken est très sûr ; o.keep : un Set des mots « gardés tels quels ». → [{s, e, word, props: [{value, cost, why}], sure, kind}]
     *  kind : 'word' (un mot proche), 'number' (une date en toutes lettres), 'accent', 'split' (deux mots collés), 'elision' (« l' » collé)
     */
    function propose(text, lex, o = {}) {
        const level = o.level === 'plus' ? 'plus' : 'prudent', toks = tokenize(String(text || '')), res = new Array(toks.length).fill(null);
        const known = toks.map(tk => knows(lex, tk.t));
        const isNum = (i, useRes = true) => { if (i < 0 || i >= toks.length) return false; const r = useRes && res[i]?.props?.[0]; return NUMW.has(norm(r ? r.value : toks[i].t)); };
        const gapOk = (i, j) => !/[.;:!?()\n]/.test(text.slice(toks[Math.min(i, j)].e, toks[Math.max(i, j)].s)); // pas de point ni de ligne entre deux nombres
        const mk = (i, props, kind, sure) => { const tk = toks[i]; const word = text.slice(tk.s, tk.e);
            const cleaned = []; props.forEach(p => { if (!cleaned.some(q => lowAcc(q.full) === lowAcc(p.full)) && lowAcc(p.full) !== lowAcc(word)) cleaned.push(p); });
            return cleaned.length ? {s: tk.s, e: tk.e, word, props: cleaned.slice(0, 3).map(p => ({value: p.full, cost: p.cost, why: p.why})), sure: !!sure, kind} : null; };
        const full = (tk, value, proper, prefix) => { const v = caseLike(tk.t, value, proper); return tk.pre ? (prefix ?? tk.pre) + (tk.ap || "'") + v : v; };
        // un texte écrit avec des accents (après 1800 d'habitude) : un accent oublié se propose ; dans un vieux registre sans accents, non
        const letters = (String(text).match(/\p{L}/gu) || []).length, accented = (String(text).match(/[éèêàùâîôûç]/gi) || []).length;
        const accents = o.accents ?? (letters < 200 ? accented > 0 : accented / letters > 0.012);
        const sentenceStart = tk => /(^|[.!?;:]\s*|\n\s*)$/.test(text.slice(Math.max(0, tk.s - 4), tk.s)) || tk.s === 0;
        // 1. les mots absents du lexique
        toks.forEach((tk, i) => {
            const w = tk.t, k = norm(w), n = k.length, unsure = o.unsure ? o.unsure(tk.s, tk.e) : false;
            let pre = tk.pre ? tk.pre : null, preFix = null;
            if (pre !== null && lex.fr) { const pk = norm(pre); if (!ELISION.includes(pk)) { const c = ELISION.map(e => ({e, c: cost(pk, e, 99, {first: false})})).sort((a, b) => a.c - b.c)[0]; if (c && c.c <= 1) preFix = {value: /^[A-ZÀ-Ý]/.test(pre) ? c.e[0].toUpperCase() + c.e.slice(1) : c.e, c: c.c}; } }
            if (n < 2 || (n < 3 && level !== 'plus') || /\d/.test(w)) return; // deux lettres : trop d'hésitations (« ue » : ne ? de ?)
            const acc = lex.common.get(k); // un accent oublié ou faux (« requete » → « requête », « conformement » → « conformément »)
            if (accents && acc && n >= 5 && acc.forms.size === 1 && !lex.proper.has(k) && lowAcc(w) !== acc.form && !preFix) { res[i] = mk(i, [{full: full(tk, acc.form, false), cost: 0.05, why: why(w, acc.form)}], 'accent', true); return; }
            if (known[i] && !preFix) {
                if (!unsure) return;
                // peu sûr pour Kraken, mais un vrai mot : seulement une confusion de lettres (jamais « sûr »)
                const near = nearest(lex, w, {lim: 0.31, properOk: /^[A-ZÀ-Ý]/.test(w)}).filter(x => x.key !== k);
                if (near.length) res[i] = mk(i, near.map(x => ({full: full(tk, x.value, x.proper), cost: x.cost, why: why(w, x.value)})), 'word', false);
                return;
            }
            const cap = /^[A-ZÀ-ÝŒ]/.test(w), lim = limitOf(n, level) + (o.sure && o.sure(tk.s, tk.e) ? -0.3 : 0);
            const props = [];
            if (known[i] && preFix) { props.push({full: preFix.value + (tk.ap || "'") + w, cost: preFix.c, why: i18n('« {x} » lu au lieu de « {y} »', {x: pre, y: preFix.value})}); res[i] = mk(i, props, 'elision', false); return; }
            // une majuscule au milieu d'une phrase : plutôt un nom propre ; un mot commun court ne la remplace que de près (« Faure » ≠ « faute »)
            const midCap = cap && !sentenceStart(tk);
            const inName = cap && (/[A-ZÀ-Ý][\p{L}]*-$/u.test(text.slice(Math.max(0, tk.s - 30), tk.s)) || /^-[A-ZÀ-Ý]/u.test(text.slice(tk.e, tk.e + 2))); // « Saint-Amand-Montrond » : un nom composé
            const commonLim = inName ? -1 : midCap && level !== 'plus' ? Math.min(lim, n <= 6 ? 0.6 : 1.3) : lim;
            const near = nearest(lex, w, {lim, properOk: true, properLim: cap ? lim : (level === 'plus' ? 0.6 : 0.35)}).filter(x => x.proper || x.cost <= commonLim);
            near.forEach(x => props.push({full: full(tk, x.value, x.proper, preFix?.value), cost: x.cost + (preFix?.c || 0), why: why(w, x.value), proper: x.proper}));
            // « Cacte » → « l’acte » : une lettre collée devant un mot qui commence par une voyelle
            if (lex.fr && !tk.pre && n >= 5 && /^[lcdsti]/i.test(w) && /^[aeiouyéèêh]/i.test(k.slice(1))) {
                const into = /^[d]/i.test(w) ? 'd' : /^s/i.test(w) ? 's' : 'l', c0 = into === norm(w[0]) ? 0.2 : 0.4, rest = w.slice(1);
                nearest(lex, rest, {lim: limitOf(n - 1, level) - c0, properOk: false}).filter(x => /^[aeiouyh]/.test(norm(x.value))).slice(0, 2).forEach(x => props.push({full: (cap && i > 0 && !/[.!?]\s*$/.test(text.slice(0, tk.s)) ? into : (cap ? into.toUpperCase() : into)) + "'" + caseLike(rest, x.value), cost: x.cost + c0 + 0.1, why: i18n('« {x} » collé au mot suivant', {x: into + "'"}), elision: true}));
            }
            // deux mots collés (« pourfuire » → « pour faire ») : chaque morceau d'au moins 3 lettres
            if (lex.fr && n >= 7 && !tk.pre && (!props.length || props[0].cost > 0.6)) {
                for (let cut = 3; cut <= n - 3; cut++) {
                    const a = w.slice(0, cut), b = w.slice(cut), ka = norm(a), kb = norm(b);
                    const ea = lex.common.has(ka), eb = lex.common.has(kb);
                    if (ea && eb) props.push({full: caseLike(a, lex.common.get(ka).form) + ' ' + lex.common.get(kb).form, cost: 0.5, why: i18n('Deux mots collés'), split: true});
                    else if (ea || eb) { const nb = nearest(lex, ea ? b : a, {lim: Math.min(0.6, limitOf((ea ? b : a).length, level)), properOk: false})[0];
                        if (nb) props.push({full: ea ? caseLike(a, lex.common.get(ka).form) + ' ' + nb.value : caseLike(a, nb.value) + ' ' + lex.common.get(kb).form, cost: 0.6 + nb.cost, why: i18n('Deux mots collés'), split: true}); }
                }
            }
            props.sort((a, b) => a.cost - b.cost);
            if (!props.length) return;
            const best = props[0], second = props.find(p => norm(p.full) !== norm(best.full));
            const sure = !best.proper && !best.split && !(midCap && !best.elision) && best.cost <= Math.max(0.35, limitOf(n, 'prudent') * 0.5) && (!second || second.cost - best.cost >= 0.3);
            res[i] = mk(i, props, best.split ? 'split' : best.elision ? 'elision' : 'word', sure);
        });
        // 2. les dates en toutes lettres : « mil huit aut » → « cent » ; « cent suivante treize » → « soixante »
        if (lex.fr) toks.forEach((tk, i) => {
            const k = norm(tk.t); if (NUMW.has(k) || tk.pre || k.length < 2 || /\d/.test(tk.t)) return;
            const prev = i > 0 && gapOk(i - 1, i) && isNum(i - 1), next = i + 1 < toks.length && gapOk(i, i + 1) && isNum(i + 1);
            if (!prev && !next) return;
            if (NUM_GLUE.has(k)) return;
            const p2 = i > 1 && gapOk(i - 2, i) ? norm(res[i - 2]?.props?.[0]?.value || toks[i - 2].t) : '', p1 = i > 0 ? norm(res[i - 1]?.props?.[0]?.value || toks[i - 1].t) : '';
            const props = [];
            if ((p2 === 'mil' || p2 === 'mille') && UNITS.has(p1) && k.length <= 6 && (!known[i] || k.length <= 4))
                props.push({full: caseLike(tk.t, 'cent'), cost: Math.min(0.6, cost(k, 'cent')), why: i18n('Après « mil {x} », on attend « cent »', {x: p1})});
            const strong = prev && next; // un nombre avant ET après : même un vrai mot (« suivante ») peut être un nombre mal lu
            if (!known[i] || strong) {
                const lim = limitOf(k.length, level) + (known[i] ? 0.1 : 0.8);
                nearest(lex, tk.t, {lim, properOk: false, only: NUMW}).forEach(x => props.push({full: caseLike(tk.t, x.value), cost: x.cost, why: i18n('Dans une date en toutes lettres : « {x} »', {x: x.value})}));
            }
            if (!props.length) return;
            props.sort((a, b) => a.cost - b.cost);
            const before = res[i]?.props || [];
            const merged = [...props, ...before.map(p => ({full: p.value, cost: p.cost + 0.2, why: p.why}))];
            const best = merged[0], second = merged.find(p => norm(p.full) !== norm(best.full));
            res[i] = mk(i, merged, 'number', !known[i] && best.cost <= 0.7 && (!second || second.cost - best.cost >= 0.3));
        });
        // 3. un mois : un nombre avant, une année (« mil ») ou un nombre après
        if (lex.fr) toks.forEach((tk, i) => {
            const k = norm(tk.t); if (known[i] || res[i]?.kind === 'number' || k.length < 4) return;
            const prev = i > 0 && (isNum(i - 1) || /\d\s*$/.test(text.slice(0, tk.s))), next = i + 1 < toks.length && (isNum(i + 1) || /^\s*\d/.test(text.slice(tk.e)));
            if (!prev || !next) return;
            const near = nearest(lex, tk.t, {lim: limitOf(k.length, level) + 0.5, properOk: false, only: new Set(MONTHS.map(norm))});
            if (!near.length) return;
            const before = res[i]?.props || [];
            const merged = [...near.map(x => ({full: caseLike(tk.t, x.value), cost: x.cost, why: i18n('Un mois, dans une date')})), ...before.map(p => ({full: p.value, cost: p.cost + 0.2, why: p.why}))];
            res[i] = mk(i, merged, 'number', near[0].cost <= 1.0);
        });
        return res.filter(f => f && !(o.keep && o.keep.has && o.keep.has(f.word)));
    }
    /** le texte avec la proposition mise à la place du mot (la ponctuation et les espaces autour ne bougent pas) */
    function applyFix(text, fix, value) { return text.slice(0, fix.s) + value + text.slice(fix.e); }
    /** toutes les propositions « sûres » d'un coup (de la fin vers le début, pour garder les positions) */
    function applySure(text, fixes) { let t = String(text); [...fixes].filter(f => f.sure).sort((a, b) => b.s - a.s).forEach(f => { t = applyFix(t, f, f.props[0].value); }); return t; }

    return {norm, cost, why, buildLexicon, knows, propose, tokenize, applyFix, applySure, limitOf, langsOf, LEX_FR, LEX_LA, LEX_DE, NUMW, EXTRA};
});
