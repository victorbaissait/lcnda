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

---

## K5 — En-tête de page : `UI.pageHeader` (app-pages.js)

Un seul en-tête en haut de chaque page (listes, Maintenance, Fiches, Enquêtes, ADN, Comparaison…). Maquette : `harmonisation-K.html`, K5.

```js
ws.innerHTML = `<section class="page">${UI.pageHeader({
    title: 'Médias', help: 'Photos, actes, documents et sons de ta généalogie.',   // help = une phrase (HTML)
    primary: '<button class="button" data-x-new>＋ Ajouter des médias</button>',    // le bouton bleu
    actions: ['<button class="button secondary" data-x-a>📚 Recueils</button>', …],   // 2 visibles, le reste dans « ⋯ »
    more: ['<button …>…</button>'],                                                 // toujours dans « ⋯ »
})}…</section>`;
```

- **Sur-titre** = l’endroit, calculé d’après le menu : « Listes · Médias et documents », « Maintenance · Réglages des outils », « Enquêtes »… (`where` pour l’imposer ; `detail: true` pour la page d’un élément → « Listes · Recueils »). `UI.pagePlace()` le donne.
- **Titre** = le nom, avec l’icône du menu (groupe de la colonne pour Listes et Maintenance, émoji de l’onglet sinon ; `icon` pour l’imposer), 38 px partout (30 px sur téléphone). **Jamais un nombre** : le nombre va dans la barre H10 (`bar.setCount`) ou, sans barre, en tête de la phrase d’aide (`<b class="ui-ph-count">`).
- **À droite**, dans cet ordre : « ✓ Enregistré » (pages de réglages, K2) · le bouton bleu · 2 boutons au plus · « ⋯ » (un `<details class="ui-ph-more">`, les boutons y sont **déplacés**, leurs écouteurs restent) · ⭐ (raccourci, posé par heritage-shortcuts.js).
- Tout `.page-header` de `#workspace` qui n’a pas été fait par `UI.pageHeader` est rangé pareil tout seul (`UI.harmonizePageHeader`, `MutationObserver`) : sur-titre, icône, boutons laissés sous le texte ou à même l’en-tête, « ⋯ ». `data-ph-off` l’exclut, `data-ph-where="…"` impose le sur-titre, `data-ph-detail` = page d’un élément.
- Un bouton « Tout réinitialiser », « Tout remettre comme avant »… dans l’en-tête devient « ↺ Remettre comme au départ », toujours visible.

## K2 — Réglages enregistrés tout seuls : `UI.autoSave` (app-pages.js)

En Maintenance, tout changement fait dans la page (case, menu, curseur, couleur, glisser, bouton) est gardé tout de suite. Une seule écoute sur `#workspace` relit les réglages gardés sur cet ordinateur (localStorage) ; s’ils ont changé : « ✓ Enregistré » à droite du titre (`UI.pageSaved()`) et un message H7 « Réglage changé : « … » » avec « ↶ Annuler » (qui remet les clés d’avant, puis redessine). Pas de bouton « Enregistrer » sur une page de réglages ; « ↺ Remettre comme au départ » se fait sans question (« ↶ Annuler » dans le message).

Une page qui garde un brouillon (lu à l’écran) donne de quoi l’enregistrer :

```js
draw();
UI.autoSave(ws, {save: () => { collect(); savePrefs(p); },          // lit l’écran et enregistre (appelé après chaque changement)
                 redraw: () => { p = loadPrefs(); draw(); }});        // après ↶ Annuler / ↷ Rétablir
```

- Hors Maintenance (ex. ADN → ⚙️ Réglages), `UI.autoSave(élément, …)` marche tant que l’élément est affiché.
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
- Réglage : `localStorage['genealogie-portraits']` (Maintenance → Apparence → « 👤 Portraits ») ; les couleurs, la forme et le bord sont des variables `--lc-av-*` sur `:root` (styles `.lc-av` dans app.css). « Comme avant » (par défaut) : `UI.avatarOn()` est faux et chaque endroit garde son dessin.
- Branché : fiche (88), liste des personnes (34), menu de choix (34 / 22 / 48), fenêtre des images (22), arbre et diagrammes (48), tableau de bord (48), Recherche (48), œuvres, profils, artistes, écoles (22 / 34 / 88), employeurs (34), tableaux (48).

## K15 — Colonne de gauche (app-colonne.js)

