#!/usr/bin/env node
/* 🧭 Toutes les actions que l'écran appelle arrivent-elles à LEUR route dans api.php ?
 *  Le bogue d'origine : une route large `str_starts_with($action, 'ld_')` (📍 Lieux en double, lib/lieux_doublons.php) avalait aussi
 *  ld_status, ld_query, ld_facet, ld_famille (📊 listes de données, lib/listes_donnees.php) → « Action inconnue », lu par l'écran comme
 *  « pas encore sur cet ordinateur ». Une route par préfixe peut toujours en capturer une autre (rt_, ro_, aia_, sd_, dplus_, lieux_…).
 *  Ce garde-fou :
 *   1. lit assets/js/*.js et en sort TOUS les noms d'action (api('x'), post('x'), A().api('x', …), api.php?action=x, les petites
 *      fonctions maison qui passent leur 1er argument à .api(…), et les `${f.pre}_dl_start` des familles de app-listes-maj.js) ;
 *   2. les appelle une à une sur une base d'essai vide (GET, ou POST avec le jeton CSRF), sans charge utile ou presque ;
 *   3. aucune ne doit répondre « Action inconnue » (une erreur 4xx sur une donnée manquante, c'est normal : la route est la bonne).
 *      Avec une sous-action lue dans le JS ({op: 'save'}, {what: 'heat'}) : chacune est appelée, et ne doit pas répondre « Demande / Opération inconnue » ;
 *   4. sans rien appeler : aucune route par préfixe d'api.php (placée avant les grands match ($action)) ne couvre une action traitée plus bas.
 *  Rien n'est téléchargé : toutes les sources « d'essai » pointent vers un dossier vide, Ollama et le « GitHub » des données vers un port fermé.
 *   node tests/test-routes-api.js   (LCNDA_ROUTES_VERBOSE=1 : la réponse de chaque action ; LCNDA_ROUTES_LIST=1 : seulement la liste lue dans le JS ;
 *                                    LCNDA_ROUTES_WHY=nom : où le JS appelle cette action) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
const JS = path.join(root, 'assets', 'js');

/* Les actions appelées par l'écran mais qu'api.php n'a pas, et c'est voulu. Chaque entrée dit pourquoi. */
const ALLOW = {
    // la famille « 🌐 Traduction » (heritage-telech-d-traduire.js) entre dans Réglages → 🗂 Données avec removable: () => false :
    // le 🗑 générique (`${f.pre}_pack_remove`, puis ↶ `${f.pre}_pack_restore`, app-listes-maj.js) n'est jamais montré pour elle
    // (on retire une langue avec td_tr_pack_undo, le moteur avec td_tr_uninstall)
    td_tr_pack_remove: 'td_tr : removable () => false, jamais appelée',
    td_tr_pack_restore: 'td_tr : removable () => false, jamais appelée',
};
/* Les sous-actions qui répondent « Demande inconnue » à une charge vide (le message parle alors d'une donnée manquante), et pourquoi. */
const ALLOW_OP = {
    'access_note {"what":"map_export"}': 'lib/verrou.php : « Demande inconnue » tant que la sorte de carte et le format (kind, format) manquent',
};
/* Les actions à NE PAS appeler ici (effet de bord qui casserait la suite de l'essai), et pourquoi. Leur route est quand même vérifiée
 * statiquement : elle doit être nommée telle quelle dans api.php ou dans un fichier lib/. */
const SKIP = {
    genealogy_remove: 'met la généalogie de côté', genealogy_switch: 'change de généalogie pour la suite', genealogy_create: 'crée une généalogie et y bascule',
    kiosk_enter: 'passe en mode consultation : plus aucune écriture ensuite', kiosk_set: 'idem', glock_set: 'pose un mot de passe : plus rien ne se lit ensuite',
    premier_start: 'réinitialise la première fois', premier_example_open: 'ouvre l’exemple (change de base)', premier_example_build: 'construit l’exemple (long)', premier_example_leave: 'quitte l’exemple',
    restore_backup: 'remplace la base', delete_database: 'efface une base', switch_database: 'change de base pour la suite', import_package: 'remplace la base', reset_database: 'vide la base', delete_all: 'vide la base',
};

