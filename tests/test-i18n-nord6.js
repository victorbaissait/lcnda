'use strict';
/* 🌐 Le lituanien (lt), le letton (lv) et l’estonien (et), 19ᵉ, 20ᵉ et 21ᵉ langues, ajoutés après le croate et le slovène. Mode d'emploi : docs/I18N.md (« Ajouter une langue »).
 *     node tests/test-i18n-nord6.js
 * Node seulement : lt, lv et et déclarés partout (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord6/*.tsv
 * (« fr ¦ lt ¦ lv ¦ et ») ; zones de base traduites en entier ; i18n-todo.js donne le polonais (aide pour lt et lv) et le finnois
 * (aide pour et) ; pluriels lituaniens à 3 formes (1, 21… | 2 à 9, 22 à 29… | 0, 10 à 20…), lettons à 3 formes dans l’ordre
 * zero|one|other (0, 10 à 20… | 1, 21… | le reste) et estoniens à 2 formes, dans le navigateur (Intl.PluralRules) comme sur le
 * serveur (lib/i18n.php) ; repli sur le français ; le français ne change pas.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const NEW = ['lt', 'lv', 'et'];
const HEAD = 'fr ¦ lt ¦ lv ¦ et';
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq', 'signaler', 'montage', 'reste4', 'reste5'];

(async () => {
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    await t('lt, lv et et déclarés partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES.slice(18, 21), NEW); assert.equal(I.CODES.length, 32);
        assert.deepEqual([I.info('lt').name, I.info('lt').flag, I.info('lt').locale], ['Lietuvių', '🇱🇹', 'lt-LT']);
        assert.deepEqual([I.info('lv').name, I.info('lv').flag, I.info('lv').locale], ['Latviešu', '🇱🇻', 'lv-LV']);
        assert.deepEqual([I.info('et').name, I.info('et').flag, I.info('et').locale], ['Eesti', '🇪🇪', 'et-EE']);
        assert.ok(/const I18N_LANGS = \[[^\]]*'hr', 'sl', 'lt', 'lv', 'et'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(10, 13), NEW); assert.deepEqual(F.NEW_LANGS.slice(10, 13), NEW); assert.equal(F.LANGS.length, 7);
        assert.deepEqual(B.FORMS.lt, ['one', 'few', 'other']); assert.deepEqual(B.FORMS.lv, ['zero', 'one', 'other']); assert.equal(B.FORMS.et, undefined, 'et : one|other (FORMS.def)');
        assert.deepEqual([B.NAMES.lt, B.NAMES.lv, B.NAMES.et], ['Lietuvių', 'Latviešu', 'Eesti']);
        for (const c of NEW) {
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.equal(j._meta.lang, c); assert.equal(j._meta.ai, true); assert.ok(/nord6\/\*\.tsv/.test(j._meta.note), j._meta.note);
            const fq = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/faq/${c}.json`), 'utf8'));
            assert.equal(fq._meta.lang, c); assert.ok(fs.existsSync(path.join(root, `assets/i18n/faq/src/${c}`)));
        }
        assert.ok(/🇱🇹 Lietuvių \(LT\)/.test(I.selectHtml()) && /🇱🇻 Latviešu \(LV\)/.test(I.selectHtml()) && /🇪🇪 Eesti \(ET\)/.test(I.selectHtml()));
        const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');
        for (const c of NEW) {
            assert.ok(new RegExp(`\\n {8}${c}: w => `).test(more), `FAQ : racines (${c})`);
            assert.ok(new RegExp(`\\n {8}${c}: '`).test(more), `FAQ : petits mots (${c})`);
            assert.ok(new RegExp(`\\n {8}${c}: \\{`).test(more), `FAQ : synonymes (${c})`);
        }
    });
    await t('nord6/ : 1re ligne « fr ¦ lt ¦ lv ¦ et », zones de base traduites en entier, aide en polonais et en finnois', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) {
            const f = path.join(root, 'assets/i18n/src/nord6', `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], HEAD);
            const r = todo('lt,lv,et', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.equal(r.dir, 'nord6');
        }
        for (const c of NEW) assert.deepEqual(B.dirOf(c), {dir: 'nord6', head: HEAD});
        assert.deepEqual(todo('lt', 'listes').near, ['pl']); assert.deepEqual(todo('lv', 'listes').near, ['pl']); assert.deepEqual(todo('et', 'listes').near, ['fi']);
        assert.deepEqual(todo('lt,lv,et', 'listes').near, ['pl', 'fi'], 'deux colonnes d’aide pour les trois');
    });
    await t('i18n-check : 0 erreur, lt, lv et et comptés ; 3 formes en lituanien et en letton, 2 en estonien', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8', maxBuffer: 64 << 20});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        for (const c of NEW) assert.ok(new RegExp(`(⚠️ ${c} : \\d+ textes encore sans traduction)|(✓ ${c} : tout est traduit)`).test(r.stdout), c);
        const {check} = require('../scripts/i18n-check.js');
        const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lcnda-i18n-nord6-'));
        try {
            fs.mkdirSync(path.join(tmp, 'nord6'));
            fs.writeFileSync(path.join(tmp, 'z.tsv'), 'fr\ten\tes\tde\tit\tpt\tpl\tnl\n=personne\tperson|people\tpersona|personas\tPerson|Personen\tpersona|persone\tpessoa|pessoas\tosoba|osoby|osób\tpersoon|personen\n');
            // un pluriel avec une forme de moins est une erreur
            fs.writeFileSync(path.join(tmp, 'nord6', 'z.tsv'), `${HEAD}\n=personne ¦ asmuo|asmenys ¦ persona|personas ¦ isik\n`);
            const errs = check({src: tmp}).errors.join('\n');
            assert.ok(/\[lt\] pluriel incomplet \(2\/3 formes\)/.test(errs) && /\[lv\] pluriel incomplet \(2\/3 formes\)/.test(errs) && /\[et\] pluriel incomplet \(1\/2 formes\)/.test(errs), errs.slice(0, 800));
            // toutes les formes : pas d’erreur
            fs.writeFileSync(path.join(tmp, 'nord6', 'z.tsv'), `${HEAD}\n=personne ¦ asmuo|asmenys|asmenų ¦ personas|persona|personas ¦ isik|isikut\n`);
            assert.deepEqual(check({src: tmp}).errors, []);
        } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
    });
    const LANG = {
        lt: {words: ['Išsaugoti', 'Nustatymai', 'Pranešti apie klaidą', 'Prietaisų skydelis'], ai: /dirbtinis intelektas/, saved: 'Nustatymai išsaugoti pavadinimu „Ma vue“.', space: 'Tarpas', add: '＋ Pridėti asmenį…'},
        lv: {words: ['Saglabāt', 'Iestatījumi', 'Ziņot par kļūdu', 'Informācijas panelis'], ai: /mākslīgais intelekts/, saved: 'Iestatījumi saglabāti ar nosaukumu „Ma vue“.', space: 'Atstarpe', add: '＋ Pievienot personu…'},
        et: {words: ['Salvesta', 'Seaded', 'Teata veast', 'Töölaud'], ai: /tehisintellekt/, saved: 'Seaded salvestatud nimega „Ma vue“.', space: 'Tühik', add: '＋ Lisa isik…'},
    };
    for (const c of NEW) await t(`t() en ${c} : traduit, repli, variables, contexte, guillemets „…“`, () => {
        const L = LANG[c];
        I.setLang(c, {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord')], L.words);
        assert.ok(L.ai.test(I.t('Les traductions sont faites par une IA : le français reste la langue de référence.')));
        assert.ok(I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), L.saved);
        assert.equal(I.t('Espace', {ctx: 'touche'}), L.space);
        assert.equal(I.translateText('＋ Ajouter une personne…'), L.add);
        I.setLang('fr', {persist: false});
    });
    await t('pluriels : lituanien 1 / 2 à 9 / 0 et 10 à 20, letton 0 et 10 à 20 / 1 / le reste, estonien 1 / le reste', () => {
        I.setLang('lt', {persist: false});
        for (const [n, s] of [[1, '1 asmuo'], [2, '2 asmenys'], [9, '9 asmenys'], [10, '10 asmenų'], [0, '0 asmenų'], [11, '11 asmenų'], [12, '12 asmenų'], [21, '21 asmuo'], [22, '22 asmenys'], [30, '30 asmenų'], [101, '101 asmuo'], [111, '111 asmenų']]) assert.equal(I.plural(n, 'personne'), s, `lt ${n}`);
        I.setLang('lv', {persist: false});
        for (const [n, s] of [[1, '1 persona'], [2, '2 personas'], [0, '0 personas'], [10, '10 personas'], [11, '11 personas'], [21, '21 persona'], [22, '22 personas'], [111, '111 personas']]) assert.equal(I.plural(n, 'personne'), s, `lv ${n}`);
        assert.equal(I.plural(1, 'semaine'), '1 nedēļa'); assert.equal(I.plural(3, 'semaine'), '3 nedēļas');
        I.setLang('et', {persist: false});
        for (const [n, s] of [[1, '1 isik'], [2, '2 isikut'], [0, '0 isikut'], [21, '21 isikut']]) assert.equal(I.plural(n, 'personne'), s, `et ${n}`);
        const J = c => JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8')).personne;
        assert.deepEqual(J('lt'), {one: 'asmuo', few: 'asmenys', other: 'asmenų', many: 'asmenų'});
        assert.deepEqual(J('lv'), {zero: 'personas', one: 'persona', other: 'personas'});
        assert.deepEqual(J('et'), {one: 'isik', other: 'isikut'});
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes');
    });
    let php = null;
    try { php = require('../electron/php-server'); } catch (_) {}
    const phpPath = php && php.findPhp([php.devBundledPhp()]);
    if (phpPath) await t('serveur (lib/i18n.php) : en-têtes lt, lv et et reconnus, pluriels à 3, 3 et 2 formes, les autres langues inchangées', () => {
        const run = (l, txt, ns) => JSON.parse(spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', `$_SERVER['HTTP_X_LCNDA_LANG']='${l}'; require 'lib/i18n.php'; echo json_encode(array_merge([i18n_lang(), i18n_t('${txt}')], array_map(fn ($n) => i18n_t('personne', ['n' => $n]), [${ns.join(', ')}])), JSON_UNESCAPED_UNICODE);`], {cwd: root, encoding: 'utf8'}).stdout);
        assert.deepEqual(run('lt', 'Enregistrer', [1, 2, 9, 10, 11, 21, 22, 0, 1.5]), ['lt', 'Išsaugoti', 'asmuo', 'asmenys', 'asmenys', 'asmenų', 'asmenų', 'asmuo', 'asmenys', 'asmenų', 'asmenų']);
        assert.deepEqual(run('lv', 'Enregistrer', [1, 2, 0, 10, 11, 21, 111]), ['lv', 'Saglabāt', 'persona', 'personas', 'personas', 'personas', 'personas', 'persona', 'personas']);
        assert.deepEqual(run('et', 'Enregistrer', [1, 2, 21]), ['et', 'Salvesta', 'isik', 'isikut', 'isikut']);
        assert.deepEqual(run('hr', 'Enregistrer', [1, 2, 5]).slice(2), ['osoba', 'osobe', 'osoba'], 'croate inchangé');
        assert.deepEqual(run('ro', 'Enregistrer', [1, 5, 25]).slice(2), ['persoană', 'persoane', 'de persoane'], 'roumain inchangé');
    });
    else console.log('· serveur : PHP introuvable, vérification sautée');
    // les catégories du serveur suivent celles du navigateur (Intl.PluralRules), nombre par nombre
    if (phpPath) await t('serveur et navigateur : mêmes catégories de pluriel en lt et lv, de 0 à 230 (et 1,5)', () => {
        const ns = [...Array(231).keys(), 1.5];
        for (const c of ['lt', 'lv']) {
            const out = JSON.parse(spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', `require 'lib/i18n.php'; echo json_encode(array_map(fn ($n) => i18n_plural_cat('${c}', $n), [${ns.join(', ')}]));`], {cwd: root, encoding: 'utf8'}).stdout);
            const R = new Intl.PluralRules(c);
            assert.deepEqual(out, ns.map(n => R.select(n)), c);
        }
    });
    console.log(`${failed ? '✗' : '✓'} lt, lv, et : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
