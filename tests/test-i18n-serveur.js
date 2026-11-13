'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌐 Traduction des textes du serveur (lib/*.php → i18n_t(), assets/i18n/src/serveur.tsv) :   node tests/test-i18n-serveur.js
 *  1. HTTP (un vrai « php -S », port I18N_PORT ou 20460) sur une petite base où des erreurs sont glissées :
 *     - en français (sans en-tête), rien ne change : titres et détails du ✅ Contrôle de la base mot pour mot, messages d'erreur ;
 *     - en-tête X-LCNDA-Lang de / pl / en : les mêmes alertes (mêmes clés, mêmes nombres), titres, détails, règles, coches
 *       des doublons et étiquettes des dates traduits, sans français restant ; un résultat gardé par langue (le français
 *       garde controle.json) ; messages d'erreur (action inconnue, fiche introuvable, message lancé par une fonction) ;
 *       « Que manque-t-il ? » (pourquoi, séries et conseils) et 🧩 murs de brique (indices, statuts) traduits ;
 *  2. le navigateur (Playwright ; sinon sauté) : la page « ✅ Contrôle de la base » en de, pl et en sans français dans les
 *     lignes, allemand à 390 px sans défilement horizontal, français inchangé ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const R = require('../scripts/i18n-remaining.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-i18n-serveur-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start) VALUES
 (1,'Jean','FAURE','male',0),(2,'Marie','LACHAUD','female',0),(3,'Marguerite','FAURE','female',0),
 (4,'Martin','MAZEL','male',0),(5,'Rose','LEROY','female',0),(6,'Louise','MAZEL','female',0),
 (7,'Françoise','DELMAS','female',0),(8,'Pierre','PEYRE','male',0),(9,'Pierre','PEYRE','male',0),
 (10,'Paul','BORIE','male',0),(11,'Henri','VIDAL','male',0),
 (12,'Luc','MARTIN','male',1),(13,'Anne','ROUX','female',0),(14,'Jeanne','ROUX','female',0),
 (17,'Jacques','DUPONT','male',0),(18,'Jacques','DUPONT','male',0),(19,'Louis','DUPONT','male',0),(20,'Lucie','BLANC','female',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Naves','Corrèze','France',45.31,1.77),(2,'Aurillac','Cantal','France',44.93,2.44),(3,'Arnac-la-Poste','Haute-Vienne','France',0,0),(4,'Tulle','Corrèze','France',45.27,1.77)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,4,5),(3,8,7),(4,13,14),(5,19,20)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(2,6),(3,9),(4,12),(5,17),(5,18)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)');
foreach ([
 ['person',1,null,'BIRT','12 décembre 1830',1830,4], ['person',1,null,'DEAT','26 mai 1862',1862,4], ['person',2,null,'BIRT','23 octobre 1834',1834,4],
 ['person',3,null,'BIRT','15 mars 1864',1864,1], ['person',3,null,'RESI','31 février 1900',1900,null],
 ['person',4,null,'BIRT','15 novembre 1836',1836,4], ['person',4,null,'DEAT','20 août 1860',1860,4], ['family',null,2,'MARR','17 avril 1863',1863,4],
 ['person',6,null,'BIRT','5 février 1865',1865,1],
 ['person',7,null,'BIRT','7 janvier 1806',1806,4], ['person',8,null,'BIRT','2 mars 1830',1830,4], ['person',9,null,'BIRT','7 septembre 1863',1863,4],
 ['person',10,null,'BIRT','3 mai 1850',1850,1], ['person',10,null,'CHR','4 mai 1850',1850,2],
 ['person',11,null,'BIRT','1 janvier 1800',1800,3], ['person',11,null,'DEAT','10 mai 1850',1850,3], ['person',11,null,'BURI','5 mai 1850',1850,3],
 ['person',12,null,'BIRT','1 juin 1950',1950,4], ['person',13,null,'BIRT','1 juin 1885',1885,4], ['person',14,null,'BIRT','1 juin 1886',1886,4],
 ['person',17,null,'BIRT','4 avril 1880',1880,4], ['person',18,null,'BIRT','4 avril 1880',1880,4], ['person',19,null,'BIRT','1 janvier 1850',1850,4],
] as [$sc,$pid,$fid,$tag,$d,$y,$pl]) { $ev->execute([$sc,$pid,$fid,$t($tag),$d,$y,$pl]); }
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }

let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const LANGS = ['de', 'pl', 'en'];

