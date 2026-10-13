<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
$ready = is_file(DB_PATH);
if ($ready) {
    // Le fichier peut exister sans contenir de généalogie : une simple analyse de
    // fichier sur l'écran d'installation (ou un import qui a échoué en cours de route)
    // crée déjà le fichier SQLite vide. Dans ce cas on doit rester sur l'écran
    // d'installation au lieu de basculer sur une application sans aucune personne.
    try {
        $readyCheckPdo = new PDO('sqlite:' . DB_PATH, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $ready = (int) $readyCheckPdo->query('SELECT count(*) FROM persons')->fetchColumn() > 0;
    } catch (Throwable $e) {
        $ready = false;
    }
}
$installCsrf = csrf_token();
header('Cache-Control: no-store, private');
?>
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>Carnet numérique des ancêtres</title>
    <link rel="stylesheet" href="assets/css/app.css?v=199">
    <link rel="stylesheet" href="assets/css/heritage.css?v=60">
    <link rel="stylesheet" href="assets/css/museum.css?v=1">
    <link rel="stylesheet" href="assets/css/diagrams.css?v=29">
</head></html>
<body>
<div class="app-shell<?= $ready ? '' : ' is-not-ready' ?>" id="app">
    <header class="topbar">
        <a class="brand" href="#dashboard" aria-label="Accueil de la généalogie">
            <span id="brand-firstname">MA</span><strong id="brand-lastname">FAMILLE</strong><small>GÉNÉALOGIE</small>
        </a>
        <nav class="main-nav" aria-label="Navigation principale">
            <button class="nav-item is-active" data-module="dashboard"><span>01</span>Tableau de bord</button>
            <button class="nav-item" data-module="personnes"><span>02</span>Personnes</button>
            <button class="nav-item" data-module="graphiques"><span>03</span>Graphiques</button>
            <button class="nav-item" data-module="carte"><span>04</span>Carte</button>
            <button class="nav-item" data-module="listes"><span>05</span>Listes</button>
            <button class="nav-item" data-module="chronologie"><span>06</span>Chronologie</button>
            <button class="nav-item" data-module="recherche"><span>07</span>Recherche</button>
            <button class="nav-item" data-module="enquetes"><span>08</span>Enquêtes</button>
            <button class="nav-item" data-module="comparaison"><span>09</span>Comparaison</button>
            <button class="nav-item" data-module="maintenance"><span>10</span>Maintenance</button>
        </nav>
        <div class="topbar-meta">
            <button type="button" class="screen-tool" id="side-panel-open" title="Diviser l’écran en deux (⇧ + Entrée dans la recherche rapide ⌘K)" aria-label="Diviser l’écran en deux"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" stroke-width="2"/></svg></button>
            <button type="button" class="screen-tool" id="new-window-open" title="Ouvrir cet écran dans une nouvelle fenêtre" aria-label="Ouvrir dans une nouvelle fenêtre"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="7" width="14" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 4h10v10" fill="none" stroke="currentColor" stroke-width="2"/><line x1="20" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="2"/></svg></button>
            <button type="button" class="screen-tool" id="kiosk-toggle" title="Mode consultation : la famille peut tout parcourir sans rien modifier" aria-label="Mode consultation"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></button>
            <span class="status-dot"></span>
            <span id="database-status">Base locale</span>
        </div>
    </header>

    <aside class="sidebar" id="sidebar">
        <div class="sidebar-top">
            <div>
                <span class="eyebrow" id="sidebar-index">01 — EXPLORER</span>
                <h1 id="sidebar-title">Personnes</h1>
            </div>
            <button class="icon-button sidebar-toggle" id="sidebar-toggle" aria-label="Replier la liste" title="Replier la liste">←</button>
        </div>
        <div id="sidebar-content" class="sidebar-content">
            <div class="loading-block">Chargement de la base…</div>
        </div>
        <div class="sidebar-footer" id="sidebar-footer"></div>
    </aside>

    <main class="workspace" id="workspace" tabindex="-1">
        <?php if (!$ready): ?>
            <section class="empty-state install-screen" id="install-screen">
                <span class="eyebrow">INSTALLATION</span>
                <h2>La base généalogique doit être importée.</h2>
                <p>Choisis comment démarrer : importer un fichier existant, ou créer une première personne pour partir d'une base vide.</p>

                <div class="install-options">
                    <div class="install-card">
                        <h3>Importer un fichier</h3>
                        <p class="muted">GEDCOM (.ged), Hérédis (.hmw ou .heredis), MacFamilyTree (.mftpkg), base LCNDA (.db) ou sauvegarde complète LCNDA (.zip, base + médias). Les fichiers JSON et CSV sont analysés mais pas encore importés.</p>
                        <form id="install-import-form" class="import-form">
                            <label>Fichier
                                <input type="file" name="file" accept=".ged,.gedcom,.heredis,.mftpkg,.zip,.gdz,.json,.csv,.db,.sqlite">
                            </label>
                            <button class="button" type="submit">Importer</button>
                        </form>
                        <div id="install-import-result"></div>
                    </div>

                    <div class="install-card">
                        <h3>Créer une première personne</h3>
                        <p class="muted">Initialise une base vide avec une première fiche, à compléter ensuite.</p>
                        <form id="install-person-form" class="import-form">
                            <label>Prénom <input type="text" name="first_name" autocomplete="off"></label>
                            <label>Nom <input type="text" name="last_name" autocomplete="off"></label>
                            <button class="button secondary" type="submit">Créer et ouvrir la base</button>
                        </form>
                        <div id="install-person-result"></div>
                    </div>
                </div>
            </section>
        <?php else: ?>
            <section class="loading-screen">
                <div class="loading-mark">VB</div>
                <p>Ouverture de la généalogie…</p>
            </section>
        <?php endif; ?>
    </main>

    <button class="sidebar-reopen" id="sidebar-reopen" aria-label="Afficher la liste">Liste →</button>
</div>

<div class="toast-region" id="toast-region" aria-live="polite"></div>

<dialog class="modal" id="person-dialog">
    <form method="dialog" id="person-form">
        <div class="modal-head"><div><span class="eyebrow">IDENTITÉ</span><h2 id="person-dialog-title">Modifier la personne</h2></div><button class="icon-button" value="cancel" aria-label="Fermer">×</button></div>
        <input type="hidden" name="id">
        <div class="form-grid">
            <label>Prénom<input name="first_name" autocomplete="off"></label>
            <label>Autres prénoms<input name="middle_name" autocomplete="off"></label>
            <label>Nom inscrit<input name="last_name" autocomplete="off"></label>
            <label style="display:none" aria-hidden="true">Groupe patronymique<select name="surname_group_id"></select></label>
            <label>Préfixe<input name="prefix"></label>
            <label>Suffixe<input name="suffix"></label>
            <label>Genre<select name="gender"><option value="unknown">Non renseigné</option><option value="male">Masculin</option><option value="female">Féminin</option><option value="nonbinary">Autre / non binaire</option></select></label>
            <label>Statut<select name="living_status"><option value="unknown">À vérifier</option><option value="living">Vivante</option><option value="deceased">Décédée</option></select></label>
            <label>Mode vérification<select name="verify_status"><option value="normal">Normal</option><option value="verify">À vérifier</option></select></label>
            <label>Métier / activité<input name="occupation"></label>
            <label>Taille<input name="height_text" placeholder="1,72 m, grande, inconnue…"></label>
            <label>Nationalité<input name="nationality"></label>
            <label>Couleur des yeux<input name="eye_color"></label>
            <label>Couleur de peau<input name="skin_color"></label>
            <label>Origine / mention ethnique<input name="ethnicity"></label>
            <label>Mort Pour La France<select name="mort_pour_la_france"><option value="unknown">Inconnu</option><option value="yes">Oui</option><option value="no">Non</option><option value="na">Non applicable</option></select></label>
            <label class="span-2">Description physique<textarea name="physical_description" rows="3"></textarea></label>
            <label class="span-2">N° de référence<input name="reference_number"></label>
            <label class="span-2">Groupe patronymique <small style="font-weight:normal;color:#666">(choisir un existant ou taper un nouveau nom pour le créer)</small><div class="place-input-wrap" style="position:relative"><input name="new_surname_group" autocomplete="off" placeholder="ex : Dupont" id="new-surname-group-input"><div class="place-suggestions" id="surname-group-suggestions" hidden></div></div></label>
            <label class="span-2 checkbox-line" id="person-artist-line"><input type="checkbox" name="is_artist" value="1" id="person-is-artist"> Artiste <small style="font-weight:normal;color:#666">(photographe, peintre, écrivain, cinéaste, sculpteur, dramaturge, poète, vidéaste, plasticien, danseur, acteur…)</small>
                <span id="person-artist-discipline-wrap" style="display:none;margin-left:.6rem">
                    <select name="artist_discipline" id="person-artist-discipline" style="font-size:.85em">
                        <option value="">— Discipline —</option>
                        <option value="photographe">Photographe</option>
                        <option value="peintre">Peintre</option>
                        <option value="ecrivain">Écrivain</option>
                        <option value="cineaste">Cinéaste</option>
                        <option value="sculpteur">Sculpteur</option>
                        <option value="dramaturge">Dramaturge</option>
                        <option value="poete">Poète</option>
                        <option value="videaste">Vidéaste</option>
                        <option value="plasticien">Plasticien</option>
                        <option value="danseur">Danseur</option>
                        <option value="acteur">Acteur</option>
                    </select>
                </span>
            </label>
            <div class="span-2" id="person-artist-display-wrap" style="display:none">
                <label style="display:inline-flex;align-items:center;gap:.5rem;font-size:.88em">Afficher les événements artistiques dans :
                    <select name="artist_events_display" id="person-artist-events-display" style="font-size:.9em">
                        <option value="events">Le bloc Événements</option>
                        <option value="block">Un bloc Œuvres à part</option>
                        <option value="both">Les deux</option>
                    </select>
                </label>
            </div>
            <input type="hidden" name="heritage_flags" value="1">
            <div class="span-2 person-heritage-flags">
                <span class="person-heritage-flags-title">Blocs à afficher sur la fiche</span>
                <label class="checkbox-line"><input type="checkbox" name="outside_genealogy" value="1"> Hors de ma généalogie <small style="font-weight:normal;color:#666">(individu utile pour une enquête, mais pas dans ma lignée directe)</small></label>
                <div id="person-military-toggle-wrap" style="display:none">
                    <label class="checkbox-line" id="person-military-toggle-label">
                        <input type="checkbox" name="show_military_block" value="1" id="person-show-military">
                        🎖 Afficher le bloc militaire
                        <small style="font-weight:normal;color:#666">(informations du registre matricule)</small>
                    </label>
                    <p id="person-military-disabled-hint" style="display:none;margin:.3rem 0 0 1.6rem;font-size:.8em;color:#c00">Activez le bloc militaire dans Maintenance → Ordre et visibilité des blocs avant de pouvoir cocher cette option.</p>
                </div>
                <label class="checkbox-line"><input type="checkbox" name="show_voyage_block" value="1"> 🚢 Départs / émigration <small style="font-weight:normal;color:#666">(voyage, port, navire, destination, liste de passagers, naturalisation, papiers d’émigration, trajet sur la carte)</small></label>
                <label class="checkbox-line"><input type="checkbox" name="show_placement_block" value="1"> 👶 Enfant placé <small style="font-weight:normal;color:#666">(mis en nourrice, abandonné, recueilli par l’hospice : lieu, durée, carte)</small></label>
                <label class="checkbox-line"><input type="checkbox" name="show_heraldry_block" value="1"> 🛡️ Noblesse / blason <small style="font-weight:normal;color:#666">(armoiries portées : image, blasonnement, devise, titre)</small></label>
                <label class="checkbox-line"><input type="checkbox" name="show_poilu_block" value="1"> 🎖️ Poilu 14-18 <small style="font-weight:normal;color:#666">(régiments, blessures, journaux de marche et opérations)</small></label>
                <label class="checkbox-line"><input type="checkbox" name="show_resistance_block" value="1"> ✊ Résistant <small style="font-weight:normal;color:#666">(réseau, nom de guerre, arrestation, caches, parcours jour par jour sur la carte, compagnons)</small></label>
                <label class="checkbox-line"><input type="checkbox" name="show_voter_block" value="1"> 🗳️ Cartes d’électeur <small style="font-weight:normal;color:#666">(cartes avec photos, commune, bureau de vote, numéros, et toutes les dates où la personne a voté)</small></label>
                <label class="checkbox-line"><input type="checkbox" name="show_language_block" value="1"> 🗣️ Langues <small style="font-weight:normal;color:#666">(langues parlées par la personne et sa descendance ; s’affiche aussi tout seul quand une langue est connue)</small></label>
            </div>
        </div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div>
    </form>
</dialog>

<dialog class="modal" id="military-dialog">
    <form method="dialog" id="military-form">
        <div class="modal-head"><div><span class="eyebrow">MILITAIRE</span><h2 id="military-dialog-title">Informations militaires</h2></div><button class="icon-button" value="cancel" aria-label="Fermer">×</button></div>
        <input type="hidden" name="person_id">

        <div class="form-section-label" style="margin:0 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Documents</div>
        <div class="form-grid">
            <div class="span-2" id="military-media-list"></div>
            <div class="span-2"><button type="button" class="button small secondary" id="military-manage-media-btn">+ Ajouter ou lier un média</button></div>
        </div>

        <div class="form-section-label" style="margin:0 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Matricule &amp; Recrutement</div>
        <div class="form-grid">
            <label>N° matricule de recrutement<input name="matricule" placeholder="950"></label>
            <label>Classe de mobilisation<input name="classe_mobilisation" placeholder="1896"></label>
            <label class="span-2">Bureau de recrutement<input name="bureau_recrutement" placeholder="Tours, Paris…"></label>
        </div>

        <div class="form-section-label" style="margin:1rem 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Décision du Conseil de Révision</div>
        <div class="form-grid">
            <label class="span-2">Décision et motifs<textarea name="decision_conseil" rows="2" placeholder="Propre au service armé…"></textarea></label>
            <label class="span-2">Compris dans la … partie de la liste<input name="compris_liste" placeholder="1ère partie, 1ère portion…"></label>
        </div>

        <div class="form-section-label" style="margin:1rem 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Signalement physique</div>
        <div class="form-grid">
            <label>Cheveux<input name="cheveux" placeholder="châtain, brun…"></label>
            <label>Sourcils<input name="sourcils" placeholder="châtain clair…"></label>
            <label>Yeux<input name="yeux" placeholder="bleus, marron…"></label>
            <label>Front<input name="front" placeholder="ordinaire, large…"></label>
            <label>Nez<input name="nez" placeholder="pointu, ordinaire…"></label>
            <label>Bouche<input name="bouche" placeholder="moyenne, grande…"></label>
            <label>Menton<input name="menton" placeholder="rond, carré…"></label>
            <label>Visage<input name="visage" placeholder="ovale, rond…"></label>
            <label>Taille<input name="taille" placeholder="1 m 72 cm"></label>
            <label class="span-2">Marques particulières<input name="marques_particulieres" placeholder="cicatrice au front gauche…"></label>
            <label>Degré d'instruction générale<input name="degre_instruction_gen" placeholder="3, sait lire…"></label>
            <label>Degré d'instruction militaire<input name="degre_instruction_mil" placeholder="exercé, non exercé…"></label>
        </div>

        <div class="form-section-label" style="margin:1rem 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Corps d'affectation</div>
        <div class="form-grid">
            <label class="span-2">Dans l'armée active<input name="corps_armee_active" placeholder="90e Rgt d'Inf., 2e Rgt d'Art. de Marine…"></label>
            <label class="span-2">Dans la disponibilité / réserve de l'armée active<input name="corps_disponibilite" placeholder="2e d'Art. de Marine…"></label>
            <label class="span-2">Dans l'armée territoriale et sa réserve<input name="corps_territoriale" placeholder="Groupe 6e du 3e Rgt d'Art. à pied…"></label>
        </div>

        <div class="form-section-label" style="margin:1rem 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Époques de passage</div>
        <div class="form-grid">
            <label>Entrée dans l'armée active<input name="date_entree_active" placeholder="15 novembre 1897…"></label>
            <label>Passé dans la disponibilité<input name="date_disponibilite" placeholder="1er oct. 1900…"></label>
            <label>Passé dans la réserve active<input name="date_reserve" placeholder="1er oct. 1910…"></label>
            <label>Passé dans l'armée territoriale<input name="date_territoriale" placeholder="1er oct. 1916…"></label>
            <label>Passé dans la réserve territoriale<input name="date_reserve_territ" placeholder="1er oct. 1920…"></label>
            <label>Libération du service militaire<input name="date_liberation" placeholder=""></label>
        </div>

        <div class="form-section-label" style="margin:1rem 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Détail des services et mutations diverses</div>
        <div class="form-grid">
            <label class="span-2">Campagnes, blessures, décorations, actions d'éclat…<textarea name="services_mutations" rows="5" placeholder="Arrivé au corps le 15 novembre 1897… Blessé le 9 septembre 1914, amputation…"></textarea></label>
        </div>

        <div class="form-section-label" style="margin:1rem 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Localités successives habitées</div>
        <div class="form-grid">
            <label class="span-2"><textarea name="localites_successives" rows="3" placeholder="25 oct. 1913 — Villaines s/ Seine — Fontainebleau…"></textarea></label>
        </div>

        <div class="form-section-label" style="margin:1rem 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Condamnations judiciaires</div>
        <div class="form-grid">
            <label class="span-2"><textarea name="condamnations" rows="2" placeholder="Condamné par jugement… du tribunal correctionnel de Tours…"></textarea></label>
        </div>

        <div class="form-section-label" style="margin:1rem 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Notes complémentaires</div>
        <div class="form-grid">
            <label class="span-2"><textarea name="notes_militaires" rows="3" placeholder="Remarques libres sur le dossier militaire…"></textarea></label>
        </div>

        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div>
    </form>
</dialog>

<dialog class="modal" id="grave-dialog">
    <form method="dialog" id="grave-form">
        <div class="modal-head"><div><span class="eyebrow">CIMETIÈRE</span><h2 id="grave-dialog-title">Sépulture</h2></div><button class="icon-button" value="cancel" aria-label="Fermer">×</button></div>
        <input type="hidden" name="grave_id">
        <input type="hidden" name="person_id">
        <input type="hidden" name="precise_lat">
        <input type="hidden" name="precise_lon">

        <div class="form-section-label" style="margin:0 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Localisation</div>
        <div class="form-grid">
            <label class="span-2">Cimetière<input name="cemetery_name" placeholder="Cimetière de…"></label>
            <label>Ville<input name="place_name" placeholder="Ville" autocomplete="off"><input type="hidden" name="place_id"></label>
            <label>Pays<input name="country" placeholder="France"></label>
            <label class="span-2">Adresse<input name="address" placeholder="Adresse du cimetière"></label>
            <label class="span-2">Emplacement / plan (division, carré, rangée, numéro…)<input name="plan_ref" placeholder="Division 4, carré B, rangée 3, tombe 12…"></label>
        </div>
        <div class="form-grid" id="grave-precise-block"></div>

        <div class="form-section-label" style="margin:1rem 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">État d'entretien</div>
        <div class="form-grid">
            <label>État<select name="condition_state">
                <option value="inconnu">Inconnu</option>
                <option value="bon">Bon état</option>
                <option value="moyen">État moyen</option>
                <option value="mauvais">Mauvais état</option>
                <option value="a_restaurer">À restaurer</option>
                <option value="disparu">Disparue</option>
            </select></label>
            <label class="span-2 checkbox-line"><input type="checkbox" name="grave_exists" value="1" checked> La sépulture existe encore aujourd'hui</label>
            <p class="form-help span-2">Si la tombe n'existe plus (reprise de concession, destruction…), décoche cette case : la sépulture reste consultable dans l'historique, et tu peux toujours y rattacher plusieurs personnes.</p>
        </div>

        <div class="form-section-label" style="margin:1rem 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Photos datées</div>
        <div class="form-grid">
            <div class="span-2" id="grave-media-list"></div>
            <div class="span-2"><button type="button" class="button small secondary" id="grave-manage-media-btn" disabled>+ Ajouter ou lier une photo</button></div>
        </div>

        <div class="form-section-label" style="margin:1rem 0 .5rem;font-size:.75em;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Notes</div>
        <div class="form-grid">
            <label class="span-2"><textarea name="notes" rows="3" placeholder="Remarques libres sur la sépulture…"></textarea></label>
        </div>

        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div>
    </form>
</dialog>

<dialog class="modal small-modal" id="grave-person-dialog">
    <form method="dialog" id="grave-person-form">
        <div class="modal-head"><div><span class="eyebrow">CIMETIÈRE</span><h2>Ajouter une personne à la sépulture</h2></div><button class="icon-button" value="cancel" aria-label="Fermer">×</button></div>
        <input type="hidden" name="grave_id">
        <input type="hidden" name="selected_person_id">
        <p class="form-help">Recherche une personne déjà présente dans l'arbre (tombe familiale accueillant plusieurs personnes).</p>
        <div class="form-grid">
            <label class="span-2">Rechercher une personne<input type="text" id="grave-person-search" placeholder="Prénom ou nom…" autocomplete="off"></label>
            <div class="span-2" id="grave-person-results"><p>Saisis au moins deux caractères.</p></div>
            <p class="span-2" id="grave-person-selected" hidden><span></span></p>
        </div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Ajouter</button></div>
    </form>
</dialog>

<dialog class="modal" id="event-dialog">
    <form method="dialog" id="event-form">
        <div class="modal-head"><div><span class="eyebrow">ÉVÉNEMENT</span><h2 id="event-dialog-title">Ajouter un événement</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="id">
        <input type="hidden" name="person_id">
        <input type="hidden" name="place_id">
        <input type="hidden" name="precise_lat">
        <input type="hidden" name="precise_lon">
        <input type="hidden" name="work_fields">
        <div class="form-grid">
            <label class="span-2" id="event-scope-field" hidden>Portée<select name="event_scope">
                <option value="person">Cette personne</option>
                <option value="family">Le couple / une union</option>
            </select></label>
            <label class="span-2" id="event-family-field" hidden>Union concernée<select name="family_id"></select></label>
            <label class="span-2">Type<select name="event_type_id"></select></label>
            <div class="span-2 event-work-fields" id="event-work-fields" hidden></div>
            <label>Prénom relevé<input name="first_name" autocomplete="off" placeholder="Prénom tel qu’il est dans l’acte"></label>
            <label>Nom relevé<input name="last_name" autocomplete="off" placeholder="Nom tel qu’il est dans l’acte"></label>
            <label>Date telle qu’elle est connue
                <div class="date-text-wrap">
                    <input name="date_text" placeholder="vers 1784, 7 mai 1925, 08/12/1960…" autocomplete="off">
                    <button type="button" class="icon-button date-picker-toggle" title="Choisir une date dans le calendrier" aria-label="Ouvrir le calendrier">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    </button>
                    <input type="date" class="date-picker-hidden" aria-hidden="true" tabindex="-1">
                </div>
            </label>
            <label class="checkbox-line date-uncertain-line" title="La date est douteuse : lecture difficile, sources qui se contredisent, âge recalculé…"><input type="checkbox" name="date_uncertain" value="1"> Date incertaine</label>
            <label>Calendrier de cette date<select name="date_calendar">
                <option value="gregorian">Grégorien</option>
                <option value="julian">Julien</option>
                <option value="republican">Républicain</option>
                <option value="islamic">Musulman</option>
                <option value="hebrew">Juif</option>
            </select></label>
            <label>Équivalence automatique<input name="date_converted" readonly placeholder="Calculée si la date est reconnue"></label>
            <label>Date alternative / équivalence<input name="date_alternative" placeholder="Note manuelle, autre lecture…"></label>
            <label>Titre ou précision<input name="title"></label>
            <label>Lieu<input name="place_name" placeholder="Saint-Amand-Montrond" autocomplete="off" data-place-autocomplete></label>
            <label>Pays<input name="country" value="France"></label>
            <label>Adresse<input name="address" placeholder="ex. 12 rue de l'Église" autocomplete="off"></label>
            <label>Informations complémentaires<input name="extra_info" placeholder="précisions sur le lieu, l'adresse…" autocomplete="off"></label>
            <div class="span-2 former-place-toggle-wrap">
                <button type="button" class="former-place-toggle" id="former-place-toggle" aria-expanded="false">
                    + Ancien nom ou ancien pays du lieu
                </button>
            </div>
            <div class="span-2 former-place-fields" id="former-place-fields" hidden>
                <div class="form-grid former-place-grid">
                    <label>Ancien nom du lieu<input name="former_place_name" placeholder="ex. Königsberg, Presbourg…" autocomplete="off"></label>
                    <label>Ancien pays<input name="former_country" placeholder="ex. Prusse, Empire austro-hongrois…"></label>
                </div>
            </div>
            <label class="span-2">Description<textarea name="description" rows="4"></textarea></label>
        </div>
        <div class="dialog-labels-block"><span class="section-label">Documents</span><div id="event-media-block"><div id="event-media-list"></div><button type="button" class="button small secondary" id="event-manage-media-btn">+ Ajouter ou lier un média</button></div></div>
        <div class="dialog-labels-block" id="event-sponsors-section" hidden><span class="section-label">Parrain/Marraine</span><div id="event-sponsors-block"><div id="event-sponsors-list"></div><button type="button" class="button small secondary" id="add-sponsor-btn">+ Ajouter un parrain / une marraine</button></div></div>
        <div class="dialog-labels-block"><span class="section-label">Témoins</span><div id="event-witnesses-block"><div id="event-witnesses-list"></div><button type="button" class="button small secondary" id="add-witness-btn">+ Ajouter un témoin</button></div></div>
        <div class="dialog-labels-block"><span class="section-label">Étiquettes</span><div id="event-label-picker"></div></div>
        <div class="dialog-labels-block event-confidence-block"><span class="section-label">Fiabilité du fait</span><div class="event-confidence-grid"><label>Niveau de confiance<select name="fact_confidence"><option value="unknown">Non évalué</option><option value="certain">Certain</option><option value="deduced">Déduit</option><option value="estimated">Estimé</option><option value="doubt">Doute</option></select></label><label>Origine / raisonnement<div class="place-input-wrap event-confidence-origin-wrap"><input name="confidence_origin" id="event-confidence-origin" placeholder="Ex. âge indiqué au mariage de son frère…" autocomplete="off"><div id="event-confidence-person-suggestions" class="place-suggestions" hidden></div></div><small class="form-help">Commence un prénom ou un nom à la fin de la phrase pour le compléter.</small></label><div class="span-2 event-confidence-media-field"><label for="event-confidence-media">Média de preuve <small>(facultatif)</small></label><label class="event-confidence-media-person">Recherche par personne <small>(facultatif)</small><div class="place-input-wrap"><input id="event-confidence-media-person-search" placeholder="Limiter aux médias d’une personne…" autocomplete="off"><div id="event-confidence-media-person-suggestions" class="place-suggestions" hidden></div></div></label><small class="form-help" id="event-confidence-media-scope-help">Laisse vide pour chercher dans tous les médias de la généalogie.</small><div class="place-input-wrap"><input id="event-confidence-media-search" placeholder="Rechercher un acte, une personne, une cote…" autocomplete="off"><div id="event-confidence-media-suggestions" class="place-suggestions" hidden></div></div><select name="confidence_media_id" id="event-confidence-media"><option value="">Aucun média précis</option></select><small class="form-help">Le lien déjà présent sur une autre fiche est conservé.</small></div></div></div>
        <div class="modal-actions"><button type="button" class="button secondary" id="open-event-type">Nouveau type</button><span class="spacer"></span><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button" id="event-submit">Ajouter</button></div>
    </form>
</dialog>

<dialog class="modal small-modal" id="media-dialog">
    <form method="dialog" id="media-form" enctype="multipart/form-data">
        <div class="modal-head"><div><span class="eyebrow">DOCUMENTS</span><h2 id="media-dialog-title">Ajouter des médias</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="person_id">
        <input type="hidden" name="investigation_id">
        <input type="hidden" name="battue_item_id">
        <div class="form-grid one-column">
            <label>Rattacher à<select name="event_id"><option value="">La fiche entière</option></select></label>
            <label id="media-census-label">Ou à un recensement<select name="census_id"><option value="">Aucun recensement</option></select></label>
            <label id="media-create-event-toggle" class="checkbox-line"><input type="checkbox" name="create_event" value="1"> Créer un événement pour ce média</label>
            <div id="media-create-event-fields" class="nested-fields" hidden>
                <label>Type d’événement<select name="create_event_type_id"></select></label>
                <label>Date<input name="create_event_date" placeholder="7 mai 1925"></label>
                <label>Titre<input name="create_event_title" placeholder="Acte trouvé, mention marginale…"></label>
                <label>Lieu<input name="create_event_place" placeholder="Saint-Amand-Montrond"></label>
                <label>Pays<input name="create_event_country" value="France"></label>
                <label>Description<textarea name="create_event_description" rows="3"></textarea></label>
            </div>
            <div id="media-correspondence-fields" class="nested-fields" hidden>
                <label>Type de correspondance<select name="correspondence_type">
                    <option value="lettre">Lettre</option>
                    <option value="carte_postale">Carte postale</option>
                    <option value="telegramme">Télégramme</option>
                    <option value="carte_voeux">Carte de vœux</option>
                    <option value="faire_part">Faire-part</option>
                    <option value="autre">Autre correspondance</option>
                </select></label>
                <label>Style personnalisé<input name="correspondence_type_custom" placeholder="ex. carte familiale, billet, invitation…"></label>
                <div class="correspondent-picker">
                    <span class="section-label-small">Destinataire(s) / expéditeur(s)</span>
                    <div class="map-route-person-chips correspondent-chips" id="media-correspondent-chips"></div>
                    <input type="text" id="media-correspondent-search" placeholder="Tape un nom pour retrouver une personne de l’arbre…" autocomplete="off">
                    <div class="relation-results correspondent-suggestions" id="media-correspondent-suggestions" hidden></div>
                    <input type="hidden" id="media-correspondent-value" name="correspondent_names" value="[]">
                </div>
                <label>Répond à<select name="correspondence_reply_to_media_id"><option value="">Aucune autre correspondance</option></select></label>
            </div>
            <label>Date du document
                <div class="date-text-wrap">
                    <input name="date_text" placeholder="vers 1917, 7 mai 1916, 08/12/1917…" autocomplete="off">
                    <button type="button" class="icon-button date-picker-toggle" title="Choisir une date dans le calendrier" aria-label="Ouvrir le calendrier">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    </button>
                    <input type="date" class="date-picker-hidden" aria-hidden="true" tabindex="-1">
                </div>
            </label>
            <label>Calendrier de cette date<select name="date_calendar">
                <option value="gregorian">Grégorien</option>
                <option value="julian">Julien</option>
                <option value="republican">Républicain</option>
            </select></label>
            <label>Titre commun<input name="title" placeholder="Acte de naissance, portrait…"></label>
            <label class="checkbox-line"><input type="checkbox" name="is_person_photo" value="1"> Photo de la personne</label>
            <label>Nature du média<select name="media_subject_type">
                <option value="">Document / média standard</option>
                <option value="grave_photo">Photo de tombe</option>
                <option value="war_memorial_photo">Photo de monument aux morts</option>
                <option value="voter_card">Carte d’électeur</option>
                <option value="id_card">Carte d’identité</option>
                <option value="driving_permit">Permis de conduire</option>
            </select></label>
            <label class="checkbox-line"><input type="checkbox" name="group_upload" value="1"> Regrouper les fichiers de cet upload dans un même média à faces multiples</label>
            <label class="checkbox-line" id="media-postcard-pair-label"><input type="checkbox" name="postcard_pair" value="1"> Carte postale recto/verso (2 images : recto puis verso)</label>
            <label>Référence / cote du document<input name="document_reference" placeholder="AD75, 5Mi…, registre 3E…"></label>
            <label>Nom du registre ou livre<input name="document_title" placeholder="Paris, Table décennale 1881-1891"></label>
            <label>Lien web<input name="document_url" type="url" placeholder="https://archives…"></label>
            <label>Page(s) ou vue(s)<input name="document_pages" placeholder="vue 12, pages 42-43"></label>
            <div class="media-upload-section">
                <span class="section-label-small">Fichiers à importer</span>
                <div class="media-upload-buttons">
                    <button type="button" class="button secondary media-pick-files-btn" id="media-pick-files-btn">
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="margin-right:.35em;vertical-align:-.15em"><path fill="none" stroke="currentColor" stroke-width="2" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline fill="none" stroke="currentColor" stroke-width="2" points="14 2 14 8 20 8"/></svg>
                        Fichiers…
                    </button>
                    <button type="button" class="button secondary media-pick-folder-btn" id="media-pick-folder-btn">
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="margin-right:.35em;vertical-align:-.15em"><path fill="none" stroke="currentColor" stroke-width="2" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>
                        Dossier…
                    </button>
                </div>
                <input id="media-files-input" name="files[]" type="file" accept="image/*,application/pdf,audio/*,video/*,.aif,.aiff,.aifc" multiple style="display:none">
                <input id="media-folder-input" type="file" accept="image/*,application/pdf,audio/*,video/*,.aif,.aiff,.aifc" multiple webkitdirectory style="display:none">
                <div id="media-files-preview" class="media-files-preview" hidden></div>
            </div>
            <div id="media-investigation-fields" hidden><label>Dossier de l’enquête<select name="investigation_folder_id"></select></label><label>Piste(s) concernée(s)<select name="investigation_item_ids[]" multiple size="6"></select></label><label>Classement<select name="investigation_verdict"><option value="interesting">Intéressant</option><option value="rejected">Rejeté</option></select></label><label>Pourquoi ?<textarea name="investigation_reason" rows="4" placeholder="Intéressant car la date indiquée est 1856…"></textarea></label></div>
        </div>
        <div class="dialog-labels-block"><span class="section-label">Étiquettes</span><div id="media-label-picker"></div></div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Importer</button></div>
    </form>
</dialog>

<dialog class="modal" id="online-sheet-dialog">
    <form method="dialog" id="online-sheet-form">
        <div class="modal-head"><div><span class="eyebrow">IDENTITÉ</span><h2 id="online-sheet-dialog-title">Ajouter une fiche en ligne</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="id">
        <input type="hidden" name="person_id">
        <div class="form-grid">
            <label>Nom de la fiche<input name="label" required placeholder="Geneanet — Jean Dupont, Filae…"></label>
            <label>Site / source<input name="site" placeholder="Geneanet, Filae, FamilySearch…"></label>
            <label class="span-2">Lien web<input name="url" type="url" placeholder="https://…"></label>
            <label class="span-2">Note<textarea name="notes" rows="3"></textarea></label>
        </div>
        <div class="dialog-labels-block online-sheet-search-block" id="online-sheet-search" hidden></div>
        <div class="dialog-labels-block">
            <span class="section-label">Vérification champ par champ</span>
            <p class="muted">Pour chaque information de cette fiche, indique si elle est exacte, inexacte, incomplète, approximative ou inconnue par rapport à ta fiche. Ajoute un commentaire si besoin (ex : « date de mariage inexacte : c’est 1892 et non 1898 »).</p>
            <div id="online-sheet-checks-list"></div>
            <button type="button" class="button small secondary" id="online-sheet-add-field">+ Ajouter un champ</button>
        </div>
        <div class="dialog-labels-block">
            <span class="section-label">Capture d’écran de l’arbre</span>
            <input type="hidden" name="screenshot_media_id">
            <div id="online-sheet-shot" class="online-sheet-shot"></div>
            <p class="online-sheet-shot-actions"><label class="button small secondary">Choisir une image<input type="file" accept="image/*" id="online-sheet-shot-file" hidden></label> <span class="muted">… ou colle une capture (⌘V / Ctrl+V) dans cette fenêtre. Elle est aussi rangée dans les médias de la fiche.</span></p>
        </div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button" id="online-sheet-submit">Enregistrer</button></div>
    </form>
</dialog>

<dialog class="modal small-modal" id="note-dialog">
    <form method="dialog" id="note-form">
        <div class="modal-head"><div><span class="eyebrow">RECHERCHE</span><h2 id="note-dialog-title">Ajouter une note</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="id">
        <input type="hidden" name="person_id">
        <div class="form-grid one-column"><label>Titre<input name="title"></label><label>Note<textarea name="body" rows="8" required></textarea></label></div>
        <div class="dialog-labels-block"><span class="section-label">Étiquettes</span><div id="note-label-picker"></div></div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button" id="note-submit">Ajouter</button></div>
    </form>
</dialog>

<dialog class="modal" id="source-dialog">
    <form method="dialog" id="source-form">
        <div class="modal-head"><div><span class="eyebrow">SOURCE</span><h2 id="source-dialog-title">Ajouter une source</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="id">
        <input type="hidden" name="link_id">
        <input type="hidden" name="person_id">
        <div class="form-grid">
            <label>Type de source<select name="source_type"><option value="internet">Source Internet</option><option value="book">Livre / registre papier</option><option value="archive">Archive sans média</option><option value="testimony">Témoignage</option><option value="other">Autre source</option></select></label>
            <label>Rattacher à<select name="entity_type"><option value="person">Toute la fiche</option><option value="event">Un événement précis</option></select></label>
            <label class="span-2" id="source-event-label">Événement<select name="event_id"></select></label>
            <label class="span-2">Titre de la source<input name="title" required placeholder="Fiche Geneanet, Paris Table décennale 1881-1891, livre familial…"></label>
            <label class="span-2">Lien web, si disponible<input name="url" type="url" placeholder="https://…"></label>
            <label>Site, archive ou éditeur<input name="website" placeholder="Geneanet, Archives départementales, éditeur…"></label>
            <label>Auteur, contributeur ou déposant<input name="author"></label>
            <label>Date de consultation / publication<input name="accessed_at" placeholder="2026-06-23, 1881-1891…"></label>
            <label>Page ou référence<input name="page"></label>
            <label class="span-2">Informations relevées<textarea name="text" rows="5" placeholder="Résumé ou copie des informations utiles…"></textarea></label>
            <label class="span-2">Note personnelle<textarea name="note" rows="3"></textarea></label>
        </div>
        <div class="dialog-labels-block"><span class="section-label">Étiquettes</span><div id="source-label-picker"></div></div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button" id="source-submit">Ajouter la source</button></div>
    </form>
</dialog>

<dialog class="modal small-modal" id="event-type-dialog">
    <form method="dialog" id="event-type-form">
        <div class="modal-head"><div><span class="eyebrow">PERSONNALISATION</span><h2>Nouveau type</h2></div><button class="icon-button" value="cancel">×</button></div>
        <div class="form-grid one-column">
            <label>Nom du type<input name="label" required placeholder="Jugement de naissance"></label>
            <label>Portée<select name="scope"><option value="person">Personne</option><option value="family">Famille</option></select></label>
            <label>Couleur<input name="color" type="color" value="#0066cc"></label>
        </div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Créer</button></div>
    </form>
</dialog>

<dialog class="modal small-modal" id="relation-dialog">
    <form method="dialog" id="relation-form">
        <div class="modal-head"><div><span class="eyebrow">LIEN FAMILIAL</span><h2 id="relation-dialog-title">Ajouter une relation</h2></div><button class="icon-button" value="cancel" aria-label="Fermer">×</button></div>
        <input type="hidden" name="person_id">
        <input type="hidden" name="relation_type">
        <div class="form-grid one-column">
            <label>Utiliser<select name="entry_mode"><option value="existing">Une personne existante</option><option value="new">Créer une nouvelle personne</option><option value="none">Aucun</option><option value="none_suspected">Aucun suspecté</option></select></label>
            <div id="relation-existing-fields">
                <label>Rechercher par prénom ou nom<input id="relation-search" autocomplete="off" placeholder="Commence à saisir un nom…"></label>
                <div class="relation-results" id="relation-results"><p>Saisis au moins deux caractères.</p></div>
                <input type="hidden" name="related_id">
            </div>
            <div id="relation-new-fields" hidden>
                <div class="relation-new-grid"><label>Prénom<input name="new_first_name"></label><label>Nom<input name="new_last_name"></label></div>
                <label>Genre<select name="new_gender"><option value="unknown">Non renseigné</option><option value="male">Masculin</option><option value="female">Féminin</option><option value="nonbinary">Autre / non binaire</option></select></label>
                <label>Statut<select name="new_living_status"><option value="unknown">À vérifier</option><option value="living">Vivante</option><option value="deceased">Décédée</option></select></label>
            </div>
        </div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Ajouter la relation</button></div>
    </form>
</dialog>

<dialog class="modal" id="investigation-dialog">
    <form method="dialog" id="investigation-form"><div class="modal-head"><div><span class="eyebrow">ENQUÊTE GÉNÉALOGIQUE</span><h2 id="investigation-dialog-title">Nouvelle enquête</h2></div><button class="icon-button" value="cancel">×</button></div><input type="hidden" name="id"><input type="hidden" name="person_id"><input type="hidden" name="additional_persons" id="investigation-extra-persons"><input type="hidden" name="linked_battues" id="investigation-linked-battues"><div class="form-grid"><label class="span-2">Ce que je cherche<input name="title" required placeholder="Retrouver l’acte de mariage…"></label><label class="span-2">Question précise<textarea name="question" rows="3"></textarea></label><label class="span-2">Ce que je sais déjà<textarea name="known_facts" rows="4"></textarea></label><label class="span-2">Documents déjà disponibles<textarea name="documents" rows="4"></textarea></label><label>État<select name="status"><option value="open">En cours</option><option value="paused">En pause</option><option value="closed">Terminée</option></select></label></div><div class="investigation-extra-persons-section"><div class="investigation-extra-persons-header"><span>Personne principale de l’enquête</span><small>L’enquête est rangée dans sa fiche. Tu peux en choisir une autre.</small></div><div id="investigation-main-person" style="margin-bottom:.5rem"></div><div class="place-input-wrap" style="position:relative"><input id="investigation-main-person-search" autocomplete="off" placeholder="Changer de personne principale…"><div class="place-suggestions" id="investigation-main-person-suggestions" hidden></div></div></div><div class="investigation-extra-persons-section"><div class="investigation-extra-persons-header"><span>Personnes supplémentaires dans l’enquête</span><small>En plus de la personne principale, tu peux y associer d’autres personnes (ex. : les deux mariés d’un acte).</small></div><div id="investigation-extra-persons-list" style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:.5rem;min-height:0"></div><div class="place-input-wrap" style="position:relative"><input id="investigation-extra-person-search" autocomplete="off" placeholder="Ajouter une personne…"><div class="place-suggestions" id="investigation-extra-person-suggestions" hidden></div></div></div><div class="investigation-extra-persons-section"><div class="investigation-extra-persons-header"><span>Battues liées</span><small>Associe une ou plusieurs battues à cette enquête.</small></div><div id="investigation-linked-battues-list" style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:.5rem;min-height:0"></div><div class="place-input-wrap" style="position:relative"><input id="investigation-battue-search" autocomplete="off" placeholder="Ajouter une battue…"><div class="place-suggestions" id="investigation-battue-suggestions" hidden></div></div></div><div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div></form>
</dialog>
<dialog class="modal" id="battue-dialog">
    <form method="dialog" id="battue-form">
        <div class="modal-head"><div><span class="eyebrow">BATTUE</span><h2 id="battue-dialog-title">Nouvelle battue</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="id">
        <input type="hidden" name="start_insee_code">
        <input type="hidden" name="linked_persons" id="battue-linked-persons">
        <input type="hidden" name="linked_investigations" id="battue-linked-investigations">
        <div class="form-grid">
            <label>Titre<input id="battue-title" name="title" required placeholder="Naissance de Jean Dupont"></label>
            <label>Type de recherche<select name="target_type"></select></label>
            <label class="span-2">Ce que l'on cherche<input name="target_text" placeholder="Nom, personne, couple, événement…"></label>
            <label class="span-2">Commune de départ
                <div class="place-input-wrap">
                    <input id="battue-commune-search" autocomplete="off" placeholder="Tape pour chercher une commune française…">
                    <div class="place-suggestions" id="battue-commune-suggestions" hidden></div>
                </div>
            </label>
            <label>Niveaux à générer<select name="max_level"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option><option value="9">9</option><option value="10">10</option></select></label>
            <label>État<select name="status"><option value="open">En cours</option><option value="paused">En pause</option><option value="closed">Terminée</option></select></label>
            <label class="span-2">Notes<textarea name="notes" rows="3"></textarea></label>
        </div>
        <div class="investigation-extra-persons-section">
            <div class="investigation-extra-persons-header"><span>Personnes liées à la battue</span><small>La battue apparaîtra dans la fiche de chaque personne liée.</small></div>
            <div id="battue-linked-persons-list" style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:.5rem;min-height:0"></div>
            <div class="place-input-wrap" style="position:relative"><input id="battue-person-search" autocomplete="off" placeholder="Ajouter une personne…"><div class="place-suggestions" id="battue-person-suggestions" hidden></div></div>
        </div>
        <div class="investigation-extra-persons-section">
            <div class="investigation-extra-persons-header"><span>Enquêtes liées</span><small>Associe une ou plusieurs enquêtes à cette battue.</small></div>
            <div id="battue-linked-investigations-list" style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:.5rem;min-height:0"></div>
            <div class="place-input-wrap" style="position:relative"><input id="battue-investigation-search" autocomplete="off" placeholder="Ajouter une enquête…"><div class="place-suggestions" id="battue-investigation-suggestions" hidden></div></div>
        </div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button" id="battue-submit">Créer la battue</button></div>
    </form>
</dialog>
<dialog class="modal small-modal" id="investigation-item-dialog">
    <form method="dialog" id="investigation-item-form"><div class="modal-head"><div><span class="eyebrow" id="investigation-item-eyebrow">PISTE EXPLORÉE</span><h2 id="investigation-item-dialog-title">Ajouter une piste ou une source</h2></div><button class="icon-button" value="cancel">×</button></div><input type="hidden" name="investigation_id"><input type="hidden" name="archive_digest_id"><div class="form-grid one-column"><label>Nature<select name="kind"><option value="lead">Piste</option><option value="link">Lien consulté</option><option value="source">Source</option><option value="document">Document</option><option value="note">Note</option></select></label><label>Intitulé<input name="title" required></label><label>Adresse Internet<input name="url" type="url" placeholder="https://…"></label><label>Conclusion<textarea name="notes" rows="5"></textarea></label><label>Résultat<select name="status"><option value="explored">Explorée</option><option value="promising">Prometteuse</option><option value="to_explore_priority">À explorer (prioritaire)</option><option value="to_explore">À explorer (pas prioritaire)</option><option value="closed">Fermée / écartée</option></select></label><div class="reminder-fields"><label>Rappel<select name="reminder_mode"><option value="none">Aucun rappel</option><option value="on">À faire à cette date</option><option value="before">À faire avant cette date</option><option value="after">À faire après cette date</option></select></label><label>Date du rappel<input name="reminder_due_at" type="date"></label><button type="button" class="button small secondary" id="download-investigation-reminder">Télécharger calendrier</button></div><label>Suivi des registres dépouillés <small>(facultatif)</small><input name="archive_digest_search" autocomplete="off" placeholder="Ex : recensement 1921, Vulaines-sur-Seine…"><div class="relation-results" data-investigation-archive-digest-results></div><small data-investigation-archive-digest-selected></small></label><label>Personnes liées<div id="investigation-item-persons-list" style="display:flex;flex-wrap:wrap;gap:.3rem .4rem;margin-bottom:.4rem;min-height:0"></div><div class="place-input-wrap" style="position:relative"><input id="investigation-item-person-search" autocomplete="off" placeholder="Ajouter une personne…"><div class="place-suggestions" id="investigation-item-person-suggestions" hidden></div></div><input type="hidden" name="linked_person_ids" id="investigation-item-person-ids"></label></div><div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button" id="investigation-item-submit">Ajouter</button></div></form>
</dialog>
<dialog class="modal small-modal" id="investigation-media-dialog">
    <form method="dialog" id="investigation-media-form"><div class="modal-head"><div><span class="eyebrow">MÉDIA D’ENQUÊTE</span><h2>Associer des médias existants</h2></div><button class="icon-button" value="cancel">×</button></div><input type="hidden" name="investigation_id"><div class="form-grid one-column"><label>Personne<div class="place-input-wrap" style="position:relative"><input name="inv_media_person_name" id="inv-media-person-search" autocomplete="off" placeholder="Commence à saisir un nom…"><div class="place-suggestions" id="inv-media-person-suggestions" hidden></div></div><input type="hidden" name="inv_media_person_id" id="inv-media-person-id"></label><div id="inv-media-preview-wrap" style="display:none;margin:.4rem 0"><div id="inv-media-preview" style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:flex-start"></div></div><label>Média(s)<select name="media_ids[]" multiple size="8" required></select><small>Maintiens ⌘ pour choisir plusieurs médias. Choisis d’abord une personne pour voir ses médias.</small></label><label>Dossier de l’enquête<select name="folder_id" id="investigation-media-folder"></select></label><label>Piste(s) concernée(s)<select name="item_ids[]" multiple size="6"></select><small>Facultatif : un média peut concerner plusieurs pistes.</small></label><label>Classement<select name="verdict"><option value="interesting">Intéressant</option><option value="rejected">Rejeté</option></select></label><label>Pourquoi ?<textarea name="reason" rows="5" required placeholder="Intéressant car la date indiquée est 1856…"></textarea></label></div><div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Associer</button></div></form>
</dialog>
<dialog class="modal small-modal" id="investigation-item-event-dialog">
    <form method="dialog" id="investigation-item-event-form"><div class="modal-head"><div><span class="eyebrow">ÉVÉNEMENT D’ENQUÊTE</span><h2>Lier un événement</h2></div><button class="icon-button" value="cancel">×</button></div><input type="hidden" name="investigation_id"><input type="hidden" name="item_id"><input type="hidden" name="person_id" id="investigation-item-event-person-id"><div class="form-grid one-column"><label>Personne<div class="place-input-wrap" style="position:relative"><input id="investigation-item-event-person-search" autocomplete="off" placeholder="Commence à saisir un nom…"><div class="place-suggestions" id="investigation-item-event-person-suggestions" hidden></div></div></label><label>Événement<select name="event_id" id="investigation-item-event-select" size="8" required></select><small>Choisis d’abord une personne pour voir ses événements.</small></label></div><div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button" id="investigation-item-event-submit">Lier</button></div></form>
</dialog>

<dialog class="modal small-modal" id="view-dialog">
    <form method="dialog" id="view-form">
        <div class="modal-head"><div><span class="eyebrow">VUE ENREGISTRÉE</span><h2 id="view-dialog-title">Conserver cette vue</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="module"><input type="hidden" name="config"><input type="hidden" name="view_id">
        <label>Nom de la vue<input name="name" required placeholder="Branche Dupont — 4 générations"></label>
        <div id="view-dialog-colors"></div>
        <div class="dialog-labels-block"><span class="section-label">Étiquettes</span><div id="view-label-picker"></div></div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div>
    </form>
</dialog>

<dialog class="modal" id="stats-colors-dialog" style="max-width:640px">
    <form method="dialog" id="stats-colors-form">
        <div class="modal-head"><div><span class="eyebrow">COULEURS DES STATISTIQUES</span><h2>Palette personnalisée</h2></div><button class="icon-button" value="cancel" type="button">×</button></div>

        <div style="display:flex;align-items:center;gap:10px;background:var(--blue-soft);border-radius:6px;padding:.65rem .9rem;margin:.25rem 0 1.25rem">
            <span style="font-size:1.2em">🎨</span>
            <p style="margin:0;font-size:.83em;color:var(--muted);line-height:1.45">40 couleurs utilisées <strong>en séquence</strong> pour colorer les barres et colonnes. Le cycle recommence automatiquement au-delà du 40ème élément.</p>
        </div>

        <div id="stats-colors-swatches" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px 12px;margin-bottom:1.5rem">
            <?php for($i=0;$i<40;$i++): ?>
            <label style="display:flex;align-items:center;gap:5px;font-size:.8em">
                <span style="width:18px;text-align:right;color:var(--muted);flex-shrink:0"><?= $i+1 ?></span>
                <input type="color" name="color_<?= $i ?>" value="#0066cc" style="width:38px;height:30px;padding:1px 2px;border:2px solid var(--line);border-radius:4px;cursor:pointer;flex-shrink:0">
            </label>
            <?php endfor; ?>
        </div>

        <hr style="border:none;border-top:1px solid var(--line);margin:1.5rem 0 1.25rem">

        <div style="margin-bottom:1.5rem">
            <span class="eyebrow">ARBRE GÉNÉALOGIQUE</span>
            <strong style="font-size:.95em;display:block;margin:.3rem 0 .4rem">Couleurs par sexe</strong>
            <p style="margin:0 0 1rem;font-size:.83em;color:var(--muted);line-height:1.45">Couleurs de fond et de texte des fiches personnes dans l’arbre (Ascendants, Descendants, Sablier, Éventail, formes spéciales, Liens de parenté). Ne s’applique pas aux Statistiques.</p>
            <div style="display:grid;gap:10px">
                <div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:10px;align-items:center">
                    <strong style="font-size:.85em"></strong>
                    <span style="font-size:.78em;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Fond</span>
                    <span style="font-size:.78em;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Texte</span>
                </div>
                <div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:10px;align-items:center">
                    <strong style="font-size:.85em">Hommes</strong>
                    <input type="color" name="gender_male_bg" value="#ffffff" style="width:100%;height:34px;padding:1px 2px;border:2px solid var(--line);border-radius:4px;cursor:pointer">
                    <input type="color" name="gender_male_text" value="#000000" style="width:100%;height:34px;padding:1px 2px;border:2px solid var(--line);border-radius:4px;cursor:pointer">
                </div>
                <div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:10px;align-items:center">
                    <strong style="font-size:.85em">Femmes</strong>
                    <input type="color" name="gender_female_bg" value="#ffffff" style="width:100%;height:34px;padding:1px 2px;border:2px solid var(--line);border-radius:4px;cursor:pointer">
                    <input type="color" name="gender_female_text" value="#000000" style="width:100%;height:34px;padding:1px 2px;border:2px solid var(--line);border-radius:4px;cursor:pointer">
                </div>
                <div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:10px;align-items:center">
                    <strong style="font-size:.85em">Sexe inconnu</strong>
                    <input type="color" name="gender_unknown_bg" value="#ffffff" style="width:100%;height:34px;padding:1px 2px;border:2px solid var(--line);border-radius:4px;cursor:pointer">
                    <input type="color" name="gender_unknown_text" value="#000000" style="width:100%;height:34px;padding:1px 2px;border:2px solid var(--line);border-radius:4px;cursor:pointer">
                </div>
            </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--line);margin:1.5rem 0 1.25rem">

        <div style="margin-bottom:1.5rem">
            <span class="eyebrow">ARBRE GÉNÉALOGIQUE</span>
            <strong style="font-size:.95em;display:block;margin:.3rem 0 .4rem">Informations affichées dans les fiches</strong>
            <p style="margin:0 0 1rem;font-size:.83em;color:var(--muted);line-height:1.45">Choisissez les informations à afficher dans chaque fiche personne de l'arbre. Seules les informations renseignées sont affichées.</p>
            <div id="tree-card-fields-list" style="display:flex;flex-direction:column;gap:6px;padding:0 2px">
                <label style="display:flex;align-items:center;gap:10px;font-size:.88em;cursor:default;padding:8px 12px;border:1.5px solid #d0d0d0;border-radius:6px;background:#f5f5f5;opacity:.6">
                    <input type="checkbox" name="tree_field_years" checked disabled style="width:15px;height:15px;flex-shrink:0;cursor:default">
                    <span>★ / † &nbsp;Années (naissance — décès) <em style="color:var(--muted);font-size:.9em">— toujours affiché</em></span>
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:.88em;cursor:pointer;padding:8px 12px;border:1.5px solid #d0d0d0;border-radius:6px;background:#ffffff;transition:border-color .15s,background .15s">
                    <input type="checkbox" name="tree_field_occupation" style="width:15px;height:15px;flex-shrink:0">
                    <span>◆ &nbsp;Profession</span>
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:.88em;cursor:pointer;padding:8px 12px;border:1.5px solid #d0d0d0;border-radius:6px;background:#ffffff;transition:border-color .15s,background .15s">
                    <input type="checkbox" name="tree_field_partners" style="width:15px;height:15px;flex-shrink:0">
                    <span>∞ &nbsp;Conjoint(s) <em style="color:var(--muted);font-size:.9em">— dans les arbres de descendants</em></span>
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:.88em;cursor:pointer;padding:8px 12px;border:1.5px solid #d0d0d0;border-radius:6px;background:#ffffff;transition:border-color .15s,background .15s">
                    <input type="checkbox" name="tree_field_living_status" style="width:15px;height:15px;flex-shrink:0">
                    <span>◷ &nbsp;Statut de vie (vivant · décédé · à vérifier)</span>
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:.88em;cursor:pointer;padding:8px 12px;border:1.5px solid #d0d0d0;border-radius:6px;background:#ffffff;transition:border-color .15s,background .15s">
                    <input type="checkbox" name="tree_field_marr" style="width:15px;height:15px;flex-shrink:0">
                    <span>∞ &nbsp;Mariage (date)</span>
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:.88em;cursor:pointer;padding:8px 12px;border:1.5px solid #d0d0d0;border-radius:6px;background:#ffffff;transition:border-color .15s,background .15s">
                    <input type="checkbox" name="tree_field_buri" style="width:15px;height:15px;flex-shrink:0">
                    <span>✚ &nbsp;Inhumation (date)</span>
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:.88em;cursor:pointer;padding:8px 12px;border:1.5px solid #d0d0d0;border-radius:6px;background:#ffffff;transition:border-color .15s,background .15s">
                    <input type="checkbox" name="tree_field_bapt" style="width:15px;height:15px;flex-shrink:0">
                    <span>✝ &nbsp;Baptême (date)</span>
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:.88em;cursor:pointer;padding:8px 12px;border:1.5px solid #d0d0d0;border-radius:6px;background:#ffffff;transition:border-color .15s,background .15s">
                    <input type="checkbox" name="tree_field_id" style="width:15px;height:15px;flex-shrink:0">
                    <span># &nbsp;Identifiant numérique de la personne</span>
                </label>
            </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--line);margin:1.5rem 0 1.25rem">

        <div style="margin-bottom:1.5rem">
            <span class="eyebrow">IDENTITÉ</span>
            <strong style="font-size:.95em;display:block;margin:.3rem 0 .4rem">Informations affichées dans la section Identité</strong>
            <p style="margin:0 0 1rem;font-size:.83em;color:var(--muted);line-height:1.45">Choisissez ce qui s'affiche dans la section Identité de la fiche personne. Ces options ne s'appliquent pas à l'arbre généalogique.</p>
            <div style="display:flex;flex-direction:column;gap:6px;padding:0 2px">
                <label style="display:flex;align-items:center;gap:10px;font-size:.88em;cursor:pointer;padding:8px 12px;border:1.5px solid #d0d0d0;border-radius:6px;background:#ffffff;transition:border-color .15s,background .15s">
                    <input type="checkbox" name="identity_show_mort_pour_la_france" style="width:15px;height:15px;flex-shrink:0">
                    <span>🎖 &nbsp;Mort Pour La France <em style="color:var(--muted);font-size:.9em">— défaut : affiché</em></span>
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:.88em;cursor:pointer;padding:8px 12px;border:1.5px solid #d0d0d0;border-radius:6px;background:#ffffff;transition:border-color .15s,background .15s">
                    <span style="flex:1">≈ &nbsp;Variantes de prénom nom</span>
                    <select name="identity_name_variants_display" style="font-size:.88em;padding:4px 6px;border:1.5px solid #d0d0d0;border-radius:4px">
                        <option value="if_filled">Afficher seulement si renseigné</option>
                        <option value="always">Afficher</option>
                        <option value="never">Masquer</option>
                    </select>
                </label>
            </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--line);margin:0 0 1.25rem">

        <div style="background:var(--blue-soft);border:2px solid var(--line);border-radius:6px;padding:1rem 1.25rem;margin-bottom:1rem">
            <strong style="font-size:.88em;display:block;margin-bottom:.75rem">Designs enregistrés</strong>
            <div id="stats-colors-presets-list"></div>
            <div style="display:flex;gap:8px;margin-top:.9rem;align-items:center">
                <input id="stats-colors-preset-name" type="text" placeholder="Nom de la palette…" style="flex:1;padding:6px 8px;border:2px solid var(--line);border-radius:4px;font-size:.85em">
                <button type="button" class="button small" id="stats-colors-save-preset">Sauvegarder</button>
            </div>
        </div>

        <div class="modal-actions">
            <button type="button" class="button secondary" id="stats-colors-reset">Réinitialiser</button>
            <button value="cancel" class="button secondary" type="button">Annuler</button>
            <button type="submit" value="default" class="button">Enregistrer la palette</button>
        </div>
    </form>
