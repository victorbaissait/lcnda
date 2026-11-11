'use strict';
/**
 * 🌐 Zone « outils2 » (dernière vague) : calculette, transcription d’actes, aide à la lecture, convertisseur d’autrefois,
 * sciences, traitements par lot, outils (consultation, fêtes, dossier Scans, paroisses, noms cités, travail à deux),
 * alphabets et liste « 🛠️ Outils de modification » (assets/i18n/src/outils2.tsv).   node tests/test-i18n-outils2.js
 *  1. sans navigateur : chaque i18n('…') des fichiers de la zone a sa traduction en en, de, pl (et les 4 autres langues),
 *     mêmes variables {x} ; le moteur de la calculette (aussi dans Node) rend ses messages en français mot pour mot ;
 *     outils2.tsv : 8 colonnes, pas de clé en double ;
 *  2. navigateur (Playwright, port 20660) : en de, pl, en, les écrans de la zone n’ont presque plus de français
 *     (scripts/i18n-remaining.js), en français rien ne change, à 390 px rien ne déborde en allemand, aucune erreur JS.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const REMAIN = require('../scripts/i18n-remaining.js');
const appRoot = path.resolve(__dirname, '..');
const FILES = ['heritage-edittools.js', 'app-calculette-engine.js', 'heritage-calculette.js', 'heritage-transcribe.js', 'heritage-transcribe-view.js',
    'app-aide-lecture.js', 'app-lecture-auto.js', 'heritage-lecture-autrefois.js', 'heritage-sciences.js', 'heritage-sciences-profile.js',
    'heritage-sciences-explore.js', 'heritage-lot.js', 'app-lot-engine.js', 'heritage-tools.js', 'heritage-alphabets.js'];
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
const MAX_PER_SCREEN = 4; // données mises à part (exemples des cases, mots des actes, noms des fonctions qu’on tape)
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ═════ 1. Sans navigateur ═════ */
    await t('chaque texte i18n(…) de la zone est traduit dans les 7 langues, mêmes variables', () => {
        const dicts = Object.fromEntries(LANGS.map(l => [l, JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/i18n', `${l}.json`), 'utf8'))]));
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
        // quelques exemples et mots des actes restent volontairement en français (repli) : jamais plus d’une poignée
        const real = miss.filter(x => !/(Orchidacées|herbier du Muséum|protégée en Limousin|période 6,4 ans|Pic du Midi|lunette de 60 cm|blé tendre|Jurassique|Néolithique|classé monument|cytologie|le jour de la Pentecôte 1754|Documents\/Scans|Saint-Martin de Brive|Paroisse érigée|1er vendémiaire an I)/.test(x));
        assert.deepEqual(real, []);
    });
    await t('outils2.tsv : 8 colonnes, pas de clé en double', () => {
        const seen = new Map(), bad = [];
        fs.readFileSync(path.join(appRoot, 'assets/i18n/src/outils2.tsv'), 'utf8').split('\n').forEach((l, i) => {
            if (!l || l[0] === '#' || l.startsWith('fr ¦')) return;
            const cells = l.split(/\t| ¦ /), k = cells[0];
            if (cells.length !== 8) bad.push(`ligne ${i + 1} : ${cells.length} colonnes`);
            if (seen.has(k)) bad.push(`« ${k} » en double (lignes ${seen.get(k)} et ${i + 1})`);
            seen.set(k, i + 1);
            if (cells.slice(1).some(c => c.includes('"')) && !k.includes('"')) bad.push(`ligne ${i + 1} : guillemet droit dans une traduction`);
        });
        assert.deepEqual(bad, []);
    });
    await t('calculette (Node) : en français, les messages ne changent pas', () => {
        const C = require(path.join(appRoot, 'assets/js/app-calculette-engine.js'));
        const err = s => { const r = C.evaluate(s); return r && r.ok === false ? r.error : ''; };
        assert.equal(err('1/0'), 'Division par zéro : on ne peut pas diviser par 0.');
        assert.equal(err('2 +'), 'Il manque un nombre après « + ».');
    });

    /* ═════ 2. Navigateur ═════ */
    let pw = null; for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— Playwright ou PHP absent : navigateur sauté'); if (failed) process.exit(1); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-outils2-')); fs.mkdirSync(path.join(tmp, 'media'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(__dirname, 'tresors-seed.php')], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !/ok$/.test(seed.stdout)) throw new Error(seed.stderr || seed.stdout);
    const port = 20660, base = `http://127.0.0.1:${port}/`;
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch();
    const open = async (lang, width = 1300) => {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        await ctx.addInitScript(l => { try { localStorage.setItem('lcnda-langue', l); } catch (_) {} }, lang);
        const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.dismiss());
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openCalculator, null, { timeout: 30000 });
        return { page, errors, ctx };
    };
    // les textes visibles d’une zone (hors données, champs de saisie, code)
    const textsOf = (page, sel) => page.evaluate(sel => {
        const out = [];
        for (const root of document.querySelectorAll(sel)) {
            const off = el => el.closest('[data-i18n-off],script,style,code,textarea,kbd,.cm-tape,.cm-keys');
            const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
            while ((n = w.nextNode())) { const el = n.parentElement; if (!el || off(el) || !el.getClientRects().length) continue; const x = n.textContent.trim(); if (x) out.push(x); }
            root.querySelectorAll('[title],[aria-label]').forEach(el => { if (off(el)) return; ['title', 'aria-label'].forEach(a => { const v = el.getAttribute(a); if (v) out.push(v.trim()); }); });
        }
        return out;
    }, sel);
    const SCREENS = [
        ['liste des outils de modification', async p => { await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'edit_tools'; return A.setModule('listes'); }); await p.waitForSelector('.h-et-page [data-et-list] > *', { timeout: 15000 }); return '.h-et-page'; }],
        ['calculette', async p => { await p.evaluate(() => window.LCNDA_EXT.openCalculator()); await p.waitForSelector('#calculette', { timeout: 10000 }); return '#calculette'; }],
        ['transcription d’actes', async p => { await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({})); await p.waitForSelector('.h-tx-dlg[open]', { timeout: 10000 }); await p.waitForTimeout(600); return '.h-tx-dlg[open]'; }],
        ['aide à la lecture', async p => { await p.evaluate(() => window.LCNDA_EXT.readingAid.open()); await p.waitForSelector('dialog[open]', { timeout: 10000 }); await p.waitForTimeout(400); return 'dialog[open]'; }],
        ['convertisseur d’autrefois', async p => { await p.evaluate(() => window.LCNDA_EXT.autrefois.open()); await p.waitForSelector('dialog[open]', { timeout: 10000 }); await p.waitForTimeout(400); return 'dialog[open]'; }],
    ];
    const close = p => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.getElementById('calculette')?.remove(); });
    try {
        await t('français : rien ne change (titres et boutons d’origine), aucune erreur', async () => {
            const { page, errors, ctx } = await open('fr');
            await SCREENS[0][1](page);
            const txt = (await textsOf(page, '.h-et-page')).join(' | ');
            assert.match(txt, /Outils de modification/); assert.match(txt, /Les projets des outils de l’app/); assert.match(txt, /Ranger les outils/);
            const err = await page.evaluate(() => { const r = window.LCNDA_CALC.evaluate('1/0'); return r && r.ok === false ? r.error : ''; });
            if (err) assert.equal(err, 'Division par zéro : on ne peut pas diviser par 0.');
            assert.deepEqual(errors, []); await ctx.close();
        });
        for (const [lang, re] of [['de', /Bearbeitungswerkzeuge/], ['pl', /Narzędzia edycji/], ['en', /Editing tools/]]) {
            await t(`${lang} : écrans de la zone traduits, aucune erreur JS`, async () => {
                const { page, errors, ctx } = await open(lang), isFr = REMAIN.make(lang), report = [];
                for (const [name, show] of SCREENS) {
                    const sel = await show(page);
                    const texts = await textsOf(page, sel);
                    if (name.startsWith('liste')) assert.match(texts.join(' '), re);
                    const fr = [...new Set(texts.filter(isFr))];
                    if (fr.length) report.push(`${name} (${fr.length}) : ${fr.slice(0, 6).join(' | ')}`);
                    assert.ok(fr.length <= MAX_PER_SCREEN, `${lang} · ${name} : ${fr.length} textes restés en français : ${fr.join(' | ')}`);
                    await close(page);
                }
                const msg = await page.evaluate(() => { const r = window.LCNDA_CALC.evaluate('1/0'); return r && r.ok === false ? r.error : ''; });
                if (msg) assert.ok(!/Division par zéro/.test(msg), `message de la calculette en français : ${msg}`);
                if (report.length) console.log(`  ${lang} : français restant\n   ` + report.join('\n   '));
                assert.deepEqual(errors, []); await ctx.close();
            });
        }
        await t('de à 390 px : la liste des outils et la calculette ne débordent pas', async () => {
            const { page, errors, ctx } = await open('de', 390);
            await SCREENS[0][1](page);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), 'la liste déborde');
            await SCREENS[1][1](page);
            assert.ok(await page.evaluate(() => { const r = document.getElementById('calculette').getBoundingClientRect(); return r.right <= window.innerWidth + 2 && document.documentElement.scrollWidth <= window.innerWidth + 2; }), 'la calculette déborde');
            assert.deepEqual(errors, []); await ctx.close();
        });
    } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    if (failed) { console.error(`${failed} échec(s)`); process.exit(1); }
    console.log('✓ test-i18n-outils2 : tout passe');
})().catch(e => { console.error(e); process.exit(1); });
