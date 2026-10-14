/* piquetage-calcul.js — v1.7.3 : angle de piquetage des supports aériens (H-349 à H-357).
 *
 * Fonctions PURES : aucun accès au DOM, à `etat`, à la charte ni à la vue. Toutes les valeurs d'entrée sont passées en
 * paramètre (objets du plan, tolérance en unités plan), ce qui les rend testables sous Node (js/v173.test.mjs).
 *
 * Méthode reproduite (rapporteur 0–400 gr sur le plan) : centre du rapporteur sur l'axe du support S, diamètre
 * 200 → 0 gr aligné sur la portée amont (200 vers le support amont A, 0 dans le prolongement au-delà de S), lecture du
 * prolongement jusqu'à la portée aval (S → B). Valeur absolue de 0 à 200 gr ; le sens est un attribut distinct.
 *
 * Repère : celui du plan (unités plan, y vers le bas), c'est-à-dire la page telle qu'affichée et imprimée — la rotation
 * propre d'une page PDF est déjà appliquée aux coordonnées des objets. Un angle θ positif (atan2 en y vers le bas)
 * tourne dans le sens HORAIRE à l'écran, un angle négatif dans le sens ANTIHORAIRE.
 */

/* Grades par radian. */
export const GRADES_PAR_RADIAN = 200 / Math.PI;

/* Bruit de calcul flottant absorbé avant l'arrondi à l'entier supérieur (73,0 + 1e-10 → 73). */
export const EPSILON_ARRONDI = 1e-6;

/* Portées superposées : déviation brute à moins de ce seuil de 200 gr (B dans la direction de A). */
export const SEUIL_SUPERPOSITION_GR = 1e-6;

/* Longueur en dessous de laquelle une portée est de longueur nulle (unités plan). */
export const LONGUEUR_NULLE = 1e-9;

/* Ouvrages ponctuels (même liste que modele.js → TYPES_PONCTUELS, vérifiée par essai) : un sommet de portée qui ne
 * coïncide avec aucun d'eux est un « sommet hors support ». */
export const TYPES_OUVRAGES_PONCTUELS = ['support', 'coffret', 'poste', 'boite_jonction', 'malt', 'eras', 'point_lumineux', 'armoire_ep', 'lanterne_ep', 'boucle_ep'];

/* États de tronçon retenus comme portées : la ligne que portera le support (« à déposer » ignoré). */
export const ETATS_PORTEE = ['existant', 'a_poser', 'a_reprendre'];

export const SENS = { HORAIRE: 'HORAIRE', ANTIHORAIRE: 'ANTIHORAIRE' };
export const SOURCES = { CALCULE: 'CALCULE', MANUEL: 'MANUEL' };

/* Motifs « à compléter » propres à l'angle de piquetage. */
export const MOTIFS_PIQUETAGE = {
  superposees: 'angle de piquetage : portées superposées ou de longueur nulle',
  choix: 'choisir les portées de l’angle',
  hors_support: 'Sommet hors support dans la portée'
};

/* Comparaison « naturelle » des repères (P4 avant P6, S2 avant S10) — même règle que le descriptif. */
export function comparerReperes(a, b) {
  return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
}

const valide = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

/* Arrondi systématique à l'entier supérieur, bruit flottant absorbé ; jamais négatif (−0 → 0). */
export function arrondiPiquetage(brut) {
  if (!Number.isFinite(brut)) return null;
  const r = Math.ceil(brut - EPSILON_ARRONDI);
  return r > 0 ? r : 0;
}

/* Angle de déviation en S entre le prolongement de la portée amont (A → S) et la portée aval (S → B).
 * → { brut, arrondi, sens, theta } ; null si une portée est de longueur nulle ou si les portées sont superposées.
 * `sens` vaut null quand l'arrondi est 0 (portées alignées). `theta` : radians signés (repère du plan). */
export function angleDeviation(A, S, B) {
  if (!valide(A) || !valide(S) || !valide(B)) return null;
  const ux = S.x - A.x, uy = S.y - A.y;
  const vx = B.x - S.x, vy = B.y - S.y;
  if (Math.hypot(ux, uy) <= LONGUEUR_NULLE || Math.hypot(vx, vy) <= LONGUEUR_NULLE) return null;
  const theta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const brut = Math.abs(theta) * GRADES_PAR_RADIAN;
  if (brut >= 200 - SEUIL_SUPERPOSITION_GR) return null;
  const arrondi = arrondiPiquetage(brut);
  const sens = arrondi === 0 ? null : (theta > 0 ? SENS.HORAIRE : SENS.ANTIHORAIRE);
  return { brut, arrondi, sens, theta };
}

/* Ouvrage ponctuel (autre que `exclu`) le plus proche de p dans la tolérance ; les ouvrages « porteurs » (support,
 * coffret, poste…) passent avant une MALT ou une ERAS posée au même point. */
