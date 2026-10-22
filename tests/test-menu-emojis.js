'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎨 Apparence → « Ordre et noms du menu principal » : l'émoji devant chaque onglet (app.js : menuIcons, splitMenuIcon,
 * cleanMenuIcon, menuFullLabel, menuOrderEditor ; clé genealogie-menu-icons), et le menu de choix en fenêtre :
 *     node tests/test-menu-emojis.js
 * Sur un vrai « php -S » (si Playwright est là ; sinon le test est sauté) :
 *  - émojis piégés : HTML (gardé en texte, jamais exécuté), très long, plusieurs (4 au plus), drapeaux, familles avec ZWJ
 *    (👨‍👩‍👧‍👦 jamais coupé au milieu), drapeau à « tags » (🏴󠁧󠁢󠁳󠁣󠁴󠁿), caractère qui retourne le texte (U+202E) retiré, case vidée = aucun émoji ;
 *  - seuls les émojis changés sont gardés (ceux d'origine et ceux des onglets à soi suivent leur onglet) ;
 *  - un onglet à soi (nom piégé) reçoit l'émoji choisi ; « ↺ Remettre les noms comme au départ » rend les émojis d'origine ;
 *  - 📈 « Un de mes graphiques » (menu de choix en fenêtre) : Échap ferme, même après avoir tapé (pas de « Fermer sans enregistrer ? ») ;
 *  - aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const phpPath = findPhp([devBundledPhp()]);
if (!chromium || !phpPath) { console.log('— Playwright ou PHP absent : test sauté'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-menu-emojis-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let failed = 0;

(async () => {
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male')");
$p = null;
require 'lib/bootstrap.php';
db()->prepare("INSERT INTO app_settings(key,value) VALUES(?,?)")->execute(['genealogie-custom-tabs', json_encode([['id' => 'ct_test01', 'name' => 'Mon <img src=x onerror="window.__xss=1"> onglet', 'icon' => '🎯', 'widgets' => []]])]);
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errors = [];
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    try {
        const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        const ready = async () => { await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.pickMyGraph, null, { timeout: 20000 }); await p.waitForTimeout(400); };
        const design = async () => { await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'design'; await A.setModule('maintenance'); }); await p.waitForSelector('[data-menu-icon="fiches"]'); };
        const nav = key => p.evaluate(k => { const b = document.querySelector(`.main-nav .nav-item[data-module="${k}"]:not(.nav-custom-tab)`) || document.querySelector(`.main-nav .nav-custom-tab[data-board="${k}"]`); return b ? b.textContent.replace(/^\d+/, '') : null; }, key);
        const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-menu-icons') || '{}'));
        // K2 : la liste s'enregistre toute seule quand on quitte la case (le bouton « Enregistrer » est caché)
        const leave = async sel => { assert.equal(await p.isVisible('[data-order-save="menu-order"]'), false, 'K2 : plus de bouton « Enregistrer »'); await p.press(sel, 'Tab'); await p.waitForTimeout(500);
            // la page redessinée garde le curseur dans la case suivante (sinon ce qu'on tape après Tab part dans le vide)
            assert.ok(await p.evaluate(() => document.activeElement !== document.body && !!document.getElementById('workspace')?.contains(document.activeElement)), 'le curseur reste dans la page après l’enregistrement'); };
        await p.goto(base, { waitUntil: 'domcontentloaded' }); await ready();

        const CASES = [
            ['dashboard', '<img src=x onerror=window.__xss=2>', 'imgs'],
            ['personnes', '👨‍👩‍👧‍👦', '👨‍👩‍👧‍👦'],
            ['graphiques', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'],
            ['carte', '🇫🇷🇧🇪🇨🇭🇱🇺🇩🇪🇮🇹', '🇫🇷🇧🇪🇨🇭🇱🇺'],
            ['listes', 'x'.repeat(80), 'xxxx'],
            ['chronologie', '\u202E🌳', '🌳'],
            ['fiches', '', ''],
        ];
        await t('émojis piégés : HTML en texte, ZWJ et drapeaux entiers, 4 au plus, sans U+202E, case vide = aucun', async () => {
            await design();
            assert.equal(await p.$eval('[data-menu-icon="fiches"]', e => e.value), '📒', 'émoji d’origine proposé');
            for (const [k, v] of CASES) {
                await p.fill(`[data-menu-icon="${k}"]`, v);
                if (k === 'personnes') assert.equal(await p.$eval('[data-menu-icon="personnes"]', e => e.value), '👨‍👩‍👧‍👦', 'la case garde un émoji famille entier (maxlength)');
                await leave(`[data-menu-icon="${k}"]`);
            }
            const s = await stored();
            for (const [k, , want] of CASES) assert.equal(s[k], want, k);
            assert.equal(await nav('fiches'), 'Fiches'); assert.equal(await nav('personnes'), '👨‍👩‍👧‍👦 Personnes'); assert.equal(await nav('dashboard'), 'imgs Tableau de bord');
            assert.equal(await nav('chronologie'), '🌳 Chronologie');
            assert.equal(await p.evaluate(() => window.__xss), undefined);
        });
        await t('seuls les émojis changés sont gardés (l’onglet à soi suit son émoji)', async () => {
            const s = await stored();
            assert.ok(!('adn' in s) && !('animaux' in s) && !('ct_test01' in s), JSON.stringify(s));
            assert.equal(await nav('adn'), '🧬 ADN');
            assert.equal(await nav('ct_test01'), '🎯 Mon <img src=x onerror="window.__xss=1"> onglet');
        });
        await t('un onglet à soi reçoit l’émoji choisi, gardé au rechargement', async () => {
            await design(); await p.fill('[data-menu-icon="ct_test01"]', '🐝'); await leave('[data-menu-icon="ct_test01"]'); await p.waitForTimeout(1000);
            await p.reload({ waitUntil: 'domcontentloaded' }); await ready();
            assert.equal(await nav('ct_test01'), '🐝 Mon <img src=x onerror="window.__xss=1"> onglet');
            assert.equal(await nav('personnes'), '👨‍👩‍👧‍👦 Personnes');
        });
        await t('« ↺ Remettre les noms comme au départ » : émojis d’origine', async () => {
            await design(); await p.click('[data-menu-names-reset]'); await p.waitForTimeout(300);
            assert.deepEqual(await stored(), {});
            assert.equal(await nav('fiches'), '📒 Fiches'); assert.equal(await nav('personnes'), 'Personnes'); assert.equal(await nav('ct_test01'), '🎯 Mon <img src=x onerror="window.__xss=1"> onglet');
        });
        await t('menu de choix en fenêtre : Échap ferme, même après avoir tapé', async () => {
            for (const typed of ['', 'zz']) {
                await p.evaluate(() => { window.__pick = 'pending'; window.LCNDA_EXT.pickMyGraph({ title: 'Test' }).then(v => { window.__pick = v; }); });
                await p.waitForSelector('.pk-dialog .pk-input');
                if (typed) { await p.keyboard.type(typed); await p.waitForTimeout(600); }
                for (let i = 0; i < 3 && await p.$('.pk-dialog'); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(250); }
                assert.equal(await p.$$eval('dialog[open]', d => d.map(x => x.className).join(' | ')), '', `« ${typed} » : aucune fenêtre ouverte (ni « Fermer sans enregistrer ? »)`);
                assert.equal(await p.evaluate(() => window.__pick), null);
            }
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errors, []); });
    } finally { await browser.close(); proc.kill(); }
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
})();
