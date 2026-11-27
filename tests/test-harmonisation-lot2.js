'use strict';
/**
 * Harmonisation des comportements, 2ᵉ lot (docs/harmonisation.md, « Comportements ») :   node tests/test-harmonisation-lot2.js
 *  1. « ↶ Annuler » au lieu de « Es-tu sûr ? » (le serveur est vérifié par tests/test-h7-remises.js) : ici, pour de vrai dans
 *     le navigateur, les cartes d'électeur d'une fiche effacées sans question puis remises par ↶ Annuler ;
 *  2. cocher plusieurs lignes : les photos « À ranger » d'un recueil passent par la barre commune (selectionBar) ;
 *  4. ⤓ Exporter : les outils qui fabriquaient leur CSV eux-mêmes ouvrent la fenêtre d'export commune (UI.exportRows) :
 *     📄 CSV, 🧮 Ouvrir dans le tableur, 📊 Excel, « Ce qu'on voit / Toute la liste » ; une case « =… » ne devient pas une formule.
 *  LCNDA_SKIP_BROWSER=1 : seulement les vérifications du code. Données inventées (MAZAUD, LACOMBE, DURAND).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let passed = 0;
const step = async (name, fn) => { try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); process.exitCode = 1; } };

// les outils qui passent maintenant par la fenêtre d'export commune (un « ⤓ Exporter » = la même fenêtre)
const EXPORTS = ['heritage-periodicals', 'app-paniers', 'heritage-records', 'heritage-controle', 'heritage-successoral', 'heritage-successoral-dossiers', 'heritage-pets',
    'heritage-journal', 'heritage-recueil-etat', 'heritage-recueil-fonds', 'heritage-onglets-catalogue', 'heritage-columns', 'app-graphiques', 'heritage-more', 'heritage-dna',
    'heritage-widgets', 'heritage-suivi', 'app-tableau-de-bord'];

(async () => {
    await step('⤓ Exporter : la fenêtre commune partout où un outil faisait son CSV lui-même', () => {
        const ui = read('assets/js/app-ui.js');
        assert.match(ui, /UI\.exportRows = \(/, 'UI.exportRows (app-ui.js)');
        for (const id of ["id: 'csv'", "id: 'sheet'", "id: 'xlsx'", "['all', i18n('Toute la liste')]"]) assert.ok(ui.includes(id), id);
        for (const f of EXPORTS) assert.match(read(`assets/js/${f}.js`), /exportRows\(/, `${f}.js passe par UI.exportRows`);
        // les boutons disent « ⤓ Exporter » (plus « Exporter (CSV) », « ⬇ Tableur (CSV) », « Exporter en CSV »)
        assert.ok(!read('assets/js/heritage-periodicals.js').includes('⤓ Exporter en CSV<'));
        assert.ok(!read('assets/js/heritage-records.js').includes('Exporter (CSV)<'));
        assert.ok(!read('assets/js/heritage-pets.js').includes('⬇ Tableur (CSV)'));
    });
    await step('cocher plusieurs photos « À ranger » d’un recueil : la barre commune', () => {
        const rc = read('assets/js/heritage-recueils.js');
        assert.match(rc, /ext\.selectionBar\(\{host: [^\n]*rowSelector: '\.h-rc-loose-item'/);
        assert.ok(!rc.includes('data-rc-pickall'), 'plus de « Tout cocher » fait à la main');
        assert.ok(!rc.includes('data-rc-check'), 'plus de case faite à la main');
    });
    await step('les textes sont traduits (fr en es de it pt pl nl)', () => {
        const tsv = read('assets/i18n/src/comportements-lot2.tsv').split('\n').filter(l => l && !l.startsWith('fr ¦'));
        assert.ok(tsv.length > 20);
        for (const l of tsv) assert.equal(l.split(' ¦ ').length, 8, l);
    });

    if (process.env.LCNDA_SKIP_BROWSER === '1') { console.log(process.exitCode ? 'Échec' : `✓ Harmonisation lot 2 : ${passed} vérifications (sans navigateur)`); return; }
    const {start, sleep} = require('./prendre-depuis-seed.js');
    const B = await start({});
    const {page} = B;
    const lastToast = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.querySelector('.ui-toast-text')?.textContent || '').filter(Boolean).at(-1) || '');
    const clickToast = async label => { await page.locator('.ui-toast-btn', {hasText: label}).last().click(); };
    try {
        await step('cartes d’électeur : effacées sans question, ↶ Annuler les remet', async () => {
            await page.evaluate(() => window.LCNDA_APP.api('save_voter_cards', {}, {method: 'POST', body: {person_id: 1, cards: [{commune: 'Tulle', card_number: '1234'}], votes: [{date_text: '1919', election: Object.keys({})[0] || '', place_text: 'Tulle', note: 'premier vote'}]}}));
            await page.evaluate(() => window.LCNDA_APP.openPersonById(1)); await page.waitForSelector('[data-h-voter-clear]', {timeout: 20000});
            await page.locator('[data-h-voter-clear]').first().click({force: true});
            await page.waitForFunction(() => [...document.querySelectorAll('.toast .ui-toast-text')].some(t => /électeur/.test(t.textContent)), null, {timeout: 10000});
            assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open].confirm-box-dialog')), false, 'pas de « Es-tu sûr ? »');
            assert.equal((await page.evaluate(() => window.LCNDA_APP.api('voter', {person_id: 1}))).cards.length, 0, 'effacées');
            await clickToast('Annuler'); await sleep(800);
            const d = await page.evaluate(() => window.LCNDA_APP.api('voter', {person_id: 1}));
            assert.deepEqual([d.cards.map(c => c.commune), d.votes.map(v => v.note)], [['Tulle'], ['premier vote']]);
            assert.match(await lastToast(), /Annulé/);
        });

        await step('⤓ Exporter : la fenêtre commune (CSV, tableur, Excel, ce qu’on voit / toute la liste), sans formule glissée', async () => {
            await page.evaluate(() => { window.__exp = window.LCNDA_UI.exportRows({title: 'Essai', name: 'essai MAZAUD', rows: () => [['Nom', 'Note'], ['MAZAUD', '=1+1']], all: () => [['Nom', 'Note'], ['MAZAUD', '=1+1'], ['LACOMBE', 'x'], ['DURAND', 'y']]}); });
            await page.waitForSelector('dialog.ui-export[open]');
            const fm = await page.$$eval('dialog.ui-export .ui-export-fmt', l => l.map(x => x.dataset.fmt));
            assert.deepEqual(fm, ['csv', 'sheet', 'xlsx']);
            assert.match(await page.$eval('dialog.ui-export', d => d.innerText), /Toute la liste/);
            assert.equal(await page.inputValue('dialog.ui-export [data-ui-name]'), 'essai-mazaud');
            await page.selectOption('dialog.ui-export [data-ui-fsel="what"]', 'all');
            const [dl] = await Promise.all([page.waitForEvent('download'), page.click('dialog.ui-export [data-ui-go]')]);
            assert.equal(dl.suggestedFilename(), 'essai-mazaud.csv');
            const csv = fs.readFileSync(await dl.path(), 'utf8');
            assert.match(csv, /DURAND/, 'toute la liste'); assert.match(csv, /'=1\+1/, 'la case « =1+1 » reste du texte');
            await sleep(300); assert.equal(await page.$('dialog.ui-export[open]'), null, 'la fenêtre se ferme');
        });

        await step('recueil, photos « À ranger » : la barre commune (Tout cocher, Maj+clic, 📁 dossier, ✕ Décocher)', async () => {
            const rid = await page.evaluate(async () => {
                const api = (a, b) => window.LCNDA_APP.api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
                const r = await api('save_recueil', {title: 'Registre MAZAUD', first_version: 'Photos'});
                const d = await window.LCNDA_APP.api('recueil', {id: r.id});
                await api('recueil_add_images', {recueil_id: r.id, version_id: d.versions[0].id, media_ids: [1, 2, 3, 4], mode: 'loose'});
                await api('save_recueil_trays', {recueil_id: r.id, trays: ['Liste A']});
                return r.id;
            });
            await page.evaluate(id => { window.LCNDA_EXT.openRecueil(id); window.LCNDA_APP.state.hRecueil.tab = 'pages'; window.LCNDA_APP.setModule('listes'); }, rid);
            await page.waitForSelector('.h-rc-loose .sel-bar', {timeout: 20000});
            assert.equal(await page.locator('.h-rc-loose-item .sel-box input').count(), 4, 'une case par photo');
            await page.locator('.h-rc-loose-item .sel-box input').nth(0).click();
            await page.locator('.h-rc-loose-item .sel-box input').nth(2).click({modifiers: ['Shift']});
            assert.match(await page.textContent('.h-rc-loose .sel-bar'), /3 photos cochées/, 'Maj+clic coche la suite');
            assert.match(await page.textContent('.h-rc-loose .sel-bar'), /Mettre dans un dossier/);
            await page.locator('.h-rc-loose .sel-bar button', {hasText: 'Mettre dans un dossier'}).click();
            await page.waitForSelector('dialog[open] select[name=tray]'); await page.selectOption('dialog[open] select[name=tray]', 'Liste A');
            await page.click('dialog[open] button[type=submit]');
            await page.waitForFunction(id => window.LCNDA_APP.api('recueil', {id}).then(d => d.images.filter(i => i.tray === 'Liste A').length === 3), rid, {timeout: 10000}).catch(() => {});
            const d = await page.evaluate(id => window.LCNDA_APP.api('recueil', {id}), rid);
            assert.equal(d.images.filter(i => i.tray === 'Liste A').length, 3, 'les 3 cochées sont rangées dans « Liste A »');
            await page.waitForSelector('.h-rc-loose .sel-bar');
            assert.doesNotMatch(await page.textContent('.h-rc-loose .sel-bar'), /cochées/, 'plus rien de coché après rangement');
        });

        await step('pas d’erreur JavaScript', () => assert.deepEqual(B.errs, []));
    } finally { await B.stop(); }
    console.log(process.exitCode ? 'Échec' : `✓ Harmonisation lot 2 : ${passed} vérifications`);
})();
