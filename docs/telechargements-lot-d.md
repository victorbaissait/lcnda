# Téléchargements — lot D (« 🧭 Mémoire et vieux papiers » et « 🌐 Traduction hors ligne »)

Lu et vérifié le 25 novembre 2026. Pour chaque idée : ce qui existait déjà, la licence (citée, avec l'adresse), ce qui est
construit ou seulement en lien, et où l'utilisateur le voit.

## Fichiers

| Rôle | Fichier |
|---|---|
| Écran (fiche, village, monographie, listes, cartes, à la demande, Réglages) | `assets/js/heritage-telech-d.js` |
| Traduction hors ligne (atelier, notes, à la demande, Réglages, 🗂 Données) | `assets/js/heritage-telech-d-traduire.js` |
| Style | `assets/css/telech-d.css` |
| Serveur (loc.gov, Wikipédia, Wikisource, réponses gardées) | `lib/telech_d.php` |
| Serveur (Argos Translate : état, installation, traduction) | `lib/telech_d_traduction.php` |
| Installation en arrière-plan / programme Python | `scripts/telech-d/argos_install.php`, `scripts/telech-d/argos_translate.py` |
| Fabrication des données | `scripts/telech-d/build_{latin,necropoles,camps,jeux,almanachs}.py` (+ `wm.py`) |
| Atelier GitHub | `.github/workflows/telech-d.yml` (astuce du « push », `if: github.event_name != 'push'`) |
| Données livrées | `assets/data/td-{latin,necropoles,camps,jeux,almanachs}.json.gz` (≈ 44 Ko en tout) |
| Textes traduits | `assets/i18n/src/telech-d.tsv` (fr en es de it pt pl nl, 167 lignes) |
| Essai | `tests/test-telech-d.js` (+ `tests/fixtures/telech-d/loc-ellis.json`, vraie réponse loc.gov) |

Petites lignes ajoutées dans des fichiers partagés : `api.php` (2 routes `td_*`), `index.php` (3 balises), `app-aide-lecture.js`
(`extraEntries` lit aussi `LCNDA_EXT.aideExtraEntries` — 1 ligne), `app-listes-maj.js` (les thèmes des familles ajoutées par un
module s'affichent — 1 ligne), `scripts/donnees-manifest.js` (`[/^td-/, 'scripts/telech-d']`).
Réglages → « 🧭 Mémoire et vieux papiers » (clé `genealogie-telech-d`) : chaque partie s'éteint (↶), « À propos des données ».

## Par idée

### 4. Vocabulaire latin des actes paroissiaux (Wiktionnaire)
- **Existait** : oui, largement — `assets/js/aide-langues/la.js` (plus de 400 mots et formules vérifiés, FamilySearch, GenWiki),
  le mot à mot latin et la traduction par l'IA locale (`plus-famille-latin.js`). Amélioration utile mais modeste : plus de mots
  et, avec l'atelier GitHub, toutes les **formes fléchies** (filii, filio…) que la liste manuelle n'a pas.
- **Licence** : « Creative Commons Attribution-Share Alike 4.0 » (API `meta=siteinfo&siprop=rightsinfo` de fr.wiktionary.org →
  https://creativecommons.org/licenses/by-sa/4.0/deed.fr). Ouverte : données copiées avec attribution.
- **Construit** : `td-latin.json.gz` (196 mots tirés de 230 mots de la liste, par l'API ; l'atelier GitHub lit le fichier complet
  `frwiktionary-latest-pages-articles.xml.bz2` et ajoute les formes fléchies). Chaque mot garde l'adresse de sa page.
- **Où** : « 📖 Aide à la lecture » (recherche, repérage des mots connus de l'atelier ; étiquette « Wiktionnaire » ; les mots de
  `la.js` passent avant), Listes « 📜 Vocabulaire latin des registres », à la demande « 📜 Dictionnaire latin des registres ».

### 5. Traduction hors ligne (Argos Translate / OPUS-MT)
- **Existait** : seulement pour le latin (mot à mot + IA locale Ollama). Rien pour l'allemand, l'italien, etc.
- **Licences** : logiciel — « Argos Translate is dual licensed under either the MIT License or Creative Commons CC0 »
  (https://github.com/argosopentech/argos-translate, README) ; index des modèles — « Dual licensed under either the MIT License
  or CC0 » (https://github.com/argosopentech/argospm-index) ; OPUS-MT — « pre-trained downloadable translation models …, CC-BY 4.0
  license » (https://github.com/Helsinki-NLP/Opus-MT). Chaque modèle Argos porte sa licence et ses crédits dans son paquet :
  l'installation la lit (README/metadata) et Réglages la montre (« ▸ Licence de chaque modèle »). Le site argos-net.com et
  huggingface.co n'étaient pas joignables depuis l'atelier de développement : la licence de chaque paquet n'a pas pu être lue ici.
- **Latin** : l'index d'Argos (100 paquets, lu le 2026-11-25) n'a **aucun** modèle latin ; seuls X → anglais et anglais → français
  existent (pas de de → fr direct : on passe par l'anglais). Dit à l'écran, avec le renvoi au mot à mot latin et à l'IA locale.
- **Construit** : composant à installer, comme la lecture d'écriture (HTR) : Python (celui de l'HTR ou de l'ordinateur), venv,
  `pip install argostranslate`, puis 1 à 2 modèles par langue (≈ 450 Mo une fois + ≈ 100 Mo par modèle). Tout tourne sur
  l'ordinateur ; rien n'est envoyé. Langues : de, it, es, nl, pl, pt, en → fr. OPUS-MT direct (Marian) : pas construit (PyTorch
  et transformers, beaucoup plus lourds) ; ses données servent déjà aux modèles d'Argos.
- **Où** : atelier « 🌐 Traduire hors ligne » à côté de « 📖 Aide à la lecture » (sélection ou tout l'acte, « ＋ Garder dans la
  transcription » ↶) ; « 🌐 » sur une note écrite dans une autre langue ; à la demande « 🌐 Traduire un texte (hors ligne) » ;
  Réglages → 🧭 (installer, retirer ↶, tout désinstaller) ; Réglages → 🗂 Données (thème « Outils installés », les langues
  installées, même file de téléchargements).

### 43. Sépultures de guerre
- **Existait** : « Où chercher » (lien Mémoire des hommes « Sépultures de guerre »), base « Morts pour la France » (Réglages →
  🎖️ Bases officielles). Pas de carte des nécropoles.
- **Licences** : data.gouv.fr « Liste des nécropoles nationales » (MémorialGenWeb) : licence `cc-by-sa` (API data.gouv,
  https://www.data.gouv.fr/datasets/liste-des-necropoles-nationales). Wikidata : « All structured data … is available under the
  Creative Commons CC0 License » (https://www.wikidata.org/wiki/Wikidata:Copyright). Mémoire des hommes : site injoignable depuis
  l'atelier (erreur TLS) → conditions non relues → **lien seulement**.
- **Construit** : `td-necropoles.json.gz` (585 lieux : 263 nécropoles nationales, 322 cimetières de guerre de France et de
  Belgique ; 250 liées à la liste des soldats de MémorialGenWeb). Pour un soldat mort en 1870-71, 1914-21 ou 1939-46 (ou « mort
  pour la France » écrit) : les nécropoles près du lieu de décès (ou du lieu de sépulture) ; la fiche MPF qui lui ressemble, si la
  base est installée (`bo_person`). Aucun nom de soldat copié.
- **Où** : fiche (bloc « 🧭 Mémoire et vieux papiers »), village, monographie, Listes, Cartes, à la demande.

### 44. Camps d'internement 1939-45 et maisons d'enfants
- **Existait** : non (seulement l'étape « internement » des parcours de résistants).
- **Licence** : Wikidata CC0 (ci-dessus).
- **Construit** : `td-camps.json.gz` (75 lieux : 69 camps d'internement, 1 camp de transit, 5 maisons d'enfants — Chabannes,
  Montintin, le Masgelier, la Hille, Izieu ; liste incomplète, dite). Seulement des lieux et des dates ; renvoi au Mémorial de la
  Shoah, à l'OSE et à FranceArchives (liens). Phrase sobre : « Pendant la guerre, près des lieux de sa vie : … ».
- **Où** : fiche (personne vivante entre 1939 et 1946 avec un lieu à moins de 25 km), village, monographie, Listes, Cartes.

### 45. Relais de poste et routes de diligence
- **Existait** : oui — « 🐴 Les relais de poste sur sa route » (lot 10, `heritage-lot10-terre-gens.js`, Wikidata, incomplet) et
  le temps en diligence.
- **Jeu de recherche trouvé** : Verdier, Giraud, Mimeur, Bretagnolle, « Postal horse relays and roads in France, from the 17th
  to the 19th centuries », Cybergeo 2025, https://doi.org/10.4000/13gxr (relais et routes, 7 dates, 1632-1833). La licence des
  DONNÉES n'a pas pu être lue (journals.openedition.org et le portail MaRDI refusés par le réseau de l'atelier) → **lien
  seulement** (« Où chercher »). À intégrer au pack du lot 10 si la licence est ouverte.

### 49. Wikipédia hors ligne
- **Existait** : en partie — « Le village dans la culture » garde les sections Toponymie et Histoire de l'article de la commune.
- **Licence** : « Creative Commons Attribution-Share Alike 4.0 » (rightsinfo de fr.wikipedia.org). Kiwix
  `wikipedia_fr_all_nopic` : plus de 30 Go, aucune sélection par commune possible → non retenu, dit dans Réglages.
- **Construit** : « 📖 Garder et lire » sur la fiche d'un village : l'article ENTIER (API REST, HTML → texte par sections, sans
  infobox ni références), gardé sur l'ordinateur et relu sans Internet ; titre, lien, historique (auteurs) et licence affichés.
  Seulement le code INSEE ou le titre part sur Internet. Liste des articles gardés dans Réglages.
- **Où** : village, monographie (partie « L'article de Wikipédia (gardé) », éteinte au départ), à la demande.

### 50. Wikisource
- **Existait** : liens de recherche (« Archives en ligne », 6e lot), contes recueillis (lot 10), mais rien « par commune ».
- **Licence** : textes du domaine public ; pages CC BY-SA 4.0 (rightsinfo) ; Wikidata CC0.
- **Construit** : en ligne à la demande, gardé : œuvres dont le sujet (P921) ou le lieu de l'action (P840) est la commune et
  qui ont une page Wikisource, plus les titres Wikisource qui nomment la commune (sans les sous-pages).
- **Où** : village, monographie, à la demande.

### 51. Europeana (cartes postales et photos par commune)
- **Existait** : oui — `heritage-lot9-sons-enfance.js` (« 📷 Photos anciennes sur Europeana » : clé gratuite de l'utilisateur dans
  Réglages, `reusability=open` seulement, vignettes des images libres, ＋ garder dans les médias). Rien ajouté.

### 52. Library of Congress — photos d'avant 1925
- **Existait** : seulement Chronicling America (journaux).
- **Conditions** : « As a publicly supported institution, we generally do not own the rights to materials in our collections.
  You should determine for yourself whether or not an item is protected by copyright or in the public domain… »
  (https://www.loc.gov/legal/). API sans clé. Donc : seulement les notices « No known restrictions » et datées ≤ 1925 ; la
  vignette reste sur loc.gov (lien), rien n'est copié.
- **Construit** : pour une personne avec un événement aux Amériques avant 1930 : photos d'Ellis Island autour de l'année
  (requête « Ellis Island immigrants » + années ; jamais un nom ; rien pour une fiche vivante ou confidentielle).
- **Où** : fiche, à la demande. (Listes de passagers d'Ellis Island : déjà dans « Où chercher ».)

### 53. Patrimoine colonies / Algérie (ANOM)
- **Existait** : oui — « Où chercher » (état civil des colonies, bagnards), « Archives disponibles », relais de l'Algérie (lot 10).
- **Licence** : anom.archivesnationales.culture.gouv.fr injoignable depuis l'atelier ; pas de jeu ouvert trouvé → **lien
  seulement**, rien ajouté.

### 55. 78 tours du domaine public
- **Existait** : oui — `l9a-sons` (Internet Archive, Great 78 et autres, licence lue sur chaque notice : domaine public, CC0 ou
  CC BY), pour l'année de ses 20 ans. Gallica son : conditions non ouvertes → lien.
- **Ajouté** : « 🎶 La musique de leur mariage » (même fichier, l'année du mariage ± 1, mariages de 1895 à 1930) + recherche
  Gallica des enregistrements de l'année (lien).

### 56. Almanachs populaires / 60. Bottin mondain, Annuaire des châteaux
- **Existait** : liens Gallica « Bottin — Annuaire-almanach du commerce » (Archives en ligne, 2e lot) ; annuaires de Paris
  1798-1914 (SoDUCo, pack). Rien « par année ».
- **Licences** : Internet Archive — droits de chaque volume gardés et montrés (« Public Domain Mark », « FREE »… ; 260 sans
  mention : seulement un lien) ; seuls les volumes ≤ 1925 ; on garde série, année, titre, adresse (pas de texte, pas d'image).
  Gallica : conditions d'utilisation non ouvertes (réutilisation commerciale payante ; site refusé par le réseau de l'atelier :
  403) → **liens de recherche par année** fabriqués par l'app, rien de copié.
- **Construit** : `td-almanachs.json.gz` (420 volumes : Almanach royal/impérial/national 192, Gotha 209, Messager boiteux et
  almanachs populaires 12, Almanach du commerce 5, Annuaire des châteaux 2) + recherches Gallica par année : Vermot, Hachette,
  Didot-Bottin, Tout-Paris (Bottin mondain), Annuaire des châteaux, Almanach des postes.
- **Où** : fiche (année de naissance et de mariage ≤ 1925), à la demande par année, Listes.

### 57. Jeux traditionnels régionaux
- **Existait** : non.
- **Licences** : Wikipédia CC BY-SA 4.0 (première phrase citée, lien, « les contributeurs de Wikipédia ») ; Wikidata CC0.
- **Construit** : `td-jeux.json.gz` (54 jeux de France, Belgique, Suisse, Pays basque ; 37 placés : lieu Wikidata, ou région dite
  dans la première phrase — centre approché, dit à l'écran).
- **Où** : fiche (« Les jeux de son pays », à moins de 90 km du lieu de naissance), village, monographie, Listes, Cartes.

### 58. Supernovas et étoiles nouvelles
- **Existait** : oui — « ✨ Les étoiles nouvelles » (lot 9, `l9b-etoiles`, novae et supernovae visibles à l'œil nu depuis la
  France pendant sa vie, Wikipédia/Wikidata). Rien ajouté.

### 59. Cloches et leurs parrains
- **Existait** : oui — « 🔔 Son nom sur les cloches » (lot 10, Palissy via le pack « Patrimoine » + POP, Licence Ouverte) : les
  noms lus dans les inscriptions sont comparés aux personnes de la base. Rien ajouté.

### Exclu
- Films Lumière : exclus par l'utilisateur, rien fait.

## Ce qui part sur Internet
« Ellis Island » et des années (loc.gov), le code INSEE ou le nom de la commune (Wikidata, Wikipédia, Wikisource). Jamais un nom
de personne ; rien pour une fiche vivante ou confidentielle. La traduction ne part jamais : seuls le programme et les modèles se
téléchargent (PyPI, index d'Argos), une fois.

## Limites
- Hôtes refusés par le réseau de l'atelier pendant le travail : argos-net.com, huggingface.co, journals.openedition.org,
  portal.mardi4nfdi.de, gallica.bnf.fr (403), memoiredeshommes.sga.defense.gouv.fr et anom.archivesnationales.culture.gouv.fr
  (injoignables) ; Wikimedia a limité le débit (429) — les scripts attendent et réessaient.
- La vraie installation d'Argos Translate n'a pas été lancée ici (essai simulé, `GENEALOGY_TD_SIMULATE=1`).
- `td-latin` : version API (sans formes fléchies) tant que l'atelier GitHub n'a pas tourné.
