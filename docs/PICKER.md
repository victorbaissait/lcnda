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
`docs/design/choix-lieux-et-autres.html`.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `assets/js/app-picker.js` | le composant (champ, liste, pastilles, rôles, lecture, petite fenêtre) |
| `assets/css/picker.css` | ses styles, variante sombre comprise (`:root[data-theme="dark"]`) |
| `lib/picker.php` | la recherche : `picker_search()` (GET `picker_search`) et `picker_place_adopt()` (POST) |

`index.php` charge `assets/css/picker.css` et `assets/js/app-picker.js` (après `app.js` de préférence ; l'ordre n'est pas
obligatoire). Les fonctions sont sur `window.LCNDA_PICKER` et aussi sur `window.LCNDA_APP` (`A().pickerField(…)`,
`A().openPicker(…)`…), ou groupées dans `A().picker`.

Le champ **se lie tout seul** : on insère le HTML renvoyé par `pickerField()` n'importe où (innerHTML, fenêtre,
panneau…), un `MutationObserver` s'en occupe. Aucun « bind » à appeler.

Pour le titre du champ, mettre `<span class="pk-lab">Personne</span>` juste avant (ou le `label` habituel de l'outil
**à côté**) : ne pas envelopper le champ dans un `<label>`, sinon un clic sur ses boutons irait dans la case de saisie.

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
// kinds : person, place, source, media, investigation, battue, label, house, periodical, employer, census

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
sortes — l'outil doit alors écouter `picker-create`), `roles`, `animals: false` (sans les animaux).

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
| `cp-pick` | `{id, name, field}` | compatibilité avec l'ancien `collectionPersonField` (personne, un seul choix) |
| `change` | — | sur l'`<input type=hidden>` (pour les formulaires qui écoutent `change`) |
| `picker-create` | `{kind, text, field, target, pick(item)}` | « ＋ Créer… ». Appeler `e.preventDefault()` pour s'en occuper, puis `e.detail.pick({id, title})` pour choisir la fiche créée. Sinon : personne → fenêtre « Nouvelle fiche » préremplie, la fiche enregistrée est choisie ; lieu → créé tel quel dans `places`. |
| `picker-open` | `{kind, id, item}` | « ↗ Fiche / ↗ Lieu / ↗ Ouvrir ». `preventDefault()` pour ouvrir soi-même. Sinon : personne → `openPersonById`, enquête, battue, maison → leur écran ; le reste → petit message. |
| `picker-map` | `{kind:'place', text, item, field, pick(item)}` | « 🗺 Choisir sur la carte » ou 🗺 d'une pastille. `preventDefault()` + `pick(item)` pour renvoyer le lieu choisi sur la carte. |

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

- Personnes : prénom / 2e prénom / nom / variantes de noms / lieu de naissance ou de décès, sans accents ; NOM en capitales ;
  « ° date lieu · † date lieu » ; indice « fils de… / épouse de… » quand un autre a le même nom ; nom qui commence par la
  frappe d'abord.
- Lieux : trois groupes paginés bout à bout (`base`, `fr` sans les hameaux homonymes, `world` avec `ref` = geoname_id et
  `id` = null). Mots en plus pour préciser : numéro ou nom de département, région, pays (« saint-martin 32 »,
  « springfield usa ») ; le serveur essaie les découpages nom / précision et garde le premier qui trouve.
  Exact > commence par > début de mot > contient, puis les plus peuplées.
- `POST picker_place_adopt {geoname_id}` → `{id, item}` : la ville du monde entre dans `places` (`place_from_world`).
  `{name, country?}` sans geoname_id : crée un lieu tapé à la main (repli de « ＋ Créer le lieu »).
- Toutes les requêtes sont préparées ; `q` n'est jamais collé dans le SQL. Une table absente (ancienne base) donne une
  liste vide, sans erreur.

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
