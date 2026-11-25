#!/usr/bin/env node
/* 🎡 Le monde du village — lot 8 (assets/js/heritage-lot8-monde-village.js, assets/css/lot8-monde-village.css, assets/data/l8c-*.json.gz
 * fabriqués par scripts/lot8-monde-village/build.py ; la vie d'une personne vient de ha_life, lib/histoire_autour.php). Les données
 * livrées sont les VRAIES.
 *  1. données : présentes, tailles mesurées (< 15 Mo en tout), source et licence ; Carmen 1875 à Paris ; le Tour à Tulle ;
 *     l'Exposition de 1900 et sa phrase « visiteurs » ; le 11 novembre 1918 ; chaque phrase citée vient de son article ;
 *  2. calcul (Node) : mariage en 1875 → Carmen ; Tour de France chez lui ; Exposition ; coïncidences (50 ans le 11 novembre 1918) ;
 *     seigneur avant 1789 ; foire pour un cultivateur (pas pour un instituteur) ; clubs ; églises disparues ;
 *  3. écran : bloc « 🎡 Le monde de son village » (caché quand il n'y a rien), lieu (placeInto), registres (listes avec colonne
 *     Source, monographie, dataSources), données pour la fiche lieu de culte, Réglages (éteindre un sujet, ↶).
 *   node tests/test-lot8-monde-village.js */
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
const H = require('../assets/js/heritage-lot8-monde-village.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DATA = path.join(root, 'assets/data');
const KINDS = ['spectacles', 'clubs', 'tour', 'expos', 'dates', 'seigneurs', 'eglises', 'foires'];
const raw = k => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, `l8c-${k}.json.gz`))).toString('utf8'));
const rows = k => H.table(raw(k));
const MONDE = JSON.parse(fs.readFileSync(path.join(DATA, 'monde-autour.json'), 'utf8'));
const evById = new Map(MONDE.events.map(e => [e.id, e]));
const DATES = rows('dates').map(x => ({...x, ev: evById.get(x.id)})).filter(x => x.ev);
const life = (p, places, events = [], jobs = []) => ({ok: true, person: {first: 'Pierre', gender: 'male', ...p}, places, events, jobs, text: ''});
const TULLE = {name: 'Tulle', insee: '19272', country: 'France', lat: 45.2670, lon: 1.7680};
const PARIS = {name: 'Paris', insee: '75056', country: 'France', lat: 48.8566, lon: 2.3522};

