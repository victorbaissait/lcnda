#!/usr/bin/env node
/* 🕰️ La vraie heure de l'acte, ☄️ Il a pu voir…, 🌌 le ciel de naissance (étoiles HYG, comète de la nuit, heure de l'acte).
 *   assets/js/heritage-ciel-heure.js, assets/js/heritage-tresors-ciel.js, lib/ciel_heure.php,
 *   assets/data/tz-europe-amerique.json, assets/data/comets-aurores.json, assets/data/stars-hyg.json
 *  1. données : chaque comète / aurore a ses dates et sa source ; les fuseaux tzdata ; le catalogue d'étoiles (< 400 Ko, CC BY-SA) ;
 *  2. calculs : 4 h à Brest en 1850 = 4 h 27 à Paris = 5 h 18 aujourd'hui ; heure de Paris 1900 ; heure d'été 1925 ; zone libre et
 *     zone occupée 1941 ; Alsace allemande 1900 ; Bruxelles 1885 ; New York 1950 ; la comète de Donati à côté d'Arcturus le 5 octobre 1858 ;
 *  3. écran : Jean MAZAUD (Brest, 12 mars 1850 à 4 h) : « Il a pu voir : la comète de Halley (1910, à 60 ans) », 🕰️ sous l'heure de
 *     sa naissance, l'aide sous la case « Heure de l'événement », la Chronologie ; Paul DURAND (1905–1908) : rien ; Marie LACOMBE
 *     (Paris, 1er avril 1997 à 21 h) : le ciel de naissance à l'heure de l'acte, avec Hale-Bopp et les étoiles pâles.
 *   node tests/test-ciel-heure.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const vm = require('vm');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const data = f => JSON.parse(fs.readFileSync(path.join(root, 'assets/data', f), 'utf8'));

/* les deux fichiers de la page, lus sans navigateur */
const win = {LCNDA_EXT: {}};
const ctx = vm.createContext({window: win, document: {addEventListener() {}, querySelector() { return null; }, documentElement: {}}, MutationObserver: class { observe() {} }, fetch: () => Promise.reject(new Error('x')), console, Date, Math, setTimeout, clearTimeout, Promise});
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/heritage-ciel-heure.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/heritage-tresors-ciel.js'), 'utf8'), ctx);
const H = win.LCNDA_EXT.cielHeure, SKY = win.LCNDA_EXT.tresorSky;

