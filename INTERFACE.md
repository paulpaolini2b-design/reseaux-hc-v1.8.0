# Réseaux HC — organisation de l'interface (v1.7.1)

Démarche du §11 : 1) inventaire de toutes les fonctions accessibles en v1.7.0 ; 2) emplacement cible ; 3) mise en œuvre et
table de correspondance (README et panneau « Nouveautés » affiché une fois au premier lancement).

Règles appliquées : toute fonction à **2 appuis au plus** depuis le plan ; raccourcis clavier **inchangés** ; barre
latérale = poser et tracer ; barre du haut = projet, pages, calques, légende, descriptif, mesure, export, réglages ;
Annuler / Rétablir toujours visibles (paysage 800 px compris) ; icône + libellé court sous chaque bouton ; fiche en
sections repliables dans un ordre fixe ; menu « ≡ Tout » cherchable ; cibles tactiles ≥ 44 px. **Aucune fonction n'a
été supprimée ni cachée.**

Appuis comptés depuis le plan affiché, projet ouvert, aucun panneau ouvert. « Objet » = l'objet est d'abord sélectionné
par un appui (non compté : c'est le geste qui désigne la cible).

## 1. Inventaire (v1.7.0) et 2. emplacement cible (v1.7.1)

| Fonction | Emplacement v1.7.0 | Raccourci | Appuis v1.7.0 | Emplacement v1.7.1 | Appuis v1.7.1 |
|---|---|---|---|---|---|
| Gestionnaire de projets | Haut → icône dossier | — | 1 | Haut → Projets | 1 |
| Informations de l'affaire | Haut → nom du projet | — | 1 | inchangé | 1 |
| Sauvegarder | automatique | Ctrl+S | 0 | inchangé ; aussi ≡ Tout | 0 |
| Pages (liste, ajout, ordre, format, renommer, supprimer) | Latérale → Outils → Pages… ; nom du sélecteur ‹ › (dès 2 pages) | — | 2 | **Haut → Pages** ; nom du sélecteur conservé | 1 |
| Page précédente / suivante | ‹ › en bas à droite | Page préc. / Page suiv. | 1 | inchangé | 1 |
| Fond de plan (PDF, image, photo) | Haut → icône image | — | 1 | Haut → Fond | 1 |
| Répartir les pages en plans | Calques | — | 2 | inchangé | 2 |
| Calques (visibilité, verrou, opacité), réseaux affichés, opacité du fond | Haut → Calques | — | 1 | Haut → Calques | 1 |
| Échelle du plan, aligner les objets | Calques (défilement) | — | 1 + défilement | **Haut → Réglages** (panneau ouvert sur les réglages) | 1 |
| Taille textes / symboles, longueurs sur étiquettes | Calques (défilement) | — | 1 + défilement | **Haut → Réglages** | 1 |
| Accrochage angulaire | Calques | A | 1 | Haut → Réglages | 1 |
| Couleurs de texte par défaut | Latérale → Outils → entrée | — | 2 | **Haut → Réglages → bouton** | 2 |
| Réglages de la tablette (indicateur de longueur, pictogramme photo) | Calques (bas du panneau) | — | 1 + défilement | Haut → Réglages (même panneau) | 1 |
| Légende : afficher / masquer | Calques → case ; croix sur la légende ; Outils → Légende | — | 2 | **Haut → Légende** (bascule) ; anciens accès conservés | 1 |
| Légende : cadre, fond, couleur, replacer | Calques | — | 1 + défilement | inchangé (≡ Tout l'ouvre sur la section) | 1 |
| Descriptif : créer / réafficher | Latérale → Outils → Descriptif | — | 2 | **Haut → Descr.** (crée, ou ouvre l'éditeur) ; Outils conservé | 1 |
| Descriptif : éditeur | double appui sur le bloc ; menu du bloc ; Calques | — | 2 | Haut → Descr. ; anciens accès conservés | 1 |
| Descriptif : colonnes, sortie PDF, aspect, échelle | Calques | — | 1 + défilement | inchangé | 1 |
| Mesure, calibration, contrôle | Haut → règle | M | 1 | Haut → Mesure | 1 |
| Objets à compléter | Haut → ! | — | 1 | Haut → À compl. | 1 |
| Étiquettes masquer / afficher | Haut → étiquette | E | 1 | Haut → Étiq. | 1 |
| Aperçu papier | Haut → feuille | — | 1 | Haut → Papier | 1 |
| Export PDF / PNG / .json | Haut → flèche | — | 1 | Haut → Export | 1 |
| Aide et raccourcis | Haut → ? | ? | 1 | Haut → Aide | 1 |
| **Toutes les fonctions (recherche)** | — | — | — | **Haut → Tout (≡)** | 1 |
| Sélection | Latérale | 1 | 1 | inchangé | 1 |
| Tronçon, fourreau, support, coffret, poste, boîte de jonction, ERAS, MALT, note | Latérale | 2, 0, 3, 4, 5, 6, 7, 8, 9 | 1 | inchangé | 1 |
| Gomme | Latérale | X | 1 | inchangé | 1 |
| Dessin (masques, aplats, surligneur, pipette) | Latérale | — | 1 | inchangé | 1 |
| Bibliothèque (nomenclature) | Latérale → Biblio | — | 1 | inchangé | 1 |
| Annotations (flèches, nord, cotation, zones, trait, stylo, croix…), lanterne / boucle EP, image, plan de situation, objet Légende, objet Descriptif | Latérale → Outils → entrée | — | 2 | inchangé | 2 |
| Pose continue / unique | Latérale | P | 1 | inchangé | 1 |
| Annuler / Rétablir | Latérale (pouvaient sortir de l'écran si la barre défilait) | Ctrl+Z / Ctrl+Y | 1 | Latérale, **fixés en bas, toujours visibles**, avec libellé | 1 |
| Fiche de l'objet | appui sur l'objet | F, Entrée | 1 | inchangé | 1 |
| Dupliquer / supprimer | fiche ; appui long | Ctrl+D / Suppr | 2 | inchangé | 2 |
| Tourner ±90°, réinitialiser, déport, inverser le sens, détacher, rogner | appui long sur l'objet | R / Maj+R, C | 2 | inchangé | 2 |
| Déplacer, échelle des blocs | glisser, poignées | flèches, Maj ± | 1 | inchangé | 1 |
| Tout sélectionner | appui long | Ctrl+A | 2 | inchangé | 2 |
| Fiche : état, remplacé par, inverser les côtés | fiche (blocs à la suite) | — | 1 | Fiche → État et remplacement / Caractéristiques | 1 |
| Fiche : armement(s) du support | fiche → un champ « Armement » | — | 1 | Fiche → Caractéristiques → **Armements (plusieurs)** | 1 |
| Fiche : matériel associé, raccourcis, packages | fiche | — | 1 | Fiche → Matériel associé | 1 |
| Fiche : photos | fiche | — | 1 | Fiche → Photos | 1 |
| Fiche : mention, aspect des blocs, cartouche | fiche | — | 1 | Fiche → Étiquette | 1 |
| Fiche : calque, couleur personnalisée | fiche → Avancé | — | 1 | Fiche → Avancé | 1 |
| Centrer sur la page (plan de situation, image, note, dessin) — v1.7.2 | — | — | — | appui long → Centrer sur la page ; fiche de l'image ; proposition après la pose d'un plan de situation | 2 |
| Repères de centrage pendant le déplacement — v1.7.2 | — | Maj pour les ignorer | — | automatiques à proximité des axes ; Réglages → Réglages de la tablette | 0 |

Une section de fiche repliée se déplie en un appui (2 appuis au plus depuis le plan avec la sélection de l'objet).

## 3. Correspondance « ancien emplacement → nouvel emplacement »

| Avant (v1.7.0) | Maintenant (v1.7.1) |
|---|---|
| Outils (barre latérale) → Pages… | Barre du haut → Pages |
| Outils (barre latérale) → Couleurs de texte par défaut | Barre du haut → Réglages → Réglages du plan |
| Calques → Réglages du plan, Échelle du plan, Réglages de la tablette | Barre du haut → Réglages (même panneau, ouvert sur les réglages) |
| Calques → Légende → Afficher la légende | Barre du haut → Légende (un appui) ; réglages toujours dans Calques |
| Outils → Descriptif des travaux ; double appui sur le bloc | Barre du haut → Descr. ; les deux anciens accès restent |
| Fiche : blocs à la suite | Sections repliables : Identité et repère → État et remplacement → Caractéristiques → Matériel associé → Photos → Étiquette → Commentaire → Avancé (état mémorisé par section) |
| Fiche support : un seul « Armement » | Fiche → Caractéristiques → Armements (plusieurs, chacun avec son état) |
| Barre du haut : icônes seules | Icône + libellé court sous chaque bouton |
| — | Barre du haut → Tout (≡) : toutes les fonctions, recherche, raccourcis |

## Limites connues

- Les fiches des annotations, dessins, images et plans de situation (non-ouvrages) gardent leur présentation courte : la
  structure en sections vise les objets de réseau, seuls concernés par l'état, le remplacement, le matériel et les photos.
- Portrait étroit (< 800 px) : la barre du haut tient en réduisant le titre du projet (points de suspension) ; au-delà
  d'un écran plus étroit, elle défile horizontalement (rien n'est retiré). À juger sur la tablette.

## v1.8.0 — reportage photo

| Fonction | Emplacement | Appuis |
|---|---|---|
| Reportage photo : créer, mettre à jour, redisposer, choisir les photos, réglages, alertes, doublons | Latérale → Outils → Reportage photo ; ≡ Tout | 2 |
| Photo retenue au reportage | Fiche de l’objet → Photos → vignette → « Au reportage photo » | 2 (objet sélectionné) |
| Blocs d’une photo du reportage (repère, état, équipement, lignes, + Ouvrage, Aller à l’ouvrage) | Page de reportage → fiche de la photo | 1 (photo sélectionnée) |
