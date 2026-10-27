'use strict';
/** Réglages qui ne doivent pas se gêner entre eux (vérification de toute l'app).   node tests/test-reglages-croises.js */
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const read = s => fs.readFileSync(path.join(__dirname, '..', s), 'utf8');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
t('mode consultation 🔒 et mode simple : aucun des deux ne retire « is-kiosk » à l’autre', () => {
    assert.match(read('assets/js/heritage-tools.js'), /classList\.toggle\('is-kiosk', !!kiosk\.on \|\| document\.documentElement\.classList\.contains\('ms-open'\)\)/);
    assert.match(read('assets/js/app-mode-simple.js'), /if \(addedKiosk && !document\.getElementById\('kiosk-banner'\)\) document\.body\.classList\.remove\('is-kiosk'\)/);
});
t('affichage des variantes de nom : la valeur de Thème et couleurs passe devant (réglages enregistrés, défaut du site)', () => {
    assert.match(read('assets/js/app.js'), /function getIdentityNameVariantsDisplay\(\)\{try\{const ok=[^}]*,d=readDesignSettings\(\)\.identity_name_variants_display;if\(ok\(d\)\)return d;/);
});
t('les messages ne recouvrent pas la barre des onglets (menu en bas ou en haut)', () => {
    const css = read('assets/css/ui.css');
    assert.match(css, /html\.nav-bottom:not\(\.is-screen-embed\):not\(\[data-toast-pos="tl"\]\):not\(\[data-toast-pos="tr"\]\) \.toast-region[^{]*\{bottom:calc\(var\(--header, 76px\) \+ 16px\)\}/);
    assert.match(css, /html:not\(\.nav-bottom\)\[data-toast-pos="tl"\] \.toast-region[^{]*\{top:calc\(var\(--header, 76px\) \+ 16px\)\}/);
});
t('le nom de la page ouverte n’utilise pas « data-module » (déjà pris par les onglets du menu)', () => {
    assert.doesNotMatch(read('assets/js/app.js'), /documentElement\.setAttribute\('data-module'/);
});
t('un seul fichier pose chaque classe du mode sombre, de l’Accessibilité et du fond ; personne n’écrase les classes de <html>', () => {
    const all = fs.readdirSync(path.join(__dirname, '..', 'assets/js')).filter(f => f.endsWith('.js')).map(f => read('assets/js/' + f)).join('\n');
    assert.doesNotMatch(all, /documentElement\.className\s*=|documentElement\.style\.cssText\s*=|document\.body\.className\s*=/);
});
console.log(`✓ réglages croisés : ${n} vérifications`);
