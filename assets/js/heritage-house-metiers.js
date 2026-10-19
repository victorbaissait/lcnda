/* LCNDA — 🏠 Plan de maison : les ateliers et les métiers d'autrefois (complète heritage-house-lib.js et heritage-house-more.js).
 *  - plus de 100 objets rangés par métier dans « Métiers, atelier » : peintre (chevalets d'atelier et de campagne, toiles sur châssis de
 *    plusieurs formats, toiles empilées, porte-toiles, palette, boîte de peinture…), sculpteur, forgeron et maréchal-ferrant, menuisier et
 *    ébéniste, tonnelier, charron, cordonnier, tailleur et couturière, tisserand, potier, boulanger, boucher, épicier, apothicaire,
 *    horloger, imprimeur, relieur, photographe, instituteur, médecin et sage-femme, barbier, meunier, vigneron, apiculteur, lavandière,
 *    dentellière, luthier, notaire et mairie, poste, mineur, pêcheur, marin, garde champêtre ; et dans « Décoration » : affiches,
 *    diplôme encadré, photos sur pied ;
 *  - chaque objet : vraies dimensions (cm), mots-clés (kw, avec le nom du métier), un dessin vu de dessus et une forme 3D faite de
 *    plusieurs volumes ; la couleur principale (et sa matière) et la 2e couleur restent modifiables ;
 *  - 🖼 les toiles, chevalets, cartes murales, toiles de fond, affiches… ont un emplacement d'image (heritage-house-pics.js).
 * Les formes de ce fichier commencent toutes par « m_ ».
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const CAT = 'Métiers, atelier', DECO = 'Décoration';
    const O = (kw, o = {}) => ({kw, ...o}), OLD = (kw, o = {}) => ({kw, old: 1, ...o});

    /* ═════════ Le catalogue : [clé, nom, largeur, profondeur, hauteur (cm), couleur, forme, options] ═════════ */
    const ROWS = {
        [CAT]: [
            // 🎨 peintre
            ['mt_easelst', 'Chevalet d’atelier (à crémaillère)', 80, 85, 230, '#7a5232', 'm_easelstudio', O('peintre atelier artiste chevalet toile tableau', {color2: '#4a3020'})],
            ['mt_easelfd', 'Chevalet de campagne (trépied)', 65, 60, 165, '#a87b4d', 'm_easelfield', O('peintre plein air pliant trépied chevalet toile paysage')],
            ['mt_easeltb', 'Chevalet de table', 35, 30, 55, '#9a6a3a', 'm_easeltable', O('peintre petit chevalet toile miniature', {elev: 76})],
            ['mt_canvas6', 'Toile sur châssis 6 F (41 × 33)', 41, 12, 33, '#f2ede2', 'm_canvaslean', O('peintre toile châssis petit format figure tableau', {art: 'sketch'})],
            ['mt_canvas10', 'Toile sur châssis 10 F (55 × 46)', 55, 14, 46, '#f2ede2', 'm_canvaslean', O('peintre toile châssis figure tableau', {art: 'paint'})],
            ['mt_canvas20', 'Toile sur châssis 20 F (73 × 60)', 73, 16, 60, '#f2ede2', 'm_canvaslean', O('peintre toile châssis figure tableau', {art: 'blank'})],
            ['mt_canvas30p', 'Toile sur châssis 30 P paysage (92 × 65)', 92, 17, 65, '#f2ede2', 'm_canvaslean', O('peintre toile châssis paysage tableau', {art: 'paint'})],
            ['mt_canvas40m', 'Toile sur châssis 40 M marine (100 × 65)', 100, 17, 65, '#f2ede2', 'm_canvaslean', O('peintre toile châssis marine tableau', {art: 'sketch'})],
            ['mt_canvas50', 'Toile sur châssis 50 F (116 × 89)', 116, 20, 89, '#f2ede2', 'm_canvaslean', O('peintre grande toile châssis tableau', {art: 'paint'})],
            ['mt_canvas100', 'Grande toile 100 F (162 × 130)', 162, 26, 130, '#f2ede2', 'm_canvaslean', O('peintre très grande toile châssis tableau', {art: 'blank'})],
            ['mt_canvasfl', 'Toile posée à plat au sol', 110, 80, 3, '#f2ede2', 'm_canvasfloor', O('peintre toile au sol en cours tableau', {art: 'paint'})],
            ['mt_canvasstk', 'Toiles empilées contre le mur', 120, 45, 110, '#f2ede2', 'm_canvasstack', O('peintre toiles rangées pile châssis tableaux')],
            ['mt_canvasrack', 'Porte-toiles (casier à toiles)', 160, 70, 140, '#9a6a3a', 'm_canvasrack', O('peintre rangement toiles casier châssis')],
            ['mt_palette', 'Palette de peintre', 45, 32, 2, '#c9a77a', 'm_palette', O('peintre palette couleurs pinceaux', {elev: 76})],
            ['mt_paintbox', 'Boîte de peinture (ouverte)', 42, 30, 30, '#8a5a32', 'm_paintbox', O('peintre boîte tubes couleurs campagne', {elev: 76})],
            ['mt_taboret', 'Desserte de peintre (pots de pinceaux)', 55, 42, 85, '#7a5232', 'm_taboret', O('peintre desserte tiroirs pinceaux pots couleurs')],
            ['mt_brushjar', 'Pot de pinceaux', 14, 14, 32, '#c9b9a0', 'm_brushjar', O('peintre pinceaux pot brosses', {elev: 76})],
            ['mt_manikin', 'Mannequin articulé de dessin', 16, 12, 34, '#d6b47a', 'm_manikin', O('peintre dessin mannequin bois articulé', {elev: 76})],
            ['mt_model', 'Estrade du modèle (avec drap)', 160, 120, 95, '#8a5a32', 'm_modelstand', O('peintre atelier pose modèle estrade drap', {color2: '#b23a3a'})],
            // 🗿 sculpteur, tailleur de pierre
            ['mt_selle', 'Selle de sculpteur (terre en cours)', 60, 60, 115, '#7a5232', 'm_selle', O('sculpteur selle modelage terre glaise tournette', {what: 'clay'})],
            ['mt_bustst', 'Buste en plâtre sur sellette', 45, 45, 165, '#9a6a3a', 'm_selle', O('sculpteur buste plâtre sellette atelier', {what: 'bust'})],
            ['mt_sculptst', 'Sellette de sculpteur avec sculpture', 55, 55, 170, '#6a4026', 'm_selle', O('sculpteur sellette statue figure atelier', {what: 'figure'})],
            ['mt_stone', 'Bloc de pierre à tailler', 70, 60, 90, '#cfc6b3', 'm_stoneblock', O('sculpteur tailleur de pierre bloc marbre ciseau maillet')],
            ['mt_banker', 'Banker de tailleur de pierre', 110, 80, 85, '#8a6a4a', 'm_banker', O('tailleur de pierre banker établi pierre taille', {color2: '#d6cdb8'})],
            // ⚒ forgeron, maréchal-ferrant
            ['mt_forge', 'Forge de maréchal (avec hotte)', 160, 110, 230, '#9a5a3a', 'm_forge', OLD('forgeron maréchal-ferrant forge foyer hotte feu', {color2: '#3a3a3a'})],
            ['mt_anvil', 'Enclume sur billot', 70, 32, 85, '#3a3a3a', 'm_anvil', OLD('forgeron maréchal enclume billot marteau', {color2: '#7a5a3a'})],
            ['mt_bellows', 'Grand soufflet de forge (à levier)', 160, 75, 120, '#5a3b22', 'm_bellows', OLD('forgeron soufflet forge cuir levier')],
            ['mt_travail', 'Travail à ferrer', 260, 120, 230, '#7a5a3a', 'm_travail', OLD('maréchal-ferrant travail ferrer cheval bœuf ferrure')],
            ['mt_quench', 'Baquet à tremper', 70, 70, 55, '#6a4a2a', 'm_tub', OLD('forgeron baquet eau tremper trempe', {art: 'water'})],
            ['mt_tongs', 'Râtelier à pinces et marteaux', 110, 20, 120, '#5a3b22', 'm_toolwall', OLD('forgeron pinces tenailles marteaux râtelier', {art: 'forge'})],
            // 🪚 menuisier, ébéniste
            ['mt_bench', 'Établi de menuisier (avec valet)', 220, 75, 88, '#b98b5c', 'm_bench', OLD('menuisier ébéniste établi valet rabot presse bois', {tools: 'menuisier'})],
            ['mt_veneer', 'Presse à placage (à vis)', 130, 75, 125, '#8a5a32', 'm_press', OLD('ébéniste presse placage vis serrage', {color2: '#3a3a3a'})],
            ['mt_bandsaw', 'Scie à ruban', 85, 70, 190, '#3a5a4a', 'm_bandsaw', O('menuisier scie ruban machine bois', {color2: '#2b2b2b'})],
            ['mt_toolwall', 'Panneau d’outils de menuisier', 160, 8, 110, '#c9a77a', 'm_toolwall', O('menuisier outils mur rabots scies ciseaux', {elev: 95, art: 'bois'})],
            ['mt_planks', 'Pile de planches', 250, 80, 60, '#c9a77a', 'm_planks', O('menuisier bois planches stock scierie')],
            // 🛢 tonnelier, charron
            ['mt_barrelwip', 'Tonneau en cours (douelles montées)', 75, 75, 100, '#9a6a3a', 'm_barrelwip', OLD('tonnelier tonneau douelles cercle fût barrique', {color2: '#3a3a3a'})],
            ['mt_chevre', 'Chèvre de tonnelier (banc à planer)', 150, 40, 75, '#8a6a4a', 'm_chevre', OLD('tonnelier chèvre banc à planer plane douelle')],
            ['mt_wheelwip', 'Roue en cours sur son chevalet (charron)', 160, 70, 110, '#8a5a32', 'm_wheelwip', OLD('charron roue rayons moyeu jante chevalet', {color2: '#3a3a3a'})],
            // 👞 cordonnier
            ['mt_shoebench', 'Établi bas de cordonnier', 110, 55, 55, '#7a5232', 'm_shoebench', OLD('cordonnier établi bas tabouret cuir clous alênes')],
            ['mt_lastiron', 'Pied de fer (enclume de cordonnier)', 30, 30, 62, '#3a3a3a', 'm_lastiron', OLD('cordonnier pied de fer enclume semelle', {color2: '#7a5a3a'})],
            ['mt_lasts', 'Étagère à formes et chaussures', 110, 32, 160, '#8a5a32', 'm_shelf', OLD('cordonnier formes chaussures étagère', {load: 'formes'})],
            // 🧵 tailleur, couturière
            ['mt_cuttable', 'Table de coupe de tailleur', 200, 100, 90, '#b98b5c', 'm_cuttable', OLD('tailleur couturière table de coupe tissu ciseaux mètre', {color2: '#3a5a8a'})],
            ['mt_treadle', 'Machine à coudre à pédale', 90, 45, 100, '#2b2b2b', 'm_treadle', OLD('couturière machine à coudre pédale singer fonte', {color2: '#8a5a32'})],
            ['mt_dressform', 'Mannequin de couturière', 42, 35, 160, '#c9b38a', 'm_dressform', O('couturière tailleur mannequin buste robe', {color2: '#3a3a3a'})],
            ['mt_coaliron', 'Fer à repasser à braises', 22, 12, 22, '#2b2b2b', 'm_coaliron', OLD('repasseuse fer à braises charbon repasser', {elev: 90})],
            ['mt_ironboard', 'Planche à repasser ancienne', 130, 38, 85, '#c9a77a', 'm_ironboard', OLD('repasseuse planche repasser linge', {color2: '#e9e4da'})],
            // 🧶 tisserand
            ['mt_loom', 'Métier à tisser à bras', 190, 160, 190, '#8a5a32', 'm_loom', OLD('tisserand métier à tisser navette lisses toile laine')],
            ['mt_swift', 'Dévidoir (en ombrelle)', 60, 60, 105, '#a87b4d', 'm_swift', OLD('tisserand fileuse dévidoir écheveau laine')],
            ['mt_warper', 'Ourdissoir', 120, 120, 200, '#8a6a4a', 'm_warper', OLD('tisserand ourdissoir chaîne fils')],
            // 🏺 potier
            ['mt_potwheel', 'Tour de potier (à pied)', 95, 75, 80, '#8a6a4a', 'm_potwheel', OLD('potier tour argile poterie céramique', {color2: '#b0603a'})],
            ['mt_kiln', 'Four de potier', 130, 130, 170, '#b06a4a', 'm_kiln', OLD('potier four cuisson céramique briques')],
            ['mt_potshelf', 'Étagère de séchage des pots', 160, 42, 180, '#9a7a5a', 'm_shelf', OLD('potier séchage pots poterie étagère', {load: 'pots'})],
            // 🥖 boulanger
            ['mt_kneader', 'Pétrin mécanique', 120, 80, 115, '#7a8a96', 'm_kneader', OLD('boulanger pétrin pâte farine pain', {color2: '#3a3a3a'})],
            ['mt_oven', 'Four à pain maçonné', 260, 250, 210, '#c9b8a0', 'm_breadoven', OLD('boulanger four à pain fournil voûte bois', {color2: '#2b2b2b'})],
            ['mt_peel', 'Pelle à enfourner', 35, 8, 230, '#c9a77a', 'm_peel', OLD('boulanger pelle enfourner pain four')],
            ['mt_breadrack', 'Grille à pains du fournil', 110, 50, 180, '#9a6a3a', 'm_shelf', OLD('boulanger pains étagère fournil', {load: 'pains'})],
            // 🥩 boucher
            ['mt_hooks', 'Barre à crochets (viande)', 200, 30, 220, '#8a8f96', 'm_hookbar', OLD('boucher charcutier crochets viande barre')],
            ['mt_stall', 'Étal de boucher (dessus de marbre)', 200, 80, 92, '#8a5a32', 'm_stall', OLD('boucher étal marbre billot couteaux', {color2: '#e9e4da'})],
            // 🫙 épicier
            ['mt_counter', 'Comptoir d’épicerie vitré', 250, 70, 100, '#7a4f2a', 'm_counter', OLD('épicier comptoir vitrine magasin boutique', {color2: '#c9a24a'})],
            ['mt_roberval', 'Balance Roberval', 45, 20, 32, '#c9a24a', 'm_roberval', OLD('épicier balance roberval poids pesée', {elev: 100})],
            ['mt_jars', 'Étagère à bocaux de bonbons', 120, 35, 190, '#8a5a32', 'm_shelf', OLD('épicier bocaux bonbons confiserie étagère', {load: 'bocaux'})],
            ['mt_sacks', 'Sacs de grains et de farine', 130, 60, 75, '#c9b38a', 'm_sacks', OLD('épicier meunier sacs grains farine café')],
            ['mt_drawers', 'Meuble à tiroirs d’épicier', 200, 50, 220, '#7a4f2a', 'm_drawerwall', OLD('épicier tiroirs graines épices meuble', {color2: '#e9e4da'})],
            // ⚗ apothicaire, pharmacien
            ['mt_apojars', 'Étagère de pots à pharmacie', 150, 35, 210, '#6a4026', 'm_shelf', OLD('apothicaire pharmacien pots faïence chevrettes étagère', {load: 'apothic'})],
            ['mt_mortar', 'Mortier et pilon', 25, 25, 28, '#c9c2b2', 'm_mortar', OLD('apothicaire pharmacien mortier pilon', {elev: 92})],
            ['mt_apocounter', 'Comptoir d’apothicaire', 200, 65, 100, '#5a3b22', 'm_counter', OLD('apothicaire pharmacien comptoir officine', {color2: '#e9e4da', top: 'apothic'})],
            // ⏱ horloger
            ['mt_watchbench', 'Établi d’horloger (avec loupe)', 120, 60, 100, '#7a4f2a', 'm_watchbench', OLD('horloger établi loupe montres pendules mécanisme', {color2: '#c9a24a'})],
            ['mt_clockwall', 'Mur d’horloges en réparation', 150, 15, 110, '#6a4026', 'm_toolwall', OLD('horloger horloges pendules réparation mur', {elev: 110, art: 'horloger'})],
            // 🖨 imprimeur, relieur
            ['mt_handpress', 'Presse à bras (imprimerie)', 160, 110, 200, '#3a3a3a', 'm_handpress', OLD('imprimeur presse à bras gutenberg typographie impression', {color2: '#7a5232'})],
            ['mt_typecase', 'Casse à caractères (sur son rang)', 105, 65, 125, '#9a6a3a', 'm_typecase', OLD('imprimeur typographe casse caractères plomb')],
            ['mt_sewframe', 'Cousoir de relieur', 60, 40, 60, '#a87b4d', 'm_sewframe', OLD('relieur cousoir couture livres reliure', {elev: 76})],
            ['mt_bookpress', 'Presse à relier (à vis)', 60, 45, 80, '#7a5232', 'm_press', OLD('relieur presse reliure livres vis', {color2: '#3a3a3a', small: 1})],
            // 📷 photographe
            ['mt_camera', 'Chambre photographique sur pied', 65, 65, 165, '#6a4026', 'm_camera', OLD('photographe chambre appareil photo pied voile noir daguerréotype', {color2: '#1a1a1a'})],
            ['mt_backdrop', 'Toile de fond peinte (studio photo)', 300, 60, 280, '#6a6a6a', 'm_backdrop', OLD('photographe studio toile de fond décor portrait')],
            ['mt_posechair', 'Fauteuil de pose avec appui-tête', 65, 65, 150, '#6a2e2e', 'm_posechair', OLD('photographe pose portrait appui-tête fauteuil', {color2: '#3a3a3a'})],
            // 🏫 instituteur
            ['mt_pupitre', 'Pupitre d’écolier (deux places)', 110, 80, 80, '#8a5a32', 'm_pupitre', OLD('école instituteur pupitre écolier banc encrier', {color2: '#3a3a3a'})],
            ['mt_board', 'Tableau noir sur chevalet', 150, 60, 185, '#7a5232', 'm_blackboard', OLD('école instituteur tableau noir craie chevalet', {color2: '#22332a'})],
            ['mt_wallmap', 'Carte murale de l’école (Vidal-Lablache)', 120, 4, 100, '#c9a77a', 'm_wallmap', OLD('école instituteur carte murale géographie France', {elev: 110})],
            ['mt_abacus', 'Boulier de la classe', 60, 22, 62, '#9a6a3a', 'm_abacus', OLD('école instituteur boulier calcul compter', {elev: 76})],
            ['mt_estrade', 'Bureau du maître sur l’estrade', 170, 130, 105, '#7a4f2a', 'm_estrade', OLD('école instituteur bureau maître estrade chaire')],
            // 🩺 médecin, sage-femme
            ['mt_examtable', 'Table d’examen du médecin', 190, 65, 80, '#e9e4da', 'm_examtable', O('médecin docteur sage-femme table examen cabinet', {color2: '#7a8a96'})],
            ['mt_docbag', 'Trousse de médecin', 42, 20, 28, '#3a2418', 'm_docbag', OLD('médecin docteur sage-femme trousse sacoche', {elev: 76, color2: '#c9a24a'})],
            ['mt_instrcab', 'Vitrine à instruments', 80, 40, 180, '#e9e4da', 'm_instrcab', OLD('médecin dentiste vitrine instruments cabinet')],
            // 💈 barbier
            ['mt_barberchair', 'Fauteuil de barbier', 70, 95, 115, '#7a2e2e', 'm_barberchair', OLD('barbier coiffeur fauteuil rasage', {color2: '#c8ccd0'})],
            ['mt_barbermirror', 'Miroir et tablette de barbier', 120, 25, 180, '#6a4026', 'm_barbermirror', OLD('barbier coiffeur miroir tablette blaireau rasoir')],
            // 🌾 meunier
            ['mt_millstone', 'Paire de meules (moulin)', 170, 170, 130, '#a9a296', 'm_millstone', OLD('meunier moulin meule farine trémie grain', {color2: '#8a6a4a'})],
            ['mt_bolter', 'Bluterie (tamis à farine)', 160, 80, 180, '#a87b4d', 'm_bolter', OLD('meunier moulin bluterie tamis farine')],
            // 🍇 vigneron
            ['mt_winepress', 'Pressoir à vis', 150, 150, 210, '#8a5a32', 'm_winepress', OLD('vigneron pressoir vendange raisin vin vis', {color2: '#3a3a3a'})],
            ['mt_vat', 'Cuve de vendange en bois', 200, 200, 200, '#8a5a32', 'm_vat', OLD('vigneron cuve foudre vendange vin', {color2: '#3a3a3a'})],
            ['mt_hotte', 'Hotte de vendangeur', 45, 35, 85, '#a87b4d', 'm_hotte', OLD('vigneron hotte vendange osier', {matl: 'osier'})],
            // 🐝 apiculteur
            ['mt_hive', 'Ruche Dadant', 52, 52, 80, '#e0c46a', 'm_hive', O('apiculteur ruche abeilles miel cadres', {color2: '#8a8f96'})],
            ['mt_skep', 'Ruche en paille sur son banc', 50, 50, 85, '#c9a65a', 'm_skep', OLD('apiculteur ruche paille abeilles banc')],
            ['mt_extractor', 'Extracteur de miel', 60, 60, 110, '#c8ccd0', 'm_extractor', O('apiculteur extracteur miel centrifugeuse', {color2: '#3a3a3a'})],
            // 🧺 lavandière, dentellière
            ['mt_washbox', 'Caisse de lavandière et battoir', 75, 60, 45, '#8a6a4a', 'm_washbox', OLD('lavandière lavoir battoir caisse agenouilloir linge', {color2: '#f4f1ea'})],
            ['mt_lace', 'Carreau à dentelle sur pied', 55, 45, 80, '#3a5a8a', 'm_lacepillow', OLD('dentellière dentelle fuseaux carreau', {color2: '#8a5a32'})],
            // 🎻 luthier
            ['mt_luthbench', 'Établi de luthier (violons en cours)', 170, 70, 90, '#a87b4d', 'm_bench', OLD('luthier établi violons lutherie bois', {tools: 'luthier'})],
            ['mt_violins', 'Violons suspendus (mur d’atelier)', 120, 12, 80, '#8a4a22', 'm_violinwall', O('luthier violons altos suspendus atelier', {elev: 120})],
            // 📜 notaire, mairie
            ['mt_notary', 'Bureau de notaire', 165, 85, 78, '#5a3b22', 'm_notarydesk', OLD('notaire mairie bureau plat cuir actes', {color2: '#2a4a3a'})],
            ['mt_cartonnier', 'Cartonnier', 95, 45, 165, '#6a4026', 'm_cartonnier', OLD('notaire mairie cartonnier dossiers archives', {color2: '#3a5a3a'})],
            ['mt_registers', 'Étagère des registres d’état civil', 160, 40, 210, '#7a4f2a', 'm_shelf', OLD('mairie état civil registres archives naissances mariages', {load: 'registres'})],
            ['mt_marianne', 'Buste de Marianne sur socle', 35, 35, 150, '#f4f1ea', 'm_marianne', OLD('mairie marianne buste république', {color2: '#6a4026'})],
            // ✉ poste
            ['mt_postcounter', 'Guichet de poste', 260, 80, 140, '#6a4026', 'm_postcounter', OLD('poste guichet postier courrier timbres', {color2: '#c9a24a'})],
            ['mt_postscale', 'Balance de bureau de poste', 32, 25, 26, '#2b2b2b', 'm_roberval', OLD('poste balance lettres colis pesée', {elev: 100, color2: '#c9a24a', post: 1})],
            ['mt_sortrack', 'Casier de tri du courrier', 150, 40, 180, '#8a5a32', 'm_sortrack', OLD('poste facteur tri courrier casiers lettres')],
            // ⛏ mineur
            ['mt_minelamp', 'Lampe de mineur', 12, 12, 26, '#c9a24a', 'm_minelamp', OLD('mineur lampe sûreté grisou mine charbon', {elev: 80})],
            ['mt_minecart', 'Wagonnet de mine (sur rails)', 160, 90, 110, '#5a5a5a', 'm_minecart', OLD('mineur wagonnet berline mine charbon rails', {color2: '#2b2b2b'})],
            // 🎣 pêcheur, marin
            ['mt_nets', 'Filets de pêche à sécher', 220, 25, 210, '#8a7a5a', 'm_nets', OLD('pêcheur filets pêche flotteurs séchage', {color2: '#c0392b'})],
            ['mt_lobsterpot', 'Casier à homards', 70, 45, 42, '#8a6a4a', 'm_lobsterpot', OLD('pêcheur casier homard crabe nasse')],
            ['mt_seachest', 'Coffre de marin', 95, 48, 48, '#3a5a7a', 'm_seachest', OLD('marin coffre bateau corde voyage', {color2: '#c9a77a'})],
            ['mt_helm', 'Barre à roue (gouvernail)', 110, 45, 150, '#8a5a32', 'm_helm', OLD('marin barre roue gouvernail bateau navire', {color2: '#c9a24a'})],
            // 🥁 garde champêtre
            ['mt_drum', 'Tambour du garde champêtre', 45, 45, 85, '#2a4a7a', 'm_drum', OLD('garde champêtre tambour avis à la population baguettes', {color2: '#c0392b'})]
        ],
        [DECO]: [
            ['mt_poster', 'Affiche encadrée', 50, 3, 70, '#2b2b2b', 'm_poster', O('affiche cadre poster image mur', {elev: 120})],
            ['mt_posterbig', 'Grande affiche encadrée', 80, 3, 120, '#c9a24a', 'm_poster', O('affiche cadre poster image mur grand', {elev: 95})],
            ['mt_posterpin', 'Affiche punaisée (sans cadre)', 60, 1, 80, '#f4f1ea', 'm_posterpin', O('affiche punaises poster papier mur', {elev: 120})],
            ['mt_diploma', 'Diplôme encadré', 40, 3, 30, '#6a4026', 'm_poster', O('diplôme certificat cadre école brevet', {elev: 145, mat: 1})],
            ['mt_photostand', 'Photo sur pied (petit chevalet)', 22, 16, 30, '#c9a24a', 'm_photostand', O('photo portrait cadre chevalet souvenir', {elev: 76})],
            ['mt_photoeasel', 'Portrait agrandi sur chevalet', 65, 55, 175, '#3a2a1a', 'm_photoeasel', O('photo portrait agrandissement chevalet cadre ancêtre', {color2: '#c9a24a'})]
        ]
    };

    /* ═════════ 🖼 Les emplacements d'image (heritage-house-pics.js) : taille de l'image en cm d'après l'objet ═════════ */
    const cvSize = (it, kind) => { const w = it.w, h = it.h || 100; return kind === 'm_easelstudio' ? [w * .85, h * .36] : kind === 'm_easelfield' ? [w * .82, h * .32] : kind === 'm_easeltable' ? [w * .86, h * .6] : kind === 'm_photoeasel' ? [w * .72, h * .4] : [w, h]; };
    ext.housePicShapesX = Object.assign(ext.housePicShapesX || {}, {
        m_easelstudio: {n: 1, est: it => cvSize(it, 'm_easelstudio'), frame: true}, m_easelfield: {n: 1, est: it => cvSize(it, 'm_easelfield'), frame: true}, m_easeltable: {n: 1, est: it => cvSize(it, 'm_easeltable'), frame: true},
        m_canvaslean: {n: 1, est: it => [it.w * .98, (it.h || 60) * .98], frame: true}, m_canvasfloor: {n: 1, est: it => [it.w * .98, it.d * .98], frame: true, flat: true}, m_canvasstack: {n: 1, est: it => [it.w * .9, (it.h || 100) * .9], frame: true},
        m_backdrop: {n: 1, est: it => [it.w * .94, (it.h || 280) * .9]}, m_blackboard: {n: 1, est: it => [it.w * .86, (it.h || 185) * .42], frame: true}, m_wallmap: {n: 1, est: it => [it.w * .96, (it.h || 100) * .86]},
        m_poster: {n: 1, est: it => [it.w * .9, (it.h || 70) * .92], mat: true}, m_posterpin: {n: 1, est: it => [it.w, it.h || 80], frame: true}, m_photostand: {n: 1, est: it => [it.w * .82, (it.h || 30) * .82], mat: true}, m_photoeasel: {n: 1, est: it => cvSize(it, 'm_photoeasel'), mat: true}
    });

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
    ext.houseMetiers = {ROWS, count: () => Object.values(ROWS).reduce((s, r) => s + r.length, 0), addAll};
    const L9of = it => ext.houseLib?.libOf?.(it?.kind)?.[9] || {};

    /* ═════════ Les dessins vus de dessus (centrés en 0, 0 ; boîte w × d ; le haut du dessin = le dos de l'objet) ═════════ */
    const N = v => Math.round(v * 100) / 100;
    function sym(k, item, {R, S, c, w, d, x0, y0}) {
        const x1 = w / 2, y1 = d / 2, m = Math.min(w, d), c2 = /^#[0-9a-f]{6}$/i.test(item.color2 || '') ? item.color2 : '#3a3530', K = '#3a3530', W = '#ffffff', CV = '#f2ede2';
        const E = (cx, cy, rx, ry, f = c, ex = '') => `<ellipse cx="${N(cx)}" cy="${N(cy)}" rx="${N(Math.max(.1, rx))}" ry="${N(Math.max(.1, ry))}" fill="${f}" ${S} ${ex}/>`;
        const Ci = (cx, cy, r, f = c, ex = '') => E(cx, cy, r, r, f, ex);
        const P = (dd, f = 'none', ex = '') => `<path d="${dd}" fill="${f}" ${S} ${ex}/>`;
        const Rr = (x, y, ww, hh, rx = 0, f = c, ex = '') => `<rect x="${N(x)}" y="${N(y)}" width="${N(Math.max(.1, ww))}" height="${N(Math.max(.1, hh))}" rx="${N(rx)}" fill="${f}" ${S} ${ex}/>`;
        const Ln = (dd, ex = '') => `<path d="${dd}" fill="none" ${S} ${ex}/>`;
        const rep = (n, f) => Array.from({length: Math.max(0, n)}, (_, i) => f(i, n)).join('');
        const wall = (f = c) => R(x0, y0, w, Math.max(2, d), f);
        const tri = (f = c) => P(`M${N(x0 + w * .1)} ${N(y1 - 2)}L0 ${N(y0 + 2)}L${N(x1 - w * .1)} ${N(y1 - 2)}`, 'none') + Ci(0, y0 + 3, Math.min(3, m * .08), f);
        switch (k) {
            case 'm_easelstudio': return Rr(x0, y1 - d * .25, w, d * .25, 2, c2) + Rr(-w * .08, y0, w * .16, d, 1) + Rr(x0 + w * .05, y1 - d * .45, w * .9, d * .08, 1, CV) + Ci(x0 + 4, y1 - 4, 3, K) + Ci(x1 - 4, y1 - 4, 3, K);
            case 'm_easelfield': return tri(c) + Ln(`M${N(x0 + w * .1)} ${N(y1 - 2)}L0 ${N(y1 - d * .45)}L${N(x1 - w * .1)} ${N(y1 - 2)}`) + Rr(x0 + w * .09, y1 - d * .5, w * .82, 3, 0, CV);
            case 'm_easeltable': return Rr(x0, y0, w, d, 2) + Rr(x0 + w * .07, y1 - d * .35, w * .86, 2.5, 0, CV);
            case 'm_canvaslean': return Rr(x0, y1 - Math.min(4, d * .4), w, Math.min(4, d * .4), 0, CV) + Ln(`M${x0} ${N(y1 - 2)}L${N(x0 + 2)} ${y0}M${x1} ${N(y1 - 2)}L${N(x1 - 2)} ${y0}`, 'stroke-dasharray="3 2" opacity=".6"');
            case 'm_canvasfloor': return Rr(x0, y0, w, d, 0, CV) + Rr(x0 + 3, y0 + 3, w - 6, d - 6, 0, 'none', 'opacity=".4"');
            case 'm_canvasstack': return rep(5, i => Rr(x0 + i * 3, y0 + i * d / 6, w - i * 6, Math.max(2, d / 8), 0, i % 2 ? '#e9e1cf' : CV));
            case 'm_canvasrack': return R(x0, y0, w, d) + rep(Math.max(3, Math.round(w / 20)), (i, n) => Ln(`M${N(x0 + w * (i + .5) / n)} ${y0}V${y1}`, 'opacity=".55"'));
            case 'm_palette': return P(`M${N(x0)} 0C${N(x0)} ${N(y0)} ${N(x1)} ${N(y0)} ${N(x1)} 0C${N(x1)} ${N(y1)} ${N(x0 + w * .3)} ${N(y1)} ${N(x0)} 0Z`, c) + Ci(x0 + w * .22, -d * .05, m * .08, W) + rep(6, i => Ci(x0 + w * (.35 + i * .1), -d * .25 + (i % 2) * d * .1, m * .06, ['#c0392b', '#e0c46a', '#2a5db0', '#3a8a5a', '#f4f1ea', '#6a3a1a'][i]));
            case 'm_paintbox': return R(x0, y0 + d * .45, w, d * .55) + R(x0, y0, w, d * .45, '#e9e1cf') + rep(6, i => Rr(x0 + w * (i + .5) / 6 - 2, y0 + d * .55, 4, d * .3, 1, ['#c0392b', '#e0c46a', '#2a5db0', '#3a8a5a', '#f4f1ea', '#6a3a1a'][i]));
            case 'm_taboret': return R(x0, y0, w, d) + Ci(x0 + w * .25, y0 + d * .3, m * .14, '#c9b9a0') + Ci(x1 - w * .25, y0 + d * .3, m * .12, '#8a8f96') + Rr(x0 + w * .1, y1 - d * .35, w * .8, d * .22, 2, '#c9a77a');
            case 'm_brushjar': return Ci(0, 0, m / 2, '#c9b9a0') + rep(6, i => Ci(Math.cos(i) * m * .2, Math.sin(i) * m * .2, m * .07, ['#6a3a1a', '#c0392b', '#2a5db0', '#e0c46a', '#3a3a3a', '#c9a77a'][i]));
            case 'm_manikin': return E(0, 0, w * .2, d * .35) + Ci(0, y0 + 2, m * .22) + Ln(`M${x0 + 1} 0H${x1 - 1}`);
            case 'm_modelstand': return R(x0, y0, w, d) + P(`M${N(x0 + w * .1)} ${N(y0 + d * .2)}Q0 ${N(y0)} ${N(x1 - w * .1)} ${N(y0 + d * .3)}L${N(x1 - w * .2)} ${N(y1 - d * .1)}L${N(x0 + w * .2)} ${N(y1 - d * .2)}Z`, c2, 'opacity=".85"') + Rr(-w * .12, -d * .12, w * .24, d * .24, 2, '#7a4f2a');
            case 'm_selle': return rep(3, i => Ln(`M0 0L${N(Math.cos(i * 2.094 + .5) * w / 2)} ${N(Math.sin(i * 2.094 + .5) * d / 2)}`)) + Ci(0, 0, m * .34) + Ci(0, 0, m * .2, L9of(item).what === 'clay' ? '#a0603a' : '#efe9dc');
            case 'm_stoneblock': return P(`M${N(x0)} ${N(y0 + 4)}L${N(x0 + 6)} ${y0}H${N(x1 - 3)}L${x1} ${N(y0 + 8)}V${N(y1 - 3)}L${N(x1 - 8)} ${y1}H${N(x0 + 4)}L${x0} ${N(y1 - 6)}Z`, c) + Ln(`M${N(x0 + w * .2)} ${N(y0 + d * .3)}l${N(w * .2)} ${N(d * .1)}M${N(x0 + w * .55)} ${N(y0 + d * .6)}l${N(w * .25)} ${N(-d * .05)}`, 'opacity=".5"');
            case 'm_banker': return R(x0, y0, w, d) + Rr(x0 + w * .2, y0 + d * .2, w * .6, d * .6, 0, c2);
            case 'm_forge': return R(x0, y0, w, d) + Rr(x0 + w * .15, y0 + d * .2, w * .7, d * .55, 3, '#3a2a1a') + Ci(0, 0, m * .15, '#e0702a') + Rr(x0 - 4, y0 - 4, w + 8, d * .6 + 4, 0, 'none', 'stroke-dasharray="7 4" opacity=".6"');
            case 'm_anvil': return Ci(0, 0, m * .5, c2) + P(`M${N(x0)} 0L${N(x0 + w * .3)} ${N(-d * .3)}H${N(x1 - w * .1)}V${N(d * .3)}H${N(x0 + w * .3)}Z`, c);
            case 'm_bellows': return P(`M${N(x0 + w * .1)} ${N(y0 + d * .1)}L${N(x1 - w * .15)} ${N(-d * .08)}V${N(d * .08)}L${N(x0 + w * .1)} ${N(y1 - d * .1)}Z`, c) + Ln(`M${N(x1 - w * .15)} 0H${x1}`) + R(x0, y0, w * .12, d, '#7a5a3a');
            case 'm_travail': return R(x0, y0, w, d, 'none') + [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => Rr(a * (x1 - 8) - 8, b * (y1 - 8) - 8, 16, 16, 2, c)).join('') + Ln(`M${x0 + 8} ${y0 + 8}H${x1 - 8}M${x0 + 8} ${y1 - 8}H${x1 - 8}`);
            case 'm_tub': return Ci(0, 0, m / 2) + Ci(0, 0, m * .42, L9of(item).art === 'water' ? '#4a6a8a' : '#c9b38a');
            case 'm_toolwall': return wall() + Ln(`M${x0 + 4} ${N(y1 + 3)}H${x1 - 4}`, 'stroke-dasharray="3 3"');
            case 'm_bench': return R(x0, y0, w, d) + R(x0 + w * .02, y0 + 3, w * .18, d * .2, '#7a5a3a') + Rr(x1 - w * .12, y0 + d * .1, w * .1, d * .3, 1, '#7a5a3a') + Ln(`M${x0} ${N(y0 + d * .55)}H${x1}`, 'opacity=".35"') + (L9of(item).tools === 'luthier' ? E(-w * .1, d * .1, w * .07, d * .22, '#8a4a22') + E(w * .15, d * .1, w * .07, d * .22, '#a8642a') : Rr(-w * .1, y1 - d * .3, w * .2, d * .12, 2, '#9a6a3a'));
            case 'm_press': return R(x0, y0, w, d) + Rr(x0 + w * .15, y0 + d * .15, w * .7, d * .7, 0, c2, 'opacity=".5"') + rep(L9of(item).small ? 1 : 2, (i, n) => Ci(n === 1 ? 0 : (i ? 1 : -1) * w * .25, 0, m * .1, K));
            case 'm_bandsaw': return R(x0, y0, w, d) + Ci(0, -d * .1, m * .35, 'none') + R(x0 + w * .1, y0 + d * .1, w * .8, d * .5, c2, 'opacity=".4"');
            case 'm_planks': return rep(5, i => R(x0, y0 + d * i / 5, w, d / 5, i % 2 ? '#b8925a' : c));
            case 'm_barrelwip': return Ci(0, 0, m / 2, 'none') + rep(16, i => Ci(Math.cos(i * .3927) * m * .44, Math.sin(i * .3927) * m * .44, m * .05, c)) + Ci(0, 0, m * .5, 'none', `stroke="${c2}"`);
            case 'm_chevre': return R(x0, -d * .2, w, d * .4) + R(x0 + w * .55, y0, w * .12, d) + Rr(x0 + w * .1, y0 + d * .1, w * .2, d * .8, 2, '#7a5a3a', 'opacity=".5"');
            case 'm_wheelwip': return R(x0 + w * .2, y0 + d * .2, w * .6, d * .6, 'none') + E(0, 0, w * .48, d * .12, 'none') + Ci(0, 0, m * .12, c2) + Ln(`M${x0 + w * .02} 0H${x1 - w * .02}`);
            case 'm_shoebench': return R(x0, y0, w, d) + R(x0, y0, w * .4, d, '#6a4a2a') + rep(4, i => Rr(x0 + w * (.45 + i * .13), y0 + d * .15, w * .1, d * .3, 1, '#9a7a5a'));
            case 'm_lastiron': return Ci(0, 0, m * .45, c2) + P(`M${N(-w * .1)} ${N(y0)}L${N(w * .1)} ${N(y0)}L${N(w * .15)} ${N(y1)}H${N(-w * .15)}Z`, c);
            case 'm_shelf': return R(x0, y0, w, d) + rep(Math.max(3, Math.round(w / 15)), (i, n) => Ci(x0 + w * (i + .5) / n, 0, Math.min(d * .3, w / n * .4), {pots: '#b0603a', bocaux: '#e07a7a', apothic: '#f4f1ea', registres: '#3a5a3a', formes: '#c9a77a', pains: '#d6a05a'}[L9of(item).load] || '#c9a77a'));
            case 'm_cuttable': return R(x0, y0, w, d) + Rr(x0 + w * .1, y0 + d * .1, w * .55, d * .7, 0, c2, 'opacity=".75"') + Ln(`M${N(x1 - w * .25)} ${N(y0 + d * .3)}l${N(w * .08)} ${N(d * .3)}M${N(x1 - w * .17)} ${N(y0 + d * .3)}l${N(-w * .08)} ${N(d * .3)}`);
            case 'm_treadle': return R(x0, y0, w, d, c2) + Rr(x0 + w * .15, y0 + d * .2, w * .5, d * .35, 3, c) + Ci(x1 - w * .2, 0, m * .15, 'none');
            case 'm_dressform': return E(0, 0, w * .45, d * .4) + Ci(0, 0, 2, K);
            case 'm_coaliron': return P(`M${x0} ${y1}L${N(x0 + w * .15)} ${y0}H${N(x1 - w * .2)}Q${x1} ${y0} ${x1} 0L${N(x1 - w * .1)} ${y1}Z`, c) + Ln(`M${N(x0 + w * .3)} 0H${N(x1 - w * .3)}`);
            case 'm_ironboard': return P(`M${x0} ${y0}H${N(x1 - w * .2)}Q${x1} 0 ${N(x1 - w * .2)} ${y1}H${x0}Z`, c2);
            case 'm_loom': return R(x0, y0, w, d, 'none') + R(x0, y0, w, 10) + R(x0, y1 - 10, w, 10) + R(x0 + 5, y0 + d * .45, w - 10, 6, '#7a5a3a') + rep(Math.round(w / 6), (i, n) => Ln(`M${N(x0 + 8 + (w - 16) * i / n)} ${y0 + 10}V${N(y0 + d * .45)}`, 'opacity=".35"')) + R(x0 + w * .2, y1 + 4, w * .6, 16, '#8a6a4a');
            case 'm_swift': return Ci(0, 0, m / 2, 'none', 'stroke-dasharray="4 3"') + rep(6, i => Ln(`M0 0L${N(Math.cos(i * 1.047) * m / 2)} ${N(Math.sin(i * 1.047) * m / 2)}`)) + Ci(0, 0, m * .1);
            case 'm_warper': return Ci(0, 0, m / 2, 'none') + rep(8, i => Ci(Math.cos(i * .785) * m * .45, Math.sin(i * .785) * m * .45, 3, c)) + Ci(0, 0, m * .08);
            case 'm_potwheel': return R(x0, y0, w, d, 'none') + Ci(w * .1, 0, m * .38, c) + Ci(w * .1, 0, m * .14, c2) + R(x0, y0, w * .25, d, '#7a5a3a');
            case 'm_kiln': return R(x0, y0, w, d) + Rr(x0 + w * .3, y1 - d * .15, w * .4, d * .15, 0, '#3a2a1a');
            case 'm_kneader': return R(x0, y0, w, d, c2) + E(0, 0, w * .4, d * .4, c) + E(0, 0, w * .3, d * .3, '#efe2c4');
            case 'm_breadoven': return P(`M${x0} ${y1}V${N(y0 + d * .3)}Q0 ${N(y0 - d * .1)} ${x1} ${N(y0 + d * .3)}V${y1}Z`, c) + E(0, 0, w * .32, d * .3, '#3a2a1a') + Rr(-w * .1, y1 - 6, w * .2, 6, 0, c2);
            case 'm_peel': return Rr(-w / 2, -d / 2, w, d, 2) + Ln(`M0 ${y0}V${y1}`);
            case 'm_hookbar': return R(x0, -2, w, 4, '#8a8f96') + rep(6, i => Ci(x0 + w * (i + .5) / 6, 0, 3, '#a0402a'));
            case 'm_stall': return R(x0, y0, w, d) + R(x0 + 3, y0 + 3, w - 6, d - 6, c2) + Rr(x0 + w * .1, y0 + d * .2, w * .2, d * .5, 3, '#a0402a');
            case 'm_counter': return R(x0, y0, w, d) + Rr(x0 + 4, y1 - d * .45, w - 8, d * .4, 0, '#cfe6f3', 'opacity=".8"') + (L9of(item).top === 'apothic' ? '' : Rr(x0 + w * .75, y0 + 4, w * .2, d * .3, 1, c2));
            case 'm_roberval': return R(x0, -d / 4, w, d / 2) + Ci(x0 + w * .22, 0, m * .45, c2 === K ? '#c9a24a' : c2) + Ci(x1 - w * .22, 0, m * .45, c2 === K ? '#c9a24a' : c2);
            case 'm_sacks': return rep(3, i => E(x0 + w * (i + .5) / 3, 0, w / 6.5, d * .45, ['#c9b38a', '#e9e4da', '#b8a070'][i]));
            case 'm_drawerwall': return R(x0, y0, w, d) + rep(Math.round(w / 20), (i, n) => Ln(`M${N(x0 + w * i / n)} ${y1}v-6`, 'opacity=".6"'));
            case 'm_mortar': return Ci(0, 0, m / 2) + Ci(0, 0, m * .35, '#8a8070') + Ln(`M0 0L${N(w * .4)} ${N(-d * .4)}`);
            case 'm_watchbench': return R(x0, y0, w, d) + Rr(x0 + w * .1, y0 + d * .1, w * .5, d * .5, 0, '#e9e4da') + Ci(x1 - w * .2, y0 + d * .25, m * .1, c2) + rep(4, i => Ci(x0 + w * (.2 + i * .1), y0 + d * .35, 2, K));
            case 'm_handpress': return R(x0 + w * .1, y0, w * .8, d * .2) + R(x0 + w * .1, y1 - d * .2, w * .8, d * .2) + R(x0, y0 + d * .3, w, d * .4, c2) + Ln(`M0 0L${N(x1)} ${N(y0 + d * .1)}`);
            case 'm_typecase': return R(x0, y0, w, d) + rep(8, i => Ln(`M${N(x0 + w * (i + 1) / 9)} ${y0}V${N(y0 + d * .6)}`, 'opacity=".45"')) + rep(4, i => Ln(`M${x0} ${N(y0 + d * .15 * (i + 1))}H${x1}`, 'opacity=".45"'));
            case 'm_sewframe': return R(x0, y0, w, d) + rep(5, i => Ln(`M${N(x0 + w * (i + 1) / 6)} ${y0}V${y1}`, 'opacity=".6"')) + R(x0 + w * .2, -d * .15, w * .6, d * .3, '#e9e4da');
            case 'm_camera': return tri(c) + Rr(-w * .2, -d * .25, w * .4, d * .5, 2, c2) + Rr(-w * .1, y1 - d * .3, w * .2, d * .2, 1, '#6a4026');
            case 'm_backdrop': return R(x0, y0, w, Math.min(6, d)) + Rr(x0 + 4, y0 + 6, 6, d - 6, 0, K) + Rr(x1 - 10, y0 + 6, 6, d - 6, 0, K);
            case 'm_posechair': return R(x0, y0 + d * .2, w, d * .8) + R(x0, y0, w, d * .2) + Ci(0, y0 - 6, 4, c2);
            case 'm_pupitre': return R(x0, y0, w, d * .5) + Ci(x0 + w * .25, y0 + d * .1, 3, K) + Ci(x1 - w * .25, y0 + d * .1, 3, K) + R(x0, y1 - d * .3, w, d * .3, c2 === K ? '#7a5232' : c);
            case 'm_blackboard': return tri(c) + Rr(x0 + w * .05, -3, w * .9, 6, 0, c2);
            case 'm_wallmap': return wall('#e9dcb8') + Ln(`M${x0} ${N(y1 + 3)}H${x1}`, `stroke="${c}"`);
            case 'm_abacus': return R(x0, y0, w, d) + rep(5, i => Ln(`M${x0 + 3} ${N(y0 + d * (i + .5) / 5)}H${x1 - 3}`)) + rep(10, i => Ci(x0 + w * (.15 + i * .07), y0 + d * (((i % 5) + .5) / 5), 1.6, ['#c0392b', '#2a5db0', '#e0c46a', '#3a8a5a', '#f4f1ea'][i % 5]));
            case 'm_estrade': return R(x0, y0, w, d, '#b8925a') + R(x0 + w * .15, y0 + d * .15, w * .7, d * .4) + Rr(-w * .1, y0 + d * .62, w * .2, d * .22, 2, '#5a3b22');
            case 'm_examtable': return Rr(x0, y0, w, d, 4) + R(x0, y0, w * .3, d, c2, 'opacity=".5"') + Rr(x0 + 4, y0 + 4, w * .25, d - 8, 4, '#fff8');
            case 'm_docbag': return Rr(x0, y0, w, d, m * .3) + Ln(`M${N(x0 + w * .3)} 0H${N(x1 - w * .3)}`, `stroke="${c2}"`);
            case 'm_instrcab': return R(x0, y0, w, d) + Rr(x0 + 3, y0 + 3, w - 6, d - 6, 0, '#cfe6f3', 'opacity=".7"');
            case 'm_barberchair': return Ci(0, d * .05, m * .25, c2) + Rr(x0 + w * .1, y0 + d * .15, w * .8, d * .55, 6) + R(x0 + w * .2, y0, w * .6, d * .15) + Rr(x0 + w * .25, y1 - d * .25, w * .5, d * .2, 2, c2);
            case 'm_barbermirror': return wall() + Rr(x0 + w * .1, y1, w * .8, 8, 0, '#cfe0ee') + Ci(x0 + w * .2, y1 + 4, 2, W);
            case 'm_millstone': return R(x0, y0, w, d, c2) + Ci(0, 0, m * .42) + Ci(0, 0, m * .08, K) + rep(8, i => Ln(`M0 0L${N(Math.cos(i * .785) * m * .4)} ${N(Math.sin(i * .785) * m * .4)}`, 'opacity=".4"')) + Rr(-m * .12, -m * .12, m * .24, m * .24, 0, '#8a6a4a', 'opacity=".7"');
            case 'm_bolter': return R(x0, y0, w, d) + E(0, 0, w * .4, d * .3, '#e9e4da') + Ln(`M${x0} 0H${x1}`, 'stroke-dasharray="4 3"');
            case 'm_winepress': return R(x0, y0, w, d, '#7a5a3a') + Ci(0, 0, m * .38) + rep(16, i => Ci(Math.cos(i * .3927) * m * .38, Math.sin(i * .3927) * m * .38, 1.5, K)) + Ln(`M${N(-w * .45)} 0H${N(w * .45)}`, `stroke="${c2}" stroke-width="3"`);
            case 'm_vat': return Ci(0, 0, m / 2) + Ci(0, 0, m * .45, '#5a1a2a') + Ci(0, 0, m * .5, 'none', `stroke="${c2}"`);
            case 'm_hotte': return P(`M${x0} ${y0}H${x1}L${N(x1 - w * .15)} ${y1}H${N(x0 + w * .15)}Z`, c) + rep(4, i => Ln(`M${N(x0 + w * (i + 1) / 5)} ${y0}V${y1}`, 'opacity=".4"'));
            case 'm_hive': return R(x0, y0, w, d) + R(x0 - 3, y0 - 3, w + 6, d * .3, c2) + Rr(-w * .2, y1 - 3, w * .4, 3, 0, K);
            case 'm_skep': return R(x0, y0, w, d, '#8a6a4a') + rep(4, i => Ci(0, 0, m * (.45 - i * .1), i % 2 ? '#b8954a' : c));
            case 'm_extractor': return Ci(0, 0, m * .45) + Ci(0, 0, m * .3, '#e0c46a', 'opacity=".6"') + Ln(`M0 0L${N(m * .3)} ${N(-m * .3)}`, `stroke="${c2}"`);
            case 'm_washbox': return P(`M${x0} ${y0}H${x1}V${N(y0 + d * .5)}H${x0}Z`, c) + R(x0, y0 + d * .5, w, d * .5, '#c9a77a', 'opacity=".5"') + Rr(-w * .15, y1 - d * .3, w * .35, d * .12, 2, '#a87b4d');
            case 'm_lacepillow': return E(0, 0, w * .45, d * .4) + rep(10, i => Ci(x0 + w * (.15 + i * .07), y1 - d * .2, 1.6, c2));
            case 'm_violinwall': return wall() + rep(4, i => E(x0 + w * (i + .5) / 4, y1 + 4, w / 10, 3, ['#8a4a22', '#a8642a', '#7a3a1a', '#c9a77a'][i]));
            case 'm_notarydesk': return R(x0, y0, w, d) + Rr(x0 + w * .1, y0 + d * .1, w * .8, d * .7, 2, c2) + Rr(-w * .15, -d * .1, w * .2, d * .15, 0, W, 'transform="rotate(-8)"');
            case 'm_cartonnier': return R(x0, y0, w, d) + rep(4, i => Ln(`M${N(x0 + w * (i + 1) / 5)} ${N(y1 - 6)}V${y1}`));
            case 'm_marianne': return Rr(x0, y0, w, d, 2, c2) + Ci(0, 0, m * .3) + E(0, -m * .08, m * .18, m * .1, '#c0392b');
            case 'm_postcounter': return R(x0, y0, w, d) + Rr(x0 + 4, y0 + 4, w - 8, d * .35, 0, '#cfe6f3', 'opacity=".55"') + rep(3, i => Ln(`M${N(x0 + w * (i + 1) / 4)} ${y0}V${N(y0 + d * .4)}`, `stroke="${c2}"`));
            case 'm_sortrack': return R(x0, y0, w, d) + rep(Math.round(w / 15), (i, n) => Ln(`M${N(x0 + w * i / n)} ${y0}V${y1}`, 'opacity=".5"'));
            case 'm_minelamp': return Ci(0, 0, m / 2) + Ci(0, 0, m * .3, '#ffd27a');
            case 'm_minecart': return Rr(x0 - 6, -d * .3, w + 12, 4, 0, '#6a6a6a') + Rr(x0 - 6, d * .3 - 4, w + 12, 4, 0, '#6a6a6a') + R(x0 + 4, y0 + 4, w - 8, d - 8) + R(x0 + 10, y0 + 10, w - 20, d - 20, '#1a1a1a');
            case 'm_nets': return R(x0, y0, w, d, 'none', 'stroke-dasharray="3 3"') + Ci(x0 + 4, 0, 4, '#6a4a2a') + Ci(x1 - 4, 0, 4, '#6a4a2a') + rep(6, i => Ci(x0 + w * (i + .5) / 6, y1 - 4, 3, c2));
            case 'm_lobsterpot': return Rr(x0, y0, w, d, m * .3) + rep(5, i => Ln(`M${N(x0 + w * (i + 1) / 6)} ${y0}V${y1}`, 'opacity=".5"')) + Ci(0, 0, m * .15, 'none');
            case 'm_seachest': return Rr(x0, y0, w, d, 3) + Ln(`M${x0} ${N(y0 + d * .2)}H${x1}`) + Ci(x0 - 3, 0, 3, c2) + Ci(x1 + 3, 0, 3, c2);
            case 'm_helm': return R(x0 + w * .35, y0 + d * .2, w * .3, d * .6, '#6a4a2a') + E(0, -d * .1, w / 2, 4, 'none', `stroke="${c}"`) + rep(8, i => Ci(x0 + w * (i + .5) / 8, -d * .1, 1.6, c2));
            case 'm_drum': return Ci(0, 0, m / 2) + Ci(0, 0, m * .42, '#f4f1ea') + Ln(`M${N(-m * .3)} ${N(-m * .6)}L${N(m * .1)} ${N(-m * .1)}M${N(m * .3)} ${N(-m * .6)}L${N(-m * .1)} ${N(-m * .1)}`, `stroke="${c2}"`);
            case 'm_poster': return wall() + Ln(`M${x0 + w * .1} ${N(y1 + 2)}H${x1 - w * .1}`, 'stroke="#a0805a"');
            case 'm_posterpin': return wall('#f4f1ea') + Ci(x0 + 2, y1, 1.4, '#c0392b') + Ci(x1 - 2, y1, 1.4, '#c0392b');
            case 'm_photostand': return R(x0, y0 + d * .3, w, d * .25) + Ln(`M0 ${N(y0 + d * .55)}L0 ${y1}`);
            case 'm_photoeasel': return tri(c) + Rr(x0 + w * .12, y1 - d * .55, w * .76, 4, 0, c2);
            default: return undefined;
        }
    }
    const prev2 = ext.houseSym2dX;
    ext.houseSym2dX = (k, item, o) => (typeof k === 'string' && k.startsWith('m_') ? sym(k, item, o) : undefined) ?? prev2?.(k, item, o);

    /* ═════════ Les formes en volume (mètres ; le devant regarde +z) ═════════ */
    const TXC = new Map(), TMC = new Map();
    function ctex(T, key, W, H, draw) {
        if (TXC.has(key)) return TXC.get(key);
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H; draw(cv.getContext('2d'), W, H);
        const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; TXC.set(key, t); return t;
    }
    const texMat = (T, t, o = {}) => { const k = t.uuid + JSON.stringify(o); if (!TMC.has(k)) TMC.set(k, new T.MeshStandardMaterial({map: t, roughness: .85, ...o})); return TMC.get(k); };
    const seeded = s => () => (s = (s * 16807 + 11) % 2147483647) / 2147483647;
    const PAINT = ['#c0392b', '#e0c46a', '#2a5db0', '#3a8a5a', '#f4f1ea', '#6a3a1a', '#e07a3a', '#1a1a1a'];
    /* ── ce qui est peint ou posé : toiles en cours, cartes, affiches, étagères ── */
    const ART = {
        blank: (g, W, H) => { g.fillStyle = '#f2ede2'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(0,0,0,.03)'; for (let i = 0; i < W; i += 3) g.fillRect(i, 0, 1, H); },
        sketch: (g, W, H) => { ART.blank(g, W, H); g.strokeStyle = 'rgba(40,30,20,.65)'; g.lineWidth = 2; const r = seeded(3); for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(W * r(), H * r()); g.bezierCurveTo(W * r(), H * r(), W * r(), H * r(), W * r(), H * r()); g.stroke(); } g.strokeRect(W * .3, H * .25, W * .4, H * .5); },
        paint: (g, W, H) => { const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#8fb3cf'); sky.addColorStop(.55, '#efe2c0'); sky.addColorStop(.56, '#8a9a5a'); sky.addColorStop(1, '#5a6a3a'); g.fillStyle = sky; g.fillRect(0, 0, W, H); const r = seeded(11); for (let i = 0; i < 260; i++) { g.fillStyle = PAINT[(r() * 7) | 0] + '55'; g.fillRect(W * r(), H * r(), 6 + r() * 10, 3 + r() * 4); } g.fillStyle = '#f2ede2'; g.fillRect(W * .62, 0, W * .38, H * .35); },
        carte: (g, W, H) => { g.fillStyle = '#f0e6c8'; g.fillRect(0, 0, W, H); g.fillStyle = '#9ec3d6'; g.fillRect(0, 0, W, H); g.fillStyle = '#e8dcb0'; g.beginPath(); [[.35, .08], [.55, .1], [.72, .22], [.8, .4], [.78, .62], [.66, .86], [.45, .9], [.3, .78], [.22, .6], [.16, .42], [.26, .3], [.3, .14]].forEach(([x, y], i) => i ? g.lineTo(W * x, H * y) : g.moveTo(W * x, H * y)); g.closePath(); g.fill(); g.strokeStyle = '#8a6a3a'; g.lineWidth = 2; g.stroke(); g.strokeStyle = '#2a5db0'; g.lineWidth = 1.5; [[.4, .2, .5, .6], [.6, .3, .55, .8], [.3, .5, .45, .7]].forEach(([a, b, c, d]) => { g.beginPath(); g.moveTo(W * a, H * b); g.quadraticCurveTo(W * (a + c) / 2 + 10, H * (b + d) / 2, W * c, H * d); g.stroke(); }); g.fillStyle = '#3a2a1a'; g.font = `bold ${H * .07}px Georgia`; g.textAlign = 'center'; g.fillText('FRANCE', W * .5, H * .97); },
        decor: (g, W, H) => { const s = g.createLinearGradient(0, 0, 0, H); s.addColorStop(0, '#6a7a8a'); s.addColorStop(.6, '#b8b4a8'); s.addColorStop(1, '#5a5a52'); g.fillStyle = s; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(W * .3, H * .35, W * .25, H * .18, 0, 0, 7); g.fill(); g.fillStyle = '#4a4a42'; g.fillRect(W * .7, H * .25, W * .06, H * .5); g.beginPath(); g.ellipse(W * .73, H * .25, W * .12, H * .12, 0, 0, 7); g.fill(); },
        board: (g, W, H) => { g.fillStyle = '#22332a'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(240,240,230,.8)'; g.lineWidth = 2; g.font = `${H * .12}px Georgia`; g.fillStyle = 'rgba(240,240,230,.85)'; g.fillText('Leçon de morale', W * .08, H * .22); for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(W * .08, H * (.38 + i * .16)); g.lineTo(W * (.6 + i * .1), H * (.38 + i * .16)); g.stroke(); } },
        affiche: (g, W, H) => { g.fillStyle = '#e8d8b0'; g.fillRect(0, 0, W, H); g.fillStyle = '#c0392b'; g.fillRect(0, 0, W, H * .3); g.fillStyle = '#2a4a7a'; g.beginPath(); g.arc(W * .5, H * .6, W * .25, 0, 7); g.fill(); g.fillStyle = '#1a1a1a'; g.font = `bold ${H * .09}px Georgia`; g.textAlign = 'center'; g.fillText('EXPOSITION', W / 2, H * .2); g.font = `${H * .06}px Georgia`; g.fillText('1900', W / 2, H * .94); },
        diplome: (g, W, H) => { g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, W, H); g.strokeStyle = '#8a6a3a'; g.lineWidth = 4; g.strokeRect(10, 10, W - 20, H - 20); g.fillStyle = '#3a2a1a'; g.font = `bold ${H * .1}px Georgia`; g.textAlign = 'center'; g.fillText('Certificat d’études', W / 2, H * .3); g.fillStyle = 'rgba(58,42,26,.55)'; for (let i = 0; i < 4; i++) g.fillRect(W * .2, H * (.45 + i * .1), W * .6, 3); g.fillStyle = '#c0392b'; g.beginPath(); g.arc(W * .8, H * .8, H * .08, 0, 7); g.fill(); },
        portrait: (g, W, H) => { g.fillStyle = '#c9b79a'; g.fillRect(0, 0, W, H); g.fillStyle = '#4a3a2a'; g.beginPath(); g.ellipse(W / 2, H * .4, W * .16, H * .16, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(W / 2, H * 1.02, W * .36, H * .4, 0, Math.PI, 0); g.fill(); g.fillStyle = '#d9c09a'; g.beginPath(); g.ellipse(W / 2, H * .43, W * .1, H * .12, 0, 0, 7); g.fill(); },
        forge: (g, W, H) => { g.fillStyle = '#4a3020'; g.fillRect(0, 0, W, H); g.strokeStyle = '#2a2a2a'; g.lineWidth = 6; for (let i = 0; i < 9; i++) { const x = W * (i + .5) / 9; g.beginPath(); g.moveTo(x, H * .12); g.lineTo(x + (i % 2 ? 8 : -8), H * .85); g.stroke(); g.fillStyle = '#2a2a2a'; g.fillRect(x - 8, H * .06, 16, 10); } },
        bois: (g, W, H) => { g.fillStyle = '#c9a77a'; g.fillRect(0, 0, W, H); g.fillStyle = '#5a3b22'; for (let i = 0; i < 7; i++) { const x = W * (i + .5) / 7; g.fillRect(x - 2, H * .1, 4, H * .5); g.fillStyle = i % 2 ? '#7a5a3a' : '#8a8f96'; g.fillRect(x - 9, H * .55, 18, H * .3); g.fillStyle = '#5a3b22'; } g.fillStyle = '#3a3a3a'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(W * (i + .5) / 12, H * .06, 2, 0, 7); g.fill(); } },
        horloger: (g, W, H) => { g.fillStyle = '#6a4026'; g.fillRect(0, 0, W, H); for (let i = 0; i < 6; i++) { const x = W * ((i % 3) + .5) / 3, y = H * ((i / 3 | 0) + .5) / 2; g.fillStyle = '#4a2a16'; g.fillRect(x - W * .1, y - H * .2, W * .2, H * .4); g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(x, y - H * .05, W * .07, 0, 7); g.fill(); g.strokeStyle = '#1a1a1a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - H * .05); g.lineTo(x + 6, y - H * .1); g.stroke(); } },
        shelf: kind => (g, W, H) => { const r = seeded(kind.length * 7 + 3); g.fillStyle = '#2a2018'; g.fillRect(0, 0, W, H);
            if (kind === 'registres') { let x = 2; while (x < W - 6) { const bw = 14 + r() * 8; g.fillStyle = ['#3a5a3a', '#5a2a2a', '#2a3a5a', '#6a4a2a'][(r() * 4) | 0]; g.fillRect(x, H * .08, bw - 2, H * .9); g.fillStyle = '#e9dcb8'; g.fillRect(x + 3, H * .3, bw - 8, H * .14); x += bw; } return; }
            const n = {pots: 5, bocaux: 7, apothic: 6, formes: 6, pains: 6}[kind] || 6;
            for (let i = 0; i < n; i++) { const cx = W * (i + .5) / n, bw = W / n * .7;
                if (kind === 'pots') { g.fillStyle = ['#b0603a', '#c98a5a', '#8a4a2a'][i % 3]; g.beginPath(); g.ellipse(cx, H * .62, bw * .45, H * .34, 0, 0, 7); g.fill(); g.fillRect(cx - bw * .2, H * .18, bw * .4, H * .14); }
                else if (kind === 'bocaux') { g.fillStyle = 'rgba(220,240,250,.4)'; g.fillRect(cx - bw * .4, H * .12, bw * .8, H * .86); g.fillStyle = PAINT[(r() * 7) | 0]; for (let j = 0; j < 14; j++) { g.beginPath(); g.arc(cx - bw * .3 + r() * bw * .6, H * (.45 + r() * .5), 4, 0, 7); g.fill(); } g.fillStyle = '#c9a24a'; g.fillRect(cx - bw * .42, H * .06, bw * .84, H * .08); }
                else if (kind === 'apothic') { g.fillStyle = '#f4f1ea'; g.fillRect(cx - bw * .38, H * .2, bw * .76, H * .78); g.fillStyle = '#2a5db0'; g.fillRect(cx - bw * .38, H * .45, bw * .76, H * .18); g.fillStyle = '#f4f1ea'; g.fillRect(cx - bw * .3, H * .5, bw * .6, H * .08); g.fillStyle = '#2a5db0'; g.fillRect(cx - bw * .25, H * .1, bw * .5, H * .12); }
                else if (kind === 'formes') { g.fillStyle = i % 2 ? '#c9a77a' : '#3a2418'; g.beginPath(); g.ellipse(cx, H * .8, bw * .45, H * .16, 0, 0, 7); g.fill(); g.fillRect(cx - bw * .45, H * .4, bw * .3, H * .42); }
                else { g.fillStyle = ['#d6a05a', '#c98a3a', '#e0b870'][i % 3]; g.beginPath(); g.ellipse(cx, H * .65, bw * .48, H * .28, 0, 0, 7); g.fill(); g.strokeStyle = '#8a5a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - bw * .2, H * .55); g.lineTo(cx + bw * .2, H * .65); g.stroke(); } } }
    };
    function f3(shape, x) {
        const {T, w, d, h, col, it} = x, mat = x.mat, col2 = x.col2 || '', m = Math.min(w, d), PI = Math.PI, L9 = L9of(it);
        const sh = (c, f) => '#' + new T.Color(c).multiplyScalar(f).getHexString(), dk = col2 || sh(col, .55);
        let tgt = x.g; const add = (o, px = 0, py = 0, pz = 0) => { o.position.set(px, py, pz); tgt.add(o); return o; };
        const M_ = c => (c && c.isMaterial) ? c : mat(c);
        const Bx = (ww, hh, dd, c = col, px = 0, py = hh / 2, pz = 0) => add(x.box(Math.max(.002, ww), Math.max(.002, hh), Math.max(.002, dd), M_(c)), px, py, pz);
        const Cy = (rt, rb, hh, c = col, px = 0, py = hh / 2, pz = 0, seg = 20, open = false) => add(new T.Mesh(new T.CylinderGeometry(Math.max(.001, rt), Math.max(.001, rb), Math.max(.001, hh), seg, 1, open), open && typeof c === 'string' ? mat(c, '', {side: T.DoubleSide}) : M_(c)), px, py, pz);
        const CyX = (r, len, c, px, py, pz, seg = 16) => { const o = Cy(r, r, len, c, px, py, pz, seg); o.rotation.z = PI / 2; return o; };
        const CyZ = (r, len, c, px, py, pz, seg = 16) => { const o = Cy(r, r, len, c, px, py, pz, seg); o.rotation.x = PI / 2; return o; };
        const Sp = (rx, ry, rz, c = col, px = 0, py = 0, pz = 0, seg = 14) => { const o = add(new T.Mesh(new T.SphereGeometry(1, seg, Math.max(6, seg * .6 | 0)), M_(c)), px, py, pz); o.scale.set(Math.max(.001, rx), Math.max(.001, ry), Math.max(.001, rz)); return o; };
        const To = (r, t, c = col, px = 0, py = 0, pz = 0, arc = PI * 2, seg = 24) => add(new T.Mesh(new T.TorusGeometry(Math.max(.002, r), Math.max(.001, t), 8, seg, arc), M_(c)), px, py, pz);
        const V = (a, b, c) => new T.Vector3(a, b, c), UP = V(0, 1, 0);
        const Rod = (a, b, r = .012, c = dk, seg = 8) => { const A0 = V(...a), B0 = V(...b), dir = B0.clone().sub(A0), len = dir.length() || .001; const o = add(new T.Mesh(new T.CylinderGeometry(r, r, len, seg), M_(c)), (A0.x + B0.x) / 2, (A0.y + B0.y) / 2, (A0.z + B0.z) / 2); o.quaternion.setFromUnitVectors(UP, dir.normalize()); return o; };
        const rot = (o, rx = 0, ry = 0, rz = 0) => { o.rotation.set(rx, ry, rz); return o; };
        const sub = (fn, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0) => { const prev = tgt, gg = new T.Group(); tgt = gg; fn(); tgt = prev; gg.position.set(px, py, pz); gg.rotation.set(rx, ry, rz); prev.add(gg); return gg; };
        const plane = (ww, hh, t, px, py, pz, rx = 0, ry = 0, o = {}) => { const p = add(new T.Mesh(new T.PlaneGeometry(ww, hh), texMat(T, t, o)), px, py, pz); p.rotation.set(rx, ry, 0); return p; };
        const slot = (ww, hh, px, py, pz, rx = 0, ry = 0, i = 0) => ext.housePics?.slot?.(T, tgt, {w: ww, h: hh, x: px, y: py, z: pz, rx, ry, i});
        const legs4 = (top, lw = .05, c = col, ix = 0, iz = 0) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => Bx(lw, top, lw, c, a * (w / 2 - lw / 2 - ix), top / 2, b * (d / 2 - lw / 2 - iz)));
        const metal = (c = '#5a5a5a', r = .45) => mat(c, '', {metalness: .5, roughness: r});
        const glass = mat('#cfe6f3', '', {transparent: true, opacity: .28, roughness: .05, metalness: .1});
        const glow = (c = '#ff8a3a', k = 1.6) => mat(c, '', {emissive: c, emissiveIntensity: k});
        const wd = c => mat(c, 'bois');
        const linen = '#f2ede2';
        /** une toile sur châssis (face +z) : sa face peinte (ou l'image choisie), ses côtés, son châssis au dos */
        const canvasBoard = (cw, ch, px, py, pz, art = 'blank', withSlot = true, th = .022) => {
            Bx(cw, ch, th, linen, px, py, pz); Bx(cw - .04, .03, .01, '#c9a77a', px, py + ch / 2 - .035, pz - th / 2 - .005); Bx(cw - .04, .03, .01, '#c9a77a', px, py - ch / 2 + .035, pz - th / 2 - .005);
            if (ch > .5) Bx(.03, ch - .08, .01, '#c9a77a', px, py, pz - th / 2 - .005);
            plane(cw - .002, ch - .002, ctex(T, 'mart|' + art, 256, Math.round(256 * clampR(ch / cw)), ART[art] || ART.blank), px, py, pz + th / 2 + .0006);
            if (withSlot) slot(cw - .002, ch - .002, px, py, pz + th / 2 + .001);
        };
        switch (shape) {
            /* ── 🎨 peintre ── */
            case 'm_easelstudio': { const c2m = col2 || sh(col, .6), [cw, ch] = cvSize(it, shape).map(v => v / 100);
                Bx(w, .07, .1, c2m, 0, .1, d / 2 - .1); Bx(w * .9, .07, .1, c2m, 0, .1, -d / 2 + .1); Bx(.1, .07, d, c2m, 0, .1, 0); [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([a, b]) => Sp(.03, .03, .03, '#2a2a2a', a * (w / 2 - .06), .03, b * (d / 2 - .1), 8));
                [-1, 1].forEach(s => Bx(.06, h - .15, .06, col, s * w * .2, .13 + (h - .15) / 2, .05)); Bx(.08, h * .98, .06, col, 0, .13 + h * .49, .02); Bx(w * .5, .06, .06, col, 0, h - .1, .05);
                Bx(w * .95, .05, .14, col, 0, .72, .1); Bx(w * .95, .02, .04, col, 0, .76, .16); CyX(.015, .14, metal('#8a8f96'), w * .27, .9, .08);
                canvasBoard(cw, ch, 0, .76 + ch / 2, .1, L9.art || 'sketch'); Bx(.1, .05, .06, col, 0, .76 + ch + .02, .08); return true; }
            case 'm_easelfield': { const [cw, ch] = cvSize(it, shape).map(v => v / 100), top = h * .98;
                [-1, 1].forEach(s => Rod([s * w * .42, 0, d / 2 - .05], [s * .04, top, .02], .014, col)); Rod([0, 0, -d / 2 + .05], [0, top * .95, -.02], .014, col);
                const y0 = h * .45; Rod([-w * .38, y0, .14], [w * .38, y0, .14], .012, col); Bx(w * .7, .02, .05, col, 0, y0 + .01, .15);
                sub(() => canvasBoard(cw, ch, 0, ch / 2, 0, L9.art || 'paint'), 0, y0 + .02, .16, -.1); Bx(.25, .07, .05, '#6a4026', w * .2, y0 - .25, .05); return true; }
            case 'm_easeltable': { const [cw, ch] = cvSize(it, shape).map(v => v / 100);
                Bx(w, .02, d, col, 0, .01, 0); Rod([0, .02, -d / 2 + .03], [0, h, .02], .01, col); [-1, 1].forEach(s => Rod([s * w * .4, .02, d / 2 - .02], [s * .03, h, .03], .008, col)); Bx(w * .9, .015, .04, col, 0, .07, .06);
                sub(() => canvasBoard(cw, ch, 0, ch / 2, 0, L9.art || 'paint', true, .015), 0, .08, .07, -.12); return true; }
            case 'm_canvaslean': { const th = .022, lean = Math.min(.35, Math.asin(clampR((d - .04) / Math.max(.1, h), 0, .6)));
                sub(() => canvasBoard(w, h, 0, h / 2, 0, L9.art || 'blank', true, th), 0, 0, d / 2 - .03, -lean); return true; }
            case 'm_canvasfloor': sub(() => canvasBoard(w, d, 0, d / 2, 0, L9.art || 'paint', true, Math.max(.015, h)), 0, Math.max(.015, h) / 2, d / 2, -PI / 2); Cy(.03, .03, .01, '#c0392b', w * .3, h + .006, d * .2); Cy(.025, .025, .01, '#2a5db0', w * .34, h + .006, d * .3); return true;
            case 'm_canvasstack': { const n = 4; for (let i = 0; i < n; i++) { const ww = w * (1 - i * .06), hh = h * (1 - i * .12), z = d / 2 - .05 - i * (d - .1) / n; sub(() => canvasBoard(ww * .95, hh * .95, 0, hh * .95 / 2, 0, i ? ['blank', 'sketch', 'paint'][i % 3] : (L9.art || 'paint'), i === 0, .022), (i % 2 ? -1 : 1) * w * .02 * i, 0, i === 0 ? d / 2 - .04 : z, -.12); }
                return true; }
            case 'm_canvasrack': { Bx(w, .05, d, col, 0, .025); Bx(w, .05, .05, col, 0, h - .025, -d / 2 + .025); Bx(w, .05, .05, col, 0, h * .55, d / 2 - .025); const n = Math.max(3, Math.round(w / .2));
                for (let i = 0; i <= n; i++) { const px = -w / 2 + w * i / n; Bx(.03, h, .04, col, px, h / 2, -d / 2 + .02); Bx(.03, h * .55, .04, col, px, h * .275, d / 2 - .02); }
                const r = seeded(5); for (let i = 0; i < n; i++) if (r() < .75) { const ch = h * (.5 + r() * .4), cw = d * (.6 + r() * .35); Bx(.025, ch, cw, i % 2 ? linen : '#e9e1cf', -w / 2 + w * (i + .5) / n, .05 + ch / 2, 0); } return true; }
            case 'm_palette': { const s = new T.Shape(); s.moveTo(-w / 2, 0); s.bezierCurveTo(-w / 2, -d / 2 - .03, w / 2, -d / 2, w / 2, 0); s.bezierCurveTo(w / 2, d / 2, -w / 5, d / 2 + .02, -w / 2, 0);
                const hole = new T.Path(); hole.absarc(-w * .28, -d * .05, Math.min(w, d) * .08, 0, PI * 2, true); s.holes.push(hole);
                const geo = new T.ExtrudeGeometry(s, {depth: Math.max(.006, h), bevelEnabled: false, curveSegments: 16}); geo.rotateX(PI / 2); geo.translate(0, Math.max(.006, h), 0); add(new T.Mesh(geo, M_(col)));
                for (let i = 0; i < 7; i++) Sp(.014, .006, .014, PAINT[i], -w * .1 + i * w * .085, h + .004, -d * .25 + (i % 2) * d * .12, 8); Sp(.04, .004, .03, '#d06a5a', w * .1, h + .003, d * .12, 10); Rod([w * .05, h + .01, d * .3], [w * .5, h + .01, -d * .05], .004, '#6a3a1a'); return true; }
            case 'm_paintbox': { const bh = h * .3; Bx(w, bh, d, col, 0, bh / 2); Bx(w - .02, .005, d - .02, '#e9e1cf', 0, bh - .01);
                for (let i = 0; i < 8; i++) { const t = CyX(.009, w * .2, mat(PAINT[i], '', {metalness: .3, roughness: .4}), -w * .25 + (i % 2) * w * .32, bh + .005, -d * .35 + (i >> 1) * d * .16); t.rotation.y = .1 * (i - 4); }
                sub(() => { Bx(w, d, .02, col, 0, d / 2, 0); Bx(w * .8, d * .7, .004, '#c9a77a', 0, d / 2, .012); }, 0, bh, -d / 2, -.25); return true; }
            case 'm_taboret': { const top = h * .55; Bx(w, top, d, col, 0, top / 2); for (let i = 0; i < 3; i++) { Bx(w - .04, .005, .005, dk, 0, .06 + i * top / 3 + top / 6, d / 2 + .003); Sp(.012, .012, .012, '#c9a24a', 0, top * (i + .5) / 3, d / 2 + .01, 8); }
                Bx(w, .03, d, col, 0, top + .015); Cy(.06, .055, .16, '#c9b9a0', -w * .25, top + .11, -d * .15); for (let i = 0; i < 7; i++) Rod([-w * .25, top + .1, -d * .15], [-w * .25 + Math.cos(i) * .05, h, -d * .15 + Math.sin(i) * .05], .004, ['#6a3a1a', '#c9a77a', '#3a3a3a'][i % 3]);
                Cy(.05, .05, .12, metal('#8a8f96'), w * .22, top + .09, -d * .2); for (let i = 0; i < 5; i++) { const tb = CyX(.01, .1, mat(PAINT[i], '', {metalness: .3}), -w * .1 + i * .05, top + .04, d * .2); tb.rotation.y = .5; } return true; }
            case 'm_brushjar': { Cy(m * .42, m * .36, h * .45, col, 0, h * .225, 0, 18); Cy(m * .43, m * .43, .01, sh(col, .8), 0, h * .45); for (let i = 0; i < 8; i++) { const a = i * .8, r = m * .2; Rod([Math.cos(a) * r * .5, h * .2, Math.sin(a) * r * .5], [Math.cos(a) * r, h * (.85 + (i % 3) * .05), Math.sin(a) * r], .004, ['#6a3a1a', '#c9a77a', '#3a3a3a', '#c0392b'][i % 4]); Sp(.007, .02, .007, '#2a2018', Math.cos(a) * r, h * (.88 + (i % 3) * .05), Math.sin(a) * r, 6); } return true; }
            case 'm_manikin': { Bx(w * .8, .015, d * .8, col, 0, .0075); Rod([0, .015, 0], [0, h * .4, 0], .004, col); Sp(.02, .035, .015, col, 0, h * .55); Sp(.012, .016, .012, col, 0, h * .78);
                Sp(.012, .02, .012, col, 0, h * .9); [-1, 1].forEach(s => { Rod([s * .02, h * .65, 0], [s * .045, h * .45, .01], .005, col); Rod([s * .01, h * .42, 0], [s * .02, h * .2, .005], .006, col); Rod([s * .02, h * .2, .005], [s * .025, .03, 0], .005, col); }); return true; }
            case 'm_modelstand': { const ph = .3; Bx(w, ph, d, col, 0, ph / 2); Bx(w * .7, .04, d * .5, mat(col2 || '#b23a3a', 'tissu'), -w * .08, ph + .02, -d * .1); Sp(w * .3, .1, d * .25, mat(col2 || '#b23a3a', 'tissu'), -w * .05, ph + .02, -d * .05, 16).scale.y = .05;
                Bx(.45, .05, .42, '#7a4f2a', w * .15, ph + .45, d * .1); Bx(.45, .45, .04, '#7a4f2a', w * .15, ph + .7, d * .1 - .2); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => Bx(.04, .45, .04, '#7a4f2a', w * .15 + a * .2, ph + .225, d * .1 + b * .19)); return true; }
            /* ── 🗿 sculpteur, tailleur de pierre ── */
            case 'm_selle': { const top = h * (L9.what === 'clay' ? .82 : .6); for (let i = 0; i < 3; i++) { const a = i * 2.094 + .5; Rod([Math.cos(a) * w * .45, 0, Math.sin(a) * d * .45], [0, top * .7, 0], .02, col); } Cy(.05, .06, top * .4, col, 0, top * .8); Cy(m * .36, m * .36, .04, col, 0, top);
                const cl = L9.what === 'clay' ? mat('#a0603a', '', {roughness: .95}) : mat('#efe9dc', '', {roughness: .9}), rest = h - top;
                if (L9.what === 'bust') { Bx(m * .3, .06, m * .3, cl, 0, top + .05); Cy(m * .2, m * .3, rest * .3, cl, 0, top + .08 + rest * .15); Cy(.05, .06, rest * .12, cl, 0, top + .08 + rest * .36); Sp(.09, .12, .1, cl, 0, top + .08 + rest * .6, 0, 16); }
                else if (L9.what === 'figure') { Cy(m * .14, m * .18, .05, cl, 0, top + .045); sub(() => { Cy(.06, .08, rest * .5, cl, 0, rest * .25); Sp(.08, .1, .06, cl, 0, rest * .58); Sp(.05, .06, .05, cl, 0, rest * .78); Rod([.05, rest * .62, 0], [.16, rest * .85, .03], .022, cl); }, 0, top + .07, 0, 0, 0, .06); }
                else { Sp(m * .26, rest * .45, m * .24, cl, 0, top + .02 + rest * .4, 0, 14); Sp(m * .12, rest * .2, m * .12, cl, .03, top + rest * .82, 0, 10); Bx(.18, .005, .14, '#c9c2b2', m * .25, top + .025, m * .1); }
                return true; }
            case 'm_stoneblock': { const st = mat(col, 'pierre'); Bx(w, h * .9, d, st, 0, h * .45); Bx(w * .7, h * .1, d * .8, st, -w * .1, h * .95); for (let i = 0; i < 6; i++) Sp(.04, .02, .03, st, -w / 2 - .05 + i * .02, .01, d / 2 + .04 - (i % 3) * .05, 6);
                Rod([w * .1, h + .005, 0], [w * .35, h + .005, d * .2], .008, metal('#8a8f96')); Cy(.04, .04, .14, '#7a5a3a', -w * .25, h + .04, d * .2, 12).rotation.z = PI / 2; return true; }
            case 'm_banker': { const bh = h * .8, st = mat(col2 || '#d6cdb8', 'pierre'); Bx(w, .08, d, col, 0, bh - .04); legs4(bh - .08, .1); Bx(w * .9, .06, d * .9, col, 0, .2); Bx(w * .55, h - bh, d * .55, st, 0, bh + (h - bh) / 2); Rod([w * .3, bh + .005, d * .3], [w * .45, bh + .005, d * .1], .008, metal()); return true; }
            /* ── ⚒ forgeron, maréchal-ferrant ── */
            case 'm_forge': { const br = mat(col, 'brique'), fh = .8, c2m = col2 || '#3a3a3a'; Bx(w, fh, d * .9, br, 0, fh / 2, -d * .05); Bx(w * .7, .04, d * .55, '#1a1a1a', 0, fh + .02, 0); Sp(w * .15, .05, d * .15, glow('#ff7a2a'), 0, fh + .05, 0, 12); Sp(w * .1, .03, d * .1, glow('#ffd27a', 2), 0, fh + .07, 0, 10);
                const k = new T.Group(), me = new T.Mesh(new T.CylinderGeometry(.7071 * .3, .7071 * 1, .7, 4, 1, true), mat(c2m, '', {side: T.DoubleSide, metalness: .4, roughness: .6})); me.rotation.y = PI / 4; k.add(me); k.scale.set(w * .95, 1, d * .9); k.position.set(0, fh + .9, -d * .05); tgt.add(k);
                Bx(w * .3, h - fh - 1.25, d * .3, br, 0, fh + 1.25 + (h - fh - 1.25) / 2, -d * .2); Bx(w + .04, .08, .08, sh(col, .75), 0, fh - .04, d * .4); Rod([w * .3, fh + .1, d * .2], [w * .6, fh - .1, d * .55], .01, metal('#3a3a3a')); return true; }
            case 'm_anvil': { const bh = h * .55, c2m = col2 || '#7a5a3a'; Cy(m * .48, m * .52, bh, wd(c2m), 0, bh / 2, 0, 18); const ir = metal(col, .5), ah = h - bh;
                Bx(w * .25, ah * .35, d * .55, ir, 0, bh + ah * .175); Bx(w * .12, ah * .3, d * .4, ir, 0, bh + ah * .5); Bx(w * .6, ah * .35, d * .7, ir, -w * .05, bh + ah * .82); add(new T.Mesh(new T.ConeGeometry(d * .3, w * .35, 12), ir), w * .42, bh + ah * .82, 0).rotation.z = -PI / 2;
                Rod([-w * .1, h + .02, -d * .3], [w * .05, h + .02, d * .2], .008, '#6a4a2a'); Bx(.08, .04, .04, ir, w * .06, h + .02, d * .23); return true; }
            case 'm_bellows': { const bh = h * .55; legs4(bh - .1, .07, '#6a4a2a', .05, .05); Bx(w * .9, .05, d * .8, '#6a4a2a', -w * .05, bh - .1);
                const s = new T.Shape([new T.Vector2(-w * .45, -d * .38), new T.Vector2(w * .3, -d * .08), new T.Vector2(w * .3, d * .08), new T.Vector2(-w * .45, d * .38)]);
                [0, .14, .07].forEach((dy, i) => { const geo = new T.ExtrudeGeometry(s, {depth: i === 2 ? .12 : .03, bevelEnabled: false}); geo.rotateX(PI / 2); add(new T.Mesh(geo, i === 2 ? mat(sh(col, .7), 'tissu') : M_(col)), 0, bh + dy + (i === 2 ? .12 : .03), 0); });
                Cy(.03, .045, w * .2, metal('#3a3a3a'), w * .4, bh + .08, 0).rotation.z = PI / 2; Rod([0, bh + .2, 0], [-w * .1, h, 0], .03, '#6a4a2a'); Rod([-w * .5, h * .95, 0], [w * .1, h * .95, 0], .025, '#6a4a2a'); Rod([-w * .45, h * .95, 0], [-w * .45, h * .35, 0], .006, '#3a3a3a'); return true; }
            case 'm_travail': { const wo = M_(col), pz = d / 2 - .08, px = w / 2 - .08; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => Bx(.16, h, .16, wo, a * px, h / 2, b * pz));
                [-1, 1].forEach(b => { Bx(w, .14, .14, wo, 0, h - .07, b * pz); Bx(w, .12, .12, wo, 0, .9, b * pz); }); [-1, 1].forEach(a => Bx(.14, .14, d, wo, a * px, h - .07, 0));
                Bx(.12, .5, d * .8, wo, -px - .02, .7, 0); CyX(.08, w * .9, wo, 0, h * .6, -pz); Bx(.2, .3, .1, wo, px - .2, .5, pz + .05); Rod([-w * .3, h - .14, pz], [-w * .3, 1.3, pz], .01, metal()); Rod([w * .3, h - .14, -pz], [w * .3, 1.3, -pz], .01, metal()); return true; }
            case 'm_tub': { Cy(m / 2, m * .46, h, col, 0, h / 2, 0, 22, true); Cy(m * .46, m * .46, .01, col, 0, .005); [.2, .8].forEach(f => To(m / 2 + .004, .008, metal('#3a3a3a'), 0, h * f, 0).rotation.x = PI / 2);
                Cy(m * .47, m * .47, .005, L9.art === 'water' ? mat('#4a6a8a', '', {roughness: .1, metalness: .2}) : '#c9b38a', 0, h * .82); return true; }
            case 'm_toolwall': { const art = L9.art || 'bois'; Bx(w, h, Math.min(.03, d), col, 0, h / 2, -d / 2 + .015); plane(w * .96, h * .9, ctex(T, 'mart|' + art, 256, Math.round(256 * clampR(h / w)), ART[art] || ART.bois), 0, h / 2, -d / 2 + .032);
                if (art === 'forge') for (let i = 0; i < 5; i++) Rod([-w * .4 + i * w * .2, h * .9, -d / 2 + .05], [-w * .4 + i * w * .2 + .02, h * .2, -d / 2 + .06], .008, metal('#2a2a2a'));
                return true; }
            /* ── 🪚 menuisier, ébéniste, luthier ── */
            case 'm_bench': { const th = .09; Bx(w, th, d, col, 0, h - th / 2); legs4(h - th, .1, col, .08, .05); Bx(w - .3, .07, .07, col, 0, .25, d / 2 - .12); Bx(w - .3, .07, .07, col, 0, .25, -d / 2 + .12); Bx(.4, .2, .12, col, -w / 2 + .2, h - .1, d / 2 + .05);
                CyX(.018, .3, '#7a5a3a', -w / 2 + .2, h - .08, d / 2 + .12); Rod([w * .3, h, -d * .2], [w * .3 + .05, h + .3, -d * .2], .015, metal('#3a3a3a')); Rod([w * .3 + .05, h + .3, -d * .2], [w * .3 + .25, h + .28, -d * .2], .015, metal('#3a3a3a'));
                if (L9.tools === 'luthier') { [[-.15, 0, '#8a4a22'], [.15, .05, '#a8642a'], [.4, -.05, '#c9a77a']].forEach(([px, pz, c]) => { sub(() => { Sp(.1, .012, .065, c, 0, 0, -.09, 14); Sp(.08, .012, .055, c, 0, 0, .07, 14); Bx(.03, .015, .26, '#1a1a1a', 0, .012, .25); Sp(.018, .02, .03, c, 0, .02, .39, 8); }, w * px, h + .02, pz, 0, .3, 0); }); }
                else { Bx(.3, .06, .07, '#9a6a3a', -w * .1, h + .03, -d * .1); Bx(.05, .03, .03, '#6a4a2a', -w * .1, h + .07, -d * .1); Bx(w * .3, .02, .12, '#c9a77a', w * .05, h + .01, d * .15); Rod([-w * .35, h + .01, -d * .3], [-w * .2, h + .01, -d * .32], .006, metal('#8a8f96')); }
                return true; }
            case 'm_press': { const small = !!L9.small, ir = metal(col2 || '#3a3a3a'); Bx(w, small ? .06 : .12, d, col, 0, small ? .03 : .06); [-1, 1].forEach(s => Bx(small ? .06 : .1, h, small ? .06 : .12, col, s * (w / 2 - .06), h / 2, 0)); Bx(w, small ? .08 : .14, small ? .06 : .14, col, 0, h - (small ? .04 : .07));
                (small ? [0] : [-w * .2, w * .2]).forEach(px => { Rod([px, h - .1, 0], [px, h * .45, 0], small ? .015 : .025, ir); Rod([px - .15, h * .62, 0], [px + .15, h * .62, 0], .01, ir); }); Bx(w * .85, small ? .04 : .06, d * .9, col, 0, h * .42);
                if (small) for (let i = 0; i < 4; i++) Bx(w * .55, .04, d * .7, ['#3a5a3a', '#5a2a2a', '#2a3a5a', '#6a4a2a'][i], 0, .08 + i * .045); else Bx(w * .85, .08, d * .85, '#c9a77a', 0, .16); return true; }
            case 'm_bandsaw': { const c2m = col2 || '#2b2b2b'; Bx(w * .6, h * .45, d * .6, col, 0, h * .225); Bx(w, .04, d, metal('#9aa3a8'), 0, h * .48); Bx(w * .15, h * .5, d * .3, col, -w * .35, h * .73, -d * .1);
                [h * .25, h * .95].forEach(y => { const wh = Cy(d * .35, d * .35, .06, col, -w * .1, y, -d * .1, 24); wh.rotation.z = PI / 2; wh.rotation.y = PI / 2; }); Bx(w * .3, .1, d * .3, col, -w * .1, h * .95, -d * .1); Bx(.005, h * .5, .01, metal('#c8ccd0', .2), w * .05, h * .72, d * .08); Bx(.1, .1, .1, c2m, w * .35, h * .3, 0); return true; }
            case 'm_planks': { const n = 6, ph = h / n, r = seeded(9); for (let i = 0; i < n; i++) { const ww = w * (.85 + r() * .15); Bx(ww, ph * .85, d * .3, i % 2 ? '#b8925a' : col, (r() - .5) * .1, ph * (i + .5), -d * .33); Bx(ww, ph * .85, d * .3, i % 2 ? col : '#b8925a', (r() - .5) * .1, ph * (i + .5), d * .02); Bx(ww * .9, ph * .85, d * .28, '#c9a77a', 0, ph * (i + .5), d * .35); if (i % 2) Bx(.05, .02, d, '#8a6a4a', 0, ph * (i + 1) - .01, 0); } return true; }
            /* ── 🛢 tonnelier, charron ── */
            case 'm_barrelwip': { const n = 18, r0 = m * .42, r1 = m * .5; for (let i = 0; i < n; i++) { const a = i * PI * 2 / n; Rod([Math.cos(a) * r0, 0, Math.sin(a) * r0], [Math.cos(a) * r1, h, Math.sin(a) * r1], .022, i % 3 ? col : sh(col, .85), 4); }
                To(r0 + .02, .012, metal(col2 || '#3a3a3a'), 0, .08, 0).rotation.x = PI / 2; To(r0 + .03, .012, metal(col2 || '#3a3a3a'), 0, h * .3, 0).rotation.x = PI / 2; Cy(.15, .2, .25, '#6a4a2a', m * .7, .125, 0, 10); return true; }
            case 'm_chevre': { const bh = h * .6; Bx(w, .06, d * .45, col, 0, bh); [[-1, 1], [-1, -1]].forEach(([a, b]) => Rod([a * w * .4, bh, b * d * .1], [a * w * .48, 0, b * d * .45], .025, col)); Rod([w * .38, bh, 0], [w * .48, 0, 0], .03, col);
                Bx(w * .45, .06, d * .4, col, w * .1, bh + .1); rot(Bx(.06, h * .7, .06, col, w * .22, bh + .05, 0), 0, 0, -.2); Bx(.2, .08, d * .5, col, w * .28, h, 0); Bx(.06, .05, .06, '#3a3a3a', -w * .1, bh + .06, 0); Rod([w * .15, bh + .2, -d * .15], [w * .15, bh + .2, d * .15], .01, metal()); return true; }
            case 'm_wheelwip': { const R0 = Math.min(w * .48, h * .5), bh = .45, c2m = metal(col2 || '#3a3a3a'); [-1, 1].forEach(s => { Rod([s * w * .3, 0, -d * .4], [s * w * .3, bh, 0], .04, col); Rod([s * w * .3, 0, d * .4], [s * w * .3, bh, 0], .04, col); }); Bx(w * .7, .08, .1, col, 0, bh, 0);
                sub(() => { CyZ(.08, .3, col, 0, 0, 0, 14); const n = 12; for (let i = 0; i < n; i++) { const a = i * PI * 2 / n; if (i < 9) Rod([Math.cos(a) * .08, Math.sin(a) * .08, 0], [Math.cos(a) * (R0 - .05), Math.sin(a) * (R0 - .05), 0], .016, col, 6); }
                    To(R0 - .03, .035, col, 0, 0, 0, PI * 1.45, 28); To(R0, .012, c2m, 0, 0, 0, PI * 1.2, 28); }, 0, bh + R0 * .2, 0, -PI / 2 + .02); return true; }
            /* ── 👞 cordonnier ── */
            case 'm_shoebench': { const bh = h * .7; Bx(w, .05, d, col, 0, bh); legs4(bh, .06); Bx(w * .38, .05, d * .85, mat('#6a4a2a', 'tissu'), -w * .3, bh + .05); for (let i = 0; i < 4; i++) Bx(w * .12, .06, d * .3, '#9a7a5a', w * (.02 + i * .13), bh + .055, -d * .2);
                Bx(w * .55, .015, d * .4, '#c9a77a', w * .2, bh + .033, d * .2); Sp(.06, .03, .03, '#3a2418', w * .2, bh + .06, d * .2, 10); Rod([w * .38, bh + .03, d * .1], [w * .45, bh + .03, d * .25], .004, metal()); Cy(.03, .03, .05, '#3a3a3a', w * .1, bh + .05, d * .3, 8); return true; }
            case 'm_lastiron': { const c2m = col2 || '#7a5a3a', bh = h * .55; Cy(m * .45, m * .48, bh, wd(c2m), 0, bh / 2, 0, 14); const ir = metal(col, .45); Cy(.02, .025, h - bh - .08, ir, 0, bh + (h - bh - .08) / 2);
                Sp(.1, .025, .04, ir, .02, h - .05, 0, 12); Sp(.07, .025, .035, ir, -.03, h - .07, .06, 10); Sp(.06, .022, .03, ir, -.02, h - .06, -.07, 10); return true; }
            case 'm_shelf': { const load = L9.load || 'pots', n = Math.max(3, Math.round(h / .42)), th = .025; [-1, 1].forEach(s => Bx(.04, h, d, col, s * (w / 2 - .02), h / 2)); Bx(w, h, .015, sh(col, .8), 0, h / 2, -d / 2 + .0075);
                for (let i = 0; i <= n; i++) Bx(w - .08, th, d, col, 0, i === n ? h - th / 2 : .1 + i * (h - .1) / n);
                const t = ctex(T, 'mshelf|' + load, 512, 128, ART.shelf(load)), bh = (h - .1) / n - th - .02; for (let i = 0; i < n; i++) plane(w - .09, Math.max(.05, bh), t, 0, .1 + i * (h - .1) / n + th / 2 + Math.max(.05, bh) / 2 + .005, d * .1, 0, 0, {transparent: false}); return true; }
            /* ── 🧵 tailleur, couturière, repasseuse ── */
            case 'm_cuttable': { const th = .05; Bx(w, th, d, col, 0, h - th / 2); legs4(h - th, .07, col, .05, .05); Bx(w - .2, .02, d - .2, col, 0, .2); Bx(w * .55, .006, d * .75, mat(col2 || '#3a5a8a', 'tissu'), -w * .12, h + .003);
                CyX(.06, d * .8, mat(col2 || '#3a5a8a', 'tissu'), w * .32, h + .06, 0).rotation.y = PI / 2; Bx(1, .004, .03, '#e0c46a', 0, h + .008, d * .38); [-1, 1].forEach(s => rot(Bx(.16, .004, .012, metal('#c8ccd0', .25), w * .25 + s * .01, h + .01, -d * .25), 0, s * .25, 0)); Sp(.025, .008, .025, '#3a3a3a', -w * .4, h + .008, d * .3, 8); return true; }
            case 'm_treadle': { const ir = metal(col, .5), tb = h * .75, c2m = col2 || '#8a5a32'; [-1, 1].forEach(s => { Bx(.04, tb - .05, d * .7, ir, s * (w / 2 - .06), (tb - .05) / 2); To(.12, .01, ir, s * (w / 2 - .06), .35, 0).rotation.y = PI / 2; });
                Bx(w, .03, d, wd(c2m), 0, tb); const wh = To(.17, .015, ir, w / 2 - .12, .4, 0); wh.rotation.y = PI / 2; Bx(w * .55, .03, d * .45, ir, 0, .12, 0); rot(Bx(w * .5, .02, d * .35, ir, 0, .14, 0), .15, 0, 0);
                Bx(w * .5, .12, .1, mat(col, '', {metalness: .4, roughness: .35}), -w * .05, tb + .14, 0); Bx(.1, .2, .1, mat(col, '', {metalness: .4, roughness: .35}), w * .18, tb + .1, 0); Bx(.06, .12, .06, mat(col, '', {metalness: .4, roughness: .35}), -w * .28, tb + .07, 0); CyZ(.04, .03, '#c9a24a', w * .25, tb + .18, 0, 14); Cy(.012, .012, .03, '#f4f1ea', 0, tb + .23, 0, 8); return true; }
            case 'm_dressform': { const c2m = metal(col2 || '#3a3a3a'); for (let i = 0; i < 3; i++) { const a = i * 2.094; Rod([0, .1, 0], [Math.cos(a) * w * .45, .01, Math.sin(a) * d * .45], .012, c2m); } Rod([0, .1, 0], [0, h * .5, 0], .012, c2m);
                const tx = mat(col, 'tissu'); Cy(w * .3, w * .26, h * .14, tx, 0, h * .55); Sp(w * .3, h * .1, d * .38, tx, 0, h * .62, 0, 16); Sp(w * .27, h * .11, d * .36, tx, 0, h * .76, .01, 16); Cy(w * .14, w * .26, h * .07, tx, 0, h * .87); Cy(.03, .035, h * .06, c2m, 0, h * .93); Sp(.03, .02, .03, '#5a3b22', 0, h * .97, 0, 8); return true; }
            case 'm_coaliron': { const ir = metal(col, .55), s = new T.Shape([new T.Vector2(-w / 2, -d / 2), new T.Vector2(w * .2, -d / 2), new T.Vector2(w / 2, 0), new T.Vector2(w * .2, d / 2), new T.Vector2(-w / 2, d / 2)]), geo = new T.ExtrudeGeometry(s, {depth: h * .55, bevelEnabled: false}); geo.rotateX(PI / 2); geo.translate(0, h * .55, 0); add(new T.Mesh(geo, ir));
                Rod([-w * .35, h * .55, 0], [-w * .3, h * .95, 0], .006, ir); Rod([w * .15, h * .55, 0], [w * .1, h * .95, 0], .006, ir); CyX(.012, w * .5, '#2a2018', -w * .1, h * .95, 0); Bx(w * .3, .02, d * .8, glow('#ff7a2a', .8), -w * .05, h * .4, 0).scale.z = .9; return true; }
            case 'm_ironboard': { const th = .025; Bx(w, th, d, mat(col2 || '#e9e4da', 'tissu'), 0, h - th / 2); Sp(d / 2, th / 2, d / 2, mat(col2 || '#e9e4da', 'tissu'), w / 2 - .02, h - th / 2, 0, 12); [-1, 1].forEach(s => { Rod([-w * .35, 0, s * d * .4], [w * .25, h - th, s * d * .3], .015, col); Rod([w * .3, 0, s * d * .4], [-w * .3, h - th, s * d * .3], .015, col); }); return true; }
            /* ── 🧶 tisserand ── */
            case 'm_loom': { const wo = M_(col), pz = d / 2 - .05; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => Bx(.09, b < 0 ? h : h * .55, .09, wo, a * (w / 2 - .045), (b < 0 ? h : h * .55) / 2, b * pz));
                [-1, 1].forEach(a => { Bx(.07, .07, d, wo, a * (w / 2 - .045), h * .55, 0); Bx(.07, .07, d * .55, wo, a * (w / 2 - .045), h - .04, -pz + d * .27); });
                CyX(.07, w - .1, wo, 0, h * .4, -pz); CyX(.05, w - .1, wo, 0, h * .55, pz); CyX(.04, w - .1, wo, 0, .2, pz - .05); Bx(w - .2, .004, d * .8, mat('#e9e4da', 'tissu'), 0, h * .5, 0).rotation.x = .2; rot(Bx(w - .2, .004, d * .3, mat('#c9a77a', 'tissu'), 0, h * .58, -pz + .2), -.4, 0, 0);
                Bx(w - .1, .04, .04, wo, 0, h - .08, -.05); for (let i = 0; i < 2; i++) Bx(w - .25, h * .25, .02, mat('#d6cdb8', '', {transparent: true, opacity: .55}), 0, h * .62, -.05 + i * .05); Bx(w - .2, .12, .05, wo, 0, h * .66, .2);
                for (let i = 0; i < 4; i++) Bx(.06, .03, d * .4, wo, -w * .2 + i * w * .13, .1, d * .1); Bx(w * .55, .06, .3, wo, 0, h * .42, d / 2 + .25); [-1, 1].forEach(s => Bx(.06, h * .42, .3, wo, s * w * .25, h * .21, d / 2 + .25)); Sp(.18, .02, .03, '#8a5a32', w * .2, h * .5, .1, 8); return true; }
            case 'm_swift': { Bx(w * .5, .04, d * .5, col, 0, .02); Cy(.025, .03, h * .55, col, 0, h * .3); sub(() => { for (let i = 0; i < 6; i++) { const a = i * PI / 3; Rod([0, 0, 0], [Math.cos(a) * w * .45, .1, Math.sin(a) * d * .45], .006, col); Rod([0, .25, 0], [Math.cos(a) * w * .45, .1, Math.sin(a) * d * .45], .006, col); } To(Math.min(w, d) * .42, .02, mat('#e9e4da', 'tissu'), 0, .1, 0).rotation.x = PI / 2; }, 0, h * .6, 0); Cy(.01, .01, h * .4, col, 0, h * .8); return true; }
            case 'm_warper': { Bx(w * .3, .06, .06, col, 0, .03); Bx(.06, .06, d * .3, col, 0, .03); Cy(.03, .03, h, col, 0, h / 2); for (let i = 0; i < 8; i++) { const a = i * PI / 4, r = m * .45; Rod([Math.cos(a) * r, .15, Math.sin(a) * r], [Math.cos(a) * r, h - .1, Math.sin(a) * r], .015, col); Rod([0, .15, 0], [Math.cos(a) * r, .15, Math.sin(a) * r], .01, col); Rod([0, h - .1, 0], [Math.cos(a) * r, h - .1, Math.sin(a) * r], .01, col); }
                for (let j = 0; j < 6; j++) To(m * .45 + .01, .004, mat(['#c0392b', '#e9e4da', '#2a5db0'][j % 3]), 0, .4 + j * (h - .6) / 6, 0).rotation.x = PI / 2; return true; }
            /* ── 🏺 potier ── */
            case 'm_potwheel': { const wo = M_(col); Bx(w * .25, .45, d * .8, wo, -w * .37, .5); Bx(w * .25, .05, d * .9, wo, -w * .37, .48); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => Bx(.05, h, .05, wo, a * w * .45, h / 2, b * d * .42)); Bx(w * .9, .05, .05, wo, 0, h * .8, -d * .42); Bx(w * .9, .05, .05, wo, 0, h * .8, d * .42);
                Cy(m * .36, m * .36, .08, mat('#7a5a3a', 'bois'), w * .1, .1, 0, 28); Cy(.02, .02, h - .1, metal(), w * .1, h * .5); Cy(.15, .15, .03, wo, w * .1, h + .015); const cl = mat(col2 || '#b0603a', '', {roughness: .95}); Cy(.06, .08, .12, cl, w * .1, h + .09, 0, 18); Cy(.045, .06, .05, cl, w * .1, h + .175, 0, 18); Bx(w * .3, .05, d * .5, wo, w * .1, h * .8); return true; }
            case 'm_kiln': { const br = mat(col, 'brique'); Bx(w, h * .8, d, br, 0, h * .4); const vg = new T.CylinderGeometry(w / 2, w / 2, d, 20, 1, false, 0, PI); const vt = add(new T.Mesh(vg, br), 0, h * .8, 0); vt.rotation.z = PI / 2; vt.rotation.y = PI / 2; vt.scale.set(.4, 1, 1);
                Bx(w * .35, h * .4, .03, '#2a1a10', 0, h * .3, d / 2 + .005); Bx(w * .36, h * .1, .02, metal('#3a3a3a'), 0, h * .08, d / 2 + .02); Bx(w * .25, h * .35, d * .25, br, 0, h + h * .1, -d * .3); Sp(w * .08, h * .03, .02, glow('#ff7a2a', 1), 0, h * .2, d / 2 + .02, 8); return true; }
            /* ── 🥖 boulanger ── */
            case 'm_kneader': { const ir = metal(col2 || '#3a3a3a'); Bx(w * .25, h * .9, d * .5, ir, -w * .35, h * .45); Bx(w * .7, h * .5, d * .8, ir, w * .1, h * .25); Cy(m * .42, m * .36, h * .3, metal(col, .35), w * .12, h * .65, 0, 24, true); Cy(m * .38, m * .38, .02, '#efe2c4', w * .12, h * .62, 0, 24);
                Bx(w * .45, .1, .12, ir, -w * .1, h * .95); Rod([w * .05, h * .95, 0], [w * .12, h * .65, 0], .03, ir); CyZ(.1, .05, ir, -w * .35, h * .75, d * .27, 18); return true; }
            case 'm_breadoven': { const st = mat(col, 'pierre'), base = h * .45; Bx(w, base, d, st, 0, base / 2); const dome = add(new T.Mesh(new T.SphereGeometry(1, 24, 12, 0, PI * 2, 0, PI / 2), st), 0, base, -d * .05); dome.scale.set(w * .48, h - base, d * .46);
                Bx(w * .3, h * .2, .1, st, 0, base + h * .1, d / 2 - .02); Bx(w * .18, h * .14, .02, metal(col2 || '#2b2b2b'), 0, base + h * .08, d / 2 + .04); Bx(w * .22, .3, d * .2, st, -w * .3, h + .15, -d * .25); Bx(w * .6, base * .4, .04, '#2a1a10', 0, base * .3, d / 2 + .001); for (let i = 0; i < 5; i++) CyX(.04, w * .5, wd('#8a6a4a'), 0, .05 + i * .06, d / 2 - .1 - (i % 2) * .05); return true; }
            case 'm_peel': sub(() => { Rod([0, 0, 0], [0, h * .8, 0], .015, col); Bx(w, h * .2, .008, col, 0, h * .9, 0); }, 0, 0, d / 2 - .02, -.12); return true;
            /* ── 🥩 boucher ── */
            case 'm_hookbar': { const ir = metal(col, .3); [-1, 1].forEach(s => Bx(.06, h, .06, ir, s * (w / 2 - .03), h / 2, 0)); CyX(.02, w, ir, 0, h - .05, 0); const r = seeded(3);
                for (let i = 0; i < 6; i++) { const px = -w / 2 + w * (i + .5) / 6; To(.03, .004, ir, px, h - .09, 0, PI * 1.4, 10); if (r() < .7) Sp(.09, .18 + r() * .1, .07, mat(['#a0402a', '#c0604a', '#8a3a2a'][i % 3], '', {roughness: .6}), px, h - .35, 0, 12); } return true; }
            case 'm_stall': { Bx(w, h - .04, d, col, 0, (h - .04) / 2); Bx(w + .02, .04, d + .02, mat(col2 || '#e9e4da', 'marbre'), 0, h - .02); Cy(.25, .25, .25, wd('#9a6a3a'), w * .3, h + .125, 0, 18); Sp(.15, .05, .1, '#a0402a', -w * .2, h + .05, 0, 12); Sp(.1, .04, .08, '#c0604a', -w * .05, h + .04, .1, 10);
                for (let i = 0; i < 3; i++) Bx(.25, .004, .03, metal('#c8ccd0', .2), w * .1 + i * .05, h + .003, -d * .35); return true; }
            /* ── 🫙 épicier, apothicaire ── */
            case 'm_counter': { const front = d * .45, c2m = col2 || '#c9a24a'; Bx(w, h - .04, d - front, col, 0, (h - .04) / 2, -front / 2); Bx(w, h * .3, front, col, 0, h * .15, d / 2 - front / 2); Bx(w, .04, d, col, 0, h - .02);
                Bx(w - .04, h * .6, front - .03, glass, 0, h * .6, d / 2 - front / 2); const t = ctex(T, 'mshelf|' + (L9.top === 'apothic' ? 'apothic' : 'bocaux'), 512, 128, ART.shelf(L9.top === 'apothic' ? 'apothic' : 'bocaux')); plane(w - .08, h * .4, t, 0, h * .58, d / 2 - front * .8);
                if (L9.top !== 'apothic') { Bx(.35, .25, .3, '#2b2b2b', w * .35, h + .125, -d * .1); Bx(.3, .08, .02, '#f4f1ea', w * .35, h + .2, -d * .1 + .16); Bx(.08, .01, .2, metal(c2m), w * .35, h + .26, -d * .1); } else { for (let i = 0; i < 4; i++) Cy(.05, .05, .18, '#f4f1ea', -w * .3 + i * .15, h + .09, -d * .2, 14); }
                return true; }
            case 'm_roberval': { const br = metal(col, .3), post = !!L9.post, c2m = col2 || '#c9a24a'; Bx(w, h * .3, d * .5, post ? '#2b2b2b' : wd('#6a4026'), 0, h * .15); Bx(w * .1, h * .3, d * .2, br, 0, h * .45); [-1, 1].forEach(s => { Cy(.008, .008, h * .3, br, s * w * .3, h * .45); Cy(m * .45, m * .4, .015, metal(post ? c2m : col, .3), s * w * .3, h * .62, 0, 24); });
                Bx(w * .7, .02, .02, br, 0, h * .6); add(new T.Mesh(new T.ConeGeometry(.008, .05, 8), metal('#c0392b')), 0, h * .65, .015); for (let i = 0; i < 3; i++) Cy(.012 + i * .003, .012 + i * .003, .02 + i * .006, br, -w * .38 + i * .04, h * .32, d * .2, 10); return true; }
            case 'm_sacks': { const r = seeded(2); for (let i = 0; i < 3; i++) { const px = -w / 2 + w * (i + .5) / 3, c = ['#c9b38a', '#e9e4da', '#b8a070'][i], tx = mat(c, 'tissu'), hh = h * (.8 + r() * .2); Cy(w / 7, w / 6, hh * .8, tx, px, hh * .4, 0, 14); Sp(w / 7.5, hh * .18, w / 7.5, tx, px, hh * .82, 0, 12); Cy(w / 18, w / 12, hh * .12, tx, px, hh * .92, 0, 10); Cy(w / 7.6, w / 7.6, .01, i === 2 ? '#3a2418' : '#f4f1ea', px, hh * .8, 0, 14); } Cy(.12, .14, .3, wd('#8a6a4a'), w * .38, .15, d * .35, 14); return true; }
            case 'm_drawerwall': { Bx(w, h, d, col, 0, h / 2); Bx(w + .04, .05, d + .04, col, 0, h - .025); const cols = Math.max(4, Math.round(w / .2)), rows = Math.max(5, Math.round(h * .9 / .18)), c2m = col2 || '#e9e4da';
                for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const px = -w / 2 + w * (i + .5) / cols, py = .1 + (h - .2) * (j + .5) / rows; Bx(w / cols - .02, (h - .2) / rows - .02, .006, sh(col, 1.1), px, py, d / 2 + .003); if ((i + j) % 2 === 0) Bx(w / cols * .4, .02, .002, c2m, px, py + .02, d / 2 + .007); Sp(.008, .008, .008, '#c9a24a', px, py - .015, d / 2 + .01, 6); } return true; }
            case 'm_mortar': { Cy(m * .5, m * .38, h * .55, col, 0, h * .275, 0, 18); Cy(m * .4, m * .4, .01, sh(col, .6), 0, h * .55 - .005, 0, 18); Rod([0, h * .3, 0], [m * .35, h, -m * .2], .015, wd('#8a6a4a')); Sp(.025, .025, .025, wd('#8a6a4a'), m * .35, h, -m * .2, 8); return true; }
            /* ── ⏱ horloger ── */
            case 'm_watchbench': { const th = .04, top = h * .8; Bx(w, th, d, col, 0, top - th / 2); Bx(w * .35, top - th, d * .9, col, w * .32, (top - th) / 2); for (let i = 0; i < 4; i++) { Bx(w * .3, .005, .005, sh(col, .6), w * .32, (top - th) * (i + .5) / 4, d * .45 + .003); Sp(.008, .008, .008, '#c9a24a', w * .32, (top - th) * (i + .5) / 4, d * .45 + .01, 6); }
                [-1, 1].forEach(s => Bx(.05, top - th, .05, col, -w / 2 + .05, (top - th) / 2, s * (d / 2 - .05))); Bx(w, h - top + .02, .02, col, 0, top + (h - top) / 2, -d / 2 + .01); Bx(w * .5, .005, d * .5, '#e9e4da', -w * .15, top + .003);
                Rod([w * .3, top, -d * .3], [w * .3, top + .35, -d * .3], .008, metal(col2 || '#c9a24a')); Rod([w * .3, top + .35, -d * .3], [w * .1, top + .32, -d * .05], .008, metal(col2 || '#c9a24a')); To(.04, .008, metal(col2 || '#c9a24a'), w * .1, top + .3, -d * .05).rotation.x = PI / 2; Cy(.035, .035, .004, glass, w * .1, top + .3, -d * .05, 16);
                for (let i = 0; i < 4; i++) { Cy(.022, .022, .008, metal('#c9a24a', .25), -w * .3 + i * .07, top + .004, d * .15, 16); Cy(.018, .018, .002, '#f4ecd8', -w * .3 + i * .07, top + .009, d * .15, 16); } Bx(.15, .2, .1, '#4a2a16', -w * .35, top + .1, -d * .3); return true; }
            /* ── 🖨 imprimeur, relieur ── */
            case 'm_handpress': { const ir = metal(col, .45), c2m = col2 || '#7a5232'; [-1, 1].forEach(s => Bx(.12, h, .14, ir, s * w * .25, h / 2, -d * .25)); Bx(w * .62, .16, .16, ir, 0, h - .08, -d * .25); Bx(w * .62, .12, .18, ir, 0, h * .55, -d * .25);
                Cy(.04, .04, h * .3, ir, 0, h * .7, -d * .25); Bx(w * .4, .06, d * .35, ir, 0, h * .52, -d * .12); Rod([0, h * .78, -d * .25], [w * .5, h * .72, 0], .015, ir); Sp(.03, .03, .03, '#2a2a2a', w * .5, h * .72, 0, 8);
                Bx(w * .55, .1, d, wd(c2m), 0, h * .38); [-1, 1].forEach(s => { Bx(.08, h * .38, .08, wd(c2m), s * w * .25, h * .19, d * .42); Bx(.08, h * .38, .08, wd(c2m), s * w * .25, h * .19, -d * .42); }); Bx(w * .4, .02, d * .35, '#2a2a2a', 0, h * .44, d * .15); Bx(w * .38, .004, d * .3, '#f4f1ea', 0, h * .455, d * .15); rot(Bx(w * .4, .02, d * .35, wd(c2m), 0, h * .5, d * .45), -1.1, 0, 0); return true; }
            case 'm_typecase': { const top = h * .75; [-1, 1].forEach(s => { Bx(.05, top, .05, col, s * (w / 2 - .03), top / 2, d / 2 - .05); Bx(.05, h, .05, col, s * (w / 2 - .03), h / 2, -d / 2 + .05); }); for (let i = 0; i < 6; i++) Bx(w - .08, .04, d * .8, col, 0, .1 + i * .1, 0);
                const t = ctex(T, 'mtype', 256, 160, (g, W, H) => { g.fillStyle = '#9a6a3a'; g.fillRect(0, 0, W, H); g.strokeStyle = '#5a3b22'; g.lineWidth = 2; for (let i = 0; i <= 12; i++) { g.beginPath(); g.moveTo(W * i / 12, 0); g.lineTo(W * i / 12, H); g.stroke(); } for (let j = 0; j <= 7; j++) { g.beginPath(); g.moveTo(0, H * j / 7); g.lineTo(W, H * j / 7); g.stroke(); } const r = seeded(4); g.fillStyle = '#5a5a60'; for (let i = 0; i < 400; i++) g.fillRect(r() * W, r() * H, 2, 2); });
                sub(() => { Bx(w, .05, d * .85, col, 0, 0, 0); plane(w - .02, d * .83, t, 0, .026, 0, -PI / 2); }, 0, top + .1, 0, .35); return true; }
            case 'm_sewframe': { Bx(w, .03, d, col, 0, .015); [-1, 1].forEach(s => Cy(.015, .015, h, col, s * w * .42, h / 2, 0, 10)); CyX(.02, w * .9, col, 0, h - .03, 0); for (let i = 0; i < 5; i++) Rod([-w * .3 + i * w * .15, .03, 0], [-w * .3 + i * w * .15, h - .03, 0], .002, '#e9e4da', 4);
                for (let i = 0; i < 6; i++) Bx(w * .55, .008, d * .6, '#f4f1ea', 0, .035 + i * .009, d * .1); return true; }
            /* ── 📷 photographe ── */
            case 'm_camera': { const top = h * .7, c2m = col2 || '#1a1a1a'; [0, 1, 2].forEach(i => { const a = i * 2.094 + PI / 2; Rod([Math.cos(a) * w * .45, 0, Math.sin(a) * d * .45], [0, top, 0], .016, col); }); Bx(.25, .03, .25, col, 0, top);
                Bx(.22, .24, .06, col, 0, top + .14, -.12); const bl = new T.Mesh(new T.CylinderGeometry(.07, .11, .2, 4, 1), mat('#1a1a1a', 'tissu')); bl.rotation.x = PI / 2; bl.rotation.y = PI / 4; add(bl, 0, top + .14, 0); Bx(.14, .14, .03, col, 0, top + .14, .11); CyZ(.035, .06, metal('#c9a24a', .25), 0, top + .14, .15, 16);
                Bx(.3, .32, .02, mat(c2m, 'tissu'), 0, top + .1, -.2).rotation.x = .1; Bx(.3, .3, .02, mat(c2m, 'tissu'), 0, top - .05, -.25).rotation.x = .3; return true; }
            case 'm_backdrop': { const ir = metal('#3a3a3a'); [-1, 1].forEach(s => { Cy(.02, .02, h, ir, s * (w / 2 - .05), h / 2, -d / 2 + .1); Rod([s * (w / 2 - .05), 0, -d / 2 + .1], [s * (w / 2 - .05), 0, d / 2 - .05], .015, ir); Rod([s * (w / 2 - .25), 0, -d / 2 + .1], [s * (w / 2 + .1), 0, -d / 2 + .1], .015, ir); }); CyX(.03, w, ir, 0, h - .03, -d / 2 + .1);
                const cw = w * .94, ch = h * .9; plane(cw, ch, ctex(T, 'mart|decor', 256, Math.round(256 * clampR(ch / cw)), ART.decor), 0, h - .06 - ch / 2, -d / 2 + .12, 0, 0, {side: T.DoubleSide}); slot(cw, ch, 0, h - .06 - ch / 2, -d / 2 + .1205);
                rot(Bx(cw, .005, d * .5, mat('#5a5a52', 'tissu'), 0, .02, -d / 2 + .1 + d * .25), .05, 0, 0); return true; }
            case 'm_posechair': { const c2m = metal(col2 || '#3a3a3a'); Bx(w, .1, d * .9, mat(col, 'tissu'), 0, .45, .02); legs4(.42, .05, '#5a3b22'); Bx(w, .5, .08, mat(col, 'tissu'), 0, .72, -d / 2 + .06); [-1, 1].forEach(s => Bx(.08, .25, d * .85, '#5a3b22', s * (w / 2 - .04), .6, .02));
                Rod([0, 0, -d / 2 - .05], [0, h - .05, -d / 2 - .05], .012, c2m); Bx(.3, .02, .02, c2m, 0, .02, -d / 2 - .05); To(.08, .01, c2m, 0, h - .07, -d / 2 - .02, PI, 12).rotation.x = -PI / 2; return true; }
            /* ── 🏫 instituteur ── */
            case 'm_pupitre': { const top = h, c2m = metal(col2 || '#3a3a3a'), dz = -d * .18; rot(Bx(w, .03, d * .45, col, 0, top - .03, dz), .12, 0, 0); Bx(w, .15, d * .4, col, 0, top - .13, dz); [-1, 1].forEach(s => { Bx(.04, top - .1, d * .9, c2m, s * (w / 2 - .03), (top - .1) / 2, 0).scale.z = .1; Rod([s * (w / 2 - .03), 0, -d * .4], [s * (w / 2 - .03), top - .1, dz], .015, c2m); Rod([s * (w / 2 - .03), 0, d * .4], [s * (w / 2 - .03), .42, d * .3], .015, c2m); Rod([s * (w / 2 - .03), 0, -d * .4], [s * (w / 2 - .03), 0, d * .4], .012, c2m); });
                Bx(w, .03, d * .25, col, 0, .42, d * .3); Bx(w, .25, .02, col, 0, .62, d * .45); [-1, 1].forEach(s => { Cy(.015, .015, .02, '#f4f1ea', s * w * .25, top - .005, dz - d * .18, 10); Cy(.008, .008, .005, '#1a1a3a', s * w * .25, top + .006, dz - d * .18, 8); }); Bx(w * .5, .01, .02, '#3a3a3a', 0, top - .01, dz - d * .2); return true; }
            case 'm_blackboard': { const top = h * .98, bw = w * .86, bh = h * .42, by = h * .62; [-1, 1].forEach(s => { Rod([s * w * .45, 0, d / 2 - .05], [s * w * .38, top, .02], .02, col); Rod([s * w * .45, 0, -d / 2 + .05], [s * w * .38, top, -.02], .02, col); });
                Bx(bw + .06, bh + .06, .03, col, 0, by, .04); Bx(bw, bh, .005, mat(col2 || '#22332a', '', {roughness: .95}), 0, by, .057); plane(bw - .002, bh - .002, ctex(T, 'mart|board', 256, Math.round(256 * clampR(bh / bw)), ART.board), 0, by, .0602); slot(bw - .002, bh - .002, 0, by, .0606);
                Bx(bw * .8, .02, .05, col, 0, by - bh / 2 - .04, .06); Bx(.08, .015, .015, '#f4f1ea', bw * .2, by - bh / 2 - .025, .06); return true; }
            case 'm_wallmap': { const mh = h * .86; CyX(.012, w, '#2a2018', 0, h - .012, -d / 2 + .02); CyX(.014, w * 1.02, col, 0, h - .03, -d / 2 + .02); CyX(.014, w * 1.02, col, 0, h - .03 - mh - .02, -d / 2 + .02);
                plane(w * .96, mh, ctex(T, 'mart|carte', 256, Math.round(256 * clampR(mh / w)), ART.carte), 0, h - .04 - mh / 2, -d / 2 + .02); slot(w * .96, mh, 0, h - .04 - mh / 2, -d / 2 + .0205); Rod([0, h, -d / 2 + .015], [0, h + .12, -d / 2 + .01], .002, '#3a3a3a', 4); return true; }
            case 'm_abacus': { [-1, 1].forEach(s => Bx(.03, h, .03, col, s * (w / 2 - .015), h / 2, 0)); Bx(w, .03, d * .6, col, 0, .015); Bx(w, .025, .03, col, 0, h - .0125); Rod([-w / 2, 0, -d / 2 + .02], [-w / 2 + .01, h * .9, 0], .01, col); Rod([w / 2, 0, -d / 2 + .02], [w / 2 - .01, h * .9, 0], .01, col);
                for (let j = 0; j < 10; j++) { const py = .06 + j * (h - .1) / 10; CyX(.003, w - .03, metal('#8a8f96'), 0, py, 0, 6); for (let i = 0; i < 10; i++) Sp(.012, .012, .012, ['#c0392b', '#2a5db0', '#e0c46a', '#3a8a5a', '#f4f1ea'][Math.floor(i / 2) % 5], -w * .4 + i * .026 + (i >= 5 ? w * .3 : 0), py, 0, 8); } return true; }
            case 'm_estrade': { const ph = .25; Bx(w, ph, d, wd('#b8925a'), 0, ph / 2); Bx(.4, ph * .5, .3, wd('#b8925a'), 0, ph * .25, d / 2 + .15); const dw = w * .7, dd = d * .4, dh = h - ph; Bx(dw, dh, .03, col, 0, ph + dh / 2, -d / 2 + d * .15 + dd); Bx(dw, .04, dd, col, 0, ph + dh - .02, -d / 2 + d * .15 + dd / 2);
                [-1, 1].forEach(s => Bx(.04, dh - .04, dd, col, s * (dw / 2 - .02), ph + (dh - .04) / 2, -d / 2 + d * .15 + dd / 2)); Bx(.45, .5, .45, '#5a3b22', 0, ph + .25, -d / 2 + .3); Bx(.45, .5, .04, '#5a3b22', 0, ph + .7, -d / 2 + .1); Bx(.25, .03, .18, '#f4f1ea', -dw * .2, ph + dh + .015, -d / 2 + d * .15 + dd / 2); Cy(.02, .02, .2, '#7a5a3a', dw * .3, ph + dh + .01, -d / 2 + d * .15 + dd / 2, 8).rotation.z = PI / 2; return true; }
            /* ── 🩺 médecin, sage-femme ── */
            case 'm_examtable': { const c2m = metal(col2 || '#7a8a96'), top = h; legs4(top - .1, .04, c2m, .05, .05); Bx(w - .1, .03, d - .1, c2m, 0, .2); Bx(w * .68, .1, d, mat(col, 'tissu'), w * .16, top - .05); sub(() => Bx(w * .32, .1, d, mat(col, 'tissu'), -w * .16, 0, 0), -w * .18, top - .05, 0, 0, 0, -.35);
                Cy(.08, .08, .02, mat('#f4f1ea', 'tissu'), -w * .38, top + .15, 0, 12).rotation.z = PI / 2; Bx(w * .6, .004, d * .9, mat('#f4f1ea', 'tissu'), w * .16, top + .003); return true; }
            case 'm_docbag': { const c2m = metal(col2 || '#c9a24a', .3); Cy(d / 2, d / 2, w, col, 0, h * .5, 0, 18).rotation.z = PI / 2; Bx(w, h * .5, d, col, 0, h * .25); Bx(w * .9, .02, d * .9, sh(col, .7), 0, h * .5); To(.06, .008, '#2a1810', 0, h + .03, 0, PI, 12); Bx(.04, .03, .01, c2m, 0, h * .55, d / 2 + .005); return true; }
            case 'm_instrcab': { Bx(w, .5, d, col, 0, .25); Bx(w, h - .5, .02, col, 0, .5 + (h - .5) / 2, -d / 2 + .01); [-1, 1].forEach(s => Bx(.03, h - .5, d, col, s * (w / 2 - .015), .5 + (h - .5) / 2)); Bx(w, .03, d, col, 0, h - .015); Bx(w - .06, h - .55, .005, glass, 0, .5 + (h - .55) / 2, d / 2 - .01);
                for (let i = 0; i < 3; i++) { Bx(w - .06, .01, d - .04, glass, 0, .75 + i * .3); for (let j = 0; j < 4; j++) Rod([-w * .35 + j * .15, .76 + i * .3, 0], [-w * .3 + j * .15, .76 + i * .3, .05], .004, metal('#c8ccd0', .2)); } Cy(.04, .04, .12, '#7aa6c9', w * .25, .82, 0, 10); return true; }
            /* ── 💈 barbier ── */
            case 'm_barberchair': { const c2m = metal(col2 || '#c8ccd0', .25); Cy(.25, .3, .06, c2m, 0, .03); Cy(.07, .08, .35, c2m, 0, .2); Bx(w * .8, .14, d * .55, mat(col, 'cuir'), 0, .5, 0); Bx(w * .8, .55, .12, mat(col, 'cuir'), 0, .85, -d * .25); rot(Bx(w * .8, .55, .12, mat(col, 'cuir'), 0, .85, -d * .3), -.25, 0, 0);
                Bx(w * .3, .12, .1, mat(col, 'cuir'), 0, h - .05, -d * .38); [-1, 1].forEach(s => Bx(.08, .06, d * .5, c2m, s * w * .42, .7, 0)); Bx(w * .5, .03, .2, c2m, 0, .15, d * .4); Rod([0, .4, d * .2], [0, .15, d * .38], .015, c2m); return true; }
            case 'm_barbermirror': { Bx(w, h * .5, .03, col, 0, h * .7, -d / 2 + .015); Bx(w * .85, h * .42, .005, mat('#cfe0ee', '', {metalness: .6, roughness: .08}), 0, h * .7, -d / 2 + .033); Bx(w, .04, d, col, 0, h * .43); Bx(w * .3, h * .43, .04, col, 0, h * .215, -d / 2 + .02);
                Cy(.03, .025, .08, '#f4f1ea', -w * .3, h * .43 + .06, 0, 10); Sp(.02, .03, .02, '#c9b38a', -w * .3, h * .43 + .13, 0, 8); Bx(.12, .015, .02, metal('#c8ccd0', .2), w * .1, h * .43 + .03, .02); Cy(.035, .035, .15, '#7aa6c9', w * .3, h * .43 + .095, 0, 12); return true; }
            /* ── 🌾 meunier ── */
            case 'm_millstone': { const c2m = col2 || '#8a6a4a', st = mat(col, 'pierre'), cs = h * .45; Bx(w, cs, d, wd(c2m), 0, cs / 2); Cy(m * .45, m * .45, .3, st, 0, cs + .15, 0, 32); Cy(m * .47, m * .47, .25, wd(c2m), 0, cs + .125, 0, 32, true); Cy(m * .06, m * .06, .02, '#2a2a2a', 0, cs + .31, 0, 12);
                const k = new T.Group(), me = new T.Mesh(new T.CylinderGeometry(.7071 * .55, .7071 * .15, .4, 4, 1), wd(c2m)); me.rotation.y = PI / 4; k.add(me); k.position.set(0, h - .2, 0); tgt.add(k); [-1, 1].forEach(s => Bx(.06, h - cs - .3, .06, wd(c2m), s * .25, cs + .3 + (h - cs - .3) / 2, 0)); Bx(.3, .2, .25, wd(c2m), 0, cs * .4, d / 2 + .1); return true; }
            case 'm_bolter': { Bx(w, h * .6, d, col, 0, h * .3); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => Bx(.06, h, .06, col, a * (w / 2 - .03), h / 2, b * (d / 2 - .03))); const dr = Cy(d * .35, d * .35, w * .9, mat('#e9e4da', 'tissu'), 0, h * .78, 0, 12, true); dr.rotation.z = PI / 2 - .08;
                Bx(w, .04, d, col, 0, h - .02); Bx(.25, .15, .25, col, w * .4, h + .07); Cy(.08, .08, .05, '#3a3a3a', -w / 2 - .02, h * .78, 0, 14).rotation.z = PI / 2; return true; }
            /* ── 🍇 vigneron ── */
            case 'm_winepress': { const ir = metal(col2 || '#3a3a3a'), r0 = m * .38, bh = h * .4; Cy(m * .48, m * .48, .15, wd('#7a5a3a'), 0, .075, 0, 24); Bx(.25, .08, .3, wd('#7a5a3a'), m * .52, .04, 0);
                for (let i = 0; i < 20; i++) { const a = i * PI / 10; Bx(.05, bh, .03, col, Math.cos(a) * r0, .15 + bh / 2, Math.sin(a) * r0).rotation.y = -a; } [.25, .75].forEach(f => To(r0 + .02, .012, ir, 0, .15 + bh * f, 0).rotation.x = PI / 2);
                Cy(r0 * .95, r0 * .95, .06, col, 0, .15 + bh * .85); Cy(.05, .05, h - .25, ir, 0, (h + .25) / 2); Cy(.12, .12, .12, ir, 0, h * .78, 0, 6); Rod([-m * .45, h * .78, 0], [m * .45, h * .78, 0], .025, col); return true; }
            case 'm_vat': { const ir = metal(col2 || '#3a3a3a'); Cy(m / 2, m * .46, h, col, 0, h / 2, 0, 32, true); Cy(m * .46, m * .46, .02, col, 0, .01, 0, 32); [.12, .4, .7, .95].forEach(f => To(m / 2 - (1 - f) * m * .04 + .006, .012, ir, 0, h * f, 0, PI * 2, 32).rotation.x = PI / 2);
                Cy(m * .47, m * .47, .02, mat('#5a1a2a', '', {roughness: .3}), 0, h * .8, 0, 32); Bx(.5, h * .55, .08, wd('#8a6a4a'), 0, h * .275 + .05, m / 2 + .2).rotation.x = -.2; return true; }
            case 'm_hotte': { const tx = M_(col); Cy(w * .5, w * .32, h, tx, 0, h / 2, 0, 16, true); Cy(w * .32, w * .32, .02, tx, 0, .01, 0, 16); Cy(w * .5, w * .5, .02, sh(col, .75), 0, h - .01, 0, 16, true); [-1, 1].forEach(s => Rod([s * w * .2, h * .85, -d * .35], [s * w * .22, h * .2, -d * .38], .012, '#6a4a2a'));
                for (let i = 0; i < 12; i++) Sp(.03, .03, .03, '#4a1a3a', Math.cos(i) * w * .25, h - .02 + (i % 3) * .015, Math.sin(i) * d * .25, 6); return true; }
            /* ── 🐝 apiculteur ── */
            case 'm_hive': { const c2m = col2 || '#8a8f96', bh = .2; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => Bx(.05, bh, .05, '#6a4a2a', a * (w / 2 - .05), bh / 2, b * (d / 2 - .05))); Bx(w, .03, d, '#6a4a2a', 0, bh);
                const bodyH = h - bh - .1; Bx(w * .92, bodyH * .6, d * .92, col, 0, bh + .015 + bodyH * .3); Bx(w * .92, bodyH * .4, d * .92, sh(col, 1.08), 0, bh + .015 + bodyH * .8); Bx(w, .1, d, metal(c2m, .5), 0, h - .05); Bx(w * .4, .02, .04, '#2a2018', 0, bh + .03, d * .46);
                for (let i = 0; i < 5; i++) Sp(.006, .005, .009, '#2a2018', -.05 + i * .025, bh + .06 + (i % 2) * .02, d * .5, 6); return true; }
            case 'm_skep': { Bx(w, .05, d, '#6a4a2a', 0, .4); legs4(.38, .05, '#6a4a2a'); const sk = mat(col, 'osier'), H2 = h - .45; for (let i = 0; i < 7; i++) { const t = i / 7, r = m * .46 * Math.sqrt(1 - t * t * .85); To(Math.max(.02, r), .025, sk, 0, .47 + t * H2 * .85, 0, PI * 2, 20).rotation.x = PI / 2; }
                Sp(m * .44, H2 * .9, m * .44, sk, 0, .45, 0, 16).scale.y = H2 * .9; Bx(.06, .03, .03, '#2a2018', 0, .47, m * .45); return true; }
            case 'm_extractor': { const st = metal(col, .3), c2m = metal(col2 || '#3a3a3a'); [0, 1, 2].forEach(i => { const a = i * 2.094; Rod([Math.cos(a) * m * .45, 0, Math.sin(a) * m * .45], [Math.cos(a) * m * .38, h * .3, Math.sin(a) * m * .38], .015, c2m); });
                Cy(m * .42, m * .42, h * .65, st, 0, h * .3 + h * .325, 0, 24, true); Cy(m * .42, m * .42, .01, st, 0, h * .3, 0, 24); Bx(m * .1, .04, m * .9, c2m, 0, h * .97); Rod([0, h * .97, 0], [0, h + .03, 0], .01, c2m); Rod([0, h + .03, 0], [m * .25, h + .03, 0], .008, c2m); Cy(.012, .012, .06, '#2a2018', m * .25, h + .06, 0, 8);
                CyZ(.02, .08, c2m, 0, h * .34, m * .45, 10); Cy(.07, .06, .12, '#e0a020', 0, .06, m * .55, 12); return true; }
            /* ── 🧺 lavandière, dentellière ── */
            case 'm_washbox': { Bx(w, .03, d * .5, col, 0, .015, -d * .25); Bx(w, h * .6, .03, col, 0, h * .3, -d / 2 + .015); [-1, 1].forEach(s => { const s0 = new T.Shape([new T.Vector2(-d / 2, 0), new T.Vector2(0, 0), new T.Vector2(-d / 2, h * .6)]), geo = new T.ExtrudeGeometry(s0, {depth: .03, bevelEnabled: false}); geo.rotateY(PI / 2); add(new T.Mesh(geo, M_(col)), s * (w / 2 - .015) - .015, 0, 0); });
                Bx(w * .9, .1, d * .4, mat('#c9a77a', 'tissu'), 0, .08, -d * .25); rot(Bx(.4, .04, .12, wd('#a87b4d'), w * .1, h * .62, d * .2), .3, .4, 0); Rod([w * .1 - .15, h * .62, d * .2], [w * .1 - .3, h * .62, d * .25], .015, wd('#a87b4d')); Sp(.12, .05, .1, mat(col2 || '#f4f1ea', 'tissu'), -w * .25, .05, d * .25, 10); return true; }
            case 'm_lacepillow': { const c2m = col2 || '#8a5a32', top = h * .7; [-1, 1].forEach(s => { Rod([s * w * .4, 0, -d * .4], [s * w * .3, top, 0], .015, c2m); Rod([s * w * .4, 0, d * .4], [s * w * .3, top, 0], .015, c2m); }); Bx(w * .7, .03, d * .6, c2m, 0, top);
                const pl = Cy(m * .32, m * .32, w * .6, mat(col, 'tissu'), 0, top + m * .3, 0, 20); pl.rotation.z = PI / 2; Bx(w * .3, .004, m * .3, '#f4f1ea', 0, top + m * .6, m * .08).rotation.x = -.3;
                for (let i = 0; i < 12; i++) Rod([-w * .25 + i * w * .045, top + m * .5, m * .25], [-w * .25 + i * w * .045, top + m * .25, m * .4], .004, ['#c9a77a', '#8a5a32'][i % 2], 4); return true; }
            case 'm_violinwall': { Bx(w, .02, .01, '#6a4026', 0, h - .02, -d / 2 + .005); for (let i = 0; i < 4; i++) { const px = -w / 2 + w * (i + .5) / 4, c = ['#8a4a22', '#a8642a', '#7a3a1a', '#c9a77a'][i]; sub(() => { Sp(.1, .1, .012, c, 0, .12, 0, 14); Sp(.08, .09, .012, c, 0, .3, 0, 14); Bx(.03, .25, .015, '#1a1a1a', 0, .5, .012); Sp(.02, .03, .018, c, 0, .64, 0, 8); Bx(.035, .015, .015, '#1a1a1a', 0, .02, .01); }, px, h - .72, -d / 2 + .03); Rod([px, h - .06, -d / 2 + .02], [px, h - .02, -d / 2 + .01], .003, metal(), 4); } return true; }
            /* ── 📜 notaire, mairie ── */
            case 'm_notarydesk': { const c2m = col2 || '#2a4a3a', th = .04; Bx(w, th, d, col, 0, h - th / 2); Bx(w - .1, .006, d - .1, mat(c2m, 'cuir'), 0, h + .003); Bx(w - .06, .12, d - .06, col, 0, h - th - .06); legs4(h - th - .12, .06, col, .03, .03);
                for (let i = 0; i < 3; i++) Bx(.22, .003, .3, '#f4f1ea', -w * .2 + i * .04, h + .008 + i * .002, -d * .05).rotation.y = (i - 1) * .08; Cy(.03, .035, .05, '#2a2018', w * .3, h + .03, -d * .25, 10); Rod([w * .3, h + .05, -d * .25], [w * .33, h + .15, -d * .27], .003, '#f4f1ea', 4); Bx(.3, .06, .22, '#5a2a2a', w * .2, h + .03, d * .15); return true; }
            case 'm_cartonnier': { Bx(w, h, d, col, 0, h / 2); const rows = 5, cols = 2, c2m = col2 || '#3a5a3a'; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const px = -w / 2 + w * (i + .5) / cols, py = .08 + (h - .14) * (j + .5) / rows; Bx(w / cols - .03, (h - .14) / rows - .02, .01, mat(c2m, 'cuir'), px, py, d / 2 + .005); Bx(.08, .03, .004, '#f4f1ea', px, py + .03, d / 2 + .012); Sp(.01, .01, .006, '#c9a24a', px, py - .03, d / 2 + .013, 6); } Bx(w + .02, .04, d + .02, col, 0, h - .02); return true; }
            case 'm_marianne': { const c2m = col2 || '#6a4026', ph = h * .62; Bx(w * .9, ph, d * .9, wd(c2m), 0, ph / 2); Bx(w, .04, d, wd(c2m), 0, ph + .02); const pl = mat(col, '', {roughness: .7}), r = h - ph - .04;
                Cy(w * .3, w * .38, r * .3, pl, 0, ph + .04 + r * .15); Cy(.04, .05, r * .15, pl, 0, ph + .04 + r * .35); Sp(.07, .09, .08, pl, 0, ph + .04 + r * .6, 0, 14); Sp(.075, .05, .085, mat('#c0392b'), 0, ph + .04 + r * .78, -.01, 12); Sp(.04, .02, .04, mat('#c0392b'), 0, ph + .04 + r * .86, -.04, 8); return true; }
            /* ── ✉ poste ── */
            case 'm_postcounter': { const top = 1, c2m = metal(col2 || '#c9a24a', .3); Bx(w, top, d, col, 0, top / 2); Bx(w + .04, .04, d + .04, col, 0, top + .02); const gh = h - top - .04, n = Math.max(2, Math.round(w / .9));
                for (let i = 0; i <= n; i++) Bx(.04, gh, .04, col, -w / 2 + .02 + (w - .04) * i / n, top + .04 + gh / 2, -d * .1); Bx(w, .05, .06, col, 0, h - .025, -d * .1);
                for (let i = 0; i < n; i++) { const px = -w / 2 + w * (i + .5) / n; for (let k = 0; k < 9; k++) Rod([px - w / n * .4 + k * w / n * .1, top + .2, -d * .1], [px - w / n * .4 + k * w / n * .1, h - .05, -d * .1], .003, c2m, 4); Bx(w / n * .5, .15, .02, glass, px, top + .12, -d * .1); Bx(.2, .005, .15, '#f4f1ea', px, top + .045, d * .1); } return true; }
            case 'm_sortrack': { Bx(w, h, d, col, 0, h / 2); const cols = Math.max(5, Math.round(w / .15)), rows = Math.max(6, Math.round(h / .2)); const t = ctex(T, 'msort', 256, 256, (g, W, H) => { g.fillStyle = '#3a2418'; g.fillRect(0, 0, W, H); const r = seeded(8); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = '#6a4026'; g.fillRect(i * W / 8, j * H / 8, W / 8, 2); g.fillRect(i * W / 8, j * H / 8, 2, H / 8); if (r() < .6) { g.fillStyle = ['#f4f1ea', '#e9dcb8', '#d6e4ee'][(r() * 3) | 0]; g.fillRect(i * W / 8 + 5, j * H / 8 + H / 16, W / 8 - 10, H / 16 - 2); } } });
                t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(cols / 8, rows / 8); plane(w - .04, h - .1, t, 0, h / 2 + .03, d / 2 + .002); Bx(w, .04, d + .1, col, 0, .5, .05); return true; }
            /* ── ⛏ mineur ── */
            case 'm_minelamp': { const br = metal(col, .3); Cy(m * .5, m * .45, h * .35, br, 0, h * .175, 0, 16); Cy(m * .35, m * .35, h * .35, glass, 0, h * .525, 0, 14); Sp(.008, .015, .008, glow('#ffd27a', 2), 0, h * .5, 0, 6); for (let i = 0; i < 4; i++) Rod([Math.cos(i * PI / 2) * m * .36, h * .35, Math.sin(i * PI / 2) * m * .36], [Math.cos(i * PI / 2) * m * .36, h * .7, Math.sin(i * PI / 2) * m * .36], .003, br, 4);
                Cy(m * .3, m * .4, h * .15, br, 0, h * .77, 0, 14); To(.03, .004, br, 0, h * .95, 0, PI, 10); return true; }
            case 'm_minecart': { const ir = metal(col, .55), c2m = metal(col2 || '#2b2b2b', .6); [-1, 1].forEach(s => Bx(w + .3, .04, .05, c2m, 0, .02, s * d * .3)); for (let i = 0; i < 5; i++) Bx(.12, .04, d, wd('#5a3b22'), -w / 2 - .1 + i * (w + .2) / 4, .01, 0);
                [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => CyZ(.14, .05, c2m, a * w * .3, .18, b * d * .3, 16)); const k = new T.Group(), me = new T.Mesh(new T.CylinderGeometry(.7071 * 1, .7071 * .8, h - .25, 4, 1, true), mat(col, '', {side: T.DoubleSide, metalness: .5, roughness: .55})); me.rotation.y = PI / 4; k.add(me); k.scale.set(w, 1, d * .9); k.position.set(0, .25 + (h - .25) / 2, 0); tgt.add(k);
                Bx(w * .8, .02, d * .7, ir, 0, .26); Sp(w * .38, .12, d * .32, mat('#1a1a1a', '', {roughness: .9}), 0, h - .05, 0, 12); return true; }
            /* ── 🎣 pêcheur, marin, garde champêtre ── */
            case 'm_nets': { [-1, 1].forEach(s => { Cy(.04, .04, h, wd('#6a4a2a'), s * (w / 2 - .04), h / 2, 0, 10); }); CyX(.025, w, wd('#6a4a2a'), 0, h - .05, 0); const t = ctex(T, 'mnet', 128, 128, (g, W, H) => { g.clearRect(0, 0, W, H); g.strokeStyle = '#6a5a3a'; g.lineWidth = 2; for (let i = -8; i < 16; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + H, H); g.stroke(); g.beginPath(); g.moveTo(i * 16 + H, 0); g.lineTo(i * 16, H); g.stroke(); } });
                t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(w * 3, h * 3); const net = plane(w - .1, h - .15, t, 0, (h - .1) / 2 + .02, 0, 0, 0, {transparent: true, alphaTest: .3, side: T.DoubleSide}); net.material.color?.set?.(col);
                for (let i = 0; i < 7; i++) Sp(.04, .03, .03, mat(col2 || '#c0392b'), -w * .42 + i * w * .14, h * .35 + (i % 2) * .1, .01, 8); Sp(.15, .08, .1, mat(col, 'tissu'), w * .3, .08, d * .1, 10); return true; }
            case 'm_lobsterpot': { Bx(w, .03, d, col, 0, .015); for (let i = 0; i < 5; i++) { const a = PI * i / 4; Rod([-w / 2 + .02, .03 + Math.sin(a) * (h - .04), Math.cos(a) * d * .45], [w / 2 - .02, .03 + Math.sin(a) * (h - .04), Math.cos(a) * d * .45], .006, col, 4); }
                [-1, 0, 1].forEach(s => To(Math.min(d * .45, h - .03), .008, col, s * w * .45, .03, 0, PI, 14).rotation.y = PI / 2); To(m * .15, .01, mat('#8a7a5a', 'tissu'), 0, h * .7, 0).rotation.x = PI / 2; return true; }
            case 'm_seachest': { const c2m = col2 || '#c9a77a'; const s0 = new T.Shape([new T.Vector2(-d / 2, 0), new T.Vector2(d / 2, 0), new T.Vector2(d / 2 - .05, h * .85), new T.Vector2(-d / 2 + .05, h * .85)]), geo = new T.ExtrudeGeometry(s0, {depth: w, bevelEnabled: false}); geo.rotateY(PI / 2); geo.translate(-w / 2, 0, 0); add(new T.Mesh(geo, M_(col)));
                Bx(w + .02, h * .15, d - .08, col, 0, h * .925); [-1, 1].forEach(s => { To(.05, .012, mat(c2m, 'tissu'), s * (w / 2 + .03), h * .55, 0, PI * 2, 14).rotation.y = PI / 2; Bx(.03, h * .85, .02, '#3a3a3a', s * w * .3, h * .425, d / 2 - .02); }); Bx(.06, .06, .02, metal('#c9a24a'), 0, h * .8, d / 2 - .02); return true; }
            case 'm_helm': { const c2m = metal(col2 || '#c9a24a', .3), ph = h * .55; Bx(.25, ph, .25, wd('#6a4a2a'), 0, ph / 2, -d * .1); Bx(.35, .05, .35, wd('#6a4a2a'), 0, ph, -d * .1); const R0 = Math.min(w * .45, h - ph - .05);
                sub(() => { To(R0 * .8, .025, col, 0, 0, 0, PI * 2, 32); To(R0 * .25, .02, col, 0, 0, 0, PI * 2, 16); CyZ(.06, .1, c2m, 0, 0, 0, 14); for (let i = 0; i < 8; i++) { const a = i * PI / 4; Rod([Math.cos(a) * .06, Math.sin(a) * .06, 0], [Math.cos(a) * R0, Math.sin(a) * R0, 0], .015, col, 6); Sp(.022, .022, .022, col, Math.cos(a) * R0, Math.sin(a) * R0, 0, 8); } }, 0, ph + R0 * .1 + .03, d * .15); return true; }
            case 'm_drum': { const c2m = col2 || '#c0392b', top = h * .4; [0, 1, 2].forEach(i => { const a = i * 2.094; Rod([Math.cos(a) * m * .4, 0, Math.sin(a) * m * .4], [0, top, 0], .008, '#3a3a3a', 6); }); const dh = h - top - .05;
                Cy(m * .45, m * .45, dh, col, 0, top + dh / 2, 0, 24); Cy(m * .46, m * .46, .03, c2m, 0, top + .015, 0, 24); Cy(m * .46, m * .46, .03, c2m, 0, top + dh - .015, 0, 24); Cy(m * .44, m * .44, .004, '#f4f1ea', 0, top + dh + .002, 0, 24);
                for (let i = 0; i < 8; i++) { const a = i * PI / 4; Rod([Math.cos(a) * m * .455, top + .03, Math.sin(a) * m * .455], [Math.cos(a + .4) * m * .455, top + dh - .03, Math.sin(a + .4) * m * .455], .003, '#f4f1ea', 4); } [-1, 1].forEach(s => Rod([s * .05, top + dh + .01, -.05], [s * .12, top + dh + .03, .25], .008, '#c9a77a', 6)); return true; }
            /* ── 🖼 décoration : affiches, diplôme, photos ── */
            case 'm_poster': { const dd = Math.max(.015, d), fw = Math.min(.03, w * .06), art = L9.mat ? 'diplome' : 'affiche'; Bx(w, fw, dd, col, 0, h - fw / 2); Bx(w, fw, dd, col, 0, fw / 2); Bx(fw, h, dd, col, -w / 2 + fw / 2, h / 2); Bx(fw, h, dd, col, w / 2 - fw / 2, h / 2); Bx(w - 2 * fw, h - 2 * fw, .004, '#f4f1ea', 0, h / 2, -dd / 2 + .004);
                plane(w - 2 * fw, h - 2 * fw, ctex(T, 'mart|' + art, 256, Math.round(256 * clampR((h - 2 * fw) / (w - 2 * fw))), ART[art]), 0, h / 2, -dd / 2 + .0065); slot(w - 2 * fw, h - 2 * fw, 0, h / 2, -dd / 2 + .007); Bx(w - 2 * fw, h - 2 * fw, .002, glass, 0, h / 2, dd / 2 - .003); return true; }
            case 'm_posterpin': { plane(w, h, ctex(T, 'mart|affiche', 256, Math.round(256 * clampR(h / w)), ART.affiche), 0, h / 2, -d / 2 + .002); slot(w, h, 0, h / 2, -d / 2 + .0025); [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([a, b]) => Sp(.006, .006, .004, '#c0392b', a * (w / 2 - .015), h / 2 + b * (h / 2 - .015), -d / 2 + .005, 6)); return true; }
            case 'm_photostand': { sub(() => { Bx(w, h, .012, metal(col, .4), 0, h / 2, 0); Bx(w * .82, h * .82, .002, '#f4f1ea', 0, h / 2, .0065); plane(w * .82, h * .82, ctex(T, 'mart|portrait', 128, Math.round(128 * clampR(h / w)), ART.portrait), 0, h / 2, .0078); slot(w * .82, h * .82, 0, h / 2, .0082); }, 0, 0, d * .15, -.15); Rod([0, h * .55, -d * .05], [0, 0, -d / 2], .005, col); return true; }
            case 'm_photoeasel': { const c2m = col2 || '#c9a24a', [cw, ch] = cvSize(it, shape).map(v => v / 100), y0 = h * .42; [-1, 1].forEach(s => Rod([s * w * .45, 0, d / 2 - .05], [s * .05, h, .02], .018, col)); Rod([0, 0, -d / 2 + .05], [0, h * .95, -.02], .016, col); Bx(w * .9, .03, .06, col, 0, y0, .14);
                sub(() => { const fw = .05; Bx(cw + 2 * fw, fw, .04, metal(c2m, .35), 0, ch + fw * 1.5, 0); Bx(cw + 2 * fw, fw, .04, metal(c2m, .35), 0, fw / 2, 0); Bx(fw, ch + 2 * fw, .04, metal(c2m, .35), -cw / 2 - fw / 2, ch / 2 + fw, 0); Bx(fw, ch + 2 * fw, .04, metal(c2m, .35), cw / 2 + fw / 2, ch / 2 + fw, 0);
                    Bx(cw, ch, .01, '#f4f1ea', 0, ch / 2 + fw, -.01); plane(cw, ch, ctex(T, 'mart|portrait', 256, Math.round(256 * clampR(ch / cw)), ART.portrait), 0, ch / 2 + fw, -.0045); slot(cw, ch, 0, ch / 2 + fw, -.004); }, 0, y0 + .02, .16, -.08); return true; }
            default: return false;
        }
    }
    function clampR(v, a = .4, b = 2.5) { return Math.max(a, Math.min(b, Number.isFinite(v) ? v : 1)); }
    const prevF = ext.houseFurnitureX;
    ext.houseFurnitureX = (shape, x) => (typeof shape === 'string' && shape.startsWith('m_') && f3(shape, x)) || (prevF ? prevF(shape, x) : false);
})();
