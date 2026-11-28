#!/usr/bin/env node
/* 📐 Rien de collé : dans un cadre (bordure ou fond différent), un texte, un titre, un bouton ou un interrupteur ne touche
 * pas le bord intérieur (au moins 4 px d'écart) et ne déborde pas du cadre.
 * Pages rejouées : Réglages → 🏰 Lieux anciens (GOV), 🌦 Météo, 🗳 Élections, ADN, bases officielles, brevets…, fiche
 * d'une personne, « Tout ce qui le concerne », Listes de données, monographie d'un lieu, 📥 « Prendre depuis… », 📍 « Mettre dans… »,
 * 🧺 le panier en grand, 📎 « Insérer une info », 🧺 l'onglet Paniers (un panier, la recherche) ; à 1440 px et 390 px, clair et sombre.
 * La colonne de gauche (sideDetect), sur plusieurs onglets (Recherche, Listes, Réglages, Graphiques, Carte) : au moins 12 px entre
 * les cartes (ombre comprise) et la barre de défilement (place gardée : scrollbar-gutter), la dernière carte entière au-dessus du pied
 * (12 px), le pied et sa phrase grise (8 px sous les boutons, 12 px du bord), les textes alignés qu'ils aient une icône ou non
 * (icône dans sa colonne, 8 px avant le texte).
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

/* ═════════ La colonne de gauche (dans la page) : l'espacement réglementaire ═════════ */
function sideDetect() {
    const out = [], box = document.querySelector('#sidebar-content'); if (!box || !box.offsetParent) return ['pas de colonne'];
    const cs = getComputedStyle(box), br = box.getBoundingClientRect();
    if (box.scrollHeight > box.clientHeight + 1 && !/stable/.test(cs.scrollbarGutter)) out.push(`scrollbar-gutter : ${cs.scrollbarGutter} (la place de la barre n'est pas gardée)`);
    // le bord gauche de la barre : à droite de la zone utile ; une barre « par-dessus » (sans place) : 12 px comptés en plus
    const overlay = box.offsetWidth - box.clientWidth - box.clientLeft * 2 < 1;
    const barLeft = br.left + box.clientLeft + box.clientWidth - (overlay ? 12 : 0);
    const shadow = el => { const m = getComputedStyle(el).boxShadow; if (!m || m === 'none') return [0, 0]; const px = (m.match(/-?[\d.]+px/g) || []).map(parseFloat); return [Math.max(0, px[0] || 0), Math.max(0, px[1] || 0)]; };
    const cards = [...box.querySelectorAll('.side-menu-item, .saved-item, .person-list-item, .h-fi-sitem')].filter(el => el.offsetParent && el.getBoundingClientRect().width > 40);
    for (const el of cards) {
        const r = el.getBoundingClientRect(), [sx] = shadow(el), gap = barLeft - (r.right + sx);
        if (gap < 12 - 0.5) { out.push(`carte « ${el.textContent.trim().slice(0, 30)} » : ${Math.round(gap * 10) / 10} px avant la barre de défilement (12 attendus)`); break; }
    }
    // entre deux cartes l'une sous l'autre : au moins 4 px de vide, ombre de la carte du haut comprise (la carte choisie a 4 px d'ombre)
    for (let i = 1; i < cards.length; i++) {
        const a = cards[i - 1].getBoundingClientRect(), b = cards[i].getBoundingClientRect(), [, sy] = shadow(cards[i - 1]);
        if (b.top < a.bottom - 1 || Math.abs(a.left - b.left) > a.width / 2) continue; // côte à côte ou pas dans la même pile
        if (b.top - (a.bottom + sy) < 4 - 0.5) { out.push(`cartes « ${cards[i - 1].textContent.trim().slice(0, 20)} » et « ${cards[i].textContent.trim().slice(0, 20)} » : ${Math.round((b.top - a.bottom - sy) * 10) / 10} px entre elles, ombre comprise (4 attendus)`); break; }
    }
    // la dernière carte : entière au-dessus du pied, ombre comprise, avec 12 px
    if (cards.length) {
        const keep = box.scrollTop; box.scrollTop = box.scrollHeight;
        const last = cards[cards.length - 1], r = last.getBoundingClientRect(), [, sy] = shadow(last), bottom = br.top + box.clientTop + box.clientHeight;
        const vis = [...box.children].filter(x => x.offsetParent && x.getBoundingClientRect().height > 0), lowest = Math.max(...vis.map(x => x.getBoundingClientRect().bottom));
        if (lowest <= r.bottom + 1 && bottom - (r.bottom + sy) < 12 - 0.5) out.push(`la dernière carte « ${last.textContent.trim().slice(0, 30)} » : ${Math.round((bottom - r.bottom - sy) * 10) / 10} px au-dessus du pied (12 attendus)`);
        box.scrollTop = keep;
    }
    // les textes alignés : une icône → toutes les cartes ont leur colonne d'icône, et le texte commence au même endroit
    const items = cards.filter(el => el.classList.contains('side-menu-item') && el.querySelector(':scope > .side-number'));
    const ICO = /^\s*(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/u;
    const withIco = items.filter(el => el.querySelector(':scope > .side-ico:not(:empty)') || [...el.childNodes].some(n => n.nodeType === 3 && ICO.test(n.nodeValue)));
    if (withIco.length) {
        const lefts = [];
        for (const el of items) {
            const ico = el.querySelector(':scope > .side-ico'), lab = el.querySelector(':scope > .side-label');
            if (!ico || !lab) { out.push(`carte « ${el.textContent.trim().slice(0, 30)} » : l'icône n'est pas dans sa colonne`); continue; }
            const g = lab.getBoundingClientRect().left - ico.getBoundingClientRect().right;
            if (Math.abs(g - 8) > 1.5) out.push(`carte « ${el.textContent.trim().slice(0, 30)} » : ${Math.round(g * 10) / 10} px entre l'icône et le texte (8 attendus)`);
            lefts.push([lab.getBoundingClientRect().left - el.getBoundingClientRect().left, el.textContent.trim().slice(0, 30)]);
        }
        const min = Math.min(...lefts.map(x => x[0])), max = Math.max(...lefts.map(x => x[0]));
        if (lefts.length && max - min > 1.5) out.push(`les textes ne commencent pas au même endroit : de ${Math.round(min)} à ${Math.round(max)} px (« ${lefts.find(x => x[0] === max)[1]} »)`);
    }
    // le pied : ses marges, et la phrase grise sous les boutons
    const foot = document.querySelector('#sidebar-footer');
    if (foot && foot.offsetParent && foot.getBoundingClientRect().height > 4) {
        const fr = foot.getBoundingClientRect(), fs = getComputedStyle(foot);
        if (parseFloat(fs.paddingLeft) < 12 || parseFloat(fs.paddingRight) < 12 || parseFloat(fs.paddingTop) < 8 || parseFloat(fs.paddingBottom) < 8) out.push(`pied : marges ${fs.padding} (12 px sur les côtés, 8 en haut et en bas au moins)`);
        const kids = [...foot.children].filter(x => x.getBoundingClientRect().height > 0 && getComputedStyle(x).display !== 'none');
        for (let i = 1; i < kids.length; i++) {
            const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect();
            if (b.top < a.top + a.height / 2) continue; // côte à côte, sur la même rangée
            if (b.top - a.bottom < 8 - 0.5) out.push(`pied : « ${kids[i].textContent.trim().slice(0, 30)} » à ${Math.round((b.top - a.bottom) * 10) / 10} px sous « ${kids[i - 1].textContent.trim().slice(0, 20)} » (8 attendus)`);
        }
        for (const k of kids) { const r = k.getBoundingClientRect(); if (r.left - fr.left < 12 - 0.5) out.push(`pied : « ${k.textContent.trim().slice(0, 30)} » à ${Math.round(r.left - fr.left)} px du bord gauche (12 attendus)`); }
    }
    return out;
}
const sideTabs = ['recherche', 'listes', 'maintenance', 'graphiques', 'carte', 'fiches'];


module.exports = {detect, sideDetect, start, settle, newPage, go, scan, closeDialogs};

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
        // 📥 « Prendre depuis… », 📍 « Mettre dans… », 🧺 le panier en grand, 📎 « Insérer une info » (heritage-connexions.js, app-inserer.js)
        const cxClose = p => p.evaluate(() => window.LCNDA_EXT.insertInfo?.close?.());
        pages.push(['📥 Prendre depuis… (Événements)', async p => { await cxClose(p); await closeDialogs(p); await p.evaluate(() => window.LCNDA_EXT.connexions.openTake({tab: 'event'})); await p.waitForSelector('dialog.cx-take [data-cx-res] .cx-rlist li, dialog.cx-take .cx-empty', {timeout: 20000}); await settle(p); return 'dialog.cx-take'; }]);
        pages.push(['📥 Prendre depuis… (De l’extérieur)', async p => { await cxClose(p); await closeDialogs(p); await p.evaluate(() => window.LCNDA_EXT.connexions.openTake({tab: 'outside'})); await p.waitForSelector('dialog.cx-take .cx-card'); await settle(p); return 'dialog.cx-take'; }]);
        pages.push(['📍 Mettre dans…', async p => { await cxClose(p); await closeDialogs(p); await p.evaluate(() => window.LCNDA_EXT.connexions.putInto([{kind: 'datum', title: 'Naissance — date', value: '3 février 1978'}])); await p.waitForSelector('dialog.cx-put .cx-dest'); await settle(p); return 'dialog.cx-put'; }]);
        pages.push(['🧺 Le panier en grand', async p => { await cxClose(p); await closeDialogs(p); await p.evaluate(() => window.LCNDA_EXT.connexions.openBasketView()); await p.waitForSelector('dialog.cx-bview .cx-put-body'); await settle(p); return 'dialog.cx-bview'; }]);
        pages.push(['📎 Insérer une info', async p => { await cxClose(p); await closeDialogs(p); await p.evaluate(() => { window.LCNDA_EXT.openDialog({title: 'Essai', body: '<textarea name="t" rows="4" style="width:100%"></textarea>', submitLabel: 'OK', onSubmit: () => true}); }); await p.waitForSelector('dialog[open] textarea[name="t"]');
            await p.evaluate(() => window.LCNDA_EXT.insertInfo.open(document.querySelector('dialog[open] textarea[name="t"]'))); await p.waitForSelector('.cx-qi .cx-qi-r'); await settle(p); return '.cx-qi'; }]);
        // 🧺 l'onglet Paniers (app-paniers.js) : le panier ouvert, puis la recherche qui crée un panier
        const pnOpen = async p => { await cxClose(p); await closeDialogs(p);
            await p.evaluate(async () => { const A = window.LCNDA_APP, w = (op, b) => A.api('cx_write', {}, {method: 'POST', body: {op, ...b}}).then(r => r?.result ?? r);
                const t = await A.api('cx_basket', {all: 1}); if (!t.baskets.some(b => b.name === 'Témoins du mariage')) { const f = await w('folder_new', {name: 'Famille MAZAUD', basket_name: 'Témoins du mariage'});
                    await w('basket_add', {basket_id: f.basket_id, items: [{kind: 'datum', title: 'Date du mariage', value: '8 février 1813'}, {kind: 'row', title: 'Prix du blé à Limoges, 1826', value: 'liste « Prix et mesures »', origin: {kind: 'list', label: 'Wikipédia', url: 'https://fr.wikipedia.org/'}}]});
                    await w('pn_meta', {basket_id: f.basket_id, labels: [['famille', '#1a7f37']], due: '2026-12-15', remind: true, pinned: true}); localStorage.setItem('genealogie-paniers-ouvert', JSON.stringify({t: 'b', id: f.basket_id})); }
                await A.setModule('paniers'); }); // (l'onglet s'ouvre sans être montré dans le menu : « ⛶ en grand » garde sa fenêtre)
            await p.waitForSelector('[data-pn] .pn-it', {timeout: 20000}); await settle(p); return '[data-pn]'; };
        // 📊 les écrans des données (app-donnees-accueil.js, app-donnees-plus*.js, heritage-guerres-temps.js) : tous allumés (Réglages → 📊 Données)
        const dpAll = p => p.evaluate(() => { try { const v = JSON.parse(localStorage.getItem('genealogie-donnees-plus') || '{}') || {}; v.on = Object.fromEntries(Array.from({length: 21}, (_, i) => [i + 1, true])); localStorage.setItem('genealogie-donnees-plus', JSON.stringify(v)); } catch (_) {} window.LCNDA_EXT.donneesPlus?.resetCache?.(); });
        const recap = async p => { await cxClose(p); await closeDialogs(p); await dpAll(p); await p.evaluate(() => { const H = window.LCNDA_EXT.dataHome._st; H.view = 'recap'; H.q = ''; H.res = null; const A = window.LCNDA_APP; A.state.listType = 'donnees'; A.setModule('listes'); });
            await p.waitForSelector('[data-dr] [data-dr-body] .dr-trs', {timeout: 30000}); await settle(p); return '#workspace'; };
        const dpDlg = (fn, sel) => async p => { await cxClose(p); await closeDialogs(p); await dpAll(p); await p.evaluate(fn, ID); await p.waitForSelector(sel, {timeout: 30000}); await settle(p); return 'dialog[open]'; };
        pages.push(['📊 Récap des données', recap]);
        pages.push(['📊 ⚙ Organiser le récap', async p => { await recap(p); await p.click('[data-dp-org]'); await p.waitForSelector('.dp-org-dlg [data-dp-row]'); await settle(p); return 'dialog[open]'; }]);
        pages.push(['Réglages → 📊 Données', async p => { await dpAll(p); return go.settings('donnees_plus')(p); }]);
        pages.push(['📜 Crédits et licences', dpDlg(() => window.LCNDA_EXT.donneesPlusOutils.credits(), 'dialog[open] [data-dp-credt]')]);
        pages.push(['⚖️ Comparer', dpDlg(() => window.LCNDA_EXT.donneesPlusOutils.compare(), 'dialog[open] [data-dp-c="0"] input')]);
        pages.push(['🗺 Tout autour d’un lieu', dpDlg(() => window.LCNDA_EXT.donneesPlusOutils.around(), 'dialog[open] [data-dp-ap] input')]);
        pages.push(['📄 Livret (aperçu)', dpDlg(I => window.LCNDA_EXT.donneesPlusOutils.booklet(I.jean), 'dialog[open] [data-dp-bprint]')]);
        pages.push(['⚔️ Batailles ▶ Dans le temps', async p => { await cxClose(p); await closeDialogs(p); await go.liste('data_ha_batailles')(p);
            if (await p.$('[data-ld-page="ha_batailles"] [data-gt-on]')) { if (await p.getAttribute('[data-gt-on]', 'aria-pressed') !== 'true') await p.click('[data-gt-on]'); await p.waitForSelector('[data-gt-stage] canvas', {timeout: 60000}); await settle(p); }
            return '#workspace'; }]);
        pages.push(['🧺 L’onglet Paniers (un panier ouvert)', pnOpen]);
        pages.push(['🧺 L’onglet Paniers (la recherche qui crée un panier)', async p => { await pnOpen(p); await p.click('[data-pn-a="search"]'); await p.fill('[data-pn-q]', 'les naissances de la famille MAZAUD à Tulle entre 1780 et 1800'); await p.keyboard.press('Enter');
            await p.waitForSelector('[data-pn] .pn-und', {timeout: 30000}); await settle(p); return '[data-pn]'; }]);
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
        await t('le détecteur de la colonne voit une carte collée à la barre, une phrase collée sous les boutons et des textes décalés (témoin)', async () => {
            const p = await newPage(browser, base);
            await go.module('recherche')(p);
            const found = await p.evaluate(src => {
                const box = document.querySelector('#sidebar-content'), foot = document.querySelector('#sidebar-footer');
                box.style.setProperty('padding-right', '2px', 'important'); box.style.setProperty('scrollbar-gutter', 'auto', 'important');
                foot.insertAdjacentHTML('beforeend', '<small data-temoin style="display:block;margin-top:0!important">Phrase collée</small>');
                const it = box.querySelector('.side-menu-item .side-ico:not(:empty)')?.parentElement; it?.querySelector('.side-ico')?.style.setProperty('margin-right', '6px');
                const r = (0, eval)('(' + src + ')')();
                box.style.removeProperty('padding-right'); box.style.removeProperty('scrollbar-gutter'); foot.querySelector('[data-temoin]').remove(); it?.querySelector('.side-ico')?.style.removeProperty('margin-right');
                return r;
            }, sideDetect.toString());
            assert.ok(found.some(f => /avant la barre de défilement/.test(f)), JSON.stringify(found));
            assert.ok(found.some(f => /Phrase collée/.test(f)), JSON.stringify(found));
            assert.ok(found.some(f => /entre l'icône et le texte|pas au même endroit/.test(f)), JSON.stringify(found));
            assert.deepStrictEqual(await p.evaluate(sideDetect), [], 'remis en place : plus rien');
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
            for (const m of sideTabs) {
                await t(`colonne de gauche (${m}) — ${w} px${dark ? ', sombre' : ''} : 12 px avant la barre de défilement, dernière carte au-dessus du pied, pied espacé, textes alignés`, async () => {
                    await go.module(m)(p);
                    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
                    assert.deepStrictEqual(await p.evaluate(sideDetect), []);
                });
            }
            assert.deepStrictEqual(p.errs, []);
            await p.context().close();
        }
    } finally { await stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
