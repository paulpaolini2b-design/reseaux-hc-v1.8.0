/* ui/fonctions.js — v1.7.1 §11 (H-342 à H-345) : réorganisation de l'interface.
 *
 * - Nouveaux boutons de la barre du haut : Pages, Légende, Descriptif, Réglages, « ≡ Tout » ;
 * - « ≡ Toutes les fonctions » : liste cherchable de CHAQUE fonction de l'application, avec son emplacement et son
 *   raccourci clavier ; un appui exécute la fonction quand elle ne dépend pas d'un geste sur le plan, sinon la liste dit
 *   où la trouver. Rien n'est masqué : tout se retrouve ici ;
 * - panneau « Nouveautés » affiché une fois au premier lancement de la v1.7.1 (table ancien → nouvel emplacement).
 * Les raccourcis clavier existants ne changent pas (clavier.js, mesure.js) : ce module ne fait que les afficher.
 */
import { etat, emettre, sur, notifier, peutModifier, signalerLectureSeule, objets, objetParId } from '../etat.js';
import { bd } from '../bd.js';
import * as outils from '../outils.js';
import { annuler, retablir } from '../historique.js';
import { ajuster } from '../vue.js';
import { ouvrirPages } from './plans.js';
import { ouvrirCalques } from './calques.js';
import { basculerOutils, lancerCouleursTexte } from './outils-annotation.js';
import { basculerPalette } from './palette.js';
import { echapper, ouvrirDialogue } from './dialogues.js';
import { ouvrirReportage } from './reportage.js';   // v1.8.0

const VERSION_NOUVEAUTES = '1.7.2';
let panneau = null;
let recherche = '';

/* ---------- Actions ---------- */
const clic = (id) => () => { const b = document.getElementById(id); if (b) b.click(); };
const avecProjet = (fn) => () => { if (!etat.projet) { notifier('Ouvrez d’abord un projet'); return; } fn(); };
const modifiable = (fn) => avecProjet(() => { if (!peutModifier()) { signalerLectureSeule(); return; } fn(); });
const avecSelection = (fn, n = 1) => modifiable(() => { if (etat.selection.size < n) { notifier('Sélectionnez d’abord un objet sur le plan'); return; } fn(); });
const outil = (id) => modifiable(() => outils.definirOutil(id));
const ficheSelection = avecProjet(() => { if (etat.selection.size !== 1) { notifier('Sélectionnez un seul objet'); return; } emettre('ouvrir-fiche', [...etat.selection][0]); });

export function ouvrirDescriptifHaut() {
  if (!etat.projet || !etat.plan) { notifier('Ouvrez d’abord un projet'); return; }
  if (etat.plan.descriptif) { emettre('ouvrir-descriptif', null); return; }
  if (!peutModifier()) { notifier('Aucun descriptif sur cette page (projet en consultation)'); return; }
  const r = outils.poserDescriptif();
  if (r && r.cree) notifier('Descriptif créé : double appui sur le bloc, ou bouton « Descriptif », pour l’éditer', 3200);
}

