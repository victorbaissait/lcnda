#!/usr/bin/env node
/* 📄 Documents : les personnes reliées sous le titre (« Jean MAZAUD, Marie LACOMBE +3 »), « 👤 Par personne », la recherche par
 * nom, le réglage « ⋯ Sous le titre », le clic droit, les vivants masqués en mode consultation, rien qui dépasse en vue étroite.
 *   node tests/test-documents-personnes.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n  ')); } };

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-docs-pers-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    // des noms fictifs ; Claire VIVANTE est vivante, Paul SECRET a une fiche confidentielle
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$ins = $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,?)");
$P = [];
foreach ([['Jean','MAZAUD','male','deceased'],['Marie','LACOMBE','female','deceased'],['Pierre','MAZAUD','male','deceased'],['Louise','FAURE','female','deceased'],['Antoine','BESSE','male','deceased'],['Rose','MAZAUD','female','deceased'],['Claire','VIVANTE','female','living'],['Paul','SECRET','male','deceased']] as [$f,$l,$g,$s]) { $ins->execute([$f,$l,$g,$s]); $P[$f] = (int) $pdo->lastInsertId(); }
$pdo->prepare("UPDATE persons SET is_private=1 WHERE id=?")->execute([$P['Paul']]);
if (function_exists('imagecreatetruecolor')) { $im = imagecreatetruecolor(300, 400); imagefill($im, 0, 0, imagecolorallocate($im, 150, 130, 170)); imagejpeg($im, MEDIA_DIR . '/d.jpg'); } else { file_put_contents(MEDIA_DIR . '/d.jpg', 'x'); }
$m = $pdo->prepare("INSERT INTO media(title, filename, thumbnail, media_type, date_text) VALUES(?,?,?,?,?)");
$l = $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id) VALUES(?, 'person', ?)");
$ids = [];
foreach ([['Acte de mariage Mazaud – Lacombe avec un titre vraiment très long pour la colonne étroite', '1908', ['Jean','Marie']],
          ['Album de famille', '', ['Jean','Marie','Pierre','Louise','Antoine']], ['Bail de la ferme du Puy', '1897', []],
          ['Lettre de Jean à Marie', '12 mars 1916', ['Jean','Marie','Claire']], ['Portrait de Claire', '2001', ['Claire']],
          ['Dossier de Paul', '1950', ['Paul']], ['Photo de classe', '', []]] as [$t, $d, $pp]) {
    $m->execute([$t, 'd.jpg', 'd.jpg', 'image', $d]); $id = (int) $pdo->lastInsertId(); $ids[$t] = $id;
    foreach ($pp as $f) $l->execute([$id, $P[$f]]);
}
echo json_encode(['ids' => $ids, 'P' => $P]);`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0 || !/\{"ids"/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    const {ids} = JSON.parse(r.stdout.slice(r.stdout.indexOf('{"ids"')));
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const kioskOn = on => { const f = path.join(tmp, 'consultation.json'); if (on) fs.writeFileSync(f, JSON.stringify({hash: 'x', since: '2026-11-21'})); else if (fs.existsSync(f)) fs.unlinkSync(f); };
    const browser = await chromium.launch();
    const errs = [];
    const open = async (vp, prefs = {}) => {
        const ctx = await browser.newContext({viewport: vp, deviceScaleFactor: 1});
        await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|tile|openstreetmap/, x => x.abort());
        const page = await ctx.newPage();
        page.on('pageerror', e => errs.push(e.message));
        await page.goto(base, {waitUntil: 'load'});
        await page.waitForFunction(() => window.LCNDA_APP?.api && window.LCNDA_EXT?.onglets?.documents, null, {timeout: 30000});
        await page.evaluate(p => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); localStorage.setItem('genealogie-documents-tab', JSON.stringify(p)); }, prefs);
        await page.evaluate(() => { location.hash = '#documents'; });
        await page.reload({waitUntil: 'load'});
        await page.waitForSelector('#sidebar-content [data-ong-doc]', {timeout: 30000});
        return {ctx, page};
    };
    const row = (page, title) => page.locator('#sidebar-content [data-ong-doc]', {hasText: title}).first();
    const rowText = async (page, title) => (await row(page, title).innerText()).replace(/\s+/g, ' ').trim();
    const search = async (page, q) => { const inp = page.locator('#sidebar-content .ui-listbar input[type="search"], #sidebar-content .ui-listbar input').first(); await inp.fill(q); await page.waitForTimeout(500); };
    const titles = page => page.$$eval('#sidebar-content .ong-list [data-ong-doc] strong', b => b.map(x => x.textContent.trim()));
    try {
        await t('serveur : tous les noms d’un document (pour chercher), le nombre, nom et prénom à part', async () => {
            const L = await (await fetch(base + 'api.php?action=onglets&op=documents')).json();
            const album = L.documents.find(d => d.id === ids['Album de famille']);
            assert.equal(album.people_count, 5); assert.equal(album.people.length, 5, 'tous les noms, pas 4');
            assert.ok(album.people.every(p => p.last && p.first), 'nom de famille et prénom');
        });

        let {ctx, page} = await open({width: 1440, height: 900});
        await t('A → Z : les noms des personnes sous le titre, « +N » au-delà de deux, la date gardée, la sorte en pastille', async () => {
            const lettre = await rowText(page, 'Lettre de Jean à Marie');
            assert.match(lettre, /Marie LACOMBE, Jean MAZAUD/, lettre);
            assert.match(lettre, /\+1/, 'Claire VIVANTE comptée (hors consultation) : ' + lettre);
            assert.match(lettre, /12 mars 1916/, 'la date reste : ' + lettre);
            assert.doesNotMatch(lettre, /\d+ personnes?/, 'plus de « N personnes »');
            const album = await rowText(page, 'Album de famille');
            assert.match(album, /\+3/, album); assert.match(album, /Sans date/, album);
            assert.equal(await row(page, 'Album de famille').locator('.ui-badge.ong-type').count(), 1, 'la sorte est une pastille K8');
            const bail = await rowText(page, 'Bail de la ferme du Puy');
            assert.match(bail, /1897/); assert.doesNotMatch(bail, /MAZAUD|LACOMBE/);
            const badge = await page.$eval('#sidebar-content .ong-type', b => { const s = getComputedStyle(b); return {shadow: s.boxShadow, size: parseFloat(s.fontSize), own: b.closest('[data-ong-doc]').querySelectorAll('button').length}; });
            assert.equal(badge.shadow, 'none', 'la pastille n’a pas d’ombre (pas l’air d’un bouton)');
            assert.ok(badge.size < 11, 'la pastille en petit dans la colonne : ' + badge.size);
            assert.equal(badge.own, 0, 'aucun bouton dans la ligne (la pastille n’en est pas un)');
        });
        await t('« Chercher… » trouve un document par le nom d’une personne (même au-delà des deux noms montrés)', async () => {
            await search(page, 'besse');
            assert.deepStrictEqual(await titles(page), ['Album de famille']);
            await search(page, 'jean mazaud');
            const tt = await titles(page);
            assert.ok(tt.includes('Lettre de Jean à Marie') && tt.some(x => /^Acte de mariage/.test(x)) && tt.includes('Album de famille') && tt.length === 3, tt.join(' | '));
            await search(page, '');
        });
        await t('« ⋯ Sous le titre » : un menu de choix unique (tout conseillé par défaut, les personnes, la date et le lieu)', async () => {
            await page.click('#sidebar-content [data-ong-under]');
            await page.waitForSelector('.ui-actmenu .ui-actmenu-i');
            const items = await page.$$eval('.ui-actmenu .ui-actmenu-i', b => b.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
            assert.equal(items.length, 5, 'les 3 choix « Sous le titre », puis les 2 façons de ranger (A, B)'); assert.match(items[0], /^✓.*conseillé/, items[0]); assert.match(items[3], /^●.*6 cases/, items[3]); assert.match(items[4], /4 cases/, items[4]);
            await page.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'La date et le lieu'}).click();
            let lettre = await rowText(page, 'Lettre de Jean à Marie');
            assert.doesNotMatch(lettre, /MAZAUD/, lettre); assert.match(lettre, /12 mars 1916/);
            await page.click('#sidebar-content [data-ong-under]');
            await page.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Les personnes reliées'}).click();
            lettre = await rowText(page, 'Lettre de Jean à Marie');
            assert.match(lettre, /MAZAUD/); assert.doesNotMatch(lettre, /1916/, lettre);
            assert.match(await rowText(page, 'Bail de la ferme du Puy'), /1897/, 'sans personne : la date à la place');
            const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-documents-tab')).under);
            assert.equal(kept, 'people', 'le choix est retenu');
            await page.click('#sidebar-content [data-ong-under]');
            await page.locator('.ui-actmenu .ui-actmenu-i').first().click();
            assert.match(await rowText(page, 'Lettre de Jean à Marie'), /MAZAUD.*1916/);
        });
        await t('clic droit sur un document : Ouvrir, Modifier, Télécharger et les fiches des personnes', async () => {
            await row(page, 'Lettre de Jean à Marie').click({button: 'right'});
            await page.waitForSelector('.ui-actmenu .ui-actmenu-i');
            const items = await page.$$eval('.ui-actmenu .ui-actmenu-i', b => b.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
            assert.ok(/Ouvrir/.test(items[0]) && items.some(x => /Modifier/.test(x)) && items.some(x => /Télécharger/.test(x)), items.join(' | '));
            assert.ok(items.some(x => /Jean MAZAUD/.test(x)) && items.some(x => /Marie LACOMBE/.test(x)), items.join(' | '));
            await page.keyboard.press('Escape');
        });
        await t('👤 Par personne : nom de famille puis prénom, un document sous chaque personne, « Sans personne » à la fin, lettres, recherche', async () => {
            await page.click('#sidebar-content [data-ong-mode="people"]');
            await page.waitForSelector('#sidebar-content .ong-ph');
            const heads = await page.$$eval('#sidebar-content .ong-ph > span', b => b.map(x => x.textContent.replace('👤', '').trim()));
            assert.deepStrictEqual(heads, ['Antoine BESSE', 'Louise FAURE', 'Marie LACOMBE', 'Jean MAZAUD', 'Pierre MAZAUD', 'Paul SECRET', 'Claire VIVANTE', 'Sans personne'], heads.join(' | '));
            const under = await page.evaluate(() => { const out = {}; let cur = ''; document.querySelectorAll('#sidebar-content .ong-list .ong-ph, #sidebar-content .ong-list [data-ong-doc]').forEach(e => { if (e.matches('.ong-ph')) { cur = e.querySelector('span').textContent.replace('👤', '').trim(); out[cur] = []; } else out[cur].push(e.querySelector('strong').textContent.trim()); }); return out; });
            assert.deepStrictEqual(under['Jean MAZAUD'].sort(), ['Acte de mariage Mazaud – Lacombe avec un titre vraiment très long pour la colonne étroite', 'Album de famille', 'Lettre de Jean à Marie'].sort());
            assert.ok(under['Marie LACOMBE'].includes('Lettre de Jean à Marie'), 'la lettre est aussi sous Marie');
            assert.deepStrictEqual(under['Sans personne'].sort(), ['Bail de la ferme du Puy', 'Photo de classe']);
            const letters = await page.evaluate(() => ({b: !document.querySelector('[data-ong-letter="B"]').disabled, m: !document.querySelector('[data-ong-letter="M"]').disabled, a: document.querySelector('[data-ong-letter="A"]').disabled}));
            assert.deepStrictEqual(letters, {b: true, m: true, a: true}, 'lettres des noms de famille');
            await page.click('[data-ong-letter="M"]');
            assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-ong-doc]')?.dataset.letter), 'M', 'la lettre M saute aux MAZAUD');
            await search(page, 'faure');
            const h2 = await page.$$eval('#sidebar-content .ong-ph > span', b => b.map(x => x.textContent.replace('👤', '').trim()));
            assert.ok(h2.includes('Louise FAURE') && !h2.includes('Sans personne'), h2.join(' | '));
            assert.deepStrictEqual([...new Set(await titles(page))], ['Album de famille']);
            await search(page, '');
            await page.click('#sidebar-content [data-ong-mode="az"]');
            await page.waitForSelector('#sidebar-content .ong-lh');
        });
        await ctx.close();

        await t('vue étroite (colonne de 288 px) et téléphone : rien ne dépasse, le « +N » reste visible', async () => {
            for (const [vp, mode] of [[{width: 1000, height: 800}, 'az'], [{width: 1000, height: 800}, 'people'], [{width: 390, height: 844}, 'az']]) {
                const o = await open(vp, {mode});
                const m = await o.page.evaluate(() => {
                    const c = document.getElementById('sidebar-content'), cr = c.getBoundingClientRect();
                    const over = [...c.querySelectorAll('.ong-side *')].filter(e => e.offsetParent && e.getBoundingClientRect().right > cr.right - 1).map(e => e.className || e.tagName);
                    const plus = [...c.querySelectorAll('.ong-plus')].map(p => { const r = p.getBoundingClientRect(), row = p.closest('[data-ong-doc]').getBoundingClientRect(); return r.width > 0 && r.right <= row.right; });
                    const cut = [...c.querySelectorAll('.ong-docrow strong, .ong-docrow .ong-sub')].every(e => e.scrollWidth <= e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis' || getComputedStyle(e).overflow === 'hidden');
                    return {w: document.documentElement.scrollWidth, vw: innerWidth, sc: c.scrollWidth, cc: c.clientWidth, over: over.slice(0, 5), plus, cut};
                });
                assert.ok(m.w <= m.vw, `pas de défilement de côté (${vp.width}) : ${m.w}`);
                assert.ok(m.sc <= m.cc, `la colonne ne déborde pas (${vp.width}, ${mode}) : ${m.sc} > ${m.cc}`);
                assert.deepStrictEqual(m.over, [], `rien ne dépasse à droite (${vp.width}, ${mode})`);
                assert.ok(m.plus.length && m.plus.every(Boolean), '« +N » visible dans la ligne');
                assert.ok(m.cut, 'les lignes longues se coupent (…)');
                await o.ctx.close();
            }
        });

        kioskOn(true);
        ({ctx, page} = await open({width: 1440, height: 900}));
        await t('mode consultation : ni vivant ni fiche confidentielle, ni dans les lignes, ni dans la recherche, ni dans « Par personne »', async () => {
            const lettre = await rowText(page, 'Lettre de Jean à Marie');
            assert.match(lettre, /Marie LACOMBE, Jean MAZAUD/); assert.doesNotMatch(lettre, /\+\d/, 'pas de « +1 » qui trahit la vivante : ' + lettre);
            const all = await page.$eval('#sidebar-content', c => c.textContent);
            assert.doesNotMatch(all, /VIVANTE|SECRET/);
            await search(page, 'vivante');
            assert.deepStrictEqual(await titles(page), [], 'la recherche ne trouve pas par le nom d’une vivante');
            await search(page, 'secret');
            assert.deepStrictEqual(await titles(page), [], 'ni par celui d’une fiche confidentielle');
            await search(page, '');
            await page.click('#sidebar-content [data-ong-mode="people"]');
            await page.waitForSelector('#sidebar-content .ong-ph');
            const heads = await page.$$eval('#sidebar-content .ong-ph > span', b => b.map(x => x.textContent));
            assert.ok(!heads.some(h => /VIVANTE|SECRET/.test(h)), heads.join(' | '));
            assert.ok(heads.some(h => /Sans personne/.test(h)));
            await row(page, 'Lettre de Jean à Marie').click({button: 'right'});
            await page.waitForSelector('.ui-actmenu .ui-actmenu-i');
            const items = await page.$$eval('.ui-actmenu .ui-actmenu-i', b => b.map(x => x.textContent));
            assert.ok(!items.some(x => /Modifier|VIVANTE/.test(x)), 'pas de « Modifier », pas de vivante : ' + items.join(' | '));
            await page.keyboard.press('Escape');
        });
        await ctx.close();
        kioskOn(false);

        await t('en anglais : les nouveaux textes sont traduits', async () => {
            const o = await open({width: 1440, height: 900}, {mode: 'people'});
            await o.page.evaluate(() => { localStorage.setItem('lcnda-langue', 'en'); });
            await o.page.reload({waitUntil: 'load'});
            await o.page.waitForSelector('#sidebar-content .ong-ph');
            await o.page.waitForTimeout(800);
            const txt = await o.page.$eval('#sidebar-content', c => c.textContent);
            assert.match(txt, /No person/); assert.match(txt, /👤 People/, 'la case « 👤 Personnes » (6 façons de ranger)');
            await o.page.click('#sidebar-content [data-ong-under]');
            await o.page.waitForSelector('.ui-actmenu .ui-actmenu-i');
            const items = await o.page.$$eval('.ui-actmenu .ui-actmenu-i', b => b.map(x => x.textContent));
            assert.ok(items.some(x => /recommended/.test(x)) && items.some(x => /The date and place/.test(x)), items.join(' | '));
            await o.ctx.close();
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        kioskOn(false);
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les personnes des documents marchent.');
    process.exit(fails ? 1 : 0);
})();
