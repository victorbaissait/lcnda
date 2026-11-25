#!/usr/bin/env node
/* ☑ La liste de choix commune (assets/js/app-ui.js → UI.choiceList ; styles : assets/css/ui.css « Listes de choix communes »).
 *  1. Listes → une liste de données, « ＋ Ajouter un critère » → « Pays » (app-listes-donnees.js) : 214 pays inventés avec leurs nombres ;
 *     « france » → seulement France ; « fr » → France d'abord, puis ceux qui contiennent fr (Afrique du Sud) ; « suede » → Suède (sans accents) ;
 *     partie trouvée surlignée ; « 3 choix sur 214 » ; « Aucun choix ne contient … » + « Effacer la recherche » ; « Tout cocher les N affichés » ;
 *     cochés épinglés en haut sous « Cochés (N) » ; « Tout décocher » ; Entrée (un seul choix : coché et appliqué ; plusieurs : le premier coché) ;
 *     ↓ / Espace / Échap (vide puis ferme) ; « par nombre / A → Z » retenu (genealogie-choix-tri) ; nombres avec séparateur de milliers ;
 *     une liste de 1 500 choix montrée par morceaux (« + 1 350 autres : tape pour chercher ») ; téléphone (390 px) ; mode sombre.
 *  2. « Filtrer ▾ » de la barre commune des listes (UI.listBar) : une longue liste → la liste de choix (data-lb-f gardé), une courte reste comme avant.
 *  3. « 📚 Ajouter à un recueil… » (heritage-recueil-docs.js) : des ronds, 🔍 dès 7 recueils, Entrée → le recueil envoyé est bien celui choisi.
 *  4. « ＋ Ajouter des revues, livres, documentaires » (heritage-periodicals.js) : « Tout cocher les N affichés » + le tri par famille → les éléments envoyés.
 *   node tests/test-choix-liste.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 214 pays (vrais noms, pour les accents et les « fr » au milieu des mots), comptés comme dans une vraie liste
const PAYS = ['France', 'Afrique du Sud', 'Suède', 'Allemagne', 'Belgique', 'Suisse', 'Italie', 'Espagne', 'Estonie', 'Éthiopie', 'États-Unis', 'Équateur', 'Égypte', 'Érythrée',
    'Royaume-Uni', 'Irlande', 'Portugal', 'Pays-Bas', 'Luxembourg', 'Autriche', 'Pologne', 'Tchéquie', 'Slovaquie', 'Hongrie', 'Roumanie', 'Bulgarie', 'Grèce', 'Turquie', 'Danemark', 'Norvège',
    'Finlande', 'Islande', 'Lituanie', 'Lettonie', 'Croatie', 'Slovénie', 'Serbie', 'Albanie', 'Malte', 'Chypre', 'Canada', 'Mexique', 'Brésil', 'Argentine', 'Chili', 'Pérou', 'Colombie',
    'Venezuela', 'Bolivie', 'Paraguay', 'Uruguay', 'Cuba', 'Haïti', 'Algérie', 'Maroc', 'Tunisie', 'Libye', 'Sénégal', 'Mali', 'Niger', 'Tchad', 'Cameroun', 'Gabon', 'Congo', 'Bénin', 'Togo',
    'Ghana', 'Nigeria', 'Kenya', 'Ouganda', 'Tanzanie', 'Madagascar', 'Maurice', 'Comores', 'Djibouti', 'Somalie', 'Soudan', 'Centrafrique', 'Burkina Faso', 'Guinée', 'Liberia', 'Sierra Leone',
    'Chine', 'Japon', 'Corée du Sud', 'Inde', 'Pakistan', 'Afghanistan', 'Iran', 'Irak', 'Syrie', 'Liban', 'Israël', 'Jordanie', 'Arabie saoudite', 'Vietnam', 'Laos', 'Cambodge', 'Thaïlande',
    'Australie', 'Nouvelle-Zélande', 'Fidji', 'Russie', 'Ukraine', 'Biélorussie', 'Moldavie', 'Géorgie', 'Arménie', 'Azerbaïdjan', 'Kazakhstan', 'Mongolie', 'Népal', 'Bhoutan', 'Sri Lanka'];
for (let k = PAYS.length + 1; PAYS.length < 214; k++) PAYS.push(`Île n° ${String(k).padStart(3, '0')}`);
const N_FRANCE = 1234;

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-choix-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultListTypes && window.LCNDA_UI?.choiceList, null, {timeout: 30000});
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.dataListsEngine))) await p.addScriptTag({url: base + 'assets/js/app-listes-donnees.js'});
        await p.waitForFunction(() => window.LCNDA_EXT?.dataListsEngine, null, {timeout: 10000});
        // une liste inventée : 214 pays (France 1 234 fois, puis de moins en moins) et 1 500 lieux-dits différents
        await p.evaluate(([pays, nFr]) => {
            const rows = [];
            pays.forEach((c, i) => { const n = i === 0 ? nFr : Math.max(1, 60 - i); for (let k = 0; k < n; k++) rows.push({name: `${c} ${k}`, country: c, lieu: `Lieu-dit ${String(rows.length % 1500).padStart(4, '0')}`}); });
            (window.LCNDA_EXT.dataLists = window.LCNDA_EXT.dataLists || []).push({id: 'test_pays', icon: '🌍', label: 'Pays inventés', group: 'Le lieu', source: 'Jeu d’essai',
                load: async () => rows, fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'country', label: 'Pays', type: 'enum'}, {key: 'lieu', label: 'Lieu-dit', type: 'enum'}]});
        }, [PAYS, N_FRANCE]);
        const openList = async k => { await p.evaluate(x => { const A = window.LCNDA_APP; A.state.listType = x; A.setModule('listes'); }, k); await p.waitForSelector(`[data-side-value="${k}"].is-active`, {timeout: 15000}); await p.waitForSelector('[data-ld-add]'); };
        const openCrit = async lab => { await p.click('[data-ld-add]'); await p.click(`.ui-actmenu-i:has-text("${lab}")`); await p.waitForSelector('[data-ld-ed-list] .ui-choice-opt'); };
        const Q = '[data-ld-ed-filter]';
        const clearAll = async () => { while (await p.$('[data-ld-chip]')) { const n = await p.$$eval('[data-ld-chip]', a => a.length); await p.click('[data-ld-chip]'); await p.waitForFunction(k => document.querySelectorAll('[data-ld-chip]').length < k, n); } };
        const info = () => p.evaluate(() => {
            const box = document.querySelector('[data-ld-ed-list] .ui-choice'); if (!box) return null;
            const vis = el => el && !el.hidden && el.getClientRects().length > 0;
            const opts = [...box.querySelectorAll('.ui-choice-opt')].filter(vis);
            return {labels: opts.map(o => o.querySelector('.ui-choice-l').textContent), checked: opts.filter(o => o.querySelector('input').checked).map(o => o.querySelector('.ui-choice-l').textContent),
                marks: opts.map(o => o.querySelector('mark')?.textContent || ''), counts: opts.map(o => o.querySelector('.ui-choice-n')?.textContent || ''),
                count: box.querySelector('.ui-choice-count').textContent, heads: [...box.querySelectorAll('.ui-choice-h')].map(x => x.textContent),
                all: vis(box.querySelector('[data-choice-all]')) ? box.querySelector('[data-choice-all]').textContent : '', none: vis(box.querySelector('[data-choice-none]')),
                empty: box.querySelector('.ui-choice-empty')?.textContent || '', more: box.querySelector('[data-choice-more]')?.textContent || '',
                first: box.querySelector('.ui-choice-list').firstElementChild?.textContent || '', active: document.activeElement?.matches?.('.ui-choice-q') ? 'q' : document.activeElement?.value || ''};
        });
        const type = async v => { await p.fill(Q, v); await sleep(60); return info(); };
        const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

        await t('« Pays » : tout est là, rangé par nombre, nombres à droite avec le séparateur des milliers', async () => {
            await openList('data_test_pays'); await openCrit('Pays');
            const i = await info();
            assert.equal(i.count, '214 choix'); assert.equal(i.labels[0], 'France');
            assert.match(i.counts[0], /^1\s234$/, 'séparateur de milliers : ' + i.counts[0]);
            assert.equal(await p.evaluate(() => document.activeElement?.matches('[data-ld-ed-filter]')), true, 'le curseur est dans la case 🔍');
            assert.ok(await p.$eval('[data-ld-ed-list] .ui-choice-list', el => ['group', 'radiogroup', 'listbox'].includes(el.getAttribute('role')) && !!el.getAttribute('aria-label')), 'rôle et nom de la liste');
            assert.equal(await p.$eval('[data-ld-ed-list] .ui-choice-count', el => el.getAttribute('aria-live')), 'polite');
            const pos = await p.$eval('[data-ld-ed-list] .ui-choice-opt', l => [l.getBoundingClientRect().right, l.querySelector('.ui-choice-n').getBoundingClientRect().right]);
            assert.ok(pos[0] - pos[1] < 16, 'le nombre est collé à droite : ' + pos);
        });
        await t('taper « france » : seulement France (le bug d’avant : rien n’était filtré), surligné', async () => {
            const i = await type('france');
            assert.deepEqual(i.labels, ['France']); assert.deepEqual(i.marks, ['France']); assert.equal(i.count, '1 choix sur 214');
        });
        await t('« fr » : France d’abord (début du mot), puis ceux qui contiennent fr (Afrique du Sud, Centrafrique)', async () => {
            const i = await type('fr');
            assert.equal(i.labels[0], 'France');
            assert.ok(i.labels.includes('Afrique du Sud') && i.labels.includes('Centrafrique'), i.labels.join(', '));
            assert.ok(i.labels.every(l => fold(l).includes('fr')), 'tous contiennent « fr »');
            assert.equal(i.marks[i.labels.indexOf('Afrique du Sud')], 'fr');
            assert.match(i.count, new RegExp(`^${i.labels.length} choix sur 214$`));
        });
        await t('sans accents ni majuscules : « suede » → Suède, « ETATS » → États-Unis (partie trouvée surlignée avec ses accents)', async () => {
            let i = await type('suede'); assert.deepEqual(i.labels, ['Suède']); assert.deepEqual(i.marks, ['Suède']);
            i = await type('ETATS'); assert.deepEqual(i.labels, ['États-Unis']); assert.deepEqual(i.marks, ['États']);
        });
        await t('rien trouvé : « Aucun choix ne contient « xyz » » et « Effacer la recherche »', async () => {
            const i = await type('xyz'); assert.deepEqual(i.labels, []); assert.match(i.empty, /Aucun choix ne contient « xyz »/); assert.match(i.count, /^0 choix sur 214$/);
            await p.click('[data-ld-ed-list] [data-choice-clear]'); await sleep(60);
            assert.equal(await p.inputValue(Q), ''); const j = await info(); assert.equal(j.count, '214 choix'); assert.equal(j.active, 'q');
        });
        await t('« Tout cocher les N affichés » quand on cherche ; les cochés montent en haut sous « Cochés (N) » ; « Tout décocher »', async () => {
            let i = await type('guinée'); assert.equal(i.all, ''.concat('Tout cocher les ', i.labels.length, ' affichés')); assert.equal(i.labels.length, 1);
            i = await type('ie'); const n = i.labels.length; assert.ok(n > 5); assert.equal(i.all, `Tout cocher les ${n} affichés`);
            await p.click('[data-ld-ed-list] [data-choice-all]'); await sleep(60);
            i = await info(); assert.equal(i.checked.length, n);
            await type(''); i = await info();
            assert.equal(i.heads[0], `Cochés (${n})`); assert.match(i.first, new RegExp(`^Cochés \\(${n}\\)`));
            assert.deepEqual(i.labels.slice(0, n).sort(), i.checked.slice().sort(), 'les cochés d’abord'); assert.ok(i.heads.includes('Les autres'));
            assert.equal(i.all, '', 'pas de « Tout cocher » sans recherche'); assert.equal(i.none, true);
            await p.click('[data-ld-ed-list] [data-choice-none]'); await sleep(60); i = await info();
            assert.equal(i.checked.length, 0); assert.equal(i.none, false); assert.ok(!i.heads.some(x => /^Cochés/.test(x)), 'plus rien d’épinglé');
        });
        await t('Entrée : plusieurs choix → le premier est coché, on reste ; un seul → coché et appliqué', async () => {
            await type('es'); await p.press(Q, 'Enter'); await sleep(60);
            let i = await info(); assert.deepEqual(i.checked, ['Espagne'], 'Espagne commence par « es »'); assert.ok(await p.$('[data-ld-ed-list] .ui-choice'), 'toujours ouvert');
            await p.press(Q, 'Enter'); await sleep(60); i = await info(); assert.deepEqual(i.checked.sort(), ['Espagne', 'Estonie'], 'puis le suivant');
            await type('suede'); await p.press(Q, 'Enter');
            await p.waitForSelector('[data-ld-editor]', {state: 'hidden'});
            assert.match(await p.textContent('[data-ld-chips]'), /Pays : .*Suède/);
            assert.match(await p.textContent('[data-ld-count]'), /lignes?/);
        });
        await t('un choix coché reste en haut (« Cochés (1) ») pendant qu’on en cherche un autre ; Appliquer garde les deux', async () => {
            await clearAll(); await openCrit('Pays');
            await type('suede'); await p.check('[data-ld-ed-list] input[value="Suède"]');
            let i = await type('fr');
            assert.equal(i.heads[0], 'Cochés (1)'); assert.equal(i.labels[0], 'Suède'); assert.equal(i.labels[1], 'France'); assert.deepEqual(i.checked, ['Suède']);
            await p.check('[data-ld-ed-list] input[value="France"]'); i = await info(); assert.equal(i.heads[0], 'Cochés (2)');
            await p.click('.ld-ed-form button[type="submit"]'); await p.waitForSelector('[data-ld-editor]', {state: 'hidden'});
            assert.match(await p.textContent('[data-ld-chips]'), /Pays : .*(France.*Suède|Suède.*France)/);
            await clearAll();
        });
        await t('clavier : ↓ entre dans la liste, ↓ ↑ s’y déplacent, Espace coche ; Échap vide la case, puis ferme', async () => {
            await openCrit('Pays');
            await type('fr'); await p.press(Q, 'ArrowDown'); let i = await info(); assert.equal(i.active, 'France');
            await p.keyboard.press('ArrowDown'); i = await info(); assert.equal(i.active, i.labels[1]);
            await p.keyboard.press('Space'); i = await info(); assert.ok(i.checked.includes(i.labels[1]));
            await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); i = await info(); assert.equal(i.active, 'q', 'retour dans la case');
            await p.keyboard.press('Escape'); await sleep(60);
            assert.equal(await p.inputValue(Q), ''); assert.ok(await p.isVisible('[data-ld-editor]'), 'Échap 1 : la case est vidée, la fenêtre reste');
            await p.keyboard.press('Escape'); await p.waitForSelector('[data-ld-editor]', {state: 'hidden'});
        });
        await t('« par nombre / A → Z » : retenu pour ce champ (genealogie-choix-tri)', async () => {
            await openCrit('Pays');
            await p.click('[data-ld-ed-list] [data-choice-sort="az"]'); let i = await info();
            assert.equal(i.labels[0], 'Afghanistan'); assert.equal(await p.getAttribute('[data-ld-ed-list] [data-choice-sort="az"]', 'aria-pressed'), 'true');
            const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-choix-tri') || '{}'));
            assert.equal(saved['ld:test_pays:country'], 'az');
            await p.click('[data-ld-ed-cancel]'); await openCrit('Pays'); i = await info(); assert.equal(i.labels[0], 'Afghanistan', 'retenu');
            await p.click('[data-ld-ed-list] [data-choice-sort="n"]'); i = await info(); assert.equal(i.labels[0], 'France');
            await p.click('[data-ld-ed-cancel]');
        });
        await t('1 500 choix : montrés par morceaux, « + 1 350 autres : tape pour chercher » (plus de coupure muette à 400)', async () => {
            await clearAll(); await openCrit('Lieu-dit');
            let i = await info(); assert.equal(i.count, '1 500 choix'.replace(' ', ' ')); assert.equal(i.labels.length, 150);
            assert.match(i.more, /^[+＋] 1\s350 autres : tape pour chercher$/);
            i = await type('1499'); assert.deepEqual(i.labels, ['Lieu-dit 1499']);
            await type(''); await p.click('[data-ld-ed-list] [data-choice-more]'); i = await info(); assert.ok(i.labels.length > 150 && i.labels.length <= 1500);
            await p.click('[data-ld-ed-cancel]');
        });
        await t('téléphone (390 px) : lisible, rien ne dépasse, lignes assez hautes pour le doigt', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await openCrit('Pays'); await type('fr');
            const m = await p.evaluate(() => { const o = [...document.querySelectorAll('[data-ld-ed-list] .ui-choice-opt')]; return {sw: document.documentElement.scrollWidth, right: Math.max(...o.map(x => x.getBoundingClientRect().right)), h: Math.min(...o.map(x => x.getBoundingClientRect().height)), fs: parseFloat(getComputedStyle(o[0]).fontSize)}; });
            assert.ok(m.sw <= 392 && m.right <= 390, JSON.stringify(m)); assert.ok(m.h >= 36, 'hauteur ' + m.h); assert.ok(m.fs >= 13, 'police ' + m.fs);
            await p.click('[data-ld-ed-cancel]'); await p.setViewportSize({width: 1440, height: 900});
        });
        await t('mode sombre : fond sombre, texte clair, surlignage lisible', async () => {
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            await openCrit('Pays'); await type('fr');
            const c = await p.evaluate(() => { const l = document.querySelector('[data-ld-ed-list] .ui-choice-list'), o = l.querySelector('.ui-choice-l'), mk = l.querySelector('mark'); const lum = s => { const [r, g, b] = s.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }; return {bg: lum(getComputedStyle(l).backgroundColor), fg: lum(getComputedStyle(o).color), mark: lum(getComputedStyle(mk).backgroundColor), markFg: lum(getComputedStyle(mk).color)}; });
            assert.ok(c.bg < 0.3 && c.fg > 0.7, JSON.stringify(c)); assert.ok(Math.abs(c.markFg - c.mark) > 0.4, 'surlignage lisible ' + JSON.stringify(c));
            await p.click('[data-ld-ed-cancel]'); await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        });

        /* ═════════ 2. « Filtrer ▾ » de la barre commune ═════════ */
        await t('« Filtrer ▾ » : une longue liste devient la liste de choix (data-lb-f gardé, Échap vide d’abord) ; une courte reste comme avant', async () => {
            const r = await p.evaluate(pays => {
                window.__lb = []; const host = document.createElement('div'); host.id = 'lbhost'; document.querySelector('#workspace').prepend(host);
                const bar = window.LCNDA_UI.listBar({key: 'test-choix', remember: false, search: {placeholder: 'Chercher…'}, filters: [
                    {id: 'pays', label: 'Pays', type: 'check', options: pays.slice(0, 40).map((c, i) => [c, c, null, 100 - i])},
                    {id: 'sexe', label: 'Sexe', type: 'radio', options: [['', 'Tous'], ['f', 'Femmes'], ['m', 'Hommes']]}], onChange: s => window.__lb.push(s.filters)});
                host.appendChild(bar); return true;
            }, PAYS);
            assert.ok(r);
            await p.click('#lbhost .ui-listbar-fbtn'); await p.waitForSelector('.ui-listbar-menu .ui-choice');
            assert.equal(await p.$$eval('.ui-listbar-menu .ui-choice', l => l.length), 1, 'seulement pour la longue liste');
            assert.ok(await p.$('.ui-listbar-menu input[type=radio][data-lb-f="sexe"][value="f"]'), 'la courte liste est comme avant');
            assert.equal(await p.evaluate(() => document.activeElement?.matches('.ui-listbar-menu .ui-choice-q')), true);
            await p.fill('.ui-listbar-menu .ui-choice-q', 'suede'); await sleep(60);
            assert.deepEqual(await p.$$eval('.ui-listbar-menu .ui-choice-opt', l => l.map(x => `${x.querySelector('.ui-choice-l').textContent} ${x.querySelector('.ui-choice-n').textContent}`)), ['Suède 98']);
            await p.keyboard.press('Escape'); await sleep(60);
            assert.ok(await p.$('.ui-listbar-menu'), 'Échap vide la case sans fermer'); assert.equal(await p.inputValue('.ui-listbar-menu .ui-choice-q'), '');
            await p.check('.ui-listbar-menu input[data-lb-f="pays"][value="France"]'); await p.check('.ui-listbar-menu input[data-lb-f="pays"][value="Italie"]'); await sleep(60);
            assert.deepEqual(await p.evaluate(() => window.__lb.at(-1).pays), ['France', 'Italie']);
            await p.fill('.ui-listbar-menu .ui-choice-q', 'ie'); await p.click('.ui-listbar-menu [data-choice-all]'); await sleep(60);
            const all = await p.evaluate(() => window.__lb.at(-1).pays); assert.ok(all.length > 5 && all.includes('France') && all.includes('Slovaquie') && !all.includes('Belgique'), all.join(','));
            assert.ok(await p.evaluate(() => window.__lb.length) <= 4, 'un seul changement pour « Tout cocher »');
            await p.click('.ui-listbar-menu [data-choice-none]'); await sleep(60); assert.deepEqual(await p.evaluate(() => window.__lb.at(-1).pays), []);
            await p.fill('.ui-listbar-menu .ui-choice-q', 'suede'); await p.press('.ui-listbar-menu .ui-choice-q', 'Enter'); await sleep(100);
            assert.ok(!(await p.$('.ui-listbar-menu')), 'un seul choix : coché et la fenêtre se ferme');
            assert.deepEqual(await p.evaluate(() => window.__lb.at(-1).pays), ['Suède']);
            assert.match(await p.textContent('#lbhost .ui-listbar-active'), /Suède/);
            await p.evaluate(() => document.getElementById('lbhost').remove());
        });

        /* ═════════ 3. « 📚 Ajouter à un recueil… » ═════════ */
        await t('« Ajouter à un recueil » : des ronds, 🔍 sans accents dès 7 recueils, Entrée → le recueil choisi est envoyé', async () => {
            await p.evaluate(() => {
                const A = window.LCNDA_APP; window.__api0 = window.__api0 || A.api; window.__sent = [];
                const recs = ['Registres de Tulle', 'Notaires de Naves', 'Cadastre napoléonien', 'Lettres de Pierre', 'Actes de Brive', 'Recensements 1836', 'Mémoires de l’Écluse', 'Journal de Jeanne']
                    .map((title, i) => ({id: 10 + i, title, reference: i === 4 ? '3 E 112' : '', date_text: '', place_text: i === 0 ? 'Corrèze' : '', pages: i + 2, icon: '📚'}));
                A.api = async (action, q, o) => { if (action === 'recueils') return {recueils: recs}; if (action === 'recueil_from_documents') { window.__sent.push(o.body); return {id: o.body.recueil_id, title: 'x', added: 1, page_ids: [], image_ids: []}; } return window.__api0(action, q, o); };
                window.LCNDA_EXT.recueilDocs.addTo([{id: 1, title: 'Un acte'}]);
            });
            await p.waitForSelector('dialog[open] .rd-picks .ui-choice');
            const n = await p.$$eval('dialog[open] .rd-picks input[type=radio][name="rid"]', l => l.length); assert.equal(n, 8);
            assert.equal(await p.$eval('dialog[open] .rd-picks .ui-choice-list', el => el.getAttribute('role')), 'radiogroup');
            await p.fill('dialog[open] .ui-choice-q', 'ecluse'); await sleep(60);
            assert.deepEqual(await p.$$eval('dialog[open] .ui-choice-opt .ui-choice-l', l => l.map(x => x.textContent)), ['Mémoires de l’Écluse']);
            await p.fill('dialog[open] .ui-choice-q', '3 e 112'); await sleep(60);
            assert.deepEqual(await p.$$eval('dialog[open] .ui-choice-opt .ui-choice-l', l => l.map(x => x.textContent)), ['Actes de Brive'], 'la cote compte aussi');
            await p.press('dialog[open] .ui-choice-q', 'Enter');
            await p.waitForFunction(() => window.__sent.length === 1, null, {timeout: 5000});
            assert.equal(await p.evaluate(() => window.__sent[0].recueil_id), 14);
            await p.waitForFunction(() => !document.querySelector('dialog[open] .rd-picks'));
            await p.evaluate(() => { window.LCNDA_APP.api = window.__api0; });
        });

        /* ═════════ 4. « ＋ Ajouter des revues, livres, documentaires » ═════════ */
        await t('« Ajouter des revues, livres… » : 🔍 + tri par famille, « Tout cocher les N affichés » → ces éléments-là envoyés', async () => {
            const ok = await p.evaluate(() => {
                if (!window.LCNDA_EXT.pickLibraryForAtelier) return false;
                const A = window.LCNDA_APP; window.__sent = [];
                const issues = [['Le Lémouzi', 'livre'], ['Histoire de Tulle', 'livre'], ['Les Corréziens', 'livre'], ['La Montagne limousine', 'doc'], ['Écoles d’autrefois', 'doc']]
                    .map(([title, family], i) => ({id: 1 + i, title, family, date_text: '', data: {}, media: []}));
                A.api = async (action, q, o) => { if (action === 'periodicals') return {issues, articles: [], periodicals: [], types: []}; if (action === 'periodicals_to_atelier') { window.__sent.push(o.body); return {created: o.body.items.length}; } return window.__api0(action, q, o); };
                window.LCNDA_EXT.pickLibraryForAtelier(1, 0, () => {});
                return true;
            });
            assert.ok(ok, 'heritage-periodicals.js chargé');
            await p.waitForSelector('dialog[open] .h-pr-pick .ui-choice');
            await p.fill('dialog[open] [data-pk-q]', 'limous'); await sleep(60);
            assert.deepEqual(await p.$$eval('dialog[open] .ui-choice-opt .ui-choice-l', l => l.map(x => x.textContent)), ['La Montagne limousine']);
            await p.fill('dialog[open] [data-pk-q]', ''); await p.selectOption('dialog[open] [data-pk-fam]', 'livre'); await sleep(60);
            assert.equal(await p.$$eval('dialog[open] .ui-choice-opt', l => l.length), 3);
            await p.click('dialog[open] [data-choice-all]'); await sleep(60);
            await p.click('dialog[open] .modal-actions button[type=submit], dialog[open] button[type=submit]');
            await p.waitForFunction(() => window.__sent.length === 1, null, {timeout: 5000});
            assert.deepEqual(await p.evaluate(() => window.__sent[0].items.map(x => x.id).sort()), [1, 2, 3]);
            await p.evaluate(() => { window.LCNDA_APP.api = window.__api0; document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
        });

        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