</dialog>

<dialog class="modal" id="battue-level-colors-dialog" style="max-width:560px">
    <form method="dialog" id="battue-level-colors-form">
        <div class="modal-head"><div><span class="eyebrow">BATTUE</span><h2>Couleurs des niveaux</h2></div><button class="icon-button" value="cancel" type="button">×</button></div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin:0 0 1.25rem">
            <?php for($i=0;$i<=10;$i++): ?>
            <label style="display:flex;align-items:center;gap:8px;font-size:.9em">
                <span style="width:72px;color:var(--muted);font-weight:800">Niveau <?= $i ?></span>
                <input type="color" name="battue_level_<?= $i ?>" value="#0066cc" style="width:100%;height:34px;padding:1px 2px;border:2px solid var(--line);border-radius:4px;cursor:pointer">
            </label>
            <?php endfor; ?>
        </div>
        <div style="background:var(--blue-soft);border:2px solid var(--line);border-radius:6px;padding:1rem 1.25rem;margin-bottom:1rem">
            <strong style="font-size:.88em;display:block;margin-bottom:.75rem">Palettes enregistrées</strong>
            <div id="battue-level-colors-presets-list"></div>
            <div style="display:flex;gap:8px;margin-top:.9rem;align-items:center">
                <input id="battue-level-colors-preset-name" type="text" placeholder="Nom de la palette…" style="flex:1;padding:6px 8px;border:2px solid var(--line);border-radius:4px;font-size:.85em">
                <button type="button" class="button small" id="battue-level-colors-save-preset">Sauvegarder</button>
            </div>
        </div>
        <div class="modal-actions">
            <button type="button" class="button secondary" id="battue-level-colors-reset">Réinitialiser</button>
            <button value="cancel" class="button secondary" type="button">Annuler</button>
            <button type="submit" value="default" class="button">Enregistrer</button>
        </div>
    </form>
