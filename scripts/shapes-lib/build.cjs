// Construit assets/data/shapes-lib.json : la grande bibliothèque de formes des tableaux (chargée à la demande).
// Sources : Phosphor Icons 2.1.1 (MIT), Material Design Icons 7.4.47 (Apache 2.0), glyphes DejaVu Sans (licence libre Bitstream Vera / DejaVu),
// et des formes calculées ici (héraldique, cadres, étiquettes, drapeaux simplifiés, liens d'arbre).
// Usage (depuis la racine du dépôt) :
//   mkdir /tmp/sl && cd /tmp/sl && npm init -y && npm install @phosphor-icons/core@2.1.1 @mdi/js@7.4.47 opentype.js@1.3.4
//   node scripts/shapes-lib/build.cjs /tmp/sl/node_modules assets/data/shapes-lib.json
// Il faut aussi la police DejaVu Sans (paquet fonts-dejavu-core : /usr/share/fonts/truetype/dejavu/).
// ph-fr.txt : noms français, catégorie et mots-clés de chaque pictogramme Phosphor gardé (kept.txt) ; les flèches sont nommées par le script.
// Les clés ne doivent JAMAIS changer : elles sont gardées dans les tableaux déjà faits.
'use strict';
const fs = require('fs'), path = require('path');
const NM = process.argv[2], OUT = process.argv[3];
const ot = require(path.join(NM, 'opentype.js'));
const mdi = require(path.join(NM, '@mdi/js'));
const PH = path.join(NM, '@phosphor-icons/core/assets');
const FONT = ot.loadSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf');
const FONT_R = ot.loadSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
const here = __dirname;

const rows = []; // [clé, nom, catégorie, chemin, evenodd (0/1), mots, boîte]
const keys = new Set();
const add = (k, n, c, d, eo, tags, box) => {
    if (keys.has(k)) throw new Error('clé en double ' + k);
    if (!/^[MLHVCSQTAZmlhvcsqtazEe0-9.,\s+-]+$/.test(d)) throw new Error('chemin bizarre ' + k);
    keys.add(k); rows.push([k, n, c, d, eo ? 1 : 0, tags || '', box]);
};
const f2 = v => String(+v.toFixed(2));
// ── formes de base (boîte 100) ──
const circ = (cx, cy, r) => `M${f2(cx - r)} ${f2(cy)}A${f2(r)} ${f2(r)} 0 1 0 ${f2(cx + r)} ${f2(cy)}A${f2(r)} ${f2(r)} 0 1 0 ${f2(cx - r)} ${f2(cy)}Z`;
const ell = (cx, cy, rx, ry) => `M${f2(cx - rx)} ${f2(cy)}A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx + rx)} ${f2(cy)}A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx - rx)} ${f2(cy)}Z`;
const rect = (x, y, w, h) => `M${f2(x)} ${f2(y)}H${f2(x + w)}V${f2(y + h)}H${f2(x)}Z`;
const rrect = (x, y, w, h, r) => r <= 0 ? rect(x, y, w, h) : `M${f2(x + r)} ${f2(y)}H${f2(x + w - r)}A${r} ${r} 0 0 1 ${f2(x + w)} ${f2(y + r)}V${f2(y + h - r)}A${r} ${r} 0 0 1 ${f2(x + w - r)} ${f2(y + h)}H${f2(x + r)}A${r} ${r} 0 0 1 ${f2(x)} ${f2(y + h - r)}V${f2(y + r)}A${r} ${r} 0 0 1 ${f2(x + r)} ${f2(y)}Z`;
const poly = pts => 'M' + pts.map(([x, y]) => `${f2(x)} ${f2(y)}`).join('L') + 'Z';
const ngon = (n, r, cx = 50, cy = 50, rot = -90) => Array.from({length: n}, (_, i) => { const t = (rot + i * 360 / n) * Math.PI / 180; return [cx + Math.cos(t) * r, cy + Math.sin(t) * r]; });
const starPts = (n, r1, r2, cx = 50, cy = 50, rot = -90) => Array.from({length: n * 2}, (_, i) => { const r = i % 2 ? r2 : r1, t = (rot + i * 180 / n) * Math.PI / 180; return [cx + Math.cos(t) * r, cy + Math.sin(t) * r]; });
const scalePts = (pts, k, cx = 50, cy = 50) => pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);

