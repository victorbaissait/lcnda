'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧭 Je veux… (assets/js/app-je-veux.js, app-je-veux-moteur.js, app-je-veux-ui.js ; maquette docs/design/je-veux.html) :   node tests/test-je-veux.js
 *  1. le moteur, sans navigateur : les 7 phrases d'exemple de la maquette donnent la bonne intention en premier ; une faute
 *     (« arbe ») rattrapée et montrée ; une pastille corrigée reclasse ; homonymes → « lequel ? » et « C'est bien ça ? » ;
 *     une phrase floue → « C'est bien ça ? » ; rien → aucune réponse ; les mots ignorés sont dits ;
 *  2. le démarrage ne change pas : le moteur n'est chargé qu'à la première ouverture ;
 *  3. Recherche → « 🧭 Je veux faire… » en tête de colonne : la ligne « ✓ Ce que j'ai compris » toujours là, les pastilles
 *     (comme Données), « C'est bien ça ? » seulement quand l'app n'est pas sûre, les homonymes avec leurs dates, ▶ va au bon écran
 *     pré-rempli SANS lancer la dernière action (ni impression, ni fusion), 👣 Montre-moi (bulle de la visite, « ▶ Fais-le pour
 *     moi »), tout seul la 1re fois puis plus ; ⭐ Mes buts et récents ;
 *  4. ⌘K : « 🧭 Je veux… » en premier mode, ▶ 👣 sur la ligne, Tab → « 🔎 Trouver », sans verbe = recherche de noms comme avant ;
 *  5. 🗂 Tout parcourir : les 10 familles + Toutes, toutes les intentions (≥ 150), la case qui filtre ; Listes → « 🧭 Tout ce que
 *     l'app sait faire » (tableau) ;
 *  6. Réglages → 🧭 Je veux… : on/off, où il apparaît (bouton du haut, widget, bulles « ? »), Montre-moi, nombre de réponses ;
 *  7. mode consultation : ce qui modifie est grisé avec la raison, 👣 reste ; 390 px, sombre, rien de collé, aucune erreur JS.
 * Familles inventées : MAZAUD (Tulle), LACOMBE (Nice), DURAND (Salon-de-Provence).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n    ')); } };
const SEVEN = [['imprimer un arbre pour mamie', 'print_tree'], ['trouver qui était témoin au mariage de Jean', 'ask'], ['fusionner deux lieux', 'merge_places'], ['faire un diagramme des métiers', 'diagram'],
    ['mettre les séismes près de chez nous dans une fiche', 'fiche_add'], ['envoyer une liste à mon cousin', 'share_list'], ['savoir si un ancêtre a fait la guerre', 'war']];

