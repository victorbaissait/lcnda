/**
 * 🌐 Traduire un acte latin (écran 12 de docs/design/successoral-et-plus.html).
 * Atelier de transcription (Listes → 🛠️ Créer et raconter → Outils de modification → « 📜 Transcription d’actes », ou visionneuse
 * → « 📜 Atelier ») : bouton « 🌐 Traduire » à côté de « 📖 Aide à la lecture », quand la langue de l'acte est le latin (choisie ou
 * reconnue). La vue côte à côte remplace le panneau de droite ; « ✕ » revient au texte.
 *  - Niveau 1, sans rien installer : le mot à mot, par des formules connues des registres et le dictionnaire latin de l'Aide à la
 *    lecture (assets/js/aide-langues/la.js, window.LCNDA_AIDE_LECTURE) ; les nombres écrits en lettres deviennent des chiffres
 *    (« millesimo septingentesimo quinquagesimo secundo » → 1752) ; vert = formule, bleu = mot du dictionnaire, pointillé = peu sûr ;
 *    un clic sur un mot surligne sa ligne du mot à mot, et l'inverse. Le mot à mot est en français, comme le dictionnaire de l'Aide à
 *    la lecture (des données, pas des textes de l'app) ; le reste de l'écran suit la langue choisie.
 *  - Niveau 2 : la traduction complète par le modèle de la lecture approfondie déjà installé (Ollama, sur cet ordinateur :
 *    lib/plus_famille.php, op translate_start ; suivi par tx_deep_job) ; les deux lectures sont comparées (noms, date, rôles).
 *  - « 📋 Garder dans la transcription » : le champ « Traduction » de l'acte (enregistré avec ⌘S), qui sort aussi avec le modèle
 *    « ✍ Transcription d’acte mise au propre » du traitement de texte (« 📝 Mise au propre »).
 * Le moteur du niveau 1 marche aussi dans Node (tests/test-plus-famille-latin.js) : module.exports = LCNDA_LATIN.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_LATIN = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    const i18n = (s, v) => { const I = root && root.LCNDA_I18N; return I ? I.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)); }; // 🌐 app-i18n.js
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ſ/g, 's').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/j/g, 'i').replace(/v(?=[aeiou])/g, 'u');
    const AIDE = () => (root && root.LCNDA_AIDE_LECTURE) || (typeof require === 'function' ? (() => { try { return require('./app-aide-lecture.js'); } catch (_) { return null; } })() : null);

    /* ═════════ les nombres écrits en lettres (ordinaux et cardinaux, toutes les fins : -us, -a, -o, -um, -i, -ae…) ═════════ */
    const NUM = [['millesim', 1000], ['mille', 1000], ['millia', 1000], ['nongentesim', 900], ['octingentesim', 800], ['septingentesim', 700], ['sexcentesim', 600], ['quingentesim', 500], ['quadringentesim', 400], ['trecentesim', 300], ['ducentesim', 200], ['centesim', 100], ['centum', 100],
        ['nonagesim', 90], ['nonaginta', 90], ['octogesim', 80], ['octoginta', 80], ['septuagesim', 70], ['septuaginta', 70], ['sexagesim', 60], ['sexaginta', 60], ['quinquagesim', 50], ['quinquaginta', 50], ['quadragesim', 40], ['quadraginta', 40],
        ['trigesim', 30], ['tricesim', 30], ['triginta', 30], ['vigesim', 20], ['vicesim', 20], ['viginti', 20], ['undevigesim', 19], ['undeviginti', 19], ['duodevigesim', 18], ['duodeviginti', 18],
        ['septendecim', 17], ['sedecim', 16], ['quindecim', 15], ['quattuordecim', 14], ['quatuordecim', 14], ['tredecim', 13], ['duodecim', 12], ['undecim', 11],
        ['decim', 10], ['decem', 10], ['non', 9], ['novem', 9], ['octav', 8], ['octo', 8], ['septim', 7], ['septem', 7], ['sext', 6], ['sex', 6], ['quint', 5], ['quinque', 5], ['quart', 4], ['quattuor', 4], ['quatuor', 4],
        ['terti', 3], ['tres', 3], ['tribus', 3], ['secund', 2], ['duo', 2], ['duae', 2], ['duobus', 2], ['prim', 1], ['unus', 1], ['una', 1], ['uno', 1], ['unius', 1]].map(([s, n]) => [fold(s), n]);
    // les cardinaux ne se déclinent pas (« sex », pas « sexus ») : la forme exacte seulement
    const EXACT = new Set(['sex', 'novem', 'octo', 'septem', 'quinque', 'quattuor', 'quatuor', 'decem', 'centum', 'mille', 'millia', 'viginti', 'triginta', 'quadraginta', 'quinquaginta', 'sexaginta', 'septuaginta', 'octoginta', 'nonaginta', 'tres', 'tribus', 'duo', 'duae', 'duobus', 'unus', 'una', 'uno', 'unius', 'undeviginti', 'duodeviginti'].map(x => fold(x)));
    const ENDS = ['', 'us', 'a', 'o', 'um', 'i', 'ae', 'is', 'am', 'orum', 'arum'];
    /** la valeur d'un mot-nombre (« quinquagesimo » → 50), ou 0 */
    function numberWord(w) {
        const f = fold(w).replace(/[^a-z]/g, ''); if (f.length < 3) return 0;
        for (const [stem, n] of NUM) { if (f.startsWith(stem) && ENDS.includes(f.slice(stem.length))) { if ((stem === 'non' && !/^non(us|a|o|um|i|ae|is|am)$/.test(f)) || (EXACT.has(stem) && f !== stem)) continue; return n; } }
        return 0;
    }
    const MONTHS = [['ianuar', 'janvier'], ['februar', 'février'], ['marti', 'mars'], ['april', 'avril'], ['mai', 'mai'], ['iuni', 'juin'], ['iuli', 'juillet'], ['august', 'août'], ['septembr', 'septembre'], ['octobr', 'octobre'], ['novembr', 'novembre'], ['decembr', 'décembre'], ['7bris', 'septembre'], ['8bris', 'octobre'], ['9bris', 'novembre'], ['xbris', 'décembre'], ['10bris', 'décembre']];
    const monthOf = w => { const f = fold(w).replace(/[^a-z0-9]/g, ''); if (/^(martius|martii|martio|martium)$/.test(f)) return 'mars'; for (const [s, m] of MONTHS) { if (s !== 'marti' && f.startsWith(s) && f.length - s.length <= 3) return m; } return ''; };

    /* ═════════ les prénoms latins des registres (formes courantes) → le prénom français ═════════ */
    const NAMES = {ioannes: 'Jean', ioannis: 'Jean', ioanni: 'Jean', ioannem: 'Jean', ioanne: 'Jean', ioanna: 'Jeanne', ioannae: 'Jeanne', ioannam: 'Jeanne', petrus: 'Pierre', petri: 'Pierre', petro: 'Pierre', petrum: 'Pierre',
        maria: 'Marie', mariae: 'Marie', mariam: 'Marie', antonius: 'Antoine', antonii: 'Antoine', antonio: 'Antoine', antonium: 'Antoine', antonia: 'Antoinette', antoniae: 'Antoinette', antoniam: 'Antoinette',
        iacobus: 'Jacques', iacobi: 'Jacques', iacobo: 'Jacques', iacobum: 'Jacques', franciscus: 'François', francisci: 'François', francisco: 'François', franciscum: 'François', francisca: 'Françoise', franciscae: 'Françoise',
        anna: 'Anne', annae: 'Anne', annam: 'Anne', margarita: 'Marguerite', margaritae: 'Marguerite', catharina: 'Catherine', catharinae: 'Catherine', claudius: 'Claude', claudii: 'Claude', claudio: 'Claude',
        ludovicus: 'Louis', ludovici: 'Louis', stephanus: 'Étienne', stephani: 'Étienne', guillelmus: 'Guillaume', guillelmi: 'Guillaume', michael: 'Michel', michaelis: 'Michel', nicolaus: 'Nicolas', nicolai: 'Nicolas',
        andreas: 'André', andreae: 'André', iosephus: 'Joseph', iosephi: 'Joseph', elisabetha: 'Élisabeth', elisabethae: 'Élisabeth', martinus: 'Martin', martini: 'Martin', paulus: 'Paul', pauli: 'Paul',
        bartholomaeus: 'Barthélemy', bartholomaei: 'Barthélemy', ioannes_baptista: 'Jean-Baptiste', baptista: 'Baptiste', magdalena: 'Madeleine', magdalenae: 'Madeleine', ludovica: 'Louise', ludovicae: 'Louise', iudith: 'Judith'};
    /** les petits mots de liaison (absents du dictionnaire des registres) */
    const SMALL = {et: 'et', ac: 'et', atque: 'et', de: 'de', in: 'dans', ex: 'de', cum: 'avec', qui: 'qui', quae: 'qui', cuius: 'dont', cujus: 'dont', eius: 'son, sa', ejus: 'son, sa', sub: 'sous', pro: 'pour', a: 'par', ab: 'par'};
    const nameOf = w => NAMES[fold(w).replace(/[^a-z]/g, '')] || '';

    /* ═════════ les formules des registres (mot à mot sûr, en vert) ═════════ */
    // [mots latins (formes repliées, « | » = l'un ou l'autre), traduction, sûr ?, rôle donné au nom qui suit]
    const FORMULAS = [
        ['anno domini|dni|dñi', 'l’an du Seigneur', true], ['baptizatus|baptisatus est|fuit', 'a été baptisé', true], ['baptizata|baptisata est|fuit', 'a été baptisée', true],
        ['filius legitimus', 'fils légitime', true, 'enfant'], ['filia legitima', 'fille légitime', true, 'enfant'], ['filius legitimus et naturalis', 'fils légitime et naturel', true], ['filia legitima et naturalis', 'fille légitime et naturelle', true],
        ['hujus|huius parochiae|paroeciae', 'de cette paroisse', true], ['ex hac parochia', 'de cette paroisse', true], ['ejusdem|eiusdem mensis', 'du même mois', true], ['ejusdem|eiusdem parochiae', 'de la même paroisse', true],
        ['natus hesterna die', 'né hier', false], ['nata hesterna die', 'née hier', false], ['natus hodie', 'né aujourd’hui', true], ['nata hodie', 'née aujourd’hui', true], ['hesterna die', 'hier (la veille)', false],
        ['patrinus fuit', 'le parrain fut', true, 'parrain'], ['matrina fuit', 'la marraine fut', true, 'marraine'], ['matrina vero', 'et la marraine', true, 'marraine'], ['patrinus', 'le parrain', true, 'parrain'], ['matrina', 'la marraine', true, 'marraine'],
        ['qui signare nescierunt', 'qui n’ont su signer', true], ['qui signare nescivit|nescivere', 'qui n’a su signer', true], ['signare nescivit', 'n’a su signer', true], ['qui mecum subscripserunt', 'qui ont signé avec moi', true],
        ['in matrimonium conjunxi|coniunxi', 'j’ai uni en mariage', true], ['praemissis tribus denuntiationibus|bannorum publicationibus', 'après la publication des trois bans', true], ['nullo detecto impedimento', 'sans qu’aucun empêchement ait été trouvé', true], ['nulloque detecto impedimento', 'et sans qu’aucun empêchement ait été trouvé', true],
        ['praesentibus testibus', 'en présence des témoins', true, 'témoin'], ['cujus|cuius corpus sepultum est', 'dont le corps a été inhumé', true], ['in coemeterio', 'au cimetière', true], ['omnibus sacramentis munitus|munita', 'muni de tous les sacrements', true],
        ['ego infrascriptus parochus|rector|vicarius', 'moi, curé soussigné', true], ['ego infrascriptus', 'moi, soussigné', true], ['conjugum|coniugum', 'époux (des)', true], ['conjuges|coniuges', 'les époux', true], ['obiit', 'est mort(e)', true]];
    const FORM = FORMULAS.map(([lat, fr, sure, role]) => ({alts: lat.split(' ').map(w => w.split('|').map(fold)), fr, sure, role})).sort((a, b) => b.alts.length - a.alts.length);

    /* ═════════ le dictionnaire de l'Aide à la lecture (latin) : forme → traduction ═════════ */
    let DICT = null;
    function dict() {
        const L = AIDE(); const all = L && L.allEntries ? L.allEntries().filter(e => e.lang === 'la' && e.k !== 'formule') : [];
        if (DICT && DICT.n === all.length) return DICT;
        const one = new Map(), multi = [];
        all.forEach(e => {
            const forms = String(e.t).split(/\s*,\s*/).map(x => x.trim()).filter(Boolean), defs = String(e.d).split(/\s*,\s*/);
            forms.forEach((f, i) => { const d = defs.length === forms.length ? defs[i] : e.d, k = fold(f).replace(/[^a-z0-9 ]/g, '').trim(); if (!k) return; if (/\s/.test(k)) multi.push({w: k.split(' '), d}); else if (!one.has(k)) one.set(k, d); });
            (e.alt || []).forEach(a => { const k = fold(a).replace(/[^a-z0-9 ]/g, '').trim(); if (!k) return; if (/\s/.test(k)) multi.push({w: k.split(' '), d: e.d}); else if (!one.has(k)) one.set(k, e.d); });
        });
        multi.sort((a, b) => b.w.length - a.w.length);
        DICT = {one, multi, n: all.length};
        return DICT;
    }

    /** les mots du texte, avec leur place : [{w, s, e, f}] */
    function tokenize(text) {
        const out = [], re = /[\p{L}\p{M}0-9][\p{L}\p{M}0-9.'’]*/gu; let m;
        while ((m = re.exec(String(text || '')))) { const w = m[0].replace(/[.]+$/, '').replace(/['’]$/, ''); out.push({w, s: m.index, e: m.index + w.length, f: fold(w).replace(/[^a-z0-9]/g, '')}); }
        return out;
    }
    const isUpperName = w => /^\p{Lu}[\p{Lu}'’-]{1,}$/u.test(w) && w.length > 2;
    const isCap = w => /^\p{Lu}/u.test(w);

    /**
     * Le mot à mot : {segments: [{s, e, src, tr, kind: formule|dico|nombre|nom|inconnu, sure}], found: {year, day, month, date, names: [{name, fr, role}]}}
     */
    function wordByWord(text) {
        const toks = tokenize(text), D = dict(), segs = [], found = {year: 0, day: 0, month: '', names: []};
        let lastRole = '', i = 0, afterChild = false, afterBapt = false;
        const push = (a, b, tr, kind, sure = true) => segs.push({s: toks[a].s, e: toks[b].e, src: String(text).slice(toks[a].s, toks[b].e), tr, kind, sure});
        const matchAlts = (alts, at) => alts.every((alt, k) => toks[at + k] && alt.includes(toks[at + k].f));
        while (i < toks.length) {
            const t = toks[i];
            // 1. un nombre en lettres (plusieurs mots : « millesimo septingentesimo quinquagesimo secundo ») ou en chiffres
            if (numberWord(t.w)) {
                let j = i, sum = 0; while (j < toks.length && (numberWord(toks[j].w) || (toks[j].f === 'et' && toks[j + 1] && numberWord(toks[j + 1].w)))) { sum += numberWord(toks[j].w); j++; }
                const prev = toks[i - 1]?.f || '', isDay = prev === 'die' || prev === 'dies';
                if (isDay && segs.length && segs[segs.length - 1].src.toLowerCase().endsWith(toks[i - 1].w.toLowerCase())) segs.pop();
                if (isDay) { found.day = found.day || sum; segs.push({s: toks[i - 1].s, e: toks[j - 1].e, src: String(text).slice(toks[i - 1].s, toks[j - 1].e), tr: `le ${sum}ᵉ jour`, kind: 'formule', sure: true}); }
                else { if (sum >= 1000 && !found.year) found.year = sum; push(i, j - 1, String(sum), 'nombre'); }
                i = j; continue;
            }
            // 2. « mensis martii » : du mois de mars ; un mois seul
            const mo = monthOf(t.w);
            if (t.f === 'mensis' && toks[i + 1] && monthOf(toks[i + 1].w)) { found.month = found.month || monthOf(toks[i + 1].w); push(i, i + 1, `du mois de ${monthOf(toks[i + 1].w)}`, 'formule'); i += 2; continue; }
            if (mo && !nameOf(t.w)) { found.month = found.month || mo; push(i, i, mo, 'dico'); i++; continue; }
            // 3. les formules connues (la plus longue d'abord)
            const fm = FORM.find(x => matchAlts(x.alts, i));
            if (fm) { push(i, i + fm.alts.length - 1, fm.fr, 'formule', fm.sure); if (fm.role) lastRole = fm.role; if (/^(conjugum|coniugum|conjuges|coniuges)$/.test(fm.alts[0][0])) afterChild = false; if (fm.role === 'enfant') afterChild = true; if (/baptis/.test(fm.fr) || /baptis/.test(fm.alts[0][0])) afterBapt = true; i += fm.alts.length; continue; }
            // 4. le dictionnaire : d'abord les expressions de plusieurs mots, puis le mot (forme exacte, sinon une fin en plus)
            const mm = D.multi.find(x => x.w.every((w, k) => toks[i + k] && toks[i + k].f === w.replace(/[^a-z0-9]/g, '')));
            if (mm) { push(i, i + mm.w.length - 1, mm.d, 'dico'); i += mm.w.length; continue; }
            // 5. un nom : un prénom latin connu, un NOM en capitales, ou un mot à majuscule inconnu du dictionnaire
            const fr = nameOf(t.w);
            if (fr || (isCap(t.w) && !D.one.has(t.f) && segs.length)) {
                let j = i; while (toks[j + 1] && (isUpperName(toks[j + 1].w) || (isCap(toks[j + 1].w) && !D.one.has(toks[j + 1].f) && !nameOf(toks[j + 1].w) && !monthOf(toks[j + 1].w) && toks[j + 1].s - toks[j].e <= 1))) j++;
                const full = toks.slice(i, j + 1).map(x => x.w).join(' '), frFull = fr ? [fr, ...toks.slice(i + 1, j + 1).map(x => x.w)].join(' ') : full;
                const role = lastRole === 'parrain' || lastRole === 'marraine' || lastRole === 'témoin' ? lastRole : afterChild ? (found.names.some(n => n.role === 'père') ? 'mère' : 'père') : afterBapt && !found.names.some(n => n.role === 'sujet') ? 'sujet' : (fr || isUpperName(toks[j].w) ? '' : 'lieu');
                found.names.push({name: full, fr: frFull, role});
                if ((role === 'père' || role === 'mère') && found.names.filter(n => n.role === 'père' || n.role === 'mère').length >= 2) afterChild = false;
                push(i, j, fr ? frFull : full, 'nom', !!fr || isUpperName(toks[j].w));
                if (role === 'parrain' || role === 'marraine' || role === 'témoin') lastRole = '';
                i = j + 1; continue;
            }
            let d = D.one.get(t.f);
            let sure = true;
            if (!d && t.f.length >= 6) { for (let cut = 1; cut <= 3 && !d; cut++) d = D.one.get(t.f.slice(0, -cut)); sure = false; } // une fin en plus : peu sûr
            if (d) { push(i, i, d, 'dico', sure); i++; continue; }
            const small = SMALL[t.f]; if (small) { push(i, i, small, 'dico'); i++; continue; }
            push(i, i, '', 'inconnu', false); i++;
            if (/^(qui|cuius|cujus)$/.test(t.f)) afterChild = false;
        }
        if (found.day && found.month && found.year) found.date = `${found.day} ${found.month} ${found.year}`;
        return {segments: segs, found};
    }

    /** 1752 → « mil sept cent cinquante-deux » (pour comparer avec une traduction écrite en lettres) */
    function frenchYear(n) {
        const U = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
        const T = {2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante'};
        const two = x => { if (x <= 16) return U[x]; if (x < 20) return 'dix-' + U[x - 10]; const t = Math.floor(x / 10), u = x % 10; if (t === 7) return 'soixante-' + (u === 1 ? 'et-onze' : two(10 + u)); if (t === 8) return u ? 'quatre-vingt-' + U[u] : 'quatre-vingts'; if (t === 9) return 'quatre-vingt-' + two(10 + u); return T[t] + (u === 1 ? '-et-un' : u ? '-' + U[u] : ''); };
        const th = Math.floor(n / 1000), h = Math.floor((n % 1000) / 100), r = n % 100;
        return [th === 1 ? 'mil' : th ? U[th] + ' mille' : '', h === 1 ? 'cent' : h ? U[h] + ' cent' + (r ? '' : 's') : '', r ? two(r) : ''].filter(Boolean).join(' ');
    }
    /** les deux lectures sont-elles d'accord sur les noms, la date et les rôles ? → {ok, diffs: [texte]} */
    function agree(level1, text2) {
        const t = ' ' + fold(text2).replace(/[^a-z0-9]+/g, ' ') + ' ', diffs = [], f = level1.found || {};
        const words = x => ' ' + fold(x).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
        if (f.year && ![String(f.year), frenchYear(f.year), frenchYear(f.year).replace(/^mil /, 'mille ')].some(y => t.includes(words(y)))) diffs.push(i18n('l’année {y}', {y: String(f.year)}));
        (f.names || []).filter(n => n.role !== 'lieu').forEach(n => { const last = fold(n.name).split(/\s+/).pop().replace(/[^a-z]/g, ''); const first = fold(n.fr).split(/\s+/)[0].replace(/[^a-z]/g, ''); if (last.length > 2 && !t.includes(last.slice(0, Math.max(4, last.length - 2))) && !(first && t.includes(' ' + first))) diffs.push(n.name); });
        const roles = {parrain: 'parrain', marraine: 'marraine'};
        Object.keys(roles).forEach(r => { if ((f.names || []).some(n => n.role === r) && !t.includes(' ' + roles[r])) diffs.push(i18n(r)); });
        return {ok: !diffs.length, diffs};
    }
    /** le texte ressemble-t-il à du latin d'un registre ? (pour montrer « 🌐 Traduire » sans que la langue soit choisie) */
    function looksLatin(text) {
        const f = ' ' + fold(text).replace(/[^a-z]+/g, ' ') + ' ';
        return ['anno', 'domini', 'die', 'mensis', 'baptizatus', 'baptizata', 'filius', 'filia', 'legitimus', 'patrinus', 'matrina', 'parochiae', 'obiit', 'sepultus', 'conjugum', 'coniugum', 'testibus', 'millesimo', 'praesentibus', 'matrimonium'].filter(w => f.includes(' ' + w + ' ')).length >= 3;
    }
    return {numberWord, monthOf, nameOf, tokenize, wordByWord, frenchYear, agree, looksLatin, fold, FORMULAS};
});

/* ═════════ l'écran : « 🌐 Traduire » dans l'atelier de transcription ═════════ */
(() => {
    'use strict';
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const L = window.LCNDA_LATIN, A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const ROLE = {sujet: 'baptisé(e)', père: 'père', mère: 'mère', parrain: 'parrain', marraine: 'marraine', témoin: 'témoin'};

    function wire(dlg) {
        const aides = [...dlg.querySelectorAll('[data-tx-cmd="aide"]')]; if (!aides.length) return;
        // à côté de chaque « Aide à la lecture » (la barre réglable peut la ranger ailleurs, et se redessine)
        aides.forEach(aide => {
            if (aide.nextElementSibling?.matches?.('[data-pf-translate]')) return;
            const btn = document.createElement('button'); btn.type = 'button'; btn.dataset.pfTranslate = ''; btn.textContent = `🌐 ${i18n('Traduire')}`;
            btn.title = i18n('Le mot à mot tout de suite, la traduction complète si le modèle de la lecture approfondie est installé');
            if (aide.className) btn.className = aide.className;
            if (dlg.querySelector('.pf-tr')) btn.classList.add('is-active');
            aide.after(btn);
        });
        const sync = () => { const on = /lat/.test(dlg.querySelector('[data-tx-lang]')?.value || '') || L.looksLatin(dlg.querySelector('[data-tx-body]')?.value || ''); dlg.querySelectorAll('[data-pf-translate]').forEach(b => { b.hidden = !on; }); };
        if (!dlg.dataset.pfTr) {
            dlg.dataset.pfTr = '1';
            dlg.addEventListener('change', e => { if (e.target.matches('[data-tx-lang]')) sync(); });
            dlg.addEventListener('input', e => { if (e.target.matches('[data-tx-body]')) { clearTimeout(sync.t); sync.t = setTimeout(sync, 300); } });
            dlg.addEventListener('click', e => { if (e.target.closest('[data-pf-translate]')) toggle(dlg); });
        }
        sync();
    }
    function toggle(dlg) {
        const right = dlg.querySelector('.h-tx-right'); if (!right) return;
        const open = right.querySelector('.pf-tr');
        const parts = right.querySelectorAll(':scope > .h-tx-chars, :scope > .h-tx-editor, :scope > .h-tx-found');
        if (open) { open._stop?.(); open.remove(); parts.forEach(p => { p.hidden = false; }); dlg.querySelectorAll('[data-pf-translate]').forEach(b => b.classList.remove('is-active')); return; }
        parts.forEach(p => { p.hidden = true; });
        dlg.querySelectorAll('[data-pf-translate]').forEach(b => b.classList.add('is-active'));
        const box = document.createElement('section'); box.className = 'pf-tr'; right.appendChild(box);
        draw(dlg, box);
    }
    function draw(dlg, box) {
        const text = dlg.querySelector('[data-tx-body]')?.value || '';
        const r = L.wordByWord(text);
        let html = '', at = 0;
        r.segments.forEach((s, k) => { html += esc(text.slice(at, s.s)); html += `<span class="pf-tr-w is-${s.kind}${s.sure ? '' : ' is-unsure'}" data-pf-seg="${k}" tabindex="0">${esc(text.slice(s.s, s.e))}</span>`; at = s.e; });
        html += esc(text.slice(at));
        const rows = r.segments.map((s, k) => s.kind === 'inconnu' ? '' : `<li class="pf-tr-row is-${s.kind}${s.sure ? '' : ' is-unsure'}" data-pf-row="${k}"><span lang="la">${esc(s.src)}</span><span>${esc(s.tr)}${s.sure ? '' : ' ?'}</span></li>`).join('');
        const f = r.found, people = (f.names || []).filter(n => n.role && n.role !== 'lieu');
        box.innerHTML = `<header class="pf-tr-head"><h3>🌐 ${esc(i18n('Traduire'))} <small class="muted">${esc(i18n('latin → français'))}</small></h3><button type="button" class="icon-button" data-pf-tr-x title="${esc(i18n('Revenir au texte'))}" aria-label="${esc(i18n('Revenir au texte'))}">✕</button></header>
            ${text.trim() ? '' : `<p class="ui-hint">${esc(i18n('Écris ou lis d’abord le texte de l’acte : la traduction part du texte transcrit.'))}</p>`}
            <div class="pf-tr-src"><h4>${esc(i18n('L’acte (latin, transcrit)'))}</h4><p lang="la">${html || '—'}</p>
                <p class="pf-tr-legend"><span class="pf-tr-w is-formule">${esc(i18n('vert : formule connue'))}</span> · <span class="pf-tr-w is-dico">${esc(i18n('bleu : mot du dictionnaire'))}</span> · <span class="pf-tr-w is-dico is-unsure">${esc(i18n('pointillé : peu sûr'))}</span></p></div>
            <div class="pf-tr-cols"><section class="pf-tr-l1"><h4>${esc(i18n('Niveau 1 · mot à mot sans installation'))}</h4>${rows ? `<ol class="pf-tr-list">${rows}</ol>` : A().empty(i18n('Aucun mot reconnu.'), {icon: '🔎'})}
                ${f.date || people.length ? `<p class="pf-tr-found">🔎 ${[f.date ? i18n('Date : {d}', {d: f.date}) : '', ...people.map(n => `${n.fr} (${i18n(ROLE[n.role] || n.role)})`)].filter(Boolean).map(esc).join(' · ')}</p>` : ''}</section>
                <section class="pf-tr-l2"><h4>${esc(i18n('Niveau 2 · traduction complète'))} <small class="muted" data-pf-tr-model></small></h4><div data-pf-tr-l2>${UI().spinner ? UI().spinner(i18n('Je regarde si le modèle est installé…')) : ''}</div></section></div>
            <div class="pf-tr-acts"><button type="button" class="button small" data-pf-tr-keep${text.trim() ? '' : ' disabled'} title="${esc(i18n('Traduction'))}">${esc(i18n('📋 Garder dans la transcription'))}</button><button type="button" class="button small secondary" data-pf-tr-copy${text.trim() ? '' : ' disabled'}>${esc(i18n('Copier la traduction'))}</button><button type="button" class="button small secondary" data-pf-tr-doc>${esc(i18n('📝 Mise au propre'))}</button></div>
            <p class="ui-hint">${esc(i18n('Le niveau 1 marche toujours, sans rien installer. Les noms, dates et rôles repérés partent ensuite, comme d’habitude, dans « Ce que l’app a trouvé ».'))}</p>`;
        let l2 = '';
        const tx = dlg.txApi, l2box = box.querySelector('[data-pf-tr-l2]'), keepB = box.querySelector('[data-pf-tr-keep]'), copyB = box.querySelector('[data-pf-tr-copy]');
        const kept = tx?.get?.()?.data?.translation || '';
        const level1Text = () => r.segments.filter(s => s.kind !== 'inconnu').map(s => s.tr || s.src).join(' ').replace(/\s+([,.;:])/g, '$1');
        const setL2 = (t, note = '') => { l2 = t; l2box.innerHTML = `<p class="pf-tr-out">${esc(t)}</p>${note}`; keepB.disabled = copyB.disabled = !t && !text.trim(); compare(); };
        const compare = () => { if (!l2) return; const c = L.agree(r, l2); l2box.insertAdjacentHTML('beforeend', c.ok ? `<p class="ui-hint is-ok">${esc(i18n('✓ Les deux lectures sont d’accord sur les noms, la date et les rôles.'))}</p>` : `<p class="ui-hint is-error">⚠️ ${esc(i18n('À vérifier : la traduction complète ne dit pas la même chose pour : {list}', {list: c.diffs.join(', ')}))}</p>`); };
        // le surlignage lié : un mot à gauche ⇄ sa ligne du mot à mot
        // (seulement la liste qui contient l'autre moitié défile, jamais l'atelier)
        const hi = (k, from) => { box.querySelectorAll('.is-hi').forEach(x => x.classList.remove('is-hi')); box.querySelectorAll(`[data-pf-seg="${k}"], [data-pf-row="${k}"]`).forEach(x => { x.classList.add('is-hi'); if (x === from) return; const sc = x.closest('.pf-tr-list, .pf-tr-src p'); if (sc) { const r = x.getBoundingClientRect(), c = sc.getBoundingClientRect(); if (r.top < c.top || r.bottom > c.bottom) sc.scrollTop += r.top - c.top - c.height / 3; } }); };
        box.addEventListener('click', async e => {
            const w = e.target.closest('[data-pf-seg], [data-pf-row]'); if (w) { hi(w.dataset.pfSeg ?? w.dataset.pfRow, w); return; }
            if (e.target.closest('[data-pf-tr-x]')) return toggle(dlg);
            if (e.target.closest('[data-pf-tr-copy]')) { try { await navigator.clipboard.writeText(l2 || level1Text()); A().toast(i18n('Traduction copiée.')); } catch (_) { A().toast(i18n('Copie impossible dans ce navigateur.'), 'error'); } return; }
            if (e.target.closest('[data-pf-tr-keep]')) { if (!tx) return; const t = tx.get(), before = t.data.translation || ''; t.data.translation = l2 || level1Text(); tx.touch();
                A().undoToast?.(i18n('Traduction gardée dans la transcription (enregistre avec ⌘S)'), {undo: () => { t.data.translation = before; tx.touch(); }}); return; }
            if (e.target.closest('[data-pf-tr-doc]')) return cleanCopy(dlg, l2 || level1Text(), r);
            const ins = e.target.closest('[data-pf-tr-install]'); if (ins) { toggle(dlg); dlg.querySelector('[data-tx-cmd="deep"]')?.click(); return; }
            if (e.target.closest('[data-pf-tr-run]')) run();
        });
        box.addEventListener('keydown', e => { const w = e.target.closest('[data-pf-seg]'); if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); hi(w.dataset.pfSeg, w); } });
        let stop = false, timer = 0; box._stop = () => { stop = true; clearTimeout(timer); };
        async function run() {
            l2box.innerHTML = UI().spinner ? UI().spinner(i18n('Traduction en cours (le modèle tourne sur cet ordinateur)…')) : '…';
            let job; try { job = (await api('pfam_write', {}, {method: 'POST', body: {op: 'translate_start', text}})).result; } catch (e) { l2box.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); return; }
            box.querySelector('[data-pf-tr-model]').textContent = job.model;
            const poll = async () => {
                if (stop || !box.isConnected) return;
                let j; try { j = await api('tx_deep_job', {id: job.id}); } catch (e) { l2box.innerHTML = esc(e.message); return; }
                if (j.state === 'done') return setL2(j.text);
                if (j.state === 'error' || j.state === 'cancelled') { l2box.innerHTML = UI().notice ? UI().notice('error', j.error || i18n('La traduction n’a pas abouti.')) : esc(j.error); return; }
                if (j.text) l2box.innerHTML = `<p class="pf-tr-out is-running">${esc(j.text)}</p>`;
                timer = setTimeout(poll, 900);
            };
            poll();
        }
        (async () => {
            if (kept) { setL2(kept, `<p class="ui-hint">${esc(i18n('La traduction gardée avec cette transcription.'))} <button type="button" class="link-button" data-pf-tr-run>${esc(i18n('↻ Retraduire'))}</button></p>`); }
            let st = null; try { st = await api('tx_deep_status'); } catch (_) {}
            const model = (st?.models || []).find(m => m.present);
            if (kept) return;
            if (!text.trim()) { l2box.innerHTML = ''; return; }
            if (st?.running && model) { box.querySelector('[data-pf-tr-model]').textContent = model.label || model.tag; l2box.innerHTML = `<p>${esc(i18n('Le modèle de la lecture approfondie est installé : la traduction complète prend quelques dizaines de secondes.'))}</p><button type="button" class="button small" data-pf-tr-run>${esc(i18n('🌐 Traduire tout l’acte'))}</button>`; return; }
            l2box.innerHTML = `<p class="pf-tr-off">🔍 ${esc(i18n('La traduction complète utilise le modèle de la lecture approfondie (Ollama, ≈ 6 Go, rien ne part sur Internet).'))}</p><button type="button" class="button small secondary" data-pf-tr-install>${esc(i18n('Installer la lecture approfondie'))}</button><p class="ui-hint">${esc(i18n('Le niveau 1 marche toujours.'))}</p>`;
        })();
    }
    /** « ✍ Transcription d’acte mise au propre » (traitement de texte) avec la traduction */
    function cleanCopy(dlg, translation, r) {
        const tools = ext.textDocTools; if (!tools?.dataOf || !ext.openTextDoc) return A().toast(i18n('Le traitement de texte n’est pas chargé.'), 'error');
        const v = k => dlg.querySelector(`[data-tx="${k}"]`)?.value || '', text = dlg.querySelector('[data-tx-body]')?.value || '';
        const P_ = (t, st = 'normal') => `<p data-st="${st}">${t || '<br>'}</p>`, people = dlg.txApi?.get?.()?.data?.people || [];
        const words = r.segments.filter(s => s.kind === 'formule' || s.kind === 'dico').slice(0, 40);
        const html = [P_(esc(v('title') || i18n('Transcription d’acte')), 'title'), P_(esc([v('place'), v('date_text'), v('source')].filter(Boolean).join(' — ')), 'subtitle'),
            P_(esc(i18n('Transcription')), 'h1'), ...text.split('\n').map(l => P_(esc(l), 'mono')), P_(esc(i18n('Traduction')), 'h1'), ...String(translation || '').split(/\n+/).map(l => P_(esc(l))),
            P_(esc(i18n('Mots difficiles et abréviations')), 'h1'), `<ul>${words.map(s => `<li data-st="normal">${esc(s.src)} = ${esc(s.tr)}</li>`).join('')}</ul>`,
            ...(people.length ? [P_(esc(i18n('Les personnes de l’acte')), 'h1'), `<ul>${people.map(p => `<li data-st="normal">${esc(p.name)}${p.role ? ` — ${esc(p.role)}` : ''}</li>`).join('')}</ul>`] : [])].join('');
        ext.openTextDoc({data: tools.dataOf(html, {tpl: 'transcription'}), name: v('title') || i18n('Transcription d’acte mise au propre')});
    }
    new MutationObserver(() => document.querySelectorAll('dialog.h-tx-dlg').forEach(d => { if (!d.dataset.pfTr || [...d.querySelectorAll('[data-tx-cmd="aide"]')].some(x => !x.nextElementSibling?.matches?.('[data-pf-translate]'))) wire(d); })).observe(document.body || document.documentElement, {childList: true, subtree: true});
})();
