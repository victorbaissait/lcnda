/* 📜 Aide à la lecture — Suédois (registres paroissiaux luthériens de Suède et de Finlande suédophone : födde, vigde, döde, husförhörslängder).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'sv', name: 'Suédois', native: 'Svenska', icon: '🇸🇪', script: 'latine', dir: 'ltr', ocr: ['swe'],
        intro: 'Registres de l’Église luthérienne de Suède (et de Finlande pour les paroisses de langue suédoise), tenus depuis la fin du XVIIe siècle : naissances et baptêmes (födde och döpte), mariages (vigde), décès (döde och begravne) et les registres d’examen du catéchisme (husförhörslängder), qui suivent chaque maison année après année. Avant 1900 environ, écriture gothique (comme la Kurrent allemande) et mois en latin.',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['född, födt, födde', 'né, née ; « Födde » en tête de page = les naissances', '« född d. 3 Maj »'],
                ['föddes', 'naquit, est né'],
                ['döpt, döpte, döptes', 'baptisé ; « döptes » = fut baptisé'],
                ['dop', 'baptême'], ['födde och döpte', 'nés et baptisés (titre du registre des naissances)'],
                ['nöddöpt', 'baptisé d’urgence (ondoyé) parce que l’enfant risquait de mourir'],
                ['faddrar, faddrarne, vittnen', 'parrains et marraines, témoins du baptême'],
                ['föräldrar, föräldrarne', 'les parents (le père et la mère)'],
                ['äkta, ä.', 'légitime (enfant de parents mariés)'], ['oäkta, o.', 'illégitime, né hors mariage'],
                ['tvillingar', 'jumeaux'], ['dödfödd, dödfödt', 'mort-né'], ['barn', 'enfant'], ['gosse', 'garçon'], ['flicka', 'fille (enfant)'],
                ['kyrkotagning', 'relevailles : la mère revient à l’église après la naissance'],
                ['barnmorska', 'sage-femme'],
            ]),
            ...R('mot', 'mariage', [
                ['vigd, vigde, vigsel', 'marié, mariés ; le mariage (« Vigde » = registre des mariages)'],
                ['lysning, lyst, lysningar', 'les bans (annonces du mariage à l’église) ; publié'],
                ['brudgum, brudgumme', 'le marié, le fiancé'], ['brud', 'la mariée, la fiancée'], ['brudfolk', 'les mariés (le couple)'],
                ['trolovning, trolovad', 'fiançailles ; fiancé'], ['ungkarl', 'garçon, jamais marié'], ['pigan, piga', 'servante, jeune fille non mariée'],
                ['änkling', 'veuf'], ['änka, enka', 'veuve'], ['hustru, h.', 'épouse, femme mariée (aussi « madame » devant un nom)'],
                ['man', 'mari, homme'], ['giftoman', 'celui qui donne la femme en mariage (son père ou son tuteur)'],
                ['hindersprövning', 'vérification qu’aucun empêchement n’interdit le mariage'],
            ]),
            ...R('mot', 'sepulture', [
                ['död, döde, dog', 'mort, décédé ; « Döde » = registre des décès'], ['begraven, begrafven, begr.', 'enterré'],
                ['döde och begravne, döde och begrafne', 'morts et enterrés (titre du registre des décès)'],
                ['dödsorsak', 'cause de la mort'], ['ålderdom', 'vieillesse (cause de mort)'], ['ålder', 'âge'],
                ['lungsot', 'tuberculose des poumons'], ['bröstsjuka, bröstsjukdom', 'maladie de poitrine'],
                ['koppor, kopporna', 'variole'], ['mässling', 'rougeole'], ['kikhosta', 'coqueluche'], ['slag, slagfluss', 'attaque, apoplexie'],
                ['barnsäng', 'couches (la mère meurt de l’accouchement)'], ['drunknade, drunknad', 'noyé'], ['frossa', 'fièvre (paludisme, « fièvre froide »)'],
                ['kyrkogård', 'cimetière'], ['salig, sal.', 'feu, défunt (« sal. Anders » = feu Anders)'], ['efterlämnar', 'laisse (après sa mort)'],
            ]),
            ...R('mot', 'general', [
                ['kyrkobok, kyrkoböcker', 'registre paroissial'], ['husförhörslängd', 'registre d’examen du catéchisme : chaque maison, ses habitants, leur savoir, leurs départs'],
                ['flyttningslängd, inflyttade, utflyttade', 'registre des départs et arrivées ; arrivés, partis (d’une paroisse à l’autre)'],
                ['socken', 'paroisse (la commune rurale)'], ['församling', 'paroisse, communauté'], ['by', 'village'], ['gård', 'ferme'], ['torp', 'petite ferme d’un torpare (sur la terre d’un autre)'],
                ['härad', 'canton (circonscription)'], ['län', 'département (province)'], ['stad', 'ville'],
                ['i, ifrån, från', 'à, de (« Per Olsson i Byn » = Per Olsson du village)'], ['och', 'et'], ['af, av', 'de, par'], ['d., den', 'le (devant une date : « d. 12 Maj »)'],
                ['nattvardsgång', 'communion (notée dans le husförhör)'], ['läser, läsförmåga', 'lecture, savoir lire (noté au catéchisme)'],
            ]),
            ...R('parente', 'general', [
                ['fader, far', 'père'], ['moder, mor', 'mère'], ['son', 'fils'], ['dotter', 'fille'], ['broder, bror', 'frère'], ['syster', 'sœur'],
                ['farfar', 'grand-père paternel (père du père)'], ['morfar', 'grand-père maternel (père de la mère)'],
                ['farmor', 'grand-mère paternelle'], ['mormor', 'grand-mère maternelle'],
                ['farbror', 'oncle paternel (frère du père)'], ['morbror', 'oncle maternel (frère de la mère)'],
                ['faster', 'tante paternelle (sœur du père)'], ['moster', 'tante maternelle (sœur de la mère)'],
                ['sonson, sondotter', 'petit-fils, petite-fille par le fils'], ['dotterson, dotterdotter', 'petit-fils, petite-fille par la fille'],
                ['brorson, brorsdotter', 'neveu, nièce (enfant du frère)'], ['systerson, systerdotter', 'neveu, nièce (enfant de la sœur)'],
                ['kusin', 'cousin, cousine'], ['svärfar, svärfader', 'beau-père (père du conjoint)'], ['svärmor, svärmoder', 'belle-mère (mère du conjoint)'],
                ['måg', 'gendre'], ['sonhustru, svärdotter', 'belle-fille (épouse du fils)'], ['svåger', 'beau-frère'], ['svägerska', 'belle-sœur'],
                ['styvfar, styvmor', 'beau-père, belle-mère (second mari, seconde femme)'], ['styvson, styvdotter', 'beau-fils, belle-fille (enfant du conjoint)'],
                ['fosterbarn', 'enfant placé, élevé par d’autres'], ['förmyndare', 'tuteur'],
                ['-son, -dotter', 'patronyme : « fils de », « fille de » (Anders Persson = fils de Per ; Kerstin Andersdotter = fille d’Anders). Il change à chaque génération jusque vers 1900.'],
            ]),
            ...R('mois', 'general', [
                ['januari, Januarii, Jan.', 'janvier'], ['februari, Februarii, Febr.', 'février'], ['mars, Martii', 'mars'], ['april, Aprilis', 'avril'],
                ['maj, Maji, Majus', 'mai'], ['juni, Junii', 'juin'], ['juli, Julii', 'juillet'], ['augusti, Augusti, Aug.', 'août'],
                ['september, Septembris, 7br., 7ber', 'septembre'], ['oktober, October, Octobris, 8br., 8ber', 'octobre'],
                ['november, Novembris, 9br., 9ber', 'novembre'], ['december, Decembris, Xbr., 10br.', 'décembre'],
                ['Torsmånad', 'janvier (ancien nom suédois)'], ['Göjemånad', 'février (ancien nom)'], ['Vårmånad', 'mars (ancien nom)'], ['Gräsmånad', 'avril (ancien nom)'],
                ['Blomstermånad', 'mai (ancien nom)'], ['Sommarmånad', 'juin (ancien nom)'], ['Hömånad', 'juillet (ancien nom)'], ['Skördemånad', 'août (ancien nom)'],
                ['Höstmånad', 'septembre (ancien nom)'], ['Slaktmånad', 'octobre (ancien nom)'], ['Vintermånad', 'novembre (ancien nom)'], ['Julmånad', 'décembre (ancien nom)'],
                ['månad', 'mois'], ['vecka', 'semaine'], ['dag', 'jour'], ['söndag', 'dimanche'],
            ]),
            ...R('nombre', 'general', [
                ['en, ett', 'un'], ['två', 'deux'], ['tre', 'trois'], ['fyra', 'quatre'], ['fem', 'cinq'], ['sex', 'six'], ['sju', 'sept'], ['åtta', 'huit'], ['nio', 'neuf'], ['tio', 'dix'],
                ['elva', 'onze'], ['tolv', 'douze'], ['tjugo, tjugu', 'vingt'], ['trettio', 'trente'], ['fyrtio', 'quarante'], ['femtio', 'cinquante'], ['sextio', 'soixante'],
                ['sjuttio', 'soixante-dix'], ['åttio', 'quatre-vingts'], ['nittio', 'quatre-vingt-dix'], ['hundra', 'cent'], ['tusen', 'mille'],
                ['år, år gammal', 'an, ans ; âgé de … ans', '« 74 år gammal » = âgé de 74 ans'], ['månader, veckor, dagar', 'mois, semaines, jours (âge d’un enfant)'],
                ['första, andra, tredje', 'premier, deuxième, troisième'],
            ]),
            ...R('metier', 'general', [
                ['bonde', 'paysan propriétaire ou fermier de sa ferme'], ['hemmansägare', 'propriétaire d’une ferme (hemman)'], ['torpare', 'petit tenancier : il cultive un torp sur la terre d’un autre et le paie en journées de travail'],
                ['backstugusittare', 'très pauvre : une cabane sur la terre d’un autre, sans champ'], ['inhyses, inhysing', 'logé chez quelqu’un d’autre, sans maison à soi'],
                ['dräng', 'valet de ferme'], ['piga', 'servante de ferme'], ['statare', 'ouvrier agricole payé en nature (grand domaine)'],
                ['soldat', 'soldat (il reçoit souvent un nom de soldat : Rask, Modig, Ek…)'], ['båtsman', 'marin-soldat de la flotte'],
                ['smed', 'forgeron'], ['mjölnare', 'meunier'], ['skräddare', 'tailleur'], ['skomakare', 'cordonnier'], ['snickare', 'menuisier'], ['timmerman', 'charpentier'],
                ['vävare', 'tisserand'], ['fiskare', 'pêcheur'], ['klockare', 'sacristain et chantre (souvent aussi maître d’école)'], ['kyrkoherde', 'pasteur (curé principal de la paroisse)'],
                ['komminister, kapellan', 'pasteur adjoint'], ['länsman', 'officier de police du canton'], ['gästgivare', 'aubergiste (relais de poste)'], ['skollärare', 'instituteur'],
                ['änka efter …', 'veuve de … (souvent à la place du métier d’une femme)'],
            ]),
            ...R('abrev', 'general', [
                ['d.', 'den : le (devant une date) ; ou död : mort'], ['f.', 'född : né'], ['h.', 'hustru : épouse'],
                ['sal.', 'salig : feu, défunt'], ['koppor (colonne)', 'dans le husförhör : a eu la variole ou a été vacciné (« vacc. »)'],
            ]),
            ...R('formule', 'bapteme', [
                ['föddes och döptes', 'naquit et fut baptisé'],
                ['Föräldrar: bonden … och hustru …', 'Parents : le paysan … et sa femme … (la mère garde son patronyme : « hustru Kerstin Andersdotter »)'],
                ['Faddrar: …', 'Parrains : …'],
            ]),
            ...R('formule', 'mariage', [
                ['efter trenne söndagars lysning', 'après les bans publiés trois dimanches'],
                ['vigdes', 'furent mariés'], ['med giftomannens samtycke', 'avec l’accord de celui qui donne la mariée (son père ou son tuteur)'],
            ]),
            ...R('formule', 'sepulture', [
                ['dog d. … och begrofs d. …', 'mourut le … et fut enterré le …'], ['… år gammal', 'âgé de … ans'],
            ]),
            ...R('formule', 'general', [
                ['flyttat till …, flyttad från …', 'parti pour … ; venu de … (notes du husförhör)'], ['död, se … sid …', 'mort, voir (autre registre) page …'],
            ]),
        ],
        // écriture gothique suédoise (même famille que la Kurrent allemande) : dessins maison simplifiés
        glyphs: {
            sv_e: ['M10 44 L13 30 L16 44', 'M16 44 L19 30 L22 44'],
            sv_n: ['M8 44 L12 30 L17 44', 'M17 44 L21 30 L26 44'],
            sv_u: ['M8 44 L12 30 L17 44', 'M17 44 L21 30 L26 44', 'M11 20 C14 25 21 25 24 20'],
            sv_aring: ['M25 34 C21 28 13 30 13 38 C13 46 23 46 25 39', 'M25 31 L25 46', 'M19 14 C15 14 15 22 19 22 C23 22 23 14 19 14'],
            sv_auml: ['M25 34 C21 28 13 30 13 38 C13 46 23 46 25 39', 'M25 31 L25 46', 'M14 22 L16 16', 'M22 22 L24 16'],
            sv_ouml: ['M19 30 C11 30 11 46 19 46 C27 46 27 30 19 30', 'M13 22 L15 16', 'M22 22 L24 16'],
        },
        widths: {},
        letters: [
            {id: 'sv_e', name: 'e gothique', seen: ['sv_e'], read: 'e', cmp: ['sv_n'], note: 'Dans l’écriture gothique des registres (jusque vers 1900), le e ressemble à un petit n pointu, comme dans la Kurrent allemande.', keys: 'gothique e n kurrent suedois'},
            {id: 'sv_u', name: 'u gothique et son arc', seen: ['sv_u'], read: 'u', cmp: ['sv_n'], note: 'Le u porte un petit arc au-dessus pour ne pas être lu n.', keys: 'gothique u n arc'},
            {id: 'sv_aring', name: 'å (a rond)', seen: ['sv_aring'], read: 'å', cmp: ['sv_auml'], note: 'Le petit rond est parfois réduit à un point ou un trait. On trouve aussi « aa » dans les registres anciens. La recherche ne tient pas compte du rond : tape « ar » pour « år ».', keys: 'a rond aa ring'},
            {id: 'sv_auml', name: 'ä et ö (deux traits)', seen: ['sv_auml', 'sv_ouml'], read: 'ä, ö', cmp: ['sv_aring'], note: 'Les deux points s’écrivent souvent comme deux petits traits, ou un petit e au-dessus (ae, oe). Ne les confonds pas avec le rond de å.', keys: 'trema a o ae oe'},
        ],
        exercises: [
            {id: 'sv_fodde1785', icon: '👶', title: 'Une naissance de 1785 (Födde)', level: 'facile', acte: 'bapteme', year: 1785,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Le mois est en latin, « d. » = den (le). Le fils Anders sera « Persson », fils de Per.',
                src: '1785 d.=den 12 Martii=Martii|mars föddes och d.=den 14 döptes Anders Föräldrar Bonden Per Larsson i Byn och hustru Kerstin Andersdotter Faddrar Drängen Nils Persson och pigan Maria Olsdotter',
                notes: {'d.': 'd. = den : le (devant une date)', Martii: 'Martii = mars (latin, comme dans les registres)', hustru: 'hustru = épouse ; la mère garde son patronyme (Andersdotter)'}},
            {id: 'sv_dode1820', icon: '⚱️', title: 'Un décès de 1820 (Döde)', level: 'moyen', acte: 'sepulture', year: 1820,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Vieille orthographe : « begrafven », « af » (= av).',
                src: 'Torparen Olof Jonsson ifrån Backen död d.=den 28 Decembris=Decembris|december 1819 af=af|av ålderdom begrafven=begrafven|begraven d.=den 3 Januarii=Januarii|januari 1820 74 år gammal',
                notes: {begrafven: 'begrafven = begraven : enterré (vieille orthographe, f pour v)', af: 'af = av : de, par (vieille orthographe)', 'Torparen': 'torpare = petit tenancier ; « -en » = le'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Swedish Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Swedish_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Sweden Church Records', url: 'https://www.familysearch.org/en/wiki/Sweden_Church_Records'},
            {label: 'Riksarkivet (Archives nationales de Suède) — kyrkoarkiv', url: 'https://sok.riksarkivet.se/kyrkoarkiv'},
        ],
    };
})());
