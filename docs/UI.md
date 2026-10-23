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
- XLSX et ODS gardent aussi (écrits et relus) : notes (`comments` + VML / `office:annotation`), validation liste et nombre (`dataValidation` / `content-validation`), filtre (`autoFilter` / `database-range`), volets (`pane` / `settings.xml`), noms (`definedName` / `named-range`, et les formules qui les utilisent), mise en forme conditionnelle (XLSX : `cfRule` + `dxfs`) ; `VRAI()` / `FAUX()` (écrits par LibreOffice) sont des fonctions ; DATEDIF « A/J/AM/MJ/AJ » part en « Y/D/YM/MD/YD ». Formule anglaise avec des virgules reconnue (`formulaMode` : noms anglais, `DATE(1925,5,7)`, nombre de morceaux de la fonction). Test complet (toutes les fonctions recalculées par LibreOffice, vrais fichiers openpyxl / python-docx / pandoc) : `tests/test-word-excel-complet.js`.
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

**Écrans** : la fiche complète d'un animal porte le suivi en blocs (🔖 Bagues et marques / Marques · 👁 Observations · 🩺 Santé · 👥 Groupe · 🗺 Carte / Trajets, voir « Sections des fiches et fiche animal unique ») ; `ext.suivi.openPet(id, tab)` ouvre la fiche sur le bon bloc. Listes → « 🐾 Recensement » (`ext.lists.recensement` : onglets Observations / Animaux suivis / Sites / Groupes, `UI.listBar`, fiches site `state.svSite` et groupe `state.svGroup`). Fenêtres : `openObservation({petId, obs, siteId})` (S7), `importGps({files, petId})` (K13), `openHealth` (S18), `memberDialog`, `siteDialog`, `groupDialog`, `openBigMap`, `openStats` (⤓ Exporter ▾ : CSV, Movebank, GPX, KML, « 🧮 Ouvrir dans le tableur » par `ext.openRowsInSheet`). Carte : `ext.suivi.U.mapView(hôte, {series, polygons, home, wheel, onClick})` (fond de carte de l'app `mapTileUrl`, glisser, ＋ −, ⤢) et `replayBar` (▶ Rejouer). Clics communs par attributs `data-sv-pet`, `data-sv-obs`, `data-sv-site`, `data-sv-group`, `data-sv-new-obs`, `data-sv-import`, `data-sv-share`, `data-sv-receive`…

**Plusieurs médias par observation** (migration 66) : `animal_observations.media_ids` (« 12,40,7 », 40 au plus, `suivi_media_list`) ; `media_id` reste = le premier (lecture d'avant). Fenêtre : `mediaField({name: 'media_ids', multiple: true})` ; affichage : `ext.suivi.U.obsMediaHtml(o)` (3 vignettes + « +N », remplies toutes seules, clic = visionneuse sur la série). Paquet partagé : `medias` (toutes les clés) + `media` (la première, pour une app d'avant) ; à la réception l'un ou l'autre (`suivi_share_media_keys`).

**📤 Partager et fusionner** (`lib/suivi_share.php`, `heritage-suivi-partage.js`) : `op=share` (une fiche, des animaux, une espèce, un site, tout) → `{format: 'lcnda-suivi', version: 1, animals, sites, groups, free_observations, media}` ; le navigateur fait le « .lcsuivi » avec `LCNDA_SHEET.makeZip` (suivi.json, medias/, LISEZ-MOI.txt) et le relit avec `LCNDA_SHEET.unzip`. Identifiants stables : colonne `uuid` des tables du suivi (`animal_profiles.uuid` pour l'animal), donnés au premier partage. Jamais les propriétaires ; observateurs, bagueurs, soigneurs seulement avec `names=1`. Réception : `share_analyze` (paquet remis d'aplomb par `suivi_share_clean`, bornes `SUIVI_SHARE_MAX`) → animal reconnu par uuid, sinon par une marque (même sorte, même code) ou la puce ; champs différents = conflits, lignes de même uuid modifiées = conflits, doublons exacts écartés (`suivi_sig`). Écran de fusion (classes `merge-*` de « Fusion de doublons ») : « Garder le mien / Prendre le sien / Garder les deux », « Tout garder le mien / Tout prendre le sien », « N conflits restants ». `share_apply` garde ce qu'il ajoute et ce qu'il remplace dans `suivi_receipts` ; `share_undo` remet tout ; journal « Suivi des animaux reçu de … le … ». Les médias reçus entrent dans les Médias (`importMediaFile`) et y restent après « ↶ Annuler ».

- Test : `tests/test-suivi-animaux.js` (moteur, serveur, navigateur ; `SHOTS=dossier`), fichiers d'essai `tests/fixtures/animaux/`.
- Pas fait : le fichier GPS d'origine n'est pas rangé dans les médias de l'animal ; la photo-identification compare à l'œil (photos de référence sur les marques), sans reconnaissance automatique.