(async () => {
    const TZ = data('tz-europe-amerique.json'), EV = data('comets-aurores.json');
    await t('données : comètes et aurores datées et sourcées, les fuseaux tzdata, le catalogue d’étoiles', async () => {
        assert.strictEqual(EV.count, EV.events.length);
        const ids = new Set();
        EV.events.forEach(e => {
            assert.ok(e.id && !ids.has(e.id), e.id); ids.add(e.id);
            assert.ok(['comete', 'aurore'].includes(e.kind), e.id);
            assert.match(e.from, /^\d{4}-\d{2}-\d{2}$/); assert.match(e.to, /^\d{4}-\d{2}-\d{2}$/); assert.ok(e.from <= e.to, e.id);
            assert.ok(e.src && /^https:\/\//.test(e.url) && e.evidence.length > 10 && e.desc.length > 10, e.id);
            if (e.el) ['T', 'q', 'e', 'i', 'node', 'w'].forEach(k => assert.ok(Number.isFinite(e.el[k]), `${e.id}.${k}`));
        });
        assert.ok(EV.events.filter(e => e.kind === 'comete').length >= 14 && EV.events.filter(e => e.kind === 'aurore').length >= 6);
        assert.ok(EV.events.find(e => e.id === 'halley1910') && EV.events.find(e => e.id === 'a1859'));
        assert.match(TZ.licence, /Domaine public/); assert.strictEqual(TZ.version, '2026f');
        ['Europe/Paris', 'Europe/Paris~libre', 'Europe/Paris~alsace', 'Europe/Brussels', 'Europe/Luxembourg', 'Europe/Zurich', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Los_Angeles'].forEach(z => assert.ok(TZ.zones[z]?.length > 5, z));
        const st = data('stars-hyg.json'), size = fs.statSync(path.join(root, 'assets/data/stars-hyg.json')).size;
        assert.ok(st.count > 2500 && st.count < 3500 && st.ra.length === st.count && st.m.every(m => m <= 550), `${st.count} étoiles`);
        assert.ok(size < 400 * 1024, `${size} octets`); assert.strictEqual(st.licence, 'CC BY-SA 4.0'); assert.match(st.source, /HYG/);
    });
    await t('calculs : l’heure de l’acte remise à l’heure d’aujourd’hui (soleil, Paris, Greenwich, été, occupation, Alsace, Belgique, États-Unis)', async () => {
        const r = (date, time, place) => H.realHour({date, time, place}, TZ);
        let x = r('1850-03-12', '04:00', {name: 'Brest', country: 'France', lat: 48.39, lng: -4.49});
        assert.strictEqual(x.kind, 'soleil'); assert.strictEqual(x.line, '4 h (heure du soleil à Brest) = 4 h 27 à l’heure de Paris = 5 h 18 à nos montres d’aujourd’hui (heure d’hiver)');
        assert.match(x.sentence, /Avant 1891.*Brest, les horloges avaient 27 min de retard sur Paris/); assert.strictEqual(x.utc, '1850-03-12T04:17');
        x = r('1900-03-12', '04:00', {name: 'Brest', country: 'France', lat: 48.39, lng: -4.49}); assert.strictEqual(x.kind, 'ville'); assert.match(x.sentence, /De 1891 à 1911.*Paris, 9 min 21 s/); assert.match(x.line, /= 4 h 51 à nos montres/);
        x = r('1925-07-12', '14:30', {name: 'Lyon', country: 'France', lat: 45.76, lng: 4.84}); assert.strictEqual(x.kind, 'ete'); assert.match(x.line, /15 h 30 à nos montres d’aujourd’hui \(heure d’été\)/);
        x = r('1925-01-12', '14:30', {name: 'Lyon', country: 'France', lat: 45.76, lng: 4.84}); assert.strictEqual(x.kind, 'legale'); assert.match(x.sentence, /11 mars 1911/);
        x = r('1941-01-12', '14:30', {name: 'Paris', country: 'France', lat: 48.85, lng: 2.35}); assert.strictEqual(x.kind, 'allemande'); assert.strictEqual(x.utc, '1941-01-12T13:30');
        x = r('1941-01-12', '14:30', {name: 'Lectoure', country: 'France', lat: 43.93, lng: 0.62}); assert.strictEqual(x.kind, 'libre'); assert.strictEqual(x.utc, '1941-01-12T13:30'); assert.match(x.sentence, /1 h de moins qu’en zone occupée/);
        x = r('1900-01-12', '23:30', {name: 'Strasbourg', country: 'France', county: 'Bas-Rhin', lat: 48.58, lng: 7.75}); assert.strictEqual(x.kind, 'allemande'); assert.match(x.sentence, /Alsace-Moselle était allemande/);
        x = r('1885-01-12', '10:00', {name: 'Liège', country: 'Belgique', lat: 50.63, lng: 5.57}); assert.match(x.sentence, /De 1880 à 1892.*Bruxelles, 17 min 30 s/);
        x = r('1950-07-12', '10:00', {name: 'Boston', country: 'USA', state: 'Massachusetts', lat: 42.36, lng: -71.06}); assert.strictEqual(x.zone, 'America/New_York'); assert.strictEqual(x.utc, '1950-07-12T14:00');
        assert.strictEqual(r('1850-03-12', '04:00', {name: 'Tokyo', country: 'Japon', lat: 35, lng: 139}), null, 'pays inconnu : rien plutôt qu’une erreur');
        assert.strictEqual(r('1850-03-12', '', {name: 'Brest', country: 'France', lat: 48.39, lng: -4.49}), null);
    });
    await t('calculs : ☄️ la comète de Donati passe à côté d’Arcturus le 5 octobre 1858 ; il a pu voir… (5 ans au moins, de son vivant)', async () => {
        const don = EV.events.find(e => e.id === 'donati'), s = SKY.sky({date: '1858-10-05', hour: 19.5, lat: 48.85, lng: 2.35, comets: [{name: don.name, el: don.el}]});
        const arc = s.stars.find(x => x.n === 'Arcturus'), c = s.comets[0];
        assert.ok(c && Math.hypot(c.alt - arc.alt, (c.az - arc.az) * Math.cos(arc.alt * Math.PI / 180)) < 2, `comète ${c?.alt},${c?.az} / Arcturus ${arc.alt},${arc.az}`);
        assert.deepStrictEqual(H.cometsOn(EV, '1997-04-01').map(e => e.id), ['halebopp']);
        const seen = H.seenDuring({birth: '1850-03-12', death: '1920-05-01'}, EV);
        assert.deepStrictEqual(seen.find(e => e.id === 'halley1910')?.age, 60); assert.strictEqual(seen.find(e => e.id === 'donati').age, 8);
        assert.ok(!seen.some(e => e.id === 'c1843' || e.id === 'neowise'));
        assert.deepStrictEqual(H.seenDuring({birth: '1905-05-03', death: '1908-01-01'}, EV), []);
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ch-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $county, $lat, $lon) use ($pdo) { $pdo->prepare("INSERT INTO places(name, county, country, latitude, longitude) VALUES(?,?,'France',?,?)")->execute([$name, $county, $lat, $lon]); return (int) $pdo->lastInsertId(); };
$brest = $pl('Brest', 'Finistère', 48.39, -4.49); $paris = $pl('Paris', 'Seine', 48.857, 2.352); $tulle = $pl('Tulle', 'Corrèze', 45.27, 1.77);
$ev = [];
$per = function ($f, $l, $g, $st, $evs) use ($pdo, $tag, &$ev) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,?)")->execute([$f, $l, $g, $st]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $txt, $iso, $p, $time]) { $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, sort_date, place_id, event_time) VALUES('person',?,?,?,?,?,?,?)")->execute([$id, $tag($t), (int) substr($iso, 0, 4), $txt, $iso, $p, $time]); $ev[$f . $t] = (int) $pdo->lastInsertId(); } return $id; };
$ids = [
  'jean' => $per('Jean', 'MAZAUD', 'M', 'deceased', [['BIRT', '12 mars 1850', '1850-03-12', $brest, '04:00'], ['DEAT', '1 mai 1920', '1920-05-01', $brest, '']]),
  'paul' => $per('Paul', 'DURAND', 'M', 'deceased', [['BIRT', '3 mai 1905', '1905-05-03', $tulle, ''], ['DEAT', '1 janvier 1908', '1908-01-01', $tulle, '']]),
  'marie' => $per('Marie', 'LACOMBE', 'F', 'living', [['BIRT', '1 avril 1997', '1997-04-01', $paris, '21:00']]),
];
echo json_encode(['ids' => $ids, 'ev' => $ev]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/jean/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const {ids: ID, ev: EVID} = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        // les balises à ajouter dans index.php (tant qu'elles n'y sont pas)
        await p.route(base, async route => { const r = await route.fetch(); let html = await r.text();
            if (!html.includes('heritage-ciel-heure.js')) html = html.replace('</head>', '<link rel="stylesheet" href="assets/css/ciel-heure.css">\n</head>').replace('</body>', '<script src="assets/js/heritage-ciel-heure.js" defer></script>\n</body>');
            await route.fulfill({response: r, body: html}); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.cielHeure && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        await t('serveur : la date lue et le lieu (fenêtre de l’événement, naissance pour le ciel)', async () => {
            let c = await api('ciel_heure_ctx', {person_id: ID.jean});
            assert.deepStrictEqual([c.date, c.time, c.place.name, c.place.lat, c.place.lng, c.tag], ['1850-03-12', '04:00', 'Brest', 48.39, -4.49, 'BIRT']);
            c = await api('ciel_heure_ctx', {date: '1er avril 1997', place_id: c.place.id}); assert.deepStrictEqual([c.date, c.place.name], ['1997-04-01', 'Brest']);
            c = await api('ciel_heure_ctx', {date: 'vers 1850'}); assert.strictEqual(c.date, null); assert.strictEqual(c.place, null);
            assert.strictEqual((await api('ciel_heure_ctx', {person_id: 999999})).ok, false);
        });
        await t('fiche de Jean MAZAUD : « Il a pu voir : la comète de Halley (1910, à 60 ans) », 🕰️ sous l’heure de sa naissance', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; A.setModule('personnes'); }, ID.jean);
            await p.waitForSelector('[data-ch-seen] .ch-seen-list li', {timeout: 20000});
            const txt = await p.textContent('[data-ch-seen]');
            assert.match(txt, /Il a pu voir :/); assert.match(txt, /la comète de Halley \(1910, à 60 ans\)/); assert.match(txt, /la comète de Donati \(1858, à 8 ans\)/);
            assert.match(txt, /la grande aurore de 1859 \(tempête de Carrington\) \(1859, à 9 ans\)/); assert.match(txt, /Source : Wikipédia/); assert.ok(!/1843|NEOWISE/.test(txt));
            await p.waitForSelector(`.event-row[data-event-id="${EVID.JeanBIRT}"] .ch-real`, {timeout: 15000});
            assert.match(await p.textContent(`.event-row[data-event-id="${EVID.JeanBIRT}"] .ch-real summary`), /5 h 18 aujourd’hui/);
            await p.click(`.event-row[data-event-id="${EVID.JeanBIRT}"] .ch-real summary`);
            assert.match(await p.textContent(`.event-row[data-event-id="${EVID.JeanBIRT}"] .ch-real p`), /4 h \(heure du soleil à Brest\) = 4 h 27 à l’heure de Paris.*Avant 1891/s);
            await p.waitForFunction(() => document.querySelector('[data-sky-block]')?.dataset.hour === 'acte', null, {timeout: 15000}); // 🌌 le petit ciel de la fiche : à l'heure de l'acte
        });
        await t('fenêtre de l’événement : sous « Heure de l’événement », ce que l’heure voulait dire (et elle suit la case)', async () => {
            await p.click(`[data-edit-event="${EVID.JeanBIRT}"]`);
            await p.waitForSelector('#event-form [data-ch-hint]:not([hidden])', {timeout: 15000});
            assert.match(await p.textContent('#event-form [data-ch-hint]'), /4 h \(heure du soleil à Brest\).*Avant 1891/s);
            await p.evaluate(() => { const i = document.querySelector('#event-form [name="date_text"]'); i.value = '12 mars 1900'; i.dispatchEvent(new Event('change', {bubbles: true})); });
            await p.waitForFunction(() => /heure de Paris\)/.test(document.querySelector('#event-form [data-ch-hint]')?.textContent || ''), null, {timeout: 10000});
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });
        await t('Chronologie : les comètes et aurores rejoignent la colonne « Contexte »', async () => {
            await p.waitForFunction(id => (window.LCNDA_EXT.worldTimeline(id) || []).some(e => /Halley/.test(e.title) && /à 60 ans/.test(e.category)), ID.jean, {timeout: 20000, polling: 500});
        });
        await t('fiche de Paul DURAND (1905–1908) : trop jeune, rien', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; A.setModule('personnes'); }, ID.paul);
            await p.waitForFunction(() => /Pas de grande comète/.test(document.querySelector('[data-ch-seen]')?.textContent || ''), null, {timeout: 20000});
        });
        await t('🌌 ciel de naissance de Marie LACOMBE (Paris, 1er avril 1997 à 21 h) : heure de l’acte, Hale-Bopp, ≈ 1 000 étoiles pâles', async () => {
            await p.evaluate(id => { window.LCNDA_EXT.tresorSky.pending = id; window.LCNDA_EXT.tresors.open('ciel'); }, ID.marie);
            await p.waitForSelector('[data-sk-hour]:not([hidden])', {timeout: 20000});
            assert.deepStrictEqual(await p.evaluate(() => [document.querySelector('[data-sk] [name=hm]').value, document.querySelector('[data-sk] [name=h]').value]), ['acte', '21:00']);
            assert.match(await p.textContent('[data-sk-hour]'), /21 h \(heure d’été, UTC\+2\)/);
            await p.waitForFunction(() => /Hale-Bopp dans le ciel/.test(document.querySelector('[data-sk-info]')?.textContent || ''), null, {timeout: 10000});
            const info = await p.textContent('[data-sk-info]'); const n = Number((info.match(/et (\d+) plus pâles/) || [])[1]);
            assert.ok(n > 600 && n < 2000, info); assert.match(info, /HYG v4\.0.*CC BY-SA 4\.0/);
            await p.selectOption('[data-sk] [name=hm]', 'sol'); assert.ok(await p.$('[data-sk-hour][hidden]'), 'heure du soleil : pas de conversion');
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
