# 🌦 Météo d'autrefois — fabriquer les données (mode d'emploi pas à pas)

La « Météo d'autrefois » dit le temps qu'il faisait le jour de chaque événement de ta généalogie. Elle marche **sans Internet** :
les relevés sont rangés dans des fichiers à part, qu'on fabrique **une seule fois**, sur un ordinateur qui a Internet
(ton Mac suffit). Ensuite, plus besoin de rien télécharger.

Il y a trois fichiers possibles :

| Fichier | Ce qu'il contient | Taille | Où il va |
|---|---|---|---|
| **Le socle** `meteo-socle.sqlite` | ≈ 300 meilleures stations de France, Belgique, Suisse, Luxembourg (chaque jour) + ERA5 (1940 →, 4 heures par jour) + 20CR (1836–1939) + normales | ≈ 550 Mo | dans le dossier `data-meteo` de l'app (il est alors livré avec l'app) |
| **La grille des altitudes** (dans le socle) | l'altitude du sol tous les ≈ 1 km (30″), tirée du Copernicus DEM GLO-90, pour 14 pays : France, Belgique, Suisse, Luxembourg, Italie, Pays-Bas, Espagne, Allemagne, Portugal, Royaume-Uni, Pologne, Danemark, Tchéquie, Slovaquie (îles comprises : Corse, Sardaigne, Sicile, Baléares, Canaries, Madère, Açores…). Sert à choisir la station la plus semblable en montagne ; hors de France, Belgique, Suisse et Luxembourg, seulement l'altitude (pas de météo dans le socle) | ≈ 5 Mo (≈ 500 carrés de 1°) | dans le socle (étape « altitudes ») |
| **Le pack complet** `meteo-pack-complet.lcmeteo` | toutes les stations (≈ 14 700), et heure par heure pour Météo-France depuis 1950 | ≈ 3 Go | à importer dans l'app (Maintenance → 🌦 Météo d'autrefois → « ⤒ Importer le fichier… ») |
| **Le pack Europe** `meteo-pack-europe.lcmeteo` | les stations des pays qui publient leurs relevés librement (Allemagne, Pays-Bas, Danemark, Royaume-Uni, Espagne, Pologne, Tchéquie ; quelques longues séries d'Italie, du Portugal et de Slovaquie) + la reconstitution 20CR (1836–1939) et ERA5 (toutes les heures) sur toute l'Europe | ≈ 1,5 à 3,5 Go | à importer de la même façon |

Les durées ci-dessous sont des ordres de grandeur : elles dépendent surtout de la file d'attente de Copernicus (ERA5).

---

## 1. Installer Python (une fois)

Sur un Mac récent, Python est souvent déjà là. Pour le savoir :

1. Ouvre l'app **Terminal** (Applications → Utilitaires → Terminal).
2. Tape `python3 --version` puis Entrée.
   - Si tu vois « Python 3.10 » ou plus : c'est bon, passe à l'étape 2.
   - Sinon : va sur <https://www.python.org/downloads/>, télécharge « Python 3 » pour macOS, ouvre le fichier et clique « Continuer » jusqu'au bout. Ferme puis rouvre le Terminal.

## 2. Installer deux petites bibliothèques (pour ERA5 et 20CR)

Dans le Terminal, tape :

```
pip3 install cdsapi netCDF4
```

(Sans elles, le programme fabrique quand même le socle avec les stations seulement : ajoute alors `--sans-era5 --sans-20cr`.)

## 3. Le compte Copernicus (gratuit, pour ERA5)

ERA5 est la « réanalyse » européenne : une estimation du temps partout, heure par heure, depuis 1940. Elle est gratuite, mais il faut un compte.

1. Va sur <https://cds.climate.copernicus.eu> → « Register » (ou « Login ») : crée ton compte avec ton adresse e-mail.
2. Une fois connecté, ouvre ta page de profil (ton nom en haut à droite) : tu y trouves ta **clé** (« Personal Access Token », une suite de lettres et de chiffres).
3. Ouvre les deux pages des données et accepte leur licence (bouton « Accept terms » en bas de l'onglet « Download ») :
   - <https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels>
   - <https://cds.climate.copernicus.eu/datasets/derived-era5-single-levels-daily-statistics>
4. Dans le Terminal, crée le fichier de la clé (remplace `TA-CLE` par ta clé) :

```
printf "url: https://cds.climate.copernicus.eu/api\nkey: TA-CLE\n" > ~/.cdsapirc
```

## 4. Récupérer le programme

Le programme est dans le dossier de l'app : `scripts/meteo/build-meteo.py`. Dans le Terminal, va dans ce dossier, par exemple :

```
cd ~/Documents/lcnda
```

(Astuce : tape `cd ` puis glisse le dossier de l'app depuis le Finder dans la fenêtre du Terminal, puis Entrée.)

## 5. Un essai rapide (5 à 15 minutes)

```
python3 scripts/meteo/build-meteo.py --test
```

Il fabrique un tout petit socle (le Gers, une année, Genève, et les altitudes d'un carré du Gers) dans le dossier `meteo-sortie-test`. Si tout se passe bien, la dernière ligne dit « ✓ Fini ». Sinon, le message explique quoi faire (connexion, clé Copernicus, adresse qui a changé…).

## 6. Fabriquer pour de vrai

```
python3 scripts/meteo/build-meteo.py socle       # ≈ 4 à 12 heures (surtout ERA5)
python3 scripts/meteo/build-meteo.py complet     # ≈ 1 à 2 nuits (toutes les stations, heure par heure)
python3 scripts/meteo/build-meteo.py europe      # ≈ 1 à 3 nuits (ERA5 sur toute l'Europe)
python3 scripts/meteo/build-meteo.py altitudes   # ≈ 1 à 2 heures : seulement la grille des altitudes des 14 pays (déjà faite avec « socle »)
```

- Le Mac doit rester allumé (empêche la mise en veille : Réglages → Économiseur d'énergie, ou tape `caffeinate -i` devant la commande).
- **Si ça s'arrête** (coupure d'Internet, Mac éteint, Ctrl+C) : relance la même commande. Le programme **reprend où il en était** (rien n'est re-téléchargé).
- Tout est rangé dans le dossier `meteo-sortie` : `telechargements/` (les fichiers des sources), `travail/` (le travail en cours) et, à la fin, les fichiers finis. La taille de chaque fichier est affichée.
- Options : `--stations 300` (combien de stations dans le socle), `--depuis 1836 --jusqu-a 2025`, `--departements 32,47`, `--sans-era5`, `--sans-20cr`, `--meteolux-csv FICHIER` (si l'adresse de MeteoLux ne marche plus : télécharge le fichier quotidien de Luxembourg-Findel sur <https://data.public.lu> et donne-le ici).

## 7. Mettre les fichiers dans l'app

- **Le socle** : copie `meteo-sortie/meteo-socle.sqlite` dans le dossier `data-meteo` de l'app (crée-le à côté de `api.php` s'il n'existe pas). Il sera livré avec l'app à la prochaine fabrication (`npm run dist:mac`). Autre possibilité : l'importer comme un pack (`meteo-socle.lcmeteo`).
- **Un pack** (`meteo-pack-complet.lcmeteo`, `meteo-pack-europe.lcmeteo`) : dans l'app, Maintenance → Données → « 🌦 Météo d'autrefois » → « ⤒ Importer le fichier… ». La fenêtre vérifie le fichier, montre ce qui va entrer, puis l'importe (avec « ↶ Annuler »). Le fichier peut ensuite être effacé du dossier `meteo-sortie`.

Ensuite, tu peux effacer le dossier `meteo-sortie` (il est gros).

---

## Les sources et leurs licences (à garder telles quelles)

| Source | Licence | Mention |
|---|---|---|
| Météo-France (meteo.data.gouv.fr) | Licence Ouverte 2.0 | « Source : Météo-France » |
| MétéoSuisse (NBCN, opendata.swiss) | CC BY 4.0 | « Source: MeteoSwiss » |
| IRM / KMI (opendata.meteo.be) | CC BY 4.0 | « Source : IRM / KMI » |
| MeteoLux (data.public.lu) | CC0 | « Source : MeteoLux » |
| DWD (opendata.dwd.de, pack Europe) | Datenlizenz Deutschland – Namensnennung 2.0 | « Quelle: Deutscher Wetterdienst » |
| KNMI, Pays-Bas (pack Europe) | CC BY 4.0 | « Bron: KNMI » |
| DMI, Danemark (pack Europe) | CC BY 4.0 | « Kilde: DMI » |
| Met Office MIDAS-Open, Royaume-Uni (CEDA, pack Europe) | Open Government Licence v3 | « Contains public sector information licensed under the Open Government Licence v3.0 » |
| AEMET OpenData, Espagne (pack Europe) | réutilisation libre avec mention (aviso legal) | « © AEMET » |
| IMGW-PIB, Pologne (pack Europe) | données publiques, mention obligatoire | « Źródło: Instytut Meteorologii i Gospodarki Wodnej – PIB » |
| ČHMÚ, Tchéquie (pack Europe) | CC BY 4.0 | « Zdroj: ČHMÚ » |
| GHCN-Daily (NOAA), quelques séries d'Italie, du Portugal et de Slovaquie (pack Europe) | domaine public pour les données des États-Unis ; pour les autres pays, la NOAA rappelle qu'elles viennent de l'échange OMM (Résolution 40) et conseille un usage non commercial — d'où l'option `--sans-ghcn` | « GHCN-Daily, NOAA NCEI » |
| Copernicus DEM GLO-90 (altitudes, AWS Open Data) | licence Copernicus DEM GLO-90 : libre, gratuite, redistribution permise avec mention | « Altitudes : Copernicus DEM GLO-90 © DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018, fourni dans le cadre de COPERNICUS par l’Union européenne et l’ESA » |
| ERA5 (Copernicus) | CC BY 4.0 (licence Copernicus) | « Generated using Copernicus Climate Change Service information [année] » |
| 20CRv3 (NOAA / DOE) | usage libre avec mention | « 20th Century Reanalysis V3, NOAA / DOE » |

L'app affiche ces mentions sous le détail de chaque jour et dans « ↗ À propos des données ».

## Si une adresse a changé

Les adresses des sources sont toutes en haut de `scripts/meteo/build-meteo.py` (lignes en MAJUSCULES, par exemple `MF_DAILY_DATASET_API`). Si un message dit « l'adresse n'existe plus (erreur 404) », c'est qu'une source a déménagé : corrige l'adresse à cet endroit (ou demande-le), puis relance.

## Pour vérifier sans Internet (développeurs)

`python3 tests/test_meteo_builder.py` fabrique un petit socle avec les fichiers d'exemple de `tests/fixtures/meteo` (format réel de Météo-France et de MétéoSuisse) et le relit avec l'app. `python3 scripts/meteo/make-fixture.py DOSSIER` fabrique un jeu d'essai synthétique complet (stations, carreaux, 1836–2025) pour les captures et `tests/test-meteo.js`.

## L'altitude des lieux

La grille des altitudes vient du **Copernicus DEM GLO-90** (modèle du relief à 90 m, réduit à un point tous les ≈ 1 km). Les carrés de 1° sont choisis d'après les contours des pays (ceux des cartes de l'app, Natural Earth) : ≈ 500 carrés pour les 14 pays, dont une partie en mer. Il faut lire ≈ 500 fichiers d'origine (≈ 3 Mo chacun, ≈ 1,5 Go en tout, effacés aussitôt lus) : compte 1 à 2 heures selon la connexion. Seule la petite grille est gardée (≈ 5 Mo). Les carrés en pleine mer n'existent pas : ils sont simplement sautés. La météo, elle, ne change pas : hors de France, Belgique, Suisse et Luxembourg, un lieu reçoit son altitude mais pas de météo (sauf avec le pack Europe). Pas besoin de compte ni de bibliothèque en plus.
Dans l'app, chaque lieu reçoit tout seul l'altitude de la carte du relief ; on peut la corriger à la main (Graphiques → Lieux → la commune, ou « ⛰ Altitude du lieu » dans le détail d'un jour).

## Le pack Europe en détail

Ce qu'il contient : les stations des pays qui publient leurs relevés quotidiens librement (meilleures séries longues), la reconstitution 20CR (1836–1939) et ERA5 (1940 →, toutes les heures) sur toute l'Europe. Ainsi, tout lieu d'Europe a au moins une « Reconstitution grossière » avant 1940. Rien ne change au socle.

Avant de lancer `python3 scripts/meteo/build-meteo.py europe`, prépare (une fois) :

1. **Copernicus** (ERA5) : le même compte que pour le socle (étape 3).
2. **CEDA** (Royaume-Uni, MIDAS-Open) : crée un compte gratuit sur <https://services.ceda.ac.uk> (« Register »), accepte la licence de « MIDAS Open », puis crée un **jeton d'accès** (« Access token ») sur ta page CEDA. Dans le Terminal : `export CEDA_TOKEN=le-jeton` (ou ajoute `--ceda-jeton le-jeton` à la commande). Sans jeton, le Royaume-Uni est simplement sauté.
3. **AEMET** (Espagne) : demande une clé gratuite sur <https://opendata.aemet.es> → « Obtención de API Key » (elle arrive par e-mail). Puis `export AEMET_API_KEY=la-clé` (ou `--aemet-cle la-clé`). Sans clé, l'Espagne est sautée. AEMET limite le nombre d'appels : le programme attend un peu entre deux appels.
4. **DMI** (Danemark) : en principe sans clé ; si le site en demande une, crée-la sur <https://opendatadocs.dmi.govcloud.dk> et mets-la dans `DMI_API_KEY` (ou `--dmi-cle`).
5. Pays-Bas (KNMI), Pologne (IMGW), Tchéquie (ČHMÚ), Allemagne (DWD), GHCN : rien à créer.

Options : `--sources-europe dwd,knmi,dmi,midas,aemet,imgw,chmi,ghcn` (choisir les sources), `--sans-ghcn` (sans l'Italie, le Portugal et la Slovaquie), `--sans-20cr`, `--sans-era5`, `--altitudes-europe` (aussi la grille des altitudes de toute l'Europe).

Si une source ne répond pas ou demande une clé, elle est **sautée avec un message** et le pack se fabrique quand même ; relance plus tard la même commande pour l'ajouter (le reste n'est pas refait).

Temps et poids : compte **une à trois nuits** (surtout ERA5 et 20CR) et **≈ 1,5 à 3,5 Go** pour le fichier final (dont ≈ 350 Mo pour 20CR).

À vérifier avant de livrer (de mémoire, sans Internet ici) : les adresses de KNMI, DMI, ČHMÚ et IMGW, le nom exact des colonnes de chaque fichier, et les licences (toutes sont écrites en haut de `build-meteo.py` et dans le tableau ci-dessus).