// ═══ 1. Phosphor ═══
const fr = Object.fromEntries(fs.readFileSync(path.join(here, 'ph-fr.txt'), 'utf8').trim().split('\n').map(l => { const [k, n, c, t] = l.split('|'); return [k, {n, c, t: t || ''}]; }));
const DIR = {up: 'le haut', down: 'le bas', left: 'la gauche', right: 'la droite', 'up-left': 'le haut à gauche', 'up-right': 'le haut à droite', 'down-left': 'le bas à gauche', 'down-right': 'le bas à droite'};
const W = {up: 'haut', down: 'bas', left: 'gauche', right: 'droite'};
function arrowName(name) {
    let m;
    const two = s => s.split('-').map(x => W[x]).join(', ');
    if ((m = /^arrow-arc-(left|right)$/.exec(name))) return `Flèche en arc vers ${DIR[m[1]]}`;
    if ((m = /^arrow-bend-double-(.+)$/.exec(name))) return `Double flèche courbée (${two(m[1])})`;
    if ((m = /^arrow-bend-(.+)$/.exec(name))) return `Flèche courbée (${two(m[1])})`;
    if ((m = /^arrow-circle-(.+)$/.exec(name))) return `Flèche ronde vers ${DIR[m[1]]}`;
    if (name === 'arrow-clockwise') return 'Flèche tournante (sens des aiguilles)';
    if (name === 'arrow-counter-clockwise') return 'Flèche tournante (sens inverse)';
    if ((m = /^arrow-elbow-(left|right)$/.exec(name))) return `Flèche en équerre vers ${DIR[m[1]]}`;
    if ((m = /^arrow-elbow-(.+)$/.exec(name))) return `Flèche en équerre (${two(m[1])})`;
    if ((m = /^arrow-fat-lines-(.+)$/.exec(name))) return `Grosse flèche à traits vers ${DIR[m[1]]}`;
    if ((m = /^arrow-fat-line-(.+)$/.exec(name))) return `Grosse flèche à un trait vers ${DIR[m[1]]}`;
    if ((m = /^arrow-fat-(.+)$/.exec(name))) return `Grosse flèche vers ${DIR[m[1]]}`;
    if ((m = /^arrow-line-(.+)$/.exec(name))) return `Flèche jusqu’au trait vers ${DIR[m[1]]}`;
    if ((m = /^arrow-square-(.+)$/.exec(name))) return `Flèche carrée vers ${DIR[m[1]]}`;
    if ((m = /^arrow-u-(.+)$/.exec(name))) return `Flèche en U (${two(m[1])})`;
    if ((m = /^arrow-(.+)$/.exec(name)) && DIR[m[1]]) return `Flèche vers ${DIR[m[1]]}`;
    const A = {'arrows-clockwise': 'Flèches tournantes (sens des aiguilles)', 'arrows-counter-clockwise': 'Flèches tournantes (sens inverse)', 'arrows-down-up': 'Flèches haut et bas', 'arrows-horizontal': 'Flèches gauche et droite (écartées)',
        'arrows-in': 'Flèches vers le centre', 'arrows-in-cardinal': 'Flèches vers le centre (4 côtés)', 'arrows-in-line-horizontal': 'Flèches vers un trait (debout)', 'arrows-in-line-vertical': 'Flèches vers un trait (couché)', 'arrows-left-right': 'Flèches gauche et droite',
        'arrows-merge': 'Flèches qui se rejoignent', 'arrows-out': 'Flèches vers l’extérieur', 'arrows-out-cardinal': 'Flèches vers l’extérieur (4 côtés)', 'arrows-out-line-horizontal': 'Flèches qui s’écartent d’un trait (debout)', 'arrows-out-line-vertical': 'Flèches qui s’écartent d’un trait (couché)',
        'arrows-split': 'Flèches qui se séparent', 'arrows-vertical': 'Flèches haut et bas (écartées)'};
    if (A[name]) return A[name];
    if ((m = /^caret-circle-double-(.+)$/.exec(name))) return `Double chevron rond vers ${DIR[m[1]]}`;
    if (name === 'caret-circle-up-down') return 'Chevrons haut et bas (rond)';
    if ((m = /^caret-circle-(.+)$/.exec(name))) return `Chevron rond vers ${DIR[m[1]]}`;
    if ((m = /^caret-double-(.+)$/.exec(name))) return `Double chevron vers ${DIR[m[1]]}`;
    if ((m = /^caret-line-(.+)$/.exec(name))) return `Chevron jusqu’au trait vers ${DIR[m[1]]}`;
    if (name === 'caret-up-down') return 'Chevrons haut et bas';
    if ((m = /^caret-(.+)$/.exec(name)) && DIR[m[1]]) return `Chevron vers ${DIR[m[1]]}`;
    return null;
}
const kept = fs.readFileSync(path.join(here, 'kept.txt'), 'utf8').trim().split('\n');
let nPh = 0;
for (const name of kept) {
    let info = fr[name];
    if (!info) { const n = arrowName(name); if (!n) throw new Error('sans nom : ' + name); info = {n, c: 'arrows', t: /^caret/.test(name) ? 'chevron flèche' : 'flèche direction'}; }
    for (const [w, file, suf] of [['regular', `${name}.svg`, ' (trait fin)'], ['fill', `${name}-fill.svg`, ' (plein)']]) {
        const svg = fs.readFileSync(path.join(PH, w, file), 'utf8');
        const ds = [...svg.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
        if (!ds.length || /<(rect|circle|line|polyline|polygon|ellipse)\b/.test(svg)) throw new Error('svg inattendu ' + file);
        add('ph_' + name.replace(/-/g, '_') + (w === 'fill' ? '_fill' : ''), info.n + suf, info.c, ds.join(''), 0, info.t, 256); nPh++;
    }
}

// ═══ 2. Lettres, chiffres, accents, ponctuation ═══
const capH = FONT.charToGlyph('H').getBoundingBox().y2;
// glyphe → chemin (boîte 24), centré en x sur cx, ligne de base sur base, hauteur des capitales = cap
function glyphPath(font, ch, {cap = 10, cx = 12, base = 17, fit = null} = {}) {
    const g = font.charToGlyph(ch); if (!g || g.index === 0) throw new Error('glyphe absent ' + ch);
    let k = cap / capH; const bb = g.getBoundingBox();
    if (fit) { const w = (bb.x2 - bb.x1) * k, h = (bb.y2 - bb.y1) * k; const r = fit(w, h); if (r < 1) k *= r; }
    const x = cx - (bb.x1 + bb.x2) / 2 * k;
    let y = base; if (fit) { /* centré en hauteur dans le rond / le carré */ y = 12 + (bb.y1 + bb.y2) / 2 * k; }
    const p = g.getPath(x, y, k * font.unitsPerEm);
    return p.toPathData(2);
}
function glyphFree(font, ch, size = 20, box = 24) { // centré et ramené à « size » dans la boîte
    const g = font.charToGlyph(ch); if (!g || g.index === 0) throw new Error('glyphe absent ' + ch);
    const bb = g.getBoundingBox(), w = bb.x2 - bb.x1, h = bb.y2 - bb.y1, k = size / Math.max(w, h, 1);
    const x = box / 2 - (bb.x1 + bb.x2) / 2 * k, y = box / 2 + (bb.y1 + bb.y2) / 2 * k;
    return g.getPath(x, y, k * font.unitsPerEm).toPathData(2);
}
const C24 = (r) => `M12 ${12 - r}A${r} ${r} 0 1 0 12 ${12 + r}A${r} ${r} 0 1 0 12 ${12 - r}Z`;
const BOX = 'M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z', BOX_IN = 'M5 5V19H19V5Z';
const fitCircle = (w, h) => 7.3 / Math.hypot(w / 2, h / 2);
const fitBox = (w, h) => Math.min(12.4 / w, 12.4 / h);
const VAR = [['', 'seule'], ['_circle', ''], ['_circle_outline', 'contour'], ['_box', 'carré'], ['_box_outline', 'carré, contour']];
function glyphVariants(keyBase, label, ch, tags, cat = 'letters', fem = true) {
    const plain = glyphPath(FONT, ch, {cap: 14, base: 19, fit: null});
    const inC = glyphPath(FONT, ch, {cap: 10, fit: fitCircle}), inB = glyphPath(FONT, ch, {cap: 10, fit: fitBox});
    const nm = s => s ? `${label} (${s === 'seule' && !fem ? 'seul' : s})` : label;
    add(keyBase, nm('seule'), cat, plain, 0, tags, 24);
    add(keyBase + '_circle', nm(''), cat, C24(10) + inC, 1, tags + ' rond cercle', 24);
    add(keyBase + '_circle_outline', nm('contour'), cat, C24(10) + C24(8) + inC, 1, tags + ' rond cercle', 24);
    add(keyBase + '_box', nm('carré'), cat, BOX + inB, 1, tags + ' carré case', 24);
    add(keyBase + '_box_outline', nm('carré, contour'), cat, BOX + BOX_IN + inB, 1, tags + ' carré case', 24);
}
// capitales et chiffres : Material Design Icons (même dessin que « Lettre A », « Lettre B » déjà là)
const EXIST = new Set(['mdi_alpha_a_circle', 'mdi_alpha_b_circle', 'mdi_alpha_a_circle_outline', 'mdi_alpha_b_circle_outline', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `mdi_numeric_${i}_circle`), ...[1, 2, 3].map(i => `mdi_numeric_${i}_circle_outline`)]);
const camel = s => s.replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    for (const [suf, s] of VAR) {
        const k = `mdi_alpha_${L.toLowerCase()}${suf}`; if (EXIST.has(k)) continue;
        const d = mdi['mdi' + camel(`alpha_${L.toLowerCase()}${suf}`)]; if (!d) throw new Error('mdi absent ' + k);
        add(k, s ? `Lettre ${L} (${s})` : `Lettre ${L}`, 'letters', d, 0, `lettre majuscule capitale initiale ${L.toLowerCase()} alphabet`, 24);
    }
}
for (let i = 0; i <= 9; i++) {
    for (const [suf, s] of VAR) {
        const k = `mdi_numeric_${i}${suf}`; if (EXIST.has(k)) continue;
        const d = mdi['mdi' + camel(`numeric_${i}${suf}`)]; if (!d) throw new Error('mdi absent ' + k);
        add(k, s ? `Chiffre ${i} (${s === 'seule' ? 'seul' : s})` : `Chiffre ${i}`, 'letters', d, 0, `chiffre nombre numéro ${i}`, 24);
    }
}
// minuscules, lettres accentuées, ligatures : glyphes DejaVu Sans Bold
const cp = ch => ch.codePointAt(0).toString(16);
for (const l of 'abcdefghijklmnopqrstuvwxyz') glyphVariants(`lt_${l}`, `Lettre ${l} minuscule`, l, `lettre minuscule ${l} alphabet`);
const ACC = 'ÀÂÄÆÇÉÈÊËÎÏÔÖŒÙÛÜŸÑàâäæçéèêëîïôöœùûüÿñß';
const accTag = ch => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace('æ', 'ae').replace('œ', 'oe');
for (const ch of ACC) { const up = ch !== ch.toLowerCase(); glyphVariants(`lt_u${cp(ch)}`, `Lettre ${ch}${up || ch === 'ß' ? '' : ' minuscule'}`, ch, `lettre accent accentuée ${accTag(ch)} ${up ? 'majuscule' : 'minuscule'}`); }
const PUNCT = [['.', 'Point'], [',', 'Virgule'], [';', 'Point-virgule'], [':', 'Deux-points'], ['!', 'Point d’exclamation'], ['?', 'Point d’interrogation'], ['¡', 'Point d’exclamation renversé'], ['¿', 'Point d’interrogation renversé'],
    ['’', 'Apostrophe'], ['"', 'Guillemet droit'], ['«', 'Guillemet ouvrant'], ['»', 'Guillemet fermant'], ['(', 'Parenthèse ouvrante'], [')', 'Parenthèse fermante'], ['[', 'Crochet ouvrant'], [']', 'Crochet fermant'],
    ['-', 'Trait d’union'], ['–', 'Tiret'], ['&', 'Esperluette (et)'], ['@', 'Arobase'], ['#', 'Dièse (numéro)'], ['%', 'Pour cent'], ['*', 'Astérisque (naissance)'], ['/', 'Barre oblique'],
    ['+', 'Plus'], ['=', 'Égal'], ['§', 'Paragraphe (§)'], ['¶', 'Pied-de-mouche'], ['€', 'Euro'], ['$', 'Dollar'], ['£', 'Livre'], ['°', 'Degré (naissance °)'], ['†', 'Croix (décès †)'], ['‡', 'Double croix'], ['…', 'Points de suspension'], ['№', 'Numéro (№)']];
