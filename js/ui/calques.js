/* ui/calques.js — visibilité, verrouillage et opacité des calques, filtre par
 * réseau (HTA / BTS / BRT / EP), réglages globaux (taille des textes, des symboles),
 * légende (visibilité, cadre, fond — v13 §5), accrochage angulaire, opacité du fond.
 *
 * v1.4.5 : la liste déroulante « Page » est supprimée — changer la page d'un plan sans déplacer ses objets affichait
 * les objets de la page 1 sur la page 2. Un plan = une page ; la page du PDF est rappelée en information et, pour un
 * projet antérieur, « Répartir les pages en plans » crée les plans manquants. Calques, filtres, réglages et échelle
 * restent communs à tous les plans ; opacité du fond et légende sont propres au plan affiché.
 *
 * v1.7.3 : réglage du projet « Angle de piquetage calculé » (désactivé par défaut) et commande « Recalculer tous les
 * angles (remplace les saisies manuelles) », dans Réglages du plan (H-352).
 */
import { etat, emettre, sur, notifier, peutModifier, signalerLectureSeule } from '../etat.js';
import { LIBELLES } from '../charte.js';
import { reglerOpacite } from '../fond.js';
import { repartitionPossible } from '../plans.js';
import { lancerRepartition } from './plans.js';
import { echapper, confirmer } from './dialogues.js';
import { CHARTE, defautsEchellePlan } from '../charte.js';
import { alignerSurEchelleCourante, definirLegendeVisible, legendeAffichee } from '../outils.js';
import { valider } from '../historique.js';
import { legendeParDefaut } from '../modele.js';
import { echelleDescriptif, depassePage, echelleAnnexe, modeEchelleAnnexe } from '../descriptif-rendu.js';   // v1.5.0 : descriptif des travaux ; v1.7.5 : échelle de l'annexe
import { prefsIndicateur, definirPrefsIndicateur } from '../indicateur-longueur.js';   // v1.7.0 §5
import { bd } from '../bd.js';
import { piquetageActif, recalculerAnglesPlan, manuelsRemplacables } from '../piquetage.js';   // v1.7.3
import { mettreAJourComplet } from '../modele.js';
import { mettreAJourDescriptif } from '../descriptif.js';

/* v1.7.0 §5, §10 — Réglages de la TABLETTE (préférences locales, jamais dans le projet, jamais exportés) : actifs aussi
 * en consultation, car ils ne modifient pas le projet. */
export function pictoPhotosVisible() {
  return etat.prefs.picto_photos !== false && (etat.prefs.picto_photos !== undefined || CHARTE.photos.picto.defaut_visible);
}
function blocTablette() {
  const ind = prefsIndicateur();
  return `
      <section class="bloc" id="section-tablette">
        <h3>Réglages de la tablette</h3>
        <label class="case"><input type="checkbox" id="tab-ind-aerien" ${ind.aerien ? 'checked' : ''}> Indicateur de longueur pendant le tracé — aérien et façade</label>
        <label class="case"><input type="checkbox" id="tab-ind-souterrain" ${ind.souterrain ? 'checked' : ''}> Indicateur de longueur pendant le tracé — souterrain et fourreaux</label>
        <div class="aide">Bulle « ≈ 123 m » près du stylet (calibration du fond, sinon échelle déclarée du PDF « non vérifié ») et mention dans la fiche du tronçon. Indicatif : jamais recopié dans la longueur, toujours saisie à la main. Activé par défaut pour toutes les poses ; décocher pour le désactiver.</div>
        <label class="case"><input type="checkbox" id="tab-picto-photos" ${pictoPhotosVisible() ? 'checked' : ''}> Pictogramme 📷 sur les objets qui portent une photo (écran seulement, jamais exporté)</label>
        <label class="case"><input type="checkbox" id="tab-centrage" ${etat.prefs.reperes_centrage !== false ? 'checked' : ''}> Repères de centrage sur la page en déplaçant un plan de situation, une image, une note ou un dessin (aimantation à proximité des axes ; Maj pour l’ignorer)</label>
      </section>`;
}
function brancherTablette() {
  const q = (id) => panneau.querySelector(id);
  q('#tab-ind-aerien').addEventListener('change', (e) => definirPrefsIndicateur({ aerien: e.target.checked }));
  q('#tab-ind-souterrain').addEventListener('change', (e) => definirPrefsIndicateur({ souterrain: e.target.checked }));
  q('#tab-centrage').addEventListener('change', async (e) => {
    etat.prefs.reperes_centrage = e.target.checked;
    try { await bd.put('prefs', { cle: 'reperes_centrage', valeur: e.target.checked }); } catch (err) { /* mémoire seule */ }
  });
  q('#tab-picto-photos').addEventListener('change', async (e) => {
    etat.prefs.picto_photos = e.target.checked;
    emettre('prefs-affichage');
    try { await bd.put('prefs', { cle: 'picto_photos', valeur: e.target.checked }); } catch (err) { /* mémoire seule */ }
  });
}

