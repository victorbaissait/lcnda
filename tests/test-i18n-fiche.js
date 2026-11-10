'use strict';
/* 🌐 Traduction de la fiche d'une personne et d'un animal (vague 2, zone « fiche »). Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-fiche.js           (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20410 pour le port)
 * 1. Node : chaque texte passé à t() / i18n() dans les fichiers de la fiche existe dans les 7 langues ; plus de morceaux
 *    collés pour les phrases de la fiche (ex. « Personnes inhumées ici (3) ») ; le français de t() ne bouge pas.
 * 2. Navigateur (Playwright, sinon sauté) : une base avec une famille, des événements, une note, une source, un média et
 *    un animal. En français rien ne change (pas de bandeau, textes d'origine). En allemand, polonais et anglais : la fiche
 *    (en-tête, sections, blocs), la fenêtre « Modifier la personne », celle d'un événement, celle d'une source, la fiche
 *    d'un animal et sa fenêtre : presque plus de texte français venu des fichiers de la zone ; allemand à 390 px sans
 *    débordement ; aucune erreur JS.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
const ZONE = ['assets/js/app.js', 'assets/js/heritage.js', 'assets/js/app-sections.js', 'assets/js/heritage-pets.js', 'assets/js/heritage-suivi-fiche.js'];
const X = require('../scripts/i18n-extract.js');

(async () => {
    /* ═════ 1. Node ═════ */
    await t('les textes passés à t() / i18n() dans les fichiers de la fiche existent dans les 7 langues', () => {
        const missing = {};
        for (const l of LANGS) {
            const dict = X.loadDict(l);
            for (const f of ZONE) for (const c of X.tCalls(path.join(root, f))) {
                if (c.text === 'Texte français') continue; // exemple dans un commentaire
                if (!X.translated(dict, c.text, c.ctx)) (missing[l] = missing[l] || []).push(`${f}:${c.line} ${c.text}`);
            }
        }
        assert.deepEqual(missing, {}, JSON.stringify(missing, null, 1));
    });
    await t('les phrases de la fiche passent par i18n() en entier (plus de morceaux collés)', () => {
        const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
        for (const s of ['Personnes inhumées ici ({n})', 'Photos datées ({n})', 'Fiabilité : {x}', 'Champs attendus ({yr}) : {list}', 'Naissance de {nm}', 'Intervalle {a} → {b} : {d} — enfant manquant possible.', 'Sosa {n}', 'Supprimer définitivement la fiche « {name} » ?'])
            assert.ok(app.includes(`i18n('${s}'`), s);
        assert.ok(!/`Personnes inhumées ici \(\$\{/.test(app) && !/`Fiabilité : \$\{/.test(app), 'anciens morceaux');
        const sec = fs.readFileSync(path.join(root, 'assets/js/app-sections.js'), 'utf8');
        assert.ok(sec.includes("i18n('Section « {nm} » créée'") && !/`Section « \$\{s\.name\} » montée`/.test(sec));
        assert.ok(!/i18n\('[^']*\\n/.test(app), 'pas de retour à la ligne dans une clé (un .tsv ne peut pas l’écrire)');
    });
    await t('le français de t() ne bouge pas, les autres langues sont traduites (exemples de la fiche)', () => {
        const I = require('../assets/js/app-i18n.js');
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Personnes inhumées ici ({n})', {n: 3}), 'Personnes inhumées ici (3)');
        assert.equal(I.t('{n} ans', {n: 0, ctx: 'age'}), '0 ans');
        I.setLang('de', {persist: false});
        assert.equal(I.t('Personnes inhumées ici ({n})', {n: 3}), 'Hier begrabene Personen (3)');
        assert.equal(I.t('{n} ans', {n: 1, ctx: 'age'}), '1 Jahr'); assert.equal(I.t('{n} ans', {n: 4, ctx: 'age'}), '4 Jahre');
        I.setLang('pl', {persist: false});
        assert.equal(I.t('{n} ans', {n: 3, ctx: 'age'}), '3 lata'); assert.equal(I.t('{n} ans', {n: 7, ctx: 'age'}), '7 lat');
        assert.equal(I.plural(5, 'document lié', 'documents liés'), '5 powiązanych dokumentów');
        assert.equal(I.translateText('Modifier l’identité'), 'Edytuj tożsamość');
        I.setLang('fr', {persist: false});
    });

    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction de la fiche : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-i18n-fiche-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Lille','Nord','France',50.63,3.06),(2,'Tours','Indre-et-Loire','France',47.39,0.69)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Joseph','MARTIN','male','deceased',1),(2,'Marie','DURAND','female','deceased',0),(3,'Louis','MARTIN','male','deceased',0),(4,'Jeanne','MARTIN','female','living',0)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(1,4)");