for (const [ch, n] of PUNCT) glyphVariants(`lt_u${cp(ch)}`, n, ch, 'ponctuation signe', 'letters', false);
// nombres de 10 à 31 (jours du mois, numéros)
for (let i = 10; i <= 31; i++) {
    const s = String(i), g = FONT.getPath(s, 0, 0, 100), bb = g.getBoundingBox();
    const mk = (fit, cxy = 12) => { const w = bb.x2 - bb.x1, h = bb.y2 - bb.y1, k = fit(w, h); const p = FONT.getPath(s, cxy - (bb.x1 + bb.x2) / 2 * k, cxy - (bb.y1 + bb.y2) / 2 * k, 100 * k); return p.toPathData(2); };
    const inC = mk((w, h) => 7.3 / Math.hypot(w / 2, h / 2)), plain = mk((w, h) => Math.min(20 / w, 14 / h));
    add(`lt_n${i}`, `Nombre ${i} (seul)`, 'letters', plain, 0, `nombre numéro jour ${i}`, 24);
    add(`lt_n${i}_circle`, `Nombre ${i}`, 'letters', C24(10) + inC, 1, `nombre numéro jour ${i} rond`, 24);
    add(`lt_n${i}_circle_outline`, `Nombre ${i} (contour)`, 'letters', C24(10) + C24(8) + inC, 1, `nombre numéro jour ${i} rond`, 24);
}

// ═══ 3. Symboles et signes (glyphes DejaVu Sans) ═══
const SYM = [
    // généalogie
    ['°', 'Signe de naissance (°)', 'genea', 'naissance né'], ['*', 'Étoile de naissance (*)', 'genea', 'naissance né astérisque'], ['†', 'Croix de décès (†)', 'genea', 'décès mort'], ['‡', 'Double croix (‡)', 'genea', 'décès'],
    ['⚭', 'Signe du mariage (⚭)', 'genea', 'mariage union anneaux'], ['⚮', 'Signe du divorce (⚮)', 'genea', 'divorce séparation'], ['⚯', 'Union libre (⚯)', 'genea', 'concubinage union'], ['∞', 'Infini (∞, mariage)', 'genea', 'mariage union'],
    ['⚰', 'Cercueil (inhumation)', 'genea', 'sépulture enterrement décès'], ['⚱', 'Urne (crémation)', 'genea', 'crémation décès'], ['⚔', 'Épées croisées (mort au combat)', 'genea', 'guerre soldat bataille'], ['♂', 'Homme (♂)', 'genea', 'masculin garçon'], ['♀', 'Femme (♀)', 'genea', 'féminin fille'],
    ['⚥', 'Homme et femme', 'genea', 'couple genre'], ['⚤', 'Couple (♀♂)', 'genea', 'couple union'], ['⚲', 'Neutre', 'genea', 'genre'], ['☙', 'Fleuron (vers la gauche)', 'frames', 'ornement'], ['❧', 'Fleuron', 'frames', 'ornement feuille'], ['❦', 'Feuille de vigne (ornement)', 'frames', 'fleuron'],
    // croyances
    ['✝', 'Croix latine', 'faith', 'christianisme baptême'], ['✞', 'Croix ombrée', 'faith', 'christianisme'], ['✟', 'Croix à contour', 'faith', 'christianisme'], ['✠', 'Croix de Malte (✠)', 'faith', 'ordre chevalier'], ['☦', 'Croix orthodoxe', 'faith', 'orthodoxe'],
    ['☧', 'Chrisme', 'faith', 'christ chi rho'], ['☨', 'Croix de Lorraine', 'faith', 'croix'], ['☩', 'Croix de Jérusalem', 'faith', 'croisade'], ['☥', 'Ankh (croix ansée)', 'faith', 'égypte vie'], ['☪', 'Croissant et étoile', 'faith', 'islam'],
    ['✡', 'Étoile de David', 'faith', 'judaïsme'], ['☸', 'Roue du dharma', 'faith', 'bouddhisme'], ['☯', 'Yin et yang (☯)', 'faith', 'taoïsme'], ['☮', 'Paix', 'faith', 'paix'], ['☬', 'Khanda', 'faith', 'sikhisme'], ['☫', 'Symbole de Farsi', 'faith', 'iran'],
    ['✙', 'Croix pattée à contour', 'faith', 'croix'], ['✚', 'Croix grecque épaisse', 'faith', 'croix'], ['✛', 'Croix à centre ouvert', 'faith', 'croix'], ['✜', 'Croix à centre rond', 'faith', 'croix'],
    // héraldique
    ['⚜', 'Fleur de lys (⚜)', 'heraldry', 'royauté blason scout'], ['♔', 'Roi (échecs, contour)', 'heraldry', 'couronne roi jeu'], ['♕', 'Reine (échecs, contour)', 'heraldry', 'couronne reine jeu'], ['♖', 'Tour (échecs, contour)', 'heraldry', 'château jeu'],
    ['♗', 'Fou (échecs, contour)', 'heraldry', 'évêque jeu'], ['♘', 'Cavalier (échecs, contour)', 'heraldry', 'cheval jeu'], ['♙', 'Pion (échecs, contour)', 'heraldry', 'jeu'], ['♚', 'Roi (échecs)', 'heraldry', 'couronne roi jeu'],
    ['♛', 'Reine (échecs)', 'heraldry', 'couronne reine jeu'], ['♜', 'Tour (échecs)', 'heraldry', 'château jeu'], ['♝', 'Fou (échecs)', 'heraldry', 'évêque jeu'], ['♞', 'Cavalier (échecs)', 'heraldry', 'cheval jeu'], ['♟', 'Pion (échecs)', 'heraldry', 'jeu'],
    // métiers et objets
    ['⚓', 'Ancre (⚓)', 'jobs', 'marin mer'], ['⚒', 'Marteau et pic', 'jobs', 'mineur forgeron'], ['⚖', 'Balance (justice)', 'jobs', 'justice notaire'], ['⚕', 'Bâton d’Esculape', 'jobs', 'médecin'], ['⚗', 'Alambic', 'jobs', 'chimiste pharmacien'],
    ['⚙', 'Roue dentée', 'jobs', 'mécanique engrenage'], ['⚚', 'Caducée d’Hermès', 'jobs', 'commerce'], ['☤', 'Caducée', 'jobs', 'médecin pharmacien'], ['✂', 'Ciseaux (✂)', 'jobs', 'couture'], ['✒', 'Plume (✒)', 'docs', 'écriture'],
    ['✍', 'Main qui écrit', 'docs', 'écriture signature'], ['✎', 'Crayon (✎)', 'docs', 'écrire'], ['✏', 'Crayon (✏)', 'docs', 'écrire'], ['✉', 'Enveloppe (✉)', 'docs', 'lettre courrier'], ['✈', 'Avion (✈)', 'transport', 'voyage'], ['☎', 'Téléphone ancien', 'objects', 'téléphone'], ['⌂', 'Maison (⌂)', 'places', 'foyer'],
    // jeux, musique
    ['♠', 'Pique', 'leisure', 'cartes jeu'], ['♣', 'Trèfle', 'leisure', 'cartes jeu'], ['♥', 'Cœur (cartes)', 'leisure', 'cartes jeu amour'], ['♦', 'Carreau', 'leisure', 'cartes jeu'],
    ['♩', 'Noire (note)', 'leisure', 'musique'], ['♪', 'Croche', 'leisure', 'musique note'], ['♫', 'Deux croches', 'leisure', 'musique note'], ['♬', 'Doubles croches', 'leisure', 'musique note'], ['♭', 'Bémol', 'leisure', 'musique'], ['♮', 'Bécarre', 'leisure', 'musique'], ['♯', 'Dièse (musique)', 'leisure', 'musique'],
    ['⚀', 'Dé un', 'leisure', 'jeu'], ['⚁', 'Dé deux', 'leisure', 'jeu'], ['⚂', 'Dé trois', 'leisure', 'jeu'], ['⚃', 'Dé quatre', 'leisure', 'jeu'], ['⚄', 'Dé cinq', 'leisure', 'jeu'], ['⚅', 'Dé six', 'leisure', 'jeu'],
    // météo et ciel
    ['☀', 'Soleil (☀)', 'weather', 'beau temps'], ['☁', 'Nuage (☁)', 'weather', 'ciel'], ['☂', 'Parapluie (☂)', 'weather', 'pluie'], ['☃', 'Bonhomme de neige', 'weather', 'hiver neige'], ['☄', 'Comète', 'weather', 'ciel étoile'],
    ['☼', 'Soleil à rayons', 'weather', 'beau temps'], ['❄', 'Flocon (❄)', 'weather', 'neige hiver'], ['❅', 'Flocon ciselé', 'weather', 'neige hiver'], ['❆', 'Flocon épais', 'weather', 'neige hiver'], ['☇', 'Éclair (☇)', 'weather', 'orage'], ['☈', 'Orage (☈)', 'weather', 'éclair'],
    // nature
    ['☘', 'Trèfle irlandais', 'nature', 'irlande chance'], ['⚘', 'Fleur (⚘)', 'nature', 'fleur'], ['✿', 'Fleur à cinq pétales', 'nature', 'fleur'], ['❀', 'Fleur (contour)', 'nature', 'fleur'], ['❁', 'Fleur ornée', 'nature', 'fleur'], ['❃', 'Fleur étoilée', 'nature', 'fleur'], ['✾', 'Fleur à six pétales', 'nature', 'fleur'], ['✽', 'Fleur en goutte', 'nature', 'fleur'],
    // étoiles
    ['★', 'Étoile pleine (★)', 'stars', 'étoile'], ['☆', 'Étoile vide (☆)', 'stars', 'étoile'], ['✦', 'Étoile à quatre pointes', 'stars', 'étoile scintille'], ['✧', 'Étoile à quatre pointes (contour)', 'stars', 'étoile'], ['✩', 'Étoile à contour', 'stars', 'étoile'],
    ['✪', 'Étoile dans un rond', 'stars', 'étoile'], ['✫', 'Étoile à centre ouvert', 'stars', 'étoile'], ['✬', 'Étoile à centre noir', 'stars', 'étoile'], ['✭', 'Étoile à contour (✭)', 'stars', 'étoile'], ['✮', 'Étoile ombrée', 'stars', 'étoile'], ['✯', 'Étoile en hélice', 'stars', 'étoile'], ['✰', 'Étoile en relief', 'stars', 'étoile'],
    ['✱', 'Astérisque épais', 'stars', 'étoile'], ['✲', 'Astérisque à centre ouvert', 'stars', 'étoile'], ['✳', 'Astérisque à huit branches', 'stars', 'étoile'], ['✴', 'Étoile à huit branches (✴)', 'stars', 'étoile'], ['✵', 'Étoile tourbillon', 'stars', 'étoile'], ['✶', 'Étoile à six branches (✶)', 'stars', 'étoile'],
    ['✷', 'Étoile à huit branches fine', 'stars', 'étoile'], ['✸', 'Étoile à huit branches épaisse', 'stars', 'étoile'], ['✹', 'Étoile à douze branches', 'stars', 'étoile soleil'], ['✺', 'Étoile à seize branches', 'stars', 'étoile soleil'], ['✻', 'Astérisque en gouttes', 'stars', 'étoile'], ['✼', 'Astérisque en gouttes (contour)', 'stars', 'étoile'], ['❂', 'Soleil rond', 'stars', 'étoile soleil'], ['⁂', 'Trois astérisques', 'stars', 'astérisme'],
    // mains, visages, signes
    ['☞', 'Main qui montre à droite', 'people', 'doigt index'], ['☜', 'Main qui montre à gauche', 'people', 'doigt index'], ['☝', 'Main qui montre en haut', 'people', 'doigt index'], ['☟', 'Main qui montre en bas', 'people', 'doigt index'], ['✌', 'Victoire (deux doigts)', 'people', 'geste paix'],
    ['☺', 'Sourire (☺)', 'emotions', 'content'], ['☻', 'Sourire plein (☻)', 'emotions', 'content'], ['☹', 'Tristesse (☹)', 'emotions', 'triste'], ['❤', 'Cœur (❤)', 'emotions', 'amour'], ['❥', 'Cœur penché', 'emotions', 'amour'], ['☠', 'Tête de mort (☠)', 'genea', 'décès danger pirate'],
    ['☢', 'Radioactif', 'symbols', 'danger'], ['☣', 'Danger biologique', 'symbols', 'danger'], ['⚠', 'Attention (⚠)', 'symbols', 'danger'], ['⚡', 'Haute tension', 'symbols', 'éclair danger'], ['⚛', 'Atome (⚛)', 'symbols', 'science'], ['♻', 'Recyclage (♻)', 'symbols', 'recycler'], ['☕', 'Tasse fumante', 'food', 'café thé'], ['♨', 'Source chaude', 'symbols', 'bain thermal'],
    ['✓', 'Coche fine', 'symbols', 'ok vrai'], ['✔', 'Coche épaisse', 'symbols', 'ok vrai'], ['✗', 'Croix tracée', 'symbols', 'non faux'], ['✘', 'Croix tracée épaisse', 'symbols', 'non faux'], ['❖', 'Losange à quatre pointes', 'symbols', 'ornement'], ['※', 'Marque de référence', 'symbols', 'note'],
    ['©', 'Copyright (©)', 'symbols', 'droits'], ['®', 'Marque déposée', 'symbols', 'droits'], ['™', 'Marque (™)', 'symbols', 'droits'], ['⊕', 'Plus dans un rond', 'symbols', 'cercle'], ['⊗', 'Croix dans un rond', 'symbols', 'cercle'], ['⊙', 'Point dans un rond', 'symbols', 'cercle soleil'], ['⊚', 'Rond dans un rond', 'symbols', 'cercle cible'],
    ['◐', 'Rond à moitié (gauche)', 'geo', 'cercle'], ['◑', 'Rond à moitié (droite)', 'geo', 'cercle'], ['◒', 'Rond à moitié (bas)', 'geo', 'cercle'], ['◓', 'Rond à moitié (haut)', 'geo', 'cercle'], ['◔', 'Rond au quart', 'geo', 'cercle'], ['◕', 'Rond aux trois quarts', 'geo', 'cercle'],
    ['♁', 'Terre (♁)', 'weather', 'planète'], ['☉', 'Soleil (astronomie)', 'weather', 'planète'], ['☽', 'Premier croissant', 'weather', 'lune'], ['☾', 'Dernier croissant', 'weather', 'lune'], ['♃', 'Jupiter', 'weather', 'planète'], ['♄', 'Saturne', 'weather', 'planète'], ['☿', 'Mercure', 'weather', 'planète'],
    ['♈', 'Bélier', 'symbols', 'zodiaque astrologie signe'], ['♉', 'Taureau', 'symbols', 'zodiaque astrologie signe'], ['♊', 'Gémeaux', 'symbols', 'zodiaque astrologie signe jumeaux'], ['♋', 'Cancer', 'symbols', 'zodiaque astrologie signe'], ['♌', 'Lion', 'symbols', 'zodiaque astrologie signe'], ['♍', 'Vierge', 'symbols', 'zodiaque astrologie signe'],
    ['♎', 'Balance (zodiaque)', 'symbols', 'zodiaque astrologie signe'], ['♏', 'Scorpion', 'symbols', 'zodiaque astrologie signe'], ['♐', 'Sagittaire', 'symbols', 'zodiaque astrologie signe'], ['♑', 'Capricorne', 'symbols', 'zodiaque astrologie signe'], ['♒', 'Verseau', 'symbols', 'zodiaque astrologie signe'], ['♓', 'Poissons', 'symbols', 'zodiaque astrologie signe'],
];
for (const [ch, n, c, t] of SYM) { const f = FONT_R.charToGlyphIndex(ch) ? FONT_R : FONT; add(`sym_${cp(ch)}`, n, c, glyphFree(f, ch, 20), 0, t + ' symbole signe', 24); }

