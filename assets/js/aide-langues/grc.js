/* 📜 Aide à la lecture — Grec ancien et grec d'Église (registres des paroisses orthodoxes, katharévousa, inscriptions).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé).
 * En plus du format commun : `alphabet` (le tableau des lettres) et `numerals` (numération alphabétique α΄ = 1 … ͵α = 1000). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    /* ── Lettres latines : plusieurs écritures, pour que « huios », « yios » ou « ios » trouvent υἱός ── */
    const CLASSIC = {α: 'a', β: 'b', ϐ: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'e', θ: 'th', ϑ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'ph', χ: 'ch', ψ: 'ps', ω: 'o', ϛ: 'st', ϝ: 'w', ϟ: 'q', ϙ: 'q', ϡ: 'ss', ϗ: 'kai'};
    const DIG = [['γγ', 'ng'], ['γκ', 'nk'], ['γξ', 'nx'], ['γχ', 'nch'], ['ου', 'ou']];
    const DIG_MODERN = [['ου', 'ou'], ['ει', 'i'], ['οι', 'i'], ['υι', 'i'], ['αι', 'e'], ['γγ', 'ng'], ['μπ', 'b'], ['ντ', 'd'], ['αυ', 'av'], ['ευ', 'ev']];
    function translit(word) {
        const n = String(word || '').normalize('NFD'), rough = /̔/.test(n);
        const b = n.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/[ʹ͵΄᾽᾿'’.]/g, '');
        if (!/[α-ωϐϑϛϝϟϙϡϗ]/.test(b)) return [];
        const conv = (map, dig) => { let s = b; dig.forEach(([k, v]) => { s = s.split(k).join(v); }); return [...s].map(c => map[c] ?? c).join(''); };
        const y = conv(CLASSIC, DIG), u = conv({...CLASSIC, υ: 'u'}, DIG), modern = conv({...CLASSIC, β: 'v', η: 'i', υ: 'i', χ: 'h'}, DIG_MODERN);
        const out = new Set(); [y, u].forEach(v => { if (rough) out.add(`h${v}`); out.add(v); }); out.add(modern);
        return [...out];
    }
    /* ── La numération alphabétique : α΄ = 1 … θ΄ = 9, ι΄ = 10 … ϟ΄ = 90, ρ΄ = 100 … ϡ΄ = 900, ͵α = 1000 ── */
    const U = ['', 'α', 'β', 'γ', 'δ', 'ε', 'ϛ', 'ζ', 'η', 'θ'], T = ['', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ϟ'], H = ['', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω', 'ϡ'];
    const VAL = {}; U.forEach((c, i) => { if (c) VAL[c] = i; }); T.forEach((c, i) => { if (c) VAL[c] = i * 10; }); H.forEach((c, i) => { if (c) VAL[c] = i * 100; });
    Object.assign(VAL, {ϙ: 90, ϝ: 6, ς: 6, ϲ: 200}); // koppa ancien, digamma (6), stigma écrit comme un ς, sigma lunaire
    const small = n => H[Math.floor(n / 100)] + T[Math.floor(n / 10) % 10] + U[n % 10];
    /** 1852 → « ͵αωνβʹ » (1 à 999 999) */
    function toGreek(n) {
        n = Math.floor(Number(n)); if (!(n >= 1 && n <= 999999)) return '';
        const th = Math.floor(n / 1000), rest = n % 1000;
        return (th ? [...small(th)].map(c => `͵${c}`).join('') : '') + (rest ? small(rest) : '') + 'ʹ';
    }
    /** « ͵αωνβʹ », « αωνβ΄ », « ιϛ », « ιστ » → 1852, 1852, 16, 16 ; sinon null */
    function fromGreek(s) {
        let t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '').replace(/[ʹ΄'’`´]+$/g, '').replace(/στ/g, 'ϛ').replace(/[,]/g, '͵');
        if (!t || /[^α-ωϛϝϟϙϡϲ͵]/.test(t)) return null;
        let total = 0, thousand = false, any = false;
        for (const c of t) {
            if (c === '͵') { thousand = true; continue; }
            const v = VAL[c]; if (v == null) return null;
            total += thousand ? v * 1000 : v; thousand = false; any = true;
        }
        return any && !thousand ? total : null;
    }
    return {
        code: 'grc', name: 'Grec', native: 'Ἑλληνικά', icon: '🏺', script: 'grecque', dir: 'ltr', ocr: ['grc', 'ell'],
        intro: 'Registres des paroisses orthodoxes (Grèce, îles Ioniennes, Asie Mineure, communautés grecques de Marseille, de Corse — Cargèse —, de Trieste…) en grec d’Église ou en katharévousa, très proche du grec ancien ; aussi les inscriptions. Tu peux chercher en lettres grecques, sans accents ni esprits, ou en lettres latines (« huios », « yios »).',
        translit,
        alphabet: [
            ['Α', 'α', 'alpha', 'a', 1], ['Β', 'β ϐ', 'bêta', 'b (v en grec moderne)', 2], ['Γ', 'γ', 'gamma', 'g (γγ = ng)', 3], ['Δ', 'δ', 'delta', 'd', 4],
            ['Ε', 'ε', 'epsilon', 'e (é bref)', 5], ['Ϛ', 'ϛ', 'stigma', 'st (sert surtout pour le nombre 6)', 6], ['Ζ', 'ζ', 'zêta', 'z', 7], ['Η', 'η', 'êta', 'ê (i en grec moderne)', 8],
            ['Θ', 'θ ϑ', 'thêta', 'th', 9], ['Ι', 'ι', 'iota', 'i', 10], ['Κ', 'κ', 'kappa', 'k', 20], ['Λ', 'λ', 'lambda', 'l', 30], ['Μ', 'μ', 'mu', 'm', 40], ['Ν', 'ν', 'nu', 'n', 50],
            ['Ξ', 'ξ', 'xi', 'x (ks)', 60], ['Ο', 'ο', 'omicron', 'o (o bref)', 70], ['Π', 'π', 'pi', 'p', 80], ['Ϟ', 'ϟ ϙ', 'koppa', '(sert seulement pour le nombre 90)', 90],
            ['Ρ', 'ρ', 'rhô', 'r (ῥ au début du mot = rh)', 100], ['Σ', 'σ ς', 'sigma', 's (ς à la fin du mot)', 200], ['Τ', 'τ', 'tau', 't', 300], ['Υ', 'υ', 'upsilon', 'y ou u (ου = ou)', 400],
            ['Φ', 'φ', 'phi', 'ph (f)', 500], ['Χ', 'χ', 'khi', 'ch (kh)', 600], ['Ψ', 'ψ', 'psi', 'ps', 700], ['Ω', 'ω', 'oméga', 'ô (o long)', 800], ['Ϡ', 'ϡ', 'sampi', '(sert seulement pour le nombre 900)', 900],
        ].map(([big, small, name, latin, value]) => ({big, small, name, latin, value})),
        entries: [
            ...R('mot', 'bapteme', [
                ['ἐβαπτίσθη', 'fut baptisé, a été baptisé'], ['ἐβάπτισα', 'j’ai baptisé (le prêtre parle)'], ['βάπτισις, βάπτισμα', 'baptême'], ['ἐγεννήθη', 'est né, est née'], ['γέννησις', 'naissance'],
                ['τέκνον, παιδίον', 'enfant', '', ['τέκνου']], ['νόμιμος, νομίμων', 'légitime, légitimes (« νομίμων συζύγων » = époux légitimes)'], ['νόθος', 'illégitime, né hors mariage'],
                ['ἀνάδοχος', 'parrain ou marraine (celui qui « reçoit » l’enfant au sortir des fonts)', '« ἀναδόχου ὄντος τοῦ … » = le parrain étant …', ['ἀναδόχου']],
                ['νονός, νονά', 'parrain, marraine (mots de tous les jours)'], ['δίδυμοι', 'jumeaux'], ['ὄνομα', 'nom, prénom'], ['ἐκλήθη', 'fut appelé (reçut le prénom de)'],
            ]),
            ...R('mot', 'mariage', [
                ['γάμος', 'mariage', '', ['γάμον', 'γάμου']], ['ἐστεφάνωσα', 'j’ai couronné, j’ai marié (le mariage orthodoxe pose des couronnes sur les mariés)'], ['στέφανα', 'les couronnes : le mariage'],
                ['ηὐλόγησα, εὐλόγησα', 'j’ai béni (le mariage)'], ['μνηστεία, ἀρραβών', 'fiançailles'], ['νυμφίος', 'le marié, le fiancé'], ['νύμφη', 'la mariée (aussi : la belle-fille)'],
                ['σύζυγος', 'époux ou épouse', '', ['συζύγου']], ['σύζυγοι, συζύγων', 'les époux (le couple)'], ['ἀνήρ', 'mari, homme'], ['γυνή', 'femme, épouse'], ['ἄγαμος', 'célibataire, non marié'],
                ['χήρα', 'veuve'], ['χῆρος', 'veuf'], ['παράνυμφος', 'témoin du mariage'], ['κουμπάρος', 'témoin du mariage, parrain (mot de tous les jours)'], ['προίξ, προῖκα', 'dot'], ['ἄδεια', 'permission (de l’évêque, pour célébrer le mariage)'],
            ]),
            ...R('mot', 'sepulture', [
                ['ἐτελεύτησε', 'mourut, est mort'], ['ἀπεβίωσε', 'décéda'], ['ἐκοιμήθη', 's’est endormi (dans le Seigneur) : est mort'], ['θάνατος', 'la mort'],
                ['ἐτάφη', 'fut enterré'], ['ἔθαψα', 'j’ai enterré (le prêtre parle)'], ['ταφή', 'sépulture'], ['κηδεία', 'funérailles'], ['κοιμητήριον, νεκροταφεῖον', 'cimetière', '', ['κοιμητηρίῳ']],
                ['μακαρίτης', 'feu, le défunt (« le bienheureux »)'], ['ἐτῶν', 'âgé de … ans (« ἐτῶν ξʹ » = âgé de 60 ans)'], ['ἡλικία', 'âge'], ['ἀσθένεια', 'maladie'],
            ]),
            ...R('mot', 'general', [
                ['ἱερεύς', 'prêtre'], ['πρεσβύτερος', 'prêtre (titre)'], ['ἐφημέριος', 'curé de la paroisse'], ['ἐνορία', 'paroisse'], ['ναός, ἐκκλησία', 'église'],
                ['μητρόπολις', 'métropole (diocèse d’un archevêque)'], ['ἐπίσκοπος', 'évêque'], ['διάκονος', 'diacre'], ['μάρτυς, μάρτυρες', 'témoin, témoins'],
                ['ὁ ὑποφαινόμενος', 'le soussigné'], ['χωρίον', 'village', '', ['χωρίου']], ['κάτοικος', 'habitant'], ['ἐκ', 'de, originaire de'], ['δῆμος', 'commune (dème)'],
                ['ληξιαρχεῖον', 'bureau de l’état civil'], ['ληξιαρχική πρᾶξις', 'acte d’état civil'], ['ὁ δοῦλος τοῦ Θεοῦ, ἡ δούλη τοῦ Θεοῦ', 'le serviteur de Dieu, la servante de Dieu (avant le nom du baptisé ou du défunt)'],
                ['καί, ϗ', 'et'], ['τοῦ, τῆς', 'du, de la (« τοῦ Γεωργίου » = de Georges : le père est souvent au génitif)'], ['ἔτος, ἔτους', 'an, de l’an'],
                ['ἀπὸ κτίσεως κόσμου', 'depuis la création du monde (ère byzantine : retire 5508 ans, ou 5509 pour septembre à décembre, l’année commençant le 1er septembre)'],
                ['ἔτει σωτηρίῳ, σωτηρίου ἔτους', 'en l’an du salut (notre ère)'], ['ἰνδικτιῶνος', 'de l’indiction (cycle de 15 ans des dates byzantines)'],
            ]),
            ...R('parente', 'general', [
                ['πατήρ', 'père', '', ['πατρός']], ['μήτηρ', 'mère', '', ['μητρός']], ['γονεῖς', 'parents (le père et la mère)'], ['υἱός', 'fils', '', ['υἱοῦ']], ['θυγάτηρ', 'fille', '', ['θυγατρός']],
                ['ἀδελφός, ἀδελφή', 'frère, sœur'], ['πάππος, παππούς', 'grand-père'], ['μάμμη, γιαγιά', 'grand-mère'], ['ἔγγονος, ἐγγονή', 'petit-fils, petite-fille'],
                ['ἀνεψιός', 'neveu (en grec ancien : cousin)'], ['θεῖος, θεία', 'oncle, tante'], ['πενθερός, πενθερά', 'beau-père, belle-mère (parents du conjoint)'], ['γαμβρός', 'gendre (aussi beau-frère)'],
                ['ὀρφανός', 'orphelin'], ['χήρα', 'veuve'],
            ]),
            ...R('mois', 'general', [
                ['Ἰανουάριος, Ἰανουαρίου, Ἰαν.', 'janvier, de janvier'], ['Φεβρουάριος, Φεβρουαρίου, Φεβρ.', 'février'], ['Μάρτιος, Μαρτίου', 'mars'], ['Ἀπρίλιος, Ἀπριλίου', 'avril'],
                ['Μάϊος, Μαΐου', 'mai'], ['Ἰούνιος, Ἰουνίου', 'juin'], ['Ἰούλιος, Ἰουλίου', 'juillet'], ['Αὔγουστος, Αὐγούστου', 'août'], ['Σεπτέμβριος, Σεπτεμβρίου, Σεπτ.', 'septembre'],
                ['Ὀκτώβριος, Ὀκτωβρίου, Ὀκτ.', 'octobre'], ['Νοέμβριος, Νοεμβρίου, Νοεμ.', 'novembre'], ['Δεκέμβριος, Δεκεμβρίου, Δεκ.', 'décembre'],
                ['μήν, μηνός, μηνί', 'mois, du mois, au mois de'], ['ἡμέρα, ἡμέρᾳ', 'jour, le jour'], ['Κυριακή', 'dimanche'],
            ]),
            ...R('nombre', 'general', [
                ['εἷς, μία, ἕν', 'un, une'], ['δύο', 'deux'], ['τρεῖς, τρία', 'trois'], ['τέσσαρες', 'quatre'], ['πέντε', 'cinq'], ['ἕξ', 'six'], ['ἑπτά', 'sept'], ['ὀκτώ', 'huit'], ['ἐννέα', 'neuf'], ['δέκα', 'dix'],
                ['ἕνδεκα', 'onze'], ['δώδεκα', 'douze'], ['εἴκοσι', 'vingt'], ['τριάκοντα', 'trente'], ['τεσσαράκοντα', 'quarante'], ['πεντήκοντα', 'cinquante'], ['ἑξήκοντα', 'soixante'],
                ['ἑβδομήκοντα', 'soixante-dix'], ['ὀγδοήκοντα', 'quatre-vingts'], ['ἐνενήκοντα', 'quatre-vingt-dix'], ['ἑκατόν', 'cent'], ['χίλιοι, χιλιάς', 'mille, un millier'],
                ['πρῶτος, δεύτερος, τρίτος', 'premier, deuxième, troisième'],
                ['αʹ, βʹ, γʹ … θʹ', '1, 2, 3 … 9 en lettres (numération grecque : 🔢 le convertisseur au-dessus)'], ['ιʹ, κʹ, λʹ … ϟʹ', '10, 20, 30 … 90'], ['ρʹ, σʹ, τʹ … ϡʹ', '100, 200, 300 … 900'], ['͵α, ͵β', '1000, 2000 (le petit trait en bas à gauche multiplie par mille)'],
            ]),
            ...R('metier', 'general', [
                ['γεωργός', 'cultivateur'], ['ποιμήν', 'berger'], ['ἁλιεύς', 'pêcheur'], ['ναύτης', 'marin'], ['ἔμπορος', 'marchand'], ['ὑποδηματοποιός', 'cordonnier'], ['ῥάπτης', 'tailleur'],
                ['χαλκεύς, σιδηρουργός', 'forgeron'], ['ἀρτοποιός', 'boulanger'], ['μυλωνᾶς', 'meunier'], ['τέκτων', 'charpentier'], ['κτίστης', 'maçon'], ['διδάσκαλος', 'maître d’école'],
                ['ἰατρός', 'médecin'], ['κτηματίας', 'propriétaire (de terres)'], ['ἐργάτης', 'ouvrier'],
            ]),
            ...R('formule', 'bapteme', [
                ['Ἐν ἔτει σωτηρίῳ … μηνὶ … ἡμέρᾳ …', 'En l’an du salut …, au mois de …, le jour …'],
                ['ἐβαπτίσθη ὑπ᾽ ἐμοῦ τὸ τέκνον τοῦ … καὶ τῆς … νομίμων συζύγων', 'a été baptisé par moi l’enfant de … et de …, époux légitimes'],
                ['ἀναδόχου ὄντος τοῦ …', 'le parrain étant …'], ['καὶ ἐκλήθη …', 'et il reçut le nom de …'],
            ]),
            ...R('formule', 'mariage', [['ἐστεφάνωσα τὸν … μετὰ τῆς …', 'j’ai couronné (marié) … avec …']]),
            ...R('formule', 'sepulture', [
                ['ἐκοιμήθη ἐν Κυρίῳ ὁ δοῦλος τοῦ Θεοῦ …', 's’est endormi dans le Seigneur le serviteur de Dieu … (est mort)'], ['καὶ ἐτάφη ἐν τῷ κοιμητηρίῳ', 'et fut enterré au cimetière'],
            ]),
        ],
        glyphs: {
            grc_sigma: ['M27 28 C18 24 11 30 12 37 C13 45 24 46 26 38 C27 33 24 29 20 28 L32 27'],
            grc_sfin: ['M27 29 C20 25 12 29 13 37 C14 43 22 44 23 48 C24 53 18 55 16 54'],
            grc_stigma: ['M25 29 C19 25 12 29 13 37 C14 43 22 44 23 48 C24 53 18 55 16 54', 'M19 28 L31 22'],
            grc_ou: ['M20 34 C13 34 13 46 20 46 C27 46 27 34 20 34', 'M13 20 C13 30 27 30 27 20'],
            grc_beta: ['M12 46 L12 22 C12 10 24 10 23 20 C22 25 16 27 14 28 C24 28 28 34 26 40 C24 46 16 47 12 44'],
            grc_theta: ['M8 36 C12 30 16 42 20 46 C26 50 30 40 28 28 C27 18 21 12 17 16 C13 21 22 28 31 26'],
            grc_kai: ['M12 26 L12 46', 'M26 26 L12 37 L24 46 C26 50 26 55 20 58'],
            grc_alpha: ['M27 28 C24 40 22 46 16 46 C10 46 10 30 18 28 C24 27 26 40 30 46'],
            grc_a_soft: ['M27 28 C24 40 22 46 16 46 C10 46 10 30 18 28 C24 27 26 40 30 46', 'M17 12 C21 13 21 18 16 20'],
            grc_a_rough: ['M27 28 C24 40 22 46 16 46 C10 46 10 30 18 28 C24 27 26 40 30 46', 'M20 12 C16 13 16 18 21 20'],
            grc_a_acute: ['M27 28 C24 40 22 46 16 46 C10 46 10 30 18 28 C24 27 26 40 30 46', 'M23 12 L18 20'],
            grc_a_grave: ['M27 28 C24 40 22 46 16 46 C10 46 10 30 18 28 C24 27 26 40 30 46', 'M14 12 L19 20'],
            grc_a_circ: ['M27 28 C24 40 22 46 16 46 C10 46 10 30 18 28 C24 27 26 40 30 46', 'M11 18 C15 12 20 22 27 15'],
            grc_Theta_bar: ['M20 9 C10 9 10 46 20 46 C30 46 30 9 20 9', 'M14 27 L26 27', 'M6 3 L40 3'],
            grc_Sigma_bar: ['M30 9 L12 9 L22 27 L12 46 L30 46', 'M0 3 L32 3'],
            grc_keraia: ['M13 14 L8 24'],
            grc_lowkeraia: ['M13 48 L8 58'],
        },
        widths: {grc_keraia: 18, grc_lowkeraia: 18},
        letters: [
            {id: 'grc_sigma', name: 'σ et ς (sigma)', seen: ['grc_sigma', 'grc_sfin'], read: 's', cmp: [], note: 'σ au début et au milieu du mot, ς à la fin. Dans les inscriptions et les vieux livres, on trouve aussi le sigma « lunaire » ϲ, rond comme un c. La recherche les voit pareils.', keys: 'sigma s final lunaire grec'},
            {id: 'grc_stigma', name: 'ϛ (stigma)', seen: ['grc_stigma'], read: 'st, ou le nombre 6', cmp: ['grc_sfin'], note: 'Ressemble à un ς avec un petit chapeau : c’est « στ » lié, et surtout le chiffre 6 (ϛʹ = 6, ιϛʹ = 16).', keys: 'stigma st six 6 grec'},
            {id: 'grc_ou', name: 'ȣ (ου lié)', seen: ['grc_ou'], read: 'ou', cmp: [], note: 'Le υ posé sur le ο, comme une coupe : se lit « ou » (τȣ = τοῦ, « du »). Très fréquent à la main.', keys: 'ou ligature upsilon omicron grec'},
            {id: 'grc_beta', name: 'ϐ (bêta manuscrit)', seen: ['grc_beta'], read: 'b', cmp: [], note: 'À la main, le β au milieu du mot ressemble à un u avec une haute boucle.', keys: 'beta b grec manuscrit'},
            {id: 'grc_theta', name: 'ϑ (thêta manuscrit)', seen: ['grc_theta'], read: 'th', cmp: [], note: 'Le θ écrit d’un seul trait, comme un 9 couché qui se recourbe.', keys: 'theta th grec manuscrit'},
            {id: 'grc_kai', name: 'ϗ (καί, « et »)', seen: ['grc_kai'], read: 'καί = et', cmp: [], note: 'Un κ dont la queue descend sous la ligne : c’est le mot « καί » (et) en abrégé.', keys: 'kai et abréviation grec'},
            {id: 'grc_spirits', name: 'esprits doux et rude', seen: ['grc_a_soft', 'grc_a_rough'], read: 'rien / h', cmp: [], note: 'Sur la voyelle du début du mot : l’esprit doux (’, ἀ) ne se lit pas ; l’esprit rude (‘, ἁ) se lit h : ἁγίου = hagiou. La recherche n’en tient pas compte.', keys: 'esprit doux rude h grec'},
            {id: 'grc_accents', name: 'accents aigu, grave, circonflexe', seen: ['grc_a_acute', 'grc_a_grave', 'grc_a_circ'], read: 'ά, ὰ, ᾶ', cmp: [], note: 'Ils montrent où monte la voix ; ils ne changent pas les lettres. Souvent oubliés à la main. La recherche n’en tient pas compte.', keys: 'accent aigu grave circonflexe grec'},
            {id: 'grc_nomina', name: 'mots sacrés abrégés, avec un trait', seen: ['grc_Theta_bar', 'grc_Sigma_bar'], read: 'Θεός (Dieu)', cmp: [], note: 'Un trait au-dessus = mot abrégé : ΘΣ = Θεός (Dieu), ΙΣ ΧΣ = Ἰησοῦς Χριστός (Jésus-Christ), ΚΣ = Κύριος (le Seigneur). Ailleurs, la fin d’un mot est souvent écrite en petit au-dessus de la ligne (abréviation par suspension).', keys: 'abréviation trait tilde nomina sacra theos grec suspension'},
            {id: 'grc_numbers', name: 'les nombres en lettres', seen: ['grc_alpha', 'grc_keraia', 'grc_lowkeraia', 'grc_alpha'], read: 'αʹ = 1, ͵α = 1000', cmp: [], note: 'Une lettre suivie d’un petit trait en haut (ʹ) est un nombre : αʹ = 1, ιʹ = 10, ρʹ = 100. Le petit trait en bas à gauche multiplie par mille : ͵α = 1000. 🔢 Le convertisseur au-dessus fait le calcul.', keys: 'nombre chiffre numération keraia mille grec'},
        ],
        exercises: [
            {id: 'grc_bapt1852', icon: '👶', title: 'Un baptême orthodoxe de 1852', level: 'difficile', acte: 'bapteme', year: 1852,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Les nombres sont en lettres : ͵αωνβʹ = 1852, ιεʹ = 15 (écris les chiffres). Tu peux écrire en lettres grecques sans accents, ou en lettres latines (« ebaptisthe »).',
                src: 'Ἐν ἔτει σωτηρίῳ ͵αωνβʹ=1852|͵αωνβʹ μηνὶ Μαρτίου ιεʹ=15|ιεʹ ἐβαπτίσθη ὑπ᾽ ἐμοῦ τὸ τέκνον τοῦ Γεωργίου Παπαδοπούλου καὶ τῆς Μαρίας νομίμων συζύγων ἀναδόχου ὄντος τοῦ Νικολάου Ἰωάννου καὶ ἐκλήθη Ἰωάννης',
                notes: {'͵αωνβʹ': '͵α = 1000, ω = 800, ν = 50, β = 2 : 1852', 'ιεʹ': 'ι = 10, ε = 5 : 15', 'ἀναδόχου': 'ἀνάδοχος = parrain (« le parrain étant »)'}},
            {id: 'grc_tafi1870', icon: '⚱️', title: 'Un décès orthodoxe de 1870', level: 'difficile', acte: 'sepulture', year: 1870,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). κβʹ = 22, ͵αωοʹ = 1870, ξʹ = 60. « ἐκοιμήθη » = s’est endormi (est mort).',
                src: 'Τῇ κβʹ=22|κβʹ Ἰανουαρίου ͵αωοʹ=1870|͵αωοʹ ἐκοιμήθη ἐν Κυρίῳ ὁ Δημήτριος Κωνσταντίνου γεωργὸς ἐτῶν ξʹ=60|ξʹ καὶ ἐτάφη ἐν τῷ κοιμητηρίῳ τοῦ χωρίου',
                notes: {'κβʹ': 'κ = 20, β = 2 : 22', '͵αωοʹ': '͵α = 1000, ω = 800, ο = 70 : 1870', 'ξʹ': 'ξ = 60'}},
        ],
        numerals: {label: 'Nombres grecs ⇄ chiffres', to: toGreek, from: fromGreek, examples: ['͵αωνβʹ', 'ιϛʹ', '1870', '999']},
        sources: [
            {label: 'FamilySearch Research Wiki — Greek Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Greek_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Greece Church Records', url: 'https://www.familysearch.org/en/wiki/Greece_Church_Records'},
            {label: 'Wikipédia — Numération grecque (valeurs des lettres, stigma, koppa, sampi)', url: 'https://fr.wikipedia.org/wiki/Num%C3%A9ration_grecque'},
            {label: 'Wikipédia — Calendrier byzantin (ère de la création du monde, 1er septembre, indiction)', url: 'https://fr.wikipedia.org/wiki/Calendrier_byzantin'},
        ],
    };
})());
