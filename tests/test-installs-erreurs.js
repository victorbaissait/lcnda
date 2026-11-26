#!/usr/bin/env node
/* ⚠ « Est-ce installé ? » : quand la VÉRIFICATION échoue (serveur en panne, route perdue), l'écran le dit — jamais « pas encore installé ».
 *  Le bogue d'origine : ld_status répondait « Action inconnue » (route ld_* avalée), et chaque écran le lisait comme « rien d'installé ».
 *  Les mêmes replis silencieux existaient ailleurs ; ils sont tous essayés ici, la vérification mise en panne (page.route → 500) :
 *   1. le serveur : ld_status donne aussi « errors » (un pack qui ne s'ouvre pas n'est pas « pas installé ») ;
 *   2. 🧰 thèmes (app-listes-themes.js) : « ⚠ Vérification impossible », pas « à télécharger » ; revérifié quand le serveur revient ;
 *   3. 📊 récap (app-donnees-accueil.js) : « ⚠ Vérification impossible (N) » à côté du compte, pas des « ⤓ » en trop ;
 *   4. 📋 vue d'ensemble des listes (app-listes-donnees.js) : la pastille « ⚠ », pas « à installer » ;
 *   5. Réglages → 🗂 Données (app-listes-maj.js) : une famille dont l'état ne se lit pas → ligne « ⚠ Vérification impossible », pas « ⤓ Télécharger » ;
 *   6. une page de pack (🏰 GOV, heritage-gov.js) : un message d'erreur (toast), pas seulement « ⤓ Installer » ;
 *   7. les décès INSEE installés ou retirés (app-recherche.js) : les mémoires « installé ? » sont oubliées (lcnda:installs-changed).
 * Base : tests/prendre-depuis-seed.js (rien à télécharger).   node tests/test-installs-erreurs.js */
'use strict';
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-instErr-'));
process.env.LCNDA_HIST_DB = path.join(work, 'pas-de-pack.sqlite'); // la base d'essai part SANS le pack « Histoire du lieu »
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const PANNE = {status: 500, contentType: 'application/json', body: JSON.stringify({error: 'Le serveur est en panne (essai).'})};