(async () => {
    /* ═════ 1. le moteur ═════ */
    console.log('Le moteur');
    global.window = global;
    require('../assets/js/app-je-veux-moteur.js');
    const E = global.LCNDA_EXT.jeVeuxEngine, reg = E.build({});
    const top = q => { const u = E.analyse(q, reg); return {u, r: E.rank(u, reg)}; };
    await t('les 7 phrases de la maquette : la bonne intention en premier', () => {
        for (const [q, id] of SEVEN) { const {r} = top(q); assert.equal(r[0]?.it.id, id, `« ${q} » → ${r.slice(0, 3).map(x => x.it.id + ':' + x.s.toFixed(1)).join(' ')}`); }
    });
    await t('chaque intention écrite à la main : famille, icône, nom, une ligne, un chemin, ▶ ; et Damerau', () => {
        const hand = reg.filter(i => i.src === 'main');
        assert.ok(hand.length >= 80, hand.length);
        for (const i of hand) { assert.ok(E.FAM[i.fam], i.id); assert.ok(i.icon && i.name && i.does && i.path.length && typeof i.go === 'function', i.id); assert.equal(typeof i.ro, 'boolean'); }
        assert.equal(new Set(hand.map(i => i.id)).size, hand.length, 'ids uniques');
        assert.equal(E.dist('arbe', 'arbre'), 1); assert.equal(E.dist('diagrame', 'diagramme'), 1); assert.equal(E.dist('imrpimer', 'imprimer'), 1); assert.ok(E.dist('fusion', 'imprimer') > 2);
    });
    await t('une faute rattrapée et dite (« arbe → arbre »), accents et majuscules sans importance', () => {
        const {u, r} = top('Imprimé un arbe pour Mamie');
        assert.ok(u.fixed.includes('arbe → arbre'), u.fixed.join());
        assert.equal(r[0].it.id, 'print_tree');
        assert.equal(top('FUSIONNER DEUX LIEUX').r[0].it.id, 'merge_places');
    });
    await t('une pastille corrigée reclasse les réponses', () => {
        const {u} = top('imprimer un arbre');
        E.set(u, 'act', 'exporter'); E.set(u, 'obj', 'base');
        const r = E.rank(u, reg);
        assert.ok(['gedcom', 'share_export'].includes(r[0].it.id), r.slice(0, 3).map(x => x.it.id).join());
        assert.equal(E.confidence(u, r), 'ok');
    });
    await t('homonymes : « lequel ? » et « C’est bien ça ? » ; une fois choisi, plus de question', () => {
        const {u} = top('trouver qui était témoin au mariage de Jean');
        assert.ok(u.nameWords.includes('jean'), u.nameWords.join());
        E.applyPeople(u, [{id: 2, title: 'Jean MAZAUD', short: '1852–1921'}, {id: 3, title: 'Jean LACOMBE', short: '1888–1916'}, {id: 4, title: 'Jean-Baptiste DURAND', short: '1820–1884'}]);
        assert.equal(u.whoCands.length, 3); let r = E.rank(u, reg);
        assert.equal(E.confidence(u, r), 'low'); assert.equal(r[0].it.id, 'ask');
        E.set(u, 'who', u.whoCands[1]); r = E.rank(u, reg);
        assert.equal(E.confidence(u, r), 'ok'); assert.equal(u.whoP.title, 'Jean LACOMBE');
        assert.ok(E.pre(r[0].it, u).some(x => /Jean LACOMBE/.test(x)));
    });
    await t('pas sûr → « C’est bien ça ? » ; rien → aucune réponse ; les mots ignorés sont dits', () => {
        const f = top('le truc pour les vieux papiers'); assert.equal(E.confidence(f.u, f.r), 'low'); assert.equal(f.r[0].it.id, 'reading');
        const n = top('xqzw brrr'); assert.equal(E.confidence(n.u, n.r), 'none');
        const z = top('imprimer un arbre zorglub'); assert.ok([...z.u.nameWords, ...z.u.unread].includes('zorglub'));
        assert.equal(z.r[0].it.id, 'print_tree');
    });
    await t('▶ ne fait jamais le dernier geste : imprimer, fusionner, envoyer → « last » dit à la personne', () => {
        for (const id of ['print_tree', 'merge_places', 'dupes', 'share_list', 'gedcom', 'import', 'merge_tree']) assert.ok(reg.find(i => i.id === id).last, id);
        const src = fs.readFileSync(path.join(appRoot, 'assets/js/app-je-veux-moteur.js'), 'utf8');
        assert.doesNotMatch(src, /window\.print\(|\.click\(\)|api\('(merge|fusion)/, 'aucun clic ni impression ni fusion lancés');
    });

    /* ═════ le navigateur ═════ */
    let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— navigateur ou PHP absent : partie navigateur sautée'); console.log(`\n${pass} ✓, ${fail} ✗`); process.exit(fail ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-jeveux-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($n, $c) use ($pdo) { $pdo->prepare("INSERT INTO places(name, county, country) VALUES(?, ?, 'France')")->execute([$n, $c]); return (int) $pdo->lastInsertId(); };
$tulle = $pl('Tulle', 'Corrèze'); $nice = $pl('Nice', 'Alpes-Maritimes'); $salon = $pl('Salon-de-Provence', 'Bouches-du-Rhône');
$per = function ($f, $l, $g, $b, $d, $p) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,?)")->execute([$f, $l, $g, $d ? 'deceased' : 'living']); $id = (int) $pdo->lastInsertId();
    $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag('BIRT'), $b, (string) $b, $p]);
    if ($d) $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag('DEAT'), $d, (string) $d, $p]); return $id; };
