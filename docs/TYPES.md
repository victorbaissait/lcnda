# Le moteur des fiches « œuvres et réalisations » — mode d’emploi

Disques, morceaux, œuvres d’art, livres, films… et demain sculptures, inventions, découvertes, presse, profils politique ou
sportif : **ajouter un type = ajouter une définition**. L’écran de fiche (lecture et formulaire), le panneau « ⚙️ Champs
affichés », les listes (barre H10), les liens « Lié à » et le livre (mise en page) sont pilotés par ces définitions.

Maquettes validées : A–H « Artistes » (scratchpad `artist/`), I–AC « Profils et œuvres » (`docs/design/profils-et-oeuvres.html`).
Règles d’interface : `docs/REGLES-INTERFACE.md` ; menu de choix : `docs/PICKER.md` (sorte `artwork`) ; composants : `docs/UI.md`.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `lib/art_engine.php` | tables, index, lecture, écriture, réglages, types de l’utilisateur, profils, fusion, menu de choix (`picker_art_items`) ; points d’entrée `art_api_get()` / `art_api_post()` |
| `lib/artist_catalog.php` | anciens noms (`save_artist_item`…), imports distants (`artist_remote` : Discogs, MusicBrainz, Open Library, Wikidata, TMDb, iTunes), images rapatriées |
| `lib/migrations.php` | `schema_v47` → `art_schema()` |
| `assets/js/heritage-artist.js` | **noyau** : registre `window.LCNDA_ART` (`ART`), `ART.define`, `ART.layout`, `Store`, lecture `ART.readHtml`, formulaire `ART.formHtml` / `ART.collect`, fenêtre du catalogue `ART.open(pid, opts)`, `ART.openItem(id)`, blocs de la fiche de la personne |
| `assets/js/heritage-artist-fields.js` | **types de champs** `ART.ft[...]`, vue « 🔗 Lié à », comportement du formulaire (lignes ⠿ ↑ ↓ ✕, photos, création depuis le menu de choix) |
| `assets/js/heritage-artist-panel.js` | « ⚙️ Champs affichés » (`ART.openFieldsPanel`), « ＋ Ajouter un champ », « ✎ Créer une sorte de fiche » |
| `heritage-artist-music.js`, `-art.js`, `-books.js`, `-film.js` | les **types intégrés** et leurs vues (pistes, enregistrements, provenance, expositions…) |
| `heritage-artist-page.js` | le profil « Artiste » (type `profile`), la page (`ART.pageSections`, `ART.models`, `ART.profiles`), « ⚙️ Organiser la page » |
| `heritage-artist-list.js` | listes H10 (`ART.paintList`), tri, export E3 de la liste et d’une fiche, notice imprimable |
| `heritage-artist-import.js` | « ⤒ Importer » (`ART.openImport`), `ART.discogsItem`, clés 🔑 |
| `heritage-artist-catalogue.js` | « 📖 Nouveau catalogue raisonné / 💿 Discographie » (`ext.artistCatalogue.wizard`), notices = objets dynamiques (`noticeHtml`) |
| `assets/css/artist.css` | styles (`.ar-*`), mode sombre en bas (`python3 scripts/build-dark-css.py assets/css/artist.css`) |
| `tests/test-artist.js` | serveur + navigateur (machine virtuelle) |

Ordre de chargement (`index.php`) : `heritage-artist.js` d’abord, puis `-fields`, `-panel`, les types, `-page`, `-list`, `-import`, `-catalogue`.
Un nouveau fichier de types se charge **après** `heritage-artist-fields.js`.

## Les tables (migration n°47)

| Table | Contenu |
| --- | --- |
| `items` | toutes les fiches : `type_key`, `person_id` (la personne à qui elle se rattache), `parent_id` (chaîne album → édition, morceau → enregistrement, série → saison → épisode), `title`, `date_text` + `date_min` / `date_max` (années calculées : « vers 1784 » = 1779–1789, « avant 1800 » = –1800…), `year`, `place_id`, `data` (JSON : tous les champs), `sort_order` |
| `item_types` | les types : `key`, `label`, `plural`, `icon`, `color`, `family`, `domain`, `parent_type`, `origin` (`builtin` / `user`), `version`, `def` (JSON) |
| `type_fields` | champs d’un type de l’utilisateur : groupe, ordre, `kind` (sorte), `settings` JSON, `vis_fiche` / `vis_list` / `vis_card` / `vis_export`, `filterable`, `source_field` (« type.champ » repris d’un autre type) |
| `type_links` | liens permis (`from_type`, `to_type`, `field_key`, `name_fwd`, `name_back`) |
| `item_people` | **index** : personnes citées (`person_id` ou `name` libre, `role`, `zone` main/secondary, `ord`, `field`, `details`) |
| `item_links` | **index** : liens vers une fiche (`to_type='item'`), un lieu, un média, une source, une revue, un événement, un animal, un employeur ; `kind` = le champ, `precision`, `data` (petites valeurs de la ligne : piste, n° au catalogue, page…) |
| `item_rows` | **index** : lignes répétées du JSON (pistes, étapes, fontes, setlist…) pour les compter ou chercher en SQL |
| `profiles`, `person_profiles` | les profils (« artist »…) et ceux de chaque personne (`item_id` = sa fiche de profil) |
| `layout_prefs` | réglages : `global`, `person:<id>` (réglage propre), `presets` (Réglages enregistrés) |

