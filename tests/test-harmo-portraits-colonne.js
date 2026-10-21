/* K7 (un seul portrait) et K15 (colonne de gauche) — le composant, ses réglages, et plus de dessin à part.
 *   node tests/test-harmo-portraits-colonne.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/* ── un petit navigateur pour charger les deux fichiers ── */
function sandbox(store = {}) {
    const attrs = {}, props = {};
    const docEl = {setAttribute: (n, v) => { attrs[n] = String(v); }, removeAttribute: n => { delete attrs[n]; }, hasAttribute: n => n in attrs, getAttribute: n => attrs[n] ?? null,
        style: {setProperty: (k, v) => { props[k] = v; }, removeProperty: k => { delete props[k]; }}};
    const localStorage = {getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }};
    const window = {LCNDA_APP: {sosaNumberFor: id => (id === 7 ? 12 : 0)}};
    const ctx = {window, localStorage, console, requestAnimationFrame: f => f(), MutationObserver: class { observe() {} },
        document: {documentElement: docEl, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}}};
    vm.createContext(ctx);
    vm.runInContext(read('assets/js/app-portraits.js'), ctx);
    vm.runInContext(read('assets/js/app-colonne.js'), ctx);
    return {ctx, window, attrs, props, store};
}

/* 1. « Comme avant » par défaut : rien ne change */
{
    const {window, attrs, props} = sandbox();
    const UI = window.LCNDA_UI;
    assert.strictEqual(UI.avatarOn(), false, 'par défaut : « Comme avant »');
    assert.strictEqual(UI.avatarOr({name: 'Joseph MARTIN'}, 34, 'ANCIEN'), 'ANCIEN', 'avatarOr garde l’ancien dessin');
    assert.ok(!Object.keys(attrs).some(k => /lc-/.test(k)), 'aucun attribut posé sur la page par défaut');
    assert.ok(!('--sidebar' in props) && !('--lc-av-bg-m' in props), 'aucune variable posée par défaut');
    assert.strictEqual(window.LCNDA_COLUMN.read().mode, 'avant');
    assert.deepStrictEqual({...window.LCNDA_COLUMN.read(), mode: undefined}, {...window.LCNDA_COLUMN.PRESETS.avant, mode: undefined});
}

/* 2. le composant UI.avatar : 4 tailles, initiales, animal, photo, Sosa */
{
    const {window, attrs, props} = sandbox({'genealogie-portraits': JSON.stringify({mode: 'rond', sosa: true})});
    const UI = window.LCNDA_UI;
    assert.strictEqual(UI.avatarOn(), true);
    assert.strictEqual(attrs['data-lc-portraits'], 'rond');
    assert.strictEqual(props['--lc-av-bg-m'], '#3c78d8', 'couleur homme par défaut');
    assert.strictEqual(props['--lc-av-radius'], '50%');
    const html = UI.avatar({first_name: 'Joseph', last_name: 'MARTIN', gender: 'male'}, 34);
    assert.match(html, /class="lc-av lc-av-34 is-m"/);
    assert.match(html, />JM</);
    assert.match(UI.avatar({name: 'Louise BORIE', gender: 'female'}, 22), /lc-av-22 is-f[^>]*>LB</);
    assert.match(UI.avatar({name: 'jean de la FONTAINE'}, 48), />JF</, 'le nom en capitales est reconnu');
    assert.match(UI.avatar({name: 'Pompon', kind: 'animal'}, 34), /is-a[^>]*>🐾</);
    assert.match(UI.avatar({free: true}, 34), />\?</);
    for (const [asked, got] of [[20, 22], [30, 34], [40, 34], [52, 48], [84, 88], [120, 88]]) assert.match(UI.avatar({name: 'A B'}, asked), new RegExp(`lc-av-${got} `), `taille ${asked} → ${got}`);
    const ph = UI.avatar({name: 'Louise BORIE', photo: 'media/a%20b.jpg'}, 88);
    assert.match(ph, /has-photo/); assert.match(ph, /background-image:url\('media\/a%20b\.jpg'\)/);
    assert.doesNotMatch(UI.avatar({name: 'X Y', photo: "javascript:alert(1)"}, 34), /background-image/, 'adresse d’image non sûre refusée');
    assert.doesNotMatch(UI.avatar({name: 'X Y', photo: "media/a.jpg');x:url('y"}, 34), /background-image/, 'pas de sortie du style');
    assert.match(UI.avatar({id: 7, name: 'Jean MARTIN'}, 34), /lc-av-sosa[^>]*>12</, 'badge Sosa (34 px)');
    assert.doesNotMatch(UI.avatar({id: 7, name: 'Jean MARTIN'}, 22), /lc-av-sosa/, 'pas de Sosa à 22 px');
    assert.match(UI.avatar({name: '<img src=x>'}, 34), /title="&lt;img src=x&gt;"/, 'nom échappé');
}

/* 3. réglages vérifiés : une seule lettre, carré de la fiche, valeurs bornées */
{
    const {window, props} = sandbox({'genealogie-portraits': JSON.stringify({mode: 'carre', letters: 'une', bw: 99, init: 5, m: 'red;}', shape: 'x'})});
    const P = window.LCNDA_PORTRAITS, S = P.read();
    assert.strictEqual(S.bw, 4); assert.strictEqual(S.init, 28); assert.strictEqual(S.m, '#3c78d8'); assert.strictEqual(S.shape, 'carre');
    assert.strictEqual(props['--lc-av-bg-m'], '#f1f1f1', 'le carré de la fiche : fond gris des photos noir et blanc');
    assert.strictEqual(props['--lc-av-photo-filter'], 'grayscale(1)');
    assert.match(window.LCNDA_UI.avatar({first_name: 'Joseph', last_name: 'MARTIN'}, 34), /is-one[^>]*>M</);
}

