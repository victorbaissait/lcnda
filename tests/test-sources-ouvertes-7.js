'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌍 Archives en ligne, 7e lot (Archives Portal Europe, Justes, enfants assistés, MonumentsMorts, cercles, FamilySearch Wiki,
 * GenWiki, GOV, CompGen, Archion, Archivní mapy, Mapire, Arcanum ADT, Ancestry Library Edition) :
 *     node tests/test-sources-ouvertes-7.js
 *  1. calculs purs (app-sources-ouvertes-7-core.js) : adresses construites et encodées, adresse à soi, cercle par département,
 *     PAYANT et « Gratuites seulement », « Mon site », liens collés, texte d'une fiche, ajouts proposés ;
 *  2. pas de doublon de site entre les lots (clés et domaines), aucune requête sortante (code du lot) ;
 *  3. l'API sur une petite base inventée : « c'est la même personne ? », import acte (jamais un 2e baptême), Juste (récompense,
 *     jamais dans un jeu), enfant assisté (placement, même matricule gardé), monument (photo reliée au lieu), presse (import
 *     commun), « Pas sûr », ↶ Annuler pour chacun, CSRF et entrées forgées ;
 *  4. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : fiche (Chercher sur internet, bloc Enfant placé),
 *     fenêtre de recherche (filtres, PAYANT, Gratuites seulement), réglages, import d'une photo, sans erreur ni requête externe.
 * Captures : SHOTS=dossier node tests/test-sources-ouvertes-7.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const S7 = require('../assets/js/app-sources-ouvertes-7-core.js');
