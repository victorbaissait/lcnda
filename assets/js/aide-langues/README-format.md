# 📜 Aide à la lecture : une langue = un fichier

Chaque langue des actes anciens est un fichier `assets/js/aide-langues/<code>.js` (code ISO 639 : `la`, `grc`, `de`, `it`, `es`, `pl`, `nl`, `pt`, `ru`…).
Le moteur `assets/js/app-aide-lecture.js` (`window.LCNDA_AIDE_LECTURE`) lit le registre `window.LCNDA_AIDE_LANGS` **au moment de chercher** (l'ordre de chargement n'a pas d'importance) ; dans Node, il lit tout seul tous les fichiers `*.js` de ce dossier.
Rien d'autre à brancher : les codes `ocr` s'ajoutent tout seuls à la liste « Langue du texte » de la transcription d'actes ; le filtre « Langue » (pastilles C5 avec le nombre), la recherche sans accents, les onglets Lettres et Exercices, l'ouverture depuis la transcription d'actes et le repérage des mots connus après « ✨ Lire l'acte » suivent tout seuls.

**Ne touche pas** à `app-aide-lecture.js` ni à `heritage-lecture-autrefois.js` pour ajouter une langue. Ajoute seulement, dans `index.php`, une ligne juste après les autres langues :
`<script src="assets/js/aide-langues/<code>.js?v=1" defer></script>` (et monte le `?v` quand tu modifies le fichier).

## Le squelette (à copier tel quel)

```js
/* 📜 Aide à la lecture — <Nom de la langue>. Sources : voir `sources` en bas. Format : aide-langues/README-format.md */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})({
    code: 'de',                 // unique, minuscules (ISO 639-1 ou 639-3)
    name: 'Allemand',           // nom en français, tel qu'il s'affiche dans la pastille
    native: 'Deutsch',          // nom dans la langue (facultatif)
    icon: '🇩🇪',                 // un drapeau ou un symbole (facultatif ; jamais seul à l'écran : le nom est toujours écrit)
    script: 'latine',           // latine | cyrillique | grecque | hebraique | armenienne | arabe | georgienne…
    dir: 'ltr',                 // ltr | rtl (hébreu, yiddish, arabe : 'rtl')
    ocr: ['deu'],               // codes de la liste « Langue du texte » de la transcription d'actes qui ouvrent cette langue
                                // (fra, lat, fra+lat, eng, deu, ita, spa, pol, nld, grc, por, rus…) ; [] si aucun
    intro: 'Une ou deux phrases : où et quand on rencontre ces actes.',
    translit: null,             // écriture non latine : function (mot) → ['variante1', 'variante2'] en lettres latines
                                // (« huios », « yios » pour υἱός) ; la recherche et la correction des exercices s'en servent.
                                // Écriture latine : null.
    entries: [
        // t : le mot tel qu'on le lit (plusieurs formes séparées par des virgules : « Witwe, Wittwe, Wwe »)
        // d : la traduction en français simple ; ex : un exemple (facultatif) ; alt : d'autres formes cherchées (facultatif)
        // k : mot | mois | nombre | metier | parente | formule | abrev
        // a : bapteme | mariage | deces | general   (deces = décès et sépulture)
        {t: 'getauft', d: 'baptisé', k: 'mot', a: 'bapteme', ex: '« ist getauft worden »', alt: ['getaufft']},
    ],
    // les dessins (facultatif) : traits SVG dans une case de 40 × 60 (haut des majuscules y = 8, haut des minuscules y = 26,
    // ligne d'écriture y = 46, bas des jambages y = 58). Les ids commencent par le code de la langue (« de_e »).
    // On peut aussi réutiliser les dessins communs (s long « slong », « e », « n », « u »…).
    glyphs: {de_e: ['M9 44 L13 30 L17 44 L21 30 L25 44']},
    widths: {},                 // largeur d'un dessin si elle n'est pas 36 : {de_mm: 44}
    letters: [
        // id, name, seen : [ids des dessins], read : ce qu'on lit, cmp : [ids] à ne pas confondre, note : une ou deux phrases, keys : mots cherchés
        {id: 'de_e', name: 'e de la Kurrent', seen: ['de_e'], read: 'e', cmp: ['n'], note: '…', keys: 'kurrent e n'},
    ],
    exercises: [
        // un texte MODÈLE écrit pour l'exercice (personnes d'exemple, nées bien avant 1950, dit dans `tip`).
        // src : les mots comme sur le registre ; « vu=lu » quand la lecture diffère ; « vu=lu|autre » accepte une autre lecture.
        // notes : {mot vu : explication} montrée sous un mot à revoir.
        {id: 'de_taufe1823', icon: '👶', title: 'Une Taufe de 1823', level: 'facile', acte: 'bapteme', year: 1823,
            tip: 'Texte modèle…', src: 'Im Jahre 1823 den 14ten=14ten|vierzehnten Hornung=Hornung|Februar …', notes: {Hornung: 'Hornung = février'}},
    ],
    // l'alphabet (facultatif, écritures non latines) : un tableau montré en haut de l'onglet ✍️ Les lettres
    alphabet: null,             // [{big: 'Α', small: 'α', name: 'alpha', latin: 'a', value: 1}, …] (value : la valeur de nombre, facultative)
    // un convertisseur de nombres (facultatif) : numération en lettres (grec, hébreu, cyrillique, arménien…)
    numerals: null,             // {label: 'Nombres grecs', to: n => 'ρκγʹ', from: s => 123 (ou null), examples: ['αωνβʹ', '1852']}
    sources: [
        {label: 'FamilySearch Research Wiki — German Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/German_Genealogical_Word_List'},
    ],
});
```

## Règles

- **Ne rien inventer** : un mot dont tu n'es pas sûr ne va pas dans la liste. Cite tes sources dans `sources` (elles s'affichent sous le dictionnaire et dans `docs/UI.md`).
- Traductions en français simple (tutoiement dans les explications), sans jargon.
- Texte seulement (aucun HTML : tout est échappé à l'affichage). Aucune image externe, aucun réseau.
- Exercices : textes **modèles**, écrits pour l'app, personnes d'exemple ; aucune date après 1949 ; `parseExercise(x).answer` doit faire 100 % (le test le vérifie pour toutes les langues).
- Le test `tests/test-aide-langues.js` vérifie chaque fichier du dossier : code unique, nom, `script`, `dir`, au moins un mot, un mois, un nombre, une formule, un exercice corrigé à 100 %, des sources, les dessins existants.
