/* 📜 Aide à la lecture — Néerlandais et flamand (registres des Pays-Bas, de Flandre, du Nord de la France ; état civil après 1796-1811).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'nl', name: 'Néerlandais', native: 'Nederlands', icon: '🇳🇱', script: 'latine', dir: 'ltr', ocr: ['nld'],
        intro: 'Registres des Pays-Bas, de Flandre (Belgique) et de la Flandre française. Les catholiques écrivaient souvent en latin, les protestants (réformés) en néerlandais. « ij » s’écrit souvent « ÿ » ; « Jansen » veut d’abord dire « fils de Jan ».',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['gedoopt', 'baptisé', '« is gedoopt » = a été baptisé'], ['doop', 'baptême'], ['doopboek', 'registre des baptêmes'], ['geboren', 'né'], ['kind', 'enfant'],
                ['wettig', 'légitime'], ['onwettig, onecht', 'illégitime, né hors mariage'], ['getuigen, doopgetuigen', 'témoins (du baptême : les parrains)'],
                ['peter', 'parrain (en Flandre)'], ['meter', 'marraine (en Flandre)'], ['vroedvrouw', 'sage-femme'], ['tweeling', 'jumeaux'], ['vondeling', 'enfant trouvé'],
            ]),
            ...R('mot', 'mariage', [
                ['getrouwd', 'marié'], ['huwelijk', 'mariage'], ['ondertrouw, ondertrouwd', 'inscription officielle des fiancés avant le mariage ; inscrits (les bans suivent)'],
                ['echtelieden', 'les époux, le couple'], ['echtgenoot, echtgenote', 'époux, épouse'], ['man', 'mari'], ['vrouw, huisvrouw, huysvrouw', 'épouse'],
                ['jongman, j.m.', 'jeune homme, jamais marié'], ['jongedochter, j.d.', 'jeune fille, jamais mariée'], ['weduwnaar', 'veuf'], ['weduwe, wed.', 'veuve (wed. : veuf ou veuve)'],
                ['bruid', 'mariée'], ['bruidegom', 'marié'], ['geboden', 'les bans (annonces du mariage)'],
            ]),
            ...R('mot', 'sepulture', [
                ['overleden', 'décédé'], ['gestorven', 'mort'], ['begraven', 'enterré'], ['begraafboek', 'registre des enterrements'], ['lijk', 'corps (du défunt)'], ['kerkhof', 'cimetière'],
                ['oud', 'âgé de', '« oud zestig jaren » = âgé de soixante ans'], ['levenloos', 'sans vie (enfant mort-né)'], ['nalatende', 'laissant (une veuve, des enfants)'],
            ]),
            ...R('mot', 'general', [
                ['ten huize van', 'au domicile de'], ['wonende te', 'demeurant à'], ['geboortig van, geboren te', 'originaire de, né à'], ['heden', 'aujourd’hui'], ['zoon van, z.v.', 'fils de'], ['dochter van, d.v.', 'fille de'],
                ['Ambtenaar van den Burgerlijken Stand', 'officier de l’état civil'], ['verschenen', 'a (ont) comparu'], ['compareerde', 'comparut'], ['gemeente', 'commune'], ['parochie', 'paroisse'], ['dorp', 'village'],
                ['predikant', 'pasteur (protestant)'], ['pastoor', 'curé (catholique)'], ['Hervormd, Gereformeerd', 'réformé (protestant)'], ['Rooms-Katholiek, R.K.', 'catholique'],
                ['schepen', 'échevin'], ['schout', 'bailli, officier du seigneur (tenait aussi des actes)'], ['getuige', 'témoin'], ['en', 'et'], ['van', 'de'],
            ]),
            ...R('parente', 'general', [
                ['vader', 'père'], ['moeder', 'mère'], ['ouders', 'parents (le père et la mère)'], ['zoon', 'fils'], ['dochter', 'fille'], ['broer, broeder', 'frère'], ['zuster, zus', 'sœur'],
                ['grootvader', 'grand-père'], ['grootmoeder', 'grand-mère'], ['kleinzoon, kleindochter', 'petit-fils, petite-fille'], ['oom', 'oncle'], ['tante, moei', 'tante (moei : ancien)'],
                ['neef', 'cousin, ou neveu (le même mot)'], ['nicht', 'cousine, ou nièce (le même mot)'], ['schoonvader, schoonmoeder', 'beau-père, belle-mère (parents du conjoint)'],
                ['schoonzoon', 'gendre'], ['schoondochter', 'belle-fille (épouse du fils)'], ['zwager', 'beau-frère'], ['schoonzuster', 'belle-sœur'], ['stiefvader, stiefmoeder', 'beau-père, belle-mère (par remariage)'],
            ]),
            ...R('mois', 'general', [
                ['januari, januarij, louwmaand', 'janvier (louwmaand : ancien nom)'], ['februari, februarij, sprokkelmaand', 'février (sprokkelmaand : ancien nom)'], ['maart, lentemaand', 'mars (lentemaand : ancien nom)'],
                ['april, grasmaand', 'avril (grasmaand : ancien nom)'], ['mei, meij, bloeimaand', 'mai (bloeimaand : ancien nom)'], ['juni, junij, zomermaand', 'juin (zomermaand : ancien nom)'],
                ['juli, julij, hooimaand', 'juillet (hooimaand : ancien nom)'], ['augustus, oogstmaand', 'août (oogstmaand : ancien nom)'], ['september, herfstmaand, 7ber', 'septembre (herfstmaand : ancien nom)'],
                ['oktober, october, wijnmaand, 8ber', 'octobre (wijnmaand : ancien nom)'], ['november, slachtmaand, 9ber', 'novembre (slachtmaand : ancien nom)'], ['december, wintermaand, Xber', 'décembre (wintermaand : ancien nom)'],
                ['maand', 'mois'], ['dag', 'jour'],
            ]),
            ...R('nombre', 'general', [
                ['een', 'un, une (aussi l’article « un »)'], ['twee', 'deux'], ['drie', 'trois'], ['vier', 'quatre'], ['vijf', 'cinq'], ['zes', 'six'], ['zeven', 'sept'], ['acht', 'huit'], ['negen', 'neuf'], ['tien', 'dix'],
                ['elf', 'onze'], ['twaalf', 'douze'], ['twintig', 'vingt'], ['dertig', 'trente'], ['veertig', 'quarante'], ['vijftig', 'cinquante'], ['zestig', 'soixante'], ['zeventig', 'soixante-dix'],
                ['tachtig', 'quatre-vingts'], ['negentig', 'quatre-vingt-dix'], ['honderd', 'cent'], ['duizend', 'mille'], ['achttien honderd, achttienhonderd', 'mil huit cent (1800)'],
                ['eenentwintig', 'vingt et un (on dit « un et vingt »)'], ['eersten, tweeden, derden', 'le premier, le deuxième, le troisième (jour)'], ['jaren, jaar', 'ans, an'], ['maanden', 'mois'], ['dagen', 'jours'],
            ]),
            ...R('metier', 'general', [
                ['landbouwer', 'cultivateur'], ['bouwman', 'fermier, laboureur'], ['boer', 'paysan'], ['arbeider', 'ouvrier'], ['dagloner, daglooner', 'journalier'], ['knecht', 'valet'], ['dienstmeid, meid', 'servante'],
                ['molenaar', 'meunier'], ['bakker', 'boulanger'], ['smid', 'forgeron'], ['schoenmaker', 'cordonnier'], ['kleermaker', 'tailleur'], ['wever', 'tisserand'], ['timmerman', 'charpentier'],
                ['metselaar', 'maçon'], ['herbergier', 'aubergiste'], ['koopman', 'marchand'], ['schipper', 'batelier, patron de bateau'], ['visser', 'pêcheur'], ['zeeman, matroos', 'marin, matelot'], ['schoolmeester', 'maître d’école'],
            ]),
            ...R('formule', 'bapteme', [
                ['Op den … is gedoopt …, zoon van … en …, echtelieden', 'Le … a été baptisé …, fils de … et de …, époux'], ['getuigen …', 'témoins (parrains) : …'],
            ]),
            ...R('formule', 'mariage', [['zijn in ondertrouw opgenomen', 'ont été inscrits comme fiancés (avant le mariage)']]),
            ...R('formule', 'sepulture', [['is overleden …, oud … jaren', 'est décédé …, âgé de … ans']]),
            ...R('formule', 'general', [
                ['In het jaar … den … der maand …', 'En l’an …, le … du mois …'],
                ['zijn voor ons … Ambtenaar van den Burgerlijken Stand der gemeente … verschenen', 'ont comparu devant nous …, officier de l’état civil de la commune de …'],
                ['welke ons verklaard hebben dat …', 'lesquels nous ont déclaré que …'],
            ]),
        ],
        glyphs: {nl_ij: ['M11 26 L19 44', 'M28 26 L16 58', 'M15 18 L15 19', 'M25 18 L25 19']},
        letters: [
            {id: 'nl_ij', name: 'ij écrit ÿ', seen: ['nl_ij'], read: 'ij', cmp: ['y'], note: 'Le « ij » néerlandais s’écrit souvent comme un y avec deux points (ÿ) : « Pÿl » = Pijl, « Januarÿ » = Januarij. Ce n’est pas un y.', keys: 'ij ÿ y néerlandais flamand'},
        ],
        exercises: [
            {id: 'nl_doop1745', icon: '👶', title: 'Un doop (baptême) de 1745', level: 'facile', acte: 'bapteme', year: 1745,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « Junÿ » = Junij (juin) ; « Jansen » = fils de Jan.',
                src: 'Den 12 Junÿ=Junij|Juni 1745 is gedoopt Jan zoon van Pieter Jansen en Maria de Vries echtelieden getuigen Hendrik Jansen en Grietje Willems',
                notes: {'Junÿ': 'ÿ = ij : Junij, c’est-à-dire juin'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Dutch Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Dutch_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Netherlands Civil Registration', url: 'https://www.familysearch.org/en/wiki/Netherlands_Civil_Registration'},
        ],
    };
})());