// ═══ 4. Héraldique : écus et partitions (boîte 100) ═══
const sample = (fn, n) => Array.from({length: n + 1}, (_, i) => fn(i / n));
const ECUS = {
    fr: ['Écu français', (() => { const q = (a, c, b, t) => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
        return [[10, 6], [90, 6], ...sample(t => q([90, 56], [90, 86], [50, 96], t), 12).slice(0, -1), [50, 96], ...sample(t => q([50, 96], [10, 86], [10, 56], t), 12).slice(1)]; })()],
    old: ['Écu ancien', [[8, 6], [92, 6], ...sample(t => [92 - 6 * t * t - 36 * t ** 3, 6 + 90 * t], 12).slice(1, -1), [50, 96], ...sample(t => [8 + 6 * (1 - t) ** 2 + 36 * (1 - t) ** 3, 6 + 90 * (1 - t)], 12).slice(1, -1)]],
    es: ['Écu espagnol', [[10, 6], [90, 6], [90, 56], ...sample(t => { const a = t * Math.PI; return [50 + 40 * Math.cos(a), 56 + 40 * Math.sin(a)]; }, 16).slice(1, -1), [10, 56]]],
    lz: ['Écu en losange (dames)', [[50, 2], [92, 50], [50, 98], [8, 50]]],
    ov: ['Écu ovale (ecclésiastique)', sample(t => { const a = t * 2 * Math.PI; return [50 + 36 * Math.cos(a), 50 + 46 * Math.sin(a)]; }, 40).slice(0, -1)],
    rd: ['Écu rond', sample(t => { const a = t * 2 * Math.PI; return [50 + 46 * Math.cos(a), 50 + 46 * Math.sin(a)]; }, 40).slice(0, -1)],
    sq: ['Bannière carrée', [[8, 8], [92, 8], [92, 92], [8, 92]]],
};
// découpe d'un polygone par un polygone convexe (Sutherland–Hodgman)
function clip(subject, clipPoly) {
    let out = subject; const area = clipPoly.reduce((s, p, i) => { const q = clipPoly[(i + 1) % clipPoly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0), sgn = Math.sign(area);
    for (let i = 0; i < clipPoly.length && out.length; i++) {
        const A = clipPoly[i], B = clipPoly[(i + 1) % clipPoly.length], inside = p => sgn * ((B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0])) >= -1e-9;
        const inter = (P, Q) => { const a1 = B[1] - A[1], b1 = A[0] - B[0], c1 = a1 * A[0] + b1 * A[1], a2 = Q[1] - P[1], b2 = P[0] - Q[0], c2 = a2 * P[0] + b2 * P[1], det = a1 * b2 - a2 * b1; return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det]; };
        const inp = out; out = [];
        for (let j = 0; j < inp.length; j++) { const P = inp[j], Q = inp[(j + 1) % inp.length]; if (inside(Q)) { if (!inside(P)) out.push(inter(P, Q)); out.push(Q); } else if (inside(P)) out.push(inter(P, Q)); }
    }
    return out;
}
const centroid = pts => { const n = pts.length; return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]; };
const inset = (pts, k) => { const [cx, cy] = centroid(pts); return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]); };
for (const [id, [nm, pts]] of Object.entries(ECUS)) {
    add(`her_${id}`, nm, 'heraldry', poly(pts), 0, 'blason armoiries écu bouclier', 100);
    add(`her_${id}_outline`, nm + ' (contour)', 'heraldry', poly(pts) + poly(inset(pts, 0.86)), 1, 'blason armoiries écu bouclier', 100);
}
// partitions et pièces sur l'écu français : bord + morceaux découpés dans l'intérieur
const band = (x1, y1, x2, y2, w) => { const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), nx = -dy / L * w / 2, ny = dx / L * w / 2; return [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]; };
const PARTS = [
    ['parti', 'Parti (coupé en deux debout)', [[[0, 0], [50, 0], [50, 100], [0, 100]]], 'moitié verticale'],
    ['coupe', 'Coupé (en deux couché)', [[[0, 0], [100, 0], [100, 46], [0, 46]]], 'moitié horizontale'],
    ['tranche', 'Tranché (en diagonale)', [[[0, 0], [100, 0], [0, 100]]], 'diagonale'],
    ['taille', 'Taillé (en diagonale)', [[[0, 0], [100, 0], [100, 100]]], 'diagonale'],
    ['ecartele', 'Écartelé (en quatre)', [[[0, 0], [50, 0], [50, 46], [0, 46]], [[50, 46], [100, 46], [100, 100], [50, 100]]], 'quartiers'],
    ['sautoir_ec', 'Écartelé en sautoir', [[[0, 0], [100, 0], [50, 50]], [[0, 100], [100, 100], [50, 50]]], 'quartiers diagonale'],
    ['tierce_pal', 'Tiercé en pal (trois bandes debout)', [[[38, 0], [62, 0], [62, 100], [38, 100]]], 'tricolore'],
    ['tierce_fasce', 'Tiercé en fasce (trois bandes couchées)', [[[0, 34], [100, 34], [100, 60], [0, 60]]], ''],
    ['chef', 'Chef (bande en haut)', [[[0, 0], [100, 0], [100, 30], [0, 30]]], 'haut'],
    ['pointe', 'Champagne (bande en bas)', [[[0, 74], [100, 74], [100, 100], [0, 100]]], 'bas'],
    ['fasce', 'Fasce', [[[0, 38], [100, 38], [100, 58], [0, 58]]], 'bande horizontale'],
    ['pal', 'Pal', [[[40, 0], [60, 0], [60, 100], [40, 100]]], 'bande verticale'],
    ['bande', 'Bande', [band(0, 0, 100, 100, 20)], 'diagonale'],
    ['barre', 'Barre', [band(100, 0, 0, 100, 20)], 'diagonale'],
    ['croix', 'Croix', [[[41, 0], [59, 0], [59, 38], [100, 38], [100, 56], [59, 56], [59, 100], [41, 100], [41, 56], [0, 56], [0, 38], [41, 38]]], 'croix'],
    ['sautoir', 'Sautoir (croix de Saint-André)', [band(0, 0, 100, 100, 17), ...[]], 'croix diagonale'],
    ['chevron', 'Chevron', [[[50, 30], [100, 80], [100, 98], [50, 48], [0, 98], [0, 80]]], 'toit'],
    ['canton', 'Franc-quartier (carré en haut à gauche)', [[[0, 0], [44, 0], [44, 40], [0, 40]]], 'coin'],
    ['pairle', 'Pairle (en Y)', [[[0, 0], [14, 0], [50, 36], [86, 0], [100, 0], [100, 12], [58, 50], [58, 100], [42, 100], [42, 50], [0, 12]]], 'Y'],
    ['burele', 'Burelé (bandes couchées)', [10, 26, 42, 58, 74].map(y => [[0, y], [100, y], [100, y + 8], [0, y + 8]]), 'rayé'],
    ['pale', 'Palé (bandes debout)', [16, 36, 56, 76].map(x => [[x, 0], [x + 10, 0], [x + 10, 100], [x, 100]]), 'rayé'],
    ['echiquete', 'Échiqueté (damier)', Array.from({length: 25}, (_, i) => [i % 5, Math.floor(i / 5)]).filter(([c, r]) => (c + r) % 2 === 0).map(([c, r]) => [[c * 20, r * 20], [c * 20 + 20, r * 20], [c * 20 + 20, r * 20 + 20], [c * 20, r * 20 + 20]]), 'damier'],
    ['losange_c', 'Losange (en cœur)', [[[50, 26], [70, 52], [50, 78], [30, 52]]], 'centre'],
    ['bordure', 'Bordure', [], 'bord'],
];
{
    const outer = ECUS.fr[1], inner = inset(outer, 0.88);
    for (const [id, nm, pieces, t] of PARTS) {
        let d = poly(outer) + poly(inner);
        if (id === 'bordure') d = poly(outer) + poly(inset(outer, 0.76));
        else if (id === 'sautoir') { // deux bandes qui se croisent : un seul polygone en X
            const X = [[0, 0], [12, 0], [50, 38], [88, 0], [100, 0], [100, 12], [62, 50], [100, 88], [100, 100], [88, 100], [50, 62], [12, 100], [0, 100], [0, 88], [38, 50], [0, 12]];
            d += poly(clip(X, inner));
        } else for (const p of pieces) { const c = clip(p, inner); if (c.length > 2) d += poly(c); }
        add(`her_fr_${id}`, `Écu ${nm.charAt(0).toLowerCase()}${nm.slice(1)}`, 'heraldry', d, 1, `blason armoiries partition pièce ${t}`, 100);
    }
}
// couronnes et ornements simples
add('her_crown_count', 'Couronne de comte (perles)', 'heraldry', 'M8 70H92V84H8Z M10 66L16 44L30 58L50 40L70 58L84 44L90 66Z' + [12, 26, 40, 50, 60, 74, 88].map(x => circ(x, x === 50 ? 32 : 40, 5)).join(''), 0, 'noblesse comte', 100);
add('her_crown_mural', 'Couronne murale (ville)', 'heraldry', 'M8 50H92V88H8Z M8 50V28H22V38H32V28H46V38H54V28H68V38H78V28H92V50Z M44 88V70A6 6 0 0 1 56 70V88Z', 1, 'ville commune blason', 100);
add('her_helm', 'Heaume', 'heraldry', 'M30 90V50C30 26 40 10 50 10S70 26 70 50V90Z M36 44H64V50H36Z M36 56H64V60H36Z', 1, 'casque chevalier', 100);
add('her_mantle', 'Lambrequins (manteau)', 'heraldry', 'M50 6C34 6 10 18 4 40C12 34 18 36 22 44C16 52 18 66 24 74C20 82 12 86 6 88C26 94 40 86 44 70H56C60 86 74 94 94 88C88 86 80 82 76 74C82 66 84 52 78 44C82 36 88 34 96 40C90 18 66 6 50 6Z', 0, 'blason ornement', 100);
add('her_scroll', 'Listel (devise)', 'heraldry', 'M10 40H90L96 52L90 64H10L4 52Z M0 46H8L4 52L8 58H0Z M92 46H100V58H92L96 52Z', 0, 'devise ruban banderole', 100);

