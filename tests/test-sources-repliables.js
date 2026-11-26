#!/usr/bin/env node
/* 📚 Les cadres des sources qui se replient sur la fiche (sourceItemHtml, assets/js/app.js) :
 *  - ▸/▾ et un clic sur la ligne du titre (pas sur un lien ni un bouton), clavier (Entrée, Espace), aria-expanded ;
 *  - fermé : une seule ligne (titre, « Réf. … · ↗ », ❝ ✎ 🗑 toujours là) ; l'état de chaque citation est gardé (genealogie-sources-ouvertes) ;
 *  - Réglages → Apparence → Fiches → « Sources sous les événements » (genealogie-sources-defaut) : ouvertes, fermées, ouvertes s'il n'y en a qu'une ;
 *  - « Tout ouvrir / Tout fermer » dans l'en-tête des Événements ; l'impression et l'aperçu d'impression les montrent ouverts ;
 *  - la publication « data.gouv.fr — Licence… » n'est plus écrite « date : … » (une vraie date, oui) ; 390 px et thème sombre ; aucune erreur JS.
 * Personnes inventées (MAZAUD, LACOMBE, DURAND).   node tests/test-sources-repliables.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const ONLY = process.env.ONLY || '';
const t = async (name, fn) => { if (ONLY && !name.includes(ONLY) && !name.startsWith('aucune')) return; try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-srcrep-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jeanne','MAZAUD','female','deceased',1),(2,'Pierre','LACOMBE','male','deceased',0),(3,'Marie','DURAND','female','unknown',0)");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Tulle','Corrèze','France')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$e = $pdo->prepare("INSERT INTO events(id,scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES(?,'person',?,?,?,?,?,1)");
$e->execute([10,1,$t('BIRT'),'12 mars 1935',1935,'1935-03-12']); $e->execute([11,1,$t('DEAT'),'3 septembre 2026',2026,'2026-09-03']);
$s = $pdo->prepare("INSERT INTO sources(id,title,agency,publication,url,text,source_type) VALUES(?,?,?,?,?,?,?)");
$s->execute([1,'Fichier des personnes décédées (INSEE)','Institut national de la statistique et des études économiques · INSEE','data.gouv.fr — Licence Ouverte 2.0 (Etalab)','https://www.data.gouv.fr/','MAZAUD Jeanne, décédée le 3 septembre 2026 à Tulle.','internet']);
$s->execute([2,'Registre des décès de Tulle','Archives départementales de la Corrèze','1881-1891','','Acte de décès de Jeanne MAZAUD.','book']);
$s->execute([3,'Registre des naissances de Tulle','Archives départementales de la Corrèze','','','Acte de naissance.','book']);
$l = $pdo->prepare("INSERT INTO source_links(id,entity_type,entity_id,source_record_id,page,note,citation_json) VALUES(?,?,?,?,?,?,?)");
$l->execute([101,'event',11,1,'Acte n° 866','Vu le 4 septembre 2026.',json_encode(['view_url' => 'https://deces.matchid.io/id/abc'])]);
$l->execute([102,'event',11,2,'Acte n° 12','','']);
$l->execute([103,'event',10,3,'Acte n° 41','','']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async ({width = 1440, dark = false, init = {}} = {}) => {
        const ctx = await browser.newContext({viewport: {width, height: 900}});
        await ctx.addInitScript(([dark, init]) => { try { if (sessionStorage.getItem('srcrep-init')) return; sessionStorage.setItem('srcrep-init', '1'); localStorage.setItem('genealogie-premier-vu', '1'); Object.entries(init).forEach(([k, v]) => localStorage.setItem(k, v)); if (dark) localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); } catch (_) {} }, [dark, init]);
        await ctx.route(u => !u.toString().startsWith(base), rt => rt.abort());
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(`${width}${dark ? ' sombre' : ''} : ${e.message}`));
        p.on('dialog', d => d.dismiss().catch(() => {}));
        await p.goto(base + '#personnes/1');
        await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, {timeout: 60000});
        if (dark) await p.evaluate(() => window.LCNDA_APP.applyDesign?.());
        await p.waitForSelector('.event-source-list .source-item', {timeout: 30000});
        await sleep(300);
        return p;
    };
    const boxes = p => p.evaluate(() => [...document.querySelectorAll('.event-source-list .source-item')].map(b => ({key: b.dataset.srcKey, open: !b.classList.contains('is-collapsed'), aria: b.querySelector('[data-src-toggle]')?.getAttribute('aria-expanded'), h: Math.round(b.querySelector('.src-body').getBoundingClientRect().height)})));
    const stateOf = (list, key) => list.find(b => b.key === key);
    try {
        await t('par défaut (rien de réglé) : tout est ouvert comme avant ; la publication n’est plus « date : » ; une vraie date le reste', async () => {
            const p = await open();
            const L = await boxes(p);
            assert.deepStrictEqual(L.map(b => b.key).sort(), ['l101', 'l102', 'l103']);
            assert.ok(L.every(b => b.open && b.aria === 'true' && b.h > 10), JSON.stringify(L));
            const meta = await p.evaluate(() => [...document.querySelectorAll('.event-source-list .source-item[data-src-key="l101"] .source-meta')].map(x => x.textContent).join('|'));
            assert.match(meta, /data\.gouv\.fr — Licence Ouverte 2\.0 \(Etalab\)/);
            assert.doesNotMatch(meta, /date : data\.gouv/);
            const meta2 = await p.evaluate(() => document.querySelector('.event-source-list .source-item[data-src-key="l102"] .source-meta').textContent);
            assert.match(meta2, /date : 1881-1891/);
            assert.strictEqual(await p.locator('[data-src-all]').innerText(), 'Tout fermer');
            await p.context().close();
        });

        await t('replier / déplier : clic sur ▸, clic sur la ligne, pas sur un lien ni ❝ ; clavier ; l’état reste après rechargement', async () => {
            const p = await open();
            const sel = '.event-source-list .source-item[data-src-key="l101"]';
            await p.click(`${sel} [data-src-toggle]`); await sleep(350);
            let L = await boxes(p); assert.strictEqual(stateOf(L, 'l101').open, false); assert.strictEqual(stateOf(L, 'l101').aria, 'false'); assert.ok(stateOf(L, 'l101').h <= 1, 'le corps est replié : ' + stateOf(L, 'l101').h);
            assert.strictEqual(stateOf(L, 'l102').open, true, 'les autres ne bougent pas');
            // fermé : une seule ligne, le titre, « Réf. Acte n° 866 · ↗ », et ❝ ✎ 🗑 toujours là
            const line = await p.evaluate(s => { const b = document.querySelector(s), head = b.querySelector('.src-head'), sum = b.querySelector('.src-sum'); const tops = [...head.children].filter(c => getComputedStyle(c).display !== 'none').map(c => c.getBoundingClientRect()); return {sum: sum && getComputedStyle(sum).display !== 'none' ? sum.textContent : '', h: Math.round(head.getBoundingClientRect().height), cite: !!b.querySelector('[data-cite-source]'), edit: !!b.querySelector('[data-edit-source]'), del: !!b.querySelector('[data-delete-source]'), title: b.querySelector('h4 a')?.textContent, rows: new Set(tops.map(r => Math.round(r.top + r.height / 2) >> 3)).size, link: b.querySelector('.src-sum a')?.getAttribute('href')}; }, sel);
            assert.strictEqual(line.sum, 'Réf. Acte n° 866 · ↗'); assert.strictEqual(line.link, 'https://deces.matchid.io/id/abc');
            assert.ok(line.cite && line.edit && line.del, JSON.stringify(line)); assert.strictEqual(line.title, 'Fichier des personnes décédées (INSEE)');
            assert.ok(line.h <= 40, 'une seule ligne : ' + line.h);
            // clic sur un lien ou un bouton de la ligne : ne replie pas
            await p.evaluate(s => { const a = document.querySelector(`${s} h4 a`); a.addEventListener('click', e => e.preventDefault(), {once: true}); a.click(); }, sel);
            await p.evaluate(s => { document.querySelector(`${s} .src-sum a`).addEventListener('click', e => e.preventDefault(), {once: true}); document.querySelector(`${s} .src-sum a`).click(); }, sel);
            assert.strictEqual(stateOf(await boxes(p), 'l101').open, false, 'un lien ne déplie pas');
            await p.evaluate(s => document.querySelector(`${s} [data-cite-source]`).click(), sel); await sleep(300);
            await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await sleep(150);
            assert.strictEqual(stateOf(await boxes(p), 'l101').open, false, '❝ ne déplie pas');
            // clic sur la ligne (à côté du titre) : déplie
            await p.evaluate(s => document.querySelector(`${s} .src-head`).click(), sel); await sleep(350);
            assert.strictEqual(stateOf(await boxes(p), 'l101').open, true, 'la ligne déplie');
            // clavier : Entrée puis Espace sur ▸
            await p.focus(`${sel} [data-src-toggle]`); await p.keyboard.press('Enter'); await sleep(50);
            assert.strictEqual(stateOf(await boxes(p), 'l101').open, false, 'Entrée replie');
            await p.keyboard.press(' '); await sleep(50);
            assert.strictEqual(stateOf(await boxes(p), 'l101').open, true, 'Espace déplie');
            await p.keyboard.press('Enter'); await sleep(400);
            const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-sources-ouvertes')));
            assert.deepStrictEqual(saved, {l101: false});
            // le corps replié n'a plus de lien qu'on atteint à la tabulation
            assert.strictEqual(await p.evaluate(s => getComputedStyle(document.querySelector(`${s} .src-body-in`)).visibility, sel), 'hidden');
            await p.reload(); await p.waitForSelector('.event-source-list .source-item', {timeout: 30000}); await sleep(300);
            const L2 = await boxes(p);
            assert.strictEqual(stateOf(L2, 'l101').open, false, 'gardé après rechargement'); assert.strictEqual(stateOf(L2, 'l102').open, true);
            assert.strictEqual(await p.locator('[data-src-all]').innerText(), 'Tout ouvrir', 'un cadre fermé : « Tout ouvrir »');
            // la même citation dans « Sources & citations » suit
            assert.strictEqual(await p.evaluate(() => [...document.querySelectorAll('.source-item[data-src-key="l101"]')].every(b => b.classList.contains('is-collapsed'))), true);
            await p.context().close();
        });

        await t('le souvenir des cadres reste borné (400 citations au plus)', async () => {
            const big = {}; for (let i = 0; i < 450; i++) big['l' + (9000 + i)] = false;
            const p = await open({init: {'genealogie-sources-ouvertes': JSON.stringify(big)}});
            await p.click('.event-source-list .source-item[data-src-key="l103"] [data-src-toggle]');
            const m = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-sources-ouvertes')));
            assert.ok(Object.keys(m).length <= 400, String(Object.keys(m).length)); assert.strictEqual(m.l103, false, 'le dernier est gardé');
            await p.context().close();
        });

        await t('Réglages : « Sources sous les événements » ouvertes · fermées · ouvertes s’il y en a une', async () => {
            const p = await open();
            await p.goto(base + '#maintenance/design_sheets'); await p.waitForSelector('[name="sourcesDefault"]', {state: 'attached', timeout: 30000}); await sleep(300);
            await p.evaluate(() => [...document.querySelectorAll('.reg-a-tabs [data-reg-a-tab]')].find(b => /Ce qu’on y voit/.test(b.textContent))?.click());
            await p.waitForSelector('[name="sourcesDefault"]', {timeout: 30000});
            const opts = await p.evaluate(() => { const s = document.querySelector('[name="sourcesDefault"]'); return {v: s.value, o: [...s.options].map(o => o.textContent), lab: s.closest('label').textContent, vis: !!s.offsetParent}; });
            assert.strictEqual(opts.v, 'open'); assert.deepStrictEqual(opts.o, ['Ouvertes', 'Fermées', 'Ouvertes seulement s’il y en a une']);
            assert.match(opts.lab, /Sources sous les événements/); assert.ok(opts.vis, 'visible dans la page Fiches');
            await p.selectOption('[name="sourcesDefault"]', 'closed'); await sleep(200);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-sources-defaut')), 'closed');
            await p.goto(base + '#personnes/1'); await p.waitForSelector('.event-source-list .source-item', {timeout: 30000}); await sleep(300);
            assert.ok((await boxes(p)).every(b => !b.open), 'fermées');
            assert.ok(await p.evaluate(() => [...document.querySelectorAll('.source-item')].every(b => b.classList.contains('is-collapsed'))), 'aussi dans Sources & citations');
            await p.evaluate(() => localStorage.setItem('genealogie-sources-defaut', 'single')); await p.reload(); await p.waitForSelector('.event-source-list .source-item', {timeout: 30000}); await sleep(300);
            let L = await boxes(p);
            assert.strictEqual(stateOf(L, 'l103').open, true, 'la naissance n’a qu’une source : ouverte');
            assert.strictEqual(stateOf(L, 'l101').open, false); assert.strictEqual(stateOf(L, 'l102').open, false, 'le décès en a deux : fermées');
            // un cadre réglé à la main passe devant le réglage
            await p.click('.event-source-list .source-item[data-src-key="l102"] [data-src-toggle]'); await p.reload(); await p.waitForSelector('.event-source-list .source-item', {timeout: 30000}); await sleep(300);
            L = await boxes(p); assert.strictEqual(stateOf(L, 'l102').open, true); assert.strictEqual(stateOf(L, 'l101').open, false);
            await p.evaluate(() => { localStorage.setItem('genealogie-sources-defaut', 'open'); localStorage.removeItem('genealogie-sources-ouvertes'); }); await p.reload(); await p.waitForSelector('.event-source-list .source-item', {timeout: 30000}); await sleep(300);
            assert.ok((await boxes(p)).every(b => b.open), 'ouvertes');
            await p.context().close();
        });

        await t('« Tout fermer » puis « Tout ouvrir » dans l’en-tête des Événements (gardé)', async () => {
            const p = await open();
            const btn = p.locator('.card [data-src-all]');
            assert.strictEqual(await btn.count(), 1);
            assert.ok(await p.evaluate(() => !!document.querySelector('[data-src-all]').closest('.card-head-actions')), 'dans l’en-tête du bloc');
            await btn.click(); await sleep(300);
            assert.ok((await boxes(p)).every(b => !b.open), JSON.stringify([await boxes(p), await btn.innerText(), await p.evaluate(() => localStorage.getItem('genealogie-sources-ouvertes'))])); assert.strictEqual(await btn.innerText(), 'Tout ouvrir');
            assert.deepStrictEqual(Object.values(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-sources-ouvertes')))), [false, false, false]);
            await p.reload(); await p.waitForSelector('.event-source-list .source-item', {timeout: 30000}); await sleep(300);
            assert.ok((await boxes(p)).every(b => !b.open), 'gardé'); assert.strictEqual(await btn.innerText(), 'Tout ouvrir');
            await btn.click(); await sleep(300);
            assert.ok((await boxes(p)).every(b => b.open)); assert.strictEqual(await btn.innerText(), 'Tout fermer');
            await p.context().close();
        });

        await t('impression : les cadres fermés sont ouverts (média print et aperçu de la fenêtre « Imprimer »)', async () => {
            const p = await open({init: {'genealogie-sources-defaut': 'closed'}});
            assert.ok((await boxes(p)).every(b => !b.open));
            await p.emulateMedia({media: 'print'}); await sleep(250);
            const pr = await p.evaluate(() => [...document.querySelectorAll('.source-item.is-collapsed')].map(b => ({h: b.querySelector('.src-body').getBoundingClientRect().height, vis: getComputedStyle(b.querySelector('.src-body-in')).visibility, tog: getComputedStyle(b.querySelector('.src-toggle')).display})));
            assert.ok(pr.length >= 3 && pr.every(x => x.h > 10 && x.vis === 'visible' && x.tog === 'none'), JSON.stringify(pr));
            await p.emulateMedia({media: 'screen'}); await sleep(100);
            await p.evaluate(() => window.LCNDA_UI.printPage('Fiche'));
            await p.waitForSelector('dialog[open] iframe[title="Aperçu de l’impression"]', {timeout: 20000});
            let res = null;
            for (let i = 0; i < 60 && !res; i++) {
                await sleep(250);
                res = await p.evaluate(() => { const f = document.querySelector('dialog[open] iframe[title="Aperçu de l’impression"]'); const d = f?.contentDocument; const B = d ? [...d.querySelectorAll('.source-item.is-collapsed')] : []; if (!B.length) return null; return B.map(b => ({h: b.querySelector('.src-body').getBoundingClientRect().height, vis: d.defaultView.getComputedStyle(b.querySelector('.src-body-in')).visibility, txt: b.querySelector('.source-meta')?.textContent || ''})); });
            }
            assert.ok(res && res.length >= 3, 'cadres dans l’aperçu');
            assert.ok(res.every(x => x.h > 10 && x.vis === 'visible'), JSON.stringify(res));
            await p.context().close();
        });

        await t('390 px, clair et sombre : la ligne fermée tient, rien ne déborde ni ne colle au bord', async () => {
            for (const dark of [false, true]) {
                const p = await open({width: 390, dark});
                if (dark) assert.strictEqual(await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
                for (const closed of [false, true]) {
                    if (closed) { await p.click('.card [data-src-all]'); await sleep(300); }
                    const r = await p.evaluate(() => { const W = document.documentElement.clientWidth; const out = []; document.querySelectorAll('.event-source-list .source-item').forEach(b => { const list = b.closest('.event-source-list').getBoundingClientRect(); b.querySelectorAll('.src-head > *, .src-head button').forEach(el => { const r = el.getBoundingClientRect(); if (!r.width) return; if (r.right > list.right + 1 || r.left < list.left - 1) out.push(`${el.className || el.tagName} ${Math.round(r.left)}-${Math.round(r.right)} / ${Math.round(list.left)}-${Math.round(list.right)}`); }); if (b.classList.contains('is-collapsed') && b.querySelector('.src-head').getBoundingClientRect().height > 40) out.push('pas sur une ligne : ' + b.dataset.srcKey); }); return {out, scroll: document.documentElement.scrollWidth - W, bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.querySelector('.event-source-list .source-item h4 a')).color, tog: getComputedStyle(document.querySelector('.src-toggle')).color}; });
                    assert.deepStrictEqual(r.out, [], (dark ? 'sombre ' : 'clair ') + (closed ? 'fermé' : 'ouvert'));
                    assert.ok(r.scroll <= 1, 'défilement horizontal : ' + r.scroll);
                    assert.notStrictEqual(r.tog, r.bg, 'le chevron se voit');
                    if (closed) { const pad = await p.evaluate(() => { const b = document.querySelector('.event-source-list'); const l = b.getBoundingClientRect(), t = b.querySelector('.src-toggle').getBoundingClientRect(); return Math.round(t.left - l.left); }); assert.ok(pad >= 6, 'le chevron ne colle pas au bord du cadre : ' + pad); }
                }
                await p.evaluate(() => localStorage.removeItem('genealogie-sources-ouvertes'));
                await p.context().close();
            }
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
