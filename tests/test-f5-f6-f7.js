'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📖 F5 biographie écrite par l'app · 🌍 F6 le monde autour · 🛠️ F7 fiche d'un métier ancien :   node tests/test-f5-f6-f7.js
 * Un vrai « php -S » sur une base neuve (une petite famille de Tulle), puis un navigateur (Playwright ; sinon sauté).
 *  1. API biographie : accords (fils / fille, baptisé / baptisée), dates (« le 3 mai 1832 », « vers 1890 »), longueur, ton,
 *     témoins, sources (parenthèses, notes), ta version gardée, « la fiche a changé », retour au texte de l'app,
 *     même texte pour le livre de famille (automatic_biography) ;
 *  2. API monde autour : âge (« Jean a 38 ans quand la guerre de 1870 commence »), mes événements locaux (commune),
 *     contrôles (titre, années, lien), suppression ; la liste des crises vient du même fichier ;
 *  3. API métiers anciens : dictionnaire (≥ 300, variantes, licence et sources), correspondances (« maître cordonnier »,
 *     « tixier », pluriels), ancêtres d'un métier, notes et images ajoutées, clé forgée refusée ;
 *  4. navigateur : les blocs 📖 et 🌍 de la fiche, ✎ Modifier → « Ta version », ↻ Regénérer (ce qui a changé), le métier cliquable
 *     → fiche du métier (texte forgé échappé), Listes → 🛠️ Métiers anciens et 🌍 Le monde autour, la Chronologie ;
 *     1440 px, 390 px, mode sombre ; aucune erreur de page. Captures dans $F567_SHOTS si donné.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-f567-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
