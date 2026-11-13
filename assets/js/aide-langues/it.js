/* 📜 Aide à la lecture — Italien (registres paroissiaux, état civil napoléonien puis italien).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'it', name: 'Italien', native: 'Italiano', icon: '🇮🇹', script: 'latine', dir: 'ltr', ocr: ['ita'],
        intro: 'Registres d’Italie, de Corse (avant le français), du comté de Nice et de Savoie, du Tessin. Les plus anciens actes sont souvent en latin (filtre « Latin »).',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['nato, nata', 'né, née', '« nato ieri » = né hier'], ['battezzato, battezzata', 'baptisé, baptisée'], ['battesimo', 'baptême'], ['nascita', 'naissance'],
                ['legittimo, legittima', 'légitime'], ['naturale', 'naturel (souvent : né hors mariage)'], ['illegittimo', 'illégitime'],
                ['esposto, esposta', 'enfant trouvé, abandonné (très fréquent en Italie)'], ['trovatello', 'enfant trouvé'], ['ruota', 'le « tour » où l’on déposait les enfants abandonnés'],
                ['padrino', 'parrain'], ['madrina, comare', 'marraine'], ['levatrice, ostetrica', 'sage-femme'], ['gemelli', 'jumeaux'],
                ['battezzato in casa per pericolo di morte', 'ondoyé à la maison en danger de mort'], ['ieri, oggi', 'hier, aujourd’hui'],
            ]),
            ...R('mot', 'mariage', [
                ['matrimonio', 'mariage'], ['sposi', 'les époux, les mariés'], ['sposo, sposa', 'époux, épouse (le marié, la mariée)'], ['coniugi', 'les époux (le couple)'], ['coniugati', 'mariés'],
                ['celibe', 'célibataire (homme)'], ['nubile', 'célibataire (femme)'], ['vedovo', 'veuf'], ['vedova', 'veuve'], ['moglie', 'épouse'], ['marito', 'mari'],
                ['pubblicazioni', 'les bans (annonces du mariage)'], ['dispensa', 'dispense'], ['consanguineità', 'parenté par le sang (empêchement au mariage)'], ['testimoni', 'témoins'],
            ]),
            ...R('mot', 'sepulture', [
                ['morto, morta', 'mort, morte'], ['defunto, defunta', 'défunt, défunte'], ['deceduto, deceduta', 'décédé, décédée'], ['morte', 'la mort'],
                ['sepolto, sepolta', 'enterré, enterrée'], ['sepoltura', 'sépulture'], ['cimitero, camposanto', 'cimetière'], ['cadavere', 'corps (du défunt)'],
                ['fu', 'feu, défunt, devant un nom (« figlio del fu Pietro » = fils de feu Pierre) ; ailleurs : « fut » (« padrino fu » = le parrain fut)'],
                ['quondam, q.m', 'feu (latin gardé dans les actes italiens)'], ['d’anni, di anni', 'âgé de … ans', '« d’anni settanta »'], ['munito dei Santi Sacramenti', 'muni des saints sacrements'],
            ]),
            ...R('mot', 'general', [
                ['parroco', 'curé'], ['arciprete', 'archiprêtre (curé d’une paroisse importante)'], ['pievano', 'curé d’une « pieve » (église mère de campagne)'], ['cappellano', 'chapelain'], ['sacerdote', 'prêtre'],
                ['parrocchia', 'paroisse'], ['comune', 'commune'], ['frazione', 'hameau (partie d’une commune)'], ['domiciliato', 'domicilié'], ['residente', 'résidant'], ['abitante', 'habitant'],
                ['stato civile', 'état civil'], ['atto di nascita', 'acte de naissance'], ['atto di matrimonio', 'acte de mariage'], ['atto di morte', 'acte de décès'],
                ['ufficiale dello stato civile', 'officier de l’état civil'], ['sindaco', 'maire'], ['dichiarante', 'déclarant'], ['sottoscritto', 'soussigné'], ['questa', 'cette (« di questa parrocchia »)'],
            ]),
            ...R('parente', 'general', [
                ['padre', 'père'], ['madre', 'mère'], ['genitori', 'parents (le père et la mère)'], ['figlio', 'fils'], ['figlia', 'fille'], ['figli', 'enfants, fils'],
                ['fratello', 'frère'], ['sorella', 'sœur'], ['nonno', 'grand-père'], ['nonna', 'grand-mère'], ['nipote', 'petit-enfant, ou neveu, nièce (le même mot)'],
                ['zio', 'oncle'], ['zia', 'tante'], ['cugino, cugina', 'cousin, cousine'], ['suocero, suocera', 'beau-père, belle-mère (parents du conjoint)'],
                ['genero', 'gendre'], ['nuora', 'belle-fille (épouse du fils)'], ['cognato, cognata', 'beau-frère, belle-sœur'], ['patrigno', 'beau-père (second mari de la mère)'], ['matrigna', 'belle-mère (seconde femme du père)'],
            ]),
            ...R('mois', 'general', [
                ['gennaio, genaro, gennaro', 'janvier (genaro, gennaro : formes anciennes)'], ['febbraio, febraro', 'février'], ['marzo', 'mars'], ['aprile', 'avril'], ['maggio', 'mai'], ['giugno', 'juin'],
                ['luglio', 'juillet'], ['agosto', 'août'], ['settembre, 7bre', 'septembre'], ['ottobre, 8bre', 'octobre'], ['novembre, 9bre', 'novembre'], ['dicembre, decembre, Xbre, 10bre', 'décembre'],
                ['mese', 'mois'], ['giorno', 'jour'], ['addì', 'le (jour) : « addì cinque marzo » = le 5 mars'],
            ]),
            ...R('nombre', 'general', [
                ['uno, una', 'un, une'], ['due', 'deux'], ['tre', 'trois'], ['quattro', 'quatre'], ['cinque', 'cinq'], ['sei', 'six'], ['sette', 'sept'], ['otto', 'huit'], ['nove', 'neuf'], ['dieci', 'dix'],
                ['undici', 'onze'], ['dodici', 'douze'], ['venti', 'vingt'], ['trenta', 'trente'], ['quaranta', 'quarante'], ['cinquanta', 'cinquante'], ['sessanta', 'soixante'],
                ['settanta', 'soixante-dix'], ['ottanta', 'quatre-vingts'], ['novanta', 'quatre-vingt-dix'], ['cento', 'cent'], ['mille', 'mille'], ['mille ottocento', 'mil huit cent'], ['mille settecento', 'mil sept cent'],
                ['primo', 'premier'], ['anni', 'ans'], ['mesi', 'mois'], ['giorni', 'jours'], ['ore', 'heures (« alle ore dieci » = à dix heures)'],
            ]),
            ...R('metier', 'general', [
                ['contadino', 'paysan, cultivateur'], ['agricoltore', 'agriculteur'], ['colono', 'fermier, métayer'], ['mezzadro', 'métayer (partage la récolte avec le propriétaire)'],
                ['bracciante', 'journalier (ouvrier agricole)'], ['giornaliero', 'journalier'], ['possidente', 'propriétaire'], ['muratore', 'maçon'], ['falegname', 'menuisier'], ['fabbro', 'forgeron'],
                ['calzolaio', 'cordonnier'], ['sarto', 'tailleur'], ['tessitore', 'tisserand'], ['mugnaio', 'meunier'], ['fornaio', 'boulanger'], ['oste', 'aubergiste'], ['pastore', 'berger'],
                ['negoziante', 'négociant, commerçant'], ['servo, serva', 'domestique'], ['filatrice', 'fileuse'], ['notaio', 'notaire'],
            ]),
            ...R('formule', 'bapteme', [
                ['L’anno del Signore … il giorno … del mese di …', 'L’an du Seigneur …, le … jour du mois de …'],
                ['è stato battezzato da me sottoscritto parroco', 'a été baptisé par moi, curé soussigné'],
                ['figlio legittimo e naturale di … e di …', 'fils légitime et naturel de … et de …'], ['Padrino fu …', 'le parrain fut …'],
            ]),
            ...R('formule', 'mariage', [
                ['premesse le tre pubblicazioni', 'après les trois publications (bans)'], ['si sono uniti in matrimonio', 'se sont unis en mariage'],
            ]),
            ...R('formule', 'sepulture', [
                ['passò a miglior vita', 'est passé à une vie meilleure (est mort)'], ['il cui cadavere fu sepolto nel cimitero', 'dont le corps fut enterré au cimetière'],
            ]),
            ...R('formule', 'general', [
                ['Avanti di me … Ufficiale dello Stato Civile … è comparso …', 'Devant moi …, officier de l’état civil …, a comparu …'],
            ]),
        ],
        glyphs: {}, letters: [],
        exercises: [
            {id: 'it_batt1812', icon: '👶', title: 'Un battesimo (baptême) de 1812', level: 'moyen', acte: 'bapteme', year: 1812,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Attention au petit mot « fu » : « Padrino fu » = le parrain fut, « del fu Antonio » = de feu Antoine.',
                src: 'L’anno=L’anno|L\'anno del Signore mille ottocento dodici il giorno cinque di Marzo Giovanni Battista figlio di Pietro Rossi contadino e di Maria Bianchi coniugi di queſta=questa parrocchia nato ieri è stato battezzato da me parroco ſottoſcritto=sottoscritto Padrino fu Giuſeppe=Giuseppe Rossi del fu Antonio',
                notes: {fu: '« fu » = fut (le parrain fut…) ou feu (« del fu Antonio » = de feu Antoine)', 'queſta': 'ſ (s long) = s'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Italian Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Italian_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Italy Civil Registration', url: 'https://www.familysearch.org/en/wiki/Italy_Civil_Registration'},
        ],
    };
})());
