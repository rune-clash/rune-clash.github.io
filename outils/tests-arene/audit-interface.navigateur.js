// Audit de l'interface (phase 4) : parcourt tous les écrans sur 6 tailles et relève débordements, boutons hors
// écran ou trop petits (mobile), chevauchements de boutons au premier plan, textes coupés, erreurs JS.
// Prérequis : Playwright, et le jeu servi sur http://localhost:8765 (python3 -m http.server 8765).
// Lancer : node outils/tests-arene/audit-interface.navigateur.js [tel_petit,tel,paysage,tablette,pc,grand]
// Résultats : audit.json et captures audit_<taille>_<ecran>.png dans le dossier $S (par défaut le dossier temporaire).
const { chromium } = require('playwright');
const fs = require('fs');
const S = process.env.S || require('os').tmpdir();
const TAILLES = {
  tel_petit: { width: 360, height: 740, mobile: true },
  tel: { width: 390, height: 844, mobile: true },
  paysage: { width: 844, height: 390, mobile: true },
  tablette: { width: 768, height: 1024, mobile: true },
  pc: { width: 1280, height: 800, mobile: false },
  grand: { width: 1920, height: 1080, mobile: false }
};
const ECRANS = ['home', 'coll', 'hero', 'inv', 'arene', 'bag', 'quests', 'event', 'market', 'shop', 'train', 'tower', 'pass', 'online', 'friends', 'club', 'profile', 'auth', 'settings', 'act', 'mem', 'arcade', 'lb'];
const CAPTURES = new Set(['tel', 'pc', 'paysage']);

async function auditer(p, mobile) {
  return p.evaluate(mobile => {
    const vw = innerWidth, vh = innerHeight;
    const vis = el => {
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
      for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; }
      return r.bottom > 0 && r.top < vh * 3;
    };
    const defile = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1) return true; } return false; };
    const nom = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' «' + (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28) + '»');
    const o = { debordement: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth : 0, hors: [], petits: [], chevauchements: [], coupes: [] };
    const inter = [...document.querySelectorAll('button,a[href],input,select,textarea,[role=button]')].filter(vis);
    for (const el of inter) {
      const r = el.getBoundingClientRect();
      if ((r.right > vw + 1 || r.left < -1) && !defile(el)) o.hors.push(nom(el) + ` [${r.left | 0}→${r.right | 0}]`);
      if (mobile && (r.width < 32 || r.height < 32) && r.top < vh) o.petits.push(nom(el) + ` ${r.width | 0}×${r.height | 0}`);
    }
    // chevauchements entre éléments interactifs non imbriqués, dans la partie visible
    // au premier plan : l'élément (ou un de ses descendants) est bien celui qu'on touche en son centre
    const dessus = el => { const r = el.getBoundingClientRect(), x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2)); const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h) || h.contains(el)); };
    const vus = inter.filter(el => { const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0 && dessus(el); }).slice(0, 220);
    for (let i = 0; i < vus.length; i++) for (let j = i + 1; j < vus.length; j++) {
      const a = vus[i], b = vus[j]; if (a.contains(b) || b.contains(a)) continue;
      const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
      const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (w > 4 && h > 4 && w * h > 0.25 * Math.min(A.width * A.height, B.width * B.height)) {
        // ignorer si l'un est caché sous l'autre volontairement (pointer-events none)
        if (getComputedStyle(a).pointerEvents === 'none' || getComputedStyle(b).pointerEvents === 'none') continue;
        o.chevauchements.push(nom(a) + ' ⨯ ' + nom(b));
      }
    }
    // textes coupés : contenu plus large que la boîte, sans points de suspension
    for (const el of [...document.querySelectorAll('b,small,span,p,h1,h2,h3,h4,em,label,button,div')].filter(vis)) {
      if (el.children.length > 2 || el.matches('.sr,.sr-only,[class*="visually"]') || el.querySelector('img')) continue;
      const s = getComputedStyle(el);
      if (s.overflow === 'visible' && s.overflowX === 'visible') continue;
      if (el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== 'ellipsis' && !/(auto|scroll)/.test(s.overflowX) && el.clientWidth > 0 && (el.innerText || '').trim()) {
        const r = el.getBoundingClientRect(); if (r.top < vh) o.coupes.push(nom(el) + ` ${el.scrollWidth}/${el.clientWidth}`);
      }
    }
    for (const k of ['hors', 'petits', 'chevauchements', 'coupes']) { o['n_' + k] = o[k].length; o[k] = [...new Set(o[k])].slice(0, 6); }
    return o;
  }, mobile);
}