(async () => {
    await t('données : tailles mesurées (< 15 Mo en tout), source, licence, nombre de lignes', async () => {
        let size = 0;
        for (const k of KINDS) {
            const p = path.join(DATA, `l8c-${k}.json.gz`); assert.ok(fs.existsSync(p), `${k} manque`);
            const s = fs.statSync(p).size; size += s;
            const f = raw(k); assert.ok(f.source && f.licence && f.url && f.built && f.what, k);
            assert.ok(f.rows.length > 5, `${k} : ${f.rows.length}`);
            console.log(`  ${k} : ${f.rows.length} lignes, ${(s / 1024).toFixed(0)} Ko — ${f.licence}`);
        }
        assert.ok(size < 15e6, `${size} octets`);
        console.log(`  (taille dans l’app : ${(size / 1e6).toFixed(2)} Mo)`);
        assert.match(raw('expos').licence, /CC BY-SA/); assert.strictEqual(raw('tour').licence, 'CC0 1.0');
    });

    await t('données : Carmen (1875, Paris) ; Tour à Tulle ; Exposition de 1900 avec sa phrase ; le 11 novembre 1918 ; phrases tirées de l’article', async () => {
        const carmen = rows('spectacles').find(r => r.q === 'Q185968');
        assert.ok(carmen && carmen.y === 1875 && carmen.d === '1875-03-03' && carmen.city === 'Paris' && carmen.fr === 1, JSON.stringify(carmen));
        assert.ok(rows('tour').some(s => s.bi === '19272' || s.ai === '19272'), 'Tulle');
        const e1900 = rows('expos').find(e => e.y === 1900 && e.city === 'Paris');
        assert.ok(e1900 && e1900.visitors > 1e7 && /visiteurs|entrées/.test(e1900.visitors_sentence), JSON.stringify(e1900));
        for (const e of rows('expos')) { assert.match(e.url, /^https:\/\/fr\.wikipedia\.org\/wiki\//); if (e.visitors) assert.ok(/visiteurs|entrées/.test(e.visitors_sentence)); }
        assert.ok(DATES.some(x => x.d === '1918-11-11'), '1918-11-11');
        for (const x of DATES) { assert.match(x.d, /^\d{4}-\d\d-\d\d$/); const y = Number(x.d.slice(0, 4)); assert.ok(y === x.ev.from || y === (x.ev.to ?? x.ev.from), `${x.id} ${x.d}`); }
        for (const f of rows('foires')) assert.ok(f.ins && Number.isFinite(f.lat), f.q);
        for (const r of rows('seigneurs')) assert.ok(r.ins && r.n && r.q, r.q);
    });

    await t('🎭 marié en 1875 → Carmen à Paris ; sans mariage → l’année de ses 20 ans', async () => {
        const L = life({birth: 1850, death: 1920}, [PARIS], [{tag: 'MARR', year: 1875}]);
        const r = H.spectaclesForLife(rows('spectacles'), L);
        assert.strictEqual(r.why, 'mariage'); assert.strictEqual(r.y, 1875); assert.strictEqual(r.list[0].r.n, 'Carmen'); assert.ok(r.list[0].km < 15);
        const r2 = H.spectaclesForLife(rows('spectacles'), life({birth: 1880}, [TULLE]));
        assert.ok(!r2 || (r2.why === 'vingt' && r2.y === 1900));
    });

    await t('🚲 le Tour à Tulle pendant sa vie ; « quand il y vivait » ; pas avant sa naissance', async () => {
        const st = rows('tour').filter(s => s.bi === '19272' || s.ai === '19272').sort((a, b) => a.y - b.y)[0];
        const L = life({birth: st.y - 30, death: st.y + 10}, [{...TULLE, from: st.y - 30, to: st.y + 10}]);
        const got = H.tourForLife(rows('tour'), L);
        assert.ok(got.length); assert.strictEqual(got[0].s.y, st.y); assert.strictEqual(got[0].lived, true); assert.strictEqual(got[0].age, 30);
        assert.deepStrictEqual(H.tourForLife(rows('tour'), life({birth: 1800, death: 1880}, [TULLE])), []);
        const at = H.tourAt(rows('tour'), TULLE); assert.ok(at.length >= 2 && at.every(x => x.hit.length));
    });

    await t('🎡 25 ans en 1900, à Paris : l’Exposition de 1900 d’abord ; hors de France : rien', async () => {
        const got = H.exposForLife(rows('expos'), life({birth: 1875, death: 1950}, [PARIS]));
        assert.strictEqual(got[0].e.y, 1900); assert.strictEqual(got[0].age, 25); assert.ok(got[0].km < 30);
        assert.deepStrictEqual(H.exposForLife(rows('expos'), life({birth: 1875, death: 1950}, [{name: 'Québec', country: 'Canada', lat: 46.8, lon: -71.2}])), []);
    });

    await t('🎂 né le 11 novembre 1868 → « 50 ans le 11 novembre 1918 » ; né le jour même ; sans date complète : rien', async () => {
        const L = life({birth: 1868, death: 1940}, [TULLE], [{tag: 'BIRT', year: 1868, date: '1868-11-11'}, {tag: 'DEAT', year: 1940, date: '1940-02-03'}]);
        const got = H.coincidences(DATES, L);
        const ar = got.find(c => c.kind === 'anniversaire' && c.x.d === '1918-11-11');
        assert.ok(ar && ar.n === 50, JSON.stringify(got.slice(0, 3)));
        const same = H.coincidences(DATES, life({birth: 1918}, [], [{tag: 'BIRT', year: 1918, date: '1918-11-11'}]));
        assert.strictEqual(same[0].kind, 'naissance');
        assert.deepStrictEqual(H.coincidences(DATES, life({birth: 1868}, [], [{tag: 'BIRT', year: 1868, date: '1868'}])), []);
    });

    // une commune où Wikidata connaît un seigneur avec des années
    const S = rows('seigneurs'), lord = S.find(r => r.s !== null && r.s > 1500 && r.s < 1780 && (r.e === null || r.e > r.s));
    const CC = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, 'cc-communes.json.gz'))).toString('utf8')).c;
    const LORD_PLACE = {name: lord.commune, insee: lord.ins, country: 'France', lat: CC[lord.ins][1], lon: CC[lord.ins][2]};
    await t(`👑 vivant à ${lord.commune} en ${lord.s} → ${lord.n} ; après 1789 : rien`, async () => {
        const L = life({birth: lord.s - 10, death: lord.s + 40}, [{...LORD_PLACE, from: lord.s, to: lord.s + 5}]);
        const got = H.lordsForLife(S, L);
        assert.ok(got.length && got[0].at && got[0].at.r.n, JSON.stringify(got));
        assert.deepStrictEqual(H.lordsForLife(S, life({birth: 1850}, [{...LORD_PLACE, from: 1850, to: 1900}])), []);
    });

    const F = rows('foires'), fair = F.find(f => f.frwiki && f.exact) || F[0];
    const FAIR_PLACE = {name: fair.commune, insee: fair.ins, country: 'France', lat: fair.lat, lon: fair.lon};
    await t(`🐄 cultivateur à ${fair.commune} → ${fair.n} ; instituteur : rien`, async () => {
        const got = H.fairsForLife(F, life({birth: 1850, death: 1900}, [FAIR_PLACE], [], [{text: 'cultivateur'}]));
        assert.ok(got && got.job === 'cultivateur' && got.list.some(x => x.f.q === fair.q));
        assert.strictEqual(H.fairsForLife(F, life({birth: 1850}, [FAIR_PLACE], [], [{text: 'instituteur'}])), null);
    });

    await t('⛪ églises disparues d’une commune ; ⚽ clubs d’une commune', async () => {
        const E = rows('eglises'), e = E.find(r => r.st === 'detruit' && r.img);
        assert.ok(e, 'une église détruite avec image');
        assert.ok(H.churchesAt(E, {insee: e.ins}).some(r => r.q === e.q));
        const C = rows('clubs'), c = C.find(r => r.ins === '19272') || C[0];
        assert.ok(H.clubsAt(C, {insee: c.ins}).some(r => r.q === c.q));
    });

    /* ─────────── serveur et écran ─────────── */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-l8c-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4',
        L8C_LORD: JSON.stringify([lord.commune, lord.ins, CC[lord.ins][1], CC[lord.ins][2], lord.s])};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
