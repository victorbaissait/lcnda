/**
 * ⤒ Imports en plus — le calcul, sans écran (window.LCNDA_IMPORTS ; aussi require() dans Node pour les essais) :
 *  - relevés des cercles généalogiques : fichiers Nimègue (v2 / v3, avec ou sans ligne de titres) et CSV de dépouillements
 *    (colonnes reconnues par leur titre, à corriger dans l'aperçu) → actes avec leurs personnes et leurs rôles ;
 *  - tableau de personnes (Excel, LibreOffice, CSV) → fiches et familles (liens par numéro, par nom ou par n° Sosa).
 * Les fichiers sont lus par le moteur des tableaux (LCNDA_SHEET : parseCSV, decodeBytes, fromXlsx, fromOds) : jamais
 * un deuxième lecteur. Une case qui contient une formule (« =… », « @… », « +HYPERLINK… ») n'entre jamais : elle est
 * vidée et comptée. Écran : heritage-imports-plus.js ; serveur : lib/imports_plus.php ; test : tests/test-imports-exports-3b.js.
 */
(function (root, factory) {
    const M = factory();
    if (typeof module === 'object' && module.exports) module.exports = M;
    if (typeof window !== 'undefined') window.LCNDA_IMPORTS = M;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const LIMITS = {rows: 50000, people: 10000, cell: 2000, bytes: 40 * 1024 * 1024};
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss').toLowerCase().replace(/[’'`´]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    /** une case lue comme une formule par un tableur : « =… », « @… », « +NOM( », « -NOM( » (un nombre « -2 » ou « +33 » reste) */
    const isFormula = s => typeof s === 'string' && (/^\s*[=@]/.test(s) || /^\s*[+\-]\s*[A-Za-z(]/.test(s));
    /** une case → texte propre ; une formule → '' (comptée dans stats.formulas) */
    function cell(v, stats) {
        if (v == null) return '';
        let s = typeof v === 'number' ? String(v) : String(v);
        s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim();
        if (isFormula(s)) { if (stats) stats.formulas = (stats.formulas || 0) + 1; return ''; }
        if (/^#[A-Z/0-9!?]+$/.test(s)) return ''; // #NOM?, #VALEUR!, #N/A : une erreur de calcul, pas une valeur
        return s.length > LIMITS.cell ? s.slice(0, LIMITS.cell) : s;
    }
    /** lignes brutes → {head, rows} : la ligne des titres = la première qui a au moins 2 cases remplies */
    function headAndRows(all) {
        const rows = (all || []).filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== ''));
        if (!rows.length) return {head: [], rows: []};
        return {head: rows[0].map(c => String(c ?? '').trim()), rows: rows.slice(1, LIMITS.rows + 1), more: Math.max(0, rows.length - 1 - LIMITS.rows)};
    }
    /** Lire un fichier tableau (nom + octets) avec le moteur commun ; renvoie toutes les lignes (texte) de la première feuille remplie */
    async function readTable(SH, name, buf, {sep = null, encoding = 'auto'} = {}) {
        const u8 = new Uint8Array(buf);
        if (u8.length > LIMITS.bytes) throw new Error(`fichier trop gros (${Math.round(LIMITS.bytes / 1048576)} Mo au plus)`);
        const low = String(name || '').toLowerCase();
        if (/\.(xls|doc|pdf)$/.test(low) && !(u8[0] === 0x50 && u8[1] === 0x4b)) throw new Error(/\.xls$/.test(low) ? 'les anciens fichiers Excel (.xls) ne sont pas lus : ouvre-le dans Excel ou LibreOffice et enregistre-le en .xlsx, .ods ou .csv' : 'ce n’est pas un tableau (.csv, .txt, .xlsx, .ods)');
        if (/\.(xlsx|ods)$/.test(low) && !(u8[0] === 0x50 && u8[1] === 0x4b)) throw new Error('ce fichier porte le nom d’un classeur (.xlsx, .ods) mais n’en est pas un : il est abîmé ou a été renommé');
        if (u8[0] === 0x50 && u8[1] === 0x4b) {
            const r = await SH.readFile(name, buf);
            const i = Math.max(0, r.wb.sheets.findIndex(s => Object.keys(s.cells || {}).length));
            return {rows: SH.matrix(r.wb, null, i, null, {display: true}).map(row => row.map(v => v == null ? '' : String(v))), kind: r.kind, sheet: r.wb.sheets[i]?.name || ''};
        }
        const d = SH.decodeBytes(u8, encoding);
        if (/^\s*</.test(d.text.slice(0, 200))) throw new Error('ce fichier ressemble à une page web ou à du XML, pas à un tableau');
        const s = sep || SH.sniffSep(d.text);
        return {rows: SH.parseCSV(d.text, {sep: s, maxRows: LIMITS.rows + 50}), kind: s === '\t' ? 'tsv' : 'csv', encoding: d.encoding, sep: s};
    }
    const splitName = full => { // « Pierre MARTIN », « MARTIN Pierre », « Martin, Pierre » → {first, last}
        const t = String(full || '').trim(); if (!t) return {first: '', last: ''};
        if (t.includes(',')) { const [l, f] = t.split(',', 2).map(x => x.trim()); return {first: f, last: l}; }
        const w = t.split(/\s+/); if (w.length === 1) return {first: '', last: w[0]};
        const up = w.filter(x => x.length > 1 && x === x.toLocaleUpperCase('fr') && /\p{L}/u.test(x));
        if (up.length && up.length < w.length) return {first: w.filter(x => !up.includes(x)).join(' '), last: up.join(' ')};
        return {first: w.slice(0, -1).join(' '), last: w[w.length - 1]};
    };

    /* ═════════ Relevés : Nimègue et CSV des cercles ═════════ */
    const TYPES = {N: 'Naissance / baptême', M: 'Mariage', D: 'Décès / sépulture', V: 'Divers'};
    const HEAD = ['BIDON', 'CODCOM', 'COMMUNE', 'CODDEP', 'DEPART', 'TYPACT', 'DATETXT', 'DREPUB', 'COTE', 'LIBRE'];
    const T = n => [`T${n}_NOM`, `T${n}_PRE`, `T${n}_COM`];
    /** Colonnes officielles de Nimègue v3 (comme l'export « NIMEGUEV3 » lu par ExpoActes), dans l'ordre, par sorte d'acte */
    const LAYOUT = {
        N: [...HEAD, 'NOM', 'PRE', 'SEXE', 'COM', 'P_NOM', 'P_PRE', 'P_COM', 'P_PRO', 'M_NOM', 'M_PRE', 'M_COM', 'M_PRO', ...T(1), ...T(2), 'COMGEN', 'IDNIM'],
        M: [...HEAD, 'NOM', 'PRE', 'ORI', 'DNAIS', 'AGE', 'COM', 'PRO', 'P_NOM', 'P_PRE', 'P_COM', 'P_PRO', 'M_NOM', 'M_PRE', 'M_COM', 'M_PRO', 'EXCON', 'EXC_COM',
            'C_NOM', 'C_PRE', 'C_ORI', 'C_DNAIS', 'C_AGE', 'C_COM', 'C_PRO', 'CP_NOM', 'CP_PRE', 'CP_COM', 'CP_PRO', 'CM_NOM', 'CM_PRE', 'CM_COM', 'CM_PRO', 'C_EXCON', 'C_X_COM', ...T(1), ...T(2), ...T(3), ...T(4), 'COMGEN', 'IDNIM'],
        D: [...HEAD, 'NOM', 'PRE', 'SEXE', 'ORI', 'DNAIS', 'AGE', 'COM', 'PRO', 'P_NOM', 'P_PRE', 'P_COM', 'P_PRO', 'M_NOM', 'M_PRE', 'M_COM', 'M_PRO', 'C_NOM', 'C_PRE', 'C_COM', 'C_PRO', ...T(1), ...T(2), 'COMGEN', 'IDNIM'],
        V: [...HEAD, 'LIBELLE', 'NOM', 'PRE', 'SEXE', 'ORI', 'DNAIS', 'AGE', 'COM', 'PRO', 'P_NOM', 'P_PRE', 'P_COM', 'P_PRO', 'M_NOM', 'M_PRE', 'M_COM', 'M_PRO',
            'C_NOM', 'C_PRE', 'C_ORI', 'C_DNAIS', 'C_AGE', 'C_COM', 'C_PRO', 'CP_NOM', 'CP_PRE', 'CP_COM', 'CP_PRO', 'CM_NOM', 'CM_PRE', 'CM_COM', 'CM_PRO', ...T(1), ...T(2), ...T(3), ...T(4), 'COMGEN', 'IDNIM'],
    };
    /** Les champs qu'on peut choisir pour une colonne : [code, libellé, mots du titre qui le font reconnaître] */
    const FIELDS = [
        ['', '— ne pas prendre —', []],
        ['TYPACT', 'Sorte d’acte (N, M, D…)', ['typact', 'type', 'type acte', 'type d acte', 'nature', 'nature acte', 'acte']],
        ['DATETXT', 'Date de l’acte', ['datetxt', 'date', 'date acte', 'date de l acte', 'date bapteme', 'date mariage', 'date deces', 'date sepulture', 'jour']],
        ['DREPUB', 'Date républicaine', ['drepub', 'date republicaine', 'calendrier republicain']],
        ['COMMUNE', 'Commune / paroisse', ['commune', 'paroisse', 'lieu', 'localite', 'ville']],
        ['CODCOM', 'Code INSEE', ['codcom', 'insee', 'code insee', 'code commune']],
        ['DEPART', 'Département', ['depart', 'departement', 'dept']], ['CODDEP', 'N° du département', ['coddep', 'code departement', 'n departement']],
        ['COTE', 'Cote', ['cote', 'cote archives', 'reference']], ['LIBRE', 'Champ libre (n° d’acte, vue…)', ['libre']],
        ['NUMACTE', 'N° de l’acte', ['n acte', 'numero acte', 'no acte', 'num acte', 'numero', 'n']], ['PAGE', 'Page / vue / folio', ['page', 'vue', 'folio', 'f', 'feuillet', 'image']],
        ['NOM', 'Nom (enfant, époux, défunt)', ['nom', 'nom enfant', 'nom epoux', 'nom du defunt', 'nom defunt', 'nom mari', 'patronyme', 'nom de famille']],
        ['PRE', 'Prénom (enfant, époux, défunt)', ['pre', 'prenom', 'prenoms', 'prenom enfant', 'prenom epoux', 'prenom du defunt', 'prenom defunt', 'prenom mari']],
        ['SEXE', 'Sexe', ['sexe', 's']], ['ORI', 'Origine / domicile', ['ori', 'origine', 'domicile', 'originaire', 'origine epoux', 'domicile epoux']],
        ['DNAIS', 'Date de naissance', ['dnais', 'date naissance', 'date de naissance', 'ne le', 'naissance']], ['AGE', 'Âge', ['age', 'age epoux', 'age defunt']],
        ['PRO', 'Profession', ['pro', 'profession', 'metier', 'profession epoux', 'qualite']], ['COM', 'Remarque sur la personne', ['com', 'commentaire', 'remarque']],
        ['P_NOM', 'Nom du père', ['p nom', 'nom pere', 'nom du pere', 'pere nom']], ['P_PRE', 'Prénom du père', ['p pre', 'prenom pere', 'prenom du pere', 'pere prenom', 'pere']],
        ['P_PRO', 'Profession du père', ['p pro', 'profession pere', 'profession du pere', 'metier pere']], ['P_COM', 'Remarque sur le père', ['p com', 'remarque pere']],
        ['M_NOM', 'Nom de la mère', ['m nom', 'nom mere', 'nom de la mere', 'mere nom']], ['M_PRE', 'Prénom de la mère', ['m pre', 'prenom mere', 'prenom de la mere', 'mere prenom', 'mere']],
        ['M_PRO', 'Profession de la mère', ['m pro', 'profession mere', 'profession de la mere']], ['M_COM', 'Remarque sur la mère', ['m com', 'remarque mere']],
        ['EXCON', 'Ancien conjoint (époux)', ['excon', 'veuf de', 'ex conjoint', 'ancien conjoint']], ['EXC_COM', 'Remarque ancien conjoint', ['exc com']],
        ['C_NOM', 'Nom de l’épouse / du conjoint', ['c nom', 'nom epouse', 'nom de l epouse', 'nom conjoint', 'nom femme', 'conjoint nom']],
        ['C_PRE', 'Prénom de l’épouse / du conjoint', ['c pre', 'prenom epouse', 'prenom de l epouse', 'prenom conjoint', 'prenom femme', 'conjoint', 'conjoint prenom']],
        ['C_ORI', 'Origine de l’épouse', ['c ori', 'origine epouse', 'domicile epouse']], ['C_DNAIS', 'Naissance de l’épouse', ['c dnais', 'date naissance epouse']],
        ['C_AGE', 'Âge de l’épouse', ['c age', 'age epouse']], ['C_PRO', 'Profession de l’épouse / du conjoint', ['c pro', 'profession epouse', 'profession conjoint']], ['C_COM', 'Remarque sur l’épouse', ['c com']],
        ['CP_NOM', 'Nom du père de l’épouse', ['cp nom', 'nom pere epouse']], ['CP_PRE', 'Prénom du père de l’épouse', ['cp pre', 'prenom pere epouse', 'pere epouse']],
        ['CP_PRO', 'Profession du père de l’épouse', ['cp pro', 'profession pere epouse']], ['CP_COM', 'Remarque père de l’épouse', ['cp com']],
        ['CM_NOM', 'Nom de la mère de l’épouse', ['cm nom', 'nom mere epouse']], ['CM_PRE', 'Prénom de la mère de l’épouse', ['cm pre', 'prenom mere epouse', 'mere epouse']],
        ['CM_PRO', 'Profession de la mère de l’épouse', ['cm pro', 'profession mere epouse']], ['CM_COM', 'Remarque mère de l’épouse', ['cm com']],
        ['C_EXCON', 'Ancien conjoint (épouse)', ['c excon', 'veuve de']], ['C_X_COM', 'Remarque ancien conjoint (épouse)', ['c x com']],
        ['T1_NOM', 'Parrain / témoin 1', ['t1 nom', 'parrain', 'temoin 1', 'temoin1', 'nom parrain']], ['T1_PRE', 'Prénom parrain / témoin 1', ['t1 pre', 'prenom parrain', 'prenom temoin 1']], ['T1_COM', 'Remarque parrain / témoin 1', ['t1 com']],
        ['T2_NOM', 'Marraine / témoin 2', ['t2 nom', 'marraine', 'temoin 2', 'temoin2', 'nom marraine']], ['T2_PRE', 'Prénom marraine / témoin 2', ['t2 pre', 'prenom marraine', 'prenom temoin 2']], ['T2_COM', 'Remarque marraine / témoin 2', ['t2 com']],
        ['T3_NOM', 'Témoin 3', ['t3 nom', 'temoin 3', 'temoin3']], ['T3_PRE', 'Prénom témoin 3', ['t3 pre']], ['T3_COM', 'Remarque témoin 3', ['t3 com']],
        ['T4_NOM', 'Témoin 4', ['t4 nom', 'temoin 4', 'temoin4']], ['T4_PRE', 'Prénom témoin 4', ['t4 pre']], ['T4_COM', 'Remarque témoin 4', ['t4 com']],
        ['LIBELLE', 'Libellé (actes divers)', ['libelle', 'objet']],
        ['COMGEN', 'Observations', ['comgen', 'observations', 'observation', 'notes', 'note', 'remarques', 'commentaires', 'mentions', 'mentions marginales']],
        ['IDNIM', 'Identifiant Nimègue', ['idnim', 'id']], ['BIDON', 'Repère du fichier (NIMEGUEV3)', ['bidon']],
    ];
    const CODES = new Set(FIELDS.map(f => f[0]).filter(Boolean));
    /** Le fichier vient-il de Nimègue ? 'positional' (lignes « NIMEGUEV3;… » sans titres), 'header' (titres = codes), sinon '' */
    function detectNimegue(all) {
        const first = (all || []).find(r => r && r.some(c => String(c ?? '').trim()));
        if (!first) return '';
        if (/^NIMEGUE ?V?\d/i.test(String(first[0] ?? '').trim())) return 'positional';
        const hits = first.filter(c => CODES.has(String(c ?? '').trim().toUpperCase())).length;
        return hits >= 6 && first.some(c => /^(TYPACT|P_NOM|DATETXT|CODCOM)$/i.test(String(c ?? '').trim())) ? 'header' : '';
    }
    const typeOf = (v, dflt = '') => {
        const f = fold(v);
        if (!f) return dflt;
        if (/^(n|b|nai|naissance|naissances|bapteme|baptemes|bapt|nais)$/.test(f) || /^(naiss|bapt)/.test(f)) return 'N';
        if (/^(m|mar|mariage|mariages|union)$/.test(f) || /^mari/.test(f)) return 'M';
        if (/^(d|s|dec|deces|sepulture|sepultures|inhumation|sep)$/.test(f) || /^(dec|sep|inhum)/.test(f)) return 'D';
        if (/^(v|divers|div)$/.test(f)) return 'V';
        return dflt;
    };
    /** La sorte d'actes d'un CSV de cercle sans colonne « type », d'après ses titres (« défunt » → décès, « épouse » → mariage…) */
    function typeFromHead(head) {
        const h = ' ' + head.map(fold).join(' | ') + ' ';
        if (/defunt|deces|sepulture|inhum|\bmort/.test(h)) return 'D';
        if (/epouse|epoux|mariage|\bmari\b/.test(h)) return 'M';
        if (/bapt|parrain|marraine|naissance|enfant/.test(h)) return 'N';
        return '';
    }
    /** Proposer un champ pour chaque titre de colonne (CSV d'un cercle) ; un titre reconnu deux fois n'est pris qu'une fois */
    function guessReleveMapping(head) {
        const used = new Set();
        return head.map(h => {
            const raw = String(h || '').trim(), up = raw.toUpperCase();
            if (CODES.has(up) && !used.has(up)) { used.add(up); return up; }
            const f = fold(raw);
            if (!f) return '';
            let best = '', score = 0;
            for (const [code, , syn] of FIELDS) {
                if (!code || used.has(code)) continue;
                for (const s of syn) { const sc = f === s ? 100 + s.length : (s.length > 3 && f.startsWith(s + ' ')) ? 40 + s.length : 0; if (sc > score) { score = sc; best = code; } }
            }
            if (best) used.add(best);
            return best;
        });
    }
    /** Tout le fichier (lignes brutes) → {mode, head, rows, mapping, type} ; mapping = un code par colonne */
    function prepareReleves(all, {type = ''} = {}) {
        const mode = detectNimegue(all);
        const rows0 = (all || []).filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== ''));
        if (mode === 'positional') {
            const t = typeOf(rows0[0]?.[5], type || 'N') || 'N';
            const lay = LAYOUT[t] || LAYOUT.N, width = Math.max(...rows0.slice(0, 200).map(r => r.length));
            const head = Array.from({length: width}, (_, i) => lay[i] || `Colonne ${i + 1}`);
            return {mode, head, rows: rows0.slice(0, LIMITS.rows), mapping: head.map((h, i) => lay[i] || ''), type: t, mixed: new Set(rows0.slice(0, 2000).map(r => typeOf(r[5], t))).size > 1};
        }
        const {head, rows} = headAndRows(rows0);
        return {mode: mode || 'csv', head, rows, mapping: guessReleveMapping(head), type: type || typeFromHead(head)};
    }
    const ROLE = {sujetN: 'Enfant', sujetD: 'Défunt', epoux: 'Époux', epouse: 'Épouse', sujetV: 'Personne', pere: 'Père', mere: 'Mère', pere_epoux: 'Père de l’époux', mere_epoux: 'Mère de l’époux',
        pere_epouse: 'Père de l’épouse', mere_epouse: 'Mère de l’épouse', parrain: 'Parrain', marraine: 'Marraine', temoin: 'Témoin', conjoint: 'Conjoint', ex: 'Ancien conjoint', conjointV: 'Autre partie'};
    /** Les lignes + le choix des colonnes → actes ; chaque acte : {type, date, drepub, commune, insee, dept, cote, page, no, note, label, people:[{role, label, first, last, sex, age, born, origin, job, note}]} */
    function rowsToActs(prep, mapping, {type = '', commune = ''} = {}) {
        const stats = {formulas: 0, empty: 0, rows: 0};
        const idx = {}; (mapping || prep.mapping).forEach((code, i) => { if (code && idx[code] === undefined) idx[code] = i; });
        const acts = [];
        for (const r of prep.rows) {
            stats.rows++;
            const g = code => idx[code] === undefined ? '' : cell(r[idx[code]], stats);
            const t = prep.mode === 'positional' ? (typeOf(r[5], prep.type) || prep.type) : (typeOf(g('TYPACT'), type || prep.type || 'N') || 'N');
            // Nimègue sans titres : chaque ligne suit la disposition de SA sorte d'acte (un fichier peut mélanger N, M et D)
            const gp = prep.mode === 'positional' && t !== prep.type ? (() => { const lay = LAYOUT[t] || LAYOUT.N, m = {}; lay.forEach((c, i) => { if (m[c] === undefined) m[c] = i; }); return code => m[code] === undefined ? '' : cell(r[m[code]], stats); })() : g;
            const person = (role, label, pre, extra = {}) => {
                let last = gp(pre + 'NOM'), first = gp(pre + 'PRE');
                if (!first && last.includes(' ') && !gp(pre + 'PRE')) ({first, last} = splitName(last));
                else if (!last && first.includes(' ')) ({first, last} = splitName(first));
                const p = {role, label, first, last, sex: '', age: gp(pre + 'AGE'), born: gp(pre + 'DNAIS'), origin: gp(pre + 'ORI'), job: gp(pre + 'PRO'), note: gp(pre + 'COM'), ...extra};
                return (p.first || p.last) ? p : null;
            };
            const sexOf = v => { const f = fold(v); return /^(m|h|g|masculin|homme|garcon|fils|male)$/.test(f) ? 'male' : /^(f|feminin|femme|fille|female)$/.test(f) ? 'female' : ''; };
            const people = [];
            const add = p => { if (p) people.push(p); };
            if (t === 'M') {
                add(person('epoux', ROLE.epoux, '', {sex: 'male'}));
                add(person('epouse', ROLE.epouse, 'C_', {sex: 'female'}));
                add(person('pere_epoux', ROLE.pere_epoux, 'P_', {sex: 'male'})); add(person('mere_epoux', ROLE.mere_epoux, 'M_', {sex: 'female'}));
                add(person('pere_epouse', ROLE.pere_epouse, 'CP_', {sex: 'male'})); add(person('mere_epouse', ROLE.mere_epouse, 'CM_', {sex: 'female'}));
                const ex = gp('EXCON'); if (ex) add({role: 'ex', label: ROLE.ex + ' de l’époux', ...splitName(ex), sex: 'female', note: gp('EXC_COM')});
                const ex2 = gp('C_EXCON'); if (ex2) add({role: 'ex', label: ROLE.ex + ' de l’épouse', ...splitName(ex2), sex: 'male', note: gp('C_X_COM')});
                for (const n of [1, 2, 3, 4]) add(person('temoin', `${ROLE.temoin} ${n}`, `T${n}_`));
            } else {
                const main = person('sujet', t === 'D' ? ROLE.sujetD : t === 'V' ? ROLE.sujetV : ROLE.sujetN, '', {sex: sexOf(gp('SEXE'))});
                const pere = person('pere', ROLE.pere, 'P_', {sex: 'male'}), mere = person('mere', ROLE.mere, 'M_', {sex: 'female'});
                if (main && !main.last && pere?.last) main.last = pere.last; // l'enfant porte le nom du père quand le relevé ne le répète pas
                add(main); add(pere); add(mere);
                if (t === 'D' || t === 'V') add(person(t === 'V' ? 'conjointV' : 'conjoint', t === 'V' ? ROLE.conjointV : ROLE.conjoint, 'C_'));
                if (t === 'N') { add(person('parrain', ROLE.parrain, 'T1_', {sex: 'male'})); add(person('marraine', ROLE.marraine, 'T2_', {sex: 'female'})); }
                else for (const n of [1, 2, 3, 4]) add(person('temoin', `${ROLE.temoin} ${n}`, `T${n}_`));
            }
            const date = gp('DATETXT');
            if (!people.length && !date) { stats.empty++; continue; }
            const libre = gp('LIBRE');
            acts.push({type: t, date, drepub: gp('DREPUB'), commune: gp('COMMUNE') || commune, insee: gp('CODCOM'), dept: gp('DEPART') || gp('CODDEP'), cote: gp('COTE'),
                page: gp('PAGE'), no: gp('NUMACTE') || (/^\s*(n°?|no|acte)?\s*\d+\s*$/i.test(libre) ? libre.replace(/\D/g, '') : ''), libre, label: gp('LIBELLE'), note: gp('COMGEN'), people});
        }
        return {acts, stats};
    }
    const LINKABLE = ['sujet', 'epoux', 'epouse', 'pere', 'mere', 'pere_epoux', 'mere_epoux', 'pere_epouse', 'mere_epouse', 'conjoint'];
    const PARTNER = {pere: 'mere', mere: 'pere', pere_epoux: 'mere_epoux', mere_epoux: 'pere_epoux', pere_epouse: 'mere_epouse', mere_epouse: 'pere_epouse', epoux: 'epouse', epouse: 'epoux'};
    /**
     * Les personnes qu'on peut relier à une fiche, regroupées quand c'est visiblement la même dans plusieurs actes du fichier :
     * un père et une mère cités ensemble (« Pierre MARTIN et Marie DUPONT » dans 3 baptêmes = 2 personnes, pas 6).
     * → [{key, first, last, sex, label, members:[[acte, personne]], year}]
     */
    function releveGroups(acts) {
        const groups = new Map();
        acts.forEach((a, ai) => a.people.forEach((p, pi) => {
            if (!LINKABLE.includes(p.role) || !(p.first || p.last)) return;
            const me = fold(`${p.first} ${p.last}`);
            const mate = PARTNER[p.role] ? a.people.find(q => q.role === PARTNER[p.role]) : null;
            const role = /^pere|^mere/.test(p.role) ? 'parent' : p.role;
            const key = role === 'parent' && mate ? `parent|${me}|${fold(`${mate.first} ${mate.last}`)}` : role === 'epoux' || role === 'epouse' ? `${role}|${me}|${fold(`${mate?.first || ''} ${mate?.last || ''}`)}` : `${p.role}|${me}|${ai}`;
            const g = groups.get(key) || {key, first: p.first, last: p.last, sex: p.sex, label: p.label, members: [], year: yearOf(a.date)};
            g.members.push([ai, pi]); if (!g.labels) g.labels = new Set(); g.labels.add(p.label);
            groups.set(key, g);
        }));
        return [...groups.values()].map(g => ({...g, labels: [...g.labels]}));
    }
    /** Résumé d'un acte (une ligne) : « Baptême · 12/03/1745 · Jean MARTIN (enfant), Pierre MARTIN (père)… » */
    const personText = p => [p.first, (p.last || '').toLocaleUpperCase('fr')].filter(Boolean).join(' ');
    /** Le nom de l'acte selon l'époque (comme le serveur, ip_act_kind) : avant 1793, baptêmes et sépultures */
    const actKind = a => { const y = yearOf(a.date) || yearOf(a.drepub), old = y && y < 1793; return a.type === 'M' ? 'Mariage' : a.type === 'D' ? (old ? 'Sépulture' : 'Décès') : a.type === 'V' ? (a.label || 'Acte divers') : (old ? 'Baptême' : y ? 'Naissance' : 'Naissance / baptême'); };
    const actTitle = a => [actKind(a), a.date, a.commune].filter(Boolean).join(' · ');

    /* ═════════ Tableau de personnes → fiches et familles ═════════ */
    const PEOPLE_FIELDS = [
        ['', '— ne pas prendre —', []],
        ['id', 'N° de la ligne (pour les liens)', ['n', 'no', 'num', 'numero', 'id', 'ref', 'reference', 'cle', 'identifiant', 'n fiche', 'numero fiche']],
        ['sosa', 'N° Sosa', ['sosa', 'n sosa', 'numero sosa', 'sosa n', 'kekule']],
        ['first', 'Prénom', ['prenom', 'prenoms', 'first name', 'given name', 'givenname', 'pre']],
        ['last', 'Nom', ['nom', 'nom de famille', 'patronyme', 'last name', 'surname', 'family name']],
        ['full', 'Prénom et nom ensemble', ['nom complet', 'nom et prenom', 'prenom et nom', 'personne', 'name', 'full name', 'identite']],
        ['sex', 'Sexe', ['sexe', 'sex', 'genre', 's', 'gender']],
        ['birth_date', 'Date de naissance', ['naissance', 'date naissance', 'date de naissance', 'ne le', 'nee le', 'birth', 'birth date', 'date naiss', 'n le']],
        ['birth_place', 'Lieu de naissance', ['lieu naissance', 'lieu de naissance', 'ne a', 'birth place', 'lieu naiss', 'n a']],
        ['bapt_date', 'Date de baptême', ['bapteme', 'date bapteme', 'date de bapteme', 'baptise le', 'christening']],
        ['bapt_place', 'Lieu de baptême', ['lieu bapteme', 'lieu de bapteme', 'baptise a']],
        ['death_date', 'Date de décès', ['deces', 'date deces', 'date de deces', 'mort le', 'decede le', 'death', 'death date', 'date dc', 'd le']],
        ['death_place', 'Lieu de décès', ['lieu deces', 'lieu de deces', 'mort a', 'decede a', 'death place', 'lieu dc', 'd a']],
        ['burial_date', 'Date d’inhumation', ['inhumation', 'sepulture', 'date inhumation', 'date sepulture', 'burial']],
        ['burial_place', 'Lieu d’inhumation', ['lieu inhumation', 'lieu sepulture', 'burial place']],
        ['occupation', 'Profession', ['profession', 'metier', 'occupation', 'qualite', 'job']],
        ['father', 'Père (n° ou nom)', ['pere', 'n pere', 'id pere', 'father', 'nom pere', 'pere n']],
        ['mother', 'Mère (n° ou nom)', ['mere', 'n mere', 'id mere', 'mother', 'nom mere', 'mere n']],
        ['spouse', 'Conjoint (n° ou nom)', ['conjoint', 'epoux', 'epouse', 'mari', 'femme', 'n conjoint', 'id conjoint', 'spouse', 'conjoint n']],
        ['marriage_date', 'Date de mariage', ['mariage', 'date mariage', 'date de mariage', 'marie le', 'marriage', 'marriage date']],
        ['marriage_place', 'Lieu de mariage', ['lieu mariage', 'lieu de mariage', 'marie a', 'marriage place']],
        ['note', 'Note', ['note', 'notes', 'remarque', 'remarques', 'observations', 'commentaire', 'commentaires']],
    ];
    const PCODES = new Set(PEOPLE_FIELDS.map(f => f[0]).filter(Boolean));
    function guessPeopleMapping(head) {
        const used = new Set();
        return head.map(h => {
            const f = fold(h);
            if (!f) return '';
            let best = '', score = 0;
            for (const [code, , syn] of PEOPLE_FIELDS) {
                if (!code || used.has(code)) continue;
                for (const s of syn) { const sc = f === s ? 100 + s.length : (s.length > 2 && (f.startsWith(s + ' ') || f.endsWith(' ' + s))) ? 30 + s.length : 0; if (sc > score) { score = sc; best = code; } }
            }
            if (best) used.add(best);
            return best;
        });
    }
    const sexOf = v => { const f = fold(v); if (!f) return 'unknown'; if (/^(m|h|homme|masculin|male|man|garcon|g|1)$/.test(f)) return 'male'; if (/^(f|femme|feminin|female|woman|fille|2)$/.test(f)) return 'female'; return 'unknown'; };
    /** une date du tableau → texte de date comme dans un acte (C4) : « 1850-01-02 » → « 02/01/1850 » ; un nombre Excel → sa date */
    function normDate(v) {
        let s = String(v ?? '').trim();
        if (!s) return '';
        let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        if (/^\d{5}(?:[.,]\d+)?$/.test(s)) { const n = Math.floor(Number(s.replace(',', '.'))); if (n > 3000 && n < 80000) { const dt = new Date(Date.UTC(1899, 11, 30) + n * 864e5); return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`; } }
        return s;
    }
    const yearOf = s => { const m = /(?<!\d)(\d{3,4})(?!\d)/.exec(String(s || '')); return m ? Number(m[1]) : null; };
    /**
     * Lignes + colonnes → plan de l'import : {persons:[{k, first, last, sex, occupation, note, sosa, ref, events:{BIRT:{date,place}, CHR, DEAT, BURI}}],
     *   families:[{a, b, children:[k], date, place}], issues:[{row, text}]}. Les liens (père, mère, conjoint) se font par le numéro de
     *   la ligne (colonne « N° ») ou par le nom (« Pierre MARTIN » : une seule ligne doit porter ce nom), ou par le n° Sosa.
     */
    function buildPeoplePlan(rows, mapping, {linkBy = 'auto'} = {}) {
        const idx = {}; mapping.forEach((code, i) => { if (code && idx[code] === undefined) idx[code] = i; });
        const stats = {formulas: 0, rows: 0, skipped: 0};
        const persons = [], issues = [], byId = new Map(), byName = new Map(), bySosa = new Map();
        rows.forEach((r, i) => {
            if (persons.length >= LIMITS.people) { stats.skipped++; return; }
            const g = code => idx[code] === undefined ? '' : cell(r[idx[code]], stats);
            stats.rows++;
            let first = g('first'), last = g('last');
            if (!first && !last && g('full')) ({first, last} = splitName(g('full')));
            if (!first && !last) { if (r.some(c => String(c ?? '').trim())) issues.push({row: i + 2, text: 'ligne sans prénom ni nom : laissée de côté'}); stats.skipped++; return; }
            const k = 'r' + (i + 2);
            const sosa = Number(String(g('sosa')).replace(/\D/g, '')) || 0;
            const p = {k, row: i + 2, first, last, sex: sexOf(g('sex')) !== 'unknown' ? sexOf(g('sex')) : sosa > 1 ? (sosa % 2 ? 'female' : 'male') : 'unknown', occupation: g('occupation'), note: g('note'), ref: g('id'), sosa, events: {}, raw: {father: g('father'), mother: g('mother'), spouse: g('spouse'), mdate: normDate(g('marriage_date')), mplace: g('marriage_place')}};
            for (const [tag, d, pl] of [['BIRT', 'birth_date', 'birth_place'], ['CHR', 'bapt_date', 'bapt_place'], ['DEAT', 'death_date', 'death_place'], ['BURI', 'burial_date', 'burial_place']]) {
                const date = normDate(g(d)), place = g(pl); if (date || place) p.events[tag] = {date, place};
            }
            persons.push(p);
            if (p.ref) { const key = fold(p.ref); if (byId.has(key)) issues.push({row: p.row, text: `le n° « ${p.ref} » est déjà celui de la ligne ${byId.get(key).row} : les liens vers ce n° vont à la première`}); else byId.set(key, p); }
            for (const nm of new Set([fold(`${first} ${last}`), fold(`${last} ${first}`)])) { if (!nm) continue; const l = byName.get(nm) || []; l.push(p); byName.set(nm, l); }
            if (p.sosa) { if (bySosa.has(p.sosa)) issues.push({row: p.row, text: `le n° Sosa ${p.sosa} est déjà celui de la ligne ${bySosa.get(p.sosa).row}`}); else bySosa.set(p.sosa, p); }
        });
        const resolve = (v, from, what) => {
            const t = String(v || '').trim(); if (!t) return null;
            if (linkBy !== 'name') { const p = byId.get(fold(t)); if (p) return p; if (linkBy === 'id') { issues.push({row: from.row, text: `${what} « ${t} » : aucune ligne n’a ce n° : lien non fait`}); return null; } }
            const l = byName.get(fold(t)) || [];
            if (l.length === 1) return l[0];
            if (l.length > 1) { issues.push({row: from.row, text: `${what} « ${t} » : ${l.length} lignes portent ce nom : lien non fait (mets plutôt les n°)`}); return null; }
            issues.push({row: from.row, text: `${what} « ${t} » n’est pas dans le tableau : lien non fait`}); return null;
        };
        const fams = new Map();
        const famOf = (a, b) => { // a = le père / le mari, b = la mère / la femme (s'ils sont connus)
            if (a && b && a.sex === 'female' && b.sex !== 'female') [a, b] = [b, a];
            const key = `${a?.k || ''}|${b?.k || ''}`, rev = `${b?.k || ''}|${a?.k || ''}`;
            if (fams.has(key)) return fams.get(key); if (a && b && fams.has(rev)) return fams.get(rev);
            const f = {a: a?.k || null, b: b?.k || null, children: [], date: '', place: ''}; fams.set(key, f); return f;
        };
        let links = 0;
        for (const p of persons) {
            let fa = resolve(p.raw.father, p, 'Père'), mo = resolve(p.raw.mother, p, 'Mère');
            if (!fa && !mo && p.sosa && !p.raw.father && !p.raw.mother) { fa = bySosa.get(p.sosa * 2) || null; mo = bySosa.get(p.sosa * 2 + 1) || null; }
            for (const [x, w] of [[fa, 'père'], [mo, 'mère']]) if (x === p) { issues.push({row: p.row, text: `la ligne est son propre ${w} : lien non fait`}); if (w === 'père') fa = null; else mo = null; }
            if (fa || mo) { const f = famOf(fa, mo); if (!f.children.includes(p.k)) { f.children.push(p.k); links++; } }
            const sp = resolve(p.raw.spouse, p, 'Conjoint');
            if (sp && sp !== p) { const f = famOf(p.sex === 'female' ? sp : p, p.sex === 'female' ? p : sp); if (p.raw.mdate && !f.date) f.date = p.raw.mdate; if (p.raw.mplace && !f.place) f.place = p.raw.mplace; links++; }
            else if (!sp && p.sosa && p.sosa % 2 === 0 && bySosa.get(p.sosa + 1) && !p.raw.spouse) { const f = famOf(p, bySosa.get(p.sosa + 1)); if (p.raw.mdate && !f.date) f.date = p.raw.mdate; if (p.raw.mplace && !f.place) f.place = p.raw.mplace; }
            else if (p.raw.mdate && (fa || mo || sp)) { /* rien : date de mariage sans conjoint connu */ }
        }
        // une boucle (quelqu'un ancêtre de lui-même) : le lien qui la ferme est retiré
        const parentsOf = new Map(); for (const f of fams.values()) for (const c of f.children) parentsOf.set(c, [f.a, f.b].filter(Boolean));
        const isAncestor = (anc, k, seen = new Set()) => { if (seen.has(k)) return false; seen.add(k); for (const pk of parentsOf.get(k) || []) { if (pk === anc || isAncestor(anc, pk, seen)) return true; } return false; };
        for (const f of fams.values()) f.children = f.children.filter(c => { if ([f.a, f.b].some(pk => pk && (pk === c || isAncestor(c, pk)))) { const p = persons.find(x => x.k === c); issues.push({row: p?.row || 0, text: 'ce lien ferait de la personne son propre ancêtre : lien non fait'}); return false; } return true; });
        const families = [...fams.values()].filter(f => (f.a && f.b) || f.children.length);
        persons.forEach(p => { delete p.raw; });
        return {persons, families, issues, stats: {...stats, links}};
    }
    const yearsText = p => { const b = yearOf(p.events?.BIRT?.date || p.events?.CHR?.date), d = yearOf(p.events?.DEAT?.date || p.events?.BURI?.date); return b || d ? `${b || '?'}–${d || ''}` : ''; };

    return {LIMITS, fold, isFormula, cell, headAndRows, readTable, splitName, TYPES, LAYOUT, FIELDS, detectNimegue, typeOf, typeFromHead, guessReleveMapping, prepareReleves, rowsToActs, releveGroups, LINKABLE, personText, actTitle, actKind, ROLE,
        PEOPLE_FIELDS, PCODES, guessPeopleMapping, sexOf, normDate, yearOf, buildPeoplePlan, yearsText};
});
