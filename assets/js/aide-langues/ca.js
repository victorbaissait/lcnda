/* 📜 Aide à la lecture — Catalan (registres de Catalogne, des Pyrénées-Orientales / Roussillon, d’Andorre, des Baléares et de Valence).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'ca', name: 'Catalan', native: 'Català', icon: '🟨', script: 'latine', dir: 'ltr', ocr: ['cat'],
        intro: 'Registres de Catalogne, d’Andorre, des Baléares, de Valence et du Roussillon (Pyrénées-Orientales, en catalan jusqu’au début du XVIIIe siècle). Beaucoup de registres mêlent le catalan et le latin ; après 1830 environ, le castillan les remplace en Espagne.',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['batejat, batejada', 'baptisé, baptisée', '« fou batejada en les fonts baptismals »', ['batejat']],
                ['he batejat', 'j’ai baptisé'], ['baptisme, bateig', 'baptême'],
                ['nat, nada', 'né, née'], ['fill, filla', 'fils, fille'], ['fill legítim i natural', 'fils légitime et naturel (né de parents mariés)'],
                ['fill natural', 'enfant né hors mariage'], ['expòsit, expòsita', 'enfant trouvé, abandonné'],
                ['padrí', 'parrain'], ['padrina', 'marraine'], ['padrins', 'parrain et marraine'], ['fillol, fillola', 'filleul, filleule'],
                ['avis paterns', 'grands-parents du côté du père'], ['avis materns', 'grands-parents du côté de la mère'],
                ['fonts baptismals', 'fonts baptismaux'], ['bessons', 'jumeaux'],
            ]),
            ...R('mot', 'mariage', [
                ['matrimoni', 'mariage'], ['contragueren matrimoni', 'contractèrent mariage (se sont mariés)'], ['esposalles', 'fiançailles, mariage'],
                ['fadrí', 'garçon, jeune homme jamais marié'], ['donzella', 'jeune fille jamais mariée'], ['vidu, vídua', 'veuf, veuve'],
                ['amonestacions', 'les bans (annonces du mariage)'], ['benedicció nupcial', 'bénédiction nuptiale'], ['dispensa', 'dispense'],
                ['testimonis', 'témoins'], ['nuvi, núvia', 'le marié, la mariée'], ['pubill, pubilla', 'héritier, héritière d’une maison (souvent une fille unique qui garde le bien)'],
                ['hereu', 'l’héritier (d’ordinaire le fils aîné qui reçoit la maison)'],
            ]),
            ...R('mot', 'deces', [
                ['morí, va morir', 'mourut, est mort'], ['mort, morta', 'mort, morte'], ['difunt, difunta', 'défunt, défunte (aussi « feu » : « fill del difunt Joan »)'],
                ['enterrat, enterrada, sepultat', 'enterré(e)'], ['sepultura', 'sépulture'], ['cementiri, fossar', 'cimetière'],
                ['cadàver', 'le corps (du défunt)'], ['rebuts els sants sagraments', 'après avoir reçu les saints sacrements'],
                ['albat, albada', 'petit enfant mort avant l’âge de raison (enterré comme un « petit ange »)'], ['testament', 'testament'],
            ]),
            ...R('mot', 'general', [
                ['parròquia', 'paroisse'], ['rector', 'curé'], ['vicari', 'vicaire'], ['prevere', 'prêtre'], ['bisbat', 'diocèse'],
                ['natural de', 'né à, originaire de'], ['habitant de, habitant en', 'qui habite à'], ['veí, veïna', 'voisin, habitant (de la commune)'],
                ['de la present parròquia', 'de cette paroisse'], ['dit, dita', 'ledit, ladite'], ['mas', 'ferme isolée, mas'], ['casa', 'maison (et famille qui y vit)'],
                ['vila, lloc', 'ville, village'], ['en Joan, na Maria', '« en », « na » devant un prénom : monsieur, madame (ancien usage)'],
            ]),
            ...R('parente', 'general', [
                ['pare', 'père'], ['mare', 'mère'], ['pares', 'parents (père et mère)'], ['germà, germana', 'frère, sœur'], ['avi, àvia', 'grand-père, grand-mère'],
                ['nét, néta', 'petit-fils, petite-fille'], ['besavi, besàvia', 'arrière-grand-père, arrière-grand-mère'], ['oncle, tia', 'oncle, tante'],
                ['nebot, neboda', 'neveu, nièce'], ['cosí, cosina', 'cousin, cousine'], ['marit', 'mari'], ['muller, esposa', 'épouse (femme)'],
                ['sogre, sogra', 'beau-père, belle-mère (parents du conjoint)'], ['gendre', 'gendre'], ['nora', 'belle-fille (épouse du fils)'],
                ['cunyat, cunyada', 'beau-frère, belle-sœur'], ['fillastre, fillastra', 'beau-fils, belle-fille (enfant du conjoint)'],
                ['padrastre, madrastra', 'beau-père, belle-mère (nouveau conjoint du parent)'],
            ]),
            ...R('mois', 'general', [
                ['gener', 'janvier'], ['febrer', 'février'], ['març', 'mars'], ['abril', 'avril'], ['maig', 'mai'], ['juny', 'juin'], ['juliol', 'juillet'],
                ['agost', 'août'], ['setembre, 7bre', 'septembre'], ['octubre, 8bre', 'octobre'], ['novembre, 9bre', 'novembre'], ['desembre, dezembre, 10bre, Xbre', 'décembre'],
                ['mes', 'mois'], ['dia', 'jour'], ['any', 'année', '« dia vint de maig de l’any mil set-cents » = le 20 mai 1700'],
            ]),
            ...R('nombre', 'general', [
                ['un, u, una', 'un, une'], ['dos, dues', 'deux'], ['tres', 'trois'], ['quatre', 'quatre'], ['cinc', 'cinq'], ['sis', 'six'], ['set', 'sept'],
                ['vuit, huit', 'huit'], ['nou', 'neuf'], ['deu', 'dix'], ['onze', 'onze'], ['dotze', 'douze'], ['tretze', 'treize'], ['catorze', 'quatorze'], ['quinze', 'quinze'],
                ['setze', 'seize'], ['disset, desset', 'dix-sept'], ['divuit, devuit', 'dix-huit'], ['dinou, denou', 'dix-neuf'], ['vint', 'vingt'], ['trenta', 'trente'],
                ['quaranta', 'quarante'], ['cinquanta', 'cinquante'], ['seixanta', 'soixante'], ['setanta', 'soixante-dix'], ['vuitanta, huitanta', 'quatre-vingts'],
                ['noranta', 'quatre-vingt-dix'], ['cent', 'cent'], ['mil', 'mille'], ['set-cents, sis-cents, vuit-cents', 'sept cents, six cents, huit cents'],
                ['primer, segon, tercer', 'premier, deuxième, troisième'], ['d’edat de … anys', 'âgé de … ans'], ['anys, mesos, dies', 'ans, mois, jours'],
            ]),
            ...R('metier', 'general', [
                ['pagès', 'paysan, cultivateur (qui a ses terres)'], ['treballador, jornaler', 'journalier'], ['masover', 'métayer qui tient le mas'],
                ['teixidor', 'tisserand'], ['paraire', 'cardeur, apprêteur de laine'], ['sabater', 'cordonnier'], ['sastre', 'tailleur'], ['ferrer', 'forgeron, maréchal-ferrant'],
                ['fuster', 'menuisier, charpentier'], ['mestre de cases, paleta', 'maçon'], ['moliner', 'meunier'], ['pastor', 'berger'], ['traginer', 'muletier, transporteur'],
                ['pescador', 'pêcheur'], ['mariner', 'marin'], ['botiguer', 'boutiquier'], ['negociant', 'négociant'], ['hisendat', 'propriétaire (qui vit de ses biens)'],
                ['menestral', 'artisan'], ['notari', 'notaire'], ['metge', 'médecin'], ['cirurgià', 'chirurgien'], ['soldat', 'soldat'],
            ]),
            ...R('abrev', 'general', [
                ['7bre, 8bre, 9bre, Xbre', 'setembre, octubre, novembre, desembre : septembre, octobre, novembre, décembre (7e, 8e, 9e et 10e mois du calendrier romain)'],
                ['q.', 'que (« q. » ou q surmonté d’un trait)'],
            ]),
            ...R('formule', 'bapteme', [
                ['Dia … de … de … , jo … rector, he batejat solemnement …', 'Le … de … de l’an …, moi … curé, j’ai baptisé solennellement …'],
                ['fill legítim i natural de … i de … , cònjuges', 'fils légitime et naturel de … et de …, époux'], ['foren padrins …', 'les parrains furent …'],
            ]),
            ...R('formule', 'mariage', [
                ['precedides les tres amonestacions', 'après les trois bans'], ['contragueren matrimoni per paraules de present', 'se sont mariés par paroles de présent (l’échange des consentements)'],
            ]),
            ...R('formule', 'deces', [
                ['fou enterrat el cadàver de …', 'fut enterré le corps de …'], ['morí rebuts els sants sagraments', 'est mort après avoir reçu les saints sacrements'],
            ]),
        ],
        glyphs: {},
        letters: [],
        exercises: [
            {id: 'ca_bapt1785', icon: '👶', title: 'Un bateig (baptême) de 1785', level: 'moyen', acte: 'bapteme', year: 1785,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « pagès » = paysan ; « foren padrins » = les parrains furent.',
                src: 'Dia vint de maig de mil set-cents vuitanta-cinc he batejat Josep fill legítim i natural de Pere Vila pagès i de Maria Puig cònjuges de la present parròquia foren padrins Joan Puig i Anna Vila',
                notes: {pagès: 'pagès = paysan, cultivateur'}},
            {id: 'ca_mat1760', icon: '💍', title: 'Un matrimoni (mariage) de 1760', level: 'facile', acte: 'mariage', year: 1760,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « fadrí » = garçon jamais marié ; « donzella » = jeune fille.',
                src: 'Dia tres de febrer de mil set-cents seixanta precedides les tres amonestacions contragueren matrimoni Francesc Roca fadrí i Teresa Soler donzella testimonis Pau Roca i Jaume Soler',
                notes: {'fadrí': 'fadrí = garçon jamais marié', donzella: 'donzella = jeune fille jamais mariée'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Catalan Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Catalan_Genealogical_Word_List'},
            {label: 'Diccionari de la llengua catalana (Institut d’Estudis Catalans)', url: 'https://dlc.iec.cat/'},
            {label: 'Archives départementales des Pyrénées-Orientales — registres paroissiaux', url: 'https://archives.cd66.fr/'},
        ],
    };
})());
