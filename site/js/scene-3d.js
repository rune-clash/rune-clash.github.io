/* =============================================================================
   RUNE CLASH — LE PRISME EN 3D (accueil)
   -----------------------------------------------------------------------------
   Le Prisme doré de l'histoire du jeu, dessiné avec Three.js.
   Glisser = tourner · pincer ou boutons +/− = zoomer · toucher = petit éclat.
   Sans 3D (vieux téléphone), une image du Prisme s'affiche à la place.
   ============================================================================= */
const Prisme3D = (function () {
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OR = 0xd8b25a, OR_CLAIR = 0xf2dc9e;
  let rendu, scene, camera, groupe, prisme, coeur, anneaux = [], eclats = [], poussiere, hote, visible = true, mode = 'entree';
  const cam = { x: 0, y: -1.1 };   // décalage de la caméra (glisse en douceur d'un écran à l'autre)
  const V = { lacet: 0.6, tangage: 0.15, vL: 0, vT: 0, dist: 8.4, cible: 8.4, t: 0, pulse: 0 };

  function init(el) {
    hote = el;
    try {
      if (typeof THREE === 'undefined') throw new Error('Three.js absent');
      rendu = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) { return false; }
    rendu.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    rendu.outputEncoding = THREE.sRGBEncoding;
    rendu.toneMapping = THREE.ACESFilmicToneMapping; rendu.toneMappingExposure = 1.1;
    rendu.domElement.setAttribute('aria-label', 'Le Prisme de Rune Clash en 3D. Glisse pour le faire tourner.');
    rendu.domElement.tabIndex = 0;
    el.appendChild(rendu.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    scene.environment = reflets();

    groupe = new THREE.Group(); scene.add(groupe);
    // le Prisme : un cristal à facettes, en or poli
    const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.78, 1.42, 0.78);
    prisme = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: OR, metalness: 1, roughness: 0.22, flatShading: true }));
    groupe.add(prisme);
    // arêtes plus claires
    groupe.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: OR_CLAIR, transparent: true, opacity: 0.55 })));
    // lueur intérieure
    coeur = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: 0xffe7a8, transparent: true, opacity: 0.0 }));
    groupe.add(coeur);
    // deux anneaux fins qui tournent autour
    [[1.95, 1.1, 0.3], [2.35, -0.5, 1.2]].forEach(([r, rx, rz]) => {
      const a = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 6, 160), new THREE.MeshBasicMaterial({ color: OR, transparent: true, opacity: 0.6 }));
      a.rotation.set(rx, 0, rz); scene.add(a); anneaux.push(a);
    });
    // six éclats qui gravitent (les cinq terres et la région cachée)
    for (let i = 0; i < 6; i++) {
      const e = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09 + (i % 3) * 0.03, 0), new THREE.MeshStandardMaterial({ color: OR, metalness: 1, roughness: 0.3, flatShading: true }));
      e.userData = { r: 2.0 + (i % 2) * 0.4, a: i / 6 * Math.PI * 2, h: (i % 3 - 1) * 0.5, w: 0.25 + i * 0.03 };
      scene.add(e); eclats.push(e);
    }
    // poussière d'or
    const n = 220, P = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const r = 2.5 + Math.random() * 5, a = Math.random() * Math.PI * 2; P[i * 3] = Math.cos(a) * r; P[i * 3 + 1] = (Math.random() - 0.5) * 7; P[i * 3 + 2] = Math.sin(a) * r - 2; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(P, 3));
    poussiere = new THREE.Points(pg, new THREE.PointsMaterial({ color: OR, size: 0.03, transparent: true, opacity: 0.7, depthWrite: false }));
    scene.add(poussiere);
    // lumières : une chaude devant, une froide derrière pour dessiner les arêtes
    const l1 = new THREE.DirectionalLight(0xfff1d0, 2.2); l1.position.set(3, 4, 5); scene.add(l1);
    const l2 = new THREE.DirectionalLight(0x8899ff, 0.6); l2.position.set(-4, -2, -3); scene.add(l2);
    scene.add(new THREE.AmbientLight(0x221a10, 1));

    commandes();
    new ResizeObserver(ajuster).observe(el); ajuster();
    let dernier = performance.now();
    rendu.setAnimationLoop(now => { const dt = Math.min(0.05, (now - dernier) / 1000); dernier = now; if (mode !== 'off' && !document.hidden) dessiner(dt); });
    return true;
  }

  // une « pièce » floue en dégradé, que le métal reflète (sans elle, l'or paraîtrait noir)
  function reflets() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d'), d = x.createLinearGradient(0, 0, 0, 256);
    d.addColorStop(0, '#3a2a12'); d.addColorStop(0.45, '#fff2cc'); d.addColorStop(0.55, '#a07a34'); d.addColorStop(1, '#050403');
    x.fillStyle = d; x.fillRect(0, 0, 512, 256);
    x.fillStyle = 'rgba(255,248,225,.9)'; x.fillRect(60, 70, 70, 26); x.fillRect(330, 90, 110, 18);
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.sRGBEncoding;
    const pm = new THREE.PMREMGenerator(rendu), env = pm.fromEquirectangular(t).texture; pm.dispose(); t.dispose();
    return env;
  }

  function ajuster() {
    const r = hote.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    rendu.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  }

  function dessiner(dt) {
    V.t += dt;
    if (!calme) V.lacet += dt * 0.25;
    V.lacet += V.vL; V.tangage = Math.max(-0.8, Math.min(0.8, V.tangage + V.vT)); V.vL *= 0.92; V.vT *= 0.92;
    V.dist += (V.cible - V.dist) * Math.min(1, dt * 6);
    // écran d'entrée : le Prisme au centre, un peu haut (le logo est dessous)
    // page Accueil : à droite sur grand écran, en haut sur téléphone
    const large = camera.aspect > 1.1, k = Math.min(1, dt * 3.5);
    const bx = mode === 'accueil' && large ? -Math.min(3.1, camera.aspect * 1.3) : 0;
    const by = mode === 'entree' ? (large ? -0.75 : -1.0) : (large ? 0 : -3.5);   // téléphone : plus haut, au-dessus du texte
    cam.x += (bx - cam.x) * k; cam.y += (by - cam.y) * k;
    camera.position.set(cam.x, 0.2 + cam.y, V.dist); camera.lookAt(cam.x, cam.y, 0);
    groupe.rotation.set(V.tangage, V.lacet, 0);
    groupe.position.y = calme ? 0 : Math.sin(V.t * 0.8) * 0.06;
    V.pulse = Math.max(0, V.pulse - dt * 1.5);
    coeur.material.opacity = 0.18 + 0.12 * Math.sin(V.t * 1.6) + V.pulse * 0.6;
    coeur.scale.setScalar(1 + V.pulse * 0.6);
    anneaux.forEach((a, i) => { a.rotation.y += dt * (i ? -0.12 : 0.09); });
    eclats.forEach(e => { const u = e.userData; u.a += dt * u.w * (calme ? 0 : 1); e.position.set(Math.cos(u.a) * u.r, u.h + Math.sin(u.a * 2) * 0.15, Math.sin(u.a) * u.r); e.rotation.x += dt; e.rotation.y += dt * 0.7; });
    poussiere.rotation.y += dt * 0.02;
    rendu.render(scene, camera);
  }

  function commandes() {
    const cv = rendu.domElement, doigts = new Map(); let prec = null, pince = null, bouge = 0;
    cv.addEventListener('pointerdown', e => { doigts.set(e.pointerId, { x: e.clientX, y: e.clientY }); prec = { x: e.clientX, y: e.clientY }; bouge = 0; if (doigts.size === 2) { const [a, b] = [...doigts.values()]; pince = { d: Math.hypot(a.x - b.x, a.y - b.y), z: V.cible }; } try { cv.setPointerCapture(e.pointerId); } catch (x) { /* */ } });
    cv.addEventListener('pointermove', e => {
      if (!doigts.has(e.pointerId)) return; doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (doigts.size === 2 && pince) { const [a, b] = [...doigts.values()]; zoomer(pince.z * pince.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), true); bouge = 99; return; }
      if (!prec) return; const dx = e.clientX - prec.x, dy = e.clientY - prec.y; prec = { x: e.clientX, y: e.clientY }; bouge += Math.abs(dx) + Math.abs(dy);
      V.vL = dx * 0.006; V.vT = dy * 0.004;
    });
    const fin = e => { doigts.delete(e.pointerId); if (doigts.size < 2) pince = null; if (!doigts.size) { if (bouge < 6 && e.type === 'pointerup') V.pulse = 1; prec = null; } };
    cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
    cv.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); zoomer(V.cible * Math.exp(e.deltaY * 0.004), true); }, { passive: false });
    cv.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') V.vL = -0.08; else if (e.key === 'ArrowRight') V.vL = 0.08; else if (e.key === 'ArrowUp') V.vT = -0.05; else if (e.key === 'ArrowDown') V.vT = 0.05; else if (e.key === 'Enter' || e.key === ' ') V.pulse = 1; else return; e.preventDefault(); });
  }
  function zoomer(z, abs) { V.cible = Math.max(5, Math.min(20, abs ? z : V.cible * z)); }

  // 'entree', 'accueil' ou 'off' (rien n'est dessiné : économise la batterie)
  function choisirMode(m) {
    mode = m; if (!camera || m === 'off') return;
    const large = camera.aspect > 1.1;
    V.cible = m === 'entree' ? (large ? 8.8 : 12) : (large ? 8.4 : 20);   // téléphone : plus petit, il laisse la place au texte
  }
  return { init, zoomer: f => zoomer(f), mode: choisirMode };
})();
