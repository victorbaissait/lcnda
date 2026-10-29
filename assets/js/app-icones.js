/* LCNDA — L4 « Grille d'icônes » (harmonisation L validée, docs/design/harmonisation-L.html).
 * Mode d'emploi : docs/UI.md, « L4 Grille d'icônes ».
 *
 * Dès qu'un choix dépasse 12 icônes (ou 12 fonds), une grille avec case C1 (nom + mots en plus), pastilles C5 avec le
 * nombre (« Tout (75) », « 🕘 Récentes »…), récentes d'abord, vignettes 74 px (104 px pour les fonds), flèches / Entrée /
 * Échap, « Aucune » quand ça a un sens ; choisi → la pastille du menu de choix (« ✎ Changer », « × »).
 *
 *   UI.iconPicker({anchor, set, items, groups, value, emoji, allowNone, noneLabel, title, what, onPick(v, item)})
 *       items : [{v, g (signe), l (nom), k (mots en plus), grp, sub, img}] · groups : [{id, label, icon}]
 *       emoji : true → « 😀 Tous les emojis » en dernier (recherche en français : « coeur », « bateau », « chien »)
 *   UI.iconField({name, value, set, …}) → l'élément (une case cachée name=… garde la valeur)
 *   Habillage tout seul (rien à appeler) :
 *     <select data-ui-icons="event">               (le menu reste dessous, caché : ses écouteurs « change » marchent)
 *     un menu des fonds de carte (mapBackgroundSelectHtml) → vignettes des fonds
 *     <input class="h-be-icon"> / <input data-ui-icon="emoji|<jeu>"> → pastille + grille ; la case garde la valeur
 *   UI.registerIconSet(id, {items, groups, emoji, allowNone, what}) pour un jeu d'icônes propre à un outil.
 *   data-ui-off sur un parent : pas d'habillage.
 */
