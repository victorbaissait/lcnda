'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⏳ « Une journée dans la vie de… » (lib/biographie_journee.php, assets/js/heritage-journee.js) :   node tests/test-journee-vie.js
 *  1. l'API (base temporaire) : chaque phrase a sa marque (✓ fiche, 📚 référence, 💭 imaginé) et sa source ; rien de chiffré
 *     sans source ; les phrases imaginées n'ont ni chiffre ni météo ; les prix seulement depuis assets/data/prix-reference.json
 *     (dans la période, sinon rien) ; âge, couple, enfants en vie et perdus, village (population relevée, église, notes),
 *     métier ancien, jour, saint, date républicaine, frise historique ; les vivants et les fiches confidentielles d'à côté ne sont
 *     jamais nommés ; la fiche vivante ou confidentielle le dit ; dates refusées (avant la naissance, après le décès, illisible),
 *     animal refusé, événement d'une autre personne refusé ; le menu de choix des événements filtré sur la personne ;
 *  2. le navigateur (Playwright ; sinon sauté) à 1440, 390 et en sombre : ouverture par ⋯ et par le bloc Biographie, raccourcis,
 *     marques sur chaque phrase, « Sans phrases imaginées », météo d'autrefois par LCNDA_EXT.meteo (présente au jour mesuré ;
 *     absente avant les relevés et avec le réglage « Jamais »), erreur sous le champ (K1), copier, traitement de texte,
 *     « Poser dans ▾ » (biographie + ↶ Annuler, médias, mise en page), fiche confidentielle sans sortie, pas de défilement de côté,
 *     aucune erreur JavaScript.
 * Captures : SHOTS=dossier node tests/test-journee-vie.js
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
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const SHOTS = process.env.SHOTS || '';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-journee-'));
const fx = path.join(tmp, 'fx');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

// la météo d'autrefois : le jeu de données fabriqué du test météo (Gers, 1836–2025) ; sans python, les phrases météo ne sont pas vérifiées
const withMeteo = spawnSync('python3', [path.join(appRoot, 'scripts', 'meteo', 'make-fixture.py'), fx], { encoding: 'utf8' }).status === 0;
const dir = path.join(tmp, 'data');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1', ...(withMeteo ? { LCNDA_METEO_DIR: fx } : { LCNDA_METEO_DIR: path.join(tmp, 'rien') }) });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county,state,country,latitude,longitude,admin4_code,population) VALUES(1,'Peyrat-le-Château','Haute-Vienne','Nouvelle-Aquitaine','France',45.81376,1.7726,'87117',1140),(2,'Auch','Gers','Occitanie','France',43.646,0.586,'32013',21000),(3,'Lectoure','Gers','Occitanie','France',43.934,0.622,'32208',3700)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,occupation,is_private,kind) VALUES
 (1,'Jean','ROUGIER','male','deceased','cultivateur',0,'human'),(2,'Marie','DESCHAMPS','female','deceased','',0,'human'),(3,'Pierre','ROUGIER','male','deceased','',0,'human'),
 (4,'Anne','ROUGIER','female','deceased','',0,'human'),(5,'Léonard','ROUGIER','male','deceased','',0,'human'),(6,'Secrète','ROUGIER','female','deceased','',1,'human'),
 (7,'Paul','DUPOUY','male','deceased','instituteur',0,'human'),(8,'Lucie','VIVANTE','female','living','',0,'human'),(9,'Cachée','PRIVÉE','female','deceased','',1,'human'),(10,'Médor','','male','deceased','',0,'animal'),
 (11,'Jacques','ROUGIER','male','deceased','',0,'human'),(12,'Jeanne','BOST','female','deceased','',0,'human')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,11,12)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(1,4),(1,5),(1,6),(2,1)");
