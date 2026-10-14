/* piquetage.js — v1.7.3 : angle de piquetage, couche application (réglage du projet, tolérance, recalcul par plan).
 *
 * Les calculs sont dans piquetage-calcul.js (pur). Ce module lit le réglage du projet et la charte ; il n'importe ni
 * modele.js ni descriptif.js (modele.js l'importe pour la complétude : pas de dépendance circulaire).
 *
 * Recalcul : historique.js → valider() appelle recalculerAnglesPlan() AVANT l'instantané, quand le réglage est actif :
 * le recalcul fait partie de l'étape d'historique de la mutation qui l'a déclenché (une seule annulation).
 */
import { etat } from './etat.js';
import { CHARTE, MM } from './charte.js';
import * as PC from './piquetage-calcul.js';

/* Réglage du projet « Angle de piquetage calculé » (désactivé par défaut). */
export function piquetageActif(projet = etat.projet) {
  return !!(projet && projet.reglages && projet.reglages.angle_piquetage_auto === true);
}

/* Tolérance de coïncidence sommet / ancrage, en unités plan (indépendante du zoom) : celle du rattachement des ouvrages
 * et des extrémités du descriptif (H-276), seule tolérance d'accrochage exprimée en unités plan (H-350). */
export function tolerancePiquetage() {
  return CHARTE.descriptif.tolerance_accrochage_mm * MM;
}

/* Analyse d'un support sur une liste d'objets (plan courant par défaut). */
export function analyseSupport(o, objets = etat.plan ? etat.plan.objets : []) {
  return PC.analyserSupport(o, objets, tolerancePiquetage());
}

/* Motifs « à compléter » liés à l'angle (vides si la fonction est inactive ou l'angle saisi à la main). */
export function motifsAngle(o, tous, actif = piquetageActif()) {
  if (!actif || !o || o.type !== 'support' || !Array.isArray(tous)) return [];
  return PC.motifsPiquetage(o, tous, tolerancePiquetage());
}

/* Recalcule les angles d'un plan si la fonction est active (ou si `forcer`). → nombre de supports modifiés. */
export function recalculerAnglesPlan(plan, projet = etat.projet, { forcer = false, remplacerManuels = false } = {}) {
  if (!plan || !Array.isArray(plan.objets)) return 0;
  if (!forcer && !piquetageActif(projet)) return 0;
  return PC.recalculerAngles(plan.objets, tolerancePiquetage(), { remplacerManuels });
}

/* Nombre de supports portant une saisie manuelle qu'un « Recalculer tous les angles » remplacerait (tous les plans). */
export function manuelsRemplacables(projet = etat.projet) {
  let n = 0;
  for (const plan of (projet && projet.plans) || []) {
    for (const o of plan.objets || []) {
      if (!o || o.type !== 'support' || PC.sourceAngle(o.attributs) !== PC.SOURCES.MANUEL) continue;
      const an = PC.analyserSupport(o, plan.objets, tolerancePiquetage());
      if (an && an.resultat && an.resultat.arrondi !== Number(o.attributs.angle_gr)) n++;
    }
  }
  return n;
}

export const LIBELLES_SENS = { HORAIRE: 'horaire \u21BB', ANTIHORAIRE: 'anti-horaire \u21BA' };
export const LIBELLES_SOURCE = { CALCULE: 'Calculé', MANUEL: 'Manuel' };
export { PC };
