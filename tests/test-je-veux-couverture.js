'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🛡 Le test de garde de « 🧭 Je veux… » (maquette docs/design/je-veux.html, partie 6) :   node tests/test-je-veux-couverture.js
 * Pour qu'une nouveauté n'oublie pas son intention : dans la vraie app (php -S + navigateur), chaque onglet du haut, chaque page
 * des Réglages et chaque outil enregistré (Raccourcis → Outils) doit avoir une intention dans LCNDA_EXT.intents — sinon le test
 * échoue en les listant tous. Une chose peut être « exprès sans intention » seulement si elle est écrite dans EXEMPT, avec la raison.
 * Il vérifie aussi que chaque intention a une famille, une icône, un nom, une ligne « ce que ça fait », un chemin qui commence par un
 * endroit qui existe (un onglet, la barre du haut, un outil…), qu'elle dit si elle marche en consultation, que les noms et lignes
 * des intentions écrites à la main sont traduits (assets/i18n/en.json…), et que les 7 phrases d'exemple de la maquette, avec tout
 * le registre (les fiches automatiques comprises), donnent toujours la bonne réponse en premier. Données fictives.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

/** exprès sans intention : [cible, raison] */
const EXEMPT = [['module:jeu', 'les jeux : l’intention « Jouer avec la famille » (game) y mène déjà, ce n’est pas un onglet du menu']];
const SEVEN = [['imprimer un arbre pour mamie', 'print_tree'], ['trouver qui était témoin au mariage de Jean', 'ask'], ['fusionner deux lieux', 'merge_places'], ['faire un diagramme des métiers', 'diagram'],
    ['mettre les séismes près de chez nous dans une fiche', 'fiche_add'], ['envoyer une liste à mon cousin', 'share_list'], ['savoir si un ancêtre a fait la guerre', 'war']];
const appRoot = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + String(e && e.message || e).split('\n').slice(0, 40).join('\n    ')); } };

