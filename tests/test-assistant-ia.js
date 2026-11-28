#!/usr/bin/env node
/* 🤖 L'assistant IA (lib/assistant_ia.php, assets/js/heritage-assistant-ia.js, assets/css/assistant-ia.css ; maquette docs/design/assistant-ia.html).
 * Un FAUX Ollama (dans ce programme) répond avec des réponses enregistrées et des appels d'outils simulés ; Open Archives est
 * remplacé par les réponses enregistrées de tests/fixtures/pistes-auto/ (GENEALOGY_TEST=1 + LCNDA_TEST_OPENARCH_DIR). Noms fictifs.
 *  1. conversation : appels d'outils exécutés par l'app, citations vérifiées (puces), renvoi inventé retiré, « supposé » en jaune ;
 *  2. action proposée → « voici exactement ce qui sera écrit » → ajout (marqué « à vérifier ») → ↶ ;
 *  3. vivants et fiches 🔒 : jamais transmis (tout ce qui part au faux Ollama est inspecté) ; refus sur une fiche cachée ;
 *  4. modèle sans appel d'outils → protocole JSON ;
 *  5. 🕵️ généalogiste : plan, Open Archives intercepté (journal des envois), pistes avec preuve, ✓ Ajouter et ↶ ; désactivable ;
 *  6. ✍️ récit → note « 📖 Biographie à relire » (la biographie de l'app ne change pas) et ↶ ;
 *  7. Réglages → 🤖 IA ; éteint ; sans Ollama : tout reste éteint avec un message clair ; 390 px ; aucune erreur.
 *   node tests/test-assistant-ia.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

/* ═════════ le faux Ollama ═════════ */
const sent = []; // tout ce que l'app a envoyé au modèle (pour vérifier que rien de privé ne part)
const lastUser = msgs => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'user' && !/^Résultat de l’outil/.test(msgs[i].content || '')) return i; return -1; };
const toolCall = (name, args) => ({message: {role: 'assistant', content: '', tool_calls: [{function: {name, arguments: args}}]}, done: true});
const say = content => ({message: {role: 'assistant', content}, done: true});
function brain(j) {
    const msgs = j.messages || [];
    const all = msgs.map(m => m.content || '').join('\n');
    if (/Tu es un généalogiste/.test(all)) { // 🕵️ : classer les pistes (JSON)
        const ctx = JSON.parse(all.slice(all.indexOf('{', all.indexOf('(JSON) :')), all.indexOf('\n\nClasse')));
        const death = ctx.pistes_trouvees.find(p => /Décès/.test(p.titre)), birth = ctx.pistes_trouvees.find(p => /Naissance/.test(p.titre));
        if (!death || !birth) return say(JSON.stringify({resume: 'Peu de choses.', pistes: []}));
        return say(JSON.stringify({resume: 'Deux pistes solides à Leyde.', pistes: [
            {titre: 'Il est mort en 1910 à Leyde', preuve: 'Un acte de décès de Jan MAZAUD [fiche 1] à Leyde, avec ses parents Pieter MAZAUD [fiche 2] et Maria LACOMBE [fiche 3].', confiance: 'forte', pistes: [death.piste], ajout: null},
            {titre: 'Sa naissance confirmée', preuve: 'L’acte de naissance de 1850 [fiche 1] nomme les mêmes parents [fiche 4242].', confiance: 'forte', pistes: [birth.piste, 9999],
                ajout: {quoi: 'note', titre: 'Piste : naissance à Leyde', texte: 'Acte de naissance trouvé dans Open Archives.', raison: 'mêmes parents'}}]}));
    }
    if (/Écris le récit de vie/.test(all)) { // ✍️
        const src = (all.match(/"source":(\d+)/) || [])[1] || '0';
        return say(`Jeanne MAZAUD [fiche 12] naît en 1880 à Tulle [source ${src}]. Elle aimait sans doute les fleurs du jardin (supposé). Elle meurt en 1960 [fiche 12].`);
    }
    const ui = lastUser(msgs); const q = ui >= 0 ? msgs[ui].content : '';
    const after = msgs.slice(ui + 1);
    const results = after.filter(m => m.role === 'tool' || /^Résultat de l’outil/.test(m.content || '')).map(m => { const c = m.content.replace(/^Résultat de l’outil \w+ : /, ''); try { return JSON.parse(c); } catch (_) { return {}; } });
    if (j.format === 'json') { // le protocole JSON (modèle sans appel d'outils)
        if (!results.length) return say(JSON.stringify({outil: 'chercher_personnes', arguments: {nom: 'MAZAUD'}}));
        const p = (results[0].personnes || []).find(x => /Jan/.test(x.nom || ''));
        return say(JSON.stringify({reponse: `Les MAZAUD de ton arbre : Jan MAZAUD [fiche ${p ? p.fiche : 0}] et sa famille.`}));
    }
    if (/Corrèze/.test(q)) {
        if (results.length === 0) return toolCall('chercher_personnes', {lieu: 'Corrèze', annee_max: 1900, ancetres_seulement: true});
        if (results.length === 1) return toolCall('lire_fiche', {fiche: results[0].personnes[0].fiche});
        const card = results[1]; const src = card.sources[0].source; const dad = card.parents.find(x => x.fiche).fiche;
        return say(`J’ai trouvé une ancêtre en Corrèze avant 1900 :\n- Jeanne MAZAUD [fiche ${card.fiche}] est née en 1880 à Tulle [source ${src}].\n- Son père Jan MAZAUD [fiche ${dad}] était forgeron. Pierre MAZAUD [fiche 999] vivait aussi à Tulle. Elle s’est mariée en 1777 [fiche ${card.fiche}].\n\nLa famille venait sans doute du Limousin.`);
    }
    if (/Corrige/.test(q)) { // l'IA essaie de supprimer, puis de « corriger » un décès qui existe déjà
        if (results.length === 0) return toolCall('proposer_ajout', {fiche: 12, quoi: 'supprimer', raison: 'doublon'});
        if (results.length === 1) return toolCall('proposer_ajout', {fiche: 12, quoi: 'evenement', evenement: 'DEAT', date: '1961', lieu: 'Tulle', raison: 'autre date'});
        return say('Je propose une autre date de décès pour Jeanne MAZAUD [fiche 12] (supposé).');
    }
    if (/décès/i.test(q)) {
        if (!results.length) return toolCall('proposer_ajout', {fiche: 1, quoi: 'evenement', evenement: 'DEAT', date: 'après 1880', lieu: 'Tulle', raison: 'cité comme père en 1880'});
        return say('Je propose d’ajouter le décès de Jan MAZAUD [fiche 1] (supposé).');
    }
    if (/personne vivante/.test(q)) { // la question nommait des vivants : elle arrive ici sans leurs noms
        if (results.length === 0) return toolCall('chercher_personnes', {nom: 'DURAND'});
        if (results.length === 1) return toolCall('lire_fiche', {fiche: (results[0].personnes[0] || {}).fiche || 13});
        return say(`Je ne vois que Louis DURAND [fiche 13] ; les autres sont des personnes vivantes.`);
    }
    return say('Je ne sais pas.');
}
const fake = http.createServer((req, res) => { let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/version') return void res.end('{"version":"0.12.6"}');
    if (req.url === '/api/tags') return void res.end(JSON.stringify({models: [{name: 'qwen3-vl:8b-instruct'}, {name: 'texte-seul:7b'}]}));
    if (req.url === '/api/show') { const m = JSON.parse(body || '{}').model; return void res.end(JSON.stringify({capabilities: m === 'texte-seul:7b' ? ['completion'] : ['completion', 'vision', 'tools']})); }
    if (req.url === '/api/chat') {
        const j = JSON.parse(body || '{}'); sent.push(j);
        if (j.model === 'texte-seul:7b' && j.tools) { res.statusCode = 400; return void res.end(JSON.stringify({error: 'registry.ollama.ai/library/texte-seul:7b does not support tools'})); }
        return void res.end(JSON.stringify(brain(j)));
    }
    res.statusCode = 404; res.end('{}'); }); });

