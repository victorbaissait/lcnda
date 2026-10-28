'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Audit des bugs (lots K1–K20, D1–D22, F1–F15, Tableur, Studio son, Contrôle de la base…) : les bugs corrigés ne reviennent pas.
 *     node tests/test-audit-bugs.js
 * 1. Le code :
 *    - designs-gen.css et apparence-traits.css (fabriqués) suivent les feuilles de style : un nouvel écran (tables décennales,
 *      comparer deux photos, services d'archives…) reçoit les designs A1/A2 ;
 *    - tableur : un nombre trop grand donne #NOMBRE! (pas « Tu divises par zéro ») ;
 *    - K11 : plus de « ➕ » devant un bouton ou un menu (toujours « ＋ ») ; K3 : « Relier », jamais « Rattacher » ;
 *    - métiers anciens : une clé forgée (tableau) ne laisse pas d'avertissement PHP ;
 *    - citer un site internet : « consulté le » seulement devant une vraie date (pas « consulté le cote 3 E 123 »).
 * 2. Le serveur et le navigateur (Playwright, sinon sauté) :
 *    - 🧮 Tableur dans deux onglets : le second enregistrement ne remplace plus en silence celui de l'autre onglet (409, puis
 *      « Recharger / Garder ma version ») ; « Garder ma version » (force) passe ;
 *    - Raccourcis : « Ajouter » sans rien choisir (⌘ Entrée) montre l'erreur K1 sous le champ (avant : ReferenceError) ;
 *    - K1 : un message qui commence déjà par ⛔ ne montre qu'un seul ⛔ ;
 *    - « Moyennes de la famille » (Graphiques → Statistiques) à 390 px : le tableau défile dans son cadre, pas la page ;
 *    - Seuils du contrôle ouverts dans deux onglets : un changement dans l'un n'efface plus celui de l'autre.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    /* ── 1. le code ── */
    await t('designs-gen.css et apparence-traits.css sont à jour (python3 scripts/build-designs-css.py, build-frame-css.py)', () => {
        const py = spawnSync('python3', ['--version']); if (py.status !== 0) { console.log('  – python3 absent : sauté'); return; }
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-audit-css-'));
        try {
            fs.mkdirSync(path.join(tmp, 'scripts')); fs.mkdirSync(path.join(tmp, 'assets', 'css'), { recursive: true });
            fs.copyFileSync(path.join(root, 'index.php'), path.join(tmp, 'index.php'));
            for (const f of ['build-designs-css.py', 'build-frame-css.py', 'scope-a1-css.py']) fs.copyFileSync(path.join(root, 'scripts', f), path.join(tmp, 'scripts', f));
            for (const f of fs.readdirSync(path.join(root, 'assets', 'css'))) fs.copyFileSync(path.join(root, 'assets', 'css', f), path.join(tmp, 'assets', 'css', f));
            for (const [script, out] of [['build-designs-css.py', 'designs-gen.css'], ['build-frame-css.py', 'apparence-traits.css']]) {
                const r = spawnSync('python3', ['-I', path.join(tmp, 'scripts', script)], { cwd: tmp, encoding: 'utf8' });
                assert.equal(r.status, 0, r.stderr);
                assert.ok(fs.readFileSync(path.join(tmp, 'assets', 'css', out), 'utf8') === fs.readFileSync(path.join(root, 'assets', 'css', out), 'utf8'), `${out} n'est plus à jour : lance python3 scripts/${script}`);
            }
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    });
    await t('Tableur : un résultat trop grand donne #NOMBRE!, pas « Tu divises par zéro »', () => {
        const S = require('../assets/js/app-tableur-engine.js');
        const wb = S.newWorkbook(); wb.sheets[0].cells.A1 = { v: '=PUISSANCE(2;10000)' }; wb.sheets[0].cells.A2 = { v: '=1/0' };
        const c = new S.Calc(wb); const v = c.val(0, 0, 0), d = c.val(0, 1, 0);
        assert.equal(v.code, '#NOMBRE!'); assert.doesNotMatch(S.explain(v), /divises/);
        assert.equal(d.code, '#DIV/0!', '1/0 reste #DIV/0!');
    });
    await t('K11 / K3 : « ＋ » devant les boutons et les menus (pas « ➕ »), « Relier » (pas « Rattacher »)', () => {
        const bad = [];
        for (const f of fs.readdirSync(path.join(root, 'assets', 'js')).filter(f => f.endsWith('.js'))) {
            const s = fs.readFileSync(path.join(root, 'assets', 'js', f), 'utf8');
            s.split('\n').forEach((line, i) => {
                if (/'Symboles':/.test(line)) return; // la palette d'émojis garde ➕
                if (/➕ [A-Za-zÀ-ÿ]/.test(line)) bad.push(`${f}:${i + 1} ➕`);
                if (/['"`>]Rattacher à une fiche/.test(line)) bad.push(`${f}:${i + 1} Rattacher`);
            });
        }
        assert.deepEqual(bad, []);
    });
    await t('Métiers anciens : une clé forgée (tableau) ne laisse pas d’avertissement PHP', () => {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'display_errors=stderr', '-d', 'error_reporting=-1', '-r', String.raw`
            function safe_int($v) { return (int) $v; }
            require 'lib/metiers_anciens.php';
            $p = new PDO('sqlite::memory:');
            try { trade_save($p, ['key' => ['a'], 'notes' => ['b']]); } catch (RuntimeException $e) { echo 'refusé'; }`], { cwd: root, encoding: 'utf8' });
        assert.match(r.stdout, /refusé/, r.stderr || r.stdout);
        assert.doesNotMatch(r.stderr + r.stdout, /Warning|Notice|Array to string/);
    });

    await t('Citer une source (site internet) : « consulté le » seulement devant une vraie date', () => {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'display_errors=stderr', '-r', String.raw`
            require 'lib/citation_styles.php';
            $f = fn($pub) => cite_format(cite_parts(['title' => 'Registre paroissial de Naves', 'agency' => 'AD Corrèze', 'publication' => $pub, 'source_type' => 'internet']));
            $a = $f('cote 3 E 123'); $b = $f('23 juin 2026');
            echo json_encode([$a['fr']['note'], $a['ee']['note'], $a['chicago']['note'], $b['fr']['note'], $b['ee']['note']], JSON_UNESCAPED_UNICODE);`], { cwd: root, encoding: 'utf8' });
        const [frA, eeA, chA, frB, eeB] = JSON.parse(r.stdout || '[]');
        assert.doesNotMatch(frA + chA, /consulté le cote/, frA); assert.doesNotMatch(eeA, /accessed cote/, eeA); assert.match(frA, /cote 3 E 123/);
        assert.match(frB, /consulté le 23 juin 2026/); assert.match(eeB, /accessed 23 juin 2026/);
    });

    /* ── 2. le serveur et le navigateur ── */
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); }
    else {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-audit-'));
        const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
        fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
        const init = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male'),('Marie','Durand','female')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: root, encoding: 'utf8', env });
        if (init.status !== 0 || !/ok$/.test(init.stdout)) { console.error(init.stderr || init.stdout); process.exit(1); }
        const port = await freePort();
        const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], { cwd: root, env, stdio: 'ignore' });
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        const browser = await pw.chromium.launch();
        try {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
            const errors = [];
            const open = async () => {
                const p = await ctx.newPage();
                p.on('pageerror', e => errors.push('pageerror ' + e.message));
                p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
                await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openWorkbook && window.LCNDA_EXT?.shortcuts?.chooseTargets && window.LCNDA_EXT?.openDialog, null, { timeout: 30000 });
                return p;
            };
            const page = await open();
            const api = (p, action, body, get = false) => p.evaluate(async ({ action, body, get }) => { try { const r = get ? await window.LCNDA_APP.api(action, body || {}) : await window.LCNDA_APP.api(action, {}, { method: 'POST', body }); return { ok: true, r }; } catch (e) { return { ok: false, e: e.message, status: e.status, conflict: e.conflict }; } }, { action, body, get });

            await t('🧾 Tableur, deux onglets : l’enregistrement d’un autre onglet n’est plus écrasé sans le dire', async () => {
                const sheets = v => ({ sheets: [{ name: 'F1', cells: { A1: { v } } }] });
                const id = (await api(page, 'save_workbook', { name: 'Deux onglets', data: sheets(1) })).r.result.id;
                const a = (await api(page, 'workbook', { id }, true)).r, b = (await api(page, 'workbook', { id }, true)).r;
                assert.ok(a.rev && a.rev === b.rev, 'la version est donnée à l’ouverture');
                const sb = await api(page, 'save_workbook', { id, name: 'Deux onglets', data: sheets(2), base_rev: b.rev });
                assert.ok(sb.ok && sb.r.result.rev && sb.r.result.rev !== b.rev, 'onglet B enregistre, nouvelle version');
                const sa = await api(page, 'save_workbook', { id, name: 'Deux onglets', data: sheets(3), base_rev: a.rev });
                assert.ok(!sa.ok && sa.conflict && sa.status === 409, 'onglet A : refusé (409)');
                assert.equal((await api(page, 'workbook', { id }, true)).r.data.sheets[0].cells.A1.v, 2, 'le travail de B est gardé');
                const same = await api(page, 'save_workbook', { id, name: 'Deux onglets', data: sheets(2), base_rev: a.rev });
                assert.ok(same.ok, 'même contenu : pas de conflit');
                const force = await api(page, 'save_workbook', { id, name: 'Deux onglets', data: sheets(3), base_rev: a.rev, force: 1 });
                assert.ok(force.ok, '« Garder ma version »');
                assert.equal((await api(page, 'workbook', { id }, true)).r.data.sheets[0].cells.A1.v, 3);
                // dans l'éditeur : la fenêtre « Modifié dans une autre fenêtre » s'ouvre
                await page.evaluate(id => window.LCNDA_EXT.openWorkbook({ id }), id); await page.waitForTimeout(800);
                await api(page, 'save_workbook', { id, name: 'Deux onglets', data: sheets(4) });
                await page.keyboard.type('9'); await page.keyboard.press('Enter'); await page.keyboard.press('Control+s');
                await page.waitForSelector('dialog.lc-conflict-dialog[open]', { timeout: 5000 });
                await page.click('dialog.lc-conflict-dialog [data-cf="reload"]'); await page.waitForTimeout(1000);
                assert.equal((await api(page, 'workbook', { id }, true)).r.data.sheets[0].cells.A1.v, 4, '« Recharger » ne remplace rien');
                await page.keyboard.press('Escape'); await page.waitForTimeout(300);
                await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            });

            await t('Raccourcis : « Ajouter » sans rien choisir montre l’erreur sous le champ (un seul ⛔), sans erreur de page', async () => {
                const p = await open();
                await p.evaluate(() => { window.LCNDA_EXT.shortcuts.chooseTargets(); });
                await p.waitForSelector('dialog[open] [data-sc-pane="base"] input', { state: 'attached' }); await p.waitForTimeout(300);
                const before = errors.length;
                await p.evaluate(() => document.querySelector('dialog[open] form').requestSubmit());
                await p.waitForSelector('dialog[open] .ui-field-error', { timeout: 3000 });
                const msg = await p.$eval('dialog[open] .ui-field-error', el => el.textContent);
                assert.match(msg, /Choisis au moins un raccourci/);
                assert.equal(errors.slice(before).filter(e => /pageerror/.test(e)).length, 0, errors.slice(before).join('\n'));
                // K1 : un message déjà écrit avec ⛔ n'en montre qu'un
                const twice = await p.evaluate(() => { const inp = document.querySelector('dialog[open] [data-sc-pane="base"] input:not([type=hidden])') || document.querySelector('dialog[open] input'); window.LCNDA_UI.fail(inp, '⛔ Date impossible'); return document.querySelector('dialog[open] .ui-field-error').textContent; });
                assert.equal((twice.match(/⛔/g) || []).length, 1, twice);
                await p.close();
            });

            await t('Moyennes de la famille à 390 px : le tableau défile dans son cadre', async () => {
                const p = await open(); await p.setViewportSize({ width: 390, height: 844 });
                await p.evaluate(() => { const S = window.LCNDA_APP.state; S.graphMode = 'stats'; S.graphStatsType = 'family_averages'; window.LCNDA_APP.setModule('graphiques'); });
                await p.waitForFunction(() => /Moyennes de la famille/.test(document.querySelector('#workspace')?.textContent || ''), null, { timeout: 15000 });
                await p.waitForTimeout(500);
                const r = await p.evaluate(() => { const t = document.querySelector('#workspace table.data-table'); return { page: document.documentElement.scrollWidth <= innerWidth + 2, wrapped: !t || !!t.closest('.data-table-wrap') }; });
                assert.ok(r.page, 'pas de défilement de côté'); assert.ok(r.wrapped, 'tableau dans .data-table-wrap');
                await p.close();
            });
            await t('Seuils du contrôle dans deux onglets : chaque onglet n’envoie que le seuil changé (l’autre est gardé)', async () => {
                const pa = await open(), pb = await open();
                for (const p of [pa, pb]) { await p.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'controle_seuils'; window.LCNDA_APP.setModule('maintenance'); }); await p.waitForSelector('[data-ctl-seuil]', { timeout: 15000 }); }
                const keys = await pa.$$eval('[data-ctl-seuil]', els => els.map(e => [e.dataset.ctlSeuil, e.min, e.max, e.step, e.value]));
                assert.ok(keys.length >= 2, 'au moins deux seuils');
                const pick = ([k, min, max, step, v]) => { const n = Number(v) - Number(step || 1); return [k, String(n >= Number(min) ? n : Number(v) + Number(step || 1))]; };
                const [k1, v1] = pick(keys[0]), [k2, v2] = pick(keys[keys.length - 1]);
                const set = (p, k, v) => p.evaluate(([k, v]) => { const i = document.querySelector(`[data-ctl-seuil="${k}"]`); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]);
                await set(pa, k1, v1); await pa.waitForTimeout(900);
                await set(pb, k2, v2); await pb.waitForTimeout(900);
                const now = (await api(pa, 'controle_seuils', {}, true)).r.values;
                assert.equal(String(now[k1]), String(Number(v1)), `${k1} (onglet A) gardé`); assert.equal(String(now[k2]), String(Number(v2)), `${k2} (onglet B)`);
                await pa.close(); await pb.close();
            });
            const real = errors.filter(e => !/409|Conflict/.test(e));
            await t('aucune erreur dans la console', () => assert.deepEqual(real, []));
        } finally {
            await browser.close(); proc.kill();
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
        }
    }
    console.log(`${count} vérifications réussies${failed ? `, ${failed} en échec` : ''}`);
    process.exit(failed ? 1 : 0);
})();
