/**
 * Données de l'outil « Alphabets et langues des actes » (Réglages → Calendrier / mesures).
 * Utilisé par assets/js/heritage-alphabets.js ; vérifié par tests/test-alphabets.js.
 *
 * Chaque langue :
 *   id, name (français), script ('latin' | 'cyrillic' | 'greek' | 'hebrew' | 'arabic'), prior (plus grand = plus fréquente
 *   dans les recherches d'un généalogiste français, sert à départager), alphabet (lettres dans l'ordre officiel, en minuscules ;
 *   les digrammes comptés comme lettres y sont écrits tels quels : « ch », « cs »…), upper (majuscules si on ne peut pas les
 *   calculer, ex. turc i → İ), special (lettres à accents et lettres propres, mises en avant), extra (lettres qu'on ne trouve
 *   que dans les mots ou les noms étrangers), old ([lettre, explication] : écriture ancienne et abréviations des actes),
 *   tr (non latin : lettre → [usuelle en français, savante]), hints (comment la reconnaître), words (mots fréquents des actes).
 * Tout est écrit en Unicode composé (NFC).
 */
(() => {
    'use strict';
    const L = s => s.split(' ').filter(Boolean);
    const AZ = L('a b c d e f g h i j k l m n o p q r s t u v w x y z');
    const LATIN_ABBR = [
        ['ſ', 's long : un s au début ou au milieu du mot (« ſœur », « baptiſé »), jusque vers 1800'],
        ['ꝛ', 'r rond (r « en forme de 2 »), après o, b, p : « oꝛdo »'],
        ['ꝑ', 'p barré en bas = per ou par (« ꝑ » = per, « ꝑochia » = parochia)'],
        ['ꝓ', 'p avec une boucle = pro (« ꝓ » = pro)'],
        ['ꝕ', 'p à queue = prae / pre'],
        ['ꝗ', 'q barré = qui, quod (selon la phrase)'],
        ['ꝯ', 'signe en forme de 9 au début du mot = con- / com- (« ꝯjuges » = conjuges)'],
        ['ꝰ', 'petit 9 en haut, en fin de mot = -us (« filiꝰ » = filius)'],
        ['ꝝ', 'r rond barré = -rum (« eoꝝ » = eorum)'],
        ['&', 'et (esperluette ; « &c. » = et cetera)'],
        ['⁊', 'et tironien (en forme de 7)'],
        ['ę', 'e cédillé (e caudata) = ae (« ęcclesia », « filię »)'],
        ['ā', 'trait sur une voyelle = un m ou un n sauté (« Adā » = Adam, « dñs » = dominus)'],
        ['ē', 'trait sur une voyelle = un m ou un n sauté (« ēt » = ent)'],
        ['ī', 'trait sur une voyelle = un m ou un n sauté'],
        ['ō', 'trait sur une voyelle = un m ou un n sauté (« ōnia » = omnia)'],
        ['ū', 'trait sur une voyelle = un m ou un n sauté'],
    ];
    const SLONG = ['ſ', 's long (au début ou au milieu du mot), jusque vers 1800'];

    /* ── Cyrillique : [lettre, [en français, ISO 9]] ── */
    const RU = [['а', ['a', 'a']], ['б', ['b', 'b']], ['в', ['v', 'v']], ['г', ['g', 'g']], ['д', ['d', 'd']], ['е', ['e (ie)', 'e']], ['ё', ['io', 'ë']], ['ж', ['j', 'ž']], ['з', ['z', 'z']],
        ['и', ['i', 'i']], ['й', ['ï', 'j']], ['к', ['k', 'k']], ['л', ['l', 'l']], ['м', ['m', 'm']], ['н', ['n', 'n']], ['о', ['o', 'o']], ['п', ['p', 'p']], ['р', ['r', 'r']], ['с', ['s', 's']],
        ['т', ['t', 't']], ['у', ['ou', 'u']], ['ф', ['f', 'f']], ['х', ['kh', 'h']], ['ц', ['ts', 'c']], ['ч', ['tch', 'č']], ['ш', ['ch', 'š']], ['щ', ['chtch', 'ŝ']], ['ъ', ['(muet)', 'ʺ']],
        ['ы', ['y', 'y']], ['ь', ['(muet)', 'ʹ']], ['э', ['e', 'è']], ['ю', ['iou', 'û']], ['я', ['ia', 'â']]];
    const UK_EXTRA = {'г': ['h', 'g'], 'ґ': ['g', 'g̀'], 'є': ['ie', 'ê'], 'и': ['y', 'i'], 'і': ['i', 'ì'], 'ї': ['ï', 'ï'], 'е': ['e', 'e']};
    const BE_EXTRA = {'г': ['h', 'g'], 'ў': ['ou (w)', 'ŭ'], 'і': ['i', 'ì'], 'е': ['ie', 'e']};
    const BG_EXTRA = {'х': ['kh (h)', 'h'], 'щ': ['cht', 'ŝ'], 'ъ': ['ă (a)', 'ʺ'], 'ѝ': ['i', 'ì']};
    const SR_TR = {'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'đ', 'е': 'e', 'ж': 'ž', 'з': 'z', 'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj', 'м': 'm', 'н': 'n', 'њ': 'nj',
        'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'ћ': 'ć', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'č', 'џ': 'dž', 'ш': 'š'};
    const SR_ISO = {'ђ': 'đ', 'ј': 'ǰ', 'љ': 'l̂', 'њ': 'n̂', 'ћ': 'ć', 'џ': 'd̂'};
    const cyr = (letters, over = {}) => {
        const tr = {};
        for (const c of letters) {
            if (over[c]) { tr[c] = over[c]; continue; }
            const row = RU.find(r => r[0] === c);
            tr[c] = row ? row[1] : null;
        }
        return tr;
    };

    /* ── Grec : [en grec moderne, en grec ancien] ── */
    const GREEK = L('α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω');
    const GREEK_TR = {'α': ['a', 'a'], 'β': ['v', 'b'], 'γ': ['g (gh)', 'g'], 'δ': ['d (dh)', 'd'], 'ε': ['e', 'e'], 'ζ': ['z', 'z'], 'η': ['i', 'ē'], 'θ': ['th', 'th'], 'ι': ['i', 'i'],
        'κ': ['k', 'k'], 'λ': ['l', 'l'], 'μ': ['m', 'm'], 'ν': ['n', 'n'], 'ξ': ['x', 'x'], 'ο': ['o', 'o'], 'π': ['p', 'p'], 'ρ': ['r', 'r (rh)'], 'σ': ['s', 's'], 'τ': ['t', 't'],
        'υ': ['y (i)', 'y (u)'], 'φ': ['f', 'ph'], 'χ': ['ch (kh)', 'ch'], 'ψ': ['ps', 'ps'], 'ω': ['o', 'ō'], 'ς': ['s', 's']};
    const POLYTONIC = [];
    for (let cp = 0x1F00; cp <= 0x1FFF; cp++) { const c = String.fromCodePoint(cp); if (/\p{L}/u.test(c)) POLYTONIC.push(c); }

    const languages = [
        /* ══════════ Lettres latines ══════════ */
        {id: 'fr', name: 'Français', script: 'latin', prior: 100, alphabet: AZ,
            special: L('à â æ ç é è ê ë î ï ô œ ù û ü ÿ'),
            old: [SLONG, ['&', 'et (esperluette ; « &c. » = et cetera)'], ['ꝑ', 'p barré = par (« ꝑoisse » = paroisse)']],
            hints: ['Accents é è ê, et ç, œ, æ.', 'Petits mots : « le, la, les, de, du, des, et, ledit, ladite ».', 'Dans les actes : « baptisé, fils de, épouse de, parrain, marraine, inhumé ».', 'Avant 1800 : s long (ſ) et orthographe libre (« nay » pour né, « batizé »).'],
            words: L('baptisé baptisée né née fils fille épouse veuve parrain marraine décédé décédée inhumé inhumée mariage paroisse ledit ladite présent laboureur')},
        {id: 'la', name: 'Latin', script: 'latin', prior: 95, alphabet: L('a b c d e f g h i k l m n o p q r s t v x y z'),
            extra: L('j u w'), extraLabel: 'Ajoutées dans les registres (i long, u voyelle, noms germaniques) :', special: L('æ œ'), old: LATIN_ABBR,
            hints: ['Langue de la plupart des registres catholiques avant 1539 (et bien après en Alsace, Lorraine, Savoie, Comté de Nice, Belgique, Pologne…).', 'Alphabet classique de 23 lettres : i et j, u et v sont la même lettre (« Ioannes » = Joannes) ; le w ne sert qu’aux noms germaniques.', 'Mots des actes : « natus, baptizatus, filius, filia, uxor, patrinus, matrina, sepultus, obiit, anno Domini ».', 'Beaucoup d’abréviations : trait sur la lettre (« dñs » = dominus), ꝑ = per, ꝓ = pro.'],
            words: L('natus nata baptizatus baptizata baptizavi filius filia uxor patrinus matrina sepultus sepulta obiit defunctus defuncta legitimus legitima conjuges coniuges anno domini mensis parochiae ejusdem eiusdem matrimonio')},
        {id: 'oc', name: 'Occitan', script: 'latin', prior: 40, alphabet: L('a b c d e f g h i j l m n o p q r s t u v x z'),
            extra: L('k w y'), special: L('à á è é í ï ò ó ú ü ç ·'),
            hints: ['Digrammes « lh » et « nh » (filha, montanha) à la place de « ill » et « gn ».', 'Accent sur ò et ó (òme, amor) ; point du milieu « n·h », « s·h ».', 'Écrit dans des actes notariés du Midi avant 1539 ; ensuite surtout le latin et le français.', 'Mots : « filh, filha, molhèr, paire, maire, ostal, nascut ».'],
            words: L('filh filha molhèr molher paire maire ostal nascut batejat')},
        {id: 'ca', name: 'Catalan', script: 'latin', prior: 45, alphabet: AZ, special: L('à é è í ï ò ó ú ü ç ·'),
            hints: ['« l·l » avec un point du milieu (col·legi) et « ny » (Catalunya).', 'Accents ò et è ouverts, ó et é fermés ; ç.', 'Roussillon (Pyrénées-Orientales) : registres en catalan au XVIIe siècle, puis en français.', 'Mots : « fill, filla, muller, pare, mare, batejat, any ».'],
            words: L('fill filla muller pare mare batejat batejada nat nascut any')},
        {id: 'br', name: 'Breton', script: 'latin', prior: 35, alphabet: L("a b ch c'h d e f g h i j k l m n o p r s t u v w y z"),
            extra: L('q x'), special: L('ñ ù ê ü'),
            hints: ['« c’h » (comme la jota espagnole) et « zh » : Breizh, merc’h.', '« ñ » = voyelle nasale (« Breizh-Izel », « kañv »).', 'Beaucoup de k, w, z ; pas de c seul, de q ni de x.', 'Registres presque toujours en français ou en latin ; le breton se voit dans les noms et les lieux (Ker-, Plou-, Lann-).'],
            words: L("mab merc'h gwreg tad mamm ganet badezet maro intañvez")},
        {id: 'eu', name: 'Basque', script: 'latin', prior: 35, alphabet: L('a b c d e f g h i j k l m n ñ o p q r s t u v w x y z'), special: L('ñ'),
            hints: ['Groupes « tx, tz, ts » et beaucoup de k, x, z (etxea, Etxeberria).', 'Le c, q, v, w, y ne servent qu’aux mots étrangers.', 'Mots : « semea (fils), alaba (fille), emaztea (épouse), aita, ama, eta (et) ».', 'Registres en latin, espagnol ou français ; le basque est surtout dans les noms de maisons.'],
            words: L('semea alaba emaztea aita ama jaio bataiatu eta')},
        {id: 'de', name: 'Allemand et alsacien', script: 'latin', prior: 80, alphabet: AZ, special: L('ä ö ü ß'),
            old: [SLONG, ['aͤ', 'a avec un petit e au-dessus = ä (écriture gothique)'], ['oͤ', 'o avec un petit e au-dessus = ö'], ['uͤ', 'u avec un petit e au-dessus = ü'], ['ÿ', 'y tréma, souvent pour ij ou i long (« Meÿer »)']],
            hints: ['ß (eszett, « ss ») et ä, ö, ü (umlaut).', 'Noms communs avec une majuscule (Sohn, Tochter, Ehefrau).', 'Écriture gothique (Kurrent, Sütterlin) difficile à lire : e en forme de n, h à boucle.', 'Mots : « geboren, getauft, Sohn, Tochter, Ehefrau, Witwe, gestorben, begraben, Pate ». L’alsacien s’écrit très peu : actes en latin, en allemand ou en français.'],
            words: L('geboren getauft sohn tochter ehefrau eheweib witwe witwer gestorben begraben pate patin ehelich ehelicher eltern')},
        {id: 'nl', name: 'Néerlandais / flamand', script: 'latin', prior: 60, alphabet: AZ, special: L('á é ë è í ï ó ö ú ü ĳ'),
            old: [['ÿ', 'y tréma pour ij (« Pÿl »)'], SLONG],
            hints: ['« ij » très fréquent (souvent écrit comme ÿ), voyelles doublées « aa, ee, oo, uu ».', 'Tréma pour séparer deux voyelles : « België », « geërfd ».', 'Mots : « geboren, gedoopt, zoon, dochter, huisvrouw, weduwe, overleden, begraven, getuigen ».', 'Flandre et Nord : beaucoup d’actes en latin, des actes notariés en flamand.'],
            words: L('geboren gedoopt zoon dochter huisvrouw weduwe weduwnaar overleden begraven getuigen ende')},
        {id: 'en', name: 'Anglais', script: 'latin', prior: 70, alphabet: AZ, special: [],
            old: [SLONG, ['þ', 'thorn : « þe », souvent écrit « ye » = the'], ['&', 'and']],
            hints: ['Pas de lettres à accents.', 'Mots : « born, baptized, baptised, son, daughter, wife, widow, buried, married, of this parish ».', 'Abréviations : « ye » = the, « yt » = that, « Wm » = William, « Jno » = John.'],
            words: L('born baptized baptised christened son daughter wife widow widower buried married parish spinster bachelor')},
        {id: 'it', name: 'Italien', script: 'latin', prior: 75, alphabet: L('a b c d e f g h i l m n o p q r s t u v z'),
            extra: L('j k w x y'), special: L('à è é ì ò ó ù'), old: [['î', 'i circonflexe, pluriel en -ii (« principî »)'], ['j', 'j pour un i long ou entre voyelles (« Jacopo », « figlj »)'], SLONG],
            hints: ['Accent grave en fin de mot (città, perché, più).', 'Pas de j, k, w, x, y dans les mots italiens (seulement dans les mots étrangers).', 'Groupes « gli, gn, sc, zz, cc ».', 'Mots : « nato, nata, figlio, figlia, battezzato, moglie, padrino, madrina, morto, sepolto, fu » (fu = feu).'],
            words: L('nato nata figlio figlia figliuolo battezzato battezzata moglie padrino madrina morto morta sepolto sepolta vedova coniugi')},
        {id: 'es', name: 'Espagnol', script: 'latin', prior: 75, alphabet: L('a b c d e f g h i j k l m n ñ o p q r s t u v w x y z'),
            special: L('á é í ó ú ü ñ ¿ ¡'), old: [['ç', 'c cédille, jusqu’au XVIIIe siècle (« coraçon »)'], SLONG],
            hints: ['ñ (España) et accent aigu (á é í ó ú).', '« ¿ » et « ¡ » au début des questions et des exclamations.', 'Mots : « nacido, bautizado, hijo, hija, legítimo, esposa, padrinos, difunto, en la villa de ».'],
            words: L('nacido nacida bautizado bautizada bauticé hijo hija legítimo legítima esposa mujer padrinos padrino madrina difunto difunta viuda')},
        {id: 'pt', name: 'Portugais', script: 'latin', prior: 65, alphabet: AZ, special: L('á â ã à ç é ê í ó ô õ ú'),
            old: [['ü', 'u tréma (Brésil, jusqu’en 2009 : « freqüente »)'], SLONG],
            hints: ['ã et õ avec un tilde (São, João, irmãos).', '« lh » et « nh » (filho, senhor) ; ç.', 'Mots : « nascido, baptizado, filho, filha, mulher, padrinho, madrinha, freguesia, aos … dias do mês ».'],
            words: L('nascido nascida baptizado batizado baptizada filho filha mulher padrinho madrinha freguesia viúva legítimo legítima')},
        {id: 'pl', name: 'Polonais', script: 'latin', prior: 70, alphabet: L('a ą b c ć d e ę f g h i j k l ł m n ń o ó p r s ś t u w y z ź ż'),
            extra: L('q v x'), special: L('ą ć ę ł ń ó ś ź ż'),
            hints: ['ł (l barré) : propre au polonais ; ą et ę existent aussi en lituanien.', 'Groupes « sz, cz, rz, dz, ch » et beaucoup de w, z, y.', 'Mots : « urodzony, urodzona, syn, córka, ochrzczony, żona, zmarły, rodzice, świadkowie, roku Pańskiego ».', 'Selon la région et l’époque : actes en latin, en polonais, en allemand ou en russe (après 1868 dans la Pologne russe).'],
            words: L('urodzony urodzona syn córka ochrzczony ochrzczona żona małżonek małżonka zmarły zmarła rodzice świadkowie wdowa roku')},
        {id: 'cs', name: 'Tchèque', script: 'latin', prior: 55, alphabet: L('a á b c č d ď e é ě f g h ch i í j k l m n ň o ó p q r ř s š t ť u ú ů v w x y ý z ž'),
            special: L('á č ď é ě í ň ó ř š ť ú ů ý ž'),
            hints: ['ř (r et j ensemble) et ů (u rond) : propres au tchèque.', 'Petit chevron (háček) sur č, š, ž, ě, ň.', 'Mots : « narozen, syn, dcera, pokřtěn, manželka, zemřel, kmotr, léta Páně ».', 'Bohême et Moravie : actes en latin, en tchèque ou en allemand.'],
            words: L('narozen narozena narozený syn dcera pokřtěn pokřtěna manželka manžel zemřel zemřela kmotr kmotra vdova')},
        {id: 'sk', name: 'Slovaque', script: 'latin', prior: 45, alphabet: L('a á ä b c č d ď dz dž e é f g h ch i í j k l ĺ ľ m n ň o ó ô p q r ŕ s š t ť u ú v w x y ý z ž'),
            special: L('á ä č ď é í ĺ ľ ň ó ô ŕ š ť ú ý ž'),
            hints: ['ĺ, ľ, ŕ et ô : propres au slovaque.', 'Chevron (mäkčeň) sur č, š, ž, ď, ť, ň.', 'Mots : « narodený, syn, dcéra, pokrstený, manželka, zomrel, krstný otec ».', 'Avant 1918 (Haute-Hongrie) : actes en latin ou en hongrois.'],
            words: L('narodený narodená syn dcéra pokrstený pokrstená manželka manžel zomrel zomrela krstný vdova')},
        {id: 'hu', name: 'Hongrois', script: 'latin', prior: 55, alphabet: L('a á b c cs d dz dzs e é f g gy h i í j k l ly m n ny o ó ö ő p q r s sz t ty u ú ü ű v w x y z zs'),
            special: L('á é í ó ö ő ú ü ű'),
            hints: ['ő et ű (double accent) : propres au hongrois.', 'Groupes « sz, cs, gy, ny, zs » ; le nom de famille avant le prénom.', 'Mots : « született, fia, leánya, keresztelt, felesége, meghalt, keresztszülők ».', 'Avant 1895 : surtout des actes en latin.'],
            words: L('született fia leánya lánya keresztelt felesége neje meghalt elhunyt keresztszülők özvegy')},
        {id: 'ro', name: 'Roumain', script: 'latin', prior: 50, alphabet: L('a ă â b c d e f g h i î j k l m n o p q r s ș t ț u v w x y z'),
            special: L('ă â î ș ț'), old: [['ş', 's cédille, souvent écrit à la place de ș'], ['ţ', 't cédille, souvent écrit à la place de ț']],
            hints: ['ă, ș et ț : propres au roumain.', 'Mots : « născut, botezat, fiul, fiica, soția, nașul, decedat, anul ».', 'Avant 1860 environ : écrit en lettres cyrilliques ; en Transylvanie, actes en latin ou en hongrois.'],
            words: L('născut născută botezat botezată fiul fiica soția soţia nașul naşul decedat decedată văduvă anul')},
        {id: 'hr', name: 'Croate / serbe en lettres latines', script: 'latin', prior: 45, alphabet: L('a b c č ć d dž đ e f g h i j k l lj m n nj o p r s š t u v z ž'),
            extra: L('q w x y'), special: L('č ć đ š ž'),
            hints: ['đ (d barré) : croate, bosnien, serbe en lettres latines ; ć existe aussi en polonais.', 'Lettres doubles « dž, lj, nj ».', 'Mots : « rođen, kršten, sin, kći, žena, umro, kum ».', 'Avant 1900 environ : beaucoup d’actes en latin (ou en italien en Dalmatie).'],
            words: L('rođen rođena kršten krštena sin kći žena umro umrla kum kuma udovica')},
        {id: 'sl', name: 'Slovène', script: 'latin', prior: 35, alphabet: L('a b c č d e f g h i j k l m n o p r s š t u v z ž'),
            extra: L('q w x y'), special: L('č š ž'),
            hints: ['Seulement č, š, ž (pas de ć ni de đ comme en croate).', 'Mots : « rojen, krščen, sin, hči, žena, umrl, boter ».', 'Avant 1918 : actes souvent en latin ou en allemand.'],
            words: L('rojen rojena krščen krščena sin hči žena umrl umrla boter botra vdova')},
        {id: 'lt', name: 'Lituanien', script: 'latin', prior: 35, alphabet: L('a ą b c č d e ę ė f g h i į y j k l m n o p r s š t u ų ū v z ž'),
            extra: L('q w x'), special: L('ą č ę ė į š ų ū ž'),
            hints: ['ė, į et ų : propres au lituanien (ą et ę existent aussi en polonais).', 'Mots terminés en -as, -is, -us, -ė (Jonas, Petraitis).', 'Mots : « gimęs, pakrikštytas, sūnus, duktė, žmona, mirė ».', 'Avant 1918 : registres en latin, en polonais ou en russe.'],
            words: L('gimęs gimusi pakrikštytas pakrikštyta sūnus duktė žmona mirė našlė')},
        {id: 'lv', name: 'Letton', script: 'latin', prior: 30, alphabet: L('a ā b c č d e ē f g ģ h i ī j k ķ l ļ m n ņ o p r s š t u ū v z ž'),
            extra: L('q w x y'), special: L('ā č ē ģ ī ķ ļ ņ š ū ž'),
            old: [['ŗ', 'r cédille, dans l’orthographe d’avant 1946'], ['ō', 'o long, dans l’ancienne orthographe'], ['sch', 'avant 1920, orthographe à l’allemande (sch = š, tsch = č)']],
            hints: ['Lettres longues avec un trait : ā, ē, ī, ū ; ģ, ķ, ļ, ņ avec une virgule.', 'Mots : « dzimis, dzimusi, kristīts, dēls, meita, sieva, miris ».', 'Avant 1918 : registres luthériens surtout en allemand.'],
            words: L('dzimis dzimusi kristīts kristīta dēls meita sieva miris mirusi atraitne')},
        {id: 'sv', name: 'Suédois', script: 'latin', prior: 45, alphabet: L('a b c d e f g h i j k l m n o p q r s t u v w x y z å ä ö'), special: L('å ä ö'),
            old: [SLONG, ['w', 'w souvent à la place de v dans les vieux textes (« hwar »)']],
            hints: ['å, ä et ö (pas de ø ni de æ comme en danois et en norvégien).', 'Mots : « född, döpt, son, dotter, hustru, död, begravd, faddrar ».', 'Noms en -son (fils de) et -dotter (fille de).'],
            words: L('född döpt döpte son dotter hustru död döde begravd begrafven faddrar enka änka')},
        {id: 'da', name: 'Danois', script: 'latin', prior: 40, alphabet: L('a b c d e f g h i j k l m n o p q r s t u v w x y z æ ø å'), special: L('æ ø å'),
            old: [['aa', 'aa = å avant 1948 (« Aarhus »)']],
            hints: ['æ et ø, comme en norvégien ; å (écrit « aa » avant 1948).', 'Mots : « født, døbt, søn, datter, hustru, død, begravet, faddere ».', 'Noms en -sen (Jensen, Hansen).'],
            words: L('født døbt søn datter hustru død begravet faddere enke')},
        {id: 'no', name: 'Norvégien', script: 'latin', prior: 40, alphabet: L('a b c d e f g h i j k l m n o p q r s t u v w x y z æ ø å'), special: L('æ ø å'),
            old: [['aa', 'aa = å avant 1917']],
            hints: ['Mêmes lettres que le danois : æ, ø, å.', 'Avant 1900 environ, les registres sont en danois (« døbt ») ; ensuite « døpt, sønn ».', 'Mots : « født, døpt, sønn, datter, hustru, død, begravet, faddere ».'],
            words: L('født døpt sønn datter hustru død begravet faddere enke')},
        {id: 'fi', name: 'Finnois', script: 'latin', prior: 30, alphabet: L('a b c d e f g h i j k l m n o p q r s t u v w x y z å ä ö'),
            special: L('ä ö å'), extra: L('š ž'),
            hints: ['Beaucoup de ä et de ö, voyelles et consonnes doublées (Mäkinen, Virtanen).', 'Pas de b, c, f, q, w, x, z dans les mots finnois ; å seulement dans les noms suédois.', 'Avant 1880 environ, registres en suédois.', 'Mots : « syntynyt, kastettu, poika, tytär, vaimo, kuollut ».'],
            words: L('syntynyt kastettu poika tytär vaimo kuollut haudattu vanhemmat leski')},
        {id: 'is', name: 'Islandais', script: 'latin', prior: 20, alphabet: L('a á b d ð e é f g h i í j k l m n o ó p r s t u ú v x y ý þ æ ö'),
            extra: L('c q w z'), special: L('á ð é í ó ú ý þ æ ö'),
            old: [['z', 'z employé jusqu’en 1973'], ['þ', 'thorn (« th » dur), toujours en usage']],
            hints: ['ð (eth) : propre à l’islandais ; þ (thorn) aussi en vieil anglais (« þe » = the).', 'Noms en -son et -dóttir.', 'Mots : « fæddur, fædd, sonur, dóttir, kona, dáinn, skírður ».'],
            words: L('fæddur fædd sonur dóttir kona dáinn dáin skírður skírð')},
        {id: 'ga', name: 'Gaélique irlandais', script: 'latin', prior: 25, alphabet: L('a b c d e f g h i l m n o p r s t u'),
            extra: L('j k q v w x y z'), special: L('á é í ó ú'),
            old: [['ḃ', 'point sur la consonne (séimhiú) = consonne + h : ḃ = bh'], ['ċ', 'ċ = ch'], ['ḋ', 'ḋ = dh'], ['ḟ', 'ḟ = fh'], ['ġ', 'ġ = gh'], ['ṁ', 'ṁ = mh'], ['ṗ', 'ṗ = ph'], ['ṡ', 'ṡ = sh'], ['ṫ', 'ṫ = th'], ['⁊', 'et tironien = agus (et)']],
            hints: ['Seulement 18 lettres ; accent aigu (síneadh fada) sur á é í ó ú.', 'Groupes « bh, mh, dh, gh, th » et « Mac, Ó, Ní, Nic » dans les noms.', 'Registres paroissiaux surtout en latin ou en anglais.'],
            words: L('mac iníon bean rugadh baisteadh pósadh')},
        {id: 'cy', name: 'Gallois', script: 'latin', prior: 20, alphabet: L('a b c ch d dd e f ff g ng h i j l ll m n o p ph r rh s t th u w y'),
            extra: L('k q v x z'), special: L('â ê î ô û ŵ ŷ á é í ó ú ẃ ý à è ì ò ù ẁ ỳ ä ë ï ö ü ẅ ÿ'),
            hints: ['ŵ et ŷ (accent circonflexe, « to bach ») : propres au gallois.', 'w et y sont des voyelles ; « dd, ll, ff » doublés (Llanelli).', 'Registres surtout en anglais ou en latin ; le gallois dans les noms de lieux (Llan-, Aber-, Pen-).'],
            words: L('mab merch gwraig ganwyd bedyddiwyd plwyf')},
        {id: 'mt', name: 'Maltais', script: 'latin', prior: 15, alphabet: L('a b ċ d e f ġ g għ h ħ i ie j k l m n o p q r s t u v w x ż z'),
            extra: L('c y'), special: L('ċ ġ ħ ż à è ì ò ù'),
            hints: ['ħ (h barré) et « għ » : propres au maltais.', 'Points sur ċ, ġ, ż.', 'Registres anciens en latin ou en italien.'],
            words: L('twieled twieldet iben bint mara miet mietet')},
        {id: 'tr', name: 'Turc', script: 'latin', prior: 35, alphabet: L('a b c ç d e f g ğ h ı i j k l m n o ö p r s ş t u ü v y z'),
            upper: L('A B C Ç D E F G Ğ H I İ J K L M N O Ö P R S Ş T U Ü V Y Z'),
            extra: L('q w x'), special: L('ç ğ ı i ö ş ü â î û'),
            hints: ['ı (i sans point) et İ (I majuscule avec un point), ğ : propres au turc.', 'ş et ç, ö et ü.', 'Mots : « doğdu, oğlu, kızı, karısı, öldü ».'],
            words: L('doğdu doğum oğlu kızı karısı öldü vefat')},

        /* ══════════ Cyrillique ══════════ */
        {id: 'ru', name: 'Russe', script: 'cyrillic', prior: 60, alphabet: RU.map(r => r[0]), tr: cyr(RU.map(r => r[0])), trLabels: ['en français', 'ISO 9'],
            special: L('ё ъ ы э'),
            old: [['і', 'i « décimal », avant 1918 devant une voyelle (Россія) — lu i'], ['ѣ', 'iat, avant 1918 — lu e (хлѣбъ = khleb)'], ['ѳ', 'fita, avant 1918 — lu f (Ѳедоръ = Fiodor)'], ['ѵ', 'ijitsa, avant 1918, très rare — lu i'], ['ъ', 'signe dur à la fin des mots après une consonne, avant 1918 (Петръ = Piotr) — ne se lit pas']],
            hints: ['ы, э et ё ; pas de і, ї, є, ў (sauf avant 1918 : і, ѣ, ѳ, ѵ et ъ en fin de mot).', 'Mots : « родился (né), крещён (baptisé), сын, дочь, жена, умер, года ».', 'Dans la Pologne russe, à partir de 1868, les actes sont en russe.'],
            words: L('родился родилась крещён крещена сын дочь жена муж умер умерла года крестьянин вдова')},
        {id: 'uk', name: 'Ukrainien', script: 'cyrillic', prior: 45, alphabet: L('а б в г ґ д е є ж з и і ї й к л м н о п р с т у ф х ц ч ш щ ь ю я'),
            tr: cyr(L('а б в г ґ д е є ж з и і ї й к л м н о п р с т у ф х ц ч ш щ ь ю я ʼ'), UK_EXTRA), trLabels: ['en français', 'ISO 9'], special: L('ґ є і ї ʼ'),
            old: [['ʼ', 'apostrophe (м’ясо), fait partie de l’orthographe'], ['ґ', 'interdit de 1933 à 1990, remplacé alors par г']],
            hints: ['ї et є : propres à l’ukrainien ; і comme en biélorusse.', 'Pas de ы, э, ё, ъ (contrairement au russe).', 'Mots : « народився, син, дочка, дружина, помер, хрещений ».', 'Avant 1917 : registres en russe (Empire), en polonais ou en latin (Galicie autrichienne).'],
            words: L('народився народилася син дочка донька дружина помер померла хрещений хрещена вдова')},
        {id: 'be', name: 'Biélorusse', script: 'cyrillic', prior: 30, alphabet: L('а б в г д е ё ж з і й к л м н о п р с т у ў ф х ц ч ш ы ь э ю я'),
            tr: Object.assign(cyr(L('а б в г д е ё ж з і й к л м н о п р с т у ў ф х ц ч ш ы ь э ю я'), BE_EXTRA), {'ʼ': ['(sépare)', '’']}), trLabels: ['en français', 'ISO 9'], special: L('ў і ё ы э ʼ'),
            hints: ['ў (u bref) : propre au biélorusse ; « дж » et « дз » se lisent dj et dz.', 'і à la place du и russe (pas de и, щ ni ъ).', 'Mots : « нарадзіўся, сын, дачка, жонка, памёр ».', 'Avant 1918 : registres en russe, en polonais ou en latin.'],
            words: L('нарадзіўся нарадзілася сын дачка жонка памёр памерла')},
        {id: 'bg', name: 'Bulgare', script: 'cyrillic', prior: 30, alphabet: L('а б в г д е ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ь ю я'),
            tr: cyr(L('а б в г д е ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ь ю я ѝ'), BG_EXTRA), trLabels: ['en français', 'ISO 9'], special: L('ъ щ ѝ'),
            old: [['ѣ', 'iat, avant 1945 — lu ia ou e'], ['ѫ', 'grand yus, avant 1945 — lu ă'], ['ъ', 'signe dur en fin de mot, avant 1945']],
            hints: ['ъ se lit « ă » au milieu des mots (България = Bălgaria) ; ѝ = « et lui ».', 'Pas de ы, э, ё (contrairement au russe).', 'Mots : « роден, син, дъщеря, съпруга, починал ».'],
            words: L('роден родена син дъщеря съпруга починал починала кръстен вдовица')},
        {id: 'sr', name: 'Serbe en cyrillique', script: 'cyrillic', prior: 30, alphabet: L('а б в г д ђ е ж з и ј к л љ м н њ о п р с т ћ у ф х ц ч џ ш'),
            tr: Object.fromEntries(L('а б в г д ђ е ж з и ј к л љ м н њ о п р с т ћ у ф х ц ч џ ш').map(c => [c, [SR_TR[c], SR_ISO[c] || ({'ж': 'ž', 'х': 'h', 'ц': 'c', 'ч': 'č', 'ш': 'š'}[c] || SR_TR[c])]])), trLabels: ['latin serbe', 'ISO 9'],
            special: L('ђ ј љ њ ћ џ'),
            hints: ['ђ, ј, љ, њ, ћ, џ : propres au serbe (et au macédonien pour ј, љ, њ, џ).', 'Pas de й, ы, щ, ъ, ь, ю, я.', 'La colonne « en français » donne l’alphabet serbe en lettres latines, qui correspond lettre pour lettre.', 'Mots : « рођен, син, кћи, жена, умро, кум ».'],
            words: L('рођен рођена син кћи ћерка жена умро умрла кум кршен крштен')},

        /* ══════════ Grec ══════════ */
        {id: 'el', name: 'Grec moderne', script: 'greek', prior: 40, alphabet: GREEK, tr: Object.fromEntries([...GREEK, 'ς'].map(c => [c, GREEK_TR[c]])), trLabels: ['grec moderne', 'grec ancien'],
            special: L('ά έ ή ί ό ύ ώ ϊ ϋ ΐ ΰ ς'),
            hints: ['Un seul accent (tonos) : ά έ ή ί ό ύ ώ ; ς en fin de mot.', 'Depuis 1982 ; avant, écrit avec les esprits et les accents du polytonique.', 'Mots : « γεννήθηκε, βαπτίστηκε, γιος, κόρη, σύζυγος, πέθανε » ; dans les vieux actes : « υιός, θυγάτηρ, ετών ».', 'Translittération usuelle : β = v, η = i, υ = y, χ = ch, ου = ou, μπ = b, ντ = d.'],
            words: L('γεννήθηκε βαπτίστηκε γιος κόρη σύζυγος πέθανε υιός θυγάτηρ ετών')},
        {id: 'grc', name: 'Grec ancien / polytonique', script: 'greek', prior: 30, alphabet: GREEK, tr: Object.fromEntries([...GREEK, 'ς'].map(c => [c, [GREEK_TR[c][1], GREEK_TR[c][0]]])), trLabels: ['grec ancien', 'grec moderne'],
            special: L('ἀ ἁ ἄ ἅ ὰ ᾶ ᾳ ᾴ ᾷ ἐ ἑ ἠ ἡ ῆ ῃ ἰ ἱ ῖ ὀ ὁ ὐ ὑ ῦ ὠ ὡ ῶ ῳ ῥ ϊ ς'),
            matchExtra: POLYTONIC.concat(L('ά έ ή ί ό ύ ώ ϊ ϋ ΐ ΰ')),
            old: [['ϝ', 'digamma (w), grec archaïque, aussi le chiffre 6'], ['ϛ', 'stigma = στ, sert de chiffre 6'], ['ϙ', 'koppa archaïque (q)'], ['ϟ', 'koppa, chiffre 90'], ['ϡ', 'sampi, chiffre 900'], ['ϲ', 'sigma lunaire (en forme de c), manuscrits et icônes']],
            hints: ['Esprit doux (ἀ) ou rude (ἁ = h devant la voyelle) au début des mots qui commencent par une voyelle.', 'Trois accents : aigu, grave (ὰ), circonflexe (ᾶ) ; iota souscrit sous α, η, ω (ᾳ ῃ ῳ).', 'Registres orthodoxes et pierres tombales grecques avant 1982 ; textes byzantins.', 'Translittération : η = ē, ω = ō, φ = ph, χ = ch, ῥ = rh, esprit rude = h (Ὅμηρος = Homēros).'],
            words: L('υἱός θυγάτηρ ἐβαπτίσθη ἔτους ἐκοιμήθη σύζυγος')},

        /* ══════════ Hébreu ══════════ */
        {id: 'he', name: 'Hébreu', script: 'hebrew', prior: 30, alphabet: L('א ב ג ד ה ו ז ח ט י כ ל מ נ ס ע פ צ ק ר ש ת'), stripMarks: true, trLabels: ['usuelle', 'savante'],
            tr: {'א': ['(muet)', 'ʾ'], 'ב': ['b, v', 'b'], 'ג': ['g', 'g'], 'ד': ['d', 'd'], 'ה': ['h', 'h'], 'ו': ['v, o, ou', 'w'], 'ז': ['z', 'z'], 'ח': ['kh', 'ḥ'], 'ט': ['t', 'ṭ'], 'י': ['y, i', 'y'],
                'כ': ['k, kh', 'k'], 'ך': ['kh (finale)', 'k'], 'ל': ['l', 'l'], 'מ': ['m', 'm'], 'ם': ['m (finale)', 'm'], 'נ': ['n', 'n'], 'ן': ['n (finale)', 'n'], 'ס': ['s', 's'], 'ע': ['(muet)', 'ʿ'],
                'פ': ['p, f', 'p'], 'ף': ['f (finale)', 'p'], 'צ': ['ts', 'ṣ'], 'ץ': ['ts (finale)', 'ṣ'], 'ק': ['k', 'q'], 'ר': ['r', 'r'], 'ש': ['ch, s', 'š'], 'ת': ['t', 't'],
                '׳': ['(abréviation)', '׳'], '״': ['(abréviation)', '״']},
            special: L('ך ם ן ף ץ ׳ ״'),
            hints: ['S’écrit de droite à gauche ; 22 lettres, sans voyelles (les points dessous sont facultatifs).', 'Cinq lettres changent de forme en fin de mot : ך ם ן ף ץ.', 'Sur les tombes : « פ״נ » (ici repose), « תנצב״ה » (que son âme soit liée au faisceau de la vie), « בן » (fils de), « בת » (fille de).', 'Les dates sont en calendrier juif (voir « Convertir une date »), écrites avec des lettres-chiffres (תרמ״ה = 5645).'],
            words: L('נולד נולדה בן בת אשת נפטר נפטרה פ״נ פ"נ תנצב״ה ז״ל')},
        {id: 'yi', name: 'Yiddish', script: 'hebrew', prior: 30, stripMarks: true, trLabels: ['en français', 'YIVO'],
            alphabet: L('א אַ אָ ב בֿ ג ד ה ו וּ װ ױ ז ח ט י יִ ײ ײַ כּ כ ך ל מ ם נ ן ס ע פּ פֿ ף צ ץ ק ר ש שׂ תּ ת'),
            tr: {'א': ['(muet)', '—'], 'אַ': ['a', 'a'], 'אָ': ['o', 'o'], 'ב': ['b', 'b'], 'בֿ': ['v', 'v'], 'ג': ['g', 'g'], 'ד': ['d', 'd'], 'ה': ['h', 'h'], 'ו': ['ou', 'u'], 'וּ': ['ou', 'u'],
                'װ': ['v', 'v'], 'ױ': ['oï', 'oy'], 'ז': ['z', 'z'], 'ח': ['kh', 'kh'], 'ט': ['t', 't'], 'י': ['i, y', 'i, y'], 'יִ': ['i', 'i'], 'ײ': ['eï', 'ey'], 'ײַ': ['aï', 'ay'],
                'כּ': ['k', 'k'], 'כ': ['kh', 'kh'], 'ך': ['kh (finale)', 'kh'], 'ל': ['l', 'l'], 'מ': ['m', 'm'], 'ם': ['m (finale)', 'm'], 'נ': ['n', 'n'], 'ן': ['n (finale)', 'n'], 'ס': ['s', 's'],
                'ע': ['è', 'e'], 'פּ': ['p', 'p'], 'פֿ': ['f', 'f'], 'ף': ['f (finale)', 'f'], 'צ': ['ts', 'ts'], 'ץ': ['ts (finale)', 'ts'], 'ק': ['k', 'k'], 'ר': ['r', 'r'], 'ש': ['ch', 'sh'],
                'שׂ': ['s', 's'], 'תּ': ['t', 't'], 'ת': ['s', 's']},
            special: L('אַ אָ וּ װ ױ ײ ײַ יִ פּ פֿ'),
            hints: ['Mêmes lettres que l’hébreu, mais avec les voyelles écrites : אַ (a), אָ (o), ע (e), י (i), ו (ou).', 'Lettres doubles propres au yiddish : װ (v), ױ (oï), ײ (eï), ײַ (aï).', 'Translittération du YIVO (colonne savante) ; les mots d’origine hébraïque gardent l’orthographe hébraïque.', 'Mots : « געבוירן (né), זון (fils), טאָכטער (fille), װײַב (épouse), געשטאָרבן (mort) ».'],
            words: L('געבוירן געבױרן זון טאָכטער טאכטער װײַב ווייב געשטאָרבן געשטארבן')},

        /* ══════════ Arabe ══════════ */
        {id: 'ar', name: 'Arabe', script: 'arabic', prior: 35, stripMarks: true, trLabels: ['en français', 'savante'], alphabet: L('ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي'),
            tr: {'ا': ['a, â', 'ā'], 'ب': ['b', 'b'], 'ت': ['t', 't'], 'ث': ['th', 'ṯ'], 'ج': ['dj', 'ǧ'], 'ح': ['h', 'ḥ'], 'خ': ['kh', 'ḫ'], 'د': ['d', 'd'], 'ذ': ['dh', 'ḏ'], 'ر': ['r', 'r'],
                'ز': ['z', 'z'], 'س': ['s', 's'], 'ش': ['ch', 'š'], 'ص': ['s', 'ṣ'], 'ض': ['d', 'ḍ'], 'ط': ['t', 'ṭ'], 'ظ': ['z', 'ẓ'], 'ع': ['(muet)', 'ʿ'], 'غ': ['gh', 'ġ'], 'ف': ['f', 'f'],
                'ق': ['q, k', 'q'], 'ك': ['k', 'k'], 'ل': ['l', 'l'], 'م': ['m', 'm'], 'ن': ['n', 'n'], 'ه': ['h', 'h'], 'و': ['w, ou', 'w, ū'], 'ي': ['y, i', 'y, ī'],
                'ء': ['(coup de glotte)', 'ʾ'], 'ة': ['a (at)', 'a, at'], 'ى': ['a', 'ā'], 'أ': ['a', 'ʾa'], 'إ': ['i', 'ʾi'], 'آ': ['â', 'ʾā'], 'ؤ': ['ou', 'ʾ'], 'ئ': ['i', 'ʾ'],
                'پ': ['p', 'p'], 'چ': ['tch', 'č'], 'ژ': ['j', 'ž'], 'گ': ['g', 'g'], 'ڤ': ['v', 'v'], 'ڨ': ['g', 'g']},
            special: L('ء ة ى أ إ آ ؤ ئ'),
            old: [['پ', 'p : persan, turc ottoman, ourdou'], ['چ', 'tch : persan, turc ottoman'], ['ژ', 'j : persan, turc ottoman'], ['گ', 'g : persan, turc ottoman'], ['ڤ', 'v : Maghreb (noms et mots étrangers)'], ['ڨ', 'g : Algérie, Tunisie']],
            hints: ['S’écrit de droite à gauche, lettres attachées : chaque lettre change de forme selon sa place dans le mot (montrée ici seule).', 'Les voyelles courtes ne sont presque jamais écrites.', 'Mots : « ابن (ibn, fils de), بنت (bint, fille de), زوجة (épouse), ولد (né), توفي (décédé) ».', 'Avant 1928, le turc ottoman utilise ces lettres, plus پ چ ژ گ.'],
            words: L('ابن بن بنت زوجة ولد توفي توفيت')},
    ];

    /* ── Clavier Cyrillique et grec : groupes de touches (minuscules ; ⇧ donne les majuscules) ── */
    const keyboard = {
        cyrillic: [
            {title: 'Russe', keys: RU.map(r => r[0])},
            {title: 'Lettres ukrainiennes', keys: L('ґ є і ї ʼ')},
            {title: 'Lettre biélorusse', keys: L('ў')},
            {title: 'Lettres serbes', keys: L('ђ ј љ њ ћ џ')},
            {title: 'Lettres bulgares', keys: L('ѝ ѫ')},
            {title: 'Avant 1918 (russe ancien)', keys: L('ѣ і ѳ ѵ ъ')},
        ],
        greek: [
            {title: 'Grec', keys: GREEK.concat('ς')},
            {title: 'Accents et esprits (s’ajoutent à la lettre avant le curseur)', marks: [
                ['\u0301', 'accent aigu (tonos, oxia)', '΄'], ['\u0300', 'accent grave (varia)', '`'], ['\u0342', 'accent circonflexe (périspomène)', '῀'],
                ['\u0313', 'esprit doux', '᾿'], ['\u0314', 'esprit rude (= h)', '῾'], ['\u0345', 'iota souscrit', 'ͺ'], ['\u0308', 'tréma (dialytika)', '¨']]},
            {title: 'Lettres anciennes', keys: L('ϝ ϛ ϙ ϟ ϡ ϲ')},
        ],
    };
    const names = {
        'а': 'a', 'б': 'bé', 'в': 'vé', 'г': 'gué', 'д': 'dé', 'е': 'ié', 'ё': 'io', 'ж': 'jé', 'з': 'zé', 'и': 'i', 'й': 'i bref', 'к': 'ka', 'л': 'el', 'м': 'em', 'н': 'en', 'о': 'o',
        'п': 'pé', 'р': 'er', 'с': 'ès', 'т': 'té', 'у': 'ou', 'ф': 'ef', 'х': 'kha', 'ц': 'tsé', 'ч': 'tché', 'ш': 'cha', 'щ': 'chtcha', 'ъ': 'signe dur', 'ы': 'y (yery)', 'ь': 'signe mou',
        'э': 'è', 'ю': 'iou', 'я': 'ia', 'ґ': 'gué (ukrainien)', 'є': 'iè (ukrainien)', 'і': 'i (ukrainien, biélorusse, russe d’avant 1918)', 'ї': 'ïi (ukrainien)', 'ʼ': 'apostrophe (ukrainien, biélorusse)',
        'ў': 'u bref (biélorusse)', 'ђ': 'djé (serbe)', 'ј': 'jot (serbe)', 'љ': 'lié (serbe)', 'њ': 'nié (serbe)', 'ћ': 'tché doux (serbe)', 'џ': 'djé dur (serbe)', 'ѝ': 'i accent grave (bulgare)',
        'ѫ': 'grand yus (bulgare d’avant 1945)', 'ѣ': 'iat (avant 1918)', 'ѳ': 'fita (avant 1918)', 'ѵ': 'ijitsa (avant 1918)',
        'α': 'alpha', 'β': 'bêta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'ζ': 'zêta', 'η': 'êta', 'θ': 'thêta', 'ι': 'iota', 'κ': 'kappa', 'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi',
        'ο': 'omicron', 'π': 'pi', 'ρ': 'rhô', 'σ': 'sigma', 'ς': 'sigma final', 'τ': 'tau', 'υ': 'upsilon', 'φ': 'phi', 'χ': 'khi', 'ψ': 'psi', 'ω': 'oméga',
        'ϝ': 'digamma', 'ϛ': 'stigma', 'ϙ': 'koppa archaïque', 'ϟ': 'koppa', 'ϡ': 'sampi', 'ϲ': 'sigma lunaire',
    };
    /* Translittération des lettres du clavier qui ne sont dans aucune table de langue ci-dessus */
    const keyTr = {'ѣ': ['e', 'ě'], 'ѳ': ['f', 'f̀'], 'ѵ': ['i', 'ỳ'], 'ѫ': ['ă', 'ǎ'], 'ʼ': ['(sépare)', '’'], 'ϝ': ['w', 'w'], 'ϛ': ['st', 'st'], 'ϙ': ['q', 'q'], 'ϟ': ['q', 'q'], 'ϡ': ['ss', 'ss'], 'ϲ': ['s', 's']};

    window.LCNDA_ALPHABETS = {languages, keyboard, names, keyTr, scripts: {latin: 'Lettres latines', cyrillic: 'Cyrillique', greek: 'Grec', hebrew: 'Hébreu', arabic: 'Arabe'}};
})();
