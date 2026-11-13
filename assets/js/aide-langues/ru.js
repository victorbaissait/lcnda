/* 📜 Aide à la lecture — Russe (métriques orthodoxes « метрические книги », registres de l’Empire russe ; orthographe d’avant 1918).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    /* ── Lettres latines : [à la française, à l'anglaise, ISO 9 sans signes] ; lettres d'avant 1918 comprises (ѣ, і, ѳ, ѵ, ъ) ── */
    const TR = {
        'а': ['a', 'a', 'a'], 'б': ['b', 'b', 'b'], 'в': ['v', 'v', 'v'], 'г': ['g', 'g', 'g'], 'д': ['d', 'd', 'd'], 'е': ['e', 'e', 'e'], 'ё': ['io', 'yo', 'e'],
        'ж': ['j', 'zh', 'z'], 'з': ['z', 'z', 'z'], 'и': ['i', 'i', 'i'], 'й': ['i', 'y', 'j'], 'к': ['k', 'k', 'k'], 'л': ['l', 'l', 'l'], 'м': ['m', 'm', 'm'],
        'н': ['n', 'n', 'n'], 'о': ['o', 'o', 'o'], 'п': ['p', 'p', 'p'], 'р': ['r', 'r', 'r'], 'с': ['s', 's', 's'], 'т': ['t', 't', 't'], 'у': ['ou', 'u', 'u'],
        'ф': ['f', 'f', 'f'], 'х': ['kh', 'kh', 'h'], 'ц': ['ts', 'ts', 'c'], 'ч': ['tch', 'ch', 'c'], 'ш': ['ch', 'sh', 's'], 'щ': ['chtch', 'shch', 's'],
        'ъ': ['', '', ''], 'ы': ['y', 'y', 'y'], 'ь': ['', '', ''], 'э': ['e', 'e', 'e'], 'ю': ['iou', 'yu', 'ju'], 'я': ['ia', 'ya', 'ja'],
        'ѣ': ['e', 'e', 'e'], 'і': ['i', 'i', 'i'], 'ѳ': ['f', 'f', 'f'], 'ѵ': ['i', 'i', 'y'], 'ѕ': ['dz', 'dz', 'dz'],
    };
    const translit = word => {
        const w = String(word || '').toLowerCase().normalize('NFC');
        if (!/[Ѐ-ӿ]/.test(w)) return [];
        const out = [0, 1, 2].map(i => [...w].map(c => (TR[c] ? TR[c][i] : c)).join('').replace(/[^a-z0-9' -]/g, ''));
        return [...new Set(out.filter(Boolean))];
    };
    /* ── Les nombres en lettres cyrilliques (avec le titlo ҃ ; ҂ = mille) ── */
    const U = ['', 'а', 'в', 'г', 'д', 'е', 'ѕ', 'з', 'и', 'ѳ'], T = ['', 'і', 'к', 'л', 'м', 'н', 'ѯ', 'о', 'п', 'ч'], H = ['', 'р', 'с', 'т', 'у', 'ф', 'х', 'ѱ', 'ѿ', 'ц'];
    const VAL = {}; U.forEach((c, i) => c && (VAL[c] = i)); T.forEach((c, i) => c && (VAL[c] = i * 10)); H.forEach((c, i) => c && (VAL[c] = i * 100));
    Object.assign(VAL, {'ѡ': 800, 'ѵ': 400, 'ꙋ': 400, 'ꙃ': 6, 'ꙁ': 7});
    function toCyr(n) {
        n = Math.floor(Number(n)); if (!(n > 0 && n < 1000000)) return '';
        const part = k => { const h = Math.floor(k / 100), r = k % 100, t = Math.floor(r / 10), u = r % 10; return H[h] + (t === 1 ? U[u] + T[1] : T[t] + U[u]); };
        const th = Math.floor(n / 1000), rest = n % 1000;
        let s = (th ? [...part(th)].map(c => '҂' + c).join('') : '') + part(rest);
        const letters = [...s].filter(c => c !== '҂'); if (!letters.length) return '';
        // le titlo sur l'avant-dernière lettre (sur la seule lettre s'il n'y en a qu'une)
        let idx = -1, seen = 0; const target = letters.length > 1 ? letters.length - 2 : 0;
        const arr = [...s]; arr.forEach((c, i) => { if (c !== '҂') { if (seen === target) idx = i; seen++; } });
        arr.splice(idx + 1, 0, '҃'); return arr.join('');
    }
    function fromCyr(s) {
        const chars = [...String(s || '').toLowerCase().normalize('NFC').replace(/[҃-҇\s.·:]/g, '')];
        if (!chars.length) return null; let sum = 0, mult = 1;
        for (const c of chars) { if (c === '҂') { mult = 1000; continue; } if (!(c in VAL)) return null; sum += VAL[c] * mult; mult = 1; }
        return sum || null;
    }
    return {
        code: 'ru', name: 'Russe', native: 'Русский', icon: '🇷🇺', script: 'cyrillique', dir: 'ltr', ocr: ['rus'],
        intro: 'Métriques des paroisses orthodoxes de l’Empire russe (aussi en Ukraine, Biélorussie, Pologne de l’Est, pays baltes) : trois parties — naissances, mariages, décès. Avant 1918, l’orthographe a des lettres en plus (ѣ, і, ѳ, ѵ) et un ъ muet à la fin des mots. Les dates sont dans le calendrier julien : ajoute 12 jours au XIXe siècle, 13 jours de 1900 à 1918.',
        translit,
        entries: [
            ...R('mot', 'bapteme', [
                ['родился, родилась', 'est né, est née'], ['родившіеся, родившиеся', 'les naissances (première partie du registre)', '', ['родившиеся']],
                ['крещенъ, крещена, крещен', 'baptisé, baptisée', '', ['крещен']], ['крещеніе, крещение', 'baptême', '', ['крещение']],
                ['младенецъ, младенец', 'le nouveau-né, le petit enfant', '', ['младенец']],
                ['мужескаго пола, мужского пола', 'de sexe masculin'], ['женскаго пола, женского пола', 'de sexe féminin'],
                ['законный, законная', 'légitime (« законная жена » : épouse légitime)'], ['незаконнорожденный, незаконнорожденная', 'né(e) hors mariage'],
                ['восприемники, воспріемники', 'parrain et marraine (ceux qui reçoivent l’enfant des fonts)', '', ['восприемники']],
                ['крестный, крестная', 'parrain, marraine'], ['близнецы', 'jumeaux'], ['подкидышъ, подкидыш', 'enfant trouvé', '', ['подкидыш']],
            ]),
            ...R('mot', 'mariage', [
                ['бракосочетавшіеся, бракосочетавшиеся', 'les mariages (deuxième partie du registre)', '', ['бракосочетавшиеся']],
                ['бракъ, брак', 'mariage', '', ['брак']], ['повѣнчаны, повенчаны', 'mariés (à l’église)', '', ['повенчаны']], ['вѣнчаніе, венчание', 'mariage religieux (le « couronnement »)', '', ['венчание']],
                ['женихъ, жених', 'le fiancé, le marié', '', ['жених']], ['невѣста, невеста', 'la fiancée, la mariée', '', ['невеста']],
                ['первымъ бракомъ, первым браком', 'en premier mariage', '', ['первым браком']], ['вторымъ бракомъ, вторым браком', 'en second mariage', '', ['вторым браком']],
                ['дѣвица, девица', 'jeune fille (jamais mariée)', '', ['девица']], ['холостъ, холост', 'célibataire (homme)', '', ['холост']],
                ['вдовецъ, вдовец', 'veuf', '', ['вдовец']], ['вдова', 'veuve'], ['поручители', 'les garants, témoins du mariage'], ['лѣта, лета', 'l’âge (« лета жениха » : âge du marié)', '', ['лета']],
            ]),
            ...R('mot', 'deces', [
                ['умершіе, умершие', 'les décès (troisième partie du registre)', '', ['умершие']], ['умеръ, умер, умерла', 'est mort, est morte', '', ['умер']],
                ['погребенъ, погребен, погребена', 'enterré(e)', '', ['погребен']], ['кладбище', 'cimetière'], ['отпѣвалъ, отпевал', 'a dit l’office des morts', '', ['отпевал']],
                ['отъ чего умеръ, от чего умер', 'de quoi il est mort (colonne de la cause)', '', ['от чего умер']], ['отъ старости, от старости', 'de vieillesse', '', ['от старости']],
                ['чахотка', 'phtisie, tuberculose'], ['оспа', 'variole'], ['лихорадка', 'fièvre'], ['младенецъ мертворожденный', 'enfant mort-né'],
            ]),
            ...R('mot', 'general', [
                ['метрическая книга', 'registre des « métriques » (registre paroissial)'], ['церковь', 'église'], ['приходъ, приход', 'paroisse', '', ['приход']],
                ['село', 'village avec une église'], ['деревня', 'village (sans église)'], ['губернія, губерния', 'gouvernement (grande province)', '', ['губерния']],
                ['уѣздъ, уезд', 'district', '', ['уезд']], ['волость', 'canton rural'], ['православный, православная', 'orthodoxe'], ['вѣроисповѣданіе, вероисповедание', 'religion', '', ['вероисповедание']],
                ['званіе, звание', 'condition sociale (paysan, bourgeois…)', '', ['звание']], ['священникъ, священник', 'prêtre', '', ['священник']], ['діаконъ, дьякон', 'diacre', '', ['дьякон']],
                ['псаломщикъ, псаломщик', 'chantre, lecteur (aide du prêtre qui tient souvent le registre)', '', ['псаломщик']], ['отчество', 'patronyme (nom du père : Иванович = fils d’Ivan)'],
                ['сынъ, сын', 'fils (« Ивановъ сынъ » = fils d’Ivan)', '', ['сын']], ['его, ея, ее', 'son, sa (« жена его » = sa femme ; ея = d’elle, ancienne orthographe)'],
                ['ст. ст., старый стиль', 'ancien style : calendrier julien'], ['н. ст., новый стиль', 'nouveau style : calendrier grégorien'],
            ]),
            ...R('parente', 'general', [
                ['отецъ, отец', 'père', '', ['отец']], ['мать', 'mère'], ['родители', 'parents'], ['сынъ, сын', 'fils', '', ['сын']], ['дочь', 'fille'],
                ['братъ, брат', 'frère', '', ['брат']], ['сестра', 'sœur'], ['дѣдъ, дед', 'grand-père', '', ['дед']], ['бабка, бабушка', 'grand-mère'], ['внукъ, внук, внучка', 'petit-fils, petite-fille', '', ['внук']],
                ['дядя', 'oncle'], ['тётка, тетя', 'tante'], ['племянникъ, племянник, племянница', 'neveu, nièce', '', ['племянник']], ['мужъ, муж', 'mari', '', ['муж']], ['жена', 'épouse'],
                ['тесть, тёща', 'beau-père, belle-mère (parents de l’épouse)'], ['свёкоръ, свекор, свекровь', 'beau-père, belle-mère (parents du mari)', '', ['свекор']],
                ['зять', 'gendre (aussi beau-frère)'], ['невѣстка, невестка, сноха', 'belle-fille (épouse du fils)', '', ['невестка']], ['пасынокъ, пасынок, падчерица', 'beau-fils, belle-fille (enfant du conjoint)', '', ['пасынок']],
                ['крестникъ, крестник, крестница', 'filleul, filleule', '', ['крестник']],
            ]),
            ...R('mois', 'general', [
                ['январь, января, генварь, генваря', 'janvier (« генварь » : forme ancienne)'], ['февраль, февраля', 'février'], ['мартъ, март, марта', 'mars', '', ['март']],
                ['апрѣль, апрель, апрѣля', 'avril', '', ['апрель', 'апреля']], ['май, мая', 'mai'], ['іюнь, июнь, іюня', 'juin', '', ['июнь', 'июня']], ['іюль, июль, іюля', 'juillet', '', ['июль', 'июля']],
                ['августъ, август, августа', 'août', '', ['август']], ['сентябрь, сентября', 'septembre'], ['октябрь, октября', 'octobre'], ['ноябрь, ноября', 'novembre'], ['декабрь, декабря', 'décembre'],
                ['янв., февр., сент., окт., нояб., дек.', 'mois abrégés'], ['число', 'le jour du mois (la date)'], ['годъ, год, года', 'année', '', ['год']],
            ]),
            ...R('nombre', 'general', [
                ['одинъ, один, одна', 'un, une', '', ['один']], ['два, двѣ, две', 'deux', '', ['две']], ['три', 'trois'], ['четыре', 'quatre'], ['пять', 'cinq'], ['шесть', 'six'],
                ['семь', 'sept'], ['восемь', 'huit'], ['девять', 'neuf'], ['десять', 'dix'], ['одиннадцать', 'onze'], ['двѣнадцать, двенадцать', 'douze', '', ['двенадцать']],
                ['двадцать', 'vingt'], ['тридцать', 'trente'], ['сорокъ, сорок', 'quarante', '', ['сорок']], ['пятьдесятъ, пятьдесят', 'cinquante', '', ['пятьдесят']],
                ['шестьдесятъ, шестьдесят', 'soixante', '', ['шестьдесят']], ['семьдесятъ, семьдесят', 'soixante-dix', '', ['семьдесят']], ['восемьдесятъ, восемьдесят', 'quatre-vingts', '', ['восемьдесят']],
                ['девяносто', 'quatre-vingt-dix'], ['сто', 'cent'], ['тысяча', 'mille'], ['первое, второе, третье', 'le premier, le deuxième, le troisième (jour)'],
                ['лѣтъ, лет, года', 'ans (« 45 лѣтъ » = 45 ans ; « 2 года » = 2 ans)', '', ['лет']], ['мѣсяцевъ, месяцев, дней', 'mois, jours (âge d’un petit enfant)', '', ['месяцев']],
                ['҂аѿв҃і (lettres-nombres)', '1812 écrit en lettres avec le titlo ҃ (҂ = mille) : 🔢 convertisseur ci-dessous'],
            ]),
            ...R('metier', 'general', [
                ['крестьянинъ, крестьянин, крестьянка', 'paysan, paysanne', '', ['крестьянин']], ['мѣщанинъ, мещанин, мещанка', 'bourgeois d’une ville (petit citadin)', '', ['мещанин']],
                ['купецъ, купец', 'marchand (inscrit dans une guilde)', '', ['купец']], ['дворянинъ, дворянин', 'noble', '', ['дворянин']], ['однодворецъ, однодворец', 'petit propriétaire libre (ancien service de l’État)', '', ['однодворец']],
                ['казакъ, казак', 'cosaque', '', ['казак']], ['солдатъ, солдат', 'soldat', '', ['солдат']], ['унтеръ-офицеръ, унтер-офицер', 'sous-officier', '', ['унтер-офицер']],
                ['отставной', 'à la retraite, libéré (soldat)'], ['кузнецъ, кузнец', 'forgeron', '', ['кузнец']], ['сапожникъ, сапожник', 'cordonnier', '', ['сапожник']],
                ['портной', 'tailleur'], ['плотникъ, плотник', 'charpentier', '', ['плотник']], ['мельникъ, мельник', 'meunier', '', ['мельник']], ['учитель', 'instituteur'], ['писарь', 'greffier, écrivain'],
            ]),
            ...R('formule', 'bapteme', [
                ['Звание, имя, отчество и фамилия родителей и какого вероисповедания', 'Condition, prénom, patronyme et nom des parents, et leur religion (titre de colonne)'],
                ['Кто совершалъ таинство крещенія', 'Qui a célébré le sacrement du baptême (titre de colonne)', '', ['Кто совершал таинство крещения']],
                ['и законная жена его', 'et son épouse légitime'],
            ]),
            ...R('formule', 'mariage', [
                ['Кто были поручители', 'Qui furent les garants (témoins du mariage)'], ['Лѣта брачущихся', 'âge des mariés', '', ['Лета брачущихся']],
            ]),
            ...R('formule', 'deces', [
                ['Отъ чего умеръ', 'De quoi il est mort (colonne de la cause)', '', ['От чего умер']], ['Гдѣ погребенъ', 'Où il a été enterré', '', ['Где погребен']],
            ]),
        ],
        // l'écriture manuscrite russe : dessins maison simplifiés des formes qui trompent
        glyphs: {
            ru_t: ['M7 26 L7 46', 'M7 33 C9 26 17 26 17 33 L17 46', 'M17 33 C19 26 27 26 27 33 L27 46'],
            ru_i: ['M12 26 L12 40 C12 47 22 47 24 40', 'M24 26 L24 40 C24 47 30 47 31 44'],
            ru_p: ['M12 26 L12 46', 'M12 33 C14 26 24 26 24 33 L24 46'],
            ru_d: ['M26 30 C22 25 13 27 13 37 C13 46 24 46 26 38', 'M26 28 L26 52 C26 59 15 59 13 54'],
            ru_sh: ['M7 26 L7 40 C7 47 15 47 17 40', 'M17 26 L17 40 C17 47 25 47 27 40', 'M27 26 L27 46'],
            ru_b: ['M28 10 C20 8 13 22 13 36 C13 46 25 48 27 38 C28 30 17 28 14 34'],
            ru_yat: ['M18 10 L18 46', 'M10 20 L26 20', 'M18 32 C31 30 31 46 18 46'],
            ru_er: ['M8 28 L15 28 L15 46', 'M15 34 C27 32 27 46 15 46'],
            ru_fita: ['M20 10 C9 10 9 46 20 46 C31 46 31 10 20 10', 'M12 28 L28 28'],
            ru_titlo: ['M8 18 L12 13 L28 13 L32 8', 'M14 46 L14 28', 'M22 46 L22 28'],
        },
        widths: {},
        letters: [
            {id: 'ru_t', name: 'т manuscrit (comme un m)', seen: ['ru_t'], read: 'т (t)', cmp: ['m'], note: 'À la main, le т minuscule s’écrit comme un m latin (parfois avec un trait au-dessus) : « mnm » peut se lire « тит ».', keys: 'cyrillique manuscrit t te m'},
            {id: 'ru_i', name: 'и manuscrit (comme un u)', seen: ['ru_i'], read: 'и (i)', cmp: ['u'], note: 'Le и s’écrit comme un u latin ; le й porte un petit arc au-dessus.', keys: 'cyrillique manuscrit i u й'},
            {id: 'ru_p', name: 'п manuscrit (comme un n)', seen: ['ru_p'], read: 'п (p)', cmp: ['n'], note: 'Le п s’écrit comme un n latin : « nana » = « папа ».', keys: 'cyrillique manuscrit p n'},
            {id: 'ru_d', name: 'д manuscrit (comme un g)', seen: ['ru_d'], read: 'д (d)', cmp: ['g'], note: 'Le д descend sous la ligne avec une boucle, comme un g (ou monte comme un ∂).', keys: 'cyrillique manuscrit d g'},
            {id: 'ru_sh', name: 'ш manuscrit (trois jambages)', seen: ['ru_sh'], read: 'ш (ch)', cmp: ['m', 'ru_t'], note: 'Le ш fait trois petits traits ouverts en haut, souvent avec un trait dessous ; ne le confonds pas avec le т (ouvert en bas).', keys: 'cyrillique manuscrit ch sh ш т'},
            {id: 'ru_b', name: 'б manuscrit (comme un 6)', seen: ['ru_b'], read: 'б (b)', cmp: ['d'], note: 'Le б ressemble à un 6 ou à un δ.', keys: 'cyrillique manuscrit b 6'},
            {id: 'ru_yat', name: 'ѣ (yat, avant 1918)', seen: ['ru_yat'], read: 'е (e)', cmp: ['ru_er'], note: 'Lettre supprimée en 1918 : elle se lit е aujourd’hui. « дѣвица » = девица (jeune fille), « лѣтъ » = лет (ans).', keys: 'yat ѣ e orthographe ancienne 1918'},
            {id: 'ru_er', name: 'ъ à la fin des mots', seen: ['ru_er'], read: '(rien)', cmp: ['ru_yat'], note: 'Avant 1918, tout mot terminé par une consonne prend un ъ muet : « Петръ » = Петр, « крестьянинъ » = крестьянин. Ne le lis pas.', keys: 'ъ signe dur er final 1918 muet'},
            {id: 'ru_fita', name: 'ѳ (fita) et і', seen: ['ru_fita', 'i'], read: 'ф (f), и (i)', cmp: ['o'], note: 'ѳ se lit ф : « Ѳедоръ » = Фёдор (Fiodor). і se lit и (devant une voyelle : « Марія » = Мария). ѵ (rare) se lit aussi и.', keys: 'fita ѳ f і i ѵ orthographe ancienne'},
            {id: 'ru_titlo', name: 'titlo (҃) : abréviation ou nombre', seen: ['ru_titlo'], read: 'abréviation, nombre', cmp: [], note: 'Le petit trait ondulé au-dessus marque un mot abrégé (« Бг҃ъ » = Богъ, Dieu) ou un nombre écrit en lettres (« в҃і » = 12).', keys: 'titlo abréviation nombre lettre slavon'},
        ],
        exercises: [
            {id: 'ru_rod1885', icon: '👶', title: 'Une naissance de 1885 (métrique)', level: 'moyen', acte: 'bapteme', year: 1885,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple), en orthographe d’avant 1918. Écris en cyrillique d’aujourd’hui ou en lettres latines : enlève le ъ final, ѣ → е, і → и, ѳ → ф.',
                src: 'Января 15 родился 17 крещенъ=крещен Іоаннъ=Иоанн Родители деревни Ивановки крестьянинъ=крестьянин Петръ=Петр Васильевъ=Васильев Сидоровъ=Сидоров и законная жена его Марія=Мария Ѳедорова=Федорова оба православные Воспріемники=Восприемники крестьянинъ=крестьянин Николай Ивановъ=Иванов и дѣвица=девица Анна Петрова',
                notes: {'крещенъ': 'ъ final : on ne le lit pas', 'Іоаннъ': 'І = И ; ъ final muet', 'Марія': 'і = и', 'Ѳедорова': 'Ѳ (fita) = Ф', 'дѣвица': 'ѣ (yat) = е', 'Воспріемники': 'і = и'}},
            {id: 'ru_um1902', icon: '⚱️', title: 'Un décès de 1902 (métrique)', level: 'facile', acte: 'deces', year: 1902,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « отъ старости » = de vieillesse.',
                src: 'Марта 3 умерла 5 погребена крестьянская вдова Екатерина Иванова 70 лѣтъ=лет отъ=от старости',
                notes: {'лѣтъ': 'ѣ = е, ъ final muet : лет = ans', 'отъ': 'ъ final muet'}},
        ],
        numerals: {label: 'Nombres en lettres cyrilliques (slavon)', to: toCyr, from: fromCyr, examples: ['҂аѿв҃і', '1812', 'в҃і', '12']},
        sources: [
            {label: 'FamilySearch Research Wiki — Russian Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Russian_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Russia Church Records (metrical books)', url: 'https://www.familysearch.org/en/wiki/Russia_Church_Records'},
            {label: 'FamilySearch Research Wiki — Russian Handwriting', url: 'https://www.familysearch.org/en/wiki/Russian_Handwriting'},
            {label: 'Shea & Hoffman, « In Their Words » vol. III : Russian (traduction des documents généalogiques)', url: 'https://www.langline.com/'},
            {label: 'Norme ISO 9 (translittération du cyrillique)', url: 'https://www.iso.org/standard/3589.html'},
        ],
    };
})());
