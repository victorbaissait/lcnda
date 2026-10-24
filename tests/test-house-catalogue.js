'use strict';
/**
 * Test du catalogue « Mobilier » du plan de maison (assets/js/heritage-house-more.js), sans navigateur :
 * clés uniques, vraies dimensions, nom et mots-clés, catégorie connue, dessin vu de dessus pour chaque forme,
 * et rien d'injecté dans le dessin (le texte d'un objet n'y entre pas) ; les ateliers et métiers (heritage-house-metiers.js)
 * et les réglages d'image des tableaux (heritage-house-pics.js).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const LIB = [['commode', 'Commode', 'Chambre', 100, 50, 85, '#8a5a32', 'drawers', 'drawers', null]];
const ext = {houseLib: {LIB, libOf: k => LIB.find(l => l[0] === k)}};
const sandbox = {window: {LCNDA_EXT: ext}, document: {addEventListener() {}}, setTimeout: () => 0, console};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/heritage-house-more.js'), 'utf8'), sandbox);
const libSrc = fs.readFileSync(path.join(root, 'assets/js/heritage-house-lib.js'), 'utf8');
const CATS = eval(libSrc.match(/const CATS = (\[[^\]]+\]);/)[1]); // eslint-disable-line no-eval

let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e.message); } };
const rows = Object.entries(ext.houseMore.ROWS).flatMap(([cat, r]) => r.map(l => [cat, ...l]));

t('au moins 150 objets en plus, entrés dans le catalogue une seule fois', () => {
    assert.ok(rows.length >= 150, `${rows.length} objets`);
    const keys = rows.map(r => r[1]); assert.equal(new Set(keys).size, keys.length, 'clés en double');
    ext.houseMore.addAll(); ext.houseMore.addAll();
    assert.equal(LIB.length, 1 + rows.length);
});
t('chaque objet : catégorie connue, nom français, dimensions réalistes (cm), couleur, mots-clés', () => {
    for (const [cat, k, n, w, d, h, c, s, o] of rows) {
        assert.ok(CATS.includes(cat), `${k} : catégorie ${cat}`);
        assert.ok(n && n.length > 3, k); assert.match(c, /^#[0-9a-f]{6}$/i, k);
        for (const v of [w, d, h]) assert.ok(Number.isFinite(v) && v >= 1 && v <= 1000, `${k} : ${w}×${d}×${h}`);
        assert.ok(typeof s === 'string' && s, k); assert.ok(o?.kw && o.kw.length > 2, `${k} : mots-clés`);
        if (o.elev) assert.ok(o.elev > 0 && o.elev < 260, `${k} : hauteur au sol`);
    }
});
t('les catégories de pièce demandées existent', () => {
    for (const c of ['Séjour', 'Cuisine', 'Salle à manger', 'Chambre', 'Salle d’eau', 'Bureau', 'Entrée', 'Buanderie', 'Jardin, extérieur', 'Garage', 'Luminaires', 'Décoration', 'Électroménager', 'Musique']) assert.ok(CATS.includes(c), c);
    assert.ok(rows.filter(r => r[8]?.old).length >= 30, 'objets d’autrefois');
});
t('chaque forme « x… » a son dessin vu de dessus, sans texte injecté', () => {
    const S = 'stroke="#000"', R = (x, y, w, h, f = '#000', ex = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${S} ${ex}/>`;
    for (const [, k, , w, d, , c, s] of rows) {
        if (s[0] !== 'x') continue;
        const out = ext.houseSym2dX(s, {kind: k, w, d, color: c, color2: '<img onerror=x>'}, {R, S, c, w, d, x0: -w / 2, y0: -d / 2});
        assert.equal(typeof out, 'string', `${k} (${s}) sans dessin`); assert.ok(out.length > 20, k);
        assert.doesNotMatch(out, /NaN|undefined|onerror|<img/, `${k} (${s})`);
    }
});

/* ── Les ateliers et les métiers (assets/js/heritage-house-metiers.js) et les emplacements d'image (heritage-house-pics.js) ── */
const LIB2 = [['commode', 'Commode', 'Chambre', 100, 50, 85, '#8a5a32', 'drawers', 'drawers', null]];
const ext2 = {houseLib: {LIB: LIB2, libOf: k => LIB2.find(l => l[0] === k)}};
const sb2 = {window: {LCNDA_EXT: ext2}, document: {addEventListener() {}, getElementById: () => null}, setTimeout: () => 0, console, performance: {now: () => 0}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/heritage-house-metiers.js'), 'utf8'), sb2);
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/heritage-house-pics.js'), 'utf8'), sb2);
const mrows = Object.entries(ext2.houseMetiers.ROWS).flatMap(([cat, r]) => r.map(l => [cat, ...l]));
const metiers = mrows.filter(r => r[0] === 'Métiers, atelier');
t('au moins 80 objets de métiers en plus, chacun une seule fois (et pas déjà dans le catalogue)', () => {
    assert.ok(metiers.length >= 80, `${metiers.length} objets de métiers`);
    const keys = mrows.map(r => r[1]); assert.equal(new Set(keys).size, keys.length, 'clés en double');
    const old = new Set(rows.map(r => r[1])); keys.forEach(k => assert.ok(!old.has(k), `${k} existe déjà`));
    ext2.houseMetiers.addAll(); ext2.houseMetiers.addAll(); assert.equal(LIB2.length, 1 + mrows.length);
});
t('chaque objet de métier : nom français, dimensions réalistes, couleur, mots-clés, forme « m_ »', () => {
    for (const [cat, k, n, w, d, h, c, s, o] of mrows) {
        assert.ok(CATS.includes(cat), `${k} : catégorie ${cat}`); assert.ok(n && n.length > 3, k); assert.match(c, /^#[0-9a-f]{6}$/i, k);
        for (const v of [w, d, h]) assert.ok(Number.isFinite(v) && v >= 1 && v <= 1000, `${k} : ${w}×${d}×${h}`);
        assert.match(s, /^m_[a-z]+$/, k); assert.ok(o?.kw && o.kw.split(' ').length >= 2, `${k} : mots-clés`);
        if (o.elev) assert.ok(o.elev > 0 && o.elev < 260, `${k} : hauteur au sol`);
        if (o.color2) assert.match(o.color2, /^#[0-9a-f]{6}$/i, k);
    }
});
t('les métiers demandés sont tous là (recherche par mot-clé)', () => {
    const kw = metiers.map(r => `${r[2]} ${r[8].kw}`.toLowerCase()).join(' | ');
    for (const m of ['peintre', 'sculpteur', 'forgeron', 'maréchal', 'menuisier', 'ébéniste', 'tonnelier', 'charron', 'cordonnier', 'tailleur', 'couturière', 'tisserand', 'potier', 'boulanger', 'boucher', 'épicier', 'apothicaire', 'pharmacien', 'horloger', 'imprimeur', 'relieur', 'photographe', 'instituteur', 'médecin', 'sage-femme', 'barbier', 'meunier', 'vigneron', 'apiculteur', 'lavandière', 'dentellière', 'luthier', 'notaire', 'mairie', 'poste', 'mineur', 'pêcheur', 'marin', 'garde champêtre'])
        assert.ok(kw.includes(m), `métier « ${m} » absent`);
    for (const k of ['chevalet de campagne', 'chevalet d’atelier', 'toiles empilées', 'porte-toiles', 'palette', 'boîte de peinture', 'sellette']) assert.ok(mrows.some(r => r[2].toLowerCase().includes(k)), k);
    assert.ok(metiers.filter(r => r[7] === 'm_canvaslean').length >= 5, 'toiles sur châssis de plusieurs formats');
});
t('chaque forme « m_ » a son dessin vu de dessus, sans texte injecté', () => {
    const S = 'stroke="#000"', R = (x, y, w, h, f = '#000', ex = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${S} ${ex}/>`;
    for (const [, k, , w, d, , c, s] of mrows) {
        const out = ext2.houseSym2dX(s, {kind: k, w, d, color: c, color2: '<img onerror=x>'}, {R, S, c, w, d, x0: -w / 2, y0: -d / 2});
        assert.equal(typeof out, 'string', `${k} (${s}) sans dessin`); assert.ok(out.length > 20, k);
        assert.doesNotMatch(out, /NaN|undefined|onerror|<img/, `${k} (${s})`);
    }
});
t('🖼 les objets à image : emplacements connus, réglages nettoyés (id de média seul, bornes, rien de libre)', () => {
    const P = ext2.housePics; assert.ok(P, 'heritage-house-pics.js');
    for (const k of ['mt_easelst', 'mt_easelfd', 'mt_canvas10', 'mt_canvasfl', 'mt_canvasstk', 'mt_poster', 'mt_diploma', 'mt_photostand', 'mt_backdrop', 'mt_wallmap']) assert.equal(P.count({kind: k, w: 50, d: 50, h: 50}), 1, k);
    assert.equal(P.count({kind: 'mt_bench', w: 50, d: 50, h: 50}), 0);
    LIB2.push(['n_framewall', 'Mur de cadres photo', 'Décoration', 140, 3, 90, '#2b2b2b', 'xframes', 'xframes', {}], ['portrait', 'Portrait', 'Décoration', 60, 4, 80, '#8a6a3a', 'mirror', 'frame', {pic: 'portrait'}], ['chevalet', 'Chevalet', 'Métiers, atelier', 70, 60, 180, '#9a6a3a', 'easel', 'easel', null]);
    assert.equal(P.count({kind: 'n_framewall', w: 140, d: 3, h: 90}), 6); assert.equal(P.count({kind: 'portrait', w: 60, d: 4}), 1); assert.equal(P.count({kind: 'chevalet', w: 70, d: 60}), 1);
    assert.equal(P.clean({m: 'javascript:alert(1)'}), null); assert.equal(P.clean({m: '../../etc/passwd'}), null); assert.equal(P.clean({m: -3}), null);
    const c = P.clean({m: '12', fit: '<script>', zoom: 9999, px: -500, rot: 45, matColor: 'red;x', frameW: 1e9, src: 'data:text/html,x', extra: 'x'});
    assert.deepEqual(JSON.parse(JSON.stringify(c)), {m: 12, fit: 'fill', zoom: 400, px: -100, py: 0, rot: 0, matW: 0, matColor: '#f4efe4', frameW: 20, frameColor: '#6a4026'});
    const it = {kind: 'n_framewall', w: 140, d: 3, h: 90}; P.put(it, 3, {m: 7, rot: 90}); assert.equal(it.pics.length, 4); assert.equal(P.get(it, 3).rot, 90); assert.equal(P.get(it, 0), null);
    P.put(it, 9, {m: 8}); assert.equal(it.pics.length, 4, 'pas au-delà du nombre de cadres'); P.put(it, 3, null); assert.equal(it.pics, undefined);
    assert.equal(JSON.stringify(P.clean({m: 5})).includes('data:'), false);
});
/* ── Les objets de prière et de mémoire de toutes les traditions (assets/js/heritage-house-cultes.js) ── */
const LIB3 = [['commode', 'Commode', 'Chambre', 100, 50, 85, '#8a5a32', 'drawers', 'drawers', null]];
const ext3 = {houseLib: {LIB: LIB3, libOf: k => LIB3.find(l => l[0] === k)}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/heritage-house-cultes.js'), 'utf8'), {window: {LCNDA_EXT: ext3}, document: {addEventListener() {}}, setTimeout: () => 0, console});
const crows = Object.entries(ext3.houseCultes.ROWS).flatMap(([cat, r]) => r.map(l => [cat, ...l]));
t('Religion, souvenirs : au moins 60 objets en plus, de toutes les traditions, chacun une seule fois', () => {
    assert.ok(crows.length >= 60, `${crows.length} objets`);
    const keys = crows.map(r => r[1]); assert.equal(new Set(keys).size, keys.length, 'clés en double');
    const old = new Set([...rows.map(r => r[1]), ...mrows.map(r => r[1])]); keys.forEach(k => assert.ok(!old.has(k), `${k} existe déjà`));
    const kw = crows.map(r => `${r[2]} ${r[8].kw}`.toLowerCase()).join(' | ');
    for (const m of ['orthodoxe', 'protestant', 'catholique', 'juif', 'musulman', 'bouddhiste', 'hindou', 'sikh', 'shinto', 'taoïste', 'ancêtres', 'zoroastrien', 'souvenir']) assert.ok(kw.includes(m), `« ${m} » absent`);
    ext3.houseCultes.addAll(); ext3.houseCultes.addAll(); assert.equal(LIB3.length, 1 + crows.length);
});
t('chaque objet : catégorie connue, dimensions réalistes, couleurs, mots-clés ; chaque forme « r_ » a son dessin sans texte injecté', () => {
    const S = 'stroke="#000"', R = (x, y, w, h, f = '#000', ex = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${S} ${ex}/>`;
    for (const [cat, k, n, w, d, h, c, s, o] of crows) {
        assert.ok(CATS.includes(cat), `${k} : ${cat}`); assert.ok(n.length > 3, k); assert.match(c, /^#[0-9a-f]{6}$/i, k);
        for (const v of [w, d, h]) assert.ok(Number.isFinite(v) && v >= 1 && v <= 1000, `${k} : ${w}×${d}×${h}`);
        assert.ok(o?.kw && o.kw.split(' ').length >= 2, `${k} : mots-clés`); if (o.color2) assert.match(o.color2, /^#[0-9a-f]{6}$/i, k);
        if (!s.startsWith('r_')) continue;
        const out = ext3.houseSym2dX(s, {kind: k, w, d, color: c, color2: '<img onerror=x>'}, {R, S, c, w, d, x0: -w / 2, y0: -d / 2});
        assert.equal(typeof out, 'string', `${k} (${s}) sans dessin`); assert.ok(out.length > 20, k); assert.doesNotMatch(out, /NaN|undefined|onerror|<img/, `${k} (${s})`);
    }
});
if (failed) { console.error(`${failed} échec(s)`); process.exit(1); }
console.log('Catalogue du mobilier : OK');
