# Composants communs (C1 à C8, E1 à E5) — mode d’emploi

Règles validées : `docs/REGLES-INTERFACE.md` (sections « Champs et petits éléments communs » et « Éditeurs »).
Maquettes : `docs/design/champs-communs.html`, `docs/design/editeurs.html`.

- Code : `assets/js/app-ui.js` → `window.LCNDA_UI` (aussi `window.LCNDA_APP.ui`).
- Styles : `assets/css/ui.css` (clair, sombre `:root[data-theme="dark"]`, petit écran). À charger **après** `app.css`, `heritage.css`, `layout.css`, `picker.css`.
- Pour choisir une personne, un lieu, une source… : ce n’est pas ici, c’est le menu de choix (`docs/PICKER.md`).

```js
const UI = window.LCNDA_UI;
```

## L’amélioration automatique (rien à écrire)

Un `MutationObserver` (comme `app-harmony.js`) habille ce qui apparaît dans la page, une seule fois (`data-ui-done`), quand l’élément devient visible (une fenêtre qui s’ouvre, un onglet affiché, un `<details>` déplié…). **L’élément d’origine reste le même** : même `name`, même valeur, mêmes écouteurs, mêmes événements `input` / `change`. Un `champ.value = …` écrit par le code met aussi l’habillage à jour.

| Ce qui est habillé | Ce qui change |
|---|---|
| `input[type=search]`, `input[data-ui-search]`, `.search-row > input` | C1 : loupe à gauche, × pour vider, Échap vide, touche « / », « Rechercher… » / « Filtrer… » → « Chercher… », le vieux bouton ⌕ et la loupe 🔎 voisine sont cachés |
| `input[type=color]` visible | C2 : pastille + nom/code ▾ et la fenêtre des couleurs (l’input natif est caché dessous) |
| `input[type=range]` visible | C3 : case chiffrée tapable avec l’unité, double-clic = valeur de départ |
| `input[data-ui-date]` | C4 : « ✓ Compris : … » / « ⚠️ … » dessous, 📅 (sauf `data-ui-date="nocal"`) |
| `[data-help="phrase"]` (+ `data-help-faq="question"`) | C8 : bulle « ? » ajoutée à la fin de l’élément |
| classes existantes | C5 onglets, C7 messages, C8 boutons (voir plus bas) |

**Exclure** : `data-ui-off` sur l’élément ou sur un parent (toute une zone). `data-ui-compact` sur un `input[type=color]` = pastille seule.

Ce qui n’est **pas** touché :
- les `input[type=date]` (le format envoyé changerait) : passer à `data-ui-date` à la main ;
- un `input[type=color]` caché ou transparent (posé sur un dessin de l’outil, ex. 🎨 du dessin vectoriel) ;
- un curseur qui a déjà sa case chiffrée (`input[type=number]` voisin) ;
- un curseur dont la valeur affichée n’a pas de rapport simple avec sa valeur (ex. un curseur 0–20 affiché « 2 mm ») : on le laisse tel quel (`data-ui-done="other-scale"`). Pour qu’il ait la case, mettre `data-unit` et afficher la vraie valeur, ou utiliser `rangeField`.

Relancer à la main si besoin : `UI.scan(element)`.

---

## C1 — Case de recherche

Le plus simple : `<input type="search" placeholder="Chercher… (Dupont, 1880, Brive)">` → habillé tout seul.

```js
const box = UI.searchField({placeholder: 'Chercher un recueil…', value: q, name: 'q', delay: 200,
    onInput: (value) => draw(value)});   // appelé après 200 ms sans frappe, ou tout de suite sur Entrée
parent.appendChild(box);                 // box.input = la case
```

- × vide la case et envoie `input` (puis `change` et `search`) ; Échap aussi (si la case est déjà vide, Échap ferme la fenêtre comme avant).
- « / » (hors d’un champ de saisie) met le curseur dans la première case de recherche visible de la fenêtre du dessus (ou de la page).
- Texte d’aide : « Chercher… » + des exemples.

