/* Harmonisation C7 « Chargement » : partout où l’app attend, un seul rond qui tourne + une phrase (UI.spinner),
 * ou des squelettes gris pour une liste (UI.skeleton).
 * 1) le composant : UI.spinner(texte) et UI.spinner(texte, {inline: true}) ;
 * 2) plus de variante : ni « Chargement… » écrit seul (<p class="muted">Chargement…</p>), ni rond fait main
 *    (<span class="ui-spinner"></span>, .loading-mark « VB » / « ⌕ ») ;
 * 3) navigateur : le rond tourne vraiment (animation ui-spin), la version « dans une ligne » reste dans la ligne.
 *    node tests/test-harmo-chargement.js
 * Fichiers laissés de côté (travail en cours ailleurs) : heritage-tableur.js, heritage-tresors*.js. */
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net'), vm = require('vm'), assert = require('assert');
const { spawn, spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..'), js = f => fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
let count = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e.message || e).split('\n').join('\n    ')); } };

(async () => {
    /* ── 1. composant ── */
    const ui = js('app-ui.js');
    const line = ui.split('\n').find(l => /UI\.spinner = \(/.test(l));
    await t('UI.spinner existe (un rond + une phrase) et a une version « dans une ligne »', () => {
        assert.ok(line, 'UI.spinner introuvable dans app-ui.js');
        const ctx = {UI: {}, esc: s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]))};
        vm.createContext(ctx); vm.runInContext(line.trim(), ctx);
        const a = ctx.UI.spinner('Chargement des médias…');
        assert.equal(a, '<div class="ui-spinner" role="status"><span class="ui-spin" aria-hidden="true"></span><span>Chargement des médias…</span></div>');
        const b = ctx.UI.spinner('<b>', {inline: true});
        assert.ok(b.startsWith('<span class="ui-spinner is-inline" role="status"><span class="ui-spin"') && b.includes('&lt;b&gt;'), 'version dans une ligne, texte échappé : ' + b);
        assert.ok(ctx.UI.spinner().includes('Chargement…'), 'phrase par défaut');
    });
    const css = fs.readFileSync(path.join(root, 'assets/css/ui.css'), 'utf8');
    await t('ui.css : le rond tourne, la version dans une ligne existe', () => {
        assert.ok(/@keyframes ui-spin/.test(css) && /\.ui-spin \{[^}]*animation: ui-spin/.test(css), 'animation du rond');
        assert.ok(/\.ui-spinner\.is-inline \{[^}]*inline-flex/.test(css), '.ui-spinner.is-inline');
    });

    /* ── 2. plus de variante ── */
    const SKIP = f => f === 'app-ui.js' || f === 'heritage-tableur.js' || /^heritage-tresors/.test(f);
    const files = fs.readdirSync(path.join(root, 'assets/js')).filter(f => f.endsWith('.js') && !SKIP(f));
    const all = Object.fromEntries(files.map(f => [f, js(f)]));
    const hits = (re, keep = () => true) => files.flatMap(f => all[f].split('\n').flatMap((l, i) => [...l.matchAll(re)].filter(m => keep(l, m)).map(m => `${f}:${i + 1} ${m[0].slice(0, 80)}`)));
    await t('aucun rond fait main (<span class="ui-spinner"></span>, <div class="ui-spinner">… écrit à la main)', () => {
        const h = hits(/<(span|div) class="ui-spinner[^"]*"[^>]*>/g);
        assert.deepEqual(h, []);
    });
    await t('plus de grand carré « VB » / « ⌕ » pendant l’attente (.loading-mark)', () => {
        const h = hits(/loading-mark/g);
        const idx = fs.readFileSync(path.join(root, 'index.php'), 'utf8'), app = fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8');
        assert.deepEqual(h, []);
        assert.ok(!/loading-mark/.test(idx), 'index.php');
        assert.ok(!/\.loading-mark/.test(app), 'app.css : règle devenue inutile');
        assert.ok(/<section class="loading-screen">\s*<div class="ui-spinner" role="status"><span class="ui-spin" aria-hidden="true"><\/span><span>Ouverture de la généalogie…<\/span><\/div>/.test(idx), 'écran d’ouverture = le rond commun');
    });
    // une phrase d’attente écrite seule dans un petit texte gris (un repli « UI.spinner ? … : 'Chargement…' » sur la même ligne est accepté)
    const WAIT = '(?:Chargement|Rechargement|Recherche|Calcul|Lecture|Préparation|Analyse|Vérification|Prévisualisation|Comparaison|Création en cours|Envoi|Je regarde|Diagramme|Widget|Carte|🗺 Carte)';
    await t('plus de « Chargement… » écrit seul, sans le rond', () => {
        const re = new RegExp(`<(p|small|div|span)[^>]*class="(?:muted|cell-muted)[^"]*"[^>]*>${WAIT}[^<]*…</\\1>`, 'g');
        const h = hits(re, l => !/spinner|skeleton/.test(l));
        assert.deepEqual(h, []);
        const s = hits(/<section class="loading-screen"><(?!\/section)(?![^']*spinner)[^`']*<p>/g);
        assert.deepEqual(s, [], 'écrans d’attente de la Recherche');
    });
    await t('app.js passe par waitHtml (rond commun, texte seul tant qu’app-ui.js n’est pas chargé)', () => {
        const app = all['app.js'];
        assert.ok(/const waitHtml = text => window\.LCNDA_UI\?\.spinner \? window\.LCNDA_UI\.spinner\(text\) : escapeHtml\(text\);/.test(app));
        assert.ok((app.match(/waitHtml\('/g) || []).length >= 10, 'endroits de app.js');
    });
    await t('diagrammes : « Lecture de ta généalogie… » avec le rond commun dans la ligne', () => {
        for (const f of ['heritage-diagram-cartes2.js', 'heritage-diagram-famille.js', 'heritage-diagram-genea.js', 'heritage-diagram-more.js', 'heritage-diagram-vie.js', 'heritage-diagram-nouveaux.js'])
            assert.ok(all[f].includes("window.LCNDA_UI.spinner('Lecture de ta généalogie…', {inline: true})"), f);
    });

    /* ── 3. navigateur ── */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = spawnSync('php', ['-v']).status === 0 ? 'php' : null; }
    const phpArgs = p => { try { return require('../electron/php-server').phpRuntimeArgs(p); } catch (_) { return []; } };
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} harmonisation C7 chargement : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-harmo-chargement-'));
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.HARMO_CHARGEMENT_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(tmp), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const page = await browser.newPage({viewport: {width: 1440, height: 900}});
        page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push('console : ' + m.text()); });
        page.on('dialog', d => d.dismiss());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1500);
        await t('le rond commun tourne ; dans une ligne il reste à côté du bouton ; dans une grille il prend toute la ligne', async () => {
            const s = await page.evaluate(() => {
                const UI = window.LCNDA_UI, box = document.createElement('div');
                box.innerHTML = `<div data-a>${UI.spinner('Lecture…')}</div><p data-b><button>Lire</button> <span data-msg>${UI.spinner('Lecture de ta généalogie…', {inline: true})}</span></p><div class="mpk-grid" style="display:grid;grid-template-columns:repeat(4,100px)" data-c>${UI.spinner('Recherche…')}</div>`;
                document.body.append(box);
                const spin = box.querySelector('[data-a] .ui-spin'), inl = box.querySelector('[data-b] .ui-spinner'), gr = box.querySelector('[data-c] .ui-spinner');
                const out = {anim: getComputedStyle(spin).animationName, block: getComputedStyle(box.querySelector('[data-a] .ui-spinner')).display, inline: getComputedStyle(inl).display,
                    sameLine: Math.abs(box.querySelector('[data-b] button').getBoundingClientRect().top - inl.getBoundingClientRect().top) < 12, grid: getComputedStyle(gr).gridColumnStart + '/' + getComputedStyle(gr).gridColumnEnd};
                box.remove(); return out;
            });
            assert.equal(s.anim, 'ui-spin'); assert.equal(s.block, 'flex'); assert.equal(s.inline, 'inline-flex'); assert.ok(s.sameLine, 'dans la ligne'); assert.equal(s.grid, '1/-1');
        });
        await t('quelques écrans qui attendent s’ouvrent sans erreur (fiche, Graphiques, Recherche)', async () => {
            await page.evaluate(async () => { const A = window.LCNDA_APP; await A.setModule('personnes'); }); await page.waitForTimeout(800);
            await page.evaluate(async () => { await window.LCNDA_APP.setModule('graphiques'); }); await page.waitForTimeout(800);
            await page.evaluate(() => { const ws = document.querySelector('#workspace'); ws.innerHTML = '<section class="loading-screen">' + window.LCNDA_UI.spinner('Recherche des événements…') + '</section>'; });
            const ls = await page.evaluate(() => { const s = document.querySelector('#workspace .loading-screen .ui-spinner'); return s ? getComputedStyle(s).fontWeight : ''; });
            assert.equal(ls, '700', 'écran d’attente : phrase en gras');
            assert.deepEqual(errs, []);
        });
    } finally { await browser.close(); proc.kill(); try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {} }
    console.log(`${failed ? '✗' : '✓'} harmonisation C7 chargement : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
