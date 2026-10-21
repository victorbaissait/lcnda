/* Harmonisation K4 (dates de création / modification), K8 (pastilles de statut), K10 (quand il n'y a rien).
 * 1) les composants : UI.when / whenText / whenFull, UI.badge, emptyState / empty (deux tailles) ;
 * 2) plus de variante : ni « 23h39m32s », ni toLocaleString pour ces dates, ni <p class="muted">Aucun…</p>, ni boîte à part pour la Carte et la Recherche.
 *    node tests/test-harmo-indicateurs.js */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), js = f => fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

/* ── 1. composants ── */
const sandbox = {window: {}, document: {addEventListener() {}}, addEventListener() {}, Date, Math, String, Number, isNaN, console};
vm.createContext(sandbox);
vm.runInContext(js('app-indicateurs.js'), sandbox);
const UI = sandbox.window.LCNDA_UI;
const now = new Date(2026, 9, 21, 15, 0);                  // mercredi 21 octobre 2026, 15 h
const loc = (d, h, mi) => new Date(2026, 9, d, h, mi);
ok(UI.whenText(loc(21, 10, 22), {now}) === 'aujourd’hui à 10 h 22', 'aujourd’hui');
ok(UI.whenText(loc(20, 23, 39), {now}) === 'hier à 23 h 39', 'hier');
ok(UI.whenText(loc(17, 9, 5), {now}) === 'samedi à 9 h 05', 'jour de la semaine (moins de 7 jours)');
ok(/^14 oct\.? 2026$/.test(UI.whenText(loc(14, 9, 5), {now})), 'après 7 jours : « 14 oct. 2026 » — ' + UI.whenText(loc(14, 9, 5), {now}));
ok(UI.whenText(loc(21, 9, 0), {now, label: 'Modifié'}) === 'Modifié aujourd’hui à 9 h 00', 'libellé + relatif');
ok(/^Modifié le 3 janv\.? 2025$/.test(UI.whenText('2025-01-03', {now, label: 'Modifié'})), 'libellé + date : « le » — ' + UI.whenText('2025-01-03', {now, label: 'Modifié'}));
ok(UI.whenText('17/10/2026', {now}) === 'samedi', 'ancien réglage enregistré en jj/mm/aaaa (sans heure)');
ok(UI.whenText('', {now}) === '' && UI.when(null) === '' && UI.when('n’importe quoi') === '', 'date vide ou illisible : rien');
const sql = '2026-10-17 21:39:32';                         // SQLite : heure UTC
ok(UI.whenParse(sql).getTime() === Date.UTC(2026, 9, 17, 21, 39, 32), 'SQLite lu en UTC');
const full = UI.whenFull(sql); ok(/^(samedi|dimanche) 1[78] octobre 2026 à \d+ h \d\d$/.test(full), 'date complète : ' + full);
const html = UI.when(sql, {label: 'Créée'});
ok(/^<time class="ui-when" datetime="2026-10-17T21:39:32\.000Z" title="[^"]+">Créée /.test(html), 'when() rend un <time> avec la date complète au survol : ' + html);
ok(UI.badge('En cours', 'open') === '<span class="ui-badge is-blue">En cours</span>', 'badge bleu (en cours)');
ok(UI.badge('<b>', 'closed').includes('is-grey') && UI.badge('<b>', 'closed').includes('&lt;b&gt;'), 'badge gris, texte échappé');
['blue', 'green', 'yellow', 'red', 'grey', 'black', 'sosa'].forEach(k => ok(UI.badgeKind(k) === k, 'sorte ' + k));
ok(UI.badgeKind('deceased') === 'black' && UI.badgeKind('confirmed') === 'green' && UI.badgeKind('rejected') === 'red' && UI.badgeKind('inconnu?') === 'grey', 'alias des statuts');

const app = js('app.js');
const esFn = app.match(/function emptyState\(\{[\s\S]*?\n    \}/)[0], emFn = app.match(/function empty\(text, o = \{\}\) \{[^\n]*\}/)[0];
const ctx2 = {escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]))};
vm.createContext(ctx2); vm.runInContext(`${esFn}\n${emFn}\nthis.emptyState = emptyState; this.empty = empty;`, ctx2);
const big = ctx2.emptyState({icon: '📚', text: 'Aucun livre', hint: 'Astuce', action: {label: '＋ Nouveau livre', attrs: 'data-x'}});
ok(big.startsWith('<div class="empty-box empty-card">') && big.includes('<b>Aucun livre</b>') && big.includes('data-x>＋ Nouveau livre</button>'), 'grande boîte');
const small = ctx2.empty('Aucune source', {icon: '📚', action: {label: '＋ Ajouter une source', attrs: 'data-y'}});
ok(small.startsWith('<div class="empty-line">') && small.includes('<span class="empty-line-text">Aucune source</span>') && small.includes('data-y>＋ Ajouter une source</button>'), 'petite ligne avec son bouton');
ok(ctx2.empty('<i>').includes('&lt;i&gt;'), 'petite ligne : texte échappé');