$I = [];
$I['camille'] = $per('Camille', 'MAZAUD', 'female', 1990, 0, $salon);
$I['jean_m'] = $per('Jean', 'MAZAUD', 'male', 1852, 1921, $tulle);
$I['jean_l'] = $per('Jean', 'LACOMBE', 'male', 1888, 1916, $nice);
$I['jb'] = $per('Jean-Baptiste', 'DURAND', 'male', 1820, 1884, $salon);
$I['marie'] = $per('Marie', 'DURAND', 'female', 1856, 1930, $tulle);
$I['honore'] = $per('Honoré', 'LACOMBE', 'male', 1834, 1899, $nice);
$I['marius'] = $per('Marius', 'DURAND', 'male', 1879, 1957, $salon);
$pdo->exec('UPDATE persons SET is_start=1 WHERE id=' . $I['camille']);
$pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$I['jean_m'], $I['marie']]); $f = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO events(scope, family_id, event_type_id, year, date_text, place_id) VALUES('family',?,?,1878,'26 novembre 1878',?)")->execute([$f, $tag('MARR'), $tulle]);
echo json_encode($I);`], {cwd: appRoot, encoding: 'utf8', env});
    if (seed.status !== 0 || !/camille/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    const kill = () => { try { proc.kill(); } catch (_) {} };
    process.on('exit', kill);
    for (let i = 0; i < 300; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const {detect} = require('./test-rien-de-colle.js');
    const browser = await pw.chromium.launch();
    const errors = [];
    const open = async ({width = 1440, dark = false} = {}) => {
        const ctx = await browser.newContext({viewport: {width, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-premier-vu', '1'); localStorage.setItem('genealogie-visite-guidee', JSON.stringify({seen: true})); localStorage.setItem('genealogie-last-route', '#tableau-de-bord'); } catch (_) {} });
        await ctx.route(u => !u.toString().startsWith(base), r => r.abort());
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(`${width}${dark ? ' sombre' : ''} : ${e.message}`));
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) errors.push(`${width} : ${m.text()}`); });
        p.on('dialog', d => d.dismiss().catch(() => {}));
        p.posts = []; p.on('request', r => { if (r.method() === 'POST') p.posts.push(r.url() + ' ' + (r.postData() || '').slice(0, 200)); });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.jeVeux && window.LCNDA_EXT?.tour?.guide, null, {timeout: 60000});
        if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
        await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
        return p;
    };
    const noHScroll = async (p, what) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, `${what} : pas de défilement de côté`);
    const glue = async (p, root, what) => { const bad = await p.evaluate(detect, {root, min: 4}); assert.deepEqual(bad, [], `${what} : rien de collé`); };
    const toJV = async (p, q = '') => { await p.evaluate(q => window.LCNDA_EXT.jeVeux.open(q), q); await p.waitForSelector('[data-jv-page] [data-jv-ask] input', {timeout: 20000}); };
    const ask = async (p, q) => { await p.fill('[data-jv-ask] input', q); await p.press('[data-jv-ask] input', 'Enter'); await p.waitForFunction(q => { const r = window.LCNDA_EXT.jeVeuxUI?.state(); return r && r.q === q && r.u && r.u.q === q; }, q, {timeout: 15000}); await p.waitForTimeout(80); };

    try {
        for (const [name, width, dark] of [['1440', 1440, false], ['390', 390, false], ['sombre', 1440, true]]) {
            console.log(`Navigateur ${name}`);
            const p = await open({width, dark});
            if (name === '1440') await t('le démarrage ne change pas : moteur et écrans chargés seulement à la première ouverture', async () => {
                assert.equal(await p.evaluate(() => !!window.LCNDA_EXT.jeVeuxEngine || !!document.querySelector('script[src*="app-je-veux-moteur"]')), false);
                assert.equal(await p.evaluate(() => window.LCNDA_EXT.jeVeux.settings().on && window.LCNDA_EXT.jeVeux.settings().cmdk && window.LCNDA_EXT.jeVeux.settings().recherche && !window.LCNDA_EXT.jeVeux.settings().top && !window.LCNDA_EXT.jeVeux.settings().widget && !window.LCNDA_EXT.jeVeux.settings().bubbles), true, 'allumé : ⌘K et Recherche ; éteint : bouton, widget, bulles');
                assert.equal(await p.evaluate(() => !!document.querySelector('#jv-open') && document.querySelector('#jv-open').hidden), true, 'le bouton du haut est là, caché');
            });
            await t(`${name} : Recherche → « 🧭 Je veux faire… » est le premier type de la colonne`, async () => {
                await p.evaluate(async () => { const s = window.LCNDA_APP.state; s.researchKind = 'text'; await window.LCNDA_APP.setModule('recherche'); });
                await p.waitForSelector('#research-form [data-rk-pick]');
                const picks = await p.$$eval('#research-form [data-rk-pick]', b => b.map(x => x.dataset.rkPick));
                assert.equal(picks[0], 'je_veux', picks.slice(0, 3).join());
                await p.click('#research-form [data-rk-pick="je_veux"]');
                await p.waitForSelector('[data-jv-page] [data-jv-ask] input', {timeout: 20000});
                assert.match(await p.locator('#workspace .page-header h2').innerText(), /Que veux-tu faire/);
                assert.equal(await p.$eval('#research-form button[type=submit]', b => b.hidden), true, 'pas de bouton « Chercher » de la colonne');
            });
            await t(`${name} : « imprimer un arbre pour mamie » → la ligne « ✓ Ce que j’ai compris » et « Imprimer un arbre » en premier, sans question`, async () => {
                await ask(p, 'imprimer un arbre pour mamie');
                const und = await p.locator('[data-jv-und]').innerText();
                assert.match(und, /✓ Ce que j’ai compris/i); assert.match(und, /imprimer/); assert.match(und, /mamie/);
                assert.equal(await p.$('[data-jv-confirm]'), null, 'sûr : pas de « C’est bien ça ? »');
                assert.equal(await p.$eval('.jv-ma.best', a => a.dataset.jvCard), 'print_tree');
                assert.ok((await p.$$('[data-jv-res] .jv-ma')).length <= 3);
                assert.match(await p.locator('.jv-ma.best').innerText(), /Graphiques/);
                assert.ok(await p.$('.jv-ma.best [data-jv-go]') && await p.$('.jv-ma.best [data-jv-show]') && await p.$('.jv-ma.best [data-jv-fav]'));
                await noHScroll(p, 'page');
                await glue(p, '[data-jv-page]', 'page Je veux');
            });
            await t(`${name} : homonymes (« Jean ») : « C’est bien ça ? » et les trois Jean avec leurs dates ; choisir → les réponses`, async () => {
                await ask(p, 'trouver qui était témoin au mariage de Jean');
                await p.waitForSelector('[data-jv-homo]');
                assert.ok(await p.$('[data-jv-und].is-low [data-jv-confirm]'), 'pas sûr : la question');
                const homo = await p.locator('[data-jv-homo]').innerText();
                assert.match(homo, /Jean MAZAUD/); assert.match(homo, /Jean LACOMBE/); assert.match(homo, /1852/); assert.match(homo, /1888/);
                assert.equal(await p.$$eval('[data-jv-res] .jv-ma', x => x.length), 0, 'pas encore de réponses');
                await p.click(`[data-jv-homo] [data-v="${ID.jean_l}"]`);
                await p.waitForSelector('.jv-ma.best');
                assert.equal(await p.$eval('.jv-ma.best', a => a.dataset.jvCard), 'ask');
                assert.match(await p.locator('[data-jv-und]').innerText(), /Jean LACOMBE/);
                assert.equal(await p.$('[data-jv-confirm]'), null);
            });
            await t(`${name} : une faute rattrapée et dite, les mots ignorés dits, une pastille corrigée reclasse`, async () => {
                await ask(p, 'imprimé un arbe zorglub');
                assert.match(await p.locator('[data-jv-fixed]').innerText(), /arbe → arbre/);
                assert.match(await p.locator('[data-jv-unread]').innerText(), /zorglub/);
                assert.equal(await p.$eval('.jv-ma.best', a => a.dataset.jvCard), 'print_tree');
                await p.click('[data-jv-pill="act"]'); await p.waitForSelector('[data-jv-pop]');
                await p.click('[data-jv-pop] [data-jv-set="act"][data-v="exporter"]');
                await p.click('[data-jv-pill="obj"]'); await p.click('[data-jv-pop] [data-jv-set="obj"][data-v="base"]');
                const best = await p.$eval('.jv-ma.best', a => a.dataset.jvCard);
                assert.ok(['gedcom', 'share_export'].includes(best), best);
                assert.ok(await p.$('[data-jv-pill="act"].is-chg'), 'la pastille changée se voit');
            });
            await t(`${name} : flou → « C’est bien ça ? », « Oui » montre les réponses ; rien → « Je n’ai pas trouvé » + FAQ`, async () => {
                await ask(p, 'le truc pour les vieux papiers');
                await p.waitForSelector('[data-jv-confirm]');
                await p.click('[data-jv-yes]'); await p.waitForSelector('.jv-ma.best');
                assert.equal(await p.$eval('.jv-ma.best', a => a.dataset.jvCard), 'reading');
                await ask(p, 'xqzw brrr');
                assert.match(await p.locator('[data-jv-res]').innerText(), /pas trouvé/);
                assert.ok(await p.$('[data-jv-faq]'));
                assert.equal(await p.$('[data-jv-ai]'), null, 'pas d’IA (pas installée, éteinte)');
            });
            if (name === '1440') {
                await t('▶ « Imprimer un arbre » : Graphiques → Arbre des ascendants, la personne mise, rien d’imprimé ; 👣 tout seul la 1re fois', async () => {
                    await ask(p, `imprimer un arbre de Marius DURAND`);
                    await p.waitForFunction(() => /Marius DURAND/.test(document.querySelector('[data-jv-und]')?.innerText || ''));
                    const before = p.posts.length;
                    await p.click('.jv-ma.best [data-jv-go]');
                    await p.waitForFunction(() => window.LCNDA_APP.state.module === 'graphiques' && window.LCNDA_APP.state.graphMode === 'ancestors', null, {timeout: 15000});
                    assert.equal(await p.evaluate(() => Number(window.LCNDA_APP.state.currentPersonId)), ID.marius);
                    await p.waitForSelector('.vg-root:not([hidden]) .vg-bubble', {timeout: 15000});
                    assert.match(await p.locator('.vg-bubble').innerText(), /Ouvre « Graphiques »/);
                    assert.ok(await p.$('.vg-bubble [data-vg="doit"]'), '▶ Fais-le pour moi');
                    assert.equal(await p.evaluate(() => window.__printed), 0, 'rien n’est imprimé');
                    assert.equal(p.posts.slice(before).filter(x => !/save_settings|ui_state|journal|log/.test(x)).length, 0, p.posts.slice(before).join('\n'));
                    await p.click('.vg-bubble [data-vg="skip"]');
                    assert.equal(await p.evaluate(() => !!JSON.parse(localStorage.getItem('genealogie-je-veux-hist')).seen.print_tree), true);
                    // la 2e fois : plus de 👣 tout seul
                    await toJV(p, 'imprimer un arbre'); await p.waitForSelector('.jv-ma.best');
                    await p.click('.jv-ma.best [data-jv-go]');
                    await p.waitForFunction(() => window.LCNDA_APP.state.module === 'graphiques');
                    await p.waitForTimeout(900);
                    assert.equal(await p.$('.vg-root:not([hidden])'), null, 'pas de 👣 la 2e fois');
                    const rec = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-je-veux-hist')).recent.map(r => r.q));
                    assert.ok(rec.includes('imprimer un arbre'), rec.join());
                });
                await t('▶ « Fusionner deux lieux » : Réglages → Modifications groupées, rien de fusionné ; 👣 : la bulle, Suivant, ▶ Fais-le pour moi', async () => {
                    await toJV(p, 'fusionner deux lieux'); await p.waitForSelector('.jv-ma.best');
                    assert.equal(await p.$eval('.jv-ma.best', a => a.dataset.jvCard), 'merge_places');
                    await p.click('.jv-ma.best [data-jv-show]');
                    await p.waitForSelector('.vg-root:not([hidden]) .vg-bubble', {timeout: 15000});
                    assert.match(await p.locator('.vg-title').innerText(), /Réglages/);
                    assert.match(await p.locator('.vg-count').innerText(), /1 \/ 3/);
                    assert.ok(await p.$('.vg-halo'));
                    await p.click('.vg-bubble [data-vg="next"]');
                    await p.waitForFunction(() => /2 \/ 3/.test(document.querySelector('.vg-count')?.textContent || ''), null, {timeout: 15000});
                    const before = p.posts.length;
                    await p.click('.vg-bubble [data-vg="doit"]');
                    await p.waitForFunction(() => window.LCNDA_APP.state.module === 'maintenance' && window.LCNDA_APP.state.maintenanceTab === 'bulk', null, {timeout: 15000});
                    await p.waitForTimeout(600);
                    assert.equal(p.posts.slice(before).filter(x => /merge|fusion|replace/i.test(x)).length, 0, 'rien de fusionné');
                    assert.equal(await p.$('.vg-root'), null, 'la bulle est fermée');
                });
                await t('▶ « Faire un diagramme des métiers » : Diagrammes → ＋ Nouveau → 💬 Je veux représenter…, la phrase posée, rien de créé', async () => {
                    await p.evaluate(() => window.LCNDA_EXT.jeVeux.save({show: 'never'}));
                    await toJV(p, 'faire un diagramme des métiers'); await p.waitForSelector('.jv-ma.best');
                    assert.equal(await p.$eval('.jv-ma.best', a => a.dataset.jvCard), 'diagram');
                    const before = p.posts.length;
                    await p.click('.jv-ma.best [data-jv-go]');
                    await p.waitForFunction(() => document.querySelector('[data-dga-q]')?.value === 'faire un diagramme des métiers', null, {timeout: 15000});
                    assert.equal(await p.evaluate(() => window.LCNDA_APP.state.module), 'diagrammes');
                    await p.waitForTimeout(500);
                    assert.equal(p.posts.slice(before).filter(x => /diagram|dgo_/i.test(x) && /save|create|new/i.test(x)).length, 0, p.posts.slice(before).join('\n'));
                    await p.evaluate(() => window.LCNDA_EXT.jeVeux.save({show: 'first'}));
                });
                await t('⭐ Mes buts : ☆ sur une réponse, retrouvé en tête de page', async () => {
                    await toJV(p, 'faire une sauvegarde'); await p.waitForSelector('.jv-ma.best');
                    assert.equal(await p.$eval('.jv-ma.best', a => a.dataset.jvCard), 'backup');
                    await p.click('.jv-ma.best [data-jv-fav]');
                    assert.match(await p.locator('[data-jv-rec]').innerText(), /mes buts[\s\S]*Faire une sauvegarde/i);
                });
                await t('⌘K : « 🧭 Je veux… » en premier mode, ▶ 👣 sur la ligne, la ligne « J’ai compris », Tab → « 🔎 Trouver »', async () => {
                    await p.evaluate(() => window.LCNDA_APP.setModule('dashboard'));
                    await p.keyboard.press('Control+KeyK');
                    await p.waitForSelector('#quick-search .jv-qk-modes [data-jv-mode="goal"][aria-pressed="true"]');
                    await p.fill('#quick-search input', 'imprimer un arbre pour mamie');
                    await p.waitForSelector('#quick-search li.jv-qk-row', {timeout: 15000});
                    const first = await p.$eval('#quick-search li[data-qs-index="0"]', li => ({id: li.dataset.jvId, go: !!li.querySelector('[data-jv-qgo]'), show: !!li.querySelector('[data-jv-show]')}));
                    assert.deepEqual(first, {id: 'print_tree', go: true, show: true});
                    assert.match(await p.locator('#quick-search .jv-qk-und').innerText(), /Ce que j’ai compris/i);
                    assert.ok(await p.$('#quick-search li.jv-qk-more'), '« Voir tout dans Recherche »');
                    await p.press('#quick-search input', 'Tab');
                    await p.waitForSelector('#quick-search [data-jv-mode="find"][aria-pressed="true"]');
                    await p.waitForFunction(() => !document.querySelector('#quick-search li.jv-qk-row'), null, {timeout: 10000});
                    assert.equal(await p.$eval('#quick-search .jv-qk-und', e => e.hidden), true);
                    await p.press('#quick-search input', 'Tab');
                    await p.waitForSelector('#quick-search li.jv-qk-row', {timeout: 15000});
                    // sans verbe : la recherche de noms, comme avant
                    await p.fill('#quick-search input', 'Camille');
                    await p.waitForFunction(() => /Camille MAZAUD/.test(document.querySelector('#quick-search')?.innerText || ''), null, {timeout: 15000});
                    assert.equal(await p.$('#quick-search li.jv-qk-row'), null);
                    // Entrée : ▶ ; ⇧ + Entrée : 👣
                    await p.fill('#quick-search input', 'changer les couleurs');
                    await p.waitForSelector('#quick-search li.jv-qk-row[data-jv-id="theme"]', {timeout: 15000});
                    await p.press('#quick-search input', 'Shift+Enter');
                    await p.waitForSelector('.vg-root:not([hidden]) .vg-bubble', {timeout: 15000});
                    assert.equal(await p.$('#quick-search'), null);
                    await p.click('.vg-bubble [data-vg="skip"]');
                });
                await t('🗂 Tout parcourir : Toutes + 10 familles, toutes les intentions (≥ 150), rangées, la case qui filtre', async () => {
                    await toJV(p, '');
                    await p.click('[data-jv-browse]');
                    await p.waitForSelector('[data-jv-fams] [data-jv-fam]');
                    const fams = await p.$$eval('[data-jv-fams] [data-jv-fam]', b => b.map(x => x.textContent.replace(/\s*\d+$/, '').trim()));
                    assert.equal(fams.length, 11, fams.join(' | '));
                    for (const f of ['Toutes', 'Saisir', 'Chercher', 'Montrer', 'Imprimer, exporter', 'Partager', 'Ranger, panier', 'Vérifier', 'Données', 'Outils', 'Réglages']) assert.ok(fams.some(x => x.includes(f)), f);
                    const n = await p.evaluate(() => window.LCNDA_EXT.intents.length);
                    assert.ok(n >= 150, `${n} intentions`);
                    assert.equal(await p.$$eval('[data-jv-cat] .jv-cc', x => x.length), n, 'toutes, pas un échantillon');
                    await p.click('[data-jv-fam="imprimer"]');
                    const ids = await p.$$eval('[data-jv-cat] .jv-cc', x => x.map(a => a.dataset.jvCard));
                    assert.ok(ids.includes('print_tree') && ids.includes('gedcom') && !ids.includes('backup'), ids.join());
                    await p.click('[data-jv-fam=""]');
                    await p.fill('[data-jv-catq]', 'sauvegarde');
                    const f = await p.$$eval('[data-jv-cat] .jv-cc', x => x.map(a => a.dataset.jvCard));
                    assert.ok(f.includes('backup') && f.length < n, f.join());
                    assert.ok(await p.$('[data-jv-cat] .jv-cc [data-jv-go]') && await p.$('[data-jv-cat] .jv-cc [data-jv-show]') && await p.$('[data-jv-cat] .jv-cc [data-jv-fav]'));
                    await p.fill('[data-jv-catq]', '');
                    await glue(p, '[data-jv-cat-zone]', 'catalogue');
                });
                await t('Listes → « 🧭 Tout ce que l’app sait faire » : un tableau (famille, nom, ce que ça fait, chemin, ▶), la barre cherche', async () => {
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'je_veux'; A.setModule('listes'); });
                    await p.waitForSelector('[data-jv-list] table.jv-ltable tbody tr', {timeout: 20000});
                    const heads = await p.$$eval('[data-jv-list] thead th', h => h.map(x => x.textContent.trim()));
                    assert.deepEqual(heads.slice(0, 4), ['Famille', 'Nom', 'Ce que ça fait', 'Chemin']);
                    const n = await p.evaluate(() => window.LCNDA_EXT.intents.length);
                    assert.equal(await p.$$eval('[data-jv-list] tbody tr', r => r.length), n);
                    await p.fill('[data-jv-list] .ui-listbar input', 'GEDCOM');
                    await p.waitForFunction(() => document.querySelectorAll('[data-jv-list] tbody tr').length < 20, null, {timeout: 5000});
                    assert.ok(await p.$('[data-jv-list] tr[data-jv-row="gedcom"] [data-jv-go]'));
                    await p.fill('[data-jv-list] .ui-listbar input', '');
                });
                await t('Réglages → Navigation → 🧭 Je veux… : bouton du haut, widget en haut du tableau de bord, « ? » souvent fait ici, Recherche éteinte', async () => {
                    await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'je_veux'; await A.setModule('maintenance'); });
                    await p.waitForSelector('[data-jv-settings] [data-jv-opt="top"]', {timeout: 20000});
                    assert.ok(await p.$('#sidebar-content [data-side-value="je_veux"]'), 'la page est dans la colonne des Réglages');
                    assert.match(await p.locator('#sidebar-content').textContent(), /🧭 Je veux…/);
                    assert.match(await p.locator('[data-jv-cover]').innerText(), /avec une intention/);
                    assert.ok(await p.$('[data-jv-cover] .ui-badge.is-green'), 'couverture complète');
                    await p.locator('[data-jv-settings] [data-jv-opt="top"]').check({force: true});
                    await p.waitForFunction(() => !document.querySelector('#jv-open').hidden);
                    await p.locator('[data-jv-settings] [data-jv-opt="widget"]').check({force: true});
                    await p.locator('[data-jv-settings] [data-jv-opt="bubbles"]').check({force: true});
                    await p.click('[data-jv-seg="n"][data-v="2"]');
                    await p.click('[data-jv-seg="show"][data-v="never"]');
                    assert.deepEqual(await p.evaluate(() => { const s = window.LCNDA_EXT.jeVeux.settings(); return [s.top, s.widget, s.bubbles, s.n, s.show]; }), [true, true, true, 2, 'never']);
                    await glue(p, '[data-jv-settings]', 'réglages');
                    await p.evaluate(() => window.LCNDA_APP.setModule('dashboard'));
                    await p.waitForSelector('#workspace .jv-dash-top [data-jv-wform]', {timeout: 15000});
                    await p.fill('#workspace .jv-dash-top input', 'fusionner deux lieux'); await p.press('#workspace .jv-dash-top input', 'Enter');
                    await p.waitForSelector('[data-jv-page] .jv-ma.best', {timeout: 15000});
                    assert.equal(await p.$$eval('[data-jv-res] .jv-ma', x => x.length), 2, 'deux réponses');
                    const help = await p.$('#workspace .page-header .ui-help');
                    if (help) { await help.click(); await p.waitForSelector('.ui-bubble .jv-bub', {timeout: 10000}); assert.match(await p.locator('.ui-bubble .jv-bub').innerText(), /souvent fait ici/i); await p.keyboard.press('Escape'); }
                    await p.click('#jv-open'); await p.waitForSelector('[data-jv-page]');
                    await p.evaluate(() => window.LCNDA_EXT.jeVeux.save({recherche: false}));
                    await p.evaluate(async () => { const s = window.LCNDA_APP.state; s.researchKind = 'text'; await window.LCNDA_APP.setModule('recherche'); });
                    await p.waitForSelector('#research-form [data-rk-pick]');
                    assert.equal(await p.$('#research-form [data-rk-pick="je_veux"]'), null, 'éteint : plus dans Recherche');
                    await p.evaluate(() => window.LCNDA_EXT.jeVeux.reset());
                    assert.equal(await p.evaluate(() => document.querySelector('#jv-open').hidden), true);
                });
                await t('mode consultation : ce qui modifie est grisé avec la raison, ce qui se regarde marche, 👣 reste', async () => {
                    await p.evaluate(() => document.body.classList.add('is-kiosk'));
                    await toJV(p, 'fusionner deux lieux'); await p.waitForSelector('.jv-ma.best');
                    assert.equal(await p.$eval('.jv-ma.best [data-jv-go]', b => b.disabled), true);
                    assert.match(await p.locator('.jv-ma.best .jv-ma-ro').innerText(), /En consultation/);
                    assert.equal(await p.$eval('.jv-ma.best [data-jv-show]', b => b.disabled), false);
                    assert.ok(await p.$('.jv-kiosk'));
                    await ask(p, 'voir l’arbre des ascendants');
                    assert.equal(await p.$eval('.jv-ma.best [data-jv-go]', b => b.disabled), false);
                    await p.click('[data-jv-browse]');
                    assert.ok((await p.$$('[data-jv-cat] .jv-cc.is-ro')).length > 10);
                    await p.evaluate(() => document.body.classList.remove('is-kiosk'));
                });
            } else {
                await t(`${name} : catalogue, réglages et liste tiennent dans l’écran, rien de collé`, async () => {
                    await toJV(p, ''); await p.click('[data-jv-browse]'); await p.waitForSelector('[data-jv-cat] .jv-cc');
                    await noHScroll(p, 'catalogue'); await glue(p, '[data-jv-cat-zone]', 'catalogue');
                    await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'je_veux'; await A.setModule('maintenance'); });
                    await p.waitForSelector('[data-jv-settings]'); await noHScroll(p, 'réglages'); await glue(p, '[data-jv-settings]', 'réglages');
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'je_veux'; A.setModule('listes'); });
                    await p.waitForSelector('[data-jv-list] tbody tr'); await noHScroll(p, 'liste');
                    await p.keyboard.press('Control+KeyK'); await p.waitForSelector('#quick-search .jv-qk-modes');
                    await p.fill('#quick-search input', 'fusionner deux lieux'); await p.waitForSelector('#quick-search li.jv-qk-row', {timeout: 15000});
                    await noHScroll(p, '⌘K');
                    await p.keyboard.press('Escape');
                });
            }
            await p.context().close();
        }
        await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
    } finally { await browser.close().catch(() => {}); kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(`\n${pass} ✓, ${fail} ✗`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