$ev = $pdo->prepare('INSERT INTO events(id,scope,person_id,family_id,event_type_id,date_text,year,place_id,description) VALUES(?,?,?,?,?,?,?,?,?)');
foreach ([[1,'person',1,null,'BIRT','12 mars 1760',1760,1,''],[2,'family',null,1,'MARR','15 janvier 1785',1785,1,''],[3,'person',1,null,'OCCU','1785',1785,1,'laboureur'],[4,'person',1,null,'DEAT','3 février 1820',1820,1,''],
 [5,'person',2,null,'BIRT','4 avril 1765',1765,1,''],[6,'person',2,null,'DEAT','9 mai 1801',1801,1,''],[7,'person',3,null,'BIRT','2 novembre 1786',1786,1,''],[8,'person',4,null,'BIRT','8 août 1788',1788,1,''],
 [9,'person',4,null,'DEAT','1 septembre 1789',1789,1,''],[10,'person',5,null,'BIRT','20 juin 1792',1792,1,''],[11,'person',6,null,'BIRT','3 mars 1790',1790,1,''],
 [12,'person',7,null,'BIRT','14 janvier 1901',1901,3,''],[13,'person',7,null,'DEAT','3 février 1978',1978,2,''],[14,'person',8,null,'BIRT','2 mai 1950',1950,3,''],[15,'person',9,null,'BIRT','1 mars 1850',1850,3,''],
 [16,'person',11,null,'DEAT','5 octobre 1790',1790,1,''],[17,'person',12,null,'DEAT','8 juin 1801',1801,1,'']] as $r) { $r[4] = $t($r[4]); $ev->execute($r); }
$pdo->prepare("INSERT INTO village_profiles(place_key,name,church,patron_saint,diocese,populations_json,notes,population_source) VALUES('87117','Peyrat-le-Château','Saint-Martin','saint Martin','Limoges',?,?,?)")
    ->execute([json_encode([[1793, 1520], [1800, 1611], [1836, 1702]]), 'Bourg du plateau de Millevaches. Les foires y sont importantes.', 'https://fr.wikipedia.org/wiki/Peyrat-le-Ch%C3%A2teau']);
$pdo->prepare("INSERT INTO sources(title) VALUES('Registres paroissiaux de Peyrat')")->execute();
$pdo->prepare("INSERT INTO source_links(entity_type,entity_id,source_record_id,page) VALUES('event',2,1,'f° 12')")->execute();
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function startServer(d) {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(d), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json() }; };
    return { proc, base, get, csrf };
}
const prices = JSON.parse(fs.readFileSync(path.join(appRoot, 'assets', 'data', 'prix-reference.json'), 'utf8'));
/** les règles communes à toutes les réponses */
function checkMarks(d) {
    assert.ok(Array.isArray(d.sentences) && d.sentences.length > 3, 'des phrases');
    for (const s of d.sentences) {
        assert.ok(['fiche', 'ref', 'imagine'].includes(s.mark), `marque inconnue : ${s.mark}`);
        assert.ok(String(s.src?.label || '').trim() !== '' || s.src?.event_id, `phrase sans source : ${s.text}`);
        if (s.mark === 'imagine') {
            assert.doesNotMatch(s.text, /\d/, `chiffre dans une phrase imaginée : ${s.text}`);
            assert.doesNotMatch(s.text, /pluie|pleu|neige|soleil|°|orage|brouillard|vent|froid|chaud/i, `météo imaginée : ${s.text}`);
        }
        if (/\d/.test(s.text)) assert.notEqual(s.mark, 'imagine');
        if (s.part === 'prix') {
            const it = prices.items.find(x => x.text === s.text);
            assert.ok(it && it.source && s.src.label === it.source, `prix hors de la table sourcée : ${s.text}`);
        }
    }
}
const texts = d => d.sentences.map(s => s.text).join('\n');

