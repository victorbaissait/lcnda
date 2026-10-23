'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌐 Mon site web : 📂 ouvrir un dossier (un site déjà fait), les images du site, 📄 Pages et fichiers, ▾ Mes sites, ◧ ◨ panneaux.
 *   node tests/test-site-import.js
 *  1. un dossier : pages .html / .php à la racine, morceau PHP inclus, deux feuilles (une seule page pour la 2e), un script,
 *     une image dans images/ (rangée dans img/, adresses suivies), fichiers cachés et formats inconnus laissés de côté ;
 *  2. l'aperçu : l'image, les couleurs des deux feuilles, le vrai PHP de la page (include, variable) ;
 *  3. enregistré puis exporté : le .zip a chaque fichier à son chemin, l'image en vrais octets ;
 *  4. un serveur refuse une « image » qui n'en est pas une ;
 *  5. 📄 Pages montre les fichiers ; « Cours.php » devient une page PHP ; les panneaux se cachent et s'en souviennent ; ▾ Mes sites.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { console.log(`${failed ? '✗' : '✓'} site : dossier importé : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); };

(async () => {
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-import-')); fs.mkdirSync(path.join(dir, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const ctx = await browser.newContext({viewport: {width: 1440, height: 950}, acceptDownloads: true});
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    try {
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.siteWeb);
        await page.evaluate(() => localStorage.setItem('genealogie-site-web', JSON.stringify({view: 'split'})));
        let site = null;
        await t('📂 un dossier devient un site : pages, morceaux, feuilles, script, image', async () => {
            site = await page.evaluate(async () => {
                const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEJMDGgAQBOygIDKvpjbQAAAABJRU5ErkJggg==';
                const bin = Uint8Array.from(atob(png), c => c.charCodeAt(0));
                const mk = (path, content, type = 'text/plain') => { const f = new File([content], path.split('/').pop(), {type}); f.relPath = 'mon-vieux-site/' + path; return f; };
                const ed = await window.LCNDA_EXT.siteWeb.importFolder({}, [
                    mk('index.html', '<!doctype html><html><head><title>Accueil du club</title><link rel="stylesheet" href="css/style.css"><script src="js/script.js"></script></head><body><h1>Bienvenue</h1><img id="logo" src="images/logo.png" alt=""><a href="A_propos.php">À propos</a></body></html>'),
                    mk('A_propos.php', '<?php $annee = 2026; ?><!doctype html><html><head><title>À propos</title><link rel="stylesheet" href="css/extra.css"></head><body><?php include "includes/header.php"; ?><p id="an"><?= $annee ?></p><a href="index.html">Accueil</a></body></html>'),
                    mk('includes/header.php', '<header id="hd">En-tête commun</header>'),
                    mk('css/style.css', 'body{background:url(../images/logo.png)} h1{color:rgb(1, 2, 3)}'),
                    mk('css/extra.css', '#an{color:rgb(4, 5, 6)}'),
                    mk('js/script.js', 'document.documentElement.dataset.ok = 1;'),
                    mk('images/logo.png', bin, 'image/png'), mk('.DS_Store', 'x'), mk('notes.docx', 'x')]);
                await new Promise(res => setTimeout(res, 1200));
                const s = ed.site; return {name: ed.name, pages: s.pages.map(x => `${x.slug}.${x.ext}`), files: s.files.map(f => `${f.path}:${f.kind}:${f.pages.join(',')}`), css: s.css, js: s.js, html: s.pages.map(x => x.html)};
            });
            assert.equal(site.name, 'mon-vieux-site');
            assert.deepEqual(site.pages, ['index.html', 'a-propos.php']);
            assert.deepEqual(site.files.sort(), ['css/extra.css:css:a-propos', 'img/logo.png:image:', 'includes/header.php:php:']);
            assert.match(site.css, /url\(\.\.\/img\/logo\.png\)/);
            assert.match(site.html[0], /src="img\/logo\.png"/); assert.match(site.html[0], /href="a-propos\.php"/); assert.doesNotMatch(site.html[0], /<script/);
            assert.match(site.html[1], /<\?php \$annee = 2026; \?>/);
        });
        const fr = page.frameLocator('[data-sw-frame]');
        await t('l’aperçu : l’image du site, la feuille principale', async () => {
            assert.match(await fr.locator('#logo').getAttribute('src'), /^data:image\/png;base64,/);
            assert.equal(await fr.locator('h1').evaluate(e => getComputedStyle(e).color), 'rgb(1, 2, 3)');
        });
        await t('l’aperçu d’une page PHP : include, variable, feuille de cette page seulement', async () => {
            await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.goPage(1));
            await page.waitForTimeout(2500);
            assert.equal((await fr.locator('#an').textContent()).trim(), '2026');
            assert.equal((await fr.locator('#hd').textContent()).trim(), 'En-tête commun');
            assert.equal(await fr.locator('#an').evaluate(e => getComputedStyle(e).color), 'rgb(4, 5, 6)');
        });
        await t('enregistré, puis exporté : chaque fichier à son chemin, l’image en vrais octets', async () => {
            const id = await page.evaluate(async () => { const e = window.LCNDA_EXT.siteWeb.current; await e.save({quiet: true}); return e.id; });
            assert.ok(id > 0);
            const back = await page.evaluate(async id => (await window.LCNDA_APP.api('website', {id})).data, id);
            assert.equal(back.files.length, 3); assert.equal(back.pages[1].ext, 'php');
            const zipPath = path.join(dir, 'site.zip'); fs.writeFileSync(zipPath, await (await page.request.get(`${base}api.php?action=website_export&id=${id}&format=zip`)).body());
            const z = spawnSync('python3', ['-I', '-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({"names":z.namelist(),"png":z.read("img/logo.png")[:4].hex()}))', zipPath], {encoding: 'utf8'});
            const out = JSON.parse(z.stdout);
            for (const n of ['index.html', 'a-propos.php', 'includes/header.php', 'css/extra.css', 'img/logo.png', 'css/style.css', 'js/script.js']) assert.ok(out.names.includes(n), n);
            assert.equal(out.png, '89504e47');
        });
        await t('le serveur refuse une « image » qui n’en est pas une', async () => {
            const r = await page.evaluate(async () => { const e = window.LCNDA_EXT.siteWeb.current; const d = JSON.parse(JSON.stringify(e.site)); d.files.push({id: 'fbad', path: 'img/x.png', kind: 'image', content: '<script>alert(1)</script>', pages: []});
                const res = await window.LCNDA_APP.api('save_website', {}, {method: 'POST', body: {id: 0, name: 'piège', data: d}}); const id = Number((res.result || res).id); return (await window.LCNDA_APP.api('website', {id})).data.files.map(f => f.path); });
            assert.ok(!r.includes('img/x.png'));
        });
        await t('📄 Pages montre les fichiers ; « Cours.php » devient une page PHP', async () => {
            await page.evaluate(() => { const e = window.LCNDA_EXT.siteWeb.current; e.left = 'pages'; e.paintLeft(); });
            const names = await page.locator('.sw-files .sw-pagename b').allTextContents();
            for (const n of ['style.css', 'script.js', 'header.php', 'extra.css', 'logo.png']) assert.ok(names.some(x => x.includes(n)), n);
            const r = await page.evaluate(async () => { const e = window.LCNDA_EXT.siteWeb.current, A = window.LCNDA_APP, o = A.askText; A.askText = async () => 'Cours.php'; try { await e.addPage(); } finally { A.askText = o; } return `${e.page().name}=${e.page().slug}.${e.page().ext}`; });
            assert.equal(r, 'Cours=cours.php');
        });
        await t('◧ ◨ les panneaux se cachent, et s’en souviennent', async () => {
            await page.click('[data-sw-toggle="left"]'); await page.click('[data-sw-toggle="panel"]');
            assert.ok(await page.locator('[data-sw-leftpane]').isHidden()); assert.ok(await page.locator('[data-sw-panel]').isHidden());
            const pr = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-site-web'))); assert.equal(pr.leftHidden, true); assert.equal(pr.panelHidden, true);
            await page.click('[data-sw-toggle="left"]'); await page.click('[data-sw-toggle="panel"]');
        });
        await t('▾ Mes sites : les autres sites, nouveau site, ouvrir un dossier', async () => {
            await page.click('[data-sw-sites]'); await page.waitForSelector('.ui-actmenu');
            const items = await page.locator('.ui-actmenu-i b').allTextContents();
            assert.ok(items.includes('Nouveau site…') && items.includes('Ouvrir un dossier…')); assert.ok(items.includes('mon-vieux-site'));
            await page.keyboard.press('Escape');
        });
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errs, []));
    } finally { await browser.close(); proc.kill(); }
    finish();
})();
