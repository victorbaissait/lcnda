'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Le tour de tous les écrans (relecture avant la 0.9.1) :   node tests/test-audit-ecrans.js
 *  - chaque onglet du menu (aussi ceux cachés au départ), chaque entrée de la colonne de gauche de
 *    Listes, Graphiques, Carte, Enquêtes et Réglages, la fiche d'une personne et d'un animal (chaque section) ;
 *  - à 1440 px en clair et à 390 px en sombre : aucune erreur JavaScript (pageerror, console.error),
 *    aucune réponse 4xx / 5xx, pas de défilement de côté, pas de « undefined », « NaN », « [object Object] »
 *    affiché, pas de rond qui tourne sans fin ;
 *  - les jeux « Bataille navale » et « Câbles » mélangent bien les noms des ancêtres (avant : shuffle recevait la graine
 *    au lieu du tirage, l'erreur était avalée et les noms manquaient) ;
 *  - mode sombre : textes corrigés lisibles (dates des cases d'arbre, titre de la distribution, pastille d'itinéraire,
 *    avis « Fond OpenStreetMap indisponible », dates de la fiche choisie dans la colonne, nom du jeu des parties).
 * Navigateur : Playwright (sinon la partie navigateur est sautée). Captures : SHOTS=dossier node tests/test-audit-ecrans.js
 * Plus court : ECRANS=listes,maintenance node tests/test-audit-ecrans.js (seulement ces onglets).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const SHOTS = process.env.SHOTS || '';
const ONLY = (process.env.ECRANS || '').split(',').map(s => s.trim()).filter(Boolean);
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.message || e); } };

