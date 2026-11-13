'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⤒ Imports et exports « en plus » (lib/imports_plus.php, assets/js/app-imports-plus-core.js, heritage-imports-plus.js) :
 *     node tests/test-imports-exports-3b.js
 * Fixtures inventées : tests/fixtures/imports-3b/. Un vrai « php -S » sur une base neuve, puis un navigateur (Playwright ; sinon sauté).
 *  1. Relevés : Nimègue v3 sans titres (Windows-1252), Nimègue avec titres (CSV et .ods), CSV d'un cercle (colonnes reconnues),
 *     CSV piégé (formules vidées, cases bornées) ; import dans les dépouillements ; « c'est la même personne ? » ; une personne
 *     citée dans plusieurs actes = une seule fiche ; une fiche existante n'est jamais modifiée ; « déjà importé » ; ↶ Annuler.
 *  2. Tableau de personnes (CSV, .xlsx, Sosa) : fiches, événements, couples, enfants ; liens par n°, par nom, par Sosa ;
 *     « c'est la même personne » ; faux .xlsx et .xls refusés ; ↶ Annuler.
 *  3. Sources ↔ RIS / BibTeX : accents (LaTeX et UTF-8), sortes, cote ; doublons laissés ; aller-retour RIS et BibTeX sans perte ;
 *     fichier piégé refusé ; taille bornée. Atelier de recherche : aller-retour .bib / .ris (navigateur), XML avec ENTITY refusé.
 *  4. Lieux KML / GeoJSON : rapprochement par nom + département ; les fichiers de lib/echanges.php se relisent sans perte ;
 *     compléter, créer, ↶ Annuler ; KML avec DOCTYPE / ENTITY refusé ; GeoJSON abîmé refusé ; taille bornée.
 *  5. Navigateur : les quatre fenêtres (étape 2), un import de relevés jusqu'au bout, sans erreur de page.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const SH = require('../assets/js/app-tableur-engine.js');
const IM = require('../assets/js/app-imports-plus-core.js');

const appRoot = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures', 'imports-3b');
const fx = n => fs.readFileSync(path.join(FX, n));
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-imp3b-'));
const dir = path.join(tmp, 'a');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' ORDER BY id LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county,state,country,latitude,longitude) VALUES(1,'Naves','Corrèze','Nouvelle-Aquitaine','France',NULL,NULL),(2,'Tulle','Corrèze','Nouvelle-Aquitaine','France',45.2672,1.765),(3,'Brive-la-Gaillarde','Corrèze','Nouvelle-Aquitaine','France',45.1588,1.5332),(4,'Seilhac','Corrèze','Nouvelle-Aquitaine','France',NULL,NULL),(5,'Seilhac','Gironde','Nouvelle-Aquitaine','France',44.8,-0.5)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender) VALUES(1,'Jean','Martin','male'),(2,'Louis','Faurie','male'),(3,'Henri','Brunet','male')");
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',1," . $t('CHR') . ",'12/03/1745',1745,1),('person',2," . $t('BIRT') . ",'14/05/1882',1882,2),('person',3," . $t('BIRT') . ",'1920',1920,3),('person',3," . $t('DEAT') . ",'1999',1999,4)");
$pdo->exec("INSERT INTO sources(source_type,title,author,agency,publication,url,text,archive_cote) VALUES('book','Histoire de Tulle','Jean-Pierre Delmas','Éditions de la Veytizou','1994','','Chapitre sur la Manufacture d’armes.','')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sql = q => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); echo json_encode($p->query(${JSON.stringify(q)})->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return JSON.parse(r.stdout); };
const one = q => Object.values(sql(q)[0] || {})[0];
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['✓', name]); } catch (e) { results.push(['✗', name, e]); } };