/* ── 2. plus de variante ── */
const files = fs.readdirSync(path.join(root, 'assets/js')).filter(f => f.endsWith('.js'));
const all = Object.fromEntries(files.map(f => [f, js(f)]));
const hits = (re, skip = []) => files.filter(f => !skip.includes(f)).flatMap(f => [...all[f].matchAll(re)].map(m => `${f}: ${m[0].slice(0, 90)}`));
let h = hits(/\$\{h\}h\$\{mi\}m\$\{s\}s|formatCreatedBadge/g); ok(!h.length, 'K4 « 23h39m32s » : ' + h.join(' | '));
h = hits(/(created_at|updated_at)[^;\n]{0,60}toLocale(Date)?String\(|toLocale(Date)?String\([^;\n]{0,20}\)[^;\n]{0,10}(created_at|updated_at)|dateStyle: 'short', timeStyle: 'short'|dateStyle:'short',timeStyle:'short'/g);
ok(!h.length, 'K4 dates de création / modification écrites à la main : ' + h.join(' | '));
h = hits(/(Modifiée?|Créée?|Ajoutée?) le \$\{/g); ok(!h.length, 'K4 « Modifié le ${…} » : ' + h.join(' | '));
h = hits(/(updated_at|created_at) \|\| ''\)\.slice\(0, 1[06]\)/g); ok(!h.length, 'K4 date coupée « 2026-10-18 » : ' + h.join(' | '));
// (« Aucun : … » / « Aucun critère : … » expliquent un réglage ; un élément data-… est un compteur réécrit par le code : pas des listes vides)
h = hits(/<(p|div|li|small|span)(?![^>]*data-)[^>]*class="(muted|cell-muted|label-list-empty)[^"]*"[^>]*>(?!Aucune? :|Aucun critère)(Aucun|Aucune|Pas encore|Rien (trouvé|ne correspond|pour l’instant|ici|à venir|de prévu|d’écrit))/g, ['museum-viewer.js']);
ok(!h.length, `K10 ${h.length} phrase(s) « Aucun… » hors composant : ` + h.slice(0, 8).join(' | '));
ok(!/class="map-empty-overlay">Aucun/.test(all['app-carte.js']), 'K10 Carte : plus de boîte à part');
ok(!/<section class="empty-state">/.test(all['app-recherche.js']), 'K10 Recherche : plus de texte centré à part');
ok(/function empty\(text, o = \{\}\) \{ return emptyState\(\{size: 'small'/.test(app), 'K10 empty() = la petite ligne');
ok(!/class="sosa-star"/.test(app) && /class="ui-badge is-sosa"/.test(app), 'K8 fiche : Sosa en pastille bleue pleine');
ok(/sosa_bg:'#055dff'/.test(app), 'K8 couleur de départ du Sosa : bleu plein');
const css = fs.readFileSync(path.join(root, 'assets/css/indicateurs.css'), 'utf8');
const legacy = ['.status-badge', '.sosa-star', '.daboville-tag', '.outside-genealogy-badge', '.artist-badge', '.investigation-status', '.investigation-item-status-badge', '.entity-date-badge', '.h-badge', '.h-new-badge', '.tag-conf-badge', '.grave-status-badge', '.grave-condition-badge', '.branch-closed-badge', '.ar-badge'];
const shape = css.match(/\.ui-badge,\s*([\s\S]*?)\{/)[1];
legacy.forEach(c => ok(shape.includes(c), `K8 ${c} a la forme commune`));
ok(legacy.length >= 10, 'K8 au moins 10 styles migrés');
const idx = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
ok(/app-indicateurs\.js\?v=\d+/.test(idx) && /indicateurs\.css\?v=\d+/.test(idx), 'index.php charge app-indicateurs.js et indicateurs.css');
ok(idx.indexOf('indicateurs.css') > idx.indexOf('artist.css') && idx.indexOf('indicateurs.css') > idx.indexOf('ui.css'), 'indicateurs.css chargée après les autres feuilles');
console.log(`✓ harmonisation K4 / K8 / K10 : ${n} vérifications`);
