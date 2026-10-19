/* Les réglages « Définir comme défaut du site » : chaque clé envoyée par la page (SITE_DEFAULT_KEYS, assets/js/app.js)
 * doit être acceptée par le serveur (site_defaults_allowed_keys, api.php), sinon elle est jetée sans rien dire. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const keysOf = txt => [...txt.matchAll(/'([^']+)'/g)].map(m => m[1]);
const js = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8').match(/const SITE_DEFAULT_KEYS = \[([\s\S]*?)\];/);
const php = fs.readFileSync(path.join(root, 'api.php'), 'utf8').match(/function site_defaults_allowed_keys\(\): array\s*\{[^\[]*return \[([\s\S]*?)\];/);
assert.ok(js && php, 'listes de clés introuvables');
const page = keysOf(js[1]), server = keysOf(php[1]);
const missing = page.filter(k => !server.includes(k));
assert.deepStrictEqual(missing, [], 'clés envoyées par la page mais jetées par le serveur : ' + missing.join(', '));
console.log(`✓ ${page.length} clés du défaut du site acceptées par le serveur`);
