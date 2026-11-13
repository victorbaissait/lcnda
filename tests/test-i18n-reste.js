'use strict';
/**
 * 🌐 Zone « reste » (balayage final) : widgets de bureau, « Qui est sur cette photo ? », images semblables et doublons
 * d’images, fenêtre « Choisir une image », réglages enregistrés (Apparence / toute l’app), table décennale,
 * « Comprendre l’ADN », fil d’Ariane du dessin, oublis signalés (assets/i18n/src/reste.tsv).   node tests/test-i18n-reste.js
 *  1. sans navigateur : chaque i18n('…') des fichiers de la zone a sa traduction dans les 7 langues, mêmes variables {x} ;
 *     reste.tsv : 8 colonnes, pas de clé en double, aucune clé déjà dans un autre .tsv ;
 *  2. navigateur (Playwright, port 20670) : en de, pl, en, les écrans de la zone n’ont presque plus de français
 *     (scripts/i18n-remaining.js), en français rien ne change, à 390 px rien ne déborde en allemand, aucune erreur JS.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const REMAIN = require('../scripts/i18n-remaining.js');
const appRoot = path.resolve(__dirname, '..');
const FILES = ['heritage-desk-widgets.js', 'heritage-photo-ask.js', 'heritage-images-similaires.js', 'app-media-picker.js', 'heritage-decennales.js'];
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
const MAX_PER_SCREEN = 5; // données d’exemple, noms propres, valeurs tapées
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ═════ 1. Sans navigateur ═════ */
    const dicts = Object.fromEntries(LANGS.map(l => [l, JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/i18n', `${l}.json`), 'utf8'))]));
    await t('chaque texte i18n(…) de la zone est traduit dans les 7 langues, mêmes variables', () => {
        const vars = s => (String(s).match(/\{[a-z_][a-z0-9_]*\}/gi) || []).sort().join(',');
        const miss = [];
        for (const f of FILES) {
            const src = fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8');
            assert.match(src, /const i18n = \(s, v\) =>/, `${f} : l’aide i18n`);
            const re = /\bi18n\(\s*'((?:\\.|[^'\\])*)'\s*(?=[,)])(,\s*\{\s*ctx\s*:\s*'([a-z0-9-]+)')?/g; let m;
            while ((m = re.exec(src))) {
                const s = m[1].replace(/\\(.)/g, '$1'); if (!/\p{L}/u.test(s)) continue;
                const k = m[3] ? `${m[3]}|${s}` : s;
                for (const l of LANGS) {
                    const v = dicts[l][k] ?? dicts[l][s];
                    if (v == null) { miss.push(`${f} [${l}] ${k}`); continue; }
                    const one = typeof v === 'object' ? Object.values(v)[0] : v;
                    if (vars(one) !== vars(s)) miss.push(`${f} [${l}] variables : ${k}`);
                }
            }
        }
        assert.deepEqual(miss, []);
    });
    await t('textes calculés (choix d’image, résumé des réglages) : toutes les variantes sont traduites', () => {
        const N = {image: ['image', 'images', true], audio: ['son', 'sons', false], video: ['vidéo', 'vidéos', true], document: ['document', 'documents', false], media: ['média', 'médias', false]};
        const keys = [];
        for (const [k, [one, many, fem]] of Object.entries(N)) {
            keys.push(`Choisir des ${many}`, `Choisir ${fem ? 'une' : 'un'} ${one}`, `Utiliser ces ${many}`, `Utiliser ${fem ? 'cette' : 'ce'} ${one}`,
                `Aucun${fem ? 'e' : ''} ${one} pour « {q} ».`, `Aucun${fem ? 'e' : ''} ${one} avec ces filtres.`, `Aucun${fem ? 'e' : ''} ${one} dans tes médias pour l’instant.`,
                `Clique sur ${fem ? 'une' : 'un'} ${one} pour ${fem ? 'la' : 'le'} voir ici en grand.`);
            if (k !== 'document') keys.push(`Glisse ${fem ? 'une' : 'un'} ${one} ici, colle-${fem ? 'la' : 'le'} (⌘V) ou <button>importe-${fem ? 'la' : 'le'} depuis l’ordinateur</button> : ${fem ? 'elle' : 'il'} entre dans les médias et se coche.`);
        }
        const miss = keys.flatMap(k => LANGS.filter(l => dicts[l][k] == null).map(l => `[${l}] ${k}`));
        assert.deepEqual(miss, []);
        for (const l of LANGS) assert.ok(/<button>.*<\/button>/.test(dicts[l]['Glisse une image ici, colle-la (⌘V) ou <button>importe-la depuis l’ordinateur</button> : elle entre dans les médias et se coche.']), `${l} : le bouton de la zone de dépôt`);
    });
    await t('reste.tsv : 8 colonnes, pas de clé en double ni déjà ailleurs', () => {
        const dir = path.join(appRoot, 'assets/i18n/src'), other = new Set();
        for (const f of fs.readdirSync(dir)) if (f.endsWith('.tsv') && f !== 'reste.tsv') fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach(l => { if (l && l[0] !== '#') other.add(l.split(/\t| ¦ /)[0]); });
        const seen = new Map(), bad = [];
        fs.readFileSync(path.join(dir, 'reste.tsv'), 'utf8').split('\n').forEach((l, i) => {
            if (!l || l[0] === '#' || l.startsWith('fr ¦')) return;
            const cells = l.split(/\t| ¦ /), k = cells[0];
            if (cells.length !== 8) bad.push(`ligne ${i + 1} : ${cells.length} colonnes`);
            if (seen.has(k)) bad.push(`« ${k} » en double (lignes ${seen.get(k)} et ${i + 1})`);
            if (other.has(k)) bad.push(`« ${k} » déjà dans un autre .tsv`);
            seen.set(k, i + 1);
        });
        assert.deepEqual(bad, []);
    });

    /* ═════ 2. Navigateur ═════ */
    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— Playwright ou PHP absent : navigateur sauté'); if (failed) process.exit(1); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-reste-')); fs.mkdirSync(path.join(tmp, 'media'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(__dirname, 'tresors-seed.php')], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !/ok$/.test(seed.stdout)) throw new Error(seed.stderr || seed.stdout);
    const port = 20670, base = `http://127.0.0.1:${port}/`;
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch();
    const open = async (lang, width = 1300) => {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        await ctx.addInitScript(l => { try { localStorage.setItem('lcnda-langue', l); } catch (_) {} }, lang);
        const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.dismiss());
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openDecennale && window.LCNDA_PICKER?.openMediaPicker, null, { timeout: 30000 });
        return { page, errors, ctx };
    };
    const textsOf = (page, sel) => page.evaluate(sel => {
        const out = [];
        for (const root of document.querySelectorAll(sel)) {
            const off = el => el.closest('[data-i18n-off],script,style,code,textarea,kbd,.pk-chip,.mpk-tt');
            const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
            while ((n = w.nextNode())) { const el = n.parentElement; if (!el || off(el) || !el.getClientRects().length) continue; const x = n.textContent.trim(); if (x) out.push(x); }
            root.querySelectorAll('[title],[aria-label],[placeholder]').forEach(el => { if (off(el)) return; ['title', 'aria-label', 'placeholder'].forEach(a => { const v = el.getAttribute(a); if (v) out.push(v.trim()); }); });
        }
        return out;
    }, sel);
    const dlg = async (p, fn, sel) => { await p.evaluate(fn); await p.waitForSelector(sel, { timeout: 15000 }); await p.waitForTimeout(500); return sel; };
    const SCREENS = [
        ['widgets sur le bureau', p => dlg(p, () => window.LCNDA_EXT.deskWidgets.open(), 'dialog[open]')],
        ['choisir une image', p => dlg(p, () => { window.LCNDA_PICKER.openMediaPicker({ types: ['image'] }); }, '.mpk-dialog[open]')],
        ['chercher une image semblable', p => dlg(p, () => window.LCNDA_EXT.openSimilarImages(), '.isim-search[open]')],
        ['doublons d’images', p => dlg(p, () => window.LCNDA_EXT.openImageDuplicates(), '.isim-dups[open]')],
        ['qui est sur cette photo ?', p => dlg(p, () => window.LCNDA_EXT.photoAsk.open({}), 'dialog[open]')],
        ['table décennale', p => dlg(p, () => window.LCNDA_EXT.openDecennale(), '.h-td-dlg[open]')],
        ['comprendre l’ADN', async p => { await p.evaluate(() => window.LCNDA_APP.setModule('adn')); await p.waitForSelector('[data-dna-go="learn"]', { timeout: 15000 }); await p.click('[data-dna-go="learn"]'); await p.waitForSelector('.h-dna-learn', { timeout: 15000 }); return '.h-dna-page'; }],
    ];
    const close = p => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
    try {
        await t('français : rien ne change, aucune erreur', async () => {
            const { page, errors, ctx } = await open('fr');
            await SCREENS[5][1](page);
            const txt = (await textsOf(page, '.h-td-dlg[open]')).join(' | ');
            assert.match(txt, /Lire une table décennale/); assert.match(txt, /La photo de la table/); assert.match(txt, /Suivant →/);
            await close(page); await SCREENS[1][1](page);
            assert.match((await textsOf(page, '.mpk-dialog[open]')).join(' | '), /Choisir une image/);
            assert.deepEqual(errors, []); await ctx.close();
        });
        for (const [lang, re] of [['de', /Zehnjahresregister/], ['pl', /tabelę dziesięcioletnią/], ['en', /ten-year index/]]) {
            await t(`${lang} : écrans de la zone traduits, aucune erreur JS`, async () => {
                const { page, errors, ctx } = await open(lang), isFr = REMAIN.make(lang), report = [];
                for (const [name, show] of SCREENS) {
                    const sel = await show(page);
                    const texts = await textsOf(page, sel);
                    if (name === 'table décennale') assert.match(texts.join(' '), re);
                    const fr = [...new Set(texts.filter(isFr))];
                    if (fr.length) report.push(`${name} (${fr.length}) : ${fr.slice(0, 6).join(' | ')}`);
                    assert.ok(fr.length <= MAX_PER_SCREEN, `${lang} · ${name} : ${fr.length} textes restés en français : ${fr.join(' | ')}`);
                    await close(page);
                }
                if (report.length) console.log(`  ${lang} : français restant\n   ` + report.join('\n   '));
                assert.deepEqual(errors, []); await ctx.close();
            });
        }
        await t('de à 390 px : la table décennale et le choix d’image ne débordent pas', async () => {
            const { page, errors, ctx } = await open('de', 390);
            for (const i of [5, 1]) {
                await SCREENS[i][1](page);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2 && [...document.querySelectorAll('dialog[open]')].every(d => d.getBoundingClientRect().right <= window.innerWidth + 2)), `${SCREENS[i][0]} déborde`);
                await close(page);
            }
            assert.deepEqual(errors, []); await ctx.close();
        });
    } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    if (failed) { console.error(`${failed} échec(s)`); process.exit(1); }
    console.log('✓ test-i18n-reste : tout passe');
})().catch(e => { console.error(e); process.exit(1); });
