'use strict';
/* 🌐 Le turc (tr), 23ᵉ langue, ajouté après l’islandais. Mode d'emploi : docs/I18N.md (« Ajouter une langue »).
 *     node tests/test-i18n-nord8.js
 * Node seulement : tr déclaré partout (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord8/*.tsv
 * (« fr ¦ tr ») ; zones de base traduites en entier ; i18n-todo.js donne l’anglais et l’allemand seulement en aide (pas de
 * langue proche) ; pluriels turcs à 2 formes one|other (1 | le reste ; le nom reste au singulier après un nombre), dans le
 * navigateur (Intl.PluralRules) comme sur le serveur (lib/i18n.php) ; FAQ : recherche avec ı, İ, ş, ğ, ç, ö, ü ;
 * les noms de personnes gardent les capitales françaises (pas de « İ ») ; repli sur le français ; le français ne change pas.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const NEW = ['tr'];
const HEAD = 'fr ¦ tr';
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq', 'signaler', 'montage', 'reste4', 'reste5'];

(async () => {
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    await t('tr déclaré partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES.slice(22, 23), NEW); assert.equal(I.CODES.length, 23);
        assert.deepEqual([I.info('tr').name, I.info('tr').flag, I.info('tr').locale], ['Türkçe', '🇹🇷', 'tr-TR']);
        assert.ok(/const I18N_LANGS = \[[^\]]*'et', 'is', 'tr'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(14, 15), NEW); assert.deepEqual(F.NEW_LANGS.slice(14, 15), NEW); assert.equal(F.LANGS.length, 7);
        assert.equal(B.FORMS.tr, undefined, 'tr : one|other (FORMS.def)'); assert.equal(B.NAMES.tr, 'Türkçe');
        const j = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/tr.json'), 'utf8'));
        assert.equal(j._meta.lang, 'tr'); assert.equal(j._meta.ai, true); assert.ok(/nord8\/\*\.tsv/.test(j._meta.note), j._meta.note);
        const fq = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/faq/tr.json'), 'utf8'));
        assert.equal(fq._meta.lang, 'tr'); assert.equal(fq._meta.version, F.VERSION); assert.ok(fs.existsSync(path.join(root, 'assets/i18n/faq/src/tr')));
        assert.ok(/🇹🇷 Türkçe \(TR\)/.test(I.selectHtml()));
        const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');
        assert.ok(/\n {8}tr: w => /.test(more), 'FAQ : racines (tr)');
        assert.ok(/\n {8}tr: '/.test(more), 'FAQ : petits mots (tr)');
        assert.ok(/\n {8}tr: \{/.test(more), 'FAQ : synonymes (tr)');
        assert.ok(/\.replace\(\/ı\/g, 'i'\)/.test(more), 'FAQ : ı ramené à i (sinon il coupe les mots)');
    });
    await t('FAQ : le repli des lettres turques (ı, İ, ş, ğ, ç, ö, ü) donne des mots entiers', () => {
        const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');
        const src = more.match(/const faqFold = (t => .*);\n/)[1];
        const faqFold = eval(src); // eslint-disable-line no-eval
        const words = s => faqFold(s).split(/[^a-z0-9-]+/).filter(Boolean);
        assert.deepEqual(words('Fotoğrafı yazdır'), ['fotografi', 'yazdir']);
        assert.deepEqual(words('İÇE AKTAR · Şecere · Güncellemeler · Görünüm'), ['ice', 'aktar', 'secere', 'guncellemeler', 'gorunum']);
        assert.deepEqual(words('KAYDET ışık'), ['kaydet', 'isik']);
        assert.equal(faqFold('Émilie'), 'emilie', 'le français ne change pas');
    });
    await t('nord8/ : 1re ligne « fr ¦ tr », zones de base traduites en entier, aide en anglais et en allemand seulement', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) {
            const f = path.join(root, 'assets/i18n/src/nord8', `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], HEAD);
            const r = todo('tr', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.equal(r.dir, 'nord8');
        }
        assert.deepEqual(B.dirOf('tr'), {dir: 'nord8', head: HEAD});
        assert.deepEqual(todo('tr', 'listes').near, [], 'pas de langue proche : l’anglais et l’allemand suffisent');
        assert.deepEqual(todo('is', 'listes').near, ['nb', 'da'], 'les autres langues ne changent pas');
    });
    await t('nord8/ : pas de suffixe turc collé à une variable ({x}’in, {x}’de…)', () => {
        const bad = [];
        for (const f of fs.readdirSync(path.join(root, 'assets/i18n/src/nord8')).filter(x => x.endsWith('.tsv'))) {
            fs.readFileSync(path.join(root, 'assets/i18n/src/nord8', f), 'utf8').split('\n').slice(1).forEach((l, i) => {
                const v = l.split(' ¦ ')[1] || '';
                if (/\{[a-z_]+\}['’]?\p{Ll}/u.test(v)) bad.push(`${f}:${i + 2} ${v}`);
            });
        }
        assert.deepEqual(bad, []);
    });
    await t('i18n-check : 0 erreur, tr compté ; 2 formes de pluriel exigées', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8', maxBuffer: 64 << 20});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        assert.ok(/(⚠️ tr : \d+ textes encore sans traduction)|(✓ tr : tout est traduit)/.test(r.stdout));
        const {check} = require('../scripts/i18n-check.js');
        const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lcnda-i18n-nord8-'));
        try {
            fs.mkdirSync(path.join(tmp, 'nord8'));
            fs.writeFileSync(path.join(tmp, 'z.tsv'), 'fr\ten\tes\tde\tit\tpt\tpl\tnl\n=personne\tperson|people\tpersona|personas\tPerson|Personen\tpersona|persone\tpessoa|pessoas\tosoba|osoby|osób\tpersoon|personen\n');
            // un pluriel avec une forme de moins est une erreur
            fs.writeFileSync(path.join(tmp, 'nord8', 'z.tsv'), `${HEAD}\n=personne ¦ kişi\n`);
            const errs = check({src: tmp}).errors.join('\n');
            assert.ok(/\[tr\] pluriel incomplet \(1\/2 formes\)/.test(errs), errs.slice(0, 800));
            // les deux formes : pas d’erreur
            fs.writeFileSync(path.join(tmp, 'nord8', 'z.tsv'), `${HEAD}\n=personne ¦ kişi|kişi\n`);
            assert.deepEqual(check({src: tmp}).errors, []);
        } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
    });
    await t('t() en tr : traduit, repli, variables, contexte, guillemets “…”', () => {
        I.setLang('tr', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord'), I.t('Annuler')], ['Kaydet', 'Ayarlar', 'Bir hata bildir', 'Gösterge paneli', 'İptal']);
        assert.ok(/yapay zekâ/.test(I.t('Les traductions sont faites par une IA : le français reste la langue de référence.')));
        assert.ok(I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Ayarlar “Ma vue” adıyla saklandı.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Boşluk');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Bir kişi ekle…');
        I.setLang('fr', {persist: false});
    });
    await t('pluriels : turc 1 / le reste, le nom au singulier après un nombre', () => {
        I.setLang('tr', {persist: false});
        for (const [n, s] of [[1, '1 kişi'], [2, '2 kişi'], [0, '0 kişi'], [11, '11 kişi'], [21, '21 kişi'], [101, '101 kişi']]) assert.equal(I.plural(n, 'personne'), s, `tr ${n}`);
        assert.equal(I.plural(1, 'semaine'), '1 hafta'); assert.equal(I.plural(3, 'semaine'), '3 hafta');
        const J = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/tr.json'), 'utf8')).personne;
        assert.deepEqual(J, {one: 'kişi', other: 'kişi'});
        const R = new Intl.PluralRules('tr');
        assert.deepEqual([0, 1, 2, 21, 1.5].map(n => R.select(n)), ['other', 'one', 'other', 'other', 'other']);
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes'); assert.equal(I.plural(21, 'personne'), '21 personnes');
    });
    await t('jeux : un nom de personne garde les capitales françaises (pas de « İ ») en turc', () => {
        const src = fs.readFileSync(path.join(root, 'assets/js/app-jeu-famille.js'), 'utf8');
        assert.ok(/const UPN = sc => .*toLocaleUpperCase\('fr-FR'\)/.test(src), 'UPN : le nom en capitales françaises');
        assert.ok(!/UP\(scopeLabel\(g\./.test(src), 'plus de UP(scopeLabel(…)) qui mettrait le nom en capitales turques');
        assert.equal('Émilie'.toLocaleUpperCase('fr-FR'), 'ÉMILIE'); assert.equal('Émilie'.toLocaleUpperCase('tr-TR'), 'ÉMİLİE');
    });
    let php = null;
    try { php = require('../electron/php-server'); } catch (_) {}
    const phpPath = php && php.findPhp([php.devBundledPhp()]);
    if (phpPath) await t('serveur (lib/i18n.php) : en-tête tr reconnu, pluriels à 2 formes, les autres langues inchangées', () => {
        const run = (l, txt, ns) => JSON.parse(spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', `$_SERVER['HTTP_X_LCNDA_LANG']='${l}'; require 'lib/i18n.php'; echo json_encode(array_merge([i18n_lang(), i18n_t('${txt}')], array_map(fn ($n) => i18n_t('semaine', ['n' => $n]), [${ns.join(', ')}])), JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8'}).stdout);
        assert.deepEqual(run('tr', 'Enregistrer', [1, 2, 0, 21, 1.5]), ['tr', 'Kaydet', 'hafta', 'hafta', 'hafta', 'hafta', 'hafta']);
        assert.deepEqual(run('is', 'Enregistrer', [1, 2, 21]).slice(0, 2), ['is', 'Vista'], 'islandais inchangé');
        assert.deepEqual(run('et', 'Enregistrer', [1, 2]).slice(0, 2), ['et', 'Salvesta'], 'estonien inchangé');
    });
    else console.log('· serveur : PHP introuvable, vérification sautée');
    // la règle ordinaire du serveur (1 → one, sinon other ; i18n_plural_cat rend null) suit Intl.PluralRules('tr'), nombre par nombre
    if (phpPath) await t('serveur et navigateur : mêmes catégories de pluriel en tr, de 0 à 230 (et 0,1, 1,1, 1,5, 2,1)', () => {
        const ns = [...Array(231).keys(), 0.1, 1.1, 1.5, 2.1];
        const out = JSON.parse(spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', `require 'lib/i18n.php'; echo json_encode(array_map(fn ($n) => i18n_plural_cat('tr', $n) ?? ((float) $n == 1.0 ? 'one' : 'other'), [${ns.join(', ')}]));`], {cwd: root, encoding: 'utf8'}).stdout);
        const R = new Intl.PluralRules('tr');
        assert.deepEqual(out, ns.map(n => R.select(n)));
    });
    console.log(`${failed ? '✗' : '✓'} tr : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
