# 🔍 Le menu de choix unique (`app-picker.js`)

Mode d'emploi pour un développeur (ou un futur Claude) qui crée ou modifie un outil de LCNDA.

> **Règle obligatoire** (docs/REGLES-INTERFACE.md, validée par l'utilisateur) : dès qu'un outil fait **choisir quelque chose
> dans la base** — une personne, un lieu, une source, un média, une enquête, une battue, une étiquette, une maison, une revue,
> un employeur, un recensement — il utilise **ce** champ, tel quel.
> **Interdit** : un `<input>` + une liste de suggestions faits à la main, un `<datalist>`, un `api('search', …)` branché
> sur une case, un nouveau `collectionPersonField`. Si une sorte manque, on l'ajoute ici (voir « Ajouter une sorte »).
>
> Ne changent pas : les petits menus à choix fixes (Portrait / Paysage, Style, État…) restent des `<select>` simples.

Maquettes validées : `docs/design/choix-personne.html`, `docs/design/choix-personnes-roles.html`,
`docs/design/choix-lieux-et-autres.html`, `docs/design/choix-image.html` (images, sons, vidéos : voir plus bas).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `assets/js/app-picker.js` | le composant (champ, liste, pastilles, rôles, lecture, petite fenêtre) |
| `assets/css/picker.css` | ses styles, variante sombre comprise (`:root[data-theme="dark"]`) |
| `lib/picker.php` | la recherche : `picker_search()` (GET `picker_search`) et `picker_place_adopt()` (POST) |
| `assets/js/app-media-picker.js` | 🖼 la fenêtre des images, sons et vidéos (`openMediaPicker`) et son champ (`mediaField`) |

`index.php` charge `assets/css/picker.css` et `assets/js/app-picker.js` (après `app.js` de préférence ; l'ordre n'est pas
obligatoire). Les fonctions sont sur `window.LCNDA_PICKER` et aussi sur `window.LCNDA_APP` (`A().pickerField(…)`,
`A().openPicker(…)`…), ou groupées dans `A().picker`.

Le champ **se lie tout seul** : on insère le HTML renvoyé par `pickerField()` n'importe où (innerHTML, fenêtre,
panneau…), un `MutationObserver` s'en occupe. Aucun « bind » à appeler.

Pour le titre du champ, mettre `<span class="pk-lab">Personne</span>` juste avant. Si le champ est quand même posé dans
un `<label>`, le composant empêche qu'un clic sur ses boutons ou ses lignes soit renvoyé vers une case du label.

## Exemples à copier