// ═══ 5. Cadres et bordures (boîte 100, evenodd) ═══
const FR = [
    ['frame_double', 'Cadre double', rect(0, 0, 100, 100) + rect(5, 5, 90, 90) + rect(9, 9, 82, 82) + rect(13, 13, 74, 74)],
    ['frame_thick', 'Cadre épais', rect(0, 0, 100, 100) + rect(18, 18, 64, 64)],
    ['frame_rdouble', 'Cadre arrondi double', rrect(0, 0, 100, 100, 16) + rrect(5, 5, 90, 90, 12) + rrect(9, 9, 82, 82, 9) + rrect(13, 13, 74, 74, 6)],
    ['frame_oval_double', 'Médaillon double', ell(50, 50, 40, 50) + ell(50, 50, 35, 45) + ell(50, 50, 32, 42) + ell(50, 50, 28, 38)],
    ['frame_circle', 'Cadre rond', circ(50, 50, 50) + circ(50, 50, 42)],
    ['frame_circle_double', 'Cadre rond double', circ(50, 50, 50) + circ(50, 50, 45) + circ(50, 50, 41) + circ(50, 50, 36)],
    ['frame_oct', 'Cadre octogonal', poly(ngon(8, 52, 50, 50, -112.5)) + poly(ngon(8, 44, 50, 50, -112.5))],
    ['frame_hex', 'Cadre hexagonal', poly(ngon(6, 50, 50, 50, 0)) + poly(ngon(6, 42, 50, 50, 0))],
    ['frame_diamond', 'Cadre en losange', poly([[50, 0], [100, 50], [50, 100], [0, 50]]) + poly([[50, 11], [89, 50], [50, 89], [11, 50]])],
    ['frame_arch', 'Cadre en arche', 'M0 100V40A50 40 0 0 1 100 40V100Z M8 92H92V40A42 32 0 0 0 8 40Z'],
    ['frame_gothic', 'Cadre en ogive', 'M0 100V42C0 20 30 4 50 0C70 4 100 20 100 42V100Z M8 92H92V44C92 26 68 12 50 8C32 12 8 26 8 44Z'],
    ['frame_concave', 'Cartouche à coins rentrants', 'M14 0H86A14 14 0 0 0 100 14V86A14 14 0 0 0 86 100H14A14 14 0 0 0 0 86V14A14 14 0 0 0 14 0Z M18 8A14 14 0 0 1 8 18V82A14 14 0 0 1 18 92H82A14 14 0 0 1 92 82V18A14 14 0 0 1 82 8Z'],
    ['frame_cut', 'Cadre à coins coupés', poly([[14, 0], [86, 0], [100, 14], [100, 86], [86, 100], [14, 100], [0, 86], [0, 14]]) + poly([[17, 8], [83, 8], [92, 17], [92, 83], [83, 92], [17, 92], [8, 83], [8, 17]])],
    ['frame_ticket', 'Cadre ticket', 'M0 0H100V38A12 12 0 0 0 100 62V100H0V62A12 12 0 0 0 0 38Z', 0],
    ['frame_heart', 'Cadre en cœur', 'M50 92C20 70 2 54 2 32C2 15 15 4 29 4C39 4 46 10 50 18C54 10 61 4 71 4C85 4 98 15 98 32C98 54 80 70 50 92Z M50 80C26 62 12 50 12 33C12 21 21 13 30 13C39 13 45 19 50 28C55 19 61 13 70 13C79 13 88 21 88 33C88 50 74 62 50 80Z'],
    ['frame_shield', 'Cadre en écu', poly(ECUS.fr[1]) + poly(inset(ECUS.fr[1], 0.88))],
];
// cadre festonné, cadre timbre, cadre perlé, cadre en étoile
{
    // festons : demi-cercles le long d'un rectangle
    const fest = (x0, y0, x1, y1, r) => { let d = `M${x0} ${y0}`; const nx = Math.round((x1 - x0) / (2 * r)), ny = Math.round((y1 - y0) / (2 * r)), sx = (x1 - x0) / nx, sy = (y1 - y0) / ny;
        for (let i = 0; i < nx; i++) d += `A${f2(sx / 2)} ${f2(sx / 2)} 0 0 1 ${f2(x0 + (i + 1) * sx)} ${y0}`; for (let i = 0; i < ny; i++) d += `A${f2(sy / 2)} ${f2(sy / 2)} 0 0 1 ${x1} ${f2(y0 + (i + 1) * sy)}`;
        for (let i = 0; i < nx; i++) d += `A${f2(sx / 2)} ${f2(sx / 2)} 0 0 1 ${f2(x1 - (i + 1) * sx)} ${y1}`; for (let i = 0; i < ny; i++) d += `A${f2(sy / 2)} ${f2(sy / 2)} 0 0 1 ${x0} ${f2(y1 - (i + 1) * sy)}`; return d + 'Z'; };
    FR.push(['frame_scallop', 'Cadre festonné', fest(6, 6, 94, 94, 5) + rect(14, 14, 72, 72)]);
    // timbre : bord à trous ronds
    let st = rect(4, 4, 92, 92) + rect(14, 14, 72, 72); for (let i = 0; i <= 10; i++) { const p = 4 + i * 9.2; st += circ(p, 4, 2.6) + circ(p, 96, 2.6) + (i > 0 && i < 10 ? circ(4, p, 2.6) + circ(96, p, 2.6) : ''); }
    FR.push(['frame_stamp', 'Cadre timbre-poste', st]);
    let pearl = rect(16, 16, 68, 68); for (let i = 0; i < 12; i++) { const p = 6 + i * 8; pearl += circ(p + 2, 6, 3.4) + circ(p + 2, 94, 3.4); if (i > 0 && i < 11) pearl += circ(6, p + 2, 3.4) + circ(94, p + 2, 3.4); }
    FR.push(['frame_pearls', 'Cadre perlé', pearl]);
    FR.push(['frame_star', 'Cadre en étoile', poly(starPts(5, 52, 26, 50, 54)) + poly(starPts(5, 40, 20, 50, 54))]);
    FR.push(['frame_seal', 'Cadre sceau dentelé', poly(starPts(30, 50, 45)) + circ(50, 50, 38)]);
    FR.push(['frame_rosette', 'Cadre rosace', Array.from({length: 12}, (_, i) => { const a = i * Math.PI / 6; return circ(50 + Math.cos(a) * 38, 50 + Math.sin(a) * 38, 12); }).join('') + circ(50, 50, 30)]);
    // coins seuls
    const corner = (x, y, sx, sy) => poly([[x, y], [x + sx * 30, y], [x + sx * 30, y + sy * 6], [x + sx * 6, y + sy * 6], [x + sx * 6, y + sy * 30], [x, y + sy * 30]]);
    FR.push(['frame_corners', 'Quatre coins', corner(0, 0, 1, 1) + corner(100, 0, -1, 1) + corner(0, 100, 1, -1) + corner(100, 100, -1, -1)]);
    FR.push(['frame_photo_corners', 'Coins de photo', poly([[0, 0], [28, 0], [0, 28]]) + poly([[100, 0], [100, 28], [72, 0]]) + poly([[0, 100], [0, 72], [28, 100]]) + poly([[100, 100], [72, 100], [100, 72]])]);
    const curl = (x, y, sx, sy) => `M${x} ${y + sy * 34}C${x} ${y + sy * 12} ${x + sx * 12} ${y} ${x + sx * 34} ${y}L${x + sx * 34} ${y + sy * 5}C${x + sx * 16} ${y + sy * 5} ${x + sx * 5} ${y + sy * 16} ${x + sx * 5} ${y + sy * 34}Z` + circ(x + sx * 15, y + sy * 15, 5);
    FR.push(['frame_curl_corners', 'Coins arrondis ornés', curl(0, 0, 1, 1) + curl(100, 0, -1, 1) + curl(0, 100, 1, -1) + curl(100, 100, -1, -1)]);
    FR.push(['border_line', 'Filet', rect(0, 46, 100, 8)]);
    FR.push(['border_double', 'Double filet', rect(0, 40, 100, 6) + rect(0, 54, 100, 6)]);
    FR.push(['border_dots', 'Ligne de points', Array.from({length: 9}, (_, i) => circ(6 + i * 11, 50, 4)).join('')]);
    FR.push(['border_wave', 'Frise en vagues', 'M0 50C8 38 17 38 25 50S42 62 50 50S67 38 75 50S92 62 100 50V60C92 72 83 72 75 60S58 48 50 60S33 72 25 60S8 48 0 60Z']);
    FR.push(['border_zigzag', 'Frise en zigzag', 'M0 56L12.5 40L25 56L37.5 40L50 56L62.5 40L75 56L87.5 40L100 56V66L87.5 50L75 66L62.5 50L50 66L37.5 50L25 66L12.5 50L0 66Z']);
    FR.push(['border_greek', 'Frise grecque', Array.from({length: 4}, (_, i) => { const x = i * 25; return `M${x} 70H${x + 25}V62H${x + 8}V46H${x + 16}V54H${x + 12}V58H${x + 20}V38H${x + 4}V62H${x}Z`; }).join('')]);
    FR.push(['border_divider', 'Séparateur orné', 'M0 49H38V51H0Z M62 49H100V51H62Z' + poly([[50, 38], [62, 50], [50, 62], [38, 50]]) + circ(34, 50, 3) + circ(66, 50, 3)]);
}
for (const [k, n, d, eo] of FR) add(`frm_${k.replace(/^frame_|^border_/, (m) => m === 'border_' ? 'b_' : '')}`, n, 'frames', d, eo === 0 ? 0 : 1, 'cadre bordure encadrement ornement', 100);

