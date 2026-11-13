/* 📜 Aide à la lecture — Espagnol (registres paroissiaux d'Espagne et d'Amérique latine, état civil après 1870).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'es', name: 'Espagnol', native: 'Español', icon: '🇪🇸', script: 'latine', dir: 'ltr', ocr: ['spa'],
        intro: 'Registres d’Espagne, d’Amérique latine, des Philippines et d’Algérie (colons espagnols). Les baptêmes espagnols nomment souvent les quatre grands-parents (« abuelos paternos… maternos »).',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['bauticé', 'je baptisai (le curé parle)'], ['bautizado, bautizada', 'baptisé, baptisée'], ['bautismo', 'baptême'], ['nació, nacido, nacida', 'naquit, né, née'],
                ['legítimo, legítima', 'légitime'], ['hijo natural, hija natural', 'enfant naturel : né hors mariage (attention : « natural de » veut dire « né à »)'],
                ['de padres no conocidos', 'de parents inconnus'], ['expósito, expósita', 'enfant trouvé, abandonné'], ['padrino', 'parrain'], ['madrina', 'marraine'], ['padrinos', 'parrain et marraine'],
                ['parentesco espiritual', 'le lien spirituel entre les parrains et l’enfant, que le curé leur rappelle'], ['puse óleo y crisma', 'j’ai mis l’huile et le saint chrême (rites du baptême)'],
                ['le puse por nombre', 'je lui donnai le nom de'], ['párvulo, párvula', 'petit enfant'], ['comadrona, partera', 'sage-femme'], ['gemelos, mellizos', 'jumeaux'],
            ]),
            ...R('mot', 'mariage', [
                ['casé, desposé', 'je mariai (le curé parle)'], ['casados', 'mariés'], ['matrimonio', 'mariage'], ['contrajeron matrimonio', 'ils se marièrent'],
                ['velaciones, velados', 'bénédiction nuptiale (cérémonie des voiles), qui a reçu cette bénédiction'], ['amonestaciones, proclamas', 'les bans (annonces du mariage)'],
                ['por palabras de presente', 'par paroles de présent (échange des consentements)'], ['soltero, soltera', 'célibataire'], ['viudo', 'veuf'], ['viuda', 'veuve'],
                ['consorte, consortes', 'époux, épouse ; les époux'], ['cónyuges', 'les époux'], ['esposo, esposa', 'époux, épouse'], ['mujer, muger', 'épouse (« su legítima mujer » = sa femme légitime)'],
                ['marido', 'mari'], ['testigos', 'témoins'], ['dispensa', 'dispense'],
            ]),
            ...R('mot', 'sepulture', [
                ['difunto, difunta', 'défunt, défunte (« hijo de Juan, difunto » = fils de feu Jean)'], ['murió', 'mourut'], ['falleció, fallecido', 'décéda, décédé'],
                ['sepultura, se le dio sepultura', 'sépulture ; on lui donna la sépulture'], ['enterrado, entierro', 'enterré, enterrement'], ['cementerio, camposanto', 'cimetière'],
                ['recibió los Santos Sacramentos', 'il reçut les saints sacrements'], ['no testó', 'il n’a pas fait de testament'], ['testó ante', 'il a fait son testament devant (un notaire)'],
                ['de edad de … años', 'âgé de … ans'],
            ]),
            ...R('mot', 'general', [
                ['cura', 'curé'], ['párroco', 'curé de la paroisse'], ['teniente de cura', 'vicaire (aide du curé)'], ['presbítero', 'prêtre'], ['iglesia parroquial', 'église paroissiale'],
                ['feligrés, feligresa', 'paroissien, paroissienne'], ['vecino de', 'habitant de, domicilié à'], ['natural de', 'né à, originaire de'], ['villa', 'bourg, petite ville'],
                ['lugar', 'village'], ['ciudad', 'ville'], ['parroquia', 'paroisse'], ['obispado', 'diocèse (évêché)'], ['certifico', 'je certifie'], ['Don, Doña', 'titre de respect (monsieur, madame)'],
                ['registro civil', 'état civil (à partir de 1870-1871)'], ['juez municipal', 'juge municipal (tenait l’état civil)'],
            ]),
            ...R('abrev', 'general', [
                ['dho, dha, dhos', 'dicho, dicha, dichos : ledit, ladite, lesdits'], ['D., Dn', 'Don'], ['Da, Dª', 'Doña'], ['Xptoval, Xpoval', 'Cristóbal (Christophe)'],
                ['Franco, Franca', 'Francisco, Francisca'], ['Ma, Mª', 'María'], ['ntro, ntra', 'nuestro, nuestra : notre'], ['q.', 'que'],
            ]),
            ...R('parente', 'general', [
                ['padre', 'père'], ['madre', 'mère'], ['padres', 'parents (le père et la mère)'], ['hijo', 'fils'], ['hija', 'fille'], ['hijos', 'enfants'],
                ['abuelo, abuela', 'grand-père, grand-mère'], ['abuelos paternos', 'grands-parents du côté du père'], ['abuelos maternos', 'grands-parents du côté de la mère'],
                ['nieto, nieta', 'petit-fils, petite-fille'], ['hermano, hermana', 'frère, sœur'], ['tío, tía', 'oncle, tante'], ['primo, prima', 'cousin, cousine'], ['sobrino, sobrina', 'neveu, nièce'],
                ['suegro, suegra', 'beau-père, belle-mère (parents du conjoint)'], ['yerno', 'gendre'], ['nuera', 'belle-fille (épouse du fils)'], ['cuñado, cuñada', 'beau-frère, belle-sœur'],
                ['padrastro', 'beau-père (second mari de la mère)'], ['madrastra', 'belle-mère (seconde femme du père)'],
            ]),
            ...R('mois', 'general', [
                ['enero, henero', 'janvier (henero : ancienne orthographe)'], ['febrero', 'février'], ['marzo', 'mars'], ['abril', 'avril'], ['mayo', 'mai'], ['junio', 'juin'], ['julio', 'juillet'], ['agosto', 'août'],
                ['septiembre, setiembre, 7bre', 'septembre'], ['octubre, 8bre', 'octobre'], ['noviembre, 9bre', 'novembre'], ['diciembre, Xbre, 10bre', 'décembre'], ['mes', 'mois'], ['día, días', 'jour, jours'],
            ]),
            ...R('nombre', 'general', [
                ['uno, una', 'un, une'], ['dos', 'deux'], ['tres', 'trois'], ['cuatro', 'quatre'], ['cinco', 'cinq'], ['seis', 'six'], ['siete', 'sept'], ['ocho', 'huit'], ['nueve', 'neuf'], ['diez', 'dix'],
                ['once', 'onze'], ['doce', 'douze'], ['diez y seis, dieciséis', 'seize (on écrivait « dix et six »)'], ['veinte', 'vingt'], ['treinta', 'trente'], ['cuarenta', 'quarante'], ['cincuenta', 'cinquante'],
                ['sesenta', 'soixante'], ['setenta', 'soixante-dix'], ['ochenta', 'quatre-vingts'], ['noventa', 'quatre-vingt-dix'], ['ciento, cien', 'cent'], ['mil', 'mille'],
                ['setecientos', 'sept cents (« mil setecientos » = 1700)'], ['ochocientos', 'huit cents (« mil ochocientos » = 1800)'], ['años', 'ans, années'], ['meses', 'mois'],
            ]),
            ...R('metier', 'general', [
                ['labrador', 'cultivateur, laboureur'], ['jornalero', 'journalier'], ['pastor', 'berger'], ['molinero', 'meunier'], ['herrero', 'forgeron'], ['zapatero', 'cordonnier'], ['sastre', 'tailleur'],
                ['tejedor', 'tisserand'], ['carpintero', 'charpentier, menuisier'], ['albañil', 'maçon'], ['arriero', 'muletier (transporte avec des mules)'], ['mercader, comerciante', 'marchand, commerçant'],
                ['criado, criada', 'domestique'], ['hidalgo', 'noble (petite noblesse)'], ['escribano', 'notaire, greffier'], ['pescador', 'pêcheur'], ['marinero', 'marin'],
            ]),
            ...R('formule', 'bapteme', [
                ['En la villa de … a … días del mes de … de mil … años', 'Dans le bourg de …, le … du mois de …, l’an mil …'],
                ['yo el cura … bauticé solemnemente a …', 'moi, le curé …, je baptisai solennellement …'],
                ['hijo legítimo de … y de … su legítima mujer', 'fils légitime de … et de … sa femme légitime'],
                ['fueron sus padrinos … a quienes advertí el parentesco espiritual', 'ses parrains furent …, à qui j’ai rappelé le lien spirituel (avec l’enfant)'],
            ]),
            ...R('formule', 'mariage', [
                ['habiendo precedido las tres amonestaciones que dispone el Santo Concilio de Trento', 'après les trois bans que demande le saint concile de Trente'],
            ]),
            ...R('formule', 'sepulture', [
                ['di sepultura eclesiástica al cuerpo de …', 'j’ai donné la sépulture chrétienne au corps de …'],
            ]),
            ...R('formule', 'general', [['en fe de lo cual lo firmo', 'en foi de quoi je signe']]),
        ],
        glyphs: {}, letters: [],
        exercises: [
            {id: 'es_baut1790', icon: '👶', title: 'Un bautismo (baptême) de 1790', level: 'moyen', acte: 'bapteme', year: 1790,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple, village imaginaire). « dha » = dicha (ladite), « muger » = mujer (épouse).',
                src: 'En la villa de Villanueva a diez y seis dias del mes de Agosto de mil setecientos noventa años yo el cura bauticé ſolemnemente=solemnemente a Josefa hija legitima de Juan Garcia labrador y de Maria Lopez ſu=su legitima muger=muger|mujer fueron ſus=sus padrinos Pedro Garcia y Ana Ruiz vecinos de dha=dicha villa a quienes adverti el parentesco espiritual',
                notes: {dha: 'dha = dicha : ladite', muger: 'muger = mujer : épouse (ancienne orthographe)', 'ſu': 'ſ (s long) = s'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Spanish Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Spanish_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Spanish Handwriting / Abbreviations', url: 'https://www.familysearch.org/en/wiki/Spanish_Handwriting'},
        ],
    };
})());
