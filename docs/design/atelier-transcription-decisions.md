# Atelier de transcription — décisions de l'utilisateur (22 novembre 2026)

Maquette : `docs/design/atelier-transcription-idees.html`.

1. **Barre de l'image** : barre courte + « 🎚️ Mieux voir » par défaut pour tout le monde (l'ancienne barre complète reste un réglage).
2. **Lectures** : un seul bouton « ✨ Lire ▾ » avec un menu, et une explication claire de la différence entre les lectures (imprimé, écriture à la main rapide, lecture approfondie par l'IA).
3. **Panneau de droite** : la frise « Lire → Corriger → Repérer → Ajouter ».
4. **Téléphone** : trois onglets Image / Texte / Personnes.
5. **Plusieurs pages** : au choix (réglage) — un acte avec plusieurs images et un seul texte coupé par « — page 2 — », ou un texte par page.
6. **Modèle d'acte** : au choix (réglage) — « 🧩 Gabarit » avec des cases remplies par Repérer, ou le texte à crochets.
7. **Mode relecture ligne à ligne en plein écran** : au choix (réglage), oui ou non.
8. **Export TEI** : oui, dès la vague 3.

Ordre : vague 1 « Ranger » (barre courte, Lire ▾, doublons, nom unique de l'outil, les 2 défauts du mode sombre, numéros de ligne, textes non traduits), puis vague 2 « Guider » (frise, relecture, téléphone, versions, chercher/remplacer, avancement, abréviations au survol), puis vague 3 (plusieurs pages, gabarits, visionneuse alignée, export avec numéros de ligne, TEI).

## Suite proposée (22 novembre, après la 0.10.0)

Reste de la vague 3 : 3b gabarits (choix à côté du texte entre crochets), 3c visionneuse alignée, 3d export avec numéros de ligne, 3e export TEI ; lecture rapide et imprimée de toutes les pages en mode « un texte par page » ; FAQ des pages, de la main ✋ et du curseur « Cadres » ; « Appliquer » d'un clic dans la fenêtre de lecture approfondie.

Autres idées pour la transcription (à choisir) :
- A · Dictée : lire l'acte à voix haute, l'app écrit (micro de l'ordinateur, rien ne part sur Internet).
- B · Comparer deux lectures (Kraken et IA, ou deux modèles d'IA) côte à côte, mot par mot, et garder la meilleure.
- C · Glossaire personnel : les mots et abréviations que tu corriges souvent deviennent des corrections proposées.
- D · Traduction de l'acte (latin, allemand…) en français sous la transcription, par l'IA locale.
- E · Résumé de l'acte en une phrase pour la fiche (« Baptême de Jean MAZAUD, fils de… »).

Autres modèles d'IA possibles (tous avec Ollama, sur l'ordinateur) — à tester avant de les proposer :
- Mistral Small 3.2 (24B, Apache 2.0, ~15 Go, 32 Go de mémoire conseillés) : le plus fort, ordinateurs puissants.
- Gemma 3 (4B ou 12B, licence Gemma, Google) : bon en langues européennes.
- Granite 3.2 Vision (2B, Apache 2.0, IBM) : très léger, fait pour les documents, ordinateurs modestes.
- MiniCPM-V (8B) : bon en écriture manuscrite selon ses auteurs.
Chacun doit être essayé sur les mêmes actes (Qwen3-VL sert de référence) avant d'entrer dans la liste.

### Décision du 22 novembre
- Idées A, B, C, D, E : toutes retenues.
- Tous les modèles proposés ci-dessus sont retenus pour essai ; chacun aura, comme Qwen3-VL aujourd'hui, sa présentation avec avantages et inconvénients (taille à télécharger, mémoire conseillée, vitesse, langues, licence).
- Ajouter un modèle pour les ordinateurs à 64 Go de mémoire. Candidats à essayer : Qwen3-VL 32B (même famille que le modèle conseillé, Apache 2.0, ~21 Go, plus précis mais plus lent) ; Qwen3-VL 30B-A3B (presque aussi précis, bien plus rapide) ; Qwen2.5-VL 72B (~49 Go, le plus gros qui tienne, très lent). Le meilleur des essais devient « Pour les ordinateurs puissants (64 Go) ».
- L'app propose d'elle-même le modèle qui convient à la mémoire de l'ordinateur.

## Autres ajouts retenus (22 novembre)
1. Relevé automatique : après une transcription, remplir les fiches (baptême, parrain, marraine, témoins) en une fois, avec aperçu avant d'accepter.
2. Même acte en double : deux photos du même acte (archives, site) signalées « probablement le même ».
3. Frise des documents d'une personne, avec les trous visibles (« aucun acte entre 1820 et 1845 »).
4. Prochaine piste conseillée : pour une personne, quel acte chercher en premier et où (ce qui manque + archives en ligne).
5. Comparer deux personnes côte à côte (concorde / se contredit) pour décider si c'est la même : partir de l'outil de comparaison qui existe déjà dans l'app (doublons et fusion — à repérer et réutiliser, pas un deuxième outil), et le mettre dans la liste des outils.
8. Recherche et commandes par la voix dans toute l'app (« ouvre la fiche de Jean MAZAUD »), sur la même base que la dictée (idée A).
Chaque gros outil : maquette d'abord.
9. « Ce que l'app a trouvé » → menu ⋯ d'une carte personne : en plus de « Écarter », « Écarter : ce n'est pas une personne » (ex. « Empire Autrichien »). L'app retient le mot et ne le propose plus comme personne dans les autres actes (liste revue dans les Réglages, « ↶ Annuler »), et propose de le ranger ailleurs : lieu, événement, ou simple mot du texte.
10. Résumé du document par l'IA locale (quelques lignes), et « 💡 Ce qui est intéressant » : les découvertes repérées (ex. un régiment, une bataille, un lieu nouveau, une date qui contredit la fiche), chacune avec l'endroit dans le texte et « ＋ Ajouter à une fiche… ».
11. Documents liés (pas les pages d'un même document) : relier un document à un autre en disant « ce n'est pas le même document, mais ils sont liés » et pourquoi (même régiment, même famille, même affaire…). Ex. l'acte de notoriété d'un ancêtre et celui d'un autre soldat du même régiment. L'app montre ce que les deux ont en commun (régiment, lieux, dates, personnes) et ce que l'un apprend sur l'autre.
12. « Poser une question au document » en français (ex. « Est-ce que le document donne le régiment ? ») : l'IA locale répond en citant le passage et l'endroit, rappelle qu'elle peut se tromper ; si elle ne trouve pas : « Je ne le vois pas, mais vérifie quand même ». Bouton « Signaler une mauvaise réponse » avec la bonne réponse : gardée avec le document (et réutilisée pour les questions suivantes). Les questions peuvent aussi porter sur des documents liés (11).
13. Utilisateur avancé : « Autre modèle (Ollama) » — choisir n'importe quel modèle déjà installé dans Ollama (liste lue sur l'ordinateur) ou taper son nom. L'app vérifie s'il sait lire les images : sinon il ne sert qu'aux tâches sur le texte (résumé, découvertes, questions, traduction), pas à la lecture de l'image. Avertissement : modèle non essayé par l'app, résultats à vérifier. Rangé dans une partie « Avancé », fermée au départ ; le conseillé reste Qwen3-VL.
14. « ✨ Lire ▾ » avec plusieurs pages, plus clair quand une page est déjà transcrite :
    - à côté de « Sur la page affichée » / « Sur toutes les pages », l'état de chaque page (« Page 1 : 39 lignes, déjà lue · Page 2 : vide ») ;
    - un troisième choix « Seulement les pages pas encore lues » (conseillé dès qu'une page est lue) ;
    - ✅ FAIT le 22 novembre (lecture approfondie d'une page) : « ⇄ Remplacer le texte » ou « ＋ Ajouter à la suite », version « Avant… » gardée. Reste « Comparer » pour la lecture rapide. — relire une page déjà transcrite ne remplace jamais le texte en silence : l'app demande « Comparer côte à côte (conseillé) / Remplacer / Ajouter à la suite », et la version d'avant reste dans 🕘 Versions ;
    - la fenêtre « Lecture approfondie » dit quelle page elle lit (« Page 2 sur 2… 36 s ») et pour quelle page est le texte montré.
15. ✅ FAIT le 22 novembre (fenêtre de comparaison). Lecture approfondie : repérer les lignes répétées par le modèle (ex. la même ligne deux fois de suite) et les signaler, avec « Retirer le doublon ».
16. « 👁 Relire ligne à ligne » avec plusieurs pages : dire quelle page on relit (« Page 1 · ligne 7 sur 39 »), l'image affichée suit la page de la ligne, passage d'une page à l'autre sans quitter la relecture (« Page suivante → »), et au départ le choix « Cette page / Toutes les pages / Seulement les lignes pas encore relues ». L'avancement de la relecture est compté par page.
17. Revue « plusieurs pages » de l'Atelier (22 novembre, lecture du code assets/js/heritage-transcribe.js) — à corriger :
    - ✅ PARÉ le 22 novembre (refus avec une phrase qui renvoie à « 📑 Pages du document », essai dans test-atelier-pages.js) ; reste à faire : changer directement l'image de la page affichée. — IMPORTANT · Changer l'image (glisser une image sur l'acte, ou Fichier → Image de l'acte…) : remplace toujours l'image principale (t.media_id), même quand on est sur la page 2 ; et « Les retirer » efface les zones de TOUTES les pages (t.data.zones = []), pas seulement celles de la page changée (lignes ~276 et ~1369). À faire : changer l'image de la page affichée, ne retirer que ses zones, le dire clairement.
    - ✅ FAIT le 22 novembre. Barre du bas « … px · 41 zones » : compte les zones de toutes les pages ; dire « 12 zones sur cette page (41 en tout) » (ligne ~733).
    - Export (texte, PDF, imprimer) : ne connaît pas les pages (ni titre de page, ni image de chaque page) ; proposer « cette page / toutes les pages » et un titre par page.
    - Fichier → Image de l'acte / image améliorée : seulement l'image affichée ; dire laquelle et proposer toutes les pages.
    - ✅ FAIT le 22 novembre (un seul texte) : 🪄 la barre des corrections donne leur nombre par page (« Page 2 : 7 »), un clic montre la page. Reste : un texte par page.
    - 🧭 Repérer et 🧩 Modèle : en mode « un texte par page », vérifier qu'ils travaillent sur la bonne page (ou toutes), et le dire.
    - Rotation, miroir, redressement, « Mieux voir » : à vérifier s'ils sont gardés pour chaque page (deux photos n'ont pas le même cadrage) ou partagés ; les garder par page.
    - Frise (Lire 39 lignes / Corriger 11 mots) et avancement : dire si c'est la page ou tout le document (« 39 lignes · 2 pages »).
    - 🕘 Versions, chercher / remplacer : préciser si on cherche dans la page ou dans toutes (choix).
    (+ points 14 et 16 : Lire et Relire ligne à ligne.)
    - ✅ FAIT le 22 novembre : la fenêtre « Lecture approfondie » dit la page (« Page 2 (2 sur 4) · Lecture approfondie… 36 s », et dans le titre de la comparaison) ; elle compare avec le texte de la page affichée seulement (avant : tout le document) ; « Garder celle-ci » sur le texte déjà là ne l'ajoute plus une deuxième fois.
    - ✅ FAIT le 22 novembre : « ✨ Lire ▾ » montre « Lignes déjà écrites — Page 1 : 39 · Page 2 : 0 ».
    - ✅ FAIT le 22 novembre : choix « Seulement les pages pas encore lues » (lecture rapide, imprimé, approfondie) ; si toutes ont du texte : « Toutes les pages ont déjà du texte. »
    - ✅ CORRIGÉ le 22 novembre : l'essai « visionneuse ouverte sur une seule page… » cliquait « ＋ » du bloc de l'image d'avant (encore affiché un instant) ; il attend maintenant le bloc de la nouvelle image (vérifications inchangées).
