'use strict';
/**
 * 🔒 Audit de sécurité des ajouts de la nuit du 21/10 (K16–K20, diagrammes, F1–F15, mode simple, designs, Studio son, Tableur,
 * Questions aux proches, Partager avec la famille…) :   node tests/test-securite-nuit.js
 *  1. serveur (vrai « php -S » sur une base temporaire) :
 *     - toutes les nouvelles écritures refusent un envoi sans jeton (CSRF, 419) et sont refusées en mode consultation (423),
 *       comme l'export « Partager avec la famille » (lecture) ;
 *     - bornes et validations : lien « javascript: » refusé (Le monde autour, Services d'archives), fichier d'un son hors de ses
 *       versions (« ../ », chemin libre) refusé, classeur de plus de 200 feuilles refusé, fichier de réponses d'un questionnaire
 *       avec un champ inconnu ou une somme de contrôle inconnue refusé, paramètre forgé en tableau sans erreur ;
 *     - défauts du site : le code de sortie du mode simple (même haché) et « qui regarde » n'y sont jamais gardés ;
 *     - « Partager avec la famille » : ni le nom d'un vivant, ni une fiche confidentielle dans le .zip ; CSP sans réseau ;
 *  2. navigateur (Playwright, sinon sauté) : pendant le mode simple, aucun POST ne part — fetch, Request, XMLHttpRequest,
 *     sendBeacon et aussi un formulaire en POST (form.submit, requestSubmit, bouton) ;
 *  3. code : le moteur du tableur refuse un XML avec DOCTYPE / ENTITY ; l'import d'une présentation aussi.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-secu-nuit-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
const ok = msg => console.log('  ✓ ' + msg);

const SEED = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:' . DATA_DIR . '/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT . '/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php';
$pdo = db();
$tag = static function (string $t) use ($pdo): int { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$ins = $pdo->prepare('INSERT INTO persons(first_name,last_name,gender,living_status,is_private,is_start) VALUES(?,?,?,?,?,?)');
$ins->execute(['Jean', 'ANCIEN', 'male', 'deceased', 0, 1]); $old = (int) $pdo->lastInsertId();
$ins->execute(['Zoé', 'VIVANTISSIME', 'female', 'living', 0, 0]); $liv = (int) $pdo->lastInsertId();
$ins->execute(['Paul', 'CONFIDENTIEL', 'male', 'deceased', 1, 0]); $priv = (int) $pdo->lastInsertId();
$ev = $pdo->prepare('INSERT INTO events(scope, person_id, event_type_id, date_text, year) VALUES(\'person\',?,?,?,?)');
$ev->execute([$old, $tag('BIRT'), '1850', 1850]); $ev->execute([$old, $tag('DEAT'), '1920', 1920]); $ev->execute([$liv, $tag('BIRT'), '1990', 1990]);
$pdo->prepare("INSERT INTO families(partner1_id) VALUES(?)")->execute([$old]); $fid = (int) $pdo->lastInsertId();
$pdo->prepare('INSERT INTO family_children(family_id, child_id, position) VALUES(?,?,1),(?,?,2)')->execute([$fid, $liv, $fid, $priv]);
$pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body) VALUES('person', ?, 'Souvenir', 'Il gardait Zoé VIVANTISSIME le dimanche.')")->execute([$old]);
file_put_contents(MEDIA_DIR . '/son.mp3', 'ID3');
$pdo->prepare("INSERT INTO media(title, filename, media_type) VALUES('Un son', 'son.mp3', 'audio')")->execute([]); $snd = (int) $pdo->lastInsertId();
echo json_encode(['old' => $old, 'liv' => $liv, 'priv' => $priv, 'snd' => $snd]);`;
let ID = {};
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', SEED], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    ID = JSON.parse(r.stdout.trim().split('\n').pop());
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

/** les nouvelles écritures (lot de la nuit) : action → corps */
const WRITES = {
    qp_write: { op: 'save', title: 'x', questions: [] }, postcard_write: { op: 'save', media_id: 1 }, photo_comparison_write: { op: 'save' },
    save_workbook: { data: { sheets: [{ name: 'A' }] } }, rename_workbook: { id: 1, name: 'x' }, delete_workbook: { id: 1 },
    controle_dismiss: { key: 'dup:1:2' }, controle_undismiss: { key: 'dup:1:2' }, controle_fix_date: { event_id: 1, date_text: '1850' }, controle_seuils_save: { values: {} },
    save_biography: { person_id: 1, text: 'x' }, save_history_event: { title: 'x', from_year: 1900, reach: 'france' }, delete_history_event: { id: 1 }, save_old_trade: { key: 'x' },
    save_audio_regions: { media_id: 4, regions: [] }, save_audio_transcript: { media_id: 4, lines: [] },
    save_archive_service: { name: 'AD' }, delete_archive_service: { id: 1 }, restore_archive_service: { id: 1 }, save_media_archive: { id: 1 },
    hypothesis_option_save: { hypothesis_id: 1, label: 'x' }, hypothesis_proof_save: { hypothesis_id: 1 }, hypothesis_conclude: { id: 1 },
    save_archive_visit_done: { id: 1 }, archive_visit_item_make_digest: { id: 1 },
};