/* ---------- Registre : g = groupe, l = libellé, ou = emplacement (≤ 2 appuis depuis le plan), k = raccourci, a = action ---------- */
const H = 'Barre du haut', L = 'Barre latérale', F = 'Fiche de l’objet', P = 'Plan', C = 'Calques / Réglages';
function registre() {
  return [
    // Projet
    { g: 'Projet', l: 'Gestionnaire de projets (ouvrir, nouveau, dupliquer, archiver, corbeille, importer .json)', ou: H + ' → Projets', a: clic('btn-projets') },
    { g: 'Projet', l: 'Informations de l’affaire (nom, commune, N° SIEEP, N° EDF, type, point GPS)', ou: H + ' → nom du projet', a: clic('nom-projet') },
    { g: 'Projet', l: 'Sauvegarder maintenant', ou: 'Automatique', k: 'Ctrl+S', a: avecProjet(() => import('../projet.js').then((m) => m.sauverMaintenant()).then(() => notifier('Projet sauvegardé'))) },
    { g: 'Projet', l: 'Pages : liste, ajout (vierge ou depuis un fond), ordre, format, renommer, supprimer', ou: H + ' → Pages', a: avecProjet(() => ouvrirPages()) },
    { g: 'Projet', l: 'Page précédente', ou: P + ' → ‹ en bas à droite', k: 'Page préc.', a: avecProjet(() => import('../plans.js').then((m) => m.changerPlanRelatif(-1))) },
    { g: 'Projet', l: 'Page suivante', ou: P + ' → › en bas à droite', k: 'Page suiv.', a: avecProjet(() => import('../plans.js').then((m) => m.changerPlanRelatif(1))) },
    { g: 'Projet', l: 'Fond de plan : importer un PDF, une image, une photo', ou: H + ' → Fond', a: clic('btn-fond') },
    { g: 'Projet', l: 'Répartir les pages d’un PDF en plans', ou: H + ' → Calques → Fond de plan', a: avecProjet(() => ouvrirCalques({ section: null })) },
    { g: 'Projet', l: 'Exporter : PDF, PNG, .json', ou: H + ' → Exporter', a: clic('btn-export') },
    // Affichage
    { g: 'Affichage', l: 'Calques : visibilité, verrou, opacité ; réseaux affichés ; opacité du fond', ou: H + ' → Calques', a: avecProjet(() => ouvrirCalques()) },
    { g: 'Affichage', l: 'Afficher / masquer les étiquettes', ou: H + ' → Étiq.', k: 'E', a: avecProjet(() => emettre('basculer-etiquettes')) },
    { g: 'Affichage', l: 'Aperçu rendu papier (garde-fou de lisibilité)', ou: H + ' → Papier', a: clic('btn-papier') },
    { g: 'Affichage', l: 'Afficher / masquer la légende', ou: H + ' → Légende', a: modifiable(() => outils.basculerLegende()) },
    { g: 'Affichage', l: 'Légende : cadre, fond, couleur, replacer et réinitialiser', ou: C + ' → Légende', a: avecProjet(() => ouvrirCalques({ section: 'section-legende' })) },
    { g: 'Affichage', l: 'Ajuster le plan à l’écran', ou: P + ' → double appui au doigt', k: 'Ctrl+0', a: avecProjet(() => ajuster()) },
    { g: 'Affichage', l: 'Zoom avant / arrière', ou: P + ' → pincer', k: '+ / −', a: null },
    { g: 'Affichage', l: 'Objets à compléter (liste, accès à la fiche)', ou: H + ' → À compl.', a: clic('btn-a-completer') },
    // Descriptif
    { g: 'Descriptif', l: 'Descriptif des travaux : créer ou ouvrir l’éditeur', ou: H + ' → Descriptif', a: ouvrirDescriptifHaut },
    { g: 'Descriptif', l: 'Descriptif : colonnes, sortie PDF (plan ou page annexe), cadre, fond, échelle, replacer, supprimer', ou: C + ' → Descriptif des travaux', a: avecProjet(() => ouvrirCalques({ section: 'section-descriptif' })) },
    { g: 'Descriptif', l: 'Descriptif : masquer, replacer, supprimer (menu du bloc)', ou: P + ' → appui long sur le bloc', a: null },
    // v1.8.0 : reportage photo
    { g: 'Reportage photo', l: 'Reportage photo : créer, mettre à jour, redisposer, choisir les photos, réglages', ou: L + ' → Outils → Reportage photo', a: avecProjet(() => ouvrirReportage()) },
    { g: 'Reportage photo', l: 'Photo retenue au reportage (case « Au reportage photo »)', ou: F + ' → Photos → appui sur la vignette', a: null },
    { g: 'Reportage photo', l: 'Blocs d’une photo du reportage : repère, état, équipement, lignes, + Ouvrage, Aller à l’ouvrage', ou: P + ' → page de reportage → fiche de la photo', a: null },
    // Mesure
    { g: 'Mesure', l: 'Mesure indicative : distance sur plan, calibration, contrôle', ou: H + ' → Mesure', k: 'M', a: clic('btn-mesure') },
    { g: 'Mesure', l: 'Indicateur de longueur pendant le tracé (aérien / souterrain)', ou: H + ' → Réglages → Réglages de la tablette', a: avecProjet(() => ouvrirCalques({ section: 'section-tablette' })) },
    // Réglages
    { g: 'Réglages', l: 'Échelle du plan ; aligner tous les objets sur l’échelle courante', ou: H + ' → Réglages', a: avecProjet(() => ouvrirCalques({ section: 'section-echelle' })) },
    { g: 'Réglages', l: 'Taille des textes, des symboles ; longueurs sur les étiquettes', ou: H + ' → Réglages', a: avecProjet(() => ouvrirCalques({ section: 'section-reglages-plan' })) },
    { g: 'Réglages', l: 'Accrochage angulaire 0° / 45° / 90°', ou: H + ' → Réglages', k: 'A', a: avecProjet(() => { etat.accrochageAngulaire = !etat.accrochageAngulaire; emettre('reglage-accrochage'); notifier('Accrochage angulaire ' + (etat.accrochageAngulaire ? 'activé' : 'désactivé')); }) },
    { g: 'Réglages', l: 'Couleurs de texte par défaut (page courante)', ou: H + ' → Réglages', a: modifiable(() => lancerCouleursTexte()) },
    { g: 'Réglages', l: 'Angle de piquetage calculé (activer / désactiver, recalculer tous les angles)', ou: H + ' → Réglages → Réglages du plan', a: avecProjet(() => ouvrirCalques({ section: 'section-reglages-plan' })) },   // v1.7.3
    { g: 'Réglages', l: 'Pictogramme 📷 des objets photographiés', ou: H + ' → Réglages → Réglages de la tablette', a: avecProjet(() => ouvrirCalques({ section: 'section-tablette' })) },
    { g: 'Réglages', l: 'Pose continue / pose unique', ou: L + ' → Pose ∞ / Pose 1', k: 'P', a: () => outils.basculerModePose() },
    // Tracer et poser
    ...outils.OUTILS.map((o) => ({ g: 'Tracer et poser', l: o.libelle, ou: L, k: o.id === 'gomme' ? 'X' : (o.touche || ''), a: outil(o.id) })),
    { g: 'Tracer et poser', l: 'Bibliothèque de symboles (nomenclature)', ou: L + ' → Biblio', a: avecProjet(() => basculerPalette()) },
    { g: 'Tracer et poser', l: 'Outils de dessin : flèches, nord, cotation, zones, trait, stylo, croix, rond avec texte, MALT libre, étiquette fléchée', ou: L + ' → Outils', a: avecProjet(() => basculerOutils()) },
    { g: 'Tracer et poser', l: 'Lanterne EP, boucle EP', ou: L + ' → Outils → Éclairage public', a: avecProjet(() => basculerOutils()) },
    { g: 'Tracer et poser', l: 'Image / photo posée sur le plan ; rognage', ou: L + ' → Outils → Plan', k: 'C (rogner)', a: avecProjet(() => basculerOutils()) },
    { g: 'Tracer et poser', l: 'Plan de situation (carte IGN, 1/2 500 à 1/100 000)', ou: L + ' → Outils → Plan', a: avecProjet(() => basculerOutils()) },
    { g: 'Tracer et poser', l: 'QR code du point GPS sur le plan de situation (afficher, coin, côté)', ou: P + ' → fiche du plan de situation → QR code', a: null },   // v1.7.7
    { g: 'Tracer et poser', l: 'Centrer sur la page (plan de situation, image, note, dessin) : horizontalement, verticalement, les deux', ou: P + ' → appui long sur l’objet → Centrer sur la page ; fiche de l’image', a: avecSelection(() => outils.centrerSelectionSurPage('les_deux')) },
    { g: 'Réglages', l: 'Repères de centrage pendant le déplacement', ou: H + ' → Réglages → Réglages de la tablette', a: avecProjet(() => ouvrirCalques({ section: 'section-tablette' })) },
    { g: 'Tracer et poser', l: 'Terminer le tracé en cours', ou: P + ' → appui sur le dernier point', k: 'Entrée', a: () => outils.terminerPolyligne() },
    { g: 'Tracer et poser', l: 'Abandonner l’action en cours / désélectionner', ou: P, k: 'Échap', a: () => outils.annulerAction() },
    // Sélection et édition
    { g: 'Édition', l: 'Annuler', ou: L + ' → Annuler (toujours visible)', k: 'Ctrl+Z', a: avecProjet(() => annuler()) },
    { g: 'Édition', l: 'Rétablir', ou: L + ' → Rétablir (toujours visible)', k: 'Ctrl+Y', a: avecProjet(() => retablir()) },
    { g: 'Édition', l: 'Fiche de l’objet sélectionné', ou: P + ' → appui sur l’objet', k: 'F', a: ficheSelection },
    { g: 'Édition', l: 'Dupliquer la sélection', ou: F + ' → Dupliquer', k: 'Ctrl+D', a: avecSelection(() => outils.dupliquerSelection()) },
    { g: 'Édition', l: 'Supprimer la sélection', ou: F + ' → Supprimer', k: 'Suppr', a: avecSelection(() => outils.supprimerSelection()) },
    { g: 'Édition', l: 'Tourner de +90° / −90°', ou: P + ' → appui long', k: 'R / Maj+R', a: avecSelection(() => outils.tournerSelection(90)) },
    { g: 'Édition', l: 'Déplacer la sélection', ou: P + ' → glisser', k: 'Flèches (Maj = ×10)', a: null },
    { g: 'Édition', l: 'Agrandir / réduire le bloc d’étiquette', ou: P + ' → poignée carrée', k: 'Maj + / Maj −', a: null },
    { g: 'Édition', l: 'Tout sélectionner', ou: P + ' → appui long', k: 'Ctrl+A', a: avecProjet(() => emettre('tout-selectionner')) },
    { g: 'Édition', l: 'Menu de l’objet (déport, inverser le sens, réinitialiser, rogner…)', ou: P + ' → appui long', a: null },
    // Fiche
    { g: 'Fiche', l: 'État, remplacé par, inverser les côtés d’un tronçon aérien à remplacer', ou: F + ' → État et remplacement / Caractéristiques', a: ficheSelection },
    { g: 'Fiche', l: 'Armements d’un support (plusieurs, chacun avec son état)', ou: F + ' → Caractéristiques', a: ficheSelection },
    { g: 'Fiche', l: 'Angle de piquetage d’un support : source, sens, amont / aval, inverser, revenir au calcul, choix des portées', ou: F + ' → Caractéristiques', a: ficheSelection },   // v1.7.3
    { g: 'Fiche', l: 'Matériel associé : raccourcis, packages, recherche, matériel libre, MALT', ou: F + ' → Matériel associé', a: ficheSelection },
    { g: 'Fiche', l: 'Photos : prendre, importer, consulter, légender, supprimer', ou: F + ' → Photos', a: ficheSelection },
    { g: 'Fiche', l: 'Étiquette : mention, aspect des blocs, cartouche de repère', ou: F + ' → Étiquette', a: ficheSelection },
    { g: 'Fiche', l: 'Calque de l’objet, couleur personnalisée du tracé', ou: F + ' → Avancé', a: ficheSelection },
    // Aide
    { g: 'Aide', l: 'Aide et raccourcis', ou: H + ' → Aide', k: '?', a: () => emettre('ouvrir-aide') },
    { g: 'Aide', l: 'Nouveautés des versions 1.7.1 et 1.7.2 (ancien → nouvel emplacement)', ou: H + ' → Tout', a: () => ouvrirNouveautes() }
  ];
}

