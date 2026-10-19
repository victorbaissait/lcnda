'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📈 Mes graphiques rangés dans la base (lib/graphs.php, routes GET graphs / POST graphs_write, sorte « graph » du menu
 * de choix, recherche rapide) :
 *     node tests/test-graphs-base.js
 * Deux généalogies (deux dossiers), chacune servie par un vrai « php -S » : base sans table (lue comme vide), reprise
 * des graphiques d'un navigateur (seulement les inconnus, une définition abîmée laissée de côté), enregistrer,
 * modifier, supprimer (une ligne « supprimée » empêche la reprise de la faire revenir), {} gardés, vignette (PNG
 * vérifié, SVG ou faux PNG refusés), JSON forgés (liste, identifiant, sorte, texte en tableau, trop imbriqué, trop gros,
 * champ piégé, opération inconnue), jeton CSRF manquant ou d'une autre généalogie, mode consultation, menu de choix
 * (recherche sans accents, ligne grise, endroits où il est posé, filtre des sortes, relecture par numéro), recherche
 * rapide (⌘K), chaque généalogie garde les siens.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-graphs-base-'));
const dirs = { A: path.join(tmp, 'a'), B: path.join(tmp, 'b') };
const envFor = dir => ({ ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
for (const dir of Object.values(dirs)) {
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
}

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function server(dir) {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(async r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const getJ = async (action, q = '') => { const r = await fetch(`${base}api.php?action=${action}${q ? '&' + q : ''}`, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json() }; };
    const post = async (body, token = csrf, raw = null, action = 'graphs_write') => {
        const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: raw ?? JSON.stringify({ ...body, csrf: token }) });
        return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    const page = async () => (await fetch(base, { headers: { Cookie: cookie } })).text();
    return { proc, base, csrf, getJ, post, page, dir };
}

// une vraie petite image PNG (16 × 10, blanche)
function png(w = 16, h = 10) {
    const crc = buf => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = t[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const raw = Buffer.alloc((w * 3 + 1) * h, 255); for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
    return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

const TRAP = 'Habitants <img src=x onerror=alert(1)> de Rennes';
const chart = (extra = {}) => ({ id: 'cw_hab00001', name: TRAP, icon: '📈', kind: 'chart', inStats: true, width: '12', style: 'columns', palette: 'vive',
    src: { source: 'manual' }, valueColors: {}, free: { series: [{ name: '1900', color: '' }], rows: [{ label: 'Rennes', v: ['42'] }, { label: 'Nantes', v: ['25'] }] }, ...extra });
const appstat = { id: 'cw_pre00001', name: 'Prénoms de la famille', icon: '👶', kind: 'appstat', statType: 'firstnames', style: 'dg:hemicycle', limit: 8, _hint: { draw: 'Hémicycle' } };
const note = { id: 'cw_txt00001', name: 'Pense-bête', icon: '📌', kind: 'text', text: 'Appeler tante Jeanne' };

(async () => {
    const A = await server(dirs.A), B = await server(dirs.B);
    const out = {};
    let failed = 0;
    try {
        out.empty = await A.getJ('graphs');
        out.pageEmpty = await A.page();
        out.pickEmpty = await A.getJ('picker_search', 'kind=graph&q=');
        // reprise : trois graphiques d'un navigateur, plus un abîmé (sorte inconnue) laissé de côté
        out.import1 = await A.post({ op: 'import', defs: [chart(), appstat, note, { id: 'cw_bad00001', name: 'x', kind: 'evil' }] });
        out.import2 = await A.post({ op: 'import', defs: [chart({ name: 'Ancien nom' })] }); // déjà là : rien ne change
        // un autre navigateur enregistre ses changements
        out.save = await A.post({ op: 'save', defs: [chart({ name: TRAP + ' (bis)', style: 'pie' })] });
        out.del = await A.post({ op: 'save', delete: ['cw_txt00001', 'cw_old00001'] });
        out.importDeleted = await A.post({ op: 'import', defs: [note, { id: 'cw_old00001', name: 'Jamais repris', kind: 'text', text: '' }] });
        out.list = await A.getJ('graphs');
        out.page = await A.page();
        // vignette
        out.thumbOk = await A.post({ op: 'thumb', uid: 'cw_hab00001', thumb: png() });
        out.thumbSvg = await A.post({ op: 'thumb', uid: 'cw_hab00001', thumb: 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"/>').toString('base64') });
        out.thumbFake = await A.post({ op: 'thumb', uid: 'cw_hab00001', thumb: 'data:image/png;base64,' + Buffer.from('pas une image').toString('base64') });
        out.thumbBig = await A.post({ op: 'thumb', uid: 'cw_hab00001', thumb: 'data:image/png;base64,' + 'A'.repeat(200000) });
        out.thumbGone = await A.post({ op: 'thumb', uid: 'cw_txt00001', thumb: png() });
        out.listThumb = await A.getJ('graphs');
        // JSON forgés
        const forged = [
            ['liste au lieu d’un objet', { op: 'save', defs: [[1, 2, 3]] }],
            ['identifiant piégé', { op: 'save', defs: [chart({ id: '../../x' })] }],
            ['identifiant absent', { op: 'save', defs: [{ name: 'x', kind: 'chart' }] }],
            ['sorte inconnue', { op: 'save', defs: [chart({ kind: 'script' })] }],
            ['nom en tableau', { op: 'save', defs: [chart({ name: ['a', 'b'] })] }],
            ['texte en objet', { op: 'save', defs: [chart({ note: { x: 1 } })] }],
            ['champ piégé', { op: 'save', defs: [{ ...chart(), 'on<x>': 1 }] }],
            ['trop imbriqué', { op: 'save', defs: [chart({ deep: JSON.parse('['.repeat(30) + ']'.repeat(30)) })] }],
            ['trop gros', { op: 'save', defs: [chart({ blob: 'x'.repeat(2.2 * 1024 * 1024) })] }],
            ['defs pas une liste', { op: 'save', defs: { a: chart() } }],
            ['suppression piégée', { op: 'save', delete: ["cw_hab00001' OR 1=1 --"] }],
            ['opération inconnue', { op: 'drop' }],
            ['opération en tableau', { op: ['save'] }],
        ];
        out.forged = [];
        for (const [name, body] of forged) out.forged.push([name, await A.post(body)]);
        out.afterForged = await A.getJ('graphs');
        // jeton CSRF
        out.noCsrf = await A.post({ op: 'save', defs: [note] }, '');
        out.otherCsrf = await A.post({ op: 'save', defs: [note] }, B.csrf);
        // menu de choix et recherche rapide
        out.pickAll = await A.getJ('picker_search', 'kind=graph&q=');
        out.pickQ = await A.getJ('picker_search', 'kind=graph&q=prenoms');
        out.pickTrap = await A.getJ('picker_search', 'kind=graph&q=' + encodeURIComponent("'; DROP TABLE custom_widgets; --"));
        out.pickKinds = await A.getJ('picker_search', 'kind=graph&q=&graph_kinds=appstat');
        out.pickMixed = await A.getJ('picker_search', 'kind=person,graph&q=pr');
        out.pickIds = await A.getJ('picker_search', 'kind=graph&ids=1');
        out.quick = await A.getJ('quick_search', 'q=' + encodeURIComponent('prénoms'));
        out.quickWord = await A.getJ('quick_search', 'q=graphique');
        // posé : un diagramme qui le suit, rattaché à une personne ; et le tableau de bord
        out.dg = await A.post({ name: 'Prénoms', kind: 'pie', spec: { live: { key: 'my:cw_pre00001', label: 'Prénoms', follow: true } }, add_link: { type: 'person', id: 1 } }, A.csrf, null, 'save_diagram');
        await A.post({ set: { 'genealogie-dashboard-blocks': JSON.stringify({ widgets: [{ type: 'cw_pre00001', width: '6' }] }) } }, A.csrf, null, 'save_settings');
        out.pickPosed = await A.getJ('picker_search', 'kind=graph&q=prenoms');
        // mode consultation : lecture permise, écriture refusée
        fs.writeFileSync(path.join(dirs.A, 'consultation.json'), JSON.stringify({ hash: '$2y$10$abcdefghijklmnopqrstuuWzGmJ1kGQ5JvH4sCq3zN6E1i0YqM6xG', since: 'x' }));
        out.kioskGet = await A.getJ('graphs');
        out.kioskPost = await A.post({ op: 'save', defs: [note] });
        out.kioskImport = await A.post({ op: 'import', defs: [{ ...note, id: 'cw_kio00001' }] });
        fs.unlinkSync(path.join(dirs.A, 'consultation.json'));
        // l'autre généalogie n'a rien
        out.otherBase = await B.getJ('graphs');
        out.otherPick = await B.getJ('picker_search', 'kind=graph&q=');
    } finally { A.proc.kill(); B.proc.kill(); }

    const ids = r => r.body.graphs.map(g => g.id);
    const checks = [
        ['base sans table : aucun graphique, injectée dans la page', () => {
            assert.equal(out.empty.status, 200); assert.deepEqual(out.empty.body.graphs, []); assert.equal(out.empty.body.stored, false);
            assert.match(out.pageEmpty, /window\.LCNDA_GRAPHS = \{"graphs":\[\]/);
            assert.equal(out.pickEmpty.body.groups[0].total, 0);
        }],
        ['reprise : les inconnus entrent, l’abîmé est laissé de côté, rien n’est écrasé', () => {
            assert.equal(out.import1.status, 200); assert.equal(out.import1.body.imported, 3); assert.equal(out.import1.body.refused, 1);
            assert.deepEqual(ids(out.import1), ['cw_hab00001', 'cw_pre00001', 'cw_txt00001']);
            assert.equal(out.import2.body.imported, 0); assert.equal(out.import2.body.graphs[0].name, TRAP);
        }],
        ['enregistrer : la nouvelle version remplace l’ancienne, {} reste un objet, texte gardé tel quel', () => {
            assert.equal(out.save.status, 200); assert.deepEqual(out.save.body.saved, ['cw_hab00001']);
            const g = out.list.body.graphs.find(x => x.id === 'cw_hab00001');
            assert.equal(g.name, TRAP + ' (bis)'); assert.equal(g.style, 'pie');
            assert.deepEqual(g.valueColors, {}); assert.ok(!Array.isArray(g.valueColors));
            assert.equal(out.list.body.graphs.find(x => x.id === 'cw_pre00001')._hint, undefined, 'le petit résumé n’est pas rangé dans la définition');
        }],
        ['supprimer : la ligne « supprimée » empêche la reprise de la faire revenir', () => {
            assert.equal(out.del.status, 200); assert.deepEqual(out.del.body.deleted, ['cw_txt00001', 'cw_old00001']);
            assert.equal(out.importDeleted.body.imported, 0);
            assert.deepEqual(ids(out.list), ['cw_hab00001', 'cw_pre00001']);
            assert.ok(out.list.body.gone.includes('cw_txt00001') && out.list.body.gone.includes('cw_old00001'));
        }],
        ['la page reçoit la liste (texte piégé échappé dans le script)', () => {
            const m = out.page.match(/window\.LCNDA_GRAPHS = (\{.*?\});<\/script>/s); assert.ok(m, 'liste injectée');
            assert.ok(!m[1].includes('<img'), 'aucun < en clair dans le script'); assert.match(m[1], /\\u003Cimg/);
            assert.deepEqual(JSON.parse(m[1]).graphs.map(g => g.id), ['cw_hab00001', 'cw_pre00001']);
        }],
        ['vignette : un vrai PNG entre, SVG, faux PNG, trop gros ou graphique supprimé refusés', () => {
            assert.equal(out.thumbOk.status, 200);
            assert.equal(out.thumbSvg.status, 422); assert.equal(out.thumbFake.status, 422); assert.equal(out.thumbBig.status, 422);
            assert.equal(out.thumbGone.status, 404);
            assert.equal(out.listThumb.body.info.cw_hab00001.thumb_ok, true); assert.equal(out.listThumb.body.info.cw_pre00001.thumb_ok, false);
        }],
        ['JSON forgés : refusés en entier (422), la base ne change pas', () => {
            for (const [name, r] of out.forged) { assert.equal(r.status, 422, name); assert.ok(r.body.error, name); }
            assert.deepEqual(ids(out.afterForged), ['cw_hab00001', 'cw_pre00001']);
            assert.equal(out.afterForged.body.graphs[0].name, TRAP + ' (bis)');
        }],
        ['jeton CSRF manquant ou d’une autre généalogie : refusé', () => {
            assert.ok(out.noCsrf.status >= 400); assert.ok(out.otherCsrf.status >= 400);
        }],
        ['menu de choix : liste, recherche sans accents, ligne grise, vignette, filtre des sortes, relecture', () => {
            const items = out.pickAll.body.groups[0].items;
            assert.equal(out.pickAll.body.groups[0].label, '📈 Graphiques');
            assert.deepEqual(items.map(i => i.uid).sort(), ['cw_hab00001', 'cw_pre00001']);
            const hab = items.find(i => i.uid === 'cw_hab00001');
            assert.equal(hab.kind, 'graph'); assert.equal(hab.title, TRAP + ' (bis)'); assert.match(hab.meta, /Camembert/); assert.match(hab.meta, /Mes chiffres/); assert.match(hab.meta, /posé à 1 endroit/);
            assert.match(hab.thumb, /^data:image\/png;base64,/);
            const pre = out.pickQ.body.groups[0].items; assert.equal(pre.length, 1); assert.equal(pre[0].uid, 'cw_pre00001');
            assert.match(pre[0].meta, /Hémicycle/); assert.match(pre[0].meta, /Statistique de l’app : Prénoms/); assert.match(pre[0].meta, /posé nulle part/);
            assert.equal(out.pickTrap.status, 200); assert.equal(out.pickTrap.body.groups[0].total, 0);
            assert.deepEqual(out.pickKinds.body.groups[0].items.map(i => i.uid), ['cw_pre00001']);
            assert.deepEqual(out.pickMixed.body.groups.map(g => g.kind), ['person', 'graph']);
            assert.deepEqual(out.pickIds.body.groups[0].items.map(i => i.uid), ['cw_hab00001']);
        }],
        ['recherche rapide (⌘K) : les graphiques, aussi avec le mot « graphique »', () => {
            assert.deepEqual(out.quick.body.graphs.map(g => g.uid), ['cw_pre00001']);
            assert.deepEqual(out.quickWord.body.graphs.map(g => g.uid).sort(), ['cw_hab00001', 'cw_pre00001']);
        }],
        ['endroits où il est posé : diagramme qui le suit (une personne) et tableau de bord', () => {
            const it = out.pickPosed.body.groups[0].items[0];
            assert.equal(it.places, 2); assert.match(it.meta, /posé à 2 endroits/); assert.equal(it.badge, '📌 2');
        }],
        ['mode consultation : lecture permise, écriture et reprise refusées', () => {
            assert.equal(out.kioskGet.status, 200); assert.equal(out.kioskPost.status, 423); assert.equal(out.kioskImport.status, 423);
        }],
        ['chaque généalogie garde ses graphiques', () => {
            assert.deepEqual(out.otherBase.body.graphs, []); assert.equal(out.otherPick.body.groups[0].total, 0);
        }],
    ];
    for (const [name, fn] of checks) { try { fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    process.exit(failed ? 1 : 0);
})();
