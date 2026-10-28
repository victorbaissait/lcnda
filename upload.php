<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error'=>'Méthode refusée'],405);
    // Plusieurs généalogies : une fenêtre restée sur une autre généalogie n'envoie pas ses fichiers dans celle-ci (même règle qu'api.php)
    $pageGenealogy = $_SERVER['HTTP_X_GENEALOGY'] ?? null;
    if (is_string($pageGenealogy) && $pageGenealogy !== (GENEALOGY_ID === '' ? 'main' : GENEALOGY_ID)) json_response(['error'=>'Une autre généalogie a été ouverte dans une autre fenêtre : recharge la page.','genealogy_changed'=>true],409);
    verify_csrf($_POST);
    kiosk_guard('upload', true);
    $personId=safe_int($_POST['person_id']??0);$eventId=safe_int($_POST['event_id']??0);$censusId=safe_int($_POST['census_id']??0);$investigationId=safe_int($_POST['investigation_id']??0);$battueItemId=safe_int($_POST['battue_item_id']??0);$archiveDigestId=safe_int($_POST['archive_digest_id']??0);$archiveDigestPageNumber=safe_text($_POST['archive_digest_page_number']??'');$title=safe_text($_POST['title']??'');
    $documentReference=safe_text($_POST['document_reference']??'');$documentTitle=safe_text($_POST['document_title']??'');$documentUrl=safe_text($_POST['document_url']??'');$documentPages=safe_text($_POST['document_pages']??'');
	    $isPersonPhoto=isset($_POST['is_person_photo'])&&$_POST['is_person_photo']!=='0'?1:0;
	    $mediaSubjectType=safe_text($_POST['media_subject_type']??'');
	    if(!in_array($mediaSubjectType,['','grave_photo','war_memorial_photo','voter_card','id_card','driving_permit'],true))$mediaSubjectType='';
    // Photo d'un objet de famille ou d'un souvenir (mémoire familiale) : rattachée à la collection, pas à une personne
    $collectionType=safe_text($_POST['collection_type']??'');$collectionId=safe_int($_POST['collection_id']??0);
    if(!in_array($collectionType,HERITAGE_COLLECTION_TYPES,true)){$collectionType='';$collectionId=0;}$collectionRole=mb_substr(safe_text($_POST['collection_role']??''),0,40);
    if($collectionType&&!$collectionId)throw new RuntimeException('Objet ou souvenir manquant');
    if(!$personId&&!$battueItemId&&!$archiveDigestId&&!$collectionType)throw new RuntimeException('Personne, annotation de battue ou dépouillement manquant');
    if(empty($_FILES['files']))throw new RuntimeException('Aucun fichier reçu');
    $files=$_FILES['files'];$count=is_array($files['name'])?count($files['name']):1;$allowed=[
        'image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/gif'=>'gif','application/pdf'=>'pdf',
        'audio/mpeg'=>'mp3','audio/mp4'=>'m4a','audio/x-m4a'=>'m4a','audio/wav'=>'wav','audio/x-wav'=>'wav','audio/ogg'=>'ogg',
        'audio/aiff'=>'aif','audio/x-aiff'=>'aif','audio/aifc'=>'aifc','audio/x-aifc'=>'aifc',
        'video/mp4'=>'mp4','video/quicktime'=>'mov','video/webm'=>'webm','audio/webm'=>'webm'
    ];$pdo=db();$isPostcard=isset($_POST['postcard_pair'])&&$_POST['postcard_pair']!=='0';$isGroupedUpload=isset($_POST['group_upload'])&&$_POST['group_upload']!=='0';if($isPostcard&&$count!==2)throw new RuntimeException('Une carte postale recto/verso doit contenir exactement deux images : recto puis verso.');$postcardGroup=($isPostcard||($isGroupedUpload&&$count>1))?bin2hex(random_bytes(8)):'';$investigationFolderId=safe_int($_POST['investigation_folder_id']??0)?:null;if($investigationFolderId){$folderCheck=$pdo->prepare('SELECT 1 FROM investigation_media_folders WHERE id=? AND investigation_id=?');$folderCheck->execute([$investigationFolderId,$investigationId]);if(!$folderCheck->fetchColumn())throw new RuntimeException('Dossier d’enquête introuvable.');}$pdo->beginTransaction();$created=[];
    try{
        // Fiche verrouillée : on n'y rattache pas de nouveau média (ni à l'un de ses événements)
        if($personId&&!$battueItemId&&!$archiveDigestId&&!$collectionType&&!$investigationId){
            $lockCheck=$pdo->prepare('SELECT COALESCE(is_locked,0) FROM persons WHERE id=?');$lockCheck->execute([$personId]);
            if((int)$lockCheck->fetchColumn()===1)throw new RuntimeException('Fiche verrouillée. Déverrouille-la avant de modifier ou supprimer cette personne.');
        }
        if($battueItemId){
            $checkBattueItem=$pdo->prepare('SELECT 1 FROM battue_search_items WHERE id=?');
            $checkBattueItem->execute([$battueItemId]);
            if(!$checkBattueItem->fetchColumn())throw new RuntimeException('Annotation de battue introuvable.');
            $eventId=0;
            $censusId=0;
            $investigationId=0;
        }
        if($archiveDigestId){
            $checkArchiveDigest=$pdo->prepare('SELECT 1 FROM archive_digest_entries WHERE id=?');
            $checkArchiveDigest->execute([$archiveDigestId]);
            if(!$checkArchiveDigest->fetchColumn())throw new RuntimeException('Dépouillement d’archive introuvable.');
            $eventId=0;
            $censusId=0;
            $investigationId=0;
        }
        if(!$investigationId&&!$censusId&&!$battueItemId&&!$archiveDigestId&&!$collectionType&&$personId&&($_POST['create_event']??'')==='1'){
            $typeId=safe_int($_POST['create_event_type_id']??0);
            if(!$typeId)throw new RuntimeException('Choisis le type de l’événement à créer.');
            $date=safe_text($_POST['create_event_date']??'');
            preg_match('/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/',$date,$m);$year=isset($m[1])?(int)$m[1]:null;
            $placeId=null;$placeName=safe_text($_POST['create_event_place']??'');$country=safe_text($_POST['create_event_country']??'France');
            if($placeName!==''){$find=$pdo->prepare('SELECT id FROM places WHERE name=? COLLATE NOCASE AND country=? COLLATE NOCASE LIMIT 1');$find->execute([$placeName,$country]);$placeId=$find->fetchColumn();if(!$placeId){$pdo->prepare('INSERT INTO places(name,country) VALUES(?,?)')->execute([$placeName,$country]);$placeId=(int)$pdo->lastInsertId();}}
            $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id,title,description,address) VALUES('person',?,?,?,?,?,?,?,?)")
                ->execute([$personId,$typeId,$date,$year,$placeId?:null,safe_text($_POST['create_event_title']??''),safe_text($_POST['create_event_description']??''),'']);
            $eventId=(int)$pdo->lastInsertId();
            log_change($pdo,'event',$eventId,'create','Événement créé pendant l’import média pour la fiche #'.$personId);
        }
        if($censusId){
            $check=$pdo->prepare('SELECT 1 FROM census_members WHERE census_id=? AND person_id=?');
            $check->execute([$censusId,$personId]);
            if(!$check->fetchColumn())throw new RuntimeException('Ce recensement n’est pas rattaché à cette personne.');
            $eventId=0;
        }
        for($i=0;$i<$count;$i++){
            $name=is_array($files['name'])?$files['name'][$i]:$files['name'];$tmp=is_array($files['tmp_name'])?$files['tmp_name'][$i]:$files['tmp_name'];$error=is_array($files['error'])?$files['error'][$i]:$files['error'];$size=is_array($files['size'])?$files['size'][$i]:$files['size'];
            if($error!==UPLOAD_ERR_OK){ // dire pourquoi, en français
                $extE=strtolower(pathinfo((string)$name,PATHINFO_EXTENSION));$okExt=array_merge(array_values($allowed),['jpeg','jpg','tif','tiff','aif','aiff','aifc','m4a','mov']);
                if($extE!==''&&!in_array($extE,$okExt,true))throw new RuntimeException("Format non accepté : {$name} (ici : photos, PDF, sons ou vidéos).");
                if($error===UPLOAD_ERR_INI_SIZE||$error===UPLOAD_ERR_FORM_SIZE)throw new RuntimeException("{$name} est trop gros pour être envoyé (au plus ".ini_get('upload_max_filesize')." par fichier avec les réglages actuels).");
                if($error===UPLOAD_ERR_NO_FILE)throw new RuntimeException('Aucun fichier reçu : choisis-le à nouveau.');
                if($error===UPLOAD_ERR_PARTIAL)throw new RuntimeException("L’envoi de {$name} a été interrompu : réessaie.");
                throw new RuntimeException("Échec de l’import de {$name} : le serveur n’a pas pu le recevoir (code {$error}). Réessaie ; si ça recommence, redémarre LCNDA.");
            }
            if(($size??1)===0||@filesize($tmp)===0)throw new RuntimeException("Ce fichier est vide (0 octet) : {$name}.");
            $mime=(new finfo(FILEINFO_MIME_TYPE))->file($tmp);$ext=strtolower(pathinfo((string)$name,PATHINFO_EXTENSION));if(!isset($allowed[$mime])&&in_array($ext,['aif','aiff','aifc'],true))$mime=$ext==='aifc'?'audio/x-aifc':'audio/x-aiff';if(!isset($allowed[$mime]))throw new RuntimeException("Format non accepté : {$name}");
            $mediaType=$mime==='application/pdf'?'pdf':(str_starts_with($mime,'audio/')?'audio':(str_starts_with($mime,'video/')?'video':'image'));
            if($mediaType==='video'&&($_POST['audio_only']??'')==='1')$mediaType='audio'; // un mémo vocal enregistré (WebM sans image)
            if($isPostcard&&$mediaType!=='image')throw new RuntimeException('Une carte postale recto/verso doit contenir uniquement deux images.');
            $isAudioVideo=str_starts_with($mime,'audio/')||str_starts_with($mime,'video/');
            $limitMb=$isAudioVideo?250:25;
            if($size>$limitMb*1024*1024)throw new RuntimeException("{$name} dépasse {$limitMb} Mo");
            $stored=bin2hex(random_bytes(16)).'.'.$allowed[$mime];$destination=MEDIA_DIR.'/'.$stored;if(!move_uploaded_file($tmp,$destination))throw new RuntimeException("Impossible de copier {$name}");$movedFiles[]=$destination;
            $postcardSide=$isPostcard?($i===0?'recto':'verso'):(($isGroupedUpload&&$count>1)?'image '.($i+1):'');
            $mediaTitle=$title!==''?($count>1?"{$title} — ".($postcardSide?:pathinfo($name,PATHINFO_FILENAME)):$title):pathinfo($name,PATHINFO_FILENAME);if($postcardSide&&stripos($mediaTitle,$postcardSide)===false)$mediaTitle.=' — '.$postcardSide;
	            $pdo->prepare('INSERT INTO media(title,media_type,filename,thumbnail,document_reference,document_title,document_url,document_pages,postcard_group,postcard_side,is_person_photo,media_subject_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$mediaTitle,$mediaType,$stored,$mediaType==='image'?$stored:'',$documentReference,$documentTitle,$documentUrl,$documentPages,$postcardGroup,$postcardSide,$isPersonPhoto,$mediaSubjectType]);$mediaId=(int)$pdo->lastInsertId();
            $entityTypeOverride=safe_text($_POST['entity_type_override']??'');$allowedOverrides=['military'];
            if($collectionType){
                $pdo->prepare('INSERT INTO family_collection_media(collection_type,collection_id,media_id,position,role) VALUES(?,?,?,?,?)')->execute([$collectionType,$collectionId,$mediaId,$i,$collectionRole]);
            }elseif($archiveDigestId){
                $pdo->prepare('INSERT INTO archive_digest_media(archive_digest_id,media_id,page_number) VALUES(?,?,?)')->execute([$archiveDigestId,$mediaId,$archiveDigestPageNumber]);
            }else{
                $entityType=$battueItemId?'battue_item':($entityTypeOverride&&in_array($entityTypeOverride,$allowedOverrides,true)?'person':($censusId?'census':($eventId?'event':'person')));$entityId=$battueItemId?:($entityTypeOverride==='military'?$personId:($censusId?:($eventId?:$personId)));$pdo->prepare('INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(?,?,?,?)')->execute([$mediaId,$entityType,$entityId,microtime(true)]);
            }
            $created[]=$mediaId;
            if($investigationId){$pdo->prepare('INSERT INTO investigation_media(investigation_id,media_id,verdict,reason,folder_id) VALUES(?,?,?,?,?)')->execute([$investigationId,$mediaId,($_POST['investigation_verdict']??'interesting')==='rejected'?'rejected':'interesting',safe_text($_POST['investigation_reason']??''),$investigationFolderId]);$linkId=(int)$pdo->lastInsertId();$checkItem=$pdo->prepare('SELECT 1 FROM investigation_items WHERE id=? AND investigation_id=?');$linkItem=$pdo->prepare('INSERT OR IGNORE INTO investigation_media_items(investigation_media_id,investigation_item_id) VALUES(?,?)');foreach((array)($_POST['investigation_item_ids']??[]) as $itemId){$itemId=safe_int($itemId);$checkItem->execute([$itemId,$investigationId]);if($itemId&&$checkItem->fetchColumn())$linkItem->execute([$linkId,$itemId]);}}
        }
        if($collectionType)log_change($pdo,$collectionType,$collectionId,'upload',count($created).' média(s) ajouté(s)');
        else if($battueItemId)log_change($pdo,'battue_item',$battueItemId,'upload',count($created).' média(s) ajouté(s)');
        else if($archiveDigestId)log_change($pdo,'archive_digest',$archiveDigestId,'upload',count($created).' média(s) ajouté(s)');
        else log_change($pdo,'person',$personId,'upload',count($created).' média(s) ajouté(s)');
        $pdo->commit();json_response(['ok'=>true,'media'=>$created]);
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();foreach($movedFiles??[] as $f)@unlink($f);throw $e;} // envoi refusé : les fichiers déjà copiés repartent
}catch(Throwable $e){json_response(['error'=>$e->getMessage()],422);}
