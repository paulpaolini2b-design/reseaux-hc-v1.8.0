/* historique.js — annuler / rétablir illimité.
 *
 * Principe : chaque action validée enregistre une copie complète de la liste
 * des objets du plan courant et de la légende (200 objets ≈ 100 ko : négligeable). C'est plus
 * simple et plus sûr que des commandes inversibles, et tout passe par un seul
 * point : valider(). Chaque validation déclenche l'événement 'objets' qui
 * provoque le re-rendu et la sauvegarde automatique.
 *
 * v1.4.5 : un historique PAR PLAN (clé plan.id), conservé pour la session. Changer de plan (plans.js →
 * basculerHistorique) ne perd pas l'historique de l'autre ; l'ouverture d'un projet repart de zéro (H-179 inchangé).
 *
 * v1.6.0 §6.2 (H-317) : les opérations sur les PAGES (ajout, suppression, ordre, format) touchent la liste des plans,
 * pas les objets d'un plan : elles ont leur propre pile, au niveau du projet. Chaque étape (objets ou pages) reçoit un
 * numéro d'ordre croissant ; Annuler défait la plus récente des deux piles (celle du plan affiché et celle des pages),
 * Rétablir refait la plus récemment annulée. Une opération de page est un couple { faire, defaire } fourni par plans.js
 * (elle peut changer de page affichée avant de retirer celle-ci : promesse).
 *
 * v1.7.3 : quand le réglage « Angle de piquetage calculé » est actif, valider() recalcule les angles des supports avant
 * l'instantané : annuler une mutation rétablit aussi les angles qu'elle avait recalculés, en une seule étape.
 */
import { etat, emettre, peutModifier, signalerLectureSeule } from './etat.js';
import { cloner, mettreAJourComplet, legendeParDefaut } from './modele.js';
import { actualiserDesignation } from './designation.js';
import { mettreAJourDescriptif } from './descriptif.js';   // v1.5.0 §2.7 : le descriptif suit le plan en direct
import { recalculerAnglesPlan } from './piquetage.js';   // v1.7.3 : angle de piquetage recalculé dans l'étape
import { synchroniserPage } from './reportage.js';   // v1.8.0 : objets illustratifs et vignettes d'une page de reportage

let pile = [];      // états passés du plan courant (le dernier = état courant)
let futur = [];     // états annulés du plan courant
let etiquetteCourante = '';
const parPlan = new Map();   // plan.id → { pile, futur, etiquette } : historiques des plans (session)
let planHistorique = null;   // id du plan auquel appartiennent `pile` et `futur`
let sequence = 0;            // v1.6.0 : numéro d'ordre des étapes (objets et pages)
let pilePages = [];          // v1.6.0 : opérations de pages faites { seq, etiquette, faire, defaire }
let futurPages = [];         // v1.6.0 : opérations de pages annulées
let operationPagesEnCours = null;   // promesse d'une opération de page en cours d'annulation / rétablissement

/* Instantané = objets du plan + légende (position, taille, visibilité, aspect : annulables depuis le v13 §5)
 * + descriptif des travaux (v1.5.0 : annuler la suppression d'un objet rétablit son entrée à l'identique). */
function instantane() {
  return { seq: ++sequence, objets: cloner(etat.plan.objets), legende: cloner(etat.plan.legende || legendeParDefaut()), descriptif: cloner(etat.plan.descriptif ?? null) };
}

function restaurer(s) {
  etat.plan.objets = cloner(s.objets);
  etat.plan.legende = cloner(s.legende);
  etat.plan.descriptif = s.descriptif === undefined ? (etat.plan.descriptif ?? null) : cloner(s.descriptif);
}

/* Réinitialise l'historique (ouverture d'un projet) : tous les plans repartent de zéro. */
export function reinitialiserHistorique() {
  parPlan.clear();
  pilePages = []; futurPages = [];
  // v1.5.0 : descriptifs remis à jour à l'ouverture (informations d'affaire modifiées hors du projet, passage par une
  // version antérieure partageant la même base) — mise à jour idempotente, avant le premier instantané.
  if (etat.projet) for (const pl of etat.projet.plans || []) { try { mettreAJourDescriptif(pl, etat.projet); } catch (e) { console.warn('Descriptif non mis à jour', e); } }
  pile = etat.plan ? [instantane()] : [];
  futur = [];
  etiquetteCourante = '';
  planHistorique = etat.plan ? etat.plan.id : null;
  if (planHistorique) parPlan.set(planHistorique, { pile, futur, etiquette: etiquetteCourante });
  emettre('historique', infos());
}

/* Changement de plan (v1.4.5) : range l'historique du plan quitté et reprend celui du plan affiché (etat.plan),
 * ou en crée un à partir de son état actuel. */
export function basculerHistorique() {
  if (planHistorique) parPlan.set(planHistorique, { pile, futur, etiquette: etiquetteCourante });
  const plan = etat.plan;
  planHistorique = plan ? plan.id : null;
  const h = plan ? parPlan.get(plan.id) : null;
  if (h && h.pile.length) { pile = h.pile; futur = h.futur; etiquetteCourante = h.etiquette || ''; }
  else { pile = plan ? [instantane()] : []; futur = []; etiquetteCourante = ''; if (plan) parPlan.set(plan.id, { pile, futur, etiquette: '' }); }
  emettre('historique', infos());
}

/* v1.8.0 (H-380) — Après une commande du reportage photo (opération de pages qui modifie les objets de pages qui ne
 * sont pas forcément affichées) : l'historique des objets de ces pages repart de leur état actuel. Sans cela, annuler
 * une retouche faite avant la commande rétablirait un instantané antérieur à elle, en silence. */
