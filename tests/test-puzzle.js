'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des parties de puzzle rangées dans la base (lib/puzzle.php, routes GET puzzle / POST puzzle_write) :
 *     node tests/test-puzzle.js
 * Deux généalogies (deux dossiers), chacune servie par un vrai « php -S » : enregistrer, relire, reprendre, terminer
 * (record), envoi ancien ignoré, envoi partiel (sans l'image), jeton CSRF manquant ou d'une autre généalogie, mode
 * consultation, partie trop grosse, JSON forgé (pièces abîmées, image piégée, nombre de pièces, identifiant),
 * identifiant d'une autre généalogie, supprimer.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-puzzle-'));
const dirs = {A: path.join(tmp, 'a'), B: path.join(tmp, 'b')};
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
    const html = await (await fetch(base, { headers: {} }).then(async r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async q => { const r = await fetch(base + 'api.php?action=puzzle' + (q ? '&' + q : ''), { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json() }; };
    const post = async (body, token = csrf, raw = null) => {
        const r = await fetch(base + 'api.php?action=puzzle_write', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: raw ?? JSON.stringify({ ...body, csrf: token }) });
        return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    return { proc, base, csrf, get, post, dir };
}

const n = 12, cols = 4, rows = 3;
const meta = (extra = {}) => ({ name: '<b>Noce</b> de 1925', image: { key: 'm:1', url: 'media/noce%201925.jpg', title: 'La noce', mediaId: 1, w: 1200, h: 800 }, cols, rows, shape: 'jigsaw', rotate: false, model: true, seed: 42, createdAt: 1, elapsed: 5000, ...extra });
const state = (placed = 0) => ({ v: 1, cx: Array.from({ length: n }, (_, i) => i * 10.25), cy: Array(n).fill(-50), rot: Array(n).fill(0), grp: Array.from({ length: n }, (_, i) => i),
    lk: Array.from({ length: n }, (_, i) => (i < placed ? 1 : 0)), order: Array.from({ length: n }, (_, i) => n - 1 - i) });

(async () => {
    const A = await server(dirs.A), B = await server(dirs.B);
    const out = {};
    try {
        out.empty = await A.get('');
        out.save1 = await A.post({ op: 'save', uid: 'puz-1-abc', meta: meta(), state: state(2), saved_at: 1000 });
        out.list1 = await A.get('');
        out.one = await A.get('uid=puz-1-abc');
        // envoi plus ancien (arrivé en retard) : ignoré
        out.older = await A.post({ op: 'save', uid: 'puz-1-abc', meta: { elapsed: 1 }, state: state(0), saved_at: 900 });
        // envoi partiel (au moment de quitter la page : pas d'image) : l'image est gardée
        out.partial = await A.post({ op: 'save', uid: 'puz-1-abc', meta: { elapsed: 9000, edges: true }, state: state(5), saved_at: 2000 });
        out.one2 = await A.get('uid=puz-1-abc');
        // sécurité
        out.noCsrf = await A.post({ op: 'save', uid: 'puz-2-x', meta: meta(), state: state() }, '');
        out.otherCsrf = await A.post({ op: 'save', uid: 'puz-2-x', meta: meta(), state: state() }, B.csrf);
        out.big = await A.post({ op: 'save', uid: 'puz-3-big', meta: meta({ image: { key: 'd:x', url: 'data:image/png;base64,' + 'A'.repeat(1_500_000), w: 10, h: 10 } }), state: { ...state(), cx: Array(n).fill(123456.5) }, saved_at: 1 });
        out.huge = await A.post(null, A.csrf, JSON.stringify({ op: 'save', uid: 'puz-3-big', csrf: A.csrf, meta: meta({ image: { key: 'd:x', url: 'data:image/png;base64,' + 'A'.repeat(2_500_000), w: 10, h: 10 } }), state: state() }));
        const forged = {
            badUid: { op: 'save', uid: '../../etc', meta: meta(), state: state() },
            badUid2: { op: 'save', uid: 'puz-ABC<script>', meta: meta(), state: state() },
            jsUrl: { op: 'save', uid: 'puz-4', meta: meta({ image: { url: 'javascript:alert(1)', w: 10, h: 10 } }), state: state() },
            dotUrl: { op: 'save', uid: 'puz-4', meta: meta({ image: { url: 'media/../genealogy.sqlite', w: 10, h: 10 } }), state: state() },
            svgData: { op: 'save', uid: 'puz-4', meta: meta({ image: { url: 'data:image/svg+xml;base64,PHN2Zz4=', w: 10, h: 10 } }), state: state() },
            tooMany: { op: 'save', uid: 'puz-4', meta: meta({ cols: 100, rows: 100 }), state: state() },
            shortState: { op: 'save', uid: 'puz-4', meta: meta(), state: { ...state(), cx: [1, 2] } },
            nanState: { op: 'save', uid: 'puz-4', meta: meta(), state: { ...state(), cy: [...Array(n - 1).fill(0), 'abc'] } },
            badRot: { op: 'save', uid: 'puz-4', meta: meta(), state: { ...state(), rot: Array(n).fill(7) } },
            badOrder: { op: 'save', uid: 'puz-4', meta: meta(), state: { ...state(), order: Array(n).fill(0) } },
            stateNotObj: { op: 'save', uid: 'puz-4', meta: meta(), state: 'x' },
            metaNotObj: { op: 'save', uid: 'puz-4', meta: 5, state: state() },
            changeCount: { op: 'save', uid: 'puz-1-abc', meta: { cols: 6, rows: 2 }, state: state() },
            badOp: { op: 'drop_table', uid: 'puz-4' },
        };
        out.forged = {};
        for (const [k, body] of Object.entries(forged)) out.forged[k] = (await A.post({ ...body, saved_at: 3000 })).status;
        out.notJson = await A.post(null, A.csrf, '{"op":"save", nope');
        out.after = await A.get('');
        // une autre généalogie : elle ne voit pas la partie de A, et l'envoyer chez elle n'abîme pas celle de A
        out.otherGet = await B.get('uid=puz-1-abc');
        out.otherList = await B.get('');
        out.otherSave = await B.post({ op: 'save', uid: 'puz-1-abc', meta: meta({ name: 'Autre' }), state: state(1), saved_at: 99999 });
        out.aStill = await A.get('uid=puz-1-abc');
        // terminer : record, puis une deuxième partie plus lente et une plus rapide
        out.finish = await A.post({ op: 'finish', uid: 'puz-1-abc', meta: { elapsed: 61000 }, time: 61000, saved_at: 5000 });
        out.lateSave = await A.post({ op: 'save', uid: 'puz-1-abc', meta: { elapsed: 1 }, state: state(), saved_at: 6000 });
        await A.post({ op: 'save', uid: 'puz-5-b', meta: meta(), state: state(), saved_at: 1 });
        out.slower = await A.post({ op: 'finish', uid: 'puz-5-b', meta: {}, time: 90000 });
        out.faster = await A.post({ op: 'finish', uid: 'puz-6-c', meta: meta(), time: 30000 });
        out.list2 = await A.get('');
        out.del = await A.post({ op: 'delete', uid: 'puz-6-c' });
        out.list3 = await A.get('');
        // mode consultation : lecture permise, écriture refusée
        fs.writeFileSync(path.join(dirs.A, 'consultation.json'), JSON.stringify({ hash: '$2y$10$abcdefghijklmnopqrstuuWzGmJ1kGQ5JvH4sCq3zN6E1i0YqM6xG', since: 'x' }));
        out.kioskGet = await A.get('');
        out.kioskPost = await A.post({ op: 'save', uid: 'puz-7', meta: meta(), state: state(), saved_at: 1 });
        fs.unlinkSync(path.join(dirs.A, 'consultation.json'));
    } finally { A.proc.kill(); B.proc.kill(); }

    const checks = [
        ['base sans partie : listes vides', () => { assert.equal(out.empty.status, 200); assert.deepEqual(out.empty.body.games, []); assert.deepEqual(out.empty.body.history, []); }],
        ['enregistrer une partie', () => { assert.equal(out.save1.status, 200, JSON.stringify(out.save1.body)); assert.equal(out.save1.body.placed, 2); }],
        ['la liste la donne, sans les pièces', () => { const g = out.list1.body.games; assert.equal(g.length, 1); assert.equal(g[0].id, 'puz-1-abc'); assert.equal(g[0].name, '<b>Noce</b> de 1925'); assert.equal(g[0].elapsed, 5000); assert.equal(g[0].state, undefined); }],
        ['relire une partie : pièces identiques', () => { const s = out.one.body.game.state; assert.deepEqual(s.cx, state(2).cx.map(v => Math.round(v * 10) / 10)); /* au dixième */ assert.deepEqual(s.order, state(2).order); assert.deepEqual(s.lk, state(2).lk); assert.equal(out.one.body.game.meta.image.url, 'media/noce%201925.jpg'); }],
        ['envoi plus ancien ignoré', () => { assert.equal(out.older.body.ignored, 'older'); }],
        ['envoi partiel : temps et pièces changent, image gardée', () => { const g = out.one2.body.game; assert.equal(g.meta.elapsed, 9000); assert.equal(g.meta.placed, 5); assert.equal(g.meta.edges, true); assert.equal(g.meta.image.key, 'm:1'); }],
        ['sans jeton CSRF : refusé', () => assert.equal(out.noCsrf.status, 419)],
        ['jeton d’une autre généalogie (autre session) : refusé', () => assert.equal(out.otherCsrf.status, 419)],
        ['partie trop grosse : refusée', () => { assert.equal(out.huge.status, 422); assert.match(out.huge.body.error || '', /Image|grosse/); assert.equal(out.big.status, 200); }],
        ['JSON forgé : tout est refusé', () => { for (const [k, s] of Object.entries(out.forged)) assert.equal(s, 422, k); }],
        ['JSON illisible : refusé', () => assert.ok(out.notJson.status >= 400)],
        ['rien de forgé n’est entré', () => { assert.deepEqual(out.after.body.games.map(g => g.id).sort(), ['puz-1-abc', 'puz-3-big']); }],
        ['autre généalogie : partie introuvable chez elle', () => { assert.equal(out.otherGet.status, 404); assert.deepEqual(out.otherList.body.games, []); }],
        ['autre généalogie : son enregistrement ne touche pas la nôtre', () => { assert.equal(out.otherSave.status, 200); assert.equal(out.aStill.body.game.meta.name, '<b>Noce</b> de 1925'); assert.equal(out.aStill.body.game.meta.placed, 5); }],
        ['terminer : premier record', () => { assert.equal(out.finish.body.best, true); assert.equal(out.finish.body.time, 61000); }],
        ['enregistrement arrivé après la fin : ignoré', () => assert.equal(out.lateSave.body.ignored, 'done')],
        ['plus lent : pas de record ; plus rapide : record', () => { assert.equal(out.slower.body.best, false); assert.equal(out.slower.body.record_before, 61000); assert.equal(out.faster.body.best, true); }],
        ['historique et records', () => { const b = out.list2.body; assert.equal(b.history.length, 3); assert.equal(b.records['m:1|12'], 30000); assert.equal(b.history.find(h => h.id === 'puz-1-abc').time, 61000); assert.ok(b.games.every(g => g.id !== 'puz-1-abc')); }],
        ['supprimer', () => { assert.equal(out.del.body.deleted, 1); assert.equal(out.list3.body.history.length, 2); assert.equal(out.list3.body.records['m:1|12'], 61000); }],
        ['mode consultation : lecture permise, écriture refusée', () => { assert.equal(out.kioskGet.status, 200); assert.equal(out.kioskPost.status, 423); }],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