(async () => {
    const port = Number(process.env.I18N_PORT) || 20460;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r.text(); });
    const get = async (action, q = {}, lang = '') => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie, ...(lang ? { 'X-LCNDA-Lang': lang } : {}) } }); return r.json(); };
    // les textes d'une alerte qui s'affichent (le nom des fiches et les dates écrites par la personne restent tels quels)
    const shown = a => [a.title, a.detail, a.rule, ...Object.values(a.views || {}), ...(a.checks || []).map(c => c[1]), ...(a.dates || []).map(d => d.label)].filter(Boolean);
    const stripData = s => String(s).replace(/[A-ZÉÈ][a-zéèçë]+ [A-ZÉ]{3,}/g, 'X').replace(/\d{1,2} (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \d{4}/g, 'D').replace(/Naves|Aurillac|Tulle|Arnac-la-Poste|Corrèze|Cantal/g, 'N')
        // le nom des sortes d’événements vient de la base (table event_types) : une donnée, pas un texte de l’app
        .replace(/\b(lieu de résidence|naissance|décès|inhumation|baptême|résidence|mariage)\b/gi, 'E');
    try {
        const fr = await get('controle');
        await t('français (sans en-tête) : les alertes du Contrôle de la base mot pour mot', async () => {
            assert.ok(!fr.error, fr.error);
            const titles = fr.alerts.map(a => a.title);
            for (const want of ['Mère de 57 ans à la naissance', 'Date qui n’existe pas : « 31 février 1900 »', 'Inhumation avant le décès', 'Marié après son décès', 'Jacques DUPONT ↔ Jacques DUPONT'])
                assert.ok(titles.includes(want), `${want} : ${titles.join(' | ')}`);
            assert.ok(titles.some(x => /^Née \d+ (an|ans|mois|jours?) après la mort de son père$/.test(x)), titles.join(' | '));
            const mother = fr.alerts.find(a => a.title === 'Mère de 57 ans à la naissance');
            assert.equal(mother.rule, 'Une naissance après 55 ans est presque impossible ; à partir de 50 ans, c’est à vérifier.');
            assert.ok(/^Naissance 7 septembre 1863 · mère née 7 janvier 1806 \(seuil : \d+ ans\)$/.test(mother.detail), mother.detail);
            assert.ok(mother.dates.every(d => /^naiss\. /.test(d.label)), JSON.stringify(mother.dates));
            const dup = fr.alerts.find(a => a.check === 'duplicate');
            assert.ok(dup.checks.some(c => c[1] === 'même nom') && dup.detail === 'né 1880 · né 1880', JSON.stringify(dup));
            assert.ok(fs.existsSync(path.join(tmp, 'cache', 'controle.json')), 'le français garde controle.json');
        });
        for (const lang of LANGS) {
            const isFr = R.make(lang);
            await t(`${lang} : mêmes alertes (clés, nombres), textes traduits, rien de français, un résultat gardé par langue`, async () => {
                const d = await get('controle', {}, lang);
                assert.ok(!d.error, d.error);
                assert.deepEqual(d.alerts.map(a => a.key).sort(), fr.alerts.map(a => a.key).sort());
                const left = [];
                for (const a of d.alerts) {
                    const f = fr.alerts.find(x => x.key === a.key);
                    if (a.check !== 'duplicate') assert.notEqual(a.title, f.title, `${lang} : titre traduit (${a.key})`);
                    for (const s of shown(a)) if (isFr(stripData(s))) left.push(s);
                }
                assert.deepEqual(left, [], `${lang} : texte resté en français`);
                assert.ok(fs.existsSync(path.join(tmp, 'cache', `controle-${lang}.json`)), `controle-${lang}.json`);
                const s = await get('controle_summary', {}, lang), sf = await get('controle_summary');
                assert.equal(s.total, sf.total); assert.deepEqual(s.by_level, sf.by_level);
            });
        }
        await t('le français reste le français après une autre langue (cache séparé)', async () => {
            const again = await get('controle');
            assert.deepEqual(again.alerts.map(a => a.title), fr.alerts.map(a => a.title));
        });
        await t('de : quelques phrases attendues (phrase entière selon le sexe, règle, coches)', async () => {
            const d = await get('controle', {}, 'de');
            const titles = d.alerts.map(a => a.title);
            assert.ok(titles.includes('Mutter mit 57 Jahren bei der Geburt'), titles.join(' | '));
            assert.ok(titles.includes('Datum, das es nicht gibt: „31 février 1900“'), titles.join(' | '));
            assert.ok(titles.some(x => /nach dem Tod des Vaters geboren$/.test(x)), titles.join(' | '));
            const dup = d.alerts.find(a => a.check === 'duplicate');
            assert.ok(dup.checks.some(c => c[1] === 'gleicher Nachname'), JSON.stringify(dup.checks));
        });
        await t('messages d’erreur : action inconnue, fiche introuvable (lancée par une fonction), français inchangé', async () => {
            assert.equal((await get('action_qui_nexiste_pas')).error, 'Action inconnue');
            assert.equal((await get('action_qui_nexiste_pas', {}, 'de')).error, 'Unbekannte Aktion');
            assert.equal((await get('mur_de_brique', { id: 99999 })).error, 'Fiche introuvable.');
            for (const lang of LANGS) { const e = (await get('mur_de_brique', { id: 99999 }, lang)).error; assert.ok(e && e !== 'Fiche introuvable.', `${lang} : ${e}`); }
        });
        await t('« Que manque-t-il ? » : pourquoi, séries et conseils traduits ; le service d’archives garde son nom', async () => {
            const f = await get('research_gaps', { gen: 6 }), d = await get('research_gaps', { gen: 6 }, 'de');
            assert.ok(f.items.length > 0 && f.items.length === d.items.length, `${f.items.length} / ${d.items.length}`);
            const isFr = R.make('de');
            for (let i = 0; i < d.items.length; i++) {
                assert.equal(d.items[i].archive.label, f.items[i].archive.label, 'nom du service d’archives (sert aux dépouillements)');
                assert.equal(d.items[i].what, f.items[i].what, '« what » sert aux recherches sur FranceArchives');
                for (const s of [d.items[i].why, ...d.items[i].where.flatMap(w => [w.series, w.detail])]) assert.ok(!isFr(stripData(s)), `de : ${s}`);
            }
            assert.ok(f.items.some(it => /^(mariage en|enfant né en|dernière mention en|décès en|vivant|classe )/.test(it.why)), f.items.map(x => x.why).join(' | '));
        });
        await t('🧩 murs de brique : indices et statuts traduits', async () => {
            const w = await get('murs_de_brique', {}, 'pl'), wf = await get('murs_de_brique');
            assert.equal(w.items.length, wf.items.length);
            assert.equal(wf.statuses.open, 'À chercher'); assert.notEqual(w.statuses.open, 'À chercher');
            const d = await get('mur_de_brique', { id: 18 }, 'pl'), df = await get('mur_de_brique', { id: 18 });
            assert.equal(d.hints.length, df.hints.length);
            if (df.hints.length) assert.ok(d.hints.every((h, i) => h.text !== df.hints[i].text), JSON.stringify(d.hints));
        });

        await t('🗓 Ma semaine de recherche : mêmes lignes, titres et détails traduits (français inchangé)', async () => {
            const f = await get('semaine'), d = await get('semaine', {}, 'de');
            const rows = x => (x.items || x.rows || []);
            assert.equal(rows(d).length, rows(f).length);
            assert.ok(rows(f).length > 0, JSON.stringify(f).slice(0, 300));
            const isFr = R.make('de'), left = [];
            for (const it of rows(d)) for (const s of [it.title, it.detail, it.done_label]) if (s && isFr(stripData(s))) left.push(s);
            assert.deepEqual(left, []);
            assert.ok(rows(f).some(it => /^(Naissance|Mariage|Décès|Parents|Recensements?) /.test(it.title || '')), rows(f).map(x => x.title).join(' | '));
        });

        /* ═════ 2. Navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
        if (!chromium) { console.log('— navigateur : Playwright absent, partie sautée'); }
        else {
            const browser = await chromium.launch();
            const errors = [];
            try {
                for (const [lang, w] of [['', 1440], ['de', 1440], ['de', 390], ['pl', 1440], ['en', 1440]]) {
                    await t(`${lang || 'fr'} ${w}px : la page « ✅ Contrôle de la base »`, async () => {
                        const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
                        await ctx.addInitScript(l => { try { if (l) localStorage.setItem('lcnda-langue', l); localStorage.setItem('genealogie-visite-guidee', JSON.stringify({ never: true, done: true })); } catch (_) {} }, lang);
                        const p = await ctx.newPage();
                        p.on('pageerror', e => errors.push(`${lang} ${w} : ${e.message}`));
                        p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR/.test(m.text())) errors.push(`${lang} ${w} console : ${m.text()}`); });
                        p.on('dialog', d => d.dismiss());
                        await p.goto(base);
                        await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.openControle, null, { timeout: 20000 });
                        await p.evaluate(() => window.LCNDA_EXT.openControle({}));
                        await p.waitForSelector('.ctl-page .ctl-row h3', { timeout: 15000 }); await p.waitForTimeout(500);
                        const rows = await p.$$eval('.ctl-row h3, .ctl-row .ctl-detail, .ctl-row .ctl-check', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
                        assert.ok(rows.length > 5, rows.join(' | '));
                        if (!lang) assert.ok(rows.some(r => r.includes('Mère de 57 ans à la naissance')), rows.join(' | '));
                        else {
                            const isFr = R.make(lang);
                            // l'étiquette de sorte (PARENTS, DATES…) vient du navigateur : seul ce que le serveur écrit est vérifié ici
                            const left = rows.map(r => r.replace(/\b[A-ZÂÉÈ]{4,}\b/g, '')).filter(r => isFr(stripData(r)));
                            assert.ok(left.length === 0, `${lang} : ${left.join(' | ')}`);
                        }
                        const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
                        assert.ok(sw <= 0, `défilement horizontal : ${sw}`);
                        await ctx.close();
                    });
                }
                await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
            } finally { await browser.close(); }
        }
    } finally {
        proc.kill();
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    }
    console.log(`${failed ? '✗' : '✓'} textes du serveur : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
