#!/usr/bin/env node
/* 📐 Rien de collé : dans un cadre (bordure ou fond différent), un texte, un titre, un bouton ou un interrupteur ne touche
 * pas le bord intérieur (au moins 4 px d'écart) et ne déborde pas du cadre.
 * Pages rejouées : Réglages → 🏰 Lieux anciens (GOV), 🌦 Météo, 🗳 Élections, ADN, bases officielles, brevets…, fiche
 * d'une personne, « Tout ce qui le concerne », Listes de données, monographie d'un lieu ; à 1440 px et 390 px, clair et sombre.
 *   node tests/test-rien-de-colle.js
 * Le module exporte aussi le détecteur (detect) et le démarrage (start) pour une chasse plus large (toutes les pages). */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');

/* ═════════ Le détecteur (dans la page) ═════════
 * Pour chaque texte (rectangle de ses lignes), bouton, champ, interrupteur visible : le plus proche ancêtre « encadré »
 * (bordure ≥ 1 px visible, ou fond nettement différent de ce qu'il y a derrière), d'au moins 120 × 28 px. Sur chaque côté
 * encadré, l'écart entre le contenu et le bord intérieur (après la bordure) doit être ≥ min px ; le contenu ne dépasse pas. */
function detect(opts) {
    const MIN = (opts && opts.min) || 4;
    const scope = (opts && opts.root && document.querySelector(opts.root)) || document.body;
    const CS = new Map(); const cs = el => { let s = CS.get(el); if (!s) { s = getComputedStyle(el); CS.set(el, s); } return s; };
    const alpha = c => { if (!c || c === 'transparent') return 0; const m = c.match(/^rgba?\(([^)]+)\)/); if (!m) return 1; const p = m[1].split(/[\s,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) * (p[3].endsWith('%') ? 0.01 : 1) : 1; };
    const rgb = c => (String(c).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const diff = (a, b) => { const x = rgb(a), y = rgb(b); if (x.length < 3 || y.length < 3) return 0; return Math.max(...x.map((v, i) => Math.abs(v - y[i]))); };
    const behind = el => { for (let e = el; e; e = e.parentElement) { const s = cs(e); if (alpha(s.backgroundColor) > 0.5) return s.backgroundColor; if (s.backgroundImage && s.backgroundImage !== 'none') return null; } return 'rgb(255, 255, 255)'; };
    const NOT_FRAME = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|OPTION|LABEL|SUMMARY|svg|SVG|CANVAS|IMG|VIDEO|HTML|BODY|TR|TBODY|THEAD|TFOOT|COLGROUP|UL|OL|LI|SPAN|B|STRONG|EM|I|SMALL|CODE|KBD|MARK|PROGRESS|METER)$/;
    const FR = new Map();
    const frame = el => {
        if (FR.has(el)) return FR.get(el);
        let res = null; const s = cs(el);
        if (!NOT_FRAME.test(el.tagName) && !/^(inline|contents|none|table-row|table-cell)$/.test(s.display) && !el.matches('[role=switch],[role=tab],[role=button],.button,.chip,.badge,.ui-badge,.pk-chip,[class*="toggle"],[class*="switch"],[class*="pill"],[class*="tag"]')) {
            const r = el.getBoundingClientRect();
            if (r.width >= 120 && r.height >= 28) {
                const sides = {};
                for (const [k, K] of [['l', 'Left'], ['r', 'Right'], ['t', 'Top'], ['b', 'Bottom']]) {
                    const w = parseFloat(s[`border${K}Width`]); const st = s[`border${K}Style`];
                    if (w >= 1 && st !== 'none' && st !== 'hidden' && alpha(s[`border${K}Color`]) > 0.2) sides[k] = w;
                }
                if (alpha(s.backgroundColor) > 0.5 && el.parentElement) { const b = behind(el.parentElement); if (b && diff(s.backgroundColor, b) >= 12) { for (const k of 'lrtb') if (!sides[k]) sides[k] = 0.001; } }
                if (Object.keys(sides).length) res = {sides, s};
            }
        }
        FR.set(el, res); return res;
    };
    const clips = s => /(auto|scroll|hidden|clip)/.test(s.overflowX + ' ' + s.overflowY);
    const visible = el => { if (el.checkVisibility && !el.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) return false; return true; };
    const describe = el => { if (!el) return ''; const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.') : ''; return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : ''); };
    const pathOf = el => { const p = []; for (let e = el, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) p.unshift(describe(e)); return p.join(' > '); };
    const items = [];
    // les textes (hors boutons et champs : vérifiés en entier)
    const tw = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {acceptNode: n => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)});
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const pe = n.parentElement; if (!pe || pe.closest('button, select, option, textarea, a.button, [role=button], [role=switch], script, style, svg, noscript, template, [hidden], .sr-only, .visually-hidden, [aria-hidden="true"]')) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        const rs = [...rg.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5); if (!rs.length) continue;
        const r = {left: Math.min(...rs.map(x => x.left)), right: Math.max(...rs.map(x => x.right)), top: Math.min(...rs.map(x => x.top)), bottom: Math.max(...rs.map(x => x.bottom))};
        items.push({el: pe, start: pe, r, kind: 'texte', label: n.nodeValue.trim().slice(0, 40)});
    }
    for (const el of scope.querySelectorAll('button, a.button, input:not([type=hidden]), select, textarea, [role=switch], label:has(> input[type=checkbox]), .ui-switch, .switch')) {
        const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
        items.push({el, start: el.parentElement, r, kind: el.tagName === 'INPUT' && /checkbox|radio/.test(el.type) ? 'case' : /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ? 'champ' : el.matches('[role=switch], label, .ui-switch, .switch') ? 'interrupteur' : 'bouton', label: (el.textContent || el.value || el.getAttribute('aria-label') || el.name || '').trim().slice(0, 40)});
    }
    const out = []; const seen = new Set();
    for (const it of items) {
        if (!visible(it.el)) continue;
        if (it.el.tagName === 'LEGEND' || /^(absolute|fixed)$/.test(cs(it.el).position)) continue; // la légende est posée sur la bordure ; un bouton flottant au coin est voulu
        if (it.el.closest('.leaflet-container, .maplibregl-map, canvas, svg, .ui-toast, .toast, [data-no-glue-check], .CodeMirror, .tox, iframe')) continue;
        // le cadre le plus proche ; un défilement ou une découpe entre les deux : on laisse (tableaux larges, listes qui défilent)
        let c = null, clipped = false;
        for (let e = it.start; e && e !== document.documentElement; e = e.parentElement) {
            const f = frame(e); if (f) { c = {el: e, ...f}; break; }
            if (e !== it.el && clips(cs(e))) { clipped = true; break; }
            if (cs(e).position === 'fixed' || cs(e).position === 'sticky') { clipped = true; break; }
        }
        if (!c || clipped || !scope.contains(c.el) && c.el !== scope) continue;
        if (it.kind === 'case' && it.el.closest('label')) continue; // la case est dans son interrupteur, vérifié comme un tout
        const cr = c.el.getBoundingClientRect(); const s = c.s;
        const inner = {left: cr.left + parseFloat(s.borderLeftWidth), right: cr.right - parseFloat(s.borderRightWidth), top: cr.top + parseFloat(s.borderTopWidth), bottom: cr.bottom - parseFloat(s.borderBottomWidth)};
        const r = it.r;
        // hors du cadre (caché par un pli, une autre colonne) : ignoré
        if (r.right < inner.left - 40 || r.left > inner.right + 40 || r.bottom < inner.top - 40 || r.top > inner.bottom + 40) continue;
        const gaps = {l: r.left - inner.left, r: inner.right - r.right, t: r.top - inner.top, b: inner.bottom - r.bottom};
        const bad = [];
        for (const k of 'lrtb') {
            const g = gaps[k];
            if (g < -2.5 && !clips(s)) bad.push({side: k, gap: Math.round(g * 10) / 10, kind: 'deborde'});
            else if (c.sides[k] && g < MIN - 0.01 && g >= -2.5) bad.push({side: k, gap: Math.round(g * 10) / 10, kind: 'colle'});
        }
        // un bouton ou un champ qui remplit son cadre d'un bord à l'autre (onglets côte à côte, en-tête cliquable, champ d'une
        // boîte de recherche) : c'est voulu, ce n'est pas un contenu collé
        // un cadre qui défile lui-même (tableau large) : ce qui passe sous son bord en défilant n'est pas collé
        const scrollsX = /(auto|scroll)/.test(s.overflowX) && c.el.scrollWidth > c.el.clientWidth + 1, scrollsY = /(auto|scroll)/.test(s.overflowY) && c.el.scrollHeight > c.el.clientHeight + 1;
        for (let i = bad.length - 1; i >= 0; i--) if ((scrollsX && /[lr]/.test(bad[i].side)) || (scrollsY && /[tb]/.test(bad[i].side))) bad.splice(i, 1);
        // des boutons côte à côte qui forment le cadre (onglets, choix « Court / Normal / Détaillé ») : voulu
        if (it.kind !== 'texte' && it.el.parentElement === c.el && [...c.el.children].every(x => x.matches('button, a, input, label, [role=tab], [role=button]'))) { for (let i = bad.length - 1; i >= 0; i--) if (bad[i].kind === 'colle') bad.splice(i, 1); }
        const glued = new Set(bad.filter(b => b.kind === 'colle').map(b => b.side));
        if (it.kind !== 'texte' && ((glued.has('l') && glued.has('r')) || (glued.has('t') && glued.has('b')))) { for (let i = bad.length - 1; i >= 0; i--) if (bad[i].kind === 'colle') bad.splice(i, 1); }
        if (!bad.length) continue;
        const key = pathOf(c.el) + ' | ' + describe(it.el) + ' | ' + bad.map(b => b.kind + b.side).join(',');
        if (seen.has(key)) continue; seen.add(key);
        const mark = 'g' + out.length;
        it.el.setAttribute('data-glue-item', mark); c.el.setAttribute('data-glue-box', (c.el.getAttribute('data-glue-box') || '') + ' ' + mark);
        out.push({mark, key, kind: it.kind, label: it.label, item: describe(it.el), box: pathOf(c.el), bad, boxRect: {x: cr.left + scrollX, y: cr.top + scrollY, w: cr.width, h: cr.height}});
    }
    return out;
}

