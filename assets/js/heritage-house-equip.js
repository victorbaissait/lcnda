/* LCNDA — 🏠 Plan de maison : beaucoup plus d'objets dans « Électroménager », « Bureau », « Garage » et « Luminaires »
 * (complète heritage-house-lib.js, heritage-house-more.js, heritage-house-metiers.js et heritage-house-cultes.js) :
 *  - le gros et le petit électroménager (lavage, cuisson, préparation, image et son, chauffage, air) ;
 *  - le bureau (sièges, rangements, imprimante, écrans, globe, coffre-fort, machine à écrire…) ;
 *  - le garage (voitures d'hier et d'aujourd'hui, vélos, outillage, rangements) ;
 *  - les luminaires (plafonniers, lustres, réglettes, lampadaires vasques, lampes d'autrefois…) ;
 *  - chaque objet : vraies dimensions (cm), mots-clés (kw), un dessin vu de dessus et une forme 3D ;
 *    la couleur principale (et sa matière) et la 2e couleur (color2) restent modifiables.
 * Beaucoup d'objets reprennent les formes déjà dessinées (x… de heritage-house-more.js, et celles de heritage-house-lib.js) ;
 * les nouvelles formes de ce fichier commencent toutes par « q_ ».
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const O = (kw, o = {}) => ({kw, ...o}), OLD = (kw, o = {}) => ({kw, old: 1, ...o});

    /* ═════════ Le catalogue : [clé, nom, largeur, profondeur, hauteur (cm), couleur, forme, options] ═════════ */
    const ROWS = {
        'Électroménager': [
            // lavage
            ['e_washer', 'Lave-linge à hublot', 60, 60, 85, '#f4f4f4', 'q_porthole', O('machine à laver lave-linge lessive linge hublot', {color2: '#8a8f96'})],
            ['e_dryer', 'Sèche-linge', 60, 60, 85, '#f4f4f4', 'q_porthole', O('sèche-linge séchoir linge', {color2: '#2b2b2b'})],
            ['e_washertop', 'Lave-linge à ouverture par le dessus', 40, 60, 90, '#f4f4f4', 'q_dish', O('machine à laver top lessive linge', {color2: '#8a8f96'})],
            ['e_dishwasher', 'Lave-vaisselle', 60, 60, 85, '#c8ccd0', 'q_dish', O('lave-vaisselle vaisselle cuisine', {color2: '#2b2b2b'})],
            ['e_dishsmall', 'Lave-vaisselle compact (à poser)', 55, 50, 45, '#f4f4f4', 'q_dish', O('lave-vaisselle petit compact vaisselle', {elev: 90, color2: '#2b2b2b'})],
            // cuisson
            ['e_micro', 'Four à micro-ondes', 50, 40, 30, '#2b2b2b', 'q_micro', O('micro-ondes réchauffer cuisine', {elev: 90, color2: '#c8ccd0'})],
            ['e_minioven', 'Mini-four', 45, 38, 28, '#c8ccd0', 'q_micro', O('mini four grill cuisine', {elev: 90, color2: '#2b2b2b'})],
            ['e_ovenunder', 'Four encastrable sous le plan', 60, 55, 60, '#2b2b2b', 'q_micro', O('four encastré cuisine pâtisserie rôti', {color2: '#c8ccd0', one: 1})],
            ['e_induction', 'Plaque à induction', 60, 52, 6, '#1a1a1a', 'q_hob', O('plaque induction cuisson vitrocéramique', {elev: 90, color2: '#8a8f96'})],
            ['e_gashob', 'Table de cuisson au gaz (4 feux)', 60, 52, 8, '#c8ccd0', 'q_hob', O('gazinière plaque gaz feux brûleurs', {elev: 90, color2: '#2b2b2b'})],
            ['e_plancha', 'Plancha électrique', 50, 35, 10, '#2b2b2b', 'q_hob', O('plancha grill cuisson', {elev: 90, color2: '#8a8f96', one: 1})],
            ['e_raclette', 'Appareil à raclette', 40, 30, 15, '#2b2b2b', 'q_hob', O('raclette fromage hiver repas', {elev: 76, color2: '#c0392b', one: 1})],
            ['e_hoodwall', 'Hotte aspirante murale', 90, 50, 80, '#c8ccd0', 'q_hood', O('hotte aspirante cuisine fumée', {elev: 150})],
            ['e_hoodisland', 'Hotte îlot (suspendue)', 90, 60, 80, '#2b2b2b', 'q_hood', O('hotte îlot cuisine suspendue', {elev: 160, island: 1})],
            ['e_ricecooker', 'Cuiseur à riz', 28, 28, 25, '#f4f4f4', 'q_pot', O('cuiseur riz cuisine asiatique', {elev: 90, color2: '#2b2b2b'})],
            ['e_slowcooker', 'Mijoteuse', 35, 25, 25, '#c0392b', 'q_pot', O('mijoteuse cocotte électrique', {elev: 90, color2: '#2b2b2b'})],
            ['e_pressure', 'Autocuiseur (cocotte-minute)', 35, 25, 30, '#c8ccd0', 'q_pot', O('cocotte minute autocuiseur sifflet', {elev: 90, color2: '#2b2b2b'})],
            ['e_fryer', 'Friteuse', 35, 30, 30, '#f4f4f4', 'q_pot', O('friteuse frites', {elev: 90, color2: '#8a8f96'})],
            ['e_airfryer', 'Friteuse sans huile', 30, 35, 32, '#2b2b2b', 'q_pot', O('friteuse air', {elev: 90, color2: '#8a8f96'})],
            ['e_breadmaker', 'Machine à pain', 30, 38, 32, '#f4f4f4', 'q_micro', O('machine à pain boulangerie', {elev: 90, color2: '#8a8f96', one: 1})],
            ['e_waffle', 'Gaufrier', 30, 25, 12, '#2b2b2b', 'q_hob', O('gaufres gaufrier crêpes', {elev: 90, color2: '#c8ccd0', one: 1})],
            // préparation
            ['e_blender', 'Blender', 18, 18, 40, '#2b2b2b', 'q_jar', O('blender mixeur smoothie soupe', {elev: 90, color2: '#bfe0f0'})],
            ['e_juicer', 'Centrifugeuse (presse-fruits)', 22, 30, 40, '#f4f4f4', 'q_jar', O('centrifugeuse jus fruits', {elev: 90, color2: '#e0a040'})],
            ['e_foodpro', 'Robot multifonction', 25, 25, 38, '#c8ccd0', 'q_jar', O('robot cuisine hachoir râpe', {elev: 90, color2: '#e9f2f8'})],
            ['e_filtercoffee', 'Cafetière à filtre', 25, 20, 35, '#2b2b2b', 'xcoffee', O('café cafetière filtre', {elev: 90})],
            ['e_capsule', 'Machine à café à capsules', 15, 35, 28, '#c0392b', 'xcoffee', O('café capsules dosettes', {elev: 90})],
            ['e_kettleold', 'Bouilloire émaillée', 22, 18, 22, '#e07a3a', 'xkettle', OLD('bouilloire émail eau chaude', {elev: 90})],
            // froid
            ['e_fridgeus', 'Réfrigérateur américain', 90, 75, 180, '#c8ccd0', 'xfridge2', O('frigo américain deux portes réfrigérateur inox')],
            ['e_minifridge', 'Mini-réfrigérateur', 48, 45, 85, '#f4f4f4', 'xfridge2', O('petit frigo bar chambre étudiant', {one: 1})],
            ['e_chestfreezer', 'Congélateur coffre', 100, 65, 85, '#f4f4f4', 'chest', O('congélateur coffre surgelés bahut')],
            // image et son
            ['e_tvflat', 'Téléviseur écran plat sur pied', 125, 25, 80, '#1a1a1a', 'q_flat', O('télé télévision écran plat', {elev: 50})],
            ['e_tvwall', 'Grand téléviseur au mur', 165, 6, 95, '#1a1a1a', 'q_flat', O('télé télévision écran mur', {elev: 110, wall: 1})],
            ['e_screen', 'Écran de projection', 200, 5, 130, '#f4f4f4', 'q_flat', O('écran projection cinéma vidéoprojecteur', {elev: 120, wall: 1, color2: '#2b2b2b'})],
            ['e_projector', 'Vidéoprojecteur', 32, 25, 12, '#f4f4f4', 'q_micro', O('vidéoprojecteur cinéma film', {elev: 75, color2: '#2b2b2b', lens: 1})],
            ['e_soundbar', 'Barre de son', 90, 10, 7, '#2b2b2b', 'q_bar', O('son barre enceinte télé', {elev: 50})],
            ['e_vcr', 'Magnétoscope (VHS)', 43, 30, 10, '#2b2b2b', 'q_bar', OLD('magnétoscope cassette vhs années 80', {elev: 50})],
            ['e_dvd', 'Lecteur DVD / Blu-ray', 43, 25, 6, '#2b2b2b', 'q_bar', O('dvd blu-ray lecteur film', {elev: 50})],
            ['e_box', 'Box internet', 25, 18, 5, '#f4f4f4', 'q_bar', O('box internet wifi routeur', {elev: 75})],
            ['e_tsf', 'Poste de radio TSF', 50, 25, 40, '#7a4f2a', 'q_tsf', OLD('radio tsf poste lampes années 30', {elev: 75, color2: '#c9b38a'})],
            ['e_transistor', 'Transistor', 25, 8, 15, '#c0392b', 'q_tsf', OLD('radio transistor années 60', {elev: 75, color2: '#e9e4da'})],
            ['e_phonefix', 'Téléphone sans fil et sa base', 15, 15, 20, '#2b2b2b', 'xphone', O('téléphone fixe sans fil', {elev: 75})],
            // entretien, chauffage, air
            ['e_vacsled', 'Aspirateur traîneau', 30, 45, 30, '#c0392b', 'xvacuum', O('aspirateur traîneau ménage poussière')],
            ['e_steam', 'Nettoyeur vapeur (balai)', 30, 25, 120, '#2a6a9a', 'xstickvac', O('vapeur balai nettoyeur sol')],
            ['e_ironstation', 'Centrale vapeur', 40, 25, 25, '#f4f4f4', 'iron', O('repassage fer centrale vapeur', {elev: 90})],
            ['e_dehum', 'Déshumidificateur', 35, 25, 55, '#f4f4f4', 'q_tower', O('déshumidificateur humidité air')],
            ['e_purifier', 'Purificateur d’air', 30, 30, 60, '#f4f4f4', 'q_tower', O('purificateur air filtre')],
            ['e_towerfan', 'Ventilateur colonne', 30, 30, 105, '#2b2b2b', 'q_tower', O('ventilateur colonne été air')],
            ['e_waterheater', 'Chauffe-eau (ballon d’eau chaude)', 55, 55, 150, '#f4f4f4', 'q_tank', O('ballon eau chaude cumulus chauffe-eau', {elev: 60})],
            ['e_boiler', 'Chaudière murale', 45, 35, 75, '#f4f4f4', 'q_dish', O('chaudière gaz chauffage murale', {elev: 120, color2: '#2b2b2b'})],
            ['e_radiatorel', 'Radiateur électrique mural', 80, 10, 55, '#f4f4f4', 'q_bar', O('radiateur convecteur chauffage électrique', {elev: 15})],
            ['e_sewing', 'Machine à coudre électrique', 42, 20, 30, '#f4f4f4', 'q_micro', O('couture machine à coudre', {elev: 75, color2: '#c0392b', one: 1})]],
        'Bureau': [
            ['e_ochair', 'Fauteuil de bureau à roulettes', 65, 65, 110, '#2b2b2b', 'q_ochair', O('chaise fauteuil bureau roulettes ordinateur')],
            ['e_ergochair', 'Siège ergonomique (dossier filet)', 68, 68, 120, '#3a3a3a', 'q_ochair', O('chaise ergonomique bureau filet', {color2: '#8a8f96'})],
            ['e_bosschair', 'Fauteuil de direction en cuir', 70, 72, 125, '#3a2418', 'q_ochair', O('fauteuil direction cuir patron', {matl: 'cuir', color2: '#c8ccd0'})],
            ['e_compdesk', 'Bureau informatique', 120, 60, 75, '#e9e1cf', 'desk', O('bureau ordinateur informatique')],
            ['e_bigdesk', 'Grand bureau (plateau 180 cm)', 180, 80, 75, '#6a4026', 'desk', O('bureau grand plateau direction')],
            ['e_drafting', 'Table à dessin inclinable', 120, 80, 95, '#c9b38a', 'q_drafting', OLD('table dessin architecte plans inclinable', {color2: '#2b2b2b'})],
            ['e_pedestal', 'Caisson à tiroirs à roulettes', 42, 55, 60, '#e9e1cf', 'drawers', O('caisson tiroirs rangement bureau')],
            ['e_filecab', 'Classeur métallique à tiroirs', 47, 62, 132, '#8a8f96', 'drawers', O('classeur tiroirs dossiers suspendus métal', {matl: 'métal'})],
            ['e_tambour', 'Armoire à rideaux', 120, 45, 198, '#c8ccd0', 'cabinet', O('armoire rideau bureau rangement classeurs')],
            ['e_plans', 'Meuble à plans', 120, 90, 90, '#8a8f96', 'drawers', O('meuble plans cartes grands tiroirs')],
            ['e_cardindex', 'Fichier à fiches en bois', 40, 45, 30, '#9a6a3a', 'drawers', OLD('fichier fiches bristol bibliothèque', {elev: 75})],
            ['e_binders', 'Étagère de classeurs', 100, 35, 180, '#e9e1cf', 'xbookcase', O('classeurs dossiers étagère rangement', {box: 'archives'})],
            ['e_printer', 'Imprimante', 45, 40, 25, '#2b2b2b', 'q_printer', O('imprimante papier impression', {elev: 75})],
            ['e_mfp', 'Imprimante multifonction (scanner)', 50, 45, 40, '#f4f4f4', 'q_printer', O('imprimante scanner photocopieuse', {elev: 75, color2: '#2b2b2b'})],
            ['e_copier', 'Photocopieur', 60, 65, 115, '#e9e4da', 'q_printer', O('photocopieuse copieur bureau', {color2: '#2b2b2b'})],
            ['e_scanner', 'Scanner à plat', 45, 30, 8, '#2b2b2b', 'q_printer', O('scanner numériser photos actes', {elev: 75})],
            ['e_monitor', 'Écran d’ordinateur', 60, 20, 45, '#1a1a1a', 'q_flat', O('écran moniteur ordinateur', {elev: 75})],
            ['e_dualscreen', 'Deux écrans côte à côte', 120, 25, 45, '#1a1a1a', 'q_flat', O('écrans double moniteur ordinateur', {elev: 75, two: 1})],
            ['e_aio', 'Ordinateur tout-en-un', 62, 20, 50, '#c8ccd0', 'q_flat', O('ordinateur tout-en-un imac', {elev: 75})],
            ['e_typewriter', 'Machine à écrire', 45, 35, 18, '#2b2b2b', 'q_typewriter', OLD('machine à écrire dactylo', {elev: 75, color2: '#e9e4da'})],
            ['e_globe', 'Globe terrestre', 30, 30, 45, '#3a6aa0', 'q_globe', O('globe terre géographie monde', {elev: 75, color2: '#c9a24a'})],
            ['e_globefloor', 'Globe sur pied', 55, 55, 100, '#c9a77a', 'q_globe', OLD('globe terre mappemonde pied ancien', {color2: '#6a4026'})],
            ['e_safe', 'Coffre-fort', 50, 50, 70, '#3a3a3a', 'q_safe', O('coffre-fort sécurité papiers bijoux', {color2: '#c9a24a'})],
            ['e_whiteboard', 'Tableau blanc', 120, 3, 90, '#f4f4f4', 'xcork', O('tableau blanc feutre réunion', {elev: 100})],
            ['e_shredder', 'Destructeur de documents', 35, 25, 50, '#2b2b2b', 'xbin', O('destructeur papier broyeur')],
            ['e_trays', 'Trieur à courrier', 30, 35, 30, '#2b2b2b', 'xmagrack', O('courrier corbeilles trieur papiers', {elev: 75})],
            ['e_deskplant', 'Plante de bureau', 25, 25, 50, '#3f7a3a', 'xplant', O('plante bureau verte', {pl: 'fern', elev: 75})],
            ['e_deskled', 'Lampe de bureau LED', 20, 40, 45, '#f4f4f4', 'xarchlamp', O('lampe bureau led', {elev: 75})],
            ['e_footrest', 'Repose-pieds de bureau', 45, 35, 12, '#2b2b2b', 'q_bar', O('repose-pieds bureau ergonomie', {color2: '#3a3a3a'})],
            ['e_watercooler', 'Fontaine à eau', 32, 35, 105, '#f4f4f4', 'q_tower', O('fontaine eau bonbonne bureau', {color2: '#6aa7d9', jug: 1})]],
        'Garage': [
            ['e_carcity', 'Voiture citadine', 165, 370, 150, '#c0392b', 'q_car', O('voiture auto automobile citadine')],
            ['e_carfamily', 'Voiture familiale (break)', 180, 470, 150, '#2f4a6a', 'q_car', O('voiture auto automobile break famille')],
            ['e_van', 'Camionnette', 195, 480, 200, '#f4f4f4', 'q_car', O('camionnette utilitaire fourgon', {van: 1})],
            ['e_2cv', '2 CV', 148, 383, 160, '#8aa0b0', 'q_car', OLD('2cv deux chevaux citroën voiture', {color2: '#2b2b2b', round: 1})],
            ['e_4l', 'Renault 4 L', 148, 366, 155, '#e9e4da', 'q_car', OLD('4l renault quatrelle voiture', {van: 1})],
            ['e_traction', 'Traction avant', 168, 445, 152, '#1a1a1a', 'q_car', OLD('traction citroën voiture ancienne', {round: 1})],
            ['e_caravan', 'Caravane', 220, 500, 250, '#f4f4f4', 'q_car', O('caravane vacances camping', {van: 1, color2: '#c9a24a'})],
            ['e_bike', 'Vélo', 60, 180, 105, '#2a6a9a', 'q_bike', O('vélo bicyclette cycle')],
            ['e_ebike', 'Vélo électrique', 65, 185, 110, '#2b2b2b', 'q_bike', O('vélo électrique batterie', {color2: '#3a8a5a', batt: 1})],
            ['e_kidbike', 'Vélo d’enfant', 45, 120, 75, '#c0392b', 'q_bike', O('vélo enfant petites roues')],
            ['e_oldbike', 'Vélo ancien (de facteur)', 60, 180, 110, '#2b2b2b', 'q_bike', OLD('vélo ancien facteur bicyclette')],
            ['e_bikerack', 'Râtelier à vélos', 150, 40, 40, '#8a8f96', 'q_rack', O('râtelier support vélos rangement')],
            ['e_scooter', 'Scooter', 70, 180, 115, '#e9e4da', 'xmoto', O('scooter deux-roues')],
            ['e_pegboard', 'Panneau à outils mural', 120, 5, 80, '#c9a77a', 'q_peg', O('panneau outils mur bricolage clés tournevis', {elev: 110})],
            ['e_toolcab', 'Armoire métallique d’atelier', 100, 50, 195, '#8a8f96', 'cabinet', O('armoire métal outils atelier', {matl: 'métal'})],
            ['e_shelfgarage', 'Étagère de garage en bois', 150, 45, 180, '#c9a77a', 'xbookcase', O('étagère garage rangement cartons', {box: 'caisses'})],
            ['e_foldbench', 'Établi pliant', 80, 60, 80, '#e0c46a', 'table', O('établi pliant bricolage')],
            ['e_mitresaw', 'Scie à onglet', 50, 55, 40, '#e0c46a', 'xtablesaw', O('scie onglet coupe bois', {elev: 80})],
            ['e_lathe', 'Tour à bois', 150, 40, 120, '#3a5a8a', 'xtablesaw', O('tour bois tournage atelier')],
            ['e_welder', 'Poste à souder', 50, 30, 40, '#2a6a9a', 'xcompressor', O('soudure poste à souder')],
            ['e_pressurewash', 'Nettoyeur haute pression', 40, 40, 85, '#e0c46a', 'xcompressor', O('karcher nettoyeur haute pression')],
            ['e_generator', 'Groupe électrogène', 60, 45, 50, '#c0392b', 'xcompressor', O('groupe électrogène courant')],
            ['e_shopvac', 'Aspirateur d’atelier', 45, 45, 70, '#e0c46a', 'xvacuum', O('aspirateur atelier eau poussière')],
            ['e_jack', 'Cric rouleur', 35, 70, 20, '#c0392b', 'q_jack', O('cric voiture roue')],
            ['e_charger', 'Borne de recharge (voiture électrique)', 30, 15, 40, '#f4f4f4', 'q_micro', O('borne recharge voiture électrique wallbox', {elev: 110, color2: '#3a8a5a', one: 1})],
            ['e_ladder', 'Échelle d’appui', 45, 15, 300, '#c8ccd0', 'xlibladder', O('échelle appui toit')],
            ['e_garagefridge', 'Réfrigérateur de garage', 60, 65, 145, '#f4f4f4', 'xfridge2', O('frigo garage boissons')],
            ['e_garagefreezer', 'Congélateur coffre de garage', 110, 65, 85, '#f4f4f4', 'chest', O('congélateur coffre garage')],
            ['e_bins', 'Poubelles de tri (conteneurs)', 120, 70, 105, '#3a8a3a', 'xbin', O('poubelles conteneurs tri déchets')],
            ['e_canoe', 'Canoë', 90, 480, 40, '#3a8a3a', 'xkayak', O('canoë bateau rivière')],
            ['e_surf', 'Planche de surf', 55, 210, 8, '#e9e4da', 'xkayak', O('surf planche mer')],
            ['e_garagelight', 'Réglette d’atelier', 120, 10, 8, '#f4f4f4', 'q_tube', O('néon réglette atelier éclairage', {elev: 240})]],
        'Luminaires': [
            ['e_ceiling', 'Plafonnier rond', 40, 40, 10, '#f4f4f4', 'q_disc', O('plafonnier plafond lumière', {elev: 245})],
            ['e_ceilingdeco', 'Plafonnier Art déco', 45, 45, 18, '#f2ead8', 'q_disc', OLD('plafonnier art déco verre', {elev: 240, color2: '#c9a24a'})],
            ['e_ledpanel', 'Dalle LED', 60, 60, 3, '#f4f4f4', 'q_disc', O('dalle led plafond bureau', {elev: 250, sq: 1})],
            ['e_chandelier', 'Lustre à bras', 80, 80, 70, '#c9a24a', 'q_chand', O('lustre plafond bras ampoules', {elev: 175})],
            ['e_ironchand', 'Lustre en fer forgé (à bougies)', 90, 90, 80, '#2b2b2b', 'q_chand', OLD('lustre fer forgé bougies château', {elev: 170, candles: 1})],
            ['e_wheelchand', 'Lustre roue de charrette', 100, 100, 60, '#6a4026', 'q_chand', OLD('lustre roue charrette ferme', {elev: 180, wheel: 1})],
            ['e_batten', 'Réglette lumineuse', 120, 8, 6, '#f4f4f4', 'q_tube', O('réglette néon tube cuisine', {elev: 230})],
            ['e_neon', 'Néon décoratif (enseigne)', 70, 4, 30, '#ff4fa3', 'q_tube', O('néon enseigne lumière couleur', {elev: 150, wall: 1})],
            ['e_ledstrip', 'Bandeau LED', 200, 2, 2, '#ffd27a', 'q_tube', O('ruban led bandeau', {elev: 230})],
            ['e_torch', 'Lampadaire vasque (halogène)', 35, 35, 180, '#2b2b2b', 'q_torch', O('lampadaire halogène vasque', {color2: '#f4f1ea'})],
            ['e_torchdeco', 'Lampadaire vasque Art déco', 40, 40, 175, '#c9a24a', 'q_torch', OLD('lampadaire art déco albâtre', {color2: '#f2ead8'})],
            ['e_readfloor', 'Lampadaire liseuse', 40, 40, 160, '#2b2b2b', 'xarclamp', O('liseuse lecture lampadaire')],
            ['e_bedside', 'Lampe de chevet', 25, 25, 40, '#e9dcc3', 'xtablelamp', O('chevet lampe chambre', {elev: 55})],
            ['e_pleated', 'Lampe à abat-jour plissé', 35, 35, 55, '#f2ead8', 'xtablelamp', OLD('lampe abat-jour plissé tissu', {elev: 75})],
            ['e_opaline', 'Lampe globe en opaline', 30, 30, 40, '#f4f4f4', 'xmushroom', O('lampe globe opaline boule', {elev: 75})],
            ['e_salt', 'Lampe de sel', 15, 15, 22, '#e8a070', 'xmushroom', O('lampe sel himalaya', {elev: 75})],
            ['e_nightlight', 'Veilleuse d’enfant', 12, 12, 15, '#9ad0ec', 'xmushroom', O('veilleuse nuit enfant', {elev: 55})],
            ['e_reader', 'Lampe de lecture articulée', 18, 40, 50, '#c8ccd0', 'xarchlamp', O('lecture liseuse lampe', {elev: 75})],
            ['e_petrole', 'Lampe à pétrole', 18, 18, 45, '#c9a24a', 'petrole', OLD('lampe pétrole verre mèche', {elev: 75})],
            ['e_storm', 'Lampe tempête', 20, 20, 30, '#c0392b', 'xlantern', OLD('lampe tempête lanterne ferme', {elev: 75})],
            ['e_carbide', 'Lampe à carbure (de mineur)', 12, 12, 25, '#8a6a3a', 'petrole', OLD('lampe carbure mineur', {elev: 120})],
            ['e_candlestick', 'Bougeoir à main', 15, 15, 15, '#c9a24a', 'candle', OLD('bougeoir bougie chandelle', {elev: 55})],
            ['e_candelabra', 'Candélabre à cinq branches', 40, 15, 45, '#c0c4c8', 'xcandelabra', OLD('candélabre chandelier argent', {elev: 76})],
            ['e_sconce2', 'Applique double', 35, 20, 30, '#c9a24a', 'xsconce', O('applique double mur', {elev: 165})],
            ['e_bathsconce', 'Applique de salle de bain', 50, 12, 10, '#c8ccd0', 'xsconce', O('applique miroir salle de bain', {elev: 190})],
            ['e_industrial', 'Suspension industrielle', 40, 40, 70, '#2b2b2b', 'xpendant', O('suspension industrielle métal atelier', {elev: 170})],
            ['e_bulb', 'Ampoule nue (filament)', 12, 12, 60, '#ffd27a', 'xpendant', O('ampoule filament edison suspension', {elev: 190})],
            ['e_rattan', 'Suspension en rotin', 50, 50, 40, '#c9a26a', 'xpaperball', O('suspension rotin osier', {elev: 185, matl: 'osier'})],
            ['e_disco', 'Boule à facettes', 30, 30, 30, '#c8ccd0', 'xpaperball', O('boule disco facettes fête', {elev: 200})],
            ['e_spot', 'Projecteur extérieur', 20, 15, 20, '#2b2b2b', 'xsconce', O('projecteur extérieur détecteur', {elev: 250})],
            ['e_bollard', 'Borne lumineuse de jardin', 20, 20, 80, '#2b2b2b', 'xstreetlamp', O('borne jardin allée lumière')],
            ['e_solar', 'Balise solaire de jardin', 10, 10, 40, '#2b2b2b', 'xstreetlamp', O('solaire balise jardin allée')]],
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
    ext.houseEquip = {ROWS, count: () => Object.values(ROWS).reduce((s, r) => s + r.length, 0), addAll};
    const L9of = it => ext.houseLib?.libOf?.(it?.kind)?.[9] || {};

    /* ═════════ Les dessins vus de dessus (centrés en 0, 0 ; boîte w × d ; le haut du dessin = le dos de l'objet) ═════════ */
    const N = v => Math.round(v * 100) / 100;
    function sym(k, item, {R, S, c, w, d, x0, y0}) {
        const x1 = w / 2, y1 = d / 2, m = Math.min(w, d), c2 = /^#[0-9a-f]{6}$/i.test(item.color2 || '') ? item.color2 : '#8a8f96', K = '#3a3530', L9 = L9of(item);
        const E = (cx, cy, rx, ry, f = c, ex = '') => `<ellipse cx="${N(cx)}" cy="${N(cy)}" rx="${N(Math.max(.1, rx))}" ry="${N(Math.max(.1, ry))}" fill="${f}" ${S} ${ex}/>`;
        const Ci = (cx, cy, r, f = c, ex = '') => E(cx, cy, r, r, f, ex);
        const Rr = (x, y, ww, hh, rx = 0, f = c, ex = '') => `<rect x="${N(x)}" y="${N(y)}" width="${N(Math.max(.1, ww))}" height="${N(Math.max(.1, hh))}" rx="${N(rx)}" fill="${f}" ${S} ${ex}/>`;
        const Ln = (dd, ex = '') => `<path d="${dd}" fill="none" ${S} ${ex}/>`;
        const rep = (n, f) => Array.from({length: Math.max(0, n)}, (_, i) => f(i, n)).join('');
        switch (k) {
            case 'q_porthole': case 'q_dish': case 'q_micro': return Rr(x0, y0, w, d, 1) + Rr(x0 + w * .05, y0 + d * .05, w * .9, d * .15, 0, c2);
            case 'q_hob': return Rr(x0, y0, w, d, 1) + (L9.one ? Rr(x0 + w * .1, y0 + d * .1, w * .8, d * .8, 1, c2, 'opacity=".5"') : rep(4, i => Ci(x0 + w * (i % 2 ? .7 : .3), y0 + d * (i < 2 ? .3 : .7), m * (i % 3 ? .15 : .2), 'none', `stroke="${c2}"`)));
            case 'q_hood': return Rr(x0, y0, w, d, 0, c, 'opacity=".75"') + Rr(-w * .15, y0, w * .3, d * .4, 0, c);
            case 'q_pot': case 'q_jar': return Rr(x0, y0, w, d, m * .2) + Ci(0, 0, m * .32, c2);
            case 'q_flat': return (L9.two ? Rr(x0, -d * .1, w * .49, d * .2, 0, '#1a1a1a') + Rr(x0 + w * .51, -d * .1, w * .49, d * .2, 0, '#1a1a1a') : Rr(x0, L9.wall ? y0 : -d * .1, w, L9.wall ? d : d * .2, 0, '#1a1a1a')) + (L9.wall ? '' : Rr(-w * .15, y0 + d * .5, w * .3, d * .4, 1, c));
            case 'q_bar': return Rr(x0, y0, w, d, 1) + Ln(`M${N(x0 + w * .1)} 0H${N(x1 - w * .1)}`, `stroke="${c2}"`);
            case 'q_tsf': return Rr(x0, y0, w, d, m * .2) + Rr(x0 + w * .1, y0 + d * .6, w * .8, d * .3, 0, c2);
            case 'q_tower': case 'q_tank': return Rr(x0, y0, w, d, k === 'q_tank' ? m / 2 : 2) + Ci(0, 0, m * .25, L9.jug ? c2 : '#9aa0a6');
            case 'q_ochair': return Ci(0, 0, m / 2, 'none', `stroke="${K}"`) + rep(5, i => Ln(`M0 0L${N(Math.cos(i * 1.257) * m * .48)} ${N(Math.sin(i * 1.257) * m * .48)}`)) + Rr(x0 + w * .15, y0 + d * .2, w * .7, d * .6, 4) + Rr(x0 + w * .15, y0, w * .7, d * .15, 2);
            case 'q_drafting': return Rr(x0, y0, w, d, 0, c) + Ln(`M${x0} ${N(y1 - d * .1)}H${x1}`, `stroke="${c2}"`);
            case 'q_printer': return Rr(x0, y0, w, d, 2) + Rr(x0 + w * .2, y1 - d * .25, w * .6, d * .25, 0, '#f4f4f4');
            case 'q_typewriter': return Rr(x0, y0 + d * .2, w, d * .8, 2) + Rr(x0 - w * .05, y0, w * 1.1, d * .2, 1, c2) + rep(12, i => Ci(x0 + w * (i % 6 + .5) / 6 * .8 + w * .1, y0 + d * (i < 6 ? .6 : .8), m * .04, '#e9e4da'));
            case 'q_globe': return Ci(0, 0, m / 2, 'none', `stroke="${c2}"`) + Ci(0, 0, m * .42, c) + E(-m * .1, -m * .05, m * .15, m * .1, '#4a8a4a');
            case 'q_safe': return Rr(x0, y0, w, d, 2) + Ci(0, y1 - d * .15, m * .1, c2);
            case 'q_car': return Rr(x0, y0, w, d, m * (L9.round ? .35 : .2)) + Rr(x0 + w * .1, y0 + d * (L9.van ? .12 : .3), w * .8, d * (L9.van ? .7 : .4), m * .1, '#9ec4dc', 'opacity=".75"') + rep(4, i => Rr(i % 2 ? x1 - w * .06 : x0 - w * .02, y0 + d * (i < 2 ? .15 : .75), w * .08, d * .12, 1, '#1a1a1a'));
            case 'q_bike': return Rr(-w * .1, y0, w * .2, d * .3, 1, '#1a1a1a') + Rr(-w * .1, y1 - d * .3, w * .2, d * .3, 1, '#1a1a1a') + Ln(`M0 ${N(y0 + d * .3)}V${N(y1 - d * .3)}`, `stroke="${c}" stroke-width="2"`) + Ln(`M${N(x0)} ${N(y0 + d * .15)}H${N(x1)}`);
            case 'q_rack': return Rr(x0, y0, w, d, 1, 'none') + rep(5, i => Ln(`M${N(x0 + w * (i + .5) / 5)} ${y0}V${y1}`, `stroke="${c}"`));
            case 'q_peg': return Rr(x0, y0, w, Math.max(2, d), 0, c);
            case 'q_jack': return Rr(x0, y0 + d * .3, w, d * .7, 2) + Ln(`M0 ${N(y0 + d * .3)}V${y0}`, `stroke="${c}" stroke-width="2"`);
            case 'q_disc': return L9.sq ? Rr(x0, y0, w, d, 1, c) : Ci(0, 0, m / 2, c) + Ci(0, 0, m * .3, '#fff5d6');
            case 'q_chand': return Ci(0, 0, m * .12, c) + rep(L9.wheel ? 8 : 6, (i, n) => Ln(`M0 0L${N(Math.cos(i * 6.283 / n) * m * .45)} ${N(Math.sin(i * 6.283 / n) * m * .45)}`, `stroke="${c}"`) + Ci(Math.cos(i * 6.283 / n) * m * .45, Math.sin(i * 6.283 / n) * m * .45, m * .06, '#ffd27a')) + (L9.wheel ? Ci(0, 0, m * .45, 'none', `stroke="${c}"`) : '');
            case 'q_tube': return Rr(x0, y0, w, d, Math.min(w, d) / 2, '#fff5d6', `stroke="${c}"`);
            case 'q_torch': return Ci(0, 0, m / 2, c2) + Ci(0, 0, m * .15, c);
            default: return undefined;
        }
    }
    const prev2 = ext.houseSym2dX;
    ext.houseSym2dX = (k, item, o) => (typeof k === 'string' && k.startsWith('q_') ? sym(k, item, o) : undefined) ?? prev2?.(k, item, o);

    /* ═════════ Les formes en volume (mètres ; le devant regarde +z) ═════════ */
    const okHex = v => /^#[0-9a-f]{6}$/i.test(v || '');
    function f3(shape, x) {
        const {T, w, d, h, col, it} = x, mat = x.mat, m = Math.min(w, d), PI = Math.PI, L9 = L9of(it);
        const c2 = okHex(x.col2) ? x.col2 : '#8a8f96';
        const add = (o, px = 0, py = 0, pz = 0) => { o.position.set(px, py, pz); x.g.add(o); return o; };
        const M_ = c => (c && c.isMaterial) ? c : mat(c);
        const Bx = (ww, hh, dd, c = col, px = 0, py = hh / 2, pz = 0) => add(x.box(Math.max(.002, ww), Math.max(.002, hh), Math.max(.002, dd), M_(c)), px, py, pz);
        const Cy = (rt, rb, hh, c = col, px = 0, py = hh / 2, pz = 0, seg = 20) => add(new T.Mesh(new T.CylinderGeometry(Math.max(.001, rt), Math.max(.001, rb), Math.max(.001, hh), seg), M_(c)), px, py, pz);
        const CyZ = (r, len, c, px, py, pz, seg = 20) => { const o = Cy(r, r, len, c, px, py, pz, seg); o.rotation.x = PI / 2; return o; };
        const CyX = (r, len, c, px, py, pz, seg = 12) => { const o = Cy(r, r, len, c, px, py, pz, seg); o.rotation.z = PI / 2; return o; };
        const Sp = (rx, ry, rz, c = col, px = 0, py = 0, pz = 0, seg = 16) => { const o = add(new T.Mesh(new T.SphereGeometry(1, seg, Math.max(6, seg * .6 | 0)), M_(c)), px, py, pz); o.scale.set(Math.max(.001, rx), Math.max(.001, ry), Math.max(.001, rz)); return o; };
        const To = (r, t, c = col, px = 0, py = 0, pz = 0, seg = 24) => add(new T.Mesh(new T.TorusGeometry(Math.max(.002, r), Math.max(.001, t), 8, seg), M_(c)), px, py, pz);
        const V = (a, b, c) => new T.Vector3(a, b, c), UP = V(0, 1, 0);
        const Rod = (a, b, r = .01, c = c2, seg = 8) => { const A0 = V(...a), B0 = V(...b), dir = B0.clone().sub(A0), len = dir.length() || .001; const o = add(new T.Mesh(new T.CylinderGeometry(r, r, len, seg), M_(c)), (A0.x + B0.x) / 2, (A0.y + B0.y) / 2, (A0.z + B0.z) / 2); o.quaternion.setFromUnitVectors(UP, dir.normalize()); return o; };
        const metal = (c = '#c8ccd0', r = .35) => mat(c, '', {metalness: .6, roughness: r});
        const glass = (c = '#bfe0f0', op = .45) => mat(c, '', {transparent: true, opacity: op, roughness: .1});
        const glow = (c = '#fff5d6', k = 1.4) => mat(c, '', {emissive: c, emissiveIntensity: k});
        const dark = '#1a1a1a';
        switch (shape) {
            case 'q_porthole': { Bx(w, h, d); Bx(w * .96, h * .12, .01, c2, 0, h * .92, d / 2 + .005); const r = Math.min(w, h) * .3;
                To(r, .02, metal(), 0, h * .45, d / 2 + .01); CyZ(r * .92, .01, glass('#9ab4c4', .6), 0, h * .45, d / 2 + .008, 28); Cy(.02, .02, .02, dark, w * .3, h * .92, d / 2 + .02).rotation.x = PI / 2; return true; }
            case 'q_dish': { Bx(w, h, d); Bx(w * .96, h * .1, .01, c2, 0, h * .93, d / 2 + .005); CyX(.008, w * .6, metal(), 0, h * .82, d / 2 + .025); return true; }
            case 'q_micro': { Bx(w, h, d); if (L9.lens) { CyZ(m * .18, .02, dark, -w * .25, h * .5, d / 2 + .01, 20); return true; }
                if (L9.one) { Bx(w * .9, h * .65, .01, glass('#2b2b2b', .7), 0, h * .45, d / 2 + .005); Bx(w * .9, h * .15, .01, c2, 0, h * .88, d / 2 + .005); return true; }
                Bx(w * .62, h * .75, .01, glass('#2b2b2b', .75), -w * .15, h * .5, d / 2 + .005); Bx(w * .22, h * .75, .01, c2, w * .35, h * .5, d / 2 + .005); return true; }
            case 'q_hob': { Bx(w, h, d); if (L9.one) { Bx(w * .9, .006, d * .85, metal(c2, .5), 0, h + .003); return true; }
                [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b], i) => To(m * (i % 3 ? .14 : .18), .006, metal(c2), a * w * .22, h + .004, b * d * .22).rotation.x = PI / 2); return true; }
            case 'q_hood': { const hh = h * .35; const s0 = new T.CylinderGeometry(Math.min(w, d) * .25, Math.max(w, d) * .55, hh, 4, 1); s0.rotateY(PI / 4); const o = add(new T.Mesh(s0, metal(col)), 0, hh / 2, 0); o.scale.set(w / (Math.max(w, d) * .78), 1, d / (Math.max(w, d) * .78));
                Bx(w * .3, h - hh, d * .3, metal(col), 0, hh + (h - hh) / 2, L9.island ? 0 : -d * .2); return true; } // la cheminée : contre le mur, ou au milieu pour un îlot
            case 'q_pot': { Cy(m * .45, m * .42, h * .8, col, 0, h * .4); Sp(m * .44, h * .2, m * .44, c2, 0, h * .8); Bx(m * .2, .03, .03, dark, 0, h * .97); return true; }
            case 'q_jar': { Bx(w * .9, h * .3, d * .9, col, 0, h * .15); Cy(m * .38, m * .3, h * .6, glass(c2), 0, h * .3 + h * .3); Cy(m * .4, m * .4, h * .06, col, 0, h * .93); return true; }
            case 'q_flat': { const sw = L9.two ? w * .49 : w, sh = L9.wall ? h : h * .8;
                (L9.two ? [-1, 1] : [0]).forEach(s => { Bx(sw, sh, .03, dark, s * w * .255, h - sh / 2, 0); Bx(sw * .95, sh * .9, .005, mat(L9.wall && col !== '#1a1a1a' ? col : '#2a3a4a', '', {emissive: '#1a2a3a', emissiveIntensity: .3}), s * w * .255, h - sh / 2, .016); });
                if (!L9.wall) { Bx(.05, h * .25, .05, c2 === '#8a8f96' ? col : c2, 0, h * .12, -.02); Bx(Math.min(w * .4, .4), .02, d * .8, col, 0, .01, 0); } return true; }
            case 'q_bar': { Bx(w, h, d); Bx(w * .9, h * .4, .005, c2, 0, h * .5, d / 2 + .003); return true; }
            case 'q_tsf': { Bx(w, h * .75, d, col, 0, h * .375); Sp(w / 2, h * .25, d / 2, col, 0, h * .75, 0, 24);
                Bx(w * .7, h * .45, .006, mat(c2, 'tissu'), 0, h * .55, d / 2 + .003); [-1, 1].forEach(s => CyZ(.015, .02, dark, s * w * .2, h * .15, d / 2 + .01, 12)); return true; }
            case 'q_tower': { Bx(w, h, d, col, 0, h / 2); Bx(w * .7, h * .5, .005, '#9aa0a6', 0, h * .55, d / 2 + .003); if (L9.jug) Cy(m * .4, m * .4, h * .3, glass(c2, .6), 0, h + h * .15); return true; }
            case 'q_tank': { Cy(m / 2, m / 2, h, col, 0, h / 2, 0, 24); Sp(m / 2, m * .15, m / 2, col, 0, h); Sp(m / 2, m * .15, m / 2, col, 0, 0); Cy(.012, .012, .15, metal(), -m * .2, -.075); Cy(.012, .012, .15, metal(), m * .2, -.075); return true; }
            case 'q_ochair': { const seatY = h * .42; for (let i = 0; i < 5; i++) { const a = i * PI * .4; Rod([0, .06, 0], [Math.cos(a) * m * .45, .05, Math.sin(a) * m * .45], .014, metal(c2)); Sp(.025, .025, .025, dark, Math.cos(a) * m * .45, .025, Math.sin(a) * m * .45, 8); }
                Cy(.025, .025, seatY - .06, metal(c2), 0, .06 + (seatY - .06) / 2); Bx(w * .75, .08, d * .7, col, 0, seatY, .02); Bx(w * .7, h - seatY - .1, .06, col, 0, seatY + .05 + (h - seatY - .1) / 2, -d * .33); [-1, 1].forEach(s => Bx(.04, .2, d * .45, dark, s * w * .38, seatY + .12, .02)); return true; }
            case 'q_drafting': { [-1, 1].forEach(s => { Rod([s * w * .4, 0, -d * .35], [s * w * .4, h * .85, -d * .3], .02, c2); Rod([s * w * .4, 0, d * .35], [s * w * .4, h * .7, d * .2], .02, c2); });
                const top = Bx(w, .03, d, col, 0, h * .85, 0); top.rotation.x = .3; return true; }
            case 'q_printer': { Bx(w, h * .8, d, col, 0, h * .4); Bx(w * .6, .01, d * .4, '#f4f4f4', 0, h * .82, -d * .1); Bx(w * .6, h * .1, d * .2, '#f4f4f4', 0, h * .3, d / 2 + .05); return true; }
            case 'q_typewriter': { Bx(w * .9, h * .55, d * .8, col, 0, h * .275, d * .1); CyX(.03, w, dark, 0, h * .75, -d * .3, 16); Bx(w * .6, h * .5, .01, '#f4f4f4', 0, h * 1.05, -d * .35);
                for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) Cy(.008, .008, .012, c2, -w * .32 + i * w * .08, h * .55 + .006 + r * .01, d * .05 + r * .06, 10); return true; }
            case 'q_globe': { const r = Math.min(m * .42, h * .35); Cy(m * .3, m * .35, .03, c2, 0, .015); Cy(.012, .012, h - r * 2 - .04, c2, 0, .03 + (h - r * 2 - .04) / 2); Sp(r, r, r, col, 0, h - r, 0, 24); To(r * 1.08, .006, metal(c2 === '#8a8f96' ? '#c9a24a' : c2), 0, h - r, 0).rotation.y = PI / 2;
                Sp(r * .35, r * .3, r * .1, '#4a8a4a', r * .2, h - r * .9, r * .92); return true; }
            case 'q_safe': { Bx(w, h, d); Bx(w * .85, h * .85, .01, mat(col, '', {metalness: .4}), 0, h / 2, d / 2 + .005); CyZ(m * .1, .03, metal(c2), 0, h * .6, d / 2 + .02); Bx(.03, h * .2, .03, metal(c2), w * .3, h * .5, d / 2 + .03); return true; }
            case 'q_car': { const wr = Math.min(h * .22, w * .2), body = h * (L9.van ? .75 : .5); Bx(w, body - wr * .6, d, col, 0, wr * .6 + (body - wr * .6) / 2);
                const cabL = d * (L9.van ? .75 : .5), cabH = h - body; Bx(w * .9, cabH, cabL, glass('#9ec4dc', .6), 0, body + cabH / 2, L9.van ? -d * .08 : -d * .03); Bx(w * .92, .03, cabL * (L9.round ? .9 : 1), col, 0, h - .015, L9.van ? -d * .08 : -d * .03);
                [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([a, b]) => { const o = Cy(wr, wr, .18, dark, a * (w / 2 - .06), wr, b * d * .33, 18); o.rotation.z = PI / 2; Cy(wr * .55, wr * .55, .19, metal(), a * (w / 2 - .06), wr, b * d * .33, 14).rotation.z = PI / 2; });
                [-1, 1].forEach(a => { Bx(w * .2, .08, .02, glow('#fff5d6', .8), a * w * .32, body * .8, d / 2 + .01); Bx(w * .15, .06, .02, glow('#e03030', .6), a * w * .35, body * .8, -d / 2 - .01); }); return true; }
            case 'q_bike': { const r = Math.min(h * .33, d * .22); [-1, 1].forEach(b => { const t = To(r, .015, dark, 0, r, b * (d / 2 - r)); t.rotation.y = PI / 2; });
                const back = [0, r, -(d / 2 - r)], front = [0, r, d / 2 - r], seat = [0, h * .8, -d * .12], bar = [0, h * .88, d * .22], ped = [0, r, -d * .02];
                [[back, ped], [ped, seat], [back, seat], [ped, bar], [seat, bar], [bar, front]].forEach(([a, b]) => Rod(a, b, .014, col));
                Bx(.1, .03, .22, dark, 0, h * .82, -d * .12); Rod([-w * .4, h * .95, d * .22], [w * .4, h * .95, d * .22], .012, metal()); if (L9.batt) Bx(.08, .25, .2, c2, 0, h * .55, -d * .25); return true; }
            case 'q_rack': { Bx(w, .03, d, metal(col), 0, .015); for (let i = 0; i < 6; i++) { const px = -w / 2 + w * (i + .5) / 6; Rod([px, .03, -d / 2], [px, h, 0], .01, metal(col)); Rod([px, h, 0], [px, .03, d / 2], .01, metal(col)); } return true; }
            case 'q_peg': { Bx(w, h, d, mat(col, 'bois'), 0, h / 2); const tools = ['#c0392b', '#2b2b2b', '#2a6a9a', '#8a8f96', '#e0c46a'];
                for (let i = 0; i < 9; i++) { const px = -w * .42 + i * w * .105, hh = h * (.25 + (i % 3) * .1); Bx(.015, hh, .015, tools[i % 5], px, h * .8 - hh / 2, d / 2 + .02); Bx(.04, .03, .02, metal(), px, h * .8 - hh, d / 2 + .02); } return true; }
            case 'q_jack': { Bx(w, h * .4, d * .8, col, 0, h * .2, -d * .1); Rod([0, h * .4, d * .1], [0, h * .95, d * .45], .02, col); Rod([0, h * .4, -d * .4], [0, h * 1.6, -d * .7], .012, metal()); [-1, 1].forEach(s => [-1, 1].forEach(b => Cy(.03, .03, .02, dark, s * w * .4, .03, b * d * .3).rotation.z = PI / 2)); return true; }
            case 'q_disc': { if (L9.sq) { Bx(w, h, d, col, 0, h / 2); Bx(w * .94, .004, d * .94, glow(), 0, -.002); return true; } Cy(m / 2, m * .45, h * .4, okHex(x.col2) ? x.col2 : col, 0, h * .8); Sp(m * .45, h * .7, m * .45, glow(col === '#f4f4f4' ? '#fff5d6' : col, 1.1), 0, h * .55, 0, 24); return true; }
            case 'q_chand': { const n = L9.wheel ? 8 : 6, R0 = m * .45; Cy(.008, .008, h * .4, metal(col), 0, h * .8); if (L9.wheel) { To(R0, .025, col, 0, h * .25, 0).rotation.x = PI / 2; for (let i = 0; i < n; i++) Rod([0, h * .25, 0], [Math.cos(i * 2 * PI / n) * R0, h * .25, Math.sin(i * 2 * PI / n) * R0], .012, col); }
                else { Sp(.05, .08, .05, metal(col), 0, h * .55); for (let i = 0; i < n; i++) { const a = i * 2 * PI / n; Rod([0, h * .55, 0], [Math.cos(a) * R0 * .6, h * .3, Math.sin(a) * R0 * .6], .008, metal(col)); Rod([Math.cos(a) * R0 * .6, h * .3, Math.sin(a) * R0 * .6], [Math.cos(a) * R0, h * .4, Math.sin(a) * R0], .008, metal(col)); } }
                for (let i = 0; i < n; i++) { const a = i * 2 * PI / n, px = Math.cos(a) * R0, pz = Math.sin(a) * R0, by = L9.wheel ? h * .25 : h * .4;
                    if (L9.candles || L9.wheel) { Cy(.012, .012, .08, '#f4ecd8', px, by + .04, pz, 8); Sp(.008, .016, .008, glow('#ffb347', 1.6), px, by + .095, pz, 8); }
                    else { Cy(.04, .025, .07, mat('#f2ead8', '', {transparent: true, opacity: .85}), px, by + .035, pz, 12); Sp(.02, .025, .02, glow(), px, by + .03, pz, 8); } } return true; }
            case 'q_tube': { Bx(w, h, d, col, 0, h / 2); Bx(w * .96, Math.max(.006, h * .6), Math.max(.006, d * .6), glow(L9.wall || col !== '#f4f4f4' ? col : '#fff5d6', 1.6), 0, h * .4, L9.wall ? d / 2 : 0); return true; }
            case 'q_torch': { Cy(m * .35, m * .4, .03, col, 0, .015); Cy(.012, .012, h * .85, metal(col), 0, h * .44); const s0 = new T.CylinderGeometry(m * .5, m * .15, h * .12, 24, 1, true); add(new T.Mesh(s0, mat(c2 === '#8a8f96' ? '#f4f1ea' : c2, '', {side: T.DoubleSide})), 0, h * .94, 0); Sp(m * .12, .02, m * .12, glow(), 0, h * .93); return true; }
            default: return false;
        }
    }
    const prevF = ext.houseFurnitureX;
    ext.houseFurnitureX = (shape, x) => (typeof shape === 'string' && shape.startsWith('q_') && f3(shape, x)) || (prevF ? prevF(shape, x) : false);
})();
