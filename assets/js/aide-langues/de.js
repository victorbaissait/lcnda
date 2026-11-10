/* 📜 Aide à la lecture — Allemand (registres paroissiaux catholiques et protestants, état civil après 1874-1876).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'de', name: 'Allemand', native: 'Deutsch', icon: '🇩🇪', script: 'latine', dir: 'ltr', ocr: ['deu'],
        intro: 'Registres d’Allemagne, d’Autriche, de Suisse alémanique, d’Alsace-Moselle (1871-1918) et des colonies allemandes d’Europe de l’Est. Écriture le plus souvent en Kurrent (onglet ✍️ Les lettres).',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['geboren, geb.', 'né, née (et aussi « née » devant le nom de jeune fille : « Anna geb. Schmidt »)'],
                ['getauft, get.', 'baptisé', '« ist getauft worden » = a été baptisé'],
                ['Taufe', 'baptême'], ['Täufling', 'l’enfant baptisé'],
                ['ehelich', 'légitime (enfant de parents mariés)', '« ehelicher Sohn »'], ['unehelich', 'illégitime, né hors mariage'],
                ['Pate, Pathe', 'parrain (ou témoin du baptême)'], ['Patin, Pathin', 'marraine'], ['Paten, Pathen, Taufpaten', 'parrain et marraine'],
                ['Taufzeugen', 'témoins du baptême (les parrains)'], ['Hebamme', 'sage-femme'], ['Zwillinge', 'jumeaux'],
                ['Findelkind', 'enfant trouvé'], ['Nottaufe, nothgetauft', 'baptême d’urgence (ondoiement) : l’enfant risquait de mourir'],
                ['Kind', 'enfant'], ['Knabe', 'garçon (enfant)'], ['Mädchen', 'fille (enfant)'],
            ]),
            ...R('mot', 'mariage', [
                ['getraut', 'marié (à l’église)'], ['Trauung', 'mariage (la cérémonie)'], ['Ehe', 'mariage (l’union)'], ['Hochzeit', 'noces'],
                ['copuliert, copulirt, cop.', 'marié (mot latin des registres)'], ['Bräutigam', 'fiancé, le marié'], ['Braut', 'fiancée, la mariée'],
                ['Junggeselle', 'garçon, jamais marié'], ['Jungfrau', 'jeune fille, jamais mariée'], ['ledig', 'célibataire (jamais marié)'],
                ['Witwer, Wittwer', 'veuf'], ['Witwe, Wittwe, Wwe.', 'veuve'],
                ['Aufgebot, aufgeboten, proklamiert', 'les bans (annonces du mariage) ; publié'], ['Eheleute', 'les époux, le couple'],
                ['Ehefrau, Eheweib', 'épouse'], ['Ehemann', 'mari'], ['Ehegatte', 'époux, conjoint'], ['Trauzeugen', 'témoins du mariage'], ['Dispens', 'dispense (de l’Église)'],
            ]),
            ...R('mot', 'sepulture', [
                ['gestorben, gest.', 'mort, décédé'], ['starb', 'mourut'], ['verstorben', 'décédé, défunt'], ['begraben, begr.', 'enterré'], ['beerdigt', 'inhumé'],
                ['Begräbnis', 'enterrement, sépulture'], ['Tod', 'la mort'], ['Todesursache', 'cause de la mort'], ['Friedhof, Kirchhof, Gottesacker', 'cimetière'],
                ['alt', 'âgé de', '« alt 72 Jahre » = âgé de 72 ans'], ['totgeboren, todtgeboren', 'mort-né'],
                ['selig, sel.', 'feu, défunt (« des sel. Johann » = de feu Jean)'], ['weiland', 'feu, défunt (autrefois)'], ['Leiche', 'corps (du défunt)'],
                ['Schlagfluss', 'attaque, apoplexie (cause de mort)'], ['Auszehrung', 'consomption, souvent la tuberculose'], ['Altersschwäche', 'vieillesse, faiblesse de l’âge'],
                ['Wassersucht', 'hydropisie (ventre gonflé d’eau)'], ['Blattern', 'variole'], ['Lungenentzündung', 'pneumonie'],
                ['hinterlässt, hinterläßt', 'laisse (après sa mort : une veuve, des enfants)'],
            ]),
            ...R('mot', 'general', [
                ['Kirchenbuch', 'registre paroissial'], ['Pfarrer', 'curé (catholique) ou pasteur (protestant)'], ['Pfarrei', 'paroisse'],
                ['evangelisch, ev.', 'protestant'], ['lutherisch, luth.', 'luthérien'], ['reformiert, ref.', 'réformé (calviniste)'], ['katholisch, kath.', 'catholique'],
                ['allhier, hier', 'd’ici, de ce lieu'], ['hiesig', 'd’ici, de cette paroisse'], ['wohnhaft', 'demeurant'], ['Einwohner', 'habitant'], ['Bürger', 'bourgeois (habitant reconnu d’une ville)'],
                ['Gemeinde', 'commune (ou paroisse)'], ['Dorf', 'village'], ['Hof', 'ferme, cour'], ['Haus Nr.', 'maison numéro'],
                ['Standesamt', 'bureau de l’état civil (à partir de 1874-1876)'], ['Standesbeamter', 'officier de l’état civil'], ['Zeuge, Zeugen', 'témoin, témoins'],
                ['derselbe, dieselbe, dessen', 'le même, la même, de celui-ci'], ['ohne', 'sans'], ['und', 'et'], ['des, der', 'du, de la (« Sohn des Michael » = fils de Michel)'],
            ]),
            ...R('parente', 'general', [
                ['Vater', 'père'], ['Mutter', 'mère'], ['Eltern', 'parents (le père et la mère)'], ['Sohn', 'fils'], ['Tochter', 'fille'],
                ['Bruder', 'frère'], ['Schwester', 'sœur'], ['Großvater, Grossvater', 'grand-père'], ['Großmutter, Grossmutter', 'grand-mère'], ['Enkel', 'petit-enfant'],
                ['Oheim, Onkel', 'oncle'], ['Tante, Muhme', 'tante'], ['Vetter', 'cousin'], ['Base', 'cousine'], ['Neffe', 'neveu'], ['Nichte', 'nièce'],
                ['Schwiegervater', 'beau-père (père du conjoint)'], ['Schwiegermutter', 'belle-mère (mère du conjoint)'], ['Schwiegersohn', 'gendre'], ['Schwiegertochter', 'belle-fille (épouse du fils)'],
                ['Schwager', 'beau-frère'], ['Schwägerin', 'belle-sœur'], ['Stiefvater', 'beau-père (second mari de la mère)'], ['Stiefmutter', 'belle-mère (seconde femme du père)'],
                ['Stiefsohn, Stieftochter', 'beau-fils, belle-fille (enfant du conjoint)'], ['Vormund', 'tuteur'],
            ]),
            ...R('mois', 'general', [
                ['Januar, Jänner', 'janvier (Jänner : Autriche, Bavière)'], ['Hornung', 'février (ancien nom)'], ['Februar', 'février'], ['März, Merz', 'mars'],
                ['April', 'avril'], ['Mai, May', 'mai'], ['Juni, Brachmonat', 'juin (Brachmonat : ancien nom)'], ['Juli, Heumonat', 'juillet (Heumonat : ancien nom)'],
                ['August, Augstmonat', 'août'], ['September, Herbstmonat', 'septembre (Herbstmonat : ancien nom)'], ['Oktober, October, Weinmonat', 'octobre (Weinmonat : ancien nom)'],
                ['November, Wintermonat', 'novembre (Wintermonat : ancien nom)'], ['Dezember, December, Christmonat', 'décembre (Christmonat : ancien nom)'],
                ['7ber, 8ber, 9ber, 10ber, Xber', 'septembre, octobre, novembre, décembre (7e, 8e, 9e, 10e mois du calendrier romain)'],
                ['Monat', 'mois'], ['Woche', 'semaine'], ['Tag', 'jour'], ['Sonntag', 'dimanche'],
            ]),
            ...R('nombre', 'general', [
                ['eins, ein', 'un'], ['zwei', 'deux'], ['drei', 'trois'], ['vier', 'quatre'], ['fünf', 'cinq'], ['sechs', 'six'], ['sieben', 'sept'], ['acht', 'huit'], ['neun', 'neuf'], ['zehn', 'dix'],
                ['elf, eilf', 'onze'], ['zwölf', 'douze'], ['zwanzig', 'vingt'], ['dreißig, dreissig', 'trente'], ['vierzig', 'quarante'], ['fünfzig', 'cinquante'],
                ['sechzig', 'soixante'], ['siebzig, siebenzig', 'soixante-dix'], ['achtzig', 'quatre-vingts'], ['neunzig', 'quatre-vingt-dix'], ['hundert', 'cent'], ['tausend', 'mille'],
                ['achtzehnhundert', 'mil huit cent (1800)'], ['siebzehnhundert', 'mil sept cent (1700)'],
                ['ersten, zweiten, dritten', 'le premier, le deuxième, le troisième (jour)', '« den 3ten » = le 3'], ['Jahr, Jahre, Jahren', 'an, ans'],
                ['einundzwanzig', 'vingt et un (on dit « un et vingt »)'], ['Stunde', 'heure'],
            ]),
            ...R('metier', 'general', [
                ['Bauer', 'paysan, cultivateur'], ['Ackermann', 'laboureur'], ['Tagelöhner, Taglöhner', 'journalier'], ['Häusler', 'petit paysan qui a une maison mais presque pas de terre'],
                ['Knecht', 'valet de ferme'], ['Magd', 'servante'], ['Müller', 'meunier'], ['Bäcker, Becker', 'boulanger'], ['Schmied', 'forgeron'],
                ['Schuster, Schuhmacher', 'cordonnier'], ['Schneider', 'tailleur'], ['Weber', 'tisserand'], ['Zimmermann', 'charpentier'], ['Maurer', 'maçon'],
                ['Wirt, Wirth', 'aubergiste'], ['Metzger, Fleischer', 'boucher'], ['Schäfer', 'berger'], ['Hirt, Hirte', 'pâtre, gardien de troupeau'],
                ['Lehrer, Schullehrer, Schulmeister', 'instituteur'], ['Kaufmann', 'marchand, négociant'], ['Krämer', 'petit commerçant, épicier'], ['Fuhrmann', 'voiturier, charretier'],
                ['Tischler, Schreiner', 'menuisier'], ['Böttcher, Küfer', 'tonnelier'], ['Wagner', 'charron'], ['Soldat', 'soldat'], ['Förster', 'garde forestier'],
            ]),
            ...R('abrev', 'general', [
                ['geb.', 'geboren, geborene : né, née (nom de jeune fille)'], ['get.', 'getauft : baptisé'], ['gest.', 'gestorben : mort'], ['begr.', 'begraben : enterré'],
                ['cop.', 'copuliert : marié'], ['sel.', 'selig : feu, défunt'], ['Wwe., Wwr.', 'Witwe, Witwer : veuve, veuf'], ['ev., kath.', 'evangelisch, katholisch : protestant, catholique'],
                ['m̄, n̄ (trait sur m ou n)', 'mm, nn : la lettre est doublée (« kom̄en » = kommen)'],
            ]),
            ...R('formule', 'bapteme', [
                ['Im Jahre Christi … den …', 'En l’an du Christ …, le …'],
                ['ist geboren und den … getauft worden', 'est né et a été baptisé le …'],
                ['ehelicher Sohn des … und der …', 'fils légitime de … et de … (« der » : la mère, souvent suivie de « geb. » et son nom de jeune fille)'],
                ['Taufpaten waren …', 'les parrains furent …'],
            ]),
            ...R('formule', 'mariage', [
                ['wurden ehelich getraut', 'furent unis par le mariage'], ['nach dreimaligem Aufgebot', 'après trois publications des bans'],
            ]),
            ...R('formule', 'sepulture', [
                ['starb … und wurde den … begraben', 'mourut … et fut enterré le …'], ['alt … Jahre … Monate … Tage', 'âgé de … ans … mois … jours'],
            ]),
            ...R('formule', 'general', [
                ['Vor dem unterzeichneten Standesbeamten erschien heute', 'Devant l’officier de l’état civil soussigné a comparu aujourd’hui (état civil après 1874-1876)'],
                ['der Persönlichkeit nach bekannt', 'connu personnellement (de l’officier)'], ['und zeigte an, dass …', 'et a déclaré que …'],
                ['Vorgelesen, genehmigt und unterschrieben', 'lu, approuvé et signé (fin d’un acte d’état civil)'],
            ]),
        ],
        // Kurrent : dessins maison (formes simplifiées de l'écriture des registres)
        glyphs: {
            de_e: ['M10 44 L13 30 L16 44', 'M16 44 L19 30 L22 44'],
            de_n: ['M8 44 L12 30 L17 44', 'M17 44 L21 30 L26 44'],
            de_u: ['M8 44 L12 30 L17 44', 'M17 44 L21 30 L26 44', 'M11 20 C14 25 21 25 24 20'],
            de_h: ['M14 8 L14 44', 'M14 34 C17 28 24 28 24 34 L24 46 C24 56 16 60 12 54 C10 50 16 46 24 48'],
            de_sfin: ['M24 30 C17 26 12 31 17 35 C24 39 25 45 18 46 C12 47 10 43 12 40'],
            de_ss: ['M14 58 L14 18 C14 8 24 6 26 14 C27 20 20 24 18 25 C26 27 28 34 24 40 C21 44 17 44 15 42'],
            de_mm: ['M5 44 L9 30 L13 44', 'M13 44 L17 30 L21 44', 'M21 44 L25 30 L29 44', 'M8 20 L28 20'],
            de_uml: ['M12 22 L14 16', 'M22 22 L24 16', 'M10 44 L13 30 L16 44', 'M16 44 L19 30 L22 44'],
        },
        widths: {de_mm: 36},
        letters: [
            {id: 'de_e', name: 'e de la Kurrent', seen: ['de_e'], read: 'e', cmp: ['n'], note: 'En Kurrent (écriture allemande ancienne), le e ressemble à un petit n étroit : deux petits traits pointus. C’est le piège le plus courant.', keys: 'kurrent sütterlin e n allemand'},
            {id: 'de_u', name: 'u avec son petit arc', seen: ['de_u'], read: 'u', cmp: ['de_n'], note: 'Le u et le n se ressemblent (des petits traits) : le u porte un petit arc au-dessus (« u-Bogen ») pour le reconnaître.', keys: 'kurrent sütterlin u n bogen'},
            {id: 'de_h', name: 'h bouclé sous la ligne', seen: ['de_h'], read: 'h', cmp: [], note: 'Le h de la Kurrent descend sous la ligne en faisant une boucle.', keys: 'kurrent h boucle'},
            {id: 'de_sfin', name: 's de fin de mot', seen: ['de_sfin'], read: 's', cmp: ['slong'], note: 'Au début et au milieu du mot : le s long (ſ). À la fin du mot : un petit s rond, fermé comme un 6 couché.', keys: 'kurrent s long rond fin schluss-s'},
            {id: 'de_ss', name: 'ß (eszett)', seen: ['de_ss'], read: 'ss', cmp: ['b'], note: 'Le ß vient d’un s long suivi d’un z : « Fuß » = Fuss. Dans la recherche, ß et ss sont pareils.', keys: 'eszett ss scharfes s kurrent'},
            {id: 'de_mm', name: 'trait sur m ou n', seen: ['de_mm'], read: 'mm, nn', cmp: [], note: 'Un trait au-dessus du m ou du n veut dire qu’il est doublé : « kom̄en » = kommen.', keys: 'kurrent trait m n double'},
            {id: 'de_uml', name: 'trémas ä, ö, ü', seen: ['de_uml'], read: 'ä, ö, ü', cmp: [], note: 'Les trémas s’écrivent souvent comme deux petits traits, ou un petit e au-dessus ; on trouve aussi « ae, oe, ue » (Mueller = Müller). La recherche ne tient pas compte des trémas.', keys: 'trema umlaut ae oe ue kurrent'},
            {id: 'de_sutterlin', name: 'Kurrent et Sütterlin', seen: ['de_e', 'de_n'], read: '—', cmp: [], note: 'La Kurrent est penchée et pointue (jusqu’au début du XXe siècle). La Sütterlin, plus droite et arrondie, a été enseignée en Allemagne à partir de 1915 et abandonnée en 1941. Les mêmes pièges (e / n, u / n) valent pour les deux.', keys: 'kurrent sütterlin écriture allemande'},
        ],
        exercises: [
            {id: 'de_taufe1823', icon: '👶', title: 'Une Taufe (baptême) de 1823', level: 'moyen', acte: 'bapteme', year: 1823,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « Hornung » est l’ancien nom de février ; « geb. » = née.',
                src: 'Im Jahre Christi 1823 den 14ten=14ten|vierzehnten Hornung=Hornung|Februar ist geboren und den 15ten=15ten|fünfzehnten getauft worden Johann Georg ehelicher Sohn des Michael Weber Bauer allhier und der Anna Maria geb.=geborene|geborenen Schmidt Pathen=Pathen|Paten waren Georg Müller Schmied und deſſen=dessen Ehefrau Barbara',
                notes: {Hornung: 'Hornung = février (ancien nom allemand)', 'geb.': 'geb. = geborene : née (son nom de jeune fille suit)', 'deſſen': 'ſ (s long) = s', Pathen: 'Pathe, Pathen : parrain(s), ancienne orthographe de Pate'}},
            {id: 'de_tod1867', icon: '⚱️', title: 'Un décès de 1867', level: 'facile', acte: 'sepulture', year: 1867,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « Wittwe » = veuve, « alt » = âgée de.',
                src: 'Den 3ten=3ten|dritten Jänner=Jänner|Januar 1867 ſtarb=starb Anna Katharina Weber Wittwe=Wittwe|Witwe des verſtorbenen=verstorbenen Johann Weber Taglöhners=Taglöhners|Tagelöhners alt 72 Jahre und wurde den 5ten=5ten|fünften begraben',
                notes: {'Jänner': 'Jänner = janvier (Autriche, Bavière)', Wittwe: 'Wittwe = Witwe : veuve', 'ſtarb': 'ſ (s long) = s'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — German Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/German_Genealogical_Word_List'},
            {label: 'GenWiki (genealogy.net) — Kurrentschrift, Sütterlinschrift, Alte Monatsnamen', url: 'https://wiki.genealogy.net/Kurrent'},
            {label: 'FamilySearch Research Wiki — German Handwriting', url: 'https://www.familysearch.org/en/wiki/German_Handwriting'},
        ],
    };
})());