// ═══ 6. Étiquettes (boîte 100) ═══
const LB = [
    ['tag_hole', 'Étiquette à trou', 'M30 20H96V80H30L4 50Z' + circ(24, 50, 6), 1],
    ['tag_round', 'Étiquette arrondie', rrect(4, 22, 92, 56, 28), 0],
    ['tag_rect', 'Étiquette rectangle', rrect(4, 26, 92, 48, 6), 0],
    ['tag_notch', 'Étiquette à encoches', 'M4 24H96L88 50L96 76H4L12 50Z', 0],
    ['tag_arrow', 'Étiquette flèche', 'M4 24H78L96 50L78 76H4Z', 0],
    ['tag_arrow_l', 'Étiquette flèche gauche', 'M96 24H22L4 50L22 76H96Z', 0],
    ['tag_ribbon', 'Ruban à bouts pliés', 'M18 30H82V70H18Z M2 40H18V78H2L10 59Z M98 40H82V78H98L90 59Z M18 70L18 78L26 70Z M82 70L82 78L74 70Z', 0],
    ['tag_ribbon_curve', 'Ruban courbé', 'M14 36C38 26 62 26 86 36V66C62 56 38 56 14 66Z M0 44L14 40V70L0 74L6 59Z M100 44L86 40V70L100 74L94 59Z', 0],
    ['tag_bookmark', 'Signet', 'M28 0H72V100L50 80L28 100Z', 0],
    ['tag_pennant', 'Fanion triangulaire', 'M6 20L94 50L6 80Z', 0],
    ['tag_oval', 'Étiquette ovale', ell(50, 50, 46, 28), 0],
    ['tag_oval_frame', 'Étiquette ovale à bord', ell(50, 50, 46, 28) + ell(50, 50, 40, 22), 1],
    ['tag_rect_frame', 'Étiquette à bord', rrect(4, 26, 92, 48, 6) + rrect(9, 31, 82, 38, 3), 1],
    ['tag_price', 'Étiquette de prix', 'M58 4H92A4 4 0 0 1 96 8V42L48 90A6 6 0 0 1 40 90L10 60A6 6 0 0 1 10 52Z' + circ(80, 20, 6), 1],
    ['tag_scallop', 'Pastille festonnée', poly(starPts(16, 48, 42)), 0],
    ['tag_burst', 'Pastille « nouveau »', poly(starPts(20, 50, 40)), 0],
    ['tag_rosette', 'Rosette à rubans', poly(starPts(18, 34, 28, 50, 38)) + 'M34 64L24 98L36 90L44 98L48 70Z M66 64L76 98L64 90L56 98L52 70Z', 0],
    ['tag_label_hang', 'Étiquette suspendue', 'M50 2L56 14H44Z M18 20H82A6 6 0 0 1 88 26V92A6 6 0 0 1 82 98H18A6 6 0 0 1 12 92V26A6 6 0 0 1 18 20Z' + circ(50, 32, 5), 1],
    ['tag_folder_tab', 'Onglet', 'M4 40L16 20H50L62 40H96V80H4Z', 0],
    ['tag_cartouche', 'Cartouche', 'M14 22H86C86 30 92 36 100 36V64C92 64 86 70 86 78H14C14 70 8 64 0 64V36C8 36 14 30 14 22Z', 0],
    ['tag_cartouche_frame', 'Cartouche à bord', 'M14 22H86C86 30 92 36 100 36V64C92 64 86 70 86 78H14C14 70 8 64 0 64V36C8 36 14 30 14 22Z M20 30C18 37 13 42 8 43V57C13 58 18 63 20 70H80C82 63 87 58 92 57V43C87 42 82 37 80 30Z', 1],
    ['tag_sticker', 'Gommette', circ(50, 50, 46), 0],
    ['tag_banner_v', 'Flamme verticale', 'M24 0H76V100L50 78L24 100Z', 0],
    ['tag_label_two', 'Étiquette double', rrect(2, 20, 60, 44, 6) + rrect(38, 40, 60, 44, 6), 0],
];
for (const [k, n, d, eo] of LB) add(`lbl_${k.replace(/^tag_/, '')}`, n, 'labels', d, eo, 'étiquette badge pastille', 100);

