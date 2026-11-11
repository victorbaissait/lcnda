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

`<input type="color" name="color" value="#7a2a2a">` → habillé tout seul : la fenêtre standard des couleurs (couleurs de l’app, récentes, puis « Choisir une autre couleur » avec les onglets Nuances · TLS · RVB · CMJN, 💧 pipette, code #, Annuler / OK). C’est **la** façon de choisir une couleur dans l’app : pas de fenêtre du système, pas de sélecteur maison (voir REGLES-INTERFACE.md, C2).

Pour l’ouvrir sous un autre élément (les deux carrés de la retouche, une pastille dessinée par l’outil) :

```js
UI.openColorBox(element, {get: () => couleur, set: (v, final) => { couleur = v; /* final : OK, pastille, pipette */ }});
```

Conversions (pour les essais ou un outil) : `UI.colorConvert` — `hex`, `rgb`, `toHsv`/`fromHsv`, `toHsl`/`fromHsl`, `toCmyk`/`fromCmyk`.

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
- `bar.sortColumns(table, {person: ['az', 'za'], date: ['date'], net: [null, 'rich']})` : cliquer le titre d’une colonne (`<button data-sort-column="N" data-sort-key="person">`) choisit ce tri dans « Trier » (↑ ↓ sur le titre) ; une colonne absente de la carte se range seulement à l’écran. À rappeler après chaque dessin du tableau.
- `UI.listMatch` pour garder les lignes d’après `bar.state` : `text(q, …textes)` (chaque mot, sans accents), `pick(v, ids, noms)` (un choix du menu de choix : par numéro, sinon par nom), `period(de, à, …années)`, `year(texte)`. Un filtre vide garde tout.
- Liste tout à fait vide : pas de barre, la grande boîte K10 seule (avec son bouton) ; recherche ou filtres sans résultat : la barre reste, avec « 🔍 Aucun … ne correspond ».

## C7 — Chargement et messages

Ces trois-là rendent du **HTML** (texte échappé) :

```js
box.innerHTML = UI.spinner('Chargement des médias…');     // un seul rond qui tourne + texte
msg.innerHTML = UI.spinner('Lecture de ta généalogie…', {inline: true});   // dans une ligne de texte (à côté d’un bouton)
box.innerHTML = UI.skeleton(4);                          // lignes grises pour une liste
box.insertAdjacentHTML('afterbegin', UI.notice('warn', 'Cette photo est petite : floue à l’impression.'));
// sortes : 'info' (bleu ℹ️), 'warn' (jaune ⚠️), 'error' (rouge ⛔), 'ok' (vert ✓)
```

Déjà au même aspect : `.loading-block` (le rond qui tourne s’ajoute), `.archive-visit-notice` (info), `.goose-notice`, `.import-fusion-warning`, `.ly-master-banner`, `.issue.warning` (attention), `.h-am-banner` (info).
Pour un succès après un clic, garder `toast()` ; les messages ci-dessus sont ceux qui restent dans la page.

Jamais de « Chargement… » écrit seul (`<p class="muted">Chargement…</p>`) ni de rond fait main (`<span class="ui-spinner"></span>`, `.loading-mark`) : `UI.spinner(phrase)` partout (dans `app.js`, chargé avant `app-ui.js` : `waitHtml(phrase)`). Seuls restent à part le rond du menu de choix (`.pk-spin`), le grand rond du mode simple (`.ms-spin`), les boutons occupés (`.is-busy`) et les `<option>` d’un menu (pas de dessin possible). Test : `tests/test-harmo-chargement.js`.

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

---

## K5 — En-tête de page : `UI.pageHeader` (app-pages.js)

Un seul en-tête en haut de chaque page (listes, Réglages, Fiches, Enquêtes, ADN, Comparaison…). Maquette : `harmonisation-K.html`, K5.

```js
ws.innerHTML = `<section class="page">${UI.pageHeader({
    title: 'Médias', help: 'Photos, actes, documents et sons de ta généalogie.',   // help = une phrase (HTML)
    primary: '<button class="button" data-x-new>＋ Ajouter des médias</button>',    // le bouton bleu
    actions: ['<button class="button secondary" data-x-a>📚 Recueils</button>', …],   // 2 visibles, le reste dans « ⋯ »
    more: ['<button …>…</button>'],                                                 // toujours dans « ⋯ »
})}…</section>`;
```

- **Sur-titre** = l’endroit, calculé d’après le menu : « Listes · Médias et documents », « Réglages · Outils », « Enquêtes »… (`where` pour l’imposer ; `detail: true` pour la page d’un élément → « Listes · Recueils »). `UI.pagePlace()` le donne.
- **Titre** = le nom, avec l’icône du menu (groupe de la colonne pour Listes et Réglages, émoji de l’onglet sinon ; `icon` pour l’imposer), 38 px partout (30 px sur téléphone). **Jamais un nombre** : le nombre va dans la barre H10 (`bar.setCount`) ou, sans barre, en tête de la phrase d’aide (`<b class="ui-ph-count">`).
- **À droite**, dans cet ordre : « ✓ Enregistré » (pages de réglages, K2) · le bouton bleu · 2 boutons au plus · « ⋯ » (un `<details class="ui-ph-more">`, les boutons y sont **déplacés**, leurs écouteurs restent) · ⭐ (raccourci, posé par heritage-shortcuts.js).
- Tout `.page-header` de `#workspace` qui n’a pas été fait par `UI.pageHeader` est rangé pareil tout seul (`UI.harmonizePageHeader`, `MutationObserver`) : sur-titre, icône, boutons laissés sous le texte ou à même l’en-tête, « ⋯ ». `data-ph-off` l’exclut, `data-ph-where="…"` impose le sur-titre, `data-ph-detail` = page d’un élément.
- Un bouton « Tout réinitialiser », « Tout remettre comme avant »… dans l’en-tête devient « ↺ Remettre comme au départ », toujours visible.

## K2 — Réglages enregistrés tout seuls : `UI.autoSave` (app-pages.js)

Dans les Réglages, tout changement fait dans la page (case, menu, curseur, couleur, glisser, bouton) est gardé tout de suite. Une seule écoute sur `#workspace` relit les réglages gardés sur cet ordinateur (localStorage) ; s’ils ont changé : « ✓ Enregistré » à droite du titre (`UI.pageSaved()`) et un message H7 « Réglage changé : « … » » avec « ↶ Annuler » (qui remet les clés d’avant, puis redessine). Pas de bouton « Enregistrer » sur une page de réglages ; « ↺ Remettre comme au départ » se fait sans question (« ↶ Annuler » dans le message).

Une page qui garde un brouillon (lu à l’écran) donne de quoi l’enregistrer :

```js
draw();
UI.autoSave(ws, {save: () => { collect(); savePrefs(p); },          // lit l’écran et enregistre (appelé après chaque changement)
                 redraw: () => { p = loadPrefs(); draw(); }});        // après ↶ Annuler / ↷ Rétablir
```

- Hors Réglages (ex. ADN → ⚙️ Réglages), `UI.autoSave(élément, …)` marche tant que l’élément est affiché.
- Si la page propose déjà son propre « ↶ Annuler » pour ce geste (une palette retirée…), pas de deuxième message.
- Réglages gardés sur le serveur : la page continue d’enregistrer elle-même ; elle peut appeler `UI.pageSaved()` pour afficher « ✓ Enregistré ».

## K9 — La vignette unique du mode « Fiches » : `UI.cardsHtml`

```js
box.innerHTML = UI.cardsHtml(rows.map(r => ({
    thumb: '<img src="…">',                 // photo, portrait (UI.avatarOr) ou <span class="ui-card-ico">🏠</span>
    name: r.title, open: `data-x-open="${r.id}"`,   // ou href: 'https://…' (un lien, ouvert dans un nouvel onglet)
    lines: ['ligne grise 1', 'ligne grise 2'],      // 2 au plus (les suivantes ne sont pas montrées)
    badges: [{text: 'En cours', kind: 'blue'}, '<span class="ui-badge …">…</span>'],   // pastilles K8 (UI.badge)
    when: r.updated_at, whenLabel: 'Modifié',       // ou date: '1906'
    quick: '<button class="button small" data-x-play>▶</button>',          // facultatif : un bouton gardé à côté d’« Ouvrir »
    menu: ['<button data-x-ren>✎ Renommer</button>', '<button class="danger" data-x-del>🗑 Supprimer</button>'],  // dans « ⋯ »
})), {size: ''});   // 's' = petites vignettes
```

En bas de chaque vignette : « Ouvrir » (même attribut que `open`, `openLabel` pour un autre mot) puis ⋯. L’ancien champ `actions` va aussi dans ⋯. Un bouton qui n’a qu’une icône y reçoit son nom (sa bulle). Plus de cartes faites à la main en mode « Fiches » (`.list-card`, `.h-pet-card`, `.h-hs-card`, `.h-rc-card`, `.investigation-card`, `.external-link-card`, `.ar-card`, `.h-pr-fcard`…).

## K7 — Un seul portrait : `UI.avatar` (app-portraits.js)

```js
const UI = window.LCNDA_UI;
const html = UI.avatarOn() ? UI.avatar({id, first_name, last_name, name, gender, kind, photo: 'media/…'}, 34) : ancienDessin;
// ou : UI.avatarOr(personne, 34, ancienDessin)
```

- Tailles : 22 (dans une ligne, pastille), 34 (listes, menu de choix), 48 (arbre, vignettes), 88 (fiche) ; une autre taille prend la plus proche.
- `photo` : adresse déjà prête (`media/…`, `https://…`, `data:image/…`) ; refusée si elle n’est pas sûre. `kind: 'animal'` → 🐾 ; `{free: true}` → « ? » gris.
- Badge Sosa (réglage) : `opts.sosa`, `p.sosa`, sinon `sosaNumberFor(p.id)` ; jamais à 22 px.
- Réglage : `localStorage['genealogie-portraits']` (Réglages → Apparence → « 👤 Portraits ») ; les couleurs, la forme et le bord sont des variables `--lc-av-*` sur `:root` (styles `.lc-av` dans app.css). « Comme avant » (par défaut) : `UI.avatarOn()` est faux et chaque endroit garde son dessin.
- Branché : fiche (88), liste des personnes (34), menu de choix (34 / 22 / 48), fenêtre des images (22), arbre et diagrammes (48), tableau de bord (48), Recherche (48), œuvres, profils, artistes, écoles (22 / 34 / 88), employeurs (34), tableaux (48).

## K15 — Colonne de gauche (app-colonne.js)

- Réglage : `localStorage['genealogie-left-column']` = `{mode, style, nums, numstyle, tabs, size, width, lf}` (Réglages → Apparence → « ▤ Colonne de gauche »). « Comme avant » (par défaut) : rien n’est posé.
- Sinon : attributs `data-lc-col-style|nums|tabs|size` sur `:root` (styles dans app.css) et `--sidebar` pour la largeur ; après chaque dessin de `#sidebar-content` : numéros réécrits 01, 02… (`.side-number`, l’original gardé dans `data-lc-num`), onglets `.segmented` en « icône + nom » (`data-lc-tab` garde l’original), « Liste | Fiches » (`.investigation-display`, `.result-display`) recopié dans l’en-tête de page, le bouton d’origine caché reçoit le clic.
- Pour qu’une nouvelle colonne suive le réglage : `.segmented` pour les onglets, `.side-menu` > `.side-menu-item` > `.side-number`, `.section-label` pour les titres de groupe.


## Boutons en haut à droite (app-apparence.js, apparence.css)

Réglages → Apparence → « Boutons en haut à droite » (juste après l’ordre du menu) : les boutons de `.topbar-meta` (◫ `#side-panel-open`, ↗ `#new-window-open`, 🔒 `#kiosk-toggle`, 🧓 `#mode-simple-open`, 🧮 `#calculette-open`, 🌳 `#genealogy-switch`) se rangent et se cachent avec la même liste que les boutons de la fiche (⠿, numéro, case, Alt + ↑ / ↓), gardée tout de suite (K2), « ↺ Remettre comme au départ » et un aperçu.
- Clé `genealogie-topbar-buttons` = `{order, hidden}` (défauts du site, 💾 Réglages enregistrés de l’Apparence). Sans clé : l’ordre de l’app, rien de caché.
- 🧮 et 🧓 n’ont pas de doublon : leur case lit et écrit leur propre réglage (`genealogie-calculette`.topButton, `forAll` du mode simple) ; leurs interrupteurs changent donc aussi la liste.
- Le rangement est refait tout seul quand un outil ajoute son bouton (une seule écoute sur `.topbar-meta`) ; un nouveau bouton de cette zone s’ajoute dans `TB_ITEMS`, jamais un réglage à part. Test : `tests/test-boutons-haut.js`.

## K4, K8, K10 — dates des fiches, pastilles de statut, « rien ici » (harmonisation validée)

Code : `assets/js/app-indicateurs.js` (`UI.when`, `UI.badge`) et `emptyState` / `empty` dans `app.js`. Styles : `assets/css/indicateurs.css` (chargée après toutes les autres feuilles).

### K4 — Date de création ou de modification : `UI.when`

```js
UI.when(row.updated_at)                       // HTML <time title="samedi 17 octobre 2026 à 23 h 39">aujourd’hui à 10 h 22</time>
UI.when(row.updated_at, {label: 'Modifié'})   // « Modifié hier à 23 h 39 », « Modifié mardi à 9 h 05 », « Modifié le 17 oct. 2026 »
UI.whenText(d, {label}) / UI.whenFull(d)      // le même en texte (pour un toast, un title, une case)
UI.cardsHtml([{…, when: x.updated_at, whenLabel: 'Modifié'}])   // vignettes et lignes (rowsHtml) : la date au même format
```

Comprend `2026-10-17 23:39:32` (SQLite, heure UTC), l’ISO (`…T…Z`), `2026-10-17` (un jour), `17/10/2026` (anciens réglages enregistrés), un `Date` ou un nombre. Moins de 7 jours : « aujourd’hui / hier / mardi à … » ; après : « 17 oct. 2026 ». **Pas pour les dates généalogiques** (naissance, actes…), qui suivent C4.

### K8 — Pastille de statut : `UI.badge`

```js
UI.badge('En cours', 'blue')     // ou 'open' : <span class="ui-badge is-blue">En cours</span>
UI.badge('Terminée', 'closed')   // gris ; sortes : blue, green, yellow, red, grey, black, sosa (+ alias open, done, warn, error, closed, deceased…)
```

11 px, gras, capitales, bord 1,5 px, coins carrés. **Bleu** en cours · **vert** fait / certain · **jaune** à vérifier · **rouge** problème · **gris** fermé / archivé · **noir** décès · **Sosa** toujours bleu plein. Une date n’est pas un statut : `ui-badge is-date` (sans capitales). Les étiquettes (`.label-chip`) gardent leur couleur, même forme.
Les anciennes classes encore écrites par le code ont pris ce dessin et ces couleurs dans `indicateurs.css` : `.status-badge`, `.sosa-star`, `.daboville-tag`, `.outside-genealogy-badge`, `.artist-badge`, `.investigation-status`, `.investigation-item-status-badge`, `.entity-date-badge`, `.h-badge`, `.h-new-badge`, `.tag-conf-badge`, `.grave-status-badge`, `.grave-condition-badge`, `.branch-closed-badge`, `.ar-badge`. Tout nouveau code écrit `UI.badge` (ou `.ui-badge.is-…`), jamais une nouvelle classe.

### K10 — Quand il n’y a rien : deux tailles

```js
emptyState({icon: '📚', text: 'Aucun livre pour l’instant', hint: '…', action: {label: '＋ Nouveau livre', attrs: 'data-empty-click="#new-book"'}})  // grande boîte : page ou liste vide
empty('Aucune source', {icon: '📚', action: {label: '＋ Ajouter une source', attrs: 'data-empty-click="[data-add-source-inline]"'}})          // petite ligne : bloc, panneau
```

Toujours le bouton pour commencer quand c’est possible : `data-empty-click="sélecteur"` clique le vrai bouton de création, `data-empty-focus="sélecteur"` va au champ du formulaire. En HTML écrit à la main (chaîne entre apostrophes…) : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📚</span><span class="empty-line-text">Aucune source</span>[bouton]</p>`. Plus jamais de `<p class="muted">Aucun…</p>`. La Carte (« Aucun événement dans cette zone » + « ⤢ Voir tout ») et la Recherche (avant de chercher) utilisent les mêmes.

## K1 — Erreurs dans les formulaires : `UI.fail`, `UI.validateForm` (app-forms.js)

Une seule façon de dire qu'il manque quelque chose (maquette `harmonisation-K.html`, K1) : cadre rouge autour du champ, la phrase juste dessous, curseur dans le premier champ fautif, fenêtre ouverte, « ⛔ N choses à corriger avant d’enregistrer. » en haut s'il y en a plusieurs ; l'erreur s'efface dès qu'on tape ou qu'on choisit.

```js
onSubmit: f => {
    if (!f.elements.title.value.trim()) return UI.fail(f.elements.title, 'Donne un titre au widget.'); // renvoie false : la fenêtre reste ouverte
    if (!Number(f.elements.person.value)) throw UI.invalid('person', 'Choisis une personne.');       // openDialog la montre sous le champ (pas de toast)
}
UI.formErrors(form, [[form.elements.a, 'Donne un titre.'], [form.elements.b, 'Entre 1 et 12 générations.']]); // plusieurs d'un coup ; true si aucune
UI.validateForm(form);            // règles du navigateur (required, min, max, type=email, pattern…) + input[type=hidden][data-required]
UI.fieldError(champ, '…'); UI.clearFieldError(champ); UI.clearFormErrors(form);
```

- Le champ : l'élément, ou son nom / un sélecteur (cherché dans le formulaire en cours d'envoi). Un champ caché (menu de choix, lieu, fichier « 📁 Choisir ») : c'est l'habillage visible qui est encadré (`.pk`, `.h-place`, `.file-pick`…).
- **Rien à écrire pour `required`, `min`, `max`, `type=email`…** : la bulle du navigateur est remplacée partout par le même rendu (l'événement `invalid` est intercepté) ; `data-error="Entre 1 et 12 générations."` sur le champ donne sa phrase, sinon une phrase simple (« Ce champ est à remplir. », « Au moins 1. »…).
- Classes : `.is-invalid` (l'encadré), `.ui-field-error` (la phrase), `.ui-form-errors` (le résumé, une `ui-notice-error` de C7). Exclure : `data-ui-off`.
- Le toast rouge reste pour ce qui échoue **après** l'envoi (base verrouillée, réseau, conflit).

## K6 — Fenêtres : 4 largeurs, le bas toujours là

| Taille | Classe | CSS | Pour |
|---|---|---|---|
| Petite 540 | `modal small-modal` (ou `modal-s`) | `var(--modal-s)` | une question, un choix |
| Moyenne 760 | `modal` (`h-modal`) | `var(--modal-m)` | un formulaire d'une colonne |
| Grande 1040 | `h-modal-wide` (`openDialog({wide: true})`) ou `modal-l` | `var(--modal-l)` | 2 colonnes, aperçu à droite |
| Galerie 1180 | `modal-xl` | `var(--modal-xl)` | fenêtre d'images, galeries de modèles |
| Plein écran | `is-full` (⛶) | réduit : `var(--modal-win-w)` × `var(--modal-win-h)` | les éditeurs |

- Jamais d'autre largeur (`width: min(820px, …)`) : une classe à soi prend une de ces variables.
- Le bas `.modal-actions` (dernier enfant de la fenêtre ou de son `<form>`) reste collé en bas quand on fait défiler, et le titre (`.modal-head`) en haut. Ordre : Supprimer à gauche, Annuler puis le bouton principal à droite.
- Une fenêtre qui ne fait que montrer : « Fermer » seul (`openDialog` sans `onSubmit` le met tout seul ; `closeLabel` pour un autre mot).
- Filet de sécurité : une fenêtre `.modal` ouverte sans bas en reçoit un (« Fermer », qui passe par son ×) — `data-no-foot` pour l'éviter. Les éditeurs (barre du haut E1, ⛶) n'en ont pas.

## K12 — Bulles au survol et touches : `LCNDA_APP.keys` (app-tips.js)

Rien à écrire pour la bulle : tout élément avec `title` (ou un bouton icône avec `aria-label`, ou un bouton avec `data-shortcut`) a la bulle de l’app (fond noir, 0,4 s, au-dessus ou au-dessous). Le `title` n’est retiré que pendant le survol, puis remis : le code qui le lit ou le change ne voit rien. `data-tip-off` (ou `data-k-off`) sur un élément ou un parent : pas de bulle.

```js
const K = window.LCNDA_APP.keys;          // aussi LCNDA_UI.keys
K.html('⇧⌘Z')      // <kbd class="k-keys"><kbd class="k-cap">Ctrl</kbd><kbd class="k-cap">Maj</kbd><kbd class="k-cap">Z</kbd></kbd> hors Mac
K.text('Mod+S')    // « ⌘S » sur Mac, « Ctrl+S » ailleurs (pour un toast, un aria-label)
K.parts('⌘V / Ctrl+V')   // ['Ctrl', 'V'] hors Mac : on garde l’écriture de cet ordinateur
K.setKbd(kbd, '⌘D')      // écrit la touche dans un <kbd> de menu (valeur d’origine dans data-k)
K.isMac
```

- Les textes de la page sont redessinés tout seuls : « colle-la (⌘V) » devient « colle-la ( Ctrl V ) » en petites touches sur PC ; « ⌘V / Ctrl+V », « ⌘/Ctrl » ne gardent qu’une écriture. Écrire la touche Mac (ou « Mod+… ») dans le code ; jamais les deux.
- Un texte propre à un système (« ⊞ + . » pour les émojis sous Windows) : `K.isMac ? '⌃⌘Espace' : '⊞ + .'`.
- `data-shortcut="⌘S"` sur un bouton : la touche va dans la bulle (plus jamais « (⌘S) » ajouté au `title`).

## K13 — Une fenêtre « Imprimer », une fenêtre « Importer » (app-actions.js)

```js
UI.printPage('Fiche de Joseph MARTIN');                     // le contenu de l’écran (#workspace), sans menus ni boutons
UI.printPage('', {element: '.h-booklet', bodyClass: 'h-gaps-printing', orientation: 'landscape'});
UI.openPrintDialog({title: 'Bordereau', html: '<!doctype html>…', photos: false,
    options: [{key: 'notes', label: 'Sources et notes', checked: true}]});   // html peut être (choix) => texte
UI.printDocument(html);   // « 🖨 Imprimer » d’une fenêtre d’export E3 : tout de suite, sans aperçu
```
Fenêtre : aperçu de la page (nombre de pages), A4 / A5, Portrait / Paysage, « Ce qu’on imprime » (Photos d’office), Annuler · ⤓ PDF · 🖨 Imprimer. L’impression se fait dans un cadre caché (sans scripts) ; les dessins `<canvas>` deviennent des images.

### L1 — la même fenêtre pour tous les outils (zone « Ce qu’on imprime », pages, exemplaires)

```js
UI.openPrintDialog({title: 'Ma présentation', key: 'presentation', zone: 'Présentation', margin: 0, photos: false,
    options: [{key: 'what', type: 'radio', value: 'slides', choices: [['slides', 'Les diapositives'], ['notes', 'Les notes seules']]},
              {key: 'per', type: 'radio', label: 'Diapositives par page', tiles: true, choices: [{value: '1', label: '1', cells: 1}, {value: '4', label: '4', cells: 4}], show: c => c.what !== 'notes'},
              {key: 'nums', label: 'Numéros des diapositives', checked: true},
              {key: 'bleedMm', type: 'number', label: 'Fond perdu', value: 3, unit: 'mm', min: 0, max: 20}],
    current: c => 3,                       // « Celle affichée » (numéro de page, à partir de 1)
    html: c => UI.printSheets({title, choix: c, pages: [{html: '…'}, {fit: {w: 1920, h: 1080, html: diapo}}]})});
```
- `html(choix)` est rappelée à chaque changement : `choix` = les options + `paper`, `orientation`, `pageMm` ([largeur, hauteur] de la feuille, dans le sens choisi).
- **Pages** : les pages du document marquées `data-k-page` (UI.printSheets les marque ; la mise en page aussi) donnent « Toutes (N) / Celle affichée / Choisir » (`UI.parsePages('1-3, 7', n)`) et « Exemplaires » ; l’aperçu montre la vraie page (‹ ›, PageUp / PageDown). Un document sans marques : l’aperçu le découpe à la hauteur de la feuille.
- `UI.printSheets({pages: [{html, w, h, fit, pad, cls}], choix, css})` : une feuille par page (w, h en mm : taille exacte, pages nommées `@page`) ; `fit: {w, h, html}` réduit un contenu de taille connue (px) pour tenir dans la feuille.
- `key` : format, sens et choix retenus par outil (`genealogie-print-prefs`) ; `keepFormat` : seuls les choix (le format vient du document) ; `sizeLocked` : chaque page a sa taille exacte (mise en page, livret) — format montré, pas de `@page` ajouté ; `margin` (mm) : la marge de la feuille.
- `UI.printPaper(l, h)` → `{paper, orientation, size}` ; `UI.printDocument(html)` (« 🖨 Imprimer » d’E3) ouvre cette fenêtre réglée sur le `@page` du document (`{direct: true}` : sans fenêtre) ; `UI.onPrintKey(fenêtre, fn)` : ⌘P dans cet éditeur appelle `fn` (`UI.printFromKey`, branché dans `printScreen`).
- Outils branchés : présentations, catalogue raisonné et listes d’œuvres, diagrammes, fiches, livret plié, diaporama, transcription (outil et visionneuse), dessin, mise en page (pages simples / planches / livret, fond perdu, traits de coupe, notes), livre de famille, carte de photos, tableaux et retouche (E3). Jamais `window.open` ni `window.print()` (test `tests/test-harmo-l1-imprimer.js`).

```js
UI.openImportDialog({title: 'Importer un tableau CSV', accept: '.csv,text/csv', noun: 'personne', feminine: true,
    analyze: async files => ({count: 12, summaryHtml: '<b>12 personnes</b>, 34 événements', notices: [{kind: 'warn', text: '3 doublons possibles seront mis de côté.'}], preview: '<table>…</table>', data}),
    run: async (analyse, files) => { const ids = await importer(analyse.data); return {message: '12 personnes importées', undo: () => retirer(ids)}; }});
```
1. déposer le fichier (zone E4) · 2. « Voilà ce qui va entrer : … » (← Retour) · 3. « ⤒ Importer 12 personnes » → message H7, avec « ↶ Annuler » si `undo`. Une erreur levée dans `analyze` ou `run` s’affiche dans la fenêtre (⛔).

Sans rien changer à un outil : un bouton dont le nom commence par « ⤒ Importer… » (ou 📥) qui ouvre le choix de fichier (`input.click()`, `showPicker()`, étiquette autour du champ) passe tout seul par cette fenêtre ; à l’étape 2, un coup d’œil au fichier (personnes d’un GEDCOM, lignes d’un CSV avec les premières lignes, éléments d’un JSON, nom d’un réglage) ; à l’étape 3, le fichier est remis au champ (`input` + `change`), et le formulaire `form[id^="import-"]` / `form[data-k-import]` est envoyé. `data-k-direct` sur le champ : le choix de fichier habituel. `importSettingFile` (réglages) utilise la fenêtre directement (le nom se change à l’étape 2).

## K14 — « ⋯ » et clic droit : `UI.menuAt`, `UI.contextMenu` (app-ui.js, app-actions.js)

```js
UI.menuAt(boutonPlus, [
    {icon: '↗', label: 'Ouvrir', run: open},
    {icon: '✎', label: 'Renommer', run: rename},
    '-',                                                   // un trait
    {icon: '⧉', label: 'Dupliquer', shortcut: '⌘D', run: dup},
    {icon: '🗑', label: 'Supprimer', danger: true, run: del},  // toujours en bas, en rouge, après un trait
], {title: '« Mon tableau »'});
UI.contextMenu(event, items);   // le même menu à l’endroit de la souris (clic droit d’un outil)
```
- « ⋯ » fait d’un `<details class="ui-more | ui-ph-more | ui-card-more">` : ouvre ce menu tout seul (ses boutons sont cliqués pour de vrai).
- Clic droit sur une ligne (`tbody tr`, `.ui-row`, `.ui-card`, `[data-ctx-menu]`, vignettes…) : le menu de son ⋯ à la souris, sinon un menu fait de ses boutons (↗ Ouvrir d’abord). Sur un objet d’un éditeur (`.vx-stage`, `.ly-canvas`, `.kn-stage`, `.h-board-stage`, `.h-hs-stage`) : l’objet est choisi, puis Couper, Copier, Coller, Dupliquer, Premier plan, Avancer, Reculer, Arrière-plan, Grouper, Dissocier, Verrouiller, Supprimer — les commandes de l’éditeur, avec leurs touches.
- Maj + clic droit, une case de texte, du texte choisi, une carte Leaflet : le menu du navigateur. `data-ctx-off` : pas de menu de l’app.

## K3 et K11 — Les mêmes mots, un symbole par action (app-mots.js)

**K3 — un seul mot par geste**

| Pour… | On écrit |
|---|---|
| une chose nouvelle (bouton principal d’une fenêtre « Nouveau… ») | « Créer » + ce qu’on crée : « Créer le livre », « Créer l’enquête » |
| une chose qui existe | « Enregistrer » |
| mettre une chose dans une autre (une photo dans un recueil, un témoin dans un événement) | « Ajouter » (« ＋ Ajouter… » sur la page) |
| attacher deux fiches | « Relier » (« 🔗 Relier un recueil ») ; l’inverse : « Retirer » — jamais Rattacher, Lier, Associer |
| revenir au départ | « ↺ Remettre comme au départ » — jamais Réinitialiser, Revenir au standard, Tout remettre à zéro… (un départ précis peut se dire : « ↺ Remettre le Sosa 1 de la base ») |
| une fenêtre qui ne fait que montrer | « Fermer » seul, à droite (jamais « Annuler » + « Fermer ») |
| un réglage | « Enregistrer » (« Appliquer » reste pour une opération : un filtre sur une image, une transformation) |

```js
UI.createLabel('Nouvelle enquête')    // « Créer l’enquête » ; « Nouveaux… » → « Créer les … » ; null si le titre n’est pas « Nouveau… »
openDialog({title: 'Nouveau livret', onSubmit})            // bouton « Créer le livret » tout seul (sans submitLabel)
openDialog({title: 'Organiser', submitLabel: 'Fermer', onSubmit})   // « Fermer » seul (pas d’« Annuler »)
```
Filet de sécurité : à l’ouverture d’une fenêtre (`showModal`) dont le titre est « Nouveau… », un bouton principal qui dit seulement « Enregistrer » ou « Créer » devient « Créer le … » ; il reprend son mot quand la même fenêtre s’ouvre pour modifier. `data-k3-off` sur la fenêtre ou le bouton pour l’éviter.

**K11 — une action = un symbole** (`UI.SYMBOLS`)

| Action | Symbole | | Action | Symbole |
|---|---|---|---|---|
| Importer | ⤒ | | Exporter, Télécharger | ⤓ |
| Enregistrer | 💾 | | Imprimer | 🖨 |
| Modifier | ✎ | | Supprimer | 🗑 |
| Fermer, retirer d’une liste | × | | Ouvrir | ↗ |
| Annuler / Rétablir (défaire) | ↶ ↷ | | Réglages, Personnaliser | ⚙️ |
| Chercher | 🔍 | | Ajouter, Nouveau, Créer (sur la page) | ＋ |
| Copier, Coller | 📋 | | Dupliquer | ⧉ |
| Plus d’actions | ⋯ | | Favori, raccourci | ⭐ |
| Fichier, dossier, choisir un fichier | 📁 | | Relier | 🔗 |
| Remettre comme au départ | ↺ | | Plein écran | ⛶ |
| Envoyer, confier à quelqu’un | 📤 | | | |

- Un seul signe devant le mot : « ＋ Nouveau livret » (jamais « 📘 + Nouveau livret », « 🐾 + Nouvel animal ») ; toujours « ＋ » (pas « + », ➕, ⊕).
- 📥 n’est plus une action (ni importer, ni exporter) ; il ne reste que pour une boîte d’arrivée (« Non classés », dossier surveillé).
- Le nom du format va dans le menu : « ⤓ Exporter ▾ → CSV, PDF… » ; un bouton à un seul format : « ⤓ Exporter en CSV ».
- Les menus d’un éditeur gardent l’icône de l’objet (« 🎚 Nouveau calque de réglage ») ; les choix de format d’une fenêtre d’export E3 (📄 PDF, 🖼 PNG…) aussi.
- Le test `tests/test-harmo-mots-symboles.js` cherche les variantes interdites dans le code.

## K16 — Interrupteur ou case à cocher (app-saisies.js, saisies.css)

Une règle simple :

| Quoi | Composant |
|---|---|
| Un réglage qui s’applique **tout de suite** (Réglages et toute page K2, panneau d’un éditeur, option d’un affichage : « Afficher les valeurs », « Aimanter à la grille », « Masquer les vivants dans GEDCOM ») | **interrupteur** |
| **Choisir des éléments dans une liste** (lignes ou blocs à montrer, colonnes, filtres, types, personnes) | case à cocher |
| Une option qu’on **valide ensuite par un bouton** (« Enregistrer », « Créer », « ⤓ Exporter », « ⤒ Importer ») : « Inclure les médias », « Date incertaine » | case à cocher |

```html
<label class="ui-toggle"><input type="checkbox" data-x="dates" checked><i></i>Afficher les dates</label>   <!-- interrupteur : <i></i> juste après la case -->
<label class="checkbox-line"><input type="checkbox" name="include_media" checked> Inclure les médias</label>
```

```js
UI.toggleHtml('Afficher les dates', {checked: true, attrs: 'data-x="dates"', sub: 'petite ligne grise'});
UI.checkHtml('Inclure les médias', {checked: true, attrs: 'name="include_media"'});
UI.asToggle(label)   // montre une ancienne « .checkbox-line » en interrupteur (même case : mêmes noms, mêmes événements)
```

- C’est toujours un vrai `input type=checkbox` : `name`, `checked`, `change`, `FormData` ne changent pas.
- L’interrupteur garde son aspect même dans une grille de formulaire (`.form-grid label { display: grid }`).
- Jamais de « switch » fait à la main, ni de case appelée « …-toggle » ; un diagramme (`type: 'check'`) et `iChk` de la présentation donnent déjà un interrupteur.

## K17 — Nombres avec unité, heures et durées écrites librement (app-saisies.js)

**L’unité est dans la case** (« 12 | px », comme la case des curseurs C3), jamais dans le libellé (« Taille (px) », « Durée (s) », « (cM) ») ni écrite après la case.

```html
<label>Taille<input type="number" name="size" value="12" data-unit="px"></label>          <!-- « 12 | px », la case reste la même -->
<label>Arrivée<input data-ui-time name="time_from" value="09:30"></label>              <!-- « 9 h 30 » ; la valeur reste « 09:30 » -->
<label>Durée<input type="number" data-ui-duration="s" name="dur" min="0.1" step="0.1" value="90"></label>   <!-- « 1 min 30 s » ; la valeur reste 90 -->
<label>Durée<input name="duration" data-ui-duration-hint="min" data-ui-colon="ms"></label>     <!-- texte libre gardé tel quel, « ✓ Compris » quand c’est compris -->
```

- Habillage tout seul (comme C1–C4) : `input[data-unit]` (nombre ou texte `inputmode=decimal`), `input[type=number]` dont le libellé finit par « (px) » (l’unité passe dans la case — filet), `input[type=time]` et `input[data-ui-time]`, `input[data-ui-duration]`, `input[data-ui-duration-hint]`. `data-ui-off` pour l’éviter.
- **Heures** : « 14 h 30 », « 14h30 », « 14:30 », « 9h05 », « 1430 », « 14 », « midi », « minuit et demie », « 2 pm ». Dessous « ✓ Compris : 14 h 30 » ou « ⚠️ Heure impossible : 25 h ».
- **Durées** : « 2 h 15 », « 1 min 30 », « 90 s », « 800 ms », « 1:30 », « 1:05:00 », « 3'20 », « 0,8 » (un nombre seul est dans l’unité de la case). « 1:30 » = 1 min 30 s (ou 1 h 30 pour une case en minutes ; `data-ui-colon="ms"` pour forcer minutes:secondes). `min`, `max`, `step` de la case sont respectés (« trop long : au plus 5 s », « arrondi à 1 min près »). ↑ ↓ (⇧ ×10) changent d’un pas.
- **Les valeurs enregistrées ne changent pas** : la case d’origine reste là (cachée), avec son nom, sa valeur (« 14:30 », un nombre dans son unité) et ses écouteurs ; elle reçoit `input` pendant la frappe et `change` à la fin ; `champ.value = …` écrit par l’outil met la case visible à jour. Une saisie pas comprise : la case d’origine garde l’ancienne valeur et `setCustomValidity` → K1 montre l’erreur et garde la fenêtre ouverte.
- Aides : diagrammes `C('height', 'Hauteur au plus', 'number', {unit: 'px'})` ; dessin vectoriel `fld(k, label, v, {unit: 'px'})` ; champs des types (artistes) `{type: 'number', unit: 'min'}` ; filtres de la retouche `[clé, libellé, min, max, départ, pas, unité]`.

```js
UI.numberField({name: 'w', value: 120, unit: 'mm', min: 1, step: 0.5});   // .input
UI.timeField({name: 'at', value: '14:30'});                                // .input = la case enregistrée, .text = la case visible
UI.durationField({name: 'dur', value: 90, unit: 's', max: 600});
UI.readTime('14h30')                        // {ok: true, value: '14:30', label: '14 h 30'}
UI.readDuration('1 min 30', {unit: 's'})    // {ok: true, value: 90, seconds: 90, label: '1 min 30 s'}
UI.formatDuration(90, {unit: 's'})          // « 1 min 30 s »
UI.clock(3920)                              // « 1:05:20 » — l’affichage commun d’une durée dans un lecteur (« 3:20 », « 1:05:00 » ; {tenths: true} → « 0:03,5 »)
```

## K18 — Barre du bas des éditeurs : `UI.editorStatus`, `UI.zoomControl` (app-editeurs.js, editeurs.css)

Une seule barre en bas de tous les éditeurs (Retouche, Retouche rapide, Montage, Son, Mise en page, Dessin et ses outils carte / arbre / faire-part / sceau, Présentation, Diaporama, Transcription, Maison, Tableaux, Tableur) : à gauche **où l’on est**, au milieu **l’aide de l’outil choisi**, à droite **🧲 · 📏 · [− 100 % ▾ +]**.

```js
const bar = UI.editorStatus({
    where: 'Page 1 / 38',                     // texte, ou un élément (la navigation des pages…) déplacé dans la barre
    help: 'Clic : choisir · glisser : déplacer',
    zoom: {get: () => zoom, set: k => setZoom(k), fit: () => zoomFit(), min: .1, max: 8},   // 1 = 100 % ; fit = « Ajuster à la fenêtre »
    magnet: {get: () => snapOn, set: v => { snapOn = v; }}, magnetTitle: 'Aimanter : …',     // facultatif
    rulers: {get: () => guides, set: v => { guides = v; render(); }}, rulersTitle: '…',      // facultatif (📏)
    wheel: stage,                             // facultatif : ⌘ + molette sur cet élément (si l’outil ne le fait pas déjà)
});
host.appendChild(bar);
bar.setWhere('Calque 2'); bar.setHelp(AIDES[outil]); bar.flash('Objet verrouillé.');   // flash : 5 s à la place de l’aide
bar.sync();                                    // après un zoom fait par l’outil (molette, pincement…) : relit le zoom et 🧲 📏
```

- Le zoom : `[−]` `[100 % ▾]` `[+]` ; le menu propose « ⤢ Ajuster à la fenêtre » ⌘0, 50 %, 100 % ⌘1, 200 %. **⌘0, ⌘1, ⌘+ et ⌘−** sont pris par une seule écoute (avant les touches de l’outil) pour l’éditeur du dessus (`UI.editorZoomKey`, aussi appelé par le menu Affichage de l’app Electron via `ext.editorZoom`).
- Un seul nom pour l’aimant : **🧲 Aimanter** (bulle : ce qui s’aimante et la touche pour s’en passer). Mêmes noms dans le menu Affichage : « ⤢ Ajuster à la fenêtre », « 100 % (taille réelle) », « 📏 … », « 🧲 Aimanter ».
- L’ancien bas d’un outil gardé pour ses écouteurs : classe `ed-old-hidden` (caché).

## K19 — Colonne d’outils : `UI.editorRail`, `UI.railProxy`, et « 💾 Enregistrer ▾ » : `UI.saveMenu`

```js
UI.editorRail(nav, {breaks: ['[data-x-tool=pen]', '[data-x-tool=text]', '[data-x-tool=hand]']});   // 36 px, un trait avant chaque groupe
UI.railProxy(nav, rangée.querySelectorAll('[data-op]'), {icons: {split: '✂️'}});   // des boutons à texte → cases à icône (texte en bulle), l’original caché
UI.saveMenu(bouton💾, () => [{icon: '🗂', label: 'Enregistrer sans l’afficher', run}, …]);           // « ▾ » collé à 💾 : les autres façons d’enregistrer
UI.editorMenus(nav, {Fichier: () => items, Édition: () => items, Affichage: () => items});            // E1 : menus du haut avec le menu de l’app
const h = UI.editorHistory({get: () => état, set: é => remettre(é), onChange: h => majBoutons(h)});    // E1 : ↶ ↷ par instantanés ; h.commit() après chaque changement
```

- Cases de 36 px, l’outil actif en bleu (`.is-active`, `.is-on` ou `aria-pressed`), groupes séparés par `.ed-rail-sep`. Sur téléphone la colonne reste (36 px) ; la Retouche complète la met en ligne sous 900 px.
- Les actions de fin (Enregistrer et afficher, Enregistrer sans l’afficher, Copie séparée, Garder dans les médias…) ne sont **qu’en haut**, dans « 💾 Enregistrer ▾ ». Les boutons d’en bas restent dans la page (cachés) pour leurs écouteurs et les essais.
- La barre du haut tient sur une ligne : ce qui ne tient pas passe dans un menu (Maison : l’aimant est allé dans la barre du bas).

## K20 — Poignées : ⠿ pour ranger, carrés blancs au bord bleu autour des objets

- Ranger une ligne : `⠿` gris de 16 px à gauche (classes `.dnd-grip`, `.order-grip`, `.ui-grip`…, style commun dans editeurs.css). `heritage-dnd.js` la rend prenable au clavier (Tab) et déplace la ligne avec **Alt + ↑ / ↓** (il presse les flèches ↑ ↓ de la ligne, ou rejoue le glisser-déposer d’une ligne). À la souris, les flèches ↑ ↓ des lignes qui ont une poignée sont cachées (elles restent au doigt).
- Autour d’un objet : petits carrés blancs au bord `--ed-handle-line` (le bleu de l’app), un rond pour tourner — mêmes réglages pour `.vx-handle`, `.h-hs-handle`, `.h-tx-handle` (SVG) et `.kn-h`, `.ly-h`, `.h-bh`, `.h-rt-crop i` (HTML). Un nouvel éditeur reprend une de ces classes, jamais une autre couleur.

## K2 dans une fenêtre de réglages : `UI.autoSaveDialog`

```js
openDialog({title: 'Réglages par défaut des livres', body, onOpen: dg => UI.autoSaveDialog(dg, {
    keys: ['genealogie-layout-defaults'],      // les clés localStorage des réglages
    save: () => { écrireLesClésDepuisLaFenêtre(); }, reload: () => { remplirLaFenêtre(); },
    reset: () => { localStorage.removeItem('genealogie-layout-defaults'); },   // bouton [data-ui-reset] « ↺ Remettre comme au départ », sans question
    onChange: () => redessinerDerrière()})});   // pas d’onSubmit : « Fermer » seul en bas
```

« ✓ Enregistré » s’affiche dans le haut de la fenêtre ; chaque changement donne un message H7 avec « ↶ Annuler » / « ↷ Rétablir ». Les listes à ranger d’Apparence (menu, listes, cartes, onglets des Réglages, graphiques, fonds de cartes, bibliothèque des widgets) s’enregistrent toutes seules (app-editeurs.js presse leur bouton caché après chaque case, nom, ⠿ ou Alt + ↑ / ↓).

## 🧓 Mode simple (app-mode-simple.js, mode-simple.css, lib/mode_simple.php)

Le mode grand-parent validé : de très gros boutons, l’arbre, les photos, les personnes et « Ce jour-là », rien à modifier.

```js
const MS = window.LCNDA_EXT.modeSimple;
MS.enter();            // l’entrée normale : la 1re fois les réglages (« Préparer »), ensuite le mode
MS.open();  MS.close(); MS.isOpen();
MS.settings();         // les réglages nettoyés ; MS.write(s) les garde (K2 les voit et propose « ↶ Annuler »)
MS.eff(s);             // ce qui s’applique vraiment (avec « Pareil que l’app » : daltonisme, contraste, taille, mouvement, voix)
MS.kin(qui, cible);    // « ta grand-mère », « le mari de ta petite-fille Émilie » (après MS.loadData())
MS.makeMode(cadre, {preview: true, settings}); // le même moteur dans un cadre (aperçu, « Essayer ici »)
```

- Données : GET `api.php?action=mode_simple_data` → `{persons, families, media, start}` (dates lues par `cal_parse_date`, vivants comme l’export « pour partager », fiches confidentielles marquées `priv`).
- Réglages : `localStorage['genealogie-mode-simple']` (copié dans la base, défaut du site) et `genealogie-mode-simple-presets` ; « Réglages de base » coupé → `lcnda-mode-simple-local` (cet appareil) ; `lcnda-mode-simple-device` = `{start, viewer}`. Le code de sortie : `codeHash` = sel + SHA-256, jamais en clair.
- Lecture seule : pendant le mode, `fetch` / `XMLHttpRequest` / `sendBeacon` non-GET sont refusés (les réglages d’affichage en attente partent après la sortie), `body.is-kiosk`, l’app est `inert` et cachée.
- Lien de parenté : mêmes mots que `qm_kin_label_g` (lib/question_more.php), puis les alliances.
- **Gros boutons réglables** (section 06 « Ce qu’on montre ») : `tiles` = `[[clé, montré]]` (les 4 de base `tree photo people day` toujours présents, + jusqu’à 12 cadres ajoutés `c1`, `c2`…) ; `tx[clé]` = `{label, sub, icon}` (vide = texte de départ, icônes de `TILE_ICONS`) et, pour un cadre ajouté, `{kind: 'person'|'album'|'note', pid, text, color}`. Disposition : `perRow` (0 = comme avant, 1–4 ; 2 au plus sur téléphone), `tileH` (100–360 px), `tileGap`, `tileTitle` (26–64 px, jamais sous 22), `tileFont` (`UI.openFontPicker`). Tout passe par `clean()`, les 💾 Réglages enregistrés, l’export et le défaut du site (les anciens réglages sont relus sans erreur). Un cadre ajouté sans personne, sans photo ou sans texte n’apparaît pas sur l’accueil (l’éditeur le signale). Cadres : ⭐ Une personne → sa fiche en phrases ; 📸 Un album → le diaporama de ses photos ; 💌 Un mot → l’écran `note` (texte en grand, 🔊). La couleur d’un cadre ajouté entre dans « Lisible ? » (7:1, « Corriger »). Ensembles prêts en plus : « Une grande colonne », « Trois par ligne ».
- Onglet de réglages : `app-access.js` pose les onglets « ♿ Toute l’app » / « 🧓 Mode simple » (sessionStorage `lcnda-a11y-tab`) et appelle `MS.mountTab(page)`.
- Test : `tests/test-mode-simple.js`.

## 🎨 Designs au choix A1–A8 (app-designs.js, designs.css, designs-gen.css)

Réglages → « 🎨 Designs au choix » (`ext.maintenance.designs`, juste après « Apparence »). Six réglages de **forme** sur la page : A1 Style général (traits, ombres, coins, quadrillage), A2 Densité, A3 Icônes, A6 Boutons, A7 Mouvements, A8 Listes (numéros gardés). **A4 Fiche d’une personne** n’est plus sur la page (lien `data-lcd-fiches`) : cadre « Forme de l’en-tête » de Réglages → Apparence → Fiches personnes et animaux (`ext.designsA4Frame`), même stockage `genealogie-designs`.a4. **A5 Cases des arbres** n’est plus sur la page (`PAGE_IDS`, lien `data-lcd-trees`) : il se règle dans Graphiques → « 🎨 Couleurs des stats et des arbres » (`#stats-colors-dialog`, sur-titre « COULEURS », titre « Statistiques et arbres »), section « 🌳 Cases des arbres » dessinée par `ext.treeCards` (`mount(host)`, `colors(host, m, f)`, `reset(host)`, `current()`, `save(host, m, f)`) et gardée par le bouton « Enregistrer » de la fenêtre ; même stockage (`genealogie-designs`.a5), donc réglages enregistrés, défaut du site et anciens réglages inchangés. La rubrique « Couleurs par sexe » de la même fenêtre réunit la **couleur** (= A5 m/f = portraits K7, `gender_male_color` / `gender_female_color`) et le **fond / texte** des cases « Blanches » (`genealogie-gender-colors`). Réglage : `localStorage['genealogie-designs']` (suit la base comme les autres « genealogie-* »), dans `SITE_DEFAULT_KEYS`, `site_defaults_allowed_keys()`, `LAYOUT_KEYS` et les designs de l’Apparence (`lookFlat` → `a_designs`).

- **Apparence passe devant, toujours** : le premier cadre d’Apparence (Preset, Couleur principale, Police de caractères, Taille typographique, Menu des onglets…) n’est jamais remplacé par un design. Aucune règle de designs.css / designs-gen.css ne touche à `--font-family`, à la taille du texte, à `--blue`, `--bg`, `--paper`, `--card-bg`, `--card-head-bg`, `--ink`. La couleur des traits d’A1 est tirée des couleurs de l’Apparence (`color-mix(var(--ink), var(--card-bg))`), le gris des lignes d’A8 aussi ; un thème à soi avec ses propres traits (`html.lc-frame`) garde les siens (`:root[data-lc-lines]:not(.lc-frame)`). Toute nouvelle règle de design : de la forme seulement, jamais de police, de taille de texte ni de couleur principale.
- Retirés (doublons avec Apparence) : « ★ Ensembles prêts » et leurs réglages enregistrés (`genealogie-designs-presets`), l’ancienne A7 « Police de l’interface », l’ancienne A10 « Tableau de bord », la « couleur d’accent » d’A1 et la palette de fonds des styles.
- `LCNDA_DESIGNS.read()` / `write(G)` / `clean(raw)` : `G = {ver: 2, a1: {v, …réglages en plus}, … a8}` ; `defOf(id, carte)`, `isOn(G, id)` (une carte ≠ « Comme avant » ou une retouche), `isModified(G, id)` (« retouché »), `defaults()`.
- Anciens réglages : `migrate(raw)` relit un réglage sans `ver` (A1–A10) sans erreur — A7 police et A10 ignorés, A8 → A7, A9 → A8, couleur d’accent oubliée. `portable(raw)` rend la valeur à neuf (`''` si tout est « Comme avant ») : utilisé par `lookFlat` / `lookFromFlat` (💾 l’Apparence) et `TIDY` de heritage-studio.js (💾 toute l’app). Au chargement, `tidyStorage()` réécrit la copie du navigateur et efface `OLD_KEYS` (`genealogie-designs-presets`, `lcnda-designs-ui-v1`…) ; `applyTo` retire aussi les anciens attributs (`OLD_ATTRS`).
- `attrsOf(G)` → `{attrs, vars}` posés par `applyTo(<html>, G)` ; rien du tout pour « Comme avant ». Attribut principal par réglage : `data-lc-style` (A1), `data-lc-density` (A2), `data-lc-icons` (A3), `data-lc-fiche` (A4), `data-lc-tree` (A5), `data-lc-btn` (A6), `data-lc-motion` (A7), `data-lc-list` (A8) ; un attribut par retouche (`data-lc-r`, `data-lc-sh`, `data-lc-lines`, `data-lc-lsel`…).
- Pose au plus tôt : `index.php` relit `lcnda-designs-ui-v2` (copie des attributs) avant le premier dessin ; il allume aussi `designs-gen.css` (`media="not all"` sinon) et `apparence-traits.css` (traits d’A1, préfixe `:root:is(.lc-frame,[data-lc-lines])`).
- `designs-gen.css` est fabriqué par `python3 scripts/build-designs-css.py` (ombres, coins, marges × `--lc-sp`, survol ; jamais de fond ni de couleur) depuis toutes les feuilles d’`index.php` : à relancer après un gros changement de CSS, puis monter son `?v=`.
- Passages sur l’écran (`decorate(root, G)`, MutationObserver léger, rien si aucun réglage ne le demande) : A3 icônes au trait (`.lc-ic`, l’émoji reste dans le texte, caché à l’œil), A4 en-tête de la fiche (`ext.afterPerson`, éléments `.lc-dz`), A8 petit portrait des lignes, A5 Sosa des cases, A7 secondes des messages (`toast.dataset.lcTotal`).
- Le cadre ℹ️ en haut d’Apparence (`apparenceNoteHtml`) : ce que règlent les designs, que la police, la taille et les couleurs se règlent dans Apparence, et la liste des designs changés.
- Aperçus : petites pages (iframe `srcdoc`) avec les feuilles de l’app, le réglage montré posé sur leur `<html>` et de vrais écrans (fiche ouverte, personnes, `LCNDA_PARTS.treeHtml`, dernier tableau de bord affiché).
- Tests : `tests/test-designs.js`, `tests/test-designs-apparence.js` (Apparence passe devant chaque design ; ancien réglage nettoyé).


## 🗂 Sections des fiches et fiche animal unique (app-sections.js, sections.css, app-apparence.js, heritage-pets.js, heritage-suivi-fiche.js)

Maquettes validées : `docs/design/fiche-sections.html` (F1–F12), `reglages-fiches.html` (P1–P3), `fiches-et-designs.html` (D1–D4).

```js
const S = window.LCNDA_SECTIONS;
S.renderSheet(personId, kind, renderers); // le corps de la fiche (appelé par renderPersonBody d'app.js) : sections, onglets, « Sans section »
S.model(kind, personId);                  // {order, hidden, widths, sections, assign, derived…} : réglage de toutes les fiches (0) ou d'une fiche
S.save(model);                            // garde (K2) ; S.groups(model) → {secs: [{…, keys}], loose}
S.mountEditor(hôte, {kind, personId, look: 'avant' | 'new'}); // l'éditeur (Réglages et fenêtre « ⚙️ Ranger les sections »)
S.revealBlock('animal_health');           // ouvre la section (ou l'onglet) d'un bloc et le montre
S.openArrangeDialog(); S.openSheetsPage('fsec-blocks', 'animal');
```

- **Stockage** : les clés d’avant ne changent pas de forme, on ajoute : `genealogie-person-blocks` / `genealogie-animal-blocks` / `genealogie-person-blocks-<id>` = `{order, hidden, widths, hideEmptyIdentity, sections: [{id: 's_…', name, icon, hidden, folded}], assign: {bloc: id}}`. Sans `sections`, elles sont calculées (`derive`) : pour les personnes une section commence à son premier bloc « repère » (`H_ANCHOR`) et l’ordre des blocs ne bouge pas ; pour les animaux chaque bloc du suivi va dans sa section (`A_NAT`), le reste dans 🪪 Fiche. Un bloc nouveau (module allumé plus tard) non rangé va dans « Sans section ». `savePersonBlockSettings` (app.js) garde `sections` / `assign`. L’ancien rangement de la page simple (`genealogie-pet-sections`) est repris une fois dans l’ordre des blocs des animaux (`migratePetLayout`, drapeau `petLayout`).
- **Options** `genealogie-sheet-sections` (`cleanOpts`, `OPT0`) : `style` line|box|big|band|center|tabs, `place` left|center|right|full|avant, `all` left|right|none, `fold`, `startFolded`, `phoneFirst`, `nums` + `numW` 1|I|A, `blockNums` seq|sec, `count`, `empty` grey|hide, `animalOwn`, `editor` avant|new. Un ancien `gap` est ignoré. Sur cet appareil : `lcnda-sheet-sections-open` (sections repliées), `lcnda-sheet-tab` (onglet ouvert), `lcnda-sheet-edit-tab`.
- **Forme** : rien de propre aux sections. Classes `.fsec-wrap.is-<style>`, `.fsec`, `.fsec-head`, `.fsec-tabs.segmented` (C5) ; A1 et A6 les dessinent (designs-gen.css, `:root[data-lc-btn] .segmented button:not(.is-active)`), le bandeau prend `var(--blue)`, l’écart entre sections `40px × var(--lc-sp)` (A2).
- **Fiche animal unique** : plus de page `.page.h-pet`. `ext.openPet(id, view, tab)` : `view = 'pedigree'` garde la page du pedigree en grand, sinon la fiche complète (création si besoin par `pet_make_person`), `tab` = ancien onglet (marks, obs, health, group, map) → `state.sheetFocus` → `revealBlock`. Liens `#pet/<id>[/sante|marques|observations|groupe|carte|pedigree]` (écoute `hashchange` en capture). Blocs : `animal` (🐾 Caractéristiques = résumé + identification), `animal_parents` (🌳 Pedigree), `animal_titles`, `animal_health` (santé écrite + poids + suivi), et `animal_marks`, `animal_obs`, `animal_group`, `animal_map` (heritage-suivi-fiche.js : `marksTab`, `obsTab`… dessinent chacun dans leur bloc, `ext.suivi.ficheCtx.reload()`). `pet_detail` donne `suivi` (nombres pour les titres). Migration 67 (`pets_give_full_fiche`) : fiche complète pour les animaux qui n’en avaient pas, `app_settings['genealogie-pets-merged'] = {n}` → message unique dans la liste. `save_pet` fait toujours la fiche complète.
- **En-tête** (`app-apparence.js`) : ligne `obs` de `HEAD_BUTTONS` (`[data-sv-new-obs].lc-obs-btn`, fiches d’animaux seulement, `data-shortcut="O"`, raccourci `new_observation`) ; `genealogie-sheet-head` = `{order: status|seen|labels|buttons, hidden, seenPlace: name|badges|bottom, green, red, seenDetail, obsPlace: square|blue|pill|strip|fab|hidden, obsKey}` (`ext.sheetHead()`). « 👁 Vu la dernière fois » : place `[data-lc-seen]` posée par l’en-tête, remplie par `ext.suivi.fillSeen` (`UI.when`, `UI.badge`, `ext.suivi.seenBadge`) ; le seuil `red` est aussi celui de `sv_missing`.
- **Page de réglages** : `arrangeSheetsPage()` range les cadres dans l’ordre de P1 et pose le sommaire ; A4 y est montré par `ext.designsA4Frame(hôte)` (app-designs.js, même moteur et même stockage que Designs au choix).
- **Adresse** : `#personnes/<id>/<section>` (nom de la section sans accents — `S.slugOf` —, ou son identifiant `s_family` ; `tout` = « ▦ Tout voir »). `routeFromHash` (app.js) rend `{personId, section}` ; `state.sheetHash = {id, slug, pending}` ; une section inconnue = l’onglet par défaut. Onglets : `showTab` → `A().setSheetRoute(id, slug)` (replaceState) ; une autre fiche = pushState (`selectPerson`), la même ou l’adresse suivie = replaceState ; `popstate` + `hashchange` (une seule fois) → `S.applyRoute()` (onglet, ou section dépliée et à l’écran). Anciennes adresses `?person=12#personnes`, `#personnes`, `#pet/<id>/<vue>` gardées.
- **Aperçu réel** (`fsec-cfg`, `[data-fsec-live]`) : `A().personPageHtml(detail)` (renderPerson sans rien brancher : `{htmlOnly: true}`, `renderSheet(…, {preview: true})`) posé par `LCNDA_DESIGNS.frame(slot, {html, W, detail})` (le cadre des aperçus vivants, iframe sans script, `scale`) ; « Aperçu avec : » = `pickerField({kind: 'person', animals: 'only' | false})` ; `S.refreshLive()` après chaque geste (`redrawAll`, `redrawCfg`, clics de la page). Que des GET. Base vide : `previewHtml` + `empty()`.
- **Supprimer un animal** (lib/pets.php) : `delete_person` d’une fiche d’animal → `pet_trash_snapshot` + `pet_trash_apply` (fiche d’animal, maîtres, profil, marques, observations, santé, groupes, GPS, photos de la liste), gardés dans `_snapshot.pets` du journal ; `restore_deleted_person` → `pet_restore_snapshot`. POST `pet_trash {id}` (liste Animaux, animal resté seul) : avec sa fiche s’il en a une, sinon ligne du journal `pet` / `pet_delete` (`restore_deleted_pet`, « Restaurer », ↶ `restore_last_delete`). `ext.openPet` d’un animal sans fiche : fenêtre « ↺ La rétablir » (`pet_make_person`) · « 🗑 Supprimer l’animal » (`ext.trashPet`).

## 📐 Formats de document et informations (app-formats.js, formats.css)

Une seule liste de formats pour tous les outils : `window.LCNDA_FORMATS` (A0 à A6, B5, Lettre / Legal / Tabloïd US, carte postale, carte de visite, carton DL, carrés, livres, album, photos 9×13 à 50×70, écrans 16:9, 4:3, 1:1, 9:16, 4K) et « ✎ Format libre… ».

- La boîte « Format » : `F.boxHtml({value, units: ['mm','cm','px','in'], dpi: true, orientation: true, hint})` puis `F.bindBox(el, {onChange})` → `{get(), set(v)}`. Valeur : `{id, w, h, unit, dpi, orient}` (w × h dans l’unité, déjà dans le sens choisi). `F.inMm(v)`, `F.inPx(v, ppp)`, `F.fromSize(w, h, unité, ppp, unité montrée)`, `F.preset(id, {orient, unit})`, `F.label(v)`.
- Mémoire (`localStorage['genealogie-formats']`) : `F.use(outil, v)` retient le format de l’outil (`F.last(outil)`) et range un format libre dans « ⭐ Mes formats » (12 au plus, en haut de la liste ; « × Retirer de Mes formats » avec ↶). Les formats gardés par la mise en page (`genealogie-layout-formats`) y sont aussi proposés.
- Informations du document : `F.openInfoDialog({value, keys, what})` → `Promise<info|null>` ; champs possibles `title, author, subject, desc, keywords, rights, lang, date (C4), isbn (clé vérifiée, F.isbnOk), people (menu de choix, plusieurs)` ; `F.cleanInfo(v, keys)`.
- Où : 🗺️ « Une nouvelle carte » (heritage-vector-map.js) ; ✒️ Fichier → Format du document / Informations (heritage-vector.js : `doc.unit`, `doc.dpi`, `doc.fmt`, `doc.info` → `<title>`, `<desc>`, `<metadata>` du SVG, `/Title /Author /Subject /Keywords` du PDF) ; 📐 Fichier → Format du document / Informations (heritage-layout.js : `page.size` d’une page à sa taille, `@page` nommées à l’impression, `doc.info` → `<title>`, `<meta>` et `lang` du HTML / PDF, `dc:*` et `urn:isbn` de l’ePub) ; 🎚️ Image → Taille de l’image / Taille de la zone de travail, Fichier → Informations (heritage-studio.js : `st.size`, `st.board`, `st.info` dans l’historique et le projet ; XMP, `pHYs` / densité JFIF dans le PNG / JPG, `ext.rtEmbedMeta`) ; 🖨 « ✎ Autre… » dans la fenêtre Imprimer (app-actions.js).
- Test : `tests/test-formats-documents.js`.

## ✅ Contrôle de la base (lib/controle.php, heritage-controle.js)

Une seule liste d’alertes pour toute l’app (validé, F3). Serveur :

```php
controle_run($pdo, $fresh = false);   // tout le contrôle (sans les exceptions), gardé dans DATA_DIR/cache/controle.json tant que la signature ne bouge pas
controle_state($pdo);                 // ['alerts' => actives (dont « returned » : écartée mais une date a changé), 'exceptions' => …, 'people' => …]
controle_summary($pdo);               // le widget : total, by_sort, by_level, exceptions, pct_ok (fiches sans alerte), top
controle_person($pdo, $id);           // le bandeau de la fiche : les alertes de la fiche, avec « view » écrit de son point de vue
```

Une alerte : `{key, check, sort: dates|ages|parents|doublons|lieux, sub?, level: red|orange|yellow, title, detail, people: [ids], place?, dates: [{label, text, y, j, event_id, person_id}], fix?: {event_id, person_id}, views?: {id: texte}, rule?, checks? (doublons), score?, fp}`.
- **Ajouter un contrôle** : dans `controle_compute`, avec `$add([...])` ; la clé = sorte de contrôle + fiches (`old-parent:12:45`) : un problème = une ligne ; `fp` = empreinte des dates en cause (l’exception revient si elle change) ; un seuil nouveau va dans `CONTROLE_SEUILS` (valeur, min, max, pas) et dans la page des seuils (`SEUILS` de heritage-controle.js) ; monter `CONTROLE_VERSION`.
- **Ouvrir la page filtrée** depuis un autre outil : `LCNDA_EXT.openControle({sort: 'ages', level: 'red', sub: 'journeys'})`.
- Écarter / remettre : POST `controle_dismiss` `{key, reason, note, watch}`, `controle_undismiss` `{key}` (rend l’exception d’avant pour « ↶ Annuler »). Corriger une date sur place : `controle_fix_date` `{event_id, date_text}`.

## 👶 Transmission des prénoms et 📊 Ta famille et l’histoire de France (lib/prenoms_france.php, heritage-prenoms-france.js, prenoms-france.css)

Deux statistiques de Graphiques → Statistiques, rangées juste après « Moyennes de la famille » (`family_averages`) : `name_transmission` et `family_vs_france` (`ext.graphStats`). Elles complètent l’existant sans le refaire : le diagramme 🎀 « Prénoms transmis » (parrain → filleul, heritage-diagram-cartes2.js) reste, « Prénoms : la famille et la France » (fichier INSEE des prénoms) aussi.
- **Transmission** : GET `prenoms_transmis` (`&person=id` pour une fiche ; sinon toute la base avec les options communes des diagrammes `dg_pop`, `dg_root`, `dg_from`, `dg_to` et `&name=`). Pistes, dans `pf_candidates()` seulement : parrain / marraine (témoins de BIRT, CHR, BAPM dont la note dit « parrain » / « marraine », comme `godnames`), frère ou sœur mort avant la naissance (« prénom relevé »), grands-parents (paternels, maternels), père, mère, oncles et tantes, saint du jour (`saint_matching`, lib/saints.php). Ressemblance des prénoms (`pf_match`) : même prénom usuel, forme masculine / féminine (`pf_variant`), deuxième prénom. Indice sur 100 (forte ≥ 75, moyenne ≥ 55) ; une personne trouvée par deux chemins (parrain et grand-père) se renforce. Une nouvelle sorte de piste s’ajoute là, jamais ailleurs.
- **Corrections** : table `name_origin_choices` (migration 82) ; POST `name_origin_set {child, source, verdict: yes|no|clear|reset, rows}` rend `before` pour « ↶ Annuler » (H7) ; source 0 = le saint du jour. Le calcul ne change rien en base ; rien n’est proposé en mode consultation ni en mode simple.
- **Fiche** : `ext.afterPerson` ajoute la ligne `.pf-line` « 👶 Prénom reçu de… » dans le bloc Identité (après le saint du jour), avec son ⋯ (`UI.menuAt`) et « Choisir la personne… » (`openPicker`, menu de choix unique).
- **Ta famille et la France** : GET `famille_france` (mêmes options `dg_*`). Les repères sont dans **`assets/data/moyennes-france.json`** : chaque ligne a `label` (l’époque affichée), `from` / `to` (les années comparées de la famille), des fourchettes `h`, `f` ou `all` et une `source` décrite dans `sources`. Règle : un chiffre français n’entre dans ce fichier qu’avec sa source et s’il est sûr ; sinon il n’y est pas (une case vide plutôt qu’un chiffre inventé). Dessin : le moteur commun (`ext.diagramRender.svg`, type `dumbbell` : la famille / la France ≈) ; clic sur le nombre = `ext.whoDialog` ; export : `graphExportToolbarHtml` (cible `.stats-stage`).
- Jamais une personne en vie, probablement en vie (moins de 100 ans sans décès) ou confidentielle (`pf_people()`), ni comptée ni nommée. Test : `tests/test-prenoms-france.js`.


## 🧾 Tableur et moteur commun des tableaux (app-tableur-engine.js, heritage-tableur.js, tableur.css, lib/workbooks.php)

Listes → 🛠️ Outils de modification → « 🧾 Tableur » : classeurs à plusieurs feuilles, enregistrés dans la table `workbooks` (migration `schema_v50` ; GET `workbooks`, `workbook` ; POST `save_workbook`, `rename_workbook`, `delete_workbook` (rend le classeur, pour « ↶ Annuler »), `duplicate_workbook`). `kind` : `book` ou `template` (« Mes modèles »).

**Le moteur (`window.LCNDA_SHEET`, sans écran, testable dans Node)** — à utiliser pour tout nouveau tableau de l'app :

```js
const S = window.LCNDA_SHEET;
const wb = S.normalize(données);            // forme sûre et bornée : {v, sheets:[{id, name, cells:{A1:{v, s, ref, note}}, cols, rows, merges, freeze, cf, dv, filter}], styles, names}
const calc = new S.Calc(wb);                // calcule tout ; calc.val(feuille, ligne, colonne) ; calc.isApprox(…) (≈)
wb.sheets[0].cells.B4 = {v: '=SOMME(B2:B3)'}; calc.setCellChanged(0, [[3, 1]]);   // recalcule seulement ce qui en dépend
S.formatValue(v, wb.styles[cell.s], {approx}); S.explain(erreur);                  // affichage ; erreur expliquée en français
S.parseInput('12,5 %') ; S.readActDate('3 frimaire an XII') ; S.shiftFormula('=A1+$B$1', 1, 0) ; S.toEnglish('=SOMME(A1;2,5)')
S.parseCSV(texte) ; S.sniffSep(texte) ; S.decodeBytes(octets) ; S.toCSV(lignes, {sep: ';', bom: true}) ; S.parseClipboard(texte, html)
await S.toXlsx(wb, calc) ; await S.fromXlsx(arrayBuffer) ; await S.toOds(wb, calc) ; await S.fromOds(arrayBuffer) ; S.fromJson(texte) ; await S.readFile(nom, arrayBuffer)
S.zipStore([{name, data}]) ; await S.makeZip([{name, data, store}], type) ; await S.unzip(arrayBuffer)   // le seul fabricant de ZIP de l'app
S.matrix(wb, calc, feuille, plage) ; S.rowsToCells(lignes) ; S.compact(wb) (pour enregistrer)
```

- Cellule : `v` = ce qu'on a tapé (nombre, VRAI/FAUX, texte ; « = » formule ; « ' » texte forcé), `s` = n° de style dans `wb.styles` (`S.styleId(wb, {b, i, color, fill, fmt, dec, h, wrap, bd…})`), `ref` = `{kind: 'person'|'place', id}` (choisi avec le menu de choix), `note`.
- Formats : `num`, `int`, `pct`, `eur`, `date`, `actdate`, `text`. Couleurs filtrées (`safeCol`) ; un fichier importé ne peut rien glisser dans un style.
- Sûreté : pas d'eval ni de Function ; formule ≤ 8 192 caractères, profondeur ≤ 100 ; 2 millions de cellules ; fichiers ≤ 60 Mo ; ZIP : tailles annoncées et réelles bornées (bombe zip), éléments chiffrés refusés ; XML lu par un petit lecteur maison qui refuse DOCTYPE et ENTITY (pas d'entité externe) ; CSV exportés protégés (`csvSafe`, même règle que `A().csvSafe`).
- XLSX et ODS gardent aussi (écrits et relus) : notes (`comments` + VML / `office:annotation`), validation liste et nombre (`dataValidation` / `content-validation`), filtre (`autoFilter` / `database-range`), volets (`pane` / `settings.xml`), noms (`definedName` / `named-range`, et les formules qui les utilisent), mise en forme conditionnelle (XLSX : `cfRule` + `dxfs`) ; `VRAI()` / `FAUX()` (écrits par LibreOffice) sont des fonctions ; DATEDIF « A/J/AM/MJ/AJ » part en « Y/D/YM/MD/YD ». Formule anglaise avec des virgules reconnue (`formulaMode` : noms anglais, `DATE(1925,5,7)`, nombre de morceaux de la fonction). Test complet (toutes les fonctions recalculées par LibreOffice, vrais fichiers openpyxl / python-docx / pandoc) : `tests/test-word-excel-complet.js`.
- Fonctions : `S.FN[nom] = {fam, sig, desc, en, f}` ; `S.fnKey('SUM')` → « SOMME ». Ajouter une fonction : `def(…)` dans le moteur (famille, signature, phrase, nom anglais ou '' si elle n'existe pas ailleurs — elle part alors en valeur dans un XLSX).

**L'éditeur** : `ext.openWorkbook({id})` ou `ext.openWorkbook({data, name, onSaved, onClose})` (aussi `ext.openSheetEditor`). E1 (menus `data-xl-cmd`, réglables dans les raccourcis : `heritage-editorkeys.js`, outil `sheet`), barre d'outils et panneau rangés par ⚙️ Personnaliser (`data-tbg="xl-tools"`, `"xl-panel"`) avec « 💾 Réglages enregistrés », grille virtuelle (calques collants pour les volets figés), H10 pour filtrer, K13 import / impression, E3 export, H7 pour défaire. Modèles : `ext.sheetTemplates`. Réglages : `localStorage['genealogie-tableur']`. Test : `tests/test-tableur-moteur.js`, `tests/test-tableur.js`.

**Règles communes des éditeurs** (test : `tests/test-tableur-harmo.js`) : K18 `UI.editorStatus` en bas (à gauche `[data-xl-status]` = « Feuille ! case » + somme, moyenne… choisies par un clic ou dans les réglages ; au milieu l’aide de la grille ou de la frappe ; à droite le zoom commun) — le zoom est un `zoom` CSS sur `.xl-vpwrap` (`ed.setZoom(k)`, `ed.zoomFit()` = les colonnes remplies dans la largeur, retenu dans `prefs.zoom`) ; tout calcul souris → grille divise par `ed.zq()` (pixels de l’écran par pixel de la grille). L’aide pendant la frappe (`.xl-help`) se pose sur le haut de la grille sans la faire bouger, cachée quand il n’y a rien à dire. K19 : colonne `.xl-rail` (`UI.editorRail`, commandes `data-xl-cmd`, l’actif en bleu : ⚲ Filtrer, = Formules, ◫ Panneau) ; « 💾 Enregistrer ▾ » (`UI.saveMenu` : copie, modèle, export). E5 : « Police » → `UI.openFontPicker` (`style.font`, `style.fs` 6–72 px, gardés en XLSX). K2 : « ⚙️ Réglages du tableur » par `UI.autoSaveDialog` (interrupteurs K16, « Fermer » seul, ↺).

**Vague 2 — l'éditeur commun des données** (`heritage-tableur-cibles.js`, maquette écrans G et I) :

```js
ext.sheetTargets.diagram = {icon, label, hint, createLabel, columns(opts) → [{k, label, type: 'text'|'number'|'color'|'select', many, max, optional, choices, alias}],
    build(objets, opts, tableau, statut) → données, fromData(données) → {sheets: [{name, header, rows, widths, hidden, refs, merges, fills, typed}]},
    back(éditeur, données) → données, fromRange(éditeur, plage), preview(données) → HTML, create(données, {name, editor})};   // diagram, graph, board, recueil, keynote
ext.openSheetEditor({target: 'diagram', data: spec, name, onSave: nouvelles => …});   // le tableur préparé + « ✓ Enregistrer et revenir » (ctx.back)
ext.openSheetEditor({id, select: {sheet, range}, onSave});                               // un classeur rangé, ouvert sur une plage
ext.openRowsInSheet({name, rows | csv}); ext.sheetExportFormat(getRows, nom);            // « ⤓ Exporter ▾ → 🧾 Ouvrir dans le tableur » (E3 : format « 🧾 Tableur »)
ext.chooseSheetRange({title, link}) → {mode: 'copy'|'link', cells, link};               // « 🧾 Prendre un classeur du Tableur » (menu de choix, sorte workbook)
ext.sheetLink.resolve(spec)                                                              // spec.live.sheet = {wb, sh, name, sheet, range, grow, head} : relu à l'affichage
```

- **Le tableur ne connaît pas les endroits** : il lit `ext.sheetTargets`. Un nouvel endroit déclare ses colonnes ; « 🎯 Préparer pour… » (menu Données) le propose tout seul : colonnes reconnues par leur titre puis par la sorte des valeurs (✓), cases à vérifier (⚠️ « C7 contient « env. 12 » : compté comme 12 » + « Voir la cellule »), aperçu, création. Les colonnes « many » (séries) prennent toutes les colonnes de chiffres qui restent.
- **Crochets dans heritage-tableur.js** (à réutiliser plutôt que de modifier les menus) : `ext.sheetMenuExtra.push({menu: 'Données', cmd, label, key})`, `ext.sheetCommands[cmd] = (éditeur, arg, bouton) => …`, `ext.sheetChartMenu`, `ctx.back = {label, html, save(éditeur)}` (bandeau + « ✓ Enregistrer et revenir », rien n'est rangé dans le Tableur sauf « Enregistrer une copie… »), `ctx.select`, et l'évènement `lcnda:workbook-saved` ({id}) après chaque enregistrement.
- **Où** : Diagrammes (onglet Données : « 🧾 Modifier les données », « 🧾 Prendre un classeur du Tableur », plage liée avec le bandeau `🔗 Données : « Classeur » ! A1:C4 · tenu à jour`, grille C6 « Voir les N suivantes ↓ / Tout voir » au-delà de 400 lignes), Éditeur de graphiques (`data-fr-sheet`), Présentation (inspecteur Tableau / Graphique, `runX('sheet')` ; la zone « ; » reste en secours ; `ext.keynoteWithObject(o, nom)`), Tableaux (`data-bd-tbl="sheet"` ; `tableValues` calcule déjà sur `LCNDA_SHEET`), Recueils (`data-rt-sheet` ; une colonne « 👤 Fiche » et une clé cachée `_ligne` gardent les lignes reliées), Listes (`heritage-columns.js` : « ⤓ Exporter ▾ » à côté de « ⚙️ Colonnes », les colonnes et lignes affichées), statistiques et liste d'artistes (format E3 `sheet`).
- **Lecteurs communs** : `parseTable` (diagrammes, ADN), `parseCells` (graphiques), `parseCsv` (recueils, inventaire d'artistes) passent par `S.parseCSV` / `S.sniffSep` (mêmes bornes qu'avant) ; les fichiers par `S.decodeBytes` (accents Windows-1252). Les CSV des recueils, des tableaux et des listes sortent par `S.toCSV`. Pas touchés (autre chantier) : dépouillements (`parseDelimitedCsv`), recensements, Atelier.
- Test : `tests/test-tableur-donnees.js`.

**Vague 2 — le lien avec la base** (`heritage-tableur-base.js`, `lib/sheet_link.php`, maquette écran E « Lien avec la base — remplir, tenir à jour, envoyer ») :

```text
GET  sheet_sources                       → les sortes (persons, events, census, digest, stats, mylist), leurs colonnes, mes listes, dépouillements, communes recensées
GET  sheet_fill&spec={source, filters, cols, privacy}   → {columns:[{k,label,type}], rows:[{key, cells:{k: v | {v, ref:{kind,id}}}}], total, truncated, hidden, label}
GET  sheet_refs&person=1,2&place=3       → nom d'aujourd'hui des fiches citées dans les cellules, et celles qui n'existent plus (gone)
POST sheet_push {target, rows:[{row, key, f:{last_name, first_name, name, age, birth, birthplace(_id), occupation, household, house, street, position, event_type, event_date, event_place…}}], context:{year, place_id, place_name, digest_id}, decisions:{i: {action: new|link|skip, person_id}}, dry}
POST sheet_push_undo {token}             → supprime exactement ce que l'envoi a créé, défait les liens (table sheet_pushes, migration schema_v58)
```

- **Une seule action de remplissage**, qui réutilise l'existant : les règles de « Mes listes » (`my_list_rows_for`, mêmes filtres que les listes : Sosa, étiquette, lieu de naissance, années, sexe, recherche), « Compter dans ma base » des diagrammes (`diagram_app_count`) pour les statistiques, `census_records`/`census_members`, `archive_digest_people`, `my_list_rows`. Colonnes « tirées des données » : `f:<champ>` (personnes), `e:<champ>` (événements), liste blanche lue dans la table. `privacy=1` (et **toujours** en mode consultation 🔒) : sans les vivants ni les fiches confidentielles (`df_hidden_people`, même règle que l'export pour partager). Une valeur texte qui commence par « = » arrive en texte (`'`), jamais en formule.
- **Tenir à jour** : `sheet.link = {src:{source, filters, privacy}, cols, r0, c0, n, keys, at, label}` (gardé par `S.normalize` / `S.compact` et `workbook_check`, défait par ↶ comme les autres réglages de feuille : `metaOf`). Relu à l'ouverture et avec ↻ (bandeau `.xl-baselink`) ; les cellules hors du bloc sur une ligne du bloc suivent la clé de leur ligne (`p:12`, `e:7`, `c:5`, `d:3`), celles du dessous se décalent (formules décalées). Rien de changé → rien n'est réécrit (le classeur ne devient pas « modifié »).
- **Cellules personne / lieu** : `cell.ref`, validation `person` / `place` posée sur la colonne (le menu de choix unique s'ouvre dans la case). À l'ouverture, `sheet_refs` remet le nom d'aujourd'hui ; une fiche supprimée perd son `ref` (pastille grise « ? »).
- **📤 Envoyer** : 3 étapes (colonnes → champs devinés par leur titre `guessField`, l'année et la commune lues au-dessus du tableau ; « Voilà ce qui va entrer » avec `UI.badge` : Déjà dans la base · Nouvelle fiche · À vérifier (« choisis ▾ » : une des fiches, nouvelle fiche, laisser) · Problème ; « 📤 Créer N fiches et en relier N »). Le serveur refait toute l'analyse (rien n'est cru de la page), écrit dans **une** transaction (`save_person`, `add_event`, `census_records`, `census_members`, couple et enfants du chef pour les nouvelles fiches, `archive_digest_people.person_id` d'un relevé), puis note dans `sheet_pushes` les numéros créés (toutes les lignes au-delà du plus grand numéro d'avant dans persons, events, families, family_children, census_records, census_members, places, change_log) et les liens posés. `A().undoToast` : « ↶ Annuler » → `sheet_push_undo`, « ↷ Rétablir » renvoie le même lot. Une fiche existante n'est jamais modifiée (seulement reliée).
- **Endroits** : modèle « 🏠 Relevé de recensement » (`ext.sheetBase.censusBook(année)` ; `sheet.link = {tpl:'census', year}` ; bandeau Année 1836 → 1936 + Commune ; `censusCols(année)`), Dépouillements (« 🧾 Dans le tableur » dans « Personnes et foyers de la page » : `ext.sheetBase.openFilled({src:{source:'digest', filters:{digest_id, page}}})`), Atelier (élément « Venant du logiciel » `workbook` ; Exporter → « 🧾 Tableau de tous les éléments, dans le tableur »).
- API côté page : `ext.sheetBase = {fillDialog, pushDialog, refresh, relabel, openFilled, censusBook, censusCols, guessField}` ; menu Données par `ext.sheetMenuExtra` / `ext.sheetCommands` (`appfill`, `appsync`, `apppush`). Test : `tests/test-tableur-base.js`.

## 🎧 Studio son et ⚡ Son rapide (heritage-audio-engine.js, heritage-audio-quick.js, heritage-audio-studio.js, heritage-audio-multi.js, lib/audio_studio.php)

Maquette validée : `studio-son.html`. Un seul moteur pour le son et le montage ; deux fenêtres qui montrent les mêmes réglages.

```js
const E = window.LCNDA_EXT.audioEngine;
const buf = await E.load('media/son.wav');                        // AudioBuffer
const fx = E.newFx('denoise', {reduction: 70});                    // un effet du rack : {id, type, on, params, range?}
const out = await E.renderRack(buf, [fx, E.newFx('limit')]);       // le rack rejoué (non destructif)
E.bandEnergy(out, 4000, 8000);  E.lufs(out);  E.detectHum(buf);   // mesures (tests, aperçu)
const blob = await E.encode('mp3', out, {kbps: 192, tags: {title, chapters}});
ext.openSound(media, {onDone});          // l'aiguillage : dernier mode (⚡ / 🎚️) et le design du Son rapide
ext.openAudioStudio(media, {onDone, onSaved, proj, carry});   // carry : {buf, rack, regions, name, edits} = le travail qui arrive
ext.audioExport({title, media, getBuffer, regions, lines, tracks, getTrack, toMedia}); // E3 complété (son)
```

- **Effets** (`E.FX`) : chaque sorte a ses paramètres `[clé, libellé, min, max, pas, unité, départ]` (le panneau E2 dessine les curseurs C3 tout seul), `render(buf, params)`, et `lengthChange` si elle change la durée. Pour en ajouter une : une entrée dans `FX`, un test qui **mesure** son effet (`tests/test-studio-son.js`).
- **Son rapide ⇄ rack** : `E.quickToRack(q)` et `E.rackToQuick(rack)` → `{q, extras}` ; `extras` = ce qui reste appliqué (pastille « N réglages du Studio restent appliqués »).
- **Réglage** : `genealogie-audio-quick-design` = `'new'` (rien = « Comme avant ») ; `genealogie-audio-mode` = dernier choix ; `genealogie-audio-fx-presets` = 💾 Réglages enregistrés partagés.
- **Base** : `audio_regions` (zones et marqueurs d’**un fichier précis** : media + filename), `audio_region_links` (personne, événement, rôle), `audio_transcripts` ; `audio_projects.data_json` garde rack, zones, multipiste, transcription. API : `audio_regions`, `save_audio_regions`, `person_audio_regions`, `audio_transcript`, `save_audio_transcript`, `audio_transcript_search`. Bloc de fiche : `heard` (« 🎧 On l’entend »).
- **Menu de choix** : la sorte `event` (📅 événements) a été ajoutée pour relier un passage à un événement.
- **Export** : `UI.openExportDialog` accepte maintenant `fields` (menus Qualité, Quoi, Canaux, Fréquence…, avec `show(format)`), `checks` et `onPick` ; un format peut avoir `copy: false` et `goLabel`.

## 📝 Traitement de texte et moteur commun des documents (app-texte-engine.js, app-texte-formats.js, heritage-traitement-texte*.js, traitement-texte.css, lib/textdocs.php)

Listes → 🛠️ Outils de modification → « 📝 Traitement de texte » : documents enregistrés dans `text_documents` (migration `schema_v57` ; `kind` : `doc` ou `template` pour « Mes modèles ») et leurs versions dans `text_document_versions` (200 au plus par document). API — GET : `textdocs`, `textdoc`, `textdoc_versions`, `textdoc_version`, `textdoc_people` (personnes pour le récit), `textdoc_tree` (petit arbre) ; POST : `save_textdoc` (`rev` : un enregistrement fait ailleurs entre-temps → conflit, la personne choisit), `rename_textdoc`, `delete_textdoc` (rend le document et ses versions, pour « ↶ Annuler »), `restore_textdoc`, `duplicate_textdoc`, `save_textdoc_version`, `delete_textdoc_version`, `restore_textdoc_version`, `textdoc_to_media` (copie .docx / .odt + vignette rangée dans les médias). Menu de choix : sortes `textdoc` (📝) et `workbook` (🧾).

**Le moteur (`window.LCNDA_TEXT`, sans écran, testable dans Node)** — à utiliser pour tout texte mis en forme qui entre ou sort de l’app :

```js
const T = window.LCNDA_TEXT;
const doc = T.newDoc({title});                // {v, title, meta, lang, set, page:{w,h,orient,m:{t,r,b,l},bg,wm}, header, footer, styles, comments, notes,
                                              //  sections:[{page?, blocks:[{t:'p', st, lvl, list, align, runs:[{text, b, i, u, s, sup, sub, font, size, color, bg, href, note, field, tc, cm}]}, {t:'table'}, {t:'img'}, {t:'pb'}, {t:'toc'}, {t:'index'}, {t:'bib'}…]}]}
T.htmlOf(section) ; T.blocksHtml(blocks) ; T.blockText(bloc) ; T.wordCount(doc) ; T.stylesCss(doc) ; T.styleSet('classique')
await T.toDocx(doc) ; await T.fromDocx(arrayBuffer) ; await T.toOdt(doc) ; await T.fromOdt(arrayBuffer)   // → Blob ; ← {doc, notices}
T.toRtf(doc) ; T.fromRtf(texte) ; T.toMarkdown(doc) ; T.fromMarkdown(texte) ; T.toText(doc) ; T.fromText(texte)
await T.readFile(nom, arrayBuffer)            // devine le format ; refuse .doc, PDF, classeur, fichier > 60 Mo
```

- .docx / .odt écrits et relus par nous (ZIP de `LCNDA_SHEET`) : styles (noms de Word en français et en anglais compris), listes à niveaux, tableaux, images en ligne ou ancrées, notes de bas de page et de fin, en-têtes et pieds (première page à part), sections et colonnes, lettrine, liens, signets des personnes, commentaires, suivi des modifications, sommaire / index / bibliographie (champs que Word met à jour). Vérifiés avec LibreOffice, pandoc et python-docx.
- Sûreté : XML sans DOCTYPE ni ENTITY, ZIP bornés (bombe zip), couleurs et polices filtrées (`col`, `fontOk`), liens limités à http(s), mailto et aux ancres du document.

**L’éditeur** : `ext.openTextDoc({id})` ou `ext.openTextDoc({data, name, onSaved, onClose})` ; l’éditeur au premier plan : `ext.textDocKit.current` (les ouverts : `ext.textDocKit.open`). Une `section.wp-sec` par section : feuilles dessinées derrière (`.wp-sheet`, en-tête, pied, notes de la page, filigrane) et une seule zone `contenteditable` (`.wp-body`) ; la mise en pages pousse un bloc qui ne tient pas (`data-wp-push`, `--wp-push`) ; les notes de bas de page sont gardées en bas de leur page. ↶ ↷ : un instantané par étape, les paragraphes qui ne changent pas sont partagés (pas de limite). Commandes : `ed.run('nom')` (les mêmes que `data-wp-cmd` dans les menus et `heritage-editorkeys.js`, outil `textdoc`) ; outils ajoutés dans `ext.textDocTools` (insertions, panneaux, modèles `TEMPLATES`, `writeAbout(personne)`, `reportFromJournal`, `reportFromVisit`, `toLayout`).
- HTML qui entre (collage Word / Google Docs / web, import, données enregistrées) : toujours `ext.textDocKit.cleanHtml` (liste blanche de balises, classes `wp-*` connues, styles filtrés) ; côté serveur `textdoc_defuse` et `textdoc_check` (taille, nombre de sections, résumé pour la vignette).
- Impression et PDF : `ed.pagedHtml()` (chaque page comme à l’écran) → `UI.printDocument` / fenêtre E3 ; page web à part : `ed.htmlFile()`.
- Réglages : `localStorage['genealogie-traitement-texte']` par `UI.autoSaveDialog` (K2) + « 💾 Réglages enregistrés » (`UI.presetsFrame`) ; barre et panneau rangés par ⚙️ Personnaliser.
- Mode sombre : la feuille reste du papier blanc ; ses règles sombres sont écrites à la main dans `traitement-texte.css` pour que `build-dark-css.py` n’y touche pas.
- RTF : vraies listes (`\pn` + `\pntext`), fusions en hauteur (`\clvmgf` / `\clvmrg`), accents `\uN\'xx` ; à la lecture : feuille de styles (titres), `\listtext`, en-tête / pied, commentaires, notes `{\*\footnote}`, `\info`. Listes : `toggleList` (sans `execCommand`) ; les tableaux gardent le curseur après tri / en-tête ; ❓ Aide des éditeurs : `ext.faqPopup(question)` (heritage-more.js).
- Pas encore fait : couper un paragraphe entre deux pages (il passe entier à la page suivante), colonnes sur toute la page (ce sont des passages en colonnes équilibrées), filigrane dans le .docx / .odt, mise en forme dans le texte des notes.
- Test : `tests/test-traitement-texte.js` (moteur, API, navigateur ; `TEXTE_SHOTS=dossier` pour les captures).

## 🌀 Labyrinthe (app-labyrinthe-core.js, app-labyrinthe.js, labyrinthe.css)

Un 6e jeu de l’outil « Jeu », branché dans `app-jeu.js` comme le puzzle (même colonne de parties en cours, même titre de page).
- **Le moteur** `window.LCNDA_LABY_CORE` (aussi `require()` dans Node) : `rng(graine)` (même graine = même labyrinthe), formes
  `square`, `hex`, `round` (anneaux), silhouettes `heart`, `tree`, `france`, `star` — chaque forme donne un graphe de cases
  `{id, cx, cy, sides: [{nb, pts}], poly}` ; algorithmes `backtracker` (longs couloirs), `prim` (impasses), `kruskal` (équilibré),
  `wilson` (au hasard) ; `loops` (0–30 % d’impasses ouvertes) ; `ends` (`coins`, `loin`, `centre`, `hasard`) ; `solve`, `route`,
  `greedyOrder`, `placeStages` (au fond des impasses, bien réparties) ; `toSvg(maze, {style, wall, floor, path, thick, solution,
  stages, pawns})` — un seul chemin SVG pour tous les murs, des portes au départ et à l’arrivée.
- **L’écran** `window.LCNDA_LABY` : `owns`, `renderSetup`, `render`, `sidebarHtml`, `bindSidebar`, `stop`, `gameCount`, `debug()`.
  Préparation : C3 (`UI.rangeField`), C2 (`UI.colorField`, « Aucune » = couleur du style), menu de choix unique pour une
  personne de départ ou des personnes choisies, `UI.presetsFrame` (outil `labyrinthe` dans les 💾 Réglages enregistrés) et
  4 Ensembles prêts. Partie : flèches / ZQSD (course : + IJKL, pavé numérique), glisser au doigt, Espace = pause, H = indice,
  solution, brouillard (masque SVG), traces ; 🖨 `UI.openPrintDialog` (labyrinthe + étapes + solution), ⤓ Exporter ▾ (PNG, SVG).
- **Les étapes** sont lues, sans rien écrire, dans `mode_simple_data` (personnes, unions, photos) et `houses` ; jamais une
  personne vivante ni une fiche confidentielle (ni un lieu, un événement ou une photo qui en dépend).
- **Mémoire** : les parties (au plus 10) dans ce navigateur (`lcnda-laby-games-v1`), les derniers réglages (`lcnda-laby-prefs-v1`) ;
  aucune écriture en base pendant une partie. Test : `tests/test-labyrinthe.js`.

## 🎲 Jeux de la famille : Qui est-ce ?, Memory, La bonne date, Morpion (app-jeu-famille*.js, app-jeu-*.js, jeux-famille.css)

Quatre jeux de plus dans la page **Jeu**, choisis dans « Jeu ▾ » comme le jeu de l'oie, le puzzle et le labyrinthe ; même colonne de gauche (parties en cours), même allure noir et blanc.

- **Le cœur commun** : `assets/js/app-jeu-famille.js` → `window.LCNDA_JEUX_FAMILLE` (même API que `LCNDA_LABY` : `owns`, `renderSetup(ws, ctx, clé)`, `render`, `sidebarHtml`, `bindSidebar`, `stop`, + `register(def)`, `KEYS`, `loadData`). Il dessine la préparation (nom, « Les personnes du jeu » : Sosa / une génération / les ancêtres d'une personne avec le menu de choix / toute la généalogie, joueurs avec couleur C2, ✨ Ensembles prêts, 💾 Réglages enregistrés `UI.presetsFrame`) et l'en-tête des parties (↻ Rejouer, ＋ Nouvelle partie, 🗑 Supprimer). Un jeu s'inscrit avec `register({key, icon, label, short, desc, scope, players: {min, max, def}, defaults, clean, ready, fieldsHtml, bindFields, onSeg, onChange, playerFields, start, mount})`.
- **La logique sans écran** : `assets/js/app-jeu-famille-logique.js` → `window.LCNDA_JEUX_LOGIQUE` (aussi `require()` dans Node) : `pool` (personnes, jamais les vivants ni les fiches confidentielles), `quizQuestions` / `quizAnswer` / `quizRemaining`, `memoryDeck`, `timelineEvents` / `timelineDeck` / `timelineFits` / `timelinePlace` (dates C4, « ≈ »), `morpionLine` / `morpionMoves` / `morpionDrop` / `morpionGrow` / `morpionAI`, hasard à graine `rng`.
- **Données** : une seule lecture GET `mode_simple_data` (lib/mode_simple.php) ; rien n'est écrit dans la base. Les parties et les derniers réglages sont dans ce navigateur (`lcnda-jeux-famille-v1`, `lcnda-jeux-famille-prefs-v1`, pas recopiés dans la base) ; les 💾 réglages enregistrés sont dans `genealogie-jeux-famille-presets` (ils suivent la sauvegarde). 10 parties au plus.
- **Les jeux** : 🕵️ `app-jeu-quiestce.js` (questions oui / non tirées des données, portraits K7 qui se grisent, seul ou à deux, ancêtre caché tiré au hasard ou choisi par l'autre) ; 🃏 `app-jeu-memory.js` (portrait ↔ nom / village / métier / année, 1 à 4 joueurs, chrono) ; 📅 `app-jeu-timeline.js` (frise, glisser ou clavier, vies, écart minimum, dates de l'histoire facultatives) ; ❌ `app-jeu-morpion.js` (3×3 à 19×19, N à la suite, gravité, diagonales, grille qui s'agrandit, symbole émoji / lettre / portrait, ordinateur simple / moyen, scores de la soirée, ↶).
- Branchement dans `app-jeu.js` : `FAM_KEYS`, `fam()`, `famCtx()`, `variantOn()` (un seul filtre des jeux présents pour « Jeu ▾ »).
- Test : `tests/test-jeux-famille.js` (logique dans Node + une partie de chaque dans le navigateur, aucun POST des jeux, 390 px, sombre).

### 🂡 Jeux de cartes à plusieurs (app-jeu-cartes-regles.js, app-jeu-cartes.js, jeux-cartes.css)

- **Moteur sans écran** : `assets/js/app-jeu-cartes-regles.js` → `window.LCNDA_CARTES` (aussi `require()` dans Node, avec `app-jeu-patience-regles.js` pour le hasard à graine) : `GAMES` (Bataille, Huit américain, Dame de pique, Président, Belote, Tarot à 4, Rami gin, Crapette ; règles françaises en clair dans `rules`), `create(k, {n, levels, seed, names})`, `legal(st)`, `play(st, action)` → `{ok, msg}` (le message dit pourquoi un coup est refusé), `ai(st)` (toujours un coup de `legal`, niveau facile / moyen / difficile par joueur), `hint`, `next` (manche suivante). Le joueur 0 est la personne (en bas, Sud).
- **Écran** : `app-jeu-cartes.js` s'inscrit dans `LCNDA_JEUX_FAMILLE` (clé `cartes`) et pose la barre commune des jeux (`LCNDA_JEUX_PLATEAU.shell` : qui joue · scores · chrono · ↶ · 💡 · ⏸ · ? · ⋯), ses records (`records.add('cartes', jeu, …)`) et le choix « Qui joue » par joueur (`levelSelect`). Le nombre de joueurs suit le jeu (`fitPlayers`), une seule personne à la table. Les cartes sont celles des patiences (`.pc-card` de `jeux-patience.css`) ; les figures portent les portraits des ancêtres (`pickFaces`, personnes de `pool` : jamais un vivant ni une fiche confidentielle). Clavier : ← → dans la main, Entrée, Échap, ⌘Z, H.
- **Patiences** : 23 de plus dans `app-jeu-patience-regles.js` (131 en tout), dont 4 mécaniques à part (`MODES.montana`, `MODES.nestor`, `MODES.allinarow`, `sum` avec `same`) ; `nostock` cache le bouton de pioche, `stockLabel` le renomme.
- Test : `tests/test-jeux-cartes.js` (parties entières à tous les niveaux, règles une par une, une donne gagnante connue rejouée pour chaque nouvelle patience — `tests/fixtures/patiences-gagnees.json` —, navigateur à 1440 et 390 px, sombre, aucun POST).

## 🏠 Maison : vides, mezzanines, garde-corps et trémies d'escalier (heritage-house-vides.js)

Une seule géométrie, `assets/js/heritage-house-vides.js` → `LCNDA_EXT.houseVoids` (aussi `require()` dans Node), pour le plan 2D, la 3D et la visite :
- **Vide** : une pièce avec `void: true` (outil ▨ « Vide », touche O, ou « Pas de plancher : vide sur l'étage du dessous » dans Propriétés). Plan : hachures « VIDE » + « vide sur séjour » ; l'étage du dessous montre « double hauteur » en pointillés. 3D : `holesOf(H, f)` perce le sol (et le plafond de l'étage du dessous) avec des trous rognés à chaque pièce (`holesForRoom`).
- **Garde-corps** : `railsOf(H, f)` le long des bords d'un vide qui ne touchent pas un mur (`alongWall`), coupé à l'arrivée d'un escalier (`arrivalGap`), et sur 3 côtés d'une trémie ; `rail` = bois, metal, verre, muret, none ; `railH` (cm, 100). Aussi l'objet « Garde-corps, rampe » à poser à la main.
- **Escaliers** : `isStair`/`stairShape` ; `open: true` (posé d'office sur un nouvel escalier, « Ouvrir les trémies de tous les escaliers » pour les anciens) perce le plancher du dessus ; le haut de l'escalier = le côté −d/2 de l'objet (la flèche) ; hauteur `stairH` = étage + `H.slab` sauf `hFix` ; `blondel()` (marches, hauteur, giron, 2h+g) ; `turn: 'r'` pour le quart tournant à droite.
- **Visite** : `blockersOf(H, f)` arrête la marche au bord des vides (même sans garde-corps) ; en montant on arrive à `stairTop(it, 35)`.
- **🏗 Mezzanine ouverte** (Propriétés d'une pièce) : étage du dessus (créé avec les murs de la pièce s'il manque), mezzanine ~45 %, vide sur le reste, garde-corps, escalier droit qui arrive au bord.
- Test : `tests/test-maison-vides.js`.

## 📊 Diagrammes D23–D38 et le menu « Graphique » (heritage-diagram-vie.js, lib/diagram_vie.php, heritage-diagram-options.js, lib/diagram_appcount.php)

- **Les 12 sortes** (`ext.diagramVie.KINDS`) s'ajoutent au catalogue commun `ext.diagramRender.KINDS` : `vieenfants`, `viefratries`, `viesaisons` (Vie et mort) ; `vieveuvage`, `viedurees`, `vieparents`, `vieavant`, `vieecart` (Couples et familles) ; `vieberceau` (Lieux) ; `viesigner`, `viepreuves`, `vieregistres` (Ma recherche). Dessins faits avec les formes communes (colonnes, barres couchées, pyramide, nuage de points, grille) ; données modifiables (onglet Données), exemple dans la galerie. D24, D32, D33, D38 existaient déjà : `crises`, `surnametree`, `chord`, `network`.
- **Données** : GET `diagram_vie` (`what` = infant, siblings, seasons, widow, duration, parentage, prenup, agegap, cradle, sign, proof, registers). Elles passent par `dmo_lives` (sans les vivants ni les fiches confidentielles) et `dfa_scope` → `dgo_restrict` : le groupe de personnes et la période communs (`dg_*`) s'appliquent tout seuls. Chaque barre garde les personnes (`ids…`) : clic → `data-dfa-pids` → la liste des personnes.
- **Savoir signer** : migration 59 (`events.signed1`, `events.signed2`, `event_witnesses.signed` ; 1 = a signé, 0 = ne sait pas signer, vide = on ne sait pas), réglés dans « Modifier un événement ».
- **« Graphique » → « 🧮 Compter dans ma base »** (`ext.diagramAppOpts`) :
  - `PRESETS` = `[id, nom, réglage, rubrique, forme]`, rangés par rubrique (Personnes, Couples, Enfants, Lieux, Métiers, Dates, Ma recherche, Médias). La forme (`cat`, `few`, `time`, `month`, `age`, `sex2`) et `FITS[type]` disent ce qui a un sens : le reste est grisé « pas pour ce diagramme » (`O.fits(type, forme)`). Un nouveau point de départ s'ajoute là, avec sa forme ; un nouveau type de diagramme à une série se règle dans `FITS` (absent = tout accepté). Les anciens identifiants ne changent pas.
  - « ✏️ Sur mesure » : bloc « Seulement les personnes… » avec « ＋ Critère » — **les critères de Mes listes** (`ext.listRuleRowHtml`, `ext.ruleOptionsHtml('pe')`), jamais un second moteur ; côté serveur `dac_rule_ids` → `my_list_rows_for`. `q.rules` (30 au plus) et `q.match` (`all` / `any`) partent en `rules` (JSON) + `match`. Sans critère, rien n'est envoyé de plus : les anciens réglages se relisent pareil.
  - Regroupements en plus : âge au mariage, âge au premier enfant (par 5 ans), nombre d'unions, branche, vivant ou non, avec ou sans source ; valeur `age_first_child` pour la moyenne et la médiane.
  - La phrase (`O.summary(q, {…, found})`) relit les critères en clair (`O.ruleText`) et dit « N personnes trouvées » (réponse `people` du serveur, relue 0,45 s après chaque changement). Le réglage en cours est gardé quand on change d'onglet.
  - `O.toSpec` reporte `ids` (une série) ou `ids0`, `ids1`… (plusieurs séries) : colonnes, barres, courbes et camemberts les rendent cliquables (`pidAttr`, heritage-diagrams-render.js).
- Test : `tests/test-diagrammes-d23-d38.js` (fixture `tests/fixtures/diagram-vie-seed.php` : bûcheron + 3 enfants + né à Pernay = 2 personnes).

## 📊 Douze diagrammes de plus (heritage-diagram-plus.js, app-diagram-plus-core.js, lib/diagram_plus.php)

- **Les sortes** (`ext.diagramPlus.KINDS`, ajoutées à `ext.diagramRender.KINDS`, donc au catalogue ⚙️ et à la galerie) : `dplkin` 🔗 chemin de parenté, `dplcomp` 🧩 complétude, `dplahn` 📜 tableau d'ascendance (Généalogie) ; `dplgrav` 🎯 centre de gravité, `dplgenmap` 🌈 carte des générations (Cartes, mêmes fonds et cadrage que `heritage-diagram-cartes.js` : `GC.drawBase`, `GC.needBases`, `resolve`, `afterDraw`) ; `dplleeds` 🧬 matrice de Leeds (ADN) ; `dplwheel` 🎡 roue de l'année (Frises) ; `dplbarline` 📊 barres + courbe à deux axes, `dpldiv` ↔️ barres divergentes, `dplhills` 🏔 collines empilées, `dplpar` 🧵 coordonnées parallèles, `dplstep` 📶 courbe en escalier (Chiffres). `dplbarline`, `dpldiv`, `dplstep`, `dplhills` sont aussi dans l'Éditeur de graphiques (`PAIR_KINDS`, heritage-diagram-kinds.js).
- **Existait déjà, pas refait** : « 🏔️ Vagues » (`ridgeline`, une répartition de valeurs) — les collines empilées dessinent des chiffres déjà comptés par période ; l'implexe (`faimplexe`) — la complétude le complète (part connue, éventail case par case).
- **Calculs purs** (`window.LCNDA_DIAGPLUS`, aussi `require()` dans Node) : `kinPath` (Dijkstra : monter/descendre = 1, alliance = 3, « redescendre puis remonter » = +4, deux alliances de suite interdites), `kinWord` (mêmes mots que `qm_kin_label` de lib/question_more.php : « issu de germains », « à la mode de Bretagne », « demi- »), `kinSentence` / `kinWords` (beau-père, gendre, belle-sœur…), `kinAll` (implexe : un lien par ancêtre commun le plus proche, regroupé par (i, j)), `completeness`, `gravity` (moyenne sur la sphère + écart moyen en km), `leeds` (méthode de Leeds, liens dans les deux sens), `aliveByYear` (décès inconnu : en vie si né il y a < 100 ans, sinon 60 ans après — même règle que « Les vivants de l'arbre »), `dayOfYear`.
- **Données** : GET `diagram_plus` (`what` = kinpath, ancplaces, completeness, ahnentafel, wheel, periods, surnames, alive, parallel), lecture seule, bornée ; le groupe de personnes et la période communs (`dg_*`) passent par `dgo_restrict`. Le chemin de parenté reçoit un petit graphe (ancêtres des deux personnes, de leurs conjoints, sinon un chemin quelconque) et se calcule dans le navigateur. Leeds lit `api.php?action=dna` (correspondances et « correspondances en commun »).
- **Confidentialité** : une fiche confidentielle n'est jamais nommée (« Fiche confidentielle », sans lien) ; « 🔒 Pour partager » (`share=1`) et le mode consultation 🔒 remplacent les vivants par « Personne vivante » (`df_hidden_people`, règle de l'export pour partager) ; la roue de l'année ne garde que le prénom pour une fête ; les coordonnées parallèles ne prennent que des vies finies.
- **⚙️ Personnaliser** (heritage-diagram-perso.js) : `dplbarline` (`axes: {y2: true}`, `o.y2` = la série en courbe, sinon `o.lineSeries`), `dpldiv`, `dplstep`, `dplcomp` (barres) rendent `axis` (lignes de repère) ; `dplbarline`, `dplhills`, `dplstep` rendent `time` (annotations à une date) ; ▶ lecture : `OFF_TIME` (catégories-années : les lignes à venir gardent leur place, `__off`, échelle fixe) pour barres + courbe, divergentes, collines ; `STEP_TIME` (`o.__year` coupe la courbe) pour l'escalier.
- **Clic** : `data-dfa-pid` / `data-dfa-pids` (fiche, ou liste des personnes), comme les diagrammes de famille. **Imprimer** : le tableau d'ascendance passe par la fenêtre L1 (`UI.openPrintDialog`, `ext.diagramPlus.printAhnentafel(spec)`, HTML `ahnentafelHtml`).
- Test : `tests/test-diagrammes-plus.js` (calculs purs, chaque sorte dessinée à 900 / 390 px, textes piégés ; navigateur : galerie, éditeur, « Depuis l'app », clair / sombre, 390 px, exports).

## ⚙️ Diagrammes : « Personnaliser » pour tous (heritage-diagram-perso.js)

`assets/js/heritage-diagram-perso.js` → `ext.diagramPerso` (se charge aussi dans Node), styles `assets/css/heritage-diagram-perso.css`. Onglet « ⚙️ Personnaliser » de l'éditeur (après « Réglages ») : sections repliables (E2, ouvertes retenues dans `genealogie-diagram-perso-open`), chaque changement s'applique tout de suite à l'aperçu (K2) ; « 💾 Enregistrer » du diagramme garde le tout dans `spec.o`. **Une section n'apparaît que si elle a un sens** pour ce diagramme.
- **Branchement sur le dessin commun** (`heritage-diagrams-render.js`, sans toucher aux sortes) : `R.prepare(spec, sorte, W)` (style par défaut, petits multiples), `R.overlay(spec, ctx)` (repères, annotations, année lue ; `ctx = {W, H, fs, pad, top, axis, time}`), `R.styleCss(o, classe)` (coins, quadrillage, limité au dessin par une classe `dgsN`). Police : `o.font` ; palette à soi : `o.colors` (passe devant `o.palette`, qu'un choix de palette dans « Réglages » efface).
- **Pour qu'une sorte (même d'un autre fichier) en profite**, son `render(spec, W, fs)` rend en plus `axis: {dir: 'y'|'x', x0, y0, w, h, lo, hi, log?, unit?, series: [{name, color, values, right?}], totals?}` (lignes de repère) et/ou `time: {x0, y0, w, h, from, to}` ou `{…, points: [[année, x], …]}` (annotations à une date). Dans sa définition : `facet: true` (petits multiples : une série + `o.__lo` / `o.__hi`), `time: {range(spec) → [de, à], at(spec, année) → spec}` (lecture propre), `ownPlayer: true` (elle a déjà sa lecture, comme `alivepyr` et `storymap`), `axes: {log: true, y2: true}`. Colonnes, barres, empilés, courbe et aire le font déjà (`cartesian`) ; frise des membres et frise chronologique rendent `time`.
- **✏️ Annotations** (`o.notes`, 60 au plus) : `arrow` (x1, y1, x2, y2), `text` (x, y), `rect` (x1…y2), `vband` (x1, x2), `hband` (y1, y2), `date` (`date`, `to` facultatif → bande ; posé sur l'axe des dates s'il y en a un). Coordonnées en fraction du dessin (0–1). Sur l'aperçu : glisser (pointeur), poignées `.dgn-h` (invisibles à l'export), double-clic = texte, Suppr / × = retirer + H7 « ↶ Annuler ».
- **🎨 Styles** : `STYLE_KEYS` = colors, font, bg, bgColor, fg, lineW, radius, scale, grid ; 5 prêts (`READY`) ; les miens dans `genealogie-diagram-styles` (`UI.presetsFrame` id `diagram-styles`, export / import par `exportSettingFile('diagram-style')`) ; `o.style` = id du style (« …* » = retouché, `none` = comme avant) ; style par défaut `genealogie-diagram-style-default` (appliqué aux diagrammes sans style à eux). « Appliquer à tous » réécrit chaque diagramme (sauf ceux qui suivent un graphique) avec ↶ Annuler qui remet chacun.
- **▦ Petits multiples** (`o.facet = 'series'`, `o.facetCols`) : colonnes, barres, courbe, aire, empilés, radar (+ `facet: true`) dès 2 séries ; un `<svg>` par série imbriqué, même `__lo` / `__hi`. « Répéter par » sexe / siècle / branche / département / pays / génération recompte avec `diagram_app_count` (`series` accepte maintenant `branch`, `generation`, `county`, `country`, aussi dans « Depuis l'app ») — seulement si le diagramme a `spec.live.q` (« Compter dans ma base », « Tenir à jour »).
- **▶ Lecture dans le temps** (`timeInfo(spec)` → `{years, from, to, at(année)}`) : catégories-années (`__off` sur les colonnes à venir, échelle fixe), lignes datées (début ≤ année, fin arrêtée à l'année, axe fixe `o.from`/`o.to` ou `o.__t0`/`o.__t1`). Barre `.h-dgp-play` : ▶ / ⏸, curseur, vitesse, boucle, « ⤢ Tout », « 🎬 Vidéo » (canevas + MediaRecorder, MP4 sinon WebM ; absent si le navigateur ne sait pas). `o.time = {show, speed, loop, step}` ; `show` la montre aussi sur la page Graphiques et là où le diagramme est posé (`ext.diagramPerso.mount`). « Réduire les animations » (`a11y-calm`, `prefers-reduced-motion`) : une étape par 1,2 s.
- **📏 Lignes de repère** (`o.refs`, 20 au plus) : `mean`, `median` (toutes les séries sauf celle du deuxième axe, ou une seule ; empilés : les totaux ; catégories pas encore lues exclues), `goal`, `value`. `o.log` (valeurs toutes positives, pas d'empilement), `o.y2` = n° de la série dessinée en courbe sur l'axe de droite.
- Test : `tests/test-diagrammes-perso.js`.

## 🏠 Maison : les outils en plus M1 à M14 (heritage-house-plus.js)

`assets/js/heritage-house-plus.js` → `ext.housePlus` (aussi `require()` dans Node, comme `heritage-house-vides.js`). Les calculs sont des fonctions pures ; l'éditeur (`heritage-house.js`) lui passe un `ctx` (`plusCtx()` : `H`, `name`, `houseId`, `commit`, `quiet`, `paint`, `render`, `status`, `view3d()`, `toggle3d`, `planSvg`, `pickTwo` = `twoClicks`, `goto`, `refreshSite`). Boutons : `data-hs-cmd="plus:…"` → `ext.housePlus.cmd(nom, ctx)` ; une commande de l'éditeur peut aussi prendre un argument (`data-hs-cmd="roofit:velux"`, `roofitdel:2`).

- **Données ajoutées** (toutes facultatives ; une maison ancienne s'ouvre comme avant) : `H.roof.gutter`, `H.roof.wings`, `H.roof.items[{id, type: velux|dormer|shed, side: a|b, pos, at, w, h, wing}]` ; `f.attic`, `f.knee` (cm) ; `w.bulge` (flèche d'un mur, cm) ; `rm.people[].role`, `.years` ; `H.cut {a, b}` ; `H.tour[{id, fid, x, z, yaw, pitch, text}]` ; `H.oldPhotos[{id, fid, x, z, yaw, pitch, mid, src, title}]` ; `H.site[{id, name, dx, dy, rot}]` ; `H.meta.foyer`. `cleanHouse` : `role`, `years`, `foyer` sont du texte libre (`H_FREE`) — avant, un rôle avec des accents était vidé à la relecture.
- **M1 Toits** : `roofExtras` (heritage-house3d.js) — gouttières et descentes, Velux posés sur la pente, lucarnes (jacobines) et chiens-assis devant au droit du mur ; `roofWings(f, 20, H)` découpe l'emprise (les pièces de tous les étages) en rectangles (histogramme), la petite aile prolongée jusqu'au faîtage de la grande ; `roofGroup` = un `buildRoof(H, top, {rect, wing})` par aile, même pente : les noues se font par intersection.
- **M2 Combles et murs courbes** : `roofGeom`, `atticOf`, `slopeH`, `heightAt(H, f, p, at)` (passer `at` dans les boucles) ; le toit des combles part de `knee` au droit du mur ; les murs des combles et les murs courbes sont construits en tranches (`chunkWall`), coupées sous la pente (la plus basse des deux faces). Mur courbe = Bézier quadratique (point de contrôle à 2 × la flèche) : `bez`, `wallPts`, `arcLen`, `wallD` (2D `Q`, 3D, coupe). Le sol d'une pièce reste son polygone (il ne suit pas la courbe).
- **M3 Coupe** : `sectionSvg(H, cut, {title})` ; `crossPoly` ; ligne posée par `twoClicks`, dessinée sur le plan (`.h-hs-cutline`) ; impression par `UI.openPrintDialog` (K13), export SVG / PNG.
- **M4 Surfaces** : `roomSurfaces` (grille de 10 cm), `surfaces`, `surfacesWorkbook` → `ext.openSheetEditor({data, name})` (moteur `LCNDA_SHEET`, totaux en `=SOMME`). Combles : `lowZones` hachure le plan, la pastille Carrez sur chaque pièce, la hauteur sous plafond dans la barre du bas.
- **M5** : `versionForYear(H, année)` + curseur `data-hs-plus="year"`.
- **M6** : en visite, `showRoomCard` (heritage-house3d.js) montre les personnes de la pièce (rôle, années, ✦) ; `o3.onPerson` ouvre la fiche (même question qu'un clic sur une pastille).
- **M7** : HUD de la visite « 📍 Arrêt ici » → évènement `h3-tour-add {pose}` ; `playTour`, `stopTour`, `goPose` (glisse), `say` (speechSynthesis, jamais bloquant) ; `tourShots()` → ZIP par `LCNDA_SHEET.makeZip` (une image par arrêt + textes) : le Montage n'a pas d'entrée « images » à lui passer.
- **M8** : « 📷 Photo d'époque ici » → `h3-photo-add {pose}` → `openMediaPicker` ; `showPhoto(i)` (curseur Autrefois ⟷ Aujourd'hui), repères `photoSprite` cliquables.
- **M9** : `refreshSite` (3D : `o3.loadHouse(id)` → `buildFloor` + `roofGroup` décalés) ; plan : contours en pointillés (`siteData`).
- **M10** : existait (soleil, ombres, « ▶ Voir la journée ») ; ajouté « ▶ Voir l'année ».
- **M11** : `shareHtml(H, {name, plans})` — three.js en `<script type="text/plain">` importé par blob, les scripts de la maison en ligne, `stripHouse` (ni habitants, ni souvenirs, ni notes, ni photos, ni recensements), CSP `default-src 'none'`, rien demandé au réseau. `mount(…, {share: true})` cache les boutons qui écrivent.
- **M12** : cadre `house` du mode simple (`CUSTOM_KINDS.house`, `tx.hid`, écran `rHouse`) — `mount(…, {share: true})`, API `orbit`, `zoomBy`, `showFloor`, `floorIndex`, `spin`, `playTour` ; lecture seule (GET `house` seulement).
- **M13** : `checks(H)` → `{level: red|orange|yellow, kind, text, fid, type, id, x, y}` ; clic = `ctx.goto` (étage, sélection, centrage).
- **M14** : existait (plan ancien, calage par deux points et une longueur, redresser, décalquer).
- Test : `tests/test-maison-plus.js` (Node + navigateur, `SHOTS=dossier` pour les captures).

### 🏠 Maison : une autre époque en fantôme

- Le menu calque 👻 (barre des étages et onglet Étage) propose aussi « 🕰 Époque d'avant », « 🕰 Époque d'après » et « 🕰 Choisir une époque… » (les époques de `H.versions`, rangées par `ext.housePlus.verKey`). Réglage dans `H.verGhost` (`'prev'`, `'next'` ou l'id d'une époque) ; il s'ajoute au calque d'étage déjà choisi.
- `ext.housePlus.epochGhost(H)` → `{v, floors, before}` (une époque non montrée garde ses étages dans `v.floors`) ; le plan dessine le même niveau (`level`) avec la même fonction `ghost(…)` que les étages, en sépia `#a8743a`, même transparence `H.ghostOp`. Jamais dans les exports.
- Légende (interrupteur, `H.verLegend`) : `epochDiff(fa, fb, tol = 6)` compare les murs par segments (5 points par mur, parallèles, à 6 cm près) → `added` (trait plein vert) et `gone` (pointillés sépia) ; bandeau `[data-hs-eplegend]` (`data-added`, `data-gone`).
- 3D : interrupteur « 🕰 Autre époque » de la barre (`H.verGhost3d`, époque du calque sinon celle d'avant) → `epochGhost3d` (murs à 10 % d'opacité, arêtes en pointillés) ; jamais pendant la visite.
- Curseur des années (M5) : « 👻 Voir l'époque d'avant en fantôme » met `H.verGhost = 'prev'` ; une époque fixe repasse à `'prev'` quand on glisse l'année. `verGhost` (prev/next) et `verLegend` vont dans les 💾 réglages enregistrés.
- Test : `tests/test-maison-epoques.js`.

### 🏠 Maison : les 5 limites levées (après M1–M14)

- **Mur courbe** : `ext.housePlus.roomOutline(f, rm)` (le côté d'une pièce posé sur un mur courbe suit la Bézier) sert au sol et au plafond 3D, au plan, aux surfaces et à la loi Carrez ; `tangentAt(w, t)` pose portes et fenêtres sur la courbe (`openingSvg`, battant 3D dans `chunkWall`) ; la cote d'un mur courbe = l'arc décalé, « ⌒ longueur d'arc · flèche » ; la coupe découpe le mur en morceaux (fenêtres comprises) ; la visite s'arrête contre la courbe (`buildSegs`), la petite carte la dessine. Le paramètre d'une ouverture (`o.pos`) est le paramètre de la courbe.
- **Toit plat** : les mêmes `H.roof.items` deviennent verrière (`velux`), lanterneau (`shed`) et édicule (`dormer`), réglés par `pos`, `at` (en travers), `w`, `h` (profondeur) ; `roofItemsPlan(H)` donne leur emprise en plan (et celle des lucarnes et fenêtres de toit d'un toit en pente) : la coupe les dessine, avec la dalle et l'acrotère du toit plat.
- **Vidéo de la visite** : `view3d.recordTour({w, h, title, onProgress})` — MediaRecorder sur un canvas qui recopie la vue 3D à chaque image (`rec.frame()` dans la boucle) avec le titre puis les textes en sous-titres ; MP4 si le navigateur sait, sinon WebM (même ordre que le film de la carte). « 🎬 Vidéo de la visite… » (`plus:tourvideo`) : format, titre, « ⤓ Exporter la vidéo en … », « Ranger aussi une copie dans les médias » (`importMediaFile`, `retouch_media`). La voix lue (speechSynthesis) ne peut pas être enregistrée : le texte est en sous-titre.
- **Mode simple** : « 🚶 Se promener dedans » → `walkStep(±0,8 m)`, `walkTurn(±30°)`, `goFloor(±1)`, `floorsAround()`, `stopWalk()` ; `mount(…, {share: true, simple: true})` (pas de capture de la souris) ; gros boutons de 64 px (`.ms-walkpad`), aucune écriture.
- **Personnes d'une pièce** : `pickerField({kind: 'person', allowFree: true, roles: {main: false, roleList: ROOM_ROLES}})` dans `[data-hs-rpk]` ; `rm.people[] = {id, label, role, primary, free?, years?}` — une ancienne personne sans `primary` devient principale, son rôle texte est repris ; les années restent (champ dessous, `data-hs-rpyears`). La carte de la visite met ★ les principales d'abord.
- Test : `tests/test-maison-plus.js` (18 vérifications).

## ⚙️ Traitements par lot (app-lot-engine.js, heritage-lot.js, lib/lots.php)

Listes → 🛠️ Outils de modification → « ⚙️ Traitements par lot » : une sorte d'Automator pour renommer, redimensionner, changer de format… plusieurs fichiers d'un coup. L'onglet liste les recettes gardées (« ＋ Nouveau traitement », et trois ensembles prêts en boutons) ; la fenêtre (`ext.openBatch({recipe, media, files, onDone, onClose})`, K6 galerie 1180) a trois colonnes : **1 · Les fichiers** (médias de la base par `openMediaPicker({multiple: true, types: ['image', 'document', 'audio']})`, ou de l'ordinateur par `UI.dropZone`, E4 ; 500 au plus) · **2 · Les actions** (cartes : ⠿ pour ranger — Alt + ↑ / ↓ passe par heritage-dnd.js grâce à `data-i` —, interrupteur K16 pour éteindre une étape, titre cliquable pour replier, ⧉, × avec « ↶ Annuler ») + « 💾 Recettes enregistrées » (`UI.presetsFrame`) · **3 · Voilà ce qui va se passer** (nom, taille, format avant → après, pastilles K8 de la sortie, notes) avec le résultat : nouvelle version du média, copie dans les médias, ou ⤓ un ZIP. « ▶ Lancer sur N fichiers » (⌘↩) : barre de progression, une ligne ✓ / ⛔ par fichier, puis message H7 (« ↶ Annuler » quand la base a changé).

**Le moteur (`window.LCNDA_BATCH`, sans écran, testable dans Node)** :

```js
const BT = window.LCNDA_BATCH;
BT.ACTIONS            // rename, resize, crop, gray, watermark, format, quality, strip, tags, pdf : {icon, label, kinds, help, def}
BT.cleanRecipe(r)     // {v: 1, cards: [{id, type, on, p}], out: 'version'|'copy'|'zip'} — forme sûre et bornée (clés inconnues, __proto__, nombres, couleurs)
BT.plan(fichiers, recette, {out, avif}) // → {rows: [{i, kind, before, after: {name, base, ext, w, h}, ops, mode, todo, changed, encode, notes, title, gps}], pdf, warnings}
BT.renameBase(fichier, i, p) ; BT.safeName(s) ; BT.uniqueNames(noms) ; BT.fitSize(w, h, p) ; BT.cropBox(w, h, p)
BT.exifInfo(octets)   // {exif, gps, orientation} d'un JPEG ; BT.stripJpeg / BT.stripPng : métadonnées effacées sans perte ; BT.hasMeta
BT.BUILTIN            // ensembles prêts : Photos pour le web, Renommer en séquence, Scans en PDF, Vignettes carrées, Partager sans la position GPS, Documents en Word, Classeurs en CSV
```

- **Ordre** : les retouches d'image (rogner, redimensionner, noir et blanc, filigrane) se font dans l'ordre des cartes ; le format, la qualité, le nom et les étiquettes s'appliquent à la fin (la dernière carte de chaque sorte compte). Une retouche qui ne change rien (« ne pas agrandir » sur une petite image) ne réécrit pas l'image ; un simple renommage ne touche pas au fichier ; « Effacer les métadonnées » seul sur un JPG / PNG est sans perte (sauf orientation Exif ≠ 1 : l'image est alors redessinée droite).
- **Les fichiers** : images par canvas (`createImageBitmap` avec l'orientation, JPG sur fond blanc, poids max : la qualité baisse, puis la taille) ; documents par `LCNDA_TEXT.readFile` → `toDocx` / `toOdt` / `toRtf` / `toMarkdown` / `toText` / page web (`htmlOf`), une page web entrante passe par `textDocKit.cleanHtml` ; classeurs par `LCNDA_SHEET.readFile` → `toXlsx` / `toOds` / `toCSV` (1re feuille, valeurs calculées, cellules protégées) ; sons par `audioEngine.decode` → `encode` (MP3, WAV, FLAC) ; PDF par `vectorInternals.makePdf` (A4 avec marge, ou à la taille de l'image) ; ZIP par `LCNDA_SHEET.makeZip` (noms uniques). Un PDF entrant est en lecture seule (renommé, étiqueté, relié).
- **Serveur** (`lib/lots.php`, pas de table : un journal JSON par lot dans `DATA_DIR/cache/lots/`, 7 jours) : POST `lot_begin {count, name}` → `{token}` ; POST `lot_item` (multipart : `token`, `mode` = `version` | `copy` | `new` | `meta`, `media_id`, `name`, `title`, `label_ids`, `person_id`, `file`) — liste blanche d'extensions vérifiées sur les premiers octets (`LOT_TYPES` : jpg, png, webp, avif, gif, pdf, docx, odt, rtf, md, txt, html, xlsx, ods, csv, mp3, wav, ogg, flac, m4a, aiff), tailles bornées, nom du fichier tiré au hasard ; une version garde l'original dans `media_versions` (libellé « Lot N — date ») et refuse un changement de famille (un PDF ne devient pas la version d'une photo) ; une copie est reliée aux mêmes fiches ; une fiche verrouillée refuse un nouveau lien ; POST `lot_undo {token}` défait tout dans l'ordre inverse (versions, copies, titres, étiquettes, liens ; les fichiers qui ne servent plus partent). Mode consultation : tout est refusé (423).
- **Réglages** : recettes dans `localStorage['genealogie-traitements-lot']` (exportées en `lcnda-reglage-traitements-lot-….json`), dernière chaîne utilisée dans `lcnda-lot-derniere` (cet appareil).
- Test : `tests/test-traitements-lot.js` (moteur, API, navigateur : chaque action avec un vrai fichier, chaîne de 3 actions en version puis ↶, copie, ZIP, CSRF, consultation, 390 px, sombre).

## 🧮 Calculette (app-calculette-engine.js, heritage-calculette.js, calculette.css)

Une petite fenêtre **flottante**, appelable de partout, qui reste ouverte au-dessus de l'app (ce n'est pas un projet : rien n'est rangé dans la base). Entrées : bouton 🧮 de la barre du haut (`#calculette-open`, à côté de « Mes généalogies », masquable dans ⚙️), raccourci `calculator` (⇧⌘Y / Ctrl+Maj+Y, `SHORTCUT_DEFS` d'app.js, contexte `any`, réglable dans Réglages → Raccourcis), widget « Raccourcis » (outil `calculette`), bouton « 🧮 Calculette » de Listes → 🛠️ Outils de modification, et tout élément `[data-calculette-open]`. Jamais en 🧓 mode simple (`html.ms-open`).

```js
ext.calculator.open({expr: '3 toises en m', mode: 'sci'});   // mode : simple | sci | plot
ext.calculator.close(); ext.calculator.toggle(); ext.calculator.isOpen();
ext.calculator.compute('1/3 + 1/6')                         // le même calcul, sans fenêtre (réglages de la calculette)
```

- **Au-dessus d'une fenêtre** : quand une fenêtre modale s'ouvre (`dialog:modal`), la calculette passe **dans** cette fenêtre (sinon elle serait inerte derrière), puis revient sur la page à sa fermeture ; Échap dans la calculette vide la case, puis ferme la calculette — jamais la fenêtre de saisie.
- **Écran** : ruban (historique cliquable : un clic reprend le résultat, ✎ le calcul, 📋 le copie ; « 🗑 Vider » avec ↶ Annuler), écriture jolie du calcul tapé (fractions posées, puissances, racines), résultat en aperçu gris pendant la frappe, Entrée valide ; erreur K1 sous la case (curseur à l'endroit fautif) ; mémoire MC MR M+ M− ; ↑ ↓ dans l'historique ; ⌘C sans sélection copie le résultat (`data-shortcut` sur 📋, K12). Un opérateur tapé juste après un résultat continue avec `ans`.
- **🧪 Scientifique** : rubriques (puces C5) Fonctions, Complexes, Arithmétique, Bases, Statistiques, Matrices (« ▦ » grille), Équations, Analyse, Unités (Valeur · De · En), Dates (deux champs C4 `data-ui-date`) ; chaque touche a sa bulle, chaque rubrique ses exemples cliquables ; DEG / RAD / GRAD.
- **📈 Courbes** : jusqu'à 6 y = f(x) (`LCNDA_CALC.compile`, calcul en nombres à virgule, radians), glisser pour se déplacer, molette et `UI.zoomControl` pour zoomer, lecture au survol, flèches au clavier, « ⤓ » PNG.
- **Réglages** : `localStorage['genealogie-calculette']` (thème « Comme l'app » / clair / sombre, mode, angle, chiffres 4–15, virgule ou point, fractions, région des mesures, bouton du haut) dans ⚙️ (`UI.autoSaveDialog`, K2, ↺) + `UI.presetsFrame` (`genealogie-calculette-presets`, fichier `lcnda-reglage-calculette-….json`). Sur cet appareil seulement : ruban `lcnda-calculette-ruban` (100 calculs), mémoire, courbes, place et taille de la fenêtre (`lcnda-calculette-place` ; double-clic sur le titre = remise en place). Sur téléphone : en bas, toute la largeur.

**Le moteur (`window.LCNDA_CALC`, sans écran, testable dans Node)** — jamais eval ni Function :

```js
const M = window.LCNDA_CALC;
M.evaluate('1/3 + 1/6', {angle: 'deg', digits: 10, dec: ',', frac: true, region: 'paris', ans})
  // → {ok, value, kind: number|complex|list|matrix|solve|convert|date|bool|text, text (à copier), html (joli), alt (2e ligne), approx, exact, inputHtml}
  // ou {ok: false, error: 'Il manque une parenthèse fermante « ) ».', hint, pos}
M.compile('sin(x)')(1.2) ; M.parse(texte) ; M.toHtml(arbre) ; M.formatValue(v, {digits, dec}) ; M.functionList() ; M.unitList(region)
```

- Valeurs : fractions exactes (`BigInt`, 0,1 + 0,2 = 3/10), nombres à virgule, complexes (`i`), listes `[1 ; 2]`, matrices `[[1 ; 2] ; [3 ; 4]]`, textes (solutions, décompositions…). Priorités usuelles, multiplication sous-entendue (`2x`, `2(3+4)`, plus forte que « / » : 1/2x = 1/(2x)), `%` (200 + 10 % = 220), `!`, `°`, `|x|`, `mod`, `²`, `√`, `0x…`, `0b…`, milliers « 1 234,5 ». Virgule décimale et « ; » entre les nombres (ou point et « , »).
- Fonctions en français avec les noms anglais en alias (`def(…)` : groupe, phrase, exemple) ; une lettre libre avec « = » → équation résolue (polynôme reconnu par sa forme, degré ≤ 4 exact — racines rationnelles, forme ± √ —, sinon recherche des changements de signe entre −100 et 100) ; plusieurs équations → système du 1er degré exact (≤ 6 inconnues). `derivee`, `integrale` (exactes sur un polynôme, sinon Ridders et Gauss-Kronrod), `limite`, `somme(k^2 ; k ; 1 ; 10)`.
- **Réutilise** : `LCNDA_SHEET.readActDate` (dates C4), `gregorianToRepublican` ; `LCNDA_EXT.calendarMore` (mesures anciennes par région `REGIONS`, `lsd`, `dateDiff`, `weekday`). Le moteur ajoute seulement ce qui manquait : unités d'aujourd'hui, poids de marc, monnaie de compte (livre = 20 sols = 240 deniers, louis, écu, franc germinal = 81/80 livre), températures. Le lecteur de formules du Tableur n'est pas repris : il parle de cellules et de plages, celui-ci de x, de i et de matrices.
- Bornes : 2 000 signes, 80 niveaux de parenthèses, nombres de 60 000 bits, factorielle ≤ 5 000, matrices 20 × 20, listes 10 000, nombre d'opérations borné (« Ce calcul est trop long »).
- Test : `tests/test-calculette.js` (moteur : ~250 cas exacts ; navigateur : clavier, ruban, mémoire, scientifique, courbes, réglages, au-dessus d'une fenêtre, 390 px sombre).

## 🔍 Images semblables et 👯 doublons d’images (app-image-prints.js, heritage-images-similaires.js, lib/image_prints.php)

Tout se calcule dans le navigateur (aucun service extérieur). **Le moteur** `window.LCNDA_IMGPRINT` (aussi `require()` dans Node) :

```js
const P = window.LCNDA_IMGPRINT;
P.fromPixels(rgba, w, h, {w: largeurOrigine, h: hauteurOrigine})  // l'empreinte d'une image ramenée à 512 px (P.workSize)
// → {nw, nh, w, h, a, d, p (aHash, dHash, pHash 64 bits en hexa), hist (64 cases), lum, sat, g (gris 48×48), c (couleurs 16×16), kp (≤ 160 points)}
P.compare(a, b, {sens})    // a, b : {print, sha1, w, h, ext} → {kind: 'identique'|'proche'|'recadree'|'ressemblante'|null, sub, score, map, zone, part, n}
await P.search(q, liste, {exclude, min})          // recherche inversée, classée (identique, très proche, recadrée, ressemblante)
await P.duplicates(liste, {sens, dismissed})      // groupes de doublons : {items, pairs, cats (parfaits|retouches|recadres|taille|format), best}
```
- **Comment** : même fichier (sha1) → identique ; même cadrage → hachages perceptuels proches ; recadrée / zoomée → coins FAST-9 sur 4 échelles, descripteurs BRIEF 256 bits, appariement (test du rapport) puis RANSAC d'une homothétie (échelle + décalage, sans rotation), dans les deux sens. Chaque correspondance est **vérifiée** sur les petites vignettes : corrélation des détails en gris (un dégradé lisse ne compte pas) et couleurs (une version en noir et blanc ou en sépia passe, deux teintes franches non). Une rafale ou une paire stéréo (même échelle, tout décalé) → « ressemblante (autre prise) ». `map` sert à replacer les zones des visages ; `zone` est le cadre bleu de l'aperçu.
- **Changer l'algorithme** : monter `ALGO` dans le moteur → le serveur rend toutes les photos « à recalculer » (`image_prints_todo&algo=`).

**Le calcul en tâche de fond** : `LCNDA_EXT.imagePrints.run()` (par paquets de 4, à la fin des temps libres du navigateur, sans relancer le compte des personnes) ; lancé tout seul quand on ouvre Listes → Médias, en ouvrant l'un des deux outils, et après une retouche ou une rotation ; pas en mode consultation ni en mode simple. Le serveur compare la taille et la date du fichier : une photo retouchée, tournée ou remplacée est recalculée ; une photo illisible est notée (`error`) et n'est retentée que si son fichier change.

**Les écrans** : `LCNDA_EXT.openSimilarImages({media} | {file})` (visionneuse `#similar-media`, ⋯ / clic droit d'une vignette de Médias `data-similar-media="id"`, en-tête de Médias `data-similar-open`) ; `LCNDA_EXT.openImageDuplicates()` (en-tête de Médias, `openMediaDuplicatesDialog` y mène : l'ancienne recherche par fichier identique est reprise, sons et PDF compris). Fenêtres `modal-xl`, filtres C5 avec le nombre, vignettes K9, sensibilité C3 (retenue : `lcnda-imgdup-sens`), « Les autres photos : 🗑 À la corbeille | 🗂 En versions » (`lcnda-imgdup-mode`).

**Serveur** (`lib/image_prints.php`, structure n°61) : tables `image_prints` (une ligne par média), `image_not_duplicates` (paires écartées, a < b), `image_dup_merges` (chaque fusion notée pas à pas). GET `image_prints_status|todo|all&algo=`, `image_dup_state` ; POST `image_prints_save {algo, items}` (24 au plus, empreinte vérifiée : hexa, base64 de la bonne taille), `image_dup_dismiss {pairs, undo}`, `image_dup_merge {keep, others: [{id, map}], mode: 'trash'|'version'}`, `image_dup_undo {token}`.
- **La fusion** : liens `media_links` (sans doublon), étiquettes, portrait, album (`family_collection_media`), recueils, enquêtes, cartes, musée, cartes postales, noms cités, réponses de correspondance (`IMGDUP_REFS`), zones `media_tags` replacées avec `map` (hors de la photo gardée : elles restent avec le doublon) ; « en versions » : le fichier devient une `media_versions` de la photo gardée (l'original noté s'il n'y en avait pas). Puis `delete_media` (journal, fichier gardé sur le disque). « ↶ Annuler » rejoue les étapes à l'envers (`restore_deleted_media` pour les photos écartées) : la base revient exactement comme avant, même longtemps après (« 🗑 Corbeille des doublons » → « ↶ Remettre »).
- Test : `tests/test-images-similaires.js` (photos fabriquées avec GD : identique, JPEG recompressé, redimensionnée, recadrée 70 %, zoomée, plus claire, PNG, autre photo ; envois forgés, CSRF, consultation ; fusion puis annulation exacte ; 390 px et sombre).

## 🔄 Retouche : rotation de l’image entière (heritage-retouch-rotation.js)

Image → « 🔄 Rotation de l’image » (comme Photoshop) : ↻ 90° horaire (`rot:cw`), ↺ 90° antihoraire (`rot:ccw`), 180° (`rot:180`), « Angle… » (`rot:angle`), « 📐 Redresser l’horizon » (`rot:level`), symétries (`flip:h`, `flip:v`). Chaque commande est un `data-rt-cmd` : raccourci réglable (outil `retouch` de heritage-editorkeys.js). Retouche rapide : ↺ ↻ dans la colonne (`data-rs-rot`) et menu Image (sans angle libre).

- **Un seul moteur** `LCNDA_EXT.rtOrient` (aussi `require()` dans Node) : les étapes `st.docXf` = `[{r: degrés horaires, bg}, {f: 'h'|'v'}, {p: 4 coins}]`, rejouées sur l’image de départ (`applySteps`) — l’original n’est jamais touché ; `push` combine les 90° et les symétries qui se suivent (4 × 90° = aucune étape : la même image au point près).
- **Tout le document suit** (`doc(snap, étape, {W0, H0, W1, H1, mask})`) : textes (point d’accroche, tailles, `rot`, `mirror`), formes (droites après 90°, sinon `rot` autour du centre), images placées (`rot`, `mirror`, taille en points gardée), traits et masques peints, dégradés, motifs (`angle`, `mirror`, `refW`), zones de pixels (`dx`, `dy`), retouches de la photo (taches, tampon, réparer, remplir, poser ailleurs), sélection et masques (toiles tournées par `canvasStep`, sans lissage pour 90°), centres des filtres, perspective (coins rangés à nouveau), recadrage (90° : tourné ; angle libre : retiré, signalé), zone de travail et taille finale (largeur ↔ hauteur). Résolution (ppp) gardée.
- **Angle libre** : la zone s’agrandit (`dims`), coins transparents (l’image s’enregistre alors en PNG) ou d’une couleur ; une perspective en cours est d’abord figée dans l’image (`{p}`) ; « ✂️ Recadrer pour enlever les coins vides » pose le plus grand rectangle droit (`innerRect`) comme recadrage.
- **Historique** : une rotation = une étape ; `restore()` remet l’image de l’étape (`setDoc`), la taille de l’aperçu et les toiles ; un projet enregistré garde `docXf` et rouvre tourné (masques à la bonne taille).
- **📱 Exif** : à l’ouverture, `exifState(octets, largeur, hauteur)` lit l’orientation (1 à 8) et la taille du JPEG ; si le navigateur ne l’a pas appliquée (la taille montrée est celle du fichier), un bandeau ℹ️ propose « ↻ Remettre droite » (une étape). Les navigateurs récents l’appliquent tout seuls : rien à faire.
- Un nouvel élément de calque avec des coordonnées : l’ajouter dans `xfOp` (sinon il ne tournera pas). Test : `tests/test-retouche-rotation.js`.

## 🗺 Cadastre (heritage-cadastre.js, cadastre.css, lib/cadastre.php)

Listes → Lieux et maisons → « 🗺 Cadastre ». Construit sur l'existant : la Carte (`ext.mapSetup` / `ext.mapDraw`), les Cartes anciennes (calage d'un plan, heritage.js), l'outil Maison, la fiche d'un village, le plan des adresses, le menu de choix et la fenêtre des images.

- **Base** (migration 60) : `cadastre_parcels` (insee, commune_place_id, commune_name, prefixe, section « AB » / « 0A », numero « 0100 », idu = insee + préfixe + section + numéro, unique quand il existe ; lieu_dit, surface_m2, nature, address, old_ref « B 245 (1834) », geometry_json = MultiPolygon GeoJSON nettoyé (≤ 20 000 points, 7 décimales), lat/lon = centre ; source `api|manual|map`, notes) et `cadastre_parcel_links` (kind `person|house|place|event|media|source|oldmap`, target_id, txt = nom sans fiche (personne), role, is_primary = « ★ Propriétaires », date_from / date_to en texte C4, note, sort_order).
- **API** — GET : `cadastre_parcels` (`with_geom=1` pour la carte et les vignettes), `cadastre_parcel` (fiche + liens avec leurs noms d'aujourd'hui + archives du département tirées de `departmental_archives_seed`), `cadastre_for` (`kind=person|house|place`, `id`, `insee` : un lieu prend aussi les parcelles de sa commune), `cadastre_place` (code INSEE d'un lieu ; un lieu tapé à la main prend la commune de même nom), `cadastre_lookup` (`mode=ref` insee + section + numéro facultatif · `mode=point` lat + lon (+ `address=1`) · `mode=sections`), `cadastre_dvf` (`idu`). POST : `save_cadastre_parcel`, `delete_cadastre_parcel` (rend `{parcel, links}`), `restore_cadastre_parcel` (même numéro, pour « ↶ Annuler »), `cadastre_link` (`{parcel_id, kind, id, role, on}` : relier ou retirer une seule chose, tout de suite). Menu de choix : sorte `parcel` (▦, `picker_parcels`, « ab 100 » trouve la section AB n° 100).
- **En ligne, toujours par le serveur** (`cadastre_http`) : API Carto IGN `apicarto.ign.fr/api/cadastre/parcelle|feuille`, en secours le WFS de la Géoplateforme (`CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle|feuille`, `SRSNAME=CRS:84`), géocodage inverse `data.geopf.fr/geocodage/reverse`, DVF `files.data.gouv.fr/geo-dvf/latest/csv/{année}/communes/{dép}/{insee}.csv`. HTTPS seulement, délais 8 / 15 s, taille bornée, cache 30 jours dans `DATA_DIR/cache/cadastre/`, 40 demandes par minute au plus ; on n'envoie que commune, section, numéro ou un point. Pour les essais : `LCNDA_CADASTRE_FIXTURES=dossier` (fichier `index.json` = `[{match, file, status?}]`) remplace Internet (`tests/fixtures/cadastre`).
- **Tuiles** : `ext.cadastre.tilesHtml(left, top, w, h, z)` (WMTS `CADASTRALPARCELS.PARCELLAIRE_EXPRESS`, style « PCI vecteur », transparentes, à partir du zoom 13, celles du zoom 19 agrandies au-delà) — Carte (interrupteur « ▦ Parcelles », `localStorage['lcnda-cadastre-layer']`, « 📍 Parcelle ici » → « ＋ Ajouter cette parcelle »), plan des adresses (pref `cad` de `genealogie-addrmap`), petite carte `ext.cadastre.miniMap(el, {lat, lon, zoom, parcels, onClick})`. Le fond `ign_parcels` (« Parcelles du cadastre (IGN, actuel) ») est aussi dans la liste des fonds (app.js), pour la Superposition.
- **Écrans** : liste H10 / K5 / K9 (vignette = la forme de la parcelle, `shapeSvg`) ; fiche (page `S().cadastreId`, ou fenêtre `ext.cadastre.open(id, {dialog: true})` par-dessus un outil) ; fenêtre `ext.cadastre.edit(fiche|null, prefill)` (commune + section + numéro → « 🔍 Chercher », « 🗺 Cliquer sur la carte », personnes avec `pickerField` rôles et `roles.zones` = « ★ Propriétaires » / « ☆ Autres personnes », dates par personne, maisons, lieux, événements, sources, cartes anciennes, médias par `mediaField`). Blocs : maison (`ext.housePaneExtras`, crochet ajouté dans l'onglet Maison), village (section `parcels`, hôte `[data-cad-host="place"]` rempli tout seul), personne (`ext.personBlocks.parcels`, « 🗺 Propriétaire de… », données `heritage_person_data()['parcels']`).
- **Plans anciens** : « ＋ Caler un plan ancien » prépare une nouvelle carte ancienne (`S().hOldMapPrefill = {title, lat, lon, parcelId}`), l'évènement `lcnda:oldmap-saved` la relie à la parcelle. Le calage des cartes anciennes accepte maintenant **2 points** (même échelle, rotation, déplacement ; `computeTransform` et `old_map_transform`), 3 ou plus restant une transformation affine.
- Test : `tests/test-cadastre.js` (`CADASTRE_SHOTS=dossier` pour les captures).

## 🌐 Mon site web et 🪟 widgets sur le bureau (heritage-site-web*.js, heritage-desk-widgets.js, site-web.css, lib/website.php, lib/desk_widgets.php, electron/desk-widgets.js)

Listes → 🛠️ Outils de modification → « 🌐 Mon site web » : un site = des pages HTML, une feuille CSS, un script JS, des couleurs et polices (« 🎨 Styles » → variables `--lc-principale`, `--lc-accent`, `--lc-fond`, `--lc-texte`, `--lc-police`, `--lc-police-titres`, `--lc-largeur`, `--lc-arrondi`, `--lc-taille`), gardés en JSON dans `websites` (migration `schema_v62`) ; versions dans `website_versions` (100 au plus). API — GET : `websites`, `website`, `website_versions`, `website_version`, `website_render` (blocs de la généalogie pour l'aperçu), `website_preview` (une page, tout dedans, en-tête `CSP: sandbox allow-scripts`), `website_export` (`format=zip` ou `html` + `page`), `website_export_check` (résumé : pages, images, refusées, noms retirés) ; POST : `save_website` (`rev` → conflit ; rend `removed` = ce que le nettoyage a retiré et `data` nettoyées), `rename_website`, `delete_website` (rend le site pour « ↶ Annuler »), `restore_website`, `duplicate_website`, `save_website_version`, `delete_website_version`, `restore_website_version`. Mode consultation : `website_export` et `desk_widget_file` refusés.

**L'éditeur** (`ext.siteWeb.open({id})` ou `({data, name})`, `ext.siteWeb.chooseTemplate()` ; au premier plan : `ext.siteWeb.current`) : E1 (Fichier, Édition, Insertion, Affichage), K19 (↖ Choisir V, T Écrire T, ▶ Tester P · ＋ Blocs B, 📄 Pages, 🎨 Styles · </> Code), E2 « Ceci est… » (rôle en un clic : En-tête, Menu, Contenu principal, Section, Pied de page, Carte ; nom `data-lc-name`, balise, classe, id ; Position et taille, Couleur, Texte en C2/C3/E5 ; options du bloc), K18 (où l'on est, aide, zoom), « 💾 Enregistrer ▾ » (copie, version, ↗ aperçu), E3 (« 📦 Tout le site en .zip », « 🌐 Cette page seule » .html).
- **L'aperçu** : `<iframe sandbox="allow-scripts" srcdoc>` (origine opaque, CSP `connect-src 'none'`) avec le petit script « pont » `ext.siteKit.BRIDGE` (heritage-site-web-blocs.js) : survol, choix (`{type:'select', info}`), texte modifiable (`contenteditable` posé et retiré par le pont, jamais enregistré), glisser un bloc (`drop` → position ; le bloc glissé est retenu par l'éditeur), liens entre pages (`goto`). L'éditeur vérifie `e.source === iframe.contentWindow` et ne garde que des chaînes bornées. Le JS de la personne ne tourne qu'en ▶ Tester (page rechargée). Rien de l'aperçu n'entre dans le DOM de l'app.
- **Le code** (`ext.siteCode`, heritage-site-web-code.js, aussi `require()` dans Node) : `create(hôte, {lang, value, onChange, onCursor})` → `{value, setLang, reveal(de, à), mark(de, à), cursor()}` ; `expandAbbr('ul>li*3')`, `expandCss('m10')`, `completions(texte, pos, lang)`, `highlight(code, lang)`. Les deux faces se suivent : code → aperçu en 0,2 s (`set` / `css`), aperçu → code (`html` sérialisé par le pont, blocs vidés) ; un choix dans l'aperçu surligne ses lignes ; un clic dans le code choisit l'élément (repère `<!--lcb-caret-->` posé dans une copie lue par DOMParser).
- **Les blocs** (`ext.siteKit.BLOCKS`, `TEMPLATES`) : En-tête, Menu (`data-lc-block="menu"`, tenu à jour), Bandeau, Texte, Trois colonnes, Citation, Contact, Pied de page, Image et Galerie (fenêtre unique des images), et ceux de la généalogie — `<div data-lc-block="tree|person|timeline|map|chart|photos|place" data-person="12" …>` vides dans le code, remplis par `website_block_html` (aperçu : `website_render`) et figés à l'export. Modèles : Page vide, Ma famille, Mon ancêtre, Mon village, Portfolio d'artiste.
- **Sûreté (serveur)** : `website_defuse` (balises script, style, iframe, object, embed, base, meta, link, animate…, attributs `on…`, `srcdoc`, `formaction`, `xlink:href`, `srcset`, adresses `javascript:`/`data:` hors images, `expression()` dans `style`), `website_css_clean` (`@import` seulement Google Fonts), `website_js_clean` ; règle F11 (`gedcom_share_hidden`) : `website_open`, `website_media_ok` (personne de cachée reliée, repérée ou en portrait), `website_redact` (nom complet d'une personne cachée écrit à la main → « [nom retiré] » à l'export) ; images réenregistrées 1600 px sans EXIF, noms fabriqués `images/m1.jpg` ; CSP du site exporté : `script-src 'self'`.
- **Déplacer** : dans l'aperçu (↖ Choisir), on prend un élément et on le glisse ; le pont dessine la ligne bleue (avant / après) ou un cadre en pointillés (dedans : milieu d'une section, d'un div…) et envoie `{type:'move', from, to, where}` ; l'éditeur le fait dans la page (`moveTo`, DOMParser), le code et ↶ ↷ suivent. Au clavier : Alt + ↑ / ↓ (dans l'aperçu ou le panneau).
- **🏛️ Diagramme** (`data-lc-block="diagram" data-diagram="12"`) : choisi par le menu de choix (sorte `diagram`) ou créé (`ext.openDiagramEditor`) ; dessiné par `ext.diagramSvg(id)` (données à jour) et gardé dans `site.frozen["diagram:12"]` ; redessiné à chaque ouverture (`refreshFrozen`) ; serveur : `website_svg_clean` (désamorcé, liens `#` seulement), noms des personnes cachées retirés à l'export.
- **🗺 Fond de carte** (`data-fond`, liste et ordre des Réglages : `A().mapBackgroundSelectHtml`) : les lieux viennent du serveur (`website_map_points`, règle F11), l'app assemble les tuiles (`A().mapTileUrl`, sinon la tuile hors ligne) en une image JPEG avec la mention du fond (`creditOf`) → `site.frozen["map:personne:portée:générations:fond"] = {img, credit, w, h, view}` ; à l'export : `images/carte-N.jpg` réenregistrée par GD. `data-vive="1"` : carte interactive dans le site publié (`assets/js/site-carte-vive.js` copié en `js/carte-lcnda.js`, sans bibliothèque) avec un fond qui le permet (`SITE_MAP_LIVE` : OpenStreetMap, CARTO, OpenTopoMap, OpenHistoricalMap ; sinon OpenStreetMap), l'image restant en secours.
- **📤 Publier** (`lib/website_publish.php`, GET `website_publish_state`, POST `website_publish_settings`, `website_publish`, hors transaction) : Netlify (création du site puis dépôt du .zip), GitHub Pages (blobs → arbre → commit sur `gh-pages`, dépôt créé s'il manque, Pages allumé), FTP sécurisé (curl : TLS obligatoire, certificat vérifié). Jetons et mots de passe dans `DATA_DIR/site-publish.json` (600), jamais renvoyés (l'écran sait seulement `has_token`), ni dans la base, ni dans le site. HTTPS vers `api.netlify.com` / `api.github.com` seulement, sans redirection, délais et tailles bornés. SFTP non proposé (clé du serveur impossible à vérifier simplement) ; FTP en clair refusé. Essais : `LCNDA_PUBLISH_TEST_BASE` (faux serveur local).
- **Styles sur la classe** (`styleTarget`, `applyDecl`) : en haut du panneau, « Appliquer à » = « Tous les éléments .classe » (par défaut quand l'élément en a une) ou « Cet élément seulement » ; état Normal / « Au survol » (`:hover`) ; taille d'écran Toutes / 💻 Tablette `(max-width: 820px)` / 📱 Téléphone `(max-width: 480px)` (l'aperçu suit). Hors « cet élément, normal, toutes tailles » (`style="…"`), le panneau écrit une vraie règle dans le CSS du site par `ext.siteCode.cssSetDecl(css, {sel, media, prop, value})` (règle retrouvée et mise à jour sans doublon, ordre des propriétés gardé, règle vide retirée, @media réutilisé ; `cssScan`, `cssGetDecls` pour lire) ; un élément sans classe reçoit un id `el-xxxxx` pour `#id:hover`. Le CSS tapé dans le code revient dans le panneau (il relit l'élément). ↶ ↷ comme le reste.
- **Carte interactive dans l'éditeur** : l'aperçu reçoit le même `assets/js/site-carte-vive.js` (`window.LCNDA_CARTE_VIVE()` relancé après chaque `set`) et les fonds autorisés (`website_render` → `live` = `SITE_MAP_LIVE`) ; le pont laisse passer glisser, molette et ＋ − dans `.lc-carte-vive`. L'aperçu se recharge toujours avec un texte nouveau (`<!--n-->` à la fin) : sinon le navigateur ne recharge pas un `srcdoc` identique et « prêt » n'arrive jamais.
- **📦 Tout le site en .zip** (E3, `website_export&format=zip`, nom `nom-du-site-AAAA-MM-JJ.zip`, ZipArchive comme la publication) : exactement les fichiers de la publication (`website_build('export')`) + `LISEZ-MOI.txt` et `LISEZ-MOI.html` (`website_readme` : double-clic, MAMP, WAMP / XAMPP, `php -S` / `python3 -m http.server`, hébergeur). Adresses relatives partout (racine ou sous-dossier), aucun PHP ni base : en `file://`, pages, images, scripts et carte interactive marchent ; seuls les fonds de carte (tuiles) et les polices Google viennent d'Internet (sans connexion : l'image figée de la carte, une police proche). La copie dans les médias n'est pas proposée (les médias ne prennent pas les .zip).
- **Essai complet** : `tests/test-site-web-complet.js` essaie chaque commande (barre, menus, colonne d'outils, blocs, panneau, pages, styles, code, touches, aperçu, versions, export, publier simulé, widgets, liste) et vérifie le résultat ; le .zip est ouvert (HTML bien formé, liens, images, CSP, aucun vivant, aucun chemin absolu), ouvert en `file://`, puis servi par `php -S` à la racine et dans un sous-dossier ; à la fin, le tableau commande → OK.
- Pas encore fait : Emmet `^` (remonter) et `lorem`, carte interactive sur les fonds IGN / Esri (images figées seulement), « Oublier le jeton » visible seulement en rouvrant 📤 Publier après un premier envoi.

**🪟 Widgets sur le bureau** : 🪟 sur les widgets du tableau de bord (`today`, `upcoming`, `saint_day` → Ce jour-là ; `random_person`, `chosen_person` → Un ancêtre ; `random_media`, `favorite_image` → Photo du jour) et « 🪟 Widgets sur le bureau… » en bas de la colonne (`ext.deskWidgets.open(sorte)`). Sortes : `today`, `ancestor`, `photo`, `countdown`, `calc` (🧮 la Calculette : son moteur `app-calculette-engine.js` est mis dans la page du widget ; 🪟 aussi dans la barre de la calculette).
- Application de bureau : `window.lcnda.desktopWidgets.{list, open(sorte, {onTop, label, date}), set, close, autostart(oui)}` (preload) → `lcnda:desk-widgets` (main.js, seulement depuis la fenêtre de l'app) → `BrowserWindow(desk.windowOptions(…))` : sans cadre, `contextIsolation`, `sandbox`, sans Node **ni preload**, sur `api.php?action=desk_widget_page&kind=…` (CSP avec nonce, `connect-src 'none'`), navigation bloquée hors de sa page ; place, « toujours au-dessus » et « ouvert » dans `config.json` (`deskWidgets`) et rouverts au lancement ; clic droit : Toujours au-dessus, Remettre à jour, Ouvrir LCNDA, Retirer, Quitter. « Démarrer avec l'ordinateur » : `app.setLoginItemSettings` (Mac, Windows), `~/.config/autostart/lcnda-widgets.desktop` (Linux) ; lancé avec `--widgets` (Mac : `wasOpenedAtLogin`), la grande fenêtre reste cachée (un second lancement ou l'icône du Dock la montre). L'aperçu « ↗ » d'un site s'ouvre aussi sans preload (`desk.isSitePreviewUrl`).
- Navigateur : « ⤓ Télécharger le widget (.html) » (`desk_widget_file`) : données figées, règle F11, images en `data:`, CSP `default-src 'none'`. Pas de PWA (l'app tourne sur un serveur local sans HTTPS).
- Test : `tests/test-site-web.js` (moteur de code, logique des widgets d'Electron, API, navigateur ; `SITE_SHOTS=dossier` pour les captures).

## ⏳ Une journée dans la vie de… (lib/biographie_journee.php, heritage-journee.js, journee.css)

Un **mode du générateur de 📖 biographie** (`lib/biographie.php` : mêmes `bio_date`, `bio_when`, `bio_age`, `bio_job`, `bio_name`) — pas un deuxième générateur. Entrées : fiche → ⋯ → « ⏳ Une journée dans sa vie… » (`ext.personMoreItems`), bloc « 📖 Biographie » → « ⏳ Une journée… » (`data-jr-open="<id>"`, avec `data-jr-event` pour un événement). Code : `ext.journee.open(id, {eventId, date})`.

- **La date** : menu de choix unique `kind: 'event'` filtré sur la personne (`filter: {person_id}`, `picker_events` accepte `person_id` : ses événements et ceux de ses couples) + raccourcis (GET `biography_day_events`) ; ou date libre C4 (aussi « 12 thermidor an II », `bio_day_republican`). Avant la naissance, après le décès, date incompréhensible → erreur sous le champ (K1).
- **GET `biography_day&id&event_id|date`** → `{person, date, title, subtitle, sentences: [{id, part, mark, text, src}], meteo, living, private}`. `part` : qui, famille, ou, metier, calendrier, contexte, prix, ambiance (+ meteo, ajouté par l'écran). `mark` : `fiche` ✓ (src.event_id, village, place_id, census_id…), `ref` 📚 (src.label = la source, src.url), `imagine` 💭 (jamais un chiffre, jamais la météo).
- **Ce qui est réutilisé** : la fiche du village (`village_profile` : population relevée au plus proche à ±15 ans, église, notes = monographie), `places.population` (GeoNames, dit « chiffre récent »), 🛠️ `trade_match` / `trades_dict`, saints `saints_calendar` / `saint_matching`, calendrier républicain (`jdtofrench`), 🌍 `world_around(from=to=année)` (frise historique, 3 au plus, locaux d'abord), et **seulement** `assets/data/prix-reference.json` pour les prix (une ligne = un chiffre sûr, une période au jour près, une source ; date hors période → rien). Tout outil de prix anciens lit ce même fichier.
- **Météo** : le serveur ne calcule rien, il dit où chercher (`meteo: {event_id}` ou `{lat, lon, date, country, place}`, seulement au jour près et avec des coordonnées) ; l'écran passe par `LCNDA_EXT.meteo` (`settings`, `look`) et `meteo_event` / `meteo_point` : pas installée, réglage « Jamais », personne ou événement masqués, reconstitution grossière non voulue → pas de phrase.
- **Confidentialité** : autres personnes vivantes ou confidentielles jamais nommées (« sa fille », « un enfant ») ; la fiche confidentielle → avertissement et ni copie, ni document, ni média, ni mise en page ; personne vivante → avertissement ⚠️. Mode consultation : pas d'écriture (« Poser dans » sans médias ni biographie).
- **Sorties** : 📋 Copier (texte + « Repères »), 📝 `ext.openTextDoc` (document neutre `LCNDA_TEXT`, imaginé en italique, repères en notes), 🔊 `ext.access.speak`, « Poser dans ▾ » : 📐 nouveau livre (`ext.layoutKit`), 📁 `textdoc_to_media` (DOCX), 📖 fin de la biographie (`save_biography`, H7 ↶ Annuler). Réglages de l'appareil : `localStorage['genealogie-journee']` = `{noImag, mode}`.
- Test : `tests/test-journee-vie.js`.

## 🌦 Météo d'autrefois (lib/meteo.php, heritage-meteo.js, meteo.css, scripts/meteo/)

Maquette validée : `docs/design/meteo.html` (M1 à M11). Le temps qu'il faisait le jour d'un événement (et à l'heure de l'acte), **sans Internet**, en France, Belgique, Suisse et Luxembourg (puis en Europe avec le pack Europe). Rien n'est écrit dans la fiche : tout est calculé à l'affichage.

**Les fichiers de données** : des bases SQLite À PART, jamais dans la généalogie.
- `meteo-socle.sqlite` : livré avec l'app, dans `data-meteo/` à côté de l'app (non suivi par git ; embarqué par Electron, `extraResources` → `php-app/data-meteo/`, permis par le garde-fou `electron/build/hooks.js` seulement à cet endroit et avec le schéma de la météo). Autre dossier : variable `LCNDA_METEO_DIR` (tests).
- `meteo-complet.sqlite`, `meteo-europe.sqlite` : packs importés une fois (K13) dans `SHARED_DATA_DIR/meteo/` (communs à toutes les généalogies). Chaque sorte est cherchée dans les deux dossiers ; celui des données passe devant. Quand une station est dans deux fichiers (même `source` + `code`), le plus complet passe devant (complet > europe > socle).
- Fabriqués par `scripts/meteo/build-meteo.py` (mode d'emploi pour l'utilisateur : `docs/METEO.md`) ; jeu d'essai synthétique : `scripts/meteo/make-fixture.py DOSSIER` ; format partagé : `scripts/meteo/meteo_format.py`.

**Tables** :
- `meta(key, value)` : `format` (= 1), `kind` (socle | complet | europe), `title`, `built`, `countries`, `fixture` (jeu d'essai).
- `sources(id, nom, licence, mention, url, mise_a_jour, sorte, annees, contenu)` : `meteofrance`, `meteoswiss`, `irm`, `meteolux`, `dwd`, `era5`, `20cr` ; la `mention` est celle que demande la licence (affichée sous le détail et à l'export).
- `stations(id, source, code, nom, pays, lat, lon, alt, debut, fin, heures_debut)` + index `(lat, lon)` ; `grid(id, source, lat, lon, alt, debut, fin, pas, heures_debut)` + index `(source, lat, lon)` pour les carreaux ERA5 (0,25°) et 20CR (1°).
- Valeurs : `daily(station_id, annee, blob)`, `hourly(station_id, annee, blob)`, `grid_daily(grid_id, annee, blob)`, `grid_hourly(grid_id, annee, blob)` — une ligne par série et par année (`WITHOUT ROWID`).
- `normals(sorte 'station'|'grid', ref_id, debut, fin, blob)` : 12 lignes (mois) × `TN`, `TX` (moyennes) et `RR` (total moyen du mois), pour chaque période de 30 ans qui finit sur une dizaine (1901–1930 … 1991–2020) avec au moins 20 années.

**Un bloc (`blob`)** = `gzdeflate` (deflate brut ; Python `zlib` wbits −15) de : en-tête 8 octets `'M'` (0x4D), version 1, nombre de colonnes, pas (0 = une ligne par jour ; n = une ligne toutes les n heures UTC, 0 h le 1er janvier d'abord), nombre de lignes (uint16 LE), 2 octets à zéro ; puis un octet par code de colonne ; puis chaque colonne : des int16 LE, **écrits en écarts** avec la dernière valeur connue ; `-32768` = valeur manquante (l'écart repart de la dernière connue) ; valeurs bornées à ±16000.
Colonnes : 1 `TN` min (0,1 °C) · 2 `TX` max (0,1 °C) · 3 `T` à l'heure (0,1 °C) · 4 `RR` pluie (0,1 mm) · 5 `SN` neige (cm) · 6 `FX` rafale (0,1 m/s) · 7 `NN` nuages (%) · 8 `SS` soleil (min) · 9 `WW` phénomènes (bits : 1 brouillard, 2 orage, 4 grêle, 8 neige tombée, 16 gel ou verglas, 32 brume). Lecture : `meteo_decode()` (PHP) / `F.decode()` (Python).

**Un pack à importer** (`.lcmeteo`) : 4096 octets d'en-tête (`LCMETEO1\n` + JSON : `kind`, `stations`, `cells`, `from`, `to`, `hours_from`, `size`, `sha256`, complété d'espaces) puis la base SQLite. La fenêtre K13 lit l'en-tête dans le navigateur (étape 2 « Vérifié »), envoie le fichier par morceaux de 4 Mo (`POST meteo_pack_begin {size}` → `meteo_pack_chunk&id&offset`, corps brut, CSRF dans l'en-tête → `meteo_pack_finish {id}` : taille, empreinte sha256, base lisible et de la bonne sorte, puis rangé ; l'ancien pack gardé en `.prev`). « ↶ Annuler » : `meteo_pack_undo {kind}` ; « 🗑 Supprimer le pack » : `meteo_pack_remove` (mis de côté en `.removed`, « ↶ Annuler » : `meteo_pack_restore`). Le socle livré avec l'app ne se supprime jamais. Ces POST sont traités hors transaction de la base (fichiers à part) ; refusés en mode consultation.

**Le calcul** (`meteo_day($lat, $lon, $alt, 'AAAA-MM-JJ', $heure, $opt)`) :
- Station la plus proche qui couvre l'année : distance haversine + 1 km par 10 m d'écart d'altitude (altitude saisie du lieu, sinon celle de la grille des altitudes, sinon pas de pénalité). < 15 km et < 150 m d'écart → `measured` (« Mesuré », vert) ; 15–40 km → `station` (« Station à N km », jaune ; `regional_rain` : « il a plu dans la région ») ; sinon, depuis 1940, le carreau ERA5 → `estimated` (« Estimé (carreau ≈ 30 km) », jaune) ; 1836–1939, 20CR → `coarse` (« Reconstitution grossière (≈ 100 km) », gris, montrée sur la fiche seulement si le réglage le demande) ; rien → `none` + `first` (première station à moins de 120 km : « Pas de relevé connu près d'ici avant 1863 (première station : Toulouse) »).
- Heures (1940 →) : la station si elle a l'heure par heure (pack complet), sinon le carreau ERA5 (4 par jour au socle) ; `moment` = la valeur la plus proche de l'heure de l'acte. Avant 1940 : la journée seulement (nuit → min, jour → max).
- L'heure de l'acte (`events.event_time`, « HH:MM », migration 63, case K17 « Heure de l'événement » de la fenêtre de l'événement) est remise en UTC par `meteo_local_to_utc` : France = heure solaire du lieu avant le 15/03/1891, heure de Paris (UTC+0:09:21) jusqu'au 10/03/1911, GMT et ses heures d'été (1916–1940), heure allemande en zone occupée dès le 14/06/1940 et partout dès le 2/11/1942 (ligne de démarcation simplifiée), Libération, UTC+1 ensuite et heure d'été depuis 1976 ; Belgique, Suisse (heure de Berne avant 1894), Luxembourg : leurs règles principales ; ailleurs : le fuseau de la longitude. `GET meteo_time&date&time&place_id` donne la phrase « ✓ Compris » (M9).
- La normale : la période de 30 ans qui finit sur la dizaine de l'année (1926 → 1901–1930, 1978 → 1951–1980), écart de la moyenne du jour.
- Cache : `DATA_DIR/cache/meteo-cache.sqlite` (clé = lieu, date, heure + signature des fichiers ; monter `METEO_CACHE_VERSION` quand le calcul change).

**API (GET)** : `meteo_status` (fichiers installés, M5), `meteo_about` (sources et licences, M10), `meteo_events&ids=` (pastilles), `meteo_event&id=` (détail M2), `meteo_person&id=` (bloc M4 + phrases curieuses, seulement « Mesuré » / « Station »), `meteo_point&lat&lon&date&time&alt&country` (un point), `meteo_time`, `meteo_today&date=MM-JJ` (widget M7 : anniversaire rond, jamais un vivant ni une fiche confidentielle, règle de `df_hidden_people`).

**L'écran** (`window.LCNDA_EXT.meteo` : `settings`, `look(r)` (icône, titre, phrase), `badge`, `decorate(racine, {rowSel, after})`, `openDay(idÉvénement)`, `openAbout`, `importPack`, `noticeHtml(dyn)`) :
- M1 : `afterPerson` pose une pastille `.wx-pill` sous le lieu de chaque `.event-row[data-event-id]` (attribut ajouté dans app.js) ; bulle `.wx-pop` après 0,4 s ; clic = fenêtre 540 (`dialog.small-modal.wx-dialog`, « Fermer » seul) ou panneau qui se déplie (réglage « Au clic sur la pastille »). Clic droit (K14) ou ⋯ du détail : « 🙈 Masquer la météo de cet événement / de cette personne » (H7 « ↶ Annuler »), « ⚙️ Réglages », « 📚 À propos ».
- M4 : bloc de fiche `meteo` (« 🌦 Météo de sa vie », largeur ½ par défaut, se range et se cache comme les autres ; montré quand le réglage « Bloc » est allumé).
- M5 : Réglages → Données → « 🌦 Météo d'autrefois » (`ext.maintenance.meteo`, K2 : chaque changement gardé, « ✓ Enregistré », « ↺ Remettre comme au départ » qui garde ce qui est masqué). Réglages : `localStorage['genealogie-meteo']` = `{show: always|hover|never, open: window|fold, temp: c|f, rain: mm|in, phrase, normal, sources, block, curious, today, coarse, kinds: {BIRT, BAPM, MARR, DEAT, BURI, CENS, TRAVEL, OTHER}, hidePersons: [{id, label}], hideEvents: [{id, label}]}` (suit la base, dans `SITE_DEFAULT_KEYS` et `site_defaults_allowed_keys`).
- M7 : widget `meteo_widget` ; pastilles des ancêtres dans « 🎂 Dates à fêter » (`decorateDates`, jamais un vivant). M8 : Chronologie → interrupteur « 🌦 Météo » (`state.timeline.meteo`, `decorateTimeline`) ; mise en page → Objet → « 🌦 Encadré météo d'un événement… » (objet dynamique `dyn: {type: 'meteo', id}`, refait par « ↻ Mettre à jour les objets dynamiques », la ligne des sources suit).
- Aucun POST : le mode simple et le mode consultation restent en lecture seule (le menu « Masquer » n'apparaît pas en consultation).
- **⛰ Altitudes** : table `elevation(lat0, lon0, n, blob)` dans le socle (et, en option, le pack Europe) : un bloc par carré de 1° (coin sud-ouest), `n` × `n` nœuds (n = 120, un toutes les 30″ ≈ 1 km) aux points `lat0 + i/n`, `lon0 + j/n`, rangés ligne par ligne (vers le nord), colonne `Z` (code 10, mètres ; manquant = mer). Source : Copernicus DEM GLO-90 (mention dans `sources.copdem`), fabriquée par `build-meteo.py altitudes` (aussi avec `socle` ; `--test` : un carré du Gers) avec un petit lecteur GeoTIFF sans bibliothèque (`Tiff` : tuiles, deflate / LZW, prédicteur 3). Pays : `ALT_COUNTRIES` (FR, BE, CH, LU, IT, NL, ES, DE, PT, GB, PL, DK, CZ, SK ; `meta.relief_countries`, dit dans M5 et M10), carrés choisis par `country_tiles()` d'après les contours de `assets/data/geo/monde-50m.json` (un sommet dans le carré, ou un coin / le centre dans le pays ; boîtes `ALT_BOXES` si le fichier manque ; fenêtre `ALT_WINDOW` : l'Europe avec Açores, Madère, Canaries, sans l'outre-mer) : 495 carrés, ≈ 5 Mo. Seulement l'altitude : la météo ne change pas ; un lieu hors de la zone météo reçoit `why: 'out'` (« Pas de météo pour ce lieu… », ligne vide K10) et son altitude. Lecture : `meteo_altitude($lat, $lon)` (bilinéaire entre 4 nœuds, d'un carré à l'autre ; null hors de la grille), GET `meteo_altitude&lat&lon`.
- **Pack Europe** (`build-meteo.py europe`) : stations des pays qui publient librement, une fonction par source dans le fabricant (`do_dwd`, `do_knmi`, `do_dmi`, `do_midas` (jeton CEDA), `do_aemet` (clé AEMET), `do_imgw`, `do_chmi`, `do_ghcn` (Italie, Portugal, Slovaquie ; `--sans-ghcn`)), adresses en constantes en haut, reprise par étape (`work.done`), une source qui échoue est sautée (`europe_sources`, `--sources-europe`) ; + 20CR (1836–1939, lu par OPeNDAP seulement sur la boîte `BOX_EUROPE`) et ERA5 (toutes les heures). `meta.station_countries` ; `meteo_status` donne `station_countries`, `sources`, `c20` (M5) ; chaque source a sa mention dans `sources` (M10, `METEO_SOURCES_INFO`). Lecteurs testés hors ligne sur `tests/fixtures/meteo/europe/` (un fichier au format réel par source).
- **Altitude d'un lieu** : `places.altitude` (migration 64 ; NULL = automatique). `meteo_day` prend l'altitude saisie, sinon celle de la grille, sinon rien ; `res.alt = {m, from: 'saisie'|'carte'}`, `res.station.alt`. Le détail du jour dit « Station : Chamonix · à 6 km, 1 042 m — ton lieu ≈ 1 014 m » et propose « ⛰ Altitude du lieu » (fenêtre 540). La case « Altitude » (K17, unité « m » dans la case, « ≈ 312 m (carte du relief) » en gris tant qu'elle est vide, « ↺ Remettre l'altitude de la carte ») est aussi dans la monographie de la commune (Graphiques → Lieux, `ext.meteo.placeAltitudeInto`) ; GET `meteo_place&id`, POST `meteo_place_altitude {id, altitude|null}` (journal des modifications, H7 « ↶ Annuler »).
- Test : `tests/test-meteo.js` (API + navigateur, `SHOTS=dossier`) et `tests/test_meteo_builder.py` (le fabricant hors ligne, sur `tests/fixtures/meteo`).
- Pas encore fait : la phrase toute prête dans le texte de la biographie  ; « 🗺 Voir sur la carte » ouvre une petite carte (lieu, station, carreau) dans une fenêtre plutôt que l'onglet Carte.

## 🐾 Suivi des animaux (lib/suivi.php, lib/suivi_share.php, app-suivi-core.js, heritage-suivi.js, heritage-suivi-fiche.js, heritage-suivi-partage.js, suivi.css)

Maquette validée : `docs/design/animaux-suivi.html` (S1 à S19). Pour tout animal (une fiche de `pets`, Listes → Animaux), sauvage ou de la famille : marques, observations, points GPS, santé, sites et comptages, groupes sociaux.

**L'onglet** `suivi` (« 🐾 Suivi des animaux », `modules` d'app.js, bouton `data-module="suivi"` d'index.php) est **caché au départ** comme 🧬 ADN (`menuHiddenKeys` : `genealogie-menu-suivi`). La phrase « Tu suis des animaux… ↗ Afficher l'onglet » (liste des animaux, onglet Marques) : `ext.suivi.hintInto(hôte)` (une fois, `genealogie-suivi-hint-closed`), « ↶ Annuler » par `undoLocalChange`.

**Un seul moteur de widgets** : l'onglet Suivi est rendu par `renderDashboard` (app-tableau-de-bord.js) dans un deuxième **espace** : `dashboardSpace()` vaut `'suivi'` quand `state.module === 'suivi'` ; ses pages sont gardées dans `genealogie-suivi-blocks` (même forme que `genealogie-dashboard-blocks` : `pages`, `defaultPage`), la page affichée dans `state.suiviPage`. `dashboardSpaceDo('', f)` fait `f` dans l'espace du tableau de bord (« 📌 Mettre aussi dans le tableau de bord »). Les deux espaces ont le **même catalogue** (`defaultDashboardBlocks`) : la colonne du Suivi montre d'abord les blocs `sv_…` puis « Autres widgets de l'app » ; celle du tableau de bord met les `sv_…` dans la rubrique « 🐾 Suivi des animaux ». Disposition de départ (S2) : `ext.suivi.defaultPages()`. Une page a en plus `icon` et `filter: {species, taxon, site, siteTitle}` (S15) : tous ses blocs s'y règlent, sauf ceux qui ont leurs propres animaux.
- Blocs (`ext.dashboard.sv_*` : `load` = `api('suivi', {op: 'overview'})` gardé 3 s, `render`) : `sv_map`, `sv_recent`, `sv_animals`, `sv_gps_day`, `sv_stats`, `sv_counts`, `sv_missing`, `sv_find`, `sv_import`, `sv_meteo` (grisé sans `LCNDA_EXT.meteo` ; `meteo_point`, `ext.meteo.look` / `badge`), `sv_health`, `sv_groups`. Titre préfixé de 🐾 dans le tableau de bord.
- Réglage d'un bloc (✎) : `ext.dashboardConfig.sv_*` (`html`, `read`) ; pour les `sv_…`, K2 : chaque changement est gardé tout de suite (pas de bouton « Enregistrer », « ✓ Enregistré », « ↺ Remettre comme au départ » avec ↶ Annuler).
- `ext.suivi.headerHtml(page, pages)` (K5 + boutons des pages C5 `data-dash-page`, ⋯ de la page, clic droit, glisser) et `ext.suivi.afterRender(ws, {space, page})` (cartes, recherche, import, météo, ⋯ d'un bloc : Régler, ⛶ Voir en grand, ⧉, 📌, 📄 Copier vers une autre page, 🗑) appelés par `renderDashboard`.

**Tables** (migration 65, `suivi_schema`) : `animal_profiles` (pet_id, taxon, profil de marques, baguage, maison, uuid), `animal_marks` (sorte, code + `code_norm`, `colors_json` = `{L: [haut, bas], R: [haut, bas], single}` chaque bague `{color, name, code, code_color, metal}`, dates, photo), `animal_observations` (pet_id NULL possible, date C4 + `obs_iso`, heure K17, lat/lon, lieu, site, comportements, nombre, `with_json`, **`reading_raw`** « 7[K|X] » + **`reading_json`** `{chars: [['7'], ['K','X'], null…], colors, number}`, `reliability` full|partial|colors|doubt, observateur, source manuel|gps|piege|mer, `sea_json`), `animal_gps` (compacte : pet_id, t, lat, lon, alt, import_id ; UNIQUE(pet_id, t)) + `animal_gps_imports`, `animal_health`, `track_sites` (+ `outline_json`) / `track_counts`, `animal_groups` / `animal_memberships` (rôle, entrée : entree|naissance|transfert|role|fondateur, sortie : depart|exclu|mort|transfert|role|inconnu), `suivi_receipts`. Une fiche d'animal supprimée : `suivi_forget_pet` (les observations restent, sans animal).

**API** : GET `suivi&op=overview|animal|gps|site|group|imports|share` ; POST `suivi_write {op}` dans `handle_write` (transaction, mode consultation refusé) : `save_profile`, `create_animal`, `save_mark`, `save_obs`, `save_health`, `save_site`, `save_count`, `save_group`, `save_member` (`transfer_to`, `new_role` créent la ligne suivante), `delete` (ligne entière au journal, `restore_last_delete` la remet : sortes `animal_mark`, `animal_obs`, `animal_health`, `track_site` (+ comptages), `track_count`, `animal_group` (+ appartenances), `animal_member`), `gps_import` (paquets de 5 000 points), `gps_undo`, `share_analyze`, `share_apply`, `share_undo`. Menu de choix : sortes `pet` (🐾, cherche aussi les codes de bague et les n°), `tsite` (🏞), `agroup` (👥).

**Le moteur** `window.LCNDA_SUIVI` (aussi `require()` dans Node) : `RING_COLORS` (14 couleurs de base ; toute autre couleur par C2, ramenée à la plus proche par `colorKey`), `PROFILES` (marques, comportements, causes et façon de retrouver l'animal selon l'espèce ; `guessProfile` = même règle que `suivi_guess_profile`), `parseReading` / `formatReading`, `scoreCode` (sûr 1, doute entre n : 1 − 0,15 × (n − 1), pas lu 0,5, faux = exclu), `scoreNumber` (n° en partie : « 250 26 9… », « …4471 »), `scoreColors` (pattes inversées × 0,75), `candidates` (couleurs 55 %, code 45 %, distance au dernier endroit vu, pas revu depuis 6 mois), `reliability`, `comboText` (« G V/M · D R/B « 7K » »), `hull` (zone fréquentée, km²), `thin`, `splitTrips` (couper en nuits), `farthest`, lecteurs **écrits à la main** `parseGPX`, `parseKML`, `parseGeoJSON`, `parseCSV` (Movebank en UTC, colliers Tractive / Weenect / Invoxia / Kippy, « ; » et virgule décimale), `parseTrack` (40 Mo, 500 000 points au plus ; XML avec DOCTYPE ou ENTITY refusé), exports `toCSV` (formules neutralisées), `toMovebank`, `toGPX`, `toKML`.

**Écrans** : la fiche complète d'un animal porte le suivi en blocs (🔖 Bagues et marques / Marques · 👁 Observations · 🩺 Santé · 👥 Groupe · 🗺 Carte / Trajets, voir « Sections des fiches et fiche animal unique ») ; `ext.suivi.openPet(id, tab)` ouvre la fiche sur le bon bloc. Listes → « 🐾 Recensement » (`ext.lists.recensement` : onglets Observations / Animaux suivis / Sites / Groupes, `UI.listBar`, fiches site `state.svSite` et groupe `state.svGroup`). Fenêtres : `openObservation({petId, obs, siteId})` (S7), `importGps({files, petId})` (K13), `openHealth` (S18), `memberDialog`, `siteDialog`, `groupDialog`, `openBigMap`, `openStats` (⤓ Exporter ▾ : CSV, Movebank, GPX, KML, « 🧾 Ouvrir dans le tableur » par `ext.openRowsInSheet`). Carte : `ext.suivi.U.mapView(hôte, {series, polygons, home, wheel, onClick})` (fond de carte de l'app `mapTileUrl`, glisser, ＋ −, ⤢) et `replayBar` (▶ Rejouer). Clics communs par attributs `data-sv-pet`, `data-sv-obs`, `data-sv-site`, `data-sv-group`, `data-sv-new-obs`, `data-sv-import`, `data-sv-share`, `data-sv-receive`…

**Plusieurs médias par observation** (migration 66) : `animal_observations.media_ids` (« 12,40,7 », 40 au plus, `suivi_media_list`) ; `media_id` reste = le premier (lecture d'avant). Fenêtre : `mediaField({name: 'media_ids', multiple: true})` ; affichage : `ext.suivi.U.obsMediaHtml(o)` (3 vignettes + « +N », remplies toutes seules, clic = visionneuse sur la série). Paquet partagé : `medias` (toutes les clés) + `media` (la première, pour une app d'avant) ; à la réception l'un ou l'autre (`suivi_share_media_keys`).

**📤 Partager et fusionner** (`lib/suivi_share.php`, `heritage-suivi-partage.js`) : `op=share` (une fiche, des animaux, une espèce, un site, tout) → `{format: 'lcnda-suivi', version: 1, animals, sites, groups, free_observations, media}` ; le navigateur fait le « .lcsuivi » avec `LCNDA_SHEET.makeZip` (suivi.json, medias/, LISEZ-MOI.txt) et le relit avec `LCNDA_SHEET.unzip`. Identifiants stables : colonne `uuid` des tables du suivi (`animal_profiles.uuid` pour l'animal), donnés au premier partage. Jamais les propriétaires ; observateurs, bagueurs, soigneurs seulement avec `names=1`. Réception : `share_analyze` (paquet remis d'aplomb par `suivi_share_clean`, bornes `SUIVI_SHARE_MAX`) → animal reconnu par uuid, sinon par une marque (même sorte, même code) ou la puce ; champs différents = conflits, lignes de même uuid modifiées = conflits, doublons exacts écartés (`suivi_sig`). Écran de fusion (classes `merge-*` de « Fusion de doublons ») : « Garder le mien / Prendre le sien / Garder les deux », « Tout garder le mien / Tout prendre le sien », « N conflits restants ». `share_apply` garde ce qu'il ajoute et ce qu'il remplace dans `suivi_receipts` ; `share_undo` remet tout ; journal « Suivi des animaux reçu de … le … ». Les médias reçus entrent dans les Médias (`importMediaFile`) et y restent après « ↶ Annuler ».

- Test : `tests/test-suivi-animaux.js` (moteur, serveur, navigateur ; `SHOTS=dossier`), fichiers d'essai `tests/fixtures/animaux/`.
- Pas fait : le fichier GPS d'origine n'est pas rangé dans les médias de l'animal ; la photo-identification compare à l'œil (photos de référence sur les marques), sans reconnaissance automatique.

## 📄 Documents et 🎨 Catalogue raisonné : deux onglets du haut (lib/onglets.php, heritage-onglets-documents.js, heritage-onglets-catalogue.js, onglets.css)

Maquette : `docs/design/onglets-documents-catalogue.html`. Deux modules (`documents`, `catalogue`) **cachés au départ** comme 🐾 Suivi et ✨ Trésors (`menuHiddenKeys` : drapeaux `genealogie-menu-documents` / `-catalogue`, posés quand on enregistre l’ordre du menu). Faits comme Personnes : la liste dans la colonne (`.side-menu-item`, `data-no-reorder`), la fiche à droite. Rien de nouveau dans la base.
- **Lecture** : `GET api.php?action=onglets&op=documents|document&id=N|artists` (lecture seule ; lettres scellées et, en consultation, personnes vivantes ou confidentielles jamais nommées ; leur catalogue n’est pas proposé).
- **📄 Documents** = les médias. Barre H10 (`lcnda-listbar:onglets:documents`), « A → Z | 📁 Dossiers », lettres repères ; dossiers = `LCNDA_SIDE_FOLDERS`, kind `document` (même clé `genealogie-side-folders` que Graphiques, glisser, « 📁 Ranger », ↶ Annuler). Fiche : `UI.pageHeader`, image (taille d’impression), description, transcription (→ traitement de texte), personnes, rattachements ; « ✎ Modifier » = la visionneuse des médias (`openLightbox`, lecture seule en consultation). Adresse `#documents/12`.
- **🎨 Catalogue raisonné** = les fiches du moteur des Artistes (`ART.Store`, `ART.readHtml`) ; artiste par le menu de choix ; « Classer : » albums (pistes, faces), chansons (`songsOf` : morceau ← enregistrement ← piste, sinon même titre), label, genre, période (périodes de l’artiste, sinon décennies), technique, lieu de conservation, n°, année, A → Z, sorte. Réglages par artiste : `genealogie-catalogue-tab` ({pid, by, open, periods}). « ✎ Modifier » ouvre le catalogue complet (`ART.open`). Adresse `#catalogue/45/301`.
- Test : `tests/test-onglets-documents-catalogue.js` (`ONGLETS_SHOTS=dossier` pour les captures).
- Pas fait : champs d’archives en plus sur un média (support, dimensions, état, fonds › série › article), message « Tu as beaucoup de documents ? » dans Listes → Médias, usage « Archives ou musée » au premier lancement (pas d’écran de premier lancement), classement « 📁 Mes dossiers » dans le catalogue.

## ✍️ Accord des mots avec la personne (`app-accord.js`)

- **Une seule aide** : `LCNDA_APP.accord(qui, mot, {before, x})` (= `LCNDA_ACCORD.accord`, aussi pour Node). `qui` = une fiche (personne : `.gender` ; animal : `.sex` `'M'`/`'F'`) ou directement le sexe. `mot` = le texte d’avant avec « (e) » (« Né(e) le », « non crédité(e) », « Mort(e) pour la France ») ou `{m: 'il', f: 'elle'}`. `before` = ce qu’on écrivait avant pour les fiches ni homme ni femme si ce n’était pas « (e) » ; `x` = la tournure sans accord (« Naissance le », « Décès »).
- Homme / mâle → masculin, femme / femelle → féminin ; les autres suivent **Réglages → Thème et couleurs → « ✍️ Accord des mots »** (K2) : `localStorage['genealogie-accord'] = {other, unknown}` avec `avant` (départ : rien ne change), `f`, `m`, `point` (« né·e »), `paren` (« né(e) »), `neutre` (`x`, sinon « né(e) »). Clé dans `SITE_DEFAULT_KEYS`, `site_defaults_allowed_keys`, `LAYOUT_KEYS` (💾 Réglages enregistrés).
- `lifeText(status, gender)` passe par `LCNDA_ACCORD.life` (« Vivant », « Décédée », « En vie », « Décès »…).
- **Jamais** « né(e) », « décédé(e) »… écrits en dur quand la fiche est connue, ni `${p.gender === 'female' ? 'e' : ''}` fait à la main ; quand le texte parle de personnes en général (FAQ, aides, en-têtes de colonnes, critères), une tournure sans accord (« Lieu de naissance », « Naissance entre », « personne décédée »). Test : `tests/test-accord-genre.js`.

## L3 — 🕘 Une seule fenêtre « Versions » (app-versions.js, versions.css)

Partout où il existe des versions, la même grande fenêtre (K6, 1040) : `UI.openVersions(o)`. Accès : **Fichier → 🕘 Versions…** dans chaque éditeur E1 (traitement de texte, Mon site web, retouche, Studio son, montage) ; « 🕘 Versions… » sous la photo / le son dans la retouche rapide, le son rapide et l’ancien éditeur du son ; « 📸 Instantanés » dans un tableau.

```js
UI.openVersions({title, tool, kind,                        // kind : 'text' | 'site' | 'image' | 'audio' | 'video' | 'board'…
    list: async () => [{id, label, created_at, auto, info, infoAsync, by, locked, shown, badge}],
    now: {info, hint} | () => ({…}) | false,               // la ligne « Maintenant » (K8 « EN COURS »), toujours en haut
    preview: async v => ({text} | {html} | {src, kind}),   // v = null : maintenant ; html = page isolée (iframe sandbox="")
    keepNow: async label => …,                             // garde l’actuelle (auto) avant « ↺ Revenir »
    restore: async v => ({undo, redo}), rename: async (v, nom) => …, copy, exportOne,
    remove: async v => ({undo}) | ({undo, commit}),        // commit = suppression pour de bon quand le message H7 part sans « Annuler »
    saveNow, actions: [{icon, label, when(v), run(v, fenêtre)}]});
UI.openMediaVersions(media, {kind, tool, onShown(fichier, versions), actions})   // table media_versions (retouche, son, montage)
UI.versionsDiff(a, b)   // {left, right, added, removed, same} : mot à mot, <del> à gauche, <ins> à droite (aussi dans Node)
```

- Filtres C5 « Tout / ✎ Nommées / 🕘 Automatiques » avec le nombre ; liste rangée Aujourd’hui · Cette semaine · Plus ancien ; dates K4 ; une ligne utile (mots, pages, taille en pixels, durée, éléments).
- Clic = aperçu à droite ; deux cases cochées = comparaison dessous (texte barré rouge / ajouté vert ; deux formes de son + 👂 A / ✨ B au même endroit ; image avec un trait à glisser, ← → au clavier).
- « ↺ Revenir à cette version » sans question : `keepNow` garde d’abord l’actuelle (version automatique « Avant le retour à « … » »), puis H7 « ↶ Annuler ». ⋯ et clic droit : ✎ Renommer, ⧉ En faire une copie, ⤓ Exporter, 🗑 Supprimer (H7). « Fermer » seul en bas. ↑ ↓ Entrée Espace dans la liste.
- Serveur : colonne `auto` ajoutée d’elle-même à `text_document_versions` et `website_versions` (`textdocs_schema`, `website_schema`) ; POST `rename_textdoc_version`, `rename_website_version`, `rename_board_snapshot`, `retouch_rename_version` (nom non vide, borné ; l’original d’un média garde son nom). Une version de média supprimée ne part qu’à la fin du message (« ↶ Annuler » la garde).
- Nommée / automatique : texte et site = colonne `auto` ; média = libellé d’origine (« Original », « Retouche 3 — 12/10/2026 ») = automatique, renommé ou avec une note = nommée ; tableau = « ⏱ … » ou « Avant le retour à … ».
- Test : `tests/test-harmo-l3-versions.js`.

## L4 — 🔣 Grille d’icônes (app-icones.js, styles dans app.css)

Dès qu’un choix dépasse 12 icônes (ou 12 fonds), une grille au lieu d’un long menu déroulant ; en dessous de 12, le petit menu reste.
- **La fenêtre** : `UI.iconPicker({anchor, items, groups, value, emoji, allowNone, noneLabel, title, what, kind, recentKey, onPick(v, item)})` — case C1 en haut (`UI.searchField` : nom + mots en plus, ×, Échap, « / »), pastilles C5 `.ui-filters` avec le nombre (« Tout (75) », « 🕘 Récentes », puis les rubriques ; « 😀 Tous les emojis » en dernier quand `emoji: true`), récentes d’abord quand la case est vide (`genealogie-recent-icons`, une liste par jeu, partagée par tous les outils ; « emoji » pour toutes les cases d’émoji), vignettes 74 px (icône + nom), 104 px pour les fonds (`kind: 'bg'`, image `img`), ↑ ↓ ← → / Entrée / Échap, « Aucune icône » quand `allowNone`. Posée dans la fenêtre ouverte s’il y en a une, sinon sur la page ; à 390 px elle prend la largeur de l’écran.
- **Un élément** : `{v, g (le signe), l (le nom), k (mots en plus), grp, sub (petite ligne), img}`. Les émojis ont leurs noms français (`UI.emojiName`, recherche « coeur », « bateau », « chien ») ; les groupes viennent de `ext.EMOJI_GROUPS` (heritage-more.js). Une icône collée dans la case (n’importe quel émoji) donne la vignette « Utiliser « … » ».
- **Choisi → la pastille du menu de choix** (`.pk-chip.ui-icf-chip` : icône ou vignette, nom, rubrique, « ✎ Changer », « × » si on peut s’en passer). Habillage tout seul, rien à appeler : `<select data-ui-icons="event">` (types d’événements), tout menu des fonds de carte (`mapBackgroundSelectHtml`, reconnu à ses options), `<input class="h-be-icon">` / `.h-fi-iconin` / `<input data-ui-icon="jeu">` (les anciens boutons « Choisir un émoji… » à côté sont cachés). Le menu ou la case d’origine reste dessous, caché, avec son `name` et ses écouteurs : `change` et `input` partent comme avant, `champ.value = …` met la pastille à jour. `data-ui-off` sur un parent : pas d’habillage (les Trésors gardent leurs menus).
- **Un jeu propre à un outil** : `UI.registerIconSet('ms-tiles', {items, groups, emoji: false, title})` puis `UI.iconFieldHtml({name, value, set: 'ms-tiles', allowNone, attrs})` (ou `UI.iconField({...})` → l’élément). Jeux fournis : `event` (rubriques Vie et famille, Religion, Travail, Voyages, Temps, Formes, Artistique + mots), `mapbg` (vignettes de tuiles centrées sur la région du fond), `emoji`, `ms-tiles` (gros boutons du mode simple), `oe-types` (types d’œuvres), `ar-types` (sortes de fiches).
- `ext.pickEmoji(input, onPick, opts)` ouvre la même grille (`UI.pickEmojiGrid`) : sections des fiches, Fiches, Recueils, Atelier, animaux… gardent leur appel.
- Test : `tests/test-harmo-l4-icones.js`.

## L6 — 🔍 Chercher dans une page des Réglages (app-reglages-recherche.js, styles dans app.css)

Un seul code, accroché tout seul aux pages du module `maintenance` (aucune page n’a à l’appeler) : une page de plus de 20 lignes ou de 4 cadres reçoit la case C1 sous l’en-tête K5 (après ses onglets s’il y en a), `position: sticky` en haut.
- **Ce qu’elle lit** : les cadres (`.maintenance-panel`, `.person-block-config`, `details`, `fieldset`, `.card`, `.help-letter`…, les plus petits ; les grands cadres qui les entourent se replient quand il n’y reste rien), leurs titres, et les lignes (`tbody > tr`, `label`, `.ui-toggle`, `.checkbox-line`, `li`, `.order-row`, `.help-term`, `article`, `p`…) ; les menus déroulants et les pastilles d’icônes ne comptent pas. Une touche (« ⌘P », « ctrl p », « F1 ») cherche dans les `kbd[data-k]`.
- **Ce qu’elle montre** : lignes trouvées (trait jaune à gauche, lettres surlignées `mark.ui-l6-mark`), rubriques « 2 sur 22 » (`.ui-l6-count` dans le titre du cadre ou la ligne `th` d’un `tbody`), `details` ouverts au besoin, cadres sans résultat remplacés par une seule ligne grise « ▸ A · B · N autres cadres — rien ici » (clic = tout montrer) ; « N lignes · N cachées · Tout montrer » (« réglages » si les lignes sont des réglages) ; rien trouvé : `.empty-line` K10 « Rien pour « … » dans cette page. » + « 🔍 Chercher dans tous les Réglages » (le mot passe dans `.mt-search` de la colonne).
- **Touches** : « / » y va (avant la case de la colonne), Échap et × vident. La recherche est gardée quand la page se redessine (un réglage changé), vidée quand on change de page ou d’onglet de page.
- Une page qui a déjà sa propre case de recherche hors cadre (FAQ, Contrôle, Journal…) n’en reçoit pas ; `data-l6-off` sur `section.page` pour l’éviter. On cache en style dans l’élément (`display: none !important`), remis comme avant en vidant la case.
- `LCNDA_UI.settingsSearch.apply(mot)`, `.clear()`, `.state()` pour les tests. Test : `tests/test-harmo-l6-recherche.js`.

## ☢ Le bunker : succès, scénarios historiques, matins gardés, plans à trouver, région, groupes, bâtiments, apprentis, couples, souvenirs, transports (heritage-bunker-moteur.js, heritage-bunker.js, bunker.css)

Le jeu caché de la pièce d’archives garde son écran d’aventure (L2). Le moteur reste sans écran (`window.LCNDA_BUNKER`, testé dans Node).
- **🏆 Succès** : `ACH` = `[clé, icône, nom, ce qu’il faut faire, caché, test(g)]` ; `checkAch(g)` tourne une fois par heure de jeu (et à la fin), note `g.ach[clé] = jour`, écrit « 🏆 Succès : … » dans le journal et pousse la clé dans `g.achNew`. L’écran vide `achNew` (`noteAch`) : le premier gain sur cet ordinateur s’annonce en H7 et se garde avec sa date (K4) dans `localStorage['lcnda-bunker-records']` = `{ach: {clé: {at, who, scen, day}}, best: {partie: {days, pop, tot, scen, diff, at, name, city, over, won}}}` (les 30 meilleures). Clé « lcnda- » comme les parties : les clés « genealogie-… » sont recopiées dans la base par `save_settings`, celle-ci jamais. Un scénario se gagne en tenant `SCEN_GOAL[scen]` jours (`g.won`), on peut continuer ensuite.
- **📜 Scénarios historiques** (`SCENARIOS` h1709, h1720, h1870, h1910, h1940 ; `HIST` = date, époque, ville, mots de la région, saison, phrase de fin ; `ERAS` = électricité, crieur, objets / ressources / bric-à-brac / lieux / documents d’une autre époque, noms d’époque). `histPool(scen, personnes, lieux)` choisit les ancêtres vivants à la date (nés avant, morts après, ou âge ≤ 85 sans décès ; 8–95 ans) — jamais `living`, `priv`, ni `sh` (vivant probable) — ceux de la région d’abord ; `newGame({scen, me, team, want})` complète avec `invent(g)` (habitants inventés, `inv: true`) et le dit dans le journal. Sans électricité : `crieur` + `cheminee` à la place de la radio et du groupe, `lit(g)` fait marcher l’atelier à la main, `radio()` passe par le crieur (📯). Noms d’époque pour l’écran : `resInfo`, `placeInfo`, `toolInfo`, `fixedName`, `resList`, `dateOf`. Tout nouvel objet électronique porte `power`, `elec` ou `modern` : `itemOk` le retire des époques qui ne l’ont pas.
- **⏪ Matins gardés** : `morningSave(g)` à 6 h (les `MORNINGS` = 7 derniers, chaque copie ≤ 400 Ko, le tout ≤ 1,5 Mo, sans le journal entier) ; `rewind(g, jour)` rend une nouvelle partie (celle d’avant intacte : l’écran la garde pour « ↶ Annuler »), `g.rewound` compte les retours (succès « Sans jamais revenir en arrière »). Dans l’écran : « ⋯ » de la barre du haut (Reprendre au matin, Succès et records, Livre, Exporter) et la fin de partie. Si le navigateur manque de place, `saveGame` retire d’abord les matins des autres parties, puis n’en garde que 3.
- **🔨 Plans à trouver** : chaque plan en plus a `where` (les lieux où il vient surtout) et parfois `rare` ; `pickPlan(g, liste, sorte)` les pèse (×3 dans son lieu, ×0,4 ailleurs, ×0,25 s’il est rare) ; les lieux retrouvent parfois un carnet de plans le matin. Effets lus par le moteur comme les autres (`prod`, `fun`, `aura`, `healK`, `defense`, `rain`, `travelK`, `carry`, `talkie`), plus `warm` (édredons), `cook` (four solaire, dans `canCook`) et la turbine (`elec`, électricité quand il pleut).
- **🗺️ La région et les convois** : `makeRegion(g, noms)` dessine 8 lieux (`REGION_KINDS` : ville, village, ferme, dépôt, abbaye, mine, forêt, port ; noms d’époque `REGION_OLD`) autour du bunker (50, 50), reliés par des routes `{a, b, len (heures), danger 0–3, terr route|chemin|rive}` ; les noms de villes viennent de l’arbre (`regionNames` : naissances et décès des ancêtres qu’on peut montrer). Terrain du jour : `roadTerrain` (neige l’hiver, boue sous la pluie). `regionPath(g, dest, sûr)` (Dijkstra), `convoyPlan` (heures, jours, provisions pour les habitants et les bêtes `BEAST_NEED`, pire danger, terrains), `formConvoy(g, {dest, who, pack, veh, beasts, tools, goal, safe})` (les partants passent en `where: 'convoi'` : `atBase` ne les compte plus, `onRoad` les fait boire et manger dans `c.pack`). Chaque heure, `convoysHour` : au bout d’une route (`arrive`) embuscade, accident, retard, trouvaille, rencontre, nouvelles par `radio()` ; sur place 10 h (`atDest` : fouiller, commercer, aider, attaquer ; plans, outils, recrues, bêtes) ; au retour (`returnConvoy`) tout rentre ; sinon `lostConvoy` (véhicules, bêtes, outils perdus). `recallConvoy` fait demi-tour, `convoyAt` donne la position pour la carte (SVG dessiné par l’écran, aucun fond en ligne).
- **🤝 Les groupes** : `makeGroups` (voisins amis, marchands, 1 ou 2 bandes ; une bande rend ses routes plus dangereuses), `rep` de −100 à 100 (`REP_L` → `UI.badge`), `repAdd` écrit le changement de palier au journal. La trappe : le marchand d’un groupe fait un prix selon la réputation (`v.g`), « voler » (−35, les autres −8) ; les pillards d’une bande (force `str`, `calm` deux jours après avoir payé) ; `hostility(g)` augmente les coups à la trappe et la part des pillards. `groupsHour` : demandes d’aide (`g.asks`, `answerAsk`), aide des alliés quand ça va mal (livrée par `market.deals`), `giftGroup`, `buyBeast` (il faut `msgOk` : radio et courant, crieur, talkies ou pigeons). Le marché de la radio prend ses offres chez les groupes (meilleur prix, livraison sûre au-dessus de 30).
- **🏚️ Les bâtiments** (`SITES`, noms d’époque `SITE_NAMES`, états `SITE_STATE` ruine / chantier / marche / abime) : `makeSites` les pose sur des cases libres du plan ; `startSite` (matériaux ; un tiers pour réparer), `sendSite(g, id, site, 'travail'|'recolte', heures)` (un `exp.site` : `siteTrip` remplace la fouille), `sitesDay` à 6 h : production (3 jours au plus en attente), pillage si personne n’est passé (moins avec `fenceSite`, ou si quelqu’un y était dans les 24 h), usure.
- **🎓 L’apprentissage** : `canTeach` (×1,4, ou 60 ans et ×1,25), `setApprentice(g, maître, apprenti, compétence)`, `apprentices` chaque soir (+0,035 × maître/1,5, jamais au-dessus du maître ; une ligne par semaine), `masterDied` (le savoir reste ; après 2 semaines, jusqu’au niveau du maître −0,15). **💞 Les couples** : `couples` (entente ≥ 30, `canPair` : adultes, pas de la même famille d’après l’arbre ni parents, écart ≤ 20 ans, pas déjà en couple), séparation sous −10 ; `family` ne fait naître un bébé que dans un couple ; `teamK` (amis ou couple au même travail +10 %, ennemis −15 %).
- **🧓 Souvenirs des ancêtres** (option `souvenirs`, allumée dans le formulaire de départ) : l’écran passe `mem` = `{pid: {occ, by, bplace, my, mplace, spouse, kids: [années]}}` pour les ancêtres qu’on peut montrer (jamais `living`, `priv`, `sh` ; conjoint et enfants seulement s’ils sont montrables) ; le moteur les garde dans `g.memBank` (`cleanMem` retire tout ce qui est marqué vivant ou confidentiel) et `mkPerson` les donne à un habitant tiré de la base (jamais à un inventé). `souvenirAt(g, p, {kind: 'city'|'node'|'site', …})` : métier (`MEM_LINK`), ville natale, lieu de mariage, maison natale → une fois par sujet, 8 au plus ; `memTale` n’utilise dans un scénario historique que ce qui s’est passé avant la date ; journal (« histoire ») + `g.bubbles` (l’écran les montre 14 s).
- **🚚 Transporter** : `WEIGHT` (eau, métal ×1,5 ; tissu, plantes ×0,5 ; médicaments ×0,3 ; bric-à-brac 2) — `loadOf`, la fouille et les convois comptent en poids. `TRANSPORT` : `perso` (sacs à dos, hotte, malle : s’ajoutent), `veh` (un seul par sortie, le meilleur libre pour le terrain : `t` = facteur par terrain, `wear` = usure par sortie), `bats` (+5 par âne), `rails` (chariot de mine : `layRails` vers un lieu à 4 cases au plus, trajet ×0,5, +30 seulement là). Bêtes de bât : `PETS.ane` / `cheval` (`BEASTS`), blessées (`a.hurt`) elles ne portent plus ; la carriole emmène son cheval (`withPet`). `cityTerrain` (rues inondées en 1910 et pendant les inondations, neige l’hiver, boue sous la pluie), `freeTransports`, `bestTransport`, `carryOf(g, p, {terr, place, only})`, `wearVeh` (à 100 : `breakItem`, réparer demande un établi). En convoi, chacun porte ×2 (gros sac) + les véhicules et bêtes choisis sur le pire terrain du chemin ; les provisions comptent dans le poids.
- **Succès en plus** : expédition réussie, 5 expéditions, caravane (3 transports), bête de somme (un âne de 5 expéditions), alliés (réputation 60), bâtiment remis en état, la ville revit (3 bâtiments), maître et apprenti, le savoir transmis, un couple, un souvenir d’ancêtre. La gazette a « Sur les routes », « Les voisins », « La ville se relève », « Le carnet du cœur », « Les apprentis », « Souvenirs d’ancêtres ».
- **Vieilles parties** : `check` → `checkMore` donne une carte, des groupes et des bâtiments à une partie qui n’en avait pas (et le dit au journal), nettoie convois, demandes, apprentis, couples, bulles, usure, rails ; un habitant « en convoi » sans convoi rentre au bunker. Les matins gardés (`morningSave`) contiennent tout cela.
- Tests : `tests/test-bunker.js` (moteur) et `tests/test-bunker-plus.js` (navigateur : 1440, 390, sombre, aucune erreur, rien du bunker envoyé au serveur ; `SHOTS=dossier` pour les captures). Pour les tests seulement : `LCNDA_EXT.bunkerDebug` (`game()`, `redraw()`).

## ✍️ Lecture d’écriture manuscrite (HTR) : assistant, modèles, « ✨ Lire l’acte »

- **Réglages → Reconnaissance d’écriture (HTR)** (`ext.maintenance.htr`, heritage-more.js) : assistant en 3 étapes — ① le moteur (Kraken, Apache 2.0, dans un Python 3.11 tout prêt de python-build-standalone téléchargé une fois ; sinon le Python 3.9–3.12 de l’ordinateur, choix dans « Plus ▾ »), ② le modèle d’écriture (`config/htr-model-files.json` : source Zenodo, licence lue à la source, empreinte MD5 Zenodo ou SHA-256 vérifiée, notée dans `models/manifest.json`), ③ la vérification (`htr_recognize.py --check`). Avancement C7 (rond + barre), erreurs avec un code (`no_python`, `no_network`, `disk`, `pip`, `checksum`, `license`…) expliquées par ordinateur (`ext.htrErrorHelp(code, os)`), « 🗑 Retirer » un modèle avec « ↶ Annuler », « 🗑 Désinstaller… » (garder les modèles ou non).
- Serveur : `lib/htr_setup.php` (état, installation, désinstallation, lectures), `lib/htr_net.php` (seulement HTTPS et `HTR_ALLOWED_HOSTS`, aussi à chaque redirection ; taille bornée ; `htr_inside`, `htr_rmtree` qui ne suit jamais un lien), `scripts/htr_install.php` (en arrière-plan, `status.json` : state, step, pct, phase, code). Tout est rangé dans `SHARED_DATA_DIR/htr`.
- **« ✨ Lire l’acte »** (atelier de transcription) : `htr_read_start` → `scripts/htr_job.php` en arrière-plan (`DATA_DIR/htr-jobs/<id>`, effacé après 6 h) → `htr_read_job` (lignes, boîtes, confiance des mots ; « ■ Arrêter » = `htr_read_cancel`). Page entière ou zone choisie (« ✨ Lire cette zone »). Relecture : lignes à côté de leur morceau d’image, mots < 75 % surlignés, Entrée = ligne suivante ; « ✓ Mettre les lignes dans le texte » pose une zone par ligne puis lance « 🧭 Repérer ». L’ancien `htr_recognize` (texte seul, synchrone) reste pour la reconnaissance par lot.
- Tests sans vrai modèle : `GENEALOGY_HTR_SIMULATE=1` (installation et lecture simulées) ; `tests/test-htr.js`.

## ⤒ ⤓ Imports et exports « en plus »

- **Exports** (`lib/echanges.php`, `lib/export_gramps.php`, écran `assets/js/heritage-echanges.js`) : Réglages → Export → « ⤓ Vers d’autres logiciels et sites ». GET `export_gedcom&target=geneanet` (GEDCOM 5.5.1 UTF-8, `living=anon|drop`, lieux « [Lieu-dit] - Commune, INSEE, Département, Région, Pays », médias en liens, pas de balise `_`) ; GET `export_plus&format=gramps|gedcomx|ics|vcard|kml|geojson`. Les données passent par `echanges_dataset()` : mêmes règles que le GEDCOM « pour partager » (`gedcom_share_hidden`), `share`, `living`, mode confidentialité (`privacy=1`), branche (`branch_*`). Le nombre exporté est dans l’en-tête `X-LCNDA-Count` (et `X-LCNDA-Skipped`).
- **.ics** : une seule fabrique, côté serveur (`export_ics`, RFC 5545) ; la fenêtre `LCNDA_EXT.openIcsExport()` sert au Calendrier de la famille et aux Réglages. `LCNDA_APP.ics` reste pour un seul événement (📅 d’une fiche, rappels).
- **Listes** : `ext.listExportExtras(type)` ajoute des lignes au « ⤓ Exporter ▾ » des listes (Lieux → KML, GeoJSON ; Répertoire des vivants → vCard).
- **Imports** (`lib/import_autres.php`) : `echanges_intercept_upload()` (api.php) traduit un RootsMagic (.rmtree, .rmgc : SQLite ouvert en lecture seule, collation RMNOCASE fournie, tables vérifiées, 1 Go et 2 millions de lignes par table au plus) en GEDCOM avant « Importer un arbre », l’écran de départ, « Fusionner un arbre » et l’analyse ; un .ftm est refusé avec `FTM_MESSAGE`. Fabrique du fichier d’essai : `tests/fixtures/autres-logiciels/fabriquer-rootsmagic.py`.
- **« ⤒ Importer un arbre »** (Réglages → Import, `LCNDA_APP.importTree(files)`, `lib/imports.php`) : fenêtre K13 — étape 2 = POST `import_preview` (multipart : nombres, `producer` / `producer_label` d’après HEAD.SOUR, `notices`, `token` ; le fichier est gardé dans `DATA_DIR/cache/import-pending`, oublié après un jour), étape 3 = POST `import_pending {token}` (même code qu’`import_package`), puis H7 « ↶ Annuler » = POST `import_undo {token: undo}`. `import_package` rend aussi `undo` : un reçu (`import_receipt_begin` / `import_receipt_save`, plages d’identifiants par table dans `DATA_DIR/cache/import-receipts`) ; l’annulation est refusée si une fiche ajoutée ensuite s’appuie sur une fiche importée ; un lieu, une source, une étiquette réutilisés restent.
- **Gramps** (`.gramps`, `.gpkg`) : `gramps_dom` (XML sans ENTITY ; seul le DOCTYPE standard de Gramps, sans contenu, est retiré), `gramps_unpack_gpkg` (tar.gz lu à la main : fichiers ordinaires seulement, chemins sans « .. » ni absolus, 20 000 fichiers, 8 Go, bombe refusée), `gramps_to_gedcom` (→ GEDCOM 5.5.1 avec `_LABEL`/`_COLR`, `_FREL`/`_MREL`, `_PHOTO`, `ASSO`+`RELA` sous l’événement pour les témoins, `_ALTN` et `NOTE` sous `PLAC`) puis `import_gedcom_into_db` : un seul moteur d’import. Les médias ne viennent que du paquet (`gedimport_store_media(…, $baseDir)` : chemin relatif d’abord, jamais hors du dossier).
- **GEDCOM des sites** (`lib/gedcom.php`) : `gedcom_producer`, `gedcom_vendor_date` (« Abt. 1850 », « Bet. … and … », ISO, « Mar 12, 1850 »), `GEDCOM_VENDOR_EVENT_TAGS` (`_MILT`, `_DCAUSE`…), `_MTTAG`, `_APID` (lien Ancestry dans la citation), `_LINK`/`WWW`, `_MARNM`, `_AKA`, `_PHOTO`/`_PRIM` (portrait), `_UID` (gardé dans `unique_id`), `_FSFTID`, `RESN`, `ASSO` (témoins), `EMAIL`/`PHON` (note « Coordonnées ») ; un média `FILE https://…` n’est jamais téléchargé : note « 🔗 Médias en ligne ». Sans `PLAC.FORM`, un lieu de 5 morceaux ou plus d’Ancestry, MyHeritage, Gramps, FamilySearch est rangé depuis la fin (lieu-dit, commune, département, région, pays).
- **ADN** (`heritage-dna.js`) : un seul import K13 pour les correspondances et les segments (`DNA_FORMATS` : en-têtes d’Ancestry/DNAGedcom, MyHeritage, 23andMe, FamilyTreeDNA, GEDmatch ; colonnes modifiables dans « Colonnes reconnues ») ; « ↶ Annuler » = `undo_dna_import` (reçus de `import_dna_matches` et de `save_dna_segments` avec `receipt: 1`). Un fichier brut de SNP est refusé dans le navigateur (`isRawDna`) et par le serveur (`dna_is_raw_text`, noms « rs… » dans `import_dna_matches`). Fichiers d’essai inventés : `tests/fixtures/imports/`. Test : `tests/test-imports-gramps-ancestry.js`.
- Test : `tests/test-imports-exports-plus.js` (schéma Gramps : `tests/fixtures/autres-logiciels/grampsxml-1.7.1.rng`, avec xmllint).
- **GeneWeb (.gw)** (`lib/import_geneweb.php`, `geneweb_to_gedcom`) : lu d’après l’analyseur de GeneWeb (`gwcomp.ml`) — blocs `fam` (+date, #mp #mn #ms, #nm #eng #noment…, -divorce / #sep, `wit m:`, src, csrc, cbp, comm, `fevt…end fevt`, `beg…end`), `notes…beg…end notes`, `pevt…end pevt` (toute balise `#xxx`, #p #c #s, `wit: #godp …`, `wnote`, `note`), `rel…beg…end` (adoption, nourricier → famille ; parrain → ASSO), `notes-db` / `page-ext` (note à part reliée à la 1re fiche), `encoding: utf-8`, `gwplus` ; personnes « Nom Prénom.occ » (+ {alias}, #salias, (nom public), #image, #nick, #alias, [titres], #apriv, #occu, #src, naissance #bp #bn #bs, !baptême #pp #pn #ps, décès k/m/e/s/mj/od/0/?, #dp #dn #ds, #buri / #crem #rp #rn #rs) ; dates `gw_date` (~ ? < > .. | J F H, `0(texte)`). Un bloc illisible est sauté (comme `gwc -nofail`) et dit dans l’aperçu (`converted_warnings`). Un événement présent dans `pevt` / `fevt` remplace celui de la ligne principale (complété par elle). Bornes : 300 Mo, 8 millions de lignes ; base binaire `.gwb` refusée avec la marche à suivre.
- **GEDCOM-X** (`lib/import_gedcomx.php`, `gedcomx_to_gedcom`) : JSON et XML (sans DOCTYPE ni ENTITY, `gedcomx_xml_to_array` → même tableau que le JSON) ; un `.json` / `.xml` n’est traduit que s’il est reconnu (`gedcomx_sniff`), sinon l’analyse habituelle le prend. Couples → familles ; filiations regroupées par paire de parents (`AdoptiveParent`, `FosterParent`, `StepParent` → `_FREL` / `_MREL`) ; composantes de source → page ; `formal` → date GEDCOM (`gedcomx_formal_to_gedcom`), l’`original` français passe devant s’il se lit ; identifiants FamilySearch → `_FSFTID`, Wikidata → `_WIKIDATA`. L’export GEDCOM-X de l’app se réimporte compté à l’identique (test). Le paquet `.gedx` n’est pas lu (phrase claire).
- **Autres logiciels par leur GEDCOM** : `gedcom_producer` regarde d’abord la valeur de `1 SOUR`, puis son bloc (NAME, CORP), puis tout l’en-tête (Legacy dont le CORP est MyHeritage reste Legacy). Reconnus en plus : Family Historian, Ancestral Quest, Reunion, GenoPro, WikiTree, Geni, Ancestris, webtrees, Brother’s Keeper, PAF, GeneWeb, GEDCOM-X. Particularités (`gedimport_vendor_extras`, `lib/gedcom.php`) : `_WIKIDATA` / `EXID` (TYPE wikidata) → `persons.wikidata_id` ; `_PRIV` / `_PRIVATE` → confidentielle ; `_FLGS` (`__PRIVATE`, `__LIVING`, autres → étiquettes « Family Historian : … ») ; `_TAG`…`_TAG9` → étiquettes « Legacy : marque n » ; `_TODO` → note « À faire » ; toute autre balise `_XXX` simple de ces logiciels → note « Données propres à … ». Fichiers Mac aux lignes finies par `\r` : `CHAR MACINTOSH` compris. Fixtures : `tests/fixtures/autres-logiciels/*.ged` (une par logiciel), `geneweb-famille.gw`, `gedcomx-famille.xml`.
- **GenoPro (.gno)** : refusé (`GENOPRO_MESSAGE`) — XML zippé sans description publique fiable ; on passe par son export GEDCOM, reconnu.
- **⤓ Paquets avec les photos** (`lib/export_paquets.php`, GET `export_plus&format=gedzip|gpkg`, `&estimate=1` = taille, nombre de fichiers, `private`, `missing`, `too_big` avant) : **GedZip** `.gdz` = `gedcom.ged` (GEDCOM 7 écrit par `export_gedcom($pdo, $sink)` dans un fichier : `FILE media/…` encodé comme une adresse, `FORM image/png`) + `media/…`, fait avec **ZipArchive comme la sauvegarde complète** (photos rangées sans recompression) ; **paquet Gramps** `.gpkg` = tar.gz écrit à la main (`paquet_tar_add`, ustar + nom long GNU « L ») avec `data.gramps` (`export_gramps($pdo, $capture)`, `src="media/…"`) + `media/…`. Vie privée : « Pour partager » coché par défaut ; `echanges_media_touching` écarte tout média où figure une personne cachée (reliée, à son événement, à sa famille, repérée sur la photo, portrait) — aussi dans le GEDCOM « pour partager », Gramps et GEDCOM-X. Fichiers pris seulement dans le dossier des médias (realpath, pas de lien). 4 Go au plus. L’écran (`heritage-echanges.js`, `paquetOpen` / `paquetRun`) montre « ≈ N Mo — N personnes, N fichiers de médias » et ce qui est laissé de côté, puis télécharge sans garder le fichier dans la page. À l’import, `import_zip_guard` refuse aussi les chemins « ../ », absolus ou « C: » (dès l’aperçu).
- **🌐 Wikidata** (`lib/wikidata.php`, `assets/js/heritage-wikidata.js`, migration 73 `persons.wikidata_id`) : ligne « Wikidata » du bloc Références externes (`ext.wikidataRow`) : lien ↗, ✎ (POST `person_wikidata_set`, accepte « Q42 » ou l’adresse, H7 « ↶ Annuler »), « 🌐 Compléter depuis Wikidata » **seulement au clic** : le navigateur lit `wbgetentities` (CORS, `origin=*`, sans cookie ; 3 requêtes au plus : la personne, ses lieux et métiers, leurs pays), montre ce qui serait ajouté (naissance, décès avec lieu et coordonnées, sexe, métier, note avec description et liens Wikipédia / Commons) et ce qui est déjà sur la fiche (jamais remplacé), puis POST `wikidata_apply` (seulement les éléments cochés ; la naissance / le décès déjà datés ou placés, le sexe et le métier déjà remplis ne bougent pas ; source « Wikidata » + page « Q… ») → `wikidata_undo` (événements, note, lieux créés pour l’occasion, champs d’avant). Export : `_WIKIDATA` (5.5.1), `EXID` + `TYPE http://www.wikidata.org/entity/` (7), identifiant GEDCOM-X.
- Test : `tests/test-imports-exports-3a.js`.

### ⤒ Relevés, tableaux, références, lieux (`lib/imports_plus.php`, `app-imports-plus-core.js`, `heritage-imports-plus.js`)

Réglages → Import → cadre « ⤒ Relevés, tableaux, références, lieux » (`ext.importPlusPanel()`), et tout bouton `[data-import-plus="releves|people|sources|geo"]` (Dépouillements, Recherche › Dépouillement d’archive, Listes › Lieux). Toujours la fenêtre K13 ; l’étape 2 se règle dans la fenêtre (élargie en `modal-l`). Les tableaux (CSV, TXT, XLSX, ODS) sont lus **dans le navigateur** par `LCNDA_IMPORTS.readTable(LCNDA_SHEET, nom, octets)` (seul lecteur : `decodeBytes`, `sniffSep`, `parseCSV`, `readFile` + `matrix(…, {display: true})`) ; une case qui commence par `=`, `@`, `+lettre`, `-lettre` (`isFormula`) n’entre jamais : vidée et comptée ; 2 000 caractères par case, 50 000 lignes, 40 Mo ; un .xls ou un faux .xlsx est refusé. Le serveur revérifie tout (`ip_txt` : texte borné, formule vidée, Windows-1252 → UTF-8).
- **Relevés** (`prepareReleves`, `rowsToActs`, `releveGroups`) : Nimègue sans titres (première case « NIMEGUEV3 » : colonnes de `LAYOUT[N|M|D|V]`, comme l’export Nimègue v3 lu par ExpoActes, chaque ligne selon sa sorte), Nimègue avec titres (codes `P_NOM`, `C_PRE`, `T1_NOM`…), CSV d’un cercle (`FIELDS` : titres reconnus par leurs mots, sorte devinée par `typeFromHead`). POST `releves_check {acts, with_links}` → `already` (même texte d’acte déjà dans une transcription), `links[{a, p, candidates}]` (`ip_candidates` : nom replié identique, prénom, sexe, années compatibles selon le rôle) ; POST `releves_import {acts, links: {"a:p": {mode: link, id} | {mode: create, g}}, digest_id?}` : un `archive_digest_entries` par commune et sorte (`save_archive_digest`, « Baptême » avant 1793), une ligne de transcription par acte (`ip_act_text`), une `archive_digest_people` par nom cité (rôle dans `household_position`, « Acte 12 » dans `household_key`). Une fiche créée reçoit l’événement de l’acte ; une fiche reliée n’est jamais modifiée ; liens parent → enfant et couple (+ mariage) seulement entre fiches choisies ; un même `g` (personne citée dans plusieurs actes) = une seule fiche. ↶ = POST `releves_undo {token}` (lignes, personnes relevées, dépouillements créés, puis `import_undo`).
- **Tableau de personnes** (`PEOPLE_FIELDS`, `guessPeopleMapping`, `buildPeoplePlan`) : liens par n° de ligne, par nom (une seule ligne doit porter ce nom, sinon pas de lien), par Sosa (2n, 2n+1 ; sexe déduit) ; boucles retirées ; dates ISO ou nombres Excel → « jj/mm/aaaa ». POST `people_table_check {persons, families}` → `candidates[k]` ; POST `people_table_import {persons, families, same: {k: id}}` (reçu `tree`, ↶ = `import_undo`). « ⚠️ À décider » bloque l’import (UI.fail) : jamais de doublon silencieux.
- **Sources ↔ RIS / BibTeX** : POST `sources_refs_import {text, mode: check|run}` (lu par `atelier_parse_ris` / `atelier_parse_bibtex`, accents LaTeX, `_ty`, `_bt`, `sourcetype` ; doublons = même titre + même auteur repliés) ; GET `sources_export&format=ris|bib` (`sources_export_text` : TY ELEC/BOOK/MANSCPT/PCOMM/GEN, `CN` = cote, `N1` = texte ; BibTeX `callnumber`, `sourcetype`, `\&` …). Aller-retour vérifié champ par champ. L’Atelier exporte aussi `archive`, `callnumber`, `date`, `urldate`, `note` (et `DA`, `Y2`, `N1`, `ET` en RIS) et les relit ; RIS : lignes de suite des notes ; XML avec DOCTYPE / ENTITY refusé (`atelier_parse_any`).
- **Lieux KML / KMZ / GeoJSON** : POST `places_geo_analyse {text}` (`ip_geo_parse` : 20 Mo, 20 000 points, KML sans DOCTYPE ni ENTITY, `LIBXML_NONET`, GeoJSON profondeur 64 ; un KMZ est ouvert par `LCNDA_SHEET.unzip`) → points `same|add|differ|choose|create` (nom replié, puis département, pays, région ; les lieux cités par un événement d’abord ; `P<id>` du GeoJSON de l’app comme indice ; description « Commune, Département, Région, Pays » du KML de l’app). POST `places_geo_apply {items: [{action: update, place_id, lat, lon} | {action: create, …}]}` ; ↶ = POST `places_geo_undo {token}` (anciennes coordonnées remises, lieux créés retirés s’ils ne servent pas).
- Fixtures inventées : `tests/fixtures/imports-3b/`. Test : `tests/test-imports-exports-3b.js`.

### 🗒 Obsidian, 🕸 réseau familial, 🧬 DNA Painter / Genetic Affairs / LivingDNA, 📷 photos (vague 3c)

- **🗒 Obsidian** (`lib/echanges_reseau.php`, GET `export_plus&format=obsidian`, `&sources=0|1&notes=0|1`) : ZIP (ZipArchive) « Genealogie-LCNDA/ » : `Personnes/<Nom (années)>.md`, `Lieux/<Lieu-dit, Commune (Département)>.md`, `Généalogie.md` (accueil). En-tête YAML (tags, aliases, sexe, naissance, deces, sosa, generation, lcnda_id ; `location` pour un lieu). Liens `[[Nom]]` / `[[Nom|texte]]` vers parents, conjoints, enfants, lieux. Noms : `ech_net_safe_name` (sans `* " \ / < > : | ? # ^ [ ] { } %`, 100 lettres, noms réservés de Windows), `ech_net_unique` (majuscules et accents confondus). Texte des fiches : `ech_net_md` (pas de faux `[[…]]`, pas de balise).
- **Étendue** commune (`ech_net_scope`) : `scope=all|sosa|branch` (`root_id`, ou `branch_mode` + `branch_person` comme le GEDCOM) ; génération relative à la personne n°1 (`ech_net_generations`), numéros Sosa (`sosa_positions`). Vie privée : `echanges_dataset` (vivants et confidentielles « Personne vivante N » sans rien d'autre que leurs liens, ou retirés avec `living=drop`).
- **🕸 GraphML / DOT** (`format=graphml|dot`, `&families=1` = un nœud par couple) : `ech_net_graph` → nœuds `I<id>` (label, sex M/F/U, birth_year, death_year, generation, sosa, sosa_all, living) et `F<id>`, arêtes parent / spouse (non orientée) ou partner / child. GraphML : clés déclarées, `echanges_xml` ; DOT : `ech_net_dot` (« \ » et « " » échappés, retours en `\n`).
- **🧬 ADN** (`heritage-dna.js`) : `DNA_FORMATS` reconnaît aussi DNA Painter (profil : chr, start, end, match, side, group, colour → côté, ancêtre, couleur du segment), Genetic Affairs AutoCluster (colonne cluster + grille : une colonne par correspondance → `shared_matches`) et AutoTree (tree number, common ancestors → `mrca`), LivingDNA (Living DNA ID / Has Family Tree). Une grappe (« AutoCluster 3 », « AutoTree 1 ») part dans `rows[].cluster` : `import_dna_matches` crée le groupe s'il n'existe pas (`groups_added` dans le reçu ; `undo_dna_import` le retire). « 0 », « - », « unclustered » = sans grappe. Export : 🧩 Chromosomes → « ⤓ Exporter pour DNA Painter » (`ext.dnaPainterCsv(segs)`, `LCNDA_SHEET.toCSV`) au format du navigateur de chromosomes de FamilyTreeDNA (`Match Name,Chromosome,Start Location,End Location,Centimorgans,Matching SNPs`, positions entières, chromosomes 1–22 et X).
- **📷 Photos** : Listes → Médias et documents → « ⤒ Importer des photos » (`ext.openPhotosImport(files?)`, `assets/js/heritage-photos-import.js`). Lecture : `assets/js/app-photos-meta.js` → `window.LCNDA_PHOTOMETA` (aussi `require()`) : `collect(files)` (ZIP par `LCNDA_SHEET.unzip`, option `maxFile` = 1 Go ; tout chemin `..`, absolu ou avec `\` fait refuser le fichier), `pairSidecars` (.json de Takeout : `.json`, `.supplemental-metadata.json`, noms coupés, « (1) », « -modifié/-edited » ; `.xmp` à côté ; `metadata.json` = album), `parseTakeoutJson`, `parseXmp` (par `LCNDA_SHEET.parseXml` ; DOCTYPE / ENTITY → refusé), `parseIptc`, `readTiff` (EXIF), `merge` (le fichier passe avant le .json pour la date et le GPS). HEIC et formats bruts laissés de côté avec la raison ; 2 000 photos au plus d'un coup.
- **Envoi** : `lot_begin` puis `lot_item` (mode `new`) avec `description`, `date_text`, `taken`, `geo_lat` / `geo_lon` (→ `photo_media_geo` pour les Cartes de photos si le fichier n'a pas les siens), `place_id` (migration 72 : `media.place_id`, montré par le menu de choix des médias), `person_ids` (déjà confirmés dans la fenêtre), `label_names` (étiquettes créées s'il le faut, retirées par `lot_undo` si plus rien ne les porte). `LOT_TYPES` accepte aussi MP4 et MOV. **Règle** : un lieu ou une personne proposé (picker_search, `near=lat,lon` pour une position) n'est relié que si la case « Relier » est cochée (ou s'il a été choisi à la main).
- Fixtures inventées : `tests/fixtures/imports-3c/` (photos : `fabriquer-photos.py`). Test : `tests/test-imports-exports-3c.js`.

## 🐘 Très grosse base (100 000 personnes) : rester rapide

Mesuré avec `tests/test-grosse-base.js` (20 000 personnes, bornes larges, dans la suite) et à la main `GROSSE_BASE=100000 node tests/test-grosse-base.js` (fabricant : `scripts/grosse-base.php`, jamais dans la vraie base ; `GROSSE_APP=dossier` compare une autre copie de l'app, `GROSSE_RAPPORT=fichier.json` garde les mesures, `GROSSE_PARTIE=api|ui`).
- **Index** (migration 71) : sources, notes, médias, variantes, journal par fiche ; `persons(updated_at)` et `events(COALESCE(updated_at,created_at))` pour les « dernières fiches sans… » du tableau de bord (lues dans l'ordre, arrêt aux 80 premières) ; `events(COALESCE(year,9999), sort_date, id)` pour Listes › Événements. Un nouvel `ORDER BY … LIMIT` sur une grosse table : un index du même ordre.
- **Jamais `e.person_id=p.id OR e.family_id IN (…)`** dans une sous-requête par fiche (SQLite ne prend plus d'index) : `… IN (SELECT id FROM events WHERE person_id=p.id UNION ALL SELECT fe.id FROM families ff JOIN events fe ON fe.family_id=ff.id WHERE ff.partner1_id=p.id OR ff.partner2_id=p.id)`.
- **`person_select()` sur toute la base** : `person_select_rows($pdo)` (mêmes lignes, trois lectures) ; une liste de personnes à montrer : d'abord les identifiants (colonnes légères), puis `person_select() … WHERE p.id IN (…)` pour la page (voir `phonetic_people`).
- **Jamais tout charger d'un bloc** : lire la requête ligne à ligne (`foreach ($stmt as $r)`), ne garder que ce qui sert (`controle_compute`, `impossible_journeys` lu personne par personne, `genea_calendar_events($pdo, $q, $onlyDays, $onlyTags)`), écrire une très longue réponse au fur et à mesure (`genea_calendar_stream`, export GEDCOM avec `ob_start(null, 262144)`). Un travail lourd peut demander plus de mémoire : `memory_at_least(2048)` (contrôle, export) ou 4096 (import GEDCOM).
- **Pas de grosse donnée dans `bootstrap`** (démarrage) : la pièce d'archives lit `archive_people` à l'ouverture. Un widget ne lit que ce qu'il montre (`ext.dashboard[type].load(widgets)` reçoit les widgets de sa sorte : « Mon agenda » demande `genea_calendar&anniv_days=N`). Une liste paginée côté serveur renvoie `{acts, total}` (`recent_acts&limit=N`).
- **DOM** : une liste qui peut avoir des milliers de cartes en montre une partie, puis `UI.moreButton` (C6) — ex. Listes › Métiers (24 personnes par métier, puis « Voir les 24 suivantes ↓ »).
- **Menu de choix** : `picker_page` renvoie le nombre avec la page (`count(*) OVER ()`), une seule lecture ; les lieux d'un mot sont cherchés une fois (`json_each`).

## 🗺️ Cartes en plus — vague 1 (heritage-cartes-plus.js, heritage-diagram-cartes-plus.js, lib/cartes_plus.php)

- **⇆ Comparer deux époques** (`ext.mapCompare`) : `mount(stage, {bar, after, baseBg, redraw})` → `{draw({left, top, z, width, height})}` pose un calque de tuiles d'un deuxième fond (`tilesHtml`) au-dessus des tuiles de la carte, et le bouton « ⇆ Comparer » dans la barre. Trois façons : « ▏ Trait » (`clip-path` + poignée `role=slider`, souris et ← → Début Fin), « ◫ Côte à côte » (deux moitiés centrées au même point ; points, trajets, couches cachés : `.is-cmp-side`), « ◐ Transparence » (C3 avec « % » dans la case). Réglage par appareil : `localStorage['lcnda-map-compare']`. La Carte l'appelle par `ext.mapSetup` / `ext.mapDraw` ; une autre carte à tuiles (avec ses `left/top/z`) peut l'appeler de la même façon.
- **🏛 Frontières anciennes** (Carte → « 🏛 Frontières ▾ », cases à cocher, `localStorage['lcnda-map-frontieres']`) :
  - provinces d'Ancien Régime (≈ 1789) et départements de 1790 : **tracés approximatifs** faits dans le navigateur d'après `assets/data/geo/fr-departements.json` (chaque département d'aujourd'hui rangé dans une province / un département de 1790 : tables `PROV`, `D1790` ; limites = arcs TopoJSON partagés par deux regroupements ; coloriage glouton des voisins). Hors de France à la date (Nice, Savoie, Comtat) : gris. Aucune source libre et officielle de leurs vrais contours n'a été trouvée ; si une arrive, remplacer les tables par ses contours ;
  - communes disparues ou fusionnées : historique officiel de l'INSEE (COG, Licence Ouverte 2.0) — `v_mvt_commune_AAAA.csv` (événements depuis 1943) et `v_commune_depuis_1943_AAAA.csv`. Adresses prises dans la fiche data.gouv.fr du COG (`CP_FRONT_DATASET`, avec la taille et l'empreinte publiées), sinon adresses de secours insee.fr. Téléchargés une fois (Réglages → « 🏛 Frontières anciennes », POST `frontieres_download`) dans `SHARED_DATA_DIR/frontieres/` : colonnes vérifiées, taille annoncée et empreinte publiée comparées, sha256 gardé dans `manifest.json` ; un fichier refusé ne laisse rien. `cp_front_build` → `communes-anciennes.json` (une ligne par commune disparue ou renommée, commune d'aujourd'hui en suivant les fusions suivantes, rétablissement, position : lieu-dit de même nom, ancien contour, sinon centre d'aujourd'hui = `approx`). GET `frontieres_communes` (cadre, zoom ≥ 8 ; `&code=`), `frontieres_status`, `frontieres_remote` ; POST `frontieres_remove` / `frontieres_restore` (H7 ↶ Annuler) / `frontieres_apply`.
  - **Menu de choix des lieux** : les anciens noms sont ajoutés aux autres noms (`places.alternate_names`) de la commune d'aujourd'hui, ce qui fait paraître « anc. « … » » (`picker_old_name`). Ce qui a été ajouté est noté dans `meta.frontieres_alt` (retiré avec les fichiers) ; une autre généalogie le reçoit à l'ouverture de la page des Réglages (`apply_needed`). Les disparitions d'avant 1943 ne sont pas dans le COG.
  - Essais : `LCNDA_FRONTIERES_DIR`, `LCNDA_FRONTIERES_SOURCES` (`file://`), fichiers inventés `tests/fixtures/frontieres/`.
- **Graphiques → Cartes** (4 sortes, même moteur que les autres cartes, `ext.diagramCartes`) : 🔤 `surnamemap` (patronymes, départements colorés ou ronds, siècle), 🔥 `heatdecades` (chaleur par décennie, densité floutée, échelle commune), 🧬 `dnamap` (lieux des ancêtres communs, couleur par groupe ou cM), 🔎 `researchmap` (vert / orange / rouge par commune, sorte d'acte, période ; clic → fenêtre « Ce qui a été vu / Ce qui manque », boutons `data-rj-open` du Journal des recherches). Le curseur ▶ est celui de ⚙️ Personnaliser (`kind.time = {range, at}`, `o.time.step` 100 ou 10, `o.__year`) : pas de deuxième lecteur. Données : GET `cartes_plus&what=surnames|surname|heat|dna|research` (jamais un vivant ni une fiche confidentielle : `gedcom_share_hidden` ; noms des correspondances ADN seulement avec `names=1`).
- Test : `tests/test-cartes-plus-1.js`.

## 🧭 Outils de la Carte : trajets d’autrefois, grande carte à imprimer, relief 3D, mes couches (heritage-cartes-outils.js, app-cartes-outils-core.js, lib/cartes_outils.php, cartes-outils.css)

Carte → « 🧭 Outils ▾ » (menu d’actions K14) et « ✏️ Mes couches », posés par `ext.mapSetup` / `ext.mapDraw` (rien dans `app-carte.js`). Préfixe CSS et `data-` : `cpo-` (le préfixe `cp-` est celui des « Cartes en plus — vague 1 »). Calculs sans écran dans `window.LCNDA_CARTES_OUTILS` (aussi `require()` dans Node). Serveur : GET `cartes_outils&op=places|relief|layers`, POST `cartes_outils_write {op: layer_save|layer_delete|layer_restore|layer_order}`. Test : `tests/test-cartes-plus-2.js`.

- **🧭 Distances et temps de trajet** (`openTravel({from, to, year, person})`) : deux lieux (menu de choix ×2) ou une personne ; distance à vol d’oiseau (haversine) × détour (route 1,25, rail 1,2, mer 1,15, rivière 1,4) ; à pied, à cheval, en diligence, bateau sur la rivière, bateau en mer, train — chaque moyen = une table [année, km/h, km par jour] interpolée (`MODES`, sources dans `SOURCES` : Braudel, règlements militaires, Arbellot, Studeny, Caron, traversées de l’Atlantique), « pas encore » avant son année (train : 1837). Phrase `sentence()` : « Il fallait environ 4 jours pour aller de Tulle à Paris en 1820 (en diligence, ≈ 502 km de route) » (« Il faut » pour les 30 dernières années). Réglages (km par jour d’un moyen, détours) dans « ⚙️ Vitesses et sources », gardés tout de suite (`genealogie-trajets`, ↶ Annuler, « ↺ Remettre comme au départ »). Bloc de fiche `travel` « 🧭 Ses déplacements » (dans `defaultPersonBlocks`, section Vie) : seulement s’il y a au moins un déplacement entre deux lieux placés ; les voyages en mer du bloc « Départs / émigration » y comptent.
- **🖼 Grande carte à imprimer** (`openPoster()`, `posterSvg(data, o, imgs)` → SVG en mm) : A3, A2, A1, A0, portrait / paysage ; 5 styles (`STYLES`) ; cadrage autour des lieux, France, Europe, Monde ; cartouche, légende, rose des vents, échelle (`niceScale`), noms des lieux sans chevauchement, migrations naissance → décès, une branche (ancêtres, menu de choix), portraits en médaillon (mis en `data:` pour passer dans l’image). Fond : fichiers de `assets/data/geo` (Natural Earth, IGN Admin Express) par `ext.diagramCartes` (`load`, `fitProj`, `autoProj`) — **pas de tuiles** (les conditions d’OSM, Esri, IGN… interdisent le téléchargement en masse pour l’impression). Export par la fenêtre E3 (PDF à la taille exacte de l’affiche, PNG, JPG, SVG ; pixels bornés par `posterPixels`, 48 Mpx au plus, la qualité baisse alors toute seule avec un message) et impression L1 (`openPrintDialog`, format « Autre » à la taille de l’affiche). **Jamais un vivant ni une fiche confidentielle** : `op=places` filtre côté serveur par `df_hidden_people` (lieux, couples, migrations, portraits).
- **⛰ Relief 3D** (`openRelief({center})`) : `op=relief&s&w&n&e&size` lit la grille de 30″ du socle météo (`meteo_altitude`), 4° × 6° au plus, `null` hors grille ; dessin avec **le même Three.js que la maison** (`assets/vendor/three.module.js`), couleurs selon l’altitude, épingles des lieux de la famille, souris (glisser, molette) et clavier (← → ↑ ↓, + −, 0), « ⤓ Exporter en PNG ». Zone sans altitude : « Pas d’altitude pour cette zone : la carte du relief couvre 14 pays (…) » ; socle absent : renvoi à la Météo d’autrefois.
- **✏️ Mes couches** : table `map_layers` (migration 74 : nom, couleur, visible, ordre, formes en GeoJSON, `deleted_at` gardé 30 jours pour « ↶ Annuler »). Outils 📍 Point, 📝 Note, 〰 Itinéraire, ⬠ Zone (Entrée / double-clic pour finir, ⌫ retire le dernier point, Échap arrête) ; clic sur une forme → ✎ Modifier (nom, note, couleur C2) / 🗑 Supprimer ; chaque changement est un état complet de la couche avec « ↶ Annuler » (H7). ⤓ GeoJSON (propriétés « simplestyle ») et KML 2.2, ⤒ réimport par la fenêtre K13 (`readLayersFile` ; KML lu comme du texte, DOCTYPE / ENTITY refusés). Formes nettoyées dans le navigateur (`cleanFeature`) **et** sur le serveur (`co_feature` : coordonnées bornées, 5 000 formes, 20 000 points, 8 Mo, textes sans caractères de contrôle). Lecture seule en consultation (🔒) : on voit, on exporte, on ne dessine pas.

## 🗺 Mes cartes (heritage-cartes-perso.js, app-cartes-perso-core.js, lib/cartes_perso.php, cartes-perso.css)

Carte → mode « I 🗺 Mes cartes » (colonne de gauche, avec la liste de mes cartes). **Même moteur que la Carte** : `renderMap` (app-carte.js) appelle `ext.mesCartes.before(token)` — `false` = la page de la liste est dessinée (K5 + H10 `UI.listBar` clé `carte:mes-cartes` + K9) ; `true` = la carte ouverte passe par le dessin normal (tuiles, glisser, molette, ⇆ Comparer, 🏛 Frontières, 🧭 Outils, ✏️ Mes couches restent là) sans les points de la Carte (`state.mapMode === 'mine'`, fond propre `state.mapMineBg`). Les couches sont dessinées en SVG par `ext.mapDraw` (`#mcp-svg`), la barre et le panneau posés par `ext.mapSetup`. Préfixe CSS et `data-` : `mcp-`.
- **Définition** (jamais les données) : `{v, bg, legend, view: {lat, lon, zoom}|null, time: {from, to, mode: cumul|window, win, secs}, layers: [{id, kind, name, visible, f, s}]}` nettoyée par `cleanDef` (navigateur) et `mcp_clean_def` (serveur, 24 couches, 60 000 caractères). Table `custom_maps` (migration 87 : nom, description, `def_json`, `deleted_at` gardé 30 jours pour « ↶ Annuler »). Carte prête d'office « 🖼 Images de lieux » (`id: 'ready:images'`, pas en base : gardée dans Mes cartes au premier changement).
- **Sortes de couches** (`MCP_KINDS` = `KINDS`) : naissances, mariages, décès, inhumations et tombes (GPS des `graves`), résidences, recensements, événements choisis (types), migrations (naissance → décès) et voyages (`person_voyages`), lieux de vie (étapes numérotées et trait), patronymes, métiers (OCCU + recensements, secteurs de `metiers_classify` s'il est là), maisons, images de lieux (`pp_list` de lib/place_photos.php : point, ZONE cercle ou polygone, plusieurs hypothèses reliées en pointillés, certitude en transparence, cône de prise de vue ; sans cet outil : cartes postales et images rangées sur un lieu), monuments aux morts (morts pour la France à leur commune de naissance + sorties « monument »), sources (lieux des événements cités), médias placés (GPS, `media.place_id`), animaux suivis (observations, trajets GPS), événements historiques, mes couches dessinées ou importées (`map_layers`). Nouvelle sorte : `mcp_<sorte>` dans lib/cartes_perso.php + une ligne dans `MCP_KINDS` et `KINDS` (+ `FILTERS`).
- **Filtres d'une couche** (`f`) : `from` / `to` (C4, `mcp_range` = `range`), `undated`, `persons` (menu de choix) + `rel` (self, asc, desc, both) + `gens`, `sosa` + `sosaGens`, `side` (côté du père / de la mère depuis le Sosa 1), `branch` (menu de choix `branch`), `labels`, `gender`, `place` + `radius` (km), `zone` (une couche de ✏️ Mes couches, menu de choix `maplayer`), `cert` (certitude des événements ou des images), `types`, `text` (noms, métier ou secteur), `pets`, `layers`, `voyages`, `retained`. La période de la carte s'ajoute à celle de chaque couche.
- **Style** (`s`) : couleur C2, forme (rond, carré, losange, triangle, étoile, épingle, croix), taille et opacité C3 (double-clic = départ), regroupement, carte de chaleur, noms des lieux, une couleur par sorte (`cat`), traits, cônes. **Un seul dessin** : `layersSvg(proj, def, data, o)` sert à l'écran, à l'export, au widget.
- **Données** : GET `cartes_perso&op=data&def=JSON[&share=1]` → `{layers: [{id, n, features, years, note}], years}` ; formes `{g: p|l|z, c, y, y1, ys, t, s, lab, p, m, img, k, cone, cat, grp, h, n, arrow}` (20 000 au plus par couche). `share=1` (exports, impression, mise en page, site web) : jamais un vivant ni une fiche confidentielle (`cartes_outils_hidden` → `df_hidden_people`), ni un média relié à l'un d'eux. GET `list`, `get` ; POST `cartes_perso_write {op: save|delete|restore|duplicate|order}` (CSRF, consultation refusée).
- **Panneau « ⚙️ Couches »** (K2 : chaque changement gardé tout de suite, « ✓ Enregistré », H7 « ↶ Annuler » qui remet l'état d'avant) : nom, description, fond, période, curseur du temps, légende, « 📌 Garder cette vue » / « ↺ Remettre comme au départ », couches (⠿ + glisser ou Alt + ↑ / ↓, interrupteur 👁, ⋯ Régler / Cadrer / Dupliquer / Monter / Descendre / Retirer), « ＋ Ajouter une couche ▾ », « 💾 Réglages enregistrés » (`UI.presetsFrame` id `mes-cartes`, `genealogie-mes-cartes-presets`, fichiers `exportSettingFile('mes-cartes')`).
- **Curseur du temps** ▶ (`atTime` : cumul ou fenêtre de N ans ; un trait avec des années par sommet est coupé là où on en est), légende automatique (`legend`, un clic cache la couche), fenêtre d'une forme (↗ Fiche, ↗ Image, ↗ Maison).
- **Sorties** : ⤓ Exporter ▾ → E3 (PDF, PNG, JPG, SVG, Imprimer, GeoJSON ; fond vectoriel Natural Earth / IGN par `ext.cartesOutils.helpers`, pas de tuiles), GeoJSON (`toGeoJSON`, « simplestyle »), KML (`toLayers` → `LCNDA_CARTES_OUTILS.toKML`), 🖨 L1 (`openPrintDialog`, ⌘P) ; ⋯ → widget « 🗺 Une de mes cartes » du tableau de bord (`custommap_widget`, `ext.mesCartes.embed`), « 📐 Mettre dans la mise en page » (une page avec l'image rangée dans les médias), « 🌐 Dans mon site web » (bloc `mymap` de heritage-site-web-blocs.js, image sans vivant). Menu de choix : `custommap` (ouvre la carte), `branch`, `maplayer`.
- Test : `tests/test-cartes-perso.js`.

## 🧾 Recensements SocFace (lib/socface.php, app-socface-core.js, app-lecture-auto.js, heritage-socface.js, socface.css)

Le projet SocFace (ANR 2021-2026) a lu par intelligence artificielle les listes nominatives des recensements de 1836 à 1936 ; elles sont dans la « base de noms – recensements » de FranceArchives (ajoutée département par département).
- **Jamais de requête vers FranceArchives** (le site a une protection anti-robots et les données sont une transcription automatique) : l’app fabrique seulement l’adresse `https://francearchives.gouv.fr/basedenoms_recensement?es_names=…&es_forenames=…&es_locations=…&es_date_min=…&es_date_max=…&es_gender=f|h` (`LCNDA_SOCFACE.searchUrl`, années bornées à 1836-1936) (fenêtre commune « 🔍 Archives en ligne », ligne FranceArchives) et l’ouvre dans le navigateur. **Adresse vérifiée en partie** (`LCNDA_SOCFACE.VERIFIED`, 10/11/2026) : `es_names`, `es_forenames`, `es_locations` sur l’adresse réelle (sans « /fr/ ») ; `es_date_min`, `es_date_max`, `es_gender` d’après le code du site seulement. Entrées : bloc Recensements de la fiche (`ext.socface.cardButtons`), fiche d’un village, Recherche → « 🧾 Recensements SocFace » (`ext.socface.page`), « Chercher sur internet » (site `socface`), « Que manque-t-il ? » (lignes `kind: 'socface'`, `socface_gap_items`).
- **Import** (`ext.socface.openImport`, fenêtre K13) : CSV d’une notice (**vérifié sur un vrai fichier** : `tests/fixtures/socface/vrai-notice.csv`, nom remplacé ; « , », UTF-8 sans BOM ; le « Lien vers le document numérisé » peut finir par `ficheFocus=` vide = le registre sans la page : affiché « 🗂 Lien vers le registre (la page n’est pas précisée) », `imageExact` / `imageLabel`) (`<id>.csv` : URL de FranceArchives, Nom, Prénoms, Date du document, Lieu du document, Profession, Genre, Type de document, Cote, Numéro de l'acte, Lieu de conservation, Lien vers le document numérisé), export d’une recherche (même chose sans Genre ni Numéro ; d’après le code du site, pas encore vérifié sur un vrai fichier), CSV complet SocFace (« Numéro Arkindex du ménage »…), ou texte copié d’une fiche (« 📋 Coller le texte d’une fiche » → un .txt remis à la même fenêtre). Lecture par `LCNDA_SHEET.decodeBytes` / `parseCSV` (seul lecteur de CSV). Ménages : n° de ménage, sinon année + commune + nom (noms qui se lisent pareil réunis). POST `socface_preview` (candidats « c’est la même personne ? », écarts, déjà importé) puis `socface_import` : un foyer `census_records` (origin = 'socface', origin_url, image_url, cote, page_line, household_key, verified, import_batch) avec ses `census_members` (origin_data JSON : année et texte de naissance, genre, page, ligne, notice, lectures d’origine `orig`), une **source par recensement** (titre « Recensement de 1906 — Tulle (Corrèze) », lien de la notice, image, cote, mention « Transcription automatique SocFace (FranceArchives) — peut contenir des erreurs : à vérifier sur l’image ») citée sur le foyer et sur chaque fiche reliée. Seules les fiches choisies dans « Relier à… » sont reliées ; aucune fiche n’est modifiée ; un ménage déjà importé est laissé de côté. `socface_undo {batch}` (H7 « ↶ Annuler ») retire foyers, membres, sources, citations et lieux créés restés vides. Migration 75 (`socface_schema`, aussi appelée par la lib).
- **À vérifier** : pastille K8 jaune « À VÉRIFIER » (vert « VÉRIFIÉ ») sur la fiche, dans la liste et l’aperçu ; interrupteur « Vérifié sur l’image » (`socface_verify`, H7).
- **🔍 Vérifier cette ligne SocFace** (`ext.socface.openVerify`, `verifySaved`) : chaque case lue, la raison du doute (🟡 / 🟠), des propositions jamais appliquées sans clic (`socface_fix`, l’ancienne lecture gardée, H7 « ↶ Annuler » ; avant l’import, la ligne en mémoire), le lien vers l’image et la notice, les autres lignes du ménage. Détections pures dans `app-lecture-auto.js` (`window.LCNDA_LECTURE`, aussi pour Node) : lettres confondues (distance de lecture avec table de confusions u/n, m/rn/nn, a/o, e/c, i/l/t, ſ/f, v/r, cl/d, h/b, S/L, I/J, T/F), chiffres confondus (1/7, 3/8, 5/6, 0/6/9, 4/9), âges impossibles pour le lien, naissance après le recensement, âge différent d’un autre recensement, colonnes décalées, lien vide ou absurde, deux chefs, épouse d’un chef femme, même personne deux fois, ménage coupé au changement de page, enfant dans le mauvais ménage, abréviations (« cult. », « jlier », « Vve »…) et « id. » / « d° ». Dictionnaires : noms et prénoms de la base + prénoms courants, communes de la base + celles du département (INSEE `frontieres/com.csv`), métiers anciens (GET `socface_context`). Vraies erreurs relevées sur une page de Hérisson (Allier) et testées : colonnes décalées d’un cran (lien = « P »/« F », profession = « chef »/« épouse », la profession dans l’employeur → chaque valeur remise dans sa colonne), « V / Ve / Vve » devant le nom (= veuve), « V » dans l’état civil, un lien rangé dans l’état civil (« Neveu »), plusieurs formes d’un même lieu sur la page (Hérisson / Herisses / Heinon / Henison → la forme la plus lue ou la commune connue ; `splitBirthPlace` sépare « commune + département abrégé » comme « Nouluner P Loire »), variantes du nom dans un ménage (forme majoritaire, nom du chef, épouse inscrite sous le nom du mari), mots déformés (`MISREADS` : « fles » → fils, « Agricalten » → agriculteur, « Platrice » → plâtrier, « Camier » → commis, « Gremoble » → Grenoble), métier ou employeur illisible, lien qui ne va pas avec le prénom (« Maria … frère »). « Néant / Neant / Niant » s’écrit « Néant » sans alerte (`normNeant`). Une proposition qui va dans une autre case s’affiche « Lien avec le chef : « chef » ». La relecture de « ✨ Lire l’acte » (heritage-transcribe.js) utilise `checkWords` du même fichier.
- **Écarts** (`socface_compare`, `socface_controle_alerts`) : année de naissance (± seuil `socface_years` des « ⚙️ Seuils du contrôle », 2 ans au départ), lieu de naissance, genre, lien avec le chef (d’après l’arbre) ; phrase « SocFace lit « né vers 1922 », ta fiche dit 1921 — l’IA a pu mal lire : vérifie sur l’image. » dans la fiche (GET `socface_person`), l’aperçu d’import et le Contrôle de la base (sorte « 🧾 Recensement SocFace », 🟡 / 🟠, jamais 🔴).
- **Que manque-t-il ?** : une ligne par ancêtre et par année de recensement où il vivait dans une commune connue (événement à 15 ans au plus) ; « ✓ Trouvé / Pas trouvé » crée un dépouillement fait (« FranceArchives — recensements (SocFace) ») qui passe dans le Journal des recherches ; la ligne s’en va aussi quand le foyer est importé. Test : `tests/test-socface.js` (fixtures inventées : `tests/fixtures/socface/`).

## 🔍 Archives en ligne : la fenêtre commune de tous les lots (app-archives-en-ligne-core.js, heritage-archives-en-ligne.js, archives-en-ligne.css)

Règle « un seul modèle partout » (validée) : les 7 lots « sources ouvertes » et SocFace n’ont plus chacun leur fenêtre de recherche, leur « ⚙️ Adresses des sites » ni leur rangée de boutons ; **une couche commune** réunit leurs registres. **L’app n’interroge jamais ces sites** : elle fabrique l’adresse (chaque lot garde sa fonction `url(clé, p, adresses_à_toi)`), le navigateur de la personne l’ouvre (`target=_blank`, `rel=noopener noreferrer`), puis l’import propre de chaque lot lit ce que la personne a téléchargé ou copié.
- **Le registre commun** (`window.LCNDA_ARCHIVES`, calculs purs, aussi `require()` dans Node) : `collect(registres, {mine, hidden})` → une entrée par site `{id: 'so3_freebmd', lot, key, label, icon, country, zone, theme, verified: oui|partiel|non, paid: ''|oui|partiel|bibliotheque, kind, also, merged…}` ; `registries(window)` lit `LCNDA_SOURCES_OUVERTES`, `_2`, `_3`, `LCNDA_SO4`, `_5`, `_6`, `_7` et `LCNDA_SOCFACE`. Rangement : `GROUP_META` (rubrique d’un lot → pays et thème) et `SITE_META` (un site précis) ; `ZONES` (🇫🇷 France, 🇪🇺 Europe, 🌎 Amériques, 🌍 Monde), `COUNTRIES`, `THEMES` (🎖 soldats, 🏅 décorations, 🕯 mémoire, 📜 état civil, 🌳 arbres, 🚢 émigration, ⚓ marins, ✒ notaires et justice, 🏭 métiers, 📰 presse, 📚 livres, 🪦 cimetières, 📍 lieux, 👶 enfants assistés, 📷 photographes, ⭐ mes sites). `url(entrée, p)`, `ready(entrée, p)` (un nom, ou un lieu pour un site qui cherche par lieu), `outOfTime` (années de vie ou de naissance, mêmes règles que les lots), `filter`, `counts`, `sections`, `detectLink` (le `parseLink` de chaque lot, puis le nom du site), `detectText` (`detectKind` des lots).
- **Une seule entrée par site** (`MERGED`) : Minutier central et Salle des inventaires virtuelle (lots 2 et 6 → lot 2), inscrits maritimes du SHD (lots 2 et 6 → lot 2, l’aide du port du lot 6 reste sur la ligne), Maitron des fusillés (lot 2 → ligne Maitron du lot 5, « Aussi : 🕯 Maitron des fusillés 1940-1944 »), annuaires de Gallica (lot 5 → lot 2, « Aussi : 📷 Le photographe dans l’annuaire »), recensements SocFace (→ ligne FranceArchives — base de noms du lot 1, « Aussi : 🧾 Recensements 1836-1936 (SocFace) » + années de recensement). `resolve(id)` donne la ligne gardée ; `collectAll` garde les doublons (adresse, aide). Les sites déjà dans « Chercher sur internet » restent marqués `existing` dans les lots. Pas de doublon POP : Mérimée / Palissy (lot 2) et Joconde (lot 3) sont trois bases différentes.
- **🔍 Chercher dans les archives en ligne** (`ext.archives.open({personId, lot, group, where, place, target, sites, employer, port…})`, grande K6) : « Pour : » la personne (menu de choix) ou le lieu / la maison / l’objet ; Nom, Prénom, Lieu, années (d’après `so_context`) + « Plus de précisions » (né en, département, unité, port d’attache, canton suisse, ce qu’on cherche, employeur, photographe, pays), ouvert tout seul quand la rubrique en a besoin ; case C1 ; « Gratuites seulement » (clé commune `genealogie-sources-gratuites`) ; pastilles C5 avec le nombre : « 🎯 rubrique du bouton » (si on vient d’un bloc) · Tout · zones, puis pays de la zone, puis thèmes ; rubriques « pays · thème » ; chaque ligne : icône, nom, pastilles K8 (vérifiée / en partie / non vérifiée, PAYANT rouge, EN PARTIE PAYANT jaune, GRATUIT EN BIBLIOTHÈQUE, Compte gratuit, Mémoire, Adresse à toi, Ta région), l’adresse telle qu’elle s’ouvre, la note, « Aussi : … », « chercher avec Google dans ce site » (adresse non vérifiée du lot 6), données ouvertes (lot 3), « ↗ Ouvrir » ou « 📋 Copier le nom et ouvrir » (un lien : le nom part dans le presse-papiers), le petit ⤒ de l’import du lot. Payants à la fin de leur rubrique ; sites hors de l’époque cachés (« N sites hors de son époque · Les montrer ») ; « Classe 1912 » (registres matricules) ; phrase sobre en tête d’une rubrique 🕯. Vue retenue (`genealogie-archives-en-ligne-vue` : zone, pays, thème, rubriques ouvertes des réglages).
- **Les boutons des blocs restent** (Poilu, Militaire, Cimetière, Départs, Inventaire après décès, Enfant placé, 📰 Dans les médias, 🏆 Récompenses, profils, employeur, monographie et fiche d’un village, objet de famille, SocFace…) : chaque lot garde `openSearch(o)`, devenu `ext.archives.open({...o, lot: N, group|where})` → la fenêtre commune, déjà sur sa rubrique (`group`) ou sur les sites de `forPlace(where)` du lot. `ext.socface.openSearch` / `searchFromPerson` font de même (`lot: 'socface'`).
- **⤒ Importer ce que tu as trouvé ▾** (menu K14 `UI.menuAt`) : une ligne par lot (`LOTS[n].import`) + 🧾 SocFace ; le lot d’où l’on vient en premier. Chaque ligne appelle l’import du lot **inchangé** (`ext.sourcesOuvertesN.openImport`, fenêtres K13, `soN_preview` / `soN_import` / `soN_undo`, ↶ Annuler) ; le ⤒ d’une ligne passe `{kind, site}`.
- **🔗 Coller un lien** (`ext.archives.openPaste({personId, lot})`, un seul pour toute l’app) : lien et/ou texte copié ; « ✓ Reconnu : … » (`detectLink`, sinon `detectText`) choisit l’import ; « Importer avec » pour changer ; puis `openImport({link, text, linkOnly, textOnly, files})` du lot. Les anciens `openPasteLink` (lots 1, 2, 4, 7) et `openPasteText` (lots 3, 5, 6) y mènent.
- **⚙️ Adresses des sites** (`ext.archives.openSettings({lot, onChange})`, un seul écran, K2 `UI.autoSaveDialog`) : rubriques repliables (pays · thème ; celles du lot d’où l’on vient ouvertes), case C1, « Gratuites seulement », pour chaque site l’interrupteur « montrer » (gardé dans `hidden` de la clé du lot 7, identifiants `soN_clé`, clés brutes pour le lot 7) et la case « adresse à toi » **écrite dans la clé de son lot et sous sa forme** (`genealogie-sources-ouvertes-sites`, `-2-sites` … `-6-sites` : `{clé: modèle}` ; `-7-sites` : `{hidden, urls, cercles, mine}`) : les réglages déjà faits sont repris tels quels, une adresse d’un doublon sans case reste gardée. « 📒 Mon cercle généalogique » (cercles du lot 7) ; « ⭐ Mes sites » (`genealogie-web-search-custom`, aussi dans « Chercher sur internet », + ceux du lot 7) avec ✕ et H7 ; « ↺ Remettre comme au départ » vide les 7 clés. Les anciens `openSettings` de chaque lot y mènent.
- **Bloc « Chercher sur internet » de la fiche** (app.js `webSearchPanelHtml`) : `ext.archives.panelButton(ctx)` = « 🔍 Archives en ligne… » · « 🔗 Coller un lien » · « 🌍 Où chercher ? » (`ext.ouChercher.openPerson`) ; Recherche → Chercher sur internet : les mêmes sous le titre. Plus de rangée par lot (`panelButton` retirés des lots). Les sites des lots restent aussi dans la liste de « Chercher sur internet » (`ext.webSearchExtra`, cachés au départ, pastille PAYANT du lot 6).
- **Ajouter un site ou un lot** : un site s’écrit dans le `SITES` de son lot (clé, groupe, adresse, `verified`, `paid`…) ; un nouveau lot expose `window.LCNDA_…` (SITES, GROUPS, url, cleanUrl, parseLink…) et `ext.<ui>.openImport`, se déclare dans `LOTS` et `GROUP_META` du registre commun ; jamais une nouvelle fenêtre de recherche ni une nouvelle clé d’adresses. Un doublon se déclare dans `MERGED`. Une aide propre à une ligne : `ext.<ui>.archives.extra(entrée, p, ctx)` (port du lot 6, années SocFace), une phrase par rubrique : `archives.help`.
- CSS : `assets/css/archives-en-ligne.css` (une feuille pour la fenêtre commune et les imports des 7 lots, mode sombre par `build-dark-css.py`). Test : `tests/test-archives-en-ligne.js` (et les tests de chaque lot).

### Lot 1 — 🎖 Mémoire des hommes, 🏅 Léonore, 📋 registres matricules, 📰 presse ancienne (lib/sources_ouvertes.php, app-sources-ouvertes-core.js, heritage-sources-ouvertes.js)

- **Adresses** (`LCNDA_SOURCES_OUVERTES.SITES`, `url(key, p, custom)`) : Mémoire des hommes (MPF 14-18, MPF 39-45, sépultures, militaires décédés, marins, journal de marche de l’unité) et Léonore ne gardent pas la recherche dans l’adresse → recherche Google limitée au site (`site:… "Nom" "Prénom"`) ; matricules : la racine du site des Archives du département (`departmental_archives_seed`, département du lieu de vie vers 20 ans, sinon de la naissance) + FranceArchives `basedenoms?es_names=…&es_forenames=…&es_locations=…` + Grand Mémorial ; presse : Gallica SRU (`(gallica all "Prénom Nom") and dc.type all "fascicule" and gallicapublication_date>="AAAA/01/01"…`), RetroNews (`/search#allTerms=…`, pastille « En partie payant »), Europeana (`/fr/search?query=…&qf=TYPE:"TEXT"`). Aucune n’a pu être vérifiée en direct le jour de l’écriture (sites inaccessibles depuis l’atelier) : elles se changent dans **« ⚙️ Adresses des sites »** (K2, clé `genealogie-sources-ouvertes-sites`, modèles `{nom} {prénom} {nom_complet} {lieu} {de} {à} {naissance} {décès} {classe} {unité} {département}`, seulement http(s)).
- **Classe** (`classOf(année)`) : naissance + 20 ans, avec la phrase qui l’explique ; avertit avant les années 1860 et après ≈ 1940 (registres pas encore en ligne).
- **Importer** (`openImport({personId, kind, files})`, fenêtre K13 agrandie) : image (JPG, PNG, WebP, GIF), PDF, texte (.txt), page enregistrée (.html : `parseSavedPage` n’en garde que le titre, l’adresse d’origine et le texte, jamais le HTML), ou « 🔗 Coller un lien » (le seul de l’app, `ext.archives.openPaste` : `parseLink` reconnaît Gallica, RetroNews, Europeana, Léonore, Mémoire des hommes, FranceArchives → journal, date, page, notice) ; `parseFields(texte, sorte)` remplit les cases d’un texte copié (« Nom : … »). Le document est à gauche, les cases à droite (pastille « À VÉRIFIER »), « C’est la même personne ? » (POST `so_preview` : nom, prénom, naissance, décès déjà là, case MPF à « non », lien déjà en source ; rien n’est écrit).
- **Serveur** (POST multipart `so_import` : `file` facultatif + `data` JSON ; CSRF, verrou de la fiche, mode consultation) : fichier par `lot_store_upload` (liste blanche + premiers octets) → média relié à la fiche (et au dossier militaire pour un matricule) ; source (titre, organisme, lien, mention « à vérifier », texte copié) reliée à la fiche, à l’événement créé et au média ; puis 🎖 décès (`add_event`, seulement sans décès sur la fiche) + `mort_pour_la_france` (seulement si « inconnu ») + unité dans `poilu_units` (si absente) ; 🏅 récompense `award` catégorie `decoration` (grade, date, décret, dossier, document) par `blocs_save_item` ; 📋 cases **vides** de `persons.military_data` (campagnes et blessures ajoutées à « Services, campagnes & décorations ») ; 📰 `press_item` (journal, date, page, titre, lien, texte, fichier). Tout est noté dans `so_imports` (migration 76) ; **↶ Annuler** = POST `so_undo {batch}` (créations retirées, anciennes valeurs remises ; un média relié ailleurs entre-temps est gardé ; une case du bloc Militaire changée entre-temps n’est pas touchée). GET `so_context&person_id=` : fiche, naissance, décès, lieu à 20 ans, département et ses archives, unités, bloc Militaire, liste des départements.
- **Vie privée** : une personne peut-être vivante (née il y a moins de 100 ans sans décès) → avertissement ; rien n’est partagé, les adresses ne vont que dans le navigateur.
- Test : `tests/test-sources-ouvertes.js`.

### Lot 2 — 🏛 Archives nationales, ANOM, SHD, 🕯 déportation et fusillés, Journal officiel, annuaires, patrimoine, étranger (lib/sources_ouvertes_2.php, app-sources-ouvertes-2-core.js, heritage-sources-ouvertes-2.js)

- **Adresses** (`SITES[].verified`) : vérifiées le 09/11/2026 = FranceArchives `/fr/search?q=…&es_publisher=` (34633 Archives nationales, 34641 ANOM, 34577 SHD). Les autres suivent la forme connue du site (Gallica SRU, POP `base=[…]&mainSearch="…"`, `search.arch.be/fr/rechercher-des-personnes/resultats/q/persoon_achternaam_t_0/…`, Google limité au site pour le Mémorial, la FMD et les cantons) et se changent dans « ⚙️ Adresses des sites » (K2, clé `genealogie-sources-ouvertes-2-sites`, signalées « adresse non vérifiée »).
- **Import** (`openImport({personId, kind, target, files})`, fenêtre K13) : sorte de document (`KINDS`), cases (+ nom, prénoms, naissance lus), « C’est la même personne ? » (écarts de `so2_preview`, et « Pas sûr : garder seulement le document et la source »), ajouts proposés (`proposals()` : déjà sur la fiche → décoché, rien n’est remplacé). Mention « À vérifier » (`MENTION`) sur le média, la source et chaque événement.
- **Serveur** (POST `so2_preview`, `so2_import` multipart, `so2_undo` ; CSRF, verrou de fiche, bornes) : réutilise `so_imports` et `so_store_file` du premier lot. Ajouts possibles par sorte (`SO2_KINDS`) : événements d’un type permis seulement (Naturalisation, Contrat de mariage sur l’union, Testament, Acte, Naissance/Mariage/Décès, Condamnation, Arrivée au bagne, Service militaire, Déportation, Décès en déportation, Fusillé, Décoration, Changement de nom, Résidence, Profession, Immigration), inventaire après décès (`probate_inventories`), départ (`person_voyages` : date de naturalisation si vide, ou un départ Ellis Island), notes du bloc Militaire (ajoutées à la suite), texte d’une notice ajouté à la description d’un lieu, à la note d’une maison (`meta.note`) ou à un objet de famille (+ image dans ses photos). ↶ Annuler remet tout, seulement si personne n’a changé la valeur entre-temps.
- **Respect** : migration 77 crée les types Déportation, Décès en déportation, Fusillé… ; `so2_respect_ids()` marque `mem` dans `mode_simple_data` et `tresor_tree` ; tous les jeux (famille, plateau, câbles, bataille navale, labyrinthe, bunker) et les Trésors à jouer (7 familles, quiz, chasse, ancêtre mystère, livre dont tu es le héros) écartent `mem`. Un nouveau jeu fait pareil.
- Test : `tests/test-sources-ouvertes-2.js`.

### Lot 3 — prisonniers 14-18, élus, savants, Paris, musées ; Italie, Espagne, Portugal, Pays-Bas, Pologne, Royaume-Uni, Canada, États-Unis, Justes (lib/sources_ouvertes_3.php, app-sources-ouvertes-3-core.js, heritage-sources-ouvertes-3.js)

- **Importer** (`openImport({personId, kind, site, files})`, fenêtre K13 ; `openPasteText` pour un texte copié) : image, PDF, page enregistrée (texte seul, `parseSavedPage` du premier lot), .txt, .json / .csv d’Open Archives (`parseOpenArchives`), texte de résultats FreeBMD (`parseFreeBMD`), fiches copiées (`parseFields(texte, sorte)` : cicr, elu, brevet, these, polytechnique, cths, joconde, findagrave, freecen, juste, arolsen, acte (multilingue), electeur, livre ; `detectKind`). `proposals(sorte, champs)` → événements et bloc proposés, cochés ou non ; lignes d’un fichier : cochées d’office quand le nom est celui de la fiche.
- **Serveur** (POST multipart `so3_import`, `so3_preview`, `so3_undo` ; CSRF, verrou, bornes) : réutilise `so_imports`, `so_store_file`, `so_undo` du premier lot. Média relié ; source avec lien et mention « à vérifier » reliée à la fiche, aux événements et au média ; événements cochés — naissance, baptême, décès, inhumation **seulement si la fiche n’en a pas** ; un mariage n’est jamais créé (il reste dans la source) ; « Prisonnier de guerre » (type par son nom) ; blocs : unité Poilu (CICR), 💡 invention + brevet (`art_save_item`, profil inventeur), 🏛 `pol_mandate`, 🎓 `diploma`, 🏆 `award` « Juste parmi les nations ». `so3_undo` retire tout et décoche les profils cochés par l’import s’il n’en reste aucune fiche. `so3_respect_ids` : une fiche qui a reçu un document d’Arolsen est « mem » (jamais dans un jeu), branché dans `so2_respect_ids`.
- Test : `tests/test-sources-ouvertes-3.js`.

### Lot 4 — monuments aux morts, cimetières, communes et noms, protestants et marins, Europe, presse étrangère (lib/sources_ouvertes_4.php, app-sources-ouvertes-4-core.js, heritage-sources-ouvertes-4.js)

- **France · Guerres** : `memorialgenweb`, `memorialgenweb_commune`, `morts_1870`, `victimes_civiles_3945` → import `memorial` (décès proposé s’il manque, case MPF si « inconnu », unité au bloc Poilu pour 14-18).
- **France · Cimetières** : `cimetieres_de_france`, `billiongraves`, `geneanet_releves` (Find a Grave : 3e lot) → import `sepulture` (photo dans les « Photos datées » de la sépulture ; sépulture créée seulement si la fiche n’en a pas ; inhumation si elle manque).
- **France · Communes et noms** : `cassini` (population depuis 1793, anciens noms → `so4_place_import`, tables `place_populations` et `place_former_names`, migration 78 ; une année déjà là n’est jamais remplacée ; rapprochement avec `cp_front_communes` des frontières anciennes), `geopatronyme` (lien seulement, aussi dans la carte des patronymes : option de type `link` de `heritage-diagrams.js`).
- **France · Protestants et gens de mer** : `huguenots`, `roles_equipage` ; **Europe** : `matricula`, `digitalarkivet`, `riksarkivet`, `danishfamilysearch`, `irishgenealogy`, `portafontium`, `hungaricana`, `jewishgen` (compte gratuit) → import `acte` (événement choisi ; BIRT, CHR, DEAT, BURI jamais en double ; les autres pas deux fois la même année).
- **Presse étrangère** : `chroniclingamerica`, `trove`, `paperspast`, `delpher` → import `presse` commun (`so_import`, nom du site par `so4_press_agencies()`).

API : GET `so4_context`, `so4_place` ; POST `so4_preview` (« c’est la même personne ? », rien n’est écrit), `so4_import` (multipart), `so4_place_import`, `so4_undo` (graves / population puis `so_undo`). Tout import est rangé dans `so_imports` (`kind` = `so4_…`) avec la mention « à vérifier ». Adresses : **aucune vérifiée en ligne** (pas de réseau le jour de l’écriture) sauf BillionGraves, Chronicling America, Trove, Delpher reprises de « Chercher sur internet » ; badge « adresse à vérifier ». Entrées : blocs Poilu, Cimetière, Dans les médias (→ fenêtre commune), monographie de commune (`placeHtml`), carte des patronymes. Test : `tests/test-sources-ouvertes-4.js`.

### Lot 5 — FamilySearch, WikiTree, Québec, émigration, métiers, URSS, photographes, Maitron, CCFr (lib/sources_ouvertes_5.php, app-sources-ouvertes-5-core.js, heritage-sources-ouvertes-5.js)

- **Rubriques (pays / thème)** : 🌍 Monde (`fs_records` = la même adresse que « FamilySearch », `fs_tree` si la fiche a un `familysearch_id`, `fs_catalog`, `wikitree` = la même que « WikiTree ») · 🍁 Québec et Acadie (`fichier_origine` → import `origine`, `cea_acadie`) · 🚢 émigration (`castle_garden` → `passager`) · 🇫🇷 service (`sainte_helene` → `medaille_sh`, `memorial_cheminots` / `_gendarmes` / `_policiers` → `mort_service`, recherche Google tant que leur adresse n’est pas vérifiée) · 🇫🇷 travail (`anmt` → `personnel`, `maitron` → `biographie`, `consulaire_nantes` → `acte`) · 🇫🇷 fonds (`ccfr`, `calames` → `fonds`) · 🇫🇷 lieux (`geneawiki`, commune « INSEE - Nom » ou département) · 📷 photographes (`daguerre`, `portraitsepia`, `gallica_annuaires`) · 🇷🇺 URSS (`pamyat_naroda` → `pamyat`, `memorial_urss` → `repression`, `sensitive`).
- **Import** (K13, `openImport`) : image, PDF, page enregistrée (texte seul), texte copié (`parseFields`, `detectKind`), lien (`parseLink` : identifiant FamilySearch, WikiTree, n° Fichier Origine). `proposals(kind, champs, {has})` propose seulement ce qui manque, chaque ligne cochée ou non : événements (jamais une deuxième naissance / un deuxième décès — vérifié aussi côté serveur), voyage (`save_voyage`), récompense (`blocs_save_item` award), ligne dans la chronologie d’un employeur (fiche créée si absente) + métier « Employeur : … » (lu par `employer_event_mentions`, la personne apparaît dans « La famille chez cet employeur »), note, `familysearch_id` (seulement s’il était vide). Toujours : média relié, source avec le lien, « À vérifier », « c’est la même personne ? » (POST `so5_preview`, rien n’est écrit).
- **Annuler** : la table commune `so_imports` (kind `so5:…`) ; POST `so5_undo` retire tout (événements, voyage, récompense, note, fiche d’employeur créée ou ligne ajoutée, média non relié ailleurs) et remet l’identifiant FamilySearch.
- **Respect** : l’événement « Répression politique (URSS) » (slug `repression-politique-urss`) → `so5_respect_ids` → « mem » dans `mode_simple_data` : jamais dans un jeu.
- Test : `tests/test-sources-ouvertes-5.js`.

### Lot 6 — bibliothèques régionales, auteurs, gens de mer, notaires, HisKi, Old Bailey, sites payants (lib/sources_ouvertes_6.php, app-sources-ouvertes-6-core.js, heritage-sources-ouvertes-6.js)

- **Bibliothèques par région** (`regionOf`, `libraryFor`) : département (nom, n°, code INSEE) ou ancienne région → Numelyo + Lectura Plus (ARA), Rosalis (Occitanie), Mémoire vive (BFC), Normannia (Normandie), Yroise (Bretagne, + Loire-Atlantique). Fiche d’un village et monographie : ligne `.so6-place` (liens de la région, « 📚 Autres bibliothèques… », « ⤒ Importer… » relié au **lieu** : `place_id`, source reliée au lieu, média relié à cette source).
- **Auteurs** (IdRef, data.bnf.fr ; Wikisource) : bouton « ✍️ IdRef · data.bnf (auteur) » seulement si `so6_context.is_author` (profil artist, writer, scientist, inventor, explorer, collector, ou une fiche book / work / publication…). `parseAuthority` lit le texte copié, la page enregistrée, l’UNIMARC XML d’IdRef (001, 103, 200, 340, 010) et le JSON / JSON-LD de data.bnf. Import : naissance et décès proposés seulement s’ils manquent, lien ajouté à « Fiches en ligne » (`person_online_sheets`, retiré par ↶ Annuler).
- **Gens de mer** (`maritime(port)`, `PORTS`) : quartier → arrondissement maritime → centre du SHD (Cherbourg, Brest, Lorient, Rochefort, Toulon) + Archives départementales du port (liste de l’app via `so_context`). Répartition **indicative**, écrite comme telle. **Notaires** : `minutierCote` (MC/ET/XLVIII/312 → étude 48, article 312). L’import des marins et des notaires passe par la fenêtre du 2e lot (`ext.sourcesOuvertes2.openImport`, sortes `shd_marin`, `minutier`) — pas de deuxième import.
- **HisKi** (`parseHisKi`, `hiskiEvents`) : lignes à cocher (baptême → naissance + baptême, sépulture → décès + inhumation, départ) ; jamais de mariage créé. **Old Bailey** (`parseOldBailey`) : référence t17800628-33 → date, crime / verdict / peine traduits, événement « Accusé / Victime / Témoin au procès ».
- **Serveur** : GET `so6_context` ; POST `so6_preview`, `so6_import` (multipart, sortes `auteur`, `hiski`, `oldbailey`, `document`), `so6_undo`. Table `so_imports` (lot `so6-…`), `so_store_file`, `so_undo` : pas de migration. Naissance, baptême, décès, inhumation jamais en double.
- Adresses : aucune n’a pu être ouverte en ligne (pas de réseau) ; `verified` dit 'oui' (déjà dans l’app, 08/10/2026), 'partiel' ou 'non' ; toutes se changent dans « ⚙️ Adresses des sites » (`genealogie-sources-ouvertes-6-sites`). Test : `tests/test-sources-ouvertes-6.js`.

### Lot 7 — Archives Portal Europe, Justes, enfants assistés, MonumentsMorts, cercles, Allemagne, cadastres anciens (lib/sources_ouvertes_7.php, app-sources-ouvertes-7-core.js, heritage-sources-ouvertes-7.js)

- **Adresses** : AUCUNE n’a pu être ouverte le jour où elles ont été écrites (réseau fermé) : `verified: 'non'` partout, forme connue des sites (MediaWiki `index.php?search=` pour les wikis, `search/results/?query=` pour Arcanum, Google `site:` sinon). Elles se changent dans « ⚙️ Adresses des sites ».
- **Déjà dans d’autres lots (pas refaits)** : registres des bagnards ANOM (lot 2, `anom_bagnards`), Yad Vashem — base des Justes (lot 3, `yv_justes` ; ici seulement le Comité français), BillionGraves avec import des photos de tombes et « c’est la même personne ? » (lot 4, kind `sepulture`), Archives de Paris état civil reconstitué et listes électorales (lot 3 ; ici seulement les enfants assistés).
- **Import** (K13, `openImport`) : image, PDF, page enregistrée (texte seul, `parseSavedPage` du lot 1), texte copié (`parseFields`, `detectKind`), lien (`parseLink`). Sortes `KINDS` : `acte` (événement BIRT/CHR/DEAT/BURI/RESI/OCCU/EVEN proposé, jamais en double pour un événement unique), `juste` (récompense « Juste parmi les nations » dans 🏆), `enfant` (ligne `child_placements` + bloc « Enfant placé » montré ; même matricule = gardé), `monument` et `carte` (média relié au **lieu** — et à une fiche si choisie — avec sa source), `presse` (Arcanum : l’import « presse » commun `so_import`). « C’est la même personne ? » (POST `so7_preview`) ; « Pas sûr » garde seulement le document et la source.
- **Annuler** : table commune `so_imports` (kind `so7_…`) ; POST `so7_undo` retire le placement créé (et remet la case du bloc), puis `so_undo` le reste. Aucune migration.
- **Respect** : `so7_respect_ids` (toute récompense « Juste parmi les nations », de ce lot ou du lot 3) → « mem » dans `mode_simple_data` et `tresor_tree` : jamais dans un jeu.
- Test : `tests/test-sources-ouvertes-7.js`.

## 🏠 Héritages et successions (heritage-successions.js, successions.css, lib/successions.php)

Qui a hérité de quoi d’après les actes. Listes → Médias et documents → « 🏠 Héritages et successions » (`ext.lists.successions`, `state.succId` pour la fiche d’un acte). Construit sur l’existant, sans outil en double : les biens renvoient aux **maisons** (outil Maison), aux **parcelles** (Cadastre) et aux **objets de famille** (dont la « Transmission » entre dans la chaîne) ; un inventaire après décès se **relie** à sa fiche de la liste « Inventaires après décès » (on ne le recopie pas).
- **Base** (migration 81) : `succession_acts` (sorte `testament|partage|inventaire|donation|vente|contrat|declaration|autre`, date C4 + `year`, notaire fiche ou texte, étude, lieu, cote, source, `probate_id`, `media_json`, notes, `deleted_at` pour « ↶ Annuler »), `succession_people` (`zone` : `main` = le défunt ou le donateur, `primary` = héritiers et bénéficiaires, `secondary` = autres ; rôle libre), `succession_goods` (`kind` : `house|parcel|object|land|money|furniture|other`, `ref_id`, texte, valeur + monnaie, valeur écrite, part, `to_json` = clés des personnes qui reçoivent : « 12 » ou « txt:Nom » ; vide = tous les bénéficiaires).
- **API** : GET `successions`, `succession&id`, `succession_chain&kind=house|parcel|object&id`, `successions_person&id` ; POST `save_succession` (remplace tout ; rend `before` pour « ↶ Annuler » une modification), `delete_succession`, `restore_succession`. Fiches absentes retirées, sortes forgées refusées, bornes (200 personnes, 300 biens). La fiche d’une personne lit `heritage.successions` (`successions_for_person` : `side` = `got` / `gave` / `other`, biens reçus) sans jamais écrire.
- **Écrans** : fenêtre de l’acte (personnes par le menu de choix à rôles avec `zones` « Héritiers et bénéficiaires » / « Autres personnes » ; notaire `allowFree` ; lieu, source, inventaire (sorte `probate`) ; biens : maison `house`, parcelle `parcel`, objet `fobject` par le menu de choix, cases « À qui » (K16) ; images par `mediaField`) ; liste H10 / K9 (« 🧮 Ouvrir dans le tableur ») ; fiche (`pickerView`, tableau des biens, 🔀 schéma de partage = `ext.diagramRender.svg({kind: 'sankey'})`, « 📊 Modifier dans Mes diagrammes » = `ext.openDiagramEditor(null, {spec})`) ; frise « Chaîne des propriétaires » dans l’outil Maison (`ext.housePaneExtras`) et l’objet de famille (`[data-succ-host="object"]`, n’importe quel `[data-succ-host=house|parcel|object][data-succ-id]` se remplit tout seul) ; bloc de fiche `successions` « 🏠 Ce qu’il a reçu / transmis ».
- **Valeur** : « ≈ … € d’aujourd’hui (ordre de grandeur) » par `LCNDA_AUTREFOIS.readSum` / `worth` (🪙 ouvre `ext.autrefois.open({tab: 'argent'})`), sinon `ext.tresorMoney.worth`. Jamais de conseil juridique : la phrase « ce n’est pas un conseil juridique » reste sous la liste, la fiche et la fenêtre.
- API JS : `ext.successions = {open(id, {dialog}), edit(acte, {person, good}), chainHtml, shareSpec, reload, titleOf, recipients}`. Test : `tests/test-heritages.js`.

## 🗓 Ma semaine de recherche (lib/semaine.php, heritage-semaine.js, semaine.css)

- **Existait déjà** : le widget « Liste de travail quotidienne » (rappels, sources d’enquête, lacunes d’archives, battues ; ni ✓ ni report). **Il devient** « 🗓 Ma semaine de recherche », même type `daily_research` (les tableaux de bord qui l’avaient le gardent, et la page « Ma recherche du jour » des onglets prêts) : `ext.dashboard.daily_research` (load / render) prend la place de l’ancien dessin, dans le tableau de bord **et** la page du Suivi (même moteur). L’ancienne donnée `data.daily_research` du tableau de bord n’est plus lue.
- **Données** (GET `semaine`, rien de recopié) : 🔔 rappels libres et de pistes (`reminder_list_rows`, en retard / du jour / des 7 jours), ✉️ courriers sans réponse (`courriers`, relance dépassée / de la semaine / « réponse attendue depuis N jours »), 🏛 visites (`archive_visit_plans` sans `done_at`, 30 jours), 🔍 pistes à explorer (`investigation_items`) et hypothèses ouvertes (`hypotheses`), 💡 « Que manque-t-il ? » (`research_gaps_data`, pas ce qui est déjà dans le suivi des dépouillements ; les lignes `socface` donnent « Recensement de 1906 à Tulle : chercher sur SocFace » et le lien `LCNDA_SOCFACE.searchUrl`, deux par ancêtre au plus), ⚠️ à vérifier (foyers SocFace `verified=0` si lib/socface.php est là, alertes 🔴 / 🟠 de `controle_state`), 🤝 entraide (`help_requests` ; « Réponse reçue » = aujourd’hui), ✓ fait depuis lundi (`research_journal_data` avec un résultat, rappels faits, visites faites, réponses reçues, demandes résolues, ✓ du widget). Urgences : `late`, `today`, `week` (7 jours), `later`, `done`.
- **✓ / ⏭ / ↶** (POST `semaine_mark {op, key, until, prev}`) : ✓ fait = la vraie action (rappel fait `set_reminder_done`, courrier « Réponse reçue », visite faite `save_archive_visit_done`, piste « Explorée », foyer « Vérifié sur l’image » `socface_verify`, demande « Résolue ») ; pour une hypothèse, une recherche proposée ou une alerte du contrôle, une **marque** « fait ». ⏭ = la vraie date (rappel, relance du courrier) ou une marque « reporté jusqu’au … ». La réponse porte `prev` : `op: 'restore'` remet l’avant (valeurs vérifiées une à une). Marques dans `app_settings`, clé `lcnda-semaine-marks` (jamais envoyée au navigateur, ménage tout seul) : pas de table de plus. Clés acceptées : `rappel:s|i:N`, `courrier|visite|piste|hypo|socface|entraide:N`, `manque:…`, `controle:…`.
- **Écran** : compteurs K8, sections par urgence (ou par sorte), ligne = icône, titre, ligne grise, ↗ / ✓ / ⏭ (menu `UI.menuAt` « À demain / À la semaine prochaine »), clic droit K14, « Voir les N suivants ↓ » (C6), K10 quand il n’y a rien ; ⛶ en grand (`modal-xl`, `.segmented` Aujourd’hui / Cette semaine, filtres C5 `.ui-filters` avec le nombre, Tab passe d’un filtre à l’autre) ; 🧩 « Une chose à la fois » (`html.a11y-simple`) : la chose la plus urgente seule, en gros boutons. Après ✓ ou ⏭ seuls les widgets ouverts sont relus (`ext.semaine.refresh`).
- **Réglage K2** (`ext.dashboardConfig.daily_research`, sans « Enregistrer ») : Montrer Aujourd’hui / Cette semaine (`horizon`), Ranger par urgence / par sorte (`group`), sortes cochées et leur ordre (⠿, Alt + ↑ / ↓ : `sortOrder`, `hiddenSorts`), nombre de lignes par rubrique (`limit`), largeurs 1 ½ ⅓ ¼ ⅔ ¾, « ↺ Remettre comme au départ » (H7 ↶ Annuler), « Fermer ».
- Test : `tests/test-semaine-recherche.js`.

## 🌍 Où chercher ? et 🧩 Murs de brique (lib/ou_chercher.php, app-ou-chercher-core.js, heritage-ou-chercher.js, ou-chercher.css)

- **Existait déjà, réutilisé tel quel** : le registre des sites de « Chercher sur internet » (`A().webSearchAllSites()` : app.js, `ext.webSearchExtra` des lots, « Mes sites ») et les registres des lots « sources ouvertes » (`window.LCNDA_SOURCES_OUVERTES`, `_2`…`_N`, `LCNDA_SO4` : `SITES`, `GROUPS`, `url(clé, p, adresses perso)`, `copyText`) — **lus à chaque appel** (`ext.ouChercher.allSites()`, recherche des globales par leur nom) : un lot ajouté plus tard compte tout seul, sans toucher ce code ; les adresses sont remplies par `A().webSearchParams` (le même mécanisme que les boutons « Chercher sur… ») ; « Gratuites seulement » = `ext.sourcesOuvertes6.freeOnly()` (clé `genealogie-sources-gratuites`) ; le Journal des recherches, les enquêtes et leurs pistes, « Ma semaine de recherche », le moteur de widgets, les numéros Sosa (`sosa_positions`), `gaps_archive_of` / `so_department` (département et site des Archives).
- **Pertinence** (`window.LCNDA_OU_CHERCHER`, aussi `require()` dans Node) : `context(GET ou_chercher_person)` → années, pays (`canonCountry` : « ITALIA », « Torino, Piemonte » → `it`), départements, profils (soldat, marin, émigré, notaire, héritage, déporté, fusillé, résistant, enfant placé, protestant, famille juive, cheminot, gendarme, élu, médecin, photographe…), manques (`birth`, `death`, `parents`, `father`, `mother`, `marriage`) ; `score(site, ctx)` → note, phrases du **pourquoi** (« Né en 1890 en Corrèze : il a sans doute fait la guerre de 14 »), raison d’écarter ; `rank(sites, ctx, {freeOnly})` → proposés, déjà cherchés, écartés ; un payant n’est jamais en tête.
- **Règles d’un site** (toutes facultatives, sans changer les entrées des lots) : `RULES[clé]` dans le moteur, ou dans la définition d’un site d’un lot le champ `rel: {countries, from, to, born, sex, profiles, require: ['profile'], events, missing, base, why, paid}` ; les champs que les lots ont déjà sont lus aussi (`country` / `countries`, `years`, `where` / `on` → profil, `place`, `region`, `paid`, `partlyPaid`, `needs`). Un lot peut aussi appeler `LCNDA_OU_CHERCHER.addRules({clé: règle})`.
- **Données** (lib/ou_chercher.php) : GET `ou_chercher_person&id=` (événements avec département, profils, manques, `searched` = dépouillements du Journal dont `template_key` vaut `ouc:<clé du site>` et où la personne est cherchée, pistes, mur) ; GET `murs_de_brique` (ancêtres Sosa sans père et/ou mère, de la racine de « Que manque-t-il ? », + marqués à la main ; un mur suivi dont les parents arrivent passe « Résolu » tout seul → `newly_solved`, message de félicitation) ; GET `mur_de_brique&id=` (Journal, courriers de ses événements, pistes, hypothèses, indices : homonymes nés 16-55 ans avant ou à 12 ans près, témoins / parrains `event_witnesses`, foyer dans un recensement, correspondances ADN au même nom) ; POST `mur_save {person_id, manual?, status?, note?}` → `prev`, `mur_restore` (↶ Annuler) ; POST `ou_chercher_piste` (piste « à explorer » dans l’enquête ouverte de la personne, créée une fois : « Où chercher ? — Nom »). Table `brick_walls` (migration 83).
- **✓ Déjà cherché** : POST `save_archive_digest` existant (`template_key: 'ouc:<clé>'`, `status: done|review`, `result: found|none`, `sought_ids`) → visible dans le Journal des recherches ; ↶ Annuler = `delete_archive_digest`.
- **Écrans** : bloc de fiche `ou_chercher` (5 premiers, `ext.personBlocks`), fiche ⋯ (`ext.personMoreItems` : « 🌍 Où chercher ? », « 🧱 Je bloque ici »), Recherche → « 🌍 Où chercher ? » (`ext.ouChercher.page`, menu de choix de la personne, pastilles C5 Proposés / Déjà cherchés / Écartés avec la raison) et « 🧩 Murs de brique » (H10 `recherche:murs`, K8, K4, fenêtre d’un mur : statut, déjà cherché, à essayer, indices, note gardée toute seule), widget `brick_walls`, « Ma semaine » (`ouc_semaine_rows` : un mur par semaine, clé `mur:<id>:<année+semaine>`, ↗ ouvre le mur). Aucune requête sortante : le navigateur de la personne ouvre les sites.
- Test : `tests/test-ou-chercher-murs.js`.

## ⚖️ Dossiers de preuve et 🛡 solidité des liens (lib/preuve.php, heritage-preuve.js, preuve.css)

- **Existait déjà, gardé à sa place** : « ⚖️ Hypothèses à comparer » (plusieurs réponses possibles, `lib/hypothesis_compare.php`) et les « Preuves » de la fiche (`evidence_records`) ; les citations (`source_links`, qualité QUAY 0–3 venue des imports GEDCOM / Gramps / RootsMagic), le Journal des recherches (`archive_digest_entries`, sorte `digest` du menu de choix), `sosa_positions`, les Murs de brique et Où chercher ? (`ext.ouChercher`), « Ma semaine » (lignes du serveur), le moteur de widgets. **Ajouté** : le dossier de preuve (une question oui / non et son raisonnement), la solidité de chaque lien parent-enfant, la sorte `citation` du menu de choix.
- **Données** (migration 88) : `proof_cases` (sujet `parent | couple | date | place | identity | other`, `person_id`, `related_id`, `event_id`, question, conclusion, certitude `tocheck | proved | probable | possible | refuted`, `deleted_at`) ; `proof_items` (sorte `for | against | research | conflict`, texte, `ref_kind` `source | citation | digest` + `ref_id`, indice `direct | indirect | negative`, qualité `original | derived | authored`, résolution d’un désaccord, `deleted_at`) ; `link_strength` (niveau choisi à la main). Supprimer = mis de côté (`deleted_at`), `restore_*` le remet (H7) ; ménage après 30 jours. Fiche verrouillée : rien ne s’écrit.
- **API** : GET `preuve&op=list | case&id= | find&subject=&person_id=&related_id=&event_id= | person&id= | link&child_id=&parent_id= | pairs&ids= | fragiles | summary | rules` ; POST `preuve_write {op: save_case | delete_case | restore_case | save_item | delete_item | restore_item | manual_set | manual_restore}` (les réponses portent `prev` pour « ↶ Annuler »).
- **Solidité** (`solidite_compute`, une lecture de la base, jamais une requête par lien ; gardée dans `DATA_DIR/cache/solidite.json` tant que `solidite_signature` ne bouge pas ; monter `PREUVE_VERSION` quand une règle change) : 1. le dossier « parent » de ce lien s’il a une conclusion (prouvé, probable, possible → supposé, réfuté) ; 2. le choix à la main ; 3. les citations : sur la naissance / le baptême de l’enfant qui **nomment** le parent (même source citée sur le parent, ses événements ou sa famille ; ou prénom + nom du parent dans le titre de la source, la page, la note ou la citation détaillée ; ou un média posé sur l’acte et sur le parent) → prouvé (QUAY 3 ou non notée), probable (QUAY 2), supposé (QUAY 0–1) ; acte cité sans nommer → probable ; mariage de l’enfant pareil ; fiche de l’enfant / famille → probable si elle nomme, sinon supposé ; d’autres sources sur l’enfant → supposé ; rien → sans source ; naissance « doute » → supposé au plus. Phrases du pourquoi : `solidite_why`, règles : `solidite_rules` (aussi dans la fenêtre et la FAQ).
- **Écrans** : fiche (pastille K8 `.pv-sol` à côté de chaque parent → fenêtre du lien : pourquoi, « ⚖️ dossier », choix à la main ; ⋯ → « ⚖️ Dossier de preuve… » : `ext.personMoreItems`) ; fenêtre du dossier (`ext.preuve.openCase`, grande K6, certitude en `.segmented`, question et conclusion gardées toutes seules, lignes ✎ / × + ↶, 🖨 L1 `UI.openPrintDialog` clé `preuve`, 📝 `ext.openTextDoc`) ; Graphiques (ascendants, descendants, sablier) : interrupteur « 🛡 Vue solidité » (`genealogie-tree-solidite`) → `.tree.lc-sol-on li[data-sol]` (seuls la couleur, l’épaisseur et le style des traits changent : la forme des designs A1 / A5 reste), légende `.lc-sol-legend`, clic droit sur une case ou un trait (K14) ; Listes → Recherche et organisation → `proof_cases` et `fragile_branches` (H10, K9, K14) ; widget `fragile_widget` ; « Ma semaine » : `preuve_semaine_rows` (clé `solidite:<enfant>:<parent>:<année+semaine>`).
- Test : `tests/test-preuve-solidite.js`.

## 📜 Aide à la lecture des actes anciens et 🪙 Convertisseur d'autrefois (app-aide-lecture.js, app-autrefois-engine.js, heritage-lecture-autrefois.js, lecture-autrefois.css)

Un seul outil chacun, réunissant ce qui était éparpillé (anciennes listes du Glossaire, « Unités anciennes », « Monnaies anciennes » et « Pouvoir d’achat » de Calendrier / mesures, tables du pouvoir d’achat des Trésors). Tout dans le navigateur, sans requête ni écriture (aussi en consultation).
- **Données et calculs** (aussi `require()` dans Node) : `window.LCNDA_AIDE_LECTURE` — `ENTRIES` (latin, formules par acte, abréviations dont celles des recensements relues par SocFace), `LETTERS` (formes anciennes, dessin SVG maison `glyphSvg`, trait `currentColor`), `EXERCISES` (src « vu=lu|autre »), `search(q, {kind, acte, limit})`, `counts`, `correct(exercice, réponse)` (alignement mot à mot : ok / faux / manque / trop, explication). Les vieux mots des Trésors (`ext.tresorWords`) et `LCNDA_LECTURE.ABBREV` sont ajoutés à la recherche quand ils sont chargés. `window.LCNDA_AUTREFOIS` — `readSum`, `worth(somme, année, {wageSols})` (parités exactes ; INSEE à partir de 1901 : indice du convertisseur franc-euro, base 2025 ; avant, ordre de grandeur raccordé en 1901 ; `steps`, `warn`, `source`), `readMeasure(texte, région)` (régions de `ext.calendarMore.REGIONS`, ici + Paris + toutes, mètres / ares / litres pour l’inverse), `republican(texte)` dans les deux sens (moteur `LCNDA_SHEET`, comme C4), `republicanYear(an)`.
- **Écrans** : `ext.readingAid.open({tab: 'dict'|'lettres'|'exos', q})` / `.mount(el)` ; `ext.autrefois.open({tab: 'argent'|'mesures'|'calendrier', value, year})` / `.mount(el)`. Onglets `.ui-tabs`, case C1 (`UI.searchField`), pastilles C5 `.ui-filters` avec le nombre, ✓ Compris / ⚠️ sous les cases (L5 `.ui-hint`), K10 `.empty-line`, K8 `UI.badge`, « 📋 Copier ». Fenêtre `openDialog` large, « Fermer » seul. Onglet et région retenus (`lcnda-aide-lecture-tab`, `lcnda-autrefois-tab`, `lcnda-autrefois-region`), meilleurs scores des exercices (`lcnda-aide-lecture-scores`) : réglages de confort, dans le navigateur.
- **Entrées** : bouton et menu Outils de la transcription d’actes (`data-tx-cmd="aide"`, le mot choisi est cherché) et ses boutons dans Outils de modification ; recherche rapide ⌘K (deux écrans + les mots du dictionnaire) ; ⋯ de la fiche ; Réglages → Glossaire (`readingAidsHtml` pose l’aide) et Calendrier / mesures (le convertisseur posé dans la page + boutons de l’en-tête) ; Trésors (pouvoir d’achat, vieux mots) ; sous une date C4 en calendrier républicain « 🪙 Convertir » (`.ui-date-more`). N’importe quel bouton : `data-la-open="mot"`, `data-autrefois-open="argent|mesures|calendrier"` (+ `data-autrefois-value`).
- Test : `tests/test-lecture-convertisseur.js`.
- **Les langues des actes** (une langue = un fichier `assets/js/aide-langues/<code>.js`, format décrit dans `assets/js/aide-langues/README-format.md`) : chaque fichier s’enregistre dans `window.LCNDA_AIDE_LANGS` (et `module.exports` pour Node) ; `app-aide-lecture.js` lit ce registre à chaque recherche (dans Node : tous les fichiers du dossier). `index.php` charge les fichiers entre `<!-- aide-langues … -->` et `<!-- aide-langues : fin -->`. Le français (formules, abréviations) reste dans `app-aide-lecture.js` ; le latin est passé dans `la.js` (l’ancienne sorte `kind: 'latin'` = `lang: 'la'`). Faits ici : latin, grec (`grc`), allemand, italien, espagnol, polonais, néerlandais ; d’autres langues sont ajoutées par le même format.
  - Données : `entries` `{t, d, k: mot|mois|nombre|metier|parente|formule|abrev, a: bapteme|mariage|deces|general, alt, ex}`, `letters` + `glyphs` (dessins SVG maison, ids préfixés par le code), `exercises` (textes **modèles**, `notes` = explication d’un mot à revoir), `sources`, `ocr` (codes de la « Langue du texte » de la transcription), `script`, `dir` (rtl pour l’hébreu, l’arabe…), et facultatifs `translit(mot)` (écritures en lettres latines, pour la recherche et la correction), `alphabet`, `numerals {label, to, from, examples}` (grec : α΄ = 1 … ͵α = 1000, avec ϛ, ϟ, ϡ).
  - Moteur : `fold` (sans accents ; ł = l, ß = ss, ø = o, ς = σ, esprits et accents grecs retirés), `langs()`, `langOf(code)`, `langForOcr('deu') → 'de'`, `search(q, {kind, acte, lang})`, `counts(q, acte, lang)`, `langCounts(q, {kind, acte, type})`, `known(texte, lang)` (mots connus trouvés dans un texte, formes avec une terminaison en plus et expressions de 2-3 mots), `translitOf`. Les lettres anciennes communes (s long, abréviations…) valent pour toutes les langues en lettres latines.
  - Écran : pastilles C5 « Langue » (« Toutes les langues (n) », « Allemand (n) »…) sur les trois onglets (`data-la-lang`, retenue : `lcnda-aide-lecture-lang` ; un mot cherché depuis ailleurs ouvre toutes les langues), phrase d’introduction de la langue (`.la-intro`), sources sous la liste (`.la-sources`), `lang` / `dir` sur chaque mot, alphabet et 🔢 convertisseur de nombres (`[data-la-num]`, L5 ✓ Compris / ⚠️). `ext.readingAid.open({tab, q, lang})` (`lang` = « de » ou « deu »), `data-la-open-lang` sur un bouton.
  - Branchements : transcription d’actes — « Langue du texte » (retenue : `genealogie-tx-lang`, + les codes `ocr` des langues chargées), « 📜 Aide à la lecture » s’ouvre sur cette langue, « 🧭 Repérer » ajoute « 📜 Mots connus » (`.h-tx-chip.is-word`, clic = l’aide sur ce mot), la relecture de « ✨ Lire l’acte » montre les mots connus et leur traduction (`[data-htr-known]`) ; recherche rapide ⌘K (le mot s’ouvre dans sa langue).
  - Sources des listes : FamilySearch Research Wiki — *Latin / Greek / German / Italian / Spanish / Polish / Dutch Genealogical Word List* (familysearch.org/en/wiki/…_Genealogical_Word_List), *German Handwriting*, *Spanish Handwriting* ; GenWiki (wiki.genealogy.net : Kurrent, Sütterlin, anciens noms des mois, termes latins des registres) ; J. Shea et F. Hoffman, *In Their Words* (vol. Polish) ; Wikipédia (numération grecque, calendrier byzantin). Un mot dont on n’est pas sûr n’est pas mis.
  - Test : `tests/test-aide-langues.js` (chaque fichier chargé par index.php : format, exercices à 100 %, dessins, sources ; les 7 langues complètes ; « malzonkowie », « huios » ; filtre ; nombres grecs ; transcription en allemand → aide en allemand ; navigateur 1440 / 390 / sombre).
  - **Langues d’Europe du Nord, de l’Est et régionales** (`oc`, `br`, `eu`, `cs`, `sk`, `hu`, `sv`, `da`, `no`, `ro`, `hr`, `sl`, `lt`), même format, chacune avec mots des trois actes, mois (anciens noms quand ils existent : suédois Torsmånad…, danois Glugmaaned…, hongrois Boldogasszony hava…, roumain Gerar…, slovène svečan…), nombres et âges, métiers, parenté, formules, exercice(s) **modèles** corrigés à 100 %, sources (FamilySearch *… Genealogical Word List* de chaque langue, archives nationales ; Euskaltzaindia, Congrès de la lenga occitana, Office public de la langue bretonne pour les trois langues régionales).
    - **Occitan, breton, basque** : rares dans les registres (latin, français, espagnol) ; l’`intro` le dit. On les lit surtout dans les surnoms, lieux-dits et noms de maisons (Ker-, Plou-, mas, borda, Etxeberri), les inscriptions funéraires (« Amañ e c’hourvez », « Hemen datza », « Goian bego ») et les actes de notaires médiévaux (occitan). Breton : `c’h` cherché aussi « ch ».
    - **Scandinaves** (`sv`, `da`, `no`) : registres luthériens, patronymes -son / -sen / -datter (-dotter), « aa » = å, mois latins (Martii, 7br.), dates par les dimanches (Dom. 3 p. Trin.), dessins maison de l’écriture gothique (e, u, å, ä/ö, ø, aa). `ø` ne se défait pas en NFD : chaque mot avec ø reçoit les formes `o` et `oe` dans `alt` (« soen » trouve Søn). Danois : `numerals` pour les nombres par vingtaines (halvtreds = 50, treogfirs = 83, années « atten hundrede og tooghalvtreds » = 1852 ; dans les deux sens, 1–9999).
    - **Europe centrale** : tchèque (ancienne orthographe w = v, g = j avant 1849, háček), slovaque, hongrois (nom avant prénom, « -né » = épouse de, « szül. » = née, date année-mois-jour, état civil d’État au 1er octobre 1895, Hungaricana), croate (`đ` cherché aussi « dj » et « d » ; listopad = octobre, ≠ tchèque), slovène (bohoričica : ſh = š, zh = č), lituanien (-ienė, -aitė / -ytė ; registres surtout en polonais, latin, russe).
    - **Roumain** : lettres latines + `alphabet` et dessins de l’ancien alphabet cyrillique roumain (ш = ș, щ = șt, ц = ț, ѣ = ea, ъ = ă, ѫ = â / î, ȣ = u…), calendrier julien jusqu’en 1919.
    - Test : `tests/test-aide-langues-b.js` (Node : chaque langue chargée par index.php, mots / mois / nombres / formules / exercice à 100 %, recherche sans diacritiques — « szuletett », « brezna », « soen », « rodjen », « krikstas », « chourvez »… —, nombres danois ; navigateur 1440 / 390 / sombre sans erreur ni débordement).
  - **Portugais, catalan, anglais ; cyrillique, hébreu, yiddish, arménien, arabe** (`pt`, `ca`, `en`, `ru`, `uk`, `he`, `yi`, `hy`, `ar`), même format, chacune avec mots des trois actes, mois, nombres et âges, métiers, parenté, formules, exercice(s) **modèles** corrigés à 100 %, sources (FamilySearch *… Genealogical Word List* / *… Church Records* de chaque langue, et les références propres citées dans `sources`).
    - **Anglais** : registres anglicans (bachelor / spinster, by banns / licence, relict, base born, double date 1723/4 avant 1752), abréviations des recensements britanniques (1841 : Y/N, S/I/F, âges arrondis ; Ag. Lab., F.S., Unm., Do) et américains (Na, Al, Pa), en-têtes et marques des listes d’Ellis Island (S.I., L.P.C., Detained…) ; `a: 'recensement'` pour ces lignes.
    - **Russe** (`ru`) : métriques orthodoxes, orthographe d’avant 1918 (ѣ, і, ѳ, ѵ, ъ final ; la forme d’aujourd’hui dans `alt`), calendrier julien (+12 / +13 jours), dessins maison de l’écriture à la main (т = m, и = u, п = n, д = g, ш, б = 6) ; `translit` en 3 lectures (française, anglaise, ISO 9 sans signes) ; `numerals` : nombres en lettres cyrilliques avec titlo (҂аѿв҃і = 1812 ; 11-19 : l’unité d’abord). **Ukrainien** (`uk`) : г = h / g, и = y, є, ї, ґ ; `translit` française, officielle 2010 et « à la russe ».
    - **Hébreu** (`he`) et **yiddish** (`yi`) : `dir: 'rtl'`. Hébreu : formules des tombes (פ״נ, פ״ט, תנצב״ה, ז״ל, ע״ה, נ״ע, ב״ר, הכהן, הלוי, לפ״ק…), mois hébreux, `alphabet` (22 lettres et valeurs), dessins des lettres qui se ressemblent (ב/כ, ד/ר, ה/ח/ת, ו/ז/ן, ס/ם, ״ ׳) ; `numerals` (ט״ו = 15, ט״ז = 16, ה׳ = 5000 ; ״ et " acceptés) ; les mots sans signes (פנ, פ"נ) dans `alt` ; prononciations connues (`LAT` : « po nikbar », « tichri ») cherchées et montrées en premier, sinon le squelette des consonnes. Yiddish : `translit` YIVO (אַ a, אָ o, ע e, וו v, ױ oy, ײ ey, ײַ ay, ייִ yi, טש tsh, זש zh…) et à la française ; les mots sans points dans `alt`.
    - **Arménien** (`hy`) : `alphabet` (38 lettres, valeurs 1 … 9000), `numerals` (ՌՋԺԵ = 1915 ; ère arménienne : + 551), `translit` orientale (Grigor, Hakob) et occidentale (Krikor, Hagop, -եան = -ian) ; orthographe ancienne de la diaspora et réformée côte à côte.
    - **Arabe** (`ar`) : `dir: 'rtl'` ; formules des tombes (basmala, هذا قبر, المرحوم, توفي, versets 55,26 / 2,156 / 89,27), mois de l’hégire et mois du Levant, d’Algérie-Tunisie, du Maroc ; chiffres d’Orient ; `numerals` = abjad (valeurs d’Orient, jusqu’à 1999) + chiffres ١٣٢٠ ; formes sans voyelles ni hamza (ا pour أ, ه pour ة) dans `alt`.
    - Texte français mêlé d’hébreu ou d’arabe : chaque morceau de droite à gauche est entouré de U+2068 … U+2069 (`bidi()` en bas de `he.js`, `yi.js`, `ar.js`), sinon les nombres et la ponctuation changent de place.
    - Test : `tests/test-aide-langues-a.js` (Node : chaque langue chargée par index.php, mots / mois / nombres / formules / parenté / métiers / exercices à 100 %, sources FamilySearch ; recherche sans accents et en lettres latines — « krestianin », « devitsa », « narodyvsia », « tichri », « po nikbar », « geshtorbn », « knkahayr », « marhoum », « bismillah » — ; lettres-nombres dans les deux sens ; exercices corrigés aussi en lettres latines ; navigateur 1440 / 390 / sombre : pastilles, `dir="rtl"`, nombres hébreux et arméniens, alphabets, exercice russe, sans erreur ni débordement). `AIDE_LANGS_A_PORT`, `AIDE_LANGS_A_SHOTS`.

## 🩺 Santé de la famille (lib/sante.php, heritage-sante.js, sante.css)

Les maladies, handicaps, causes de décès et épidémies traversées connus dans la famille. **Mémoire familiale, pas un avis médical** (choix de l’utilisateur) : aucun conseil, aucun « parles-en à ton médecin », aucun calcul de risque ni pourcentage — seulement ce qui est noté et des nombres de personnes.
- **Table à part** `health_records` (migration 79) : `person_id`, `kind` (`maladie`, `handicap`, `deces`, `epidemie`, `autre`), `label`, `date_text` (C4) → `year`, `source_id` + `citation`, `note`, `to_check`, `world_id` (une épidémie de « Le monde autour »). Les causes écrites sur les décès / sépultures (`events.cause`) sont lues telles quelles (« d’après l’acte », non modifiables ici) ; les épidémies de son vivant viennent de `world_around(…, cats: épidémie)`.
- **Privé** : caché au départ — clé `genealogie-sante` `{show, epidemics}` (navigateur + `app_settings`, écrite tout de suite par POST `sante_write {op:'show'}`), lue par le serveur (`sante_visible`) ; caché ou en mode consultation, GET `sante` rend `{visible:false}`, les écritures sont refusées, la sorte `health` du menu de choix est vide, la liste disparaît de la colonne (`ext.listShown`, filtre d’`orderedListTypes`), le bloc ne s’affiche pas. Jamais lu par un export : seul le GEDCOM l’ajoute avec la case « 🩺 Inclure la santé de la famille » (`health=1`, `sante_gedcom_rows`, `1 EVEN` + `2 TYPE`). Pas de journal des modifications : « ↶ Annuler » renvoie la ligne supprimée (`op: delete` → `row`, `op: restore`). Jamais imprimé avec la fiche (`@media print`).
- **Écrans** : bloc `health` de la fiche (rangé comme les autres) ; Listes → `health_family` (barre H10 ; onglet « 🌳 Par branches » : éventail SVG des ancêtres coloré par la maladie choisie avec le menu de choix `kind: 'health'`, et « Les quatre côtés » = branches des grands-parents, GET `sante&op=branches&root&gens&label`) ; Réglages → Données → `sante` (K2). API : `ext.sante.{shown, open(pid), add(pid)}`. Test : `tests/test-sante-famille.js`.

## 🗓 Sauvegarde automatique, 🔄 Deux ordinateurs, 🔒 verrou (lib/sauvegarde_auto.php, lib/sync_dossier.php, heritage-sauvegarde.js)

Test : `tests/test-sauvegarde-sync.js` (API + navigateur). FAQ : « Comment régler la sauvegarde automatique… », « Comment avoir ma généalogie sur deux ordinateurs… ».

**🗓 Sauvegarde automatique** — Réglages → « 🗓 Sauvegarde automatique » (onglet `sauvegarde`, groupe « Données »). Remplace l'ancienne « Sauvegarde automatique programmée » d'Export propre (gardée dans le navigateur : ses réglages passent une fois côté serveur, puis elle s'éteint ; Export propre montre un lien).
- Réglages de **cet ordinateur**, pour toutes les généalogies : `SHARED_DATA_DIR/sauvegarde-auto.json` (`freq` off | hours | day | week, `every_hours` 1–168, `on_close`, `dir`, `keep` 2–100, `media`, `all`), remis d'aplomb par `sa_clean`. État : `sauvegarde-auto-etat.json` (`last`, `last_ok_time`, `last_error`, `missing`, signature de chaque base). Page K2 : chaque changement part tout de suite (`autobackup_settings`), « ✓ Enregistré » (`UI.pageSaved`), H7 « ↶ Annuler », « ↺ Remettre comme au départ ».
- **Quand** : la page ouverte (fenêtre principale) appelle `autobackup_tick` (GET) chaque minute ; `sa_due` décide (N heures, un jour de calendrier, 7 jours). Une base qui n'a pas changé (taille + date du fichier et du `-wal`) ne fait pas de nouvelle copie. **À la fermeture** : l'app de bureau appelle `autobackup_close` en quittant (`PhpServer.closeBackup()`, secret du processus principal, 2 min au plus) ; le navigateur envoie un `sendBeacon` POST (avec le jeton) en fermant l'onglet ; au plus une copie toutes les 2 minutes. Jamais en mode consultation ni en mode simple (aucun POST).
- **Copie** : `VACUUM main INTO` sur une connexion à part (photo cohérente, jamais le fichier ouvert recopié), dans un fichier caché `.…part`, puis `PRAGMA integrity_check` (+ nombre de personnes) **avant** de recevoir son nom `genealogie-backup-AAAAMMJJ-HHMMSS-xxxx-{auto|fermeture|manual}.db`. Résultat noté dans `lcnda-sauvegardes.json` du dossier. Rotation : seules ces trois sortes, les `keep` plus récentes ; les copies « -migration- », « -avant-… » ne sont jamais effacées. Médias : recopiés dans `media/` à côté (taille + date : seulement les nouveaux). Toutes les généalogies : la principale dans le dossier, les autres dans `genealogie-<id>/` (comme 🛟 Copie hors de l'ordinateur). Un verrou de fichier (`flock`) empêche deux copies en même temps.
- **Dossier absent** (clé débranchée) : `sa_check_dir` ne crée qu'**un** niveau (jamais un faux dossier « clé » sur le disque interne) ; sinon `{ok:false, missing:true, error}` en 200, message H7 au plus toutes les 6 h, nouvel essai toutes les 10 min.
- **Revenir à une copie** (`autobackup_restore`, avant `db()`, `confirmBox` danger) : copie temporaire, `integrity_check`, `validate_restore_database` (tables, version, déclencheurs retirés), base actuelle gardée « -avant-restauration », puis remplacée ; la page se recharge.
- Widget `autobackup_widget` « 🗓 Sauvegarde automatique » (dernière sauvegarde K4 + K8, 💾 Sauvegarder maintenant, ⚙️ Régler). ⌘⇧B passe par `LCNDA_EXT.autoBackup.now()`.

**🔄 Deux ordinateurs** — section en haut de Réglages → Travail à deux (`ext.syncFolderPanel`). Même moteur que 🤝 Travail à deux (lib/heritage_tools.php) : uid communs, `sync_snapshot` (point de départ commun), `sync_diff`, `sync_items` (états new / ok / same / missing / conflict), `sync_apply_core` / `sync_apply_row` (fiches verrouillées respectées), `sync_build_package`. Tables échangées : lieux utilisés, personnes, familles, enfants, événements, **sources, médias (métadonnées), notes, liens de médias, citations** (migration 80 : `uid` sur les quatre nouvelles ; pour un travail à deux déjà commencé, uid calculé d'après `base_uid` + numéro et mis dans le point de départ).
- Dossier : `<dossier>/LCNDA-deux-ordinateurs/<base_uid>/` → `paquets/` (un fichier `AAAAMMJJ-HHMMSS-<machine>-<paquet>.lcnda-changes.json` par envoi, écrit en `.part` puis renommé), `medias/` (fichiers des médias échangés, jamais écrasés), `ordinateurs/<clé>.json` (vu le…), `depart.db` (copie de départ à ouvrir sur l'autre ordinateur). Le chemin du dossier est gardé **par ordinateur** (`lcnda-sync.folders[clé]`) : Dropbox n'a pas le même chemin partout. Cet ordinateur : `sd_machine()` (nom d'hôte + dossier personnel ; `GENEALOGY_MACHINE_NAME` pour les essais).
- `sd_sync` = recevoir puis envoyer. Recevoir (`sd_pull`) : copie de sécurité « -avant-fusion-dossier » (5 gardées), paquets des autres ordinateurs pas encore reçus ni mis de côté, dans l'ordre ; tout ce qui est new / ok est appliqué ; conflict / missing → `sync_conflicts` (une fiche déjà en conflit le reste) ; tout est noté dans `sync_merges.undo_json` (lignes d'avant, point de départ d'avant, paquets, conflits). Envoyer (`sd_push`) : `sync_diff` **sans les fiches en conflit** (elles attendent le choix) → un paquet.
- Conflit côte à côte (`sd_resolve`) : « Garder la mienne » (le point de départ prend la version de l'autre : ta version repart chez lui sans nouveau conflit), « Prendre l'autre », « Garder les deux » (notes : la sienne ajoutée avec le nom de son ordinateur) ; `sd_reopen` = ↶ Annuler.
- ↶ Annuler une fusion (`sd_undo`) : lignes et point de départ remis, paquets « mis de côté » (`lcnda-sync.held`, plus repris tout seuls ; « Revoir » → `sd_review` → la revue du Travail à deux, `sync_apply` les retire de la liste) ; ↷ Rétablir (`sd_redo`). L'annulation n'est **pas** renvoyée à l'autre ordinateur.
- Tout seul : `sd_auto` (GET léger) puis `sd_sync` à l'ouverture et toutes les 15 min si « Synchroniser tout seul » est coché. Dossier absent : `{ok:false, missing:true}`, rien de perdu.
- Pas encore échangé : les autres outils (Atelier, tableaux, maisons, suivi des animaux, ADN…), les étiquettes, les réglages ; les témoins d'un événement ; la suppression d'une fiche défaite par ↶ Annuler revient sans ses liens retirés par `delete_person` (la corbeille du Journal les a).

**🔒 Verrou d'ouverture** — `DB_PATH.ouvert.json` (`key`, `label`, `since`, `beat`), posé et rafraîchi (au plus chaque minute) par `sd_lock_guard` avant `db()` dans api.php ; la page le rafraîchit chaque minute (`open_lock_status`) et le rend en se fermant (`open_lock_release`, `sendBeacon` ; l'app de bureau en quittant). Un autre ordinateur dont le verrou a moins de 5 min reçoit **423** `{open_lock: {label, since}}` pour toute action → `lcnda:open-lock` → fenêtre « 🔒 Généalogie ouverte ailleurs » (« ↻ Réessayer », « Ouvrir quand même » = `open_lock_take` après `confirmBox`).

## 🧬 Arbre des métiers et 🗺 Carte de la vie (lib/metiers_carte.php, app-metiers-carte-core.js, heritage-metiers-arbre.js, heritage-carte-vie.js)

- **Rien en double** : l'arbre est celui de Graphiques (`api tree`, cases `.tree-card`, designs A5, portraits K7, générations, zoom, ⤓ Exporter E3 + 🖨 L1) ; le classement des métiers réutilise le dictionnaire des métiers anciens (`trade_match`, 18 domaines → 12 grands secteurs `METIERS_SECTORS`, mots simples pour les métiers récents) ; la carte est la « 📖 Carte qui raconte » des diagrammes (`ext.storyMap` : `storySpec`, `go`, `located`, fonds hors ligne) ; la vidéo est le moteur des diagrammes (`ext.diagramPerso.recordSvgs(frames, {per})`, canevas + MediaRecorder).
- **🧬 Arbre des métiers** : Graphiques → « Arbre des métiers » (mode `occtree`, `ext.occTree.stage/bind/open`) ; barre au-dessus (pas exportée) : menu de choix de la personne, ⬆ / ⬇, C1 « Chercher un métier », filtres C5 par secteur, K16 « 🔒 Sans les vivants ni les fiches confidentielles ». Traits : `li.occ-li.is-same` (plein, couleur du secteur), `is-change` (« ⇄ »), `is-unknown` (pointillés). Statistiques : père → fils, mère → fille, par siècle (arbre : `LCNDA_METIERS_CARTE.stats`, base : `metiers_transmission_base`). GET `metiers_arbre&ids=…&base=1`. Réglages : `genealogie-occtree`.
- **🗺 Carte de la vie** : `ext.lifeMap.open(id)` (⋯ de la fiche, Carte → colonne « 🗺 Carte de la vie » et mode Itinéraire, ⌘K, FAQ). GET `carte_vie&person=&family=1&share=1` : étapes de la Carte qui raconte + recensements, voyages, placements, faits militaires (poilu_events), famille (conjoint, enfants pendant sa vie) ; écoles du bloc 🎓 ajoutées dans le navigateur. Ordre : année puis ordre d'arrivée (`orderSteps`). Lieux sans position listés à part. Vidéo (E3, MP4 ou WebM, copie dans les médias cochée) : `share=1` → jamais un vivant ni une fiche confidentielle. Vitesse de lecture `[data-c2-speed]` (aussi dans les diagrammes). Réglages : `genealogie-carte-vie`.
- `ext.personMoreItems` : liste de fonctions `detail → {icon, label, run}` ajoutées au ⋯ de l'en-tête de la fiche (app-sections.js).
- Graphiques → ⤓ Exporter propose maintenant aussi ✒ SVG (`exportGraphSvg`, pour tous les arbres).
- Test : `tests/test-metiers-carte-vie.js`.

## 📍 Images de lieux : « Où a-t-elle été prise ? » (lib/place_photos.php, heritage-place-photos.js, place-photos.css)
- **Construit sur l'existant** : le média (une seule place pour l'image ; date de prise de vue = `media.date_text`, C4), `media.place_id` (n°72), la fiche de carte postale (`postcards` : la retenue y écrit `place_id`, `view_lat/lon`, `view_bearing`), le comparateur `ext.openPhotoCompare({a, b, purpose: 'place'})` (même outil que 🔍 Comparer deux photos, sans visages : rideau par défaut, « 📌 2 repères par photo », « Ajuster à la main » tourner / taille / glisser B ; réglages `settings.purpose='place'`, `settings.adj {x, y, k, r}`), les 🤝 demandes d'entraide (`help_requests`, cible `place_photo`, photo reliée par `family_collection_media` type `help_request`) et ✉️ petites annonces (`press_ads`, sorte `recherche`, photo reliée type `press_ad`).
- **Tables** (structure n°85) : `place_photos` (media_id, kind, author, today_media_id, comparison_id, notes) et `place_photo_guesses` (place_id, lat/lon, zone_json, street, address, bearing, fov, certainty `certain|probable|possible|verify`, why, retained — une seule par image, index unique partiel —, author, origin `me|help_request|press_ad|forum|other`, origin_id).
- **Zones** : `{type: 'circle', lat, lon, r}` (5 m – 50 km) ou `{type: 'polygon', pts: [[lat, lon], …]}` (3 à 200 points, pas plate) ; refusées sinon avec une phrase claire (422).
- **Certitude (K8)** : vert certain, bleu probable, gris possible, jaune à vérifier (`LCNDA_EXT.placePhotos.CERT`).
- **API d'écriture** : POST `place_photo_write {op: info | guess | retain | delete_guess (→ snapshot) | restore_guess | ask (where help_request|press_ad) | answer (ask_type, ask_id, author… → nouvelle hypothèse + `undo`) | answer_undo}`. GET `place_photo&media_id=` (image + `asks`), `place_photo_help_text&media_id=&format=forum|geneanet|facebook|annonce`.
- **Lecture pour une couche de carte (cartes personnalisées…)** — à utiliser telle quelle, jamais un deuxième calcul :
  - GET `api.php?action=place_photos` avec filtres `place_id`, `street`, `from`, `to` (années), `certainty=certain,probable`, `unplaced=1`, `bbox=s,w,n,e`, `all=1` (filtre aussi sur les hypothèses non retenues), `limit` → `{items, total, streets, kinds, certainty, origins}`. Chaque item : `media_id, title, thumb, src, kind, date_text, year, decade, author, street, placed, retained, guesses[], today, comparison_id, postcard_id, updated_at` ; chaque hypothèse : `id, place{id,name,county,lat,lon}, lat, lon, zone, street, address, bearing, fov, certainty, why, retained, author, origin, at{lat, lon}` (`at` = le point à poser : point > centre de la zone > lieu). Une carte postale sans hypothèse donne une retenue « implicite » (`implicit: true`) tirée de sa fiche.
  - JS : `await LCNDA_EXT.placePhotos.list(filtres)` (mêmes filtres ; `certainty` peut être un tableau, `bbox` un tableau `[s, w, n, e]`) ; `await LCNDA_EXT.placePhotos.geojson(filtres)` → FeatureCollection (un Point par image ; zones : Polygon avec `properties.zone='polygon'`, cercle : Point avec `zone='circle'` et `radius_m`) ; `LCNDA_EXT.placePhotos.open(mediaId)` ouvre la fenêtre ; `onChange(fn)` et l'événement `lcnda:place-photos-changed` après chaque modification ; `miniMap(el, {guesses})` dessine zones, cônes et points.
- **Portes** : visionneuse (« 📍 Où a-t-elle été prise ? », images seulement), fiche de carte postale (lien à côté de « Lieu montré »), Listes → « 📍 Images de lieux » (H10 : Lieu, Rue, Époque, Certitude, Sorte, Situées ; tri « Par rue » / « Par époque » avec titres de groupes), bloc « 🖼 Images du lieu » (`data-pli-host data-pli-place`, fiche d'un village section `placeimgs`, monographie), calque de la Carte « 📍 Images de lieux » (`lcnda-map-place-photos`), demandes d'entraide (vignette 📍).
- Aucune requête sortante ; mode consultation : écritures refusées (kiosk_guard). Test : `tests/test-photos-lieux.js`.

## 🎉 Organiser une cousinade (lib/cousinade.php, app-cousinade-core.js, heritage-cousinade.js, cousinade.css)

- **Où** : Listes → Recherche et organisation → « 🎉 Cousinades » (liste `cousinades`, H10 + K9) ; Listes → Outils de modification (`ext.editToolsExtra`, clé `cousinade`) ; ⋯ de la fiche d’une personne → « 🎉 Organiser une cousinade… » (`ext.personMoreItems`). API : `ext.cousinade = {open(id), create({ancestor}), buildTree, badgePages, letterOf, reload}`.
- **Tables** (migration 86) : `cousinades` (ancêtre ou couple, personne de référence `ref_id`, date C4, lieu, `include_spouses`, `options_json` : `branchColors`, `invitation`, `badges`, `tables`, `album`, `tree`) et `cousinade_guests` (fiche ou nom libre, `spouse_of`, `branch_id`, `foyer`, coordonnées propres au projet, `answer` '' / yes / no / maybe, `people_count`, `diet`, `note`, `present`, `table_no`, `added_by` scan / hand / import ; supprimé = `deleted_at`). GET `cousinade` (`op` list / get / preview), POST `cousinade_write` (`op` save — mise à jour partielle : seuls les champs envoyés —, delete / restore, rescan, guest_save, guests_set {field, value | values} → `prev` pour ↶, guests_delete / guests_restore, guests_purge (lignes `scan` / `import` seulement), import / import_undo, options).
- **Descendants vivants** (`cous_scan`) : d’un couple, seulement ses enfants communs ; « vivant » = statut vivant, ou statut inconnu sans décès noté et né il y a moins de 100 ans (pastille K8 jaune « Vivant ? ») ; jamais une fiche confidentielle (ni trouvée, ni montrée à la lecture si elle le devient). Branche = l’enfant de l’ancêtre par qui on descend. Foyer de départ : le descendant, ses conjoints, ses enfants mineurs.
- **Liens de parenté** calculés à la lecture avec `qm_kinship` / `qm_kin_label` (lib/question_more.php, mêmes mots que « Quel lien ? ») : envers l’ancêtre (« arrière-petit-fils ») et envers la personne de référence (« cousin issu de germains avec 1 génération d’écart », « oncle à la mode de Bretagne… », « épouse du cousin germain »).
- **Coordonnées** : `living_contacts` (par `person_id`) puis la dernière adresse / résidence de la fiche ; modifiées dans le projet seulement, sauf `to_contacts` (case « aussi dans le répertoire des vivants »).
- **Sorties** : invitations par foyer (`LCNDA_COUSINADE.foyers`, modèle `fill` à champs fixes) → L1 (`UI.printSheets`, une page par foyer), traitement de texte (`ext.textDocTools.dataOf`, sauts de page), faire-part (`ext.cardInternals.build`, kind `cousinade`), mailto (rien n’est envoyé), copie PNG dans les médias ; badges (planche A4 6 / 8 / 10, QR `ext.qr.svg`) ; grand arbre de descendance (`buildTree` → dessin vectoriel, thèmes et formats de l’arbre décoratif, export E3) ; présence, plan de table (`tablePlan` : par branche, foyer jamais coupé), album (fenêtre d’image unique). Le seul fichier : CSV des invités, coordonnées seulement si la case est cochée. Rien en mode consultation (lecture et écriture refusées).
- Le tableau des invités porte `data-cols-off` (pas de « ⚙️ Colonnes » de heritage-columns.js : il a ses propres cases). Test : `tests/test-cousinade.js`.

## 🔍 « Qui est sur cette photo ? » à plusieurs (lib/photo_ask.php, heritage-photo-ask.js, photo-courriers.css)

Même chemin que 💬 Questions aux proches (on reprend `qp_clean`, `qp_photo_data`, `qp_h`) ; table `photo_asks` (structure n°84).
- **Entrées** : visionneuse (`#lightbox-pa-ask` « 📤 Demander qui c’est », posé à côté de « ＋ Identifier quelqu’un ») ; 👤 Visages → groupes d’inconnus « 📤 Demander à la famille » (`data-fc-ask`) ; Listes → 💬 Questions aux proches → section « 🔍 Qui est sur cette photo ? » (hook `ext.afterQuestions`). API JS : `ext.photoAsk.open({media_ids, prints, id})`, `.importAnswers({files, after})`.
- **Visages** : `GET pa_faces&ids=` (empreintes `face_prints` + identifications `media_tags` + personnes reliées) ; cadres tracés à la main ; « 🔍 Repérer les visages » = `ext.faceInternals.createEngine` puis `save_face_scan`.
- **Noms proposés** : jamais une fiche confidentielle ; un vivant (fiche « vivant », ou sans décès et né il y a moins de 100 ans ou à une date inconnue) seulement avec « Proposer aussi des personnes vivantes ».
- **Le fichier** (`pa_write {op: render}`) : un .html, CSP `default-src 'none'; img-src data:; … connect-src 'none'`, photos en `data:`, aucun numéro de fiche (noms = clés `n1…`, visages = `f1…`), somme de contrôle de la version envoyée gardée (`checksums_json`).
- **Réponses** (`lcnda-visages-reponses`, 300 Ko au plus) : lues strictement (`pa_read` : clés permises, types, visages et noms connus, aucun `<` / `>`, une réponse par visage) ; `analyze` → proposition par visage, candidats (`pa_candidates`), accord / désaccord avec les réponses déjà reçues ; `import` → `face_identify` (empreinte) ou `save_media_tag` / `update_media_tag`, « probable » si un autre cousin est d’accord, sinon « possible » ; `undo_import` défait le dernier import. Un même fichier n’entre qu’une fois.
- Test : `tests/test-photo-courriers.js`.

## 📮 Courriers tout prêts : « Demander l’acte » (lib/courriers_actes.php, heritage-courriers-actes.js)

Complète « 📮 Actes à demander » (lib/heritage_more.php) et le Registre de courriers (api.php `save_courrier`), sans nouvelle table : colonnes `courriers.person_id`, `letter_json`, `media_id` (structure n°84).
- `ext.openActLetter({person_id, event_id, act, what})` ; entrées : fiche « ⋯ » → « 📮 Demander un acte… » (`ext.personMoreItems`), « Que manque-t-il ? » (`data-cl-ask`), Registre de courriers (« 📮 Demander un acte », « Préparer la lettre » des actes récents, « 📮 Revoir la lettre »).
- `cl_write {op: build}` (lecture seule) : `cl_context` (personne, acte même absent, lieu, département, parents, conjoint, lien deviné depuis la personne de départ), `cl_legal` (décès libre ; naissance / mariage libres 75 ans après, sinon copie intégrale réservée à la famille directe → extrait sans filiation ; plus de 100 ans → sans doute en ligne aux AD), `cl_recipients` (mairie, AD tirées de « Services d’archives » si la fiche existe, SCEC Nantes, archives diocésaines, autre), modèles à repères `{personne}`… (`cl_default_templates`, modèles retouchés envoyés par la page).
- `file` : une ligne du Registre (statut « En attente », relance) → aussi dans 🗓 Ma semaine de recherche ; rappel « libre d’accès » facultatif ; `unfile` (↶ Annuler) ne touche qu’un courrier fait par l’outil.
- Réglages : `genealogie-courriers-lettres` (expéditeur, délai, modèles ; K2 par `UI.autoSaveDialog`) et `genealogie-courriers-lettres-presets` (💾 Réglages enregistrés). Sorties : `ext.openTextDoc`, `UI.openPrintDialog` (L1, PDF), `mailto:`, `textdoc_to_media` (.docx par `LCNDA_TEXT`).

## 🌐 Langue de l’app (app-i18n.js, lib/i18n.php, assets/i18n/)

Mode d’emploi complet : `docs/I18N.md` ; glossaire : `docs/i18n-glossaire.md` ; test : `tests/test-i18n.js`.
- **11 langues** : français (référence, rien ne change), English, Español, Deutsch, Italiano, Português, Polski, Nederlands, et, en cours de traduction, Čeština, Svenska, Dansk (fichiers `assets/i18n/src/nord/`, repli sur le français ; voir `docs/I18N.md`, « Ajouter une langue »).
  Choix : Réglages → Apparence → « Thème et couleurs », tout en haut (« 🌐 Langue de l’app », menu simple : drapeau, nom dans
  sa langue, code) et l’écran du premier lancement (`<span data-lc-lang-slot>` ; tout `select[data-lc-lang-pick]`).
  Gardé tout de suite (K2, « ↶ Annuler » remet aussi la langue) dans `lcnda-langue` (cet ordinateur, pas la base ni le
  défaut du site : chacun lit l’app dans sa langue) + cookie `lcnda_lang` (le serveur écrit `<html lang>` et le
  dictionnaire dans la page, sans rien aller chercher).
- **Bandeau IA** (`#lc-i18n-banner`, en bas à droite) quand la langue n’est pas le français : « Traduction faite par une IA,
  pas par une personne — tu as vu une erreur ? » + « Signaler une erreur » (`LCNDA_I18N.report()` : « 🐞 Signaler un
  problème » pré-rempli `[traduction · langue]` et l’écran) ; × le referme (pour cette langue), « Remontrer le bandeau »
  sous le choix de la langue le rouvre.
- **Code** : `t('Texte français', {vars, ctx})` (repli sur le français), `plural(n, 'mot')` (Intl.PluralRules dans les
  autres langues ; `LCNDA_APP.plural` le prend tout seul), `fmtNumber`, `fmtDate`, `fmtTime` (K4 `UI.when` les utilise
  dans une autre langue). Les dates généalogiques et la lecture C4 ne changent pas.
- **Filet de la page** : dans une autre langue, les textes exactement connus du HTML écrit en dur sont remplacés (avec ou
  sans symbole devant ; modèles `{x}` ; « a · b ») ; jamais dans `[data-i18n-off]`, les champs, `contenteditable`.
- **Serveur** : `api()` envoie `X-LCNDA-Lang` ; `json_response()` traduit le message `error` connu (`i18n_t()`).
- **Fait (vague 1)** : le cadre — menu des onglets, boutons en haut à droite, colonnes de gauche, en-têtes K5, barre H10,
  menu de choix, K10, H7, confirmBox, openDialog, K1, L1, K13, E3, C4 (libellés), mots K3, premier lancement, visite
  guidée, tableau de bord (titres des widgets), Réglages (groupes, pages, en-têtes, premier cadre de l’Apparence).
