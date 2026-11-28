'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔗 Archives à consulter (docs/donnees-manquantes.md B-26, B-27, partie C) :   node tests/test-liens-archives.js
 *  1. sans réseau : chaque site du lot 27 a sa source, une adresse https, sa règle « Où chercher » ; les adresses avec le nom ;
 *     les liens d'une commune ; ⌘K ; les intentions « Je veux… » (toutes traduites en en es de it pt pl nl) ; la partie
 *     « Archives britanniques et américaines » ne propose rien pour une fiche vivante ;
 *  2. un vrai « php -S » (GENEALOGY_TEST=1 + LCNDA_TEST_UKUS_DIR à la place des sites) : Kew cherche et ne garde rien ; NARA sans
 *     clé n'appelle rien (seulement le lien) ; la clé s'enregistre (fichier 600), n'est jamais renvoyée, la réponse est gardée ;
 *     vivant, peut-être vivant, confidentiel : refusés sans appel ; mode consultation : rien ne part, la clé ne change pas.
 * Données fictives (MAZAUD, LACOMBE, DURAND).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + String(e && e.stack || e).split('\n').slice(0, 12).join('\n    ')); } };

(async () => {
    global.window = global;
    const L = require('../assets/js/app-liens-archives-core.js');
    require('../assets/js/app-je-veux-moteur.js');
    require('../assets/js/heritage-liens-archives.js');
    const ext = global.LCNDA_EXT;
    const langs = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
    const J = Object.fromEntries(langs.map(l => [l, JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/i18n', l + '.json'), 'utf8'))]));
    const P = {first: 'Jean Pierre', last: 'MAZAUD', place: 'Tulle, Corrèze', y1: 1850, y2: 1920};

    await t('les 16 sites de la partie C : source, adresse https, règle et phrase « pourquoi », thème des listes', () => {
        assert.equal(L.SITES.length, 16);
        const themes = ['seismes', 'eaux', 'ciel', 'guerres', 'monuments', 'village', 'images', 'lieux', 'pouvoirs', 'noms', 'personnes', 'metiers', 'terre', 'routes', 'croire', 'prix', 'livres', 'fetes', 'evenements', 'sport'];
        for (const s of L.SITES) {
            assert.ok(s.source && s.label && s.icon, s.key);
            assert.match(L.url(s.key, P), /^https:\/\//, s.key);
            assert.match(L.url(s.key, {}), /^https:\/\//, `${s.key} sans personne`);
            assert.ok(typeof s.rel?.why === 'function' && s.rel.why().length > 20, s.key);
            assert.ok(themes.includes(s.theme), `${s.key} : thème ${s.theme}`);
            assert.ok(L.GROUPS.some(g => g.id === s.group), s.key);
        }
        assert.equal(new Set(L.SITES.map(s => s.key)).size, L.SITES.length);
    });
    await t('adresses : le nom dans Gallica, FranceArchives, HathiTrust ; un modèle « ⚙️ Adresses des sites » passe devant', () => {
        assert.equal(L.url('bulletin_lois', P), 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=' + encodeURIComponent('(gallica all "Jean MAZAUD") and (gallica all "Bulletin des lois")'));
        assert.equal(L.url('conscription', P), 'https://francearchives.gouv.fr/fr/search?q=' + encodeURIComponent('tirage au sort conscription Tulle'));
        assert.match(L.url('hathitrust', P), /^https:\/\/babel\.hathitrust\.org\/cgi\/ls\?q1=%22Jean%20MAZAUD%22/);
        assert.equal(L.url('cie_indes', P), 'https://www.memoiredeshommes.sga.defense.gouv.fr/', 'pas de forme connue : l’accueil, le nom copié');
        assert.equal(L.copyText('cie_indes', P), 'MAZAUD Jean');
        assert.equal(L.url('gedbas', P, {gedbas: 'https://gedbas.example/?n={nom}&p={prenom}'}), 'https://gedbas.example/?n=MAZAUD&p=Jean');
        assert.equal(L.url('gedbas', P, {gedbas: 'javascript:alert(1)'}), 'https://gedbas.genealogy.net/', 'un modèle dangereux est ignoré');
    });
    await t('liens d’une commune : France (tirage au sort, mercuriales, HathiTrust), Antibes a ses plaques, ailleurs HathiTrust seul', () => {
        assert.deepEqual(L.placeLinks({name: 'Tulle', country: 'France'}).map(x => x.key), ['conscription', 'hathitrust', 'mercuriales']);
        assert.deepEqual(L.placeLinks({name: 'Antibes', country: 'France'}).map(x => x.key), ['conscription', 'hathitrust', 'mercuriales', 'plaques_antibes']);
        assert.deepEqual(L.placeLinks({name: 'Leuven', country: 'Belgique'}).map(x => x.key), ['hathitrust']);
        assert.deepEqual(L.placeLinks({}), []);
        for (const x of L.placeLinks({name: 'Antibes'})) assert.ok(x.source && /^https:\/\//.test(x.href));
    });
    await t('⌘K : le nom d’un site le trouve, un simple nom de famille non ; « national archives » mène à Où chercher', () => {
        assert.deepEqual(L.match('red star line').map(s => s.key), ['red_star_line']);
        assert.equal(L.match('Bulletin des lois')[0].key, 'bulletin_lois');
        assert.equal(L.match('tirage au sort')[0].key, 'conscription');
        assert.deepEqual(L.match('MAZAUD'), []);
        const r = ext.liensArchives.provider('archives américaines');
        assert.ok(r.length && /Archives britanniques/.test(r[0].label) && typeof r[0].go === 'function');
        assert.ok(ext.liensArchives.provider('Red Star Line').some(x => x.label.startsWith('↗ ') && /Musée Red Star Line/.test(x.hint)), '↗ et la source');
        assert.deepEqual(ext.liensArchives.provider('ab'), []);
    });
    await t('Listes → Données : une carte « lien » par site, avec ↗ et la source ; la monographie a sa partie', () => {
        const mine = (ext.dataLists || []).filter(d => String(d.id).startsWith('link_so27_'));
        assert.equal(mine.length, 16);
        for (const d of mine) { assert.equal(typeof d.link, 'function'); assert.ok(d.source.startsWith('↗ ') && d.theme); }
        assert.ok((ext.monographSections || []).some(s => s.id === 'so27_liens' && typeof s.render === 'function'));
    });
    await t('🧭 Je veux… : une intention par site + Kew/NARA, avec leur cible ; tout est traduit', () => {
        const E = ext.jeVeuxEngine;
        const hand = E.hand().filter(i => i.id === 'ukus_search' || i.id.startsWith('so27_'));
        assert.equal(hand.length, 17);
        for (const i of hand) { assert.ok(i.go && i.path.length && i.fam === 'chercher'); if (i.id !== 'ukus_search') assert.equal(i.targets[0], `list:data_link_${i.id}`); }
        const miss = [];
        for (const l of langs) for (const i of hand) for (const s of [i.name, i.does, ...i.path]) if (J[l][s] == null) miss.push(`[${l}] ${s}`);
        assert.deepEqual([...new Set(miss)], []);
        const reg = E.build({});
        for (const [q, id] of [['chercher un testament anglais', 'ukus_search'], ['la red star line', 'so27_red_star_line'], ['bulletin des lois naturalisation', 'so27_bulletin_lois'], ['les gardes mobiles de 1870', 'so27_gardes_mobiles']]) {
            const top = E.rank(E.analyse(q, reg), reg).slice(0, 3).map(x => x.it.id);
            assert.ok(top.includes(id), `« ${q} » : ${top.join(', ')}`);
        }
    });
    await t('textes traduits : noms, sources, phrases « pourquoi » (en es de it pt pl nl)', () => {
        const miss = [];
        for (const l of langs) for (const s of L.SITES) for (const k of [s.label, `↗ ${s.source}`, s.rel.why()]) if (J[l][k] == null) miss.push(`[${l}] ${k}`);
        assert.deepEqual(miss, []);
    });
    await t('🇬🇧🇺🇸 la partie de « Où chercher » : rien pour une fiche vivante, peut-être vivante ou confidentielle', () => {
        const ctx = {first: 'Jean', last: 'MAZAUD', by: 1850, dy: 1910, deathKnown: true, countries: new Map([['gb', 1]]), profiles: new Set()};
        const view = raw => ({pid: 1, res: {ctx: {...ctx, ...(raw.ctx || {})}}, data: {raw: {person: raw.person}}});
        const ok = ext.liensArchives.sectionHtml(view({person: {living: 'deceased', birth_year: 1850}}));
        assert.match(ok, /data-ukus-form/); assert.match(ok, /discovery\.nationalarchives\.gov\.uk\/results\/r\?_q=Jean%20MAZAUD/); assert.match(ok, /catalog\.archives\.gov\/search\?q=/);
        assert.match(ok, /⚙️ Personnaliser/); assert.match(ok, / open>/, 'une vie au Royaume-Uni : ouverte');
        for (const p of [{living: 'living', birth_year: 1950}, {living: 'unknown', birth_year: 1990}, {living: 'deceased', birth_year: 1850, private: true}]) {
            const h = ext.liensArchives.sectionHtml(view({person: p, ctx: {deathKnown: false, by: p.birth_year}}));
            assert.doesNotMatch(h, /data-ukus-form|https:\/\//, JSON.stringify(p)); assert.match(h, /🔒/);
        }
    });

    /* ═════════ 2. le serveur ═════════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); console.log(`\n${pass} ✓, ${fail} ✗`); process.exit(fail ? 1 : 0); }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ukus-'));
    const site = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ukus-site-'));
    fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    fs.writeFileSync(path.join(site, 'tna.json'), JSON.stringify({count: 2, records: [
        {id: 'C1234567', reference: 'PROB 11/1234/56', title: 'Will of Jean Mazaud, Gentleman of London', description: 'Will of Jean <b>Mazaud</b>', coveringDates: '1855', heldBy: ['The National Archives, Kew']},
        {id: 'bad id!', title: 'ignorée'}]}));
    fs.writeFileSync(path.join(site, 'nara.json'), JSON.stringify({body: {hits: {total: {value: 1}, hits: [{_source: {record: {naId: 123456, title: 'Declaration of Intention: Jean Mazaud', productionDates: [{logicalDate: '1880-01-01'}],
        ancestors: [{levelOfDescription: 'series', title: 'Naturalization Records'}]}}}]}}}));
    const calls = () => (fs.existsSync(path.join(site, 'calls.log')) ? fs.readFileSync(path.join(site, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean) : []);
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_TEST: '1', LCNDA_TEST_UKUS_DIR: site};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status,is_private) VALUES(1,'Jean Pierre','MAZAUD','male',1,'deceased',0),(2,'Paul','DURAND','male',0,'living',0),(3,'Marie','LACOMBE','female',0,'deceased',1),(4,'Anne','MAZAUD','female',0,'unknown',0)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES(?,?,?,?,?)');
foreach ([[1,'BIRT','1850',1850],[1,'DEAT','1910',1910],[2,'BIRT','1950',1950],[3,'BIRT','1850',1850],[4,'BIRT','1990',1990]] as [$pid,$tag,$dt,$y]) { $ev->execute(['person',$pid,$t($tag),$dt,$y]); }
echo 'ok|' . DATA_DIR . '|' . SHARED_DATA_DIR;`], {cwd: appRoot, encoding: 'utf8', env});
    if (seed.status !== 0 || !String(seed.stdout).startsWith('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const [, DATA, SHARED] = String(seed.stdout).trim().split('|');
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const kill = () => { try { proc.kill(); } catch (_) {} };
    process.on('exit', kill);
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 300; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, {headers: {Cookie: cookie}}); return {status: r.status, json: await r.json(), raw: r}; };
    const post = async (action, body) => { const r = await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({...body, csrf})}); let json = {}; try { json = await r.json(); } catch (_) {} return {status: r.status, json}; };
    try {
        await t('Kew : le nom exact et les années de sa vie ; les notices et leur lien ; rien n’est gardé (2ᵉ clic = 2ᵉ appel)', async () => {
            const r = await get('ukus_tna_search', {id: 1, kind: 'wills'});
            assert.equal(r.status, 200, JSON.stringify(r.json));
            assert.equal(r.json.rows.length, 1, 'la notice à l’identifiant illisible est écartée');
            assert.equal(r.json.rows[0].url, 'https://discovery.nationalarchives.gov.uk/details/r/C1234567');
            assert.equal(r.json.rows[0].description, 'Will of Jean Mazaud');
            assert.equal(r.json.search_url, 'https://discovery.nationalarchives.gov.uk/results/r?_q=Jean%20MAZAUD');
            assert.match(r.json.attribution, /The National Archives/);
            const c = calls(); assert.equal(c.length, 1);
            assert.match(c[0], /^tna https:\/\/discovery\.nationalarchives\.gov\.uk\/API\/search\/records\?/);
            assert.match(c[0], /sps\.searchQuery=%22Jean\+MAZAUD%22/); assert.match(c[0], /sps\.dateFrom=1850-01-01/); assert.match(c[0], /sps\.dateTo=1910-12-31/); assert.match(c[0], /sps\.recordSeries=PROB\+11/);
            await get('ukus_tna_search', {id: 1, kind: 'wills'});
            assert.equal(calls().length, 2, 'pas de cache pour Kew');
            const tables = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; echo db()->query("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'ukus_tna%'")->fetchColumn();`], {cwd: appRoot, encoding: 'utf8', env});
            assert.equal(String(tables.stdout).trim(), '0');
        });
        await t('vivant, peut-être vivant (né en 1990, sans décès), confidentiel : refusés, aucun appel', async () => {
            const before = calls().length;
            for (const id of [2, 4, 3]) {
                for (const a of ['ukus_tna_search', 'ukus_nara_search']) { const r = await get(a, {id}); assert.equal(r.status, 422, `${a} ${id}`); assert.match(r.json.error, /vivante|confidentielle/); }
            }
            assert.equal(calls().length, before);
        });
        await t('NARA sans clé : aucun appel, le lien de recherche seulement', async () => {
            const before = calls().length;
            const r = await get('ukus_nara_search', {id: 1});
            assert.equal(r.json.need_key, true); assert.equal(r.json.search_url, 'https://catalog.archives.gov/search?q=' + encodeURIComponent('"Jean MAZAUD"'));
            assert.equal(calls().length, before);
            assert.deepEqual((await get('ukus_state')).json, {kiosk: false, nara_key: false});
        });
        await t('NARA avec la clé : enregistrée (600), jamais renvoyée ; envoyée en en-tête ; réponse gardée 30 jours', async () => {
            assert.equal((await post('ukus_nara_key_save', {key: 'court'})).status, 422);
            const k = 'TEST-key_0123456789abcdef';
            const s = await post('ukus_nara_key_save', {key: k});
            assert.equal(s.status, 200, JSON.stringify(s.json)); assert.ok(!JSON.stringify(s.json).includes(k));
            const f = path.join(SHARED, 'genealogie-nara-cle.json');
            assert.ok(fs.existsSync(f)); if (process.platform !== 'win32') assert.equal(fs.statSync(f).mode & 0o777, 0o600);
            const st = await get('ukus_state'); assert.deepEqual(st.json, {kiosk: false, nara_key: true});
            const before = calls().length;
            const r = await get('ukus_nara_search', {id: 1});
            assert.equal(r.status, 200, JSON.stringify(r.json)); assert.ok(!JSON.stringify(r.json).includes(k));
            assert.equal(r.json.rows[0].url, 'https://catalog.archives.gov/id/123456'); assert.equal(r.json.rows[0].reference, 'Naturalization Records'); assert.equal(r.json.found, 1); assert.equal(r.json.cached, false);
            assert.match(r.json.attribution, /sans être approuvé par NARA/);
            const c = calls(); assert.equal(c.length, before + 1); assert.match(c.at(-1), /^nara https:\/\/catalog\.archives\.gov\/api\/v2\/records\/search\?.*q=%22Jean\+MAZAUD%22.* key$/);
            const r2 = await get('ukus_nara_search', {id: 1}); assert.equal(r2.json.cached, true); assert.equal(calls().length, before + 1, 'gardée : pas de 2ᵉ appel');
        });
        await t('mode consultation (et invité du wifi) : aucune recherche, la clé ne change pas', async () => {
            const pw = spawnSync(phpPath, ['-r', 'echo password_hash("secret1", PASSWORD_DEFAULT);'], {encoding: 'utf8'}).stdout;
            fs.writeFileSync(path.join(DATA, 'consultation.json'), JSON.stringify({hash: pw, since: '2026-11-26'}));
            try {
                const before = calls().length;
                const r = await get('ukus_tna_search', {id: 1}); assert.equal(r.status, 422); assert.match(r.json.error, /consultation/);
                const n = await get('ukus_nara_search', {id: 1}); assert.equal(n.status, 422);
                assert.equal(calls().length, before);
                assert.equal((await get('ukus_state')).json.kiosk, true);
                assert.equal((await post('ukus_nara_key_forget', {})).status, 423);
                assert.ok(fs.existsSync(path.join(SHARED, 'genealogie-nara-cle.json')));
            } finally { fs.unlinkSync(path.join(DATA, 'consultation.json')); }
            assert.equal((await post('ukus_nara_key_forget', {})).status, 200);
            assert.ok(!fs.existsSync(path.join(SHARED, 'genealogie-nara-cle.json')));
        });
    } finally { kill(); fs.rmSync(dir, {recursive: true, force: true}); fs.rmSync(site, {recursive: true, force: true}); }
    console.log(`\n${pass} ✓, ${fail} ✗`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
