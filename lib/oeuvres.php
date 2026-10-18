<?php
declare(strict_types=1);

/**
 * 🧩 Les TYPES D'ŒUVRES (maquettes I, J, K, L, S, T de docs/design/profils-et-oeuvres.html) côté serveur.
 * Interface : assets/js/heritage-oeuvres*.js (les définitions des champs sont dans le navigateur, comme pour les types A–H).
 *
 * Ici seulement :
 *  - les clés permises (« o_… » et la fiche de profil « profile_artisan »), déclarées au moteur par $GLOBALS['ART_EXTRA_TYPES']
 *    (lu par art_extra_types() de lib/art_engine.php) : clé => [nom, pluriel, icône, famille, type parent, profil(s)] ;
 *    les œuvres sont rangées dans le profil « artist » (case « Artiste » proposée au premier enregistrement, comme A–H) ;
 *  - oeuvres_register_type() : la ligne item_types d'un type (nom, icône) écrite au premier enregistrement d'une fiche, pour
 *    que le menu de choix (« artwork ») et les pastilles disent « Sculpture 🗿 » ;
 *  - oeuvres_subline() : la ligne grise d'une fiche dans le menu de choix et « Lié à ».
 * Pas de table à soi : tout est dans les tables génériques du moteur (items, item_types, type_fields, type_links…).
 */