```js
const P = window.LCNDA_PICKER; // ou A()

// 1. Une personne (un seul choix) — la valeur part dans le formulaire sous name="person_id"
form.innerHTML += `<label>Personne</label>${P.pickerField({name: 'person_id', kind: 'person', value: row.person_id})}`;
// value : un numéro, ou un objet {id, title, …} déjà connu (évite une relecture), ou null

// 2. Plusieurs personnes
P.pickerField({name: 'people', kind: 'person', multiple: true, value: [12, 45]});
// → <input type=hidden name="people" value="12,45">

// 3. Un nom libre accepté (faire-part, revues…) : « ✎ Garder le texte « … » sans fiche »
P.pickerField({name: 'author', kind: 'person', allowFree: true, value: 'txt:le curé Lafon'});

// 4. Personne principale + principales + secondaires, avec des rôles (enquêtes, actes, recensements…)
P.pickerField({name: 'people_json', kind: 'person', roles: {main: true}, value: {main: 12, people: [{id: 45, role: 'épouse', primary: true}, {txt: 'le curé Lafon', role: 'témoin'}]}});
// roles: {main: false} → pas de « Personne principale », seulement les deux zones
// roles: {main: true, roleList: ['témoin', 'parrain', …]} → autre liste de rôles proposés (un mot libre reste possible)

// 5. Afficher (lecture) les personnes d'une enquête : principale en grand, ★ Principales, ☆ Secondaires
box.innerHTML = P.pickerView(JSON.parse(row.people_json));
// les entrées sans titre (simples numéros) sont relues toutes seules ; clic = ouvrir la fiche ; « ? » = sans fiche

// 6. Un lieu (une ville du monde choisie entre dans la base au moment du choix : la valeur est toujours un id de places)
P.pickerField({name: 'place_id', kind: 'place', value: event.place_id});
P.pickerField({name: 'places', kind: 'place', multiple: true});

// 7. Une autre sorte
P.pickerField({name: 'source_id', kind: 'source'});
P.pickerField({name: 'label_ids', kind: 'label', multiple: true});
// kinds : person, place, source, media, investigation, battue, label, house, periodical, employer, census, artwork, graph

// 📈 un de mes graphiques (table custom_widgets, lib/graphs.php) : la valeur est le numéro de ligne (item.id) ; l'identifiant
// du graphique (cw_…) est dans item.uid. Case vide = tous les graphiques ; « ＋ Nouveau graphique » / « ＋ Créer le graphique « … » »
// ouvrent l'Éditeur de graphiques (allowCreate: true). filter.graph_kinds : sortes de définitions (« chart,appstat » = ceux qui
// se posent comme un diagramme ; sans filtre = tous les graphiques). ext.pickMyGraph() s'en sert.
P.pickerField({name: 'g', hiddenName: false, kind: 'graph', allowCreate: true, filter: {graph_kinds: 'chart,appstat'}});

// 🎨 une fiche du moteur des œuvres (disque, morceau, œuvre d'art, exposition, type créé par l'utilisateur…) : docs/TYPES.md
P.pickerField({name: 'release', kind: 'artwork', filter: {art_kind: 'release,master', art_person: 12}});
// valeur : l'id de la fiche (items.id) ; l'item a art_kind (la sorte) ; « ↗ Ouvrir » ouvre la fiche dans son catalogue

// 8. Recherche mélangée (filtres « Tout (9) · 👤 Personnes (2)… », Tab passe d'un filtre à l'autre)
P.pickerField({name: 'target', kind: 'person,place,investigation,house,source'});
// la valeur est alors l'id de la chose ; l'item complet (avec sa sorte) est dans picker-change → detail.item.kind

// 9. Juste un bouton « Choisir quelqu'un » : petite fenêtre, résout l'item choisi ou null (Annuler, Échap)
const it = await P.openPicker({kind: 'person', title: 'Choisir le marié'});
if (it) linkPerson(it.id, it.title);
const list = await P.openPicker({kind: 'place', multiple: true}); // tableau d'items (bouton « Choisir »)

// 10. Lire / remplir un champ déjà affiché
P.pickerValue(fieldEl);           // 12 | 'txt:…' | [12, 45] | {main, people} | null
P.pickerSet(fieldEl, 45);         // ne déclenche pas picker-change
```

