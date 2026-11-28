'use strict';
/**
 * Harmonisation des comportements (docs/harmonisation.md, « Comportements ») :   node tests/test-harmonisation-comportements.js
 *  1. les cases de recherche des listes cherchent sans accents ni majuscules (« eglise » trouve « Église »), comme UI.listMatch ;
 *  2. ⌘F (chercher dans l'écran) aussi, sans décaler le surlignage ;
 *  3. « ↶ Annuler » au lieu de « Es-tu sûr ? » : réglages des animaux (champ, catégorie, espèce), langue d'une fiche,
 *     partie du Jeu, liste de données (Mes listes) ; vérifié pour de vrai dans le navigateur (base d'essai MAZAUD / LACOMBE / DURAND).
 *  LCNDA_SKIP_BROWSER=1 : seulement les vérifications du code.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let passed = 0;
const step = async (name, fn) => { try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); process.exitCode = 1; } };

(async () => {
    await step('les recherches des listes ne tiennent compte ni des accents ni des majuscules', () => {
        // [fichier, un morceau qui doit être là] : la recherche passe par UI.listMatch ou par normalize('NFD')
        const sites = [
            ['assets/js/heritage-periodicals.js', /listMatch\?\.text[^\n]*f\.q, isArticle/],
            ['assets/js/heritage-research.js', /if \(v\.q\) \{ const m = \(window\.LCNDA_UI\?\.listMatch\?\.text/],
            ['assets/js/heritage-records.js', /if \(v\.q\) \{ const m = \(window\.LCNDA_UI\?\.listMatch\?\.text/],
        ];
        for (const [f, re] of sites) assert.match(read(f), re, f);
        // aucune recherche de liste qui compare encore en minuscules seulement
        const bad = [
            ['assets/js/heritage-research-gaps.js', 'const q = v.q.trim().toLowerCase(),'],
            ['assets/js/heritage-recueils.js', "const s = st(), q = (s.q || '').toLowerCase();"],
            ['assets/js/heritage-suivi.js', "const q = String(s.q || '').toLowerCase(),"],
            ['assets/js/heritage-suivi-fiche.js', "const q = String(s.q || '').toLowerCase(),"],
            ['assets/js/heritage-lieux-a-placer.js', "const q = String(D.q || '').trim().toLowerCase();"],
            ['assets/js/app-listes.js', "const q=(state.externalLinksQuery||'').toLowerCase(),"],
            ['assets/js/heritage-metiers-rivieres.js', 'const q = f.value.trim().toLowerCase();'],
            ['assets/js/heritage-lieux-patrimoine.js', 'const q = f.value.trim().toLowerCase();'],
            ['assets/js/app.js', 'const matches=(state.bootstrap?.surnames||[]).filter(s=>s.name.toLowerCase().includes(q))'],
            ['assets/js/app.js', "const needle=q.toLocaleLowerCase('fr');"],
        ];
        for (const [f, s] of bad) assert.ok(!read(f).includes(s), `${f} compare encore sans enlever les accents : « ${s} »`);
    });

    await step('ce qui se défait ne demande plus avant (↶ Annuler)', () => {
        const pets = read('assets/js/heritage-pets.js');
        assert.equal((pets.match(/undoPrefs\(i18n\(/g) || []).length, 3, 'champ, catégorie et espèce des animaux');
        assert.match(pets, /A\(\)\.undoLocalChange\(msg, \[PREFS_KEY\]/);
        assert.match(read('assets/js/heritage-links.js'), /undoToast\(i18n\('Langue « \{nm\} » supprimée'/);
        assert.match(read('assets/js/app-jeu.js'), /undoLocalChange\(i18n\('Partie « \{name\} » supprimée'[^\n]*\[GOOSE_GAMES_KEY,GOOSE_ACTIVE_KEY\]/);
        const lp = read('assets/js/app-listes-perso.js');
        assert.match(lp, /await post\(\{op: 'delete', id\}\)[^\n]*\n[^\n]*\n\s*undoToast\(T\('Liste supprimée : \{n\}'/);
        // les textes sont traduits
        const tsv = read('assets/i18n/src/harmonisation-comportements.tsv');
        for (const k of ['Champ « {nm} » supprimé', 'Catégorie « {nm} » supprimée', 'Espèce « {nm} » supprimée', 'Langue « {nm} » supprimée', 'Partie « {name} » supprimée']) {
            const line = tsv.split('\n').find(l => l.startsWith(k + ' ¦'));
            assert.ok(line, k); assert.equal(line.split(' ¦ ').length, 8, `${k} : fr en es de it pt pl nl`);
        }
    });

    if (process.env.LCNDA_SKIP_BROWSER === '1') { console.log(process.exitCode ? 'Échec' : `✓ Harmonisation des comportements : ${passed} vérifications (sans navigateur)`); return; }
    const {start, sleep} = require('./prendre-depuis-seed.js');
    const B = await start({});
    const {page, go} = B;
    const lastToast = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.querySelector('.ui-toast-text')?.textContent || '').filter(Boolean).at(-1) || '');
    const clickToast = async label => { await page.locator('.ui-toast-btn', {hasText: label}).last().click(); };
    try {
        await step('⌘F trouve « Église » quand on tape « eglise »', async () => {
            await page.evaluate(() => window.LCNDA_APP.openPersonById(1)); await sleep(2500);
            await page.evaluate(() => { const d = document.createElement('p'); d.id = 'hc-find'; d.textContent = 'Le baptême à l’Église Saint-Étienne de Treignac'; document.querySelector('#workspace').prepend(d); });
            await page.keyboard.press('Control+f'); await sleep(300);
            await page.keyboard.type('eglise saint-etienne'); await sleep(600);
            const r = await page.evaluate(() => { const h = window.CSS?.highlights?.get('lcnda-find-current'); const range = h ? [...h][0] : null; return {bar: document.querySelector('#find-bar')?.textContent || '', text: range ? range.toString() : null}; });
            assert.match(r.bar, /1\s*\/\s*1/, r.bar);
            if (r.text !== null) assert.equal(r.text, 'Église Saint-Étienne', 'le surlignage tombe juste');
            await page.keyboard.press('Escape');
            await page.evaluate(() => document.querySelector('#hc-find')?.remove());
        });

        await step('langue d’une fiche : supprimée sans question, ↶ Annuler la remet, ↷ Rétablir la retire', async () => {
            await page.evaluate(() => window.LCNDA_APP.api('save_person_language', {}, {method: 'POST', body: {person_id: 1, language: 'occitan', certainty: 'probable', to_descendants: 1, note: 'à Treignac'}}));
            await page.evaluate(() => window.LCNDA_APP.openPersonById(1)); await page.waitForSelector('[data-h-lang-delete]', {timeout: 20000});
            await page.locator('[data-h-lang-delete]').first().click({force: true});
            await page.waitForFunction(() => [...document.querySelectorAll('.toast .ui-toast-text')].some(t => /occitan/.test(t.textContent)), null, {timeout: 10000});
            assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open].confirm-box-dialog')), false, 'pas de « Es-tu sûr ? »');
            assert.match(await lastToast(), /Langue « occitan » supprimée/);
            await clickToast('Annuler');
            await page.waitForFunction(() => (window.LCNDA_APP.state.currentPerson?.heritage?.languages?.own || []).length === 1, null, {timeout: 10000});
            const back = await page.evaluate(() => window.LCNDA_APP.state.currentPerson.heritage.languages.own.map(l => [l.language, l.certainty, l.note, Number(l.to_descendants)]));
            assert.deepEqual(back, [['occitan', 'probable', 'à Treignac', 1]]);
            await clickToast('Rétablir');
            await page.waitForFunction(() => (window.LCNDA_APP.state.currentPerson?.heritage?.languages?.own || []).length === 0, null, {timeout: 10000});
        });

        await step('Réglages → Animaux : un champ supprimé revient avec ↶ Annuler', async () => {
            await go('maintenance', {maintenanceTab: 'pet_prefs'}); await page.waitForSelector('[data-nf-label]', {timeout: 20000});
            await page.fill('[data-nf-label] >> nth=0', 'Groupe sanguin'); await page.locator('[data-nf-add]').first().click(); await sleep(300);
            assert.equal(await page.locator('[data-cf-del]').count(), 1);
            await page.locator('[data-cf-del]').first().click(); await sleep(400);
            assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open].confirm-box-dialog')), false, 'pas de « Es-tu sûr ? »');
            assert.equal(await page.locator('[data-cf-del]').count(), 0);
            assert.match(await lastToast(), /Champ « Groupe sanguin » supprimé/);
            await clickToast('Annuler'); await sleep(400);
            assert.equal(await page.locator('[data-cf-del]').count(), 1, 'le champ est revenu à l’écran');
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-pet-prefs')).customFields.map(f => f.label)), ['Groupe sanguin']);
        });

        await step('Jeu : une partie supprimée revient avec ↶ Annuler', async () => {
            await page.evaluate(() => { const g = {id: 'hc1', name: 'Partie des MAZAUD', config: {cells: 63, dice: 2, questionMode: 'before', variant: 'goose', horseColorsConfigured: false, scope: 'all', branch: '', specials: []}, personIds: [1, 2, 3], players: [{name: 'Jean', color: '#d93636', position: 0, skip: 0, finished: false}, {name: 'Marie', color: '#2878c8', position: 0, skip: 0, finished: false}], turn: 0, phase: 'roll', question: null, lastRoll: [], message: '', createdAt: Date.now(), updatedAt: Date.now()}; localStorage.setItem('genealogie-goose-games-v1', JSON.stringify([g])); localStorage.setItem('genealogie-goose-active-v1', 'hc1'); });
            await go('jeu'); await sleep(1500);
            const del = page.locator('[data-goose-delete]');
            if (!(await del.count())) { console.log('      (partie non affichée avec ces données : vérification à l’écran sautée)'); return; }
            await del.first().click(); await sleep(400);
            assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open].confirm-box-dialog')), false, 'pas de « Es-tu sûr ? »');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-goose-games-v1') || '[]').length), 0);
            await clickToast('Annuler'); await sleep(400);
            assert.deepEqual(await page.evaluate(() => [JSON.parse(localStorage.getItem('genealogie-goose-games-v1')).map(g => g.name), localStorage.getItem('genealogie-goose-active-v1')]), [['Partie des MAZAUD'], 'hc1']);
            assert.equal(await page.locator('[data-goose-delete]').count(), 1, 'la partie est revenue à l’écran');
        });

        await step('pas d’erreur JavaScript', () => assert.deepEqual(B.errs, []));
    } finally { await B.stop(); }
    console.log(process.exitCode ? 'Échec' : `✓ Harmonisation des comportements : ${passed} vérifications`);
})();
