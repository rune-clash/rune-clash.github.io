// Parties enchaînées dans le navigateur (phase 4) : fuites (minuteurs, écouteurs, boucles d'animation, canevas,
// nœuds, mémoire) et fluidité en pleine partie à 10 combattants.
// Prérequis : Playwright, et le jeu servi sur http://localhost:8765 (python3 -m http.server 8765).
// Lancer : node outils/tests-arene/enchaine.navigateur.js [largeur] [hauteur] [nombre_de_parties]
const { chromium } = require('playwright');
(async () => {
  const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844), N = +(process.argv[4] || 6);
  const b = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: W < 900, isMobile: W < 900 });
  await ctx.addInitScript(() => {
    const st = window.__st = { iv: new Set(), lis: 0, raf: 0 };
    const si = window.setInterval, ci = window.clearInterval;
    window.setInterval = function (f, t, ...a) { const id = si(f, t, ...a); st.iv.add(id); return id; };
    window.clearInterval = function (id) { st.iv.delete(id); return ci(id); };
    const cible = o => o === window || o === document || o === document.body || o === document.documentElement;
    const ael = EventTarget.prototype.addEventListener, rel = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (...a) { if (cible(this)) st.lis++; return ael.apply(this, a); };
    EventTarget.prototype.removeEventListener = function (...a) { if (cible(this)) st.lis--; return rel.apply(this, a); };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => { st.raf++; return raf(cb); };
  });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html?arene_test=1', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__g && document.readyState === 'complete', null, { timeout: 90000 });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const t = document.querySelector('[data-tipok]'); t && t.click(); window.__g.go('arene'); });
  await p.waitForTimeout(800);
  const mesure = async () => p.evaluate(async () => {
    if (window.gc) window.gc();
    const st = window.__st, r0 = st.raf; await new Promise(r => setTimeout(r, 1000));
    return { rafParS: st.raf - r0, intervalles: st.iv.size, ecouteurs: st.lis, canevas: document.querySelectorAll('canvas').length,
      noeuds: document.getElementsByTagName('*').length, tasMo: performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(1) : null };
  });
  const lignes = [['départ', await mesure()]];
  const fps = [];
  for (let k = 1; k <= N; k++) {
    await p.evaluate(() => document.querySelector('[data-ar="jouer"]').click());
    await p.waitForFunction(() => window.__arene && window.__arene.session && window.__arene.session.vue && window.__arene.session.vue.t > 1, null, { timeout: 30000 });
    // fluidité en pleine partie (10 combattants)
    const f = await p.evaluate(async () => { const t0 = performance.now(); let n = 0, pire = 0, prec = t0; await new Promise(res => { const boucle = () => { const t = performance.now(); pire = Math.max(pire, t - prec); prec = t; n++; t - t0 < 3000 ? requestAnimationFrame(boucle) : res(); }; requestAnimationFrame(boucle); }); return { ips: Math.round(n / 3), pireImageMs: Math.round(pire), vivants: window.__arene.session.vue.f.filter(x => x.vivant).length }; });
    fps.push(f);
    await p.evaluate(() => window.__arene.session.quitter()); await p.waitForTimeout(900);
    await p.evaluate(() => { const v = document.querySelector('[data-ar="voir"]'); v && v.click(); }); await p.waitForTimeout(1200);
    await p.evaluate(() => { const m = [...document.querySelectorAll('button')].find(b => /^\s*MENU\s*$/i.test(b.textContent)); m ? m.click() : window.__g.go('arene'); });
    await p.waitForTimeout(900);
    lignes.push(['après partie ' + k, await mesure()]);
  }
  console.log(`taille ${W}×${H}`);
  lignes.forEach(([n, m]) => console.log(n.padEnd(16), JSON.stringify(m)));
  console.log('fluidité en partie :', fps.map(f => `${f.ips} i/s (pire ${f.pireImageMs} ms, ${f.vivants} en vie)`).join(' | '));
  console.log(errs.length ? 'ERREURS JS : ' + errs.slice(0, 5).join(' | ') : 'aucune erreur JS');
  await b.close();
})();
