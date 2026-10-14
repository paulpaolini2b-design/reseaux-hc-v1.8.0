/* indicateur-longueur.js — v1.7.0 §5 (H-329) : longueur indicative pendant le tracé d'un tronçon (ou d'un fourreau seul)
 * et pendant le déplacement d'un de ses sommets.
 *
 * Intangibles :
 * - n'écrit JAMAIS dans un objet (ni longueur_m, ni aucun attribut) : la longueur des tronçons reste saisie à la main ;
 * - bulle HTML posée sur la zone de plan, hors du SVG : ni enregistrée, ni annulable, ni exportée ;
 * - calcul par mesure-calcul.js (calibration du fond, sinon échelle déclarée d'un PDF « non vérifié », sinon rien).
 *
 * Réglage de la tablette (prefs `indicateur_longueur` { aerien, souterrain }) : activé par défaut pour l'aérien et la
 * façade, désactivé pour le souterrain et les fourreaux jusqu'à validation sur la tablette (Calques → Réglages de la
 * tablette). Le même réglage pilote la mention « Mesure indicative sur plan » de la fiche du tronçon.
 */
import { etat, sur } from './etat.js';
import { CHARTE } from './charte.js';
import { bd } from './bd.js';
import { versEcran, vue } from './vue.js';
import * as C from './mesure-calcul.js';

let bulle = null;
let derniere = null;   // { points, position, texte } : repositionnement si la vue bouge pendant le tracé

const K = () => CHARTE.indicateur_longueur;

export function initialiserIndicateurLongueur() {
  const zone = document.getElementById('zone-plan');
  bulle = document.createElement('div');
  bulle.id = 'bulle-longueur';
  bulle.setAttribute('aria-live', 'off');
  bulle.hidden = true;
  const I = K();
  Object.assign(bulle.style, {
    position: 'absolute', left: '0px', top: '0px', zIndex: 30, pointerEvents: 'none',
    fontSize: I.taille_px + 'px', fontWeight: '600', lineHeight: '1.25', whiteSpace: 'nowrap',
    padding: '3px 9px', borderRadius: '8px', background: I.fond, color: I.couleur,
    border: '1.5px solid ' + I.bord, boxShadow: '0 1px 4px rgba(0,0,0,0.25)'
  });
  zone.appendChild(bulle);
  for (const ev of ['outil', 'plan-change', 'projet-ouvert', 'projet-ferme']) sur(ev, masquerIndicateur);
  sur('vue', () => { if (derniere && !bulle.hidden) placer(derniere.position); });
}

/* Préférences de la tablette (chargées au démarrage par main.js). */
export function prefsIndicateur() {
  const d = K().defaut;
  const p = etat.prefs.indicateur_longueur;
  return { aerien: p && typeof p.aerien === 'boolean' ? p.aerien : d.aerien, souterrain: p && typeof p.souterrain === 'boolean' ? p.souterrain : d.souterrain };
}
export async function definirPrefsIndicateur(valeurs) {
  etat.prefs.indicateur_longueur = { ...prefsIndicateur(), ...valeurs };
  try { await bd.put('prefs', { cle: 'indicateur_longueur', valeur: etat.prefs.indicateur_longueur }); } catch (e) { /* mémoire seule */ }
}

/* Indicateur actif pour ce tracé ? Fourreau ou pose souterraine → réglage « souterrain » ; aérien, façade → « aérien ». */
export function indicateurActif(pose, type = 'troncon') {
  if (etat.plan && etat.plan.type === 'reportage') return false;   // v1.8.0 (H-377) : une photo n'a pas d'échelle
  const p = prefsIndicateur();
  return type === 'fourreau' || pose === 'souterrain' ? !!p.souterrain : !!p.aerien;
}

export function fiabiliteCourante() {
  return C.evaluerFiabilite({
    fond: (etat.plan && etat.plan.fond) || null,
    echelle_plan: etat.projet ? etat.projet.echelle_plan : null,
    seuil_controle_pct: CHARTE.mesure.seuil_ecart_controle_pct
  });
}

/* Texte « ≈ 123 m » / « ≈ 123 m (non vérifié) » / « — m (plan non calibré) » d'une polyligne (unités plan). */
export function texteLongueur(points) {
  return C.longueurIndicative(points, fiabiliteCourante(), K().textes).texte;
}

/* Mention de la fiche d'un tronçon (lecture seule), ou '' si l'indicateur est désactivé pour ce tronçon. */
export function mentionFiche(o) {
  if (!o || !Array.isArray(o.points) || o.points.length < 2) return '';
  if (!indicateurActif(o.pose, o.type)) return '';
  return K().textes.fiche.replace('{t}', texteLongueur(o.points));
}

/* Affiche la bulle au-dessus de `position` (unités plan) pour la polyligne `points`. */
export function afficherIndicateur(points, position, pose, type = 'troncon') {
  if (!bulle) return;
  if (!points || points.length < 2 || !position || !indicateurActif(pose, type)) { masquerIndicateur(); return; }
  const texte = texteLongueur(points);
  if (bulle.textContent !== texte) bulle.textContent = texte;
  derniere = { position, texte };
  bulle.hidden = false;
  placer(position);
}

export function masquerIndicateur() {
  derniere = null;
  if (bulle) bulle.hidden = true;
}

/* Au-dessus du point (jamais sous la main), centrée, maintenue dans la zone de plan. */
function placer(position) {
  const I = K();
  const s = versEcran(position);
  const l = bulle.offsetWidth || 120, h = bulle.offsetHeight || 26;
  const W = vue.largeurEcran || 1000;
  const x = Math.min(W - l - I.marge_px, Math.max(I.marge_px, s.x - l / 2));
  const y = Math.max(I.marge_px, s.y - I.decalage_px - h);
  bulle.style.left = Math.round(x) + 'px';
  bulle.style.top = Math.round(y) + 'px';
}
