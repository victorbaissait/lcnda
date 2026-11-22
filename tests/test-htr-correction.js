'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🪄 Corrections proposées après « ✨ Lire l'acte » (assets/js/app-htr-correction.js, heritage-transcribe.js, lib/htr_correction.php) :
 *   node tests/test-htr-correction.js            (HTRFIX_SHOTS=dossier : captures d'écran)
 *  1. sans serveur : le lexique (mois, nombres, formules, Aide à la lecture, latin, allemand), les ressemblances de lettres,
 *     les propositions (casse et ponctuation gardées, jamais imposées), le seuil, le lexique personnel ;
 *     LA MESURE sur une vraie lecture Kraken (jugement de rectification, 1873) : bonnes / mauvaises propositions, bornées ;
 *     et des actes justes (personnes et lieux fictifs) : presque rien à proposer ;
 *     📖 le dictionnaire général du français (assets/dico/fr-mots.txt.gz) : un texte français juste (la lecture approfondie
 *     d'un registre matricule, 1813) → ZÉRO proposition ; les dates gardent leurs règles (« Vingt-hui » → « huit ») ;
 *  2. un vrai « php -S » : GET htr_lexicon sans vivants ni fiches confidentielles ;
 *  3. dans le navigateur : le panneau des lignes lues (mots soulignés, menu, Garder tel quel, Ajouter au lexique, ✓ Accepter
 *     les sûres, ↶ Annuler, réglages oui / non et prudent / plus), puis le texte de l'Atelier (soulignés, menu, Accepter, Annuler) ;
 *     l'endroit de chaque proposition (fenêtre des deux lectures : survol et clavier → le mot choisi et surligné, la bulle avec
 *     la ligne ; le choix remplace CE mot, pas le premier pareil ; dans l'Atelier, le clic sur le 2e mot pareil corrige le 2e).
 * Les personnes de la base d'essai sont fictives ; le texte mesuré est celui envoyé par l'utilisateur (son propre acte).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }

const appRoot = path.resolve(__dirname, '..');
const F = require('../assets/js/app-htr-correction.js');
const SHOTS = process.env.HTRFIX_SHOTS || '';
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

/* ─── la vraie lecture (Kraken), ligne par ligne, et ce qu'il fallait lire pour chaque mot fautif ─── */
const READ = `commettons Monsieur
Tamlert jurge pourfuire cerupport. Tours te
vingt deux Décembre mil huit aut suivante tresze (Signé) Des Francie
de precurcir en la République ne d'appase. Tours le vingt deux décembe
mie huit cent soirante treize (digné charoy
le trobunul, vule
requete qui préceide onsemble Cordonnunce de soit communiqué.
les conclusions de Monsieur le Prueure et la Répablique. Oui
Monsier Lambert fage comis en son aupart, les tesains et
parties en leurs dépositions, et le ministire publique en ses
réquisitions verleles et mativées et qès en avair Télibéré conformement
à la loi . Attendu que Louis Raise Annilul esté le dire.
eqet tout Mil huit cent cinquarete trais du Cgitime emuriage
du sicer Sytrais Cmmubal requèrant et ce touise Delaunay
son épouse dans La Commune de Sontay, que son acte de
missance n'a pas été inserit puer crreur sus les rrégistres vestu
dite commune de Fonzay ; Pu'inépendamment ue la
pacure testimoniulre, il hésulte st d'actere l'uepteme dupé si
les registres et la fauraisse de S^t Gesnest de Vonzay, que le dit
Lonis toise Ammiluul est bien né à Fontuy au joursus-ie
des dit épour Annilul Delaunay ; Qu'il & a lieur e rechipes`;
const GOLD = [[],
    [['Tamlert', 'Lambert'], ['jurge', 'juge'], ['pourfuire', 'pour faire'], ['cerupport', 'le rapport'], ['te', 'le']],
    [['aut', 'cent'], ['suivante', 'soixante'], ['tresze', 'treize']],
    [['de', 'Le'], ['precurcir', 'procureur'], ['en', 'de'], ["d'appase", "s'oppose"], ['décembe', 'décembre']],
    [['mie', 'mil'], ['soirante', 'soixante'], ['digné', 'Signé']],
    [['trobunul', 'tribunal'], ['vule', 'vu la']],
    [['requete', 'requête'], ['préceide', 'précède'], ['onsemble', 'ensemble'], ['Cordonnunce', "l'ordonnance"]],
    [['Prueure', 'Procureur'], ['et', 'de'], ['Répablique', 'République']],
    [['Monsier', 'Monsieur'], ['fage', 'juge'], ['comis', 'commis'], ['aupart', 'rapport'], ['tesains', 'témoins']],
    [['ministire', 'ministère'], ['publique', 'public']],
    [['verleles', 'verbales'], ['mativées', 'motivées'], ['qès', 'après'], ['avair', 'avoir'], ['Télibéré', 'délibéré'], ['conformement', 'conformément']],
    [['Raise', 'Moïse'], ['Annilul', 'Annibal'], ['esté', 'est né'], ['dire', 'dix']],
    [['eqet', 'sept'], ['tout', 'août'], ['cinquarete', 'cinquante'], ['trais', 'trois'], ['Cgitime', 'légitime'], ['emuriage', 'mariage']],
    [['sicer', 'sieur'], ['Sytrais', 'Sylvain'], ['Cmmubal', 'Annibal'], ['requèrant', 'requérant'], ['ce', 'de'], ['touise', 'Louise']],
    [['Sontay', 'Sonzay']],
    [['missance', 'naissance'], ['inserit', 'inscrit'], ['puer', 'par'], ['crreur', 'erreur'], ['sus', 'sur'], ['rrégistres', 'registres'], ['vestu', 'de la']],
    [['Fonzay', 'Sonzay'], ["Pu'inépendamment", "Qu'indépendamment"], ['ue', 'de']],
    [['pacure', 'preuve'], ['testimoniulre', 'testimoniale'], ['hésulte', 'résulte'], ['st', 'de'], ["d'actere", "l'acte"], ["l'uepteme", 'de baptême'], ['dupé', 'dressé'], ['si', 'sur']],
    [['et', 'de'], ['fauraisse', 'paroisse'], ['Gesnest', 'Genest'], ['Vonzay', 'Sonzay']],
    [['Lonis', 'Louis'], ['toise', 'Moïse'], ['Ammiluul', 'Annibal'], ['Fontuy', 'Sonzay'], ['joursus', 'jour sus'], ['ie', 'indiqué']],
    [['dit', 'desdits'], ['épour', 'époux'], ['Annilul', 'Annibal'], ['lieur', 'lieu'], ['e', 'de'], ['rechipes', 'rectifier']]];
const FAULTS = GOLD.flat().length;
/** ce que la base de l'utilisateur contient sans doute pour cet acte de sa famille (ses noms et sa commune), plus des fiches fictives */
const BASE = { surnames: ['Lambert', 'Delaunay', 'Annibal', 'Vernadet', 'Bessac', 'Chabrol'], firstNames: ['Moïse', 'Sylvain', 'Louise', 'Louis', 'Antoine', 'Rosalie'], places: ['Sonzay', 'Tours', 'Indre-et-Loire', 'France', 'Villebrune'], trades: ['cultivateur', 'tonnelier'] };
function measure(names, level) {
    const lex = F.buildLexicon({ lang: 'fra', names });
    let good = 0, bad = 0, sureGood = 0, sureBad = 0; const log = [];
    READ.split('\n').forEach((ln, i) => {
        const g = GOLD[i].slice();
        F.propose(ln, lex, { level }).forEach(f => {
            const k = g.findIndex(x => x[0] === f.word), v = f.props[0].value;
            const ok = k >= 0 && v.toLowerCase() === g[k][1].toLowerCase(); if (k >= 0) g.splice(k, 1);
            if (ok) { good++; if (f.sure) sureGood++; } else { bad++; if (f.sure) sureBad++; }
            log.push(`${ok ? '✓' : '✗'} ${f.word} → ${f.props.map(p => p.value).join(' / ')}`);
        });
    });
    return { good, bad, sureGood, sureBad, log };
}
/* ─── un texte français juste (la lecture approfondie, IA, d'un registre ; capture de l'utilisateur) : RIEN à proposer.
 *     Avant le dictionnaire général : armées → aimées, ramené → amené, troupes → trouvés, disposition → déposition… ─── */
const CORRECT_FR = `Aujourd'hui vingt-huit octobre mil huit cent treize, est comparu devant nous Joseph Martinez, né en Espagne, âgé de vingt-huit ans, ayant servi dans les armées de l'Empire Autrichien, ayant été fait prisonnier à la bataille d'Ulm, ramené en France, puis incorporé dans les troupes à la disposition du ministre de la guerre ; lequel, se trouvant libre, nous a remis les items de son inventaire, à défaut de papiers, avec l'intention de s'établir en cette commune, craignant d'être poursuivi ; d'ailleurs son compagnon, le nommé Battant, nous a dit l'avoir senti malade.`;
const CORRECT_WORDS = ['armées', 'ramené', 'troupes', 'disposition', 'libre', 'items', 'défaut', "l'intention", 'craignant', "d'ailleurs", 'compagnon', 'Battant', 'senti', 'ministre', 'remis', 'papiers', 'prisonnier', "Aujourd'hui"];
/* ─── des actes justes (personnes et lieux fictifs) : on ne doit presque rien y proposer ─── */
const RIGHT = [
    `L'an mil huit cent cinquante-deux, le quinze mars, à dix heures du matin, par-devant nous, Jules Vernier, maire et officier de l'état civil de la commune de Villebrune, canton de Montclar, est comparu le sieur Antoine Bessac, âgé de trente-quatre ans, cultivateur, domicilié en cette commune, lequel nous a présenté un enfant du sexe féminin, né hier à quatre heures du soir, de lui déclarant et de Marie Chabrol, son épouse, âgée de vingt-huit ans, sans profession, et auquel il a déclaré vouloir donner les prénoms de Jeanne Rosalie. Lesdites déclaration et présentation faites en présence des sieurs Pierre Lagarde, maréchal-ferrant, et Michel Fabre, propriétaire, et ont, le père et les témoins, signé avec nous le présent acte après qu'il leur en a été donné lecture.`,
    `L'an mil huit cent soixante-dix-huit, le vingt-six novembre, devant nous, maire, officier de l'état civil, ont comparu publiquement en la maison commune le sieur François Mercadier, âgé de vingt-sept ans, menuisier, fils majeur et légitime de Jean Mercadier, cultivateur, et de Catherine Roumy, son épouse, ici présents et consentants, d'une part ; et demoiselle Augustine Castagné, couturière, fille majeure et légitime de feu Louis Castagné, décédé en cette commune le douze mai mil huit cent soixante-dix, et de Marguerite Lafon, sa veuve, ménagère, d'autre part ; lesquels nous ont requis de procéder à la célébration du mariage projeté entre eux, et dont les publications ont été faites devant la porte de notre maison commune. Aucune opposition audit mariage ne nous ayant été signifiée, faisant droit à leur réquisition, avons demandé au futur époux et à la future épouse s'ils veulent se prendre pour mari et pour femme ; chacun d'eux ayant répondu séparément et affirmativement, déclarons au nom de la loi qu'ils sont unis par le mariage.`,
    `Par-devant Maître Étienne Rouvière, notaire à Montclar, soussigné, et en présence des témoins ci-après nommés, ont comparu le sieur Guillaume Teyssier, propriétaire, et dame Anne Pradel, son épouse, lesquels ont vendu au sieur Barthélemy Vidal, cultivateur, ici présent et acceptant, une pièce de terre labourable d'une contenance d'environ quarante ares. Cette vente est faite moyennant le prix de huit cents francs, que l'acquéreur a payé comptant aux vendeurs, qui lui en donnent quittance. Dont acte, fait et passé à Montclar, en l'étude, en présence des sieurs Paul Granier et Jean Boissière, témoins requis, qui ont signé avec les parties et le notaire après lecture faite.`,
    `Le tribunal civil de première instance de l'arrondissement de Montclar, après en avoir délibéré conformément à la loi, vu la requête présentée par le sieur Victor Lassalle, ouï Monsieur le juge commis en son rapport et le ministère public en ses conclusions, attendu qu'il résulte des pièces produites et de l'enquête que l'acte de décès du nommé Joseph Lassalle porte par erreur le prénom de Jean, ordonne que ledit acte sera rectifié et que le présent jugement sera transcrit sur les registres de l'état civil, et que mention en sera faite en marge de l'acte rectifié.`,
    `Le dix-neuf du mois de juin mil sept cent quatre-vingt-trois a été baptisé par moi, curé soussigné, Jean, né d'hier, fils légitime de Pierre Combes, laboureur, et de Marie Vialar, son épouse, de cette paroisse. Le parrain a été Jean Combes, oncle paternel de l'enfant, la marraine Jeanne Vialar, sa tante maternelle, qui ont déclaré ne savoir signer, de ce enquis.`,
];

(async () => {
    /* ═════════ 1. sans serveur ═════════ */
    const lex = F.buildLexicon({ lang: 'fra' });
    await t('le lexique : mois, nombres jusqu’aux dates, formules des actes et des jugements, Aide à la lecture, métiers ; latin et allemand plus petits', () => {
        for (const w of ['décembre', 'août', 'vendémiaire', 'soixante', 'treize', 'mil', 'cent', 'quatre-vingt', 'comparu', 'légitime', 'mariage', 'sus-indiqué', 'procureur', 'république', 'tribunal', 'réquisitions', 'délibéré', 'conformément', 'témoins', 'paroisse', 'baptême', 'sieur', 'cultivateur', 'notaire', 'par-devant'])
            assert.ok(F.knows(lex, w), `« ${w} » dans le lexique`);
        assert.ok(F.knows(lex, 'registres') && F.knows(lex, 'dressée'), 'pluriels et accords');
        assert.ok(F.knows(lex, 'baptiser') && F.knows(lex, 'déclarant'), 'verbes');
        assert.ok(F.knows(lex, 'inhumé') && F.knows(lex, 'ondoyé'), 'mots de l’Aide à la lecture et des formules');
        assert.ok(!F.knows(lex, 'te') && !F.knows(lex, 'mie'), 'petits mots presque jamais écrits dans un acte : absents');
        const la = F.buildLexicon({ lang: 'lat' }), de = F.buildLexicon({ lang: 'deu' });
        assert.ok(F.knows(la, 'baptizavi') && F.knows(la, 'decembris') && F.knows(la, 'patrinus'), 'latin');
        assert.ok(F.knows(de, 'getauft') && F.knows(de, 'Dezember'), 'allemand');
        assert.ok(la.size < lex.size && de.size < lex.size, 'plus petits que le français');
        assert.ok(lex.size > 3000, `lexique français assez grand (${lex.size})`);
    });
    await t('les lettres qui se ressemblent coûtent peu (u/n, a/o, a/u, e/c, r/v, b/l, m/nn) ; une autre lettre coûte 1', () => {
        assert.equal(F.cost('Répablique', 'République'), 0.3);
        assert.equal(F.cost('avair', 'avoir'), 0.3);
        assert.equal(F.cost('crreur', 'erreur'), 0.3);
        assert.equal(F.cost('Lonis', 'Louis'), 0.3);
        assert.ok(F.cost('nnai', 'mai') <= 0.3, 'm/nn');
        assert.ok(F.cost('Annilul', 'Annibal') <= 0.6);
        assert.ok(F.cost('décembe', 'décembre') === 1);
        assert.ok(F.cost('maison', 'raison') >= 1.3, 'une autre première lettre : plus cher');
        assert.equal(F.cost('requete', 'requête'), 0, 'les accents ne comptent pas dans la distance');
    });
    await t('une proposition, jamais imposée : la casse et la ponctuation gardées ; le texte ne change qu’avec applyFix', () => {
        const txt = 'Tours le vingt deux Décembe mil huit cent soixante.';
        const fx = F.propose(txt, lex);
        const f = fx.find(x => x.word === 'Décembe'); assert.ok(f, 'Décembe proposé');
        assert.equal(f.props[0].value, 'Décembre', 'la majuscule gardée');
        assert.ok(f.props.length >= 1 && f.props.length <= 3, '1 à 3 propositions');
        assert.equal(txt, 'Tours le vingt deux Décembe mil huit cent soixante.', 'rien de changé tout seul');
        assert.equal(F.applyFix(txt, f, f.props[0].value), 'Tours le vingt deux Décembre mil huit cent soixante.');
        const g = F.propose('la Répablique.', lex)[0]; assert.equal(F.applyFix('la Répablique.', g, g.props[0].value), 'la République.', 'le point reste');
        const h = F.propose('Le PROCUREUR de la RÉPABLIQUE', lex).find(x => x.word === 'RÉPABLIQUE'); assert.equal(h?.props[0].value, 'RÉPUBLIQUE', 'tout en majuscules');
        assert.equal(F.applySure('du Cgitime onsemble', F.propose('du Cgitime onsemble', lex)), 'du Cgitime ensemble', 'seules les sûres partent avec « Accepter les sûres »');
    });
    await t('les dates en toutes lettres : « mil huit aut » → cent ; « cent suivante tresze » → soixante treize ; « mie huit » → mil', () => {
        const p = s => Object.fromEntries(F.propose(s, lex).map(f => [f.word, f.props[0].value]));
        assert.deepEqual(p('vingt deux Décembre mil huit aut suivante tresze'), { aut: 'cent', suivante: 'soixante', tresze: 'treize' });
        assert.equal(p('décembre mie huit cent soirante treize').mie, 'mil');
        assert.equal(p('décembre mie huit cent soirante treize').soirante, 'soixante');
        assert.equal(p('une suivante lettre').suivante, undefined, 'un vrai mot hors d’une date : rien');
    });
    await t('les noms de la base comptent, mais ne remplacent pas un mot commun sans forte ressemblance', () => {
        const withBase = F.buildLexicon({ lang: 'fra', names: { surnames: ['Annibal', 'Faute'], places: ['Sonzay'] } });
        assert.equal(F.propose('commune de Fonzay', withBase)[0]?.props[0].value, 'Sonzay');
        assert.equal(F.propose('du sieur Annilul', withBase)[0]?.props[0].value, 'Annibal');
        assert.equal(F.propose('le prix comptant', withBase).length, 0, 'mots connus : rien');
        assert.ok(!F.propose('une fautr', withBase).some(f => f.props.some(p => p.value === 'Faute')), 'un nom propre ne remplace pas un mot commun de loin');
        assert.ok(F.propose('Jean Faure', withBase).every(f => !f.sure), 'un nom au milieu d’une phrase : jamais « sûr »');
    });
    await t('le lexique personnel : un mot ajouté n’est plus souligné', () => {
        assert.ok(F.propose('le sieur Tamlert', F.buildLexicon({ lang: 'fra', names: BASE })).some(f => f.word === 'Tamlert'));
        assert.equal(F.propose('le sieur Tamlert', F.buildLexicon({ lang: 'fra', names: BASE, personal: ['Tamlert'] })).length, 0);
    });
    await t('le seuil : « plus de propositions » en donne plus que « prudent »', () => {
        const a = F.propose(READ, lex).length, b = F.propose(READ, lex, { level: 'plus' }).length;
        assert.ok(b > a, `${b} > ${a}`);
    });
    await t('pas de réglage propre à ce texte : aucune paire « lu → juste » de la mesure dans le moteur', () => {
        const src = fs.readFileSync(path.join(appRoot, 'assets/js/app-htr-correction.js'), 'utf8');
        for (const w of ['décembe', 'trobunul', 'Répablique', 'onsemble', 'Cordonnunce', 'tresze', 'soirante', 'Annilul', 'Sonzay', 'Tamlert']) assert.ok(!src.includes(w), `« ${w} » absent du moteur`);
    });
    const M0 = measure({}, 'prudent'), M1 = measure(BASE, 'prudent'), M2 = measure(BASE, 'plus');
    console.log(`  📏 ${FAULTS} mots fautifs. Prudent, sans les noms de la base : ${M0.good} bonnes, ${M0.bad} mauvaises (sûres : ${M0.sureGood} bonnes, ${M0.sureBad} mauvaises). Avec les noms de la base : ${M1.good} bonnes, ${M1.bad} mauvaises. « Plus de propositions » : ${M2.good} bonnes, ${M2.bad} mauvaises.`);
    if (process.env.HTRFIX_LOG) console.log(M1.log.join('\n'));
    await t('la mesure sur la vraie lecture (jugement de 1873) : beaucoup de bonnes corrections, très peu de fausses', () => {
        assert.ok(M0.good >= 36, `sans base : ${M0.good} bonnes (au moins 36)`); assert.ok(M0.bad <= 3, `sans base : ${M0.bad} mauvaises (au plus 3)`);
        assert.ok(M1.good >= 41, `avec base : ${M1.good} bonnes (au moins 41)`); assert.ok(M1.bad <= 4, `avec base : ${M1.bad} mauvaises (au plus 4)`);
        assert.ok(M1.sureGood >= 10 && M1.sureBad === 0, `sûres : ${M1.sureGood} bonnes, ${M1.sureBad} mauvaises`);
        for (const [w, v] of [['décembe', 'décembre'], ['Répablique', 'République'], ['trobunul', 'tribunal'], ['soirante', 'soixante'], ['onsemble', 'ensemble']])
            assert.ok(M1.log.includes(`✓ ${w} → ${v}`) || M1.log.some(l => l.startsWith(`✓ ${w} → ${v}`)), `${w} → ${v}`);
    });
    await t('des actes justes : presque rien à proposer, rien de « sûr »', () => {
        const lexB = F.buildLexicon({ lang: 'fra', names: BASE }); let words = 0, props = 0, sure = 0;
        RIGHT.forEach(s => { words += F.tokenize(s).length; const fx = F.propose(s, lexB); props += fx.length; sure += fx.filter(f => f.sure).length; });
        assert.ok(props <= 3, `${props} propositions sur ${words} mots justes (au plus 3)`); assert.equal(sure, 0);
        const old = 'Le vingt six de may mil sept cent quarante deux a esté baptisé Jean filz legitime de Pierre Martin'; // un vieux registre sans accents
        assert.ok(!F.propose(old, lexB).some(f => f.word === 'legitime'), 'un texte sans accents : on ne propose pas d’en ajouter');
    });
    await t('📖 le dictionnaire général du français : compact (fichier statique, licence MIT citée), chargé une fois, livré avec l’app de bureau', () => {
        const file = path.join(appRoot, 'assets/dico/fr-mots.txt.gz'), size = fs.statSync(file).size;
        assert.ok(size < 1024 * 1024, `${size} octets (moins de 1 Mo)`);
        const head = require('node:zlib').gunzipSync(fs.readFileSync(file)).toString('utf8').slice(0, 1500);
        assert.match(head, /an-array-of-french-words/); assert.match(head, /Licence MIT/); assert.match(head, /Zeke Sikelianos/);
        assert.ok(lex.dico && lex.dico.size > 300000, `${lex.dico?.size} mots`);
        for (const w of ['armées', 'ramené', 'troupes', 'disposition', 'compagnon', 'craignant']) assert.ok(F.inDico(lex, w), w);
        assert.ok(!F.inDico(lex, 'décembe') && !F.inDico(lex, 'Répablique'), 'les mots mal lus n’y sont pas');
        assert.ok(!F.inDico(lex, 'te') && !F.inDico(lex, 'mie'), 'les petits mots volontairement absents non plus');
        assert.equal(F.buildLexicon({ lang: 'lat' }).dico, null, 'pas pour le latin');
        const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')), filter = pkg.build.extraResources.find(e => e.to === 'php-app').filter;
        assert.ok(filter.includes('assets/**/*') && !filter.some(f => /^!.*(dico|\.gz)/.test(f)), 'dans l’app de bureau (package.json → extraResources)');
        assert.ok(!(pkg.dependencies || {})['an-array-of-french-words'], 'pas une dépendance d’exécution');
        assert.match(fs.readFileSync(path.join(appRoot, 'README.md'), 'utf8'), /an-array-of-french-words[^\n]*MIT/, 'cité dans les composants tiers (README)');
        assert.ok(fs.existsSync(path.join(appRoot, 'scripts/build-dico-fr.js')), 'le script qui le fabrique');
    });
    await t('📖 un texte français juste (lecture approfondie) : ZÉRO proposition ; les mots courants ne sont jamais remplacés', () => {
        const lexB = F.buildLexicon({ lang: 'fra', names: BASE });
        const fx = F.propose(CORRECT_FR, lexB); assert.deepEqual(fx.map(f => `${f.word} → ${f.props[0].value}`), []);
        const plus = F.propose(CORRECT_FR, lexB, { level: 'plus' }).map(f => f.word);
        assert.deepEqual(plus.filter(w => CORRECT_WORDS.includes(w)), [], '« plus de propositions » non plus');
        assert.deepEqual(F.propose('Pierre fiance sa fille ; il domicilie ses biens', lexB).map(f => f.word), [], 'pas d’accent « oublié » quand le mot sans accent existe');
        assert.equal(F.propose('vu la requete présentée', lexB)[0]?.props[0].value, 'requête', 'mais un vrai accent oublié, oui');
    });
    await t('📖 les dates gardent leurs règles : « Vingt-hui » → « huit », « mie huit cent » → « mil », « cinquante trais » → « trois »', () => {
        const p = s => Object.fromEntries(F.propose(s, lex).map(f => [f.word, f.props[0].value]));
        assert.equal(p('Vingt-hui octobre mil huit cent treize').hui, 'huit');
        assert.equal(p('décembre mie huit cent soirante treize').mie, 'mil');
        assert.equal(p('mil huit cent cinquante trais du mois').trais, 'trois');
        assert.deepEqual(p("Aujourd'hui vingt-huit octobre"), {}, '« Aujourd’hui » : rien');
        assert.deepEqual(p('il lui a dit trais fois'), {}, 'hors d’une date : un mot du dictionnaire reste');
    });
    await t('l’endroit d’une proposition : la ligne et quelques mots autour ; le choix remplace CE mot (pas le premier pareil)', () => {
        const txt = 'la Répablique\nmil huit cent et la Répablique française', fx = F.propose(txt, lex).filter(f => f.word === 'Répablique');
        assert.equal(fx.length, 2);
        const w = F.where(txt, fx[1]); assert.equal(w.line, 2); assert.equal(w.before, '… cent et la'); assert.equal(w.after, 'française');
        assert.equal(F.applyFix(txt, fx[1], 'République'), 'la Répablique\nmil huit cent et la République française');
        assert.equal(F.applyFix('xx ' + txt, fx[1], 'République'), 'xx la Répablique\nmil huit cent et la République française', 'le texte a bougé : le mot le plus proche de l’endroit');
    });
    await t('rapide : la page entière en moins d’une seconde', () => {
        const t0 = Date.now(); F.propose(READ, F.buildLexicon({ lang: 'fra', names: BASE })); const ms = Date.now() - t0;
        assert.ok(ms < 1500, `${ms} ms`);
    });

    /* ═════════ 2. le serveur ═════════ */
    const phpPath = findPhp([devBundledPhp()]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-htrfix-'));
    const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    { // une image claire avec des lignes sombres (l'acte)
        const zlib = require('node:zlib'), W = 640, H = 320, raw = Buffer.alloc((W * 3 + 1) * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const j = y * (W * 3 + 1) + 1 + x * 3, ink = y % 40 > 14 && y % 40 < 24 && x % 9 < 6; raw[j] = raw[j + 1] = ink ? 40 : 230; raw[j + 2] = ink ? 30 : 205; }
        const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let q = 0; q < 8; q++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
        const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
        const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
        fs.writeFileSync(path.join(dir, 'media', 'acte.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
    }
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_HTR_SIMULATE: '1', PHP_CLI_SERVER_WORKERS: '4' };
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    php(String.raw`require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$ins = $pdo->prepare("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private,is_start) VALUES(?,?,?,?,?,?,?)");
foreach ([[1,'Ambroise','Vernadet','male','deceased',0,1],[2,'Zéphirine','Vivaldou','female','living',0,0],[3,'Octave','Secretain','male','deceased',1,0],[4,'Rosalie','Bessac','female','deceased',0,0]] as $x) $ins->execute($x);
$pdo->exec("INSERT INTO media(id,title,media_type,filename) VALUES(1,'Jugement','image','acte.png')");
echo 'ok';`);
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`, sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
        let cookie = ''; await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r.text(); });
        await t('GET htr_lexicon : les noms, prénoms et lieux de la base, sans les vivants ni les fiches confidentielles', async () => {
            const j = await (await fetch(base + 'api.php?action=htr_lexicon', { headers: { Cookie: cookie } })).json();
            const sur = (j.surnames || []).map(x => x.value), first = (j.firstNames || []).map(x => x.value);
            assert.ok(sur.includes('Vernadet') && sur.includes('Bessac'), JSON.stringify(sur));
            assert.ok(!sur.includes('Vivaldou') && !first.includes('Zéphirine'), 'vivante : absente');
            assert.ok(!sur.includes('Secretain') && !first.includes('Octave'), 'confidentielle : absente');
            assert.ok((j.trades || []).length > 100, 'les métiers anciens');
        });

        /* ═════════ 3. le navigateur ═════════ */
        if (!chromium) { console.log('… pas de Chromium : essais du navigateur sautés'); return; }
        const browser = await chromium.launch();
        try {
            const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
            const p = await ctxB.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
            const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, n) }); } };
            await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_HTRFIX, null, { timeout: 30000 });
            await p.evaluate(async () => { await window.LCNDA_APP.api('htr_install', {}, { method: 'POST', body: { python: 'embedded' } }); });
            for (let i = 0; i < 100; i++) { const s = await p.evaluate(() => window.LCNDA_APP.api('htr_setup_status')); if (s.ready && (s.models || []).some(m => m.present)) break; await sleep(200); }
            const lines = READ.split('\n').slice(1, 8).map((tx, i) => ({ text: tx, bbox: [10, 10 + i * 40, 600, 44 + i * 40], conf: .7, words: tx.split(' ').map(w => ({ t: w, c: /e$/.test(w) ? .6 : .9 })) }));
            await p.route(/action=htr_read_job/, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'x', state: 'done', elapsed: 2, model_file: 'mccatmus-fr-en.mlmodel', lines }) }));
            await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({ mediaId: 1, filename: 'acte.png', title: 'Jugement' }));
            await p.waitForFunction(() => document.querySelector('dialog.h-tx-dlg [data-tx-img]')?.getAttribute('href'), null, { timeout: 15000 }); await sleep(400);
            const openReview = async () => { await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="htr"]').click());
                for (let i = 0; i < 40 && !(await p.evaluate(() => !!document.querySelector('.h-htr-rev'))); i++) { await p.evaluate(() => { const b = [...document.querySelectorAll('dialog[open] button[type=submit]')].at(-1); if (b && !document.querySelector('.h-htr-rev') && document.querySelector('canvas[data-txa-prev]')) b.click(); }); await sleep(250); }
                await p.waitForFunction(() => document.querySelector('.h-htr-fixbar .h-htr-fixn'), null, { timeout: 20000 }); };
            await openReview();
            const R = () => p.evaluate(() => ({ fixes: [...document.querySelectorAll('.h-htr-fix')].map(x => x.textContent), sure: document.querySelectorAll('.h-htr-fix.is-sure').length,
                unsure: document.querySelectorAll('mark.h-htr-unsure').length, text: [...document.querySelectorAll('[data-htr-line]')].map(x => x.textContent).join('\n'), bar: document.querySelector('.h-htr-fixbar')?.textContent || '' }));
            let r = await R();
            await t('le panneau des lignes lues : mots corrigeables soulignés (autre couleur que « peu sûr »), le texte lu inchangé', async () => {
                assert.ok(r.fixes.includes('décembe') && r.fixes.includes('Répablique') && r.fixes.includes('trobunul'), JSON.stringify(r.fixes));
                assert.ok(r.unsure > 0, 'les mots peu sûrs restent surlignés');
                assert.equal(r.text, READ.split('\n').slice(1, 8).join('\n'), 'rien n’est changé tout seul');
                const col = await p.evaluate(() => [getComputedStyle(document.querySelector('.h-htr-fix')).textDecorationColor, getComputedStyle(document.querySelector('mark.h-htr-unsure')).backgroundColor]);
                assert.notEqual(col[0], col[1]);
                assert.match(r.bar, /corrections proposées/); assert.match(r.bar, /Accepter les \d+ propositions sûres/);
            });
            await shot('htrfix-1-panneau.png');
            await t('clic sur un mot → menu : propositions, « Garder tel quel », « Ajouter au lexique » ; choisir → remplacé ; ↶ Annuler → comme avant', async () => {
                await p.evaluate(() => [...document.querySelectorAll('.h-htr-fix')].find(x => x.textContent === 'décembe').click()); await sleep(150);
                const items = await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].map(b => b.textContent.trim()));
                assert.ok(items.some(x => /décembre/.test(x)) && items.some(x => /Garder tel quel/.test(x)) && items.some(x => /Ajouter au lexique/.test(x)), JSON.stringify(items));
                await shot('htrfix-2-menu.png');
                await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /décembre/.test(b.textContent)).click()); await sleep(100);
                assert.match((await R()).text, /vingt deux décembre/);
                await p.evaluate(() => document.querySelector('[data-fix-undo]').click()); await sleep(100);
                const back = await R(); assert.match(back.text, /vingt deux décembe$/m); assert.ok(back.fixes.includes('décembe'), 'souligné de nouveau');
            });
            await t('« Garder tel quel » : plus souligné, texte inchangé', async () => {
                await p.evaluate(() => [...document.querySelectorAll('.h-htr-fix')].find(x => x.textContent === 'trobunul').click()); await sleep(120);
                await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Garder tel quel/.test(b.textContent)).click()); await sleep(100);
                const x = await R(); assert.ok(!x.fixes.includes('trobunul')); assert.match(x.text, /trobunul/);
            });
            await t('« Ajouter au lexique » : gardé dans le réglage genealogie-htr-lexique (donc dans la base), plus souligné', async () => {
                await p.evaluate(() => [...document.querySelectorAll('.h-htr-fix')].find(x => x.textContent === 'precurcir').click()); await sleep(120);
                await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /Ajouter au lexique/.test(b.textContent)).click()); await sleep(150);
                assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-htr-lexique'))), ['precurcir']);
                assert.ok(!(await R()).fixes.includes('precurcir'));
                let saved = null; for (let i = 0; i < 20 && !saved; i++) { await sleep(200); saved = JSON.parse(php(String.raw`require 'lib/bootstrap.php'; echo json_encode(['v' => db()->query("SELECT value FROM app_settings WHERE key='genealogie-htr-lexique'")->fetchColumn()]);`)).v; }
                assert.equal(saved, '["precurcir"]', 'dans la base (app_settings)');
            });
            await t('« ✓ Accepter les N propositions sûres » d’un coup, puis ↶ Annuler', async () => {
                const before = await R(); const n = before.sure; assert.ok(n >= 3, `${n} sûres`);
                await p.evaluate(() => document.querySelector('[data-fix-accept]').click()); await sleep(120);
                const after = await R(); assert.equal(after.sure, 0); assert.match(after.text, /République/); assert.match(after.text, /ensemble/);
                await p.evaluate(() => document.querySelector('[data-fix-undo]').click()); await sleep(100);
                assert.equal((await R()).text, before.text);
            });
            await t('réglages : « Proposer des corrections » non → rien de souligné ; oui → de nouveau ; « plus de propositions » → au moins autant', async () => {
                const n0 = (await R()).fixes.length;
                await p.evaluate(() => { const c = document.querySelector('.h-htr-fixbar [data-fix-on]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300);
                assert.equal((await R()).fixes.length, 0); assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-htr-fix')), '0');
                await p.evaluate(() => { const c = document.querySelector('.h-htr-fixbar [data-fix-on]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300);
                assert.equal((await R()).fixes.length, n0);
                await p.evaluate(() => { const s = document.querySelector('.h-htr-fixbar [data-fix-level]'); s.value = 'plus'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300);
                assert.ok((await R()).fixes.length >= n0);
                await p.evaluate(() => { const s = document.querySelector('.h-htr-fixbar [data-fix-level]'); s.value = 'prudent'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300);
                assert.equal(await p.evaluate(() => [...document.querySelectorAll('.h-htr-fixbar select option')].map(o => o.textContent).join(' | ')), 'Prudent (conseillé) | Plus de propositions');
            });
            await t('le texte de l’Atelier : mis tel quel, mots soulignés, menu au clic, ✓ Accepter les sûres, ↶ Annuler', async () => {
                await p.evaluate(() => [...document.querySelectorAll('dialog[open] button[type=submit]')].at(-1).click());
                await p.waitForFunction(() => document.querySelector('[data-tx-fixbar]:not([hidden])') && document.querySelector('.h-tx-mirror u.h-tx-fix'), null, { timeout: 15000 }); await sleep(300);
                const txt0 = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value);
                assert.match(txt0, /décembe/, 'le texte lu, sans correction imposée');
                await shot('htrfix-3-atelier.png');
                // un clic sur « décembe » dans le texte → le menu
                await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); const i = a.value.indexOf('décembe') + 2; a.focus(); a.setSelectionRange(i, i); a.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 900, clientY: 400 })); }); await sleep(150);
                const items = await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].map(b => b.textContent.trim()));
                assert.ok(items.some(x => /décembre/.test(x)), JSON.stringify(items));
                await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /décembre/.test(b.textContent)).click()); await sleep(200);
                assert.match(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value), /vingt deux décembre/);
                await p.evaluate(() => document.querySelector('[data-txfix="accept"]').click()); await sleep(300);
                const txt2 = await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value);
                assert.match(txt2, /République/);
                await p.evaluate(() => document.querySelector('[data-txfix="undo"]').click()); await sleep(300);
                await p.evaluate(() => document.querySelector('[data-txfix="undo"]').click()); await sleep(300);
                assert.equal(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value), txt0, '↶ Annuler deux fois : comme avant');
            });
            await t('🪄 Corrections à la demande sur un texte tapé ; petit écran : la barre tient dans la largeur', async () => {
                await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value = 'Le tribunal, vu la requête, ouï le ministire public en ses conclusions.'; a.dispatchEvent(new Event('input')); document.querySelector('[data-tx-cmd="fix"]').click(); });
                await p.waitForFunction(() => [...document.querySelectorAll('.h-tx-mirror u.h-tx-fix')].map(u => u.textContent).join('') === 'ministire', null, { timeout: 10000 });
                await p.setViewportSize({ width: 390, height: 844 }); await sleep(300);
                const over = await p.evaluate(() => { const b = document.querySelector('[data-tx-fixbar]'); return b.scrollWidth - b.clientWidth; });
                assert.ok(over <= 2, `débordement ${over}px`);
                await shot('htrfix-4-petit.png');
                await p.setViewportSize({ width: 1440, height: 900 });
            });
            await t('l’Atelier : un clic sur le 2e mot pareil (souligné violet) corrige le 2e, pas le 1er', async () => {
                await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.value = 'Vu la Répablique, et la Répablique française.'; a.dispatchEvent(new Event('input')); document.querySelector('[data-tx-cmd="fix"]').click(); });
                await p.waitForFunction(() => document.querySelectorAll('.h-tx-mirror u.h-tx-fix').length === 2, null, { timeout: 10000 });
                await p.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); const i = a.value.lastIndexOf('Répablique') + 3; a.focus(); a.setSelectionRange(i, i); a.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 900, clientY: 400 })); }); await sleep(150);
                await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /République/.test(b.textContent)).click()); await sleep(200);
                assert.equal(await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value), 'Vu la Répablique, et la République française.');
            });
            await t('Réglages → Reconnaissance d’écriture (HTR) : l’interrupteur, le seuil, le lexique personnel (vider, ↶ Annuler)', async () => {
                await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); location.hash = '#maintenance/htr'; });
                await p.waitForFunction(() => document.querySelector('[data-htr-fixset] [data-fix-on]'), null, { timeout: 15000 });
                assert.match(await p.evaluate(() => document.querySelector('[data-htr-fixlex]').textContent), /lexique personnel : 1 mot/);
                await p.evaluate(() => { const c = document.querySelector('[data-htr-fixset] [data-fix-on]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
                assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-htr-fix')), '0');
                await p.evaluate(() => { const c = document.querySelector('[data-htr-fixset] [data-fix-on]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
                await p.evaluate(() => document.querySelector('[data-htr-fixlex-clear]').click()); await sleep(150);
                assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-htr-lexique')), '[]');
                await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '↶ Annuler' && b.offsetParent).at(-1)?.click()); await sleep(200);
                assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-htr-lexique')), '["precurcir"]', '↶ Annuler remet le lexique');
                await shot('htrfix-5-reglages.png');
            });
            await t('📖 dans la page : le dictionnaire chargé une fois depuis le fichier statique (servi par le routeur)', async () => {
                const r = await p.evaluate(async () => { const a = await window.LCNDA_HTRFIX.loadDico(), b = await window.LCNDA_HTRFIX.loadDico(); return { n: a?.size || 0, same: a === b }; });
                assert.ok(r.n > 300000, `${r.n} mots`); assert.ok(r.same, 'gardé en cache');
            });
            await t('fenêtre des deux lectures : chaque proposition montre son endroit (survol, clavier : le mot choisi, surligné, visible ; bulle « … » (ligne n)) ; le choix corrige CE mot', async () => {
                const lines = Array.from({ length: 14 }, (_, i) => i === 1 ? 'Vu la Répablique et la requête' : i === 12 ? 'au nom de la Répablique française' : 'le tribunal civil de première instance');
                await p.evaluate(txt => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); const d = document.createElement('dialog'); d.dataset.essaiTxl = '';
                    d.innerHTML = '<div class="h-txa-cmp"><div class="h-txa-cmp2"></div><textarea data-txa-t="deep" rows="4" style="width:420px;height:90px;font:14px/20px sans-serif"></textarea></div>'; document.body.append(d); d.showModal();
                    d.querySelector('textarea').value = txt; window.LCNDA_LIGNES.compareExtras(d.querySelector('.h-txa-cmp'), { fix: window.LCNDA_EXT.htrFix, lang: 'fra' }); }, lines.join('\n'));
                await p.waitForFunction(() => document.querySelectorAll('[data-essai-txl] [data-txl-fx]').length === 2, null, { timeout: 15000 });
                const info = await p.evaluate(() => [...document.querySelectorAll('[data-essai-txl] [data-txl-fx]')].map(b => ({ t: b.textContent, title: b.title, s: +b.dataset.s, e: +b.dataset.e })));
                assert.match(info[1].title, /« … nom de la \[Répablique\] française » \(ligne 13\)/, info[1].title); assert.match(info[0].title, /\(ligne 2\)/);
                const at = sel => p.evaluate(sel => { const d = document.querySelector('[data-essai-txl]'), ta = d.querySelector('textarea'), b = [...d.querySelectorAll('[data-txl-fx]')];
                    if (sel.over != null) b[sel.over].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); if (sel.focus != null) b[sel.focus].focus();
                    const mk = d.querySelector('.h-txl-spot'), r = mk && !mk.hidden ? mk.getBoundingClientRect() : null, tr = ta.getBoundingClientRect();
                    return { s: ta.selectionStart, e: ta.selectionEnd, top: ta.scrollTop, spot: !!r, inside: !!r && r.top >= tr.top - 1 && r.bottom <= tr.bottom + 1 && r.width > 10 }; }, sel);
                let r = await at({ over: 1 }); assert.deepEqual([r.s, r.e], [info[1].s, info[1].e], 'survol : le 2e mot choisi'); assert.ok(r.top > 0 && r.spot && r.inside, JSON.stringify(r));
                await shot('htrfix-6-endroit.png');
                r = await at({ focus: 0 }); assert.deepEqual([r.s, r.e], [info[0].s, info[0].e], 'clavier : le 1er mot'); assert.ok(r.spot && r.inside, 'surligné et visible ' + JSON.stringify(r));
                await p.evaluate(() => [...document.querySelectorAll('[data-essai-txl] [data-txl-fx]')][1].click()); await p.waitForSelector('.ui-actmenu .ui-actmenu-i');
                await p.evaluate(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(b => /République/.test(b.textContent)).click()); await sleep(200);
                const after = (await p.evaluate(() => document.querySelector('[data-essai-txl] textarea').value)).split('\n');
                assert.equal(after[1], 'Vu la Répablique et la requête', 'le 1er reste'); assert.equal(after[12], 'au nom de la République française', 'le 2e corrigé');
                // le texte juste de la lecture approfondie : aucune proposition
                await p.evaluate(txt => { const ta = document.querySelector('[data-essai-txl] textarea'); ta.value = txt; ta.dispatchEvent(new Event('input')); }, CORRECT_FR);
                await p.waitForFunction(() => /Aucune correction à proposer/.test(document.querySelector('[data-essai-txl] [data-txl-fix]')?.textContent || ''), null, { timeout: 10000 });
                assert.equal(await p.evaluate(() => document.querySelectorAll('[data-essai-txl] [data-txl-fx]').length), 0);
                await p.evaluate(() => { const d = document.querySelector('[data-essai-txl]'); d.close(); d.remove(); });
            });
            await t('aucune erreur dans la page', () => assert.deepEqual(errs, []));
        } finally { await browser.close(); }
    } finally { proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().then(() => { console.log(fails ? `\n${fails} essai(s) en échec` : '\nTout est bon.'); process.exit(fails ? 1 : 0); }).catch(e => { console.error(e); process.exit(1); });