$ty = fn($tag, $scope = 'person') => (int)$pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' AND scope='$scope' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)");
$ins->execute(['person', 1, null, $ty('BIRT'), '7 mai 1850', 1850, 1]); $ins->execute(['person', 1, null, $ty('DEAT'), '12 mars 1910', 1910, 2]);
$ins->execute(['family', null, 1, $ty('MARR', 'family'), '3 juin 1875', 1875, 1]); $ins->execute(['person', 3, null, $ty('BIRT'), '1 avril 1877', 1877, 1]);
$ins->execute(['person', 4, null, $ty('BIRT'), '2 mai 1880', 1880, 1]); $ins->execute(['person', 2, null, $ty('BIRT'), '5 juin 1852', 1852, 2]);
$pdo->exec("INSERT INTO notes(entity_type,entity_id,title,body,created_at,updated_at) VALUES('person',1,'Souvenir','Il aimait le jardin.',datetime('now'),datetime('now'))");
$pdo->exec("INSERT INTO sources(id,title,agency) VALUES(1,'Registre de Lille','Archives du Nord')");
$pdo->exec("INSERT INTO source_links(entity_type,entity_id,source_record_id,page) VALUES('person',1,1,'p. 12')");
file_put_contents(MEDIA_DIR.'/photo1.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='));
$pdo->exec("INSERT INTO media(id,title,media_type,filename,source_type) VALUES(801,'Joseph en 1900','image','photo1.png','local')");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(801,'person',1)");
$d = json_encode(['name'=>'Minette','species'=>'chat','breed'=>'Chartreux','sex'=>'F','microchip'=>'250269812345678','birth_date'=>'03/04/2019','titles'=>[['date'=>'2021','event'=>'Expo','title'=>'Championne']],'owners'=>[],'vaccines'=>[],'tests'=>[],'measures'=>[['date'=>'2024-01-01','weight'=>'4,1'],['date'=>'2025-01-01','weight'=>'4,3']],'events'=>[]], JSON_UNESCAPED_UNICODE);
$pdo->prepare('INSERT INTO pets(id,data_json) VALUES(501,?)')->execute([$d]);
$pdo->exec('PRAGMA user_version = 66'); // la migration 67 donne sa fiche complète à l'animal
echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.I18N_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }

    // les textes français écrits dans les fichiers de la zone (pour ne compter que ce qui vient de la fiche)
    const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
    const LEAD = /^[\s\p{Extended_Pictographic}\p{So}\p{Sm}️‍⃣·•]+/u, TRAIL = /[\s…:▾▸→↗]+$/u;
    const bank = new Set();
    for (const f of [...ZONE, 'index.php']) X.textsOfFile(path.join(root, f)).forEach(x => bank.add(norm(x.text)));
    const leftFr = lang => { const dict = X.loadDict(lang); return raw => { const s = norm(raw); if (!/\p{L}{3}/u.test(s)) return false; const rest = s.replace(LEAD, ''), core = rest.replace(TRAIL, ''); if (!(bank.has(s) || bank.has(rest) || bank.has(core))) return false; return !X.translated(dict, s); }; };

    const browser = await chromium.launch();
    const errs = [];
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { try { if (l && !sessionStorage.getItem('i18n-test-set')) { localStorage.setItem('lcnda-langue', l); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage();
        page.on('pageerror', e => errs.push(`${lang || 'fr'} ${w}px : ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${lang || 'fr'} console : ${m.text()}`); });
        page.on('dialog', d => d.dismiss());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1800);
        return page;
    };
    const texts = page => page.evaluate(() => {
        const out = new Set();
        for (const el of document.querySelectorAll('#workspace, dialog[open]')) {
            const tw = document.createTreeWalker(el, 5); let n = el;
            do {
                if (n.nodeType === 1) { if (n.closest('[data-i18n-off], script, style, textarea')) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
                else if (n.nodeType === 3 && !n.parentElement.closest('[data-i18n-off], script, style, textarea')) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
            } while ((n = tw.nextNode()));
        }
        return [...out];
    });
    const close = page => page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
    const STEPS = [
        ['fiche', async () => { await window.LCNDA_APP.openPersonById(1); }],
        ['identité', () => document.querySelector('[data-edit-person-inline]')?.click()],
        ['événement', () => document.querySelector('[data-edit-event]')?.click()],
        ['source', () => document.querySelector('[data-add-source-inline]')?.click()],
        ['fiche femme', async () => { await window.LCNDA_APP.openPersonById(2); }],
        ['animal', async () => { await window.LCNDA_EXT.openPet(501); }],
        ['animal : modifier', () => document.querySelector('[data-edit-person-inline]')?.click()],
    ];
    try {
        await t('en français, rien ne change : pas de bandeau, html lang="fr", les textes d’origine', async () => {
            const page = await open();
            await page.evaluate(async () => { await window.LCNDA_APP.openPersonById(1); }); await page.waitForTimeout(1500);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), txt: document.querySelector('#workspace').textContent}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false);
            for (const s of ['FICHE INDIVIDUELLE', 'Identité', 'Frères & sœurs', 'Aucun parent']) assert.ok(r.txt.includes(s), s);
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : la fiche, ses fenêtres et la fiche d’un animal presque sans texte français de la zone`, async () => {
            const isFr = leftFr(l);
            const page = await open({lang: l});
            const left = {}, all = new Set();
            for (const [name, js] of STEPS) {
                await page.evaluate(js).catch(() => {}); await page.waitForTimeout(1300);
                const fr = (await texts(page)).filter(isFr);
                fr.forEach(s => all.add(s)); if (fr.length) left[name] = fr;
                if (shots) await page.screenshot({path: path.join(shots, `i18n-fiche-${l}-${name.replace(/\W+/g, '-')}.png`)});
                if (/identité|événement|source|modifier/.test(name)) await close(page);
            }
            assert.equal(await page.evaluate(() => document.documentElement.lang), l);
            const head = await page.evaluate(async () => { await window.LCNDA_APP.openPersonById(1); await new Promise(r => setTimeout(r, 900)); return document.querySelector('#workspace').textContent; });
            const want = {de: ['PERSONENEINTRAG', 'Identität', 'Geschwister'], pl: ['KARTA OSOBY', 'Tożsamość', 'Rodzeństwo'], en: ['PERSONAL RECORD', 'Identity', 'Brothers & sisters']}[l];
            for (const s of want) assert.ok(head.includes(s), `${l} : « ${s} »`);
            assert.ok(all.size <= 12, `${all.size} textes français restés : ${JSON.stringify(left, null, 1)}`);
            if (all.size) console.log(`  (${l} : ${all.size} restés : ${[...all].slice(0, 6).join(' | ')}${all.size > 6 ? ' …' : ''})`);
            await page.context().close();
        });
        await t('allemand à 390 px : la fiche ne déborde pas', async () => {
            const page = await open({lang: 'de', w: 390});
            for (const [name, js] of [STEPS[0], STEPS[5]]) {
                await page.evaluate(js).catch(() => {}); await page.waitForTimeout(1400);
                const r = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth,
                    wide: [...document.querySelectorAll('#workspace .person-hero, #workspace .card-head, #workspace h1, #workspace h2, #workspace h3')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5)}));
                assert.ok(r.sw <= 391 && r.bw <= 391, `${name} : la page déborde (${r.sw} px)`);
                assert.deepEqual(r.wide, [], `${name} : ${r.wide.join(', ')}`);
                if (shots) await page.screenshot({path: path.join(shots, `i18n-fiche-de-390-${name}.png`), fullPage: false});
            }
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction de la fiche : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
