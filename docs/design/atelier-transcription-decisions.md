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
