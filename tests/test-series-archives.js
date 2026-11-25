'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗂 Les séries, c'est quoi ? (assets/js/heritage-series-archives.js) :   node tests/test-series-archives.js
 *  - le petit lien « ⓘ Les séries, c’est quoi ? » ouvre la fenêtre depuis la fiche d'un service d'archives (carte « 🗂 Séries »,
 *    avec le site du service), depuis sa fenêtre « ✎ Modifier » (champ « Séries ») et depuis la fenêtre « Source » (champ « Série ») ;
 *  - la fenêtre a le tableau « lettre → ce qu'on y trouve → utile pour le généalogiste » (A, B, E, L, M, P, R, W, J, Fi, Mi…) ;
 *  - chaque lien de source est une adresse https avec rel « noopener » ; aucun lien inventé (liste fermée) ;
 *  - à 1440 et 390 px, sans défilement horizontal de la page, sans erreur JavaScript.
 * Playwright absent : sauté.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) {} }
if (!pw) { console.log('— Playwright absent : test sauté'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-series-'));
fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
{ const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start) VALUES(1,'Jean','Martin','male',1)");
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env});
  if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); } }

const SOURCES = ['https://archive.org/details/loisinstruction00frangoog', 'https://fr.wikipedia.org/wiki/Archives_d%C3%A9partementales', 'https://www.legifrance.gouv.fr/search/code?'];
const SITE = 'https://archives.correze.fr';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const post = async (action, body) => { const r = await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({...body, csrf})}); return (await r.json()).result || {}; };
    const svc = await post('save_archive_service', {name: 'Archives départementales de la Corrèze', short_name: 'AD 19', kind: 'ad', dept_code: '19', website_url: SITE, series_text: '3 E — Notaires\n4 E — État civil'});
    assert.ok(svc.id, 'service créé');
    const browser = await pw.chromium.launch();
    const errors = [];
    /** la fenêtre ouverte : tableau, sources https + noopener, puis fermée */
    const checkDialog = async (p, {site = ''} = {}) => {
        await p.waitForSelector('dialog[open].ser-dialog .ser-table');
        const d = await p.evaluate(() => {
            const dlg = document.querySelector('dialog[open].ser-dialog');
            return {title: dlg.querySelector('h2').textContent, letters: [...dlg.querySelectorAll('.ser-table tbody td.ser-l')].map(x => x.textContent.trim()),
                head: [...dlg.querySelectorAll('.ser-table thead th')].map(x => x.textContent.trim()),
                links: [...dlg.querySelectorAll('a[href]')].map(a => ({href: a.getAttribute('href'), rel: a.getAttribute('rel') || '', target: a.getAttribute('target')})),
                text: dlg.querySelector('.ser-help').textContent};
        });
        assert.match(d.title, /Les séries, c’est quoi/);
        assert.deepEqual(d.head, ['Lettre', 'Ce qu’on y trouve', 'Utile pour le généalogiste']);
        for (const l of ['A', 'B', 'C', 'E', 'G', 'H', 'L', 'M', 'P', 'Q', 'R', 'U', 'W', 'E-dépôt', 'J', 'Fi', 'Mi']) assert.ok(d.letters.includes(l), `série ${l}`);
        assert.ok(d.letters.length >= 25, `${d.letters.length} lignes`);
        assert.match(d.text, /3 E ici, en 5 E ailleurs/); assert.match(d.text, /L213-2/); assert.match(d.text, /24 avril 1841/);
        assert.ok(d.links.length >= 3);
        for (const a of d.links) {
            assert.match(a.href, /^https:\/\//, `https : ${a.href}`);
            assert.ok(/\bnoopener\b/.test(a.rel), `rel noopener : ${a.href}`);
            assert.equal(a.target, '_blank');
            assert.ok(SOURCES.some(s => a.href.startsWith(s)) || (site && a.href === site), `lien attendu : ${a.href}`);
        }
        for (const s of SOURCES) assert.ok(d.links.some(a => a.href.startsWith(s)), `source ${s}`);
        if (site) assert.ok(d.links.some(a => a.href === site), 'le site du service');
        assert.ok(await p.$('dialog[open].ser-dialog [data-ser-dispo]'), '🏛 Actes en ligne aux archives');
        assert.ok(await p.$('dialog[open].ser-dialog [data-ser-courriers]'), '📮 Actes à demander');
        const over = await p.evaluate(() => { const b = document.querySelector('dialog[open].ser-dialog .h-dialog-body'); return b.scrollWidth - b.clientWidth; });
        assert.ok(over <= 1, `la fenêtre déborde de ${over} px`);
        if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, {recursive: true}); await p.screenshot({path: path.join(process.env.SHOTS, `series-${p.viewportSize().width}.png`)}); }
        await p.click('dialog[open].ser-dialog .modal-actions [type=submit]');
        await p.waitForFunction(() => !document.querySelector('dialog[open].ser-dialog'));
    };
    try {
        for (const [name, vp] of [['1440', {width: 1440, height: 900}], ['390', {width: 390, height: 844}]]) {
            const ctx = await browser.newContext({viewport: vp});
            const p = await ctx.newPage();
            p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
            await p.goto(base);
            await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.archiveServices && window.LCNDA_EXT?.seriesArchives && window.LCNDA_EXT?.openDialog, null, {timeout: 20000});

            await t(`${name} : fiche du service → carte « 🗂 Séries » → ⓘ ouvre la fenêtre (avec le site du service)`, async () => {
                await p.evaluate(id => { const A = window.LCNDA_APP; Object.assign(A.state, {listType: 'archive_services', archiveServiceId: id}); A.setModule('listes'); }, svc.id);
                await p.waitForSelector('.h-asv-sheet .h-asv-series');
                await p.click('.h-asv-sheet .card-title [data-ser-help]');
                await checkDialog(p, {site: SITE});
                const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
                assert.ok(sw <= 1, `défilement horizontal : ${sw}`);
            });

            await t(`${name} : fenêtre ✎ Modifier du service → champ « Séries » → ⓘ`, async () => {
                await p.click('.h-asv-sheet [data-as-edit-me]');
                await p.waitForSelector('dialog[open] textarea[name=series_text]');
                await p.click('dialog[open] [data-ser-help]');
                await checkDialog(p, {site: SITE});
                assert.ok(await p.$('dialog[open] textarea[name=series_text]'), 'la fenêtre du service reste ouverte dessous');
                await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            });

            await t(`${name} : fenêtre « Source » → champ « Série » → ⓘ`, async () => {
                await p.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 1; window.LCNDA_APP.setModule('personnes'); });
                await p.waitForSelector('[data-add-source-inline]', {state: 'attached', timeout: 15000});
                await p.evaluate(() => document.querySelector('[data-add-source-inline]').click());
                await p.waitForSelector('#source-dialog[open] .h-asv-source [data-ser-help]');
                await p.click('#source-dialog[open] .h-asv-source [data-ser-help]');
                await checkDialog(p);
                assert.ok(await p.$('#source-dialog[open]'), 'la fenêtre Source reste ouverte');
                await p.evaluate(() => document.getElementById('source-dialog').close());
            });
            await ctx.close();
        }
        await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(failed ? `✗ ${failed} échec(s)` : '✓ tout est bon');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
