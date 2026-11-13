/* 📜 Aide à la lecture — Tchèque (matriky de Bohême, Moravie et Silésie, souvent mêlées d'allemand et de latin).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'cs', name: 'Tchèque', native: 'Čeština', icon: '🇨🇿', script: 'latine', dir: 'ltr', ocr: ['ces'],
        intro: 'Registres paroissiaux (matriky) de Bohême, de Moravie et de Silésie autrichienne. Jusqu’en 1784 souvent en latin ; ensuite des registres à colonnes imprimées, en allemand, en latin ou en tchèque selon la paroisse et l’époque (le tchèque devient courant après 1860). Les trois langues se mélangent souvent dans la même page : passe aussi par les onglets Latin et Allemand. Les maisons sont numérotées (č. p.).',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['narozen, narozený, narozená, nar.', 'né, née'], ['narodil se, narodila se', 'est né, est née'],
                ['pokřtěn, pokřtěný, pokřtěna', 'baptisé, baptisée'], ['křest, křtu', 'baptême'], ['křtitel', 'celui qui baptise (le prêtre)'],
                ['kmotr', 'parrain'], ['kmotra, kmotřička', 'marraine'], ['kmotři', 'parrain et marraine'],
                ['manželský, manž.', 'légitime (enfant de parents mariés)'], ['nemanželský, nemanž.', 'illégitime, né hors mariage'],
                ['porodní bába, babička', 'sage-femme (« babička » veut dire aussi grand-mère)'], ['dvojčata', 'jumeaux'], ['mrtvě narozený', 'mort-né'],
                ['nouzově pokřtěn', 'baptisé d’urgence (ondoyé)'], ['dítě', 'enfant'], ['chlapec, hoch', 'garçon'], ['děvče', 'fille (enfant)'],
                ['pohlaví', 'sexe (colonne)'], ['mužské, ženské', 'masculin, féminin'],
            ]),
            ...R('mot', 'mariage', [
                ['oddán, oddána, oddaní', 'marié, mariée, mariés (à l’église)'], ['oddavky', 'mariage (la cérémonie)'], ['sňatek', 'mariage'],
                ['ženich', 'le marié'], ['nevěsta', 'la mariée (aussi : belle-fille)'], ['svědek, svědci', 'témoin, témoins'],
                ['ohlášky', 'les bans (annonces du mariage)'], ['svobodný, svobodná', 'célibataire (jamais marié)'], ['vdovec', 'veuf'], ['vdova', 'veuve'],
                ['manžel', 'mari'], ['manželka', 'épouse'], ['manželé', 'les époux'], ['dispens', 'dispense (de l’Église)'], ['zletilý, nezletilý', 'majeur, mineur'],
            ]),
            ...R('mot', 'sepulture', [
                ['zemřel, zemřela', 'est mort, est morte'], ['úmrtí', 'décès'], ['smrt', 'la mort'], ['pohřben, pohřbena', 'enterré, enterrée'], ['pohřeb', 'enterrement'],
                ['hřbitov', 'cimetière'], ['nemoc, příčina smrti', 'maladie, cause de la mort'], ['stáří, sešlost věkem', 'vieillesse'],
                ['souchotiny', 'tuberculose (consomption)'], ['neštovice', 'variole'], ['zápal plic', 'pneumonie'], ['psotník', 'convulsions (mort des nourrissons)'],
                ['vodnatelnost', 'hydropisie'], ['mrtvice', 'attaque, apoplexie'], ['zaopatřen', 'a reçu les derniers sacrements'], ['nebožtík, zesnulý', 'le défunt'], ['věk', 'âge'],
            ]),
            ...R('mot', 'general', [
                ['matrika', 'registre paroissial'], ['fara, farnost', 'cure, paroisse'], ['farář', 'curé'], ['kaplan', 'vicaire'],
                ['obec', 'commune'], ['ves, vesnice', 'village'], ['město', 'ville'], ['číslo domu, č. p., čp.', 'numéro de la maison (číslo popisné)'],
                ['bydliště', 'domicile'], ['náboženství', 'religion (colonne)'], ['katolické, kat.', 'catholique'], ['evangelické, ev.', 'protestant'], ['židovské', 'juif'],
                ['a', 'et'], ['v, ve', 'à, dans'], ['z, ze', 'de (« z Lhoty » = de Lhota)'], ['dne', 'le (devant une date : « dne 5. března »)'], ['roku, r.', 'en l’an'],
                ['dtto, detto', 'idem : comme au-dessus'],
            ]),
            ...R('parente', 'general', [
                ['otec', 'père'], ['matka', 'mère'], ['rodiče', 'parents'], ['syn', 'fils'], ['dcera, dcery', 'fille, de la fille'], ['bratr', 'frère'], ['sestra', 'sœur'],
                ['děd, dědeček', 'grand-père'], ['bába, babička', 'grand-mère'], ['vnuk', 'petit-fils'], ['vnučka', 'petite-fille'],
                ['strýc', 'oncle'], ['teta', 'tante'], ['synovec', 'neveu'], ['neteř', 'nièce'], ['bratranec', 'cousin'], ['sestřenice', 'cousine'],
                ['tchán', 'beau-père (père du conjoint)'], ['tchyně', 'belle-mère (mère du conjoint)'], ['zeť', 'gendre'], ['snacha', 'belle-fille (épouse du fils)'],
                ['švagr', 'beau-frère'], ['švagrová', 'belle-sœur'], ['otčím', 'beau-père (second mari de la mère)'], ['macecha', 'belle-mère (seconde femme du père)'],
                ['sirotek', 'orphelin'], ['poručník', 'tuteur'],
                ['-ová', 'nom de femme : Nováková = femme ou fille de Novák ; « rozená, roz. » = née (nom de jeune fille)'],
            ]),
            ...R('mois', 'general', [
                ['leden, ledna', 'janvier (« ledna » : « 5. ledna » = le 5 janvier)'], ['únor, února', 'février'], ['březen, března', 'mars'], ['duben, dubna', 'avril'],
                ['květen, května', 'mai'], ['červen, června', 'juin'], ['červenec, července', 'juillet'], ['srpen, srpna', 'août'], ['září', 'septembre'],
                ['říjen, října', 'octobre'], ['listopad, listopadu', 'novembre (attention : en croate, listopad = octobre)'], ['prosinec, prosince', 'décembre'],
                ['měsíc', 'mois'], ['týden', 'semaine'], ['den', 'jour'], ['neděle', 'dimanche'],
            ]),
            ...R('nombre', 'general', [
                ['jeden, jedna', 'un, une'], ['dva, dvě', 'deux'], ['tři', 'trois'], ['čtyři', 'quatre'], ['pět', 'cinq'], ['šest', 'six'], ['sedm', 'sept'], ['osm', 'huit'], ['devět', 'neuf'], ['deset', 'dix'],
                ['jedenáct', 'onze'], ['dvanáct', 'douze'], ['dvacet', 'vingt'], ['třicet', 'trente'], ['čtyřicet', 'quarante'], ['padesát', 'cinquante'], ['šedesát', 'soixante'],
                ['sedmdesát', 'soixante-dix'], ['osmdesát', 'quatre-vingts'], ['devadesát', 'quatre-vingt-dix'], ['sto', 'cent'], ['tisíc', 'mille'],
                ['první, druhý, třetí', 'premier, deuxième, troisième'], ['let, roků', 'ans', '« 64 let » = 64 ans'], ['měsíců, týdnů, dní', 'mois, semaines, jours (âge d’un enfant)'],
            ]),
            ...R('metier', 'general', [
                ['sedlák', 'paysan aisé, propriétaire d’une grande ferme'], ['rolník', 'cultivateur'], ['chalupník', 'petit paysan (une chaumière et un peu de terre)'],
                ['domkář', 'petit propriétaire d’une maisonnette, presque sans terre'], ['podruh, podruhyně', 'logé chez un autre, journalier sans maison'], ['nádeník', 'journalier'],
                ['čeledín', 'valet de ferme'], ['děvečka, služka', 'servante'], ['mlynář', 'meunier'], ['kovář', 'forgeron'], ['krejčí', 'tailleur'], ['švec, obuvník', 'cordonnier'],
                ['tkadlec', 'tisserand'], ['tesař', 'charpentier'], ['truhlář', 'menuisier'], ['zedník', 'maçon'], ['kolář', 'charron'], ['bednář', 'tonnelier'],
                ['řezník', 'boucher'], ['pekař', 'boulanger'], ['sládek', 'brasseur (maître de la brasserie)'], ['hostinský', 'aubergiste'], ['myslivec', 'garde-chasse'],
                ['pastýř', 'berger'], ['učitel', 'instituteur'], ['výměnkář', 'paysan retiré qui vit de la pension (výměnek) laissée par la ferme cédée'],
            ]),
            ...R('abrev', 'general', [
                ['w, g, j, au (avant 1849)', 'ancienne orthographe : w = v, g = j, j = í, au = ou (« Wáclaw » = Václav, « Gan » = Jan, « Daubrawa » = Doubrava)'],
                ['ſſ, cž, rž', 'ancienne orthographe : ſſ = š, cž = č, rž = ř'],
                ['č. p., čp., č.', 'číslo popisné : numéro de la maison'], ['nar.', 'narozen : né'], ['roz.', 'rozená : née (nom de jeune fille)'], ['zem.', 'zemřel : mort'],
                ['kat., ev.', 'catholique, protestant'], ['manž., nemanž.', 'légitime, illégitime'], ['r.', 'roku : en l’an'],
            ]),
            ...R('formule', 'bapteme', [
                ['narodil se a pokřtěn byl', 'est né et a été baptisé'], ['syn manželský …', 'fils légitime de …'], ['dcera … a matky …', 'fille de … et de la mère …'],
            ]),
            ...R('formule', 'mariage', [
                ['po trojích ohláškách', 'après trois publications des bans'], ['byli oddáni', 'ont été mariés'],
            ]),
            ...R('formule', 'sepulture', [
                ['zemřel a byl pohřben', 'est mort et a été enterré'], ['ve stáří … let', 'à l’âge de … ans'],
            ]),
        ],
        glyphs: {
            cs_hacek: ['M27 32 C22 27 14 30 14 37 C14 44 22 47 27 42', 'M14 16 L20 22 L26 16'],
            cs_w: ['M7 26 L12 46 L18 30 L24 46 L29 26'],
        },
        widths: {},
        letters: [
            {id: 'cs_hacek', name: 'le háček (č, ř, š, ž, ě)', seen: ['cs_hacek'], read: 'č', cmp: ['c'], note: 'Le petit « v » au-dessus de la lettre est souvent réduit à un point ou un trait, ou oublié. La recherche n’en tient pas compte : tape « brezna » pour « března ».', keys: 'hacek c r s z accent'},
            {id: 'cs_w', name: 'w = v, g = j (orthographe d’avant 1849)', seen: ['cs_w'], read: 'v', cmp: [], note: 'Avant le milieu du XIXe siècle : w se lit v, g se lit j, j se lit í, au se lit ou, ſſ se lit š, cž se lit č. « Wáclaw » = Václav, « Gan » = Jan, « Pjsek » = Písek.', keys: 'ancienne orthographe w v g j au ou bratrska'},
        ],
        exercises: [
            {id: 'cs_krest1850', icon: '👶', title: 'Un baptême de 1850 (Bohême)', level: 'facile', acte: 'bapteme', year: 1850,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Les mois sont au génitif (« března » = de mars) ; « č. » = numéro de maison. Tu peux taper sans accents.',
                src: 'Dne 5. března=března|brezna 1850 narodil se a dne 6. března=března|brezna pokřtěn byl Jan syn manželský Josefa Nováka chalupníka v Lhotě č.=číslo|č. 12 a Marie dcery Václava Dvořáka sedláka z Bukové Kmotr Jan Svoboda mlynář',
                notes: {'března': 'března = de mars (génitif de březen)', 'č.': 'č. = číslo : numéro de la maison', 'chalupníka': 'chalupník = petit paysan'}},
            {id: 'cs_umrti1878', icon: '⚱️', title: 'Un décès de 1878 (Moravie)', level: 'moyen', acte: 'sepulture', year: 1878,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « -ová » = la femme de ; « roz. » = née.',
                src: 'Dne 2. listopadu 1878 zemřela Anna Nováková roz.=rozená Dvořáková vdova po Josefu Novákovi chalupníkovi z Lhoty č.=číslo|č. 12 ve stáří 72 let na sešlost věkem pohřbena dne 4. listopadu',
                notes: {'listopadu': 'listopad = novembre en tchèque', 'roz.': 'roz. = rozená : née', 'vdova': 'vdova po … = veuve de …'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Czech Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Czech_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Czech Republic Church Records', url: 'https://www.familysearch.org/en/wiki/Czech_Republic_Church_Records'},
            {label: 'Archives régionales de Bohême et de Moravie — matriky en ligne (par ex. SOA Praha eBadatelna, MZA Brno Acta publica)', url: 'https://www.familysearch.org/en/wiki/Czech_Republic_Online_Genealogy_Records'},
        ],
    };
})());
