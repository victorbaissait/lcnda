# Téléchargements — lot I (« ⚓ Le pays au travail et à l'école »)

Lu et vérifié le 26 novembre 2026. Pour chaque idée : ce qui existait déjà, la licence (citée, avec l'adresse), ce qui est construit
ou seulement en lien, et où l'utilisateur le voit.

## Fichiers

| Rôle | Fichier |
|---|---|
| Écran (fiche, village, monographie, listes, cartes, à la demande, Réglages) | `assets/js/heritage-telech-i.js` |
| Style | `assets/css/telech-i.css` |
| Fabrication des données | `scripts/telech-i/build_{wikidata,tour,dico,ecole,chansons,contexte,maregraphe}.py` (+ `wm.py`) |
| Atelier GitHub | `.github/workflows/telech-i.yml` (`quoi` = tout, maregraphe, wikidata, tour, dico, ecole, chansons, contexte ; astuce du « push », `if: github.event_name != 'push'`) |
| Données livrées | `assets/data/ti-{navals,autos,sucreries,sanas,centrales,romains,hippodromes,tour,dico,ecole,chansons,contexte}.json.gz` |
| À fabriquer sur GitHub | `assets/data/ti-maregraphe.json.gz` (PSMSL) |
| Textes traduits | `assets/i18n/src/telech-i.tsv` (fr en es de it pt pl nl) |
| Essai | `tests/test-telech-i.js` |

Petites lignes ajoutées dans des fichiers partagés : `index.php` (2 balises, `heritage-tout-sur.js?v=` relevé),
`assets/js/heritage-tout-sur.js` (`[/^tip_/, 'telech_i']` dans `BLOCK_OF`), `scripts/donnees-manifest.js` (`[/^ti-/, 'scripts/telech-i']`),
`assets/data/manifest.json` (refait par son script). Aucun serveur PHP : tout est lu sur l'ordinateur.
Réglages → « ⚓ Le pays au travail et à l'école » (clé `genealogie-telech-i`) : chaque sujet s'éteint (↶ Annuler), « À propos des données ».
Les packs apparaissent dans Réglages → 🗂 Données (« Livrées avec l'app » : taille, date, source, licence, lu dans le manifeste).

## Ce qui part sur Internet

**Rien.** Les fichiers sont dans l'app ; aucun nom, aucun lieu n'est envoyé, pour personne (vivant, confidentiel, invité, mode
consultation : pareil). Seuls les liens « ↗ » ouvrent une page, sur un clic. L'essai coupe et compte toute requête qui sortirait.
Le sanatorium et la prison ne s'affichent sur une fiche que pour une personne **décédée** (un événement décès, inhumation ou
crémation) ; la prison seulement si la fiche elle-même en parle (détenu, condamné, forçat, gardien de prison, maison centrale…).

## Licences lues (le 2026-11-26)

- **Wikidata** — <https://www.wikidata.org/wiki/Wikidata:Copyright> (texte lu par `action=raw`) : « All structured data from the main,
  Property, Lexeme, and EntitySchema namespaces is available under the Creative Commons CC0 License ». → CC0, données copiées.
- **Wikipédia en français** — <https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia> :
  « Le contenu textuel de Wikipédia est sous CC BY-SA 4.0, licence libre ». → la première phrase de 18 articles citée telle quelle,
  avec le lien et « les contributeurs de Wikipédia » (`ti-contexte`).
- **Wikisource** — pied de page de <https://fr.wikisource.org/wiki/Accueil> : « Les textes sont disponibles sous licence Creative
  Commons Attribution-partage dans les mêmes conditions » ; les œuvres elles-mêmes sont du domaine public : G. Bruno (Augustine
  Fouillée, morte en 1923), Th. Soulice (1860), Th. Lepetit (1860), Revue pédagogique (1877-1891), recueils de chansons de 1900 au plus
  tard (Luzel 1868 et 1890, Béranger 1865-1866, Weckerlin 1870, Bouilhet 1872, Nadaud 1895, Couyba 1896, Orain 1890).
- **Internet Archive**, « Petit Larousse illustré » (1911), <https://archive.org/details/petitlarousseillustre1911> : métadonnées
  `licenseurl: http://creativecommons.org/publicdomain/mark/1.0/` (Public Domain Mark). Aucune édition de 1906 sur Internet Archive, et
  le texte (OCR brut, `*.archive.org` refusé par le réseau de l'atelier) n'est pas une transcription relue : **lien seulement**
  (recherche dans le scan, mot par mot).
- **PSMSL** (Permanent Service for Mean Sea Level) — <https://psmsl.org/data/obtaining/> : **refusé par le réseau de l'atelier** (le
  proxy répond 403 ; WebFetch : hôte non autorisé). La page des conditions **n'a donc pas pu être lue ici** : aucune donnée n'est livrée.
  Le script `build_maregraphe.py` (sur GitHub) lit d'abord cette page, recopie dans le fichier les phrases qui disent que les données
  sont libres et comment les citer (`policy_free`, `policy_cite`), et **s'arrête sans rien écrire** s'il n'en trouve pas. Citation
  prévue : Holgate et al. (2013), J. Coastal Res. 29(3), 493–504, doi:10.2112/JCOASTRES-D-12-00175.1, et « PSMSL, Tide Gauge Data,
  retrieved … ». **À relire par une personne** dans Réglages → ⚓ → À propos des données après la première fabrication.
- **FranceArchives** (<https://francearchives.gouv.fr>) : **liens seulement** (recherche « registre d'écrou », « société de secours
  mutuels » + nom de la commune) ; rien n'est copié.
- **Gallica** : refusé par le réseau (403) ; le lien de recherche des sujets du certificat existait déjà (lot 9) et est repris.
- Déjà dans l'app : `cc-communes` (Licence Ouverte 2.0), `ha-phares`, `ha-institutions`, `et-ouvrages`, `tq-sites` (Wikidata, CC0).

## Par idée

### 35. Chantiers navals et corderies royales — **construit**
- **Existait** : « corderie » seulement comme catégorie CASIAS de « ⛏️ Métiers et rivières » (autre module, serveur). Pas de liste.
- **Construit** : `ti-navals` (Wikidata : chantier naval Q190928, corderie Q1249556/Q41085665, base navale Q1324633, arsenal Q81669 —
  les arsenaux d'armes de l'intérieur sont écartés : on ne garde un « arsenal » qu'à moins de 15 km d'un phare de `ha-phares`) : 25
  lieux. Une date de création après 1945 pour une corderie ou un arsenal (Corderie royale : 1985, celle du musée) n'est pas gardée.
- **Lien aux métiers** (comme le lot F) : charpentier de marine, calfat, cordier, voilier, ouvrier de l'arsenal… → 25 km au lieu de 6
  et « Son métier touchait aux navires ».
- **Où** : fiche, village (12 km), monographie, Listes, Cartes, à la demande.

### 36. Constructeurs automobiles d'avant 1914 — **construit**
- **Existait** : non (les « marques » de l9a sont des marques de produits, pas des constructeurs placés).
- **Construit** : `ti-autos` (Wikidata Q786820, fondés avant 1914, placés par leur siège P159 ou lieu de fondation P740 en France) :
  208 constructeurs (beaucoup autour de Paris). Lien aux métiers : mécanicien, carrossier, chauffeur, ajusteur… → 30 km au lieu de 12.
- **Où** : fiche (fondé près de chez lui quand il avait au moins 10 ans), village, monographie, Listes, Cartes.

### 37. Sucreries de betterave — **construit (très incomplet), PROLONGE l'existant**
- **Existait** : « sucrerie » est une catégorie des anciens sites industriels CASIAS de « ⛏️ Métiers et rivières » (serveur) : pas
  recopié, la ligne renvoie vers ce module.
- **Construit** : `ti-sucreries` (Wikidata Q227857, Q61941965) : 22 lieux, mais **surtout des sucreries de canne d'outre-mer**
  (Guadeloupe, La Réunion, Mayotte) ; en métropole seulement Eppeville (1828), Bourdon (Aulnat, 1835), deux raffineries. Wikidata ne
  connaît presque pas les sucreries de betterave : dit tel quel. Lien aux métiers : sucrier, ouvrier sucrier, raffineur… → 25 km.

### 38. Sanatoriums — **construit**
- **Existait** : non. `ti-sanas` (Wikidata Q46124, Q1792936) : 23 sanatoriums (plateau d'Assy à Passy, plateau d'Hauteville,
  Petites-Roches, Aincourt…). **Berck n'y est pas** (aucun élément « sanatorium » placé à Berck dans Wikidata).
- **Fiche** : seulement pour une personne **décédée**, si un sanatorium (ouvert avant le décès quand la date est connue) est à moins
  de 4 km du lieu du décès, avec la phrase « Cela ne dit pas qu'il y était soigné ». Village (10 km), monographie, Listes, Cartes.

### 39. Maisons centrales, prisons et registres d'écrou — **construit (petit) + liens, PROLONGE l'existant**
- **Existait** : les prisons et bagnes de « 🧭 Histoire autour » (`ha-institutions` : 444 prisons en France, dont 6 maisons
  centrales). Réutilisés sur la fiche (lus dans le fichier existant, pas recopiés).
- **Construit** : `ti-centrales` (Wikidata Q130246829, Q3279120) : 7 maisons centrales (Clairvaux, Poissy, Ensisheim, Arles,
  Saint-Martin-de-Ré, Saint-Maur). Les registres d'écrou : la phrase de Wikipédia (« Écrou (droit) ») et des **liens** FranceArchives.
- **Fiche** : seulement si la fiche parle de prison (et personne décédée). Village : maisons centrales à moins de 10 km.

### 40. Marégraphe de Brest (et Marseille) — **à fabriquer sur GitHub**
- **Existait** : non (`grep` : ni marégraphe, ni niveau de la mer).
- `build_maregraphe.py` : séries annuelles RLR du PSMSL, stations 1 (Brest) et 61 (Marseille). **psmsl.org refusé ici** → `quoi =
  maregraphe`. Le script vérifie la page des conditions avant d'écrire (voir Licences).
- **Au bord de la mer** = un phare de `ha-phares` (déjà dans l'app) à moins de 15 km ; Marseille pour la Méditerranée, Brest sinon.
- **Fiche** : « En 1865, à Brest, la mer était N cm plus basse qu'en 2023 » (mariage, sinon naissance, au bord de la mer).
  Village : la hausse depuis le début de la série et depuis 1900. Avant la fabrication : rien ne s'affiche, Réglages le dit.

### 41. Grottes ornées — **déjà présent : PROLONGÉ (une ligne sur la fiche)**
- **Existait** : oui — « 🧺 Vie de tous les jours » (`tq-sites`, Wikidata Q11269813 « grotte ornée ») les montre sur la fiche d'un
  village (10 km). Rien de recopié, pas de nouveau pack, pas de section village en double.
- **Ajouté** : sur la fiche d'une personne, la grotte ornée à moins de 15 km de son lieu de naissance (lue dans `tq-sites`).

### 42. Ponts romains et aqueducs — **construit**
- **Existait** : en partie — « 🕰 Son époque » (`et-ouvrages`) a 12 aqueducs et quelques ponts datés ; les voies romaines
  (`ha-voies-romaines`) ne sont pas touchées.
- **Construit** : `ti-romains` (Wikidata Q1223230 « pont romain », Q13218676 « aqueduc romain ») : 42 ouvrages ; les 3 déjà dans
  `et-ouvrages` sont marqués « aussi dans « 🕰 Son époque » ».

### 43. Hippodromes — **construit**
- `ti-hippodromes` (Wikidata Q11822917) : 241 hippodromes, 64 datés. Fiche : « En 1880, on ouvre l'hippodrome … » (ouvert près de chez
  lui de son vivant) ; village, monographie, Listes, Cartes. Les courses elles-mêmes : pas de source libre structurée trouvée.

### 44. Sociétés de secours mutuels — **trop peu de données : phrase + liens**
- Wikidata (recherche `inlabel:"secours mutuel"` + France, et classe « friendly society » Q1976354) : **1 seule** société. Pas de pack.
- Affiché : la phrase de Wikipédia (« Société de secours mutuel ») et un lien FranceArchives avec le nom de la commune (séries M et X).

### 45. Sociétés de tir et de gymnastique — **trop peu de données : phrase + liens**
- Wikidata : **1** « société de tir », **0** société de gymnastique ancienne (les 5 résultats « gymnastique » sont des championnats).
- Affiché : les phrases de Wikipédia (« Société de tir » ; « Union des sociétés de gymnastique de France », fondée en 1873) + liens.

### 46. Orphéons et chorales — **trop peu de données : phrase + liens**
- Wikidata : 36 chœurs en France (Q131186, Q762048), dont **2** fondés avant 1920 ; 1 « orphéon », 1 « fanfare ». Pas de pack.
- Affiché : la phrase de Wikipédia (« Orphéon ») + lien. Les trois idées 44-46 forment la section « 🎺 Sociétés d'autrefois » du village.

### 47. « Le Tour de la France par deux enfants » — **construit**
- **Existait** : non (« deux enfants » n'apparaissait que dans d'autres sens).
- **Construit** : `ti-tour` : la table des matières (édition Belin 1904 transcrite et validée sur Wikisource), les villes nommées dans
  le titre d'un chapitre et reconnues comme communes (cc-communes ; noms en double choisis à la main, personnes et rivières écartées :
  Vauban, Buffon, Descartes, le gave de Pau…), et **la phrase du chapitre qui nomme la ville**, recopiée (le script vérifie qu'elle est
  dans le texte). 43 passages, 29 villes (Épinal, Mâcon, Lyon, Marseille, Sète « Cette », Bordeaux, Nantes, Paris…), lien vers le chapitre.
