<?php
declare(strict_types=1);

/**
 * 📱 Le téléphone par le wifi : la SEULE adresse de PHP qu'un téléphone de terrain peut joindre (la porte du wifi,
 * electron/lan-gate.js, et lib/reseau_local.php refusent tout le reste). Liste blanche des actions : lib/telephone_wifi.php
 * (TW_PHONE_ACTIONS) — lire son état, ouvrir sa séance avec le mot de passe, la liste réduite « Pour qui ? », déposer une
 * photo dans 📥 À trier, ↶ Annuler son propre envoi. Rien d'autre.
 */
require __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/telephone_wifi.php';
tw_phone_main();