/* ─── statique : les corrections restent ─── */
(async () => {
    await t('statique : jeux — shuffle reçoit un tirage (rng), pas la graine', async () => {
        for (const f of ['assets/js/app-jeu-naval.js', 'assets/js/app-jeu-cables.js']) {
            const s = read(f);
            assert.ok(!/L\(\)\.shuffle\([^;]*,\s*c\.seed\)/.test(s), `${f} : shuffle(…, c.seed)`);
            assert.match(s, /L\(\)\.shuffle\([^;]*L\(\)\.rng\(c\.seed/, f);
        }
    });
    await t('statique : textes lisibles en sombre (diagrammes, carte, colonne, jeux) et compteurs gris lisibles en clair', async () => {
        const css = read('assets/css/app.css'), dg = read('assets/css/diagrams.css');
        assert.match(css, /\.card-head h3 small \{ color: var\(--muted\);/, 'compteur « (3) » des cartes : var(--muted), pas #aaa');
        assert.match(css, /\.map-stage\.has-tile-error::after \{[^}]*background: var\(--card-bg, white\); color: var\(--ink\);/);
        assert.match(css, /\.map-route-chip \{[^}]*background: var\(--card-bg, white\); color: var\(--ink\);/);
        assert.match(css, /:root\[data-theme="dark"\] \.saved-item\.is-active small \{ color: rgba\(255,255,255,\.8\); \}/);
        assert.match(css, /:root\[data-theme="dark"\] \.goose-side-menu \.side-button strong\+small\{color:color-mix/);
        assert.match(dg, /:root\[data-theme="dark"\] \.diagram-person small\{color:inherit/);
        assert.match(dg, /:root\[data-theme="dark"\] \.distribution-diagram\{color:#111\}/);
    });

    await t('statique : au démarrage, l’écran attend les autres fichiers (DOMContentLoaded) avant de se dessiner', async () => {
        const s = read('assets/js/app.js');
        assert.match(s, /var pageScriptsReady=new Promise\(ok=>\{const end=\(\)=>\{pageScriptsReady\.done=true;ok\(\);\};/);
        assert.match(s, /if\(pageScriptsReady&&!pageScriptsReady\.done\)\{await pageScriptsReady;if\(renderToken!==state\.workspaceToken\)return;\}\s*renderSidebar\(\);/);
    });

    let chromium = null;
    try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return finish(); }

    /* ─── une petite généalogie (beaucoup de listes vides : K10) ─── */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-ecrans-'));
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start) VALUES (1,'Jean','FAURE','male',1),(2,'Marie','LACHAUD','female',0),(3,'Pierre','FAURE','male',0),(4,'Rose','MAZEL','female',0),(5,'Louis','FAURE','male',0)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,3,4)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(1,5)");
$t = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',1,?,'3 mai 1850',1850),('person',3,?,'vers 1820',1820)")->execute([$t,$t]);
$pdo->exec("INSERT INTO sources(id,source_type,title) VALUES(1,'internet','Registre')");
require_once 'lib/pets.php'; save_pet($pdo, ['name' => 'Médor', 'species' => 'chien']);
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env, maxBuffer: 1 << 26 });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exitCode = 1; return; }

    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const people = (await (await fetch(base + 'api.php?action=people')).json()).people || [];
    const animalId = (people.find(p => p.kind === 'animal') || {}).id || 0;

    const browser = await chromium.launch();
    try {
        for (const V of [{ w: 1440, dark: false }, { w: 390, dark: true }]) {
            const tag = `${V.w} px ${V.dark ? 'sombre' : 'clair'}`;
            const ctx = await browser.newContext({ viewport: { width: V.w, height: V.w > 500 ? 900 : 844 } });
            await ctx.addInitScript(dark => {
                try { ['suivi', 'animaux', 'fiches', 'adn', 'tresors', 'documents', 'catalogue'].forEach(k => localStorage.setItem('genealogie-menu-' + k, '1')); } catch (_) {}
                if (!dark) return;
                let v; Object.defineProperty(window, 'LCNDA_SETTINGS', { configurable: true, get: () => v, set: x => { try { if (x && typeof x === 'object') { const d = JSON.parse(x['genealogie-design'] || '{}'); d.preset = 'dark'; x['genealogie-design'] = JSON.stringify(d); } } catch (_) {} v = x; } });
                try { const d = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); d.preset = 'dark'; localStorage.setItem('genealogie-design', JSON.stringify(d)); } catch (_) {}
            }, V.dark);
            await ctx.route(u => !u.href.startsWith(base), r => r.abort()); // pas d'internet : tuiles, polices…
            const page = await ctx.newPage();
            let errs = [];
            page.on('pageerror', e => errs.push('pageerror ' + e.message));
            page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console.error ' + m.text().slice(0, 300)); });
            page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) errs.push(`HTTP ${r.status()} ${r.url().slice(base.length)}`); });
            page.on('dialog', d => { errs.push('fenêtre du navigateur ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
            await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, { timeout: 30000 });
            await page.waitForTimeout(800);
            if (V.dark) assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'le mode sombre est appliqué');
            const problems = [];
            const check = async id => {
                try { await page.waitForFunction(() => ![...document.querySelectorAll('#workspace .ui-spinner,#workspace .loading-screen')].some(e => e.offsetParent), null, { timeout: 12000 }); } catch (_) { errs.push('rond qui tourne encore après 12 s'); }
                await page.waitForTimeout(150);
                const info = await page.evaluate(() => {
                    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
                    const txt = (document.querySelector('#workspace')?.innerText || '') + '\n' + (document.querySelector('#sidebar')?.innerText || '');
                    const m = txt.match(/(^|[^\w-])(undefined|NaN|\[object Object\])(?![\w-])/);
                    return { over: sw > innerWidth + 1 ? sw : 0, bad: m ? txt.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ') : '' };
                });
                if (info.over) errs.push(`défile de côté (${info.over} px pour ${V.w})`);
                if (info.bad) errs.push(`texte affiché : « ${info.bad} »`);
                if (errs.length) problems.push(`${id} → ${errs.slice(0, 3).join(' ¦ ')}`);
                if (SHOTS && errs.length) await page.screenshot({ path: path.join(SHOTS, `ecrans_${V.w}${V.dark ? 'd' : 'c'}_${id.replace(/[^\w-]+/g, '_')}.png`) }).catch(() => {});
                errs = [];
            };
            const go = async hash => { await page.evaluate(h => { document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch (_) {} }); location.hash = h; }, hash); await page.waitForTimeout(350); };
            const modules = ['dashboard', 'personnes', 'animaux', 'suivi', 'documents', 'catalogue', 'graphiques', 'carte', 'listes', 'chronologie', 'recherche', 'enquetes', 'fiches', 'adn', 'comparaison', 'tresors', 'maintenance', 'jeu'].filter(m => !ONLY.length || ONLY.includes(m));
            let screens = 0;
            for (const m of modules) {
                await go('#' + m);
                await page.waitForFunction(m => window.LCNDA_APP.state.module === (m === 'animaux' ? 'personnes' : m), m, { timeout: 8000 }).catch(() => errs.push('onglet pas ouvert'));
                await check(m); screens++;
                if (!['graphiques', 'carte', 'listes', 'enquetes', 'maintenance'].includes(m)) continue;
                const sides = await page.$$eval('#sidebar-content [data-side-value]', l => l.map(x => x.dataset.sideValue));
                for (const s of sides) {
                    const ok = await page.evaluate(v => { const el = [...document.querySelectorAll('#sidebar-content [data-side-value]')].find(x => x.dataset.sideValue === v); if (!el) return false; el.click(); return true; }, s);
                    if (!ok) { errs.push('entrée introuvable'); }
                    await page.waitForTimeout(450);
                    await check(`${m}/${s}`); screens++;
                }
            }
            if (!ONLY.length || ONLY.includes('fiches-personnes')) {
                for (const s of ['', 'identite', 'famille', 'vie', 'documents', 'tout']) { await go(`#personnes/1${s ? '/' + s : ''}`); await page.waitForTimeout(700); await check('fiche personne ' + (s || '(départ)')); screens++; }
                if (animalId) for (const s of ['', 'fiche', 'bagues-et-marques', 'observations', 'sante', 'groupe', 'carte', 'tout']) { await go(`#personnes/${animalId}${s ? '/' + s : ''}`); await page.waitForTimeout(700); await check('fiche animal ' + (s || '(départ)')); screens++; }
            }
            await t(`${tag} : ${screens} écrans sans erreur ni débordement`, async () => { assert.ok(screens > 20 || ONLY.length, `seulement ${screens} écrans`); assert.deepEqual(problems, []); });

            if (!ONLY.length) {
                await t(`${tag} : fenêtres principales (nouvelle personne, imprimer, importer, versions, choix d’image) s’ouvrent et se ferment`, async () => {
                    const opened = [], wprob = [];
                    for (const [name, js] of [
                        ['Nouvelle personne', () => window.LCNDA_APP.openNewPersonDialog()],
                        ['Imprimer', () => { window.LCNDA_UI.printPage('Liste'); }],
                        ['Importer', () => { window.LCNDA_UI.openImportDialog({ title: 'Importer un essai', accept: '.csv', analyze: async () => ({ count: 1 }), run: async () => ({}) }); }],
                        ['Versions', () => { window.LCNDA_UI.openVersions({ title: 'Essai', tool: 'Essai', kind: 'text', list: async () => [], now: {} }); }],
                        ['Choisir une image', () => { window.LCNDA_APP.openMediaPicker({}); }],
                    ]) {
                        await go('#listes'); await page.waitForTimeout(300);
                        await page.evaluate(js); await page.waitForTimeout(900);
                        const n = await page.evaluate(() => document.querySelectorAll('dialog[open]').length);
                        if (n) opened.push(name);
                        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
                        if (errs.length) wprob.push(`${name} → ${errs.join(' ¦ ')}`); errs = [];
                    }
                    assert.deepEqual(wprob, []);
                    assert.equal(opened.length, 5, 'ouvertes : ' + opened.join(', '));
                });
                await t(`${tag} : Bataille navale et Câbles démarrent avec les noms des ancêtres, sans erreur avalée`, async () => {
                    for (const g of ['naval', 'cables']) {
                        await go('#jeu'); await page.waitForTimeout(800);
                        await page.evaluate(() => document.querySelector('[data-goose-new]')?.click()); await page.waitForTimeout(600);
                        await page.evaluate(g => { const s = document.querySelector('#workspace select[name=variant]'); s.value = g; s.dispatchEvent(new Event('change', { bubbles: true })); }, g);
                        await page.waitForTimeout(900);
                        const cdp = await ctx.newCDPSession(page); const caught = [];
                        await cdp.send('Debugger.enable'); await cdp.send('Debugger.setPauseOnExceptions', { state: 'all' });
                        cdp.on('Debugger.paused', async ev => { const d = ev.data?.description || ''; if (/^TypeError/.test(d)) caught.push(d.split('\n').slice(0, 2).join(' ')); await cdp.send('Debugger.resume').catch(() => {}); });
                        await page.evaluate(() => { const b = [...document.querySelectorAll('#workspace button')].find(b => /^(Démarrer|Lancer|Commencer|Jouer)/.test(b.textContent.trim())); b?.click(); });
                        await page.waitForTimeout(2200);
                        await cdp.send('Debugger.setPauseOnExceptions', { state: 'none' }); await cdp.detach();
                        assert.deepEqual(caught.filter(c => /shuffle|rand is not a function/.test(c)), [], g);
                        assert.deepEqual(errs, [], g); errs = [];
                    }
                });
                if (V.dark) await t('sombre : textes corrigés lisibles (contraste ≥ 3)', async () => {
                    const ratio = await page.evaluate(() => {
                        const rgb = c => (c.match(/[\d.]+/g) || []).map(Number);
                        const L = a => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(a[0]) + .7152 * f(a[1]) + .0722 * f(a[2]); };
                        const cr = (a, b) => { const x = L(rgb(a)), y = L(rgb(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
                        const host = document.createElement('div'); document.body.appendChild(host);
                        host.innerHTML = '<div class="special-diagram"><div class="diagram-person gender-male" style="position:static;transform:none"><strong>A</strong><small>1900</small></div></div><div class="distribution-diagram"><header><h2>T</h2></header></div><div class="map-route-chip">J</div><div class="person-list-item is-active"><span class="person-list-copy"><small>1900</small></span></div>';
                        const bgOf = e => { while (e) { const c = getComputedStyle(e).backgroundColor; const a = rgb(c); if (a.length && (a[3] === undefined || a[3] > .5)) return c; e = e.parentElement; } return 'rgb(26,26,26)'; };
                        const out = {};
                        for (const [k, s] of [['dates des cases', '.diagram-person small'], ['titre distribution', '.distribution-diagram h2'], ['pastille itinéraire', '.map-route-chip'], ['dates fiche choisie', '.person-list-item.is-active small']]) { const e = host.querySelector(s); out[k] = Math.round(cr(getComputedStyle(e).color, bgOf(e)) * 10) / 10; }
                        host.remove(); return out;
                    });
                    for (const [k, r] of Object.entries(ratio)) assert.ok(r >= 3, `${k} : contraste ${r}`);
                });
            }
            await ctx.close();
        }
        await t('démarrage lent : un écran venu d’un autre fichier (Outils de modification, 📒 Fiches) attend ce fichier (pas d’« ERREUR … map », pas de rond sans fin)', async () => {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
            await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-menu-fiches', '1'); } catch (_) {} });
            await ctx.route(u => !u.href.startsWith(base), r => r.abort());
            await ctx.route(/heritage-(edittools|fiches)\.js/, async r => { await new Promise(x => setTimeout(x, 2000)); await r.continue(); });
            const page = await ctx.newPage(); const pe = []; page.on('pageerror', e => pe.push(e.message));
            await page.goto(base + '?a=1#listes'); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, { timeout: 30000 }); await page.waitForTimeout(3000);
            await page.evaluate(() => { window.LCNDA_APP.state.listType = 'edit_tools'; return window.LCNDA_APP.setModule('listes'); }); await page.waitForTimeout(1500);
            for (const hash of ['#listes', '#fiches']) {
                await page.goto(base + '?a=2' + hash); await page.waitForTimeout(5500);
                const txt = await page.evaluate(() => document.querySelector('#workspace').innerText);
                assert.ok(!/ERREUR|reading 'map'|Préparation de la vue/.test(txt), `${hash} : ${txt.replace(/\s+/g, ' ').slice(0, 120)}`);
            }
            assert.deepEqual(pe, []);
            await ctx.close();
        });
    } finally {
        await browser.close();
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    finish();
})().catch(e => { console.error(e); process.exitCode = 1; });

function finish() {
    if (failed) { process.exitCode = 1; console.log(`Échec : ${failed} vérification(s) en erreur, ${passed} bonnes`); }
    else console.log(`✓ tour des écrans : ${passed} vérifications`);
}
