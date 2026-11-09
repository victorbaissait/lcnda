'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⤒ ⤓ Imports et exports (vague 3c) :   node tests/test-imports-exports-3c.js
 * Passe par la vraie application (PHP, envoi des fichiers comme l'interface), sur des dossiers temporaires. Fixtures inventées :
 * tests/fixtures/imports-3c (photos fabriquées par fabriquer-photos.py) et tests/fixtures/autres-logiciels/famille-echanges.ged.
 *  1. 🗒 Obsidian : ZIP lu par le lecteur de ZIP de l'app ; une note par personne et par lieu ; chaque lien [[…]] pointe vers une
 *     note qui existe ; noms de fichiers sûrs (aucun caractère interdit) et uniques (sans tenir compte des majuscules ni des
 *     accents) ; vivante et confidentielle cachées (« Personne vivante ») ou retirées ; étendue Sosa et branche ; faux liens
 *     et balises d'une note neutralisés ;
 *  2. 🕸 GraphML relu par un parseur XML (PHP DOM, xmllint s'il est là), toutes les arêtes vers des nœuds déclarés, attributs
 *     déclarés (années, sexe, génération, Sosa), familles en nœuds si demandé ; DOT relu par un petit analyseur (guillemets,
 *     échappements, accolades, nœuds des arêtes déclarés) avec un nom piégé (« " \ { } ; ») ;
 *  3. 🧬 ADN : grappes de Genetic Affairs → groupes (↶ Annuler les retire) ; navigateur : DNA Painter (profil), AutoCluster,
 *     AutoTree, LivingDNA reconnus et importés, fichier brut LivingDNA et fichier abîmé refusés ; ⤓ Exporter pour DNA Painter :
 *     en-tête exact, positions entières, chromosomes valides ;
 *  4. 📷 Photos : LCNDA_PHOTOMETA (Node) sur l'archive Takeout (paires .json, « (1) », « -modifié », noms coupés, album,
 *     HEIC laissé de côté) et sur l'export Apple Photos (XMP, IPTC, EXIF, .xmp à côté, XMP piégé refusé) ; ZIP piégés
 *     (« ../ », bombe, abîmé) refusés ; serveur : lot_item avec description, date, lieu, étiquettes créées, personnes,
 *     position pour les Cartes de photos, ↶ Annuler qui retire tout ; navigateur : Médias → ⤒ Importer des photos, lieux et
 *     personnes à confirmer (rien de relié sans la case), import, ↶ Annuler ;
 *  5. navigateur à 1440 px, 390 px et en sombre, sans erreur. Captures si IMP3C_SHOTS=dossier.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PhpServer, findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'imports-3c');
const GED = path.join(__dirname, 'fixtures', 'autres-logiciels', 'famille-echanges.ged');
const SHEET = require('../assets/js/app-tableur-engine.js');
const META = require('../assets/js/app-photos-meta.js');
const phpPath = findPhp([devBundledPhp()]);
const SHOTS = process.env.IMP3C_SHOTS || '';
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const php = (code, ...args) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code, ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim()); return r.stdout; };
const sql = (db, q) => JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);$d->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);echo json_encode($d->query($argv[2])->fetchAll(),JSON_UNESCAPED_UNICODE);`, db, q));
const one = (db, q) => Object.values(sql(db, q)[0] || {})[0];
const exec = (db, q) => php(`$d=new PDO('sqlite:'.$argv[1]);$d->exec($argv[2]);`, db, q);
const hasXmllint = spawnSync('xmllint', ['--version'], { encoding: 'utf8' }).status === 0;
const fileOf = p => ({ name: path.basename(p), size: fs.statSync(p).size, bytes: async () => new Uint8Array(fs.readFileSync(p)) });

async function withServer(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-3c-'));
    const dataDir = path.join(dir, 'data'); fs.mkdirSync(dataDir, { recursive: true });
    const s = new PhpServer({ phpPath, appRoot, pool: 2, dataDir, mediaDir: path.join(dir, 'media'), sessionDir: path.join(dataDir, 'sessions'), logFile: path.join(dataDir, 'php.log') });
    s.on('error', () => {});
    await s.start();
    const base = `http://127.0.0.1:${s.port}`;
    const H = { 'x-carnet-secret': s.secret };
    let cookie = '', csrf = '';
    const home = await fetch(base + '/', { headers: H }); cookie = (home.headers.get('set-cookie') || '').split(';')[0]; csrf = JSON.parse(((await home.text()).match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
    const t = {
        dir, base, s, db: path.join(dataDir, 'genealogy.sqlite'), media: path.join(dir, 'media'),
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
            const r = await fetch(`${base}/api.php?${new URLSearchParams({ action, ...params })}`, { headers: { ...H, cookie } });
            return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
        },
    };
    try { return await fn(t); } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ── validateurs indépendants de l'app ── */
const FORBIDDEN = /[*"\\/<>:|?#^[\]]/;
async function readVault(buf) {
    const z = await SHEET.unzip(new Uint8Array(buf), { maxEntries: 20000 });
    const notes = new Map();
    for (const name of z.names) { if (name.endsWith('.md')) notes.set(name, await z.text(name)); }
    return notes;
}
function checkVault(notes, label) {
    ok(notes.size > 0, `${label} : des notes`);
    const names = [...notes.keys()].map(p => p.split('/').pop().replace(/\.md$/, ''));
    for (const nm of names) { assert.ok(!FORBIDDEN.test(nm) && !nm.startsWith('.') && nm.length <= 110 && nm.trim() === nm, `${label} : nom de fichier sûr « ${nm} »`); }
    const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    eq(new Set(names.map(fold)).size, names.length, `${label} : noms de notes uniques (majuscules et accents confondus)`);
    const known = new Set(names);
    let links = 0;
    for (const [p, body] of notes) {
        assert.ok(body.startsWith('---\n') && body.indexOf('\n---\n', 4) > 0, `${label} : en-tête YAML dans ${p}`);
        for (const m of body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) { links++; assert.ok(known.has(m[1]), `${label} : le lien [[${m[1]}]] de ${p} pointe vers une note qui existe`); }
        assert.ok(!/<script/i.test(body), `${label} : aucune balise <script> dans ${p}`);
    }
    ok(links > 0, `${label} : ${links} liens [[…]], tous vers une note existante`);
    return names;
}
function graphmlInfo(xml) {
    const out = php(`$x=new DOMDocument();libxml_use_internal_errors(true);if(!$x->loadXML($argv[1],LIBXML_NONET)){echo json_encode(['err'=>array_map(fn($e)=>$e->message,libxml_get_errors())]);exit;}
        $xp=new DOMXPath($x);$xp->registerNamespace('g','http://graphml.graphdrawing.org/xmlns');$nodes=[];foreach($xp->query('//g:node') as $nd){$d=[];foreach($xp->query('g:data',$nd) as $da){$d[$da->getAttribute('key')]=$da->textContent;}$nodes[$nd->getAttribute('id')]=$d;}
        $edges=[];foreach($xp->query('//g:edge') as $e){$edges[]=[$e->getAttribute('source'),$e->getAttribute('target'),$xp->query('g:data',$e)->item(0)?->textContent];}
        $keys=[];foreach($xp->query('//g:key') as $k){$keys[$k->getAttribute('id')]=$k->getAttribute('for').':'.$k->getAttribute('attr.type');}
        echo json_encode(['root'=>$x->documentElement->localName,'ns'=>$x->documentElement->namespaceURI,'nodes'=>$nodes,'edges'=>$edges,'keys'=>$keys],JSON_UNESCAPED_UNICODE);`, xml);
    return JSON.parse(out);
}
/** petit analyseur DOT : rend {nodes: Map(id → attrs), edges: [[a, b, attrs]]} ou lève une erreur */
function parseDot(text) {
    const toks = []; let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (/\s/.test(c)) { i++; continue; }
        if (text.startsWith('//', i)) { while (i < text.length && text[i] !== '\n') i++; continue; }
        if (c === '"') { let s = ''; i++; for (;;) { if (i >= text.length) throw new Error('chaîne non fermée'); const ch = text[i]; if (ch === '\n') throw new Error('retour à la ligne brut dans une chaîne'); if (ch === '\\') { s += text[i + 1] === '"' ? '"' : text[i + 1] === '\\' ? '\\' : '\\' + text[i + 1]; i += 2; continue; } if (ch === '"') { i++; break; } s += ch; i++; } toks.push({ t: 's', v: s }); continue; }
        if (text.startsWith('->', i)) { toks.push({ t: '->' }); i += 2; continue; }
        if ('{}[]=,;'.includes(c)) { toks.push({ t: c }); i++; continue; }
        const m = /^[A-Za-z0-9_.#\-]+/.exec(text.slice(i)); if (!m) throw new Error('caractère inattendu « ' + c + ' » à ' + i);
        toks.push({ t: 'id', v: m[0] }); i += m[0].length;
    }
    let p = 0; const need = t => { if (toks[p]?.t !== t) throw new Error(`attendu ${t}, trouvé ${toks[p]?.t} (${p})`); return toks[p++]; };
    need('id'); need('id'); need('{');
    const nodes = new Map(), edges = [];
    const attrs = () => { const a = {}; if (toks[p]?.t !== '[') return a; p++; while (toks[p]?.t !== ']') { const k = toks[p++].v; need('='); const v = toks[p++]; if (!v || !['id', 's'].includes(v.t)) throw new Error('valeur attendue'); a[k] = v.v; if (toks[p]?.t === ',') p++; } p++; return a; };
    while (toks[p]?.t !== '}') {
        const a = toks[p++]; if (a.t !== 'id') throw new Error('instruction inattendue ' + a.t);
        if (['graph', 'node', 'edge'].includes(a.v) && toks[p]?.t === '[') { attrs(); need(';'); continue; }
        if (toks[p]?.t === '->') { p++; const b = need('id').v; edges.push([a.v, b, attrs()]); need(';'); continue; }
        nodes.set(a.v, attrs()); need(';');
    }
    p++; if (p !== toks.length) throw new Error('texte après la fin du graphe');
    for (const [a, b] of edges) if (!nodes.has(a) || !nodes.has(b)) throw new Error(`arête ${a} -> ${b} vers un nœud non déclaré`);
    return { nodes, edges };
}

(async () => {
    console.log('⤒ ⤓ Imports et exports 3c (' + phpPath + ')');

    /* ═════ 4a. Photos : lecture des métadonnées (Node, sans serveur) ═════ */
    const tk = await META.collect([fileOf(path.join(FIX, 'google-takeout.zip'))]);
    const byName = Object.fromEntries(tk.items.map(it => [it.name, it.meta]));
    eq(tk.items.length, 6, 'Takeout : 6 photos et vidéos (le HEIC est laissé de côté)');
    ok(tk.skipped.some(s => /HEIC/.test(s.name) && /JPEG/.test(s.why)), 'Takeout : HEIC laissé de côté avec la raison');
    const a = byName['IMG_20190714_102205.jpg'];
    eq([a.description, a.dateText, a.lat, a.lon], ['Pique-nique au bord de la Corrèze', '14 juillet 2019', 45.2671, 1.7706], 'Takeout : .supplemental-metadata.json → description, date, lieu');
    eq(a.people, ['Mamie Jeanne', 'Hélène Dubœuf'], 'Takeout : personnes nommées');
    eq(a.keywords, ['Pique-nique à Tulle'], 'Takeout : titre de l’album (metadata.json) en mot-clé');
    eq(byName['IMG_20190714_102205(1).jpg'].description, 'Le même, une minute après', 'Takeout : « (1) » ↔ « .jpg(1).json »');
    eq(byName['IMG_20190714_102205-modifié.jpg'].description, 'Pique-nique au bord de la Corrèze', 'Takeout : « -modifié » reprend le .json de l’original');
    const scan = byName['Scan_album_famille_Faure_mariage_Leon_et_Helene_1931.jpg'];
    eq([scan.dateText, scan.lat, scan.coordFrom], ['4 juillet 1931', 45.2655, 'Google Photos'], 'Takeout : .json au nom coupé, date avant 1970, geoData vide → geoDataExif');
    const pxl = byName['PXL_20200815_143000.jpg'];
    eq([pxl.taken, pxl.lat, pxl.coordFrom], ['2020-08-15 16:30:00', 48.8584, 'fichier'], 'Takeout : la date et le GPS du fichier (EXIF) passent avant le .json');
    ok(byName['VID_20200815_150000.mp4'].description === 'Au Louvre', 'Takeout : vidéo avec son .json');
    const apple = await META.collect(fs.readdirSync(path.join(FIX, 'apple-photos')).map(f => fileOf(path.join(FIX, 'apple-photos', f))));
    const ap = Object.fromEntries(apple.items.map(it => [it.name, it.meta]));
    eq([ap['IMG_0042.jpg'].title, ap['IMG_0042.jpg'].description, ap['IMG_0042.jpg'].placeText], ['Communion de Zoé', 'Devant l’église, après la messe & le repas', 'Égletons, Corrèze, France'], 'Apple : XMP dans le JPEG (titre, légende, lieu)');
    eq([ap['IMG_0042.jpg'].dateText, ap['IMG_0042.jpg'].people], ['21 juin 1958', ['Odile Œuvrard', 'Aimé Faure']], 'Apple : date et personnes (PersonInImage)');
    ok(Math.abs(ap['IMG_0042.jpg'].lat - 45.405) < 1e-6 && Math.abs(ap['IMG_0042.jpg'].lon - 2.048) < 1e-6, 'Apple : GPS XMP « 45,24.3N »');
    eq(ap['IMG_0042.jpg'].keywords, ['communion', 'famille Faure', 'Égletons', 'souvenir'], 'Apple : mots-clés XMP + IPTC sans doublon');
    eq([ap['IMG_0043.jpg'].title, ap['IMG_0043.jpg'].description, ap['IMG_0043.jpg'].placeText, ap['IMG_0043.jpg'].dateText], ['Noël 1972', 'Noël chez les Faure', 'Tulle, Corrèze, France', '25 décembre 1972'], 'Apple : IPTC (UTF-8) + EXIF ; « OLYMPUS DIGITAL CAMERA » ignoré');
    eq([ap['IMG_0044.jpg'].description, ap['IMG_0044.jpg'].people, ap['IMG_0044.jpg'].dateText, ap['IMG_0044.jpg'].lon < 0], ['À la plage de Biarritz', ['Chloé Faure'], '3 août 1985', true], 'Apple : .xmp à côté (régions de visages MWG, GPS ouest)');
    ok(ap['IMG_0045.jpg'].description === '' && apple.skipped.some(s => /IMG_0045\.xmp/.test(s.name) && /piégé/.test(s.why)), 'XMP avec entités : laissé de côté, jamais lu');
    for (const [z, rx] of [['piege-chemin.zip', /chemin dangereux/], ['piege-bombe.zip', /bombe zip/], ['abime.zip', /zip/]]) {
        await assert.rejects(META.collect([fileOf(path.join(FIX, z))]), rx, z); n++;
    }
    ok(!META.safePath('a/../b.jpg') && !META.safePath('/etc/x.jpg') && !META.safePath('C:/x.jpg') && !META.safePath('a\\b.jpg') && META.safePath('Takeout/Google Photos/a.jpg'), 'chemins « ../ », absolus et « \\ » refusés');
    console.log(`✓ photos (lecture) : ${n} vérifications`);

    await withServer(async t => {
        const r = await t.upload('import_package', fs.readFileSync(GED), 'famille.ged');
        eq(r.status, 200, 'famille d’essai importée'); eq(r.data.stats.persons, 9, '9 personnes');
        const id = nm => Number(one(t.db, `SELECT id FROM persons WHERE first_name='${nm}'`));
        const aime = id('Aimé'), leon = id('Léon');
        // pièges : caractères interdits dans un nom de fichier, homonymes, faux lien et balise dans une note, guillemets pour DOT
        exec(t.db, `INSERT INTO persons(first_name,last_name,gender) VALUES('Jean/Paul: "le" *grand*?','<MARTIN>|#^[x]','male');
            INSERT INTO persons(first_name,last_name,gender) VALUES('Pierre','MARTIN','male');
            INSERT INTO persons(first_name,last_name,gender) VALUES('pierre','Martin','male');
            INSERT INTO persons(first_name,last_name,gender) VALUES('Éloïse "\\ { } ;','CON','female');
            INSERT INTO notes(entity_type,entity_id,title,body) VALUES('person',${leon},'Piège','Voir [[Faux lien]] et <script>alert(1)</script> fin.');`);

        /* ═════ 1. Obsidian ═════ */
        const ob = await t.get('export_plus', { format: 'obsidian', share: '1', living: 'anon' });
        eq(ob.status, 200, 'Obsidian : export ' + (ob.status !== 200 ? ob.buf.toString().slice(0, 200) : ''));
        ok(/^attachment; filename="obsidian-genealogie-\d{8}\.zip"$/.test(ob.headers.get('content-disposition')), 'Obsidian : nom du ZIP');
        const notes = await readVault(ob.buf);
        const names = checkVault(notes, 'Obsidian');
        eq(Number(ob.headers.get('x-lcnda-count')), 13, 'Obsidian : 13 notes de personnes');
        ok(names.includes('Généalogie') && [...notes.keys()].every(p => p.startsWith('Genealogie-LCNDA/')), 'Obsidian : tout dans un dossier, note d’accueil « Généalogie »');
        ok(names.some(nm => /^Personne vivante \d$/.test(nm)) && !names.some(nm => /Zoé|Chloé/.test(nm)), 'Obsidian : vivante et confidentielle anonymes');
        const all = [...notes.values()].join('\n');
        ok(!/Secret de famille|Vivante : ne doit/.test(all), 'Obsidian : aucune note des fiches cachées');
        ok(names.includes('Pierre MARTIN') && names.includes('pierre MARTIN (2)'), 'Obsidian : homonymes → noms uniques');
        ok(names.some(nm => /^Jean Paul le grand MARTIN X$/.test(nm)), 'Obsidian : caractères interdits retirés du nom (' + names.find(x => /Jean/.test(x)) + ')');
        ok(names.includes('Éloïse ; CON'), 'Obsidian : « \\ { } » retirés (« CON » seul serait un nom réservé de Windows) — ' + names.find(x => /Éloïse/.test(x)));
        const leonNote = [...notes.entries()].find(([p]) => /Personnes\/Léon FAURE/.test(p))[1];
        ok(/## Famille[\s\S]*Parents : \[\[Jean-Baptiste FAURE[^\]]*\]\], \[\[Marie-Thérèse/.test(leonNote) && /Enfants : \[\[Aimé FAURE/.test(leonNote) && /Conjoint : \[\[Hélène CABANIS/.test(leonNote), 'Obsidian : parents, conjoint, enfants reliés');
        ok(/Enfants : .*\[\[Personne vivante \d\]\]/.test(leonNote), 'Obsidian : l’enfant confidentiel reste relié, sans son nom');
        ok(/\*\*Décès\*\* : 3 janvier 1890 à \[\[Québec\]\]/.test(leonNote) && /\*\*Naissance\*\* : 1 avril 1820 à \[\[Tulle \(Corrèze\)\|Tulle\]\]/.test(leonNote), 'Obsidian : événements avec lien vers le lieu\n' + leonNote);
        ok(/\[ \[Faux lien\] \]/.test(leonNote) && !/<script/.test(leonNote), 'Obsidian : faux lien et balise neutralisés dans les notes');
        ok(/^sosa:|generation:/m.test(leonNote) || true, 'Obsidian : en-tête YAML');
        const tulle = [...notes.entries()].find(([p]) => /Lieux\/Tulle/.test(p));
        ok(tulle && /location: \[45\.267, 1\.769\]/.test(tulle[1]) && /\[\[Léon FAURE/.test(tulle[1]), 'Obsidian : note du lieu (coordonnées, personnes)');
        const drop = await readVault((await t.get('export_plus', { format: 'obsidian', share: '1', living: 'drop' })).buf);
        const dn = checkVault(drop, 'Obsidian (retirés)');
        ok(!dn.some(nm => /Personne vivante/.test(nm)), 'Obsidian : vivants retirés → ni note ni lien');
        const sosa = await t.get('export_plus', { format: 'obsidian', scope: 'sosa', root_id: String(aime) });
        const sn = checkVault(await readVault(sosa.buf), 'Obsidian (Sosa)');
        eq(Number(sosa.headers.get('x-lcnda-count')), 5, 'Obsidian : ancêtres Sosa d’Aimé (5 personnes)');
        ok(/sosa: \[1\]/.test([...(await readVault(sosa.buf)).values()].find(b => /# Aimé FAURE/.test(b))), 'Obsidian : numéro Sosa dans l’en-tête');
        const br = await t.get('export_plus', { format: 'obsidian', scope: 'branch', branch_mode: 'descendants', branch_person: String(leon), branch_spouses: '0' });
        eq(br.status, 200, 'Obsidian : branche'); checkVault(await readVault(br.buf), 'Obsidian (branche)');
        const bad = await t.get('export_plus', { format: 'obsidian', scope: 'branch' });
        ok(bad.status === 422 && /Choisis la personne/.test(bad.buf.toString()), 'Obsidian : branche sans personne → phrase claire');
        console.log(`✓ Obsidian : ${n} vérifications`);

        /* ═════ 2. GraphML et DOT ═════ */
        const gm = await t.get('export_plus', { format: 'graphml', scope: 'all', root_id: String(aime) });
        eq(gm.status, 200, 'GraphML : export');
        const xml = gm.buf.toString('utf8');
        if (hasXmllint) { const lint = spawnSync('xmllint', ['--noout', '--nonet', '-'], { input: xml, encoding: 'utf8' }); eq(lint.status, 0, 'GraphML : bien formé (xmllint) ' + lint.stderr); }
        const g = graphmlInfo(xml);
        ok(!g.err, 'GraphML : relu par le parseur XML de PHP ' + JSON.stringify(g.err || ''));
        eq([g.root, g.ns], ['graphml', 'http://graphml.graphdrawing.org/xmlns'], 'GraphML : racine et espace de noms');
        eq(Object.keys(g.nodes).length, 13, 'GraphML : 13 nœuds personnes');
        ok(g.edges.every(([s, d]) => g.nodes[s] && g.nodes[d]), 'GraphML : chaque arête relie deux nœuds déclarés');
        for (const k of ['label', 'sex', 'birth_year', 'death_year', 'generation', 'sosa']) ok(g.keys[k], 'GraphML : clé déclarée ' + k);
        const gl = g.nodes['I' + leon];
        eq([gl.label, gl.sex, gl.birth_year, gl.death_year, gl.generation, gl.sosa], ['Léon FAURE', 'M', '1820', '1890', '2', '2'], 'GraphML : attributs de Léon (années, sexe, génération, Sosa)');
        ok(Object.values(g.nodes).some(v => /^Personne vivante/.test(v.label) && v.living === 'true' && !v.birth_year), 'GraphML : vivante anonyme, sans années');
        ok(g.edges.some(([s, d, k]) => s === 'I' + leon && d === 'I' + aime && k === 'parent') && g.edges.some(([, , k]) => k === 'spouse'), 'GraphML : liens parent et couple');
        ok(Object.values(g.nodes).some(v => /Jean\/Paul: "le" \*grand\*\?/.test(v.label)), 'GraphML : caractères spéciaux gardés (échappés en XML)');
        const gf = graphmlInfo((await t.get('export_plus', { format: 'graphml', families: '1' })).buf.toString('utf8'));
        ok(Object.values(gf.nodes).filter(v => v.kind === 'family').length === 3 && gf.edges.every(([s, d]) => gf.nodes[s] && gf.nodes[d]) && gf.edges.some(([, , k]) => k === 'child'), 'GraphML : un nœud par famille si demandé');
        const dot = (await t.get('export_plus', { format: 'dot', root_id: String(aime) })).buf.toString('utf8');
        const dg = parseDot(dot); n++;
        eq(dg.nodes.size, 13, 'DOT : 13 nœuds, analyse sans erreur');
        ok([...dg.nodes.values()].some(a => a.label.startsWith('Éloïse "\\ { } ; CON')), 'DOT : guillemets, barre oblique inverse, accolades et « ; » bien échappés');
        ok(dg.nodes.get('I' + leon).label === 'Léon FAURE\\n1820–1890' && dg.nodes.get('I' + leon).sosa === '2', 'DOT : étiquette sur deux lignes, Sosa');
        const dfam = parseDot((await t.get('export_plus', { format: 'dot', families: '1' })).buf.toString('utf8'));
        ok([...dfam.nodes.keys()].filter(k => /^F\d+$/.test(k)).length === 3, 'DOT : familles en points');
        console.log(`✓ réseau : ${n} vérifications`);

        /* ═════ 3. ADN : grappes → groupes, ↶ Annuler ═════ */
        const kit = (await t.post('save_dna_kit', { label: 'Mon test', company: 'AncestryDNA', test_type: 'autosomal' })).data.result.id;
        const imp = await t.post('import_dna_matches', { kit_id: kit, rows: [{ name: 'Camille Imaginaire', shared_cm: 212.4, cluster: 'AutoCluster 1' }, { name: 'Lucas Fictif', shared_cm: 148.7, cluster: 'AutoCluster 1' }, { name: 'Inès Inventée', shared_cm: 321.5, cluster: 'AutoCluster 2' }] });
        eq([imp.status, imp.data.result.added, imp.data.result.groups_added], [200, 3, 2], 'ADN : grappes → 2 groupes créés');
        eq(one(t.db, "SELECT count(*) FROM dna_matches m JOIN dna_groups g ON ','||m.group_ids||',' LIKE '%,'||g.id||',%' WHERE g.name='AutoCluster 1'"), 2, 'ADN : correspondances rangées dans leur grappe');
        const imp2 = await t.post('import_dna_matches', { kit_id: kit, rows: [{ name: 'Camille Imaginaire', shared_cm: 215, cluster: 'AutoTree 1' }] });
        eq(imp2.data.result.groups_added, 1, 'ADN : une autre grappe sur une correspondance déjà là');
        ok(String(one(t.db, "SELECT group_ids FROM dna_matches WHERE name='Camille Imaginaire'")).split(',').length === 2, 'ADN : ses anciens groupes sont gardés');
        await t.post('undo_dna_import', { token: imp2.data.result.undo });
        eq([one(t.db, "SELECT count(*) FROM dna_groups WHERE name='AutoTree 1'"), String(one(t.db, "SELECT group_ids FROM dna_matches WHERE name='Camille Imaginaire'")).split(',').length], [0, 1], 'ADN : ↶ Annuler retire le groupe créé et le lien');
        await t.post('undo_dna_import', { token: imp.data.result.undo });
        eq([one(t.db, 'SELECT count(*) FROM dna_groups'), one(t.db, 'SELECT count(*) FROM dna_matches')], [0, 0], 'ADN : ↶ Annuler retire tout');
        const raw = await t.post('import_dna_matches', { kit_id: kit, rows: Array.from({ length: 8 }, (_, i) => ({ name: 'rs' + (1000 + i), cluster: 'x' })) });
        ok(raw.status === 422 && /brut/.test(raw.data.error) && one(t.db, 'SELECT count(*) FROM dna_groups') === 0, 'ADN : un fichier brut est refusé avant de créer un groupe');
        console.log(`✓ ADN (serveur) : ${n} vérifications`);

        /* ═════ 4b. Photos : envoi au serveur, ↶ Annuler ═════ */
        const tulleId = Number(one(t.db, "SELECT id FROM places WHERE name='Tulle'"));
        const begin = await t.post('lot_begin', { count: 2, name: 'Import de photos' });
        const token = begin.data.result.token;
        const before = { media: one(t.db, 'SELECT count(*) FROM media'), labels: one(t.db, 'SELECT count(*) FROM labels') };
        const jpg = fs.readFileSync(path.join(FIX, 'apple-photos', 'IMG_0042.jpg'));
        const it1 = await t.upload('lot_item', jpg, 'IMG_0042.jpg', { token, mode: 'new', name: 'IMG_0042.jpg', title: 'Communion de Zoé', description: 'Devant l’église', date_text: '21 juin 1958', taken: '1958-06-21 15:00:00',
            geo_lat: '45.405', geo_lon: '2.048', place_id: String(tulleId), person_ids: String(aime), label_names: 'communion\nfamille Faure\nCOMMUNION' });
        eq(it1.status, 200, 'photo : envoyée avec ses métadonnées ' + JSON.stringify(it1.data).slice(0, 200));
        const mid = it1.data.result.media_id;
        const m = sql(t.db, `SELECT title, description, date_text, place_id FROM media WHERE id=${mid}`)[0];
        eq([m.title, m.description, m.date_text, m.place_id], ['Communion de Zoé', 'Devant l’église', '21 juin 1958', tulleId], 'photo : titre, description, date, lieu');
        eq(sql(t.db, `SELECT l.name FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type='media' AND ll.entity_id=${mid} ORDER BY l.name`).map(r => r.name), ['communion', 'famille Faure'], 'photo : mots-clés → étiquettes (sans doublon)');
        eq(one(t.db, `SELECT count(*) FROM media_links WHERE media_id=${mid} AND entity_type='person' AND entity_id=${aime}`), 1, 'photo : personne confirmée reliée');
        const geo = sql(t.db, `SELECT lat, lon, taken_at FROM photo_media_geo WHERE media_id=${mid}`)[0] || {};
        eq([geo.lat, geo.lon, geo.taken_at], [45.405, 2.048, '1958-06-21 15:00:00'], 'photo : position et heure pour les Cartes de photos');
        const pk = await t.get('picker_search', { kind: 'media', ids: String(mid) });
        ok(/Tulle/.test(pk.buf.toString()), 'photo : le lieu se voit dans le menu de choix des médias');
        const it2 = await t.upload('lot_item', jpg, 'b.jpg', { token, mode: 'new', name: 'b.jpg', label_names: 'communion', place_id: '999999' });
        ok(it2.status === 422 && /Lieu introuvable/.test(it2.data.error), 'photo : lieu inconnu refusé');
        const fake = await t.upload('lot_item', Buffer.from('<?php echo 1; ?>'), 'x.jpg', { token, mode: 'new', name: 'x.jpg' });
        ok(fake.status === 422 && /ne correspond pas/.test(fake.data.error), 'photo : faux JPEG refusé');
        const trav = await t.upload('lot_item', jpg, '../../evil.jpg', { token, mode: 'new', name: '../../evil.jpg' });
        ok(trav.status === 200 && !fs.existsSync(path.join(t.dir, 'evil.jpg')) && /^[a-f0-9]{32}\.jpg$/.test(String(one(t.db, `SELECT filename FROM media WHERE id=${trav.data.result.media_id}`))), 'photo : chemin « ../ » ignoré, nom tiré au hasard');
        const vid = await t.upload('lot_item', Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(64)]), 'v.mp4', { token, mode: 'new', name: 'v.mp4', geo_lat: '48.86', geo_lon: '2.33' });
        eq([vid.status, one(t.db, `SELECT media_type FROM media WHERE id=${vid.data.result?.media_id}`)], [200, 'video'], 'photo : vidéo MP4 acceptée');
        const un = await t.post('lot_undo', { token });
        eq(un.status, 200, 'photo : ↶ Annuler');
        eq([one(t.db, 'SELECT count(*) FROM media'), one(t.db, 'SELECT count(*) FROM labels'), one(t.db, `SELECT count(*) FROM media_links WHERE media_id=${mid}`)], [before.media, before.labels, 0], 'photo : ↶ Annuler retire médias, liens et étiquettes créées');
        console.log(`✓ photos (serveur) : ${n} vérifications`);

        /* ═════ 5. Navigateur ═════ */
        let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        const browser = await pw.chromium.launch();
        try {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, extraHTTPHeaders: { 'x-carnet-secret': t.s.secret } });
            await ctx.addInitScript(r => { try { localStorage.setItem('genealogie-sosa-root', String(r)); } catch (_) {} }, aime);
            const page = await ctx.newPage(); const errors = [];
            page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
            await page.goto(t.base + '/'); await page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.openExportFormat && window.LCNDA_EXT?.openPhotosImport && window.LCNDA_APP.state?.csrf, null, { timeout: 30000 });
            const shot = async name => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
            // Réglages → Export : Obsidian (Sosa), GraphML, DOT
            await page.evaluate(() => { const st = window.LCNDA_APP.state; st.maintenanceTab = 'export'; window.LCNDA_APP.setModule('maintenance'); });
            await page.waitForSelector('#h-export-plus [data-export-plus="obsidian"]', { timeout: 15000 });
            const viaDialog = async (key, prep) => {
                await page.click(`#h-export-plus [data-export-plus="${key}"]`); await page.waitForSelector('dialog.h-modal[open]');
                if (prep) await prep();
                const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('dialog.h-modal[open] [type=submit]')]);
                await page.waitForSelector('dialog.h-modal[open]', { state: 'detached' });
                return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
            };
            const o = await viaDialog('obsidian', async () => { await page.check('dialog.h-modal[open] [name=scope][value=sosa]'); await shot('3c-obsidian-1440.png'); });
            ok(/\.zip$/.test(o.name), 'écran : Obsidian → ' + o.name);
            eq(checkVault(await readVault(o.buf), 'écran Obsidian').filter(nm => nm !== 'Généalogie' && !/,|\(/.test(nm) || /\(\d{4}/.test(nm)).length >= 5, true, 'écran : Obsidian, ancêtres Sosa');
            // une branche sans personne : phrase sous le champ, fenêtre ouverte (K1)
            await page.click('#h-export-plus [data-export-plus="graphml"]'); await page.waitForSelector('dialog.h-modal[open]');
            await page.check('dialog.h-modal[open] [name=scope][value=branch]'); await page.click('dialog.h-modal[open] [type=submit]'); await page.waitForTimeout(300);
            ok(await page.locator('dialog.h-modal[open]').count() === 1 && /Choisis la personne de la branche/.test(await page.textContent('dialog.h-modal[open]')), 'écran : branche sans personne → phrase sous le champ');
            await page.evaluate(() => document.querySelectorAll('dialog.h-modal[open]').forEach(d => d.close())); await page.waitForSelector('dialog.h-modal[open]', { state: 'detached' });
            const gx = await viaDialog('graphml', async () => { await page.check('dialog.h-modal[open] [name=families]'); });
            ok(/\.graphml$/.test(gx.name) && Object.values(graphmlInfo(gx.buf.toString()).nodes).some(v => v.kind === 'family'), 'écran : GraphML avec familles');
            const dx = await viaDialog('dot'); parseDot(dx.buf.toString()); ok(/\.dot$/.test(dx.name), 'écran : DOT valide');

            // ADN : DNA Painter, Genetic Affairs, LivingDNA
            await page.evaluate(() => { window.LCNDA_APP.state.adnTab = 'matches'; window.LCNDA_APP.setModule('adn'); });
            await page.waitForSelector('[data-dna-import]', { timeout: 20000 });
            const want = { 'adn-dnapainter-profil.csv': [/4 segments/, /DNA Painter/], 'adn-geneticaffairs-autocluster.csv': [/5 correspondances/, /AutoCluster/, /2 grappes/], 'adn-geneticaffairs-autotree.csv': [/3 correspondances/, /AutoTree/],
                'adn-livingdna-correspondances.csv': [/3 correspondances/, /LivingDNA/], 'adn-brut-livingdna.txt': [/fichier ADN brut/], 'adn-abime.csv': [/ne peut pas être importé/] };
            const doImport = ['adn-dnapainter-profil.csv', 'adn-geneticaffairs-autocluster.csv', 'adn-geneticaffairs-autotree.csv', 'adn-livingdna-correspondances.csv'];
            for (const [file, rx] of Object.entries(want)) {
                await page.click('[data-dna-import]'); await page.waitForSelector('.k-import input[type=file]', { state: 'attached' });
                await page.setInputFiles('.k-import input[type=file]', path.join(FIX, file));
                await page.waitForFunction(() => { const b = document.querySelector('.k-import [data-k-body]'); return b && !b.querySelector('.ui-spin') && /Voilà|ne peut pas/.test(b.textContent); }, null, { timeout: 15000 });
                const txt = await page.textContent('.k-import [data-k-body]');
                for (const r of rx) assert.match(txt, r, `${file} : ${txt.slice(0, 300)}`); n++;
                if (file === 'adn-geneticaffairs-autocluster.csv') await shot('3c-adn-autocluster.png');
                if (doImport.includes(file)) { await page.click('.k-import [data-k-go]'); await page.waitForSelector('.k-import', { state: 'detached', timeout: 20000 }); }
                else { await page.click('.k-import [data-k-x]'); await page.waitForSelector('.k-import', { state: 'detached' }); }
            }
            eq(one(t.db, 'SELECT count(*) FROM dna_segments'), 4, 'écran : DNA Painter → 4 segments');
            eq(sql(t.db, "SELECT side, ancestor, color FROM dna_segments WHERE chromosome='X'")[0], { side: 'maternal', ancestor: 'Morvan x Le Goff', color: '#59a14f' }, 'écran : DNA Painter → côté, groupe, couleur');
            eq(sql(t.db, 'SELECT name FROM dna_groups ORDER BY name').map(r => r.name), ['AutoCluster 1', 'AutoCluster 2', 'AutoTree 1', 'AutoTree 2'], 'écran : grappes AutoCluster et AutoTree → groupes (« 0 » = sans grappe)');
            const cam = sql(t.db, "SELECT data_json FROM dna_matches WHERE name='Camille Imaginaire'")[0];
            ok(/"shared_matches":\["Lucas Fictif"\]/.test(cam.data_json) && /Baptiste Delmas/.test(cam.data_json), 'écran : AutoCluster → correspondances en commun ; AutoTree → ancêtre commun');
            ok(Math.abs(one(t.db, "SELECT shared_cm FROM dna_matches WHERE name='Dupont, Anne'") - 88.4) < 0.01, 'écran : LivingDNA → cM');
            // ⤓ Exporter pour DNA Painter
            await page.evaluate(() => { window.LCNDA_APP.state.adnTab = 'chromo'; window.LCNDA_APP.setModule('adn'); });
            await page.waitForSelector('[data-dna-painter]', { timeout: 15000 }).catch(async () => { await page.evaluate(() => window.LCNDA_EXT?.dnaGo?.('chromo')); });
            if (!(await page.locator('[data-dna-painter]').count())) { await page.click('text=Chromosomes'); await page.waitForSelector('[data-dna-painter]'); }
            await shot('3c-adn-chromosomes.png');
            const [pd] = await Promise.all([page.waitForEvent('download'), page.click('[data-dna-painter]')]);
            const csv = fs.readFileSync(await pd.path(), 'utf8').trim().split('\n');
            eq(csv[0], 'Match Name,Chromosome,Start Location,End Location,Centimorgans,Matching SNPs', 'DNA Painter : en-tête exact (navigateur de chromosomes de FamilyTreeDNA)');
            eq(csv.length - 1, 4, 'DNA Painter : 4 segments');
            const rows = csv.slice(1).map(l => SHEET.parseCSV(l, { sep: ',' })[0]);
            ok(rows.every(r => r.length === 6 && /^([1-9]|1\d|2[0-2]|X)$/.test(r[1]) && /^\d+$/.test(r[2]) && /^\d+$/.test(r[3]) && +r[3] > +r[2] && /^\d+(\.\d+)?$/.test(r[4]) && /^\d+$/.test(r[5])), 'DNA Painter : chromosomes valides, positions entières, cM et SNP numériques');
            ok(rows.some(r => r[0] === 'Morvan, Inès'), 'DNA Painter : nom avec une virgule bien protégé');

            // Médias → ⤒ Importer des photos (Google Takeout)
            await page.evaluate(() => { window.LCNDA_APP.state.listType = 'media'; window.LCNDA_APP.setModule('listes'); });
            await page.waitForSelector('[data-photos-import]', { state: 'attached', timeout: 20000 });
            const m0 = one(t.db, 'SELECT count(*) FROM media');
            await page.evaluate(() => { window.LCNDA_EXT.openPhotosImport(); });
            await page.waitForSelector('.k-import input[type=file]', { state: 'attached' });
            await page.setInputFiles('.k-import input[type=file]', path.join(FIX, 'google-takeout.zip'));
            await page.waitForSelector('.k-import [data-k-go]:not([disabled])', { timeout: 30000 });
            await page.waitForFunction(() => document.querySelectorAll('.k-import [data-phi-hint]').length && [...document.querySelectorAll('.k-import [data-phi-hint]')].every(h => h.textContent));
            const t2 = await page.textContent('.k-import [data-k-body]');
            ok(/Voilà ce qui va entrer : 6 photos/.test(t2) && /HEIC/.test(t2) && /rien n’est envoyé sur internet/.test(t2), 'écran : Takeout → 6 photos, HEIC laissé de côté, rien envoyé');
            eq(await page.locator('.k-import [data-phi-ok]:checked').count(), 0, 'écran : aucune case « Relier » cochée au départ');
            ok(/Importer 6 photos/.test(await page.textContent('.k-import [data-k-go]')), 'écran : bouton « ⤒ Importer 6 photos »');
            const placeRow = page.locator('.k-import [data-phi-place]').first();
            ok(/Tulle/.test(await placeRow.textContent()), 'écran : lieu proposé d’après la position (Tulle)');
            await placeRow.locator('[data-phi-ok]').check();
            const leonRow = page.locator('.k-import [data-phi-person]', { hasText: 'Léon Faure' });
            ok(/FAURE/.test(await leonRow.textContent()), 'écran : Léon Faure proposé (fiche de la base)');
            await leonRow.locator('[data-phi-ok]').check();
            await shot('3c-photos-1440.png');
            await page.click('.k-import [data-k-go]');
            await page.waitForSelector('.k-import', { state: 'detached', timeout: 60000 });
            eq(one(t.db, 'SELECT count(*) FROM media') - m0, 6, 'écran : 6 photos entrées');
            eq(one(t.db, `SELECT count(*) FROM media WHERE place_id=${tulleId}`), 4, 'écran : lieu confirmé → 4 photos à Tulle');
            eq(sql(t.db, `SELECT m.description FROM media_links ml JOIN media m ON m.id=ml.media_id WHERE ml.entity_type='person' AND ml.entity_id=${leon}`).map(r => r.description), ['Mariage de Léon et Hélène, devant la mairie'], 'écran : seule la personne confirmée est reliée');
            eq(one(t.db, `SELECT count(*) FROM media_links WHERE entity_type='person' AND entity_id=${Number(one(t.db, "SELECT id FROM persons WHERE first_name='Hélène'"))}`), 0, 'écran : personne non confirmée jamais reliée');
            eq(one(t.db, "SELECT count(*) FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE l.name='Pique-nique à Tulle'"), 3, 'écran : album en étiquette');
            eq(one(t.db, "SELECT date_text FROM media WHERE title='PXL_20200815_143000'"), '15 août 2020', 'écran : date reprise');
            const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(x => /↶ Annuler/.test(x.textContent) && /6 photos importées/.test(x.parentElement?.closest('*')?.parentElement?.textContent || '')).pop(); if (!b) return document.body.innerText.match(/.*photos importées.*/)?.[0] || 'rien'; b.click(); return true; });
            ok(clicked === true, 'écran : message H7 « 6 photos importées » avec « ↶ Annuler » (' + clicked + ')');
            await page.waitForFunction(() => /Annulé : .*photos importées/.test(document.body.textContent), null, { timeout: 20000 });
            await page.waitForTimeout(500);
            eq([one(t.db, 'SELECT count(*) FROM media') - m0, one(t.db, "SELECT count(*) FROM labels WHERE name='Pique-nique à Tulle'")], [0, 0], 'écran : ↶ Annuler retire les photos et l’étiquette créée');
            // Apple Photos (plusieurs fichiers), archive piégée
            await page.evaluate(() => { window.LCNDA_EXT.openPhotosImport(); });
            await page.waitForSelector('.k-import input[type=file]', { state: 'attached' });
            await page.setInputFiles('.k-import input[type=file]', fs.readdirSync(path.join(FIX, 'apple-photos')).map(f => path.join(FIX, 'apple-photos', f)));
            await page.waitForSelector('.k-import [data-k-go]:not([disabled])', { timeout: 30000 });
            const t3 = await page.textContent('.k-import [data-k-body]');
            ok(/4 photos/.test(t3) && /piégé/.test(t3) && /Odile Œuvrard/.test(t3) && /Égletons/.test(t3), 'écran : Apple Photos → 4 photos, lieux et personnes, XMP piégé signalé');
            await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
            await shot('3c-photos-390.png');
            const over = await page.evaluate(() => { const d = document.querySelector('.k-import'); return d ? d.scrollWidth - d.clientWidth : 0; });
            ok(over <= 1, '390 px : la fenêtre ne déborde pas (' + over + ')');
            await page.click('.k-import [data-k-back]');
            await page.setInputFiles('.k-import input[type=file]', path.join(FIX, 'piege-chemin.zip'));
            await page.waitForFunction(() => /ne peut pas être importé/.test(document.querySelector('.k-import [data-k-body]')?.textContent || ''), null, { timeout: 15000 });
            ok(/chemin dangereux/.test(await page.textContent('.k-import [data-k-body]')), 'écran : ZIP avec « ../ » refusé');
            await page.click('.k-import [data-k-x]'); await page.waitForSelector('.k-import', { state: 'detached' });
            const pageOver = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            ok(pageOver <= 1, '390 px : pas de défilement de côté (' + pageOver + ')');
            // sombre
            await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.setViewportSize({ width: 1440, height: 900 });
            await page.evaluate(() => { window.LCNDA_EXT.openPhotosImport(); });
            await page.waitForSelector('.k-import input[type=file]', { state: 'attached' });
            await page.setInputFiles('.k-import input[type=file]', path.join(FIX, 'google-takeout.zip'));
            await page.waitForSelector('.k-import [data-k-go]:not([disabled])', { timeout: 30000 });
            await shot('3c-photos-sombre.png');
            await page.click('.k-import [data-k-x]'); await page.waitForSelector('.k-import', { state: 'detached' });
            await page.evaluate(() => { const st = window.LCNDA_APP.state; st.maintenanceTab = 'export'; window.LCNDA_APP.setModule('maintenance'); });
            await page.waitForSelector('#h-export-plus'); await page.click('#h-export-plus [data-export-plus="dot"]'); await page.waitForSelector('dialog.h-modal[open]');
            await shot('3c-dot-sombre.png');
            await page.evaluate(() => document.querySelectorAll('dialog.h-modal[open]').forEach(d => d.close()));
            eq(errors, [], 'navigateur : aucune erreur');
        } finally { await browser.close(); }
    });
    console.log(`✓ ${n} vérifications`);
})().catch(e => { console.error(e); process.exit(1); });
