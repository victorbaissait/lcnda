'use strict';
/* 🌐 L’islandais (is), 22ᵉ langue, ajouté après le lituanien, le letton et l’estonien. Mode d'emploi : docs/I18N.md (« Ajouter une langue »).
 *     node tests/test-i18n-nord7.js
 * Node seulement : is déclaré partout (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord7/*.tsv
 * (« fr ¦ is ») ; zones de base traduites en entier ; i18n-todo.js donne le norvégien (bokmål) puis le danois en aide (deux
 * colonnes) ; pluriels islandais à 2 formes one|other (1, 21, 31, 101… sauf 11, 111… | le reste), dans le navigateur
 * (Intl.PluralRules) comme sur le serveur (lib/i18n.php) ; FAQ : recherche avec ð, þ, æ ; repli sur le français ; le
 * français ne change pas.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const NEW = ['is'];
const HEAD = 'fr ¦ is';
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq', 'signaler', 'montage', 'reste4', 'reste5'];

(async () => {
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    await t('is déclaré partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES.slice(21, 22), NEW); assert.equal(I.CODES.length, 32);
        assert.deepEqual([I.info('is').name, I.info('is').flag, I.info('is').locale], ['Íslenska', '🇮🇸', 'is-IS']);
        assert.ok(/const I18N_LANGS = \[[^\]]*'lt', 'lv', 'et', 'is'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(13, 14), NEW); assert.deepEqual(F.NEW_LANGS.slice(13, 14), NEW); assert.equal(F.LANGS.length, 7);
        assert.equal(B.FORMS.is, undefined, 'is : one|other (FORMS.def)'); assert.equal(B.NAMES.is, 'Íslenska');
        const j = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/is.json'), 'utf8'));
        assert.equal(j._meta.lang, 'is'); assert.equal(j._meta.ai, true); assert.ok(/nord7\/\*\.tsv/.test(j._meta.note), j._meta.note);
        const fq = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/faq/is.json'), 'utf8'));
        assert.equal(fq._meta.lang, 'is'); assert.equal(fq._meta.version, F.VERSION); assert.ok(fs.existsSync(path.join(root, 'assets/i18n/faq/src/is')));
        assert.ok(/🇮🇸 Íslenska \(IS\)/.test(I.selectHtml()));
        const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');
        assert.ok(/\n {8}is: w => /.test(more), 'FAQ : racines (is)');
        assert.ok(/\n {8}is: '/.test(more), 'FAQ : petits mots (is)');
        assert.ok(/\n {8}is: \{/.test(more), 'FAQ : synonymes (is)');
        assert.ok(/replace\(\/ð\/g, 'd'\)\.replace\(\/þ\/g, 'th'\)/.test(more), 'FAQ : ð et þ ramenés à d et th (sinon ils coupent les mots)');
    });
    await t('nord7/ : 1re ligne « fr ¦ is », zones de base traduites en entier, aide en norvégien puis en danois', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) {
            const f = path.join(root, 'assets/i18n/src/nord7', `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], HEAD);
            const r = todo('is', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.equal(r.dir, 'nord7');
        }
        assert.deepEqual(B.dirOf('is'), {dir: 'nord7', head: HEAD});
        assert.deepEqual(todo('is', 'listes').near, ['nb', 'da'], 'deux colonnes d’aide : nb puis da');
        assert.deepEqual(todo('lt,lv,et', 'listes').near, ['pl', 'fi'], 'les autres langues ne changent pas');
    });
    await t('i18n-check : 0 erreur, is compté ; 2 formes de pluriel exigées', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8', maxBuffer: 64 << 20});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        assert.ok(/(⚠️ is : \d+ textes encore sans traduction)|(✓ is : tout est traduit)/.test(r.stdout));
        const {check} = require('../scripts/i18n-check.js');
        const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lcnda-i18n-nord7-'));
        try {
            fs.mkdirSync(path.join(tmp, 'nord7'));
            fs.writeFileSync(path.join(tmp, 'z.tsv'), 'fr\ten\tes\tde\tit\tpt\tpl\tnl\n=personne\tperson|people\tpersona|personas\tPerson|Personen\tpersona|persone\tpessoa|pessoas\tosoba|osoby|osób\tpersoon|personen\n');
            // un pluriel avec une forme de moins est une erreur
            fs.writeFileSync(path.join(tmp, 'nord7', 'z.tsv'), `${HEAD}\n=personne ¦ einstaklingur\n`);
            const errs = check({src: tmp}).errors.join('\n');
            assert.ok(/\[is\] pluriel incomplet \(1\/2 formes\)/.test(errs), errs.slice(0, 800));
            // les deux formes : pas d’erreur
            fs.writeFileSync(path.join(tmp, 'nord7', 'z.tsv'), `${HEAD}\n=personne ¦ einstaklingur|einstaklingar\n`);
            assert.deepEqual(check({src: tmp}).errors, []);
        } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
    });
    await t('t() en is : traduit, repli, variables, contexte, guillemets „…“', () => {
        I.setLang('is', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord')], ['Vista', 'Stillingar', 'Tilkynna villu', 'Stjórnborð']);
        assert.ok(/gervigreind/.test(I.t('Les traductions sont faites par une IA : le français reste la langue de référence.')));
        assert.ok(I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Stillingar geymdar undir heitinu „Ma vue“.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Bilslá');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Bæta við einstaklingi…');
        I.setLang('fr', {persist: false});
    });
    await t('pluriels : islandais 1, 21, 31, 101… (sauf 11, 111…) / le reste', () => {
        I.setLang('is', {persist: false});
        for (const [n, s] of [[1, '1 einstaklingur'], [2, '2 einstaklingar'], [0, '0 einstaklingar'], [11, '11 einstaklingar'], [12, '12 einstaklingar'], [21, '21 einstaklingur'], [22, '22 einstaklingar'], [31, '31 einstaklingur'], [101, '101 einstaklingur'], [111, '111 einstaklingar']]) assert.equal(I.plural(n, 'personne'), s, `is ${n}`);
        assert.equal(I.plural(1, 'semaine'), '1 vika'); assert.equal(I.plural(3, 'semaine'), '3 vikur'); assert.equal(I.plural(21, 'semaine'), '21 vika');
        const J = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/is.json'), 'utf8')).personne;
        assert.deepEqual(J, {one: 'einstaklingur', other: 'einstaklingar'});
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes'); assert.equal(I.plural(21, 'personne'), '21 personnes');
    });
    let php = null;
    try { php = require('../electron/php-server'); } catch (_) {}
    const phpPath = php && php.findPhp([php.devBundledPhp()]);
    if (phpPath) await t('serveur (lib/i18n.php) : en-tête is reconnu, pluriels à 2 formes (21 au singulier), les autres langues inchangées', () => {
        const run = (l, txt, ns) => JSON.parse(spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', `$_SERVER['HTTP_X_LCNDA_LANG']='${l}'; require 'lib/i18n.php'; echo json_encode(array_merge([i18n_lang(), i18n_t('${txt}')], array_map(fn ($n) => i18n_t('personne', ['n' => $n]), [${ns.join(', ')}])), JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8'}).stdout);
        assert.deepEqual(run('is', 'Enregistrer', [1, 2, 0, 11, 21, 101, 111, 1.5]), ['is', 'Vista', 'einstaklingur', 'einstaklingar', 'einstaklingar', 'einstaklingar', 'einstaklingur', 'einstaklingur', 'einstaklingar', 'einstaklingar']);
        assert.deepEqual(run('et', 'Enregistrer', [1, 2, 21]), ['et', 'Salvesta', 'isik', 'isikut', 'isikut'], 'estonien inchangé');
        assert.deepEqual(run('lt', 'Enregistrer', [1, 2, 10]).slice(2), ['asmuo', 'asmenys', 'asmenų'], 'lituanien inchangé');
    });
    else console.log('· serveur : PHP introuvable, vérification sautée');
    // les catégories du serveur suivent celles du navigateur (Intl.PluralRules), nombre par nombre
    if (phpPath) await t('serveur et navigateur : mêmes catégories de pluriel en is, de 0 à 230 (et 0,1, 1,1, 1,5, 2,1, 11,1)', () => {
        const ns = [...Array(231).keys(), 0.1, 1.1, 1.5, 2.1, 11.1];
        const out = JSON.parse(spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', `require 'lib/i18n.php'; echo json_encode(array_map(fn ($n) => i18n_plural_cat('is', $n), [${ns.join(', ')}]));`], {cwd: root, encoding: 'utf8'}).stdout);
        const R = new Intl.PluralRules('is');
        assert.deepEqual(out, ns.map(n => R.select(n)));
    });
    console.log(`${failed ? '✗' : '✓'} is : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
