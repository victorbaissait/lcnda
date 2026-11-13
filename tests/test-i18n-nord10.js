'use strict';
/* 🌐 L’albanais (sq) et le maltais (mt), 25ᵉ et 26ᵉ langues, ajoutés après le luxembourgeois. Mode d'emploi : docs/I18N.md (« Ajouter une langue »).
 *     node tests/test-i18n-nord10.js
 * Node seulement : sq et mt déclarés partout (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord10/*.tsv
 * (« fr ¦ sq ¦ mt ») ; zones de base traduites en entier dans les deux langues, guillemets «…» (sq) et “…” (mt) ;
 * i18n-todo.js donne l’italien en aide pour le maltais ; pluriels : sq à 2 formes one|other, mt à 5 formes
 * one|two|few|many|other (CLDR 42 et plus), dans le navigateur (Intl.PluralRules, ou la règle écrite d’app-i18n.js quand
 * le navigateur ne la connaît pas) comme sur le serveur (lib/i18n.php), de 0 à 230 et pour des nombres à virgule ;
 * dates et nombres : sq-AL / mt-MT, ou leur repli (en ; en-MT puis en) ; FAQ : recherche avec ë, ç, ħ, ġ, ż, ċ, għ ;
 * repli sur le français ; le français ne change pas.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const NEW = ['sq', 'mt'];
const HEAD = 'fr ¦ sq ¦ mt';
const DIR = path.join(root, 'assets/i18n/src/nord10');
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq', 'signaler', 'montage', 'reste4', 'reste5'];
const MT_FORMS = ['one', 'two', 'few', 'many', 'other'];
/** la règle CLDR (42 et plus) du maltais, écrite ici une troisième fois pour vérifier les deux autres */
const mtRule = n => { n = Math.abs(n); if (Math.floor(n) !== n) return 'other'; if (n === 1) return 'one'; if (n === 2) return 'two'; const m = n % 100; if (n === 0 || (m >= 3 && m <= 10)) return 'few'; return (m >= 11 && m <= 19) ? 'many' : 'other'; };