const SHOTS = process.env.SHOTS || '';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const HOSTS = /archivesportaleurope|yadvashem|monumentsmorts|archives\.paris|genefede|familysearch|genealogy\.net|online-ofb|archion|cuzk|arcanum|ancestrylibrary|google\.com|francearchives/;

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ═════ 1. calculs purs ═════ */
    const P = {first: 'Jean-Marie Léon', last: 'Dupré & Fils', place: 'Saint-Étienne, Loire', county: 'Loire', deptCode: '42', country: 'France', birthYear: 1890};
    await t('adresses : une par site, sûres (https), encodées (é, &, espace)', () => {
        for (const s of S7.SITES) {
            const u = S7.url(s.key, P);
            assert.ok(/^https:\/\/[^\s<>"'`]+$/.test(u), `${s.key} : ${u}`);
            assert.ok(['oui', 'partiel', 'non'].includes(s.verified), `${s.key} : vérifiée ou non`);
            assert.ok(s.note && s.label && s.icon, s.key);
        }
        assert.equal(new URL(S7.url('fs_wiki', P)).searchParams.get('search'), 'Saint-Étienne');
        assert.match(S7.url('fs_wiki', P), /\/fr\/wiki\/fr\//, 'France : le wiki en français');
        assert.match(S7.url('fs_wiki', {place: 'Brno', country: 'Tchéquie'}), /\/en\/wiki\/index\.php\?search=Brno%20Tch/, 'ailleurs : en anglais, avec le pays');
        assert.equal(new URL(S7.url('genwiki', {place: 'Köln'})).searchParams.get('search'), 'Köln');
        assert.equal(new URL(S7.url('gov', {place: 'Müllheim, Baden'})).searchParams.get('name'), 'Müllheim');
        assert.ok(S7.url('ape', P).includes('Dupr%C3%A9%20%26%20Fils'));
        assert.equal(new URL(S7.url('ancestry_library', P)).searchParams.get('name'), 'Jean-Marie_Dupré & Fils');
        assert.equal(new URL(S7.url('ancestry_library', P)).searchParams.get('birth'), '1890');
        assert.match(new URL(S7.url('cfyv_justes', P)).searchParams.get('q'), /^site:yadvashem-france\.org "Dupré & Fils" "Jean-Marie"/);
        assert.match(new URL(S7.url('monumentsmorts', P)).searchParams.get('q'), /site:monumentsmorts\.univ-lille\.fr "Saint-Étienne"/);
        assert.ok(!/[<>"\s]/.test(S7.url('ape', {last: '<script>"x y'})));
        assert.equal(S7.copyText('archion', P), 'Saint-Étienne'); assert.equal(S7.copyText('cfyv_justes', P), 'DUPRÉ & FILS Jean-Marie'); assert.equal(S7.copyText('ape', P), '');
    });
    await t('adresse à soi et cercle par département', () => {
        assert.equal(S7.url('genwiki', {place: 'Köln'}, {genwiki: 'https://example.org/?q={lieu}&n={nom}'}), 'https://example.org/?q=K%C3%B6ln&n=');
        assert.equal(S7.url('genwiki', {place: 'X'}, {genwiki: 'javascript:alert({lieu})'}), 'https://wiki.genealogy.net/index.php?search=X', 'adresse dangereuse ignorée');
        assert.equal(S7.url('cercle_dept', P, {cercles: {42: 'https://cercle42.example.org/releves'}}), 'https://cercle42.example.org/releves');
        assert.match(new URL(S7.url('cercle_dept', P)).searchParams.get('q'), /"cercle généalogique" "Loire" relevés/);
        assert.equal(S7.cercleUrl('', null, ''), 'https://www.genefede.eu/');
        assert.match(S7.cercleUrl('32', {32: 'javascript:x'}, 'Gers'), /google\.com/, 'adresse dangereuse ignorée');
    });
    await t('PAYANT, « Gratuites seulement » (payants à la fin), rubriques, « Mon site »', () => {
        assert.equal(S7.paidBadge('archion').text, 'Payant'); assert.equal(S7.paidBadge('mapire').text, 'En partie payant');
        assert.equal(S7.paidBadge('ancestry_library').text, 'Gratuit en bibliothèque'); assert.equal(S7.paidBadge('ape'), null);
        const free = S7.visible({}); assert.ok(free.every(S7.isFree) && !free.some(s => s.key === 'archion'), 'coché au départ');
        const all = S7.visible({freeOnly: false}); assert.equal(all.length, S7.SITES.length);
        const firstPaid = all.findIndex(s => !S7.isFree(s)); assert.ok(all.slice(firstPaid).every(s => !S7.isFree(s)), 'payants à la fin');
        assert.ok(!S7.visible({hidden: ['ape']}).some(s => s.key === 'ape'));
        const c = S7.counts(all); assert.equal(c.all, all.length); assert.equal(c.aide, 3);
        assert.ok(S7.forPlace('lieu').some(s => s.key === 'fs_wiki') && !S7.forPlace('lieu').some(s => s.key === 'ancestry_library'));
        assert.ok(!S7.forPlace('fiche', {birthYear: 1960}).some(s => s.key === 'cfyv_justes'), 'né en 1960 : pas de Juste proposé');
        assert.deepEqual(S7.checkCustom({label: 'Mon cercle', url: 'https://ex.org/?n={nom}&l={lieu}'}), []);
        assert.ok(S7.checkCustom({label: '', url: 'ftp://x {truc}'}).length >= 2);
        assert.equal(S7.fillCustom('https://ex.org/?n={nom}&p={prénom}', {last: 'Éloi', first: 'Anne'}), 'https://ex.org/?n=%C3%89loi&p=Anne');
        assert.equal(S7.cleanCustom({paid: 'x', group: 'zz'}).paid, false);
    });
    await t('liens collés, texte copié, sorte devinée, ajouts proposés (rien en double)', () => {
        assert.equal(S7.parseLink('https://monumentsmorts.univ-lille.fr/monument/1234/tulle-place/').notice, '1234');
        assert.equal(S7.parseLink('https://gov.genealogy.net/item/show/MUHEIMJN37LS').notice, 'MUHEIMJN37LS');
        assert.equal(S7.parseLink('https://www.familysearch.org/en/wiki/Brno').site, 'fs_wiki');
        assert.equal(S7.parseLink('https://adt.arcanum.com/hu/view/X/').kind, 'presse');
        assert.equal(S7.parseLink('javascript:alert(1)').url, '');
        const a = S7.parseFields('Type : Taufe\nDatum : 12.03.1850\nOrt : Müllheim\nVater : Johann\nSignatur : KB 4', 'acte');
        assert.equal(a.type, 'CHR'); assert.equal(a.place, 'Müllheim'); assert.equal(a.father, 'Johann'); assert.equal(a.cote, 'KB 4');
        const e = S7.parseFields('NOM : MARTIN\nPrénoms : Louise\nMatricule n° 12345\nDate d’admission : 3 mai 1871\nNourrice : Mme Rameau', 'enfant');
        assert.equal(e.last, 'Martin'); assert.equal(e.matricule, '12345'); assert.equal(e.nurse, 'Mme Rameau');
        assert.equal(S7.parseFields('Ils ont été reconnus Justes parmi les Nations le 12 mai 1994. Dossier n° 6123', 'juste').file, '6123');
        assert.equal(S7.detectKind('Juste parmi les nations'), 'juste'); assert.equal(S7.detectKind('Hospice des enfants assistés'), 'enfant');
        assert.equal(S7.proposals('acte', {type: 'CHR', date: '1850'}, {has: {CHR: true}})[0].checked, false, 'baptême déjà là');
        assert.equal(S7.proposals('acte', {type: 'CHR', date: '1850'}, {has: {}})[0].checked, true);
        assert.equal(S7.proposals('juste', {}, {hasJuste: true})[0].checked, false);
        assert.deepEqual(S7.proposals('acte', {type: ''}), []);
    });

    /* ═════ 2. pas de doublon entre les lots, aucune requête sortante ═════ */
    await t('pas de doublon de site entre les lots (clés et domaines)', () => {
        const others = fs.readdirSync(path.join(appRoot, 'assets/js')).filter(f => /^app-sources-ouvertes(-\d)?-core\.js$/.test(f) && !f.includes('-7-'));
        const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } };
        const mine = S7.SITES.filter(s => !/google\.com/.test(s.home)).map(s => [s.key, host(s.home), s.key === 'ap_paris' || s.key === 'enfants_fa' || s.key === 'fs_wiki']);
        for (const f of others) {
            const src = fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8');
            const keys = new Set([...src.matchAll(/key: '([a-z0-9_]+)'/g)].map(m => m[1]));
            for (const [k, h, shared] of mine) {
                assert.ok(!keys.has(k), `${k} est déjà dans ${f}`);
                if (!shared && h) assert.ok(!src.includes(`'https://${h}`) && !src.includes(`'https://www.${h}`), `${h} est déjà un site de ${f}`);
            }
        }
        const app = fs.readFileSync(path.join(appRoot, 'assets/js/app.js'), 'utf8');
        for (const h of ['archivesportaleurope', 'monumentsmorts', 'archion', 'archivnimapy', 'arcanum', 'ancestrylibrary', 'online-ofb', 'genealogy.net']) assert.ok(!app.includes(h), `${h} déjà dans Chercher sur internet`);
    });
    await t('le code du lot ne demande rien à ces sites', () => {
        for (const f of ['assets/js/app-sources-ouvertes-7-core.js', 'assets/js/heritage-sources-ouvertes-7.js']) {
            const s = fs.readFileSync(path.join(appRoot, f), 'utf8');
            assert.ok(!/XMLHttpRequest|sendBeacon|new Image\(|WebSocket|EventSource/.test(s), f);
            const fetches = [...s.matchAll(/fetch\(([^,)]+)/g)].map(m => m[1]);
            assert.ok(fetches.every(x => /api\.php/.test(x)), `${f} : seulement api.php (${fetches})`);
        }
        const php = fs.readFileSync(path.join(appRoot, 'lib/sources_ouvertes_7.php'), 'utf8');
        assert.ok(!/curl_|file_get_contents\(\s*['"]https?:|fopen\(\s*['"]https?:|stream_context|http_get/.test(php));
    });

    /* ═════ 3. l'API ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-so7-'));
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Jean','DUPONT','male',1,'deceased'),(2,'Louise','MARTIN','female',0,'deceased'),(3,'Hans','MÜLLER','male',0,'deceased')");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Tulle','Corrèze','France'),(2,'Müllheim','Baden','Allemagne')");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
foreach ([[1,'BIRT','2 mars 1890',1890,1],[2,'BIRT','1 juin 1870',1870,1],[3,'CHR','12 mars 1850',1850,2]] as [$pid,$tag,$d,$y,$pl]) { $ev->execute(['person',$pid,$t($tag),$d,$y,$pl]); }
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)});
    if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = Number(process.env.PORT) || await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env: envFor(dir), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(x => { cookie = (x.headers.get('set-cookie') || '').split(';')[0]; return x; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, {headers: {Cookie: cookie}})).json();
        const post = async (action, body, token = csrf) => { const x = await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token}, body: JSON.stringify({...body, csrf: token})}); const j = await x.json().catch(() => ({})); return {status: x.status, body: j, result: j.result}; };
        const upload = async (action, data, file = null, token = csrf) => {
            const fd = new FormData(); if (file) fd.append('file', new Blob([file.bytes], {type: file.type}), file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', token);
            const x = await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'X-CSRF-Token': token}, body: fd}); const j = await x.json().catch(() => ({})); return {status: x.status, body: j, result: j.result};
        };
        const person = async id => (await get('person', {id}));
        const award = async id => (await get('so_context', {person_id: id}), (await person(id)));

        await t('API : « c’est la même personne ? » — écarts, rien n’est écrit', async () => {
            const pv = await post('so7_preview', {kind: 'acte', person_id: 3, fields: {last: 'Mueller', first: 'Peter', birth_date: '1820', type: 'CHR', date: '1850'}});
            assert.equal(pv.status, 200, JSON.stringify(pv.body));
            assert.ok(pv.result.ecarts.some(e => /Mueller/.test(e.text)) && pv.result.ecarts.some(e => /Peter/.test(e.text)));
            assert.ok(pv.result.ecarts.some(e => /déjà cet événement/.test(e.text)));
            assert.equal(pv.result.person.has.CHR, true);
            assert.equal((await person(3)).events.length, 1);
        });
        await t('API : acte (Archion) → document, source avec lien, aucun 2e baptême ; décès ajouté ; ↶ Annuler', async () => {
            const im = await upload('so7_import', {kind: 'acte', person_id: 3, site: 'archion', url: 'https://www.archion.de/de/viewer/?no_cache=1&uid=1', same: 'yes', adds: {event: true},
                fields: {type: 'CHR', date: '12 mars 1850', place: 'Müllheim', cote: 'KB 4, S. 12', text: 'Taufe'}}, {bytes: PNG, type: 'image/png', name: 'kb.png'});
            assert.equal(im.status, 200, JSON.stringify(im.body));
            assert.match(im.result.summary, /déjà sur la fiche, gardé/); assert.equal(im.result.event_id, 0);
            let pd = await person(3); assert.equal(pd.events.length, 1);
            assert.ok(JSON.stringify(pd).includes('archion.de'), 'source avec le lien');
            const d = await upload('so7_import', {kind: 'acte', person_id: 3, site: 'compgen_ofb', same: 'yes', fields: {type: 'DEAT', date: '4 avril 1911', place: 'Müllheim', text: 'Tod'}});
            assert.ok(d.result.event_id > 0); assert.equal((await person(3)).events.length, 2);
            assert.equal((await post('so7_undo', {batch: d.result.batch})).status, 200);
            assert.equal((await post('so7_undo', {batch: im.result.batch})).status, 200);
            pd = await person(3); assert.equal(pd.events.length, 1); assert.ok(!JSON.stringify(pd).includes('archion.de'), 'tout retiré');
            assert.ok((await post('so7_undo', {batch: im.result.batch})).status >= 400, 'déjà annulé');
        });
        await t('API : Juste parmi les nations → récompense sobre, jamais dans un jeu, pas en double ; ↶ Annuler', async () => {
            const j = await upload('so7_import', {kind: 'juste', person_id: 2, site: 'cfyv_justes', same: 'yes', fields: {date: '12 mai 1994', file: '6123', place: 'Tulle', text: 'Reconnue Juste parmi les nations'}});
            assert.equal(j.status, 200, JSON.stringify(j.body)); assert.ok(j.result.item_id > 0);
            const ms = await get('mode_simple_data');
            const row = Object.values(ms.persons || {}).find(x => Number(x.id) === 2);
            assert.equal(row?.mem, 1, 'mode simple : « mem » (jamais dans un jeu)');
            const pv = await post('so7_preview', {kind: 'juste', person_id: 2, fields: {}});
            assert.equal(pv.result.person.hasJuste, true);
            const j2 = await upload('so7_import', {kind: 'juste', person_id: 2, same: 'yes', fields: {text: 'x'}});
            assert.match(j2.result.summary, /déjà sur la fiche/); assert.equal(j2.result.item_id, 0);
            await post('so7_undo', {batch: j2.result.batch}); await post('so7_undo', {batch: j.result.batch});
            assert.equal((await post('so7_preview', {kind: 'juste', person_id: 2, fields: {}})).result.person.hasJuste, false);
        });
        await t('API : enfant assisté → placement (bloc montré), même matricule gardé ; « Pas sûr » ; ↶ Annuler remet tout', async () => {
            const e = await upload('so7_import', {kind: 'enfant', person_id: 2, site: 'ap_paris', same: 'yes', fields: {pkind: 'assistance', matricule: '12345', admission: '3 mai 1871', placed: 'Château-Chinon', nurse: 'Mme Rameau', text: 'Registre'}}, {bytes: PNG, type: 'image/png', name: 'dossier.png'});
            assert.equal(e.status, 200, JSON.stringify(e.body)); assert.ok(e.result.placement_id > 0);
            let pd = await person(2); assert.equal(Number(pd.person.show_placement_block), 1);
            assert.ok(JSON.stringify(pd).includes('Château-Chinon'));
            const e2 = await upload('so7_import', {kind: 'enfant', person_id: 2, same: 'yes', fields: {matricule: '12345', text: 'x'}});
            assert.equal(e2.result.placement_id, 0, 'même matricule : gardé');
            const e3 = await upload('so7_import', {kind: 'enfant', person_id: 2, same: 'no', fields: {matricule: '999', text: 'x'}});
            assert.equal(e3.result.placement_id, 0); assert.match(e3.result.summary, /rien d’ajouté/);
            for (const b of [e3, e2, e].map(x => x.result.batch)) assert.equal((await post('so7_undo', {batch: b})).status, 200);
            pd = await person(2); assert.equal(Number(pd.person.show_placement_block || 0), 0); assert.ok(!JSON.stringify(pd).includes('Château-Chinon'));
            assert.equal(fs.readdirSync(path.join(dir, 'media')).filter(f => /\.png$/.test(f)).length, 0, 'fichiers retirés');
        });
        await t('API : monument et plan de cadastre → photo reliée au lieu, avec sa source ; ↶ Annuler', async () => {
            const m = await upload('so7_import', {kind: 'monument', person_id: 0, place_id: '1', site: 'monumentsmorts', url: 'https://monumentsmorts.univ-lille.fr/monument/1234/tulle/', fields: {commune: 'Tulle', monument: 'Poilu', inscription: 'DUPONT Jean'}}, {bytes: PNG, type: 'image/png', name: 'monument.png'});
            assert.equal(m.status, 200, JSON.stringify(m.body)); assert.ok(m.result.media_id > 0);
            const pl = await get('place_monograph', {id: 1}).catch(() => null); void pl;
            const c = await upload('so7_import', {kind: 'carte', place_id: '2', site: 'archivni_mapy', fields: {territory: 'Müllheim', date: '1830'}}, {bytes: PNG, type: 'image/png', name: 'plan.png'});
            assert.equal(c.status, 200, JSON.stringify(c.body));
            assert.ok((await upload('so7_import', {kind: 'carte', fields: {text: 'x'}})).status >= 400, 'ni lieu ni fiche');
            for (const b of [c, m].map(x => x.result.batch)) assert.equal((await post('so7_undo', {batch: b})).status, 200);
        });
        await t('API : presse hongroise → import « presse » commun ; refus (CSRF, fiche, fichier, sorte, lien)', async () => {
            const pr = await upload('so_import', {kind: 'presse', person_id: 1, site: 'arcanum_adt', url: 'https://adt.arcanum.com/hu/view/PestiHirlap_1900_03/', fields: {journal: 'Pesti Hírlap', date: '3 mars 1900', text: 'Dupont'}});
            assert.equal(pr.status, 200, JSON.stringify(pr.body)); assert.match(pr.result.summary, /Dans les médias/);
            await post('so_undo', {batch: pr.result.batch});
            assert.ok((await upload('so7_import', {kind: 'acte', person_id: 1, fields: {text: 'x'}}, null, 'mauvais')).status >= 400, 'CSRF');
            assert.ok((await upload('so7_import', {kind: 'acte', person_id: 99999, fields: {text: 'x'}})).status >= 400, 'fiche inexistante');
            assert.ok((await upload('so7_import', {kind: 'acte', person_id: 1, fields: {}})).status >= 400, 'ni fichier ni lien ni texte');
            assert.ok((await upload('so7_import', {kind: 'hack', person_id: 1, fields: {text: 'x'}})).status >= 400, 'sorte inconnue');
            assert.ok((await upload('so7_import', {kind: 'acte', person_id: 1, fields: {text: 'x'}}, {bytes: Buffer.from('<?php echo 1;'), type: 'text/php', name: 'x.php'})).status >= 400, 'fichier refusé');
            const j = await upload('so7_import', {kind: 'acte', person_id: 1, url: 'javascript:alert(1)', site: 'evil', fields: {type: 'XXX', text: 'x'}});
            assert.equal(j.status, 200); assert.ok(!JSON.stringify(await person(1)).includes('javascript:'), 'lien dangereux jamais gardé');
            await post('so7_undo', {batch: j.result.batch});
            assert.ok((await post('so7_undo', {batch: 'so-xxx'})).status >= 400, 'un import d’un autre lot n’est pas annulé ici');
            void award;
        });

        /* ═════ 4. le navigateur ═════ */
        let pw = null;
        for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
        if (!pw) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        if (process.env.NO_BROWSER) { console.log('— navigateur : sauté (NO_BROWSER)'); return; }
        const browser = await pw.chromium.launch();
        const errors = [], external = [];
        const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, {recursive: true}); await p.screenshot({path: path.join(SHOTS, name), fullPage: false}); };
        try {
            for (const [name, vp, dark] of [['1440', {width: 1440, height: 900}, false], ['390', {width: 390, height: 844}, false], ['sombre', {width: 1440, height: 900}, true]].filter(([n]) => !process.env.VIEWS || process.env.VIEWS.split(',').includes(n))) {
                const ctx = await browser.newContext({viewport: vp, colorScheme: dark ? 'dark' : 'light'});
                await ctx.route(u => HOSTS.test(u.hostname), route => { external.push(route.request().url()); route.abort(); });
                const p = await ctx.newPage(); p.setDefaultTimeout(20000);
                p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
                p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
                p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
                await p.goto(base);
                await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.sourcesOuvertes7 && window.LCNDA_SOURCES_OUVERTES_7, null, {timeout: 20000});
                if (dark) await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
                const noScroll = async () => { const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`); };
                await t(`${name} : fenêtre commune « Chercher » — champs remplis, filtres avec le nombre, Gratuites seulement, PAYANT, adresse montrée = ouverte`, async () => {
                    await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes7.openSearch({personId: 1, group: ''}));
                    await p.waitForSelector('dialog.ael-search[open] [data-ael-go="so7_ape"]', {state: 'attached'});
                    assert.equal(await p.inputValue('dialog.ael-search [name=last]'), 'DUPONT');
                    assert.equal(await p.textContent('[data-ael-url="so7_ape"]'), await p.getAttribute('[data-ael-go="so7_ape"]', 'href'));
                    assert.match(await p.textContent('dialog.ael-search [data-ael-zone=""]'), /^Tout \(\d+\)$/);
                    assert.equal(await p.$('[data-ael-go="so7_archion"]'), null, 'payant caché au départ');
                    await p.click('dialog.ael-search [data-ael-free]');
                    await p.waitForSelector('[data-ael-go="so7_archion"]', {state: 'attached'});
                    assert.ok(await p.$('dialog.ael-search .ui-badge.is-red'), 'pastille PAYANT');
                    await p.click('dialog.ael-search [data-ael-zone="eu"]'); await p.click('dialog.ael-search [data-ael-country="Allemagne"]');
                    const de = await p.$$eval('dialog.ael-search .ael-site', l => l.map(x => x.dataset.aelSite));
                    assert.ok(de.includes('so7_compgen_ofb') && de.includes('so7_archion'), de.join(','));
                    assert.ok(de.every(id => /^(so7_compgen_ofb|so7_archion|so7_genwiki|so7_gov|so3_arolsen_fr)$/.test(id)), de.join(','));
                    await noScroll(); await shot(p, `so7-chercher-${name}.png`);
                    await p.click('dialog.ael-search [data-ael-free]');
                    await p.click('dialog.ael-search [data-ael-settings]');
                    await p.waitForSelector('dialog.ael-settings[open] [data-ael-show="so7_ape"]', {state: 'attached'});
                    await p.$eval('dialog.ael-settings details[data-ael-rub="cercles"]', d => { d.open = true; });
                    await p.fill('dialog.ael-settings .so7-cercle [data-ael-cdep]', '19');
                    await p.fill('dialog.ael-settings .so7-cercle [data-ael-curl]', 'https://cercle19.example.org/');
                    await p.dispatchEvent('dialog.ael-settings .so7-cercle [data-ael-curl]', 'change');
                    await p.waitForTimeout(700);
                    assert.equal(await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes7.settings().cercles?.['19']), 'https://cercle19.example.org/', 'gardé tout de suite (K2), dans la clé du lot');
                    await noScroll(); await shot(p, `so7-reglages-${name}.png`);
                    await p.click('dialog.ael-settings [data-ui-reset]'); await p.waitForTimeout(300);
                    await p.click('dialog.ael-settings .modal-actions [data-ui-x]');
                    await p.click('dialog.ael-search .modal-actions [data-x]');
                });
                await t(`${name} : fiche — un seul bouton « 🔍 Archives en ligne… » et le bloc « Enfant placé »`, async () => {
                    await p.evaluate(() => window.LCNDA_APP.api('save_placement', {}, {method: 'POST', body: {person_id: 2, kind: 'nourrice', place_text: 'Morvan'}}).catch(() => null));
                    await p.evaluate(() => window.LCNDA_APP.openPersonById(2));
                    await p.waitForSelector('[data-so7-search="fr_enfants"]', {timeout: 15000, state: 'attached'});
                    assert.equal(await p.$$eval('.so2-ws, .so3-ws, .so4-ws, .so5-ws, .so6-ws, .so7-ws', l => l.length), 0, 'plus de rangée de boutons par lot');
                    await p.evaluate(() => document.querySelector('[data-so7-search="fr_enfants"]').scrollIntoView());
                    await shot(p, `so7-fiche-placement-${name}.png`);
                    await p.evaluate(() => document.querySelector('[data-so7-search="fr_enfants"]').click());
                    await p.waitForSelector('dialog.ael-search[open] [data-ael-go="so7_ap_paris"]', {state: 'attached'});
                    assert.match(await p.textContent('dialog.ael-search .ael-focus.is-active'), /enfants trouvés/);
                    await p.click('dialog.ael-search .modal-actions [data-x]');
                });
                await t(`${name} : ⤒ importer une photo de monument pour un lieu (K13, ↶ Annuler)`, async () => {
                    await p.evaluate(b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.LCNDA_EXT.sourcesOuvertes7.openImport({place: {id: 1, name: 'Tulle'}, kind: 'monument', site: 'monumentsmorts', files: [new File([u], 'monument.png', {type: 'image/png'})]}); }, PNG.toString('base64'));
                    await p.waitForSelector('dialog.k-import [data-so7-imp] [name=commune]');
                    await p.fill('dialog.k-import [name=commune]', 'Tulle');
                    await noScroll(); await shot(p, `so7-import-${name}.png`);
                    await p.click('dialog.k-import [data-k-go]');
                    await p.waitForSelector('dialog.k-import', {state: 'detached'});
                    await p.locator('button:has-text("↶ Annuler")').last().click(); await p.waitForTimeout(800);
                });
                await ctx.close();
            }
        } finally { await browser.close(); }
        await t('navigateur : aucune erreur JavaScript, aucune requête vers ces sites', () => {
            assert.deepEqual(errors, []);
            assert.deepEqual(external, [], 'l’app n’a rien demandé aux sites');
        });
    } finally { proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    finish();
})();
function finish() { if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); } console.log('\nTout est bon.'); process.exit(0); }