/* ═════════ Démarrage : une base temporaire (familles MAZAUD, LACOMBE, DURAND), le serveur, le navigateur ═════════ */
async function start() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-colle-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $county, $lat, $lon) use ($pdo) { $pdo->prepare("INSERT INTO places(name, county, country, latitude, longitude) VALUES(?, ?, 'France', ?, ?)")->execute([$name, $county, $lat, $lon]); return (int) $pdo->lastInsertId(); };
$tulle = $pl('Tulle', 'Corrèze', 45.267, 1.770); $paris = $pl('Paris', 'Paris', 48.857, 2.352);
$per = function ($f, $l, $g, $evs = []) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as $e) { [$t, $d, $p] = $e; $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag($t), (int) substr($d, -4), $d, $p]); } return $id; };
$fam = function ($a, $b, $kids) use ($pdo) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $pdo->lastInsertId(); foreach ($kids as $i => $k) { $pdo->prepare('INSERT INTO family_children(family_id, child_id, position) VALUES(?,?,?)')->execute([$f, $k, $i]); } return $f; };
$I = ['tulle' => $tulle, 'paris' => $paris];
$I['louis'] = $per('Louis', 'MAZAUD', 'male', [['BIRT', '1890', $tulle], ['DEAT', '1960', $tulle]]);
$I['anne'] = $per('Anne', 'LACOMBE', 'female', [['BIRT', '1895', $tulle]]);
$I['henri'] = $per('Henri', 'DURAND', 'male', [['BIRT', '1888', $paris]]);
$I['rose'] = $per('Rose', 'DURAND', 'female', [['BIRT', '1892', $paris]]);
$I['pierre'] = $per('Pierre', 'MAZAUD', 'male', [['BIRT', '1920', $tulle], ['OCCU', '1945', $tulle]]);
$I['marie'] = $per('Marie', 'DURAND', 'female', [['BIRT', '1925', $paris]]);
$I['jean'] = $per('Jean', 'MAZAUD', 'male', [['BIRT', '12/03/1950', $tulle], ['RESI', '1975', $paris]]);
$I['sophie'] = $per('Sophie', 'LACOMBE', 'female', [['BIRT', '1955', $paris]]);
$pdo->exec('UPDATE persons SET is_start=1 WHERE id=' . $I['jean']);
$fam($I['louis'], $I['anne'], [$I['pierre']]);
$fam($I['henri'], $I['rose'], [$I['marie']]);
$f = $fam($I['pierre'], $I['marie'], [$I['jean']]);
$pdo->prepare("INSERT INTO events(scope, family_id, event_type_id, year, date_text, place_id) VALUES('family',?,?,1948,'5 juin 1948',?)")->execute([$f, $tag('MARR'), $tulle]);
$pdo->exec("INSERT INTO sources(title) VALUES('Registre de Tulle')");
echo json_encode($I);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/jean/.test(seed.stdout)) throw new Error(seed.stderr || seed.stdout);
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 300; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await chromium.launch();
    const stop = async () => { await browser.close().catch(() => {}); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); };
    return {ID, base, browser, stop};
}