</dialog>

<dialog class="modal small-modal" id="hypothesis-dialog">
    <form method="dialog" id="hypothesis-form"><div class="modal-head"><div><span class="eyebrow">HYPOTHÈSE</span><h2 id="hypothesis-dialog-title">Nouvelle hypothèse</h2></div><button class="icon-button" value="cancel">×</button></div><input type="hidden" name="id"><input type="hidden" name="person_id"><label>Titre<input name="title" required placeholder="Même personne que…"></label><label>Élément lié<select name="event_id"></select></label><label>Type<select name="type"><option value="identity">Identité / doublon</option><option value="relationship">Relation familiale</option><option value="date">Date</option><option value="place">Lieu</option><option value="other">Autre</option></select></label><label>Fiche liée, si besoin<input name="related_person_id" inputmode="numeric" placeholder="ID personne"></label><label>Confiance<select name="confidence"><option value="medium">Moyenne</option><option value="low">Faible</option><option value="high">Forte</option></select></label><label>État<select name="status"><option value="open">Ouverte</option><option value="confirmed">Confirmée</option><option value="rejected">Rejetée</option></select></label><label>Argument<textarea name="statement" rows="5" placeholder="Pourquoi cette hypothèse existe, ce qui manque pour la confirmer…"></textarea></label><div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div></form>