**Les index se refont tout seuls** à chaque enregistrement (`art_reindex`) à partir du JSON. Conventions dans `data` :

| Valeur | Forme |
| --- | --- |
| personne | `{"pid": 12, "title": "Joseph MARTIN"}` ; sans fiche `{"pname": "René Dufour"}` ; avec rôle : `"role": "accordéon"` à côté |
| autre fiche | `{"iid": 45, "title": "Prise 3", "kind": "recording"}` ; texte libre `{"txt": "…"}` |
| lieu | `{"plid": 7, "title": "Tulle"}` |
| média | `{"mid": 3, "f": "fichier.jpg", "title": "…"}` ; photos : `[{mid, f, k: 'recto', c: 'légende'}]` |
| aussi indexés | `sid` (source), `perid` (revue), `evid` (événement), `aid` (animal), `empid` (employeur) |

Ne jamais écrire dans les index à la main : enregistrer la fiche.

## API

`GET api.php?action=art&op=…` : `boot&person_id=` (tout le catalogue d’une personne : fiches, liens, personnes, types, réglages,
« Lié à »), `item&id=`, `items&ids=1,2`, `cited&person_id=`, `types`.
`POST api.php?action=art_write` `{op, …}` : `save_item {person_id, kind, id, data, parent_id, make_artist}`, `save_items`,
`delete_item` (renvoie la ligne : « ↶ Annuler » = `restore_item {item}`), `reorder {person_id, ids}`, `make_artist`,
`set_profile {person_id, profile, on, label, icon}`, `save_type {key?, label, def}`, `delete_type`, `save_settings {key, data}`, `reindex`.
Côté navigateur : `ART.write(op, body)`, `ART.saveItem(store, kind, id, data)`, `ART.deleteItem(store, it, after)`.

## Déclarer un type intégré

```js
(() => {
    const ART = window.LCNDA_ART; if (!ART?.define) return;
    ART.define({key: 'sculpture', icon: '🗿', label: 'Sculpture', many: 'Sculptures', fem: true, domain: 'art',
        parentField: '',                        // champ « fiche liée » qui donne parent_id (ex. 'master', 'work')
        eyebrow: it => 'Sculpture',             // le petit titre bleu de la barre du haut
        heading: (ctx, it) => '…',              // facultatif : l'en-tête de la fiche (sinon « Titre · année »)
        newData: store => ({…}),                // valeurs de départ d'une nouvelle fiche
        upgrade: d => {…},                      // facultatif : remettre d'aplomb les anciennes données (en mémoire)
        groups: [
            {key: 'main', label: 'L’œuvre', zone: 'main', fields: [          // zone : main | left | right
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true},   // star = affiché au départ ; head = dans l'en-tête
                {key: 'material', label: 'Matériaux', type: 'text', star: true},
                {key: 'dims', label: 'Dimensions', type: 'dims', star: true},
                {key: 'founder', label: 'Fondeur', type: 'person', star: false, roleWord: 'fondeur'}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos', type: 'photos', star: true, labels: [['face', 'Face'], ['dos', 'Dos']]}]},
            {key: 'casts', label: 'Fontes', zone: 'main', fields: [{key: 'casts', label: 'Fontes', type: 'rows', star: true, addLabel: 'Une fonte',
                cols: [{key: 'no', label: 'N°', w: 's'}, {key: 'owner', label: 'Où', type: 'person', w: 'm'}]}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['photos', 'title', 'date', 'material'],   // colonnes de la liste au départ (ordre)
        card: ['date'], export: ['photos', 'title', 'date', 'material', 'dims', 'notes'],
        filters: store => [{id: 'mat', label: 'Matériau', type: 'check', options: [['bronze', 'Bronze']], test: (it, v) => !v.length || v.includes(it.data.material)}],
        sorts: [['year', 'Par année'], ['az', 'A → Z']],
        summary: list => '',                   // facultatif : « · valeur estimée … » sous la barre
    });
})();
```

Puis côté serveur : ajouter la clé à `ART_BUILTIN_TYPES` (et `ART_BUILTIN_KINDS`) dans `lib/art_engine.php`
(nom, pluriel, icône, famille, type parent). « 🔗 Lié à » est ajouté tout seul à droite ; « ✎ Mes champs » aussi.