// ═══ 7. Drapeaux simplifiés (une couleur : le bord + les motifs) (boîte 100) ═══
const FL = (x0 = 4, y0 = 18, w = 92, h = 64) => ({x0, y0, w, h, x1: x0 + w, y1: y0 + h});
const F0 = FL(), border = rect(F0.x0, F0.y0, F0.w, F0.h) + rect(F0.x0 + 3, F0.y0 + 3, F0.w - 6, F0.h - 6);
const inX = (a, b) => [F0.x0 + 3 + (F0.w - 6) * a, F0.x0 + 3 + (F0.w - 6) * b], inY = (a, b) => [F0.y0 + 3 + (F0.h - 6) * a, F0.y0 + 3 + (F0.h - 6) * b];
const fx = (a, b, c = 0, e = 1) => { const [x1, x2] = inX(a, b), [y1, y2] = inY(c, e); return rect(x1, y1, x2 - x1, y2 - y1); };
const FLAGS = [
    ['plain', 'Drapeau uni (à colorier)', border, 'drapeau'],
    ['v3', 'Drapeau à trois bandes debout', border + fx(1 / 3, 1 / 3 + 0.004) + fx(2 / 3, 2 / 3 + 0.004) + fx(0, 1 / 3), 'tricolore France Italie Belgique Irlande Roumanie Mexique'],
    ['v3m', 'Drapeau à bande centrale debout', border + fx(1 / 3, 2 / 3), 'Canada Pérou Nigeria'],
    ['h3', 'Drapeau à trois bandes couchées', border + fx(0, 1, 0, 1 / 3) + fx(0, 1, 2 / 3, 1), 'Allemagne Pays-Bas Russie Autriche Hongrie Bulgarie Luxembourg'],
    ['h3m', 'Drapeau à bande centrale couchée', border + fx(0, 1, 1 / 3, 2 / 3), 'Autriche Lettonie Espagne'],
    ['h2', 'Drapeau à deux bandes couchées', border + fx(0, 1, 0, 0.5), 'Pologne Monaco Indonésie Ukraine'],
    ['v2', 'Drapeau à deux bandes debout', border + fx(0, 0.5), 'Portugal Vatican Malte'],
    ['nordic', 'Drapeau à croix scandinave', border + fx(0.28, 0.4) + fx(0, 1, 0.42, 0.58), 'Danemark Suède Norvège Finlande Islande'],
    ['cross', 'Drapeau à croix centrée', border + fx(0.44, 0.56, 0.18, 0.82) + fx(0.3, 0.7, 0.42, 0.58), 'Suisse croix'],
    ['george', 'Drapeau à croix droite', border + fx(0.44, 0.56) + fx(0, 1, 0.41, 0.59), 'Angleterre Saint-Georges Géorgie'],
    ['saltire', 'Drapeau à croix en X', border + poly(clip([[0, 0], [12, 0], [50, 38], [88, 0], [100, 0], [100, 12], [62, 50], [100, 88], [100, 100], [88, 100], [50, 62], [12, 100], [0, 100], [0, 88], [38, 50], [0, 12]].map(([x, y]) => [F0.x0 + x * F0.w / 100, F0.y0 + y * F0.h / 100]), [[F0.x0 + 3, F0.y0 + 3], [F0.x1 - 3, F0.y0 + 3], [F0.x1 - 3, F0.y1 - 3], [F0.x0 + 3, F0.y1 - 3]])), 'Écosse Saint-André Jamaïque'],
    ['disc', 'Drapeau à disque', border + circ(50, 50, 17), 'Japon Bangladesh soleil'],
    ['crescent', 'Drapeau au croissant et à l’étoile', border + 'M44 32A18 18 0 1 0 44 68A14 14 0 1 1 44 32Z' + poly(starPts(5, 8, 3.2, 60, 50)), 'Turquie Tunisie Algérie'],
    ['star', 'Drapeau à l’étoile', border + poly(starPts(5, 18, 7.2, 50, 51)), 'Vietnam Maroc Somalie'],
    ['stars_stripes', 'Drapeau étoilé à rayures', border + fx(0, 0.42, 0, 4 / 7) + [0, 2].map(i => fx(0.42, 1, i / 7, (i + 1) / 7)).join('') + [4, 6].map(i => fx(0, 1, i / 7, (i + 1) / 7)).join(''), 'États-Unis USA Amérique Libéria'],
    ['tri_hoist', 'Drapeau au triangle', border + poly([[F0.x0 + 3, F0.y0 + 3], [F0.x0 + 3 + 40, 50], [F0.x0 + 3, F0.y1 - 3]]), 'Tchéquie Philippines Cuba Bahamas'],
    ['diag', 'Drapeau en diagonale', border + poly([[F0.x0 + 3, F0.y1 - 3], [F0.x1 - 3, F0.y0 + 3], [F0.x1 - 3, F0.y1 - 3]]), 'Congo Tanzanie'],
    ['canton', 'Drapeau à canton', border + fx(0, 0.42, 0, 0.5), 'canton Taïwan Chili Australie'],
    ['union', 'Drapeau à croix doubles', border + fx(0.43, 0.57) + fx(0, 1, 0.4, 0.6) + poly(clip([[0, 0], [8, 0], [50, 44], [92, 0], [100, 0], [100, 8], [56, 50], [100, 92], [100, 100], [92, 100], [50, 56], [8, 100], [0, 100], [0, 92], [44, 50], [0, 8]].map(([x, y]) => [F0.x0 + x * F0.w / 100, F0.y0 + y * F0.h / 100]), [[F0.x0 + 3, F0.y0 + 3], [F0.x0 + 3 + (F0.w - 6) * 0.43, F0.y0 + 3], [F0.x0 + 3 + (F0.w - 6) * 0.43, F0.y0 + 3 + (F0.h - 6) * 0.4], [F0.x0 + 3, F0.y0 + 3 + (F0.h - 6) * 0.4]])), 'Royaume-Uni Union Jack Angleterre'],
    ['gwenn', 'Drapeau à bandes et canton', border + [1, 3, 5, 7].map(i => fx(0.42, 1, i / 9, (i + 1) / 9)).join('') + fx(0, 0.42, 0, 5 / 9), 'Bretagne Grèce Malaisie'],
    ['pennant', 'Fanion (triangle)', 'M6 14V86H10V50L94 32L10 14Z', 'fanion'],
    ['swallow', 'Drapeau à queue d’aronde', 'M4 18H96L80 50L96 82H4Z M7 21V79H90L76 50L90 21Z', 'guidon'],
    ['wave', 'Drapeau flottant', 'M10 10H14V96H10Z M14 14C34 4 52 22 92 12V56C52 66 34 48 14 58Z', 'mât vent'],
    ['pole', 'Drapeau sur mât', 'M8 4H14V98H8Z' + circ(11, 4, 4) + 'M14 10H94V56H14Z', 'mât'],
    ['pole_tri', 'Drapeau tricolore sur mât', 'M8 4H14V98H8Z' + circ(11, 4, 4) + rect(14, 10, 80, 46) + rect(17, 13, 74, 40) + rect(17, 13, 24.7, 40) + rect(41.3, 13, 0.6, 40) + rect(65.4, 13, 0.6, 40), 'mât tricolore France'],
    ['checker', 'Drapeau à damier', border + Array.from({length: 24}, (_, i) => [i % 6, Math.floor(i / 6)]).filter(([c, r]) => (c + r) % 2 === 0).map(([c, r]) => fx(c / 6, (c + 1) / 6, r / 4, (r + 1) / 4)).join(''), 'course arrivée'],
];
for (const [k, n, d, t] of FLAGS) if (d) add(`flg_${k}`, n, 'flags', d, 1, 'drapeau pays ' + t, 100);

