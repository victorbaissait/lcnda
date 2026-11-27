'use strict';
/**
 * Harmonisation des gestes (docs/harmonisation.md, « Comportements », points 3, 5 à 10) :   node tests/test-harmonisation-gestes.js
 *  3. toute section repliable (<details> fait à la main) retient ouverte / fermée, sauf un menu, une section répétée, data-ui-noremember ;
 *  5. chercher « un mot puis un autre » : chaque mot, dans n'importe quel ordre (UI.listMatch.text) dans les listes qui cherchaient la phrase exacte ;
 *  6. ouvrir une fiche : un seul geste partout (data-open-person / data-h-person écoutés une fois pour toute l'app, clic droit = menu) ;
 *  7. le nom d'une personne : la pièce commune (A().personName), plus de « prénom + ' ' + nom » recollé à la main ;
 *  8. les listes qui ne retenaient pas leur tri (onglet Diagrammes, journal des modifications, saints du jour) le retiennent (« lcnda-sort:… ») ;
 *  9. supprimer un projet d'outil (montage, son, retouche, dessin, livre, maison, diaporama, classeur…) : sans question, « ↶ Annuler » le remet ;
 * 10. les petites cases de recherche des fenêtres cherchent sans accents (étiquettes, horloges, mots-clés de l'Atelier, formes, animation…).
 *  Vérifié dans le code, puis pour de vrai dans le navigateur (base d'essai MAZAUD / LACOMBE / DURAND).
 *  LCNDA_SKIP_BROWSER=1 : seulement les vérifications du code.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let passed = 0;
const step = async (name, fn) => { try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); process.exitCode = 1; } };
const LM = "window.LCNDA_UI?.listMatch?.text";
const NF = ".toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').includes(q)";

(async () => {
    await step('5 · les listes cherchent chaque mot (UI.listMatch.text), plus la phrase exacte', () => {
        const files = ['app-listes', 'heritage-lieux-a-placer', 'heritage-lieux-patrimoine', 'heritage-metiers-rivieres', 'heritage-recueils', 'heritage-research-gaps', 'heritage-suivi-fiche', 'heritage-suivi', 'heritage-tresors-merveilles', 'heritage-av', 'heritage-artist-list', 'heritage-tresors-memoire', 'heritage-house'];
        for (const f of files) {
            const src = read(`assets/js/${f}.js`);
            assert.ok(src.includes(LM), `${f} : passe par UI.listMatch.text`);
            assert.ok(!src.includes(NF), `${f} : cherche encore la phrase exacte (…normalize(…).includes(q))`);
        }
        const bad = [
            ['heritage-suivi.js', "[x.name, x.kind, x.place?.name].join(' ').toLowerCase().includes(q)"],
            ['heritage-suivi.js', "[g.name, g.kind, g.species, g.territory].join(' ').toLowerCase().includes(q)"],
            ['heritage-av.js', "[nameOf(it), it.description, it.filename, it.date_text, ownerText(it)].join(' ').toLowerCase().includes(q)"],
            ['heritage-tresors-memoire.js', "`.toLowerCase().includes(q)))"],
            ['heritage-house.js', "LIB.filter(l => l[1].toLowerCase().includes(q)"],
        ];
        for (const [f, s] of bad) assert.ok(!read(`assets/js/${f}`).includes(s), `${f} : « ${s} »`);
    });

    await step('10 · les petites cases des fenêtres cherchent sans accents', () => {
        const bad = [
            ['heritage-more.js', "(!q || String(l.name).toLowerCase().includes(q))"], // étiquettes à poser (Réglages des blocs)
            ['heritage-horloges.js', 'x.dataset.hzWhoN.includes(q)'], // personnes des horloges
            ['heritage-research.js', 'b.dataset.atTag.toLowerCase().includes(q)'], // mots-clés de l'Atelier
            ['heritage-vector.js', "(s.n || '').toLowerCase().includes(q)"], // formes du dessin
            ['heritage-anim-studio.js', 'String(d.name).toLowerCase().includes(q.toLowerCase())'], // personnes de l'animation
            ['heritage-anim-studio.js', 'd.name.toLowerCase().includes(q.toLowerCase())'],
            ['heritage-artist-panel.js', '`${f.label} ${f.key}`.toLowerCase().includes(q)'],
            ['heritage-diagrams.js', "String(p.title || '').toLowerCase().includes(ql)"],
        ];
        for (const [f, s] of bad) assert.ok(!read(`assets/js/${f}`).includes(s), `${f} : cherche encore avec l'accent exact : « ${s} »`);
        // « ＋ Créer » garde sa vérification exacte (un nom qui existe déjà)
        assert.match(read('assets/js/heritage-more.js'), /const exists = all\.some\(l => String\(l\.name\)\.trim\(\)\.toLowerCase\(\) === q\);/);
    });

    await step('7 · le nom d’une personne passe par la pièce commune', () => {
        const bad = [
            ['app-chronologie.js', "const eventName = event => [event.first_name, event.last_name].filter(Boolean).join(' ');"],
            ['app-comparaison.js', "[pl.first_name, pl.last_name].join(' ')"],
            ['app-listes.js', "escapeHtml([p.first_name,p.last_name].filter(Boolean).join(' ')||'Personne sans nom')"],
            ['app-maintenance.js', "escapeHtml([p.first_name,p.last_name].filter(Boolean).join(' ')||'Personne sans nom')"],
            ['app-maintenance.js', "const person=[e.first_name,e.last_name].filter(Boolean).join(' ')"],
            ['app-listes.js', "const person=[e.first_name,e.last_name].filter(Boolean).join(' ')"],
            ['app-tableau-de-bord.js', "[item.first_name,item.last_name].filter(Boolean).join(' ')||'Personne'"],
            ['app-carte.js', "[p.first_name,p.middle_name,p.last_name].filter(Boolean).join(' ')"],
            ['app.js', "(p.first_name+' '+p.last_name).trim()"],
            ['app.js', "(tag.first_name+' '+tag.last_name).trim()"],
            ['app.js', "name:[event.first_name,event.last_name].filter(Boolean).join(' '),"],
            ['app.js', "const name=[p.first_name,p.last_name].filter(Boolean).join(' ')||'Sans nom';"],
            ['heritage-depouillements.js', "[x.first_name, x.last_name].join(' ')"],
            ['heritage-employers.js', "[p.first_name, p.last_name].filter(Boolean).join(' ') || 'Personne sans nom'"],
            ['heritage-fiches.js', "`${p.first_name || ''} ${p.last_name || ''}`.trim()"],
            ['heritage-layout.js', "nm = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Fiche'"],
            ['heritage-metiers-anciens.js', "[p.first_name, p.last_name].filter(Boolean).join(' ') || 'Sans nom'"],
            ['heritage-more.js', "personLink(m.person_id, [m.first_name, m.last_name].filter(Boolean).join(' ')"],
            ['heritage-museum.js', "`${p.first_name || ''} ${p.last_name || ''}`.trim()"],
            ['heritage-questions.js', "title: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim()"],
            ['heritage-studio.js', "`${pe.first_name || ''} ${pe.last_name || ''}`.trim()"],
            ['heritage-vector-tree.js', "`${p.first_name || ''} ${p.last_name || ''}`.trim()"],
        ];
        for (const [f, s] of bad) assert.ok(!read(`assets/js/${f}`).includes(s), `${f} : nom recollé à la main : « ${s} »`);
    });

    await step('8 · les tris retenus (onglet Diagrammes, journal des modifications, saints du jour)', () => {
        assert.match(read('assets/js/app-diagrammes-onglet.js'), /sortOf\('diagrammes', 'recent'\)[\s\S]*setSort\?\.\('diagrammes', S\.sort\)/);
        assert.match(read('assets/js/app-maintenance.js'), /sortOf\('reglages-journal','recent'\)[\s\S]*setSort\?\.\('reglages-journal',v\)/);
        assert.match(read('assets/js/app.js'), /sortOf\('saints-personnes','date_asc'\)[\s\S]*setSort\?\.\('saints-personnes',v\)/);
        assert.match(read('assets/js/app-jeu.js'), /TRI_KEY='genealogie-jeux-tri'/, 'le Jeu retient déjà son tri');
    });

    await step('9 · supprimer un projet d’outil : sans question, ↶ Annuler', () => {
        const et = read('assets/js/heritage-edittools.js');
        for (const a of ['delete_montage_project', 'delete_audio_project', 'delete_retouch_project', 'delete_vector_doc', 'delete_layout_doc']) assert.ok(et.includes(`remove: delUndo('${a}'), undo: true,`), a);
        assert.match(et, /if \(!t\.undo && !await A\(\)\.confirmBox\(/, 'la question reste seulement pour un outil qui ne sait pas remettre');
        for (const [f, n] of [['heritage-studio-av.js', 2], ['heritage-studio.js', 1]]) assert.equal((read(`assets/js/${f}`).match(/ext\.deleteProjectWithUndo\(\{action: 'delete_/g) || []).length, n, f);
        for (const f of ['heritage-vector-cards', 'heritage-vector-map', 'heritage-vector-seal', 'heritage-vector-tree', 'heritage-house', 'heritage-slideshow', 'heritage-tableur', 'heritage-photo-compare', 'heritage-anim-studio', 'heritage-site-web', 'heritage-traitement-texte-fichiers', 'heritage-cousinade', 'heritage-tresors'])
            assert.match(read(`assets/js/${f}.js`), /undo: true/, `${f} : l'outil sait remettre son projet`);
        for (const [f, t] of [['audio_projects', 'audio_projects'], ['layout_docs', 'layout_documents'], ['montage_projects', 'montage_projects'], ['retouch_projects', 'retouch_projects'], ['vector', 'vector_docs'], ['houses', 'houses'], ['slideshows', 'slideshows'], ['workbooks', 'workbooks'], ['photo_compare', 'photo_comparisons']])
            assert.ok(read(`lib/${f}.php`).includes(`project_undo_keep($pdo, '${t}'`), `lib/${f}.php garde le projet avant de le supprimer`);
        assert.match(read('api.php'), /'restore_project' => restore_project\(\$pdo,\$data\)/);
        const tsv = read('assets/i18n/src/harmonisation-gestes.tsv').split('\n').find(l => l.startsWith('Projet « {name} » supprimé ¦'));
        assert.ok(tsv && tsv.split(' ¦ ').length === 8, 'traduit en fr en es de it pt pl nl');
    });

    await step('6 · ouvrir une fiche : un seul écouteur pour toute l’app', () => {
        const app = read('assets/js/app.js');
        assert.match(app, /closest\?\.\('\[data-open-person\],\[data-h-person\]'\)[\s\S]{0,700}openPersonById\(pid\)/, 'clic');
        assert.match(app, /addEventListener\('contextmenu',event=>\{[\s\S]{0,300}\[data-open-person\],\[data-h-person\][\s\S]{0,200}openPeopleRowMenu\(pid,el,event\)/, 'clic droit');
        assert.match(app, /\[data-open-person\],\[data-h-person\],\[data-open-dashboard-person\]/, '⌘ / Ctrl + clic aussi pour data-h-person');
        assert.ok(!/closest\?\.\('\[data-h-person\]'\)/.test(read('assets/js/heritage.js')), 'heritage.js n’a plus son propre écouteur');
    });

    await step('3 · toute section repliable retient son état', () => {
        const ui = read('assets/js/app-ui.js');
        assert.match(ui, /AUTO_SEC_KEY = 'genealogie-ui-sections-auto'/);
        assert.match(ui, /new MutationObserver\(autoRestore\)/);
        assert.match(read('assets/js/heritage-more.js'), /<details data-ui-noremember \$\{running \|\| err \? 'open' : ''\}>/, 'le journal ouvert pour une erreur ne retient rien');
    });

    if (process.env.LCNDA_SKIP_BROWSER === '1') { console.log(process.exitCode ? 'Échec' : `✓ Harmonisation des gestes : ${passed} vérifications (sans navigateur)`); return; }
    const {start, sleep} = require('./prendre-depuis-seed.js');
    const B = await start({});
    const {page, go} = B;
    const api = (action, body, get) => page.evaluate(([a, b, g]) => window.LCNDA_APP.api(a, g ? b : {}, g ? {} : {method: 'POST', body: b}), [action, body || {}, !!get]);
    try {
        await step('3 · une section ouverte à la main est rouverte à la visite suivante ; un menu, une section répétée et le code ne comptent pas', async () => {
            await go('listes'); await sleep(800);
            const html = `<div id="hg-zone"><details class="hg-more"><summary>▸ Plus d’options</summary><p>Jean MAZAUD</p></details>
                <details class="hg-menu"><summary class="button small">⤓ Exporter ▾</summary><p>menu</p></details>
                <details class="hg-rep"><summary>▸ plus (2)</summary></details><details class="hg-rep"><summary>▸ plus (5)</summary></details>
                <details class="hg-code"><summary>Journal</summary></details></div>`;
            const put = () => page.evaluate(h => { document.querySelector('#hg-zone')?.remove(); document.querySelector('#workspace').insertAdjacentHTML('afterbegin', h); }, html);
            await put(); await sleep(100);
            for (const sel of ['.hg-more', '.hg-menu', '.hg-rep']) await page.locator(`#hg-zone ${sel} > summary`).first().click();
            await page.evaluate(() => { document.querySelector('#hg-zone .hg-code').open = true; }); await sleep(200);
            const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-ui-sections-auto') || '{}'));
            const keys = Object.keys(saved);
            assert.equal(keys.length, 1, JSON.stringify(saved));
            assert.match(keys[0], /plus d’options/); assert.equal(saved[keys[0]], true);
            await put(); await sleep(100); // l'écran redessiné
            assert.deepEqual(await page.evaluate(() => ['.hg-more', '.hg-menu', '.hg-code'].map(s => document.querySelector('#hg-zone ' + s).open)), [true, false, false]);
            await page.locator('#hg-zone .hg-more > summary').click(); await sleep(100);
            await put(); await sleep(100);
            assert.equal(await page.evaluate(() => document.querySelector('#hg-zone .hg-more').open), false, 'refermée : reste fermée');
            await page.evaluate(() => document.querySelector('#hg-zone')?.remove());
        });

        await step('5 · « jean tulle » trouve « Jean MAZAUD, né à Tulle » (chaque mot, sans accents)', async () => {
            const r = await page.evaluate(() => { const t = window.LCNDA_UI.listMatch.text; return [t('jean tulle', 'Jean MAZAUD, né à Tulle'), t('tulle jean', 'Jean MAZAUD', 'né à Tulle'), t('eglise lacombe', 'Église de LACOMBE'), t('jean brive', 'Jean MAZAUD, né à Tulle')]; });
            assert.deepEqual(r, [true, true, true, false]);
        });

        await step('6 · un nom ajouté plus tard ouvre la fiche (clic) et son menu (clic droit)', async () => {
            await go('listes'); await sleep(800);
            const pid = await page.evaluate(() => Number((window.LCNDA_APP.state.people || [])[1]?.id || 2));
            await page.evaluate(id => { const b = document.createElement('button'); b.type = 'button'; b.className = 'table-link'; b.id = 'hg-late'; b.dataset.hPerson = String(id); b.textContent = 'Marie LACOMBE'; document.querySelector('#workspace').prepend(b); }, pid);
            await page.locator('#hg-late').click({button: 'right'}); await sleep(400);
            assert.ok(await page.evaluate(() => [...document.querySelectorAll('.ui-actmenu button, .ui-actmenu [role=menuitem]')].some(b => /Ouvrir/.test(b.textContent))), 'le menu de la personne');
            await page.keyboard.press('Escape'); await sleep(200);
            await page.evaluate(id => { const b = document.createElement('button'); b.type = 'button'; b.id = 'hg-late2'; b.dataset.openPerson = String(id); b.textContent = 'Marie LACOMBE'; document.querySelector('#workspace').prepend(b); }, pid);
            await page.locator('#hg-late2').click(); await sleep(1200);
            assert.deepEqual(await page.evaluate(() => [window.LCNDA_APP.state.module, Number(window.LCNDA_APP.state.currentPersonId)]), ['personnes', pid]);
        });

        await step('8 · l’onglet Diagrammes retient son tri', async () => {
            await page.evaluate(() => window.LCNDA_UI.setSort('diagrammes', 'name'));
            assert.equal(await page.evaluate(() => window.LCNDA_UI.sortOf('diagrammes', 'recent')), 'name');
            await page.evaluate(() => window.LCNDA_UI.setSort('diagrammes', 'recent'));
        });

        await step('9 · projet de montage : supprimé sans question, « restore_project » le remet (même numéro), à l’écran aussi', async () => {
            const m = await api('save_montage_project', {name: 'Montage des MAZAUD', project: {sources: [], v1: [], tracks: []}});
            const mid = Number(m.result?.id || m.id); assert.ok(mid > 0, JSON.stringify(m));
            const del = await api('delete_montage_project', {id: mid}); const tok = del.result?.undo;
            assert.match(String(tok), /^[0-9a-f]{24}$/, JSON.stringify(del));
            assert.ok(!((await api('montage_projects', {}, true)).projects || []).some(p => Number(p.id) === mid), 'parti');
            await api('restore_project', {undo: tok});
            assert.ok(((await api('montage_projects', {}, true)).projects || []).some(p => Number(p.id) === mid && p.name === 'Montage des MAZAUD'), 'revenu');
            const again = await api('restore_project', {undo: tok}); assert.equal(again.result?.already, true, 'deuxième ↶ : « Déjà remis »');
            // l'écran : Listes → Outils de modification
            await go('listes', {listType: 'edit_tools'}); await page.waitForSelector('[data-et-tab]', {timeout: 20000});
            await page.locator('[data-et-tab="montage"]').first().click(); await page.waitForSelector(`[data-et-del="${mid}"]`, {timeout: 20000});
            await page.locator(`[data-et-del="${mid}"]`).first().click({force: true}); await sleep(900);
            assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open].confirm-box-dialog')), false, 'pas de « Es-tu sûr ? »');
            assert.match(await page.evaluate(() => [...document.querySelectorAll('.toast .ui-toast-text')].map(t => t.textContent).join(' | ')), /Projet « Montage des MAZAUD » supprimé/);
            await page.locator('.toast .ui-toast-btn', {hasText: 'Annuler'}).last().click(); await sleep(900);
            assert.ok(((await api('montage_projects', {}, true)).projects || []).some(p => Number(p.id) === mid), '↶ Annuler l’a remis');
            await page.waitForSelector(`[data-et-del="${mid}"]`, {timeout: 10000});
            await api('delete_montage_project', {id: mid});
        });

        await step('pas d’erreur JavaScript', () => assert.deepEqual(B.errs, []));
    } finally { await B.stop(); }
    console.log(process.exitCode ? 'Échec' : `✓ Harmonisation des gestes : ${passed} vérifications`);
})();