/* 4. colonne de gauche : réglage vérifié et posé sur la page */
{
    const {window, attrs, props} = sandbox({'genealogie-left-column': JSON.stringify({mode: 'nouveau', width: 999, size: 'compacte', nums: false, style: '<x>'})});
    const C = window.LCNDA_COLUMN.read();
    assert.strictEqual(C.width, 420); assert.strictEqual(C.style, 'continue'); assert.strictEqual(C.numstyle, 'suite'); assert.strictEqual(C.lf, 'barre');
    assert.strictEqual(attrs['data-lc-col-style'], 'continue'); assert.strictEqual(attrs['data-lc-col-nums'], 'off'); assert.strictEqual(attrs['data-lc-col-size'], 'compacte'); assert.strictEqual(attrs['data-lc-col-tabs'], 'ligne');
    assert.strictEqual(props['--sidebar'], '420px');
}

/* 5. plus aucun dessin de portrait à part : chaque ancien dessin passe par UI.avatar quand le réglage n'est pas « Comme avant » */
{
    const LEGACY = /class="(?:pk-av|cr-av|pf-lav|ar-av|h-emp-ini|avatar|portrait portrait-placeholder|person-card-initial|ar-hero-ph)\b|class="pk-av \$|person-thumb/;
    const MIGRATED = {
        'assets/js/app.js': 2, 'assets/js/app-picker.js': 1, 'assets/js/app-media-picker.js': 1, 'assets/js/app-tableau-de-bord.js': 1,
        'assets/js/app-recherche.js': 2, 'assets/js/app-graphiques.js': 1, 'assets/js/heritage-creations.js': 1, 'assets/js/heritage-profils-liste.js': 1,
        'assets/js/heritage-artist.js': 1, 'assets/js/heritage-blocs-school.js': 1, 'assets/js/heritage-artist-page.js': 1, 'assets/js/heritage-profils.js': 1,
        'assets/js/heritage-employers.js': 1, 'assets/js/heritage-boards.js': 1,
    };
    // à part, voulus : les exemples de l'accessibilité et des formes d'avatar, le « TXT » d'un média trouvé dans la Recherche
    const ALLOWED = new Set(['assets/js/app-access.js', 'assets/js/app-apparence.js']);
    for (const [f, n] of Object.entries(MIGRATED)) {
        const t = read(f), c = (t.match(/avatarOn\?\.\(\)/g) || []).length + (t.match(/\blcAv\b/g) ? 1 : 0) + (t.match(/treeAv\(/g) ? 1 : 0);
        assert.ok(c >= n, `${f} : le portrait commun n’est pas branché (${c}/${n})`);
    }
    const js = fs.readdirSync(path.join(root, 'assets/js')).filter(f => f.endsWith('.js')).map(f => 'assets/js/' + f);
    const stray = js.filter(f => !MIGRATED[f] && !ALLOWED.has(f) && LEGACY.test(read(f)));
    assert.deepStrictEqual(stray, [], 'dessins de portrait faits à la main hors du composant : ' + stray.join(', '));
    const tree = read('assets/js/app-graphiques.js');
    assert.strictEqual((tree.match(/\$\{treeAv\((?:p|partner)\)\}<strong>/g) || []).length, 2, 'les cases de l’arbre ont le portrait');
}

/* 6. les deux réglages suivent le défaut du site, les « 💾 Réglages enregistrés » et les styles */
{
    const keys = ['genealogie-portraits', 'genealogie-left-column'];
    const appKeys = read('assets/js/app.js').match(/const SITE_DEFAULT_KEYS = \[([\s\S]*?)\];/)[1];
    const apiKeys = read('api.php').match(/function site_defaults_allowed_keys\(\): array\s*\{[^\[]*return \[([\s\S]*?)\];/)[1];
    const layout = read('assets/js/heritage-studio.js').match(/const LAYOUT_KEYS = \[([\s\S]*?)\];/)[1];
    keys.forEach(k => { assert.ok(appKeys.includes(`'${k}'`), `SITE_DEFAULT_KEYS : ${k}`); assert.ok(apiKeys.includes(`'${k}'`), `api.php : ${k}`); assert.ok(layout.includes(`'${k}'`), `Réglages enregistrés : ${k}`); });
    assert.match(read('assets/js/app.js'), /lookFlat\?\.\(\)/, 'les designs enregistrés emportent les deux réglages');
    const css = read('assets/css/app.css');
    ['.lc-av {', '.lc-av-22 {', '.lc-av-34 {', ':root[data-lc-col-style]', ':root[data-lc-col-nums="off"]', ':root[data-lc-col-tabs="dessus"]', '.lck-choice', '#sidebar-content .lc-lf-src'].forEach(s => assert.ok(css.includes(s), 'style manquant : ' + s));
    const idx = read('index.php');
    assert.match(idx, /app-portraits\.js\?v=\d+/); assert.match(idx, /app-colonne\.js\?v=\d+/);
    assert.ok(idx.indexOf('app-ui.js') < idx.indexOf('app-portraits.js'), 'app-portraits.js après app-ui.js');
}
console.log('✓ K7 portraits et K15 colonne de gauche : composant, réglages, plus de dessin à part');
