'use strict';
/* 🌐 Le roumain (ro), 14ᵉ langue, ajouté après sk / nb. Mode d'emploi : docs/I18N.md (« Ajouter une langue »).
 *     node tests/test-i18n-nord3.js
 * Node seulement : ro déclaré partout (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord3/*.tsv (« fr ¦ ro ») ;
 * zones de base traduites en entier ; i18n-todo.js donne l'italien en aide ; pluriels roumains à 3 formes
 * (1 | 0 et 2 à 19 | 20 et plus, « 20 de persoane ») ; repli sur le français ; le français ne change pas ; serveur (lib/i18n.php).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq', 'signaler', 'montage', 'reste4', 'reste5'];

(async () => {
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    await t('ro déclaré partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.equal(I.CODES[13], 'ro'); assert.equal(I.CODES.length, 22);
        assert.deepEqual([I.info('ro').name, I.info('ro').flag, I.info('ro').locale], ['Română', '🇷🇴', 'ro-RO']);
        assert.ok(/const I18N_LANGS = \[[^\]]*'nb', 'ro'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.ok(B.NEW_LANGS.includes('ro') && F.NEW_LANGS.includes('ro'));
        assert.deepEqual(B.FORMS.ro, ['one', 'few', 'other']); assert.equal(B.NAMES.ro, 'Română');
        const j = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/ro.json'), 'utf8'));
        assert.equal(j._meta.lang, 'ro'); assert.equal(j._meta.ai, true); assert.ok(/nord3\/\*\.tsv/.test(j._meta.note), j._meta.note);
        const fq = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/faq/ro.json'), 'utf8'));
        assert.equal(fq._meta.lang, 'ro'); assert.ok(fs.existsSync(path.join(root, 'assets/i18n/faq/src/ro')));
        assert.ok(/🇷🇴 Română \(RO\)/.test(I.selectHtml()));
        assert.ok(/\n {8}ro: w => /.test(fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8')), 'FAQ : racines roumaines');
    });
    await t('nord3/ : 1re ligne « fr ¦ ro », zones de base traduites en entier, aide en italien', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) {
            const f = path.join(root, 'assets/i18n/src/nord3', `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], 'fr ¦ ro');
            const r = todo('ro', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.equal(r.dir, 'nord3');
        }
        assert.deepEqual(B.dirOf('ro'), {dir: 'nord3', head: 'fr ¦ ro'});
        assert.deepEqual(todo('ro', 'listes').near, ['it']);
    });
    await t('i18n-check : 0 erreur, ro compté', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8', maxBuffer: 64 << 20});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        assert.ok(/(⚠️ ro : \d+ textes encore sans traduction)|(✓ ro : tout est traduit)/.test(r.stdout));
    });
    await t('t() en roumain : traduit, repli, variables, contexte, guillemets „…”', () => {
        I.setLang('ro', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord')], ['Salvează', 'Setări', 'Raportează o greșeală', 'Tablou de bord']);
        assert.ok(/\bIA\b/.test(I.t(I.AI_NOTE)) && I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Setări păstrate sub numele „Ma vue”.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Spațiu');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Adaugă o persoană…');
        I.setLang('fr', {persist: false});
    });
    await t('pluriels roumains : 1 / 0 et 2 à 19 / 20 et plus (« de »)', () => {
        I.setLang('ro', {persist: false});
        const want = [[1, '1 persoană'], [0, '0 persoane'], [2, '2 persoane'], [19, '19 persoane'], [20, '20 de persoane'], [101, '101 persoane'], [120, '120 de persoane']];
        for (const [n, s] of want) assert.equal(I.plural(n, 'personne'), s, `ro ${n}`);
        const j = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/ro.json'), 'utf8'));
        assert.deepEqual(j.personne, {one: 'persoană', few: 'persoane', other: 'de persoane'});
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes');
    });
    let php = null;
    try { php = require('../electron/php-server'); } catch (_) {}
    const phpPath = php && php.findPhp([php.devBundledPhp()]);
    if (phpPath) await t('serveur (lib/i18n.php) : en-tête ro reconnu, pluriel roumain (one / few / other)', () => {
        const out = spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', `$_SERVER['HTTP_X_LCNDA_LANG']='ro'; require 'lib/i18n.php'; echo json_encode([i18n_lang(), i18n_t('Enregistrer'), i18n_t('personne', ['n' => 25]), i18n_t('personne', ['n' => 5]), i18n_t('personne', ['n' => 1])], JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8'});
        assert.deepEqual(JSON.parse(out.stdout), ['ro', 'Salvează', 'de persoane', 'persoane', 'persoană']);
    });
    console.log(`${failed ? '✗' : '✓'} ro : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