// ═══ 8. Généalogie : liens et cases d'arbre (boîte 100) ═══
const bar = (x1, y1, x2, y2, w = 4) => x1 === x2 ? rect(x1 - w / 2, Math.min(y1, y2), w, Math.abs(y2 - y1)) : rect(Math.min(x1, x2), y1 - w / 2, Math.abs(x2 - x1), w);
for (const n of [1, 2, 3, 4, 5, 6]) {
    const xs = n === 1 ? [50] : Array.from({length: n}, (_, i) => 8 + i * 84 / (n - 1));
    let d = bar(50, 0, 50, 42) + (n > 1 ? bar(xs[0] - 2, 42, xs[n - 1] + 2, 42) : '') + xs.map(x => bar(x, 40, x, 100)).join('');
    add(`gen_children_${n}`, n === 1 ? 'Lien parent → un enfant' : `Lien parent → ${n} enfants`, 'genea', d, 0, 'lien arbre descendance enfants fratrie trait', 100);
}
add('gen_couple', 'Lien de couple', 'genea', bar(0, 30, 100, 30, 5) + bar(0, 0, 0, 32, 5).replace(/^M-2.5/, 'M0') + bar(100, 0, 100, 32, 5) + bar(50, 30, 50, 100, 5), 0, 'mariage lien arbre union', 100);
add('gen_couple_children', 'Couple et enfants', 'genea', bar(14, 0, 14, 28) + bar(86, 0, 86, 28) + bar(12, 26, 88, 26) + bar(50, 24, 50, 60) + bar(14, 60, 86, 60) + bar(16, 58, 16, 100) + bar(50, 58, 50, 100) + bar(84, 58, 84, 100), 0, 'lien arbre famille', 100);
add('gen_brace_r', 'Accolade (vers la droite)', 'genea', 'M10 0C30 0 34 6 34 20V40C34 46 38 50 46 50C38 50 34 54 34 60V80C34 94 30 100 10 100V94C24 94 28 90 28 80V60C28 54 30 51 34 50C30 49 28 46 28 40V20C28 10 24 6 10 6Z', 0, 'regrouper fratrie lien', 100);
add('gen_brace_d', 'Accolade (vers le bas)', 'genea', 'M0 10C0 30 6 34 20 34H40C46 34 50 38 50 46C50 38 54 34 60 34H80C94 34 100 30 100 10H94C94 24 90 28 80 28H60C54 28 51 30 50 34C49 30 46 28 40 28H20C10 28 6 24 6 10Z', 0, 'regrouper fratrie lien', 100);
add('gen_pedigree', 'Branches d’ascendance', 'genea', bar(0, 50, 40, 50) + bar(40, 24, 40, 76) + bar(40, 24, 70, 24) + bar(40, 76, 70, 76) + bar(70, 10, 70, 38) + bar(70, 62, 70, 90) + bar(70, 10, 100, 10) + bar(70, 38, 100, 38) + bar(70, 62, 100, 62) + bar(70, 90, 100, 90), 0, 'ascendance arbre parents grands-parents', 100);
add('gen_card', 'Case de personne', 'genea', rrect(2, 20, 96, 60, 10) + rrect(6, 24, 88, 52, 7) + circ(24, 50, 12) + rect(42, 40, 44, 6) + rect(42, 54, 30, 5), 1, 'case fiche arbre portrait', 100);
add('gen_card_round', 'Médaillon de personne', 'genea', circ(50, 50, 48) + circ(50, 50, 42) + circ(50, 38, 13) + 'M26 78C28 62 38 56 50 56S72 62 74 78Z', 1, 'portrait arbre ancêtre', 100);
add('gen_fan_half', 'Éventail généalogique', 'genea', 'M2 90A48 48 0 0 1 98 90Z M14 90A36 36 0 0 1 86 90H80A30 30 0 0 0 20 90Z M28 90A22 22 0 0 1 72 90H66A16 16 0 0 0 34 90Z M48 42H52V90H48Z', 1, 'roue arbre ascendance', 100);
add('gen_divorce', 'Signe du divorce (//)', 'genea', 'M30 90L54 10H66L42 90Z M54 90L78 10H90L66 90Z', 0, 'divorce séparation', 100);
add('gen_marriage_rings', 'Deux alliances entrelacées', 'genea', circ(36, 50, 28) + circ(36, 50, 22) + circ(64, 50, 28) + circ(64, 50, 22), 1, 'mariage alliances union', 100);
add('gen_tree_roots', 'Arbre et racines', 'genea', circ(50, 32, 28) + 'M45 54H55V72L74 92H66L52 78V96H48V78L34 92H26L45 72Z', 0, 'arbre racines origines', 100);

// ═══ sortie ═══
const CATS = [['letters', 'Lettres et chiffres', '🔤'], ['heraldry', 'Armoiries et héraldique', '🛡️'], ['frames', 'Cadres et bordures', '🖼️'], ['labels', 'Étiquettes', '🏷️'], ['emotions', 'Émotions', '😊'], ['flags', 'Drapeaux', '🚩'], ['tech', 'Écrans et appareils', '💻'], ['money', 'Argent et commerce', '💶']];
const out = {v: 1, about: 'Formes des tableaux LCNDA, chargées à l’ouverture de la bibliothèque. Licences : shapes-lib-LICENCES.txt', cats: CATS, shapes: rows};
fs.writeFileSync(OUT, JSON.stringify(out));
const byCat = {}; rows.forEach(r => { byCat[r[2]] = (byCat[r[2]] || 0) + 1; });
console.log('formes', rows.length, 'dont Phosphor', nPh, 'taille', fs.statSync(OUT).size); console.log(byCat);