/* une page prête : rien ne se charge plus et l'écran ne bouge plus pendant 300 ms (signal, pas de délai fixe) */
async function settle(p, max = 15000) {
    await p.evaluate(async max => {
        const t0 = performance.now();
        await new Promise(res => {
            let last = performance.now();
            const mo = new MutationObserver(() => { last = performance.now(); });
            mo.observe(document.body, {subtree: true, childList: true, characterData: true});
            const tick = () => {
                const busy = (window.__glueFetches || 0) > 0 || document.querySelector('.is-loading, [aria-busy="true"], .loading-state');
                if ((!busy && performance.now() - last > 300) || performance.now() - t0 > max) { mo.disconnect(); res(); } else setTimeout(tick, 50);
            };
            setTimeout(tick, 50);
        });
    }, max);
}
/* compte les requêtes en cours (pour settle) */
const trackFetches = `(() => { if (window.__glueTrack) return; window.__glueTrack = 1; window.__glueFetches = 0; const f = window.fetch; window.fetch = function (...a) { window.__glueFetches++; return f.apply(this, a).finally(() => { window.__glueFetches--; }); }; })();`;

async function newPage(browser, base, {width = 1440, dark = false} = {}) {
    const ctx = await browser.newContext({viewport: {width, height: 900}});
    await ctx.addInitScript(trackFetches);
    await ctx.addInitScript(dark => { try { localStorage.setItem('genealogie-premier-vu', '1'); if (dark) { const cur = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); localStorage.setItem('genealogie-design', JSON.stringify({...cur, preset: 'dark'})); } } catch (_) {} }, dark);
    await ctx.route(u => !u.toString().startsWith(base), rt => rt.abort());
    const p = await ctx.newPage();
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
    await p.goto(base + '#dashboard');
    await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP.defaultMaintenanceTabs, null, {timeout: 60000});
    if (dark) await p.evaluate(() => window.LCNDA_APP.applyDesign?.());
    await settle(p);
    return p;
}