(async () => {
    const B = await start({empty: true});
    const p = B.page;
    try {
        const api = (a, q = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y).then(r => r, e => ({error: e.message})), [a, q]);
        const idle = async () => { await sleep(300); await p.waitForFunction(() => !document.querySelector('#workspace .loading-screen, #workspace .ld-page .ui-spinner'), null, {timeout: 30000}).catch(() => {}); await sleep(200); };
        const forget = () => p.evaluate(() => window.LCNDA_EXT.dataListsEngine.forgetInstalls());
        const toasts = () => p.$$eval('.ui-toast, .toast', a => a.map(x => x.textContent.trim()).join(' | '));
        const themeTag = async () => { await p.evaluate(() => { window.LCNDA_EXT.donneesOnglet.open('data_theme_seismes'); window.LCNDA_APP.setModule('donnees'); }); await idle();
            const lists = p.locator('.ldt-tabs [data-ldt-tab="lists"]'); if (await lists.count()) { await lists.first().click(); await idle(); }
            await sleep(1500); return p.evaluate(() => document.querySelector('[data-ld-go="data_hist_seismes"]')?.textContent || ''); };
        const recapFoot = async () => { await p.evaluate(() => { window.LCNDA_EXT.dataHome?.setPlace?.('deux', {undo: false}); window.LCNDA_EXT.donneesOnglet.open('dno_recap'); window.LCNDA_APP.setModule('donnees'); }); await idle();
            await p.waitForFunction(() => /listes installées sur|Impossible de vérifier/.test(document.querySelector('#workspace [data-dr-foot]')?.textContent || ''), null, {timeout: 30000});
            return p.textContent('#workspace [data-dr-foot]'); };

        await t('serveur : ld_status dit ce qui est installé ET les packs qui ne s’ouvrent pas (errors), à part', async () => {
            const s = await api('ld_status'); assert.ok(!s.error, JSON.stringify(s));
            assert.strictEqual(s.installed.hist_seismes, false); assert.ok(s.errors && typeof s.errors === 'object' && !Array.isArray(s.errors), JSON.stringify(s.errors));
        });

        await t('🧰 thèmes : la vérification en panne → « ⚠ Vérification impossible » (pas « à télécharger ») ; le serveur revenu → « à télécharger »', async () => {
            await forget(); await p.route(/action=ld_status/, r => r.fulfill(PANNE));
            const bad = await themeTag();
            assert.match(bad, /Vérification impossible/, bad); assert.doesNotMatch(bad, /à télécharger|à installer/, bad);
            assert.match(await p.getAttribute('[data-ld-go="data_hist_seismes"] .ldt-tag.is-warn', 'title') || '', /panne \(essai\)/);
            await p.unroute(/action=ld_status/); await forget();
            const ok = await themeTag(); assert.match(ok, /à télécharger|à installer/, ok);
        });

        await t('📊 récap : la vérification en panne → « ⚠ Vérification impossible (N) », pas des ⤓ comptés pour rien', async () => {
            await forget(); const before = await recapFoot(); const n0 = Number((before.match(/⤓\s*([\d\s ]+)/) || [0, '0'])[1].replace(/\D/g, '')); assert.ok(n0 >= 6, before);
            await p.route(/action=ld_status/, r => r.fulfill(PANNE)); await forget();
            const foot = await recapFoot();
            assert.match(foot, /Vérification impossible \(\d+\)/, foot);
            const n1 = Number((foot.match(/⤓\s*([\d\s ]+)/) || [0, '0'])[1].replace(/\D/g, ''));
            assert.ok(n1 < n0, `les listes des packs ne sont plus comptées « ⤓ » : ${n1} (avant ${n0})`);
            await p.unroute(/action=ld_status/); await forget();
            assert.doesNotMatch(await recapFoot(), /Vérification impossible/);
        });

        await t('📋 vue d’ensemble des listes : la pastille « ⚠ Vérification impossible », pas « à installer »', async () => {
            await p.route(/action=ld_status/, r => r.fulfill(PANNE)); await forget();
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data'; A.setModule('listes'); window.LCNDA_EXT.dataListsEngine.overview?.(A.state.workspaceToken); }); await idle(); await sleep(1500);
            const tag = await p.evaluate(() => document.querySelector('[data-ld-state="hist_seismes"]')?.textContent ?? null);
            if (tag !== null) { assert.match(tag, /Vérification impossible/, tag); assert.doesNotMatch(tag, /à installer/, tag); }
            await p.unroute(/action=ld_status/); await forget();
        });

        await t('Réglages → 🗂 Données : l’état d’une famille illisible → « ⚠ Vérification impossible » (pas « ⤓ Télécharger ») ; revenu → normal', async () => {
            await p.route(/action=gov_status/, r => r.fulfill(PANNE));
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'donnees_installees'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-dmaj-panel] [data-dmaj-row]', {timeout: 30000});
            assert.strictEqual(await p.getAttribute('[data-dmaj-row="gov:gov"]', 'data-dmaj-state'), 'error');
            const row = await p.textContent('[data-dmaj-row="gov:gov"]'); assert.match(row, /Vérification impossible/, row); assert.doesNotMatch(row, /Télécharger/, row);
            assert.match(await p.getAttribute('[data-dmaj-row="gov:gov"] .dmaj-state', 'title') || '', /panne \(essai\)/);
            assert.strictEqual(await p.getAttribute('[data-dmaj-row="hist:histoire"]', 'data-dmaj-state'), 'missing', 'les autres familles : comme avant');
            await p.unroute(/action=gov_status/);
            await p.evaluate(() => { window.LCNDA_APP.setModule('donnees'); }); await idle();
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'donnees_installees'; A.setModule('maintenance'); });
            await p.waitForFunction(() => document.querySelector('[data-dmaj-row="gov:gov"]')?.dataset.dmajState === 'missing', null, {timeout: 30000});
        });

        await t('🏰 page GOV : l’état illisible → un message d’erreur clair (toast), en français', async () => {
            await p.route(/action=gov_status/, r => r.fulfill(PANNE));
            await p.evaluate(() => window.LCNDA_EXT.gov?.openSettings?.());
            await p.waitForFunction(() => /Impossible de vérifier si ces données sont installées.*panne \(essai\)/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 20000})
                .catch(async () => { throw new Error('pas de message : ' + await toasts()); });
            await p.unroute(/action=gov_status/);
        });

        await t('⚰️ décès INSEE installés : « lcnda:installs-changed » (les thèmes, le récap et les listes revérifient)', async () => {
            const n = await p.evaluate(() => new Promise(res => { let k = 0; const on = () => { k++; }; window.addEventListener('lcnda:installs-changed', on);
                const f = window.LCNDA_EXT?.dataListsEngine?.forgetInstalls; // le même chemin qu'app-recherche.js : imInstallsChanged()
                if (f) f(); setTimeout(() => { window.removeEventListener('lcnda:installs-changed', on); res(k); }, 100); }));
            assert.ok(n >= 1, 'forgetInstalls prévient tout le monde');
            const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'app-recherche.js'), 'utf8');
            assert.match(src, /function imFinished\(f\)\{\s*imInstallsChanged\(\);/, 'imFinished oublie les mémoires « installé ? »');
            assert.ok((src.match(/imInstallsChanged\(\);/g) || []).length >= 3, 'et le retrait d’une année aussi');
        });
    } finally {
        await B.stop();
        try { fs.rmSync(work, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