/* ---------- Panneau « Toutes les fonctions » ---------- */
function normaliser(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

export function ouvrirToutesFonctions() {
  panneau = document.getElementById('toutes-fonctions');
  emettre('fermer-panneaux');
  panneau.hidden = false;
  document.getElementById('btn-toutes-fonctions').classList.add('actif');
  panneau.innerHTML = `<div class="cadre-fonctions" role="dialog" aria-label="Toutes les fonctions">
      <header class="entete-panneau"><h2>Toutes les fonctions</h2><button class="btn-icone fermer" title="Fermer (Échap)" aria-label="Fermer">✕</button></header>
      <div class="recherche-fonctions"><input type="search" placeholder="Rechercher une fonction, un raccourci…" value="${echapper(recherche)}" autocomplete="off" aria-label="Rechercher une fonction"></div>
      <div class="liste-fonctions"></div>
    </div>`;
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'contextmenu']) panneau.addEventListener(t, (e) => e.stopPropagation());
  panneau.addEventListener('click', (e) => { if (e.target === panneau) fermerToutesFonctions(); });
  panneau.querySelector('.fermer').addEventListener('click', fermerToutesFonctions);
  const champ = panneau.querySelector('input');
  champ.addEventListener('input', () => { recherche = champ.value; rendreListe(); });
  champ.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermerToutesFonctions(); } });
  rendreListe();
  setTimeout(() => champ.focus(), 50);
}

