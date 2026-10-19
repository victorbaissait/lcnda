'use strict';
/**
 * Non-régression de l'audit des outils « œuvres et profils » :   node tests/test-domaines-audit.js
 *  - « Cocher Inventeur ? » ne doit plus sortir ailleurs que dans l'import d'une sorte des sciences : avant, ouvrir
 *    « 📥 Importer » sur les inventions laissait une variable qui changeait la question des imports suivants
 *    (« ＋ Plusieurs épisodes », setlist en public…) ;
 *  - la couleur d'un profil à soi (menu « 🧩 Profils ») passe par un code #rrggbb : une valeur forgée dans la base
 *    ne peut ni sortir de l'attribut style ni y glisser d'autres propriétés ;
 *  - écran Listes « Palmarès » / « Revue de presse » : un seul écouteur « lcnda:blocs-changed », même après 30 passages
 *    (avant : un de plus à chaque passage, qui gardait toute l'ancienne page en mémoire).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.resolve(__dirname, '..');
const store = {};
const asked = [];
const stubEl = () => ({addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {}, classList: {add() {}, remove() {}, toggle() {}}});
const win = {LCNDA_EXT: {openDialog: () => null}, localStorage: {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }},
    LCNDA_APP: {plural: (n, w, pl) => `${n} ${n > 1 ? (pl || `${w}s`) : w}`, toast() {}, api: async () => ({result: {}}), confirmBox: async (msg, o) => { asked.push(o?.title || msg); return false; }}};
const ctx = vm.createContext({window: win, document: {...stubEl(), documentElement: stubEl(), body: stubEl(), createElement: stubEl}, localStorage: win.localStorage, console, setTimeout, clearTimeout, URL, CSS: {escape: s => s}, Event: class {}, CustomEvent: class {}, Audio: class {}, location: {href: 'http://x/'}});
ctx.globalThis = ctx;
['heritage-artist.js', 'heritage-artist-fields.js', 'heritage-artist-panel.js', 'heritage-artist-music.js', 'heritage-artist-art.js', 'heritage-artist-books.js', 'heritage-artist-film.js',
    'heritage-sciences.js', 'heritage-sciences-explore.js', 'heritage-sciences-profile.js', 'heritage-artist-page.js', 'heritage-artist-list.js', 'heritage-artist-import.js', 'heritage-artist-catalogue.js',
    'heritage-profils.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), ctx, {filename: f}));
const ART = win.LCNDA_ART;

(async () => {
    await new Promise(r => setTimeout(r, 5)); // wrapImport (heritage-sciences.js) passe après les autres scripts
    const st = new ART.Store(3); st.person = {first_name: 'Jean', last_name: 'Neuf', gender: 'male', profiles: []}; st.global = {}; st.settings = {};
    const C = {store: st, pid: 3};
    const ask = async (...a) => { asked.length = 0; await ART.needArtist(st, ...a).catch(() => {}); return asked[0] || ''; };
    const before = await ask();
    ART.openImport(C, 'invention'); // la fenêtre « 📥 Importer » des inventions, puis on la ferme
    const after = await ask();
    const inImport = await ask('invention');
    const PF = ART.PF;
    // l'écran Listes des blocs, 30 fois, dans un autre bac à sable
    const ls = {}, docB = {...stubEl(), addEventListener: (t, f) => { (ls[t] = ls[t] || new Set()).add(f); }, removeEventListener: (t, f) => { ls[t]?.delete(f); }, documentElement: stubEl(), body: {...stubEl(), classList: {contains: () => false}}, createElement: stubEl, readyState: 'complete'};
    const host = () => ({...stubEl(), isConnected: true, innerHTML: ''}), page = host();
    const ws = {...stubEl(), innerHTML: '', querySelector: () => page};
    const winB = {LCNDA_EXT: {}, localStorage: win.localStorage, LCNDA_APP: {...win.LCNDA_APP, $: () => ws, state: {workspaceToken: 0}, api: async () => ({items: [], settings: {}}), empty: t => t}};
    const ctxB = vm.createContext({window: winB, document: docB, localStorage: win.localStorage, console, setTimeout, clearTimeout, URL, CSS: {escape: s => s}, Event: class {}, CustomEvent: class {}, Audio: class {}, MutationObserver: class { observe() {} }, location: {href: 'http://x/'}});
    ctxB.globalThis = ctxB;
    ['heritage-artist.js', 'heritage-artist-fields.js', 'heritage-blocs.js', 'heritage-blocs-awards.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), ctxB, {filename: f}));
    const BL = winB.LCNDA_EXT.blocs; BL.mountList = () => {};
    const base = ls['lcnda:blocs-changed']?.size || 0;
    for (let i = 0; i < 30; i++) { winB.LCNDA_APP.state.workspaceToken = i; await winB.LCNDA_EXT.lists.palmares(i); }
    const listeners = (ls['lcnda:blocs-changed']?.size || 0) - base;
    ART.profiles.u_test = {key: 'u_test', label: 'Test', icon: '✦', color: 'red;background:url(//x/y)"><b>', group: 'mine', user: true};
    const checks = [
        ['avant tout import : « Cocher Artiste ? »', () => assert.match(before, /Artiste/)],
        ['après une fenêtre d’import d’inventions fermée : toujours « Artiste » (pas « Inventeur »)', () => { assert.match(after, /Artiste/); assert.doesNotMatch(after, /Inventeur/); }],
        ['dans l’import des inventions : « Cocher Inventeur ? »', () => assert.match(inImport, /Inventeur/)],
        ['écran Listes « Palmarès » ouvert 30 fois : un seul écouteur', () => assert.equal(listeners, 1)],
        ['couleur forgée d’un profil : remplacée par une couleur sûre', () => { const c = PF.color('u_test'); assert.match(c, /^#[0-9a-f]{6}$/i); assert.doesNotMatch(PF.vars(c), /url|"|</); }],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
    console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
    process.exitCode = failed ? 1 : 0;
})();