</dialog>

<dialog class="modal small-modal" id="evidence-dialog">
    <form method="dialog" id="evidence-form"><div class="modal-head"><div><span class="eyebrow">PREUVE</span><h2 id="evidence-dialog-title">Nouvelle preuve</h2></div><button class="icon-button" value="cancel">×</button></div><input type="hidden" name="id"><input type="hidden" name="person_id"><label>Titre<input name="title" required placeholder="Acte de naissance original"></label><label>Sujet<input name="subject" placeholder="Naissance, parents, lieu…"></label><label>Événement lié<select name="event_id"></select></label><label>Source liée<select name="source_id"></select></label><label>Niveau<select name="quality"><option value="unsourced">Non sourcé</option><option value="indirect">Source indirecte</option><option value="original">Acte original</option><option value="concordant">Sources concordantes</option><option value="contradiction">Contradiction</option></select></label><label>Confiance<select name="confidence"><option value="medium">Moyenne</option><option value="low">Faible</option><option value="high">Forte</option></select></label><label>Note<textarea name="note" rows="5"></textarea></label><div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div></form>
</dialog>

<dialog class="modal" id="census-dialog">
    <form method="dialog" id="census-form">
        <div class="modal-head"><div><span class="eyebrow">RECENSEMENT</span><h2 id="census-dialog-title">Recensement</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="id"><input type="hidden" name="person_id"><input type="hidden" name="year"><input type="hidden" name="is_special" value="0"><input type="hidden" name="place_id"><input type="hidden" name="precise_lat"><input type="hidden" name="precise_lon">
        <div class="form-grid">
            <label>État<select name="status"><option value="todo">À chercher</option><option value="found">Trouvé</option><option value="not_found">Non trouvé</option><option value="not_born">Pas encore né</option><option value="not_in_france">Pas encore en France</option><option value="dead">Déjà décédé</option></select></label>
            <label>Date précise ou cote<input name="date_text" placeholder="Recensement de 1856, vue 12…"></label>
            <label>Lieu<input name="place_name" placeholder="Commune" autocomplete="off" data-place-autocomplete></label>
            <label>Pays<input name="country" value="France"></label>
            <label class="span-2">Adresse<input name="address" placeholder="Rue, hameau, maison…"></label>
            <div class="span-2 event-precise-block" id="census-precise-block"></div>
            <label>Prénom relevé<input name="census_first_name" autocomplete="off" placeholder="Prénom dans le recensement"></label>
            <label>Nom relevé<input name="display_name" placeholder="Nom dans le recensement"></label>
            <label>Âge / année de naissance<input name="age_text" placeholder="42 ans, né en 1814…"></label>
            <label>Ville de naissance<input name="birth_place" placeholder="Ville indiquée dans le recensement"></label>
            <label>Profession<input name="occupation"></label>
            <label>Employeur / entreprise<input name="employer" placeholder="Patron, ferme, atelier, entreprise…"></label>
            <label>Position dans le ménage<input name="household_position" placeholder="chef, épouse, fils…"></label>
            <label>Situation personnelle<input name="personal_status" placeholder="marié, veuve…"></label>
            <label>Nationalité<input name="nationality"></label>
            <label class="span-2">Rubriques supplémentaires<textarea name="extra_info" rows="3"></textarea></label>
            <label class="span-2">Notes de recherche<textarea name="notes" rows="4"></textarea></label>
            <div class="span-2"><button type="button" class="button small secondary" id="census-manage-media-btn">+ Ajouter ou lier un média</button></div>
        </div>
        <div class="dialog-labels-block" id="census-dialog-household-block"><span class="section-label">Membres du foyer</span><div class="census-household" id="census-dialog-household"></div><button type="button" class="button small secondary" id="census-dialog-add-member">+ Membre du foyer</button></div>
        <div class="dialog-labels-block"><span class="section-label">Étiquettes</span><div id="census-label-picker"></div></div>
        <div class="census-field-hint" id="census-field-hint"></div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div>
    </form>
