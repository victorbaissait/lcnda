'use strict';
/* 🌐 Le luxembourgeois (lb), 24ᵉ langue, ajouté après le turc. Mode d'emploi : docs/I18N.md (« Ajouter une langue »).
 *     node tests/test-i18n-nord9.js
 * Node seulement : lb déclaré partout (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord9/*.tsv
 * (« fr ¦ lb ») ; zones de base traduites en entier, guillemets „…“ ; i18n-todo.js donne l’anglais et l’allemand en aide
 * (l’allemand est la langue proche, déjà là) ; pluriels à 2 formes one|other (1 | le reste), dans le navigateur
 * (Intl.PluralRules) comme sur le serveur (lib/i18n.php) ; dates et nombres : lb-LU, ou de-LU / fr-LU quand le navigateur
 * ne connaît pas le luxembourgeois ; FAQ : recherche avec ë, é, ä ; repli sur le français ; le français ne change pas.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const NEW = ['lb'];
const HEAD = 'fr ¦ lb';
const DIR = path.join(root, 'assets/i18n/src/nord9');
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq', 'signaler', 'montage', 'reste4', 'reste5'];

(async () => {
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    await t('lb déclaré partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES.slice(23, 24), NEW); assert.equal(I.CODES.length, 26);
        assert.deepEqual([I.info('lb').name, I.info('lb').flag, I.info('lb').locale], ['Lëtzebuergesch', '🇱🇺', 'lb-LU']);
        assert.ok(/const I18N_LANGS = \[[^\]]*'is', 'tr', 'lb'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(15, 16), NEW); assert.deepEqual(F.NEW_LANGS.slice(15, 16), NEW); assert.equal(F.LANGS.length, 7);
        assert.equal(B.FORMS.lb, undefined, 'lb : one|other (FORMS.def)'); assert.equal(B.NAMES.lb, 'Lëtzebuergesch');
        const j = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/lb.json'), 'utf8'));
        assert.equal(j._meta.lang, 'lb'); assert.equal(j._meta.ai, true); assert.ok(/nord9\/\*\.tsv/.test(j._meta.note), j._meta.note);
        const fq = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/faq/lb.json'), 'utf8'));
        assert.equal(fq._meta.lang, 'lb'); assert.equal(fq._meta.version, F.VERSION); assert.ok(fs.existsSync(path.join(root, 'assets/i18n/faq/src/lb')));
        assert.ok(/🇱🇺 Lëtzebuergesch \(LB\)/.test(I.selectHtml()));
        const idx = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
        assert.ok(idx.includes(`assets/js/app-i18n.js?v=${I.VERSION}"`), 'index.php : ?v= de app-i18n.js = VERSION');
        const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');
        assert.ok(/\n {8}lb: w => /.test(more), 'FAQ : racines (lb)');
        assert.ok(/\n {8}lb: '/.test(more), 'FAQ : petits mots (lb)');
        assert.ok(/\n {8}lb: \{/.test(more), 'FAQ : synonymes (lb)');
    });
    await t('FAQ : les lettres luxembourgeoises (ë, é, ä) sont ramenées à e, e, a ; racines comme l’allemand', () => {
        const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');
        const faqFold = eval(more.match(/const faqFold = (t => .*);\n/)[1]); // eslint-disable-line no-eval
        const stem = eval(more.match(/\n {8}lb: (w => \(w\.length > 4 \? w\.replace\(\/[^\n]*?: w\)),/)[1]); // eslint-disable-line no-eval
        const words = s => faqFold(s).split(/[^a-z0-9-]+/).filter(Boolean);
        assert.deepEqual(words('Lëtzebuergesch : Fotoen drécken, Hochzäit, Léifst'), ['letzebuergesch', 'fotoen', 'drecken', 'hochzait', 'leifst']);
        assert.deepEqual(words('ASTELLUNGEN · Läschen'), ['astellungen', 'laschen']);
        assert.equal(stem('fotoen'), 'foto', 'pluriel en -en réduit'); assert.equal(stem('foto'), 'foto');
        assert.equal(stem('astellungen'), 'astell'); assert.equal(stem('astellung'), 'astell');
        assert.equal(faqFold('Émilie'), 'emilie', 'le français ne change pas');
    });
    await t('nord9/ : 1re ligne « fr ¦ lb », zones de base traduites en entier, aide en anglais et en allemand', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) {
            const f = path.join(DIR, `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], HEAD);
            const r = todo('lb', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.equal(r.dir, 'nord9');
        }
        assert.deepEqual(B.dirOf('lb'), {dir: 'nord9', head: HEAD});
        assert.deepEqual(todo('lb', 'listes').near, [], 'langue proche : l’allemand, déjà dans l’aide');
        assert.deepEqual(todo('tr', 'listes').near, [], 'les autres langues ne changent pas');
        assert.deepEqual(todo('is', 'listes').near, ['nb', 'da']);
    });
    await t('nord9/ : guillemets „…“ (jamais « » ni ” ; chaque „ fermé par “), mêmes variables {x} et balises que le français', () => {
        const bad = [];
        for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.tsv'))) {
            fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').slice(1).forEach((l, i) => {
                if (!l.trim() || l.startsWith('#')) return;
                const [k, v = ''] = l.split(' ¦ ');
                const vars = s => (k.startsWith('=') ? [...new Set(s.match(/\{[a-z_]+\}/gi) || [])] : (s.match(/\{[a-z_]+\}/gi) || [])).sort().join(' ');
                const tags = s => (s.match(/<\/?[a-z]+>/gi) || []).sort().join(' ');
                if (/[«»]/.test(v) && !/« »|\|»|\? »\)/.test(k)) bad.push(`${f}:${i + 2} « » : ${v}`);
                if (/”/.test(v)) bad.push(`${f}:${i + 2} ” : ${v}`);
                if ((v.match(/„/g) || []).length !== (v.match(/“/g) || []).length) bad.push(`${f}:${i + 2} „ sans “ : ${v}`);
                if (vars(k) !== vars(v)) bad.push(`${f}:${i + 2} variables : ${v}`);
                if (tags(k) !== tags(v)) bad.push(`${f}:${i + 2} balises : ${v}`);
                if (!v.trim()) bad.push(`${f}:${i + 2} vide`);
            });
        }
        assert.deepEqual(bad, []);
    });
    await t('i18n-check : 0 erreur, lb compté ; 2 formes de pluriel exigées', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8', maxBuffer: 64 << 20});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        assert.ok(/(⚠️ lb : \d+ textes encore sans traduction)|(✓ lb : tout est traduit)/.test(r.stdout));
        const {check} = require('../scripts/i18n-check.js');
        const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lcnda-i18n-nord9-'));
        try {
            fs.mkdirSync(path.join(tmp, 'nord9'));
            fs.writeFileSync(path.join(tmp, 'z.tsv'), 'fr\ten\tes\tde\tit\tpt\tpl\tnl\n=personne\tperson|people\tpersona|personas\tPerson|Personen\tpersona|persone\tpessoa|pessoas\tosoba|osoby|osób\tpersoon|personen\n');
            fs.writeFileSync(path.join(tmp, 'nord9', 'z.tsv'), `${HEAD}\n=personne ¦ Persoun\n`);
            const errs = check({src: tmp}).errors.join('\n');
            assert.ok(/\[lb\] pluriel incomplet \(1\/2 formes\)/.test(errs), errs.slice(0, 800));
            fs.writeFileSync(path.join(tmp, 'nord9', 'z.tsv'), `${HEAD}\n=personne ¦ Persoun|Persounen\n`);
            assert.deepEqual(check({src: tmp}).errors, []);
        } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
    });
    await t('t() en lb : traduit, repli, variables, contexte, guillemets „…“', () => {
        I.setLang('lb', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord'), I.t('Annuler'), I.t('↶ Annuler')], ['Späicheren', 'Astellungen', 'E Feeler mellen', 'Dashboard', 'Ofbriechen', '↶ Réckgängeg']);
        assert.ok(/KI/.test(I.t('Les traductions sont faites par une IA : le français reste la langue de référence.')));
        assert.ok(I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Astellungen ënner „Ma vue“ gespäichert.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Leertast');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Eng Persoun derbäisetzen…');
        I.setLang('fr', {persist: false});
    });
    await t('pluriels : luxembourgeois 1 / le reste (Persoun / Persounen)', () => {
        I.setLang('lb', {persist: false});
        for (const [n, s] of [[1, '1 Persoun'], [2, '2 Persounen'], [0, '0 Persounen'], [11, '11 Persounen'], [21, '21 Persounen'], [101, '101 Persounen']]) assert.equal(I.plural(n, 'personne'), s, `lb ${n}`);
        assert.equal(I.plural(1, 'semaine'), '1 Woch'); assert.equal(I.plural(3, 'semaine'), '3 Wochen');
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/lb.json'), 'utf8')).personne, {one: 'Persoun', other: 'Persounen'});
        const R = new Intl.PluralRules('lb');
        assert.deepEqual([0, 1, 2, 21, 1.5].map(n => R.select(n)), ['other', 'one', 'other', 'other', 'other']);
        assert.deepEqual([0, 1, 2, 21, 1.5].map(n => I.category(n, 'lb')), ['other', 'one', 'other', 'other', 'other']);
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes');
    });
    await t('dates et nombres : lb-LU si le navigateur le connaît, sinon de-LU (puis fr-LU), sans erreur', () => {
        const file = require.resolve('../assets/js/app-i18n.js');
        const fresh = () => { delete require.cache[file]; return require(file); };
        const DTF = Intl.DateTimeFormat.supportedLocalesOf, NF = Intl.NumberFormat.supportedLocalesOf;
        try {
            const J = fresh(); J.setLang('lb', {persist: false});
            assert.equal(J.intlLocale('lb'), Intl.DateTimeFormat.supportedLocalesOf(['lb-LU']).length ? 'lb-LU' : 'de-LU');
            // un navigateur sans le luxembourgeois (Chrome, Safari…) : repli sur l’allemand du Luxembourg
            Intl.DateTimeFormat.supportedLocalesOf = l => DTF.call(Intl.DateTimeFormat, l).filter(x => !/^lb/i.test(x));
            Intl.NumberFormat.supportedLocalesOf = l => NF.call(Intl.NumberFormat, l).filter(x => !/^lb/i.test(x));
            const K = fresh(); K.setLang('lb', {persist: false});
            assert.equal(K.intlLocale('lb'), 'de-LU'); assert.equal(K.locale(), 'de-LU');
            assert.equal(K.fmtDate(new Date(2020, 2, 5), {day: 'numeric', month: 'long', year: 'numeric'}), new Date(2020, 2, 5).toLocaleDateString('de-LU', {day: 'numeric', month: 'long', year: 'numeric'}));
            assert.equal(K.plural(2, 'personne'), '2 Persounen');
            assert.equal(K.intlLocale('tr'), 'tr-TR', 'les autres langues ne changent pas');
            // ni le luxembourgeois ni l’allemand du Luxembourg : le français du Luxembourg
            Intl.DateTimeFormat.supportedLocalesOf = l => DTF.call(Intl.DateTimeFormat, l).filter(x => !/^(lb|de)/i.test(x));
            assert.equal(fresh().intlLocale('lb'), 'fr-LU');
        } finally {
            Intl.DateTimeFormat.supportedLocalesOf = DTF; Intl.NumberFormat.supportedLocalesOf = NF;
            fresh();
        }
    });
    let php = null;
    try { php = require('../electron/php-server'); } catch (_) {}
    const phpPath = php && php.findPhp([php.devBundledPhp()]);
    if (phpPath) await t('serveur (lib/i18n.php) : en-tête lb reconnu, pluriels à 2 formes, les autres langues inchangées', () => {
        const run = (l, txt, ns) => JSON.parse(spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', `$_SERVER['HTTP_X_LCNDA_LANG']='${l}'; require 'lib/i18n.php'; echo json_encode(array_merge([i18n_lang(), i18n_t('${txt}')], array_map(fn ($n) => i18n_t('semaine', ['n' => $n]), [${ns.join(', ')}])), JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8'}).stdout);
        assert.deepEqual(run('lb', 'Enregistrer', [1, 2, 0, 21, 1.5]), ['lb', 'Späicheren', 'Woch', 'Wochen', 'Wochen', 'Wochen', 'Wochen']);
        assert.deepEqual(run('tr', 'Enregistrer', [1, 2]).slice(0, 2), ['tr', 'Kaydet'], 'turc inchangé');
        assert.deepEqual(run('is', 'Enregistrer', [1, 2, 21]).slice(0, 2), ['is', 'Vista'], 'islandais inchangé');
    });
    else console.log('· serveur : PHP introuvable, vérification sautée');
    if (phpPath) await t('serveur et navigateur : mêmes catégories de pluriel en lb, de 0 à 230 (et 0,1, 1,1, 1,5, 2,1)', () => {
        const ns = [...Array(231).keys(), 0.1, 1.1, 1.5, 2.1];
        const out = JSON.parse(spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', `require 'lib/i18n.php'; echo json_encode(array_map(fn ($n) => i18n_plural_cat('lb', $n) ?? ((float) $n == 1.0 ? 'one' : 'other'), [${ns.join(', ')}]));`], {cwd: root, encoding: 'utf8'}).stdout);
        const R = new Intl.PluralRules('lb');
        assert.deepEqual(out, ns.map(n => R.select(n)));
    });
    console.log(`${failed ? '✗' : '✓'} lb : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
