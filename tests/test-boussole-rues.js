#!/usr/bin/env node
/* 🧭🗞️📍 Boussole, jours et rues (lib/boussole_rues.php, assets/js/heritage-boussole-rues.js, assets/css/boussole-rues.css,
 * données assets/data/br-gufm1.json.gz, br-igrf.json.gz, br-paris.json.gz).
 * Le réseau (Wikipédia en français) est remplacé par des réponses VRAIES enregistrées une fois (tests/fixtures/boussole-rues/,
 * GENEALOGY_TEST=1 + LCNDA_TEST_BR_DIR). Un fichier absent = hors ligne.
 *  0. Node : la déclinaison calculée (gufm1 puis IGRF) comparée aux valeurs connues de Paris et de Londres, et gufm1 comparé à
 *     l'IGRF (deux modèles indépendants) de 1900 à 1990 ; les anciens noms des rues de Paris ;
 *  1. serveur : br_day (le jour exact, sinon le mois ; lien vers la partie de la page ; gardé ; hors ligne), br_person (dates au
 *     jour près seulement), br_places, br_cache_clear / restore ;
 *  2. écran : fiche de personne (🗞️ 🧭 📍), fiche d'un village, convertisseur d'autrefois (onglet 🧭 Boussole), éditeur de cartes
 *     (rose des vents tournée, ↶), plan des adresses (Paris), monographie, dataSources, dataLists, Réglages.
 *   node tests/test-boussole-rues.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const BR = require('../assets/js/heritage-boussole-rues.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FX = path.join(__dirname, 'fixtures/boussole-rues');
const data = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `br-${n}.json.gz`))).toString('utf8'));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what} : ${a.toFixed(2)} au lieu de ${b} (± ${tol})`);

(async () => {
    const G = data('gufm1'), I = data('igrf'), P = data('paris');
    const D = (la, lo, y) => BR.declination(G, I, la, lo, y).d;
    const PARIS = [48.836, 2.336], LONDON = [51.5, -0.12];

    /* ═════════ 0. les calculs ═════════ */
    await t('données livrées : moins de 15 Mo ; gufm1 = 36 512 nombres (degré 14, 163 B-splines, comme dans l’article) ; IGRF-14 1900-2025', async () => {
        const files = fs.readdirSync(path.join(root, 'assets/data')).filter(f => /^br-.*\.json\.gz$/.test(f));
        const total = files.reduce((n, f) => n + fs.statSync(path.join(root, 'assets/data', f)).size, 0);
        console.log(`   ${files.length} fichiers, ${(total / 1e6).toFixed(2)} Mo`);
        assert.ok(total < 15e6);
        assert.strictEqual(G.lmax, 14); assert.strictEqual(G.nspl, 163); assert.strictEqual(G.spl.length * G.spl[0].length, 36512);
        assert.strictEqual(G.knots[0], 1582.5); assert.strictEqual(G.md5, 'd3ad5c7c1f956e93de77520d59ddc94e');
        assert.strictEqual(I.epochs[0], 1900); assert.strictEqual(I.epochs.at(-1), 2025); assert.strictEqual(I.g[0][0], -31543, 'g10 de 1900 dans igrf14coeffs.txt');
        assert.ok(P.streets.length > 6000 && P.old.length > 8000 && P.licence === 'ODbL 1.0' && /opendata\.paris\.fr/.test(P.url_old));
        for (const d of [G, I, P]) assert.ok(d.src && d.built);
    });
    await t('🧭 Paris : l’aiguille passe par le vrai nord vers 1666 et s’écarte le plus vers 1814 (22°34′ à l’ouest mesurés à l’Observatoire)', async () => {
        // valeurs classiques des séries anciennes (Paris : Alexandrescu, Courtillot et Le Mouël, J. Geophys. Res. 101, 1996, « Geomagnetic field direction in
        // Paris since the mid-sixteenth century » ; Londres : Malin et Bullard, Phil. Trans. R. Soc. A 299, 1981) : Paris 0° vers 1666, 22°34′ O en 1814,
        // environ 11° E vers 1580-1590 ; Londres 0° en 1659, environ 24° O vers 1820. gufm1 a été construit à partir de ces mesures (entre autres).
        near(D(...PARIS, 1666), 0, 1, 'Paris 1666');
        near(D(...PARIS, 1814), -22.57, 0.7, 'Paris 1814');
        near(D(...PARIS, 1590), 11.5, 1.5, 'Paris 1590');
        // le maximum vers l'ouest : entre 1805 et 1830
        const ys = Array.from({length: 120}, (_, i) => 1760 + i); const yMax = ys.reduce((a, b) => (D(...PARIS, b) < D(...PARIS, a) ? b : a));
        assert.ok(yMax >= 1805 && yMax <= 1830, `maximum en ${yMax}`);
    });
    await t('🧭 Londres : 0° vers 1659, environ 24° à l’ouest vers 1820 (série de Londres)', async () => {
        near(D(...LONDON, 1659), 0, 1, 'Londres 1659');
        near(D(...LONDON, 1820), -24.3, 0.8, 'Londres 1820');
    });
    await t('🧭 deux modèles indépendants d’accord : gufm1 et IGRF de 1900 à 1990, à moins d’un demi-degré (Paris, Tulle, Boston, Le Cap)', async () => {
        for (const [la, lo] of [PARIS, [45.267, 1.767], [42.36, -71.06], [-33.92, 18.42]]) for (const y of [1900, 1920, 1945, 1970, 1990]) {
            const a = BR.fieldAt(BR.gufmAt(G, y), 14, la, lo).D, b = BR.fieldAt(BR.igrfAt(I, y), 13, la, lo).D;
            near(a, b, 0.5, `${la},${lo} en ${y}`);
        }
        // et pas de saut au passage de gufm1 à l'IGRF (1890-1900)
        for (let y = 1885; y <= 1905; y++) assert.ok(Math.abs(D(...PARIS, y + 1) - D(...PARIS, y)) < 0.35, `saut en ${y}`);
        assert.strictEqual(BR.declination(G, I, ...PARIS, 1500), null, 'trop tôt'); assert.strictEqual(BR.declination(G, I, ...PARIS, 2040), null, 'trop tard');
        assert.strictEqual(BR.declination(G, I, ...PARIS, 1850).model, 'gufm1'); assert.strictEqual(BR.declination(G, I, ...PARIS, 1950).model, 'IGRF-14');
    });
    await t('🧭 la phrase : « En 1810 à Tulle, l’aiguille de la boussole pointait à 22° à l’ouest du vrai nord. »', async () => {
        const r = BR.declination(G, I, 45.2667, 1.7667, 1810);
        assert.strictEqual(BR.declSentence(r, 'Tulle'), 'En 1810 à Tulle, l’aiguille de la boussole pointait à 22° à l’ouest du vrai nord.');
        assert.strictEqual(BR.declText(-0.2), 'presque exactement vers le vrai nord'); assert.strictEqual(BR.declText(3.4), '3° à l’est du vrai nord');
    });
    await t('📍 adresses : « 12 bis, rue de la Paix, Paris 2e » ; clés de rue (« R. » = « rue », sans accents ni petits mots)', async () => {
        assert.deepStrictEqual(BR.parseAddress('12 bis, rue de la Paix, Paris 2e'), {house: '12 bis', street: 'rue de la Paix', arr: 2});
        assert.deepStrictEqual(BR.parseAddress('Bd Haussmann'), {house: '', street: 'Bd Haussmann', arr: 0});
        assert.strictEqual(BR.parseAddress('Tulle'), null);
        assert.strictEqual(BR.streetKey('R. de l’Empereur'), BR.streetKey("rue de l'Empereur"));
        assert.ok(BR.inParis({place: 'Paris 18e'}) && BR.inParis({insee: '75118'}) && !BR.inParis({place: 'Paris, Texas'}) && !BR.inParis({place: 'Tulle'}));
    });
    await t('📍 Paris : rue Esclangon s’appelait passage Ornano jusqu’en 1965 ; rue de l’Empereur = rue Lepic depuis 1864 (Ville de Paris)', async () => {
        const a = BR.parisStreetAt(P, 'rue Esclangon', 1930);
        assert.strictEqual(a.kind, 'renamed'); assert.strictEqual(a.old.n, 'passage Ornano'); assert.strictEqual(a.until, 1965);
        const src = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data/br-paris.json.gz'))));
        assert.match(src.old.find(o => o.n === 'passage Ornano').h, /Dénommée rue Esclangon par arrêté préfectoral du 22 juin 1965/);
        assert.strictEqual(BR.parisStreetAt(P, 'rue Esclangon', 1970).kind, 'same');
        const b = BR.parisStreetAt(P, "rue de l'Empereur", 1850, 18);
        assert.strictEqual(b.kind, 'old'); assert.strictEqual(b.street.n, 'rue Lepic'); assert.strictEqual(b.until, 1864);
        assert.strictEqual(BR.parisStreetAt(P, 'rue de Rivoli', 1850).kind, 'same');
        assert.strictEqual(BR.parisStreetAt(P, 'rue qui n’existe pas', 1850), null);
        assert.match(BR.parisUrl(P, 'old', 'passage Ornano'), /^https:\/\/opendata\.paris\.fr\/explore\/dataset\/denominations-des-voies-caduques\/table\/\?q=/);
    });

    /* ═════════ le serveur et l'écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-br-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.cpSync(FX, net0, {recursive: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_BR_DIR: net0};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Paul','DURAND','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.2667,1.7667,'19272'),(2,'Paris','Paris','France',48.8566,2.3522,'75056')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,sort_date,place_id,address) VALUES(?,?,?,?,?,?,?,?,?)");
$ins->execute(['person',1,null,$t('BIRT'),'12 février 1852',1852,'1852-02-12',1,'']);
$ins->execute(['family',null,1,$t('MARR'),'12 février 1866',1866,'1866-02-12',2,'']);
$ins->execute(['person',1,null,$t('RESI'),'1930',1930,'1930',2,'12, rue Esclangon']);
$ins->execute(['person',1,null,$t('DEAT'),'vers 1935',1935,'1935',2,'']);
$ins->execute(['person',3,null,$t('BIRT'),'1880',1880,'1880',1,'']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore ce fichier : on l'ajoute (comme le fera la balise)
        if (!await p.evaluate(() => !!window.LCNDA_EXT?.boussoleRues)) { await p.addStyleTag({url: base + 'assets/css/boussole-rues.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-boussole-rues.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.boussoleRues, null, {timeout: 10000});
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        /* ═════════ 1. le serveur ═════════ */
        await t('🗞️ br_day 12 février 1866 : la ligne « 1866 » de la page « 12 février » (partie XIXe siècle), lien vers la partie, CC BY-SA 4.0', async () => {
            const r = await api('br_day', {date: '1866-02-12'});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.strictEqual(r.label, '12 février 1866');
            const d = r.day.find(x => x.page === '12 février');
            assert.ok(d, JSON.stringify(r.day).slice(0, 300));
            assert.match(d.t, /Napoléon III/); assert.ok(!/^1866/.test(d.t), 'sans l’année devant');
            assert.match(d.url, /^https:\/\/fr\.wikipedia\.org\/wiki\/12_f%C3%A9vrier#XIXe_si%C3%A8cle$/);
            const html = JSON.parse(fs.readFileSync(path.join(FX, fs.readdirSync(FX).find(f => /^wp_12_fevrier_s\d+\.json$/.test(f))), 'utf8')).parse.text.replace(/<[^>]+>/g, '').replace(/&#160;/g, ' ');
            assert.ok(html.includes(d.t.slice(1, 40)), 'le texte vient de la page');
            assert.strictEqual(r.licence, 'CC BY-SA 4.0'); assert.ok(r.sources.every(s => /action=history$/.test(s.history_url) && s.revid > 0));
            assert.ok(calls().every(c => /^wp_\S+ https:\/\/fr\.wikipedia\.org\/w\/api\.php\?/.test(c) && !/MAZAUD|LACOMBE/i.test(c)), 'seulement la date part sur Internet');
        });
        await t('🗞️ br_day 12 février 1852 : rien ce jour-là → les événements du mois (« Février 1852 »)', async () => {
            const r = await api('br_day', {date: '1852-02-12'});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.strictEqual(r.day.length, 0); assert.ok(r.month.length >= 3);
            assert.ok(r.month.every(m => m.page === 'Février 1852' && /^https:\/\/fr\.wikipedia\.org\/wiki\/F%C3%A9vrier_1852#/.test(m.url)));
            assert.ok(r.month.some(m => /Louis-Napoléon Bonaparte/.test(m.t)));
        });
        await t('🗞️ gardé sur l’ordinateur ; hors ligne : la réponse gardée, sinon un petit message ; une date mal écrite est refusée', async () => {
            const n = calls().length;
            assert.strictEqual((await api('br_day', {date: '1866-02-12'})).ok, true);
            assert.strictEqual(calls().length, n, 'pas de réseau la 2e fois');
            const r = await api('br_day', {date: '1790-07-14'});
            assert.strictEqual(r.ok, false); assert.strictEqual(r.offline, true); assert.match(r.message, /connexion/);
            assert.match((await api('br_day', {date: '12/02/1852'})).error || '', /1852-02-12/);
        });
        await t('br_person : dates au jour près seulement (« vers 1935 » écarté), mariage du couple, adresse, position des lieux', async () => {
            const r = await api('br_person', {id: 1});
            assert.strictEqual(r.ok, true);
            const by = tag => r.events.find(e => e.tag === tag);
            assert.strictEqual(by('BIRT').date, '1852-02-12'); assert.strictEqual(by('MARR').date, '1866-02-12');
            assert.strictEqual(by('DEAT').date, null); assert.strictEqual(by('RESI').address, '12, rue Esclangon'); assert.strictEqual(by('RESI').insee, '75056');
            assert.strictEqual(by('BIRT').lat, 45.2667);
            const pl = await api('br_places'); assert.deepStrictEqual(pl.places.map(x => x.name).sort(), ['Paris', 'Tulle']);
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('fiche de MAZAUD : 🗞️ « Le jour de son mariage (12 février 1866) : … », 🧭 « En 1852 à Tulle… », 📍 « passage Ornano jusqu’en 1965 »', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-br-person="1"] [data-br-line="jour"]:not([hidden])', {timeout: 20000});
            const txt = (await p.textContent('[data-pblock="boussole_rues"]')).replace(/\s+/g, ' ');
            assert.match(txt, /Le jour de son mariage \(12 février 1866\) : .*Napoléon III/);
            assert.match(txt, /Le jour de sa naissance \(12 février 1852\) — rien de noté ce jour-là, mais ce mois-là \(février 1852\)/);
            const r = BR.declination(G, I, 45.2667, 1.7667, 1852);
            assert.ok(txt.includes(BR.declSentence(r, 'Tulle')), txt.slice(0, 400));
            assert.match(txt, /Sa rue \(rue Esclangon, Paris\) s’appelait passage Ornano jusqu’en 1965\./);
            assert.match(txt, /CC BY-SA 4\.0/); assert.match(txt, /ODbL/); assert.match(txt, /gufm1/);
            const hrefs = await p.$$eval('[data-pblock="boussole_rues"] a', as => as.map(a => [a.href, a.target]));
            assert.ok(hrefs.some(([h]) => /fr\.wikipedia\.org\/wiki\/12_f%C3%A9vrier#XIXe/.test(h)) && hrefs.some(([h]) => /opendata\.paris\.fr/.test(h)) && hrefs.every(([, tg]) => tg === '_blank'));
            assert.ok(!await p.isVisible('[data-pblock="boussole_rues"] .br-more .br-list'), 'les détails sont repliés');
            if (process.env.BR_SHOTS) { await p.locator('[data-pblock="boussole_rues"]').scrollIntoViewIfNeeded(); await p.locator('[data-pblock="boussole_rues"]').screenshot({path: path.join(process.env.BR_SHOTS, 'fiche.png')}); }
        });
        await t('fiche de DURAND (né en 1880, rien au jour près, pas d’adresse) : le bloc ne montre que la boussole', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-br-person="3"] [data-br-line="boussole"]', {timeout: 20000});
            assert.strictEqual(await p.$('[data-br-person="3"] [data-br-line="jour"]'), null);
            assert.strictEqual(await p.$('[data-br-person="3"] [data-br-line="rues"]'), null);
        });
        await t('fiche d’un village (Tulle) : « 🧭 La boussole à travers le temps » (1600 → aujourd’hui), tableau replié, source', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '19272'; A.setModule('listes'); });
            await p.waitForSelector('.h-village [data-br-place] .br-compass', {timeout: 20000});
            const txt = (await p.textContent('[data-br-place]')).replace(/\s+/g, ' ');
            assert.match(txt, /À Tulle, l’aiguille de la boussole pointait à \d+° à l’est du vrai nord en 1600, à \d+° à l’ouest du vrai nord en 18\d0/);
            assert.match(txt, /gufm1/);
            if (process.env.BR_SHOTS) await p.screenshot({path: path.join(process.env.BR_SHOTS, 'village.png'), fullPage: false});
        });
        await t('Convertisseur d’autrefois : onglet « 🧭 Boussole » (Paris en 1814 : 23° à l’ouest), les autres onglets marchent', async () => {
            await p.evaluate(() => window.LCNDA_EXT.autrefois.open({tab: 'boussole'}));
            await p.waitForSelector('dialog[open] [data-af-tab="boussole"]', {timeout: 15000});
            await p.waitForSelector('dialog[open] [data-br-out] .br-big', {timeout: 15000});
            await p.click('dialog[open] [data-br-ex^="Paris~48.8566~2.3522~1814"]');
            await p.waitForFunction(() => /1814/.test(document.querySelector('dialog[open] [data-br-out]')?.textContent || ''), null, {timeout: 5000});
            const out = (await p.textContent('dialog[open] [data-br-out]')).replace(/\s+/g, ' ');
            assert.match(out, /En 1814 à Paris, l’aiguille de la boussole pointait à 23° à l’ouest du vrai nord\./);
            assert.match(out, /gufm1/);
            await p.selectOption('dialog[open] [data-br-pl]', {label: 'Tulle (Corrèze)'});
            await p.waitForFunction(() => /à Tulle/.test(document.querySelector('dialog[open] [data-br-out]')?.textContent || ''), null, {timeout: 5000});
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-boussole-rues-convert')).year), '1814');
            await p.click('dialog[open] [data-af-tab="argent"]');
            assert.ok(await p.isVisible('dialog[open] [data-af-pane="argent"]'));
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });
        await t('éditeur de cartes (mode Plan) : « 🧭 Tourner la rose des vents » → nord magnétique de 1750, puis ↶', async () => {
            const res = await p.evaluate(async () => {
                const ext = window.LCNDA_EXT; ext.boussoleRues.hookVectorMap();
                if (!ext.vectorMap?.attach) return {skip: true};
                const doc = {w: 800, h: 600, objs: [{id: 'c1', type: 'mdeco', name: 'Rose', x: 10, y: 10, w: 120, h: 120, map: {k: 'compass'}}], map: {on: true, geo: {lat: 48.39, lon: -4.486, name: 'Brest'}}};
                const pane = document.createElement('div'); document.body.appendChild(pane);
                const ed = {doc: () => doc, cur: () => null, selObjs: () => [], commit: () => {}, render: () => {}, paint: () => {}, redraw: () => {}, uid: () => 'u' + Math.random(), dlg: null, pane, fit: () => {}, name: () => 'Plan', setTool: () => {}};
                const mp = ext.vectorMap.attach(ed); pane.innerHTML = mp.paneHtml();
                const has = !!pane.querySelector('[data-vm-cmd="br_north"]');
                window.__brDoc = doc; window.__brMp = mp; window.__brPane = pane;
                return {has};
            });
            if (res.skip) { console.log('   (éditeur de cartes pas chargé)'); return; }
            assert.ok(res.has, 'le bouton est dans l’onglet Plan');
            await p.evaluate(() => window.__brMp.onPaneEvent({type: 'click', target: window.__brPane.querySelector('[data-vm-cmd="br_north"]')}));
            await p.waitForSelector('dialog[open] input[name=y]', {timeout: 5000});
            await p.fill('dialog[open] input[name=y]', '1750');
            await p.click('dialog[open] button[type=submit], dialog[open] .modal-actions .button:not(.secondary)');
            await p.waitForFunction(() => window.__brDoc.objs[0].rot != null, null, {timeout: 5000});
            const rot = await p.evaluate(() => window.__brDoc.objs[0].rot);
            near(rot, Math.round(D(48.39, -4.486, 1750) * 10) / 10, 0.05, 'rotation');
            assert.ok(rot < -15, 'vers l’ouest');
            await p.click('.ui-toast button:has-text("Annuler"), .toast button:has-text("Annuler")');
            await p.waitForFunction(() => window.__brDoc.objs[0].rot == null, null, {timeout: 5000});
            await p.evaluate(() => window.__brPane.remove());
        });
        await t('plan des adresses (Paris) : à côté de « passage Ornano », « 🏛 aujourd’hui rue Esclangon (depuis 1965) »', async () => {
            await p.evaluate(() => { const b = document.createElement('div'); b.id = 'br-am'; b.dataset.brInsee = '75056'; b.innerHTML = '<div class="h-am-side"><section class="h-am-st"><h4>passage Ornano</h4></section><section class="h-am-st"><h4>rue de Rivoli</h4></section></div>'; document.body.appendChild(b); });
            await p.waitForSelector('#br-am .br-chip', {timeout: 10000});
            const txt = await p.textContent('#br-am');
            assert.match(txt, /aujourd’hui rue Esclangon \(depuis 1965\)/); assert.match(txt, /ce nom depuis 1804/);
            await p.evaluate(() => document.getElementById('br-am').remove());
        });
        await t('monographie, dataSources, dataLists : la boussole d’un lieu ; un jour donné ; la liste des rues de Paris renommées', async () => {
            const out = await p.evaluate(async () => {
                const ext = window.LCNDA_EXT, h = document.createElement('div'); document.body.appendChild(h);
                const s = ext.monographSections.find(x => x.id === 'br_boussole');
                const ok = await s.render({id: 1, name: 'Tulle', latitude: 45.2667, longitude: 1.7667}, h, {}); const mono = h.textContent;
                await ext.dataSources.find(d => d.id === 'br_jour').run({date: '1866-02-12'}, h); const jour = h.textContent;
                await ext.dataSources.find(d => d.id === 'br_boussole').run({place: {name: 'Tulle', latitude: 45.2667, longitude: 1.7667}, year: 1810}, h); const bou = h.textContent;
                const L = ext.dataLists.find(d => d.id === 'br_rues_paris'); const rows = await L.load();
                h.remove();
                return {ok, mono, jour, bou, n: rows.length, keys: L.fields.map(f => f.key), orn: rows.find(r => r.old === 'passage Ornano'), geo: rows.filter(r => L.geo(r)).length, per: L.period(rows.find(r => r.old === 'passage Ornano'))};
            });
            assert.strictEqual(out.ok, true); assert.match(out.mono, /À Tulle, l’aiguille de la boussole pointait/);
            assert.match(out.jour, /Napoléon III/); assert.match(out.bou, /En 1810 à Tulle, l’aiguille de la boussole pointait à 22° à l’ouest du vrai nord\./);
            assert.strictEqual(out.n, P.old.length); assert.ok(out.keys.includes('year') && out.keys.includes('url'));
            assert.strictEqual(out.orn.now, 'rue Esclangon'); assert.strictEqual(out.orn.year, 1965); assert.deepStrictEqual(out.per, [null, 1965]);
            assert.ok(out.geo > out.n * 0.4);
        });
        await t('Réglages → 🧭 Boussole, jours et rues : éteindre « Ce jour-là » le retire de la fiche ; effacer les réponses gardées puis ↶', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'boussole_rues'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-br-settings] [data-br-tg="jour"] input', {timeout: 20000});
            const s = await p.textContent('[data-br-settings]');
            assert.match(s, /ODbL/); assert.match(s, /CC BY-SA 4\.0/); assert.match(s, /gufm1/); assert.match(s, /IGRF-14/); assert.match(s, /Lyon et Bordeaux/);
            const before = (await api('br_about')).cache.count; assert.ok(before > 0);
            await p.click('[data-br-clear]');
            await p.waitForFunction(() => /Réponses gardées effacées/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.strictEqual((await api('br_about')).cache.count, 0);
            await p.click('.ui-toast button:has-text("Annuler"), .toast button:has-text("Annuler")');
            await p.waitForFunction(async () => (await window.LCNDA_APP.api('br_about')).cache.count > 0, null, {timeout: 10000});
            await p.uncheck('[data-br-tg="jour"] input');
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-boussole-rues'))).jour, false);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-br-person="1"] [data-br-line="rues"]', {timeout: 20000});
            assert.strictEqual(await p.$('[data-br-person="1"] [data-br-line="jour"]'), null);
            await p.evaluate(() => localStorage.removeItem('genealogie-boussole-rues'));
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