export function fermerToutesFonctions() {
  if (!panneau) return;
  panneau.hidden = true;
  panneau.innerHTML = '';
  const b = document.getElementById('btn-toutes-fonctions');
  if (b) b.classList.remove('actif');
}

function rendreListe() {
  const z = panneau.querySelector('.liste-fonctions');
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  const liste = registre().filter((f) => { const t = normaliser(f.g + ' ' + f.l + ' ' + f.ou + ' ' + (f.k || '')); return mots.every((m) => t.includes(m)); });
  if (!liste.length) { z.innerHTML = `<p class="vide">Aucune fonction ne correspond à « ${echapper(recherche)} ».</p>`; return; }
  const groupes = [...new Set(liste.map((f) => f.g))];
  const tous = registre();
  z.innerHTML = groupes.map((g) => `<h3>${echapper(g)}</h3>${liste.filter((f) => f.g === g).map((f) => `
      <button type="button" class="fonction ${f.a ? '' : 'sans-action'}" data-i="${tous.indexOf(tous.find((x) => x.l === f.l && x.g === f.g))}">
        <span class="nom">${echapper(f.l)}</span>${f.k ? `<kbd>${echapper(f.k)}</kbd>` : ''}
        <span class="ou">${echapper(f.ou)}${f.a ? '' : ' — geste sur le plan'}</span>
      </button>`).join('')}`).join('');
  z.querySelectorAll('.fonction').forEach((b) => b.addEventListener('click', () => {
    const f = registre()[Number(b.dataset.i)];
    if (!f) return;
    if (!f.a) { notifier(f.l + ' : ' + f.ou + (f.k ? ' (' + f.k + ')' : ''), 3200); return; }
    fermerToutesFonctions();
    try { f.a(); } catch (e) { console.error(e); notifier('Fonction indisponible : ' + (e.message || e), 3000); }
  }));
}