const closeDialogs = p => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch (_) {} }); document.querySelectorAll('.modal-backdrop, .ui-modal').forEach(d => d.remove?.()); });

/* les écrans : un nom, et comment y aller ; root = la partie de l'écran à vérifier */
const go = {
    module: (m) => async p => { await closeDialogs(p); await p.evaluate(m => window.LCNDA_APP.setModule(m), m); await settle(p); return '#workspace'; },
    settings: (tab) => async p => { await closeDialogs(p); await p.evaluate(async t => { const A = window.LCNDA_APP; A.state.maintenanceTab = t; await A.setModule('maintenance'); }, tab); await settle(p); return '#workspace'; },
    person: (id) => async p => { await closeDialogs(p); await p.evaluate(i => window.LCNDA_APP.openPersonById(i), id); await p.waitForFunction(i => window.LCNDA_APP.state.currentPerson?.person?.id === i && document.querySelector('.person-page h2'), id, {timeout: 30000}); await settle(p); return '#workspace'; },
    toutSur: (id) => async p => { await closeDialogs(p); await p.evaluate(i => window.LCNDA_EXT.toutSur.open({person: i}), id); await p.waitForSelector('dialog[open]', {timeout: 20000}); await settle(p); return 'dialog[open]'; },
    monographie: (id) => async p => { await closeDialogs(p); await p.evaluate(id => { const A = window.LCNDA_APP; A.state.graphPlaceMonograph = {...(A.state.graphPlaceMonograph || {}), id, name: 'Tulle', county: 'Corrèze', showEvents: true, showDigests: true, showBattues: true, showCemetery: true}; A.state.graphMode = 'place_monograph'; A.setModule('graphiques'); }, id); await settle(p); return '#workspace'; },
    liste: (key) => async p => { await closeDialogs(p); await p.evaluate(k => { const A = window.LCNDA_APP; A.state.listType = k; A.setModule('listes'); }, key); await settle(p); return '#workspace'; },
};

async function scan(p, rootSel) { return p.evaluate(detect, {root: rootSel, min: 4}); }

module.exports = {detect, start, settle, newPage, go, scan, closeDialogs};