(async () => {
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    await t('sq et mt déclarés partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES.slice(24, 26), NEW); assert.equal(I.CODES.length, 30);
        assert.deepEqual([I.info('sq').name, I.info('sq').flag, I.info('sq').locale], ['Shqip', '🇦🇱', 'sq-AL']);
        assert.deepEqual([I.info('mt').name, I.info('mt').flag, I.info('mt').locale], ['Malti', '🇲🇹', 'mt-MT']);
        assert.deepEqual(I.info('sq').intlFallback, ['en']); assert.deepEqual(I.info('mt').intlFallback, ['en-MT', 'en']);
        assert.ok(/const I18N_LANGS = \[[^\]]*'tr', 'lb', 'sq', 'mt'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(16, 18), NEW); assert.deepEqual(F.NEW_LANGS.slice(16, 18), NEW); assert.equal(F.LANGS.length, 7);
        assert.equal(B.FORMS.sq, undefined, 'sq : one|other (FORMS.def)'); assert.deepEqual(B.FORMS.mt, MT_FORMS);
        assert.equal(B.NAMES.sq, 'Shqip'); assert.equal(B.NAMES.mt, 'Malti');
        for (const c of NEW) {
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.equal(j._meta.lang, c); assert.equal(j._meta.ai, true); assert.ok(/nord10\/\*\.tsv/.test(j._meta.note), j._meta.note);
            const fq = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/faq/${c}.json`), 'utf8'));
            assert.equal(fq._meta.lang, c); assert.equal(fq._meta.version, F.VERSION); assert.ok(fs.existsSync(path.join(root, `assets/i18n/faq/src/${c}`)));
        }
        assert.ok(/🇦🇱 Shqip \(SQ\)/.test(I.selectHtml())); assert.ok(/🇲🇹 Malti \(MT\)/.test(I.selectHtml()));
        const idx = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
        assert.ok(idx.includes(`assets/js/app-i18n.js?v=${I.VERSION}"`), 'index.php : ?v= de app-i18n.js = VERSION');
        const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');
        for (const c of NEW) {
            assert.ok(new RegExp(`\\n {8}${c}: w => `).test(more), `FAQ : racines (${c})`);
            assert.ok(new RegExp(`\\n {8}${c}: '`).test(more), `FAQ : petits mots (${c})`);
            assert.ok(new RegExp(`\\n {8}${c}: \\{`).test(more), `FAQ : synonymes (${c})`);
        }
    });
    await t('FAQ : ë, ç (albanais) et ħ, ġ, ż, ċ, għ (maltais) ramenés à e, c, h, g, z, c, gh ; racines', () => {
        const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');
        const faqFold = eval(more.match(/const faqFold = (t => .*);\n/)[1]); // eslint-disable-line no-eval
        const stemSq = eval(more.match(/\n {8}sq: (w => \(w\.length > 4 \? w\.replace\(\/[^\n]*?: w\)),/)[1]); // eslint-disable-line no-eval
        const stemMt = eval(more.match(/\n {8}mt: (w => \{[^\n]*?return [^\n]*?; \}),/)[1]); // eslint-disable-line no-eval
        const words = s => faqFold(s).split(/[^a-z0-9-]+/).filter(Boolean);
        assert.deepEqual(words('Gjenealogjia jote : Fotot, Kërko, Çfarë, Përditësime'), ['gjenealogjia', 'jote', 'fotot', 'kerko', 'cfare', 'perditesime']);
        assert.deepEqual(words('Il-ġenealoġija tiegħek : Ħassar, Żid, Iċċekkja, GĦAJNUNA'), ['il-genealogija', 'tieghek', 'hassar', 'zid', 'iccekkja', 'ghajnuna']);
        assert.equal(stemSq('fotografite'), stemSq('fotografi'), 'sq : forme définie au pluriel');
        assert.equal(stemSq('kartela'), stemSq('kartelat'), 'sq : pluriel indéfini / défini');
        assert.equal(stemMt('persuna'), stemMt('persuni'), 'mt : singulier / pluriel');
        assert.equal(stemMt('ilktieb'), 'ktieb', 'mt : l’article collé (« il-ktieb » dans une question) tombe');
        assert.equal(stemMt('ritratti'), 'ritratt'); assert.equal(stemMt('ktieb'), 'ktieb');
        assert.equal(faqFold('Émilie'), 'emilie', 'le français ne change pas');
    });
    await t('nord10/ : 1re ligne « fr ¦ sq ¦ mt », zones de base traduites en entier dans les deux langues, l’italien en aide pour mt', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) {
            const f = path.join(DIR, `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], HEAD);
            const r = todo('sq,mt', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.equal(r.dir, 'nord10');
        }
        assert.deepEqual(B.dirOf('sq'), {dir: 'nord10', head: HEAD}); assert.deepEqual(B.dirOf('mt'), {dir: 'nord10', head: HEAD});
        assert.deepEqual(todo('mt', 'listes').near, ['it'], 'maltais : l’italien en aide');
        assert.deepEqual(todo('sq', 'listes').near, [], 'albanais : l’anglais seulement, déjà là');
        assert.deepEqual(todo('lb', 'listes').near, [], 'les autres langues ne changent pas');
        assert.deepEqual(todo('is', 'listes').near, ['nb', 'da']);
    });
    await t('nord10/ : guillemets «…» (sq) et “…” (mt), mêmes variables {x} et balises que le français, rien de vide', () => {
        const bad = [];
        for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.tsv'))) {
            fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').slice(1).forEach((l, i) => {
                if (!l.trim() || l.startsWith('#')) return;
                const [k, sq = '', mt = ''] = l.split(' ¦ ');
                const vars = s => (s.match(/\{[a-z_]+\}/gi) || []).sort().join(' ');
                const tags = s => (s.match(/<\/?[a-z]+>/gi) || []).sort().join(' ');
                const plural = k.startsWith('=');
                for (const [c, v] of [['sq', sq], ['mt', mt]]) {
                    if (!v.trim()) { bad.push(`${f}:${i + 2} [${c}] vide`); continue; }
                    if (!plural && vars(k) !== vars(v)) bad.push(`${f}:${i + 2} [${c}] variables : ${v}`);
                    if (tags(k) !== tags(v)) bad.push(`${f}:${i + 2} [${c}] balises : ${v}`);
                }
                const sym = /[«»]/.test(k); // la clé parle du signe lui-même (« guillemets », flèche »)
                if (/[“”„]/.test(sq)) bad.push(`${f}:${i + 2} [sq] “ ” „ : ${sq}`);
                if (!sym && (sq.match(/«/g) || []).length !== (sq.match(/»/g) || []).length) bad.push(`${f}:${i + 2} [sq] « sans » : ${sq}`);
                if (!sym && /« | »/.test(sq)) bad.push(`${f}:${i + 2} [sq] espace dans «…» : ${sq}`);
                if (!sym && /[«»„]/.test(mt)) bad.push(`${f}:${i + 2} [mt] « » „ : ${mt}`);
                if ((mt.match(/“/g) || []).length !== (mt.match(/”/g) || []).length) bad.push(`${f}:${i + 2} [mt] “ sans ” : ${mt}`);
                if (plural && sq.split('|').length !== 2) bad.push(`${f}:${i + 2} [sq] pluriel en ${sq.split('|').length} formes : ${sq}`);
                if (plural && mt.split('|').length !== 5) bad.push(`${f}:${i + 2} [mt] pluriel en ${mt.split('|').length} formes : ${mt}`);
            });
        }
        assert.deepEqual(bad, []);
    });
    await t('i18n-check : 0 erreur, sq et mt comptés ; 2 formes de pluriel exigées en sq, 5 en mt', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8', maxBuffer: 64 << 20});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        for (const c of NEW) assert.ok(new RegExp(`(⚠️ ${c} : \\d+ textes encore sans traduction)|(✓ ${c} : tout est traduit)`).test(r.stdout), c);
        const {check} = require('../scripts/i18n-check.js');
        const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lcnda-i18n-nord10-'));
        try {
            fs.mkdirSync(path.join(tmp, 'nord10'));
            fs.writeFileSync(path.join(tmp, 'z.tsv'), 'fr\ten\tes\tde\tit\tpt\tpl\tnl\n=personne\tperson|people\tpersona|personas\tPerson|Personen\tpersona|persone\tpessoa|pessoas\tosoba|osoby|osób\tpersoon|personen\n');
            fs.writeFileSync(path.join(tmp, 'nord10', 'z.tsv'), `${HEAD}\n=personne ¦ person ¦ persuna|persuni\n`);
            const errs = check({src: tmp}).errors.join('\n');
            assert.ok(/\[sq\] pluriel incomplet \(1\/2 formes\)/.test(errs), errs.slice(0, 800));
            assert.ok(/\[mt\] pluriel incomplet \(2\/5 formes\)/.test(errs), errs.slice(0, 800));
            fs.writeFileSync(path.join(tmp, 'nord10', 'z.tsv'), `${HEAD}\n=personne ¦ person|persona ¦ persuna|persuni|persuni|persuna\n`);
            assert.ok(/\[mt\] pluriel incomplet \(4\/5 formes\)/.test(check({src: tmp}).errors.join('\n')));
            fs.writeFileSync(path.join(tmp, 'nord10', 'z.tsv'), `${HEAD}\n=personne ¦ person|persona ¦ persuna|persuni|persuni|persuna|persuna\n`);
            assert.deepEqual(check({src: tmp}).errors, []);
        } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
    });
    await t('t() en sq et en mt : traduit, repli, variables, contexte, guillemets', () => {
        I.setLang('sq', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord'), I.t('Annuler'), I.t('↶ Annuler')], ['Ruaj', 'Cilësimet', 'Raporto një gabim', 'Paneli', 'Anulo', '↶ Zhbëj']);
        assert.ok(/IA/.test(I.t('Les traductions sont faites par une IA : le français reste la langue de référence.')));
        assert.ok(I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Cilësimet u ruajtën si «Ma vue».');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Hapësirë');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Shto një person…');
        I.setLang('mt', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord'), I.t('Annuler'), I.t('↶ Annuler')], ['Issejvja', 'Issettjar', 'Irrapporta żball', 'Pannell', 'Ikkanċella', '↶ Erġa’ lura']);
        assert.ok(I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'L-issettjar issejvjat bħala “Ma vue”.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Spazju');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Żid persuna…');
        I.setLang('fr', {persist: false});
    });
    await t('pluriels : albanais 1 / le reste ; maltais en 5 formes (1 | 2 | 0, 3–10 | 11–19 | le reste)', () => {
        I.setLang('sq', {persist: false});
        for (const [n, s] of [[1, '1 person'], [2, '2 persona'], [0, '0 persona'], [11, '11 persona'], [21, '21 persona']]) assert.equal(I.plural(n, 'personne'), s, `sq ${n}`);
        assert.deepEqual([0, 1, 2, 21, 1.5].map(n => I.category(n, 'sq')), ['other', 'one', 'other', 'other', 'other']);
        I.setLang('mt', {persist: false});
        for (const [n, s] of [[1, '1 persuna'], [2, '2 persuni'], [0, '0 persuni'], [3, '3 persuni'], [10, '10 persuni'], [11, '11 persuna'], [19, '19 persuna'], [20, '20 persuna'], [102, '102 persuna'], [103, '103 persuni'], [111, '111 persuna']]) assert.equal(I.plural(n, 'personne'), s, `mt ${n}`);
        assert.equal(I.plural(1, 'semaine'), '1 ġimgħa'); assert.equal(I.plural(3, 'semaine'), '3 ġimgħat'); assert.equal(I.plural(15, 'semaine'), '15 ġimgħa');
        const j = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/mt.json'), 'utf8'));
        assert.deepEqual(j.personne, {one: 'persuna', two: 'persuni', few: 'persuni', many: 'persuna', other: 'persuna'});
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/sq.json'), 'utf8')).personne, {one: 'person', other: 'persona'});
        // ce que donne Intl dans Node (ICU récent) : 5 catégories, dans l’ordre d’ICU (le dictionnaire, lui, suit one|two|few|many|other)
        const R = new Intl.PluralRules('mt');
        assert.deepEqual([...R.resolvedOptions().pluralCategories].sort(), [...MT_FORMS].sort());
        const ns = [...Array(231).keys(), 0.1, 1.1, 1.5, 2.5, 3.5, 11.5];
        assert.deepEqual(ns.map(n => R.select(n)), ns.map(mtRule), 'Intl (Node) = la règle CLDR 42');
        assert.deepEqual(ns.map(n => I.category(n, 'mt')), ns.map(mtRule), 'app-i18n.js = la règle CLDR 42');
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes');
    });
    await t('maltais : un navigateur sans la règle récente (sans « two ») ou sans pluriels maltais prend la règle écrite d’app-i18n.js', () => {
        const file = require.resolve('../assets/js/app-i18n.js');
        const fresh = () => { delete require.cache[file]; return require(file); };
        const PR = Intl.PluralRules;
        const ns = [...Array(231).keys(), 0.1, 1.5, 2.5];
        try {
            // CLDR < 42 : one (1) | few (0, 2–10, 102–110) | many (11–19) | other — pas de « two »
            Intl.PluralRules = class extends PR { resolvedOptions() { const o = super.resolvedOptions(); return /^mt/.test(o.locale) ? {...o, pluralCategories: ['one', 'few', 'many', 'other']} : o; } select(n) { return /^mt/.test(super.resolvedOptions().locale) && n === 2 ? 'few' : super.select(n); } };
            Intl.PluralRules.supportedLocalesOf = PR.supportedLocalesOf.bind(PR);
            let J = fresh();
            assert.deepEqual(ns.map(n => J.category(n, 'mt')), ns.map(mtRule));
            J.setLang('mt', {persist: false}); J.provide('mt', JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/mt.json'), 'utf8')));
            assert.equal(J.plural(2, 'personne'), '2 persuni'); assert.equal(J.plural(15, 'personne'), '15 persuna');
            // pas de pluriels maltais du tout
            Intl.PluralRules = class extends PR {};
            Intl.PluralRules.supportedLocalesOf = l => PR.supportedLocalesOf(l).filter(x => !/^mt/i.test(x));
            J = fresh();
            assert.deepEqual(ns.map(n => J.category(n, 'mt')), ns.map(mtRule));
            assert.equal(J.category(2, 'sq'), 'other', 'les autres langues ne changent pas');
        } finally { Intl.PluralRules = PR; fresh(); }
    });
    await t('dates et nombres : sq-AL / mt-MT si le navigateur les connaît, sinon en ; en-MT puis en, sans erreur', () => {
        const file = require.resolve('../assets/js/app-i18n.js');
        const fresh = () => { delete require.cache[file]; return require(file); };
        const DTF = Intl.DateTimeFormat.supportedLocalesOf, NF = Intl.NumberFormat.supportedLocalesOf;
        try {
            const J = fresh();
            assert.equal(J.intlLocale('sq'), Intl.DateTimeFormat.supportedLocalesOf(['sq-AL']).length ? 'sq-AL' : 'en');
            assert.equal(J.intlLocale('mt'), Intl.DateTimeFormat.supportedLocalesOf(['mt-MT']).length ? 'mt-MT' : 'en-MT');
            Intl.DateTimeFormat.supportedLocalesOf = l => DTF.call(Intl.DateTimeFormat, l).filter(x => !/^(sq|mt)/i.test(x));
            Intl.NumberFormat.supportedLocalesOf = l => NF.call(Intl.NumberFormat, l).filter(x => !/^(sq|mt)/i.test(x));
            const K = fresh(); K.setLang('mt', {persist: false});
            assert.equal(K.intlLocale('sq'), 'en'); assert.equal(K.intlLocale('mt'), 'en-MT'); assert.equal(K.locale(), 'en-MT');
            assert.equal(K.fmtDate(new Date(2020, 2, 5), {day: 'numeric', month: 'long', year: 'numeric'}), new Date(2020, 2, 5).toLocaleDateString('en-MT', {day: 'numeric', month: 'long', year: 'numeric'}));
            K.provide('mt', JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/mt.json'), 'utf8')));
            assert.equal(K.plural(2, 'personne'), '2 persuni', 'les pluriels restent maltais même quand les dates prennent le repli');
            assert.equal(K.intlLocale('lb'), Intl.DateTimeFormat.supportedLocalesOf(['lb-LU']).length ? 'lb-LU' : 'de-LU', 'les autres langues ne changent pas');
            Intl.DateTimeFormat.supportedLocalesOf = l => DTF.call(Intl.DateTimeFormat, l).filter(x => !/^(sq|mt|en-MT)/i.test(x));
            assert.equal(fresh().intlLocale('mt'), 'en');
        } finally {
            Intl.DateTimeFormat.supportedLocalesOf = DTF; Intl.NumberFormat.supportedLocalesOf = NF;
            fresh();
        }
    });
    let php = null;
    try { php = require('../electron/php-server'); } catch (_) {}
    const phpPath = php && php.findPhp([php.devBundledPhp()]);
    const runPhp = code => { const r = spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
    if (phpPath) await t('serveur (lib/i18n.php) : en-têtes sq et mt reconnus, pluriels à 2 et 5 formes, les autres langues inchangées', () => {
        const run = (l, txt, ns) => runPhp(`$_SERVER['HTTP_X_LCNDA_LANG']='${l}'; require 'lib/i18n.php'; echo json_encode(array_merge([i18n_lang(), i18n_t('${txt}')], array_map(fn ($n) => i18n_t('personne', ['n' => $n]), [${ns.join(', ')}])), JSON_UNESCAPED_UNICODE);`);
        assert.deepEqual(run('sq', 'Enregistrer', [1, 2, 0, 21, 1.5]), ['sq', 'Ruaj', 'person', 'persona', 'persona', 'persona', 'persona']);
        assert.deepEqual(run('mt', 'Enregistrer', [1, 2, 0, 3, 11, 20, 103, 1.5]), ['mt', 'Issejvja', 'persuna', 'persuni', 'persuni', 'persuni', 'persuna', 'persuna', 'persuni', 'persuna']);
        assert.deepEqual(run('lb', 'Enregistrer', [1, 2]).slice(0, 2), ['lb', 'Späicheren'], 'luxembourgeois inchangé');
        assert.deepEqual(run('is', 'Enregistrer', [1, 2, 21]).slice(0, 2), ['is', 'Vista'], 'islandais inchangé');
    });
    else console.log('· serveur : PHP introuvable, vérification sautée');
    if (phpPath) await t('serveur et navigateur : mêmes catégories de pluriel en mt (5 formes) et en sq, de 0 à 230 (et 0,1, 1,1, 1,5, 2,5, 3,5, 11,5)', () => {
        const ns = [...Array(231).keys(), 0.1, 1.1, 1.5, 2.5, 3.5, 11.5];
        const mt = runPhp(`require 'lib/i18n.php'; echo json_encode(array_map(fn ($n) => i18n_plural_cat('mt', $n), [${ns.join(', ')}]));`);
        assert.deepEqual(mt, ns.map(n => new Intl.PluralRules('mt').select(n)));
        assert.deepEqual(mt, ns.map(n => I.category(n, 'mt')));
        assert.deepEqual([...new Set(mt)].sort(), [...MT_FORMS].sort(), 'les 5 formes servent');
        const sq = runPhp(`require 'lib/i18n.php'; echo json_encode(array_map(fn ($n) => i18n_plural_cat('sq', $n) ?? ((float) $n == 1.0 ? 'one' : 'other'), [${ns.join(', ')}]));`);
        assert.deepEqual(sq, ns.map(n => new Intl.PluralRules('sq').select(n)));
    });
    console.log(`${failed ? '✗' : '✓'} sq, mt : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