function ouvrageAuPoint(p, objets, tolerance, exclu) {
  let best = null;
  for (const o of objets) {
    if (!o || o === exclu || !TYPES_OUVRAGES_PONCTUELS.includes(o.type) || !valide(o)) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d > tolerance) continue;
    const secondaire = o.type === 'malt' || o.type === 'eras' ? 1 : 0;
    if (!best || secondaire < best.secondaire || (secondaire === best.secondaire && d < best.d)) best = { o, d, secondaire };
  }
  return best ? best.o : null;
}

/* Le tronçon est-il une portée possible pour ce support ? (aérien, même réseau, état existant / à poser / à remplacer) */
export function tronconPortee(t, support) {
  return !!t && t.type === 'troncon' && t.pose === 'aerien' && ETATS_PORTEE.includes(t.etat) && !!support && t.domaine === support.domaine
    && Array.isArray(t.points) && t.points.length >= 2;
}

/* Portées d'un support : tronçons aériens du même réseau dont un sommet coïncide (tolérance, unités plan) avec le point
 * d'ancrage du support (x, y — jamais la position déportée du symbole). Une portée par direction : un tronçon qui traverse
 * le support en donne deux, un tronçon qui s'y arrête une seule. Des sommets consécutifs tous dans la tolérance forment
 * un seul passage ; la direction est donnée par le premier sommet hors tolérance de part et d'autre.
 * → [{ cle, troncon_id, cote: 'precedent'|'suivant', index, point, voisin_id, voisin_repere, hors_support, trace, rang }] */
export function porteesSupport(support, objets, tolerance) {
  if (!support || support.type !== 'support' || !valide(support) || !Array.isArray(objets)) return [];
  const S = { x: support.x, y: support.y };
  const tol = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 0;
  const res = [];
  objets.forEach((t, rang) => {
    if (!tronconPortee(t, support)) return;
    const pts = t.points;
    const dedans = pts.map((p) => valide(p) && Math.hypot(p.x - S.x, p.y - S.y) <= tol);
    for (let i = 0; i < pts.length; i++) {
      if (!dedans[i] || (i > 0 && dedans[i - 1])) continue;   // début d'un passage seulement
      let j = i;
      while (j + 1 < pts.length && dedans[j + 1]) j++;
      if (i > 0) res.push(portee(t, rang, i - 1, 'precedent', i));
      if (j < pts.length - 1) res.push(portee(t, rang, j + 1, 'suivant', i));
    }
  });
  return res;

  function portee(t, rang, index, cote, passage) {
    const point = { x: t.points[index].x, y: t.points[index].y };
    const v = ouvrageAuPoint(point, objets, tol, support);
    return {
      cle: t.id + '|' + cote + '|' + passage,
      troncon_id: t.id, cote, index, point,
      voisin_id: v ? v.id : null,
      voisin_repere: v && v.repere ? String(v.repere).trim() : '',
      hors_support: !v,
      trace: cote === 'precedent' ? -1 : 1,   // le voisin précède le support dans l'ordre des sommets → candidat amont
      rang
    };
  }
}

/* Ordre amont / aval de deux portées : < 0 si p est amont. Repère du voisin le plus petit (P4 avant P6) ; à défaut de
 * repères comparables, sens de tracé (voisin précédant le support dans l'ordre des sommets = amont) ; à défaut encore,
 * ordre de création des tronçons. → { ordre, regle: 'repere'|'trace'|'creation' } */
export function ordrePortees(p, q) {
  if (p.voisin_repere && q.voisin_repere) {
    const c = comparerReperes(p.voisin_repere, q.voisin_repere);
    if (c) return { ordre: c, regle: 'repere' };
  }
  if (p.trace !== q.trace) return { ordre: p.trace - q.trace, regle: 'trace' };
  return { ordre: (p.rang - q.rang) || (p.index - q.index), regle: 'creation' };
}

/* Amont et aval retenus pour un support. `attributs` du support : angle_inverse, angle_portees.
 * → { cas, amont, aval, regle } avec cas : 'AUCUNE' (0 portée), 'FIN' (1 portée), 'DEUX', 'CHOIX' (3 ou plus). */
export function choixAmontAval(support, portees) {
  const a = (support && support.attributs) || {};
  const n = Array.isArray(portees) ? portees.length : 0;
  if (n === 0) return { cas: 'AUCUNE', amont: null, aval: null, regle: null };
  if (n === 1) return { cas: 'FIN', amont: null, aval: null, regle: null };
  if (n >= 3) {
    const c = a.angle_portees;
    const trouver = (id, cote) => {
      if (!id) return null;
      const l = portees.filter((p) => p.troncon_id === id && (!cote || p.cote === cote));
      return l.length === 1 ? l[0] : null;   // tronçon traversant sans côté mémorisé : ambigu
    };
    const amont = c ? trouver(c.amont_id, c.amont_cote) : null;
    const aval = c ? trouver(c.aval_id, c.aval_cote) : null;
    if (!amont || !aval || amont === aval) return { cas: 'CHOIX', amont: null, aval: null, regle: null };
    return { cas: 'CHOIX', amont, aval, regle: 'choix' };
  }
  const [p, q] = portees;
  const { ordre, regle } = ordrePortees(p, q);
  let amont = ordre <= 0 ? p : q, aval = ordre <= 0 ? q : p;
  if (a.angle_inverse) [amont, aval] = [aval, amont];
  return { cas: 'DEUX', amont, aval, regle };
}