(async () => {
  const filtre = process.argv[2] ? process.argv[2].split(',') : Object.keys(TAILLES);
  const b = await chromium.launch(), res = {};
  for (const t of filtre) {
    const T = TAILLES[t];
    const ctx = await b.newContext({ viewport: { width: T.width, height: T.height }, hasTouch: T.mobile, isMobile: T.mobile && T.width < 900, deviceScaleFactor: 1 });
    const p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8765/index.html?arene_test=1', { waitUntil: 'commit' });
    await p.waitForFunction(() => window.__g && document.readyState === 'complete', null, { timeout: 90000 });
    await p.waitForTimeout(2500);
    await p.evaluate(() => { const t = document.querySelector('[data-tipok]'); t && t.click(); const P = window.__g.P; P.tk = 12; P.pc = 50000; P.ec = 900; });
    res[t] = {};
    for (const e of ECRANS) {
      try { await p.evaluate(e => e === 'hero' ? window.__g.go('hero', 'rin') : window.__g.go(e), e); } catch (x) { res[t][e] = { erreur: String(x).slice(0, 120) }; continue; }
      await p.waitForTimeout(e === 'home' || e === 'coll' ? 1500 : 700);
      res[t][e] = await auditer(p, T.mobile);
      if (CAPTURES.has(t)) await p.screenshot({ path: `${S}/audit_${t}_${e}.png`, timeout: 120000 }).catch(() => {});
    }
    // Runes des Trophées : partie en cours puis résultats
    try {
      await p.evaluate(() => window.__g.go('arene')); await p.waitForTimeout(600);
      await p.evaluate(() => document.querySelector('[data-ar="jouer"]').click()); await p.waitForTimeout(900);
      res[t].arene_attente = await auditer(p, T.mobile);
      if (CAPTURES.has(t)) await p.screenshot({ path: `${S}/audit_${t}_arene_attente.png`, timeout: 120000 }).catch(() => {});
      await p.waitForTimeout(5500);
      res[t].arene_partie = await auditer(p, T.mobile);
      if (CAPTURES.has(t)) await p.screenshot({ path: `${S}/audit_${t}_arene_partie.png`, timeout: 120000 }).catch(() => {});
      await p.evaluate(() => window.__arene.session.quitter()); await p.waitForTimeout(900);
      await p.evaluate(() => { const v = document.querySelector('[data-ar="voir"]'); v && v.click(); }); await p.waitForTimeout(1600);
      res[t].arene_resultats = await auditer(p, T.mobile);
      if (CAPTURES.has(t)) await p.screenshot({ path: `${S}/audit_${t}_arene_resultats.png`, timeout: 120000 }).catch(() => {});
    } catch (x) { res[t].arene_erreur = String(x).slice(0, 200); }
    res[t]._erreurs_js = errs.slice(0, 5);
    await ctx.close();
  }
  fs.writeFileSync(`${S}/audit.json`, JSON.stringify(res, null, 1));
  // résumé
  for (const t of Object.keys(res)) {
    const lignes = [];
    for (const [e, o] of Object.entries(res[t])) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
      const pb = [o.debordement ? 'DÉBORDE ' + o.debordement : '', o.n_hors ? 'hors:' + o.n_hors : '', o.n_petits ? 'petits:' + o.n_petits : '', o.n_chevauchements ? 'chev:' + o.n_chevauchements : '', o.n_coupes ? 'coupés:' + o.n_coupes : ''].filter(Boolean).join(' ');
      if (pb || o.erreur) lignes.push(`  ${e}: ${pb} ${o.erreur || ''}`);
    }
    console.log(`== ${t} ${res[t]._erreurs_js.length ? 'ERREURS JS: ' + res[t]._erreurs_js.join(' | ') : ''}${res[t].arene_erreur ? ' ARÈNE: ' + res[t].arene_erreur : ''}`);
    console.log(lignes.join('\n') || '  rien à signaler');
  }
  await b.close();
})();
