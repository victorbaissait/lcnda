'use strict';
/* 🌐 Le croate (hr) et le slovène (sl), 17ᵉ et 18ᵉ langues, ajoutés après le finnois et le hongrois. Mode d'emploi : docs/I18N.md (« Ajouter une langue »).
 *     node tests/test-i18n-nord5.js
 * Node seulement : hr et sl déclarés partout (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord5/*.tsv
 * (« fr ¦ hr ¦ sl ») ; zones de base traduites en entier ; i18n-todo.js donne le tchèque en aide (une seule colonne pour les deux) ;
 * pluriels croates à 3 formes (1, 21… | 2 à 4, 22 à 24… | le reste) et slovènes à 4 formes (1, 101… | 2, 102… | 3 et 4… | le reste),
 * dans le navigateur (Intl.PluralRules) comme sur le serveur (lib/i18n.php) ; repli sur le français ; le français ne change pas.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const NEW = ['hr', 'sl'];
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq', 'signaler', 'montage', 'reste4', 'reste5'];

(async () => {
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    await t('hr et sl déclarés partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES.slice(16, 18), NEW); assert.equal(I.CODES.length, 28);
        assert.deepEqual([I.info('hr').name, I.info('hr').flag, I.info('hr').locale], ['Hrvatski', '🇭🇷', 'hr-HR']);
        assert.deepEqual([I.info('sl').name, I.info('sl').flag, I.info('sl').locale], ['Slovenščina', '🇸🇮', 'sl-SI']);
        assert.ok(/const I18N_LANGS = \[[^\]]*'fi', 'hu', 'hr', 'sl'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(8, 10), NEW); assert.deepEqual(F.NEW_LANGS.slice(8, 10), NEW); assert.equal(F.LANGS.length, 7);
        assert.deepEqual(B.FORMS.hr, ['one', 'few', 'other']); assert.deepEqual(B.FORMS.sl, ['one', 'two', 'few', 'other']);
        assert.deepEqual([B.NAMES.hr, B.NAMES.sl], ['Hrvatski', 'Slovenščina']);
        for (const c of NEW) {
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.equal(j._meta.lang, c); assert.equal(j._meta.ai, true); assert.ok(/nord5\/\*\.tsv/.test(j._meta.note), j._meta.note);
            const fq = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/faq/${c}.json`), 'utf8'));
            assert.equal(fq._meta.lang, c); assert.ok(fs.existsSync(path.join(root, `assets/i18n/faq/src/${c}`)));
        }
        assert.ok(/🇭🇷 Hrvatski \(HR\)/.test(I.selectHtml()) && /🇸🇮 Slovenščina \(SL\)/.test(I.selectHtml()));
        const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');
        assert.ok(/\n {8}hr: w => /.test(more) && /\n {8}sl: w => /.test(more), 'FAQ : racines croates et slovènes');
        assert.ok(/\n {8}hr: '/.test(more) && /\n {8}sl: '/.test(more), 'FAQ : petits mots croates et slovènes');
        assert.ok(/\n {8}hr: \{/.test(more) && /\n {8}sl: \{/.test(more), 'FAQ : synonymes croates et slovènes');
    });
    await t('nord5/ : 1re ligne « fr ¦ hr ¦ sl », zones de base traduites en entier, aide en tchèque', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) {
            const f = path.join(root, 'assets/i18n/src/nord5', `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], 'fr ¦ hr ¦ sl');
            const r = todo('hr,sl', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.equal(r.dir, 'nord5');
        }
        assert.deepEqual(B.dirOf('hr'), {dir: 'nord5', head: 'fr ¦ hr ¦ sl'}); assert.deepEqual(B.dirOf('sl'), {dir: 'nord5', head: 'fr ¦ hr ¦ sl'});
        assert.deepEqual(todo('hr', 'listes').near, ['cs']); assert.deepEqual(todo('sl', 'listes').near, ['cs']);
        assert.deepEqual(todo('hr,sl', 'listes').near, ['cs'], 'une seule colonne d’aide pour les deux');
    });
    await t('i18n-check : 0 erreur, hr et sl comptés ; 3 formes en croate, 4 en slovène', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8', maxBuffer: 64 << 20});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        for (const c of NEW) assert.ok(new RegExp(`(⚠️ ${c} : \\d+ textes encore sans traduction)|(✓ ${c} : tout est traduit)`).test(r.stdout), c);
        // un pluriel avec une forme de moins est une erreur
        const {check} = require('../scripts/i18n-check.js');
        {
            const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lcnda-i18n-nord5-'));
            fs.mkdirSync(path.join(tmp, 'nord5'));
            fs.writeFileSync(path.join(tmp, 'z.tsv'), 'fr\ten\tes\tde\tit\tpt\tpl\tnl\n=personne\tperson|people\tpersona|personas\tPerson|Personen\tpersona|persone\tpessoa|pessoas\tosoba|osoby|osób\tpersoon|personen\n');
            fs.writeFileSync(path.join(tmp, 'nord5', 'z.tsv'), 'fr ¦ hr ¦ sl\n=personne ¦ osoba|osobe ¦ oseba|osebi|osebe\n');
            const errs = check({src: tmp}).errors.join('\n');
            assert.ok(/\[hr\] pluriel incomplet \(2\/3 formes\)/.test(errs) && /\[sl\] pluriel incomplet \(3\/4 formes\)/.test(errs), errs.slice(0, 800));
            fs.rmSync(tmp, {recursive: true, force: true});
        }
    });
    await t('t() en croate : traduit, repli, variables, contexte, guillemets „…”', () => {
        I.setLang('hr', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord')], ['Spremi', 'Postavke', 'Prijavi pogrešku', 'Nadzorna ploča']);
        assert.ok(/umjetna inteligencija/.test(I.t(I.AI_NOTE)) && I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Postavke spremljene pod nazivom „Ma vue”.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Razmaknica');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Dodaj osobu…');
        I.setLang('fr', {persist: false});
    });
    await t('t() en slovène : traduit, repli, variables, contexte, guillemets »…«', () => {
        I.setLang('sl', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord')], ['Shrani', 'Nastavitve', 'Prijavi napako', 'Nadzorna plošča']);
        assert.ok(/umetna inteligenca/.test(I.t(I.AI_NOTE)) && I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Nastavitve shranjene pod imenom »Ma vue«.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Preslednica');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Dodaj osebo…');
        I.setLang('fr', {persist: false});
    });
    await t('pluriels : croate 1 / 2 à 4 / le reste, slovène 1 / 2 / 3 et 4 / le reste', () => {
        I.setLang('hr', {persist: false});
        for (const [n, s] of [[1, '1 osoba'], [2, '2 osobe'], [4, '4 osobe'], [5, '5 osoba'], [0, '0 osoba'], [11, '11 osoba'], [12, '12 osoba'], [21, '21 osoba'], [22, '22 osobe'], [25, '25 osoba']]) assert.equal(I.plural(n, 'personne'), s, `hr ${n}`);
        I.setLang('sl', {persist: false});
        for (const [n, s] of [[1, '1 oseba'], [2, '2 osebi'], [3, '3 osebe'], [4, '4 osebe'], [5, '5 oseb'], [0, '0 oseb'], [11, '11 oseb'], [101, '101 oseba'], [102, '102 osebi'], [103, '103 osebe']]) assert.equal(I.plural(n, 'personne'), s, `sl ${n}`);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/hr.json'), 'utf8')).personne, {one: 'osoba', few: 'osobe', other: 'osoba'});
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/sl.json'), 'utf8')).personne, {one: 'oseba', two: 'osebi', few: 'osebe', other: 'oseb'});
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes');
    });
    let php = null;
    try { php = require('../electron/php-server'); } catch (_) {}
    const phpPath = php && php.findPhp([php.devBundledPhp()]);
    if (phpPath) await t('serveur (lib/i18n.php) : en-têtes hr et sl reconnus, pluriels à 3 et 4 formes, les autres langues inchangées', () => {
        const run = (l, txt, ns) => JSON.parse(spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', `$_SERVER['HTTP_X_LCNDA_LANG']='${l}'; require 'lib/i18n.php'; echo json_encode(array_merge([i18n_lang(), i18n_t('${txt}')], array_map(fn ($n) => i18n_t('personne', ['n' => $n]), [${ns.join(', ')}])), JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8'}).stdout);
        assert.deepEqual(run('hr', 'Enregistrer', [1, 2, 4, 5, 11, 21, 22, 25]), ['hr', 'Spremi', 'osoba', 'osobe', 'osobe', 'osoba', 'osoba', 'osoba', 'osobe', 'osoba']);
        assert.deepEqual(run('sl', 'Enregistrer', [1, 2, 3, 5, 0, 101, 102, 104]), ['sl', 'Shrani', 'oseba', 'osebi', 'osebe', 'oseb', 'oseb', 'oseba', 'osebi', 'osebe']);
        assert.deepEqual(run('ro', 'Enregistrer', [1, 5, 25]).slice(2), ['persoană', 'persoane', 'de persoane'], 'roumain inchangé');
        assert.deepEqual(run('fi', 'Enregistrer', [1, 25]).slice(2), ['henkilö', 'henkilöä'], 'finnois inchangé');
    });
    else console.log('· serveur : PHP introuvable, vérification sautée');
    console.log(`${failed ? '✗' : '✓'} hr, sl : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