</dialog>

<dialog class="modal small-modal" id="census-member-dialog">
    <form method="dialog" id="census-member-form">
        <div class="modal-head"><div><span class="eyebrow">FOYER</span><h2 id="census-member-dialog-title">Ajouter un membre</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="id"><input type="hidden" name="census_id"><input type="hidden" name="return_person_id"><input type="hidden" name="person_id">
        <div class="form-grid one-column">
            <label>Fiche existante, si connue<input id="census-member-search" autocomplete="off" placeholder="Prénom, nom, variante…"></label>
            <div class="relation-results census-member-results" id="census-member-results"><p>Saisis au moins deux caractères.</p></div>
            <div class="selected-census-person" id="census-member-selected" hidden><span></span><button type="button" class="button small secondary" id="clear-census-member-person">Changer</button></div>
            <label>Prénom relevé<input name="member_first_name" autocomplete="off" placeholder="Prénom dans le recensement"></label>
            <label>Nom relevé<input name="display_name" placeholder="Nom dans le recensement"></label>
            <label>Âge / naissance<input name="age_text"></label>
            <label>Ville de naissance<input name="birth_place"></label>
            <label>Profession<input name="occupation"></label>
            <label>Employeur / entreprise<input name="employer"></label>
            <label>Position dans le ménage<input name="household_position"></label>
            <label>Situation personnelle<input name="personal_status"></label>
            <label>Nationalité<input name="nationality"></label>
            <label>Autres informations<textarea name="extra_info" rows="3"></textarea></label>
        </div>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button" id="census-member-submit">Ajouter</button></div>
    </form>
