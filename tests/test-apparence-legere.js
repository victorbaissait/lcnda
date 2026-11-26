'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🪶 Réglages → Apparence légère : les aperçus des designs (app-designs.js, iframes) ne redemandent plus chacun les ~145 feuilles
 * de style de l'app. Leur texte est lu une fois et partagé par tous les aperçus (blob:).
 *   node tests/test-apparence-legere.js
 *  1. le code : frameDocHtml reçoit les <link> partagés de frameLinks, plus de <link> par feuille et par aperçu ;
 *  2. le navigateur (Playwright ; sinon sauté), sur une base à part : sur chaque page d'Apparence qui a des aperçus,
 *     aucun « ERR_INSUFFICIENT_RESOURCES », un nombre de requêtes borné, chaque feuille .css lue au plus une fois et jamais
 *     par un aperçu,
 *     des aperçus prêts (mesurés, stylés comme l'app : fond, police, traits des fiches), les polices des feuilles bien trouvées ;
 *     aucune erreur dans la console.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { console.log(`\n${count} réussi(s), ${failed} échoué(s)`); process.exit(failed ? 1 : 0); };
// les pages d'Apparence qui posent des aperçus (iframes .lcd-frame)
const PAGES = ['design', 'look_portraits', 'look_msgs', 'nav_menus', 'design_sheets'];

(async () => {
    /* ═════ 1. le code ═════ */
    await t('app-designs.js : les aperçus partagent les feuilles de l’app (blob:), plus un <link> par feuille et par aperçu', () => {
        const src = read('assets/js/app-designs.js');
        const body = src.slice(src.indexOf('function frameDocHtml('), src.indexOf('function copyRoot('));
        assert.match(body, /function frameDocHtml\(inner, W, links\)/);
        assert.doesNotMatch(body, /querySelectorAll\('link\[rel="stylesheet"\]'\)/, 'plus de recopie de chaque <link> dans chaque aperçu');
        assert.match(src, /frameLinks\(\)\.then\(links => \{/);
        assert.match(src, /URL\.createObjectURL\(new Blob\(\[css\], \{type: 'text\/css'\}\)\)/);
        assert.match(src, /fetch\(href, \{cache: 'force-cache'/, 'le texte d’origine des feuilles, lu une fois');
        assert.match(src, /sheetBusy < 6/, 'quelques feuilles lues à la fois');
        assert.match(src, /if \(l\.id\) \{ flush\(\);/, 'les feuilles à id (lc-frame-css, lc-designs-gen) restent à part, à leur place');
    });

    /* ═════ 2. le navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-apparence-legere-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased'),('Antoine','BORIE','male','deceased'),('Marie','LEROY','female','unknown')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.APPARENCE_LEGERE_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const stop = () => { try { proc.kill(); } catch (_) {} };
    process.on('SIGINT', () => { stop(); process.exit(130); }); process.on('SIGTERM', () => { stop(); process.exit(143); });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        for (const pg of PAGES) {
            await t(`#maintenance/${pg} : aperçus légers (pas d’ERR_INSUFFICIENT_RESOURCES, requêtes bornées, aperçus stylés)`, async () => {
                const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
                await ctx.route(u => /^https?:/.test(u.toString()) && !u.toString().startsWith(base), rt => rt.abort());
                const p = await ctx.newPage();
                p.on('pageerror', e => errs.push(`${pg} : ${e.message}`));
                let insufficient = 0, reqs = 0, cssFromFrames = 0; const cssSeen = new Map();
                p.on('console', m => { if (m.type() !== 'error') return; if (/INSUFFICIENT_RESOURCES/.test(m.text())) insufficient++; else if (!/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${pg} console : ${m.text().slice(0, 300)}`); });
                p.on('requestfailed', rq => { if (/INSUFFICIENT_RESOURCES/.test(rq.failure()?.errorText || '')) insufficient++; });
                await p.goto(base, {waitUntil: 'load'}); await p.waitForTimeout(1500);
                p.on('request', rq => { reqs++; if (!/\.css(\?|$)/.test(rq.url())) return; cssSeen.set(rq.url(), (cssSeen.get(rq.url()) || 0) + 1); if (rq.frame() !== p.mainFrame()) cssFromFrames++; });
                const t0 = Date.now();
                await p.evaluate(h => { location.hash = h; }, `#maintenance/${pg}`);
                // la page est posée quand plus aucun aperçu ne charge et plus aucune requête ne part depuis 1,5 s
                let last = -1, quiet = Date.now();
                while (Date.now() - t0 < 45000) {
                    await p.waitForTimeout(150);
                    const loading = await p.evaluate(() => document.querySelectorAll('.lcd-frame.is-loading').length);
                    if (reqs !== last || loading) { last = reqs; quiet = Date.now(); }
                    if (Date.now() - quiet > 1500) break;
                }
                const frames = await p.evaluate(() => [...document.querySelectorAll('iframe.lcd-frame')].map(f => {
                    const d = f.contentDocument, root = d && d.querySelector('.lcd-pv-root');
                    const cs = root && d.defaultView.getComputedStyle(d.body);
                    return {ok: !!root, h: Number(f.dataset.h || 0), links: d ? d.querySelectorAll('link[rel="stylesheet"]').length : -1,
                        blob: d ? [...d.querySelectorAll('link[rel="stylesheet"]')].filter(l => l.href.startsWith('blob:')).length : 0,
                        sheets: d ? d.styleSheets.length : 0, bodyBg: cs ? cs.backgroundColor : '', margin: cs ? cs.marginTop : '',
                        appRule: d ? [...d.styleSheets].some(s => { try { return [...s.cssRules].some(x => x.selectorText === '.lcd-pv-root' || /\.person-hero\b/.test(x.selectorText || '')); } catch (_) { return false; } }) : false};
                }));
                const appSheets = await p.evaluate(() => document.querySelectorAll('link[rel="stylesheet"]').length);
                console.log(`   ${pg} : ${frames.length} aperçu(s), ${reqs} requête(s), posée en ${quiet - t0} ms, ${insufficient} ERR_INSUFFICIENT_RESOURCES`);
                assert.equal(insufficient, 0, 'ERR_INSUFFICIENT_RESOURCES');
                assert.ok(frames.length > 0, 'des aperçus');
                assert.equal(cssFromFrames, 0, 'aucune feuille .css redemandée par un aperçu');
                const twice = [...cssSeen].filter(([, n]) => n > 1).map(([u]) => u);
                assert.deepEqual(twice, [], 'une feuille lue plusieurs fois');
                // avant : ≈ 145 feuilles × chaque aperçu, à chaque redessin (jusqu'à 3 900 requêtes) ; maintenant : chaque feuille
                // lue une fois (depuis le cache), quelques blob: par aperçu, plus les appels de l'app
                assert.ok(reqs <= appSheets + 100 + frames.length * 12, `requêtes : ${reqs} pour ${frames.length} aperçus (${appSheets} feuilles)`);
                for (const [i, f] of frames.entries()) {
                    assert.ok(f.ok, `aperçu ${i} posé`);
                    assert.ok(f.links <= 6, `aperçu ${i} : ${f.links} <link> (pas une par feuille de l’app, ${appSheets})`);
                    assert.ok(f.blob >= 1, `aperçu ${i} : feuilles partagées (blob:)`);
                    assert.ok(f.appRule, `aperçu ${i} : les règles de l’app sont là`);
                    assert.equal(f.margin, '0px', `aperçu ${i} : la feuille de l’aperçu`);
                }
                assert.ok(frames.some(f => f.h > 40), 'au moins un aperçu mesuré');
                await ctx.close();
            });
        }
        await t('les aperçus ont exactement les règles de l’app, url() des polices en entier, feuilles à id à leur place', async () => {
            const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
            await ctx.route(u => /^https?:/.test(u.toString()) && !u.toString().startsWith(base), rt => rt.abort());
            const p = await ctx.newPage();
            p.on('pageerror', e => errs.push(`règles : ${e.message}`));
            await p.goto(base + '#maintenance/look_portraits', {waitUntil: 'load'});
            await p.waitForFunction(() => document.querySelector('iframe.lcd-frame:not(.is-loading)'), null, {timeout: 30000});
            const res = await p.evaluate(() => {
                const count = doc => [...doc.styleSheets].filter(s => s.ownerNode && s.ownerNode.tagName === 'LINK').reduce((n, s) => { try { return n + s.cssRules.length; } catch (_) { return n; } }, 0);
                const f = document.querySelector('iframe.lcd-frame:not(.is-loading)'), d = f.contentDocument;
                const ids = [...d.querySelectorAll('link[rel="stylesheet"]')].map(l => l.id || '');
                const rel = [...d.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (_) { return []; } }).map(x => x.cssText).join('\n').match(/url\("(?!data:|blob:|https?:|#)[^"]*"\)/g) || [];
                return {app: count(document), frame: count(d), ids, rel: rel.slice(0, 3)};
            });
            assert.equal(res.frame, res.app, 'autant de règles que les feuilles de l’app');
            assert.ok(res.ids.includes('lc-frame-css') && res.ids.includes('lc-designs-gen'), `feuilles à id : ${res.ids}`);
            assert.ok(res.ids.indexOf('lc-frame-css') > 0 && res.ids.indexOf('lc-designs-gen') < res.ids.length - 1, 'à leur place, entre les autres');
            assert.deepEqual(res.rel, [], 'plus d’url() relative (elle partirait de blob:)');
            await ctx.close();
        });
        await t('aucune erreur dans la console pendant tout le test', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); stop();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    finish();
})();
