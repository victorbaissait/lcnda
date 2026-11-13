'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🩺 Santé de la famille (lib/sante.php, assets/js/heritage-sante.js, assets/css/sante.css) :   node tests/test-sante-famille.js
 *  1. le serveur (base neuve, migration 79) : caché au départ (rien ne se lit, rien ne s'écrit, menu de choix vide), montrer,
 *     ajouter (date C4 → année, source, « à vérifier »), la cause écrite sur l'acte de décès lue telle quelle, les épidémies de
 *     son vivant (« Le monde autour »), supprimer puis « ↶ Annuler » (même numéro, deuxième annulation sans erreur), fiche
 *     verrouillée, sorte forgée, CSRF ; vue par branches (Sosa, quatre côtés, nombres de personnes) ;
 *     jamais exporté : GEDCOM sans la case (et avec : seulement avec), site web (bloc fiche), mode simple ;
 *  2. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : caché (ni bloc, ni liste), Réglages → montrer,
 *     bloc de la fiche, « ＋ Ajouter » (K1 si vide), suppression + « ↶ Annuler », liste (barre H10), éventail coloré, les quatre
 *     côtés, case de l'export GEDCOM, aucune erreur JavaScript.
 * Captures : SHOTS=dossier node tests/test-sante-famille.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const SECRET = 'Mal des ardents';

(async () => {
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : test sauté'); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-sante-'));
    const dir = path.join(tmp, 'data');
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO places(id,name,county,country,admin4_code) VALUES(1,'Tulle','Corrèze','France','19272')");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start) VALUES (1,'Jean','FAURE','male',1),(2,'Pierre','FAURE','male',0),(3,'Rose','MAZEL','female',0),(4,'Antoine','FAURE','male',0),(5,'Anne','BORIE','female',0),(6,'Louis','MAZEL','male',0),(7,'Jeanne','PEYRE','female',0),(8,'Paul','VERROU','male',0)");
$pdo->exec("UPDATE persons SET is_locked=1 WHERE id=8");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3),(2,4,5),(3,6,7)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,2),(3,3)");
$b = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$d = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='DEAT' LIMIT 1")->fetchColumn();
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',1,?,'3 mai 1850',1850,1),('person',2,?,'vers 1820',1820,1),('person',4,?,'1790',1790,1)")->execute([$b,$b,$b]);
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id,cause) VALUES('person',4,?,'12 mars 1849',1849,1,'phtisie pulmonaire'),('person',1,?,'1931',1931,1,'')")->execute([$d,$d]);
$pdo->exec("INSERT INTO sources(id,source_type,title) VALUES(1,'internet','Lettres de la tante Rose')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } })).json();
    const getText = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } })).text();
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json() }; };
    const w = async body => { const r = await post('sante_write', body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.result; };
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env });
    const ids = {};
    try {
        /* ═════ 1. le serveur ═════ */
        await t('migration 79 : la table health_records existe ; caché au départ (rien ne se lit, rien ne s’écrit, menu de choix vide)', async () => {
            const st = await get('schema_status'); assert.ok(st.version >= 79, String(st.version));
            assert.match(php("echo $pdo->query(\"SELECT count(*) FROM sqlite_master WHERE name='health_records'\")->fetchColumn();").stdout, /^1$/);
            assert.deepEqual(await get('sante', { op: 'state' }), { visible: false, kiosk: false, count: 0 });
            assert.equal((await get('sante', { op: 'list' })).rows, undefined);
            assert.equal((await get('sante', { op: 'person', person_id: 1 })).records, undefined);
            const r = await post('sante_write', { op: 'save', person_id: 1, label: 'x' }); assert.notEqual(r.status, 200); assert.match(r.body.error, /cachée/);
        });
        await t('montrer (Réglages) : visible ; CSRF obligatoire', async () => {
            assert.equal((await post('sante_write', { op: 'show', show: 1 }, 'faux')).status >= 400, true);
            assert.equal((await w({ op: 'show', show: 1 })).show, true);
            assert.equal((await get('sante', { op: 'state' })).visible, true);
        });
        await t('ajouter : sorte, date C4 → année, source, « à vérifier », note ; sorte forgée refusée ; fiche verrouillée refusée', async () => {
            ids.a = (await w({ op: 'save', person_id: 2, kind: 'maladie', label: '  Phtisie  ', date_text: 'vers 1860', source_id: 1, citation: 'lettre du 3 mai 1921', note: 'Il toussait beaucoup.', to_check: 1 })).id;
            ids.b = (await w({ op: 'save', person_id: 6, kind: 'deces', label: 'Phtisie', date_text: 'entre 1880 et 1885' })).id;
            ids.c = (await w({ op: 'save', person_id: 3, kind: 'handicap', label: SECRET, note: 'secret de famille' })).id;
            const p = await get('sante', { op: 'person', person_id: 2 });
            const r = p.records.find(x => x.id === ids.a);
            assert.equal(r.label, 'Phtisie'); assert.equal(r.year, 1860); assert.equal(r.source_title, 'Lettres de la tante Rose'); assert.equal(r.to_check, true); assert.equal(r.kind, 'maladie');
            assert.equal((await post('sante_write', { op: 'save', person_id: 2, kind: 'risque', label: 'x' })).status, 422);
            assert.equal((await post('sante_write', { op: 'save', person_id: 2, kind: 'maladie', label: '   ' })).status, 422);
            const lk = await post('sante_write', { op: 'save', person_id: 8, kind: 'maladie', label: 'Goutte' }); assert.notEqual(lk.status, 200); assert.match(lk.body.error, /verrouill/i);
            assert.equal((await post('sante_write', { op: 'save', person_id: 999, label: 'x' })).status >= 400, true);
        });
        await t('la cause écrite sur l’acte de décès est lue telle quelle ; épidémies de son vivant (Le monde autour)', async () => {
            const p = await get('sante', { op: 'person', person_id: 4 });
            assert.equal(p.acts.length, 1); assert.equal(p.acts[0].label, 'phtisie pulmonaire'); assert.equal(p.acts[0].origin, 'acte'); assert.equal(p.acts[0].kind, 'deces');
            const j = await get('sante', { op: 'person', person_id: 1 });
            assert.ok(j.epidemics.length > 0, 'au moins une épidémie entre 1850 et 1931 en France');
            assert.ok(j.epidemics.every(e => e.id && e.title && e.from >= 1700));
            const l = await get('sante', { op: 'list' });
            assert.equal(l.rows.length, 4); assert.ok(l.rows.some(r => r.origin === 'acte'));
            assert.equal(l.labels[0].label.toLowerCase().startsWith('phtisie'), true);
        });
        await t('supprimer puis « ↶ Annuler » : même numéro, deuxième annulation sans erreur ; rien dans le journal des modifications', async () => {
            const d = await w({ op: 'delete', id: ids.a });
            assert.equal(d.row.id, ids.a); assert.equal(d.row.label, 'Phtisie');
            assert.equal((await get('sante', { op: 'person', person_id: 2 })).records.length, 0);
            assert.equal((await w({ op: 'restore', row: d.row })).id, ids.a);
            assert.equal((await w({ op: 'restore', row: d.row })).already, true);
            const back = (await get('sante', { op: 'person', person_id: 2 })).records[0];
            assert.equal(back.id, ids.a); assert.equal(back.note, 'Il toussait beaucoup.'); assert.equal(back.source_id, 1); assert.equal(back.to_check, true);
            assert.equal(php(`echo $pdo->query("SELECT count(*) FROM change_log WHERE before_json LIKE '%toussait%' OR summary LIKE '%Phtisie%'")->fetchColumn();`).stdout.trim(), '0');
        });
        await t('vue par branches : Sosa, la maladie choisie (« phtisie » trouve aussi « phtisie pulmonaire »), quatre côtés, des nombres de personnes', async () => {
            const b = await get('sante', { op: 'branches', root: 1, gens: 3, label: 'Phtisie' });
            assert.equal(b.nodes.length, 7);
            assert.deepEqual(b.nodes.filter(n => n.match).map(n => n.sosa).sort(), [2, 4, 6]);
            assert.equal(b.total, 3);
            const side = top => b.branches.find(x => x.top === top);
            assert.equal(side(4).matches.length, 1); assert.equal(side(4).head.name, 'Antoine FAURE');
            assert.equal(side(5).matches.length, 0); assert.equal(side(6).matches.length, 1); assert.equal(side(7).matches.length, 0);
            assert.deepEqual(b.center.map(c => c.sosa), [2]); assert.equal(b.center[0].to_check, true);
            assert.ok(!JSON.stringify(b).includes('%'), 'jamais de pourcentage');
            const none = await get('sante', { op: 'branches', root: 1, gens: 3, label: '' }); assert.equal(none.total, 0);
            assert.equal((await get('sante', { op: 'branches', root: 0 })).error !== undefined, true);
        });
        await t('menu de choix « health » : les maladies notées, et rien une fois cachée', async () => {
            const r = await get('picker_search', { kind: 'health', q: 'phti' });
            assert.ok(r.groups[0].items.some(i => /phtisie/i.test(i.title)));
            const mix = await get('picker_search', { kind: 'person,health', q: 'mal' }); assert.ok(mix.groups.some(g => g.kind === 'health' && g.items.length));
        });
        await t('jamais exporté : GEDCOM sans la case, site web, mode simple ; avec la case du GEDCOM : seulement là', async () => {
            const ged = await getText('export_gedcom', { gedcom_version: '7' });
            assert.match(ged, /0 HEAD/); assert.ok(!ged.includes(SECRET), 'santé dans le GEDCOM par défaut');
            const ged2 = await getText('export_gedcom', { gedcom_version: '7', health: '1' });
            assert.ok(ged2.includes(SECRET), 'la case du GEDCOM'); assert.match(ged2, /2 TYPE Handicap/);
            const site = php(`require 'tests/api_functions.php'; echo website_block_html($pdo, ['kind' => 'person', 'person' => 3], fn($x) => '');`);
            assert.equal(site.status, 0, site.stderr); assert.match(site.stdout, /MAZEL|Rose/i, 'le bloc de la fiche est bien produit'); assert.ok(!site.stdout.includes(SECRET));
            const ms = await getText('mode_simple_data'); assert.ok(ms.length > 50); assert.ok(!ms.includes(SECRET), 'mode simple');
            const fam = await getText('export_csv', { type: 'persons' }).catch(() => ''); assert.ok(!fam.includes(SECRET));
            // cachée : même la case du GEDCOM ne sort rien
            await w({ op: 'show', show: 0 });
            assert.ok(!(await getText('export_gedcom', { gedcom_version: '7', health: '1' })).includes(SECRET));
            assert.equal((await get('picker_search', { kind: 'health', q: '' })).groups[0].items.length, 0, 'recherche : rien une fois cachée');
            await w({ op: 'show', show: 1 });
        });

        /* ═════ 2. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        const browser = await chromium.launch();
        const shot = async (pg, name, full = false) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full }); } };
        const open = async (w0, h0, dark) => {
            const ctx = await browser.newContext({ viewport: { width: w0, height: h0 }, colorScheme: dark ? 'dark' : 'light' });
            const pg = await ctx.newPage(); const errs = [];
            await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
            if (dark) { await pg.goto(base); await pg.waitForFunction(() => window.LCNDA_APP?.readDesignSettings); await pg.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({ ...A.readDesignSettings(), preset: 'dark' })); }); await pg.waitForTimeout(1800); await pg.reload(); }
            pg.on('pageerror', e => errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|tile\.openstreetmap|ERR_|net::/.test(m.text())) errs.push('console ' + m.text()); });
            return { ctx, pg, errs, dark };
        };
        const theme = async (pg, dark) => { if (dark) assert.equal(await pg.evaluate(() => document.documentElement.dataset.theme), 'dark', 'mode sombre de l’app'); };
        const reveal = async pg => pg.evaluate(() => { const c = document.querySelector('.h-sante-card'); const sec = c?.closest('.fsec'); if (sec?.hidden) sec.closest('.fsec-wrap')?.querySelector(`[data-fsec-tab="${sec.dataset.fsec}"]`)?.click(); if (c?.closest('.fsec')?.classList.contains('is-folded')) c.closest('.fsec').querySelector('[data-fsec-fold]')?.click(); c?.scrollIntoView({ block: 'start' }); });
        const toList = async pg => { await pg.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'health_family'; A.setModule('listes'); }); await pg.waitForFunction(() => /Santé de la famille/.test(document.querySelector('#workspace .page-header')?.textContent || ''), null, { timeout: 10000 }); await pg.waitForTimeout(600); };
        try {
            await t('caché : ni bloc sur la fiche, ni liste dans la colonne', async () => {
                await w({ op: 'show', show: 0 });
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.addInitScript(() => { try { localStorage.setItem('genealogie-sante', '{"show":false}'); } catch (_) {} });
                await pg.goto(base + '#personnes/2'); await pg.waitForSelector('.person-page'); await pg.waitForTimeout(1200);
                assert.equal(await pg.locator('.h-sante-card').count(), 0);
                await pg.goto(base + '#listes'); await pg.waitForTimeout(1200);
                assert.equal(await pg.locator('[data-side-value="health_family"]').count(), 0);
                await toList(pg); assert.match(await pg.textContent('#workspace'), /cachée/);
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('Réglages → « 🩺 Santé de la famille » : montrer (K2) → le serveur suit', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.goto(base + '#maintenance/sante'); await pg.waitForSelector('[data-sante-show]', { state: 'attached' });
                await pg.locator('label.ui-toggle:has([data-sante-show])').click(); await pg.waitForTimeout(900);
                assert.equal((await get('sante', { op: 'state' })).visible, true);
                await shot(pg, 'reglages-1440');
                await pg.goto(base + '#maintenance/export'); await pg.waitForTimeout(1500);
                assert.equal(await pg.locator('[data-sante-export]').isVisible(), true, 'case de l’export GEDCOM');
                assert.deepEqual(errs, []); await ctx.close();
            });
            for (const [W, H, dark] of [[1440, 900, false], [390, 844, false], [1440, 900, true]]) {
                const tag = `${W}${dark ? '-sombre' : ''}`;
                await t(`fiche, ajout (K1), ↶ Annuler, liste H10, éventail et quatre côtés — ${tag}`, async () => {
                    const { ctx, pg, errs } = await open(W, H, dark);
                    await pg.goto(base + '#personnes/2'); await pg.waitForSelector('.person-page'); await theme(pg, dark);
                    await pg.waitForSelector('.h-sante-card [data-filled] .ui-row', { state: 'attached', timeout: 10000 });
                    await reveal(pg); await pg.waitForTimeout(400);
                    if (W === 1440 && !dark) {
                        await pg.click('.h-sante-card [data-sante-new]');
                        await pg.waitForSelector('dialog[open] .h-sante-form');
                        await pg.click('dialog[open] button[type=submit]'); await pg.waitForTimeout(300);
                        assert.ok(await pg.locator('dialog[open] .is-invalid').count() >= 1, 'K1 : champ vide encadré');
                        await pg.fill('dialog[open] [name=label]', 'Diabète'); await pg.fill('dialog[open] [name=date_text]', '1885');
                        await pg.check('dialog[open] [name=to_check]');
                        await pg.click('dialog[open] button[type=submit]'); await pg.waitForSelector('dialog[open] .h-sante-form', { state: 'detached' });
                        await pg.waitForFunction(() => document.querySelectorAll('.h-sante-card .ui-row').length === 2);
                        const rec = (await get('sante', { op: 'person', person_id: 2 })).records.find(r => r.label === 'Diabète'); assert.ok(rec && rec.to_check && rec.year === 1885);
                        // supprimer depuis ⋯, puis ↶ Annuler
                        await pg.evaluate(id => document.querySelector(`[data-sante-del="${id}"]`).click(), rec.id);
                        await pg.waitForFunction(() => document.querySelectorAll('.h-sante-card .ui-row').length === 1);
                        await pg.locator('#toast-region button', { hasText: 'Annuler' }).first().click();
                        await pg.waitForFunction(() => document.querySelectorAll('.h-sante-card .ui-row').length === 2);
                        assert.ok((await get('sante', { op: 'person', person_id: 2 })).records.some(r => r.id === rec.id), 'remise au même numéro');
                        await pg.waitForTimeout(300);
                    }
                    await shot(pg, `fiche-${tag}`);
                    await toList(pg); await theme(pg, dark);
                    await pg.waitForSelector('.h-sante-page .ui-listbar');
                    assert.ok(await pg.locator('.h-sante-page [data-sante-row]').count() >= 4);
                    await shot(pg, `liste-${tag}`);
                    await pg.fill('.h-sante-page .ui-listbar-search input', 'ardents'); await pg.waitForTimeout(500);
                    assert.equal(await pg.locator('.h-sante-page [data-sante-row]').count(), 1);
                    await pg.fill('.h-sante-page .ui-listbar-search input', ''); await pg.waitForTimeout(300);
                    await pg.evaluate(() => window.LCNDA_EXT.sante.open(1)); await pg.waitForSelector('.h-sante-tabs');
                    await pg.click('[data-sante-tab="branches"]'); await pg.waitForSelector('.h-sante-ctl');
                    // la maladie, avec le menu de choix (la personne du centre : Jean, mise par ext.sante.open)
                    const pk = pg.locator('.h-sante-ctl .pk').nth(1);
                    if (await pk.locator('[data-pk="remove"], .x').count()) await pk.locator('[data-pk="remove"], .x').first().click();
                    await pk.locator('input:not([type=hidden])').first().fill('phti'); await pg.waitForTimeout(900); await pg.keyboard.press('Enter');
                    await pg.waitForSelector('.h-sante-fan'); await pg.waitForTimeout(400);
                    assert.ok(await pg.locator('.h-sante-seg.is-hit').count() >= 2, 'segments colorés');
                    assert.match(await pg.textContent('.h-sante-sum'), /personnes? avec « phtisie/i);
                    await shot(pg, `eventail-${tag}`, true);
                    await pg.click('[data-sante-view] [data-v="sides"]'); await pg.waitForSelector('.h-sante-sides');
                    assert.equal(await pg.locator('.h-sante-side').count(), 4);
                    await shot(pg, `cotes-${tag}`, true);
                    assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'pas de défilement de côté');
                    assert.deepEqual(errs, []); await ctx.close();
                });
            }
            await t('impression de la fiche : le bloc 🩺 n’est pas imprimé', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.goto(base + '#personnes/2'); await pg.waitForSelector('.h-sante-card', { state: 'attached' });
                await pg.emulateMedia({ media: 'print' });
                assert.equal(await pg.evaluate(() => getComputedStyle(document.querySelector('.h-sante-card')).display), 'none');
                assert.deepEqual(errs, []); await ctx.close();
            });
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
        if (failed) { console.error(`✗ ${failed} échec(s)`); process.exitCode = 1; } else console.log('✓ tout est bon');
    }
})();
