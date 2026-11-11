'use strict';
/**
 * 🌐 Zone « recits » : les récits fabriqués par les Trésors (heritage-tresors*.js) et le « Récit d’une vie » du diaporama,
 * écrits en phrases entières par sexe (assets/i18n/src/recits.tsv).   node tests/test-i18n-recits.js
 * Le français reste mot pour mot ; en allemand, polonais, anglais : les phrases sont traduites, aucune erreur JS.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), net = require('node:net'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const REMAIN = require('../scripts/i18n-remaining.js');
const MAX_PER_PAGE = 3; // « au plus quelques-uns par page » (données mises à part : noms, lieux, vieux mots, texte d’acte)
const appRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-recits-')); fs.mkdirSync(path.join(tmp, 'media'));
const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
(async () => {
    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— Playwright ou PHP absent : sauté'); return; }
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(__dirname, 'tresors-seed.php')], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) throw new Error(r.stderr || r.stdout);
    const port = 20620;
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch();
    const open = async (lang, width = 1300) => {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        await ctx.addInitScript(l => { try { localStorage.setItem('lcnda-langue', l); localStorage.setItem('genealogie-menu-tresors', '1'); } catch (_) {} }, lang);
        const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.dismiss());
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.tresorFeatures?.length, null, { timeout: 30000 });
        return { page, errors, ctx };
    };
    const sample = page => page.evaluate(async () => { const E = window.LCNDA_EXT, T = E.tresors.T, tr = await T.tree(true), p = tr.people[0], f = tr.people.find(x => x.gender === 'female');
        return { story: T.story(tr, p), fem: T.story(tr, f), clues: E.tresorMystery.clues(T, tr, f), hero: E.tresorHero.chapters(T, tr, p).map(c => c.text), gz: E.tresorGazette.gazette(T, tr, 1876).headline }; });
    try {
        await t('français : les récits restent mot pour mot', async () => {
            const { page, errors, ctx } = await open('fr'), s = await sample(page);
            assert.equal(s.story[0], 'Il est né le 12 mars 1850 à Naves.'); assert.equal(s.story.at(-1), 'Il est mort le 2 mai 1920, à 70 ans, à Naves.');
            assert.match(s.fem[0], /^Elle est née le /); assert.match(s.clues[0], /^C’est une femme, née au/);
            assert.match(s.hero[0], /^Tu es Antoine\. Tu nais le 12 mars 1850 à Naves/); assert.deepEqual(errors, []); await ctx.close();
        });
        for (const [lang, re, reF] of [['de', /^Er wurde am 12\. März 1850 in Naves geboren\.$/, /^Sie wurde/], ['pl', /^Urodził się/, /^Urodziła się/], ['en', /^He was born on/, /^She was born/]]) {
            await t(`${lang} : phrases traduites selon le sexe, toutes les pages des Trésors sans erreur`, async () => {
                const { page, errors, ctx } = await open(lang), s = await sample(page);
                assert.match(s.story[0], re); assert.match(s.fem[0], reF); assert.ok(!/ est n[ée]/.test(s.story.join(' ') + s.clues.join(' ')), 'reste du français');
                const keys = await page.evaluate(() => window.LCNDA_EXT.tresorFeatures.map(f => f.key)), isFr = REMAIN.make(lang), report = [];
                assert.ok(keys.length >= 40, `${keys.length} pages`);
                for (const k of keys) {
                    await page.evaluate(k => window.LCNDA_EXT.tresors.open(k), k); await page.waitForSelector(`[data-tr-page="${k}"] [data-tr-body] > *`, { timeout: 15000 });
                    await page.waitForTimeout(250);
                    const texts = await page.evaluate(k => { const root = document.querySelector(`[data-tr-page="${k}"]`), out = [];
                        const off = el => el.closest('[data-i18n-off],script,style,code,textarea,select option[value=""]');
                        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
                        while ((n = w.nextNode())) { const el = n.parentElement; if (!el || off(el) || !el.getClientRects().length) continue; const t = n.textContent.trim(); if (t) out.push(t); }
                        root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el => { if (off(el)) return; ['placeholder', 'title', 'aria-label'].forEach(a => { const v = el.getAttribute(a); if (v) out.push(v.trim()); }); });
                        return out; }, k);
                    const fr = [...new Set(texts.filter(isFr))];
                    if (fr.length) report.push(`${k} (${fr.length}) : ${fr.slice(0, 6).join(' | ')}`);
                    assert.ok(fr.length <= MAX_PER_PAGE, `${lang} · ${k} : ${fr.length} textes restés en français : ${fr.join(' | ')}`);
                }
                // les fenêtres « ＋ … » (lettre, souvenir, recette, chanson, passeport) : traduites aussi
                for (const k of ['lettres', 'sens', 'recettes', 'chansons', 'passeports']) {
                    await page.evaluate(k => window.LCNDA_EXT.tresors.open(k), k); await page.waitForSelector(`[data-tr-page="${k}"] [data-tr-body] > *`, { timeout: 15000 });
                    const clicked = await page.evaluate(k => { const b = [...document.querySelectorAll(`[data-tr-page="${k}"] button`)].find(x => x.offsetParent && /^(＋|✉️|🛂)/.test(x.textContent.trim())); if (b) b.click(); return !!b; }, k);
                    assert.ok(clicked, `${k} : bouton ＋`); await page.waitForSelector('dialog[open]', { timeout: 5000 });
                    const texts = await page.evaluate(() => { const m = [...document.querySelectorAll('dialog[open]')].pop(), out = []; const w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); let x;
                        while ((x = w.nextNode())) { if (x.parentElement.closest('[data-i18n-off],script,style,textarea,option')) continue; const t = x.textContent.trim(); if (t) out.push(t); }
                        m.querySelectorAll('[placeholder]').forEach(e => out.push(e.getAttribute('placeholder'))); return out; });
                    const fr = [...new Set(texts.filter(isFr))];
                    assert.ok(fr.length <= 1, `${lang} · fenêtre de ${k} : ${fr.join(' | ')}`);
                    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                }
                if (report.length) console.log(`  ${lang} : français restant (données comprises)\n   ` + report.join('\n   '));
                assert.deepEqual(errors, []); await ctx.close();
            });
        }
        await t('de à 390 px : la page d’accueil des Trésors ne déborde pas', async () => {
            const { page, ctx } = await open('de', 390);
            await page.evaluate(() => window.LCNDA_EXT.tresors.open('aton-age')); await page.waitForSelector('[data-tr-body] > *');
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), 'débordement'); await ctx.close();
        });
    } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    if (failed) { console.error(`${failed} échec(s)`); process.exit(1); }
    console.log('✓ test-i18n-recits : tout passe');
})().catch(e => { console.error(e); process.exit(1); });
