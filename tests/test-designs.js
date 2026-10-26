'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎨 Designs au choix A1–A8 (assets/js/app-designs.js, assets/css/designs.css, designs-gen.css) :
 *   node tests/test-designs.js        (la priorité de l'Apparence : tests/test-designs-apparence.js)
 *  1. sans navigateur : « Comme avant » ne pose rien ; chaque carte de chaque réglage pose son attribut ; les « Réglages en plus »
 *     posent les leurs (et « retouché ») ; valeurs vérifiées et bornées ; plus d'ensembles, de police (ancienne A7), de tableau de
 *     bord (ancienne A10) ni de couleur d'accent ; ancien réglage relu ; A5 = couleurs des portraits (K7) ;
 *     designs enregistrés de l'Apparence (a_designs) ; phrase de l'acte ;
 *  2. les fichiers : clés du défaut du site (app.js, api.php), « 💾 Réglages enregistrés : l'Apparence », page des Réglages
 *     juste après « Apparence », feuilles dont chaque règle commence par un attribut data-lc-*, feuille fabriquée éteinte par défaut ;
 *  3. le navigateur (Playwright ; sinon sauté) : rien de posé par défaut ; la page (sommaire de 8, sections repliables fermées,
 *     ouvertes retenues, titre « A1 Style général — Doux ») ; choisir une carte, « retouché », « ↶ Annuler » ; recoupements
 *     (A7 et « Réduire les animations », A5 et les portraits) ; vrais écrans ; 390 px et sombre sans débordement ; aucune erreur JavaScript.
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
        assert.ok(!('lcnda-designs-ui-v2' in store), 'pas de copie pour index.php');
        const G = D.read(); D.IDS.forEach(id => { assert.equal(G[id].v, 'avant'); assert.equal(D.isOn(G, id), false); });
        assert.equal(JSON.stringify(D.attrsOf(G)), '{"attrs":{},"vars":{}}');
    });
    await t('huit réglages A1 à A8, sans ensembles, sans police, sans tableau de bord, sans couleur d’accent', () => {
        const {D} = sandbox();
        assert.equal(D.IDS.join(), 'a1,a2,a3,a4,a5,a6,a7,a8');
        assert.equal(D.IDS.map(id => D.DEFS[id].n).join(), 'A1,A2,A3,A4,A5,A6,A7,A8');
        assert.equal(D.IDS.map(id => D.DEFS[id].title).join(' | '), 'Style général | Densité | Icônes | Fiche d’une personne | Cases des arbres | Boutons | Mouvements | Listes');
        assert.equal(D.PRESETS, undefined, 'plus d’ensembles prêts'); assert.equal(D.presetState, undefined);
        assert.ok(!D.DEFS.a1.settings.some(s => s.k === 'acc'), 'plus de couleur d’accent');
        assert.ok(!D.IDS.some(id => /police|tableau de bord/i.test(D.DEFS[id].title)));
        assert.ok(!D.ATTRS.some(a => /data-lc-(acc|cards|font|fz|lh|caps|titles|dash|wgap|dnum|dempty)$/.test(a)), 'aucun attribut retiré n’est encore posé');
        const src = read('assets/js/app-designs.js');
        assert.doesNotMatch(src, /Ensembles prêts|data-lcd-preset|SETS_KEY/, 'plus rien des ensembles');
    });
    await t('chaque carte de chaque réglage pose son attribut (et rien pour « Comme avant »)', () => {
        const {D} = sandbox();
        const MAIN = {a1: 'style', a2: 'density', a3: 'icons', a4: 'fiche', a5: 'tree', a6: 'btn', a7: 'motion', a8: 'list'};
        D.IDS.forEach(id => D.DEFS[id].variants.forEach(v => {
            const G = D.clean({ver: 2, [id]: {v: v.k}}); const {attrs} = D.attrsOf(G);
            if (v.k === 'avant') assert.equal(Object.keys(attrs).length, 0, `${id} avant`);
            else { assert.equal(attrs[`data-lc-${MAIN[id]}`], v.k, `${id} ${v.k}`); assert.ok(Object.keys(attrs).every(a => D.ATTRS.includes(a)), 'attributs connus'); }
        }));
        const {attrs, vars} = D.attrsOf(D.clean({a1: {v: 'doux'}}));
        assert.equal(attrs['data-lc-lines'], '1'); assert.equal(attrs['data-lc-sh'], 'douces'); assert.equal(attrs['data-lc-r'], '1'); assert.equal(attrs['data-lc-grid'], 'off');
        assert.ok(!('data-lc-acc' in attrs) && !('data-lc-cards' in attrs), 'ni couleur, ni palette');
        assert.equal(vars['--lc-r'], '10px'); assert.equal(vars['--lc-k'], '0.5'); assert.ok(!Object.keys(vars).some(k => /acc/.test(k)));
    });
    await t('« Réglages en plus » : retouché, attributs de la retouche seule, valeurs bornées et vérifiées', () => {
        const {D, attrs} = sandbox({'genealogie-designs': JSON.stringify({ver: 2, a1: {v: 'avant', r: 99, bw: 'x', acc: 'red;}'}, a2: {v: 'nope', sp: 10}, a3: {v: 'trait', ic: '<b>'}, a7: {v: 'petit', dur: 9999}})});
        const G = D.read();
        assert.equal(G.a1.r, 16, 'arrondi borné'); assert.equal(G.a1.bw, 2, 'épaisseur illisible → départ'); assert.ok(!('acc' in G.a1), 'plus de couleur d’accent');
        assert.equal(G.a2.v, 'avant'); assert.equal(G.a2.sp, 60, 'espace borné'); assert.equal(G.a3.ic, 16); assert.equal(G.a7.dur, 400, 'vitesse bornée');
        assert.ok(D.isModified(G, 'a1') && D.isOn(G, 'a1'), 'A1 « Comme avant » retouché');
        assert.equal(attrs['data-lc-style'], 'avant'); assert.equal(attrs['data-lc-r'], '1'); assert.ok(!('data-lc-lines' in attrs), 'traits de départ : pas de feuille des traits');
        assert.ok(!D.isModified(D.clean({ver: 2, a4: {v: 'bandeau'}}), 'a4'), 'une carte sans retouche n’est pas « retouché »');
    });
    await t('ancien réglage (A1–A10, sans ver) : A7 police et A10 ignorés, A8 → A7, A9 → A8, nettoyé au chargement', () => {
        const old = {a1: {v: 'papier', acc: '#8a4b1f'}, a3: {v: 'trait'}, a4: {v: 'acte'}, a7: {v: 'serif', size: 130}, a8: {v: 'aucun'}, a9: {v: 'zebre'}, a10: {v: 'journal'}};
        const {D, store, attrs} = sandbox({'genealogie-designs': JSON.stringify(old), 'genealogie-designs-presets': '[{"name":"x","data":{}}]', 'lcnda-designs-ui-v1': '{"a":{"data-lc-font":"serif"}}', 'lcnda-designs-open': '["ens"]'});
        const G = D.read();
        assert.equal(G.a1.v, 'papier'); assert.equal(G.a7.v, 'aucun', 'Mouvements'); assert.equal(G.a8.v, 'zebre', 'Listes'); assert.equal(G.a4.v, 'acte');
        const kept = JSON.parse(store['genealogie-designs']);
        assert.equal(kept.ver, 2); assert.equal(kept.a7.v, 'aucun'); assert.equal(kept.a8.v, 'zebre'); assert.ok(!('a9' in kept) && !('a10' in kept) && !('acc' in kept.a1), 'réécrit à neuf au chargement');
        ['genealogie-designs-presets', 'lcnda-designs-ui-v1', 'lcnda-designs-open'].forEach(k => assert.ok(!(k in store), `${k} effacé`));
        assert.equal(attrs['data-lc-motion'], 'aucun'); assert.equal(attrs['data-lc-list'], 'zebre'); assert.ok(!('data-lc-font' in attrs) && !('data-lc-dash' in attrs) && !('data-lc-acc' in attrs));
        // seulement des parties retirées : plus rien du tout
        assert.equal(D.portable({a7: {v: 'lisible'}, a10: {v: 'colonnes'}}), '');
        const s2 = sandbox({'genealogie-designs': JSON.stringify({a7: {v: 'serif'}, a10: {v: 'journal'}})});
        assert.ok(!('genealogie-designs' in s2.store), 'ancien réglage qui ne gardait que A7 / A10 : effacé');
        assert.ok(!Object.keys(s2.attrs).some(k => k.startsWith('data-lc-')));
    });
    await t('enregistré, appliqué, copie pour index.php ; « Comme avant » efface la clé', () => {
        const {D, store, attrs, sheets} = sandbox();
        D.write(D.clean({ver: 2, a1: {v: 'papier'}, a8: {v: 'zebre'}}));
        assert.equal(JSON.parse(store['genealogie-designs']).a1.v, 'papier'); assert.equal(JSON.parse(store['genealogie-designs']).ver, 2); assert.equal(attrs['data-lc-style'], 'papier'); assert.equal(attrs['data-lc-list'], 'zebre');
        assert.equal(sheets['lc-designs-gen'].media, 'all'); assert.equal(sheets['lc-frame-css'].media, 'all');
        assert.equal(JSON.parse(store['lcnda-designs-ui-v2']).a['data-lc-style'], 'papier');
        D.write(D.defaults());
        assert.ok(!('genealogie-designs' in store) && !('lcnda-designs-ui-v2' in store), 'rien de gardé');
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
        const flat = window.LCNDA_EXT.lookFlat(); assert.equal(JSON.parse(flat.a_designs).a2.v, 'compacte'); assert.equal(JSON.parse(flat.a_designs).ver, 2);
        window.LCNDA_EXT.lookFromFlat({a_designs: ''}); assert.ok(!('genealogie-designs' in store));
        window.LCNDA_EXT.lookFromFlat({a_designs: JSON.stringify({a6: {v: 'texte', size: '<x>'}})}); assert.equal(JSON.parse(store['genealogie-designs']).a6.size, 'normale');
        // un ancien réglage enregistré (A7 police, A9 listes, A10) : appliqué sans erreur, A7 / A10 ignorés
        window.LCNDA_EXT.lookFromFlat({a_designs: JSON.stringify({a7: {v: 'serif'}, a9: {v: 'cartes'}, a10: {v: 'journal'}})});
        const g = JSON.parse(store['genealogie-designs']); assert.equal(g.a8.v, 'cartes'); assert.equal(g.a7.v, 'avant');
        window.LCNDA_EXT.lookFromFlat({a_designs: '{abîmé'}); assert.ok(!('genealogie-designs' in store), 'abîmé : comme avant, sans erreur');
    });
    await t('A4 « acte ancien » : la phrase d’état civil', () => {
        const {D} = sandbox();
        const det = {person: {id: 3, first_name: 'Louise', last_name: 'BORIE', gender: 'female'}, events: [{gedcom_tag: 'BIRT', date_text: '9 mars 1922', place_name: 'Tulle', county: 'Corrèze'}, {gedcom_tag: 'DEAT', date_text: '9 décembre 1999', place_name: 'Brive'}], parents: [{first_name: 'Antoine', last_name: 'BORIE'}], partners: [{first_name: 'Jean', last_name: 'MARTIN'}]};
        const s = D.acteText(det, 'tout');
        assert.match(s, /^Née le <b>9 mars 1922<\/b> à <b>Tulle \(Corrèze\)<\/b>, fille de Antoine BORIE, épouse de Jean MARTIN, décédée le <b>9 décembre 1999<\/b> à <b>Brive<\/b>\.$/);
        assert.match(D.acteText({person: {...det.person, first_name: '<img src=x>', gender: 'male'}, events: [], parents: [], partners: []}, 'dates'), /&lt;img/, 'nom échappé');
        assert.doesNotMatch(D.acteText({...det, parents: [{first_name: '<b>x</b>', last_name: 'Y'}]}, 'tout'), /<b>x/, 'parent échappé');
    });

    /* ═════ 2. les fichiers ═════ */
    await t('clés : défaut du site (app.js + api.php), réglages enregistrés de l’Apparence', () => {
        const appKeys = read('assets/js/app.js').match(/const SITE_DEFAULT_KEYS = \[([\s\S]*?)\];/)[1];
        const apiKeys = read('api.php').match(/function site_defaults_allowed_keys\(\): array\s*\{[^\[]*return \[([\s\S]*?)\];/)[1];
        assert.ok(appKeys.includes("'genealogie-designs'"), 'SITE_DEFAULT_KEYS'); assert.ok(apiKeys.includes("'genealogie-designs'"), 'api.php');
        assert.ok(!appKeys.includes("'genealogie-designs-presets'") && !apiKeys.includes("'genealogie-designs-presets'"), 'plus d’ensembles enregistrés à part');
        assert.ok(read('assets/js/heritage-studio.js').match(/const LAYOUT_KEYS = \[([\s\S]*?)\];/)[1].includes("'genealogie-designs'"));
        assert.match(read('assets/js/app.js'), /const \{k7_portraits,k15_colonne,a_designs,\.\.\.rest\}/);
    });
    await t('« 🎨 Designs au choix » juste après « Apparence » (colonne, groupe, réglages gardés tout seuls)', () => {
        assert.match(read('assets/js/app.js'), /\['design','01','Apparence'\],\['designs','01a','Designs au choix'\]/);
        assert.match(read('assets/js/app-maintenance.js'), /\['design', 'designs', 'design_sheets'/); // le Tableau de bord se règle dans le Tableau de bord
        assert.match(read('assets/js/app-pages.js'), /SETTINGS_TABS = \['design', 'designs',/);
    });
    await t('index.php : feuilles, pose au plus tôt, script après app-apparence.js', () => {
        const idx = read('index.php');
        assert.match(idx, /designs-gen\.css\?v=\d+" id="lc-designs-gen" media="not all"/);
        assert.match(idx, /designs\.css\?v=\d+">/);
        assert.match(idx, /localStorage\.getItem\('lcnda-designs-ui-v2'\)/);
        assert.ok(idx.indexOf('lcnda-designs-ui-v2') < idx.indexOf('<body'), 'dans <head>');
        assert.ok(idx.indexOf('src="assets/js/app-apparence.js') < idx.indexOf('src="assets/js/app-designs.js'));
    });
    await t('aucune règle active sans attribut : designs.css, designs-gen.css, apparence-traits.css', () => {
        const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
        const splitTop = sel => { const out = []; let d = 0, cur = ''; for (const ch of sel) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out.filter(Boolean); };
        const selectors = css => { css = strip(css); const out = []; let i = 0; const walk = () => { while (i < css.length) { const j = css.indexOf('{', i), e = css.indexOf('}', i); if (e >= 0 && (j < 0 || e < j)) { i = e + 1; return; } if (j < 0) { i = css.length; return; } const pre = css.slice(i, j).trim(); i = j + 1; if (pre.startsWith('@')) { if (/^@(media|supports)/.test(pre)) walk(); else { let d = 1; while (i < css.length && d) { if (css[i] === '{') d++; else if (css[i] === '}') d--; i++; } } continue; } if (!/^(from|to|\d+%)/.test(pre)) out.push(...splitTop(pre)); const k = css.indexOf('}', i); i = k + 1; } }; walk(); return out; };
        // à part : la page des Réglages (.lcd-*), et les éléments que seul app-designs.js pose (.lc-ic, .lc-dz…)
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
        // CLAUDE.md n'est pas suivi par git : absent d'une copie fraîche
        if (fs.existsSync(path.join(root, 'CLAUDE.md'))) { assert.match(read('CLAUDE.md'), /Designs au choix A1–A8 \(validé\)/); assert.doesNotMatch(read('CLAUDE.md'), /Ensembles prêts » et A1/); }
        assert.match(read('docs/UI.md'), /Designs au choix A1–A8/);
        const faq = read('assets/js/heritage-more.js');
        assert.doesNotMatch(faq, /Qu’est-ce que les « Ensembles prêts » des designs/); assert.doesNotMatch(faq, /A7 Police, A8 Mouvements, A9 Listes, A10/);
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
        await page.addInitScript(() => { try { if (!localStorage.getItem('genealogie-reglages-presentation')) localStorage.setItem('genealogie-reglages-presentation', 'old'); } catch (_) {} }); // ce test vise la page « Apparence » d'avant, en un seul morceau
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
            await page.evaluate(() => localStorage.removeItem('lcnda-designs-open-v2'));
            await toDesigns(page); await page.waitForSelector('.lcd-page .lcd-toc');
            assert.equal(await page.locator('.lcd-toc-i').count(), 2, 'A1 et A7 (A2, A3 et A8 : Menus, colonne et listes)');
            assert.equal(await page.locator('#lcd-ens, [data-lcd-preset], #lcd-a9, #lcd-a10, #lcd-a5, #lcd-a4, #lcd-a6, #lcd-a8, #lcd-a2, #lcd-a3').count(), 0, 'ni ensembles, ni A9, ni A10, ni A5 (cases des arbres : fenêtre des couleurs), ni A4 (Fiches personnes et animaux), ni A6 (Notifications et boutons)');
            assert.equal(await page.locator('[data-lcd-notifs], [data-lcd-fiches], [data-lcd-trees], .lcd-intro').count(), 0, 'plus de cadres bleus d’explication en haut');
            assert.equal(await page.locator('details.lcd-sec[open]').count(), 0, 'tout fermé');
            assert.match(await page.locator('#lcd-a1 > summary').innerText(), /^🎨\s*Style général\s*—\s*Comme avant/);
            await page.click('[data-lcd-go="a1"]');
            await page.waitForSelector('#lcd-a1[open] [data-lcd-v="doux"]');
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lcnda-designs-open-v2'))), ['a1']);
            await toDesigns(page); await page.waitForSelector('#lcd-a1[open]');
            assert.equal(await page.locator('#lcd-a1 .lcd-stage .lcd-frame').count() >= 4, true, 'quatre aperçus');
        });
        await t('A6 Boutons : à la fin de « Notifications et boutons », après les messages ; choisir « Contour » est gardé', async () => {
            await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'look_msgs'; await A.setModule('maintenance'); });
            await page.waitForSelector('#lc-a6-host #lcd-a6-emb [data-lcd-v="contour"]', {timeout: 15000});
            assert.ok(await page.evaluate(() => { const a = document.querySelector('.toast-prefs'), b = document.getElementById('lc-a6-host'); return !!(a && b && a.offsetHeight && b.offsetHeight && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); }), 'visible, après les messages');
            await page.click('#lcd-a6-emb [data-lcd-v="contour"]');
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-designs') || '{}').a6?.v === 'contour');
            await page.evaluate(() => { localStorage.removeItem('genealogie-designs'); window.LCNDA_DESIGNS?.apply?.(); });
            await toDesigns(page); await page.waitForSelector('.lcd-page .lcd-toc');
        });
        await t('choisir « Doux » : gardé tout de suite, titre « — Doux », ↶ Annuler', async () => {
            await page.click('#lcd-a1 [data-lcd-v="doux"]');
            await page.waitForFunction(() => document.documentElement.getAttribute('data-lc-style') === 'doux');
            assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('genealogie-designs'))).a1.v, 'doux');
            assert.match(await page.locator('#lcd-a1 > summary').innerText(), /Style général\s*—\s*Doux/);
            assert.match(await page.locator('#lcd-a1 [data-lcd-saved]').innerText(), /✓ Enregistré/);
            const t1 = page.locator('.toast', {hasText: 'Style général : Doux'}).last(); await t1.waitFor();
            await t1.locator('button', {hasText: 'Annuler'}).click();
            await page.waitForFunction(() => !document.documentElement.hasAttribute('data-lc-style'));
            assert.equal(await page.evaluate(() => localStorage.getItem('genealogie-designs')), null);
        });
        await t('« Réglages en plus » : retouché, Pourquoi ?, ↺ Remettre comme au départ', async () => {
            assert.ok(await page.locator('#lcd-a1 .lcd-why').count() >= 4);
            assert.equal(await page.locator('#lcd-a1 [data-lcd-k="acc"]').count(), 0, 'plus de couleur d’accent');
            await page.selectOption('#lcd-a1 select[data-lcd-k="sh"]', 'aucune');
            await page.waitForFunction(() => document.documentElement.getAttribute('data-lc-sh') === 'aucune');
            await page.waitForSelector('#lcd-a1 .lcd-choice.is-active .lcd-tag.is-mod');
            assert.match(await page.locator('#lcd-a1 > summary').innerText(), /retouché/i);
            await page.click('#lcd-a1 .lcd-foot [data-lcd-reset="a1"]');
            await page.waitForFunction(() => !document.documentElement.hasAttribute('data-lc-style'));
        });
        await t('recoupements : A7 et « Réduire les animations », A5 et les portraits', async () => {
            await setDesigns(page, {ver: 2, a7: {v: 'petit'}});
            const anim = () => page.evaluate(() => { const d = document.createElement('dialog'); d.className = 'modal'; document.body.appendChild(d); d.show(); const a = getComputedStyle(d).animationDuration; d.remove(); return a; });
            assert.notEqual(await anim(), '0s', 'petit mouvement');
            await page.evaluate(() => document.documentElement.classList.add('a11y-calm'));
            assert.match(await anim(), /^(0s|1e-0\d*s|0\.00\d*s)$/, 'Réduire les animations : rien ne bouge');
            await page.evaluate(() => document.documentElement.classList.remove('a11y-calm'));
            // A5 est dans Graphiques → 🎨 Couleurs des stats et des arbres : la couleur des hommes y est celle des portraits (K7)
            await page.evaluate(() => window.LCNDA_APP.openStatsColorsDialog());
            await page.waitForSelector('#stats-colors-dialog[open] #tree-cards-panel [data-tc-v="genre"]');
            await page.click('#tree-cards-panel [data-tc-v="genre"]');
            await page.evaluate(() => { const i = document.querySelector('#stats-colors-dialog [name="gender_male_color"]'); i.value = '#123456'; i.dispatchEvent(new Event('input', {bubbles: true})); });
            await page.click('#stats-colors-dialog button[type="submit"]');
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-portraits') || '{}').m === '#123456');
            assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('genealogie-designs'))).a5.v, 'genre', 'le choix est gardé au même endroit');
            assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-lc-tree')), 'genre');
            assert.equal(await page.evaluate(() => window.LCNDA_PORTRAITS.read().m), '#123456');
            await setDesigns(page, null);
        });
        await t('les vrais écrans : fiche (4 en-têtes), liste, tableau de bord, arbre ; nom piégé échappé', async () => {
            for (const v of ['bandeau', 'acte', 'carte']) {
                await setDesigns(page, {ver: 2, a4: {v}, a3: {v: 'trait'}, a8: {v: 'zebre'}});
                await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; await A.setModule('personnes'); });
                await page.waitForSelector(`.person-hero.lc-hero-${v}`);
                assert.equal(await page.locator('.person-hero h2').count(), 1, 'le nom reste dans la page');
                assert.ok(await page.locator('.lc-ic.is-svg').count() > 0, 'icônes au trait');
                assert.equal(await page.evaluate(() => [...document.querySelectorAll('.lc-ic')].every(x => x.querySelector('.lc-ic-e').textContent.length)), true, 'l’émoji reste dans le texte');
            }
            await setDesigns(page, {a10: {v: 'journal'}, a7: {v: 'serif'}}); // un ancien réglage : le tableau de bord reste comme avant
            await page.evaluate(async () => { await window.LCNDA_APP.setModule('dashboard'); });
            await page.waitForSelector('.dashboard-page'); await page.waitForTimeout(300);
            assert.equal(await page.locator('.lc-journal').count(), 0, 'plus de journal');
            assert.deepEqual(await lcAttrs(page), [], 'rien de posé');
            await setDesigns(page, null);
            await page.waitForFunction(() => !document.querySelector('.lc-ic'));
            assert.equal(await page.evaluate(() => window.__xss), undefined);
        });
        await t('390 px et sombre : la page sans débordement', async () => {
            for (const [w, dark] of [[390, false], [1440, true]]) {
                const p = await open(w);
                if (dark) await p.evaluate(() => { localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); window.LCNDA_APP.applyDesign(); });
                await p.evaluate(() => localStorage.setItem('lcnda-designs-open-v2', '["a1","a7"]'));
                await toDesigns(p); await p.waitForSelector('#lcd-a7[open] .lcd-frame:not(.is-loading)', {timeout: 15000});
                const over = await p.evaluate(() => { const pg = document.querySelector('.lcd-page'), W = document.documentElement.clientWidth; return Math.max(document.getElementById('workspace').scrollWidth - document.getElementById('workspace').clientWidth, ...[...pg.querySelectorAll('*')].filter(e => !e.closest('.lcd-stage')).map(e => Math.round(e.getBoundingClientRect().right - W))); }); // (la barre des onglets du haut défile toute seule)
                const who = over > 1 ? await p.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > W + 1 && r.width > 0 && !e.closest('.lcd-stage') && e.closest('.lcd-page') && ![...e.children].some(c => c.getBoundingClientRect().right > W + 1); }).slice(0, 6).map(e => `${e.tagName}.${[...e.classList].join('.')} ${Math.round(e.getBoundingClientRect().right)}`).join(' | '); }) : '';
                assert.ok(over <= 1, `${w}px : débordement de ${over}px (${who})`);
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
function finish() { console.log(`${failed ? '✗' : '✓'} designs au choix A1–A8 : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