Options de `pickerField` : `name` (obligatoire), `kind` (`'person'` par défaut, ou plusieurs séparées par des virgules),
`value`, `multiple`, `placeholder` (le texte d'aide est déjà le bon, à ne changer que si besoin), `allowFree` (nom
libre), `allowCreate` (par défaut : « ＋ Créer » pour les personnes et les lieux seulement ; `true` l'ajoute aux autres
sortes — l'outil doit alors écouter `picker-create`), `roles`, `animals: false` (sans les animaux), et :

- `hiddenName: false` (ou `name: ''`) : le champ caché n'a pas d'attribut `name` — rien n'est ajouté au formulaire
  autour ; on lit la valeur avec `pickerValue()` ou dans `picker-change`.
- `inline: true` : la liste s'ouvre dans le flux (sous la case, en poussant la suite) au lieu de flotter — pour les
  petites fenêtres qui défilent (`openPicker` le fait toujours). Sans cette option, la liste flotte sous la case, s'ouvre
  vers le haut si la place manque dessous, et passe en position fixe sur l'écran si un conteneur qui coupe
  (`overflow: hidden/auto`) est trop petit.
- `filter: {person_id, media_type}` (médias) : seulement les médias rattachés à cette personne, et/ou d'un type
  (`image`, `audio`, `video`, `document`). Ex. `pickerField({name: 'media_id', kind: 'media', filter: {person_id: 12, media_type: 'image'}})`.
  Pour choisir une image, un son ou une vidéo **à l'œil**, c'est `mediaField` / `openMediaPicker` (plus bas) ; `kind: 'media'`
  ne sert plus que dans une recherche mélangée.
- `roles: {roleList: false}` (ou `[]`) : pas de menu « rôle ▾ » du tout (un rôle déjà enregistré reste affiché, en simple texte).

La case montre le symbole de la sorte (🔍 personne, 📍 lieu, 📚 source, 🖼 média, 🔍 enquête, 🧭 battue, 🏷 étiquette,
🏠 maison, 📰 revue, 🏭 employeur, 📋 recensement ; 🔍 en recherche mélangée).

## Format des valeurs (champ caché `name=…`)

| Cas | Valeur |
| --- | --- |
| une chose | `"12"` (id) ; nom sans fiche : `"txt:le curé Lafon"` ; rien : `""` |
| `multiple` | `"12,45,txt:Lafon"` |
| `roles` | JSON `{"main":12,"people":[{"id":45,"role":"épouse","primary":true},{"txt":"le curé Lafon","role":"","primary":false}]}` |

Côté PHP : `safe_int()` pour un id ; pour `txt:` garder le texte ; pour les rôles `json_decode(…, true)`.

## Événements (émis sur le champ `.pk`, ils remontent)

| Événement | `detail` | Quand |
| --- | --- | --- |
| `picker-change` | `{name, kind, value, item}` (ou `items`) | après chaque choix, retrait, rôle, ★/☆ |
| `cp-pick` | `{id, name, field}` | compatibilité avec l'ancien `collectionPersonField` (personne, un seul choix) : seulement quand une fiche est choisie (id > 0), pas au retrait |
| `change` | — | sur l'`<input type=hidden>` (pour les formulaires qui écoutent `change`) |
| `picker-create` | `{kind, text, field, target, pick(item)}` | « ＋ Créer… ». Appeler `e.preventDefault()` pour s'en occuper, puis `e.detail.pick({id, title})` pour choisir la fiche créée. Sinon : personne → fenêtre « Nouvelle fiche » préremplie, la fiche enregistrée est choisie ; lieu → créé tel quel dans `places`. |
| `picker-open` | `{kind, id, item}` | « ↗ Fiche / ↗ Lieu / ↗ Ouvrir ». `preventDefault()` pour ouvrir soi-même. Sinon : personne → `openPersonById`, enquête, battue, maison → leur écran ; le reste → petit message. |
| `picker-map` | `{kind:'place', text, item, field, pick(item)}` | « 🗺 Choisir sur la carte » ou 🗺 d'une pastille. `preventDefault()` + `pick(item)` pour renvoyer le lieu choisi sur la carte. Sinon : une petite carte s'ouvre (fond de carte de l'app, `mapTileUrl`) ; un clic propose les lieux de ta base et les communes les plus proches (`near=`), ou « ＋ Créer un lieu ici » (avec ses coordonnées). |

```js
panel.addEventListener('picker-change', e => { if (e.detail.name === 'place_id') refreshMap(e.detail.value); });
panel.addEventListener('picker-create', e => { if (e.detail.kind !== 'source') return; e.preventDefault(); openSourceDialog(e.detail.text).then(src => src && e.detail.pick({id: src.id, title: src.title})); });
```

## Clavier

↑ ↓ pour choisir, Entrée pour valider, Échap pour fermer la liste (sans fermer la fenêtre autour), Tab / Maj+Tab
d'un filtre à l'autre en recherche mélangée, Retour arrière dans une case vide retire la dernière pastille (`multiple`).
« #45 » cherche la fiche n° 45, « sosa 12 » le Sosa 12.

## Côté serveur : `picker_search`

`GET api.php?action=picker_search&kind=…&q=…&offset=0&limit=30&animals=1` (ou `&ids=3,7` pour relire des fiches) →

```json
{"groups":[{"kind":"place","key":"base","label":"Dans ta généalogie","total":3,"items":[…]}],"more":true,"next_offset":30}
```

Item : `{kind, id, title, meta, badge, badge_style ('blue'|''), group, icon?, color?, thumb?, initials?, gender?, ref?, short?}`.
`short` = petite info de la pastille (années, département). Le Sosa est ajouté côté navigateur (`sosaNumberFor`).

Champs en plus selon la sorte :

| Sorte | Champs |
| --- | --- |
| lieu (`base`, `fr`, `world`) | `name` (nom seul, sans « (Gers) »), `lat`, `lon`, `country`, `county` (département), `dept` (n° de département, France), `insee` (code commune, France), `place_name` (« Nom, Département, Pays »), `state_name` ; `distance_km` avec `near=` |
| média | `filename`, `thumb` (`media/…`), `media_type` |
| personne | `initials`, `gender` (`male`/`female`/`unknown`), `thumb` (portrait), `kind: 'animal'` pour un animal |
| étiquette | `color` |
| artwork (fiches du moteur) | `art_kind` (clé du type), `thumb` (première photo) ; filtres `art_kind=` (types, séparés par des virgules) et `art_person=` |
| enquête | `person_id` |
| employeur | `key` |
| graphique | `uid` (cw_…), `thumb` (vignette PNG), `graph_kind`, `places` (nombre d'endroits où il est posé) ; filtre `graph_kinds=` |

Autres paramètres GET : `person_id=` et `media_type=` (médias), `near=lat,lon` (lieux les plus proches d'un point :
groupes `base` puis `fr`, distance dans la ligne grise).

- Personnes : prénom / 2e prénom / nom / variantes de noms / lieu de naissance ou de décès, sans accents ; NOM en capitales ;
  « ° date lieu · † date lieu » ; indice « fils de… / épouse de… » quand un autre a le même nom ; nom qui commence par la
  frappe d'abord.
- Lieux : trois groupes paginés bout à bout (`base`, `fr` sans les hameaux homonymes, `world` avec `ref` = geoname_id et
  `id` = null). Mots en plus pour préciser : numéro ou nom de département, région, pays (« saint-martin 32 »,
  « springfield usa ») ; le serveur essaie les découpages nom / précision et garde le premier qui trouve.
  Exact > commence par > début de mot > contient, puis les plus peuplées.
- Médias : titre, nom de fichier, description, titre et cote du document (`document_reference`), noms des personnes rattachées.
- Recensements : adresse, lieu, année, notes, et noms des membres du foyer (nom relevé et fiche liée).
- `POST picker_place_adopt {geoname_id}` → `{id, item}` : la ville du monde entre dans `places` (`place_from_world`).
  `{name, country?, lat?, lon?}` sans geoname_id : crée un lieu tapé à la main ou cliqué sur la carte.
- Toutes les requêtes sont préparées ; `q` n'est jamais collé dans le SQL. Une table absente (ancienne base) donne une
  liste vide, sans erreur.

## 🖼 Choisir une image, un son, une vidéo : `openMediaPicker` / `mediaField`

> **Règle obligatoire** (docs/REGLES-INTERFACE.md, « Choisir une image… », maquette `docs/design/choix-image.html`) :
> partout où l'on prend une image, un son ou une vidéo **de l'app**, c'est cette fenêtre — jamais une galerie faite à la
> main, ni `api('list', {type: 'media'})` branché sur une grille. Un simple `<input type=file>` pour un fichier de
> l'ordinateur seul ne change pas.

Fichiers : `assets/js/app-media-picker.js` (à charger après `app-picker.js`), styles dans `assets/css/picker.css`
(bloc « Choisir une image »), recherche `picker_search` avec `kind=media` (`lib/picker.php`). Les fonctions sont sur
`window.LCNDA_PICKER`, `window.LCNDA_APP` et `window.LCNDA_MEDIA_PICKER`.

```js
const P = window.LCNDA_PICKER; // ou A()

// 1. Un bouton « Choisir une image » : une image (ou null si Annuler / Échap)
const m = await P.openMediaPicker({types: ['image'], title: 'La photo du faire-part', okLabel: 'Prendre cette photo'});
if (m) img.src = `media/${encodeURIComponent(m.filename)}`;

// 2. Plusieurs : une liste (cases ✓, « Utiliser ces N images ») ; null si Annuler
const list = await P.openMediaPicker({multiple: true, types: ['image']});

// 3. Sons et vidéos (vignette ▶ et durée), filtrés d'office sur la personne de l'outil (pastille « 👤 Nom × »)
const av = await P.openMediaPicker({types: ['video', 'audio'], person: personId, eyebrow: 'MONTAGE', title: 'Ajouter un rush'});

// 4. Dans un formulaire : la pastille du champ (petite vignette, titre, année, « ↗ Ouvrir », « 🖼 Changer », ×) + champ caché
form.innerHTML += `<span class="pk-lab">Photo</span>${P.mediaField({name: 'media_id', types: ['image'], person: 12, value: row.media_id})}`;
P.mediaField({name: 'media_ids', multiple: true, value: [4, 5]});   // → <input type=hidden name="media_ids" value="4,5">
form.addEventListener('media-change', e => console.log(e.detail.item)); // aussi « picker-change » et « change » sur le champ caché
P.mediaValue(fieldEl);       // 12 | [4, 5] | null
P.mediaSet(fieldEl, 45);     // ne déclenche pas media-change

// 5. Boutons en plus dans la barre (ex. « 📂 Projets ») : HTML dans extra, branchés dans onOpen
await P.openMediaPicker({extra: '<button type="button" class="mpk-chip" data-x>📂 Projets</button>',
    onOpen: (dlg, {finish, close}) => dlg.querySelector('[data-x]').addEventListener('click', () => { close(); openProjects(); })});
```

Options de `openMediaPicker` : `types` (`['image']` par défaut ; `'audio'`, `'video'`, `'document'`), `multiple`,
`person` (id ou `{id, title}` : filtre mis d'office, qu'on peut retirer), `title`, `eyebrow`, `intro` (une phrase sous
le titre), `okLabel`, `allowImport` (`true` par défaut : glisser-déposer, ⌘V, « 📁 Importer… », « 📋 Coller »),
`value` (ids déjà choisis), `flags: true` (filtres « 📝 Pas encore transcrites », « ✅ Déjà transcrites »,
« ✍ Avec une signature repérée » ; `flag: 'sig'` en met un d'office), `portraits: true` (« ⭐ Portraits » d'office),
`extra` / `onOpen`. Options de `mediaField` : `name` (`''` = rien dans le formulaire), `types`, `multiple`, `person`,
`value` (id, objet `{id, title, filename, thumb}` ou liste), `title`, `okLabel`, `placeholder`, `allowImport`.

L'item rendu (comme les autres sortes du menu de choix) : `{kind: 'media', id, title, filename, thumbnail, thumb
('media/…'), media_type ('image'|'audio'|'video'|'document'|'pdf'), sort ('photo'|'document'|'audio'|'video'), tag
(PHOTO, ACTE, CARTE, PORTRAIT, LETTRE, TOMBE, SON, VIDÉO…), year, date_text, place (lieu de l'événement lié), cote,
duration (secondes, si connue), portrait (0/1), has_tr (0/1), people_ids, people_count, imported (true si importé dans
la fenêtre)}`. Pour la transcription ou la description : `await P.loadMedia([id], true)`.

Dans la fenêtre : filtres avec le nombre trouvé (« Tout (n) », « 📷 Photos », « 📄 Documents », « 🎧 Sons »,
« 🎬 Vidéos », la personne, « 🕘 Récentes » = les 40 derniers ajoutés et les derniers choisis, « ⭐ Portraits » =
cochés « photo de la personne » ou portrait d'une fiche) ; taille des vignettes (grandes, petites, liste) retenue
(`localStorage`, clé `lcnda-media-picker-size`) ; la liste se charge en descendant (40 par 40) ; clavier ↑ ↓ ← →,
Espace (cocher), Entrée (valider), Échap (fermer, seulement cette fenêtre : elle s'empile au-dessus des éditeurs plein
écran) ; une seule image : clic = choisie, double-clic ou Entrée = prise. À droite, l'aperçu : taille lue sur l'image
et « assez grande pour imprimer en A6 / A5 / A4 » à 300 ppp (sinon « petite : écran seulement »), cote, personnes
liées (un clic montre leurs médias), « ↗ Ouvrir le média » (la visionneuse, par-dessus ; `picker-open` sur `document`
pour s'en occuper soi-même). Un fichier importé passe par `api.php?action=retouch_media` (`kind=image|audio|video`) :
il entre dans les Médias, sans fiche, reste en tête de la grille et se coche.

Côté serveur (`picker_search`, `kind=media`) : `media_types=image,audio`, `media_sort=photo|document|audio|video`,
`portraits=1`, `recent=1` (+ `recent_ids=`), `media_flag=notr|tr|sig`, `person_id=`, `counts=1` (→ `counts:
{all, photo, document, audio, video, portraits, recent}` pour la recherche en cours, sans la sorte choisie),
`with_text=1` (avec `transcription` et `description`). La recherche porte aussi sur la date et sur le lieu et
l'année des événements liés. Requêtes préparées ; une colonne absente (ancienne base) est remplacée par une valeur vide.

Une grille qui n'est pas faite de médias (signatures repérées, objets de famille du musée) reprend le même style :
`<div class="mpk-grid size-big">` et des `<button class="mpk-tile">` avec `.mpk-im`, `.mpk-ty`, `.mpk-tt`, `.mpk-ck`.

## Ajouter une sorte

1. **Serveur** (`lib/picker.php`) : ajouter la sorte à `PICKER_KINDS` et `PICKER_LABELS`, écrire
   `picker_xxx(PDO $pdo, string $q, int $offset, int $limit): array` qui renvoie `['total' => n, 'items' => [...]]`
   (s'inspirer de `picker_sources` : `picker_text_where()` pour le filtre texte — il gère aussi `ids=` —,
   `picker_page()` pour compter et paginer, `picker_table_exists()` si la table peut manquer), puis l'ajouter au
   `match` de `picker_kind()`.
2. **Navigateur** (`assets/js/app-picker.js`) : une ligne dans `K` : symbole (`sym`), texte d'ajout (`add`), nom
   (`one`, `many` si pluriel irrégulier, `fem` si féminin), `none` (« Aucune … »), `label` (filtre de la recherche
   mélangée). Vignette : renvoyer `thumb` ; pastille de couleur : `color` (comme les étiquettes).
3. Si « ↗ Ouvrir » doit ouvrir un écran précis sans que chaque outil écoute `picker-open`, l'ajouter dans `openItem()`.
4. Tester : liste, clavier, pastille, mode sombre (`document.documentElement.dataset.theme = 'dark'`), écran de 390 px.