(async () => {
    const oport = await freePort(); await new Promise(r => fake.listen(oport, '127.0.0.1', r));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-aia-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.cpSync(path.join(__dirname, 'fixtures/pistes-auto'), net0, {recursive: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_OPENARCH_DIR: net0,
        LCNDA_OLLAMA_URL: `http://127.0.0.1:${oport}`, LCNDA_RAM_GB: '16'};
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const q = sql => JSON.parse(php(`$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');echo json_encode($p->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`) || '[]');
    php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private) VALUES
 (1,'Jan','MAZAUD','male','deceased',0,0),(2,'Pieter','MAZAUD','male','deceased',0,0),(3,'Maria','LACOMBE','female','deceased',0,0),
 (5,'Anne','LACOMBE','female','deceased',0,1),(10,'Lucie','DURAND','female','living',1,0),(11,'Paul','DURAND','male','unknown',0,0),
 (12,'Jeanne','MAZAUD','female','deceased',0,0),(13,'Louis','DURAND','male','deceased',0,0)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3),(2,1,NULL),(3,NULL,12),(4,13,NULL),(5,11,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,12),(3,13),(4,11),(5,10)");
$pdo->exec("INSERT INTO places(id,name,county,country,admin2_code) VALUES(1,'Leiden','','Pays-Bas',''),(2,'Tulle','Corrèze','France','19')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'4 septembre 1850',1850,1]); $ins->execute([2,$t('BIRT'),'1820',1820,1]); $ins->execute([3,$t('BIRT'),'1824',1824,1]);
$ins->execute([5,$t('BIRT'),'1850',1850,2]); $ins->execute([5,$t('DEAT'),'1920',1920,2]);
$ins->execute([10,$t('BIRT'),'1985',1985,2]); $ins->execute([11,$t('BIRT'),'1955',1955,2]);
$ins->execute([12,$t('BIRT'),'3 mars 1880',1880,2]); $jb = (int) $pdo->lastInsertId(); $ins->execute([12,$t('DEAT'),'1960',1960,2]);
$ins->execute([13,$t('BIRT'),'1910',1910,2]); $ins->execute([13,$t('DEAT'),'1990',1990,2]);
$pdo->exec("INSERT INTO sources(id,title,url,text) VALUES(1,'Naissance de Jeanne MAZAUD, Tulle 1880','https://archives.example/tulle-1880','Acte n° 12')");
$pdo->prepare("INSERT INTO source_links(entity_type,entity_id,source_record_id) VALUES('event',?,1)")->execute([$jb]);
$pdo->exec("INSERT INTO notes(entity_type,entity_id,title,body) VALUES('person',12,'Mariage','fille de Jan MAZAUD, forgeron')");
echo 'ok';`);
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    // le même dossier, mais Ollama absent (adresse où rien ne répond)
    const deadPort = await freePort(), port2 = await freePort(), base2 = `http://127.0.0.1:${port2}/`;
    const proc2 = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port2}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: {...env, LCNDA_OLLAMA_URL: `http://127.0.0.1:${deadPort}`}, stdio: 'ignore'});
    for (const b of [base, base2]) for (let i = 0; i < 100; i++) { try { await fetch(b + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const boot = async (b, w = 1440, h = 900) => {
        const p = await (await browser.newContext({viewport: {width: w, height: h}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(b); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openDialog, null, {timeout: 30000});
        if (!await p.evaluate(() => !!window.LCNDA_EXT?.assistantIA)) { // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
            await p.addStyleTag({url: b + 'assets/css/assistant-ia.css'});
            await p.addScriptTag({url: b + 'assets/js/heritage-assistant-ia.js'});
        }
        await p.waitForSelector('#aia-open', {state: 'attached', timeout: 10000});
        return p;
    };
    const undo = async (p, re) => { // « ↶ Annuler » du dernier message qui correspond (le locator se relit si le message est redessiné)
        const b = p.locator('.ui-toast, .toast').filter({hasText: re}).last().locator('button', {hasText: /Annuler/});
        await b.waitFor({timeout: 10000});
        await b.evaluate(x => x.click()); // le message peut encore glisser (pile de messages) : un clic direct
    };
    const waitIdle = p => p.waitForFunction(() => !document.querySelector('.aia-panel .aia-working') && !document.querySelector('.aia-panel textarea').disabled, null, {timeout: 30000});
    const askUi = async (p, text) => { await p.fill('.aia-panel textarea', text); await p.click('.aia-panel [data-aia-form] button[type=submit]'); await p.waitForTimeout(200); await waitIdle(p); };
    try {
        const p = await boot(base);
        const post = (x, b) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}).then(r => r.result ?? r).catch(e => ({error: e.message})), [x, b]);

        /* ═════════ 1. la conversation ═════════ */
        await t('🤖 la barre du haut ouvre l’assistant : « Sur cet ordinateur · Qwen3-VL 8B », questions d’exemple', async () => {
            await p.click('#aia-open');
            await p.waitForSelector('.aia-panel.is-open [data-aia-suggestion]', {timeout: 15000});
            const w = await p.textContent('.aia-panel [data-aia-where]');
            assert.match(w, /Sur cet ordinateur · Qwen3-VL 8B/); assert.match(w, /Rien ne quitte l’ordinateur/);
        });
        await t('une question : les outils sont appelés par l’app (chercher, lire la fiche), la réponse cite fiches et sources', async () => {
            const before = sent.length;
            await askUi(p, 'Qui de mes ancêtres a vécu en Corrèze avant 1900 ?');
            const mine = sent.slice(before);
            assert.ok(mine.length >= 3, `${mine.length} appels au modèle`);
            assert.ok(mine[0].tools?.some(x => x.function.name === 'chercher_personnes'), 'les outils sont décrits au modèle');
            assert.ok(mine.some(j => j.messages.some(m => m.role === 'tool' && m.tool_name === 'lire_fiche')), 'le résultat de lire_fiche est rendu au modèle');
            const r = await p.evaluate(() => { const b = [...document.querySelectorAll('.aia-panel .aia-msg.is-bot')].pop();
                return {persons: [...b.querySelectorAll('.aia-chip.is-p')].map(x => Number(x.dataset.aiaPerson)), sources: [...b.querySelectorAll('.aia-answer .aia-chip.is-s')].map(x => x.textContent),
                    sup: [...b.querySelectorAll('.aia-sup')].map(x => x.textContent.trim()), warn: b.querySelector('.aia-warn')?.textContent || '', how: b.querySelector('.aia-how summary')?.textContent || '', list: b.querySelector('.aia-sources')?.textContent || ''}; });
            assert.deepStrictEqual([...new Set(r.persons)].sort((a, b) => a - b), [1, 12], JSON.stringify(r));
            assert.deepStrictEqual(r.sources, ['S1']); assert.match(r.list, /Naissance de Jeanne MAZAUD, Tulle 1880/);
            assert.match(r.how, /Comment j’ai trouvé \(2 recherches dans ta base\)/);
        });
        await t('vérifié : le renvoi inventé (fiche 999) est retiré et signalé ; une année que la fiche n’a pas, « sans doute » → « supposé » en jaune', async () => {
            const r = await p.evaluate(() => { const b = [...document.querySelectorAll('.aia-panel .aia-msg.is-bot')].pop();
                return {sup: [...b.querySelectorAll('.aia-sup')].map(x => x.textContent.trim()), warn: b.querySelector('.aia-warn')?.textContent || '', legend: b.querySelector('.aia-legend')?.textContent || '', ok: [...b.querySelectorAll('.aia-answer > ul > li > span:not(.aia-sup), .aia-answer > p > span:not(.aia-sup)')].map(x => x.textContent.trim()), html: b.innerHTML}; });
            assert.ok(!/999/.test(r.html.replace(/aia-warn[\s\S]*$/, '')), 'aucune puce vers la fiche 999');
            assert.match(r.warn, /1 renvoi\(s\) inventé\(s\) retiré\(s\) : fiche 999/);
            assert.strictEqual(r.sup.length, 3, JSON.stringify(r.sup));
            assert.ok(r.sup.some(s => /Pierre MAZAUD/.test(s)) && r.sup.some(s => /1777/.test(s)) && r.sup.some(s => /sans doute/.test(s)));
            assert.ok(r.ok.some(s => /née en 1880 à Tulle/.test(s)), 'la phrase sourcée n’est pas en jaune');
            assert.match(r.legend, /Le jaune marque ce qui est supposé/);
        });
        await t('cliquer une puce verte ouvre la source ; une puce bleue ouvre la fiche', async () => {
            await p.click('.aia-panel .aia-answer .aia-chip.is-s');
            await p.waitForSelector('dialog[open] .aia-srcbox', {timeout: 10000});
            const txt = await p.textContent('dialog[open]'); assert.match(txt, /Naissance de Jeanne MAZAUD/); assert.match(txt, /Acte n° 12/);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p.click('.aia-panel .aia-answer .aia-chip.is-p[data-aia-person="12"]');
            await p.waitForFunction(() => window.LCNDA_APP.state.currentPersonId === 12 || window.LCNDA_APP.state.currentPerson?.person?.id == 12, null, {timeout: 10000});
        });

        /* ═════════ 2. l'action proposée, puis ↶ ═════════ */
        await t('action proposée : « voici exactement ce qui sera écrit », changer une ligne, ✓ Ajouter (décès « à vérifier »), puis ↶', async () => {
            await askUi(p, 'Propose d’ajouter son décès.');
            await p.waitForSelector('.aia-panel [data-aia-prop]', {timeout: 10000});
            assert.match(await p.textContent('.aia-panel .aia-prop'), /Action proposée : Ajouter à la fiche de Jan MAZAUD : décès après 1880, Tulle \(à vérifier\)/);
            assert.strictEqual(q("SELECT count(*) n FROM events WHERE person_id=1")[0].n, 1, 'rien n’est écrit avant le clic');
            await p.click('.aia-panel [data-aia-prop]');
            await p.waitForSelector('dialog[open] .aia-lines', {timeout: 10000});
            const lines = await p.textContent('dialog[open] .aia-lines');
            assert.match(lines, /Décès : après 1880, Tulle — à vérifier/); assert.match(lines, /Proposé par l’assistant IA le \d\d\/\d\d\/\d{4} : cité comme père en 1880/);
            await p.click('dialog[open] .aia-edit summary'); await p.fill('dialog[open] [name="lieu"]', 'Tulle (Corrèze)');
            await p.click('dialog[open] [type=submit]');
            await p.waitForSelector('.aia-panel .aia-prop.is-added', {timeout: 10000});
            const ev = q("SELECT e.fact_confidence, e.date_text, e.research_note, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=1 AND t.gedcom_tag='DEAT'");
            assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].fact_confidence, 'doubt'); assert.strictEqual(ev[0].date_text, 'après 1880');
            assert.match(ev[0].place, /Tulle \(Corrèze\)/); assert.match(ev[0].research_note, /Proposé par l’assistant IA/);
            await undo(p, /Ajouté à la fiche de Jan MAZAUD/);
            await p.waitForFunction(() => document.querySelector('.aia-panel [data-aia-prop]'), null, {timeout: 10000});
            assert.strictEqual(q("SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=1 AND t.gedcom_tag='DEAT'")[0].n, 0, '↶ retire tout');
        });
        await t('seulement ajouter : l’app refuse une proposition qui corrigerait (décès déjà là) ou un type inconnu', async () => {
            const before = sent.length;
            await askUi(p, 'Corrige le décès de Jeanne.');
            const back = JSON.stringify(sent.slice(before).map(j => j.messages.filter(m => m.role === 'tool').map(m => m.content)));
            assert.match(back, /seulement ajouter/, 'supprimer : refusé dès la proposition');
            const c = (await p.evaluate(() => window.LCNDA_APP.api('aia_convs'))).rows[0];
            const conv = (await p.evaluate(id => window.LCNDA_APP.api('aia_conv', {id}), c.id)).conv;
            const prop = conv.proposals[conv.proposals.length - 1];
            assert.strictEqual(prop.quoi, 'evenement');
            const e = await post('aia_apply', {conv_id: c.id, proposal: prop.id});
            assert.match(e.error || '', /déjà cet événement : l’assistant ne corrige rien/);
            assert.strictEqual(q("SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=12 AND t.gedcom_tag='DEAT'")[0].n, 1, 'son décès de 1960 est intact');
            assert.match((await post('aia_apply', {conv_id: c.id, proposal: 999})).error || '', /introuvable/);
        });

        /* ═════════ 3. vivants et fiches 🔒 ═════════ */
        await t('vivants : la question qui les nomme part sans leurs noms ; les outils les rendent en « personne vivante » ; rien de privé dans ce qui part au modèle', async () => {
            await p.click('.aia-panel [data-aia-new]');
            await askUi(p, 'Parle-moi de Lucie DURAND et de Paul DURAND.');
            const ans = await p.evaluate(() => [...document.querySelectorAll('.aia-panel .aia-msg.is-bot')].pop().textContent);
            assert.match(ans, /Louis DURAND/);
            assert.match(await p.evaluate(() => [...document.querySelectorAll('.aia-panel .aia-msg.is-user')].pop().textContent), /Lucie DURAND/, 'l’écran garde la question telle quelle');
            const blob = JSON.stringify(sent);
            for (const bad of ['Lucie', 'Paul', 'Anne', '1985', '1955']) assert.ok(!blob.includes(bad), `« ${bad} » est parti au modèle`);
            assert.ok(blob.includes('personne vivante'));
            assert.ok(/personnes_vivantes_non_montrees\\?":2/.test(blob), 'deux DURAND vivants comptés, jamais nommés');
        });
        await t('une fiche vivante ou 🔒 : l’assistant, le généalogiste et le récit refusent avec une phrase claire', async () => {
            for (const [a, b] of [['aia_chat_start', {question: 'Raconte', person_id: 10}], ['aia_gen_start', {person_id: 5}], ['aia_recit_start', {person_id: 11}]]) {
                const r = await post(a, b); assert.match(r.error || '', /personne vivante ou confidentielle/, a);
            }
            const menu = await p.evaluate(() => window.LCNDA_EXT.personMenuItems({person: {id: 10, living_status: 'living'}}).map(x => x.key || ''));
            assert.ok(!menu.some(k => /^aia-/.test(k)), 'pas de menu IA sur une fiche vivante');
            const menu2 = await p.evaluate(() => window.LCNDA_EXT.personMenuItems({person: {id: 1, living_status: 'deceased'}}).map(x => x.label));
            assert.ok(['Demander à propos de cette personne', 'Généalogiste IA : chercher ce qui manque', 'Récit de vie par l’IA'].every(l => menu2.includes(l)), JSON.stringify(menu2));
        });

        /* ═════════ 4. un modèle qui ne sait pas appeler les outils ═════════ */
        await t('modèle sans appel d’outils : l’app passe au protocole JSON, la réponse est vérifiée pareil', async () => {
            await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('genealogie-assistant-ia') || '{}'); s.model = 'texte-seul:7b'; localStorage.setItem('genealogie-assistant-ia', JSON.stringify(s)); });
            await p.evaluate(() => window.LCNDA_EXT.assistantIA.status(true));
            await p.click('.aia-panel [data-aia-new]');
            const before = sent.length;
            await askUi(p, 'Qui sont les MAZAUD ?');
            const mine = sent.slice(before);
            assert.ok(mine[0].tools && mine.slice(1).every(j => !j.tools && j.format === 'json'), 'd’abord les outils (refusés), ensuite du JSON');
            assert.match(mine[1].messages[0].content, /Tu réponds TOUJOURS par un seul objet JSON/);
            const r = await p.evaluate(() => [...[...document.querySelectorAll('.aia-panel .aia-msg.is-bot')].pop().querySelectorAll('.aia-chip.is-p')].map(x => Number(x.dataset.aiaPerson)));
            assert.deepStrictEqual(r, [1]);
            assert.match(await p.evaluate(() => [...document.querySelectorAll('.aia-panel .aia-msg.is-bot')].pop().textContent), /l’app lui parle en JSON/);
            await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('genealogie-assistant-ia') || '{}'); delete s.model; localStorage.setItem('genealogie-assistant-ia', JSON.stringify(s)); });
            await p.evaluate(() => window.LCNDA_EXT.assistantIA.status(true));
            await p.click('.aia-panel [data-aia-close]');
        });

        /* ═════════ 5. le généalogiste ═════════ */
        await t('🕵️ généalogiste : trous, plan (ordinateur puis 🌐 Open Archives intercepté), pistes classées avec preuve et confiance', async () => {
            const c0 = calls().length;
            await p.evaluate(() => window.LCNDA_EXT.assistantIA.openGen(1));
            await p.waitForFunction(() => document.querySelectorAll('dialog[open] .aia-lead').length >= 2 && !document.querySelector('dialog[open] .aia-did .aia-dots'), null, {timeout: 30000});
            const r = await p.evaluate(() => { const d = document.querySelector('dialog[open]');
                return {gaps: [...d.querySelectorAll('.aia-gap')].map(x => x.textContent), steps: [...d.querySelectorAll('.aia-did .aia-step')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
                    leads: [...d.querySelectorAll('.aia-lead h4')].map(x => x.textContent.replace(/\s+/g, ' ').trim()), warn: [...d.querySelectorAll('.aia-warn')].map(x => x.textContent), text: d.textContent}; });
            assert.ok(r.gaps.includes('décès manquant'), JSON.stringify(r.gaps));
            assert.ok(r.steps.some(s => /Ta base : fiche, famille, notes/.test(s) && /sur l’ordinateur/.test(s)));
            assert.ok(r.steps.some(s => /Décès INSEE/.test(s)));
            assert.ok(r.steps.some(s => /🌐 Open Archives « "Jan MAZAUD" 1848-/.test(s) && /🌐 Internet/.test(s)), r.steps.join('\n'));
            assert.ok(r.steps.some(s => /Où chercher/.test(s) && /liens seulement/.test(s)));
            assert.ok(calls().length > c0 && calls().slice(c0).every(l => l.startsWith('records/search.json')), 'Open Archives intercepté (réponse enregistrée)');
            assert.match(r.leads[0], /① Il est mort en 1910 à Leyde\s*forte/);
            assert.match(r.leads[1], /② Sa naissance confirmée\s*moyenne/, 'preuve avec un renvoi inventé : jamais « forte »');
            assert.ok(r.warn.some(w => /fiche 4242/.test(w) && /piste 9999/.test(w)), JSON.stringify(r.warn));
            assert.ok(r.leads.some(l => /Où trouver : décès manquant\s*à chercher/.test(l)));
            assert.match(r.text, /Autres sites, à ouvrir toi-même : ↗ Geneanet · ↗ FamilySearch · ↗ FranceArchives/);
            const log = await p.evaluate(() => window.LCNDA_APP.api('aia_log'));
            assert.ok(log.rows.some(x => x.host === 'openarch.nl' && /"Jan MAZAUD"/.test(x.what)), 'le journal des envois le dit');
        });
        await t('🕵️ une piste se valide (source reliée) puis ↶ ; la piste de journal s’ajoute au suivi des recherches', async () => {
            await sleep(800); // la fenêtre se redessine une dernière fois à la fin
            await p.click('dialog[open] .aia-lead [data-aia-pok]');
            await p.waitForFunction(() => document.querySelector('dialog[open] .aia-lead .aia-done'), null, {timeout: 10000});
            assert.strictEqual(q("SELECT count(*) n FROM sources WHERE url LIKE '%openarchieven%'")[0].n, 1);
            await undo(p, /Ajouté, source reliée/);
            await p.waitForFunction(() => !document.querySelector('dialog[open] .aia-lead .aia-done'), null, {timeout: 10000});
            assert.strictEqual(q("SELECT count(*) n FROM sources WHERE url LIKE '%openarchieven%'")[0].n, 0);
            await sleep(500);
            await p.locator('dialog[open] .aia-lead [data-aia-prop]').last().click();
            await p.waitForSelector('dialog[open] .aia-lines', {timeout: 10000});
            assert.match(await p.textContent('dialog[open] .aia-lines'), /Journal des recherches : « Chercher : décès manquant/);
            await p.locator('dialog[open]').last().locator('[type=submit]').click();
            await p.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 1, null, {timeout: 10000});
            assert.strictEqual(q("SELECT count(*) n FROM research_journal WHERE person_id=1")[0].n, 1);
            await undo(p, /Ajouté à la fiche de Jan MAZAUD/);
            await sleep(600);
            assert.strictEqual(q("SELECT count(*) n FROM research_journal WHERE person_id=1")[0].n, 0);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });
        await t('🕵️ Open Archives désactivé dans les réglages : rien ne part', async () => {
            await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('genealogie-assistant-ia') || '{}'); s.openarch = false; localStorage.setItem('genealogie-assistant-ia', JSON.stringify(s)); });
            const c0 = calls().length, l0 = (await p.evaluate(() => window.LCNDA_APP.api('aia_log'))).rows.length;
            await p.evaluate(() => window.LCNDA_EXT.assistantIA.openGen(2));
            await p.waitForFunction(() => /désactivé dans les réglages/.test(document.querySelector('dialog[open] .aia-did')?.textContent || '') && !document.querySelector('dialog[open] .aia-did .aia-dots'), null, {timeout: 30000});
            assert.strictEqual(calls().length, c0); assert.strictEqual((await p.evaluate(() => window.LCNDA_APP.api('aia_log'))).rows.length, l0);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('genealogie-assistant-ia') || '{}'); s.openarch = true; localStorage.setItem('genealogie-assistant-ia', JSON.stringify(s)); });
        });

        /* ═════════ 6. le récit ═════════ */
        await t('✍️ récit de vie : vérifié (jaune), rangé dans une note « 📖 Biographie à relire » (pas la biographie de l’app), puis ↶', async () => {
            await p.evaluate(() => window.LCNDA_EXT.assistantIA.openRecit(12));
            await p.waitForSelector('dialog[open] .aia-recit [data-aia-prop]', {timeout: 30000});
            await sleep(500);
            const r = await p.evaluate(() => { const d = document.querySelector('dialog[open] .aia-recit'); return {sup: [...d.querySelectorAll('.aia-sup')].map(x => x.textContent.trim()), s: d.querySelectorAll('.aia-answer .aia-chip.is-s').length, txt: d.textContent}; });
            assert.strictEqual(r.sup.length, 1); assert.match(r.sup[0], /fleurs/); assert.strictEqual(r.s, 1);
            assert.match(r.txt, /Ce récit n’est pas enregistré/);
            await p.click('dialog[open] .aia-recit [data-aia-prop]');
            await p.waitForSelector('dialog[open] .aia-lines', {timeout: 10000});
            assert.match(await p.textContent('dialog[open] .aia-lines'), /Note « 📖 Biographie à relire \(écrite par l’IA\) »/);
            await p.locator('dialog[open]').last().locator('[type=submit]').click();
            await p.waitForSelector('dialog[open] .aia-recit .aia-done', {timeout: 10000});
            const n = q("SELECT title, body FROM notes WHERE entity_type='person' AND entity_id=12 AND title LIKE '%Biographie à relire%'");
            assert.strictEqual(n.length, 1); assert.match(n[0].body, /Jeanne MAZAUD naît en 1880 à Tulle \[S1\]/); assert.match(n[0].body, /\(supposé\)/); assert.match(n[0].body, /la biographie de l’app n’a pas changé/i);
            assert.strictEqual(q("SELECT count(*) n FROM sqlite_master WHERE name='person_biographies'")[0].n ? q('SELECT count(*) n FROM person_biographies WHERE person_id=12')[0].n : 0, 0);
            await undo(p, /Ajouté à la fiche de Jeanne MAZAUD/);
            await sleep(600);
            assert.strictEqual(q("SELECT count(*) n FROM notes WHERE entity_type='person' AND entity_id=12 AND title LIKE '%Biographie à relire%'")[0].n, 0);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });

        /* ═════════ 7. Réglages, historique, éteint ═════════ */
        await t('Réglages → 🤖 IA : sur cet ordinateur / en ligne grisé « bientôt » / éteint, le modèle, Open Archives, journal des envois', async () => {
            await p.evaluate(() => window.LCNDA_EXT.assistantIA.openSettings());
            await p.waitForSelector('.aia-settings .aia-models', {timeout: 20000});
            const r = await p.evaluate(() => { const s = document.querySelector('.aia-settings');
                return {online: s.querySelector('[data-aia-mode="online"]').disabled, txt: s.textContent, model: s.querySelector('[name="aia_model"]:checked')?.value}; });
            assert.ok(r.online); assert.match(r.txt, /Ollama est installé et répond/); assert.match(r.txt, /Ton ordinateur a 16 Go de mémoire/);
            assert.strictEqual(r.model, 'qwen3-vl:8b-instruct');
            assert.match(r.txt, /openarch\.nl · « "Jan MAZAUD" 1848-/); assert.match(r.txt, /Le généalogiste peut interroger Open Archives/);
            assert.match(r.txt, /\d+ conversation\(s\) gardée\(s\) sur cet ordinateur/);
            const files = fs.readdirSync(path.join(tmp, 'assistant-ia', 'conversations'));
            assert.ok(files.length >= 4, 'les conversations sont dans le dossier des données');
        });
        await t('historique : 🗑 effacer une conversation, puis ↶', async () => {
            await p.click('#aia-open'); await p.click('.aia-panel [data-aia-hist]');
            await p.waitForSelector('.aia-panel [data-aia-del]', {timeout: 10000});
            const n0 = (await p.$$('.aia-panel [data-aia-del]')).length;
            await p.click('.aia-panel [data-aia-del]');
            await p.waitForFunction(n => document.querySelectorAll('.aia-panel [data-aia-del]').length === n - 1, n0, {timeout: 10000});
            await undo(p, /Conversation effacée/);
            await p.waitForFunction(n => document.querySelectorAll('.aia-panel [data-aia-del]').length === n, n0, {timeout: 10000});
            await p.click('.aia-panel [data-aia-close]');
        });
        await t('éteint : le bouton 🤖 disparaît de la barre du haut ; ↶ le remet', async () => {
            await p.click('.aia-settings [data-aia-mode="off"]');
            await p.waitForFunction(() => document.getElementById('aia-open').hidden, null, {timeout: 5000});
            const menu = await p.evaluate(() => window.LCNDA_EXT.personMenuItems({person: {id: 1, living_status: 'deceased'}}).map(x => x.key || ''));
            assert.ok(!menu.some(k => /^aia-/.test(k)));
            await undo(p, /Assistant IA éteint/);
            await p.waitForFunction(() => !document.getElementById('aia-open').hidden, null, {timeout: 5000});
        });

        /* ═════════ sans Ollama ═════════ */
        await t('sans Ollama : tout reste éteint proprement, message clair et installation guidée ; rien n’est demandé', async () => {
            const p2 = await boot(base2);
            await p2.click('#aia-open');
            await p2.waitForSelector('.aia-panel.is-open .aia-notice', {timeout: 15000});
            const r = await p2.evaluate(() => ({txt: document.querySelector('.aia-panel .aia-thread').textContent, dis: document.querySelector('.aia-panel textarea').disabled, setup: !!document.querySelector('.aia-panel [data-aia-setup]')}));
            assert.match(r.txt, /L’IA n’est pas encore installée sur cet ordinateur/); assert.ok(r.dis); assert.ok(r.setup);
            const e = await p2.evaluate(() => window.LCNDA_APP.api('aia_chat_start', {}, {method: 'POST', body: {question: 'Bonjour'}}).catch(x => x.message));
            assert.match(String(e), /pas encore installée|installation guidée/);
            await p2.evaluate(() => window.LCNDA_EXT.assistantIA.openGen(1));
            await p2.waitForSelector('dialog[open] .aia-gen .aia-notice', {timeout: 15000});
            await p2.close();
        });
        await t('390 px : la fenêtre tient dans l’écran, sans défilement de côté', async () => {
            const p3 = await boot(base, 390, 800);
            // sur un téléphone, la barre du haut n'a pas ses boutons : on l'ouvre par la fiche (⋯ → 🤖 Demander à propos de cette personne)
            const item = await p3.evaluate(() => window.LCNDA_EXT.personMenuItems({person: {id: 12, living_status: 'deceased'}}).find(x => x.key === 'aia-ask')?.label);
            assert.strictEqual(item, 'Demander à propos de cette personne');
            await p3.evaluate(() => window.LCNDA_EXT.personMenuItems({person: {id: 12, living_status: 'deceased'}}).find(x => x.key === 'aia-ask').run());
            await p3.waitForSelector('.aia-panel.is-open', {timeout: 10000});
            await p3.fill('.aia-panel textarea', 'Qui de mes ancêtres a vécu en Corrèze avant 1900 ?'); await p3.click('.aia-panel [data-aia-form] button[type=submit]');
            await p3.waitForSelector('.aia-panel .aia-answer', {timeout: 30000});
            const r = await p3.evaluate(() => { const b = document.querySelector('.aia-panel').getBoundingClientRect(); return {w: b.width, l: b.left, sw: document.documentElement.scrollWidth, pw: document.querySelector('.aia-panel .aia-thread').scrollWidth, pcw: document.querySelector('.aia-panel .aia-thread').clientWidth}; });
            assert.ok(r.w <= 390 && r.l >= 0, JSON.stringify(r)); assert.ok(r.sw <= 390, JSON.stringify(r)); assert.ok(r.pw <= r.pcw + 1, JSON.stringify(r));
            await p3.close();
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); proc2.kill(); fake.close(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'L’assistant IA marche.');
    process.exit(fails ? 1 : 0);
})();
