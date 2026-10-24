/* LCNDA — 🏠 Plan de maison : les objets de prière et de mémoire de toutes les traditions (complète heritage-house-lib.js, heritage-house-more.js
 * et heritage-house-metiers.js), dans « Religion, souvenirs » :
 *  - christianisme (catholique, protestant, orthodoxe), judaïsme, islam, bouddhisme, hindouisme, sikhisme, shintoïsme, culte des ancêtres
 *    (Chine, Vietnam, Corée), taoïsme, zoroastrisme, et les souvenirs sans religion (coin mémoire, urne, cadre de deuil) ;
 *  - chaque objet : vraies dimensions (cm), mots-clés (kw, avec le nom de la religion), un dessin vu de dessus et une forme 3D ;
 *    la couleur principale (et sa matière) et la 2e couleur restent modifiables ;
 *  - les plaques murales portent un symbole (✡ ☪ ☸ ॐ ☬ ☯ ☦…) dessiné dans la 3D ; les cadres gardent leur emplacement d'image.
 * Les formes de ce fichier commencent toutes par « r_ ».
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const CAT = 'Religion, souvenirs';
    const O = (kw, o = {}) => ({kw, ...o}), OLD = (kw, o = {}) => ({kw, old: 1, ...o});

    /* ═════════ Le catalogue : [clé, nom, largeur, profondeur, hauteur (cm), couleur, forme, options] ═════════ */
    const ROWS = {
        [CAT]: [
            // ✝ christianisme : catholique, protestant, orthodoxe
            ['rl_iconcorner', 'Coin des icônes (« beau coin » orthodoxe)', 60, 35, 70, '#c9a24a', 'r_iconcorner', OLD('orthodoxe icône icônes coin prière russe grec', {elev: 140, color2: '#8b1a1a'})],
            ['rl_lampada', 'Veilleuse d’icône (lampada)', 10, 10, 18, '#8b1a1a', 'r_diya', O('orthodoxe veilleuse lampe huile icône rouge', {elev: 150, color2: '#c9a24a'})],
            ['rl_crossortho', 'Croix orthodoxe murale', 30, 3, 45, '#c9a24a', 'r_plaque', O('orthodoxe croix trois traverses mur', {elev: 150, sym: '☦', color2: '#3a2a1a'})],
            ['rl_crossprot', 'Croix murale sans Christ (protestante)', 30, 3, 45, '#6a4026', 'r_plaque', O('protestant croix réformé temple mur', {elev: 150, sym: '✝', color2: '#f4ecd8'})],
            ['rl_bibleprot', 'Grande Bible ouverte sur pupitre', 50, 40, 115, '#6a4026', 'lectern', OLD('protestant bible lecture pupitre culte chrétien')],
            ['rl_sacrecoeur', 'Image du Sacré-Cœur encadrée', 35, 3, 45, '#c9a24a', 'mirror', OLD('catholique sacré cœur image pieuse cadre', {elev: 140, pic: 'portrait'})],
            ['rl_exvoto', 'Ex-voto (plaque de remerciement)', 25, 2, 18, '#e9e4da', 'r_plaque', OLD('catholique ex-voto merci plaque chapelle', {elev: 150, sym: '✝', color2: '#3a2a1a'})],
            ['rl_advent', 'Couronne de l’Avent', 40, 40, 18, '#2f5a2f', 'r_advent', O('chrétien avent noël bougies couronne sapin', {elev: 76, color2: '#c0392b'})],
            ['rl_creche', 'Crèche de Noël', 60, 35, 40, '#8a5a32', 'r_creche', O('chrétien noël crèche santons nativité', {elev: 76, color2: '#c9b38a'})],
            ['rl_rosaire', 'Chapelet accroché (rosaire)', 12, 2, 30, '#6a4026', 'r_beads', O('catholique chapelet rosaire perles prière', {elev: 130})],
            // ✡ judaïsme
            ['rl_menorah', 'Ménorah (chandelier à sept branches)', 35, 12, 45, '#c9a24a', 'r_menorah', O('juif judaïsme ménorah chandelier sept branches', {elev: 76})],
            ['rl_hanukia', 'Hanoukia (chandelier à neuf branches)', 40, 12, 32, '#c0c4c8', 'r_hanukiah', O('juif judaïsme hanoucca hanoukia chandelier neuf branches', {elev: 76})],
            ['rl_shabbat', 'Chandeliers de shabbat (paire)', 25, 10, 30, '#c0c4c8', 'r_candlepair', O('juif judaïsme shabbat bougies chandeliers vendredi', {elev: 76})],
            ['rl_mezouza', 'Mézouza (au montant de la porte)', 4, 3, 12, '#c9a24a', 'r_mezuzah', O('juif judaïsme mézouza porte montant parchemin', {elev: 140})],
            ['rl_davidplaque', 'Étoile de David murale', 35, 3, 35, '#2a4a8a', 'r_plaque', O('juif judaïsme étoile david magen mur', {elev: 150, sym: '✡', color2: '#f4ecd8'})],
            ['rl_mizrah', 'Mizrah (plaque tournée vers Jérusalem)', 45, 3, 35, '#f4ecd8', 'r_plaque', O('juif judaïsme mizrah est jérusalem plaque', {elev: 150, sym: 'מזרח', color2: '#2a4a8a'})],
            ['rl_aron', 'Armoire de la Torah (aron, avec son rideau)', 120, 55, 210, '#6a4026', 'r_ark', O('juif judaïsme torah arche sainte rideau parokhet synagogue', {color2: '#2a4a8a'})],
            ['rl_bimah', 'Pupitre de lecture (bimah)', 90, 70, 110, '#7a4f2a', 'r_lectern2', O('juif judaïsme bimah pupitre lecture torah', {color2: '#2a4a8a'})],
            ['rl_kiddouch', 'Coupe de kiddouch et plateau', 25, 25, 18, '#c0c4c8', 'r_cup', O('juif judaïsme kiddouch coupe vin shabbat', {elev: 76})],
            ['rl_seder', 'Plat du séder (Pessah)', 40, 40, 4, '#c0c4c8', 'r_dish', O('juif judaïsme pessah pâque séder plat', {elev: 76, color2: '#c9a24a'})],
            ['rl_talit', 'Châle de prière (talit) sur son cintre', 60, 15, 90, '#f4f1ea', 'r_hangcloth', O('juif judaïsme talit châle prière franges', {elev: 100, color2: '#2a4a8a'})],
            ['rl_tsedaka', 'Tirelire de tsedaka', 12, 8, 14, '#c9a24a', 'r_box', O('juif judaïsme tsedaka tirelire don charité', {elev: 76})],
            // ☪ islam
            ['rl_prayerrug', 'Tapis de prière', 70, 120, 1, '#8b1a1a', 'r_prayerrug', O('musulman islam tapis prière sajjada salat', {color2: '#c9a24a'})],
            ['rl_rahle', 'Porte-Coran pliant (rahle)', 32, 22, 25, '#8a5a32', 'r_rehal', O('musulman islam coran pupitre rahle lecture', {elev: 76})],
            ['rl_crescent', 'Croissant et étoile muraux', 35, 3, 35, '#2f6a4a', 'r_plaque', O('musulman islam croissant étoile mur', {elev: 150, sym: '☪', color2: '#f4ecd8'})],
            ['rl_calligraphy', 'Calligraphie encadrée (Bismillah)', 90, 3, 40, '#c9a24a', 'r_plaque', O('musulman islam calligraphie arabe bismillah cadre', {elev: 140, sym: 'بسم الله', color2: '#1f3a2a'})],
            ['rl_misbaha', 'Chapelet (misbaha) sur sa coupelle', 14, 14, 5, '#3a2a1a', 'r_dish', O('musulman islam chapelet misbaha tasbih perles', {elev: 76, color2: '#2f6a4a'})],
            ['rl_fanous', 'Lanterne du ramadan (fanous)', 25, 25, 45, '#c9a24a', 'r_fanous', O('musulman islam ramadan lanterne fanous', {elev: 76, color2: '#c0392b'})],
            ['rl_mihrab', 'Niche de prière murale (mihrab décoratif)', 80, 12, 150, '#e9dcc3', 'r_mihrab', O('musulman islam mihrab niche qibla prière mosquée', {color2: '#2f6a4a'})],
            ['rl_quranshelf', 'Coran sur l’étagère du haut', 40, 20, 6, '#2f6a4a', 'r_book', O('musulman islam coran livre saint étagère', {elev: 175, color2: '#c9a24a'})],
            ['rl_mabkhara', 'Brûleur d’encens (mabkhara)', 18, 18, 25, '#8a6a3a', 'r_censer', O('musulman islam encens bakhour brûleur oud', {elev: 76})],
            // ☸ bouddhisme
            ['rl_buddha', 'Bouddha assis', 35, 28, 45, '#c9a24a', 'r_buddha', O('bouddhiste bouddhisme bouddha statue méditation', {elev: 76})],
            ['rl_buddhabig', 'Grand Bouddha de jardin', 70, 55, 90, '#9a9488', 'r_buddha', O('bouddhiste bouddhisme bouddha statue pierre jardin', {matl: 'pierre'})],
            ['rl_butsudan', 'Autel bouddhique (butsudan)', 60, 45, 120, '#2a1a12', 'r_butsudan', O('bouddhiste bouddhisme autel japon butsudan ancêtres', {color2: '#c9a24a'})],
            ['rl_stupa', 'Stupa miniature (chorten)', 25, 25, 45, '#e9e4da', 'r_stupa', O('bouddhiste bouddhisme stupa chorten tibet', {elev: 76, color2: '#c9a24a'})],
            ['rl_prayerwheel', 'Moulin à prières', 20, 20, 40, '#c9a24a', 'r_prayerwheel', O('bouddhiste bouddhisme tibet moulin prière mantra', {elev: 76, color2: '#8b1a1a'})],
            ['rl_flags', 'Drapeaux de prière (guirlande)', 300, 5, 30, '#2a5db0', 'r_flags', O('bouddhiste bouddhisme tibet drapeaux prière lungta', {elev: 200})],
            ['rl_thangka', 'Thangka (peinture sur rouleau)', 60, 3, 100, '#8b1a1a', 'r_scroll', O('bouddhiste bouddhisme tibet thangka rouleau peinture', {elev: 110, color2: '#c9a24a'})],
            ['rl_dharma', 'Roue du dharma murale', 35, 3, 35, '#c9a24a', 'r_plaque', O('bouddhiste bouddhisme roue dharma dharmachakra', {elev: 150, sym: '☸', color2: '#8b1a1a'})],
            ['rl_singingbowl', 'Bol chantant sur coussin', 18, 18, 10, '#b88a3a', 'r_cup', O('bouddhiste bouddhisme bol chantant tibétain méditation', {elev: 76})],
            ['rl_gong', 'Gong sur portique', 80, 40, 120, '#5a3b22', 'r_gong', O('bouddhiste gong portique temple méditation', {color2: '#c9a24a'})],
            ['rl_zafu', 'Coussin de méditation (zafu et zabuton)', 80, 80, 22, '#2a3a5a', 'r_zafu', O('bouddhiste zen méditation coussin zafu zabuton', {color2: '#8b1a1a'})],
            ['rl_incense', 'Brûle-parfum et bâtons d’encens', 15, 15, 30, '#3a3a3a', 'r_incense', O('bouddhiste hindou encens bâtons brûle-parfum', {elev: 76})],
            // ॐ hindouisme
            ['rl_mandir', 'Temple de maison (mandir)', 60, 45, 110, '#e9dcc3', 'r_mandir', O('hindou hindouisme mandir temple maison puja autel', {color2: '#c9a24a'})],
            ['rl_ganesh', 'Statue de Ganesh', 25, 20, 35, '#e0702a', 'r_ganesh', O('hindou hindouisme ganesh ganesha éléphant statue', {elev: 76, color2: '#c9a24a'})],
            ['rl_nataraja', 'Nataraja (Shiva dansant)', 35, 15, 45, '#b88a3a', 'r_nataraja', O('hindou hindouisme shiva nataraja danse bronze', {elev: 76})],
            ['rl_om', 'Om mural', 35, 3, 35, '#e0702a', 'r_plaque', O('hindou hindouisme om aum symbole mur', {elev: 150, sym: 'ॐ', color2: '#f4ecd8'})],
            ['rl_diya', 'Lampe à huile (diya)', 10, 10, 6, '#b0603a', 'r_diya', O('hindou hindouisme diya lampe huile diwali', {elev: 76, color2: '#e0c46a'})],
            ['rl_tulsi', 'Pot de tulsi (basilic sacré)', 45, 45, 100, '#c06a3a', 'r_tulsi', O('hindou hindouisme tulsi basilic sacré pot cour', {color2: '#3a8a3a'})],
            ['rl_rangoli', 'Rangoli (motif coloré au sol)', 100, 100, 1, '#e0702a', 'r_rangoli', O('hindou hindouisme rangoli kolam diwali motif sol')],
            ['rl_pujabell', 'Cloche de puja', 8, 8, 18, '#c9a24a', 'r_bell', O('hindou hindouisme cloche puja ghanti prière', {elev: 76})],
            ['rl_garland', 'Guirlande de fleurs (œillets d’Inde)', 200, 5, 25, '#e0902a', 'r_flags', O('hindou fleurs guirlande souci œillet fête', {elev: 200, flowers: 1})],
            // ☬ sikhisme
            ['rl_khanda', 'Khanda mural', 35, 3, 35, '#2a4a8a', 'r_plaque', O('sikh sikhisme khanda symbole mur', {elev: 150, sym: '☬', color2: '#e0902a'})],
            ['rl_palki', 'Palki Sahib (dais du Guru Granth Sahib)', 120, 80, 200, '#e9dcc3', 'r_palki', O('sikh sikhisme palki guru granth sahib dais gurdwara', {color2: '#e0902a'})],
            ['rl_manji', 'Manji Sahib (petit lit du livre saint)', 80, 60, 50, '#c9a24a', 'r_manji', O('sikh sikhisme manji guru granth livre saint', {color2: '#8b1a1a'})],
            // ⛩ shintoïsme, Japon
            ['rl_kamidana', 'Kamidana (autel shinto mural)', 80, 35, 50, '#d9c09a', 'r_kamidana', O('shinto shintoïsme kamidana autel japon kami', {elev: 180, color2: '#3a3a3a'})],
            ['rl_torii', 'Torii de jardin', 200, 40, 220, '#c0392b', 'r_torii', O('shinto shintoïsme torii portique japon jardin', {color2: '#1a1a1a'})],
            ['rl_toro', 'Lanterne de pierre (tōrō)', 50, 50, 130, '#9a9488', 'r_lantern', O('japon shinto bouddhiste lanterne pierre toro jardin', {matl: 'pierre'})],
            ['rl_shimenawa', 'Corde sacrée (shimenawa)', 150, 10, 40, '#d9b75a', 'r_flags', O('shinto shintoïsme shimenawa corde paille', {elev: 190, rope: 1})],
            // ☯ ancêtres (Chine, Vietnam, Corée), taoïsme, zoroastrisme
            ['rl_ancestor', 'Autel des ancêtres', 110, 45, 110, '#6a1a12', 'r_ancestral', O('ancêtres autel chine vietnam corée famille culte encens', {color2: '#c9a24a'})],
            ['rl_tablets', 'Tablettes des ancêtres', 40, 15, 35, '#3a1a12', 'r_tablets', O('ancêtres tablettes chine vietnam noms famille', {elev: 110, color2: '#c9a24a'})],
            ['rl_censer', 'Brûle-parfum tripode (bronze)', 30, 30, 35, '#7a5a2a', 'r_censer', O('chine vietnam taoïste ancêtres encens tripode bronze', {elev: 110, tripod: 1})],
            ['rl_yinyang', 'Yin et yang mural', 35, 3, 35, '#1a1a1a', 'r_plaque', O('taoïste taoïsme yin yang tao symbole', {elev: 150, sym: '☯', color2: '#f4f1ea'})],
            ['rl_redlantern', 'Lanterne rouge en papier', 35, 35, 45, '#c0392b', 'r_paperlantern', O('chine vietnam lanterne rouge papier nouvel an', {elev: 200, color2: '#c9a24a'})],
            ['rl_afrinagan', 'Vase à feu sacré (afrinagan)', 35, 35, 60, '#b88a3a', 'r_afrinagan', O('zoroastrien zoroastrisme parsi feu sacré afrinagan', {elev: 0})],
            // 🕯 souvenirs, sans religion
            ['rl_memorial', 'Coin mémoire (photo, bougie, fleurs)', 70, 35, 40, '#3a2a1a', 'r_memorial', O('souvenir mémoire deuil défunt photo bougie fleurs laïque', {elev: 76, color2: '#c0392b'})],
            ['rl_urn', 'Urne funéraire', 25, 25, 35, '#3a4a5a', 'r_urn', O('souvenir urne cendres crémation deuil', {elev: 90, color2: '#c9a24a'})],
            ['rl_mourning', 'Cadre de deuil (photo et ruban noir)', 30, 4, 40, '#1a1a1a', 'mirror', O('souvenir deuil photo ruban noir défunt cadre', {elev: 140, pic: 'portrait'})],
            ['rl_candle', 'Bougie du souvenir', 10, 10, 15, '#f4ecd8', 'r_diya', O('souvenir bougie mémoire lumière', {elev: 76, color2: '#f4ecd8', tall: 1})],
            ['rl_letters', 'Boîte à lettres d’amour (correspondance)', 35, 25, 15, '#8b3a3a', 'r_box', OLD('souvenir lettres correspondance boîte amour', {elev: 76})],
            ['rl_shadowbox', 'Vitrine à médailles et souvenirs militaires', 50, 8, 40, '#3a2a1a', 'r_shadowbox', O('souvenir médailles militaire guerre vitrine cadre', {elev: 140, color2: '#2a4a8a'})],
        ],
    };

    /* ═════════ Entrer dans le catalogue ═════════ */
    let done = false;
    function addAll() {
        const LIB = ext.houseLib?.LIB; if (done || !LIB) return done;
        const have = new Set(LIB.map(l => l[0]));
        Object.entries(ROWS).forEach(([cat, rows]) => rows.forEach(([k, n, w, d, h, c, s, o]) => { if (have.has(k)) return; have.add(k); LIB.push([k, n, cat, w, d, h, c, s, s, {...(o || {})}]); }));
        done = true; return true;
    }
    if (!addAll()) document.addEventListener('DOMContentLoaded', addAll, {once: true});
    setTimeout(addAll, 0);
    ext.houseCultes = {ROWS, count: () => Object.values(ROWS).reduce((s, r) => s + r.length, 0), addAll};
    const L9of = it => ext.houseLib?.libOf?.(it?.kind)?.[9] || {};

    /* ═════════ Les dessins vus de dessus (centrés en 0, 0 ; boîte w × d ; le haut du dessin = le dos de l'objet) ═════════ */
    const N = v => Math.round(v * 100) / 100;
    function sym(k, item, {R, S, c, w, d, x0, y0}) {
        const x1 = w / 2, y1 = d / 2, m = Math.min(w, d), c2 = /^#[0-9a-f]{6}$/i.test(item.color2 || '') ? item.color2 : '#c9a24a', K = '#3a3530', G = '#c9a24a';
        const E = (cx, cy, rx, ry, f = c, ex = '') => `<ellipse cx="${N(cx)}" cy="${N(cy)}" rx="${N(Math.max(.1, rx))}" ry="${N(Math.max(.1, ry))}" fill="${f}" ${S} ${ex}/>`;
        const Ci = (cx, cy, r, f = c, ex = '') => E(cx, cy, r, r, f, ex);
        const P = (dd, f = 'none', ex = '') => `<path d="${dd}" fill="${f}" ${S} ${ex}/>`;
        const Rr = (x, y, ww, hh, rx = 0, f = c, ex = '') => `<rect x="${N(x)}" y="${N(y)}" width="${N(Math.max(.1, ww))}" height="${N(Math.max(.1, hh))}" rx="${N(rx)}" fill="${f}" ${S} ${ex}/>`;
        const Ln = (dd, ex = '') => `<path d="${dd}" fill="none" ${S} ${ex}/>`;
        const rep = (n, f) => Array.from({length: Math.max(0, n)}, (_, i) => f(i, n)).join('');
        const wall = (f = c) => R(x0, y0, w, Math.max(2, d), f);
        const flames = (n, y = 0) => rep(n, i => Ci(x0 + w * (i + .5) / n, y, Math.max(.8, Math.min(2, w / n * .25)), '#ffb347'));
        switch (k) {
            case 'r_plaque': case 'r_scroll': case 'r_shadowbox': case 'r_iconcorner': case 'r_beads': return wall() + Rr(x0 + w * .2, y1, w * .6, 2, 0, c2);
            case 'r_mezuzah': return Rr(x0, y0, w, d, 1);
            case 'r_menorah': case 'r_hanukiah': return R(x0, -d * .15, w, d * .3) + Ci(0, 0, m * .25, K) + flames(k === 'r_menorah' ? 7 : 9);
            case 'r_candlepair': return Ci(x0 + w * .25, 0, m * .35) + Ci(x1 - w * .25, 0, m * .35) + Ci(x0 + w * .25, 0, m * .12, '#ffb347') + Ci(x1 - w * .25, 0, m * .12, '#ffb347');
            case 'r_advent': return Ci(0, 0, m / 2) + Ci(0, 0, m * .32, '#f4f1ea') + rep(4, i => Ci(Math.cos(i * 1.571) * m * .41, Math.sin(i * 1.571) * m * .41, m * .07, i === 2 ? '#e8b4c8' : c2));
            case 'r_creche': return R(x0, y0, w, d) + P(`M${x0} ${y0}L0 ${N(y0 - d * .2)}L${x1} ${y0}`, c2) + rep(4, i => Ci(x0 + w * (i + .5) / 4, y1 - d * .3, m * .07, '#e9dcc3'));
            case 'r_ark': return R(x0, y0, w, d) + Rr(x0 + w * .1, y1 - d * .2, w * .8, d * .2, 0, c2);
            case 'r_lectern2': return R(x0, y0, w, d) + Rr(x0 + w * .1, y0 + d * .1, w * .8, d * .5, 1, c2);
            case 'r_cup': case 'r_urn': case 'r_bell': return Ci(0, 0, m / 2) + Ci(0, 0, m * .3, c2);
            case 'r_dish': return Ci(0, 0, m / 2) + rep(6, i => Ci(Math.cos(i * 1.047) * m * .3, Math.sin(i * 1.047) * m * .3, m * .07, c2));
            case 'r_hangcloth': return R(x0, -2, w, 4, K) + Rr(x0 + 2, -d / 2, w - 4, d, 0, c, 'opacity=".85"') + Ln(`M${x0 + 4} ${N(y1)}H${x1 - 4}`, `stroke="${c2}"`);
            case 'r_box': case 'r_book': return Rr(x0, y0, w, d, 1) + Ln(`M${x0} ${N(y0 + d * .3)}H${x1}`, `stroke="${c2 === '#c9a24a' ? K : c2}"`);
            case 'r_prayerrug': return Rr(x0, y0, w, d, 1) + Rr(x0 + w * .08, y0 + d * .06, w * .84, d * .88, 0, 'none', `stroke="${c2}"`) + P(`M${N(x0 + w * .2)} ${N(y0 + d * .35)}Q0 ${N(y0 + d * .05)} ${N(x1 - w * .2)} ${N(y0 + d * .35)}`, 'none', `stroke="${c2}"`);
            case 'r_rehal': return Ln(`M${x0} ${y0}L${x1} ${y1}M${x0} ${y1}L${x1} ${y0}`) + R(x0, -d * .1, w, d * .2, '#2f6a4a');
            case 'r_fanous': case 'r_lantern': case 'r_paperlantern': return P(`M0 ${y0}L${x1} ${N(y0 + d * .3)}V${N(y1 - d * .3)}L0 ${y1}L${x0} ${N(y1 - d * .3)}V${N(y0 + d * .3)}Z`, c) + Ci(0, 0, m * .2, '#ffd27a');
            case 'r_mihrab': return wall('#e9dcc3') + P(`M${N(x0 + w * .15)} ${N(y1)}V${N(y0 + 1)}H${N(x1 - w * .15)}V${N(y1)}`, 'none', `stroke="${c2}"`);
            case 'r_censer': case 'r_incense': case 'r_afrinagan': return Ci(0, 0, m / 2) + Ci(0, 0, m * .3, '#5a5a5a') + rep(3, i => Ci(Math.cos(i * 2.094) * m * .12, Math.sin(i * 2.094) * m * .12, m * .04, '#ff8a3a'));
            case 'r_buddha': case 'r_ganesh': return E(0, d * .1, w * .48, d * .38) + Ci(0, -d * .1, m * .2) + Ci(0, -d * .1, m * .08, c2);
            case 'r_nataraja': return R(x0, y0, w, d * .5, c2) + Ci(0, 0, m * .45, 'none') + Ci(0, 0, m * .15);
            case 'r_butsudan': case 'r_mandir': case 'r_palki': case 'r_ancestral': return R(x0, y0, w, d) + Rr(x0 + w * .15, y0 + d * .15, w * .7, d * .55, 0, c2, 'opacity=".55"') + Rr(x0 + w * .4, y1 - d * .2, w * .2, d * .12, 1, K);
            case 'r_stupa': return Ci(0, 0, m / 2) + Ci(0, 0, m * .32, '#f4f1ea') + Ci(0, 0, m * .1, c2);
            case 'r_prayerwheel': return Ci(0, 0, m * .4) + rep(8, i => Ci(Math.cos(i * .785) * m * .4, Math.sin(i * .785) * m * .4, m * .05, c2)) + Ci(0, 0, m * .1, K);
            case 'r_flags': return Ln(`M${x0} 0H${x1}`, `stroke="${K}"`) + rep(Math.max(4, Math.round(w / 25)), (i, n) => Rr(x0 + w * (i + .1) / n, -d / 2, w / n * .8, d, 0, L9of(item).rope ? '#d9b75a' : L9of(item).flowers ? ['#e0902a', '#f2c500'][i % 2] : ['#2a5db0', '#f4f1ea', '#c0392b', '#3a8a5a', '#f2c500'][i % 5]));
            case 'r_gong': return Rr(x0, -d * .1, w, d * .2, 0, c) + Rr(x0, y0, w * .08, d, 0, c) + Rr(x1 - w * .08, y0, w * .08, d, 0, c) + E(0, 0, w * .3, d * .12, c2);
            case 'r_zafu': return Rr(x0, y0, w, d, 4) + Ci(0, 0, m * .25, c2);
            case 'r_diya': return E(0, 0, w / 2, d * .4) + Ci(w * .25, 0, m * .1, '#ffb347');
            case 'r_tulsi': return Rr(x0, y0, w, d, 2) + Ci(0, 0, m * .35, '#3a8a3a') + rep(6, i => Ci(Math.cos(i) * m * .2, Math.sin(i) * m * .2, m * .08, '#4a9a4a'));
            case 'r_rangoli': return rep(4, i => Ci(0, 0, m * (.5 - i * .11), ['#e0702a', '#f2c500', '#c0392b', '#2a5db0'][i])) + rep(8, i => Ci(Math.cos(i * .785) * m * .38, Math.sin(i * .785) * m * .38, m * .06, '#f4f1ea'));
            case 'r_manji': return R(x0, y0, w, d) + Rr(x0 + w * .1, y0 + d * .1, w * .8, d * .8, 2, c2);
            case 'r_kamidana': return R(x0, y0, w, d) + P(`M${x0 + w * .3} ${N(y0 + d * .5)}L0 ${N(y0 + d * .1)}L${x1 - w * .3} ${N(y0 + d * .5)}`, 'none') + R(x0 + w * .38, y0 + d * .5, w * .24, d * .4, '#e9e4da');
            case 'r_torii': return Rr(x0, -d * .2, w, d * .4, 1, c2) + Ci(x0 + w * .2, 0, m * .25) + Ci(x1 - w * .2, 0, m * .25);
            case 'r_tablets': return R(x0, y0, w, d, c) + rep(4, i => Rr(x0 + w * (i + .2) / 4, y0 + d * .2, w / 4 * .6, d * .6, 0, c2));
            case 'r_memorial': return R(x0, y0, w, d) + Rr(x0 + w * .1, y0, w * .3, d * .3, 0, '#e9e4da') + Ci(x1 - w * .3, 0, m * .12, '#f4ecd8') + Ci(x1 - w * .12, d * .1, m * .15, c2);
            default: return undefined;
        }
    }
    const prev2 = ext.houseSym2dX;
    ext.houseSym2dX = (k, item, o) => (typeof k === 'string' && k.startsWith('r_') ? sym(k, item, o) : undefined) ?? prev2?.(k, item, o);

    /* ═════════ Les formes en volume (mètres ; le devant regarde +z) ═════════ */
    const TXC = new Map(), TMC = new Map();
    function ctex(T, key, W, H, draw) {
        if (TXC.has(key)) return TXC.get(key);
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H; draw(cv.getContext('2d'), W, H);
        const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; TXC.set(key, t); return t;
    }
    const texMat = (T, t, o = {}) => { const k = t.uuid + JSON.stringify(o); if (!TMC.has(k)) TMC.set(k, new T.MeshStandardMaterial({map: t, roughness: .8, ...o})); return TMC.get(k); };
    const okHex = v => /^#[0-9a-f]{6}$/i.test(v || '');
    /** une face avec un symbole (✡ ☪ ☸ ॐ ☬ ☯…) ou un mot, couleur de fond et d'encre */
    const symTex = (T, s, bg, ink, W = 256, H = 256) => ctex(T, `rsym|${s}|${bg}|${ink}|${W}x${H}`, W, H, (g) => {
        g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = ink; g.lineWidth = Math.max(4, W * .03); g.strokeRect(W * .04, H * .04, W * .92, H * .92);
        g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; const long = [...s].length > 2;
        g.font = `${Math.round(Math.min(W, H) * (long ? .32 : .62))}px "Noto Sans Symbols", "Segoe UI Symbol", "Noto Naskh Arabic", "Noto Sans Hebrew", "Noto Sans Devanagari", serif`; g.fillText(s, W / 2, H * .53, W * .85);
    });
    function f3(shape, x) {
        const {T, w, d, h, col, it} = x, mat = x.mat, col2 = x.col2 || '', m = Math.min(w, d), PI = Math.PI, L9 = L9of(it);
        const sh = (c, f) => '#' + new T.Color(c).multiplyScalar(f).getHexString(), dk = col2 || sh(col, .55), gold = col2 || '#c9a24a';
        let tgt = x.g; const add = (o, px = 0, py = 0, pz = 0) => { o.position.set(px, py, pz); tgt.add(o); return o; };
        const M_ = c => (c && c.isMaterial) ? c : mat(c);
        const Bx = (ww, hh, dd, c = col, px = 0, py = hh / 2, pz = 0) => add(x.box(Math.max(.002, ww), Math.max(.002, hh), Math.max(.002, dd), M_(c)), px, py, pz);
        const Cy = (rt, rb, hh, c = col, px = 0, py = hh / 2, pz = 0, seg = 20) => add(new T.Mesh(new T.CylinderGeometry(Math.max(.001, rt), Math.max(.001, rb), Math.max(.001, hh), seg), M_(c)), px, py, pz);
        const CyX = (r, len, c, px, py, pz, seg = 12) => { const o = Cy(r, r, len, c, px, py, pz, seg); o.rotation.z = PI / 2; return o; };
        const Sp = (rx, ry, rz, c = col, px = 0, py = 0, pz = 0, seg = 14) => { const o = add(new T.Mesh(new T.SphereGeometry(1, seg, Math.max(6, seg * .6 | 0)), M_(c)), px, py, pz); o.scale.set(Math.max(.001, rx), Math.max(.001, ry), Math.max(.001, rz)); return o; };
        const To = (r, t, c = col, px = 0, py = 0, pz = 0, arc = PI * 2, seg = 24) => add(new T.Mesh(new T.TorusGeometry(Math.max(.002, r), Math.max(.001, t), 8, seg, arc), M_(c)), px, py, pz);
        const Co = (r, hh, c = col, px = 0, py = hh / 2, pz = 0, seg = 16) => add(new T.Mesh(new T.ConeGeometry(Math.max(.001, r), Math.max(.001, hh), seg), M_(c)), px, py, pz);
        const V = (a, b, c) => new T.Vector3(a, b, c), UP = V(0, 1, 0);
        const Rod = (a, b, r = .01, c = dk, seg = 8) => { const A0 = V(...a), B0 = V(...b), dir = B0.clone().sub(A0), len = dir.length() || .001; const o = add(new T.Mesh(new T.CylinderGeometry(r, r, len, seg), M_(c)), (A0.x + B0.x) / 2, (A0.y + B0.y) / 2, (A0.z + B0.z) / 2); o.quaternion.setFromUnitVectors(UP, dir.normalize()); return o; };
        const plane = (ww, hh, t, px, py, pz, o = {}) => add(new T.Mesh(new T.PlaneGeometry(ww, hh), texMat(T, t, o)), px, py, pz);
        const metal = (c = '#c9a24a', r = .35) => mat(c, '', {metalness: .6, roughness: r});
        const glow = (c = '#ffb347', k = 1.6) => mat(c, '', {emissive: c, emissiveIntensity: k});
        const flame = (px, py, pz, s = 1) => { Sp(.006 * s, .014 * s, .006 * s, glow(), px, py + .012 * s, pz, 8); };
        const candle = (px, py, pz, r = .009, hh = .06, c = '#f4ecd8') => { Cy(r, r, hh, c, px, py + hh / 2, pz, 10); flame(px, py + hh, pz); };
        const legs4 = (top, lw = .04, c = col) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => Bx(lw, top, lw, c, a * (w / 2 - lw / 2), top / 2, b * (d / 2 - lw / 2)));
        const roofPeak = (ww, dd, hh, c, py) => { const s0 = new T.Shape([new T.Vector2(-ww / 2, 0), new T.Vector2(ww / 2, 0), new T.Vector2(0, hh)]); const geo = new T.ExtrudeGeometry(s0, {depth: dd, bevelEnabled: false}); geo.translate(0, 0, -dd / 2); return add(new T.Mesh(geo, M_(c)), 0, py, 0); };
        const branches = n => { const top = h * .92, base = h * .3; Cy(m * .35, m * .45, .03, metal(col), 0, .015); Cy(.012, .015, base, metal(col), 0, .03 + base / 2);
            const half = (n - 1) / 2; for (let i = 0; i < n; i++) { const k = i - half, px = k * (w * .9 / (n - 1)); if (k === 0) { Cy(.01, .01, top - base, metal(col), 0, base + (top - base) / 2); }
                else if (n === 7) { const r = Math.abs(px); To(r / 2, .006, metal(col), px / 2, base + .02, 0, PI, 16).rotation.z = PI; Cy(.008, .008, top - base - r / 2, metal(col), px, base + .02 + (top - base - r / 2) / 2); }
                else { Rod([0, base, 0], [px, base + .03, 0], .006, metal(col)); Cy(.008, .008, top - base - .03, metal(col), px, base + .03 + (top - base - .03) / 2); }
                Cy(.014, .01, .012, metal(col), px, top + .006); candle(px, top + .012, 0, .006, .03); } };
        switch (shape) {
            /* ── plaques, cadres, rouleaux ── */
            case 'r_plaque': { const dd = Math.max(.012, d), s = L9.sym || '✝', bg = okHex(col2) ? col2 : '#f4ecd8'; Bx(w, h, dd, col, 0, h / 2, 0); plane(w * .88, h * .88, symTex(T, s, bg, col, 256, Math.round(256 * Math.max(.3, Math.min(3, h / w)))), 0, h / 2, dd / 2 + .001); return true; }
            case 'r_scroll': { CyX(.012, w + .06, metal(gold), 0, h - .01, 0); CyX(.014, w + .04, mat('#3a2a1a'), 0, .014, 0); Bx(w, h - .03, .004, col, 0, h / 2, 0);
                plane(w * .8, (h - .03) * .8, ctex(T, 'rthangka', 128, 200, (g, W, H) => { g.fillStyle = '#e9c46a'; g.fillRect(0, 0, W, H); g.fillStyle = '#2a5db0'; g.beginPath(); g.arc(W / 2, H * .42, W * .32, 0, 7); g.fill(); g.fillStyle = '#c9a24a'; g.beginPath(); g.ellipse(W / 2, H * .52, W * .18, H * .2, 0, 0, 7); g.fill(); g.beginPath(); g.arc(W / 2, H * .28, W * .1, 0, 7); g.fill(); g.fillStyle = '#c0392b'; g.fillRect(W * .2, H * .78, W * .6, H * .1); }), 0, h / 2, .003); return true; }
            case 'r_shadowbox': { const dd = Math.max(.04, d); Bx(w, h, .01, col, 0, h / 2, -dd / 2 + .005); [[w, .02, 0, h - .01], [w, .02, 0, .01]].forEach(([ww, hh, px, py]) => Bx(ww, hh, dd, col, px, py, 0)); [-1, 1].forEach(s => Bx(.02, h, dd, col, s * (w / 2 - .01), h / 2, 0));
                Bx(w - .04, h - .04, .004, okHex(col2) ? col2 : '#2a4a8a', 0, h / 2, -dd / 2 + .012); for (let i = 0; i < 4; i++) { const px = -w * .3 + i * w * .2; Bx(.02, .05, .004, ['#c0392b', '#2a5db0', '#f4f1ea', '#3a8a5a'][i], px, h * .62, -dd / 2 + .016); Cy(.016, .016, .004, metal('#c9a24a'), px, h * .45, -dd / 2 + .018).rotation.x = PI / 2; }
                Bx(w - .04, h - .04, .003, mat('#cfe6f3', '', {transparent: true, opacity: .25}), 0, h / 2, dd / 2 - .004); return true; }
            case 'r_iconcorner': { const sh0 = .03; Bx(w, sh0, d, col, 0, .015); for (let i = 0; i < 3; i++) { const iw = i === 1 ? w * .36 : w * .26, ih = i === 1 ? h * .75 : h * .55, px = (i - 1) * w * .33; Bx(iw, ih, .02, metal(col, .4), px, sh0 + ih / 2, -d / 2 + .02);
                    plane(iw * .82, ih * .82, ctex(T, 'ricon', 96, 128, (g, W, H) => { g.fillStyle = '#c9a24a'; g.fillRect(0, 0, W, H); g.fillStyle = '#8b1a1a'; g.beginPath(); g.ellipse(W / 2, H * .7, W * .32, H * .32, 0, PI, 0); g.fill(); g.fillStyle = '#d9b48a'; g.beginPath(); g.arc(W / 2, H * .38, W * .14, 0, 7); g.fill(); g.strokeStyle = '#f4dc8a'; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, H * .38, W * .22, 0, 7); g.stroke(); }), px, sh0 + ih / 2, -d / 2 + .031); }
                Cy(.025, .02, .05, mat(okHex(col2) ? col2 : '#8b1a1a', '', {transparent: true, opacity: .7}), 0, sh0 + .025, d * .2); flame(0, sh0 + .03, d * .2); return true; }
            case 'r_beads': { const n = 26; for (let i = 0; i < n; i++) { const a = PI * 2 * i / n; Sp(.006, .006, .006, col, Math.sin(a) * w * .35, h * .62 + Math.cos(a) * h * .3, 0, 6); } Rod([0, h * .32, 0], [0, h * .1, 0], .003, col); Bx(.004, .05, .004, col, 0, .04, 0); Bx(.03, .004, .004, col, 0, .055, 0); return true; }
            case 'r_mezuzah': Bx(w, h, d, metal(col), 0, h / 2); Bx(w * .5, h * .1, .002, '#2a4a8a', 0, h * .8, d / 2 + .001); return true;
            /* ── chandeliers, bougies ── */
            case 'r_menorah': branches(7); return true;
            case 'r_hanukiah': { branches(9); Cy(.01, .01, .05, metal(col), 0, h * .92 + .02); candle(0, h * .92 + .045, 0, .006, .03); return true; }
            case 'r_candlepair': [-1, 1].forEach(s => { const px = s * w * .25; Cy(m * .25, m * .35, .015, metal(col), px, .0075); Cy(.01, .012, h * .55, metal(col), px, .015 + h * .275); Cy(.022, .014, .02, metal(col), px, h * .58); candle(px, h * .59, 0, .01, h * .35); }); return true;
            case 'r_advent': { To(m * .38, m * .1, col, 0, m * .06, 0).rotation.x = PI / 2; for (let i = 0; i < 4; i++) { const a = i * PI / 2; candle(Math.cos(a) * m * .38, m * .1, Math.sin(a) * m * .38, .018, h * .55, i === 2 ? '#e8b4c8' : (okHex(col2) ? col2 : '#7a2a6a')); } for (let i = 0; i < 6; i++) { const a = i * 1.047 + .4; Sp(.012, .012, .012, '#c0392b', Math.cos(a) * m * .45, m * .1, Math.sin(a) * m * .45, 8); } return true; }
            case 'r_diya': { if (L9.tall) { Cy(m * .4, m * .4, h * .8, col, 0, h * .4); Cy(m * .42, m * .42, .004, mat('#cfe6f3', '', {transparent: true, opacity: .3}), 0, h * .8); flame(0, h * .8, 0, 1.3); return true; }
                const s0 = new T.LatheGeometry([V(0, 0, 0), V(m * .3, 0, 0), V(m * .5, h * .7, 0), V(m * .45, h, 0)].map(p => new T.Vector2(p.x, p.y)), 20); add(new T.Mesh(s0, mat(col, '', {side: T.DoubleSide})));
                Cy(m * .42, m * .42, .002, mat(okHex(col2) ? col2 : '#e0c46a', '', {roughness: .2}), 0, h * .7); Rod([w * .2, h * .7, 0], [w * .42, h * .95, 0], .002, '#f4f1ea'); flame(w * .42, h * .92, 0, 1.2); return true; }
            /* ── la crèche, l'arche, les pupitres ── */
            case 'r_creche': { Bx(w, .02, d, '#7a5a3a', 0, .01); [-1, 1].forEach(s => Bx(.03, h * .75, .03, col, s * (w / 2 - .02), h * .375, -d / 2 + .03)); Bx(w, .02, .03, col, 0, h * .75, -d / 2 + .03); roofPeak(w + .06, d * .7, h * .25, okHex(col2) ? col2 : '#c9b38a', h * .75).position.z = -d * .1;
                Bx(.12, .04, .07, '#c9a77a', 0, .04, 0); Sp(.02, .012, .03, '#f4ecd8', 0, .065, 0, 8); [[-.12, '#2a5db0'], [.12, '#7a4a2a'], [-.22, '#8a7a6a'], [.22, '#c0392b']].forEach(([px, c]) => { Cy(.022, .03, .1, c, w * px, .07, .05, 10); Sp(.018, .02, .018, '#d9b48a', w * px, .135, .05, 8); }); Sp(.012, .012, .012, glow('#ffe48a', 2), 0, h * .99, -d * .1, 8); return true; }
            case 'r_ark': { const c2m = okHex(col2) ? col2 : '#2a4a8a'; Bx(w, h * .85, d, col, 0, h * .425); roofPeak(w + .04, d + .02, h * .15, col, h * .85); Bx(w * .7, h * .62, .015, mat(c2m, 'tissu'), 0, h * .12 + h * .31, d / 2 + .01);
                plane(w * .25, w * .25, symTex(T, '✡', c2m, '#c9a24a'), 0, h * .55, d / 2 + .019); Bx(w * .75, .03, .03, metal('#c9a24a'), 0, h * .75, d / 2 + .02); for (let i = 0; i < 2; i++) Bx(w * .3, .05, .05, metal('#c9a24a'), (i ? 1 : -1) * w * .2, h * .92, d / 2); return true; }
            case 'r_lectern2': { Bx(w, h * .85, d * .7, col, 0, h * .425, -d * .15); const top = new T.Group(); tgt.add(top); top.position.set(0, h * .9, d * .05); top.rotation.x = .3; const prev = tgt; tgt = top; Bx(w, .03, d * .8, col, 0, 0); Bx(w * .96, .006, d * .7, mat(okHex(col2) ? col2 : '#2a4a8a', 'tissu'), 0, .018); tgt = prev; return true; }
            case 'r_book': { Bx(w * .7, h, d, col, 0, h / 2); Bx(w * .66, h * .8, .002, '#f4f1ea', 0, h / 2, d / 2 + .001); Bx(w * .3, h * .6, .002, metal(gold), 0, h / 2, d / 2 + .002); return true; }
            case 'r_box': Bx(w, h * .8, d, col, 0, h * .4); Bx(w + .006, h * .2, d + .006, sh(col, .8), 0, h * .9); Bx(w * .3, .004, .004, metal(gold), 0, h * .8, d / 2 + .003); return true;
            case 'r_cup': { if (it.kind === 'rl_singingbowl') { Sp(m * .45, m * .2, m * .45, mat('#8b1a1a', 'tissu'), 0, m * .05); const s0 = new T.LatheGeometry([[0, 0], [m * .25, 0], [m * .48, h * .7], [m * .46, h]].map(([a, b]) => new T.Vector2(a, b)), 24); add(new T.Mesh(s0, metal(col, .3)), 0, m * .1, 0); return true; }
                Cy(m * .5, m * .5, .01, metal(col), 0, .005); Cy(m * .12, m * .2, h * .08, metal(col), 0, .01 + h * .04); Cy(.008, .01, h * .45, metal(col), 0, .01 + h * .3); const s0 = new T.LatheGeometry([[0, 0], [m * .1, 0], [m * .22, h * .4], [m * .2, h * .45]].map(([a, b]) => new T.Vector2(a, b)), 18); add(new T.Mesh(s0, metal(col, .3)), 0, h * .55, 0); return true; }
            case 'r_dish': { Cy(m * .5, m * .45, h, metal(col, .3), 0, h / 2, 0, 24); if (it.kind !== 'rl_misbaha') for (let i = 0; i < 6; i++) { const a = i * 1.047; Cy(m * .08, m * .07, h * .6, mat(okHex(col2) ? col2 : '#c9a24a'), Math.cos(a) * m * .3, h + h * .3, Math.sin(a) * m * .3, 12); }
                if (it.kind === 'rl_misbaha') for (let i = 0; i < 20; i++) { const a = i * PI / 10; Sp(.005, .005, .005, '#3a2a1a', Math.cos(a) * m * .2, h + .01, Math.sin(a) * m * .2, 6); } return true; }
            case 'r_hangcloth': { const c2m = okHex(col2) ? col2 : '#2a4a8a'; CyX(.008, w, metal('#8a8f96'), 0, h - .01, 0); Rod([0, h - .01, 0], [0, h + .06, 0], .004, metal('#8a8f96')); Bx(w * .96, h * .9, .006, mat(col, 'tissu'), 0, h * .5, 0);
                [.2, .28, .7, .78].forEach(t => Bx(w * .96, .025, .008, mat(c2m, 'tissu'), 0, h * t, 0)); for (let i = 0; i < 4; i++) Rod([(-.45 + i * .3) * w, h * .05, 0], [(-.45 + i * .3) * w, -.06, 0], .002, '#f4f1ea'); return true; }
            /* ── islam ── */
            case 'r_prayerrug': { Bx(w, Math.max(.005, h), d, mat(col, 'tissu'), 0, Math.max(.005, h) / 2);
                plane(w * .96, d * .96, ctex(T, `rrug|${col}|${col2}`, 128, 220, (g, W, H) => { g.fillStyle = col; g.fillRect(0, 0, W, H); const g2 = okHex(col2) ? col2 : '#c9a24a'; g.strokeStyle = g2; g.lineWidth = 5; g.strokeRect(8, 8, W - 16, H - 16); g.lineWidth = 3; g.beginPath(); g.moveTo(W * .22, H * .85); g.lineTo(W * .22, H * .3); g.quadraticCurveTo(W / 2, H * .02, W * .78, H * .3); g.lineTo(W * .78, H * .85); g.stroke(); g.fillStyle = g2; g.beginPath(); g.arc(W / 2, H * .22, 5, 0, 7); g.fill(); for (let i = 0; i < 6; i++) g.fillRect(W * .2 + i * W * .12, H * .9, 4, 6); }), 0, Math.max(.005, h) + .001, 0).rotation.x = -PI / 2; return true; }
            case 'r_rehal': { [-1, 1].forEach(s => { const o = Bx(w, .012, d * 1.1, col, 0, h / 2, 0); o.rotation.x = s * .9; }); const bk = Bx(w * .9, .04, d * .5, mat('#2f6a4a'), 0, h * .85, 0); bk.rotation.x = 0; Bx(w * .88, .002, d * .48, metal('#c9a24a'), 0, h * .85 + .021, 0); return true; }
            case 'r_fanous': { const c2m = okHex(col2) ? col2 : '#c0392b'; Cy(m * .3, m * .4, h * .1, metal(col), 0, h * .05, 0, 6); Cy(m * .45, m * .45, h * .55, mat(c2m, '', {transparent: true, opacity: .55, emissive: c2m, emissiveIntensity: .5}), 0, h * .1 + h * .275, 0, 6);
                for (let i = 0; i < 6; i++) { const a = i * PI / 3; Rod([Math.cos(a) * m * .45, h * .1, Math.sin(a) * m * .45], [Math.cos(a) * m * .45, h * .65, Math.sin(a) * m * .45], .004, metal(col)); } Co(m * .5, h * .25, metal(col), 0, h * .65 + h * .125, 0, 6); To(m * .1, .004, metal(col), 0, h * .95, 0); flame(0, h * .3, 0, 1.4); return true; }
            case 'r_mihrab': { const c2m = okHex(col2) ? col2 : '#2f6a4a'; Bx(w, h, d * .4, col, 0, h / 2, -d * .3); const ah = h * .8;
                plane(w * .7, ah, ctex(T, `rmihrab|${c2m}`, 128, 256, (g, W, H) => { g.fillStyle = '#e9dcc3'; g.fillRect(0, 0, W, H); g.fillStyle = c2m; g.beginPath(); g.moveTo(W * .1, H); g.lineTo(W * .1, H * .35); g.quadraticCurveTo(W / 2, -H * .05, W * .9, H * .35); g.lineTo(W * .9, H); g.fill(); g.fillStyle = '#c9a24a'; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(W * (.2 + (i % 4) * .2), H * (.45 + (i >> 2) * .2), 6, 0, 7); g.fill(); } }), 0, ah / 2 + h * .06, -d * .1 + .002); return true; }
            /* ── encens, feu ── */
            case 'r_censer': case 'r_incense': { const tri = L9.tripod || shape === 'r_censer' && it.kind !== 'rl_mabkhara';
                if (tri) { for (let i = 0; i < 3; i++) { const a = i * 2.094; Rod([Math.cos(a) * m * .35, 0, Math.sin(a) * m * .35], [Math.cos(a) * m * .3, h * .3, Math.sin(a) * m * .3], .008, metal(col, .5)); } Sp(m * .42, h * .3, m * .42, metal(col, .5), 0, h * .4, 0, 18); [-1, 1].forEach(s => To(.025, .006, metal(col), s * m * .42, h * .62, 0, PI).rotation.y = PI / 2); }
                else if (it.kind === 'rl_mabkhara') { Cy(m * .3, m * .4, h * .3, col, 0, h * .15, 0, 4); Cy(m * .35, m * .3, h * .3, col, 0, h * .45, 0, 4); Cy(m * .45, m * .35, h * .2, metal('#c9a24a'), 0, h * .7, 0, 16); Sp(m * .2, .01, m * .2, glow('#ff6a2a', 1), 0, h * .8); }
                else Cy(m * .45, m * .35, h * .2, col, 0, h * .1, 0, 18);
                const top = tri ? h * .6 : it.kind === 'rl_mabkhara' ? h * .8 : h * .2; for (let i = 0; i < 3; i++) { const a = i * 2.094; Rod([Math.cos(a) * .01, top, Math.sin(a) * .01], [Math.cos(a) * .03, h, Math.sin(a) * .03], .0015, '#7a3a1a', 4); Sp(.002, .002, .002, glow('#ff4a1a', 2), Math.cos(a) * .03, h, Math.sin(a) * .03, 4); } return true; }
            case 'r_afrinagan': { const br = metal(col, .35); Cy(m * .3, m * .4, h * .1, br, 0, h * .05, 0, 18); Cy(m * .08, m * .12, h * .45, br, 0, h * .1 + h * .225, 0, 14); const s0 = new T.LatheGeometry([[0, 0], [m * .2, 0], [m * .5, h * .3], [m * .48, h * .35]].map(([a, b]) => new T.Vector2(a, b)), 20); add(new T.Mesh(s0, br), 0, h * .55, 0);
                for (let i = 0; i < 4; i++) Co(m * .08, h * .2 - i * .02, glow(['#ff8a2a', '#ffb347', '#ff6a2a', '#ffd27a'][i], 1.8), (i % 2 ? 1 : -1) * m * .08, h * .85 + (h * .2 - i * .02) / 2, (i > 1 ? 1 : -1) * m * .06, 8); return true; }
            /* ── statues ── */
            case 'r_buddha': { const st = mat(col), base = h * .12; Cy(m * .48, m * .5, base, col2 && it.kind === 'rl_buddha' ? metal(col2, .3) : st, 0, base / 2, 0, 20); Sp(w * .44, h * .14, d * .4, st, 0, base + h * .1, d * .05, 16);
                Sp(w * .27, h * .22, d * .24, st, 0, base + h * .38, 0, 14); Sp(w * .14, w * .16, w * .14, st, 0, base + h * .66, 0, 14); Sp(w * .06, w * .07, w * .06, st, 0, base + h * .66 + w * .19, -.005, 10); [-1, 1].forEach(s => Sp(w * .07, h * .14, d * .08, st, s * w * .25, base + h * .3, d * .06, 10)); Sp(w * .12, h * .04, d * .1, st, 0, base + h * .2, d * .2, 10); return true; }
            case 'r_ganesh': { const st = mat(col), base = h * .1; Cy(m * .5, m * .5, base, metal(okHex(col2) ? col2 : '#c9a24a'), 0, base / 2); Sp(w * .42, h * .25, d * .4, st, 0, base + h * .22); Sp(w * .25, w * .25, w * .22, st, 0, base + h * .58, d * .05);
                [-1, 1].forEach(s => Sp(w * .2, w * .22, .01, st, s * w * .3, base + h * .62, -d * .05)); Rod([0, base + h * .55, d * .2], [w * .08, base + h * .3, d * .32], .02, st); Co(w * .1, h * .15, metal('#c9a24a'), 0, base + h * .58 + w * .25 + h * .075, 0, 12); [-1, 1].forEach(s => { Rod([s * w * .3, base + h * .4, 0], [s * w * .45, base + h * .55, d * .1], .015, st); Rod([s * w * .3, base + h * .3, 0], [s * w * .42, base + h * .2, d * .2], .015, st); }); return true; }
            case 'r_nataraja': { const br = metal(col, .3), base = h * .1; Bx(w * .7, base, d, br, 0, base / 2); To(w * .42, .008, br, 0, base + w * .42, 0, PI * 1.2, 30).rotation.z = -PI * .1; for (let i = 0; i < 9; i++) { const a = -PI * .1 + i * PI * 1.2 / 8; Co(.008, .025, glow('#ffb347', .8), Math.cos(a) * w * .42, base + w * .42 + Math.sin(a) * w * .42, 0, 6); }
                const cx = 0, cy = base + w * .38; Rod([cx, cy - h * .15, 0], [cx, cy + h * .12, 0], .015, br); Sp(.025, .03, .025, br, cx, cy + h * .17, 0, 10); Rod([cx, cy - h * .15, 0], [cx - w * .1, base + .01, 0], .01, br); Rod([cx, cy - h * .15, 0], [cx + w * .18, cy - h * .05, 0], .01, br); [[-.2, .1], [.2, .12], [-.15, -.02], [.18, .0]].forEach(([a, b]) => Rod([cx, cy + h * .05, 0], [cx + w * a, cy + h * b, 0], .007, br)); return true; }
            /* ── autels, temples ── */
            case 'r_butsudan': { const c2m = metal(gold, .3); Bx(w, h * .25, d, col, 0, h * .125); Bx(w, h * .7, .02, col, 0, h * .25 + h * .35, -d / 2 + .01); [-1, 1].forEach(s => Bx(.02, h * .7, d, col, s * (w / 2 - .01), h * .6)); Bx(w, .03, d, col, 0, h * .95 - .015);
                Bx(w - .04, h * .65, .004, c2m, 0, h * .6, -d / 2 + .023); [-1, 1].forEach(s => { const door = Bx(w * .48, h * .66, .015, col, s * (w / 2 + w * .22), h * .6, d / 2 - .03); door.rotation.y = s * .2; }); for (let i = 0; i < 2; i++) Bx(w * .8, .015, d * .7, col, 0, h * .4 + i * h * .2, 0);
                Sp(.03, .04, .03, c2m, 0, h * .7, -d * .1, 10); Cy(.02, .02, .03, c2m, -w * .2, h * .43 + .015, 0); Cy(.02, .02, .03, c2m, w * .2, h * .43 + .015, 0); candle(w * .3, h * .415, d * .15, .006, .04); return true; }
            case 'r_mandir': { const c2m = metal(gold, .35), base = h * .3; Bx(w, base, d, col, 0, base / 2); [-1, 1].forEach(sx => [-1, 1].forEach(sz => Cy(.02, .02, h * .4, col, sx * (w / 2 - .04), base + h * .2, sz * (d / 2 - .04), 10)));
                Bx(w, .04, d, col, 0, base + h * .4 + .02); Co(m * .45, h * .25, col, 0, base + h * .44 + h * .125, 0, 8); Co(.02, .06, c2m, 0, h - .03, 0, 8); Bx(w * .8, h * .38, .01, mat('#c0392b', 'tissu'), 0, base + h * .2, -d / 2 + .02);
                Sp(.05, .06, .04, mat('#e0702a'), 0, base + .06, 0, 10); candle(w * .3, base, d * .3, .008, .02); Cy(.04, .04, .01, c2m, -w * .3, base + .005, d * .3, 14); return true; }
            case 'r_palki': { const c2m = okHex(col2) ? col2 : '#e0902a', base = .4; Bx(w, base, d, col, 0, base / 2); [-1, 1].forEach(sx => [-1, 1].forEach(sz => Cy(.03, .03, h - base - .3, metal('#c9a24a'), sx * (w / 2 - .05), base + (h - base - .3) / 2, sz * (d / 2 - .05), 10)));
                Bx(w, .06, d, metal('#c9a24a'), 0, h - .3); for (let i = 0; i < 3; i++) Co(.06, .25, metal('#c9a24a'), (i - 1) * w * .35, h - .3 + .125 + .03, 0, 8); Bx(w * .7, .12, d * .6, mat(c2m, 'tissu'), 0, base + .06); Bx(w * .4, .08, d * .35, mat('#f4f1ea', 'tissu'), 0, base + .16); return true; }
            case 'r_manji': { legs4(h * .6, .04); Bx(w, h * .1, d, col, 0, h * .65); Bx(w * .95, h * .1, d * .95, mat(okHex(col2) ? col2 : '#8b1a1a', 'tissu'), 0, h * .75); Bx(w * .5, h * .12, d * .4, mat('#f4f1ea', 'tissu'), 0, h * .86); return true; }
            case 'r_ancestral': { const c2m = metal(gold, .35); Bx(w, h * .7, d, col, 0, h * .35); Bx(w + .04, .04, d + .04, col, 0, h * .72); Bx(w * .9, .01, d * .8, mat('#c0392b', 'tissu'), 0, h * .745);
                Bx(w * .6, h * .28, .03, col, 0, h * .74 + h * .14, -d / 2 + .05); for (let i = 0; i < 3; i++) Bx(w * .08, h * .18, .02, '#3a1a12', (i - 1) * w * .16, h * .74 + h * .1, -d / 2 + .08); for (let i = 0; i < 3; i++) Bx(w * .06, h * .1, .002, c2m, (i - 1) * w * .16, h * .74 + h * .11, -d / 2 + .091);
                Cy(.05, .06, .07, c2m, 0, h * .78, d * .1, 3); for (let i = 0; i < 3; i++) Rod([-.01 + i * .01, h * .8, d * .1], [-.02 + i * .02, h * .9, d * .1], .0015, '#c0392b', 4); [-1, 1].forEach(s => { Cy(.012, .015, .15, metal('#c0392b'), s * w * .35, h * .745 + .075, d * .2); flame(s * w * .35, h * .745 + .15, d * .2); Sp(.05, .04, .05, '#e0902a', s * w * .2, h * .77, d * .25, 10); }); return true; }
            case 'r_tablets': { Bx(w, .03, d, col, 0, .015); for (let i = 0; i < 4; i++) { const px = -w * .375 + i * w * .25; Bx(w * .18, h * .8, .02, col, px, .03 + h * .4, 0); Co(w * .1, h * .12, col, px, .03 + h * .8 + h * .06, 0, 4).rotation.y = PI / 4; Bx(w * .1, h * .6, .002, metal(gold, .35), px, .03 + h * .4, .011); } return true; }
            case 'r_kamidana': { const c2m = okHex(col2) ? col2 : '#3a3a3a'; Bx(w, .03, d, col, 0, .015); Bx(w * .5, h * .5, d * .6, col, 0, .03 + h * .25, -d * .1); roofPeak(w * .65, d * .75, h * .3, c2m, .03 + h * .5).position.z = -d * .1; Bx(w * .08, h * .3, .005, '#e9e4da', 0, .03 + h * .25, d * .2 + .002);
                [-1, 1].forEach(s => { Cy(.02, .015, h * .25, '#e9e4da', s * w * .35, .03 + h * .125, d * .2, 10); Sp(.04, .03, .04, '#3a7a3a', s * w * .35, .03 + h * .3, d * .2, 8); }); CyX(.012, w, mat('#d9b75a', 'tissu'), 0, h * .95, d / 2); return true; }
            case 'r_torii': { const c2m = okHex(col2) ? col2 : '#1a1a1a'; [-1, 1].forEach(s => Cy(m * .22, m * .25, h * .9, col, s * w * .32, h * .45, 0, 14)); Bx(w * .75, .08, m * .4, col, 0, h * .72); const top = Bx(w, .1, m * .5, c2m, 0, h * .93); top.scale.x = 1; Bx(w * .92, .06, m * .45, col, 0, h * .86); Bx(.08, h * .14, m * .3, col, 0, h * .79); [-1, 1].forEach(s => Cy(m * .26, m * .26, .1, c2m, s * w * .32, .05, 0, 14)); return true; }
            case 'r_lantern': { const st = mat(col, 'pierre'); Cy(m * .45, m * .5, h * .1, st, 0, h * .05, 0, 6); Cy(m * .15, m * .2, h * .35, st, 0, h * .1 + h * .175, 0, 8); Cy(m * .4, m * .3, h * .08, st, 0, h * .49, 0, 6); Bx(m * .5, h * .18, m * .5, st, 0, h * .53 + h * .09);
                Bx(m * .2, h * .1, .02, glow('#ffd27a', 1.2), 0, h * .62, m * .25); Co(m * .55, h * .2, st, 0, h * .71 + h * .1, 0, 6); Sp(m * .08, m * .1, m * .08, st, 0, h * .95, 0, 8); return true; }
            case 'r_paperlantern': { const c2m = metal(gold); Sp(m * .48, h * .38, m * .48, mat(col, '', {emissive: col, emissiveIntensity: .45}), 0, h * .5, 0, 18); Cy(m * .25, m * .25, h * .06, c2m, 0, h * .9, 0, 14); Cy(m * .25, m * .25, h * .06, c2m, 0, h * .1, 0, 14); for (let i = 0; i < 6; i++) Rod([Math.cos(i) * .01, h * .07, Math.sin(i) * .01], [Math.cos(i) * .02, -h * .15, Math.sin(i) * .02], .002, '#e0c46a', 4); Rod([0, h * .93, 0], [0, h * 1.2, 0], .003, '#3a3a3a'); return true; }
            case 'r_stupa': { const c2m = metal(gold, .3); Bx(m * .9, h * .12, m * .9, col, 0, h * .06); Bx(m * .7, h * .1, m * .7, col, 0, h * .17); Sp(m * .35, h * .22, m * .35, col, 0, h * .32, 0, 16); Bx(m * .3, h * .07, m * .3, col, 0, h * .55); for (let i = 0; i < 8; i++) Cy(m * (.14 - i * .012), m * (.15 - i * .012), h * .035, c2m, 0, h * .6 + i * h * .038, 0, 14); Sp(m * .06, m * .08, m * .06, c2m, 0, h * .95, 0, 8); return true; }
            case 'r_prayerwheel': { const c2m = okHex(col2) ? col2 : '#8b1a1a'; Cy(m * .4, m * .45, h * .08, mat('#5a3b22'), 0, h * .04); Cy(.006, .006, h * .9, metal('#8a8f96'), 0, h * .5); Cy(m * .38, m * .38, h * .45, metal(col, .3), 0, h * .5, 0, 20);
                plane(PI * m * .76 * .5, h * .25, symTex(T, 'ཨོཾ', c2m, '#c9a24a', 256, 96), 0, h * .5, m * .385); To(m * .38, .006, metal(col), 0, h * .275, 0).rotation.x = PI / 2; To(m * .38, .006, metal(col), 0, h * .725, 0).rotation.x = PI / 2; Sp(.012, .012, .012, metal(col), m * .45, h * .6, 0, 8); return true; }
            case 'r_flags': { const n = Math.max(4, Math.round(w / .25)); Rod([-w / 2, h, 0], [w / 2, h, 0], .003, L9.rope ? '#c9a24a' : '#3a3a3a', 4);
                if (L9.rope) { CyX(.035, w, mat('#d9b75a', 'tissu'), 0, h, 0, 10); for (let i = 0; i < 4; i++) { const px = -w * .3 + i * w * .2; Bx(.05, h * .5, .004, '#f4f1ea', px, h * .7, 0); Rod([px, h - .03, 0], [px, h * .35, 0], .01, '#d9b75a', 6); } return true; }
                if (L9.flowers) { for (let i = 0; i < n * 3; i++) { const t = i / (n * 3), px = -w / 2 + w * t, py = h - Math.sin(t * PI) * h * .6; Sp(.025, .025, .025, ['#e0902a', '#f2c500', '#e06a1a'][i % 3], px, py, 0, 8); } return true; }
                for (let i = 0; i < n; i++) { const t = (i + .5) / n, px = -w / 2 + w * t, py = h - Math.sin(t * PI) * h * .25; Bx(w / n * .8, h * .55, .002, mat(['#2a5db0', '#f4f1ea', '#c0392b', '#3a8a5a', '#f2c500'][i % 5], 'tissu'), px, py - h * .3, 0); } return true; }
            case 'r_gong': { const c2m = metal(gold, .25); [-1, 1].forEach(s => { Bx(.06, h, .06, col, s * (w / 2 - .03), h / 2); Bx(.06, .04, d, col, s * (w / 2 - .03), .02); }); Bx(w, .07, .07, col, 0, h - .035); const R0 = Math.min(w * .35, h * .35);
                const g0 = Cy(R0, R0, .015, c2m, 0, h * .5, 0, 32); g0.rotation.x = PI / 2; To(R0 * .3, .006, c2m, 0, h * .5, .01).rotation.x = 0; [-1, 1].forEach(s => Rod([s * R0 * .5, h - .07, 0], [s * R0 * .3, h * .5 + R0 * .9, 0], .003, '#3a3a3a', 4)); Rod([w * .3, .1, d * .3], [w * .4, .4, d * .2], .01, '#6a4026'); Sp(.035, .035, .035, mat('#8b1a1a', 'tissu'), w * .4, .42, d * .2, 8); return true; }
            case 'r_zafu': { Bx(w, h * .3, d, mat(col, 'tissu'), 0, h * .15); Cy(m * .22, m * .24, h * .7, mat(okHex(col2) ? col2 : '#8b1a1a', 'tissu'), 0, h * .3 + h * .35, 0, 20); return true; }
            case 'r_tulsi': { const c2m = okHex(col2) ? col2 : '#3a8a3a'; Bx(w, h * .6, d, mat(col, 'brique'), 0, h * .3); Bx(w * 1.06, .04, d * 1.06, col, 0, h * .62); Cy(w * .3, w * .25, h * .15, '#7a4a2a', 0, h * .64 + h * .075);
                for (let i = 0; i < 9; i++) { const a = i * .7, r = m * (.05 + (i % 3) * .06); Rod([0, h * .78, 0], [Math.cos(a) * r, h * (.88 + (i % 3) * .04), Math.sin(a) * r], .004, '#3a5a2a', 4); Sp(.04, .035, .04, c2m, Math.cos(a) * r, h * (.9 + (i % 3) * .04), Math.sin(a) * r, 8); } return true; }
            case 'r_rangoli': { plane(w, d, ctex(T, 'rrangoli', 256, 256, (g, W, H) => { g.clearRect(0, 0, W, H); const C = ['#e0702a', '#f2c500', '#c0392b', '#2a5db0', '#3a8a3a', '#f4f1ea']; for (let r = 5; r >= 0; r--) { g.fillStyle = C[r]; g.beginPath(); for (let i = 0; i <= 64; i++) { const a = i * PI * 2 / 64, k = (r + 1) / 6 * W * .48 * (1 + .12 * Math.cos(a * 8)); g.lineTo(W / 2 + Math.cos(a) * k, H / 2 + Math.sin(a) * k); } g.fill(); } }), 0, Math.max(.002, h), 0, {transparent: true, alphaTest: .1}).rotation.x = -PI / 2; return true; }
            case 'r_bell': { const br = metal(col, .3); const s0 = new T.LatheGeometry([[0, h * .5], [m * .2, h * .48], [m * .35, h * .2], [m * .5, 0], [m * .45, 0]].map(([a, b]) => new T.Vector2(a, b)), 20); add(new T.Mesh(s0, mat(col, '', {metalness: .6, roughness: .3, side: T.DoubleSide})));
                Cy(.008, .01, h * .4, br, 0, h * .5 + h * .2); Sp(.012, .015, .012, br, 0, h * .95, 0, 8); Sp(.01, .01, .01, br, 0, h * .08, 0, 6); return true; }
            case 'r_memorial': { const c2m = okHex(col2) ? col2 : '#c0392b'; Bx(w, .02, d, mat('#f4f1ea', 'tissu'), 0, .01); const fr = Bx(w * .35, h * .75, .02, col, -w * .2, .02 + h * .375, -d * .15); fr.rotation.x = -.12;
                plane(w * .28, h * .6, ctex(T, 'rmemo', 96, 128, (g, W, H) => { g.fillStyle = '#c9b79a'; g.fillRect(0, 0, W, H); g.fillStyle = '#4a3a2a'; g.beginPath(); g.ellipse(W / 2, H * .4, W * .18, H * .16, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(W / 2, H * 1.05, W * .38, H * .42, 0, PI, 0); g.fill(); }), -w * .2, .02 + h * .375, -d * .15 + .012).rotation.x = -.12;
                Bx(.04, h * .3, .004, '#1a1a1a', -w * .2 - w * .14, .02 + h * .65, -d * .15 + .015).rotation.z = .6; Cy(.025, .025, h * .2, '#f4ecd8', w * .12, .02 + h * .1, d * .15, 12); flame(w * .12, .02 + h * .2, d * .15, 1.2); Cy(.04, .035, h * .3, mat('#cfe6f3', '', {transparent: true, opacity: .4}), w * .32, .02 + h * .15, 0, 12);
                for (let i = 0; i < 5; i++) Sp(.025, .022, .025, c2m, w * .32 + Math.cos(i * 1.25) * .025, .02 + h * .32 + (i % 2) * .02, Math.sin(i * 1.25) * .025, 8); return true; }
            case 'r_urn': { const s0 = new T.LatheGeometry([[0, 0], [m * .3, 0], [m * .32, h * .06], [m * .2, h * .12], [m * .48, h * .55], [m * .3, h * .85], [m * .22, h * .9]].map(([a, b]) => new T.Vector2(a, b)), 24); add(new T.Mesh(s0, mat(col, '', {metalness: .3, roughness: .35})));
                Cy(m * .25, m * .22, h * .06, metal(gold), 0, h * .93); Sp(m * .08, m * .08, m * .08, metal(gold), 0, h * .99, 0, 8); To(m * .47, .004, metal(gold), 0, h * .55, 0).rotation.x = PI / 2; return true; }
            default: return false;
        }
    }
    const prevF = ext.houseFurnitureX;
    ext.houseFurnitureX = (shape, x) => (typeof shape === 'string' && shape.startsWith('r_') && f3(shape, x)) || (prevF ? prevF(shape, x) : false);
})();
