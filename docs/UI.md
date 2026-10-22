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

## K16 — Interrupteur ou case à cocher (app-saisies.js, saisies.css)

Une règle simple :

| Quoi | Composant |
|---|---|
| Un réglage qui s’applique **tout de suite** (Maintenance et toute page K2, panneau d’un éditeur, option d’un affichage : « Afficher les valeurs », « Aimanter à la grille », « Masquer les vivants dans GEDCOM ») | **interrupteur** |
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

« ✓ Enregistré » s’affiche dans le haut de la fenêtre ; chaque changement donne un message H7 avec « ↶ Annuler » / « ↷ Rétablir ». Les listes à ranger d’Apparence (menu, listes, cartes, onglets de Maintenance, graphiques, fonds de cartes, bibliothèque des widgets) s’enregistrent toutes seules (app-editeurs.js presse leur bouton caché après chaque case, nom, ⠿ ou Alt + ↑ / ↓).

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

Maintenance → « 🎨 Designs au choix » (`ext.maintenance.designs`, juste après « Apparence »). Sept réglages de **forme** sur la page : A1 Style général (traits, ombres, coins, quadrillage), A2 Densité, A3 Icônes, A4 Fiche d’une personne, A6 Boutons, A7 Mouvements, A8 Listes (numéros gardés). **A5 Cases des arbres** n’est plus sur la page (`PAGE_IDS`, lien `data-lcd-trees`) : il se règle dans Graphiques → « 🎨 Couleurs des stats et des arbres » (`#stats-colors-dialog`, sur-titre « COULEURS », titre « Statistiques et arbres »), section « 🌳 Cases des arbres » dessinée par `ext.treeCards` (`mount(host)`, `colors(host, m, f)`, `reset(host)`, `current()`, `save(host, m, f)`) et gardée par le bouton « Enregistrer » de la fenêtre ; même stockage (`genealogie-designs`.a5), donc réglages enregistrés, défaut du site et anciens réglages inchangés. La rubrique « Couleurs par sexe » de la même fenêtre réunit la **couleur** (= A5 m/f = portraits K7, `gender_male_color` / `gender_female_color`) et le **fond / texte** des cases « Blanches » (`genealogie-gender-colors`). Réglage : `localStorage['genealogie-designs']` (suit la base comme les autres « genealogie-* »), dans `SITE_DEFAULT_KEYS`, `site_defaults_allowed_keys()`, `LAYOUT_KEYS` et les designs de l’Apparence (`lookFlat` → `a_designs`).

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


## 🧮 Tableur et moteur commun des tableaux (app-tableur-engine.js, heritage-tableur.js, tableur.css, lib/workbooks.php)

