/* 📜 Aide à la lecture — Anglais (registres d’Angleterre, du pays de Galles, d’Écosse, d’Irlande ; recensements britanniques et
 * américains ; listes de passagers d’Ellis Island). Format : aide-langues/README-format.md. Sources : voir `sources` en bas. */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'en', name: 'Anglais', native: 'English', icon: '🇬🇧', script: 'latine', dir: 'ltr', ocr: ['eng'],
        intro: 'Registres paroissiaux anglais (« parish registers », Church of England), état civil britannique et irlandais, recensements (Royaume-Uni dès 1841, États-Unis dès 1790, Canada), listes de passagers d’Ellis Island (1892-1924). Les registres catholiques d’Irlande sont souvent en latin (choisis la langue « Latin »).',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['baptized, baptised, bapt., bap.', 'baptisé'], ['christened, chr.', 'baptisé (« christened » : a reçu le baptême et son prénom)'],
                ['born, b.', 'né, née'], ['birth', 'naissance'], ['son of', 'fils de'], ['daughter of, dau., dr.', 'fille de'],
                ['base born, baseborn', 'né hors mariage'], ['illegitimate, illeg.', 'illégitime, né hors mariage'], ['natural son, natural daughter', 'enfant naturel (né hors mariage)'],
                ['reputed father', 'père présumé (d’un enfant né hors mariage)'], ['spurious', 'illégitime (mot ancien)'],
                ['sponsors, godparents', 'parrain et marraine'], ['godfather, godmother', 'parrain, marraine'],
                ['privately baptized, pr. bapt.', 'ondoyé à la maison (baptême d’urgence), parfois « received into the church » plus tard'],
                ['received into the church', 'baptême terminé à l’église après un ondoiement'], ['twins', 'jumeaux'], ['foundling', 'enfant trouvé'],
            ]),
            ...R('mot', 'mariage', [
                ['married, mar., m.', 'marié(e)'], ['marriage', 'mariage'], ['by banns', 'après publication des bans'], ['by licence, by license, lic.', 'avec une licence (dispense des bans, souvent payée)'],
                ['bachelor', 'célibataire (homme jamais marié)'], ['spinster', 'célibataire (femme jamais mariée) — pas une fileuse !'],
                ['widower', 'veuf'], ['widow, wid.', 'veuve'], ['relict', 'veuve (« relict of John » = veuve de John)'],
                ['of this parish', 'de cette paroisse'], ['of full age', 'majeur (21 ans ou plus)'], ['minor, under age', 'mineur (moins de 21 ans)'],
                ['bride, groom', 'la mariée, le marié'], ['witnesses', 'témoins'], ['in the presence of', 'en présence de'],
                ['rank or profession', 'condition ou métier (colonne de l’acte)'], ['his mark, her mark, X', 'sa marque : la personne ne savait pas signer'],
            ]),
            ...R('mot', 'deces', [
                ['buried, bur.', 'enterré(e)'], ['burial', 'sépulture'], ['interred', 'inhumé'], ['died, d.', 'mort, morte'], ['death', 'décès'],
                ['deceased, dec., decd.', 'décédé, défunt'], ['late', 'feu (« son of the late John » = fils de feu John)'], ['abode', 'domicile (colonne de l’acte de sépulture)'],
                ['infant, inf.', 'petit enfant'], ['stillborn', 'mort-né'], ['pauper', 'indigent (enterré aux frais de la paroisse)'], ['workhouse', 'hospice des pauvres (maison de travail)'],
                ['cause of death', 'cause du décès'], ['informant', 'déclarant (qui est venu déclarer le décès)'], ['churchyard', 'cimetière autour de l’église'],
                ['consumption', 'consomption (souvent la tuberculose)'], ['decline', 'dépérissement (souvent la tuberculose)'], ['old age', 'vieillesse'],
            ]),
            ...R('mot', 'general', [
                ['parish', 'paroisse'], ['parish register', 'registre paroissial'], ['curate, vicar, rector, minister', 'prêtre de la paroisse (titres anglicans)'],
                ['registrar', 'officier de l’état civil (Angleterre dès 1837, Irlande dès 1864)'], ['township', 'commune, canton (Nord de l’Angleterre, États-Unis, Canada)'],
                ['county, co.', 'comté'], ['said', 'ledit, ladite'], ['the same, ditto, do', 'le même, la même chose'], ['yeoman', 'paysan propriétaire de sa terre'],
                ['Esquire, Esq.', 'écuyer (homme de rang)'], ['Gentleman, Gent.', 'gentilhomme, homme de bonne condition'],
                ['Old Style, O.S.', 'ancien style : calendrier julien (Angleterre jusqu’en 1752)'], ['New Style, N.S.', 'nouveau style : calendrier grégorien'],
                ['1723/4 (double date)', 'avant 1752, l’année commençait le 25 mars en Angleterre : janvier à mars 1723/4 = 1724 pour nous'],
            ]),
            ...R('parente', 'general', [
                ['father, mother', 'père, mère'], ['parents', 'parents (père et mère)'], ['son, daughter', 'fils, fille'], ['brother, sister', 'frère, sœur'],
                ['grandfather, grandmother', 'grand-père, grand-mère'], ['grandson, granddaughter, grandchild', 'petit-fils, petite-fille, petit-enfant'],
                ['uncle, aunt', 'oncle, tante'], ['nephew, niece', 'neveu, nièce'], ['cousin', 'cousin, cousine (autrefois aussi neveu ou nièce)'],
                ['husband, wife', 'mari, épouse'], ['father-in-law, mother-in-law', 'beau-père, belle-mère (autrefois aussi pour le second conjoint d’un parent)'],
                ['son-in-law, daughter-in-law', 'gendre, belle-fille (autrefois aussi beau-fils : l’enfant du conjoint)'],
                ['stepson, stepdaughter', 'beau-fils, belle-fille (enfant du conjoint)'], ['brother-in-law, sister-in-law', 'beau-frère, belle-sœur'],
                ['head, head of family', 'chef de famille (recensement)'], ['guardian', 'tuteur'],
            ]),
            ...R('mois', 'general', [
                ['January, Jan., Jany', 'janvier'], ['February, Feb., Feby', 'février'], ['March, Mar.', 'mars'], ['April, Apr.', 'avril'], ['May', 'mai'],
                ['June, Jun.', 'juin'], ['July, Jul.', 'juillet'], ['August, Aug.', 'août'], ['September, Sept., Sepr, 7ber', 'septembre'],
                ['October, Oct., 8ber', 'octobre'], ['November, Nov., 9ber', 'novembre'], ['December, Dec., Xber, 10ber', 'décembre'],
                ['inst.', 'instant : de ce mois-ci (« the 5th inst. »)'], ['ult.', 'ultimo : du mois dernier'],
            ]),
            ...R('nombre', 'general', [
                ['one, two, three', 'un, deux, trois'], ['four, five, six', 'quatre, cinq, six'], ['seven, eight, nine, ten', 'sept, huit, neuf, dix'],
                ['eleven, twelve', 'onze, douze'], ['twenty, thirty, forty', 'vingt, trente, quarante'], ['fifty, sixty, seventy, eighty, ninety', 'cinquante à quatre-vingt-dix'],
                ['hundred, thousand', 'cent, mille'], ['score', 'vingt (« three score and ten » = 70)'],
                ['first, second, third, 1st, 2nd, 3rd', 'premier, deuxième, troisième'], ['the fourth day of', 'le 4 (du mois)'],
                ['aged, ae., a.', 'âgé de', '« aged 45 years »'], ['years, yrs, months, mos, days', 'ans, mois, jours'],
                ['in the … year of the reign of', 'la …e année du règne de (date par le règne du roi ou de la reine)'],
            ]),
            ...R('metier', 'general', [
                ['labourer, laborer, lab.', 'journalier'], ['agricultural labourer, ag. lab.', 'ouvrier agricole'], ['husbandman', 'petit cultivateur'], ['farmer', 'fermier, cultivateur'],
                ['servant, serv.', 'domestique'], ['cordwainer', 'cordonnier (qui fait des chaussures neuves)'], ['cooper', 'tonnelier'], ['wheelwright', 'charron'],
                ['joiner', 'menuisier'], ['carpenter', 'charpentier'], ['mason', 'maçon'], ['blacksmith, smith', 'forgeron'], ['weaver', 'tisserand'], ['collier', 'mineur de charbon'],
                ['miller', 'meunier'], ['mariner, seaman', 'marin'], ['victualler, publican, innkeeper', 'cabaretier, aubergiste'], ['shoemaker', 'cordonnier'], ['tailor', 'tailleur'],
                ['dressmaker, seamstress', 'couturière'], ['laundress', 'blanchisseuse'], ['carter', 'charretier'], ['clerk', 'employé de bureau ; aussi clerc d’église'],
            ]),
            ...R('abrev', 'recensement', [
                ['Head', 'chef du ménage (recensement)'], ['Wife, Son, Dau.', 'épouse, fils, fille (lien avec le chef)'], ['Serv., F.S., M.S.', 'domestique ; female servant, male servant (1841)'],
                ['Lodger, Boarder, Visitor', 'locataire d’une chambre, pensionnaire, en visite'], ['Ind.', 'independent : vit de ses rentes (1841)'],
                ['Ap., App.', 'apprenti'], ['Scholar', 'écolier, écolière (enfant qui va à l’école)'], ['J., Journeyman', 'compagnon (ouvrier qualifié)'], ['N.K.', 'not known : inconnu'],
                ['Unm., U.', 'unmarried : célibataire'], ['Mar., M.', 'married : marié(e)'], ['Wid., W.', 'widow(er) : veuf, veuve'],
                ['Y, N (1841)', 'né dans ce comté : yes / no (recensement de 1841)'], ['S, I, F (1841)', 'né en Écosse, en Irlande, à l’étranger (« Foreign parts »)'],
                ['ages rounded down (1841)', 'en 1841, les âges des plus de 15 ans sont arrondis aux 5 ans en dessous : « 40 » = de 40 à 44 ans'],
                ['Na, Al, Pa (États-Unis)', 'naturalisé, étranger (alien), premiers papiers déposés (recensements 1900-1930)'],
                ['Relationship to head of family', 'lien avec le chef de famille (colonne du recensement)'], ['Year of immigration', 'année d’arrivée aux États-Unis'],
            ]),
            ...R('abrev', 'general', [
                ['List or manifest of alien passengers', 'liste des passagers étrangers (Ellis Island)'], ['Last residence', 'dernière résidence (avant le départ)'],
                ['Final destination', 'destination finale'], ['Nationality, Race or people', 'nationalité ; peuple (« Hebrew », « Polish »… colonne d’Ellis Island)'],
                ['Calling or occupation', 'métier'], ['Able to read, write', 'sait lire, écrire'], ['By whom was passage paid', 'qui a payé le voyage'],
                ['Whether going to join a relative or friend', 'va-t-il rejoindre un parent ou un ami (nom et adresse suivent)'],
                ['Nearest relative or friend in country whence alien came', 'le parent le plus proche resté au pays (souvent le père, la mère ou l’épouse)'],
                ['S.I., Special Inquiry', 'retenu pour une audience (« enquête spéciale ») à Ellis Island'], ['L.P.C.', 'likely to become a public charge : risque de tomber à la charge du public (motif de refus)'],
                ['Detained', 'retenu à Ellis Island'], ['Deported', 'renvoyé dans son pays'],
            ]),
            ...R('formule', 'bapteme', [
                ['was baptized … son of … and … his wife', 'a été baptisé … fils de … et de … sa femme'],
            ]),
            ...R('formule', 'mariage', [
                ['were married in this church by banns', 'se sont mariés dans cette église après les bans'], ['both of this parish', 'tous deux de cette paroisse'],
                ['married in the presence of', 'mariés en présence de'],
            ]),
            ...R('formule', 'deces', [
                ['was buried', 'a été enterré(e)'], ['died … of …', 'est mort le … de … (cause)'],
            ]),
            ...R('formule', 'general', [
                ['the mark of … X', 'la marque de … (ne savait pas signer)'], ['signature, description and residence of informant', 'signature, qualité et domicile du déclarant (état civil anglais)'],
            ]),
        ],
        glyphs: {
            en_ff: ['M14 8 L14 58', 'M24 8 L24 58', 'M10 26 L28 26'],
            en_dd: ['M24 30 C20 25 12 27 12 37 C12 46 22 46 24 38', 'M24 38 C26 24 30 12 18 8'],
            en_ye: ['M10 26 L20 58', 'M30 26 L16 46 C14 52 22 54 24 50', 'M22 10 L30 10 C34 10 34 16 30 18 C26 20 22 16 26 12'],
        },
        widths: {},
        letters: [
            {id: 'en_ff', name: 'ff au début d’un nom', seen: ['en_ff'], read: 'F', cmp: ['F'], note: 'Comme en français, « ff » au début d’un mot vaut un F majuscule : « ffrancis » = Francis.', keys: 'ff majuscule F'},
            {id: 'en_ye', name: 'ye pour « the »', seen: ['en_ye'], read: 'the', cmp: ['y'], note: 'Le y avec un petit e au-dessus (yᵉ) est l’ancienne lettre thorn (þ) : il se lit « the » ; « yᵗ » = that.', keys: 'ye the thorn yt that'},
            {id: 'en_dd', name: 'd bouclé de la secrétaire', seen: ['en_dd'], read: 'd', cmp: ['e'], note: 'Dans l’écriture « secretary hand » (XVIe-XVIIe siècle), la hampe du d se recourbe en arrière en grande boucle.', keys: 'secretary hand d boucle'},
            {id: 'en_slong', name: 's long', seen: ['slong'], read: 's', cmp: ['f'], note: 'Le s long (ſ) est employé en anglais jusque vers 1800 : « Elizabeth Muſgrave » = Musgrave ; « ſs » = ss.', keys: 's long ſ ss'},
        ],
        exercises: [
            {id: 'en_bapt1795', icon: '👶', title: 'A baptism (baptême) of 1795', level: 'facile', acte: 'bapteme', year: 1795,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Repère le s long (ſ), « Feby » = février et « dau. » = daughter.',
                src: 'Feby=February 14 1795 Mary dau.=daughter of Thomas Wilſon=Wilson labourer and Sarah his wife was baptized',
                notes: {Feby: 'Feby = February : février', 'dau.': 'dau. = daughter : fille', 'Wilſon': 'ſ (s long) = s'}},
            {id: 'en_census1851', icon: '🏠', title: 'A census page (recensement) of 1851', level: 'moyen', acte: 'recensement', year: 1851,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Développe les abréviations du recensement : Mar., Unm., Ag. Lab., Dau., Do.',
                src: 'John Smith Head Mar.=married 45 Ag.=agricultural Lab.=labourer|laborer Ann Smith Wife Mar.=married 42 William Smith Son Unm.=unmarried 18 Ag.=agricultural Lab.=labourer|laborer Jane Smith Dau.=daughter 12 Scholar Do.=ditto',
                notes: {'Mar.': 'Mar. = married : marié(e)', 'Unm.': 'Unm. = unmarried : célibataire', 'Ag.': 'Ag. Lab. = agricultural labourer : ouvrier agricole', 'Do.': 'Do. = ditto : comme au-dessus'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — England Church Records', url: 'https://www.familysearch.org/en/wiki/England_Church_Records'},
            {label: 'FamilySearch Research Wiki — England Census', url: 'https://www.familysearch.org/en/wiki/England_Census'},
            {label: 'The National Archives (UK) — Census records, 1841 abbreviations', url: 'https://www.nationalarchives.gov.uk/help-with-your-research/research-guides/census-records/'},
            {label: 'U.S. Census Bureau — Census instructions to enumerators (1900-1930)', url: 'https://www.census.gov/history/www/through_the_decades/census_instructions/'},
            {label: 'Statue of Liberty – Ellis Island Foundation — passenger manifests', url: 'https://www.statueofliberty.org/discover/passenger-ship-search/'},
            {label: 'JewishGen InfoFile (Marian L. Smith) — Annotations on Ellis Island and New York passenger manifests', url: 'https://www.jewishgen.org/InfoFiles/Manifests/'},
        ],
    };
})());
