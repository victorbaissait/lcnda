# 👪🌐 Site familial en ligne — fondations et ce qui reste

Maquette validée : `docs/design/site-familial-comptes.html` (§6 et « Questions pour toi »).
Règles retenues : **l'ordinateur de l'utilisateur fait foi** ; l'en-ligne n'est qu'une **copie + boîte aux lettres**
(« 🌐 Publier / 📨 Relever ») ; **aucun vivant en ligne** dans la v1 ; connexion par **lien d'invitation puis mot de passe
choisi** ; prévenir par **une pastille sur la cloche**, jamais par e-mail.

## Ce qui existe (partie maison, livrée)

- `lib/comptes_famille.php` : comptes, invitations, droits (👁 ✎ 🌿 ⚙), vie privée, propositions, ↶, journal.
- `famille.php` + `assets/js/app-famille.js` : la page des invités (réseau de la maison, appareils acceptés par la porte).
- `assets/js/heritage-comptes-famille.js` : Réglages → 👪 Site familial (comptes, 📨 file, 📜 journal, 🌐 en ligne).
- Essais : `tests/test-comptes-famille.js`.

## Ce qui est posé pour l'en-ligne (fondations, `lib/comptes_famille_en_ligne.php`)

### 🌐 Publier — le paquet

`api.php?action=fc_publish_export&photos=1` (ordinateur principal seulement) fabrique un `.zip` :

| fichier | contenu |
|---|---|
| `manifest.json` | `format: "lcnda-site-familial"`, `version: 1`, `publication` (32 hex, tiré au hasard), `made`, `title`, `counts` (`living: 0`, `private: 0`, et ce qui reste à la maison), `files` (SHA-256 et taille de chaque fichier), `boite` (le format attendu au retour) |
| `arbre.json` | les données de « 📤 Partager avec la famille » (`family_share_build`), toujours en mode « vivants cachés », sans notes ni documents, avec `publication` |
| `photos/m<N>.jpg`, `photos/t<N>.jpg` | photos réenregistrées (sans EXIF), seulement celles où aucune personne cachée ne figure |

Contrôles : `family_share_check` (aucun nom de personne cachée, aucun renseignement d'un vivant) puis un contrôle de plus
(aucune fiche `lv`, aucun numéro de copie donné à une personne vivante ou confidentielle). Les événements 🔒 sont retirés
(`private_events_shadow`). Les numéros de la base ne partent pas : la correspondance « numéro de copie → fiche » reste sur
l'ordinateur (table `fc_publish`).

### 📨 Relever — la boîte aux lettres

`api.php?action=fc_write` avec `{op: "releve", boite: "<le JSON>"}` (2 Mo au plus) :

```json
{"format": "lcnda-boite-famille", "version": 1, "publication": "<celle du paquet>",
 "items": [
   {"compte": "Odile", "kind": "fait", "fiche": 12, "field": "DEAT", "value": {"date": "4 février 1951", "place": "Naves"}, "comment": "livret de famille"},
   {"compte": "Odile", "kind": "note", "fiche": 12, "text": "Elle allait à pied au marché…"},
   {"compte": "Odile", "kind": "personne", "fiche": 12, "relation": "enfant", "first_name": "Pierre", "last_name": "MAZAUD", "birth": {"date": "1931", "place": "Naves"}}
 ]}
```

`fiche` = numéro de la copie publiée. Chaque élément est relu exactement comme une proposition de la maison
(`fc_read_proposal` : champs permis `first_name`, `last_name`, `occupation`, `BIRT`, `BAPM`, `DEAT`, `BURI` ; vivants et
fiches 🔒 introuvables ; longueurs bornées), puis rangé **en attente** (`🌐 Odile`, origine `en_ligne`). Une publication
inconnue est refusée ; un élément déjà relevé n'est pas recopié. Rien n'entre dans l'arbre sans « ✓ Accepter ».

## Ce qui reste à faire (pas livré)

1. **La petite app PHP sur l'hébergement** : montrer `arbre.json` (lecture), gérer les comptes en ligne (lien d'invitation à
   usage unique 7 jours, mot de passe choisi, haché ; 5 essais → blocage), recueillir les propositions dans `boite.json` ;
   aucune page d'administration de l'arbre ; secrets fabriqués au premier lancement ; HTTPS obligatoire ; « ⛔ Fermer le site ».
2. **L'envoi** : réutiliser l'FTPS de « 📤 Mon site web → Publier en ligne » (`lib/website_publish.php`, certificat vérifié,
   identifiants hors de la base), vérifier PHP 8 + SQLite + HTTPS, puis « 🌐 Publier » / « 📨 Relever » en un clic.
3. **Les comptes en ligne** créés depuis l'ordinateur (même tableau « 👥 Comptes », colonne « où : 🏠 / 🌐 »).
4. **Photos proposées en ligne** (vérifiées comme celles du téléphone avant d'entrer dans la file) — refusées pour l'instant.
5. **🌿 en ligne** : écrites dans une file à part, arrivées « déjà acceptées mais annulables » au Relever.
6. Le journal des visites en ligne (« Odile a consulté 14 fiches · relevé au dernier Relever »).
7. L'avertissement « une copie chez ton hébergeur, c'est une copie hors de chez toi » avant le premier envoi.