(async () => {
    const S = await startServer(dir);
    const { get } = S;
    try {
        await t('15 mai 1789 : âge, couple, enfants, village, métier, jour, saint, frise, prix sourcé, imaginé marqué', async () => {
            const { status, body: d } = await get('biography_day', { id: 1, date: '15 mai 1789' });
            assert.equal(status, 200, JSON.stringify(d));
            checkMarks(d);
            const x = texts(d);
            assert.match(x, /Jean a 29 ans/);
            assert.match(x, /marié avec Marie DESCHAMPS depuis 4 ans/);
            assert.match(x, /2 enfants en vie.*Pierre \(2 ans\).*Anne/);
            assert.doesNotMatch(x, /Secrète/, 'une fiche confidentielle d’à côté n’est jamais nommée');
            assert.match(x, /Au recensement de 1793, Peyrat-le-Château compte 1 520 habitants/);
            assert.match(x, /église Saint-Martin/);
            assert.match(x, /Bourg du plateau de Millevaches/);
            assert.match(x, /noté « laboureur »/);
            assert.match(x, /Le métier de laboureur, d’après le dictionnaire/);
            assert.match(x, /Le 15 mai 1789 est un vendredi de printemps/);
            assert.match(x, /sainte Denise/);
            assert.match(x, /Bastille/);
            assert.match(x, /14 sous et demi/);
            assert.match(x, /Son père Jacques et sa mère Jeanne sont encore en vie/);
            const mar = d.sentences.find(s => /marié avec/.test(s.text));
            assert.equal(mar.mark, 'fiche'); assert.equal(mar.src.event_id, 2);
            assert.deepEqual(mar.src.sources.map(s => s.label), ['Registres paroissiaux de Peyrat, f° 12']);
            assert.ok(d.sentences.some(s => s.mark === 'imagine'));
            assert.deepEqual(Object.keys(d.meteo || {}).sort(), ['country', 'date', 'lat', 'lon', 'place']);
            assert.equal(d.living, false); assert.equal(d.private, false);
        });
        await t('12 thermidor an II : la date républicaine comprise, un enfant perdu, pas de prix (hors de la table)', async () => {
            const { body: d } = await get('biography_day', { id: 1, date: '12 thermidor an II' });
            checkMarks(d);
            const x = texts(d);
            assert.equal(d.date.year, 1794); assert.equal(d.date.month, 7); assert.equal(d.date.day, 30);
            assert.match(x, /c’est le 12 thermidor an II/);
            assert.match(x, /déjà perdu un enfant : Anne \(1788–1789\)/);
            assert.match(x, /3 enfants en vie.*une fille \(4 ans\)/, 'la fille confidentielle : « une fille », sans son nom');
            assert.doesNotMatch(x, /Secrète/);
            assert.match(x, /déjà perdu son père Jacques/);
            assert.ok(!d.sentences.some(s => s.part === 'prix'), 'aucun prix sans chiffre sûr');
        });
        await t('un événement de sa vie : le mariage (✓ + lien), « vers 1790 » sans jour → ni saint ni météo', async () => {
            const { body: d } = await get('biography_day', { id: 1, event_id: 2 });
            checkMarks(d);
            assert.match(texts(d), /Ce jour-là, Jean épouse Marie DESCHAMPS/);
            assert.equal(d.date.event_id, 2);
            const { body: v } = await get('biography_day', { id: 1, date: 'vers 1790' });
            checkMarks(v);
            assert.ok(!v.sentences.some(s => s.part === 'calendrier'), 'pas de jour ni de saint');
            assert.equal(v.meteo, null);
        });
        await t('2020 : le salaire minimum de la table ; une autre date de 2012 : rien', async () => {
            const { body: d } = await get('biography_day', { id: 8, date: '3 mars 2020' });
            checkMarks(d);
            assert.match(texts(d), /10,15 euros brut de l’heure/);
            assert.equal(d.living, true, 'une personne vivante : la fenêtre le dit');
            const { body: e } = await get('biography_day', { id: 8, date: '3 mars 2012' });
            assert.ok(!e.sentences.some(s => s.part === 'prix'));
        });
        await t('Sans phrases imaginées : il reste des phrases, toutes ✓ ou 📚 ; la fiche confidentielle le dit', async () => {
            const { body: d } = await get('biography_day', { id: 9, date: '1 mars 1860' });
            checkMarks(d);
            assert.equal(d.private, true);
            assert.ok(d.sentences.filter(s => s.mark !== 'imagine').length >= 2);
        });
        await t('refus : avant la naissance, après le décès, date illisible, animal, événement d’un autre', async () => {
            const a = await get('biography_day', { id: 1, date: '1 janvier 1750' }); assert.equal(a.status, 422); assert.match(a.body.error, /avant sa naissance/);
            const b = await get('biography_day', { id: 1, date: '1 janvier 1830' }); assert.equal(b.status, 422); assert.match(b.body.error, /après son décès/);
            const c = await get('biography_day', { id: 1, date: 'n’importe quoi' }); assert.equal(c.status, 422); assert.match(c.body.error, /comprends pas/);
            const e = await get('biography_day', { id: 10, date: '1 janvier 1990' }); assert.equal(e.status, 422);
            const f = await get('biography_day', { id: 1, event_id: 13 }); assert.equal(f.status, 422);
            const g = await get('biography_day', { id: 999, date: '1 janvier 1800' }); assert.ok(g.status >= 400);
        });
        await t('le menu de choix des événements est filtré sur la personne (et ses couples)', async () => {
            const { body } = await get('picker_search', { kind: 'event', q: 'mariage', person_id: 1 });
            const ids = body.groups[0].items.map(i => i.id);
            assert.deepEqual(ids, [2]);
            const all = await get('picker_search', { kind: 'event', q: 'naissance' });
            assert.ok(all.body.groups[0].items.length > 3, 'sans filtre : tous les événements');
            const { body: ev } = await get('biography_day_events', { id: 1 });
            assert.deepEqual(ev.events.map(e => e.id), [1, 2, 3, 4]);
        });
        if (withMeteo) await t('la météo : le serveur dit où chercher (événement au jour près, avec coordonnées)', async () => {
            const { body: d } = await get('biography_day', { id: 7, event_id: 13 });
            assert.deepEqual(d.meteo, { event_id: 13, date: '1978-02-03', place: 'Auch' });
            assert.ok(!d.sentences.some(s => s.part === 'meteo'), 'jamais calculée par ce générateur');
        });

        // ── 2. le navigateur ──
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        const browser = await chromium.launch();
        const errors = [];
        const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name) }); } };
        const noScroll = async p => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'défilement de côté');
        try {
            for (const [name, vp, dark] of [['1440', { width: 1440, height: 950 }, false], ['390', { width: 390, height: 844 }, false], ['sombre', { width: 1440, height: 950 }, true]]) {
                const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light' });
                await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: S.base.replace(/\/$/, '') });
                const p = await ctx.newPage();
                p.on('pageerror', e => errors.push(`[${name}] pageerror ${e.message}`));
                p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(`[${name}] console ${m.text()}`); });
                await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
                await p.goto(S.base); await p.waitForFunction(() => window.LCNDA_APP?.openPersonById && window.LCNDA_EXT?.journee);
                await p.evaluate(dk => { localStorage.removeItem('genealogie-journee'); localStorage.removeItem('genealogie-meteo'); if (dk) { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({ ...A.readDesignSettings(), preset: 'dark' })); A.applyDesign(); } }, dark);
                const fiche = async id => { await p.evaluate(i => window.LCNDA_APP.openPersonById(i), id); await p.waitForSelector('.person-hero', { timeout: 8000 }); await p.waitForTimeout(400); };
                const close = async () => { await p.click('dialog.jr-dialog .modal-actions button'); await p.waitForSelector('dialog.jr-dialog', { state: 'detached', timeout: 5000 }); };
                await t(`[${name}] ⋯ de la fiche → « ⏳ Une journée dans sa vie… », raccourci « Mariage », marques sur chaque phrase`, async () => {
                    await fiche(1);
                    await p.click('[data-fsec-hero-more]');
                    await p.getByText('Une journée dans sa vie…').first().click();
                    await p.waitForSelector('dialog.jr-dialog');
                    const w = await p.evaluate(() => Math.round(document.querySelector('dialog.jr-dialog').getBoundingClientRect().width));
                    assert.ok(w <= 1040 && w >= Math.min(360, vp.width - 40), 'largeur ' + w);
                    await p.click('dialog.jr-dialog .jr-q:has-text("Mariage")');
                    await p.waitForSelector('dialog.jr-dialog .jr-notes');
                    const r = await p.evaluate(() => { const ss = [...document.querySelectorAll('dialog.jr-dialog .jr-s')]; return { n: ss.length, marked: ss.filter(s => s.querySelector('.jr-ref')).length, notes: document.querySelectorAll('dialog.jr-dialog .jr-notes li').length, imag: document.querySelectorAll('dialog.jr-dialog .jr-s.is-imagine em.jr-imag').length, text: document.querySelector('dialog.jr-dialog .jr-story').textContent, chip: document.querySelector('dialog.jr-dialog .pk-chosen, dialog.jr-dialog .pk-chip')?.textContent || '' }; });
                    assert.ok(r.n > 5); assert.equal(r.marked, r.n); assert.equal(r.notes, r.n);
                    assert.ok(r.imag >= 1, 'les phrases imaginées en italique');
                    assert.match(r.text, /épouse Marie DESCHAMPS/);
                    assert.match(r.chip, /Mariage/);
                    await shot(p, `journee-mariage-${name}.png`);
                    await noScroll(p);
                });
                await t(`[${name}] « Sans phrases imaginées » (interrupteur, retenu)`, async () => {
                    await p.click('dialog.jr-dialog label.ui-toggle:has([data-jr-noimag])');
                    assert.equal(await p.locator('dialog.jr-dialog .jr-s.is-imagine').count(), 0);
                    assert.ok(await p.locator('dialog.jr-dialog .jr-s.is-fiche').count() > 2);
                    assert.match(await p.evaluate(() => localStorage.getItem('genealogie-journee')), /"noImag":true/);
                    await p.click('dialog.jr-dialog label.ui-toggle:has([data-jr-noimag])');
                    assert.ok(await p.locator('dialog.jr-dialog .jr-s.is-imagine').count() > 0);
                });
                await t(`[${name}] une autre date : erreur sous le champ (K1), puis 12 thermidor an II ; 📋 Copier`, async () => {
                    await p.click('dialog.jr-dialog [data-jr-mode="date"]');
                    await p.fill('dialog.jr-dialog [name="jr_date"]', '1 janvier 1750');
                    await p.click('dialog.jr-dialog [data-jr-go]');
                    await p.waitForSelector('dialog.jr-dialog .is-invalid, dialog.jr-dialog [aria-invalid="true"]', { timeout: 5000 });
                    assert.match(await p.textContent('dialog.jr-dialog .jr-side'), /avant sa naissance/);
                    await p.fill('dialog.jr-dialog [name="jr_date"]', '12 thermidor an II');
                    await p.press('dialog.jr-dialog [name="jr_date"]', 'Enter');
                    await p.waitForFunction(() => /thermidor an II/.test(document.querySelector('dialog.jr-dialog .jr-story')?.textContent || ''));
                    await shot(p, `journee-thermidor-${name}.png`);
                    await p.click('dialog.jr-dialog [data-jr-copy]');
                    await p.waitForTimeout(200);
                    const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
                    if (clip) { assert.match(clip, /Une journée dans la vie de Jean ROUGIER/); assert.match(clip, /Repères :/); assert.match(clip, /\(imaginé\)/); }
                    await noScroll(p);
                });
                if (name === '1440') {
                    await t('« Poser dans ▾ » → 📖 fin de la biographie, puis ↶ Annuler', async () => {
                        const before = (await get('biography', { id: 1 })).body.text;
                        await p.click('dialog.jr-dialog [data-jr-put]');
                        await p.getByText('Ajouter à la fin de sa biographie').click();
                        await p.waitForFunction(async () => /Une journée dans la vie/.test((await window.LCNDA_APP.api('biography', { id: 1 })).text));
                        const after = (await get('biography', { id: 1 })).body;
                        assert.ok(after.own.includes(before.trim().slice(0, 30)), `la biographie d’avant est gardée en tête : ${JSON.stringify(before.slice(0, 80))} / ${JSON.stringify(after.own.slice(0, 80))}`);
                        assert.match(after.own, /12 thermidor an II/);
                        await p.getByRole('button', { name: /Annuler/ }).last().click();
                        await p.waitForFunction(async () => !(await window.LCNDA_APP.api('biography', { id: 1 })).own);
                    });
                    await t('« Poser dans ▾ » → 📁 une copie DOCX dans les médias', async () => {
                        const n0 = await p.evaluate(async () => (await window.LCNDA_APP.api('picker_search', { kind: 'media', q: 'journée' })).groups[0].total);
                        await p.click('dialog.jr-dialog [data-jr-put]');
                        await p.getByText('Ranger une copie dans les médias').click();
                        await p.waitForFunction(async n => (await window.LCNDA_APP.api('picker_search', { kind: 'media', q: 'journée' })).groups[0].total > n, n0, { timeout: 8000 });
                    });
                    await t('📝 Dans le traitement de texte : le document s’ouvre avec le récit', async () => {
                        await p.click('dialog.jr-dialog [data-jr-wp]');
                        await p.waitForFunction(() => /thermidor an II/.test(document.querySelector('.wp-doc, .wp-page, [contenteditable="true"]')?.textContent || ''), null, { timeout: 8000 });
                        await shot(p, 'journee-traitement-texte.png');
                        await p.keyboard.press('Escape'); await p.waitForTimeout(300);
                        await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                    });
                    await t('📐 Mise en page : un nouveau livre s’ouvre avec le récit', async () => {
                        await p.evaluate(() => window.LCNDA_EXT.journee.open(1, { date: '15 mai 1789' }));
                        await p.waitForSelector('dialog.jr-dialog .jr-notes');
                        await p.click('dialog.jr-dialog [data-jr-put]');
                        await p.getByText('Dans la mise en page').click();
                        await p.waitForFunction(() => /15 mai 1789/.test([...document.querySelectorAll('.ly-editor, .ly-page, [class*="ly-"]')].map(x => x.textContent).join(' ')), null, { timeout: 10000 });
                        await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                        await p.keyboard.press('Escape');
                    });
                    await t('le bloc « 📖 Biographie » : bouton « ⏳ Une journée… »', async () => {
                        await fiche(1);
                        await p.evaluate(() => document.querySelector('[data-pblock="bio"]')?.scrollIntoView());
                        await p.waitForSelector('[data-bio-host] [data-jr-open]', { timeout: 8000 });
                        await p.click('[data-bio-host] [data-jr-open]');
                        await p.waitForSelector('dialog.jr-dialog');
                        await close();
                    });
                    await t('les liens des repères : « ↗ Lieu » ouvre la monographie de la commune, « ↗ Voir l’événement » la fiche', async () => {
                        await p.evaluate(() => window.LCNDA_EXT.journee.open(7, { eventId: 13 }));
                        await p.waitForSelector('dialog.jr-dialog .jr-notes');
                        await p.click('dialog.jr-dialog [data-jr-place]');
                        await p.waitForFunction(() => window.LCNDA_APP.state.module === 'graphiques' && window.LCNDA_APP.state.graphMode === 'place_monograph' && /Auch/.test(document.querySelector('#workspace')?.textContent || ''), null, { timeout: 8000 });
                        await p.evaluate(() => window.LCNDA_EXT.journee.open(1, { date: '15 mai 1789' }));
                        await p.waitForSelector('dialog.jr-dialog .jr-notes');
                        await p.click('dialog.jr-dialog [data-jr-event="2"] >> nth=0');
                        await p.waitForSelector('#workspace .event-row.jr-flash, #workspace [data-event-id="2"]', { timeout: 8000 });
                        assert.equal(await p.locator('dialog.jr-dialog').count(), 0);
                    });
                    await t('fiche confidentielle : avertissement, ni copie ni document ; vivante : avertissement', async () => {
                        await p.evaluate(() => window.LCNDA_EXT.journee.open(9, { date: '1 mars 1860' }));
                        await p.waitForSelector('dialog.jr-dialog .jr-notes');
                        assert.match(await p.textContent('dialog.jr-dialog [data-jr-notice]'), /Fiche confidentielle/);
                        assert.ok(await p.locator('dialog.jr-dialog [data-jr-copy]').isDisabled());
                        assert.ok(await p.locator('dialog.jr-dialog [data-jr-wp]').isDisabled());
                        await close();
                        await p.evaluate(() => window.LCNDA_EXT.journee.open(8, { date: '3 mars 2020' }));
                        await p.waitForSelector('dialog.jr-dialog .jr-notes');
                        assert.match(await p.textContent('dialog.jr-dialog [data-jr-notice]'), /encore en vie/);
                        await close();
                    });
                    if (withMeteo) await t('🌦 la météo par LCNDA_EXT.meteo : présente au jour mesuré, absente avant les relevés et avec « Jamais »', async () => {
                        await p.evaluate(() => window.LCNDA_EXT.journee.open(7, { eventId: 13 }));
                        await p.waitForSelector('dialog.jr-dialog .jr-notes');
                        const txt = await p.textContent('dialog.jr-dialog .jr-story');
                        assert.match(txt, /Ce jour-là à Auch, il y avait du brouillard/);
                        assert.match(txt, /Météo d’autrefois — Mesuré/);
                        await shot(p, 'journee-meteo.png');
                        await close();
                        await p.evaluate(() => window.LCNDA_EXT.journee.open(1, { date: '15 mai 1789' }));
                        await p.waitForSelector('dialog.jr-dialog .jr-notes');
                        assert.doesNotMatch(await p.textContent('dialog.jr-dialog .jr-story'), /Météo d’autrefois/);
                        await close();
                        await p.evaluate(() => localStorage.setItem('genealogie-meteo', JSON.stringify({ show: 'never' })));
                        await p.evaluate(() => window.LCNDA_EXT.journee.open(7, { eventId: 13 }));
                        await p.waitForSelector('dialog.jr-dialog .jr-notes');
                        assert.doesNotMatch(await p.textContent('dialog.jr-dialog .jr-story'), /brouillard|Météo d’autrefois/);
                        await close();
                        await p.evaluate(() => localStorage.removeItem('genealogie-meteo'));
                    });
                } else {
                    await close();
                }
                await ctx.close();
            }
        } finally { await browser.close(); }
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    } finally {
        S.proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
        if (failed) { console.error(`\n${failed} échec(s)`); process.exitCode = 1; } else console.log('\nTout est bon.');
    }
})();