</dialog>

<dialog class="modal small-modal" id="census-media-dialog">
    <form method="dialog" id="census-media-form" enctype="multipart/form-data">
        <div class="modal-head"><div><span class="eyebrow">RECENSEMENT</span><h2>Gérer les médias</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="census_id"><input type="hidden" name="person_id">
        <label>Médias déjà présents sur cette fiche<select name="media_ids[]" multiple size="7"></select></label>
        <p class="form-help" id="census-media-existing-help">Maintiens ⌘ pour sélectionner plusieurs images ou documents déjà associés à cette personne.</p>
        <hr class="form-separator">
        <p class="form-help">Ou importe directement une nouvelle image / un PDF : il sera ajouté aux médias de la fiche et rattaché à ce recensement.</p>
        <label>Titre commun<input name="title" placeholder="Recensement 1906, acte, photographie…"></label>
        <label>Référence / cote du document<input name="document_reference" placeholder="AD75, 5Mi…, registre 3E…"></label>
        <label>Nom du registre ou livre<input name="document_title" placeholder="Paris, Table décennale 1881-1891"></label>
        <label>Lien web<input name="document_url" placeholder="https://archives…"></label>
        <label>Page(s) ou vue(s)<input name="document_pages" placeholder="vue 12, pages 42-43"></label>
        <label>Images ou PDF<input type="file" name="files[]" multiple accept="image/*,.pdf,application/pdf"></label>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer les médias</button></div>
    </form>