(() => {
    'use strict';
    const UI = window.LCNDA_UI = window.LCNDA_UI || {};
    const A = () => window.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
    const fire = (el, type) => el.dispatchEvent(new Event(type, {bubbles: true}));
    const isOff = el => !!el.closest?.('[data-ui-off]');
    const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
    const SKIN = /[\u{1F3FB}-\u{1F3FF}]/u;
    const plural = (n, one, many) => `${Number(n).toLocaleString('fr-FR')} ${Math.abs(n) < 2 ? one : (many || one + 's')}`;

    /* ═════ Récentes (partagées par tous les outils du même jeu) ═════ */
    const RECENT = 'genealogie-recent-icons';
    const readRecent = () => { try { const o = JSON.parse(localStorage.getItem(RECENT) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
    const recentOf = key => { const a = readRecent()[key]; return Array.isArray(a) ? a.map(String).slice(0, 12) : []; };
    const remember = (key, v) => { if (!key || v === '' || v == null) return; const o = readRecent(); o[key] = [String(v), ...recentOf(key).filter(x => x !== String(v))].slice(0, 12); try { localStorage.setItem(RECENT, JSON.stringify(o)); } catch (_) {} };
    UI.recentIcons = recentOf;

    /* ═════ Les noms des emojis en français (pour chercher « coeur », « bateau », « chien ») ═════ */
    const FR_RAW = '😀 sourire content|😂 rire larmes|😊 sourire|😍 amoureux coeur|🥰 amour|😢 triste larme|😭 pleurer|😡 colère fâché|😴 dormir sommeil|🤔 réfléchir|😎 lunettes de soleil|🥳 fête anniversaire|😇 ange|🤗 câlin|👋 bonjour main|👍 bravo pouce|🙏 merci prière|👏 applaudir|💪 force|✋ main|👌 d accord|'
        + '👪 famille|👨‍👩‍👧‍👦 famille enfants|👶 bébé naissance|🧒 enfant|👧 fille|👦 garçon|🧑 personne|👩 femme|👨 homme|👵 grand-mère mamie|👴 grand-père papi|🧓 personne âgée|🤰 femme enceinte grossesse|🤱 allaitement|👰 mariée mariage|🤵 marié mariage|'
        + '💍 bague alliance mariage|💒 mariage église|💐 bouquet fleurs|💌 lettre d amour|💕 coeurs|💖 coeur brillant|❤️ coeur rouge amour|🧡 coeur orange|💛 coeur jaune|💚 coeur vert|💙 coeur bleu|💜 coeur violet|🤎 coeur marron|🖤 coeur noir deuil|🤍 coeur blanc|💔 coeur brisé divorce|🫶 coeur mains|🤝 poignée de main accord|'
        + '🎂 gâteau anniversaire naissance|🎁 cadeau|🎉 fête|🎊 confettis fête|🍼 biberon bébé|🧸 ours en peluche jouet|👼 angelot baptême|🕊️ colombe paix|🕊 colombe paix|✝️ croix chrétien|⚰️ cercueil décès|🪦 tombe sépulture décès|🕯️ bougie souvenir|🕯 bougie souvenir|🌹 rose fleur|🥀 fleur fanée deuil|'
        + '🏠 maison|🏡 maison jardin|🏘️ maisons village|🏚️ maison abandonnée ruine|🏰 château|🏯 château japonais|⛪ église religion|🕌 mosquée|🕍 synagogue|🏛️ monument musée|🏛 monument musée|🏫 école|🏥 hôpital|🏭 usine|🏪 magasin boutique|🏦 banque|🏨 hôtel|🏢 immeuble bureau|🗼 tour|🌉 pont|⛰️ montagne|🏔️ montagne neige|🌋 volcan|🏕️ camping|🏖️ plage|🏝️ île|🌾 blé champ moisson|🌲 sapin forêt|🌳 arbre généalogique|🌴 palmier|🌻 tournesol|⛲ fontaine|⛺ tente|🧱 brique mur|🚪 porte|🪟 fenêtre|🛏️ lit|🪑 chaise|🗺️ carte|🗺 carte|🧭 boussole|📍 repère lieu épingle|📌 punaise|🚩 drapeau|🌍 terre monde europe afrique|🌎 terre monde amérique|🌏 terre monde asie|🌐 globe internet|🏙️ ville|'
        + '🧑‍🌾 agriculteur paysan|👨‍🌾 agriculteur paysan|👩‍🌾 agricultrice paysanne|🚜 tracteur ferme|🐄 vache|🐑 mouton|🐴 cheval|🐓 coq poule|🍇 raisin vigne vigneron|🍷 vin|🧑‍🍳 cuisinier|🍞 pain boulanger|🥖 baguette pain|🧀 fromage|🐟 poisson pêcheur|🧑‍🔧 mécanicien|🔨 marteau|🪚 scie menuisier|🪓 hache bûcheron|⚒️ marteaux mineur|🛠️ outils|⛏️ pioche mine|🔧 clé outil|⚙️ engrenage réglages|🪵 bois|🧑‍🏭 ouvrier usine|🧵 fil couture|🪡 aiguille couture|🧶 laine tricot|👗 robe|👔 cravate|👞 chaussure cordonnier|🎩 chapeau haut-de-forme|🧑‍⚕️ médecin|👩‍⚕️ médecin femme|⚕️ médecine santé|💊 médicament|🩺 stéthoscope médecin|🧑‍🏫 professeur instituteur|🎓 diplôme école|📚 livres|✒️ plume écriture|🧑‍⚖️ juge|⚖️ justice balance|✈️ avion voyage|⚓ ancre marin|🚢 bateau navire émigration|🎣 pêche|🧑‍🚒 pompier|🚒 camion pompiers|👮 policier gendarme|💂 garde soldat|🕵️ détective enquête|🧑‍🎨 artiste peintre|🎨 peinture palette|🎭 théâtre|🎻 violon|🎹 piano|🎺 trompette|🎷 saxophone|🥁 tambour|🎤 micro chanteur|📷 appareil photo|🖋️ stylo plume|💼 travail métier mallette|💰 argent sac|🧑‍💼 employé bureau|🧑‍🔬 scientifique|🧑‍💻 informaticien|'
        + '🎖️ médaille militaire|🏅 médaille|🥇 or premier|🥈 argent deuxième|🥉 bronze troisième|🏆 coupe trophée|🎗️ ruban souvenir|⚔️ épées guerre|🗡️ épée|🛡️ bouclier|🪖 casque militaire soldat|🔫 pistolet|💣 bombe|🏹 arc|✊ poing|✉️ enveloppe lettre courrier|📯 cor|🚂 locomotive train|🚃 wagon train|🚁 hélicoptère|⛓️ chaînes prison|🔒 cadenas|🔓 cadenas ouvert|🗝️ clé ancienne|🏳️ drapeau blanc|🏴 drapeau noir|📜 parchemin acte|📃 page|📰 journal presse|🗞️ journal|🔥 feu|💥 explosion|'
        + '📄 document page|📑 onglets|📋 presse-papiers liste|🗂️ classeur|📁 dossier|📂 dossier ouvert|🗃️ boîte fiches|🗄️ armoire archives|🗒️ bloc-notes|🗓️ calendrier|📅 calendrier date|📆 agenda|📒 carnet|📓 cahier|📔 carnet décoré|📕 livre rouge|📗 livre vert|📘 livre bleu|📙 livre orange|📖 livre ouvert|🔖 marque-page|🏷️ étiquette|📨 lettre reçue|📧 courriel|📮 boîte aux lettres|📝 note écrire|✏️ crayon|🖊️ stylo|🖌️ pinceau|📎 trombone|📏 règle|📐 équerre|🔍 loupe chercher|🔎 loupe|🧾 reçu facture|🪪 carte d identité|💳 carte bancaire|📸 photo flash|📹 caméra|🎥 caméra cinéma|🎞️ pellicule film|📽️ projecteur|🖼️ tableau cadre image|🖼 tableau cadre image|🎙️ micro radio|📻 radio|📺 télévision|📼 cassette vidéo|💾 disquette|💿 cd disque|🖨 imprimante|💻 ordinateur|📱 téléphone portable|☎️ téléphone|📞 combiné téléphone|🗳️ urne vote élection|'
        + '⛵ voilier bateau|🛶 canoë|🚗 voiture|🚌 bus|🚲 vélo|🏍️ moto|🐎 cheval course|🐪 chameau|🚀 fusée|🧳 valise voyage|🎒 sac à dos|🛂 passeport douane|🎫 billet|🛤️ voie ferrée|🚉 gare|'
        + '⚽ football|🏀 basket|🏉 rugby|🎾 tennis|🚴 cycliste vélo|🏊 nageur natation|🏇 course hippique|⛷️ ski|♟️ échecs|🎲 dé jeu|🃏 carte joker|🎯 cible|🎮 jeu vidéo|🧩 puzzle pièce|🎪 cirque chapiteau|🎠 manège|🎬 clap cinéma film|🎵 musique note|🎶 musique notes|🎼 partition|🎸 guitare|🪗 accordéon|💃 danseuse danse|🕺 danseur danse|🥂 trinquer champagne|🍽️ repas|☕ café|🍰 gâteau|💉 seringue vaccin|🩹 pansement|🦷 dent|👓 lunettes|♿ fauteuil roulant handicap|'
        + '🌸 fleur cerisier|🌼 fleur|🌷 tulipe|🌺 hibiscus|🍀 trèfle chance|☘️ trèfle|🍂 feuilles automne|🍁 érable feuille|🌿 herbe plante|🌱 pousse|🌵 cactus|🍄 champignon|🍎 pomme|🍐 poire|🍊 orange|🍋 citron|🍒 cerises|🍓 fraise|🥔 pomme de terre|🥕 carotte|🌽 maïs|🐶 chien|🐕 chien|🐱 chat|🐈 chat|🐭 souris|🐰 lapin|🦊 renard|🐻 ours|🐖 cochon|🐷 cochon|🐐 chèvre|🦆 canard|🦢 cygne|🦉 hibou chouette|🐦 oiseau|🦅 aigle|🐝 abeille|🐞 coccinelle|🦋 papillon|🐌 escargot|🐠 poisson tropical|🦀 crabe|🐢 tortue|🐸 grenouille|🦌 cerf|🐗 sanglier|🐺 loup|🐾 pattes animal|🐘 éléphant|🦁 lion|🐯 tigre|🐒 singe|🦄 licorne|🐍 serpent|🐬 dauphin|🐳 baleine|🐧 manchot pingouin|🦜 perroquet|🐔 poule|🦃 dinde|☀️ soleil|⛅ nuage soleil|🌧️ pluie|⛈️ orage|❄️ neige flocon|☃️ bonhomme de neige|🌈 arc-en-ciel|🌙 lune|⭐ étoile|🌟 étoile brillante|💧 goutte eau|🌊 vague mer|'
        + '👑 couronne roi reine|💎 diamant|🔔 cloche|📢 haut-parleur|🎧 casque|🔋 pile|🔌 prise|🧮 boulier calcul|⚠️ attention|⛔ interdit|🚫 interdit|♻️ recyclage|✅ coche fait|❌ croix|❓ question|❗ exclamation|💯 cent|🔴 rond rouge|🟢 rond vert|🔵 rond bleu|⚜️ fleur de lys blason|☮️ paix|☯️ yin yang|✡️ étoile de david|☪️ croissant islam|🕉️ om|⚛️ atome science|♀️ femme|♂️ homme|➕ plus|🔣 symboles|🏁 drapeau damier arrivée|🏳️‍🌈 drapeau arc-en-ciel|🏴‍☠️ pirate|🎌 drapeaux|🇫🇷 france|🇧🇪 belgique|🇨🇭 suisse|🇨🇦 canada|🇮🇹 italie|🇪🇸 espagne|🇩🇪 allemagne|🇬🇧 royaume-uni angleterre|🇺🇸 états-unis amérique|🇵🇹 portugal|🇵🇱 pologne|🇩🇿 algérie|🇲🇦 maroc|🇹🇳 tunisie|🇱🇺 luxembourg|🇳🇱 pays-bas|🇮🇪 irlande';
    const FR = {};
    FR_RAW.split('|').forEach(s => { const i = s.indexOf(' '); if (i > 0) { const e = s.slice(0, i), w = s.slice(i + 1).trim(); if (!FR[e]) FR[e] = w; } });
    const frName = e => { const w = FR[e] || FR[e.replace(/️/g, '')] || FR[e + '️']; return w || ''; };
    const TWO = /^(coeur|pomme|drapeau|carte|fleur|maison|maisons|livre|rond|étoile|terre|bonhomme|poignée|boîte|appareil|lettre|personne|femme|grand-mère|grand-père|chapeau|arc|clé|tour|bloc|marque|presse|haut|fauteuil|course|jeu|camion|voie|feuilles|sac|pellicule|cassette|carnet|trèfle|médaille|croix|ours|poisson|bébé|ville|casque)$/;
    const nameOf = e => {
        const w = frName(e).split(' ').filter(Boolean); if (!w.length) return '';
        let n = TWO.test(w[0]) && w[1] ? 2 : 1;
        if (/^(d|de|du|des|en|à|au)$/.test(w[n] || '') && w[n + 1]) n += 2;
        const t = w.slice(0, n).join(' ').replace(/\bd (?=[aeiouyhéè])/g, 'd’');
        return t.charAt(0).toUpperCase() + t.slice(1);
    };
    UI.emojiName = nameOf;

    const EMOJI_GROUP_ICONS = {Visages: '😀', Personnes: '👋', Famille: '👪', 'Maison et lieux': '🏡', 'Métiers': '🧑‍🌾', 'Guerre et mémoire': '🎖️', Documents: '📜', Voyages: '🚢', 'Loisirs et santé': '⚽', 'Nature et animaux': '🌸', Objets: '👓', Symboles: '🔣', Drapeaux: '🏳️', Animaux: '🐾'};
    let emojiCache = null;
    function emojiItems() {
        if (emojiCache) return emojiCache;
        const src = window.LCNDA_EXT?.EMOJI_GROUPS;
        const groups = [], items = [], seen = new Set();
        const list = src && typeof src === 'object' ? Object.entries(src) : [['Emojis', Object.keys(FR).join(' ')]];
        list.forEach(([g, s]) => {
            const id = 'emoji:' + g; groups.push({id, label: g, icon: EMOJI_GROUP_ICONS[g] || '😀'});
            String(s).split(' ').filter(Boolean).forEach(e => {
                if (SKIN.test(e)) return; // les teintes de peau : on les colle dans la case de recherche si besoin
                items.push({v: e, g: e, l: nameOf(e), k: frName(e) + ' ' + g, grp: id, dup: seen.has(e)});
                seen.add(e);
            });
        });
        if (src) emojiCache = {groups, items};
        return {groups, items};
    }

    /* ═════ Jeux d'icônes ═════ */
    const SETS = UI.ICON_SETS = UI.ICON_SETS || {};
    UI.registerIconSet = (id, def) => { SETS[id] = def; };

    // Types d'événements : les valeurs restent celles d'app.js (EVENT_ICON_GROUPS) ; ici seulement des rubriques et des mots
    const EV = {
        vie: ['👪', 'Vie et famille', 'star cross plus infinity rings house hash coffin urn flower florette florette2 shamrock'],
        rel: ['⛪', 'Religion et noblesse', 'church churchBuilding fleur'],
        trav: ['💼', 'Travail et société', 'scale sword mail pen gear hammerPick pick telephone scissors atom benzene medical hermes shield chains'],
        voy: ['🚢', 'Voyages et lieux', 'anchor helm airplane comet target flag umbrella'],
        temps: ['☼', 'Temps et nature', 'clock hourglass sun moon bolt music'],
        forme: ['◆', 'Formes et repères', 'diamond circle square triangle starOutline hexagon pentagon starFilled starFilled2 diamondX hexagonFull circledStar pinwheelStar asterisk check cross2 checkbox checkboxX arrow commandKey'],
        art: ['🎨', 'Artistique', 'camera art book movie chisel mask poem play shape dance stage'],
    };
    const EV_WORDS = {star: 'naissance étoile', cross: 'décès mort croix', plus: 'baptême inhumation croix', infinity: 'union mariage infini', rings: 'mariage anneaux alliance', house: 'résidence maison domicile', hash: 'recensement dièse numéro',
        fleur: 'blason noblesse lys', church: 'religieux croix', churchBuilding: 'église paroisse baptême communion', coffin: 'inhumation cercueil sépulture', urn: 'crémation urne', flag: 'drapeau', sword: 'militaire armée guerre soldat', anchor: 'ancre marin bateau',
        scale: 'justice balance tribunal procès notaire', mail: 'courrier lettre', pen: 'note écrire', gear: 'administratif', airplane: 'voyage émigration avion départ', helm: 'voyage maritime bateau', chains: 'captivité esclavage prison',
        medical: 'santé médecine hôpital', hermes: 'commerce marchand', shield: 'protection militaire', hammerPick: 'outils artisan métier', pick: 'mine travail', comet: 'long voyage', target: 'lieu position', camera: 'photographie photo',
        art: 'peinture arts', book: 'livre publication', movie: 'film cinéma', mask: 'théâtre scène', poem: 'poème écriture', dance: 'danse spectacle', stage: 'rôle acteur', music: 'musique', telephone: 'téléphone', clock: 'horloge heure', hourglass: 'sablier temps'};
    const evGroup = v => Object.keys(EV).find(k => EV[k][2].split(' ').includes(v)) || 'forme';
    SETS.event = {what: 'icône', groups: Object.entries(EV).map(([id, [icon, label]]) => ({id, label, icon})),
        fromOption: (o, it) => ({...it, grp: evGroup(it.v), k: EV_WORDS[it.v] || ''})};

    // Fonds de carte : la vignette est une vraie tuile du fond, centrée sur sa région
    const REG = [[/^(nls_25inch|nls_6inch|gsgs3906)$/, 55.95, -3.19, 9], [/^(nls_1inch|nls_natgrid)$/, 52.2, -1.5, 7], [/^london/, 51.507, -0.128, 14], [/^swisstopo/, 46.95, 7.45, 9], [/^(ferraris|vandermaelen|popp|frickx|buurtwegen|cartoweb)$/, 50.85, 4.35, 10],
        [/^usgs/, 39.74, -104.99, 8], [/^ign_es/, 40.42, -3.7, 9], [/^nasa/, 46.5, 2.5, 5], [/^(ign_parcels|ign_hr_ortho|ign_ortho_1950)$/, 48.857, 2.35, 14], [/^(cassini|etatmajor|ign_scan50)/, 48.85, 2.35, 10]];
    const tileFor = (lat, lon, z) => { const n = 2 ** z, r = lat * Math.PI / 180; return [z, Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)]; };
    function mapThumb(bg) {
        const f = A().mapTileUrl; if (typeof f !== 'function') return '';
        const m = REG.find(([re]) => re.test(bg)), [lat, lon, z] = m ? m.slice(1) : [48.6, 2.4, 8];
        try { return f(bg, ...tileFor(lat, lon, z)) || ''; } catch (_) { return ''; }
    }
    const MAP_GROUP_ICONS = {standard: '🗺', historical: '📜', ign_fr: '🇫🇷', nls_gb: '🇬🇧', usgs: '🇺🇸', nasa: '🛰', ign_es: '🇪🇸'};
    SETS.mapbg = {what: 'fond', kind: 'bg', title: 'Choisir un fond de carte',
        fromOption: (o, it) => { const m = it.l.match(/^(.*?)\s*\(([^)]+)\)\s*$/); return {...it, g: '', l: m ? m[1] : it.l, sub: m ? m[2] : '', k: it.l + ' ' + it.v.replace(/_/g, ' ') + (/(satellite|ortho|photo|landsat|modis|imagery)/i.test(it.l + it.v) ? ' satellite photo aérienne' : '') + (/(relief|topo|physique)/i.test(it.l) ? ' relief montagne' : ''), img: mapThumb(it.v)}; },
        groupIcon: label => { const s = fold(label); return /histor/.test(s) ? '📜' : /ign/.test(s) && /france/.test(s) ? '🇫🇷' : /bretagne|nls/.test(s) ? '🇬🇧' : /usgs|etats/.test(s) ? '🇺🇸' : /nasa/.test(s) ? '🛰' : /espagne/.test(s) ? '🇪🇸' : '🗺'; }};
    UI._mapGroupIcons = MAP_GROUP_ICONS;
    SETS.emoji = {what: 'icône', emoji: true, items: [], groups: []};

    /* ═════ Lire un menu déroulant ═════ */
    function readSelect(sel, set) {
        const groups = [], items = [];
        [...sel.querySelectorAll('option')].forEach(o => {
            if (o.value === '') return;
            const og = o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement : null;
            const glabel = og ? og.label.replace(/^[\s—–-]+|[\s—–-]+$/g, '') : '';
            const gid = glabel ? 'g:' + glabel : '';
            if (gid && !groups.some(g => g.id === gid)) groups.push({id: gid, label: glabel, icon: set?.groupIcon ? set.groupIcon(glabel) : ''});
            const t = o.textContent.trim(), m = t.match(/^(\S{1,4})\s+[—–-]\s+(.+)$/);
            let it = {v: o.value, g: m ? m[1] : '', l: m ? m[2] : t, grp: gid, k: ''};
            if (!m) { const e = t.match(/^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})\S*)\s+(.+)$/u); if (e) it = {...it, g: e[1], l: e[2]}; }
            if (set?.fromOption) it = set.fromOption(o, it);
            items.push(it);
        });
        const none = [...sel.options].find(o => o.value === '');
        return {groups: set?.groups || groups, items, none: none ? none.textContent.trim() || 'Aucune' : ''};
    }

    /* ═════ La grille ═════ */
    let openOne = null;
    function closePicker() { openOne?.close(); }
    UI.closeIconPicker = closePicker;
    UI.iconPicker = (o = {}) => {
        closePicker();
        const set = typeof o.set === 'string' ? SETS[o.set] || {} : (o.set || {});
        const kind = o.kind || set.kind || 'icon', what = o.what || set.what || (kind === 'bg' ? 'fond' : 'icône');
        const fem = what === 'icône';
        const curated = (o.items || set.items || []).map(x => ({...x, l: x.l ?? nameOf(x.g || x.v), k: fold(`${x.l || ''} ${x.k || ''} ${frName(x.g || x.v)} ${x.v}`)}));
        const cGroups = (o.groups || set.groups || []).filter(g => curated.some(x => x.grp === g.id));
        const wantEmoji = o.emoji ?? set.emoji ?? false;
        const em = wantEmoji ? emojiItems() : {groups: [], items: []};
        em.items.forEach(x => { if (!x._k) x._k = fold(`${x.l} ${x.k} ${x.v}`); });
        const emojiOnly = wantEmoji && !curated.length;
        const groups = emojiOnly ? em.groups : wantEmoji ? [...cGroups, {id: '*emoji', label: 'Tous les emojis', icon: '😀'}] : cGroups;
        const recentKey = o.recentKey || (wantEmoji ? 'emoji' : (typeof o.set === 'string' ? o.set : 'icons'));
        const all = emojiOnly ? em.items.filter(x => !x.dup) : curated;
        const byV = new Map(); [...curated, ...em.items].forEach(x => { if (!byV.has(x.v)) byV.set(x.v, x); });
        const st = {q: '', chip: 'all', cur: -1};
        const first = o.first && groups.find(g => g.label === o.first || g.id === o.first || g.id === 'emoji:' + o.first);
        if (first && emojiOnly) st.chip = first.id;

        const host = o.anchor?.closest?.('dialog[open]') || document.body;
        const pop = document.createElement('div');
        pop.className = `ui-ig${kind === 'bg' ? ' is-bg' : ''}`;
        pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', o.title || set.title || (kind === 'bg' ? 'Choisir un fond' : 'Choisir une icône'));
        pop.dataset.ctxOff = '1';
        const title = o.title || set.title || (kind === 'bg' ? 'Choisir un fond' : 'Choisir une icône');
        pop.innerHTML = `<div class="ui-ig-head"><b>${esc(title)}</b><button type="button" class="ui-ig-x" aria-label="Fermer" title="Fermer (Échap)">×</button></div>
            <div class="ui-ig-top"><span class="ui-ig-srch"></span><div class="ui-filters ui-ig-chips" role="tablist"></div></div>
            <div class="ui-ig-body" role="listbox" aria-label="${esc(title)}"></div>
            <div class="ui-ig-ft"><span class="ui-ig-keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> choisir · <kbd>Entrée</kbd> valider · <kbd>Échap</kbd> fermer</span>${o.allowNone ? `<button type="button" class="link-button ui-ig-none" data-ig-none>${esc(o.noneLabel || (fem ? 'Aucune icône' : 'Aucun fond'))}</button>` : ''}</div>`;
        const ph = kind === 'bg' ? 'Chercher un fond… (ex. Cassini, relief, 1850)' : wantEmoji ? 'Chercher… (ex. coeur, bateau, chien)' : 'Chercher… (ex. église, mariage, étoile)';
        let input;
        if (UI.searchField) { const sf = UI.searchField({placeholder: ph, label: 'Chercher ' + (fem ? 'une icône' : 'un fond')}); input = sf.input; pop.querySelector('.ui-ig-srch').replaceWith(sf); sf.classList.add('ui-ig-srch'); }
        else { input = document.createElement('input'); input.type = 'search'; input.placeholder = ph; pop.querySelector('.ui-ig-srch').appendChild(input); }
        input.classList.add('ui-ig-q');
        const body = pop.querySelector('.ui-ig-body'), chips = pop.querySelector('.ui-ig-chips');
        let flat = [];

        const matches = (x, words) => words.every(w => (x._k || x.k || '').includes(w)) ;
        function sections() {
            const q = st.q.trim(), words = fold(q).split(/\s+/).filter(Boolean);
            const rec = recentOf(recentKey).map(v => byV.get(v) || (wantEmoji && PICTO.test(v) ? {v, g: v, l: nameOf(v), k: ''} : null)).filter(Boolean);
            const inChip = x => st.chip === 'all' ? true : st.chip === 'recent' ? rec.includes(x) : st.chip === '*emoji' ? false : x.grp === st.chip;
            if (q) {
                const out = [];
                if (wantEmoji && PICTO.test(q) && !byV.has(q.trim()) && q.trim().length <= 16) out.push({title: '', items: [{v: q.trim(), g: q.trim(), l: 'Utiliser « ' + q.trim() + ' »', k: '', own: true}]});
                const exact = byV.get(q.trim());
                const pool = st.chip === 'recent' ? rec : st.chip === '*emoji' ? [] : (emojiOnly ? em.items.filter(x => !x.dup && inChip(x)) : curated.filter(inChip));
                let found = pool.filter(x => matches(x, words) || x.v === q.trim());
                if (exact && !found.includes(exact) && st.chip === 'all') found.unshift(exact);
                const more = wantEmoji && !emojiOnly && (st.chip === 'all' || st.chip === '*emoji') ? em.items.filter(x => !x.dup && !found.includes(x) && (matches(x, words) || x.v === q.trim())) : [];
                const n = found.length + more.length;
                out.push({title: n ? `${plural(n, what)} pour « ${q} »` : '', items: found});
                if (more.length) out.push({title: found.length ? 'Autres emojis' : '', items: more});
                return out;
            }
            if (st.chip === 'recent') return [{title: '🕘 Récentes', items: rec}];
            if (st.chip === '*emoji') return em.groups.map(g => ({title: `${g.icon} ${g.label}`, items: em.items.filter(x => x.grp === g.id)}));
            if (st.chip !== 'all') return [{title: '', items: (emojiOnly ? em.items : curated).filter(x => x.grp === st.chip)}];
            const out = rec.length ? [{title: '🕘 Récentes', items: rec}] : [];
            if (emojiOnly) em.groups.forEach(g => out.push({title: `${g.icon} ${g.label}`, items: em.items.filter(x => x.grp === g.id && !x.dup)}));
            else if (cGroups.length) { cGroups.forEach(g => out.push({title: `${g.icon ? g.icon + ' ' : ''}${g.label}`, items: curated.filter(x => x.grp === g.id)})); const loose = curated.filter(x => !cGroups.some(g => g.id === x.grp)); if (loose.length) out.push({title: 'Autres', items: loose}); }
            else out.push({title: rec.length ? (fem ? 'Toutes' : 'Tous') : '', items: curated});
            return out;
        }
        const hl = (txt, words) => { let h = esc(txt); if (!words.length) return h; const f = fold(txt); const marks = []; words.forEach(w => { let i = f.indexOf(w); if (i >= 0) marks.push([i, i + w.length]); }); if (!marks.length) return h; marks.sort((a, b) => a[0] - b[0]); let out = '', p = 0; marks.forEach(([a, b]) => { if (a < p) return; out += esc(txt.slice(p, a)) + '<mark>' + esc(txt.slice(a, b)) + '</mark>'; p = b; }); return out + esc(txt.slice(p)); };
        function tile(x, i, words) {
            const on = String(o.value ?? '') === String(x.v);
            const pic = kind === 'bg' ? `<i class="ui-ig-img">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</i>` : `<i aria-hidden="true">${esc(x.g || '')}</i>`;
            return `<button type="button" class="ui-ig-tile${on ? ' is-active' : ''}${x.l ? '' : ' is-bare'}" role="option" aria-selected="${on}" data-ig-i="${i}" tabindex="-1" title="${esc(x.l || x.v)}">${pic}${x.l ? `<span>${hl(x.l, words)}</span>` : ''}${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`;
        }
        function drawChips() {
            const rec = recentOf(recentKey).filter(v => byV.has(v) || (wantEmoji && PICTO.test(v)));
            const count = id => id === '*emoji' ? em.items.filter(x => !x.dup).length : (emojiOnly ? em.items : curated).filter(x => x.grp === id).length;
            const b = (id, label, n) => `<button type="button" role="tab" class="${st.chip === id ? 'is-active' : ''}" aria-selected="${st.chip === id}" data-ig-chip="${esc(id)}">${esc(label)}${n != null ? ` (${n})` : ''}</button>`;
            chips.innerHTML = b('all', 'Tout', all.length) + (rec.length ? b('recent', '🕘 Récentes', null) : '') + groups.map(g => b(g.id, `${g.icon ? g.icon + ' ' : ''}${g.label}`, count(g.id))).join('');
        }
        function draw(keepCur) {
            const words = fold(st.q).split(/\s+/).filter(Boolean);
            const secs = sections().filter(s => s.items.length);
            flat = [];
            body.innerHTML = secs.length ? secs.map(s => `${s.title ? `<div class="ui-ig-lb">${esc(s.title)}</div>` : ''}<div class="ui-ig-tiles">${s.items.map(x => { flat.push(x); return tile(x, flat.length - 1, words); }).join('')}</div>`).join('')
                : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">${st.q ? `Rien pour « ${esc(st.q)} ». Vérifie l’orthographe, ou essaie un autre mot.` : 'Rien ici pour l’instant.'}</span></p>`;
            if (!keepCur) st.cur = st.q ? (flat.length ? 0 : -1) : flat.findIndex(x => String(x.v) === String(o.value ?? ''));
            mark(false);
        }
        function mark(scroll = true) {
            body.querySelectorAll('.ui-ig-tile.is-cur').forEach(t => t.classList.remove('is-cur'));
            const t = body.querySelector(`[data-ig-i="${st.cur}"]`);
            if (t) { t.classList.add('is-cur'); if (scroll) t.scrollIntoView({block: 'nearest'}); }
        }
        function move(key) {
            const tiles = [...body.querySelectorAll('.ui-ig-tile')]; if (!tiles.length) return;
            if (st.cur < 0) { st.cur = 0; return mark(); }
            const cur = tiles[st.cur] || tiles[0], r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            if (key === 'ArrowLeft' || key === 'ArrowRight') { st.cur = Math.max(0, Math.min(tiles.length - 1, st.cur + (key === 'ArrowRight' ? 1 : -1))); return mark(); }
            const down = key === 'ArrowDown'; let best = null, bd = Infinity;
            tiles.forEach((t, i) => { const q = t.getBoundingClientRect(), y = q.top + q.height / 2; if (down ? y <= cy + 4 : y >= cy - 4) return; const d = Math.abs(y - cy) * 1000 + Math.abs(q.left + q.width / 2 - cx); if (d < bd) { bd = d; best = i; } });
            if (best != null) { st.cur = best; mark(); }
        }
        function pick(x) {
            if (!x) return;
            remember(recentKey, x.v);
            close(true);
            o.onPick?.(String(x.v), x);
        }
        const place = () => {
            const vw = innerWidth, vh = innerHeight, r = o.anchor?.getBoundingClientRect?.() || {left: vw / 2 - 280, bottom: 80, top: 80};
            const w = Math.min(kind === 'bg' ? 680 : 580, vw - 16), h = Math.min(560, vh - 16);
            pop.style.width = w + 'px'; pop.style.maxHeight = h + 'px';
            const left = vw < 600 ? 8 : Math.max(8, Math.min(vw - w - 8, r.left));
            let top = r.bottom + 6; const ph2 = Math.min(h, pop.offsetHeight || h);
            if (top + ph2 > vh - 8) top = Math.max(8, (r.top || top) - ph2 - 6 >= 8 ? r.top - ph2 - 6 : vh - ph2 - 8);
            // dans une fenêtre (dialog) transformée, « fixed » part du coin de la fenêtre
            const off = host !== document.body ? host.getBoundingClientRect() : null, tr = off && getComputedStyle(host).transform !== 'none';
            pop.style.left = (left - (tr ? off.left : 0)) + 'px'; pop.style.top = (top - (tr ? off.top : 0)) + 'px';
        };
        const outside = e => { if (!pop.contains(e.target) && !(o.anchor && o.anchor.contains?.(e.target))) close(); };
        function close(picked) {
            if (!pop.isConnected) return;
            pop.remove(); document.removeEventListener('pointerdown', outside, true); removeEventListener('resize', place);
            if (openOne?.el === pop) openOne = null;
            if (!picked) o.onClose?.();
            try { (o.focusBack || o.anchor)?.focus?.({preventScroll: true}); } catch (_) {}
        }
        pop.addEventListener('click', e => {
            if (e.target.closest('.ui-ig-x')) return close();
            if (e.target.closest('[data-ig-none]')) { close(true); o.onPick?.('', null); return; }
            const c = e.target.closest('[data-ig-chip]'); if (c) { st.chip = c.dataset.igChip; drawChips(); draw(); chips.querySelector(`[data-ig-chip="${CSS.escape(st.chip)}"]`)?.focus(); return; }
            const t = e.target.closest('[data-ig-i]'); if (t) pick(flat[Number(t.dataset.igI)]);
        });
        pop.addEventListener('keydown', e => {
            if (e.key === 'Escape') { if (e.defaultPrevented) return; e.preventDefault(); e.stopPropagation(); close(); return; }
            if (/^Arrow/.test(e.key)) {
                if (e.target === input && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && input.value) return;
                if (e.target.closest?.('[data-ig-chip]') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { const bs = [...chips.querySelectorAll('[data-ig-chip]')], i = bs.indexOf(e.target.closest('[data-ig-chip]')); bs[(i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length]?.focus(); e.preventDefault(); return; }
                e.preventDefault(); move(e.key); return;
            }
            if (e.key === 'Enter' && !e.target.closest?.('[data-ig-chip], .ui-ig-x, [data-ig-none]')) { e.preventDefault(); e.stopPropagation(); pick(flat[st.cur >= 0 ? st.cur : 0]); }
        });
        let tmr = 0;
        input.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { st.q = input.value; draw(); }, 60); });
        input.addEventListener('search', () => { st.q = input.value; draw(); });
        host.appendChild(pop);
        drawChips(); draw(); place();
        requestAnimationFrame(() => { place(); mark(); input.focus({preventScroll: true}); });
        setTimeout(() => document.addEventListener('pointerdown', outside, true));
        addEventListener('resize', place);
        openOne = {el: pop, close};
        return {el: pop, close, input};
    };

    /* ═════ La pastille (même dessin que le menu de choix) ═════ */
    function chipHtml(it, {kind, allowNone, what, label}) {
        const fem = (what || 'icône') === 'icône';
        if (!it) return `<button type="button" class="button small secondary ui-icf-empty" data-icf="change">${kind === 'bg' ? '🗺 Choisir un fond…' : `🔣 Choisir ${fem ? 'une icône' : 'un ' + esc(what)}…`}</button>`;
        const pic = kind === 'bg' ? `<span class="pk-ic ui-icf-img">${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>` : `<span class="pk-ic ui-icf-ic" aria-hidden="true">${esc(it.g || it.v)}</span>`;
        return `<span class="pk-chip ui-icf-chip">${pic}<span><b>${esc(it.l || nameOf(it.g || it.v) || label || it.v)}</b>${it.sub || it.grpLabel ? ` <small>${esc(it.sub || it.grpLabel)}</small>` : ''}</span><button type="button" class="go" data-icf="change" data-ia-done="1">✎ Changer</button>${allowNone ? `<button type="button" class="x" data-icf="clear" data-ia-done="1" title="Retirer" aria-label="Retirer ${fem ? 'l’icône' : 'le ' + esc(what)}">×</button>` : ''}</span>`;
    }
    /** m : {get(), set(v), list() → {items, groups, none}, kind, what, emoji, set, allowNone, title} */
    function mountField(w, m) {
        w.classList.add('ui-icf');
        const paint = () => {
            const L = m.list(), v = String(m.get() ?? '');
            let it = v ? L.items.find(x => String(x.v) === v) : null;
            if (!it && v && (m.emoji || PICTO.test(v))) it = {v, g: v, l: nameOf(v) || 'Icône'};
            if (it && !it.grpLabel) { const g = L.groups.find(x => x.id === it.grp); if (g && m.kind !== 'bg') it = {...it, grpLabel: g.label}; }
            const box = w.querySelector(':scope > .ui-icf-box') || w.appendChild(Object.assign(document.createElement('span'), {className: 'ui-icf-box'}));
            box.innerHTML = chipHtml(it, {kind: m.kind, allowNone: m.allowNone && !!it, what: m.what});
            w.classList.toggle('has-value', !!it);
        };
        const open = () => {
            const L = m.list();
            UI.iconPicker({anchor: w.querySelector('[data-icf=change]') || w, items: L.items, groups: L.groups, value: m.get(), kind: m.kind, what: m.what, emoji: m.emoji, set: m.setDef, recentKey: m.recentKey, title: m.title, allowNone: m.allowNone,
                noneLabel: L.none, first: m.first, focusBack: w.querySelector('[data-icf=change]'),
                onPick: v => { m.set(v); paint(); setTimeout(() => w.querySelector('[data-icf=change]')?.focus({preventScroll: true})); }});
        };
        w.addEventListener('click', e => {
            const b = e.target.closest('[data-icf]'); if (!b) { if (e.target.closest('.ui-icf-chip')) open(); return; }
            e.preventDefault(); e.stopPropagation();
            if (b.dataset.icf === 'clear') { m.set(''); paint(); return; }
            open();
        });
        w._icfPaint = paint; w._icfOpen = open;
        paint();
        return paint;
    }
    const SELECT_VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    const INPUT_VALUE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    function watch(el, desc, cb) { // même contrat que app-ui.js / app-saisies.js (_uiWatch) : champ.value = … met la pastille à jour
        if (!el._uiWatch) {
            el._uiWatch = [];
            Object.defineProperty(el, 'value', {configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); this._uiWatch.forEach(f => { try { f(); } catch (_) {} }); }});
            el.form?.addEventListener('reset', () => setTimeout(() => el._uiWatch.forEach(f => f())));
        }
        el._uiWatch.push(cb);
    }

    /** un menu déroulant d'icônes ou de fonds → la pastille ; le menu reste dessous, caché (name, écouteurs, valeur) */
    function upgradeSelect(sel, setId) {
        if (sel.dataset.uiIcf) return;
        const set = SETS[setId] || {};
        sel.dataset.uiIcf = setId || '1';
        let cache = null; const list = () => cache || (cache = readSelect(sel, set));
        new MutationObserver(() => { cache = null; paint(); }).observe(sel, {childList: true, subtree: true});
        const w = document.createElement('span');
        w.className = `ui-icf-host${set.kind === 'bg' ? ' is-bg' : ''}`;
        sel.after(w); sel.classList.add('ui-icf-src'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
        const lab = sel.getAttribute('aria-label') || sel.title; if (lab) w.setAttribute('aria-label', lab);
        const paint = mountField(w, {get: () => sel.value, set: v => { if (sel.value === v) return; SELECT_VALUE.set.call(sel, v); fire(sel, 'input'); fire(sel, 'change'); },
            list, kind: set.kind || 'icon', what: set.what, setDef: set, recentKey: setId, title: set.title, allowNone: !!list().none});
        sel.addEventListener('change', () => paint());
        watch(sel, SELECT_VALUE, paint);
        sel.disabled && w.classList.add('is-disabled');
    }
    /** une case d'émoji (« .h-be-icon ») ou une case data-ui-icon="jeu" → la pastille ; la case garde la valeur */
    function upgradeInput(inp) {
        if (inp.dataset.uiIcf) return;
        const setId = inp.dataset.uiIcon || 'emoji', set = SETS[setId] || SETS.emoji;
        inp.dataset.uiIcf = setId;
        const w = document.createElement('span'); w.className = 'ui-icf-host';
        inp.after(w); inp.classList.add('ui-icf-src'); inp.tabIndex = -1;
        // les anciens boutons « Choisir un émoji… » à côté : « ✎ Changer » les remplace
        inp.parentElement?.querySelectorAll(':scope > [data-rc-emoji], :scope > [data-cfg-emoji], :scope > [data-be-emoji-open]').forEach(b => { b.hidden = true; });
        const lab = inp.getAttribute('aria-label') || inp.title; if (lab) w.setAttribute('aria-label', lab);
        const list = () => ({items: set.items || [], groups: set.groups || [], none: ''});
        const paint = mountField(w, {get: () => INPUT_VALUE.get.call(inp), set: v => { INPUT_VALUE.set.call(inp, v); fire(inp, 'input'); fire(inp, 'change'); },
            list, kind: 'icon', what: 'icône', emoji: set.emoji !== false && (setId === 'emoji' || set.emoji), setDef: set, recentKey: set.emoji === false ? setId : 'emoji', title: set.title,
            allowNone: inp.dataset.uiIconNone != null ? inp.dataset.uiIconNone !== '0' : !inp.required, first: inp.dataset.uiIconFirst || ''});
        inp.addEventListener('input', () => paint()); inp.addEventListener('change', () => paint());
        watch(inp, INPUT_VALUE, paint);
    }
    /** UI.iconField({name, value, set, items, groups, emoji, allowNone, attrs}) → l'élément ; la valeur est dans la case cachée name=… */
    UI.iconField = (opts = {}) => {
        const id = opts.set || ('f' + Math.random().toString(36).slice(2));
        if (!opts.set && (opts.items || opts.emoji)) SETS[id] = {items: opts.items || [], groups: opts.groups || [], emoji: !!opts.emoji, title: opts.title};
        const holder = document.createElement('span');
        const inp = document.createElement('input'); inp.type = 'hidden'; if (opts.name) inp.name = opts.name; INPUT_VALUE.set.call(inp, opts.value || '');
        inp.dataset.uiIcon = id; if (opts.allowNone != null) inp.dataset.uiIconNone = opts.allowNone ? '1' : '0';
        holder.appendChild(inp); upgradeInput(inp);
        holder.input = inp; return holder;
    };
    UI.iconFieldHtml = ({name = '', value = '', set = 'emoji', attrs = '', allowNone} = {}) =>
        `<input type="hidden" ${name ? `name="${esc(name)}" ` : ''}data-ui-icon="${esc(set)}" value="${esc(value)}"${allowNone != null ? ` data-ui-icon-none="${allowNone ? 1 : 0}"` : ''} ${attrs}>`;

    /* ═════ Remplacer « ext.pickEmoji » (l'ancienne petite fenêtre à onglets) : la même grille ═════ */
    UI.pickEmojiGrid = (input, onPick, opts = {}) => UI.iconPicker({anchor: input, emoji: true, value: input?.value || '', first: opts.first || '', title: opts.title || 'Choisir une icône',
        onPick: v => { if (input && 'value' in input) { input.value = v; fire(input, 'input'); fire(input, 'change'); } onPick?.(v); }});

    /* ═════ Habillage automatique ═════ */
    const MAP_SEL = 'select:has(> optgroup > option[value="cassini_royal"]), select:has(> option[value="cassini_royal"])';
    const WANT = `select[data-ui-icons], ${MAP_SEL}, input.h-be-icon, input.h-fi-iconin, input[data-ui-icon]`;
    function enhance(el) {
        if (!el.isConnected || el.dataset.uiIcf || isOff(el) || el.closest('.ui-ig')) return;
        // les Trésors gardent leurs menus (outil construit à part)
        if (el.matches('[data-fm-bg], [data-cu-now], [data-cu-old]')) return;
        if (el.tagName === 'SELECT') {
            const set = el.dataset.uiIcons || (el.querySelector('option[value="cassini_royal"]') ? 'mapbg' : '');
            const n = el.querySelectorAll('option').length;
            if (n > 12 || el.dataset.uiIcons) upgradeSelect(el, set);
            return;
        }
        upgradeInput(el);
    }
    function scan(root) {
        if (!root?.querySelectorAll) return;
        let els; try { els = [...(root.matches?.(WANT) ? [root] : []), ...root.querySelectorAll(WANT)]; } catch (_) { els = [...root.querySelectorAll('select[data-ui-icons], input.h-be-icon, input.h-fi-iconin, input[data-ui-icon]')]; }
        els.forEach(enhance);
    }
    UI.scanIcons = (root = document) => scan(root);
    let queued = new Set(), timer = 0;
    new MutationObserver(list => {
        list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && !n.classList.contains('ui-ig') && !n.classList.contains('ui-icf-host') && !n.closest?.('.ui-icf-host, .ui-ig')) queued.add(n); }));
        if (!queued.size) return;
        clearTimeout(timer);
        timer = setTimeout(() => { const nodes = [...queued]; queued = new Set(); nodes.forEach(n => { if (n.isConnected) scan(n); }); }, 30);
    }).observe(document.documentElement, {childList: true, subtree: true});
    document.addEventListener('DOMContentLoaded', () => scan(document));
    if (document.readyState !== 'loading') scan(document);
})();
