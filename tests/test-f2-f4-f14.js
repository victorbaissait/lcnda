'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * F2 ⚖️ Hypothèses à comparer, F4 ❝ Citation des sources toute prête, F14 🏛 Services d'archives :   node tests/test-f2-f4-f14.js
 *  1. un vrai « php -S » sur une base neuve :
 *     F14 — service créé (URL / e-mail forgés refusés), menu de choix « archive_service », service + série + cote d'une source
 *     (fenêtre Source) et d'un média, « déjà consulté » : dépouillement écrit « AD 19 » retrouvé sur la fiche du service, rangé
 *     par série, « services écrits sans fiche », suppression puis « ↶ Annuler » (liens remis) ;
 *     F4 — une citation d'archive écrite en 4 styles (classique, Evidence Explained, Chicago, forum), livre et site, toutes les
 *     citations d'une fiche, valeurs tapées de la mise en page, bibliographie du rapport de recherche ;
 *     F2 — réponses (lieu), preuves pour / contre (source, média, dépouillement, texte libre ; sorte et id forgés refusés), poids,
 *     total et réponse en tête, conclusion qui met le lieu de l'événement à jour, « ↶ Annuler » (refusé si l'événement a changé),
 *     réponse et preuve retirées puis remises, hypothèse supprimée puis remise avec ses réponses, fiche verrouillée, jeton CSRF ;
 *  2. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : Listes → Services d'archives (barre H10, fiche),
 *     fenêtre ❝ Citer et ❝ de la fiche, bloc « ⚖️ Hypothèses » et fenêtre « Comparer » (ajout d'une preuve au menu de choix,
 *     ✓ Retenir → fiche mise à jour, ↶ Annuler) ; aucune erreur JavaScript, pas de défilement horizontal.
 * Captures : SHOTS=dossier node tests/test-f2-f4-f14.js
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-f2f4f14-'));
const dir = path.join(tmp, 'data');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

