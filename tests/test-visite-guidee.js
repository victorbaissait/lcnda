'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ▶ Visite guidée (assets/js/app-visite.js, assets/css/visite.css) :   node tests/test-visite-guidee.js
 * Une petite base neuve, un vrai « php -S » et un navigateur (Playwright ; sinon la partie navigateur est sautée) :
 *  1. fichiers : script et style chargés par index.php, bouton « ▶ Relancer la visite guidée » de la FAQ, entrée FAQ ;
 *  2. LCNDA_APP.startTour() : 6 étapes, chacune entoure son vrai bouton (halo, 4 panneaux sombres), « n / 6 », aria-live ;
 *     → ← au clavier, « Précédent » éteint à la première, « ✓ Terminer » à la dernière, « déjà vue » retenue ;
 *  3. faire pour de vrai : clic sur « ＋ Nouvelle fiche » → la visite attend la fenêtre, la fiche créée → étape 2 sur cette fiche ;
 *  4. un bouton caché : l'étape est sautée (3 → 4) ; Échap = « Passer la visite » ;
 *  5. offer() : l'invitation au premier lancement, une seule fois ; « Ne plus proposer » ;
 *  6. jamais en mode consultation ni en mode simple ; FAQ → « ▶ Relancer la visite guidée » ; recherche rapide ;
 *  7. 390 px sans défilement de côté, bulle dans l'écran ; mode sombre ; « Réduire les animations » ; aucune erreur JavaScript,
 *     aucun POST tant qu'on ne fait que regarder.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 6).join('\n    ')); } };

