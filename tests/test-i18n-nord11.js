'use strict';
/* 🌐 Le vietnamien (vi) et l’indonésien (id), 27ᵉ et 28ᵉ langues, ajoutés après l’albanais et le maltais. Mode d'emploi : docs/I18N.md
 * (« Traduire une zone en vietnamien (vi) ou en indonésien (id) »).
 *     node tests/test-i18n-nord11.js
 * 1. Node : vi et id déclarés partout (app-i18n.js, lib/i18n.php, scripts, FAQ) ; fichiers assets/i18n/src/nord11/*.tsv
 *    (« fr ¦ vi ¦ id ») ; zones de base traduites en entier dans les deux langues, guillemets “…” ; pluriels à UNE forme (other)
 *    dans les .tsv (« người », « orang », jamais « | »), dans le navigateur (Intl.PluralRules, ou la règle écrite d’app-i18n.js)
 *    et sur le serveur (lib/i18n.php), de 0 à 230 ; dates et nombres vi-VN / id-ID ou leur repli (en) ; FAQ : la recherche
 *    vietnamienne marche avec et sans accents (ơ, ư, đ et les accents empilés), racines indonésiennes ;
 *    « id » (la langue) ne se mélange jamais avec la propriété « id » d’une fiche ; le français ne change pas.
 * 2. Navigateur (si Playwright et PHP sont là) : en indonésien, ouvrir une fiche par son adresse (#personnes/2), la FAQ, le menu
 *    de choix d’une personne : les « id » des fiches restent des nombres, rien ne casse ; en vietnamien, le menu principal est traduit.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const NEW = ['vi', 'id'];
const HEAD = 'fr ¦ vi ¦ id';
const DIR = path.join(root, 'assets/i18n/src/nord11');
const BASE_ZONES = ['cadre', 'composants', 'colonnes', 'premier', 'touches', 'reglages', 'faq', 'signaler', 'montage', 'reste4', 'reste5'];

(async () => {
    const I = require('../assets/js/app-i18n.js');
    const B = require('../scripts/i18n-build.js');
    const F = require('../scripts/build-faq-i18n.js');
    const more = fs.readFileSync(path.join(root, 'assets/js/heritage-more.js'), 'utf8');

    /* ═════ 1. Node ═════ */
    await t('vi et id déclarés partout : app-i18n.js, lib/i18n.php, scripts, FAQ', () => {
        assert.deepEqual(I.CODES.slice(26, 28), NEW); assert.equal(I.CODES.length, 32);
        assert.deepEqual([I.info('vi').name, I.info('vi').flag, I.info('vi').locale], ['Tiếng Việt', '🇻🇳', 'vi-VN']);
        assert.deepEqual([I.info('id').name, I.info('id').flag, I.info('id').locale], ['Bahasa Indonesia', '🇮🇩', 'id-ID']);
        assert.deepEqual(I.info('vi').intlFallback, ['en']); assert.deepEqual(I.info('id').intlFallback, ['en']);
        assert.ok(/const I18N_LANGS = \[[^\]]*'sq', 'mt', 'vi', 'id'(, '[a-z]{2}')*\];/.test(fs.readFileSync(path.join(root, 'lib/i18n.php'), 'utf8')));
        assert.deepEqual(B.NEW_LANGS.slice(18, 20), NEW); assert.deepEqual(F.NEW_LANGS.slice(18, 20), NEW); assert.equal(F.LANGS.length, 7);
        assert.deepEqual(B.FORMS.vi, ['other']); assert.deepEqual(B.FORMS.id, ['other']);
        assert.equal(B.NAMES.vi, 'Tiếng Việt'); assert.equal(B.NAMES.id, 'Bahasa Indonesia');
        for (const c of NEW) {
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.equal(j._meta.lang, c); assert.equal(j._meta.ai, true); assert.ok(/nord11\/\*\.tsv/.test(j._meta.note), j._meta.note);
            const fq = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/faq/${c}.json`), 'utf8'));
            assert.equal(fq._meta.lang, c); assert.equal(fq._meta.version, F.VERSION); assert.ok(fs.existsSync(path.join(root, `assets/i18n/faq/src/${c}`)));
        }
        assert.ok(/🇻🇳 Tiếng Việt \(VI\)/.test(I.selectHtml())); assert.ok(/🇮🇩 Bahasa Indonesia \(ID\)/.test(I.selectHtml()));
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
    const stemVi = eval(more.match(/\n {8}vi: (w => w),/)[1]); // eslint-disable-line no-eval
    const stemId = eval(more.match(/\n {8}id: (w => \{[^\n]*?return [^\n]*?; \}),/)[1]); // eslint-disable-line no-eval
    const stopOf = c => new Set(more.match(new RegExp(`\\n {8}${c}: '([^']*)',`))[1].split(' '));
    const words = (s, c) => { const stop = stopOf(c); return faqFold(s).split(/[^a-z0-9-]+/).filter(w => w.length > 1 && !stop.has(w)); };

    await t('FAQ vietnamienne : accents empilés, ơ, ư, đ ramenés à la lettre de base ; même recherche avec et sans accents', () => {
        assert.equal(faqFold('Người Đường Ảnh Ứng dụng Ỗ ỡ ữ ợ ự ẫ ậ ặ ẵ ệ ể ỷ ỹ'), 'nguoi duong anh ung dung o o u o u a a a a e e y y');
        // la même phrase écrite en caractères décomposés (certains claviers vietnamiens) : même résultat
        assert.equal(faqFold('Sao lưu gia phả'.normalize('NFD')), faqFold('Sao lưu gia phả'));
        const q1 = 'Làm sao để sao lưu ảnh và gia phả của tôi?', q2 = 'lam sao de sao luu anh va gia pha cua toi';
        assert.deepEqual(words(q1, 'vi'), words(q2, 'vi'));
        assert.deepEqual(words(q1, 'vi'), ['sao', 'sao', 'luu', 'anh', 'gia', 'pha'], 'les petits mots tombent ; « sao » (sao lưu), « anh » (ảnh), « gia phả » restent');
        assert.equal(stemVi('nguoi'), 'nguoi', 'pas de racine en vietnamien');
        // une question traduite (comme le seront celles de assets/i18n/faq/src/vi/) trouvée sans accents
        const qs = words('Làm thế nào để sao lưu gia phả và ảnh của tôi?', 'vi');
        assert.ok(['sao', 'luu', 'gia', 'pha', 'anh'].every(w => qs.includes(w)), qs.join(' '));
        assert.equal(faqFold('Émilie'), 'emilie', 'le français ne change pas');
    });
    await t('FAQ indonésienne : petits mots, racines (-nya, -kan, -an, me-/di-/pe-)', () => {
        assert.equal(stemId('menghapus'), stemId('hapus')); assert.equal(stemId('dihapus'), 'hapus');
        assert.equal(stemId('dicetak'), stemId('cetak')); assert.equal(stemId('fotonya'), 'foto');
        assert.equal(stemId('pencarian'), stemId('cari')); assert.equal(stemId('mencari'), 'cari');
        assert.deepEqual(words('Bagaimana cara saya mencetak buku keluarga dalam PDF?', 'id'), ['mencetak', 'buku', 'keluarga', 'pdf']);
    });
    await t('nord11/ : 1re ligne « fr ¦ vi ¦ id », zones de base traduites en entier dans les deux langues', () => {
        const {todo} = require('../scripts/i18n-todo.js');
        for (const z of BASE_ZONES) {
            const f = path.join(DIR, `${z}.tsv`);
            assert.ok(fs.existsSync(f), z); assert.equal(fs.readFileSync(f, 'utf8').split('\n')[0], HEAD);
            const r = todo('vi,id', z); assert.deepEqual(r.items.map(x => x.key), [], `${z} : ${r.items.length} textes`); assert.equal(r.dir, 'nord11');
        }
        assert.deepEqual(B.dirOf('vi'), {dir: 'nord11', head: HEAD}); assert.deepEqual(B.dirOf('id'), {dir: 'nord11', head: HEAD});
        assert.deepEqual(todo('vi', 'listes').near, [], 'vietnamien : l’anglais seulement, déjà là');
        assert.deepEqual(todo('id', 'listes').near, [], 'indonésien : l’anglais seulement, déjà là');
        assert.deepEqual(todo('mt', 'listes').near, ['it'], 'les autres langues ne changent pas');
    });
    await t('nord11/ : guillemets “…”, mêmes variables {x} et balises que le français, une seule forme de pluriel, rien de vide', () => {
        const bad = [];
        for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.tsv'))) {
            fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').slice(1).forEach((l, i) => {
                if (!l.trim() || l.startsWith('#')) return;
                const [k, vi = '', id = '', ...rest] = l.split(' ¦ ');
                if (rest.length) bad.push(`${f}:${i + 2} colonnes en trop`);
                const vars = s => (s.match(/\{[a-z_]+\}/gi) || []).sort().join(' ');
                const tags = s => (s.match(/<\/?[a-z]+>/gi) || []).sort().join(' ');
                const plural = k.startsWith('=');
                for (const [c, v] of [['vi', vi], ['id', id]]) {
                    if (!v.trim()) { bad.push(`${f}:${i + 2} [${c}] vide`); continue; }
                    if (!plural && vars(k) !== vars(v)) bad.push(`${f}:${i + 2} [${c}] variables : ${v}`);
                    if (tags(k) !== tags(v)) bad.push(`${f}:${i + 2} [${c}] balises : ${v}`);
                    if (!/[«»]/.test(k) && /[«»„]/.test(v)) bad.push(`${f}:${i + 2} [${c}] « » „ : ${v}`);
                    if ((v.match(/“/g) || []).length !== (v.match(/”/g) || []).length) bad.push(`${f}:${i + 2} [${c}] “ sans ” : ${v}`);
                    if (!/ [:?!;]( |$)/.test(k) && / [:?!;]( |$)/.test(v)) bad.push(`${f}:${i + 2} [${c}] espace avant : ? ! ; : ${v}`);
                    if (plural && v.includes('|')) bad.push(`${f}:${i + 2} [${c}] pluriel en plusieurs formes : ${v}`);
                }
                if (/[ăđơư\u1EA0-\u1EF9]/i.test(id)) bad.push(`${f}:${i + 2} [id] lettre vietnamienne : ${id}`);
                if (/\bAnda\b/.test(id)) bad.push(`${f}:${i + 2} [id] « Anda » (on dit « kamu ») : ${id}`);
            });
        }
        assert.deepEqual(bad, []);
    });
    await t('i18n-check : 0 erreur, vi et id comptés ; un pluriel vi / id écrit en deux formes est une erreur', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8', maxBuffer: 64 << 20});
        assert.equal(r.status, 0, r.stdout.slice(-3000) + r.stderr);
        for (const c of NEW) assert.ok(new RegExp(`(⚠️ ${c} : \\d+ textes encore sans traduction)|(✓ ${c} : tout est traduit)`).test(r.stdout), c);
        const {check} = require('../scripts/i18n-check.js');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-i18n-nord11-'));
        try {
            fs.mkdirSync(path.join(tmp, 'nord11'));
            fs.writeFileSync(path.join(tmp, 'z.tsv'), 'fr\ten\tes\tde\tit\tpt\tpl\tnl\n=personne\tperson|people\tpersona|personas\tPerson|Personen\tpersona|persone\tpessoa|pessoas\tosoba|osoby|osób\tpersoon|personen\n');
            fs.writeFileSync(path.join(tmp, 'nord11', 'z.tsv'), `${HEAD}\n=personne ¦ người|người ¦ orang\n`);
            const errs = check({src: tmp}).errors.join('\n');
            assert.ok(/\[vi\] pluriel à une seule forme/.test(errs), errs.slice(0, 800));
            assert.ok(!/\[id\]/.test(errs), errs.slice(0, 800));
            fs.writeFileSync(path.join(tmp, 'nord11', 'z.tsv'), `${HEAD}\n=personne ¦ người ¦ orang\n`);
            assert.deepEqual(check({src: tmp}).errors, []);
        } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
    });
    await t('t() en vi et en id : traduit, repli, variables, contexte, guillemets', () => {
        I.setLang('vi', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord'), I.t('Annuler'), I.t('↶ Annuler')], ['Lưu', 'Cài đặt', 'Báo lỗi dịch', 'Bảng điều khiển', 'Hủy', '↶ Hoàn tác']);
        assert.ok(I.t(I.AI_NOTE) !== I.AI_NOTE);
        assert.equal(I.t('Un texte qui n’existe pas'), 'Un texte qui n’existe pas');
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Cài đặt đã được lưu với tên “Ma vue”.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Phím cách');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Thêm một người…');
        I.setLang('id', {persist: false});
        assert.deepEqual([I.t('Enregistrer'), I.t('Réglages'), I.t('Signaler une erreur'), I.t('Tableau de bord'), I.t('Annuler'), I.t('↶ Annuler')], ['Simpan', 'Pengaturan', 'Laporkan kesalahan', 'Dasbor', 'Batal', '↶ Urungkan']);
        assert.equal(I.t('Réglages gardés sous « {name} ».', {name: 'Ma vue'}), 'Pengaturan disimpan sebagai “Ma vue”.');
        assert.equal(I.t('Espace', {ctx: 'touche'}), 'Spasi');
        assert.equal(I.translateText('＋ Ajouter une personne…'), '＋ Tambah orang…');
        I.setLang('fr', {persist: false});
    });
    await t('« id » la langue ne se mélange pas avec la propriété « id » : dictionnaire, menu, info(), textes « id »', () => {
        const j = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/id.json'), 'utf8'));
        assert.equal(Object.prototype.hasOwnProperty.call(j, 'id'), false, 'pas de clé « id » dans le dictionnaire indonésien');
        assert.equal(I.info('id').code, 'id'); assert.equal(I.info('ID').code, 'fr', 'code inconnu → français');
        assert.equal(I.LANGS.filter(l => l.code === 'id').length, 1);
        I.setLang('id', {persist: false});
        // un objet de données avec une propriété id, des textes « id » / « ID » à l’écran : rien n’est touché
        const rec = {id: 12, name: 'Marie'}; I.provide('id', j);
        assert.deepEqual(rec, {id: 12, name: 'Marie'});
        assert.equal(I.translateText('id'), null); assert.equal(I.translateText('ID'), null); assert.equal(I.translateText('#12'), null);
        assert.equal(I.t('{n} éléments', {n: 12}), '12 item');
        assert.equal(I.lang, 'id'); assert.equal(I.getLang(), 'id');
        I.setLang('fr', {persist: false});
        // les tables par langue des scripts : la langue est une clé de plus, à côté des autres
        assert.deepEqual(Object.keys(B.FORMS).filter(k => k === 'id' || k === 'vi'), ['vi', 'id']);
        const st = F.status(); assert.ok(Array.isArray(st.id.missing)); assert.ok(Array.isArray(st.vi.missing));
    });
    await t('pluriels : une seule forme en vi et en id (« 1 người », « 5 người » ; « 1 orang », « 5 orang »)', () => {
        I.setLang('vi', {persist: false});
        for (const [n, s] of [[1, '1 người'], [2, '2 người'], [0, '0 người'], [21, '21 người']]) assert.equal(I.plural(n, 'personne'), s, `vi ${n}`);
        assert.equal(I.plural(3, 'semaine'), '3 tuần');
        I.setLang('id', {persist: false});
        for (const [n, s] of [[1, '1 orang'], [2, '2 orang'], [0, '0 orang'], [1000, '1.000 orang']]) assert.equal(I.plural(n, 'personne'), s, `id ${n}`);
        assert.equal(I.plural(3, 'semaine'), '3 minggu');
        for (const c of NEW) {
            const j = JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8'));
            assert.deepEqual(Object.keys(j.personne), ['other'], `${c} : une seule forme dans le dictionnaire`);
            const ns = [...Array(231).keys(), 0.5, 1.5, 2.5];
            assert.deepEqual([...new Set(ns.map(n => I.category(n, c)))], ['other'], `${c} : toujours other`);
            assert.deepEqual(new Intl.PluralRules(c).resolvedOptions().pluralCategories, ['other'], `${c} : Intl (Node) n’a que other`);
        }
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Enregistrer'), 'Enregistrer'); assert.equal(I.plural(2, 'personne'), '2 personnes');
    });
    await t('un navigateur sans les pluriels vi / id prend la règle écrite d’app-i18n.js (other), sans erreur', () => {
        const file = require.resolve('../assets/js/app-i18n.js');
        const fresh = () => { delete require.cache[file]; return require(file); };
        const PR = Intl.PluralRules;
        try {
            Intl.PluralRules = class extends PR {};
            Intl.PluralRules.supportedLocalesOf = l => PR.supportedLocalesOf(l).filter(x => !/^(vi|id|en)/i.test(x));
            const J = fresh();
            for (const c of NEW) {
                // ni la langue ni son repli : la règle écrite (sinon, l’ancien repli aurait donné « one » pour 1)
                assert.equal(J.category(1, c), 'other', c); assert.equal(J.category(5, c), 'other', c);
                J.setLang(c, {persist: false}); J.provide(c, JSON.parse(fs.readFileSync(path.join(root, `assets/i18n/${c}.json`), 'utf8')));
                assert.equal(J.plural(1, 'personne'), c === 'vi' ? '1 người' : '1 orang');
            }
        } finally { Intl.PluralRules = PR; fresh(); }
    });
    await t('dates et nombres : vi-VN / id-ID si le navigateur les connaît, sinon en, sans erreur', () => {
        const file = require.resolve('../assets/js/app-i18n.js');
        const fresh = () => { delete require.cache[file]; return require(file); };
        const DTF = Intl.DateTimeFormat.supportedLocalesOf, NF = Intl.NumberFormat.supportedLocalesOf;
        try {
            const J = fresh();
            assert.equal(J.intlLocale('vi'), Intl.DateTimeFormat.supportedLocalesOf(['vi-VN']).length ? 'vi-VN' : 'en');
            assert.equal(J.intlLocale('id'), Intl.DateTimeFormat.supportedLocalesOf(['id-ID']).length ? 'id-ID' : 'en');
            J.setLang('id', {persist: false}); assert.equal(J.fmtNumber(3.5), (3.5).toLocaleString(J.locale()));
            Intl.DateTimeFormat.supportedLocalesOf = l => DTF.call(Intl.DateTimeFormat, l).filter(x => !/^(vi|id)/i.test(x));
            Intl.NumberFormat.supportedLocalesOf = l => NF.call(Intl.NumberFormat, l).filter(x => !/^(vi|id)/i.test(x));
            const K = fresh(); K.setLang('vi', {persist: false});
            assert.equal(K.intlLocale('vi'), 'en'); assert.equal(K.intlLocale('id'), 'en'); assert.equal(K.locale(), 'en');
            K.provide('vi', JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/vi.json'), 'utf8')));
            assert.equal(K.plural(2, 'personne'), '2 người', 'les pluriels restent vietnamiens même quand les dates prennent le repli');
            assert.equal(K.intlLocale('mt'), Intl.DateTimeFormat.supportedLocalesOf(['mt-MT']).length ? 'mt-MT' : 'en-MT', 'les autres langues ne changent pas');
        } finally {
            Intl.DateTimeFormat.supportedLocalesOf = DTF; Intl.NumberFormat.supportedLocalesOf = NF;
            fresh();
        }
    });
    let php = null;
    try { php = require('../electron/php-server'); } catch (_) {}
    const phpPath = php && php.findPhp([php.devBundledPhp()]);
    const runPhp = code => { const r = spawnSync(phpPath, [...php.phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
    if (phpPath) await t('serveur (lib/i18n.php) : en-têtes vi et id reconnus, une seule forme de pluriel, les autres langues inchangées', () => {
        const run = (l, txt, ns) => runPhp(`$_SERVER['HTTP_X_LCNDA_LANG']='${l}'; require 'lib/i18n.php'; echo json_encode(array_merge([i18n_lang(), i18n_t('${txt}')], array_map(fn ($n) => i18n_t('personne', ['n' => $n]), [${ns.join(', ')}])), JSON_UNESCAPED_UNICODE);`);
        assert.deepEqual(run('vi', 'Enregistrer', [1, 2, 0, 21, 1.5]), ['vi', 'Lưu', 'người', 'người', 'người', 'người', 'người']);
        assert.deepEqual(run('id', 'Enregistrer', [1, 2, 0, 21, 1.5]), ['id', 'Simpan', 'orang', 'orang', 'orang', 'orang', 'orang']);
        assert.deepEqual(run('mt', 'Enregistrer', [1, 2]).slice(0, 2), ['mt', 'Issejvja'], 'maltais inchangé');
        assert.deepEqual(run('ID', 'Enregistrer', [1]).slice(0, 2), ['id', 'Simpan'], 'en-tête en capitales : ramené en minuscules');
        assert.deepEqual(run('idx', 'Enregistrer', [1]).slice(0, 2), ['fr', 'Enregistrer'], 'code inconnu : français');
    });
    else console.log('· serveur : PHP introuvable, vérification sautée');
    if (phpPath) await t('serveur et navigateur : mêmes catégories de pluriel en vi et en id, de 0 à 230 (et 0,5, 1,5, 2,5)', () => {
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
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} vi, id : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const {phpRuntimeArgs} = php;
    const work = process.env.I18N_TMP || os.tmpdir();
    const tmp = fs.mkdtempSync(path.join(work, 'carnet-i18n-nord11-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living'),('Louis','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20760, base = `http://127.0.0.1:${port}/`;
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
        await t('indonésien : une fiche ouverte par son adresse (#personnes/2) garde son id, les appels au serveur marchent', async () => {
            const page = await open('id', '#personnes/2');
            const r = await page.evaluate(async () => {
                const A = window.LCNDA_APP;
                const p = await A.api('person', {id: 2}).catch(e => ({err: String(e && e.message || e)}));
                return {lang: document.documentElement.lang, hash: location.hash, cur: A.state.currentPersonId, module: A.state.module, page: document.querySelector('#workspace')?.innerText || '',
                    nav: document.querySelector('.main-nav')?.innerText || '', pid: p && (p.person ? p.person.id : p.id), err: p && p.err, cookie: document.cookie};
            });
            assert.equal(r.lang, 'id'); assert.ok(/lcnda_lang=id/.test(r.cookie), r.cookie);
            assert.equal(r.module, 'personnes'); assert.equal(Number(r.cur), 2, `fiche ouverte : ${r.cur}`); assert.ok(/^#personnes\/2(\/|$)/.test(r.hash), r.hash);
            assert.ok(/Durand/i.test(r.page) && /Marie/.test(r.page), r.page.slice(0, 300));
            assert.equal(r.err, undefined, r.err); assert.equal(Number(r.pid), 2, 'la fiche lue par l’API a toujours son id');
            assert.ok(r.nav.includes('Dasbor') && r.nav.includes('Pengaturan'), r.nav);
            // une autre fiche, par l’adresse : l’id de la langue n’entre pas dans l’adresse
            await page.evaluate(() => { location.hash = '#personnes/3'; }); await page.waitForTimeout(1200);
            const r2 = await page.evaluate(() => ({cur: window.LCNDA_APP.state.currentPersonId, hash: location.hash, page: document.querySelector('#workspace')?.innerText || ''}));
            assert.equal(Number(r2.cur), 3); assert.ok(/^#personnes\/3(\/|$)/.test(r2.hash), r2.hash); assert.ok(/Louis/.test(r2.page), r2.page.slice(0, 200));
            await page.context().close();
        });
        await t('indonésien : la FAQ s’ouvre et répond (en français tant qu’elle n’est pas traduite), sans erreur', async () => {
            const page = await open('id');
            await page.evaluate(() => window.LCNDA_UI.openFaq('sauvegarde')); await page.waitForTimeout(900);
            const r = await page.evaluate(() => ({q: document.querySelector('[data-faq-q]')?.value, ph: document.querySelector('[data-faq-q]')?.placeholder || '', res: document.querySelector('[data-faq-results]')?.innerText || '', hidden: document.querySelector('[data-faq-results]')?.hidden}));
            assert.equal(r.q, 'sauvegarde'); assert.equal(r.hidden, false); assert.ok(r.res.trim().length > 20, r.res);
            assert.ok(/Ajukan pertanyaanmu/.test(r.ph), r.ph);
            await page.fill('[data-faq-q]', 'cadangan'); await page.waitForTimeout(600);
            assert.ok((await page.locator('[data-faq-results]').innerText()).trim().length > 0, 'un mot indonésien (synonyme) : une réponse ou « pas de réponse », sans erreur');
            await page.context().close();
        });
        await t('indonésien : le menu de choix d’une personne trouve « Marie DURAND » et rend une fiche avec son id (nombre)', async () => {
            const page = await open('id');
            await page.evaluate(() => { window.__pk = window.LCNDA_PICKER.openPicker({kind: 'person'}); });
            await page.waitForSelector('.pk-dialog .pk-input'); await page.fill('.pk-dialog .pk-input', 'Mar'); await page.waitForTimeout(1200);
            const list = await page.locator('.pk-dialog').innerText();
            assert.ok(/Marie/.test(list) && /DURAND/i.test(list) && /Joseph/.test(list), list.slice(0, 400));
            assert.ok(!/fiches trouvées|Aucune fiche/.test(list), `textes du menu de choix traduits : ${list.slice(0, 300)}`);
            await page.fill('.pk-dialog .pk-input', 'Durand'); await page.waitForTimeout(1000);
            await page.keyboard.press('Enter');
            const item = await page.evaluate(() => window.__pk);
            assert.ok(item && Number(item.id) === 2, JSON.stringify(item)); assert.ok(/Marie/.test(item.label || item.name || item.first_name || JSON.stringify(item)), JSON.stringify(item));
            await page.context().close();
        });
        await t('vietnamien : menu principal, bandeau et pluriels traduits ; retour au français sans reste', async () => {
            const page = await open('vi');
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, nav: document.querySelector('.main-nav').innerText, banner: document.getElementById('lc-i18n-banner')?.innerText || '', plural: window.LCNDA_APP.plural(5, 'personne'), title: document.title}));
            assert.equal(r.lang, 'vi'); assert.ok(r.nav.includes('Bảng điều khiển') && r.nav.includes('Cài đặt'), r.nav);
            assert.ok(/Bản dịch do AI/.test(r.banner), r.banner); assert.equal(r.plural, '5 người'); assert.equal(r.title, 'Sổ tay số về tổ tiên');
            await page.evaluate(() => window.LCNDA_I18N.setLang('fr')); await page.waitForTimeout(1200);
            const fr = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), nav: document.querySelector('.main-nav').innerText}));
            assert.equal(fr.lang, 'fr'); assert.equal(fr.banner, false); assert.ok(fr.nav.includes('Réglages'), fr.nav);
            await page.context().close();
        });
        await t('aucune erreur JavaScript pendant ces essais', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(`${failed ? '✗' : '✓'} vi, id : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