const OEUVRES_TYPES = [
    'o_sculpture' => ['Sculpture', 'Sculptures', '🗿', 'visual', '', ['artist']],
    'o_cast' => ['Fonte, tirage', 'Fontes et tirages', '🔥', 'visual', 'o_sculpture', ['artist']],
    'o_affiche' => ['Affiche', 'Affiches', '🪧', 'design', '', ['artist']],
    'o_concerto' => ['Concerto', 'Concertos', '🎻', 'music', '', ['artist']],
    'o_piece' => ['Pièce de théâtre', 'Pièces de théâtre', '🎭', 'stage', '', ['artist']],
    'o_mes' => ['Mise en scène', 'Mises en scène', '🎭', 'stage', 'o_piece', ['artist']],
    'o_representation' => ['Représentation', 'Représentations', '🎟', 'stage', 'o_mes', ['artist']],
    'o_tournee' => ['Tournée', 'Tournées', '🚌', 'stage', 'o_mes', ['artist']],
    'o_ferronnerie' => ['Ferronnerie d’art', 'Pièces de ferronnerie', '⚒️', 'design', '', ['artist']],
    'o_dessin' => ['Dessin', 'Dessins', '✏️', 'visual', '', ['artist']],
    'o_aquarelle' => ['Aquarelle · pastel · gouache', 'Aquarelles, pastels, gouaches', '🎨', 'visual', '', ['artist']],
    'o_gravure' => ['Gravure · estampe', 'Gravures et estampes', '🪵', 'visual', '', ['artist']],
    'o_installation' => ['Installation', 'Installations', '🧱', 'visual', '', ['artist']],
    'o_photo' => ['Photographie', 'Photographies', '📷', 'visual', '', ['artist']],
    'o_collage' => ['Collage · assemblage', 'Collages et assemblages', '✂️', 'visual', '', ['artist']],
    'o_fresque' => ['Fresque · peinture murale', 'Fresques et peintures murales', '🏛', 'visual', '', ['artist']],
    'o_streetart' => ['Street art · graffiti', 'Street art', '🧯', 'visual', '', ['artist']],
    'o_mosaique' => ['Mosaïque', 'Mosaïques', '◼️', 'visual', '', ['artist']],
    'o_vitrail' => ['Vitrail', 'Vitraux', '🪟', 'visual', '', ['artist']],
    'o_icone' => ['Icône · enluminure', 'Icônes et enluminures', '📜', 'visual', '', ['artist']],
    'o_calligraphie' => ['Calligraphie', 'Calligraphies', '🖋', 'visual', '', ['artist']],
    'o_illustration' => ['Illustration', 'Illustrations', '🖍', 'visual', '', ['artist']],
    'o_landart' => ['Land art', 'Land art', '🌾', 'visual', '', ['artist']],
    'o_performance' => ['Performance', 'Performances', '🧍', 'visual', '', ['artist']],
    'o_symphonie' => ['Symphonie', 'Symphonies', '🎼', 'music', '', ['artist']],
    'o_sonate' => ['Sonate · musique de chambre', 'Sonates, musique de chambre', '🎹', 'music', '', ['artist']],
    'o_savante' => ['Œuvre de musique savante', 'Musique savante', '🎼', 'music', '', ['artist']],
    'o_opera' => ['Opéra (partition)', 'Opéras', '🎭', 'music', '', ['artist']],
    'o_oratorio' => ['Oratorio · cantate · messe', 'Oratorios, cantates, messes', '⛪', 'music', '', ['artist']],
    'o_musfilm' => ['Musique de film', 'Musiques de film', '🎞', 'music', '', ['artist']],
    'o_musscene' => ['Musique de scène · de ballet', 'Musiques de scène et de ballet', '🩰', 'music', '', ['artist']],
    'o_arrangement' => ['Arrangement · orchestration', 'Arrangements', '📝', 'music', '', ['artist']],
    'o_jingle' => ['Indicatif · jingle', 'Indicatifs et jingles', '📻', 'music', '', ['artist']],
    'o_hymne' => ['Hymne · fanfare · chorale', 'Hymnes, marches, chœurs', '🎺', 'music', '', ['artist']],
    'o_partition' => ['Partition éditée', 'Partitions éditées', '📄', 'music', '', ['artist']],
    'o_opera_prod' => ['Opéra (production)', 'Productions d’opéra', '🎭', 'stage', 'o_opera', ['artist']],
    'o_ballet' => ['Ballet · danse', 'Ballets', '🩰', 'stage', '', ['artist']],
    'o_comedie_musicale' => ['Comédie musicale', 'Comédies musicales', '🎶', 'stage', '', ['artist']],
    'o_seul_en_scene' => ['Seul en scène · humour', 'Spectacles d’humour', '🎤', 'stage', '', ['artist']],
    'o_cirque' => ['Numéro de cirque', 'Arts du cirque', '🎪', 'stage', '', ['artist']],
    'o_marionnettes' => ['Spectacle de marionnettes', 'Marionnettes', '🪆', 'stage', '', ['artist']],
    'o_cabaret' => ['Cabaret · revue · music-hall', 'Cabarets et revues', '💃', 'stage', '', ['artist']],
    'o_conte' => ['Conte · récit', 'Contes et récits', '📖', 'stage', '', ['artist']],
    'o_magie' => ['Numéro de magie', 'Magie et illusion', '🎩', 'stage', '', ['artist']],
    'o_lecture' => ['Lecture · mise en voix', 'Lectures', '🗣', 'stage', '', ['artist']],
    'o_rue' => ['Spectacle de rue', 'Spectacles de rue', '🚶', 'stage', '', ['artist']],
    'o_son_lumiere' => ['Son et lumière · fête', 'Fêtes, sons et lumières', '🎆', 'stage', '', ['artist']],
    'o_festival' => ['Festival', 'Festivals', '🎪', 'stage', '', ['artist']],
    'o_recueil' => ['Recueil de poésie', 'Recueils de poésie', '📖', 'writing', '', ['artist']],
    'o_poeme' => ['Poème', 'Poèmes', '🪶', 'writing', '', ['artist']],
    'o_article' => ['Article · chronique', 'Articles', '📰', 'writing', '', ['artist']],
    'o_essai' => ['Essai · thèse · mémoire', 'Essais, thèses, mémoires', '🎓', 'writing', '', ['artist']],
    'o_paroles' => ['Paroles de chanson', 'Paroles de chanson', '🎶', 'writing', '', ['artist']],
    'o_scenario' => ['Scénario', 'Scénarios', '🎬', 'writing', '', ['artist']],
    'o_livret' => ['Livret (opéra, ballet)', 'Livrets', '📜', 'writing', '', ['artist']],
    'o_bd' => ['Bande dessinée', 'Bandes dessinées', '💬', 'writing', '', ['artist']],
    'o_traduction' => ['Traduction', 'Traductions', '🌐', 'writing', '', ['artist']],
    'o_correspondance' => ['Correspondance publiée', 'Correspondances', '✉️', 'writing', '', ['artist']],
    'o_revue' => ['Revue · fanzine fondé', 'Revues fondées', '🗞', 'writing', '', ['artist']],
    'o_collectif' => ['Ouvrage collectif · dictionnaire', 'Ouvrages collectifs', '📕', 'writing', '', ['artist']],
    'o_discours' => ['Discours (texte)', 'Discours', '🗣', 'writing', '', ['artist']],
    'o_court' => ['Court métrage', 'Courts métrages', '🎞', 'screen', '', ['artist']],
    'o_documentaire' => ['Documentaire', 'Documentaires', '🎥', 'screen', '', ['artist']],
    'o_animation' => ['Cinéma d’animation', 'Films d’animation', '🐭', 'screen', '', ['artist']],
    'o_serie' => ['Série TV', 'Séries TV', '📺', 'screen', '', ['artist']],
    'o_emission_tv' => ['Émission de télévision', 'Émissions de télévision', '📺', 'screen', '', ['artist']],
    'o_emission_radio' => ['Émission de radio', 'Émissions de radio', '📻', 'screen', '', ['artist']],
    'o_podcast' => ['Podcast', 'Podcasts', '🎧', 'screen', '', ['artist']],
    'o_feuilleton' => ['Feuilleton radio', 'Feuilletons radio', '📻', 'screen', '', ['artist']],
    'o_clip' => ['Clip vidéo', 'Clips', '📹', 'screen', '', ['artist']],
    'o_pub' => ['Film publicitaire', 'Films publicitaires', '📢', 'screen', '', ['artist']],
    'o_amateur' => ['Film amateur · de famille', 'Films amateurs', '📼', 'screen', '', ['artist']],
    'o_video' => ['Vidéo en ligne', 'Vidéos en ligne', '▶️', 'screen', '', ['artist']],
    'o_doublage' => ['Doublage · voix', 'Doublages et voix', '🗣', 'screen', '', ['artist']],
    'o_logo' => ['Logo · identité visuelle', 'Logos', '🔤', 'design', '', ['artist']],
    'o_police' => ['Police de caractères', 'Polices de caractères', '🅰️', 'design', '', ['artist']],
    'o_design' => ['Design d’objet', 'Objets (design)', '🪑', 'design', '', ['artist']],
    'o_mode' => ['Mode (collection → modèle)', 'Collections de mode', '👗', 'design', '', ['artist']],
    'o_ceramique' => ['Céramique · faïence · porcelaine', 'Céramiques', '🏺', 'design', '', ['artist']],
    'o_verre' => ['Verre · cristal', 'Pièces de verre', '🫙', 'design', '', ['artist']],
    'o_orfevrerie' => ['Orfèvrerie · bijou', 'Pièces d’orfèvrerie et bijoux', '💍', 'design', '', ['artist']],
    'o_tapisserie' => ['Tapisserie · tissage', 'Tapisseries et tissages', '🧵', 'design', '', ['artist']],
    'o_broderie' => ['Broderie · dentelle', 'Broderies et dentelles', '🪡', 'design', '', ['artist']],
    'o_ebenisterie' => ['Ébénisterie · marqueterie', 'Meubles', '🪵', 'design', '', ['artist']],
    'o_reliure' => ['Reliure', 'Reliures', '📕', 'design', '', ['artist']],
    'o_lutherie' => ['Instrument (lutherie, facture)', 'Instruments', '🎻', 'design', '', ['artist']],
    'o_horlogerie' => ['Horlogerie', 'Pièces d’horlogerie', '🕰', 'design', '', ['artist']],
    'o_medaille' => ['Médaille · sceau', 'Médailles et sceaux', '🏅', 'design', '', ['artist']],
    'o_exlibris' => ['Ex-libris', 'Ex-libris', '🔖', 'design', '', ['artist']],
    'o_piece_art' => ['Pièce de métier d’art', 'Pièces de métiers d’art', '⚒️', 'design', '', ['artist']],
    'o_architecture' => ['Architecture · bâtiment', 'Bâtiments', '🏠', 'space', '', ['artist']],
    'o_jardin' => ['Jardin · paysage', 'Jardins', '🌳', 'space', '', ['artist']],
    'o_urbanisme' => ['Urbanisme · aménagement', 'Aménagements', '🗺', 'space', '', ['artist']],
    'o_monument' => ['Monument · mémorial', 'Monuments', '🗽', 'space', '', ['artist']],
    'o_decor' => ['Décor · scénographie', 'Décors', '🎭', 'space', '', ['artist']],
    'o_deco_interieure' => ['Décoration intérieure', 'Décorations intérieures', '🛋', 'space', '', ['artist']],
    'o_ouvrage_art' => ['Ouvrage d’art (pont…)', 'Ouvrages d’art', '🌉', 'space', '', ['artist']],
    'o_jeu_video' => ['Jeu vidéo', 'Jeux vidéo', '🕹', 'digital', '', ['artist']],
    'o_jeu_societe' => ['Jeu de société', 'Jeux de société', '🎲', 'digital', '', ['artist']],
    'o_jdr' => ['Jeu de rôle · scénario', 'Jeux de rôle', '🐉', 'digital', '', ['artist']],
    'o_logiciel' => ['Logiciel · application', 'Logiciels', '💾', 'digital', '', ['artist']],
    'o_site' => ['Site web', 'Sites web', '🌐', 'digital', '', ['artist']],
    'o_art_numerique' => ['Art numérique · génératif', 'Œuvres numériques', '✨', 'digital', '', ['artist']],
    'o_modele3d' => ['Modèle 3D', 'Modèles 3D', '🧊', 'digital', '', ['artist']],
    'o_maquette' => ['Maquette · modèle réduit', 'Maquettes', '✈️', 'hobby', '', ['artist']],
    'o_reseau' => ['Réseau ferroviaire miniature', 'Réseaux miniatures', '🚂', 'hobby', '', ['artist']],
    'o_diorama' => ['Diorama', 'Dioramas', '🏞', 'hobby', '', ['artist']],
    'o_figurine' => ['Figurine peinte', 'Figurines', '🪖', 'hobby', '', ['artist']],
    'o_automate' => ['Automate', 'Automates', '⚙️', 'hobby', '', ['artist']],
    'o_tricot' => ['Tricot · couture (patron)', 'Tricots et coutures', '🧶', 'hobby', '', ['artist']],
    'o_scrapbook' => ['Album · scrapbooking', 'Albums', '📒', 'hobby', '', ['artist']],
    'o_florale' => ['Création florale', 'Créations florales', '💐', 'hobby', '', ['artist']],
    'o_recette' => ['Recette · plat créé', 'Recettes', '🍲', 'taste', '', ['artist']],
    'o_cuvee' => ['Cuvée · spiritueux', 'Cuvées', '🍷', 'taste', '', ['artist']],
    'o_parfum' => ['Parfum', 'Parfums', '🌹', 'taste', '', ['artist']],
    'o_terroir' => ['Produit du terroir', 'Produits du terroir', '🧀', 'taste', '', ['artist']],
    'o_variete' => ['Variété créée (rose, pomme…)', 'Variétés créées', '🍎', 'taste', '', ['artist']],
    'o_prix' => ['Prix · concours', 'Prix et concours', '🏆', 'link', '', ['artist']],
    'o_serie_coll' => ['Série · collection', 'Séries et collections', '🗂', 'link', '', ['artist']],
    'o_commande' => ['Commande · mécène', 'Commandes et mécènes', '🤝', 'link', '', ['artist']],
    'o_atelier' => ['Atelier · studio', 'Ateliers et studios', '🏚', 'link', '', ['artist']],
    'profile_artisan' => ['Profil d’artisan d’art', 'Profils d’artisans d’art', '🔨', 'profile', '', ['artisan']],
];

