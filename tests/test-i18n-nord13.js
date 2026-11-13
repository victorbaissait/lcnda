'use strict';
/* 🌐 Le grec (el) et le bulgare (bg), 31ᵉ et 32ᵉ langues, ajoutés après le russe et l’ukrainien. Mode d'emploi : docs/I18N.md
 * (« Traduire une zone en grec (el) ou en bulgare (bg) »).
 *     node tests/test-i18n-nord13.js
 * 1. Node : el et bg déclarés partout (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord13/*.tsv
 *    (« fr ¦ el ¦ bg ») ; zones du socle traduites en entier dans les deux langues ; grec : guillemets «…» sans espaces,
 *    point d’interrogation grec « ; » ; bulgare : guillemets „…“, pas de lettres russes (ы э ё) ; pas d’espace avant
 *    « : ? ! ; » ; on tutoie (« εσύ » / « ти », jamais « εσείς / σας » / « Вие / ви / ваш ») ; pluriels à DEUX formes
 *    one|other dans les .tsv (comme l’anglais), exigées par i18n-check ; dans le navigateur (Intl.PluralRules, ou la règle
 *    par défaut d’app-i18n.js) et sur le serveur (lib/i18n.php) : 1 → one ; 0, 2, 5, 21, 1,5 → other ; FAQ : la recherche
 *    lit le grec (accents enlevés, ς → σ) et le cyrillique bulgare ; le français ne change pas.
 * 2. Navigateur (si Playwright et PHP sont là) : en grec et en bulgare, le menu principal, le bandeau et les pluriels
 *    sont traduits ; la FAQ cherche en grec et en cyrillique ; retour au français sans reste ; aucune erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const NEW = ['el', 'bg'];
const HEAD = 'fr ¦ el ¦ bg';
const DIR = path.join(root, 'assets/i18n/src/nord13');
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq', 'signaler', 'montage', 'reste4', 'reste5'];
// les nombres essayés, et ce qu’on attend : 1 → one ; tout le reste (0, les nombres à virgule compris) → other
const NS = [1, 2, 5, 11, 21, 0, 1.5];
const CATS = ['one', 'other', 'other', 'other', 'other', 'other', 'other'];
const oneOther = n => (Math.abs(n) === 1 ? 'one' : 'other');

(async () => {
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');

    /* ═════ 1. Node ═════ */
    await t('el et bg déclarés partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES.slice(30, 32), NEW); assert.equal(I.CODES.length, 32);
        assert.deepEqual([I.info('el').name, I.info('el').flag, I.info('el').locale], ['Ελληνικά', '🇬🇷', 'el-GR']);
        assert.deepEqual([I.info('bg').name, I.info('bg').flag, I.info('bg').locale], ['Български', '🇧🇬', 'bg-BG']);
        assert.deepEqual(I.info('el').intlFallback, ['en']); assert.deepEqual(I.info('bg').intlFallback, ['en']);
        assert.ok(/const I18N_LANGS = \[[^\]]*'ru', 'uk', 'el', 'bg'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(22, 24), NEW); assert.deepEqual(F.NEW_LANGS.slice(22, 24), NEW); assert.equal(F.LANGS.length, 7);
        assert.equal(B.FORMS.el, undefined, 'el : les formes par défaut one|other'); assert.equal(B.FORMS.bg, undefined); assert.deepEqual(B.FORMS.def, ['one', 'other']);
        assert.equal(B.NAMES.el, 'Ελληνικά'); assert.equal(B.NAMES.bg, 'Български');
        for (const c of NEW) {
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.equal(j._meta.lang, c); assert.equal(j._meta.ai, true); assert.ok(/nord13\/\*\.tsv/.test(j._meta.note), j._meta.note);
            const fq = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/faq/${c}.json`), 'utf8'));
            assert.equal(fq._meta.lang, c); assert.equal(fq._meta.version, F.VERSION); assert.ok(fs.existsSync(path.join(root, `assets/i18n/faq/src/${c}/000.tsv`)));
        }
        assert.ok(/🇬🇷 Ελληνικά \(EL\)/.test(I.selectHtml())); assert.ok(/🇧🇬 Български \(BG\)/.test(I.selectHtml()));
        const idx = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
        assert.ok(idx.includes(`assets/js/app-i18n.js?v=${I.VERSION}"`), 'index.php : ?v= de app-i18n.js = VERSION');
        for (const c of NEW) {
            assert.ok(new RegExp(`\\n {8}${c}: w => `).test(more), `FAQ : racines (${c})`);
            assert.ok(new RegExp(`\\n {8}${c}: '`).test(more), `FAQ : petits mots (${c})`);
            assert.ok(new RegExp(`\\n {8}${c}: \\{`).test(more), `FAQ : synonymes (${c})`);
        }
    });

    // les morceaux de la recherche de la FAQ, lus dans heritage-more.js (la même façon de découper que faqWords)
    const faqFold = eval(more.match(/const faqFold = (t => .*);\n/)[1]); // eslint-disable-line no-eval
    const split = eval(more.match(/faqFold\(t\)\.split\((\/\[\^[^/]*\]\+\/)\)/)[1]); // eslint-disable-line no-eval
    const stemOf = c => eval(more.match(new RegExp(`\\n {8}${c}: (w => \\(w\\.length > 4 \\? w\\.replace\\([^\\n]*?\\) : w\\)),`))[1]); // eslint-disable-line no-eval
    const stopOf = c => new Set(more.match(new RegExp(`\\n {8}${c}: '([^']*)',`))[1].split(' '));
    const words = (s, c) => { const stop = stopOf(c); return faqFold(s).split(split).filter(w => w.length > 1 && !stop.has(w)); };

    await t('FAQ en grec et en bulgare : les mots sont gardés (accents grecs enlevés, ς → σ, й → и), petits mots et racines', () => {
        assert.equal(faqFold('Άλλος Ψυχή ΐ Йод'), 'αλλοσ ψυχη ι иод');
        assert.deepEqual(words('Πώς κάνω αντίγραφο ασφαλείας των φωτογραφιών μου;', 'el'), ['αντιγραφο', 'ασφαλειασ', 'φωτογραφιων']);
        assert.deepEqual(words('Как да направя резервно копие на моите снимки?', 'bg'), ['резервно', 'копие', 'снимки']);
        const el = stemOf('el'), bg = stemOf('bg');
        assert.equal(el('φωτογραφιων'), el(faqFold('φωτογραφία'))); assert.equal(el(faqFold('φωτογραφίες')), 'φωτογραφ');
        assert.equal(bg('снимките'), bg('снимка')); assert.equal(bg('снимки'), 'снимк'); assert.equal(bg(faqFold('изтрий')), 'изтри');
        assert.equal(faqFold('Émilie'), 'emilie', 'le français ne change pas'); assert.deepEqual('sauvegarde-arbre photo'.split(split), ['sauvegarde-arbre', 'photo']);
        assert.equal(faqFold('Ёлка Їжак'), 'елка іжак', 'le russe et l’ukrainien ne changent pas');
    });
    await t('nord13/ : 1re ligne « fr ¦ el ¦ bg », zones du socle traduites en entier dans les deux langues', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) {
            const f = path.join(DIR, `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], HEAD);
            const r = todo('el,bg', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.equal(r.dir, 'nord13');
        }
        assert.deepEqual(B.dirOf('el'), {dir: 'nord13', head: HEAD}); assert.deepEqual(B.dirOf('bg'), {dir: 'nord13', head: HEAD});
        assert.deepEqual(todo('bg', 'listes').near, ['ru'], 'bulgare : le russe en aide (langue slave en cyrillique)');
        assert.deepEqual(todo('el', 'listes').near, [], 'grec : l’anglais seulement, déjà là');
        assert.deepEqual(todo('ru', 'listes').near, ['pl'], 'les autres langues ne changent pas');
    });
    await t('nord13/ : guillemets, ponctuation, mêmes variables {x} et balises que le français, deux formes de pluriel, tutoiement, rien de vide', () => {
        const bad = [];
        const L = '[\\p{L}]';
        const polite = {el: new RegExp(`(^|[^\\p{L}])(εσείς|εσάς|σας)(?=[^\\p{L}]|$)`, 'iu'), bg: new RegExp(`(^|[^\\p{L}])(вие|ви|вас|ваш${L}*)(?=[^\\p{L}]|$)`, 'iu')};
        const familiar = {
            el: new RegExp(`(^|[^\\p{L}])(εσύ|εσένα|σου|σ’|διάλεξε|γράψε|δες|κάνε|πρόσθεσε|δοκίμασε|σύρε|άνοιξε|έλεγξε|βάλε|πες|κράτα|τσέκαρε|ξετσέκαρε|δημιούργησε|μπορείς|θέλεις|είσαι|έχεις|ξέρεις|πληκτρολόγησε|άναψε)(?=[^\\p{L}]|$)`, 'iu'),
            bg: new RegExp(`(^|[^\\p{L}])(ти|теб|тебе|твой|твоя|твоят|твоята|твое|твоето|твоите|избери|напиши|виж|опитай|добави|можеш|искаш|плъзни|кликни|провери|сложи|създай|въведи|отметни|махни|покажи|скрий)(?=[^\\p{L}]|$)`, 'iu'),
        };
        const tu = {el: 0, bg: 0}, frTu = /(^|[^\p{L}])(tu|te|t’|ton|ta|tes|toi)(?=[^\p{L}]|$)/iu;
        let frTuCount = 0, keys = 0;
        for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.tsv'))) {
            fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').slice(1).forEach((l, i) => {
                if (!l.trim() || l.startsWith('#')) return;
                keys++;
                const [k, el = '', bg = '', ...rest] = l.split(' ¦ ');
                if (rest.length) bad.push(`${f}:${i + 2} colonnes en trop`);
                const vars = s => (s.match(/\{[a-z_]+\}/gi) || []).sort().join(' ');
                const tags = s => (s.match(/<\/?[a-z]+>/gi) || []).sort().join(' ');
                const plural = k.startsWith('=');
                const symQuotes = /« | »|« »/.test(k); // « » écrits comme symboles dans la clé française
                if (frTu.test(k)) frTuCount++;
                for (const [c, v] of [['el', el], ['bg', bg]]) {
                    if (!v.trim()) { bad.push(`${f}:${i + 2} [${c}] vide`); continue; }
                    if (!plural && vars(k) !== vars(v)) bad.push(`${f}:${i + 2} [${c}] variables : ${v}`);
                    if (tags(k) !== tags(v)) bad.push(`${f}:${i + 2} [${c}] balises : ${v}`);
                    if (!/ [:?!;]( |$)/.test(k) && /\p{L} [:?!;](\s|$)/u.test(v)) bad.push(`${f}:${i + 2} [${c}] espace avant : ? ! ; : ${v}`);
                    if (plural && v.split('|').length !== 2) bad.push(`${f}:${i + 2} [${c}] pluriel : deux formes one|other : ${v}`);
                    if (!plural && v.includes('|') && !k.includes('|')) bad.push(`${f}:${i + 2} [${c}] « | » en trop : ${v}`);
                    if (!/(^|[^\p{L}])(vous|votre|vos)(?=[^\p{L}]|$)/iu.test(k) && polite[c].test(v.replace(/«[^»]*»|„[^“]*“/g, ''))) bad.push(`${f}:${i + 2} [${c}] vouvoiement (on tutoie) : ${v}`);
                    if (familiar[c].test(v)) tu[c]++;
                }
                // grec : «…» sans espaces, « ; » pour la question (pas de « ? » après une lettre grecque)
                if (!symQuotes && /« | »|[“”„]/.test(el)) bad.push(`${f}:${i + 2} [el] guillemets (on écrit «…», sans espaces) : ${el}`);
                if ((el.match(/«/g) || []).length !== (el.match(/»/g) || []).length) bad.push(`${f}:${i + 2} [el] « sans » : ${el}`);
                if (/[Ͱ-Ͽἀ-῿]\?/u.test(el)) bad.push(`${f}:${i + 2} [el] point d’interrogation : « ; » en grec : ${el}`);
                if (/;/.test(k) && !/;/.test(el) && /[Ͱ-Ͽ]/u.test(el) && !/·/.test(el)) bad.push(`${f}:${i + 2} [el] point-virgule français → « · » : ${el}`);
                // bulgare : „…“, pas de «…» (sauf symbole de la clé), pas de lettres russes
                if (!symQuotes && /[«»”]/.test(bg)) bad.push(`${f}:${i + 2} [bg] guillemets (on écrit „…“) : ${bg}`);
                if ((bg.match(/„/g) || []).length !== (bg.match(/“/g) || []).length) bad.push(`${f}:${i + 2} [bg] „ sans “ : ${bg}`);
                if (/[ыэё]/i.test(bg)) bad.push(`${f}:${i + 2} [bg] lettre russe : ${bg}`);
                if (/[іїєґ]/i.test(bg)) bad.push(`${f}:${i + 2} [bg] lettre ukrainienne : ${bg}`);
            });
        }
        assert.deepEqual(bad, []);
        assert.ok(keys >= 1600, `${keys} textes dans le socle`);
        for (const c of NEW) assert.ok(tu[c] >= 40 && tu[c] >= frTuCount / 3, `${c} : ${tu[c]} textes qui tutoient (français : ${frTuCount})`);
    });
    await t('i18n-check : 0 erreur, el et bg comptés ; un pluriel el / bg à trois formes est une erreur, à deux formes il passe', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8', maxBuffer: 64 << 20});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        for (const c of NEW) assert.ok(new RegExp(`(⚠️ ${c} : \\d+ textes encore sans traduction)|(✓ ${c} : tout est traduit)`).test(r.stdout), c);
        const {check} = require('../scripts/i18n-check.js');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-i18n-nord13-'));
        try {
            fs.mkdirSync(path.join(tmp, 'nord13'));
            fs.writeFileSync(path.join(tmp, 'z.tsv'), 'fr\ten\tes\tde\tit\tpt\tpl\tnl\n=personne\tperson|people\tpersona|personas\tPerson|Personen\tpersona|persone\tpessoa|pessoas\tosoba|osoby|osób\tpersoon|personen\n');
            fs.writeFileSync(path.join(tmp, 'nord13', 'z.tsv'), `${HEAD}\n=personne ¦ άτομο|άτομα|ατόμων ¦ човек|души\n`);
            const errs = check({src: tmp}).errors.join('\n');
            assert.ok(/\[el\] pluriel à deux formes seulement/.test(errs), errs.slice(0, 800));
            assert.ok(!/\[bg\]/.test(errs), errs.slice(0, 800));
            fs.writeFileSync(path.join(tmp, 'nord13', 'z.tsv'), `${HEAD}\n=personne ¦ άτομο|άτομα ¦ души\n`);
            assert.ok(/\[bg\] pluriel incomplet \(1\/2 formes\)/.test(check({src: tmp}).errors.join('\n')), 'une seule forme : erreur');
            fs.writeFileSync(path.join(tmp, 'nord13', 'z.tsv'), `${HEAD}\n=personne ¦ άτομο|άτομα ¦ човек|души\n`);
            assert.deepEqual(check({src: tmp}).errors, []);
        } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
    });
    await t('t() en el et en bg : traduit, repli, variables, contexte, guillemets', () => {
        I.setLang('el', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord'), I.t('Annuler'), I.t('↶ Annuler'), I.t('Supprimer'), I.t('Relier'), I.t('Fermer'), I.t('Es-tu sûr ?')],
            ['Αποθήκευση', 'Ρυθμίσεις', 'Ανάφερε ένα λάθος', 'Πίνακας ελέγχου', 'Ακύρωση', '↶ Αναίρεση', 'Διαγραφή', 'Σύνδεση', 'Κλείσιμο', 'Είσαι σίγουρος/η;']);
        assert.ok(I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Οι ρυθμίσεις αποθηκεύτηκαν ως «Ma vue».');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Διάστημα');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Προσθήκη ατόμου…');
        I.setLang('bg', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord'), I.t('Annuler'), I.t('↶ Annuler'), I.t('Supprimer'), I.t('Relier'), I.t('Fermer'), I.t('Es-tu sûr ?')],
            ['Запази', 'Настройки', 'Съобщи за грешка', 'Табло', 'Отказ', '↶ Отмени', 'Изтрий', 'Свържи', 'Затвори', 'Сигурен ли си?']);
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Настройките са запазени като „Ma vue“.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Интервал');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Добави човек…');
        I.setLang('fr', {persist: false});
    });
    await t('pluriels : 1 → one ; 0, 2, 5, 11, 21, 1,5 → other', () => {
        const want = {
            el: ['1 άτομο', '2 άτομα', '5 άτομα', '11 άτομα', '21 άτομα', '0 άτομα', '1,5 άτομα'],
            bg: ['1 човек', '2 души', '5 души', '11 души', '21 души', '0 души', '1,5 души'],
        };
        for (const c of NEW) {
            I.setLang(c, {persist: false});
            assert.deepEqual(NS.map(n => I.category(n, c)), CATS, `${c} : catégories`);
            assert.deepEqual(NS.map(n => I.plural(n, 'personne')), want[c], `${c} : plural()`);
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.deepEqual(Object.keys(j.personne).sort(), ['one', 'other'], `${c} : deux formes dans le dictionnaire`);
            const ns = [...Array(231).keys(), 0.5, 1.5, 2.5];
            assert.deepEqual(ns.map(n => I.category(n, c)), ns.map(oneOther), `${c} : de 0 à 230`);
            assert.deepEqual(new Intl.PluralRules(c).resolvedOptions().pluralCategories.slice().sort(), ['one', 'other'], `${c} : Intl (Node)`);
        }
        I.setLang('el', {persist: false}); assert.equal(I.plural(1, 'semaine'), '1 εβδομάδα'); assert.equal(I.plural(3, 'semaine'), '3 εβδομάδες');
        I.setLang('bg', {persist: false}); assert.equal(I.plural(1, 'semaine'), '1 седмица'); assert.equal(I.plural(3, 'semaine'), '3 седмици'); assert.equal(I.plural(5, 'fiche'), '5 картона');
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes');
    });
    await t('un navigateur sans les pluriels el / bg prend la règle par défaut d’app-i18n.js (1 → one, sinon other), sans erreur', () => {
        const file = require.resolve('../assets/js/app-i18n.js');
        const fresh = () => { delete require.cache[file]; return require(file); };
        const PR = Intl.PluralRules;
        try {
            Intl.PluralRules = class extends PR {};
            Intl.PluralRules.supportedLocalesOf = l => PR.supportedLocalesOf(l).filter(x => !/^(el|bg|en)/i.test(x));
            const J = fresh();
            for (const c of NEW) {
                assert.deepEqual(NS.map(n => J.category(n, c)), CATS, c);
                J.setLang(c, {persist: false}); J.provide(c, JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8')));
                assert.equal(J.plural(22, 'personne'), c === 'el' ? '22 άτομα' : '22 души');
                assert.equal(J.plural(1, 'personne'), c === 'el' ? '1 άτομο' : '1 човек');
            }
        } finally { Intl.PluralRules = PR; fresh(); }
    });
    await t('dates et nombres : el-GR / bg-BG si le navigateur les connaît, sinon en, sans erreur', () => {
        const file = require.resolve('../assets/js/app-i18n.js');
        const fresh = () => { delete require.cache[file]; return require(file); };
        const DTF = Intl.DateTimeFormat.supportedLocalesOf, NF = Intl.NumberFormat.supportedLocalesOf;
        try {
            const J = fresh();
            assert.equal(J.intlLocale('el'), Intl.DateTimeFormat.supportedLocalesOf(['el-GR']).length ? 'el-GR' : 'en');
            assert.equal(J.intlLocale('bg'), Intl.DateTimeFormat.supportedLocalesOf(['bg-BG']).length ? 'bg-BG' : 'en');
            J.setLang('bg', {persist: false}); assert.equal(J.fmtNumber(3.5), (3.5).toLocaleString(J.locale()));
            Intl.DateTimeFormat.supportedLocalesOf = l => DTF.call(Intl.DateTimeFormat, l).filter(x => !/^(el|bg)/i.test(x));
            Intl.NumberFormat.supportedLocalesOf = l => NF.call(Intl.NumberFormat, l).filter(x => !/^(el|bg)/i.test(x));
            const K = fresh(); K.setLang('el', {persist: false});
            assert.equal(K.intlLocale('el'), 'en'); assert.equal(K.intlLocale('bg'), 'en'); assert.equal(K.locale(), 'en');
            K.provide('el', JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/el.json'), 'utf8')));
            assert.equal(K.plural(2, 'personne'), '2 άτομα', 'les pluriels restent grecs même quand les dates prennent le repli');
        } finally {
            Intl.DateTimeFormat.supportedLocalesOf = DTF; Intl.NumberFormat.supportedLocalesOf = NF;
            fresh();
        }
    });
    let php = null;
    try { php = require('../electron/php-server'); } catch (_) {}
    const phpPath = php && php.findPhp([php.devBundledPhp()]);
    const runPhp = code => { const r = spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
    if (phpPath) await t('serveur (lib/i18n.php) : en-têtes el et bg reconnus, deux formes de pluriel (et 1,5), les autres langues inchangées', () => {
        const run = (l, txt, ns) => runPhp(`$_SERVER['HTTP_X_LCNDA_LANG']='${l}'; require 'lib/i18n.php'; echo json_encode(array_merge([i18n_lang(), i18n_t('${txt}')], array_map(fn ($n) => i18n_t('personne', ['n' => $n]), [${ns.join(', ')}])), JSON_UNESCAPED_UNICODE);`);
        assert.deepEqual(run('el', 'Enregistrer', NS), ['el', 'Αποθήκευση', 'άτομο', 'άτομα', 'άτομα', 'άτομα', 'άτομα', 'άτομα', 'άτομα']);
        assert.deepEqual(run('bg', 'Enregistrer', NS), ['bg', 'Запази', 'човек', 'души', 'души', 'души', 'души', 'души', 'души']);
        assert.deepEqual(run('EL', 'Enregistrer', [1]).slice(0, 2), ['el', 'Αποθήκευση'], 'en-tête en capitales : ramené en minuscules');
        assert.deepEqual(run('ru', 'Enregistrer', [1]).slice(0, 2), ['ru', 'Сохранить'], 'russe inchangé');
        assert.deepEqual(run('bgr', 'Enregistrer', [1]).slice(0, 2), ['fr', 'Enregistrer'], 'code inconnu : français');
        const d = runPhp(`require 'lib/i18n.php'; echo json_encode([i18n_detect_lang('el-GR,el;q=0.9'), i18n_detect_lang('bg-BG,bg;q=0.9,ru;q=0.8'), i18n_detect_lang('en-GB'), i18n_plural_cat('el', 2), i18n_plural_cat('bg', 2)]);`);
        assert.deepEqual(d, ['el', 'bg', 'en', null, null], 'premier lancement : la langue de l’ordinateur ; pas de règle propre (la règle par défaut suffit)');
    });
    else console.log('· serveur : PHP introuvable, vérification sautée');
    if (phpPath) await t('serveur et navigateur : même forme de pluriel en el et en bg, de 0 à 230 (et 0,5, 1,5, 2,5)', () => {
        const ns = [...Array(231).keys(), 0.5, 1.5, 2.5];
        for (const c of NEW) {
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            const srv = runPhp(`$_SERVER['HTTP_X_LCNDA_LANG']='${c}'; require 'lib/i18n.php'; echo json_encode(array_map(fn ($n) => i18n_t('personne', ['n' => $n]), [${ns.join(', ')}]), JSON_UNESCAPED_UNICODE);`);
            assert.deepEqual(srv, ns.map(n => j.personne[new Intl.PluralRules(c).select(n)]), c);
            assert.deepEqual(srv, ns.map(n => j.personne[I.category(n, c)]), c);
        }
    });

    /* ═════ 2. Navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} el, bg : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const {phpRuntimeArgs} = php;
    const work = process.env.I18N_TMP || os.tmpdir();
    const tmp = fs.mkdtempSync(path.join(work, 'carnet-i18n-nord13-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living'),('Louis','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20790, base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (lang, hash = '') => {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.addInitScript(l => { try { localStorage.setItem('lcnda-langue', l); localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage();
        page.on('pageerror', e => errs.push(`${lang} : ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${lang} console : ${m.text()}`); });
        page.on('dialog', d => d.dismiss());
        await page.goto(base + hash, {waitUntil: 'load'}); await page.waitForTimeout(1800);
        return page;
    };
    try {
        await t('grec : menu principal, bandeau, titre et pluriels traduits ; la FAQ cherche en grec ; retour au français sans reste', async () => {
            const page = await open('el');
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav').innerText, banner: document.getElementById('lc-i18n-banner')?.innerText || '', plural: [1, 5].map(n => window.LCNDA_APP.plural(n, 'personne')), title: document.title, cookie: document.cookie}));
            assert.equal(r.lang, 'el'); assert.ok(/lcnda_lang=el/.test(r.cookie), r.cookie);
            assert.ok(r.nav.includes('Πίνακας ελέγχου') && r.nav.includes('Ρυθμίσεις'), r.nav);
            assert.ok(/Μετάφραση από τεχνητή νοημοσύνη/.test(r.banner), r.banner); assert.deepEqual(r.plural, ['1 άτομο', '5 άτομα']); assert.equal(r.title, 'Ψηφιακό σημειωματάριο των προγόνων');
            await page.evaluate(() => window.LCNDA_UI.openFaq('αντίγραφο ασφαλείας')); await page.waitForTimeout(900);
            const f = await page.evaluate(() => ({q: document.querySelector('[data-faq-q]')?.value, ph: document.querySelector('[data-faq-q]')?.placeholder || '', res: document.querySelector('[data-faq-results]')?.innerText || ''}));
            assert.equal(f.q, 'αντίγραφο ασφαλείας'); assert.ok(/Κάνε την ερώτησή σου/.test(f.ph), f.ph); assert.ok(f.res.trim().length > 0, 'une réponse ou « pas de réponse », sans erreur');
            await page.keyboard.press('Escape'); await page.waitForTimeout(300);
            await page.evaluate(() => window.LCNDA_I18N.setLang('fr')); await page.waitForTimeout(1200);
            const fr = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), nav: document.querySelector('.main-nav').innerText}));
            assert.equal(fr.lang, 'fr'); assert.equal(fr.banner, false); assert.ok(fr.nav.includes('Réglages'), fr.nav);
            await page.context().close();
        });
        await t('bulgare : une fiche s’ouvre par son adresse, le menu de choix d’une personne est traduit, la FAQ cherche en cyrillique', async () => {
            const page = await open('bg', '#personnes/2');
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav')?.innerText || '', page: document.querySelector('#workspace')?.innerText || '', cur: window.LCNDA_APP.state.currentPersonId, plural: [1, 22].map(n => window.LCNDA_APP.plural(n, 'personne'))}));
            assert.equal(r.lang, 'bg'); assert.ok(r.nav.includes('Табло') && r.nav.includes('Настройки'), r.nav); assert.deepEqual(r.plural, ['1 човек', '22 души']);
            assert.equal(Number(r.cur), 2); assert.ok(/Marie/.test(r.page), r.page.slice(0, 200));
            await page.evaluate(() => { window.__pk = window.LCNDA_PICKER.openPicker({kind: 'person'}); });
            await page.waitForSelector('.pk-dialog .pk-input'); await page.fill('.pk-dialog .pk-input', 'Mar'); await page.waitForTimeout(1200);
            const list = await page.locator('.pk-dialog').innerText();
            assert.ok(/Marie/.test(list) && /DURAND/i.test(list), list.slice(0, 400));
            assert.ok(!/fiches trouvées|Aucune fiche/.test(list), `textes du menu de choix traduits : ${list.slice(0, 300)}`);
            await page.keyboard.press('Escape'); await page.waitForTimeout(300);
            await page.evaluate(() => window.LCNDA_UI.openFaq('резервно копие')); await page.waitForTimeout(900);
            const f = await page.evaluate(() => ({q: document.querySelector('[data-faq-q]')?.value, ph: document.querySelector('[data-faq-q]')?.placeholder || '', res: document.querySelector('[data-faq-results]')?.innerText || ''}));
            assert.equal(f.q, 'резервно копие'); assert.ok(/Задай въпроса си/.test(f.ph), f.ph); assert.ok(f.res.trim().length > 0, 'une réponse ou « pas de réponse », sans erreur');
            await page.context().close();
        });
        await t('aucune erreur JavaScript pendant ces essais', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(`${failed ? '✗' : '✓'} el, bg : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