(async () => {
    const port = Number(process.env.IMP3B_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    let browser = null;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const getRaw = (action, q = {}) => fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } });
        const postRaw = async (action, body) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await r.json() }; };
        const post = async (action, body) => { const r = await postRaw(action, body); assert.equal(r.status, 200, `${action} : ${JSON.stringify(r.body).slice(0, 300)}`); return r.body.result; };
        const table = async n => IM.readTable(SH, n, fx(n));
        const actsOf = async n => { const t = await table(n); const p = IM.prepareReleves(t.rows); return { t, p, ...IM.rowsToActs(p, p.mapping) }; };

        /* ═════ 1. Relevés ═════ */
        await check('Nimègue v3 sans titres (Windows-1252) : 4 baptêmes, accents, rôles, nom de l’enfant repris du père', async () => {
            const { t, p, acts, stats } = await actsOf('nimegue-naves-baptemes-v3.csv');
            assert.equal(t.encoding, 'windows-1252'); assert.equal(p.mode, 'positional'); assert.equal(p.type, 'N');
            assert.equal(acts.length, 4); assert.equal(stats.formulas, 0);
            assert.deepEqual(acts[0].people.map(x => x.role), ['sujet', 'pere', 'mere', 'parrain', 'marraine']);
            assert.equal(acts[0].dept, 'Corrèze'); assert.equal(acts[1].people[3].last, 'CHÈZE'); assert.equal(acts[2].people[0].first, 'Étienne');
            assert.equal(acts[1].people[0].last, 'MARTIN', 'Françoise porte le nom du père'); assert.equal(acts[0].no, '12'); assert.equal(acts[0].cote, '3 E 146/2');
            assert.equal(acts.reduce((n, a) => n + a.people.length, 0), 18);
        });
        await check('Nimègue avec titres (CSV et .ods) : 2 mariages, époux, épouse, parents, ancien conjoint, 4 témoins', async () => {
            for (const n of ['nimegue-naves-mariages-titres.csv', 'nimegue-naves-mariages.ods']) {
                const { p, acts } = await actsOf(n);
                assert.equal(p.mode, 'header', n); assert.equal(acts.length, 2, n);
                assert.ok(acts.every(a => a.type === 'M'));
                const roles = acts[1].people.map(x => x.role);
                assert.deepEqual(roles, ['epoux', 'epouse', 'pere_epoux', 'mere_epoux', 'pere_epouse', 'mere_epouse', 'ex', 'temoin', 'temoin', 'temoin', 'temoin'], n);
                assert.equal(acts[1].people[6].last, 'VIALLE'); assert.equal(acts[0].note, 'dispense de consanguinité au 4e degré');
            }
        });
        await check('CSV d’un cercle : colonnes reconnues par leur titre, sorte « décès » devinée, date républicaine gardée', async () => {
            const { p, acts } = await actsOf('cercle-seilhac-deces.csv');
            assert.equal(p.mode, 'csv'); assert.equal(p.type, 'D');
            assert.deepEqual(p.mapping, ['DATETXT', 'NOM', 'PRE', 'SEXE', 'AGE', 'PRO', 'P_NOM', 'P_PRE', 'M_NOM', 'M_PRE', 'C_PRE', 'T1_NOM', 'T2_NOM', 'COMGEN', 'COTE', 'PAGE']);
            assert.equal(acts.length, 3); assert.equal(acts[1].date, '17 fructidor an X');
            const conj = acts[0].people.find(x => x.role === 'conjoint'); assert.equal(conj.last, 'BORIE'); assert.equal(conj.first, 'Anne');
            assert.equal(acts[0].page, '12');
        });
        await check('CSV piégé : formules jamais reprises (4 vidées), case énorme bornée, ligne vide sautée', async () => {
            const { acts, stats } = await actsOf('cercle-piege-formules.csv');
            assert.equal(stats.formulas, 4); assert.equal(acts.length, 3);
            const all = JSON.stringify(acts); assert.doesNotMatch(all, /HYPERLINK|SOMME|CMD|calc'/);
            assert.ok(acts[2].note.length <= IM.LIMITS.cell);
            const srv = await postRaw('releves_import', { acts: [{ type: 'N', date: '1800', people: [{ role: 'sujet', first: '=1+1', last: '@A1' }, { role: 'pere', first: 'Jean', last: 'VERGNE' }] }], label: 'piège' });
            assert.equal(srv.status, 200); const line = sql("SELECT content FROM archive_digest_transcription_lines ORDER BY id DESC LIMIT 1")[0].content;
            assert.doesNotMatch(line, /=1\+1|@A1/); await post('releves_undo', { token: srv.body.result.undo });
            const big = await postRaw('releves_check', { acts: Array.from({ length: 20001 }, () => ({ type: 'N', date: '1800', people: [{ role: 'sujet', first: 'A', last: 'B' }] })) });
            assert.equal(big.status, 422); assert.match(big.body.error, /Trop d’actes/);
        });
        await check('Relevés → dépouillements : « c’est la même personne ? », un père cité deux fois = une fiche, fiche existante intacte, ↶ Annuler', async () => {
            const { acts } = await actsOf('nimegue-naves-baptemes-v3.csv');
            const before = { persons: one('SELECT count(*) FROM persons'), events: one('SELECT count(*) FROM events'), digests: one('SELECT count(*) FROM archive_digest_entries') };
            const c = await post('releves_check', { acts, with_links: 1 });
            assert.equal(c.acts, 4); assert.equal(c.already, 0);
            const jean = c.links.find(l => l.a === 0 && l.p === 0); assert.equal(jean.candidates[0]?.id, 1, 'Jean MARTIN (baptisé en 1745) est proposé');
            assert.equal(c.links.find(l => l.a === 2 && l.p === 0).candidates.length, 0);
            const groups = IM.releveGroups(acts);
            assert.equal(groups.length, 10, 'Pierre MARTIN et Marie DUPONT, cités dans 2 actes, ne comptent qu’une fois');
            const links = {};
            for (const g of groups) for (const [a, p] of g.members) links[`${a}:${p}`] = a === 0 && p === 0 ? { mode: 'link', id: 1 } : { mode: 'create', g: g.key };
            const r = await post('releves_import', { acts, links, label: 'nimegue-naves-baptemes-v3.csv', format: 'Nimègue' });
            assert.equal(r.acts, 4); assert.equal(r.people, 18); assert.equal(r.created, 9); assert.equal(r.linked, 1);
            assert.equal(one("SELECT count(*) FROM persons WHERE first_name='Pierre' AND last_name='MARTIN'"), 1);
            assert.equal(one('SELECT count(*) FROM archive_digest_transcription_lines WHERE archive_digest_id=' + r.digests[0]), 4);
            assert.equal(one('SELECT count(*) FROM archive_digest_people WHERE archive_digest_id=' + r.digests[0]), 18);
            assert.equal(one("SELECT record_type FROM archive_digest_entries WHERE id=" + r.digests[0]), 'bapteme');
            assert.equal(one("SELECT year_text FROM archive_digest_entries WHERE id=" + r.digests[0]), '1745–1752');
            assert.equal(one('SELECT count(*) FROM events WHERE person_id=1'), 1, 'la fiche existante n’a pas reçu d’événement en plus');
            assert.equal(one("SELECT count(*) FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN persons p ON p.id=f.partner1_id WHERE fc.child_id=1 AND p.first_name='Pierre'"), 1, 'Jean MARTIN relié à son père créé');
            assert.equal(one("SELECT count(*) FROM family_children fc JOIN persons c ON c.id=fc.child_id WHERE c.first_name IN ('Jean','Françoise') AND c.last_name IN ('Martin','MARTIN')"), 2, 'Jean et Françoise, même famille');
            assert.match(one("SELECT content FROM archive_digest_transcription_lines WHERE archive_digest_id=" + r.digests[0] + " ORDER BY line_number LIMIT 1"), /^Baptême · 12\/03\/1745 · acte 12 — enfant : Jean MARTIN ; père : Pierre MARTIN \(laboureur\)/);
            const again = await post('releves_check', { acts }); assert.equal(again.already, 4, 'déjà importé');
            await post('releves_undo', { token: r.undo });
            assert.equal(one('SELECT count(*) FROM persons'), before.persons); assert.equal(one('SELECT count(*) FROM events'), before.events); assert.equal(one('SELECT count(*) FROM archive_digest_entries'), before.digests);
            assert.equal(one('SELECT count(*) FROM persons WHERE id=1'), 1);
            const twice = await postRaw('releves_undo', { token: r.undo }); assert.equal(twice.status, 422);
        });
        await check('Relevés de mariages : couple et événement de mariage seulement entre fiches créées ou reliées', async () => {
            const { acts } = await actsOf('nimegue-naves-mariages-titres.csv');
            const g = IM.releveGroups(acts), links = {};
            for (const x of g) if (['epoux', 'epouse'].some(l => x.key.startsWith(l))) for (const [a, p] of x.members) links[`${a}:${p}`] = { mode: 'create', g: x.key };
            const r = await post('releves_import', { acts, links, label: 'mariages' });
            assert.equal(r.created, 4); assert.equal(r.families, 2); assert.equal(r.events, 2);
            assert.equal(one("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='MARR' AND e.date_text='25/01/1770'"), 1);
            await post('releves_undo', { token: r.undo });
            assert.equal(one("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='MARR'"), 0);
        });

        /* ═════ 2. Tableau de personnes ═════ */
        const planOf = async (n, opts) => { const t = await table(n); const { head, rows } = IM.headAndRows(t.rows); return IM.buildPeoplePlan(rows, IM.guessPeopleMapping(head), opts); };
        await check('Tableau CSV et .xlsx : mêmes fiches, mêmes familles ; liens par n° et par nom ; n° inconnu signalé', async () => {
            const a = await planOf('personnes-famille-numeros.csv'), b = await planOf('personnes-famille-numeros.xlsx');
            assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
            assert.equal(a.persons.length, 7); assert.equal(a.families.length, 2);
            const louis = a.families.find(f => f.date === '20/06/1908'); assert.deepEqual(louis.children.sort(), ['r6', 'r7']);
            assert.equal(a.persons[0].events.BIRT.date, '14/05/1882', 'date ISO → date comme dans un acte');
            assert.equal(a.issues.length, 1); assert.match(a.issues[0].text, /« 99 » n’est pas dans le tableau/);
        });
        await check('Tableau par n° Sosa : parents et couples déduits (2n, 2n+1), sexes déduits', async () => {
            const p = await planOf('personnes-sosa.csv');
            const byS = Object.fromEntries(p.persons.map(x => [x.sosa, x]));
            assert.equal(byS[2].sex, 'male'); assert.equal(byS[3].sex, 'female');
            const f1 = p.families.find(f => f.children.includes(byS[1].k)); assert.deepEqual([f1.a, f1.b], [byS[2].k, byS[3].k]); assert.equal(f1.date, '1946');
            const f3 = p.families.find(f => f.children.includes(byS[3].k)); assert.deepEqual([f3.a, f3.b], [null, byS[7].k]);
        });
        await check('Noms en double : le lien par nom n’est pas fait (jamais deviné), boucle refusée', async () => {
            const rows = [['Jean', 'MARTIN', ''], ['Jean', 'MARTIN', ''], ['Paul', 'MARTIN', 'Jean MARTIN'], ['Luc', 'ROUX', 'Luc ROUX']];
            const p = IM.buildPeoplePlan(rows, ['first', 'last', 'father'], {});
            assert.equal(p.families.length, 0); assert.ok(p.issues.some(i => /2 lignes portent ce nom/.test(i.text))); assert.ok(p.issues.some(i => /son propre père/.test(i.text)));
        });
        await check('Faux .xlsx et vieil .xls refusés avec une phrase claire', async () => {
            await assert.rejects(IM.readTable(SH, 'faux-excel.xlsx', fx('faux-excel.xlsx')), /n’en est pas un/);
            await assert.rejects(IM.readTable(SH, 'vieux.xls', Buffer.from('ÐÏ\u0011à¡±\u001aá')), /anciens fichiers Excel/);
        });
        await check('Tableau → fiches et familles : « c’est la même personne », événements, mariage, ↶ Annuler', async () => {
            const p = await planOf('personnes-famille-numeros.csv');
            const before = one('SELECT count(*) FROM persons');
            const c = await post('people_table_check', { persons: p.persons, families: p.families });
            assert.equal(c.persons, 7); assert.equal(c.candidates.r2?.[0]?.id, 2, 'Louis FAURIE né en 1882 est proposé');
            const r = await post('people_table_import', { persons: p.persons, families: p.families, same: { r2: 2 }, label: 'personnes.csv' });
            assert.equal(r.created, 6); assert.equal(r.linked, 1); assert.equal(r.families, 2);
            assert.equal(one('SELECT count(*) FROM persons'), before + 6);
            assert.equal(one("SELECT count(*) FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=2"), 1, 'Louis (fiche existante) a ses parents du tableau');
            assert.equal(one("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE t.gedcom_tag='MARR' AND e.date_text='20/06/1908' AND (f.partner1_id=2 OR f.partner2_id=2)"), 1);
            assert.equal(one("SELECT count(*) FROM events WHERE person_id=2"), 1, 'la fiche existante n’a pas reçu les dates du tableau');
            assert.equal(one("SELECT p.gender FROM persons p WHERE p.first_name='Madeleine'"), 'female');
            assert.equal(one("SELECT count(*) FROM notes WHERE body LIKE 'maître forgeron%'"), 0, 'la note d’une ligne reliée à une fiche existante n’est pas posée');
            await post('import_undo', { token: r.undo });
            assert.equal(one('SELECT count(*) FROM persons'), before); assert.equal(one('SELECT count(*) FROM family_children WHERE child_id=2'), 0);
        });

        /* ═════ 3. Sources ↔ RIS / BibTeX ═════ */
        const srcSnap = () => sql('SELECT source_type,title,author,agency,publication,url,text,archive_cote FROM sources ORDER BY title');
        await check('RIS (Zotero) : 4 références, notes sur plusieurs lignes, cote ; doublons laissés au 2e passage', async () => {
            const text = fx('references-zotero.ris').toString('utf8');
            const c = await post('sources_refs_import', { text, mode: 'check' }); assert.equal(c.new, 4);
            const r = await post('sources_refs_import', { text, mode: 'run' }); assert.equal(r.count, 4);
            const s = sql("SELECT * FROM sources WHERE title LIKE 'Les paysans%'")[0]; assert.equal(s.author, 'Alain Corbin'); assert.equal(s.agency, 'Marcel Rivière'); assert.equal(s.source_type, 'book');
            assert.match(s.text, /médiathèque de Tulle\.\nLes chapitres 4 à 6/);
            assert.equal(sql("SELECT archive_cote, source_type FROM sources WHERE title LIKE 'Registre%'")[0].archive_cote, '3 E 146/2');
            assert.equal(sql("SELECT author FROM sources WHERE title LIKE 'L’émigration%'")[0].author, 'Louis Pérouas ; Paul D’Hollander');
            const again = await post('sources_refs_import', { text, mode: 'check' }); assert.equal(again.new, 0); assert.equal(again.dupes, 4);
            await post('import_undo', { token: r.undo });
        });
        await check('BibTeX (JabRef) : accents LaTeX, sortes (archive, témoignage, site), date, cote', async () => {
            const r = await post('sources_refs_import', { text: fx('references-biblatex.bib').toString('utf8'), mode: 'run' }); assert.equal(r.count, 4);
            const t = Object.fromEntries(sql('SELECT title, source_type, publication, archive_cote, text, author FROM sources').map(x => [x.title, x]));
            assert.ok(t['Archaïsme et modernité en Limousin au XIXe siècle']); assert.equal(t['Archaïsme et modernité en Limousin au XIXe siècle'].text, 'Deux tomes & une carte');
            assert.equal(t['Registre paroissial de Naves (1740–1760)'].source_type, 'archive'); assert.equal(t['Registre paroissial de Naves (1740–1760)'].archive_cote, '3 E 146/2');
            assert.equal(t['Relevés de la paroisse de Seilhac'].source_type, 'internet'); assert.equal(t['Relevés de la paroisse de Seilhac'].publication, '2021-05-14');
            assert.equal(t['Relevés de la paroisse de Seilhac'].author, 'Cercle généalogique de la Corrèze');
            assert.equal(t['Souvenirs de la forge de Tulle, racontés en 1998'].source_type, 'testimony'); assert.match(t['Souvenirs de la forge de Tulle, racontés en 1998'].text, /50 % inaudible/);
        });
        await check('Aller-retour des sources : export RIS puis BibTeX, base vidée, réimport = les mêmes sources, champ par champ', async () => {
            const snap = srcSnap(); assert.equal(snap.length, 5);
            for (const format of ['ris', 'bib']) {
                const resp = await getRaw('sources_export', { format }); assert.equal(resp.status, 200); assert.equal(resp.headers.get('x-lcnda-count'), '5');
                const text = await resp.text();
                if (format === 'bib') { assert.match(text, /@book\{corbin1975,/); assert.match(text, /Deux tomes \\& une carte/); } else assert.match(text, /^TY {2}- /m);
                sql('DELETE FROM sources'); assert.equal(one('SELECT count(*) FROM sources'), 0);
                await post('sources_refs_import', { text, mode: 'run' });
                assert.deepEqual(srcSnap(), snap, `aller-retour ${format}`);
            }
        });
        await check('Références piégées (formules, javascript:) refusées ; fichier trop gros refusé ; autre format refusé', async () => {
            const r = await postRaw('sources_refs_import', { text: fx('references-piege.ris').toString('utf8'), mode: 'check' });
            assert.equal(r.status, 422); assert.match(r.body.error, /Aucune référence/);
            const big = await postRaw('sources_refs_import', { text: 'TY  - BOOK\n' + 'x'.repeat(21 * 1048576), mode: 'check' }); assert.notEqual(big.status, 200);
            const other = await postRaw('sources_refs_import', { text: 'bonjour', mode: 'check' }); assert.equal(other.status, 422); assert.match(other.body.error, /ni du RIS/);
        });

        /* ═════ 4. Lieux KML / GeoJSON ═════ */
        await check('Les fichiers KML et GeoJSON de lib/echanges.php se relisent sans perte (mêmes lieux, mêmes coordonnées)', async () => {
            for (const format of ['kml', 'geojson']) {
                const resp = await getRaw('export_plus', { format, share: '0' }); assert.equal(resp.status, 200, format);
                const n = Number(resp.headers.get('x-lcnda-count')); assert.equal(n, 2, format);
                const a = await post('places_geo_analyse', { text: await resp.text() });
                assert.equal(a.points.length, n, format); assert.deepEqual(a.counts, { same: 2, add: 0, differ: 0, choose: 0, create: 0 }, format);
                const tulle = a.points.find(p => p.name === 'Tulle'); assert.equal(tulle.place_id, 2); assert.equal(tulle.county, 'Corrèze'); assert.equal(tulle.state, 'Nouvelle-Aquitaine'); assert.equal(tulle.country, 'France');
                assert.equal(tulle.lat, 45.2672); assert.equal(tulle.lon, 1.765);
            }
        });
        await check('GeoJSON d’un cercle : compléter Naves, homonyme Seilhac départagé par le département, créer Lachaud, ↶ Annuler', async () => {
            const a = await post('places_geo_analyse', { text: fx('lieux-cercle.geojson').toString('utf8') });
            assert.equal(a.ignored, 1); assert.equal(a.invalid, 1);
            const by = Object.fromEntries(a.points.map(p => [p.name, p]));
            assert.equal(by.Naves.kind, 'add'); assert.equal(by.Naves.place_id, 1);
            assert.equal(by.Tulle.kind, 'same'); assert.equal(by.Seilhac.kind, 'add'); assert.equal(by.Seilhac.place_id, 4, 'Seilhac (Corrèze), pas celui de Gironde');
            assert.equal(by['Lachaud (village de Naves)'].kind, 'create');
            const items = a.points.filter(p => p.kind !== 'same').map(p => p.kind === 'create' ? { action: 'create', name: p.name, county: p.county, state: p.state, country: p.country, lat: p.lat, lon: p.lon } : { action: 'update', place_id: p.place_id, lat: p.lat, lon: p.lon });
            const r = await post('places_geo_apply', { items }); assert.equal(r.updated, 2); assert.equal(r.created, 1);
            assert.equal(one('SELECT latitude FROM places WHERE id=1'), 45.3093);
            assert.equal(one("SELECT county FROM places WHERE name='Lachaud (village de Naves)'"), 'Corrèze');
            await post('places_geo_undo', { token: r.undo });
            assert.equal(one('SELECT latitude FROM places WHERE id=1'), null); assert.equal(one("SELECT count(*) FROM places WHERE name LIKE 'Lachaud%'"), 0);
        });
        await check('KML de Google Earth : description « Commune, Département, Région, Pays », ExtendedData, zone ignorée', async () => {
            const a = await post('places_geo_analyse', { text: fx('lieux-google-earth.kml').toString('utf8') });
            const by = Object.fromEntries(a.points.map(p => [p.name, p]));
            assert.equal(by['Brive-la-Gaillarde'].kind, 'same'); assert.equal(by['Brive-la-Gaillarde'].county, 'Corrèze'); assert.equal(by.Naves.county, 'Corrèze');
            assert.equal(by['Le moulin de Lachaud'].kind, 'create'); assert.equal(a.ignored, 1);
        });
        await check('KML piégé (DOCTYPE, ENTITY, fichier système) refusé ; GeoJSON abîmé, trop gros, coordonnées forgées refusés', async () => {
            const r = await postRaw('places_geo_analyse', { text: fx('lieux-piege-entites.kml').toString('utf8') }); assert.equal(r.status, 422); assert.match(r.body.error, /DOCTYPE ou ENTITY/);
            const b = await postRaw('places_geo_analyse', { text: '{"type":"FeatureCollection","features":[' }); assert.equal(b.status, 422); assert.match(b.body.error, /abîmé/);
            const big = await postRaw('places_geo_analyse', { text: '{' + ' '.repeat(21 * 1048576) + '}' }); assert.notEqual(big.status, 200);
            const bad = await postRaw('places_geo_apply', { items: [{ action: 'update', place_id: 2, lat: 999, lon: 1 }, { action: 'create', name: '=cmd', lat: 1, lon: 1 }] }); assert.equal(bad.status, 422);
            assert.equal(one('SELECT latitude FROM places WHERE id=2'), 45.2672);
            const deep = await postRaw('places_geo_analyse', { text: '['.repeat(200) + ']'.repeat(200) }); assert.equal(deep.status, 422);
        });
        await check('Atelier : un export Zotero / EndNote XML avec ENTITY est refusé', async () => {
            const p = await post('save_atelier_project', { title: 'Essai import' });
            const r = await postRaw('atelier_import', { project_id: p.id, text: '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><records><record><titles><title>&x;</title></titles></record></records>' });
            assert.notEqual(r.status, 200); assert.match(r.body.error, /DOCTYPE ou ENTITY/);
        });

        /* ═════ 5. Navigateur ═════ */
        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { results.push(['–', 'navigateur : sauté (Playwright absent)']); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: base }]);
        const page = await ctx.newPage(); const errs = [];
        page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
        await page.goto(base + '#maintenance/import'); await page.waitForFunction(() => window.LCNDA_EXT?.importPlus && document.querySelector('#import-plus-panel'), null, { timeout: 20000 });
        const open = async (kind, file) => { await page.evaluate(([k, n, b64]) => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); window.LCNDA_EXT.importPlus[k]({ files: [new File([bin], n)] }); }, [kind, file, fx(file).toString('base64')]); await page.waitForSelector('dialog.k-import [data-k-go]:not([hidden])'); await page.waitForTimeout(600); };
        const close = () => page.click('dialog.k-import .modal-actions [data-k-x]');
        await check('navigateur : Réglages → Import a le cadre des quatre imports ; Réglages → Export, les sources en RIS / BibTeX', async () => {
            assert.equal(await page.locator('#import-plus-panel [data-import-plus]').count(), 4);
            await page.goto(base + '#maintenance/export'); await page.waitForSelector('#h-export-sources [data-export-sources="bib"]', { timeout: 15000 });
            await page.goto(base + '#maintenance/import'); await page.waitForSelector('#import-plus-panel');
        });
        await check('navigateur : relevés d’un cercle — colonnes, « créer ou relier », import jusqu’au bout avec ↶ Annuler', async () => {
            const n0 = one('SELECT count(*) FROM archive_digest_entries');
            await open('releves', 'nimegue-naves-baptemes-v3.csv');
            assert.match(await page.textContent('dialog.k-import'), /Voilà ce qui va entrer : 4 actes, 18 personnes citées/);
            await page.check('dialog.k-import [name=ip_links]'); await page.waitForSelector('dialog.k-import [data-ip-links] tr[data-g]');
            assert.equal(await page.locator('dialog.k-import [data-ip-links] tr[data-g]').count(), 10);
            assert.equal(await page.locator('dialog.k-import tr.is-undecided').count(), 1, 'Jean MARTIN : à décider');
            await page.click('dialog.k-import [data-k-go]'); await page.waitForTimeout(400);
            assert.ok(await page.locator('dialog.k-import').isVisible(), 'la fenêtre reste ouverte tant qu’une personne est à décider');
            await page.click('dialog.k-import [data-ip-all="same"]'); await page.click('dialog.k-import [data-ip-all="create"]');
            await page.click('dialog.k-import [data-k-go]'); await page.waitForSelector('dialog.k-import', { state: 'detached', timeout: 15000 });
            assert.equal(one('SELECT count(*) FROM archive_digest_entries'), n0 + 1);
            assert.equal(one("SELECT count(*) FROM persons WHERE first_name='Pierre' AND last_name='MARTIN'"), 1);
            await page.getByRole('button', { name: /Annuler/ }).last().click(); await page.waitForTimeout(1200);
            assert.equal(one('SELECT count(*) FROM archive_digest_entries'), n0);
        });
        await check('navigateur : tableau de personnes, références, lieux (étape 2 de chaque fenêtre)', async () => {
            await open('people', 'personnes-famille-numeros.xlsx'); await page.waitForSelector('dialog.k-import [data-ip-dupes] tr[data-k]');
            assert.match(await page.textContent('dialog.k-import'), /7 fiches/); await close();
            await open('sources', 'references-zotero.ris'); assert.match(await page.textContent('dialog.k-import'), /3 sources \(fichier RIS\) — 1 déjà dans ta base/); await close();
            await open('geo', 'lieux-google-earth.kml'); assert.match(await page.textContent('dialog.k-import'), /1 à créer/); await close();
            await open('releves', 'cercle-piege-formules.csv'); assert.match(await page.textContent('dialog.k-import'), /4 cases contenaient une formule/); await close();
        });
        await check('navigateur : Atelier de recherche — aller-retour .bib et .ris sans perte (accents, archive, cote, notes, date)', async () => {
            const refs = [{ id: 1, title: 'Les montreurs de vues d’optique', type: 'reference', tags: ['optique', 'colportage'], data: { kind: 'livre', creators: [{ last: 'Mannoni', first: 'Laurent', role: 'auteur' }], year: '1994', publisher: 'Nathan', place: 'Paris', pages: '12-45', notes: 'Prêté par la médiathèque', isbn: '2-09-190590-3' } },
                { id: 2, title: 'Registre des passeports, Tulle', type: 'reference', tags: [], data: { kind: 'archive', creators: [{ last: 'Préfecture de la Corrèze', first: '', role: 'auteur' }], year: '1852', date: '1852-03-04', archive: 'Archives départementales de la Corrèze', call_number: '4 M 120' } }];
            const out = await page.evaluate(r => ({ bib: window.LCNDA_EXT.atelierRefs.toBibtex(r), ris: window.LCNDA_EXT.atelierRefs.toRis(r) }), refs);
            for (const fmt of ['bib', 'ris']) {
                const pr = await post('save_atelier_project', { title: 'Aller-retour ' + fmt });
                const r = await post('atelier_import', { project_id: pr.id, text: out[fmt] }); assert.equal(r.count, 2, fmt);
                const items = sql(`SELECT title, data_json FROM atelier_items WHERE project_id=${pr.id} ORDER BY id`).map(x => ({ title: x.title, data: JSON.parse(x.data_json) }));
                assert.equal(items[0].title, 'Les montreurs de vues d’optique');
                assert.equal(items[0].data.publisher, 'Nathan'); assert.equal(items[0].data.place, 'Paris'); assert.equal(items[0].data.notes, 'Prêté par la médiathèque', fmt); assert.match(items[0].data.pages, /^12.{1,2}45$/);
                assert.equal(items[0].data.creators[0].last, 'Mannoni'); assert.equal(items[0].data.isbn, '2-09-190590-3');
                assert.equal(items[1].data.kind, 'archive', fmt); assert.equal(items[1].data.archive, 'Archives départementales de la Corrèze', fmt); assert.equal(items[1].data.call_number, '4 M 120', fmt); assert.equal(items[1].data.date, '1852-03-04', fmt);
            }
        });
        await check('navigateur : aucune erreur de page', () => assert.deepEqual(errs, []));
    } catch (e) {
        results.push(['✗', 'déroulé', e]);
    } finally {
        if (browser) await browser.close().catch(() => {});
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
        let bad = 0;
        for (const [m, name, err] of results) { console.log(`  ${m} ${name}`); if (m === '✗') { bad++; console.log('     ', String(err?.stack || err).split('\n').slice(0, 4).join('\n      ')); } }
        console.log(bad ? `\n${bad} échec(s) sur ${results.length}` : `\n${results.length} vérifications passées`);
        process.exit(bad ? 1 : 0);
    }
})();