/* ═════════ 1. les noms d'action, lus dans le JS ═════════ */
const NAME = /^[a-z][a-z0-9_]*$/;
/** la fin de l'appel qui commence à `from` (parenthèses équilibrées, chaînes sautées), pour y chercher method: 'POST' */
function callArgs(src, from) {
    let depth = 1, i = from, q = null;
    for (; i < src.length && i < from + 4000; i++) {
        const c = src[i];
        if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
        if (c === '"' || c === "'" || c === '`') q = c;
        else if (c === '(') depth++;
        else if (c === ')') { if (--depth === 0) break; }
    }
    return src.slice(from, i);
}
const isPost = s => /method\s*[:=]\s*['"]POST['"]|sendBeacon\(/i.test(s);
/** POST seulement quand on lui passe un 2e argument (function call(action, body = null) { … body ? {method: 'POST'…} : {…} }) */
const condPost = (kind, args) => { const m = /^COND:(\d+)$/.exec(kind || ''); if (!m) return false; const a = restArgs(args)[Number(m[1]) - 1]; return !!a && !/^(null|undefined|false|0|'')$/.test(a); };
const isCondPost = s => /\b\w+\s*\?\s*\{[^}]*method\s*:\s*['"]POST|\bif\s*\(\s*\w+(\s*\|\|\s*\w+)?\s*\)\s*\{?[^}]{0,120}method\s*=\s*['"]POST/.test(s);
/** les arguments de premier niveau d'un appel, à partir du texte qui suit le 1er : « , {}, {a: 1}) » → ['{}', '{a: 1}'] */
function restArgs(args) {
    const out = []; let depth = 0, q = null, cur = null;
    for (let i = 0; i < args.length; i++) {
        const c = args[i];
        if (q) { if (c === '\\') i++; else if (c === q) q = null; if (cur !== null) cur += c; continue; }
        if (c === '"' || c === "'" || c === '`') q = c;
        if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
        if (c === ',' && depth === 0) { if (cur !== null) out.push(cur.trim()); cur = ''; continue; }
        if (cur !== null) cur += c;
    }
    if (cur !== null && cur.trim()) out.push(cur.trim());
    return out;
}
const SUBKEY = 'op|what|kind|mode|do|step|type';

function extractActions(dir = JS) {
    const out = new Map(); // nom → {methods: Set, files: Set, variants: {GET: Set, POST: Set}} ; une variante = '{"op":"save"}'
    const add = (name, method, file, variant = null) => {
        if (!NAME.test(name)) return;
        if (process.env.LCNDA_ROUTES_WHY === name) console.log(method, file, variant, new Error().stack.split('\n')[2]);
        const e = out.get(name) || {methods: new Set(), files: new Set(), variants: {GET: new Set(), POST: new Set()}};
        e.methods.add(method); e.files.add(file); if (variant) e.variants[method].add(JSON.stringify(variant)); out.set(name, e);
    };
    const famPre = [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
    const srcs = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[\s;{}])\/\/[^\n]*/g, '$1')])); // sans les commentaires
    // les familles de téléchargement (app-listes-maj.js : FAM) : pre, status, info, finish
    // (et celles qu'un autre fichier y ajoute : heritage-telech-a.js → FAMILY telech_a_osm)
    for (const f of files) for (const m of srcs[f].matchAll(/\{id:\s*'[a-z_]+',[^\n]*?status:\s*'([a-z_]+)',\s*info:\s*'([a-z_]+)',\s*pre:\s*'([a-z_]+)',\s*finish:\s*'([a-z_]+)'/g)) {
        add(m[1], 'GET', f); add(m[2], 'GET', f); add(m[4], 'POST', f); famPre.push(m[3]);
    }
    const esc = w => w.replace(/[$]/g, '\\$');
    /** la sous-action d'un appel : {op: 'save'} dans « …, {op: 'save', … » ou « body: {op: 'save' » */
    const subOf = (args, bodyOnly) => { const m = args.match(new RegExp(`${bodyOnly ? 'body\\s*:\\s*' : '^\\s*,\\s*(?:\\{\\}\\s*,\\s*\\{[^{]*body\\s*:\\s*)?'}\\{\\s*(${SUBKEY})\\s*:\\s*['"]([a-z][a-z0-9_]*)['"]`)); return m ? {[m[1]]: m[2]} : null; };
    for (const f of files) {
        const src = srcs[f];
        // les petites fonctions maison : const post = async (a, body) => … .api(a, …) ; function post(action, body) { … action=${action} … }
        const wrappers = new Map(), fixed = [];
        const defs = [], curly = src.replace(/[{]/g, '(').replace(/[}]/g, ')'); // (pour trouver la fin d'un corps de fonction)
        for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(\s*([A-Za-z_$][\w$]*)[^)]*\)|([A-Za-z_$][\w$]*))\s*=>([^\n]{0,600})/g)) defs.push([m[1], m[2] || m[3], m[4], (m[0].match(/=\s*(?:async\s*)?\(([^)]*)\)/) || [])[1] || m[3]]);
        for (const m of src.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*\{/g)) defs.push([m[1], m[2], src.slice(m.index, m.index + m[0].length + callArgs(curly, m.index + m[0].length).length + 1), (m[0].match(/\(([^)]*)\)/) || [])[1]]); // le corps seul
        // a. celles qui passent leur 1er argument comme nom d'action
        for (const [name, param, body, params] of defs) {
            if (!name || !param || name === 'api' && f === 'app.js') continue;
            const p = esc(param);
            if (!(new RegExp(`\\bapi\\(\\s*${p}\\b|api\\.php\\?action=(?:\\$\\{\\s*${p}\\s*\\}|['"]\\s*\\+\\s*${p}\\b)|\\.set\\(\\s*['"]action['"]\\s*,\\s*${p}\\b`).test(body) && (!/\.set\(\s*['"]action/.test(body) || /api\.php/.test(body)))) continue;
            if (!isPost(body)) wrappers.set(name, 'GET');
            else if (isCondPost(body)) { // le n° de l'argument qui décide : (a, p, b) => … b ? {method: 'POST'…} : …
                const names = String(params).split(',').map(x => x.trim().split(/[\s=]/)[0]), c = (body.match(/\b(\w+)\s*\?\s*\{[^}]*method\s*:\s*['"]POST/) || body.match(/\bif\s*\(\s*(\w+)(?:\s*\|\|\s*\w+)?\s*\)\s*\{?[^}]{0,120}method\s*[=:]\s*['"]POST/) || [])[1];
                wrappers.set(name, 'COND:' + Math.max(1, names.indexOf(c)));
            } else wrappers.set(name, 'POST');
        }
        // b. une action fixe : le 1er argument est la sous-action (const write = (op, body) => A().api('inbox_write', {}, {method: 'POST', body: {op, ...body}}))
        //    ou la charge entière (const post = body => A().api('compl_write', {}, {method: 'POST', body}) ; const get = q => A().api('cartes_plus', q))
        const callers = ['api', 'apiPost', ...[...wrappers.keys()].filter(w => w !== 'api')].map(esc).join('|');
        for (const [name, param, body] of defs) {
            if (!name || !param || wrappers.has(name)) continue;
            const p = esc(param);
            const fx = body.match(new RegExp(`(?<![\\w$])(${callers})\\(\\s*(['"])([a-z][a-z0-9_]*)\\2`)) || body.match(/(fetch)\(\s*(['"`])api\.php\?action=([a-z][a-z0-9_]*)\2/);
            if (!fx) continue;
            const via = wrappers.get(fx[1]), rest = callArgs(body, fx.index + fx[0].length);
            const method = isPost(rest) || fx[1] === 'apiPost' || fx[1] === 'fetch' && isPost(body) || via === 'POST' || condPost(via, rest) ? 'POST' : 'GET';
            const key = (rest.match(new RegExp(`\\b(${SUBKEY})\\s*:\\s*${p}\\s*[,}]`)) || [])[1] || (new RegExp(`\\{\\s*${p}\\s*[,}]`).test(rest) ? param : null);
            if (key && new RegExp(`^(${SUBKEY})$`).test(key)) fixed.push({name, action: fx[3], method, key});
            else if (new RegExp(`body\\s*:\\s*${p}\\b|[{,]\\s*${p === 'body' ? 'body\\s*[,}]' : '\\b$^'}|^\\s*,\\s*(?:\\{\\}\\s*,\\s*)?${p}\\s*$`).test(rest) || fx[1] === 'fetch' && new RegExp(`JSON\\.stringify\\(\\s*\\{\\s*\\.\\.\\.${p}\\b`).test(body)) fixed.push({name, action: fx[3], method, key: null}); // post({op: 'save', …})
        }
        // 1. .api('x' …) et api('x' …) : GET, sauf method: 'POST' dans l'appel
        for (const m of src.matchAll(/(?<![\w$])((?:[\w$]+(?:\(\))?\.)*)api\(\s*(['"`])([a-z][a-z0-9_]*)\2/g)) {
            const w = !m[1] ? wrappers.get('api') : null, args = callArgs(src, m.index + m[0].length), method = isPost(args) || w === 'POST' || condPost(w, args) ? 'POST' : 'GET';
            add(m[3], method, f, subOf(args, method === 'POST' && isPost(args)));
        }
        // 2. les fonctions maison : post('x' …), get('x' …), write('x' …), apiPost('x' …)…
        for (const [w, kind] of [...wrappers, ...(wrappers.has('api') ? [] : [['api', 'GET']])]) {
            if (w !== 'api') for (const m of src.matchAll(new RegExp(`(?<![\\w$.])${esc(w)}\\(\\s*(['"\`])([a-z][a-z0-9_]*)\\1`, 'g'))) {
                const args = callArgs(src, m.index + m[0].length);
                const method = isPost(args) || condPost(kind, args) ? 'POST' : /^COND/.test(kind) ? 'GET' : kind;
                add(m[2], method, f, subOf(args, false));
            }
            // `${f.pre}_dl_start` : les familles de app-listes-maj.js
            for (const m of src.matchAll(new RegExp(`(?<![\\w$.])${esc(w)}\\(\\s*\`\\$\\{[^}]*\\.pre\\}(_[a-z_]+)\``, 'g'))) for (const pre of famPre) add(pre + m[1], /^COND/.test(kind) ? 'POST' : kind, f);
        }
        // 2 bis. une action fixe et sa sous-action : write('save_case' …) → inbox_write {op: 'save_case'} ; post({op: 'save' …}) → lp_write {op: 'save'}
        for (const {name, action, method, key} of fixed) {
            add(action, method, f);
            const re = key ? new RegExp(`(?<![\\w$.])${esc(name)}\\(\\s*['"]([a-z][a-z0-9_]*)['"]`, 'g') : new RegExp(`(?<![\\w$.])${esc(name)}\\(\\s*\\{\\s*(${SUBKEY})\\s*:\\s*['"]([a-z][a-z0-9_]*)['"]`, 'g');
            for (const m of src.matchAll(re)) add(action, method, f, key ? {[key]: m[1]} : {[m[1]]: m[2]});
        }
        // 3. api.php?action=x (fetch, liens de téléchargement, images) ; pas les « /w/api.php?action=parse » de Wikipédia
        for (const m of src.matchAll(/(?<![\w/.])api\.php\?action=([a-z][a-z0-9_]*)/g)) {
            const before = src.slice(Math.max(0, m.index - 200), m.index), fe = before.match(/(fetch|sendBeacon)\(\s*[`'"][^`'"]*$/);
            add(m[1], fe && (fe[1] === 'sendBeacon' || isPost(callArgs(src, m.index - fe[0].length + fe[1].length + 1))) ? 'POST' : 'GET', f);
        }
    }
    // les noms faits à la volée ailleurs (un seul endroit chacun) : on les déroule ici
    const dyn = [
        ['heritage-parents-celebres.js', /post\(`celeb_\$\{d\.pcCtl\}`/, /data-pc-ctl="([a-z_]+)"/g, 'celeb_'],
        ['heritage-pistes-auto.js', /post\(`pistes_\$\{what\}`/, /control\('([a-z_]+)'\)/g, 'pistes_'],
    ];
    for (const [f, re, vre, pre] of dyn) {
        const src = srcs[f]; if (!src || !re.test(src)) continue;
        for (const m of src.matchAll(vre)) add(pre + m[1], 'POST', f);
    }
    return out;
}

/* les actions nommées dans le PHP (pour celles qu'on n'appelle pas) */
function phpMentions() {
    const txt = [path.join(root, 'api.php'), ...fs.readdirSync(path.join(root, 'lib')).filter(f => f.endsWith('.php')).map(f => path.join(root, 'lib', f))].map(f => fs.readFileSync(f, 'utf8')).join('\n');
    return name => new RegExp(`['"]${name}['"]`).test(txt);
}

/** les routes par préfixe d'api.php (str_starts_with($action, 'rt_'), preg_match('/^gov_(dl|pack)_/', $action)) placées AVANT les grands
 *  match ($action) : aucune ne doit couvrir une action que ces match traitent plus bas (elle n'y arriverait jamais : le bogue des ld_*) */
function shadowedRoutes() {
    const lines = fs.readFileSync(path.join(root, 'api.php'), 'utf8').split('\n');
    const find = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };
    const mainAt = find(/^ {4}match \(\$action\) \{/), mainEnd = find(/default => json_response\(\['error' => 'Action inconnue'\]/, mainAt);
    const wAt = find(/^function handle_write\(/), wEnd = find(/default => throw new RuntimeException\('Action d’écriture inconnue'\)/, wAt);
    assert.ok(mainAt > 0 && mainEnd > mainAt && wAt > 0 && wEnd > wAt, 'api.php : les match ($action) ne sont plus où on les attend');
    const arms = (a, b) => { const out = new Set(); for (let i = a; i <= b; i++) { const m = lines[i].match(/^\s*((?:'[a-z][a-z0-9_]*'\s*,\s*)*'[a-z][a-z0-9_]*')\s*=>/); if (m) for (const x of m[1].matchAll(/'([a-z0-9_]+)'/g)) out.add(x[1]); } return out; };
    const GET = arms(mainAt, mainEnd), WRITE = arms(wAt, wEnd);
    const out = [], routes = [];
    for (let i = 0; i < mainAt; i++) {
        const l = lines[i]; if (!/^\s*if \(/.test(l)) continue;
        const tests = [];
        for (const m of l.matchAll(/str_starts_with\(\(?(?:string\)\s*)?\$action,\s*'([a-z0-9_]+)'\)/g)) tests.push([m[1] + '…', a => a.startsWith(m[1])]);
        for (const m of l.matchAll(/preg_match\('\/(\^[^']+)\/',\s*\(string\)\s*\$action\)/g)) { const re = new RegExp(m[1]); tests.push(['/' + m[1] + '/', a => re.test(a)]); }
        if (!tests.length) continue;
        if (/^\s*if \(.*\) \{ require_once [^;]+; \}\s*(\/\/.*)?$/.test(l)) continue; // ne fait que charger un fichier : la suite passe
        const w = /\$isWrite &&/.test(l) && !/!\$isWrite &&/.test(l), g = /!\$isWrite &&/.test(l);
        const cands = [...(w ? [] : GET), ...(g ? [] : WRITE)];
        for (const [label, ok] of tests) { routes.push(label); for (const a of cands) if (ok(a)) out.push(`api.php:${i + 1} ${label} avale « ${a} » (traitée plus bas, ${GET.has(a) && !w ? 'lecture' : 'écriture'})`); }
    }
    return {out, routes, GET, WRITE};
}

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 40).join('\n  ')); } };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// la route n'existe pas : « Action inconnue », « Action d’écriture inconnue », « Action météo inconnue. », « Action inconnue sur les graphiques. »…
const UNKNOWN = /\baction( [^.:!?]{0,40})? inconnue\b|unknown action|acci[oó]n desconocida|unbekannte aktion|azione sconosciuta|a[cç][aã]o desconhecida|nieznana akcja|onbekende actie/i;
// et avec une sous-action lue dans le JS ({op: 'save'}) : elle doit être connue aussi (« Demande inconnue. », « Opération inconnue sur les cartes postales. »)
const UNKNOWN_OP = /\b(demande|op[ée]ration)( [^.:!?]{0,40})? inconnue\b|unknown (request|operation)/i;

(async () => {
    const acts = extractActions();
    if (process.env.LCNDA_ROUTES_LIST) { for (const [a, e] of [...acts].sort()) console.log([...e.methods].join('+'), a, [...e.files].join(','), [...e.variants.GET, ...e.variants.POST].join(' ')); process.exit(0); }
    await t(`le JS appelle ${acts.size} actions : la lecture du code les trouve toutes (ld_*, familles, fonctions maison)`, async () => {
        assert.ok(acts.size > 400, 'trop peu d’actions trouvées : ' + acts.size);
        for (const a of ['ld_status', 'ld_query', 'ld_facet', 'ld_famille', 'ld_groups', 'ld_merge', 'meteo_status', 'hist_dl_start', 'telech_a_osm_dl_step', 'telech_a_osm_pack_finish', 'gov_pack_remove', 'bo_pack_restore', 'prenoms_pays_dl_step', 'donnees_maj_check', 'rt_saved_get', 'aia_conv', 'inbox_write'])
            assert.ok(acts.has(a), 'pas trouvée : ' + a);
        assert.ok(acts.get('ld_merge').methods.has('POST') && acts.get('ld_status').methods.has('GET'));
    });
    await t('api.php : aucune route par préfixe (rt_, ro_, aia_, sd_, gov_(dl|pack)_…) n’avale une action traitée plus bas', async () => {
        const {out, routes, GET, WRITE} = shadowedRoutes();
        assert.ok(routes.length >= 15 && GET.size > 300 && WRITE.size > 300, `lecture d'api.php incomplète : ${routes.length} routes, ${GET.size} lectures, ${WRITE.size} écritures`);
        assert.deepStrictEqual(out, []);
    });
    await t('la liste blanche ne garde que des actions encore appelées par l’écran', async () => {
        for (const a of Object.keys(ALLOW)) assert.ok(acts.has(a), `ALLOW.${a} n’est plus appelée par le JS : à retirer`);
    });
    await t('les actions qu’on n’appelle pas (effets de bord) ont bien une route nommée côté serveur', async () => {
        const has = phpMentions();
        const miss = Object.keys(SKIP).filter(a => acts.has(a) && !has(a));
        assert.deepStrictEqual(miss, []);
    });

    /* ═════════ 2. une base d'essai vide, un serveur, et chaque action ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-routes-')), empty = path.join(tmp, 'vide');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.mkdirSync(empty);
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const dead = `http://127.0.0.1:${await freePort()}`; // rien n'écoute : toute requête réseau échoue tout de suite
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1',
        LCNDA_METEO_DIR: path.join(tmp, 'meteo'), LCNDA_HIST_DB: path.join(empty, 'pas-de-pack.sqlite'), LCNDA_OLLAMA_URL: dead, LCNDA_TEST_DONNEES_BASE: dead + '/', LCNDA_TEST_WIKIDATA_URL: dead + '/sparql',
        LCNDA_REFERENCE_BASE_URL: dead + '/', LCNDA_PUBLISH_TEST_BASE: dead + '/', LCNDA_TEST_INSEE_OFFLINE: '1', http_proxy: dead, https_proxy: dead, HTTP_PROXY: dead, HTTPS_PROXY: dead, no_proxy: '', NO_PROXY: ''};
    for (const k of ['GOV', 'HIST', 'PRENOMS', 'ELECTIONS', 'BO', 'LP', 'BA', 'METEO', 'TELECHA', 'TD', 'TR', 'TM', 'PM', 'MR', 'CC', 'BR', 'CPLUS', 'CX', 'CELEB', 'BNF', 'IIIF', 'INSEE', 'OPENARCH', 'DICOTOPO']) env[`LCNDA_TEST_${k}_DIR`] = empty;
    fs.mkdirSync(env.LCNDA_METEO_DIR, {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    const stop = () => { try { proc.kill('SIGKILL'); } catch (_) {} };
    process.on('exit', stop);
    try {
        for (let i = 0; i < 150; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const call = async (action, method, extra = null) => {
            const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 30000);
            try {
                const r = method === 'POST'
                    ? await fetch(`${base}api.php?action=${action}`, {method: 'POST', signal: ctl.signal, headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({...(extra || {}), csrf})})
                    : await fetch(`${base}api.php?action=${action}${extra ? '&' + new URLSearchParams(extra) : ''}`, {signal: ctl.signal, headers: {Cookie: cookie}});
                const text = await r.text();
                let err = ''; try { const j = JSON.parse(text); err = String(j?.error ?? j?.result?.error ?? ''); } catch (_) { err = r.ok ? '' : text.slice(0, 300); }
                return {status: r.status, err};
            } catch (e) { return {status: 0, err: e.name === 'AbortError' ? '(plus de 30 s : la route a été trouvée, le travail est long)' : String(e.message)}; }
            finally { clearTimeout(timer); }
        };
        const order = [...acts.keys()].sort();
        const jobs = [];
        for (const a of order) for (const m of [...acts.get(a).methods].sort()) { // une action à sous-actions ({op: 'save'}) : chacune ; sinon l'action seule
            const vs = [...acts.get(a).variants[m]].map(v => JSON.parse(v));
            if (vs.length) vs.forEach(v => jobs.push([a, m, v])); else jobs.push([a, m, null]);
        }
        jobs.sort((x, y) => x[1].localeCompare(y[1]) || x[0].localeCompare(y[0])); // GET d'abord, puis POST
        const bad = [], seen = {};
        await t(`chaque action appelée par l'écran (${jobs.length} appels) arrive à sa route : jamais « Action inconnue »`, async () => {
            const one = async ([a, m, v]) => {
                if (SKIP[a]) return;
                const r = await call(a, m, v), label = `${m} ${a}${v ? ' ' + JSON.stringify(v) : ''}`; seen[label] = r;
                if (process.env.LCNDA_ROUTES_VERBOSE) console.log(`  ${label} → ${r.status} ${r.err.slice(0, 120)}`);
                if ((UNKNOWN.test(r.err) || v && UNKNOWN_OP.test(r.err) && !ALLOW_OP[label.slice(m.length + 1)]) && !ALLOW[a]) bad.push(`${label} → ${r.status} « ${r.err} » (appelée par ${[...acts.get(a).files].join(', ')})`);
            };
            const gets = jobs.filter(j => j[1] === 'GET'), posts = jobs.filter(j => j[1] !== 'GET');
            await Promise.all([0, 1, 2].map(async k => { for (let i = k; i < gets.length; i += 3) await one(gets[i]); })); // les lectures, 3 à la fois
            for (const j of posts) await one(j); // les écritures, une à une (SQLite)
            bad.sort();
            assert.deepStrictEqual(bad, [], 'actions perdues en route :\n' + bad.join('\n'));
        });
        await t('le serveur répond encore à la fin (aucune action n’a cassé la base d’essai)', async () => {
            const r = await call('kiosk_state', 'GET'); assert.strictEqual(r.status, 200, r.err);
            const b = await call('ld_status', 'GET'); assert.strictEqual(b.status, 200, b.err);
        });
        await t('les actions des listes de données (ld_*) et des Lieux en double répondent, chacune par sa route', async () => {
            for (const a of ['GET ld_status', 'GET ld_famille', 'GET ld_groups']) assert.ok(seen[a] && !UNKNOWN.test(seen[a].err), a + ' : ' + JSON.stringify(seen[a]));
        });
    } finally { stop(); }
    try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();


