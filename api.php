<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/gedcom.php';   // import / export GEDCOM
require __DIR__ . '/lib/heredis.php';  // fichier Hérédis natif (.hmw / .heredis)
require __DIR__ . '/lib/backup.php';   // sauvegarde complète (base + médias), ouverture d'une base .db
require_once __DIR__ . '/lib/picker.php'; // 🔍 menu de choix unique (assets/js/app-picker.js, docs/PICKER.md)
require_once __DIR__ . '/lib/layout_extra.php'; // 📐 mise en page : arbre dynamique, citations, vérificateur, index des lieux et métiers

// SITE_DEFAULTS_PATH est défini dans lib/paths.php
const EVENT_FACT_CONFIDENCE_LEVELS = ['unknown','certain','deduced','estimated','doubt'];
const LDS_SLUGS_TO_DELETE = ['lds-baptism','lds-child-sealing','lds-confirmation','lds-endowment','lds-initiatory',
    'ldsbaptism','ldschild-sealing','ldsconfirmation','ldsendowment','ldsinitiatory'];
const LIVING_CONTACT_ATTENDANCE = ['unknown','invited','confirmed','declined'];
const ONLINE_SHEET_CHECK_STATUSES = ['exact','inexact','incomplet','approximatif','inconnu'];

function php_ini_size_bytes(string $value): int
{
    $value = trim(strtolower($value));
    if (!preg_match('/^([0-9]+(?:\.[0-9]+)?)\s*([kmgtpe]?)/', $value, $matches)) return 0;
    $multipliers = ['' => 1, 'k' => 1024, 'm' => 1024 ** 2, 'g' => 1024 ** 3, 't' => 1024 ** 4, 'p' => 1024 ** 5, 'e' => 1024 ** 6];
    return (int) round((float) $matches[1] * ($multipliers[$matches[2]] ?? 1));
}

function upload_failure_message(?array $file, string $label = 'Le fichier'): string
{
    $uploadLimit = (string) ini_get('upload_max_filesize');
    $postLimit = (string) ini_get('post_max_size');
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    $postLimitBytes = php_ini_size_bytes($postLimit);

    if (!$file && $postLimitBytes > 0 && $contentLength > $postLimitBytes) {
        return "$label dépasse la limite totale d’envoi du serveur ($postLimit). Augmentez « post_max_size » et « upload_max_filesize » dans la configuration PHP, puis redémarrez le serveur local.";
    }

    $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    return match ($error) {
        UPLOAD_ERR_INI_SIZE => "$label dépasse la limite autorisée par le serveur ($uploadLimit). Augmentez « upload_max_filesize » et « post_max_size » dans la configuration PHP, puis redémarrez le serveur local.",
        UPLOAD_ERR_FORM_SIZE => "$label dépasse la taille autorisée par le formulaire.",
        UPLOAD_ERR_PARTIAL => "$label n’a été envoyé que partiellement. Réessayez l’envoi.",
        UPLOAD_ERR_NO_FILE => "$label n’a pas été reçu. Vérifiez qu’il est bien sélectionné puis réessayez.",
        UPLOAD_ERR_NO_TMP_DIR => "Le dossier temporaire du serveur est introuvable. Vérifiez la configuration PHP du serveur local.",
        UPLOAD_ERR_CANT_WRITE => "Le serveur n’a pas pu écrire le fichier temporaire. Vérifiez l’espace disponible et les droits d’écriture.",
        UPLOAD_ERR_EXTENSION => "L’envoi a été bloqué par une extension PHP du serveur.",
        default => "L’envoi du fichier a échoué (code PHP $error).",
    };
}

try {
    $justInitialized = false;
    $action = $_GET['action'] ?? 'bootstrap';
    $isWrite = $_SERVER['REQUEST_METHOD'] !== 'GET';
    $payload = $isWrite ? request_json() : [];
    if ($isWrite) {
        verify_csrf($payload);
    }
    // Mode consultation : la famille peut tout regarder, rien modifier (lib/heritage_tools.php)
    if ($action === 'kiosk_state') {
        json_response(kiosk_state());
    }
    if ($isWrite && $action === 'kiosk_exit') {
        kiosk_exit($payload);
    }
    kiosk_guard((string) $action, $isWrite);
    // Plusieurs généalogies complètement séparées (lib/paths.php) : liste, création, changement, nom, mise de côté
    if (!$isWrite && $action === 'genealogies') {
        json_response(genealogies_list_data());
    }
    if ($isWrite && in_array($action, ['genealogy_create', 'genealogy_switch', 'genealogy_rename', 'genealogy_remove'], true)) {
        json_response(genealogy_action((string) $action, $payload));
    }
    if (!$isWrite && $action === 'database_profiles') {
        json_response(['current' => active_database_key(), 'databases' => available_database_profiles()]);
    }
    if ($isWrite && $action === 'switch_database') {
        $key = safe_text($payload['key'] ?? '');
        if (!database_path_from_key($key)) {
            throw new RuntimeException('Base SQLite introuvable ou non autorisée.');
        }
        $dir = dirname(database_selector_path());
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('Impossible de créer le dossier de configuration.');
        }
        file_put_contents(database_selector_path(), $key);
        json_response(['ok' => true, 'active' => $key]);
    }
    if ($isWrite && $action === 'delete_database') {
        $key = safe_text($payload['key'] ?? '');
        $path = database_path_from_key($key);
        if (!$path || !is_file($path)) {
            throw new RuntimeException('Base SQLite introuvable ou non autorisée.');
        }
        if ($key === active_database_key()) {
            throw new RuntimeException('Impossible de supprimer la base active.');
        }
        foreach ([$path, $path . '-wal', $path . '-shm', $path . '-journal'] as $file) {
            if (is_file($file) && !unlink($file)) {
                throw new RuntimeException('Impossible de supprimer '.$file);
            }
        }
        json_response(['ok' => true, 'deleted' => $key]);
    }

    // Actions de type upload : elles construisent elles-mêmes leur réponse JSON
    // (json_response + exit) plutôt que de passer par le journal avant/après de handle_write.
    $uploadActions = ['verify_gedcom', 'compare_gedcom', 'import_analyse', 'init_database', 'import_package', 'import_local_path', 'insee_import'];

    // Actions utilisables depuis l'écran d'installation, avant que la base n'existe.
    $autoInitFirstPerson = $action === 'save_person' && $isWrite && empty($payload['id']) && !empty($payload['init_if_missing']);
    if ($autoInitFirstPerson && trim((string)($payload['first_name'] ?? '')) === '' && trim((string)($payload['last_name'] ?? '')) === '') {
        // On valide avant de créer le fichier de base : sinon une tentative ratée
        // laisserait une base vide sur le disque et bloquerait l'écran d'installation.
        throw new RuntimeException('Indique au moins un prénom ou un nom');
    }
    if ($isWrite && !is_file(DB_PATH) && (in_array($action, $uploadActions, true) || $autoInitFirstPerson)) {
        init_empty_database();
        $justInitialized = true;
    }

    // Fichier lu directement sur le disque (application de bureau : choisi dans la fenêtre système).
    $importFile = null;
    if ($isWrite && $action === 'import_local_path') {
        $importFile = local_import_file($payload);
    } elseif ($isWrite && $action === 'import_package') {
        $importFile = $_FILES['file'] ?? null;
    }
    // Ouvrir une base .db/.sqlite ou une sauvegarde complète .zip : avant db(), la base vide va être remplacée.
    if ($importFile && ($importFile['error'] ?? 1) === UPLOAD_ERR_OK && is_restore_upload($importFile)) {
        restore_package_upload($importFile);
    }

    $pdo = db();

    // La structure de la base (tables, colonnes, types d’événements de base) est mise à jour une seule fois
    // par numéro de version dans lib/migrations.php, à l’ouverture de la base (db()).
    if (!$isWrite && $action === 'schema_status') {
        prepare_world_reference(); // décompression + index des villes du monde, une fois (~20 s au premier lancement)
        json_response(['version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn(), 'expected' => SCHEMA_VERSION]);
    }
    if ($isWrite && $action === 'backup_sqlite') {
        // Mode consultation : la sauvegarde automatique continue, mais aucune copie de la base vers un autre dossier
        if (kiosk_state()['on'] && (($payload['mode'] ?? '') !== 'auto' || normalize_backup_dir(safe_text($payload['dir'] ?? '')) !== normalize_backup_dir(''))) {
            json_response(['error' => 'Mode consultation : pas de copie de la base vers un autre dossier.', 'kiosk' => true], 423);
        }
        backup_sqlite($pdo, $payload);
    }
    if ($isWrite && $action === 'clone_database') {
        clone_database($pdo, $payload);
    }
    if ($isWrite && $action === 'download_reference_country') { // navigateur sans Electron (Electron télécharge lui-même)
        json_response(['ok' => true] + download_reference_country(safe_text($payload['country'] ?? '')));
    }
    if ($isWrite && $action === 'set_reference_country') {
        $cc = safe_text($payload['country'] ?? '');
        try {
            $result = !empty($payload['enabled']) ? enable_reference_country($pdo, $cc) : disable_reference_country($pdo, $cc);
        } catch (ReferenceDownloadRequired $e) {
            $entry = reference_catalogue()['countries'][$e->country] ?? [];
            json_response(['error' => $e->getMessage(), 'download_required' => ['country' => $e->country, 'size' => (int) ($entry['size'] ?? 0)]], 409);
        }
        log_change($pdo, 'meta', 0, 'update', (!empty($payload['enabled']) ? 'Pays ajouté aux battues : ' : 'Pays retiré des battues : ') . $cc, null, $result);
        json_response(['ok' => true] + $result + ['active' => reference_countries_active($pdo)]);
    }
    if ($isWrite && $action === 'save_settings') {
        save_app_settings($pdo, $payload);
    }
    if ($isWrite && $action === 'insee_prenoms_import') {
        insee_prenoms_import($pdo, $_FILES['file'] ?? null);
    }
    if ($isWrite && $action === 'scan_inbox_run') {
        scan_inbox_run($pdo);
    }
    if ($isWrite && $action === 'sync_preview') {
        sync_preview($pdo, $_FILES['file'] ?? null);
    }
    if ($isWrite && $action === 'sync_apply') {
        sync_apply($pdo, $payload);
    }
    if ($isWrite && $action === 'insee_remote_import') { // décès INSEE : téléchargé sur data.gouv.fr puis importé
        insee_remote_import($pdo, $payload);
    }
    if ($isWrite && $action === 'museum_upload') {
        museum_upload($pdo, $_FILES['file'] ?? null, $_POST);
    }
    if ($isWrite && $action === 'museum_import') {
        museum_import($pdo, $_FILES['file'] ?? null);
    }
    if ($isWrite && $action === 'retouch_delete_version') {
        retouch_delete_version($pdo, $payload);
    }
    if ($isWrite && $action === 'save_audio_project') {
        save_audio_project($pdo, $_FILES['file'] ?? null, $_POST);
    }
    if ($isWrite && $action === 'house_model_upload') {
        house_model_upload($pdo, $_FILES['file'] ?? null, $_POST);
    }
    if (in_array($action, HOUSE_LIB_ACTIONS, true)) { // 🏠 objets créés, bibliothèque en ligne, packs ZIP (lib/house_library.php)
        house_lib_dispatch($pdo, (string) $action, $isWrite, $payload);
    }
    if ($isWrite && $action === 'retouch_media') {
        retouch_media($pdo, $_FILES['file'] ?? null, $_POST);
    }
    if ($isWrite && $action === 'htr_upload_model') {
        htr_upload_model($_FILES['file'] ?? null, safe_text($_POST['target'] ?? ''));
    }
    if ($isWrite && $action === 'htr_install') {
        json_response(['ok' => true, 'result' => htr_install_start($payload)]);
    }
    if ($isWrite && $action === 'vault_export') {
        vault_export($pdo, $payload);
    }
    if ($isWrite && $action === 'vault_store') {
        vault_store($pdo, $_FILES['file'] ?? null);
    }
    if ($isWrite && $action === 'vault_open') {
        vault_open($pdo, $_FILES['file'] ?? null, (string) ($_POST['password'] ?? $payload['password'] ?? ''));
    }
    if ($isWrite && $action === 'offsite_copy_now') {
        offsite_copy_now($pdo, $payload);
    }
    if ($isWrite && $action === 'delete_empty_families') {
        delete_empty_families($pdo);
    }
    // Fusion de l'arbre d'un cousin : hors de la transaction générale (copie de sécurité VACUUM INTO d'abord)
    if ($isWrite && $action === 'merge_gedcom_analyse') {
        merge_gedcom_analyse($pdo, $_FILES['file'] ?? null);
    }
    if ($isWrite && $action === 'merge_gedcom_apply') {
        merge_gedcom_apply($pdo, $payload);
    }

    // Sauvegarde complète protégée : le mot de passe arrive en POST (jamais dans l'adresse)
    if ($isWrite && $action === 'export_full_backup') {
        export_full_backup($pdo, (string) ($payload['password'] ?? ''));
    }
    if ($isWrite && !in_array($action, $uploadActions, true)) {
        handle_write($pdo, $action, $payload);
    }

    match ($action) {
        'bootstrap' => bootstrap_data($pdo),
        'people' => people_list($pdo),
        'dashboard' => dashboard_data($pdo),
        'dashboard_quiz' => dashboard_quiz_data($pdo),
        'goose_quiz' => goose_quiz_data($pdo),
        'person' => person_detail($pdo, safe_int($_GET['id'] ?? 0)),
        'due_reminders' => json_response(due_reminders_data($pdo)),
        'offline_tile' => offline_tile_response($pdo),
        'lineage' => json_response(lineage_data($pdo, safe_int($_GET['id'] ?? 0), safe_int($_GET['asc'] ?? 3), safe_int($_GET['desc'] ?? 2))),
        'closed_branches' => json_response(['branches' => closed_branches_data($pdo, safe_int($_GET['person_id'] ?? 0)), 'certainties' => BRANCH_CERTAINTIES, 'reasons' => BRANCH_REASONS]),
        'research_progress' => json_response(research_progress_data($pdo)),
        'genealogy_fairs' => json_response(['fairs' => genealogy_fairs_data($pdo)]),
        'heritage_overview' => json_response(heritage_overview($pdo)),
        'heritage_place_search' => json_response(['places' => heritage_place_search($pdo, safe_text($_GET['q'] ?? ''))]),
        'image_pick' => json_response(['media' => heritage_image_pick($pdo, mb_substr(safe_text($_GET['q'] ?? ''), 0, 100), (string) ($_GET['filter'] ?? ''))]),
        'act_transcriptions_media' => json_response(['items' => act_transcriptions_for_media($pdo, safe_int($_GET['media_id'] ?? 0))]),
        'heritage_media_search' => json_response(['media' => heritage_media_search($pdo, safe_text($_GET['q'] ?? ''))]),
        'voyages' => json_response(['voyages' => voyages_data($pdo, safe_int($_GET['person_id'] ?? 0))]),
        'placements' => json_response(['placements' => placements_data($pdo, safe_int($_GET['person_id'] ?? 0)), 'kinds' => PLACEMENT_KINDS]),
        'coats_of_arms' => json_response(['coats' => coats_of_arms_data($pdo, safe_int($_GET['person_id'] ?? 0), safe_text($_GET['q'] ?? ''))]),
        'poilus' => json_response(['poilus' => poilus_overview($pdo), 'kinds' => POILU_EVENT_KINDS]),
        'field_trips' => json_response(field_trips_data($pdo, safe_text($_GET['status'] ?? 'todo'))),
        'field_trip' => json_response(['trip' => field_trip_detail($pdo, safe_int($_GET['id'] ?? 0))]),
        'family_papers' => json_response(['papers' => family_papers_data($pdo, safe_text($_GET['q'] ?? ''), safe_int($_GET['person_id'] ?? 0)), 'next_number' => next_paper_number($pdo)]),
        'old_maps' => json_response(['maps' => old_maps_data($pdo)]),
        'saved_searches' => json_response(saved_searches_data($pdo)),
        'saved_search_results' => json_response(saved_search_results($pdo, json_decode((string) ($_GET['criteria'] ?? '{}'), true) ?: [], safe_int($_GET['id'] ?? 0))),
        'firstnames_france' => json_response(firstnames_france_data($pdo, max(1800, min(2100, safe_int($_GET['min_year'] ?? 1900, 1900))))),
        'probate_inventories' => json_response(['inventories' => probate_inventories_data($pdo, safe_int($_GET['person_id'] ?? 0)), 'categories' => PROBATE_CATEGORIES]),
        'offsite_status' => json_response(offsite_status($pdo)),
        'scan_inbox_status' => json_response(scan_inbox_status($pdo)),
        'parishes' => json_response(['parishes' => parishes_data($pdo, safe_text($_GET['q'] ?? ''))]),
        'parish_map' => json_response(parish_map($pdo)),
        'parish_place_search' => json_response(['places' => parish_place_search($pdo, safe_text($_GET['q'] ?? ''))]),
        'cited_names' => json_response(['groups' => cited_names_data($pdo, safe_text($_GET['q'] ?? '')), 'roles' => CITED_ROLES]),
        'transcriptions_list' => json_response(['media' => transcriptions_list($pdo, safe_text($_GET['q'] ?? ''))]),
        'media_transcription' => json_response(['media' => media_transcription_detail($pdo, safe_int($_GET['id'] ?? 0)), 'roles' => CITED_ROLES]),
        'impossible_journeys' => json_response(['alerts' => impossible_journeys($pdo, safe_int($_GET['person_id'] ?? 0))]),
        'sync_status' => json_response(sync_status($pdo)),
        'sync_export' => sync_export($pdo),
        'ask_question' => json_response(ask_question($pdo, safe_text($_GET['q'] ?? ''), safe_int($_GET['person_id'] ?? 0))),
        'languages_overview' => json_response(languages_overview($pdo)),
        'record_languages' => json_response(['languages' => record_languages_for($pdo, ($_GET['type'] ?? '') === 'media' ? 'media' : 'event', [safe_int($_GET['id'] ?? 0)])[safe_int($_GET['id'] ?? 0)] ?? [], 'catalog' => LANGUAGES, 'certainties' => LANGUAGE_CERTAINTY]),
        'villages' => json_response(['villages' => villages_list($pdo, safe_text($_GET['q'] ?? ''))]),
        'census_households' => json_response(census_households($pdo, ['village' => (string) ($_GET['village'] ?? ''), 'year' => safe_int($_GET['year'] ?? 0), 'q' => safe_text($_GET['q'] ?? '')])),
        'village' => json_response(village_detail($pdo, safe_text($_GET['key'] ?? ''))),
        'village_wiki_population' => json_response(village_wiki_population($pdo, safe_text($_GET['key'] ?? ''), safe_text($_GET['title'] ?? ''))),
        'htr_setup_status' => json_response(htr_setup_status()),
        'my_lists' => json_response(['lists' => my_lists($pdo), 'event_types' => $pdo->query('SELECT id, label, gedcom_tag FROM event_types ORDER BY label COLLATE NOCASE')->fetchAll(), 'labels' => $pdo->query('SELECT id, name, color FROM labels ORDER BY name COLLATE NOCASE')->fetchAll(), 'columns' => my_list_columns(), 'sources' => my_list_source_labels()]),
        'my_list_rows' => json_response(my_list_rows($pdo, safe_int($_GET['id'] ?? 0))),
        'atelier_projects' => json_response(atelier_projects($pdo)),
        'media_av_list' => json_response(media_av_list($pdo, safe_text($_GET['kind'] ?? 'audio'))),
        'recueils' => json_response(recueils_list($pdo, safe_text($_GET['q'] ?? ''))),
        'genea_calendar' => json_response(genea_calendar_events($pdo, $_GET)),
        'my_agenda' => json_response(my_agenda($pdo)),
        'recueil' => json_response(recueil_detail($pdo, safe_int($_GET['id'] ?? 0))),
        'recueils_for' => json_response(['recueils' => recueils_for_entity($pdo, safe_text($_GET['type'] ?? ''), safe_text($_GET['key'] ?? ''))]),
        'addr_map' => json_response(addr_map_data($pdo, $_GET)),
        'recueil_media_targets' => json_response(recueil_media_targets($pdo, safe_text($_GET['type'] ?? ''), safe_text($_GET['key'] ?? ''))),
        'recueil_media_owners' => json_response(recueil_media_owners($pdo, safe_int($_GET['media_id'] ?? 0))),
        'recueil_search' => json_response(recueil_search_entities($pdo, safe_text($_GET['type'] ?? ''), safe_text($_GET['q'] ?? ''))),
        'atelier_project' => json_response(atelier_project($pdo, safe_int($_GET['id'] ?? 0))),
        'widget_rows' => json_response(widget_rows($pdo, is_array($wq = json_decode((string) ($_GET['q'] ?? '{}'), true)) ? $wq : [])),
        'export_my_list' => json_response(export_my_list($pdo, safe_int($_GET['id'] ?? 0))),
        'museums' => json_response(['museums' => museums_list($pdo)]),
        'museum' => json_response(['museum' => museum_get($pdo, safe_int($_GET['id'] ?? 0))]),
        'museum_pick' => json_response(['items' => museum_pick($pdo, (string) ($_GET['what'] ?? 'media'), mb_substr(safe_text($_GET['q'] ?? ''), 0, 100))]),
        'museum_export' => museum_export($pdo, safe_int($_GET['id'] ?? 0), (string) ($_GET['format'] ?? 'lcnda')),
        'media_versions' => json_response(['versions' => retouch_versions($pdo, safe_int($_GET['id'] ?? 0))]),
        'recent_acts' => json_response(['acts' => recent_acts($pdo)]),
        'act_request_letter' => json_response(act_request_letter($pdo, safe_int($_GET['event_id'] ?? 0), safe_text($_GET['requester'] ?? ''), safe_text($_GET['relation'] ?? ''))),
        'historical_context' => json_response(historical_context($pdo)),
        'vault_status' => json_response(vault_status($pdo)),
        'vault_download' => vault_download($pdo, safe_int($_GET['id'] ?? 0)),
        'age_checks' => json_response(age_checks($pdo)),
        'harmonize_history' => json_response(['items' => harmonize_history($pdo)]),
        'variant_groups' => json_response(['groups' => variant_groups($pdo, safe_text($_GET['field'] ?? 'occupation'))]),
        'suspicious_places' => json_response(suspicious_places($pdo)),
        'heights_data' => json_response(heights_data($pdo)),
        'resistance' => json_response(resistance_data($pdo, safe_int($_GET['person_id'] ?? 0))),
        'resistance_overview' => json_response(['people' => resistance_overview($pdo), 'kinds' => RESISTANCE_KINDS]),
        'voter' => json_response(voter_data($pdo, safe_int($_GET['person_id'] ?? 0))),
        'voter_overview' => json_response(['people' => voter_overview($pdo), 'elections' => VOTE_ELECTIONS]),
        'custom_blocks_defs' => json_response(['blocks' => custom_blocks_defs($pdo), 'types' => CUSTOM_FIELD_TYPES]),
        'export_custom_block_def' => export_custom_block_def($pdo, safe_int($_GET['id'] ?? 0)),
        'compare_people' => json_response(compare_people($pdo, safe_int($_GET['a'] ?? 0), safe_int($_GET['b'] ?? 0))),
        'help_requests' => json_response(help_requests_data($pdo, safe_text($_GET['status'] ?? 'open'))),
        'help_request_draft' => json_response(['message' => help_request_message($pdo, safe_int($_GET['person_id'] ?? 0), safe_text($_GET['target'] ?? 'other'), safe_text($_GET['question'] ?? ''), safe_text($_GET['format'] ?? 'forum'))]),
        'family_objects' => json_response(['objects' => family_objects_data($pdo, safe_int($_GET['person_id'] ?? 0), safe_text($_GET['q'] ?? ''))]),
        'family_memories' => json_response(['memories' => family_memories_data($pdo, safe_int($_GET['person_id'] ?? 0), safe_text($_GET['q'] ?? ''), safe_text($_GET['kind'] ?? '')), 'kinds' => MEMORY_KINDS]),
        'precise_places' => json_response(['places' => precise_places_list($pdo, safe_text($_GET['q'] ?? ''), max(5, min(500, safe_int($_GET['radius'] ?? 30))))]),
        'precise_place' => json_response(precise_place_detail($pdo, safe_text($_GET['key'] ?? ''), max(5, min(500, safe_int($_GET['radius'] ?? 30))))),
        'link_inventory' => json_response(['links' => link_inventory($pdo)]),
        'saint_of_day' => json_response(saint_of_day_data($pdo, max(1, min(12, safe_int($_GET['month'] ?? 0) ?: (int) date('n'))), max(1, min(31, safe_int($_GET['day'] ?? 0) ?: (int) date('j'))))),
        'saint_stats' => json_response(saint_stats_data($pdo)),
        'boards' => json_response(['boards' => boards_list($pdo, $_GET)]),
        'topic_sheets' => json_response(['sheets' => topic_sheets_list($pdo)]),
        'periodicals' => json_response(periodicals_all($pdo)),
        'diagrams' => json_response(diagrams_all($pdo, $_GET)),
        'vector_docs' => json_response(['docs' => vector_docs_list($pdo)]),
        'dna' => json_response(dna_all($pdo, $_GET)),
        'dna_lines' => json_response(dna_lines($pdo, safe_int($_GET['person_id'] ?? 0), safe_int($_GET['depth'] ?? 10))),
        'dna_tree' => json_response(dna_tree_data($pdo, safe_int($_GET['kit'] ?? 0), safe_int($_GET['gen'] ?? 8))),
        'vector_doc' => json_response(vector_doc_get($pdo, safe_int($_GET['id'] ?? 0))),
        'houses' => json_response(['items' => houses_list($pdo)]),
        'house' => json_response(house_get($pdo, safe_int($_GET['id'] ?? 0))),
        'house_links' => json_response(['items' => house_links_lookup($pdo, safe_int($_GET['person_id'] ?? 0), safe_int($_GET['census_id'] ?? 0))]),
        'house_models' => json_response(['items' => house_models_list($pdo)]),
        'house_model' => house_model_file($pdo, safe_int($_GET['id'] ?? 0)),
        'slideshows' => json_response(['items' => slideshows_list($pdo)]),
        'slideshow' => json_response(slideshow_get($pdo, safe_int($_GET['id'] ?? 0))),
        'act_transcriptions' => json_response(['items' => act_transcriptions_list($pdo)]),
        'act_transcription' => json_response(act_transcription_get($pdo, safe_int($_GET['id'] ?? 0))),
        'vector_map_places' => json_response(vector_map_places($pdo, (float) ($_GET['n'] ?? 0), (float) ($_GET['s'] ?? 0), (float) ($_GET['w'] ?? 0), (float) ($_GET['e'] ?? 0))),
        'diagram_people' => json_response(diagram_people($pdo, array_map('intval', explode(',', (string) ($_GET['ids'] ?? ''))))),
        'person_names' => json_response(person_names($pdo)),
        'picker_search' => json_response(picker_search($pdo, $_GET)),
        'periodical_link_search' => json_response(periodical_link_search($pdo, (string) ($_GET['q'] ?? ''))),
        'press_ads' => json_response(press_ads_all($pdo)),
        'topic_sheet_templates' => json_response(['templates' => topic_sheet_templates($pdo)]),
        'layout_docs' => json_response(['docs' => layout_docs_list($pdo)]),
        'layout_doc' => json_response(layout_doc_get($pdo, safe_int($_GET['id'] ?? 0))),
        'montage_projects' => json_response(['projects' => montage_projects_list($pdo)]),
        'retouch_projects' => json_response(['projects' => retouch_projects_list($pdo)]),
        'audio_projects' => json_response(['projects' => audio_projects_list($pdo)]),
        'audio_project' => json_response(audio_project_get($pdo, safe_int($_GET['id'] ?? 0))),
        'retouch_project' => json_response(retouch_project_get($pdo, safe_int($_GET['id'] ?? 0))),
        'montage_project' => json_response(montage_project_get($pdo, safe_int($_GET['id'] ?? 0))),
        'layout_family_data' => json_response(layout_family_data($pdo, $_GET)),
        'layout_tree_data' => json_response(layout_tree_data($pdo, $_GET)),
        'layout_source' => json_response(layout_source($pdo, safe_int($_GET['id'] ?? 0))),
        'layout_check_data' => json_response(layout_check_data($pdo, $_GET)),
        'layout_index_terms' => json_response(layout_index_terms($pdo)),
        'topic_sheet' => json_response(topic_sheet_detail($pdo, safe_int($_GET['id'] ?? 0))),
        'media_brief' => json_response(media_brief($pdo, (string) ($_GET['ids'] ?? ''))),
        'board' => json_response(board_detail($pdo, safe_int($_GET['id'] ?? 0))),
        'board_place_key' => json_response((function () use ($pdo) { $s = $pdo->prepare('SELECT id, name, county, admin4_code FROM places WHERE id=?'); $s->execute([safe_int($_GET['id'] ?? 0)]); $r = $s->fetch(); return ['key' => $r && function_exists('village_key') ? village_key($r) : '']; })()),
        'board_people' => json_response(['people' => (object) board_people($pdo, explode(',', (string) ($_GET['ids'] ?? '')), ($_GET['events'] ?? '') === '1')]),
        'board_place_search' => json_response(['places' => board_place_search($pdo, safe_text($_GET['q'] ?? ''), (int) ($_GET['limit'] ?? 15))]),
        'board_family_search' => json_response(['families' => board_family_search($pdo, safe_text($_GET['q'] ?? ''))]),
        'board_link_person' => json_response(['person_id' => board_link_person($pdo, safe_text($_GET['kind'] ?? ''), safe_int($_GET['id'] ?? 0))]),
        'board_links_check' => json_response(board_links_check($pdo, ['links' => json_decode((string) ($_GET['links'] ?? '[]'), true) ?: []])),
        'board_snapshots' => json_response(['snapshots' => board_snapshots($pdo, safe_int($_GET['board_id'] ?? 0))]),
        'board_snapshot' => json_response(board_snapshot_detail($pdo, safe_int($_GET['id'] ?? 0))),
        'boards_linked' => json_response(['boards' => boards_linked($pdo, (string) ($_GET['kind'] ?? ''), safe_int($_GET['id'] ?? 0))]),
        'research_lists' => json_response(['rows' => research_lists_overview($pdo, safe_text($_GET['kind'] ?? ''))]),
        'pets' => json_response(['pets' => pets_list($pdo, $_GET), 'species' => PET_SPECIES]),
        'pet' => json_response(pet_detail($pdo, safe_int($_GET['id'] ?? 0))),
        'pet_pedigree' => json_response(['ancestors' => pet_ancestors($pdo, safe_int($_GET['id'] ?? 0), max(1, min(10, safe_int($_GET['gens'] ?? 5))))]),
        'booklets' => json_response(['booklets' => booklets_list($pdo, safe_text($_GET['q'] ?? ''))]),
        'booklet' => json_response(booklet_detail($pdo, safe_int($_GET['id'] ?? 0))),
        'booklet_proposals' => json_response(booklet_proposals($pdo, safe_int($_GET['id'] ?? 0))),
        'employer_lookup' => json_response(employer_lookup(safe_text($_GET['q'] ?? ''))),
        'employer_record' => json_response(employer_record_detail($pdo, safe_text($_GET['name'] ?? ''))),
        'research_suggestions' => json_response(research_suggestions_data($pdo, max(1, min(200, safe_int($_GET['limit'] ?? 40))))),
        'research_gaps' => json_response(research_gaps_data($pdo, $_GET)),
        'faces_index' => json_response(faces_index($pdo)),
        'artist_items' => json_response(['items' => artist_items_for($pdo, safe_int($_GET['person_id'] ?? 0))]),
        'art' => json_response(art_api_get($pdo, $_GET)), // 🎨 moteur des catalogues d'artistes (lib/art_engine.php)
        'quick_search' => json_response(quick_search_data($pdo, safe_text($_GET['q'] ?? ''))),
        'implexe' => json_response(implexe_data($pdo, safe_int($_GET['id'] ?? 0) ?: (int) $pdo->query('SELECT id FROM persons WHERE is_start=1 LIMIT 1')->fetchColumn())),
        'online_registers' => json_response(online_registers($pdo, (string) ($_GET['code'] ?? ''), trim((string) ($_GET['name'] ?? '')))),
        'person_labels' => json_response(['people' => person_labels($pdo, (string) ($_GET['ids'] ?? ''))]),
        'census_member_memberships' => census_member_memberships_data($pdo, safe_int($_GET['person_id'] ?? 0)),
        'tree' => tree_data($pdo, safe_int($_GET['id'] ?? 0)),
        'kinship' => kinship_data($pdo, safe_int($_GET['from'] ?? 0), safe_int($_GET['to'] ?? 0)),
        'map' => map_data($pdo),
        'list' => list_data($pdo),
        'graph_stats' => graph_stats_data($pdo),
        'graph_distribution' => graph_distribution_data($pdo),
        'place_monograph' => place_monograph_data($pdo),
        'graph_network' => graph_network_data($pdo, safe_text($_GET['kind'] ?? ''), safe_int($_GET['id'] ?? 0)),
        'timeline' => timeline_data($pdo, safe_int($_GET['id'] ?? 0)),
        'timeline_people' => timeline_people_data($pdo, safe_int($_GET['id'] ?? 0)),
        'research' => research_data($pdo),
        'transcription_search' => transcription_search_data($pdo),
        'place_name_search' => place_name_search_data($pdo),
        'archive_digest_search' => archive_digest_search_data($pdo),
        'archive_digest_media_search' => archive_digest_media_search_data($pdo),
        'archive_digest_auxiliary' => archive_digest_auxiliary_data($pdo),
        'archive_visit_plans' => archive_visit_plans_data($pdo),
        'archive_digest_transcriptions' => archive_digest_transcriptions_data($pdo, safe_int($_GET['id'] ?? 0)),
        'place_name_facets' => place_name_facets_data($pdo),
        'date_search' => date_search_data($pdo),
        'proximity_search' => proximity_search_data($pdo),
        'investigations' => investigations_data($pdo),
        'investigation' => investigation_detail($pdo, safe_int($_GET['id'] ?? 0)),
        'hypotheses' => hypotheses_data($pdo),
        'branches' => branches_data($pdo),
        'comparison' => comparison_data($pdo),
        'duplicate_candidates' => duplicate_candidates($pdo),
        'media_duplicates' => media_duplicates_data($pdo),
        'deed_preview' => deed_preview($pdo),
        'issues' => issues_data($pdo),
        'person_count' => json_response(['count' => (int) $pdo->query("SELECT count(*) FROM persons WHERE kind<>'animal'")->fetchColumn(), 'animals' => (int) $pdo->query("SELECT count(*) FROM persons WHERE kind='animal'")->fetchColumn()]),
        'ghost_families' => ghost_families_data($pdo),
        'reference_countries' => json_response(['available' => reference_countries_available(), 'details' => reference_countries_details(), 'active' => reference_countries_active($pdo)]),
        'bulk_preview' => bulk_preview($pdo),
        'lock_candidates' => lock_candidates($pdo),
        'labels' => labels_data($pdo),
        'place_suggestions' => place_suggestions_data($pdo),
        'commune_suggestions' => commune_suggestions_data($pdo),
        'battues' => battues_data($pdo),
        'battue_detail' => battue_detail($pdo, safe_int($_GET['id'] ?? 0)),
        'changes' => changes_data($pdo),
        'person_history' => person_history_data($pdo),
        'undo_candidate' => json_response(undo_candidate($pdo)),
        'export_csv' => export_csv($pdo),
        'export_csv_global' => export_csv_global($pdo),
        'export_gedcom' => export_gedcom($pdo),
        'export_json' => export_json($pdo),
        'export_sqlite' => export_sqlite($pdo),
        'export_full_backup' => export_full_backup($pdo),
        'export_research_report' => export_research_report($pdo),
        'export_family_book' => export_family_book($pdo),
        'backup_sqlite_status' => backup_sqlite_status($pdo, safe_text($_GET['dir'] ?? ''), safe_int($_GET['max_files'] ?? 10, 10)),
        'data_health_report' => data_health_report($pdo),
        'compare_database' => compare_database_data($pdo, safe_text($_GET['source'] ?? '')),
        'verify_gedcom' => verify_gedcom($pdo),
        'compare_gedcom' => compare_gedcom($pdo),
        'import_analyse' => import_analyse($pdo),
        'init_database' => json_response(['ok' => true]),
        'import_package', 'import_local_path' => import_package($pdo, $importFile),
        'event_types_admin' => event_types_admin($pdo),
        'sosa_map' => sosa_map_data($pdo, safe_int($_GET['root_id'] ?? 0)),
        'daboville_map' => daboville_map_data($pdo, safe_int($_GET['root_id'] ?? 0)),
        'military' => military_data($pdo, safe_int($_GET['id'] ?? 0)),
        'cemetery' => cemetery_data($pdo, safe_int($_GET['id'] ?? 0)),
        'cemetery_map' => cemetery_map_data($pdo),
        'personal_dictionary' => personal_dictionary_data($pdo),
        'media_tags' => get_media_tags_data($pdo, safe_int($_GET['media_id'] ?? 0)),
        'search' => search_alias_data($pdo),
        'insee_stats' => insee_deces_stats($pdo),
        'insee_search' => insee_deces_search($pdo),
        'insee_import' => insee_deces_import($pdo),
        'insee_imports_list' => insee_deces_imports_list($pdo),
        'insee_remote_files' => json_response(insee_remote_files($pdo)),
        default => json_response(['error' => 'Action inconnue'], 404),
    };
} catch (Throwable $e) {
    if ($justInitialized && is_file(DB_PATH)) {
        $personsLeft = 1; // par défaut on ne supprime pas si on n'arrive pas à vérifier
        try { $personsLeft = (int) (new PDO('sqlite:' . DB_PATH))->query('SELECT count(*) FROM persons')->fetchColumn(); } catch (Throwable $_) { $personsLeft = 0; }
        if ($personsLeft === 0) {
            @unlink(DB_PATH);
            foreach ([DB_PATH . '-wal', DB_PATH . '-shm', DB_PATH . '-journal'] as $auxFile) {
                if (is_file($auxFile)) { @unlink($auxFile); }
            }
        }
    }
    json_response(['error' => readable_error_message($e)], 500);
}

function bootstrap_data(PDO $pdo): never
{
    $stats = [];
    foreach (['persons' => 'personnes', 'families' => 'familles', 'events' => 'événements', 'media' => 'médias'] as $table => $label) {
        $stats[$label] = (int) $pdo->query("SELECT count(*) FROM {$table}" . ($table === 'persons' ? " WHERE kind<>'animal'" : ''))->fetchColumn();
    }
    $stats['animaux'] = (int) $pdo->query("SELECT count(*) FROM persons WHERE kind='animal'")->fetchColumn();
    $start = $pdo->query("SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1")->fetchColumn();
    $types = $pdo->query('SELECT t.id,t.scope,t.slug,t.label,t.gedcom_tag,t.icon,t.color,t.is_custom,t.is_artistic,t.custom_fields,count(e.id) AS usage_count FROM event_types t LEFT JOIN events e ON e.event_type_id=t.id WHERE t.is_active=1 GROUP BY t.id ORDER BY t.label COLLATE NOCASE,t.scope')->fetchAll();
    $views = $pdo->query('SELECT * FROM saved_views ORDER BY module,sort_order,id')->fetchAll();
    $viewLabels = labels_for_entities($pdo, 'view', array_map(static fn($view)=>(int)$view['id'], $views));
    foreach ($views as &$view) $view['config'] = json_decode($view['config_json'], true) ?: [];
    foreach ($views as &$view) $view['labels'] = $viewLabels[(int)$view['id']] ?? [];
    unset($view);
    $occupations = $pdo->query("
        SELECT TRIM(val) AS name, COUNT(DISTINCT person_id) AS person_count
        FROM (
            SELECT p.id AS person_id, p.occupation AS val
            FROM persons p WHERE p.occupation IS NOT NULL AND TRIM(p.occupation)!=''
            UNION ALL
            SELECT e.person_id, COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),'')) AS val
            FROM events e JOIN event_types t ON t.id=e.event_type_id
            WHERE e.person_id IS NOT NULL AND t.gedcom_tag='OCCU'
              AND COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),'')) IS NOT NULL
            UNION ALL
            SELECT cm.person_id, cm.occupation AS val
            FROM census_members cm WHERE cm.person_id IS NOT NULL AND cm.occupation IS NOT NULL AND TRIM(cm.occupation)!=''
        ) src
        WHERE TRIM(val)!=''
        GROUP BY LOWER(TRIM(val))
        ORDER BY person_count DESC, LOWER(TRIM(val)) COLLATE NOCASE
    ")->fetchAll();
    $mapTags = $pdo->query("
        SELECT t.gedcom_tag, t.label, count(e.id) AS cnt
        FROM events e
        JOIN event_types t ON t.id=e.event_type_id
        JOIN places pl ON pl.id=e.place_id
        WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
          AND pl.name IS NOT NULL AND trim(pl.name)<>''
          AND lower(trim(pl.name)) NOT IN ('lieu sans nom','sans lieu','lieu inconnu','inconnu','unknown','pays inconnu')
          AND NOT (pl.county IS NULL AND pl.state IS NULL AND lower(trim(pl.name))=lower(trim(pl.country)))
          AND t.gedcom_tag IS NOT NULL AND t.gedcom_tag<>''
        GROUP BY t.gedcom_tag, t.label
        ORDER BY cnt DESC, t.label COLLATE NOCASE
    ")->fetchAll();
    // Ajouter CENS si des recensements géocodés existent (census_records n'est pas dans events)
    $censusCnt = (int)$pdo->query("
        SELECT count(*) FROM census_records cr
        JOIN places pl ON pl.id=cr.place_id
        WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
          AND pl.name IS NOT NULL AND trim(pl.name)<>''
    ")->fetchColumn();
    if($censusCnt>0 && !in_array('CENS',array_column($mapTags,'gedcom_tag'),true)){
        $mapTags[] = ['gedcom_tag'=>'CENS','label'=>'Recensement','cnt'=>$censusCnt];
    }
    $surnames = $pdo->query("
        SELECT last_name AS name, count(*) AS person_count
        FROM persons
        WHERE last_name IS NOT NULL AND trim(last_name)<>''
          AND lower(trim(last_name)) NOT IN ('inconnu','unknown')
          AND last_name NOT GLOB '[?X]*'
        GROUP BY last_name COLLATE NOCASE
        ORDER BY person_count DESC, last_name COLLATE NOCASE
    ")->fetchAll();
    $archivePeople = $pdo->query("
        SELECT p.id,p.first_name,p.middle_name,p.last_name,p.gender,p.living_status,COALESCE(g.name,'') AS surname_group,
               (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_date,
               (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
               (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_date,
               (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year
        FROM persons p
        LEFT JOIN surname_groups g ON g.id=p.surname_group_id
        ORDER BY lower(coalesce(nullif(trim(p.last_name),''),'zzzz')), lower(coalesce(nullif(trim(p.first_name),''),'')), p.id
    ")->fetchAll();
    json_response([
        'csrf' => csrf_token(),
        'stats' => $stats,
        'startPersonId' => (int) $start,
        'startPersonFlagged' => (bool) $pdo->query('SELECT 1 FROM persons WHERE is_start=1 LIMIT 1')->fetchColumn(),
        'eventTypes' => $types,
        'savedViews' => $views,
        'importedAt' => $pdo->query("SELECT value FROM meta WHERE key='imported_at'")->fetchColumn(),
        'occupations' => $occupations,
        'mapEventTags' => $mapTags,
        'surnames' => $surnames,
        'archivePeople' => $archivePeople,
        'siteDefaults' => site_defaults_read(),
    ]);
}

function site_defaults_allowed_keys(): array
{
    return [
        'genealogie-design',
        'genealogie-design-presets',
        'genealogie-menu-order',
        'genealogie-menu-hidden',
        'genealogie-list-order',
        'genealogie-list-hidden',
        'genealogie-map-order',
        'genealogie-map-hidden',
        'genealogie-maintenance-order',
        'genealogie-graph-diagram-order',
        'genealogie-graph-diagram-hidden',
        'genealogie-graph-stats-order',
        'genealogie-graph-stats-hidden',
        'genealogie-tile-cat-order',
        'genealogie-tile-hidden-cats',
        'genealogie-tile-hidden',
        'genealogie-tile-custom-cats',
        'genealogie-person-blocks',
        'genealogie-dashboard-widget-catalog-order',
        'genealogie-dashboard-widget-catalog-hidden',
        'genealogie-events-filter',
        'genealogie-stats-colors',
        'genealogie-stats-colors-presets',
        'genealogie-gender-colors',
        'genealogie-tree-card-fields',
        'genealogie-identity-name-variants-display',
        'genealogie-battue-level-colors',
        'genealogie-battue-level-color-presets',
        'genealogie-person-badge-colors',
        'genealogie-person-badge-color-presets',
        'genealogie-board-prefs',
        'genealogie-board-prefs-sets',
    ];
}

function site_defaults_read(): array
{
    $defaultsPath=SITE_DEFAULTS_PATH;
    if(!is_file($defaultsPath)&&is_file(SITE_DEFAULTS_LEGACY_PATH))$defaultsPath=SITE_DEFAULTS_LEGACY_PATH;
    if(!is_file($defaultsPath))return ['settings'=>new stdClass(),'updated_at'=>null];
    $json=json_decode((string)file_get_contents($defaultsPath),true);
    if(!is_array($json))return ['settings'=>new stdClass(),'updated_at'=>null];
    $settings=[];
    $allowed=site_defaults_allowed_keys();
    foreach(($json['settings']??[]) as $key=>$value){
        if((in_array($key,$allowed,true)||str_starts_with((string)$key,'genealogie-tile-items-'))&&is_string($value))$settings[$key]=$value;
    }
    return ['settings'=>$settings,'updated_at'=>(string)($json['updated_at']??'')];
}

function save_site_defaults(PDO $pdo,array $data): array
{
    $raw=$data['settings']??[];
    if(!is_array($raw))throw new RuntimeException('Réglages invalides.');
    $allowed=site_defaults_allowed_keys();
    $settings=[];
    foreach($raw as $key=>$value){
        $key=(string)$key;
        if(!in_array($key,$allowed,true)&&!str_starts_with($key,'genealogie-tile-items-'))continue;
        if(!is_string($value))$value=json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        $value=(string)$value;
        // les réglages des tableaux peuvent contenir des formes faites d'une image : plus de place pour eux
        if(strlen($value)>(str_starts_with($key,'genealogie-board-prefs')?4000000:200000))throw new RuntimeException('Un réglage est trop volumineux.');
        $settings[$key]=$value;
    }
    if(!is_dir(dirname(SITE_DEFAULTS_PATH))&&!mkdir(dirname(SITE_DEFAULTS_PATH),0775,true)&&!is_dir(dirname(SITE_DEFAULTS_PATH)))throw new RuntimeException('Impossible de créer le dossier de configuration.');
    $payload=['updated_at'=>date('c'),'settings'=>$settings];
    $json=json_encode($payload,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    if($json===false||file_put_contents(SITE_DEFAULTS_PATH,$json."\n")===false)throw new RuntimeException('Impossible d’enregistrer les défauts du site.');
    log_change($pdo,'settings',0,'site-defaults','Réglages d’apparence définis comme défaut du site',null,['keys'=>array_keys($settings)]);
    return ['count'=>count($settings),'updated_at'=>$payload['updated_at']];
}

function person_select(): string
{
    return "SELECT p.*, g.name AS surname_group,
        (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_date,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
        (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_date,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year,
        (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE (f.partner1_id=p.id OR f.partner2_id=p.id) AND t.gedcom_tag IN ('MARR','MRCI','MRRE') ORDER BY e.id LIMIT 1) AS marr_date,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE (f.partner1_id=p.id OR f.partner2_id=p.id) AND t.gedcom_tag IN ('MARR','MRCI','MRRE') ORDER BY e.id LIMIT 1) AS marr_year,
        (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BURI' ORDER BY e.id LIMIT 1) AS buri_date,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BURI' ORDER BY e.id LIMIT 1) AS buri_year,
        (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('CHR','BAPM') ORDER BY e.id LIMIT 1) AS bapt_date,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('CHR','BAPM') ORDER BY e.id LIMIT 1) AS bapt_year,
        (SELECT COALESCE(NULLIF(m.thumbnail,''),m.filename) FROM media m WHERE m.id=p.portrait_media_id) AS portrait
        FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id";
}

function dashboard_person_name_expr(string $alias = 'p'): string
{
    return "trim(replace(replace(COALESCE({$alias}.first_name,'')||' '||COALESCE({$alias}.middle_name,'')||' '||COALESCE({$alias}.last_name,''),'  ',' '),'  ',' '))";
}

function dashboard_people_to_complete(PDO $pdo): array
{
    $sql = "SELECT p.id," . dashboard_person_name_expr('p') . " AS person_name,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year,
        EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT') AS has_birth,
        EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT') AS has_death,
        EXISTS(SELECT 1 FROM family_children fc WHERE fc.child_id=p.id) AS has_parents,
        EXISTS(SELECT 1 FROM media_links ml WHERE (ml.entity_type='person' AND ml.entity_id=p.id) OR (ml.entity_type='event' AND ml.entity_id IN (SELECT id FROM events WHERE person_id=p.id OR family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id)))) AS has_media,
        EXISTS(SELECT 1 FROM source_links sl WHERE (sl.entity_type='person' AND sl.entity_id=p.id) OR (sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE person_id=p.id OR family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id)))) AS has_source
        FROM persons p
        WHERE NOT EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT')
           OR NOT EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT')
           OR NOT EXISTS(SELECT 1 FROM family_children fc WHERE fc.child_id=p.id)
           OR NOT EXISTS(SELECT 1 FROM source_links sl WHERE (sl.entity_type='person' AND sl.entity_id=p.id) OR (sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE person_id=p.id OR family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id))))
        ORDER BY p.updated_at DESC,p.id DESC
        LIMIT 60";
    $rows = $pdo->query($sql)->fetchAll();
    foreach ($rows as &$row) {
        $reasons = [];
        if (!(int)$row['has_birth']) $reasons[] = 'naissance manquante';
        if (!(int)$row['has_death']) $reasons[] = 'décès manquant';
        if (!(int)$row['has_parents']) $reasons[] = 'parents manquants';
        if (!(int)$row['has_source']) $reasons[] = 'source manquante';
        if (!(int)$row['has_media']) $reasons[] = 'aucun média';
        $row['reasons'] = $reasons;
        if (trim((string)$row['person_name']) === '') $row['person_name'] = 'Personne sans nom';
    }
    unset($row);
    return $rows;
}

function dashboard_events_without_sources(PDO $pdo): array
{
    return $pdo->query("SELECT e.id,COALESCE(e.person_id,f.partner1_id,f.partner2_id) AS person_id,e.date_text,e.year,t.label AS type_label,pl.name AS place_name,CASE WHEN p.id IS NULL AND (p1.id IS NOT NULL OR p2.id IS NOT NULL) THEN trim(COALESCE(" . dashboard_person_name_expr('p1') . ",'')||CASE WHEN p1.id IS NOT NULL AND p2.id IS NOT NULL THEN ' & ' ELSE '' END||COALESCE(" . dashboard_person_name_expr('p2') . ",'')) ELSE " . dashboard_person_name_expr('p') . " END AS person_name
        FROM events e
        JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN persons p ON p.id=e.person_id
        LEFT JOIN families f ON f.id=e.family_id LEFT JOIN persons p1 ON p1.id=f.partner1_id LEFT JOIN persons p2 ON p2.id=f.partner2_id
        LEFT JOIN places pl ON pl.id=e.place_id
        WHERE NOT EXISTS(SELECT 1 FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id)
        ORDER BY COALESCE(e.updated_at,e.created_at) DESC,e.id DESC
        LIMIT 60")->fetchAll();
}

function dashboard_media_to_transcribe(PDO $pdo): array
{
    return $pdo->query("SELECT id,title,filename,media_type,date_text,document_reference,document_title FROM media
        WHERE media_type IN ('image','pdf') AND trim(COALESCE(transcription,''))=''
        ORDER BY created_at DESC,id DESC LIMIT 60")->fetchAll();
}

function dashboard_media_unlinked(PDO $pdo): array
{
    return $pdo->query("SELECT id,title,filename,media_type,date_text,document_reference,document_title FROM media m
        WHERE NOT EXISTS(SELECT 1 FROM media_links ml WHERE ml.media_id=m.id)
          AND NOT EXISTS(SELECT 1 FROM investigation_media im WHERE im.media_id=m.id)
          AND NOT EXISTS(SELECT 1 FROM family_collection_media cm WHERE cm.media_id=m.id)
          AND NOT EXISTS(SELECT 1 FROM archive_digest_media adm WHERE adm.media_id=m.id)
        ORDER BY created_at DESC,id DESC LIMIT 60")->fetchAll();
}

function dashboard_persons_without_sources(PDO $pdo): array
{
    return $pdo->query(person_select() . " WHERE NOT EXISTS(SELECT 1 FROM source_links sl WHERE sl.entity_type='person' AND sl.entity_id=p.id)
        AND NOT EXISTS(SELECT 1 FROM source_links sl JOIN events e ON sl.entity_type='event' AND sl.entity_id=e.id WHERE e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id))
        ORDER BY p.updated_at DESC,p.id DESC LIMIT 80")->fetchAll();
}

function dashboard_events_without_media(PDO $pdo): array
{
    return $pdo->query("SELECT e.id,COALESCE(e.person_id,f.partner1_id,f.partner2_id) AS person_id,e.date_text,e.year,t.label AS type_label,pl.name AS place_name,CASE WHEN p.id IS NULL AND (p1.id IS NOT NULL OR p2.id IS NOT NULL) THEN trim(COALESCE(" . dashboard_person_name_expr('p1') . ",'')||CASE WHEN p1.id IS NOT NULL AND p2.id IS NOT NULL THEN ' & ' ELSE '' END||COALESCE(" . dashboard_person_name_expr('p2') . ",'')) ELSE " . dashboard_person_name_expr('p') . " END AS person_name
        FROM events e
        JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN persons p ON p.id=e.person_id
        LEFT JOIN families f ON f.id=e.family_id LEFT JOIN persons p1 ON p1.id=f.partner1_id LEFT JOIN persons p2 ON p2.id=f.partner2_id
        LEFT JOIN places pl ON pl.id=e.place_id
        WHERE NOT EXISTS(SELECT 1 FROM media_links ml WHERE ml.entity_type='event' AND ml.entity_id=e.id)
        ORDER BY COALESCE(e.updated_at,e.created_at) DESC,e.id DESC
        LIMIT 80")->fetchAll();
}

function dashboard_recent_media(PDO $pdo): array
{
    return $pdo->query("SELECT id,title,filename,thumbnail,media_type,date_text,document_reference,document_title,created_at FROM media
        ORDER BY created_at DESC,id DESC LIMIT 80")->fetchAll();
}

function dashboard_media_to_identify(PDO $pdo): array
{
    return $pdo->query("SELECT m.id,m.title,m.filename,m.thumbnail,m.media_type,m.date_text,m.document_reference,m.document_title
        FROM media m
        WHERE m.media_type='image'
          AND NOT EXISTS(SELECT 1 FROM media_tags mt WHERE mt.media_id=m.id)
        ORDER BY m.created_at DESC,m.id DESC LIMIT 80")->fetchAll();
}

function dashboard_signatures_to_compare(PDO $pdo): array
{
    return $pdo->query("SELECT mt.id AS tag_id,mt.media_id,mt.person_id,mt.confidence,mt.note,m.title,m.filename,m.thumbnail,m.date_text,m.document_reference,m.document_title," . dashboard_person_name_expr('p') . " AS person_name
        FROM media_tags mt
        JOIN media m ON m.id=mt.media_id
        JOIN persons p ON p.id=mt.person_id
        WHERE COALESCE(mt.tag_type,'person')='signature'
        ORDER BY mt.created_at DESC,mt.id DESC LIMIT 80")->fetchAll();
}

function dashboard_places_to_complete(PDO $pdo): array
{
    return $pdo->query("SELECT pl.id,pl.name,pl.subdivision,pl.county,pl.state,pl.country,pl.latitude,pl.longitude,count(e.id) AS event_count
        FROM places pl
        LEFT JOIN events e ON e.place_id=pl.id
        WHERE pl.latitude IS NULL OR pl.longitude IS NULL OR (pl.latitude=0 AND pl.longitude=0) OR trim(COALESCE(pl.country,''))=''
        GROUP BY pl.id
        ORDER BY event_count DESC,pl.name COLLATE NOCASE
        LIMIT 80")->fetchAll();
}

function dashboard_branches_less_documented(PDO $pdo): array
{
    return $pdo->query("SELECT COALESCE(NULLIF(trim(g.name),''),'Sans groupe') AS branch,
            count(DISTINCT p.id) AS person_count,
            count(DISTINCT sl.id) AS source_count,
            count(DISTINCT ml.id) AS media_count
        FROM persons p
        LEFT JOIN surname_groups g ON g.id=p.surname_group_id
        LEFT JOIN source_links sl ON (sl.entity_type='person' AND sl.entity_id=p.id) OR (sl.entity_type='event' AND sl.entity_id IN (SELECT e.id FROM events e WHERE e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id)))
        LEFT JOIN media_links ml ON (ml.entity_type='person' AND ml.entity_id=p.id) OR (ml.entity_type='event' AND ml.entity_id IN (SELECT e.id FROM events e WHERE e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id)))
        GROUP BY branch
        HAVING person_count>0
        ORDER BY (source_count + media_count) * 1.0 / person_count ASC, person_count DESC
        LIMIT 80")->fetchAll();
}

function dashboard_couples_without_marriage(PDO $pdo): array
{
    return $pdo->query("SELECT f.id,f.partner1_id,f.partner2_id," . dashboard_person_name_expr('p1') . " AS partner1_name," . dashboard_person_name_expr('p2') . " AS partner2_name,
            count(fc.id) AS child_count
        FROM families f
        LEFT JOIN persons p1 ON p1.id=f.partner1_id
        LEFT JOIN persons p2 ON p2.id=f.partner2_id
        LEFT JOIN family_children fc ON fc.family_id=f.id
        WHERE NOT EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=f.id AND t.gedcom_tag IN ('MARR','MRCI','MRRE'))
          AND (f.partner1_id IS NOT NULL OR f.partner2_id IS NOT NULL)
        GROUP BY f.id
        ORDER BY child_count DESC,f.id DESC LIMIT 80")->fetchAll();
}

function dashboard_children_missing_parents(PDO $pdo): array
{
    return $pdo->query(person_select() . " WHERE NOT EXISTS(SELECT 1 FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=p.id AND f.partner1_id IS NOT NULL)
        OR NOT EXISTS(SELECT 1 FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=p.id AND f.partner2_id IS NOT NULL)
        ORDER BY p.updated_at DESC,p.id DESC LIMIT 80")->fetchAll();
}

function dashboard_consistency_issues(PDO $pdo, ?array $issues = null): array
{
    return array_slice($issues ?? compute_issues($pdo), 0, 80);
}

function dashboard_baptisms_without_sponsors(PDO $pdo): array
{
    return $pdo->query("SELECT e.id,e.person_id,e.date_text,e.year,t.label AS type_label,pl.name AS place_name," . dashboard_person_name_expr('p') . " AS person_name
        FROM events e
        JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN persons p ON p.id=e.person_id
        LEFT JOIN places pl ON pl.id=e.place_id
        WHERE t.gedcom_tag IN ('CHR','BAPM') AND NOT EXISTS(SELECT 1 FROM event_witnesses ew JOIN persons wp ON wp.id=ew.person_id WHERE ew.event_id=e.id)
        ORDER BY COALESCE(e.updated_at,e.created_at) DESC,e.id DESC
        LIMIT 80")->fetchAll();
}

function dashboard_sosa_root(PDO $pdo, int $rootId = 0): array|false
{
    if ($rootId > 0) {
        $stmt = $pdo->prepare("SELECT * FROM persons WHERE id=? LIMIT 1");
        $stmt->execute([$rootId]);
        $root = $stmt->fetch();
        if ($root) return $root;
    }
    $root = $pdo->query("SELECT * FROM persons WHERE is_start=1 ORDER BY id LIMIT 1")->fetch();
    if (!$root) $root = $pdo->query("SELECT * FROM persons ORDER BY id LIMIT 1")->fetch();
    return $root ?: false;
}

function dashboard_sosa_missing_near(PDO $pdo, int $rootId = 0): array
{
    $root = dashboard_sosa_root($pdo, $rootId);
    if (!$root) return [];
    $data = sosa_positions($pdo, (int)$root['id'], 120000);
    $positions = $data['positions'] ?? [];
    if (!$positions) return [];
    $max = min(255, max(array_keys($positions)));
    $rows = [];
    for ($n = 1; $n <= $max && count($rows) < 80; $n++) {
        if (!isset($positions[$n])) $rows[] = ['sosa'=>$n, 'side'=>($n < 2 ? '' : ((($n >> ((int) floor(log($n, 2)) - 1)) & 1) ? 'Maternel' : 'Paternel')), 'generation'=>(int)floor(log($n, 2)) + 1];
    }
    return $rows;
}

function dashboard_battues_priority(PDO $pdo): array
{
    return $pdo->query("SELECT b.id,b.title,b.status,b.updated_at,cc.name AS start_name,
            count(si.id) AS item_count,
            sum(CASE WHEN si.status='todo' THEN 1 ELSE 0 END) AS todo_count
        FROM battues b
        LEFT JOIN commune_contours cc ON cc.insee_code=b.start_insee_code
        LEFT JOIN battue_search_items si ON si.battue_id=b.id
        WHERE b.status<>'closed'
        GROUP BY b.id
        ORDER BY todo_count DESC,b.updated_at DESC,b.id DESC LIMIT 80")->fetchAll();
}

function dashboard_archive_favorites(PDO $pdo): array
{
    return array_slice(departmental_archives_seed(), 0, 80);
}

function dashboard_daily_research(PDO $pdo): array
{
    $rows = array_map(static fn(array $row): array => [
        'id' => (int)($row['id'] ?? 0),
        'title' => (string)($row['title'] ?? 'Rappel'),
        'origin' => (string)($row['origin'] ?? 'Rappel'),
        'status_label' => (string)($row['date_label'] ?? 'À faire'),
        'person_id' => (int)($row['person_id'] ?? 0),
        'priority' => 0,
    ], dashboard_reminders($pdo));
    $rows = array_merge($rows, dashboard_sources_to_check($pdo));
    $gaps = $pdo->query("SELECT g.id,g.title,g.period_text,g.gap_type,a.city_name,a.city_alias,p.name AS place_name
        FROM archive_digest_gaps g
        LEFT JOIN archive_digest_entries a ON a.id=g.archive_digest_id
        LEFT JOIN places p ON p.id=a.place_id
        WHERE g.status='open'
        ORDER BY g.created_at DESC,g.id DESC LIMIT 40")->fetchAll();
    $rows = array_merge($rows, array_map(static fn(array $gap): array => [
        'id' => (int)$gap['id'],
        'title' => (string)($gap['title'] ?: 'Lacune d’archives'),
        'origin' => trim(implode(' · ', array_filter([
            (string)($gap['city_alias'] ?: $gap['city_name'] ?: $gap['place_name'] ?: ''),
            (string)($gap['period_text'] ?? ''),
        ]))),
        'status_label' => 'Lacune à traiter',
        'person_id' => 0,
        'priority' => 1,
    ], $gaps));
    if (count($rows) < 10) {
        $rows = array_merge($rows, array_map(static fn($row) => [
            'id' => (int)$row['battue_id'],
            'title' => 'Battue · ' . (string)($row['commune_name'] ?? 'Commune'),
            'origin' => (string)($row['battue_title'] ?? ''),
            'status_label' => (string)($row['status_label'] ?? ''),
            'person_id' => 0,
        ], dashboard_battue_towns($pdo)));
    }
    usort($rows, static fn(array $a, array $b): int => ((int)($a['priority'] ?? 2) <=> (int)($b['priority'] ?? 2)) ?: strcmp((string)($a['title'] ?? ''), (string)($b['title'] ?? '')));
    return array_slice($rows, 0, 80);
}

function dashboard_reread_items(PDO $pdo): array
{
    return $pdo->query("SELECT ii.id,ii.title,ii.status,i.title AS investigation_title,i.person_id," . dashboard_person_name_expr('p') . " AS person_name
        FROM investigation_items ii
        JOIN investigations i ON i.id=ii.investigation_id
        LEFT JOIN persons p ON p.id=i.person_id
        WHERE ii.status IN ('to_recheck','uncertain','promising','to_explore_priority')
           OR ii.notes LIKE '%relire%' OR ii.notes LIKE '%doute%' OR ii.title LIKE '%relire%' OR ii.title LIKE '%doute%'
        ORDER BY ii.created_at DESC,ii.id DESC LIMIT 80")->fetchAll();
}

function dashboard_branch_map(PDO $pdo, string $branch = ''): array
{
    $branch = trim($branch);
    if ($branch === '') {
        $branch = (string)$pdo->query("SELECT g.name FROM persons p JOIN surname_groups g ON g.id=p.surname_group_id WHERE trim(COALESCE(g.name,''))<>'' GROUP BY g.name ORDER BY count(*) DESC,g.name COLLATE NOCASE LIMIT 1")->fetchColumn();
    }
    if ($branch === '') return ['branch'=>'', 'points'=>[], 'total'=>0];
    $stmt = $pdo->prepare("SELECT pl.id,pl.name,pl.subdivision,pl.county,pl.state,pl.country,pl.latitude,pl.longitude,count(DISTINCT e.id) AS count
        FROM persons p
        JOIN events e ON (e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id))
        JOIN places pl ON pl.id=e.place_id
        JOIN surname_groups g ON g.id=p.surname_group_id
        WHERE g.name=? AND pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL AND NOT (pl.latitude=0 AND pl.longitude=0)
        GROUP BY pl.id
        ORDER BY count DESC,pl.name COLLATE NOCASE LIMIT 240");
    $stmt->execute([$branch]);
    $points = $stmt->fetchAll();
    return ['branch'=>$branch, 'points'=>$points, 'total'=>count($points)];
}

function dashboard_sources_to_check(PDO $pdo): array
{
    $rows = $pdo->query("SELECT ii.id,ii.title,ii.status,i.title AS investigation_title,i.person_id," . dashboard_person_name_expr('p') . " AS person_name,
            CASE ii.status WHEN 'to_explore_priority' THEN 'À explorer (prioritaire)' WHEN 'to_explore' THEN 'À explorer' WHEN 'promising' THEN 'Prometteuse' ELSE ii.status END AS status_label
        FROM investigation_items ii
        JOIN investigations i ON i.id=ii.investigation_id
        LEFT JOIN persons p ON p.id=i.person_id
        WHERE ii.kind IN ('source','link','lead','document') AND ii.status IN ('to_explore_priority','to_explore','promising')
        ORDER BY CASE ii.status WHEN 'to_explore_priority' THEN 0 WHEN 'promising' THEN 1 ELSE 2 END,ii.id DESC
        LIMIT 60")->fetchAll();
    return array_map(static fn($row) => [
        'id' => (int)$row['id'],
        'title' => (string)($row['title'] ?: 'Source à vérifier'),
        'origin' => trim((string)($row['investigation_title'] ?? '') . (($row['person_name'] ?? '') !== '' ? ' · ' . $row['person_name'] : '')),
        'status_label' => (string)($row['status_label'] ?? ''),
        'person_id' => (int)($row['person_id'] ?? 0),
    ], $rows);
}

function dashboard_battue_towns(PDO $pdo): array
{
    $statusLabels = battue_commune_statuses();
    $battues = $pdo->query("SELECT b.id,b.title,b.start_insee_code,b.max_level FROM battues b WHERE b.status<>'closed' ORDER BY b.updated_at DESC,b.id DESC LIMIT 8")->fetchAll();
    $rows = [];
    foreach ($battues as $battue) {
        $battueId = (int)$battue['id'];
        $levels = battue_level_map($pdo, (string)$battue['start_insee_code'], min(10, max(0, (int)$battue['max_level'])));
        if (!$levels) continue;
        $codes = array_keys($levels);
        $marks = implode(',', array_fill(0, count($codes), '?'));
        $names = [];
        $stmt = $pdo->prepare("SELECT insee_code,name FROM commune_contours WHERE insee_code IN ($marks)");
        $stmt->execute($codes);
        foreach ($stmt->fetchAll() as $row) $names[(string)$row['insee_code']] = (string)$row['name'];
        $statusStmt = $pdo->prepare("SELECT insee_code,status FROM battue_commune_statuses WHERE battue_id=?");
        $statusStmt->execute([$battueId]);
        $statuses = [];
        foreach ($statusStmt->fetchAll() as $row) $statuses[(string)$row['insee_code']] = (string)$row['status'];
        $todoStmt = $pdo->prepare("SELECT insee_code,count(*) AS todo_count FROM battue_search_items WHERE battue_id=? AND status='todo' GROUP BY insee_code");
        $todoStmt->execute([$battueId]);
        $todos = [];
        foreach ($todoStmt->fetchAll() as $row) $todos[(string)$row['insee_code']] = (int)$row['todo_count'];
        foreach ($levels as $code => $level) {
            $status = $statuses[$code] ?? 'not_started';
            if ($status === 'done') continue;
            $rows[] = [
                'battue_id' => $battueId,
                'battue_title' => (string)$battue['title'],
                'insee_code' => $code,
                'commune_name' => $names[$code] ?? $code,
                'level' => $level,
                'status' => $status,
                'status_label' => $statusLabels[$status] ?? $status,
                'todo_count' => $todos[$code] ?? 0,
            ];
            if (count($rows) >= 60) break 2;
        }
    }
    usort($rows, static fn($a,$b) => ($a['level'] <=> $b['level']) ?: strcmp($a['commune_name'], $b['commune_name']));
    return $rows;
}

function dashboard_sosa_progress(PDO $pdo, int $rootId = 0): array
{
    $root = dashboard_sosa_root($pdo, $rootId);
    if (!$root) return ['root_id'=>0];
    $data = sosa_positions($pdo, (int)$root['id'], 120000);
    $positions = $data['positions'] ?? [];
    $max = $positions ? max(array_keys($positions)) : 0;
    $found = count($positions);
    $duplicates = count($data['collapsed'] ?? []);
    $missing = max(0, $max - $found);
    return [
        'root_id' => (int)$root['id'],
        'root_name' => full_name($root) ?: 'Racine SOSA',
        'found' => $found,
        'missing' => $missing,
        'duplicates' => $duplicates,
        'percent' => $max ? round($found * 100 / $max, 1) : 0,
    ];
}

function dashboard_duplicate_groups(PDO $pdo): array
{
    return $pdo->query("WITH base AS (
            SELECT p.id,lc_fold(trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,''))) AS norm_name,
                   trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS label,
                   (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year
            FROM persons p
        )
        SELECT label,birth_year,count(*) AS count,group_concat(id) AS ids
        FROM base
        WHERE norm_name<>'' AND birth_year IS NOT NULL
        GROUP BY norm_name,birth_year
        HAVING count(*)>1
        ORDER BY count(*) DESC,label
        LIMIT 60")->fetchAll();
}

function dashboard_labels_overview(PDO $pdo): array
{
    return $pdo->query("SELECT l.id,l.name,l.color,l.description,count(ll.id) AS link_count
        FROM labels l LEFT JOIN label_links ll ON ll.label_id=l.id
        GROUP BY l.id
        ORDER BY link_count DESC,l.name COLLATE NOCASE
        LIMIT 80")->fetchAll();
}

function dashboard_map_overview(PDO $pdo): array
{
    $points = $pdo->query("SELECT pl.id,pl.name,pl.subdivision,pl.county,pl.state,pl.country,pl.latitude,pl.longitude,count(e.id) AS count
        FROM events e JOIN places pl ON pl.id=e.place_id
        WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
          AND NOT (pl.latitude=0 AND pl.longitude=0)
          AND pl.name IS NOT NULL AND trim(pl.name)<>''
          AND lower(trim(pl.name)) NOT IN ('lieu sans nom','sans lieu','lieu inconnu','inconnu','unknown','pays inconnu')
        GROUP BY pl.id
        ORDER BY count DESC,pl.name COLLATE NOCASE
        LIMIT 240")->fetchAll();
    $total = (int)$pdo->query("SELECT count(*) FROM events e JOIN places pl ON pl.id=e.place_id WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL AND NOT (pl.latitude=0 AND pl.longitude=0)")->fetchColumn();
    return ['points'=>$points, 'total'=>$total];
}

function dashboard_locked_people(PDO $pdo): array
{
    return $pdo->query(person_select() . " WHERE p.is_locked=1 ORDER BY p.updated_at DESC,p.id DESC LIMIT 80")->fetchAll();
}

function dashboard_requested_person_ids(): array
{
    $raw = (string)($_GET['people'] ?? '');
    if ($raw === '') return [];
    $ids = array_values(array_unique(array_filter(array_map('intval', preg_split('/[^0-9]+/', $raw)), static fn($id) => $id > 0)));
    return array_slice($ids, 0, 30);
}

function dashboard_selected_people(PDO $pdo, array $ids): array
{
    if (!$ids) return [];
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare(person_select() . " WHERE p.id IN ($placeholders)");
    $stmt->execute($ids);
    $rows = [];
    foreach ($stmt->fetchAll() as $row) $rows[(int)$row['id']] = $row;
    return $rows;
}

function dashboard_quiz_data(PDO $pdo): never
{
    $seed = safe_int($_GET['seed'] ?? time());
    $personId = safe_int($_GET['person_id'] ?? 0);
    $choiceCount = max(3, min(8, safe_int($_GET['choices'] ?? 4)));
    $typeIds = array_values(array_unique(array_filter(array_map('intval', preg_split('/[^0-9]+/', (string)($_GET['event_type_ids'] ?? ''))), static fn($id) => $id > 0)));
    $sosaIds = array_values(array_unique(array_filter(array_map('intval', preg_split('/[^0-9]+/', (string)($_GET['sosa_ids'] ?? ''))), static fn($id) => $id > 0)));
    $sosaOnly = safe_int($_GET['sosa_only'] ?? 0) === 1;

    $params = [];
    $typeClause = '';
    if ($typeIds) {
        $typeMarks = implode(',', array_fill(0, count($typeIds), '?'));
        $typeClause = " AND t.id IN ($typeMarks)";
    }
    $sql = "WITH quiz_events AS (
        SELECT p.id AS person_id," . dashboard_person_name_expr('p') . " AS person_name,
               e.id AS event_id,e.date_text,e.year,t.id AS event_type_id,t.label AS event_label
        FROM events e
        JOIN event_types t ON t.id=e.event_type_id
        JOIN persons p ON p.id=e.person_id
        WHERE (trim(COALESCE(e.date_text,''))<>'' OR e.year IS NOT NULL) $typeClause
        UNION ALL
        SELECT p.id AS person_id," . dashboard_person_name_expr('p') . " AS person_name,
               e.id AS event_id,e.date_text,e.year,t.id AS event_type_id,t.label AS event_label
        FROM events e
        JOIN event_types t ON t.id=e.event_type_id
        JOIN families f ON f.id=e.family_id
        JOIN persons p ON p.id IN (f.partner1_id,f.partner2_id)
        WHERE (trim(COALESCE(e.date_text,''))<>'' OR e.year IS NOT NULL) $typeClause
    )
    SELECT * FROM quiz_events WHERE trim(COALESCE(person_name,''))<>''";
    $params = array_merge($params, $typeIds, $typeIds);
    if ($personId > 0) {
        $sql .= " AND person_id=?";
        $params[] = $personId;
    }
    if ($sosaOnly) {
        if (!$sosaIds) json_response(['quiz' => null]);
        $sosaMarks = implode(',', array_fill(0, count($sosaIds), '?'));
        $sql .= " AND person_id IN ($sosaMarks)";
        $params = array_merge($params, $sosaIds);
    }
    $sql .= " ORDER BY event_id DESC LIMIT 12000";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = array_values(array_filter($stmt->fetchAll(), static function ($row) {
        return trim((string)($row['date_text'] ?: $row['year'] ?: '')) !== '';
    }));
    if (!$rows) json_response(['quiz' => null]);

    usort($rows, static fn($a, $b) => crc32(($a['event_id'] ?? '') . ':' . $seed) <=> crc32(($b['event_id'] ?? '') . ':' . $seed));
    $question = $rows[0];
    $answer = trim((string)($question['date_text'] ?: $question['year']));
    $pool = [];
    foreach ($rows as $row) {
        $value = trim((string)($row['date_text'] ?: $row['year']));
        if ($value !== '' && $value !== $answer) $pool[$value] = $value;
    }
    $choices = array_values($pool);
    usort($choices, static fn($a, $b) => crc32($a . ':' . $seed) <=> crc32($b . ':' . $seed));
    $choices = array_slice($choices, 0, max(0, $choiceCount - 1));
    $choices[] = $answer;
    usort($choices, static fn($a, $b) => crc32('choice:' . $a . ':' . $seed) <=> crc32('choice:' . $b . ':' . $seed));
    json_response(['quiz' => [
        'person_id' => (int)$question['person_id'],
        'person_name' => $question['person_name'] ?: 'Personne sans nom',
        'event_id' => (int)$question['event_id'],
        'event_type_id' => (int)$question['event_type_id'],
        'event_label' => $question['event_label'] ?: 'Événement',
        'answer' => $answer,
        'choices' => $choices,
    ]]);
}

/** Question de jeu de l'oie : une date à retrouver, ou la personne à retrouver.
 * Les questions inversées ne sont proposées que si la date / l'événement désigne
 * une seule personne dans le périmètre de la partie. */
function goose_quiz_data(PDO $pdo): never
{
    $seed = safe_int($_GET['seed'] ?? time());
    $variant = safe_text($_GET['variant'] ?? 'mixed');
    if (!in_array($variant, ['mixed', 'date', 'person'], true)) $variant = 'mixed';
    $choiceCount = max(3, min(6, safe_int($_GET['choices'] ?? 4)));
    $personIds = array_values(array_unique(array_filter(array_map('intval', preg_split('/[^0-9]+/', (string)($_GET['person_ids'] ?? ''))), static fn($id) => $id > 0)));
    $branch = trim(safe_text($_GET['branch'] ?? ''));

    $where = ["trim(COALESCE(e.date_text, CAST(e.year AS TEXT), ''))<>''", "trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))<>''"];
    $params = [];
    if ($personIds) {
        $where[] = 'p.id IN (' . implode(',', array_fill(0, count($personIds), '?')) . ')';
        $params = array_merge($params, $personIds);
    } elseif ($branch !== '') {
        $where[] = "(lower(trim(COALESCE(p.last_name,'')))=lower(?) OR lower(trim(COALESCE(g.name,'')))=lower(?))";
        $params[] = $branch;
        $params[] = $branch;
    }
    $sql = "SELECT p.id AS person_id," . dashboard_person_name_expr('p') . " AS person_name,
                   e.id AS event_id, COALESCE(NULLIF(trim(e.date_text),''), CAST(e.year AS TEXT)) AS answer_date,
                   t.label AS event_label
            FROM events e
            JOIN persons p ON p.id=e.person_id
            JOIN event_types t ON t.id=e.event_type_id
            LEFT JOIN surname_groups g ON g.id=p.surname_group_id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY e.id DESC LIMIT 12000";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    if (!$rows) json_response(['quiz' => null]);

    // Même personne, même date et même type : une seule fiche de question suffit.
    $seen = [];
    $events = [];
    foreach ($rows as $row) {
        $key = $row['person_id'] . '|' . $row['answer_date'] . '|' . $row['event_label'];
        if (!isset($seen[$key])) { $seen[$key] = true; $events[] = $row; }
    }
    usort($events, static fn($a, $b) => crc32($a['event_id'] . ':' . $seed) <=> crc32($b['event_id'] . ':' . $seed));
    $wantPerson = $variant === 'person' || ($variant === 'mixed' && ($seed % 2 === 0));

    if ($wantPerson) {
        $countByDate = [];
        $nameOwners = [];
        foreach ($events as $row) {
            $key = strtolower($row['event_label'] . '|' . $row['answer_date']);
            $countByDate[$key][$row['person_id']] = true;
            $nameOwners[$row['person_name']][$row['person_id']] = true;
        }
        $question = null;
        foreach ($events as $row) {
            $key = strtolower($row['event_label'] . '|' . $row['answer_date']);
            if (count($countByDate[$key] ?? []) === 1 && count($nameOwners[$row['person_name']] ?? []) === 1) { $question = $row; break; }
        }
        if ($question) {
            $pool = [];
            foreach ($events as $row) if ((int)$row['person_id'] !== (int)$question['person_id']) $pool[$row['person_name']] = $row['person_name'];
            $choices = array_values($pool);
            usort($choices, static fn($a, $b) => crc32($a . ':' . $seed) <=> crc32($b . ':' . $seed));
            $choices = array_slice($choices, 0, $choiceCount - 1);
            $choices[] = $question['person_name'];
            usort($choices, static fn($a, $b) => crc32('choice:' . $a . ':' . $seed) <=> crc32('choice:' . $b . ':' . $seed));
            if (count($choices) >= 3) json_response(['quiz' => [
                'kind' => 'person', 'event_id' => (int)$question['event_id'], 'event_label' => $question['event_label'],
                'date' => $question['answer_date'], 'answer' => $question['person_name'], 'choices' => $choices,
            ]]);
        }
    }

    $question = $events[0];
    $pool = [];
    foreach ($events as $row) if ($row['answer_date'] !== $question['answer_date']) $pool[$row['answer_date']] = $row['answer_date'];
    $choices = array_values($pool);
    usort($choices, static fn($a, $b) => crc32($a . ':' . $seed) <=> crc32($b . ':' . $seed));
    $choices = array_slice($choices, 0, $choiceCount - 1);
    $choices[] = $question['answer_date'];
    usort($choices, static fn($a, $b) => crc32('choice:' . $a . ':' . $seed) <=> crc32('choice:' . $b . ':' . $seed));
    json_response(['quiz' => [
        'kind' => 'date', 'person_id' => (int)$question['person_id'], 'person_name' => $question['person_name'],
        'event_id' => (int)$question['event_id'], 'event_label' => $question['event_label'],
        'answer' => $question['answer_date'], 'choices' => $choices,
    ]]);
}

function dashboard_person_map_by_id(PDO $pdo, int $personId): array
{
    $stmt = $pdo->prepare("SELECT p.id," . dashboard_person_name_expr('p') . " AS person_name,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year
        FROM persons p
        WHERE p.id=? AND EXISTS(SELECT 1 FROM events e JOIN places pl ON pl.id=e.place_id WHERE (e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id)) AND pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL AND NOT (pl.latitude=0 AND pl.longitude=0))
        LIMIT 1");
    $stmt->execute([$personId]);
    $person = $stmt->fetch();
    if (!$person) return ['person'=>null, 'points'=>[]];
    $points = $pdo->prepare("SELECT e.id,e.year,e.date_text,t.label AS type_label,pl.name,pl.subdivision,pl.county,pl.state,pl.country,pl.latitude,pl.longitude,1 AS count
        FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
        WHERE (e.person_id=:pid OR e.family_id IN (SELECT id FROM families WHERE partner1_id=:pid OR partner2_id=:pid)) AND e.year IS NOT NULL AND pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL AND NOT (pl.latitude=0 AND pl.longitude=0)
        ORDER BY e.year,e.id LIMIT 120");
    $points->execute([':pid'=>(int)$person['id']]); // ses événements et ceux de ses couples (mariage…)
    $person['years'] = trim((string)($person['birth_year'] ?: '?') . ' — ' . (string)($person['death_year'] ?: '?'));
    return ['person'=>$person, 'points'=>$points->fetchAll()];
}

function dashboard_random_person_map(PDO $pdo): array
{
    $personId = $pdo->query("SELECT p.id
        FROM persons p
        WHERE EXISTS(SELECT 1 FROM events e JOIN places pl ON pl.id=e.place_id WHERE e.person_id=p.id AND pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL AND NOT (pl.latitude=0 AND pl.longitude=0))
        ORDER BY random() LIMIT 1")->fetchColumn();
    return $personId ? dashboard_person_map_by_id($pdo, (int)$personId) : ['person'=>null, 'points'=>[]];
}

function dashboard_person_for_seed(PDO $pdo, int $seed): array|null
{
    $total = (int)$pdo->query("SELECT count(*) FROM persons")->fetchColumn();
    if ($total <= 0) return null;
    $offset = abs($seed) % $total;
    $stmt = $pdo->prepare(person_select() . " ORDER BY p.id LIMIT 1 OFFSET ?");
    $stmt->bindValue(1, $offset, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetch() ?: null;
}

function dashboard_random_media_query(): string
{
    return "SELECT m.id,m.title,m.description,m.media_type,m.filename,m.thumbnail,m.date_text,m.document_reference,m.document_title,
        COALESCE(
            (SELECT p.id FROM media_links ml JOIN persons p ON ml.entity_type='person' AND p.id=ml.entity_id WHERE ml.media_id=m.id LIMIT 1),
            (SELECT p.id FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN persons p ON p.id=e.person_id WHERE ml.media_id=m.id LIMIT 1),
            (SELECT p.id FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id JOIN persons p ON p.id=f.partner1_id WHERE ml.media_id=m.id LIMIT 1),
            (SELECT p.id FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id JOIN persons p ON p.id=f.partner2_id WHERE ml.media_id=m.id LIMIT 1),
            (SELECT p.id FROM media_links ml JOIN census_members cm ON ml.entity_type='census' AND cm.census_id=ml.entity_id JOIN persons p ON p.id=cm.person_id WHERE ml.media_id=m.id LIMIT 1)
        ) AS attachment_person_id,
        COALESCE(
            (SELECT " . dashboard_person_name_expr('p') . " FROM media_links ml JOIN persons p ON ml.entity_type='person' AND p.id=ml.entity_id WHERE ml.media_id=m.id LIMIT 1),
            (SELECT " . dashboard_person_name_expr('p') . " FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN persons p ON p.id=e.person_id WHERE ml.media_id=m.id LIMIT 1),
            (SELECT " . dashboard_person_name_expr('p') . " FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id JOIN persons p ON p.id=f.partner1_id WHERE ml.media_id=m.id LIMIT 1),
            (SELECT " . dashboard_person_name_expr('p') . " FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id JOIN persons p ON p.id=f.partner2_id WHERE ml.media_id=m.id LIMIT 1),
            (SELECT " . dashboard_person_name_expr('p') . " FROM media_links ml JOIN census_members cm ON ml.entity_type='census' AND cm.census_id=ml.entity_id JOIN persons p ON p.id=cm.person_id WHERE ml.media_id=m.id LIMIT 1)
        ) AS attachment_person_name,
        COALESCE(
            (SELECT 'Enquête · ' || i.title FROM investigation_media im JOIN investigations i ON i.id=im.investigation_id WHERE im.media_id=m.id LIMIT 1),
            (SELECT 'Battue · ' || b.title FROM media_links ml JOIN battue_search_items bsi ON ml.entity_type='battue_item' AND bsi.id=ml.entity_id JOIN battues b ON b.id=bsi.battue_id WHERE ml.media_id=m.id LIMIT 1),
            (SELECT 'Source · ' || s.title FROM media_links ml JOIN sources s ON ml.entity_type='source' AND s.id=ml.entity_id WHERE ml.media_id=m.id LIMIT 1)
        ) AS attachment_origin_label
        FROM media m WHERE m.filename<>'' AND m.media_type='image'";
}

function dashboard_media_for_seed(PDO $pdo, int $seed): array|null
{
    $total = (int)$pdo->query("SELECT count(*) FROM media WHERE filename<>'' AND media_type='image'")->fetchColumn();
    if ($total <= 0) return null;
    $offset = abs($seed) % $total;
    $stmt = $pdo->prepare(dashboard_random_media_query() . " ORDER BY m.id LIMIT 1 OFFSET ?");
    $stmt->bindValue(1, $offset, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetch() ?: null;
}

function dashboard_parse_seed_pairs(string $value): array
{
    $pairs = [];
    foreach (explode(',', $value) as $part) {
        if (!str_contains($part, ':')) continue;
        [$key, $seed] = explode(':', $part, 2);
        $key = preg_replace('/[^a-zA-Z0-9_-]/', '', $key);
        if ($key !== '') $pairs[$key] = (int)$seed;
    }
    return $pairs;
}

function dashboard_seeded_people(PDO $pdo, array $pairs): array
{
    $rows = [];
    foreach ($pairs as $key => $seed) $rows[$key] = dashboard_person_for_seed($pdo, $seed);
    return $rows;
}

function dashboard_seeded_media(PDO $pdo, array $pairs): array
{
    $rows = [];
    foreach ($pairs as $key => $seed) $rows[$key] = dashboard_media_for_seed($pdo, $seed);
    return $rows;
}

function dashboard_seeded_person_maps(PDO $pdo, array $pairs): array
{
    $rows = [];
    foreach ($pairs as $key => $seed) {
        $person = dashboard_person_for_seed($pdo, $seed);
        $rows[$key] = $person ? dashboard_person_map_by_id($pdo, (int)$person['id']) : ['person'=>null, 'points'=>[]];
    }
    return $rows;
}

function dashboard_selected_person_maps(PDO $pdo, array $ids): array
{
    $maps = [];
    foreach ($ids as $id) $maps[$id] = dashboard_person_map_by_id($pdo, (int)$id);
    return $maps;
}

function dashboard_data(PDO $pdo): never
{
    $count = fn(string $table): int => (int)$pdo->query("SELECT count(*) FROM {$table}")->fetchColumn();
    $stats = [
        'persons' => $count('persons'),
        'events' => $count('events'),
        'media' => $count('media'),
        // Lieux de la généalogie (cités par un événement ou un recensement), pas les ~80 000 communes du répertoire.
        'places' => (int)$pdo->query('SELECT count(*) FROM (SELECT place_id FROM events WHERE place_id IS NOT NULL UNION SELECT place_id FROM census_records WHERE place_id IS NOT NULL)')->fetchColumn(),
        'sources' => $count('sources'),
        'labels' => $count('labels'),
        'investigations' => $count('investigations'),
        'battues' => $count('battues'),
    ];
    $random = dashboard_person_for_seed($pdo, safe_int($_GET['seed'] ?? time()));
    $favorites = $pdo->query(person_select() . " WHERE p.is_bookmarked=1 ORDER BY p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE LIMIT 30")->fetchAll();
    $randomMedia = dashboard_media_for_seed($pdo, safe_int($_GET['seed'] ?? time()));
    $recentChanges = dashboard_change_rows($pdo, $pdo->query('SELECT * FROM change_log ORDER BY created_at DESC,id DESC LIMIT 30')->fetchAll());
    $recentDeletes = dashboard_change_rows($pdo, $pdo->query("SELECT * FROM change_log WHERE action='delete' ORDER BY created_at DESC,id DESC LIMIT 30")->fetchAll());
    $total = max(1, $stats['persons']);
    $coverageCount = function(string $sql) use ($pdo): int { return (int)$pdo->query($sql)->fetchColumn(); };
    $coverageRow = fn(int $value): array => ['count'=>$value, 'percent'=>round($value * 100 / $total, 1)];
    $workReminders = (int)$pdo->query("SELECT count(*) FROM investigation_items WHERE reminder_mode<>'none' AND reminder_due_at<>'' AND reminder_done=0 AND reminder_due_at<=date('now','+30 days')")->fetchColumn()
        + (int)$pdo->query("SELECT count(*) FROM standalone_reminders WHERE reminder_due_at<>'' AND reminder_done=0 AND reminder_due_at<=date('now','+30 days')")->fetchColumn();
    $issues = compute_issues($pdo); // une seule fois : sert au compteur et à la liste des incohérences
    $work = [
        'reminders_due' => $workReminders,
        'issues' => count($issues),
        'open_investigations' => (int)$pdo->query("SELECT count(*) FROM investigations WHERE status<>'closed'")->fetchColumn(),
        'open_battues' => (int)$pdo->query("SELECT count(*) FROM battues WHERE status<>'closed'")->fetchColumn(),
        'restorable_deletions' => count(recent_restore_candidate_ids($pdo, 15)),
    ];
    $topPlaces = $pdo->query("SELECT pl.name,COALESCE(pl.subdivision,'') AS subdivision,COALESCE(pl.county,'') AS county,COALESCE(pl.state,'') AS state,pl.country,count(e.id) AS event_count FROM places pl JOIN events e ON e.place_id=pl.id GROUP BY pl.id ORDER BY event_count DESC,pl.name LIMIT 30")->fetchAll();
    foreach($topPlaces as &$place){
        $place['name'] = trim(implode(', ', array_filter([$place['name'] ?? '', $place['subdivision'] ?? '', $place['county'] ?? '', $place['state'] ?? '', $place['country'] ?? ''])));
    }
    unset($place);
    $upcoming = dashboard_upcoming_dates($pdo);
    $selectedPersonIds = dashboard_requested_person_ids();
    $dashboardBranch = safe_text($_GET['branch'] ?? '');
    $sosaRootId = safe_int($_GET['sosa_root_id'] ?? 0);
    $personSeedPairs = dashboard_parse_seed_pairs(safe_text($_GET['person_seeds'] ?? ''));
    $mediaSeedPairs = dashboard_parse_seed_pairs(safe_text($_GET['media_seeds'] ?? ''));
    $mapSeedPairs = dashboard_parse_seed_pairs(safe_text($_GET['person_map_seeds'] ?? ''));
    json_response([
        'stats' => $stats,
        'recent_changes' => $recentChanges,
        'recent_deletions' => $recentDeletes,
        'locked_people' => dashboard_locked_people($pdo),
        'random_person' => $random,
        'widget_people' => dashboard_seeded_people($pdo, $personSeedPairs),
        'widget_media' => dashboard_seeded_media($pdo, $mediaSeedPairs),
        'widget_person_maps' => dashboard_seeded_person_maps($pdo, $mapSeedPairs),
        'selected_people' => dashboard_selected_people($pdo, $selectedPersonIds),
        'selected_person_maps' => dashboard_selected_person_maps($pdo, $selectedPersonIds),
        'random_media' => $randomMedia,
        'favorites' => $favorites,
        'upcoming' => $upcoming,
        'today' => array_values(array_filter($upcoming, static fn($item) => (int)($item['days_until'] ?? -1) === 0)),
        'reminders' => dashboard_reminders($pdo),
        'work' => $work,
        'completion' => dashboard_people_to_complete($pdo),
        'persons_without_sources' => dashboard_persons_without_sources($pdo),
        'events_without_sources' => dashboard_events_without_sources($pdo),
        'events_without_media' => dashboard_events_without_media($pdo),
        'recent_media' => dashboard_recent_media($pdo),
        'media_unlinked' => dashboard_media_unlinked($pdo),
        'media_to_transcribe' => dashboard_media_to_transcribe($pdo),
        'media_to_identify' => dashboard_media_to_identify($pdo),
        'signatures_to_compare' => dashboard_signatures_to_compare($pdo),
        'places_to_complete' => dashboard_places_to_complete($pdo),
        'branches_less_documented' => dashboard_branches_less_documented($pdo),
        'couples_without_marriage' => dashboard_couples_without_marriage($pdo),
        'children_missing_parents' => dashboard_children_missing_parents($pdo),
        'consistency_issues' => dashboard_consistency_issues($pdo, $issues),
        'baptisms_without_sponsors' => dashboard_baptisms_without_sponsors($pdo),
        'sosa_missing_near' => dashboard_sosa_missing_near($pdo, $sosaRootId),
        'battue_towns' => dashboard_battue_towns($pdo),
        'battues_priority' => dashboard_battues_priority($pdo),
        'sources_to_check' => dashboard_sources_to_check($pdo),
        'archive_favorites' => dashboard_archive_favorites($pdo),
        'daily_research' => dashboard_daily_research($pdo),
        'reread_items' => dashboard_reread_items($pdo),
        'sosa_progress' => dashboard_sosa_progress($pdo, $sosaRootId),
        'duplicates' => dashboard_duplicate_groups($pdo),
        'labels_overview' => dashboard_labels_overview($pdo),
        'map_overview' => dashboard_map_overview($pdo),
        'branch_map' => dashboard_branch_map($pdo, $dashboardBranch),
        'random_person_map' => dashboard_random_person_map($pdo),
        'coverage' => [
            'total' => $stats['persons'],
            'birth' => $coverageRow($coverageCount("SELECT count(DISTINCT p.id) FROM persons p JOIN events e ON e.person_id=p.id JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='BIRT'")),
            'death' => $coverageRow($coverageCount("SELECT count(DISTINCT p.id) FROM persons p JOIN events e ON e.person_id=p.id JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='DEAT'")),
            'media' => $coverageRow($coverageCount("SELECT count(DISTINCT p.id) FROM persons p WHERE EXISTS(SELECT 1 FROM media_links ml WHERE ml.entity_type='person' AND ml.entity_id=p.id) OR EXISTS(SELECT 1 FROM media_links ml JOIN events e ON ml.entity_type='event' AND ml.entity_id=e.id WHERE e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id))")),
            'sources' => $coverageRow($coverageCount("SELECT count(DISTINCT p.id) FROM persons p WHERE EXISTS(SELECT 1 FROM source_links sl WHERE sl.entity_type='person' AND sl.entity_id=p.id) OR EXISTS(SELECT 1 FROM source_links sl JOIN events e ON sl.entity_type='event' AND sl.entity_id=e.id WHERE e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id))")),
        ],
        'top_places' => $topPlaces,
    ]);
}

function dashboard_reminders(PDO $pdo): array
{
    $labels = ['on'=>'À faire le', 'before'=>'Avant le', 'after'=>'Après le'];
    $rows = array_values(array_filter(reminder_list_rows($pdo, '%%', 200, 0), static fn($row) => (int)($row['reminder_done'] ?? 0) === 0));
    usort($rows, static fn($a,$b) => strcmp((string)($a['reminder_due_at'] ?? ''), (string)($b['reminder_due_at'] ?? '')) ?: strcmp((string)($a['item_title'] ?? ''), (string)($b['item_title'] ?? '')));
    return array_map(static function($row) use ($labels) {
        $mode = (string)($row['reminder_mode'] ?? 'on');
        return [
            'id' => (int)($row['id'] ?? 0),
            'title' => (string)($row['item_title'] ?? 'Rappel'),
            'date_label' => trim(($labels[$mode] ?? 'À faire le') . ' ' . (string)($row['reminder_due_at'] ?? '')),
            'origin' => (($row['source_type'] ?? '') === 'standalone') ? 'Rappel libre' : (string)($row['investigation_title'] ?? 'Enquête'),
            'person_id' => (int)($row['person_id'] ?? 0),
        ];
    }, array_slice($rows, 0, 30));
}

function dashboard_change_rows(PDO $pdo,array $rows): array
{
    $recentDeleteIds = array_flip(recent_restore_candidate_ids($pdo, 15));
    foreach($rows as &$row){
        $before=json_decode((string)($row['before_json']??''),true) ?: [];
        $after=json_decode((string)($row['after_json']??''),true) ?: [];
        $row['entity_label']=change_entity_label($pdo,$row,$before,$after);
        $restore=restore_change_state($pdo,$row,$before);
        $row['restore_available']=($restore['state']??'')==='available' && isset($recentDeleteIds[(int)$row['id']]);
        $row['restore_blocked']=($restore['state']??'')==='blocked' && isset($recentDeleteIds[(int)$row['id']]);
        $row['restore_block_reason']=$restore['reason']??'';
        unset($row['before_json'], $row['after_json']);
    }
    unset($row);
    return $rows;
}

function dashboard_issue_preview(PDO $pdo): array
{
    $rows=$pdo->query("SELECT p.id,p.first_name,p.last_name,min(CASE WHEN t.gedcom_tag='BIRT' THEN e.year END) birth_year,min(CASE WHEN t.gedcom_tag='DEAT' THEN e.year END) death_year FROM persons p LEFT JOIN events e ON e.person_id=p.id LEFT JOIN event_types t ON t.id=e.event_type_id GROUP BY p.id LIMIT 2500")->fetchAll();
    $issues=[];
    foreach($rows as $row){
        $birth=$row['birth_year']!==null?(int)$row['birth_year']:null;
        $death=$row['death_year']!==null?(int)$row['death_year']:null;
        if($birth&&$death&&($death<$birth||$death-$birth>110))$issues[]=$row;
    }
    return $issues;
}

function dashboard_upcoming_dates(PDO $pdo): array
{
    $stmt=$pdo->query("SELECT e.id,e.date_text,e.year,t.label AS type_label,t.gedcom_tag,COALESCE(p.id,p1.id,p2.id) AS person_id,trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS person_name,trim(replace(replace(COALESCE(p1.first_name,'')||' '||COALESCE(p1.middle_name,'')||' '||COALESCE(p1.last_name,''),'  ',' '),'  ',' ')) AS partner1_name,trim(replace(replace(COALESCE(p2.first_name,'')||' '||COALESCE(p2.middle_name,'')||' '||COALESCE(p2.last_name,''),'  ',' '),'  ',' ')) AS partner2_name FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN families f ON f.id=e.family_id LEFT JOIN persons p1 ON p1.id=f.partner1_id LEFT JOIN persons p2 ON p2.id=f.partner2_id WHERE e.date_text<>'' AND t.gedcom_tag IN ('BIRT','DEAT','MARR','MRCI','MRRE','CHR','BAPM') ORDER BY e.id DESC LIMIT 5000");
    $today=new DateTimeImmutable('today');
    $items=[];
    foreach($stmt->fetchAll() as $row){
        $md=dashboard_month_day((string)$row['date_text']);
        if(!$md)continue;
        [$month,$day]=$md;
        $target=dashboard_next_anniversary($month,$day,$today);
        if(!$target)continue;
        $days=(int)$today->diff($target)->format('%r%a');
        if($days<0||$days>7)continue;
        $name=trim((string)($row['person_name']??''));
        if($name===''&&trim((string)($row['partner1_name']??''))!=='')$name=trim(($row['partner1_name']??'').' + '.($row['partner2_name']??''));
        if($name==='')$name='Personne non liée';
        $years = $row['year']!==null ? ((int)$target->format('Y')-(int)$row['year']) : null;
        $when=$days===0?'aujourd’hui':($days===1?'demain':'dans '.$days.' jours');
        if($years!==null&&$years>=0)$when.=' · '.$years.' ans';
        $items[]=[
            'event_id'=>(int)$row['id'],
            'person_id'=>(int)($row['person_id']??0),
            'title'=>($row['type_label'] ?: 'Événement').' · '.$name,
            'date_label'=>$target->format('d/m').' · '.($row['date_text'] ?: ''),
            'when_label'=>$when,
            'days_until'=>$days,
        ];
    }
    usort($items, fn($a,$b)=>($a['days_until']<=>$b['days_until']) ?: strcmp($a['title'],$b['title']));
    return array_slice($items,0,12);
}

function dashboard_month_day(string $dateText): ?array
{
    $text=mb_strtolower(trim($dateText));
    if(preg_match('/^\d{4}-(\d{1,2})-(\d{1,2})$/',$text,$m))return [(int)$m[1],(int)$m[2]];
    if(preg_match('/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.]\d{2,4}$/',$text,$m))return [(int)$m[2],(int)$m[1]];
    $months=['janvier'=>1,'janv'=>1,'février'=>2,'fevrier'=>2,'févr'=>2,'fevr'=>2,'mars'=>3,'avril'=>4,'avr'=>4,'mai'=>5,'juin'=>6,'juillet'=>7,'juil'=>7,'août'=>8,'aout'=>8,'septembre'=>9,'sept'=>9,'octobre'=>10,'oct'=>10,'novembre'=>11,'nov'=>11,'décembre'=>12,'decembre'=>12,'déc'=>12,'dec'=>12];
    if(preg_match('/\b(\d{1,2})\s+([a-zàâçéèêëîïôûùüÿñæœ.]+)\b/u',$text,$m)){
        $month=rtrim($m[2],'.');
        if(isset($months[$month]))return [$months[$month],(int)$m[1]];
    }
    return null;
}

function dashboard_next_anniversary(int $month,int $day,DateTimeImmutable $today): ?DateTimeImmutable
{
    $year=(int)$today->format('Y');
    for($i=0;$i<5;$i++){
        $targetYear=$year+$i;
        if(!checkdate($month,$day,$targetYear))continue;
        $date=DateTimeImmutable::createFromFormat('!Y-m-d',sprintf('%04d-%02d-%02d',$targetYear,$month,$day));
        if($date&&$date>=$today)return $date;
    }
    return null;
}

/** Les statistiques portent sur les personnes (ou sur les animaux d'une base d'élevage), jamais les deux mêlés */
function graph_scope_kind(string $sql, string $kind, bool $onlyIds = false): string
{
    $an = "(SELECT id FROM persons WHERE kind='animal')"; $anFam = "(SELECT id FROM families WHERE partner1_id IN $an OR partner2_id IN $an)";
    $animal = $kind === 'animal';
    // chaque table de fiches, d'événements ou de familles est remplacée par sa partie « personnes » (ou « animaux »)
    $conds = [
        'persons' => $animal ? "kind='animal'" : "kind<>'animal'",
        'events' => $animal ? "(person_id IN $an OR family_id IN $anFam)" : "((person_id IS NULL OR person_id NOT IN $an) AND (family_id IS NULL OR family_id NOT IN $anFam))",
        'families' => $animal ? "(partner1_id IN $an OR partner2_id IN $an)" : "(partner1_id IS NULL OR partner1_id NOT IN $an) AND (partner2_id IS NULL OR partner2_id NOT IN $an)",
        'family_children' => $animal ? "child_id IN $an" : "child_id NOT IN $an",
        'census_members' => $animal ? "person_id IN $an" : "(person_id IS NULL OR person_id NOT IN $an)",
    ];
    // critères d'une distribution : seulement les fiches retenues (table temporaire gs_ids), et ce qui les concerne
    if ($onlyIds) {
        $gs = '(SELECT id FROM temp.gs_ids)';
        $more = ['persons' => "id IN $gs", 'events' => "(person_id IN $gs OR family_id IN (SELECT id FROM families WHERE partner1_id IN $gs OR partner2_id IN $gs))",
            'families' => "(partner1_id IN $gs OR partner2_id IN $gs)", 'family_children' => "child_id IN $gs", 'census_members' => "person_id IN $gs"];
        foreach ($more as $t => $c) { $conds[$t] = '(' . $conds[$t] . ") AND $c"; }
    }
    $stop = 'WHERE|ON|JOIN|LEFT|RIGHT|INNER|CROSS|GROUP|ORDER|LIMIT|UNION|USING|NATURAL|AS';
    return (string) preg_replace_callback('/\b(FROM|JOIN)\s+(persons|events|families|family_children|census_members)\b(?:\s+(?:AS\s+)?(?!(?:' . $stop . ')\b)([A-Za-z_]\w*))?/i',
        static fn($m) => $m[1] . " (SELECT * FROM {$m[2]} WHERE {$conds[strtolower($m[2])]}) " . (($m[3] ?? '') !== '' ? $m[3] : $m[2]), $sql);
}

function people_list(PDO $pdo): never
{
    $search = safe_text($_GET['q'] ?? '');
    $phonetic = safe_int($_GET['phonetic'] ?? 0) === 1;
    $group = safe_int($_GET['group'] ?? 0);
    $offset = max(0, safe_int($_GET['offset'] ?? 0));
    $limit = min(250, max(20, safe_int($_GET['limit'] ?? 120)));
    if ($phonetic && $search !== '') {
        json_response(['people' => phonetic_people($pdo, $search, $group, $offset, $limit, (string) ($_GET['kind'] ?? '')), 'offset' => $offset, 'limit' => $limit, 'phonetic' => true]);
    }
    $where = [];
    $params = [];
    if ($search !== '') {
        $tokens = preg_split('/\s+/u', $search, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        foreach (array_slice($tokens,0,6) as $index=>$token) {
            $key=':q'.$index;
            $foldKey=':f'.$index; // même mot sans accents ni tirets (« helene » trouve Hélène, « jean-baptiste » Jean Baptiste)
            $looseKey=':l'.$index;
            $where[] = "(p.first_name LIKE {$key} COLLATE NOCASE OR p.middle_name LIKE {$key} COLLATE NOCASE OR p.last_name LIKE {$key} COLLATE NOCASE OR trim(p.first_name||' '||p.middle_name||' '||p.last_name) LIKE {$key} COLLATE NOCASE OR trim(p.first_name||' '||p.last_name) LIKE {$key} COLLATE NOCASE OR g.name LIKE {$key} COLLATE NOCASE OR EXISTS(SELECT 1 FROM name_variants nv WHERE nv.person_id=p.id AND (nv.first_name LIKE {$key} COLLATE NOCASE OR nv.middle_name LIKE {$key} COLLATE NOCASE OR nv.last_name LIKE {$key} COLLATE NOCASE)) OR ({$foldKey}!='%%' AND (".fold_like_sql("(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,'')||' '||COALESCE(g.name,''))",$key,$foldKey,$looseKey)." OR EXISTS(SELECT 1 FROM name_variants nv2 WHERE nv2.person_id=p.id AND ".fold_like_sql("(COALESCE(nv2.first_name,'')||' '||COALESCE(nv2.middle_name,'')||' '||COALESCE(nv2.last_name,''))",$key,$foldKey,$looseKey)."))))";
            $params[$key] = '%' . $token . '%';
            [, $params[$foldKey], $params[$looseKey]] = fold_like_params($token);
        }
    }
    if ($group) {
        $where[] = 'p.surname_group_id=:group';
        $params[':group'] = $group;
    }
    $kind = (string) ($_GET['kind'] ?? '');
    if ($kind === 'animal') { $where[] = "p.kind='animal'"; } elseif ($kind === 'human') { $where[] = "p.kind<>'animal'"; }
    $sql = person_select() . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY CASE WHEN trim(COALESCE(p.last_name,''))='' THEN 1 WHEN p.last_name GLOB '[?X]*' OR lower(p.last_name)='inconnu' THEN 2 ELSE 0 END,".fold_sort_sql('p.last_name').",".fold_sort_sql('p.first_name').",p.id LIMIT :limit OFFSET :offset";
    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $value) $stmt->bindValue($key, $value);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    json_response(['people' => $stmt->fetchAll(), 'offset' => $offset, 'limit' => $limit]);
}

function phonetic_key(string $value): string
{
    $value = mb_strtolower(ascii_fold($value));
    $value = preg_replace('/[^a-z]/', '', $value) ?? '';
    $value = str_replace('ph', 'f', $value);
    $value = strtr($value, ['c'=>'k','q'=>'k','y'=>'i']);
    $value = preg_replace('/(eau|au)/', 'o', $value) ?? $value;
    $value = preg_replace('/(ai|ay|ei|ey)/', 'e', $value) ?? $value;
    $value = preg_replace('/h/', '', $value) ?? $value;
    $value = preg_replace('/(.)\1+/', '$1', $value) ?? $value;
    return trim($value);
}

// Soundex adapté au français : regroupe les consonnes de sonorité proche (b/f/p/v, c/g/j/k/q/s/x/z, d/t, l, m/n, r)
// après être passé par phonetic_key (qui a déjà neutralisé ph/eau/ai/h/lettres doublées…), afin de
// rattraper les erreurs de transcription d'actes anciens (lettre mal lue, voyelle différente, etc.)
// que la comparaison par distance de Levenshtein de phonetic_people() peut manquer.
function soundex_fr(string $value): string
{
    $key = phonetic_key($value);
    if ($key === '') return '';
    static $codes = [
        'b'=>'1','f'=>'1','p'=>'1','v'=>'1',
        'k'=>'2','g'=>'2','j'=>'2','s'=>'2','x'=>'2','z'=>'2',
        'd'=>'3','t'=>'3',
        'l'=>'4',
        'm'=>'5','n'=>'5',
        'r'=>'6',
    ];
    $chars = str_split($key);
    $first = $chars[0];
    $result = strtoupper($first);
    $prevCode = $codes[$first] ?? '';
    $len = count($chars);
    for ($i = 1; $i < $len && strlen($result) < 4; $i++) {
        $ch = $chars[$i];
        $code = $codes[$ch] ?? '';
        if ($code !== '' && $code !== $prevCode) {
            $result .= $code;
        }
        $prevCode = $code;
    }
    return str_pad(substr($result, 0, 4), 4, '0');
}

function phonetic_people(PDO $pdo, string $search, int $group, int $offset, int $limit, string $kind = ''): array
{
    $tokens = array_values(array_filter(array_map('phonetic_key', preg_split('/\s+/u', $search, -1, PREG_SPLIT_NO_EMPTY) ?: [])));
    if (!$tokens) return [];
    $tokenSoundex = array_map('soundex_fr', $tokens);
    $kc = $kind === 'animal' ? "p.kind='animal'" : ($kind === 'human' ? "p.kind<>'animal'" : '');
    $sql = person_select() . ($group || $kc ? ' WHERE ' . implode(' AND ', array_filter([$group ? 'p.surname_group_id=:group' : '', $kc])) : '') . " ORDER BY CASE WHEN trim(COALESCE(p.last_name,''))='' THEN 1 WHEN p.last_name GLOB '[?X]*' OR lower(p.last_name)='inconnu' THEN 2 ELSE 0 END,p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE";
    $stmt = $pdo->prepare($sql);
    if ($group) $stmt->bindValue(':group', $group, PDO::PARAM_INT);
    $stmt->execute();
    $matches = [];
    foreach ($stmt->fetchAll() as $person) {
        $haystack = [
            phonetic_key((string)($person['first_name'] ?? '')),
            phonetic_key((string)($person['middle_name'] ?? '')),
            phonetic_key((string)($person['last_name'] ?? '')),
            phonetic_key((string)($person['surname_group'] ?? '')),
            phonetic_key(trim(($person['first_name'] ?? '').' '.($person['middle_name'] ?? '').' '.($person['last_name'] ?? ''))),
            phonetic_key(trim(($person['first_name'] ?? '').' '.($person['last_name'] ?? ''))),
        ];
        // Codes Soundex français pré-calculés une fois par personne, en parallèle du haystack phonétique ci-dessus.
        $haystackSoundex = array_map('soundex_fr', $haystack);
        $ok = true;
        foreach ($tokens as $tokenIndex => $token) {
            $found = false;
            $tokenCode = $tokenSoundex[$tokenIndex] ?? '';
            foreach ($haystack as $hIndex => $value) {
                $sameStart = mb_substr($value, 0, 2) === mb_substr($token, 0, 2);
                $maxDistance = mb_strlen($token) <= 6 ? 1 : 2;
                $valueLen = mb_strlen($value);
                if ($value !== '' && (str_contains($value, $token) || ($valueLen >= 3 && str_contains($token, $value)) || ($sameStart && $valueLen >= 3 && levenshtein($value, $token) <= $maxDistance))) {
                    $found = true;
                    break;
                }
                // Rattrapage Soundex français : mêmes consonnes structurantes malgré des voyelles ou une
                // orthographe très différentes (utile pour les transcriptions approximatives d'actes anciens).
                if ($value !== '' && $tokenCode !== '' && $tokenCode === ($haystackSoundex[$hIndex] ?? '')) {
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                $ok = false;
                break;
            }
        }
        if ($ok) $matches[] = $person;
        if (count($matches) >= $offset + $limit) break;
    }
    return array_slice($matches, $offset, $limit);
}

function sosa_parent_ids(PDO $pdo, int $childId): array
{
    $stmt = $pdo->prepare("SELECT p.id,p.gender FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN persons p ON p.id=f.partner1_id OR p.id=f.partner2_id WHERE fc.child_id=?");
    $stmt->execute([$childId]);
    $rows = $stmt->fetchAll();
    $father = null; $mother = null; $others = [];
    foreach ($rows as $r) {
        $pid = (int) $r['id'];
        if ($r['gender'] === 'male' && $father === null) $father = $pid;
        elseif ($r['gender'] === 'female' && $mother === null) $mother = $pid;
        else $others[] = $pid;
    }
    foreach ($others as $o) {
        if ($father === null) $father = $o;
        elseif ($mother === null) $mother = $o;
    }
    return [$father, $mother];
}

// Calcule la numérotation Sosa-Stradonitz à partir d'une personne racine (sosa n°1) :
// le père porte le double du numéro de l'enfant, la mère le double + 1, récursivement.
function sosa_map_data(PDO $pdo, int $rootId): never
{
    if (!$rootId) json_response(['root_id' => 0, 'map' => []]);
    $check = $pdo->prepare('SELECT id FROM persons WHERE id=?');
    $check->execute([$rootId]);
    if (!$check->fetchColumn()) json_response(['root_id' => 0, 'map' => []]);
    $map = [$rootId => 1];
    $queue = [[$rootId, 1]];
    $guard = 0;
    while ($queue && $guard < 200000) {
        $guard++;
        [$pid, $sosa] = array_shift($queue);
        [$father, $mother] = sosa_parent_ids($pdo, $pid);
        if ($father && !isset($map[$father])) { $map[$father] = $sosa * 2; $queue[] = [$father, $sosa * 2]; }
        if ($mother && !isset($map[$mother])) { $map[$mother] = $sosa * 2 + 1; $queue[] = [$mother, $sosa * 2 + 1]; }
    }
    // Ancêtres présents plusieurs fois (implexe) : tous leurs numéros, pour la pastille « Sosa 42 & 46 »
    $multi = [];
    foreach (implexe_data($pdo, $rootId)['repeated'] as $row) { $multi[$row['id']] = $row['sosas']; }
    $name = $pdo->prepare("SELECT TRIM(COALESCE(first_name,'')||' '||COALESCE(last_name,'')) FROM persons WHERE id=?");
    $name->execute([$rootId]);
    json_response(['root_id' => $rootId, 'root_name' => (string) $name->fetchColumn(), 'map' => $map, 'multi' => $multi]);
}

// ─── Numérotation d'Aboville (descendants) ────────────────────────────────
// Contrairement au Sosa-Stradonitz (numérotation des ancêtres), la numérotation
// d'Aboville numérote les descendants : la personne racine porte le numéro "1",
// et chacun de ses enfants reçoit "1.1", "1.2", "1.3"… dans l'ordre des familles
// (année de mariage) puis des naissances (position dans family_children).
function daboville_children_ordered(PDO $pdo, int $personId): array
{
    $stmt = $pdo->prepare("SELECT fc.child_id AS child_id, fc.position AS position,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=f.id AND t.gedcom_tag IN ('MARR','MRCI','MRRE') ORDER BY e.year LIMIT 1) AS marriage_year,
            f.id AS family_id
        FROM family_children fc JOIN families f ON f.id=fc.family_id
        WHERE f.partner1_id=? OR f.partner2_id=?
        ORDER BY marriage_year IS NULL, marriage_year, f.id, fc.position, fc.child_id");
    $stmt->execute([$personId, $personId]);
    $ids = [];
    foreach ($stmt->fetchAll() as $row) {
        $cid = (int)$row['child_id'];
        if (!in_array($cid, $ids, true)) $ids[] = $cid;
    }
    return $ids;
}

function daboville_positions(PDO $pdo, int $rootId, int $guardLimit = 200000): array
{
    if (!$rootId) return ['positions' => [], 'personDaboville' => [], 'collapsed' => []];
    $check = $pdo->prepare('SELECT id FROM persons WHERE id=?');
    $check->execute([$rootId]);
    if (!$check->fetchColumn()) return ['positions' => [], 'personDaboville' => [], 'collapsed' => []];
    $positions = ['1' => $rootId];
    $personDaboville = [$rootId => ['1']];
    $queue = [[$rootId, '1']];
    $seen = [];
    $guard = 0;
    while ($queue && $guard < $guardLimit) {
        $guard++;
        [$pid, $number] = array_shift($queue);
        // Chaque personne n'est développée qu'une fois : ses autres numéros (implexe) sont notés mais pas redéroulés,
        // ce qui évite aussi une boucle sans fin si l'arbre en contient une (personne devenue son propre ancêtre).
        if (isset($seen[$pid])) continue;
        $seen[$pid] = true;
        $children = daboville_children_ordered($pdo, $pid);
        $index = 0;
        foreach ($children as $childId) {
            $index++;
            $childNumber = $number . '.' . $index;
            $positions[$childNumber] = $childId;
            $personDaboville[$childId] ??= [];
            $personDaboville[$childId][] = $childNumber;
            if (!isset($seen[$childId])) $queue[] = [$childId, $childNumber];
        }
    }
    $collapsed = [];
    foreach ($personDaboville as $pid => $numbers) {
        if (count($numbers) > 1) foreach (array_slice($numbers, 1) as $number) $collapsed[$number] = true;
    }
    return ['positions' => $positions, 'personDaboville' => $personDaboville, 'collapsed' => $collapsed];
}

// Calcule la numérotation d'Aboville complète à partir d'une personne racine
// (numéro "1"), pour mise en cache côté client (comparable à sosa_map_data).
function daboville_map_data(PDO $pdo, int $rootId): never
{
    if (!$rootId) json_response(['root_id' => 0, 'map' => []]);
    $data = daboville_positions($pdo, $rootId, 200000);
    if (!$data['positions']) json_response(['root_id' => 0, 'map' => []]);
    $map = [];
    foreach ($data['positions'] as $number => $personId) {
        // En cas de doublon (personne atteinte par plusieurs chemins), on garde le premier numéro rencontré.
        if (!isset($map[$personId])) $map[$personId] = (string)$number;
    }
    json_response(['root_id' => $rootId, 'map' => $map]);
}

function daboville_number_sort_key(string $number): array
{
    return array_map('intval', explode('.', $number));
}

function daboville_number_compare(string $a, string $b): int
{
    $ka = daboville_number_sort_key($a);
    $kb = daboville_number_sort_key($b);
    $len = max(count($ka), count($kb));
    for ($i = 0; $i < $len; $i++) {
        $va = $ka[$i] ?? -1;
        $vb = $kb[$i] ?? -1;
        if ($va !== $vb) return $va <=> $vb;
    }
    return 0;
}

function daboville_list_rows(PDO $pdo, string $like, int $limit, int $offset, int $rootId, string $sort): array
{
    $daboville = daboville_positions($pdo, $rootId);
    $positions = $daboville['positions'];
    if (!$positions) return [];
    $personIds = array_values(array_unique(array_values($positions)));
    $people = [];
    if ($personIds) {
        $marks = implode(',', array_fill(0, count($personIds), '?'));
        $stmt = $pdo->prepare(person_select() . " WHERE p.id IN ($marks)");
        $stmt->execute($personIds);
        foreach ($stmt->fetchAll() as $row) $people[(int)$row['id']] = $row;
    }
    $rows = [];
    foreach ($positions as $number => $personId) {
        $person = $people[(int)$personId] ?? null;
        if (!$person) continue;
        $name = trim(preg_replace('/\s+/', ' ', ($person['first_name'] ?? '') . ' ' . ($person['middle_name'] ?? '') . ' ' . ($person['last_name'] ?? '')));
        if ($like !== '%%' && stripos($name, trim($like, '%')) === false && stripos((string)($person['surname_group'] ?? ''), trim($like, '%')) === false) continue;
        $rows[] = [
            'daboville_number' => (string)$number,
            'person_id' => (int)$person['id'],
            'person' => $name ?: 'Personne sans nom',
            'birth_date' => $person['birth_date'] ?? '',
            'birth_year' => $person['birth_year'] ?? '',
            'marr_date' => $person['marr_date'] ?? '',
            'marr_year' => $person['marr_year'] ?? '',
            'death_date' => $person['death_date'] ?? '',
            'death_year' => $person['death_year'] ?? '',
            'status' => count($daboville['personDaboville'][(int)$person['id']] ?? []) > 1 ? 'doublon' : 'renseigné',
            'generation' => substr_count((string)$number, '.') + 1,
        ];
    }
    $yearValue = static fn($row, $key) => (int)($row[$key] ?: 999999);
    usort($rows, static function ($a, $b) use ($sort, $yearValue) {
        return match ($sort) {
            'daboville_desc' => daboville_number_compare($b['daboville_number'], $a['daboville_number']),
            'birth_asc' => $yearValue($a, 'birth_year') <=> $yearValue($b, 'birth_year') ?: daboville_number_compare($a['daboville_number'], $b['daboville_number']),
            'birth_desc' => $yearValue($b, 'birth_year') <=> $yearValue($a, 'birth_year') ?: daboville_number_compare($a['daboville_number'], $b['daboville_number']),
            'marriage_asc' => $yearValue($a, 'marr_year') <=> $yearValue($b, 'marr_year') ?: daboville_number_compare($a['daboville_number'], $b['daboville_number']),
            'marriage_desc' => $yearValue($b, 'marr_year') <=> $yearValue($a, 'marr_year') ?: daboville_number_compare($a['daboville_number'], $b['daboville_number']),
            'death_asc' => $yearValue($a, 'death_year') <=> $yearValue($b, 'death_year') ?: daboville_number_compare($a['daboville_number'], $b['daboville_number']),
            'death_desc' => $yearValue($b, 'death_year') <=> $yearValue($a, 'death_year') ?: daboville_number_compare($a['daboville_number'], $b['daboville_number']),
            default => daboville_number_compare($a['daboville_number'], $b['daboville_number']),
        };
    });
    return array_slice($rows, $offset, $limit);
}

function daboville_list_count(PDO $pdo, string $like, int $rootId, string $sort): int
{
    return count(daboville_list_rows($pdo, $like, 100000, 0, $rootId, $sort));
}

function person_detail(PDO $pdo, int $id): never
{
    $stmt = $pdo->prepare(person_select() . ' WHERE p.id=?');
    $stmt->execute([$id]);
    $person = $stmt->fetch();
    if (!$person) json_response(['error' => 'Personne introuvable'], 404);

    $events = $pdo->prepare("SELECT e.*,t.label AS type_label,t.gedcom_tag,t.icon,t.color,pl.name AS place_name,pl.subdivision,pl.county,pl.state,pl.country,pl.latitude,pl.longitude,
        CASE WHEN e.scope='family' THEN f.partner1_id ELSE NULL END AS partner1_id,
        CASE WHEN e.scope='family' THEN f.partner2_id ELSE NULL END AS partner2_id
        FROM events e JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id
        WHERE e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)
        ORDER BY COALESCE(e.year,9999),e.id");
    $events->execute([$id, $id, $id]);

    $parents = $pdo->prepare(person_select() . " WHERE p.id IN (
        SELECT f.partner1_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?
        UNION SELECT f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?)");
    $parents->execute([$id, $id]);

    $partners = $pdo->prepare(person_select() . " WHERE p.id IN (
        SELECT CASE WHEN partner1_id=? THEN partner2_id ELSE partner1_id END FROM families WHERE partner1_id=? OR partner2_id=?)");
    $partners->execute([$id, $id, $id]);

    $children = $pdo->prepare(person_select() . " WHERE p.id IN (
        SELECT fc.child_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id=? OR f.partner2_id=?)
        ORDER BY COALESCE(birth_year,9999),COALESCE(birth_date,''),p.id");
    $children->execute([$id, $id]);

    $siblings = $pdo->prepare(person_select() . " WHERE p.id<>? AND p.id IN (
        SELECT fc2.child_id FROM family_children fc1
        JOIN family_children fc2 ON fc2.family_id=fc1.family_id
        WHERE fc1.child_id=?)
        ORDER BY COALESCE(birth_year,9999),COALESCE(birth_date,''),p.id");
    $siblings->execute([$id, $id]);

    $variants = $pdo->prepare('SELECT * FROM name_variants WHERE person_id=? ORDER BY position,id');
    $variants->execute([$id]);
    $notes = $pdo->prepare("SELECT * FROM notes WHERE entity_type='person' AND entity_id=? ORDER BY updated_at DESC,id");
    $notes->execute([$id]);

    $media = $pdo->prepare("SELECT m.*,min(ml.position) AS link_position,min(ev.year) AS event_year,
        MAX(CASE WHEN ml.entity_type='person' AND ml.entity_id=? THEN 1 ELSE 0 END) AS direct_person_link,
        MAX(CASE WHEN ml.entity_type='person' AND ml.entity_id=? THEN ml.position ELSE NULL END) AS direct_person_position,
        MAX(CASE WHEN ml.entity_type='person' AND ml.entity_id=? THEN ml.collection_key ELSE '' END) AS person_collection_key,
        SUM(CASE WHEN ml.entity_type='person' AND ml.entity_id=? THEN 0 ELSE 1 END) AS other_context_link_count,
        group_concat(DISTINCT et.label) AS event_type_labels,
        group_concat(DISTINCT CASE WHEN ml.entity_type='event' THEN ml.entity_id END) AS event_ids,
        group_concat(DISTINCT CASE WHEN ml.entity_type='event' AND ml.collection_key<>'' THEN ml.entity_id || ':' || ml.collection_key END) AS event_collections,
        group_concat(DISTINCT CASE WHEN ml.entity_type='event' THEN ml.entity_id || ':' || ml.position END) AS event_positions,
        group_concat(DISTINCT CASE WHEN ml.entity_type='census' THEN ml.entity_id END) AS census_ids,
        group_concat(DISTINCT CASE WHEN ml.entity_type='military' THEN ml.entity_id END) AS military_ids,
        group_concat(DISTINCT CASE WHEN ml.entity_type='grave' THEN ml.entity_id END) AS grave_ids,
        group_concat(DISTINCT CASE
            WHEN ml.entity_type='person' THEN 'Fiche individuelle'
            WHEN ml.entity_type='event' THEN trim(COALESCE(et.label,'Événement') || CASE WHEN ev.date_text<>'' THEN ' — '||ev.date_text ELSE '' END)
            WHEN ml.entity_type='census' THEN trim('Recensement ' || cr.year || CASE WHEN cr.address<>'' THEN ' — '||cr.address ELSE '' END)
            WHEN ml.entity_type='family' THEN 'Famille'
            WHEN ml.entity_type='military' THEN 'Dossier militaire'
            WHEN ml.entity_type='grave' THEN 'Cimetière'
            ELSE 'Source'
        END) AS attachment_label
        FROM media m JOIN media_links ml ON ml.media_id=m.id
        LEFT JOIN events ev ON ml.entity_type='event' AND ev.id=ml.entity_id
        LEFT JOIN event_types et ON et.id=ev.event_type_id
        LEFT JOIN census_records cr ON ml.entity_type='census' AND cr.id=ml.entity_id
        WHERE (ml.entity_type='person' AND ml.entity_id=?)
            OR (ml.entity_type='event' AND ml.entity_id IN (SELECT id FROM events WHERE person_id=? OR family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)))
            OR (ml.entity_type='census' AND ml.entity_id IN (SELECT census_id FROM census_members WHERE person_id=?))
            OR (ml.entity_type='military' AND ml.entity_id=?)
            OR (ml.entity_type='grave' AND ml.entity_id IN (SELECT grave_id FROM grave_persons WHERE person_id=?))
        GROUP BY m.id ORDER BY COALESCE(min(ev.year),9999),COALESCE(m.date_text,''),link_position,m.id");
    $media->execute([$id, $id, $id, $id, $id, $id, $id, $id, $id, $id, $id]);

    $sources = $pdo->prepare("SELECT DISTINCT s.*,sl.id AS link_id,sl.page,sl.note,sl.entity_type,sl.entity_id,sl.citation_json FROM sources s JOIN source_links sl ON sl.source_record_id=s.id
        WHERE (sl.entity_type='person' AND sl.entity_id=?) OR (sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE person_id=? OR family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?))) ORDER BY s.id DESC");
    $sources->execute([$id,$id,$id,$id]);

    $groups = $pdo->query('SELECT id,name FROM surname_groups ORDER BY name COLLATE NOCASE')->fetchAll();
    $investigations = $pdo->prepare("SELECT i.id,i.title,i.question,i.status,i.updated_at,
        CASE WHEN i.person_id=? THEN 'primary' ELSE ip.role END AS person_role
        FROM investigations i
        LEFT JOIN investigation_persons ip ON ip.investigation_id=i.id AND ip.person_id=?
        WHERE i.person_id=? OR ip.person_id=?
        ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'promising' THEN 1 ELSE 2 END,i.updated_at DESC");
    $investigations->execute([$id,$id,$id,$id]);
    $battues=$pdo->prepare("SELECT b.*,c.name AS start_name,
        CASE WHEN bp.role IS NULL THEN 'primary' ELSE bp.role END AS person_role,
        (SELECT count(*) FROM battue_search_items si WHERE si.battue_id=b.id) AS item_count,
        (SELECT count(*) FROM battue_search_items si WHERE si.battue_id=b.id AND si.status='todo') AS todo_count
        FROM battues b
        JOIN battue_persons bp ON bp.battue_id=b.id
        JOIN commune_contours c ON c.insee_code=b.start_insee_code
        WHERE bp.person_id=?
        ORDER BY CASE b.status WHEN 'open' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,b.updated_at DESC");
    $battues->execute([$id]);
    $hypotheses=$pdo->prepare("SELECT h.*,trim(COALESCE(r.first_name,'')||' '||COALESCE(r.last_name,'')) AS related_name,et.label AS event_label,e.date_text AS event_date
        FROM hypotheses h
        LEFT JOIN persons r ON r.id=h.related_person_id
        LEFT JOIN events e ON e.id=h.event_id
        LEFT JOIN event_types et ON et.id=e.event_type_id
        WHERE h.person_id=?
        ORDER BY CASE WHEN h.event_id IS NULL THEN 1 ELSE 0 END,CASE h.status WHEN 'open' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,h.updated_at DESC,h.id DESC");
    $hypotheses->execute([$id]);
    $evidence=$pdo->prepare("SELECT er.*,et.label AS event_label,e.date_text AS event_date,s.title AS source_title FROM evidence_records er LEFT JOIN events e ON e.id=er.event_id LEFT JOIN event_types et ON et.id=e.event_type_id LEFT JOIN sources s ON s.id=er.source_id WHERE er.person_id=? ORDER BY CASE er.quality WHEN 'contradiction' THEN 0 WHEN 'unsourced' THEN 1 ELSE 2 END,er.updated_at DESC,er.id DESC");
    $evidence->execute([$id]);
    $journal=$pdo->prepare('SELECT * FROM research_journal WHERE person_id=? ORDER BY updated_at DESC,id DESC LIMIT 20');
    $journal->execute([$id]);
    $census=census_for_person($pdo,$id);
    $eventRows=$events->fetchAll();$parentRows=$parents->fetchAll();$partnerRows=$partners->fetchAll();$childRows=$children->fetchAll();$siblingRows=$siblings->fetchAll();
    $mediaRows=attach_labels_to_rows($pdo,'media',$media->fetchAll());$sourceRows=attach_labels_to_rows($pdo,'source',$sources->fetchAll());$notesRows=attach_labels_to_rows($pdo,'note',$notes->fetchAll());$rawInvestigationRows=$investigations->fetchAll();$battueRows=$battues->fetchAll();$evidenceRows=$evidence->fetchAll();
    // Attach main person info + linked_persons to each investigation row
    $invIds=array_column($rawInvestigationRows,'id');
    $invLinkedPersonsMap=[];
    if($invIds){
        $marks=implode(',',array_fill(0,count($invIds),'?'));
        $lpStmt=$pdo->prepare("SELECT ip.investigation_id,ip.person_id,ip.role,trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS person_name FROM investigation_persons ip JOIN persons p ON p.id=ip.person_id WHERE ip.investigation_id IN ($marks) ORDER BY CASE ip.role WHEN 'primary' THEN 0 ELSE 1 END,ip.created_at");
        $lpStmt->execute($invIds);
        foreach($lpStmt->fetchAll() as $lp){$invLinkedPersonsMap[$lp['investigation_id']][]=$lp;}
        // Also get the main person name for each investigation
        $mainStmt=$pdo->prepare("SELECT i.id,i.person_id,trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS person_name FROM investigations i JOIN persons p ON p.id=i.person_id WHERE i.id IN ($marks)");
        $mainStmt->execute($invIds);
        $invMainPersonMap=[];foreach($mainStmt->fetchAll() as $row){$invMainPersonMap[$row['id']]=['person_id'=>$row['person_id'],'person_name'=>$row['person_name']];}
    }
    foreach($rawInvestigationRows as &$invRow){
        $invRow['linked_persons']=$invLinkedPersonsMap[$invRow['id']]??[];
        $main=$invMainPersonMap[$invRow['id']]??[];
        $invRow['person_id']=$main['person_id']??null;
        $invRow['person_name']=$main['person_name']??'';
    }unset($invRow);
    $investigationRows=attach_labels_to_rows($pdo,'investigation',$rawInvestigationRows);
    $eventRows=attach_labels_to_rows($pdo,'event',$eventRows);
    // Attach witnesses to each event
    $eventIds = array_column($eventRows, 'id');
    if ($eventIds) {
        $marks = implode(',', array_fill(0, count($eventIds), '?'));
        $wStmt = $pdo->prepare("SELECT ew.event_id, ew.note, ew.position,
            p.id AS person_id, p.first_name, p.last_name, p.middle_name, p.prefix, p.suffix
            FROM event_witnesses ew JOIN persons p ON p.id=ew.person_id
            WHERE ew.event_id IN ($marks) ORDER BY ew.position,ew.id");
        $wStmt->execute($eventIds);
        $witnessByEvent = [];
        foreach ($wStmt->fetchAll() as $w) { $witnessByEvent[(int)$w['event_id']][] = $w; }
        foreach ($eventRows as &$ev) { $ev['witnesses'] = $witnessByEvent[(int)$ev['id']] ?? []; }
        unset($ev);
    } else {
        foreach ($eventRows as &$ev) { $ev['witnesses'] = []; }
        unset($ev);
    }
    if(!empty($census['records']))$census['records']=attach_labels_to_rows($pdo,'census',$census['records']);
    $completion=completion_score($person,$eventRows,$parentRows,$partnerRows,$childRows,$mediaRows,$sourceRows,$notesRows,$investigationRows,$evidenceRows);
    // Events where this person appears as witness
    $witnessEvents = $pdo->prepare("SELECT e.*,t.label AS type_label,t.gedcom_tag,t.icon,t.color,
        pl.name AS place_name,pl.subdivision,pl.county,pl.state,pl.country AS country,pl.latitude,pl.longitude,
        trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS owner_name,
        ew.note AS witness_note
        FROM event_witnesses ew
        JOIN events e ON e.id=ew.event_id
        JOIN event_types t ON t.id=e.event_type_id
        JOIN persons p ON p.id=e.person_id
        LEFT JOIN places pl ON pl.id=e.place_id
        WHERE ew.person_id=?
        ORDER BY COALESCE(e.year,9999),e.id");
    $witnessEvents->execute([$id]);
    $witnessEventRows = $witnessEvents->fetchAll();
    $signatures = $pdo->prepare("SELECT mt.id,mt.media_id,mt.person_id,COALESCE(mt.tag_type,'person') AS tag_type,mt.x,mt.y,mt.w,mt.h,mt.confidence,mt.note,mt.created_at,
            m.title,m.filename,m.thumbnail,m.media_type,m.date_text,m.document_reference,m.document_title
        FROM media_tags mt
        JOIN media m ON m.id=mt.media_id
        WHERE mt.person_id=? AND COALESCE(mt.tag_type,'person')='signature'
        ORDER BY COALESCE(m.date_text,''),m.id,mt.id");
    $signatures->execute([$id]);

    // Familles (unions) de cette personne, pour permettre l'ajout d'un événement de portée
    // "Famille" (ex: Mariage) rattaché à la bonne union plutôt qu'à la personne seule.
    $families = $pdo->prepare("SELECT f.id,
            CASE WHEN f.partner1_id=? THEN f.partner2_id ELSE f.partner1_id END AS other_partner_id,
            (SELECT trim(p2.first_name||' '||p2.last_name) FROM persons p2 WHERE p2.id = CASE WHEN f.partner1_id=? THEN f.partner2_id ELSE f.partner1_id END) AS other_partner_name,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=f.id AND t.gedcom_tag IN ('MARR','MRCI','MRRE') AND e.year IS NOT NULL ORDER BY e.year LIMIT 1) AS marriage_year
        FROM families f WHERE f.partner1_id=? OR f.partner2_id=?
        ORDER BY marriage_year IS NULL, marriage_year, f.id");
    $families->execute([$id, $id, $id, $id]);

    $onlineSheets = $pdo->prepare('SELECT s.*, m.filename AS screenshot_filename, m.thumbnail AS screenshot_thumbnail, m.title AS screenshot_title FROM person_online_sheets s LEFT JOIN media m ON m.id=s.screenshot_media_id WHERE s.person_id=? ORDER BY s.updated_at DESC,s.id DESC');
    $onlineSheets->execute([$id]);
    $onlineSheetRows = array_map(static function($row){
        $checks = json_decode((string)($row['checks_json'] ?? '[]'), true);
        $row['checks'] = is_array($checks) ? $checks : [];
        unset($row['checks_json']);
        return $row;
    }, $onlineSheets->fetchAll());

    if (kiosk_state()['on']) { $person['is_locked'] = 1; $person['kiosk'] = 1; } // mode consultation : fiche en lecture seule
    json_response([
        'person' => $person,
        'estimates' => date_estimates($pdo, $id),
        'saint' => person_saint_info($pdo, $person),
        'closed_branches' => closed_branches_data($pdo, $id),
        'family_objects' => family_objects_data($pdo, $id),
        'family_memories' => family_memories_data($pdo, $id),
        'heritage' => heritage_person_data($pdo, $id),
        'onlineSheets' => $onlineSheetRows,
        'events' => $completion['_events'],
        'witnessEvents' => $witnessEventRows,
        'parents' => $completion['_parents'],
        'partners' => $completion['_partners'],
        'families' => $families->fetchAll(),
        'children' => $completion['_children'],
        'siblings' => $siblingRows,
        'variants' => $variants->fetchAll(),
        'labels' => labels_for_entity($pdo,'person',$id),
        'notes' => $notesRows,
        'media' => $mediaRows,
        'signatures' => $signatures->fetchAll(),
        'sources' => $sourceRows,
        'investigations' => $investigationRows,
        'battues' => $battueRows,
        'hypotheses' => $hypotheses->fetchAll(),
        'evidence' => $evidenceRows,
        'researchJournal' => $journal->fetchAll(),
        'census' => $census,
        'completion' => ['score'=>$completion['score'],'items'=>$completion['items']],
        'biography' => automatic_biography($person,$completion['_events'],$completion['_parents'],$completion['_partners'],$completion['_children']),
        'surnameGroups' => $groups,
    ]);
}

function completion_score(array $person,array $events,array $parents,array $partners,array $children,array $media,array $sources,array $notes,array $investigations,array $evidence): array
{
    $hasBirth=false;$fullBirth=false;$hasBirthPlace=false;$hasDeathOrLiving=false;$fullDeath=false;$hasDeathPlace=false;$confidenceFacts=0;
    foreach($events as $event){
        $date=(string)($event['date_text']??'');
        if(($event['gedcom_tag']??'')==='BIRT'){$hasBirth=!empty($date)||!empty($event['year']);$fullBirth=$fullBirth||is_full_date($date);$hasBirthPlace=!empty($event['place_name'])||!empty($event['country']);}
        if(($event['gedcom_tag']??'')==='DEAT'){$hasDeathOrLiving=!empty($date)||!empty($event['year']);$fullDeath=$fullDeath||is_full_date($date);$hasDeathPlace=!empty($event['place_name'])||!empty($event['country']);}
        if(in_array((string)($event['fact_confidence']??'unknown'),['certain','deduced','estimated','doubt'],true))$confidenceFacts++;
    }
    if(($person['living_status']??'')==='living')$hasDeathOrLiving=true;
    $items=[
        completion_item('Identité nom/prénom',trim(($person['first_name']??'').' '.($person['last_name']??''))!==''),
        completion_item('Naissance avec date complète',$fullBirth,$hasBirth),
        completion_item('Lieu de naissance',$hasBirthPlace),
        completion_item('Décès/vivant renseigné',$hasDeathOrLiving),
        completion_item('Décès avec date complète',(($person['living_status']??'')==='living')||$fullDeath,$hasDeathOrLiving),
        completion_item('Lieu de décès si décès connu',$hasDeathOrLiving&&!$hasDeathPlace?($person['living_status']??'')==='living':true,$hasDeathOrLiving),
        completion_item('Parents documentés',count($parents)>0),
        completion_item('Conjoint ou absence documentée',count($partners)>0||in_array(($person['spouse_status']??''),['none','none_suspected'],true)),
        completion_item('Enfants ou absence documentée',count($children)>0||in_array(($person['children_status']??''),['none','none_suspected'],true)),
        completion_item('Au moins une source/preuve',count($sources)>0||count($evidence)>0),
        completion_item('Médias ou note de recherche',count($media)>0||count($notes)>0||count($investigations)>0),
    ];
    if(count($events)>0)$items[]=completion_item('Niveau de confiance des faits',$confidenceFacts===count($events),$confidenceFacts>0);
    $score=array_sum(array_map(fn($item)=>$item['weight'],$items));
    return ['score'=>(int)round($score/max(1,count($items))*100),'items'=>$items,'_events'=>$events,'_parents'=>$parents,'_partners'=>$partners,'_children'=>$children];
}

function completion_item(string $label,bool $complete,bool $partial=false): array
{
    $status=$complete?'complete':($partial?'incomplete':'missing');
    return ['label'=>$label,'status'=>$status,'ok'=>$complete,'weight'=>$complete?1:($partial?0.45:0)];
}

function census_years(): array
{
    return [1801,1806,1811,1821,1826,1831,1836,1841,1846,1851,1856,1861,1866,1872,1876,1881,1886,1891,1896,1901,1906,1911,1921,1926,1931,1936,1946,1954,1962,1968,1975,1982,1990,1999];
}

function census_expected_fields(int $year): array
{
    if ($year >= 1896) {
        return ['Nom','Prénoms','Profession','Employeur / entreprise','Année de naissance','Ville de naissance','Adresse','Position dans le ménage','Nationalité','Rubriques supplémentaires'];
    }
    return ['Nom','Prénoms','Profession','Employeur / entreprise','Âge','Ville de naissance','Adresse','Situation personnelle','Nationalité','Rubriques supplémentaires'];
}

function census_for_person(PDO $pdo, int $personId): array
{
    $records=$pdo->prepare("SELECT cr.*,cm.id AS member_link_id,cm.age_text,cm.birth_place,cm.occupation,cm.employer,cm.nationality,cm.household_position,cm.personal_status,cm.extra_info,cm.is_primary,
        pl.name AS place_name,pl.subdivision,pl.county,pl.state,pl.country,pl.latitude,pl.longitude
        FROM census_records cr
        JOIN census_members cm ON cm.census_id=cr.id
        LEFT JOIN places pl ON pl.id=cr.place_id
        WHERE cm.person_id=?
        ORDER BY cr.year,cr.is_special,cr.id");
    $records->execute([$personId]);
    $rows=$records->fetchAll();
    $membersByCensus=[];
    if($rows){
        $ids=array_values(array_unique(array_map(fn($row)=>(int)$row['id'],$rows)));
        $marks=implode(',',array_fill(0,count($ids),'?'));
        $members=$pdo->prepare("SELECT cm.*,trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS person_name,p.birth_year,p.death_year
            FROM census_members cm
            LEFT JOIN (".person_select().") p ON p.id=cm.person_id
            WHERE cm.census_id IN ($marks)
            ORDER BY cm.is_primary DESC,cm.id");
        $members->execute($ids);
        foreach($members->fetchAll() as $member)$membersByCensus[(int)$member['census_id']][]=$member;
    }
    foreach($rows as &$row){
        $row['members']=$membersByCensus[(int)$row['id']]??[];
        $row['expected_fields']=census_expected_fields((int)$row['year']);
        $row['media']=[];
    }
    unset($row);
    if($rows){
        $ids=array_values(array_unique(array_map(fn($row)=>(int)$row['id'],$rows)));
        $marks=implode(',',array_fill(0,count($ids),'?'));
        $media=$pdo->prepare("SELECT ml.entity_id AS census_id,m.*,
            trim('Recensement ' || cr.year || CASE WHEN cr.address<>'' THEN ' — '||cr.address ELSE '' END) AS attachment_label
            FROM media_links ml
            JOIN media m ON m.id=ml.media_id
            JOIN census_records cr ON cr.id=ml.entity_id
            WHERE ml.entity_type='census' AND ml.entity_id IN ($marks)
            ORDER BY COALESCE(m.date_text,''),ml.position,m.id");
        $media->execute($ids);
        $mediaByCensus=[];
        foreach($media->fetchAll() as $item)$mediaByCensus[(int)$item['census_id']][]=$item;
        foreach($rows as &$row)$row['media']=$mediaByCensus[(int)$row['id']]??[];
        unset($row);
    }
    return ['official_years'=>census_years(),'records'=>$rows];
}

function census_member_memberships_data(PDO $pdo, int $personId): never
{
    if (!$personId || !person_exists($pdo, $personId)) json_response(['records'=>[]]);
    $stmt=$pdo->prepare("SELECT cr.id AS census_id,cr.year,cr.address,cr.is_special,pl.name AS place_name,cm.id AS member_id,cm.display_name,cm.household_position
        FROM census_members cm
        JOIN census_records cr ON cr.id=cm.census_id
        LEFT JOIN places pl ON pl.id=cr.place_id
        WHERE cm.person_id=?
        ORDER BY cr.year,cr.id");
    $stmt->execute([$personId]);
    json_response(['records'=>$stmt->fetchAll()]);
}

function is_full_date(string $date): bool
{
    $date=trim(mb_strtolower($date));
    if($date==='')return false;
    if(preg_match('/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}$/',$date))return true;
    return (bool)preg_match('/^\d{1,2}\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4}$/u',$date);
}

function automatic_biography(array $person,array $events,array $parents,array $partners,array $children): string
{
    $name=full_name($person) ?: 'Cette personne';
    $parts=[];
    $birth=null;$death=null;$occupations=[];
    foreach($events as $event){if(($event['gedcom_tag']??'')==='BIRT'&&!$birth)$birth=$event;if(($event['gedcom_tag']??'')==='DEAT'&&!$death)$death=$event;if(($event['gedcom_tag']??'')==='OCCU'||mb_strtolower((string)($event['type_label']??''))==='profession')$occupations[]=$event['title']?:$event['description'];}
    $birthPlace=$birth?trim(implode(', ',array_filter([$birth['place_name']??'', $birth['country']??'']))):'';
    $deathPlace=$death?trim(implode(', ',array_filter([$death['place_name']??'', $death['country']??'']))):'';
    $parts[]=$name.($birth?(' naît '.(($birth['date_text']??'')?:('en '.$birth['year'])).($birthPlace?' à '.$birthPlace:'')):' n’a pas encore de naissance documentée dans la base').'.';
    if($parents)$parts[]='Ses parents connus sont '.implode(' et ',array_map('full_name',$parents)).'.';
    if($partners)$parts[]='Sa vie familiale connue mentionne '.count($partners).' conjoint'.(count($partners)>1?'s':'').' : '.implode(', ',array_map('full_name',$partners)).'.';
    if($children)$parts[]='La base lui rattache '.count($children).' enfant'.(count($children)>1?'s':'').'.';
    if(trim((string)($person['occupation']??''))!=='')$parts[]='Métier ou activité indiquée : '.$person['occupation'].'.';
    elseif(array_filter($occupations))$parts[]='Profession mentionnée : '.implode(', ',array_filter($occupations)).'.';
    if($death)$parts[]=$name.' décède '.(($death['date_text']??'')?:('en '.$death['year'])).($deathPlace?' à '.$deathPlace:'').'.';
    return implode("\n\n",$parts);
}

function summary_person(PDO $pdo, int $id): ?array
{
    static $stmt = null;
    $stmt ??= $pdo->prepare(person_select() . ' WHERE p.id=?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

function tree_node_from_maps(int $id, int $depth, array $people, array $relations, array &$seen): ?array
{
    if($id<=0||isset($seen[$id])||!isset($people[$id]))return null;
    $seen[$id]=true;$node=['person'=>$people[$id],'children'=>[],'has_more'=>false];if($depth<=0){$node['has_more']=!empty($relations[$id]);return $node;}
    foreach($relations[$id]??[] as $nextId){$child=tree_node_from_maps((int)$nextId,$depth-1,$people,$relations,$seen);if($child)$node['children'][]=$child;}
    return $node;
}

function attach_tree_partners(?array &$node, array $partners, array $people): void
{
    if(!$node)return;
    $id=(int)$node['person']['id'];$node['partners']=[];
    foreach($partners[$id]??[] as $partnerId)if(isset($people[$partnerId]))$node['partners'][]=$people[$partnerId];
    if(!empty($node['children'])){foreach($node['children'] as &$child)attach_tree_partners($child,$partners,$people);unset($child);}
}

function tree_data(PDO $pdo, int $id): never
{
    $mode = in_array($_GET['mode'] ?? '', ['ancestors','descendants'], true) ? $_GET['mode'] : 'ancestors';
    $depth = min(20, max(1, safe_int($_GET['depth'] ?? 4)));
    $relations=[];
    $rows=$pdo->query('SELECT fc.child_id,f.partner1_id,f.partner2_id,fc.position FROM family_children fc JOIN families f ON f.id=fc.family_id ORDER BY fc.position')->fetchAll();
    foreach($rows as $row){$child=(int)$row['child_id'];$parents=array_values(array_filter([(int)($row['partner1_id']??0),(int)($row['partner2_id']??0)]));if($mode==='ancestors'){$relations[$child]=array_values(array_unique(array_merge($relations[$child]??[],$parents)));}else{foreach($parents as $parent)if(!in_array($child,$relations[$parent]??[],true))$relations[$parent][]=$child;}}
    $reachable=[$id=>true];$frontier=[$id];
    for($level=0;$level<$depth&&$frontier;$level++){$next=[];foreach($frontier as $personId)foreach($relations[$personId]??[] as $relatedId)if(!isset($reachable[$relatedId])){$reachable[$relatedId]=true;$next[]=$relatedId;}$frontier=$next;}
    $ids=array_keys($reachable);$people=[];$partners=[];$allIds=$ids;
    if($ids){
        if($mode==='descendants'){$marks=implode(',',array_fill(0,count($ids),'?'));$partnerStmt=$pdo->prepare("SELECT partner1_id,partner2_id FROM families WHERE partner1_id IN ($marks) OR partner2_id IN ($marks)");$partnerStmt->execute(array_merge($ids,$ids));foreach($partnerStmt->fetchAll() as $family){$a=(int)($family['partner1_id']??0);$b=(int)($family['partner2_id']??0);if($a&&$b){if(isset($reachable[$a]))$partners[$a][$b]=$b;if(isset($reachable[$b]))$partners[$b][$a]=$a;$allIds[]=$a;$allIds[]=$b;}}}
        $allIds=array_values(array_unique(array_filter($allIds)));$allMarks=implode(',',array_fill(0,count($allIds),'?'));$stmt=$pdo->prepare(person_select()." WHERE p.id IN ($allMarks)");$stmt->execute($allIds);foreach($stmt->fetchAll() as $person)$people[(int)$person['id']]=$person;
        // en option : les animaux de chacun, posés à côté de leur maître
        if(($_GET['pets']??'')==='1'&&function_exists('pets_by_owner'))foreach(pets_by_owner($pdo,array_keys($people)) as $ownerId=>$list)$people[$ownerId]['pets']=$list;
        // en option : les lieux de naissance et de décès (arbre décoratif)
        if(($_GET['places']??'')==='1'&&$people){$pm=implode(',',array_fill(0,count($people),'?'));$ps=$pdo->prepare("SELECT e.person_id,t.gedcom_tag,pl.name FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE e.person_id IN ($pm) AND t.gedcom_tag IN ('BIRT','DEAT','CHR','BAPM','BURI') ORDER BY e.id");$ps->execute(array_keys($people));foreach($ps->fetchAll() as $r){$pid=(int)$r['person_id'];$k=in_array($r['gedcom_tag'],['BIRT','CHR','BAPM'],true)?'birth_place':'death_place';if(isset($people[$pid])&&empty($people[$pid][$k]))$people[$pid][$k]=(string)$r['name'];}}
    }
    $seen=[];$tree=tree_node_from_maps($id,$depth,$people,$relations,$seen);
    if($mode==='descendants')attach_tree_partners($tree,$partners,$people);
    json_response(['mode'=>$mode,'depth'=>$depth,'nodeCount'=>count($seen),'tree'=>$tree]);
}

function kinship_data(PDO $pdo,int $from,int $to): never
{
    if(!$from||!$to)json_response(['path'=>[],'relations'=>[]]);if($from===$to){$person=summary_person($pdo,$from);json_response(['path'=>$person?[$person]:[],'relations'=>[]]);}
    $graph=[];
    foreach($pdo->query('SELECT fc.child_id,f.partner1_id,f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id')->fetchAll() as $row){$child=(int)$row['child_id'];foreach([(int)($row['partner1_id']??0),(int)($row['partner2_id']??0)] as $parent){if(!$parent)continue;$graph[$child][]=[$parent,'enfant de'];$graph[$parent][]=[$child,'parent de'];}}
    foreach($pdo->query('SELECT partner1_id,partner2_id FROM families WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL')->fetchAll() as $row){$a=(int)$row['partner1_id'];$b=(int)$row['partner2_id'];$graph[$a][]=[$b,'conjoint de'];$graph[$b][]=[$a,'conjoint de'];}
    $queue=[$from];$head=0;$previous=[$from=>null];$relation=[];
    while($head<count($queue)){$current=$queue[$head++];foreach($graph[$current]??[] as [$next,$label]){if(array_key_exists($next,$previous))continue;$previous[$next]=$current;$relation[$next]=$label;$queue[]=$next;if($next===$to)break 2;}}
    if(!array_key_exists($to,$previous))json_response(['path'=>[],'relations'=>[]]);
    $ids=[];$labels=[];for($cursor=$to;$cursor!==null;$cursor=$previous[$cursor]){$ids[]=$cursor;if(isset($relation[$cursor]))$labels[]=$relation[$cursor];}$ids=array_reverse($ids);$labels=array_reverse($labels);
    $marks=implode(',',array_fill(0,count($ids),'?'));$stmt=$pdo->prepare(person_select()." WHERE p.id IN ($marks)");$stmt->execute($ids);$map=[];foreach($stmt->fetchAll() as $person)$map[(int)$person['id']]=$person;$path=array_values(array_filter(array_map(fn($id)=>$map[$id]??null,$ids)));
    json_response(['path'=>$path,'relations'=>$labels,'length'=>max(0,count($path)-1)]);
}

function map_data(PDO $pdo): never
{
    $tag = safe_text($_GET['tag'] ?? 'all');
    $yearFrom=safe_int($_GET['year_from']??0);$yearTo=safe_int($_GET['year_to']??0);if($yearFrom&&$yearTo&&$yearFrom>$yearTo)[$yearFrom,$yearTo]=[$yearTo,$yearFrom];
    $gender=safe_text($_GET['gender']??'');if(!in_array($gender,['male','female','unknown'],true))$gender='';
    $ageFrom=safe_int($_GET['age_from']??0);$ageTo=safe_int($_GET['age_to']??0);if($ageFrom&&$ageTo&&$ageFrom>$ageTo)[$ageFrom,$ageTo]=[$ageTo,$ageFrom];
    $surname=safe_text($_GET['surname']??'');
    $surnameMode=safe_text($_GET['surname_mode']??'last_name');$surnameByGroup=$surnameMode==='group';
    $limit = min(20000, max(100, safe_int($_GET['limit'] ?? 2500)));
    // Recensements : table dédiée census_records (pas dans events, pas de precise_lat/lon)
    if($tag==='CENS'){
        $cwhere='';
        if($yearFrom)$cwhere.=' AND cr.year>=:year_from';
        if($yearTo)$cwhere.=' AND cr.year<=:year_to';
        if($gender==='unknown')$cwhere.=" AND (p.gender IS NULL OR p.gender NOT IN ('male','female'))";
        elseif($gender!=='')$cwhere.=' AND p.gender=:gender';
        if($surname!==''&&$surnameByGroup)$cwhere.=' AND g.name LIKE :surname COLLATE NOCASE';
        elseif($surname!=='')$cwhere.=' AND p.last_name LIKE :surname COLLATE NOCASE';
        // On prend le membre primaire ; si aucun, on prend le premier membre lié à une personne
        $csql="SELECT cr.id, cr.year AS year, COALESCE(NULLIF(cr.date_text,''),CAST(cr.year AS TEXT)) AS date_text,
            cr.address,
            'Recensement '||cr.year AS type_label, 'CENS' AS gedcom_tag,
            p.id AS person_id, p.first_name, p.last_name,
            pl.id AS place_id, pl.name, pl.subdivision, pl.county, pl.state, pl.country,
            pl.latitude, pl.longitude,
            NULL AS precise_lat, NULL AS precise_lon
            FROM census_records cr
            JOIN places pl ON pl.id=cr.place_id
            JOIN census_members cm ON cm.census_id=cr.id
                AND cm.id=(SELECT id FROM census_members WHERE census_id=cr.id ORDER BY is_primary DESC, id ASC LIMIT 1)
            LEFT JOIN persons p ON p.id=cm.person_id
            LEFT JOIN surname_groups g ON g.id=p.surname_group_id
            WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
              AND pl.name IS NOT NULL AND trim(pl.name)<>''
              AND NOT (pl.latitude=0 AND pl.longitude=0)
              AND lower(trim(pl.name)) NOT IN ('lieu sans nom','sans lieu','lieu inconnu','inconnu','unknown','pays inconnu')
              AND NOT (pl.county IS NULL AND pl.state IS NULL AND lower(trim(pl.name))=lower(trim(pl.country)))
              {$cwhere} ORDER BY cr.year LIMIT :limit";
        $cstmt=$pdo->prepare($csql);
        if($yearFrom)$cstmt->bindValue(':year_from',$yearFrom,PDO::PARAM_INT);
        if($yearTo)$cstmt->bindValue(':year_to',$yearTo,PDO::PARAM_INT);
        if($gender&&$gender!=='unknown')$cstmt->bindValue(':gender',$gender);
        if($surname!=='')$cstmt->bindValue(':surname','%'.$surname.'%');
        $cstmt->bindValue(':limit',$limit,PDO::PARAM_INT);
        $cstmt->execute();
        $ccountSql="SELECT COUNT(*) FROM census_records cr
            JOIN places pl ON pl.id=cr.place_id
            JOIN census_members cm ON cm.census_id=cr.id
                AND cm.id=(SELECT id FROM census_members WHERE census_id=cr.id ORDER BY is_primary DESC, id ASC LIMIT 1)
            LEFT JOIN persons p ON p.id=cm.person_id
            LEFT JOIN surname_groups g ON g.id=p.surname_group_id
            WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
              AND pl.name IS NOT NULL AND trim(pl.name)<>''
              AND NOT (pl.latitude=0 AND pl.longitude=0)
              AND lower(trim(pl.name)) NOT IN ('lieu sans nom','sans lieu','lieu inconnu','inconnu','unknown','pays inconnu')
              AND NOT (pl.county IS NULL AND pl.state IS NULL AND lower(trim(pl.name))=lower(trim(pl.country)))
              {$cwhere}";
        $ccountStmt=$pdo->prepare($ccountSql);
        if($yearFrom)$ccountStmt->bindValue(':year_from',$yearFrom,PDO::PARAM_INT);
        if($yearTo)$ccountStmt->bindValue(':year_to',$yearTo,PDO::PARAM_INT);
        if($gender&&$gender!=='unknown')$ccountStmt->bindValue(':gender',$gender);
        if($surname!=='')$ccountStmt->bindValue(':surname','%'.$surname.'%');
        $ccountStmt->execute();
        $ctotal=(int)$ccountStmt->fetchColumn();
        json_response(['points'=>$cstmt->fetchAll(),'total'=>$ctotal]);
    }
    $where = $tag !== 'all' ? ' AND t.gedcom_tag=:tag' : '';
    if($yearFrom)$where.=' AND e.year>=:year_from';if($yearTo)$where.=' AND e.year<=:year_to';
    // la personne de l'événement, ou l'un des deux conjoints d'un événement de couple (mariage…)
    $anyone=static fn(string $cond)=>" AND EXISTS(SELECT 1 FROM persons x LEFT JOIN surname_groups gx ON gx.id=x.surname_group_id WHERE x.id IN (e.person_id,f.partner1_id,f.partner2_id) AND {$cond})";
    if($gender==='unknown')$where.=$anyone("(x.gender IS NULL OR x.gender NOT IN ('male','female'))");
    elseif($gender!=='')$where.=$anyone('x.gender=:gender');
    if($surname!==''&&$surnameByGroup)$where.=$anyone('gx.name LIKE :surname COLLATE NOCASE');
    elseif($surname!=='')$where.=$anyone('x.last_name LIKE :surname COLLATE NOCASE');
    if($ageFrom||$ageTo){
        $bsub="(SELECT e2.year FROM events e2 JOIN event_types t2 ON t2.id=e2.event_type_id WHERE e2.person_id=x.id AND t2.gedcom_tag='BIRT' ORDER BY e2.id LIMIT 1)";
        $where.=$anyone("{$bsub} IS NOT NULL".($ageFrom?" AND (e.year - {$bsub})>=:age_from":'').($ageTo?" AND (e.year - {$bsub})<=:age_to":''));
    }
    $locationMode=safe_text($_GET['location_mode']??'city'); // 'city', 'combined' ou 'precise'
    if($locationMode==='precise'){
        // Mode précis : uniquement les événements avec coordonnées manuelles
        // La commune n'a pas besoin d'être géocodée : on utilise precise_lat/lon directement
        $where.=' AND e.precise_lat IS NOT NULL AND e.precise_lon IS NOT NULL';
        $sql = "SELECT e.id,e.year,e.date_text,e.address,t.label AS type_label,t.gedcom_tag,COALESCE(p.id,p1.id,p2.id) AS person_id,
            COALESCE(NULLIF(trim(p.first_name),''),trim(COALESCE(p1.first_name,'')||CASE WHEN p2.id IS NOT NULL THEN ' & '||COALESCE(p2.first_name,'') ELSE '' END)) AS first_name,
            COALESCE(NULLIF(trim(p.last_name),''),trim(COALESCE(p1.last_name,'')||CASE WHEN p2.id IS NOT NULL AND COALESCE(p2.last_name,'')<>COALESCE(p1.last_name,'') THEN ' / '||COALESCE(p2.last_name,'') ELSE '' END)) AS last_name,
            pl.id AS place_id,pl.name,pl.subdivision,pl.county,pl.state,pl.country,
            e.precise_lat AS latitude,e.precise_lon AS longitude,
            e.precise_lat,e.precise_lon
            FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
            LEFT JOIN persons p ON p.id=e.person_id
            LEFT JOIN families f ON f.id=e.family_id
            LEFT JOIN persons p1 ON p1.id=f.partner1_id
            LEFT JOIN persons p2 ON p2.id=f.partner2_id
            LEFT JOIN surname_groups g ON g.id=p.surname_group_id
            WHERE e.precise_lat IS NOT NULL AND e.precise_lon IS NOT NULL
            AND NOT (e.precise_lat=0 AND e.precise_lon=0)
            AND pl.name IS NOT NULL AND trim(pl.name)<>''
            {$where} ORDER BY e.year LIMIT :limit";
    } else {
        // Mode ville ou combiné : on requiert les coords de la commune
        $sql = "SELECT e.id,e.year,e.date_text,e.address,t.label AS type_label,t.gedcom_tag,COALESCE(p.id,p1.id,p2.id) AS person_id,
            COALESCE(NULLIF(trim(p.first_name),''),trim(COALESCE(p1.first_name,'')||CASE WHEN p2.id IS NOT NULL THEN ' & '||COALESCE(p2.first_name,'') ELSE '' END)) AS first_name,
            COALESCE(NULLIF(trim(p.last_name),''),trim(COALESCE(p1.last_name,'')||CASE WHEN p2.id IS NOT NULL AND COALESCE(p2.last_name,'')<>COALESCE(p1.last_name,'') THEN ' / '||COALESCE(p2.last_name,'') ELSE '' END)) AS last_name,
            pl.id AS place_id,pl.name,pl.subdivision,pl.county,pl.state,pl.country,pl.latitude,pl.longitude,
            e.precise_lat,e.precise_lon
            FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
            LEFT JOIN persons p ON p.id=e.person_id
            LEFT JOIN families f ON f.id=e.family_id
            LEFT JOIN persons p1 ON p1.id=f.partner1_id
            LEFT JOIN persons p2 ON p2.id=f.partner2_id
            LEFT JOIN surname_groups g ON g.id=p.surname_group_id
            WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
            AND pl.name IS NOT NULL AND trim(pl.name)<>''
            AND NOT (pl.latitude=0 AND pl.longitude=0)
            AND lower(trim(pl.name)) NOT IN ('lieu sans nom','sans lieu','lieu inconnu','inconnu','unknown','pays inconnu')
            AND NOT (pl.county IS NULL AND pl.state IS NULL AND lower(trim(pl.name))=lower(trim(pl.country)))
            {$where} ORDER BY e.year LIMIT :limit";
    }
    $stmt = $pdo->prepare($sql);
    if ($tag !== 'all') $stmt->bindValue(':tag', $tag);
    if($yearFrom)$stmt->bindValue(':year_from',$yearFrom,PDO::PARAM_INT);if($yearTo)$stmt->bindValue(':year_to',$yearTo,PDO::PARAM_INT);
    if($gender&&$gender!=='unknown')$stmt->bindValue(':gender',$gender);
    if($surname!=='')$stmt->bindValue(':surname','%'.$surname.'%');
    if($ageFrom)$stmt->bindValue(':age_from',$ageFrom,PDO::PARAM_INT);if($ageTo)$stmt->bindValue(':age_to',$ageTo,PDO::PARAM_INT);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    if($locationMode==='precise'){
        $countSql="SELECT COUNT(*) FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
            LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN families f ON f.id=e.family_id
            LEFT JOIN surname_groups g ON g.id=p.surname_group_id
            WHERE e.precise_lat IS NOT NULL AND e.precise_lon IS NOT NULL
            AND NOT (e.precise_lat=0 AND e.precise_lon=0)
            AND pl.name IS NOT NULL AND trim(pl.name)<>''
            {$where}";
    } else {
        $countSql="SELECT COUNT(*) FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
            LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN families f ON f.id=e.family_id
            LEFT JOIN surname_groups g ON g.id=p.surname_group_id
            WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
            AND pl.name IS NOT NULL AND trim(pl.name)<>''
            AND NOT (pl.latitude=0 AND pl.longitude=0)
            AND lower(trim(pl.name)) NOT IN ('lieu sans nom','sans lieu','lieu inconnu','inconnu','unknown','pays inconnu')
            AND NOT (pl.county IS NULL AND pl.state IS NULL AND lower(trim(pl.name))=lower(trim(pl.country)))
            {$where}";
    }
    $countStmt=$pdo->prepare($countSql);
    if ($tag !== 'all') $countStmt->bindValue(':tag', $tag);
    if($yearFrom)$countStmt->bindValue(':year_from',$yearFrom,PDO::PARAM_INT);if($yearTo)$countStmt->bindValue(':year_to',$yearTo,PDO::PARAM_INT);
    if($gender&&$gender!=='unknown')$countStmt->bindValue(':gender',$gender);
    if($surname!=='')$countStmt->bindValue(':surname','%'.$surname.'%');
    if($ageFrom)$countStmt->bindValue(':age_from',$ageFrom,PDO::PARAM_INT);if($ageTo)$countStmt->bindValue(':age_to',$ageTo,PDO::PARAM_INT);
    $countStmt->execute();
    $total=(int)$countStmt->fetchColumn();
    json_response(['points' => $stmt->fetchAll(), 'total' => $total]);
}

function departmental_archives_seed(): array
{
    $names = [
        '01'=>'Ain','02'=>'Aisne','03'=>'Allier','04'=>'Alpes-de-Haute-Provence','05'=>'Hautes-Alpes','06'=>'Alpes-Maritimes','07'=>'Ardèche','08'=>'Ardennes','09'=>'Ariège','10'=>'Aube','11'=>'Aude','12'=>'Aveyron','13'=>'Bouches-du-Rhône','14'=>'Calvados','15'=>'Cantal','16'=>'Charente','17'=>'Charente-Maritime','18'=>'Cher','19'=>'Corrèze','2A'=>'Corse-du-Sud','2B'=>'Haute-Corse','21'=>'Côte-d’Or','22'=>'Côtes-d’Armor','23'=>'Creuse','24'=>'Dordogne','25'=>'Doubs','26'=>'Drôme','27'=>'Eure','28'=>'Eure-et-Loir','29'=>'Finistère','30'=>'Gard','31'=>'Haute-Garonne','32'=>'Gers','33'=>'Gironde','34'=>'Hérault','35'=>'Ille-et-Vilaine','36'=>'Indre','37'=>'Indre-et-Loire','38'=>'Isère','39'=>'Jura','40'=>'Landes','41'=>'Loir-et-Cher','42'=>'Loire','43'=>'Haute-Loire','44'=>'Loire-Atlantique','45'=>'Loiret','46'=>'Lot','47'=>'Lot-et-Garonne','48'=>'Lozère','49'=>'Maine-et-Loire','50'=>'Manche','51'=>'Marne','52'=>'Haute-Marne','53'=>'Mayenne','54'=>'Meurthe-et-Moselle','55'=>'Meuse','56'=>'Morbihan','57'=>'Moselle','58'=>'Nièvre','59'=>'Nord','60'=>'Oise','61'=>'Orne','62'=>'Pas-de-Calais','63'=>'Puy-de-Dôme','64'=>'Pyrénées-Atlantiques','65'=>'Hautes-Pyrénées','66'=>'Pyrénées-Orientales','67'=>'Bas-Rhin','68'=>'Haut-Rhin','69'=>'Rhône','70'=>'Haute-Saône','71'=>'Saône-et-Loire','72'=>'Sarthe','73'=>'Savoie','74'=>'Haute-Savoie','75'=>'Paris','76'=>'Seine-Maritime','77'=>'Seine-et-Marne','78'=>'Yvelines','79'=>'Deux-Sèvres','80'=>'Somme','81'=>'Tarn','82'=>'Tarn-et-Garonne','83'=>'Var','84'=>'Vaucluse','85'=>'Vendée','86'=>'Vienne','87'=>'Haute-Vienne','88'=>'Vosges','89'=>'Yonne','90'=>'Territoire de Belfort','91'=>'Essonne','92'=>'Hauts-de-Seine','93'=>'Seine-Saint-Denis','94'=>'Val-de-Marne','95'=>'Val-d’Oise','971'=>'Guadeloupe','972'=>'Martinique','973'=>'Guyane','974'=>'La Réunion','976'=>'Mayotte',
    ];
    $rows = [];
    foreach ($names as $code => $name) {
        $codeText = is_int($code) && $code < 100 ? str_pad((string)$code, 2, '0', STR_PAD_LEFT) : (string)$code;
        $rows[] = [
            'code' => $codeText,
            'department' => $name,
            'service' => 'Archives départementales - ' . $name,
            'search_url' => '',
            'registration_required' => 'unknown',
            'digitized' => 'À compléter : état civil, tables décennales, recensements, cadastre, matricules, presse ou autres fonds selon le département.',
            'note' => 'Lien direct et conditions d’accès à vérifier.',
        ];
    }
    foreach ($rows as &$row) {
        if ((string)$row['code'] === '18') {
            $row['service'] = 'Archives départementales du Cher';
            $row['search_url'] = 'https://www.archives18.fr/archives-numerisees';
            $row['digitized'] = 'Archives numérisées : liste complète des fonds séparée par rubrique sur la page des Archives du Cher.';
            $row['note'] = 'Page directe fournie : archives numérisées du Cher. Inscription à vérifier selon les fonds consultés.';
        }
    }
    unset($row);
    $overrides = [
        '01'=>['https://www.archives.ain.fr/archive/recherche/etatcivil/n:88','Registres paroissiaux et état civil, recensements, matricules, cadastre, cartes postales, presse.'],
        '02'=>['https://archives.aisne.fr/archive/recherche/etatcivil/n:11','Registres paroissiaux et état civil, recensements, cadastre, matricules, iconographie et autres fonds numérisés.'],
        '03'=>['https://archives.allier.fr/rechercher/archives-numerisees/genealogie-histoire-des-familles/etat-civil-en-ligne','État civil, cadastre, recensements, registres matricules et fonds numérisés.'],
        '04'=>['https://www.archives04.fr/rechercher/archives-en-ligne/etat-civil-1','Registres paroissiaux et état civil, cadastre et fonds numérisés.'],
        '05'=>['https://archives.hautes-alpes.fr/archive/recherche/etatcivil/n:198','Registres paroissiaux, état civil et fonds numérisés.'],
        '06'=>['https://archives06.fr/archive/resultats/etatcivil2/n:101?type=etatcivil2','État civil, cadastre, recensement militaire, annuaires et fonds numérisés.'],
        '07'=>['https://archives.ardeche.fr/n/archives-numerisees-et-numeriques/n:1','Registres paroissiaux et état civil, cadastre et fonds numérisés.'],
        '08'=>['https://archives.cd08.fr/archives-numerisees/sources-genealogiques/registres-paroissiaux-et-detat-civil','Archives numérisées des Ardennes.'],
        '09'=>['https://archives.ariege.fr/rechercher-et-consulter/archives-en-ligne/etat-civil/','Registres paroissiaux, état civil, tables décennales et fonds numérisés.'],
        '10'=>['https://www.archives-aube.fr/recherches/documents-numerises','État civil, cadastre, fonds Clairvaux et autres fonds numérisés.'],
        '11'=>['https://archivesdepartementales.aude.fr/letat-civil','Archives numérisées de l’Aude.'],
        '12'=>['https://archives.aveyron.fr/n/archives-numerisees/n:119','Registres paroissiaux et état civil, notariat, matricules, presse.'],
        '13'=>['https://www.archives13.fr/n/archives-numerisees/n:1','Registres paroissiaux et état civil, cadastre et fonds numérisés.'],
        '14'=>['https://archives.calvados.fr/page/genealogie','État civil, registres paroissiaux, cadastre, matricules, presse, recensements.'],
        '15'=>['https://www.archives.cantal.fr/vos-archives/etat-civil','État civil, tables décennales, recensements, cadastre, matricules.'],
        '16'=>['https://lasource.archives.lacharente.fr/n/faire-sa-genealogie/n:114','Archives numérisées de la Charente.'],
        '17'=>['https://archives.charente-maritime.fr/archives-en-ligne','Registres paroissiaux, protestants et état civil.'],
        '19'=>['https://www.archives.correze.fr/search/form/3b1ba8cc-6c08-47cd-a90e-f9b231fdc30f','État civil, recensements, matricules, successions et fonds numérisés.'],
        '2A'=>['https://archives.isula.corsica/','État civil, recensements, matricules, territoires et fonds numérisés corses.'],
        '2B'=>['https://archives.isula.corsica/','État civil, recensements, matricules, territoires et fonds numérisés corses.'],
        '21'=>['https://archives.cotedor.fr/v2/site/AD21/Rechercher/Archives_en_ligne','État civil, recensements, cadastre, matricules, dictionnaire topographique, cartes postales.'],
        '22'=>['https://archives.cotesdarmor.fr/registres-paroissiaux-et-d-etat-civil','Registres paroissiaux, état civil, cadastre, recensements.'],
        '23'=>['https://archives.creuse.fr/rechercher/archives-numerisees','Archives numérisées de la Creuse.'],
        '24'=>['https://archives.dordogne.fr/archives-numerisees','Archives numérisées de la Dordogne.'],
        '25'=>['https://archives.doubs.fr/page/acces-a-l-etat-civil','Tables décennales, état civil et fonds numérisés du Doubs.'],
        '26'=>['https://archives.ladrome.fr/page/archives-numerisees','Archives numérisées de la Drôme.'],
        '27'=>['https://archives.eure.fr/page/etat-civil-et-autres-documents-en-ligne','Registres paroissiaux et état civil, recensements, matricules, cartes postales.'],
        '28'=>['https://archives28.fr/archives-et-inventaires-en-ligne/histoire-des-individus-des-populations-et-genealogie','Registres paroissiaux et état civil, recensements, plans et fonds numérisés.'],
        '29'=>['https://recherche.archives.finistere.fr/archive/resultats/etatcivil/n:138?type=etatcivil','État civil, cadastre, recensements, presse, matricules, iconographie.'],
        '30'=>['https://archives.gard.fr/consulter-en-ligne/les-archives-en-ligne.html','Registres matricules et fonds numérisés du Gard.'],
        '31'=>['https://archives.haute-garonne.fr/archive/recherche/etatcivil/n:97','Registres paroissiaux et état civil, recensements, matricules, cadastre, compoix.'],
        '32'=>['https://www.archives32.fr/archives_numerisees/portail/','État civil, tables décennales, recensements, matricules, cadastre.'],
        '33'=>['https://archives.gironde.fr/archive/recherche/etatcivil/n:629','Registres paroissiaux et état civil, atlas, fonds d’amirauté, notariat ancien.'],
        '34'=>['https://archives-pierresvives.herault.fr/n/archives-en-ligne/n:1','Registres paroissiaux et état civil, recensements, matricules, cadastre, cartes postales.'],
        '35'=>['https://archives-en-ligne.ille-et-vilaine.fr/thot_internet/','Registres paroissiaux et état civil, cartes, cadastre et fonds numérisés.'],
        '36'=>['https://www.archives36.fr/fonds-numerises/recherches-genealogiques','Archives numérisées de l’Indre.'],
        '37'=>['https://archives.touraine.fr/page/archives-numerisees','Tables décennales, cadastre, archives de la Seconde Guerre mondiale et fonds numérisés.'],
        '38'=>['https://archives.isere.fr/page/registres-paroissiaux-et-detat-civil','Archives de l’Isère en ligne.'],
        '39'=>['https://archives39.fr/page/acces-aux-documents-numerises','Tables décennales, état civil, matricules, cadastre, recensements et fonds numérisés.'],
        '40'=>['https://archives.landes.fr/faire-une-recherche/archives-numerisees/rechercher-une-personne','Archives numérisées des Landes.'],
        '41'=>['https://www.archives41.fr/archive/recherche/etatcivil/n:19','Archives numérisées du Loir-et-Cher.'],
        '42'=>['https://archives.loire.fr/n/archives-numerisees-en-ligne/n:90','État civil, tables décennales, recensements, successions, matricules, cartes postales.'],
        '43'=>['https://www.archives43.fr/archives-en-ligne','Archives numérisées de la Haute-Loire.'],
        '44'=>['https://archives.loire-atlantique.fr/44/archives-numerisees/c_5562','État civil, cadastre, presse, conscrits, inscrits maritimes, iconographie et nombreux fonds.'],
        '45'=>['https://www.archives-loiret.fr/faire-vos-recherches/archives-numerisees/etat-civil','Archives numérisées du Loiret.'],
        '46'=>['https://archives.lot.fr/recherche-en-ligne/archives-numerisees','Archives numérisées du Lot.'],
        '47'=>['https://lotetgaronne.archives.prismia.fr/accueil','Cartes, photographies, manuscrits, fonds historiques et archives numérisées.'],
        '48'=>['https://archives.lozere.fr/archive/recherche/etatcivil/n:88','Archives numérisées de la Lozère.'],
        '49'=>['https://archives.maine-et-loire.fr/recherche-et-consulter/archives-numerisees','Registres paroissiaux et état civil, cadastre, successions et fonds numérisés.'],
        '50'=>['https://www.archives-manche.fr/recherche/registres-paroissiaux-et-detat-civil','Archives numérisées de la Manche.'],
        '51'=>['https://archives.marne.fr/page/archives-numerisees','Archives numérisées de la Marne.'],
        '52'=>['https://archives.haute-marne.fr/rechercher/consulter-en-ligne/les-fonds-numerises/etat-civil-tables-decennales-et-recensements-de','État civil, recensements, cadastre, matricules, documents figurés.'],
        '53'=>['https://archives.lamayenne.fr/archives-en-ligne/etat-civil-search-form.html','État civil, recensements, cadastre, matricules, hypothèques et fonds numérisés.'],
        '54'=>['https://archivesenligne.meurthe-et-moselle.fr/archives-en-ligne/registres-paroissiaux-et-detat-civil','Archives numérisées de Meurthe-et-Moselle.'],
        '55'=>['https://archives.meuse.fr/page/archives-en-ligne','Archives numérisées de la Meuse.'],
        '56'=>['https://patrimoines-archives.morbihan.fr/rechercher/archives/archives-en-ligne','Archives numérisées du Morbihan.'],
        '57'=>['https://www.archives57.com/n/registres-paroissiaux-et-d-etat-civil/n:307','Archives numérisées de la Moselle.'],
        '58'=>['https://archives.nievre.fr/page/archives-en-ligne','Archives numérisées de la Nièvre.'],
        '59'=>['https://archivesdepartementales.lenord.fr/page/registres-paroissiaux-et-d-etat-civil','Archives numérisées du Nord.'],
        '60'=>['https://archives.oise.fr/','Archives numérisées de l’Oise.'],
        '61'=>['https://archives.orne.fr/etat-civil','Archives numérisées de l’Orne.'],
        '62'=>['https://www.archivespasdecalais.fr/Chercher/Archives-numerisees','Archives numérisées du Pas-de-Calais.'],
        '63'=>['https://www.archivesdepartementales.puy-de-dome.fr/n/rechercher/n:149','Archives numérisées du Puy-de-Dôme.'],
        '64'=>['https://earchives.le64.fr/archives-en-ligne/etat-civil-search-form.html','Archives numérisées des Pyrénées-Atlantiques.'],
        '65'=>['https://archivesenligne65.fr/archives/acces-thematique/naitre-vivre-et-mourir/les-registres-detat-civil','Archives numérisées des Hautes-Pyrénées.'],
        '66'=>['https://archives.cd66.fr/mdr/index.php/rechercheTheme','Archives numérisées des Pyrénées-Orientales.'],
        '67'=>['https://archives67.alsace.eu/n/archives-numerisees/n:124','Archives numérisées du Bas-Rhin et d’Alsace.'],
        '68'=>['https://archives68.alsace.eu/page/archives-numerisees','Archives numérisées du Haut-Rhin et d’Alsace.'],
        '69'=>['https://archives.rhone.fr/page/archives-consultables-en-ligne','Archives numérisées du Rhône.'],
        '70'=>['https://archives.haute-saone.fr/archive/recherche/etatcivil2/n:119','Archives numérisées de la Haute-Saône.'],
        '71'=>['https://archives71.fr/consulter/en-ligne','Archives numérisées de Saône-et-Loire.'],
        '72'=>['https://archives.sarthe.fr/archives-en-ligne','Registres paroissiaux et état civil, cadastre, matricules, fonds sonores.'],
        '73'=>['https://patrimoines.savoie.fr/web/dsp_6165/accueil','Archives numérisées de la Savoie.'],
        '74'=>['https://archives.hautesavoie.fr/archive/recherche/etatcivil/n:139','Archives numérisées de la Haute-Savoie.'],
        '75'=>['https://archives.paris.fr/archives-numerisees','État civil parisien, recensements, recrutement militaire, cadastre, iconographie et fonds numérisés.'],
        '76'=>['https://www.archivesdepartementales76.net/n/archives-numerisees/n:164','Archives numérisées de Seine-Maritime.'],
        '77'=>['https://archives.seine-et-marne.fr/fr/etat-civil','Archives numérisées de Seine-et-Marne.'],
        '78'=>['https://archives.yvelines.fr/rechercher/archives-en-ligne/registres-paroissiaux-et-detat-civil','Archives numérisées des Yvelines.'],
        '79'=>['https://archives-deux-sevres-vienne.fr/archive/recherche/etatcivil/n:100','Archives numérisées des Deux-Sèvres.'],
        '80'=>['https://archives.somme.fr/page/archives-en-ligne-1','État civil, recensements, matricules, cadastre, hypothèques, iconographie.'],
        '81'=>['https://archives.tarn.fr/rechercher/archives-et-images-en-ligne/documents-numerises','Archives numérisées du Tarn.'],
        '82'=>['http://www.archives82.fr/index.php?id=2151','Archives numérisées du Tarn-et-Garonne.'],
        '83'=>['https://archives.var.fr/recherche/rechercher-dans-les-archives-numerisees-et-les-inventaires','Archives numérisées du Var.'],
        '84'=>['https://memento.vaucluse.fr/dans-les-archives/consultation-en-ligne-archives','Archives numérisées du Vaucluse.'],
        '85'=>['https://archives.vendee.fr/consulter/aide/s-orienter-dans-les-fonds-numerises','Archives numérisées de la Vendée.'],
        '86'=>['https://archives-deux-sevres-vienne.fr/archive/recherche/etatcivil/n:100','Archives numérisées de la Vienne.'],
        '87'=>['https://archives.haute-vienne.fr/archives-departementales-de-la-haute-vienne/fonds-numerises/familles-et-individus-dont-etat-civil','Archives numérisées de la Haute-Vienne.'],
        '88'=>['https://recherche-archives.vosges.fr/archive/recherche/etatcivil/n:2','Archives numérisées des Vosges.'],
        '89'=>['https://archives.yonne.fr/archive/recherche/etatcivil/n:157','Archives numérisées de l’Yonne.'],
        '90'=>['https://archives.territoiredebelfort.fr/page/acceder-aux-fonds-numerises','Archives numérisées du Territoire de Belfort.'],
        '91'=>['https://archives.essonne.fr/page/par-thematique','Archives numérisées de l’Essonne.'],
        '92'=>['https://archives.hauts-de-seine.fr/archive/recherche/etatcivil/n:92','Archives numérisées des Hauts-de-Seine.'],
        '93'=>['https://archives.seinesaintdenis.fr/archive/recherche/etatcivil/n:217','Archives numérisées de Seine-Saint-Denis.'],
        '94'=>['https://archives.valdemarne.fr/recherches/archives-en-ligne/etat-civil','Archives numérisées du Val-de-Marne.'],
        '95'=>['https://archives.valdoise.fr/n/archives-numerisees/n:418','Archives numérisées du Val-d’Oise.'],
        '971'=>['https://www.archivesguadeloupe.fr/collection/etat-civil/','Archives numérisées de Guadeloupe.'],
        '972'=>['https://www.patrimoines-martinique.org/search/form/8ea80f22-2f9c-456b-94a0-adbd50d31e1c','Archives numérisées de Martinique.'],
        '973'=>['https://archives.ctguyane.fr/','Archives numérisées de Guyane.'],
        '974'=>['https://www.departement974.fr/archives-departementales','Archives numérisées de La Réunion.'],
        '976'=>['http://anom.archivesnationales.culture.gouv.fr/caomec2/','Pas de site d’archives en ligne à Mayotte : état civil ancien aux Archives nationales d’outre-mer.'],
    ];
    foreach ($rows as &$row) {
        $code = (string)$row['code'];
        if (!isset($overrides[$code])) continue;
        [$url, $digitized] = $overrides[$code];
        $row['search_url'] = $url;
        $row['digitized'] = $digitized;
        $row['note'] = $code === '18' ? $row['note'] : 'Lien vérifié le 8 octobre 2026 (page état civil ou archives en ligne du site). Conditions d’accès et inscription à confirmer sur le site.';
    }
    unset($row);
    return $rows;
}

function departmental_archives_rows(string $like, int $limit, int $offset): array
{
    $needle = trim($like, '%');
    $rows = departmental_archives_seed();
    if ($needle !== '') {
        $rows = array_values(array_filter($rows, static function ($row) use ($needle) {
            return stripos((string)$row['code'], $needle) !== false
                || stripos((string)$row['department'], $needle) !== false
                || stripos((string)$row['service'], $needle) !== false
                || stripos((string)$row['digitized'], $needle) !== false;
        }));
    }
    return array_slice($rows, $offset, $limit);
}

function departmental_archives_count(string $like): int
{
    return count(departmental_archives_rows($like, 1000, 0));
}

function list_data(PDO $pdo): never
{
    $type = $_GET['type'] ?? 'persons';
    $q = safe_text($_GET['q'] ?? '');
    $like = '%' . $q . '%';
    $offset = max(0, safe_int($_GET['offset'] ?? 0));
    $limit = min(150, max(30, safe_int($_GET['limit'] ?? 80)));
    $fetchLimit = $limit + 1;
    // Filtre optionnel par sexe, utilisé uniquement par la liste "persons".
    // Valeurs acceptées : male, female, unknown (regroupe tout ce qui n'est
    // ni male ni female). Vide/absent = pas de filtre (tous).
    // Plusieurs valeurs possibles, séparées par des virgules (barre des listes : cases Hommes / Femmes / Inconnu).
    $genders = array_values(array_intersect(['male', 'female', 'unknown'], array_map('trim', explode(',', safe_text($_GET['gender'] ?? '')))));
    $genderCond = '';
    $genderParams = [];
    if ($genders && count($genders) < 3) {
        $parts = [];
        foreach ($genders as $g) {
            if ($g === 'unknown') $parts[] = "COALESCE(p.gender,'') NOT IN ('male','female')";
            else { $parts[] = 'p.gender=?'; $genderParams[] = $g; }
        }
        $genderCond = ' AND (' . implode(' OR ', $parts) . ')';
    }
    // Lieu de naissance (un lieu de la base, ou un nom tapé) et étiquette : liste « persons » seulement.
    $birthPlaceId = safe_int($_GET['birth_place_id'] ?? 0);
    $birthPlaceText = safe_text($_GET['birth_place'] ?? '');
    if ($birthPlaceId) {
        // le lieu choisi, ou un lieu du même nom (ses quartiers, un doublon) : « Né(e) à Tulle »
        $genderCond .= " AND EXISTS(SELECT 1 FROM events be JOIN event_types bt ON bt.id=be.event_type_id JOIN places bp ON bp.id=be.place_id WHERE be.person_id=p.id AND bt.gedcom_tag='BIRT' AND (bp.id=? OR bp.name=(SELECT name FROM places WHERE id=?) COLLATE NOCASE))";
        array_push($genderParams, $birthPlaceId, $birthPlaceId);
    } elseif ($birthPlaceText !== '') {
        $genderCond .= " AND EXISTS(SELECT 1 FROM events be JOIN event_types bt ON bt.id=be.event_type_id JOIN places bp ON bp.id=be.place_id WHERE be.person_id=p.id AND bt.gedcom_tag='BIRT' AND bp.name LIKE ?)";
        $genderParams[] = '%' . $birthPlaceText . '%';
    }
    // Les animaux ont leur propre liste : « Personnes » ne les montre pas, sauf demande explicite (kind=all ou animal),
    // comme le panneau Personnes en base « famille ».
    $listKind = safe_text($_GET['kind'] ?? 'human');
    if ($listKind === 'animal') { $genderCond .= " AND p.kind='animal'"; }
    elseif ($listKind !== 'all') { $genderCond .= " AND COALESCE(p.kind,'human')<>'animal'"; }
    $labelId = safe_int($_GET['label_id'] ?? 0);
    if ($labelId) {
        $genderCond .= " AND EXISTS(SELECT 1 FROM label_links ll WHERE ll.entity_type='person' AND ll.entity_id=p.id AND ll.label_id=?)";
        $genderParams[] = $labelId;
    }
    $reminderMode = safe_text($_GET['reminder_mode'] ?? '');
    if (!in_array($reminderMode, ['on', 'before', 'after'], true)) $reminderMode = '';
    $reminderCategory = safe_text($_GET['reminder_category'] ?? '');
    if (!array_key_exists($reminderCategory, standalone_reminder_categories())) $reminderCategory = '';
    $sosaRootId = safe_int($_GET['sosa_root_id'] ?? 0);
    $sosaSort = safe_text($_GET['sosa_sort'] ?? 'sosa_asc');
    if (!in_array($sosaSort, ['sosa_asc', 'sosa_desc', 'birth_asc', 'birth_desc', 'marriage_asc', 'marriage_desc', 'death_asc', 'death_desc'], true)) $sosaSort = 'sosa_asc';
    $sosaMissing = safe_int($_GET['sosa_missing'] ?? 0) === 1;
    $sosaImpossible = safe_int($_GET['sosa_impossible'] ?? 0) === 1;
    $dabovilleSort = safe_text($_GET['daboville_sort'] ?? 'daboville_asc');
    if (!in_array($dabovilleSort, ['daboville_asc', 'daboville_desc', 'birth_asc', 'birth_desc', 'marriage_asc', 'marriage_desc', 'death_asc', 'death_desc'], true)) $dabovilleSort = 'daboville_asc';
    // Filtres optionnels pour la liste "media" : ville (recherche texte sur le lieu rattaché)
    // et plage de dates (à partir de / jusqu'à, au format AAAA-MM-JJ envoyé par un <input type="date">).
    $mediaCity = safe_text($_GET['city'] ?? '');
    $mediaDateFrom = safe_text($_GET['date_from'] ?? '');
    $mediaDateTo = safe_text($_GET['date_to'] ?? '');
    $courrierFilter = safe_text($_GET['courrier_filter'] ?? '');
    if (!in_array($courrierFilter, ['', 'fait_utilise', 'fait_non_utilise', 'fait_tous', 'tous'], true)) $courrierFilter = '';
    $data = match ($type) {
        'events' => (function () use ($pdo, $like, $fetchLimit, $offset) { $s=$pdo->prepare("SELECT e.id,e.date_text,e.year,t.label AS type,COALESCE(p.id,f1.id,f2.id) AS person_id,CASE WHEN p.id IS NOT NULL THEN trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) ELSE trim(trim(COALESCE(f1.first_name,'')||' '||COALESCE(f1.last_name,''))||CASE WHEN f1.id IS NOT NULL AND f2.id IS NOT NULL THEN ' et ' ELSE '' END||trim(COALESCE(f2.first_name,'')||' '||COALESCE(f2.last_name,''))) END AS person,f1.id AS partner1_id,f2.id AS partner2_id,trim(pl.name || CASE WHEN COALESCE(pl.subdivision,'')<>'' THEN ', '||pl.subdivision ELSE '' END) AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN families fa ON fa.id=e.family_id LEFT JOIN persons f1 ON f1.id=fa.partner1_id LEFT JOIN persons f2 ON f2.id=fa.partner2_id LEFT JOIN places pl ON pl.id=e.place_id WHERE " . list_event_search_sql() . " ORDER BY COALESCE(e.year,9999),e.sort_date,e.id LIMIT {$fetchLimit} OFFSET {$offset}"); $s->execute(list_event_search_params($like)); return $s->fetchAll(); })(),
        'places' => (function () use ($pdo, $like, $fetchLimit, $offset) { $s=$pdo->prepare("SELECT pl.*,(SELECT count(*) FROM events e WHERE e.place_id=pl.id) AS event_count FROM places pl WHERE " . list_place_where_sql($pdo) . " ORDER BY event_count DESC," . fold_sort_sql('pl.name') . "," . fold_sort_sql("COALESCE(pl.subdivision,'')") . ",pl.id LIMIT {$fetchLimit} OFFSET {$offset}"); $s->execute(list_place_search_params($like)); return $s->fetchAll(); })(),
        'media' => media_list_rows($pdo, $like, $fetchLimit, $offset, safe_text($_GET['scope'] ?? ''), safe_int($_GET['person_id'] ?? 0), $mediaCity, $mediaDateFrom, $mediaDateTo),
        'labels' => labels_list_rows($pdo, $like, $fetchLimit, $offset),
        'census' => census_list_rows($pdo,$like,$fetchLimit,$offset),
        'changes' => $pdo->query("SELECT * FROM change_log ORDER BY created_at DESC,id DESC LIMIT {$fetchLimit} OFFSET {$offset}")->fetchAll(),
        'occupations' => occupation_list_rows($pdo, $like, $fetchLimit, $offset),
        'employers' => employer_list_all($pdo, $like, $fetchLimit, $offset),
        'reminders' => reminder_list_rows($pdo, $like, $fetchLimit, $offset, $reminderMode, $reminderCategory),
        'research_budget' => research_budget_rows($pdo, $like, $fetchLimit, $offset),
        'courriers' => courrier_rows($pdo, $like, $fetchLimit, $offset, $courrierFilter),
        'living_contacts' => living_contact_rows($pdo, $like, $fetchLimit, $offset),
        'sosa' => sosa_list_rows($pdo, $like, $fetchLimit, $offset, $sosaRootId, $sosaSort, $sosaMissing, $sosaImpossible),
        'daboville' => daboville_list_rows($pdo, $like, $fetchLimit, $offset, $sosaRootId, $dabovilleSort),
        'signatures' => signature_list_rows($pdo, $like, $fetchLimit, $offset),
        'archives' => departmental_archives_rows($like, $fetchLimit, $offset),
        default => (function () use ($pdo, $like, $fetchLimit, $offset, $genderCond, $genderParams) { $s=$pdo->prepare(person_select() . " WHERE " . list_person_search_sql() . $genderCond . " ORDER BY CASE WHEN trim(COALESCE(p.last_name,''))='' THEN 1 ELSE 0 END," . fold_sort_sql('p.last_name') . "," . fold_sort_sql('p.first_name') . ",p.id LIMIT {$fetchLimit} OFFSET {$offset}"); $s->execute(array_merge(list_person_search_params($like), $genderParams)); return $s->fetchAll(); })(),
    };
    $hasMore = count($data) > $limit;
    if ($hasMore) $data = array_slice($data, 0, $limit);
    if ($type === 'labels') $data = labels_attach_linked($pdo, $data);
    if ($type === 'occupations') $data = occupation_attach_people($pdo, $data, 'occupation');
    if ($type === 'employers') { $mentions = employer_block_mentions($pdo); foreach ($data as &$er) { $er['people'] = employer_people($pdo, (string) $er['id'], $mentions); $er['person_count'] = count($er['people']); } unset($er); }
    $remainingCount = $hasMore ? max(1, count_list_remaining($pdo,$type,$like,$offset + count($data),$genderCond,$genderParams,safe_text($_GET['scope'] ?? ''),safe_int($_GET['person_id'] ?? 0),$reminderMode,$mediaCity,$mediaDateFrom,$mediaDateTo,$sosaRootId,$sosaSort,$sosaMissing,$sosaImpossible,$reminderCategory,$dabovilleSort,$courrierFilter)) : 0;
    $extra = $type === 'reminders' ? ['reminder_summary' => reminder_summary($pdo, $like, $reminderMode, $reminderCategory), 'reminder_categories' => standalone_reminder_categories()] : ($type === 'research_budget' ? ['research_budget_summary' => research_budget_summary($pdo, $like)] : ($type === 'courriers' ? ['courrier_summary' => courrier_summary($pdo, $like), 'courrier_organismes' => courrier_organismes(), 'courrier_statuts' => courrier_statuts()] : []));
    json_response(array_merge(['type' => $type, 'rows' => $data, 'offset'=>$offset, 'limit'=>$limit, 'hasMore'=>$hasMore, 'remainingCount'=>$remainingCount, 'gender'=>implode(',', $genders), 'kind'=>$listKind, 'reminder_mode'=>$reminderMode, 'reminder_category'=>$reminderCategory, 'city'=>$mediaCity, 'date_from'=>$mediaDateFrom, 'date_to'=>$mediaDateTo, 'sosa_root_id'=>$sosaRootId, 'sosa_sort'=>$sosaSort, 'sosa_missing'=>$sosaMissing ? 1 : 0, 'sosa_impossible'=>$sosaImpossible ? 1 : 0, 'daboville_sort'=>$dabovilleSort, 'courrier_filter'=>$courrierFilter], $extra));
}

/** Listes → Personnes : recherche dans le prénom, le nom et le nom regroupé, sans tenir compte des accents ni des tirets. */
function list_person_search_sql(): string
{
    return fold_like_sql("(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')||' '||COALESCE(g.name,''))", '?', '?', '?');
}

/** Paramètres de list_person_search_sql() (dans l'ordre des « ? »). */
function list_person_search_params(string $like): array
{
    return fold_like_args($like);
}

/** Listes → Événements : type, personne, ou l'un des deux conjoints pour un événement de couple. */
function list_event_search_sql(): string
{
    return '(' . fold_like_sql('t.label', '?', '?', '?')
        . ' OR ' . fold_like_sql("(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,''))", '?', '?', '?')
        . ' OR ' . fold_like_sql("(COALESCE(f1.first_name,'')||' '||COALESCE(f1.last_name,'')||' '||COALESCE(f2.first_name,'')||' '||COALESCE(f2.last_name,''))", '?', '?', '?') . ')';
}

function list_event_search_params(string $like): array
{
    $one = fold_like_args($like);
    return array_merge($one, $one, $one);
}

/**
 * Listes → Lieux : seulement les lieux de la généalogie (cités par un événement, un recensement… : toute colonne
 * place_id), et ceux créés à la main ; pas les ~80 000 communes et villes du répertoire jamais utilisées.
 * Filtre explicite : places_scope=all montre tout le répertoire.
 */
function list_place_where_sql(PDO $pdo): string
{
    $search = '(' . fold_like_sql('pl.name', '?', '?', '?') . " OR pl.subdivision LIKE ? COLLATE NOCASE OR pl.alternate_names LIKE ? COLLATE NOCASE OR pl.country LIKE ? COLLATE NOCASE)";
    if (safe_text($_GET['places_scope'] ?? '') === 'all') return $search;
    static $used = null;
    if ($used === null) {
        $parts = [];
        foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name<>'places' AND sql NOT LIKE 'CREATE VIRTUAL%'")->fetchAll(PDO::FETCH_COLUMN) as $table) {
            foreach (array_column($pdo->query('PRAGMA table_info(' . $pdo->quote((string) $table) . ')')->fetchAll(), 'name') as $col) {
                if ($col === 'place_id' || str_ends_with((string) $col, '_place_id')) {
                    $parts[] = 'SELECT "' . str_replace('"', '""', (string) $col) . '" FROM "' . str_replace('"', '""', (string) $table) . '" WHERE "' . str_replace('"', '""', (string) $col) . '" IS NOT NULL';
                }
            }
        }
        $used = $parts ? implode(' UNION ', $parts) : 'SELECT NULL';
    }
    return "(pl.geoname_id IS NULL OR pl.id IN ({$used})) AND " . $search;
}

function list_place_search_params(string $like): array
{
    return array_merge(fold_like_args($like), [$like, $like, $like]);
}

function count_list_remaining(PDO $pdo,string $type,string $like,int $loaded,string $genderCond='',array $genderParams=[],string $scope='',int $personId=0,string $reminderMode='',string $city='',string $dateFrom='',string $dateTo='',int $sosaRootId=0,string $sosaSort='sosa_asc',bool $sosaMissing=false,bool $sosaImpossible=false,string $reminderCategory='',string $dabovilleSort='daboville_asc',string $courrierFilter=''): int
{
    $total=match($type){
        'events'=>(function()use($pdo,$like){$s=$pdo->prepare("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN families fa ON fa.id=e.family_id LEFT JOIN persons f1 ON f1.id=fa.partner1_id LEFT JOIN persons f2 ON f2.id=fa.partner2_id WHERE ".list_event_search_sql());$s->execute(list_event_search_params($like));return (int)$s->fetchColumn();})(),
        'places'=>(function()use($pdo,$like){$s=$pdo->prepare('SELECT count(*) FROM places pl WHERE '.list_place_where_sql($pdo));$s->execute(list_place_search_params($like));return (int)$s->fetchColumn();})(),
        'census'=>(function()use($pdo,$like){$s=$pdo->prepare("SELECT count(DISTINCT cr.id) FROM census_records cr LEFT JOIN places pl ON pl.id=cr.place_id LEFT JOIN census_members cm ON cm.census_id=cr.id LEFT JOIN persons p ON p.id=cm.person_id WHERE cr.year LIKE ? OR cr.address LIKE ? OR pl.name LIKE ? OR cm.display_name LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?");$s->execute([$like,$like,$like,$like,$like,$like]);return (int)$s->fetchColumn();})(),
        'labels'=>(function()use($pdo,$like){$s=$pdo->prepare('SELECT count(*) FROM labels WHERE name LIKE ? OR description LIKE ?');$s->execute([$like,$like]);return (int)$s->fetchColumn();})(),
        'changes'=>(int)$pdo->query('SELECT count(*) FROM change_log')->fetchColumn(),
        'media'=>(function()use($pdo,$like,$scope,$personId,$city,$dateFrom,$dateTo){
            if($city!==''||$dateFrom!==''||$dateTo!==''){return count(media_filtered_rows($pdo,$like,$scope,$personId,$city,$dateFrom,$dateTo));}
            if($scope==='name'){$s=$pdo->prepare('SELECT count(*) FROM media WHERE title LIKE ? OR filename LIKE ? OR document_title LIKE ?');$s->execute([$like,$like,$like]);return (int)$s->fetchColumn();}
            if($scope==='cote'){$s=$pdo->prepare('SELECT count(*) FROM media WHERE document_reference LIKE ?');$s->execute([$like]);return (int)$s->fetchColumn();}
            if($scope==='person'&&$personId>0){$s=$pdo->prepare("SELECT count(*) FROM media m WHERE EXISTS(SELECT 1 FROM media_links ml2 WHERE ml2.entity_type='person' AND ml2.entity_id=? AND ml2.media_id=m.id) OR EXISTS(SELECT 1 FROM media_links ml3 JOIN events ev2 ON ml3.entity_type='event' AND ev2.id=ml3.entity_id WHERE ml3.media_id=m.id AND ev2.person_id=?) OR EXISTS(SELECT 1 FROM media_links ml4 JOIN events ev3 ON ml4.entity_type='event' AND ev3.id=ml4.entity_id JOIN families f3 ON f3.id=ev3.family_id WHERE ml4.media_id=m.id AND (f3.partner1_id=? OR f3.partner2_id=?)) OR EXISTS(SELECT 1 FROM media_links ml5 JOIN families f4 ON ml5.entity_type='family' AND f4.id=ml5.entity_id WHERE ml5.media_id=m.id AND (f4.partner1_id=? OR f4.partner2_id=?)) OR EXISTS(SELECT 1 FROM media_links ml6 JOIN census_records cr2 ON ml6.entity_type='census' AND cr2.id=ml6.entity_id LEFT JOIN census_members cm2 ON cm2.census_id=cr2.id WHERE ml6.media_id=m.id AND cm2.person_id=?)");$s->execute([$personId,$personId,$personId,$personId,$personId,$personId,$personId]);return (int)$s->fetchColumn();}
            if($scope==='person'){$s=$pdo->prepare("SELECT count(*) FROM media m WHERE EXISTS(SELECT 1 FROM media_links ml2 JOIN persons p2 ON ml2.entity_type='person' AND p2.id=ml2.entity_id WHERE ml2.media_id=m.id AND (p2.first_name LIKE ? OR p2.last_name LIKE ?)) OR EXISTS(SELECT 1 FROM media_links ml3 JOIN events ev2 ON ml3.entity_type='event' AND ev2.id=ml3.entity_id LEFT JOIN persons p3 ON p3.id=ev2.person_id WHERE ml3.media_id=m.id AND (p3.first_name LIKE ? OR p3.last_name LIKE ?)) OR EXISTS(SELECT 1 FROM media_links ml4 JOIN events ev3 ON ml4.entity_type='event' AND ev3.id=ml4.entity_id JOIN families f3 ON f3.id=ev3.family_id JOIN persons p4 ON p4.id=f3.partner1_id OR p4.id=f3.partner2_id WHERE ml4.media_id=m.id AND (p4.first_name LIKE ? OR p4.last_name LIKE ?)) OR EXISTS(SELECT 1 FROM media_links ml5 JOIN families f4 ON ml5.entity_type='family' AND f4.id=ml5.entity_id JOIN persons p5 ON p5.id=f4.partner1_id OR p5.id=f4.partner2_id WHERE ml5.media_id=m.id AND (p5.first_name LIKE ? OR p5.last_name LIKE ?)) OR EXISTS(SELECT 1 FROM media_links ml6 JOIN census_records cr2 ON ml6.entity_type='census' AND cr2.id=ml6.entity_id LEFT JOIN census_members cm2 ON cm2.census_id=cr2.id LEFT JOIN persons p6 ON p6.id=cm2.person_id WHERE ml6.media_id=m.id AND (p6.first_name LIKE ? OR p6.last_name LIKE ? OR cm2.display_name LIKE ?))");$s->execute([$like,$like,$like,$like,$like,$like,$like,$like,$like,$like,$like]);return (int)$s->fetchColumn();}
            if($scope==='origin'){$s=$pdo->prepare("SELECT count(*) FROM media m WHERE EXISTS(SELECT 1 FROM investigation_media im JOIN investigations i ON i.id=im.investigation_id WHERE im.media_id=m.id AND i.title LIKE ?) OR EXISTS(SELECT 1 FROM media_links mlb JOIN battue_search_items bsi ON mlb.entity_type='battue_item' AND bsi.id=mlb.entity_id JOIN battues b ON b.id=bsi.battue_id WHERE mlb.media_id=m.id AND b.title LIKE ?)");$s->execute([$like,$like]);return (int)$s->fetchColumn();}
            $s=$pdo->prepare('SELECT count(*) FROM media WHERE title LIKE ? OR transcription LIKE ? OR filename LIKE ? OR document_reference LIKE ? OR document_title LIKE ? OR document_url LIKE ? OR document_pages LIKE ?');$s->execute([$like,$like,$like,$like,$like,$like,$like]);return (int)$s->fetchColumn();
        })(),
        'occupations'=>(function()use($pdo,$like){$s=$pdo->prepare("SELECT count(DISTINCT LOWER(TRIM(COALESCE(p.occupation,'')))) FROM persons p WHERE p.occupation!='' AND p.occupation LIKE ?");$s->execute([$like]);return (int)$s->fetchColumn();})(),
        'employers'=>count(employer_list_all($pdo,$like,100000)),
        'reminders'=>reminder_list_count($pdo,$like,$reminderMode,$reminderCategory),
        'research_budget'=>research_budget_count($pdo,$like),
        'courriers'=>courrier_count($pdo,$like,$courrierFilter),
        'living_contacts'=>living_contact_count($pdo,$like),
        'sosa'=>sosa_list_count($pdo,$like,$sosaRootId,$sosaSort,$sosaMissing,$sosaImpossible),
        'daboville'=>daboville_list_count($pdo,$like,$sosaRootId,$dabovilleSort),
        'signatures'=>signature_list_count($pdo,$like),
        'archives'=>departmental_archives_count($like),
        default=>(function()use($pdo,$like,$genderCond,$genderParams){$s=$pdo->prepare("SELECT count(*) FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id WHERE ".list_person_search_sql().$genderCond);$s->execute(array_merge(list_person_search_params($like),$genderParams));return (int)$s->fetchColumn();})(),
    };
    return max(0,$total-$loaded);
}

function investigation_reminder_where(string $reminderMode, string $reminderCategory=''): array
{
    $where = ["ii.reminder_mode<>'none'", "ii.reminder_due_at<>''"];
    $params = [];
    if (in_array($reminderMode, ['on', 'before', 'after'], true)) {
        $where[] = 'ii.reminder_mode=?';
        $params[] = $reminderMode;
    }
    // Les pistes d'enquête n'ont pas de catégorie de rappel : si un filtre de
    // catégorie est actif, elles sont exclues (seuls les rappels libres en ont une).
    if ($reminderCategory !== '') {
        $where[] = '1=0';
    }
    return [$where, $params];
}

function investigation_reminder_rows(PDO $pdo,string $like,int $limit,int $offset,string $reminderMode='',string $reminderCategory=''): array
{
    [$where, $params] = investigation_reminder_where($reminderMode, $reminderCategory);
    if ($like !== '%%') {
        $where[] = "(ii.title LIKE ? OR ii.notes LIKE ? OR i.title LIKE ? OR i.question LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?)";
        array_push($params, $like, $like, $like, $like, $like, $like);
    }
    $sql = "SELECT ii.id,ii.investigation_id,ii.kind,ii.title AS item_title,ii.url,ii.notes,ii.status,
            ii.reminder_mode,ii.reminder_due_at,ii.reminder_done,ii.reminder_done_at,'' AS reminder_category,
            i.title AS investigation_title,i.status AS investigation_status,i.person_id,
            trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS person_name
        FROM investigation_items ii
        JOIN investigations i ON i.id=ii.investigation_id
        LEFT JOIN persons p ON p.id=i.person_id
        WHERE ".implode(' AND ', $where)."
        ORDER BY CASE COALESCE(ii.reminder_done,0) WHEN 0 THEN 0 ELSE 1 END,
            ii.reminder_due_at COLLATE NOCASE,
            i.updated_at DESC,
            ii.id DESC
        LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    foreach (array_values($params) as $index => $value) {
        $stmt->bindValue($index + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
    $stmt->execute();
    return $stmt->fetchAll();
}

function investigation_reminder_count(PDO $pdo,string $like,string $reminderMode='',string $reminderCategory=''): int
{
    [$where, $params] = investigation_reminder_where($reminderMode, $reminderCategory);
    if ($like !== '%%') {
        $where[] = "(ii.title LIKE ? OR ii.notes LIKE ? OR i.title LIKE ? OR i.question LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?)";
        array_push($params, $like, $like, $like, $like, $like, $like);
    }
    $stmt = $pdo->prepare("SELECT count(*)
        FROM investigation_items ii
        JOIN investigations i ON i.id=ii.investigation_id
        LEFT JOIN persons p ON p.id=i.person_id
        WHERE ".implode(' AND ', $where));
    $stmt->execute($params);
    return (int)$stmt->fetchColumn();
}

function standalone_reminder_where(string $reminderMode, string $reminderCategory=''): array
{
    $where = ["sr.reminder_due_at<>''"];
    $params = [];
    if (in_array($reminderMode, ['on', 'before', 'after'], true)) {
        $where[] = 'sr.reminder_mode=?';
        $params[] = $reminderMode;
    }
    if ($reminderCategory !== '' && array_key_exists($reminderCategory, standalone_reminder_categories())) {
        $where[] = 'sr.reminder_category=?';
        $params[] = $reminderCategory;
    }
    return [$where, $params];
}

function standalone_reminder_rows(PDO $pdo,string $like,int $limit,int $offset,string $reminderMode='',string $reminderCategory=''): array
{
    [$where, $params] = standalone_reminder_where($reminderMode, $reminderCategory);
    if ($like !== '%%') {
        $where[] = "(sr.title LIKE ? OR sr.notes LIKE ?)";
        array_push($params, $like, $like);
    }
    $sql = "SELECT sr.id,sr.title AS item_title,'' AS url,sr.notes,'' AS status,
            sr.reminder_mode,sr.reminder_due_at,sr.reminder_done,sr.reminder_done_at,sr.reminder_category,
            '' AS investigation_title,0 AS investigation_id,0 AS person_id,'' AS person_name,
            'standalone' AS source_type
        FROM standalone_reminders sr
        WHERE ".implode(' AND ', $where);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return array_slice($stmt->fetchAll(), $offset, $limit);
}

function reminder_list_rows(PDO $pdo,string $like,int $limit,int $offset,string $reminderMode='',string $reminderCategory=''): array
{
    $rows = [];
    foreach (standalone_reminder_rows($pdo, $like, 100000, 0, $reminderMode, $reminderCategory) as $row) $rows[] = $row;
    foreach (investigation_reminder_rows($pdo, $like, 100000, 0, $reminderMode, $reminderCategory) as $row) {
        $row['source_type'] = 'investigation_item';
        $rows[] = $row;
    }
    usort($rows, static function ($a, $b) {
        $done = (int)($a['reminder_done'] ?? 0) <=> (int)($b['reminder_done'] ?? 0);
        if ($done !== 0) return $done;
        $date = strcmp((string)($a['reminder_due_at'] ?? ''), (string)($b['reminder_due_at'] ?? ''));
        if ($date !== 0) return $date;
        return strcmp((string)($b['id'] ?? ''), (string)($a['id'] ?? ''));
    });
    return array_slice($rows, $offset, $limit);
}

/**
 * Rappels à signaler maintenant (notifications de l'application de bureau, chiffre sur l'icône) :
 * « le » et « après le » à partir du jour dit ; « avant le » dans les 7 jours qui précèdent l'échéance.
 */
function due_reminders_data(PDO $pdo): array
{
    $today = date('Y-m-d');
    $soon = date('Y-m-d', strtotime('+7 days'));
    $due = [];
    foreach (reminder_list_rows($pdo, '%%', 100000, 0) as $row) {
        if ((int)($row['reminder_done'] ?? 0) === 1) continue;
        $at = substr((string)($row['reminder_due_at'] ?? ''), 0, 10);
        if ($at === '') continue;
        $mode = (string)($row['reminder_mode'] ?? 'on');
        if ($mode === 'none') continue;
        if (!($mode === 'before' ? $at <= $soon : $at <= $today)) continue;
        $labels = ['on' => 'À faire le', 'before' => 'Avant le', 'after' => 'Après le'];
        $due[] = [
            'key' => (($row['source_type'] ?? '') === 'standalone' ? 's' : 'i') . (int)($row['id'] ?? 0) . '-' . $at,
            'title' => (string)($row['item_title'] ?? 'Rappel'),
            'date_label' => trim(($labels[$mode] ?? 'À faire le') . ' ' . date('d/m/Y', strtotime($at))),
            'origin' => (($row['source_type'] ?? '') === 'standalone') ? 'Rappel libre' : (string)($row['investigation_title'] ?? 'Enquête'),
        ];
    }
    return ['count' => count($due), 'due' => array_slice($due, 0, 50)];
}

function reminder_list_count(PDO $pdo,string $like,string $reminderMode='',string $reminderCategory=''): int
{
    return count(reminder_list_rows($pdo, $like, 100000, 0, $reminderMode, $reminderCategory));
}

function reminder_summary(PDO $pdo,string $like,string $reminderMode='',string $reminderCategory=''): array
{
    $rows = reminder_list_rows($pdo, $like, 100000, 0, $reminderMode, $reminderCategory);
    $today = new DateTimeImmutable('today');
    $limits = ['1d'=>1,'3d'=>3,'1w'=>7,'1m'=>30];
    $summary = ['1d'=>0,'3d'=>0,'1w'=>0,'1m'=>0];
    foreach ($rows as $row) {
        if ((int)($row['reminder_done'] ?? 0) === 1) continue;
        $date = (string)($row['reminder_due_at'] ?? '');
        if ($date === '') continue;
        try { $due = new DateTimeImmutable($date); } catch (Throwable $_) { continue; }
        $diff = (int)$today->diff($due)->format('%r%a');
        if ($diff < 0) continue;
        foreach ($limits as $key => $days) {
            if ($diff <= $days) $summary[$key]++;
        }
    }
    return $summary;
}

function research_budget_rows(PDO $pdo,string $like,int $limit,int $offset): array
{
    $where = [];
    $params = [];
    if ($like !== '%%') {
        $where[] = "(title LIKE ? OR category LIKE ? OR vendor LIKE ? OR notes LIKE ?)";
        array_push($params, $like, $like, $like, $like);
    }
    $sql = "SELECT * FROM research_budget"
        . ($where ? " WHERE ".implode(' AND ', $where) : "")
        . " ORDER BY CASE WHEN expense_date<>'' THEN expense_date ELSE created_at END DESC, id DESC LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function research_budget_count(PDO $pdo,string $like): int
{
    $where = [];
    $params = [];
    if ($like !== '%%') {
        $where[] = "(title LIKE ? OR category LIKE ? OR vendor LIKE ? OR notes LIKE ?)";
        array_push($params, $like, $like, $like, $like);
    }
    $stmt = $pdo->prepare("SELECT count(*) FROM research_budget".($where ? " WHERE ".implode(' AND ', $where) : ""));
    $stmt->execute($params);
    return (int)$stmt->fetchColumn();
}

function research_budget_summary(PDO $pdo,string $like): array
{
    $where = [];
    $params = [];
    if ($like !== '%%') {
        $where[] = "(title LIKE ? OR category LIKE ? OR vendor LIKE ? OR notes LIKE ?)";
        array_push($params, $like, $like, $like, $like);
    }
    $whereSql = $where ? " WHERE ".implode(' AND ', $where) : "";
    $currentYear = date('Y');
    $stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM research_budget".$whereSql);
    $stmt->execute($params);
    $total = (float)$stmt->fetchColumn();
    $yearWhere = $where;
    $yearParams = $params;
    $yearWhere[] = "expense_date LIKE ?";
    $yearParams[] = $currentYear.'%';
    $stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM research_budget WHERE ".implode(' AND ', $yearWhere));
    $stmt->execute($yearParams);
    $currentYearTotal = (float)$stmt->fetchColumn();
    $renewalWhere = $where;
    $renewalParams = $params;
    $renewalWhere[] = "renewal_date BETWEEN date('now') AND date('now','+60 day')";
    $stmt = $pdo->prepare("SELECT count(*) FROM research_budget WHERE ".implode(' AND ', $renewalWhere));
    $stmt->execute($renewalParams);
    return ['total'=>$total,'current_year_total'=>$currentYearTotal,'upcoming_renewals'=>(int)$stmt->fetchColumn(),'currency'=>'EUR'];
}

function sosa_positions(PDO $pdo, int $rootId, int $guardLimit = 200000): array
{
    if (!$rootId) return ['positions'=>[], 'personSosas'=>[], 'collapsed'=>[]];
    $check = $pdo->prepare('SELECT id FROM persons WHERE id=?');
    $check->execute([$rootId]);
    if (!$check->fetchColumn()) return ['positions'=>[], 'personSosas'=>[], 'collapsed'=>[]];
    $positions = [];
    $personSosas = [];
    $queue = [[$rootId, 1]];
    $seen = [];
    $guard = 0;
    while ($queue && $guard < $guardLimit) {
        $guard++;
        [$pid, $sosa] = array_shift($queue);
        if ($sosa < 1 || $sosa > 1048575) continue;
        $key = $pid . ':' . $sosa;
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $positions[$sosa] = $pid;
        $personSosas[$pid] ??= [];
        $personSosas[$pid][] = $sosa;
        [$father, $mother] = sosa_parent_ids($pdo, $pid);
        if ($father) $queue[] = [$father, $sosa * 2];
        if ($mother) $queue[] = [$mother, $sosa * 2 + 1];
    }
    foreach ($personSosas as &$sosas) {
        sort($sosas, SORT_NUMERIC);
        $sosas = array_values(array_unique($sosas));
    }
    unset($sosas);
    $collapsed = [];
    foreach ($personSosas as $pid => $sosas) {
        if (count($sosas) > 1) {
            foreach (array_slice($sosas, 1) as $sosa) $collapsed[$sosa] = true;
        }
    }
    return ['positions'=>$positions, 'personSosas'=>$personSosas, 'collapsed'=>$collapsed];
}

function sosa_missing_is_impossible(int $sosa, array $collapsedPositions): bool
{
    while ($sosa > 1) {
        $sosa = intdiv($sosa, 2);
        if (isset($collapsedPositions[$sosa])) return true;
    }
    return false;
}

function sosa_list_rows(PDO $pdo,string $like,int $limit,int $offset,int $rootId,string $sort,bool $showMissing,bool $showImpossible): array
{
    $sosa = sosa_positions($pdo, $rootId);
    $positions = $sosa['positions'];
    if (!$positions) return [];
    $max = max(array_keys($positions));
    $personIds = array_values(array_unique(array_values($positions)));
    $people = [];
    if ($personIds) {
        $marks = implode(',', array_fill(0, count($personIds), '?'));
        $stmt = $pdo->prepare(person_select() . " WHERE p.id IN ($marks)");
        $stmt->execute($personIds);
        foreach ($stmt->fetchAll() as $row) $people[(int)$row['id']] = $row;
    }
    $rows = [];
    for ($n = 1; $n <= $max; $n++) {
        if (isset($positions[$n])) {
            $person = $people[(int)$positions[$n]] ?? null;
            if (!$person) continue;
            $name = trim(preg_replace('/\s+/', ' ', ($person['first_name'] ?? '') . ' ' . ($person['middle_name'] ?? '') . ' ' . ($person['last_name'] ?? '')));
            if ($like !== '%%' && stripos($name, trim($like, '%')) === false && stripos((string)($person['surname_group'] ?? ''), trim($like, '%')) === false) continue;
            $rows[] = [
                'sosa_number' => $n,
                'person_id' => (int)$person['id'],
                'person' => $name ?: 'Personne sans nom',
                'birth_date' => $person['birth_date'] ?? '',
                'birth_year' => $person['birth_year'] ?? '',
                'marr_date' => $person['marr_date'] ?? '',
                'marr_year' => $person['marr_year'] ?? '',
                'death_date' => $person['death_date'] ?? '',
                'death_year' => $person['death_year'] ?? '',
                'status' => count($sosa['personSosas'][(int)$person['id']] ?? []) > 1 ? 'implexe' : 'renseigné',
                'missing' => 0,
                'impossible' => 0,
            ];
        } elseif ($showMissing) {
            $impossible = sosa_missing_is_impossible($n, $sosa['collapsed']);
            if ($impossible && !$showImpossible) continue;
            $rows[] = [
                'sosa_number' => $n,
                'person_id' => 0,
                'person' => 'SOSA manquant',
                'birth_date' => '',
                'birth_year' => '',
                'marr_date' => '',
                'marr_year' => '',
                'death_date' => '',
                'death_year' => '',
                'status' => $impossible ? 'impossible' : 'manquant',
                'missing' => 1,
                'impossible' => $impossible ? 1 : 0,
            ];
        }
    }
    $yearValue = static fn($row, $key) => (int)($row[$key] ?: 999999);
    usort($rows, static function ($a, $b) use ($sort, $yearValue) {
        return match ($sort) {
            'sosa_desc' => (int)$b['sosa_number'] <=> (int)$a['sosa_number'],
            'birth_asc' => $yearValue($a, 'birth_year') <=> $yearValue($b, 'birth_year') ?: (int)$a['sosa_number'] <=> (int)$b['sosa_number'],
            'birth_desc' => $yearValue($b, 'birth_year') <=> $yearValue($a, 'birth_year') ?: (int)$a['sosa_number'] <=> (int)$b['sosa_number'],
            'marriage_asc' => $yearValue($a, 'marr_year') <=> $yearValue($b, 'marr_year') ?: (int)$a['sosa_number'] <=> (int)$b['sosa_number'],
            'marriage_desc' => $yearValue($b, 'marr_year') <=> $yearValue($a, 'marr_year') ?: (int)$a['sosa_number'] <=> (int)$b['sosa_number'],
            'death_asc' => $yearValue($a, 'death_year') <=> $yearValue($b, 'death_year') ?: (int)$a['sosa_number'] <=> (int)$b['sosa_number'],
            'death_desc' => $yearValue($b, 'death_year') <=> $yearValue($a, 'death_year') ?: (int)$a['sosa_number'] <=> (int)$b['sosa_number'],
            default => (int)$a['sosa_number'] <=> (int)$b['sosa_number'],
        };
    });
    return array_slice($rows, $offset, $limit);
}

function sosa_list_count(PDO $pdo,string $like,int $rootId,string $sort,bool $showMissing,bool $showImpossible): int
{
    return count(sosa_list_rows($pdo, $like, 100000, 0, $rootId, $sort, $showMissing, $showImpossible));
}

function signature_list_where(string $like): array
{
    $where = ["COALESCE(mt.tag_type,'person')='signature'"];
    $params = [];
    if ($like !== '%%') {
        $where[] = "(p.first_name LIKE ? OR p.middle_name LIKE ? OR p.last_name LIKE ? OR m.title LIKE ? OR m.filename LIKE ? OR m.document_reference LIKE ? OR m.document_title LIKE ? OR mt.note LIKE ?)";
        array_push($params, $like, $like, $like, $like, $like, $like, $like, $like);
    }
    return [$where, $params];
}

function signature_list_rows(PDO $pdo,string $like,int $limit,int $offset): array
{
    [$where, $params] = signature_list_where($like);
    $stmt = $pdo->prepare("SELECT mt.id,mt.media_id,mt.person_id,COALESCE(mt.tag_type,'person') AS tag_type,mt.x,mt.y,mt.w,mt.h,mt.confidence,mt.note,mt.created_at,
            m.title,m.filename,m.thumbnail,m.media_type,m.date_text,m.document_reference,m.document_title,m.transcription,
            trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS person_name,
            p.first_name,p.middle_name,p.last_name
        FROM media_tags mt
        JOIN media m ON m.id=mt.media_id
        JOIN persons p ON p.id=mt.person_id
        WHERE ".implode(' AND ', $where)."
        ORDER BY p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE,COALESCE(m.date_text,''),mt.id
        LIMIT {$limit} OFFSET {$offset}");
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function signature_list_count(PDO $pdo,string $like): int
{
    [$where, $params] = signature_list_where($like);
    $stmt = $pdo->prepare("SELECT count(*)
        FROM media_tags mt
        JOIN media m ON m.id=mt.media_id
        JOIN persons p ON p.id=mt.person_id
        WHERE ".implode(' AND ', $where));
    $stmt->execute($params);
    return (int)$stmt->fetchColumn();
}

function labels_attach_linked(PDO $pdo, array $labels): array
{
    if ($labels) {
        $ids = array_map(fn($l) => (int)$l['id'], $labels);
        $marks = implode(',', array_fill(0, count($ids), '?'));
        // Persons linked
        $persons = $pdo->prepare("SELECT ll.label_id,p.id,p.first_name,p.last_name,
            (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_date,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
            (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_date,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year,
            p.gender, p.living_status
            FROM label_links ll JOIN persons p ON p.id=ll.entity_id
            WHERE ll.entity_type='person' AND ll.label_id IN ($marks)
            ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE");
        $persons->execute($ids);
        // Events linked
        $events = $pdo->prepare("SELECT ll.label_id,e.id,e.date_text,e.year,t.label AS type_label,t.gedcom_tag,t.icon,t.color,
            p.id AS person_id, p.first_name, p.last_name,
            pl.name AS place_name, pl.country
            FROM label_links ll JOIN events e ON e.id=ll.entity_id
            JOIN event_types t ON t.id=e.event_type_id
            LEFT JOIN persons p ON p.id=e.person_id
            LEFT JOIN places pl ON pl.id=e.place_id
            WHERE ll.entity_type='event' AND ll.label_id IN ($marks)
            ORDER BY COALESCE(e.year,9999),e.id");
        $events->execute($ids);
        // Notes linked — notes uses entity_type/entity_id, not person_id
        $notes = $pdo->prepare("SELECT ll.label_id,n.id,n.title,n.body,n.entity_id,n.entity_type,
            CASE WHEN n.entity_type='person' THEN trim(p.first_name||' '||p.last_name) ELSE '' END AS person_name,
            CASE WHEN n.entity_type='person' THEN n.entity_id ELSE NULL END AS person_id
            FROM label_links ll JOIN notes n ON n.id=ll.entity_id
            LEFT JOIN persons p ON n.entity_type='person' AND p.id=n.entity_id
            WHERE ll.entity_type='note' AND ll.label_id IN ($marks)
            ORDER BY n.id");
        $notes->execute($ids);
        // Sources linked — sources has no direct person link; join via source_links
        $sources = $pdo->prepare("SELECT ll.label_id,s.id,s.title,s.agency,s.url,
            p.id AS person_id, trim(p.first_name||' '||p.last_name) AS person_name
            FROM label_links ll JOIN sources s ON s.id=ll.entity_id
            LEFT JOIN source_links sl ON sl.source_record_id=s.id AND sl.entity_type='person'
            LEFT JOIN persons p ON p.id=sl.entity_id
            WHERE ll.entity_type='source' AND ll.label_id IN ($marks)
            GROUP BY ll.label_id, s.id
            ORDER BY s.id");
        $sources->execute($ids);
        // Census linked
        $census = $pdo->prepare("SELECT ll.label_id,cr.id,cr.year,cr.status,cr.address,pl.name AS place_name
            FROM label_links ll JOIN census_records cr ON cr.id=ll.entity_id
            LEFT JOIN places pl ON pl.id=cr.place_id
            WHERE ll.entity_type='census' AND ll.label_id IN ($marks)
            ORDER BY cr.year");
        $census->execute($ids);
        $views = $pdo->prepare("SELECT ll.label_id,sv.id,sv.module,sv.name
            FROM label_links ll JOIN saved_views sv ON sv.id=ll.entity_id
            WHERE ll.entity_type='view' AND ll.label_id IN ($marks)
            ORDER BY sv.module,sv.sort_order,sv.id");
        $views->execute($ids);
        $byLabel = array_fill_keys($ids, ['persons'=>[],'events'=>[],'notes'=>[],'sources'=>[],'census'=>[],'views'=>[]]);
        foreach ($persons->fetchAll() as $row) { $lid=(int)$row['label_id']; unset($row['label_id']); $byLabel[$lid]['persons'][]=$row; }
        foreach ($events->fetchAll() as $row) { $lid=(int)$row['label_id']; unset($row['label_id']); $byLabel[$lid]['events'][]=$row; }
        foreach ($notes->fetchAll() as $row) { $lid=(int)$row['label_id']; unset($row['label_id']); $byLabel[$lid]['notes'][]=$row; }
        foreach ($sources->fetchAll() as $row) { $lid=(int)$row['label_id']; unset($row['label_id']); $byLabel[$lid]['sources'][]=$row; }
        foreach ($census->fetchAll() as $row) { $lid=(int)$row['label_id']; unset($row['label_id']); $byLabel[$lid]['census'][]=$row; }
        foreach ($views->fetchAll() as $row) { $lid=(int)$row['label_id']; unset($row['label_id']); $byLabel[$lid]['views'][]=$row; }
        foreach ($labels as &$label) $label['linked'] = $byLabel[(int)$label['id']] ?? ['persons'=>[],'events'=>[],'notes'=>[],'sources'=>[],'census'=>[],'views'=>[]];
        unset($label);
    }
    return $labels;
}

function labels_data(PDO $pdo): never
{
    $labels = labels_attach_linked($pdo, labels_list_rows($pdo,'%',1000,0));
    json_response(['labels'=>$labels]);
}

function labels_list_rows(PDO $pdo,string $like,int $limit=500,int $offset=0): array
{
    $stmt=$pdo->prepare("SELECT l.id,l.name,l.color,l.description,l.created_at,l.updated_at,count(ll.id) AS link_count,group_concat(DISTINCT ll.entity_type) AS entity_types
        FROM labels l
        LEFT JOIN label_links ll ON ll.label_id=l.id
        WHERE l.name LIKE ? OR l.description LIKE ?
        GROUP BY l.id
        ORDER BY l.name COLLATE NOCASE,l.id
        LIMIT {$limit} OFFSET {$offset}");
    $stmt->execute([$like,$like]);
    return $stmt->fetchAll();
}

function occupation_list_rows(PDO $pdo,string $like,int $limit=500,int $offset=0): array
{
    // Métiers agrégés depuis 3 sources :
    //   1. persons.occupation (fiche individuelle)
    //   2. events liés à un type gedcom_tag=OCCU ou type_label contenant "profession"
    //   3. census_members.occupation (colonne "Profession" des recensements)
    $stmt=$pdo->prepare("
        SELECT LOWER(TRIM(val)) AS id, TRIM(val) AS name, COUNT(DISTINCT person_id) AS person_count
        FROM (
            SELECT p.id AS person_id, p.occupation AS val
            FROM persons p
            WHERE p.occupation IS NOT NULL AND TRIM(p.occupation)!=''
            UNION ALL
            SELECT e.person_id, COALESCE(NULLIF(TRIM(e.title),''), NULLIF(TRIM(e.description),'')) AS val
            FROM events e
            JOIN event_types t ON t.id=e.event_type_id
            WHERE e.person_id IS NOT NULL
              AND (t.gedcom_tag='OCCU' OR LOWER(t.label) LIKE '%profes%' OR LOWER(t.label) LIKE '%m%tier%' OR LOWER(t.label) LIKE '%activit%')
              AND COALESCE(NULLIF(TRIM(e.title),''), NULLIF(TRIM(e.description),'')) IS NOT NULL
            UNION ALL
            SELECT cm.person_id, cm.occupation AS val
            FROM census_members cm
            WHERE cm.person_id IS NOT NULL AND cm.occupation IS NOT NULL AND TRIM(cm.occupation)!=''
        ) src
        WHERE TRIM(val) LIKE ? AND TRIM(val)!=''
        GROUP BY LOWER(TRIM(val))
        ORDER BY LOWER(TRIM(val)) COLLATE NOCASE
        LIMIT {$limit} OFFSET {$offset}");
    $stmt->execute([$like]);
    return $stmt->fetchAll();
}

function employer_list_rows(PDO $pdo,string $like,int $limit=500,int $offset=0): array
{
    // Employeurs issus de census_members.employer (recensements)
    $stmt=$pdo->prepare("
        SELECT LOWER(TRIM(employer)) AS id,
               TRIM(employer) AS name,
               COUNT(*) AS person_count
        FROM census_members
        WHERE employer IS NOT NULL AND TRIM(employer)!=''
          AND TRIM(employer) LIKE ?
        GROUP BY LOWER(TRIM(employer))
        ORDER BY LOWER(TRIM(employer)) COLLATE NOCASE
        LIMIT {$limit} OFFSET {$offset}");
    $stmt->execute([$like]);
    return $stmt->fetchAll();
}

function occupation_attach_people(PDO $pdo,array $rows,string $field): array
{
    if(!$rows) return $rows;
    $names=array_map(fn($r)=>$r['name'],$rows);
    $marks=implode(',',array_fill(0,count($names),'?'));
    if($field==='occupation'){
        // Chercher les personnes via les 3 sources, dédupliquées par person_id
        $stmt=$pdo->prepare("
            SELECT LOWER(TRIM(val)) AS group_key, p.id, p.first_name, p.last_name, p.gender, p.living_status,
                (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_date,
                (SELECT e.year    FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
                (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_date,
                (SELECT e.year    FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year
            FROM (
                SELECT p2.id AS pid, p2.occupation AS val FROM persons p2
                WHERE p2.occupation IS NOT NULL AND TRIM(p2.occupation)!='' AND TRIM(p2.occupation) IN ($marks)
                UNION
                SELECT e.person_id AS pid, COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),''),t.label) AS val
                FROM events e JOIN event_types t ON t.id=e.event_type_id
                WHERE e.person_id IS NOT NULL
                  AND (t.gedcom_tag='OCCU' OR LOWER(t.label) LIKE '%profes%' OR LOWER(t.label) LIKE '%m%tier%' OR LOWER(t.label) LIKE '%activit%')
                  AND COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),''),NULLIF(t.label,'')) IN ($marks)
                UNION
                SELECT cm.person_id AS pid, cm.occupation AS val
                FROM census_members cm
                WHERE cm.person_id IS NOT NULL AND cm.occupation IS NOT NULL AND TRIM(cm.occupation)!='' AND TRIM(cm.occupation) IN ($marks)
            ) src
            JOIN persons p ON p.id=src.pid
            ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE");
        $stmt->execute(array_merge($names,$names,$names));
    } else {
        $stmt=$pdo->prepare("SELECT LOWER(TRIM(cm.employer)) AS group_key,
            COALESCE(p.id,0) AS id,
            COALESCE(p.first_name,cm.display_name) AS first_name,
            COALESCE(p.last_name,'') AS last_name,
            COALESCE(p.gender,'unknown') AS gender,
            COALESCE(p.living_status,'unknown') AS living_status,
            NULL AS birth_date, NULL AS birth_year, NULL AS death_date, NULL AS death_year,
            cm.age_text, cr.year AS census_year
            FROM census_members cm
            LEFT JOIN persons p ON p.id=cm.person_id
            JOIN census_records cr ON cr.id=cm.census_id
            WHERE TRIM(cm.employer) IN ($marks)
            ORDER BY p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE");
        $stmt->execute($names);
    }
    $byGroup=[];
    $allPersonIds=[];
    $rows_by_group=[];
    foreach($stmt->fetchAll() as $row){
        $key=$row['group_key'];
        unset($row['group_key']);
        $byGroup[$key][$row['id']]=$row; // deduplicate by person id
        if($row['id'])$allPersonIds[]=(int)$row['id'];
    }
    // Fetch labels for all persons
    $labelsByPerson=[];
    if($allPersonIds){
        $allPersonIds=array_values(array_unique($allPersonIds));
        $lmarks=implode(',',array_fill(0,count($allPersonIds),'?'));
        $lstmt=$pdo->prepare("SELECT ll.entity_id AS person_id,l.id,l.name,l.color
            FROM label_links ll JOIN labels l ON l.id=ll.label_id
            WHERE ll.entity_type='person' AND ll.entity_id IN ($lmarks)
            ORDER BY l.name COLLATE NOCASE");
        $lstmt->execute($allPersonIds);
        foreach($lstmt->fetchAll() as $lr){
            $labelsByPerson[(int)$lr['person_id']][]=['id'=>(int)$lr['id'],'name'=>$lr['name'],'color'=>$lr['color']];
        }
    }
    foreach($rows as &$row){
        $key=strtolower(trim($row['name']));
        $people=array_values($byGroup[$key]??[]);
        foreach($people as &$p){
            $p['labels']=$labelsByPerson[(int)($p['id']??0)]??[];
        }
        unset($p);
        $row['people']=$people;
    }
    unset($row);
    return $rows;
}

function census_list_rows(PDO $pdo,string $like,int $limit=500,int $offset=0): array
{
    $stmt=$pdo->prepare("SELECT cr.id,cr.year,cr.status,cr.address,cr.notes,pl.name AS place,pl.subdivision,pl.country,count(DISTINCT cm.id) AS member_count,count(DISTINCT ml.id) AS media_count,
        group_concat(DISTINCT trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,''))) AS people
        FROM census_records cr
        LEFT JOIN places pl ON pl.id=cr.place_id
        LEFT JOIN census_members cm ON cm.census_id=cr.id
        LEFT JOIN persons p ON p.id=cm.person_id
        LEFT JOIN media_links ml ON ml.entity_type='census' AND ml.entity_id=cr.id
        WHERE cr.year LIKE ? OR cr.address LIKE ? OR pl.name LIKE ? OR cr.id IN (SELECT m2.census_id FROM census_members m2 LEFT JOIN persons p2 ON p2.id=m2.person_id WHERE m2.display_name LIKE ? OR p2.first_name LIKE ? OR p2.last_name LIKE ?)
        GROUP BY cr.id
        ORDER BY cr.year,pl.name,cr.address
        LIMIT {$limit} OFFSET {$offset}");
    $stmt->execute([$like,$like,$like,$like,$like,$like]);
    return $stmt->fetchAll();
}

function media_where_clause(string $scope, string $like, int $personId): array
{
    // $scope restreint la recherche à un seul type de critère (boutons "Personne / Enquête-battue / Nom / Côte").
    // Vide ou valeur inconnue = recherche large sur tous les champs (comportement d'origine).
    if ($scope==='name') {
        $where = '(m.title LIKE ? OR m.filename LIKE ? OR m.document_title LIKE ?)';
        $params = [$like,$like,$like];
    } elseif ($scope==='cote') {
        $where = '(m.document_reference LIKE ?)';
        $params = [$like];
    } elseif ($scope==='person' && $personId>0) {
        // Sélection précise d'une personne (via suggestion d'autocomplétion) : on filtre par id,
        // ce qui évite les faux positifs entre homonymes contrairement au filtre texte ci-dessous.
        $where = "(
            EXISTS(SELECT 1 FROM media_links ml2 WHERE ml2.entity_type='person' AND ml2.entity_id=? AND ml2.media_id=m.id)
            OR EXISTS(SELECT 1 FROM media_links ml3 JOIN events ev2 ON ml3.entity_type='event' AND ev2.id=ml3.entity_id WHERE ml3.media_id=m.id AND ev2.person_id=?)
            OR EXISTS(SELECT 1 FROM media_links ml4 JOIN events ev3 ON ml4.entity_type='event' AND ev3.id=ml4.entity_id JOIN families f3 ON f3.id=ev3.family_id WHERE ml4.media_id=m.id AND (f3.partner1_id=? OR f3.partner2_id=?))
            OR EXISTS(SELECT 1 FROM media_links ml5 JOIN families f4 ON ml5.entity_type='family' AND f4.id=ml5.entity_id WHERE ml5.media_id=m.id AND (f4.partner1_id=? OR f4.partner2_id=?))
            OR EXISTS(SELECT 1 FROM media_links ml6 JOIN census_records cr2 ON ml6.entity_type='census' AND cr2.id=ml6.entity_id LEFT JOIN census_members cm2 ON cm2.census_id=cr2.id WHERE ml6.media_id=m.id AND cm2.person_id=?)
        )";
        $params = [$personId,$personId,$personId,$personId,$personId,$personId,$personId];
    } elseif ($scope==='person') {
        $where = "(
            EXISTS(SELECT 1 FROM media_links ml2 JOIN persons p2 ON ml2.entity_type='person' AND p2.id=ml2.entity_id WHERE ml2.media_id=m.id AND (p2.first_name LIKE ? OR p2.last_name LIKE ?))
            OR EXISTS(SELECT 1 FROM media_links ml3 JOIN events ev2 ON ml3.entity_type='event' AND ev2.id=ml3.entity_id LEFT JOIN persons p3 ON p3.id=ev2.person_id WHERE ml3.media_id=m.id AND (p3.first_name LIKE ? OR p3.last_name LIKE ?))
            OR EXISTS(SELECT 1 FROM media_links ml4 JOIN events ev3 ON ml4.entity_type='event' AND ev3.id=ml4.entity_id JOIN families f3 ON f3.id=ev3.family_id JOIN persons p4 ON p4.id=f3.partner1_id OR p4.id=f3.partner2_id WHERE ml4.media_id=m.id AND (p4.first_name LIKE ? OR p4.last_name LIKE ?))
            OR EXISTS(SELECT 1 FROM media_links ml5 JOIN families f4 ON ml5.entity_type='family' AND f4.id=ml5.entity_id JOIN persons p5 ON p5.id=f4.partner1_id OR p5.id=f4.partner2_id WHERE ml5.media_id=m.id AND (p5.first_name LIKE ? OR p5.last_name LIKE ?))
            OR EXISTS(SELECT 1 FROM media_links ml6 JOIN census_records cr2 ON ml6.entity_type='census' AND cr2.id=ml6.entity_id LEFT JOIN census_members cm2 ON cm2.census_id=cr2.id LEFT JOIN persons p6 ON p6.id=cm2.person_id WHERE ml6.media_id=m.id AND (p6.first_name LIKE ? OR p6.last_name LIKE ? OR cm2.display_name LIKE ?))
        )";
        $params = [$like,$like, $like,$like, $like,$like, $like,$like, $like,$like,$like];
    } elseif ($scope==='origin') {
        $where = "(
            EXISTS(SELECT 1 FROM investigation_media im JOIN investigations i ON i.id=im.investigation_id WHERE im.media_id=m.id AND i.title LIKE ?)
            OR EXISTS(SELECT 1 FROM media_links mlb JOIN battue_search_items bsi ON mlb.entity_type='battue_item' AND bsi.id=mlb.entity_id JOIN battues b ON b.id=bsi.battue_id WHERE mlb.media_id=m.id AND b.title LIKE ?)
        )";
        $params = [$like,$like];
    } else {
        $where = "(m.title LIKE ? OR m.transcription LIKE ? OR m.filename LIKE ? OR m.document_reference LIKE ? OR m.document_title LIKE ? OR m.document_url LIKE ? OR m.document_pages LIKE ?
            OR EXISTS(SELECT 1 FROM media_links ml2 JOIN persons p2 ON ml2.entity_type='person' AND p2.id=ml2.entity_id WHERE ml2.media_id=m.id AND (p2.first_name LIKE ? OR p2.last_name LIKE ?))
            OR EXISTS(SELECT 1 FROM media_links ml3 JOIN events ev2 ON ml3.entity_type='event' AND ev2.id=ml3.entity_id LEFT JOIN event_types et2 ON et2.id=ev2.event_type_id LEFT JOIN persons p3 ON p3.id=ev2.person_id WHERE ml3.media_id=m.id AND (et2.label LIKE ? OR p3.first_name LIKE ? OR p3.last_name LIKE ?))
            OR EXISTS(SELECT 1 FROM media_links ml4 JOIN events ev3 ON ml4.entity_type='event' AND ev3.id=ml4.entity_id JOIN families f3 ON f3.id=ev3.family_id JOIN persons p4 ON p4.id=f3.partner1_id OR p4.id=f3.partner2_id WHERE ml4.media_id=m.id AND (p4.first_name LIKE ? OR p4.last_name LIKE ?))
            OR EXISTS(SELECT 1 FROM media_links ml5 JOIN families f4 ON ml5.entity_type='family' AND f4.id=ml5.entity_id JOIN persons p5 ON p5.id=f4.partner1_id OR p5.id=f4.partner2_id WHERE ml5.media_id=m.id AND (p5.first_name LIKE ? OR p5.last_name LIKE ?))
            OR EXISTS(SELECT 1 FROM media_links ml6 JOIN census_records cr2 ON ml6.entity_type='census' AND cr2.id=ml6.entity_id LEFT JOIN census_members cm2 ON cm2.census_id=cr2.id LEFT JOIN persons p6 ON p6.id=cm2.person_id WHERE ml6.media_id=m.id AND (cr2.address LIKE ? OR p6.first_name LIKE ? OR p6.last_name LIKE ? OR cm2.display_name LIKE ?))
        )";
        $params = [$like,$like,$like,$like,$like,$like,$like,$like,$like,$like,$like,$like,$like,$like,$like,$like,$like,$like,$like,$like];
    }
    return [$where, $params];
}

// Déduit une borne min/max de date ISO (AAAA-MM-JJ) à partir d'une date libre de média
// (ex: "31/10/1781", "vers 1784", "7 mai 1925"). Sert uniquement à la recherche par plage
// de dates dans la liste des médias ; n'affecte pas l'affichage ni le stockage d'origine.
function media_parse_date_bounds(?string $text): array
{
    $text = trim((string)$text);
    if ($text === '') return [null, null];
    if (preg_match('/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/', $text, $m)) {
        $d = str_pad($m[1], 2, '0', STR_PAD_LEFT);
        $mo = str_pad($m[2], 2, '0', STR_PAD_LEFT);
        if ((int)$mo>=1 && (int)$mo<=12 && (int)$d>=1 && (int)$d<=31) {
            $iso = $m[3].'-'.$mo.'-'.$d;
            return [$iso, $iso];
        }
    }
    if (preg_match('/(\d{4})-(\d{2})-(\d{2})/', $text, $m)) {
        $iso = $m[1].'-'.$m[2].'-'.$m[3];
        return [$iso, $iso];
    }
    $months = ['janvier'=>'01','février'=>'02','fevrier'=>'02','mars'=>'03','avril'=>'04','mai'=>'05','juin'=>'06','juillet'=>'07','août'=>'08','aout'=>'08','septembre'=>'09','octobre'=>'10','novembre'=>'11','décembre'=>'12','decembre'=>'12'];
    if (preg_match('/(\d{1,2})(?:er)?\s+([a-zéûôàè]+)\s+(\d{4})/iu', $text, $m)) {
        $mon = $months[strtolower($m[2])] ?? ($months[function_exists('mb_strtolower') ? mb_strtolower($m[2]) : strtolower($m[2])] ?? null);
        if ($mon) {
            $d = str_pad($m[1], 2, '0', STR_PAD_LEFT);
            $iso = $m[3].'-'.$mon.'-'.$d;
            return [$iso, $iso];
        }
    }
    $year = mft_extract_year($text);
    if ($year) return [$year.'-01-01', $year.'-12-31'];
    return [null, null];
}

function media_chronology_sort_key(array $row): int
{
    $text = strtolower(trim(implode(' ', array_filter([
        $row['attachment_label'] ?? '',
        $row['date_text'] ?? '',
        $row['document_title'] ?? '',
        $row['document_reference'] ?? '',
        $row['title'] ?? '',
        $row['filename'] ?? '',
    ], static fn($v) => trim((string)$v) !== ''))));
    if (preg_match('/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/', $text, $m)) {
        return ((int)$m[3] * 10000) + ((int)$m[2] * 100) + (int)$m[1];
    }
    if (preg_match('/(\d{4})-(\d{2})-(\d{2})/', $text, $m)) {
        return ((int)$m[1] * 10000) + ((int)$m[2] * 100) + (int)$m[3];
    }
    $months = ['janvier'=>1,'février'=>2,'fevrier'=>2,'mars'=>3,'avril'=>4,'mai'=>5,'juin'=>6,'juillet'=>7,'août'=>8,'aout'=>8,'septembre'=>9,'octobre'=>10,'novembre'=>11,'décembre'=>12,'decembre'=>12];
    if (preg_match('/(\d{1,2})(?:er)?\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/iu', $text, $m)) {
        $monthKey = function_exists('mb_strtolower') ? mb_strtolower($m[2]) : strtolower($m[2]);
        return ((int)$m[3] * 10000) + (($months[$monthKey] ?? 99) * 100) + (int)$m[1];
    }
    if (preg_match('/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/', $text, $m)) {
        return ((int)$m[1] * 10000) + 9999;
    }
    return 99999999;
}

// Retourne toutes les lignes de médias correspondant à la recherche texte + scope, avec la
// ville rattachée (place_name) calculée, puis applique en PHP les filtres ville / date (le champ
// date des médias est du texte libre, donc non filtrable fiablement en SQL). Utilisée à la fois
// pour paginer la liste et pour calculer le nombre de résultats restants.
function media_filtered_rows(PDO $pdo, string $like, string $scope, int $personId, string $city, string $dateFrom, string $dateTo): array
{
    [$where, $params] = media_where_clause($scope, $like, $personId);
    $stmt = $pdo->prepare("SELECT m.id,m.title,m.description,m.media_type,m.filename,m.thumbnail,m.transcription,m.date_text,m.date_calendar,m.document_reference,m.document_title,m.document_url,m.document_pages,m.postcard_group,m.postcard_side,m.is_person_photo,m.media_subject_type,m.correspondence_type,m.correspondent_name,m.correspondent_json,m.correspondence_reply_to_media_id,m.created_at,
        count(ml.id) AS link_count,
        group_concat(DISTINCT CASE
            WHEN ml.entity_type='person' THEN 'Fiche individuelle'
            WHEN ml.entity_type='event' THEN trim(COALESCE(et.label,'Événement') || CASE WHEN ev.date_text<>'' THEN ' — '||ev.date_text ELSE '' END)
            WHEN ml.entity_type='census' THEN trim('Recensement ' || cr.year || CASE WHEN cr.address<>'' THEN ' — '||cr.address ELSE '' END)
            WHEN ml.entity_type='family' THEN 'Famille'
            WHEN ml.entity_type='source' THEN 'Source'
            WHEN ml.entity_type='battue_item' THEN 'Annotation de battue'
            ELSE 'Non rattaché'
        END) AS attachment_label,
        group_concat(DISTINCT NULLIF(trim(COALESCE(pev.name,pcr.name,'') || CASE WHEN COALESCE(pev.subdivision,pcr.subdivision,'')<>'' THEN ', '||COALESCE(pev.subdivision,pcr.subdivision) ELSE '' END),'')) AS place_name
        FROM media m
        LEFT JOIN media_links ml ON ml.media_id=m.id
        LEFT JOIN events ev ON ml.entity_type='event' AND ev.id=ml.entity_id
        LEFT JOIN event_types et ON et.id=ev.event_type_id
        LEFT JOIN places pev ON pev.id=ev.place_id
        LEFT JOIN census_records cr ON ml.entity_type='census' AND cr.id=ml.entity_id
        LEFT JOIN places pcr ON pcr.id=cr.place_id
        WHERE {$where}
        GROUP BY m.id
        ORDER BY COALESCE(attachment_label,m.title,m.filename),m.id");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    if ($city==='' && $dateFrom==='' && $dateTo==='') return $rows;
    return array_values(array_filter($rows, function ($row) use ($city, $dateFrom, $dateTo) {
        if ($city !== '') {
            $place = (string)($row['place_name'] ?? '');
            if ($place === '' || stripos($place, $city) === false) return false;
        }
        if ($dateFrom !== '' || $dateTo !== '') {
            [$minIso, $maxIso] = media_parse_date_bounds($row['date_text'] ?? '');
            if ($minIso === null) return false;
            if ($dateFrom !== '' && $maxIso !== null && $maxIso < $dateFrom) return false;
            if ($dateTo !== '' && $minIso !== null && $minIso > $dateTo) return false;
        }
        return true;
    }));
}

function media_list_rows(PDO $pdo, string $like, int $limit=500, int $offset=0, string $scope='', int $personId=0, string $city='', string $dateFrom='', string $dateTo=''): array
{
    $rows = media_filtered_rows($pdo, $like, $scope, $personId, $city, $dateFrom, $dateTo);
    usort($rows, static function (array $a, array $b): int {
        $cmp = media_chronology_sort_key($a) <=> media_chronology_sort_key($b);
        if ($cmp !== 0) return $cmp;
        return ((int)($a['id'] ?? 0)) <=> ((int)($b['id'] ?? 0));
    });
    $rows = array_slice($rows, $offset, $limit);
    if (!$rows) return [];

    $ids = array_map(static fn($row) => (int) $row['id'], $rows);
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $peopleSql = "SELECT DISTINCT media_id, person_id, name FROM (
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN persons p ON ml.entity_type='person' AND p.id=ml.entity_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN persons p ON p.id=e.person_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN families f ON f.id=e.family_id JOIN persons p ON p.id=f.partner1_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN families f ON f.id=e.family_id JOIN persons p ON p.id=f.partner2_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id JOIN persons p ON p.id=f.partner1_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id JOIN persons p ON p.id=f.partner2_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN census_members cm ON ml.entity_type='census' AND cm.census_id=ml.entity_id JOIN persons p ON p.id=cm.person_id
        WHERE ml.media_id IN ($marks)
    ) WHERE person_id IS NOT NULL ORDER BY name";
    $people = $pdo->prepare($peopleSql);
    $people->execute(array_merge($ids,$ids,$ids,$ids,$ids,$ids,$ids));
    $peopleByMedia = [];
    foreach ($people->fetchAll() as $person) {
        $peopleByMedia[(int) $person['media_id']][] = ['id'=>(int)$person['person_id'], 'name'=>$person['name'] ?: 'Personne sans nom'];
    }
    $originsByMedia = [];
    $originSql = "SELECT im.media_id,
            'Enquête : ' || COALESCE(NULLIF(i.title,''),'#'||i.id) AS origin_label,
            p.id AS person_id,
            trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS person_name
        FROM investigation_media im
        JOIN investigations i ON i.id=im.investigation_id
        LEFT JOIN persons p ON p.id=i.person_id
        WHERE im.media_id IN ($marks)
        UNION ALL
        SELECT ml.media_id,
            'Battue : ' || COALESCE(NULLIF(b.title,''),'#'||b.id) || ' · ' || COALESCE(NULLIF(bsi.title,''),NULLIF(bsi.period,''),'annotation') AS origin_label,
            bp.person_id,
            trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS person_name
        FROM media_links ml
        JOIN battue_search_items bsi ON ml.entity_type='battue_item' AND bsi.id=ml.entity_id
        JOIN battues b ON b.id=bsi.battue_id
        LEFT JOIN battue_persons bp ON bp.battue_id=b.id
        LEFT JOIN persons p ON p.id=bp.person_id
        WHERE ml.media_id IN ($marks)
        ORDER BY origin_label";
    $origins = $pdo->prepare($originSql);
    $origins->execute(array_merge($ids,$ids));
    foreach ($origins->fetchAll() as $origin) {
        $mediaId=(int)$origin['media_id'];
        $originsByMedia[$mediaId][]=(string)$origin['origin_label'];
        if(!empty($origin['person_id'])){
            $peopleByMedia[$mediaId][]=['id'=>(int)$origin['person_id'],'name'=>$origin['person_name'] ?: 'Personne sans nom'];
        }
    }
    foreach ($rows as &$row) {
        $mediaId=(int)$row['id'];
        $labels=array_filter(array_merge(explode(',',(string)($row['attachment_label']??'')),$originsByMedia[$mediaId]??[]));
        $row['attachment_label'] = $labels ? implode(' · ',array_values(array_unique($labels))) : 'Non rattaché';
        $people=[];
        foreach(($peopleByMedia[$mediaId]??[]) as $person)$people[(int)$person['id']]=$person;
        $row['people_links'] = array_values($people);
    }
    unset($row);
    return $rows;
}

function graph_distribution_data(PDO $pdo): never
{
    $nameMode=safe_text($_GET['name_mode']??'last_name');$useGroup=$nameMode==='group';
    if($useGroup){
        $rows=$pdo->query("SELECT COALESCE(NULLIF(trim(g.name),''),p.last_name) AS surname,e.year,count(*) AS value FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id JOIN events e ON e.person_id=p.id JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='BIRT' WHERE trim(COALESCE(p.last_name,''))<>'' AND e.year IS NOT NULL GROUP BY COALESCE(NULLIF(trim(g.name),''),p.last_name) COLLATE NOCASE,e.year ORDER BY COALESCE(NULLIF(trim(g.name),''),p.last_name) COLLATE NOCASE,e.year")->fetchAll();
    }else{
        $rows=$pdo->query("SELECT p.last_name AS surname,e.year,count(*) AS value FROM persons p JOIN events e ON e.person_id=p.id JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='BIRT' WHERE trim(COALESCE(p.last_name,''))<>'' AND e.year IS NOT NULL GROUP BY p.last_name COLLATE NOCASE,e.year ORDER BY p.last_name COLLATE NOCASE,e.year")->fetchAll();
    }
    $totals=[];foreach($rows as $row)$totals[$row['surname']]=($totals[$row['surname']]??0)+(int)$row['value'];arsort($totals);$selected=array_flip(array_slice(array_keys($totals),0,24));$series=[];$minYear=9999;$maxYear=0;foreach($rows as $row){if(!isset($selected[$row['surname']]))continue;$year=(int)$row['year'];$decade=(int)(floor($year/10)*10);$series[$row['surname']][$decade]=($series[$row['surname']][$decade]??0)+(int)$row['value'];$minYear=min($minYear,$decade);$maxYear=max($maxYear,$decade);}
    json_response(['series'=>$series,'minYear'=>$minYear===9999?0:$minYear,'maxYear'=>$maxYear,'count'=>array_sum(array_intersect_key($totals,$selected)),'name_mode'=>$nameMode]);
}

function place_monograph_data(PDO $pdo): never
{
    $placeId = safe_int($_GET['place_id'] ?? 0);
    $placeName = safe_text($_GET['place_name'] ?? '');
    $yearFrom = safe_int($_GET['year_from'] ?? 0);
    $yearTo = safe_int($_GET['year_to'] ?? 0);
    $eventTypeId = safe_int($_GET['event_type_id'] ?? 0);
    $showEvents = safe_int($_GET['show_events'] ?? 1) !== 0;
    $showDigests = safe_int($_GET['show_digests'] ?? 1) !== 0;
    $showBattues = safe_int($_GET['show_battues'] ?? 1) !== 0;
    $showCemetery = safe_int($_GET['show_cemetery'] ?? 1) !== 0;

    $eventTypes = $pdo->query('SELECT id,label FROM event_types ORDER BY label COLLATE NOCASE')->fetchAll();
    $place = null;
    if ($placeId) {
        $stmt = $pdo->prepare('SELECT id,name,subdivision,county,state,country,latitude,longitude FROM places WHERE id=?');
        $stmt->execute([$placeId]);
        $place = $stmt->fetch() ?: null;
    }
    if (!$place && $placeName !== '') {
        $stmt = $pdo->prepare('SELECT id,name,subdivision,county,state,country,latitude,longitude FROM places WHERE name=? COLLATE NOCASE ORDER BY population DESC,id LIMIT 1');
        $stmt->execute([$placeName]);
        $place = $stmt->fetch() ?: null;
    }
    if (!$place && $placeName !== '') {
        // Une commune peut venir du référentiel des contours sans encore avoir
        // de ligne dédiée dans places. Elle reste tout de même exploitable
        // pour les battues, les sépultures et les futurs rattachements.
        $place = [
            'id'=>0,
            'name'=>$placeName,
            'subdivision'=>'',
            'county'=>safe_text($_GET['county'] ?? ''),
            'state'=>safe_text($_GET['state'] ?? ''),
            'country'=>safe_text($_GET['country'] ?? 'France'),
            'latitude'=>null,
            'longitude'=>null,
        ];
    }
    if (!$place) {
        json_response(['ready'=>false,'place'=>null,'event_types'=>$eventTypes,'counts'=>[],'events'=>[],'census'=>[],'digests'=>[],'battues'=>[],'graves'=>[]]);
    }

    $placeId = (int)$place['id'];
    $placeName = (string)$place['name'];
    $placeEventCondition = $placeId ? 'e.place_id=?' : "e.place_id IN (SELECT id FROM places WHERE name=? COLLATE NOCASE)";
    $placeCensusCondition = $placeId ? 'c.place_id=?' : "c.place_id IN (SELECT id FROM places WHERE name=? COLLATE NOCASE)";
    $eventWhere = [$placeEventCondition,
        "(e.person_id IS NOT NULL OR e.family_id IS NOT NULL OR COALESCE(e.source_id,0)>0
          OR EXISTS (SELECT 1 FROM media_links ml WHERE ml.entity_type='event' AND ml.entity_id=e.id)
          OR EXISTS (SELECT 1 FROM label_links ll WHERE ll.entity_type='event' AND ll.entity_id=e.id))"
    ];
    $eventParams = [$placeId ?: $placeName];
    if ($yearFrom) { $eventWhere[] = 'e.year>=?'; $eventParams[] = $yearFrom; }
    if ($yearTo) { $eventWhere[] = 'e.year<=?'; $eventParams[] = $yearTo; }
    if ($eventTypeId) { $eventWhere[] = 'e.event_type_id=?'; $eventParams[] = $eventTypeId; }
    // Événement de couple (mariage…) : les deux conjoints, chacun avec son bouton « Ouvrir »
    $eventSql = "SELECT e.id,e.person_id,e.date_text,e.year,e.title,e.description,t.label AS type_label,
        trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS person_name,
        f.partner1_id, trim(COALESCE(p1.first_name,'')||' '||COALESCE(p1.last_name,'')) AS partner1_name,
        f.partner2_id, trim(COALESCE(p2.first_name,'')||' '||COALESCE(p2.last_name,'')) AS partner2_name
        FROM events e JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN persons p ON p.id=e.person_id
        LEFT JOIN families f ON f.id=e.family_id LEFT JOIN persons p1 ON p1.id=f.partner1_id LEFT JOIN persons p2 ON p2.id=f.partner2_id
        WHERE ".implode(' AND ', $eventWhere)."
        ORDER BY CASE WHEN e.year IS NULL THEN 1 ELSE 0 END,e.year,e.id LIMIT 100";
    $eventStmt = $pdo->prepare($eventSql);
    $eventStmt->execute($eventParams);
    $events = $showEvents ? $eventStmt->fetchAll() : [];

    $censusWhere = [$placeCensusCondition];
    $censusParams = [$placeId ?: $placeName];
    if ($yearFrom) { $censusWhere[] = 'c.year>=?'; $censusParams[] = $yearFrom; }
    if ($yearTo) { $censusWhere[] = 'c.year<=?'; $censusParams[] = $yearTo; }
    $censusStmt = $pdo->prepare("SELECT c.id,c.year,c.status,c.address,count(cm.id) AS member_count
        FROM census_records c LEFT JOIN census_members cm ON cm.census_id=c.id
        WHERE ".implode(' AND ', $censusWhere)."
        GROUP BY c.id ORDER BY c.year,c.id LIMIT 100");
    $censusStmt->execute($censusParams);
    $census = $showEvents ? $censusStmt->fetchAll() : [];

    $digestWhere = ['(a.place_id=? OR a.city_name=? COLLATE NOCASE OR a.city_alias=? COLLATE NOCASE)'];
    $digestParams = [$placeId,$placeName,$placeName];
    $digestStmt = $pdo->prepare("SELECT a.id,a.year_text,a.record_type,a.status,a.archive_reference,a.archive_service,a.archive_url
        FROM archive_digest_entries a WHERE ".implode(' AND ', $digestWhere)." ORDER BY a.updated_at DESC,a.id DESC LIMIT 100");
    $digestStmt->execute($digestParams);
    $digests = $showDigests ? $digestStmt->fetchAll() : [];
    foreach ($digests as &$digest) {
        $digest['record_label'] = archive_digest_record_types()[$digest['record_type']] ?? ucfirst((string)$digest['record_type']);
        $digest['status_label'] = archive_digest_statuses()[$digest['status']] ?? (string)$digest['status'];
    }
    unset($digest);

    $battueStmt = $pdo->prepare("SELECT b.id,b.title,b.target_text,b.status FROM battues b
        JOIN commune_contours c ON c.insee_code=b.start_insee_code
        WHERE c.name=? COLLATE NOCASE ORDER BY b.updated_at DESC,b.id DESC");
    $battueStmt->execute([$placeName]);
    $battues = $showBattues ? $battueStmt->fetchAll() : [];
    foreach ($battues as &$battue) $battue['status_label'] = ['open'=>'En cours','paused'=>'En pause','closed'=>'Terminée'][$battue['status']] ?? (string)$battue['status'];
    unset($battue);

    $graveStmt = $pdo->prepare("SELECT g.id,g.cemetery_name,g.address,
        group_concat(trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')), ', ') AS person_names
        FROM graves g LEFT JOIN grave_persons gp ON gp.grave_id=g.id LEFT JOIN persons p ON p.id=gp.person_id
        WHERE g.city=? COLLATE NOCASE GROUP BY g.id ORDER BY g.cemetery_name,g.id LIMIT 100");
    $graveStmt->execute([$placeName]);
    $graves = $showCemetery ? $graveStmt->fetchAll() : [];

    $eventCountStmt = $pdo->prepare('SELECT count(*),count(DISTINCT e.person_id) FROM events e WHERE '.implode(' AND ', $eventWhere));
    $eventCountStmt->execute($eventParams);
    [$eventCount,$peopleCount] = array_map('intval', (array)$eventCountStmt->fetch(PDO::FETCH_NUM));
    $censusCountStmt = $pdo->prepare('SELECT count(*) FROM census_records c WHERE '.implode(' AND ', $censusWhere));
    $censusCountStmt->execute($censusParams);

    json_response([
        'ready'=>true,
        'place'=>$place,
        'event_types'=>$eventTypes,
        'counts'=>[
            'events'=>$showEvents ? $eventCount : 0,
            'people'=>$showEvents ? $peopleCount : 0,
            'census'=>$showEvents ? (int)$censusCountStmt->fetchColumn() : 0,
            'digests'=>$showDigests ? count($digests) : 0,
            'battues'=>$showBattues ? count($battues) : 0,
            'graves'=>$showCemetery ? count($graves) : 0,
        ],
        'events'=>$events,'census'=>$census,'digests'=>$digests,'battues'=>$battues,'graves'=>$graves,
    ]);
}

function graph_network_data(PDO $pdo, string $kind, int $personId): never
{
    if (!$personId) json_response(['kind'=>$kind,'nodes'=>[],'edges'=>[],'households'=>[]]);
    $allowed = ['social','occupations','migrations','household'];
    if (!in_array($kind, $allowed, true)) $kind = 'social';
    $root = summary_person($pdo, $personId);
    if (!$root) throw new RuntimeException('Personne introuvable');

    $name = static fn(array $p): string => trim((string)($p['first_name'] ?? '').' '.(string)($p['last_name'] ?? '')) ?: 'Personne sans nom';
    $nodes = [[
        'id'=>'p'.$personId,
        'person_id'=>$personId,
        'label'=>$name($root),
        'subtitle'=>'Personne de départ',
        'kind'=>'root',
    ]];
    $edges = [];

    if ($kind === 'social') {
        $nodeMap = ['p'.$personId => true];
        $addPerson = static function(array $row, string $subtitle) use (&$nodes, &$nodeMap, $name): string {
            $id = 'p'.(int)$row['id'];
            if (!isset($nodeMap[$id])) {
                $nodes[] = ['id'=>$id,'person_id'=>(int)$row['id'],'label'=>$name($row),'subtitle'=>$subtitle,'kind'=>'person'];
                $nodeMap[$id] = true;
            }
            return $id;
        };
        $links = [];
        $stmt = $pdo->prepare("SELECT DISTINCT p.id,p.first_name,p.last_name,ew.note,t.label AS event_label
            FROM events e JOIN event_types t ON t.id=e.event_type_id
            JOIN event_witnesses ew ON ew.event_id=e.id JOIN persons p ON p.id=ew.person_id
            WHERE e.person_id=? ORDER BY p.last_name,p.first_name LIMIT 80");
        $stmt->execute([$personId]);
        foreach ($stmt->fetchAll() as $row) {
            $target = $addPerson($row, 'Témoin / parrain / marraine');
            $role = trim((string)$row['note']);
            $role = $role !== '' ? $role : 'Témoin de '.$row['event_label'];
            $key = 'p'.$personId.'|'.$target.'|'.$role;
            $links[$key] = ($links[$key] ?? 0) + 1;
        }
        $stmt = $pdo->prepare("SELECT DISTINCT p.id,p.first_name,p.last_name,ew.note,t.label AS event_label,
                COALESCE(owner.id,0) AS owner_id,owner.first_name AS owner_first_name,owner.last_name AS owner_last_name
            FROM event_witnesses ew JOIN events e ON e.id=ew.event_id JOIN event_types t ON t.id=e.event_type_id
            LEFT JOIN persons owner ON owner.id=e.person_id JOIN persons p ON p.id=ew.person_id
            WHERE ew.person_id=? ORDER BY owner.last_name,owner.first_name LIMIT 80");
        $stmt->execute([$personId]);
        foreach ($stmt->fetchAll() as $row) {
            if (!(int)$row['owner_id'] || (int)$row['owner_id'] === $personId) continue;
            $target = $addPerson(['id'=>$row['owner_id'],'first_name'=>$row['owner_first_name'],'last_name'=>$row['owner_last_name']], 'Personne pour laquelle il ou elle témoigne');
            $role = trim((string)$row['note']);
            $role = $role !== '' ? $role : 'Témoin de '.$row['event_label'];
            $key = 'p'.$personId.'|'.$target.'|'.$role;
            $links[$key] = ($links[$key] ?? 0) + 1;
        }
        $stmt = $pdo->prepare("SELECT DISTINCT p.id,p.first_name,p.last_name,cm.household_position,cr.year,cr.address
            FROM census_members mine JOIN census_records cr ON cr.id=mine.census_id
            JOIN census_members cm ON cm.census_id=cr.id AND cm.person_id IS NOT NULL AND cm.person_id<>mine.person_id
            JOIN persons p ON p.id=cm.person_id WHERE mine.person_id=? ORDER BY cr.year DESC,p.last_name,p.first_name LIMIT 100");
        $stmt->execute([$personId]);
        foreach ($stmt->fetchAll() as $row) {
            $target = $addPerson($row, 'Membre de maisonnée / voisin recensé');
            $role = trim((string)$row['household_position']);
            $role = 'Recensement '.($row['year'] ?: '').($role !== '' ? ' · '.$role : '');
            $key = 'p'.$personId.'|'.$target.'|'.$role;
            $links[$key] = ($links[$key] ?? 0) + 1;
        }
        foreach ($links as $key => $count) {
            [$source,$target,$label] = explode('|', $key, 3);
            $edges[] = ['source'=>$source,'target'=>$target,'label'=>$label,'count'=>$count];
        }
    } elseif ($kind === 'occupations') {
        $sql = "SELECT parent.id AS parent_id,parent.first_name AS parent_first_name,parent.last_name AS parent_last_name,
                child.id AS child_id,child.first_name AS child_first_name,child.last_name AS child_last_name,
                COALESCE(NULLIF(trim(parent.occupation),''),(SELECT NULLIF(trim(cm.occupation),'') FROM census_members cm WHERE cm.person_id=parent.id AND trim(cm.occupation)<>'' ORDER BY cm.id DESC LIMIT 1)) AS parent_job,
                COALESCE(NULLIF(trim(child.occupation),''),(SELECT NULLIF(trim(cm.occupation),'') FROM census_members cm WHERE cm.person_id=child.id AND trim(cm.occupation)<>'' ORDER BY cm.id DESC LIMIT 1)) AS child_job
            FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN persons child ON child.id=fc.child_id
            JOIN persons parent ON parent.id=f.partner1_id OR parent.id=f.partner2_id
            WHERE (parent.id=? OR child.id=? OR parent.id IN (SELECT child_id FROM family_children WHERE family_id IN (SELECT family_id FROM family_children WHERE child_id=?)))
            LIMIT 160";
        $stmt=$pdo->prepare($sql);$stmt->execute([$personId,$personId,$personId]);
        $seen=['p'.$personId=>true];
        foreach($stmt->fetchAll() as $row){
            if(trim((string)$row['parent_job'])==='' || trim((string)$row['child_job'])==='') continue;
            $parent=['id'=>$row['parent_id'],'first_name'=>$row['parent_first_name'],'last_name'=>$row['parent_last_name']];
            $child=['id'=>$row['child_id'],'first_name'=>$row['child_first_name'],'last_name'=>$row['child_last_name']];
            foreach([['p'.(int)$parent['id'],$parent,(string)$row['parent_job']],['p'.(int)$child['id'],$child,(string)$row['child_job']]] as [$id,$person,$job]){
                if(!isset($seen[$id])){$nodes[]=['id'=>$id,'person_id'=>(int)$person['id'],'label'=>$name($person),'subtitle'=>$job,'kind'=>'person'];$seen[$id]=true;}
            }
            $edges[]=['source'=>'p'.(int)$parent['id'],'target'=>'p'.(int)$child['id'],'label'=>trim((string)$row['parent_job']).' → '.trim((string)$row['child_job']),'count'=>1];
        }
    } elseif ($kind === 'migrations') {
        // Cette vue relie des lieux entre eux : la personne de départ ne doit
        // pas apparaître comme un noeud isolé au centre du réseau.
        $nodes = [];
        $ids = related_ids($pdo, $personId, 2, 3, true);
        if (!$ids) $ids = [$personId];
        $marks = implode(',', array_fill(0,count($ids),'?'));
        $stmt=$pdo->prepare("SELECT e.person_id,e.year,pl.id AS place_id,pl.name,pl.county,pl.state,pl.country
            FROM events e JOIN places pl ON pl.id=e.place_id
            WHERE e.person_id IN ($marks) AND e.year IS NOT NULL AND trim(COALESCE(pl.name,''))<>''
            ORDER BY e.person_id,e.year,e.id");
        $stmt->execute($ids);
        $last=[];$placeNodes=[];$flow=[];
        foreach($stmt->fetchAll() as $row){
            $pid=(int)$row['person_id'];$id='l'.(int)$row['place_id'];
            if(!isset($placeNodes[$id])){$placeNodes[$id]=true;$nodes[]=['id'=>$id,'label'=>$row['name'],'subtitle'=>implode(' · ',array_filter([$row['county'],$row['state'],$row['country']])),'kind'=>'place'];}
            if(isset($last[$pid]) && $last[$pid]!==$id){$key=$last[$pid].'|'.$id;$flow[$key]=($flow[$key]??0)+1;}
            $last[$pid]=$id;
        }
        foreach($flow as $key=>$count){[$source,$target]=explode('|',$key,2);$edges[]=['source'=>$source,'target'=>$target,'label'=>'Déplacement relevé','count'=>$count];}
    } else {
        $stmt=$pdo->prepare("SELECT cr.id,cr.year,cr.address,pl.name AS place_name,cm.id AS member_id,cm.person_id,cm.display_name,cm.first_name,cm.household_position,cm.occupation,p.last_name
            FROM census_members mine JOIN census_records cr ON cr.id=mine.census_id
            LEFT JOIN places pl ON pl.id=cr.place_id JOIN census_members cm ON cm.census_id=cr.id
            LEFT JOIN persons p ON p.id=cm.person_id WHERE mine.person_id=? ORDER BY cr.year DESC,cm.is_primary DESC,cm.id");
        $stmt->execute([$personId]);$groups=[];
        foreach($stmt->fetchAll() as $row){$key=(int)$row['id'];$groups[$key]??=['id'=>$key,'year'=>$row['year'],'address'=>$row['address'],'place'=>$row['place_name'],'members'=>[]];$groups[$key]['members'][]=['id'=>(int)$row['member_id'],'person_id'=>(int)$row['person_id'],'name'=>trim(($row['first_name']??'').' '.(($row['last_name']??'') ?: ($row['display_name']??''))),'role'=>$row['household_position'],'occupation'=>$row['occupation']];}
        json_response(['kind'=>$kind,'root'=>$root,'nodes'=>$nodes,'edges'=>$edges,'households'=>array_values($groups)]);
    }
    json_response(['kind'=>$kind,'root'=>$root,'nodes'=>$nodes,'edges'=>$edges,'households'=>[]]);
}

function graph_stats_data(PDO $pdo): never
{
    $type = safe_text($_GET['type'] ?? 'surnames');
    $sosaRootId = safe_int($_GET['sosa_root_id'] ?? 0);
    $lineageIds = [];
    if ($sosaRootId > 0) {
        $sosaData = sosa_positions($pdo, $sosaRootId, 120000);
        $lineageIds = array_values(array_unique(array_values($sosaData['positions'] ?? [])));
    }
    $lineageCond = '';
    $lineageParams = [];
    if ($lineageIds) {
        $lineageCond = ' AND p.id IN (' . implode(',', array_fill(0, count($lineageIds), '?')) . ')';
        $lineageParams = $lineageIds;
    }

    // Filtre optionnel par plage d'années (ex: 1801 à 1845), saisi via les deux
    // champs affichés au-dessus des statistiques. Les deux bornes sont
    // facultatives et indépendantes (on peut ne fournir que l'une des deux).
    $yearFrom = isset($_GET['year_from']) && $_GET['year_from'] !== '' ? (int) $_GET['year_from'] : null;
    $yearTo   = isset($_GET['year_to'])   && $_GET['year_to']   !== '' ? (int) $_GET['year_to']   : null;
    if ($yearFrom !== null && $yearTo !== null && $yearFrom > $yearTo) {
        [$yearFrom, $yearTo] = [$yearTo, $yearFrom];
    }
    $hasYearFilter = $yearFrom !== null || $yearTo !== null;

    // Filtre optionnel par sexe (menu déroulant affiché à côté de "Limite").
    // Valeurs acceptées : male, female, unknown (regroupe tout ce qui n'est
    // ni male ni female). Vide/absent = pas de filtre (tous).
    $gender = safe_text($_GET['gender'] ?? '');
    if (!in_array($gender, ['male', 'female', 'unknown'], true)) $gender = '';
    $hasGenderFilter = $gender !== '';
    $genderCond = '';
    $genderParams = [];
    if ($hasGenderFilter) {
        if ($gender === 'unknown') {
            $genderCond = " AND p.gender NOT IN ('male','female')";
        } else {
            $genderCond = " AND p.gender=?";
            $genderParams[] = $gender;
        }
    }

    // Condition réutilisable : la personne a une naissance (BIRT) dont l'année
    // tombe dans la plage demandée. Utilisée pour filtrer les statistiques
    // basées sur les personnes (noms, prénoms, lieux, sexe...).
    $birthYearParams = [];
    $birthYearCond = "EXISTS(SELECT 1 FROM events bfe JOIN event_types bft ON bft.id=bfe.event_type_id WHERE bft.gedcom_tag='BIRT' AND bfe.person_id=p.id AND bfe.year IS NOT NULL";
    if ($yearFrom !== null) { $birthYearCond .= " AND bfe.year>=?"; $birthYearParams[] = $yearFrom; }
    if ($yearTo !== null)   { $birthYearCond .= " AND bfe.year<=?"; $birthYearParams[] = $yearTo; }
    $birthYearCond .= ")";
    // Dates précises (AAAA-MM-JJ, Éditeur de statistiques) : elles remplacent les années pour la naissance et les événements
    $iso = static fn($v) => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $v) ? (string) $v : '';
    $dateFrom = $iso($_GET['date_from'] ?? ''); $dateTo = $iso($_GET['date_to'] ?? '');
    $preciseEventIds = null;
    if ($dateFrom !== '' || $dateTo !== '') {
        $birthIds = implode(',', my_list_events_between($pdo, $dateFrom, $dateTo, ['BIRT', 'CHR', 'BAPM']) ?: [0]);
        $birthYearCond = "EXISTS(SELECT 1 FROM events bfe WHERE bfe.person_id=p.id AND bfe.id IN ($birthIds))";
        $birthYearParams = [];
        $hasYearFilter = true;
        $preciseEventIds = implode(',', my_list_events_between($pdo, $dateFrom, $dateTo) ?: [0]);
    }

    // Condition combinée année + sexe pour les statistiques basées sur "persons p"
    // (utilisée en clause WHERE). $personFilterParams suit le même ordre que les
    // marqueurs "?" générés ci-dessous (année puis sexe).
    $hasPersonFilter = $hasYearFilter || $hasGenderFilter;
    $personFilterCond = ($hasYearFilter ? $birthYearCond : '1=1') . $genderCond;
    $personFilterParams = array_merge($hasYearFilter ? $birthYearParams : [], $genderParams);

    $yearCond = '';
    $yearCondParams = [];
    if ($preciseEventIds !== null) { $yearCond .= " AND e.id IN ($preciseEventIds)"; }
    else {
        if ($yearFrom !== null) { $yearCond .= " AND e.year>=?"; $yearCondParams[] = $yearFrom; }
        if ($yearTo !== null)   { $yearCond .= " AND e.year<=?"; $yearCondParams[] = $yearTo; }
    }
    $yearCond .= $genderCond;
    $yearCondParams = array_merge($yearCondParams, $genderParams);

    $definitions = [
        'surnames' => ['Distribution des noms','Usage des noms de famille dans la base.','bar',
            "SELECT COALESCE(NULLIF(p.last_name,''),'Sans nom') AS label,count(*) AS value FROM persons p"
            .($hasPersonFilter ? " WHERE $personFilterCond" : '')
            ." GROUP BY label ORDER BY value DESC,label LIMIT 24",
            $hasPersonFilter ? $personFilterParams : []],
        'firstnames' => ['Distribution des prénoms','Prénoms les plus fréquents dans la base.','bar',
            "SELECT COALESCE(NULLIF(substr(p.first_name,1,instr(p.first_name||' ',' ')-1),''),'Sans prénom') AS label,count(*) AS value FROM persons p"
            .($hasPersonFilter ? " WHERE $personFilterCond" : '')
            ." GROUP BY label ORDER BY value DESC,label LIMIT 24",
            $hasPersonFilter ? $personFilterParams : []],
        'birth_places' => ['Lieux de naissance','Répartition de toutes les personnes : lieu connu, événement sans lieu ou naissance non renseignée.','bar',"WITH ranked AS (SELECT e.person_id,e.place_id,row_number() OVER(PARTITION BY e.person_id ORDER BY e.id) AS rn FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='BIRT') SELECT CASE WHEN r.person_id IS NULL THEN 'Aucune naissance renseignée' WHEN pl.id IS NULL OR trim(COALESCE(pl.name,''))='' THEN 'Naissance sans lieu' ELSE pl.name END AS label,count(*) AS value FROM persons p LEFT JOIN ranked r ON r.person_id=p.id AND r.rn=1 LEFT JOIN places pl ON pl.id=r.place_id"
            .($hasPersonFilter ? " WHERE $personFilterCond" : '')
            ." GROUP BY CASE WHEN r.person_id IS NULL THEN 'Aucune naissance renseignée' WHEN pl.id IS NULL OR trim(COALESCE(pl.name,''))='' THEN 'Naissance sans lieu' ELSE pl.name END ORDER BY value DESC,label",
            $hasPersonFilter ? $personFilterParams : []],
        'death_places' => ['Lieux de décès','Répartition de toutes les personnes : lieu connu, événement sans lieu ou décès non renseigné.','bar',"WITH ranked AS (SELECT e.person_id,e.place_id,row_number() OVER(PARTITION BY e.person_id ORDER BY e.id) AS rn FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='DEAT') SELECT CASE WHEN r.person_id IS NULL THEN 'Aucun décès renseigné' WHEN pl.id IS NULL OR trim(COALESCE(pl.name,''))='' THEN 'Décès sans lieu' ELSE pl.name END AS label,count(*) AS value FROM persons p LEFT JOIN ranked r ON r.person_id=p.id AND r.rn=1 LEFT JOIN places pl ON pl.id=r.place_id"
            .($hasPersonFilter ? " WHERE $personFilterCond" : '')
            ." GROUP BY CASE WHEN r.person_id IS NULL THEN 'Aucun décès renseigné' WHEN pl.id IS NULL OR trim(COALESCE(pl.name,''))='' THEN 'Décès sans lieu' ELSE pl.name END ORDER BY value DESC,label",
            $hasPersonFilter ? $personFilterParams : []],
        'birth_countries' => ['Pays de naissance','Répartition de toutes les personnes selon le pays de naissance renseigné.','bar',"WITH ranked AS (SELECT e.person_id,e.place_id,row_number() OVER(PARTITION BY e.person_id ORDER BY e.id) AS rn FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='BIRT') SELECT CASE WHEN r.person_id IS NULL THEN 'Aucune naissance renseignée' WHEN pl.id IS NULL OR trim(COALESCE(pl.country,''))='' THEN 'Pays non renseigné' ELSE pl.country END AS label,count(*) AS value FROM persons p LEFT JOIN ranked r ON r.person_id=p.id AND r.rn=1 LEFT JOIN places pl ON pl.id=r.place_id"
            .($hasPersonFilter ? " WHERE $personFilterCond" : '')
            ." GROUP BY CASE WHEN r.person_id IS NULL THEN 'Aucune naissance renseignée' WHEN pl.id IS NULL OR trim(COALESCE(pl.country,''))='' THEN 'Pays non renseigné' ELSE pl.country END ORDER BY value DESC,label",
            $hasPersonFilter ? $personFilterParams : []],
        'death_countries' => ['Pays de décès','Répartition de toutes les personnes selon le pays de décès renseigné.','bar',"WITH ranked AS (SELECT e.person_id,e.place_id,row_number() OVER(PARTITION BY e.person_id ORDER BY e.id) AS rn FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='DEAT') SELECT CASE WHEN r.person_id IS NULL THEN 'Aucun décès renseigné' WHEN pl.id IS NULL OR trim(COALESCE(pl.country,''))='' THEN 'Pays non renseigné' ELSE pl.country END AS label,count(*) AS value FROM persons p LEFT JOIN ranked r ON r.person_id=p.id AND r.rn=1 LEFT JOIN places pl ON pl.id=r.place_id"
            .($hasPersonFilter ? " WHERE $personFilterCond" : '')
            ." GROUP BY CASE WHEN r.person_id IS NULL THEN 'Aucun décès renseigné' WHEN pl.id IS NULL OR trim(COALESCE(pl.country,''))='' THEN 'Pays non renseigné' ELSE pl.country END ORDER BY value DESC,label",
            $hasPersonFilter ? $personFilterParams : []],
        'sex_distribution' => ['Répartition des sexes','Répartition des personnes par sexe indiqué.','bar',
            "SELECT CASE p.gender WHEN 'male' THEN 'Masculin' WHEN 'female' THEN 'Féminin' WHEN 'nonbinary' THEN 'Autre / non binaire' ELSE 'Non renseigné' END AS label,count(*) AS value FROM persons p"
            .($hasYearFilter ? " WHERE $birthYearCond" : '')
            ." GROUP BY p.gender ORDER BY value DESC",
            $hasYearFilter ? $birthYearParams : []],
        'birth_years' => ['Années de naissance','Nombre de naissances par décennie.','histogram',
            "SELECT CAST((e.year/10)*10 AS TEXT)||'–'||CAST((e.year/10)*10+9 AS TEXT) AS label,count(*) AS value FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id WHERE t.gedcom_tag='BIRT' AND e.year IS NOT NULL$yearCond GROUP BY (e.year/10) ORDER BY (e.year/10)",
            $yearCondParams],
        'death_years' => ['Années de décès','Nombre de décès par décennie.','histogram',
            "SELECT CAST((e.year/10)*10 AS TEXT)||'–'||CAST((e.year/10)*10+9 AS TEXT) AS label,count(*) AS value FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id WHERE t.gedcom_tag='DEAT' AND e.year IS NOT NULL$yearCond GROUP BY (e.year/10) ORDER BY (e.year/10)",
            $yearCondParams],
        'age_at_death' => ['Âge lors du décès','Âges au décès calculés à partir des années naissance/décès.','histogram',
            "WITH lifespans AS (SELECT p.id,p.gender,min(CASE WHEN t.gedcom_tag='BIRT' THEN e.year END) birth_year,min(CASE WHEN t.gedcom_tag='DEAT' THEN e.year END) death_year FROM persons p LEFT JOIN events e ON e.person_id=p.id LEFT JOIN event_types t ON t.id=e.event_type_id GROUP BY p.id), buckets AS (SELECT ((death_year-birth_year)/5)*5 AS bucket,count(*) AS value FROM lifespans WHERE birth_year IS NOT NULL AND death_year IS NOT NULL AND death_year>=birth_year"
            .($yearFrom !== null ? " AND birth_year>=?" : '')
            .($yearTo !== null ? " AND birth_year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY bucket) SELECT CAST(bucket AS TEXT)||'–'||CAST(bucket+4 AS TEXT) AS label,value FROM buckets ORDER BY bucket",
            array_merge($hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'genealogy_age_pyramid' => ['Pyramide des âges de la généalogie complète','Répartition globale des âges au décès par tranches de 10 ans.','age_pyramid',
            "WITH lifespans AS (
                SELECT p.id,p.gender,min(CASE WHEN t.gedcom_tag='BIRT' THEN e.year END) birth_year,min(CASE WHEN t.gedcom_tag='DEAT' THEN e.year END) death_year
                FROM persons p LEFT JOIN events e ON e.person_id=p.id LEFT JOIN event_types t ON t.id=e.event_type_id
                GROUP BY p.id
            )
            SELECT 'Généalogie complète' AS generation,
                   CAST(CAST((death_year-birth_year)/10 AS INTEGER)*10 AS TEXT)||'–'||CAST(CAST((death_year-birth_year)/10 AS INTEGER)*10+9 AS TEXT) AS label,
                   count(*) AS value
            FROM lifespans
            WHERE birth_year IS NOT NULL AND death_year IS NOT NULL AND death_year>=birth_year"
            .($yearFrom !== null ? " AND birth_year>=?" : '')
            .($yearTo !== null ? " AND birth_year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY label ORDER BY CAST(label AS INTEGER)",
            array_merge($hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'death_age_by_generation' => ['Pyramide des âges au décès par génération','Âges au décès groupés par tranches de 10 ans et générations de naissance de 25 ans.','age_pyramid',
            "WITH lifespans AS (
                SELECT p.id,p.gender,min(CASE WHEN t.gedcom_tag='BIRT' THEN e.year END) birth_year,min(CASE WHEN t.gedcom_tag='DEAT' THEN e.year END) death_year
                FROM persons p LEFT JOIN events e ON e.person_id=p.id LEFT JOIN event_types t ON t.id=e.event_type_id
                GROUP BY p.id
            )
            SELECT CAST(CAST(birth_year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(birth_year/25 AS INTEGER)*25+24 AS TEXT) AS generation,
                   CAST(CAST((death_year-birth_year)/10 AS INTEGER)*10 AS TEXT)||'–'||CAST(CAST((death_year-birth_year)/10 AS INTEGER)*10+9 AS TEXT) AS label,
                   count(*) AS value
            FROM lifespans
            WHERE birth_year IS NOT NULL AND death_year IS NOT NULL AND death_year>=birth_year"
            .($yearFrom !== null ? " AND birth_year>=?" : '')
            .($yearTo !== null ? " AND birth_year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY generation,label ORDER BY CAST(substr(generation,1,4) AS INTEGER),CAST(label AS INTEGER)",
            array_merge($hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'life_expectancy_century_branch' => ['Espérance de vie moyenne par siècle/branche','Moyenne d’âge au décès calculée par siècle de décès et branche patronymique.','metric_grid',
            "WITH lifespans AS (
                SELECT p.id,p.gender,COALESCE(NULLIF(trim(g.name),''),NULLIF(trim(p.last_name),''),'Sans branche') AS branch,
                       min(CASE WHEN t.gedcom_tag='BIRT' THEN e.year END) birth_year,
                       min(CASE WHEN t.gedcom_tag='DEAT' THEN e.year END) death_year
                FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id
                LEFT JOIN events e ON e.person_id=p.id LEFT JOIN event_types t ON t.id=e.event_type_id
                GROUP BY p.id
            )
            SELECT CAST(((death_year-1)/100)+1 AS INTEGER)||'e siècle' AS generation,
                   branch AS label,
                   ROUND(AVG(death_year-birth_year),1) AS value,
                   count(*) AS count
            FROM lifespans
            WHERE birth_year IS NOT NULL AND death_year IS NOT NULL AND death_year>=birth_year"
            .($yearFrom !== null ? " AND birth_year>=?" : '')
            .($yearTo !== null ? " AND birth_year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY generation,branch HAVING count(*)>=1 ORDER BY CAST(death_year/100 AS INTEGER),value DESC,label LIMIT 120",
            array_merge($hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'life_expectancy_generation_century' => ['Espérance de vie moyenne par génération/siècle','Moyenne d’âge au décès par génération de naissance, détaillée par siècle de décès.','metric_grid',
            "WITH lifespans AS (
                SELECT p.id,p.gender,
                       min(CASE WHEN t.gedcom_tag='BIRT' THEN e.year END) birth_year,
                       min(CASE WHEN t.gedcom_tag='DEAT' THEN e.year END) death_year
                FROM persons p LEFT JOIN events e ON e.person_id=p.id LEFT JOIN event_types t ON t.id=e.event_type_id
                GROUP BY p.id
            )
            SELECT CAST(CAST(birth_year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(birth_year/25 AS INTEGER)*25+24 AS TEXT) AS generation,
                   CAST(((death_year-1)/100)+1 AS INTEGER)||'e siècle' AS label,
                   ROUND(AVG(death_year-birth_year),1) AS value,
                   count(*) AS count
            FROM lifespans
            WHERE birth_year IS NOT NULL AND death_year IS NOT NULL AND death_year>=birth_year"
            .($yearFrom !== null ? " AND birth_year>=?" : '')
            .($yearTo !== null ? " AND birth_year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY generation,label ORDER BY CAST(substr(generation,1,4) AS INTEGER),CAST(death_year/100 AS INTEGER)",
            array_merge($hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'life_expectancy_lineage_generation_century' => ['Espérance de vie moyenne par génération/siècle dans ta lignée','Moyenne d’âge au décès limitée aux ascendants SOSA de la personne courante.','metric_grid',
            "WITH lifespans AS (
                SELECT p.id,p.gender,
                       min(CASE WHEN t.gedcom_tag='BIRT' THEN e.year END) birth_year,
                       min(CASE WHEN t.gedcom_tag='DEAT' THEN e.year END) death_year
                FROM persons p LEFT JOIN events e ON e.person_id=p.id LEFT JOIN event_types t ON t.id=e.event_type_id
                GROUP BY p.id
            )
            SELECT CAST(CAST(birth_year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(birth_year/25 AS INTEGER)*25+24 AS TEXT) AS generation,
                   CAST(((death_year-1)/100)+1 AS INTEGER)||'e siècle' AS label,
                   ROUND(AVG(death_year-birth_year),1) AS value,
                   count(*) AS count,
                   'ans' AS unit
            FROM lifespans p
            WHERE birth_year IS NOT NULL AND death_year IS NOT NULL AND death_year>=birth_year"
            .($lineageIds ? $lineageCond : " AND 1=0")
            .($yearFrom !== null ? " AND birth_year>=?" : '')
            .($yearTo !== null ? " AND birth_year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY generation,label ORDER BY CAST(substr(generation,1,4) AS INTEGER),CAST(death_year/100 AS INTEGER)",
            array_merge($lineageParams, $hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'marriage_first_birth_age' => ['Âge moyen au mariage et aux naissances','Évolution par génération de naissance : premier mariage, premier enfant et dernier enfant connus.','metric_grid',
            "WITH base AS (
                SELECT p.id,p.gender,
                       (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT') AS birth_year,
                       (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE (f.partner1_id=p.id OR f.partner2_id=p.id) AND t.gedcom_tag IN ('MARR','MRCI','MRRE')) AS marriage_year,
                       (SELECT min(be.year) FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN events be ON be.person_id=fc.child_id JOIN event_types bt ON bt.id=be.event_type_id WHERE (f.partner1_id=p.id OR f.partner2_id=p.id) AND bt.gedcom_tag='BIRT') AS first_child_year,
                       (SELECT max(be.year) FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN events be ON be.person_id=fc.child_id JOIN event_types bt ON bt.id=be.event_type_id WHERE (f.partner1_id=p.id OR f.partner2_id=p.id) AND bt.gedcom_tag='BIRT') AS last_child_year
                FROM persons p
            ),
            metrics AS (
                SELECT CAST(CAST(birth_year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(birth_year/25 AS INTEGER)*25+24 AS TEXT) AS generation,
                       'Âge moyen au mariage' AS label,
                       ROUND(AVG(marriage_year-birth_year),1) AS value,
                       count(*) AS count,
                       'ans' AS unit
                FROM base p WHERE birth_year IS NOT NULL AND marriage_year IS NOT NULL AND marriage_year>=birth_year"
            .($yearFrom !== null ? " AND birth_year>=?" : '')
            .($yearTo !== null ? " AND birth_year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY generation
                UNION ALL
                SELECT CAST(CAST(birth_year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(birth_year/25 AS INTEGER)*25+24 AS TEXT) AS generation,
                       'Âge moyen à la première naissance' AS label,
                       ROUND(AVG(first_child_year-birth_year),1) AS value,
                       count(*) AS count,
                       'ans' AS unit
                FROM base p WHERE birth_year IS NOT NULL AND first_child_year IS NOT NULL AND first_child_year>=birth_year"
            .($yearFrom !== null ? " AND birth_year>=?" : '')
            .($yearTo !== null ? " AND birth_year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY generation
                UNION ALL
                SELECT CAST(CAST(birth_year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(birth_year/25 AS INTEGER)*25+24 AS TEXT) AS generation,
                       'Âge moyen à la dernière naissance' AS label,
                       ROUND(AVG(last_child_year-birth_year),1) AS value,
                       count(*) AS count,
                       'ans' AS unit
                FROM base p WHERE birth_year IS NOT NULL AND last_child_year IS NOT NULL AND last_child_year>=birth_year"
            .($yearFrom !== null ? " AND birth_year>=?" : '')
            .($yearTo !== null ? " AND birth_year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY generation
            )
            SELECT * FROM metrics WHERE value IS NOT NULL ORDER BY CAST(substr(generation,1,4) AS INTEGER),label",
            array_merge($hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [], $hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [], $hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'family_gravity_migration' => ['Migration géographique — centre de gravité familial','Centre moyen des lieux d’événements par siècle, utile pour suivre le déplacement global de la famille.','metric_grid',
            "SELECT CAST(((e.year-1)/100)+1 AS INTEGER)||'e siècle' AS generation,
                   'Centre moyen : '||ROUND(AVG(COALESCE(e.precise_lat,pl.latitude)),3)||', '||ROUND(AVG(COALESCE(e.precise_lon,pl.longitude)),3) AS label,
                   count(*) AS value,
                   count(*) AS count,
                   'évènements' AS unit
            FROM events e
            JOIN event_types t ON t.id=e.event_type_id
            LEFT JOIN persons p ON p.id=e.person_id
            LEFT JOIN places pl ON pl.id=e.place_id
            WHERE e.year IS NOT NULL
              AND COALESCE(e.precise_lat,pl.latitude) IS NOT NULL
              AND COALESCE(e.precise_lon,pl.longitude) IS NOT NULL
              AND COALESCE(e.precise_lat,pl.latitude)<>0
              AND COALESCE(e.precise_lon,pl.longitude)<>0"
            .($yearFrom !== null ? " AND e.year>=?" : '')
            .($yearTo !== null ? " AND e.year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND (p.gender IS NULL OR p.gender NOT IN ('male','female'))" : " AND p.gender=?") : '')
            ." GROUP BY generation ORDER BY CAST(e.year/100 AS INTEGER)",
            array_merge($hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'infant_mortality_period' => ['Taux de mortalité infantile par période','Part des personnes nées et décédées avant 1 an, par génération de naissance.','indicator_grid',
            "WITH lifespans AS (
                SELECT p.id,p.gender,
                       min(CASE WHEN t.gedcom_tag='BIRT' THEN e.year END) birth_year,
                       min(CASE WHEN t.gedcom_tag='DEAT' THEN e.year END) death_year
                FROM persons p LEFT JOIN events e ON e.person_id=p.id LEFT JOIN event_types t ON t.id=e.event_type_id
                GROUP BY p.id
            )
            SELECT CAST(CAST(birth_year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(birth_year/25 AS INTEGER)*25+24 AS TEXT) AS label,
                   ROUND(SUM(CASE WHEN death_year IS NOT NULL AND death_year>=birth_year AND death_year-birth_year<1 THEN 1 ELSE 0 END)*100.0/count(*),1) AS value,
                   '%' AS unit,
                   count(*) AS count
            FROM lifespans
            WHERE birth_year IS NOT NULL"
            .($yearFrom !== null ? " AND birth_year>=?" : '')
            .($yearTo !== null ? " AND birth_year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY label HAVING count(*)>0 ORDER BY CAST(substr(label,1,4) AS INTEGER)",
            array_merge($hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'occupation_timeline' => ['Métiers dans le temps','Frise des métiers relevés dans les fiches, événements de profession et recensements.','timeline_bands',
            "WITH occ AS (
                SELECT p.id AS person_id,p.gender,p.occupation AS occupation,
                       (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT') AS year
                FROM persons p WHERE p.occupation IS NOT NULL AND trim(p.occupation)<>''
                UNION ALL
                SELECT e.person_id,p.gender,COALESCE(NULLIF(trim(e.title),''),NULLIF(trim(e.description),'')) AS occupation,e.year
                FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id
                WHERE e.person_id IS NOT NULL AND e.year IS NOT NULL AND (t.gedcom_tag='OCCU' OR lower(t.label) LIKE '%profes%' OR lower(t.label) LIKE '%métier%' OR lower(t.label) LIKE '%metier%' OR lower(t.label) LIKE '%activit%')
                  AND COALESCE(NULLIF(trim(e.title),''),NULLIF(trim(e.description),'')) IS NOT NULL
                UNION ALL
                SELECT cm.person_id,p.gender,cm.occupation,cr.year
                FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id LEFT JOIN persons p ON p.id=cm.person_id
                WHERE cm.occupation IS NOT NULL AND trim(cm.occupation)<>''
            )
            SELECT CAST(CAST(year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(year/25 AS INTEGER)*25+24 AS TEXT) AS generation,
                   trim(occupation) AS label,
                   count(DISTINCT person_id) AS value
            FROM occ
            WHERE year IS NOT NULL AND trim(occupation)<>''"
            .($yearFrom !== null ? " AND year>=?" : '')
            .($yearTo !== null ? " AND year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY generation,lower(trim(occupation)) HAVING value>0 ORDER BY CAST(substr(generation,1,4) AS INTEGER),value DESC,label LIMIT 180",
            array_merge($hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'occupation_by_generation' => ['Carte des métiers par génération','Nuage de métiers par génération de naissance ou de recensement.','word_cloud',
            "WITH occ AS (
                SELECT p.id AS person_id,p.gender,p.occupation AS occupation,
                       (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT') AS year
                FROM persons p WHERE p.occupation IS NOT NULL AND trim(p.occupation)<>''
                UNION ALL
                SELECT e.person_id,p.gender,COALESCE(NULLIF(trim(e.title),''),NULLIF(trim(e.description),'')) AS occupation,e.year
                FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id
                WHERE e.person_id IS NOT NULL AND e.year IS NOT NULL AND (t.gedcom_tag='OCCU' OR lower(t.label) LIKE '%profes%' OR lower(t.label) LIKE '%métier%' OR lower(t.label) LIKE '%metier%' OR lower(t.label) LIKE '%activit%')
                  AND COALESCE(NULLIF(trim(e.title),''),NULLIF(trim(e.description),'')) IS NOT NULL
                UNION ALL
                SELECT cm.person_id,p.gender,cm.occupation,cr.year
                FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id LEFT JOIN persons p ON p.id=cm.person_id
                WHERE cm.occupation IS NOT NULL AND trim(cm.occupation)<>''
            )
            SELECT CAST(CAST(year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(year/25 AS INTEGER)*25+24 AS TEXT) AS generation,
                   trim(occupation) AS label,
                   count(DISTINCT person_id) AS value
            FROM occ
            WHERE year IS NOT NULL AND trim(occupation)<>''"
            .($yearFrom !== null ? " AND year>=?" : '')
            .($yearTo !== null ? " AND year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY generation,lower(trim(occupation)) HAVING value>0 ORDER BY CAST(substr(generation,1,4) AS INTEGER),value DESC,label LIMIT 220",
            array_merge($hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'firstnames_by_generation' => ['Nuage de prénoms par génération','Popularité des premiers prénoms par génération de naissance de 25 ans.','word_cloud',
            "WITH births AS (
                SELECT p.id,p.gender,COALESCE(NULLIF(substr(p.first_name,1,instr(p.first_name||' ',' ')-1),''),'Sans prénom') AS firstname,min(e.year) AS birth_year
                FROM persons p JOIN events e ON e.person_id=p.id JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='BIRT'
                WHERE e.year IS NOT NULL GROUP BY p.id
            )
            SELECT CAST(CAST(birth_year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(birth_year/25 AS INTEGER)*25+24 AS TEXT) AS generation,
                   firstname AS label,
                   count(*) AS value
            FROM births WHERE birth_year IS NOT NULL"
            .($yearFrom !== null ? " AND birth_year>=?" : '')
            .($yearTo !== null ? " AND birth_year<=?" : '')
            .($hasGenderFilter ? ($gender === 'unknown' ? " AND gender NOT IN ('male','female')" : " AND gender=?") : '')
            ." GROUP BY generation,firstname ORDER BY CAST(substr(generation,1,4) AS INTEGER),value DESC,label LIMIT 180",
            array_merge($hasYearFilter ? $birthYearParams : [], ($hasGenderFilter && $gender !== 'unknown') ? [$gender] : [])],
        'endogamy_index' => ['Indice d’endogamie / consanguinité','Estimation des couples dont les deux conjoints partagent au moins un ancêtre connu jusqu’à 8 générations.','indicator_grid',
            "WITH RECURSIVE ancestors(root,ancestor,depth) AS (
                SELECT fc.child_id,f.partner1_id,1 FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id IS NOT NULL
                UNION ALL
                SELECT fc.child_id,f.partner2_id,1 FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner2_id IS NOT NULL
                UNION ALL
                SELECT a.root,f.partner1_id,a.depth+1 FROM ancestors a JOIN family_children fc ON fc.child_id=a.ancestor JOIN families f ON f.id=fc.family_id WHERE a.depth<8 AND f.partner1_id IS NOT NULL
                UNION ALL
                SELECT a.root,f.partner2_id,a.depth+1 FROM ancestors a JOIN family_children fc ON fc.child_id=a.ancestor JOIN families f ON f.id=fc.family_id WHERE a.depth<8 AND f.partner2_id IS NOT NULL
            ),
            couples AS (
                SELECT f.id,f.partner1_id,f.partner2_id,
                       (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=f.id AND t.gedcom_tag IN ('MARR','MRCI','MRRE')) AS marriage_year
                FROM families f WHERE f.partner1_id IS NOT NULL AND f.partner2_id IS NOT NULL
            ),
            filtered_couples AS (
                SELECT * FROM couples WHERE 1=1"
            .($yearFrom !== null ? " AND marriage_year>=?" : '')
            .($yearTo !== null ? " AND marriage_year<=?" : '')
            ."
            ),
            shared AS (
                SELECT fc.id AS family_id,count(DISTINCT a1.ancestor) AS common_ancestors,min(a1.depth+a2.depth) AS closest_path
                FROM filtered_couples fc
                JOIN ancestors a1 ON a1.root=fc.partner1_id
                JOIN ancestors a2 ON a2.root=fc.partner2_id AND a2.ancestor=a1.ancestor
                GROUP BY fc.id
            ),
            totals AS (
                SELECT count(*) AS tested,
                       (SELECT count(*) FROM shared) AS linked,
                       (SELECT COALESCE(sum(common_ancestors),0) FROM shared) AS common_total,
                       (SELECT min(closest_path) FROM shared) AS closest_path
                FROM filtered_couples
            )
            SELECT 'Couples testés' AS label,tested AS value,'couples' AS unit FROM totals
            UNION ALL SELECT 'Couples avec ancêtre commun',linked,'couples' FROM totals
            UNION ALL SELECT 'Indice estimé',CASE WHEN tested>0 THEN ROUND(linked*100.0/tested,1) ELSE 0 END,'%' FROM totals
            UNION ALL SELECT 'Ancêtres communs repérés',common_total,'liens' FROM totals
            UNION ALL SELECT 'Lien le plus proche',COALESCE(closest_path,0),'générations cumulées' FROM totals",
            $hasYearFilter ? $birthYearParams : []],
        'marriage_places' => ['Lieux de mariage','Répartition des lieux renseignés sur les événements de mariage.','bar',
            // un mariage par couple (civil, religieux… : celui qui a un lieu, le mariage d'abord)
            "WITH m AS (SELECT e.place_id,row_number() OVER(PARTITION BY COALESCE(e.family_id,-e.id) ORDER BY (e.place_id IS NULL),CASE t.gedcom_tag WHEN 'MARR' THEN 0 WHEN 'MRCI' THEN 1 ELSE 2 END,e.id) AS rn
                FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('MARR','MRCI','MRRE'))
             SELECT COALESCE(NULLIF(trim(pl.name),''),'Lieu non renseigné') AS label,count(*) AS value FROM m LEFT JOIN places pl ON pl.id=m.place_id WHERE m.rn=1 GROUP BY 1 ORDER BY value DESC,label LIMIT 80", []],
        'sibling_birth_interval' => ['Intervalle entre les naissances d’une fratrie','Intervalle moyen, en années, entre deux naissances successives dans une même famille.','metric_grid',
            "WITH births AS (
                SELECT fc.family_id,e.year AS birth_year FROM family_children fc
                JOIN events e ON e.person_id=fc.child_id JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='BIRT'
                WHERE e.year IS NOT NULL GROUP BY fc.family_id,fc.child_id
            ), gaps AS (
                SELECT family_id,birth_year-LAG(birth_year) OVER(PARTITION BY family_id ORDER BY birth_year) AS gap_years FROM births
            )
            SELECT 'Toutes les fratries' AS generation,'Intervalle moyen' AS label,ROUND(AVG(gap_years),1) AS value,count(*) AS count,'ans' AS unit
            FROM gaps WHERE gap_years IS NOT NULL AND gap_years>=0", []],
        'farthest_from_origin' => ['Lieux les plus éloignés de la commune d’origine','Écart approximatif depuis le lieu de naissance vers un autre lieu connu, calculé à partir des coordonnées.','bar',
            "WITH births AS (
                SELECT e.person_id,COALESCE(e.precise_lat,pl.latitude) AS lat,COALESCE(e.precise_lon,pl.longitude) AS lon
                FROM events e JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='BIRT' LEFT JOIN places pl ON pl.id=e.place_id
                WHERE COALESCE(e.precise_lat,pl.latitude) IS NOT NULL AND COALESCE(e.precise_lon,pl.longitude) IS NOT NULL
            ), distances AS (
                SELECT trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,''))||' · '||pl.name AS label,
                    (ABS(COALESCE(e.precise_lat,pl.latitude)-b.lat)+ABS(COALESCE(e.precise_lon,pl.longitude)-b.lon))*78 AS distance
                FROM births b JOIN events e ON e.person_id=b.person_id LEFT JOIN places pl ON pl.id=e.place_id JOIN persons p ON p.id=e.person_id
                WHERE COALESCE(e.precise_lat,pl.latitude) IS NOT NULL AND COALESCE(e.precise_lon,pl.longitude) IS NOT NULL AND pl.name IS NOT NULL
            ) SELECT label,ROUND(MAX(distance),1) AS value FROM distances GROUP BY label ORDER BY value DESC LIMIT 30", []],
        'residence_duration' => ['Durée moyenne de résidence','Durée approximative entre la première et la dernière mention dans un même lieu de résidence.','metric_grid',
            "WITH stays AS (
                SELECT e.person_id,e.place_id,min(e.year) AS first_year,max(e.year) AS last_year
                FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
                WHERE e.year IS NOT NULL AND e.place_id IS NOT NULL AND (t.gedcom_tag='RESI' OR lower(t.label) LIKE '%résidence%' OR lower(t.label) LIKE '%residence%')
                GROUP BY e.person_id,e.place_id
            ) SELECT 'Mentions de résidence' AS generation,'Durée moyenne' AS label,ROUND(AVG(last_year-first_year),1) AS value,count(*) AS count,'ans' AS unit
              FROM stays WHERE last_year>=first_year", []],
        'marital_patterns' => ['Remariage, veuvage et célibat','Indicateurs calculés à partir des unions et décès renseignés.','indicator_grid',
            "WITH married AS (
                SELECT p.id,count(DISTINCT f.id) AS unions FROM persons p LEFT JOIN families f ON f.partner1_id=p.id OR f.partner2_id=p.id GROUP BY p.id
            ), deceased AS (SELECT DISTINCT e.person_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='DEAT' AND e.person_id IS NOT NULL)
            SELECT 'Personnes avec au moins deux unions' AS label,count(*) AS value,'personnes' AS unit FROM married WHERE unions>=2
            UNION ALL SELECT 'Personnes sans union renseignée',count(*),'personnes' FROM married WHERE unions=0
            UNION ALL SELECT 'Personnes décédées avec une union',count(*),'personnes' FROM married JOIN deceased d ON d.person_id=married.id WHERE unions>=1", []],
        'death_causes' => ['Causes de décès','Répartition des causes quand elles ont été relevées dans les événements de décès.','bar',
            "SELECT trim(e.cause) AS label,count(*) AS value FROM events e JOIN event_types t ON t.id=e.event_type_id
             WHERE t.gedcom_tag='DEAT' AND trim(COALESCE(e.cause,''))<>'' GROUP BY lower(trim(e.cause)) ORDER BY value DESC,label LIMIT 80", []],
        'completeness' => ['Complétude par branche, génération, commune et période','Part de personnes ayant naissance et décès renseignés, selon plusieurs regroupements.','metric_grid',
            "WITH life AS (
                SELECT p.id,COALESCE(NULLIF(trim(g.name),''),NULLIF(trim(p.last_name),''),'Sans branche') AS branch,
                    min(CASE WHEN t.gedcom_tag='BIRT' THEN e.year END) AS birth_year,
                    min(CASE WHEN t.gedcom_tag='DEAT' THEN e.year END) AS death_year,
                    min(CASE WHEN t.gedcom_tag='BIRT' THEN pl.name END) AS birth_place
                FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id LEFT JOIN events e ON e.person_id=p.id
                LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id GROUP BY p.id
            )
            SELECT 'Branche' AS generation,branch AS label,ROUND(SUM(CASE WHEN birth_year IS NOT NULL AND death_year IS NOT NULL THEN 1 ELSE 0 END)*100.0/count(*),1) AS value,count(*) AS count,'%' AS unit FROM life GROUP BY branch
            UNION ALL SELECT 'Génération',CAST(CAST(birth_year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(birth_year/25 AS INTEGER)*25+24 AS TEXT),ROUND(SUM(CASE WHEN birth_year IS NOT NULL AND death_year IS NOT NULL THEN 1 ELSE 0 END)*100.0/count(*),1),count(*),'%' FROM life WHERE birth_year IS NOT NULL GROUP BY CAST(birth_year/25 AS INTEGER)
            UNION ALL SELECT 'Commune',COALESCE(NULLIF(birth_place,''),'Non renseignée'),ROUND(SUM(CASE WHEN birth_year IS NOT NULL AND death_year IS NOT NULL THEN 1 ELSE 0 END)*100.0/count(*),1),count(*),'%' FROM life GROUP BY COALESCE(NULLIF(birth_place,''),'Non renseignée')
            UNION ALL SELECT 'Période',CAST(CAST(birth_year/50 AS INTEGER)*50 AS TEXT)||'–'||CAST(CAST(birth_year/50 AS INTEGER)*50+49 AS TEXT),ROUND(SUM(CASE WHEN birth_year IS NOT NULL AND death_year IS NOT NULL THEN 1 ELSE 0 END)*100.0/count(*),1),count(*),'%' FROM life WHERE birth_year IS NOT NULL GROUP BY CAST(birth_year/50 AS INTEGER)", []],
        'occupation_branch_evolution' => ['Évolution des professions dans une branche','Professions renseignées par branche et génération de naissance.','timeline_bands',
            "WITH occ AS (
                SELECT p.id,COALESCE(NULLIF(trim(g.name),''),NULLIF(trim(p.last_name),''),'Sans branche') AS branch,trim(p.occupation) AS occupation,
                    (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT') AS birth_year
                FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id WHERE trim(COALESCE(p.occupation,''))<>''
            ) SELECT branch AS generation,occupation AS label,count(*) AS value FROM occ WHERE birth_year IS NOT NULL GROUP BY branch,lower(occupation) ORDER BY branch,value DESC,label LIMIT 180", []],
        'mobility_by_generation' => ['Indice de mobilité géographique par génération','Nombre moyen de lieux distincts associés à une personne, groupé par génération de naissance.','metric_grid',
            "WITH births AS (SELECT e.person_id,min(e.year) AS birth_year FROM events e JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='BIRT' WHERE e.year IS NOT NULL GROUP BY e.person_id), moves AS (SELECT p.id,count(DISTINCT e.place_id) AS places FROM persons p LEFT JOIN events e ON e.person_id=p.id AND e.place_id IS NOT NULL GROUP BY p.id)
            SELECT CAST(CAST(b.birth_year/25 AS INTEGER)*25 AS TEXT)||'–'||CAST(CAST(b.birth_year/25 AS INTEGER)*25+24 AS TEXT) AS generation,'Lieux distincts par personne' AS label,ROUND(AVG(m.places),1) AS value,count(*) AS count,'lieux' AS unit FROM births b JOIN moves m ON m.id=b.person_id GROUP BY generation ORDER BY CAST(substr(generation,1,4) AS INTEGER)", []],
        'children_per_family' => ['Enfants par famille','Nombre d’enfants renseignés par famille.','bar',"SELECT CAST(child_count AS TEXT) AS label,count(*) AS value FROM (SELECT family_id,count(*) AS child_count FROM family_children GROUP BY family_id) GROUP BY child_count ORDER BY child_count", []],
    ];
    if (!isset($definitions[$type])) $type = 'surnames';
    [$title,$description,$kind,$sql,$params] = $definitions[$type];
    // Critères en plus (« + Critère », comme dans Mes listes) : la statistique ne compte que les fiches retenues.
    // Une statistique qui ne sait pas filtrer par années ou par sexe le fait ainsi elle aussi.
    $gdef = json_decode((string) ($_GET['def'] ?? ''), true);
    $grules = is_array($gdef['rules'] ?? null) ? array_values(array_filter($gdef['rules'], 'is_array')) : [];
    if (!$params && !str_contains($sql, '?') && ($hasYearFilter || $hasGenderFilter)) {
        if ($dateFrom !== '' || $dateTo !== '') { $grules[] = ['field' => 'date_range', 'date_from' => $dateFrom, 'date_to' => $dateTo]; }
        elseif ($hasYearFilter) { $grules[] = ['field' => 'year', 'from' => $yearFrom, 'to' => $yearTo]; }
        if ($hasGenderFilter) { $grules[] = ['field' => 'gender', 'value' => $gender]; }
    }
    $onlyIds = false;
    if ($grules) {
        $GLOBALS['LCNDA_LIST_CONTEXT_PERSON'] = $sosaRootId; // « par rapport à la personne de la fiche »
        $ids = my_list_rows_for($pdo, ['id' => 0, 'source' => 'persons', 'definition_json' => json_encode(['match' => 'all', 'rules' => array_slice($grules, 0, 40)]), 'ids_only' => true])['ids'] ?? [];
        $pdo->exec('CREATE TEMP TABLE IF NOT EXISTS gs_ids(id INTEGER PRIMARY KEY)'); $pdo->exec('DELETE FROM temp.gs_ids');
        $pdo->prepare('INSERT OR IGNORE INTO temp.gs_ids(id) SELECT value FROM json_each(?)')->execute([json_encode($ids)]);
        $onlyIds = true;
    }
    $sql = graph_scope_kind($sql, ($_GET['kind'] ?? '') === 'animal' ? 'animal' : 'human', $onlyIds);
    $stmt = $pdo->prepare($sql);
    foreach (array_values($params) as $index => $value) {
        $stmt->bindValue($index + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
    $stmt->execute();
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        if (isset($row['value']) && is_numeric($row['value'])) {
            $row['value'] = str_contains((string)$row['value'], '.') ? (float)$row['value'] : (int)$row['value'];
        }
    }
    unset($row);
    $total=in_array($kind,['metric_grid','indicator_grid'],true)
        ? array_sum(array_map(static fn($row)=>(int)($row['count']??0),$rows))
        : array_sum(array_column($rows,'value'));
    if ($total === 0 && $kind === 'indicator_grid' && $rows) {
        $total = array_sum(array_map(static fn($row)=>(float)($row['value'] ?? 0), $rows));
    }
    json_response([
        'type'=>$type,'title'=>$title,'description'=>$description,'kind'=>$kind,'total'=>$total,'rows'=>$rows,
        'yearFrom'=>$yearFrom,'yearTo'=>$yearTo,'gender'=>$gender,'filtered'=>$onlyIds,
    ]);
}

function research_data(PDO $pdo): never
{
    $q=safe_text($_GET['q']??'');$category=safe_text($_GET['category']??'all');
    if(!in_array($category,['all','name','place','year','occupation','employer'],true))$category='all';
    if($q==='')json_response(['query'=>'','category'=>$category,'people'=>[]]);
    $like='%'.$q.'%';$name="(p.first_name LIKE ? COLLATE NOCASE OR p.middle_name LIKE ? COLLATE NOCASE OR p.last_name LIKE ? COLLATE NOCASE OR g.name LIKE ? COLLATE NOCASE OR EXISTS(SELECT 1 FROM name_variants nv WHERE nv.person_id=p.id AND (nv.first_name LIKE ? COLLATE NOCASE OR nv.middle_name LIKE ? COLLATE NOCASE OR nv.last_name LIKE ? COLLATE NOCASE)))";
    $linked="(re.person_id=p.id OR re.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id))";
    $place="EXISTS(SELECT 1 FROM events re JOIN places rp ON rp.id=re.place_id WHERE $linked AND (rp.name LIKE ? COLLATE NOCASE OR rp.county LIKE ? COLLATE NOCASE OR rp.state LIKE ? COLLATE NOCASE OR rp.country LIKE ? COLLATE NOCASE))";
    $year="EXISTS(SELECT 1 FROM events re WHERE $linked AND (CAST(re.year AS TEXT)=? OR re.date_text LIKE ? COLLATE NOCASE))";
    $occupation="(p.occupation LIKE ? COLLATE NOCASE OR EXISTS(SELECT 1 FROM events re JOIN event_types ret ON ret.id=re.event_type_id WHERE re.person_id=p.id AND ret.gedcom_tag='OCCU' AND (re.title LIKE ? COLLATE NOCASE OR re.description LIKE ? COLLATE NOCASE)))";
    $employer="EXISTS(SELECT 1 FROM census_members cm WHERE cm.person_id=p.id AND cm.employer LIKE ? COLLATE NOCASE)";
    if($category==='occupation'){
        $where=$occupation;$params=[$like,$like,$like];
        $stmt=$pdo->prepare(person_select()." WHERE $where ORDER BY p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE LIMIT 600");$stmt->execute($params);$people=$stmt->fetchAll();
        if(!$people)json_response(['query'=>$q,'category'=>$category,'people'=>[]]);
        // Récupère le libellé réel du métier : persons.occupation en priorité,
        // sinon titre/description du premier événement OCCU, sinon le terme recherché
        $personIds=array_column($people,'id');
        $occuLabelsOccu=[];
        if($personIds){
            $marks2=implode(',',array_fill(0,count($personIds),'?'));
            $occuStmt2=$pdo->prepare("SELECT e.person_id,COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),'')) AS occ_label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='OCCU' AND e.person_id IN ($marks2) ORDER BY e.id");
            $occuStmt2->execute($personIds);
            foreach($occuStmt2->fetchAll() as $row)if(!isset($occuLabelsOccu[(int)$row['person_id']]))$occuLabelsOccu[(int)$row['person_id']]=$row['occ_label'];
        }
        foreach($people as &$person){
            $occ=trim((string)($person['occupation']??''));
            if($occ==='')$occ=$occuLabelsOccu[(int)$person['id']]??'';
            if($occ==='')$occ=$q;
            $person['matches']=[['kind'=>'occupation','label'=>'Métier : '.$occ,'date'=>'','place'=>'']];
        }
        unset($person);
        json_response(['query'=>$q,'category'=>$category,'people'=>$people]);
    }
    if($category==='employer'){
        $where=$employer;$params=[$like];
        $stmt=$pdo->prepare(person_select()." WHERE $where ORDER BY p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE LIMIT 600");$stmt->execute($params);$people=$stmt->fetchAll();
        if(!$people)json_response(['query'=>$q,'category'=>$category,'people'=>[]]);
        // Récupère le vrai nom de l'employeur depuis census_members.employer
        $empIds=array_column($people,'id');
        $empLabels=[];
        if($empIds){
            $marks2=implode(',',array_fill(0,count($empIds),'?'));
            $empStmt=$pdo->prepare("SELECT cm.person_id,cm.employer FROM census_members cm WHERE cm.person_id IN ($marks2) AND cm.employer LIKE ? COLLATE NOCASE ORDER BY cm.id");
            $empStmt->execute(array_merge($empIds,[$like]));
            foreach($empStmt->fetchAll() as $row)if(!isset($empLabels[(int)$row['person_id']]))$empLabels[(int)$row['person_id']]=trim($row['employer']);
        }
        foreach($people as &$person){
            $emp=$empLabels[(int)$person['id']]??$q;
            $person['matches']=[['kind'=>'occupation','label'=>'Employeur : '.$emp,'date'=>'','place'=>'']];
        }
        unset($person);
        json_response(['query'=>$q,'category'=>$category,'people'=>$people]);
    }
    $where=$category==='name'?$name:($category==='place'?$place:($category==='year'?$year:($category==='occupation'?$occupation:($category==='employer'?$employer:"($name OR $place OR $year OR $occupation OR $employer)"))));
    $params=[];
    if($category==='name'||$category==='all')$params=array_merge($params,array_fill(0,7,$like));
    if($category==='place'||$category==='all')$params=array_merge($params,array_fill(0,4,$like));
    if($category==='year'||$category==='all'){$params[]=$q;$params[]=$like;}
    if($category==='occupation'||$category==='all')$params=array_merge($params,array_fill(0,3,$like));
    if($category==='employer'||$category==='all')$params[]=$like;
    $stmt=$pdo->prepare(person_select()." WHERE $where ORDER BY p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE LIMIT 600");$stmt->execute($params);$people=$stmt->fetchAll();
    if(!$people)json_response(['query'=>$q,'category'=>$category,'people'=>[]]);
    $byId=[];foreach($people as $index=>&$person){$person['matches']=[];$byId[(int)$person['id']]=$index;}unset($person);
    $ids=array_keys($byId);$marks=implode(',',array_fill(0,count($ids),'?'));
    // Détection des correspondances métier (occupation)
    if($category==='occupation'||$category==='all'){
        $occuIds=$pdo->prepare("SELECT DISTINCT p.id FROM persons p WHERE p.id IN ($marks) AND (p.occupation LIKE ? COLLATE NOCASE OR EXISTS(SELECT 1 FROM events re JOIN event_types ret ON ret.id=re.event_type_id WHERE re.person_id=p.id AND ret.gedcom_tag='OCCU' AND (re.title LIKE ? COLLATE NOCASE OR re.description LIKE ? COLLATE NOCASE)))");
        $occuIds->execute(array_merge($ids,[$like,$like,$like]));
        // Récupère le libellé réel pour chaque personne trouvée
        $occuIdList=$occuIds->fetchAll(PDO::FETCH_COLUMN);
        $occuLabels=[];
        if($occuIdList){
            $marks3=implode(',',array_fill(0,count($occuIdList),'?'));
            $occuStmt=$pdo->prepare("SELECT e.person_id,COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),'')) AS occ_label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='OCCU' AND e.person_id IN ($marks3) ORDER BY e.id");
            $occuStmt->execute($occuIdList);
            foreach($occuStmt->fetchAll() as $row)if(!isset($occuLabels[(int)$row['person_id']]))$occuLabels[(int)$row['person_id']]=$row['occ_label'];
        }
        foreach($occuIdList as $personId)if(isset($byId[(int)$personId])){
            $occ=trim((string)($people[$byId[(int)$personId]]['occupation']??'')); if($occ==='')$occ=$occuLabels[(int)$personId]??'';
            $people[$byId[(int)$personId]]['matches'][]=['kind'=>'occupation','label'=>'Métier : '.($occ!==''?$occ:$q),'date'=>'','place'=>''];
        }
    }
    // Détection des correspondances employeur
    if($category==='employer'||$category==='all'){
        $empStmt=$pdo->prepare("SELECT DISTINCT cm.person_id,cm.employer FROM census_members cm WHERE cm.person_id IN ($marks) AND cm.employer LIKE ? COLLATE NOCASE");
        $empStmt->execute(array_merge($ids,[$like]));
        foreach($empStmt->fetchAll() as $row)if(isset($byId[(int)$row['person_id']])&&count($people[$byId[(int)$row['person_id']]]["matches"])<12)
            $people[$byId[(int)$row['person_id']]]["matches"][]=['kind'=>'occupation','label'=>'Employeur : '.trim($row['employer']),'date'=>'','place'=>''];
    }
    if($category==='name'||$category==='all'){$identity=$pdo->prepare("SELECT p.id FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id WHERE p.id IN ($marks) AND $name");$identity->execute(array_merge($ids,array_fill(0,7,$like)));foreach($identity->fetchAll(PDO::FETCH_COLUMN) as $personId)$people[$byId[(int)$personId]]['matches'][]=['kind'=>'identity','label'=>'Identité ou variante de nom','date'=>'','place'=>''];}
    if($category!=='name'){
        $eventConditions=[];$eventParams=[];
        if($category==='place'||$category==='all'){$eventConditions[]='(pl.name LIKE ? COLLATE NOCASE OR pl.subdivision LIKE ? COLLATE NOCASE OR pl.county LIKE ? COLLATE NOCASE OR pl.state LIKE ? COLLATE NOCASE OR pl.country LIKE ? COLLATE NOCASE)';$eventParams=array_merge($eventParams,array_fill(0,5,$like));}
        if($category==='year'||$category==='all'){$eventConditions[]='(CAST(e.year AS TEXT)=? OR e.date_text LIKE ? COLLATE NOCASE)';$eventParams[]=$q;$eventParams[]=$like;}
        $events=$pdo->prepare("SELECT DISTINCT e.id,e.person_id,e.family_id,e.date_text,e.year,t.label AS type,pl.name AS place,pl.subdivision,pl.county,pl.state,pl.country,f.partner1_id,f.partner2_id FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id WHERE (e.person_id IN ($marks) OR f.partner1_id IN ($marks) OR f.partner2_id IN ($marks)) AND (".implode(' OR ',$eventConditions).") ORDER BY COALESCE(e.year,9999),e.id");
        $events->execute(array_merge($ids,$ids,$ids,$eventParams));
        foreach($events->fetchAll() as $event){$targets=array_unique(array_filter([(int)($event['person_id']??0),(int)($event['partner1_id']??0),(int)($event['partner2_id']??0)]));foreach($targets as $personId)if(isset($byId[$personId])&&count($people[$byId[$personId]]['matches'])<12)$people[$byId[$personId]]['matches'][]=['kind'=>'event','label'=>$event['type'],'date'=>$event['date_text']?:($event['year']?:''),'place'=>place_label(['name'=>$event['place']??'','subdivision'=>$event['subdivision']??'','county'=>$event['county']??'','state'=>$event['state']??'','country'=>$event['country']??'']),'event_id'=>(int)$event['id']];}
    }
    json_response(['query'=>$q,'category'=>$category,'people'=>$people]);
}

function transcription_excerpt(string $text, string $query): string
{
    $clean = trim((string) preg_replace('/\s+/u', ' ', $text));
    if ($clean === '') return '';
    $pos = stripos($clean, $query);
    if ($pos === false) {
        $excerpt = function_exists('mb_substr') ? mb_substr($clean, 0, 240) : substr($clean, 0, 240);
        return $excerpt . ((function_exists('mb_strlen') ? mb_strlen($clean) : strlen($clean)) > 240 ? '…' : '');
    }
    $start = max(0, $pos - 90);
    $excerpt = function_exists('mb_substr') ? mb_substr($clean, $start, 260) : substr($clean, $start, 260);
    $length = function_exists('mb_strlen') ? mb_strlen($clean) : strlen($clean);
    return ($start > 0 ? '…' : '') . $excerpt . (($start + 260) < $length ? '…' : '');
}

function transcription_search_data(PDO $pdo): never
{
    $q = safe_text($_GET['q'] ?? '');
    if ($q === '') json_response(['query' => '', 'media' => []]);
    $like = '%' . $q . '%';
    $stmt = $pdo->prepare("SELECT m.id,m.title,m.description,m.media_type,m.filename,m.thumbnail,m.transcription,m.date_text,m.date_calendar,m.document_reference,m.document_title,m.document_url,m.document_pages,m.postcard_group,m.postcard_side,m.is_person_photo,m.media_subject_type,m.correspondence_type,m.correspondent_name,m.correspondent_json,m.correspondence_reply_to_media_id,m.created_at,
        count(ml.id) AS link_count,
        group_concat(DISTINCT CASE
            WHEN ml.entity_type='person' THEN 'Fiche individuelle'
            WHEN ml.entity_type='event' THEN trim(COALESCE(et.label,'Événement') || CASE WHEN ev.date_text<>'' THEN ' — '||ev.date_text ELSE '' END)
            WHEN ml.entity_type='census' THEN trim('Recensement ' || cr.year || CASE WHEN cr.address<>'' THEN ' — '||cr.address ELSE '' END)
            WHEN ml.entity_type='family' THEN 'Famille'
            WHEN ml.entity_type='source' THEN 'Source'
            WHEN ml.entity_type='battue_item' THEN 'Annotation de battue'
            ELSE 'Non rattaché'
        END) AS attachment_label
        FROM media m
        LEFT JOIN media_links ml ON ml.media_id=m.id
        LEFT JOIN events ev ON ml.entity_type='event' AND ev.id=ml.entity_id
        LEFT JOIN event_types et ON et.id=ev.event_type_id
        LEFT JOIN census_records cr ON ml.entity_type='census' AND cr.id=ml.entity_id
        WHERE m.transcription LIKE ? COLLATE NOCASE
        GROUP BY m.id
        ORDER BY COALESCE(m.date_text,''), m.id DESC
        LIMIT 500");
    $stmt->execute([$like]);
    $rows = $stmt->fetchAll();
    if (!$rows) json_response(['query' => $q, 'media' => []]);

    $ids = array_map(static fn($row) => (int) $row['id'], $rows);
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $peopleSql = "SELECT DISTINCT media_id, person_id, name FROM (
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN persons p ON ml.entity_type='person' AND p.id=ml.entity_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN persons p ON p.id=e.person_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN families f ON f.id=e.family_id JOIN persons p ON p.id=f.partner1_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN families f ON f.id=e.family_id JOIN persons p ON p.id=f.partner2_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id JOIN persons p ON p.id=f.partner1_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id JOIN persons p ON p.id=f.partner2_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN census_members cm ON ml.entity_type='census' AND cm.census_id=ml.entity_id JOIN persons p ON p.id=cm.person_id
        WHERE ml.media_id IN ($marks)
    ) WHERE person_id IS NOT NULL ORDER BY name";
    $people = $pdo->prepare($peopleSql);
    $people->execute(array_merge($ids, $ids, $ids, $ids, $ids, $ids, $ids));
    $peopleByMedia = [];
    foreach ($people->fetchAll() as $person) {
        $peopleByMedia[(int) $person['media_id']][] = ['id' => (int) $person['person_id'], 'name' => $person['name'] ?: 'Personne sans nom'];
    }

    foreach ($rows as &$row) {
        $mediaId = (int) $row['id'];
        $uniquePeople = [];
        foreach (($peopleByMedia[$mediaId] ?? []) as $person) $uniquePeople[(int) $person['id']] = $person;
        $row['people_links'] = array_values($uniquePeople);
        $row['attachment_label'] = $row['attachment_label'] ?: 'Non rattaché';
        $row['excerpt'] = transcription_excerpt((string) ($row['transcription'] ?? ''), $q);
    }
    unset($row);

    json_response(['query' => $q, 'media' => $rows]);
}

function parse_research_exact_date(string $value): ?DateTimeImmutable
{
    $value = trim($value);
    if ($value === '') return null;
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $value, $m)) {
        $year = (int)$m[1]; $month = (int)$m[2]; $day = (int)$m[3];
        if (checkdate($month, $day, $year)) return new DateTimeImmutable(sprintf('%04d-%02d-%02d', $year, $month, $day));
    }
    if (preg_match('/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/', $value, $m)) {
        $day = (int)$m[1]; $month = (int)$m[2]; $year = (int)$m[3];
        if (checkdate($month, $day, $year)) return new DateTimeImmutable(sprintf('%04d-%02d-%02d', $year, $month, $day));
    }
    return null;
}

function research_date_text_variants(DateTimeImmutable $date): array
{
    return [
        $date->format('Y-m-d'),
        $date->format('d/m/Y'),
        (int)$date->format('j') . '/' . (int)$date->format('n') . '/' . $date->format('Y'),
    ];
}

function expanded_exact_date_variants(array $values, string $windowMode, int $windowDays): array
{
    $windowMode = in_array($windowMode, ['before', 'after', 'both'], true) ? $windowMode : 'exact';
    $windowDays = max(0, min(365, $windowDays));
    $variants = [];
    $windowLabels = [];
    foreach ($values as $value) {
        $variants[] = mb_strtolower(trim($value));
        $date = parse_research_exact_date($value);
        if (!$date) continue;
        if ($windowMode === 'exact' || $windowDays === 0) {
            foreach (research_date_text_variants($date) as $variant) $variants[] = mb_strtolower($variant);
            $windowLabels[] = $date->format('d/m/Y');
            continue;
        }
        $start = $windowMode === 'after' ? $date : $date->modify("-{$windowDays} days");
        $end = $windowMode === 'before' ? $date : $date->modify("+{$windowDays} days");
        for ($cursor = $start; $cursor <= $end; $cursor = $cursor->modify('+1 day')) {
            foreach (research_date_text_variants($cursor) as $variant) $variants[] = mb_strtolower($variant);
        }
        $windowLabels[] = $start->format('d/m/Y') . ' — ' . $end->format('d/m/Y');
    }
    return [array_values(array_unique(array_filter($variants))), implode(' · ', array_unique($windowLabels))];
}

function date_search_data(PDO $pdo): never
{
    $mode=($_GET['mode']??'range')==='exact'?'exact':'range';$raw=safe_text($_GET['values']??'');$typeId=safe_int($_GET['event_type_id']??0);$query=safe_text($_GET['q']??'');
    $dateWindowMode=safe_text($_GET['date_window_mode']??'exact');$dateWindowDays=safe_int($_GET['date_window_days']??0);
    $values=array_values(array_unique(array_filter(array_map('trim',preg_split('/[,;\n]+/u',$raw)?:[]))));$yearFrom=safe_int($_GET['year_from']??0);$yearTo=safe_int($_GET['year_to']??0);
    $windowLabel='';
    $params=[];
    if($mode==='range'){if(!$yearFrom&&!$yearTo)json_response(['mode'=>$mode,'values'=>[],'events'=>[]]);if(!$yearFrom)$yearFrom=$yearTo;if(!$yearTo)$yearTo=$yearFrom;if($yearFrom>$yearTo)[$yearFrom,$yearTo]=[$yearTo,$yearFrom];$dateWhere='e.year IS NOT NULL AND e.year BETWEEN ? AND ?';$params=[$yearFrom,$yearTo];$values=[$yearFrom,$yearTo];}
    else{if(!$values)json_response(['mode'=>$mode,'values'=>[],'events'=>[]]);[$variants,$windowLabel]=expanded_exact_date_variants($values,$dateWindowMode,$dateWindowDays);if(!$variants)json_response(['mode'=>$mode,'values'=>$values,'windowLabel'=>'','events'=>[]]);$marks=implode(',',array_fill(0,count($variants),'?'));$dateWhere="lower(trim(e.date_text)) IN ($marks)";$params=$variants;}
    if($typeId){$dateWhere.=' AND e.event_type_id=?';$params[]=$typeId;}
    $placeId=safe_int($_GET['place_id']??0);
    if($placeId){$dateWhere.=' AND e.place_id=?';$params[]=$placeId;}
    $occupationFilter=safe_text($_GET['occupation']??'');
    if($occupationFilter!==''){$occLike='%'.$occupationFilter.'%';$dateWhere.=" AND (EXISTS(SELECT 1 FROM persons pp WHERE pp.id IN (e.person_id,f.partner1_id,f.partner2_id) AND pp.occupation LIKE ? COLLATE NOCASE) OR EXISTS(SELECT 1 FROM events eo JOIN event_types to2 ON to2.id=eo.event_type_id WHERE eo.person_id IN (e.person_id,f.partner1_id,f.partner2_id) AND to2.gedcom_tag='OCCU' AND (eo.title LIKE ? COLLATE NOCASE OR eo.description LIKE ? COLLATE NOCASE)) OR EXISTS(SELECT 1 FROM census_members cm WHERE cm.person_id IN (e.person_id,f.partner1_id,f.partner2_id) AND cm.occupation LIKE ? COLLATE NOCASE))";$params=array_merge($params,[$occLike,$occLike,$occLike,$occLike]);}
    if($query!=='')
{$like='%'.$query.'%';$dateWhere.=' AND (t.label LIKE ? COLLATE NOCASE OR pl.name LIKE ? COLLATE NOCASE OR pl.subdivision LIKE ? COLLATE NOCASE OR pl.country LIKE ? COLLATE NOCASE OR p.first_name LIKE ? COLLATE NOCASE OR p.last_name LIKE ? COLLATE NOCASE OR p1.first_name LIKE ? COLLATE NOCASE OR p1.last_name LIKE ? COLLATE NOCASE OR p2.first_name LIKE ? COLLATE NOCASE OR p2.last_name LIKE ? COLLATE NOCASE)';$params=array_merge($params,array_fill(0,10,$like));}
    $sql="SELECT e.id,e.date_text,e.year,e.person_id,e.family_id,t.label AS type,t.gedcom_tag,t.icon,t.color,pl.name AS place,pl.subdivision,pl.country,
        p.first_name,p.last_name,f.partner1_id,f.partner2_id,p1.first_name AS p1_first,p1.last_name AS p1_last,p2.first_name AS p2_first,p2.last_name AS p2_last
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN persons p ON p.id=e.person_id
        LEFT JOIN families f ON f.id=e.family_id LEFT JOIN persons p1 ON p1.id=f.partner1_id LEFT JOIN persons p2 ON p2.id=f.partner2_id
        WHERE $dateWhere ORDER BY COALESCE(e.year,9999),e.date_text,e.id LIMIT 1500";
    $stmt=$pdo->prepare($sql);$stmt->execute($params);$events=$stmt->fetchAll();
    foreach($events as &$event){$event['participants']=[];if($event['person_id'])$event['participants'][]=['id'=>(int)$event['person_id'],'name'=>trim(($event['first_name']??'').' '.($event['last_name']??''))];foreach([1,2] as $n)if($event["partner{$n}_id"]&&!array_filter($event['participants'],static fn($p)=>$p['id']==(int)$event["partner{$n}_id"]))$event['participants'][]=['id'=>(int)$event["partner{$n}_id"],'name'=>trim(($event["p{$n}_first"]??'').' '.($event["p{$n}_last"]??''))];}
    unset($event);
    json_response(['mode'=>$mode,'values'=>$values,'yearFrom'=>$yearFrom,'yearTo'=>$yearTo,'windowLabel'=>$windowLabel,'eventTypeId'=>$typeId,'events'=>$events]);
}

// Distance approximative en kilomètres entre deux points (latitude/longitude en degrés),
// via la formule de Haversine. Utilisée pour le rayon de recherche « communes voisines »
// de la recherche par proximité (SQLite n'ayant pas systématiquement les fonctions trigonométriques).
function haversine_km(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $earthRadiusKm = 6371.0;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
    $c = 2 * atan2(sqrt($a), sqrt(max(0, 1 - $a)));
    return $earthRadiusKm * $c;
}

function proximity_search_data(PDO $pdo): never
{
    // Recherche par proximité géographique et temporelle : « qui d'autre était dans cette commune à cette date ? »
    // On regroupe, pour une commune (place_id) et une période d'années données, toutes les personnes qui y
    // apparaissent (personne principale de l'événement, conjoint, ou témoin) afin de repérer des voisins/témoins récurrents.
    // Un rayon optionnel (radius_km, 0 à 50 km) permet d'inclure aussi les communes voisines géolocalisées
    // dans ce rayon, plutôt que de se limiter strictement à la commune exacte sélectionnée.
    $placeId=safe_int($_GET['place_id']??0);$dateMode=($_GET['date_mode']??'range')==='exact'?'exact':'range';$yearFrom=safe_int($_GET['year_from']??0);$yearTo=safe_int($_GET['year_to']??0);
    $exactDate=safe_text($_GET['exact_date']??'');$dateWindowMode=safe_text($_GET['date_window_mode']??'exact');$dateWindowDays=safe_int($_GET['date_window_days']??0);
    $radiusKm=isset($_GET['radius_km'])?(float)$_GET['radius_km']:0.0;
    if($radiusKm<0)$radiusKm=0.0;if($radiusKm>50)$radiusKm=50.0;
    if(!$placeId||($dateMode==='exact'?$exactDate==='':(!$yearFrom&&!$yearTo)))json_response(['placeId'=>$placeId,'placeName'=>'','yearFrom'=>$yearFrom,'yearTo'=>$yearTo,'dateLabel'=>'','radiusKm'=>$radiusKm,'people'=>[]]);
    $dateLabel='';
    $dateWhere='e.year IS NOT NULL AND e.year BETWEEN ? AND ?';
    $dateParams=[];
    if($dateMode==='exact'){
        [$dateVariants,$dateLabel]=expanded_exact_date_variants([$exactDate],$dateWindowMode,$dateWindowDays);
        if(!$dateVariants)json_response(['placeId'=>$placeId,'placeName'=>'','yearFrom'=>$yearFrom,'yearTo'=>$yearTo,'dateLabel'=>'','radiusKm'=>$radiusKm,'people'=>[]]);
        $dateWhere='lower(trim(e.date_text)) IN ('.implode(',',array_fill(0,count($dateVariants),'?')).')';
        $dateParams=$dateVariants;
    }else{
        if(!$yearFrom)$yearFrom=$yearTo;if(!$yearTo)$yearTo=$yearFrom;if($yearFrom>$yearTo)[$yearFrom,$yearTo]=[$yearTo,$yearFrom];
        $dateParams=[$yearFrom,$yearTo];
        $dateLabel=$yearFrom.' — '.$yearTo;
    }
    $excludePersonId=safe_int($_GET['exclude_person_id']??0);
    $placeStmt=$pdo->prepare("SELECT id,name,subdivision,country,latitude,longitude FROM places WHERE id=?");$placeStmt->execute([$placeId]);$place=$placeStmt->fetch();
    $placeName=$place?trim($place['name'].($place['subdivision']?', '.$place['subdivision']:'').($place['country']?', '.$place['country']:'')):'';
    $placeIds=[$placeId];
    $nearbyPlaces=[];
    $geocoded=true;
    if($radiusKm>0){
        $lat1=$place?$place['latitude']:null;$lon1=$place?$place['longitude']:null;
        if($lat1===null||$lon1===null||$lat1==='' ||$lon1===''){
            // La commune sélectionnée n'est pas géolocalisée : impossible de calculer un rayon,
            // on retombe silencieusement sur la commune exacte uniquement.
            $geocoded=false;
        }else{
            $lat1=(float)$lat1;$lon1=(float)$lon1;
            // Pré-filtre par boîte englobante (en degrés) pour limiter le nombre de communes à comparer précisément.
            $latDelta=$radiusKm/111.0;
            $lonDelta=$radiusKm/(111.0*max(0.1,cos(deg2rad($lat1))));
            $candStmt=$pdo->prepare("SELECT id,name,subdivision,country,latitude,longitude FROM places WHERE id<>? AND latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?");
            $candStmt->execute([$placeId,$lat1-$latDelta,$lat1+$latDelta,$lon1-$lonDelta,$lon1+$lonDelta]);
            foreach($candStmt->fetchAll() as $cand){
                $dist=haversine_km($lat1,$lon1,(float)$cand['latitude'],(float)$cand['longitude']);
                if($dist<=$radiusKm){
                    $placeIds[]=(int)$cand['id'];
                    $nearbyPlaces[]=['id'=>(int)$cand['id'],'name'=>trim($cand['name'].($cand['subdivision']?', '.$cand['subdivision']:'')),'distance_km'=>round($dist,1)];
                }
            }
            usort($nearbyPlaces,static fn($a,$b)=>$a['distance_km']<=>$b['distance_km']);
        }
    }
    $placeMarks=implode(',',array_fill(0,count($placeIds),'?'));
    $sql="SELECT e.id,e.date_text,e.year,e.person_id,e.family_id,t.label AS type,t.gedcom_tag,t.icon,t.color,
        pl.name AS place_name,pl.subdivision AS place_subdivision,
        p.first_name,p.last_name,f.partner1_id,f.partner2_id,p1.first_name AS p1_first,p1.last_name AS p1_last,p2.first_name AS p2_first,p2.last_name AS p2_last
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id
        LEFT JOIN places pl ON pl.id=e.place_id
        LEFT JOIN families f ON f.id=e.family_id LEFT JOIN persons p1 ON p1.id=f.partner1_id LEFT JOIN persons p2 ON p2.id=f.partner2_id
        WHERE e.place_id IN ($placeMarks) AND $dateWhere ORDER BY COALESCE(e.year,9999),e.date_text,e.id LIMIT 3000";
    $stmt=$pdo->prepare($sql);$stmt->execute(array_merge($placeIds,$dateParams));$events=$stmt->fetchAll();
    $eventIds=array_map(static fn($e)=>(int)$e['id'],$events);$witnessesByEvent=[];
    if($eventIds){$marks=implode(',',array_fill(0,count($eventIds),'?'));
        $wStmt=$pdo->prepare("SELECT ew.event_id,ew.person_id,p.first_name,p.last_name FROM event_witnesses ew JOIN persons p ON p.id=ew.person_id WHERE ew.event_id IN ($marks)");
        $wStmt->execute($eventIds);foreach($wStmt->fetchAll() as $w){$witnessesByEvent[(int)$w['event_id']][]=$w;}}
    $peopleMap=[];
    $addOccurrence=static function(int $personId,string $name,array $event,string $role) use (&$peopleMap){
        if(!$personId)return;
        if(!isset($peopleMap[$personId]))$peopleMap[$personId]=['id'=>$personId,'name'=>trim($name),'events'=>[]];
        $peopleMap[$personId]['events'][]=['id'=>(int)$event['id'],'date_text'=>$event['date_text'],'year'=>$event['year']!==null?(int)$event['year']:null,'type'=>$event['type'],'icon'=>$event['icon'],'color'=>$event['color'],'role'=>$role,'place'=>trim(($event['place_name']??'').($event['place_subdivision']?', '.$event['place_subdivision']:''))];
    };
    foreach($events as $event){
        if($event['person_id'])$addOccurrence((int)$event['person_id'],($event['first_name']??'').' '.($event['last_name']??''),$event,'principal');
        foreach([1,2] as $n){$pid=$event["partner{$n}_id"];if($pid)$addOccurrence((int)$pid,($event["p{$n}_first"]??'').' '.($event["p{$n}_last"]??''),$event,'famille');}
        foreach($witnessesByEvent[(int)$event['id']]??[] as $w){$addOccurrence((int)$w['person_id'],($w['first_name']??'').' '.($w['last_name']??''),$event,'temoin');}
    }
    if($excludePersonId)unset($peopleMap[$excludePersonId]);
    $people=array_values($peopleMap);
    foreach($people as &$person){$person['count']=count($person['events']);}
    unset($person);
    usort($people,static fn($a,$b)=>($b['count']<=>$a['count'])?:strcmp($a['name'],$b['name']));
    json_response(['placeId'=>$placeId,'placeName'=>$placeName,'dateMode'=>$dateMode,'yearFrom'=>$yearFrom,'yearTo'=>$yearTo,'dateLabel'=>$dateLabel,'excludePersonId'=>$excludePersonId,'radiusKm'=>$radiusKm,'geocoded'=>$geocoded,'nearbyPlaces'=>$nearbyPlaces,'people'=>$people]);
}

// ─── Fichier des personnes décédées de l'INSEE : import CSV + recherche dédiée ───
// Ce module est totalement indépendant de l'arbre généalogique : il ne fait que stocker et
// interroger les lignes du/des fichier(s) CSV « personnes décédées » publiés par l'INSEE
// (data.gouv.fr), afin de pouvoir chercher un décès sans avoir à ouvrir le CSV soi-même.

// Table de correspondance département → région (découpage des 13 régions depuis 2016 + DOM),
// utilisée pour permettre une recherche par région alors que le fichier INSEE ne donne que
// le code commune/département.
function insee_dept_region_map(): array
{
    return [
        '01'=>'Auvergne-Rhône-Alpes','03'=>'Auvergne-Rhône-Alpes','07'=>'Auvergne-Rhône-Alpes','15'=>'Auvergne-Rhône-Alpes','26'=>'Auvergne-Rhône-Alpes','38'=>'Auvergne-Rhône-Alpes','42'=>'Auvergne-Rhône-Alpes','43'=>'Auvergne-Rhône-Alpes','63'=>'Auvergne-Rhône-Alpes','69'=>'Auvergne-Rhône-Alpes','73'=>'Auvergne-Rhône-Alpes','74'=>'Auvergne-Rhône-Alpes',
        '21'=>'Bourgogne-Franche-Comté','25'=>'Bourgogne-Franche-Comté','39'=>'Bourgogne-Franche-Comté','58'=>'Bourgogne-Franche-Comté','70'=>'Bourgogne-Franche-Comté','71'=>'Bourgogne-Franche-Comté','89'=>'Bourgogne-Franche-Comté','90'=>'Bourgogne-Franche-Comté',
        '22'=>'Bretagne','29'=>'Bretagne','35'=>'Bretagne','56'=>'Bretagne',
        '18'=>'Centre-Val de Loire','28'=>'Centre-Val de Loire','36'=>'Centre-Val de Loire','37'=>'Centre-Val de Loire','41'=>'Centre-Val de Loire','45'=>'Centre-Val de Loire',
        '2A'=>'Corse','2B'=>'Corse',
        '08'=>'Grand Est','10'=>'Grand Est','51'=>'Grand Est','52'=>'Grand Est','54'=>'Grand Est','55'=>'Grand Est','57'=>'Grand Est','67'=>'Grand Est','68'=>'Grand Est','88'=>'Grand Est',
        '02'=>'Hauts-de-France','59'=>'Hauts-de-France','60'=>'Hauts-de-France','62'=>'Hauts-de-France','80'=>'Hauts-de-France',
        '75'=>'Île-de-France','77'=>'Île-de-France','78'=>'Île-de-France','91'=>'Île-de-France','92'=>'Île-de-France','93'=>'Île-de-France','94'=>'Île-de-France','95'=>'Île-de-France',
        '14'=>'Normandie','27'=>'Normandie','50'=>'Normandie','61'=>'Normandie','76'=>'Normandie',
        '16'=>'Nouvelle-Aquitaine','17'=>'Nouvelle-Aquitaine','19'=>'Nouvelle-Aquitaine','23'=>'Nouvelle-Aquitaine','24'=>'Nouvelle-Aquitaine','33'=>'Nouvelle-Aquitaine','40'=>'Nouvelle-Aquitaine','47'=>'Nouvelle-Aquitaine','64'=>'Nouvelle-Aquitaine','79'=>'Nouvelle-Aquitaine','86'=>'Nouvelle-Aquitaine','87'=>'Nouvelle-Aquitaine',
        '09'=>'Occitanie','11'=>'Occitanie','12'=>'Occitanie','30'=>'Occitanie','31'=>'Occitanie','32'=>'Occitanie','34'=>'Occitanie','46'=>'Occitanie','48'=>'Occitanie','65'=>'Occitanie','66'=>'Occitanie','81'=>'Occitanie','82'=>'Occitanie',
        '44'=>'Pays de la Loire','49'=>'Pays de la Loire','53'=>'Pays de la Loire','72'=>'Pays de la Loire','85'=>'Pays de la Loire',
        '04'=>"Provence-Alpes-Côte d'Azur",'05'=>"Provence-Alpes-Côte d'Azur",'06'=>"Provence-Alpes-Côte d'Azur",'13'=>"Provence-Alpes-Côte d'Azur",'83'=>"Provence-Alpes-Côte d'Azur",'84'=>"Provence-Alpes-Côte d'Azur",
        '971'=>'Guadeloupe','972'=>'Martinique','973'=>'Guyane','974'=>'La Réunion','976'=>'Mayotte',
    ];
}

// Bandeau en haut du module : nombre total de fiches en base + date du dernier import
// (pour savoir jusqu'à quelle année/mois les données sont à jour).
function insee_deces_stats(PDO $pdo): never
{
    $count = (int)$pdo->query("SELECT COUNT(*) FROM insee_deces")->fetchColumn();
    $importsCount = (int)$pdo->query("SELECT COUNT(*) FROM insee_deces_imports")->fetchColumn();
    $lastImport = $pdo->query("SELECT filename, row_count, inserted_count, max_annee_deces, imported_at FROM insee_deces_imports ORDER BY id DESC LIMIT 1")->fetch();
    // Bornes plausibles pour la plage AFFICHÉE : quelques lignes mal formées (colonnes décalées,
    // date tronquée…) peuvent produire une année de décès aberrante (ex : 1700 ou 2200) via
    // l'extraction de date. On les exclut uniquement du calcul de ce bandeau d'affichage — les
    // lignes elles-mêmes restent intactes en base et la recherche continue de toutes les couvrir.
    $plausibleMinYear = 1900;
    $plausibleMaxYear = (int)date('Y');
    $rangeStmt = $pdo->prepare("SELECT MIN(annee_deces), MAX(annee_deces) FROM insee_deces WHERE annee_deces BETWEEN ? AND ?");
    $rangeStmt->execute([$plausibleMinYear, $plausibleMaxYear]);
    [$minYearOverall, $maxYearOverall] = $rangeStmt->fetch(PDO::FETCH_NUM) ?: [null, null];
    // Dates exactes (AAAAMMJJ) aux deux extrémités (dans la même plage plausible), pour pouvoir
    // préciser le mois quand l'année la plus récente n'est pas complète (ex : fichier « en cours
    // d'année » de l'INSEE).
    $maxDateDeces = null;
    $minDateDeces = null;
    if ($maxYearOverall !== null) {
        $maxDateStmt = $pdo->prepare("SELECT date_deces FROM insee_deces WHERE annee_deces = ? AND length(date_deces) = 8 ORDER BY date_deces DESC LIMIT 1");
        $maxDateStmt->execute([$maxYearOverall]);
        $maxDateDeces = $maxDateStmt->fetchColumn();
    }
    if ($minYearOverall !== null) {
        $minDateStmt = $pdo->prepare("SELECT date_deces FROM insee_deces WHERE annee_deces = ? AND length(date_deces) = 8 ORDER BY date_deces ASC LIMIT 1");
        $minDateStmt->execute([$minYearOverall]);
        $minDateDeces = $minDateStmt->fetchColumn();
    }
    json_response([
        'count' => $count,
        'imports_count' => $importsCount,
        'max_annee_deces' => $maxYearOverall !== null && $maxYearOverall !== false ? (int)$maxYearOverall : null,
        'min_annee_deces' => $minYearOverall !== null && $minYearOverall !== false ? (int)$minYearOverall : null,
        'max_date_deces' => $maxDateDeces !== false && $maxDateDeces !== null && $maxDateDeces !== '' ? (string)$maxDateDeces : null,
        'min_date_deces' => $minDateDeces !== false && $minDateDeces !== null && $minDateDeces !== '' ? (string)$minDateDeces : null,
        'last_import' => $lastImport ?: null,
    ]);
}

// Liste complète des imports CSV déjà réalisés (nom de fichier, date, nombre de lignes lues et
// insérées, plage d'années couverte par chaque fichier) : sert à afficher au l'utilisateur le
// détail précis de ce qui a déjà été chargé dans la base, dans une fenêtre dédiée.
function insee_deces_imports_list(PDO $pdo): never
{
    $rows = $pdo->query("SELECT id, filename, row_count, inserted_count, min_annee_deces, max_annee_deces, imported_at FROM insee_deces_imports ORDER BY id DESC")->fetchAll();
    $recordsCount = (int)$pdo->query("SELECT count(*) FROM insee_deces")->fetchColumn();
    json_response(['imports' => $rows, 'records_count' => $recordsCount]);
}

// Suppression globale, volontairement découpée en lots comme la suppression d'un fichier :
// l'index INSEE peut contenir plusieurs millions de lignes et MAMP limite la durée d'une requête.
function delete_all_insee_imports(PDO $pdo, array $data): array
{
    @set_time_limit(0);
    $chunkSize = max(250, min(5000, safe_int($data['chunk_size'] ?? 5000)));
    $pdo->exec('PRAGMA busy_timeout = 10000');
    try {
        $deleted = $pdo->exec("DELETE FROM insee_deces WHERE id IN (SELECT id FROM insee_deces LIMIT $chunkSize)");
        $remaining = (bool)$pdo->query('SELECT 1 FROM insee_deces LIMIT 1')->fetchColumn();
        if (!$remaining) $pdo->exec('DELETE FROM insee_deces_imports');
    } catch (Throwable $e) {
        throw new RuntimeException('Suppression globale INSEE interrompue : ' . $e->getMessage());
    }
    return ['deleted_rows' => (int)$deleted, 'completed' => !$remaining];
}

// Suppression d'un import : retire la ligne du journal des imports ainsi que toutes les fiches
// insee_deces rattachées à ce fichier (via source_file = nom du fichier importé). Si un même nom
// de fichier a été importé plusieurs fois (réimport forcé), toutes les fiches portant ce nom de
// fichier seront supprimées avec le dernier import de ce nom restant à supprimer.
function delete_insee_import(PDO $pdo, array $data): array
{
    @set_time_limit(0);
    $id = safe_int($data['id'] ?? 0);
    if (!$id) throw new RuntimeException('Import manquant');
    $stmt = $pdo->prepare('SELECT * FROM insee_deces_imports WHERE id = ?');
    $stmt->execute([$id]);
    $import = $stmt->fetch();
    if (!$import) throw new RuntimeException('Import introuvable');
    $filename = (string)$import['filename'];
    // Une suppression peut concerner plus d'un million de lignes. On la fait
    // par lots pour ne pas provoquer de délai d'exécution PHP ni verrouiller
    // inutilement la base pendant toute l'opération.
    // MAMP coupe les requêtes FastCGI qui durent plus de 30 secondes. Des
    // petits lots rendent la suppression fiable même pour un fichier INSEE
    // contenant plusieurs centaines de milliers de décès.
    $chunkSize = max(250, min(5000, safe_int($data['chunk_size'] ?? 2000)));
    $hasOwnRows = $pdo->prepare('SELECT 1 FROM insee_deces WHERE source_import_id = ? LIMIT 1');
    $hasOwnRows->execute([$id]);
    $ownRows = (bool)$hasOwnRows->fetchColumn();
    $where = $ownRows ? 'source_import_id = ?' : 'source_file = ?';
    $value = $ownRows ? $id : $filename;
    $pdo->exec('PRAGMA busy_timeout = 10000');
    try {
        $delRows = $pdo->prepare("DELETE FROM insee_deces WHERE id IN (SELECT id FROM insee_deces WHERE $where LIMIT $chunkSize)");
        $delRows->execute([$value]);
        $deletedRows = $delRows->rowCount();
        $stillThere = $pdo->prepare("SELECT 1 FROM insee_deces WHERE $where LIMIT 1");
        $stillThere->execute([$value]);
        $completed = !$stillThere->fetchColumn();
        if ($completed) {
            if ($ownRows) {
                $pdo->prepare('DELETE FROM insee_deces_imports WHERE id = ?')->execute([$id]);
            } else {
                // Les anciens imports n'avaient pas d'identifiant de lot : un
                // même nom de fichier représente donc un seul import historique.
                $pdo->prepare('DELETE FROM insee_deces_imports WHERE filename = ?')->execute([$filename]);
            }
        }
    } catch (Throwable $e) {
        throw new RuntimeException('Suppression INSEE interrompue : ' . $e->getMessage());
    }
    return ['deleted_import_id' => $id, 'filename' => $filename, 'deleted_rows' => $deletedRows, 'completed' => $completed];
}

// Recherche combinable : prénom, nom, sexe, dates (naissance/décès, exactes ou par période),
// commune/département/région de naissance et de décès. Tous les critères renseignés se combinent (ET).
function insee_deces_search(PDO $pdo): never
{
    $nom = safe_text($_GET['nom'] ?? '');
    $prenom = safe_text($_GET['prenom'] ?? '');
    $sexe = strtoupper(safe_text($_GET['sexe'] ?? ''));
    $dateNaissance = safe_text($_GET['date_naissance'] ?? '');
    $dateDeces = safe_text($_GET['date_deces'] ?? '');
    $birthYearFrom = safe_int($_GET['birth_year_from'] ?? 0);
    $birthYearTo = safe_int($_GET['birth_year_to'] ?? 0);
    $deathYearFrom = safe_int($_GET['death_year_from'] ?? 0);
    $deathYearTo = safe_int($_GET['death_year_to'] ?? 0);
    $communeNaissance = safe_text($_GET['commune_naissance'] ?? '');
    $communeDeces = safe_text($_GET['commune_deces'] ?? '');
    $departement = safe_text($_GET['departement'] ?? '');
    $region = safe_text($_GET['region'] ?? '');
    $offset = max(0, safe_int($_GET['offset'] ?? 0));
    $limit = min(200, max(1, safe_int($_GET['limit'] ?? 100, 100)));

    $where = [];
    $params = [];
    // La base INSEE peut contenir plusieurs dizaines de millions de lignes.
    // Un LIKE "%nom%" force SQLite à parcourir l'index entier et finit par
    // épuiser le délai PHP. Les noms du fichier sont normalisés en majuscules :
    // GLOB avec une recherche par préfixe utilise directement l'index existant.
    // Exemple : DUPONT trouve DUPONT, DUPONT-MARTIN, etc.
    $inseePrefix = static function (string $value): string {
        return strtoupper(ascii_fold(trim($value))) . '*'; // les fichiers de l'INSEE sont en majuscules sans accents
    };
    if ($nom !== '') { $where[] = 'nom GLOB ?'; $params[] = $inseePrefix($nom); }
    if ($prenom !== '') { $where[] = 'prenom GLOB ?'; $params[] = $inseePrefix($prenom); }
    if ($sexe === 'M' || $sexe === 'F') { $where[] = 'sexe = ?'; $params[] = $sexe; }
    insee_add_date_filter($where, $params, 'date_naissance', 'annee_naissance', $dateNaissance);
    insee_add_date_filter($where, $params, 'date_deces', 'annee_deces', $dateDeces);
    if ($birthYearFrom || $birthYearTo) {
        if (!$birthYearFrom) $birthYearFrom = $birthYearTo;
        if (!$birthYearTo) $birthYearTo = $birthYearFrom;
        if ($birthYearFrom > $birthYearTo) [$birthYearFrom, $birthYearTo] = [$birthYearTo, $birthYearFrom];
        $where[] = 'annee_naissance BETWEEN ? AND ?'; $params[] = $birthYearFrom; $params[] = $birthYearTo;
    }
    if ($deathYearFrom || $deathYearTo) {
        if (!$deathYearFrom) $deathYearFrom = $deathYearTo;
        if (!$deathYearTo) $deathYearTo = $deathYearFrom;
        if ($deathYearFrom > $deathYearTo) [$deathYearFrom, $deathYearTo] = [$deathYearTo, $deathYearFrom];
        $where[] = 'annee_deces BETWEEN ? AND ?'; $params[] = $deathYearFrom; $params[] = $deathYearTo;
    }
    if ($communeNaissance !== '') { $where[] = 'commune_naissance LIKE ? COLLATE NOCASE'; $params[] = '%'.$communeNaissance.'%'; }
    if ($communeDeces !== '') { $where[] = 'commune_deces LIKE ? COLLATE NOCASE'; $params[] = '%'.$communeDeces.'%'; }
    if ($departement !== '') {
        $dept = strtoupper(preg_replace('/[^0-9A-Za-z]/', '', $departement));
        if ($dept !== '') { $where[] = '(code_lieu_naissance LIKE ? OR code_lieu_deces LIKE ?)'; $params[] = $dept.'%'; $params[] = $dept.'%'; }
    }
    if ($region !== '') {
        $deptToRegion = insee_dept_region_map();
        $codes = array_keys(array_filter($deptToRegion, static fn($r) => mb_stripos($r, $region) !== false));
        if ($codes) {
            $ors = [];
            foreach ($codes as $code) { $ors[] = 'code_lieu_naissance LIKE ?'; $params[] = $code.'%'; $ors[] = 'code_lieu_deces LIKE ?'; $params[] = $code.'%'; }
            $where[] = '('.implode(' OR ', $ors).')';
        } else {
            $where[] = '0=1'; // région non reconnue : aucun résultat plutôt que tout renvoyer
        }
    }

    if (!$where) { json_response(['total' => 0, 'rows' => [], 'has_more' => false, 'offset' => $offset, 'limit' => $limit, 'no_criteria' => true]); }

    $sqlWhere = implode(' AND ', $where);
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM insee_deces WHERE $sqlWhere");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    $rowsStmt = $pdo->prepare("SELECT id,nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,pays_naissance,date_deces,annee_deces,code_lieu_deces,commune_deces,numero_acte_deces
        FROM insee_deces WHERE $sqlWhere ORDER BY annee_deces DESC, nom, prenom LIMIT $limit OFFSET $offset");
    $rowsStmt->execute($params);
    $rows = $rowsStmt->fetchAll();

    json_response(['total' => $total, 'rows' => $rows, 'has_more' => ($offset + $limit) < $total, 'offset' => $offset, 'limit' => $limit]);
}

function insee_add_date_filter(array &$where, array &$params, string $dateColumn, string $yearColumn, string $value): void
{
    $digits = preg_replace('/\D/', '', $value) ?? '';
    if ($digits === '') return;
    $ors = [];
    $variants = [$digits];
    if (strlen($digits) === 8) {
        // Une date précise : le jour exact, pas toute l'année. L'utilisateur tape souvent JJ/MM/AAAA,
        // les fichiers INSEE stockent AAAAMMJJ ; l'année (indexée) restreint la recherche.
        $iso = (int) substr($digits, 0, 4) >= 1700 ? $digits : substr($digits, 4, 4) . substr($digits, 2, 2) . substr($digits, 0, 2);
        $year = (int) substr($iso, 0, 4);
        if ($year >= 1700 && $year <= 2200) { $where[] = "$yearColumn = ?"; $params[] = $year; }
        $where[] = "$dateColumn = ?"; $params[] = $iso;
        return;
    } elseif (strlen($digits) === 4) {
        $year = (int)$digits;
        if ($year >= 1700 && $year <= 2200) { $ors[] = "$yearColumn = ?"; $params[] = $year; }
    }
    foreach (array_values(array_unique($variants)) as $variant) {
        $ors[] = "$dateColumn LIKE ?";
        $params[] = '%' . $variant . '%';
    }
    if ($ors) $where[] = '(' . implode(' OR ', $ors) . ')';
}

// Import d'un fichier CSV « personnes décédées » de l'INSEE (un fichier à la fois ; le front-end
// peut appeler cette action plusieurs fois de suite pour importer plusieurs fichiers). Détecte
// automatiquement le séparateur et les intitulés de colonnes (les variantes rencontrées selon la
// source : nom/prenom/sexe/datenaiss/lieunaiss/commnaiss/paysnaiss/datedeces/lieudeces/commdeces/actedeces).
// Les fichiers anciens (~1970-1999) combinent nom et prénom(s) dans une seule colonne « nomprenom »
// au format NOM*PRENOM1 PRENOM2.../ : cette colonne est détectée et automatiquement séparée.
function insee_deces_import(PDO $pdo): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { json_response(['error' => 'POST requis'], 405); }
    $file = $_FILES['file'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK) { json_response(['error' => upload_failure_message($file)], 422); }
    $originalName = (string)($file['name'] ?? 'import.csv');
    @set_time_limit(0);
    @ini_set('memory_limit', '1024M');
    $tmpPath = (string)$file['tmp_name'];
    $cleanupPath = '';
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if ($ext === 'zip') {
        if (!class_exists('ZipArchive')) json_response(['error' => "Import ZIP impossible : l'extension PHP ZipArchive n'est pas disponible."], 422);
        $zip = new ZipArchive();
        if ($zip->open($tmpPath) !== true) json_response(['error' => 'Archive ZIP illisible'], 422);
        $entryName = '';
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string)$zip->getNameIndex($i);
            if (preg_match('/\.(csv|txt)$/i', $name)) { $entryName = $name; break; }
        }
        if ($entryName === '') { $zip->close(); json_response(['error' => 'Aucun fichier .csv ou .txt trouvé dans le ZIP'], 422); }
        $stream = $zip->getStream($entryName);
        if (!$stream) { $zip->close(); json_response(['error' => 'Lecture du fichier INSEE dans le ZIP impossible'], 422); }
        $cleanupPath = tempnam(sys_get_temp_dir(), 'insee-deces-') ?: '';
        if ($cleanupPath === '') { fclose($stream); $zip->close(); json_response(['error' => 'Création du fichier temporaire impossible'], 500); }
        $out = fopen($cleanupPath, 'wb');
        if (!$out) { fclose($stream); $zip->close(); @unlink($cleanupPath); json_response(['error' => 'Écriture du fichier temporaire impossible'], 500); }
        stream_copy_to_stream($stream, $out);
        fclose($out);
        fclose($stream);
        $zip->close();
        // fichier en positions fixes (.txt de data.gouv.fr) : converti en CSV comme un .txt téléchargé
        if (preg_match('/\.txt$/i', $entryName)) {
            try { $csvPath = insee_fixed_width_to_csv($cleanupPath); } catch (Throwable $e) { @unlink($cleanupPath); json_response(['error' => 'Lecture du fichier INSEE impossible : ' . $e->getMessage()], 422); }
            if ($csvPath !== '') { @unlink($cleanupPath); $cleanupPath = $csvPath; }
        }
        $tmpPath = $cleanupPath;
        $originalName .= ' / ' . basename($entryName);
    }

    // Protection anti double-import : on calcule l'empreinte du contenu du fichier (indépendante
    // du nom, pour détecter aussi un fichier renommé) et on la compare aux imports déjà enregistrés.
    // Si une correspondance existe, on bloque par défaut et on prévient le front-end (qui peut
    // renvoyer la requête avec force=1 si l'utilisateur confirme vouloir importer quand même).
    $fileHash = (string)(hash_file('sha256', $tmpPath) ?: '');
    $force = filter_var($_POST['force'] ?? false, FILTER_VALIDATE_BOOLEAN);
    if ($fileHash !== '' && !$force) {
        $dupStmt = $pdo->prepare("SELECT filename, imported_at, inserted_count FROM insee_deces_imports WHERE file_hash = ? ORDER BY id DESC LIMIT 1");
        $dupStmt->execute([$fileHash]);
        $dup = $dupStmt->fetch();
        if ($dup) {
            if ($cleanupPath !== '') @unlink($cleanupPath);
            json_response([
                'error' => "Ce fichier semble déjà avoir été importé (« " . $dup['filename'] . " » le " . $dup['imported_at'] . ", " . (int)$dup['inserted_count'] . " ligne(s)). Confirme si tu veux l'importer quand même.",
                'duplicate' => true,
                'existing_import' => $dup,
            ], 409);
        }
    }

    $handle = fopen($tmpPath, 'r');
    if (!$handle) { if ($cleanupPath !== '') @unlink($cleanupPath); json_response(['error' => 'Lecture du fichier impossible'], 500); }

    $firstLine = fgets($handle);
    if ($firstLine === false) { fclose($handle); if ($cleanupPath !== '') @unlink($cleanupPath); json_response(['error' => 'Fichier vide'], 422); }
    $firstLine = preg_replace('/^\xEF\xBB\xBF/', '', $firstLine) ?? $firstLine; // retire un éventuel BOM UTF-8
    $counts = [';' => substr_count($firstLine, ';'), ',' => substr_count($firstLine, ','), "\t" => substr_count($firstLine, "\t")];
    arsort($counts);
    $delimiter = array_key_first($counts) ?: ';';
    if (($counts[$delimiter] ?? 0) === 0) $delimiter = ';';

    $headers = str_getcsv($firstLine, $delimiter);
    $normalize = static function (string $s): string {
        $s = strtolower(trim($s));
        $s = strtr($s, ['é'=>'e','è'=>'e','ê'=>'e','ë'=>'e','à'=>'a','â'=>'a','î'=>'i','ï'=>'i','ô'=>'o','ù'=>'u','û'=>'u','ü'=>'u','ç'=>'c']);
        return preg_replace('/[^a-z0-9]/', '', $s) ?? '';
    };
    $fieldAliases = [
        'nom' => ['nom'],
        'prenom' => ['prenom', 'prenoms'],
        'nomprenom' => ['nomprenom', 'nomsprenom', 'nomprenoms'],
        'sexe' => ['sexe'],
        'date_naissance' => ['datenaiss', 'datenaissance'],
        'code_lieu_naissance' => ['lieunaiss', 'codelieunaissance', 'codeinseenaissance', 'codenaissance'],
        'commune_naissance' => ['commnaiss', 'communenaissance', 'villenaissance', 'libcommnaiss'],
        'pays_naissance' => ['paysnaiss', 'paysnaissance'],
        'date_deces' => ['datedeces'],
        'code_lieu_deces' => ['lieudeces', 'codelieudeces', 'codeinseedeces', 'codedeces'],
        'commune_deces' => ['commdeces', 'communedeces', 'villedeces', 'libcommdeces'],
        'numero_acte_deces' => ['actedeces', 'numeroactedeces', 'numacte', 'numactedeces'],
    ];
    $columnIndex = [];
    foreach ($headers as $i => $h) {
        $n = $normalize((string)$h);
        foreach ($fieldAliases as $field => $aliases) {
            if (isset($columnIndex[$field])) continue;
            if (in_array($n, $aliases, true)) { $columnIndex[$field] = $i; }
        }
    }
    // Les lots anciens du fichier des décès utilisent le format compact
    // nomprenom;sexe;datenaiss;... (sans colonne prénom séparée). Certains
    // exporteurs livrent cette ligne d'en-tête avec des variantes que le jeu
    // d'alias ci-dessus ne reconnaît pas toujours : on force alors son ordre
    // officiel, afin de ne pas décaler toutes les dates d'une colonne.
    $normalizedHeaders = array_map(static fn($value) => $normalize((string)$value), $headers);
    $hasCombinedHeader = in_array('nomprenom', $normalizedHeaders, true)
        || in_array('nomsprenoms', $normalizedHeaders, true)
        || in_array('nomprenoms', $normalizedHeaders, true);
    if ($hasCombinedHeader && count($headers) >= 10) {
        $columnIndex = [
            'nomprenom' => 0,
            'sexe' => 1,
            'date_naissance' => 2,
            'code_lieu_naissance' => 3,
            'commune_naissance' => 4,
            'pays_naissance' => 5,
            'date_deces' => 6,
            'code_lieu_deces' => 7,
            'commune_deces' => 8,
            'numero_acte_deces' => 9,
        ];
    }
    if (!isset($columnIndex['nom']) && !isset($columnIndex['prenom']) && !isset($columnIndex['nomprenom'])) {
        // Les fichiers officiels de l'INSEE (deces-AAAA.csv) n'ont pas de ligne d'en-tête : la première
        // ligne lue ci-dessus est en réalité déjà une ligne de données. On retente en supposant l'ordre
        // standard des colonnes du fichier des personnes décédées, et on relit le fichier depuis le début
        // pour ne pas perdre cette première ligne.
        if (count($headers) >= 8) {
            $looksLikeCompactOldFile = count($headers) >= 10
                && (str_contains((string)($headers[0] ?? ''), '*') || in_array(trim((string)($headers[1] ?? '')), ['1', '2', 'M', 'F'], true));
            $columnIndex = $looksLikeCompactOldFile ? [
                'nomprenom' => 0,
                'sexe' => 1,
                'date_naissance' => 2,
                'code_lieu_naissance' => 3,
                'commune_naissance' => 4,
                'pays_naissance' => 5,
                'date_deces' => 6,
                'code_lieu_deces' => 7,
                'commune_deces' => 8,
                'numero_acte_deces' => 9,
            ] : [
                'nom' => 0,
                'prenom' => 1,
                'sexe' => 2,
                'date_naissance' => 3,
                'code_lieu_naissance' => 4,
                'commune_naissance' => 5,
                'pays_naissance' => 6,
                'date_deces' => 7,
                'code_lieu_deces' => 8,
                'commune_deces' => 9,
                'numero_acte_deces' => 10,
            ];
            rewind($handle);
        } else {
            fclose($handle);
            if ($cleanupPath !== '') @unlink($cleanupPath);
            json_response(['error' => "Colonnes non reconnues : ce fichier ne ressemble pas au fichier des personnes décédées de l'INSEE (colonnes attendues, avec ou sans en-tête : nom, prenom (ou nomprenom combiné), sexe, datenaiss, lieunaiss, commnaiss, paysnaiss, datedeces, lieudeces, commdeces, actedeces)."], 422);
        }
    }

    // Fichiers anciens (années 1970 à ~1999) : une seule colonne « nomprenom » combine nom et
    // prénom(s), au format NOM*PRENOM1 PRENOM2.../ (astérisque entre nom et prénoms, slash final).
    $splitNomPrenom = static function (string $raw): array {
        $raw = rtrim(trim($raw), '/');
        $parts = explode('*', $raw, 2);
        $nom = trim($parts[0] ?? '');
        $prenomsRaw = trim($parts[1] ?? '');
        return [$nom, $prenomsRaw];
    };

    // Fichiers très volumineux (700 000+ lignes) : les limites PHP ont été desserrées au début
    // pour éviter un arrêt en cours d'import.

    $get = static function (array $row, ?int $index): string {
        if ($index === null || !isset($row[$index])) return '';
        return trim((string)$row[$index]);
    };
    $extractYear = static function (string $date): ?int {
        $digits = preg_replace('/\D/', '', $date) ?? '';
        if (strlen($digits) >= 4) {
            $year = (int)substr($digits, 0, 4);
            if ($year >= 1700 && $year <= 2200) return $year;
        }
        return null;
    };

    $insert = $pdo->prepare("INSERT INTO insee_deces
        (nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,pays_naissance,date_deces,annee_deces,code_lieu_deces,commune_deces,numero_acte_deces,source_file,source_import_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");

    $inserted = 0; $rowCount = 0; $maxAnneeDeces = null; $minAnneeDeces = null;
    $logInsert = $pdo->prepare("INSERT INTO insee_deces_imports(filename,row_count,inserted_count,max_annee_deces,min_annee_deces,file_hash) VALUES (?,?,?,?,?,?)");
    $pdo->beginTransaction();
    try {
        // On crée le journal avant les lignes afin d'associer chaque ligne à
        // cet import précis, même si un CSV de même nom est importé plus tard.
        // l'empreinte n'est notée qu'à la fin : un import coupé ne doit pas passer pour « déjà importé »
        $logInsert->execute([$originalName, 0, 0, null, null, '']);
        $importId = (int)$pdo->lastInsertId();
        $inseeDone = false;
        register_shutdown_function(static function () use ($pdo, &$importId, &$inseeDone): void {
            if ($inseeDone || !$importId) return; // arrêté en route (délai dépassé…) : on retire ce qui a été écrit
            try {
                if ($pdo->inTransaction()) $pdo->rollBack();
                $pdo->prepare('DELETE FROM insee_deces WHERE source_import_id=?')->execute([$importId]);
                $pdo->prepare('DELETE FROM insee_deces_imports WHERE id=?')->execute([$importId]);
            } catch (Throwable $_) {}
        });
        while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
            if ($row === null) continue;
            if (count($row) === 1 && trim((string)($row[0] ?? '')) === '') continue; // ligne vide
            $rowCount++;
            if (isset($columnIndex['nomprenom'])) {
                [$nomFromCombined, $prenomRaw] = $splitNomPrenom($get($row, $columnIndex['nomprenom']));
            } else {
                $nomFromCombined = null;
                $prenomRaw = $get($row, $columnIndex['prenom'] ?? null);
            }
            $prenomsList = array_values(array_filter(array_map('trim', preg_split('/[\/,]+/', $prenomRaw) ?: [])));
            $prenom = $prenomsList[0] ?? $prenomRaw;
            $sexeRaw = $get($row, $columnIndex['sexe'] ?? null);
            $sexe = $sexeRaw === '1' ? 'M' : ($sexeRaw === '2' ? 'F' : strtoupper(substr($sexeRaw, 0, 1)));
            $dateNaiss = $get($row, $columnIndex['date_naissance'] ?? null);
            $dateDeces = $get($row, $columnIndex['date_deces'] ?? null);
            $anneeNaiss = $extractYear($dateNaiss);
            $anneeDeces = $extractYear($dateDeces);
            if ($anneeDeces !== null && ($maxAnneeDeces === null || $anneeDeces > $maxAnneeDeces)) $maxAnneeDeces = $anneeDeces;
            if ($anneeDeces !== null && ($minAnneeDeces === null || $anneeDeces < $minAnneeDeces)) $minAnneeDeces = $anneeDeces;
            $insert->execute([
                $nomFromCombined ?? $get($row, $columnIndex['nom'] ?? null),
                $prenom,
                $prenomRaw,
                $sexe,
                $dateNaiss,
                $anneeNaiss,
                $get($row, $columnIndex['code_lieu_naissance'] ?? null),
                $get($row, $columnIndex['commune_naissance'] ?? null),
                $get($row, $columnIndex['pays_naissance'] ?? null),
                $dateDeces,
                $anneeDeces,
                $get($row, $columnIndex['code_lieu_deces'] ?? null),
                $get($row, $columnIndex['commune_deces'] ?? null),
                $get($row, $columnIndex['numero_acte_deces'] ?? null),
                $originalName,
                $importId,
            ]);
            $inserted++;
            if ($inserted % 2000 === 0) { $pdo->commit(); $pdo->beginTransaction(); }
        }
        $pdo->prepare("UPDATE insee_deces_imports SET row_count=?, inserted_count=?, max_annee_deces=?, min_annee_deces=?, file_hash=? WHERE id=?")
            ->execute([$rowCount, $inserted, $maxAnneeDeces, $minAnneeDeces, $fileHash, $importId]);
        $pdo->commit();
        $inseeDone = true;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        // les paquets de 2 000 lignes déjà enregistrés sont retirés : rien d'un import à moitié fait
        if (!empty($importId)) { try { $pdo->prepare('DELETE FROM insee_deces WHERE source_import_id=?')->execute([$importId]); $pdo->prepare('DELETE FROM insee_deces_imports WHERE id=?')->execute([$importId]); } catch (Throwable $_) {} }
        $inseeDone = true;
        fclose($handle);
        if ($cleanupPath !== '') @unlink($cleanupPath);
        json_response(['error' => 'Import interrompu : ' . $e->getMessage()], 500);
    }
    fclose($handle);
    if ($cleanupPath !== '') @unlink($cleanupPath);

    json_response(['ok' => true, 'filename' => $originalName, 'rows' => $rowCount, 'inserted' => $inserted, 'max_annee_deces' => $maxAnneeDeces, 'min_annee_deces' => $minAnneeDeces]);
}

function related_ids(PDO $pdo, int $id, int $up, int $down, bool $partners): array
{
    $ids = [$id => true];

    $frontier = [$id];
    for ($level=0; $level<$up; $level++) {
        if (!$frontier) break;
        $marks = implode(',', array_fill(0, count($frontier), '?'));
        $stmt = $pdo->prepare("SELECT f.partner1_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id IN ($marks) UNION SELECT f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id IN ($marks)");
        $stmt->execute(array_merge($frontier,$frontier));
        $frontier=[];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $pid) if ($pid && !isset($ids[$pid])) {$ids[(int)$pid]=true;$frontier[]=(int)$pid;}
    }
    $frontier = [$id];
    for ($level=0; $level<$down; $level++) {
        if (!$frontier) break;
        $marks = implode(',', array_fill(0, count($frontier), '?'));
        $stmt=$pdo->prepare("SELECT fc.child_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id IN ($marks) OR f.partner2_id IN ($marks)");
        $stmt->execute(array_merge($frontier,$frontier));
        $frontier=[];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $pid) if ($pid && !isset($ids[$pid])) {$ids[(int)$pid]=true;$frontier[]=(int)$pid;}
    }
    if ($partners) {
        $base=array_keys($ids);$marks=implode(',',array_fill(0,count($base),'?'));
        $stmt=$pdo->prepare("SELECT CASE WHEN partner1_id IN ($marks) THEN partner2_id ELSE partner1_id END FROM families WHERE partner1_id IN ($marks) OR partner2_id IN ($marks)");
        $stmt->execute(array_merge($base,$base,$base));
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $pid) if ($pid) $ids[(int)$pid]=true;
    }
    return array_keys($ids);
}

function timeline_data(PDO $pdo, int $id): never
{
    $ids = related_ids($pdo,$id,min(10,max(0,safe_int($_GET['up']??2))),min(10,max(0,safe_int($_GET['down']??2))),($_GET['partners']??'1')==='1');
    if (!$ids) json_response(['events'=>[]]);
    $marks=implode(',',array_fill(0,count($ids),'?'));
    // les événements de couple (mariage, divorce…) comptent aussi, une seule fois même si les deux conjoints sont là
    $couple="trim(COALESCE(p1.first_name,'')||' '||COALESCE(p1.last_name,''))||CASE WHEN p2.id IS NOT NULL THEN ' & '||trim(COALESCE(p2.first_name,'')||' '||COALESCE(p2.last_name,'')) ELSE '' END";
    $sql="SELECT e.id,e.date_text,e.year,t.label AS type,t.color,COALESCE(p.id,CASE WHEN f.partner1_id IN ($marks) THEN f.partner1_id ELSE f.partner2_id END) AS person_id,CASE WHEN p.id IS NULL THEN $couple ELSE p.first_name END AS first_name,CASE WHEN p.id IS NULL THEN '' ELSE p.last_name END AS last_name,pl.name AS place
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN families f ON f.id=e.family_id LEFT JOIN persons p1 ON p1.id=f.partner1_id LEFT JOIN persons p2 ON p2.id=f.partner2_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE (e.person_id IN ($marks) OR f.partner1_id IN ($marks) OR f.partner2_id IN ($marks)) AND e.year IS NOT NULL ORDER BY e.year,e.id";
    $stmt=$pdo->prepare($sql);$stmt->execute([...$ids,...$ids,...$ids,...$ids]);
    json_response(['events'=>$stmt->fetchAll(),'peopleCount'=>count($ids)]);
}

function timeline_people_data(PDO $pdo, int $id): never
{
    if (!$id) json_response(['partners'=>[],'siblings'=>[]]);
    $rows = static function(array $ids) use ($pdo): array {
        $ids = array_values(array_unique(array_filter(array_map('intval',$ids))));
        if (!$ids) return [];
        $marks=implode(',',array_fill(0,count($ids),'?'));
        $stmt=$pdo->prepare(person_select()." WHERE p.id IN ($marks)");$stmt->execute($ids);
        $found=[];foreach($stmt->fetchAll() as $person)$found[(int)$person['id']]=$person;
        return array_values(array_filter(array_map(static fn($personId)=>$found[$personId]??null,$ids)));
    };
    $stmt=$pdo->prepare('SELECT CASE WHEN partner1_id=? THEN partner2_id ELSE partner1_id END AS person_id FROM families WHERE partner1_id=? OR partner2_id=?');
    $stmt->execute([$id,$id,$id]);$partners=$rows(array_column($stmt->fetchAll(),'person_id'));
    $stmt=$pdo->prepare('SELECT DISTINCT other.child_id AS person_id FROM family_children mine JOIN family_children other ON other.family_id=mine.family_id AND other.child_id<>mine.child_id WHERE mine.child_id=?');
    $stmt->execute([$id]);$siblings=$rows(array_column($stmt->fetchAll(),'person_id'));
    json_response(['partners'=>$partners,'siblings'=>$siblings]);
}

function compute_issues(PDO $pdo): array
{
    $rows=$pdo->query("SELECT p.id,p.first_name,p.last_name,
        min(CASE WHEN t.gedcom_tag='BIRT' THEN e.year END) birth_year,
        min(CASE WHEN t.gedcom_tag='DEAT' THEN e.year END) death_year
        FROM persons p LEFT JOIN events e ON e.person_id=p.id LEFT JOIN event_types t ON t.id=e.event_type_id GROUP BY p.id")->fetchAll();
    $issues=[];$current=(int)date('Y');
    foreach($rows as $r){
        $birth=$r['birth_year']!==null?(int)$r['birth_year']:null;$death=$r['death_year']!==null?(int)$r['death_year']:null;
        $name=trim($r['first_name'].' '.$r['last_name']);
        if($birth&&$death&&$death<$birth)$issues[]=['key'=>"death-before-birth:{$r['id']}",'severity'=>'error','person_id'=>(int)$r['id'],'title'=>'Décès antérieur à la naissance','detail'=>"{$name} : naissance {$birth}, décès {$death}."];
        if($birth&&$birth>$current)$issues[]=['key'=>"future-birth:{$r['id']}",'severity'=>'error','person_id'=>(int)$r['id'],'title'=>'Naissance dans le futur','detail'=>"{$name} : {$birth}."];
        if($birth&&$death&&$death-$birth>115)$issues[]=['key'=>"lifespan:{$r['id']}",'severity'=>'warning','person_id'=>(int)$r['id'],'title'=>'Longévité supérieure à 115 ans','detail'=>"{$name} : ".($death-$birth)." ans."];
    }
    $parentIssues=$pdo->query("SELECT c.id child_id,trim(c.first_name||' '||c.last_name) child_name,cb.year child_birth,p.id parent_id,trim(p.first_name||' '||p.last_name) parent_name,pb.year parent_birth
      FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN persons c ON c.id=fc.child_id
      JOIN persons p ON p.id=f.partner1_id OR p.id=f.partner2_id
      LEFT JOIN events cb ON cb.person_id=c.id AND cb.event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag='BIRT')
      LEFT JOIN events pb ON pb.person_id=p.id AND pb.event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag='BIRT')
      WHERE cb.year IS NOT NULL AND pb.year IS NOT NULL AND cb.year-pb.year<12 LIMIT 500")->fetchAll();
    foreach($parentIssues as $r){
        $age=(int)$r['child_birth']-(int)$r['parent_birth'];
        // Même clé qu'avant : une exception déjà mémorisée reste valable.
        $issues[]=$age<=0
            ?['key'=>"young-parent:{$r['parent_id']}:{$r['child_id']}",'severity'=>'error','person_id'=>(int)$r['parent_id'],'title'=>'Parent né après son enfant','detail'=>"{$r['parent_name']} (né en {$r['parent_birth']}) est indiqué comme parent de {$r['child_name']} (né en {$r['child_birth']}) : date ou filiation à vérifier."]
            :['key'=>"young-parent:{$r['parent_id']}:{$r['child_id']}",'severity'=>'warning','person_id'=>(int)$r['parent_id'],'title'=>'Âge parental improbable','detail'=>"{$r['parent_name']} aurait {$age} an".($age>1?'s':'')." à la naissance de {$r['child_name']}."];
    }
    $afterDeath=$pdo->query("SELECT c.id child_id,trim(c.first_name||' '||c.last_name) child_name,cb.year child_birth,p.id parent_id,trim(p.first_name||' '||p.last_name) parent_name,pd.year parent_death
      FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN persons c ON c.id=fc.child_id
      JOIN persons p ON p.id=f.partner1_id OR p.id=f.partner2_id
      JOIN events cb ON cb.person_id=c.id AND cb.event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag='BIRT')
      JOIN events pd ON pd.person_id=p.id AND pd.event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag='DEAT')
      WHERE cb.year IS NOT NULL AND pd.year IS NOT NULL AND cb.year>pd.year+1 LIMIT 500")->fetchAll();
    foreach($afterDeath as $r)$issues[]=['key'=>"child-after-parent-death:{$r['parent_id']}:{$r['child_id']}",'severity'=>'error','person_id'=>(int)$r['parent_id'],'title'=>'Enfant né après le décès du parent','detail'=>"{$r['child_name']} naît en {$r['child_birth']}, après le décès de {$r['parent_name']} en {$r['parent_death']}."];
    $marriageAfterDeath=$pdo->query("SELECT e.id event_id,e.year marriage_year,p.id person_id,trim(p.first_name||' '||p.last_name) person_name,d.year death_year
      FROM events e JOIN families f ON f.id=e.family_id JOIN persons p ON p.id=f.partner1_id OR p.id=f.partner2_id
      JOIN events d ON d.person_id=p.id AND d.event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag='DEAT')
      WHERE e.event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag IN ('MARR','MRCI','MRRE')) AND e.year IS NOT NULL AND d.year IS NOT NULL AND e.year>d.year LIMIT 500")->fetchAll();
    foreach($marriageAfterDeath as $r)$issues[]=['key'=>"marriage-after-death:{$r['person_id']}:{$r['event_id']}",'severity'=>'error','person_id'=>(int)$r['person_id'],'title'=>'Mariage après décès','detail'=>"{$r['person_name']} a un mariage en {$r['marriage_year']} après un décès en {$r['death_year']}."];
    $closeChildren=$pdo->query("SELECT f.id family_id,c1.id child1_id,c2.id child2_id,trim(c1.first_name||' '||c1.last_name) child1,trim(c2.first_name||' '||c2.last_name) child2,b1.year y1,b2.year y2
      FROM family_children fc1 JOIN family_children fc2 ON fc1.family_id=fc2.family_id AND fc1.child_id<fc2.child_id
      JOIN families f ON f.id=fc1.family_id JOIN persons c1 ON c1.id=fc1.child_id JOIN persons c2 ON c2.id=fc2.child_id
      JOIN events b1 ON b1.person_id=c1.id AND b1.event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag='BIRT')
      JOIN events b2 ON b2.person_id=c2.id AND b2.event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag='BIRT')
      WHERE b1.year IS NOT NULL AND b2.year IS NOT NULL AND abs(b1.year-b2.year)=0 LIMIT 300")->fetchAll();
    foreach($closeChildren as $r)$issues[]=['key'=>"same-year-siblings:{$r['family_id']}:{$r['child1_id']}:{$r['child2_id']}",'severity'=>'warning','person_id'=>(int)$r['child1_id'],'title'=>'Deux enfants la même année','detail'=>"{$r['child1']} et {$r['child2']} ont la même année de naissance ({$r['y1']}). Possible jumeaux, doublon ou date approximative."];
    $dateConflicts = $pdo->query("SELECT p.id,trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) AS person_name,t.gedcom_tag,
            group_concat(DISTINCT e.year) AS years,count(DISTINCT e.year) AS year_count
        FROM persons p JOIN events e ON e.person_id=p.id JOIN event_types t ON t.id=e.event_type_id
        WHERE t.gedcom_tag IN ('BIRT','DEAT') AND e.year IS NOT NULL
        GROUP BY p.id,t.gedcom_tag HAVING count(DISTINCT e.year)>1 LIMIT 300")->fetchAll();
    foreach($dateConflicts as $r){
        $kind = $r['gedcom_tag']==='BIRT' ? 'naissance' : 'décès';
        $issues[]=['key'=>"conflicting-{$kind}-date:{$r['id']}",'severity'=>'warning','person_id'=>(int)$r['id'],'title'=>'Dates de '.$kind.' contradictoires','detail'=>trim((string)$r['person_name']).' : '.str_replace(',',' / ',(string)$r['years']).'.'];
    }
    $placeConflicts = $pdo->query("SELECT p.id,trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) AS person_name,t.gedcom_tag,
            group_concat(DISTINCT pl.name) AS places,count(DISTINCT e.place_id) AS place_count
        FROM persons p JOIN events e ON e.person_id=p.id JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
        WHERE t.gedcom_tag IN ('BIRT','DEAT')
        GROUP BY p.id,t.gedcom_tag HAVING count(DISTINCT e.place_id)>1 LIMIT 300")->fetchAll();
    foreach($placeConflicts as $r){
        $kind = $r['gedcom_tag']==='BIRT' ? 'naissance' : 'décès';
        $issues[]=['key'=>"conflicting-{$kind}-place:{$r['id']}",'severity'=>'warning','person_id'=>(int)$r['id'],'title'=>'Lieux de '.$kind.' contradictoires','detail'=>trim((string)$r['person_name']).' : '.str_replace(',',' / ',(string)$r['places']).'.'];
    }
    $multipleParents = $pdo->query("SELECT c.id,trim(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS person_name,
            count(DISTINCT fc.family_id) AS family_count
        FROM family_children fc JOIN persons c ON c.id=fc.child_id
        GROUP BY c.id HAVING count(DISTINCT fc.family_id)>1 LIMIT 300")->fetchAll();
    foreach(date_check_issues($pdo) as $issue)$issues[]=$issue;
    foreach($multipleParents as $r)$issues[]=['key'=>"multiple-parent-families:{$r['id']}",'severity'=>'warning','person_id'=>(int)$r['id'],'title'=>'Filiations multiples à vérifier','detail'=>trim((string)$r['person_name']).' est rattaché(e) à '.(int)$r['family_count'].' familles. Cela peut être voulu (adoption, recomposition) ou contradictoire.'];
    return $issues;
}

/** Jour, mois et année d'une date écrite (12/03/1850, 1850-03-12, 12 mars 1850) ; null si ce n'est pas une date complète */
function date_text_parts(string $text): ?array
{
    $v = mb_strtolower(trim($text));
    if (preg_match('/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{3,4})$/', $v, $m)) { return [(int) $m[1], (int) $m[2], (int) $m[3]]; }
    if (preg_match('/^(\d{3,4})-(\d{1,2})-(\d{1,2})$/', $v, $m)) { return [(int) $m[3], (int) $m[2], (int) $m[1]]; }
    $months = ['janvier' => 1, 'février' => 2, 'fevrier' => 2, 'mars' => 3, 'avril' => 4, 'mai' => 5, 'juin' => 6, 'juillet' => 7, 'août' => 8, 'aout' => 8, 'septembre' => 9, 'octobre' => 10, 'novembre' => 11, 'décembre' => 12, 'decembre' => 12];
    if (preg_match('/^(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{3,4})$/u', $v, $m) && isset($months[$m[2]])) { return [(int) $m[1], $months[$m[2]], (int) $m[3]]; }
    return null;
}

/** Vérification des dates : jours qui n'existent pas, événements avant la naissance ou après le décès, mariage trop jeune, parent trop âgé */
function date_check_issues(PDO $pdo): array
{
    $issues = [];
    // une seule lecture : nom, sexe, année de naissance et de décès de chacun (la liste sert aussi au tableau de bord : il faut que ce soit rapide)
    $who = [];
    foreach ($pdo->query("SELECT id,gender,trim(COALESCE(first_name,'')||' '||COALESCE(last_name,'')) AS n FROM persons") as $r) { $who[(int) $r['id']] = ['n' => $r['n'] !== '' ? $r['n'] : 'Personne sans nom', 'g' => (string) $r['gender'], 'b' => null, 'd' => null]; }
    foreach ($pdo->query("SELECT e.person_id,t.gedcom_tag,min(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.person_id IS NOT NULL AND e.year IS NOT NULL AND t.gedcom_tag IN ('BIRT','DEAT') GROUP BY e.person_id,t.gedcom_tag") as $r) {
        $id = (int) $r['person_id']; if (isset($who[$id])) { $who[$id][$r['gedcom_tag'] === 'BIRT' ? 'b' : 'd'] = (int) $r['y']; }
    }
    $nm = static fn(int $id) => $who[$id]['n'] ?? 'Personne sans nom';
    // 1. une date qui n'existe pas (31 février, 31 avril, mois 13…) dans le calendrier grégorien ou julien
    foreach ($pdo->query("SELECT e.id,e.date_text,e.date_calendar,t.label,COALESCE(e.person_id,f.partner1_id,f.partner2_id) AS pid
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id
        WHERE e.date_text GLOB '*[0-9]*' AND COALESCE(e.date_calendar,'gregorian') IN ('','gregorian','julian')") as $r) {
        $d = date_text_parts((string) $r['date_text']); if (!$d) { continue; }
        [$day, $month, $year] = $d;
        $julian = $r['date_calendar'] === 'julian' || $year < 1583; // avant 1582, on vivait en calendrier julien (29 février 1500 a existé)
        $ok = $month >= 1 && $month <= 12 && $day >= 1 && ($julian ? $day <= [31, ($year % 4 === 0 ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][$month - 1] : checkdate($month, $day, max(1, $year)));
        if (!$ok) { $issues[] = ['key' => "impossible-date:{$r['id']}", 'severity' => 'error', 'person_id' => (int) $r['pid'], 'title' => 'Date qui n’existe pas', 'detail' => $nm((int) $r['pid']) . ' : ' . $r['label'] . ' le « ' . $r['date_text'] . ' » (ce jour n’existe pas dans le calendrier ' . ($julian ? 'julien' : 'grégorien') . ').']; }
    }
    // 2. un événement de la vie avant la naissance ou après le décès (les obsèques, la succession… viennent après, c'est normal)
    foreach ($pdo->query("SELECT e.id,e.year,e.person_id,t.label FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.person_id IS NOT NULL AND e.year IS NOT NULL AND t.gedcom_tag IN ('CHR','BAPM','CONF','FCOM','BARM','BASM','BLES','ADOP','GRAD','EDUC','OCCU','RETI','EMIG','IMMI','NATU','CENS','RESI','ORDN')") as $r) {
        $id = (int) $r['person_id']; $y = (int) $r['year']; $p = $who[$id] ?? null; if (!$p) { continue; }
        if ($p['b'] !== null && $y < $p['b']) { $issues[] = ['key' => "event-before-birth:{$r['id']}", 'severity' => 'error', 'person_id' => $id, 'title' => 'Événement avant la naissance', 'detail' => "{$p['n']} : {$r['label']} en {$y}, naissance en {$p['b']}."]; }
        if ($p['d'] !== null && $y > $p['d']) { $issues[] = ['key' => "event-after-death:{$r['id']}", 'severity' => 'error', 'person_id' => $id, 'title' => 'Événement après le décès', 'detail' => "{$p['n']} : {$r['label']} en {$y}, décès en {$p['d']}."]; }
    }
    // 3. un mariage avant 12 ans (ou avant la naissance)
    foreach ($pdo->query("SELECT e.id,e.year,f.partner1_id,f.partner2_id FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id
        WHERE e.year IS NOT NULL AND t.gedcom_tag IN ('MARR','MRCI','MRRE','ENGA')") as $r) {
        foreach ([(int) $r['partner1_id'], (int) $r['partner2_id']] as $id) {
            $p = $who[$id] ?? null; if (!$p || $p['b'] === null) { continue; }
            $age = (int) $r['year'] - $p['b'];
            if ($age < 12) { $issues[] = ['key' => "young-marriage:{$id}:{$r['id']}", 'severity' => $age < 0 ? 'error' : 'warning', 'person_id' => $id, 'title' => $age < 0 ? 'Mariage avant la naissance' : 'Mariage avant 12 ans', 'detail' => "{$p['n']} : mariage en {$r['year']}, naissance en {$p['b']}" . ($age >= 0 ? " ({$age} an" . ($age > 1 ? 's' : '') . ')' : '') . '.']; }
        }
    }
    // 4. une mère de plus de 55 ans, un père de plus de 85 ans à la naissance d'un enfant
    foreach ($pdo->query("SELECT fc.child_id,f.partner1_id,f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id") as $r) {
        $c = $who[(int) $r['child_id']] ?? null; if (!$c || $c['b'] === null) { continue; }
        foreach ([(int) $r['partner1_id'], (int) $r['partner2_id']] as $id) {
            $p = $who[$id] ?? null; if (!$p || $p['b'] === null) { continue; }
            $age = $c['b'] - $p['b']; $max = $p['g'] === 'female' ? 55 : ($p['g'] === 'male' ? 85 : 0);
            if ($max && $age > $max) { $issues[] = ['key' => "old-parent:{$id}:{$r['child_id']}", 'severity' => 'warning', 'person_id' => $id, 'title' => $p['g'] === 'female' ? 'Mère de plus de 55 ans' : 'Père de plus de 85 ans', 'detail' => "{$p['n']} aurait {$age} ans à la naissance de {$c['n']} ({$c['b']})."]; }
        }
    }
    return $issues;
}

/** La liste des généalogies (la principale en premier), avec celle qui est ouverte */
function genealogies_list_data(): array
{
    $reg = genealogies_registry();
    $size = static fn(string $dir) => is_file($dir . '/genealogy.sqlite') ? (int) filesize($dir . '/genealogy.sqlite') : 0;
    $list = [['id' => '', 'name' => $reg['main_name'], 'main' => true, 'active' => GENEALOGY_ID === '', 'size' => $size(SHARED_DATA_DIR)]];
    foreach ($reg['list'] as $g) { $list[] = ['id' => $g['id'], 'name' => $g['name'], 'main' => false, 'active' => GENEALOGY_ID === $g['id'], 'size' => $size(genealogy_dir($g['id'])), 'created_at' => $g['created_at']]; }
    return ['active' => GENEALOGY_ID, 'genealogies' => $list];
}

function genealogies_registry_save(array $reg): void
{
    $file = SHARED_DATA_DIR . '/genealogies.json';
    $json = json_encode(['active' => $reg['active'], 'main_name' => $reg['main_name'], 'list' => array_values($reg['list'])], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false || file_put_contents($file . '.tmp', $json, LOCK_EX) === false || !rename($file . '.tmp', $file)) {
        throw new RuntimeException('Impossible d’enregistrer la liste des généalogies.');
    }
}

/** Créer, ouvrir, renommer ou mettre de côté une généalogie. « Mettre de côté » ne détruit rien : le dossier part dans
    genealogies/_mises-de-cote/ (on peut le remettre à la main). La principale ne se met pas de côté. */
function genealogy_action(string $action, array $data): array
{
    $reg = genealogies_registry();
    $id = (string) ($data['id'] ?? '');
    $known = $id === '' || in_array($id, array_column($reg['list'], 'id'), true);
    $name = mb_substr(trim(preg_replace('/\s+/u', ' ', (string) ($data['name'] ?? ''))), 0, 80);
    if ($action === 'genealogy_create') {
        if ($name === '') { throw new RuntimeException('Donne un nom à la nouvelle généalogie.'); }
        $slug = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: '')), '-') ?: 'genealogie';
        $slug = substr($slug, 0, 30); $new = $slug; $n = 2;
        while (in_array($new, array_column($reg['list'], 'id'), true) || is_dir(genealogy_dir($new))) { $new = $slug . '-' . $n++; }
        foreach ([genealogy_dir($new), genealogy_dir($new) . '/media', genealogy_dir($new) . '/backups'] as $dir) {
            if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Impossible de créer le dossier de la généalogie.'); }
        }
        $reg['list'][] = ['id' => $new, 'name' => $name, 'created_at' => date('Y-m-d H:i:s')];
        if (!empty($data['open'])) { $reg['active'] = $new; }
        genealogies_registry_save($reg);
        return ['ok' => true, 'id' => $new, 'active' => $reg['active']];
    }
    if (!$known || ($id !== '' && !genealogy_id_ok($id))) { throw new RuntimeException('Généalogie introuvable.'); }
    if ($action === 'genealogy_switch') {
        $reg['active'] = $id; genealogies_registry_save($reg);
        return ['ok' => true, 'active' => $id];
    }
    if ($action === 'genealogy_rename') {
        if ($name === '') { throw new RuntimeException('Le nom ne peut pas être vide.'); }
        if ($id === '') { $reg['main_name'] = $name; } else { foreach ($reg['list'] as &$g) { if ($g['id'] === $id) { $g['name'] = $name; } } unset($g); }
        genealogies_registry_save($reg);
        return ['ok' => true];
    }
    // genealogy_remove
    if ($id === '') { throw new RuntimeException('La généalogie principale ne peut pas être mise de côté.'); }
    if ($id === GENEALOGY_ID || $id === $reg['active']) { throw new RuntimeException('Ouvre d’abord une autre généalogie.'); }
    $aside = SHARED_DATA_DIR . '/genealogies/_mises-de-cote';
    if (!is_dir($aside) && !@mkdir($aside, 0775, true) && !is_dir($aside)) { throw new RuntimeException('Impossible de créer le dossier des généalogies mises de côté.'); }
    if (is_dir(genealogy_dir($id)) && !@rename(genealogy_dir($id), $aside . '/' . $id . '-' . date('Ymd-His'))) { throw new RuntimeException('Impossible de déplacer le dossier de la généalogie.'); }
    $reg['list'] = array_values(array_filter($reg['list'], static fn($g) => $g['id'] !== $id));
    genealogies_registry_save($reg);
    return ['ok' => true];
}

function issues_data(PDO $pdo): never
{
    $includeDismissed=($_GET['dismissed']??'0')==='1';
    $dismissed=$pdo->query('SELECT issue_key,reason,dismissed_at FROM dismissed_issues')->fetchAll(PDO::FETCH_UNIQUE);
    $issues=[];
    foreach(compute_issues($pdo) as $issue){
        $issue['dismissed']=isset($dismissed[$issue['key']]);
        $issue['dismissal']=$dismissed[$issue['key']]??null;
        if($includeDismissed||!$issue['dismissed'])$issues[]=$issue;
    }
    json_response(['issues'=>$issues,'dismissedCount'=>count($dismissed)]);
}

/**
 * « Familles fantômes » : familles sans aucun conjoint (souvent laissées par MacFamilyTree ou un import).
 * Vides = ni enfant, ni événement, ni note, ni média, ni source : sans aucune information, supprimables.
 * Les autres (mariage daté, enfants…) sont seulement signalées : il manque les conjoints, à compléter à la main.
 */
// Fonctions (et non constantes) : api.php répond avant d'avoir lu les constantes déclarées plus bas.
function ghost_family_where(): string { return "f.partner1_id IS NULL AND f.partner2_id IS NULL"; }
function empty_family_where(): string { return ghost_family_where() . "
    AND NOT EXISTS (SELECT 1 FROM family_children c WHERE c.family_id=f.id)
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.family_id=f.id)
    AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.entity_type='family' AND n.entity_id=f.id)
    AND NOT EXISTS (SELECT 1 FROM media_links m WHERE m.entity_type='family' AND m.entity_id=f.id)
    AND NOT EXISTS (SELECT 1 FROM source_links s WHERE s.entity_type='family' AND s.entity_id=f.id)"; }

function ghost_families_data(PDO $pdo): never
{
    $empty = (int) $pdo->query('SELECT count(*) FROM families f WHERE ' . empty_family_where())->fetchColumn();
    $rows = $pdo->query("SELECT f.id,
            (SELECT group_concat(trim(t.label || ' ' || COALESCE(e.date_text,'') || CASE WHEN pl.name IS NOT NULL THEN ' à ' || pl.name ELSE '' END), ' · ')
               FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.family_id=f.id) AS events,
            (SELECT group_concat(c.child_id || ':' || trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), '|')
               FROM family_children c JOIN persons p ON p.id=c.child_id WHERE c.family_id=f.id) AS children,
            (SELECT count(*) FROM notes n WHERE n.entity_type='family' AND n.entity_id=f.id) AS notes
        FROM families f WHERE " . ghost_family_where() . " AND f.id NOT IN (SELECT f.id FROM families f WHERE " . empty_family_where() . ")
        ORDER BY f.id LIMIT 500")->fetchAll();
    $total = (int) $pdo->query('SELECT count(*) FROM families f WHERE ' . ghost_family_where())->fetchColumn();
    foreach ($rows as &$r) {
        $children = [];
        foreach (array_filter(explode('|', (string) $r['children'])) as $c) {
            [$id, $name] = array_pad(explode(':', $c, 2), 2, '');
            $children[] = ['id' => (int) $id, 'name' => $name !== '' ? $name : 'Sans nom'];
        }
        $r = ['id' => (int) $r['id'], 'events' => (string) $r['events'], 'children' => $children, 'notes' => (int) $r['notes']];
    }
    unset($r);
    json_response(['total' => $total, 'empty' => $empty, 'with_content' => $rows, 'with_content_count' => $total - $empty]);
}

function delete_empty_families(PDO $pdo): never
{
    $count = (int) $pdo->query('SELECT count(*) FROM families f WHERE ' . empty_family_where())->fetchColumn();
    if ($count === 0) { json_response(['ok' => true, 'deleted' => 0, 'backup' => null]); }
    // Copie de sécurité d'abord (jamais supprimée par la rotation des sauvegardes)
    $dir = DATA_DIR . '/backups';
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Impossible de créer le dossier de sauvegarde.'); }
    $backup = 'genealogie-backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '-avant-nettoyage.db';
    $pdo->exec('VACUUM main INTO ' . $pdo->quote($dir . '/' . $backup));
    $pdo->beginTransaction();
    $ids = $pdo->query('SELECT f.id FROM families f WHERE ' . empty_family_where())->fetchAll(PDO::FETCH_COLUMN);
    $delete = $pdo->prepare('DELETE FROM families WHERE id=?');
    foreach ($ids as $id) { $delete->execute([$id]); }
    log_change($pdo, 'family', 0, 'delete', 'Nettoyage : ' . count($ids) . ' famille(s) vide(s) supprimée(s)', ['family_ids' => array_map('intval', $ids)], ['backup' => $backup]);
    $pdo->commit();
    json_response(['ok' => true, 'deleted' => count($ids), 'backup' => $backup]);
}

function changes_data(PDO $pdo): never
{
    $rows=$pdo->query('SELECT * FROM change_log ORDER BY created_at DESC,id DESC LIMIT 300')->fetchAll();
    json_response(['changes'=>decorate_change_rows($pdo,$rows)]);
}

function decorate_change_rows(PDO $pdo,array $rows): array
{
    $recentDeleteIds=array_flip(recent_restore_candidate_ids($pdo,15));
    foreach($rows as &$row){
        $before=json_decode((string)($row['before_json']??''),true) ?: [];
        $after=json_decode((string)($row['after_json']??''),true) ?: [];
        $fields=array_values(array_unique(array_merge(array_keys($before),array_keys($after))));
        $changed=[];
        foreach($fields as $field)if(($before[$field]??null)!==($after[$field]??null))$changed[]=$field;
        $row['changed_fields']=$changed;
        $row['entity_label']=change_entity_label($pdo,$row,$before,$after);
        $restore=restore_change_state($pdo,$row,$before);
        $row['can_restore']=$restore['state']==='available';
        $row['restore_available']=$row['can_restore']&&isset($recentDeleteIds[(int)$row['id']]);
        $row['restore_blocked']=$restore['state']==='blocked'&&isset($recentDeleteIds[(int)$row['id']]);
        $row['restore_block_reason']=$restore['reason']??'';
    }
    unset($row);
    return $rows;
}

function person_history_data(PDO $pdo): never
{
    $personId = safe_int($_GET['id'] ?? 0);
    if (!$personId) json_response(['changes'=>[]]);
    $rows = $pdo->query('SELECT * FROM change_log ORDER BY created_at DESC,id DESC LIMIT 1000')->fetchAll();
    $filtered = [];
    foreach ($rows as $row) {
        $before = json_decode((string)($row['before_json'] ?? ''), true) ?: [];
        $after = json_decode((string)($row['after_json'] ?? ''), true) ?: [];
        if (change_mentions_person($row, $before, $after, $personId)) {
            $filtered[] = $row;
            if (count($filtered) >= 300) break;
        }
    }
    json_response(['changes'=>decorate_change_rows($pdo,$filtered)]);
}

function change_mentions_person(array $row,array $before,array $after,int $personId): bool
{
    if (($row['entity_type'] ?? '') === 'person' && (int)($row['entity_id'] ?? 0) === $personId) return true;
    return nested_mentions_person($before,$personId) || nested_mentions_person($after,$personId);
}

function nested_mentions_person(mixed $data,int $personId): bool
{
    if (!is_array($data)) return false;
    $personKeys = ['person_id','partner1_id','partner2_id','child_id','father_id','mother_id','spouse_id'];
    foreach ($data as $key => $value) {
        if (in_array((string)$key, $personKeys, true) && (int)$value === $personId) return true;
        if (is_array($value) && nested_mentions_person($value,$personId)) return true;
    }
    return false;
}

function recent_restore_candidate_ids(PDO $pdo,int $limit=15): array
{
    $ids=[];
    $rows=$pdo->query('SELECT * FROM change_log WHERE action=\'delete\' ORDER BY created_at DESC,id DESC LIMIT 300')->fetchAll();
    foreach($rows as $row){
        $before=json_decode((string)($row['before_json']??''),true) ?: [];
        $state=restore_change_state($pdo,$row,$before)['state']??'none';
        if($state==='available'||$state==='blocked'){
            $ids[]=(int)$row['id'];
            if(count($ids)>=$limit)break;
        }
    }
    return $ids;
}

function change_entity_label(PDO $pdo,array $row,array $before=[],array $after=[]): string
{
    $type=(string)($row['entity_type']??'');$id=safe_int($row['entity_id']??0);$data=$after?:$before;
    if(($data['_restore_kind']??'')==='event_delete')$data=$data['event']??[];
    if(($data['_restore_kind']??'')==='media_delete')$data=$data['media']??[];
    if(($data['_restore_kind']??'')==='note_delete')$data=$data['note']??[];
    if(($data['_restore_kind']??'')==='source_delete')$data=$data['source']??[];
    if(($data['_restore_kind']??'')==='battue_delete')$data=$data['battue']??[];
    if(($data['_restore_kind']??'')==='battue_item_delete')$data=$data['item']??[];
    if(($data['_restore_kind']??'')==='battue_alias_delete')$data=$data['alias']??[];
    if(($data['_restore_kind']??'')==='investigation_delete')$data=$data['investigation']??[];
    if(($data['_restore_kind']??'')==='investigation_item_delete')$data=$data['item']??[];
    if(($data['_restore_kind']??'')==='investigation_media_delete')$data=$data['media_link']??[];
    if($type==='person'){
        if($id){$stmt=$pdo->prepare('SELECT * FROM persons WHERE id=?');$stmt->execute([$id]);if($person=$stmt->fetch())return full_name($person) ?: 'Personne sans nom';}
        return full_name($data) ?: 'Personne supprimée';
    }
    if($type==='event'){
        if($id){$stmt=$pdo->prepare("SELECT e.*,t.label AS type_label,p.first_name,p.middle_name,p.last_name,p.prefix,p.suffix FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id WHERE e.id=?");$stmt->execute([$id]);if($event=$stmt->fetch()){return trim(($event['type_label']?:'Événement').' · '.(full_name($event) ?: '#'.$id));}}
        $label=(string)($data['type_label']??'Événement supprimé');
        if(!empty($data['person_id'])){$stmt=$pdo->prepare('SELECT * FROM persons WHERE id=?');$stmt->execute([(int)$data['person_id']]);if($person=$stmt->fetch())$label.=' · '.full_name($person);}
        return $label;
    }
    if($type==='event_type'){
        if($id){$stmt=$pdo->prepare('SELECT label FROM event_types WHERE id=?');$stmt->execute([$id]);if($label=$stmt->fetchColumn())return (string)$label;}
        return (string)($data['label']??'Type d’événement');
    }
    if($type==='media')return (string)($data['title']??$data['filename']??'Média');
    if($type==='note')return (string)($data['title']??'Note');
    if($type==='source')return (string)($data['source']['title']??$data['title']??'Source');
    if($type==='census')return !empty($data['year'])?'Recensement '.$data['year']:'Recensement';
    if($type==='battue')return (string)($data['title']??'Battue');
    if($type==='battue_item')return (string)($data['title']??$data['period']??'Annotation de battue');
    if($type==='battue_alias')return (string)($data['name']??'Commune liée');
    if($type==='investigation')return (string)($data['title']??'Enquête');
    if($type==='investigation_item')return (string)($data['title']??'Piste d’enquête');
    if($type==='investigation_media')return (string)($data['title']??$data['filename']??'Média d’enquête');
    if($type==='research_budget')return (string)($data['title']??'Budget de recherche');
    if($type==='courrier')return (string)(($data['destinataire']??'').(!empty($data['objet'])?' — '.$data['objet']:'')) ?: 'Courrier';
    if($type==='label')return (string)($data['name']??'Étiquette');
    if($type==='branch')return (string)($data['name']??'Branche');
    if($type==='view')return (string)($data['name']??'Vue enregistrée');
    if($type==='settings')return 'Réglages du site';
    return $type ? $type.' #'.($id?:'—') : 'Élément';
}

function restore_change_state(PDO $pdo,array $row,array $before=[]): array
{
    if(($row['action']??'')!=='delete')return ['state'=>'none','reason'=>''];
    $type=(string)($row['entity_type']??'');
    $kind=(string)($before['_restore_kind']??'');
    if($type==='person'&&$kind==='person_delete'){
        $id=safe_int($before['id']??$row['entity_id']??0);
        return $id&&!record_exists($pdo,'persons',$id)?['state'=>'available','reason'=>'']:['state'=>'none','reason'=>''];
    }
    if($type==='event'&&$kind==='event_delete'){
        $event=$before['event']??[];$id=safe_int($event['id']??$row['entity_id']??0);
        if(!$id||record_exists($pdo,'events',$id))return ['state'=>'none','reason'=>''];
        $typeId=safe_int($event['event_type_id']??0);if(!$typeId||!record_exists($pdo,'event_types',$typeId))return ['state'=>'blocked','reason'=>'Le type d’événement lié n’existe plus.'];
        if(!empty($event['person_id'])&&!record_exists($pdo,'persons',(int)$event['person_id']))return ['state'=>'blocked','reason'=>'La personne liée n’existe plus.'];
        if(!empty($event['family_id'])&&!record_exists($pdo,'families',(int)$event['family_id']))return ['state'=>'blocked','reason'=>'La famille liée n’existe plus.'];
        return ['state'=>'available','reason'=>''];
    }
    if($type==='media'&&$kind==='media_delete'){
        $media=$before['media']??[];$id=safe_int($media['id']??$row['entity_id']??0);
        if(!$id||record_exists($pdo,'media',$id))return ['state'=>'none','reason'=>''];
        return links_targets_exist($pdo,$before['media_links']??[])
            ? ['state'=>'available','reason'=>'']
            : ['state'=>'blocked','reason'=>'Un rattachement du média n’existe plus.'];
    }
    if($type==='note'&&$kind==='note_delete'){
        $note=$before['note']??[];$id=safe_int($note['id']??$row['entity_id']??0);
        if(!$id||record_exists($pdo,'notes',$id))return ['state'=>'none','reason'=>''];
        return entity_target_exists($pdo,(string)($note['entity_type']??''),safe_int($note['entity_id']??0))
            ? ['state'=>'available','reason'=>'']
            : ['state'=>'blocked','reason'=>'Le rattachement de la note n’existe plus.'];
    }
    if($type==='source'&&$kind==='source_delete'){
        $source=$before['source']??[];$id=safe_int($source['id']??$row['entity_id']??0);
        if(!$id)return ['state'=>'none','reason'=>''];
        $sourceStillExists=record_exists($pdo,'sources',$id);
        if(empty($before['source_deleted'])&&!$sourceStillExists)return ['state'=>'blocked','reason'=>'La source liée à cette citation n’existe plus.'];
        if(!empty($before['source_deleted'])&&$sourceStillExists)return ['state'=>'none','reason'=>''];
        return links_targets_exist($pdo,$before['source_links']??[])
            ? ['state'=>'available','reason'=>'']
            : ['state'=>'blocked','reason'=>'Un rattachement de la source n’existe plus.'];
    }
    if($type==='battue'&&$kind==='battue_delete'){
        $battue=$before['battue']??[];$id=safe_int($battue['id']??$row['entity_id']??0);
        if(!$id||record_exists($pdo,'battues',$id))return ['state'=>'none','reason'=>''];
        return battue_commune_exists($pdo,(string)($battue['start_insee_code']??''))
            ? ['state'=>'available','reason'=>'']
            : ['state'=>'blocked','reason'=>'La commune de départ n’existe plus.'];
    }
    if($type==='battue_item'&&$kind==='battue_item_delete'){
        $item=$before['item']??[];$id=safe_int($item['id']??$row['entity_id']??0);
        $battueId=safe_int($item['battue_id']??0);
        if(!$id||record_exists($pdo,'battue_search_items',$id))return ['state'=>'none','reason'=>''];
        if(!$battueId||!record_exists($pdo,'battues',$battueId))return ['state'=>'blocked','reason'=>'La battue liée n’existe plus.'];
        if(!media_links_media_exist($pdo,$before['media_links']??[]))return ['state'=>'blocked','reason'=>'Un média lié n’existe plus.'];
        return ['state'=>'available','reason'=>''];
    }
    if($type==='battue_alias'&&$kind==='battue_alias_delete'){
        $alias=$before['alias']??[];$id=safe_int($alias['id']??$row['entity_id']??0);
        $battueId=safe_int($alias['battue_id']??0);
        if(!$id||record_exists($pdo,'battue_commune_aliases',$id))return ['state'=>'none','reason'=>''];
        return $battueId&&record_exists($pdo,'battues',$battueId)
            ? ['state'=>'available','reason'=>'']
            : ['state'=>'blocked','reason'=>'La battue liée n’existe plus.'];
    }
    if($type==='investigation'&&$kind==='investigation_delete'){
        $investigation=$before['investigation']??[];$id=safe_int($investigation['id']??$row['entity_id']??0);
        if(!$id||record_exists($pdo,'investigations',$id))return ['state'=>'none','reason'=>''];
        return record_exists($pdo,'persons',safe_int($investigation['person_id']??0))
            ? ['state'=>'available','reason'=>'']
            : ['state'=>'blocked','reason'=>'La personne principale de l’enquête n’existe plus.'];
    }
    if($type==='investigation_item'&&$kind==='investigation_item_delete'){
        $item=$before['item']??[];$id=safe_int($item['id']??$row['entity_id']??0);
        $investigationId=safe_int($item['investigation_id']??0);
        if(!$id||record_exists($pdo,'investigation_items',$id))return ['state'=>'none','reason'=>''];
        return $investigationId&&record_exists($pdo,'investigations',$investigationId)
            ? ['state'=>'available','reason'=>'']
            : ['state'=>'blocked','reason'=>'L’enquête liée n’existe plus.'];
    }
    if($type==='investigation_media'&&$kind==='investigation_media_delete'){
        $link=$before['media_link']??[];$id=safe_int($link['id']??$row['entity_id']??0);
        $investigationId=safe_int($link['investigation_id']??0);
        if(!$id||record_exists($pdo,'investigation_media',$id))return ['state'=>'none','reason'=>''];
        if(!$investigationId||!record_exists($pdo,'investigations',$investigationId))return ['state'=>'blocked','reason'=>'L’enquête liée n’existe plus.'];
        if(!record_exists($pdo,'media',safe_int($link['media_id']??0)))return ['state'=>'blocked','reason'=>'Le média lié n’existe plus.'];
        return ['state'=>'available','reason'=>''];
    }
    return ['state'=>'none','reason'=>''];
}

function can_restore_change(PDO $pdo,array $row,array $before=[]): bool
{
    return (restore_change_state($pdo,$row,$before)['state']??'none')==='available';
}

function restore_change(PDO $pdo,array $data): array
{
    $changeId=safe_int($data['id']??0);
    if(!$changeId)throw new RuntimeException('Modification introuvable.');
    $recent=recent_restore_candidate_ids($pdo,15);
    if(!in_array($changeId,$recent,true))throw new RuntimeException('Seules les quinze dernières suppressions sont restaurables.');
    $stmt=$pdo->prepare('SELECT * FROM change_log WHERE id=?');
    $stmt->execute([$changeId]);
    $change=$stmt->fetch();
    if(!$change)throw new RuntimeException('Modification introuvable.');
    $before=json_decode((string)($change['before_json']??''),true) ?: [];
    if(!can_restore_change($pdo,$change,$before))throw new RuntimeException('Cette suppression ne peut pas être restaurée proprement.');
    if(($change['entity_type']??'')==='person')return restore_deleted_person($pdo,$change,$before);
    if(($change['entity_type']??'')==='event')return restore_deleted_event($pdo,$change,$before);
    if(($change['entity_type']??'')==='media')return restore_deleted_media($pdo,$change,$before);
    if(($change['entity_type']??'')==='note')return restore_deleted_note($pdo,$change,$before);
    if(($change['entity_type']??'')==='source')return restore_deleted_source($pdo,$change,$before);
    if(($change['entity_type']??'')==='battue')return restore_deleted_battue($pdo,$change,$before);
    if(($change['entity_type']??'')==='battue_item')return restore_deleted_battue_item($pdo,$change,$before);
    if(($change['entity_type']??'')==='battue_alias')return restore_deleted_battue_alias($pdo,$change,$before);
    if(($change['entity_type']??'')==='investigation')return restore_deleted_investigation($pdo,$change,$before);
    if(($change['entity_type']??'')==='investigation_item')return restore_deleted_investigation_item($pdo,$change,$before);
    if(($change['entity_type']??'')==='investigation_media')return restore_deleted_investigation_media($pdo,$change,$before);
    throw new RuntimeException('Type de restauration non pris en charge.');
}

/** ↶ Annuler juste après une suppression (H7) : remet la dernière suppression journalisée de cet élément. */
function restore_last_delete(PDO $pdo,array $data): array
{
    $type=(string)($data['entity_type']??'');$id=safe_int($data['entity_id']??0);
    // une simple ligne, gardée entière dans le journal au moment de la suppression (rappel, ligne de budget, courrier)
    // (et ses lignes liées gardées dans « _children » : étiquettes posées, membres d'une branche)
    $simple=['standalone_reminder'=>'standalone_reminders','research_budget'=>'research_budget','courrier'=>'courriers',
        'hypothesis'=>'hypotheses','evidence'=>'evidence_records','person_online_sheet'=>'person_online_sheets','living_contact'=>'living_contacts',
        'branch'=>'branches','view'=>'saved_views','label'=>'labels'];
    $childTables=['label_links','branch_people'];
    if($id&&isset($simple[$type])){
        $table=$simple[$type];
        $stmt=$pdo->prepare("SELECT * FROM change_log WHERE action='delete' AND entity_type=? AND entity_id=? ORDER BY id DESC LIMIT 1");
        $stmt->execute([$type,$id]);$change=$stmt->fetch();
        $row=$change?(json_decode((string)($change['before_json']??''),true)?:[]):[];
        if(!$row||safe_int($row['id']??0)!==$id)throw new RuntimeException('Cette suppression n’a pas été trouvée dans le journal.');
        $exists=$pdo->prepare("SELECT 1 FROM {$table} WHERE id=?");$exists->execute([$id]);
        if($exists->fetchColumn())throw new RuntimeException('Cet élément existe déjà.');
        $children=is_array($row['_children']??null)?$row['_children']:[];
        unset($row['_children']);
        insert_snapshot_row($pdo,$table,$row);
        foreach($children as $childTable=>$rows){
            if(!in_array($childTable,$childTables,true)||!is_array($rows))continue;
            foreach($rows as $child)if(is_array($child)&&$child)insert_snapshot_row($pdo,$childTable,$child,true);
        }
        log_change($pdo,$type,$id,'restore','Suppression annulée #'.$id,null,['restored_from_change_id'=>(int)$change['id']]);
        return ['entity_type'=>$type,'entity_id'=>$id];
    }
    $allowed=['event','note','source','media','battue','battue_item','battue_alias','investigation','investigation_item','investigation_media'];
    if(!$id||!in_array($type,$allowed,true))throw new RuntimeException('Rien à remettre.');
    $stmt=$pdo->prepare("SELECT id FROM change_log WHERE action='delete' AND entity_type=? AND entity_id=? ORDER BY id DESC LIMIT 1");
    $stmt->execute([$type,$id]);
    $changeId=(int)$stmt->fetchColumn();
    if(!$changeId)throw new RuntimeException('Cette suppression n’a pas été trouvée dans le journal.');
    return restore_change($pdo,['id'=>$changeId]);
}

function record_exists(PDO $pdo,string $table,int $id): bool
{
    $allowed=['persons','families','events','event_types','places','media','notes','sources','census_records','battues','battue_search_items','battue_commune_aliases','saved_views','investigations','investigation_items','investigation_media','graves'];
    if(!in_array($table,$allowed,true))return false;
    $stmt=$pdo->prepare("SELECT 1 FROM {$table} WHERE id=?");
    $stmt->execute([$id]);
    return (bool)$stmt->fetchColumn();
}

function entity_target_exists(PDO $pdo,string $entityType,int $entityId): bool
{
    if(!$entityId)return false;
    return match($entityType){
        'person'=>record_exists($pdo,'persons',$entityId),
        'family'=>record_exists($pdo,'families',$entityId),
        'event'=>record_exists($pdo,'events',$entityId),
        'source'=>record_exists($pdo,'sources',$entityId),
        'census'=>record_exists($pdo,'census_records',$entityId),
        'battue'=>record_exists($pdo,'battues',$entityId),
        'battue_item'=>record_exists($pdo,'battue_search_items',$entityId),
        'battue_alias'=>record_exists($pdo,'battue_commune_aliases',$entityId),
        'investigation'=>record_exists($pdo,'investigations',$entityId),
        'investigation_item'=>record_exists($pdo,'investigation_items',$entityId),
        'view'=>record_exists($pdo,'saved_views',$entityId),
        'grave'=>record_exists($pdo,'graves',$entityId),
        'military'=>record_exists($pdo,'persons',$entityId), // dossier militaire : rangé sous le numéro de la personne
        default=>true, // rattachement d'une autre sorte : il ne doit pas empêcher de restaurer le média
    };
}

function links_targets_exist(PDO $pdo,array $links): bool
{
    foreach($links as $link){
        if(!entity_target_exists($pdo,(string)($link['entity_type']??''),safe_int($link['entity_id']??0)))return false;
    }
    return true;
}

function media_links_media_exist(PDO $pdo,array $links): bool
{
    foreach($links as $link){
        $mediaId=safe_int($link['media_id']??0);
        if(!$mediaId||!record_exists($pdo,'media',$mediaId))return false;
    }
    return true;
}

function table_columns(PDO $pdo,string $table): array
{
    static $cache=[];
    if(!isset($cache[$table]))$cache[$table]=array_map(static fn($row)=>(string)$row['name'],$pdo->query("PRAGMA table_info($table)")->fetchAll());
    return $cache[$table];
}

function insert_snapshot_row(PDO $pdo,string $table,array $row,bool $ignore=false): void
{
    $columns=array_values(array_intersect(table_columns($pdo,$table),array_keys($row)));
    if(!$columns)throw new RuntimeException('Snapshot incomplet pour '.$table.'.');
    $sql='INSERT '.($ignore?'OR IGNORE ':'').'INTO '.$table.'('.implode(',',$columns).') VALUES('.implode(',',array_fill(0,count($columns),'?')).')';
    $pdo->prepare($sql)->execute(array_map(static fn($column)=>$row[$column],$columns));
}

function restore_deleted_event(PDO $pdo,array $change,array $before): array
{
    $snapshot=$before;$event=$snapshot['event']??[];
    $eventId=safe_int($event['id']??$change['entity_id']??0);
    if(!$eventId)throw new RuntimeException('Événement introuvable dans le snapshot.');
    $stmt=$pdo->prepare('SELECT 1 FROM events WHERE id=?');$stmt->execute([$eventId]);if($stmt->fetchColumn())throw new RuntimeException('Cet événement existe déjà.');
    if(!empty($event['person_id'])){$stmt=$pdo->prepare('SELECT 1 FROM persons WHERE id=?');$stmt->execute([(int)$event['person_id']]);if(!$stmt->fetchColumn())throw new RuntimeException('La personne liée à cet événement n’existe plus.');}
    if(!empty($event['family_id'])){$stmt=$pdo->prepare('SELECT 1 FROM families WHERE id=?');$stmt->execute([(int)$event['family_id']]);if(!$stmt->fetchColumn())throw new RuntimeException('La famille liée à cet événement n’existe plus.');}
    insert_snapshot_row($pdo,'events',$event);
    foreach(($snapshot['media_links']??[]) as $row)insert_snapshot_row($pdo,'media_links',$row);
    foreach(($snapshot['source_links']??[]) as $row)insert_snapshot_row($pdo,'source_links',$row);
    foreach(($snapshot['notes']??[]) as $row)insert_snapshot_row($pdo,'notes',$row);
    foreach(($snapshot['label_links']??[]) as $row)insert_snapshot_row($pdo,'label_links',$row,true);
    foreach(($snapshot['witnesses']??[]) as $row){if(record_exists($pdo,'persons',(int)($row['person_id']??0)))insert_snapshot_row($pdo,'event_witnesses',$row,true);}
    if(!empty($event['person_id']))rebuild_search($pdo,(int)$event['person_id']);
    log_change($pdo,'event',$eventId,'restore','Restauration de l’événement supprimé #'.$eventId,null,['restored_from_change_id'=>(int)$change['id'],'event_id'=>$eventId]);
    return ['entity_type'=>'event','entity_id'=>$eventId];
}

function restore_deleted_media(PDO $pdo,array $change,array $before): array
{
    $media=$before['media']??[];$mediaId=safe_int($media['id']??$change['entity_id']??0);
    if(!$mediaId)throw new RuntimeException('Média introuvable dans le snapshot.');
    if(record_exists($pdo,'media',$mediaId))throw new RuntimeException('Ce média existe déjà.');
    if(!links_targets_exist($pdo,$before['media_links']??[]))throw new RuntimeException('Un rattachement du média n’existe plus.');
    insert_snapshot_row($pdo,'media',$media);
    foreach(($before['media_links']??[]) as $row)insert_snapshot_row($pdo,'media_links',$row);
    foreach(($before['label_links']??[]) as $row)insert_snapshot_row($pdo,'label_links',$row,true);
    foreach(($before['media_versions']??[]) as $row)insert_snapshot_row($pdo,'media_versions',$row,true);
    // Ce qui dépendait du média (supprimé ou vidé avec lui) : remis tel quel, dans l'ordre (les lignes « parents » d'abord)
    foreach(($before['dependents']['rows']??[]) as $table=>$rows){foreach($rows as $row){try{insert_snapshot_row($pdo,(string)$table,$row,true);}catch(Throwable $_){}}}
    foreach(($before['dependents']['nulls']??[]) as $n){
        if(!preg_match('/^[a-z_][a-z0-9_]*$/',(string)$n['table'])||!preg_match('/^[a-z_][a-z0-9_]*$/',(string)$n['column']))continue;
        $pdo->prepare("UPDATE {$n['table']} SET {$n['column']}=? WHERE id=? AND {$n['column']} IS NULL")->execute([$mediaId,(int)$n['id']]);
    }
    foreach(($before['portrait_person_ids']??[]) as $personId){
        $personId=safe_int($personId);
        if($personId&&record_exists($pdo,'persons',$personId))$pdo->prepare('UPDATE persons SET portrait_media_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND portrait_media_id IS NULL')->execute([$mediaId,$personId]);
    }
    log_change($pdo,'media',$mediaId,'restore','Restauration du média supprimé #'.$mediaId,null,['restored_from_change_id'=>(int)$change['id'],'media_id'=>$mediaId]);
    return ['entity_type'=>'media','entity_id'=>$mediaId];
}

function restore_deleted_note(PDO $pdo,array $change,array $before): array
{
    $note=$before['note']??[];$noteId=safe_int($note['id']??$change['entity_id']??0);
    if(!$noteId)throw new RuntimeException('Note introuvable dans le snapshot.');
    if(record_exists($pdo,'notes',$noteId))throw new RuntimeException('Cette note existe déjà.');
    if(!entity_target_exists($pdo,(string)($note['entity_type']??''),safe_int($note['entity_id']??0)))throw new RuntimeException('Le rattachement de la note n’existe plus.');
    insert_snapshot_row($pdo,'notes',$note);
    foreach(($before['label_links']??[]) as $row)insert_snapshot_row($pdo,'label_links',$row,true);
    log_change($pdo,'note',$noteId,'restore','Restauration de la note supprimée #'.$noteId,null,['restored_from_change_id'=>(int)$change['id'],'note_id'=>$noteId]);
    return ['entity_type'=>'note','entity_id'=>$noteId];
}

function restore_deleted_source(PDO $pdo,array $change,array $before): array
{
    $source=$before['source']??[];$sourceId=safe_int($source['id']??$change['entity_id']??0);
    if(!$sourceId)throw new RuntimeException('Source introuvable dans le snapshot.');
    if(!links_targets_exist($pdo,$before['source_links']??[]))throw new RuntimeException('Un rattachement de la source n’existe plus.');
    if(!empty($before['source_deleted'])){
        if(record_exists($pdo,'sources',$sourceId))throw new RuntimeException('Cette source existe déjà.');
        insert_snapshot_row($pdo,'sources',$source);
        foreach(($before['label_links']??[]) as $row)insert_snapshot_row($pdo,'label_links',$row,true);
    }elseif(!record_exists($pdo,'sources',$sourceId))throw new RuntimeException('La source liée à cette citation n’existe plus.');
    foreach(($before['source_links']??[]) as $row)insert_snapshot_row($pdo,'source_links',$row);
    log_change($pdo,'source',$sourceId,'restore','Restauration de la source/citation supprimée #'.$sourceId,null,['restored_from_change_id'=>(int)$change['id'],'source_id'=>$sourceId]);
    return ['entity_type'=>'source','entity_id'=>$sourceId];
}

function restore_deleted_battue(PDO $pdo,array $change,array $before): array
{
    $battue=$before['battue']??[];$battueId=safe_int($battue['id']??$change['entity_id']??0);
    if(!$battueId)throw new RuntimeException('Battue introuvable dans le snapshot.');
    if(record_exists($pdo,'battues',$battueId))throw new RuntimeException('Cette battue existe déjà.');
    if(!battue_commune_exists($pdo,(string)($battue['start_insee_code']??'')))throw new RuntimeException('La commune de départ n’existe plus.');
    insert_snapshot_row($pdo,'battues',$battue);
    foreach(($before['persons']??[]) as $row)if(record_exists($pdo,'persons',safe_int($row['person_id']??0)))insert_snapshot_row($pdo,'battue_persons',$row,true);
    foreach(($before['aliases']??[]) as $row)insert_snapshot_row($pdo,'battue_commune_aliases',$row,true);
    foreach(($before['statuses']??[]) as $row)insert_snapshot_row($pdo,'battue_commune_statuses',$row,true);
    foreach(($before['items']??[]) as $row)insert_snapshot_row($pdo,'battue_search_items',$row,true);
    foreach(($before['media_links']??[]) as $row)if(record_exists($pdo,'media',safe_int($row['media_id']??0)))insert_snapshot_row($pdo,'media_links',$row,true);
    log_change($pdo,'battue',$battueId,'restore','Restauration de la battue supprimée #'.$battueId,null,['restored_from_change_id'=>(int)$change['id'],'battue_id'=>$battueId]);
    return ['entity_type'=>'battue','entity_id'=>$battueId];
}

function restore_deleted_battue_item(PDO $pdo,array $change,array $before): array
{
    $item=$before['item']??[];$itemId=safe_int($item['id']??$change['entity_id']??0);
    if(!$itemId)throw new RuntimeException('Annotation de battue introuvable dans le snapshot.');
    if(record_exists($pdo,'battue_search_items',$itemId))throw new RuntimeException('Cette annotation existe déjà.');
    $battueId=safe_int($item['battue_id']??0);
    if(!$battueId||!record_exists($pdo,'battues',$battueId))throw new RuntimeException('La battue liée à cette annotation n’existe plus.');
    if(!empty($item['alias_id'])&&!record_exists($pdo,'battue_commune_aliases',(int)$item['alias_id']))$item['alias_id']=null;
    insert_snapshot_row($pdo,'battue_search_items',$item);
    foreach(($before['media_links']??[]) as $row)insert_snapshot_row($pdo,'media_links',$row);
    $pdo->prepare('UPDATE battues SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$battueId]);
    log_change($pdo,'battue_item',$itemId,'restore','Restauration de l’annotation de battue #'.$itemId,null,['restored_from_change_id'=>(int)$change['id'],'item_id'=>$itemId]);
    return ['entity_type'=>'battue_item','entity_id'=>$itemId,'battue_id'=>$battueId];
}

function restore_deleted_battue_alias(PDO $pdo,array $change,array $before): array
{
    $alias=$before['alias']??[];$aliasId=safe_int($alias['id']??$change['entity_id']??0);
    if(!$aliasId)throw new RuntimeException('Commune liée introuvable dans le snapshot.');
    if(record_exists($pdo,'battue_commune_aliases',$aliasId))throw new RuntimeException('Cette commune liée existe déjà.');
    $battueId=safe_int($alias['battue_id']??0);
    if(!$battueId||!record_exists($pdo,'battues',$battueId))throw new RuntimeException('La battue liée à cette commune n’existe plus.');
    insert_snapshot_row($pdo,'battue_commune_aliases',$alias);
    $itemIds=array_values(array_filter(array_map('intval',$before['item_ids']??[])));
    if($itemIds){
        $marks=implode(',',array_fill(0,count($itemIds),'?'));
        $pdo->prepare("UPDATE battue_search_items SET alias_id=? WHERE id IN ($marks) AND battue_id=? AND insee_code=?")
            ->execute(array_merge([$aliasId],$itemIds,[$battueId,(string)($alias['insee_code']??'')]));
    }
    $pdo->prepare('UPDATE battues SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$battueId]);
    log_change($pdo,'battue_alias',$aliasId,'restore','Restauration de la commune liée #'.$aliasId,null,['restored_from_change_id'=>(int)$change['id'],'alias_id'=>$aliasId]);
    return ['entity_type'=>'battue_alias','entity_id'=>$aliasId,'battue_id'=>$battueId];
}

function restore_deleted_investigation(PDO $pdo,array $change,array $before): array
{
    $investigation=$before['investigation']??[];$investigationId=safe_int($investigation['id']??$change['entity_id']??0);
    if(!$investigationId)throw new RuntimeException('Enquête introuvable dans le snapshot.');
    if(record_exists($pdo,'investigations',$investigationId))throw new RuntimeException('Cette enquête existe déjà.');
    if(!record_exists($pdo,'persons',safe_int($investigation['person_id']??0)))throw new RuntimeException('La personne principale de l’enquête n’existe plus.');
    insert_snapshot_row($pdo,'investigations',$investigation);
    foreach(($before['persons']??[]) as $row)if(record_exists($pdo,'persons',safe_int($row['person_id']??0)))insert_snapshot_row($pdo,'investigation_persons',$row,true);
    foreach(($before['linked_battues']??[]) as $row)if(record_exists($pdo,'battues',safe_int($row['battue_id']??0)))insert_snapshot_row($pdo,'investigation_battues',$row,true);
    foreach(($before['folders']??[]) as $row)insert_snapshot_row($pdo,'investigation_media_folders',$row,true);
    foreach(($before['items']??[]) as $row)insert_snapshot_row($pdo,'investigation_items',$row,true);
    foreach(($before['media']??[]) as $row)if(record_exists($pdo,'media',safe_int($row['media_id']??0)))insert_snapshot_row($pdo,'investigation_media',$row,true);
    foreach(($before['media_items']??[]) as $row){
        if(record_exists($pdo,'investigation_media',safe_int($row['investigation_media_id']??0))&&record_exists($pdo,'investigation_items',safe_int($row['investigation_item_id']??0)))insert_snapshot_row($pdo,'investigation_media_items',$row,true);
    }
    log_change($pdo,'investigation',$investigationId,'restore','Restauration de l’enquête supprimée #'.$investigationId,null,['restored_from_change_id'=>(int)$change['id'],'investigation_id'=>$investigationId]);
    return ['entity_type'=>'investigation','entity_id'=>$investigationId];
}

function restore_deleted_investigation_item(PDO $pdo,array $change,array $before): array
{
    $item=$before['item']??[];$itemId=safe_int($item['id']??$change['entity_id']??0);
    if(!$itemId)throw new RuntimeException('Piste introuvable dans le snapshot.');
    if(record_exists($pdo,'investigation_items',$itemId))throw new RuntimeException('Cette piste existe déjà.');
    $investigationId=safe_int($item['investigation_id']??0);
    if(!$investigationId||!record_exists($pdo,'investigations',$investigationId))throw new RuntimeException('L’enquête liée à cette piste n’existe plus.');
    insert_snapshot_row($pdo,'investigation_items',$item);
    foreach(($before['media_items']??[]) as $row)if(record_exists($pdo,'investigation_media',safe_int($row['investigation_media_id']??0)))insert_snapshot_row($pdo,'investigation_media_items',$row,true);
    $pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$investigationId]);
    log_change($pdo,'investigation_item',$itemId,'restore','Restauration de la piste supprimée #'.$itemId,null,['restored_from_change_id'=>(int)$change['id'],'item_id'=>$itemId]);
    return ['entity_type'=>'investigation_item','entity_id'=>$itemId,'investigation_id'=>$investigationId];
}

function restore_deleted_investigation_media(PDO $pdo,array $change,array $before): array
{
    $link=$before['media_link']??[];$linkId=safe_int($link['id']??$change['entity_id']??0);
    if(!$linkId)throw new RuntimeException('Média d’enquête introuvable dans le snapshot.');
    if(record_exists($pdo,'investigation_media',$linkId))throw new RuntimeException('Ce média d’enquête existe déjà.');
    $investigationId=safe_int($link['investigation_id']??0);
    if(!$investigationId||!record_exists($pdo,'investigations',$investigationId))throw new RuntimeException('L’enquête liée à ce média n’existe plus.');
    if(!record_exists($pdo,'media',safe_int($link['media_id']??0)))throw new RuntimeException('Le média lié n’existe plus.');
    insert_snapshot_row($pdo,'investigation_media',$link);
    foreach(($before['media_items']??[]) as $row)if(record_exists($pdo,'investigation_items',safe_int($row['investigation_item_id']??0)))insert_snapshot_row($pdo,'investigation_media_items',$row,true);
    $pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$investigationId]);
    log_change($pdo,'investigation_media',$linkId,'restore','Restauration du média d’enquête #'.$linkId,null,['restored_from_change_id'=>(int)$change['id'],'link_id'=>$linkId]);
    return ['entity_type'=>'investigation_media','entity_id'=>$linkId,'investigation_id'=>$investigationId];
}

/**
 * Une ligne CSV. Le caractère d'échappement est donné explicitement (« \\ », la valeur utilisée jusqu'ici) :
 * PHP 8.4+ signale sinon un avertissement à chaque ligne (des milliers par export) et changera cette valeur.
 */
function csv_row($out, array $fields): void
{
    // Un texte qui commence par = + - @ serait lu comme une formule par Excel / Numbers / LibreOffice : on le protège par une apostrophe.
    $fields = array_map(static fn($v) => is_string($v) && $v !== '' && strpbrk($v[0], "=+-@\t\r") !== false && !is_numeric($v) ? "'" . $v : $v, $fields);
    fputcsv($out, $fields, ',', '"', '\\');
}

function export_csv(PDO $pdo): never
{
    $type=safe_text($_GET['type']??'persons');
    $filename='genealogie-'.$type.'-'.date('Ymd-His').'.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="'.$filename.'"');
    $out=fopen('php://output','w');
    fwrite($out, "\xEF\xBB\xBF");
    if($type==='events'){
        csv_row($out,['id','type','date','annee','personne','lieu','pays']);
        foreach(export_event_rows($pdo) as $row)csv_row($out,$row);
    } elseif($type==='media'){
        csv_row($out,['id','titre','date','fichier','rattachement','reference_document','registre_livre','lien_web','pages','transcription']);
        foreach(media_list_rows($pdo,'%%',100000,0) as $row)csv_row($out,[$row['id'],$row['title'],$row['date_text'],$row['filename'],$row['attachment_label'],$row['document_reference'],$row['document_title'],$row['document_url'],$row['document_pages'],$row['transcription']]);
    } elseif($type==='changes'){
        csv_row($out,['date','entite','id','action','resume']);
        $rows=$pdo->query('SELECT * FROM change_log ORDER BY created_at DESC,id DESC');
        foreach($rows as $row)csv_row($out,[$row['created_at'],$row['entity_type'],$row['entity_id'],$row['action'],$row['summary']]);
    } else {
        csv_row($out,['id','prenom','autres_prenoms','nom','groupe','naissance','deces','statut','a_verifier','metier']);
        $rows=$pdo->query(person_select()." ORDER BY p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE");
        foreach($rows as $row){if(!export_person_allowed($row))continue;csv_row($out,[$row['id'],$row['first_name'],$row['middle_name'],$row['last_name'],$row['surname_group'],$row['birth_date']?:$row['birth_year'],$row['death_date']?:$row['death_year'],$row['living_status'],$row['verify_status'],$row['occupation']]);}
    }
    fclose($out);
    exit;
}

function export_privacy_enabled(): bool
{
    return ($_GET['privacy'] ?? '') === '1';
}

function export_death_cutoff_year(): ?int
{
    $year = isset($_GET['death_cutoff_year']) ? (int) $_GET['death_cutoff_year'] : 0;
    return $year > 0 ? $year : null;
}

function export_option_enabled(string $key, bool $default = true): bool
{
    if (!isset($_GET[$key])) return $default;
    return !in_array(strtolower((string)$_GET[$key]), ['0','false','off','no'], true);
}

/**
 * Les événements à exporter (CSV) : ceux d'une personne, et ceux d'un couple (mariage, divorce…) avec les deux noms.
 * Un événement n'est exporté que si chaque personne concernée peut l'être (vivants, fiches privées, délai après décès).
 */
function export_event_rows(PDO $pdo): array
{
    $people = [];
    foreach ($pdo->query("SELECT p.id,trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS name,p.living_status,p.is_private,
            (SELECT min(be.year) FROM events be JOIN event_types bt ON bt.id=be.event_type_id WHERE be.person_id=p.id AND bt.gedcom_tag IN ('BIRT','CHR','BAPM')) AS birth_year,
            (SELECT min(de.year) FROM events de JOIN event_types dt ON dt.id=de.event_type_id WHERE de.person_id=p.id AND dt.gedcom_tag IN ('DEAT','BURI')) AS death_year FROM persons p") as $p) { $people[(int) $p['id']] = $p; }
    $out = [];
    foreach ($pdo->query("SELECT e.id,t.label,e.date_text,e.year,e.person_id,f.partner1_id,f.partner2_id,pl.name AS place,pl.country FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id LEFT JOIN places pl ON pl.id=e.place_id ORDER BY COALESCE(e.year,9999),e.id") as $e) {
        $who = array_values(array_filter(array_map('intval', $e['person_id'] ? [$e['person_id']] : [$e['partner1_id'], $e['partner2_id']])));
        foreach ($who as $pid) { if (isset($people[$pid]) && !export_person_allowed($people[$pid])) { continue 2; } }
        $out[] = [$e['id'], $e['label'], $e['date_text'], $e['year'], implode(' & ', array_map(static fn($pid) => $people[$pid]['name'] ?? '', $who)), $e['place'], $e['country']];
    }
    return $out;
}

function export_person_allowed(array $row): bool
{
    // « Probablement vivant » : statut inconnu, né il y a moins de 100 ans, sans décès connu (comme l'export GEDCOM)
    $birth = isset($row['birth_year']) && $row['birth_year'] !== null && $row['birth_year'] !== '' ? (int) $row['birth_year'] : null;
    $probablyLiving = ($row['living_status'] ?? '') === 'living' || (in_array($row['living_status'] ?? '', ['', 'unknown'], true) && $birth && $birth > (int) date('Y') - 100 && empty($row['death_year']));
    if (!export_option_enabled('include_living', true) && $probablyLiving) return false;
    if (!export_privacy_enabled()) return true;
    if ($probablyLiving || (int) ($row['is_private'] ?? 0) === 1) return false;
    $cutoff = export_death_cutoff_year();
    $deathYear = isset($row['death_year']) && $row['death_year'] !== null && $row['death_year'] !== '' ? (int) $row['death_year'] : null;
    if ($cutoff && $deathYear && $deathYear >= $cutoff) return false;
    return true;
}

// ─── Export CSV global (toutes tables en un seul fichier multi-sections) ─────

function export_csv_global(PDO $pdo): never
{
    $filename='genealogie-global-'.date('Ymd-His').'.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="'.$filename.'"');
    $out=fopen('php://output','w');
    fwrite($out,"\xEF\xBB\xBF");

    // Section personnes
    csv_row($out,['## PERSONNES']);
    csv_row($out,['id','prenom','autres_prenoms','nom','groupe','naissance','deces','statut','a_verifier','metier']);
    $rows=$pdo->query(person_select().' ORDER BY p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE');
    foreach($rows as $row){if(!export_person_allowed($row))continue;csv_row($out,[$row['id'],$row['first_name'],$row['middle_name'],$row['last_name'],$row['surname_group'],$row['birth_date']?:$row['birth_year'],$row['death_date']?:$row['death_year'],$row['living_status'],$row['verify_status'],$row['occupation']]);}
    csv_row($out,[]);

    // Section événements
    csv_row($out,['## EVENEMENTS']);
    csv_row($out,['id','type','date','annee','personne','lieu','pays']);
    foreach(export_event_rows($pdo) as $row)csv_row($out,$row);
    csv_row($out,[]);

    // Section médias
    csv_row($out,['## MEDIAS']);
    csv_row($out,['id','titre','date','fichier','rattachement','reference_document','registre_livre','lien_web','pages','transcription']);
    foreach(media_list_rows($pdo,'%%',100000,0) as $row)csv_row($out,[$row['id'],$row['title'],$row['date_text'],$row['filename'],$row['attachment_label'],$row['document_reference'],$row['document_title'],$row['document_url'],$row['document_pages'],$row['transcription']]);
    csv_row($out,[]);

    // Section journal
    csv_row($out,['## JOURNAL DES MODIFICATIONS']);
    csv_row($out,['date','entite','id','action','resume']);
    $rows=$pdo->query('SELECT * FROM change_log ORDER BY created_at DESC,id DESC');
    foreach($rows as $row)csv_row($out,[$row['created_at'],$row['entity_type'],$row['entity_id'],$row['action'],$row['summary']]);

    fclose($out);
    exit;
}

// ─── Export JSON complet ──────────────────────────────────────────────────────

function export_json(PDO $pdo): never
{
    $filename='genealogie-'.date('Ymd-His').'.json';
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="'.$filename.'"');

    $persons=array_values(array_filter($pdo->query(person_select().' ORDER BY p.id')->fetchAll(), 'export_person_allowed'));
    $visiblePersonIds=array_fill_keys(array_map(static fn($p)=>(int)$p['id'],$persons), true);
    $families=$pdo->query('SELECT * FROM families ORDER BY id')->fetchAll();
    $families=array_values(array_filter($families,static fn($f)=>isset($visiblePersonIds[(int)($f['partner1_id']??0)])||isset($visiblePersonIds[(int)($f['partner2_id']??0)])));
    $keptFamilyIds=array_fill_keys(array_map(static fn($f)=>(int)$f['id'],$families),true);
    $events=array_values(array_filter($pdo->query("SELECT e.*,t.slug,t.gedcom_tag,t.label AS type_label,pl.name AS place_name,pl.subdivision,pl.county,pl.state,pl.country FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id ORDER BY e.id")->fetchAll(),static fn($e)=>(int)($e['person_id']??0)?isset($visiblePersonIds[(int)$e['person_id']]):(!(int)($e['family_id']??0)||isset($keptFamilyIds[(int)$e['family_id']]))));
    // Notes : seulement celles d'une fiche, d'une famille ou d'un événement exportés (pas celles des vivants exclus)
    $keptEventIds=array_fill_keys(array_map(static fn($e)=>(int)$e['id'],$events),true);
    $notes=array_values(array_filter($pdo->query('SELECT * FROM notes ORDER BY id')->fetchAll(),static fn($n)=>match((string)($n['entity_type']??'')){'person'=>isset($visiblePersonIds[(int)$n['entity_id']]),'family'=>isset($keptFamilyIds[(int)$n['entity_id']]),'event'=>isset($keptEventIds[(int)$n['entity_id']]),default=>true}));
    $sources=$pdo->query('SELECT * FROM sources ORDER BY id')->fetchAll();
    // Seulement les lieux cités par la généalogie (toute colonne place_id) : la table contient aussi le répertoire
    // des communes et lieux du monde (dizaines de milliers de lignes), qui faisait manquer de mémoire.
    $used=[];
    foreach($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name<>'places'")->fetchAll(PDO::FETCH_COLUMN) as $table){
        $cols=array_column($pdo->query('PRAGMA table_info('.$pdo->quote((string)$table).')')->fetchAll(),'name');
        foreach($cols as $col){if($col==='place_id'||str_ends_with((string)$col,'_place_id')){$used[]='SELECT "'.str_replace('"','""',$col).'" FROM "'.str_replace('"','""',(string)$table).'"';}}
    }
    $places=$used?$pdo->query('SELECT * FROM places WHERE id IN ('.implode(' UNION ',$used).') ORDER BY id')->fetchAll():[];

    // Écrit morceau par morceau (moins de mémoire qu'un seul json_encode de tout)
    $flags=JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT;
    $parts=['meta'=>['exported_at'=>date('c'),'generator'=>'Genealogie','version'=>'1.0'],'persons'=>$persons,'families'=>$families,'events'=>$events,'notes'=>$notes,'sources'=>$sources,'places'=>$places];
    echo "{\n";$first=true;
    foreach($parts as $key=>$value){echo ($first?'':",\n").'    '.json_encode($key).': '.str_replace("\n","\n    ",(string)json_encode($value,$flags));$first=false;unset($parts[$key]);}
    echo "\n}";
    exit;
}

// ─── Export SQLite (téléchargement direct du .db) ─────────────────────────────

function export_sqlite(PDO $pdo): never
{
    // Instantané cohérent via VACUUM INTO (même méthode que la sauvegarde) : la taille annoncée est celle du
    // fichier réellement envoyé. Avant, Content-Length était mesuré AVANT le checkpoint du journal WAL, qui
    // agrandit le fichier : le téléchargement était tronqué (base illisible) ou refusé par le navigateur.
    $tmp = tempnam(sys_get_temp_dir(), 'genealogie-export-');
    if ($tmp === false) {
        json_response(['error' => 'Impossible de créer le fichier temporaire d’export.'], 500);
    }
    register_shutdown_function(static function () use ($tmp): void {
        if (is_file($tmp)) {
            @unlink($tmp);
        }
    });
    try {
        $pdo->exec('VACUUM main INTO ' . $pdo->quote($tmp));
    } catch (Throwable $e) {
        json_response(['error' => 'Export impossible : ' . $e->getMessage()], 500);
    }
    clearstatcache(true, $tmp);
    $size = (int) filesize($tmp);
    ignore_user_abort(true);
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    $filename = 'genealogie-' . date('Ymd-His') . '.db';
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . $size);
    header('Cache-Control: no-store');
    readfile($tmp);
    exit;
}

function export_research_report(PDO $pdo): never
{
    $filename = 'rapport-recherche-' . date('Ymd-His') . '.html';
    header('Content-Type: text/html; charset=utf-8');
    header('Content-Disposition: attachment; filename="'.$filename.'"');
    $esc = static fn($value) => htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $journal = $pdo->query("SELECT rj.*,trim(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,'')) AS person_name FROM research_journal rj LEFT JOIN persons p ON p.id=rj.person_id ORDER BY rj.updated_at DESC,rj.id DESC")->fetchAll();
    $investigations = $pdo->query("SELECT i.*,trim(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,'')) AS person_name FROM investigations i LEFT JOIN persons p ON p.id=i.person_id ORDER BY i.updated_at DESC,i.id DESC")->fetchAll();
    $items = $pdo->query("SELECT ii.*,i.title AS investigation_title FROM investigation_items ii JOIN investigations i ON i.id=ii.investigation_id ORDER BY i.updated_at DESC,ii.id DESC")->fetchAll();
    $evidence = $pdo->query("SELECT er.*,trim(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,'')) AS person_name,et.label AS event_label,e.date_text AS event_date,s.title AS source_title FROM evidence_records er LEFT JOIN persons p ON p.id=er.person_id LEFT JOIN events e ON e.id=er.event_id LEFT JOIN event_types et ON et.id=e.event_type_id LEFT JOIN sources s ON s.id=er.source_id ORDER BY er.updated_at DESC,er.id DESC")->fetchAll();
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport de recherche généalogique</title><style>body{font-family:Arial,sans-serif;line-height:1.45;margin:36px;color:#111}h1{font-size:34px;margin:0 0 8px}h2{border-bottom:3px solid #111;padding-bottom:6px;margin-top:32px}.meta{color:#666}.card{border:2px solid #111;padding:14px;margin:12px 0}.tag{display:inline-block;border:1px solid #111;padding:2px 6px;font-weight:700;font-size:12px;text-transform:uppercase}.muted{color:#666}pre{white-space:pre-wrap;font:inherit}@media print{body{margin:18mm}.card{break-inside:avoid}}</style></head><body>';
    echo '<h1>Rapport de recherche généalogique</h1><p class="meta">Export généré le '.$esc(date('d/m/Y H:i')).'</p>';
    echo '<h2>Journal de recherche</h2>';
    if (!$journal) echo '<p class="muted">Aucune entrée de journal.</p>';
    foreach ($journal as $row) {
        echo '<article class="card"><span class="tag">Journal</span><h3>'.$esc($row['title'] ?: 'Entrée sans titre').'</h3><p class="muted">'.$esc($row['person_name'] ?: 'Personne non liée').' · '.$esc($row['updated_at']).'</p>';
        if (($row['body'] ?? '') !== '') echo '<pre>'.$esc($row['body']).'</pre>';
        if (($row['result'] ?? '') !== '') echo '<p><strong>Résultat :</strong> '.$esc($row['result']).'</p>';
        if (($row['next_step'] ?? '') !== '') echo '<p><strong>Prochaine étape :</strong> '.$esc($row['next_step']).'</p>';
        echo '</article>';
    }
    echo '<h2>Enquêtes et pistes</h2>';
    if (!$investigations) echo '<p class="muted">Aucune enquête.</p>';
    foreach ($investigations as $investigation) {
        echo '<article class="card"><span class="tag">Enquête</span><h3>'.$esc($investigation['title'] ?: 'Enquête sans titre').'</h3><p class="muted">'.$esc($investigation['person_name'] ?: 'Personne non liée').' · '.$esc($investigation['status']).'</p>';
        if (($investigation['question'] ?? '') !== '') echo '<p><strong>Question :</strong> '.$esc($investigation['question']).'</p>';
        $children = array_values(array_filter($items, static fn($item) => (int)$item['investigation_id'] === (int)$investigation['id']));
        if ($children) {
            echo '<ul>';
            foreach ($children as $item) echo '<li><strong>'.$esc($item['title']).'</strong> <span class="muted">'.$esc($item['kind']).' · '.$esc($item['status']).'</span>'.(($item['url'] ?? '') !== '' ? ' · '.$esc($item['url']) : '').'</li>';
            echo '</ul>';
        }
        echo '</article>';
    }
    echo '<h2>Éléments de preuve</h2>';
    if (!$evidence) echo '<p class="muted">Aucun élément de preuve.</p>';
    foreach ($evidence as $row) {
        echo '<article class="card"><span class="tag">'.$esc($row['quality'] ?: 'preuve').'</span><h3>'.$esc($row['claim'] ?: 'Élément sans titre').'</h3><p class="muted">'.$esc($row['person_name'] ?: 'Personne non liée').(($row['event_label'] ?? '') ? ' · '.$esc($row['event_label'].' '.$row['event_date']) : '').(($row['source_title'] ?? '') ? ' · Source : '.$esc($row['source_title']) : '').'</p>';
        if (($row['analysis'] ?? '') !== '') echo '<pre>'.$esc($row['analysis']).'</pre>';
        echo '</article>';
    }
    echo '</body></html>';
    exit;
}

function family_book_person_set(array $people): array
{
    $set = [];
    foreach ($people as $person) $set[(int)$person['id']] = true;
    return $set;
}

function family_book_media_src(?string $filename): string
{
    $filename = trim((string)$filename);
    if ($filename === '') return '';
    // Livret téléchargé (fichier ouvert hors de l'app) : les petites images sont rangées dans le fichier lui-même,
    // sinon « media/… » ne mène nulle part. Livret ouvert dans l'app (inline=1) : l'adresse de l'app suffit.
    if (($_GET['inline'] ?? '') !== '1') {
        $root = realpath(MEDIA_DIR);
        $path = $root !== false ? realpath($root . '/' . $filename) : false;
        if ($path && str_starts_with($path, $root . DIRECTORY_SEPARATOR) && is_file($path) && filesize($path) <= 700 * 1024) {
            $mime = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif'][strtolower(pathinfo($path, PATHINFO_EXTENSION))] ?? '';
            if ($mime !== '') return 'data:' . $mime . ';base64,' . base64_encode((string) file_get_contents($path));
        }
    }
    return 'media/' . rawurlencode($filename);
}

/**
 * Livre d'une branche : les ancêtres (Sosa) et/ou les descendants (d'Aboville) d'une personne, sur N générations.
 * Renvoie [personnes gardées dans l'ordre du livre, numéros affichés par personne, titre].
 */
function family_book_branch(PDO $pdo, array $people, int $rootId, string $scope, int $generations): array
{
    $byId = [];
    foreach ($people as $person) $byId[(int)$person['id']] = $person;
    if (!$rootId || $scope === 'all' || !isset($byId[$rootId])) return [$people, [], ''];
    $order = []; $numbers = [];
    if ($scope === 'ancestors' || $scope === 'both') {
        $positions = sosa_positions($pdo, $rootId, 200000)['positions'] ?? [];
        ksort($positions);
        foreach ($positions as $sosa => $pid) {
            if ((int) floor(log((float) $sosa, 2)) + 1 > $generations) break;
            $numbers[$pid]['sosa'][] = $sosa;
            $order[$pid] ??= count($order);
        }
    }
    if ($scope === 'descendants' || $scope === 'both') {
        $positions = daboville_positions($pdo, $rootId, 200000)['positions'] ?? [];
        uksort($positions, 'strnatcmp');
        foreach ($positions as $num => $pid) {
            if (substr_count((string) $num, '.') + 1 > $generations) continue;
            $numbers[$pid]['daboville'][] = (string) $num;
            $order[$pid] ??= count($order);
        }
    }
    $kept = array_values(array_filter(array_map(static fn($pid) => $byId[$pid] ?? null, array_keys($order))));
    $name = full_name($byId[$rootId]);
    $title = ['ancestors' => 'Ascendance de ', 'descendants' => 'Descendance de ', 'both' => 'Ascendance et descendance de '][$scope] . $name;
    return [$kept, $numbers, $title];
}

function family_book_life_label(string $status): string
{
    return match ($status) {
        'living' => 'Vivante',
        'deceased' => 'Décédée',
        default => 'À vérifier',
    };
}

function export_family_book(PDO $pdo): never
{
    // Parties, ordre, allure et format choisis dans Export propre (lib/family_book.php)
    family_book_send($pdo, $_GET);
}

// ─── Sauvegarde SQLite locale programmée/manuelle ────────────────────────────

function default_backup_dir(): string
{
    return DATA_DIR . '/backups';
}

function normalize_backup_dir(string $dir): string
{
    $dir = trim($dir);
    if ($dir === '') {
        return default_backup_dir();
    }
    if (str_starts_with($dir, '~/')) {
        $home = getenv('HOME') ?: (getenv('USERPROFILE') ?: '');
        if ($home !== '') {
            $dir = $home . substr($dir, 1);
        }
    }
    $isAbsolute = str_starts_with($dir, '/') || preg_match('/^[A-Za-z]:[\\\\\\/]/', $dir);
    if (!$isAbsolute) {
        $relative = ltrim(str_replace('\\', '/', $dir), '/');
        $dir = str_starts_with($relative, 'data/') ? DATA_DIR . '/' . substr($relative, 5) : APP_ROOT . '/' . $relative;
    }
    return rtrim($dir, "/\\");
}

function backup_files(string $dir): array
{
    $files = glob($dir . '/genealogie-backup-*.db') ?: [];
    usort($files, static fn($a, $b) => filemtime($b) <=> filemtime($a));
    return array_values(array_map(static fn($file) => [
        'name' => basename($file),
        'path' => $file,
        'size' => is_file($file) ? filesize($file) : 0,
        'modified_at' => is_file($file) ? date('c', filemtime($file)) : '',
    ], $files));
}

function backup_sqlite_status(PDO $pdo, string $dir, int $maxFiles = 10): never
{
    $path = normalize_backup_dir($dir);
    $exists = is_dir($path);
    $writable = $exists && is_writable($path);
    $files = $exists ? backup_files($path) : [];
    json_response([
        'dir' => $path,
        'default_dir' => default_backup_dir(),
        'exists' => $exists,
        'writable' => $writable,
        'max_files' => max(2, min(50, $maxFiles)),
        'files' => array_slice($files, 0, 20),
        'count' => count($files),
        'last_backup' => $files[0] ?? null,
        'db_size' => is_file(DB_PATH) ? filesize(DB_PATH) : 0,
    ]);
}

function backup_sqlite(PDO $pdo, array $data): never
{
    $dir = normalize_backup_dir(safe_text($data['dir'] ?? ''));
    $maxFiles = max(2, min(50, safe_int($data['max_files'] ?? 10, 10)));
    $mode = safe_text($data['mode'] ?? 'manual');
    if (!in_array($mode, ['manual', 'auto'], true)) {
        $mode = 'manual';
    }
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException("Impossible de créer le dossier de sauvegarde : {$dir}");
    }
    if (!is_writable($dir)) {
        throw new RuntimeException("Dossier non accessible en écriture : {$dir}");
    }
    if (!is_file(DB_PATH)) {
        throw new RuntimeException('Fichier de base introuvable');
    }

    $pdo->exec('PRAGMA wal_checkpoint(FULL)');
    $filename = 'genealogie-backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '-' . $mode . '.db';
    $target = $dir . '/' . $filename;
    $pdo->exec('VACUUM main INTO ' . $pdo->quote($target));

    $files = backup_files($dir);
    $deleted = [];
    // Les copies faites avant une mise à jour de structure (« -migration- ») ou un nettoyage ne sont jamais supprimées ici.
    $rotating = array_values(array_filter($files, static fn($file) => !str_contains($file['name'], '-migration-') && !str_contains($file['name'], '-avant-nettoyage') && !str_contains($file['name'], '-avant-fusion')));
    foreach (array_slice($rotating, $maxFiles) as $file) {
        if (is_file($file['path']) && @unlink($file['path'])) {
            $deleted[] = $file['name'];
        }
    }

    json_response([
        'ok' => true,
        'file' => $filename,
        'path' => $target,
        'size' => is_file($target) ? filesize($target) : 0,
        'dir' => $dir,
        'deleted' => $deleted,
        'kept' => min(count($files), $maxFiles),
        'created_at' => date('c'),
    ]);
}

function safety_backup_file(string $name): ?string
{
    $name=basename(trim($name));
    if($name===''||!preg_match('/^genealogie-backup-[A-Za-z0-9._-]+\.db$/',$name))return null;
    $path=default_backup_dir().'/'.$name;
    return is_file($path)?$path:null;
}

function safety_media_path(string $filename): ?string
{
    $filename=basename(trim(str_replace('\\','/',$filename)));
    if($filename===''||$filename==='.'||$filename==='..')return null;
    return MEDIA_DIR.'/'.$filename;
}

function safety_integrity(PDO $db): string
{
    try{return (string)$db->query('PRAGMA integrity_check')->fetchColumn();}catch(Throwable $e){return 'erreur : '.$e->getMessage();}
}

function safety_file_candidates(): array
{
    $dir=MEDIA_DIR;if(!is_dir($dir))return [];
    $rows=[];
    foreach(new DirectoryIterator($dir) as $file){
        if($file->isDot()||!$file->isFile())continue;
        $name=$file->getFilename();
        if(str_starts_with($name,'.'))continue;
        $rows[]=['name'=>$name,'size'=>$file->getSize()];
    }
    usort($rows,static fn($a,$b)=>strnatcasecmp($a['name'],$b['name']));
    return $rows;
}

function data_health_report(PDO $pdo): never
{
    $media=$pdo->query('SELECT id,title,filename,thumbnail FROM media WHERE trim(COALESCE(filename,\'\'))<>\'\' ORDER BY id')->fetchAll();
    $missing=[];$linked=[];
    foreach($media as $row){$path=safety_media_path((string)$row['filename']);if(!$path||!is_file($path))$missing[]=['id'=>(int)$row['id'],'title'=>(string)$row['title'],'filename'=>(string)$row['filename']];else $linked[basename((string)$row['filename'])]=true;}
    foreach($pdo->query('SELECT filename FROM media_versions')->fetchAll(PDO::FETCH_COLUMN) as $versionFile)$linked[basename((string)$versionFile)]=true; // versions d'une photo retouchée : gardées exprès
    $files=safety_file_candidates();$orphans=array_values(array_filter($files,static fn($file)=>!isset($linked[$file['name']])));
    $counts=[];foreach(['persons','families','events','sources','media','notes'] as $table){try{$counts[$table]=(int)$pdo->query("SELECT count(*) FROM {$table}")->fetchColumn();}catch(Throwable){$counts[$table]=0;}}
    $pdo->exec('CREATE TABLE IF NOT EXISTS backup_restore_tests (id INTEGER PRIMARY KEY AUTOINCREMENT, backup_name TEXT NOT NULL, integrity TEXT NOT NULL, tested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS database_comparison_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, source_name TEXT NOT NULL, summary_json TEXT NOT NULL DEFAULT \'{}\', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $lastTest=$pdo->query('SELECT backup_name,integrity,tested_at FROM backup_restore_tests ORDER BY id DESC LIMIT 1')->fetch()?:null;
    $comparisons=$pdo->query('SELECT source_name,summary_json,created_at FROM database_comparison_reports ORDER BY id DESC LIMIT 8')->fetchAll();
    foreach($comparisons as &$comparison){$summary=json_decode((string)$comparison['summary_json'],true);$comparison['summary']=is_array($summary)?$summary:[];unset($comparison['summary_json']);}unset($comparison);
    $backups=backup_files(default_backup_dir());
    json_response(['database'=>['key'=>active_database_key(),'size'=>is_file(DB_PATH)?filesize(DB_PATH):0,'integrity'=>safety_integrity($pdo),'counts'=>$counts], 'media'=>['registered'=>count($media),'missing'=>$missing,'orphan_files'=>array_slice($orphans,0,120),'orphan_count'=>count($orphans)], 'backups'=>['files'=>array_slice($backups,0,20),'last_restore_test'=>$lastTest], 'comparisons'=>$comparisons]);
}

function clone_database(PDO $pdo,array $data): never
{
    $label=safe_text($data['name']??'');$slug=preg_replace('/[^A-Za-z0-9_-]+/','-',trim($label));$slug=trim((string)$slug,'-');if($slug==='')$slug='test';
    $dir=DATA_DIR.'/bases';if(!is_dir($dir)&&!mkdir($dir,0775,true)&&!is_dir($dir))throw new RuntimeException('Impossible de créer le dossier des bases de test.');
    $target=$dir.'/'.date('Ymd-His').'-'.$slug.'.sqlite';
    $pdo->exec('PRAGMA wal_checkpoint(FULL)');$pdo->exec('VACUUM main INTO '.$pdo->quote($target));
    json_response(['ok'=>true,'key'=>'data/bases/'.basename($target),'name'=>basename($target),'size'=>is_file($target)?filesize($target):0]);
}

function test_backup_restore(PDO $pdo,array $data): array
{
    $path=safety_backup_file(safe_text($data['backup_name']??''));if(!$path)throw new RuntimeException('Sauvegarde introuvable.');
    $temporary=tempnam(sys_get_temp_dir(),'genealogy-restore-test-');if($temporary===false||!@copy($path,$temporary))throw new RuntimeException('Impossible de créer la copie temporaire de restauration.');
    try{$test=new PDO('sqlite:'.$temporary,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$integrity=safety_integrity($test);$hasPersons=(int)$test->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='persons'")->fetchColumn()===1;}finally{@unlink($temporary);}
    $status=$integrity==='ok'&&$hasPersons?'ok':$integrity.($hasPersons?'':' · table persons absente');
    $pdo->exec('CREATE TABLE IF NOT EXISTS backup_restore_tests (id INTEGER PRIMARY KEY AUTOINCREMENT, backup_name TEXT NOT NULL, integrity TEXT NOT NULL, tested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->prepare('INSERT INTO backup_restore_tests(backup_name,integrity) VALUES(?,?)')->execute([basename($path),$status]);
    return ['backup_name'=>basename($path),'integrity'=>$status,'tested_at'=>date('c')];
}

function repair_media_path(PDO $pdo,array $data): array
{
    $id=safe_int($data['media_id']??0);$replacement=basename(safe_text($data['filename']??''));if(!$id||$replacement==='')throw new RuntimeException('Média ou fichier manquant.');
    $path=safety_media_path($replacement);if(!$path||!is_file($path))throw new RuntimeException('Le fichier choisi n’existe pas dans le dossier media.');
    $stmt=$pdo->prepare('SELECT * FROM media WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Média introuvable.');
    $thumbnail=(string)($before['thumbnail']??'')===(string)($before['filename']??'')?$replacement:(string)($before['thumbnail']??'');
    $pdo->prepare('UPDATE media SET filename=?,thumbnail=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$replacement,$thumbnail,$id]);
    log_change($pdo,'media',$id,'repair-path','Chemin du média réparé : '.$replacement,$before,['id'=>$id,'filename'=>$replacement]);
    return ['id'=>$id,'filename'=>$replacement];
}

function safety_comparison_source(string $source): ?array
{
    if(str_starts_with($source,'backup:')){$path=safety_backup_file(substr($source,7));return $path?['label'=>basename($path),'path'=>$path]:null;}
    $path=database_path_from_key($source);return $path?['label'=>$source,'path'=>$path]:null;
}

function safety_database_snapshot(PDO $pdo): array
{
    $counts=[];foreach(['persons','families','events','sources','media'] as $table){$counts[$table]=(int)$pdo->query("SELECT count(*) FROM {$table}")->fetchColumn();}
    $people=$pdo->query("SELECT p.id,trim(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,'')) AS name,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year FROM persons p")->fetchAll();
    $byKey=[];foreach($people as $row){$key=mb_strtolower(trim((string)$row['name']));if($key!=='')$byKey[$key]=$row;}
    $sources=$pdo->query("SELECT lower(trim(COALESCE(title,''))) FROM sources WHERE trim(COALESCE(title,''))<>''")->fetchAll(PDO::FETCH_COLUMN);
    return ['counts'=>$counts,'people'=>$byKey,'sources'=>array_fill_keys($sources,true)];
}

function compare_database_data(PDO $pdo,string $source): never
{
    $target=safety_comparison_source($source);if(!$target)json_response(['error'=>'Base ou sauvegarde de comparaison introuvable.'],422);
    try{$other=new PDO('sqlite:'.$target['path'],null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$current=safety_database_snapshot($pdo);$reference=safety_database_snapshot($other);}catch(Throwable $e){json_response(['error'=>'Comparaison impossible : '.$e->getMessage()],422);}
    $added=[];$removed=[];$changed=[];
    foreach($current['people'] as $key=>$row){if(!isset($reference['people'][$key])){$added[]=$row;continue;}$old=$reference['people'][$key];if((string)($row['birth_year']??'')!==(string)($old['birth_year']??'')||(string)($row['death_year']??'')!==(string)($old['death_year']??''))$changed[]=['name'=>$row['name'],'before'=>['birth_year'=>$old['birth_year']??null,'death_year'=>$old['death_year']??null],'after'=>['birth_year'=>$row['birth_year']??null,'death_year'=>$row['death_year']??null]];}
    foreach($reference['people'] as $key=>$row)if(!isset($current['people'][$key]))$removed[]=$row;
    $newSources=array_keys(array_diff_key($current['sources'],$reference['sources']));
    json_response(['source'=>$target['label'],'current_counts'=>$current['counts'],'source_counts'=>$reference['counts'],'summary'=>['persons_added'=>count($added),'persons_removed'=>count($removed),'dates_changed'=>count($changed),'sources_new'=>count($newSources)],'persons_added'=>array_slice($added,0,80),'persons_removed'=>array_slice($removed,0,80),'dates_changed'=>array_slice($changed,0,80),'sources_new'=>array_slice($newSources,0,80)]);
}

function save_database_comparison_report(PDO $pdo,array $data): array
{
    $source=safe_text($data['source_name']??'');$summary=$data['summary']??[];
    if($source==='')throw new RuntimeException('Source de comparaison manquante.');
    if(!is_array($summary))$summary=[];
    $pdo->exec('CREATE TABLE IF NOT EXISTS database_comparison_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, source_name TEXT NOT NULL, summary_json TEXT NOT NULL DEFAULT \'{}\', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->prepare('INSERT INTO database_comparison_reports(source_name,summary_json) VALUES(?,?)')->execute([$source,json_encode($summary,JSON_UNESCAPED_UNICODE)]);
    return ['id'=>(int)$pdo->lastInsertId()];
}

// ─── Vérificateur GEDCOM (analyse d'un fichier uploadé via POST multipart) ───

function verify_gedcom(PDO $pdo): never
{
    if($_SERVER['REQUEST_METHOD']!=='POST'){json_response(['error'=>'POST requis'],405);}
    $file=$_FILES['file']??null;
    if(!$file||$file['error']!==UPLOAD_ERR_OK){json_response(['error'=>upload_failure_message($file)],422);}
    $text=file_get_contents($file['tmp_name']);
    if($text===false){json_response(['error'=>'Lecture impossible'],500);}
    // Détection encodage
    $text=gedcom_text_to_utf8($text); // BOM, ANSEL, MS-DOS, Mac, UTF-16
    $lines=preg_split('/\r\n|\r|\n/',$text);
    // Version GEDCOM
    $version='inconnue';
    foreach($lines as $l){if(preg_match('/^2 VERS (.+)/',$l,$m)){$version=trim($m[1]);break;}}
    $isGedcom7=version_compare(preg_replace('/[^0-9.]/','',$version),'7.0','>=');

    $errors=[];$warnings=[];
    $tagCounts=['INDI'=>0,'FAM'=>0,'NOTE'=>0,'SOUR'=>0,'REPO'=>0,'OBJE'=>0];
    $definedXrefs=[];$usedXrefs=[];
    $lineNum=0;
    foreach($lines as $l){
        $lineNum++;
        $l=rtrim($l);
        if($l==='')continue;
        if(!preg_match('/^(\d+) (@[^@]+@ )?([A-Z_]+[0-9]*)(.*)$/',$l,$m)){
            $errors[]="Ligne $lineNum : format invalide → ".mb_substr($l,0,80);
            continue;
        }
        $level=(int)$m[1];$xref=trim($m[2]);$tag=$m[3];$rest=ltrim($m[4]);
        if($xref)$definedXrefs[trim($xref,'@ ')]=$lineNum;
        // Collect pointer usages
        if(preg_match('/@([^@]+)@/',$rest,$rx))$usedXrefs[trim($rx[1])]=$lineNum;
        if($level===0&&isset($tagCounts[$tag]))$tagCounts[$tag]++;
        // GEDCOM 5.5.1 : CHAR requis
    }
    // Pointeurs non définis
    foreach($usedXrefs as $xref=>$ln){
        if(!isset($definedXrefs[$xref])){
            $warnings[]="Référence non définie : @$xref@ (utilisée ligne $ln)";
        }
    }
    // HEAD obligatoire
    if(!preg_match('/^0 HEAD/m',$text))$errors[]='En-tête HEAD manquant.';
    if(!preg_match('/^0 TRLR/m',$text))$errors[]='Marqueur de fin TRLR manquant.';
    if($tagCounts['INDI']===0)$warnings[]='Aucun individu (INDI) trouvé.';

    // Prévisualisation légère : elle ne crée ni ne fusionne aucune donnée.
    $individuals=[];$currentId='';$current=[];$insideBirth=false;
    $flushIndividual=static function() use (&$individuals,&$currentId,&$current): void {
        if($currentId!=='')$individuals[]=['xref'=>$currentId,...$current];
    };
    foreach($lines as $rawLine){
        $line=rtrim($rawLine);
        if(preg_match('/^0 @([^@]+)@ INDI(?:\s|$)/',$line,$m)){
            $flushIndividual();$currentId=$m[1];$current=['first_name'=>'','last_name'=>'','birth_year'=>0];$insideBirth=false;continue;
        }
        if(preg_match('/^0 /',$line)){$flushIndividual();$currentId='';$current=[];$insideBirth=false;continue;}
        if($currentId==='')continue;
        if(preg_match('/^1 NAME (.+)$/',$line,$m)){
            $name=trim($m[1]);
            if(preg_match('/^(.*?)\s*\/([^\/]+)\//',$name,$parts)){$current['first_name']=trim($parts[1]);$current['last_name']=trim($parts[2]);}
            else $current['first_name']=$name;
            $insideBirth=false;continue;
        }
        if(preg_match('/^1 BIRT(?:\s|$)/',$line)){$insideBirth=true;continue;}
        if(preg_match('/^1 /',$line)){$insideBirth=false;continue;}
        if($insideBirth&&preg_match('/^2 DATE .*?(\d{4})/',$line,$m))$current['birth_year']=(int)$m[1];
    }
    $flushIndividual();
    $candidate=$pdo->prepare("SELECT p.id,p.first_name,p.last_name,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year
        FROM persons p WHERE lower(trim(COALESCE(p.first_name,'')))=lower(?) AND lower(trim(COALESCE(p.last_name,'')))=lower(?) LIMIT 3");
    $preview=['create'=>0,'possible_merge'=>0,'ignored'=>0,'rows'=>[]];
    foreach($individuals as $individual){
        $first=trim((string)($individual['first_name']??''));$last=trim((string)($individual['last_name']??''));$year=(int)($individual['birth_year']??0);
        if($first===''&&$last===''){$preview['ignored']++;continue;}
        $candidate->execute([$first,$last]);$matches=$candidate->fetchAll();
        $status='create';$detail='Nouvelle personne';
        if($matches){$status='possible_merge';$detail='Correspondance possible : '.implode(', ',array_map(static fn($p)=>trim($p['first_name'].' '.$p['last_name']).(($p['birth_year']??'')?' ('.(int)$p['birth_year'].')':''),$matches));}
        $preview[$status]++;
        if(count($preview['rows'])<60)$preview['rows'][]=['name'=>trim($first.' '.$last),'birth_year'=>$year?:null,'status'=>$status,'detail'=>$detail];
    }

    json_response([
        'version'=>$version,
        'is_gedcom7'=>$isGedcom7,
        'encoding'=>$encoding,
        'counts'=>$tagCounts,
        'errors'=>array_slice($errors,0,50),
        'warnings'=>array_slice($warnings,0,50),
        'valid'=>count($errors)===0,
        'lines_total'=>$lineNum,
        'import_preview'=>$preview,
    ]);
}

function gedcom_comparison_snapshot(string $text): array
{
    $text=gedcom_text_to_utf8($text);
    $people=[];$sources=[];$current=null;$section='';$inBirth=false;$inDeath=false;
    foreach(preg_split('/\r\n|\r|\n/',$text) as $line){
        $line=rtrim($line);
        if(preg_match('/^0 @([^@]+)@ INDI(?:\s|$)/',$line,$m)){$current=['xref'=>$m[1],'first'=>'','last'=>'','birth'=>'','death'=>''];$section='person';$inBirth=false;$inDeath=false;continue;}
        if(preg_match('/^0 @([^@]+)@ SOUR(?:\s|$)/',$line,$m)){$current=['xref'=>$m[1],'title'=>''];$section='source';continue;}
        if(preg_match('/^0 /',$line)){$current=null;$section='';$inBirth=false;$inDeath=false;continue;}
        if(!$current)continue;
        if($section==='person'){
            if(preg_match('/^1 NAME (.+)$/',$line,$m)){if(preg_match('/^(.*?)\s*\/([^\/]+)\//',$m[1],$name)){$current['first']=trim($name[1]);$current['last']=trim($name[2]);}else $current['first']=trim($m[1]);continue;}
            if(preg_match('/^1 BIRT(?:\s|$)/',$line)){$inBirth=true;$inDeath=false;continue;}
            if(preg_match('/^1 DEAT(?:\s|$)/',$line)){$inDeath=true;$inBirth=false;continue;}
            if(preg_match('/^1 /',$line)){$inBirth=false;$inDeath=false;continue;}
            if(($inBirth||$inDeath)&&preg_match('/^2 DATE (.+)$/',$line,$m)){if($inBirth)$current['birth']=trim($m[1]);else $current['death']=trim($m[1]);}
            $key=mb_strtolower(trim($current['first'].' '.$current['last']));if($key!=='')$people[$key]=$current;
        }elseif($section==='source'&&preg_match('/^1 (?:TITL|AUTH) (.+)$/',$line,$m)){$sources[mb_strtolower(trim($m[1]))]=trim($m[1]);}
    }
    return ['people'=>$people,'sources'=>$sources];
}

function compare_gedcom(PDO $pdo): never
{
    if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['error'=>'POST requis'],405);
    $left=$_FILES['file_a']??null;$right=$_FILES['file_b']??null;
    if(!$left||$left['error']!==UPLOAD_ERR_OK)json_response(['error'=>upload_failure_message($left,'Le GEDCOM de référence')],422);
    if(!$right||$right['error']!==UPLOAD_ERR_OK)json_response(['error'=>upload_failure_message($right,'Le nouveau GEDCOM')],422);
    $a=gedcom_comparison_snapshot((string)file_get_contents($left['tmp_name']));$b=gedcom_comparison_snapshot((string)file_get_contents($right['tmp_name']));
    $added=[];$removed=[];$changed=[];$conflicts=[];
    foreach($b['people'] as $key=>$person){if(!isset($a['people'][$key])){$added[]=$person;continue;}$old=$a['people'][$key];if($old['birth']!==$person['birth']||$old['death']!==$person['death'])$changed[]=['name'=>trim($person['first'].' '.$person['last']),'before'=>['birth'=>$old['birth'],'death'=>$old['death']],'after'=>['birth'=>$person['birth'],'death'=>$person['death']]];if($person['birth']!==''&&$person['death']!==''&&preg_match('/(\d{4})/',$person['birth'],$birth)&&preg_match('/(\d{4})/',$person['death'],$death)&&(int)$death[1]<(int)$birth[1])$conflicts[]=['name'=>trim($person['first'].' '.$person['last']),'detail'=>'décès antérieur à la naissance'];}
    foreach($a['people'] as $key=>$person)if(!isset($b['people'][$key]))$removed[]=$person;
    $sources=array_values(array_diff_key($b['sources'],$a['sources']));
    json_response(['summary'=>['persons_added'=>count($added),'persons_removed'=>count($removed),'dates_changed'=>count($changed),'sources_new'=>count($sources),'conflicts'=>count($conflicts)],'persons_added'=>array_slice($added,0,100),'persons_removed'=>array_slice($removed,0,100),'dates_changed'=>array_slice($changed,0,100),'sources_new'=>array_slice($sources,0,100),'conflicts'=>array_slice($conflicts,0,100)]);
}

// ─── Analyse d'import universelle (JSON / CSV / SQLite .db) ──────────────────

function import_analyse(PDO $pdo): never
{
    if($_SERVER['REQUEST_METHOD']!=='POST'){json_response(['error'=>'POST requis'],405);}
    $file=$_FILES['file']??null;
    if(!$file||$file['error']!==UPLOAD_ERR_OK){json_response(['error'=>upload_failure_message($file)],422);}
    $ext=strtolower(pathinfo($file['name'],PATHINFO_EXTENSION));
    $path=$file['tmp_name'];

    // ── JSON ──
    if($ext==='json'){
        $raw=file_get_contents($path);
        $data=json_decode($raw,true);
        if(!is_array($data)){json_response(['error'=>'JSON invalide ou non-objet'],422);}
        $keys=array_keys($data);
        $summary=[];
        foreach(['persons','families','events','notes','sources','places'] as $k){
            if(isset($data[$k])&&is_array($data[$k]))$summary[$k]=count($data[$k]);
        }
        // Compte déjà dans la base
        $existingPersons=(int)$pdo->query('SELECT count(*) FROM persons')->fetchColumn();
        json_response([
            'format'=>'json','keys'=>$keys,'summary'=>$summary,
            'existing_persons'=>$existingPersons,
            'fusion_needed'=>$existingPersons>0,
        ]);
    }

    // ── CSV ──
    if($ext==='csv'){
        $handle=fopen($path,'r');
        // Sauter BOM
        $bom=fread($handle,3);
        if($bom!=="\xEF\xBB\xBF")rewind($handle);
        $headers=fgetcsv($handle);
        $rowCount=0;
        while(fgetcsv($handle)!==false)$rowCount++;
        fclose($handle);
        $existingPersons=(int)$pdo->query('SELECT count(*) FROM persons')->fetchColumn();
        json_response([
            'format'=>'csv','headers'=>$headers,'row_count'=>$rowCount,
            'existing_persons'=>$existingPersons,
            'fusion_needed'=>$existingPersons>0,
        ]);
    }

    // ── SQLite .db ──
    if(in_array($ext,['db','sqlite'],true)){
        try{
            $importPdo=new PDO('sqlite:'.$path,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
            $tables=$importPdo->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
            $counts=[];
            foreach($tables as $t){
                try{$counts[$t]=(int)$importPdo->query("SELECT count(*) FROM \"$t\"")->fetchColumn();}catch(Throwable){$counts[$t]=-1;}
            }
            $existingPersons=(int)$pdo->query('SELECT count(*) FROM persons')->fetchColumn();
            // Tables attendues de la base généalogie
            $expectedTables=['persons','families','events','event_types','places','media','notes','sources'];
            $missing=array_diff($expectedTables,$tables);
            json_response([
                'format'=>'sqlite','tables'=>$tables,'counts'=>$counts,
                'missing_expected_tables'=>array_values($missing),
                'compatible'=>count($missing)===0,
                'existing_persons'=>$existingPersons,
                'fusion_needed'=>$existingPersons>0,
            ]);
        }catch(Throwable $e){
            json_response(['error'=>'Impossible d\'ouvrir la base SQLite : '.$e->getMessage()],422);
        }
    }

    // ── Mac Family Tree .mftpkg ──
    if($ext==='mftpkg'){
        $entries=[];
        $hasSqlite=false;
        $za=new ZipArchive();
        if($za->open($path)===true){
            for($i=0;$i<$za->numFiles;$i++){
                $name=$za->getNameIndex($i);
                $entries[]=$name;
                if(preg_match('/\.(sqlite|sqlitedb|db)$/i',$name))$hasSqlite=true;
            }
            $za->close();
        } else {
            json_response(['error'=>"Impossible d'ouvrir le paquet .mftpkg (format inattendu)"],422);
        }
        $existingPersons=(int)$pdo->query('SELECT count(*) FROM persons')->fetchColumn();
        json_response([
            'format'=>'mftpkg','entries'=>$entries,'entry_count'=>count($entries),
            'has_sqlite'=>$hasSqlite,
            'existing_persons'=>$existingPersons,
            'fusion_needed'=>$existingPersons>0,
        ]);
    }

    json_response(['error'=>"Format non supporté pour l'analyse : .{$ext}"],422);
}

// ─── Import direct depuis l'écran d'installation (GEDCOM et MacFamilyTree réels) ──

function import_package(PDO $pdo, ?array $file): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { json_response(['error'=>'POST requis'], 405); }
    if (!$file || $file['error'] !== UPLOAD_ERR_OK) { json_response(['error'=>upload_failure_message($file)], 422); }
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $existingPersons = (int) $pdo->query('SELECT count(*) FROM persons')->fetchColumn();
    @set_time_limit(0); // un gros paquet (photos) peut dépasser les 300 s par défaut

    $pdo->beginTransaction();
    try {
        if (in_array($ext, ['ged', 'gedcom'], true)) {
            // Fichier lu sur place : les médias cités par un chemin relatif sont cherchés à côté du .ged.
            $stats = import_gedcom_into_db($pdo, $file['tmp_name'], !empty($file['local']) ? dirname($file['tmp_name']) : null);
        } elseif (in_array($ext, ['hmw', 'heredis'], true)) {
            $stats = heredis_import_into_db($pdo, $file['tmp_name']);
        } elseif ($ext === 'mftpkg') {
            $stats = import_mftpkg_into_db($pdo, $file['tmp_name']);
        } elseif (in_array($ext, ['zip', 'gdz'], true)) {
            $stats = import_zip_package_into_db($pdo, $file['tmp_name']);
        } else {
            throw new RuntimeException("Format non supporté pour l'import direct : .{$ext}");
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
    $pdo->exec('ANALYZE');

    json_response([
        'ok' => true,
        'stats' => $stats,
        'existing_persons_before' => $existingPersons,
        'fusion_needed' => $existingPersons > 0,
    ]);
}

// ── Parseur GEDCOM générique (arbre level/tag/value) ──

function gedimport_parse(string $text): array
{
    $lines = preg_split('/\r\n|\r|\n/', $text) ?: [];
    $root = [];
    $stack = [];
    foreach ($lines as $raw) {
        $raw = rtrim($raw);
        if ($raw === '') { continue; }
        if (!preg_match('/^(\d+)\s(@[^@]+@\s)?([A-Za-z0-9_]+)\s?(.*)$/', $raw, $m)) { continue; }
        $level = (int) $m[1];
        $node = new stdClass();
        $node->level = $level;
        $node->xref = $m[2] !== '' ? trim($m[2], "@ ") : null;
        $node->tag = strtoupper($m[3]);
        $node->value = $m[4];
        $node->children = [];
        if ($level === 0) {
            $root[] = $node;
        } elseif (isset($stack[$level - 1])) {
            $stack[$level - 1]->children[] = $node;
        }
        $stack[$level] = $node;
        $stack = array_slice($stack, 0, $level + 1);
    }
    return $root;
}

function gedimport_child(stdClass $node, string $tag): ?stdClass
{
    foreach ($node->children as $child) { if ($child->tag === $tag) { return $child; } }
    return null;
}

function gedimport_children(stdClass $node, string $tag): array
{
    return array_values(array_filter($node->children, static fn($c) => $c->tag === $tag));
}

function gedimport_text(stdClass $node): string
{
    $text = $node->value;
    foreach ($node->children as $child) {
        if ($child->tag === 'CONC') { $text .= $child->value; }
        elseif ($child->tag === 'CONT') { $text .= "\n" . $child->value; }
    }
    return $text;
}

function gedimport_event_labels(): array
{
    return [
        'BIRT'=>'Naissance','DEAT'=>'Décès','CHR'=>'Baptême','BAPM'=>'Baptême','BURI'=>'Inhumation',
        'OCCU'=>'Profession','RESI'=>'Lieu de résidence','CENS'=>'Recensement','DIV'=>'Divorce',
        'ENGA'=>'Fiançailles','CREM'=>'Incinération','EMIG'=>'Émigration','IMMI'=>'Immigration',
        'NATU'=>'Naturalisation','GRAD'=>'Diplôme','EDUC'=>'Formation','RETI'=>'Retraite','WILL'=>'Testament',
        'ADOP'=>'Adoption','EVEN'=>'Autre événement','MARR'=>'Mariage','MARB'=>'Publication des bans',
        'MARL'=>'Licence de mariage','ANUL'=>'Annulation',
    ];
}

function gedimport_event_type_id(PDO $pdo, array &$cache, string $tag, string $scope): int
{
    $key = $scope . ':' . $tag;
    if (isset($cache[$key])) { return $cache[$key]; }
    $stmt = $pdo->prepare('SELECT id FROM event_types WHERE scope=? AND gedcom_tag=?');
    $stmt->execute([$scope, $tag]);
    $id = $stmt->fetchColumn();
    if (!$id) {
        $label = gedimport_event_labels()[$tag] ?? (ucfirst(strtolower($tag)) ?: 'Événement');
        $slug = trim(preg_replace('/[^a-z0-9]+/', '-', mb_strtolower($label)) ?: 'event', '-') . '-' . strtolower($tag);
        $icon = match ($tag) { 'BIRT'=>'star','DEAT'=>'cross','BURI'=>'grave','MARR'=>'rings','OCCU'=>'tool','RESI'=>'home', default=>'diamond' };
        $color = match ($tag) { 'BIRT'=>'#0066cc','DEAT','BURI'=>'#111111','MARR'=>'#7a47db', default=>'#0066cc' };
        $pdo->prepare('INSERT INTO event_types(scope,slug,label,gedcom_tag,icon,color,is_custom,is_active) VALUES(?,?,?,?,?,?,1,1)')
            ->execute([$scope, $slug, $label, $tag, $icon, $color]);
        $id = (int) $pdo->lastInsertId();
    }
    $cache[$key] = (int) $id;
    return (int) $id;
}

function gedimport_place_id(PDO $pdo, array &$cache, string $name): ?int
{
    $name = trim($name);
    if ($name === '') { return null; }
    $key = mb_strtolower($name);
    if (isset($cache[$key])) { return $cache[$key]; }
    $stmt = $pdo->prepare('SELECT id FROM places WHERE name=? COLLATE NOCASE');
    $stmt->execute([$name]);
    $id = $stmt->fetchColumn();
    if (!$id) {
        $parts = array_map('trim', explode(',', $name));
        $country = count($parts) > 1 ? (string) end($parts) : '';
        $pdo->prepare('INSERT INTO places(name,country) VALUES(?,?)')->execute([$name, $country]);
        $id = (int) $pdo->lastInsertId();
    }
    $cache[$key] = (int) $id;
    return (int) $id;
}

function gedimport_group_id(PDO $pdo, array &$cache, string $lastName): ?int
{
    $lastName = trim($lastName);
    if ($lastName === '') { return null; }
    $key = mb_strtolower($lastName);
    if (isset($cache[$key])) { return $cache[$key]; }
    $pdo->prepare('INSERT OR IGNORE INTO surname_groups(name) VALUES(?)')->execute([$lastName]);
    $stmt = $pdo->prepare('SELECT id FROM surname_groups WHERE name=? COLLATE NOCASE');
    $stmt->execute([$lastName]);
    $id = (int) $stmt->fetchColumn();
    $cache[$key] = $id;
    return $id;
}

/**
 * Indexe récursivement un dossier (typiquement une archive GedZip extraite) par nom de
 * fichier en minuscule, pour résoudre les chemins OBJE/FILE du GEDCOM (souvent absolus ou
 * relatifs à l'ordinateur d'origine, donc inutilisables tels quels).
 */
function gedimport_index_media_dir(string $dir): array
{
    $index = [];
    if (!is_dir($dir)) { return $index; }
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $fileInfo) {
        if ($fileInfo->isFile()) { $index[strtolower($fileInfo->getFilename())] = $fileInfo->getPathname(); }
    }
    return $index;
}

/**
 * Recherche le fichier référencé par un chemin OBJE/FILE (par nom de base, l'index étant
 * construit sur les noms de fichiers) et le copie dans /media si trouvé. Renvoie le nom de
 * fichier stocké (à utiliser tel quel dans la colonne media.filename), ou null si introuvable.
 */
function gedimport_store_media(array $mediaIndex, string $rawPath): ?string
{
    $name = strtolower(basename(str_replace('\\', '/', $rawPath)));
    if ($name === '' || !isset($mediaIndex[$name])) { return null; }
    $from = $mediaIndex[$name];
    $mediaDir = MEDIA_DIR;
    if (!is_dir($mediaDir)) { mkdir($mediaDir, 0775, true); }
    $target = basename($from);
    $to = $mediaDir . '/' . $target;
    if (is_file($to) && md5_file($to) !== md5_file($from)) {
        $target = bin2hex(random_bytes(4)) . '_' . $target;
        $to = $mediaDir . '/' . $target;
    }
    if (!is_file($to) && !copy($from, $to)) { return null; }
    return $target;
}

function gedimport_rebuild_search(PDO $pdo): void
{
    $pdo->exec('DELETE FROM person_search');
    $pdo->exec("INSERT INTO person_search(person_id,first_name,last_name,variants,surname_group)
        SELECT p.id,p.first_name,p.last_name,
               COALESCE((SELECT group_concat(trim(coalesce(n.first_name,'') || ' ' || coalesce(n.last_name,'')), ' ') FROM name_variants n WHERE n.person_id=p.id),''),
               COALESCE(g.name,'')
        FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id");
}

function mft_french_label(string $identifier, string $typeName, string $tag): string
{
    if ($typeName !== '') { return $typeName; }
    $specific = ['_FamilyEvent_License' => 'Licence de mariage', '_FamilyEvent_MarriageReligion' => 'Mariage religieux'];
    if (isset($specific[$identifier])) { return $specific[$identifier]; }
    if (isset(gedimport_event_labels()[$tag])) { return gedimport_event_labels()[$tag]; }
    $label = preg_replace('/^_(Person|Family)Event_/', '', $identifier) ?: $identifier;
    $label = preg_replace('/([a-z])([A-Z])/', '$1 $2', $label) ?: $label;
    return $label !== '' ? $label : 'Événement';
}

function mft_slugify(string $value): string
{
    $ascii = ascii_fold($value);
    return trim(strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $ascii) ?: ''), '-');
}

function mft_extract_year(?string $date): ?int
{
    if (!$date || !preg_match('/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/', $date, $m)) { return null; }
    return (int) $m[1];
}

function mft_fact_label(string $identifier, string $typeName): string
{
    if ($typeName !== '') { return $typeName; }
    $labels = ['Hobby' => 'Loisir', 'Height' => 'Taille', 'Weight' => 'Poids', 'Clan' => 'Clan', 'TribeName' => 'Tribu',
        'EyeColor' => 'Couleur des yeux', 'NationalID' => 'Numéro d’identité', 'Race' => 'Origine ethnique',
        'NationalOrTribalOrigin' => 'Origine nationale', 'Possession' => 'Possession', 'PhysicalDescription' => 'Description physique',
        'Email' => 'Adresse e-mail', 'SkinColor' => 'Couleur de peau', 'SocialSecurityNumber' => 'Numéro de sécurité sociale',
        'Phone' => 'Téléphone', 'HairColor' => 'Couleur des cheveux', 'Honors' => 'Distinctions', 'CasteName' => 'Caste',
        'BloodType' => 'Groupe sanguin'];
    $key = preg_replace('/^_PersonFact_/', '', $identifier) ?: $identifier;
    if (isset($labels[$key])) { return $labels[$key]; }
    $label = preg_replace('/([a-z])([A-Z])/', '$1 $2', $key) ?: $key;
    return $label !== '' ? $label : 'Caractéristique';
}

function mft_core_date(mixed $value): ?string
{
    if ($value === null || $value === '') { return null; }
    $timestamp = (float) $value + 978307200;
    return gmdate('Y-m-d H:i:s', (int) $timestamp);
}

function mft_coordinate(array $row, string $prefix, bool $negative): ?float
{
    $degrees = $row[$prefix . 'DEGREES'] ?? null;
    if ($degrees === null || $degrees === '') { return null; }
    $value = (float) $degrees + ((float) ($row[$prefix . 'MINUTES'] ?? 0) / 60) + ((float) ($row[$prefix . 'SECONDS'] ?? 0) / 3600);
    return $negative ? -$value : $value;
}

function mft_delete_directory(string $dir): void
{
    if (!is_dir($dir)) { return; }
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($items as $item) { $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname()); }
    rmdir($dir);
}

/**
 * Détermine le contenu réel d'une archive .zip (ou .gdz) uploadée : un GedZip (fichier
 * GEDCOM + médias zippés ensemble, format standard porté par de nombreux logiciels dont
 * MacFamilyTree) ou un paquet MacFamilyTree au format Core Data (.mftpkg renommé .zip).
 * La détection du GEDCOM est prioritaire pour éviter l'erreur "Base MacFamilyTree introuvable"
 * sur une archive qui n'en contient simplement pas.
 */
function import_zip_package_into_db(PDO $pdo, string $zipPath): array
{
    $za = new ZipArchive();
    if ($za->open($zipPath) !== true) {
        throw new RuntimeException("Impossible d'ouvrir l'archive (format inattendu)");
    }
    $hasGed = false;
    $hasDatabase = false;
    $hasHeredis = false;
    for ($i = 0; $i < $za->numFiles; $i++) {
        $name = $za->getNameIndex($i);
        if ($name === false) { continue; }
        $base = basename($name);
        if (preg_match('/\.(ged|gedcom)$/i', $base)) { $hasGed = true; }
        if ($base === 'database') { $hasDatabase = true; }
        if (preg_match('/\.heredis$/i', $base)) { $hasHeredis = true; }
    }
    $za->close();
    if ($hasHeredis && !$hasGed) {
        $tmpDir = sys_get_temp_dir() . '/heredis_' . bin2hex(random_bytes(8));
        mkdir($tmpDir, 0700, true);
        try {
            $za = new ZipArchive();
            $za->open($zipPath);
            $za->extractTo($tmpDir);
            $za->close();
            $found = null;
            foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tmpDir, FilesystemIterator::SKIP_DOTS)) as $f) {
                if ($f->isFile() && preg_match('/\.heredis$/i', $f->getFilename())) { $found = $f->getPath(); break; }
            }
            return heredis_import_into_db($pdo, (string) $found);
        } finally {
            mft_delete_directory($tmpDir);
        }
    }
    if ($hasGed) { return import_gedzip_into_db($pdo, $zipPath); }
    if ($hasDatabase) { return import_mftpkg_into_db($pdo, $zipPath); }
    throw new RuntimeException("Format d'archive non reconnu : ni fichier GEDCOM (.ged), ni base MacFamilyTree ('database'), ni fichier Hérédis (.heredis) dans le paquet.");
}

/**
 * Importe une archive GedZip : un fichier .ged accompagné de ses médias, zippés ensemble.
 * L'archive est extraite dans un dossier temporaire, le fichier GEDCOM y est localisé puis
 * importé via import_gedcom_into_db(), qui résout les médias référencés (OBJE/FILE) dans
 * ce même dossier extrait.
 */
function import_gedzip_into_db(PDO $pdo, string $zipPath): array
{
    $tmpDir = sys_get_temp_dir() . '/gedzip_' . bin2hex(random_bytes(8));
    if (!mkdir($tmpDir, 0775, true) && !is_dir($tmpDir)) {
        throw new RuntimeException('Impossible de créer un dossier temporaire pour l\'extraction');
    }
    try {
        $za = new ZipArchive();
        if ($za->open($zipPath) !== true) {
            throw new RuntimeException("Impossible d'ouvrir l'archive GedZip (format inattendu)");
        }
        $za->extractTo($tmpDir);
        $za->close();

        $gedPath = null;
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tmpDir, FilesystemIterator::SKIP_DOTS));
        foreach ($iterator as $fileInfo) {
            if ($fileInfo->isFile() && preg_match('/\.(ged|gedcom)$/i', $fileInfo->getFilename())) {
                $gedPath = $fileInfo->getPathname();
                break;
            }
        }
        if (!$gedPath) {
            throw new RuntimeException("Fichier GEDCOM (.ged) introuvable dans l'archive.");
        }
        return import_gedcom_into_db($pdo, $gedPath, $tmpDir);
    } finally {
        mft_delete_directory($tmpDir);
    }
}

/**
 * Importe un paquet Mac Family Tree (.mftpkg, ou son équivalent .zip) directement dans la
 * base. Le paquet est dézippé dans un dossier temporaire, la base Core Data interne
 * ("database") est ouverte et convertie avec la même logique que scripts/import.php.
 */
function import_mftpkg_into_db(PDO $dst, string $zipPath): array
{
    // Un .mftpkg est un dossier (application de bureau : lu sur place, en lecture seule) ; envoyé par un
    // navigateur, il arrive zippé et on l'extrait dans un dossier temporaire.
    $isFolder = is_dir($zipPath);
    $tmpDir = $isFolder ? null : sys_get_temp_dir() . '/mftpkg_' . bin2hex(random_bytes(8));
    if ($tmpDir !== null && !mkdir($tmpDir, 0775, true) && !is_dir($tmpDir)) {
        throw new RuntimeException('Impossible de créer un dossier temporaire pour l\'extraction');
    }
    try {
        if (!$isFolder) {
            $za = new ZipArchive();
            if ($za->open($zipPath) !== true) {
                throw new RuntimeException("Impossible d'ouvrir le paquet .mftpkg (format inattendu)");
            }
            $za->extractTo($tmpDir);
            $za->close();
        }

        $sourceDb = null; $resourcesDir = null;
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($isFolder ? $zipPath : $tmpDir, FilesystemIterator::SKIP_DOTS));
        foreach ($iterator as $fileInfo) {
            if ($fileInfo->isFile() && $fileInfo->getFilename() === 'database') {
                $sourceDb = $fileInfo->getPathname();
                $candidate = dirname($sourceDb) . '/resources';
                if (is_dir($candidate)) { $resourcesDir = $candidate; }
            }
        }
        if (!$sourceDb) {
            throw new RuntimeException("Base MacFamilyTree introuvable dans le paquet (fichier 'database' absent).");
        }

        // Paquet d'origine : ouvert en lecture seule (immutable = aucun fichier -wal/-shm créé à côté).
        $src = $isFolder
            ? new PDO('sqlite:file:' . rawurlencode($sourceDb) . '?mode=ro&immutable=1', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC])
            : new PDO('sqlite:' . $sourceDb, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $dst->exec('PRAGMA foreign_keys = OFF');

        // ── Résolution dynamique des Z_ENT depuis Z_PRIMARYKEY ────────────────────
        // MacFamilyTree incrémente ces identifiants à chaque version du modèle CoreData ;
        // les valeurs ci-dessous sont les valeurs de repli pour les versions historiques.
        $entMap = [];
        foreach ($src->query('SELECT Z_NAME, Z_ENT FROM Z_PRIMARYKEY') as $row) {
            $entMap[(string) $row['Z_NAME']] = (int) $row['Z_ENT'];
        }
        $entPerson       = $entMap['Person']                    ?? 15;
        $entFamily       = $entMap['Family']                    ?? 14;
        $entFamilyEvent  = $entMap['FamilyEvent']               ?? 24;
        $entPersonEvent  = $entMap['PersonEvent']               ?? 25;
        $entPlace        = $entMap['Place']                     ?? 28;
        $entMedia        = $entMap['MediaPicture']              ?? 19;
        $entNote         = $entMap['Note']                      ?? 6;
        $entFamilyEvType = $entMap['ConclusionFamilyEventType'] ?? 52;
        $entPersonEvType = $entMap['ConclusionPersonEventType'] ?? 53;
        $entSourceCont   = $entMap['SourceContainer']           ?? 11;

        // ── Résolution dynamique des colonnes polymorphes de ZBASEOBJECT ─────────
        // CoreData numérote les FK polymorphes (ZCONCLUSIONTYPEn, Zn_OBJECT…)
        // différemment selon la version du modèle ; on détecte lesquelles ont des données.
        $allBoCols = array_column($src->query('PRAGMA table_info(ZBASEOBJECT)')->fetchAll(), 'name');
        // Colonne ZCONCLUSIONTYPEn pour les événements famille vs personne
        $ctCols = array_values(array_filter($allBoCols, static fn ($c) => (bool) preg_match('/^ZCONCLUSIONTYPE\d*$/', $c)));
        sort($ctCols);
        $familyTypeCol = $ctCols[0] ?? 'ZCONCLUSIONTYPE';
        $personTypeCol = $ctCols[1] ?? 'ZCONCLUSIONTYPE1';
        foreach ($ctCols as $col) {
            if ((int) $src->query("SELECT count(*) FROM ZBASEOBJECT WHERE Z_ENT={$entFamilyEvent} AND {$col}>0")->fetchColumn() > 0) {
                $familyTypeCol = $col; break;
            }
        }
        foreach ($ctCols as $col) {
            if ($col === $familyTypeCol) { continue; }
            if ((int) $src->query("SELECT count(*) FROM ZBASEOBJECT WHERE Z_ENT={$entPersonEvent} AND {$col}>0")->fetchColumn() > 0) {
                $personTypeCol = $col; break;
            }
        }
        // Colonne Zn_MEDIACONTAINER dans ZMEDIARELATION
        $mrCols = array_column($src->query('PRAGMA table_info(ZMEDIARELATION)')->fetchAll(), 'name');
        $mediaContainerCol = 'Z8_MEDIACONTAINER';
        foreach ($mrCols as $col) {
            if (preg_match('/^Z\d+_MEDIACONTAINER$/', $col)) { $mediaContainerCol = $col; break; }
        }
        // Colonne Zn_OBJECT dans ZBASEOBJECT (liaison note → entité parente)
        $boZCols = array_values(array_filter($allBoCols, static fn ($c) => (bool) preg_match('/^Z\d+_OBJECT$/', $c)));
        $noteObjectCol = 'Z7_OBJECT';
        foreach ($boZCols as $col) {
            if ((int) $src->query("SELECT count(*) FROM ZBASEOBJECT WHERE Z_ENT={$entNote} AND {$col}>0")->fetchColumn() > 0) {
                $noteObjectCol = $col; break;
            }
        }
        // Colonne de date des événements (ZDATE2 dans les versions récentes, ZDATE1 dans les anciennes)
        $eventDateCol = 'ZDATE1';
        foreach (['ZDATE2', 'ZDATE1', 'ZDATE'] as $col) {
            if (in_array($col, $allBoCols, true) &&
                (int) $src->query("SELECT count(*) FROM ZBASEOBJECT WHERE Z_ENT IN ({$entFamilyEvent},{$entPersonEvent}) AND {$col} IS NOT NULL AND {$col}!=''")->fetchColumn() > 0) {
                $eventDateCol = $col; break;
            }
        }
        // Colonne de nom de lieu (ZPLACE n'existe pas dans les nouvelles versions de CoreData)
        $placeNameCol   = in_array('ZPLACE', $allBoCols, true) ? 'ZPLACE' : 'ZCACHED_NORMALLOCATIONSTRING';
        // Colonne de comté (ZCOUNTY absent → fallback sur le cache tiers niveau)
        $placeCountyCol = in_array('ZCOUNTY', $allBoCols, true) ? 'ZCOUNTY' : 'ZCACHED_THIRDTOPLEVELGROUPINGLOCATIONSTRING';
        // Colonne de pays (préférer le cache qui est toujours renseigné)
        $placeCountryCol = in_array('ZCACHED_TOPLEVELGROUPINGLOCATIONSTRING', $allBoCols, true)
            ? 'ZCACHED_TOPLEVELGROUPINGLOCATIONSTRING' : 'ZCOUNTRY';

        $personMap = []; $groupMap = []; $mediaMissing = 0;
        $insertGroup = $dst->prepare('INSERT OR IGNORE INTO surname_groups(name) VALUES(?)');
        $findGroup = $dst->prepare('SELECT id FROM surname_groups WHERE name = ? COLLATE NOCASE');
        $insertPerson = $dst->prepare('INSERT INTO persons(source_id,unique_id,gedcom_id,first_name,middle_name,last_name,prefix,suffix,gender,living_status,is_private,is_bookmarked,is_start,surname_group_id,reference_number,familysearch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');

        foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT={$entPerson}") as $p) {
            $lastName = trim((string) ($p['ZLASTNAME'] ?? ''));
            $groupId = null;
            if ($lastName !== '') {
                $key = mb_strtolower($lastName);
                if (!isset($groupMap[$key])) {
                    $insertGroup->execute([$lastName]);
                    $findGroup->execute([$lastName]);
                    $groupMap[$key] = (int) $findGroup->fetchColumn();
                }
                $groupId = $groupMap[$key];
            }
            $gender = match ((int) ($p['ZGENDER'] ?? -1)) { 0 => 'male', 1 => 'female', default => 'unknown' };
            $insertPerson->execute([
                $p['Z_PK'], $p['ZUNIQUEID'] ?? null, $p['ZGEDCOMID'] ?? null,
                $p['ZFIRSTNAME'] ?? '', $p['ZNAMEMIDDLE'] ?? '', $lastName, $p['ZNAMEPREFIX'] ?? '', $p['ZNAMESUFFIX'] ?? '',
                $gender, 'unknown', (int) ($p['ZISPRIVATE'] ?? 0), (int) ($p['ZISBOOKMARKED1'] ?? 0), (int) ($p['ZISSTARTPERSON'] ?? 0),
                $groupId, $p['ZREFERENCENUMBERID'] ?? '', $p['ZFAMILYSEARCHID'] ?? '',
            ]);
            $personMap[(int) $p['Z_PK']] = (int) $dst->lastInsertId();
        }

        $insertVariant = $dst->prepare('INSERT INTO name_variants(person_id,source_id,type,first_name,middle_name,last_name,prefix,suffix,position) VALUES(?,?,?,?,?,?,?,?,?)');
        $position = 0;
        foreach ($src->query('SELECT * FROM ZADDITIONALNAME ORDER BY Z_PK') as $n) {
            if (!isset($personMap[(int) $n['ZPERSON']])) { continue; }
            $insertVariant->execute([$personMap[(int) $n['ZPERSON']], $n['Z_PK'], 'historical', $n['ZFIRSTNAME'] ?? '', $n['ZNAMEMIDDLE'] ?? '', $n['ZLASTNAME'] ?? '', $n['ZNAMEPREFIX'] ?? '', $n['ZNAMESUFFIX'] ?? '', $position++]);
        }

        $familyMap = [];
        $insertFamily = $dst->prepare('INSERT INTO families(source_id,partner1_id,partner2_id) VALUES(?,?,?)');
        foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT={$entFamily}") as $f) {
            $insertFamily->execute([$f['Z_PK'], $personMap[(int) ($f['ZMAN'] ?? 0)] ?? null, $personMap[(int) ($f['ZWOMAN'] ?? 0)] ?? null]);
            $familyMap[(int) $f['Z_PK']] = (int) $dst->lastInsertId();
        }
        $insertChild = $dst->prepare('INSERT INTO family_children(source_id,family_id,child_id,relation_to_partner1,relation_to_partner2,position) VALUES(?,?,?,?,?,?)');
        $relationName = static fn (mixed $v): string => match ((int) $v) { 1 => 'adopted', 2 => 'foster', 3 => 'step', default => 'biological' };
        foreach ($src->query('SELECT * FROM ZCHILDRELATION') as $c) {
            $familyId = $familyMap[(int) ($c['ZFAMILY'] ?? 0)] ?? null;
            $childId = $personMap[(int) ($c['ZCHILD'] ?? 0)] ?? null;
            if (!$familyId || !$childId) { continue; }
            $insertChild->execute([$c['Z_PK'], $familyId, $childId, $relationName($c['ZRELATIONTYPETOMANINFAMILY'] ?? 0), $relationName($c['ZRELATIONTYPETOWOMANINFAMILY'] ?? 0), (float) ($c['ZCUSTOMORDER'] ?? 0)]);
        }

        $typeMap = [];
        $insertType = $dst->prepare('INSERT INTO event_types(source_id,scope,slug,label,gedcom_tag,icon,color,is_custom,is_active) VALUES(?,?,?,?,?,?,?,?,?)');
        foreach ($src->query("SELECT * FROM ZCONCLUSIONTYPE WHERE Z_ENT IN ({$entFamilyEvType},{$entPersonEvType})") as $t) {
            $scope = (int) $t['Z_ENT'] === $entFamilyEvType ? 'family' : 'person';
            $label = mft_french_label((string) ($t['ZIDENTIFIER'] ?? ''), (string) ($t['ZTYPENAME'] ?? ''), (string) ($t['ZGEDCOMTAG'] ?? ''));
            $slug = (mft_slugify($label) ?: 'event') . '-' . $t['Z_PK'];
            $tag = (string) ($t['ZGEDCOMTAG'] ?? '');
            $icon = match ($tag) { 'BIRT' => 'star', 'DEAT' => 'cross', 'BURI' => 'grave', 'MARR' => 'rings', 'OCCU' => 'tool', 'RESI' => 'home', default => 'diamond' };
            $color = match ($tag) { 'BIRT' => '#0066cc', 'DEAT', 'BURI' => '#111111', 'MARR' => '#7a47db', default => '#0066cc' };
            $insertType->execute([$t['Z_PK'], $scope, $slug, $label, $tag, $icon, $color, (int) ($t['ZISUSERCREATED'] ?? 0), (int) ($t['ZISENABLED'] ?? 1)]);
            $typeMap[(int) $t['Z_PK']] = (int) $dst->lastInsertId();
        }

        $placeMap = []; $coordinates = [];
        foreach ($src->query('SELECT * FROM ZCOORDINATE') as $c) { $coordinates[(int) $c['Z_PK']] = $c; }
        $insertPlace = $dst->prepare('INSERT INTO places(source_id,name,county,state,country,alternate_names,latitude,longitude,description) VALUES(?,?,?,?,?,?,?,?,?)');
        foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT={$entPlace}") as $p) {
            $coord = $coordinates[(int) ($p['ZCOORDINATE'] ?? 0)] ?? [];
            $lat = $coord ? mft_coordinate($coord, 'ZLATITUDE', !empty($coord['ZLATITUDEISSOUTH'])) : null;
            $lon = $coord ? mft_coordinate($coord, 'ZLONGITUDE', !empty($coord['ZLONGITUDEISWEST'])) : null;
            $insertPlace->execute([$p['Z_PK'], $p[$placeNameCol] ?? '', $p[$placeCountyCol] ?? '', $p['ZSTATE'] ?? '', $p[$placeCountryCol] ?? '', $p['ZALTERNATEPLACENAMES'] ?? '', $lat, $lon, $p['ZUSERDESCRIPTION1'] ?? '']);
            $placeMap[(int) $p['Z_PK']] = (int) $dst->lastInsertId();
        }

        $eventMap = [];
        $insertEvent = $dst->prepare('INSERT INTO events(source_id,scope,person_id,family_id,event_type_id,date_text,year,place_id,address,title,description,cause,agency) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
        foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT IN ({$entFamilyEvent},{$entPersonEvent})") as $e) {
            $scope = (int) $e['Z_ENT'] === $entFamilyEvent ? 'family' : 'person';
            $typeSource = (int) ($scope === 'family' ? ($e[$familyTypeCol] ?? 0) : ($e[$personTypeCol] ?? 0));
            $typeId = $typeMap[$typeSource] ?? null;
            if (!$typeId) { continue; }
            $date = trim((string) ($e[$eventDateCol] ?? ''));
            $insertEvent->execute([
                $e['Z_PK'], $scope,
                $scope === 'person' ? ($personMap[(int) ($e['ZPERSON1'] ?? 0)] ?? null) : null,
                $scope === 'family' ? ($familyMap[(int) ($e['ZFAMILY'] ?? 0)] ?? null) : null,
                $typeId, $date, mft_extract_year($date), $placeMap[(int) ($e['ZASSIGNEDPLACE'] ?? 0)] ?? null,
                $e['ZADDRESS'] ?? '', $e['ZTITLE'] ?? '', $e['ZUSERDESCRIPTION1'] ?? '', $e['ZCAUSE'] ?? '', $e['ZAGENCY'] ?? '',
            ]);
            $eventMap[(int) $e['Z_PK']] = (int) $dst->lastInsertId();
        }

        $mediaMap = [];
        $insertMedia = $dst->prepare('INSERT INTO media(source_id,title,description,media_type,filename,thumbnail,date_text) VALUES(?,?,?,?,?,?,?)');
        $mediaDir = MEDIA_DIR;
        if (!is_dir($mediaDir)) { mkdir($mediaDir, 0775, true); }
        // Photos, PDF, sons et vidéos : chaque sorte a sa propre colonne de fichier dans MacFamilyTree.
        $mediaKinds = [];
        foreach ([['MediaPicture', 'image', ['ZPICTUREFILEIDENTIFIER', 'ZORIGINALPICTUREFILEIDENTIFIER']],
                  ['MediaPDF', 'pdf', ['ZPDFFILEIDENTIFIER']],
                  ['MediaAudio', 'audio', ['ZAUDIOFILEIDENTIFIER']],
                  ['MediaVideo', 'video', ['ZVIDEOFILEIDENTIFIER']]] as [$entName, $mediaType, $fileCols]) {
            if (isset($entMap[$entName]) || $entName === 'MediaPicture') {
                $mediaKinds[] = [$entName === 'MediaPicture' ? $entMedia : $entMap[$entName], $mediaType, $fileCols];
            }
        }
        $thumbCols = array_values(array_filter(['ZTHUMBNAILFILEIDENTIFIER1', 'ZTHUMBNAILFILEIDENTIFIER', 'ZTHUMBNAILFILEIDENTIFIER2'], static fn ($c) => in_array($c, $allBoCols, true)));
        $mediaEnts = [];
        foreach ($mediaKinds as [$ent, $mediaType, $fileCols]) {
            $mediaEnts[] = $ent;
            foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT={$ent}") as $m) {
                $original = '';
                foreach ($fileCols as $col) { if (trim((string) ($m[$col] ?? '')) !== '') { $original = (string) $m[$col]; break; } }
                $thumb = '';
                foreach ($thumbCols as $col) { if (trim((string) ($m[$col] ?? '')) !== '') { $thumb = (string) $m[$col]; break; } }
                $originalName = $original !== '' ? basename($original) : '';
                $thumbName = $thumb !== '' ? basename($thumb) : '';
                foreach ([[$original, $originalName], [$thumb, $thumbName]] as [$relative, $name]) {
                    if ($relative === '' || $name === '') { continue; }
                    $from = $resourcesDir ? rtrim($resourcesDir, '/') . '/' . ltrim($relative, '/') : '';
                    $to = $mediaDir . '/' . $name;
                    if ($from !== '' && is_file($from) && !is_file($to)) { copy($from, $to); }
                    if ($relative === $original && !is_file($to)) { $mediaMissing++; }
                }
                $insertMedia->execute([$m['Z_PK'], $m['ZTITLE'] ?? '', $m['ZUSERDESCRIPTION'] ?? '', $mediaType, $originalName, $thumbName, $m['ZDATE'] ?? '']);
                $mediaMap[(int) $m['Z_PK']] = (int) $dst->lastInsertId();
            }
        }

        $insertLink = $dst->prepare('INSERT INTO media_links(source_id,media_id,entity_type,entity_id,position) VALUES(?,?,?,?,?)');
        foreach ($src->query('SELECT * FROM ZMEDIARELATION') as $r) {
            $mediaId = $mediaMap[(int) ($r['ZBASEMEDIA'] ?? 0)] ?? null;
            $sourceContainer = (int) ($r['ZMEDIACONTAINER'] ?? 0);
            $containerEnt = (int) ($r[$mediaContainerCol] ?? 0);
            if ($containerEnt === $entPerson) { $entityType = 'person'; }
            elseif ($containerEnt === $entFamily) { $entityType = 'family'; }
            elseif ($containerEnt === $entFamilyEvent || $containerEnt === $entPersonEvent) { $entityType = 'event'; }
            elseif ($containerEnt === $entSourceCont) { $entityType = 'source'; }
            else { $entityType = null; }
            $entityId = match ($entityType) {
                'person' => $personMap[$sourceContainer] ?? null,
                'family' => $familyMap[$sourceContainer] ?? null,
                'event' => $eventMap[$sourceContainer] ?? null,
                default => null,
            };
            if ($mediaId && $entityType && $entityId) { $insertLink->execute([$r['Z_PK'], $mediaId, $entityType, $entityId, (float) ($r['ZORDER'] ?? 0)]); }
        }

        $insertNote = $dst->prepare('INSERT INTO notes(source_id,entity_type,entity_id,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
        $entToDo = $entMap['ToDo'] ?? -1;
        $todoNotes = []; $notesCount = 0;
        $appendMediaNote = $dst->prepare("UPDATE media SET description = CASE WHEN trim(description)='' THEN ? ELSE description || char(10) || char(10) || ? END WHERE id=?");
        foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT={$entNote}") as $n) {
            $sourceObject = (int) ($n['ZOBJECT'] ?? 0);
            $objectEnt = (int) ($n[$noteObjectCol] ?? 0);
            $body = trim((string) ($n['ZTEXT'] ?? ''));
            if ($objectEnt === $entToDo) { if ($body !== '') { $todoNotes[$sourceObject][] = $body; } continue; }
            if (in_array($objectEnt, $mediaEnts, true)) {
                if ($body !== '' && isset($mediaMap[$sourceObject])) { $appendMediaNote->execute([$body, $body, $mediaMap[$sourceObject]]); $notesCount++; }
                continue;
            }
            if ($objectEnt === $entPerson) { $entityType = 'person'; }
            elseif ($objectEnt === $entFamily) { $entityType = 'family'; }
            elseif ($objectEnt === $entFamilyEvent || $objectEnt === $entPersonEvent) { $entityType = 'event'; }
            else { $entityType = null; }
            $entityId = match ($entityType) {
                'person' => $personMap[$sourceObject] ?? null,
                'family' => $familyMap[$sourceObject] ?? null,
                'event' => $eventMap[$sourceObject] ?? null,
                default => null,
            };
            if ($entityType && $entityId) { $insertNote->execute([$n['Z_PK'], $entityType, $entityId, $n['ZTITLE'] ?? '', $n['ZTEXT'] ?? '', mft_core_date($n['ZCREATIONDATE'] ?? null), mft_core_date($n['ZCHANGEDATE'] ?? null)]); $notesCount++; }
        }

        // ── Caractéristiques (taille, couleur des yeux…) → événements avec leur valeur ──
        $factsCount = 0;
        $entFact = $entMap['PersonFact'] ?? null;
        if ($entFact !== null) {
            $factPersonCol = null; $factTypeCol = null;
            foreach ($allBoCols as $col) {
                if (preg_match('/^ZPERSON\d*$/', $col) && $factPersonCol === null && (int) $src->query("SELECT count(*) FROM ZBASEOBJECT WHERE Z_ENT={$entFact} AND {$col}>0")->fetchColumn() > 0) { $factPersonCol = $col; }
                if (preg_match('/^ZCONCLUSIONTYPE\d*$/', $col) && $factTypeCol === null && (int) $src->query("SELECT count(*) FROM ZBASEOBJECT WHERE Z_ENT={$entFact} AND {$col}>0")->fetchColumn() > 0) { $factTypeCol = $col; }
            }
            if ($factPersonCol && $factTypeCol) {
                $factTypes = [];
                foreach ($src->query('SELECT Z_PK, ZIDENTIFIER, ZTYPENAME, ZGEDCOMTAG FROM ZCONCLUSIONTYPE') as $t) { $factTypes[(int) $t['Z_PK']] = $t; }
                $findType = $dst->prepare("SELECT id FROM event_types WHERE scope='person' AND label=? COLLATE NOCASE LIMIT 1");
                $factTypeIds = [];
                foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT={$entFact}") as $f) {
                    $personId = $personMap[(int) ($f[$factPersonCol] ?? 0)] ?? null;
                    $t = $factTypes[(int) ($f[$factTypeCol] ?? 0)] ?? null;
                    if (!$personId || !$t) { continue; }
                    $label = mft_fact_label((string) ($t['ZIDENTIFIER'] ?? ''), (string) ($t['ZTYPENAME'] ?? ''));
                    if (!isset($factTypeIds[$label])) {
                        $findType->execute([$label]);
                        $typeId = (int) $findType->fetchColumn();
                        if (!$typeId) {
                            $insertType->execute([null, 'person', (mft_slugify($label) ?: 'fait') . '-' . $t['Z_PK'], $label, (string) ($t['ZGEDCOMTAG'] ?? ''), 'diamond', '#0066cc', 0, 1]);
                            $typeId = (int) $dst->lastInsertId();
                        }
                        $factTypeIds[$label] = $typeId;
                    }
                    $date = trim((string) ($f[$eventDateCol] ?? ''));
                    $insertEvent->execute([$f['Z_PK'], 'person', $personId, null, $factTypeIds[$label], $date, mft_extract_year($date), $placeMap[(int) ($f['ZASSIGNEDPLACE'] ?? 0)] ?? null,
                        '', trim((string) ($f['ZVALUE'] ?? '')), $f['ZUSERDESCRIPTION1'] ?? '', '', '']);
                    $eventMap[(int) $f['Z_PK']] = (int) $dst->lastInsertId();
                    $factsCount++;
                }
            }
        }

        // ── Sources et citations ──
        $sourceMap = []; $citationsCount = 0;
        $insertSource = $dst->prepare('INSERT INTO sources(source_id,title,author,agency,publication,url,text,source_type) VALUES(?,?,?,?,?,?,?,?)');
        $insertCitation = $dst->prepare('INSERT INTO source_links(source_id,entity_type,entity_id,source_record_id,page,quality,note) VALUES(?,?,?,?,?,?,?)');
        $entSource = $entMap['Source'] ?? null;
        if ($entSource !== null) {
            $sourceValues = [];
            try {
                foreach ($src->query('SELECT kv.ZSOURCE, kv.ZVALUE, k.ZGEDCOMTAG, k.ZNAME FROM ZSOURCEKEYVALUE kv LEFT JOIN ZSOURCETEMPLATEKEY k ON k.Z_PK = kv.ZTEMPLATEKEY ORDER BY kv.Z_PK') as $kv) {
                    $value = trim((string) ($kv['ZVALUE'] ?? ''));
                    if ($value !== '') { $sourceValues[(int) $kv['ZSOURCE']][] = [strtoupper((string) ($kv['ZGEDCOMTAG'] ?? '')), (string) ($kv['ZNAME'] ?? ''), $value]; }
                }
            } catch (Throwable) { /* ancienne version de MacFamilyTree sans modèles de sources */ }
            $repositories = [];
            if (isset($entMap['SourceRepository'])) {
                foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT={$entMap['SourceRepository']}") as $r) {
                    $repositories[(int) $r['Z_PK']] = trim((string) ($r['ZNAME'] ?? '')) ?: trim((string) ($r['ZCACHED_TITLE'] ?? ''));
                }
            }
            foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT={$entSource}") as $so) {
                $fields = ['title' => '', 'author' => '', 'agency' => '', 'publication' => '', 'url' => ''];
                $extra = [];
                foreach ($sourceValues[(int) $so['Z_PK']] ?? [] as [$tag, $name, $value]) {
                    $field = match ($tag) { 'TITL' => 'title', 'AUTH', 'AUTA', 'AUTC' => 'author', 'PUBL', 'PUB' => 'publication', 'AGNC' => 'agency', default => null };
                    if ($field !== null && $fields[$field] === '') { $fields[$field] = $value; continue; }
                    $extra[] = (preg_replace('/^SourceTemplate_KeyName_/', '', $name) ?: $tag) . ' : ' . $value;
                }
                if ($fields['title'] === '') { $fields['title'] = trim((string) ($so['ZCACHED_TITLE'] ?? '')); }
                if ($fields['agency'] === '') { $fields['agency'] = $repositories[(int) ($so['ZSOURCEREPOSITORY'] ?? 0)] ?? ''; }
                $text = trim((string) ($so['ZTEXT'] ?? ''));
                if ($fields['title'] === '' && $text === '' && !$extra) { continue; } // source vide
                if (preg_match('#^https?://\S+$#i', $fields['title'])) { $fields['url'] = $fields['title']; }
                // Titre très long (MacFamilyTree y met parfois tout l'acte) : le texte complet va dans « texte ».
                if (mb_strlen($fields['title']) > 200 || str_contains($fields['title'], "\n")) {
                    $text = trim($fields['title'] . ($text !== '' ? "\n\n" . $text : ''));
                    $firstLine = trim((string) strtok($fields['title'], "\n"));
                    $fields['title'] = mb_strlen($firstLine) > 200 ? mb_substr($firstLine, 0, 197) . '…' : $firstLine;
                }
                if ($extra) { $text = trim($text . "\n\n" . implode("\n", $extra)); }
                $insertSource->execute([$so['Z_PK'], $fields['title'] ?: 'Source sans titre', $fields['author'], $fields['agency'], $fields['publication'], $fields['url'], $text, $fields['url'] !== '' ? 'internet' : 'other']);
                $sourceMap[(int) $so['Z_PK']] = (int) $dst->lastInsertId();
            }
            $entSourceRel = $entMap['SourceRelation'] ?? null;
            $containerCol = null;
            foreach ($allBoCols as $col) { if (preg_match('/^Z\d+_SOURCECONTAINER$/', $col)) { $containerCol = $col; break; } }
            if ($entSourceRel !== null && $containerCol) {
                foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT={$entSourceRel}") as $c) {
                    $sourceId = $sourceMap[(int) ($c['ZSOURCE'] ?? 0)] ?? null;
                    $container = (int) ($c['ZSOURCECONTAINER'] ?? 0);
                    $containerEnt = (int) ($c[$containerCol] ?? 0);
                    [$entityType, $entityId] = match (true) {
                        $containerEnt === $entPerson => ['person', $personMap[$container] ?? null],
                        $containerEnt === $entFamily => ['family', $familyMap[$container] ?? null],
                        in_array($containerEnt, [$entFamilyEvent, $entPersonEvent, $entFact ?? -1], true) => ['event', $eventMap[$container] ?? null],
                        default => [null, null],
                    };
                    if (!$sourceId || !$entityType || !$entityId) { continue; }
                    $quality = trim((string) ($c['ZQUALITYSOURCE'] ?? ''));
                    $insertCitation->execute([$c['Z_PK'], $entityType, $entityId, $sourceId, trim((string) ($c['ZPAGE'] ?? '')), $quality === '0' ? '' : $quality, trim((string) ($c['ZTEXT'] ?? ''))]);
                    $citationsCount++;
                }
            }
        }

        // ── Liens Internet (médias « URL ») → sources Internet liées aux mêmes fiches ──
        if (isset($entMap['MediaURL'])) {
            $urlSources = [];
            foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT={$entMap['MediaURL']}") as $u) {
                $url = trim((string) ($u['ZURL'] ?? ''));
                if ($url === '') { continue; }
                $insertSource->execute([null, trim((string) ($u['ZTITLE'] ?? '')) ?: $url, '', '', '', $url, trim((string) ($u['ZUSERDESCRIPTION'] ?? '')), 'internet']);
                $urlSources[(int) $u['Z_PK']] = (int) $dst->lastInsertId();
                $sourceMap['url' . $u['Z_PK']] = $urlSources[(int) $u['Z_PK']];
            }
            if ($urlSources) {
                foreach ($src->query('SELECT * FROM ZMEDIARELATION') as $r) {
                    $sourceId = $urlSources[(int) ($r['ZBASEMEDIA'] ?? 0)] ?? null;
                    if (!$sourceId) { continue; }
                    $container = (int) ($r['ZMEDIACONTAINER'] ?? 0);
                    $containerEnt = (int) ($r[$mediaContainerCol] ?? 0);
                    [$entityType, $entityId] = match (true) {
                        $containerEnt === $entPerson => ['person', $personMap[$container] ?? null],
                        $containerEnt === $entFamily => ['family', $familyMap[$container] ?? null],
                        in_array($containerEnt, [$entFamilyEvent, $entPersonEvent], true) => ['event', $eventMap[$container] ?? null],
                        default => [null, null],
                    };
                    if ($entityType && $entityId) { $insertCitation->execute([null, $entityType, $entityId, $sourceId, '', '', '']); $citationsCount++; }
                }
            }
        }

        // ── Tâches (ToDo) → rappels libres ; leurs notes vont dans le rappel ──
        $tasksCount = 0;
        if ($entToDo > 0) {
            $types = [];
            foreach ($src->query('SELECT Z_PK, ZIDENTIFIER FROM ZCONCLUSIONTYPE') as $t) { $types[(int) $t['Z_PK']] = (string) ($t['ZIDENTIFIER'] ?? ''); }
            $todoTitleCols = array_values(array_filter($allBoCols, static fn ($c) => (bool) preg_match('/^ZTITLE\d*$/', $c)));
            $insertReminder = $dst->prepare('INSERT INTO standalone_reminders(title,notes,reminder_mode,reminder_due_at,reminder_done,reminder_done_at,reminder_category,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
            $priorities = ['_ToDo_Priority_High' => 'priorité haute', '_ToDo_Priority_Medium' => 'priorité moyenne', '_ToDo_Priority_Low' => 'priorité basse'];
            $statuses = ['_ToDo_Status_InProgress' => 'en cours', '_ToDo_Status_OnHold' => 'en attente'];
            $todoTypes = ['_ToDo_Type_MissingEvents' => 'Événements manquants', '_ToDo_Type_Verify' => 'Vérifier', '_ToDo_Type_FurtherResearch' => 'Recherches complémentaires',
                '_ToDo_Type_SourceMissing' => 'Source manquante', '_ToDo_Type_Plausibility' => 'Vraisemblance', '_ToDo_Type_CleanUp' => 'Nettoyage', '_ToDo_Type_MissingNames' => 'Noms manquants'];
            $today = date('Y-m-d');
            foreach ($src->query("SELECT * FROM ZBASEOBJECT WHERE Z_ENT={$entToDo}") as $td) {
                $title = '';
                foreach ($todoTitleCols as $col) { if (trim((string) ($td[$col] ?? '')) !== '') { $title = trim((string) $td[$col]); break; } }
                $status = $types[(int) ($td['ZSTATUSCONCLUSIONTYPE'] ?? 0)] ?? '';
                $type = $todoTypes[$types[(int) ($td['ZTYPECONCLUSIONTYPE'] ?? 0)] ?? ''] ?? '';
                $details = array_filter([$type, $priorities[$types[(int) ($td['ZPRIORITYCONCLUSIONTYPE'] ?? 0)] ?? ''] ?? '', $statuses[$status] ?? '']);
                $notes = trim(implode("\n\n", array_filter([$details ? 'MacFamilyTree : ' . implode(', ', $details) : '', ...($todoNotes[(int) $td['Z_PK']] ?? [])])));
                $due = '';
                if (!empty($td['ZCACHED_DUEDATEASDATE'])) { $due = substr((string) mft_core_date($td['ZCACHED_DUEDATEASDATE']), 0, 10); }
                // Un rappel sans date n'apparaît nulle part : sans échéance, « à faire à partir de la date d'import ».
                $mode = $due !== '' ? 'on' : 'after';
                $done = $status === '_ToDo_Status_Done' ? 1 : 0;
                $created = mft_core_date($td['ZCREATIONDATE'] ?? null) ?? date('Y-m-d H:i:s');
                $insertReminder->execute([$title !== '' ? $title : ($type !== '' ? $type : 'Tâche MacFamilyTree'), $notes, $mode, $due !== '' ? $due : $today,
                    $done, $done ? (mft_core_date($td['ZCHANGEDATE'] ?? null) ?? '') : '', '', $created, mft_core_date($td['ZCHANGEDATE'] ?? null) ?? $created]);
                $tasksCount++;
            }
        }

        $dst->exec("UPDATE persons SET living_status='deceased' WHERE id IN (SELECT e.person_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='DEAT')");
        $dst->exec("UPDATE persons SET living_status='living' WHERE living_status='unknown' AND id IN (SELECT e.person_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='BIRT' AND e.year >= CAST(strftime('%Y','now') AS INTEGER)-110)");

        gedimport_rebuild_search($dst);

        $meta = $dst->prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)');
        foreach ([
            'source_package' => 'upload : ' . basename($zipPath),
            'imported_at' => date(DATE_ATOM),
            'source_version' => 'MacFamilyTree (paquet uploadé)',
        ] as $key => $value) { $meta->execute([$key, $value]); }

        $dst->exec("INSERT INTO saved_views(module,name,config_json,sort_order) VALUES
            ('graph','Ascendants — 4 générations','{\"mode\":\"ancestors\",\"depth\":4}',10),
            ('graph','Descendants — 3 générations','{\"mode\":\"descendants\",\"depth\":3}',20),
            ('map','Naissances','{\"event\":\"BIRT\",\"display\":\"markers\"}',10),
            ('map','Carte thermique','{\"event\":\"all\",\"display\":\"heat\"}',20)");

        $dst->exec('PRAGMA foreign_keys = ON');

        return [
            'format' => 'mftpkg',
            'persons' => count($personMap),
            'families' => count($familyMap),
            'events' => count($eventMap) - $factsCount,
            'facts' => $factsCount,
            'notes' => $notesCount,
            'sources' => count($sourceMap),
            'citations' => $citationsCount,
            'tasks' => $tasksCount,
            'media' => count($mediaMap),
            'media_missing' => $mediaMissing,
        ];
    } finally {
        $src = null;
        if ($tmpDir !== null) { mft_delete_directory($tmpDir); }
    }
}

// ─── Gestion des types d'événements (admin) ───────────────────────────────────

function event_types_admin(PDO $pdo): never
{
    // Supprimer les types LDS qui n'ont pas d'événements attachés, si encore présents
    $ldsLabels = ['LDSBaptism','LDSChild Sealing','LDSConfirmation','LDSEndowment','LDSinitiatory',
                  'LDS Baptism','LDS Child Sealing','LDS Confirmation','LDS Endowment','LDS Initiatory'];
    $placeholders = implode(',', array_fill(0, count($ldsLabels), '?'));
    $pdo->prepare("DELETE FROM event_types WHERE label IN ($placeholders) AND id NOT IN (SELECT DISTINCT event_type_id FROM events)")->execute($ldsLabels);

    $rows = $pdo->query("SELECT t.id, t.scope, t.slug, t.label, t.gedcom_tag, t.icon, t.color, t.is_custom, t.is_active, t.is_artistic, t.custom_fields,
        count(e.id) AS usage_count
        FROM event_types t LEFT JOIN events e ON e.event_type_id = t.id
        GROUP BY t.id
        ORDER BY t.label COLLATE NOCASE, t.scope")->fetchAll();
    json_response(['event_types' => $rows]);
}

function save_event_type(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $parseCustomFields = function ($raw): string {
        if (!is_string($raw)) return '';
        $items = array_values(array_filter(array_map('trim', explode(',', $raw)), fn($v) => $v !== ''));
        return $items ? json_encode($items, JSON_UNESCAPED_UNICODE) : '';
    };

    if ($id) {
        // Mise à jour partielle : on conserve les valeurs existantes pour les champs non fournis
        $current = $pdo->prepare('SELECT label,scope,color,icon,is_artistic,custom_fields FROM event_types WHERE id=?');
        $current->execute([$id]);
        $existing = $current->fetch();
        if (!$existing) throw new RuntimeException('Type introuvable');

        $label = array_key_exists('label', $data) ? safe_text($data['label']) : $existing['label'];
        if ($label === '') throw new RuntimeException('Le nom du type est obligatoire');
        $scope = array_key_exists('scope', $data) ? (($data['scope'] ?? 'person') === 'family' ? 'family' : 'person') : $existing['scope'];
        $color = array_key_exists('color', $data) ? safe_text($data['color']) : $existing['color'];
        $icon = array_key_exists('icon', $data) ? safe_text($data['icon']) : $existing['icon'];
        $isArtistic = array_key_exists('is_artistic', $data) ? (int)(bool)$data['is_artistic'] : (int)$existing['is_artistic'];
        $customFields = array_key_exists('custom_fields', $data) ? $parseCustomFields($data['custom_fields']) : (string)$existing['custom_fields'];
        if (!$isArtistic) $customFields = '';

        $pdo->prepare('UPDATE event_types SET label=?, scope=?, color=?, icon=?, is_artistic=?, custom_fields=? WHERE id=?')
            ->execute([$label, $scope, $color, $icon, $isArtistic, $customFields, $id]);
        log_change($pdo, 'event_type', $id, 'update', "Type d'événement modifié : $label");
        return ['id' => $id, 'label' => $label, 'scope' => $scope, 'color' => $color, 'icon' => $icon, 'is_artistic' => $isArtistic, 'custom_fields' => $customFields];
    } else {
        $label = safe_text($data['label'] ?? '');
        if ($label === '') throw new RuntimeException('Le nom du type est obligatoire');
        $scope = ($data['scope'] ?? 'person') === 'family' ? 'family' : 'person';
        $color = safe_text($data['color'] ?? '#0066cc');
        $icon = safe_text($data['icon'] ?? 'diamond');
        $isArtistic = (int)(bool)($data['is_artistic'] ?? 0);
        $customFields = $isArtistic ? $parseCustomFields($data['custom_fields'] ?? '') : '';
        // Création
        $slug = slug_local($label) . '-' . bin2hex(random_bytes(3));
        $pdo->prepare('INSERT INTO event_types(scope,slug,label,icon,color,is_custom,is_artistic,custom_fields) VALUES(?,?,?,?,?,1,?,?)')
            ->execute([$scope, $slug, $label, $icon, $color, $isArtistic, $customFields]);
        $newId = (int)$pdo->lastInsertId();
        log_change($pdo, 'event_type', $newId, 'create', "Nouveau type d'événement : $label");
        return ['id' => $newId, 'label' => $label, 'scope' => $scope, 'is_artistic' => $isArtistic, 'custom_fields' => $customFields];
    }
}

function delete_event_type(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if (!$id) throw new RuntimeException('Identifiant manquant');
    $usage = (int)$pdo->query("SELECT count(*) FROM events WHERE event_type_id = $id")->fetchColumn();
    if ($usage > 0) throw new RuntimeException("Ce type est utilisé par $usage événement(s) et ne peut pas être supprimé");
    $pdo->prepare('DELETE FROM event_types WHERE id=?')->execute([$id]);
    log_change($pdo, 'event_type', $id, 'delete', "Type d'événement supprimé");
    return ['id' => $id];
}

function save_event_witnesses(PDO $pdo, array $data): array
{
    $eventId = safe_int($data['event_id'] ?? 0);
    if (!$eventId) throw new RuntimeException('Événement manquant');
    // Decode witnesses JSON array: [{person_id, note}]
    $witnesses = json_decode($data['witnesses'] ?? '[]', true);
    if (!is_array($witnesses)) $witnesses = [];
    // rien n'a changé (cas le plus courant : « Enregistrer » d'un événement) : rien n'est écrit ni journalisé
    $want = [];
    foreach ($witnesses as $pos => $w) { $pid = (int)($w['person_id'] ?? 0); if ($pid) $want[] = [$pid, (string)($w['note'] ?? ''), (int)$pos]; }
    $cur = $pdo->prepare('SELECT person_id,note,position FROM event_witnesses WHERE event_id=? ORDER BY position,id'); $cur->execute([$eventId]);
    $have = array_map(static fn($r) => [(int)$r['person_id'], (string)$r['note'], (int)$r['position']], $cur->fetchAll(PDO::FETCH_ASSOC));
    if ($have === $want) return ['event_id' => $eventId, 'unchanged' => true];
    $pdo->prepare('DELETE FROM event_witnesses WHERE event_id=?')->execute([$eventId]);
    $stmt = $pdo->prepare('INSERT INTO event_witnesses(event_id,person_id,note,position) VALUES(?,?,?,?)');
    foreach ($want as [$pid, $note, $pos]) $stmt->execute([$eventId, $pid, $note, $pos]);
    log_change($pdo, 'event', $eventId, 'update', 'Mise à jour des témoins - événement #' . $eventId);
    return ['event_id' => $eventId];
}

function save_event_precise(PDO $pdo, array $data): array
{
    $id = safe_int($data['event_id'] ?? 0);
    if (!$id) throw new RuntimeException('Événement manquant');
    $stmt = $pdo->prepare('SELECT id FROM events WHERE id=?'); $stmt->execute([$id]);
    if (!$stmt->fetchColumn()) throw new RuntimeException('Événement introuvable');
    $clear = isset($data['clear']) && $data['clear'];
    if ($clear) {
        $pdo->prepare('UPDATE events SET precise_lat=NULL,precise_lon=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]);
        log_change($pdo,'event',$id,'update','Suppression de la position précise - événement #'.$id);
        return ['event_id'=>$id,'precise_lat'=>null,'precise_lon'=>null];
    }
    $lat = isset($data['precise_lat']) && $data['precise_lat'] !== '' ? (float)$data['precise_lat'] : null;
    $lon = isset($data['precise_lon']) && $data['precise_lon'] !== '' ? (float)$data['precise_lon'] : null;
    if ($lat === null || $lon === null) throw new RuntimeException('Coordonnées manquantes');
    $pdo->prepare('UPDATE events SET precise_lat=?,precise_lon=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$lat,$lon,$id]);
    log_change($pdo,'event',$id,'update','Position précise enregistrée - événement #'.$id);
    return ['event_id'=>$id,'precise_lat'=>$lat,'precise_lon'=>$lon];
}

function investigations_data(PDO $pdo): never
{
    $status=safe_text($_GET['status']??'all');$q=safe_text($_GET['q']??'');
    $where=[];$params=[];
    if(in_array($status,['open','paused','closed'],true)){$where[]='i.status=?';$params[]=$status;}
    if($q!==''){$where[]="(i.title LIKE ? COLLATE NOCASE OR i.question LIKE ? COLLATE NOCASE OR i.known_facts LIKE ? COLLATE NOCASE OR p.first_name LIKE ? COLLATE NOCASE OR p.last_name LIKE ? COLLATE NOCASE)";for($n=0;$n<5;$n++)$params[]='%'.$q.'%';}
    $sql="SELECT i.*,trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS person_name,
        (SELECT count(*) FROM investigation_items x WHERE x.investigation_id=i.id) AS item_count,
        (SELECT count(*) FROM investigation_media im WHERE im.investigation_id=i.id) AS media_count
        FROM investigations i JOIN persons p ON p.id=i.person_id".($where?' WHERE '.implode(' AND ',$where):'')." ORDER BY CASE i.status WHEN 'open' THEN 0 ELSE 1 END,i.updated_at DESC,i.id DESC";
    $stmt=$pdo->prepare($sql);$stmt->execute($params);json_response(['investigations'=>$stmt->fetchAll()]);
}

function investigation_event_label(PDO $pdo,int $eventId,string $fallbackPersonLabel=''): string
{
    if(!$eventId)return '';
    $evtStmt=$pdo->prepare('SELECT e.id,e.year,e.date_text,t.label AS type_label,
        trim(COALESCE(p.first_name,\'\')||\' \'||COALESCE(p.last_name,\'\')) AS person_name,
        trim(COALESCE(p1.first_name,\'\')||\' \'||COALESCE(p1.last_name,\'\')) AS partner1_name,
        trim(COALESCE(p2.first_name,\'\')||\' \'||COALESCE(p2.last_name,\'\')) AS partner2_name
        FROM events e JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN persons p ON p.id=e.person_id
        LEFT JOIN families f ON f.id=e.family_id
        LEFT JOIN persons p1 ON p1.id=f.partner1_id
        LEFT JOIN persons p2 ON p2.id=f.partner2_id
        WHERE e.id=?');
    $evtStmt->execute([$eventId]);
    $event=$evtStmt->fetch();
    if(!$event)return '';
    $label=trim((string)$event['type_label'].' — '.((trim((string)($event['date_text']??''))!=='')?$event['date_text']:((($event['year']??null)!==null&&$event['year']!=='')?$event['year']:'date inconnue')));
    $eventPersonLabel=trim((string)($event['person_name']??''));
    if($eventPersonLabel===''){
        $partners=array_filter([trim((string)($event['partner1_name']??'')),trim((string)($event['partner2_name']??''))]);
        if($partners)$eventPersonLabel=implode(' & ',$partners);
    }
    if($eventPersonLabel==='')$eventPersonLabel=$fallbackPersonLabel;
    return $eventPersonLabel!=='' ? $eventPersonLabel.' — '.$label : $label;
}

function investigation_detail(PDO $pdo,int $id): never
{
    $stmt=$pdo->prepare("SELECT i.*,trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS person_name FROM investigations i JOIN persons p ON p.id=i.person_id WHERE i.id=?");$stmt->execute([$id]);$investigation=$stmt->fetch();if(!$investigation)json_response(['error'=>'Enquête introuvable'],404);
    $items=$pdo->prepare("SELECT ii.*,ade.city_name AS archive_digest_city,ade.city_alias AS archive_digest_alias,ade.archive_reference AS archive_digest_reference,ade.year_text AS archive_digest_year,ade.record_type AS archive_digest_record_type,p.name AS archive_digest_place_name
        FROM investigation_items ii
        LEFT JOIN archive_digest_entries ade ON ade.id=ii.archive_digest_id
        LEFT JOIN places p ON p.id=ade.place_id
        WHERE ii.investigation_id=?
        ORDER BY CASE ii.status WHEN 'promising' THEN 0 WHEN 'explored' THEN 1 ELSE 2 END,ii.id DESC");$items->execute([$id]);$itemRows=$items->fetchAll();
    foreach($itemRows as &$itemRow){
        $archiveDigests=$pdo->prepare("SELECT ade.id,ade.city_name,ade.city_alias,ade.archive_reference,ade.year_text,ade.record_type,p.name AS place_name
            FROM investigation_item_archive_digests iiad
            JOIN archive_digest_entries ade ON ade.id=iiad.archive_digest_id
            LEFT JOIN places p ON p.id=ade.place_id
            WHERE iiad.investigation_item_id=? ORDER BY ade.year_text COLLATE NOCASE,ade.id");
        $archiveDigests->execute([(int)$itemRow['id']]);
        $itemRow['archive_digests']=$archiveDigests->fetchAll();
        ensure_investigation_item_persons($pdo);
        $itemPersons=$pdo->prepare("SELECT p.id,trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS name FROM investigation_item_persons iip JOIN persons p ON p.id=iip.person_id WHERE iip.investigation_item_id=? ORDER BY iip.position,iip.id");
        $itemPersons->execute([(int)$itemRow['id']]);$itemPersonRows=$itemPersons->fetchAll();
        $itemRow['linked_person_ids']=implode(',',array_column($itemPersonRows,'id'));
        $itemRow['linked_person_names']=implode('|',array_column($itemPersonRows,'name'));
        if(!empty($itemRow['linked_event_id'])){
            $computedLabel=investigation_event_label($pdo,(int)$itemRow['linked_event_id']);
            if($computedLabel!=='')$itemRow['linked_event_label']=$computedLabel;
        }
    }
    unset($itemRow);
    $media=$pdo->prepare("SELECT im.id AS link_id,im.verdict,im.reason,im.folder_id,m.*,
        (SELECT group_concat(imi.investigation_item_id) FROM investigation_media_items imi WHERE imi.investigation_media_id=im.id) AS item_ids,
        (SELECT group_concat(ii.title,'|') FROM investigation_media_items imi JOIN investigation_items ii ON ii.id=imi.investigation_item_id WHERE imi.investigation_media_id=im.id) AS item_titles
        FROM investigation_media im JOIN media m ON m.id=im.media_id WHERE im.investigation_id=? ORDER BY CASE im.verdict WHEN 'interesting' THEN 0 ELSE 1 END,im.id DESC");$media->execute([$id]);
    $folders=$pdo->prepare("SELECT f.*,(SELECT count(*) FROM investigation_media im2 WHERE im2.folder_id=f.id) AS media_count,(SELECT count(*) FROM investigation_media_folders f2 WHERE f2.parent_id=f.id) AS subfolder_count FROM investigation_media_folders f WHERE f.investigation_id=? ORDER BY f.name COLLATE NOCASE");$folders->execute([$id]);
    $linkedPersons=$pdo->prepare("SELECT ip.id AS link_id,ip.person_id,ip.role,trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS person_name FROM investigation_persons ip JOIN persons p ON p.id=ip.person_id WHERE ip.investigation_id=? ORDER BY CASE ip.role WHEN 'primary' THEN 0 ELSE 1 END,ip.created_at");$linkedPersons->execute([$id]);
    $linkedBattues=$pdo->prepare("SELECT ib.battue_id,b.title,b.target_type,b.target_text,b.status,c.name AS start_name,b.start_insee_code FROM investigation_battues ib JOIN battues b ON b.id=ib.battue_id LEFT JOIN commune_contours c ON c.insee_code=b.start_insee_code WHERE ib.investigation_id=? ORDER BY b.updated_at DESC,b.id DESC");$linkedBattues->execute([$id]);
    json_response(['investigation'=>$investigation,'items'=>$itemRows,'media'=>$media->fetchAll(),'folders'=>$folders->fetchAll(),'linked_persons'=>$linkedPersons->fetchAll(),'linked_battues'=>$linkedBattues->fetchAll()]);
}

function battue_target_types(): array
{
    return [
        'naissance'=>'Naissance',
        'tables_decennales'=>'Tables décennales',
        'bapteme'=>'Baptême',
        'mariage'=>'Mariage',
        'deces'=>'Décès',
        'recensement'=>'Recensement',
        'autre'=>'Autre',
    ];
}

function battue_search_statuses(): array
{
    return [
        'todo'=>'À chercher',
        'not_found'=>'Cherché, rien trouvé',
        'found'=>'Trouvé',
        'homonym_rejected'=>'Homonyme écarté',
        'homonym_verify'=>'Homonyme à vérifier',
        'doubt_review'=>'Doute, à revoir',
        'incomplete'=>'Table incomplète',
        'nonexistent'=>'Table inexistante',
        'not_online'=>'Table pas en ligne',
        'missing'=>'Table introuvable',
    ];
}

function battue_commune_statuses(): array
{
    return [
        'not_started'=>'Pas commencé',
        'unfinished'=>'Pas terminé',
        'done'=>'Terminé',
        'doubt'=>'Exploré avec doute',
    ];
}

function commune_suggestions_data(PDO $pdo): never
{
    $q=safe_text($_GET['q']??'');
    if(mb_strlen($q)<2)json_response(['communes'=>[]]);
    $like='%'.$q.'%';
    $prefix=$q.'%';
    // Département, région et nombre de voisines calculés seulement pour les 20 communes gardées (sous-requêtes sur
    // index) : la jointure de toutes les communes trouvées avec les lieux prenait jusqu'à 3 minutes.
    $stmt=$pdo->prepare("SELECT c.insee_code,c.name,c.centroid_lat,c.centroid_lon,
        COALESCE((SELECT p.county FROM places p WHERE p.admin4_code=c.insee_code AND p.county<>'' LIMIT 1),'') AS admin2,
        COALESCE((SELECT p.state FROM places p WHERE p.admin4_code=c.insee_code AND p.state<>'' LIMIT 1),'') AS admin1,
        (SELECT count(*) FROM commune_neighbors n WHERE n.insee_code=c.insee_code) AS neighbor_count
        FROM commune_contours c
        WHERE c.name LIKE ? COLLATE NOCASE OR replace(c.name,'-',' ') LIKE ? COLLATE NOCASE OR c.insee_code LIKE ? COLLATE NOCASE
        ORDER BY CASE WHEN c.name LIKE ? COLLATE NOCASE OR replace(c.name,'-',' ') LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END,
            c.name COLLATE NOCASE,
            c.insee_code
        LIMIT 20");
    $stmt->execute([$like,$like,$like,$prefix,$prefix]);
    $rows=$stmt->fetchAll();
    foreach($rows as &$row){
        $parts=[$row['name']];
        if($row['admin2'])$parts[]=$row['admin2'];
        if($row['admin1']&&$row['admin1']!==$row['admin2'])$parts[]=$row['admin1'];
        $parts[]=commune_country_name((string)$row['insee_code']);
        $row['label']=implode(' · ',array_filter($parts));
    }
    unset($row);
    json_response(['communes'=>$rows]);
}

function battues_data(PDO $pdo): never
{
    $status=safe_text($_GET['status']??'all');
    $q=safe_text($_GET['q']??'');
    $where=[];$params=[];
    if(in_array($status,['open','paused','closed'],true)){$where[]='b.status=?';$params[]=$status;}
    if($q!==''){$where[]="(b.title LIKE ? COLLATE NOCASE OR b.target_text LIKE ? COLLATE NOCASE OR c.name LIKE ? COLLATE NOCASE OR b.start_insee_code LIKE ? COLLATE NOCASE)";$params=array_merge($params,array_fill(0,4,'%'.$q.'%'));}
    $stmt=$pdo->prepare("SELECT b.*,c.name AS start_name,
        (SELECT count(*) FROM battue_search_items si WHERE si.battue_id=b.id) AS item_count,
        (SELECT count(*) FROM battue_search_items si WHERE si.battue_id=b.id AND si.status='todo') AS todo_count
        FROM battues b
        JOIN commune_contours c ON c.insee_code=b.start_insee_code
        ".($where?' WHERE '.implode(' AND ',$where):'')."
        ORDER BY CASE b.status WHEN 'open' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,b.updated_at DESC,b.id DESC");
    $stmt->execute($params);
    json_response(['battues'=>$stmt->fetchAll(),'target_types'=>battue_target_types(),'statuses'=>battue_search_statuses()]);
}

function battue_level_map(PDO $pdo,string $startInsee,int $maxLevel): array
{
    $levels=[$startInsee=>0];
    $frontier=[$startInsee];
    for($level=1;$level<=$maxLevel;$level++){
        if(!$frontier)break;
        $marks=implode(',',array_fill(0,count($frontier),'?'));
        $stmt=$pdo->prepare("SELECT DISTINCT neighbor_insee_code FROM commune_neighbors WHERE insee_code IN ($marks)");
        $stmt->execute($frontier);
        $next=[];
        foreach($stmt->fetchAll(PDO::FETCH_COLUMN,0) as $code){
            $code=(string)$code;
            if($code!==''&&!array_key_exists($code,$levels)){
                $levels[$code]=$level;
                $next[]=$code;
            }
        }
        $frontier=$next;
    }
    return $levels;
}

function battue_detail(PDO $pdo,int $id): never
{
    $stmt=$pdo->prepare("SELECT b.*,c.name AS start_name,c.centroid_lat,c.centroid_lon FROM battues b JOIN commune_contours c ON c.insee_code=b.start_insee_code WHERE b.id=?");
    $stmt->execute([$id]);
    $battue=$stmt->fetch();
    if(!$battue)json_response(['error'=>'Battue introuvable'],404);

    $maxLevel=max(0,min(10,(int)($battue['max_level']??2)));
    $levelByInsee=battue_level_map($pdo,(string)$battue['start_insee_code'],$maxLevel);
    $codes=array_keys($levelByInsee);
    $marks=implode(',',array_fill(0,count($codes),'?'));
    $contours=$pdo->prepare("SELECT * FROM commune_contours WHERE insee_code IN ($marks)");
    $contours->execute($codes);
    $communes=[];
    foreach($contours->fetchAll() as $row){
        $insee=(string)$row['insee_code'];
        $row['level']=$levelByInsee[$insee]??99;
        $row['country']=commune_country_name($insee); // affiché au survol de la carte
        $row['geometry']=json_decode((string)$row['geometry_json'],true);
        unset($row['geometry_json']);
        $row['aliases']=[];
        $row['items']=[];
        $row['status_counts']=[];
        $communes[$insee]=$row;
    }
    uasort($communes,static fn($a,$b)=>((int)$a['level']<=>(int)$b['level']) ?: strcasecmp((string)$a['name'],(string)$b['name']));

    $aliases=$pdo->prepare('SELECT * FROM battue_commune_aliases WHERE battue_id=? ORDER BY name COLLATE NOCASE,id');
    $aliases->execute([$id]);
    foreach($aliases->fetchAll() as $alias){
        $insee=(string)$alias['insee_code'];
        if(isset($communes[$insee]))$communes[$insee]['aliases'][]=$alias;
    }

    $items=$pdo->prepare("SELECT si.*,ade.city_name AS archive_digest_city,ade.city_alias AS archive_digest_alias,ade.archive_reference AS archive_digest_reference,ade.year_text AS archive_digest_year,ade.record_type AS archive_digest_record_type,p.name AS archive_digest_place_name
        FROM battue_search_items si
        LEFT JOIN archive_digest_entries ade ON ade.id=si.archive_digest_id
        LEFT JOIN places p ON p.id=ade.place_id
        WHERE si.battue_id=?
        ORDER BY CASE si.status WHEN 'todo' THEN 0 ELSE 1 END,si.record_type COLLATE NOCASE,si.period COLLATE NOCASE,si.updated_at DESC,si.id DESC");
    $items->execute([$id]);
    $itemIndex=[];
    $digestLinks=$pdo->prepare("SELECT ade.id,ade.city_name,ade.city_alias,ade.archive_reference,ade.year_text,ade.record_type,p.name AS place_name
        FROM battue_item_archive_digests biad
        JOIN archive_digest_entries ade ON ade.id=biad.archive_digest_id
        LEFT JOIN places p ON p.id=ade.place_id
        WHERE biad.battue_item_id=? ORDER BY ade.year_text COLLATE NOCASE,ade.id");
    foreach($items->fetchAll() as $item){
        $insee=(string)$item['insee_code'];
        if(!isset($communes[$insee]))continue;
        $status=(string)($item['status']??'todo');
        $item['media']=[];
        $digestLinks->execute([(int)$item['id']]);
        $item['archive_digests']=$digestLinks->fetchAll();
        $index=count($communes[$insee]['items']);
        $communes[$insee]['items'][]=$item;
        $itemIndex[(int)$item['id']]=[$insee,$index];
        $communes[$insee]['status_counts'][$status]=($communes[$insee]['status_counts'][$status]??0)+1;
    }
    if($itemIndex){
        $itemIds=array_keys($itemIndex);
        $marks=implode(',',array_fill(0,count($itemIds),'?'));
        $mediaStmt=$pdo->prepare("SELECT ml.id AS link_id,ml.entity_id AS battue_item_id,CAST(ml.entity_id AS TEXT) AS battue_item_ids,
            m.id,m.title,m.description,m.media_type,m.filename,m.thumbnail,m.transcription,m.date_text,m.date_calendar,m.document_reference,m.document_title,m.document_url,m.document_pages,m.is_person_photo,m.media_subject_type,m.correspondence_type,m.correspondent_name,m.correspondent_json,m.correspondence_reply_to_media_id,m.created_at,
            COALESCE(NULLIF(m.title,''),'Annotation de battue') AS attachment_label
            FROM media_links ml
            JOIN media m ON m.id=ml.media_id
            WHERE ml.entity_type='battue_item' AND ml.entity_id IN ($marks)
            ORDER BY ml.entity_id,ml.position,m.id");
        $mediaStmt->execute($itemIds);
        $mediaRows=$mediaStmt->fetchAll();
        $labelsByMedia=labels_for_entities($pdo,'media',array_map(static fn($row)=>(int)$row['id'],$mediaRows));
        foreach($mediaRows as $mediaRow){
            $mediaRow['labels']=$labelsByMedia[(int)$mediaRow['id']]??[];
            $itemId=(int)$mediaRow['battue_item_id'];
            if(!isset($itemIndex[$itemId]))continue;
            [$insee,$index]=$itemIndex[$itemId];
            $communes[$insee]['items'][$index]['media'][]=$mediaRow;
        }
    }

    $communeStatuses=$pdo->prepare('SELECT insee_code,status FROM battue_commune_statuses WHERE battue_id=?');
    $communeStatuses->execute([$id]);
    foreach($communeStatuses->fetchAll() as $row){
        $insee=(string)$row['insee_code'];
        $status=(string)$row['status'];
        if(isset($communes[$insee])&&isset(battue_commune_statuses()[$status]))$communes[$insee]['commune_status']=$status;
    }
    foreach($communes as &$commune){
        $commune['commune_status']=$commune['commune_status']??'not_started';
    }
    unset($commune);

    $levels=[];
    foreach($communes as $commune){
        $levels[(int)$commune['level']][]=$commune['insee_code'];
    }
    ksort($levels);

    $linkedPersons=$pdo->prepare("SELECT bp.id AS link_id,bp.person_id,bp.role,trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS person_name FROM battue_persons bp JOIN persons p ON p.id=bp.person_id WHERE bp.battue_id=? ORDER BY CASE bp.role WHEN 'primary' THEN 0 ELSE 1 END,bp.created_at");
    $linkedPersons->execute([$id]);
    $linkedInvestigations=$pdo->prepare("SELECT ib.investigation_id,i.title,i.question,i.status,trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS person_name FROM investigation_battues ib JOIN investigations i ON i.id=ib.investigation_id JOIN persons p ON p.id=i.person_id WHERE ib.battue_id=? ORDER BY i.updated_at DESC,i.id DESC");
    $linkedInvestigations->execute([$id]);

    json_response([
        'battue'=>$battue,
        'communes'=>array_values($communes),
        'levels'=>$levels,
        'target_types'=>battue_target_types(),
        'statuses'=>battue_search_statuses(),
        'commune_statuses'=>battue_commune_statuses(),
        'linked_persons'=>$linkedPersons->fetchAll(),
        'linked_investigations'=>$linkedInvestigations->fetchAll(),
    ]);
}

function hypotheses_data(PDO $pdo): never
{
    $status=safe_text($_GET['status']??'all');$q=safe_text($_GET['q']??'');$where=[];$params=[];
    if(in_array($status,['open','confirmed','rejected'],true)){$where[]='h.status=?';$params[]=$status;}
    if($q!==''){$where[]="(h.title LIKE ? COLLATE NOCASE OR h.statement LIKE ? COLLATE NOCASE OR p.first_name LIKE ? COLLATE NOCASE OR p.last_name LIKE ? COLLATE NOCASE)";$params=array_merge($params,array_fill(0,4,'%'.$q.'%'));}
    $sql="SELECT h.*,trim(p.first_name||' '||p.last_name) AS person_name,trim(r.first_name||' '||r.last_name) AS related_name,et.label AS event_label,e.date_text AS event_date
        FROM hypotheses h
        JOIN persons p ON p.id=h.person_id
        LEFT JOIN persons r ON r.id=h.related_person_id
        LEFT JOIN events e ON e.id=h.event_id
        LEFT JOIN event_types et ON et.id=e.event_type_id".($where?' WHERE '.implode(' AND ',$where):'')." ORDER BY CASE h.status WHEN 'open' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,h.updated_at DESC,h.id DESC LIMIT 300";
    $stmt=$pdo->prepare($sql);$stmt->execute($params);json_response(['hypotheses'=>$stmt->fetchAll()]);
}

function branches_data(PDO $pdo): never
{
    $rows=$pdo->query("SELECT b.*,trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS root_name,count(bp.person_id) AS people_count
        FROM branches b
        LEFT JOIN persons p ON p.id=b.root_person_id
        LEFT JOIN branch_people bp ON bp.branch_id=b.id
        GROUP BY b.id
        ORDER BY b.updated_at DESC,b.name COLLATE NOCASE")->fetchAll();
    json_response(['branches'=>$rows]);
}

function comparison_data(PDO $pdo): never
{
    $a=safe_int($_GET['a']??0);$b=safe_int($_GET['b']??0);
    $result=['left'=>$a?comparison_person($pdo,$a):null,'right'=>$b?comparison_person($pdo,$b):null];
    json_response($result);
}

function comparison_person(PDO $pdo,int $id): ?array
{
    $person=summary_person($pdo,$id);if(!$person)return null;
    $events=$pdo->prepare("SELECT e.id,e.date_text,e.year,t.label AS type,t.gedcom_tag,pl.name AS place,pl.subdivision,pl.country FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?) ORDER BY COALESCE(e.year,9999),e.id");
    $events->execute([$id,$id,$id]);
    $rel=$pdo->prepare("SELECT 'parent' role,p.id,trim(p.first_name||' '||p.last_name) name FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN persons p ON p.id=f.partner1_id OR p.id=f.partner2_id WHERE fc.child_id=?
        UNION ALL SELECT 'child',c.id,trim(c.first_name||' '||c.last_name) FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN persons c ON c.id=fc.child_id WHERE f.partner1_id=? OR f.partner2_id=?
        UNION ALL SELECT 'spouse',p.id,trim(p.first_name||' '||p.last_name) FROM families f JOIN persons p ON p.id=CASE WHEN f.partner1_id=? THEN f.partner2_id ELSE f.partner1_id END WHERE f.partner1_id=? OR f.partner2_id=?");
    $rel->execute([$id,$id,$id,$id,$id,$id]);
    $counts=$pdo->prepare("SELECT
        (SELECT count(*) FROM media_links ml WHERE (ml.entity_type='person' AND ml.entity_id=?) OR (ml.entity_type='event' AND ml.entity_id IN (SELECT id FROM events WHERE person_id=?))) media_count,
        (SELECT count(*) FROM source_links sl WHERE (sl.entity_type='person' AND sl.entity_id=?) OR (sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE person_id=?))) source_count,
        (SELECT count(*) FROM hypotheses h WHERE h.person_id=?) hypothesis_count,
        (SELECT count(*) FROM evidence_records er WHERE er.person_id=?) evidence_count");
    $counts->execute([$id,$id,$id,$id,$id,$id]);
    return ['person'=>$person,'events'=>$events->fetchAll(),'relations'=>$rel->fetchAll(),'counts'=>$counts->fetch()];
}

function duplicate_candidates(PDO $pdo): never
{
    $q=safe_text($_GET['q']??'');$params=[];
    $where=$q!==''?" AND (p1.first_name LIKE ? COLLATE NOCASE OR p1.last_name LIKE ? COLLATE NOCASE OR p2.first_name LIKE ? COLLATE NOCASE OR p2.last_name LIKE ? COLLATE NOCASE)":'';
    if($q!=='')$params=array_fill(0,4,'%'.$q.'%');
    // MATERIALIZED : les années sont calculées une fois par personne (sinon SQLite les recalculait pour chaque
    // paire comparée, ~7 millions de fois) ; les paires sont rapprochées par nom + 3 premières lettres du prénom.
    // Même résultat, 2,7 s → 14 ms sur la base de test.
    $sql="WITH person_years AS MATERIALIZED (
        SELECT p.id,p.first_name,p.last_name,p.middle_name,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) birth_year,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) death_year,
        lc_fold(p.last_name) AS last_key, substr(lc_fold(p.first_name),1,3) AS first_key, lc_fold(p.first_name) AS first_full
        FROM persons p WHERE trim(COALESCE(p.last_name,''))<>'' AND trim(COALESCE(p.first_name,''))<>''
    )
    SELECT p1.id id1,p2.id id2,p1.first_name first1,p1.last_name last1,p2.first_name first2,p2.last_name last2,p1.birth_year birth1,p2.birth_year birth2,p1.death_year death1,p2.death_year death2,
        (CASE WHEN p1.first_full=p2.first_full THEN 40 ELSE 0 END+
         CASE WHEN p1.last_key=p2.last_key THEN 35 ELSE 0 END+
         CASE WHEN p1.birth_year IS NOT NULL AND p2.birth_year IS NOT NULL AND abs(p1.birth_year-p2.birth_year)<=2 THEN 20 ELSE 0 END+
         CASE WHEN p1.death_year IS NOT NULL AND p2.death_year IS NOT NULL AND abs(p1.death_year-p2.death_year)<=2 THEN 15 ELSE 0 END) score
    FROM person_years p1 JOIN person_years p2 ON p2.last_key=p1.last_key AND p2.first_key=p1.first_key AND p1.id<p2.id
    WHERE (p1.birth_year IS NULL OR p2.birth_year IS NULL OR abs(p1.birth_year-p2.birth_year)<=5)
    {$where}
    ORDER BY score DESC,lower(p1.last_name),lower(p1.first_name) LIMIT 120";
    $stmt=$pdo->prepare($sql);$stmt->execute($params);json_response(['candidates'=>$stmt->fetchAll()]);
}

/**
 * Empreintes sha1 des médias, gardées dans DATA_DIR/cache/media-sha1.json : un fichier n'est relu que si sa
 * taille ou sa date de modification a changé (sinon les 782 fichiers étaient relus à chaque recherche de doublons).
 */
function media_hash_cache_path(): string
{
    return DATA_DIR . '/cache/media-sha1.json';
}

function media_hash_cache_load(): array
{
    $data = @json_decode((string) @file_get_contents(media_hash_cache_path()), true);
    return is_array($data) ? $data : [];
}

function media_hash_cache_save(array $hashes): void
{
    $path = media_hash_cache_path();
    if (!is_dir(dirname($path)) && !@mkdir(dirname($path), 0775, true)) return;
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (@file_put_contents($tmp, json_encode($hashes)) !== false) @rename($tmp, $path); else @unlink($tmp);
}

function media_file_sha1(array &$hashes, string $key, string $path): ?string
{
    clearstatcache(true, $path);
    $size = @filesize($path);
    $mtime = @filemtime($path);
    if ($size === false || $mtime === false) return null;
    $cached = $hashes[$key] ?? null;
    if (is_array($cached) && ($cached[0] ?? null) === $size && ($cached[1] ?? null) === $mtime && is_string($cached[2] ?? null)) {
        return $cached[2];
    }
    $hash = @hash_file('sha1', $path);
    if ($hash === false) return null;
    $hashes[$key] = [$size, $mtime, $hash];
    return $hash;
}

function media_duplicates_data(PDO $pdo): never
{
    // Détection de doublons de médias : même contenu de fichier (empreinte sha1),
    // même si le fichier a été importé sous deux noms/fiches différents.
    $stmt = $pdo->query("SELECT id,title,filename,thumbnail,media_type,date_text,document_reference,document_title,created_at FROM media WHERE TRIM(COALESCE(filename,''))<>'' ORDER BY id");
    $rows = $stmt->fetchAll();
    $mediaDir = MEDIA_DIR;
    $byHash = [];
    $hashes = media_hash_cache_load();
    $seen = [];
    foreach ($rows as $row) {
        $path = $mediaDir . '/' . $row['filename'];
        if (!is_file($path)) continue;
        $hash = media_file_sha1($hashes, (string) $row['filename'], $path);
        if ($hash === null) continue;
        $seen[(string) $row['filename']] = true;
        $row['size_bytes'] = (int) (@filesize($path) ?: 0);
        $byHash[$hash][] = $row;
    }
    media_hash_cache_save(array_intersect_key($hashes, $seen));
    $duplicateGroups = array_filter($byHash, static fn($items) => count($items) > 1);
    if (!$duplicateGroups) {
        json_response(['groups' => [], 'scanned' => count($rows)]);
    }

    $allIds = [];
    foreach ($duplicateGroups as $items) { foreach ($items as $item) { $allIds[] = (int) $item['id']; } }
    $marks = implode(',', array_fill(0, count($allIds), '?'));

    // Personnes rattachées (mêmes règles que pour la liste des médias)
    $peopleSql = "SELECT DISTINCT media_id, person_id, name FROM (
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN persons p ON ml.entity_type='person' AND p.id=ml.entity_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN persons p ON p.id=e.person_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN families f ON f.id=e.family_id JOIN persons p ON p.id=f.partner1_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN families f ON f.id=e.family_id JOIN persons p ON p.id=f.partner2_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id JOIN persons p ON p.id=f.partner1_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id JOIN persons p ON p.id=f.partner2_id
        WHERE ml.media_id IN ($marks)
        UNION
        SELECT ml.media_id,p.id AS person_id,trim(p.first_name||' '||p.last_name) AS name
        FROM media_links ml JOIN census_members cm ON ml.entity_type='census' AND cm.census_id=ml.entity_id JOIN persons p ON p.id=cm.person_id
        WHERE ml.media_id IN ($marks)
    ) WHERE person_id IS NOT NULL ORDER BY name";
    $people = $pdo->prepare($peopleSql);
    $people->execute(array_merge($allIds, $allIds, $allIds, $allIds, $allIds, $allIds, $allIds));
    $peopleByMedia = [];
    foreach ($people->fetchAll() as $person) {
        $peopleByMedia[(int) $person['media_id']][] = ['id' => (int) $person['person_id'], 'name' => $person['name'] ?: 'Personne sans nom'];
    }

    // Nature du rattachement (fiche, événement, recensement, famille, source, annotation de battue…)
    $attachSql = "SELECT ml.media_id,
            CASE
                WHEN ml.entity_type='person' THEN 'Fiche individuelle'
                WHEN ml.entity_type='event' THEN trim(COALESCE(et.label,'Événement') || CASE WHEN ev.date_text<>'' THEN ' — '||ev.date_text ELSE '' END)
                WHEN ml.entity_type='census' THEN trim('Recensement ' || cr.year || CASE WHEN cr.address<>'' THEN ' — '||cr.address ELSE '' END)
                WHEN ml.entity_type='family' THEN 'Famille'
                WHEN ml.entity_type='source' THEN 'Source'
                WHEN ml.entity_type='battue_item' THEN 'Annotation de battue'
                ELSE 'Non rattaché'
            END AS attachment_label
        FROM media_links ml
        LEFT JOIN events ev ON ml.entity_type='event' AND ev.id=ml.entity_id
        LEFT JOIN event_types et ON et.id=ev.event_type_id
        LEFT JOIN census_records cr ON ml.entity_type='census' AND cr.id=ml.entity_id
        WHERE ml.media_id IN ($marks)";
    $attach = $pdo->prepare($attachSql);
    $attach->execute($allIds);
    $attachByMedia = [];
    foreach ($attach->fetchAll() as $row) { $attachByMedia[(int) $row['media_id']][] = (string) $row['attachment_label']; }

    // Origine (enquête / battue)
    $originSql = "SELECT im.media_id, 'Enquête : ' || COALESCE(NULLIF(i.title,''),'#'||i.id) AS origin_label
        FROM investigation_media im JOIN investigations i ON i.id=im.investigation_id
        WHERE im.media_id IN ($marks)
        UNION ALL
        SELECT ml.media_id, 'Battue : ' || COALESCE(NULLIF(b.title,''),'#'||b.id) || ' · ' || COALESCE(NULLIF(bsi.title,''),NULLIF(bsi.period,''),'annotation') AS origin_label
        FROM media_links ml JOIN battue_search_items bsi ON ml.entity_type='battue_item' AND bsi.id=ml.entity_id JOIN battues b ON b.id=bsi.battue_id
        WHERE ml.media_id IN ($marks)";
    $origins = $pdo->prepare($originSql);
    $origins->execute(array_merge($allIds, $allIds));
    foreach ($origins->fetchAll() as $row) { $attachByMedia[(int) $row['media_id']][] = (string) $row['origin_label']; }

    $groups = [];
    foreach ($duplicateGroups as $hash => $items) {
        $groupItems = array_map(function ($item) use ($peopleByMedia, $attachByMedia) {
            $mediaId = (int) $item['id'];
            $labels = array_values(array_unique(array_filter($attachByMedia[$mediaId] ?? [])));
            $people = [];
            foreach (($peopleByMedia[$mediaId] ?? []) as $person) { $people[(int) $person['id']] = $person; }
            return [
                'id' => $mediaId,
                'title' => $item['title'],
                'filename' => $item['filename'],
                'thumbnail' => $item['thumbnail'],
                'media_type' => $item['media_type'],
                'date_text' => $item['date_text'],
                'document_reference' => $item['document_reference'],
                'document_title' => $item['document_title'],
                'created_at' => $item['created_at'],
                'size_bytes' => (int) $item['size_bytes'],
                'attachment_label' => $labels ? implode(' · ', $labels) : 'Non rattaché',
                'people_links' => array_values($people),
            ];
        }, $items);
        usort($groupItems, static fn($a, $b) => $a['id'] <=> $b['id']);
        $groups[] = [
            'hash' => substr((string) $hash, 0, 12),
            'count' => count($groupItems),
            'size_bytes' => $groupItems[0]['size_bytes'] ?? 0,
            'items' => $groupItems,
        ];
    }
    usort($groups, static fn($a, $b) => $b['count'] <=> $a['count'] ?: $b['size_bytes'] <=> $a['size_bytes']);
    json_response(['groups' => array_values($groups), 'scanned' => count($rows)]);
}

function deed_preview(PDO $pdo): never
{
    $stmt=$pdo->query("SELECT e.id,e.date_text,e.year,trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS person,pl.name AS place
        FROM events e JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE lower(t.label)='deed' OR t.gedcom_tag='DEED'
        ORDER BY COALESCE(e.year,9999),e.id");
    json_response(['events'=>$stmt->fetchAll()]);
}

function bulk_preview(PDO $pdo): never
{
    $match=safe_text($_GET['match']??'');if($match==='')json_response(['count'=>0,'people'=>[]]);$stmt=$pdo->prepare('SELECT id,first_name,last_name FROM persons WHERE last_name=? COLLATE NOCASE ORDER BY first_name LIMIT 12');$stmt->execute([$match]);$people=$stmt->fetchAll();$count=$pdo->prepare('SELECT count(*) FROM persons WHERE last_name=? COLLATE NOCASE');$count->execute([$match]);json_response(['count'=>(int)$count->fetchColumn(),'people'=>$people]);
}

function archive_digest_record_types(): array
{
    return [
        'table_decennale' => 'Table décennale',
        'mariage' => 'Mariage',
        'naissance' => 'Naissance',
        'deces' => 'Décès',
        'bapteme' => 'Baptême',
        'succession' => 'Succession',
        'recensement' => 'Recensement',
        'prison' => 'Prison',
        'fiche_militaire' => 'Fiche militaire',
        'liste_prisonnier' => 'Liste prisonnier',
        'autre' => 'Autre',
    ];
}

function archive_digest_statuses(): array
{
    return [
        'todo' => 'À faire',
        'done' => 'Terminé',
        'review' => 'À revoir',
        'doubt' => 'Doute',
        'priority' => 'À faire en priorité',
        'later' => 'À faire plus tard',
    ];
}

function archive_digest_search_data(PDO $pdo): never
{
    $id = safe_int($_GET['id'] ?? 0);
    $q = safe_text($_GET['q'] ?? '');
    $city = safe_text($_GET['city'] ?? '');
    $dept = safe_text($_GET['dept'] ?? '');
    $region = safe_text($_GET['region'] ?? '');
    $placeId = safe_int($_GET['place_id'] ?? 0);
    $radiusKm = isset($_GET['radius_km']) ? (float)$_GET['radius_km'] : 0.0;
    $radiusKm = max(0.0, min(50.0, $radiusKm));
    $recordType = safe_text($_GET['record_type'] ?? '');
    $status = safe_text($_GET['status'] ?? '');
    $where = [];
    $params = [];
    if ($id > 0) { $where[] = 'a.id = ?'; $params[] = $id; }
    if ($q !== '') {
        $where[] = "(a.archive_service LIKE ? COLLATE NOCASE OR a.archive_reference LIKE ? COLLATE NOCASE OR a.year_text LIKE ? COLLATE NOCASE OR a.searched LIKE ? COLLATE NOCASE OR a.found LIKE ? COLLATE NOCASE OR a.notes LIKE ? COLLATE NOCASE OR p.name LIKE ? COLLATE NOCASE OR a.city_name LIKE ? COLLATE NOCASE OR a.city_alias LIKE ? COLLATE NOCASE)";
        for ($i = 0; $i < 9; $i++) $params[] = '%' . $q . '%';
    }
    $nearbyPlaces = [];
    $radiusUnavailable = false;
    if ($placeId > 0) {
        $placeStmt = $pdo->prepare('SELECT id,name,latitude,longitude FROM places WHERE id=?');
        $placeStmt->execute([$placeId]);
        $place = $placeStmt->fetch();
        $placeIds = $place ? [(int)$place['id']] : [];
        if ($place && $radiusKm > 0) {
            if ($place['latitude'] === null || $place['longitude'] === null || $place['latitude'] === '' || $place['longitude'] === '') {
                $radiusUnavailable = true;
            } else {
                $lat = (float)$place['latitude']; $lon = (float)$place['longitude'];
                $latDelta = $radiusKm / 111.0;
                $lonDelta = $radiusKm / (111.0 * max(0.1, cos(deg2rad($lat))));
                $candidates = $pdo->prepare('SELECT id,name,latitude,longitude FROM places WHERE id<>? AND latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?');
                $candidates->execute([$placeId, $lat-$latDelta, $lat+$latDelta, $lon-$lonDelta, $lon+$lonDelta]);
                foreach ($candidates->fetchAll() as $candidate) {
                    $distance = haversine_km($lat, $lon, (float)$candidate['latitude'], (float)$candidate['longitude']);
                    if ($distance <= $radiusKm) {
                        $placeIds[] = (int)$candidate['id'];
                        $nearbyPlaces[] = ['id'=>(int)$candidate['id'], 'name'=>$candidate['name'], 'distance_km'=>round($distance,1)];
                    }
                }
            }
        }
        if ($placeIds) {
            $where[] = 'a.place_id IN (' . implode(',', array_fill(0, count($placeIds), '?')) . ')';
            array_push($params, ...$placeIds);
        }
    } elseif ($city !== '') { $where[] = "(p.name LIKE ? COLLATE NOCASE OR a.city_name LIKE ? COLLATE NOCASE OR a.city_alias LIKE ? COLLATE NOCASE)"; $params[] = '%' . $city . '%'; $params[] = '%' . $city . '%'; $params[] = '%' . $city . '%'; }
    if ($dept !== '') { $where[] = "(a.department LIKE ? COLLATE NOCASE OR p.county LIKE ? COLLATE NOCASE)"; $params[] = '%' . $dept . '%'; $params[] = '%' . $dept . '%'; }
    if ($region !== '') { $where[] = "(a.region LIKE ? COLLATE NOCASE OR p.state LIKE ? COLLATE NOCASE)"; $params[] = '%' . $region . '%'; $params[] = '%' . $region . '%'; }
    if ($recordType !== '' && isset(archive_digest_record_types()[$recordType])) { $where[] = 'a.record_type = ?'; $params[] = $recordType; }
    if ($status !== '' && isset(archive_digest_statuses()[$status])) { $where[] = 'a.status = ?'; $params[] = $status; }
    $sqlWhere = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $stmt = $pdo->prepare("
        SELECT a.*, p.name AS place_name, p.subdivision, p.county, p.state, p.country
        FROM archive_digest_entries a
        LEFT JOIN places p ON p.id = a.place_id
        $sqlWhere
        ORDER BY COALESCE(p.name, a.city_name, a.city_alias) COLLATE NOCASE, a.year_text COLLATE NOCASE, a.id DESC
        LIMIT 300");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $media = $pdo->prepare("SELECT m.id,m.title,m.media_type,m.filename,m.thumbnail,adm.page_number AS archive_page_number FROM archive_digest_media adm JOIN media m ON m.id=adm.media_id WHERE adm.archive_digest_id=? ORDER BY adm.id");
    $people = $pdo->prepare("SELECT adp.*, COALESCE(NULLIF(trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')),''), NULLIF(trim(COALESCE(adp.first_name,'') || ' ' || COALESCE(adp.last_name,'')),''), 'Personne non nommée') AS person_name FROM archive_digest_people adp LEFT JOIN persons p ON p.id=adp.person_id WHERE adp.archive_digest_id=? ORDER BY adp.id");
    foreach ($rows as &$row) {
        $row['pages'] = json_decode((string)($row['pages_json'] ?? '[]'), true) ?: [];
        $media->execute([(int)$row['id']]);
        $row['media'] = $media->fetchAll();
        $people->execute([(int)$row['id']]);
        $row['people'] = $people->fetchAll();
    }
    unset($row);
    json_response(['rows' => $rows, 'types' => archive_digest_record_types(), 'statuses' => archive_digest_statuses(), 'radius_km' => $radiusKm, 'nearby_place_count' => count($nearbyPlaces), 'radius_unavailable' => $radiusUnavailable]);
}

function archive_digest_media_search_data(PDO $pdo): never
{
    $q = safe_text($_GET['q'] ?? '');
    if (strlen($q) < 2) json_response(['rows' => []]);
    $like = '%' . $q . '%';
    $stmt = $pdo->prepare("SELECT id,title,media_type,filename,thumbnail FROM media WHERE title LIKE ? COLLATE NOCASE OR filename LIKE ? COLLATE NOCASE ORDER BY id DESC LIMIT 30");
    $stmt->execute([$like, $like]);
    json_response(['rows' => $stmt->fetchAll()]);
}

function archive_digest_gap_types(): array
{
    return [
        'destroyed' => 'Registre détruit ou disparu',
        'missing_period' => 'Période ou année absente',
        'not_digitized' => 'Non numérisé',
        'not_online' => 'Non disponible en ligne',
        'unavailable' => 'Non communicable / indisponible',
        'other' => 'Autre lacune',
    ];
}

function archive_digest_request_types(): array
{
    return [
        'order' => 'Acte à commander',
        'reading_room' => 'À consulter en salle',
        'photograph' => 'À photographier / numériser',
        'copy' => 'Copie ou reproduction à demander',
        'other' => 'Autre demande',
    ];
}

function archive_digest_request_statuses(): array
{
    return ['todo' => 'À faire', 'ordered' => 'Demandé', 'waiting' => 'En attente', 'received' => 'Reçu', 'done' => 'Consulté / terminé', 'cancelled' => 'Annulé'];
}

function archive_digest_auxiliary_data(PDO $pdo): array
{
    $gaps = $pdo->query("SELECT g.*,a.city_name,a.city_alias,a.year_text,a.record_type,a.archive_service,a.archive_reference,p.name AS place_name
        FROM archive_digest_gaps g LEFT JOIN archive_digest_entries a ON a.id=g.archive_digest_id LEFT JOIN places p ON p.id=a.place_id
        ORDER BY CASE g.status WHEN 'open' THEN 0 ELSE 1 END,g.created_at DESC,g.id DESC")->fetchAll();
    $requests = $pdo->query("SELECT r.*,a.city_name,a.city_alias,a.year_text,a.record_type,a.archive_service AS linked_archive_service,a.archive_reference AS linked_archive_reference,p.name AS place_name
        FROM archive_digest_requests r LEFT JOIN archive_digest_entries a ON a.id=r.archive_digest_id LEFT JOIN places p ON p.id=a.place_id
        ORDER BY CASE r.status WHEN 'todo' THEN 0 WHEN 'ordered' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,COALESCE(NULLIF(r.due_at,''),'9999-12-31'),r.id DESC")->fetchAll();
    json_response(['gaps' => $gaps, 'requests' => $requests, 'gap_types' => archive_digest_gap_types(), 'request_types' => archive_digest_request_types(), 'request_statuses' => archive_digest_request_statuses()]);
}

function archive_visit_plans_data(PDO $pdo): never
{
    $plans = $pdo->query("SELECT p.*,count(i.id) AS item_count,sum(CASE WHEN i.checked=1 THEN 1 ELSE 0 END) AS checked_count
        FROM archive_visit_plans p LEFT JOIN archive_visit_items i ON i.visit_id=p.id
        GROUP BY p.id ORDER BY CASE WHEN p.visit_date='' THEN 1 ELSE 0 END,p.visit_date,p.updated_at DESC,p.id DESC")->fetchAll();
    $items = $pdo->prepare("SELECT i.*,d.city_name AS digest_city,d.city_alias AS digest_alias,d.year_text AS digest_year,d.record_type AS digest_record_type,d.archive_url AS digest_url,p.name AS digest_place_name
        FROM archive_visit_items i LEFT JOIN archive_digest_entries d ON d.id=i.archive_digest_id LEFT JOIN places p ON p.id=d.place_id
        WHERE i.visit_id=? ORDER BY i.checked,i.archive_reference COLLATE NOCASE,i.id");
    foreach ($plans as &$plan) {
        $items->execute([(int)$plan['id']]);
        $plan['items'] = $items->fetchAll();
        $investigations = $pdo->prepare("SELECT i.id,i.title,i.status,trim(replace(replace(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),'  ',' '),'  ',' ')) AS person_name FROM archive_visit_investigations vi JOIN investigations i ON i.id=vi.investigation_id LEFT JOIN persons p ON p.id=i.person_id WHERE vi.visit_id=? ORDER BY i.title COLLATE NOCASE,i.id");
        $investigations->execute([(int)$plan['id']]);
        $plan['investigations'] = $investigations->fetchAll();
        $battues = $pdo->prepare("SELECT b.id,b.title,b.status,b.target_type,b.target_text,c.name AS start_name FROM archive_visit_battues vb JOIN battues b ON b.id=vb.battue_id LEFT JOIN commune_contours c ON c.insee_code=b.start_insee_code WHERE vb.visit_id=? ORDER BY b.title COLLATE NOCASE,b.id");
        $battues->execute([(int)$plan['id']]);
        $plan['battues'] = $battues->fetchAll();
        $plan['labels'] = labels_for_entity($pdo,'archive_visit',(int)$plan['id']);
        $plan['item_count'] = (int)$plan['item_count'];
        $plan['checked_count'] = (int)$plan['checked_count'];
    }
    unset($plan);
    json_response(['plans' => $plans]);
}

function archive_visit_plan_row(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM archive_visit_plans WHERE id=?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function save_archive_visit_plan(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $center = safe_text($data['archive_center'] ?? '');
    if ($center === '') throw new RuntimeException('Indique le centre d’archives à visiter.');
    $title = safe_text($data['title'] ?? '') ?: 'Visite — '.$center;
    $websiteUrl = safe_text($data['website_url'] ?? '');
    if ($websiteUrl !== '' && !filter_var($websiteUrl, FILTER_VALIDATE_URL)) throw new RuntimeException('URL générale du centre invalide.');
    $infoUrl = safe_text($data['info_url'] ?? '');
    if ($infoUrl !== '' && !filter_var($infoUrl, FILTER_VALIDATE_URL)) throw new RuntimeException('URL d’information du centre invalide.');
    $values = [$title,safe_text($data['visit_date'] ?? ''),$center,safe_text($data['address'] ?? ''),$websiteUrl,$infoUrl,safe_text($data['opening_hours'] ?? ''),safe_text($data['closure_notice'] ?? ''),safe_text($data['room_notes'] ?? ''),safe_text($data['notes'] ?? '')];
    if ($id) {
        $old = archive_visit_plan_row($pdo,$id); if (!$old) throw new RuntimeException('Feuille de mission introuvable.');
        $pdo->prepare('UPDATE archive_visit_plans SET title=?,visit_date=?,archive_center=?,address=?,website_url=?,info_url=?,opening_hours=?,closure_notice=?,room_notes=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$values,$id]);
        log_change($pdo,'archive_visit_plan',$id,'update','Feuille de mission modifiée : '.$title,$old,null);
    } else {
        $pdo->prepare('INSERT INTO archive_visit_plans(title,visit_date,archive_center,address,website_url,info_url,opening_hours,closure_notice,room_notes,notes) VALUES(?,?,?,?,?,?,?,?,?,?)')->execute($values);
        $id = (int)$pdo->lastInsertId();
        log_change($pdo,'archive_visit_plan',$id,'create','Feuille de mission ajoutée : '.$title,null,null);
    }
    return ['id'=>$id];
}

function delete_archive_visit_plan(PDO $pdo, array $data): array
{
    $id=safe_int($data['id']??0);$old=archive_visit_plan_row($pdo,$id);if(!$old)throw new RuntimeException('Feuille de mission introuvable.');
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='archive_visit' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM archive_visit_plans WHERE id=?')->execute([$id]);
    log_change($pdo,'archive_visit_plan',$id,'delete','Feuille de mission supprimée : '.($old['title']??'#'.$id),$old,null);
    return ['id'=>$id];
}

function save_archive_visit_item(PDO $pdo, array $data): array
{
    $id=safe_int($data['id']??0);$visitId=safe_int($data['visit_id']??0);if(!archive_visit_plan_row($pdo,$visitId))throw new RuntimeException('Feuille de mission introuvable.');
    $digestId=safe_int($data['archive_digest_id']??0) ?: null;$digest=[];
    if($digestId){$digest=archive_digest_row($pdo,$digestId);if(!$digest)throw new RuntimeException('Dépouillement d’archive introuvable.');}
    $reference=safe_text($data['archive_reference']??($digest['archive_reference']??''));
    if($reference==='')throw new RuntimeException('Indique une cote à consulter.');
    $title=safe_text($data['title']??'') ?: trim(implode(' · ',array_filter([(string)($digest['city_name']??''),(string)($digest['year_text']??''),(string)($digest['record_type']??'')])));
    $values=[$visitId,$digestId,safe_text($data['archive_service']??($digest['archive_service']??'')),$reference,$title,safe_text($data['place_label']??($digest['city_name']??'')),safe_text($data['notes']??''),safe_int($data['checked']??0)?1:0];
    if($id){$stmt=$pdo->prepare('SELECT * FROM archive_visit_items WHERE id=?');$stmt->execute([$id]);$old=$stmt->fetch();if(!$old)throw new RuntimeException('Cote de visite introuvable.');$pdo->prepare('UPDATE archive_visit_items SET visit_id=?,archive_digest_id=?,archive_service=?,archive_reference=?,title=?,place_label=?,notes=?,checked=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$values,$id]);}
    else{$pdo->prepare('INSERT INTO archive_visit_items(visit_id,archive_digest_id,archive_service,archive_reference,title,place_label,notes,checked) VALUES(?,?,?,?,?,?,?,?)')->execute($values);$id=(int)$pdo->lastInsertId();}
    return ['id'=>$id];
}

function delete_archive_visit_item(PDO $pdo, array $data): array
{
    $id=safe_int($data['id']??0);$stmt=$pdo->prepare('SELECT * FROM archive_visit_items WHERE id=?');$stmt->execute([$id]);$old=$stmt->fetch();if(!$old)throw new RuntimeException('Cote de visite introuvable.');$pdo->prepare('DELETE FROM archive_visit_items WHERE id=?')->execute([$id]);return ['id'=>$id];
}

function archive_visit_ids(mixed $raw): array
{
    if (!is_array($raw)) $raw = [$raw];
    return array_values(array_unique(array_filter(array_map('safe_int',$raw))));
}

function save_archive_visit_links(PDO $pdo, array $data): array
{
    $visitId=safe_int($data['visit_id']??0);if(!archive_visit_plan_row($pdo,$visitId))throw new RuntimeException('Feuille de mission introuvable.');
    $investigationIds=archive_visit_ids($data['investigation_ids']??[]);$battueIds=archive_visit_ids($data['battue_ids']??[]);
    $checkInvestigation=$pdo->prepare('SELECT 1 FROM investigations WHERE id=?');$checkBattue=$pdo->prepare('SELECT 1 FROM battues WHERE id=?');
    foreach($investigationIds as $id){$checkInvestigation->execute([$id]);if(!$checkInvestigation->fetchColumn())throw new RuntimeException('Enquête introuvable.');}
    foreach($battueIds as $id){$checkBattue->execute([$id]);if(!$checkBattue->fetchColumn())throw new RuntimeException('Battue introuvable.');}
    $pdo->prepare('DELETE FROM archive_visit_investigations WHERE visit_id=?')->execute([$visitId]);$insertInvestigation=$pdo->prepare('INSERT INTO archive_visit_investigations(visit_id,investigation_id) VALUES(?,?)');foreach($investigationIds as $id)$insertInvestigation->execute([$visitId,$id]);
    $pdo->prepare('DELETE FROM archive_visit_battues WHERE visit_id=?')->execute([$visitId]);$insertBattue=$pdo->prepare('INSERT INTO archive_visit_battues(visit_id,battue_id) VALUES(?,?)');foreach($battueIds as $id)$insertBattue->execute([$visitId,$id]);
    set_label_links($pdo,['entity_type'=>'archive_visit','entity_id'=>$visitId,'label_ids'=>archive_visit_ids($data['label_ids']??[])]);
    log_change($pdo,'archive_visit_plan',$visitId,'links','Liens et étiquettes de la visite mis à jour',null,['investigations'=>$investigationIds,'battues'=>$battueIds]);
    return ['id'=>$visitId];
}

function archive_digest_transcriptions_data(PDO $pdo, int $entryId): array
{
    $entry = archive_digest_row($pdo, $entryId);
    if (!$entry) json_response(['error' => 'Dépouillement introuvable'], 404);
    $media = $pdo->prepare("SELECT m.id,m.title,m.filename,m.thumbnail,m.media_type,adm.page_number AS archive_page_number FROM archive_digest_media adm JOIN media m ON m.id=adm.media_id WHERE adm.archive_digest_id=? ORDER BY adm.id");
    $media->execute([$entryId]);
    $lines = $pdo->prepare('SELECT l.*,m.title AS media_title,m.filename,m.thumbnail,m.media_type FROM archive_digest_transcription_lines l LEFT JOIN media m ON m.id=l.media_id WHERE l.archive_digest_id=? ORDER BY l.page_number COLLATE NOCASE,l.line_number,l.id');
    $lines->execute([$entryId]);
    $versions = $pdo->prepare('SELECT * FROM archive_digest_transcription_versions WHERE archive_digest_id=? ORDER BY id DESC');
    $versions->execute([$entryId]);
    json_response(['entry' => $entry, 'media' => $media->fetchAll(), 'lines' => $lines->fetchAll(), 'versions' => $versions->fetchAll()]);
}

function archive_digest_reference_label(array $row): string
{
    return trim(implode(' · ', array_filter([(string)($row['place_name'] ?? $row['city_name'] ?? ''), (string)($row['year_text'] ?? ''), (string)($row['archive_reference'] ?? $row['linked_archive_reference'] ?? '')])));
}

function save_archive_digest_gap(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $entryId = safe_int($data['archive_digest_id'] ?? 0) ?: null;
    if ($entryId && !archive_digest_row($pdo, $entryId)) throw new RuntimeException('Dépouillement introuvable.');
    $type = safe_text($data['gap_type'] ?? 'missing_period');
    if (!isset(archive_digest_gap_types()[$type])) $type = 'other';
    $status = safe_text($data['status'] ?? 'open') === 'closed' ? 'closed' : 'open';
    $title = safe_text($data['title'] ?? '');
    if ($title === '') throw new RuntimeException('Indique la lacune constatée.');
    $url = safe_text($data['url'] ?? '');
    if ($url !== '' && !filter_var($url, FILTER_VALIDATE_URL)) throw new RuntimeException('Adresse Internet invalide.');
    $values = [$entryId, $type, safe_text($data['period_text'] ?? ''), $title, safe_text($data['notes'] ?? ''), $url, $status];
    if ($id) {
        $before = $pdo->prepare('SELECT * FROM archive_digest_gaps WHERE id=?'); $before->execute([$id]); $old = $before->fetch(); if (!$old) throw new RuntimeException('Lacune introuvable.');
        $pdo->prepare('UPDATE archive_digest_gaps SET archive_digest_id=?,gap_type=?,period_text=?,title=?,notes=?,url=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$values, $id]);
        log_change($pdo, 'archive_digest_gap', $id, 'update', 'Lacune d’archive modifiée : '.$title, $old, null);
    } else {
        $pdo->prepare('INSERT INTO archive_digest_gaps(archive_digest_id,gap_type,period_text,title,notes,url,status) VALUES(?,?,?,?,?,?,?)')->execute($values);
        $id = (int)$pdo->lastInsertId(); log_change($pdo, 'archive_digest_gap', $id, 'create', 'Lacune d’archive ajoutée : '.$title, null, null);
    }
    return ['id' => $id];
}

function delete_archive_digest_gap(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0); $stmt = $pdo->prepare('SELECT * FROM archive_digest_gaps WHERE id=?'); $stmt->execute([$id]); $row = $stmt->fetch();
    if (!$row) throw new RuntimeException('Lacune introuvable.');
    $pdo->prepare('DELETE FROM archive_digest_gaps WHERE id=?')->execute([$id]); log_change($pdo, 'archive_digest_gap', $id, 'delete', 'Lacune d’archive supprimée', $row, null); return ['id' => $id];
}

function save_archive_digest_request(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0); $entryId = safe_int($data['archive_digest_id'] ?? 0) ?: null;
    if ($entryId && !archive_digest_row($pdo, $entryId)) throw new RuntimeException('Dépouillement introuvable.');
    $type = safe_text($data['request_type'] ?? 'order'); if (!isset(archive_digest_request_types()[$type])) $type = 'other';
    $status = safe_text($data['status'] ?? 'todo'); if (!isset(archive_digest_request_statuses()[$status])) $status = 'todo';
    $title = safe_text($data['title'] ?? ''); if ($title === '') throw new RuntimeException('Indique l’acte ou le document à consulter.');
    $url = safe_text($data['url'] ?? ''); if ($url !== '' && !filter_var($url, FILTER_VALIDATE_URL)) throw new RuntimeException('Adresse Internet invalide.');
    $values = [$entryId, $type, $status, $title, safe_text($data['archive_service'] ?? ''), safe_text($data['archive_reference'] ?? ''), safe_text($data['due_at'] ?? ''), $url, safe_text($data['notes'] ?? '')];
    if ($id) {
        $before = $pdo->prepare('SELECT * FROM archive_digest_requests WHERE id=?'); $before->execute([$id]); $old = $before->fetch(); if (!$old) throw new RuntimeException('Demande introuvable.');
        $pdo->prepare('UPDATE archive_digest_requests SET archive_digest_id=?,request_type=?,status=?,title=?,archive_service=?,archive_reference=?,due_at=?,url=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$values, $id]);
        log_change($pdo, 'archive_digest_request', $id, 'update', 'Demande d’archive modifiée : '.$title, $old, null);
    } else {
        $pdo->prepare('INSERT INTO archive_digest_requests(archive_digest_id,request_type,status,title,archive_service,archive_reference,due_at,url,notes) VALUES(?,?,?,?,?,?,?,?,?)')->execute($values);
        $id = (int)$pdo->lastInsertId(); log_change($pdo, 'archive_digest_request', $id, 'create', 'Demande d’archive ajoutée : '.$title, null, null);
    }
    return ['id' => $id];
}

function delete_archive_digest_request(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0); $stmt = $pdo->prepare('SELECT * FROM archive_digest_requests WHERE id=?'); $stmt->execute([$id]); $row = $stmt->fetch();
    if (!$row) throw new RuntimeException('Demande introuvable.');
    $pdo->prepare('DELETE FROM archive_digest_requests WHERE id=?')->execute([$id]); log_change($pdo, 'archive_digest_request', $id, 'delete', 'Demande d’archive supprimée', $row, null); return ['id' => $id];
}

function normalize_archive_digest_zone(mixed $raw): string
{
    $zone = is_array($raw) ? $raw : json_decode((string)$raw, true);
    if (!is_array($zone)) return '';
    $clean = [];
    foreach (['x','y','width','height'] as $key) {
        if (!isset($zone[$key]) || !is_numeric($zone[$key])) return '';
        $clean[$key] = max(0, min(100, round((float)$zone[$key], 3)));
    }
    return ($clean['width'] > 0 && $clean['height'] > 0) ? json_encode($clean) : '';
}

function save_archive_digest_transcription_line(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0); $entryId = safe_int($data['archive_digest_id'] ?? 0); if (!$entryId || !archive_digest_row($pdo, $entryId)) throw new RuntimeException('Dépouillement introuvable.');
    $mediaId = safe_int($data['media_id'] ?? 0) ?: null;
    if ($mediaId) { $check = $pdo->prepare('SELECT 1 FROM archive_digest_media WHERE archive_digest_id=? AND media_id=?'); $check->execute([$entryId, $mediaId]); if (!$check->fetchColumn()) throw new RuntimeException('Ce média n’est pas lié au dépouillement.'); }
    $content = safe_text($data['content'] ?? ''); if ($content === '') throw new RuntimeException('Indique le texte de la ligne.');
    $values = [$entryId, $mediaId, safe_text($data['page_number'] ?? ''), max(0, safe_int($data['line_number'] ?? 0)), $content, normalize_archive_digest_zone($data['zone_json'] ?? '')];
    if ($id) {
        $before = $pdo->prepare('SELECT * FROM archive_digest_transcription_lines WHERE id=?'); $before->execute([$id]); $old = $before->fetch(); if (!$old || (int)$old['archive_digest_id'] !== $entryId) throw new RuntimeException('Ligne introuvable.');
        $pdo->prepare('UPDATE archive_digest_transcription_lines SET archive_digest_id=?,media_id=?,page_number=?,line_number=?,content=?,zone_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$values, $id]);
    } else { $pdo->prepare('INSERT INTO archive_digest_transcription_lines(archive_digest_id,media_id,page_number,line_number,content,zone_json) VALUES(?,?,?,?,?,?)')->execute($values); $id = (int)$pdo->lastInsertId(); }
    return ['id' => $id];
}

function delete_archive_digest_transcription_line(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0); $stmt=$pdo->prepare('SELECT * FROM archive_digest_transcription_lines WHERE id=?');$stmt->execute([$id]);$row=$stmt->fetch();if(!$row)throw new RuntimeException('Ligne introuvable.');$pdo->prepare('DELETE FROM archive_digest_transcription_lines WHERE id=?')->execute([$id]);return ['id'=>$id];
}

function save_archive_digest_transcription_version(PDO $pdo, array $data): array
{
    $entryId = safe_int($data['archive_digest_id'] ?? 0); if (!$entryId || !archive_digest_row($pdo, $entryId)) throw new RuntimeException('Dépouillement introuvable.');
    $lines = $pdo->prepare('SELECT media_id,page_number,line_number,content,zone_json FROM archive_digest_transcription_lines WHERE archive_digest_id=? ORDER BY page_number COLLATE NOCASE,line_number,id');$lines->execute([$entryId]);$snapshot=$lines->fetchAll();
    if (!$snapshot) throw new RuntimeException('Ajoute au moins une ligne avant de créer une version.');
    $title = safe_text($data['title'] ?? '') ?: 'Version du '.date('d/m/Y H:i');
    $pdo->prepare('INSERT INTO archive_digest_transcription_versions(archive_digest_id,title,lines_json) VALUES(?,?,?)')->execute([$entryId,$title,json_encode($snapshot,JSON_UNESCAPED_UNICODE)]);
    return ['id'=>(int)$pdo->lastInsertId()];
}

function archive_digest_row(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM archive_digest_entries WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function save_archive_digest(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $types = archive_digest_record_types();
    $statuses = archive_digest_statuses();
    $placeId = safe_int($data['place_id'] ?? 0) ?: null;
    $recordType = safe_text($data['record_type'] ?? 'autre');
    if (!isset($types[$recordType])) $recordType = 'autre';
    $status = safe_text($data['status'] ?? 'todo');
    if (!isset($statuses[$status])) $status = 'todo';
    $pagesInput = json_decode((string)($data['pages_json'] ?? '[]'), true);
    $pages = [];
    if (is_array($pagesInput)) {
        foreach ($pagesInput as $page) {
            if (!is_array($page)) continue;
            $number = safe_text($page['number'] ?? '');
            $pageStatus = safe_text($page['status'] ?? 'checked');
            $note = safe_text($page['note'] ?? '');
            if ($number === '' && $note === '') continue;
            if (!in_array($pageStatus, ['checked', 'empty', 'review', 'todo', 'found', 'incomplete'], true)) $pageStatus = 'checked';
            $contentType = safe_text($page['content_type'] ?? 'acts');
            if (!in_array($contentType, ['acts', 'empty', 'cover', 'review', 'other'], true)) $contentType = 'acts';
            $pages[] = ['number' => $number, 'status' => $pageStatus, 'content_type' => $contentType, 'act_from' => safe_text($page['act_from'] ?? ''), 'act_to' => safe_text($page['act_to'] ?? ''), 'note' => $note];
        }
    }
    $row = [
        'place_id' => $placeId,
        'city_name' => safe_text($data['city_name'] ?? ''),
        'city_alias' => safe_text($data['city_alias'] ?? ''),
        'department' => safe_text($data['department'] ?? ''),
        'region' => safe_text($data['region'] ?? ''),
        'archive_service' => safe_text($data['archive_service'] ?? ''),
        'archive_reference' => safe_text($data['archive_reference'] ?? ''),
        'archive_url' => safe_text($data['archive_url'] ?? ''),
        'year_text' => safe_text($data['year_text'] ?? ''),
        'record_type' => $recordType,
        'template_key' => safe_text($data['template_key'] ?? ''),
        'status' => $status,
        'searched' => safe_text($data['searched'] ?? ''),
        'found' => safe_text($data['found'] ?? ''),
        'notes' => safe_text($data['notes'] ?? ''),
        'address' => safe_text($data['address'] ?? ''),
        'household_number' => safe_text($data['household_number'] ?? ''),
        'is_exhaustive' => safe_int($data['is_exhaustive'] ?? 0) ? 1 : 0,
        'exhaustive_note' => safe_text($data['exhaustive_note'] ?? ''),
        'act_number' => safe_text($data['act_number'] ?? ''),
        'page_number' => safe_text($data['page_number'] ?? ''),
        'page_total' => safe_int($data['page_total'] ?? 0) ?: null,
        'pages_checked' => safe_text($data['pages_checked'] ?? ''),
        'pages_without_info' => safe_text($data['pages_without_info'] ?? ''),
        'pages_json' => json_encode($pages, JSON_UNESCAPED_UNICODE),
    ];
    if ($row['archive_url'] !== '' && !filter_var($row['archive_url'], FILTER_VALIDATE_URL)) throw new RuntimeException('Lien direct vers l’archive invalide.');
    if (($row['city_name'] === '') && $placeId) {
        $place = $pdo->prepare('SELECT name FROM places WHERE id = ?');
        $place->execute([$placeId]);
        $row['city_name'] = (string)($place->fetchColumn() ?: '');
    }
    $before = $id ? archive_digest_row($pdo, $id) : null;
    if ($id && $before) {
        $stmt = $pdo->prepare("UPDATE archive_digest_entries SET place_id=:place_id, city_name=:city_name, city_alias=:city_alias, department=:department, region=:region, archive_service=:archive_service, archive_reference=:archive_reference, archive_url=:archive_url, year_text=:year_text,record_type=:record_type,template_key=:template_key,status=:status,searched=:searched,found=:found,notes=:notes,address=:address,household_number=:household_number,is_exhaustive=:is_exhaustive,exhaustive_note=:exhaustive_note,act_number=:act_number,page_number=:page_number,page_total=:page_total,pages_checked=:pages_checked,pages_without_info=:pages_without_info,pages_json=:pages_json,updated_at=CURRENT_TIMESTAMP WHERE id=:id");
        $stmt->execute($row + ['id' => $id]);
        log_change($pdo, 'archive_digest', $id, 'update', 'Dépouillement d’archive modifié', $before, $row);
    } else {
        $stmt = $pdo->prepare("INSERT INTO archive_digest_entries(place_id,city_name,city_alias,department,region,archive_service,archive_reference,archive_url,year_text,record_type,template_key,status,searched,found,notes,address,household_number,is_exhaustive,exhaustive_note,act_number,page_number,page_total,pages_checked,pages_without_info,pages_json) VALUES (:place_id,:city_name,:city_alias,:department,:region,:archive_service,:archive_reference,:archive_url,:year_text,:record_type,:template_key,:status,:searched,:found,:notes,:address,:household_number,:is_exhaustive,:exhaustive_note,:act_number,:page_number,:page_total,:pages_checked,:pages_without_info,:pages_json)");
        $stmt->execute($row);
        $id = (int)$pdo->lastInsertId();
        log_change($pdo, 'archive_digest', $id, 'create', 'Dépouillement d’archive ajouté', null, $row);
    }
    return ['id' => $id];
}

function delete_archive_digest(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if (!$id) throw new RuntimeException('Dépouillement manquant');
    $before = archive_digest_row($pdo, $id);
    if (!$before) throw new RuntimeException('Dépouillement introuvable');
    // Les anciennes bases n'ont pas toutes la clé étrangère : détache explicitement les annotations de battue.
    $pdo->prepare('UPDATE battue_search_items SET archive_digest_id = NULL WHERE archive_digest_id = ?')->execute([$id]);
    $pdo->prepare('UPDATE investigation_items SET archive_digest_id = NULL WHERE archive_digest_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM battue_item_archive_digests WHERE archive_digest_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM investigation_item_archive_digests WHERE archive_digest_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM archive_digest_entries WHERE id = ?')->execute([$id]);
    log_change($pdo, 'archive_digest', $id, 'delete', 'Dépouillement d’archive supprimé', $before, null);
    return ['id' => $id];
}

function unlink_archive_digest_media(PDO $pdo, array $data): array
{
    $entryId = safe_int($data['archive_digest_id'] ?? 0);
    $mediaId = safe_int($data['media_id'] ?? 0);
    if (!$entryId || !$mediaId) throw new RuntimeException('Média ou dépouillement manquant');
    $stmt = $pdo->prepare('DELETE FROM archive_digest_media WHERE archive_digest_id=? AND media_id=?');
    $stmt->execute([$entryId, $mediaId]);
    return ['removed' => $stmt->rowCount()];
}

function link_archive_digest_media(PDO $pdo, array $data): array
{
    $entryId = safe_int($data['archive_digest_id'] ?? 0);
    $mediaId = safe_int($data['media_id'] ?? 0);
    $pageNumber = safe_text($data['page_number'] ?? '');
    if (!$entryId || !$mediaId) throw new RuntimeException('Média ou dépouillement manquant');
    if (!archive_digest_row($pdo, $entryId)) throw new RuntimeException('Dépouillement introuvable.');
    $media = $pdo->prepare('SELECT id FROM media WHERE id=?');
    $media->execute([$mediaId]);
    if (!$media->fetchColumn()) throw new RuntimeException('Média introuvable.');
    $existing = $pdo->prepare('SELECT id,page_number FROM archive_digest_media WHERE archive_digest_id=? AND media_id=?');
    $existing->execute([$entryId, $mediaId]);
    $link = $existing->fetch();
    if ($link) {
        $pdo->prepare('UPDATE archive_digest_media SET page_number=? WHERE id=?')->execute([$pageNumber, $link['id']]);
    } else {
        $pdo->prepare('INSERT INTO archive_digest_media(archive_digest_id,media_id,page_number) VALUES(?,?,?)')->execute([$entryId, $mediaId, $pageNumber]);
    }
    log_change($pdo, 'archive_digest', $entryId, 'link-media', 'Média lié au dépouillement' . ($pageNumber !== '' ? ' : page ' . $pageNumber : ''), null, null);
    return ['media_id' => $mediaId, 'page_number' => $pageNumber];
}

function archive_digest_person_row(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM archive_digest_people WHERE id=?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

function sync_archive_digest_person_census(PDO $pdo, array $entry, array $person): ?int
{
    $personId = safe_int($person['person_id'] ?? 0);
    if (!$personId || ($entry['record_type'] ?? '') !== 'recensement') return null;
    if (!preg_match('/(?<!\d)(1[7-9]\d{2}|20\d{2})(?!\d)/', (string)($entry['year_text'] ?? ''), $match)) return null;
    $year = (int)$match[1];
    $placeId = safe_int($entry['place_id'] ?? 0) ?: null;
    $existing = $pdo->prepare('SELECT cr.id FROM census_records cr JOIN census_members cm ON cm.census_id=cr.id WHERE cm.person_id=? AND cm.is_primary=1 AND cr.year=? AND COALESCE(cr.place_id,0)=COALESCE(?,0) LIMIT 1');
    $existing->execute([$personId, $year, $placeId]);
    $censusId = (int)$existing->fetchColumn();
    if (!$censusId) {
        $pdo->prepare("INSERT INTO census_records(year,date_text,is_special,status,address,place_id,notes) VALUES(?,?,0,'found',?,?,?)")
            ->execute([$year, safe_text($entry['year_text'] ?? ''), safe_text($entry['address'] ?? ''), $placeId, 'Créé depuis le suivi de dépouillement.']);
        $censusId = (int)$pdo->lastInsertId();
        $memberId = 0;
    } else {
        $member = $pdo->prepare('SELECT id FROM census_members WHERE census_id=? AND person_id=? LIMIT 1');
        $member->execute([$censusId, $personId]);
        $memberId = (int)$member->fetchColumn();
    }
    $memberValues = [
        safe_text($person['first_name'] ?? ''), safe_text($person['last_name'] ?? ''), safe_text($person['age_text'] ?? ''),
        safe_text($person['birth_place'] ?? ''), safe_text($person['occupation'] ?? ''), safe_text($person['employer'] ?? ''),
        safe_text($person['nationality'] ?? ''), safe_text($person['household_position'] ?? ''), safe_text($person['personal_status'] ?? ''), safe_text($person['extra_info'] ?? ''),
    ];
    if ($memberId) {
        $pdo->prepare('UPDATE census_members SET first_name=?,display_name=?,age_text=?,birth_place=?,occupation=?,employer=?,nationality=?,household_position=?,personal_status=?,extra_info=?,is_primary=1,updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([...$memberValues, $memberId]);
    } else {
        $pdo->prepare('INSERT INTO census_members(census_id,person_id,first_name,display_name,age_text,birth_place,occupation,employer,nationality,household_position,personal_status,extra_info,is_primary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)')
            ->execute([$censusId, $personId, ...$memberValues]);
    }
    return $censusId;
}

function save_archive_digest_person(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $entryId = safe_int($data['archive_digest_id'] ?? 0);
    $entry = archive_digest_row($pdo, $entryId);
    if (!$entry) throw new RuntimeException('Dépouillement introuvable');
    $mode = safe_text($data['person_mode'] ?? 'manual');
    if (!in_array($mode, ['existing', 'create', 'manual'], true)) $mode = 'manual';
    $personId = safe_int($data['person_id'] ?? 0) ?: null;
    $firstName = safe_text($data['first_name'] ?? '');
    $lastName = safe_text($data['last_name'] ?? '');
    if ($mode === 'existing') {
        if (!$personId || !person_exists($pdo, $personId)) throw new RuntimeException('Choisis une personne existante');
        $person = summary_person($pdo, $personId);
        if ($firstName === '') $firstName = safe_text($person['first_name'] ?? '');
        if ($lastName === '') $lastName = safe_text($person['last_name'] ?? '');
    } elseif ($mode === 'create') {
        if ($firstName === '' && $lastName === '') throw new RuntimeException('Indique un prénom ou un nom pour créer la personne');
        $created = save_person($pdo, [
            'first_name' => $firstName,
            'last_name' => $lastName,
            'occupation' => safe_text($data['occupation'] ?? ''),
            'nationality' => safe_text($data['nationality'] ?? ''),
            'verify_status' => 'verify',
        ]);
        $personId = (int)$created['id'];
    } else {
        $personId = null;
    }
    if ($firstName === '' && $lastName === '') throw new RuntimeException('Indique au moins un prénom ou un nom relevé');
    $values = [
        'archive_digest_id' => $entryId,
        'person_id' => $personId,
        'first_name' => $firstName,
        'last_name' => $lastName,
        'age_text' => safe_text($data['age_text'] ?? ''),
        'birth_place' => safe_text($data['birth_place'] ?? ''),
        'occupation' => safe_text($data['occupation'] ?? ''),
        'employer' => safe_text($data['employer'] ?? ''),
        'nationality' => safe_text($data['nationality'] ?? ''),
        'household_position' => safe_text($data['household_position'] ?? ''),
        'personal_status' => safe_text($data['personal_status'] ?? ''),
        'extra_info' => safe_text($data['extra_info'] ?? ''),
        'notes' => safe_text($data['notes'] ?? ''),
        'page_number' => safe_text($data['page_number'] ?? ''),
        'household_key' => safe_text($data['household_key'] ?? ''),
        'address' => safe_text($data['address'] ?? ''),
    ];
    $before = $id ? archive_digest_person_row($pdo, $id) : null;
    if ($id && $before) {
        if ((int)$before['archive_digest_id'] !== $entryId) throw new RuntimeException('Personne relevée introuvable');
        // archive_digest_id reste volontairement immuable lors de l'édition.
        // Ne pas passer ce paramètre supplémentaire à SQLite : il n'existe pas
        // dans la requête UPDATE et déclenche « column index out of range ».
        $updateValues = $values;
        unset($updateValues['archive_digest_id']);
        $pdo->prepare('UPDATE archive_digest_people SET person_id=:person_id,first_name=:first_name,last_name=:last_name,age_text=:age_text,birth_place=:birth_place,occupation=:occupation,employer=:employer,nationality=:nationality,household_position=:household_position,personal_status=:personal_status,extra_info=:extra_info,notes=:notes,page_number=:page_number,household_key=:household_key,address=:address,updated_at=CURRENT_TIMESTAMP WHERE id=:id')->execute($updateValues + ['id' => $id]);
        log_change($pdo, 'archive_digest', $entryId, 'update-member', 'Personne relevée modifiée dans un dépouillement', $before, $values);
    } else {
        $pdo->prepare('INSERT INTO archive_digest_people(archive_digest_id,person_id,first_name,last_name,age_text,birth_place,occupation,employer,nationality,household_position,personal_status,extra_info,notes,page_number,household_key,address) VALUES(:archive_digest_id,:person_id,:first_name,:last_name,:age_text,:birth_place,:occupation,:employer,:nationality,:household_position,:personal_status,:extra_info,:notes,:page_number,:household_key,:address)')->execute($values);
        $id = (int)$pdo->lastInsertId();
        log_change($pdo, 'archive_digest', $entryId, 'add-member', 'Personne relevée ajoutée dans un dépouillement', null, $values);
    }
    // Foyer de la personne (identité propre, indépendante du numéro) : donné par l'écran des pages, sinon déduit du numéro ou de l'adresse
    $uid = array_key_exists('household_uid', $data) ? mb_substr(safe_text((string) $data['household_uid']), 0, 80) : '';
    if ($uid === '') { $u = $pdo->prepare('SELECT household_uid FROM archive_digest_people WHERE id=?'); $u->execute([$id]); $uid = (string) $u->fetchColumn(); }
    if ($uid === '' || !array_key_exists('household_uid', $data) && str_starts_with($uid, 'k:') && $uid !== 'k:' . trim($values['household_key'])) {
        $uid = trim($values['household_key']) !== '' ? 'k:' . trim($values['household_key']) : 'a:' . mb_strtolower(trim($values['address']));
    }
    try { $pdo->prepare('UPDATE archive_digest_people SET household_uid=? WHERE id=?')->execute([$uid, $id]); } catch (Throwable $_) {}
    $censusId = sync_archive_digest_person_census($pdo, $entry, $values);
    return ['id' => $id, 'person_id' => $personId, 'census_id' => $censusId, 'created_person' => $mode === 'create'];
}

function delete_archive_digest_person(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $before = archive_digest_person_row($pdo, $id);
    if (!$before) throw new RuntimeException('Personne relevée introuvable');
    $pdo->prepare('DELETE FROM archive_digest_people WHERE id=?')->execute([$id]);
    log_change($pdo, 'archive_digest', (int)$before['archive_digest_id'], 'delete-member', 'Personne relevée retirée du dépouillement', $before, null);
    return ['id' => $id];
}

/**
 * Ouvre la transaction d'une écriture en prenant TOUT DE SUITE le verrou d'écriture de la base (comme BEGIN IMMEDIATE) :
 * deux enregistrements envoyés en même temps (double-clic, deux onglets) s'attendent alors (busy_timeout) au lieu
 * d'échouer en « base occupée ». On garde beginTransaction() de PDO (les fonctions appelées regardent inTransaction()
 * pour ouvrir ou non leur propre transaction) et on prend le verrou par une écriture qui ne change rien.
 */
function begin_write_transaction(PDO $pdo): void
{
    $pdo->beginTransaction();
    try { $pdo->exec('DELETE FROM persons WHERE 0'); }
    catch (Throwable $e) {
        if (stripos($e->getMessage(), 'no such table') === false) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    }
}

function handle_write(PDO $pdo, string $action, array $data): never
{
    try { begin_write_transaction($pdo); }
    catch (Throwable $e) { json_response(['error'=>readable_error_message($e)],422); }
    try {
        assert_write_target_unlocked($pdo,$action,$data); // fiche verrouillée : rien de ce qui la touche ne change
        assert_person_name_lengths(array_intersect_key($data,['first_name'=>1,'middle_name'=>1,'last_name'=>1])); // tous les noms et prénoms (fiche, variante, recensement, relevé…) : 200 caractères au plus
        assert_text_sizes($action,$data); // événements et notes : des tailles raisonnables (un collage de plusieurs Mo est refusé)
        $result = match ($action) {
            'save_person' => save_person($pdo,$data),
            'set_person_lock' => set_person_lock($pdo,$data),
            'set_person_bookmark' => set_person_bookmark($pdo,$data),
            'set_start_person' => set_start_person($pdo,$data),
            'undo_change' => undo_change($pdo,$data),
            'bulk_lock_people' => bulk_lock_people($pdo,$data),
            'delete_person' => delete_person($pdo,$data),
            'add_variant' => add_variant($pdo,$data),
            'update_variant' => update_variant($pdo,$data),
            'delete_variant' => delete_variant($pdo,$data),
            'set_primary_variant' => set_primary_variant($pdo,$data),
            'add_event_type' => add_event_type($pdo,$data),
            'add_event' => add_event($pdo,$data),
            'save_event' => save_event($pdo,$data),
            'delete_event' => delete_event($pdo,$data),
            'picker_place_adopt' => picker_place_adopt($pdo,$data),
            'restore_change' => restore_change($pdo,$data),
            'restore_last_delete' => restore_last_delete($pdo,$data),
            'add_note' => add_note($pdo,$data),
            'save_note' => save_note($pdo,$data),
            'delete_note' => delete_note($pdo,$data),
            'save_online_sheet' => save_online_sheet($pdo,$data),
            'delete_online_sheet' => delete_online_sheet($pdo,$data),
            'add_web_source' => add_web_source($pdo,$data),
            'save_source' => save_source($pdo,$data),
            'delete_source' => delete_source($pdo,$data),
            'save_media' => save_media($pdo,$data),
            'save_media_transcription' => save_media_transcription($pdo,$data),
            'htr_recognize' => htr_recognize_media($pdo,$data),
            'delete_media' => delete_media($pdo,$data),
            'set_portrait' => set_portrait($pdo,$data),
            'reorder_person_media' => reorder_person_media($pdo,$data),
            'reorder_entity_media' => reorder_entity_media($pdo,$data),
            'group_entity_media' => group_entity_media($pdo,$data),
            'ungroup_entity_media' => ungroup_entity_media($pdo,$data),
            'add_relation' => add_relation($pdo,$data),
            'remove_relation' => remove_relation($pdo,$data),
            'set_relation_status' => set_relation_status($pdo,$data),
            'save_hypothesis' => save_hypothesis($pdo,$data),
            'delete_hypothesis' => delete_hypothesis($pdo,$data),
            'save_evidence' => save_evidence($pdo,$data),
            'delete_evidence' => delete_evidence($pdo,$data),
            'save_census_record' => save_census_record($pdo,$data),
            'test_backup_restore' => test_backup_restore($pdo,$data),
            'save_database_comparison_report' => save_database_comparison_report($pdo,$data),
            'repair_media_path' => repair_media_path($pdo,$data),
            'add_census_member' => add_census_member($pdo,$data),
            'update_census_member' => update_census_member($pdo,$data),
            'delete_census_record' => delete_census_record($pdo,$data),
            'delete_census_member' => delete_census_member($pdo,$data),
            'link_census_media' => link_census_media($pdo,$data),
            'link_entity_media' => link_entity_media($pdo,$data),
            'save_research_note' => save_research_note($pdo,$data),
            'delete_research_note' => delete_research_note($pdo,$data),
            'merge_people' => merge_people($pdo,$data),
            'merge_duplicate_places' => merge_duplicate_places($pdo,$data),
            'convert_deed_to_death' => convert_deed_to_death($pdo,$data),
            'save_investigation' => save_investigation($pdo,$data),
            'delete_investigation' => delete_investigation($pdo,$data),
            'add_investigation_item' => add_investigation_item($pdo,$data),
            'save_investigation_item' => save_investigation_item($pdo,$data),
            'set_investigation_item_reminder_done' => set_investigation_item_reminder_done($pdo,$data),
            'update_investigation_item_reminder' => update_investigation_item_reminder($pdo,$data),
            'clear_investigation_item_reminder' => clear_investigation_item_reminder($pdo,$data),
            'save_standalone_reminder' => save_standalone_reminder($pdo,$data),
            'delete_standalone_reminder' => delete_standalone_reminder($pdo,$data),
            'save_research_budget_item' => save_research_budget_item($pdo,$data),
            'delete_research_budget_item' => delete_research_budget_item($pdo,$data),
            'save_courrier' => save_courrier($pdo,$data),
            'delete_courrier' => delete_courrier($pdo,$data),
            'set_courrier_fait' => set_courrier_fait($pdo,$data),
            'save_living_contact' => save_living_contact($pdo,$data),
            'delete_living_contact' => delete_living_contact($pdo,$data),
            'set_reminder_done' => set_reminder_done($pdo,$data),
            'delete_investigation_item' => delete_investigation_item($pdo,$data),
            'link_investigation_media' => link_investigation_media($pdo,$data),
            'set_investigation_media_items' => set_investigation_media_items($pdo,$data),
            'unlink_investigation_media' => unlink_investigation_media($pdo,$data),
            'unlink_media_from_investigation_item' => unlink_media_from_investigation_item($pdo,$data),
            'link_event_to_investigation_item' => link_event_to_investigation_item($pdo,$data),
            'unlink_event_from_investigation_item' => unlink_event_from_investigation_item($pdo,$data),
            'save_investigation_media_folder' => save_investigation_media_folder($pdo,$data),
            'delete_investigation_media_folder' => delete_investigation_media_folder($pdo,$data),
            'move_investigation_media' => move_investigation_media($pdo,$data),
            'save_battue' => save_battue($pdo,$data),
            'delete_battue' => delete_battue($pdo,$data),
            'save_battue_alias' => save_battue_alias($pdo,$data),
            'delete_battue_alias' => delete_battue_alias($pdo,$data),
            'save_battue_search_item' => save_battue_search_item($pdo,$data),
            'delete_battue_search_item' => delete_battue_search_item($pdo,$data),
            'save_battue_commune_status' => save_battue_commune_status($pdo,$data),
            'dismiss_issue' => dismiss_issue($pdo,$data),
            'bulk_group' => bulk_group($pdo,$data),
            'save_branch' => save_branch($pdo,$data),
            'delete_branch' => delete_branch($pdo,$data),
            'save_view' => save_view($pdo,$data),
            'update_view' => update_view($pdo,$data),
            'reorder_view' => reorder_view($pdo,$data),
            'delete_view' => delete_view($pdo,$data),
            'set_view_order' => set_view_order($pdo,$data),
            'save_label' => save_label($pdo,$data),
            'delete_label' => delete_label($pdo,$data),
            'set_label_links' => set_label_links($pdo,$data),
            'save_event_type' => save_event_type($pdo,$data),
            'delete_event_type' => delete_event_type($pdo,$data),
            'save_event_witnesses' => save_event_witnesses($pdo,$data),
            'save_event_precise' => save_event_precise($pdo,$data),
            'save_military' => save_military($pdo,$data),
            'save_grave' => save_grave($pdo,$data),
            'add_grave_person' => add_grave_person($pdo,$data),
            'remove_grave_person' => remove_grave_person($pdo,$data),
            'delete_grave' => delete_grave($pdo,$data),
            'save_personal_dictionary_entry' => save_personal_dictionary_entry($pdo,$data),
            'save_closed_branch' => save_closed_branch($pdo,$data),
            'delete_closed_branch' => delete_closed_branch($pdo,$data),
            'save_genealogy_fair' => save_genealogy_fair($pdo,$data),
            'delete_genealogy_fair' => delete_genealogy_fair($pdo,$data),
            'save_family_object' => save_family_object($pdo,$data),
            'delete_family_object' => delete_family_object($pdo,$data),
            'save_family_memory' => save_family_memory($pdo,$data),
            'delete_family_memory' => delete_family_memory($pdo,$data),
            'remove_collection_media' => remove_collection_media($pdo,$data),
            'link_collection_media' => link_collection_media($pdo,$data),
            'save_voyage' => save_voyage($pdo,$data),
            'delete_voyage' => delete_voyage($pdo,$data),
            'save_placement' => save_placement($pdo,$data),
            'delete_placement' => delete_placement($pdo,$data),
            'save_coat_of_arms' => save_coat_of_arms($pdo,$data),
            'delete_coat_of_arms' => delete_coat_of_arms($pdo,$data),
            'save_poilu' => save_poilu($pdo,$data),
            'save_field_trip' => save_field_trip($pdo,$data),
            'set_field_trip_status' => set_field_trip_status($pdo,$data),
            'delete_field_trip' => delete_field_trip($pdo,$data),
            'generate_field_trip' => generate_field_trip_stops($pdo,safe_int($data['id']??0)),
            'save_field_trip_stop' => save_field_trip_stop($pdo,$data),
            'set_field_trip_stop_done' => set_field_trip_stop_done($pdo,$data),
            'set_field_trip_stop_check' => set_field_trip_stop_check($pdo,$data),
            'move_field_trip_stop' => move_field_trip_stop($pdo,$data),
            'delete_field_trip_stop' => delete_field_trip_stop($pdo,$data),
            'save_family_paper' => save_family_paper($pdo,$data),
            'delete_family_paper' => delete_family_paper($pdo,$data),
            'save_old_map' => save_old_map($pdo,$data),
            'delete_old_map' => delete_old_map($pdo,$data),
            'save_saved_search' => save_saved_search($pdo,$data),
            'mark_saved_search_seen' => mark_saved_search_seen($pdo,$data),
            'delete_saved_search' => delete_saved_search($pdo,$data),
            'save_probate_inventory' => save_probate_inventory($pdo,$data),
            'delete_probate_inventory' => delete_probate_inventory($pdo,$data),
            'save_offsite_settings' => save_offsite_settings($pdo,$data),
            'save_scan_inbox_settings' => save_scan_inbox_settings($pdo,$data),
            'save_parish' => save_parish($pdo,$data),
            'delete_parish' => delete_parish($pdo,$data),
            'save_cited_name' => save_cited_name($pdo,$data),
            'delete_cited_name' => delete_cited_name($pdo,$data),
            'sync_start' => sync_start($pdo,$data),
            'sync_set_author' => sync_set_author($pdo,$data),
            'kiosk_enter' => kiosk_enter($data),
            'save_person_language' => save_person_language($pdo,$data),
            'delete_person_language' => delete_person_language($pdo,$data),
            'set_no_inherited_language' => set_no_inherited_language($pdo,$data),
            'save_record_languages' => save_record_languages($pdo,$data),
            'save_help_request' => save_help_request($pdo,$data),
            'save_village_profile' => save_village_profile($pdo,$data),
            'save_employer_record' => save_employer_record($pdo,$data),
            'save_booklet' => save_booklet($pdo,$data),
            'save_pet' => save_pet($pdo,$data),
            'delete_pet' => delete_pet($pdo,$data),
            'pet_make_person' => pet_make_person($pdo,$data),
            'pet_for_person' => (function() use ($pdo,$data){$pid=safe_int($data['person_id']??0);if(!person_exists($pdo,$pid))throw new RuntimeException('Fiche introuvable.');$pdo->prepare("UPDATE persons SET kind='animal' WHERE id=?")->execute([$pid]);$petId=pet_of_person($pdo,$pid,true);pet_move_to_person($pdo,$petId);return ['id'=>$petId];})(),
            'save_booklet_design' => save_booklet_design($pdo,$data),
            'save_board' => save_board($pdo,$data),
            'save_topic_sheet' => save_topic_sheet($pdo,$data),
            'save_periodical' => save_periodical($pdo,$data),
            'save_diagram' => save_diagram($pdo,$data),
            'save_vector_doc' => save_vector_doc($pdo,$data),
            'save_dna_kit' => save_dna_kit($pdo,$data),
            'delete_dna_kit' => delete_dna_kit($pdo,$data),
            'save_dna_match' => save_dna_match($pdo,$data),
            'import_dna_matches' => import_dna_matches($pdo,$data),
            'bulk_dna_matches' => bulk_dna_matches($pdo,$data),
            'delete_dna_match' => delete_dna_match($pdo,$data),
            'save_dna_segments' => save_dna_segments($pdo,$data),
            'delete_dna_segments' => delete_dna_segments($pdo,$data),
            'save_dna_group' => save_dna_group($pdo,$data),
            'delete_dna_group' => delete_dna_group($pdo,$data),
            'rename_vector_doc' => rename_vector_doc($pdo,$data),
            'save_act_transcription' => save_act_transcription($pdo,$data),
            'save_slideshow' => save_slideshow($pdo,$data),
            'save_house' => save_house($pdo,$data),
            'delete_house' => delete_house($pdo,$data),
            'rename_house' => rename_house($pdo,$data),
            'house_link' => house_link_set($pdo,$data),
            'delete_house_model' => delete_house_model($pdo,$data),
            'delete_slideshow' => delete_slideshow($pdo,$data),
            'rename_slideshow' => rename_slideshow($pdo,$data),
            'delete_act_transcription' => delete_act_transcription($pdo,$data),
            'rename_act_transcription' => rename_act_transcription($pdo,$data),
            'act_match_people' => act_transcription_match_people($pdo, is_array($data['names'] ?? null) ? $data['names'] : []),
            'delete_vector_doc' => delete_vector_doc($pdo,$data),
            'delete_diagram' => delete_diagram($pdo,$data),
            'link_diagram' => link_diagram($pdo,$data),
            'reorder_diagrams' => reorder_diagrams($pdo,$data),
            'periodicals_to_atelier' => periodicals_to_atelier($pdo,$data),
            'save_periodical_issue' => save_periodical_issue($pdo,$data),
            'save_periodical_article' => save_periodical_article($pdo,$data),
            'delete_periodical_item' => delete_periodical_item($pdo,$data),
            'reorder_periodical_articles' => reorder_periodical_articles($pdo,$data),
            'save_periodical_types' => save_periodical_types($pdo,$data),
            'save_press_ad' => save_press_ad($pdo,$data),
            'save_press_ad_rules' => save_press_ad_rules($pdo,$data),
            'delete_press_item' => delete_press_item($pdo,$data),
            'save_layout_doc' => save_layout_doc($pdo,$data),
            'delete_layout_doc' => delete_layout_doc($pdo,$data),
            'save_montage_project' => save_montage_project($pdo,$data),
            'delete_montage_project' => delete_montage_project($pdo,$data),
            'save_retouch_project' => save_retouch_project($pdo,$data),
            'rename_retouch_project' => rename_retouch_project($pdo,$data),
            'delete_retouch_project' => delete_retouch_project($pdo,$data),
            'rename_audio_project' => rename_audio_project($pdo,$data),
            'delete_audio_project' => delete_audio_project($pdo,$data),
            'delete_topic_sheet' => delete_topic_sheet($pdo,$data),
            'save_board_snapshot' => save_board_snapshot($pdo,$data),
            'restore_board_snapshot' => restore_board_snapshot($pdo,$data),
            'delete_board_snapshot' => delete_board_snapshot($pdo,$data),
            'copy_board' => copy_board($pdo,$data),
            'delete_board' => delete_board($pdo,$data),
            'delete_booklet' => delete_booklet($pdo,$data),
            'apply_booklet' => apply_booklet($pdo,$data),
            'delete_employer_record' => delete_employer_record($pdo,$data),
            'save_village_populations' => save_village_populations($pdo,$data),
            'save_village_memo' => save_village_memo($pdo,$data),
            'save_my_list' => save_my_list($pdo,$data),
            'delete_my_list' => delete_my_list($pdo,$data),
            'save_my_list_row' => save_my_list_row($pdo,$data),
            'import_my_list' => import_my_list($pdo,$data),
            'save_my_list_filters' => save_my_list_filters($pdo,$data),
            'save_my_list_display' => save_my_list_display($pdo,$data),
            'save_my_list_record' => save_my_list_record($pdo,$data),
            'save_atelier_project' => save_atelier_project($pdo,$data),
            'save_media_durations' => save_media_durations($pdo,$data),
            'save_recueil' => save_recueil($pdo,$data),
            'delete_recueil' => delete_recueil($pdo,$data),
            'save_recueil_version' => save_recueil_version($pdo,$data),
            'delete_recueil_version' => delete_recueil_version($pdo,$data),
            'recueil_add_images' => recueil_add_images($pdo,$data),
            'save_recueil_page' => save_recueil_page($pdo,$data),
            'delete_recueil_page' => delete_recueil_page($pdo,$data),
            'update_recueil_image' => update_recueil_image($pdo,$data),
            'remove_recueil_image' => remove_recueil_image($pdo,$data),
            'save_recueil_link' => save_recueil_link($pdo,$data),
            'delete_recueil_link' => delete_recueil_link($pdo,$data),
            'move_recueil_link' => move_recueil_link($pdo,$data),
            'save_recueil_trays' => save_recueil_trays($pdo,$data),
            'recueil_link_media' => recueil_link_media($pdo,$data),
            'delete_atelier_project' => delete_atelier_project($pdo,$data),
            'save_atelier_folder' => save_atelier_folder($pdo,$data),
            'delete_atelier_folder' => delete_atelier_folder($pdo,$data),
            'save_atelier_item' => save_atelier_item($pdo,$data),
            'atelier_items_action' => atelier_items_action($pdo,$data),
            'atelier_rename_tag' => atelier_rename_tag($pdo,$data),
            'atelier_import' => atelier_import($pdo,$data),
            'delete_my_list_record' => delete_my_list_record($pdo,$data),
            'set_my_list_record_status' => set_my_list_record_status($pdo,$data),
            'set_my_list_record_step' => set_my_list_record_step($pdo,$data),
            'move_my_list_record' => move_my_list_record($pdo,$data),
            'retouch_show_version' => retouch_show_version($pdo,$data),
            'save_museum' => museum_save($pdo,$data),
            'save_museum_room' => museum_save_room($pdo,$data),
            'delete_museum_room' => museum_delete_room($pdo,$data),
            'museum_reorder' => museum_reorder($pdo,$data),
            'save_museum_item' => museum_save_item($pdo,$data),
            'delete_museum_item' => museum_delete_item($pdo,$data),
            'museum_sign' => museum_sign($pdo,$data),
            'delete_museum_guestbook' => museum_delete_guestbook($pdo,$data),
            'delete_museum' => museum_delete($pdo,$data),
            'create_act_request' => create_act_request($pdo,$data),
            'act_open_reminder' => act_open_reminder($pdo,$data),
            'vault_delete' => vault_delete($pdo,$data),
            'apply_variants' => apply_variants($pdo,$data),
            'undo_harmonize' => undo_harmonize($pdo,$data),
            'fix_place' => fix_place($pdo,$data),
            'save_resistance' => save_resistance($pdo,$data),
            'clear_resistance' => clear_resistance($pdo,$data),
            'save_voter_cards' => save_voter_cards($pdo,$data),
            'clear_voter_cards' => clear_voter_cards($pdo,$data),
            'save_custom_block_def' => save_custom_block_def($pdo,$data),
            'delete_custom_block_def' => delete_custom_block_def($pdo,$data),
            'import_custom_block_def' => import_custom_block_def($pdo,$data),
            'save_custom_block_entry' => save_custom_block_entry($pdo,$data),
            'delete_custom_block_entry' => delete_custom_block_entry($pdo,$data),
            'set_custom_block_flags' => set_custom_block_flags($pdo,$data),
            'delete_help_request' => delete_help_request($pdo,$data),
            'check_links' => check_links($pdo,$data),
            'replace_link' => replace_link($pdo,$data),
            'delete_personal_dictionary_entry' => delete_personal_dictionary_entry($pdo,$data),
            'add_media_link' => add_media_link($pdo,$data),
            'remove_media_link' => remove_media_link($pdo,$data),
            'save_media_tag' => save_media_tag($pdo,$data),
            'save_face_scan' => save_face_scan($pdo,$data),
            'face_identify' => face_identify($pdo,$data),
            'save_artist_item' => save_artist_item($pdo,$data),
            'save_artist_items' => save_artist_items($pdo,$data),
            'delete_artist_item' => delete_artist_item($pdo,$data),
            'reorder_artist_items' => reorder_artist_items($pdo,$data),
            'artist_remote' => artist_remote($data),
            'artist_fetch_image' => artist_fetch_image($pdo,$data),
            'artist_upload_image' => artist_upload_image($pdo,$data),
            'art_write' => art_api_post($pdo,$data),
            'face_ignore' => face_ignore($pdo,$data),
            'faces_reset' => faces_reset($pdo,$data),
            'update_media_tag' => update_media_tag($pdo,$data),
            'delete_media_tag' => delete_media_tag($pdo,$data),
            'save_site_defaults' => save_site_defaults($pdo,$data),
            'delete_insee_import' => delete_insee_import($pdo,$data),
            'delete_all_insee_imports' => delete_all_insee_imports($pdo,$data),
            'save_archive_digest' => save_archive_digest($pdo,$data),
            'delete_archive_digest' => delete_archive_digest($pdo,$data),
            'save_archive_digest_gap' => save_archive_digest_gap($pdo,$data),
            'delete_archive_digest_gap' => delete_archive_digest_gap($pdo,$data),
            'save_archive_digest_request' => save_archive_digest_request($pdo,$data),
            'delete_archive_digest_request' => delete_archive_digest_request($pdo,$data),
            'save_archive_visit_plan' => save_archive_visit_plan($pdo,$data),
            'delete_archive_visit_plan' => delete_archive_visit_plan($pdo,$data),
            'save_archive_visit_item' => save_archive_visit_item($pdo,$data),
            'delete_archive_visit_item' => delete_archive_visit_item($pdo,$data),
            'save_archive_visit_links' => save_archive_visit_links($pdo,$data),
            'save_archive_digest_transcription_line' => save_archive_digest_transcription_line($pdo,$data),
            'delete_archive_digest_transcription_line' => delete_archive_digest_transcription_line($pdo,$data),
            'save_archive_digest_transcription_version' => save_archive_digest_transcription_version($pdo,$data),
            'link_archive_digest_media' => link_archive_digest_media($pdo,$data),
            'unlink_archive_digest_media' => unlink_archive_digest_media($pdo,$data),
            'save_archive_digest_person' => save_archive_digest_person($pdo,$data),
            'save_archive_digest_page' => save_archive_digest_page($pdo,$data),
            'save_archive_digest_counts' => save_archive_digest_counts($pdo,$data),
            'addr_ban_download' => addr_ban_download($pdo,$data),
            'addr_ban_import' => addr_ban_import($pdo,$data),
            'addr_auto_place' => addr_auto_place($pdo,$data),
            'save_addr_point' => save_addr_point($pdo,$data),
            'save_addr_street' => save_addr_street($pdo,$data),
            'save_archive_digest_household' => save_archive_digest_household($pdo,$data),
            'delete_archive_digest_person' => delete_archive_digest_person($pdo,$data),
            'rotate_media_image' => rotate_media_image($pdo,$data),
            default => throw new RuntimeException('Action d’écriture inconnue'),
        };
        apply_pending_labels($pdo, $action, $data, $result);
        // les parents changés sur une fiche d'animal passent dans son pedigree (dans la même écriture, jamais à la lecture)
        if (in_array($action, ['add_relation', 'remove_relation', 'merge_people', 'delete_person', 'restore_person'], true) && function_exists('pets_sync_parents')) { pets_sync_parents($pdo); }
        $pdo->commit();
        json_response(['ok'=>true,'result'=>$result]);
    } catch(Throwable $e){
        if($pdo->inTransaction())$pdo->rollBack();
        if($e instanceof LcndaConflict)json_response(['error'=>$e->getMessage(),'conflict'=>true],409);
        json_response(['error'=>readable_error_message($e)],422);
    }
}

/**
 * Message lisible pour l'utilisateur : une erreur de la base (contrainte, clé étrangère…) est traduite
 * en français simple, sans le texte SQL (le détail part dans le journal du serveur).
 */
function readable_error_message(Throwable $e): string
{
    // erreur interne de PHP (TypeError, ValueError, « json_decode(): Argument #1… ») : un message simple ; le détail va au journal du serveur
    if($e instanceof Error||$e instanceof ErrorException||$e instanceof JsonException){
        error_log('LCNDA erreur interne : '.get_class($e).' : '.$e->getMessage().' @ '.basename($e->getFile()).':'.$e->getLine());
        return 'L’enregistrement n’a pas pu se faire (une donnée reçue n’a pas la forme attendue). Rien n’a été modifié. Réessaie ; si ça recommence, recharge la page et signale-le.';
    }
    if(!($e instanceof PDOException))return $e->getMessage();
    $raw=$e->getMessage();
    error_log('LCNDA erreur base : '.$raw);
    if(stripos($raw,'FOREIGN KEY')!==false)return 'Cet enregistrement est lié à un élément qui n’existe pas (ou plus) : une fiche, un lieu ou un type a peut-être été supprimé. Recharge la page et réessaie.';
    if(stripos($raw,'CHECK constraint')!==false){
        if(preg_match('/gender/i',$raw))return 'Sexe invalide : choisis Homme, Femme, Non binaire ou Inconnu.';
        if(preg_match('/living_status/i',$raw))return 'Statut invalide : choisis Vivant, Décédé ou Inconnu.';
        if(preg_match('/scope/i',$raw))return 'Portée invalide : l’événement doit concerner une personne ou un couple.';
        return 'Une valeur saisie n’est pas acceptée (choix hors de la liste). Vérifie le formulaire et réessaie.';
    }
    if(stripos($raw,'UNIQUE constraint')!==false)return 'Cet élément existe déjà (doublon refusé).';
    if(stripos($raw,'NOT NULL constraint')!==false)return 'Un champ obligatoire est vide. Vérifie le formulaire et réessaie.';
    if(stripos($raw,'database is locked')!==false||stripos($raw,'busy')!==false)return 'La base est occupée par une autre opération. Réessaie dans un instant.';
    if(str_starts_with($raw,'SQLSTATE'))return 'L’enregistrement a échoué (erreur de la base). Réessaie ; si ça recommence, fais une sauvegarde et signale-le.';
    return $raw;
}

function allowed_label_entity_types(): array
{
    return ['person','event','place','media','census','note','source','investigation','view','archive_visit','family_object','family_memory',
        'voyage','placement','coat_of_arms','poilu','probate_inventory','family_paper','field_trip','old_map','parish','cited_name','help_request','resistance','custom_block_entry','village','custom_list','custom_list_record','voter','family_booklet','pet','periodical_periodical','periodical_issue','periodical_article','press_ad','diagram'];
}

function normalize_label_color(string $color): string
{
    $color=trim($color);
    if(preg_match('/^#?([0-9a-fA-F]{6})$/',$color,$match))return '#'.strtolower($match[1]);
    if(preg_match('/^#?([0-9a-fA-F]{3})$/',$color,$match)){
        $chars=str_split(strtolower($match[1]));
        return '#'.$chars[0].$chars[0].$chars[1].$chars[1].$chars[2].$chars[2];
    }
    return '#0066cc';
}

function labels_for_entity(PDO $pdo,string $type,int $id): array
{
    if(!$id||!in_array($type,allowed_label_entity_types(),true))return [];
    $stmt=$pdo->prepare('SELECT l.id,l.name,l.color,l.description FROM labels l JOIN label_links ll ON ll.label_id=l.id WHERE ll.entity_type=? AND ll.entity_id=? ORDER BY l.name COLLATE NOCASE,l.id');
    $stmt->execute([$type,$id]);
    return $stmt->fetchAll();
}

function labels_for_entities(PDO $pdo,string $type,array $ids): array
{
    $ids=array_values(array_unique(array_filter(array_map('intval',$ids))));
    if(!$ids||!in_array($type,allowed_label_entity_types(),true))return [];
    $marks=implode(',',array_fill(0,count($ids),'?'));
    $stmt=$pdo->prepare("SELECT ll.entity_id,l.id,l.name,l.color,l.description FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type=? AND ll.entity_id IN ($marks) ORDER BY l.name COLLATE NOCASE,l.id");
    $stmt->execute(array_merge([$type],$ids));
    $map=[];
    foreach($stmt->fetchAll() as $row){
        $entityId=(int)$row['entity_id'];
        unset($row['entity_id']);
        $map[$entityId][]=$row;
    }
    return $map;
}

function attach_labels_to_rows(PDO $pdo,string $type,array $rows): array
{
    if(!$rows)return [];
    $labels=labels_for_entities($pdo,$type,array_map(static fn($row)=>(int)($row['id']??0),$rows));
    foreach($rows as &$row)$row['labels']=$labels[(int)($row['id']??0)]??[];
    unset($row);
    return $rows;
}

function save_label(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    $name=safe_text($data['name']??'');
    if($name==='')throw new RuntimeException('Nom d’étiquette obligatoire.');
    $color=normalize_label_color((string)($data['color']??'#0066cc'));
    $description=safe_text($data['description']??'');
    if($id){
        $before=$pdo->prepare('SELECT * FROM labels WHERE id=?');
        $before->execute([$id]);
        $old=$before->fetch();
        if(!$old)throw new RuntimeException('Étiquette introuvable.');
        $stmt=$pdo->prepare('UPDATE labels SET name=?,color=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?');
        $stmt->execute([$name,$color,$description,$id]);
        log_change($pdo,'label',$id,'update','Étiquette modifiée',$old,['name'=>$name,'color'=>$color,'description'=>$description]);
    }else{
        $stmt=$pdo->prepare('INSERT INTO labels(name,color,description) VALUES(?,?,?)');
        $stmt->execute([$name,$color,$description]);
        $id=(int)$pdo->lastInsertId();
        log_change($pdo,'label',$id,'create','Étiquette créée',null,['name'=>$name,'color'=>$color,'description'=>$description]);
    }
    $stmt=$pdo->prepare('SELECT * FROM labels WHERE id=?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

function delete_label(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Étiquette introuvable.');
    $stmt=$pdo->prepare('SELECT * FROM labels WHERE id=?');
    $stmt->execute([$id]);
    $old=$stmt->fetch();
    if(!$old)throw new RuntimeException('Étiquette introuvable.');
    // les étiquettes posées partent avec elle (ON DELETE CASCADE) : gardées dans le journal pour « ↶ Annuler »
    $links=$pdo->prepare('SELECT * FROM label_links WHERE label_id=? ORDER BY id');$links->execute([$id]);$linkRows=$links->fetchAll();
    $delete=$pdo->prepare('DELETE FROM labels WHERE id=?');
    $delete->execute([$id]);
    log_change($pdo,'label',$id,'delete','Étiquette supprimée',$old+['_children'=>['label_links'=>$linkRows]],null);
    return ['id'=>$id];
}

function set_label_links(PDO $pdo,array $data): array
{
    $type=safe_text($data['entity_type']??'');
    $entityId=safe_int($data['entity_id']??0);
    if(!in_array($type,allowed_label_entity_types(),true)||!$entityId)throw new RuntimeException('Cible d’étiquette invalide.');
    $raw=$data['label_ids']??[];
    if(!is_array($raw))$raw=[$raw];
    $ids=array_values(array_unique(array_filter(array_map('intval',$raw))));
    // mêmes étiquettes qu'avant : rien à écrire ni à journaliser (sinon ⌘Z ne pouvait plus annuler la vraie modification)
    $cur=$pdo->prepare('SELECT label_id FROM label_links WHERE entity_type=? AND entity_id=?');$cur->execute([$type,$entityId]);
    $have=array_map('intval',$cur->fetchAll(PDO::FETCH_COLUMN));$a=$have;$b=$ids;sort($a);sort($b);
    if($a===$b)return ['entity_type'=>$type,'entity_id'=>$entityId,'labels'=>labels_for_entity($pdo,$type,$entityId),'unchanged'=>true];
    $delete=$pdo->prepare('DELETE FROM label_links WHERE entity_type=? AND entity_id=?');
    $delete->execute([$type,$entityId]);
    $insert=$pdo->prepare('INSERT OR IGNORE INTO label_links(label_id,entity_type,entity_id) VALUES(?,?,?)');
    foreach($ids as $labelId){
        if($labelId)$insert->execute([$labelId,$type,$entityId]);
    }
    log_change($pdo,$type,$entityId,'labels','Étiquettes mises à jour',null,['labels'=>$ids]);
    return ['entity_type'=>$type,'entity_id'=>$entityId,'labels'=>labels_for_entity($pdo,$type,$entityId)];
}

function person_exists(PDO $pdo, int $id): bool
{
    $stmt=$pdo->prepare('SELECT 1 FROM persons WHERE id=?');$stmt->execute([$id]);return (bool)$stmt->fetchColumn();
}

function person_is_locked(PDO $pdo, int $id): bool
{
    if (!$id) return false;
    $stmt=$pdo->prepare('SELECT COALESCE(is_locked,0) FROM persons WHERE id=?');
    $stmt->execute([$id]);
    return (int)$stmt->fetchColumn() === 1;
}

function assert_person_unlocked(PDO $pdo, int $id): void
{
    if (person_is_locked($pdo,$id)) {
        throw new RuntimeException('Fiche verrouillée. Déverrouille-la avant de modifier ou supprimer cette personne.');
    }
}

/**
 * Verrou des fiches, vérifié une fois pour toutes les écritures qui touchent une personne (ou un de ses événements,
 * ou un couple dont elle fait partie) : variantes de nom, portrait, mentions familiales, hypothèses, preuves,
 * étiquettes, sources citées, médias rattachés et leur rangement, témoins et coordonnées d'un événement.
 * Les fonctions qui vérifiaient déjà le verrou le refont sans dommage.
 */
function assert_write_target_unlocked(PDO $pdo, string $action, array $data): void
{
    $one = static function (string $sql, int $id) use ($pdo): array {
        if (!$id) return [];
        $s = $pdo->prepare($sql); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_NUM);
        return $r ?: [];
    };
    $entity = static function (string $type, int $id) use ($pdo): void {
        if (!$id) return;
        if ($type === 'person') assert_person_unlocked($pdo, $id);
        elseif ($type === 'event') assert_event_unlocked($pdo, $id);
        elseif ($type === 'family') assert_family_unlocked($pdo, $id);
    };
    $pid = safe_int($data['person_id'] ?? 0);
    $id = safe_int($data['id'] ?? 0);
    switch ($action) {
        case 'add_variant': case 'set_portrait': case 'set_relation_status': case 'reorder_person_media':
            if ($pid) assert_person_unlocked($pdo, $pid);
            break;
        case 'update_variant': case 'delete_variant': case 'set_primary_variant':
            [$owner] = $one('SELECT person_id FROM name_variants WHERE id=?', $id) + [0];
            if ($owner) assert_person_unlocked($pdo, (int) $owner);
            break;
        case 'save_hypothesis': case 'save_evidence': case 'delete_hypothesis': case 'delete_evidence':
            $table = str_contains($action, 'hypothesis') ? 'hypotheses' : 'evidence_records';
            [$owner] = $one("SELECT person_id FROM {$table} WHERE id=?", $id) + [0];
            if ($owner) assert_person_unlocked($pdo, (int) $owner);
            if ($pid && !str_starts_with($action, 'delete')) assert_person_unlocked($pdo, $pid);
            break;
        case 'set_label_links':
            $entity(safe_text($data['entity_type'] ?? ''), safe_int($data['entity_id'] ?? 0));
            break;
        case 'save_source': case 'delete_source':
            $linkId = safe_int($data['link_id'] ?? 0);
            if ($linkId) { [$t, $e] = $one('SELECT entity_type,entity_id FROM source_links WHERE id=?', $linkId) + ['', 0]; $entity((string) $t, (int) $e); }
            elseif ($action === 'delete_source' && $id) {
                $s = $pdo->prepare('SELECT entity_type,entity_id FROM source_links WHERE source_record_id=?'); $s->execute([$id]);
                foreach ($s->fetchAll(PDO::FETCH_NUM) as [$t, $e]) $entity((string) $t, (int) $e);
            }
            if ($action === 'save_source' && $linkId) {
                if (($data['entity_type'] ?? 'person') === 'event') $entity('event', safe_int($data['event_id'] ?? 0));
                elseif ($pid) assert_person_unlocked($pdo, $pid);
            }
            break;
        case 'reorder_entity_media': case 'group_entity_media': case 'ungroup_entity_media': case 'link_entity_media':
        case 'add_media_link': case 'remove_media_link':
            $type = safe_text($data['entity_type'] ?? 'person');
            $eid = safe_int($data['entity_id'] ?? 0) ?: ($type === 'person' ? $pid : 0);
            $entity($type, $eid);
            if ($pid && $type !== 'person') assert_person_unlocked($pdo, $pid);
            break;
        case 'save_event_witnesses': case 'save_event_precise':
            assert_event_unlocked($pdo, safe_int($data['event_id'] ?? 0));
            break;
    }
}

/** Un événement de famille touche les deux conjoints : aucun des deux ne doit être verrouillé. */
function assert_family_unlocked(PDO $pdo, int $familyId): void
{
    if(!$familyId)return;
    $stmt=$pdo->prepare('SELECT partner1_id,partner2_id FROM families WHERE id=?');$stmt->execute([$familyId]);$f=$stmt->fetch();
    if(!$f)return;
    foreach(['partner1_id','partner2_id'] as $k)if($f[$k]!==null&&person_is_locked($pdo,(int)$f[$k]))throw new RuntimeException('Fiche verrouillée ('.person_label_by_id($pdo,(int)$f[$k]).'). Déverrouille-la avant de modifier ce couple.');
}

/** Vérifie que la fiche (ou le couple) qui porte cet événement n'est pas verrouillée. */
function assert_event_unlocked(PDO $pdo, int $eventId): void
{
    if(!$eventId)return;
    $stmt=$pdo->prepare('SELECT person_id,family_id FROM events WHERE id=?');$stmt->execute([$eventId]);$e=$stmt->fetch();
    if(!$e)return;
    if($e['person_id'])assert_person_unlocked($pdo,(int)$e['person_id']);
    if($e['family_id'])assert_family_unlocked($pdo,(int)$e['family_id']);
}

function untouched_people_where(): string
{
    return "NOT EXISTS (
        SELECT 1 FROM change_log c
        WHERE c.entity_type='person'
          AND c.entity_id=p.id
          AND c.action NOT IN ('lock','unlock','bulk-lock','bulk-unlock')
    )";
}

function lock_candidates(PDO $pdo): never
{
    $where=untouched_people_where();
    $count=$pdo->query("SELECT count(*) FROM persons p WHERE {$where}")->fetchColumn();
    $locked=$pdo->query("SELECT count(*) FROM persons p WHERE {$where} AND COALESCE(p.is_locked,0)=1")->fetchColumn();
    $stmt=$pdo->query("SELECT p.id,p.first_name,p.middle_name,p.last_name,p.gender,p.living_status,COALESCE(p.is_locked,0) AS is_locked,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year
        FROM persons p
        WHERE {$where}
        ORDER BY CASE WHEN trim(COALESCE(p.last_name,''))='' THEN 1 ELSE 0 END,p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE
        LIMIT 500");
    json_response([
        'total'=>(int)$count,
        'locked'=>(int)$locked,
        'unlocked'=>max(0,(int)$count-(int)$locked),
        'people'=>$stmt->fetchAll(),
        'limit'=>500,
    ]);
}

function set_person_lock(PDO $pdo,array $data): array
{
    $id=safe_int($data['person_id']??$data['id']??0);
    if(!$id)throw new RuntimeException('Personne manquante');
    $locked=safe_int($data['locked']??0) ? 1 : 0;
    $stmt=$pdo->prepare('SELECT * FROM persons WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();
    if(!$before)throw new RuntimeException('Personne introuvable');
    $pdo->prepare('UPDATE persons SET is_locked=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$locked,$id]);
    $stmt->execute([$id]);$after=$stmt->fetch();
    log_change($pdo,'person',$id,$locked?'lock':'unlock',($locked?'Verrouillage':'Déverrouillage').' de '.full_name($after),$before,$after);
    return ['id'=>$id,'is_locked'=>$locked];
}

function bulk_lock_people(PDO $pdo,array $data): array
{
    $scope=safe_text($data['scope']??'untouched');
    $locked=safe_int($data['locked']??0) ? 1 : 0;
    if($scope!=='untouched')throw new RuntimeException('Portée non prise en charge');
    $where=untouched_people_where();
    $count=(int)$pdo->query("SELECT count(*) FROM persons p WHERE {$where}")->fetchColumn();
    $pdo->exec("UPDATE persons SET is_locked={$locked},updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT p.id FROM persons p WHERE {$where})");
    log_change($pdo,'person',null,$locked?'bulk-lock':'bulk-unlock',($locked?'Verrouillage':'Déverrouillage').' des fiches non modifiées ('.$count.' fiche(s))',null,['scope'=>$scope,'locked'=>$locked,'count'=>$count]);
    return ['count'=>$count,'is_locked'=>$locked];
}

function ensure_child_link(PDO $pdo, int $familyId, int $childId): void
{
    $stmt=$pdo->prepare('SELECT 1 FROM family_children WHERE family_id=? AND child_id=?');$stmt->execute([$familyId,$childId]);
    if(!$stmt->fetchColumn())$pdo->prepare("INSERT INTO family_children(family_id,child_id,relation_to_partner1,relation_to_partner2,position) VALUES(?,?,'biological','biological',(SELECT COALESCE(max(position),0)+1 FROM family_children WHERE family_id=?))")->execute([$familyId,$childId,$familyId]);
}

/** Nom affichable d'une fiche par son numéro (pour le journal et les messages). */
function person_label_by_id(PDO $pdo, int $id): string
{
    $stmt=$pdo->prepare('SELECT * FROM persons WHERE id=?');$stmt->execute([$id]);$row=$stmt->fetch();
    $name=$row?trim(full_name($row)):'';
    return $name!==''?$name:'la fiche #'.$id;
}

/** Famille du couple (a,b), quel que soit l'ordre des partenaires ; 0 s'il n'existe pas. */
function couple_family_id(PDO $pdo, int $a, int $b): int
{
    $stmt=$pdo->prepare('SELECT id FROM families WHERE (partner1_id=CAST(? AS INTEGER) AND partner2_id=CAST(? AS INTEGER)) OR (partner1_id=CAST(? AS INTEGER) AND partner2_id=CAST(? AS INTEGER)) ORDER BY id LIMIT 1');
    $stmt->execute([$a,$b,$b,$a]);
    return (int)$stmt->fetchColumn();
}

/** Parents connus d'un enfant (toutes ses familles confondues). */
function child_parent_ids(PDO $pdo, int $childId): array
{
    $stmt=$pdo->prepare('SELECT f.partner1_id,f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=CAST(? AS INTEGER) ORDER BY f.id');
    $stmt->execute([$childId]);$ids=[];
    foreach($stmt->fetchAll() as $f)foreach(['partner1_id','partner2_id'] as $k)if($f[$k]!==null&&!in_array((int)$f[$k],$ids,true))$ids[]=(int)$f[$k];
    return $ids;
}

/** Lien (adopté, biologique…) de l'enfant avec ce parent, lu dans ses familles ; « biological » par défaut. */
function child_relation_to(PDO $pdo, int $childId, int $parentId): string
{
    $stmt=$pdo->prepare('SELECT f.partner1_id,f.partner2_id,fc.relation_to_partner1,fc.relation_to_partner2 FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=CAST(? AS INTEGER)');
    $stmt->execute([$childId]);
    foreach($stmt->fetchAll() as $r){
        if((int)$r['partner1_id']===$parentId)return (string)($r['relation_to_partner1']?:'biological');
        if((int)$r['partner2_id']===$parentId)return (string)($r['relation_to_partner2']?:'biological');
    }
    return 'biological';
}

/** Supprime une famille restée vide (aucun enfant, un seul partenaire au plus, rien de rattaché). */
function drop_family_if_empty(PDO $pdo, int $familyId): void
{
    $stmt=$pdo->prepare('SELECT partner1_id,partner2_id FROM families WHERE id=?');$stmt->execute([$familyId]);$f=$stmt->fetch();
    if(!$f||($f['partner1_id']!==null&&$f['partner2_id']!==null))return;
    $count=$pdo->prepare('SELECT count(*) FROM family_children WHERE family_id=?');$count->execute([$familyId]);
    if((int)$count->fetchColumn()>0)return;
    if(family_attachment_counts($pdo,$familyId)['total']>0)return;
    $pdo->prepare('DELETE FROM families WHERE id=?')->execute([$familyId]);
}

/** Met l'enfant dans la famille $familyId (en gardant ses liens adopté/biologique avec chaque parent), et le retire de ses autres familles. */
function move_child_to_family(PDO $pdo, int $childId, int $familyId): void
{
    $stmt=$pdo->prepare('SELECT partner1_id,partner2_id FROM families WHERE id=?');$stmt->execute([$familyId]);$f=$stmt->fetch();
    if(!$f)return;
    $rel1=$f['partner1_id']!==null?child_relation_to($pdo,$childId,(int)$f['partner1_id']):'biological';
    $rel2=$f['partner2_id']!==null?child_relation_to($pdo,$childId,(int)$f['partner2_id']):'biological';
    $old=$pdo->prepare('SELECT family_id FROM family_children WHERE child_id=? AND family_id<>?');$old->execute([$childId,$familyId]);$oldIds=array_map('intval',$old->fetchAll(PDO::FETCH_COLUMN));
    $pdo->prepare('DELETE FROM family_children WHERE child_id=? AND family_id<>?')->execute([$childId,$familyId]);
    ensure_child_link($pdo,$familyId,$childId);
    $pdo->prepare('UPDATE family_children SET relation_to_partner1=?,relation_to_partner2=? WHERE family_id=? AND child_id=?')->execute([$rel1,$rel2,$familyId,$childId]);
    foreach($oldIds as $oid)drop_family_if_empty($pdo,$oid);
}

/** Ce qui est rattaché à une famille (mariage et autres événements, notes, médias, sources, étiquettes). */
function family_attachment_counts(PDO $pdo, int $familyId): array
{
    $one=function(string $sql)use($pdo,$familyId):int{$s=$pdo->prepare($sql);$s->execute(array_fill(0,substr_count($sql,'?'),$familyId));return (int)$s->fetchColumn();};
    $c=[
        'events'=>$one('SELECT count(*) FROM events WHERE family_id=?'),
        // y compris ce qui est posé sur les événements du couple (la source d'un mariage…)
        'notes'=>$one("SELECT count(*) FROM notes WHERE (entity_type='family' AND entity_id=?) OR (entity_type='event' AND entity_id IN (SELECT id FROM events WHERE family_id=?))"),
        'media'=>$one("SELECT count(*) FROM media_links WHERE (entity_type='family' AND entity_id=?) OR (entity_type='event' AND entity_id IN (SELECT id FROM events WHERE family_id=?))"),
        'sources'=>$one("SELECT count(*) FROM source_links WHERE (entity_type='family' AND entity_id=?) OR (entity_type='event' AND entity_id IN (SELECT id FROM events WHERE family_id=?))"),
        'labels'=>$one("SELECT count(*) FROM label_links WHERE entity_type='family' AND entity_id=?"),
    ];
    $c['total']=array_sum($c);
    return $c;
}

/**
 * Ajoute $parentId comme parent de $childId, sans jamais donner trois parents à l'enfant
 * ni créer deux familles pour un même couple.
 */
function add_parent_child(PDO $pdo, int $parentId, int $childId): void
{
    $current=child_parent_ids($pdo,$childId);
    if(in_array($parentId,$current,true))return;
    // 1) L'enfant n'a encore aucun parent.
    if(!$current){
        $fams=$pdo->prepare('SELECT id,partner1_id,partner2_id FROM families WHERE partner1_id=CAST(? AS INTEGER) OR partner2_id=CAST(? AS INTEGER) ORDER BY id');$fams->execute([$parentId,$parentId]);$fams=$fams->fetchAll();
        $couples=array_values(array_filter($fams,fn($f)=>$f['partner1_id']!==null&&$f['partner2_id']!==null));
        $singles=array_values(array_filter($fams,fn($f)=>$f['partner1_id']===null||$f['partner2_id']===null));
        // une seule union, rien d'autre : l'enfant rejoint ce couple (même fratrie que ses autres enfants)
        if(count($couples)===1&&!$singles){ensure_child_link($pdo,(int)$couples[0]['id'],$childId);return;}
        // un parent seul (déjà une famille sans conjoint) : même fratrie
        if($singles){ensure_child_link($pdo,(int)$singles[0]['id'],$childId);return;}
        // plusieurs unions : on ne choisit pas l'autre parent à la place de l'utilisateur
        $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,NULL)')->execute([$parentId]);ensure_child_link($pdo,(int)$pdo->lastInsertId(),$childId);return;
    }
    // 2) L'enfant a déjà un parent connu : le couple (parent connu + nouveau parent) devient sa famille.
    if(count($current)===1){
        $known=$current[0];
        $existing=couple_family_id($pdo,$known,$parentId);
        if($existing){move_child_to_family($pdo,$childId,$existing);return;}
        // famille du parent connu avec une place libre, où l'enfant est seul : on remplit la place
        $open=$pdo->prepare('SELECT f.id,f.partner1_id,f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=CAST(? AS INTEGER) AND (f.partner1_id IS NULL OR f.partner2_id IS NULL) ORDER BY f.id');$open->execute([$childId]);
        foreach($open->fetchAll() as $family){
            $n=$pdo->prepare('SELECT count(*) FROM family_children WHERE family_id=?');$n->execute([$family['id']]);
            if((int)$n->fetchColumn()===1){
                $slot=$family['partner1_id']===null?'partner1_id':'partner2_id';
                $pdo->prepare("UPDATE families SET {$slot}=? WHERE id=?")->execute([$parentId,$family['id']]);
                move_child_to_family($pdo,$childId,(int)$family['id']); // retire d'éventuelles autres familles à un parent
                return;
            }
        }
        // sinon (frères et sœurs dans cette famille) : un nouveau couple pour cet enfant seulement
        $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$known,$parentId]);
        move_child_to_family($pdo,$childId,(int)$pdo->lastInsertId());
        return;
    }
    // 3) L'enfant a déjà deux parents : seulement si le nouveau forme déjà un couple avec l'un d'eux.
    foreach($current as $known){
        $existing=couple_family_id($pdo,$known,$parentId);
        if($existing){move_child_to_family($pdo,$childId,$existing);return;}
    }
    $names=implode(' et ',array_map(fn($id)=>person_label_by_id($pdo,$id),array_slice($current,0,2)));
    throw new RuntimeException(person_label_by_id($pdo,$childId).' a déjà deux parents ('.$names.'). Retire d’abord l’un des deux, puis ajoute '.person_label_by_id($pdo,$parentId).'.');
}

function ensure_single_parent_child(PDO $pdo, int $parentId, int $childId): void
{
    $exists=$pdo->prepare('SELECT 1 FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? AND (f.partner1_id=? OR f.partner2_id=?)');$exists->execute([$childId,$parentId,$parentId]);
    if($exists->fetchColumn())return;
    $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,NULL)')->execute([$parentId]);$familyId=(int)$pdo->lastInsertId();ensure_child_link($pdo,$familyId,$childId);
}

/** Vrai si $ancestorId est un ancêtre (à n'importe quelle génération) de $personId. */
function person_is_ancestor_of(PDO $pdo, int $ancestorId, int $personId): bool
{
    $stmt=$pdo->prepare("WITH RECURSIVE up(id) AS (
            SELECT CAST(? AS INTEGER) UNION
            SELECT p.pid FROM up JOIN family_children fc ON fc.child_id=up.id JOIN families f ON f.id=fc.family_id
            JOIN (SELECT id AS fid, partner1_id AS pid FROM families UNION ALL SELECT id, partner2_id FROM families) p ON p.fid=f.id AND p.pid IS NOT NULL
        ) SELECT 1 FROM up WHERE id=CAST(? AS INTEGER) LIMIT 1");
    $stmt->execute([$personId,$ancestorId]);
    return (bool)$stmt->fetchColumn();
}

function add_relation(PDO $pdo,array $data): array
{
    $personId=safe_int($data['person_id']??0);$relatedId=safe_int($data['related_id']??0);$type=safe_text($data['relation_type']??'');
    // « Créer une nouvelle personne » : la fiche et le lien dans la même écriture (handle_write) ; si le lien est refusé
    // (enfant qui a déjà deux parents, fiche verrouillée…), la fiche n'est pas créée non plus.
    $createdId=0;
    if(!$relatedId&&!empty($data['new_person'])&&is_array($data['new_person'])&&$personId&&in_array($type,['parent','child','spouse'],true)){
        if(!person_exists($pdo,$personId))throw new RuntimeException('Personne introuvable');
        assert_person_unlocked($pdo,$personId);
        $np=array_intersect_key($data['new_person'],array_flip(['first_name','last_name','middle_name','gender','living_status']));
        $created=save_person($pdo,$np);$relatedId=$createdId=(int)$created['id'];
    }
    if(!$personId||!$relatedId||!in_array($type,['parent','child','spouse'],true))throw new RuntimeException('Relation incomplète');
    if($personId===$relatedId)throw new RuntimeException('Une personne ne peut pas être liée à elle-même');
    if(!person_exists($pdo,$personId)||!person_exists($pdo,$relatedId))throw new RuntimeException('Personne introuvable');
    assert_person_unlocked($pdo,$personId);assert_person_unlocked($pdo,$relatedId);
    // Pas de boucle dans l'arbre : un parent ne peut pas être aussi un descendant de son enfant.
    [$parentId,$childId]=$type==='parent'?[$relatedId,$personId]:($type==='child'?[$personId,$relatedId]:[0,0]);
    if($parentId&&person_is_ancestor_of($pdo,$childId,$parentId))throw new RuntimeException('Impossible : cette personne serait à la fois l’ancêtre et le descendant de l’autre. Vérifie le sens du lien (parent ou enfant).');
    if($type==='parent')add_parent_child($pdo,$relatedId,$personId);
    elseif($type==='child'){$pdo->prepare("UPDATE persons SET children_status='unknown' WHERE id=?")->execute([$personId]);add_parent_child($pdo,$personId,$relatedId);}
    else{
        $pdo->prepare("UPDATE persons SET spouse_status='unknown' WHERE id=?")->execute([$personId]);
        $exists=$pdo->prepare('SELECT id FROM families WHERE (partner1_id=? AND partner2_id=?) OR (partner1_id=? AND partner2_id=?) LIMIT 1');$exists->execute([$personId,$relatedId,$relatedId,$personId]);
        if(!$exists->fetchColumn())$pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$personId,$relatedId]);
    }
    log_change($pdo,'person',$personId,'add-relation',relation_log_text('Ajout',$pdo,$personId,$relatedId,$type),null,['person_id'=>$personId,'related_id'=>$relatedId,'relation_type'=>$type]);return ['person_id'=>$personId,'related_id'=>$relatedId,'relation_type'=>$type,'created_id'=>$createdId]; // le lien gardé dans le journal : ⌘Z peut le retirer
}

function set_relation_status(PDO $pdo,array $data): array
{
    $personId=safe_int($data['person_id']??0);$type=safe_text($data['relation_type']??'');$status=safe_text($data['status']??'unknown');
    if(!$personId||!in_array($type,['spouse','child'],true)||!in_array($status,['unknown','none','none_suspected'],true))throw new RuntimeException('Mention familiale invalide');
    $column=$type==='spouse'?'spouse_status':'children_status';$pdo->prepare("UPDATE persons SET {$column}=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$status,$personId]);
    log_change($pdo,'person',$personId,'family-status','Mention '.($type==='spouse'?'conjoint':'enfant').' : '.$status);return ['person_id'=>$personId,'status'=>$status];
}

function save_hypothesis(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$personId=safe_int($data['person_id']??0);if(!$personId)throw new RuntimeException('Personne manquante');
    $title=safe_text($data['title']??'');if($title==='')throw new RuntimeException('Titre obligatoire');
    $type=in_array(($data['type']??''),['identity','relationship','date','place','other'],true)?$data['type']:'identity';
    $confidence=in_array(($data['confidence']??''),['low','medium','high'],true)?$data['confidence']:'medium';
    $status=in_array(($data['status']??''),['open','confirmed','rejected'],true)?$data['status']:'open';
    $related=safe_int($data['related_person_id']??0) ?: null;$eventId=safe_int($data['event_id']??0) ?: null;$statement=(string)($data['statement']??'');
    if($eventId){
        $eventCheck=$pdo->prepare('SELECT id FROM events WHERE id=? AND (person_id=? OR family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?))');
        $eventCheck->execute([$eventId,$personId,$personId,$personId]);
        if(!$eventCheck->fetchColumn())throw new RuntimeException('Événement lié introuvable pour cette personne.');
    }
    if($id){$before=$pdo->prepare('SELECT * FROM hypotheses WHERE id=?');$before->execute([$id]);$old=$before->fetch();if(!$old)throw new RuntimeException('Hypothèse introuvable');$pdo->prepare('UPDATE hypotheses SET person_id=?,related_person_id=?,event_id=?,type=?,title=?,statement=?,confidence=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$personId,$related,$eventId,$type,$title,$statement,$confidence,$status,$id]);}
    else{$pdo->prepare('INSERT INTO hypotheses(person_id,related_person_id,event_id,type,title,statement,confidence,status) VALUES(?,?,?,?,?,?,?,?)')->execute([$personId,$related,$eventId,$type,$title,$statement,$confidence,$status]);$id=(int)$pdo->lastInsertId();$old=null;}
    $stmt=$pdo->prepare('SELECT * FROM hypotheses WHERE id=?');$stmt->execute([$id]);$after=$stmt->fetch();log_change($pdo,'hypothesis',$id,$old?'update':'create',($old?'Modification':'Création').' de l’hypothèse « '.$title.' »',$old,$after);return $after;
}

function delete_hypothesis(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$stmt=$pdo->prepare('SELECT * FROM hypotheses WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Hypothèse introuvable');$pdo->prepare('DELETE FROM hypotheses WHERE id=?')->execute([$id]);log_change($pdo,'hypothesis',$id,'delete','Suppression de l’hypothèse « '.$before['title'].' »',$before,null);return ['id'=>$id];
}

function save_evidence(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$personId=safe_int($data['person_id']??0);if(!$personId)throw new RuntimeException('Personne manquante');
    $title=safe_text($data['title']??'');if($title==='')throw new RuntimeException('Titre obligatoire');
    $quality=in_array(($data['quality']??''),['unsourced','indirect','original','concordant','contradiction'],true)?$data['quality']:'unsourced';
    $confidence=in_array(($data['confidence']??''),['low','medium','high'],true)?$data['confidence']:'medium';
    $eventId=safe_int($data['event_id']??0)?:null;$sourceId=safe_int($data['source_id']??0)?:null;$subject=safe_text($data['subject']??'');$note=(string)($data['note']??'');
    if($id){$before=$pdo->prepare('SELECT * FROM evidence_records WHERE id=?');$before->execute([$id]);$old=$before->fetch();if(!$old)throw new RuntimeException('Preuve introuvable');$pdo->prepare('UPDATE evidence_records SET person_id=?,event_id=?,source_id=?,title=?,subject=?,quality=?,confidence=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$personId,$eventId,$sourceId,$title,$subject,$quality,$confidence,$note,$id]);}
    else{$pdo->prepare('INSERT INTO evidence_records(person_id,event_id,source_id,title,subject,quality,confidence,note) VALUES(?,?,?,?,?,?,?,?)')->execute([$personId,$eventId,$sourceId,$title,$subject,$quality,$confidence,$note]);$id=(int)$pdo->lastInsertId();$old=null;}
    $stmt=$pdo->prepare('SELECT * FROM evidence_records WHERE id=?');$stmt->execute([$id]);$after=$stmt->fetch();log_change($pdo,'evidence',$id,$old?'update':'create',($old?'Modification':'Création').' de la preuve « '.$title.' »',$old,$after);return $after;
}

function delete_evidence(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$stmt=$pdo->prepare('SELECT * FROM evidence_records WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Preuve introuvable');$pdo->prepare('DELETE FROM evidence_records WHERE id=?')->execute([$id]);log_change($pdo,'evidence',$id,'delete','Suppression de la preuve « '.$before['title'].' »',$before,null);return ['id'=>$id];
}

function find_or_create_place(PDO $pdo,string $placeName,string $country='France'): ?int
{
    $placeName=safe_text($placeName);$country=safe_text($country);
    if($placeName==='')return null;
    // Recherche tolérante : un lieu déjà en base (import MacFamilyTree/GeoNames) a parfois un champ
    // "country" vide/différent de la casse par défaut ("France"). On évite ainsi de recréer un doublon
    // vide (sans subdivision/county/state/latitude/longitude) quand on retape une ville déjà connue.
    $find=$pdo->prepare("SELECT id FROM places
        WHERE (name=? COLLATE NOCASE OR subdivision=? COLLATE NOCASE)
          AND (country=? COLLATE NOCASE OR TRIM(COALESCE(country,''))='' OR TRIM(?)='')
        ORDER BY (latitude IS NOT NULL AND longitude IS NOT NULL) DESC, population DESC, id LIMIT 1");
    $find->execute([$placeName,$placeName,$country,$country]);
    $placeId=$find->fetchColumn();
    if($placeId)return (int)$placeId;
    $find=$pdo->prepare("SELECT id FROM places WHERE (name=? COLLATE NOCASE OR subdivision=? COLLATE NOCASE) AND country=? COLLATE NOCASE ORDER BY population DESC,id LIMIT 1");
    $find->execute([$placeName,$placeName,$country]);
    $placeId=$find->fetchColumn();
    if($placeId)return (int)$placeId;
    $find=$pdo->prepare('SELECT id FROM places WHERE name=? COLLATE NOCASE AND country=? COLLATE NOCASE LIMIT 1');
    $find->execute([$placeName,$country]);
    $placeId=$find->fetchColumn();
    if($placeId)return (int)$placeId;
    // Ville hors de France tapée à la main : si le répertoire mondial la connaît (même nom, même pays), on reprend
    // ses coordonnées et sa région ; sinon le lieu est créé tel quel (n'importe quel nom reste accepté).
    if($country!==''&&mb_strtolower($country)!=='france'&&($world=world_place_exact($placeName,$country)))return place_from_world($pdo,$world);
    $pdo->prepare('INSERT INTO places(name,country) VALUES(?,?)')->execute([$placeName,$country]);
    return (int)$pdo->lastInsertId();
}

function place_id_from_data(PDO $pdo,array $data): ?int
{
    // Suggestion venant du répertoire mondial (« w » + identifiant GeoNames) : le lieu entre alors dans la base.
    if(preg_match('/^w(\d+)$/',(string)($data['place_id']??''),$m)&&($world=world_place((int)$m[1])))return place_from_world($pdo,$world);
    $placeId=safe_int($data['place_id']??0);
    if($placeId){
        $stmt=$pdo->prepare('SELECT id FROM places WHERE id=?');
        $stmt->execute([$placeId]);
        if($stmt->fetchColumn())return $placeId;
    }
    return find_or_create_place($pdo,safe_text($data['place_name']??''),safe_text($data['country']??'France'));
}

function place_label(array $place): string
{
    return implode(', ',array_values(array_filter([
        $place['name']??'',
        $place['subdivision']??'',
        $place['county']??'',
        $place['state']??'',
        $place['country']??'',
    ],static fn($part)=>trim((string)$part)!=='')));
}

function place_suggestions_data(PDO $pdo): never
{
    $q=safe_text($_GET['q']??'');
    $country=safe_text($_GET['country']??'');
    if(mb_strlen($q)<2)json_response(['places'=>[]]);
    $like='%'.$q.'%';
    $prefix=$q.'%';
    if($country!==''){
        $stmt=$pdo->prepare("SELECT id,name,subdivision,county,state,country,latitude,longitude,population
            FROM places
            WHERE country=? COLLATE NOCASE
            AND (name LIKE ? COLLATE NOCASE OR subdivision LIKE ? COLLATE NOCASE OR alternate_names LIKE ? COLLATE NOCASE)
            ORDER BY
                CASE
                    WHEN name LIKE ? COLLATE NOCASE THEN 0
                    WHEN subdivision LIKE ? COLLATE NOCASE THEN 1
                    ELSE 2
                END,
                population DESC,
                name COLLATE NOCASE,
                subdivision COLLATE NOCASE
            LIMIT 14");
        $stmt->execute([$country,$like,$like,$like,$prefix,$prefix]);
    }else{
        $stmt=$pdo->prepare("SELECT id,name,subdivision,county,state,country,latitude,longitude,population
            FROM places
            WHERE (name LIKE ? COLLATE NOCASE OR subdivision LIKE ? COLLATE NOCASE OR alternate_names LIKE ? COLLATE NOCASE)
            ORDER BY
                CASE
                    WHEN name LIKE ? COLLATE NOCASE THEN 0
                    WHEN subdivision LIKE ? COLLATE NOCASE THEN 1
                    ELSE 2
                END,
                population DESC,
                name COLLATE NOCASE,
                subdivision COLLATE NOCASE
            LIMIT 14");
        $stmt->execute([$like,$like,$like,$prefix,$prefix]);
    }
    $places=$stmt->fetchAll();
    foreach($places as &$place)$place['label']=place_label($place);
    unset($place);
    // Formulaires de saisie (world=1) : compléter avec les villes du monde absentes de la base
    // (4 places au moins leur sont gardées : sinon « Montréal » ne montrerait que les communes françaises)
    if(($_GET['world']??'')==='1'){
        $places=array_slice($places,0,10);
        $known=[];
        foreach($pdo->query('SELECT geoname_id FROM places WHERE geoname_id IS NOT NULL') as $row)$known[(int)$row['geoname_id']]=true;
        $same=static fn(array $p):string=>world_search_key((string)($p['name']??'')).'|'.world_search_key((string)($p['country']??''));
        $listed=array_flip(array_map($same,$places));
        foreach(world_place_suggestions($q,$country,40) as $w){
            if(isset($known[(int)$w['geoname_id']])||isset($listed[$same($w)])||mb_strtolower((string)$w['country'])==='france')continue;
            $w=['id'=>'w'.$w['geoname_id'],'name'=>$w['name'],'subdivision'=>'','county'=>'','state'=>$w['state'],'country'=>$w['country'],'latitude'=>$w['latitude'],'longitude'=>$w['longitude'],'population'=>$w['population'],'world'=>true];
            $w['label']=place_label($w);
            $places[]=$w;
            if(count($places)>=14)break;
        }
        // Classement commun : d'abord les lieux de la base et les villes (1 000 habitants ou plus) au nom exact, puis
        // celles qui commencent par le texte tapé, puis les hameaux du monde ; à égalité, les plus peuplés.
        $key=world_search_key($q);
        $rank=static function(array $p)use($key):array{$n=world_search_key((string)($p['name']??''));$main=empty($p['world'])||(int)($p['population']??0)>=1000;$exact=$n===$key;$prefix=str_starts_with($n,$key);return [$exact&&$main?0:($prefix&&$main?1:($exact?2:3)),-(int)($p['population']??0)];};
        usort($places,static fn($a,$b)=>$rank($a)<=>$rank($b));
    }
    json_response(['places'=>$places]);
}

function place_name_search_data(PDO $pdo): never
{
    $q = safe_text($_GET['q'] ?? '');
    $country = safe_text($_GET['country'] ?? '');
    $division = safe_text($_GET['division'] ?? '');
    if (mb_strlen(str_replace('*', '', $q)) < 1) json_response(['places' => []]);

    $escaped = addcslashes($q, "\\%_");
    $pattern = str_replace('*', '%', $escaped);
    if (!str_contains($pattern, '%')) $pattern = '%' . $pattern . '%';

    $where = [
        "(name LIKE :q ESCAPE '\\' COLLATE NOCASE
          OR subdivision LIKE :q ESCAPE '\\' COLLATE NOCASE
          OR alternate_names LIKE :q ESCAPE '\\' COLLATE NOCASE)"
    ];
    $params = [':q' => $pattern];
    if ($country !== '') {
        $where[] = "country LIKE :country ESCAPE '\\' COLLATE NOCASE";
        $params[':country'] = '%' . addcslashes($country, "\\%_") . '%';
    }
    if ($division !== '') {
        $where[] = "(county LIKE :division ESCAPE '\\' COLLATE NOCASE
            OR state LIKE :division ESCAPE '\\' COLLATE NOCASE
            OR subdivision LIKE :division ESCAPE '\\' COLLATE NOCASE)";
        $params[':division'] = '%' . addcslashes($division, "\\%_") . '%';
    }

    $sql = "
        SELECT pl.id,pl.name,pl.subdivision,pl.county,pl.state,pl.country,pl.latitude,pl.longitude,pl.population,
               COUNT(DISTINCT e.id) AS event_count,
               COUNT(DISTINCT cr.id) AS census_count
        FROM places pl
        LEFT JOIN events e ON e.place_id=pl.id
        LEFT JOIN census_records cr ON cr.place_id=pl.id
        WHERE " . implode(' AND ', $where) . "
        GROUP BY pl.id
        ORDER BY
            CASE
                WHEN pl.name LIKE :q ESCAPE '\\' COLLATE NOCASE THEN 0
                WHEN pl.subdivision LIKE :q ESCAPE '\\' COLLATE NOCASE THEN 1
                ELSE 2
            END,
            pl.population DESC,
            pl.country COLLATE NOCASE,
            pl.state COLLATE NOCASE,
            pl.county COLLATE NOCASE,
            pl.name COLLATE NOCASE
        LIMIT 200";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $places = $stmt->fetchAll();
    $hasContours = (bool)$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='commune_contours'")->fetchColumn();
    if ($hasContours) {
        $contourWhere = ["name LIKE :q ESCAPE '\\' COLLATE NOCASE"];
        $contourParams = [':q' => $pattern];
        // Pays de chaque commune d'après son code (« BE-… » = Belgique ; sans préfixe = France)
        $countrySql = "CASE";
        foreach (reference_countries_available() as $cc => $countryName) { $countrySql .= " WHEN c.insee_code GLOB " . $pdo->quote($cc . '-*') . " THEN " . $pdo->quote($countryName); }
        $countrySql .= " ELSE 'France' END";
        if ($country !== '') {
            $contourWhere[] = "($countrySql) LIKE :contourCountry COLLATE NOCASE";
            $contourParams[':contourCountry'] = (mb_stripos('France', $country) !== false || strtoupper($country) === 'FR') ? 'France' : '%' . addcslashes($country, "\\%_") . '%';
        }
        if ($division !== '') {
            $contourWhere[] = '(insee_code LIKE :divisionPrefix OR name LIKE :division ESCAPE \'\\\' COLLATE NOCASE)';
            $divisionClean = preg_replace('/[^0-9A-Za-z]/', '', $division) ?? '';
            $contourParams[':divisionPrefix'] = $divisionClean !== '' ? $divisionClean . '%' : '__NO_DEPT__';
            $contourParams[':division'] = '%' . addcslashes($division, "\\%_") . '%';
        }
        $contourSql = "
            SELECT NULL AS id, c.name, '' AS subdivision, CASE WHEN c.insee_code GLOB '[A-Z][A-Z]-*' THEN '' ELSE substr(c.insee_code,1,2) END AS county, '' AS state, $countrySql AS country,
                   c.centroid_lat AS latitude, c.centroid_lon AS longitude, NULL AS population,
                   0 AS event_count, 0 AS census_count, c.insee_code AS insee_code
            FROM commune_contours c
            WHERE " . implode(' AND ', $contourWhere) . "
              AND NOT EXISTS (
                  SELECT 1 FROM places p
                  WHERE p.name = c.name COLLATE NOCASE
                    AND (p.country = ($countrySql) OR (($countrySql) = 'France' AND (p.country = 'FR' OR p.country = '')))
              )
            ORDER BY c.name COLLATE NOCASE
            LIMIT 200";
        $contourStmt = $pdo->prepare($contourSql);
        $contourStmt->execute($contourParams);
        foreach ($contourStmt->fetchAll() as $row) {
            $row['label'] = trim($row['name'] . ' (' . $row['insee_code'] . ') · ' . ($row['country'] === 'France' ? 'commune officielle française' : 'commune officielle · ' . $row['country']));
            $places[] = $row;
        }
    }
    foreach ($places as &$place) {
        if (empty($place['label'])) $place['label'] = place_label($place);
    }
    unset($place);
    json_response(['places' => $places]);
}

function place_name_facets_data(PDO $pdo): never
{
    $q = safe_text($_GET['q'] ?? '');
    $country = safe_text($_GET['country'] ?? '');
    $like = '%' . addcslashes($q, "\\%_") . '%';

    $countryStmt = $pdo->prepare("
        SELECT country AS label, COUNT(*) AS count
        FROM places
        WHERE trim(COALESCE(country,'')) <> ''
          AND (:q = '' OR country LIKE :like ESCAPE '\\' COLLATE NOCASE)
        GROUP BY country
        ORDER BY count DESC, country COLLATE NOCASE
        LIMIT 80");
    $countryStmt->execute([':q' => $q, ':like' => $like]);

    // Seulement les paramètres réellement présents dans la requête : SQLite refuse un paramètre en trop
    // (« column index out of range »), ce qui faisait échouer cette fonction à chaque appel.
    $where = ["trim(COALESCE(label,'')) <> ''"];
    $params = [];
    if ($country !== '') {
        $where[] = "country LIKE :country ESCAPE '\\' COLLATE NOCASE";
        $params[':country'] = '%' . addcslashes($country, "\\%_") . '%';
    }
    if ($q !== '') {
        $where[] = "label LIKE :like ESCAPE '\\' COLLATE NOCASE";
        $params[':like'] = $like;
    }
    $sql = "
        SELECT label, kind, country, COUNT(*) AS count
        FROM (
            SELECT state AS label, 'admin1' AS kind, country FROM places
            UNION ALL SELECT county AS label, 'admin2' AS kind, country FROM places
            UNION ALL SELECT subdivision AS label, 'subdivision' AS kind, country FROM places
        )
        WHERE " . implode(' AND ', $where) . "
        GROUP BY label, kind, country
        ORDER BY count DESC, label COLLATE NOCASE
        LIMIT 100";
    $divisionStmt = $pdo->prepare($sql);
    $divisionStmt->execute($params);

    json_response([
        'countries' => $countryStmt->fetchAll(),
        'divisions' => $divisionStmt->fetchAll(),
    ]);
}

/** Fiches verrouillées : on ne touche pas au recensement de la personne principale ni d'un membre lié verrouillé. */
function census_assert_unlocked(PDO $pdo,int $censusId,int $alsoPersonId=0): void
{
    $s=$pdo->prepare('SELECT DISTINCT person_id FROM census_members WHERE census_id=? AND is_primary=1 AND person_id IS NOT NULL');$s->execute([$censusId]);
    foreach($s->fetchAll(PDO::FETCH_COLUMN) as $pid)assert_person_unlocked($pdo,(int)$pid);
    if($alsoPersonId)assert_person_unlocked($pdo,$alsoPersonId);
}

function save_census_record(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$personId=safe_int($data['person_id']??0);$year=safe_int($data['year']??0);
    if(!$personId||!person_exists($pdo,$personId))throw new RuntimeException('Personne manquante');
    assert_person_unlocked($pdo,$personId);
    if($id)census_assert_unlocked($pdo,$id);
    if($year<1700||$year>2100)throw new RuntimeException('Année de recensement invalide');
    $isSpecial=safe_int($data['is_special']??0)?1:0;
    $status=safe_text($data['status']??'todo');
    if(!in_array($status,['todo','found','not_found','not_born','not_in_france','not_france','left_france','dead'],true))$status='todo';
    $placeId=place_id_from_data($pdo,$data);
    $values=[$year,safe_text($data['date_text']??''),$isSpecial,$status,safe_text($data['address']??''),$placeId,safe_text($data['notes']??'')];
    if($id){
        $before=$pdo->prepare('SELECT * FROM census_records WHERE id=?');$before->execute([$id]);$old=$before->fetch();if(!$old)throw new RuntimeException('Recensement introuvable');
        $pdo->prepare('UPDATE census_records SET year=?,date_text=?,is_special=?,status=?,address=?,place_id=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$values,$id]);
    }else{
        $pdo->prepare('INSERT INTO census_records(year,date_text,is_special,status,address,place_id,notes) VALUES(?,?,?,?,?,?,?)')->execute($values);
        $id=(int)$pdo->lastInsertId();$old=null;
    }
    if(array_key_exists('precise_lat',$data)){ // point précis choisi sur la carte (vide = retiré)
        $lat=h_coord($data['precise_lat']??null,90);$lon=h_coord($data['precise_lon']??null,180);
        $pdo->prepare('UPDATE census_records SET precise_lat=?,precise_lon=? WHERE id=?')->execute([$lat!==null&&$lon!==null?$lat:null,$lat!==null&&$lon!==null?$lon:null,$id]);
    }
    $censusFirstName=safe_text($data['census_first_name']??'');
    $displayName=safe_text($data['display_name']??'');
    if($displayName===''&&$censusFirstName===''){
        $person=summary_person($pdo,$personId);
        $displayName=$person?($person['last_name']??''):'';
        if($censusFirstName===''&&$person)$censusFirstName=$person['first_name']??'';
    }
    $link=$pdo->prepare('SELECT id FROM census_members WHERE census_id=? AND person_id=? LIMIT 1');$link->execute([$id,$personId]);$memberId=(int)$link->fetchColumn();
    $memberValues=[$censusFirstName,$displayName,safe_text($data['age_text']??''),safe_text($data['birth_place']??''),safe_text($data['occupation']??''),safe_text($data['employer']??''),safe_text($data['nationality']??''),safe_text($data['household_position']??''),safe_text($data['personal_status']??''),safe_text($data['extra_info']??'')];
    // un seul membre principal par foyer : celui qui l'est déjà, sinon la personne qui crée le recensement
    $prim=$pdo->prepare('SELECT person_id FROM census_members WHERE census_id=? AND is_primary=1 LIMIT 1');$prim->execute([$id]);$primary=$prim->fetchColumn();
    $isPrimary=$primary===false||(int)$primary===$personId?1:0;
    if($memberId)$pdo->prepare('UPDATE census_members SET first_name=?,display_name=?,age_text=?,birth_place=?,occupation=?,employer=?,nationality=?,household_position=?,personal_status=?,extra_info=?,is_primary=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$memberValues,$isPrimary,$memberId]);
    else $pdo->prepare('INSERT INTO census_members(census_id,person_id,first_name,display_name,age_text,birth_place,occupation,employer,nationality,household_position,personal_status,extra_info,is_primary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$id,$personId,...$memberValues,$isPrimary]);
    $stmt=$pdo->prepare('SELECT * FROM census_records WHERE id=?');$stmt->execute([$id]);$after=$stmt->fetch();
    log_change($pdo,'census',$id,$old?'update':'create',($old?'Modification':'Ajout').' du recensement '.$year.' pour la fiche #'.$personId,$old,$after);
    return ['id'=>$id,'person_id'=>$personId];
}

function add_census_member(PDO $pdo,array $data): array
{
    $censusId=safe_int($data['census_id']??0);if(!$censusId)throw new RuntimeException('Recensement manquant');
    $check=$pdo->prepare('SELECT id,year FROM census_records WHERE id=?');$check->execute([$censusId]);$record=$check->fetch();if(!$record)throw new RuntimeException('Recensement introuvable');
    $personId=safe_int($data['person_id']??0)?:null;
    if($personId&&!person_exists($pdo,$personId))throw new RuntimeException('Personne liée introuvable');
    census_assert_unlocked($pdo,$censusId,(int)$personId);
    $memberFirstName=safe_text($data['member_first_name']??'');
    $displayName=safe_text($data['display_name']??'');
    if($displayName===''&&$personId){$person=summary_person($pdo,$personId);$displayName=$person?($person['last_name']??''):'';if($memberFirstName===''&&$person)$memberFirstName=$person['first_name']??'';}
    if($displayName===''&&$memberFirstName==='')throw new RuntimeException('Nom du membre obligatoire');
    $memberValues=[$personId,$memberFirstName,$displayName,safe_text($data['age_text']??''),safe_text($data['birth_place']??''),safe_text($data['occupation']??''),safe_text($data['employer']??''),safe_text($data['nationality']??''),safe_text($data['household_position']??''),safe_text($data['personal_status']??''),safe_text($data['extra_info']??'')];
    if($personId){
        $exists=$pdo->prepare('SELECT id FROM census_members WHERE census_id=? AND person_id=?');$exists->execute([$censusId,$personId]);
        if($existing=(int)$exists->fetchColumn()){
            $pdo->prepare('UPDATE census_members SET person_id=?,first_name=?,display_name=?,age_text=?,birth_place=?,occupation=?,employer=?,nationality=?,household_position=?,personal_status=?,extra_info=?,is_primary=0,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$memberValues,$existing]);
            log_change($pdo,'census',$censusId,'update-member','Mise à jour de '.$displayName.' dans le recensement '.$record['year']);
            return ['id'=>$existing,'census_id'=>$censusId,'person_id'=>$personId,'updated_existing'=>true];
        }
    }
    $pdo->prepare('INSERT INTO census_members(census_id,person_id,first_name,display_name,age_text,birth_place,occupation,employer,nationality,household_position,personal_status,extra_info,is_primary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)')
        ->execute([$censusId,...$memberValues]);
    $id=(int)$pdo->lastInsertId();
    log_change($pdo,'census',$censusId,'add-member','Ajout de '.$displayName.' au recensement '.$record['year']);
    return ['id'=>$id,'census_id'=>$censusId,'person_id'=>$personId,'updated_existing'=>false];
}

function update_census_member(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);if(!$id)throw new RuntimeException('Membre manquant');
    $stmt=$pdo->prepare('SELECT * FROM census_members WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Membre introuvable');
    $personId=(int)$before['is_primary']===1?((int)$before['person_id']?:null):(safe_int($data['person_id']??0)?:null);
    if($personId&&!person_exists($pdo,$personId))throw new RuntimeException('Personne liée introuvable');
    census_assert_unlocked($pdo,(int)$before['census_id'],(int)$personId);
    $memberFirstName=safe_text($data['member_first_name']??'');
    $displayName=safe_text($data['display_name']??'');
    if($displayName===''&&$personId){$person=summary_person($pdo,$personId);$displayName=$person?($person['last_name']??''):'';if($memberFirstName===''&&$person)$memberFirstName=$person['first_name']??'';}
    if($displayName===''&&$memberFirstName==='')throw new RuntimeException('Nom du membre obligatoire');
    if($personId){
        $exists=$pdo->prepare('SELECT id,is_primary FROM census_members WHERE census_id=? AND person_id=? AND id<>?');$exists->execute([(int)$before['census_id'],$personId,$id]);
        if($dup=$exists->fetch()){
            if((int)$dup['is_primary']===1)throw new RuntimeException('Cette personne est déjà le membre principal de ce foyer : modifie plutôt sa ligne.');
            $pdo->prepare('DELETE FROM census_members WHERE id=?')->execute([(int)$dup['id']]);
        }
    }
    $pdo->prepare('UPDATE census_members SET person_id=?,first_name=?,display_name=?,age_text=?,birth_place=?,occupation=?,employer=?,nationality=?,household_position=?,personal_status=?,extra_info=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
        ->execute([$personId,$memberFirstName,$displayName,safe_text($data['age_text']??''),safe_text($data['birth_place']??''),safe_text($data['occupation']??''),safe_text($data['employer']??''),safe_text($data['nationality']??''),safe_text($data['household_position']??''),safe_text($data['personal_status']??''),safe_text($data['extra_info']??''),$id]);
    $afterStmt=$pdo->prepare('SELECT * FROM census_members WHERE id=?');$afterStmt->execute([$id]);$after=$afterStmt->fetch();
    log_change($pdo,'census',(int)$before['census_id'],'update-member','Modification de '.$displayName.' dans le foyer recensé',$before,$after);
    return ['id'=>$id,'census_id'=>(int)$before['census_id'],'person_id'=>$personId];
}

function delete_census_record(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);if(!$id)throw new RuntimeException('Recensement manquant');
    $stmt=$pdo->prepare('SELECT * FROM census_records WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Recensement introuvable');
    census_assert_unlocked($pdo,$id);
    $pdo->prepare("DELETE FROM media_links WHERE entity_type='census' AND entity_id=?")->execute([$id]);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='census' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM census_members WHERE census_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM census_records WHERE id=?')->execute([$id]);
    log_change($pdo,'census',$id,'delete','Suppression du recensement '.$before['year'],$before,null);
    return ['id'=>$id];
}

function delete_census_member(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$stmt=$pdo->prepare('SELECT * FROM census_members WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Membre introuvable');
    if((int)$before['is_primary']===1)throw new RuntimeException('Le membre principal se modifie depuis le recensement, il ne se retire pas ici.');
    census_assert_unlocked($pdo,(int)$before['census_id'],(int)$before['person_id']);
    $pdo->prepare('DELETE FROM census_members WHERE id=?')->execute([$id]);
    log_change($pdo,'census',(int)$before['census_id'],'delete-member','Retrait de '.$before['display_name'].' du foyer recensé',$before,null);
    return ['id'=>$id,'census_id'=>(int)$before['census_id']];
}

function media_visible_for_person(PDO $pdo,int $mediaId,int $personId): bool
{
    $stmt=$pdo->prepare("
        SELECT 1
        FROM media m
        WHERE m.id=?
        AND (
            EXISTS(SELECT 1 FROM media_links ml WHERE ml.media_id=m.id AND ml.entity_type='person' AND ml.entity_id=?)
            OR EXISTS(SELECT 1 FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id WHERE ml.media_id=m.id AND e.person_id=?)
            OR EXISTS(SELECT 1 FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN families f ON f.id=e.family_id WHERE ml.media_id=m.id AND (f.partner1_id=? OR f.partner2_id=?))
            OR EXISTS(SELECT 1 FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id WHERE ml.media_id=m.id AND (f.partner1_id=? OR f.partner2_id=?))
            OR EXISTS(SELECT 1 FROM media_links ml JOIN census_members cm ON ml.entity_type='census' AND cm.census_id=ml.entity_id WHERE ml.media_id=m.id AND cm.person_id=?)
            OR EXISTS(SELECT 1 FROM media_links ml WHERE ml.media_id=m.id AND ml.entity_type='military' AND ml.entity_id=?)
            OR EXISTS(SELECT 1 FROM media_links ml WHERE ml.media_id=m.id AND ml.entity_type='grave' AND ml.entity_id IN (SELECT grave_id FROM grave_persons WHERE person_id=?))
        )
        LIMIT 1
    ");
    $stmt->execute([$mediaId,$personId,$personId,$personId,$personId,$personId,$personId,$personId,$personId,$personId]);
    return (bool)$stmt->fetchColumn();
}

function link_entity_media(PDO $pdo,array $data): array
{
    $entityType=safe_text($data['entity_type']??'');
    $entityId=safe_int($data['entity_id']??0);
    $personId=safe_int($data['person_id']??0);
    if(!in_array($entityType,['event','military','grave'],true))throw new RuntimeException('Type de rattachement invalide');
    if(!$entityId||!$personId)throw new RuntimeException('Référence ou personne manquante');
    if($entityType==='event'){
        $check=$pdo->prepare('SELECT id FROM events WHERE id=? AND (person_id=? OR family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?))');
        $check->execute([$entityId,$personId,$personId,$personId]);
        if(!$check->fetchColumn())throw new RuntimeException('Cet événement n’est pas lié à cette personne');
    } elseif($entityType==='grave'){
        $check=$pdo->prepare('SELECT 1 FROM grave_persons WHERE grave_id=? AND person_id=?');
        $check->execute([$entityId,$personId]);
        if(!$check->fetchColumn())throw new RuntimeException('Cette sépulture n’est pas liée à cette personne');
    } else {
        if($entityId!==$personId)throw new RuntimeException('Dossier militaire invalide');
    }
    $mediaIds=$data['media_ids']??[];
    if(!is_array($mediaIds))$mediaIds=[$mediaIds];
    $mediaIds=array_values(array_unique(array_filter(array_map('safe_int',$mediaIds))));
    if(!$mediaIds)throw new RuntimeException('Choisis au moins un média');
    $added=0;
    foreach($mediaIds as $mediaId){
        if(!media_visible_for_person($pdo,$mediaId,$personId))continue;
        $exists=$pdo->prepare("SELECT 1 FROM media_links WHERE media_id=? AND entity_type=? AND entity_id=? LIMIT 1");
        $exists->execute([$mediaId,$entityType,$entityId]);
        if($exists->fetchColumn())continue;
        $position=(int)$pdo->query("SELECT COALESCE(MAX(position),0)+1 FROM media_links WHERE entity_type='".$entityType."' AND entity_id=".(int)$entityId)->fetchColumn();
        $pdo->prepare("INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(?,?,?,?)")->execute([$mediaId,$entityType,$entityId,$position]);
        $added++;
    }
    if(!$added)throw new RuntimeException('Aucun nouveau média à lier');
    log_change($pdo,$entityType,$entityId,'link-media','Ajout de '.$added.' média(s).');
    return ['entity_type'=>$entityType,'entity_id'=>$entityId,'added'=>$added];
}

function link_census_media(PDO $pdo,array $data): array
{
    $censusId=safe_int($data['census_id']??0);$personId=safe_int($data['person_id']??0);
    if(!$censusId||!$personId)throw new RuntimeException('Recensement ou personne manquante');
    assert_person_unlocked($pdo,$personId);
    $check=$pdo->prepare('SELECT cr.id,cr.year FROM census_records cr JOIN census_members cm ON cm.census_id=cr.id WHERE cr.id=? AND cm.person_id=? LIMIT 1');
    $check->execute([$censusId,$personId]);$record=$check->fetch();
    if(!$record)throw new RuntimeException('Ce recensement n’est pas lié à cette personne');
    $mediaIds=$data['media_ids']??[];
    if(!is_array($mediaIds))$mediaIds=[$mediaIds];
    $mediaIds=array_values(array_unique(array_filter(array_map('safe_int',$mediaIds))));
    if(!$mediaIds)throw new RuntimeException('Choisis au moins un média');
    $added=0;
    foreach($mediaIds as $mediaId){
        if(!media_visible_for_person($pdo,$mediaId,$personId))continue;
        $exists=$pdo->prepare("SELECT 1 FROM media_links WHERE media_id=? AND entity_type='census' AND entity_id=? LIMIT 1");
        $exists->execute([$mediaId,$censusId]);
        if($exists->fetchColumn())continue;
        $position=(int)$pdo->query("SELECT COALESCE(MAX(position),0)+1 FROM media_links WHERE entity_type='census' AND entity_id=".(int)$censusId)->fetchColumn();
        $pdo->prepare("INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(?,'census',?,?)")->execute([$mediaId,$censusId,$position]);
        $added++;
    }
    if(!$added)throw new RuntimeException('Aucun nouveau média à lier');
    log_change($pdo,'census',$censusId,'link-media','Ajout de '.$added.' média(s) au recensement '.$record['year']);
    return ['census_id'=>$censusId,'added'=>$added];
}

function save_research_note(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$personId=safe_int($data['person_id']??0);if(!$personId)throw new RuntimeException('Personne manquante');
    $title=safe_text($data['title']??'');if($title==='')throw new RuntimeException('Titre obligatoire');
    $body=(string)($data['body']??'');$result=(string)($data['result']??'');$next=(string)($data['next_step']??'');
    if($id){$before=$pdo->prepare('SELECT * FROM research_journal WHERE id=?');$before->execute([$id]);$old=$before->fetch();if(!$old)throw new RuntimeException('Journal introuvable');$pdo->prepare('UPDATE research_journal SET title=?,body=?,result=?,next_step=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$title,$body,$result,$next,$id]);}
    else{$pdo->prepare('INSERT INTO research_journal(person_id,title,body,result,next_step) VALUES(?,?,?,?,?)')->execute([$personId,$title,$body,$result,$next]);$id=(int)$pdo->lastInsertId();$old=null;}
    $stmt=$pdo->prepare('SELECT * FROM research_journal WHERE id=?');$stmt->execute([$id]);$after=$stmt->fetch();log_change($pdo,'research_journal',$id,$old?'update':'create',($old?'Modification':'Ajout').' au journal : '.$title,$old,$after);return $after;
}

function delete_research_note(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$stmt=$pdo->prepare('SELECT * FROM research_journal WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Entrée introuvable');$pdo->prepare('DELETE FROM research_journal WHERE id=?')->execute([$id]);log_change($pdo,'research_journal',$id,'delete','Suppression du journal « '.$before['title'].' »',$before,null);return ['id'=>$id];
}

function merge_duplicate_places(PDO $pdo,array $data): array
{
    // Regroupe les lieux en double (ex : "Pernay" créé une 2e fois sans coordonnées ni
    // subdivision parce que le pays saisi ne correspondait pas exactement à l'entrée existante).
    // On conserve la fiche la plus complète (coordonnées, subdivision/county/state renseignés,
    // population la plus élevée) et on reporte les références (events.place_id, census_records.place_id)
    // avant de supprimer les doublons vides. Confirmation requise pour éviter une fusion accidentelle.
    $confirm=($data['confirm']??'')==='yes';
    if(!$confirm)throw new RuntimeException('Confirmation requise');
    $normalize=function(string $s): string {
        // ascii_fold() plutôt que l'extension intl (facultative) : même regroupement quel que soit le PHP.
        $s=ascii_fold(mb_strtolower(trim($s)));
        return preg_replace('/\s+/', ' ', $s);
    };
    $places=$pdo->query('SELECT id,name,subdivision,county,state,country,latitude,longitude,population,source_id FROM places')->fetchAll();
    $groups=[];
    foreach($places as $place){
        $key=$normalize($place['name']);
        $groups[$key][]=$place;
    }
    $merges=[];
    foreach($groups as $key=>$rows){
        if(count($rows)<2)continue;
        // Score : coordonnées + subdivision/county/state renseignés + population, puis id le plus ancien
        $score=function($row){
            return ($row['latitude']!==null && $row['longitude']!==null ? 100 : 0)
                + (trim((string)($row['subdivision']??''))!=='' ? 10 : 0)
                + (trim((string)($row['county']??''))!=='' ? 5 : 0)
                + (trim((string)($row['state']??''))!=='' ? 5 : 0)
                + (int)($row['population']??0)/1000000;
        };
        usort($rows, fn($a,$b)=>$score($b)<=>$score($a) ?: (int)$a['id']<=>(int)$b['id']);
        $survivor=$rows[0];
        $duplicates=array_slice($rows,1);
        $dupIds=array_map(fn($r)=>(int)$r['id'],$duplicates);
        if(!$dupIds)continue;
        $marks=implode(',',array_fill(0,count($dupIds),'?'));
        $pdo->prepare("UPDATE events SET place_id=? WHERE place_id IN ($marks)")->execute(array_merge([(int)$survivor['id']],$dupIds));
        $pdo->prepare("UPDATE census_records SET place_id=? WHERE place_id IN ($marks)")->execute(array_merge([(int)$survivor['id']],$dupIds));
        $pdo->prepare("DELETE FROM places WHERE id IN ($marks)")->execute($dupIds);
        $merges[]=['survivor_id'=>(int)$survivor['id'],'survivor_name'=>$survivor['name'],'removed_ids'=>$dupIds];
    }
    if($merges)log_change($pdo,'place',null,'merge-duplicates','Fusion de '.count($merges).' groupe(s) de lieux en double',null,['merges'=>$merges]);
    return ['merged_groups'=>count($merges),'details'=>$merges];
}

function merge_people(PDO $pdo,array $data): array
{
    $target=safe_int($data['target_id']??0);$source=safe_int($data['source_id']??0);if(!$target||!$source||$target===$source)throw new RuntimeException('Fusion impossible');
    $a=summary_person($pdo,$target);$b=summary_person($pdo,$source);if(!$a||!$b)throw new RuntimeException('Fiche introuvable');
    assert_person_unlocked($pdo,$target);assert_person_unlocked($pdo,$source);
    // Deux fiches d'un même couple, ou un ancêtre et son descendant, ne sont pas des doublons : la fusion casserait l'arbre.
    $na=trim(full_name($a))?:'la fiche #'.$target;$nb=trim(full_name($b))?:'la fiche #'.$source;
    if(couple_family_id($pdo,$target,$source))throw new RuntimeException('Fusion impossible : '.$na.' et '.$nb.' forment un couple. Deux conjoints ne sont pas la même personne.');
    if(person_is_ancestor_of($pdo,$target,$source)||person_is_ancestor_of($pdo,$source,$target)){
        [$anc,$desc]=person_is_ancestor_of($pdo,$target,$source)?[$na,$nb]:[$nb,$na];
        throw new RuntimeException('Fusion impossible : '.$anc.' est un ancêtre de '.$desc.'. Un ancêtre et son descendant ne sont pas la même personne.');
    }
    $pdo->prepare("INSERT INTO name_variants(person_id,type,first_name,middle_name,last_name,source_note,position) VALUES(?,'merged',?,?,?,'Nom conservé avant fusion de la fiche #{$source}',(SELECT COALESCE(max(position),0)+1 FROM name_variants WHERE person_id=?))")->execute([$target,$b['first_name']??'',$b['middle_name']??'',$b['last_name']??'',$target]);
    merge_person_references($pdo,$target,$source);
    if(function_exists('periodical_links_person'))periodical_links_person($pdo,$source,$target);
    if(function_exists('diagram_links_person'))diagram_links_person($pdo,$source,$target);
    if(function_exists('dna_links_person'))dna_links_person($pdo,$source,$target);
    if(function_exists('art_merge_person'))art_merge_person($pdo,$source,$target); // 🎨 crédits, propriétaires… des catalogues d'artistes
    // Cases « bloc à afficher » cochées sur l'une ou l'autre fiche
    $flags=array_values(array_filter(array_column($pdo->query('PRAGMA table_info(persons)')->fetchAll(),'name'),static fn($c)=>preg_match('/^show_[a-z_]+_block$/',(string)$c)));
    foreach($flags as $flag)$pdo->prepare("UPDATE persons SET {$flag}=1 WHERE id=? AND (SELECT {$flag} FROM persons WHERE id=?)=1")->execute([$target,$source]);
    merge_duplicate_couples($pdo,$target);
    $pdo->prepare('DELETE FROM persons WHERE id=?')->execute([$source]);
    $pdo->prepare('DELETE FROM person_search WHERE person_id=CAST(? AS INTEGER)')->execute([$source]);
    rebuild_search($pdo,$target);
    log_change($pdo,'person',$target,'merge','Fusion de la fiche #'.$source.' dans #'.$target,['target'=>$a,'source'=>$b],summary_person($pdo,$target));
    return ['target_id'=>$target,'source_id'=>$source];
}

/**
 * Fusion : tout ce qui désigne la fiche source passe sur la fiche gardée. Les colonnes viennent des clés étrangères
 * vers persons (toutes les tables, y compris celles ajoutées plus tard) et des colonnes « person_id » sans clé étrangère.
 * Une ligne qui ferait doublon (même voyage, même branche…) est laissée et part avec la fiche source.
 */
function merge_person_references(PDO $pdo,int $target,int $source): void
{
    $tables=$pdo->query("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll();
    $noFk=['living_contacts'=>['person_id'],'event_witnesses'=>['person_id'],'media_tags'=>['person_id'],'investigation_persons'=>['person_id'],'person_online_sheets'=>['person_id'],'grave_persons'=>['person_id'],'items'=>['person_id'],'person_profiles'=>['person_id']]; // 🎨 items : fiches du moteur (lib/art_engine.php ; remplace artist_items)
    foreach($tables as $t){
        $table=(string)$t['name'];
        if($table==='persons'||stripos((string)$t['sql'],'VIRTUAL TABLE')!==false||str_starts_with($table,'person_search'))continue;
        $cols=[];
        foreach($pdo->query('PRAGMA foreign_key_list("'.str_replace('"','""',$table).'")')->fetchAll() as $fk)if($fk['table']==='persons')$cols[]=(string)$fk['from'];
        $cols=array_values(array_unique(array_merge($cols,$noFk[$table]??[])));
        foreach($cols as $col){
            $q='"'.str_replace('"','""',$table).'"';$c='"'.str_replace('"','""',$col).'"';
            $pdo->prepare("UPDATE OR IGNORE {$q} SET {$c}=? WHERE {$c}=?")->execute([$target,$source]);
            if(isset($noFk[$table]))$pdo->prepare("DELETE FROM {$q} WHERE {$c}=?")->execute([$source]); // doublons restés (pas de cascade)
        }
    }
    foreach(['notes','media_links','source_links'] as $table)$pdo->prepare("UPDATE {$table} SET entity_id=? WHERE entity_type='person' AND entity_id=?")->execute([$target,$source]);
    // Étiquettes et photos des blocs rangés sous le numéro de la personne (fiche, poilu, résistant, cartes d'électeur)
    $pdo->prepare("UPDATE OR IGNORE label_links SET entity_id=? WHERE entity_type IN ('person','poilu','resistance','voter') AND entity_id=?")->execute([$target,$source]);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type IN ('person','poilu','resistance','voter') AND entity_id=?")->execute([$source]);
    $pdo->prepare("UPDATE OR IGNORE family_collection_media SET collection_id=? WHERE collection_type IN ('poilu','resistance','voter') AND collection_id=?")->execute([$target,$source]);
    $pdo->prepare('UPDATE hypotheses SET related_person_id=? WHERE related_person_id=?')->execute([$target,$source]);
}

/**
 * Après une fusion, deux familles du même couple (la fiche gardée et le même conjoint) n'en font plus qu'une :
 * enfants, événements, notes, sources et médias passent sur la plus ancienne. Une personne ne peut pas être son
 * propre enfant (les deux fiches étaient parent et enfant l'une de l'autre).
 */
function merge_duplicate_couples(PDO $pdo,int $personId): void
{
    $pdo->prepare('DELETE FROM family_children WHERE child_id=? AND family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)')->execute([$personId,$personId,$personId]);
    $fams=$pdo->prepare('SELECT id,partner1_id,partner2_id FROM families WHERE partner1_id=? OR partner2_id=? ORDER BY id');$fams->execute([$personId,$personId]);
    $keep=[];
    foreach($fams->fetchAll() as $f){
        $other=(int)$f['partner1_id']===$personId?(int)$f['partner2_id']:(int)$f['partner1_id'];
        if(!$other)continue; // famille sans conjoint connu : on ne devine pas
        if(!isset($keep[$other])){$keep[$other]=(int)$f['id'];continue;}
        $into=$keep[$other];$from=(int)$f['id'];
        $pdo->prepare('UPDATE OR IGNORE family_children SET family_id=? WHERE family_id=?')->execute([$into,$from]);
        $pdo->prepare('DELETE FROM family_children WHERE family_id=?')->execute([$from]);
        $pdo->prepare('UPDATE events SET family_id=? WHERE family_id=?')->execute([$into,$from]);
        foreach(['notes','media_links','source_links','label_links'] as $table)$pdo->prepare("UPDATE OR IGNORE {$table} SET entity_id=? WHERE entity_type='family' AND entity_id=?")->execute([$into,$from]);
        $pdo->prepare('DELETE FROM families WHERE id=?')->execute([$from]);
    }
    $pdo->exec('DELETE FROM family_children WHERE rowid NOT IN (SELECT min(rowid) FROM family_children GROUP BY family_id,child_id)');
}

function convert_deed_to_death(PDO $pdo,array $data): array
{
    $confirm=($data['confirm']??'')==='yes';
    if(!$confirm)throw new RuntimeException('Confirmation requise');
    $deathId=(int)$pdo->query("SELECT id FROM event_types WHERE gedcom_tag='DEAT' ORDER BY id LIMIT 1")->fetchColumn();
    if(!$deathId)throw new RuntimeException('Type Décès introuvable');
    $deedRows=$pdo->query("SELECT e.* FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE lower(t.label)='deed' OR t.gedcom_tag='DEED'")->fetchAll();
    if(!$deedRows)return ['count'=>0];
    $ids=array_map(fn($row)=>(int)$row['id'],$deedRows);
    $marks=implode(',',array_fill(0,count($ids),'?'));
    $pdo->prepare("UPDATE events SET event_type_id=?,updated_at=CURRENT_TIMESTAMP WHERE id IN ($marks)")->execute(array_merge([$deathId],$ids));
    log_change($pdo,'event',null,'bulk-deed-death','Conversion de '.count($ids).' événement(s) Deed en Décès',['ids'=>$ids],['event_type_id'=>$deathId]);
    return ['count'=>count($ids),'ids'=>$ids];
}

function save_investigation(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$wasUpdate=$id>0;$personId=safe_int($data['person_id']??0);$title=safe_text($data['title']??'');$status=safe_text($data['status']??'open');
    if(!$personId||$title==='')throw new RuntimeException('Personne et titre de l’enquête obligatoires');if(!in_array($status,['open','closed','paused'],true))$status='open';
    $values=[$personId,$title,safe_text($data['question']??''),safe_text($data['known_facts']??''),safe_text($data['documents']??''),$status];
    if($id){$values[]=$id;$pdo->prepare('UPDATE investigations SET person_id=?,title=?,question=?,known_facts=?,documents=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute($values);}
    else{$pdo->prepare('INSERT INTO investigations(person_id,title,question,known_facts,documents,status) VALUES(?,?,?,?,?,?)')->execute($values);$id=(int)$pdo->lastInsertId();}
    // Sync personnes liées additionnelles (hors personne principale)
    // Format attendu : additional_persons = "id1:primary,id2:secondary,…"
    $pdo->prepare('DELETE FROM investigation_persons WHERE investigation_id=?')->execute([$id]);
    $rawPersons=safe_text($data['additional_persons']??'');
    if($rawPersons!==''){
        $insert=$pdo->prepare('INSERT OR IGNORE INTO investigation_persons(investigation_id,person_id,role) VALUES(?,?,?)');
        foreach(explode(',',$rawPersons) as $entry){
            $parts=explode(':',$entry,2);$pid=safe_int($parts[0]??0);$role=($parts[1]??'secondary')==='primary'?'primary':'secondary';
            if($pid&&$pid!==$personId)$insert->execute([$id,$pid,$role]);
        }
    }
    $pdo->prepare('DELETE FROM investigation_battues WHERE investigation_id=?')->execute([$id]);
    $rawBattues=safe_text($data['linked_battues']??'');
    if($rawBattues!==''){
        $insertBattue=$pdo->prepare('INSERT OR IGNORE INTO investigation_battues(investigation_id,battue_id) VALUES(?,?)');
        foreach(explode(',',$rawBattues) as $bid){
            $bid=safe_int($bid);
            if($bid)$insertBattue->execute([$id,$bid]);
        }
    }
    log_change($pdo,'investigation',$id,$wasUpdate?'update':'create','Enquête « '.$title.' »');return ['id'=>$id];
}

function delete_investigation(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Enquête manquante');
    $stmt=$pdo->prepare('SELECT * FROM investigations WHERE id=?');
    $stmt->execute([$id]);
    $investigation=$stmt->fetch();
    if(!$investigation)throw new RuntimeException('Enquête introuvable');
    $persons=$pdo->prepare('SELECT * FROM investigation_persons WHERE investigation_id=? ORDER BY id');$persons->execute([$id]);
    $linkedBattues=$pdo->prepare('SELECT * FROM investigation_battues WHERE investigation_id=? ORDER BY id');$linkedBattues->execute([$id]);
    $folders=$pdo->prepare('SELECT * FROM investigation_media_folders WHERE investigation_id=? ORDER BY id');$folders->execute([$id]);
    $items=$pdo->prepare('SELECT * FROM investigation_items WHERE investigation_id=? ORDER BY id');$items->execute([$id]);
    $media=$pdo->prepare('SELECT * FROM investigation_media WHERE investigation_id=? ORDER BY id');$media->execute([$id]);
    $mediaRows=$media->fetchAll();
    $mediaIds=array_map(static fn($row)=>(int)$row['id'],$mediaRows);
    $mediaItemRows=[];
    if($mediaIds){
        $marks=implode(',',array_fill(0,count($mediaIds),'?'));
        $mi=$pdo->prepare("SELECT * FROM investigation_media_items WHERE investigation_media_id IN ($marks) ORDER BY investigation_media_id,investigation_item_id");
        $mi->execute($mediaIds);
        $mediaItemRows=$mi->fetchAll();
    }
    $snapshot=[
        '_restore_kind'=>'investigation_delete',
        'investigation'=>$investigation,
        'persons'=>$persons->fetchAll(),
        'linked_battues'=>$linkedBattues->fetchAll(),
        'folders'=>$folders->fetchAll(),
        'items'=>$items->fetchAll(),
        'media'=>$mediaRows,
        'media_items'=>$mediaItemRows,
    ];
    $itemIds=array_map(static fn($row)=>(int)$row['id'],$snapshot['items']);
    if($mediaIds){
        $marks=implode(',',array_fill(0,count($mediaIds),'?'));
        $pdo->prepare("DELETE FROM investigation_media_items WHERE investigation_media_id IN ($marks)")->execute($mediaIds);
    }
    if($itemIds){
        $marks=implode(',',array_fill(0,count($itemIds),'?'));
        $pdo->prepare("DELETE FROM investigation_media_items WHERE investigation_item_id IN ($marks)")->execute($itemIds);
    }
    $pdo->prepare('DELETE FROM investigation_media WHERE investigation_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM investigation_items WHERE investigation_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM investigation_persons WHERE investigation_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM investigation_battues WHERE investigation_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM investigation_media_folders WHERE investigation_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM investigations WHERE id=?')->execute([$id]);
    log_change($pdo,'investigation',$id,'delete','Suppression de l’enquête « '.($investigation['title']??'#'.$id).' »',$snapshot,null);
    return ['id'=>$id];
}

function archive_digest_ids_from_data(mixed $value): array
{
    $values = is_array($value) ? $value : preg_split('/[,\s]+/', (string)$value);
    $ids = [];
    foreach ($values ?: [] as $candidate) {
        $id = safe_int($candidate);
        if ($id > 0) $ids[$id] = $id;
    }
    return array_values($ids);
}

function validate_archive_digest_ids(PDO $pdo, array $ids): void
{
    foreach ($ids as $id) if (!archive_digest_row($pdo, (int)$id)) throw new RuntimeException('Un suivi de registre choisi n’existe plus.');
}

function replace_item_archive_digests(PDO $pdo, string $table, string $itemColumn, int $itemId, array $ids): void
{
    if (!in_array($table, ['battue_item_archive_digests', 'investigation_item_archive_digests'], true)) throw new RuntimeException('Lien de suivi invalide.');
    $pdo->prepare("DELETE FROM {$table} WHERE {$itemColumn}=?")->execute([$itemId]);
    $stmt = $pdo->prepare("INSERT OR IGNORE INTO {$table}({$itemColumn},archive_digest_id) VALUES(?,?)");
    foreach ($ids as $digestId) $stmt->execute([$itemId, $digestId]);
}

function add_investigation_item(PDO $pdo,array $data): array
{
    $investigationId=safe_int($data['investigation_id']??0);$title=safe_text($data['title']??'');$kind=safe_text($data['kind']??'lead');$status=safe_text($data['status']??'explored');if(!$investigationId||$title==='')throw new RuntimeException('Enquête et intitulé obligatoires');
    if(!in_array($kind,['lead','link','source','document','note','event'],true))$kind='lead';if(!in_array($status,['promising','explored','to_explore_priority','to_explore','closed'],true))$status='explored';
    $url=safe_text($data['url']??'');if($url!==''&&!filter_var($url,FILTER_VALIDATE_URL))throw new RuntimeException('Adresse Internet invalide');
    $reminderMode=safe_text($data['reminder_mode']??'none');if(!in_array($reminderMode,['none','on','before','after'],true))$reminderMode='none';
    $reminderDue=safe_text($data['reminder_due_at']??'');if($reminderMode==='none')$reminderDue='';
    $archiveDigestIds=archive_digest_ids_from_data($data['archive_digest_ids']??($data['archive_digest_id']??''));validate_archive_digest_ids($pdo,$archiveDigestIds);$archiveDigestId=$archiveDigestIds[0]??null;
    $pdo->prepare('INSERT INTO investigation_items(investigation_id,kind,title,url,notes,status,reminder_due_at,reminder_mode,archive_digest_id) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$investigationId,$kind,$title,$url,safe_text($data['notes']??''),$status,$reminderDue,$reminderMode,$archiveDigestId]);$id=(int)$pdo->lastInsertId();replace_item_archive_digests($pdo,'investigation_item_archive_digests','investigation_item_id',$id,$archiveDigestIds);if(array_key_exists('linked_person_ids',$data))replace_investigation_item_persons($pdo,$id,$data['linked_person_ids']);$pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$investigationId]);return ['id'=>$id];
}

/** Personnes liées à une piste (champ « 6,21 » du menu de choix) : table investigation_item_persons, dans l'ordre choisi. */
function ensure_investigation_item_persons(PDO $pdo): void
{
    static $done=false;if($done)return;$done=true;
    $pdo->exec('CREATE TABLE IF NOT EXISTS investigation_item_persons (id INTEGER PRIMARY KEY AUTOINCREMENT, investigation_item_id INTEGER NOT NULL, person_id INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(investigation_item_id) REFERENCES investigation_items(id) ON DELETE CASCADE, FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE CASCADE, UNIQUE(investigation_item_id, person_id))');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_inv_item_persons_person ON investigation_item_persons(person_id)');
}

function replace_investigation_item_persons(PDO $pdo,int $itemId,mixed $raw): void
{
    ensure_investigation_item_persons($pdo);
    $ids=array_values(array_unique(array_filter(array_map('intval',is_array($raw)?$raw:explode(',',(string)$raw)),static fn(int $v): bool=>$v>0)));
    $pdo->prepare('DELETE FROM investigation_item_persons WHERE investigation_item_id=?')->execute([$itemId]);
    $exists=$pdo->prepare('SELECT 1 FROM persons WHERE id=?');$ins=$pdo->prepare('INSERT OR IGNORE INTO investigation_item_persons(investigation_item_id,person_id,position) VALUES(?,?,?)');
    foreach($ids as $i=>$pid){$exists->execute([$pid]);if($exists->fetchColumn())$ins->execute([$itemId,$pid,$i]);}
}

function save_investigation_item(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);if(!$id)throw new RuntimeException('Piste manquante.');
    $before=$pdo->prepare('SELECT * FROM investigation_items WHERE id=?');$before->execute([$id]);$old=$before->fetch();if(!$old)throw new RuntimeException('Piste introuvable.');
    $title=safe_text($data['title']??'');$kind=safe_text($data['kind']??'lead');$status=safe_text($data['status']??'explored');
    if($title==='')throw new RuntimeException('Intitulé obligatoire.');
    if(!in_array($kind,['lead','link','source','document','note','event'],true))$kind='lead';
    if(!in_array($status,['promising','explored','to_explore_priority','to_explore','closed'],true))$status='explored';
    $url=safe_text($data['url']??'');if($url!==''&&!filter_var($url,FILTER_VALIDATE_URL))throw new RuntimeException('Adresse Internet invalide');
    $reminderMode=safe_text($data['reminder_mode']??'none');if(!in_array($reminderMode,['none','on','before','after'],true))$reminderMode='none';
    $reminderDue=safe_text($data['reminder_due_at']??'');if($reminderMode==='none')$reminderDue='';
    $archiveDigestIds=archive_digest_ids_from_data($data['archive_digest_ids']??($data['archive_digest_id']??''));validate_archive_digest_ids($pdo,$archiveDigestIds);$archiveDigestId=$archiveDigestIds[0]??null;
    $pdo->prepare('UPDATE investigation_items SET kind=?,title=?,url=?,notes=?,status=?,reminder_due_at=?,reminder_mode=?,archive_digest_id=? WHERE id=?')->execute([$kind,$title,$url,safe_text($data['notes']??''),$status,$reminderDue,$reminderMode,$archiveDigestId,$id]);
    replace_item_archive_digests($pdo,'investigation_item_archive_digests','investigation_item_id',$id,$archiveDigestIds);
    replace_investigation_item_persons($pdo,$id,$data['linked_person_ids']??''); // le formulaire n'envoie rien quand on a tout retiré
    if(!empty($old['investigation_id']))$pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int)$old['investigation_id']]);
    log_change($pdo,'investigation_item',$id,'update','Piste modifiée : '.$title,$old,['id'=>$id,'title'=>$title,'status'=>$status,'reminder_due_at'=>$reminderDue,'reminder_mode'=>$reminderMode]);
    return ['id'=>$id,'investigation_id'=>(int)($old['investigation_id']??0)];
}

function set_investigation_item_reminder_done(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Rappel manquant.');
    $done=!empty($data['done'])?1:0;
    $before=$pdo->prepare('SELECT * FROM investigation_items WHERE id=?');
    $before->execute([$id]);
    $old=$before->fetch();
    if(!$old)throw new RuntimeException('Piste introuvable.');
    if(($old['reminder_mode']??'none')==='none'||($old['reminder_due_at']??'')==='')throw new RuntimeException('Cette piste n’a pas de rappel.');
    $doneAt=$done?date('Y-m-d H:i:s'):'';
    $pdo->prepare('UPDATE investigation_items SET reminder_done=?,reminder_done_at=? WHERE id=?')->execute([$done,$doneAt,$id]);
    if(!empty($old['investigation_id']))$pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int)$old['investigation_id']]);
    log_change($pdo,'investigation_item',$id,'update',($done?'Rappel fait : ':'Rappel remis à faire : ').($old['title']??'#'.$id),$old,['id'=>$id,'reminder_done'=>$done,'reminder_done_at'=>$doneAt]);
    return ['id'=>$id,'investigation_id'=>(int)($old['investigation_id']??0),'reminder_done'=>$done,'reminder_done_at'=>$doneAt];
}

function update_investigation_item_reminder(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Rappel manquant.');
    $before=$pdo->prepare('SELECT * FROM investigation_items WHERE id=?');
    $before->execute([$id]);
    $old=$before->fetch();
    if(!$old)throw new RuntimeException('Piste introuvable.');
    $mode=safe_text($data['reminder_mode']??'on');
    if(!in_array($mode,['on','before','after'],true))$mode='on';
    $due=safe_text($data['reminder_due_at']??'');
    if($due==='')throw new RuntimeException('Date du rappel obligatoire.');
    $pdo->prepare('UPDATE investigation_items SET reminder_mode=?,reminder_due_at=? WHERE id=?')->execute([$mode,$due,$id]);
    if(!empty($old['investigation_id']))$pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int)$old['investigation_id']]);
    log_change($pdo,'investigation_item',$id,'update','Rappel modifié : '.($old['title']??'#'.$id),$old,['id'=>$id,'reminder_mode'=>$mode,'reminder_due_at'=>$due]);
    return ['id'=>$id,'investigation_id'=>(int)($old['investigation_id']??0),'reminder_mode'=>$mode,'reminder_due_at'=>$due];
}

function clear_investigation_item_reminder(PDO $pdo,array $data): array
{
    // Retire uniquement le rappel d'une piste (date/échéance/état), sans supprimer
    // la piste elle-même (titre, notes, statut, lien, etc. restent intacts).
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Rappel manquant.');
    $before=$pdo->prepare('SELECT * FROM investigation_items WHERE id=?');
    $before->execute([$id]);
    $old=$before->fetch();
    if(!$old)throw new RuntimeException('Piste introuvable.');
    $pdo->prepare("UPDATE investigation_items SET reminder_mode='none',reminder_due_at='',reminder_done=0,reminder_done_at='' WHERE id=?")->execute([$id]);
    if(!empty($old['investigation_id']))$pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int)$old['investigation_id']]);
    log_change($pdo,'investigation_item',$id,'update','Rappel supprimé : '.($old['title']??'#'.$id),$old,['id'=>$id,'reminder_mode'=>'none','reminder_due_at'=>'']);
    return ['id'=>$id,'investigation_id'=>(int)($old['investigation_id']??0)];
}

function standalone_reminder_categories(): array
{
    return [
        'chercher_acte' => 'Chercher un acte',
        'commander_acte' => 'Commander un acte',
        'attente_reception_acte' => "Attente de la réception d'un acte",
        'fin_abonnement' => "Fin d'abonnement",
        'prendre_abonnement' => 'Prendre un abonnement',
        'se_desabonner' => 'Se désabonner',
        'acheter_revue' => 'Acheter une revue',
        'emprunter_revue' => 'Emprunter une revue',
        'consulter_revue' => 'Consulter une revue',
        'acheter_livre' => 'Acheter un livre',
        'retrouver_livre' => 'Retrouver un livre',
        'prendre_livre_bibliotheque' => 'Prendre un livre à la bibliothèque',
        'rendre_livre_bibliotheque' => 'Rendre le livre à la bibliothèque',
        'rendre_livre' => 'Rendre livre',
        'chercher_internet' => 'Chercher sur internet',
        'continuer_recherche_internet' => 'Continuer la recherche sur internet',
        'analyser_document' => 'Analyser un document',
        'se_rendre_archives' => 'Se rendre à des archives',
        'se_rendre_endroit' => 'Se rendre à un endroit',
        'autre' => 'Autre',
    ];
}

function save_standalone_reminder(PDO $pdo,array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = safe_text($data['title'] ?? '');
    $notes = safe_text($data['notes'] ?? '');
    $mode = safe_text($data['reminder_mode'] ?? 'on');
    $due = safe_text($data['reminder_due_at'] ?? '');
    $category = safe_text($data['reminder_category'] ?? '');
    if ($title === '') throw new RuntimeException('Titre du rappel obligatoire.');
    if (!in_array($mode, ['on', 'before', 'after'], true)) $mode = 'on';
    if ($due === '') throw new RuntimeException('Date du rappel obligatoire.');
    if (!array_key_exists($category, standalone_reminder_categories())) $category = '';
    if ($id) {
        $before = $pdo->prepare('SELECT * FROM standalone_reminders WHERE id=?');
        $before->execute([$id]);
        $old = $before->fetch();
        if (!$old) throw new RuntimeException('Rappel introuvable.');
        $pdo->prepare('UPDATE standalone_reminders SET title=?,notes=?,reminder_mode=?,reminder_due_at=?,reminder_category=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$title,$notes,$mode,$due,$category,$id]);
        log_change($pdo,'standalone_reminder',$id,'update','Rappel modifié : '.$title,$old,['id'=>$id,'title'=>$title,'reminder_mode'=>$mode,'reminder_due_at'=>$due,'reminder_category'=>$category]);
    } else {
        $pdo->prepare('INSERT INTO standalone_reminders(title,notes,reminder_mode,reminder_due_at,reminder_category) VALUES(?,?,?,?,?)')->execute([$title,$notes,$mode,$due,$category]);
        $id = (int)$pdo->lastInsertId();
        log_change($pdo,'standalone_reminder',$id,'create','Rappel ajouté : '.$title,null,['id'=>$id,'title'=>$title,'reminder_mode'=>$mode,'reminder_due_at'=>$due,'reminder_category'=>$category]);
    }
    return ['id'=>$id];
}

function delete_standalone_reminder(PDO $pdo,array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if (!$id) throw new RuntimeException('Rappel manquant.');
    $stmt = $pdo->prepare('SELECT * FROM standalone_reminders WHERE id=?');
    $stmt->execute([$id]);
    $old = $stmt->fetch();
    if (!$old) throw new RuntimeException('Rappel introuvable.');
    $pdo->prepare('DELETE FROM standalone_reminders WHERE id=?')->execute([$id]);
    log_change($pdo,'standalone_reminder',$id,'delete','Rappel supprimé : '.($old['title'] ?? '#'.$id),$old,null);
    return ['id'=>$id];
}

function research_budget_categories(): array
{
    return [
        'acte_payant' => 'Acte payant',
        'abonnement' => 'Abonnement',
        'deplacement_archives' => 'Déplacement aux archives',
        'revue_livre' => 'Revue / livre',
        'materiel' => 'Matériel',
        'autre' => 'Autre',
    ];
}

function save_research_budget_item(PDO $pdo,array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = safe_text($data['title'] ?? '');
    $category = safe_text($data['category'] ?? 'autre');
    $amount = (float)str_replace(',', '.', (string)($data['amount'] ?? 0));
    $currency = strtoupper(substr(safe_text($data['currency'] ?? 'EUR'), 0, 8)) ?: 'EUR';
    $expenseDate = safe_text($data['expense_date'] ?? '');
    $renewalDate = safe_text($data['renewal_date'] ?? '');
    $vendor = safe_text($data['vendor'] ?? '');
    $notes = safe_text($data['notes'] ?? '');
    if ($title === '') throw new RuntimeException('Titre de budget obligatoire.');
    if (!array_key_exists($category, research_budget_categories())) $category = 'autre';
    if ($amount < 0) $amount = 0;
    if ($id) {
        $stmt = $pdo->prepare('SELECT * FROM research_budget WHERE id=?');
        $stmt->execute([$id]);
        $old = $stmt->fetch();
        if (!$old) throw new RuntimeException('Ligne de budget introuvable.');
        $pdo->prepare('UPDATE research_budget SET title=?,category=?,amount=?,currency=?,expense_date=?,renewal_date=?,vendor=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$title,$category,$amount,$currency,$expenseDate,$renewalDate,$vendor,$notes,$id]);
        log_change($pdo,'research_budget',$id,'update','Budget modifié : '.$title,$old,['id'=>$id,'title'=>$title,'category'=>$category,'amount'=>$amount,'currency'=>$currency,'expense_date'=>$expenseDate,'renewal_date'=>$renewalDate,'vendor'=>$vendor,'notes'=>$notes]);
    } else {
        $pdo->prepare('INSERT INTO research_budget(title,category,amount,currency,expense_date,renewal_date,vendor,notes) VALUES(?,?,?,?,?,?,?,?)')
            ->execute([$title,$category,$amount,$currency,$expenseDate,$renewalDate,$vendor,$notes]);
        $id = (int)$pdo->lastInsertId();
        log_change($pdo,'research_budget',$id,'create','Budget ajouté : '.$title,null,['id'=>$id,'title'=>$title,'category'=>$category,'amount'=>$amount,'currency'=>$currency,'expense_date'=>$expenseDate,'renewal_date'=>$renewalDate,'vendor'=>$vendor,'notes'=>$notes]);
    }
    return ['id'=>$id];
}

function delete_research_budget_item(PDO $pdo,array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if (!$id) throw new RuntimeException('Ligne de budget manquante.');
    $stmt = $pdo->prepare('SELECT * FROM research_budget WHERE id=?');
    $stmt->execute([$id]);
    $old = $stmt->fetch();
    if (!$old) throw new RuntimeException('Ligne de budget introuvable.');
    $pdo->prepare('DELETE FROM research_budget WHERE id=?')->execute([$id]);
    log_change($pdo,'research_budget',$id,'delete','Budget supprimé : '.($old['title'] ?? '#'.$id),$old,null);
    return ['id'=>$id];
}

function courrier_organismes(): array
{
    return [
        'mairie' => 'Mairie',
        'archives' => 'Archives départementales',
        'copies' => 'Service de reproduction / commande de copies',
        'greffe' => 'Greffe / tribunal',
        'notaire' => 'Notaire',
        'autre' => 'Autre organisme',
    ];
}

function courrier_statuts(): array
{
    return [
        'envoye' => 'Envoyé',
        'en_attente' => 'En attente',
        'reponse_recue' => 'Réponse reçue',
    ];
}

// Filtre d'affichage du registre : '' (courriers en cours, non classés "fait"),
// 'fait_utilise' / 'fait_non_utilise' (courriers faits, par sous-catégorie),
// 'fait_tous' (tous les courriers faits, utilisés et non utilisés confondus),
// 'tous' (aucun filtre, tout le registre).
function courrier_where(string $filter, string $like): array
{
    $where = [];
    $params = [];
    if ($like !== '%%') {
        $where[] = "(destinataire LIKE ? OR objet LIKE ? OR notes LIKE ?)";
        array_push($params, $like, $like, $like);
    }
    switch ($filter) {
        case 'fait_utilise':
            $where[] = "fait=1";
            $where[] = "fait_type='utilise'";
            break;
        case 'fait_non_utilise':
            $where[] = "fait=1";
            $where[] = "fait_type='non_utilise'";
            break;
        case 'fait_tous':
            $where[] = "fait=1";
            break;
        case 'tous':
            break;
        default:
            $where[] = "fait=0";
            break;
    }
    return [$where, $params];
}

function courrier_rows(PDO $pdo,string $like,int $limit,int $offset,string $filter=''): array
{
    [$where, $params] = courrier_where($filter, $like);
    $sql = "SELECT * FROM courriers"
        . ($where ? " WHERE ".implode(' AND ', $where) : "")
        . " ORDER BY CASE WHEN fait=0 AND statut<>'reponse_recue' AND relance_date<>'' AND relance_date<=date('now') THEN 0 ELSE 1 END,"
        . " CASE WHEN date_envoi<>'' THEN date_envoi ELSE created_at END DESC, id DESC LIMIT {$limit} OFFSET {$offset}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function courrier_count(PDO $pdo,string $like,string $filter=''): int
{
    [$where, $params] = courrier_where($filter, $like);
    $stmt = $pdo->prepare("SELECT count(*) FROM courriers".($where ? " WHERE ".implode(' AND ', $where) : ""));
    $stmt->execute($params);
    return (int)$stmt->fetchColumn();
}

function courrier_summary(PDO $pdo,string $like): array
{
    [$activeWhere, $activeParams] = courrier_where('', $like);
    $stmt = $pdo->prepare("SELECT count(*) FROM courriers".($activeWhere ? " WHERE ".implode(' AND ', $activeWhere) : ""));
    $stmt->execute($activeParams);
    $active = (int)$stmt->fetchColumn();
    $relanceWhere = $activeWhere;
    $relanceWhere[] = "statut<>'reponse_recue'";
    $relanceWhere[] = "relance_date<>''";
    $relanceWhere[] = "relance_date<=date('now')";
    $stmt = $pdo->prepare("SELECT count(*) FROM courriers WHERE ".implode(' AND ', $relanceWhere));
    $stmt->execute($activeParams);
    $toRelance = (int)$stmt->fetchColumn();
    $waitWhere = $activeWhere;
    $waitWhere[] = "statut='en_attente'";
    $stmt = $pdo->prepare("SELECT count(*) FROM courriers WHERE ".implode(' AND ', $waitWhere));
    $stmt->execute($activeParams);
    $waiting = (int)$stmt->fetchColumn();
    $doneWhere = [];
    $doneParams = [];
    if ($like !== '%%') {
        $doneWhere[] = "(destinataire LIKE ? OR objet LIKE ? OR notes LIKE ?)";
        array_push($doneParams, $like, $like, $like);
    }
    $doneWhere[] = "fait=1";
    $stmt = $pdo->prepare("SELECT count(*) FROM courriers WHERE ".implode(' AND ', $doneWhere));
    $stmt->execute($doneParams);
    $done = (int)$stmt->fetchColumn();
    return ['active'=>$active, 'to_relance'=>$toRelance, 'waiting'=>$waiting, 'done'=>$done];
}

function courrier_compute_relance(string $dateEnvoi,int $delaiJours): string
{
    if ($dateEnvoi === '' || $delaiJours <= 0) return '';
    $ts = strtotime($dateEnvoi);
    if ($ts === false) return '';
    return date('Y-m-d', strtotime('+'.$delaiJours.' days', $ts));
}

function save_courrier(PDO $pdo,array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $organisme = safe_text($data['organisme'] ?? 'mairie');
    if (!array_key_exists($organisme, courrier_organismes())) $organisme = 'autre';
    $destinataire = safe_text($data['destinataire'] ?? '');
    $objet = safe_text($data['objet'] ?? '');
    if ($destinataire === '') throw new RuntimeException('Le destinataire (mairie, archives, greffe…) est obligatoire.');
    if ($objet === '') throw new RuntimeException('L’objet du courrier est obligatoire.');
    $dateEnvoi = safe_text($data['date_envoi'] ?? '');
    $statut = safe_text($data['statut'] ?? 'envoye');
    if (!array_key_exists($statut, courrier_statuts())) $statut = 'envoye';
    $delai = safe_int($data['relance_delai_jours'] ?? 30);
    if ($delai < 0) $delai = 0;
    if ($delai > 3650) $delai = 3650;
    $relanceDate = $statut === 'reponse_recue' ? '' : courrier_compute_relance($dateEnvoi, $delai);
    $fait = !empty($data['fait']) ? 1 : 0;
    $faitType = safe_text($data['fait_type'] ?? '');
    if (!in_array($faitType, ['utilise', 'non_utilise'], true)) $faitType = 'utilise';
    if (!$fait) $faitType = '';
    $notes = safe_text($data['notes'] ?? '');
    $copyOrderJson = safe_text($data['copy_order_json'] ?? '');
    if ($copyOrderJson !== '') {
        $copyOrder = json_decode($copyOrderJson, true);
        if (!is_array($copyOrder)) $copyOrderJson = '';
    }
    if ($id) {
        $stmt = $pdo->prepare('SELECT * FROM courriers WHERE id=?');
        $stmt->execute([$id]);
        $old = $stmt->fetch();
        if (!$old) throw new RuntimeException('Courrier introuvable.');
        $pdo->prepare('UPDATE courriers SET organisme=?,destinataire=?,objet=?,date_envoi=?,statut=?,relance_delai_jours=?,relance_date=?,fait=?,fait_type=?,notes=?,copy_order_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$organisme,$destinataire,$objet,$dateEnvoi,$statut,$delai,$relanceDate,$fait,$faitType,$notes,$copyOrderJson,$id]);
        log_change($pdo,'courrier',$id,'update','Courrier modifié : '.$destinataire.' — '.$objet,$old,['id'=>$id,'organisme'=>$organisme,'destinataire'=>$destinataire,'objet'=>$objet,'date_envoi'=>$dateEnvoi,'statut'=>$statut,'relance_delai_jours'=>$delai,'relance_date'=>$relanceDate,'fait'=>$fait,'fait_type'=>$faitType,'notes'=>$notes,'copy_order_json'=>$copyOrderJson]);
    } else {
        $pdo->prepare('INSERT INTO courriers(organisme,destinataire,objet,date_envoi,statut,relance_delai_jours,relance_date,fait,fait_type,notes,copy_order_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$organisme,$destinataire,$objet,$dateEnvoi,$statut,$delai,$relanceDate,$fait,$faitType,$notes,$copyOrderJson]);
        $id = (int)$pdo->lastInsertId();
        log_change($pdo,'courrier',$id,'create','Courrier ajouté : '.$destinataire.' — '.$objet,null,['id'=>$id,'organisme'=>$organisme,'destinataire'=>$destinataire,'objet'=>$objet,'date_envoi'=>$dateEnvoi,'statut'=>$statut,'relance_delai_jours'=>$delai,'relance_date'=>$relanceDate,'fait'=>$fait,'fait_type'=>$faitType,'notes'=>$notes,'copy_order_json'=>$copyOrderJson]);
    }
    return ['id'=>$id];
}

function delete_courrier(PDO $pdo,array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if (!$id) throw new RuntimeException('Courrier manquant.');
    $stmt = $pdo->prepare('SELECT * FROM courriers WHERE id=?');
    $stmt->execute([$id]);
    $old = $stmt->fetch();
    if (!$old) throw new RuntimeException('Courrier introuvable.');
    $pdo->prepare('DELETE FROM courriers WHERE id=?')->execute([$id]);
    log_change($pdo,'courrier',$id,'delete','Courrier supprimé : '.($old['destinataire'] ?? '#'.$id),$old,null);
    return ['id'=>$id];
}

function set_courrier_fait(PDO $pdo,array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if (!$id) throw new RuntimeException('Courrier manquant.');
    $stmt = $pdo->prepare('SELECT * FROM courriers WHERE id=?');
    $stmt->execute([$id]);
    $old = $stmt->fetch();
    if (!$old) throw new RuntimeException('Courrier introuvable.');
    $fait = !empty($data['fait']) ? 1 : 0;
    $faitType = safe_text($data['fait_type'] ?? ($old['fait_type'] ?: 'utilise'));
    if (!in_array($faitType, ['utilise', 'non_utilise'], true)) $faitType = 'utilise';
    if (!$fait) $faitType = '';
    $pdo->prepare('UPDATE courriers SET fait=?,fait_type=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$fait,$faitType,$id]);
    log_change($pdo,'courrier',$id,'update',($fait ? 'Courrier classé dans les faits : ' : 'Courrier remis en cours : ').($old['destinataire'] ?? '#'.$id),$old,['id'=>$id,'fait'=>$fait,'fait_type'=>$faitType]);
    return ['id'=>$id,'fait'=>$fait,'fait_type'=>$faitType];
}

function living_contact_rows(PDO $pdo,string $like,int $limit,int $offset): array
{
    $where='';$params=[];
    if($like!=='%%'){
        $where=' WHERE lc.first_name LIKE ? OR lc.last_name LIKE ? OR lc.relationship LIKE ? OR lc.email LIKE ? OR lc.phone LIKE ? OR lc.phone_mobile LIKE ? OR lc.phone_landline LIKE ? OR lc.address LIKE ? OR lc.postal_code LIKE ? OR lc.city LIKE ? OR lc.country LIKE ? OR lc.notes LIKE ? OR p.first_name LIKE ? OR p.middle_name LIKE ? OR p.last_name LIKE ?';
        $params=array_fill(0,15,$like);
    }
    $stmt=$pdo->prepare("SELECT lc.*,trim(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,'')) AS linked_person_name FROM living_contacts lc LEFT JOIN persons p ON p.id=lc.person_id{$where} ORDER BY lc.last_name COLLATE NOCASE,lc.first_name COLLATE NOCASE,lc.id DESC LIMIT {$limit} OFFSET {$offset}");
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function living_contact_count(PDO $pdo,string $like): int
{
    $where='';$params=[];
    if($like!=='%%'){
        $where=' WHERE lc.first_name LIKE ? OR lc.last_name LIKE ? OR lc.relationship LIKE ? OR lc.email LIKE ? OR lc.phone LIKE ? OR lc.phone_mobile LIKE ? OR lc.phone_landline LIKE ? OR lc.address LIKE ? OR lc.postal_code LIKE ? OR lc.city LIKE ? OR lc.country LIKE ? OR lc.notes LIKE ? OR p.first_name LIKE ? OR p.middle_name LIKE ? OR p.last_name LIKE ?';
        $params=array_fill(0,15,$like);
    }
    $stmt=$pdo->prepare("SELECT count(*) FROM living_contacts lc LEFT JOIN persons p ON p.id=lc.person_id{$where}");$stmt->execute($params);
    return (int)$stmt->fetchColumn();
}

function save_living_contact(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    $firstName=safe_text($data['first_name']??'');$lastName=safe_text($data['last_name']??'');
    if($firstName===''&&$lastName==='')throw new RuntimeException('Indique au moins un prénom ou un nom.');
    $attendance=safe_text($data['attendance_status']??'unknown');
    if(!in_array($attendance,LIVING_CONTACT_ATTENDANCE,true))$attendance='unknown';
    $personId=safe_int($data['person_id']??0);
    if($personId){$person=$pdo->prepare('SELECT id FROM persons WHERE id=?');$person->execute([$personId]);if(!$person->fetch())throw new RuntimeException('La personne liée est introuvable.');}
    $phoneMobile=safe_text($data['phone_mobile']??($data['phone']??''));
    $phoneLandline=safe_text($data['phone_landline']??'');
    $values=[$personId?:null,$firstName,$lastName,safe_text($data['relationship']??''),safe_text($data['email']??''),$phoneMobile,$phoneLandline,safe_text($data['address']??''),safe_text($data['postal_code']??''),safe_text($data['city']??''),safe_text($data['country']??'France'),$attendance,safe_text($data['notes']??'')];
    if($id){
        $stmt=$pdo->prepare('SELECT * FROM living_contacts WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();
        if(!$before)throw new RuntimeException('Contact introuvable.');
        $pdo->prepare('UPDATE living_contacts SET person_id=?,first_name=?,last_name=?,relationship=?,email=?,phone_mobile=?,phone_landline=?,address=?,postal_code=?,city=?,country=?,attendance_status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$values,$id]);
        log_change($pdo,'living_contact',$id,'update','Contact modifié : '.trim($firstName.' '.$lastName),$before,['id'=>$id,'first_name'=>$firstName,'last_name'=>$lastName]);
        return ['id'=>$id];
    }
    $pdo->prepare('INSERT INTO living_contacts(person_id,first_name,last_name,relationship,email,phone_mobile,phone_landline,address,postal_code,city,country,attendance_status,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute($values);
    $id=(int)$pdo->lastInsertId();
    log_change($pdo,'living_contact',$id,'create','Contact ajouté : '.trim($firstName.' '.$lastName),null,['id'=>$id,'first_name'=>$firstName,'last_name'=>$lastName]);
    return ['id'=>$id];
}

function delete_living_contact(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);if(!$id)throw new RuntimeException('Contact manquant.');
    $stmt=$pdo->prepare('SELECT * FROM living_contacts WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();
    if(!$before)throw new RuntimeException('Contact introuvable.');
    $pdo->prepare('DELETE FROM living_contacts WHERE id=?')->execute([$id]);
    log_change($pdo,'living_contact',$id,'delete','Contact supprimé : '.trim(($before['first_name']??'').' '.($before['last_name']??'')),$before,null);
    return ['id'=>$id];
}

function set_reminder_done(PDO $pdo,array $data): array
{
    $source = safe_text($data['source_type'] ?? 'investigation_item');
    if ($source === 'standalone') {
        $id = safe_int($data['id'] ?? 0);
        if (!$id) throw new RuntimeException('Rappel manquant.');
        $done = !empty($data['done']) ? 1 : 0;
        $stmt = $pdo->prepare('SELECT * FROM standalone_reminders WHERE id=?');
        $stmt->execute([$id]);
        $old = $stmt->fetch();
        if (!$old) throw new RuntimeException('Rappel introuvable.');
        $doneAt = $done ? date('Y-m-d H:i:s') : '';
        $pdo->prepare('UPDATE standalone_reminders SET reminder_done=?,reminder_done_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$done,$doneAt,$id]);
        log_change($pdo,'standalone_reminder',$id,'update',($done?'Rappel fait : ':'Rappel remis à faire : ').($old['title']??'#'.$id),$old,['id'=>$id,'reminder_done'=>$done,'reminder_done_at'=>$doneAt]);
        return ['id'=>$id,'source_type'=>'standalone','reminder_done'=>$done,'reminder_done_at'=>$doneAt];
    }
    return set_investigation_item_reminder_done($pdo,$data);
}

function delete_investigation_item(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Piste manquante.');
    $stmt=$pdo->prepare('SELECT * FROM investigation_items WHERE id=?');
    $stmt->execute([$id]);
    $item=$stmt->fetch();
    if(!$item)throw new RuntimeException('Piste introuvable.');
    $mediaItems=$pdo->prepare('SELECT * FROM investigation_media_items WHERE investigation_item_id=? ORDER BY investigation_media_id');
    $mediaItems->execute([$id]);
    $snapshot=[
        '_restore_kind'=>'investigation_item_delete',
        'item'=>$item,
        'media_items'=>$mediaItems->fetchAll(),
    ];
    $pdo->prepare('DELETE FROM investigation_items WHERE id=?')->execute([$id]);
    if(!empty($item['investigation_id']))$pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int)$item['investigation_id']]);
    log_change($pdo,'investigation_item',$id,'delete','Suppression de la piste « '.($item['title']??'#'.$id).' »',$snapshot,null);
    return ['id'=>$id,'investigation_id'=>(int)($item['investigation_id']??0)];
}

function battue_commune_exists(PDO $pdo,string $insee): bool
{
    if($insee==='')return false;
    $stmt=$pdo->prepare('SELECT 1 FROM commune_contours WHERE insee_code=?');
    $stmt->execute([$insee]);
    return (bool)$stmt->fetchColumn();
}

function save_battue(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    $title=safe_text($data['title']??'');
    $targetType=safe_text($data['target_type']??'naissance');
    $targetText=safe_text($data['target_text']??'');
    $startInsee=safe_text($data['start_insee_code']??'');
    $maxLevel=max(0,min(10,safe_int($data['max_level']??2)));
    $status=safe_text($data['status']??'open');
    if($title===''||$startInsee==='')throw new RuntimeException('Titre et commune de départ obligatoires.');
    if(!isset(battue_target_types()[$targetType]))$targetType='autre';
    if(!in_array($status,['open','paused','closed'],true))$status='open';
    if(!battue_commune_exists($pdo,$startInsee))throw new RuntimeException('Commune de départ introuvable dans les contours.');
    $values=[$title,$targetType,$targetText,$startInsee,$maxLevel,$status,safe_text($data['notes']??'')];
    if($id){
        $before=$pdo->prepare('SELECT * FROM battues WHERE id=?');
        $before->execute([$id]);
        $old=$before->fetch();
        if(!$old)throw new RuntimeException('Battue introuvable.');
        $pdo->prepare('UPDATE battues SET title=?,target_type=?,target_text=?,start_insee_code=?,max_level=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$values,$id]);
        log_change($pdo,'battue',$id,'update','Battue modifiée : '.$title,$old,['id'=>$id,'title'=>$title]);
    }else{
        $pdo->prepare('INSERT INTO battues(title,target_type,target_text,start_insee_code,max_level,status,notes) VALUES(?,?,?,?,?,?,?)')->execute($values);
        $id=(int)$pdo->lastInsertId();
        log_change($pdo,'battue',$id,'create','Battue créée : '.$title);
    }
    $pdo->prepare('DELETE FROM battue_persons WHERE battue_id=?')->execute([$id]);
    $rawPersons=safe_text($data['linked_persons']??'');
    if($rawPersons!==''){
        $insert=$pdo->prepare('INSERT OR IGNORE INTO battue_persons(battue_id,person_id,role) VALUES(?,?,?)');
        foreach(explode(',',$rawPersons) as $entry){
            $parts=explode(':',$entry,2);
            $pid=safe_int($parts[0]??0);
            $role=($parts[1]??'secondary')==='secondary'?'secondary':'primary';
            if($pid)$insert->execute([$id,$pid,$role]);
        }
    }
    $pdo->prepare('DELETE FROM investigation_battues WHERE battue_id=?')->execute([$id]);
    $rawInvestigations=safe_text($data['linked_investigations']??'');
    if($rawInvestigations!==''){
        $insertInvestigation=$pdo->prepare('INSERT OR IGNORE INTO investigation_battues(investigation_id,battue_id) VALUES(?,?)');
        foreach(explode(',',$rawInvestigations) as $iid){
            $iid=safe_int($iid);
            if($iid)$insertInvestigation->execute([$iid,$id]);
        }
    }
    return ['id'=>$id];
}

function delete_battue(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Battue manquante.');
    $before=$pdo->prepare('SELECT * FROM battues WHERE id=?');
    $before->execute([$id]);
    $old=$before->fetch();
    if(!$old)throw new RuntimeException('Battue introuvable.');
    $persons=$pdo->prepare('SELECT * FROM battue_persons WHERE battue_id=? ORDER BY id');$persons->execute([$id]);
    $linkedInvestigations=$pdo->prepare('SELECT * FROM investigation_battues WHERE battue_id=? ORDER BY id');$linkedInvestigations->execute([$id]);
    $aliases=$pdo->prepare('SELECT * FROM battue_commune_aliases WHERE battue_id=? ORDER BY id');$aliases->execute([$id]);
    $items=$pdo->prepare('SELECT * FROM battue_search_items WHERE battue_id=? ORDER BY id');$items->execute([$id]);
    $itemRows=$items->fetchAll();
    $statuses=$pdo->prepare('SELECT * FROM battue_commune_statuses WHERE battue_id=? ORDER BY insee_code');$statuses->execute([$id]);
    $mediaRows=[];
    $itemIds=array_map(static fn($row)=>(int)$row['id'],$itemRows);
    if($itemIds){
        $marks=implode(',',array_fill(0,count($itemIds),'?'));
        $mediaLinks=$pdo->prepare("SELECT * FROM media_links WHERE entity_type='battue_item' AND entity_id IN ($marks) ORDER BY id");
        $mediaLinks->execute($itemIds);
        $mediaRows=$mediaLinks->fetchAll();
        $pdo->prepare("DELETE FROM media_links WHERE entity_type='battue_item' AND entity_id IN ($marks)")->execute($itemIds);
    }
    $snapshot=[
        '_restore_kind'=>'battue_delete',
        'battue'=>$old,
        'persons'=>$persons->fetchAll(),
        'linked_investigations'=>$linkedInvestigations->fetchAll(),
        'aliases'=>$aliases->fetchAll(),
        'items'=>$itemRows,
        'statuses'=>$statuses->fetchAll(),
        'media_links'=>$mediaRows,
    ];
    $pdo->prepare('DELETE FROM battue_persons WHERE battue_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM investigation_battues WHERE battue_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM battue_commune_statuses WHERE battue_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM battue_search_items WHERE battue_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM battue_commune_aliases WHERE battue_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM battues WHERE id=?')->execute([$id]);
    log_change($pdo,'battue',$id,'delete','Battue supprimée : '.($old['title']??''),$snapshot,null);
    return ['id'=>$id];
}

function save_battue_alias(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    $battueId=safe_int($data['battue_id']??0);
    $insee=safe_text($data['insee_code']??'');
    $name=safe_text($data['name']??'');
    if(!$battueId||$insee===''||$name==='')throw new RuntimeException('Battue, commune et nom obligatoires.');
    if(!battue_commune_exists($pdo,$insee))throw new RuntimeException('Commune introuvable.');
    if($id){
        $pdo->prepare('UPDATE battue_commune_aliases SET battue_id=?,insee_code=?,name=?,note=? WHERE id=?')->execute([$battueId,$insee,$name,safe_text($data['note']??''),$id]);
    }else{
        $pdo->prepare('INSERT INTO battue_commune_aliases(battue_id,insee_code,name,note) VALUES(?,?,?,?)')->execute([$battueId,$insee,$name,safe_text($data['note']??'')]);
        $id=(int)$pdo->lastInsertId();
    }
    $pdo->prepare('UPDATE battues SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$battueId]);
    return ['id'=>$id,'battue_id'=>$battueId];
}

function delete_battue_alias(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Commune liée manquante.');
    $stmt=$pdo->prepare('SELECT * FROM battue_commune_aliases WHERE id=?');
    $stmt->execute([$id]);
    $alias=$stmt->fetch();
    if(!$alias)throw new RuntimeException('Commune liée introuvable.');
    $battueId=(int)$alias['battue_id'];
    $items=$pdo->prepare('SELECT id FROM battue_search_items WHERE alias_id=? ORDER BY id');
    $items->execute([$id]);
    $snapshot=[
        '_restore_kind'=>'battue_alias_delete',
        'alias'=>$alias,
        'item_ids'=>array_map('intval',$items->fetchAll(PDO::FETCH_COLUMN)),
    ];
    $pdo->prepare('DELETE FROM battue_commune_aliases WHERE id=?')->execute([$id]);
    if($battueId)$pdo->prepare('UPDATE battues SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$battueId]);
    log_change($pdo,'battue_alias',$id,'delete','Suppression de la commune liée « '.($alias['name']??'#'.$id).' »',$snapshot,null);
    return ['id'=>$id,'battue_id'=>$battueId];
}

function save_battue_search_item(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    $battueId=safe_int($data['battue_id']??0);
    $insee=safe_text($data['insee_code']??'');
    $aliasId=safe_int($data['alias_id']??0)?:null;
    $archiveDigestIds=archive_digest_ids_from_data($data['archive_digest_ids']??($data['archive_digest_id']??''));
    $archiveDigestId=$archiveDigestIds[0]??null;
    $recordType=safe_text($data['record_type']??'naissance');
    $status=safe_text($data['status']??'todo');
    if(!$battueId||$insee==='')throw new RuntimeException('Battue et commune obligatoires.');
    if(!battue_commune_exists($pdo,$insee))throw new RuntimeException('Commune introuvable.');
    if(!isset(battue_target_types()[$recordType]))$recordType='autre';
    if(!isset(battue_search_statuses()[$status]))$status='todo';
    if($aliasId){
        $check=$pdo->prepare('SELECT 1 FROM battue_commune_aliases WHERE id=? AND battue_id=? AND insee_code=?');
        $check->execute([$aliasId,$battueId,$insee]);
        if(!$check->fetchColumn())throw new RuntimeException('Commune liée invalide.');
    }
    validate_archive_digest_ids($pdo,$archiveDigestIds);
    $url=safe_text($data['url']??'');
    if($url!==''&&!filter_var($url,FILTER_VALIDATE_URL))throw new RuntimeException('Adresse Internet invalide.');
    $values=[$battueId,$insee,$aliasId,$recordType,safe_text($data['period']??''),safe_text($data['register']??''),$archiveDigestId,safe_text($data['title']??''),$status,safe_text($data['note']??''),$url];
    if($id){
        $pdo->prepare('UPDATE battue_search_items SET battue_id=?,insee_code=?,alias_id=?,record_type=?,period=?,register=?,archive_digest_id=?,title=?,status=?,note=?,url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$values,$id]);
    }else{
        $pdo->prepare('INSERT INTO battue_search_items(battue_id,insee_code,alias_id,record_type,period,register,archive_digest_id,title,status,note,url) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute($values);
        $id=(int)$pdo->lastInsertId();
    }
    replace_item_archive_digests($pdo,'battue_item_archive_digests','battue_item_id',$id,$archiveDigestIds);
    $pdo->prepare('UPDATE battues SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$battueId]);
    return ['id'=>$id,'battue_id'=>$battueId];
}

function delete_battue_search_item(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Annotation manquante.');
    $stmt=$pdo->prepare('SELECT * FROM battue_search_items WHERE id=?');
    $stmt->execute([$id]);
    $item=$stmt->fetch();
    if(!$item)throw new RuntimeException('Annotation introuvable.');
    $battueId=(int)$item['battue_id'];
    $mediaLinks=$pdo->prepare("SELECT * FROM media_links WHERE entity_type='battue_item' AND entity_id=?");
    $mediaLinks->execute([$id]);
    $snapshot=[
        '_restore_kind'=>'battue_item_delete',
        'item'=>$item,
        'media_links'=>$mediaLinks->fetchAll(),
    ];
    $pdo->prepare("DELETE FROM media_links WHERE entity_type='battue_item' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM battue_search_items WHERE id=?')->execute([$id]);
    if($battueId)$pdo->prepare('UPDATE battues SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$battueId]);
    log_change($pdo,'battue_item',$id,'delete','Suppression de l’annotation de battue « '.($item['title']?:$item['period']?:'#'.$id).' »',$snapshot,null);
    return ['id'=>$id,'battue_id'=>$battueId];
}

function save_battue_commune_status(PDO $pdo,array $data): array
{
    $battueId=safe_int($data['battue_id']??0);
    $insee=safe_text($data['insee_code']??'');
    $status=safe_text($data['status']??'not_started');
    if(!$battueId||$insee==='')throw new RuntimeException('Battue et commune obligatoires.');
    if(!battue_commune_exists($pdo,$insee))throw new RuntimeException('Commune introuvable.');
    if(!isset(battue_commune_statuses()[$status]))$status='not_started';
    $check=$pdo->prepare('SELECT 1 FROM battues WHERE id=?');
    $check->execute([$battueId]);
    if(!$check->fetchColumn())throw new RuntimeException('Battue introuvable.');
    if($status==='not_started'){
        $pdo->prepare('DELETE FROM battue_commune_statuses WHERE battue_id=? AND insee_code=?')->execute([$battueId,$insee]);
    }else{
        $pdo->prepare("INSERT INTO battue_commune_statuses(battue_id,insee_code,status,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(battue_id,insee_code) DO UPDATE SET status=excluded.status,updated_at=CURRENT_TIMESTAMP")->execute([$battueId,$insee,$status]);
    }
    $pdo->prepare('UPDATE battues SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$battueId]);
    return ['battue_id'=>$battueId,'insee_code'=>$insee,'status'=>$status];
}

function sync_investigation_media_items(PDO $pdo,int $linkId,array $itemIds,int $investigationId): void{$pdo->prepare('DELETE FROM investigation_media_items WHERE investigation_media_id=?')->execute([$linkId]);$check=$pdo->prepare('SELECT 1 FROM investigation_items WHERE id=? AND investigation_id=?');$insert=$pdo->prepare('INSERT OR IGNORE INTO investigation_media_items(investigation_media_id,investigation_item_id) VALUES(?,?)');foreach(array_unique(array_map('intval',$itemIds)) as $itemId){if(!$itemId)continue;$check->execute([$itemId,$investigationId]);if($check->fetchColumn())$insert->execute([$linkId,$itemId]);}}
function link_investigation_media(PDO $pdo,array $data): array
{
    $investigationId=safe_int($data['investigation_id']??0);
    $mediaIds=$data['media_ids']??[$data['media_id']??0];
    if(!is_array($mediaIds))$mediaIds=[$mediaIds];
    $verdict=($data['verdict']??'interesting')==='rejected'?'rejected':'interesting';
    if(!$investigationId)throw new RuntimeException('Enquête manquante');
    $folderId=safe_int($data['folder_id']??0)?:null;
    if($folderId){
        $folderCheck=$pdo->prepare('SELECT 1 FROM investigation_media_folders WHERE id=? AND investigation_id=?');
        $folderCheck->execute([$folderId,$investigationId]);
        if(!$folderCheck->fetchColumn())throw new RuntimeException('Dossier introuvable pour cette enquête.');
    }
    $upsert=$pdo->prepare('INSERT INTO investigation_media(investigation_id,media_id,verdict,reason,folder_id) VALUES(?,?,?,?,?)
        ON CONFLICT(investigation_id,media_id) DO UPDATE SET verdict=excluded.verdict,reason=excluded.reason,folder_id=excluded.folder_id');
    $find=$pdo->prepare('SELECT id FROM investigation_media WHERE investigation_id=? AND media_id=?');
    $linked=[];
    foreach(array_unique(array_map('intval',$mediaIds)) as $mediaId){
        if(!$mediaId)continue;
        $upsert->execute([$investigationId,$mediaId,$verdict,safe_text($data['reason']??''),$folderId]);
        $find->execute([$investigationId,$mediaId]);
        $linkId=(int)$find->fetchColumn();
        sync_investigation_media_items($pdo,$linkId,is_array($data['item_ids']??null)?$data['item_ids']:[],$investigationId);
        $linked[]=$mediaId;
    }
    if(!$linked)throw new RuntimeException('Choisis au moins un média');
    return ['investigation_id'=>$investigationId,'media_ids'=>$linked,'folder_id'=>$folderId];
}
function set_investigation_media_items(PDO $pdo,array $data): array{$linkId=safe_int($data['link_id']??0);$stmt=$pdo->prepare('SELECT investigation_id FROM investigation_media WHERE id=?');$stmt->execute([$linkId]);$investigationId=(int)$stmt->fetchColumn();if(!$investigationId)throw new RuntimeException('Média évalué introuvable');sync_investigation_media_items($pdo,$linkId,is_array($data['item_ids']??null)?$data['item_ids']:[],$investigationId);return ['link_id'=>$linkId];}
function unlink_investigation_media(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Média d’enquête manquant.');
    $stmt=$pdo->prepare('SELECT im.*,m.title,m.filename FROM investigation_media im LEFT JOIN media m ON m.id=im.media_id WHERE im.id=?');
    $stmt->execute([$id]);
    $link=$stmt->fetch();
    if(!$link)throw new RuntimeException('Média d’enquête introuvable.');
    $mediaItems=$pdo->prepare('SELECT * FROM investigation_media_items WHERE investigation_media_id=? ORDER BY investigation_item_id');
    $mediaItems->execute([$id]);
    $snapshot=[
        '_restore_kind'=>'investigation_media_delete',
        'media_link'=>$link,
        'media_items'=>$mediaItems->fetchAll(),
    ];
    $pdo->prepare('DELETE FROM investigation_media WHERE id=?')->execute([$id]);
    if(!empty($link['investigation_id']))$pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int)$link['investigation_id']]);
    log_change($pdo,'investigation_media',$id,'delete','Retrait du média d’enquête « '.($link['title']?:$link['filename']?:'#'.$id).' »',$snapshot,null);
    return ['id'=>$id,'investigation_id'=>(int)($link['investigation_id']??0)];
}

function unlink_media_from_investigation_item(PDO $pdo,array $data): array{$linkId=safe_int($data['link_id']??0);$itemId=safe_int($data['item_id']??0);if(!$linkId||!$itemId)throw new RuntimeException('Paramètres manquants');$pdo->prepare('DELETE FROM investigation_media_items WHERE investigation_media_id=? AND investigation_item_id=?')->execute([$linkId,$itemId]);log_change($pdo,'investigation',0,'unlink-media-from-item','Média link_id='.$linkId.' retiré de la piste item_id='.$itemId);return ['link_id'=>$linkId,'item_id'=>$itemId];}
function link_event_to_investigation_item(PDO $pdo,array $data): array
{
    $itemId=safe_int($data['item_id']??0);
    $eventId=safe_int($data['event_id']??0);
    $personLabel=safe_text($data['person_label']??'');
    $before=$pdo->prepare('SELECT * FROM investigation_items WHERE id=?');$before->execute([$itemId]);$old=$before->fetch();
    if(!$old)throw new RuntimeException('Piste introuvable.');
    if(!$eventId)throw new RuntimeException('Événement invalide.');
    $evtStmt=$pdo->prepare('SELECT e.id,e.year,e.date_text,t.label AS type_label,
        trim(COALESCE(p.first_name,\'\')||\' \'||COALESCE(p.last_name,\'\')) AS person_name,
        trim(COALESCE(p1.first_name,\'\')||\' \'||COALESCE(p1.last_name,\'\')) AS partner1_name,
        trim(COALESCE(p2.first_name,\'\')||\' \'||COALESCE(p2.last_name,\'\')) AS partner2_name
        FROM events e JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN persons p ON p.id=e.person_id
        LEFT JOIN families f ON f.id=e.family_id
        LEFT JOIN persons p1 ON p1.id=f.partner1_id
        LEFT JOIN persons p2 ON p2.id=f.partner2_id
        WHERE e.id=?');
    $evtStmt->execute([$eventId]);
    $event=$evtStmt->fetch();
    if(!$event)throw new RuntimeException('Événement introuvable.');
    $label=trim((string)$event['type_label'].' — '.((trim((string)($event['date_text']??''))!=='')?$event['date_text']:((($event['year']??null)!==null&&$event['year']!=='')?$event['year']:'date inconnue')));
    $eventPersonLabel=trim((string)($event['person_name']??''));
    if($eventPersonLabel===''){
        $partners=array_filter([trim((string)($event['partner1_name']??'')),trim((string)($event['partner2_name']??''))]);
        if($partners)$eventPersonLabel=implode(' & ',$partners);
    }
    if($eventPersonLabel==='')$eventPersonLabel=$personLabel;
    if($eventPersonLabel!=='')$label=$eventPersonLabel.' — '.$label;
    $pdo->prepare('UPDATE investigation_items SET linked_event_id=?,linked_event_label=? WHERE id=?')->execute([$eventId,$label,$itemId]);
    $pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$old['investigation_id']]);
    log_change($pdo,'investigation_item',$itemId,'update','Événement lié à la piste « '.($old['title']??'#'.$itemId).' » : '.$label,$old,['id'=>$itemId,'linked_event_id'=>$eventId,'linked_event_label'=>$label]);
    return ['id'=>$itemId,'linked_event_id'=>$eventId,'linked_event_label'=>$label];
}
function unlink_event_from_investigation_item(PDO $pdo,array $data): array
{
    $itemId=safe_int($data['item_id']??0);
    $before=$pdo->prepare('SELECT * FROM investigation_items WHERE id=?');$before->execute([$itemId]);$old=$before->fetch();
    if(!$old)throw new RuntimeException('Piste introuvable.');
    $pdo->prepare('UPDATE investigation_items SET linked_event_id=0,linked_event_label=\'\' WHERE id=?')->execute([$itemId]);
    log_change($pdo,'investigation_item',$itemId,'update','Événement délié de la piste « '.($old['title']??'#'.$itemId).' »',$old,['id'=>$itemId,'linked_event_id'=>0]);
    return ['id'=>$itemId];
}

function save_investigation_media_folder(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    $investigationId=safe_int($data['investigation_id']??0);
    $name=trim(safe_text($data['name']??''));
    if($name==='')throw new RuntimeException('Donne un nom au dossier');
    if($id){
        // Renommage d'un dossier existant : on retrouve son enquête, on ne touche pas au parent ici.
        $stmt=$pdo->prepare('SELECT investigation_id FROM investigation_media_folders WHERE id=?');$stmt->execute([$id]);
        $investigationId=(int)$stmt->fetchColumn();
        if(!$investigationId)throw new RuntimeException('Dossier introuvable');
        $pdo->prepare('UPDATE investigation_media_folders SET name=? WHERE id=?')->execute([$name,$id]);
        return ['id'=>$id,'investigation_id'=>$investigationId];
    }
    if(!$investigationId)throw new RuntimeException('Enquête manquante');
    $parentId=safe_int($data['parent_id']??0)?:null;
    if($parentId){
        // Le dossier parent doit appartenir à la même enquête.
        $stmt=$pdo->prepare('SELECT 1 FROM investigation_media_folders WHERE id=? AND investigation_id=?');
        $stmt->execute([$parentId,$investigationId]);
        if(!$stmt->fetchColumn())throw new RuntimeException('Dossier parent invalide');
    }
    $pdo->prepare('INSERT INTO investigation_media_folders(investigation_id,parent_id,name) VALUES(?,?,?)')->execute([$investigationId,$parentId,$name]);
    return ['id'=>(int)$pdo->lastInsertId(),'investigation_id'=>$investigationId];
}

function delete_investigation_media_folder(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Dossier manquant');
    $stmt=$pdo->prepare('SELECT investigation_id,parent_id FROM investigation_media_folders WHERE id=?');
    $stmt->execute([$id]);
    $folder=$stmt->fetch();
    if(!$folder)throw new RuntimeException('Dossier introuvable');
    $parentId=$folder['parent_id']?:null;
    // On supprime le dossier mais on fait remonter son contenu (médias et sous-dossiers) au niveau parent,
    // pour ne jamais perdre une pièce d'enquête lors de la suppression d'un simple rangement.
    $pdo->prepare('UPDATE investigation_media SET folder_id=? WHERE folder_id=?')->execute([$parentId,$id]);
    $pdo->prepare('UPDATE investigation_media_folders SET parent_id=? WHERE parent_id=?')->execute([$parentId,$id]);
    $pdo->prepare('DELETE FROM investigation_media_folders WHERE id=?')->execute([$id]);
    return ['id'=>$id,'investigation_id'=>(int)$folder['investigation_id']];
}

function move_investigation_media(PDO $pdo,array $data): array
{
    $linkIds=$data['link_ids']??[$data['link_id']??0];
    if(!is_array($linkIds))$linkIds=[$linkIds];
    $linkIds=array_filter(array_unique(array_map('intval',$linkIds)));
    if(!$linkIds)throw new RuntimeException('Choisis au moins un média à déplacer');
    $folderId=safe_int($data['folder_id']??0)?:null;
    $investigationId=0;
    $checkLink=$pdo->prepare('SELECT investigation_id FROM investigation_media WHERE id=?');
    foreach($linkIds as $linkId){
        $checkLink->execute([$linkId]);
        $linkInvestigationId=(int)$checkLink->fetchColumn();
        if(!$linkInvestigationId)throw new RuntimeException('Média évalué introuvable');
        $investigationId=$investigationId?:$linkInvestigationId;
    }
    if($folderId){
        // Le dossier cible doit appartenir à la même enquête que les médias déplacés.
        $stmt=$pdo->prepare('SELECT 1 FROM investigation_media_folders WHERE id=? AND investigation_id=?');
        $stmt->execute([$folderId,$investigationId]);
        if(!$stmt->fetchColumn())throw new RuntimeException('Dossier de destination invalide');
    }
    $update=$pdo->prepare('UPDATE investigation_media SET folder_id=? WHERE id=?');
    foreach($linkIds as $linkId)$update->execute([$folderId,$linkId]);
    return ['link_ids'=>array_values($linkIds),'folder_id'=>$folderId,'investigation_id'=>$investigationId];
}

/** Texte du journal pour un lien ajouté ou retiré, en français et avec les noms. */
function relation_log_text(string $verb, PDO $pdo, int $personId, int $relatedId, string $type): string
{
    $a=person_label_by_id($pdo,$personId);$b=person_label_by_id($pdo,$relatedId);
    if($type==='spouse')return $verb.' du lien de couple entre '.$a.' et '.$b;
    return $verb.' de '.$b.' comme '.($type==='parent'?'parent':'enfant').' de '.$a;
}

function detach_parent_child(PDO $pdo, int $parentId, int $childId): void
{
    $stmt=$pdo->prepare('SELECT f.id,f.partner1_id,f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=CAST(? AS INTEGER) AND (f.partner1_id=CAST(? AS INTEGER) OR f.partner2_id=CAST(? AS INTEGER))');$stmt->execute([$childId,$parentId,$parentId]);
    $families=$stmt->fetchAll();
    if(!$families)throw new RuntimeException(person_label_by_id($pdo,$parentId).' n’est pas parent de '.person_label_by_id($pdo,$childId).' : rien à retirer.');
    foreach($families as $family){
        $other=(int)($family['partner1_id']==$parentId?($family['partner2_id']??0):($family['partner1_id']??0));
        $otherRel=$other?child_relation_to($pdo,$childId,$other):'biological';
        $pdo->prepare('DELETE FROM family_children WHERE family_id=? AND child_id=?')->execute([$family['id'],$childId]);
        // l'autre parent reste parent de l'enfant, dans une famille à lui seul (jamais remis d'office avec le parent retiré)
        if($other){
            ensure_single_parent_child($pdo,$other,$childId);
            $pdo->prepare("UPDATE family_children SET relation_to_partner1=? WHERE child_id=? AND family_id IN (SELECT id FROM families WHERE partner1_id=? AND partner2_id IS NULL)")->execute([$otherRel,$childId,$other]);
        }
        drop_family_if_empty($pdo,(int)$family['id']);
    }
}

function remove_relation(PDO $pdo,array $data): array
{
    $personId=safe_int($data['person_id']??0);$relatedId=safe_int($data['related_id']??0);$type=safe_text($data['relation_type']??'');
    if(!$personId||!$relatedId||!in_array($type,['parent','child','spouse'],true))throw new RuntimeException('Relation incomplète');
    assert_person_unlocked($pdo,$personId);assert_person_unlocked($pdo,$relatedId);
    if($type==='parent')detach_parent_child($pdo,$relatedId,$personId);
    elseif($type==='child')detach_parent_child($pdo,$personId,$relatedId);
    else{
        $stmt=$pdo->prepare('SELECT id,partner1_id,partner2_id FROM families WHERE (partner1_id=CAST(? AS INTEGER) AND partner2_id=CAST(? AS INTEGER)) OR (partner1_id=CAST(? AS INTEGER) AND partner2_id=CAST(? AS INTEGER))');$stmt->execute([$personId,$relatedId,$relatedId,$personId]);
        $families=$stmt->fetchAll();
        if(!$families)throw new RuntimeException(person_label_by_id($pdo,$personId).' et '.person_label_by_id($pdo,$relatedId).' ne sont pas liés comme couple : rien à retirer.');
        // Sûr : on ne retire le lien que s'il n'emporte rien avec lui (mariage, notes, médias, sources, enfants communs).
        foreach($families as $family){
            $fid=(int)$family['id'];$c=family_attachment_counts($pdo,$fid);
            $kids=$pdo->prepare('SELECT child_id FROM family_children WHERE family_id=?');$kids->execute([$fid]);$kidIds=array_map('intval',$kids->fetchAll(PDO::FETCH_COLUMN));
            $parts=[];
            if($c['events']){$t=$pdo->prepare("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=? AND t.gedcom_tag='MARR'");$t->execute([$fid]);$m=(int)$t->fetchColumn();$o=$c['events']-$m;if($m)$parts[]=$m>1?$m.' mariages':'un mariage';if($o)$parts[]=plural_fr($o,'autre événement','autres événements');}
            if($c['sources'])$parts[]=plural_fr($c['sources'],'source','sources');
            if($c['notes'])$parts[]=plural_fr($c['notes'],'note','notes');
            if($c['media'])$parts[]=plural_fr($c['media'],'média','médias');
            if($c['labels'])$parts[]=plural_fr($c['labels'],'étiquette','étiquettes');
            $kids=$kidIds?plural_fr(count($kidIds),'enfant','enfants').' ensemble ('.implode(', ',array_map(fn($k)=>person_label_by_id($pdo,$k),array_slice($kidIds,0,3))).(count($kidIds)>3?'…':'').')':'';
            if($parts||$kids){
                $many=count($parts)>1||($parts&&preg_match('/^(\d+) /',$parts[0],$mm)&&(int)$mm[1]>1);
                $all=$parts;if($kids)$all[]=$kids;
                $last=array_pop($all);$list=$all?implode(', ',$all).' et '.$last:$last;
                $todo=[];
                if($parts)$todo[]=$many?'supprime-les d’abord':'supprime-le d’abord';
                if($kids)$todo[]=count($kidIds)>1?'retire d’abord les liens de parent de ces enfants':'retire d’abord le lien de parent de cet enfant';
                throw new RuntimeException('Ce couple a '.$list.' : '.implode(' et ',$todo).', ou garde le lien.');
            }
        }
        foreach($families as $family)$pdo->prepare('DELETE FROM families WHERE id=?')->execute([$family['id']]);
    }
    log_change($pdo,'person',$personId,'remove-relation',relation_log_text('Retrait',$pdo,$personId,$relatedId,$type));return ['person_id'=>$personId,'related_id'=>$relatedId,'relation_type'=>$type];
}

/** « 1 enfant », « 2 enfants » (0 et 1 au singulier). */
function plural_fr(int $n, string $one, string $many): string
{
    return $n.' '.($n>1?$many:$one);
}

/** Sexe et statut : seulement les valeurs connues (sinon message clair au lieu d'une erreur de la base). */
function validate_person_choices(array $data): void
{
    if(array_key_exists('gender',$data)&&!in_array(safe_text($data['gender']),['male','female','nonbinary','unknown'],true))throw new RuntimeException('Sexe invalide : choisis Homme, Femme, Non binaire ou Inconnu.');
    if(array_key_exists('living_status',$data)&&!in_array(safe_text($data['living_status']),['living','deceased','unknown'],true))throw new RuntimeException('Statut invalide : choisis Vivant, Décédé ou Inconnu.');
}

/** Un nom ou un prénom garde une taille raisonnable (un collage malheureux de 10 000 lettres est refusé avec un message clair) : 200 caractères au plus. */
function assert_person_name_lengths(array $data): void
{
    $max=200;
    $labels=['first_name'=>'Le prénom','middle_name'=>'Le deuxième prénom','last_name'=>'Le nom','prefix'=>'Le titre','suffix'=>'Le suffixe'];
    foreach($labels as $field=>$label){
        if(array_key_exists($field,$data)&&is_scalar($data[$field])&&mb_strlen(trim((string)$data[$field]))>$max){
            throw new RuntimeException($label.' est trop long ('.mb_strlen(trim((string)$data[$field])).' caractères) : '.$max.' au plus. Vérifie ce qui a été collé dans la case.');
        }
    }
}

/** Tailles raisonnables des textes d'un événement (titre 500, autres textes 20 000) et d'une note (titre 500, texte 200 000). */
function assert_text_sizes(string $action, array $data): void
{
    $fmt = static fn(int $n) => number_format($n, 0, ',', ' ');
    $limits = match ($action) {
        'add_event', 'save_event' => ['short' => 500, 'long' => 20000, 'shortKeys' => ['title', 'name', 'label', 'date_text', 'date_alternative'], 'what' => 'de l’événement'],
        'add_note', 'save_note', 'save_research_note' => ['short' => 500, 'long' => 200000, 'shortKeys' => ['title'], 'what' => 'de la note'],
        default => null,
    };
    if (!$limits) return;
    $names = ['title' => 'Le titre', 'body' => 'Le texte', 'description' => 'La description', 'notes' => 'La note', 'date_text' => 'La date', 'name' => 'Le nom', 'label' => 'Le nom'];
    foreach ($data as $key => $value) {
        if (!is_string($key) || !is_string($value) || $key === 'csrf') continue;
        $max = in_array($key, $limits['shortKeys'], true) ? $limits['short'] : $limits['long'];
        $len = mb_strlen($value);
        if ($len > $max) throw new RuntimeException(($names[$key] ?? 'Un des textes') . ' ' . $limits['what'] . ' contient trop de texte (' . $fmt($len) . ' caractères) : ' . $fmt($max) . ' au plus. Coupe-le, ou range le document complet en média.');
    }
}

function save_person(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    validate_person_choices($data);
    assert_person_name_lengths($data);
    if(!$id){
        $first=safe_text($data['first_name']??'');$last=safe_text($data['last_name']??'');
        if($first===''&&$last==='')throw new RuntimeException('Indique au moins un prénom ou un nom');
        $stmt=$pdo->prepare('INSERT INTO persons(first_name,middle_name,last_name,prefix,suffix,gender,living_status,reference_number,surname_group_id,occupation,height_text,physical_description,eye_color,skin_color,nationality,ethnicity,verify_status,outside_genealogy,is_artist,artist_discipline,artist_events_display,show_military_block) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $validDisplaysI=['events','block','both'];$artistDisplayI=in_array($data['artist_events_display']??'',$validDisplaysI,true)?$data['artist_events_display']:'events';
        $stmt->execute([$first,safe_text($data['middle_name']??''),$last,safe_text($data['prefix']??''),safe_text($data['suffix']??''),safe_text($data['gender']??'unknown'),safe_text($data['living_status']??'unknown'),safe_text($data['reference_number']??''),safe_int($data['surname_group_id']??0)?:null,safe_text($data['occupation']??''),safe_text($data['height_text']??''),safe_text($data['physical_description']??''),safe_text($data['eye_color']??''),safe_text($data['skin_color']??''),safe_text($data['nationality']??''),safe_text($data['ethnicity']??''),in_array(($data['verify_status']??'normal'),['normal','verify'],true)?($data['verify_status']??'normal'):'normal',(isset($data['outside_genealogy'])&&$data['outside_genealogy']?1:0),(isset($data['is_artist'])&&$data['is_artist']?1:0),safe_text($data['artist_discipline']??''),$artistDisplayI,(isset($data['show_military_block'])&&$data['show_military_block']?1:0)]);
        $id=(int)$pdo->lastInsertId();
        // un animal : une fiche comme une personne, avec sa fiche d'animal (caractéristiques, pedigree)
        if(($data['kind']??'')==='animal'){$pdo->prepare("UPDATE persons SET kind='animal' WHERE id=?")->execute([$id]);pet_of_person($pdo,$id,true);}
        if(array_key_exists('mort_pour_la_france',$data)){$pdo->prepare('UPDATE persons SET mort_pour_la_france=? WHERE id=?')->execute([safe_text($data['mort_pour_la_france'])?:'unknown',$id]);}$created=$pdo->query('SELECT * FROM persons WHERE id='.$id)->fetch();log_change($pdo,'person',$id,'create','Création de '.full_name($created),null,$created);rebuild_search($pdo,$id);return $created;
    }
    $stmt=$pdo->prepare('SELECT * FROM persons WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();
    if(!$before)throw new RuntimeException('Personne introuvable');
    assert_person_unlocked($pdo,$id);
    // deux onglets : la fiche a-t-elle changé ailleurs depuis l'ouverture de la fenêtre ? (seulement les cases que
    // l'autre fenêtre a changées ET que celle-ci remplacerait ; _force = « Enregistrer quand même »)
    if(!empty($data['_base'])&&empty($data['_force'])){
        $base=is_array($data['_base'])?$data['_base']:(json_decode((string)$data['_base'],true)?:[]);
        $norm=static fn($v)=>trim((string)safe_text(is_scalar($v)?(string)$v:''));
        $changed=[];
        foreach($base as $field=>$was){
            if(!is_string($field)||!array_key_exists($field,$before)||!array_key_exists($field,$data))continue;
            if($norm($before[$field])!==$norm($was)&&$norm($data[$field])!==$norm($before[$field]))$changed[]=$field;
        }
        if($changed)throw new LcndaConflict('Cette fiche a été modifiée dans une autre fenêtre depuis que tu l’as ouverte : recharge-la pour voir les changements (tes modifications ne sont pas perdues : elles restent dans cette fenêtre ; copie-les avant de recharger, ou choisis « Enregistrer quand même » pour remplacer l’autre version).');
    }
    // comme à la création : une fiche garde au moins un prénom ou un nom
    $firstAfter=array_key_exists('first_name',$data)?safe_text($data['first_name']):safe_text($before['first_name']??'');
    $lastAfter=array_key_exists('last_name',$data)?safe_text($data['last_name']):safe_text($before['last_name']??'');
    if($firstAfter===''&&$lastAfter===''&&(safe_text($before['first_name']??'')!==''||safe_text($before['last_name']??'')!==''))throw new RuntimeException('Indique au moins un prénom ou un nom');
    $allowed=['first_name','middle_name','last_name','prefix','suffix','gender','living_status','reference_number','surname_group_id','occupation','height_text','physical_description','eye_color','skin_color','nationality','ethnicity','verify_status','mort_pour_la_france'];
    $set=[];$values=[];
    foreach($allowed as $field)if(array_key_exists($field,$data)){$set[]="$field=?";$values[]=$field==='surname_group_id'?(safe_int($data[$field])?:null):safe_text($data[$field]);}
    $set[]="outside_genealogy=?";$values[]=(isset($data['outside_genealogy'])&&$data['outside_genealogy']?1:0);
    $set[]="is_artist=?";$values[]=(isset($data['is_artist'])&&$data['is_artist']?1:0);
    $set[]="artist_discipline=?";$values[]=safe_text($data['artist_discipline']??'');
    $validDisplays=['events','block','both'];$artistDisplay=in_array($data['artist_events_display']??'',$validDisplays,true)?$data['artist_events_display']:'events';
    $set[]="artist_events_display=?";$values[]=$artistDisplay;
    $set[]="show_military_block=?";$values[]=(isset($data['show_military_block'])&&$data['show_military_block']?1:0);
    // Blocs à afficher sur demande (cases de la fenêtre Identité) : départs, enfant placé, blason, poilu
    foreach(['show_voyage_block','show_placement_block','show_heraldry_block','show_poilu_block','show_language_block','show_resistance_block','show_voter_block'] as $flag)if(array_key_exists('heritage_flags',$data)){$set[]="$flag=?";$values[]=(isset($data[$flag])&&$data[$flag]?1:0);}
    if(!$set)return $before;
    $values[]=$id;$pdo->prepare('UPDATE persons SET '.implode(',',$set).',updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute($values);
    $stmt->execute([$id]);$after=$stmt->fetch();log_change($pdo,'person',$id,'update','Modification de '.full_name($after),$before,$after);
    rebuild_search($pdo,$id);return $after;
}

function delete_person(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    if(!$id)throw new RuntimeException('Personne manquante');
    $stmt=$pdo->prepare('SELECT * FROM persons WHERE id=?');
    $stmt->execute([$id]);
    $person=$stmt->fetch();
    if(!$person)throw new RuntimeException('Personne introuvable');
    assert_person_unlocked($pdo,$id);
    $snapshot=person_delete_snapshot($pdo,$id); // pour pouvoir restaurer la fiche avec tout ce qui en dépend

    $eventIds=$pdo->prepare('SELECT id FROM events WHERE person_id=?');
    $eventIds->execute([$id]);
    $ids=array_map('intval',$eventIds->fetchAll(PDO::FETCH_COLUMN));
    if($ids){
        $placeholders=implode(',',array_fill(0,count($ids),'?'));
        foreach(['media_links','source_links','notes','label_links'] as $table){
            $pdo->prepare("DELETE FROM {$table} WHERE entity_type='event' AND entity_id IN ({$placeholders})")->execute($ids);
        }
    }

    foreach(['media_links','source_links','notes','label_links'] as $table){
        $pdo->prepare("DELETE FROM {$table} WHERE entity_type='person' AND entity_id=?")->execute([$id]);
    }
    if(function_exists('pet_detach_person'))pet_detach_person($pdo,$id); // la fiche d'animal (la liste) reste, avec son nom, ses dates
    if(function_exists('diagram_links_person'))diagram_links_person($pdo,$id,0);
    if(function_exists('dna_links_person'))dna_links_person($pdo,$id,0);
    if(function_exists('periodical_links_person'))periodical_links_person($pdo,$id,0); // revues, livres, documentaires, annonces : le lien s'en va
    $pdo->prepare('UPDATE census_members SET person_id=NULL WHERE person_id=?')->execute([$id]);
    $pdo->prepare('UPDATE archive_digest_people SET person_id=NULL WHERE person_id=?')->execute([$id]);
    $pdo->prepare('UPDATE families SET partner1_id=NULL WHERE partner1_id=?')->execute([$id]);
    $pdo->prepare('UPDATE families SET partner2_id=NULL WHERE partner2_id=?')->execute([$id]);
    $pdo->prepare('UPDATE hypotheses SET related_person_id=NULL WHERE related_person_id=?')->execute([$id]);
    $pdo->prepare('UPDATE branches SET root_person_id=NULL WHERE root_person_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM person_search WHERE person_id=CAST(? AS INTEGER)')->execute([$id]);
    // témoins / parrains (sans clé étrangère) : la fiche comme témoin ailleurs, et les témoins de ses événements (gardés dans l'instantané)
    $pdo->prepare('DELETE FROM event_witnesses WHERE person_id=?')->execute([$id]);
    if($ids)$pdo->prepare('DELETE FROM event_witnesses WHERE event_id IN ('.implode(',',array_fill(0,count($ids),'?')).')')->execute($ids);
    $pdo->prepare('DELETE FROM persons WHERE id=?')->execute([$id]);
    log_change($pdo,'person',$id,'delete','Suppression de '.full_name($person),$person+['_restore_kind'=>'person_delete','_snapshot'=>$snapshot],null);
    return ['id'=>$id];
}

/**
 * Tout ce que la suppression d'une fiche efface ou vide, pour la restaurer : lignes supprimées en cascade (en suivant les
 * clés étrangères ON DELETE CASCADE, de proche en proche : événements, variantes de nom, filiations, enquêtes et leurs
 * pistes…), références vidées (ON DELETE SET NULL et mises à NULL par delete_person : conjoint d'une famille, membre d'un
 * recensement…) et rattachements polymorphes effacés (notes, médias, sources de la fiche et de ses événements).
 */
function person_delete_snapshot(PDO $pdo,int $personId): array
{
    $tables=$pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN);
    $fks=[];
    foreach($tables as $table){foreach($pdo->query('PRAGMA foreign_key_list("'.str_replace('"','""',$table).'")')->fetchAll() as $fk){$fks[(string)$fk['table']][]=['table'=>$table,'column'=>(string)$fk['from'],'on_delete'=>strtoupper((string)$fk['on_delete'])];}}
    $snapshot=['rows'=>[],'nulls'=>[],'links'=>[]];
    $queue=[['persons',[$personId]]];$seen=[];
    while($queue){
        [$parent,$ids]=array_shift($queue);
        if(!$ids)continue;
        foreach($fks[$parent]??[] as $fk){
            $marks=implode(',',array_fill(0,count($ids),'?'));
            $stmt=$pdo->prepare('SELECT * FROM "'.$fk['table'].'" WHERE "'.$fk['column'].'" IN ('.$marks.')');
            $stmt->execute($ids);
            $rows=$stmt->fetchAll(PDO::FETCH_ASSOC);
            if(!$rows)continue;
            if($fk['on_delete']==='CASCADE'){
                $fresh=[];
                foreach($rows as $row){$key=$fk['table'].':'.json_encode($row);if(isset($seen[$key]))continue;$seen[$key]=true;$snapshot['rows'][$fk['table']][]=$row;if(isset($row['id']))$fresh[]=(int)$row['id'];}
                if($fresh)$queue[]=[$fk['table'],$fresh];
            }elseif($fk['on_delete']==='SET NULL'&&isset($rows[0]['id'])){
                foreach($rows as $row)$snapshot['nulls'][]=['table'=>$fk['table'],'column'=>$fk['column'],'id'=>(int)$row['id'],'value'=>$row[$fk['column']]];
            }
        }
    }
    // Références vidées par delete_person lui-même (sans clé étrangère déclarée)
    foreach([['census_members','person_id'],['archive_digest_people','person_id'],['families','partner1_id'],['families','partner2_id'],['hypotheses','related_person_id'],['branches','root_person_id']] as [$table,$column]){
        if(!in_array($table,$tables,true))continue;
        $stmt=$pdo->prepare("SELECT id FROM {$table} WHERE {$column}=?");$stmt->execute([$personId]);
        foreach($stmt->fetchAll(PDO::FETCH_COLUMN) as $rowId)$snapshot['nulls'][]=['table'=>$table,'column'=>$column,'id'=>(int)$rowId,'value'=>$personId];
    }
    // Notes, médias, sources et étiquettes rattachés à la fiche ou à ses événements
    $eventIds=array_map(static fn($row)=>(int)$row['id'],$snapshot['rows']['events']??[]);
    foreach(['media_links','source_links','notes','label_links'] as $table){
        $stmt=$pdo->prepare("SELECT * FROM {$table} WHERE entity_type='person' AND entity_id=?");$stmt->execute([$personId]);
        foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row)$snapshot['links'][$table][]=$row;
        if($eventIds){
            $stmt=$pdo->prepare("SELECT * FROM {$table} WHERE entity_type='event' AND entity_id IN (".implode(',',array_fill(0,count($eventIds),'?')).')');$stmt->execute($eventIds);
            foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row)$snapshot['links'][$table][]=$row;
        }
    }
    // Témoins, parrains, marraines (pas de clé étrangère) : ceux de la fiche ailleurs, et ceux de ses événements
    if(in_array('event_witnesses',$tables,true)){
        $marks=$eventIds?' OR event_id IN ('.implode(',',array_fill(0,count($eventIds),'?')).')':'';
        $stmt=$pdo->prepare("SELECT * FROM event_witnesses WHERE person_id=?{$marks}");$stmt->execute([$personId,...$eventIds]);
        foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row)$snapshot['links']['event_witnesses'][]=$row;
    }
    return $snapshot;
}

function restore_deleted_person(PDO $pdo,array $change,array $before): array
{
    $snapshot=$before['_snapshot']??null;
    if(!is_array($snapshot))throw new RuntimeException('Cette suppression est trop ancienne : elle ne contient pas de quoi restaurer la fiche.');
    $person=array_diff_key($before,['_restore_kind'=>1,'_snapshot'=>1]);
    $personId=safe_int($person['id']??$change['entity_id']??0);
    if(!$personId||record_exists($pdo,'persons',$personId))throw new RuntimeException('Cette fiche existe déjà.');
    $skipped=0;
    $insert=static function(string $table,array $row) use ($pdo,&$skipped): void {
        try{insert_snapshot_row($pdo,$table,$row,true);}catch(Throwable){$skipped++;} // ex. : la famille liée a été supprimée depuis
    };
    // (déjà dans la transaction de l'action d'écriture : tout ou rien)
    {
        if(!empty($person['portrait_media_id'])&&!record_exists($pdo,'media',(int)$person['portrait_media_id']))$person['portrait_media_id']=null;
        if(!empty($person['surname_group_id'])){$stmt=$pdo->prepare('SELECT 1 FROM surname_groups WHERE id=?');$stmt->execute([(int)$person['surname_group_id']]);if(!$stmt->fetchColumn())$person['surname_group_id']=null;}
        insert_snapshot_row($pdo,'persons',$person);
        foreach($snapshot['rows']??[] as $table=>$rows){foreach($rows as $row)$insert((string)$table,$row);}
        foreach($snapshot['nulls']??[] as $ref){
            if(!preg_match('/^[a-z0-9_]+$/',(string)$ref['table'].(string)$ref['column']))continue;
            $pdo->prepare('UPDATE "'.$ref['table'].'" SET "'.$ref['column'].'"=? WHERE id=? AND "'.$ref['column'].'" IS NULL')->execute([$ref['value'],(int)$ref['id']]);
        }
        foreach($snapshot['links']??[] as $table=>$rows){foreach($rows as $row){
            // un témoin dont la fiche ou l'événement n'existe plus n'est pas remis (pas de clé étrangère pour le refuser)
            if($table==='event_witnesses'&&(!record_exists($pdo,'persons',(int)($row['person_id']??0))||!record_exists($pdo,'events',(int)($row['event_id']??0)))){$skipped++;continue;}
            $insert((string)$table,$row);
        }}
    }
    rebuild_search($pdo,$personId);
    log_change($pdo,'person',$personId,'restore','Restauration de la fiche supprimée '.full_name($person),null,['restored_from_change_id'=>(int)$change['id'],'person_id'=>$personId,'skipped'=>$skipped]);
    return ['entity_type'=>'person','entity_id'=>$personId,'skipped'=>$skipped];
}

function add_variant(PDO $pdo,array $data): array
{
    $personId=safe_int($data['person_id']??0);if(!$personId)throw new RuntimeException('Personne manquante');
    if(!person_exists($pdo,$personId))throw new RuntimeException('Personne introuvable : la fiche a peut-être été supprimée.');
    $sourceMediaId=safe_int($data['source_media_id']??0)?:null;
    if($sourceMediaId&&!media_visible_for_person($pdo,$sourceMediaId,$personId))throw new RuntimeException('Cette image source n’est pas liée à la fiche.');
    $stmt=$pdo->prepare('INSERT INTO name_variants(person_id,type,first_name,middle_name,last_name,from_year,to_year,date_text,source_note,source_media_id,position) VALUES(?,?,?,?,?,?,?,?,?,?,(SELECT COALESCE(max(position),0)+1 FROM name_variants WHERE person_id=?))');
    $stmt->execute([$personId,safe_text($data['type']??'variant'),safe_text($data['first_name']??''),safe_text($data['middle_name']??''),safe_text($data['last_name']??''),safe_int($data['from_year']??0)?:null,safe_int($data['to_year']??0)?:null,safe_text($data['date_text']??''),safe_text($data['source_note']??''),$sourceMediaId,$personId]);
    $id=(int)$pdo->lastInsertId();log_change($pdo,'person',$personId,'add-name','Ajout d’une variante de nom');rebuild_search($pdo,$personId);return ['id'=>$id];
}

function update_variant(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);if(!$id)throw new RuntimeException('Variante manquante');
    $sourceMediaId=safe_int($data['source_media_id']??0)?:null;
    $stmt=$pdo->prepare('SELECT * FROM name_variants WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();
    if(!$before)throw new RuntimeException('Variante introuvable');
    if($sourceMediaId&&!media_visible_for_person($pdo,$sourceMediaId,(int)$before['person_id']))throw new RuntimeException('Cette image source n’est pas liée à la fiche.');
    $pdo->prepare('UPDATE name_variants SET first_name=?,middle_name=?,last_name=?,date_text=?,source_note=?,source_media_id=? WHERE id=?')
        ->execute([safe_text($data['first_name']??''),safe_text($data['middle_name']??''),safe_text($data['last_name']??''),safe_text($data['date_text']??''),safe_text($data['source_note']??''),$sourceMediaId,$id]);
    log_change($pdo,'person',(int)$before['person_id'],'update-name','Modification d’une variante de prénom/nom');
    rebuild_search($pdo,(int)$before['person_id']);
    return ['id'=>$id];
}

function delete_variant(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);if(!$id)throw new RuntimeException('Variante manquante');
    $stmt=$pdo->prepare('SELECT * FROM name_variants WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();
    if(!$before)throw new RuntimeException('Variante introuvable');
    $pdo->prepare('DELETE FROM name_variants WHERE id=?')->execute([$id]);
    log_change($pdo,'person',(int)$before['person_id'],'delete-name','Suppression d’une variante de prénom/nom',(array)$before,null);
    rebuild_search($pdo,(int)$before['person_id']);
    return ['id'=>$id];
}

function set_primary_variant(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);if(!$id)throw new RuntimeException('Variante manquante');
    $stmt=$pdo->prepare('SELECT * FROM name_variants WHERE id=?');$stmt->execute([$id]);$variant=$stmt->fetch();
    if(!$variant)throw new RuntimeException('Variante introuvable');
    $personId=(int)$variant['person_id'];
    $pPrepared=$pdo->prepare('SELECT first_name,middle_name,last_name FROM persons WHERE id=?');$pPrepared->execute([$personId]);$person=$pPrepared->fetch();
    if(!$person)throw new RuntimeException('Personne introuvable');
    $pdo->prepare('UPDATE persons SET first_name=?,middle_name=?,last_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
        ->execute([safe_text($variant['first_name']??''),safe_text($variant['middle_name']??''),safe_text($variant['last_name']??''),$personId]);
    $pdo->prepare('UPDATE name_variants SET first_name=?,middle_name=?,last_name=? WHERE id=?')
        ->execute([$person['first_name']??'',$person['middle_name']??'',$person['last_name']??'',$id]);
    log_change($pdo,'person',$personId,'set-primary-name','Changement de prénom/nom principal via variante #'.$id);
    rebuild_search($pdo,$personId);
    return ['id'=>$personId];
}

function add_event_type(PDO $pdo,array $data): array
{
    $label=safe_text($data['label']??'');if($label==='')throw new RuntimeException('Le nom du type est obligatoire');
    $scope=($data['scope']??'person')==='family'?'family':'person';$slug=slug_local($label).'-'.bin2hex(random_bytes(3));
    $stmt=$pdo->prepare('INSERT INTO event_types(scope,slug,label,icon,color,is_custom) VALUES(?,?,?,?,?,1)');$stmt->execute([$scope,$slug,$label,safe_text($data['icon']??'diamond'),safe_text($data['color']??'#0066cc')]);
    return ['id'=>(int)$pdo->lastInsertId(),'label'=>$label,'scope'=>$scope];
}

function event_fact_confidence(array $data,string $fallback='unknown'): string
{
    $value=safe_text($data['fact_confidence']??$fallback);
    return in_array($value,EVENT_FACT_CONFIDENCE_LEVELS,true)?$value:'unknown';
}

// La preuve choisie dans le bloc « Fiabilité du fait » reste un média ordinaire :
// elle est aussi rattachée à l'événement pour être retrouvable depuis Documents.
function link_event_confidence_media(PDO $pdo,int $eventId,?int $mediaId): void
{
    if(!$mediaId)return;
    $media=$pdo->prepare('SELECT id FROM media WHERE id=?');$media->execute([$mediaId]);
    if(!$media->fetchColumn())throw new RuntimeException('Média de preuve introuvable');
    $existing=$pdo->prepare("SELECT 1 FROM media_links WHERE media_id=? AND entity_type='event' AND entity_id=?");$existing->execute([$mediaId,$eventId]);
    if($existing->fetchColumn())return;
    $position=$pdo->prepare("SELECT COALESCE(MAX(position),0)+1 FROM media_links WHERE entity_type='event' AND entity_id=?");$position->execute([$eventId]);
    $pdo->prepare("INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(?,?,?,?)")->execute([$mediaId,'event',$eventId,(int)$position->fetchColumn()]);
}

/**
 * Année d'un événement (pour les tris, les âges, les frises), de l'an 1 à 2099 : « 08/12/1920 » → 1920,
 * « vers 845 » → 845, « 7 mai » → aucune. Une date républicaine (« 15 brumaire an II ») est convertie en
 * grégorien (qm_rep_text_iso) : année 1793 et, si rien n'est noté, « Grégorien : 05/11/1793 » comme équivalent.
 * Rend [année ou null, équivalent].
 */
function event_year_and_converted(string $date, string $converted, string $calendar): array
{
    if ($calendar === 'republican' || preg_match('/\ban\s+[ivx\d]/iu', $date)) {
        $iso = function_exists('qm_rep_text_iso') ? qm_rep_text_iso($date) : null;
        if ($iso) {
            [$y, $mo, $d] = array_map('intval', explode('-', $iso));
            if ($converted === '') $converted = 'Grégorien : ' . sprintf('%02d/%02d/%04d', $d, $mo, $y);
            return [$y, $converted];
        }
    }
    $year = event_year_from_text($date);
    if ($year === null && $converted !== '') $year = event_year_from_text(preg_replace('/^[^:]*:\s*/u', '', $converted) ?? $converted);
    return [$year, $converted];
}

function event_year_from_text(string $text): ?int
{
    $t = ' ' . $text . ' ';
    if (preg_match('/(?<!\d)\d{1,2}[\/.\-]\d{1,2}[\/.\-](\d{1,4})(?!\d)/u', $t, $m)) { $y = (int) $m[1]; return $y >= 1 && $y <= 2099 ? $y : null; }
    if (preg_match('/(?<!\d)(\d{4})[\/.\-]\d{1,2}[\/.\-]\d{1,2}(?!\d)/u', $t, $m)) { $y = (int) $m[1]; return $y >= 1 && $y <= 2099 ? $y : null; }
    if (preg_match('/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/', $t, $m)) return (int) $m[1];
    // les jours devant un mois (« 7 mai », « 1er juin ») ne sont pas des années
    $months = 'janv|f[ée]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[ée]c|jan|feb|mar|apr|may|jun|jul|aug|sep|dec';
    $t = preg_replace('/(?<!\d)\d{1,2}\s*(?:er|e)?\s+(?=(?:' . $months . '))/iu', ' ', $t) ?? $t;
    if (preg_match('/(?<![\d°\/#])(\d{1,3})(?![\d°\/])/u', $t, $m)) { $y = (int) $m[1]; return $y >= 1 ? $y : null; }
    return null;
}

function add_event(PDO $pdo,array $data): array
{
    // Portée de l'événement : 'person' (par défaut, inchangé) ou 'family' (ex: Mariage),
    // rattaché alors à une union (families.id) plutôt qu'à une personne.
    $scope=(($data['event_scope']??'person')==='family')?'family':'person';
    $personId=safe_int($data['person_id']??0);$familyId=safe_int($data['family_id']??0);$typeId=safe_int($data['event_type_id']??0);$date=safe_text($data['date_text']??'');
    if($scope==='family'){
        if(!$familyId||!$typeId)throw new RuntimeException('Famille ou type d’événement manquant');
        $checkFamily=$pdo->prepare('SELECT id FROM families WHERE id=?');$checkFamily->execute([$familyId]);
        if(!$checkFamily->fetch())throw new RuntimeException('Famille introuvable');
        assert_family_unlocked($pdo,$familyId);
    } else {
        if(!$personId||!$typeId)throw new RuntimeException('Personne ou type d’événement manquant');
        if(!person_exists($pdo,$personId))throw new RuntimeException('Personne introuvable : la fiche a peut-être été supprimée.');
        assert_person_unlocked($pdo,$personId);
    }
    if(!record_exists($pdo,'event_types',$typeId))throw new RuntimeException('Type d’événement introuvable : choisis-en un dans la liste.');
    $dateConverted=safe_text($data['date_converted']??'');
    $year=null; // calculée plus bas, une fois le calendrier connu
    $placeId=place_id_from_data($pdo,$data);
    $preciseLat=isset($data['precise_lat'])&&$data['precise_lat']!==''?(float)$data['precise_lat']:null;
    $preciseLon=isset($data['precise_lon'])&&$data['precise_lon']!==''?(float)$data['precise_lon']:null;
    $workFields=work_fields_from_data($pdo,$typeId,$data);
    $dateCalendar=safe_text($data['date_calendar']??'gregorian');
    if(!in_array($dateCalendar,['gregorian','julian','republican','islamic','hebrew'],true))$dateCalendar='gregorian';
    [$year,$dateConverted]=event_year_and_converted($date,$dateConverted,$dateCalendar);
    $factConfidence=event_fact_confidence($data);
    $confidenceOrigin=safe_text($data['confidence_origin']??'');
    $confidenceMediaId=safe_int($data['confidence_media_id']??0)?:null;
    $stmt=$pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,date_calendar,date_converted,date_alternative,year,place_id,title,description,address,extra_info,former_place_name,former_country,precise_lat,precise_lon,first_name,last_name,work_fields,fact_confidence,confidence_origin,confidence_media_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    $stmt->execute([$scope,$scope==='person'?$personId:null,$scope==='family'?$familyId:null,$typeId,$date,$dateCalendar,$dateConverted,safe_text($data['date_alternative']??''),$year,$placeId?:null,safe_text($data['title']??''),safe_text($data['description']??''),safe_text($data['address']??''),safe_text($data['extra_info']??''),safe_text($data['former_place_name']??''),safe_text($data['former_country']??''),$preciseLat,$preciseLon,safe_text($data['first_name']??''),safe_text($data['last_name']??''),$workFields,$factConfidence,$confidenceOrigin,$confidenceMediaId]);
    $id=(int)$pdo->lastInsertId();
    if(array_key_exists('date_uncertain',$data))$pdo->prepare('UPDATE events SET date_uncertain=? WHERE id=?')->execute([!empty($data['date_uncertain'])&&$data['date_uncertain']!=='0'?1:0,$id]);
    link_event_confidence_media($pdo,$id,$confidenceMediaId);
    log_change($pdo,'event',$id,'create',$scope==='family'?'Ajout d’un événement à la famille #'.$familyId:'Ajout d’un événement à la fiche #'.$personId);
    return ['id'=>$id];
}

// Construit le JSON des champs spécifiques d'une œuvre (dimensions, technique, durée…) à partir
// des champs définis sur le type d'événement (event_types.custom_fields) et des valeurs soumises.
// Ne conserve jamais un champ qui n'appartient pas au type sélectionné (ex: pas de "Dimensions" sur un Film).
function work_fields_from_data(PDO $pdo, int $typeId, array $data): string
{
    $stmt = $pdo->prepare('SELECT custom_fields FROM event_types WHERE id=?');
    $stmt->execute([$typeId]);
    $raw = $stmt->fetchColumn();
    $allowedFields = $raw ? (json_decode((string)$raw, true) ?: []) : [];
    if (!$allowedFields) return '';
    $submitted = [];
    if (isset($data['work_fields']) && is_string($data['work_fields']) && $data['work_fields'] !== '') {
        $submitted = json_decode($data['work_fields'], true) ?: [];
    }
    $values = [];
    foreach ($allowedFields as $fieldName) {
        $value = safe_text($submitted[$fieldName] ?? '');
        if ($value !== '') $values[$fieldName] = $value;
    }
    return $values ? json_encode($values, JSON_UNESCAPED_UNICODE) : '';
}

function save_event(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$typeId=safe_int($data['event_type_id']??0);$date=safe_text($data['date_text']??'');
    if(!$id||!$typeId)throw new RuntimeException('Événement ou type manquant');
    $stmt=$pdo->prepare('SELECT * FROM events WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();
    if(!$before)throw new RuntimeException('Événement introuvable');
    assert_event_unlocked($pdo,$id);
    if(!record_exists($pdo,'event_types',$typeId))throw new RuntimeException('Type d’événement introuvable : choisis-en un dans la liste.');
    $dateConverted=safe_text($data['date_converted']??'');
    $year=null; // calculée plus bas, une fois le calendrier connu
    $placeId=place_id_from_data($pdo,$data);
    $preciseLat=isset($data['precise_lat'])&&$data['precise_lat']!==''?(float)$data['precise_lat']:null;
    $preciseLon=isset($data['precise_lon'])&&$data['precise_lon']!==''?(float)$data['precise_lon']:null;
    $workFields=work_fields_from_data($pdo,$typeId,$data);
    $dateCalendar=safe_text($data['date_calendar']??($before['date_calendar']??'gregorian'));
    if(!in_array($dateCalendar,['gregorian','julian','republican','islamic','hebrew'],true))$dateCalendar='gregorian';
    [$year,$dateConverted]=event_year_and_converted($date,$dateConverted,$dateCalendar);
    $dateAlternative=safe_text($data['date_alternative']??'');
    $factConfidence=event_fact_confidence($data,(string)($before['fact_confidence']??'unknown'));
    $confidenceOrigin=safe_text($data['confidence_origin']??($before['confidence_origin']??''));
    $confidenceMediaId=array_key_exists('confidence_media_id',$data)?(safe_int($data['confidence_media_id'])?:null):(safe_int($before['confidence_media_id']??0)?:null);
    // Si precise_lat est explicitement vide (""), on efface ; si absent du payload (non soumis), on conserve
    $clearPrecise=array_key_exists('precise_lat',$data);
    if($clearPrecise){
        $pdo->prepare('UPDATE events SET event_type_id=?,date_text=?,date_calendar=?,date_converted=?,date_alternative=?,year=?,place_id=?,title=?,description=?,address=?,extra_info=?,former_place_name=?,former_country=?,precise_lat=?,precise_lon=?,first_name=?,last_name=?,work_fields=?,fact_confidence=?,confidence_origin=?,confidence_media_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$typeId,$date,$dateCalendar,$dateConverted,$dateAlternative,$year,$placeId?:null,safe_text($data['title']??''),safe_text($data['description']??''),safe_text($data['address']??''),safe_text($data['extra_info']??''),safe_text($data['former_place_name']??''),safe_text($data['former_country']??''),$preciseLat,$preciseLon,safe_text($data['first_name']??''),safe_text($data['last_name']??''),$workFields,$factConfidence,$confidenceOrigin,$confidenceMediaId,$id]);
    } else {
        $pdo->prepare('UPDATE events SET event_type_id=?,date_text=?,date_calendar=?,date_converted=?,date_alternative=?,year=?,place_id=?,title=?,description=?,address=?,extra_info=?,former_place_name=?,former_country=?,first_name=?,last_name=?,work_fields=?,fact_confidence=?,confidence_origin=?,confidence_media_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$typeId,$date,$dateCalendar,$dateConverted,$dateAlternative,$year,$placeId?:null,safe_text($data['title']??''),safe_text($data['description']??''),safe_text($data['address']??''),safe_text($data['extra_info']??''),safe_text($data['former_place_name']??''),safe_text($data['former_country']??''),safe_text($data['first_name']??''),safe_text($data['last_name']??''),$workFields,$factConfidence,$confidenceOrigin,$confidenceMediaId,$id]);
    }
    if(array_key_exists('date_uncertain',$data))$pdo->prepare('UPDATE events SET date_uncertain=? WHERE id=?')->execute([!empty($data['date_uncertain'])&&$data['date_uncertain']!=='0'?1:0,$id]); // « date incertaine » cochée
    link_event_confidence_media($pdo,$id,$confidenceMediaId);
    $stmt->execute([$id]);$after=$stmt->fetch();
    log_change($pdo,'event',$id,'update','Modification de l’événement #'.$id,$before,$after);
    return $after;
}

function delete_event(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);if(!$id)throw new RuntimeException('Événement manquant');
    $stmt=$pdo->prepare('SELECT e.*,t.label AS type_label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.id=?');$stmt->execute([$id]);$before=$stmt->fetch();
    if(!$before)throw new RuntimeException('Événement introuvable');
    assert_event_unlocked($pdo,$id);
    $mediaLinks=$pdo->prepare("SELECT * FROM media_links WHERE entity_type='event' AND entity_id=?");$mediaLinks->execute([$id]);
    $sourceLinks=$pdo->prepare("SELECT * FROM source_links WHERE entity_type='event' AND entity_id=?");$sourceLinks->execute([$id]);
    $notes=$pdo->prepare("SELECT * FROM notes WHERE entity_type='event' AND entity_id=?");$notes->execute([$id]);
    $labelLinks=$pdo->prepare("SELECT * FROM label_links WHERE entity_type='event' AND entity_id=?");$labelLinks->execute([$id]);
    $witnesses=$pdo->prepare('SELECT * FROM event_witnesses WHERE event_id=?');$witnesses->execute([$id]);
    $snapshot=[
        '_restore_kind'=>'event_delete',
        'event'=>$before,
        'media_links'=>$mediaLinks->fetchAll(),
        'source_links'=>$sourceLinks->fetchAll(),
        'notes'=>$notes->fetchAll(),
        'label_links'=>$labelLinks->fetchAll(),
        'witnesses'=>$witnesses->fetchAll(), // témoins, parrains : remis à la restauration
    ];
    $pdo->prepare('DELETE FROM event_witnesses WHERE event_id=?')->execute([$id]);
    $pdo->prepare("DELETE FROM media_links WHERE entity_type='event' AND entity_id=?")->execute([$id]);
    $pdo->prepare("DELETE FROM source_links WHERE entity_type='event' AND entity_id=?")->execute([$id]);
    $pdo->prepare("DELETE FROM notes WHERE entity_type='event' AND entity_id=?")->execute([$id]);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='event' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM events WHERE id=?')->execute([$id]);
    log_change($pdo,'event',$id,'delete','Suppression de l’événement « '.($before['type_label'] ?: '#'.$id).' »',$snapshot,null);
    return ['id'=>$id];
}

function sanitize_online_sheet_checks($raw): string
{
    $checks = is_array($raw) ? $raw : json_decode((string)$raw, true);
    if (!is_array($checks)) return '[]';
    $clean = [];
    foreach ($checks as $check) {
        if (!is_array($check)) continue;
        $field = safe_text($check['field'] ?? '');
        if ($field === '') continue;
        $status = safe_text($check['status'] ?? '');
        if ($status !== '' && !in_array($status, ONLINE_SHEET_CHECK_STATUSES, true)) $status = 'inconnu'; // '' = pas encore vérifié (champ libre gardé tel quel)
        $clean[] = [
            'field' => $field,
            'field_label' => safe_text($check['field_label'] ?? $field),
            'status' => $status,
            'comment' => safe_text($check['comment'] ?? ''),
        ];
    }
    return json_encode($clean, JSON_UNESCAPED_UNICODE);
}

function save_online_sheet(PDO $pdo,array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0);
    $label = safe_text($data['label'] ?? '');
    if (!$personId || $label === '') throw new RuntimeException('Personne ou nom de la fiche manquant');
    $site = safe_text($data['site'] ?? '');
    $url = safe_text($data['url'] ?? '');
    $notes = safe_text($data['notes'] ?? '');
    $checksJson = sanitize_online_sheet_checks($data['checks'] ?? '[]');
    // Capture d'écran de l'arbre : un média déjà envoyé (vide = aucune)
    $shot = safe_int($data['screenshot_media_id'] ?? 0) ?: null;
    if ($shot && !record_exists($pdo, 'media', $shot)) { $shot = null; }
    if ($id) {
        $stmt = $pdo->prepare('SELECT * FROM person_online_sheets WHERE id=?'); $stmt->execute([$id]);
        $before = $stmt->fetch();
        if (!$before) throw new RuntimeException('Fiche en ligne introuvable');
        $pdo->prepare('UPDATE person_online_sheets SET label=?,site=?,url=?,notes=?,checks_json=?,screenshot_media_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$label,$site,$url,$notes,$checksJson,$shot,$id]);
        $stmt->execute([$id]); $after = $stmt->fetch();
        log_change($pdo,'person_online_sheet',$id,'update','Modification de la fiche en ligne « '.$label.' »',$before,$after);
        return $after;
    }
    $stmt = $pdo->prepare('INSERT INTO person_online_sheets(person_id,label,site,url,notes,checks_json,screenshot_media_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)');
    $stmt->execute([$personId,$label,$site,$url,$notes,$checksJson,$shot]);
    $newId = (int)$pdo->lastInsertId();
    log_change($pdo,'person_online_sheet',$newId,'create','Ajout d’une fiche en ligne « '.$label.' » à la fiche #'.$personId);
    $stmt = $pdo->prepare('SELECT * FROM person_online_sheets WHERE id=?'); $stmt->execute([$newId]);
    return $stmt->fetch();
}

function delete_online_sheet(PDO $pdo,array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if (!$id) throw new RuntimeException('Fiche en ligne manquante');
    $stmt = $pdo->prepare('SELECT * FROM person_online_sheets WHERE id=?'); $stmt->execute([$id]);
    $before = $stmt->fetch();
    if (!$before) throw new RuntimeException('Fiche en ligne introuvable');
    $pdo->prepare('DELETE FROM person_online_sheets WHERE id=?')->execute([$id]);
    log_change($pdo,'person_online_sheet',$id,'delete','Suppression de la fiche en ligne « '.$before['label'].' »',$before,null);
    return ['id'=>$id];
}

function add_note(PDO $pdo,array $data): array
{
    $personId=safe_int($data['person_id']??0);$body=safe_text($data['body']??'');if(!$personId||$body==='')throw new RuntimeException('Personne ou contenu manquant');
    if(!person_exists($pdo,$personId))throw new RuntimeException('Personne introuvable : la fiche a peut-être été supprimée.');
    assert_person_unlocked($pdo,$personId);
    $stmt=$pdo->prepare("INSERT INTO notes(entity_type,entity_id,title,body,created_at,updated_at) VALUES('person',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");$stmt->execute([$personId,safe_text($data['title']??''),$body]);$id=(int)$pdo->lastInsertId();log_change($pdo,'note',$id,'create','Ajout d’une note à la fiche #'.$personId);return ['id'=>$id];
}

function save_note(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$body=safe_text($data['body']??'');if(!$id||$body==='')throw new RuntimeException('Note ou contenu manquant');
    $stmt=$pdo->prepare('SELECT * FROM notes WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();
    if(!$before)throw new RuntimeException('Note introuvable');
    if($before['entity_type']==='person')assert_person_unlocked($pdo,(int)$before['entity_id']);
    $pdo->prepare('UPDATE notes SET title=?,body=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([safe_text($data['title']??''),$body,$id]);
    $stmt->execute([$id]);$after=$stmt->fetch();log_change($pdo,'note',$id,'update','Modification de la note #'.$id,$before,$after);return $after;
}

function delete_note(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);if(!$id)throw new RuntimeException('Note manquante');
    $stmt=$pdo->prepare('SELECT * FROM notes WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();
    if(!$before)throw new RuntimeException('Note introuvable');
    if($before['entity_type']==='person')assert_person_unlocked($pdo,(int)$before['entity_id']);
    $labelLinks=$pdo->prepare("SELECT * FROM label_links WHERE entity_type='note' AND entity_id=?");$labelLinks->execute([$id]);
    $snapshot=[
        '_restore_kind'=>'note_delete',
        'note'=>$before,
        'label_links'=>$labelLinks->fetchAll(),
    ];
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='note' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM notes WHERE id=?')->execute([$id]);
    log_change($pdo,'note',$id,'delete','Suppression de la note #'.$id,$snapshot,null);return ['id'=>$id];
}

function add_web_source(PDO $pdo,array $data): array
{
    $personId=safe_int($data['person_id']??0);$title=safe_text($data['title']??'');$url=safe_text($data['url']??'');$type=source_type($data['source_type']??'internet');
    [$entityType,$entityId]=source_target($data,$personId);
    if(!$personId||$title==='')throw new RuntimeException('Personne et titre obligatoires');
    if(!person_exists($pdo,$personId))throw new RuntimeException('Personne introuvable : la fiche a peut-être été supprimée.');
    assert_person_unlocked($pdo,$personId);
    if($entityType==='event'){if(!record_exists($pdo,'events',$entityId))throw new RuntimeException('Événement introuvable');assert_event_unlocked($pdo,$entityId);}
    if($url!==''&&(!filter_var($url,FILTER_VALIDATE_URL)||!in_array(parse_url($url,PHP_URL_SCHEME),['http','https'],true)))throw new RuntimeException('Adresse Internet invalide');
    $stmt=$pdo->prepare('INSERT INTO sources(source_type,title,author,agency,publication,url,text) VALUES(?,?,?,?,?,?,?)');
    $stmt->execute([$type,$title,safe_text($data['author']??''),safe_text($data['website']??''),safe_text($data['accessed_at']??''),$url,safe_text($data['text']??'')]);
    $sourceId=(int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO source_links(entity_type,entity_id,source_record_id,page,note) VALUES(?,?,?,?,?)')->execute([$entityType,$entityId,$sourceId,safe_text($data['page']??''),safe_text($data['note']??'')]);
    store_citation($pdo,(int)$pdo->lastInsertId(),$data); // référence détaillée (service d'archives, cote, vue, acte…)
    log_change($pdo,'source',$sourceId,'create','Ajout de la source « '.$title.' » à '.($entityType==='event'?'l’événement #'.$entityId:'la fiche #'.$personId));
    return ['id'=>$sourceId];
}

function save_source(PDO $pdo,array $data): array
{
    $sourceId=safe_int($data['id']??0);$linkId=safe_int($data['link_id']??0);$title=safe_text($data['title']??'');$url=safe_text($data['url']??'');$type=source_type($data['source_type']??'internet');$personId=safe_int($data['person_id']??0);
    if(!$sourceId||$title==='')throw new RuntimeException('Source et titre obligatoires');
    if($url!==''&&(!filter_var($url,FILTER_VALIDATE_URL)||!in_array(parse_url($url,PHP_URL_SCHEME),['http','https'],true)))throw new RuntimeException('Adresse Internet invalide');
    $stmt=$pdo->prepare('SELECT * FROM sources WHERE id=?');$stmt->execute([$sourceId]);$sourceBefore=$stmt->fetch();
    if(!$sourceBefore)throw new RuntimeException('Source introuvable');
    $linkBefore=null;
    if($linkId){$link=$pdo->prepare('SELECT * FROM source_links WHERE id=? AND source_record_id=?');$link->execute([$linkId,$sourceId]);$linkBefore=$link->fetch();if(!$linkBefore)throw new RuntimeException('Citation introuvable');}
    $pdo->prepare('UPDATE sources SET source_type=?,title=?,author=?,agency=?,publication=?,url=?,text=? WHERE id=?')
        ->execute([$type,$title,safe_text($data['author']??''),safe_text($data['website']??''),safe_text($data['accessed_at']??''),$url,safe_text($data['text']??''),$sourceId]);
    if($linkId){[$entityType,$entityId]=source_target($data,$personId);$pdo->prepare('UPDATE source_links SET entity_type=?,entity_id=?,page=?,note=? WHERE id=?')->execute([$entityType,$entityId,safe_text($data['page']??''),safe_text($data['note']??''),$linkId]);}
    if($linkId)store_citation($pdo,$linkId,$data);
    $stmt->execute([$sourceId]);$sourceAfter=$stmt->fetch();
    log_change($pdo,'source',$sourceId,'update','Modification de la source « '.$title.' »',['source'=>$sourceBefore,'link'=>$linkBefore],$sourceAfter);
    return $sourceAfter;
}

function source_type(string $type): string
{
    return in_array($type,['internet','book','archive','testimony','other'],true)?$type:'internet';
}

function source_target(array $data,int $personId): array
{
    if(($data['entity_type']??'person')==='event'){
        $eventId=safe_int($data['event_id']??0);
        if(!$eventId)throw new RuntimeException('Choisis l’événement à sourcer');
        return ['event',$eventId];
    }
    if(!$personId)throw new RuntimeException('Personne manquante');
    return ['person',$personId];
}

function delete_source(PDO $pdo,array $data): array
{
    $sourceId=safe_int($data['id']??0);$linkId=safe_int($data['link_id']??0);if(!$sourceId)throw new RuntimeException('Source manquante');
    $stmt=$pdo->prepare('SELECT * FROM sources WHERE id=?');$stmt->execute([$sourceId]);$source=$stmt->fetch();
    if(!$source)throw new RuntimeException('Source introuvable');
    $sourceLinks=$pdo->prepare($linkId?'SELECT * FROM source_links WHERE id=? AND source_record_id=?':'SELECT * FROM source_links WHERE source_record_id=?');
    $sourceLinks->execute($linkId?[$linkId,$sourceId]:[$sourceId]);
    $deletedLinks=$sourceLinks->fetchAll();
    if($linkId&&!$deletedLinks)throw new RuntimeException('Citation introuvable');
    $labelLinks=$pdo->prepare("SELECT * FROM label_links WHERE entity_type='source' AND entity_id=?");$labelLinks->execute([$sourceId]);$sourceLabelLinks=$labelLinks->fetchAll();
    if($linkId){
        $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([$linkId]);
    }else{
        $pdo->prepare('DELETE FROM source_links WHERE source_record_id=?')->execute([$sourceId]);
    }
    $remaining=$pdo->prepare('SELECT count(*) FROM source_links WHERE source_record_id=?');$remaining->execute([$sourceId]);
    $sourceDeleted=(int)$remaining->fetchColumn()===0;
    if($sourceDeleted){
        $pdo->prepare("DELETE FROM label_links WHERE entity_type='source' AND entity_id=?")->execute([$sourceId]);
        $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([$sourceId]);
    }
    $snapshot=[
        '_restore_kind'=>'source_delete',
        'source'=>$source,
        'source_links'=>$deletedLinks,
        'label_links'=>$sourceDeleted?$sourceLabelLinks:[],
        'source_deleted'=>$sourceDeleted,
    ];
    log_change($pdo,'source',$sourceId,'delete','Suppression de la citation/source « '.($source['title']?:'#'.$sourceId).' »',$snapshot,null);
    return ['id'=>$sourceId,'link_id'=>$linkId];
}

function normalize_correspondents(string $rawJson): array
{
    $decoded=json_decode($rawJson,true);
    if(!is_array($decoded))return ['json'=>'','name'=>''];
    $clean=[];
    foreach($decoded as $entry){
        if(!is_array($entry))continue;
        $name=safe_text($entry['name']??'');
        if($name==='')continue;
        $clean[]=['id'=>safe_int($entry['id']??0),'name'=>$name];
    }
    return ['json'=>$clean?json_encode($clean,JSON_UNESCAPED_UNICODE):'','name'=>implode(', ',array_map(static fn($p)=>$p['name'],$clean))];
}

function save_media(PDO $pdo,array $data): array
{
    $mediaId=safe_int($data['media_id']??0);if(!$mediaId)throw new RuntimeException('Média manquant');
    $stmt=$pdo->prepare('SELECT * FROM media WHERE id=?');$stmt->execute([$mediaId]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Média introuvable');
    $title=safe_text($data['title']??$before['title']);$description=safe_text($data['description']??$before['description']);$date=safe_text($data['date_text']??$before['date_text']);
    $dateCalendar=safe_text($data['date_calendar']??$before['date_calendar']??'gregorian');
    if (!in_array($dateCalendar, ['gregorian', 'julian', 'republican'], true)) $dateCalendar = 'gregorian';
    $documentReference=safe_text($data['document_reference']??$before['document_reference']);$documentTitle=safe_text($data['document_title']??$before['document_title']);$documentUrl=safe_text($data['document_url']??$before['document_url']);$documentPages=safe_text($data['document_pages']??$before['document_pages']);$isPersonPhoto=array_key_exists('is_person_photo',$data)?((!empty($data['is_person_photo'])&&$data['is_person_photo']!=='0')?1:0):(int)($before['is_person_photo']??0);
    $mediaSubjectType=safe_text($data['media_subject_type']??$before['media_subject_type']??'');
    if(!in_array($mediaSubjectType,['','grave_photo','war_memorial_photo','voter_card','id_card','driving_permit'],true))$mediaSubjectType='';
    $transcription=(string)($data['transcription']??$before['transcription']);
    $correspondenceType=safe_text($data['correspondence_type']??$before['correspondence_type']??'');
    if (!in_array($correspondenceType, ['', 'lettre', 'carte_postale', 'telegramme', 'carte_voeux', 'faire_part', 'autre'], true) && !preg_match('/^custom:.{1,80}$/u',$correspondenceType)) $correspondenceType = '';
    $replyTo=safe_int($data['correspondence_reply_to_media_id']??$before['correspondence_reply_to_media_id']??0);
    if($replyTo===$mediaId)$replyTo=0;
    if($replyTo){
        $replyCheck=$pdo->prepare('SELECT 1 FROM media WHERE id=?');
        $replyCheck->execute([$replyTo]);
        if(!$replyCheck->fetchColumn())$replyTo=0;
    }
    if(array_key_exists('correspondent_names',$data)){
        $normalized=normalize_correspondents((string)$data['correspondent_names']);
        $correspondentJson=$normalized['json'];
        $correspondentName=$normalized['name'];
    }else{
        $correspondentJson=(string)($before['correspondent_json']??'');
        $correspondentName=safe_text($data['correspondent_name']??$before['correspondent_name']??'');
    }
    $pdo->prepare('UPDATE media SET title=?,description=?,date_text=?,date_calendar=?,document_reference=?,document_title=?,document_url=?,document_pages=?,is_person_photo=?,media_subject_type=?,transcription=?,correspondence_type=?,correspondent_name=?,correspondent_json=?,correspondence_reply_to_media_id=? WHERE id=?')->execute([$title,$description,$date,$dateCalendar,$documentReference,$documentTitle,$documentUrl,$documentPages,$isPersonPhoto,$mediaSubjectType,$transcription,$correspondenceType,$correspondentName,$correspondentJson,$replyTo,$mediaId]);
    $stmt->execute([$mediaId]);$after=$stmt->fetch();
    log_change($pdo,'media',$mediaId,'update','Modification du média « '.($title?:'#'.$mediaId).' »',$before,$after);return $after;
}

function delete_media(PDO $pdo,array $data): array
{
    $mediaId=safe_int($data['media_id']??0);if(!$mediaId)throw new RuntimeException('Média manquant');
    $stmt=$pdo->prepare('SELECT * FROM media WHERE id=?');$stmt->execute([$mediaId]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Média introuvable');
    $mediaLinks=$pdo->prepare('SELECT * FROM media_links WHERE media_id=?');$mediaLinks->execute([$mediaId]);
    $labelLinks=$pdo->prepare("SELECT * FROM label_links WHERE entity_type='media' AND entity_id=?");$labelLinks->execute([$mediaId]);
    $portraits=$pdo->prepare('SELECT id FROM persons WHERE portrait_media_id=?');$portraits->execute([$mediaId]);
    $versions=$pdo->prepare('SELECT * FROM media_versions WHERE media_id=?');$versions->execute([$mediaId]);
    $snapshot=[
        'media_versions'=>$versions->fetchAll(), // l'original et les retouches reviennent avec le média restauré
        '_restore_kind'=>'media_delete',
        'media'=>$before,
        'media_links'=>$mediaLinks->fetchAll(),
        'label_links'=>$labelLinks->fetchAll(),
        'portrait_person_ids'=>array_map('intval',$portraits->fetchAll(PDO::FETCH_COLUMN)),
        'dependents'=>media_dependent_rows($pdo,$mediaId), // enquêtes, noms cités, dépouillements, cartes anciennes, musée…
    ];
    $pdo->prepare('UPDATE persons SET portrait_media_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE portrait_media_id=?')->execute([$mediaId]);
    $pdo->prepare('DELETE FROM media_tags WHERE media_id=?')->execute([$mediaId]); // zones identifiées : gardées dans la copie ci-dessus
    $pdo->prepare('DELETE FROM media_links WHERE media_id=?')->execute([$mediaId]);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='media' AND entity_id=?")->execute([$mediaId]);
    $pdo->prepare('DELETE FROM media WHERE id=?')->execute([$mediaId]);
    log_change($pdo,'media',$mediaId,'delete','Suppression du média « '.($before['title']?:$before['filename']?:'#'.$mediaId).' » de la base locale',$snapshot,null);
    return ['id'=>$mediaId];
}

/**
 * Tout ce qui dépend d'un média et partirait (ON DELETE CASCADE, en cascade aussi pour les tables filles) ou serait
 * vidé (SET NULL) quand on le supprime, d'après les clés étrangères de la base, plus les zones identifiées (media_tags).
 */
function media_dependent_rows(PDO $pdo,int $mediaId): array
{
    $tables=$pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN);
    $fks=[];
    foreach($tables as $t){foreach($pdo->query('PRAGMA foreign_key_list("'.str_replace('"','""',(string)$t).'")')->fetchAll() as $fk)$fks[(string)$fk['table']][]=['table'=>(string)$t,'column'=>(string)$fk['from'],'on_delete'=>strtoupper((string)$fk['on_delete'])];}
    $out=['rows'=>[],'nulls'=>[]];$queue=[['media',[$mediaId]]];$seen=[];
    while($queue){
        [$parent,$ids]=array_shift($queue);
        foreach($fks[$parent]??[] as $fk){
            if($fk['table']==='media_links'||$fk['table']==='media_versions')continue; // déjà gardés à part
            $stmt=$pdo->prepare('SELECT * FROM "'.$fk['table'].'" WHERE "'.$fk['column'].'" IN ('.implode(',',array_fill(0,count($ids),'?')).')');$stmt->execute($ids);
            $rows=$stmt->fetchAll(PDO::FETCH_ASSOC);if(!$rows)continue;
            if($fk['on_delete']==='CASCADE'){
                $fresh=[];
                foreach($rows as $row){$key=$fk['table'].':'.json_encode($row);if(isset($seen[$key]))continue;$seen[$key]=true;$out['rows'][$fk['table']][]=$row;if(isset($row['id']))$fresh[]=(int)$row['id'];}
                if($fresh)$queue[]=[$fk['table'],$fresh];
            }elseif($fk['on_delete']==='SET NULL'&&isset($rows[0]['id'])&&$parent==='media'){
                foreach($rows as $row)$out['nulls'][]=['table'=>$fk['table'],'column'=>$fk['column'],'id'=>(int)$row['id']];
            }
        }
    }
    if(in_array('media_tags',$tables,true)){$t=$pdo->prepare('SELECT * FROM media_tags WHERE media_id=?');$t->execute([$mediaId]);if($r=$t->fetchAll(PDO::FETCH_ASSOC))$out['rows']['media_tags']=$r;}
    return $out;
}

function save_media_transcription(PDO $pdo,array $data): array
{
    $mediaId=safe_int($data['media_id']??0);if(!$mediaId)throw new RuntimeException('Média manquant');
    $stmt=$pdo->prepare('SELECT transcription,title FROM media WHERE id=?');$stmt->execute([$mediaId]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Média introuvable');
    $transcription=(string)($data['transcription']??'');$pdo->prepare('UPDATE media SET transcription=? WHERE id=?')->execute([$transcription,$mediaId]);
    log_change($pdo,'media',$mediaId,'transcription','Transcription du média « '.($before['title']?:'#'.$mediaId).' » modifiée',['transcription'=>$before['transcription']],['transcription'=>$transcription]);return ['id'=>$mediaId,'transcription'=>$transcription];
}

function media_file_path(string $filename): string
{
    $safe = str_replace(['\\', "\0"], ['/', ''], $filename);
    if ($safe === '' || str_contains($safe, '..')) {
        throw new RuntimeException('Nom de fichier média invalide.');
    }
    $root = realpath(MEDIA_DIR);
    $path = realpath(MEDIA_DIR . '/' . $safe);
    if (!$root || !$path || !str_starts_with($path, $root . DIRECTORY_SEPARATOR)) {
        throw new RuntimeException('Fichier média introuvable.');
    }
    return $path;
}

function rotate_media_image(PDO $pdo,array $data): array
{
    $mediaId=safe_int($data['media_id']??0);if(!$mediaId)throw new RuntimeException('Média manquant');
    $direction=safe_text($data['direction']??'right');
    if(!in_array($direction,['left','right'],true))$direction='right';
    $stmt=$pdo->prepare('SELECT * FROM media WHERE id=?');$stmt->execute([$mediaId]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Média introuvable');
    $type=strtolower((string)($before['media_type']??''));
    $filename=(string)($before['filename']??'');
    $ext=strtolower(pathinfo($filename,PATHINFO_EXTENSION));
    if($type!=='image'&&!in_array($ext,['jpg','jpeg','png','webp','gif'],true))throw new RuntimeException('Rotation disponible uniquement pour les images.');
    if(!extension_loaded('gd'))throw new RuntimeException('Rotation impossible : l’extension PHP GD n’est pas disponible.');
    $path=media_file_path($filename);
    $loader=match($ext){
        'jpg','jpeg'=>'imagecreatefromjpeg',
        'png'=>'imagecreatefrompng',
        'webp'=>'imagecreatefromwebp',
        'gif'=>'imagecreatefromgif',
        default=>null,
    };
    if(!$loader||!function_exists($loader))throw new RuntimeException('Format image non pris en charge pour la rotation.');
    $image=@$loader($path);
    if(!$image)throw new RuntimeException('Impossible de lire l’image.');
    if($ext==='png'){
        imagealphablending($image,false);
        imagesavealpha($image,true);
    }
    $angle=$direction==='left'?90:-90;
    $rotated=imagerotate($image,$angle,0);
    if(PHP_VERSION_ID<80000)imagedestroy($image); // sans effet depuis PHP 8.0, obsolète en 8.5
    if(!$rotated)throw new RuntimeException('Rotation impossible.');
    imagealphablending($rotated,false);
    imagesavealpha($rotated,true);
    $saved=match($ext){
        'jpg','jpeg'=>imagejpeg($rotated,$path,92),
        'png'=>imagepng($rotated,$path,6),
        'webp'=>function_exists('imagewebp')?imagewebp($rotated,$path,90):false,
        'gif'=>imagegif($rotated,$path),
        default=>false,
    };
    if(PHP_VERSION_ID<80000)imagedestroy($rotated);
    if(!$saved)throw new RuntimeException('Impossible d’enregistrer l’image tournée.');
    @touch($path);
    $after=$before;
    $after['_rotated_at']=date('c');
    log_change($pdo,'media',$mediaId,'rotate','Rotation du média « '.($before['title']?:$before['filename']?:'#'.$mediaId).' »',['filename'=>$before['filename'],'direction'=>$direction],['filename'=>$before['filename'],'rotated_at'=>$after['_rotated_at']]);
    $stmt->execute([$mediaId]);
    return $stmt->fetch() ?: $after;
}

function htr_model_catalog(): array
{
    $path = __DIR__ . '/config/htr-models.json';
    $models = [];
    if (is_file($path)) {
        $decoded = json_decode((string)file_get_contents($path), true);
        if (is_array($decoded)) {
            $models = array_values(array_filter($decoded, static fn($row) => is_array($row) && !empty($row['id']) && !empty($row['model'])));
        }
    }
    if (!$models) {
        $models = [
            ['id'=>'fr-actes','label'=>'Français · actes anciens','language'=>'fra','engine'=>'kraken','model'=>'models/htr/fr-actes.mlmodel'],
            ['id'=>'en-handwritten','label'=>'Anglais · manuscrit','language'=>'eng','engine'=>'kraken','model'=>'models/htr/en-handwritten.mlmodel'],
        ];
    }
    return $models;
}

function htr_model_by_id(string $id): array
{
    foreach (htr_model_catalog() as $model) {
        if ((string)$model['id'] === $id) {
            return $model;
        }
    }
    throw new RuntimeException('Modèle HTR inconnu');
}

function htr_recognize_media(PDO $pdo,array $data): array
{
    $mediaId=safe_int($data['media_id']??0);if(!$mediaId)throw new RuntimeException('Média manquant');
    $stmt=$pdo->prepare('SELECT id,filename,media_type,title FROM media WHERE id=?');$stmt->execute([$mediaId]);$media=$stmt->fetch();if(!$media)throw new RuntimeException('Média introuvable');
    if (($media['media_type'] ?? '') !== 'image') throw new RuntimeException('La reconnaissance manuscrite est disponible uniquement sur les images.');

    $filename = str_replace(['\\', "\0"], ['/', ''], (string)$media['filename']);
    if ($filename === '' || str_contains($filename, '..')) throw new RuntimeException('Nom de fichier média invalide.');
    $mediaRoot = realpath(MEDIA_DIR);
    $imagePath = realpath(MEDIA_DIR . '/' . $filename);
    if (!$mediaRoot || !$imagePath || !str_starts_with($imagePath, $mediaRoot . DIRECTORY_SEPARATOR)) {
        throw new RuntimeException('Fichier média introuvable.');
    }

    $modelId = safe_text($data['model'] ?? 'fr-actes') ?: 'fr-actes';
    $language = safe_text($data['language'] ?? '');
    $model = htr_model_by_id($modelId);
    // Modèle et Kraken : installés dans le dossier des données (Maintenance → Reconnaissance d'écriture), sinon dans l'application
    $modelPath = htr_model_file($model);
    if (!$modelPath) {
        throw new RuntimeException('Le modèle « ' . (string)($model['label'] ?? $modelId) . ' » n’est pas encore installé : Maintenance → Reconnaissance d’écriture (HTR) → « Installer », ou ajoute le fichier ' . basename((string)$model['model']) . ' à la main.');
    }

    $script = __DIR__ . '/scripts/htr_recognize.py';
    if (!is_file($script)) throw new RuntimeException('Script HTR local introuvable.');
    $venvPython = htr_venv_python() ?? '';
    if ($venvPython === '' && !trim((string) @shell_exec('command -v kraken 2>/dev/null'))) {
        throw new RuntimeException('La reconnaissance d’écriture n’est pas encore installée : Maintenance → Reconnaissance d’écriture (HTR) → « Installer » (une seule fois).');
    }
    $scriptArgs = ['--image',$imagePath,'--model',$modelPath,'--language',$language ?: (string)($model['language'] ?? ''),'--engine',(string)($model['engine'] ?? 'kraken')];
    if (!empty($model['segment_direction'])) {
        $scriptArgs[] = '--segment-direction';
        $scriptArgs[] = (string)$model['segment_direction'];
    }
    if (!empty($model['base_dir'])) {
        $scriptArgs[] = '--base-dir';
        $scriptArgs[] = (string)$model['base_dir'];
    }
    $cmd = $venvPython !== '' && is_file($venvPython)
        ? array_merge([$venvPython,$script], $scriptArgs)
        : array_merge(['/usr/bin/env','python3',$script], $scriptArgs);
    $descriptors = [1=>['pipe','w'],2=>['pipe','w']];
    $proc = proc_open($cmd, $descriptors, $pipes, __DIR__);
    if (!is_resource($proc)) throw new RuntimeException('Impossible de lancer le service HTR local.');
    $stdout = stream_get_contents($pipes[1]);fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);fclose($pipes[2]);
    $code = proc_close($proc);
    $result = json_decode((string)$stdout, true);
    if ($code !== 0 || !is_array($result) || !empty($result['error'])) {
        $message = is_array($result) && !empty($result['error']) ? (string)$result['error'] : trim((string)$stderr);
        throw new RuntimeException($message ?: 'Reconnaissance manuscrite impossible.');
    }
    return [
        'id'=>$mediaId,
        'text'=>(string)($result['text'] ?? ''),
        'engine'=>(string)($result['engine'] ?? 'kraken'),
        'mode'=>(string)($result['mode'] ?? ''),
        'model_id'=>$modelId,
        'model_label'=>(string)($model['label'] ?? $modelId),
        'language'=>$language ?: (string)($model['language'] ?? ''),
    ];
}

function set_portrait(PDO $pdo,array $data): array
{
    $personId=safe_int($data['person_id']??0);if(!$personId)throw new RuntimeException('Personne manquante');
    $mediaId=safe_int($data['media_id']??0);
    if(!$mediaId){
        $pdo->prepare('UPDATE persons SET portrait_media_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$personId]);
        log_change($pdo,'person',$personId,'portrait','Photo principale retirée');
        return ['person_id'=>$personId,'media_id'=>null];
    }
    $media=$pdo->prepare("SELECT m.id,m.media_type FROM media m WHERE m.id=? AND m.media_type='image' AND EXISTS(SELECT 1 FROM media_links ml WHERE ml.media_id=m.id AND ((ml.entity_type='person' AND ml.entity_id=?) OR (ml.entity_type='event' AND ml.entity_id IN (SELECT id FROM events WHERE person_id=? OR family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)))))");
    $media->execute([$mediaId,$personId,$personId,$personId,$personId]);if(!$media->fetch())throw new RuntimeException('Cette image n’est pas rattachée à la personne');
    $pdo->prepare('UPDATE persons SET portrait_media_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$mediaId,$personId]);log_change($pdo,'person',$personId,'portrait','Nouvelle photo principale sélectionnée');return ['person_id'=>$personId,'media_id'=>$mediaId];
}

function reorder_person_media(PDO $pdo,array $data): array
{
    $personId=safe_int($data['person_id']??0);if(!$personId)throw new RuntimeException('Personne manquante');
    $ids=$data['media_ids']??[];if(!is_array($ids)||!count($ids))throw new RuntimeException('Ordre des médias manquant');
    $stmt=$pdo->prepare("UPDATE media_links SET position=? WHERE media_id=? AND entity_type='person' AND entity_id=?");
    $position=1;
    foreach($ids as $rawId){
        $mediaId=safe_int($rawId);if(!$mediaId)continue;
        $stmt->execute([$position,$mediaId,$personId]);
        $position++;
    }
    log_change($pdo,'person',$personId,'media_order','Ordre des médias réorganisé manuellement');
    return ['person_id'=>$personId,'count'=>$position-1];
}

function media_collection_context(PDO $pdo,string $entityType,int $entityId,int $personId): void
{
    if(!in_array($entityType,['person','event'],true))throw new RuntimeException('Type de média invalide.');
    if(!$entityId||!$personId)throw new RuntimeException('Référence ou personne manquante.');
    if($entityType==='person'){
        if($entityId!==$personId)throw new RuntimeException('Fiche individuelle invalide.');
        return;
    }
    $check=$pdo->prepare('SELECT id FROM events WHERE id=? AND (person_id=? OR family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?))');
    $check->execute([$entityId,$personId,$personId,$personId]);
    if(!$check->fetchColumn())throw new RuntimeException('Cet événement n’est pas lié à cette personne.');
}

function group_entity_media(PDO $pdo,array $data): array
{
    $entityType=safe_text($data['entity_type']??'');
    $entityId=safe_int($data['entity_id']??0);
    $personId=safe_int($data['person_id']??0);
    media_collection_context($pdo,$entityType,$entityId,$personId);
    $ids=$data['media_ids']??[];
    if(!is_array($ids))$ids=[$ids];
    $ids=array_values(array_unique(array_filter(array_map('safe_int',$ids))));
    if(count($ids)<2)throw new RuntimeException('Choisis au moins deux médias pour créer un document groupé.');
    $linked=$pdo->prepare('SELECT media_id FROM media_links WHERE entity_type=? AND entity_id=? AND media_id=?');
    foreach($ids as $mediaId){$linked->execute([$entityType,$entityId,$mediaId]);if(!$linked->fetchColumn())throw new RuntimeException('Un des médias choisis n’est pas lié à cet élément.');}
    $key='set_'.bin2hex(random_bytes(8));
    $label=safe_text($data['collection_label']??'');
    $update=$pdo->prepare('UPDATE media_links SET collection_key=?,collection_label=? WHERE entity_type=? AND entity_id=? AND media_id=?');
    foreach($ids as $mediaId)$update->execute([$key,$label,$entityType,$entityId,$mediaId]);
    reorder_entity_media($pdo,['entity_type'=>$entityType,'entity_id'=>$entityId,'person_id'=>$personId,'media_ids'=>$ids,'silent'=>true]);
    log_change($pdo,$entityType,$entityId,'group-media','Création d’un document de '.count($ids).' médias.');
    return ['entity_type'=>$entityType,'entity_id'=>$entityId,'collection_key'=>$key,'count'=>count($ids)];
}

function ungroup_entity_media(PDO $pdo,array $data): array
{
    $entityType=safe_text($data['entity_type']??'');
    $entityId=safe_int($data['entity_id']??0);
    $personId=safe_int($data['person_id']??0);
    media_collection_context($pdo,$entityType,$entityId,$personId);
    $key=safe_text($data['collection_key']??'');
    if($key==='')throw new RuntimeException('Document groupé manquant.');
    $stmt=$pdo->prepare('UPDATE media_links SET collection_key=?,collection_label=? WHERE entity_type=? AND entity_id=? AND collection_key=?');
    $stmt->execute(['','',$entityType,$entityId,$key]);
    if(!$stmt->rowCount())throw new RuntimeException('Document groupé introuvable.');
    log_change($pdo,$entityType,$entityId,'ungroup-media','Séparation d’un document groupé.');
    return ['entity_type'=>$entityType,'entity_id'=>$entityId];
}

function reorder_entity_media(PDO $pdo,array $data): array
{
    $entityType=safe_text($data['entity_type']??'');
    $entityId=safe_int($data['entity_id']??0);
    $personId=safe_int($data['person_id']??0);
    media_collection_context($pdo,$entityType,$entityId,$personId);
    $ids=$data['media_ids']??[];
    if(!is_array($ids)||!count($ids))throw new RuntimeException('Ordre des médias manquant.');
    $valid=$pdo->prepare('SELECT 1 FROM media_links WHERE entity_type=? AND entity_id=? AND media_id=?');
    $update=$pdo->prepare('UPDATE media_links SET position=? WHERE entity_type=? AND entity_id=? AND media_id=?');
    $position=1;
    foreach($ids as $rawId){
        $mediaId=safe_int($rawId);if(!$mediaId)continue;
        $valid->execute([$entityType,$entityId,$mediaId]);if(!$valid->fetchColumn())continue;
        $update->execute([$position++,$entityType,$entityId,$mediaId]);
    }
    if(empty($data['silent']))log_change($pdo,$entityType,$entityId,'media_order','Ordre des médias réorganisé manuellement.');
    return ['entity_type'=>$entityType,'entity_id'=>$entityId,'count'=>$position-1];
}

function dismiss_issue(PDO $pdo,array $data): array
{
    $key=safe_text($data['key']??'');if($key==='')throw new RuntimeException('Alerte manquante');
    $pdo->prepare('INSERT OR REPLACE INTO dismissed_issues(issue_key,reason,dismissed_at) VALUES(?,?,CURRENT_TIMESTAMP)')->execute([$key,safe_text($data['reason']??'Faux positif')]);
    log_change($pdo,'maintenance',null,'dismiss','Incohérence classée comme exception : '.$key);return ['key'=>$key];
}

function bulk_group(PDO $pdo,array $data): array
{
    $match=safe_text($data['match']??'');$group=safe_text($data['group']??'');if($match===''||$group==='')throw new RuntimeException('Patronyme et groupe obligatoires');
    $pdo->prepare('INSERT OR IGNORE INTO surname_groups(name) VALUES(?)')->execute([$group]);$s=$pdo->prepare('SELECT id FROM surname_groups WHERE name=? COLLATE NOCASE');$s->execute([$group]);$gid=(int)$s->fetchColumn();
    $before=$pdo->prepare('SELECT id FROM persons WHERE last_name=? COLLATE NOCASE');$before->execute([$match]);$ids=$before->fetchAll(PDO::FETCH_COLUMN);
    $replaceWritten=!empty($data['replace_written']);
    if($replaceWritten&&$ids){
        $variant=$pdo->prepare("INSERT INTO name_variants(person_id,type,last_name,source_note,position) VALUES(?,'corrected',?,'Nom conservé avant correction groupée',(SELECT COALESCE(max(position),0)+1 FROM name_variants WHERE person_id=?))");
        foreach($ids as $id)$variant->execute([(int)$id,$match,(int)$id]);
        $pdo->prepare('UPDATE persons SET last_name=?,surname_group_id=?,updated_at=CURRENT_TIMESTAMP WHERE last_name=? COLLATE NOCASE')->execute([$group,$gid,$match]);
    }else{$pdo->prepare('UPDATE persons SET surname_group_id=?,updated_at=CURRENT_TIMESTAMP WHERE last_name=? COLLATE NOCASE')->execute([$gid,$match]);}
    foreach($ids as $id)rebuild_search($pdo,(int)$id);$summary=$replaceWritten?count($ids)." noms « {$match} » corrigés en « {$group} » avec conservation de l’ancien nom":count($ids)." personnes « {$match} » rattachées au groupe « {$group} »";log_change($pdo,'person',null,$replaceWritten?'bulk-rename':'bulk-group',$summary);return ['count'=>count($ids),'group_id'=>$gid,'renamed'=>$replaceWritten];
}

function save_branch(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    $name=safe_text($data['name']??'');
    if($name==='')throw new RuntimeException('Nom de branche obligatoire.');
    $rootId=safe_int($data['root_person_id']??0) ?: null;
    if($rootId){
        $exists=$pdo->prepare('SELECT id FROM persons WHERE id=?');
        $exists->execute([$rootId]);
        if(!$exists->fetchColumn())throw new RuntimeException('Personne racine introuvable.');
    }
    $color=safe_text($data['color']??'#0066cc') ?: '#0066cc';
    if(!preg_match('/^#[0-9a-f]{6}$/i',$color))$color='#0066cc';
    $description=safe_text($data['description']??'');
    if($id){
        $before=$pdo->prepare('SELECT * FROM branches WHERE id=?');
        $before->execute([$id]);
        $old=$before->fetch();
        if(!$old)throw new RuntimeException('Branche introuvable.');
        $pdo->prepare('UPDATE branches SET name=?,root_person_id=?,color=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name,$rootId,$color,$description,$id]);
        if($rootId)$pdo->prepare("INSERT OR IGNORE INTO branch_people(branch_id,person_id,role) VALUES(?,?,?)")->execute([$id,$rootId,'racine']);
        log_change($pdo,'branch',$id,'update','Modification de la branche « '.$name.' »',$old,['name'=>$name,'root_person_id'=>$rootId,'color'=>$color,'description'=>$description]);
    }else{
        $pdo->prepare('INSERT INTO branches(name,root_person_id,color,description) VALUES(?,?,?,?)')->execute([$name,$rootId,$color,$description]);
        $id=(int)$pdo->lastInsertId();
        if($rootId)$pdo->prepare("INSERT OR IGNORE INTO branch_people(branch_id,person_id,role) VALUES(?,?,?)")->execute([$id,$rootId,'racine']);
        log_change($pdo,'branch',$id,'create','Création de la branche « '.$name.' »',null,['id'=>$id,'root_person_id'=>$rootId]);
    }
    return ['id'=>$id];
}

function delete_branch(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);
    $stmt=$pdo->prepare('SELECT * FROM branches WHERE id=?');
    $stmt->execute([$id]);
    $branch=$stmt->fetch();
    if(!$branch)throw new RuntimeException('Branche introuvable.');
    $members=$pdo->prepare('SELECT * FROM branch_people WHERE branch_id=?');$members->execute([$id]);$memberRows=$members->fetchAll();
    $pdo->prepare('DELETE FROM branches WHERE id=?')->execute([$id]);
    log_change($pdo,'branch',$id,'delete','Suppression de la branche « '.$branch['name'].' »',$branch+['_children'=>['branch_people'=>$memberRows]],null);
    return ['id'=>$id];
}

function save_view(PDO $pdo,array $data): array
{
    $module=safe_text($data['module']??'graph');$name=safe_text($data['name']??'');if($name==='')throw new RuntimeException('Nom de vue obligatoire');$config=$data['config']??[];
    $stmt=$pdo->prepare('INSERT INTO saved_views(module,name,config_json,sort_order) VALUES(?,?,?,(SELECT COALESCE(max(sort_order),0)+10 FROM saved_views WHERE module=?))');$stmt->execute([$module,$name,json_encode($config,JSON_UNESCAPED_UNICODE),$module]);$id=(int)$pdo->lastInsertId();log_change($pdo,'view',$id,'create','Vue enregistrée : '.$name,null,['module'=>$module,'name'=>$name]);return ['id'=>$id];
}

function reorder_view(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$direction=($data['direction']??'up')==='down'?10:-10;$pdo->prepare('UPDATE saved_views SET sort_order=sort_order+?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$direction,$id]);return ['id'=>$id];
}

function delete_view(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);if(!$id)throw new RuntimeException('ID manquant');$stmt=$pdo->prepare('SELECT * FROM saved_views WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Vue introuvable');$links=$pdo->prepare("SELECT * FROM label_links WHERE entity_type='view' AND entity_id=? ORDER BY id");$links->execute([$id]);$before['_children']=['label_links'=>$links->fetchAll()];$pdo->prepare("DELETE FROM label_links WHERE entity_type='view' AND entity_id=?")->execute([$id]);$pdo->prepare('DELETE FROM saved_views WHERE id=?')->execute([$id]);log_change($pdo,'view',$id,'delete','Vue enregistrée supprimée : '.$before['name'],$before,null);return ['id'=>$id];
}

function update_view(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$name=safe_text($data['name']??'');if(!$id)throw new RuntimeException('ID manquant');if($name==='')throw new RuntimeException('Nom de vue obligatoire');$stmt=$pdo->prepare('SELECT * FROM saved_views WHERE id=?');$stmt->execute([$id]);$before=$stmt->fetch();if(!$before)throw new RuntimeException('Vue introuvable');if(isset($data['config'])&&is_array($data['config'])){$pdo->prepare('UPDATE saved_views SET name=?,config_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name,json_encode($data['config'],JSON_UNESCAPED_UNICODE),$id]);}else{$pdo->prepare('UPDATE saved_views SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name,$id]);}$stmt->execute([$id]);log_change($pdo,'view',$id,'update','Vue enregistrée modifiée : '.$name,$before,$stmt->fetch());return ['id'=>$id];
}

function set_view_order(PDO $pdo,array $data): array
{
    $id=safe_int($data['id']??0);$order=safe_int($data['sort_order']??0);if(!$id)throw new RuntimeException('ID manquant');$pdo->prepare('UPDATE saved_views SET sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$order,$id]);return ['id'=>$id];
}

function rebuild_search(PDO $pdo,int $personId): void
{
    $pdo->prepare('DELETE FROM person_search WHERE person_id=CAST(? AS INTEGER)')->execute([$personId]); // FTS5 : sans CAST, « 1 » (texte) ne trouve pas 1
    $pdo->prepare("INSERT INTO person_search(person_id,first_name,last_name,variants,surname_group) SELECT p.id,p.first_name,p.last_name,COALESCE((SELECT group_concat(trim(coalesce(n.first_name,'')||' '||coalesce(n.last_name,'')),' ') FROM name_variants n WHERE n.person_id=p.id),''),COALESCE(g.name,'') FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id WHERE p.id=?")->execute([$personId]);
}

function slug_local(string $value): string
{
    $ascii=ascii_fold($value);return trim(strtolower(preg_replace('/[^a-zA-Z0-9]+/','-',$ascii)?:'event'),'-');
}

function military_data(PDO $pdo, int $id): never
{
    if (!$id) json_response(['error' => 'ID manquant'], 400);
    $stmt = $pdo->prepare('SELECT military_data, show_military_block FROM persons WHERE id=?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_response(['error' => 'Personne introuvable'], 404);
    $data = $row['military_data'] ? (json_decode($row['military_data'], true) ?: []) : [];
    json_response(['person_id' => $id, 'show_military_block' => (int)$row['show_military_block'], 'data' => $data]);
}

function save_military(PDO $pdo, array $data): array
{
    $personId = safe_int($data['person_id'] ?? 0);
    if (!$personId) throw new RuntimeException('Personne manquante');
    $stmt = $pdo->prepare('SELECT id FROM persons WHERE id=?');
    $stmt->execute([$personId]);
    if (!$stmt->fetchColumn()) throw new RuntimeException('Personne introuvable');

    // Champs structurés (clés connues)
    $structured = [
        'matricule'              => safe_text($data['matricule'] ?? ''),
        'classe_mobilisation'    => safe_text($data['classe_mobilisation'] ?? ''),
        'bureau_recrutement'     => safe_text($data['bureau_recrutement'] ?? ''),
        'decision_conseil'       => safe_text($data['decision_conseil'] ?? ''),
        'compris_liste'          => safe_text($data['compris_liste'] ?? ''),
        // Signalement physique
        'cheveux'                => safe_text($data['cheveux'] ?? ''),
        'sourcils'               => safe_text($data['sourcils'] ?? ''),
        'yeux'                   => safe_text($data['yeux'] ?? ''),
        'front'                  => safe_text($data['front'] ?? ''),
        'nez'                    => safe_text($data['nez'] ?? ''),
        'bouche'                 => safe_text($data['bouche'] ?? ''),
        'menton'                 => safe_text($data['menton'] ?? ''),
        'visage'                 => safe_text($data['visage'] ?? ''),
        'taille'                 => safe_text($data['taille'] ?? ''),
        'marques_particulieres'  => safe_text($data['marques_particulieres'] ?? ''),
        'degre_instruction_gen'  => safe_text($data['degre_instruction_gen'] ?? ''),
        'degre_instruction_mil'  => safe_text($data['degre_instruction_mil'] ?? ''),
        // Corps d'affectation
        'corps_armee_active'     => safe_text($data['corps_armee_active'] ?? ''),
        'corps_disponibilite'    => safe_text($data['corps_disponibilite'] ?? ''),
        'corps_territoriale'     => safe_text($data['corps_territoriale'] ?? ''),
        // Périodes
        'date_entree_active'     => safe_text($data['date_entree_active'] ?? ''),
        'date_disponibilite'     => safe_text($data['date_disponibilite'] ?? ''),
        'date_reserve'           => safe_text($data['date_reserve'] ?? ''),
        'date_territoriale'      => safe_text($data['date_territoriale'] ?? ''),
        'date_reserve_territ'    => safe_text($data['date_reserve_territ'] ?? ''),
        'date_liberation'        => safe_text($data['date_liberation'] ?? ''),
        // Zones libres par section
        'services_mutations'     => safe_text($data['services_mutations'] ?? ''),
        'localites_successives'  => safe_text($data['localites_successives'] ?? ''),
        'condamnations'          => safe_text($data['condamnations'] ?? ''),
        'notes_militaires'       => safe_text($data['notes_militaires'] ?? ''),
    ];

    $pdo->prepare('UPDATE persons SET military_data=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
        ->execute([json_encode($structured, JSON_UNESCAPED_UNICODE), $personId]);
    log_change($pdo, 'person', $personId, 'military', 'Mise à jour des informations militaires');
    return ['person_id' => $personId];
}

function grave_condition(string $value): string
{
    return in_array($value, ['bon','moyen','mauvais','a_restaurer','disparu','inconnu'], true) ? $value : 'inconnu';
}

// Renvoie la sépulture liée à une personne (s'il y en a une), avec toutes les personnes
// qui y sont inhumées et les photos datées associées (media_links entity_type='grave').
function cemetery_data(PDO $pdo, int $id): never
{
    if (!$id) json_response(['error' => 'ID manquant'], 400);
    $personCheck = $pdo->prepare('SELECT id FROM persons WHERE id=?');
    $personCheck->execute([$id]);
    if (!$personCheck->fetchColumn()) json_response(['error' => 'Personne introuvable'], 404);

    $graveIdStmt = $pdo->prepare('SELECT grave_id FROM grave_persons WHERE person_id=? LIMIT 1');
    $graveIdStmt->execute([$id]);
    $graveId = (int)($graveIdStmt->fetchColumn() ?: 0);
    if (!$graveId) json_response(['person_id' => $id, 'grave' => null]);

    json_response(['person_id' => $id, 'grave' => grave_full($pdo, $graveId)]);
}

function cemetery_map_data(PDO $pdo): never
{
    $rows = $pdo->query("SELECT g.*,pl.name AS place_name,pl.subdivision,pl.county,pl.state,pl.country AS place_country,
            COALESCE(g.gps_lat,pl.latitude) AS latitude,COALESCE(g.gps_lon,pl.longitude) AS longitude,
            count(DISTINCT gp.person_id) AS people_count,
            group_concat(trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ' | ') AS people_names,
            (SELECT m.id FROM media_links ml JOIN media m ON m.id=ml.media_id WHERE ml.entity_type='grave' AND ml.entity_id=g.id ORDER BY ml.position,m.id LIMIT 1) AS photo_id,
            (SELECT m.filename FROM media_links ml JOIN media m ON m.id=ml.media_id WHERE ml.entity_type='grave' AND ml.entity_id=g.id ORDER BY ml.position,m.id LIMIT 1) AS photo_filename
        FROM graves g
        LEFT JOIN places pl ON lower(trim(pl.name))=lower(trim(g.city))
            AND (trim(COALESCE(g.country,''))='' OR lower(trim(COALESCE(pl.country,'')))=lower(trim(g.country)))
        LEFT JOIN grave_persons gp ON gp.grave_id=g.id
        LEFT JOIN persons p ON p.id=gp.person_id
        GROUP BY g.id
        HAVING latitude IS NOT NULL AND longitude IS NOT NULL
           AND NOT (latitude=0 AND longitude=0)
        ORDER BY g.city COLLATE NOCASE,g.cemetery_name COLLATE NOCASE,g.id")->fetchAll();
    $points = array_map(static function(array $row): array {
        $city = trim((string)($row['city'] ?? '')) ?: trim((string)($row['place_name'] ?? ''));
        return [
            'id' => 'grave-'.(int)$row['id'],
            'grave_id' => (int)$row['id'],
            'is_cemetery' => true,
            'latitude' => (float)$row['latitude'],
            'longitude' => (float)$row['longitude'],
            'name' => trim(implode(', ', array_filter([$city,$row['state'] ?? '',$row['country'] ?? $row['place_country'] ?? '']))),
            'type_label' => 'Sépulture',
            'cemetery_name' => (string)($row['cemetery_name'] ?? ''),
            'city' => $city,
            'country' => (string)($row['country'] ?? $row['place_country'] ?? ''),
            'address' => (string)($row['address'] ?? ''),
            'concession' => (string)($row['plan_ref'] ?? ''),
            'condition_state' => (string)($row['condition_state'] ?? ''),
            'people' => array_values(array_filter(explode(' | ', (string)($row['people_names'] ?? '')))),
            'people_count' => (int)($row['people_count'] ?? 0),
            'photo_id' => (int)($row['photo_id'] ?? 0),
            'photo_filename' => (string)($row['photo_filename'] ?? ''),
        ];
    }, $rows);
    json_response(['points'=>$points,'total'=>count($points)]);
}

function personal_dictionary_data(PDO $pdo): never
{
    $rows = $pdo->query("SELECT * FROM personal_dictionary_entries ORDER BY term COLLATE NOCASE,id")->fetchAll();
    json_response(['entries'=>$rows]);
}

function personal_dictionary_category(string $value): string
{
    return in_array($value, ['abbreviation','vocabulary','place','nickname','variant','other'], true) ? $value : 'other';
}

function save_personal_dictionary_entry(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $term = safe_text($data['term'] ?? '');
    $definition = safe_text($data['definition'] ?? '');
    $category = personal_dictionary_category(safe_text($data['category'] ?? 'other'));
    if ($term === '') throw new RuntimeException('Le terme est requis');
    if ($id) {
        $before = $pdo->prepare('SELECT * FROM personal_dictionary_entries WHERE id=?');
        $before->execute([$id]);
        if (!$before->fetch()) throw new RuntimeException('Entrée introuvable');
        $pdo->prepare('UPDATE personal_dictionary_entries SET term=?,category=?,definition=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$term,$category,$definition,$id]);
        log_change($pdo, 'personal_dictionary', $id, 'update', 'Modification du dictionnaire personnel : '.$term);
    } else {
        $pdo->prepare('INSERT INTO personal_dictionary_entries(term,category,definition) VALUES(?,?,?)')->execute([$term,$category,$definition]);
        $id = (int)$pdo->lastInsertId();
        log_change($pdo, 'personal_dictionary', $id, 'create', 'Ajout au dictionnaire personnel : '.$term);
    }
    $stmt = $pdo->prepare('SELECT * FROM personal_dictionary_entries WHERE id=?');
    $stmt->execute([$id]);
    return ['entry'=>$stmt->fetch()];
}

function delete_personal_dictionary_entry(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $stmt = $pdo->prepare('SELECT * FROM personal_dictionary_entries WHERE id=?');
    $stmt->execute([$id]);
    $entry = $stmt->fetch();
    if (!$entry) throw new RuntimeException('Entrée introuvable');
    $pdo->prepare('DELETE FROM personal_dictionary_entries WHERE id=?')->execute([$id]);
    log_change($pdo, 'personal_dictionary', $id, 'delete', 'Suppression du dictionnaire personnel : '.(string)$entry['term']);
    return ['id'=>$id];
}

function grave_full(PDO $pdo, int $graveId): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM graves WHERE id=?');
    $stmt->execute([$graveId]);
    $grave = $stmt->fetch();
    if (!$grave) return null;
    $persons = $pdo->prepare("SELECT p.id,p.first_name,p.last_name,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year,
        gp.id AS link_id
        FROM grave_persons gp JOIN persons p ON p.id=gp.person_id
        WHERE gp.grave_id=? ORDER BY gp.position,gp.id");
    $persons->execute([$graveId]);
    $grave['persons'] = $persons->fetchAll();
    $photos = $pdo->prepare("SELECT m.* FROM media m JOIN media_links ml ON ml.media_id=m.id
        WHERE ml.entity_type='grave' AND ml.entity_id=? ORDER BY COALESCE(m.date_text,''),ml.position,m.id");
    $photos->execute([$graveId]);
    $grave['photos'] = $photos->fetchAll();
    return $grave;
}

function save_grave(PDO $pdo, array $data): array
{
    $graveId = safe_int($data['grave_id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0);
    $cemeteryName = safe_text($data['cemetery_name'] ?? '');
    $city = safe_text($data['city'] ?? '');
    $country = safe_text($data['country'] ?? '');
    $address = safe_text($data['address'] ?? '');
    $planRef = safe_text($data['plan_ref'] ?? '');
    $gpsLat = ($data['gps_lat'] ?? '') !== '' ? (float)$data['gps_lat'] : null;
    $gpsLon = ($data['gps_lon'] ?? '') !== '' ? (float)$data['gps_lon'] : null;
    $condition = grave_condition(safe_text($data['condition_state'] ?? 'inconnu'));
    $graveExists = (!empty($data['grave_exists']) && $data['grave_exists'] !== '0') ? 1 : 0;
    $notes = safe_text($data['notes'] ?? '');

    if ($graveId) {
        $check = $pdo->prepare('SELECT id FROM graves WHERE id=?');
        $check->execute([$graveId]);
        if (!$check->fetchColumn()) throw new RuntimeException('Sépulture introuvable');
        $pdo->prepare('UPDATE graves SET cemetery_name=?,city=?,country=?,address=?,plan_ref=?,gps_lat=?,gps_lon=?,condition_state=?,grave_exists=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$cemeteryName,$city,$country,$address,$planRef,$gpsLat,$gpsLon,$condition,$graveExists,$notes,$graveId]);
        log_change($pdo, 'grave', $graveId, 'update', 'Mise à jour de la sépulture'.($cemeteryName?' « '.$cemeteryName.' »':''));
    } else {
        if (!$personId) throw new RuntimeException('Personne manquante');
        $person = $pdo->prepare('SELECT id FROM persons WHERE id=?');
        $person->execute([$personId]);
        if (!$person->fetchColumn()) throw new RuntimeException('Personne introuvable');
        $existing = $pdo->prepare('SELECT grave_id FROM grave_persons WHERE person_id=? LIMIT 1');
        $existing->execute([$personId]);
        if ($existing->fetchColumn()) throw new RuntimeException('Cette personne est déjà rattachée à une sépulture');
        $pdo->prepare('INSERT INTO graves(cemetery_name,city,country,address,plan_ref,gps_lat,gps_lon,condition_state,grave_exists,notes) VALUES(?,?,?,?,?,?,?,?,?,?)')
            ->execute([$cemeteryName,$city,$country,$address,$planRef,$gpsLat,$gpsLon,$condition,$graveExists,$notes]);
        $graveId = (int)$pdo->lastInsertId();
        $pdo->prepare('INSERT INTO grave_persons(grave_id,person_id,position) VALUES(?,?,0)')->execute([$graveId,$personId]);
        log_change($pdo, 'grave', $graveId, 'create', 'Création de la sépulture'.($cemeteryName?' « '.$cemeteryName.' »':''));
    }
    return grave_full($pdo, $graveId);
}

function add_grave_person(PDO $pdo, array $data): array
{
    $graveId = safe_int($data['grave_id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0);
    if (!$graveId) throw new RuntimeException('Sépulture manquante');
    if (!$personId) throw new RuntimeException('Personne manquante');
    $grave = $pdo->prepare('SELECT id FROM graves WHERE id=?');
    $grave->execute([$graveId]);
    if (!$grave->fetchColumn()) throw new RuntimeException('Sépulture introuvable');
    $person = $pdo->prepare('SELECT id,first_name,last_name FROM persons WHERE id=?');
    $person->execute([$personId]);
    $personRow = $person->fetch();
    if (!$personRow) throw new RuntimeException('Personne introuvable');
    $existing = $pdo->prepare('SELECT grave_id FROM grave_persons WHERE person_id=?');
    $existing->execute([$personId]);
    $existingGrave = $existing->fetchColumn();
    if ($existingGrave && (int)$existingGrave !== $graveId) throw new RuntimeException('Cette personne est déjà rattachée à une autre sépulture');
    if ((int)$existingGrave === $graveId) throw new RuntimeException('Cette personne est déjà associée à cette sépulture');
    $pos = (int)$pdo->query('SELECT COALESCE(MAX(position),0)+1 FROM grave_persons WHERE grave_id='.(int)$graveId)->fetchColumn();
    $pdo->prepare('INSERT INTO grave_persons(grave_id,person_id,position) VALUES(?,?,?)')->execute([$graveId,$personId,$pos]);
    log_change($pdo, 'grave', $graveId, 'link-person', 'Ajout de '.trim($personRow['first_name'].' '.$personRow['last_name']).' à la sépulture');
    return grave_full($pdo, $graveId);
}

function remove_grave_person(PDO $pdo, array $data): array
{
    $graveId = safe_int($data['grave_id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0);
    if (!$graveId || !$personId) throw new RuntimeException('Référence manquante');
    $link = $pdo->prepare('SELECT id FROM grave_persons WHERE grave_id=? AND person_id=?');
    $link->execute([$graveId, $personId]);
    if (!$link->fetchColumn()) throw new RuntimeException('Cette personne n’est pas rattachée à cette sépulture');
    $countStmt = $pdo->prepare('SELECT count(*) FROM grave_persons WHERE grave_id=?');
    $countStmt->execute([$graveId]);
    if ((int)$countStmt->fetchColumn() <= 1) throw new RuntimeException('Impossible de retirer la dernière personne : supprime la sépulture si besoin');
    $pdo->prepare('DELETE FROM grave_persons WHERE grave_id=? AND person_id=?')->execute([$graveId, $personId]);
    log_change($pdo, 'grave', $graveId, 'unlink-person', 'Retrait d’une personne de la sépulture #'.$graveId);
    return ['grave_id' => $graveId, 'person_id' => $personId];
}

function delete_grave(PDO $pdo, array $data): array
{
    $graveId = safe_int($data['grave_id'] ?? 0);
    if (!$graveId) throw new RuntimeException('Sépulture manquante');
    $stmt = $pdo->prepare('SELECT * FROM graves WHERE id=?');
    $stmt->execute([$graveId]);
    $grave = $stmt->fetch();
    if (!$grave) throw new RuntimeException('Sépulture introuvable');
    $pdo->prepare("DELETE FROM media_links WHERE entity_type='grave' AND entity_id=?")->execute([$graveId]);
    $pdo->prepare('DELETE FROM grave_persons WHERE grave_id=?')->execute([$graveId]);
    $pdo->prepare('DELETE FROM graves WHERE id=?')->execute([$graveId]);
    log_change($pdo, 'grave', $graveId, 'delete', 'Suppression de la sépulture'.($grave['cemetery_name']?' « '.$grave['cemetery_name'].' »':''));
    return ['id' => $graveId];
}

function add_media_link(PDO $pdo, array $data): array
{
    $mediaId = safe_int($data['media_id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0);
    $entityType = safe_text($data['entity_type'] ?? '');
    $entityId = safe_int($data['entity_id'] ?? 0);
    $allowed = ['person','event','census','military','family','grave'];
    if (!$mediaId) throw new RuntimeException('Média manquant');
    if (!$personId) throw new RuntimeException('Personne manquante');
    if (!in_array($entityType, $allowed, true)) throw new RuntimeException('Type de rattachement invalide');
    if (!$entityId) throw new RuntimeException('Cible manquante');
    // Vérifier que le média appartient bien à cette personne
    if (!media_visible_for_person($pdo, $mediaId, $personId)) throw new RuntimeException('Ce média n’est pas accessible depuis cette fiche');
    // Vérifier que la cible appartient à cette personne
    if ($entityType === 'event') {
        $chk = $pdo->prepare('SELECT 1 FROM events WHERE id=? AND (person_id=? OR family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?))');
        $chk->execute([$entityId, $personId, $personId, $personId]);
        if (!$chk->fetchColumn()) throw new RuntimeException('Cet événement n’est pas lié à cette personne');
    } elseif ($entityType === 'military') {
        if ($entityId !== $personId) throw new RuntimeException('Dossier militaire invalide');
    } elseif ($entityType === 'census') {
        $chk = $pdo->prepare('SELECT 1 FROM census_members WHERE census_id=? AND person_id=?');
        $chk->execute([$entityId, $personId]);
        if (!$chk->fetchColumn()) throw new RuntimeException('Ce recensement n’est pas lié à cette personne');
    }
    // Éviter les doublons
    $exists = $pdo->prepare('SELECT 1 FROM media_links WHERE media_id=? AND entity_type=? AND entity_id=? LIMIT 1');
    $exists->execute([$mediaId, $entityType, $entityId]);
    if ($exists->fetchColumn()) throw new RuntimeException('Ce rattachement existe déjà');
    $position = (int)$pdo->query("SELECT COALESCE(MAX(position),0)+1 FROM media_links WHERE entity_type='" . $entityType . "' AND entity_id=" . $entityId)->fetchColumn();
    $pdo->prepare('INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(?,?,?,?)')->execute([$mediaId, $entityType, $entityId, $position]);
    $linkId = (int)$pdo->lastInsertId();
    log_change($pdo, 'media', $mediaId, 'link-media', 'Rattachement ajouté : ' . $entityType . ' #' . $entityId);
    return ['media_id' => $mediaId, 'link_id' => $linkId, 'entity_type' => $entityType, 'entity_id' => $entityId];
}

function remove_media_link(PDO $pdo, array $data): array
{
    $mediaId = safe_int($data['media_id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0);
    $entityType = safe_text($data['entity_type'] ?? '');
    $entityId = safe_int($data['entity_id'] ?? 0);
    if (!$mediaId || !$entityType || !$entityId) throw new RuntimeException('Données manquantes');
    if (!$personId) throw new RuntimeException('Personne manquante');
    if (!media_visible_for_person($pdo, $mediaId, $personId)) throw new RuntimeException('Ce média n’est pas accessible depuis cette fiche');
    // Vérifier qu'il reste au moins un autre rattachement avant de supprimer
    $total = (int)$pdo->prepare('SELECT count(*) FROM media_links WHERE media_id=?')->execute([$mediaId]) ? (int)$pdo->query("SELECT count(*) FROM media_links WHERE media_id=$mediaId")->fetchColumn() : 0;
    if ($total <= 1) throw new RuntimeException('Impossible de retirer le dernier rattachement — supprime le média si tu veux le retirer complètement');
    $pdo->prepare('DELETE FROM media_links WHERE media_id=? AND entity_type=? AND entity_id=?')->execute([$mediaId, $entityType, $entityId]);
    log_change($pdo, 'media', $mediaId, 'unlink-media', 'Rattachement retiré : ' . $entityType . ' #' . $entityId);
    return ['media_id' => $mediaId, 'entity_type' => $entityType, 'entity_id' => $entityId];
}


function search_alias_data(PDO $pdo): never
{
    $q = safe_text($_GET['q'] ?? '');
    $limit = min(20, max(5, safe_int($_GET['limit'] ?? 10)));
    if ($q === '') json_response(['data' => []]);
    $tokens = preg_split('/\s+/u', $q, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $where = [];
    $params = [];
    foreach (array_slice($tokens, 0, 6) as $i => $token) {
        $key = ':q' . $i;
        $where[] = "(p.first_name LIKE {$key} COLLATE NOCASE OR p.middle_name LIKE {$key} COLLATE NOCASE OR p.last_name LIKE {$key} COLLATE NOCASE OR trim(p.first_name||' '||p.middle_name||' '||p.last_name) LIKE {$key} COLLATE NOCASE OR trim(p.first_name||' '||p.last_name) LIKE {$key} COLLATE NOCASE OR g.name LIKE {$key} COLLATE NOCASE OR EXISTS(SELECT 1 FROM name_variants nv WHERE nv.person_id=p.id AND (nv.first_name LIKE {$key} COLLATE NOCASE OR nv.middle_name LIKE {$key} COLLATE NOCASE OR nv.last_name LIKE {$key} COLLATE NOCASE)))";
        $params[$key] = '%' . $token . '%';
    }
    $sql = person_select() . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT :limit';
    $stmt = $pdo->prepare($sql);
    foreach ($params as $k => $v) $stmt->bindValue($k, $v);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    json_response(['data' => $stmt->fetchAll()]);
}

function get_media_tags_data(PDO $pdo, int $mediaId): void
{
    if(!$mediaId){json_response(['error'=>'Média manquant'],422);return;}
    $stmt=$pdo->prepare("SELECT mt.id,mt.media_id,mt.person_id,COALESCE(mt.tag_type,'person') AS tag_type,mt.x,mt.y,mt.w,mt.h,mt.confidence,mt.note,mt.created_at,p.first_name,p.last_name FROM media_tags mt JOIN persons p ON p.id=mt.person_id WHERE mt.media_id=? ORDER BY CASE COALESCE(mt.tag_type,'person') WHEN 'person' THEN 0 ELSE 1 END,mt.id");
    $stmt->execute([$mediaId]);
    json_response(['tags'=>$stmt->fetchAll()]);
}

function media_tag_type(array $data): string
{
    $type=safe_text($data['tag_type']??'person');
    return $type==='signature'?'signature':'person';
}

function save_media_tag(PDO $pdo, array $data): array
{
    $mediaId=safe_int($data['media_id']??0);if(!$mediaId)throw new RuntimeException('Média manquant');
    $personId=safe_int($data['person_id']??0);if(!$personId)throw new RuntimeException('Personne manquante');
    $x=max(0.0,min(100.0,(float)($data['x']??0)));$y=max(0.0,min(100.0,(float)($data['y']??0)));
    $w=max(0.5,min(100.0,(float)($data['w']??0)));$h=max(0.5,min(100.0,(float)($data['h']??0)));
    $confidence=safe_text($data['confidence']??'certain');
    if(!in_array($confidence,['certain','probable','possible','uncertain'],true))$confidence='certain';
    $tagType=media_tag_type($data);
    $note=safe_text($data['note']??'');
    $mRow=$pdo->prepare('SELECT id FROM media WHERE id=?');$mRow->execute([$mediaId]);if(!$mRow->fetchColumn())throw new RuntimeException('Média introuvable');
    $pRow=$pdo->prepare('SELECT id,first_name,last_name FROM persons WHERE id=?');$pRow->execute([$personId]);$person=$pRow->fetch();if(!$person)throw new RuntimeException('Personne introuvable');
    $pdo->prepare('INSERT INTO media_tags(media_id,person_id,tag_type,x,y,w,h,confidence,note) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$mediaId,$personId,$tagType,$x,$y,$w,$h,$confidence,$note]);
    $tagId=(int)$pdo->lastInsertId();
    $exists=$pdo->prepare("SELECT 1 FROM media_links WHERE media_id=? AND entity_type='person' AND entity_id=? LIMIT 1");$exists->execute([$mediaId,$personId]);
    if(!$exists->fetchColumn()){
        $pos=(int)$pdo->query("SELECT COALESCE(MAX(position),0)+1 FROM media_links WHERE entity_type='person' AND entity_id=".(int)$personId)->fetchColumn();
        $pdo->prepare("INSERT INTO media_links(media_id,entity_type,entity_id,position,media_tag_id) VALUES(?,'person',?,?,?)")->execute([$mediaId,$personId,$pos,$tagId]);
    }
    log_change($pdo,'media',$mediaId,'tag',($tagType==='signature'?'Signature':'Identification').' de '.trim($person['first_name'].' '.$person['last_name']).' sur le média #'.$mediaId);
    $out=$pdo->prepare("SELECT mt.id,mt.media_id,mt.person_id,COALESCE(mt.tag_type,'person') AS tag_type,mt.x,mt.y,mt.w,mt.h,mt.confidence,mt.note,p.first_name,p.last_name FROM media_tags mt JOIN persons p ON p.id=mt.person_id WHERE mt.id=?");$out->execute([$tagId]);return $out->fetch();
}

function update_media_tag(PDO $pdo, array $data): array
{
    $tagId=safe_int($data['tag_id']??0);if(!$tagId)throw new RuntimeException('Identification manquante');
    $existingStmt=$pdo->prepare('SELECT * FROM media_tags WHERE id=?');$existingStmt->execute([$tagId]);$existing=$existingStmt->fetch();if(!$existing)throw new RuntimeException('Identification introuvable');
    $personId=safe_int($data['person_id']??0);if(!$personId)throw new RuntimeException('Personne manquante');
    $confidence=safe_text($data['confidence']??'certain');
    if(!in_array($confidence,['certain','probable','possible','uncertain'],true))$confidence='certain';
    $tagType=media_tag_type($data);
    $note=safe_text($data['note']??'');
    $x=isset($data['x'])?max(0.0,min(100.0,(float)$data['x'])):(float)$existing['x'];
    $y=isset($data['y'])?max(0.0,min(100.0,(float)$data['y'])):(float)$existing['y'];
    $w=isset($data['w'])?max(0.5,min(100.0,(float)$data['w'])):(float)$existing['w'];
    $h=isset($data['h'])?max(0.5,min(100.0,(float)$data['h'])):(float)$existing['h'];
    $pRow=$pdo->prepare('SELECT id,first_name,last_name FROM persons WHERE id=?');$pRow->execute([$personId]);$person=$pRow->fetch();if(!$person)throw new RuntimeException('Personne introuvable');
    $mediaId=(int)$existing['media_id'];
    $oldPersonId=(int)$existing['person_id'];
    $pdo->prepare('UPDATE media_tags SET person_id=?,tag_type=?,x=?,y=?,w=?,h=?,confidence=?,note=? WHERE id=?')->execute([$personId,$tagType,$x,$y,$w,$h,$confidence,$note,$tagId]);
    if($oldPersonId!==$personId){
        $exists=$pdo->prepare("SELECT 1 FROM media_links WHERE media_id=? AND entity_type='person' AND entity_id=? LIMIT 1");$exists->execute([$mediaId,$personId]);
        if(!$exists->fetchColumn()){
            $pos=(int)$pdo->query("SELECT COALESCE(MAX(position),0)+1 FROM media_links WHERE entity_type='person' AND entity_id=".(int)$personId)->fetchColumn();
            $pdo->prepare("INSERT INTO media_links(media_id,entity_type,entity_id,position,media_tag_id) VALUES(?,'person',?,?,?)")->execute([$mediaId,$personId,$pos,$tagId]);
        }
        $pdo->prepare("UPDATE media_links SET media_tag_id=NULL WHERE media_id=? AND entity_type='person' AND entity_id=? AND media_tag_id=?")->execute([$mediaId,$oldPersonId,$tagId]);
        $remaining=$pdo->prepare('SELECT COUNT(*) FROM media_tags WHERE media_id=? AND person_id=?');$remaining->execute([$mediaId,$oldPersonId]);
        if((int)$remaining->fetchColumn()===0){
            $pdo->prepare("DELETE FROM media_links WHERE media_id=? AND entity_type='person' AND entity_id=? AND media_tag_id IS NULL")->execute([$mediaId,$oldPersonId]);
        }
    } else {
        $pdo->prepare("UPDATE media_links SET media_tag_id=? WHERE media_id=? AND entity_type='person' AND entity_id=? AND media_tag_id IS NULL")->execute([$tagId,$mediaId,$personId]);
    }
    log_change($pdo,'media',$mediaId,'tag','Modification de '.($tagType==='signature'?'la signature':'l\'identification').' de '.trim($person['first_name'].' '.$person['last_name']).' sur le média #'.$mediaId);
    $out=$pdo->prepare("SELECT mt.id,mt.media_id,mt.person_id,COALESCE(mt.tag_type,'person') AS tag_type,mt.x,mt.y,mt.w,mt.h,mt.confidence,mt.note,p.first_name,p.last_name FROM media_tags mt JOIN persons p ON p.id=mt.person_id WHERE mt.id=?");$out->execute([$tagId]);return $out->fetch();
}

function delete_media_tag(PDO $pdo, array $data): array
{
    $tagId=safe_int($data['tag_id']??0);if(!$tagId)throw new RuntimeException('Identification manquante');
    $stmt=$pdo->prepare("SELECT mt.id,mt.media_id,mt.person_id,COALESCE(mt.tag_type,'person') AS tag_type,p.first_name,p.last_name FROM media_tags mt JOIN persons p ON p.id=mt.person_id WHERE mt.id=?");$stmt->execute([$tagId]);$tag=$stmt->fetch();if(!$tag)throw new RuntimeException('Identification introuvable');
    $pdo->prepare('DELETE FROM media_tags WHERE id=?')->execute([$tagId]);
    $remaining=$pdo->prepare('SELECT COUNT(*) FROM media_tags WHERE media_id=? AND person_id=?');$remaining->execute([$tag['media_id'],$tag['person_id']]);
    if((int)$remaining->fetchColumn()===0){
        $pdo->prepare("DELETE FROM media_links WHERE media_id=? AND entity_type='person' AND entity_id=? AND media_tag_id IS NOT NULL")->execute([$tag['media_id'],$tag['person_id']]);
    }
    log_change($pdo,'media',$tag['media_id'],'untag','Suppression de '.($tag['tag_type']==='signature'?'la signature':'l\'identification').' de '.trim($tag['first_name'].' '.$tag['last_name']).' sur le média #'.$tag['media_id']);
    return ['id'=>$tagId,'media_id'=>$tag['media_id'],'person_id'=>$tag['person_id']];
}

/** Nom et années de quelques personnes (Apparence : fiches qui ont un réglage particulier). */
function person_labels(PDO $pdo, string $ids): array
{
    $list = array_values(array_unique(array_filter(array_map('intval', explode(',', $ids)), static fn(int $id): bool => $id > 0)));
    if (!$list) { return []; }
    $list = array_slice($list, 0, 500);
    $stmt = $pdo->prepare('SELECT * FROM (' . person_select() . ') WHERE id IN (' . implode(',', array_fill(0, count($list), '?')) . ')');
    $stmt->execute($list);
    return array_map(static fn(array $r): array => ['id' => (int) $r['id'], 'prefix' => $r['prefix'] ?? '', 'first_name' => $r['first_name'] ?? '',
        'middle_name' => $r['middle_name'] ?? '', 'last_name' => $r['last_name'] ?? '', 'suffix' => $r['suffix'] ?? '',
        'birth_year' => $r['birth_year'] ?? null, 'death_year' => $r['death_year'] ?? null], $stmt->fetchAll(PDO::FETCH_ASSOC));
}