$GLOBALS['ART_EXTRA_TYPES'] = (is_array($GLOBALS['ART_EXTRA_TYPES'] ?? null) ? $GLOBALS['ART_EXTRA_TYPES'] : []) + OEUVRES_TYPES;

/** les types d'œuvres de ce domaine (clé => [nom, pluriel, icône, famille, parent, profils]) */
function oeuvres_types(): array { return OEUVRES_TYPES; }

/** la ligne item_types d'un type de ce domaine (et le nom du profil « artisan d'art ») ; appelée après l'enregistrement d'une fiche */
function oeuvres_register_type(PDO $pdo, string $kind): void
{
    $t = OEUVRES_TYPES[$kind] ?? null;
    if (!$t) { return; }
    $pdo->prepare("INSERT OR IGNORE INTO item_types(key, label, plural, icon, family, domain, parent_type, origin) VALUES(?,?,?,?,?,?,?,'builtin')")
        ->execute([$kind, $t[0], $t[1], $t[2], $t[3], $t[3], $t[4]]);
    if ($kind === 'profile_artisan') {
        $pdo->prepare("INSERT INTO profiles(key, label, icon, origin) VALUES('artisan', ?, '🔨', 'builtin') ON CONFLICT(key) DO UPDATE SET label=excluded.label, icon=excluded.icon WHERE profiles.label IN ('', 'artisan')")->execute(['Artisan d’art']);
    }
}

