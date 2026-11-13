/* 📜 Aide à la lecture — Hongrois (anyakönyvek : registres paroissiaux, état civil d'État à partir du 1er octobre 1895).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'hu', name: 'Hongrois', native: 'Magyar', icon: '🇭🇺', script: 'latine', dir: 'ltr', ocr: ['hun'],
        intro: 'Royaume de Hongrie (Hongrie, Slovaquie, Transylvanie, Voïvodine, Burgenland…). Registres paroissiaux en latin jusque vers 1840-1850, puis en hongrois ; état civil d’État en hongrois à partir du 1er octobre 1895. Attention : le nom de famille vient AVANT le prénom (« Kovács János » = Jean Kovács), et la date s’écrit année, mois, jour (« 1871. március 3. »). Beaucoup de registres sont en ligne sur Hungaricana et FamilySearch.',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['született, szül.', 'né, née (et « née » devant le nom de jeune fille)'], ['születés', 'naissance'], ['keresztelt, megkeresztelt', 'baptisé'], ['keresztelés', 'baptême'],
                ['keresztapa', 'parrain'], ['keresztanya', 'marraine'], ['keresztszülők', 'parrain et marraine'], ['keresztelő pap', 'le prêtre qui baptise'],
                ['törvényes, törv.', 'légitime'], ['törvénytelen', 'illégitime, né hors mariage'], ['bába', 'sage-femme'], ['ikrek', 'jumeaux'], ['halva született', 'mort-né'],
                ['gyermek', 'enfant'], ['fiú', 'garçon, fils'], ['leány, lány', 'fille'], ['neme', 'sexe (colonne)'], ['vallása', 'sa religion (colonne)'],
            ]),
            ...R('mot', 'mariage', [
                ['házasság', 'mariage'], ['házasult, házasultak', 'marié, mariés'], ['esküvő', 'noces, cérémonie du mariage'], ['vőlegény', 'le fiancé, le marié'], ['menyasszony', 'la fiancée, la mariée'],
                ['tanú, tanúk', 'témoin, témoins'], ['hirdetés, kihirdetés', 'les bans (annonces)'], ['nőtlen', 'célibataire (homme)'], ['hajadon', 'célibataire (femme, jeune fille)'],
                ['özvegy, özv.', 'veuf ou veuve'], ['férj', 'mari'], ['feleség, neje', 'épouse ; « neje » = sa femme'], ['házastárs', 'conjoint'], ['felmentés', 'dispense'],
            ]),
            ...R('mot', 'sepulture', [
                ['meghalt, elhunyt', 'mort, décédé'], ['halálozás, elhalálozás', 'décès'], ['halál', 'la mort'], ['halálának oka, halál oka', 'cause de sa mort'],
                ['eltemetett, temetés', 'enterré ; enterrement'], ['temető', 'cimetière'], ['végelgyengülés', 'mort de vieillesse (épuisement de l’âge)'], ['tüdővész, tüdősorvadás', 'tuberculose'],
                ['himlő', 'variole'], ['kanyaró', 'rougeole'], ['gutaütés', 'attaque, apoplexie'], ['gyengeség', 'faiblesse (nourrissons)'], ['néhai', 'feu, défunt'], ['életkora', 'son âge'],
            ]),
            ...R('mot', 'general', [
                ['anyakönyv', 'registre (des naissances, mariages, décès)'], ['plébánia', 'paroisse catholique'], ['egyház, egyházközség', 'église, paroisse'], ['lelkész', 'pasteur, prêtre'], ['plébános', 'curé'],
                ['község', 'commune'], ['falu', 'village'], ['város', 'ville'], ['vármegye, megye', 'comitat (département)'], ['házszám', 'numéro de la maison'], ['lakhely, lakik', 'domicile ; habite'],
                ['római katolikus, r. k.', 'catholique romain'], ['református, ref.', 'réformé (calviniste)'], ['evangélikus, ev.', 'luthérien'], ['görög katolikus, g. k.', 'gréco-catholique'], ['izraelita, izr.', 'juif'],
                ['és', 'et'], ['évi', 'de l’année (« 1896. évi » = de l’an 1896)'], ['hó, hava', 'mois (« március hó » = mois de mars)'], ['napján', 'le jour (« 5. napján » = le 5)'], ['kelt', 'fait, daté (fin d’un acte)'],
            ]),
            ...R('parente', 'general', [
                ['apa, atya', 'père'], ['anya', 'mère'], ['szülők', 'parents'], ['fia', 'son fils'], ['leánya', 'sa fille'], ['fivér, testvér', 'frère ; frère ou sœur'],
                ['bátya', 'frère aîné'], ['öcs', 'frère cadet'], ['nővér', 'sœur aînée'], ['húg', 'sœur cadette'], ['nagyapa', 'grand-père'], ['nagyanya', 'grand-mère'], ['unoka', 'petit-enfant'],
                ['nagybácsi', 'oncle'], ['nagynéni', 'tante'], ['unokatestvér', 'cousin, cousine'], ['após', 'beau-père (père du conjoint)'], ['anyós', 'belle-mère'], ['vő', 'gendre'], ['meny', 'belle-fille'],
                ['sógor', 'beau-frère'], ['sógornő', 'belle-sœur'], ['mostohaapa, mostohaanya', 'beau-père, belle-mère (second mari, seconde femme)'], ['árva', 'orphelin'], ['gyám', 'tuteur'],
                ['-né', 'épouse de : « Kovács Jánosné » = Madame Jean Kovács ; son nom à elle suit souvent après « szül. » (née)'],
            ]),
            ...R('mois', 'general', [
                ['január, jan.', 'janvier'], ['február, febr.', 'février'], ['március, márc.', 'mars'], ['április, ápr.', 'avril'], ['május, máj.', 'mai'], ['június, jún.', 'juin'],
                ['július, júl.', 'juillet'], ['augusztus, aug.', 'août'], ['szeptember, szept.', 'septembre'], ['október, okt.', 'octobre'], ['november, nov.', 'novembre'], ['december, dec.', 'décembre'],
                ['Boldogasszony hava', 'janvier (ancien nom hongrois)'], ['Böjtelő hava', 'février (ancien nom)'], ['Böjtmás hava', 'mars (ancien nom)'], ['Szent György hava', 'avril (ancien nom)'],
                ['Pünkösd hava', 'mai (ancien nom)'], ['Szent Iván hava', 'juin (ancien nom)'], ['Szent Jakab hava', 'juillet (ancien nom)'], ['Kisasszony hava', 'août (ancien nom)'],
                ['Szent Mihály hava', 'septembre (ancien nom)'], ['Mindszent hava', 'octobre (ancien nom)'], ['Szent András hava', 'novembre (ancien nom)'], ['Karácsony hava', 'décembre (ancien nom)'],
                ['hónap', 'mois'], ['hét', 'semaine (aussi : sept)'], ['nap', 'jour'], ['vasárnap', 'dimanche'],
            ]),
            ...R('nombre', 'general', [
                ['egy', 'un'], ['kettő, két', 'deux'], ['három', 'trois'], ['négy', 'quatre'], ['öt', 'cinq'], ['hat', 'six'], ['hét', 'sept'], ['nyolc', 'huit'], ['kilenc', 'neuf'], ['tíz', 'dix'],
                ['tizenegy', 'onze'], ['húsz', 'vingt'], ['huszonegy', 'vingt et un'], ['harminc', 'trente'], ['negyven', 'quarante'], ['ötven', 'cinquante'], ['hatvan', 'soixante'],
                ['hetven', 'soixante-dix'], ['nyolcvan', 'quatre-vingts'], ['kilencven', 'quatre-vingt-dix'], ['száz', 'cent'], ['ezer', 'mille'], ['ezernyolcszáz', 'mil huit cent (1800)'],
                ['éves', 'âgé de … ans', '« 64 éves » = âgé de 64 ans'], ['év, hónapos, napos, hetes', 'an ; âgé de … mois, … jours, … semaines'],
            ]),
            ...R('metier', 'general', [
                ['földműves', 'cultivateur'], ['gazda', 'fermier, maître de la ferme'], ['jobbágy', 'serf, tenancier (avant 1848)'], ['zsellér', 'petit paysan sans terre ou presque (cottier)'],
                ['napszámos', 'journalier'], ['cseléd', 'domestique'], ['szolga', 'valet'], ['kovács', 'forgeron'], ['molnár', 'meunier'], ['szabó', 'tailleur'], ['varga, csizmadia', 'cordonnier, bottier'],
                ['takács', 'tisserand'], ['ács', 'charpentier'], ['asztalos', 'menuisier'], ['kőműves', 'maçon'], ['mészáros', 'boucher'], ['pék', 'boulanger'], ['kocsmáros', 'aubergiste'],
                ['juhász', 'berger (moutons)'], ['pásztor', 'pâtre'], ['gulyás', 'bouvier'], ['tanító', 'instituteur'], ['kántor', 'chantre'], ['nemes', 'noble'],
                ['(métiers devenus noms)', 'beaucoup de noms de famille sont des métiers : Kovács (forgeron), Szabó (tailleur), Molnár (meunier), Takács (tisserand), Juhász (berger)'],
            ]),
            ...R('abrev', 'general', [
                ['szül.', 'született : né, née'], ['özv.', 'özvegy : veuf, veuve'], ['r. k., ref., ev., g. k., izr.', 'catholique, réformé, luthérien, gréco-catholique, juif'], ['sz.', 'szám : numéro'],
                ['ifj., id.', 'ifjabb, idősebb : le jeune, l’aîné (« ifj. Kovács János » = Jean Kovács fils)'],
            ]),
            ...R('formule', 'bapteme', [
                ['… és neje …', '… et sa femme …'], ['törvényes fia, törvényes leánya', 'son fils légitime, sa fille légitime'],
            ]),
            ...R('formule', 'general', [
                ['… évi … hó … napján', 'l’an …, le … du mois de … (« 1896. évi március hó 5. napján » = le 5 mars 1896)'],
                ['Előttem, az alulírott anyakönyvvezető előtt megjelent …', 'Devant moi, officier de l’état civil soussigné, a comparu … (actes d’État après 1895)'],
                ['Felolvasás után helybenhagyatott és aláíratott', 'lu, approuvé et signé (fin d’un acte d’État)'],
            ]),
            ...R('formule', 'sepulture', [
                ['… éves korában', 'à l’âge de … ans'],
            ]),
        ],
        glyphs: {
            hu_odbl: ['M19 30 C11 30 11 46 19 46 C27 46 27 30 19 30', 'M15 24 L18 16', 'M22 24 L25 16'],
        },
        widths: {},
        letters: [
            {id: 'hu_odbl', name: 'ő et ű (deux accents)', seen: ['hu_odbl'], read: 'ő', cmp: [], note: 'Le double accent (ő, ű) est souvent écrit comme deux points (ö, ü) ou un seul trait. La recherche n’en tient pas compte : « fold » pour « föld ».', keys: 'double accent o u trema'},
        ],
        exercises: [
            {id: 'hu_szul1871', icon: '👶', title: 'Une naissance de 1871', level: 'facile', acte: 'bapteme', year: 1871,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Lis à l’envers : le nom de famille d’abord. Tu peux taper sans accents.',
                src: 'Kovács János földműves és neje Szabó Mária törvényes fia József született 1871. március 3. keresztelt március 5. keresztszülők Nagy István és neje Tóth Erzsébet',
                notes: {neje: 'neje = sa femme', 'törvényes': 'törvényes = légitime', 'keresztszülők': 'parrain et marraine'}},
            {id: 'hu_hal1896', icon: '⚱️', title: 'Un décès de 1896 (état civil)', level: 'moyen', acte: 'sepulture', year: 1896,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « Kovács Jánosné » = Madame Jean Kovács ; « szül. » = née.',
                src: '1896. évi március hó 7. napján elhunyt Kovács Jánosné szül.=született Nagy Mária 64 éves halálának oka végelgyengülés',
                notes: {'Jánosné': '-né : la femme de (János)', 'szül.': 'szül. = született : née', 'végelgyengülés': 'mort de vieillesse'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Hungarian Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Hungarian_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Hungary Civil Registration (à partir de 1895)', url: 'https://www.familysearch.org/en/wiki/Hungary_Civil_Registration'},
            {label: 'Hungaricana — bibliothèque et archives hongroises en ligne', url: 'https://hungaricana.hu/'},
        ],
    };
})());
