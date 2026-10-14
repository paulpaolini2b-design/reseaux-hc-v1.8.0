/* dialogues.test.mjs — correctif v1.6.0 : boîte fermée puis aussitôt rouverte sur le même <dialog>.
 * L'événement `close` d'un <dialog> est différé (tâche suivante, comme dans Chrome) : il ne doit pas résoudre la boîte
 * suivante (confirmation de suppression d'une page, renommage). Lancer : node js/dialogues.test.mjs */
import assert from 'node:assert/strict';

/* <dialog> factice : showModal / close, `close` envoyé à la tâche suivante, boutons cliquables. */
class Bouton extends EventTarget { constructor(r) { super(); this.dataset = { r }; } click() { this.dispatchEvent(new Event('click')); } }
class DialogueFactice extends EventTarget {
  constructor() { super(); this.open = false; this.dataset = {}; this.boutons = []; this._html = ''; }
  set innerHTML(h) { this._html = h; this.boutons = [...h.matchAll(/data-r="(\w+)"/g)].map((m) => new Bouton(m[1])); }
  get innerHTML() { return this._html; }
  showModal() { this.open = true; }
  close() { if (!this.open) return; this.open = false; setTimeout(() => this.dispatchEvent(new Event('close')), 0); }
  querySelectorAll(sel) { return sel === '[data-r]' ? this.boutons : []; }
  querySelector(sel) { const m = /data-r="(\w+)"/.exec(sel); return m ? this.boutons.find((b) => b.dataset.r === m[1]) : null; }
}
const dlg = new DialogueFactice();
globalThis.document = { getElementById: () => dlg };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const { ouvrirDialogue, confirmer } = await import('./ui/dialogues.js');
const tache = () => new Promise((r) => setTimeout(r, 5));

let n = 0;
const essai = async (nom, fn) => { await fn(); n++; console.log('ok  ' + nom); };

await essai('liste des pages fermée puis confirmation aussitôt ouverte : « Supprimer » confirme', async () => {
  ouvrirDialogue('dlg-generique', '<form>liste des pages</form>');
  dlg.close();                                   // appui sur « Supprimer » de la liste : close différé
  const p = confirmer('Supprimer la page « Plan 2 » ?', { ok: 'Supprimer', danger: true });
  await tache();                                 // le close de la liste arrive pendant la confirmation
  assert.equal(dlg.open, true, 'la confirmation reste ouverte');
  dlg.querySelector('[data-r="oui"]').click();
  assert.equal(await p, true);
});

await essai('confirmation : « Annuler » et fermeture extérieure répondent non', async () => {
  let p = confirmer('Question ?');
  dlg.querySelector('[data-r="non"]').click();
  assert.equal(await p, false);
  await tache();
  p = confirmer('Question ?');
  dlg.close();
  assert.equal(await p, false);
});

console.log(n + ' essais réussis');