[$ln, $li, $la, $lo, $ly] = json_decode(getenv('L8C_LORD'), true);
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Pierre','MAZAUD','male','deceased',1,'cultivateur'),(2,'Marie','LACOMBE','female','deceased',0,''),(3,'Jean','DURAND','male','deceased',0,'boulanger')");
$s = $pdo->prepare("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(?,?,?,?,?,?,?)");
$s->execute([1,'Paris','Seine','France',48.8566,2.3522,'75056']); $s->execute([2,'Tulle','Corrèze','France',45.2670,1.7680,'19272']); $s->execute([3,$ln,'','France',$la,$lo,$li]);
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'11 nov. 1850',1850,'1850-11-11',2]); $ins->execute([1,$t('MARR'),'1875',1875,'1875-06-10',1]); $ins->execute([1,$t('DEAT'),'1925',1925,'1925-01-05',2]);
$ins->execute([2,$t('BIRT'),(string)($ly-10),$ly-10,(string)($ly-10),3]); $ins->execute([2,$t('DEAT'),(string)($ly+40),$ly+40,(string)($ly+40),3]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https:\/\/(upload|thumb|commons)\.wikimedia\.org\//, r => r.abort()); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-lot8-monde-village.js : on l'ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.lot8MondeVillage))) { await p.addStyleTag({url: base + 'assets/css/lot8-monde-village.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-lot8-monde-village.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.lot8MondeVillage);

        await t('fiche : « 🎡 Le monde de son village » de Pierre MAZAUD : Carmen, l’Exposition, le 11 novembre 1918, une foire ; source à un clic', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-l8c-person="1"] .l8c-row', {timeout: 30000});
            const txt = await p.textContent('[data-l8c-person="1"]');
            assert.match(txt, /L’année de son mariage \(1875\), création de l’opéra-comique Carmen \(Georges Bizet\) à Paris/);
            assert.match(txt, /Il avait 50 ans pendant l’Exposition universelle de 1900 \(Paris, [\d,]+ millions de visiteurs\)/);
            assert.match(txt, /Il a eu 68 ans le 11 novembre 1918/);
            assert.match(txt, /Source : Wikidata/); assert.match(txt, /▸ plus/);
            const a = await p.$$eval('[data-l8c-person="1"] a', l => l.map(x => [x.href, x.target, x.rel]));
            assert.ok(a.length && a.every(([h, tg, rel]) => /^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)), JSON.stringify(a.slice(0, 2)));
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-l8c-person="1"]').closest('section.card').hidden), false);
        });

        await t(`fiche : Marie LACOMBE à ${lord.commune} avant 1789 → son seigneur ; Jean DURAND (rien) : bloc caché`, async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-l8c-person="2"] .l8c-row', {timeout: 30000});
            const txt = await p.textContent('[data-l8c-person="2"]');
            assert.ok(txt.includes(lord.commune) && /👑|seigneur|vivait sous/.test(txt), txt.slice(0, 300));
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-l8c-person="3"]', {state: 'attached', timeout: 20000}); await sleep(2500);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-l8c-person="3"]').closest('section.card').hidden), true);
        });

        await t('lieu : Tulle → le Tour de France ; Paris → Expositions et créations ; un point en mer : rien', async () => {
            const html = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.lot8MondeVillage.placeInto(h, {id: 2, name: 'Tulle', insee: '19272', country: 'France', lat: 45.2670, lon: 1.7680}); const x = h.innerHTML; h.remove(); return x; });
            assert.match(html, /Le Tour de France est passé ici/); assert.match(html, /▸ plus/);
            const par = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.lot8MondeVillage.placeInto(h, {id: 1, name: 'Paris', insee: '75056', country: 'France', lat: 48.8566, lon: 2.3522}); const x = h.textContent; h.remove(); return x; });
            assert.match(par, /Expositions ont eu lieu ici/); assert.match(par, /créations/);
            const none = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.lot8MondeVillage.placeInto(h, {id: 0, name: 'En mer', lat: 46.0, lon: -6.0}); const r = [n, h.innerHTML]; h.remove(); return r; });
            assert.deepStrictEqual(none, [0, '']);
        });

        await t('registres : listes (colonne Source), monographie, dataSources ; données pour la fiche lieu de culte', async () => {
            const r = await p.evaluate(async (ins) => {
                const E = window.LCNDA_EXT, L = E.dataLists.filter(d => d.id.startsWith('l8c_'));
                const out = {ids: L.map(d => d.id), src: true, rows: {}};
                for (const d of L) { const rows = await d.load(); out.rows[d.id] = rows.length; if (!d.fields.some(f => f.key === 'src' && f.type === 'url') || !d.source) out.src = false; if (rows[0] && !/^https:\/\//.test(rows[0].src)) out.src = false; }
                const mono = E.monographSections.find(s => s.id === 'l8c_tour'), mh = document.createElement('div'); document.body.appendChild(mh);
                out.mono = [await mono.render({id: 2, name: 'Tulle', latitude: 45.2670, longitude: 1.7680}, mh, {village: async () => ({insee: '19272'})}), mh.textContent]; mh.remove();
                const host = document.createElement('div'); document.body.appendChild(host);
                await E.dataSources.find(d => d.id === 'l8c_spectacles_annee').run({year: 1875}, host); out.ds = host.textContent; host.remove();
                out.secs = E.monographSections.filter(s => s.id.startsWith('l8c_')).map(s => s.id); out.srcs = E.dataSources.filter(s => s.id.startsWith('l8c_')).length;
                out.worship = await E.lot8MondeVillage.worshipPlaces(ins);
                return out;
            }, rows('eglises').find(x => x.img).ins);
            ['l8c_spectacles', 'l8c_clubs', 'l8c_tour', 'l8c_expos', 'l8c_dates', 'l8c_seigneurs', 'l8c_eglises', 'l8c_foires'].forEach(id => assert.ok(r.ids.includes(id) && r.rows[id] > 0, id));
            assert.ok(r.src, 'colonne Source partout');
            assert.strictEqual(r.mono[0], true); assert.match(r.mono[1], /Tour de France/);
            assert.match(r.ds, /Carmen/); assert.strictEqual(r.secs.length, 7); assert.ok(r.srcs >= 13);
            assert.ok(r.worship.length && r.worship.some(w => /^https:\/\/commons\.wikimedia\.org\//.test(w.imageUrl) && /wikidata\.org/.test(w.wikidata) && w.stateText));
        });

        await t('Réglages → 🎡 Le monde du village : éteindre « spectacles » le retire de la fiche (↶ le remet)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'lot8_monde_village'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-l8c-settings] table tbody tr', {timeout: 20000});
            assert.match(await p.textContent('[data-l8c-settings] table'), /CC BY-SA 4\.0/);
            await p.click('[data-l8c-tg="spectacles"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot8-monde-village')).spectacles), false);
            const txt = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.lot8MondeVillage.personInto(h, 1); const x = h.textContent; h.remove(); return x; });
            assert.ok(!/Carmen/.test(txt) && /Exposition/.test(txt));
            await p.click('button:has-text("↶ Annuler")', {timeout: 5000});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot8-monde-village')).spectacles), false);
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