/* ═════════ Le test ═════════ */
if (require.main === module) (async () => {
    let fails = 0;
    const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 14).join('\n  ')); } };
    const {ID, base, browser, stop} = await start();
    try {
        const pages = [
            ['Réglages → 🏰 Lieux anciens (GOV)', go.settings('gov')],
            ['Réglages → 🌦 Météo d’autrefois', go.settings('meteo')],
            ['Réglages → 🗳 Élections', go.settings('elections')],
            ['Réglages → 🏛 Actes en ligne aux archives', go.settings('archives_dispo')],
            ['Réglages → 🩺 Santé de la famille', go.settings('sante')],
            ['Réglages → 🔄 Mises à jour', go.settings('mises_a_jour')],
            ['Réglages → Thème et couleurs', go.settings('look_theme')],
            ['Réglages → ✅ Contrôle de la base', go.settings('controle')],
            ['Fiche de Jean MAZAUD', go.person(ID.jean)],
            ['« Tout ce qui le concerne » (Jean MAZAUD)', go.toutSur(ID.jean)],
            ['Monographie de Tulle', go.monographie(ID.tulle)],
            ['Listes', go.module('listes')],
            ['Tableau de bord', go.module('dashboard')],
        ];
        const extra = await (async () => { const p = await newPage(browser, base); const r = await p.evaluate(() => ({tabs: window.LCNDA_APP.defaultMaintenanceTabs.map(t => t[0]), data: (window.LCNDA_APP.defaultListTypes || []).map(t => t[0]).find(k => /^data_/.test(k)) || ''})); await p.context().close(); return r; })();
        // les pages de données ajoutées par les lots (prénoms, terre-mots, lot8, lot9, lot10…) quand elles sont là
        for (const k of ['histoire', 'bases_officielles', 'brevets_annuaires', 'insee_deces', 'adn_livres', 'wikidata_autour', 'terre_mots', 'lot8_monde_village', 'lot9_sons_enfance', 'lot10_voir_village', 'lieux_patrimoine', 'event_types', 'raccourcis', 'calendar_measures']) if (extra.tabs.includes(k)) pages.push([`Réglages → ${k}`, go.settings(k)]);
        if (extra.data) pages.push([`Listes de données → ${extra.data}`, go.liste(extra.data)]);
        await t('le détecteur voit bien un texte collé, un bouton qui touche le bord et un champ qui déborde (témoin)', async () => {
            const p = await newPage(browser, base);
            await go.settings('gov')(p);
            const pad = await p.evaluate(() => [...document.querySelectorAll('.gov-set > .card')].map(c => parseFloat(getComputedStyle(c).paddingLeft)));
            assert.ok(pad.length === 2 && pad.every(x => x >= 12), 'les cadres GOV ont leur marge intérieure : ' + pad);
            const found = await p.evaluate(detect_ => { const box = document.createElement('div'); box.id = 'glue-temoin'; box.style.cssText = 'border:2px solid #000;padding:0;width:320px;margin:20px'; box.innerHTML = '<h3 style="margin:0">Titre collé</h3><button type="button">Bouton</button><div style="padding:10px"><input style="width:400px"></div>'; document.querySelector('#workspace').prepend(box); const r = (0, eval)('(' + detect_ + ')')({root: '#glue-temoin'}); box.remove(); return r; }, detect.toString());
            assert.ok(found.some(f => f.kind === 'texte' && f.label === 'Titre collé'), JSON.stringify(found));
            assert.ok(found.some(f => f.kind === 'bouton'), JSON.stringify(found));
            assert.ok(found.some(f => f.kind === 'champ' && f.bad.some(b => b.kind === 'deborde')), JSON.stringify(found));
            await p.context().close();
        });
        for (const [w, dark] of [[1440, false], [390, false], [1440, true], [390, true]]) {
            const p = await newPage(browser, base, {width: w, dark});
            for (const [name, fn] of pages) {
                await t(`${name} — ${w} px${dark ? ', sombre' : ''} : rien de collé au bord d’un cadre, rien qui déborde`, async () => {
                    const rootSel = await fn(p);
                    const found = await scan(p, rootSel);
                    assert.deepStrictEqual(found.map(f => `${f.bad.map(b => `${b.kind} ${b.side} ${b.gap}px`).join(', ')} — ${f.kind} « ${f.label} » (${f.item}) dans ${f.box}`), []);
                });
            }
            assert.deepStrictEqual(p.errs, []);
            await p.context().close();
        }
    } finally { await stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