/* Change l'échelle du plan : recalcule les tailles par défaut du plan. Les objets déjà posés ne changent pas d'aspect :
 * chacun mémorise les facteurs en vigueur à sa création (echelle_plan_origine) et le rendu compense origine / courant,
 * sans écrire quoi que ce soit dans leur echelle_symbole (v12 §1.1, remplace la compensation de la v1.2.0). */
export function definirEchellePlan(valeur) {
  if (!peutModifier()) { signalerLectureSeule(); return; }
  const p = etat.projet;
  const nouveau = defautsPour(valeur);
  p.echelle_plan = valeur;
  p.reglages.taille_texte = Math.round(nouveau.taille_texte * 100) / 100;
  p.reglages.echelle_symbole = Math.round(nouveau.echelle_symbole * 100) / 100;
  emettre('reglages');
}

/* ---------- Descriptif des travaux (v1.5.0 §2.10) : visibilité, colonnes, sortie PDF, aspect, échelle ---------- */
function blocDescriptif(plan) {
  const d = plan.descriptif;
  const K = CHARTE.descriptif;
  if (!d) return `<section class="bloc" id="section-descriptif"><h3>Descriptif des travaux</h3><div class="aide">Aucun descriptif sur ce plan.</div><button class="btn" id="desc-creer">Créer le descriptif</button></section>`;
  const opt = (liste, v) => liste.map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? 'selected' : ''}>${l}</option>`).join('');
  const ech = echelleDescriptif(d);
  return `
      <section class="bloc" id="section-descriptif">
        <h3>Descriptif des travaux</h3>
        <label class="case"><input type="checkbox" id="desc-visible" ${d.visible !== false ? 'checked' : ''}> Afficher le descriptif (masqué : absent des exports, rien n'est perdu)</label>
        <div class="ligne2">
          <label>Colonnes<select id="desc-colonnes">${opt([[1, '1'], [2, '2'], [3, '3']], d.colonnes || 1)}</select></label>
          <label>Sortie PDF<select id="desc-sortie">${opt([['plan', 'Sur le plan'], ['annexe', 'Page annexe']], d.sortie_pdf || 'plan')}</select></label>
        </div>
        <div class="ligne2">
          <label>Cadre<select id="desc-cadre">${opt([['aucun', 'Aucun'], ['rectangle', 'Rectangle'], ['arrondi', 'Rectangle à angles arrondis']], d.cadre || K.cadre_defaut)}</select></label>
          <label>Fond<select id="desc-fond">${opt([['blanc', 'Blanc opaque'], ['translucide', 'Blanc translucide'], ['transparent', 'Transparent']], d.fond || K.fond_defaut)}</select></label>
        </div>
        <div class="ligne2">
          <label>Couleur du cadre<input id="desc-couleur" value="${echapper(d.couleur_cadre || K.couleur_cadre_defaut)}" pattern="#[0-9A-Fa-f]{6}" size="8"></label>
          <label>Échelle du texte (× ${String(Math.round(ech * 100) / 100).replace('.', ',')})<input type="number" id="desc-echelle" value="${Math.round(ech * 100) / 100}" step="0.05" min="${Math.ceil((K.taille_min_mm * 72 / 25.4) / K.corps.taille * 100) / 100}" max="${K.echelle_max}"></label>
        </div>
        ${d.sortie_pdf === 'annexe' ? ligneAnnexe(plan) : ''}
        ${depassePage(plan) && d.sortie_pdf !== 'annexe' ? '<div class="aide alerte-desc">Le bloc dépasse la page (contour rouge) : réduire, déplacer, passer en colonnes ou choisir « Page annexe ».</div>' : ''}
        <div class="aide">Largeur : poignée carrée à droite du bloc sélectionné ; position : glisser le bloc ou flèches du clavier. Double appui sur le bloc : éditeur sur la ligne touchée.</div>
        <div class="boutons-ligne">
          <button class="btn" id="desc-editeur">Ouvrir l'éditeur</button>
          <button class="btn" id="desc-replacer">Replacer au coin haut-droit</button>
          <button class="btn btn-danger" id="desc-supprimer">Supprimer le descriptif…</button>
        </div>
      </section>`;
}

/* v1.7.5 (H-361) — Page annexe : échelle ajustée à la feuille A4 ou échelle du bloc, avec le corps obtenu.
 * v1.7.7 (H-367, H-368) : titre de page non imprimé, folio en bas de page — rappelé dans l'aide. */
function ligneAnnexe(plan) {
  const d = plan.descriptif;
  const K = CHARTE.descriptif;
  const mode = modeEchelleAnnexe(d);
  const [l, h] = K.annexe.format_pt;
  const r = echelleAnnexe(plan, etat.projet, l, h);
  const mm = r ? String(Math.round((K.corps.taille * r.echelle) / (72 / 25.4) * 10) / 10).replace('.', ',') : '—';
  const info = !r ? '' : (r.une_page ? `Page annexe A4 : 1 page, corps ${mm} mm.` : `Page annexe A4 : plusieurs pages, corps ${mm} mm` + (mode === 'ajustee' ? ` (ne tient pas sur une page au corps minimal de ${String(K.taille_min_mm).replace('.', ',')} mm).` : '.'));
  return `
        <div class="ligne2">
          <label>Échelle en page annexe<select id="desc-echelle-annexe"><option value="ajustee" ${mode === 'ajustee' ? 'selected' : ''}>Ajustée à la feuille A4</option><option value="bloc" ${mode === 'bloc' ? 'selected' : ''}>Échelle du bloc</option></select></label>
        </div>
        <div class="aide">${info} ${K.annexe.titre_pdf_visible === true ? '' : 'Titre de page non imprimé : l’en-tête de l’affaire ouvre la page ; folio « 1/2 », « 2/2 »… centré en bas de page s’il y a plusieurs pages.'} « Échelle du bloc » : échelle et colonnes du bloc du plan.</div>`;
}

function brancherDescriptif(plan) {
  const q = (id) => panneau.querySelector(id);
  const garde = () => { if (peutModifier()) return true; signalerLectureSeule(); ouvrir(); return false; };
  if (q('#desc-creer')) q('#desc-creer').addEventListener('click', async () => { if (!garde()) return; const m = await import('../outils.js'); m.poserDescriptif(); ouvrir(); });
  const d = plan.descriptif;
  if (!d) return;
  q('#desc-visible').addEventListener('change', async (e) => { const m = await import('../outils.js'); m.definirDescriptifVisible(e.target.checked); });
  q('#desc-colonnes').addEventListener('change', async (e) => { if (!garde()) return; const m = await import('./descriptif.js'); m.changerColonnes(Number(e.target.value)); ouvrir(); });
  q('#desc-sortie').addEventListener('change', (e) => { if (!garde()) return; d.sortie_pdf = e.target.value === 'annexe' ? 'annexe' : 'plan'; valider('Descriptif — sortie'); ouvrir(); });
  if (q('#desc-echelle-annexe')) q('#desc-echelle-annexe').addEventListener('change', (e) => { if (!garde()) return; d.echelle_annexe = e.target.value === 'bloc' ? 'bloc' : 'ajustee'; valider('Descriptif — échelle de la page annexe'); ouvrir(); });
  q('#desc-cadre').addEventListener('change', (e) => { if (!garde()) return; d.cadre = e.target.value; valider('Cadre du descriptif'); });
  q('#desc-fond').addEventListener('change', (e) => { if (!garde()) return; d.fond = e.target.value; valider('Fond du descriptif'); });
  q('#desc-couleur').addEventListener('change', (e) => { if (!garde()) return; const v = String(e.target.value).trim(); if (/^#[0-9A-Fa-f]{6}$/.test(v)) { d.couleur_cadre = v.toUpperCase(); valider('Couleur du descriptif'); } else e.target.value = d.couleur_cadre || CHARTE.descriptif.couleur_cadre_defaut; });
  q('#desc-echelle').addEventListener('change', (e) => { if (!garde()) return; const v = Number(String(e.target.value).replace(',', '.')); if (v > 0) { d.echelle = v; d.echelle = echelleDescriptif(d); valider('Échelle du descriptif'); } ouvrir(); });
  q('#desc-editeur').addEventListener('click', () => { fermer(); emettre('ouvrir-descriptif', null); });
  q('#desc-replacer').addEventListener('click', () => { if (!garde()) return; d.x = null; d.y = null; valider('Descriptif replacé'); });
  q('#desc-supprimer').addEventListener('click', async () => { const m = await import('./descriptif.js'); await m.supprimer(); ouvrir(); });
}

/* ---------- v1.7.3 (H-352) — Angle de piquetage calculé : activation, désactivation, recalcul général ----------
 * Plans autres que le plan affiché : recalcul direct (ils ont leur propre historique) ; plan affiché : par valider(),
 * une étape d'historique. La désactivation ne touche à aucune valeur : seuls les motifs « à compléter » disparaissent. */
function autresPlans() {
  return (etat.projet.plans || []).filter((pl) => pl !== etat.plan);
}
function majPlanHorsHistorique(plan, options) {
  recalculerAnglesPlan(plan, etat.projet, options);
  for (const o of plan.objets || []) mettreAJourComplet(o, plan.objets);
  try { mettreAJourDescriptif(plan, etat.projet); } catch (e) { console.warn('Descriptif non mis à jour', e); }
}
export function definirPiquetageAuto(actif) {
  if (!etat.projet) return;
  if (!peutModifier()) { signalerLectureSeule(); return; }
  etat.projet.reglages.angle_piquetage_auto = !!actif;
  if (actif) {
    for (const plan of autresPlans()) majPlanHorsHistorique(plan, {});
    valider('Angle de piquetage calculé activé');
    notifier('Angles de piquetage calculés ; les angles déjà saisis restent manuels', 3200);
  } else {
    for (const plan of etat.projet.plans || []) for (const o of plan.objets || []) mettreAJourComplet(o, plan.objets);
    emettre('objets', { etiquette: 'reglages' });
    notifier('Angle de piquetage calculé désactivé : valeurs conservées, plus de recalcul', 3200);
  }
  emettre('reglages');
}
export async function recalculerTousLesAngles() {
  if (!etat.projet || !piquetageActif()) return;
  if (!peutModifier()) { signalerLectureSeule(); return; }
  const n = manuelsRemplacables();
  const ok = await confirmer(`Recalculer l’angle de piquetage de tous les supports de toutes les pages ? Les saisies manuelles sont remplacées par la valeur calculée${n ? ' (' + n + ' valeur' + (n > 1 ? 's' : '') + ' différente' + (n > 1 ? 's' : '') + ')' : ''} ; un support sans valeur calculable garde sa saisie.`, { ok: 'Recalculer et remplacer', danger: true });
  if (!ok) return;
  for (const plan of autresPlans()) majPlanHorsHistorique(plan, { remplacerManuels: true });
  recalculerAnglesPlan(etat.plan, etat.projet, { remplacerManuels: true });
  valider('Angles de piquetage recalculés');
  notifier('Angles de piquetage recalculés');
}

export function defautsPour(echelle) {
  return defautsEchellePlan(echelle);
}

let panneau;

export function initialiserCalques() {
  panneau = document.getElementById('panneau-calques');
  document.getElementById('btn-calques').addEventListener('click', () => { if (panneau.hidden) ouvrir(); else fermer(); });
  sur('fermer-panneaux', fermer);
  sur('projet-ferme', fermer);
  sur('reglage-accrochage', () => { if (!panneau.hidden) ouvrir(); });
  sur('plans', () => { if (!panneau.hidden) ouvrir(); });
}

function fermer() { panneau.hidden = true; }

/* v1.7.1 : ouverture depuis la barre du haut — « Calques » en tête du panneau, « Réglages » sur la section des réglages. */
export function ouvrirCalques({ section = null } = {}) {
  if (!etat.projet) return;
  if (!panneau.hidden && !section) { fermer(); return; }
  ouvrir();
  if (section) { const el = panneau.querySelector('#' + section); if (el) el.scrollIntoView({ block: 'start' }); }
}
export function panneauCalquesOuvert() { return !!panneau && !panneau.hidden; }

function ouvrir() {
  if (!etat.projet) return;
  const p = etat.projet, plan = etat.plan;
  document.getElementById('fiche').hidden = true;
  document.getElementById('panneau-a-completer').hidden = true;
  panneau.hidden = false;
  panneau.innerHTML = `
    <header class="entete-panneau"><h2>Calques, affichage et réglages</h2><button class="btn-icone fermer" title="Fermer">✕</button></header>
    <div class="contenu">
      <section class="bloc">
        <h3>Calques</h3>
        ${Object.entries(LIBELLES.calques).map(([k, l]) => `
          <div class="ligne-calque" data-calque="${k}">
            <label class="case"><input type="checkbox" data-champ="visible" ${p.calques[k].visible ? 'checked' : ''}> ${echapper(l)}</label>
            <button class="btn-icone verrou ${p.calques[k].verrou ? 'actif' : ''}" data-champ="verrou" title="${p.calques[k].verrou ? 'Déverrouiller' : 'Verrouiller'}">${p.calques[k].verrou ? '🔒' : '🔓'}</button>
            <input type="range" data-champ="opacite" min="0.1" max="1" step="0.1" value="${p.calques[k].opacite}" title="Opacité">
          </div>`).join('')}
      </section>
      <section class="bloc">
        <h3>Réseaux affichés</h3>
        <div class="chips">${Object.entries(LIBELLES.domaines).map(([k, l]) => `<button class="chip ${p.filtre_domaines[k] !== false ? 'actif' : ''}" data-domaine="${k}">${l}</button>`).join('')}</div>
      </section>
      ${plan.fond ? `
      <section class="bloc">
        <h3>Fond de plan${p.plans.length > 1 ? ' — ' + echapper(plan.nom || '') : ''}</h3>
        <div class="aide">${echapper(plan.fond.nom_fichier)} — ${Math.round(plan.fond.largeur)} × ${Math.round(plan.fond.hauteur)} ${plan.fond.type === 'pdf' ? 'pt' : 'unités'}${plan.fond.rotation ? ' (page tournée de ' + plan.fond.rotation + '°)' : ''}</div>
        <label>Opacité du fond<input type="range" id="fond-opacite" min="0.1" max="1" step="0.05" value="${plan.fond.opacite ?? 1}"></label>
        ${plan.fond.type === 'pdf' && plan.fond.nb_pages > 1 ? `<div class="aide">Page ${plan.fond.page || 1} / ${plan.fond.nb_pages} du PDF. Chaque page est un plan distinct (‹ › en bas à droite, Page préc. / Page suiv.).</div>` : ''}
        ${repartitionPossible() ? '<button class="btn" id="fond-repartir">Répartir les pages en plans…</button>' : ''}
      </section>` : ''}
      <section class="bloc" id="section-echelle">
        <h3>Échelle du plan</h3>
        ${p.plans.length > 1 ? '<div class="aide">Commune à tous les plans du projet.</div>' : ''}
        <label>Échelle (aspect des tailles par défaut ; le métré viendra au lot 3)<select id="reg-echelle-plan">
          <option value="" ${!p.echelle_plan ? 'selected' : ''}>Inconnue (photo, fond non coté)</option>
          ${CHARTE.ECHELLES_PLAN.map((e) => `<option value="${e}" ${p.echelle_plan === e ? 'selected' : ''}>1/${e}</option>`).join('')}
          ${p.echelle_plan && !CHARTE.ECHELLES_PLAN.includes(p.echelle_plan) ? `<option value="${p.echelle_plan}" selected>1/${p.echelle_plan}</option>` : ''}
          <option value="__autre__">Autre…</option>
        </select></label>
        <div class="aide">Les objets déjà posés gardent l'aspect de l'échelle en vigueur à leur pose ; leur champ « taille du symbole » reste à 1,0.</div>
        <button class="btn" id="reg-aligner">Aligner tous les objets sur l'échelle courante</button>
      </section>
      <section class="bloc" id="section-reglages-plan">
        <h3>Réglages du plan</h3>
        <label>Taille des textes (× ${p.reglages.taille_texte})<input type="range" id="reg-texte" min="0.5" max="3" step="0.1" value="${p.reglages.taille_texte}"></label>
        <label>Taille des symboles (× ${p.reglages.echelle_symbole})<input type="range" id="reg-symbole" min="0.5" max="3" step="0.1" value="${p.reglages.echelle_symbole}"></label>
        <label class="case"><input type="checkbox" id="reg-longueurs" ${p.reglages.afficher_longueurs !== false ? 'checked' : ''}> Afficher les longueurs sur les étiquettes de tronçons</label>
        <label class="case"><input type="checkbox" id="reg-angulaire" ${etat.accrochageAngulaire ? 'checked' : ''}> Accrochage angulaire 0° / 45° / 90° (A)</label>
        <label class="case"><input type="checkbox" id="reg-piquetage" ${piquetageActif(p) ? 'checked' : ''}> Angle de piquetage calculé (supports entre deux portées aériennes, en grades, arrondi à l’entier supérieur)</label>
        <div class="aide">Projet entier. Une valeur saisie à la main reste manuelle ; désactivé : valeurs conservées, plus de recalcul.</div>
        ${piquetageActif(p) ? '<button class="btn" id="reg-piquetage-tout">Recalculer tous les angles (remplace les saisies manuelles)…</button>' : ''}
        <button class="btn" id="reg-couleurs-texte">Couleurs de texte par défaut (page courante)…</button>
      </section>
      <section class="bloc" id="section-legende">
        <h3>Légende</h3>
        <label class="case"><input type="checkbox" id="reg-legende" ${legendeAffichee() ? 'checked' : ''}> Afficher la légende (masquer ne perd aucun réglage ; l'objet « Légende » de la boîte Outils la repose)</label>
        <div class="ligne2">
          <label>Cadre<select id="reg-legende-cadre">${[['aucun', 'Aucun'], ['rectangle', 'Rectangle'], ['arrondi', 'Rectangle à angles arrondis']].map(([k, l]) => `<option value="${k}" ${(plan.legende.cadre || CHARTE.legende.cadre_defaut) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Fond<select id="reg-legende-fond">${[['blanc', 'Blanc opaque'], ['translucide', 'Blanc translucide'], ['transparent', 'Transparent']].map(([k, l]) => `<option value="${k}" ${(plan.legende.fond || CHARTE.legende.fond_defaut) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <label>Couleur du cadre<input id="reg-legende-couleur" value="${echapper(plan.legende.couleur_cadre || CHARTE.legende.couleur_cadre_defaut)}" pattern="#[0-9A-Fa-f]{6}" size="8"></label>
        <div class="aide">Échelle ×${String(Math.round((plan.legende.echelle || 1) * 100) / 100).replace('.', ',')} (poignée carrée sur la légende sélectionnée, bornes ${CHARTE.legende.echelle_min}–${CHARTE.legende.echelle_max}). Position, taille, visibilité et aspect sont enregistrés dans le projet, exportés et annulables.</div>
        <button class="btn" id="reg-legende-reinit">Replacer et réinitialiser la légende</button>
      </section>
      ${blocDescriptif(plan)}
      ${blocTablette()}
    </div>`;
  panneau.querySelector('.fermer').addEventListener('click', fermer);
  panneau.querySelectorAll('.ligne-calque').forEach((l) => {
    const k = l.dataset.calque;
    l.querySelector('[data-champ="visible"]').addEventListener('change', (e) => { p.calques[k].visible = e.target.checked; emettre('calques'); });
    l.querySelector('[data-champ="verrou"]').addEventListener('click', (e) => { p.calques[k].verrou = !p.calques[k].verrou; e.target.textContent = p.calques[k].verrou ? '🔒' : '🔓'; e.target.classList.toggle('actif', p.calques[k].verrou); emettre('calques'); });
    l.querySelector('[data-champ="opacite"]').addEventListener('input', (e) => { p.calques[k].opacite = Number(e.target.value); emettre('calques'); });
  });
  panneau.querySelectorAll('[data-domaine]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.domaine; p.filtre_domaines[k] = p.filtre_domaines[k] === false; b.classList.toggle('actif', p.filtre_domaines[k]); emettre('calques'); }));
  const fo = panneau.querySelector('#fond-opacite'); if (fo) fo.addEventListener('input', (e) => reglerOpacite(Number(e.target.value)));
  const fr = panneau.querySelector('#fond-repartir'); if (fr) fr.addEventListener('click', () => { fermer(); lancerRepartition(); });
  panneau.querySelector('#reg-texte').addEventListener('change', (e) => { p.reglages.taille_texte = Number(e.target.value); emettre('reglages'); ouvrir(); });
  panneau.querySelector('#reg-symbole').addEventListener('change', (e) => { p.reglages.echelle_symbole = Number(e.target.value); emettre('reglages'); ouvrir(); });
  panneau.querySelector('#reg-echelle-plan').addEventListener('change', async (e) => {
    let v = e.target.value;
    if (v === '__autre__') { const { demander } = await import('./dialogues.js'); const r = await demander('Échelle du plan', [{ nom: 'd', libelle: 'Dénominateur (ex. 250 pour 1/250)', valeur: '', type: 'number' }]); v = r && Number(r.d) > 0 ? r.d : ''; }
    definirEchellePlan(v ? Number(v) : null);
    ouvrir();
  });
  panneau.querySelector('#reg-aligner').addEventListener('click', async () => {
    if (!peutModifier()) { signalerLectureSeule(); return; }
    if (!(await confirmer('Appliquer les tailles par défaut de l’échelle courante à tous les objets du projet ? Leur aspect change (annulable).', { ok: 'Aligner' }))) return;
    const n = alignerSurEchelleCourante();
    emettre('reglages');
    notifier(n + ' objet' + (n > 1 ? 's' : '') + ' aligné' + (n > 1 ? 's' : '') + ' sur l’échelle courante');
  });
  panneau.querySelector('#reg-longueurs').addEventListener('change', (e) => { p.reglages.afficher_longueurs = e.target.checked; emettre('reglages'); });
  panneau.querySelector('#reg-legende').addEventListener('change', (e) => { definirLegendeVisible(e.target.checked); });
  panneau.querySelector('#reg-legende-cadre').addEventListener('change', (e) => { plan.legende.cadre = e.target.value; valider('Cadre de la légende'); });
  panneau.querySelector('#reg-legende-fond').addEventListener('change', (e) => { plan.legende.fond = e.target.value; valider('Fond de la légende'); });
  panneau.querySelector('#reg-legende-couleur').addEventListener('change', (e) => { const v = String(e.target.value).trim(); if (/^#[0-9A-Fa-f]{6}$/.test(v)) { plan.legende.couleur_cadre = v.toUpperCase(); valider('Couleur de la légende'); } else e.target.value = plan.legende.couleur_cadre || CHARTE.legende.couleur_cadre_defaut; });
  panneau.querySelector('#reg-legende-reinit').addEventListener('click', () => { plan.legende = legendeParDefaut(); valider('Légende réinitialisée'); ouvrir(); });
  panneau.querySelector('#reg-angulaire').addEventListener('change', (e) => { etat.accrochageAngulaire = e.target.checked; });
  panneau.querySelector('#reg-piquetage').addEventListener('change', (e) => { definirPiquetageAuto(e.target.checked); ouvrir(); });   // v1.7.3
  const rt = panneau.querySelector('#reg-piquetage-tout'); if (rt) rt.addEventListener('click', async () => { await recalculerTousLesAngles(); ouvrir(); });
  panneau.querySelector('#reg-couleurs-texte').addEventListener('click', () => import('./outils-annotation.js').then((m) => m.lancerCouleursTexte()));   // v1.7.1 : déplacé de la boîte Outils
  brancherDescriptif(plan);
  brancherTablette();
}
