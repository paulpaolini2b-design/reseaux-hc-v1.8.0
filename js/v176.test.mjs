/* v176.test.mjs — essais v1.7.6 : plan de situation tolérant aux tuiles absentes (H-362).
 * Lancer : node js/v176.test.mjs   (non précaché par le service worker, comme les autres essais)
 * fetch, createImageBitmap, navigator et canvas sont simulés. */
import assert from 'node:assert/strict';

const zoneFactice = { clientWidth: 1200, clientHeight: 800, style: {}, appendChild() {}, querySelector() { return null; } };
let dessinees = 0;
const contexte = { fillRect() {}, drawImage() { dessinees++; }, measureText: () => ({ width: 100 }), fillText() {}, set fillStyle(v) {}, set font(v) {}, set textBaseline(v) {} };
globalThis.document = {
  getElementById: (id) => (id === 'zone-plan' ? zoneFactice : null),
  createElement: () => ({ getContext: () => contexte, toBlob: (cb) => cb({ type: 'image/jpeg' }), style: {} }),
  addEventListener() {}
};
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {} };
globalThis.createImageBitmap = async () => ({ close() {} });

const S = await import('./situation.js');

let appels = [];
let reponse = () => ({ status: 200, ok: true, blob: async () => ({ type: 'image/png' }) });
globalThis.fetch = async (url, opt) => { appels.push({ url, cache: opt.cache }); return reponse(url, opt); };

let n = 0;
const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);

essai('inversion latitude / longitude reconnue (Haute-Corse)', () => {
  assert.equal(S.inversionProbable(42.6971, 9.4501), false);
  assert.equal(S.inversionProbable(9.4501, 42.6971), true);
  assert.equal(S.inversionProbable(-21.1, 55.5), false);   // La Réunion saisie dans le bon ordre : acceptée
  assert.equal(S.inversionProbable(48.85, 2.35), false);
});

essai('404 redemandé une fois sans cache HTTP, puis tuile absente (null)', async () => {
  appels = []; reponse = () => ({ status: 404, ok: false });
  assert.equal(await S.chargerTuile('u', null), null);
  assert.deepEqual(appels.map((a) => a.cache), ['default', 'reload']);
});

essai('404 en cache, 200 au rechargement : tuile obtenue', async () => {
  appels = []; reponse = (u, o) => (o.cache === 'reload' ? { status: 200, ok: true, blob: async () => ({ type: 'image/png' }) } : { status: 404, ok: false });
  assert.ok(await S.chargerTuile('u', null));
  assert.equal(appels.length, 2);
});

essai('erreur serveur : message « service IGN », pas « connexion »', async () => {
  reponse = () => ({ status: 503, ok: false });
  await assert.rejects(S.genererCarteSituation('42.6971, 9.4501', 15), (e) => /service IGN en erreur \(HTTP 503\)/.test(e.message) && !/connexion/.test(e.message));
});

essai('panne réseau : message « vérifier la connexion »', async () => {
  const f = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(S.genererCarteSituation('42.6971, 9.4501', 15), /vérifier la connexion/);
  globalThis.fetch = f;
});

essai('tuiles absentes en partie : carte composée, absentes comptées et laissées en blanc', async () => {
  dessinees = 0; let i = 0;
  reponse = () => (i++ % 4 === 0 ? { status: 404, ok: false } : { status: 200, ok: true, blob: async () => ({ type: 'image/png' }) });
  const r = await S.genererCarteSituation('42.6971, 9.4501', 15);
  assert.ok(r.tuiles_absentes > 0);
  const total = S.tuilesFenetre(42.6971, 9.4501, 15, 1200, 900).length;
  assert.equal(dessinees, total - r.tuiles_absentes);
});

essai('toutes les tuiles absentes : erreur « hors couverture », pas « connexion »', async () => {
  reponse = () => ({ status: 404, ok: false });
  await assert.rejects(S.genererCarteSituation('42.6971, 9.4501', 15), (e) => /hors couverture/.test(e.message) && !/connexion/.test(e.message));
});

essai('saisie inversée : refus explicite avant tout appel au service', async () => {
  appels = [];
  await assert.rejects(S.genererCarteSituation('9.4501, 42.6971', 15), /inversées/);
  assert.equal(appels.length, 0);
});

const avert = console.warn; console.warn = () => {};
for (const [nom, fn] of essais) {
  try { await fn(); n++; console.log('ok  ', nom); }
  catch (e) { console.log('ÉCHEC', nom); console.log(e); process.exitCode = 1; }
}
console.warn = avert;
console.log(`${n}/${essais.length} essais réussis`);
