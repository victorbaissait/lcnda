'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔤 Alphabets et langues des actes (assets/js/heritage-alphabets.js + heritage-alphabets-data.js) :   node tests/test-alphabets.js
 *  1. données (sans navigateur) : 40 langues, nombre officiel de lettres, pas de doublon, tout en Unicode composé (NFC),
 *     translittération de chaque lettre des écritures non latines ;
 *  2. « Quelle langue ? » : ł → polonais en tête, ő → hongrois, ß → allemand, ж → les langues cyrilliques, ω → le grec,
 *     ☃ ou 漢 → aucune langue, majuscules et lettres décomposées (NFD) traitées pareil ;
 *  3. translittération : russe (français courant et ISO 9), grec moderne et ancien ;
 *  4. navigateur (Playwright ; sinon sauté) : cadre à droite de « Fêtes religieuses », onglets (clic et flèches), texte piégé
 *     non exécuté, clic sur une langue proposée, clavier (⇧, accents grecs, ⌫, Vider + Annuler), copier, mode sombre,
 *     390 px sans débordement, aucune erreur JS.
 * Captures facultatives : ALPHABETS_SHOTS=/un/dossier node tests/test-alphabets.js ; port imposé : ALPHABETS_PORT=20130.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

/* ═════ 1 à 3 : données et calculs, dans une machine virtuelle ═════ */
const sandbox = { window: {}, localStorage: { getItem: () => null, setItem: () => {} }, Intl, console };
vm.createContext(sandbox);
for (const f of ['heritage-alphabets-data.js', 'heritage-alphabets.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const DATA = sandbox.window.LCNDA_ALPHABETS, X = sandbox.window.LCNDA_EXT.alphabets;
const byId = Object.fromEntries(DATA.languages.map(l => [l.id, l]));
const COUNTS = { fr: 26, la: 23, oc: 23, ca: 26, br: 25, eu: 27, de: 26, nl: 26, en: 26, it: 21, es: 27, pt: 26, pl: 32, cs: 42, sk: 46, hu: 44, ro: 31, hr: 30, sl: 25, lt: 32, lv: 33,
    sv: 29, da: 29, no: 29, fi: 29, is: 32, ga: 18, cy: 29, mt: 30, tr: 29, ru: 33, uk: 33, be: 32, bg: 30, sr: 30, el: 24, grc: 24, he: 22, yi: 40, ar: 28 };
const ids = r => r.results.map(x => x.id);
const plain = v => JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepEqual(plain(a), plain(b), m);

check('40 langues, chacune avec ses lettres (nombre officiel), son nom, ses indices', () => {
    deq(DATA.languages.map(l => l.id).sort(), Object.keys(COUNTS).sort());
    for (const l of DATA.languages) {
        assert.equal(l.alphabet.length, COUNTS[l.id], `${l.id} : ${l.alphabet.length} lettres`);
        assert.ok(l.name && l.hints?.length >= 2 && l.hints.length <= 5, `${l.id} : nom ou indices`);
        assert.ok(l.alphabet.every(c => typeof c === 'string' && c.trim() === c && c), `${l.id} : lettre vide`);
    }
});
check('pas de doublon dans un alphabet ni dans les lettres spéciales ; tout en NFC', () => {
    for (const l of DATA.languages) {
        for (const key of ['alphabet', 'special', 'extra']) {
            const list = l[key] || [];
            assert.equal(new Set(list).size, list.length, `${l.id}.${key} : doublon ${list.filter((c, i) => list.indexOf(c) !== i)}`);
            for (const c of list) assert.equal(c, c.normalize('NFC'), `${l.id}.${key} : ${c} pas en NFC`);
        }
        const alpha = new Set(l.alphabet);
        for (const c of l.extra || []) assert.ok(!alpha.has(c), `${l.id} : ${c} à la fois dans l’alphabet et dans les lettres étrangères`);
        if (l.upper) assert.equal(l.upper.length, l.alphabet.length, `${l.id} : majuscules`);
    }
});
check('lettres attendues : polonais ł ą ę, allemand ß, tchèque ř, hongrois ő ű, turc ı ğ, islandais þ ð', () => {
    const inLang = (id, s) => s.split(' ').forEach(c => assert.ok(byId[id].alphabet.includes(c) || byId[id].special.includes(c), `${id} sans ${c}`));
    inLang('pl', 'ł ą ę ć ń ó ś ź ż'); inLang('de', 'ä ö ü ß'); inLang('cs', 'ř ů ě'); inLang('hu', 'ő ű'); inLang('tr', 'ı ğ ş ç'); inLang('is', 'þ ð æ');
    inLang('fr', 'é è ê ë à â î ï ô û ù ü ÿ ç œ æ'); inLang('es', 'ñ'); inLang('ro', 'ă ș ț'); inLang('lt', 'ė į ų'); inLang('lv', 'ā ģ ķ ļ ņ');
    inLang('ru', 'ж ы э ё'); inLang('uk', 'ґ є і ї'); inLang('be', 'ў'); inLang('sr', 'ђ ј љ њ ћ џ'); inLang('el', 'ω ς'); inLang('he', 'א ש ת');
    assert.ok(byId.la.old.some(([c]) => c === 'ſ') && byId.la.old.some(([c]) => c === 'ꝑ') && byId.la.old.some(([c]) => c === '⁊'));
    assert.ok(byId.ru.old.some(([c]) => c === 'ѣ') && byId.ru.old.some(([c]) => c === 'ѳ'));
});
check('écritures non latines : chaque lettre a sa translittération (Ж → j/ž, Ω → ō)', () => {
    for (const l of DATA.languages.filter(x => x.script !== 'latin')) for (const c of l.alphabet) assert.ok(l.tr?.[c]?.[0], `${l.id} : ${c} sans translittération`);
    deq([...byId.ru.tr['ж']], ['j', 'ž']);
    assert.equal(byId.grc.tr['ω'][0], 'ō');
});
check('« ł » → polonais en tête (très probable), « ő » → hongrois, « ß » → allemand, « ř » → tchèque', () => {
    for (const [c, id] of [['ł', 'pl'], ['ő', 'hu'], ['ß', 'de'], ['ř', 'cs'], ['Ł', 'pl'], ['ħ', 'mt'], ['ײַ', 'yi']]) {
        const r = X.identify(c);
        assert.equal(r.results[0]?.id, id, `${c} → ${ids(r)}`); assert.equal(r.results[0].level, 3, `${c} : pas « très probable »`);
    }
    assert.equal(X.identify('ñ').results[0].id, 'es');
});
check('« ж » → les langues cyrilliques seulement ; « ω » → le grec seulement', () => {
    deq(ids(X.identify('ж')).sort(), ['be', 'bg', 'ru', 'sr', 'uk']);
    deq(ids(X.identify('ω')).sort(), ['el', 'grc']);
    deq(ids(X.identify('ὡ')), ['grc']);
});
check('« ąę » → polonais puis lituanien ; lettres ordinaires ignorées pour le classement ; mot des actes', () => {
    deq(ids(X.identify('ąę')), ['pl', 'lt']);
    assert.equal(ids(X.identify('będzie'))[0], 'pl');
    assert.equal(ids(X.identify('baptizatus'))[0], 'la');
    assert.ok(X.identify('w').onlyBasic);
});
check('caractère inconnu (☃, 漢) → aucune langue ; « ł☃ » → polonais et ☃ signalé', () => {
    for (const c of ['☃', '漢', '漢字']) { const r = X.identify(c); assert.equal(r.results.length, 0, c); assert.ok(r.chars.every(x => x.unknown)); }
    const r = X.identify('ł☃'); deq(ids(r), ['pl']); deq([...r.unknown], ['☃']);
    assert.equal(X.identify('жω').results.length, 0);
    assert.equal(X.identify('  12 , ').chars.length, 0);
});
check('casse et formes NFC / NFD traitées pareil', () => {
    const a = JSON.stringify(ids(X.identify('é'))), b = JSON.stringify(ids(X.identify('é'))), c = JSON.stringify(ids(X.identify('É')));
    assert.equal(a, b); assert.equal(a, c);
    deq(ids(X.identify('ő')), ids(X.identify('ő')));
    deq(ids(X.identify('Ж')), ids(X.identify('ж')));
});
check('translittération : russe (français courant, ISO 9), grec moderne et ancien', () => {
    assert.equal(X.translit('Александр Пушкин'), 'Aleksandr Pouchkin');
    assert.equal(X.translit('Александр Пушкин', { system: 'iso' }), 'Aleksandr Puškin');
    assert.equal(X.translit('Дмитрий Фёдорович'), 'Dmitri Fiodorovitch');
    assert.equal(X.translit('Петръ'), 'Petr');
    assert.equal(X.translit('Ђорђе Јовановић'), 'Đorđe Jovanović');
    assert.equal(X.translit('Αθήνα'), 'Athina');
    assert.equal(X.translit('Ευάγγελος'), 'Evangelos');
    assert.equal(X.translit('Ὅμηρος'), 'Homēros');
    assert.equal(X.translit('τῷ λόγῳ'), 'tōi logōi');
    assert.equal(X.translit('Paris 1789'), 'Paris 1789');
});
check('rendu échappé (données et texte tapé)', () => {
    const h = X.guessHtml('<img src=x onerror=alert(1)>');
    assert.ok(!/<img|<script/i.test(h), h);
    const h2 = X.guessHtml('ł"><b>'); assert.ok(!h2.includes('"><b>') && !h2.includes('<b>'), h2);
    for (const l of DATA.languages) assert.ok(!/<script|onerror/i.test(X.langHtml(l.id)));
});

/* ═════ 4 : navigateur ═════ */
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-abc-'));
const dir = path.join(tmp, 'a');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const SHOTS = process.env.ALPHABETS_SHOTS || '';

(async () => {
    let pw = null;
    for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    const out = {};
    if (pw) {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
        if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
        const port = Number(process.env.ALPHABETS_PORT) || await freePort();
        const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        let browser = null;
        try {
            browser = await pw.chromium.launch();
            const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
            await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
            const outside = []; ctx.on('request', q => { if (!q.url().startsWith(base) && !q.url().startsWith('data:') && !q.url().startsWith('blob:')) outside.push(q.url()); });
            const page = await ctx.newPage();
            const errors = []; page.on('pageerror', e => errors.push(String(e.message))); page.on('dialog', d => { errors.push('fenêtre native : ' + d.message()); d.dismiss(); });
            // capture d'un élément plus haut que la fenêtre : on agrandit la fenêtre le temps de la capture (la page défile dans un cadre)
            const shot = async (name, el = '#h-abc-panel') => {
                if (!SHOTS) return;
                const loc = page.locator(el), vp = page.viewportSize(), box = await loc.boundingBox();
                if (box && box.height > vp.height - 120) await page.setViewportSize({ width: vp.width, height: Math.ceil(box.height + 400) });
                await loc.scrollIntoViewIfNeeded(); await page.waitForTimeout(80);
                await loc.screenshot({ path: path.join(SHOTS, name + '.png'), style: '#toast-region{display:none!important}' });
                await page.setViewportSize(vp);
            };
            await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.alphabets);
            await page.evaluate(() => { try { localStorage.removeItem('lcnda-abc-tab'); localStorage.removeItem('lcnda-abc-lang'); } catch (_) {} const A = window.LCNDA_APP; A.state.maintenanceTab = 'calendar_measures'; A.setModule('maintenance'); });
            await page.waitForSelector('#h-abc-panel');
            await page.waitForTimeout(300);
            const rect = s => page.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, r: b.right }; }, s);
            out.feast = await rect('#h-feast-panel'); out.abc = await rect('#h-abc-panel');
            out.lastPanel = await page.evaluate(() => { const g = document.querySelector('.calendar-tools-grid'); return g.lastElementChild?.id; });
            if (SHOTS) { await page.locator('#h-feast-panel').scrollIntoViewIfNeeded(); const f = out.feast; await page.evaluate(() => window.scrollBy(0, 0));
                const fb = await page.locator('#h-feast-panel').boundingBox(), ab = await page.locator('#h-abc-panel').boundingBox();
                await page.screenshot({ path: path.join(SHOTS, '1-a-cote-de-fetes.png'), clip: { x: fb.x - 10, y: fb.y - 10, width: ab.x + ab.width - fb.x + 24, height: Math.min(900, Math.max(fb.height, ab.height) + 24) } }); void f; }
            // onglet 1 : une langue
            out.frCells = await page.locator('#h-abc-pane-lang .h-abc-grid').first().locator('.h-abc-cell').count();
            await shot('2-onglet-une-langue');
            await page.selectOption('[data-abc-lang]', 'ru');
            out.ru = await page.evaluate(() => { const p = document.querySelector('[data-abc-lang-out]'); return { cells: p.querySelector('.h-abc-grid').children.length, zh: [...p.querySelectorAll('.h-abc-cell')].find(c => c.textContent.includes('Ж'))?.textContent }; });
            await shot('2b-une-langue-russe');
            await page.selectOption('[data-abc-lang]', 'la'); await shot('2c-une-langue-latin');
            // onglets au clavier
            await page.focus('[data-abc-tab="lang"]'); await page.keyboard.press('ArrowRight');
            out.tabKey = await page.evaluate(() => ({ active: document.querySelector('[data-abc-tab].is-active')?.dataset.abcTab, focus: document.activeElement?.dataset?.abcTab, shown: !document.getElementById('h-abc-pane-guess').hidden, hidden: document.getElementById('h-abc-pane-lang').hidden }));
            // onglet 2 : quelle langue ?
            const guess = page.locator('[data-abc-guess]');
            await guess.fill('ł'); await page.waitForTimeout(50);
            out.l = await page.evaluate(() => [...document.querySelectorAll('#h-abc-pane-guess .h-abc-result')].map(b => b.querySelector('.h-abc-rname').textContent + '|' + b.querySelector('.h-abc-level').textContent));
            await shot('3-recherche-l-barre');
            await guess.fill('ąę'); out.ae = await page.evaluate(() => [...document.querySelectorAll('#h-abc-pane-guess .h-abc-rname')].map(b => b.textContent));
            await shot('4-recherche-a-e-ogonek');
            await guess.fill('ж'); out.zh = await page.evaluate(() => [...document.querySelectorAll('#h-abc-pane-guess .h-abc-rname')].map(b => b.textContent));
            await guess.fill('ω'); out.om = await page.evaluate(() => [...document.querySelectorAll('#h-abc-pane-guess .h-abc-rname')].map(b => b.textContent));
            for (const c of ['☃', '漢']) { await guess.fill(c); out['u' + c] = await page.evaluate(() => ({ n: document.querySelectorAll('#h-abc-pane-guess .h-abc-result').length, msg: document.querySelector('#h-abc-pane-guess .h-abc-msg')?.textContent || '' })); }
            await shot('5-recherche-sans-resultat');
            await guess.fill('<img src=x onerror="window.__abc=1">ł<script>window.__abc=2</script>');
            await page.waitForTimeout(200);
            out.xss = await page.evaluate(() => ({ flag: window.__abc, img: document.querySelectorAll('#h-abc-panel img, #h-abc-panel script').length, first: document.querySelector('#h-abc-pane-guess .h-abc-rname')?.textContent }));
            await guess.fill('ő'); await page.click('#h-abc-pane-guess .h-abc-result');
            out.open = await page.evaluate(() => ({ tab: document.querySelector('[data-abc-tab].is-active')?.dataset.abcTab, lang: document.querySelector('[data-abc-lang]').value, shown: document.querySelector('[data-abc-current]')?.dataset.abcCurrent }));
            // onglet 3 : clavier
            await page.click('[data-abc-tab="keys"]');
            await shot('6-onglet-cyrillique-grec');
            const key = c => page.click(`[data-abc-key="${c}"]`);
            await page.click('[data-abc-shift]'); await key('П'); await page.click('[data-abc-shift]');
            for (const c of 'ушкин') await key(c);
            out.title = await page.getAttribute('[data-abc-key="ж"]', 'title');
            out.text1 = await page.inputValue('[data-abc-text]'); out.tr1 = await page.textContent('[data-abc-tr]');
            await page.selectOption('[data-abc-sys]', 'iso'); out.tr1iso = await page.textContent('[data-abc-tr]'); await page.selectOption('[data-abc-sys]', 'fr');
            await page.click('[data-abc-copy]'); await page.waitForTimeout(150);
            out.clip = await page.evaluate(() => navigator.clipboard.readText().catch(e => 'ERR ' + e.message));
            await page.click('[data-abc-back]'); out.back = await page.inputValue('[data-abc-text]');
            await page.click('[data-abc-clear]'); out.cleared = await page.inputValue('[data-abc-text]');
            out.undoBtn = await page.locator('text=↶ Annuler').count();
            if (out.undoBtn) { await page.locator('text=↶ Annuler').first().click(); out.undone = await page.inputValue('[data-abc-text]'); }
            await page.fill('[data-abc-text]', '');
            await key('ο'); await page.click('[data-abc-mark="̔"]'); await page.click('[data-abc-mark="́"]'); await key('μ'); await key('η'); await key('ρ'); await key('ο'); await key('ς');
            out.greek = await page.inputValue('[data-abc-text]'); out.trGreek = await page.textContent('[data-abc-tr]');
            await page.keyboard.press('Escape');
            await page.fill('[data-abc-text]', 'Пётр <img src=x onerror="window.__abc=3"> Ѳедоровъ');
            out.xss2 = await page.evaluate(() => ({ flag: window.__abc, img: document.querySelectorAll('#h-abc-panel img').length, tr: document.querySelector('[data-abc-tr]').textContent }));
            await shot('6b-clavier-rempli');
            // mode sombre
            const preset = name => page.evaluate(name => { const A = window.LCNDA_APP, d = A.readDesignSettings(); d.preset = name; localStorage.setItem('genealogie-design', JSON.stringify(d)); A.applyDesign(); }, name);
            const before = await page.evaluate(() => window.LCNDA_APP.readDesignSettings().preset || 'portfolio');
            await preset('dark');
            await page.click('[data-abc-tab="lang"]'); await page.selectOption('[data-abc-lang]', 'pl');
            out.dark = await page.evaluate(() => { const bg = getComputedStyle(document.querySelector('#h-abc-panel')).backgroundColor, cell = getComputedStyle(document.querySelector('.h-abc-cell')).backgroundColor, ink = getComputedStyle(document.querySelector('.h-abc-cell b')).color; return { bg, cell, ink }; });
            await shot('7-mode-sombre');
            await page.click('[data-abc-tab="guess"]'); await guess.fill('ł'); await shot('7b-mode-sombre-recherche');
            out.darkTitle = await page.evaluate(() => getComputedStyle(document.querySelector('#h-abc-panel h3')).color);
            await preset(before);
            // 390 px
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForTimeout(300);
            const overflow = () => page.evaluate(() => {
                const doc = document.documentElement.scrollWidth, p = document.getElementById('h-abc-panel').getBoundingClientRect();
                const bad = [...document.querySelectorAll('#h-abc-panel *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > p.right + 1 || r.left < p.left - 1); }).slice(0, 5).map(e => e.className || e.tagName);
                return { doc, vw: window.innerWidth, inside: p.right <= window.innerWidth + 1 && p.left >= -1, bad };
            });
            out.narrow = {};
            for (const [tab, setup] of [['lang', async () => page.selectOption('[data-abc-lang]', 'sk')], ['guess', async () => guess.fill('ąę')], ['keys', async () => {}]]) {
                await page.click(`[data-abc-tab="${tab}"]`); await setup(); await page.waitForTimeout(100);
                out.narrow[tab] = await overflow();
                await shot(`8-390px-${tab}`);
            }
            out.stacked = await page.evaluate(() => { const f = document.getElementById('h-feast-panel').getBoundingClientRect(), a = document.getElementById('h-abc-panel').getBoundingClientRect(); return a.top >= f.bottom - 1; });
            out.errors = errors; out.outside = outside;
        } finally { await browser?.close(); proc.kill(); }

        check('navigateur : le cadre est le dernier, à droite de « Fêtes religieuses » (même ligne) sur grand écran', () => {
            assert.equal(out.lastPanel, 'h-abc-panel');
            assert.ok(Math.abs(out.abc.y - out.feast.y) < 2 && out.abc.x > out.feast.r, JSON.stringify([out.feast, out.abc]));
        });
        check('navigateur : « Une langue » — 26 lettres en français, russe avec Ж et sa translittération', () => {
            assert.equal(out.frCells, 26); assert.equal(out.ru.cells, 33); assert.match(out.ru.zh, /Ж\s*ж\s*j · ž/);
        });
        check('navigateur : onglets au clavier (flèche → passe à l’onglet suivant)', () => assert.deepEqual(out.tabKey, { active: 'guess', focus: 'guess', shown: true, hidden: true }));
        check('navigateur : « ł » → Polonais très probable en tête ; « ąę » → Polonais, Lituanien', () => {
            assert.equal(out.l[0], 'Polonais|très probable'); assert.equal(out.l.length, 1);
            assert.deepEqual(out.ae, ['Polonais', 'Lituanien']);
        });
        check('navigateur : « ж » → langues cyrilliques, « ω » → grec', () => {
            assert.deepEqual([...out.zh].sort(), ['Biélorusse', 'Bulgare', 'Russe', 'Serbe en cyrillique', 'Ukrainien']);
            assert.deepEqual(out.om, ['Grec moderne', 'Grec ancien / polytonique']);
        });
        check('navigateur : ☃ et 漢 → aucune langue, juste le message', () => {
            for (const c of ['☃', '漢']) { assert.equal(out['u' + c].n, 0); assert.match(out['u' + c].msg, /aucune des langues/); }
        });
        check('navigateur : texte piégé « <img onerror> » et <script> non exécutés (recherche et clavier)', () => {
            assert.equal(out.xss.flag, undefined); assert.equal(out.xss.img, 0); assert.equal(out.xss.first, 'Polonais');
            assert.equal(out.xss2.flag, undefined); assert.equal(out.xss2.img, 0); assert.match(out.xss2.tr, /^Piotr <img src=x onerror="window.__abc=3"> Fedorov$/);
        });
        check('navigateur : clic sur une langue proposée → onglet « Une langue » sur elle', () => assert.deepEqual(out.open, { tab: 'lang', lang: 'hu', shown: 'hu' }));
        check('navigateur : clavier ⇧ + lettres, bulle nom et translittération, translittération en direct', () => {
            assert.equal(out.text1, 'Пушкин'); assert.equal(out.tr1, 'Pouchkin'); assert.equal(out.tr1iso, 'Puškin');
            assert.match(out.title, /jé.*j \/ ž/);
        });
        check('navigateur : 📋 Copier, ⌫, Vider puis ↶ Annuler', () => {
            assert.equal(out.clip, 'Пушкин'); assert.equal(out.back, 'Пушки'); assert.equal(out.cleared, '');
            assert.ok(out.undoBtn > 0); assert.equal(out.undone, 'Пушки');
        });
        check('navigateur : grec polytonique — esprit rude + accent sur la lettre (ὅμηρος → homēros)', () => { assert.equal(out.greek, 'ὅμηρος'); assert.equal(out.trGreek, 'homēros'); });
        check('navigateur : mode sombre (fond du cadre et des cases sombres, lettres claires)', () => {
            const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return (m[0] * .299 + m[1] * .587 + m[2] * .114) / 255; };
            assert.ok(lum(out.dark.bg) < .3 && lum(out.dark.cell) < .35 && lum(out.dark.ink) > .7 && lum(out.darkTitle) > .7, JSON.stringify([out.dark, out.darkTitle]));
        });
        check('navigateur : 390 px — aucun défilement de côté, rien ne dépasse du cadre (3 onglets), cadre sous « Fêtes »', () => {
            for (const [tab, o] of Object.entries(out.narrow)) { assert.ok(o.doc <= o.vw, `${tab} : page ${o.doc} > ${o.vw}`); assert.ok(o.inside, tab); assert.deepEqual(o.bad, [], tab); }
            assert.ok(out.stacked);
        });
        check('navigateur : aucune erreur JS, aucune fenêtre native, aucune requête vers l’extérieur', () => { assert.deepEqual(out.errors, []); assert.deepEqual(out.outside, []); });
    } else console.log('  – navigateur : sauté (Playwright absent)');

    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