export function rebaserHistorique(ids) {
  const liste = new Set(ids || []);
  for (const id of liste) if (id !== planHistorique) parPlan.delete(id);
  if (etat.plan && liste.has(etat.plan.id)) {
    pile = [instantane()];
    futur = [];
    planHistorique = etat.plan.id;
    parPlan.set(planHistorique, { pile, futur, etiquette: etiquetteCourante });
  }
  emettre('historique', infos());
}

/* Valide l'état courant après une modification des objets. */
export function valider(etiquette = '') {
  if (!etat.plan) return;
  // Garde centrale (lot 1.4) : en consultation d'un archivé, toute modification déjà appliquée en mémoire est
  // annulée en revenant au dernier instantané, et aucune étape n'est créée.
  if (!peutModifier()) {
    if (pile.length) { restaurer(pile[pile.length - 1]); nettoyerSelection(); }
    emettre('objets', { etiquette: 'restauration' });
    signalerLectureSeule();
    return;
  }
  // v1.7.3 (H-353) : angles de piquetage recalculés AVANT l'instantané (même étape que la mutation qui les déclenche ;
  // sans effet si le réglage du projet est désactivé ; une saisie manuelle n'est jamais écrasée).
  try { recalculerAnglesPlan(etat.plan, etat.projet); } catch (e) { console.error('Angles de piquetage non recalculés', e); }
  // v1.8.0 (H-376, H-378) : page de reportage — objets de réseau illustratifs, rattachement à la vignette sous leur premier
  // point, objets rattachés déplacés avec leur vignette (même étape que le geste qui l'a déplacée)
  try { synchroniserPage(etat.plan); } catch (e) { console.error('Page de reportage non synchronisée', e); }
  // Recalculs systématiques : désignation automatique et indicateur « complet ».
  for (const o of etat.plan.objets) { actualiserDesignation(o); mettreAJourComplet(o, etat.plan.objets); }
  try { mettreAJourDescriptif(etat.plan, etat.projet); } catch (e) { console.error('Mise à jour du descriptif impossible', e); }   // v1.5.0
  pile.push(instantane());
  futur = [];
  futurPages = [];   // v1.6.0 : toute nouvelle action efface aussi les opérations de pages annulées
  etiquetteCourante = etiquette;
  emettre('objets', { etiquette });
  emettre('historique', infos());
}

/* Rafraîchit l'affichage sans créer d'étape (pendant un glissement). */
export function apercu() {
  emettre('objets-apercu');
}

/* v1.6.0 §6.2 — Enregistre une opération de pages DÉJÀ FAITE. `faire` / `defaire` : fonctions (éventuellement
 * asynchrones) qui refont / défont l'opération sur le projet courant. */
export function enregistrerOperationPages({ etiquette = 'Pages', faire, defaire }) {
  pilePages.push({ seq: ++sequence, etiquette, faire, defaire });
  futurPages = [];
  futur = [];
  etiquetteCourante = etiquette;
  emettre('historique', infos());
}

function executerPage(op, sens) {
  const fn = sens === 'defaire' ? op.defaire : op.faire;
  operationPagesEnCours = Promise.resolve().then(fn).catch((e) => { console.error('Opération de pages', e); })
    .finally(() => { operationPagesEnCours = null; emettre('historique', infos()); });
  return true;
}

/* Rang de l'étape annulable la plus récente : 'pages', 'objets' ou null. */
function prochaineAnnulation() {
  const sp = pilePages.length ? pilePages[pilePages.length - 1].seq : -1;
  const so = pile.length > 1 ? (pile[pile.length - 1].seq ?? 0) : -1;
  if (sp < 0 && so < 0) return null;
  return sp > so ? 'pages' : 'objets';
}
function prochainRetablissement() {
  const sp = futurPages.length ? futurPages[futurPages.length - 1].seq : Infinity;
  const so = futur.length ? (futur[futur.length - 1].seq ?? 0) : Infinity;
  if (sp === Infinity && so === Infinity) return null;
  return sp < so ? 'pages' : 'objets';
}

export function annuler() {
  if (!peutModifier()) { signalerLectureSeule(); return false; }
  if (operationPagesEnCours) return false;
  const quoi = prochaineAnnulation();
  if (quoi === 'pages') {
    const op = pilePages.pop();
    futurPages.push(op);
    return executerPage(op, 'defaire');
  }
  if (pile.length <= 1) return false;
  futur.push(pile.pop());
  restaurer(pile[pile.length - 1]);
  nettoyerSelection();
  emettre('objets', { etiquette: 'annuler' });
  emettre('historique', infos());
  return true;
}

export function retablir() {
  if (!peutModifier()) { signalerLectureSeule(); return false; }
  if (operationPagesEnCours) return false;
  if (prochainRetablissement() === 'pages') {
    const op = futurPages.pop();
    pilePages.push(op);
    return executerPage(op, 'faire');
  }
  if (futur.length === 0) return false;
  const s = futur.pop();
  pile.push(s);
  restaurer(s);
  nettoyerSelection();
  emettre('objets', { etiquette: 'retablir' });
  emettre('historique', infos());
  return true;
}

function nettoyerSelection() {
  const ids = new Set(etat.plan.objets.map((o) => o.id));
  let change = false;
  for (const id of [...etat.selection]) if (!ids.has(id)) { etat.selection.delete(id); change = true; }
  if (change) emettre('selection', [...etat.selection]);
}

export function infos() {
  return { peutAnnuler: pile.length > 1 || pilePages.length > 0, peutRetablir: futur.length > 0 || futurPages.length > 0, etiquette: etiquetteCourante };
}

/* Restaure le dernier état validé (abandon d'un glissement avec Échap). */
export function restaurerDernier() {
  if (!pile.length) return;
  restaurer(pile[pile.length - 1]);
  emettre('objets', { etiquette: 'restauration' });
}
