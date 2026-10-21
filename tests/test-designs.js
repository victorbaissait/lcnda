'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎨 Designs au choix A1–A10 et Ensembles prêts (assets/js/app-designs.js, assets/css/designs.css, designs-gen.css) :
 *   node tests/test-designs.js
 *  1. sans navigateur : « Comme avant » ne pose rien ; chaque carte de chaque réglage pose son attribut ; les « Réglages en plus »
 *     posent les leurs (et « retouché ») ; valeurs vérifiées et bornées ; ensembles prêts ; A5 = couleurs des portraits (K7) ;
 *     designs enregistrés de l'Apparence (a_designs) ; phrase de l'acte ; noms en minuscules ;
 *  2. les fichiers : clés du défaut du site (app.js, api.php), « 💾 Réglages enregistrés : l'Apparence », page de Maintenance
 *     juste après « Apparence », feuilles dont chaque règle commence par un attribut data-lc-*, feuille fabriquée éteinte par défaut ;
 *  3. le navigateur (Playwright ; sinon sauté) : rien de posé par défaut ; la page (sommaire, sections repliables fermées,
 *     ouvertes retenues, titre « A1 Style général — Doux ») ; choisir une carte, « retouché », « ↶ Annuler » ; ensemble prêt ;
 *     enregistrer / exporter / importer un mélange ; recoupements (A7 et la police d'Accessibilité, A8 et « Réduire les animations »,
 *     A5 et les portraits) ; 390 px et sombre sans débordement ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

/* ── un petit navigateur pour charger les fichiers ── */
function sandbox(store = {}) {
    const attrs = {}, props = {};
    const docEl = {setAttribute: (n, v) => { attrs[n] = String(v); }, removeAttribute: n => { delete attrs[n]; }, hasAttribute: n => n in attrs, getAttribute: n => attrs[n] ?? null,
        dataset: {}, classList: {contains: () => false, add() {}, remove() {}}, ownerDocument: null,
        style: {setProperty: (k, v) => { props[k] = v; }, removeProperty: k => { delete props[k]; }, getPropertyValue: k => props[k] || ''}};
    const localStorage = {getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; }};
    const sheets = {'lc-frame-css': {media: 'not all'}, 'lc-designs-gen': {media: 'not all'}};
    const document = {documentElement: docEl, getElementById: id => sheets[id] || null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: null};
    docEl.ownerDocument = document;
    const window = {LCNDA_APP: {sosaNumberFor: () => 0}, addEventListener() {}};
    const ctx = {window, localStorage, console, document, requestAnimationFrame: () => 0, setTimeout, clearTimeout, setInterval: () => 0, location: {href: 'http://x/'}, getComputedStyle: () => ({getPropertyValue: () => ''})};
    vm.createContext(ctx);
    vm.runInContext(read('assets/js/app-portraits.js'), ctx);
    vm.runInContext(read('assets/js/app-designs.js'), ctx);
    return {window, attrs, props, store, sheets, D: window.LCNDA_DESIGNS};
}