/** la petite ligne grise d'une fiche (menu de choix, « Lié à ») */
function oeuvres_subline(array $d, string $kind): string
{
    if (!isset(OEUVRES_TYPES[$kind])) { return ''; }
    $s = static function ($v): string {
        if (is_scalar($v)) { return trim((string) $v); }
        if (is_array($v)) { return trim((string) ($v['title'] ?? $v['txt'] ?? '')); }
        return '';
    };
    $keys = match ($kind) {
        'o_sculpture' => ['material', 'edition_plan'], 'o_cast' => ['no', 'founder', 'date'], 'o_affiche' => ['printer', 'format'],
        'o_concerto', 'o_symphonie', 'o_sonate', 'o_savante', 'o_opera', 'o_oratorio' => ['catno', 'tonality'],
        'o_piece' => ['author', 'genre'], 'o_mes' => ['company', 'date'], 'o_representation' => ['date', 'place', 'venue'], 'o_tournee' => ['date'],
        'o_ferronnerie', 'o_piece_art', 'o_ceramique', 'o_verre', 'o_orfevrerie', 'o_tapisserie', 'o_broderie', 'o_ebenisterie', 'o_reliure', 'o_lutherie', 'o_horlogerie' => ['metier', 'material', 'installed'],
        default => ['date', 'technique', 'place'],
    };
    return mb_substr(implode(' · ', array_values(array_filter(array_map(static fn($k) => $s($d[$k] ?? null), $keys), static fn($v) => $v !== ''))), 0, 160);
}

/** un type de ce domaine (art_kind_ok de lib/art_engine.php) */
function oeuvres_kind_ok(string $kind): bool { return isset(OEUVRES_TYPES[$kind]); }