Listes → 🛠️ Outils de modification → « 🧮 Tableur » : classeurs à plusieurs feuilles, enregistrés dans la table `workbooks` (migration `schema_v50` ; GET `workbooks`, `workbook` ; POST `save_workbook`, `rename_workbook`, `delete_workbook` (rend le classeur, pour « ↶ Annuler »), `duplicate_workbook`). `kind` : `book` ou `template` (« Mes modèles »).

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
- Fonctions : `S.FN[nom] = {fam, sig, desc, en, f}` ; `S.fnKey('SUM')` → « SOMME ». Ajouter une fonction : `def(…)` dans le moteur (famille, signature, phrase, nom anglais ou '' si elle n'existe pas ailleurs — elle part alors en valeur dans un XLSX).

**L'éditeur** : `ext.openWorkbook({id})` ou `ext.openWorkbook({data, name, onSaved, onClose})` (aussi `ext.openSheetEditor`). E1 (menus `data-xl-cmd`, réglables dans les raccourcis : `heritage-editorkeys.js`, outil `sheet`), barre d'outils et panneau rangés par ⚙️ Personnaliser (`data-tbg="xl-tools"`, `"xl-panel"`) avec « 💾 Réglages enregistrés », grille virtuelle (calques collants pour les volets figés), H10 pour filtrer, K13 import / impression, E3 export, H7 pour défaire. Modèles : `ext.sheetTemplates`. Réglages : `localStorage['genealogie-tableur']`. Test : `tests/test-tableur-moteur.js`, `tests/test-tableur.js`.

**Vague 2 — l'éditeur commun des données** (`heritage-tableur-cibles.js`, maquette écrans G et I) :

```js
ext.sheetTargets.diagram = {icon, label, hint, createLabel, columns(opts) → [{k, label, type: 'text'|'number'|'color'|'select', many, max, optional, choices, alias}],
    build(objets, opts, tableau, statut) → données, fromData(données) → {sheets: [{name, header, rows, widths, hidden, refs, merges, fills, typed}]},
    back(éditeur, données) → données, fromRange(éditeur, plage), preview(données) → HTML, create(données, {name, editor})};   // diagram, graph, board, recueil, keynote
ext.openSheetEditor({target: 'diagram', data: spec, name, onSave: nouvelles => …});   // le tableur préparé + « ✓ Enregistrer et revenir » (ctx.back)
ext.openSheetEditor({id, select: {sheet, range}, onSave});                               // un classeur rangé, ouvert sur une plage
ext.openRowsInSheet({name, rows | csv}); ext.sheetExportFormat(getRows, nom);            // « ⤓ Exporter ▾ → 🧮 Ouvrir dans le tableur » (E3 : format « 🧮 Tableur »)
ext.chooseSheetRange({title, link}) → {mode: 'copy'|'link', cells, link};               // « 🧮 Prendre un classeur du Tableur » (menu de choix, sorte workbook)
ext.sheetLink.resolve(spec)                                                              // spec.live.sheet = {wb, sh, name, sheet, range, grow, head} : relu à l'affichage
```

- **Le tableur ne connaît pas les endroits** : il lit `ext.sheetTargets`. Un nouvel endroit déclare ses colonnes ; « 🎯 Préparer pour… » (menu Données) le propose tout seul : colonnes reconnues par leur titre puis par la sorte des valeurs (✓), cases à vérifier (⚠️ « C7 contient « env. 12 » : compté comme 12 » + « Voir la cellule »), aperçu, création. Les colonnes « many » (séries) prennent toutes les colonnes de chiffres qui restent.
- **Crochets dans heritage-tableur.js** (à réutiliser plutôt que de modifier les menus) : `ext.sheetMenuExtra.push({menu: 'Données', cmd, label, key})`, `ext.sheetCommands[cmd] = (éditeur, arg, bouton) => …`, `ext.sheetChartMenu`, `ctx.back = {label, html, save(éditeur)}` (bandeau + « ✓ Enregistrer et revenir », rien n'est rangé dans le Tableur sauf « Enregistrer une copie… »), `ctx.select`, et l'évènement `lcnda:workbook-saved` ({id}) après chaque enregistrement.
- **Où** : Diagrammes (onglet Données : « 🧮 Modifier les données », « 🧮 Prendre un classeur du Tableur », plage liée avec le bandeau `🔗 Données : « Classeur » ! A1:C4 · tenu à jour`, grille C6 « Voir les N suivantes ↓ / Tout voir » au-delà de 400 lignes), Éditeur de graphiques (`data-fr-sheet`), Présentation (inspecteur Tableau / Graphique, `runX('sheet')` ; la zone « ; » reste en secours ; `ext.keynoteWithObject(o, nom)`), Tableaux (`data-bd-tbl="sheet"` ; `tableValues` calcule déjà sur `LCNDA_SHEET`), Recueils (`data-rt-sheet` ; une colonne « 👤 Fiche » et une clé cachée `_ligne` gardent les lignes reliées), Listes (`heritage-columns.js` : « ⤓ Exporter ▾ » à côté de « ⚙️ Colonnes », les colonnes et lignes affichées), statistiques et liste d'artistes (format E3 `sheet`).
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
- **Endroits** : modèle « 🏠 Relevé de recensement » (`ext.sheetBase.censusBook(année)` ; `sheet.link = {tpl:'census', year}` ; bandeau Année 1836 → 1936 + Commune ; `censusCols(année)`), Dépouillements (« 🧮 Dans le tableur » dans « Personnes et foyers de la page » : `ext.sheetBase.openFilled({src:{source:'digest', filters:{digest_id, page}}})`), Atelier (élément « Venant du logiciel » `workbook` ; Exporter → « 🧮 Tableau de tous les éléments, dans le tableur »).
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

Listes → 🛠️ Outils de modification → « 📝 Traitement de texte » : documents enregistrés dans `text_documents` (migration `schema_v57` ; `kind` : `doc` ou `template` pour « Mes modèles ») et leurs versions dans `text_document_versions` (200 au plus par document). API — GET : `textdocs`, `textdoc`, `textdoc_versions`, `textdoc_version`, `textdoc_people` (personnes pour le récit), `textdoc_tree` (petit arbre) ; POST : `save_textdoc` (`rev` : un enregistrement fait ailleurs entre-temps → conflit, la personne choisit), `rename_textdoc`, `delete_textdoc` (rend le document et ses versions, pour « ↶ Annuler »), `restore_textdoc`, `duplicate_textdoc`, `save_textdoc_version`, `delete_textdoc_version`, `restore_textdoc_version`, `textdoc_to_media` (copie .docx / .odt + vignette rangée dans les médias). Menu de choix : sortes `textdoc` (📝) et `workbook` (🧮).

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