(async () => {
    /* ═════ 1. sans navigateur ═════ */
    await t('« Comme avant » par défaut : aucun attribut, aucune variable, feuille fabriquée éteinte', () => {
        const {attrs, props, store, sheets, D} = sandbox();
        assert.ok(!Object.keys(attrs).some(k => k.startsWith('data-lc-')), 'aucun attribut data-lc-*');
        assert.ok(!Object.keys(props).some(k => k.startsWith('--lc-')), 'aucune variable --lc-*');
        assert.equal(sheets['lc-designs-gen'].media, 'not all'); assert.equal(sheets['lc-frame-css'].media, 'not all');
        assert.ok(!('lcnda-designs-ui-v1' in store), 'pas de copie pour index.php');
        const G = D.read(); D.IDS.forEach(id => { assert.equal(G[id].v, 'avant'); assert.equal(D.isOn(G, id), false); });
        assert.equal(JSON.stringify(D.attrsOf(G)), '{"attrs":{},"vars":{}}');
        assert.equal(D.presetOf(G).k, 'avant');
    });
    await t('chaque carte de chaque réglage pose son attribut (et rien pour « Comme avant »)', () => {
        const {D} = sandbox();
        const MAIN = {a1: 'style', a2: 'density', a3: 'icons', a4: 'fiche', a5: 'tree', a6: 'btn', a7: 'font', a8: 'motion', a9: 'list', a10: 'dash'};
        D.IDS.forEach(id => D.DEFS[id].variants.forEach(v => {
            const G = D.clean({[id]: {v: v.k}}); const {attrs} = D.attrsOf(G);
            if (v.k === 'avant') assert.equal(Object.keys(attrs).length, 0, `${id} avant`);
            else { assert.equal(attrs[`data-lc-${MAIN[id]}`], v.k, `${id} ${v.k}`); assert.ok(Object.keys(attrs).every(a => D.ATTRS.includes(a)), 'attributs connus'); }
        }));
        const {attrs, vars} = D.attrsOf(D.clean({a1: {v: 'doux'}}));
        assert.equal(attrs['data-lc-lines'], '1'); assert.equal(attrs['data-lc-sh'], 'douces'); assert.equal(attrs['data-lc-r'], '1'); assert.equal(attrs['data-lc-grid'], 'off'); assert.equal(attrs['data-lc-acc'], '1'); assert.equal(attrs['data-lc-cards'], '1');
        assert.equal(vars['--lc-r'], '10px'); assert.equal(vars['--lc-k'], '0.5'); assert.equal(vars['--lc-acc-l'], '#2f5fd0'); assert.ok(/^#(ffffff|0d1118)$/.test(vars['--lc-on-acc-l']));
    });
    await t('« Réglages en plus » : retouché, attributs de la retouche seule, valeurs bornées et vérifiées', () => {
        const {D, attrs} = sandbox({'genealogie-designs': JSON.stringify({a1: {v: 'avant', r: 99, bw: 'x', acc: 'red;}'}, a2: {v: 'nope', sp: 10}, a3: {v: 'trait', ic: '<b>'}, a7: {v: 'avant', caps: false}, a10: {v: 'colonnes', cols: 9}})});
        const G = D.read();
        assert.equal(G.a1.r, 16, 'arrondi borné'); assert.equal(G.a1.bw, 2, 'épaisseur illisible → départ'); assert.equal(G.a1.acc, '', 'couleur forgée refusée');
        assert.equal(G.a2.v, 'avant'); assert.equal(G.a2.sp, 60, 'espace borné'); assert.equal(G.a3.ic, 16); assert.equal(G.a10.cols, 4);
        assert.ok(D.isModified(G, 'a1') && D.isOn(G, 'a1'), 'A1 « Comme avant » retouché');
        assert.equal(attrs['data-lc-style'], 'avant'); assert.equal(attrs['data-lc-r'], '1'); assert.ok(!('data-lc-lines' in attrs), 'traits de départ : pas de feuille des traits');
        assert.equal(attrs['data-lc-caps'], 'off'); assert.equal(attrs['data-lc-font'], 'avant');
        assert.ok(!D.isModified(D.clean({a4: {v: 'bandeau'}}), 'a4'), 'une carte sans retouche n’est pas « retouché »');
    });
    await t('ensembles prêts : 5 ensembles, reconnus, « Très lisible » avec ses retouches', () => {
        const {D} = sandbox();
        assert.equal(D.PRESETS.map(p => p.k).join(), 'avant,doux,archives,lisible,compact');
        D.PRESETS.forEach(p => assert.equal(D.presetOf(D.presetState(p)).k, p.k));
        const L = D.presetState(D.PRESETS[3]);
        assert.equal(L.a7.size, 116); assert.equal(L.a3.lbl, true); assert.equal(L.a6.size, 'grande'); assert.equal(L.a1.acc, '#0047b3');
        const mix = D.presetState(D.PRESETS[1]); mix.a2.sp = 105; assert.equal(D.presetOf(mix), undefined, 'un mélange perso');
    });
    await t('enregistré, appliqué, copie pour index.php ; « Comme avant » efface la clé', () => {
        const {D, store, attrs, sheets} = sandbox();
        D.write(D.clean({a1: {v: 'papier'}, a9: {v: 'zebre'}}));
        assert.equal(JSON.parse(store['genealogie-designs']).a1.v, 'papier'); assert.equal(attrs['data-lc-style'], 'papier'); assert.equal(attrs['data-lc-list'], 'zebre');
        assert.equal(sheets['lc-designs-gen'].media, 'all'); assert.equal(sheets['lc-frame-css'].media, 'all');
        assert.equal(JSON.parse(store['lcnda-designs-ui-v1']).a['data-lc-style'], 'papier');
        D.write(D.presetState(D.PRESETS[0]));
        assert.ok(!('genealogie-designs' in store) && !('lcnda-designs-ui-v1' in store), 'rien de gardé');
        assert.ok(!Object.keys(attrs).some(k => k.startsWith('data-lc-')), 'plus aucun attribut');
    });
    await t('recoupement A5 / K7 : une seule source pour les couleurs homme / femme', () => {
        const {D, store, window} = sandbox({'genealogie-portraits': JSON.stringify({mode: 'avant', m: '#112233', f: '#445566'})});
        let G = D.read(); assert.equal(G.a5.m, '#112233'); assert.equal(G.a5.f, '#445566');
        G.a5.v = 'genre'; G.a5.m = '#0055aa'; D.write(G);
        assert.equal(JSON.parse(store['genealogie-portraits']).m, '#0055aa', 'écrit dans les portraits');
        assert.equal(window.LCNDA_PORTRAITS.read().mode, 'avant', 'les portraits restent « Comme avant »');
        assert.ok(!('m' in JSON.parse(store['genealogie-designs']).a5), 'pas de deuxième copie');
        assert.equal(D.isModified(D.read(), 'a5'), false, 'les couleurs (partagées) ne font pas « retouché »');
    });
    await t('designs enregistrés de l’Apparence : a_designs part et revient', () => {
        const {D, window, store} = sandbox({'genealogie-designs': JSON.stringify({a2: {v: 'compacte'}})});
        const flat = window.LCNDA_EXT.lookFlat(); assert.equal(JSON.parse(flat.a_designs).a2.v, 'compacte');
        window.LCNDA_EXT.lookFromFlat({a_designs: ''}); assert.ok(!('genealogie-designs' in store));
        window.LCNDA_EXT.lookFromFlat({a_designs: JSON.stringify({a6: {v: 'texte', size: '<x>'}})}); assert.equal(JSON.parse(store['genealogie-designs']).a6.size, 'normale');
    });
    await t('A4 « acte ancien » et A7 « noms en minuscules »', () => {
        const {D} = sandbox();
        const G = D.clean({a7: {v: 'avant', caps: false}});
        const det = {person: {id: 3, first_name: 'Louise', last_name: 'BORIE', gender: 'female'}, events: [{gedcom_tag: 'BIRT', date_text: '9 mars 1922', place_name: 'Tulle', county: 'Corrèze'}, {gedcom_tag: 'DEAT', date_text: '9 décembre 1999', place_name: 'Brive'}], parents: [{first_name: 'Antoine', last_name: 'BORIE'}], partners: [{first_name: 'Jean', last_name: 'MARTIN'}]};
        const s = D.acteText(det, 'tout', G);
        assert.match(s, /^Née le <b>9 mars 1922<\/b> à <b>Tulle \(Corrèze\)<\/b>, fille de Antoine Borie, épouse de Jean Martin, décédée le <b>9 décembre 1999<\/b> à <b>Brive<\/b>\.$/);
        assert.match(D.acteText({person: {...det.person, first_name: '<img src=x>', gender: 'male'}, events: [], parents: [], partners: []}, 'dates', D.clean({})), /&lt;img/, 'nom échappé');
        assert.doesNotMatch(D.acteText({...det, parents: [{first_name: '<b>x</b>', last_name: 'Y'}]}, 'tout', D.clean({})), /<b>x/, 'parent échappé');
        assert.equal(D.titleCase('Louise BORIE-DUPONT d’ARNAC'), 'Louise Borie-Dupont d’Arnac');
    });

    /* ═════ 2. les fichiers ═════ */
    await t('clés : défaut du site (app.js + api.php), réglages enregistrés de l’Apparence', () => {
        const appKeys = read('assets/js/app.js').match(/const SITE_DEFAULT_KEYS = \[([\s\S]*?)\];/)[1];
        const apiKeys = read('api.php').match(/function site_defaults_allowed_keys\(\): array\s*\{[^\[]*return \[([\s\S]*?)\];/)[1];
        ['genealogie-designs', 'genealogie-designs-presets'].forEach(k => { assert.ok(appKeys.includes(`'${k}'`), `SITE_DEFAULT_KEYS ${k}`); assert.ok(apiKeys.includes(`'${k}'`), `api.php ${k}`); });
        assert.ok(read('assets/js/heritage-studio.js').match(/const LAYOUT_KEYS = \[([\s\S]*?)\];/)[1].includes("'genealogie-designs'"));
        assert.match(read('assets/js/app.js'), /const \{k7_portraits,k15_colonne,a_designs,\.\.\.rest\}/);
    });
    await t('« 🎨 Designs au choix » juste après « Apparence » (colonne, groupe, réglages gardés tout seuls)', () => {
        assert.match(read('assets/js/app.js'), /\['design','01','Apparence'\],\['designs','01a','Designs au choix'\]/);
        assert.match(read('assets/js/app-maintenance.js'), /\['design', 'designs', 'design_board'/);
        assert.match(read('assets/js/app-pages.js'), /SETTINGS_TABS = \['design', 'designs',/);
    });
    await t('index.php : feuilles, pose au plus tôt, script après app-apparence.js', () => {
        const idx = read('index.php');
        assert.match(idx, /designs-gen\.css\?v=\d+" id="lc-designs-gen" media="not all"/);
        assert.match(idx, /designs\.css\?v=\d+">/);
        assert.match(idx, /localStorage\.getItem\('lcnda-designs-ui-v1'\)/);
        assert.ok(idx.indexOf('lcnda-designs-ui-v1') < idx.indexOf('<body'), 'dans <head>');
        assert.ok(idx.indexOf('src="assets/js/app-apparence.js') < idx.indexOf('src="assets/js/app-designs.js'));
    });
    await t('aucune règle active sans attribut : designs.css, designs-gen.css, apparence-traits.css', () => {
        const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
        const splitTop = sel => { const out = []; let d = 0, cur = ''; for (const ch of sel) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out.filter(Boolean); };
        const selectors = css => { css = strip(css); const out = []; let i = 0; const walk = () => { while (i < css.length) { const j = css.indexOf('{', i), e = css.indexOf('}', i); if (e >= 0 && (j < 0 || e < j)) { i = e + 1; return; } if (j < 0) { i = css.length; return; } const pre = css.slice(i, j).trim(); i = j + 1; if (pre.startsWith('@')) { if (/^@(media|supports)/.test(pre)) walk(); else { let d = 1; while (i < css.length && d) { if (css[i] === '{') d++; else if (css[i] === '}') d--; i++; } } continue; } if (!/^(from|to|\d+%)/.test(pre)) out.push(...splitTop(pre)); const k = css.indexOf('}', i); i = k + 1; } }; walk(); return out; };
        // à part : la page de Maintenance (.lcd-*), et les éléments que seul app-designs.js pose (.lc-ic, .lc-dz…)
        const OWN = /^(:root\[data-lc-|:root:not\(\[data-lc-motion\]\) \.lcd-|:root\[data-theme="dark"\] \.(lcd-|lc-|person-hero\.lc-hero)|html\.a11y-calm \.lcd-|\.lcd-|\.lc-(ic|hero|acte|carte|row-av|tree-sosa|journal|toast-s|dz-hide)|\.person-hero\.lc-hero|:root \.person-hero\.lc-hero)/;
        const bad = selectors(read('assets/css/designs.css')).filter(s => !OWN.test(s));
        assert.deepEqual(bad, [], 'règles sans attribut : ' + bad.slice(0, 5).join(' | '));
        const gen = selectors(read('assets/css/designs-gen.css')).filter(s => !s.startsWith(':root[data-lc-'));
        assert.deepEqual(gen.slice(0, 3), [], 'feuille fabriquée');
        const tr = selectors(read('assets/css/apparence-traits.css')).filter(s => !/^(:root|html):is\(\.lc-frame,\[data-lc-lines\]\)/.test(s));
        assert.deepEqual(tr.slice(0, 3), [], 'feuille des traits');
    });
    await t('FAQ, CLAUDE.md, docs/UI.md', () => {
        assert.match(read('assets/js/heritage-more.js'), /Designs au choix/);
        assert.match(read('CLAUDE.md'), /Designs au choix A1–A10 \(validé\)/);
        assert.match(read('docs/UI.md'), /Designs au choix/);
    });

    /* ═════ 3. le navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-designs-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased'),('Antoine','BORIE','male','deceased'),('Marie','LEROY','female','unknown'),('<img src=x onerror=window.__xss=1>','PIÈGE','unknown','unknown')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.DESIGNS_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (w = 1440, extra = {}) => {
        const page = await browser.newPage({viewport: {width: w, height: 900}, ...extra});
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        await page.route(u => !u.toString().startsWith(base), rt => rt.abort());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1500);
        return page;
    };
    const lcAttrs = page => page.evaluate(() => [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('data-lc-')));
    const toDesigns = page => page.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'designs'; await A.setModule('maintenance'); });
    const setDesigns = (page, v) => page.evaluate(v => { if (v == null) localStorage.removeItem('genealogie-designs'); else localStorage.setItem('genealogie-designs', JSON.stringify(v)); window.LCNDA_DESIGNS.apply(); }, v);
    try {
        const page = await open();
        await t('navigateur : rien de posé par défaut', async () => {
            assert.deepEqual(await lcAttrs(page), []);
            assert.equal(await page.evaluate(() => document.getElementById('lc-designs-gen').media), 'not all');
        });
        await t('la page : sommaire, sections repliables fermées par défaut, ouvertes retenues', async () => {
            await page.evaluate(() => localStorage.removeItem('lcnda-designs-open'));
            await toDesigns(page); await page.waitForSelector('.lcd-page .lcd-toc');
            assert.equal(await page.locator('.lcd-toc-i').count(), 11);
            assert.equal(await page.locator('details.lcd-sec[open]').count(), 0, 'tout fermé');
            assert.match(await page.locator('#lcd-a1 > summary').innerText(), /A1\s+🎨\s*Style général\s*—\s*Comme avant/);
            await page.click('[data-lcd-go="a1"]');
            await page.waitForSelector('#lcd-a1[open] [data-lcd-v="doux"]');
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lcnda-designs-open'))), ['a1']);
            await toDesigns(page); await page.waitForSelector('#lcd-a1[open]');
            assert.equal(await page.locator('#lcd-a1 .lcd-stage .lcd-frame').count() >= 4, true, 'quatre aperçus');
        });
        await t('choisir « Doux » : gardé tout de suite, titre « — Doux », ↶ Annuler', async () => {
            await page.click('#lcd-a1 [data-lcd-v="doux"]');
            await page.waitForFunction(() => document.documentElement.getAttribute('data-lc-style') === 'doux');
            assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('genealogie-designs'))).a1.v, 'doux');
            assert.match(await page.locator('#lcd-a1 > summary').innerText(), /Style général\s*—\s*Doux/);
            assert.match(await page.locator('#lcd-a1 [data-lcd-saved]').innerText(), /✓ Enregistré/);
            const t1 = page.locator('.toast', {hasText: 'A1 Style général : Doux'}).last(); await t1.waitFor();
            await t1.locator('button', {hasText: 'Annuler'}).click();
            await page.waitForFunction(() => !document.documentElement.hasAttribute('data-lc-style'));
            assert.equal(await page.evaluate(() => localStorage.getItem('genealogie-designs')), null);
        });
        await t('« Réglages en plus » : retouché, Pourquoi ?, ↺ Remettre comme au départ', async () => {
            assert.ok(await page.locator('#lcd-a1 .lcd-why').count() >= 5);
            await page.selectOption('#lcd-a1 select[data-lcd-k="sh"]', 'aucune');
            await page.waitForFunction(() => document.documentElement.getAttribute('data-lc-sh') === 'aucune');
            await page.waitForSelector('#lcd-a1 .lcd-choice.is-active .lcd-tag.is-mod');
            assert.match(await page.locator('#lcd-a1 > summary').innerText(), /retouché/i);
            await page.click('#lcd-a1 .lcd-foot [data-lcd-reset="a1"]');
            await page.waitForFunction(() => !document.documentElement.hasAttribute('data-lc-style'));
        });
        await t('ensemble prêt « Archives anciennes », puis enregistrer / exporter / importer un mélange', async () => {
            await page.evaluate(() => { const d = document.getElementById('lcd-ens'); d.open = true; });
            await page.waitForSelector('#lcd-ens [data-lcd-preset="archives"]');
            await page.click('#lcd-ens [data-lcd-preset="archives"]');
            await page.waitForFunction(() => document.documentElement.getAttribute('data-lc-style') === 'papier' && document.documentElement.getAttribute('data-lc-fiche') === 'acte');
            assert.match(await page.locator('#lcd-ens > summary').innerText(), /Archives anciennes/);
            const frame = page.locator('#lcd-ens .ui-presets');
            await frame.locator('[data-ps-toggle]').click();
            await frame.locator('[data-ps-new]').click();
            await frame.locator('[data-ps-name]').fill('Mon registre');
            await frame.locator('[data-ps-ok]').click();
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-designs-presets') || '[]').some(x => x.name === 'Mon registre'));
            await frame.locator('[data-ps-more]').first().click();
            const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.ui-actmenu-i', {hasText: 'Exporter'}).click()]);
            const file = path.join(tmp, 'export.json'); await dl.saveAs(file);
            const json = JSON.parse(fs.readFileSync(file, 'utf8'));
            assert.equal(json.outil, 'designs'); assert.equal(json.donnees.data.a1.v, 'papier');
            json.nom = 'Copie importée'; json.donnees.data.a9 = {v: 'cartes', hover: '<script>'}; fs.writeFileSync(file, JSON.stringify(json));
            await frame.locator('[data-ps-import]').click();
            await page.locator('dialog.k-import input[type=file]').setInputFiles(file);
            await page.locator('dialog.k-import [data-k-go]:not([disabled])').click();
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-designs-presets') || '[]').some(x => x.name === 'Copie importée'));
            const imp = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-designs-presets')).find(x => x.name === 'Copie importée').data);
            assert.equal(imp.a9.v, 'cartes'); assert.equal(imp.a9.hover, 'trait', 'valeur forgée remise à celle de la carte');
            await setDesigns(page, null);
        });
        await t('recoupements : A7 et la police d’Accessibilité, A8 et « Réduire les animations », A5 et les portraits', async () => {
            await setDesigns(page, {a7: {v: 'lisible'}, a8: {v: 'petit'}});
            const font = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-family'));
            assert.match(await font(), /Atkinson/);
            await page.evaluate(() => { document.documentElement.classList.add('a11y-font'); document.documentElement.style.setProperty('--a11y-font', 'OpenDyslexic, sans-serif'); });
            assert.match(await font(), /OpenDyslexic/, 'Accessibilité garde la priorité');
            await page.evaluate(() => { document.documentElement.classList.remove('a11y-font'); document.documentElement.style.removeProperty('--a11y-font'); });
            const anim = () => page.evaluate(() => { const d = document.createElement('dialog'); d.className = 'modal'; document.body.appendChild(d); d.show(); const a = getComputedStyle(d).animationDuration; d.remove(); return a; });
            assert.notEqual(await anim(), '0s', 'petit mouvement');
            await page.evaluate(() => document.documentElement.classList.add('a11y-calm'));
            assert.match(await anim(), /^(0s|1e-0\d*s|0\.00\d*s)$/, 'Réduire les animations : rien ne bouge');
            await page.evaluate(() => document.documentElement.classList.remove('a11y-calm'));
            await toDesigns(page);
            await page.evaluate(() => { const d = document.getElementById('lcd-a5'); d.open = true; });
            await page.waitForSelector('#lcd-a5 [data-lcd-k="m"]', {state: 'attached'});
            await page.evaluate(() => { const i = document.querySelector('#lcd-a5 input[data-lcd-k="m"]'); i.value = '#123456'; i.dispatchEvent(new Event('change', {bubbles: true})); });
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-portraits') || '{}').m === '#123456');
            assert.equal(await page.evaluate(() => window.LCNDA_PORTRAITS.read().m), '#123456');
            await setDesigns(page, null);
        });
        await t('les vrais écrans : fiche (4 en-têtes), liste, tableau de bord, arbre ; nom piégé échappé', async () => {
            for (const v of ['bandeau', 'acte', 'carte']) {
                await setDesigns(page, {a4: {v}, a3: {v: 'trait'}, a9: {v: 'zebre'}});
                await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; await A.setModule('personnes'); });
                await page.waitForSelector(`.person-hero.lc-hero-${v}`);
                assert.equal(await page.locator('.person-hero h2').count(), 1, 'le nom reste dans la page');
                assert.ok(await page.locator('.lc-ic.is-svg').count() > 0, 'icônes au trait');
                assert.equal(await page.evaluate(() => [...document.querySelectorAll('.lc-ic')].every(x => x.querySelector('.lc-ic-e').textContent.length)), true, 'l’émoji reste dans le texte');
            }
            await setDesigns(page, {a10: {v: 'journal'}});
            await page.evaluate(async () => { await window.LCNDA_APP.setModule('dashboard'); });
            await page.waitForSelector('.lc-journal');
            await setDesigns(page, null);
            await page.waitForFunction(() => !document.querySelector('.lc-ic, .lc-journal'));
            assert.equal(await page.evaluate(() => window.__xss), undefined);
        });
        await t('390 px et sombre : la page sans débordement', async () => {
            for (const [w, dark] of [[390, false], [1440, true]]) {
                const p = await open(w);
                if (dark) await p.evaluate(() => { localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); window.LCNDA_APP.applyDesign(); });
                await p.evaluate(() => localStorage.setItem('lcnda-designs-open', '["ens","a4"]'));
                await toDesigns(p); await p.waitForSelector('#lcd-a4[open] .lcd-frame:not(.is-loading)', {timeout: 15000});
                const over = await p.evaluate(() => { const pg = document.querySelector('.lcd-page'), W = document.documentElement.clientWidth; return Math.max(document.getElementById('workspace').scrollWidth - document.getElementById('workspace').clientWidth, ...[...pg.querySelectorAll('*')].filter(e => !e.closest('.lcd-stage')).map(e => Math.round(e.getBoundingClientRect().right - W))); }); // (la barre des onglets du haut défile toute seule)
                const who = over > 1 ? await p.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > W + 1 && r.width > 0 && !e.closest('.lcd-stage') && e.closest('.lcd-page') && ![...e.children].some(c => c.getBoundingClientRect().right > W + 1); }).slice(0, 6).map(e => `${e.tagName}.${[...e.classList].join('.')} ${Math.round(e.getBoundingClientRect().right)}`).join(' | '); }) : '';
                const kids = over > 1 ? await p.evaluate(() => [...document.querySelectorAll('#lcd-ens .lcd-body > *, #lcd-ens .lcd-body > * > *')].map(e => `${e.tagName}.${e.className} ${Math.round(e.getBoundingClientRect().width)}/${e.scrollWidth}`).join(' | ')) : '';
                assert.ok(over <= 1, `${w}px : débordement de ${over}px (${who}) ${kids}`);
                if (dark) { await p.evaluate(() => { localStorage.removeItem('genealogie-design'); window.LCNDA_APP.applyDesign(); }); }
                await p.close();
            }
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    finish();
})();
function finish() { console.log(`${failed ? '✗' : '✓'} designs au choix : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