/* ---------- Panneau « Nouveautés » (une fois au premier lancement) ---------- */
export const CORRESPONDANCE = [
  ['Outils (barre latérale) → Pages…', 'Barre du haut → Pages'],
  ['Outils (barre latérale) → Couleurs de texte par défaut', 'Barre du haut → Réglages → Réglages du plan'],
  ['Calques → Réglages du plan, Échelle du plan, Réglages de la tablette', 'Barre du haut → Réglages (même panneau que Calques, ouvert sur les réglages)'],
  ['Calques → Légende → Afficher la légende', 'Barre du haut → Légende (un appui) ; réglages toujours dans Calques'],
  ['Outils → Descriptif des travaux ; double appui sur le bloc', 'Barre du haut → Descriptif (créer ou ouvrir l’éditeur) ; les deux anciens accès restent'],
  ['Fiche : blocs à la suite', 'Fiche en sections repliables : Identité et repère → État et remplacement → Caractéristiques → Matériel associé → Photos → Étiquette → Commentaire → Avancé'],
  ['Fiche support : un seul « Armement »', 'Fiche → Caractéristiques → Armements (plusieurs, chacun avec son état)'],
  ['Barre du haut : icônes seules', 'Icône + libellé court sous chaque bouton'],
  ['—', 'Barre du haut → Tout (≡) : toutes les fonctions, avec recherche et raccourcis'],
  ['—', 'Plan de situation, image, note, dessin : appui long → Centrer sur la page (ou fiche de l’image) ; repères de centrage en le déplaçant']
];

