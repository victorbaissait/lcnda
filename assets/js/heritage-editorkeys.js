/**
 * ⌨️ Raccourcis à soi dans les outils de modification (🎬 montage vidéo, 🎧 son, 🎚️ retouche, 📐 mise en page).
 * Chaque outil a des commandes (ses menus, ses outils, ses boutons) : on peut donner une touche à n'importe laquelle.
 * Les touches sont lues comme dans l'onglet Raccourcis clavier (même forme « Mod+Shift+K »), et refusées si le système
 * (macOS, Windows, Linux) ou le menu de l'application les prend déjà. Une touche à soi passe avant celle de l'outil.
 * Réglages : Maintenance → Montage, retouche, mise en page et son, et Maintenance → Raccourcis clavier.
 * Chargé après app.js et les éditeurs (heritage-studio.js, heritage-studio-av.js, heritage-layout.js).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const kit = () => A()?.shortcutKit;
    const KEY = 'genealogie-editor-shortcuts', CMDS = 'genealogie-editor-cmds', TAB = 'genealogie-editor-shortcuts-tab';
    const EDITORS = [['montage', '🎬', 'Montage vidéo'], ['audio', '🎧', 'Son'], ['retouch', '🎚️', 'Retouche des photos'], ['layout', '📐', 'Mise en page'], ['vector', '✒️', 'Dessin vectoriel'], ['house', '🏠', 'Maison (plan et 3D)'], ['decortree', '🌳', 'Arbre décoratif'], ['keynote', '🎤', 'Présentation (Keynote)']];
    // les attributs qui disent « quelle commande » sur les boutons de chaque outil
    const ATTR = {
        montage: /^data-mt-cmd$/, // ses menus disent tout (lecture, outils, onglets, pistes)
        audio: /^data-(avx-(play|home|undo|redo|op|zoom|save)|au-(projects|saveproj))$/,
        retouch: /^data-rt-(cmd|mode)$/,
        layout: /^data-ly-(cmd|tool|ptab)$/,
        vector: /^data-vx-(cmd|tool|tab)$/,
        house: /^data-hs-(cmd|tool|tab|mode)$/,
        decortree: /^data-dt-(cmd|shape)$/,
        keynote: /^data-kn-(cmd|ins|tab)$/,
    };
    const ID_RX = /^data-[a-z0-9-]{2,40}(=[^<>"`\\\u0000-\u001f]{0,60})?$/, COMBO_RX = /^[^<>"`\u0000-\u001f]{1,40}$/;
    // les touches que l'outil connaît déjà (une touche à soi les remplace, on prévient)
    const BUILTIN = {
        decortree: {Escape: 'Fermer la fenêtre', Enter: 'Fabriquer l’arbre'},
        keynote: {'Mod+S': 'Enregistrer', 'Mod+Z': 'Annuler', 'Mod+Shift+Z': 'Rétablir', 'Mod+Y': 'Rétablir', 'Mod+C': 'Copier', 'Mod+X': 'Couper', 'Mod+V': 'Coller', 'Mod+D': 'Dupliquer', 'Mod+A': 'Tout sélectionner', 'Mod+G': 'Grouper', 'Mod+Shift+G': 'Dissocier', 'Mod+L': 'Verrouiller / déverrouiller',
            'Mod+]': 'Avancer', 'Mod+[': 'Reculer', 'Mod+Shift+]': 'Tout devant', 'Mod+Shift+[': 'Tout derrière', 'Mod+Enter': 'Lire depuis cette diapositive', 'Mod+Alt+Enter': 'Lire depuis le début', Enter: 'Écrire dans l’objet choisi', Escape: 'Ne rien choisir / finir d’écrire',
            Backspace: 'Supprimer', Delete: 'Supprimer', PageDown: 'Diapositive suivante', PageUp: 'Diapositive précédente', ArrowLeft: 'Déplacer de 1 point (⇧ : 10)', ArrowRight: 'Déplacer de 1 point (⇧ : 10)', ArrowUp: 'Déplacer de 1 point (⇧ : 10)', ArrowDown: 'Déplacer de 1 point (⇧ : 10)'},
        house: {'Mod+S': 'Enregistrer', 'Mod+Z': 'Annuler', 'Mod+Shift+Z': 'Rétablir', Escape: 'Arrêter le tracé, ne rien choisir', Enter: 'Finir le tracé', Backspace: 'Supprimer', Delete: 'Supprimer', Space: 'Main (en restant appuyé)', ArrowLeft: 'Décaler de 1 cm', ArrowRight: 'Décaler de 1 cm', ArrowUp: 'Décaler de 1 cm', ArrowDown: 'Décaler de 1 cm',
            V: 'Choisir', H: 'Main', R: 'Pièce (ou tourner l’objet choisi)', W: 'Mur', P: 'Pièce de forme libre', D: 'Porte', F: 'Fenêtre', M: 'Cote', T: 'Texte'},
        montage: {'Mod+S': 'Enregistrer le projet', 'Mod+Shift+S': 'Enregistrer le projet sous un autre nom', 'Mod+Z': 'Annuler', 'Mod+Shift+Z': 'Rétablir', 'Mod+Y': 'Rétablir', Space: 'Lire / pause', B: 'Couper ici', Backspace: 'Enlever l’élément choisi', Delete: 'Enlever l’élément choisi'},
        audio: {'Mod+S': 'Enregistrer le projet', 'Mod+Shift+S': 'Enregistrer une copie du projet', 'Mod+Z': 'Annuler', 'Mod+Shift+Z': 'Rétablir', Space: 'Écouter / pause', Backspace: 'Couper la sélection', Delete: 'Couper la sélection'},
        retouch: {'Mod+S': 'Enregistrer le projet', 'Mod+Shift+S': 'Enregistrer le projet sous un autre nom', 'Mod+Z': 'Annuler', 'Mod+Shift+Z': 'Rétablir', 'Mod+A': 'Tout sélectionner', 'Mod+D': 'Désélectionner', 'Mod+Shift+I': 'Inverser la sélection', 'Mod+J': 'Sélection → calque', 'Mod+G': 'Grouper',
            Enter: 'Valider (recadrage, plume)', '[': 'Pinceau plus petit', ']': 'Pinceau plus grand', '+': 'Zoom avant', '=': 'Zoom avant', '-': 'Zoom arrière', 0: 'Ajuster', 1: 'Taille réelle', Space: 'Main (en restant appuyé)', Backspace: 'Supprimer', Delete: 'Supprimer', X: 'Intervertir couleur et fond', 'Shift+M': 'Sélection ellipse',
            V: 'Déplacer', M: 'Sélection rectangle', L: 'Lasso', P: 'Plume', W: 'Baguette magique', C: 'Recadrer', J: 'Correcteur de taches', S: 'Tampon', B: 'Pinceau', U: 'Formes', T: 'Texte', H: 'Main', Z: 'Zoom'},
        layout: {'Mod+S': 'Enregistrer', 'Mod+Z': 'Annuler', 'Mod+Shift+Z': 'Rétablir', 'Mod+Y': 'Rétablir', 'Mod+D': 'Dupliquer', 'Mod+J': 'Aller à la page', 'Mod+1': 'Taille réelle', 'Mod+]': 'Avancer', 'Mod+[': 'Reculer', 'Mod+Shift+]': 'Premier plan', 'Mod+Shift+[': 'Arrière-plan', 'Mod+Shift+V': 'Coller sur place', 'Mod+Alt+V': 'Coller sur place',
            Backspace: 'Supprimer', Delete: 'Supprimer', PageDown: 'Page suivante', PageUp: 'Page précédente', ArrowLeft: 'Déplacer l’objet', ArrowRight: 'Déplacer l’objet', ArrowUp: 'Déplacer l’objet', ArrowDown: 'Déplacer l’objet', W: 'Aperçu', X: 'Fond / contour', 'Shift+X': 'Intervertir fond et contour', '/': 'Sans couleur',
            V: 'Sélection', T: 'Texte', F: 'Cadre d’image', M: 'Rectangle', L: 'Ellipse', Y: 'Polygone', E: 'Étoile', '\\': 'Ligne', P: 'Plume', H: 'Main', Z: 'Zoom'},
        vector: {'Mod+S': 'Enregistrer', 'Mod+Z': 'Annuler', 'Mod+Shift+Z': 'Rétablir', 'Mod+Y': 'Rétablir', 'Mod+C': 'Copier', 'Mod+X': 'Couper', 'Mod+V': 'Coller', 'Mod+D': 'Dupliquer', 'Mod+A': 'Tout sélectionner', 'Mod+G': 'Grouper', 'Mod+Shift+G': 'Dissocier', 'Mod+I': 'Importer', 'Mod+0': 'Tout le plan de travail', 'Mod+1': 'Taille réelle', 'Mod+7': 'Masque d’écrêtage', 'Mod+]': 'Avancer', 'Mod+[': 'Reculer', 'Mod+Shift+]': 'Premier plan', 'Mod+Shift+[': 'Arrière-plan',
            Backspace: 'Supprimer', Delete: 'Supprimer', Escape: 'Ne rien sélectionner / sortir du groupe', Enter: 'Terminer le tracé', Space: 'Main (en restant appuyé)', ArrowLeft: 'Déplacer', ArrowRight: 'Déplacer', ArrowUp: 'Déplacer', ArrowDown: 'Déplacer',
            V: 'Sélection', A: 'Sélection directe', P: 'Plume', N: 'Crayon', M: 'Rectangle', L: 'Ellipse', Y: 'Polygone', S: 'Étoile', O: 'Spirale', '\\': 'Ligne', T: 'Texte', I: 'Pipette', H: 'Main', Z: 'Loupe'},
    };
    // les commandes de chaque outil connues d'avance (relues et complétées à chaque ouverture de l'outil)
    const DEFAULT_CMDS = /*DEFAULT_CMDS*/{"vector":[["data-vx-cmd=new","Nouveau dessin","Fichier",""],["data-vx-cmd=open","Ouvrir un dessin…","Fichier",""],["data-vx-cmd=save","Enregistrer","Fichier","⌘S"],["data-vx-cmd=import","⤒ Importer (SVG, PNG, JPG, WEBP, GIF, BMP…)","Fichier","⌘I"],["data-vx-cmd=exp_svg","⤓ Exporter en SVG","Fichier",""],["data-vx-cmd=exp_png","⤓ Exporter en PNG","Fichier",""],["data-vx-cmd=exp_jpg","⤓ Exporter en JPG","Fichier",""],["data-vx-cmd=exp_webp","⤓ Exporter en WEBP","Fichier",""],["data-vx-cmd=exp_pdf","🖨️ Imprimer / PDF","Fichier",""],["data-vx-cmd=exp_sel","⤓ Exporter la sélection en SVG","Fichier",""],["data-vx-cmd=copysvg","📋 Copier le code SVG","Fichier",""],["data-vx-cmd=copypng","📋 Copier l’image","Fichier",""],["data-vx-cmd=toshape","🔷 Enregistrer comme forme (Mes formes)…","Fichier",""],["data-vx-cmd=tomedia","🖼️ Enregistrer dans les médias d’une fiche…","Fichier",""],["data-vx-cmd=tocoat","🛡️ Enregistrer comme image d’armoiries…","Fichier",""],["data-vx-cmd=undo","Annuler","Édition","⌘Z"],["data-vx-cmd=redo","Rétablir","Édition","⇧⌘Z"],["data-vx-cmd=cut","Couper","Édition","⌘X"],["data-vx-cmd=copy","Copier","Édition","⌘C"],["data-vx-cmd=paste","Coller","Édition","⌘V"],["data-vx-cmd=dup","Dupliquer","Édition","⌘D"],["data-vx-cmd=del","Supprimer","Édition","⌫"],["data-vx-cmd=all","Tout sélectionner","Édition","⌘A"],["data-vx-cmd=none","Ne rien sélectionner","Édition","Échap"],["data-vx-cmd=group","Grouper","Objet","⌘G"],["data-vx-cmd=ungroup","Dissocier","Objet","⇧⌘G"],["data-vx-cmd=clipmask","Masque d’écrêtage (l’objet du dessus découpe les autres)","Objet","⌘7"],["data-vx-cmd=unclip","Retirer le masque","Objet",""],["data-vx-cmd=front","Premier plan","Objet","⇧⌘]"],["data-vx-cmd=fwd","Avancer","Objet","⌘]"],["data-vx-cmd=back","Reculer","Objet","⌘["],["data-vx-cmd=bottom","Arrière-plan","Objet","⇧⌘["],["data-vx-cmd=flipH","Retourner horizontalement","Objet",""],["data-vx-cmd=flipV","Retourner verticalement","Objet",""],["data-vx-cmd=rot90","Tourner de 90°","Objet",""],["data-vx-cmd=topath","Convertir en tracé (points modifiables)","Objet",""],["data-vx-cmd=outline","Contour du trait → forme","Objet",""],["data-vx-cmd=simplify","Simplifier le tracé…","Objet",""],["data-vx-cmd=transform","Transformer… (échelle, inclinaison, copies)","Objet",""],["data-vx-cmd=repeat_circle","Répétition en cercle…","Objet",""],["data-vx-cmd=repeat_grid","Répétition en grille…","Objet",""],["data-vx-cmd=lock","🔒 Verrouiller / déverrouiller","Objet",""],["data-vx-cmd=hide","🙈 Masquer","Objet",""],["data-vx-cmd=showall","👁 Tout afficher","Objet",""],["data-vx-cmd=al_l","À gauche","Aligner",""],["data-vx-cmd=al_c","Au centre (horizontal)","Aligner",""],["data-vx-cmd=al_r","À droite","Aligner",""],["data-vx-cmd=al_t","En haut","Aligner",""],["data-vx-cmd=al_m","Au milieu (vertical)","Aligner",""],["data-vx-cmd=al_b","En bas","Aligner",""],["data-vx-cmd=di_h","Répartir horizontalement","Aligner",""],["data-vx-cmd=di_v","Répartir verticalement","Aligner",""],["data-vx-cmd=al_art","Centrer sur le plan de travail","Aligner",""],["data-vx-cmd=pf_union","⬤ Réunir","Pathfinder",""],["data-vx-cmd=pf_subtract","◐ Soustraire (le dessous moins le reste)","Pathfinder",""],["data-vx-cmd=pf_intersect","◑ Intersection","Pathfinder",""],["data-vx-cmd=pf_exclude","◎ Exclure (là où ils se croisent)","Pathfinder",""],["data-vx-cmd=blason","🛡️ Créer un blason…","Blason",""],["data-vx-cmd=charge","⚜️ Ajouter un meuble (fleur de lys, lion, étoile…)…","Blason",""],["data-vx-cmd=vectorize","🪄 Vectoriser une image (refaire un blason scanné)…","Blason",""],["data-vx-cmd=zin","Zoom avant","Affichage","⌘+"],["data-vx-cmd=zout","Zoom arrière","Affichage","⌘−"],["data-vx-cmd=zfit","Tout le plan de travail","Affichage","⌘0"],["data-vx-cmd=z100","Taille réelle","Affichage","⌘1"],["data-vx-cmd=grid","Grille et magnétisme…","Affichage",""],["data-vx-cmd=smart","Repères commentés (aimanter aux objets) : oui / non","Affichage",""],["data-vx-tool=select","Sélection","Outils (colonne de gauche)",""],["data-vx-tool=direct","Sélection directe (points et poignées)","Outils (colonne de gauche)",""],["data-vx-tool=pen","Plume (clic : point, glisser : courbe)","Outils (colonne de gauche)",""],["data-vx-tool=pencil","Crayon (à main levée)","Outils (colonne de gauche)",""],["data-vx-tool=rect","Rectangle","Outils (colonne de gauche)",""],["data-vx-tool=ellipse","Ellipse","Outils (colonne de gauche)",""],["data-vx-tool=polygon","Polygone","Outils (colonne de gauche)",""],["data-vx-tool=star","Étoile","Outils (colonne de gauche)",""],["data-vx-tool=spiral","Spirale (glisser depuis le centre)","Outils (colonne de gauche)",""],["data-vx-tool=line","Ligne","Outils (colonne de gauche)",""],["data-vx-tool=text","Texte","Outils (colonne de gauche)",""],["data-vx-tool=eyedrop","Pipette (prend la couleur d’un objet)","Outils (colonne de gauche)",""],["data-vx-tool=hand","Main (déplacer la vue)","Outils (colonne de gauche)",""],["data-vx-tool=zoom","Loupe (⌥ : dézoomer)","Outils (colonne de gauche)",""],["data-vx-tab=props","Propriétés","Onglets du panneau de droite",""],["data-vx-tab=layers","Calques","Onglets du panneau de droite",""],["data-vx-tab=blason","Blason","Onglets du panneau de droite",""],["data-vx-tab=doc","Document","Onglets du panneau de droite",""]],"montage":[["data-mt-cmd=proj","💾 Enregistrer le projet","Fichier","⌘S"],["data-mt-cmd=projas","Enregistrer le projet sous un autre nom…","Fichier","⇧⌘S"],["data-mt-cmd=projects","📂 Projets…","Fichier",""],["data-mt-cmd=export","📤 Exporter la vidéo (MP4 / WebM)…","Fichier",""],["data-mt-cmd=close","Fermer","Fichier",""],["data-mt-cmd=undo","↶ Annuler","Édition","⌘Z"],["data-mt-cmd=redo","↷ Rétablir","Édition","⇧⌘Z"],["data-mt-cmd=op:split","✂️ Couper ici","Édition","B"],["data-mt-cmd=op:start","⟦ Commence ici","Édition",""],["data-mt-cmd=op:end","⟧ Finit ici","Édition",""],["data-mt-cmd=op:left","← Avancer le morceau","Édition",""],["data-mt-cmd=op:right","Reculer le morceau →","Édition",""],["data-mt-cmd=op:detach","🔊 Séparer le son de l’image","Édition",""],["data-mt-cmd=op:del","🗑 Enlever l’élément choisi","Édition","⌫"],["data-mt-cmd=import","📥 Importer des rushes (vidéos, photos, sons)…","Ajouter",""],["data-mt-cmd=base","🗂 Un rush de la base…","Ajouter",""],["data-mt-cmd=op:addv1","➕ Vidéo / photo à la suite","Ajouter",""],["data-mt-cmd=op:addv2","➕ Incrustation","Ajouter",""],["data-mt-cmd=op:addtext","➕ Titre / texte","Ajouter",""],["data-mt-cmd=op:adda","➕ Son / musique","Ajouter",""],["data-mt-cmd=track:v","＋ Piste vidéo","Pistes",""],["data-mt-cmd=track:t","＋ Piste texte","Pistes",""],["data-mt-cmd=track:a","＋ Piste son","Pistes",""],["data-mt-cmd=play","▶ Lire / pause","Lecture","Espace"],["data-mt-cmd=home","⏮ Au début","Lecture",""],["data-mt-cmd=op:kfprev","◀ ◆ Image clé précédente","Lecture",""],["data-mt-cmd=op:kfnext","◆ ▶ Image clé suivante","Lecture",""],["data-mt-cmd=tab:rush","🎞️ Rushes","Affichage",""],["data-mt-cmd=tab:item","🎯 Élément choisi","Affichage",""],["data-mt-cmd=tab:color","🎨 Couleurs du film","Affichage",""],["data-mt-cmd=tab:sound","🔊 Son du film","Affichage",""],["data-mt-cmd=tab:film","🎞️ Le film (rotation, fondus)","Affichage",""],["data-mt-cmd=zoom:in","Zoom avant sur la frise","Affichage","⌘+"],["data-mt-cmd=zoom:out","Zoom arrière sur la frise","Affichage","⌘−"],["data-mt-cmd=zoom:0","Zoom de départ","Affichage","⌘0"],["data-mt-cmd=full","⛶ Plein écran","Affichage",""]],"audio":[["data-avx-zoom=fit","⤢ Tout voir","Zoom",""],["data-avx-zoom=sel","🔍 Zoomer sur la sélection","Zoom",""],["data-avx-zoom=out","− Zoom arrière","Zoom",""],["data-avx-zoom=in","+ Zoom avant","Zoom",""],["data-avx-play","▶ Écouter","Lecture",""],["data-avx-home","⏮ Au début","Lecture",""],["data-avx-undo","↶ Annuler","Lecture",""],["data-avx-redo","↷ Rétablir","Lecture",""],["data-avx-op=cut","✂️ Supprimer la sélection","Outils du son",""],["data-avx-op=keep","⬚ Garder seulement la sélection","Outils du son",""],["data-avx-op=silence","🔇 Silence","Outils du son",""],["data-avx-op=fadein","↗ Fondu d’entrée","Outils du son",""],["data-avx-op=fadeout","↘ Fondu de sortie","Outils du son",""],["data-avx-op=gain","🔊 Volume…","Outils du son",""],["data-avx-op=normalize","📏 Normaliser","Outils du son",""],["data-avx-op=denoise","🧹 Réduire le souffle","Outils du son",""],["data-avx-op=clarity","🗣️ Voix plus nette","Outils du son",""],["data-avx-op=hum","〰️ Enlever le bourdonnement","Outils du son",""],["data-avx-op=silences","⏩ Raccourcir les longs blancs","Outils du son",""],["data-avx-op=mono","🎧 Mono","Outils du son",""],["data-avx-op=insert","➕ Ajouter un son…","Outils du son",""],["data-au-projects","📂 Projets son…","Fichier",""],["data-au-saveproj","💾 Enregistrer le projet","Fichier",""],["data-avx-save","💾 Enregistrer le son fini…","Fichier",""]],"retouch":[["data-rt-cmd=proj:save","💾 Enregistrer le projet (pour continuer plus tard)","Fichier","⌘S"],["data-rt-cmd=proj:saveas","Enregistrer le projet sous un autre nom…","Fichier","⇧⌘S"],["data-rt-cmd=proj:open","📂 Ouvrir un projet…","Fichier",""],["data-rt-cmd=save:show","🖼 Enregistrer l’image dans les Médias","Fichier",""],["data-rt-cmd=save:keep","Enregistrer sans l’afficher","Fichier",""],["data-rt-cmd=save:copy","Copie séparée","Fichier",""],["data-rt-cmd=download:png","Télécharger en PNG","Fichier",""],["data-rt-cmd=download:jpg","Télécharger en JPG","Fichier",""],["data-rt-cmd=close","Fermer","Fichier",""],["data-rt-cmd=undo","↶ Annuler","Édition","⌘Z"],["data-rt-cmd=redo","↷ Rétablir","Édition","⇧⌘Z"],["data-rt-cmd=tab:history","🕘 Historique","Édition",""],["data-rt-cmd=tab:adjust","🎚 Réglages et courbe","Image",""],["data-rt-cmd=preset:0","Réglage automatique","Image",""],["data-rt-cmd=mode:crop","⌗ Recadrer et redresser","Image",""],["data-rt-cmd=cropclear","Annuler le recadrage","Image",""],["data-rt-cmd=reset","Remettre comme au départ","Image",""],["data-rt-cmd=ladd","＋ Nouveau calque","Calque",""],["data-rt-cmd=gadd","📁 Nouveau groupe","Calque",""],["data-rt-cmd=gwrap","Grouper le calque choisi","Calque","⌘G"],["data-rt-cmd=aadd","🎚 Nouveau calque de réglage","Calque",""],["data-rt-cmd=sel:copy","Copier la sélection sur un calque","Calque","⌘J"],["data-rt-cmd=mask:add","🎭 Ajouter un masque au calque choisi","Calque",""],["data-rt-cmd=mask:sel","Masque d’après la sélection","Calque",""],["data-rt-cmd=mask:invert","Inverser le masque","Calque",""],["data-rt-cmd=mask:del","Retirer le masque","Calque",""],["data-rt-cmd=tab:layers","🗂 Calques","Calque",""],["data-rt-cmd=sel:all","Tout sélectionner","Sélection","⌘A"],["data-rt-cmd=sel:none","Désélectionner","Sélection","⌘D"],["data-rt-cmd=sel:invert","Inverser","Sélection","⇧⌘I"],["data-rt-cmd=sel:feather","Contour progressif…","Sélection",""],["data-rt-cmd=sel:grow","Agrandir…","Sélection",""],["data-rt-cmd=sel:shrink","Réduire…","Sélection",""],["data-rt-cmd=sel:fill","Remplir avec la couleur","Sélection",""],["data-rt-cmd=sel:clear","Effacer (transparent)","Sélection","⌫"],["data-rt-cmd=sel:crop","Recadrer sur la sélection","Sélection",""],["data-rt-cmd=tab:filters","✨ Filtres : flou, netteté, grain, vignette…","Filtre",""],["data-rt-cmd=filters:reset","Enlever les filtres","Filtre",""],["data-rt-cmd=side:toggle","Replier / ouvrir le panneau de droite","Affichage","Tab"],["data-rt-cmd=zoom:in","Zoom avant","Affichage","+"],["data-rt-cmd=zoom:out","Zoom arrière","Affichage","−"],["data-rt-cmd=zoom:fit","Toute l’image","Affichage","0"],["data-rt-cmd=zoom:100","Taille réelle","Affichage","1"],["data-rt-mode=adjust","🎚 Réglages","Outils",""],["data-rt-mode=heal","🩹 Correcteur de taches","Outils",""],["data-rt-mode=clone","🧬 Tampon","Outils",""],["data-rt-mode=brush","🖌 Pinceau","Outils",""],["data-rt-mode=text","🔤 Texte","Outils",""],["data-rt-mode=hand","✋ Déplacer la vue","Outils",""],["data-rt-cmd=cropok","✓ Valider","Options des outils (pinceau, texte…)",""],["data-rt-mode=move","Déplacer un élément d’un calque","Colonne d’outils",""],["data-rt-mode=marquee","Sélection rectangle","Colonne d’outils",""],["data-rt-mode=ellipsesel","Sélection ellipse","Colonne d’outils",""],["data-rt-mode=lasso","Lasso : entourer à main levée","Colonne d’outils",""],["data-rt-mode=polysel","Plume : sélection point par point — double-clic ou Entrée pour fermer","Colonne d’outils",""],["data-rt-mode=wand","Sélection automatique (baguette magique)","Colonne d’outils",""],["data-rt-mode=crop","Recadrer et redresser","Colonne d’outils",""],["data-rt-mode=shape","Formes : rectangle, ellipse, ligne, flèche","Colonne d’outils",""],["data-rt-mode=zoom","Zoom","Colonne d’outils",""]],"layout":[["data-ly-cmd=save","💾 Enregistrer","Fichier","⌘S"],["data-ly-cmd=saveas","Enregistrer une copie…","Fichier",""],["data-ly-cmd=savedesign","🎨 Enregistrer comme design…","Fichier",""],["data-ly-cmd=pdf","📄 Exporter en PDF (imprimer)…","Fichier",""],["data-ly-cmd=pdfbleed","📄 PDF avec fond perdu et traits de coupe…","Fichier",""],["data-ly-cmd=html","🌐 Exporter en page HTML","Fichier",""],["data-ly-cmd=json","⬇️ Exporter le fichier du document (.json)","Fichier",""],["data-ly-cmd=close","Fermer","Fichier",""],["data-ly-cmd=undo","↶ Annuler","Édition","⌘Z"],["data-ly-cmd=redo","↷ Rétablir","Édition","⇧⌘Z"],["data-ly-cmd=cut","Couper","Édition","⌘X"],["data-ly-cmd=copy","Copier","Édition","⌘C"],["data-ly-cmd=paste","Coller","Édition","⌘V"],["data-ly-cmd=dup","Dupliquer","Édition","⌘D"],["data-ly-cmd=del","Supprimer","Édition","⌫"],["data-ly-cmd=all","Tout sélectionner","Édition","⌘A"],["data-ly-cmd=none","Désélectionner","Édition","Échap"],["data-ly-cmd=front","Premier plan","Objet","⇧⌘]"],["data-ly-cmd=fwd","Avancer","Objet","⌘]"],["data-ly-cmd=back","Reculer","Objet","⌘["],["data-ly-cmd=bottom","Arrière-plan","Objet","⇧⌘["],["data-ly-cmd=lock","🔒 Verrouiller / déverrouiller","Objet",""],["data-ly-cmd=hide","🙈 Masquer","Objet",""],["data-ly-cmd=showall","👁 Tout afficher","Objet",""],["data-ly-cmd=fitframe","Ajuster le cadre au contenu","Objet",""],["data-ly-cmd=place","🖼️ Placer une image…","Objet",""],["data-ly-cmd=addend","➕ Ajouter une page à la fin","Page",""],["data-ly-cmd=insert","➕ Insérer des pages…","Page",""],["data-ly-cmd=duppage","Dupliquer la page","Page",""],["data-ly-cmd=delpage","🗑 Supprimer la page","Page",""],["data-ly-cmd=masters","📄 Gabarit de plusieurs pages…","Page",""],["data-ly-cmd=goto","Aller à la page…","Page","⌘J"],["data-ly-cmd=first","⏮ Première page","Page",""],["data-ly-cmd=prev","‹ Page précédente","Page","Pg↑"],["data-ly-cmd=next","Page suivante ›","Page","Pg↓"],["data-ly-cmd=last","Dernière page ⏭","Page",""],["data-ly-cmd=zin","Zoom avant","Affichage","⌘+"],["data-ly-cmd=zout","Zoom arrière","Affichage","⌘−"],["data-ly-cmd=zfit","Page entière","Affichage","⌘0"],["data-ly-cmd=z100","Taille réelle","Affichage","⌘1"],["data-ly-cmd=guides","Repères et marges","Affichage",""],["data-ly-cmd=snap","Magnétisme","Affichage",""],["data-ly-cmd=preview","Aperçu (sans repères)","Affichage","W"],["data-ly-tool=select","Sélection","Outils (colonne de gauche)",""],["data-ly-tool=text","Texte","Outils (colonne de gauche)",""],["data-ly-tool=frame","Cadre d’image","Outils (colonne de gauche)",""],["data-ly-tool=rect","Rectangle","Outils (colonne de gauche)",""],["data-ly-tool=ellipse","Ellipse","Outils (colonne de gauche)",""],["data-ly-tool=polygon","Polygone","Outils (colonne de gauche)",""],["data-ly-tool=star","Étoile","Outils (colonne de gauche)",""],["data-ly-tool=line","Ligne","Outils (colonne de gauche)",""],["data-ly-tool=pen","Plume : clic = point, double-clic ou Entrée = fini","Outils (colonne de gauche)",""],["data-ly-tool=hand","Main","Outils (colonne de gauche)",""],["data-ly-tool=zoom","Zoom","Outils (colonne de gauche)",""]]}/*/DEFAULT_CMDS*/;

    const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { toast('Plus de place pour enregistrer ce réglage.', 'error'); return false; } };
    /** Les raccourcis à soi : {outil: {commande: touche}} (nettoyés) */
    function prefs() {
        const raw = read(KEY, {}), out = {};
        EDITORS.forEach(([k]) => { out[k] = {}; Object.entries(raw[k] || {}).slice(0, 300).forEach(([id, c]) => { if (ID_RX.test(id) && typeof c === 'string' && COMBO_RX.test(c)) out[k][id] = c; }); });
        return out;
    }
    const savePrefs = p => write(KEY, p);
    /** Les commandes connues d'un outil : [[commande, nom, groupe, touche de l'outil]] */
    function cmds(kind) {
        const seen = new Map();
        [...(DEFAULT_CMDS[kind] || []), ...((read(CMDS, {})[kind]) || [])].forEach(r => { if (Array.isArray(r) && ID_RX.test(r[0] || '')) seen.set(r[0], [r[0], String(r[1] || r[0]).slice(0, 90), String(r[2] || 'Autres boutons').slice(0, 50), String(r[3] || '').slice(0, 12)]); });
        return [...seen.values()];
    }
    const selOf = id => { const i = id.indexOf('='); return i < 0 ? `[${id}]` : `[${id.slice(0, i)}="${CSS.escape(id.slice(i + 1))}"]`; };
    const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
    /** Relit les commandes de l'outil ouvert (menus, outils, boutons) et les garde pour les réglages */
    function harvest(dl, kind) {
        const rx = ATTR[kind]; if (!rx) return;
        const found = new Map();
        dl.querySelectorAll('button').forEach(b => {
            const a = [...b.attributes].find(x => rx.test(x.name)); if (!a) return;
            const id = a.value ? `${a.name}=${a.value}` : a.name; if (!ID_RX.test(id)) return;
            const menu = b.closest('.h-rt-menu, .ly-menus details, .h-mt-menubar details, .vx-menus details');
            if (found.has(id) && (!menu || found.get(id).menu)) return; // le nom du menu passe avant celui d'un bouton
            const txt = clean(b.textContent), hasWords = (txt.match(/\p{L}/gu) || []).length >= 3;
            const label = (clean(b.querySelector(':scope > span')?.textContent) || (hasWords ? txt : '') || clean(b.dataset.tbLabel) || clean(b.title) || txt)
                .replace(/\s*\((⌘|⇧|⌥|Ctrl|Maj|Alt|[A-Z0-9\\]|Tab|Échap)[^)]{0,8}\)/g, '').replace(/\s+—\s+(Tab|⌥.*|Alt.*)$/, '').trim();
            if (!label) return;
            const group = clean(menu?.querySelector('summary')?.textContent) || clean(b.closest('[data-tbg]')?.dataset.tbgLabel) || clean(b.closest('details')?.querySelector('summary')?.textContent) || 'Autres boutons';
            const row = [id, label.slice(0, 90), group.replace(/\s*\(\d+\)$/, '').slice(0, 50), clean(b.querySelector('kbd')?.textContent).slice(0, 12)]; row.menu = !!menu;
            found.set(id, row);
        });
        if (!found.size) return;
        const all = read(CMDS, {}), had = new Map((all[kind] || []).filter(Array.isArray).map(r => [r[0], r]));
        found.forEach((r, id) => had.set(id, r.slice(0, 4)));
        all[kind] = [...had.values()].slice(0, 400); write(CMDS, all);
    }
    /** Un outil s'ouvre : on note ses commandes (tout de suite, puis une fois tout affiché, et à la fermeture) */
    ext.editorKeysAttach = (dl, kind) => {
        if (!dl || !ATTR[kind]) return;
        dl.dataset.edKind = kind;
        const go = () => { try { harvest(dl, kind); } catch (_) {} };
        setTimeout(go, 50); setTimeout(go, 2000); dl.addEventListener('close', go, {once: true});
    };

    /* ── Les touches : avant celles de l'outil et de l'app (écoute sur la fenêtre, en premier) ── */
    let capturing = null;
    window.addEventListener('keydown', e => {
        if (capturing) { e.preventDefault(); e.stopImmediatePropagation(); capturing(e); return; }
        if (e.isComposing || !kit()) return;
        const top = [...document.querySelectorAll('dialog[open]')].at(-1), kind = top?.dataset.edKind; if (!kind) return;
        const map = prefs()[kind]; if (!Object.keys(map).length) return;
        const combo = kit().eventCombo(e); if (!combo) return;
        const id = Object.keys(map).find(k => map[k] === combo); if (!id) return;
        if (kit().isTyping(e.target) && !(kit().hasMod(combo) || kit().isFKey(combo))) return; // une lettre seule : pas pendant qu'on écrit
        e.preventDefault(); e.stopImmediatePropagation(); if (e.repeat) return;
        const el = top.querySelector(selOf(id)), name = cmds(kind).find(r => r[0] === id)?.[1] || id;
        if (!el) return toast(`« ${name} » n’est pas disponible pour l’instant.`);
        if (el.disabled) return toast(`« ${name} » : rien à faire pour l’instant.`);
        top.querySelectorAll('details[open]').forEach(d => { if (!d.contains(el)) d.removeAttribute('open'); });
        el.click();
    }, true);

    /* ── Choisir une touche : fenêtre qui écoute, puis dit ce qui coince ── */
    function conflicts(kind, id, combo) {
        const K = kit(), out = {block: [], warn: [], info: []};
        if (!combo) return out;
        const os = K.osConflict(combo); if (os) out.block.push(`Déjà pris par ${K.platformName} ou le menu de l’application : « ${os} ».`);
        const app = K.appConflict(combo); if (app.length) out.block.push(`Déjà pris par l’app (même quand un outil est ouvert) : « ${app.join(' », « ')} ». Change-le d’abord dans Raccourcis clavier si tu veux cette touche.`);
        const own = BUILTIN[kind]?.[combo]; if (own) out.warn.push(`Dans cet outil, cette touche sert déjà à « ${own} » : ton raccourci passera avant.`);
        const p = prefs()[kind], other = Object.keys(p).filter(k => k !== id && p[k] === combo).map(k => cmds(kind).find(r => r[0] === k)?.[1] || k);
        if (other.length) out.warn.push(`Déjà donné à « ${other.join(' », « ')} » : il lui sera retiré.`);
        const note = K.osNote(combo); if (note) out.info.push(note);
        if (!K.hasMod(combo) && !K.isFKey(combo)) out.info.push(`Sans ${K.IS_MAC ? '⌘' : 'Ctrl'}, il ne marchera qu’en dehors des cases de texte.`);
        if (K.IS_MAC && /^Alt\+(Shift\+)?[A-Z0-9]$/.test(combo)) out.info.push('Sur Mac, ⌥ + lettre écrit un caractère spécial dans les cases : il ne marchera qu’en dehors des cases.');
        if (!K.IS_MAC && /^Alt\+[A-Z]$/.test(combo)) out.info.push('Sous Windows, Alt + lettre peut aussi ouvrir un menu.');
        return out;
    }
    function captureKey(kind, id, label, onDone) {
        const K = kit(); if (!K) return toast('Raccourcis indisponibles.', 'error');
        const cur = prefs()[kind][id] || '';
        const dlg = document.createElement('dialog'); dlg.className = 'modal small-modal shortcut-capture';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">${esc(EDITORS.find(x => x[0] === kind)?.[2] || '')} · NOUVEAU RACCOURCI</span><h2>${esc(label)}</h2><p>Appuie maintenant sur la combinaison voulue.<br>Échap : annuler · Retour arrière : aucun raccourci.</p></div></div><div class="shortcut-capture-key">${K.kbd(cur)}</div><div class="shortcut-capture-warning" aria-live="polite"></div><div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-cancel>Annuler</button><button class="button" type="button" data-ok disabled>Utiliser ce raccourci</button></div>`;
        document.body.append(dlg);
        let combo = null;
        const done = () => { capturing = null; if (dlg.open) dlg.close(); dlg.remove(); };
        dlg.addEventListener('close', () => { capturing = null; dlg.remove(); });
        dlg.querySelector('[data-cancel]').addEventListener('click', done);
        const ok = dlg.querySelector('[data-ok]'), warn = dlg.querySelector('.shortcut-capture-warning');
        ok.addEventListener('click', () => {
            if (combo === null) return;
            const p = prefs(), m = p[kind];
            Object.keys(m).forEach(k => { if (k !== id && m[k] === combo && combo) delete m[k]; });
            if (combo) m[id] = combo; else delete m[id];
            savePrefs(p); done(); toast(combo ? `Nouveau raccourci : ${K.comboLabel(combo)}` : 'Raccourci retiré.'); onDone?.();
        });
        capturing = e => {
            if (e.target.closest?.('[data-cancel],[data-ok]') && (e.key === 'Enter' || e.key === ' ')) { e.target.click(); return; }
            if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) return done();
            if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey) combo = '';
            else { const c = K.eventCombo(e); if (!c) return; combo = c; }
            dlg.querySelector('.shortcut-capture-key').innerHTML = K.kbd(combo);
            const c = conflicts(kind, id, combo);
            warn.innerHTML = combo === '' ? '<p>Cette action n’aura plus de raccourci.</p>'
                : [...c.block.map(t => `<p class="is-danger">⛔ ${esc(t)}</p>`), ...c.warn.map(t => `<p class="is-danger">⚠️ ${esc(t)}</p>`), ...c.info.map(t => `<p>${esc(t)}</p>`)].join('') || '<p class="is-ok">✓ Aucun conflit connu.</p>';
            ok.disabled = !!c.block.length;
        };
        dlg.showModal();
    }

    /* ── La liste des raccourcis d'un outil (Maintenance → Montage, retouche, mise en page et son ; Raccourcis clavier) ── */
    /** Dessine le réglage dans box (un élément vide) ; garde l'onglet et la recherche */
    ext.editorKeysPanel = box => {
        if (!box) return;
        let kind = (() => { try { return localStorage.getItem(TAB) || 'montage'; } catch (_) { return 'montage'; } })(); if (!ATTR[kind]) kind = 'montage';
        let q = '';
        const K = kit();
        const draw = () => {
            if (!K) { box.innerHTML = '<p class="muted">Raccourcis indisponibles.</p>'; return; }
            const p = prefs()[kind], list = cmds(kind), n = s => String(s).toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');
            const words = n(q).split(/\s+/).filter(Boolean), rows = list.filter(r => words.every(w => n(`${r[1]} ${r[2]} ${p[r[0]] ? K.comboLabel(p[r[0]]) : ''}`).includes(w)));
            const groups = [...new Set(rows.map(r => r[2]))];
            const mine = Object.keys(p).length;
            box.innerHTML = `<div class="segmented enquetes-tab-toggle h-et-tabs h-ek-tabs">${EDITORS.map(([k, ic, l]) => `<button type="button" class="${k === kind ? 'is-active ' : ''}enquetes-tab-btn" data-ek-tab="${k}"><span class="enquetes-tab-icon" aria-hidden="true">${ic}</span><span>${esc(l)}${Object.keys(prefs()[k]).length ? ` <small>(${Object.keys(prefs()[k]).length})</small>` : ''}</span></button>`).join('')}</div>
                <p class="muted">Donne une touche à n’importe quelle commande de l’outil (ses menus, ses outils, ses boutons). ${esc(K.platformName)} et le menu de l’application passent avant : une touche qu’ils prennent est refusée. Ton raccourci passe avant la touche de l’outil. Sans ${K.IS_MAC ? '⌘' : 'Ctrl'}, il ne marche qu’en dehors des cases de texte.</p>
                <div class="h-ek-bar"><input type="search" data-ek-q placeholder="Chercher une commande…" value="${esc(q)}"><span class="muted">${mine} raccourci${mine > 1 ? 's' : ''} à toi</span><span class="spacer"></span>${mine ? '<button type="button" class="button small secondary" data-ek-clear>Tout retirer pour cet outil</button>' : ''}</div>
                ${list.length ? (rows.length ? `<div class="data-table-wrap"><table class="data-table shortcut-table is-editable h-ek-table"><thead><tr><th>Commande</th><th>Touche de l’outil</th><th>Mon raccourci</th><th></th></tr></thead>${groups.map(g => `<tbody class="shortcut-group"><tr><th colspan="4">${esc(g)}</th></tr>${rows.filter(r => r[2] === g).map(r => `<tr><td>${esc(r[1])}</td><td>${r[3] ? `<kbd class="shortcut-kbd">${esc(K.IS_MAC ? r[3] : r[3].replace(/⇧/g, 'Maj+').replace(/⌥/g, 'Alt+').replace(/⌘/g, 'Ctrl+').replace(/Pg↑/, 'Page↑').replace(/Pg↓/, 'Page↓'))}</kbd>` : '<span class="muted">—</span>'}</td><td>${p[r[0]] ? K.kbd(p[r[0]]) : '<span class="muted">—</span>'}</td><td class="h-ek-act"><button type="button" class="button small secondary" data-ek-set="${esc(r[0])}">${p[r[0]] ? 'Changer' : 'Choisir'}</button>${p[r[0]] ? `<button type="button" class="button small secondary" data-ek-del="${esc(r[0])}" title="Retirer ce raccourci">✕</button>` : ''}</td></tr>`).join('')}</tbody>`).join('')}</table></div>` : '<p class="muted">Aucune commande ne correspond.</p>')
                    : '<p class="muted">Ouvre une fois cet outil pour que ses commandes apparaissent ici.</p>'}
                <details class="h-ek-builtin"><summary>Touches déjà prévues dans cet outil</summary><p>${Object.entries(BUILTIN[kind] || {}).map(([c, l]) => `${K.kbd(c)} ${esc(l)}`).join(' · ')}</p></details>`;
        };
        draw();
        box.onclick = e => {
            const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
            if (d.ekTab) { kind = d.ekTab; try { localStorage.setItem(TAB, kind); } catch (_) {} return draw(); }
            if (d.ekSet) return captureKey(kind, d.ekSet, cmds(kind).find(r => r[0] === d.ekSet)?.[1] || d.ekSet, draw);
            if (d.ekDel) { const p = prefs(); delete p[kind][d.ekDel]; savePrefs(p); toast('Raccourci retiré.'); return draw(); }
            if (d.ekClear !== undefined) { if (!confirm('Retirer tous tes raccourcis de cet outil ?')) return; const p = prefs(); p[kind] = {}; savePrefs(p); return draw(); }
        };
        box.oninput = e => { if (e.target.matches('[data-ek-q]')) { q = e.target.value; const pos = e.target.selectionStart; draw(); const i = box.querySelector('[data-ek-q]'); i.focus(); i.setSelectionRange(pos, pos); } };
    };
    ext.editorKeysInternals = {prefs, cmds, conflicts, harvest, selOf, BUILTIN};
})();
