'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌐 Tout premier lancement dans la langue de l'ordinateur :   node tests/test-i18n-premier.js
 *  1. i18n_detect_lang (lib/i18n.php) : Accept-Language → la première langue de l'app par ordre de préférence (q),
 *     no / nn → nb, une langue inconnue → l'anglais, rien → le français ; suit I18N_LANGS (langues ajoutées plus tard).
 *  2. HTTP (« php -S ») : sans base ni choix gardé, la page s'ouvre dans la langue de l'ordinateur (lang=, dictionnaire,
 *     LCNDA_I18N_FIRST) ; avec un choix gardé (cookie, même « fr ») : rien ne change ; une base déjà prête ne change jamais
 *     de langue.
 *  3. navigateur (Playwright ; sinon sauté) : écran du premier lancement en allemand pour un ordinateur allemand, en anglais
 *     pour un ordinateur japonais ; boutons « Français » / « English » à côté du menu des langues ; le choix est gardé.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
let ok = 0, ko = 0;
async function check(name, fn) {
    try { await fn(); ok++; console.log('✓ ' + name); }
    catch (e) { ko++; console.log('✗ ' + name + '\n   ' + (e && e.message || e)); }
}

const php = code => {
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return r.stdout;
};

const tmpEmpty = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-i18n-premier-'));
const tmpReady = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-i18n-premier-ok-'));
for (const d of [tmpEmpty, tmpReady]) fs.mkdirSync(path.join(d, 'media'), { recursive: true });
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
{
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start) VALUES (1,'Jean','EXEMPLE','male',1)");
`], { cwd: appRoot, env: envFor(tmpReady), encoding: 'utf8' });
    if (seed.status !== 0) { console.log(seed.stderr || seed.stdout); process.exit(1); }
}

function get(port, headers) {
    return new Promise((res, rej) => {
        http.get({ host: '127.0.0.1', port, path: '/index.php', headers }, r => {
            let b = ''; r.setEncoding('utf8'); r.on('data', c => b += c); r.on('end', () => res(b));
        }).on('error', rej);
    });
}
function serve(dir, port) {
    const p = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    return p;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function up(port) { for (let i = 0; i < 50; i++) { try { await get(port, {}); return; } catch (_) { await wait(100); } } throw new Error('serveur absent'); }

(async () => {
    await check('i18n_detect_lang : préférences, q, norvégien, inconnue → anglais, vide → français', () => {
        const out = php(String.raw`require 'lib/i18n.php'; foreach ([
            'de-DE,de;q=0.9,en;q=0.8', 'ja-JP,ja;q=0.9', 'ja,fr;q=0.5', 'en;q=0.3,es-ES;q=0.9', 'nn-NO', 'no', 'pt-BR,pt;q=0.9',
            '', 'fr-CA', 'zh-Hans-CN', 'de_AT', '*', 'en;q=0,it'] as $a) { echo json_encode($a), '=', i18n_detect_lang($a), "\n"; }`);
        const want = { '"de-DE,de;q=0.9,en;q=0.8"': 'de', '"ja-JP,ja;q=0.9"': 'en', '"ja,fr;q=0.5"': 'fr', '"en;q=0.3,es-ES;q=0.9"': 'es',
            '"nn-NO"': 'nb', '"no"': 'nb', '"pt-BR,pt;q=0.9"': 'pt', '""': 'fr', '"fr-CA"': 'fr', '"zh-Hans-CN"': 'en', '"de_AT"': 'de', '"*"': 'fr', '"en;q=0,it"': 'it' };
        out.trim().split('\n').forEach(l => { const i = l.lastIndexOf('='); assert.equal(l.slice(i + 1), want[l.slice(0, i)], l); });
    });
    await check('i18n_detect_lang suit I18N_LANGS (toutes les langues de l\'app reconnues)', () => {
        const out = php(String.raw`require 'lib/i18n.php'; foreach (I18N_LANGS as $c) { if (i18n_detect_lang($c . '-XX') !== $c) echo $c, ' '; }`);
        assert.equal(out.trim(), '');
    });

    const P1 = Number(process.env.I18N_PORT || 20471), P2 = P1 + 1;
    const s1 = serve(tmpEmpty, P1), s2 = serve(tmpReady, P2);
    try {
        await up(P1); await up(P2);
        await check('premier lancement, ordinateur allemand : page en allemand + LCNDA_I18N_FIRST', async () => {
            const h = await get(P1, { 'Accept-Language': 'de-DE,de;q=0.9' });
            assert.match(h, /<html lang="de">/);
            assert.match(h, /window\.LCNDA_I18N_FIRST="de"/);
            assert.match(h, /window\.LCNDA_I18N_DATA=/);
        });
        await check('premier lancement, langue inconnue (japonais) : anglais', async () => {
            const h = await get(P1, { 'Accept-Language': 'ja-JP,ja;q=0.9' });
            assert.match(h, /<html lang="en">/);
            assert.match(h, /LCNDA_I18N_FIRST="en"/);
        });
        await check('premier lancement, ordinateur français : rien de plus', async () => {
            const h = await get(P1, { 'Accept-Language': 'fr-FR,fr;q=0.9' });
            assert.match(h, /<html lang="fr">/);
            assert.doesNotMatch(h, /LCNDA_I18N_FIRST|LCNDA_I18N_DATA=/);
        });
        await check('choix déjà gardé (cookie fr ou it) : la langue de l\'ordinateur ne passe pas devant', async () => {
            let h = await get(P1, { 'Accept-Language': 'de-DE', Cookie: 'lcnda_lang=fr' });
            assert.match(h, /<html lang="fr">/); assert.doesNotMatch(h, /LCNDA_I18N_FIRST/);
            h = await get(P1, { 'Accept-Language': 'de-DE', Cookie: 'lcnda_lang=it' });
            assert.match(h, /<html lang="it">/); assert.doesNotMatch(h, /LCNDA_I18N_FIRST/);
        });
        await check('base déjà prête : jamais de changement de langue', async () => {
            const h = await get(P2, { 'Accept-Language': 'de-DE,de;q=0.9' });
            assert.match(h, /<html lang="fr">/);
            assert.doesNotMatch(h, /LCNDA_I18N_FIRST|LCNDA_I18N_DATA=/);
        });

        let chromium = null;
        try { ({ chromium } = require('playwright')); } catch (_) {}
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); }
        else {
            const browser = await chromium.launch();
            try {
                await check('navigateur : ordinateur allemand → écran en allemand, choix gardé, boutons Français / English', async () => {
                    const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1200, height: 900 } });
                    const page = await ctx.newPage(); const errs = [];
                    page.on('pageerror', e => errs.push(String(e)));
                    await page.goto(`http://127.0.0.1:${P1}/index.php`);
                    await page.waitForSelector('#install-screen [data-lc-lang-quick="en"]');
                    assert.equal(await page.evaluate(() => window.LCNDA_I18N.lang), 'de');
                    assert.equal(await page.evaluate(() => localStorage.getItem('lcnda-langue')), 'de');
                    assert.equal(await page.$eval('select[data-lc-lang-pick]', s => s.value), 'de');
                    assert.notEqual(await page.$eval('#install-screen h2', e => e.textContent.trim()), 'La base généalogique doit être importée.');
                    await page.click('[data-lc-lang-quick="en"]');
                    assert.equal(await page.evaluate(() => window.LCNDA_I18N.lang), 'en');
                    assert.equal(await page.$eval('select[data-lc-lang-pick]', s => s.value), 'en');
                    assert.equal(await page.$eval('[data-lc-lang-quick="en"]', b => b.getAttribute('aria-pressed')), 'true');
                    await page.reload(); await page.waitForSelector('#install-screen');
                    assert.equal(await page.evaluate(() => window.LCNDA_I18N.lang), 'en', 'English gardé au rechargement');
                    await page.click('[data-lc-lang-quick="fr"]');
                    assert.equal(await page.$eval('#install-screen h2', e => e.textContent.trim()), 'La base généalogique doit être importée.');
                    await page.reload(); await page.waitForSelector('#install-screen');
                    assert.equal(await page.evaluate(() => window.LCNDA_I18N.lang), 'fr', 'Français gardé : l\'allemand de l\'ordinateur ne revient pas');
                    assert.deepEqual(errs, []);
                    await ctx.close();
                });
                await check('navigateur : ordinateur japonais → anglais', async () => {
                    const ctx = await browser.newContext({ locale: 'ja-JP' });
                    const page = await ctx.newPage();
                    await page.goto(`http://127.0.0.1:${P1}/index.php`);
                    await page.waitForSelector('#install-screen');
                    assert.equal(await page.evaluate(() => window.LCNDA_I18N.lang), 'en');
                    await ctx.close();
                });
            } finally { await browser.close(); }
        }
    } finally { s1.kill(); s2.kill(); }
    for (const d of [tmpEmpty, tmpReady]) fs.rmSync(d, { recursive: true, force: true });
    console.log(`${ok} ok, ${ko} en échec`);
    process.exit(ko ? 1 : 0);
})();