(async () => {
    console.log('Fichiers');
    await t('index.php charge app-visite.js et visite.css ; FAQ et recherche rapide la relancent', () => {
        const idx = read('index.php');
        assert.match(idx, /assets\/js\/app-visite\.js\?v=\d+/);
        assert.match(idx, /assets\/css\/visite\.css\?v=\d+/);
        assert.match(read('assets/js/app-maintenance.js'), /data-tour-start>▶ Relancer la visite guidée</);
        assert.match(read('assets/js/heritage-more.js'), /Comment revoir la visite guidée/);
        assert.match(read('assets/js/app.js'), /startTour\?\.\(\{force:true\}\)/);
        const js = read('assets/js/app-visite.js');
        assert.ok(!/\bconfirm\(|\balert\(/.test(js), 'pas de confirm() ni alert()');
        assert.match(read('assets/css/visite.css'), /a11y-calm/);
        assert.match(read('assets/css/visite.css'), /prefers-reduced-motion/);
    });

    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-visite-'));
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const SEED = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:' . DATA_DIR . '/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT . '/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php';
$pdo = db();
foreach ([['Jean','MARTIN','male','deceased',1],['Louise','BORIE','female','deceased',0]] as [$f,$l,$g,$s,$st]) $pdo->prepare('INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES(?,?,?,?,?)')->execute([$f,$l,$g,$s,$st]);
echo 'ok';`;
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', SEED], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.VISITE_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    let browser = null;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, rt => rt.abort());
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
        const posts = []; page.on('request', rq => { if (!/^(GET|HEAD)$/.test(rq.method())) posts.push(rq.method() + ' ' + rq.url()); });
        const load = async (hash = '#personnes') => {
            await page.goto(base + hash);
            await page.waitForFunction(() => window.LCNDA_EXT?.tour && window.LCNDA_APP?.state && document.querySelector('#workspace .person-page'), null, { timeout: 30000 });
        };
        const shown = () => page.waitForSelector('.vg-root:not([hidden]) .vg-bubble', { timeout: 10000 });
        const info = () => page.evaluate(() => {
            const q = s => document.querySelector(s), halo = q('.vg-halo').getBoundingClientRect(), bub = q('.vg-bubble').getBoundingClientRect();
            const ok = window.__vgTarget = (() => { const x = halo.left + halo.width / 2, y = halo.top + halo.height / 2; const el = document.elementFromPoint(x, y); return el ? (el.closest('button,a')?.outerHTML || '').slice(0, 120) : ''; })();
            return { title: q('.vg-title').textContent, count: q('.vg-count').textContent, live: q('.vg-live').textContent, prevDisabled: q('[data-vg="prev"]').disabled, next: q('[data-vg="next"]').textContent,
                target: ok, dims: [...document.querySelectorAll('[data-vg-dim]')].filter(d => d.offsetWidth || d.offsetHeight).length,
                bub: [bub.left, bub.top, bub.right, bub.bottom], vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, focus: document.activeElement?.dataset?.vg || '' };
        });

        console.log('Navigateur');
        await load();
        await page.evaluate(() => localStorage.removeItem('genealogie-visite-guidee'));
        await t('6 étapes au clavier : chaque bulle entoure le vrai bouton, « n / 6 », aria-live, « Terminer » à la fin', async () => {
            assert.equal(await page.evaluate(() => window.LCNDA_APP.startTour()), true);
            const want = [['Créer une fiche', /id="new-person"/], ['Ajouter un parent', /data-add-relation="parent"|data-empty-click/], ['Ajouter une photo', /data-add-media-inline|data-empty-click/],
                ['Un événement et son lieu', /data-add-event-inline/], ['Faire une sauvegarde', /export_full_backup/], ['Les Réglages et l’aide', /data-module="maintenance"/]];
            for (let i = 0; i < want.length; i++) {
                await shown(); await page.waitForTimeout(250);
                const s = await info();
                assert.equal(s.title, want[i][0]); assert.equal(s.count, `${i + 1} / 6`);
                assert.match(s.target, want[i][1], `étape ${i + 1} : le halo entoure ${s.target}`);
                assert.equal(s.dims, 4, 'le reste est assombri en 4 panneaux');
                assert.match(s.live, new RegExp(`étape ${i + 1} sur 6`));
                assert.equal(s.prevDisabled, i === 0);
                assert.equal(s.next, i === 5 ? '✓ Terminer' : 'Suivant →');
                assert.equal(s.focus, 'next', 'le curseur est sur « Suivant »');
                assert.ok(s.bub[0] >= 0 && s.bub[2] <= s.vw && s.bub[1] >= 0 && s.bub[3] <= s.vh, 'bulle dans l’écran');
                if (i === 2) { await page.keyboard.press('ArrowLeft'); await shown(); await page.waitForTimeout(250); assert.equal((await info()).count, '2 / 6'); await page.keyboard.press('ArrowRight'); await shown(); await page.waitForTimeout(250); }
                await page.keyboard.press('ArrowRight');
                await page.waitForTimeout(200);
            }
            await page.waitForFunction(() => !window.LCNDA_EXT.tour.isActive());
            const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-visite-guidee')));
            assert.equal(saved.seen, true); assert.equal(saved.how, 'done');
            assert.equal(await page.evaluate(() => !!document.querySelector('.vg-root')), false, 'tout est retiré');
            // seuls les réglages d'écran que l'app garde toute seule en changeant d'écran (dernier écran, onglet) : aucune donnée touchée
            assert.deepEqual(posts.filter(x => !/action=save_settings$/.test(x)), [], 'aucun POST en regardant seulement');
        });

        await t('offer() : invitation au premier lancement, jamais deux fois ; « Ne plus proposer »', async () => {
            assert.equal(await page.evaluate(() => window.LCNDA_EXT.tour.offer()), false, 'déjà vue : pas d’invitation');
            await page.evaluate(() => window.LCNDA_EXT.tour.forget());
            assert.equal(await page.evaluate(() => window.LCNDA_APP.offerTour()), true);
            await shown();
            assert.equal(await page.textContent('.vg-title'), 'Une petite visite ?');
            assert.ok(await page.isVisible('[data-vg="go"]'));
            await page.click('[data-vg="never"]');
            assert.equal(await page.evaluate(() => window.LCNDA_EXT.tour.isActive()), false);
            assert.equal(await page.evaluate(() => window.LCNDA_EXT.tour.offer()), false, 'refusée : plus proposée');
            await page.evaluate(() => window.LCNDA_EXT.tour.forget());
            await page.evaluate(() => window.LCNDA_EXT.tour.offer()); await shown();
            await page.click('[data-vg="go"]'); await shown(); await page.waitForTimeout(200);
            assert.equal((await info()).count, '1 / 6', '▶ Commencer lance la visite');
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => window.LCNDA_EXT.tour.isActive()), false, 'Échap = Passer la visite');
            assert.equal(await page.evaluate(() => window.LCNDA_EXT.tour.seen()), true);
        });

        await t('faire pour de vrai : « ＋ Nouvelle fiche » → la visite attend la fenêtre → étape 2 sur la fiche créée', async () => {
            await page.evaluate(() => window.LCNDA_APP.startTour()); await shown(); await page.waitForTimeout(200);
            await page.click('#new-person');
            await page.waitForSelector('#person-dialog[open]');
            assert.equal(await page.evaluate(() => document.querySelector('.vg-root').hidden), true, 'la bulle se cache pendant la fenêtre');
            await page.fill('#person-form [name=first_name]', 'Visite');
            await page.fill('#person-form [name=last_name]', 'ESSAI');
            await page.click('#person-dialog .modal-actions [type=submit]');
            await page.waitForFunction(() => /Visite/.test(document.querySelector('#workspace .person-hero h2')?.textContent || ''), null, { timeout: 15000 });
            await shown(); await page.waitForTimeout(250);
            const s = await info();
            assert.equal(s.count, '2 / 6'); assert.equal(s.title, 'Ajouter un parent');
            await page.click('[data-vg="skip"]');
        });

        await t('un bouton caché : l’étape est sautée proprement (2 → 4)', async () => {
            await page.addStyleTag({ content: '[data-add-media-inline],[data-empty-click="[data-add-media-inline]"]{display:none!important}' });
            await page.evaluate(() => window.LCNDA_APP.startTour({ at: 1 })); await shown(); await page.waitForTimeout(200);
            assert.equal((await info()).count, '2 / 6');
            await page.click('[data-vg="next"]'); await page.waitForTimeout(3600); await shown();
            assert.equal((await info()).count, '4 / 6', 'la photo est sautée');
            await page.click('[data-vg="prev"]'); await page.waitForTimeout(3600); await shown();
            assert.equal((await info()).count, '2 / 6', 'en arrière aussi');
            await page.click('[data-vg="skip"]');
        });

        await t('jamais en mode consultation ni en mode simple', async () => {
            await page.evaluate(() => document.body.classList.add('is-kiosk'));
            assert.equal(await page.evaluate(() => window.LCNDA_APP.startTour()), false);
            await page.evaluate(() => document.body.classList.remove('is-kiosk'));
            await page.evaluate(() => window.LCNDA_APP.startTour()); await shown();
            await page.evaluate(() => document.documentElement.classList.add('ms-open'));
            await page.waitForFunction(() => !window.LCNDA_EXT.tour.isActive(), null, { timeout: 3000 });
            assert.equal(await page.evaluate(() => window.LCNDA_APP.startTour()), false);
            await page.evaluate(() => document.documentElement.classList.remove('ms-open'));
        });

        await t('Réglages → FAQ / tuto → « ▶ Relancer la visite guidée »', async () => {
            await page.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'faq'; A.setModule('maintenance'); });
            await page.waitForSelector('#workspace [data-tour-start]');
            await page.click('#workspace [data-tour-start]');
            await shown(); await page.waitForTimeout(200);
            assert.equal((await info()).count, '1 / 6');
            await page.keyboard.press('Escape');
        });

        await t('390 px, mode sombre, « Réduire les animations »', async () => {
            await page.setViewportSize({ width: 390, height: 844 });
            await page.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({ ...A.readDesignSettings(), preset: 'dark' })); A.applyDesign(); document.documentElement.classList.add('a11y-calm'); });
            await load();
            for (const at of [0, 1, 3]) {
                await page.evaluate(a => window.LCNDA_APP.startTour({ at: a }), at); await shown(); await page.waitForTimeout(250);
                const s = await info();
                assert.equal(s.count, `${at + 1} / 6`);
                assert.ok(s.sw <= 390, 'pas de défilement de côté');
                assert.ok(s.bub[0] >= 15 && s.bub[2] <= 375, 'bulle à 16 px des bords');
                await page.screenshot({ path: path.join(tmp, `visite-390-${at}.png`) });
                await page.keyboard.press('Escape');
            }
            const look = await page.evaluate(async () => { window.LCNDA_APP.startTour(); await new Promise(r => setTimeout(r, 600)); const b = getComputedStyle(document.querySelector('.vg-bubble')), h = getComputedStyle(document.querySelector('.vg-halo')); return { bg: b.backgroundColor, color: b.color, anim: h.animationName, dur: h.animationDuration }; });
            assert.notEqual(look.bg, 'rgb(255, 255, 255)', 'bulle sombre en mode sombre');
            assert.ok(look.anim === 'none' || parseFloat(look.dur) < 0.01, 'pas de halo qui bat');
            await page.keyboard.press('Escape');
        });

        await t('aucune erreur JavaScript', () => { assert.deepEqual(errors, [], errors.join(' | ')); });
    } finally {
        if (browser) await browser.close();
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
        console.log(`${pass} bons, ${fail} ratés`);
        if (fail) process.exitCode = 1;
    }
})().catch(e => { console.error(e); process.exit(1); });
