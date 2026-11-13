'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⤒ ⤓ Imports et exports « en plus » :   node tests/test-imports-exports-plus.js
 * Passe par la vraie application (PHP, envoi des fichiers comme l'interface), sur des dossiers temporaires.
 *  1. ⤒ RootsMagic (.rmtree inventé, tests/fixtures/autres-logiciels) : personnes, noms, familles, adoption, événements,
 *     lieux (coordonnées, lieu-dit), sources, citations, dépôt, média, notes, témoins, fiche confidentielle ; aperçu de
 *     « Importer un arbre » ; fichier abîmé refusé ; base piégée (pas une base RootsMagic) refusée ; gros fichier (5 000 fiches) ;
 *  2. ⤒ Family Tree Maker : .ftm chiffré refusé avec la phrase qui explique ; son GEDCOM (_MILT, _FREL, dates « 14 Jul 1890 ») lu ;
 *  3. ⤒ Généatique : GEDCOM en ANSI (Windows-1252), lieux par FORM avec lieu-dit et code INSEE, témoins ;
 *  4. ⤓ Pour Geneanet : GEDCOM 5.5.1 UTF-8, vivante et confidentielle cachées (anonymes ou retirées), lieux au format Geneanet,
 *     médias en liens, aucune balise « _ » ; réimporté : même nombre de personnes ;
 *  5. ⤓ Gramps : .gramps gzippé, valide selon le schéma RELAX NG de Gramps 1.7.1 (xmllint), accents ; réimporté par l'import
 *     Gramps de l'app : personnes, familles, événements, sources, citations, témoins comptés ;
 *  6. ⤓ GEDCOM-X : JSON, toutes les références (#I…, #P…, #S…) existent, dates formelles, types en URI ;
 *  7. ⤓ .ics : RFC 5545 (CRLF, lignes de 75 octets au plus, propriétés obligatoires, UID uniques, 29 février), fêtes du prénom,
 *     « vivants seulement », jamais une fiche confidentielle ;
 *  8. ⤓ vCard 4.0 : RFC 6350 (VERSION en 2e ligne, FN, échappements, téléphones en tel:+33, pliage) ;
 *  9. ⤓ KML (dossiers par sorte d'événement, lon,lat) et GeoJSON (RFC 7946) ; vivants absents ;
 * 10. navigateur (Playwright ; sinon sauté) : Réglages → Export → « ⤓ Vers d’autres logiciels et sites », chaque fenêtre,
 *     téléchargements, Calendrier de la famille → .ics, Listes → Lieux → ⤓ Exporter ▾ ; 1440, 390 px, sombre ; aucune erreur.
 * Captures si ECH_SHOTS=dossier.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { PhpServer, findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'autres-logiciels');
const phpPath = findPhp([devBundledPhp()]);
const SHOTS = process.env.ECH_SHOTS || '';
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const php = (code, ...args) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code, ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim()); return r.stdout; };
const sql = (db, q) => JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);$d->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);echo json_encode($d->query($argv[2])->fetchAll(),JSON_UNESCAPED_UNICODE);`, db, q));
const one = (db, q) => Object.values(sql(db, q)[0] || {})[0];
const exec = (db, q) => php(`$d=new PDO('sqlite:'.$argv[1]);$d->exec($argv[2]);`, db, q);
const hasXmllint = spawnSync('xmllint', ['--version'], { encoding: 'utf8' }).status === 0;
const hasPy = spawnSync('python3', ['-c', 'import sqlite3'], { encoding: 'utf8' }).status === 0;

async function withServer(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-echanges-'));
    const dataDir = path.join(dir, 'data'); fs.mkdirSync(dataDir, { recursive: true });
    const s = new PhpServer({ phpPath, appRoot, pool: 2, dataDir, mediaDir: path.join(dir, 'media'), sessionDir: path.join(dataDir, 'sessions'), logFile: path.join(dataDir, 'php.log') });
    s.on('error', () => {});
    await s.start();
    const base = `http://127.0.0.1:${s.port}`;
    const H = { 'x-carnet-secret': s.secret };
    let cookie = '', csrf = '';
    const session = async () => { const home = await fetch(base + '/', { headers: H }); cookie = (home.headers.get('set-cookie') || '').split(';')[0] || cookie; csrf = JSON.parse(((await home.text()).match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""'); };
    await session();
    const t = {
        dir, base, s, db: path.join(dataDir, 'genealogy.sqlite'),
        async upload(action, content, name, extra = {}) {
            const fd = new FormData(); fd.append('file', new Blob([content]), name); fd.append('csrf', csrf);
            for (const [k, v] of Object.entries(extra)) fd.append(k, v);
            const r = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { ...H, 'X-CSRF-Token': csrf, cookie }, body: fd });
            return { status: r.status, data: await r.json().catch(() => ({})) };
        },
        async post(action, body) {
            const r = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { ...H, 'X-CSRF-Token': csrf, cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            return { status: r.status, data: await r.json().catch(() => ({})) };
        },
        async get(action, params = {}) {
            const q = new URLSearchParams({ action, ...params });
            const r = await fetch(`${base}/api.php?${q}`, { headers: { ...H, cookie } });
            return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
        },
        session,
    };
    try { return await fn(t); } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ── validateurs indépendants de l'app ── */
function checkIcs(text) {
    ok(/\r\n$/.test(text) && !/[^\r]\n/.test(text), 'ics : lignes terminées par CRLF');
    const raw = text.split('\r\n'); raw.pop();
    ok(raw.every(l => Buffer.byteLength(l, 'utf8') <= 75), 'ics : aucune ligne de plus de 75 octets');
    const lines = []; for (const l of raw) { if (l.startsWith(' ')) lines[lines.length - 1] += l.slice(1); else lines.push(l); }
    eq(lines[0], 'BEGIN:VCALENDAR', 'ics : commence par BEGIN:VCALENDAR'); eq(lines[lines.length - 1], 'END:VCALENDAR', 'ics : finit par END:VCALENDAR');
    ok(lines.includes('VERSION:2.0') && lines.some(l => l.startsWith('PRODID:')), 'ics : VERSION et PRODID');
    const stack = []; const events = []; let cur = null;
    for (const l of lines) {
        if (l.startsWith('BEGIN:')) { stack.push(l.slice(6)); if (l === 'BEGIN:VEVENT') cur = {}; continue; }
        if (l.startsWith('END:')) { assert.equal(stack.pop(), l.slice(4), 'ics : BEGIN/END équilibrés'); if (l === 'END:VEVENT') { events.push(cur); cur = null; } continue; }
        if (cur && stack[stack.length - 1] === 'VEVENT') { const i = l.indexOf(':'); const k = l.slice(0, i).split(';')[0]; cur[k] = (cur[k] ? cur[k] + '\n' : '') + l.slice(i + 1); }
    }
    ok(stack.length === 0, 'ics : composants fermés');
    for (const e of events) {
        assert.ok(e.UID && e.DTSTAMP && e.DTSTART && e.SUMMARY, 'ics : UID, DTSTAMP, DTSTART, SUMMARY dans chaque VEVENT');
        assert.match(e.DTSTAMP, /^\d{8}T\d{6}Z$/); assert.match(e.DTSTART, /^\d{8}$/);
        const y = +e.DTSTART.slice(0, 4), m = +e.DTSTART.slice(4, 6), d = +e.DTSTART.slice(6);
        const dt = new Date(Date.UTC(y, m - 1, d)); assert.ok(dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d, 'ics : date réelle ' + e.DTSTART);
        assert.ok(/^FREQ=YEARLY(;BYMONTH=2;BYMONTHDAY=-1)?$/.test(e.RRULE), 'ics : RRULE annuelle');
        assert.ok(!/(^|[^\\])[,;]/.test(e.SUMMARY), 'ics : virgules et points-virgules échappés');
    }
    ok(new Set(events.map(e => e.UID)).size === events.length, 'ics : UID uniques');
    return events;
}
function checkVcf(text) {
    ok(/\r\n$/.test(text) && !/[^\r]\n/.test(text), 'vcf : CRLF');
    const raw = text.split('\r\n'); raw.pop();
    ok(raw.every(l => Buffer.byteLength(l, 'utf8') <= 75), 'vcf : lignes pliées à 75 octets');
    const lines = []; for (const l of raw) { if (l.startsWith(' ')) lines[lines.length - 1] += l.slice(1); else lines.push(l); }
    const cards = []; let cur = null;
    for (const l of lines) {
        if (l === 'BEGIN:VCARD') { cur = []; continue; }
        if (l === 'END:VCARD') { cards.push(cur); cur = null; continue; }
        assert.ok(cur, 'vcf : propriété hors d’une carte : ' + l); cur.push(l);
    }
    for (const c of cards) {
        assert.equal(c[0], 'VERSION:4.0', 'vcf : VERSION:4.0 juste après BEGIN');
        assert.ok(c.filter(l => l.startsWith('FN:')).length >= 1, 'vcf : FN');
        for (const l of c.filter(l => l.startsWith('TEL'))) assert.match(l, /^TEL;VALUE=(uri;TYPE="[a-z,]+":tel:\+\d{6,15}|text;TYPE="[a-z,]+":.+)$/);
        for (const l of c.filter(l => l.startsWith('EMAIL'))) assert.match(l, /^EMAIL;TYPE=\w+:[^@\s]+@[^@\s]+$/);
        for (const l of c.filter(l => l.startsWith('KIND:'))) assert.match(l, /^KIND:(individual|org)$/);
    }
    ok(cards.length > 0, 'vcf : des cartes');
    return cards;
}

(async () => {
    console.log('⤒ ⤓ Imports et exports en plus (' + phpPath + ')');

    /* ═════ 1. RootsMagic ═════ */
    await withServer(async t => {
        const rm = fs.readFileSync(path.join(FIX, 'famille-rootsmagic.rmtree'));
        const sha = require('node:crypto').createHash('sha1').update(rm).digest('hex');
        const pv = await t.upload('import_preview', rm, 'famille.rmtree');
        eq(pv.status, 200, 'RootsMagic : aperçu de « Importer un arbre » ' + JSON.stringify(pv.data).slice(0, 200));
        eq(pv.data.persons, 7, 'RootsMagic : 7 personnes annoncées'); eq(pv.data.producer_label, 'RootsMagic', 'RootsMagic : logiciel reconnu');
        const r = await t.upload('import_package', rm, 'famille.rmtree');
        eq(r.status, 200, 'RootsMagic : importé ' + JSON.stringify(r.data).slice(0, 300));
        const st = r.data.stats;
        eq([st.persons, st.families, st.events, st.sources], [7, 2, 10, 2], 'RootsMagic : personnes, familles, événements, sources');
        ok(st.citations >= 4, 'RootsMagic : citations (' + st.citations + ')');
        eq(require('node:crypto').createHash('sha1').update(fs.readFileSync(path.join(FIX, 'famille-rootsmagic.rmtree'))).digest('hex'), sha, 'RootsMagic : le fichier d’origine n’est pas modifié');
        const db = t.db;
        eq(one(db, "SELECT last_name FROM persons WHERE first_name='François'"), 'DUBŒUF', 'RootsMagic : accents et ligatures (Œ)');
        eq(one(db, "SELECT count(*) FROM family_children WHERE relation_to_partner1='adopted'"), 1, 'RootsMagic : adoption');
        eq(one(db, "SELECT count(*) FROM event_witnesses"), 2, 'RootsMagic : témoin du mariage et parrain');
        eq(one(db, "SELECT note FROM event_witnesses ORDER BY id LIMIT 1") !== '', true, 'RootsMagic : rôle du témoin');
        eq(one(db, "SELECT is_private FROM persons WHERE first_name='Zoé'"), 1, 'RootsMagic : fiche confidentielle gardée confidentielle');
        eq(one(db, "SELECT count(*) FROM name_variants WHERE type='historical' AND last_name='FAURE'"), 1, 'RootsMagic : nom d’épouse');
        eq(one(db, "SELECT count(*) FROM name_variants WHERE type='nickname' AND first_name='Titou'"), 1, 'RootsMagic : surnom');
        eq(one(db, "SELECT round(latitude,3) FROM places WHERE name='Québec'"), 46.813, 'RootsMagic : coordonnées du lieu (Québec)');
        ok(one(db, "SELECT count(*) FROM places WHERE subdivision LIKE '%Moulin%' OR name LIKE '%Moulin%'") >= 1, 'RootsMagic : lieu-dit (détail du lieu)');
        eq(one(db, "SELECT date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='OCCU'"), 'entre 1840 et 1850', 'RootsMagic : date « entre … et … »');
        eq(one(db, "SELECT date_text FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN persons p ON p.id=e.person_id WHERE t.gedcom_tag='DEAT' AND p.first_name='Jean-Baptiste'"), 'après 1860', 'RootsMagic : date « après »');
        ok(one(db, "SELECT count(*) FROM sources WHERE agency LIKE 'Archives départementales%'") === 1, 'RootsMagic : dépôt de la source');
        ok(one(db, "SELECT count(*) FROM source_links WHERE page='folio 12 v°'") >= 1, 'RootsMagic : page de la citation');
        ok(one(db, "SELECT count(*) FROM notes WHERE body LIKE '%sait signer%' AND body NOT LIKE '%<b>%'") === 1, 'RootsMagic : note sans balises HTML');
        // fichiers abîmés ou piégés
        const bad = await t.upload('import_preview', fs.readFileSync(path.join(FIX, 'rootsmagic-abime.rmtree')), 'abime.rmtree');
        ok(bad.status === 422 && /abîmé|pas une base/.test(bad.data.error), 'RootsMagic abîmé : refusé proprement (' + bad.data.error + ')');
        const notRm = path.join(t.dir, 'autre.sqlite'); exec(notRm, 'CREATE TABLE persons(id INTEGER)');
        const trap = await t.upload('import_package', fs.readFileSync(notRm), 'piege.rmtree');
        ok(trap.status === 422 && /pas une base RootsMagic/.test(trap.data.error), 'base SQLite qui n’est pas un RootsMagic : refusée (' + trap.data.error + ')');
        const ftm = await t.upload('import_preview', fs.readFileSync(path.join(FIX, 'arbre-chiffre.ftm')), 'arbre.ftm');
        ok(ftm.status === 422 && /Family Tree Maker chiffre/.test(ftm.data.error) && /GEDCOM/.test(ftm.data.error), 'Family Tree Maker .ftm : phrase claire');
        const ftm2 = await t.upload('merge_gedcom_analyse', fs.readFileSync(path.join(FIX, 'arbre-chiffre.ftm')), 'arbre.ftm');
        ok(ftm2.status === 422 && /Family Tree Maker/.test(ftm2.data.error), 'Family Tree Maker : même phrase dans « Fusionner un arbre »');
        const mg = await t.upload('merge_gedcom_analyse', rm, 'cousin.rmtree');
        ok(mg.status === 200 && Array.isArray(mg.data.rows) && mg.data.rows.length === 7, 'RootsMagic : comparé dans « Fusionner un arbre » (7 fiches)');
        if (hasPy) {
            const big = path.join(t.dir, 'gros.rmtree');
            const g = spawnSync('python3', ['-I', path.join(FIX, 'fabriquer-rootsmagic.py'), big, '5000'], { encoding: 'utf8' });
            ok(g.status === 0, 'gros RootsMagic fabriqué');
            const t0 = Date.now(); const rb = await t.upload('import_package', fs.readFileSync(big), 'gros.rmtree');
            ok(rb.status === 200 && rb.data.stats.persons === 5007, 'gros RootsMagic (5 007 fiches) importé en ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
        } else console.log('  – gros RootsMagic : sauté (python3 absent)');
    });
    console.log(`✓ RootsMagic, Family Tree Maker : ${n} vérifications`);

    /* ═════ 2–9. GEDCOM d'autres logiciels, puis les exports ═════ */
    let gramps = null, geneanetGed = null;
    await withServer(async t => {
        const fx = await t.upload('import_package', fs.readFileSync(path.join(FIX, 'ftm-export.ged')), 'ftm.ged');
        eq(fx.status, 200, 'GEDCOM de Family Tree Maker importé');
        eq(one(t.db, "SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.label='Service militaire'"), 1, 'FTM : _MILT → « Service militaire »');
        eq(one(t.db, "SELECT date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='BIRT' AND e.year=1890"), '14 juillet 1890', 'FTM : date « 14 Jul 1890 »');
        eq(one(t.db, "SELECT count(*) FROM family_children WHERE relation_to_partner1='adopted' AND relation_to_partner2='biological'"), 1, 'FTM : _FREL Adopted / _MREL Natural');
        const gq = await t.upload('import_package', fs.readFileSync(path.join(FIX, 'geneatique-export.ged')), 'geneatique.ged');
        eq(gq.status, 200, 'GEDCOM de Généatique (ANSI) importé');
        eq(one(t.db, "SELECT first_name||' '||last_name FROM persons WHERE last_name LIKE 'B%RAUD' AND first_name LIKE '%tienne'"), 'Étienne BÉRAUD', 'Généatique : accents Windows-1252');
        const pl = sql(t.db, "SELECT name, subdivision, county FROM places WHERE subdivision='La Croix'")[0] || {};
        eq([pl.name, pl.county], ['Égletons', 'Corrèze'], 'Généatique : lieu-dit, commune, département rangés d’après FORM');
        eq(one(t.db, "SELECT count(*) FROM event_witnesses ew JOIN persons p ON p.id=ew.person_id WHERE p.first_name='Jean' AND p.last_name='MAZIÈRE'"), 2, 'Généatique : parrain et témoin');
    });
    await withServer(async t => {
        const r = await t.upload('import_package', fs.readFileSync(path.join(FIX, 'famille-echanges.ged')), 'famille.ged');
        eq(r.status, 200, 'famille d’essai importée'); eq(r.data.stats.persons, 9, '9 personnes');
        // de quoi exporter : coordonnées, code INSEE, contacts, archives, cousin ADN, un média en ligne, une étiquette
        exec(t.db, `UPDATE places SET admin4_code='19272' WHERE name='Tulle';
            INSERT INTO living_contacts(first_name,last_name,relationship,email,phone_mobile,phone_landline,address,postal_code,city,country,notes) VALUES('Hélène','Dubœuf','cousine, branche Faure ; côté Tulle','helene@example.fr','06 12 34 56 78','05.55.20.00.00','12, rue de la Paix','19000','Tulle','France','Très longue note pour vérifier le pliage des lignes à soixante-quinze octets : élégance, cœur, œuvre, Ça va ?');
            INSERT INTO archive_services(name,address,city,phone,email,website_url,opening_hours) VALUES('Archives départementales de la Corrèze','Rue Souham','Tulle','+33 5 55 20 11 47','archives@correze.fr','https://archives.correze.fr','lundi au vendredi, 9 h – 17 h');
            INSERT INTO media(title,media_type,filename,document_url) VALUES('Acte de mariage','image','','https://www.example.org/acte-mariage.jpg');
            INSERT INTO media_links(media_id,entity_type,entity_id,position) SELECT max(id),'person',(SELECT id FROM persons WHERE first_name='Léon'),0 FROM media;
            INSERT INTO labels(name,color) VALUES('Branche Faure','#3c78d8');
            INSERT INTO label_links(label_id,entity_type,entity_id) SELECT max(id),'person',(SELECT id FROM persons WHERE first_name='Léon') FROM labels;`);
        try { exec(t.db, "INSERT INTO dna_kits(label) VALUES('Mon kit'); INSERT INTO dna_matches(kit_id,name,shared_cm,relationship) VALUES(1,'Paul Lagarde',212.5,'cousin issu de germain')"); } catch (_) {}
        const persons = one(t.db, 'SELECT count(*) FROM persons');

        /* 4. Pour Geneanet */
        const g1 = await t.get('export_gedcom', { target: 'geneanet' });
        eq(g1.status, 200, 'Geneanet : exporté'); const ged = g1.buf.toString('utf8'); geneanetGed = ged;
        ok(/genealogie-geneanet-/.test(g1.headers.get('content-disposition')), 'Geneanet : nom du fichier');
        ok(/^1 CHAR UTF-8$/m.test(ged) && /^2 VERS 5\.5\.1$/m.test(ged), 'Geneanet : GEDCOM 5.5.1 en UTF-8');
        ok(!/^\d+ _/m.test(ged), 'Geneanet : aucune balise « _ » propre à LCNDA');
        ok(!/Chloé|Secret de famille|Vivante :|Zoé/.test(ged), 'Geneanet : la vivante et la fiche confidentielle sont cachées');
        ok(/Personne \/vivante\//.test(ged) && /Fiche \/confidentielle\//.test(ged), 'Geneanet : anonymes (liens gardés)');
        ok(/^2 PLAC \[Le Moulin\] - Tulle, 19272, Corrèze, Nouvelle-Aquitaine, France$/m.test(ged), 'Geneanet : lieu au format Geneanet avec code INSEE');
        ok(/^2 FORM Town, Area code, County, Region, Country$/m.test(ged), 'Geneanet : FORM des lieux');
        ok(/^2 FILE https:\/\/www\.example\.org\/acte-mariage\.jpg$/m.test(ged) && !/^0 @M\d+@ OBJE/m.test(ged), 'Geneanet : média en lien, pas de fichier');
        ok(/DUBŒUF/.test(ged) && /Hélène/.test(ged), 'Geneanet : accents');
        const g2 = (await t.get('export_gedcom', { target: 'geneanet', living: 'drop' })).buf.toString('utf8');
        ok(!/Personne \/vivante\//.test(g2) && (g2.match(/^0 @I\d+@ INDI/gm) || []).length === persons - 2, 'Geneanet : vivants et confidentiels retirés (choix « retirés »)');

        /* 5. Gramps */
        const gr = await t.get('export_plus', { format: 'gramps', share: '0' });
        eq(gr.status, 200, 'Gramps : exporté'); ok(gr.buf[0] === 0x1f && gr.buf[1] === 0x8b, 'Gramps : gzippé');
        const xml = zlib.gunzipSync(gr.buf).toString('utf8'); gramps = gr.buf;
        ok(xml.includes('xmlns="http://gramps-project.org/xml/1.7.1/"') && xml.includes('<!DOCTYPE database'), 'Gramps : espace de noms 1.7.1');
        ok(xml.includes('DUBŒUF') && xml.includes('Marie-Thérèse'), 'Gramps : accents');
        ok((xml.match(/<person /g) || []).length === persons, 'Gramps : toutes les personnes (export complet)');
        ok(xml.includes('cformat="Julian"') && xml.includes('cformat="French Republican"'), 'Gramps : calendriers julien et républicain');
        ok(/<daterange start="1840" stop="1850"\/>/.test(xml), 'Gramps : « entre 1840 et 1850 »');
        ok(/role="Witness"/.test(xml), 'Gramps : témoin');
        ok(/<placeobj [^>]*type="Country"/.test(xml) && /<coord long="1\.769" lat="45\.267"\/>/.test(xml), 'Gramps : lieux en hiérarchie, coordonnées');
        ok(/frel="Adopted"/.test(xml), 'Gramps : adoption');
        if (hasXmllint) {
            const f = path.join(t.dir, 'export.gramps.xml'); fs.writeFileSync(f, xml);
            const v = spawnSync('xmllint', ['--noout', '--nonet', '--relaxng', path.join(FIX, 'grampsxml-1.7.1.rng'), f], { encoding: 'utf8' });
            ok(v.status === 0, 'Gramps : valide selon le schéma RELAX NG de Gramps 1.7.1 ' + v.stderr.split('\n').filter(l => !/external entity|grampsxml\.dtd|^\s*\^?$/.test(l)).slice(0, 4).join(' | '));
            const gShare = zlib.gunzipSync((await t.get('export_plus', { format: 'gramps' })).buf).toString('utf8'); fs.writeFileSync(f, gShare);
            ok(spawnSync('xmllint', ['--noout', '--nonet', '--relaxng', path.join(FIX, 'grampsxml-1.7.1.rng'), f], { encoding: 'utf8' }).status === 0, 'Gramps « pour partager » : valide aussi');
            ok(!/Chloé|Secret de famille/.test(gShare) && /priv="1"/.test(gShare), 'Gramps « pour partager » : vivante et confidentielle cachées (priv="1")');
        } else console.log('  – schéma Gramps : sauté (xmllint absent)');

        /* 6. GEDCOM-X */
        const gx = await t.get('export_plus', { format: 'gedcomx' });
        eq(gx.status, 200, 'GEDCOM-X : exporté'); ok(/application\/x-gedcomx-v1\+json/.test(gx.headers.get('content-type')), 'GEDCOM-X : type de média');
        const X = JSON.parse(gx.buf.toString('utf8'));
        const ids = new Set([...(X.persons || []), ...(X.relationships || []), ...(X.sourceDescriptions || []), ...(X.places || []), ...(X.agents || [])].map(o => o.id));
        const refs = []; (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if ((k === 'resource' || k === 'description') && typeof v === 'string' && v.startsWith('#')) refs.push(v.slice(1)); else walk(v); } })(X);
        ok(refs.length > 10 && refs.every(r => ids.has(r)), `GEDCOM-X : ${refs.length} références, toutes trouvées`);
        eq(X.persons.length, persons, 'GEDCOM-X : toutes les personnes');
        ok(X.persons.every(p => /^http:\/\/gedcomx\.org\/(Male|Female|Unknown|Intersex)$/.test(p.gender.type)), 'GEDCOM-X : sexe en URI');
        const facts = X.persons.flatMap(p => p.facts || []);
        ok(facts.every(f => /^(http:\/\/gedcomx\.org\/[A-Za-z]+|data:,.+)$/.test(f.type)), 'GEDCOM-X : types de faits en URI');
        ok(facts.filter(f => f.date?.formal).every(f => /^(A?[+-]\d{4}(-\d{2}(-\d{2})?)?(\/([+-]\d{4}(-\d{2}(-\d{2})?)?)?)?|\/[+-]\d{4}(-\d{2}(-\d{2})?)?)$/.test(f.date.formal)), 'GEDCOM-X : dates formelles');
        ok(facts.some(f => f.date?.formal === '+1792-03-15') && facts.some(f => f.date?.formal === 'A+1840/+1850') && facts.some(f => f.date?.formal === '+1860/'), 'GEDCOM-X : jour précis, entre, après');
        ok(!JSON.stringify(X).includes('Chloé') && X.persons.some(p => p.private), 'GEDCOM-X : vivante cachée');
        ok(X.relationships.some(r => r.type === 'http://gedcomx.org/ParentChild' && r.facts?.[0]?.type === 'http://gedcomx.org/AdoptiveParent'), 'GEDCOM-X : parent adoptif');
        ok(X.places.some(p => p.latitude && p.longitude), 'GEDCOM-X : lieux avec coordonnées');

        /* 7. .ics */
        const ic = await t.get('export_plus', { format: 'ics', who: 'all', groups: 'birth,union,death,feast', alarm: '1' });
        eq(ic.status, 200, '.ics : exporté'); ok(/text\/calendar/.test(ic.headers.get('content-type')), '.ics : type text/calendar');
        const ics = ic.buf.toString('utf8'); const evs = checkIcs(ics);
        eq(Number(ic.headers.get('x-lcnda-count')), evs.length, '.ics : le nombre annoncé = le nombre d’événements');
        ok(evs.some(e => /^Fête de Léon/.test(e.SUMMARY)), '.ics : fêtes du prénom');
        ok(!/Zoé/.test(ics), '.ics : jamais une fiche confidentielle');
        ok(evs.some(e => e.RRULE === 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1'), '.ics : un 29 février revient chaque année');
        ok(Number(ic.headers.get('x-lcnda-skipped')) >= 1, '.ics : dates approchées laissées de côté et comptées');
        ok(/BEGIN:VALARM/.test(ics) && /TRIGGER:-P1D/.test(ics), '.ics : rappel la veille');
        const icL = await t.get('export_plus', { format: 'ics', who: 'all', groups: 'birth', living: '1' });
        const evL = checkIcs(icL.buf.toString('utf8')); ok(evL.length === 1 && /Chloé/.test(evL[0].SUMMARY), '.ics : « vivants seulement » → Chloé');
        const root = one(t.db, "SELECT id FROM persons WHERE first_name='Chloé'");
        const icS = await t.get('export_plus', { format: 'ics', who: 'sosa', root_id: String(root), groups: 'birth' });
        const evS = checkIcs(icS.buf.toString('utf8')); ok(evS.length >= 3 && !evS.some(e => /François/.test(e.SUMMARY)), '.ics : ancêtres Sosa seulement');
        const icN = await t.get('export_plus', { format: 'ics', groups: 'nope' });
        ok(icN.status === 422 && /Coche/.test(JSON.parse(icN.buf).error), '.ics : choix vide refusé avec une phrase');

        /* 8. vCard */
        const vc = await t.get('export_plus', { format: 'vcard' });
        eq(vc.status, 200, 'vCard : exporté'); const cards = checkVcf(vc.buf.toString('utf8'));
        const helene = cards.find(c => c.includes('FN:Hélène Dubœuf'));
        ok(helene && helene.includes('TEL;VALUE=uri;TYPE="cell":tel:+33612345678') && helene.includes('EMAIL;TYPE=home:helene@example.fr'), 'vCard : portable en tel:+33, e-mail');
        ok(helene.includes('ADR;TYPE=home:;;12\\, rue de la Paix;Tulle;;19000;France') && helene.some(l => /^NOTE:cousine\\, branche Faure \\; côté Tulle/.test(l)), 'vCard : adresse et note échappées');
        ok(cards.some(c => c.includes('KIND:org') && c.includes('URL:https://archives.correze.fr')), 'vCard : service d’archives (organisation)');
        const vcA = await t.get('export_plus', { format: 'vcard', which: 'archives' });
        eq(checkVcf(vcA.buf.toString('utf8')).length, 1, 'vCard : une seule sorte de contacts');

        /* 9. KML et GeoJSON */
        const km = await t.get('export_plus', { format: 'kml' });
        eq(km.status, 200, 'KML : exporté'); const kml = km.buf.toString('utf8');
        if (hasXmllint) { const f = path.join(t.dir, 'l.kml'); fs.writeFileSync(f, kml); ok(spawnSync('xmllint', ['--noout', '--nonet', f]).status === 0, 'KML : XML bien formé'); }
        ok(/<kml xmlns="http:\/\/www\.opengis\.net\/kml\/2\.2">/.test(kml) && /<Folder><name>Naissance \(\d+\)<\/name>/.test(kml) && /<Folder><name>Mariage \(\d+\)<\/name>/.test(kml), 'KML : dossiers par sorte d’événement');
        ok(/<coordinates>1\.769,45\.267,0<\/coordinates>/.test(kml) && /<coordinates>-71\.208,46\.813,0<\/coordinates>/.test(kml), 'KML : coordonnées « longitude,latitude »');
        ok(!/Chloé/.test(kml), 'KML : vivante absente');
        const gj = await t.get('export_plus', { format: 'geojson' });
        const G = JSON.parse(gj.buf.toString('utf8'));
        ok(G.type === 'FeatureCollection' && G.features.length >= 4 && G.features.every(f => f.type === 'Feature' && f.geometry.type === 'Point' && f.geometry.coordinates.length === 2 && Math.abs(f.geometry.coordinates[0]) <= 180 && Math.abs(f.geometry.coordinates[1]) <= 90), 'GeoJSON : FeatureCollection de points valides');
        ok(G.features.some(f => f.properties.name === 'Tulle' && f.geometry.coordinates[0] === 1.769), 'GeoJSON : [longitude, latitude]');
        ok(!gj.buf.toString().includes('crs') && !gj.buf.toString().includes('Chloé'), 'GeoJSON : RFC 7946 (pas de crs), vivante absente');
        const bad = await t.get('export_plus', { format: 'exe' });
        eq(bad.status, 422, 'format inconnu refusé');
        const ki = await t.post('kiosk_enter', { password: 'secret1234' });
        if (ki.status === 200) {
            eq((await t.get('export_plus', { format: 'gedcomx' })).status, 423, 'mode consultation : export refusé');
            eq((await t.get('export_gedcom', { target: 'geneanet' })).status, 423, 'mode consultation : GEDCOM Geneanet refusé');
            eq((await t.post('kiosk_exit', { password: 'secret1234' })).status, 200, 'mode consultation : quitté');
        }

        /* 10. Navigateur */
        let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        const browser = await pw.chromium.launch();
        try {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, extraHTTPHeaders: { 'x-carnet-secret': t.s.secret } });
            await ctx.addInitScript(r => { try { localStorage.setItem('genealogie-sosa-root', String(r)); } catch (_) {} }, root);
            const page = await ctx.newPage(); const errors = [];
            page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
            await page.goto(t.base + '/'); await page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.openExportFormat && window.LCNDA_APP.state?.csrf, null, { timeout: 30000 });
            await page.evaluate(() => { const st = window.LCNDA_APP.state; st.maintenanceTab = 'export'; window.LCNDA_APP.setModule('maintenance'); });
            await page.waitForSelector('#h-export-plus [data-export-plus="gramps"]', { timeout: 15000 });
            ok(await page.locator('#h-export-plus [data-export-plus]').count() >= 7, 'écran : au moins 7 formats dans Réglages → Export (d’autres s’ajoutent : Obsidian, réseau, paquets…)');
            if (SHOTS) { await page.locator('#h-export-plus').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SHOTS, 'echanges-1440.png') }); }
            const viaDialog = async (key, expectName) => {
                await page.click(`#h-export-plus [data-export-plus="${key}"]`);
                await page.waitForSelector('dialog.h-modal[open]');
                if (SHOTS && key === 'geneanet') await page.screenshot({ path: path.join(SHOTS, 'echanges-geneanet.png') });
                const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(async e => { throw new Error(key + ' : pas de téléchargement — ' + errors.join(' / ') + ' — ' + (await page.locator('.toast, .h7, [class*=toast]').allTextContents()).join(' / ')); }), page.click('dialog.h-modal[open] [type=submit]')]);
                ok(expectName.test(dl.suggestedFilename()), `écran : ${key} → ${dl.suggestedFilename()}`);
                await page.waitForSelector('dialog.h-modal[open]', { state: 'detached' });
                return fs.readFileSync(await dl.path());
            };
            ok(/Personne \/vivante\//.test((await viaDialog('geneanet', /^genealogie-geneanet-.*\.ged$/)).toString()), 'écran : Geneanet anonymise');
            ok((await viaDialog('gramps', /\.gramps$/))[0] === 0x1f, 'écran : .gramps gzippé');
            await viaDialog('gedcomx', /\.json$/);
            checkIcs((await viaDialog('ics', /^anniversaires-ancetres\.ics$/)).toString());
            checkVcf((await viaDialog('vcard', /\.vcf$/)).toString());
            await viaDialog('kml', /\.kml$/); await viaDialog('geojson', /\.geojson$/);
            // erreur : vCard sans aucune sorte cochée → message sous la case (K1), fenêtre ouverte
            await page.click('#h-export-plus [data-export-plus="vcard"]'); await page.waitForSelector('dialog.h-modal[open]');
            for (const k of ['w_living', 'w_archives', 'w_dna', 'w_courriers']) await page.uncheck(`dialog.h-modal[open] [name=${k}]`);
            await page.click('dialog.h-modal[open] [type=submit]'); await page.waitForTimeout(300);
            ok(await page.locator('dialog.h-modal[open]').count() === 1 && /Coche au moins/.test(await page.textContent('dialog.h-modal[open]')), 'écran : choix vide → phrase sous le champ, fenêtre ouverte');
            const closeDlg = async () => { await page.evaluate(() => document.querySelectorAll('dialog.h-modal[open]').forEach(d => d.close())); await page.waitForSelector('dialog.h-modal[open]', { state: 'detached' }); };
            await closeDlg();
            // Calendrier de la famille → même fenêtre .ics, avec les fêtes
            await page.evaluate(() => window.LCNDA_EXT.openIcsExport());
            await page.waitForSelector('dialog.h-modal[open] [name=g_feast]'); await page.check('dialog.h-modal[open] [name=g_feast]'); await page.check('dialog.h-modal[open] [name=who][value=all]');
            const [dlc] = await Promise.all([page.waitForEvent('download'), page.click('dialog.h-modal[open] [type=submit]')]);
            ok(/Fête de/.test(fs.readFileSync(await dlc.path(), 'utf8')), 'écran : .ics avec les fêtes');
            // Listes → Lieux → ⤓ Exporter ▾ → KML
            await page.evaluate(() => { window.LCNDA_APP.state.listType = 'places'; window.LCNDA_APP.setModule('listes'); });
            await page.waitForSelector('[data-cols-export]', { timeout: 15000 }).catch(() => {});
            if (await page.locator('[data-cols-export]').count()) {
                await page.click('[data-cols-export]'); await page.waitForTimeout(200);
                ok(await page.locator('text=Pour Google Earth (KML)').count() >= 1, 'Listes → Lieux : ⤓ Exporter ▾ propose KML et GeoJSON');
                await page.keyboard.press('Escape');
            } else console.log('  – Listes → Lieux : menu ⤓ Exporter ▾ absent (sauté)');
            await page.evaluate(() => { const st = window.LCNDA_APP.state; st.maintenanceTab = 'export'; window.LCNDA_APP.setModule('maintenance'); });
            await page.waitForSelector('#h-export-plus');
            await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
            const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            ok(over <= 1, '390 px : pas de défilement de côté (' + over + ')');
            await page.click('#h-export-plus [data-export-plus="gramps"]'); await page.waitForSelector('dialog.h-modal[open]');
            if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'echanges-390-gramps.png') });
            await closeDlg();
            await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.setViewportSize({ width: 1440, height: 900 });
            await page.locator('#h-export-plus').scrollIntoViewIfNeeded();
            await page.click('#h-export-plus [data-export-plus="ics"]'); await page.waitForSelector('dialog.h-modal[open]');
            if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'echanges-sombre-ics.png') });
            await closeDlg();
            eq(errors, [], 'navigateur : aucune erreur');
        } finally { await browser.close(); }
    });

    /* aller-retour : Gramps et Geneanet réimportés dans une base neuve */
    await withServer(async t => {
        const r = await t.upload('import_package', gramps, 'retour.gramps');
        eq(r.status, 200, 'Gramps réimporté par l’import Gramps de l’app ' + (r.data.error || ''));
        const st = r.data.stats;
        eq([st.persons, st.families], [9, 3], 'aller-retour Gramps : personnes, familles');
        ok(st.events >= 22, 'aller-retour Gramps : événements (' + st.events + ')');
        eq(one(t.db, 'SELECT count(*) FROM sources'), 1, 'aller-retour Gramps : source');
        ok(one(t.db, 'SELECT count(*) FROM source_links') >= 2, 'aller-retour Gramps : citations');
        ok(one(t.db, 'SELECT count(*) FROM event_witnesses') >= 1, 'aller-retour Gramps : témoin');
        eq(one(t.db, "SELECT count(*) FROM family_children WHERE relation_to_partner1='adopted'"), 1, 'aller-retour Gramps : adoption');
        eq(one(t.db, "SELECT last_name FROM persons WHERE first_name='Odile'"), 'ŒUVRARD', 'aller-retour Gramps : accents');
        ok(one(t.db, "SELECT count(*) FROM places WHERE latitude IS NOT NULL") >= 4, 'aller-retour Gramps : lieux avec coordonnées');
        eq(one(t.db, "SELECT date_text FROM events e JOIN persons p ON p.id=e.person_id JOIN event_types t ON t.id=e.event_type_id WHERE p.first_name='Léon' AND t.gedcom_tag='OCCU'"), 'entre 1840 et 1850', 'aller-retour Gramps : date « entre »');
    });
    await withServer(async t => {
        const r = await t.upload('import_package', Buffer.from(geneanetGed, 'utf8'), 'geneanet.ged');
        eq(r.status, 200, 'GEDCOM Geneanet réimporté'); eq(r.data.stats.persons, 9, 'aller-retour Geneanet : 9 personnes (2 anonymes)');
        eq(r.data.stats.families, 3, 'aller-retour Geneanet : familles');
    });
    console.log(`✓ ${n} vérifications`);
})().catch(e => { console.error(e); process.exit(1); });