// la base : Jean MARTIN (né à Naves le 7 mai 1825), Paul (fiche verrouillée), deux lieux, un média
{ const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male'),('Paul','Verrou','male')");
$p = null; require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO places(name,county,country) VALUES('Naves','Corrèze','France'),('Tulle','Corrèze','France')");
$t = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$pdo->prepare("INSERT INTO events(person_id,event_type_id,scope,date_text,year,place_id) VALUES(1,?,'person','7 mai 1825',1825,1),(2,?,'person','1830',1830,1)")->execute([$t,$t]);
$pdo->exec("INSERT INTO media(title,filename,media_type,document_reference) VALUES('Acte de naissance','acte.jpg','image','3 E 12/4')");
$pdo->exec("UPDATE persons SET is_locked=1 WHERE id=2");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
  if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); } }

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    const port = Number(process.env.F2_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); return r.json(); };
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); const j = await r.json().catch(() => ({})); return { status: r.status, body: j, r: j.result || {}, id: j.result?.id }; };
    const ids = {};
    try {
        /* ═════ F14 ═════ */
        await t('F14 : service créé, adresse forgée refusée, menu de choix « archive_service »', async () => {
            const bad = await post('save_archive_service', { name: 'AD', website_url: 'javascript:alert(1)' });
            assert.notEqual(bad.status, 200);
            assert.notEqual((await post('save_archive_service', { name: 'AD', email: 'pas-un-mail' })).status, 200);
            assert.notEqual((await post('save_archive_service', { name: '   ' })).status, 200, 'nom obligatoire');
            const a = await post('save_archive_service', { name: 'Archives départementales de la Corrèze', short_name: 'AD 19', kind: 'ad', dept_code: '19', city: 'Tulle', website_url: 'https://archives.correze.fr', series_text: '3 E — Notaires\n4 E — État civil', kind_forged: 'x' });
            assert.equal(a.status, 200, JSON.stringify(a.body)); ids.svc = a.id;
            const k = await post('save_archive_service', { name: 'Service <b>bizarre</b>', kind: '<script>' });
            assert.equal(k.r.kind, 'other', 'sorte forgée → « autre »'); ids.svc2 = k.id;
            const pk = await get('picker_search', { kind: 'archive_service', q: 'ad 19' });
            assert.equal(pk.groups[0].items[0].id, ids.svc); assert.equal(pk.groups[0].items[0].icon, '🏛');
        });
        await t('F14 : service, série et cote d’une source et d’un média ; id forgé écarté', async () => {
            const s = await post('add_web_source', { person_id: 1, entity_type: 'event', event_id: 1, source_type: 'archive', title: 'Registre des naissances de Naves', website: 'AD Corrèze', archive_service_id: String(ids.svc), archive_series: '4 E', archive_cote: '4 E 152', citation_commune: 'Naves', citation_register: 'naissances', citation_years: '1823-1832', citation_view: '87', citation_view_total: '240', citation_act: '45', citation_view_url: 'https://archives.correze.fr/vue/87' });
            assert.equal(s.status, 200, JSON.stringify(s.body)); ids.src = s.id;
            const det = await get('person', { id: 1 });
            const src = det.sources.find(x => Number(x.id) === ids.src);
            assert.equal(Number(src.archive_service_id), ids.svc); assert.equal(src.archive_cote, '4 E 152'); ids.link = Number(src.link_id);
            const b = await post('add_web_source', { person_id: 1, source_type: 'book', title: 'Histoire de Naves', author: 'Pierre Dupont', website: 'Éditions du Limousin', accessed_at: '1998', page: '42', archive_service_id: '99999' });
            ids.book = b.id;
            assert.equal((await get('person', { id: 1 })).sources.find(x => Number(x.id) === ids.book).archive_service_id, null, 'service forgé écarté');
            const m = await post('save_media_archive', { media_id: 1, archive_service_id: ids.svc, archive_series: '3 E' });
            assert.equal(m.status, 200);
            const ma = await get('media_archive', { id: 1 });
            assert.equal(ma.service.id, ids.svc); assert.equal(ma.archive_series, '3 E');
            assert.notEqual((await post('save_media_archive', { media_id: 999 })).status, 200);
        });
        await t('F14 : « déjà consulté » chez le service (dépouillement écrit « AD 19 »), par série ; services écrits sans fiche', async () => {
            ids.dg = (await post('save_archive_digest', { city_name: 'Naves', archive_service: 'AD 19', archive_reference: '4 E 152', year_text: '1823-1832', record_type: 'naissance', status: 'done', result: 'found' })).id;
            await post('save_archive_digest', { city_name: 'Tulle', archive_service: 'Archives départementales de la Corrèze', archive_reference: '3E 77', year_text: '1850', record_type: 'mariage', result: 'none' });
            await post('save_archive_digest', { city_name: 'Brive', archive_service: 'AM Brive', archive_reference: '1 E 3', year_text: '1900', record_type: 'deces' });
            const d = await get('archive_service', { id: ids.svc });
            assert.equal(d.consulted.length, 2, JSON.stringify(d.consulted.map(c => c.service)));
            const four = d.series.find(x => x.code === '4 E'); assert.ok(four && four.declared && four.consulted === 1 && four.found === 1 && four.sources === 1, JSON.stringify(d.series));
            assert.ok(d.series.find(x => x.code === '3 E' && x.consulted === 1 && x.media === 1), 'série « 3 E » : la cote « 3E 77 » et le média');
            assert.equal(d.sources[0].id, ids.src); assert.equal(d.media[0].id, 1);
            const list = await get('archive_services');
            const me = list.services.find(x => x.id === ids.svc);
            assert.equal(me.consulted_count, 2); assert.equal(me.found_count, 1); assert.equal(me.media_count, 1);
            assert.deepEqual(list.unmatched.map(u => u.name), ['AM Brive']);
            assert.ok(list.departments.length > 90);
        });
        await t('F14 : supprimer le service puis « ↶ Annuler » : la source et le média sont de nouveau reliés', async () => {
            assert.equal((await post('delete_archive_service', { id: ids.svc })).status, 200);
            assert.equal((await get('media_archive', { id: 1 })).service, null);
            assert.equal((await post('restore_archive_service', { id: ids.svc })).status, 200);
            assert.equal((await get('media_archive', { id: 1 })).service.id, ids.svc);
            assert.equal(Number((await get('person', { id: 1 })).sources.find(x => Number(x.id) === ids.src).archive_service_id), ids.svc);
            assert.notEqual((await post('restore_archive_service', { id: ids.svc })).status, 200, 'déjà là');
        });

        /* ═════ F4 ═════ */
        await t('F4 : une citation d’archive écrite en 4 styles', async () => {
            const d = await get('source_citations', { link_id: ids.link });
            const st = d.items[0].styles;
            assert.deepEqual(Object.keys(st), ['fr', 'ee', 'chicago', 'forum']);
            assert.equal(st.fr.note, 'Archives départementales de la Corrèze, Naves, naissances 1823-1832, 4 E 152, vue 87/240, acte n° 45 (naissance de Jean MARTIN, 7 mai 1825) en ligne : https://archives.correze.fr/vue/87.');
            assert.match(st.ee.note, /^"Naves, naissances 1823-1832," no\. 45, naissance de Jean MARTIN, 7 mai 1825; digital images, Archives départementales de la Corrèze \(https:\/\/archives\.correze\.fr\/vue\/87\), image 87 of 240; citing 4 E 152\.$/);
            assert.match(st.chicago.note, /^Naissance de Jean MARTIN, 7 mai 1825, acte n° 45, naissances 1823-1832, Naves, 4 E 152, vue 87\/240, Archives départementales de la Corrèze, Tulle/);
            assert.equal(st.forum.note, 'Naissance de Jean MARTIN le 7 mai 1825 à Naves — Source : AD 19, Naves, naissances 1823-1832, 4 E 152, vue 87/240, acte n° 45 — lien : https://archives.correze.fr/vue/87');
            assert.match(st.fr.biblio, /^ARCHIVES DÉPARTEMENTALES DE LA CORRÈZE \(AD 19\), Naves, naissances 1823-1832, cote 4 E 152\.$/);
        });
        await t('F4 : un livre (auteur en capitales, page), toutes les citations d’une fiche, valeurs tapées de la mise en page', async () => {
            const b = (await get('source_citations', { source_id: ids.book, only: 1 })).items[0].styles;
            assert.equal(b.fr.biblio, 'DUPONT Pierre, Histoire de Naves, Éditions du Limousin, 1998.');
            assert.equal(b.chicago.biblio, 'Dupont, Pierre. Histoire de Naves. Éditions du Limousin, 1998.');
            const all = await get('source_citations', { person_id: 1 });
            assert.equal(all.items.length, 2);
            assert.match(all.items.find(i => i.source_id === ids.book).styles.fr.note, /p\. 42/);
            const ly = (await get('source_citations', { source_id: ids.src, only: 1, cote: '4 E 999', folio: '12', date: '8 mai 1825' })).items[0].styles;
            assert.match(ly.fr.note, /4 E 999, vue 12/); assert.match(ly.fr.note, /8 mai 1825/);
            assert.ok(!(await get('source_citations', {})).items, 'sans rien : une erreur, pas de plantage');
            const rep = await (await fetch(`${base}api.php?action=export_research_report&cite_style=chicago`, { headers: { Cookie: cookie } })).text();
            assert.match(rep, /Sources \(bibliographie · Chicago\)/); assert.match(rep, /Dupont, Pierre\. Histoire de Naves/);
        });

        /* ═════ F2 ═════ */
        await t('F2 : réponses, preuves pour / contre et leur poids, réponse en tête', async () => {
            const h = await post('save_hypothesis', { person_id: 1, event_id: 1, type: 'place', title: 'Jean né à Naves ou à Tulle ?', confidence: 'medium', status: 'open', statement: 'Deux registres disent autre chose.' });
            assert.equal(h.status, 200); ids.h = h.id;
            ids.o1 = (await post('hypothesis_option_save', { hypothesis_id: ids.h, place_id: 1 })).id;
            ids.o2 = (await post('hypothesis_option_save', { hypothesis_id: ids.h, place_id: 2 })).id;
            assert.notEqual((await post('hypothesis_option_save', { hypothesis_id: ids.h, place_id: 9999 })).status, 200, 'lieu forgé refusé');
            assert.notEqual((await post('hypothesis_option_save', { hypothesis_id: ids.h })).status, 200, 'réponse vide refusée');
            const p1 = await post('hypothesis_proof_save', { option_id: ids.o1, stance: 'for', weight: 3, ref_kind: 'source', ref_id: ids.src }); assert.equal(p1.status, 200, JSON.stringify(p1.body)); ids.p1 = p1.id;
            await post('hypothesis_proof_save', { option_id: ids.o1, stance: 'against', weight: 1, ref_id: 'txt:le recensement dit Tulle' });
            ids.p3 = (await post('hypothesis_proof_save', { option_id: ids.o2, stance: 'for', weight: 2, ref_kind: 'media', ref_id: 1 })).id;
            assert.notEqual((await post('hypothesis_proof_save', { option_id: ids.o2, stance: 'for', ref_kind: 'persons', ref_id: 1 })).status, 200, 'sorte forgée refusée');
            assert.notEqual((await post('hypothesis_proof_save', { option_id: ids.o2, stance: 'for', ref_kind: 'source', ref_id: 9999 })).status, 200, 'id forgé refusé');
            assert.notEqual((await post('hypothesis_proof_save', { option_id: ids.o1, stance: 'for', ref_kind: 'source', ref_id: ids.src })).status, 200, 'pas deux fois');
            const w = await post('hypothesis_proof_save', { id: ids.p3, weight: 99 }); assert.equal(w.r.weight, 3, 'poids borné à 3');
            const d = await get('hypothesis_compare', { id: ids.h });
            assert.equal(d.field, 'event_place'); assert.equal(d.current, 'Naves');
            const [a, b] = d.options;
            assert.equal(a.label, 'Naves'); assert.equal(a.score, 2); assert.equal(b.score, 3); assert.equal(d.leader, ids.o2);
            assert.equal(a.proofs.find(x => x.ref_kind === 'source').title, 'Registre des naissances de Naves');
            assert.equal(a.proofs.find(x => !x.ref_kind).title, 'le recensement dit Tulle');
            const sum = await get('hypotheses', { person_id: 1 });
            assert.deepEqual(sum.compare[ids.h].map(o => o.score), [2, 3]);
        });
        await t('F2 : la conclusion met le lieu de l’événement à jour ; « ↶ Annuler » le remet (refusé si l’événement a changé)', async () => {
            const c = await post('hypothesis_conclude', { id: ids.h, option_id: ids.o2 });
            assert.equal(c.status, 200, JSON.stringify(c.body)); assert.match(c.r.changed, /Tulle/);
            let ev = (await get('person', { id: 1 })).events.find(e => Number(e.id) === 1);
            assert.equal(Number(ev.place_id), 2);
            let d = await get('hypothesis_compare', { id: ids.h });
            assert.equal(d.hypothesis.status, 'confirmed'); assert.ok(d.hypothesis.can_undo); assert.ok(d.options[1].chosen);
            assert.notEqual((await post('hypothesis_conclude', { id: ids.h, option_id: ids.o1 })).status, 200, 'déjà conclue');
            assert.notEqual((await post('hypothesis_option_delete', { id: ids.o2 })).status, 200, 'la réponse retenue ne se retire pas');
            assert.equal((await post('hypothesis_conclusion_undo', { id: ids.h })).status, 200);
            ev = (await get('person', { id: 1 })).events.find(e => Number(e.id) === 1);
            assert.equal(Number(ev.place_id), 1);
            d = await get('hypothesis_compare', { id: ids.h }); assert.equal(d.hypothesis.status, 'open'); assert.ok(!d.hypothesis.can_undo);
            await post('hypothesis_conclude', { id: ids.h, option_id: ids.o2 });
            await post('save_event', { id: 1, event_type_id: ev.event_type_id, date_text: '7 mai 1825', place_id: 1 });
            const u = await post('hypothesis_conclusion_undo', { id: ids.h });
            assert.notEqual(u.status, 200); assert.match(u.body.error || '', /modifié depuis/);
            await post('save_event', { id: 1, event_type_id: ev.event_type_id, date_text: '7 mai 1825', place_id: 2 });
            assert.equal((await post('hypothesis_conclusion_undo', { id: ids.h })).status, 200, 'remis comme à la conclusion : « ↶ Annuler » marche');
            assert.equal(Number((await get('person', { id: 1 })).events.find(e => Number(e.id) === 1).place_id), 1);
        });
        await t('F2 : date — la conclusion change la date de l’événement', async () => {
            const h = await post('save_hypothesis', { person_id: 1, event_id: 1, type: 'date', title: 'Le 7 ou le 8 mai ?', confidence: 'low', status: 'open' });
            const o = (await post('hypothesis_option_save', { hypothesis_id: h.id, value_text: '8 mai 1825' })).id;
            await post('hypothesis_conclude', { id: h.id, option_id: o });
            assert.equal((await get('person', { id: 1 })).events.find(e => Number(e.id) === 1).date_text, '8 mai 1825');
            await post('hypothesis_conclusion_undo', { id: h.id });
            assert.equal((await get('person', { id: 1 })).events.find(e => Number(e.id) === 1).date_text, '7 mai 1825');
        });
        await t('F2 : réponse et preuve retirées puis remises ; hypothèse supprimée puis remise avec ses réponses', async () => {
            const h = await post('save_hypothesis', { person_id: 1, type: 'other', title: 'Même personne que Jean Martin de Tulle ?', confidence: 'medium', status: 'open' });
            const o = (await post('hypothesis_option_save', { hypothesis_id: h.id, label: 'Oui' })).id;
            const pr = await post('hypothesis_proof_save', { option_id: o, stance: 'for', ref_kind: 'digest', ref_id: ids.dg }); assert.equal(pr.status, 200, JSON.stringify(pr.body)); const p = pr.id;
            const pd = await post('hypothesis_proof_delete', { id: p }); assert.equal(pd.status, 200, JSON.stringify(pd.body));
            assert.equal((await post('hypothesis_compare_restore', { kind: 'proof', id: p })).status, 200);
            assert.equal((await post('hypothesis_option_delete', { id: o })).status, 200);
            assert.equal((await get('hypothesis_compare', { id: h.id })).options.length, 0);
            assert.equal((await post('hypothesis_compare_restore', { kind: 'option', id: o })).status, 200);
            let d = await get('hypothesis_compare', { id: h.id });
            assert.equal(d.options[0].proofs.length, 1, 'la réponse revient avec sa preuve');
            assert.equal((await post('delete_hypothesis', { id: h.id })).status, 200);
            assert.equal((await post('restore_last_delete', { entity_type: 'hypothesis', entity_id: h.id })).status, 200);
            d = await get('hypothesis_compare', { id: h.id });
            assert.equal(d.options.length, 1); assert.equal(d.options[0].proofs.length, 1);
        });
        await t('F2 : fiche verrouillée et jeton CSRF', async () => {
            const lock = await post('save_hypothesis', { person_id: 2, type: 'place', title: 'x', confidence: 'medium', status: 'open' });
            assert.notEqual(lock.status, 200, 'hypothèse sur une fiche verrouillée refusée');
            assert.notEqual((await post('hypothesis_option_save', { hypothesis_id: ids.h, label: 'Brive' }, 'mauvais')).status, 200);
            assert.notEqual((await post('save_archive_service', { name: 'X' }, 'mauvais')).status, 200);
        });

        /* ═════ navigateur ═════ */
        let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) {} }
        if (!pw) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        const browser = await pw.chromium.launch();
        const errors = [];
        const watch = (p, name) => {
            p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
            p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
        };
        const shot = async (p, name, el = null) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); if (el) await el.screenshot({ path: path.join(SHOTS, name) }); else await p.screenshot({ path: path.join(SHOTS, name), fullPage: true }); };
        const noScroll = async p => { const sw = await p.evaluate(() => Math.max(document.documentElement.scrollWidth - innerWidth, ...[...document.querySelectorAll('#workspace, dialog[open] .h-dialog-body')].map(e => e.scrollWidth - e.clientWidth))); assert.ok(sw <= 1, `défilement horizontal : ${sw}`); };
        try {
            for (const [name, vp, dark] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, false], ['sombre', { width: 1440, height: 900 }, true]]) {
                const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('lcnda-sheet-sections-open', JSON.stringify({human: {s_ident: false, s_family: false, s_life: false, s_docs: false}})); } catch (_) {} }); // 🗂 sur téléphone les sections de la fiche sont repliées sauf la première (validé) : ici, toutes ouvertes
                await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
                const p = await ctx.newPage(); watch(p, name);
                await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.archiveServices && window.LCNDA_EXT?.hypotheses && window.LCNDA_EXT?.citations && window.LCNDA_EXT?.openDialog, null, { timeout: 20000 });
                if (dark) { await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({ ...A.readDesignSettings(), preset: 'dark' })); A.applyDesign(); }); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark'); }
                await t(`${name} : Listes → Services d’archives (barre H10), puis la fiche du service (séries, déjà consulté)`, async () => {
                    await p.evaluate(() => { const A = window.LCNDA_APP; Object.assign(A.state, { listType: 'archive_services', archiveServiceId: 0 }); A.setModule('listes'); });
                    await p.waitForSelector('.h-asv .ui-listbar'); await p.waitForSelector('.h-asv .ui-row');
                    assert.ok(await p.$('#sidebar-content [data-side-value="archive_services"]') || name === '390', 'dans la colonne des listes');
                    if (name === '1440') assert.match(await p.textContent('.h-asv-unmatched'), /AM Brive/);
                    await shot(p, `services-liste-${name}.png`); await noScroll(p);
                    await p.click(`.h-asv .ui-row [data-as-open="${ids.svc}"]`);
                    await p.waitForSelector('.h-asv-sheet .h-asv-series');
                    const txt = await p.textContent('.h-asv-sheet');
                    assert.match(txt, /4 E/); assert.match(txt, /Notaires/); assert.match(txt, /Registre des naissances de Naves/);
                    assert.equal(await p.$$eval('[data-as-consulted] .ui-row', r => r.length), 2);
                    await p.click('[data-as-filters] [data-as-f="4 E"]');
                    assert.equal(await p.$$eval('[data-as-consulted] .ui-row', r => r.length), 1);
                    await shot(p, `service-fiche-${name}.png`); await noScroll(p);
                });
                if (name === '1440') {
                    await t('1440 : ＋ Nouveau service depuis un service écrit sans fiche (« AM Brive »), puis il apparaît dans la liste', async () => {
                        await p.click('.h-asv-sheet [data-as-back]'); await p.waitForSelector('.h-asv-unmatched');
                        await p.click('.h-asv-unmatched [data-as-new-name="AM Brive"]');
                        await p.waitForSelector('dialog[open] input[name=name]');
                        assert.equal(await p.inputValue('dialog[open] input[name=name]'), 'AM Brive');
                        assert.equal(await p.inputValue('dialog[open] select[name=kind]'), 'am');
                        await p.fill('dialog[open] input[name=city]', 'Brive');
                        await shot(p, 'service-nouveau.png', await p.$('dialog[open]'));
                        await p.click('dialog[open] .modal-actions button[type=submit]');
                        await p.waitForSelector('.h-asv-sheet', { timeout: 8000 });
                        assert.match(await p.textContent('.h-asv-sheet'), /AM Brive/);
                        assert.equal((await get('archive_services')).unmatched.length, 0);
                    });
                }
                await t(`${name} : fiche de Jean → ❝ Citer une source (4 styles, 📋 Copier) et ❝ toutes les citations`, async () => {
                    await p.evaluate(() => window.LCNDA_APP.openPersonById(1));
                    await p.waitForSelector(`[data-cite-link="${ids.link}"]`);
                    await p.click(`[data-cite-link="${ids.link}"]`);
                    await p.waitForSelector('dialog[open] .h-cite-style');
                    assert.equal(await p.$$eval('dialog[open] .h-cite-style', s => s.length), 4);
                    await p.click('dialog[open] .h-cite-style.is-pref [data-cite-copy]');
                    await p.waitForFunction(() => [...document.querySelectorAll('.ui-toast')].some(x => /copiée/.test(x.textContent)));
                    if (name === '1440') assert.match(await p.evaluate(() => navigator.clipboard.readText()), /^Archives départementales de la Corrèze, Naves/);
                    await shot(p, `citer-${name}.png`, await p.$('dialog[open]'));
                    await p.click('dialog[open] .modal-actions [data-h-close]');
                    await p.click('[data-cite-person="1"]');
                    await p.waitForSelector('dialog[open] .h-cite-all li');
                    await p.selectOption('dialog[open] [data-cite-all-style]', 'forum');
                    assert.match(await p.textContent('dialog[open] .h-cite-all'), /Source : AD 19/);
                    await p.click('dialog[open] [data-cite-what="biblio"]');
                    assert.match(await p.textContent('dialog[open] .h-cite-all'), /Histoire de Naves/);
                    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('dialog[open] [data-cite-all-txt]')]);
                    assert.match(fs.readFileSync(await dl.path(), 'utf8'), /Histoire de Naves/);
                    await shot(p, `citations-fiche-${name}.png`, await p.$('dialog[open]'));
                    await p.evaluate(() => { localStorage.setItem('lcnda-cite-style', 'fr'); document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
                    await noScroll(p);
                });
                await t(`${name} : bloc « ⚖️ Hypothèses » et fenêtre « Comparer » (preuve ajoutée au menu de choix)`, async () => {
                    await p.waitForSelector(`.h-hc-block [data-hcomp-open="${ids.h}"]`);
                    await p.waitForFunction(id => /Naves/.test(document.querySelector(`[data-hcomp-sum="${id}"]`)?.textContent || ''), ids.h);
                    await p.click(`.h-hc-block button[data-hcomp-open="${ids.h}"]`);
                    await p.waitForSelector('dialog[open] .h-hc-col');
                    assert.ok(await p.$(`dialog[open] .h-hc-col.is-leader[data-hc-opt="${name === '1440' ? ids.o2 : ids.o1}"]`), 'la colonne en tête');
                    if (name === '1440') {
                        const inp = `dialog[open] [data-hc-add="${ids.o1}"][data-hc-stance="for"] .pk-input`;
                        await p.click(inp); await p.type(inp, 'acte', { delay: 30 });
                        await p.waitForSelector('dialog[open] .pk-row', { timeout: 5000 });
                        await p.keyboard.press('Enter');
                        await p.waitForFunction(id => document.querySelectorAll(`dialog[open] [data-hc-opt="${id}"] .h-hc-side.is-for .h-hc-proof`).length === 2, ids.o1, { timeout: 8000 });
                        await p.click(`dialog[open] [data-hc-opt="${ids.o1}"] [data-hc-conclude]`);
                        await p.waitForFunction(() => [...document.querySelectorAll('.ui-toast')].some(x => /retenue/.test(x.textContent)));
                        assert.ok(await p.$(`dialog[open] .h-hc-col.is-chosen[data-hc-opt="${ids.o1}"]`));
                    }
                    await shot(p, `comparer-${name}.png`, await p.$('dialog[open]'));
                    await noScroll(p);
                    await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                });
                await ctx.close();
            }
            await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
        console.log(failed ? `\n${failed} vérification(s) en échec.` : '\nToutes les vérifications réussies.');
        process.exit(failed ? 1 : 0);
    }
})();