Options d’un champ : `key`, `label`, `short` (libellé court : lecture, colonnes), `type`, `star`, `head`, `help`, `ph`
(texte d’aide), `wide`, `section: true` (bloc à part dans la colonne principale), `bare` (sans libellé dans un encadré),
`join: {key, sep, small, lab}` (« Label – 21 812 (n° de catalogue) »), `choices` (select / list), `kinds` (item, items :
types permis ; le premier sert à « ＋ Créer »), `free` (nom libre accepté), `roleWord` (mot de « Lié à »), `view` (vue de
lecture), `cols` / `more` / `addLabel` / `focus` / `blank` / `paste` / `onPaste` (tableaux), `labels` (photos), `href` (ident).

## Types de champs (`ART.ft`)

`text`, `longtext`, `note`, `number` (virgule gardée), `date` (C4), `period`, `duration`, `dims`, `measure`, `money`,
`select` (choix fixe), `list` (cases), `tags` (étiquettes), `bool`, `rating`, `url`, `ident` / `code` (avec `href`),
`person`, `people` (personnes + rôle, `scope` = « pistes »), `place`, `item`, `items` (fiches liées, menu de choix `artwork`),
`media`, `document`, `photos`, `rows` (tableau), `color` (C2), `computed` (vue calculée, pas de saisie).
Un nouveau type : `ART.ft.montype = {label, badge, tile, wide, block, edit(f, v, ctx) → html, get(el, f) → valeur | collect(el, f, draft),
read(f, v, ctx) → html, text(f, v, ctx) → texte, empty(v), value(data, f)}`. Les sortes proposées dans « ＋ Ajouter un champ » :
`ART.CUSTOM_TYPES`.

## Vues (lecture) et sections calculées

`ART.views.nom = {read(ctx, it, f, v), meta(ctx, it, f), actions(ctx, it, f), text(ctx, it, f)}` ; un champ `{type: 'computed',
view: 'nom'}` (ou un champ `rows` avec `view: 'nom'`) l’utilise. `ctx` = `ART.ctx(store, it)` : `store.linksFrom(id, type)`,
`store.linksTo(id, type)` (le `type` d’un lien = le champ du JSON), `store.get(id)`, `store.people`, `store.of(kind)`.
Exemples : `recordings` (arbre des prises), `master_editions`, `ex_works`, `provenance` (frise), `tracks`, `linked`.
Après l’affichage d’une fiche : `ART.after.push((C, body, it) => …)`.
Petits outils : `ART.util` (`esc`, `plural`, `personChip`, `refChip`, `placeChip`, `cover`, `money`, `hms`, `secs`, `person`, `ref`, `place`…).

## Un profil, une section de page

- Profil : `ART.profiles.cle = {key, label, icon, type: 'profile_cle', models}` ; sa fiche de profil = un type (`ART.define`,
  `domain: 'profile'`, `hidden: true`) ; côté serveur `art_set_profile` (`set_profile`) coche le profil (`person_profiles`).
- Section de la page : `ART.pageSections.cle = {icon, label, w: 'ligne' | '½' | '⅓', profile: 'artist', render: (C, sec) => ({body, count, head, actions})}`.
  La page ne montre que les sections des profils cochés ; « ⚙️ Organiser la page » range, cache, choisit la largeur.
- Modèle de départ : `ART.models.cle = {label, order: [...], hidden: [...]}`.

## Les listes (H10) et l’export

`ART.paintList(C, body)` fait la liste du type courant : `UI.listBar` (🔍, Filtrer ▾ = `def.filters(store)` avec `test(it, v)`,
Liste | Fiches, Trier = `def.sorts`), colonnes = onglet « La liste » du panneau, « Voir les N suivants ↓ ».
Export : `ART.exportList(C, kind)` et `ART.exportItem(C, it)` (E3 : PDF, impression, CSV, 💾 fichier réimportable) ;
notice imprimable : `ART.noticeHtmlFor(store, it)` (champs de l’onglet « L’export »).

## Un livre (mise en page)

`ext.artistCatalogue.wizard({mode: 'catalogue' | 'discography', pid, ids})` ; `buildDoc(store, list, opts)` fabrique le document
avec `ext.layoutKit` (exposé par `heritage-layout.js` : `themeDoc`, `textItem`, `shapeItem`, `flow`, `box`, `coverItems`, `openEditor`…).
Une notice qui suit sa fiche = un texte `dyn: {type: 'art', id, fields, part}` ; « ↻ Mettre à jour les objets dynamiques »
appelle `ext.artistCatalogue.noticeHtml(dyn)`. Un nouveau mode : ajouter ses parties dans `PARTS` et son cas dans `buildDoc`.

## Réglages (« ⚙️ Champs affichés »)

`layout_prefs` : `{kinds: {<type>: {fiche|liste|vignettes|export: {on: [], off: [], gorder: [], forder: {groupe: []}, order: []},
custom: [champs perso], groups: [groupes perso], removed: [champs enlevés]}}, hideEmpty, page: {order, hidden, widths, custom, model}}`.
`ART.layout(store, kind, tab)` rend `{groups, fields}` (chaque champ avec `on`). Réglages enregistrés : outil « artistes »
(`exportSettingFile('artistes', nom, {artistes: …})`).