/* Analyse complète d'un support : portées, amont / aval, résultat du calcul et motifs « à compléter ».
 * → null si l'objet n'est pas un support ; sinon { portees, cas, amont, aval, regle, resultat, motifs }. */
export function analyserSupport(support, objets, tolerance) {
  if (!support || support.type !== 'support') return null;
  const portees = porteesSupport(support, objets, tolerance);
  const ch = choixAmontAval(support, portees);
  const motifs = [];
  let resultat = null;
  if (ch.amont && ch.aval) {
    resultat = angleDeviation(ch.amont.point, { x: support.x, y: support.y }, ch.aval.point);
    if (!resultat) motifs.push(MOTIFS_PIQUETAGE.superposees);
    if (ch.amont.hors_support || ch.aval.hors_support) motifs.push(MOTIFS_PIQUETAGE.hors_support);
  } else if (ch.cas === 'CHOIX') motifs.push(MOTIFS_PIQUETAGE.choix);
  return { portees, ...ch, resultat, motifs };
}

/* Source effective : un angle saisi sans source connue (projet antérieur) est une saisie manuelle. */
export function sourceAngle(a) {
  if (!a) return null;
  if (a.angle_source === SOURCES.CALCULE || a.angle_source === SOURCES.MANUEL) return a.angle_source;
  return a.angle_gr !== null && a.angle_gr !== undefined && a.angle_gr !== '' ? SOURCES.MANUEL : null;
}

/* Écrit le résultat d'une analyse dans le support. Une valeur MANUELLE n'est jamais écrasée (seuls la valeur brute et
 * le sens calculés sont tenus à jour, pour la fiche), sauf `remplacerManuels` ET une valeur calculable. Sans valeur
 * calculable, un angle CALCULÉ est effacé (il ne correspondrait plus au plan). → true si un champ a changé. */
export function appliquerAnalyse(support, analyse, { remplacerManuels = false } = {}) {
  if (!support || support.type !== 'support') return false;
  const a = support.attributs || (support.attributs = {});
  const avant = JSON.stringify([a.angle_gr ?? null, a.angle_source ?? null, a.angle_brut_gr ?? null, a.angle_sens ?? null]);
  const r = analyse ? analyse.resultat : null;
  let source = sourceAngle(a);
  if (source === SOURCES.MANUEL && remplacerManuels && r) source = null;
  if (source === SOURCES.MANUEL) {
    a.angle_source = SOURCES.MANUEL;
    a.angle_brut_gr = r ? r.brut : null;
    a.angle_sens = r ? r.sens : null;
  } else if (r) {
    a.angle_source = SOURCES.CALCULE;
    a.angle_gr = r.arrondi;
    a.angle_brut_gr = r.brut;
    a.angle_sens = r.sens;
  } else {
    a.angle_source = null;
    a.angle_gr = null;
    a.angle_brut_gr = null;
    a.angle_sens = null;
  }
  return JSON.stringify([a.angle_gr ?? null, a.angle_source ?? null, a.angle_brut_gr ?? null, a.angle_sens ?? null]) !== avant;
}

/* Recalcule les angles de tous les supports d'une liste d'objets (un plan). → nombre de supports modifiés. */
export function recalculerAngles(objets, tolerance, options = {}) {
  if (!Array.isArray(objets)) return 0;
  let n = 0;
  for (const o of objets) {
    if (!o || o.type !== 'support') continue;
    if (appliquerAnalyse(o, analyserSupport(o, objets, tolerance), options)) n++;
  }
  return n;
}

/* Motifs « à compléter » d'un support quand la fonction est active : aucun pour une saisie manuelle. */
export function motifsPiquetage(support, objets, tolerance) {
  if (!support || support.type !== 'support' || !Array.isArray(objets)) return [];
  if (sourceAngle(support.attributs) === SOURCES.MANUEL) return [];
  const an = analyserSupport(support, objets, tolerance);
  return an ? an.motifs : [];
}

/* Texte « 73,5 → 74 gr » (construction à l'écran, fiche). */
export function texteConstruction(r) {
  if (!r) return '';
  return r.brut.toFixed(1).replace('.', ',') + ' \u2192 ' + r.arrondi + '\u00A0gr';
}