(async () => {
    /* les traductions, sans navigateur */
    global.window = global;
    require('../assets/js/app-je-veux-moteur.js');
    const E = global.LCNDA_EXT.jeVeuxEngine;
    await t('les noms et les lignes des intentions écrites à la main sont traduits (en, es, de, it, pt, pl, nl)', () => {
        const miss = [];
        for (const lang of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl']) {
            const j = JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/i18n', lang + '.json'), 'utf8'));
            for (const it of E.hand()) for (const s of [it.name, it.does, ...it.path]) if (j[s] == null) miss.push(`[${lang}] ${it.id} : « ${s} »`);
            for (const [, l] of Object.values(E.FAM)) if (j[l] == null) miss.push(`[${lang}] famille « ${l} »`);
        }
        assert.deepEqual([...new Set(miss)], []);
    });

    let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— navigateur ou PHP absent : partie navigateur sautée'); console.log(`\n${pass} ✓, ${fail} ✗`); process.exit(fail ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-jvcouv-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
foreach ([['Camille', 'MAZAUD', 1], ['Jean', 'LACOMBE', 0], ['Marie', 'DURAND', 0]] as [$f, $l, $s]) $pdo->prepare('INSERT INTO persons(first_name,last_name,is_start) VALUES(?,?,?)')->execute([$f, $l, $s]);
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const kill = () => { try { proc.kill(); } catch (_) {} };
    process.on('exit', kill);
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 300; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await pw.chromium.launch();
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-premier-vu', '1'); localStorage.setItem('genealogie-visite-guidee', JSON.stringify({seen: true})); } catch (_) {} });
        await ctx.route(u => !u.toString().startsWith(base), r => r.abort());
        const p = await ctx.newPage();
        const errors = []; p.on('pageerror', e => errors.push(e.message));
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.jeVeux && window.LCNDA_EXT?.shortcuts?.catalog, null, {timeout: 60000});
        await p.waitForTimeout(800); // les fichiers qui ajoutent leurs pages et leurs outils après le chargement
        await p.evaluate(() => window.LCNDA_EXT.jeVeux.load());
        const D = await p.evaluate(() => {
            const app = window.LCNDA_APP, ext = window.LCNDA_EXT, reg = ext.jeVeuxUI.reg();
            return {
                modules: Object.entries(app.appModules).map(([k, v]) => [k, v[1]]),
                maint: app.defaultMaintenanceTabs.map(t => [t[0], t[2]]),
                tools: ext.shortcuts.catalog().filter(r => /^tool:/.test(r.target)).map(r => [r.target, r.label]),
                reg: reg.map(i => ({id: i.id, fam: i.fam, icon: i.icon, name: i.nameT, does: i.doesT, path: i.pathT, ro: i.ro, targets: i.targets, go: typeof i.go === 'function', src: i.src})),
                fams: Object.keys(ext.jeVeuxEngine.FAM),
                seven: null,
            };
        });
        const have = new Set(D.reg.flatMap(i => i.targets)), exempt = new Map(EXEMPT);
        const need = [...D.modules.map(([k, l]) => ['module:' + k, `onglet « ${l} »`]), ...D.maint.map(([k, l]) => ['maint:' + k, `page des Réglages « ${l} »`]), ...D.tools.map(([k, l]) => [k, `outil « ${l} »`])];
        await t(`chaque onglet (${D.modules.length}), page des Réglages (${D.maint.length}) et outil (${D.tools.length}) a son intention`, () => {
            const missing = need.filter(([tg]) => !have.has(tg) && !exempt.has(tg)).map(([tg, what]) => `${what} (${tg})`);
            assert.deepEqual(missing, [], `sans intention — ajoute une fiche dans app-je-veux-moteur.js, ou dans EXEMPT avec la raison :\n${missing.join('\n')}`);
            for (const [tg, why] of EXEMPT) assert.ok(why.length > 10, `${tg} : une raison`);
        });
        await t(`le registre : ≥ 150 intentions (${D.reg.length}), chacune complète, ids uniques`, () => {
            assert.ok(D.reg.length >= 150, String(D.reg.length));
            assert.equal(new Set(D.reg.map(i => i.id)).size, D.reg.length);
            const bad = D.reg.filter(i => !D.fams.includes(i.fam) || !i.icon || !String(i.name).trim() || !String(i.does).trim() || !i.path.length || i.path.some(x => !String(x).trim()) || typeof i.ro !== 'boolean' || !i.go).map(i => i.id);
            assert.deepEqual(bad, []);
            for (const f of D.fams) assert.ok(D.reg.some(i => i.fam === f), `famille vide : ${f}`);
        });
        await t('chaque chemin commence par un endroit qui existe (un onglet, la barre du haut, un outil, une action, les jeux)', () => {
            const starts = new Set([...D.modules.map(([, l]) => l), 'Barre du haut', 'Outil', 'Action', 'Jeux']);
            const bad = D.reg.filter(i => !starts.has(i.path[0]) && !i.id.startsWith('auto:tab:')).map(i => `${i.id} : « ${i.path[0]} »`);
            assert.deepEqual(bad, []);
        });
        await t('les 7 phrases de la maquette, avec tout le registre : la bonne réponse en premier', async () => {
            const got = await p.evaluate(async seven => { const E = window.LCNDA_EXT.jeVeuxEngine, reg = window.LCNDA_EXT.intents; return seven.map(([q]) => { const u = E.analyse(q, reg); return E.rank(u, reg).slice(0, 3).map(x => x.it.id); }); }, SEVEN);
            const bad = SEVEN.filter(([, id], i) => got[i][0] !== id).map(([q, id], i) => `« ${q} » : ${id} attendu, ${got[SEVEN.findIndex(x => x[0] === q)].join(', ')}`);
            assert.deepEqual(bad, []);
        });
        await t('la page des Réglages dit « complet »', async () => {
            const c = await p.evaluate(() => window.LCNDA_EXT.jeVeuxUI.coverage());
            assert.deepEqual(c.missing.filter(tg => !exempt.has(tg)), []);
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
    } finally { await browser.close().catch(() => {}); kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(`\n${pass} ✓, ${fail} ✗`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
