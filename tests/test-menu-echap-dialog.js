'use strict';
/**
 * Échap sur un petit menu de l'app (UI.menuAt, .ui-actmenu) dans une fenêtre <dialog> :   node tests/test-menu-echap-dialog.js
 * Échap ferme le menu, JAMAIS la fenêtre derrière — même pressé tout de suite après l'ouverture du menu
 * (avant, l'écoute d'Échap attendait un tour : un Échap rapide allait au « cancel » natif du dialog, qui se fermait :
 * c'était la panne de test-montage-suite.js, la fenêtre du montage perdue après le menu ▾ d'Enregistrer).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium = null;
for (const m of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(m)); break; } catch (_) { /* suivant */ } }
const ui = fs.readFileSync(path.join(__dirname, '..', 'assets/js/app-ui.js'), 'utf8');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
(async () => {
    await t('code : Échap écouté dès l’ouverture du menu, filet sur « cancel » des fenêtres', async () => {
        assert.match(ui, /\n {8}document\.addEventListener\('keydown', key, true\);\n {8}setTimeout\(/, 'Échap n’attend pas un tour');
        assert.match(ui, /document\.addEventListener\('cancel', e => \{\s*if \(!openPop/);
    });
    if (!chromium) { console.log('— navigateur sauté : Playwright absent'); process.exit(failed ? 1 : 0); }
    const browser = await chromium.launch();
    try {
        const p = await browser.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
        await p.setContent('<!doctype html><button id="open">ouvrir</button><dialog id="d"><button id="more">▾</button><button id="other">autre</button></dialog>');
        await p.addScriptTag({ content: ui });
        await p.evaluate(() => {
            window.nClose = 0; d.addEventListener('close', () => { window.nClose++; });
            d.addEventListener('cancel', e => { if (e.defaultPrevented) return; e.preventDefault(); d.close(); }); // comme les outils : Échap = fermer
            more.addEventListener('click', () => window.LCNDA_UI.menuAt(more, [{ label: 'Un', run() {} }, { label: 'Deux', run() {} }], { title: 'Enregistrer' }));
            d.showModal();
        });
        await t('Échap tout de suite après l’ouverture : le menu se ferme, la fenêtre reste (20 fois)', async () => {
            for (let i = 0; i < 20; i++) {
                await p.click('#more'); await p.waitForSelector('#d .ui-actmenu-i');
                await p.keyboard.press('Escape');
                await p.waitForFunction(() => !document.querySelector('.ui-actmenu'), null, { timeout: 2000 });
                assert.equal(await p.evaluate(() => d.open && window.nClose === 0), true, `fenêtre fermée au tour ${i}`);
                assert.equal(await p.evaluate(() => document.activeElement?.id), 'more', 'le focus revient au bouton du menu');
            }
        });
        await t('Échap au menu déclenché sans clavier (le « cancel » arrive seul) : filet, la fenêtre reste', async () => {
            await p.click('#more'); await p.waitForSelector('#d .ui-actmenu-i');
            const ok = await p.evaluate(() => { const ev = new Event('cancel', { cancelable: true }); d.dispatchEvent(ev); return ev.defaultPrevented; });
            assert.equal(ok, true); assert.equal(await p.$('.ui-actmenu'), null, 'le menu, lui, s’est fermé');
            assert.equal(await p.evaluate(() => d.open && window.nClose === 0), true);
        });
        await t('sans menu ouvert, Échap ferme bien la fenêtre (rien d’affaibli)', async () => {
            await p.focus('#other'); await p.keyboard.press('Escape');
            await p.waitForFunction(() => !d.open, null, { timeout: 2000 });
        });
        assert.deepEqual(errs, [], 'aucune erreur de page');
    } finally { await browser.close(); }
    console.log(failed ? `\n${failed} échec(s).` : '\nTout est bon.'); process.exit(failed ? 1 : 0);
})();
