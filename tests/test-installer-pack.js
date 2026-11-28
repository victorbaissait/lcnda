#!/usr/bin/env node
/* 📦 Installer un pack depuis 📊 Données : la page se met à jour toute seule (assets/js/app-listes-donnees.js : installState, forgetInstalls ;
 *   les mémoires de app-listes-themes.js, app-donnees-accueil.js, app-listes-maj.js ; api.php : les actions ld_*).
 *  Le bogue : « Séismes d'Europe (1000 → 1899) » restait « pas encore sur cet ordinateur » après « 📦 Installer », même après « ↻ C'est installé :
 *  recharger » — api.php envoyait TOUTES les actions ld_* aux Lieux en double (ld_status → « Action inconnue », lu comme « rien d'installé »),
 *  et l'état était gardé 15 s en mémoire.
 *  1. le serveur : ld_status, ld_query, ld_famille répondent ; les Lieux en double (ld_groups) aussi ;
 *  2. avant : la page « pas encore », le thème « à télécharger », le récap « ⤓ » ;
 *  3. une installation ratée (pack abîmé) : un message clair, rien d'installé, la page dit toujours « pas encore » ;
 *  4. la vérification elle-même en panne : un message d'erreur (pas « pas installé ») ; « ↻ recharger » relit vraiment ;
 *  5. installé pendant que la page est ouverte : les lignes arrivent sans recharger ; ↶ (hist_pack_undo) : la page revient à « pas encore » ;
 *  6. « 📦 Installer » → Réglages → Histoire du lieu → ⤓ → ← : les lignes tout de suite ; le thème et le récap à jour ;
 *  7. d'autres sortes : un pack livré (tf-ballons), un pack GitHub (tb-osm-…), une liste « lien » : jamais de « 📦 Installer ».
 * Le pack « Histoire du lieu » est FABRIQUÉ ici (quelques lignes, le vrai schéma) : rien à télécharger.
 * Base : tests/prendre-depuis-seed.js.   node tests/test-installer-pack.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/* ═════════ le pack fabriqué (en-tête LCHIST1 + base SQLite) et le faux « GitHub » ═════════ */
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-instpack-')), site = path.join(work, 'site');
fs.mkdirSync(site);
function makePack() {
    const {DatabaseSync} = require('node:sqlite');
    const f = path.join(work, 'pack.sqlite'), db = new DatabaseSync(f);
    db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE sources (id TEXT PRIMARY KEY, nom TEXT, quoi TEXT, url TEXT, licence TEXT, mention TEXT, mise_a_jour TEXT, fichier TEXT, sha256 TEXT, n INTEGER);
CREATE TABLE ghd_series (code TEXT PRIMARY KEY, nom TEXT, lat REAL, lon REAL, moyenne REAL, ecart REAL, n INTEGER, ref TEXT, debut INTEGER, fin INTEGER);
CREATE TABLE ghd (code TEXT, annee INTEGER, jours REAL, PRIMARY KEY (code, annee)) WITHOUT ROWID;
CREATE TABLE ghd_dep (dep TEXT, rang INTEGER, code TEXT, note TEXT, PRIMARY KEY (dep, rang)) WITHOUT ROWID;
CREATE TABLE communes (code TEXT PRIMARY KEY, nom TEXT, cle TEXT, dep TEXT, pop TEXT) WITHOUT ROWID;
CREATE TABLE gares (id INTEGER PRIMARY KEY, nom TEXT, lat REAL, lon REAL, insee TEXT, ouverture INTEGER, precision INTEGER, ref TEXT, src TEXT);
CREATE TABLE seismes (id INTEGER PRIMARY KEY, annee INTEGER, mois INTEGER, jour INTEGER, lat REAL, lon REAL, io TEXT, mw REAL, zone TEXT, src TEXT);
CREATE TABLE catnat (code TEXT, debut TEXT, fin TEXT, risque TEXT);
CREATE TABLE catnat_risques (code TEXT PRIMARY KEY, nom TEXT);
CREATE TABLE bdhi (id INTEGER PRIMARY KEY, titre TEXT, debut TEXT, fin TEXT, annee INTEGER);
CREATE TABLE bdhi_lieu (id INTEGER, code TEXT);
INSERT INTO meta VALUES ('kind','histoire'),('format','1'),('built','2026-11-24'),('title','Histoire du lieu'),('pop_years','1876,2023');
INSERT INTO sources VALUES ('epica','EPICA v1.1 (INGV)','Séismes','https://emidius.eu/epica/','CC BY 4.0','Rovida et Antonucci (2021)','2026-11-24','EPICA_v1.1.xlsx','${'0'.repeat(64)}',3);
INSERT INTO communes VALUES ('19272','Tulle','tulle','19','15342,13401');
INSERT INTO seismes VALUES (1,1000,3,29,50.183,4.237,'4',3.72,'HAINAUT (CHARLEROI ?)','epica'),(2,1356,10,18,47.47,7.6,'9',6.6,'BALE','epica'),(3,1887,2,23,43.9,8.0,'9',6.3,'LIGURIE','epica');`);
    db.close();
    const body = fs.readFileSync(f), head = Buffer.alloc(4096, 0x20);
    Buffer.from('LCHIST1\n' + JSON.stringify({kind: 'histoire', built: '2026-11-24', communes: 1, seismes: 3, size: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex')}) + '\n').copy(head);
    return Buffer.concat([head, body]);
}
const PACK = makePack();
const publish = buf => { // ce que « GitHub » propose (le sommaire n'est pas gardé en mode essai)
    fs.writeFileSync(path.join(site, 'histoire-locale.lchist.000'), buf);
    fs.writeFileSync(path.join(site, 'histoire-manifest.json'), JSON.stringify({version: '2026-11', packs: {histoire: {size: buf.length, built: '2026-11-24', parts: [{name: 'histoire-locale.lchist.000', size: buf.length}]}}}));
};
process.env.LCNDA_HIST_DB = path.join(work, 'pas-de-pack.sqlite'); // la base d'essai part SANS le pack
process.env.LCNDA_TEST_HIST_DIR = site;

const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    try {
        const api = (a, q = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y).then(r => r, e => ({error: e.message})), [a, q]);
        const post = (a, b = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}).then(r => r.result || r, e => ({error: e.message})), [a, b]);
        const idle = async () => { await sleep(300); await p.waitForFunction(() => !document.querySelector('#workspace .loading-screen, #workspace .ld-page .ui-spinner'), null, {timeout: 30000}).catch(() => {}); await sleep(200); };
        const openList = async key => { await p.evaluate(k => { window.LCNDA_EXT.donneesOnglet.open(k); window.LCNDA_APP.setModule('donnees'); }, key); await idle(); };
        const missing = () => p.evaluate(() => !!document.querySelector('#workspace .ld-page[data-ld-missing]'));
        const rowsShown = () => p.$$eval('#workspace .ld-page [data-ld-results] [data-ld-row]', a => a.length);
        const toasts = () => p.$$eval('.ui-toast, .toast', a => a.map(x => x.textContent.trim()).join(' | '));
        const waitRows = (ms = 8000) => p.waitForFunction(() => !document.querySelector('#workspace .ld-page[data-ld-missing]') && document.querySelectorAll('#workspace .ld-page [data-ld-results] [data-ld-row]').length > 0, null, {timeout: ms});
        const recapMissing = async () => { await p.evaluate(() => { window.LCNDA_EXT.dataHome?.setPlace?.('deux', {undo: false}); window.LCNDA_EXT.donneesOnglet.open('dno_recap'); window.LCNDA_APP.setModule('donnees'); }); await idle();
            await p.waitForFunction(() => /listes installées sur/.test(document.querySelector('#workspace [data-dr-foot]')?.textContent || ''), null, {timeout: 20000});
            const txt = await p.textContent('#workspace [data-dr-foot]'); const m = txt.match(/📦\s*([\d\s ]+)/); return m ? Number(m[1].replace(/\D/g, '')) : 0; };
        const themeTag = async () => { await p.evaluate(() => { window.LCNDA_EXT.donneesOnglet.open('data_theme_seismes'); window.LCNDA_APP.setModule('donnees'); }); await idle();
            const lists = p.locator('.ldt-tabs [data-ldt-tab="lists"]'); if (await lists.count()) { await lists.first().click(); await idle(); }
            await sleep(1500); return p.evaluate(() => document.querySelector('[data-ld-go="data_hist_seismes"]')?.textContent || ''); };

        /* ═════════ 1. le serveur ═════════ */
        await t('serveur : ld_status, ld_query, ld_famille répondent (plus « Action inconnue ») ; les Lieux en double gardent ld_groups', async () => {
            const s = await api('ld_status'); assert.ok(!s.error, JSON.stringify(s)); assert.strictEqual(s.installed.hist_seismes, false);
            const q = await api('ld_query', {src: 'gov_noms', query: '{}'}); assert.ok(!/Action inconnue/.test(q.error || ''), JSON.stringify(q));
            const f = await api('ld_famille'); assert.ok(!f.error && Array.isArray(f.places), JSON.stringify(f).slice(0, 200));
            const g = await api('ld_groups'); assert.ok(!g.error, JSON.stringify(g).slice(0, 200));
        });

        /* ═════════ 2. avant ═════════ */
        let recap0 = 0;
        await t('avant : la page « pas encore sur cet ordinateur » avec 📦 Installer et ↻ recharger ; le thème « à télécharger » ; le récap compte les ⤓', async () => {
            await openList('data_hist_seismes');
            assert.ok(await missing(), 'page « pas encore »');
            assert.ok(await p.$('#workspace [data-ld-install]') && await p.$('#workspace [data-ld-reload]'));
            assert.match(await themeTag(), /à télécharger|à installer/);
            recap0 = await recapMissing(); assert.ok(recap0 >= 6, `récap 📦 ${recap0}`);
        });

        /* ═════════ 3. une installation ratée ═════════ */
        await t('installation ratée (pack abîmé) : un message clair en français, rien d’installé, la page dit toujours « pas encore »', async () => {
            const bad = Buffer.from(PACK); bad[bad.length - 100] ^= 0xff; publish(bad);
            await openList('data_hist_seismes');
            await p.click('#workspace [data-ld-install]'); await idle();
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.module), 'maintenance');
            await p.waitForSelector('#workspace [data-hist-dl]', {timeout: 20000}); await p.click('#workspace [data-hist-dl]');
            await p.waitForFunction(() => /abîmé|incomplet|ne peut pas être lu|rien n’a été installé/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 30000});
            assert.ok(!/installée \(/.test(await toasts()), 'jamais « installée »');
            assert.strictEqual((await api('hist_status')).installed, false);
            await p.goBack(); await idle();
            assert.ok(await missing(), 'toujours « pas encore »');
        });

        /* ═════════ 4. la vérification en panne ; « ↻ recharger » relit vraiment ═════════ */
        await t('vérification en panne : un message d’erreur (pas « pas installé ») ; ↻ recharger relit tout de suite, sans mémoire', async () => {
            publish(PACK);
            await openList('data_hist_seismes');
            await p.route(/action=ld_status/, r => r.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({error: 'Le serveur est en panne (essai).'})}));
            await p.click('#workspace [data-ld-reload]'); await idle();
            const err = await p.textContent('#workspace [data-ld-install-err]').catch(() => '');
            assert.match(err, /Impossible de vérifier.*panne \(essai\)/, err);
            await p.unroute(/action=ld_status/);
            // installé « par-derrière » (sans passer par l'écran) : ↻ recharger le voit tout de suite (avant : 15 s de mémoire)
            fs.mkdirSync(path.join(B.tmp, 'histoire'), {recursive: true}); fs.writeFileSync(path.join(B.tmp, 'histoire', 'histoire-locale.sqlite'), PACK.subarray(4096));
            await p.click('#workspace [data-ld-reload]'); await waitRows();
            assert.strictEqual(await rowsShown(), 3);
            fs.rmSync(path.join(B.tmp, 'histoire', 'histoire-locale.sqlite'));
            await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.forgetInstalls()); await openList('data_hist_seismes'); assert.ok(await missing());
        });

        /* ═════════ 5. installé pendant que la page est ouverte ═════════ */
        await t('installé pendant que la page est ouverte : les lignes arrivent toutes seules ; ↶ : la page revient à « pas encore »', async () => {
            await openList('data_hist_seismes'); assert.ok(await missing());
            const s = await post('hist_dl_start'); assert.ok(s.id, JSON.stringify(s));
            for (let i = 0; i < 10; i++) { const r = await post('hist_dl_step', {id: s.id}); assert.ok(!r.error, JSON.stringify(r)); if (r.done) break; }
            const f = await post('hist_pack_finish', {id: s.id}); assert.ok(!f.error, JSON.stringify(f));
            await waitRows(); assert.strictEqual(await rowsShown(), 3);
            assert.match(await p.textContent('#workspace [data-ld-results]'), /BALE/);
            await post('hist_pack_undo');
            await p.waitForFunction(() => !!document.querySelector('#workspace .ld-page[data-ld-missing]'), null, {timeout: 8000});
        });

        /* ═════════ 6. le vrai chemin : 📦 Installer → Réglages → ← ═════════ */
        await t('📦 Installer → Réglages → Histoire du lieu → ⤓ → ← : les lignes tout de suite ; le thème et le récap à jour', async () => {
            await openList('data_hist_seismes');
            await p.click('#workspace [data-ld-install]'); await idle();
            await p.waitForSelector('#workspace [data-hist-dl]', {timeout: 20000}); await p.click('#workspace [data-hist-dl]');
            await p.waitForFunction(() => /Histoire du lieu installée/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 30000});
            await p.goBack(); await waitRows(); // aussitôt : plus de mémoire de 15 s
            assert.strictEqual(await rowsShown(), 3);
            assert.ok(!/à télécharger|à installer/.test(await themeTag()), 'le thème ne dit plus « à télécharger »');
            const recap1 = await recapMissing(); assert.ok(recap1 <= recap0 - 6, `récap 📦 ${recap0} → ${recap1}`);
        });
        await t('Réglages → 🗂 Données : « Histoire du lieu » installé', async () => {
            await p.evaluate(() => { const st = window.LCNDA_APP.state; st.maintenanceTab = 'donnees_installees'; window.LCNDA_APP.setModule('maintenance'); }); await idle();
            await p.waitForSelector('[data-dmaj-panel]', {timeout: 20000}); await sleep(1500);
            const line = await p.evaluate(() => [...document.querySelectorAll('[data-dmaj-panel] tr, [data-dmaj-panel] li, [data-dmaj-panel] [data-dmaj-row]')].map(x => x.textContent).find(x => /Histoire du lieu/.test(x)) || '');
            assert.match(line, /installé/, line.slice(0, 200)); assert.ok(!/pas installé/.test(line), line.slice(0, 200));
        });

        /* ═════════ 7. d'autres sortes de listes ═════════ */
        await t('pack livré (tf-ballons), pack GitHub (tb-osm, si allumé) : des lignes, jamais « pas encore » ; une liste « lien » : pas de 📦 Installer', async () => {
            const E = await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.list().map(d => ({id: d.id, key: window.LCNDA_EXT.dataListsEngine.keyOf(d), link: !!d.link, installed: !!d.installed, install: !!d.install})));
            for (const id of ['tf_ballons', 'tb_berger']) {
                const d = E.find(x => x.id === id); if (!d) { console.log(`  (${id} pas dans les listes : sauté)`); continue; }
                await openList(d.key); assert.ok(!(await missing()), id);
                await p.waitForFunction(() => document.querySelectorAll('#workspace .ld-page [data-ld-results] [data-ld-row]').length > 0 || /Aucune|Rien/.test(document.querySelector('#workspace [data-ld-results]')?.textContent || ''), null, {timeout: 15000});
            }
            const links = E.filter(x => x.link); assert.ok(links.length > 0);
            assert.deepStrictEqual(links.filter(x => x.installed).map(x => x.id), [], 'une liste « lien » ne se vérifie pas (jamais « à installer »)');
        });
        await t('aucune erreur dans la page', async () => assert.deepStrictEqual(B.errs || [], []));
    } finally {
        await B.stop();
        fs.rmSync(work, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
