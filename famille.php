<?php
declare(strict_types=1);

/**
 * 👪 Le site familial (partie maison) : la SEULE adresse de PHP qu'un appareil relié à un compte de la famille peut joindre
 * (lib/reseau_local.php). Liste blanche des actions : lib/comptes_famille.php (FC_GUEST_ACTIONS) — chacune vérifie les droits du
 * compte côté serveur. Sa séance est à part (cookie « lcnda_famille ») : jamais celle de l'ordinateur principal.
 */
session_name('lcnda_famille');
require __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/comptes_famille.php';
fc_guest_main();
