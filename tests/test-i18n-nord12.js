'use strict';
/* 🌐 Le russe (ru) et l’ukrainien (uk), 29ᵉ et 30ᵉ langues, ajoutés après le vietnamien et l’indonésien. Mode d'emploi : docs/I18N.md
 * (« Traduire une zone en russe (ru) ou en ukrainien (uk) »).
 *     node tests/test-i18n-nord12.js
 * 1. Node : ru et uk déclarés partout (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord12/*.tsv
 *    (« fr ¦ ru ¦ uk ») ; zones du socle traduites en entier dans les deux langues, guillemets «…» sans espaces, pas d’espace
 *    avant « : ? ! ; », on tutoie (« ты » / « ти », jamais « вы » / « ви ») ; pluriels à TROIS formes one|few|many dans les
 *    .tsv (comme le polonais), exigées par i18n-check ; dans le navigateur (Intl.PluralRules, ou la règle écrite
 *    d’app-i18n.js) et sur le serveur (lib/i18n.php) : 1, 21 → one ; 2, 22 → few ; 5, 11, 25 → many ; 1,5 → other (= la
 *    forme few) ; FAQ : la recherche lit le cyrillique (ё → е, й → и, ї → і) ; le français ne change pas.
 * 2. Navigateur (si Playwright et PHP sont là) : en russe et en ukrainien, le menu principal, le bandeau et les pluriels
 *    sont traduits ; la FAQ cherche en cyrillique ; retour au français sans reste ; aucune erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const NEW = ['ru', 'uk'];
const HEAD = 'fr ¦ ru ¦ uk';
const DIR = path.join(root, 'assets/i18n/src/nord12');
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq', 'signaler', 'montage', 'reste4', 'reste5'];
// les nombres essayés, et ce qu’on attend : 1, 21 → one ; 2, 22 → few ; 5, 11, 25 → many ; 1,5 → other
const NS = [1, 2, 5, 11, 21, 22, 25, 1.5];
const CATS = ['one', 'few', 'many', 'many', 'one', 'few', 'many', 'other'];
const slavic = n => { n = Math.abs(n); if (Math.floor(n) !== n) return 'other'; const a = n % 10, b = n % 100; return (a === 1 && b !== 11) ? 'one' : (a >= 2 && a <= 4 && (b < 12 || b > 14)) ? 'few' : 'many'; };

(async () => {
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');

    /* ═════ 1. Node ═════ */
    await t('ru et uk déclarés partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES.slice(28, 30), NEW); assert.equal(I.CODES.length, 32);
        assert.deepEqual([I.info('ru').name, I.info('ru').flag, I.info('ru').locale], ['Русский', '🇷🇺', 'ru-RU']);
        assert.deepEqual([I.info('uk').name, I.info('uk').flag, I.info('uk').locale], ['Українська', '🇺🇦', 'uk-UA']);
        assert.deepEqual(I.info('ru').intlFallback, ['en']); assert.deepEqual(I.info('uk').intlFallback, ['en']);
        assert.ok(/const I18N_LANGS = \[[^\]]*'vi', 'id', 'ru', 'uk'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(20, 22), NEW); assert.deepEqual(F.NEW_LANGS.slice(20, 22), NEW); assert.equal(F.LANGS.length, 7);
        assert.deepEqual(B.FORMS.ru, ['one', 'few', 'many']); assert.deepEqual(B.FORMS.uk, ['one', 'few', 'many']);
        assert.equal(B.NAMES.ru, 'Русский'); assert.equal(B.NAMES.uk, 'Українська');
        for (const c of NEW) {
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.equal(j._meta.lang, c); assert.equal(j._meta.ai, true); assert.ok(/nord12\/\*\.tsv/.test(j._meta.note), j._meta.note);
            const fq = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/faq/${c}.json`), 'utf8'));
            assert.equal(fq._meta.lang, c); assert.equal(fq._meta.version, F.VERSION); assert.ok(fs.existsSync(path.join(root, `assets/i18n/faq/src/${c}`)));
        }
        assert.ok(/🇷🇺 Русский \(RU\)/.test(I.selectHtml())); assert.ok(/🇺🇦 Українська \(UK\)/.test(I.selectHtml()));
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

    await t('FAQ en cyrillique : les mots sont gardés (ё → е, й → и, ї → і), petits mots et racines russes et ukrainiennes', () => {
        assert.equal(faqFold('Ёлка Йод Їжак Ґанок Єва'), 'елка иод іжак ґанок єва');
        assert.deepEqual(words('Как сделать резервную копию моих фотографий?', 'ru'), ['резервную', 'копию', 'моих', 'фотографии']);
        assert.deepEqual(words('Як зробити резервну копію моїх фотографій?', 'uk'), ['резервну', 'копію', 'моіх', 'фотографіи']);
        const ru = stemOf('ru'), uk = stemOf('uk');
        assert.equal(ru('фотографии'), ru('фотография')); assert.equal(ru('карточки'), ru('карточка')); assert.equal(ru('удалить'), 'удали');
        assert.equal(uk(faqFold('фотографії')), uk('фотографія')); assert.equal(uk('картки'), uk('картка')); assert.equal(uk('видалити'), 'видали');
        assert.equal(faqFold('Émilie'), 'emilie', 'le français ne change pas'); assert.deepEqual('sauvegarde-arbre photo'.split(split), ['sauvegarde-arbre', 'photo']);
    });
    await t('nord12/ : 1re ligne « fr ¦ ru ¦ uk », zones du socle traduites en entier dans les deux langues', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) {
            const f = path.join(DIR, `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], HEAD);
            const r = todo('ru,uk', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.equal(r.dir, 'nord12');
        }
        assert.deepEqual(B.dirOf('ru'), {dir: 'nord12', head: HEAD}); assert.deepEqual(B.dirOf('uk'), {dir: 'nord12', head: HEAD});
        assert.deepEqual(todo('ru', 'listes').near, ['pl'], 'russe : le polonais en aide (langue slave, mêmes pluriels)');
        assert.deepEqual(todo('uk', 'listes').near, ['pl']);
        assert.deepEqual(todo('vi', 'listes').near, [], 'les autres langues ne changent pas');
    });
    await t('nord12/ : guillemets «…» sans espaces, mêmes variables {x} et balises que le français, trois formes de pluriel, tutoiement, rien de vide', () => {
        const bad = [];
        const L = '[\\p{L}]';
        const polite = {ru: new RegExp(`(^|[^\\p{L}])(вы|вас|вам|вами|ваш${L}*)(?=[^\\p{L}]|$)`, 'iu'), uk: new RegExp(`(^|[^\\p{L}])(ви|вас|вам|вами|ваш${L}*)(?=[^\\p{L}]|$)`, 'iu')};
        const familiar = {ru: new RegExp(`(^|[^\\p{L}])(ты|тебя|тебе|тобой|твой|твоя|твоё|твои|твоей|твоих|твоего|твоему|твою)(?=[^\\p{L}]|$)`, 'iu'), uk: new RegExp(`(^|[^\\p{L}])(ти|тебе|тобі|тобою|твій|твоя|твоє|твої|твоєї|твоїх|твого|твоїй|твою)(?=[^\\p{L}]|$)`, 'iu')};
        const tu = {ru: 0, uk: 0}, frTu = /(^|[^\p{L}])(tu|te|t’|ton|ta|tes|toi)(?=[^\p{L}]|$)/iu;
        let frTuCount = 0;
        for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.tsv'))) {
            fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').slice(1).forEach((l, i) => {
                if (!l.trim() || l.startsWith('#')) return;
                const [k, ru = '', uk = '', ...rest] = l.split(' ¦ ');
                if (rest.length) bad.push(`${f}:${i + 2} colonnes en trop`);
                const vars = s => (s.match(/\{[a-z_]+\}/gi) || []).sort().join(' ');
                const tags = s => (s.match(/<\/?[a-z]+>/gi) || []).sort().join(' ');
                const plural = k.startsWith('=');
                if (frTu.test(k)) frTuCount++;
                for (const [c, v] of [['ru', ru], ['uk', uk]]) {
                    if (!v.trim()) { bad.push(`${f}:${i + 2} [${c}] vide`); continue; }
                    if (!plural && vars(k) !== vars(v)) bad.push(`${f}:${i + 2} [${c}] variables : ${v}`);
                    if (tags(k) !== tags(v)) bad.push(`${f}:${i + 2} [${c}] balises : ${v}`);
                    if (!/« | »|« »/.test(k) && /« | »|[“”„]/.test(v)) bad.push(`${f}:${i + 2} [${c}] guillemets (on écrit «…», sans espaces) : ${v}`);
                    if ((k.match(/«/g) || []).length === (k.match(/»/g) || []).length && (v.match(/«/g) || []).length !== (v.match(/»/g) || []).length) bad.push(`${f}:${i + 2} [${c}] « sans » : ${v}`);
                    if (!/ [:?!;]( |$)/.test(k) && /\p{L} [:?!;](\s|$)/u.test(v)) bad.push(`${f}:${i + 2} [${c}] espace avant : ? ! ; : ${v}`);
                    if (plural && v.split('|').length !== 3) bad.push(`${f}:${i + 2} [${c}] pluriel : trois formes one|few|many : ${v}`);
                    if (!/(^|[^\p{L}])(vous|votre|vos)(?=[^\p{L}]|$)/iu.test(k) && polite[c].test(v.replace(/Яд Вашем|«[^»]*»/g, '')) ) bad.push(`${f}:${i + 2} [${c}] vouvoiement (on tutoie) : ${v}`);
                    if (familiar[c].test(v)) tu[c]++;
                }
                if (/[іїєґ]/i.test(ru)) bad.push(`${f}:${i + 2} [ru] lettre ukrainienne : ${ru}`);
                if (/[ыэъё]/i.test(uk.replace(/урожденный/g, ''))) bad.push(`${f}:${i + 2} [uk] lettre russe : ${uk}`);
            });
        }
        assert.deepEqual(bad, []);
        for (const c of NEW) assert.ok(tu[c] >= 40 && tu[c] >= frTuCount / 3, `${c} : ${tu[c]} textes qui tutoient (français : ${frTuCount})`);
    });
    await t('i18n-check : 0 erreur, ru et uk comptés ; un pluriel ru / uk à deux formes est une erreur, à trois formes il passe', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8', maxBuffer: 64 << 20});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        for (const c of NEW) assert.ok(new RegExp(`(⚠️ ${c} : \\d+ textes encore sans traduction)|(✓ ${c} : tout est traduit)`).test(r.stdout), c);
        const {check} = require('../scripts/i18n-check.js');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-i18n-nord12-'));
        try {
            fs.mkdirSync(path.join(tmp, 'nord12'));
            fs.writeFileSync(path.join(tmp, 'z.tsv'), 'fr\ten\tes\tde\tit\tpt\tpl\tnl\n=personne\tperson|people\tpersona|personas\tPerson|Personen\tpersona|persone\tpessoa|pessoas\tosoba|osoby|osób\tpersoon|personen\n');
            fs.writeFileSync(path.join(tmp, 'nord12', 'z.tsv'), `${HEAD}\n=personne ¦ человек|человека ¦ людина|людини|людей\n`);
            const errs = check({src: tmp}).errors.join('\n');
            assert.ok(/\[ru\] pluriel incomplet \(2\/3 formes\)/.test(errs), errs.slice(0, 800));
            assert.ok(!/\[uk\]/.test(errs), errs.slice(0, 800));
            fs.writeFileSync(path.join(tmp, 'nord12', 'z.tsv'), `${HEAD}\n=personne ¦ человек|человека|человек ¦ людина|людини|людей\n`);
            assert.deepEqual(check({src: tmp}).errors, []);
        } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
    });
    await t('t() en ru et en uk : traduit, repli, variables, contexte, guillemets', () => {
        I.setLang('ru', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord'), I.t('Annuler'), I.t('↶ Annuler'), I.t('Supprimer'), I.t('Relier')],
            ['Сохранить', 'Настройки', 'Сообщить об ошибке', 'Панель управления', 'Отмена', '↶ Отменить', 'Удалить', 'Связать']);
        assert.ok(I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Настройки сохранены под именем «Ma vue».');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Пробел');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Добавить человека…');
        I.setLang('uk', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord'), I.t('Annuler'), I.t('↶ Annuler'), I.t('Supprimer'), I.t('Relier')],
            ['Зберегти', 'Налаштування', 'Повідомити про помилку', 'Панель керування', 'Скасувати', '↶ Відмінити', 'Видалити', 'Пов’язати']);
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Налаштування збережено під назвою «Ma vue».');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Пробіл');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Додати людину…');
        I.setLang('fr', {persist: false});
    });
    await t('pluriels : 1, 21 → one ; 2, 22 → few ; 5, 11, 25 → many ; 1,5 → other (la forme few)', () => {
        const want = {
            ru: ['1 человек', '2 человека', '5 человек', '11 человек', '21 человек', '22 человека', '25 человек', '1,5 человека'],
            uk: ['1 людина', '2 людини', '5 людей', '11 людей', '21 людина', '22 людини', '25 людей', '1,5 людини'],
        };
        for (const c of NEW) {
            I.setLang(c, {persist: false});
            assert.deepEqual(NS.map(n => I.category(n, c)), CATS, `${c} : catégories`);
            assert.deepEqual(NS.map(n => I.plural(n, 'personne')), want[c], `${c} : plural()`);
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.deepEqual(Object.keys(j.personne).sort(), ['few', 'many', 'one', 'other'], `${c} : quatre formes dans le dictionnaire`);
            assert.equal(j.personne.other, j.personne.few, `${c} : les nombres à virgule prennent la forme few`);
            const ns = [...Array(231).keys(), 0.5, 1.5, 2.5];
            assert.deepEqual(ns.map(n => I.category(n, c)), ns.map(slavic), `${c} : de 0 à 230`);
            assert.deepEqual(new Intl.PluralRules(c).resolvedOptions().pluralCategories.slice().sort(), ['few', 'many', 'one', 'other'], `${c} : Intl (Node)`);
        }
        I.setLang('ru', {persist: false}); assert.equal(I.plural(3, 'semaine'), '3 недели'); assert.equal(I.plural(5, 'semaine'), '5 недель');
        I.setLang('uk', {persist: false}); assert.equal(I.plural(3, 'semaine'), '3 тижні'); assert.equal(I.plural(5, 'semaine'), '5 тижнів');
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes');
    });
    await t('un navigateur sans les pluriels ru / uk prend la règle écrite d’app-i18n.js, sans erreur', () => {
        const file = require.resolve('../assets/js/app-i18n.js');
        const fresh = () => { delete require.cache[file]; return require(file); };
        const PR = Intl.PluralRules;
        try {
            Intl.PluralRules = class extends PR {};
            Intl.PluralRules.supportedLocalesOf = l => PR.supportedLocalesOf(l).filter(x => !/^(ru|uk|en)/i.test(x));
            const J = fresh();
            for (const c of NEW) {
                assert.deepEqual(NS.map(n => J.category(n, c)), CATS, c);
                J.setLang(c, {persist: false}); J.provide(c, JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8')));
                assert.equal(J.plural(22, 'personne'), c === 'ru' ? '22 человека' : '22 людини');
            }
        } finally { Intl.PluralRules = PR; fresh(); }
    });
    await t('dates et nombres : ru-RU / uk-UA si le navigateur les connaît, sinon en, sans erreur', () => {
        const file = require.resolve('../assets/js/app-i18n.js');
        const fresh = () => { delete require.cache[file]; return require(file); };
        const DTF = Intl.DateTimeFormat.supportedLocalesOf, NF = Intl.NumberFormat.supportedLocalesOf;
        try {
            const J = fresh();
            assert.equal(J.intlLocale('ru'), Intl.DateTimeFormat.supportedLocalesOf(['ru-RU']).length ? 'ru-RU' : 'en');
            assert.equal(J.intlLocale('uk'), Intl.DateTimeFormat.supportedLocalesOf(['uk-UA']).length ? 'uk-UA' : 'en');
            J.setLang('uk', {persist: false}); assert.equal(J.fmtNumber(3.5), (3.5).toLocaleString(J.locale()));
            Intl.DateTimeFormat.supportedLocalesOf = l => DTF.call(Intl.DateTimeFormat, l).filter(x => !/^(ru|uk)/i.test(x));
            Intl.NumberFormat.supportedLocalesOf = l => NF.call(Intl.NumberFormat, l).filter(x => !/^(ru|uk)/i.test(x));
            const K = fresh(); K.setLang('ru', {persist: false});
            assert.equal(K.intlLocale('ru'), 'en'); assert.equal(K.intlLocale('uk'), 'en'); assert.equal(K.locale(), 'en');
            K.provide('ru', JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/ru.json'), 'utf8')));
            assert.equal(K.plural(2, 'personne'), '2 человека', 'les pluriels restent russes même quand les dates prennent le repli');
        } finally {
            Intl.DateTimeFormat.supportedLocalesOf = DTF; Intl.NumberFormat.supportedLocalesOf = NF;
            fresh();
        }
    });
    let php = null;
    try { php = require('../electron/php-server'); } catch (_) {}
    const phpPath = php && php.findPhp([php.devBundledPhp()]);
    const runPhp = code => { const r = spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
    if (phpPath) await t('serveur (lib/i18n.php) : en-têtes ru et uk reconnus, trois formes de pluriel (et 1,5), les autres langues inchangées', () => {
        const run = (l, txt, ns) => runPhp(`$_SERVER['HTTP_X_LCNDA_LANG']='${l}'; require 'lib/i18n.php'; echo json_encode(array_merge([i18n_lang(), i18n_t('${txt}')], array_map(fn ($n) => i18n_t('personne', ['n' => $n]), [${ns.join(', ')}])), JSON_UNESCAPED_UNICODE);`);
        assert.deepEqual(run('ru', 'Enregistrer', NS), ['ru', 'Сохранить', 'человек', 'человека', 'человек', 'человек', 'человек', 'человека', 'человек', 'человека']);
        assert.deepEqual(run('uk', 'Enregistrer', NS), ['uk', 'Зберегти', 'людина', 'людини', 'людей', 'людей', 'людина', 'людини', 'людей', 'людини']);
        assert.deepEqual(run('RU', 'Enregistrer', [1]).slice(0, 2), ['ru', 'Сохранить'], 'en-tête en capitales : ramené en minuscules');
        assert.deepEqual(run('vi', 'Enregistrer', [1]).slice(0, 2), ['vi', 'Lưu'], 'vietnamien inchangé');
        assert.deepEqual(run('ukr', 'Enregistrer', [1]).slice(0, 2), ['fr', 'Enregistrer'], 'code inconnu : français');
        const d = runPhp(`require 'lib/i18n.php'; echo json_encode([i18n_detect_lang('ru-RU,ru;q=0.9'), i18n_detect_lang('uk-UA,uk;q=0.9,ru;q=0.8'), i18n_detect_lang('en-GB')]);`);
        assert.deepEqual(d, ['ru', 'uk', 'en'], 'premier lancement : la langue de l’ordinateur (« uk » = ukrainien, « en-GB » = anglais)');
    });
    else console.log('· serveur : PHP introuvable, vérification sautée');
    if (phpPath) await t('serveur et navigateur : mêmes catégories de pluriel en ru et en uk, de 0 à 230 (et 0,5, 1,5, 2,5)', () => {
        const ns = [...Array(231).keys(), 0.5, 1.5, 2.5];
        for (const c of NEW) {
            const srv = runPhp(`require 'lib/i18n.php'; echo json_encode(array_map(fn ($n) => i18n_plural_cat('${c}', $n), [${ns.join(', ')}]));`);
            assert.deepEqual(srv, ns.map(n => new Intl.PluralRules(c).select(n)), c);
            assert.deepEqual(srv, ns.map(n => I.category(n, c)), c);
        }
    });

    /* ═════ 2. Navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} ru, uk : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const {phpRuntimeArgs} = php;
    const work = process.env.I18N_TMP || os.tmpdir();
    const tmp = fs.mkdtempSync(path.join(work, 'carnet-i18n-nord12-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living'),('Louis','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20780, base = `http://127.0.0.1:${port}/`;
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
        await t('russe : menu principal, bandeau, titre et pluriels traduits ; retour au français sans reste', async () => {
            const page = await open('ru');
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav').innerText, banner: document.getElementById('lc-i18n-banner')?.innerText || '', plural: [5, 22].map(n => window.LCNDA_APP.plural(n, 'personne')), title: document.title, cookie: document.cookie}));
            assert.equal(r.lang, 'ru'); assert.ok(/lcnda_lang=ru/.test(r.cookie), r.cookie);
            assert.ok(r.nav.includes('Панель управления') && r.nav.includes('Настройки'), r.nav);
            assert.ok(/Перевод сделан ИИ/.test(r.banner), r.banner); assert.deepEqual(r.plural, ['5 человек', '22 человека']); assert.equal(r.title, 'Цифровая тетрадь предков');
            await page.evaluate(() => window.LCNDA_I18N.setLang('fr')); await page.waitForTimeout(1200);
            const fr = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), nav: document.querySelector('.main-nav').innerText}));
            assert.equal(fr.lang, 'fr'); assert.equal(fr.banner, false); assert.ok(fr.nav.includes('Réglages'), fr.nav);
            await page.context().close();
        });
        await t('ukrainien : une fiche s’ouvre par son adresse, le menu de choix d’une personne est traduit, la FAQ cherche en cyrillique', async () => {
            const page = await open('uk', '#personnes/2');
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav')?.innerText || '', page: document.querySelector('#workspace')?.innerText || '', cur: window.LCNDA_APP.state.currentPersonId}));
            assert.equal(r.lang, 'uk'); assert.ok(r.nav.includes('Панель керування') && r.nav.includes('Налаштування'), r.nav);
            assert.equal(Number(r.cur), 2); assert.ok(/Marie/.test(r.page), r.page.slice(0, 200));
            await page.evaluate(() => { window.__pk = window.LCNDA_PICKER.openPicker({kind: 'person'}); });
            await page.waitForSelector('.pk-dialog .pk-input'); await page.fill('.pk-dialog .pk-input', 'Mar'); await page.waitForTimeout(1200);
            const list = await page.locator('.pk-dialog').innerText();
            assert.ok(/Marie/.test(list) && /DURAND/i.test(list), list.slice(0, 400));
            assert.ok(!/fiches trouvées|Aucune fiche/.test(list), `textes du menu de choix traduits : ${list.slice(0, 300)}`);
            await page.keyboard.press('Escape'); await page.waitForTimeout(300);
            await page.evaluate(() => window.LCNDA_UI.openFaq('резервна копія')); await page.waitForTimeout(900);
            const f = await page.evaluate(() => ({q: document.querySelector('[data-faq-q]')?.value, ph: document.querySelector('[data-faq-q]')?.placeholder || '', res: document.querySelector('[data-faq-results]')?.innerText || ''}));
            assert.equal(f.q, 'резервна копія'); assert.ok(/Постав запитання/.test(f.ph), f.ph); assert.ok(f.res.trim().length > 0, 'une réponse ou « pas de réponse », sans erreur');
            await page.context().close();
        });
        await t('aucune erreur JavaScript pendant ces essais', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(`${failed ? '✗' : '✓'} ru, uk : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
