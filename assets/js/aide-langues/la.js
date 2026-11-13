/* 📜 Aide à la lecture — Latin des registres (paroisses catholiques de toute l'Europe, jusqu'au XIXe siècle et parfois au-delà).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'la', name: 'Latin', native: 'Lingua Latina', icon: '🏛', script: 'latine', dir: 'ltr', ocr: ['lat'],
        intro: 'Le latin des curés : actes catholiques de France (surtout avant 1650), d’Italie, d’Espagne, de Pologne, d’Allemagne, de Belgique… Les mots changent de fin selon la phrase (filius, filii, filio) : la recherche trouve les formes les plus courantes.',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['baptizavi', 'j’ai baptisé'], ['baptizatus, baptizata', 'baptisé, baptisée', '« baptizatus est » = a été baptisé', ['baptizatus est', 'baptizata est', 'baptisatus']],
                ['natus, nata', 'né, née', '« natus heri » = né hier', ['nati', 'natum', 'natam']], ['hodie, heri', 'aujourd’hui, hier'], ['nudius tertius', 'avant-hier'],
                ['legitimus, legitima', 'légitime', '', ['legitimi', 'legitimae', 'legitimum', 'legitimam']], ['filius legitimus et naturalis', 'fils légitime et naturel : né de parents mariés'],
                ['ex legitimo matrimonio', 'né du mariage légitime'], ['naturalis, illegitimus, spurius', 'naturel, illégitime (né hors mariage)'], ['gemelli', 'jumeaux'],
                ['infans, proles', 'enfant', '', ['infantem', 'infantis', 'prolem']], ['patrinus, matrina', 'parrain, marraine', '', ['patrini', 'matrinae', 'patrinum']], ['susceptores, levantes', 'parrain et marraine (ceux qui ont tenu l’enfant)'],
                ['cui impositum est nomen', 'à qui on a donné le nom (le prénom) de'], ['domi baptizatus ob periculum mortis', 'ondoyé à la maison en danger de mort'],
                ['sub conditione', 'sous condition (baptême refait au cas où le premier n’était pas valable)'], ['expositus, exposita', 'enfant trouvé, abandonné'],
                ['obstetrix', 'sage-femme'], ['sacro fonte', 'les fonts baptismaux (« levavit de sacro fonte » = a tenu sur les fonts)'],
            ]),
            ...R('mot', 'mariage', [
                ['conjuges', 'les époux (le couple)', '', ['conjugum', 'conjugibus']], ['matrimonium contraxerunt', 'ils se sont mariés'], ['matrimonio juncti', 'unis par le mariage'],
                ['conjunxi', 'j’ai uni (en mariage)', '« in matrimonium conjunxi »'], ['copulavi, copulati', 'j’ai uni, unis (en mariage)'],
                ['sponsus, sponsa', 'fiancé, fiancée ou époux, épouse'], ['sponsalia', 'fiançailles'], ['uxor, uxoris', 'épouse, de l’épouse', '', ['uxorem', 'uxore']], ['maritus', 'mari', '', ['mariti', 'marito']], ['conjux', 'conjoint, époux ou épouse'],
                ['proclamationibus factis, bannis', 'les bans ayant été publiés'], ['denuntiationes', 'les bans (annonces du mariage)', '', ['denuntiationibus', 'denunciationibus']],
                ['praemissis tribus bannorum publicationibus', 'après la publication des trois bans'],
                ['nullo detecto impedimento', 'sans qu’on ait trouvé d’empêchement', '', ['nulloque detecto impedimento']], ['per verba de praesenti', 'par paroles de présent (l’échange des consentements)'],
                ['mutuo consensu', 'par consentement mutuel'], ['benedictionem nuptialem impertitus sum', 'j’ai donné la bénédiction nuptiale'],
                ['in facie ecclesiae', 'devant l’Église (publiquement)'], ['dispensatione obtenta', 'la dispense ayant été obtenue'],
                ['dispensatio in tertio gradu consanguinitatis', 'dispense de parenté au 3e degré (cousins issus de germains)'], ['affinitatis', 'de parenté par alliance'],
                ['viduus, vidua', 'veuf, veuve', '', ['viduum', 'viduam', 'viduae', 'vidui']], ['relicta', 'veuve de (« laissée par »)'], ['adolescens', 'jeune homme (célibataire)'], ['virgo, puella', 'jeune fille (célibataire)'],
                ['testes', 'témoins', '', ['testibus', 'testium']],
            ]),
            ...R('mot', 'sepulture', [
                ['obiit', 'il est mort, elle est morte'], ['decessit', 'est décédé'], ['mortuus, mortua', 'mort, morte', '', ['mortuum', 'mortuam']],
                ['sepultus est, sepulta est', 'il a été inhumé, elle a été inhumée', '', ['sepultus', 'sepulta', 'sepultum']], ['sepelivi', 'j’ai inhumé'], ['sepultura', 'sépulture', '', ['sepulturae']],
                ['cujus corpus sepultum est', 'dont le corps a été inhumé'], ['in coemeterio', 'au cimetière'], ['in ecclesia', 'dans l’église'], ['omnibus sacramentis munitus', 'muni de tous les sacrements', '', ['munita', 'munitus']],
                ['animam Deo reddidit', 'a rendu son âme à Dieu (est mort)'], ['requiescat in pace (R.I.P.)', 'qu’il repose en paix'],
                ['quondam, q., q.m', 'feu, défunt (« filius q.m Petri » = fils de feu Pierre)'], ['defunctus, defuncta, def.', 'défunt, défunte', '« filius defuncti Joannis » = fils de feu Jean', ['defuncti', 'defunctae', 'defunctum']],
                ['exequiae', 'les funérailles'], ['subito', 'subitement'],
            ]),
            ...R('mot', 'general', [
                ['die, mensis', 'le jour, du mois'], ['ejusdem mensis', 'du même mois'], ['eodem die, eodem anno', 'le même jour, la même année'],
                ['pridie', 'la veille'], ['hujus parochiae, ex hac parochia', 'de cette paroisse'], ['parochia', 'paroisse', '', ['parochiae']], ['parochianus', 'paroissien'], ['ejusdem loci, dicti loci', 'du même lieu, dudit lieu'],
                ['praedictus, dictus, supradictus', 'ledit, susdit', '', ['praedicti', 'dicti', 'supradicti']], ['oriundus ex', 'originaire de'], ['incola', 'habitant'], ['habitans in', 'demeurant à'],
                ['testes, praesentibus', 'témoins, en présence de'], ['infrascriptus, subsignatus', 'soussigné'], ['ego infrascriptus parochus', 'moi, curé soussigné'],
                ['parochus, curatus, rector', 'curé'], ['vicarius', 'vicaire'], ['sacerdos, presbyter', 'prêtre'], ['Dnus, Dni, Dno', 'Dominus (seigneur, maître, ou titre d’un prêtre)'],
                ['R. D., Rdus', 'Reverendus Dominus : le révérend (un prêtre)'], ['et, ac, atque', 'et'], ['vero', 'et, quant à (« matrina vero » = et la marraine)'], ['fuit, fuerunt', 'fut, furent'],
                ['nescius scribere', 'ne sachant pas écrire'],
            ]),
            ...R('parente', 'general', [
                ['pater, mater', 'père, mère', '', ['patris', 'matris']], ['parentes', 'parents (père et mère)'], ['filius, filia', 'fils, fille', '« filius Petri » = fils de Pierre', ['filii', 'filiae', 'filio', 'filium', 'filiam']],
                ['frater, soror', 'frère, sœur', '', ['fratris', 'sororis']], ['avus, avia', 'grand-père, grand-mère'], ['proavus', 'arrière-grand-père'],
                ['nepos, neptis', 'petit-fils, petite-fille (ou neveu, nièce)'], ['patruus', 'oncle paternel'], ['avunculus', 'oncle maternel'], ['amita', 'tante paternelle'], ['matertera', 'tante maternelle'],
                ['consobrinus, consobrina', 'cousin, cousine'], ['socer, socrus', 'beau-père, belle-mère (parents du conjoint)'], ['gener', 'gendre'], ['nurus', 'belle-fille (épouse du fils)'],
                ['vitricus', 'beau-père (second mari de la mère)'], ['noverca', 'belle-mère (seconde femme du père)'], ['privignus, privigna', 'beau-fils, belle-fille (enfant du conjoint)'],
                ['orphanus', 'orphelin'], ['tutor', 'tuteur'],
            ]),
            ...R('mois', 'general', [
                ['Januarius, Januarii', 'janvier, de janvier'], ['Februarius, Februarii', 'février, de février'], ['Martius, Martii', 'mars, de mars'], ['Aprilis', 'avril, d’avril'],
                ['Maius, Maii', 'mai, de mai'], ['Junius, Junii', 'juin, de juin'], ['Julius, Julii', 'juillet, de juillet'], ['Augustus, Augusti', 'août, d’août'],
                ['September, Septembris, 7bris', 'septembre, de septembre'], ['October, Octobris, 8bris', 'octobre, d’octobre'], ['November, Novembris, 9bris', 'novembre, de novembre'],
                ['December, Decembris, Xbris, 10bris', 'décembre, de décembre'], ['mensis', 'du mois'], ['Dominica', 'dimanche'], ['hebdomada', 'semaine'],
            ]),
            ...R('nombre', 'general', [
                ['unus, duo, tres', 'un, deux, trois'], ['quattuor, quatuor', 'quatre'], ['quinque, sex, septem', 'cinq, six, sept'], ['octo, novem, decem', 'huit, neuf, dix'],
                ['undecim, duodecim', 'onze, douze'], ['viginti, triginta, quadraginta', 'vingt, trente, quarante'], ['quinquaginta, sexaginta', 'cinquante, soixante'],
                ['septuaginta, octoginta, nonaginta', 'soixante-dix, quatre-vingts, quatre-vingt-dix'], ['centum, mille', 'cent, mille'],
                ['primo, secundo, tertio die', 'le premier, deuxième, troisième jour', '« die prima », « die decima » : le jour peut aussi être au féminin'],
                ['quarto, quinto, sexto', 'quatrième, cinquième, sixième'], ['septimo, octavo, nono', 'septième, huitième, neuvième'], ['decimo, undecimo, duodecimo', 'dixième, onzième, douzième'],
                ['decimo tertio, decimo quinto', 'treizième, quinzième'], ['vigesimo, vicesimo', 'vingtième (« vigesimo primo » = 21e)'], ['trigesimo', 'trentième'],
                ['millesimo septingentesimo', 'mil sept cent'], ['millesimo sexcentesimo', 'mil six cent'], ['millesimo octingentesimo', 'mil huit cent'],
                ['vigesimo, trigesimo, quadragesimo', 'vingtième, trentième, quarantième (dans une année : 20, 30, 40)'],
                ['quinquagesimo, sexagesimo, septuagesimo', 'cinquantième, soixantième, soixante-dixième (50, 60, 70)'], ['octogesimo, nonagesimo', 'quatre-vingtième, quatre-vingt-dixième (80, 90)'],
                ['anno Domini, Anno Dñi', 'l’an du Seigneur'], ['annorum circiter quadraginta', 'âgé d’environ quarante ans'], ['annorum', 'âgé de … ans (« annorum 30 »)'], ['annos natus', 'âgé de … ans'],
                ['aetatis suae', 'de son âge'], ['circiter', 'environ'], ['mensium, dierum', 'de … mois, de … jours (âge d’un petit enfant)'],
            ]),
            ...R('metier', 'general', [
                ['agricola', 'cultivateur'], ['colonus', 'fermier, métayer'], ['faber', 'forgeron, artisan'], ['faber lignarius', 'charpentier'], ['sutor', 'cordonnier'], ['textor', 'tisserand'],
                ['molitor', 'meunier'], ['sartor', 'tailleur'], ['pistor', 'boulanger'], ['lanio', 'boucher'], ['caupo', 'aubergiste'], ['miles', 'soldat'], ['mercator', 'marchand'], ['nauta', 'marinier'],
                ['piscator', 'pêcheur'], ['vinitor', 'vigneron'], ['opilio', 'berger'], ['pastor', 'berger, ou curé (pasteur des âmes)'], ['operarius', 'ouvrier, journalier'], ['famulus', 'valet, domestique'], ['ancilla', 'servante'],
                ['ludimagister', 'maître d’école'], ['aedituus', 'sacristain'], ['chirurgus', 'chirurgien'], ['notarius', 'notaire'],
            ]),
            ...R('formule', 'bapteme', [
                ['Anno Domini … die … mensis … baptizatus est …', 'En l’an du Seigneur …, le … jour du mois de …, a été baptisé …'],
                ['… filius legitimus … et … conjugum', '… fils légitime de … et de …, époux'],
                ['patrinus fuit … matrina vero …', 'le parrain fut …, et la marraine …'], ['ego infrascriptus parochus baptizavi', 'moi, curé soussigné, j’ai baptisé'],
            ]),
            ...R('formule', 'mariage', [
                ['praemissis tribus denuntiationibus … in matrimonium conjunxi …', 'après les trois bans …, j’ai uni en mariage …'],
                ['praesentibus testibus …', 'en présence des témoins …'],
            ]),
            ...R('formule', 'sepulture', [
                ['obiit … cujus corpus sepultum est in coemeterio …', 'est mort …, dont le corps a été enterré au cimetière …'],
                ['omnibus sacramentis munitus animam Deo reddidit', 'muni de tous les sacrements, il a rendu son âme à Dieu'],
            ]),
        ],
        glyphs: {},
        letters: [],
        exercises: [
            {id: 'bapt1695', icon: '🏛', title: 'Un baptême en latin (1695)', level: 'difficile', acte: 'bapteme', year: 1695,
                tip: 'Latin : « Dñi » = Domini, « filiꝰ » = filius, « ꝑochiæ » = parochiae, « æ » = ae.',
                src: 'Anno Dñi=Domini millesimo sexcentesimo nonagesimo quinto die decima mensis Januarii baptizatus fuit Joannes filiꝰ=filius legitimus Petri Garnier et Annæ=Annae Leroy conjugum hujus ꝑochiæ=parochiae Patrinus fuit Joannes Leroy matrina vero Maria Garnier'},
            {id: 'lat_mar1752', icon: '💍', title: 'Un mariage en latin (1752)', level: 'difficile', acte: 'mariage', year: 1752,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « 9bris » = de novembre, « q.m » = feu, le tilde remplace un n.',
                src: 'Anno Dñi=Domini millesimo septingentesimo quinquagesimo secundo die vigesima 9bris=Novembris praemissis tribus denuntiationibus nulloque detecto impedimento ego infrascriptus parochus Petrum Fabre filium legitimum q.m=quondam Joãnis=Joannis Fabre et Mariam Ruffi viduam Antonii Blanc in matrimonium conjunxi praesentibus testibus Jacobo Fabre et Claudio Martin',
                notes: {'9bris': '9bris = Novembris : de novembre (le 9e mois du calendrier romain)', 'q.m': 'q.m = quondam : feu (le père est déjà mort)', 'Joãnis': 'le tilde remplace un n : Joannis'}},
            {id: 'lat_sep1738', icon: '⚱️', title: 'Une sépulture en latin (1738)', level: 'moyen', acte: 'sepulture', year: 1738,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « eccl. » = ecclesiae (de l’église), « circiter » = environ.',
                src: 'Die decima quinta mensis Martii anno Dñi=Domini millesimo septingentesimo trigesimo octavo obiit Anna Blanc vidua q.m=quondam Petri Roux annorum circiter septuaginta omnibus ſacramentis=sacramentis munita cujus corpus ſepultum=sepultum est in coemeterio hujus eccl.=ecclesiae',
                notes: {'q.m': 'q.m = quondam : feu', 'eccl.': 'eccl. = ecclesiae : de l’église', 'ſacramentis': 'ſ (s long) = s'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Latin Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Latin_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Latin Records Extraction / Latin Genealogical Terms', url: 'https://www.familysearch.org/en/wiki/Latin_Language_and_Records'},
            {label: 'GenWiki (genealogy.net) — Lateinische Begriffe in Kirchenbüchern', url: 'https://wiki.genealogy.net/Lateinische_Begriffe'},
        ],
    };
})());