</dialog>

<dialog class="modal small-modal" id="entity-media-dialog">
    <form method="dialog" id="entity-media-form" enctype="multipart/form-data">
        <div class="modal-head"><div><span class="eyebrow" id="entity-media-eyebrow">DOCUMENTS</span><h2 id="entity-media-title">Gérer les médias</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="entity_type"><input type="hidden" name="entity_id"><input type="hidden" name="person_id">
        <label>Médias déjà présents sur cette fiche<select name="media_ids[]" multiple size="7"></select></label>
        <p class="form-help" id="entity-media-existing-help">Maintiens ⌘ pour sélectionner plusieurs images ou documents déjà associés à cette personne.</p>
        <hr class="form-separator">
        <p class="form-help">Ou importe directement une nouvelle image / un PDF.</p>
        <label>Titre commun<input name="title" placeholder="Acte, photographie…"></label>
        <label>Référence / cote du document<input name="document_reference" placeholder="AD75, 5Mi…, registre 3E…"></label>
        <label>Nom du registre ou livre<input name="document_title" placeholder="Paris, Table décennale 1881-1891"></label>
        <label>Lien web<input name="document_url" placeholder="https://archives…"></label>
        <label>Page(s) ou vue(s)<input name="document_pages" placeholder="vue 12, pages 42-43"></label>
        <label>Images ou PDF<input type="file" name="files[]" multiple accept="image/*,.pdf,application/pdf"></label>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer les médias</button></div>
    </form>
</dialog>
<dialog class="modal small-modal" id="research-note-dialog">
    <form method="dialog" id="research-note-form"><div class="modal-head"><div><span class="eyebrow">JOURNAL</span><h2 id="research-note-dialog-title">Nouvelle entrée</h2></div><button class="icon-button" value="cancel">×</button></div><input type="hidden" name="id"><input type="hidden" name="person_id"><label>Titre<input name="title" required placeholder="Recherche sur les registres de…"></label><label>Ce que j’ai fait<textarea name="body" rows="4"></textarea></label><label>Résultat<textarea name="result" rows="3"></textarea></label><label>Prochaine étape<textarea name="next_step" rows="3"></textarea></label><div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div></form>
</dialog>

<dialog class="modal small-modal" id="battue-alias-dialog">
    <form method="dialog" id="battue-alias-form">
        <div class="modal-head"><div><span class="eyebrow">BATTUE</span><h2 id="battue-alias-title">Commune liée</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="id"><input type="hidden" name="battue_id"><input type="hidden" name="insee_code">
        <label>Nom de l'ancienne commune ou subdivision<input name="name" required autocomplete="off" placeholder="Ex : Paris 11, ancienne paroisse…"></label>
        <label>Note<textarea name="note" rows="3" placeholder="Fusion, rattachement, nom historique…"></textarea></label>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div>
    </form>
</dialog>

<dialog class="modal small-modal" id="battue-search-dialog">
    <form method="dialog" id="battue-search-form">
        <div class="modal-head"><div><span class="eyebrow">BATTUE</span><h2 id="battue-search-title">Annotation de recherche</h2></div><button class="icon-button" value="cancel">×</button></div>
        <input type="hidden" name="id"><input type="hidden" name="battue_id"><input type="hidden" name="insee_code">
        <label>Commune / subdivision<select name="alias_id"></select></label>
        <label>Type de recherche<select name="record_type"></select></label>
        <label>Période<input name="period" placeholder="1803-1812, 1901…"></label>
        <label>Registre<input name="register" placeholder="Tables décennales, registre NMD…"></label>
        <label>Titre court<input name="title" placeholder="Table décennale, acte à vérifier…"></label>
        <label>Statut<select name="status"></select></label>
        <input type="hidden" name="archive_digest_id">
        <label>Suivi des registres dépouillés <small>(facultatif)</small><input name="archive_digest_search" autocomplete="off" placeholder="Ex : recensement 1921, Vulaines-sur-Seine…"><div class="relation-results" data-battue-archive-digest-results></div><small data-battue-archive-digest-selected></small></label>
        <label>Lien web<input name="url" placeholder="https://archives…"></label>
        <label>Note<textarea name="note" rows="4" placeholder="Ce qui a été vu, homonyme, doute, page à reprendre…"></textarea></label>
        <div class="modal-actions"><button value="cancel" class="button secondary">Annuler</button><button type="submit" value="default" class="button">Enregistrer</button></div>
    </form>
</dialog>