export function ouvrirNouveautes() {
  ouvrirDialogue('dlg-generique', `
    <form method="dialog" class="dialogue nouveautes">
      <h2>Nouveautés des versions 1.7.1 et 1.7.2</h2>
      <p>L’interface a été réorganisée : aucune fonction n’a été retirée ni cachée, les raccourcis clavier sont inchangés. Barre latérale = poser et tracer ; barre du haut = projet, pages, calques, légende, descriptif, mesure, export, réglages. Annuler / Rétablir restent toujours visibles.</p>
      <div class="defilant"><table>
        <thead><tr><th>Avant</th><th>Maintenant</th></tr></thead>
        <tbody>${CORRESPONDANCE.map(([a, b]) => `<tr><td>${echapper(a)}</td><td>${echapper(b)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="aide">Aussi : plusieurs armements par support, aspect du cartouche du plan repris au descriptif, MALT existantes au descriptif, indicateur de longueur en souterrain, plan de situation au 1/100 000. Ce panneau reste accessible par Tout (≡) → Nouveautés.</p>
      <div class="boutons"><button class="btn btn-primaire" value="ok">Compris</button></div>
    </form>`);
}

async function nouveautesUneFois() {
  try {
    const r = await bd.get('prefs', 'nouveautes_vues');
    if (r && r.valeur === VERSION_NOUVEAUTES) return;
    await bd.put('prefs', { cle: 'nouveautes_vues', valeur: VERSION_NOUVEAUTES });
  } catch (e) { return; }
  setTimeout(ouvrirNouveautes, 600);
}

/* ---------- Initialisation : boutons de la barre du haut ---------- */
function majLegende() {
  const b = document.getElementById('btn-legende');
  if (b) b.setAttribute('aria-pressed', String(!!(etat.plan && outils.legendeAffichee())));
}

export function initialiserFonctions() {
  document.getElementById('btn-pages').addEventListener('click', avecProjet(() => ouvrirPages()));
  document.getElementById('btn-legende').addEventListener('click', modifiable(() => outils.basculerLegende()));
  document.getElementById('btn-descriptif').addEventListener('click', ouvrirDescriptifHaut);
  document.getElementById('btn-reglages').addEventListener('click', avecProjet(() => ouvrirCalques({ section: 'section-reglages-plan' })));
  document.getElementById('btn-toutes-fonctions').addEventListener('click', () => { const z = document.getElementById('toutes-fonctions'); if (!z.hidden) fermerToutesFonctions(); else ouvrirToutesFonctions(); });
  for (const ev of ['objets', 'plan-change', 'projet-ouvert', 'projet-ferme']) sur(ev, majLegende);
  sur('fermer-panneaux', () => { const z = document.getElementById('toutes-fonctions'); if (z && !z.hidden) fermerToutesFonctions(); });
  document.addEventListener('keydown', (e) => { const z = document.getElementById('toutes-fonctions'); if (e.key === 'Escape' && z && !z.hidden) { e.preventDefault(); e.stopPropagation(); fermerToutesFonctions(); } }, true);
  majLegende();
  nouveautesUneFois();
  void objets; void objetParId;
}