(async () => {
    const port = Number(process.env.SECU_NUIT_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    let browser = null;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        // une session (cookie) et son jeton
        const boot = await fetch(base + 'api.php?action=bootstrap');
        const cookie = (boot.headers.get('set-cookie') || '').split(';')[0];
        const csrf = (await boot.json()).csrf;
        assert.ok(cookie && csrf, 'session et jeton');
        const get = async (action, q = '') => { const r = await fetch(`${base}api.php?action=${action}${q}`, { headers: { cookie } }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { status: r.status, j, t, r }; };
        const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...(token ? { csrf: token } : {}) }) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, j }; };

        /* 1a. CSRF : sans jeton, ou avec un faux, rien n'est écrit */
        for (const [a, body] of Object.entries(WRITES)) {
            assert.equal((await post(a, body, '')).status, 419, `${a} sans jeton`);
            assert.equal((await post(a, body, 'faux' + csrf.slice(4))).status, 419, `${a} faux jeton`);
        }
        ok(`${Object.keys(WRITES).length} nouvelles écritures : refusées sans jeton ou avec un faux jeton (419)`);

        /* 1b. validations et bornes */
        let r = await post('save_history_event', { title: 'Lien piégé', from_year: 1900, to_year: 1900, reach: 'france', url: 'javascript:alert(1)' });
        assert.ok(r.j?.error && /http/.test(r.j.error), 'monde autour : javascript: refusé');
        r = await post('save_archive_service', { name: 'AD piège', website_url: 'javascript:alert(1)//http://x' });
        assert.ok(r.j?.error, 'service d’archives : javascript: refusé');
        r = await post('save_archive_service', { name: 'AD piège 2', search_url: 'data:text/html,<script>1</script>' });
        assert.ok(r.j?.error, 'service d’archives : data: refusé');
        for (const filename of ['../../config/x.mp3', '/etc/passwd', 'autre.mp3']) {
            r = await post('save_audio_regions', { media_id: ID.snd, filename, regions: [{ kind: 'zone', name: 'z', start: 0, end: 1 }] });
            assert.ok(r.j?.error && /version/.test(r.j.error), `Studio son : fichier « ${filename} » refusé`);
            assert.ok((await get('audio_transcript', `&media_id=${ID.snd}&filename=${encodeURIComponent(filename)}`)).j?.error, `lecture « ${filename} » refusée`);
        }
        r = await post('save_audio_regions', { media_id: ID.snd, regions: [{ kind: 'zone', name: '<img src=x onerror=1>', color: 'red;background:url(x)', start: -5, end: 1e9 }] });
        assert.equal(r.j.result.regions[0].color, '#d6336c'); assert.equal(r.j.result.regions[0].start, 0); assert.equal(r.j.result.regions[0].end, 86400);
        r = await post('save_workbook', { name: 'Trop', data: { sheets: Array.from({ length: 201 }, (_, i) => ({ name: 'F' + i })) } });
        assert.ok(r.j?.error && /200/.test(r.j.error), 'tableur : 201 feuilles refusées');
        // questionnaire : un fichier de réponses forgé est refusé (champ inconnu, somme de contrôle inconnue, trop gros)
        const q = (await post('qp_write', { op: 'save', title: 'Souvenirs', recipient: 'txt:Cousin', questions: [{ text: 'Raconte.' }] })).j.questionnaire;
        await post('qp_write', { op: 'render', id: q.id, mode: 'file' });
        const qid = (await get('qp_get', `&id=${q.id}`)).j.questionnaire;
        const html = (await post('qp_write', { op: 'render', id: q.id, mode: 'file' })).j.html;
        const checksum = JSON.parse(html.match(/<script id="qp-data" type="application\/json">(.*?)<\/script>/)[1]).checksum;
        assert.match(html, /Content-Security-Policy" content="default-src 'none'; img-src data:/);
        assert.doesNotMatch(html, /<script[^>]+src=|https?:\/\/(?!www\.w3)/i, 'questionnaire : aucun script ni lien extérieur');
        const file = extra => JSON.stringify({ format: 'lcnda-reponses', version: 1, questionnaire: qid.uid, checksum, answers: [{ id: qid.questions[0].id, answer: 'Oui' }], ...extra });
        assert.equal((await post('qp_write', { op: 'analyze', file: file({}) })).j?.ok, true, 'un vrai fichier passe');
        assert.ok((await post('qp_write', { op: 'analyze', file: file({ __proto__x: 1 }) })).j?.error, 'champ inconnu refusé');
        assert.ok((await post('qp_write', { op: 'analyze', file: file({ checksum: 'a'.repeat(32) }) })).j?.error, 'somme de contrôle inconnue refusée');
        assert.ok((await post('qp_write', { op: 'analyze', file: file({ from: 'x'.repeat(700 * 1024) }) })).j?.error, 'fichier trop gros refusé');
        // paramètres forgés en tableau : pas d'erreur PHP
        for (const qs of ['dates_feter&today[]=1&period[]=x', 'world_events&q[]=x&cat[]=1', 'biography&id=1&length[]=x', 'research_journal&limit[]=1', 'family_share_preview&living[]=x&branches[]=1']) {
            const g = await get(qs.split('&')[0], '&' + qs.split('&').slice(1).join('&'));
            assert.ok(g.status < 500 && g.j, `${qs} : réponse propre (${g.status})`);
        }
        ok('validations : liens javascript:/data: refusés, fichier d’un son hors de ses versions refusé, bornes du Studio son et du tableur, fichier de réponses forgé refusé');

        /* 1c. défauts du site : le mode simple n'y garde ni son code (même haché) ni qui regarde */
        r = await post('save_site_defaults', { settings: { 'genealogie-mode-simple': JSON.stringify({ theme: 'dark', codeHash: 'ab'.repeat(8) + ':' + 'c'.repeat(64), useCode: true, viewer: 3, hiddenPhotos: [1] }),
            'genealogie-mode-simple-presets': JSON.stringify([{ name: 'P', data: { theme: 'sepia', codeHash: 'x', viewer: 2 } }]) } });
        assert.ok(!r.j?.error, r.j?.error);
        const sset = (await get('bootstrap')).j.siteDefaults?.settings || {};
        const ms = JSON.parse(sset['genealogie-mode-simple'] || '{}'), msp = JSON.parse(sset['genealogie-mode-simple-presets'] || '[]');
        assert.equal(ms.theme, 'dark'); assert.equal(ms.codeHash, undefined); assert.equal(ms.viewer, undefined); assert.equal(ms.hiddenPhotos, undefined);
        assert.equal(msp[0].data.theme, 'sepia'); assert.equal(msp[0].data.codeHash, undefined);
        ok('défauts du site : ni code de sortie du mode simple, ni « qui regarde », ni photos cachées');

        /* 1d. « Partager avec la famille » : vivants et fiches confidentielles ne partent pas */
        const z = await get('family_share_export', '&living=first&notes=1&photos=1&title=' + encodeURIComponent('<script>alert(1)</script>'));
        assert.equal(z.status, 200);
        const zipFile = path.join(tmp, 'partage.zip'); fs.writeFileSync(zipFile, Buffer.from(await (await fetch(`${base}api.php?action=family_share_export&living=first&notes=1&title=${encodeURIComponent('<script>alert(1)</script>')}`, { headers: { cookie } })).arrayBuffer()));
        const un = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', '$z=new ZipArchive();$z->open($argv[1]);echo $z->getFromName("index.html");', zipFile], { encoding: 'utf8' });
        const idx = un.stdout;
        assert.ok(idx.length > 1000, 'index.html dans le zip');
        assert.doesNotMatch(idx, /VIVANTISSIME/, 'le nom du vivant ne part pas (ni dans les notes)');
        assert.doesNotMatch(idx, /CONFIDENTIEL|"Paul"/, 'la fiche confidentielle ne part pas');
        assert.match(idx, /ANCIEN/); assert.match(idx, /\[nom retiré\]/);
        assert.match(idx, /Content-Security-Policy" content="default-src 'none'/);
        assert.doesNotMatch(idx, /<title>[^<]*<script/i, 'titre échappé');
        assert.doesNotMatch(idx.replace(/<script id="fs-data"[\s\S]*?<\/script>/, ''), /<script>alert/, 'titre échappé dans les données');
        ok('Partager avec la famille : ni vivant, ni fiche confidentielle, nom retiré des notes, CSP sans réseau, titre échappé');

        /* 1e. mode consultation : toutes les nouvelles écritures et l'export du partage sont refusés */
        assert.ok(!(await post('kiosk_enter', { password: 'secret1' })).j?.error);
        for (const [a, body] of Object.entries(WRITES)) assert.equal((await post(a, body)).status, 423, `${a} en consultation`);
        assert.equal((await get('family_share_export', '&living=hide')).status, 423);
        assert.equal((await get('family_share_preview', '&living=hide')).status, 423);
        assert.equal((await get('mode_simple_data')).status, 200, 'la lecture reste permise');
        assert.ok(!(await post('kiosk_exit', { password: 'secret1' })).j?.error);
        ok('mode consultation : nouvelles écritures et partage refusés (423), la lecture reste permise');

        /* 3. code : XML avec DOCTYPE / ENTITY refusé */
        const SHEET = require('../assets/js/app-tableur-engine.js');
        const xmlFn = SHEET.parseXml || SHEET.readXml || SHEET.xml;
        if (typeof xmlFn === 'function') {
            assert.throws(() => xmlFn('<?xml version="1.0"?><!DOCTYPE a [<!ENTITY b "bbbb">]><a>&b;</a>'), /DOCTYPE|ENTITY/);
        }
        const kn = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-keynote.js'), 'utf8');
        assert.match(kn, /const parseXml = s => \{ if \(\/<!DOCTYPE\|<!ENTITY\/i\.test/, 'présentation : import XML sans DOCTYPE ni ENTITY');
        const ms2 = fs.readFileSync(path.join(appRoot, 'assets/js/app-mode-simple.js'), 'utf8');
        assert.doesNotMatch(ms2 + fs.readFileSync(path.join(appRoot, 'assets/js/app-tableur-engine.js'), 'utf8'), /\beval\(|new Function\(/);
        ok('XML avec DOCTYPE/ENTITY refusé (tableur, présentation) ; ni eval ni new Function');

        /* 2. navigateur : mode simple vraiment en lecture seule */
        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, rt => rt.abort());
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.modeSimple && window.LCNDA_APP?.state?.csrf);
        await page.evaluate(() => window.LCNDA_EXT.modeSimple.open()); await page.waitForSelector('.ms');
        const posts = []; page.on('request', rq => { if (!/^(GET|HEAD)$/.test(rq.method())) posts.push(rq.method() + ' ' + rq.url()); });
        const tries = await page.evaluate(async () => {
            const out = {}; const A = window.LCNDA_APP;
            try { await A.api('delete_person', {}, { method: 'POST', body: { id: 1 } }); out.api = 'parti'; } catch (_) { out.api = 'arrêté'; }
            try { await fetch(new Request('api.php?action=delete_person', { method: 'POST', body: '{}' })); out.req = 'parti'; } catch (_) { out.req = 'arrêté'; }
            const x = new XMLHttpRequest(); x.open('post', 'api.php?action=delete_person'); x.send('{}');
            out.beacon = navigator.sendBeacon('api.php?action=delete_person', '{}');
            const fr = document.createElement('iframe'); fr.name = 'secu-f'; document.body.appendChild(fr);
            const mk = () => { const f = document.createElement('form'); f.method = 'post'; f.action = 'api.php?action=delete_person'; f.target = 'secu-f'; f.innerHTML = `<input name="csrf" value="${A.state.csrf}"><input name="id" value="1"><button type="submit">x</button>`; document.body.appendChild(f); return f; };
            mk().submit(); mk().requestSubmit(); mk().querySelector('button').click();
            await new Promise(r => setTimeout(r, 800));
            return out;
        });
        assert.deepEqual(tries, { api: 'arrêté', req: 'arrêté', beacon: false });
        assert.deepEqual(posts, [], 'aucun POST pendant le mode simple : ' + posts.join(', '));
        assert.ok((await page.evaluate(() => window.LCNDA_EXT.modeSimple.debug().guard.blocked.length)) >= 6);
        const persons = (await get('mode_simple_data')).j.persons.length;
        assert.equal(persons, 3, 'rien supprimé');
        assert.deepEqual(errors, []);
        ok('mode simple : fetch, Request, XHR, sendBeacon et formulaires POST (submit, requestSubmit, bouton) arrêtés');
        console.log('test-securite-nuit : tout est bon');
    } finally {
        if (browser) await browser.close();
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
})().catch(e => { console.error(e); process.exit(1); });