- **Où** : fiche (une ville à moins de 10 km de ses lieux, s'il vivait après 1877), village, monographie, Listes, Cartes.

### 48. Petit Larousse 1906 — **lien seulement (Larousse) + un dictionnaire d'époque transcrit**
- **Petit Larousse** : pas transcrit sur Wikisource ; pas d'édition 1906 sur Internet Archive ; l'édition de 1911 (Public Domain
  Mark) n'existe qu'en scan → lien « ↗ « forgeron » dans le Petit Larousse illustré de 1911 » (recherche dans le scan).
- **À la place, transcrit et relu** : Théodore Soulice, « Petit dictionnaire de la langue française » (Hachette, 1860), un article
  par page sur Wikisource. `ti-dico` : la définition de 1860 des métiers à un mot du dictionnaire des métiers de l'app
  (`metiers-anciens.json`), recopiée telle quelle : 190 définitions (noms masculins « s. m. » seulement ; un féminin est souvent un
  autre mot, ex. SAUNIÈRE = coffre à sel). Fiche : « En 1860, un petit dictionnaire d'école définissait son métier : … ».
  Les objets ne sont pas faits (seulement les métiers).

### 49. Dictées et problèmes du certificat d'études — **construit (petit, 6 textes) + liens**
- **Existait** : lot 9 (`l9a-livres` : livres de classe ; un lien de recherche Gallica « sujets du certificat d'études »). Prolongé.
- **Construit** : `ti-ecole` : 2 dictées (Th. Lepetit, « Cours de dictées orthologiques », 1860) et 4 textes de la Revue pédagogique
  sur le certificat (les épreuves écrites — compte rendu du recueil de B. Subercaze ; le débat sur la dictée, 1890 ; la circulaire de
  1891 ; les chiffres de Paris 1873-1877). Chaque texte est relu sur sa page par le script (premiers mots → fin de phrase), sinon
  il s'arrête. **Pas de recueil de dictées ni de problèmes du certificat transcrit sur Wikisource** : les problèmes sont en **liens**
  (Subercaze sur Internet Archive, Gallica). Les dictées de Lepetit (1860) sont des dictées d'école, pas des sujets du certificat : dit.
- **Fiche** : pour qui avait 12 ans entre 1866 et 1936 : « À 12 ans, vers 1884, elle pouvait avoir à écrire une dictée comme celle-ci ».

### 50. Chansons de métier — **construit, PROLONGE l'existant**
- **Existait** : « 🎼 Les chansons de son enfance » (`l9a-chansons` : 20 chansons populaires datées, aucune chanson de métier). Pas
  recopiées ; la ligne y renvoie.
- **Construit** : `ti-chansons` : 29 chansons pour 10 métiers (meunier, marin, berger, tailleur, fileuse, laboureur, sabotier,
  nourrice, postillon, soldat), trouvées par le titre dans des recueils de Wikisource publiés en 1900 au plus tard (Luzel, Béranger,
  Weckerlin, Orain…) ; le premier vers recopié. Pas de forgeron : aucun titre de recueil ancien sur Wikisource.
- **Où** : fiche (un de ses métiers), Listes (index par métier).

## Fichiers à fabriquer sur GitHub

Lancer une fois Actions → « Le pays au travail et à l'école (lot I) » avec `quoi = maregraphe` : `ti-maregraphe` (psmsl.org
injoignable depuis l'atelier). Tous les autres packs sont livrés ; `quoi = tout` les refait aussi.

## Limites

- Hôtes refusés par le réseau de l'atelier : psmsl.org, gallica.bnf.fr, les serveurs de fichiers `*.archive.org`. Le service SPARQL de
  Wikidata limitait à **une requête par minute** (panne en cours chez Wikimedia) et refusait les requêtes avec sous-classes
  (`P279*`) : seules les classes directes sont prises. L'API de Wikimedia (api.php) répondait « too many requests » : les pages ont été
  lues une par une (`action=raw`, `action=render`, page de recherche du site), avec une pause.
- Wikidata connaît peu de sucreries de betterave, de sanatoriums (pas Berck) et presque aucune société (secours mutuels, tir,
  gymnastique, orphéons) : les listes sont incomplètes et le disent.
