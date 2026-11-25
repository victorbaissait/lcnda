'use strict';
/**
 * 🌐 Pages de présentation (carnet-numerique-des-ancetres.php et -en.php), lisibles par les moteurs et les IA :
 *   node tests/test-presentation-faq.js
 *  1. la FAQ est écrite dans les deux pages (node scripts/build-presentation-faq.js --check) : mêmes thèmes et autant de
 *     questions que la FAQ de l'app, un repère par thème (#faq-N) et par question (#q-N-M), plus de faq-data.js ;
 *  2. schema.org (SoftwareApplication + FAQPage) se relit ; llms.txt, llms-full.txt, llms-full-en.txt, robots.txt, sitemap.xml ;
 *  3. une fiche par version (#v0-10-0 …, date, « en bref »), le tableau des versions, les 9 atouts en grille 3 × 3 ;
 *  4. navigateur (si Playwright) : sans erreur, sans défilement de côté (1440 et 390 px), la recherche filtre les
 *     questions écrites dans la page, un lien #q-… ouvre sa question, un lien #v… ouvre sa version.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const PAGES = { fr: 'carnet-numerique-des-ancetres.php', en: 'carnet-numerique-des-ancetres-en.php' };
let count = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e)); } };

(async () => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts/build-presentation-faq.js'), '--check'], { encoding: 'utf8' });
    await t('pages et fichiers pour les IA à jour (node scripts/build-presentation-faq.js)', () => assert.equal(r.status, 0, r.stderr || r.stdout));
    const { groups, count: n } = require('../scripts/build-presentation-faq.js');

    for (const [lang, file] of Object.entries(PAGES)) {
        const page = read(file);
        await t(`${lang} : FAQ écrite dans la page, sans faq-data`, () => {
            assert.doesNotMatch(page, /faq-data/);
            const faq = page.split('<!-- FAQ:DEBUT -->')[1].split('<!-- FAQ:FIN -->')[0];
            assert.equal((faq.match(/class="presentation-faq-item"/g) || []).length, n);
            assert.equal((faq.match(/class="presentation-faq-cat" id="faq-\d+"/g) || []).length, groups[lang].length);
            const ids = [...page.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
            assert.equal(new Set(ids).size, ids.length, 'repères en double');
            groups[lang].forEach(([, items], k) => assert.ok(faq.includes(`id="q-${k}-${items.length - 1}"`), `#q-${k}-${items.length - 1}`));
            assert.match(faq, /<nav class="presentation-faq-toc"/);
            assert.doesNotMatch(page, /<\?(php|=)/);
        });
        await t(`${lang} : schema.org se relit`, () => {
            const lds = [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]));
            const app = lds.find(x => x['@type'] === 'SoftwareApplication'), faq = lds.find(x => x['@type'] === 'FAQPage');
            assert.equal(app.softwareVersion, require('../package.json').version);
            assert.equal(app.isAccessibleForFree, true);
            assert.equal(faq.mainEntity.length, n);
            assert.equal(faq.mainEntity[0].acceptedAnswer.text, groups[lang][0][1][0][1]);
        });
        await t(`${lang} : une fiche par version, tableau des versions, 9 atouts`, () => {
            const ids = [...page.matchAll(/<details class="presentation-(?:changes|version)"(?: [a-z-]+)? id="(v[\d-]+)"/g)].map(m => m[1]);
            assert.equal(ids[0], 'v' + require('../package.json').version.replace(/\./g, '-'));
            assert.ok(ids.length >= 17, ids.join(' '));
            assert.equal((page.match(/<dl class="presentation-facts">/g) || []).length, ids.length);
            for (const id of ids) assert.ok(page.includes(`<a href="#${id}">`), 'tableau : ' + id);
            const strengths = page.split('<div class="presentation-strengths"')[1].split('</div>\n            </div>')[0];
            assert.equal((strengths.match(/<strong>/g) || []).length, 9);
            assert.match(page, /\.presentation-strengths \{ display:grid; grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
        });
    }
    await t('llms.txt, llms-full.txt, llms-full-en.txt, robots.txt, sitemap.xml', () => {
        assert.match(read('llms.txt'), /^# LCNDA/);
        assert.ok(read('llms.txt').includes('(llms-full.txt)'));
        for (const [f, lang] of [['llms-full.txt', 'fr'], ['llms-full-en.txt', 'en']]) {
            const txt = read(f);
            assert.equal((txt.match(/^### /gm) || []).length, n, f);
            assert.equal((txt.match(/^## /gm) || []).length, groups[lang].length, f);
        }
        assert.match(read('robots.txt'), /User-agent: \*\nAllow: \//);
        const sm = read('sitemap.xml');
        for (const f of Object.values(PAGES)) assert.ok(sm.includes(`${f}</loc>`), f);
    });

    // ── navigateur ──
    let chromium = null;
    try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium) { console.log('  — Playwright absent : partie navigateur sautée'); }
    else {
        const browser = await chromium.launch();
        const shots = process.env.PRESENTATION_SHOTS || '';
        try {
            for (const [lang, file] of Object.entries(PAGES)) {
                for (const width of [1440, 390]) {
                    const page = await browser.newPage({ viewport: { width, height: 900 } });
                    const errors = [];
                    page.on('pageerror', e => errors.push(String(e)));
                    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
                    // La page est servie telle quelle ; les captures (hors dépôt) et les téléchargements sont remplacés.
                    await page.route('**/*', route => {
                        const u = new URL(route.request().url());
                        const name = path.basename(u.pathname);
                        if (u.protocol === 'http:' && u.hostname === 'lcnda.test' && (name === file)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: read(file) });
                        if (/\.(jpe?g|png|webp)$/i.test(name)) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="10"/>' });
                        return route.abort();
                    });
                    await page.goto(`http://lcnda.test/${file}#q-2-1`, { waitUntil: 'load' });
                    await t(`${lang} ${width}px : #q-2-1 ouvert au chargement, sans erreur ni défilement de côté`, async () => {
                        assert.equal(await page.$eval('#q-2-1', d => d.open), true);
                        const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
                        assert.ok(sw[0] <= sw[1], `largeur ${sw[0]} > ${sw[1]}`);
                        assert.deepEqual(errors, []);
                    });
                    await t(`${lang} ${width}px : grille des atouts (${width > 760 ? 3 : 1} colonne(s))`, async () => {
                        const cols = await page.$eval('.presentation-strengths', e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
                        assert.equal(cols, width > 760 ? 3 : 1);
                    });
                    await t(`${lang} ${width}px : la recherche filtre les questions de la page`, async () => {
                        const word = lang === 'fr' ? 'cousinade' : 'cousin';
                        await page.fill('#faq-search', word);
                        const r = await page.evaluate(w => {
                            const items = [...document.querySelectorAll('#faq-list .presentation-faq-item')];
                            const shown = items.filter(d => !d.hidden);
                            return { total: items.length, shown: shown.length, ok: shown.every(d => d.open && d.textContent.toLowerCase().includes(w)), empty: document.getElementById('faq-empty').hidden };
                        }, word);
                        assert.ok(r.shown > 0 && r.shown < r.total && r.ok && r.empty, JSON.stringify(r));
                        await page.fill('#faq-search', 'zzzqqq');
                        assert.equal(await page.$eval('#faq-empty', e => e.hidden), false);
                        await page.fill('#faq-search', '');
                        assert.equal(await page.$$eval('#faq-list .presentation-faq-item:not([hidden])', l => l.length), await page.$$eval('#faq-list .presentation-faq-item', l => l.length));
                    });
                    await t(`${lang} ${width}px : un lien #v… du tableau ouvre sa version`, async () => {
                        await page.evaluate(() => { document.querySelector('.presentation-changes-old').open = true; });
                        await page.click('a[href="#v0-9-1"]');
                        assert.equal(await page.$eval('#v0-9-1', d => d.open), true);
                        await page.evaluate(() => { location.hash = '#q-0-3'; });
                        await page.waitForFunction(() => document.getElementById('q-0-3').open);
                        if (shots) {
                            fs.mkdirSync(shots, { recursive: true });
                            await page.locator('#v0-9-1').screenshot({ path: path.join(shots, `${lang}-${width}-version.png`) });
                            await page.evaluate(() => { location.hash = '#faq'; });
                            await page.locator('.presentation-faq-box').screenshot({ path: path.join(shots, `${lang}-${width}-faq.png`), clip: undefined, timeout: 20000 }).catch(() => {});
                            await page.locator('#telecharger').screenshot({ path: path.join(shots, `${lang}-${width}-telecharger.png`) }).catch(() => {});
                        }
                    });
                    await page.close();
                }
            }
        } finally { await browser.close(); }
    }
    console.log(`${failed ? '✗' : '✓'} pages de présentation : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`);
    process.exit(failed ? 1 : 0);
})();