const shots = process.env.F567_SHOTS || '';
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag, $scope = 'person') => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' AND scope='$scope' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(name,county,state,country,latitude,longitude,admin4_code) VALUES('Tulle','Corrèze','Nouvelle-Aquitaine','France',45.267,1.771,'19272'),('Naves','Corrèze','Nouvelle-Aquitaine','France',45.31,1.77,'19146')");
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,living_status,occupation) VALUES
 ('Jean','MARTIN','male','deceased',''),('Pierre','MARTIN','male','deceased','Tisserand'),('Marie','LAFON','female','deceased',''),
 ('Anne','DUPONT','female','deceased','<img src=x onerror=window.__xss=1>'),('Léon','MARTIN','male','deceased',''),('Rose','MARTIN','female','deceased',''),('Antoine','BESSE','male','deceased','maître cordonnier')");
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(2,3),(1,4)");
$pdo->exec("INSERT INTO family_children(family_id,child_id,position) VALUES(1,1,0),(2,5,0),(2,6,1)");
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES
 ('person',1,{$t('BIRT')},'3 mai 1832',1832,1),('person',1,{$t('CHR')},'4 mai 1832',1832,1),('person',1,{$t('DEAT')},'vers 1890',1890,1),
 ('person',4,{$t('BIRT')},'12/02/1835',1835,2),('person',4,{$t('CHR')},'13 février 1835',1835,2),
 ('person',5,{$t('BIRT')},'1857',1857,1),('person',6,{$t('BIRT')},'1860',1860,1),('person',7,{$t('BIRT')},'1840',1840,1)");
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id,description) VALUES('person',1,{$t('OCCU')},'1856',1856,1,'sabotier')");
$pdo->exec("INSERT INTO events(scope,family_id,event_type_id,date_text,year,place_id) VALUES('family',2,{$t('MARR','family')},'20 avril 1856',1856,1)");
$pdo->exec("INSERT INTO event_witnesses(event_id,person_id,note) VALUES(10,7,'témoin')");
$pdo->exec("INSERT INTO sources(title) VALUES('Registre paroissial de Tulle')");
$pdo->exec("INSERT INTO source_links(entity_type,entity_id,source_record_id,page) VALUES('event',1,1,'f° 12')");
$pdo->exec("INSERT INTO census_records(year,place_id,status) VALUES(1872,1,'found')");
$pdo->exec("INSERT INTO census_members(census_id,person_id,display_name,occupation) VALUES(1,1,'Jean Martin','sabotier'),(1,4,'Anne Dupont','')");
$pdo->exec("INSERT INTO media(title,description,media_type,filename) VALUES('Atelier de sabotier à Tulle','Photo de l’atelier','image','atelier.jpg')");
file_put_contents(MEDIA_DIR . '/atelier.jpg', base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='));
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const results = [];
const check = async (name, fn) => { try { await fn(); results.push([name, true]); console.log('  ✓ ' + name); } catch (e) { results.push([name, false]); console.log('  ✗ ' + name + '\n      ' + String(e.message).split('\n').join('\n      ')); } };

(async () => {
    const port = Number(process.env.F567_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const jar = {};
    const get = async (action, q = {}) => { const u = new URL(base + 'api.php'); u.searchParams.set('action', action); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v); const r = await fetch(u, { headers: { Cookie: jar.c || '' } }); return r.json(); };
    // jeton CSRF : celui de la page (cookie de session)
    const boot = await fetch(base); jar.c = (boot.headers.get('set-cookie') || '').split(';')[0];
    const html = await boot.text(); const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const post = async (action, body) => { const r = await fetch(base + 'api.php?action=' + action, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Cookie: jar.c || '' }, body: JSON.stringify({ ...body, csrf }) }); const j = await r.json().catch(() => ({})); return { status: r.status, error: j.error, ...(j.result || {}) }; };
    let browser = null;
    try {
        console.log('📖 Biographie');
        await check('texte normal : naissance, parents et métier du père, mariage, enfants, décès « vers »', async () => {
            const d = await get('biography', { id: 1 });
            assert.ok(d.generated.includes('Jean MARTIN naît le 3 mai 1832 à Tulle'), d.generated);
            assert.ok(d.generated.includes('fils de Pierre MARTIN, tisserand, et de Marie LAFON'), d.generated);
            assert.ok(/épouse Anne DUPONT le 20 avril 1856 à Tulle/.test(d.generated), d.generated);
            assert.ok(d.generated.includes('2 enfants : Léon (1857) et Rose (1860)'), d.generated);
            assert.ok(/meurt vers 1890 à Tulle \(Corrèze\), vers 58 ans/.test(d.generated), d.generated);
            assert.ok(d.generated.includes('sabotier'), 'métier');
        });
        await check('accords au féminin (fille… baptisée, date 12/02/1835 → le 12 février 1835)', async () => {
            const d = await get('biography', { id: 4 });
            assert.ok(d.generated.includes('Anne DUPONT naît le 12 février 1835 à Naves'), d.generated);
            assert.ok(d.generated.includes('est baptisée le 13 février 1835'), d.generated);
        });
        await check('courte (un paragraphe) · chaleureux · témoins · sources en notes et entre parenthèses', async () => {
            const s = await get('biography', { id: 1, length: 'short' }); assert.equal(s.paragraphs.length, 1);
            const w = await get('biography', { id: 1, tone: 'warm', witnesses: 1, length: 'long' });
            assert.ok(w.generated.includes('voit le jour') && w.generated.includes('unit sa vie à'), w.generated);
            assert.ok(w.generated.includes('les témoins sont Antoine BESSE (témoin)'), w.generated);
            assert.ok(w.generated.includes('Au recensement de 1872'), w.generated);
            const n = await get('biography', { id: 1, sources: 'notes' }); assert.ok(/\[1\]/.test(n.generated) && n.generated.includes('Notes :\n[1] Registre paroissial de Tulle, f° 12'), n.generated);
            const i = await get('biography', { id: 1, sources: 'inline' }); assert.ok(i.generated.includes('(Registre paroissial de Tulle, f° 12)'), i.generated);
            const c = await get('biography', { id: 1, census: 0, jobs: 0 }); assert.ok(!c.generated.includes('recensement') && !c.generated.includes('tisserand'), c.generated);
        });
        await check('ta version gardée → utilisée partout ; la fiche change → « changed » ; retour au texte de l’app', async () => {
            const r = await post('save_biography', { person_id: 1, text: 'Jean, notre sabotier de Tulle.', options: { length: 'normal' } });
            assert.equal(r.own, 'Jean, notre sabotier de Tulle.'); assert.equal(r.changed, false);
            const p = await get('person', { id: 1 }); assert.equal(p.biography, 'Jean, notre sabotier de Tulle.');
            await post('save_biography', { person_id: 1, options: { length: 'long' } }); // options seules : ta version reste
            const g = await get('biography', { id: 1 }); assert.equal(g.own, 'Jean, notre sabotier de Tulle.'); assert.equal(g.options.length, 'long'); assert.equal(g.changed, true);
            const back = await post('save_biography', { person_id: 1, text: '' }); assert.equal(back.own, ''); assert.ok(back.text.includes('naît'));
            const bad = await post('save_biography', { person_id: 999, text: 'x' }); assert.ok(bad.status >= 400 && /introuvable/i.test(bad.error || ''), JSON.stringify(bad));
        });

        console.log('🌍 Le monde autour');
        await check('âge à chaque événement, crises, histoire locale', async () => {
            const d = await get('world_around', { id: 1 });
            assert.deepEqual(d.span, [1832, 1890]);
            const e70 = d.events.find(e => e.title.startsWith('Guerre franco-prussienne'));
            assert.ok(e70 && e70.phrase === 'Jean a 38 ans quand la guerre de 1870 commence.', JSON.stringify(e70));
            const ch = d.events.find(e => e.title === 'Choléra de 1832'); assert.ok(ch && /vient de naître/.test(ch.phrase), JSON.stringify(ch));
            assert.ok(d.events.every(e => e.src && e.url.startsWith('https://fr.wikipedia.org/')), 'source de chaque événement');
            assert.ok(!d.events.some(e => e.title === 'Peste de Marseille'), 'portée locale ailleurs : pas montrée');
        });
        let ownId = 0;
        await check('mes événements : contrôles, commune, ↶ (suppression rend la ligne)', async () => {
            for (const [body, re] of [[{ title: '', from_year: 1850, reach: 'france' }, /titre/], [{ title: 'X', from_year: 900, reach: 'france' }, /année/], [{ title: 'X', from_year: 1860, to_year: 1850, reach: 'france' }, /fin/], [{ title: 'X', from_year: 1860, reach: 'commune' }, /commune/], [{ title: 'X', from_year: 1860, reach: 'france', url: 'javascript:alert(1)' }, /http/]]) {
                const r = await post('save_history_event', body); assert.ok(r.status >= 400 && re.test(r.error || ''), JSON.stringify(r));
            }
            const r = await post('save_history_event', { title: 'Grande crue de la Corrèze', from_year: 1865, category: 'hiver', reach: 'commune', place_id: 1, quand: 'la Corrèze inonde Tulle', source: 'Monographie communale' });
            ownId = r.id; assert.ok(ownId > 0);
            const d = await get('world_around', { id: 1 }); const e = d.events.find(x => x.own === ownId);
            assert.ok(e && e.hit === 'local' && e.phrase === 'Jean a 33 ans quand la Corrèze inonde Tulle.', JSON.stringify(e));
            const wife = await get('world_around', { id: 4 }); assert.ok(wife.events.some(x => x.own === ownId), 'Anne (mariée à Tulle) : concernée');
            const naves = await post('save_history_event', { title: 'Foire de Naves', from_year: 1870, category: 'société', reach: 'commune', place_id: 2 });
            assert.ok(!(await get('world_around', { id: 1 })).events.some(x => x.own === naves.id), 'Jean (jamais à Naves) : pas concerné');
            assert.ok((await get('world_around', { id: 4 })).events.some(x => x.own === naves.id), 'Anne (née à Naves) : concernée');
            await post('delete_history_event', { id: naves.id });
            const del = await post('delete_history_event', { id: ownId }); assert.equal(del.row.title, 'Grande crue de la Corrèze');
            assert.equal((await get('world_events', { own: 1 })).events.length, 0);
            const again = await post('save_history_event', { title: 'Grande crue de la Corrèze', from_year: 1865, category: 'hiver', reach: 'commune', place_id: 1, quand: 'la Corrèze inonde Tulle' }); ownId = again.id;
        });
        await check('la liste des crises (Épidémies, guerres, hivers) vient du même fichier', async () => {
            const h = await get('historical_context'); const j = JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/data/monde-autour.json'), 'utf8'));
            const crises = new Set(j.events.filter(e => e.crisis).map(e => e.title)); assert.equal(crises.size, 27);
            assert.ok(h.crises.length && h.crises.every(c => crises.has(c.title)) && h.crises.some(c => c.title === 'Phylloxéra'), JSON.stringify(h.crises.map(c => c.title)));
            assert.ok(j.events.length >= 300 && j.events.filter(e => e.from >= 1500 && e.from <= 1960).length >= 280, 'liste assez riche');
            assert.ok(j.licence && j.credit && j.events.every(e => e.src && e.url && e.quand && e.desc), 'source de chaque événement');
        });

        console.log('🛠️ Métiers anciens');
        await check('dictionnaire : ≥ 300 métiers, variantes, licence et sources', async () => {
            const j = JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/data/metiers-anciens.json'), 'utf8'));
            assert.ok(j.trades.length >= 300, String(j.trades.length));
            assert.ok(j.licence === 'CC BY-SA 4.0' && j.sources.length >= 3);
            assert.ok(j.trades.every(t => t.desc && t.name && j.domains[t.domain]));
            assert.ok(j.trades.filter(t => (t.variants || []).length).length >= 150, 'variantes');
            const l = await get('old_trades'); assert.equal(l.trades.filter(t => t.domain !== 'perso').length, j.trades.length);
        });
        await check('correspondances : « Tisserand », « tixier », « maître cordonnier », pluriel', async () => {
            const t = await get('old_trade', { text: 'Tisserand' }); assert.equal(t.key, 'tisserand'); assert.ok(t.people.some(p => p.id === 2) && t.trade.tools.length);
            assert.equal((await get('old_trade', { text: 'tixier' })).key, 'tisserand');
            const c = await get('old_trade', { text: 'maître cordonnier' }); assert.equal(c.key, 'cordonnier'); assert.ok(c.people.some(p => p.id === 7));
            assert.equal((await get('old_trade', { text: 'Laboureurs' })).key, 'laboureur');
            const s = await get('old_trade', { text: 'sabotier' }); assert.ok(s.people.some(p => p.id === 1 && p.job_from === 1856), JSON.stringify(s.people));
            assert.ok(s.media.some(m => m.title.includes('sabotier')), 'image de la base');
            const own = await get('old_trade', { text: 'Faiseur de girouettes' }); assert.ok(own.own && own.key.startsWith('perso-'));
        });
        await check('compléter la fiche : notes, images, clé forgée refusée', async () => {
            const r = await post('save_old_trade', { key: 'sabotier', notes: 'Mon arrière-grand-père taillait les sabots en noyer.', media_ids: [1, 9999] }); assert.ok(r.ok);
            const s = await get('old_trade', { key: 'sabotier' }); assert.equal(s.notes.notes, 'Mon arrière-grand-père taillait les sabots en noyer.'); assert.deepEqual(s.notes.media_ids, [1]);
            const bad = await post('save_old_trade', { key: '../../etc', notes: 'x' }); assert.ok(bad.status >= 400);
            const bad2 = await get('old_trade', { key: "x' OR 1=1" }); assert.ok(bad2.error);
        });

        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        console.log('🖥 Navigateur');
        browser = await pw.chromium.launch();
        for (const [w, h, dark] of [[1440, 1000, false], [390, 860, false], [1440, 1000, true]]) {
            const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? 'dark' : 'light' });
await ctx.addInitScript(() => { try { localStorage.setItem('lcnda-sheet-sections-open', JSON.stringify({human: {s_ident: false, s_family: false, s_life: false, s_docs: false}})); } catch (_) {} }); // 🗂 sur téléphone les sections de la fiche sont repliées sauf la première (validé) : ici, toutes ouvertes
            await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|tile|openstreetmap/, r => r.abort());
            const page = await ctx.newPage();
            const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
            await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.openPersonById && window.LCNDA_EXT?.oldTrade && window.LCNDA_EXT?.world);
            if (dark) await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            const tag = `${w}${dark ? '-sombre' : ''}`;
            await check(`[${tag}] fiche : blocs 📖 Biographie et 🌍 Le monde autour`, async () => {
                await page.evaluate(() => window.LCNDA_APP.openPersonById(1));
                await page.waitForSelector('.h-bio-text p', { timeout: 15000 });
                assert.ok((await page.textContent('.h-bio-text')).includes('Jean MARTIN naît le 3 mai 1832'));
                await page.waitForSelector('.h-world-row', { timeout: 15000 });
                assert.ok((await page.textContent('[data-world-host]')).includes('Jean a 38 ans quand la guerre de 1870 commence.'));
                assert.ok((await page.textContent('[data-world-host]')).includes('Grande crue de la Corrèze'), 'événement local');
                const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(over <= 2, 'pas de défilement de côté : ' + over);
                if (shots) { await page.locator('[data-bio-host]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(shots, `fiche-bio-${tag}.png`) }); await page.locator('[data-world-host]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(shots, `fiche-monde-${tag}.png`) }); }
            });
            if (!dark && w === 1440) {
                await check('✎ Modifier → « Ta version » ; ↻ Regénérer montre ce qui a changé ; ↺ remet le texte de l’app', async () => {
                    await page.click('[data-bio-opt="length"][data-v="long"]'); await page.waitForFunction(() => document.querySelector('.h-bio-text')?.textContent.includes('recensement de 1872'));
                    await page.click('[data-bio-edit]'); await page.fill('.h-bio-edit', 'Jean, notre sabotier de Tulle, naît en 1832.'); await page.click('[data-bio-keep]');
                    await page.waitForFunction(() => document.querySelector('[data-bio-host] .ui-badge')?.textContent.match(/ta version/i));
                    await page.click('[data-bio-regen]'); await page.waitForSelector('.h-bio-diff ins');
                    if (shots) await page.screenshot({ path: path.join(shots, 'bio-regenerer.png') });
                    await page.click('dialog[open] [type=submit]'); // « Prendre le nouveau texte »
                    await page.waitForFunction(() => /texte de l/i.test(document.querySelector('[data-bio-host] .ui-badge')?.textContent || ''));
                });
                await check('le métier de la fiche ouvre la fiche du métier (texte forgé échappé)', async () => {
                    await page.evaluate(() => window.LCNDA_APP.openPersonById(4));
                    await page.waitForSelector('[data-trade-open]', { timeout: 15000 });
                    await page.evaluate(() => window.LCNDA_APP.openPersonById(2));
                    await page.waitForFunction(() => document.querySelector('[data-trade-open]')?.dataset.tradeOpen === 'Tisserand');
                    await page.click('[data-trade-open]'); await page.waitForSelector('dialog[open] .h-tr');
                    const t = await page.textContent('dialog[open] .h-tr'); assert.ok(t.includes('métier à tisser') && t.includes('Pierre MARTIN'), t.slice(0, 300));
                    for (const k of ['map', 'frise', 'list']) await page.click(`dialog[open] [data-tr-tab="${k}"]`);
                    if (shots) await page.screenshot({ path: path.join(shots, 'metier-tisserand.png') });
                    await page.keyboard.press('Escape');
                    await page.evaluate(() => window.LCNDA_EXT.oldTrade.open('sabotier')); await page.waitForSelector('dialog[open] .h-tr-notes');
                    assert.ok((await page.textContent('dialog[open] .h-tr')).includes('noyer'));
                    assert.equal(await page.evaluate(() => window.__xss), undefined);
                    await page.keyboard.press('Escape');
                });
                await check('Listes → 🛠️ Métiers anciens, 🌍 Le monde autour ; Chronologie', async () => {
                    await page.evaluate(() => { window.LCNDA_APP.state.listType = 'old_trades'; window.LCNDA_APP.setModule('listes'); });
                    await page.waitForSelector('.h-tr-row'); await page.fill('[data-tr-q]', 'sabot'); await page.waitForFunction(() => document.querySelectorAll('.h-tr-row').length >= 1 && document.querySelectorAll('.h-tr-row').length < 10);
                    if (shots) await page.screenshot({ path: path.join(shots, 'liste-metiers.png') });
                    await page.evaluate(() => { window.LCNDA_APP.state.listType = 'world_events'; window.LCNDA_APP.setModule('listes'); });
                    await page.waitForSelector('.h-world-page .h-world-row'); await page.fill('[data-world-q]', 'choléra');
                    await page.waitForFunction(() => [...document.querySelectorAll('.h-world-row')].every(r => /chol/i.test(r.textContent)));
                    if (shots) await page.screenshot({ path: path.join(shots, 'liste-monde.png') });
                    await page.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.state.timeline.history = true; A.setModule('chronologie'); });
                    await page.waitForFunction(() => document.querySelector('.historical-timeline')?.textContent.includes('Jean a 38 ans'), null, { timeout: 15000 });
                    if (shots) await page.screenshot({ path: path.join(shots, 'chronologie.png') });
                });
            }
            await check(`[${tag}] aucune erreur de page`, async () => assert.deepEqual(errors, []));
            await ctx.close();
        }
    } finally { await browser?.close(); proc.kill(); }
    const failed = results.filter(r => !r[1]).length;
    console.log(`\n${results.length - failed}/${results.length} réussis`);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
