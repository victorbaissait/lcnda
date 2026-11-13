'use strict';
/* 🌐 Le finnois (fi) et le hongrois (hu), 15ᵉ et 16ᵉ langues, ajoutés après le roumain. Mode d'emploi : docs/I18N.md (« Ajouter une langue »).
 *     node tests/test-i18n-nord4.js
 * Node seulement : fi et hu déclarés partout (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord4/*.tsv
 * (« fr ¦ fi ¦ hu ») ; zones de base traduites en entier ; i18n-todo.js donne le suédois en aide pour le finnois (l'allemand,
 * déjà là, pour le hongrois) ; pluriels à 2 formes (hongrois : le nom reste au singulier après un nombre, « 5 személy ») ;
 * repli sur le français ; le français ne change pas ; serveur (lib/i18n.php).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const NEW = ['fi', 'hu'];
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq', 'signaler', 'montage', 'reste4', 'reste5'];

(async () => {
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    await t('fi et hu déclarés partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES.slice(14, 16), NEW); assert.equal(I.CODES.length, 32);
        assert.deepEqual([I.info('fi').name, I.info('fi').flag, I.info('fi').locale], ['Suomi', '🇫🇮', 'fi-FI']);
        assert.deepEqual([I.info('hu').name, I.info('hu').flag, I.info('hu').locale], ['Magyar', '🇭🇺', 'hu-HU']);
        assert.ok(/const I18N_LANGS = \[[^\]]*'nb', 'ro', 'fi', 'hu'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(6, 8), NEW); assert.deepEqual(F.NEW_LANGS.slice(6, 8), NEW); assert.equal(F.LANGS.length, 7);
        assert.deepEqual([B.FORMS.fi, B.FORMS.hu], [undefined, undefined], 'fi et hu : one|other (FORMS.def)');
        assert.deepEqual([B.NAMES.fi, B.NAMES.hu], ['Suomi', 'Magyar']);
        for (const c of NEW) {
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.equal(j._meta.lang, c); assert.equal(j._meta.ai, true); assert.ok(/nord4\/\*\.tsv/.test(j._meta.note), j._meta.note);
            const fq = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/faq/${c}.json`), 'utf8'));
            assert.equal(fq._meta.lang, c); assert.ok(fs.existsSync(path.join(root, `assets/i18n/faq/src/${c}`)));
        }
        assert.ok(/🇫🇮 Suomi \(FI\)/.test(I.selectHtml()) && /🇭🇺 Magyar \(HU\)/.test(I.selectHtml()));
        const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');
        assert.ok(/\n {8}fi: w => /.test(more) && /\n {8}hu: w => /.test(more), 'FAQ : racines finnoises et hongroises');
        assert.ok(/\n {8}fi: '/.test(more) && /\n {8}hu: '/.test(more), 'FAQ : petits mots finnois et hongrois');
    });
    await t('nord4/ : 1re ligne « fr ¦ fi ¦ hu », zones de base traduites en entier, aide en suédois pour fi', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) {
            const f = path.join(root, 'assets/i18n/src/nord4', `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], 'fr ¦ fi ¦ hu');
            const r = todo('fi,hu', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.equal(r.dir, 'nord4');
        }
        assert.deepEqual(B.dirOf('fi'), {dir: 'nord4', head: 'fr ¦ fi ¦ hu'}); assert.deepEqual(B.dirOf('hu'), {dir: 'nord4', head: 'fr ¦ fi ¦ hu'});
        assert.deepEqual(todo('fi', 'listes').near, ['sv']);
        assert.deepEqual(todo('hu', 'listes').near, [], 'hu : l’allemand est déjà en aide, pas de colonne en double');
        assert.deepEqual(todo('fi,hu', 'listes').near, ['sv']);
    });
    await t('i18n-check : 0 erreur, fi et hu comptés', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8', maxBuffer: 64 << 20});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        for (const c of NEW) assert.ok(new RegExp(`(⚠️ ${c} : \\d+ textes encore sans traduction)|(✓ ${c} : tout est traduit)`).test(r.stdout), c);
    });
    await t('t() en finnois : traduit, repli, variables, contexte, guillemets ”…”', () => {
        I.setLang('fi', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord')], ['Tallenna', 'Asetukset', 'Ilmoita virheestä', 'Kojelauta']);
        assert.ok(/Tekoäly/.test(I.t(I.AI_NOTE)) && I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Asetukset säilytetty nimellä ”Ma vue”.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Välilyönti');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Lisää henkilö…');
        I.setLang('fr', {persist: false});
    });
    await t('t() en hongrois : traduit, repli, variables, contexte, guillemets „…”', () => {
        I.setLang('hu', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord')], ['Mentés', 'Beállítások', 'Hiba jelzése', 'Irányítópult']);
        assert.ok(/\bMI\b/.test(I.t(I.AI_NOTE)) && I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Beállítások megőrizve „Ma vue” néven.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Szóköz');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Személy hozzáadása…');
        I.setLang('fr', {persist: false});
    });
    await t('pluriels : finnois 1 / le reste (partitif), hongrois singulier après un nombre', () => {
        I.setLang('fi', {persist: false});
        for (const [n, s] of [[1, '1 henkilö'], [0, '0 henkilöä'], [2, '2 henkilöä'], [20, '20 henkilöä']]) assert.equal(I.plural(n, 'personne'), s, `fi ${n}`);
        I.setLang('hu', {persist: false});
        for (const [n, s] of [[1, '1 személy'], [0, '0 személy'], [5, '5 személy'], [20, '20 személy']]) assert.equal(I.plural(n, 'personne'), s, `hu ${n}`);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/fi.json'), 'utf8')).personne, {one: 'henkilö', other: 'henkilöä'});
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/hu.json'), 'utf8')).personne, {one: 'személy', other: 'személy'});
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes');
    });
    let php = null;
    try { php = require('../electron/php-server'); } catch (_) {}
    const phpPath = php && php.findPhp([php.devBundledPhp()]);
    if (phpPath) await t('serveur (lib/i18n.php) : en-têtes fi et hu reconnus, pluriel à 2 formes', () => {
        const run = (l, txt) => JSON.parse(spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', `$_SERVER['HTTP_X_LCNDA_LANG']='${l}'; require 'lib/i18n.php'; echo json_encode([i18n_lang(), i18n_t('${txt}'), i18n_t('personne', ['n' => 25]), i18n_t('personne', ['n' => 1])], JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8'}).stdout);
        assert.deepEqual(run('fi', 'Enregistrer'), ['fi', 'Tallenna', 'henkilöä', 'henkilö']);
        assert.deepEqual(run('hu', 'Enregistrer'), ['hu', 'Mentés', 'személy', 'személy']);
    });
    else console.log('· serveur : PHP introuvable, vérification sautée');
    console.log(`${failed ? '✗' : '✓'} fi, hu : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