- Réglage : `localStorage['genealogie-left-column']` = `{mode, style, nums, numstyle, tabs, size, width, lf}` (Maintenance → Apparence → « ▤ Colonne de gauche »). « Comme avant » (par défaut) : rien n’est posé.
- Sinon : attributs `data-lc-col-style|nums|tabs|size` sur `:root` (styles dans app.css) et `--sidebar` pour la largeur ; après chaque dessin de `#sidebar-content` : numéros réécrits 01, 02… (`.side-number`, l’original gardé dans `data-lc-num`), onglets `.segmented` en « icône + nom » (`data-lc-tab` garde l’original), « Liste | Fiches » (`.investigation-display`, `.result-display`) recopié dans l’en-tête de page, le bouton d’origine caché reçoit le clic.
- Pour qu’une nouvelle colonne suive le réglage : `.segmented` pour les onglets, `.side-menu` > `.side-menu-item` > `.side-number`, `.section-label` pour les titres de groupe.


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
- Onglet de réglages : `app-access.js` pose les onglets « ♿ Toute l’app » / « 🧓 Mode simple » (sessionStorage `lcnda-a11y-tab`) et appelle `MS.mountTab(page)`.
- Test : `tests/test-mode-simple.js`.

## 🎨 Designs au choix A1–A10 (app-designs.js, designs.css, designs-gen.css)

Maintenance → « 🎨 Designs au choix » (`ext.maintenance.designs`, juste après « Apparence »). Réglage : `localStorage['genealogie-designs']` (suit la base comme les autres « genealogie-* »), réglages enregistrés : `genealogie-designs-presets` (`UI.presetsFrame`, outil `designs` pour ⤓ / ⤒). Les deux sont dans `SITE_DEFAULT_KEYS` et `site_defaults_allowed_keys()` ; le premier dans `LAYOUT_KEYS` et dans les designs de l’Apparence (`lookFlat` → `a_designs`).

- `LCNDA_DESIGNS.read()` / `write(G)` / `clean(raw)` : `G = {a1: {v, …réglages en plus}, … a10}` ; `defOf(id, carte)`, `isOn(G, id)` (une carte ≠ « Comme avant » ou une retouche), `isModified(G, id)` (« retouché »), `presetState(ensemble)`, `presetOf(G)`.
- `attrsOf(G)` → `{attrs, vars}` posés par `applyTo(<html>, G)` ; rien du tout pour « Comme avant ». Attribut principal par réglage : `data-lc-style` (A1), `data-lc-density` (A2), `data-lc-icons` (A3), `data-lc-fiche` (A4), `data-lc-tree` (A5), `data-lc-btn` (A6), `data-lc-font` (A7), `data-lc-motion` (A8), `data-lc-list` (A9), `data-lc-dash` (A10) ; un attribut par retouche (`data-lc-r`, `data-lc-sh`, `data-lc-acc`, `data-lc-lines`, `data-lc-fz`, `data-lc-caps`, `data-lc-lsel`…).
- Pose au plus tôt : `index.php` relit `lcnda-designs-ui-v1` (copie des attributs) avant le premier dessin ; il allume aussi `designs-gen.css` (`media="not all"` sinon) et `apparence-traits.css` (traits d’A1, préfixe `:root:is(.lc-frame,[data-lc-lines])`).
- `designs-gen.css` est fabriqué par `python3 scripts/build-designs-css.py` (ombres, coins, fonds de palette, marges × `--lc-sp`, survol) depuis toutes les feuilles d’`index.php` : à relancer après un gros changement de CSS, puis monter son `?v=`.
- Passages sur l’écran (`decorate(root, G)`, MutationObserver léger, rien si aucun réglage ne le demande) : A3 icônes au trait (`.lc-ic`, l’émoji reste dans le texte, caché à l’œil), A4 en-tête de la fiche (`ext.afterPerson`, éléments `.lc-dz`), A7 noms en minuscules, A9 petit portrait des lignes, A10 date du journal, A5 Sosa des cases, A8 secondes des messages (`toast.dataset.lcTotal`).
- Aperçus : petites pages (iframe `srcdoc`) avec les feuilles de l’app, le réglage montré posé sur leur `<html>` et de vrais écrans (fiche ouverte, personnes, `LCNDA_PARTS.treeHtml`, dernier tableau de bord affiché).
- Test : `tests/test-designs.js`.