<dialog class="lightbox" id="lightbox">
    <button class="lightbox-close" aria-label="Fermer">×</button>
    <button class="lightbox-arrow lightbox-prev" id="lightbox-prev" aria-label="Image précédente">←</button>
    <button class="lightbox-arrow lightbox-next" id="lightbox-next" aria-label="Image suivante">→</button>
    <div class="lightbox-layout">
        <figure><img id="lightbox-image" alt=""><iframe id="lightbox-pdf" title="Document PDF"></iframe><video id="lightbox-video" controls hidden></video><audio id="lightbox-audio" controls hidden></audio><div id="lightbox-postcard-stack" hidden></div><div id="lightbox-tag-canvas" aria-hidden="true"></div></figure>
        <aside class="lightbox-details">
            <span class="eyebrow" id="lightbox-counter"></span>
            <h2 id="lightbox-caption"></h2>
            <div class="lightbox-attachment-block"><span class="lightbox-attachment-label">RATTACHÉ À</span><div id="lightbox-attachment-list"></div><button type="button" class="button small secondary" id="lightbox-add-link">+ Rattacher à un autre élément</button></div>
            <label class="checkbox-line lightbox-checkbox"><input id="lightbox-person-photo" type="checkbox"> Photo de la personne</label>
            <label for="lightbox-title">Intitulé du média</label>
            <input id="lightbox-title" class="lightbox-input" placeholder="Acte de mariage, portrait…">
            <label for="lightbox-date">Date du média</label>
            <div class="date-text-wrap">
                <input id="lightbox-date" name="date_text" class="lightbox-input" placeholder="vers 1900, 7 mai 1925…">
                <button type="button" class="icon-button date-picker-toggle" id="lightbox-date-toggle" title="Choisir une date dans le calendrier" aria-label="Ouvrir le calendrier">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                </button>
                <input type="date" id="lightbox-date-picker" class="date-picker-hidden" aria-hidden="true" tabindex="-1">
            </div>
            <label for="lightbox-date-calendar">Calendrier de cette date</label>
            <select id="lightbox-date-calendar" class="lightbox-input">
                <option value="gregorian">Grégorien</option>
                <option value="julian">Julien</option>
                <option value="republican">Républicain</option>
            </select>
            <div class="lightbox-correspondence-fields">
                <label for="lightbox-correspondence-type">Type de correspondance</label>
                <select id="lightbox-correspondence-type" class="lightbox-input">
                    <option value="">Aucune (pas une correspondance)</option>
                    <option value="lettre">Lettre</option>
                    <option value="carte_postale">Carte postale</option>
                    <option value="telegramme">Télégramme</option>
                    <option value="carte_voeux">Carte de vœux</option>
                    <option value="faire_part">Faire-part</option>
                    <option value="autre">Autre correspondance</option>
                </select>
                <label>Destinataire(s) / expéditeur(s)</label>
                <div class="correspondent-picker">
                    <div class="map-route-person-chips correspondent-chips" id="lightbox-correspondent-chips"></div>
                    <input type="text" id="lightbox-correspondent-search" class="lightbox-input" placeholder="Tape un nom pour retrouver une personne de l’arbre…" autocomplete="off">
                    <div class="relation-results correspondent-suggestions" id="lightbox-correspondent-suggestions" hidden></div>
                    <input type="hidden" id="lightbox-correspondent-value" value="[]">
                </div>
                <label for="lightbox-correspondence-reply">Répond à</label>
                <select id="lightbox-correspondence-reply" class="lightbox-input"><option value="">Aucune autre correspondance</option></select>
            </div>
            <label for="lightbox-media-subject-type">Nature du média</label>
            <select id="lightbox-media-subject-type" class="lightbox-input">
                <option value="">Document / média standard</option>
                <option value="grave_photo">Photo de tombe</option>
                <option value="war_memorial_photo">Photo de monument aux morts</option>
                <option value="voter_card">Carte d’électeur</option>
                <option value="id_card">Carte d’identité</option>
                <option value="driving_permit">Permis de conduire</option>
            </select>
            <label for="lightbox-doc-reference">Référence / cote du document</label>
            <input id="lightbox-doc-reference" class="lightbox-input" placeholder="AD75, 5Mi…, registre 3E…">
            <label for="lightbox-doc-title">Registre ou livre</label>
            <input id="lightbox-doc-title" class="lightbox-input" placeholder="Paris, Table décennale 1881-1891">
            <label for="lightbox-doc-url">Lien web</label>
            <input id="lightbox-doc-url" class="lightbox-input" placeholder="https://archives…">
            <label for="lightbox-doc-pages">Page(s) ou vue(s)</label>
            <input id="lightbox-doc-pages" class="lightbox-input" placeholder="vue 12, pages 42-43">
            <label for="lightbox-description">Note sur le média</label>
            <textarea id="lightbox-description" rows="4" placeholder="Contexte, qualité de lecture, source du fichier…"></textarea>
            <label for="lightbox-transcription">Transcription du document</label>
            <div class="lightbox-ocr-row">
                <select id="ocr-language" class="lightbox-input compact" title="Langue ciblée pour l'OCR tapuscrit">
                    <option value="fra">OCR français</option>
                    <option value="eng">OCR anglais</option>
                    <option value="spa">OCR espagnol</option>
                    <option value="deu">OCR allemand</option>
                    <option value="ita">OCR italien</option>
                    <option value="nld">OCR néerlandais</option>
                    <option value="por">OCR portugais</option>
                    <option value="pol">OCR polonais</option>
                    <option value="dan">OCR danois</option>
                    <option value="nor">OCR norvégien</option>
                    <option value="swe">OCR suédois</option>
                    <option value="fin">OCR finlandais</option>
                    <option value="ces">OCR tchèque</option>
                    <option value="hun">OCR hongrois</option>
                    <option value="slk">OCR slovaque</option>
                    <option value="est">OCR estonien</option>
                    <option value="lav">OCR letton</option>
                    <option value="lit">OCR lituanien</option>
                    <option value="gle">OCR irlandais</option>
                    <option value="hrv">OCR croate</option>
                    <option value="ell">OCR grec</option>
                    <option value="yid">OCR yiddish</option>
                </select>
                <button type="button" class="button small secondary" id="ocr-transcription" title="Reconnaissance de texte automatique — fonctionne bien sur du texte tapuscrit. Le texte détecté est ajouté à la fin, sans rien effacer.">🔎 OCR (texte tapuscrit)</button>
                <span class="htr-controls" id="htr-controls">
                    <select id="htr-model" class="lightbox-input compact" title="Langue et modèle d’écriture manuscrite à utiliser" aria-label="Langue / modèle d’écriture manuscrite">
                        <option value="fr-actes">Français · manuscrit généalogique</option>
                        <option value="en-handwritten">Anglais · handwritten</option>
                        <option value="latin-medieval">Latin / médiéval · ancien</option>
                        <option value="spanish-historical">Espagnol · historique</option>
                        <option value="german-19">Allemand · registres XIXe</option>
                        <option value="italian-medieval">Italien · médiéval / ancien</option>
                        <option value="dutch-experimental">Néerlandais · expérimental</option>
                        <option value="portuguese-16-19">Portugais · XVIe-XIXe</option>
                        <option value="polish-experimental">Polonais · expérimental</option>
                        <option value="russian-cyrillic">Russe / cyrillique · ancien</option>
                        <option value="danish-old-norse">Danois · nordique ancien</option>
                        <option value="swedish-old-norse">Suédois · nordique ancien</option>
                        <option value="finnish-experimental">Finlandais · expérimental</option>
                        <option value="norwegian-old-norse">Norvégien · nordique ancien</option>
                        <option value="serbian-cyrillic-old">Serbe · cyrillique ancien</option>
                        <option value="croatian-experimental">Croate · expérimental</option>
                        <option value="czech-bohemia-19">Tchèque · Bohême XIXe</option>
                        <option value="hungarian-experimental">Hongrois · expérimental</option>
                        <option value="slovak-experimental">Slovaque · expérimental</option>
                        <option value="estonian-experimental">Estonien · expérimental</option>
                        <option value="latvian-experimental">Letton · expérimental</option>
                        <option value="lithuanian-experimental">Lituanien · expérimental</option>
                        <option value="irish-experimental">Irlandais · expérimental</option>
                        <option value="greek-historical">Grec · modèle à installer</option>
                        <option value="romanian-experimental">Roumain · expérimental</option>
                        <option value="ukrainian-cyrillic-old">Ukrainien · cyrillique ancien</option>
                        <option value="yiddish-hebrew-script">Yiddish · alphabet hébreu à installer</option>
                    </select>
                    <button type="button" class="button small secondary" id="handwriting-transcription" title="Reconnaissance manuscrite locale via Kraken si un modèle est installé. Le texte détecté est ajouté à la fin, sans rien effacer.">✍ HTR manuscrit</button>
                </span>
                <span class="lightbox-ocr-status" id="ocr-transcription-status" hidden></span>
            </div>
            <textarea id="lightbox-transcription" rows="14" placeholder="Saisir ici ce qui est écrit sur l’acte ou la photographie…"></textarea>
            <div class="dialog-labels-block lightbox-labels-block"><span class="section-label">Étiquettes</span><div id="lightbox-label-picker"></div></div>
            <div class="lightbox-tags-block" id="lightbox-tags-block" hidden>
                <span class="section-label">Personnes identifiées</span>
                <label class="checkbox-line lightbox-checkbox" id="lightbox-tags-visible-line"><input id="lightbox-tags-visible-toggle" type="checkbox" checked> Afficher les zones sur la photo</label>
                <div id="lightbox-tags-list"></div>
                <button type="button" class="button small secondary" id="lightbox-tag-toggle">+ Identifier quelqu'un</button>
                <p class="lightbox-tag-hint" id="lightbox-tag-hint" hidden>🖱️ Cliquez et faites glisser sur la photo pour délimiter la zone où apparaît la personne, puis remplissez le formulaire.</p>
                <div id="lightbox-tag-form" hidden></div>
            </div>
            <div class="lightbox-tags-block" id="lightbox-signatures-block" hidden>
                <span class="section-label">Signatures identifiées</span>
                <label class="checkbox-line lightbox-checkbox" id="lightbox-signatures-visible-line"><input id="lightbox-signatures-visible-toggle" type="checkbox" checked> Afficher les zones sur la photo</label>
                <div id="lightbox-signatures-list"></div>
                <button type="button" class="button small secondary" id="lightbox-signature-toggle">+ Identifier une signature</button>
                <p class="lightbox-tag-hint" id="lightbox-signature-hint" hidden>Tracez la zone de la signature, puis choisissez la personne à laquelle elle appartient.</p>
                <div id="lightbox-signature-form" hidden></div>
            </div>
            <div class="lightbox-actions"><button class="button secondary" id="compare-media">Comparer</button><button class="button secondary" id="rotate-media-left">Rotation gauche</button><button class="button secondary" id="rotate-media-right">Rotation droite</button><button class="button secondary" id="retouch-media" hidden>🎚️ Retoucher</button><button class="button secondary" id="assemble-media" hidden title="Assembler cette photo avec d’autres (redimensionner, faire tourner, transparence)">🧩 Assembler</button><button class="button secondary" id="edit-av-media" hidden title="Couper, améliorer le son, assembler… L’original est toujours gardé.">✂️ Modifier</button><button class="button secondary" id="assist-transcription">Structurer</button><button class="button" id="save-transcription">Enregistrer la transcription</button><button class="button secondary" id="save-media-meta">Enregistrer le média</button><button class="button secondary" id="set-portrait">Utiliser comme portrait</button><button class="button danger" id="delete-media">Supprimer ce média</button></div>
            <p class="keyboard-help">Touches ← et → pour changer de document. Molette sur l’image : zoomer.</p>
        </aside>
    </div>
</dialog>

<script>window.GENEALOGY_READY = <?= $ready ? 'true' : 'false' ?>;window.INSTALL_CSRF = <?= json_encode($installCsrf) ?>;window.LCNDA_SETTINGS = <?= json_encode($ready ? app_settings_for_page() : null, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="assets/js/app.js?v=314" defer></script>
<script src="assets/js/sea-route.js?v=1" defer></script>
<script src="assets/js/heritage.js?v=12" defer></script>
<script src="assets/js/heritage-tools.js?v=7" defer></script>
<script src="assets/js/heritage-links.js?v=8" defer></script>
<script src="assets/js/heritage-more.js?v=25" defer></script>
<script src="assets/js/heritage-records.js?v=1" defer></script>
<script src="assets/js/heritage-research.js?v=15" defer></script>
<script src="assets/js/heritage-av.js?v=6" defer></script>
<script src="assets/js/heritage-recueil-table.js?v=1" defer></script>
<script src="assets/js/heritage-recueils.js?v=10" defer></script>
<script src="assets/js/heritage-depouillements.js?v=1" defer></script>
<script src="assets/js/heritage-studio-av.js?v=3" defer></script>
<script src="assets/js/heritage-calendars.js?v=6" defer></script>
<script src="assets/js/heritage-assemble.js?v=1" defer></script>
<script src="assets/js/heritage-columns.js?v=1" defer></script>
<script src="assets/js/heritage-atelier-widgets.js?v=1" defer></script>
<script src="assets/js/heritage-voters.js?v=2" defer></script>
<script src="assets/js/heritage-widgets.js?v=9" defer></script>
<script src="assets/js/heritage-studio.js?v=8" defer></script>
<script src="assets/js/museum-viewer.js?v=6" defer></script>
<script src="assets/js/heritage-museum.js?v=7" defer></script>
<script>
(function () {
    var toggle = document.getElementById('lightbox-tag-toggle');
    var hint   = document.getElementById('lightbox-tag-hint');
    if (!toggle || !hint) return;
    // Suit la classe "active" qu'app.js ajoute/retire sur le bouton
    new MutationObserver(function () {
        hint.hidden = !toggle.classList.contains('active');
    }).observe(toggle, { attributes: true, attributeFilter: ['class'] });
})();
</script>
</body>
</html>
