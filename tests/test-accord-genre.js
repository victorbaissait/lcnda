'use strict';
/** ✍️ Accord des mots avec la personne (assets/js/app-accord.js) : homme, femme, autre, non renseigné, animal ;
 *  le réglage « Accord des mots » (Réglages → Thème et couleurs, K2) change bien l'écriture ; une fiche d'homme dit « Décédé ».
 *  node tests/test-accord-genre.js   (ACCORD_PORT=… pour choisir le port du serveur de test) */
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
const read = s => fs.readFileSync(path.join(root, s), 'utf8');
const store = {};
global.window = global; global.localStorage = {getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }};
const ACC = require('../assets/js/app-accord.js');
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };

(async () => {
    /* ═════ 1. l'aide commune ═════ */
    await t('homme → masculin, femme → féminin (personnes et animaux M / F), quel que soit le réglage', () => {
        for (const mode of ['avant', 'f', 'm', 'point', 'paren', 'neutre']) {
            ACC.save({other: mode, unknown: mode});
            assert.equal(ACC.accord({gender: 'male'}, 'Né(e) le'), 'Né le'); assert.equal(ACC.accord({gender: 'female'}, 'Né(e) le'), 'Née le');
            assert.equal(ACC.accord({sex: 'M'}, 'Stérilisé(e)'), 'Stérilisé'); assert.equal(ACC.accord({sex: 'F'}, 'Stérilisé(e)'), 'Stérilisée');
            assert.equal(ACC.accord('male', 'Mort(e) pour la France'), 'Mort pour la France'); assert.equal(ACC.accord('femelle', 'Mort(e) pour la France'), 'Morte pour la France');
            assert.equal(ACC.life('deceased', 'male'), 'Décédé'); assert.equal(ACC.life('living', 'male'), 'Vivant');
            assert.equal(ACC.life('deceased', 'female'), 'Décédée'); assert.equal(ACC.life('living', 'female'), 'Vivante');
            assert.equal(ACC.accord('male', {m: 'il', f: 'elle'}), 'il'); assert.equal(ACC.accord('female', {m: 'il', f: 'elle'}), 'elle');
        }
        ACC.save(ACC.DEFAULT);
    });
    await t('au départ (« Comme avant ») : autre et inconnu gardent l’écriture d’aujourd’hui — « né(e) », mais « Vivante », « Décédée » sur la fiche', () => {
        assert.equal(store['genealogie-accord'], undefined, 'rien d’écrit tant qu’on n’a rien choisi');
        for (const g of ['nonbinary', 'unknown', '', null, {gender: 'unknown'}, {sex: ''}]) {
            assert.equal(ACC.accord(g, 'Né(e) le'), 'Né(e) le'); assert.equal(ACC.accord(g, 'non crédité(e)'), 'non crédité(e)');
            assert.equal(ACC.life('deceased', g), 'Décédée'); assert.equal(ACC.life('living', g), 'Vivante'); assert.equal(ACC.life('unknown', g), 'À vérifier');
            assert.equal(ACC.accord(g, 'né(e)', {before: 'né'}), 'né', 'un endroit qui écrivait « né » le garde');
        }
    });
    await t('le réglage change l’écriture : féminin, masculin, point médian, parenthèses, tournure neutre — chacun pour « autre » et pour « non renseigné »', () => {
        const W = 'Décédé(e) le', o = {x: 'Décès le'};
        const exp = {f: 'Décédée le', m: 'Décédé le', point: 'Décédé·e le', paren: 'Décédé(e) le', neutre: 'Décès le'};
        for (const [mode, out] of Object.entries(exp)) {
            ACC.save({other: mode, unknown: 'avant'});
            assert.equal(ACC.accord('nonbinary', W, o), out, `autre / ${mode}`);
            assert.equal(ACC.accord({gender: 'unknown'}, W, o), 'Décédé(e) le', 'non renseigné garde son propre réglage');
            assert.equal(ACC.accord({gender: 'male'}, W, o), 'Décédé le');
            ACC.save({other: 'avant', unknown: mode});
            assert.equal(ACC.accord('unknown', W, o), out, `inconnu / ${mode}`); assert.equal(ACC.accord({sex: ''}, W, o), out, 'un animal sans sexe suit « non renseigné »');
            assert.equal(ACC.accord('nonbinary', W, o), 'Décédé(e) le');
        }
        ACC.save({other: 'neutre', unknown: 'neutre'});
        assert.equal(ACC.accord('x', 'Né(e) le'), 'Né(e) le', 'sans tournure neutre prévue : entre parenthèses');
        assert.equal(ACC.life('deceased', 'nonbinary'), 'Décès'); assert.equal(ACC.life('living', 'nonbinary'), 'En vie');
        ACC.save({other: 'point', unknown: 'f'});
        assert.equal(ACC.accord('nonbinary', {m: 'il', f: 'elle'}), 'il·elle'); assert.equal(ACC.accord('unknown', {m: 'il', f: 'elle'}), 'elle');
        assert.equal(ACC.sample('point'), 'Né·e le 12 mars 1888 · Décédé·e');
        ACC.save(ACC.DEFAULT); assert.equal(store['genealogie-accord'], undefined, 'revenir au départ efface la clé');
    });
    await t('valeurs inconnues ou forgées : remises au départ', () => {
        assert.deepEqual(ACC.clean({other: '<img>', unknown: 'point', extra: 1}), {other: 'avant', unknown: 'point'});
        assert.deepEqual(ACC.clean('n’importe quoi'), ACC.DEFAULT);
        store['genealogie-accord'] = '{pas du json'; assert.deepEqual(ACC.read(), ACC.DEFAULT);
        delete store['genealogie-accord'];
    });

    /* ═════ 2. branchements ═════ */
    await t('lifeText d’app.js passe par l’aide ; LCNDA_APP.accord ; le cadre est rangé dans Thème et couleurs', () => {
        const app = read('assets/js/app.js');
        assert.match(app, /const lifeText = \(status, gender\) => \{ if \(window\.LCNDA_ACCORD\) return window\.LCNDA_ACCORD\.life\(status, gender\);/);
        assert.match(app, /lifeText,accord,listControllerSignal/);
        assert.match(app, /look_theme:\[\[null,\[[^\]]*\]*.*\['q','#lc-accord'\]/);
        const idx = read('index.php');
        assert.match(idx, /app-accord\.js\?v=\d+/); assert.ok(idx.indexOf('app-accord.js') < idx.indexOf('assets/js/app.js'), 'chargé avant app.js');
    });
    await t('la clé suit les 💾 Réglages enregistrés et le défaut du site (page et serveur)', () => {
        const k = 'genealogie-accord';
        assert.ok(read('assets/js/app.js').match(/const SITE_DEFAULT_KEYS = \[([\s\S]*?)\];/)[1].includes(`'${k}'`));
        assert.ok(read('api.php').match(/function site_defaults_allowed_keys\(\): array\s*\{[^\[]*return \[([\s\S]*?)\];/)[1].includes(`'${k}'`));
        assert.ok(read('assets/js/heritage-studio.js').match(/const LAYOUT_KEYS = \[([\s\S]*?)\];/)[1].includes(`'${k}'`));
        assert.match(read('assets/js/heritage-studio.js'), /'genealogie-accord': v => window\.LCNDA_ACCORD\?\.clean/);
    });
    await t('plus de « né(e) », « décédé(e) », « crédité(e) »… écrits en dur là où la fiche est connue', () => {
        const files = ['assets/js/heritage-scene-actor.js', 'assets/js/heritage-pets.js', 'assets/js/heritage-livrets.js', 'assets/js/app-designs.js', 'assets/js/heritage-widgets.js', 'assets/js/heritage.js', 'assets/js/app-listes.js', 'assets/js/app-recherche.js', 'assets/js/heritage-calendar-more.js', 'assets/js/heritage-depouillements.js', 'assets/js/heritage-oeuvres-fiches.js', 'assets/js/heritage-transcribe.js', 'assets/js/heritage-press-ads.js', 'assets/js/heritage-traitement-texte-fusion.js', 'assets/js/heritage-traitement-texte-outils.js'];
        const RX = /\b(?:[Nn]é|[Dd]écédé|[Ii]nhumé|[Cc]rédité|[Mm]arié|[Mm]ort|[Vv]ivant|[Ss]térilisé|[Dd]éfunt|[Bb]aptisé|[Ll]auréat|[Nn]ommé|[Rr]emplaçant|[Rr]econnaissant|[Rr]appelé|[Rr]etenu)\(e\)/;
        for (const f of files) read(f).split('\n').forEach((l, i) => { if (RX.test(l) && !/accord\(|accSex\(|acc\(|PET_ACC|LCNDA_ACCORD/.test(l)) assert.fail(`${f}:${i + 1} : ${l.trim().slice(0, 120)}`); });
        const more = read('assets/js/heritage-more.js');
        assert.doesNotMatch(more, /'Né\(e\) à'|<th>Né\(e\) à<\/th>|'décédé\(e\)'|'vivant\(e\)'|Mort\(e\) ou inhumé\(e\)/);
        assert.match(more, /Comment s’écrivent « né », « née », « décédé », « décédée »… pour une personne qui n’est ni homme ni femme/, 'entrée de la FAQ');
    });

    /* ═════ 3. le serveur et le navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!phpPath || !chromium) { console.log('— serveur ou navigateur absent : partie sautée'); console.log(`✓ accord des mots : ${n} vérifications`); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-accord-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(1,'Jean','MARTIN','male','deceased'),(2,'Marie','DUPONT','female','deceased'),(3,'Camille','ROUX','nonbinary','deceased'),(4,'Dominique','LEROY','unknown','living')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.ACCORD_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const shots = process.env.ACCORD_SHOTS || '';
    const open = async (w = 1440, extra = {}) => {
        const page = await browser.newPage({viewport: {width: w, height: 1000}, ...extra});
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.route(u => !u.toString().startsWith(base), rt => rt.abort());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_ACCORD);
        return page;
    };
    const badge = async (page, id) => { await page.evaluate(i => { location.hash = `#personnes/${i}`; }, id);
        const NAMES = {1: 'Jean', 2: 'Marie', 3: 'Camille', 4: 'Dominique'};
        await page.waitForFunction(([i, nm]) => window.LCNDA_APP.state.currentPersonId === i && document.querySelector('#workspace .status-badge') && (document.querySelector('#workspace .person-hero')?.textContent || '').includes(nm), [id, NAMES[id]]); await page.waitForTimeout(150); return (await page.locator('#workspace .status-badge').first().textContent()).trim(); };
    const goTheme = async page => { await page.evaluate(() => { location.hash = '#maintenance'; }); await page.waitForTimeout(900);
        await page.locator('[data-side-value="look_theme"]').first().click(); await page.waitForSelector('#lc-accord', {state: 'visible'}); await page.waitForTimeout(500); };
    try {
        const page = await open();
        await t('fiche d’un homme : « † Décédé » ; d’une femme : « † Décédée » ; autre et inconnu : comme avant (« Décédée », « Vivante »)', async () => {
            assert.equal(await badge(page, 1), '† Décédé'); assert.equal(await badge(page, 2), '† Décédée');
            assert.equal(await badge(page, 3), '† Décédée'); assert.equal(await badge(page, 4), 'Vivante');
        });
        await t('Réglages → Thème et couleurs → « ✍️ Accord des mots » : choix, aperçu, gardé tout de suite (K2, « ↶ Annuler »)', async () => {
            await goTheme(page);
            assert.equal(await page.locator('#lc-accord .lca-group').count(), 2);
            assert.equal(await page.locator('#lc-accord input[name="lca-other"]').count(), 6);
            assert.equal(await page.locator('#lc-accord input[name="lca-other"]:checked').getAttribute('value'), 'avant');
            if (shots) await page.locator('#lc-accord').screenshot({path: path.join(shots, 'accord-1440.png')});
            await page.locator('#lc-accord input[name="lca-other"][value="point"]').check(); await page.waitForTimeout(900);
            assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('genealogie-accord'))), {other: 'point', unknown: 'avant'});
            assert.match(await page.locator('#lc-accord [data-lca-preview]').textContent(), /Camille ROUX.*Né·e le 12 mars 1888.*Décédé·e/s);
            assert.match(await page.locator('#workspace .ui-ph-saved').first().textContent(), /Enregistré/);
            assert.ok(await page.locator('.toast', {hasText: 'Annuler'}).count() >= 1, 'message H7 avec « ↶ Annuler »');
            await page.locator('#lc-accord input[name="lca-unknown"][value="neutre"]').check(); await page.waitForTimeout(900);
            assert.match(await page.locator('#lc-accord [data-lca-preview]').textContent(), /Dominique LEROY.*Naissance le 12 mars 1888/s);
        });
        await t('les fiches suivent : autre → « † Décédé·e », inconnu → « En vie » ; l’homme reste « † Décédé »', async () => {
            assert.equal(await badge(page, 3), '† Décédé·e'); assert.equal(await badge(page, 4), 'En vie'); assert.equal(await badge(page, 1), '† Décédé');
        });
        await t('390 px et sombre : le cadre tient dans l’écran, sans défilement de côté', async () => {
            for (const [w, scheme] of [[390, 'light'], [1440, 'dark'], [390, 'dark']]) {
                const p = await open(w, {colorScheme: scheme}); await goTheme(p);
                const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                assert.ok(over <= 1, `${w}px ${scheme} : ${over}px de trop`);
                if (shots) await p.locator('#lc-accord').screenshot({path: path.join(shots, `accord-${w}-${scheme}.png`)});
                await p.close();
            }
        });
        await t('↺ Remettre comme au départ : la clé s’efface, retour à l’écriture d’aujourd’hui', async () => {
            await goTheme(page); await page.locator('#lc-accord [data-lca-reset]').click(); await page.waitForTimeout(700);
            assert.equal(await page.evaluate(() => localStorage.getItem('genealogie-accord')), null);
            assert.equal(await badge(page, 3), '† Décédée');
        });
        assert.deepEqual(errs, [], 'aucune erreur dans la page');
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`✓ accord des mots : ${n} vérifications`);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