## C2 — Couleur

`<input type="color" name="color" value="#7a2a2a">` → habillé tout seul (la fenêtre propose les couleurs de l’app, les récentes, 💧 pipette, 🎨 autre couleur, le code #).

Quand il faut « Aucune » ou la transparence, le composant :

```js
const c = UI.colorField({name: 'fill', value: '#7a2a2a', allowNone: true, alpha: true});
form.appendChild(c);
c.input.addEventListener('input', () => preview(c.value));   // '' = aucune ; '#rrggbbaa' si transparent
```

- `c.input` est un `input type=hidden` (envoyé avec le formulaire) qui reçoit `input` pendant le choix et `change` à la fin.
- Couleurs récentes partagées par tous les outils : `localStorage['genealogie-recent-colors']` (`UI.rememberColor(c)`).
- `compact: true` = pastille seule (barres d’outils).

## C3 — Curseur

`<label>Opacité <input type="range" min="0" max="100" value="55" data-unit="%"></label>` → la case « 55 % » s’ajoute toute seule.

- Unité : `data-unit`, sinon devinée (texte de l’ancienne sortie, puis du libellé : %, °, mm, px, ppp). Un curseur 0 → 1 libellé « Opacité » est montré en %.
- Une ancienne sortie (`<output>` ou petit `<span>` « 55 % » juste après) est cachée, pas supprimée : l’outil peut continuer à l’écrire.
- La case envoie `input` puis `change` **sur le curseur** quand on valide (Entrée, Tab, clic ailleurs, ↑ ↓, ⇧↑ ⇧↓ = ×10). Ses propres événements ne sortent pas.
- Double-clic sur le curseur = valeur de départ : `data-default="…"`, sinon l’attribut `value` du HTML.

Composant complet (libellé · curseur · case) :

```js
const r = UI.rangeField({label: 'Épaisseur', min: 0, max: 10, step: .5, value: 2, unit: 'mm', name: 'stroke', default: 1});
r.input.addEventListener('input', () => redraw(Number(r.input.value)));
```

## C4 — Date écrite comme dans un acte

`<input name="date" data-ui-date>` ou :

```js
const d = UI.dateField({name: 'date', value: 'vers 1784', placeholder: '7 mai 1925, vers 1784…', calendar: true});
```

- La case reste du **texte libre** (« 7 mai 1925 », « 08/12/1960 », « vers 1784 », « avant 1800 », « entre 1880 et 1885 », « 12 thermidor an II », « an II »).
- Dessous : « ✓ Compris : 7 mai 1925 (jeudi) » ou « ⚠️ Date impossible : 30 février ».
- 📅 ouvre le calendrier du système et écrit « 7 mai 1925 » dans la case.
- Lecture seule de la logique : `UI.readDate('vers mars 1784')` → `{ok: true, label, extra}` ou `{ok: false, text}`.

## C5 — Onglets et filtres

Deux modèles seulement, classe active unique `is-active` :

```html
<div class="ui-tabs" role="tablist"><button class="is-active">Propriétés</button><button>Calques</button></div>   <!-- changer de page : bleu -->
<div class="ui-filters"><button class="is-active">Tout (24)</button><button>📷 Photos (18)</button></div>         <!-- trier ce qu'on voit : noir -->
```

Déjà au même aspect sans rien changer : `.segmented`, `.kn-tabs` (actif `.is-cur`), `.h-rt-tabs`, `.h-sl-tabs`, `.h-faces-tabs`, `.h-dgi-tabs` (actif `.active`), `.h-lv-modes-tabs` (actif `.is-on`), `.h-tabs` et `.h-cw-parts-tabs` faits de `button.button.small` (actif = sans `secondary`).

## C6 — Trier et voir la suite

```js
const bar = UI.sortBar({count: 42, label: 'fiche', feminine: true, value: 'recent',
    extra: [['sosa', 'Par numéro Sosa']], onChange: v => { sort = v; draw(); }});
list.before(bar);              // « 42 fiches · Trier : [Les plus récentes ▾] » ; bar.setCount(n)
const more = UI.moreButton({remaining: rest, step: 20, feminine: true, onClick: () => loadMore()});
list.after(more);              // « Voir les 20 suivantes ↓ » ; more.update(reste) le cache à 0
```

Choix de base : `recent`, `old`, `az`, `za` (+ `extra`), ou `options` pour tout remplacer.

### H10 — « Liste | Fiches » juste avant « Trier »

```js
const KEY = 'listes:ma_liste';                      // une clé par liste
let sort = UI.sortOf(KEY), view = UI.viewOf(KEY);   // retenus (localStorage « lcnda-sort: » / « lcnda-view: »)
const bar = UI.sortBar({count: rows.length, label: 'projet', value: sort,
    view: {key: KEY, what: 'projets', onChange: v => { view = v; draw(); }},   // pose le choix segmenté avant « Trier »
    onChange: v => { sort = v; UI.setSort(KEY, v); draw(); }});
const list = UI.sortItems(rows, sort, {name: r => r.title, date: r => r.updated_at});
box.innerHTML = UI.itemsHtml(view, list.map(r => ({thumb: '<img …>', name: r.title, open: `data-x-open="${r.id}"`,
    lines: ['ligne grise', '…'], date: 'Modifié le …', actions: '<button …>'})));   // ou UI.cardsHtml / UI.rowsHtml
```

- `UI.viewToggle({key, value, onChange, what, dflt})` seul (classe `.segmented.ui-viewtoggle`, `.value`, `.set(v)`) ; sans `key`, l'appelant retient le choix lui-même. `UI.putViewToggle(bar, toggle)` le pose dans une barre C6 déjà faite. Aussi `A().viewToggle`.
- « Liste » = tableau existant ou `UI.rowsHtml` (petite vignette, nom, ligne grise, date) ; « Fiches » = `UI.cardsHtml` (grande vignette 150 px) ou les cartes propres à la liste. Styles dans `ui.css` (clair, sombre, téléphone).

### H10 — La barre commune au-dessus de toutes les listes : `UI.listBar`

Toujours dans cet ordre : 🔍 Chercher (C1) · Filtrer ▾ (pastille bleue = nombre de filtres actifs) · Liste | Fiches · Trier : … ▾. Sous la barre : « N éléments », les filtres actifs en pastilles bleues « Femmes × » (un clic les retire) et « Tout effacer ». Tout est retenu pour chaque liste (localStorage « `lcnda-listbar:<key>` », lu avec `UI.listBarState(key)`). Aussi `A().listBar`. Maquette : `docs/design/messages-et-listes.html`.

```js
const bar = UI.listBar({key: 'listes:persons',
    search: {placeholder: 'Chercher une fiche… (ex. Borie, Tulle)'},
    filters: [
        {id: 'gender', label: 'Genre', type: 'check', options: [['male', 'Hommes'], ['female', 'Femmes'], ['unknown', 'Sexe inconnu']]},
        {id: 'birth_place', label: 'Lieu de naissance', type: 'place', chipPrefix: 'Né(e) à'},       // pickerField kind 'place' (menu de choix de lieu)
        {id: 'label', label: 'Étiquette', kind: 'label', allowFree: false, chipPrefix: 'Étiquette :'},  // tout autre « kind » du menu de choix
        {id: 'state', label: 'État', type: 'radio', options: [['', 'Tous'], ['open', 'En cours']], dflt: ''},
        {id: 'from', group: 'Date', label: 'À partir du', type: 'date', native: true, chipPrefix: 'Depuis le'}],
    view: {dflt: 'list', what: 'fiches'},                        // ou un UI.viewToggle déjà fait ; absent = pas de « Liste | Fiches »
    sort: {options: [['recent', 'Les plus récents'], ['az', 'A → Z']], value: 'recent'},   // ou une barre C6 (UI.sortBar) à reprendre
    count: false,                                                // ou {n, label, many}
    onChange: (st, {what}) => { /* st = {q, filters:{…}, view, sort} ; what = 'q'|'filter'|'view'|'sort'|'clear' */ draw(st); }});
list.before(bar);
bar.setCount(rows.length, 'fiche');      // ou un texte : bar.setCount('3 projets sur 12')
bar.state;                               // {q, filters, view, sort}
bar.setFilter('gender', ['female']);     // bar.clear(true) remet tout (avec la recherche)
bar.adoptSort(table._sortBar);           // reprend « Trier » (et « Liste | Fiches ») d'une barre C6 posée par addTableSortBar
```

- Types de filtre : `check` (une case ; avec `options` : plusieurs cases → tableau), `radio` / `select` (une valeur, `dflt` = « pas de filtre »), `place` / `person` / tout `kind` du menu de choix (valeur `{id, title}` ou `'txt:…'` pour un nom tapé), `date`, `text`. `group` range plusieurs filtres dans une même rubrique ; `chip(v)` donne le texte de la pastille ; `disabled(filters)` grise un filtre.
- Une liste qui se redessine en entier peut recréer la barre : le curseur reste dans « Chercher » et le menu Filtrer reste ouvert.
- `remember: 'given'` : les valeurs données gagnent (la liste range déjà ses réglages ailleurs), la barre les écrit quand même.

## C7 — Chargement et messages

Ces trois-là rendent du **HTML** (texte échappé) :

```js
box.innerHTML = UI.spinner('Chargement des médias…');     // un seul rond qui tourne + texte
box.innerHTML = UI.skeleton(4);                          // lignes grises pour une liste
box.insertAdjacentHTML('afterbegin', UI.notice('warn', 'Cette photo est petite : floue à l’impression.'));
// sortes : 'info' (bleu ℹ️), 'warn' (jaune ⚠️), 'error' (rouge ⛔), 'ok' (vert ✓)
```

Déjà au même aspect : `.loading-block` (le rond qui tourne s’ajoute), `.archive-visit-notice` (info), `.goose-notice`, `.import-fusion-warning`, `.ly-master-banner`, `.issue.warning` (attention), `.h-am-banner` (info).
Pour un succès après un clic, garder `toast()` ; les messages ci-dessus sont ceux qui restent dans la page.

### H7 — Messages après une action : `toast()` et « ↶ Annuler » au lieu de « Es-tu sûr ? »

Un seul composant, toujours en bas à gauche, 6 s (× le réglage d’accessibilité), barre bleue du temps qui reste, en pause sous la souris ou le clavier ; 4 messages au plus.

```js
const A = window.LCNDA_APP;
A.toast('Fiche créée.');                                  // noir
A.toast('Enregistré', 'success');                        // vert « ✓ Enregistré »
A.toast('Impossible d’enregistrer : la base est verrouillée', 'error', {retry: () => save()});   // rouge + « Réessayer »
A.toast('Photo rangée', '', {action: {label: 'Voir', run: () => open()}});                     // noir + un bouton
A.undoToast('Note supprimée', {undo: async () => {…}, redo: async () => {…}});
// → « 🗑 Note supprimée  ↶ Annuler » ; après Annuler : « ↶ Annulé : « Note supprimée »  ↷ Rétablir » ; une erreur → rouge + « Réessayer »
```

Pour ce qui se défait de façon fiable, **on supprime tout de suite et on propose « ↶ Annuler »** :
- en base, avec le journal : `await A.deleteWithUndo({action: 'delete_note', body: {id}, type: 'note', id, message: 'Note supprimée', after: what => redraw()})` (le serveur remet l’élément avec `restore_last_delete` : événement, note, source, média, battue et ses morceaux, enquête/piste/média d’enquête, rappel, ligne de budget, courrier, hypothèse, preuve, fiche en ligne, contact du répertoire, branche, vue enregistrée, étiquette — avec ce qui y était posé). Pour un nouveau type : garder la ligne entière (et ses lignes liées dans `_children`) dans `log_change(...,'delete',…)` puis l’ajouter à `$simple` dans `restore_last_delete`.
- gardé sur cet ordinateur : `A.undoLocalChange('Palette « X » supprimée', ['clé-localStorage'], () => supprimer(), what => redessiner())` (relit les clés avant/après).
- dans un éditeur avec historique : `undoable(message)` après `commit()` (voir heritage-boards, heritage-house, heritage-layout, heritage-vector, heritage-studio) ; « Annuler » refuse si d’autres changements ont suivi (⌘Z reste là).

`confirmBox` reste seulement pour ce qui ne se défait pas : une fiche entière, un projet entier sans restauration simple, vider la corbeille, écraser ou restaurer une base, et les questions qui ne sont pas des suppressions (fermer sans enregistrer, remplacer des réglages…). Les « ✓ Enregistré » des éditeurs restent dans la barre du haut (E1, `UI.savedStatus`), pas en message.

### Exports CSV faits dans le navigateur : `A().csvSafe` / `A().csvCell`

Une cellule de texte qui commence par `=` `+` `-` `@`, une tabulation ou un retour chariot serait lue comme une formule par le tableur : `A().csvSafe(v)` la préfixe d’une apostrophe (sauf un vrai nombre, « -12,5 »). `A().csvCell(v, {sep: ';', quote: 'auto'|'always'})` rend la cellule prête, avec les guillemets si besoin. Tout nouvel export CSV passe ses cellules par l’un des deux.

## C8 — Aide « ? » et petits boutons

```html
<span data-help="La marge de 3 à 5 mm coupée par l’imprimeur." data-help-faq="fond perdu">Fond perdu</span>
```
ou `el.append(UI.helpTip('Une phrase.', 'question de la FAQ'))`.
Clic = la phrase + « En savoir plus (FAQ) → » : ouvre la FAQ avec cette question (`UI.openFaq(q)`) ; dans une fenêtre ouverte (éditeur…), la réponse s’affiche dans la bulle pour ne pas perdre le travail.

Boutons :
- `.icon-button` 32 px, `.icon-button.small` 26 px, `.icon-button.tool` 36 px sans ombre (colonne d’outils) ; `.modal-close` a le même aspect que `.icon-button`.
- × pour fermer partout ; ✕ ou 🗑 pour retirer.
- Désactivé : une seule règle (`button:disabled`, `.button:disabled`, `.is-disabled`) : opacité .45, curseur interdit.
- Interrupteur oui/non : `<label class="ui-toggle"><input type="checkbox" name="dates"><i></i>Afficher les dates</label>`.

---

## E1 — Barre du haut des éditeurs

Ordre validé : icône · nom tapable · menus · ↶ ↷ · … · « ✓ Enregistré » · ⚙️ Personnaliser · ⤓ Exporter ▾ · 💾 Enregistrer · ⛶ · ×.

Nouvel éditeur :

```js
dlg.innerHTML = UI.editorTopbar({icon: '✒️', name, nameAttrs: 'data-vx-name',
    menus: ['Fichier', 'Édition', 'Objet', 'Affichage'], undo: true, status: 'saved',
    buttons: {customize: ext.tbButton ? {html: '⚙️ Personnaliser', attrs: 'data-tb-config="vector"'} : null,
              export: true, save: true, full: {attrs: 'data-full-toggle="vector"'}, close: true}}) + corps;
// boutons : data-ui-cmd="undo|redo|customize|export|save|full|close" (ou attrs donnés), menus : data-ui-menu="Fichier"
UI.savedStatus(dlg, 'dirty');   // 'saved' « ✓ Enregistré », 'dirty' « • modifié », 'saving', 'error' — jamais de toast pour ça
```

Barre existante : `UI.harmonizeTopbar(barre)` range dans l’ordre (les boutons sont **déplacés**, pas recréés : leurs écouteurs restent). Elle trouve « Enregistré » (`[data-ui-status]` ou un attribut contenant `status`), ⚙️ (`data-tb-config`), ⤓ Exporter (bouton ou `<details>`), 💾 (`…=save`), ⛶ (`data-full-toggle`), × (`…=close`, `data-close`, « × »). Les boutons rangés dans un menu ne bougent pas. À appeler une fois après la construction de la barre et **après** `ext.tbApply` (Personnaliser) ; vérifier l’outil ensuite (si ses écouteurs sont posés sur un groupe intermédiaire, ils ne suivent pas).

## E2 — Panneau de droite

```js
pane.innerHTML = UI.panelSection({title: 'Position et taille', key: 'vx-pos', open: true, body: htmlPos})
               + UI.panelSection({title: 'Couleur', key: 'vx-color', body: htmlColor})
               + UI.panelSection({title: 'Texte', key: 'vx-text', open: false, body: htmlText})
               + UI.panelSection({title: 'Effets', key: 'vx-fx', open: false, body: htmlFx});
```

Même ordre partout (Position et taille, Couleur, Texte, Effets…). Ouvert / fermé retenu par clé (`localStorage['genealogie-ui-sections']`). Dedans : `<input type=color>` et `<input type=range>` (habillés en C2 et C3).

## E3 — Fenêtre d’export unique

```js
UI.openExportDialog({title: name, defaultName: name, bleed: true, quality: true, saveCopy: true,
    info: '10 × 15 cm · 1 page',
    preview: async () => canvas.toDataURL(),            // ou un élément HTML
    formats: [
        {id: 'pdf', run: async o => exportPdf(o)},      // o = {format, quality (ppp), bleed, filename, saveCopy}
        {id: 'png', run: async o => exportPng(o)},
        {id: 'jpg', run: ...}, {id: 'svg', run: ...}, {id: 'print', run: ...},
        {id: 'file', ext: 'lcvx', run: ...},            // le fichier de l’outil
    ]}).then(r => { /* r = les options utilisées, ou null si Annuler */ });
```

- Libellés et petites lignes par défaut : 📄 PDF, 🖼 PNG, 📷 JPG, ✒ SVG, 🖨 Imprimer, 💾 Fichier (changer avec `label`, `hint`).
- Nom du fichier via `LCNDA_APP.safeExportFilename` + extension du format.
- Si `run` lève une erreur, la fenêtre reste ouverte avec un message ⛔.

## E4 — Déposer un fichier

```js
zone.appendChild(UI.dropZone({accept: 'image/*,audio/*,.pdf', multiple: true, onFiles: files => importer(files)}));
// ou sur une zone existante (le plan de travail d’un éditeur) :
UI.bindFileDrop(stage, files => importer(files), {accept: 'image/*'});
```

La zone s’allume en bleu (`.is-drag-over`) quand on survole avec un fichier ; ⌘V colle un fichier quand la zone est visible dans la fenêtre du dessus. Le fichier doit ensuite entrer dans les médias (c’est à l’outil de l’envoyer).

## E5 — Choisir une police

```js
const font = await UI.openFontPicker({value: current, sample: 'Louise Borie'});
if (font) apply(font);
```

Une seule liste : recherche, récentes en haut (`localStorage['genealogie-recent-fonts']`), polices de l’app, puis celles de l’ordinateur (`queryLocalFonts` si déjà permis, ou bouton « 🔓 Voir toutes les polices de l’ordinateur » ; sinon les polices courantes trouvées sur l’ordinateur). Chaque nom est écrit dans sa police avec le texte choisi. ↑ ↓ Entrée, double-clic.
