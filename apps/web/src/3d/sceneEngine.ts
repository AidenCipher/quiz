import gsap from 'gsap';
import {
  AmbientLight,
  BackSide,
  CanvasTexture,
  ConeGeometry,
  DataTexture,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RedFormat,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const INK = 0x1a1033;
const COLORS = {
  coral: 0xff6b81,
  sky: 0x5ac8fa,
  sun: 0xffd23f,
  mint: 0x6ee7a0,
  lilac: 0xc9a0ff,
  lilacDark: 0xa974f0,
  belly: 0xbff5c3,
  orange: 0xff8a3d,
  pink: 0xff7ab8,
};

export interface HeroSceneOptions {
  /** Called when the owl is clicked or tapped. */
  onOwlClick?: () => void;
  /** Called with the shape that was clicked (for a sound or a callout). */
  onShapeClick?: (shape: 'triangle' | 'diamond' | 'circle' | 'square') => void;
  reducedMotion: boolean;
  /** Text drawn on the floating question card. */
  question: string;
}

export interface HeroSceneHandle {
  /** Make the owl react (squash, then settle). Used by the "Roast me" button too. */
  poke(): void;
  dispose(): void;
}

/** True when a WebGL context can be created (some locked-down browsers and VMs cannot). */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const toonRamp = (): DataTexture => {
  const data = new Uint8Array([90, 170, 255]); // three-step shading: the cartoon look
  const t = new DataTexture(data, 3, 1, RedFormat);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
};

export function createHeroScene(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  opts: HeroSceneOptions,
): HeroSceneHandle {
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => (disposables.push(d), d);

  const renderer = track(
    new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }),
  );
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 0.6, 11);

  /* ---- lights: the key light follows the pointer ---- */
  scene.add(track(new HemisphereLight(0xffffff, 0x7a54d6, 1.5)) as unknown as Object3D);
  scene.add(new AmbientLight(0xffffff, 0.35));
  const key = new DirectionalLight(0xffffff, 2.6);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new DirectionalLight(COLORS.pink, 1.6);
  rim.position.set(-5, 2, -3);
  scene.add(rim);

  const ramp = track(toonRamp());
  const outlineMat = track(new MeshBasicMaterial({ color: INK, side: BackSide }));
  const toon = (color: number) => track(new MeshToonMaterial({ color, gradientMap: ramp }));

  /** A toon mesh with a thick ink outline (inverted-hull trick), grouped so it can be scaled as one. */
  const solid = (geo: BufferGeometry, color: number, outline = 1.07): Group => {
    track(geo);
    const g = new Group();
    g.add(new Mesh(geo, toon(color)));
    const hull = new Mesh(geo, outlineMat);
    hull.scale.setScalar(outline);
    g.add(hull);
    return g;
  };

  const rig = new Group(); // everything draggable lives in here
  scene.add(rig);

  /* ---- chunky shapes ---- */
  const roundedTriangle = () => {
    const s = new Shape();
    const r = 0.18;
    s.moveTo(-0.7, -0.5 + r);
    s.quadraticCurveTo(-0.7, -0.5, -0.7 + r * 1.4, -0.5);
    s.lineTo(0.7 - r * 1.4, -0.5);
    s.quadraticCurveTo(0.7, -0.5, 0.7 - r * 0.4, -0.5 + r * 1.3);
    s.lineTo(r * 0.5, 0.78 - r);
    s.quadraticCurveTo(0, 0.95, -r * 0.5, 0.78 - r);
    s.lineTo(-0.7 + r * 0.4, -0.5 + r * 1.3);
    return new ExtrudeGeometry(s, {
      depth: 0.5,
      bevelEnabled: true,
      bevelSize: 0.1,
      bevelThickness: 0.12,
      bevelSegments: 4,
      curveSegments: 10,
    });
  };

  const triangle = solid(roundedTriangle(), COLORS.coral);
  triangle.position.set(-2.55, 1.35, 0.4);
  const diamond = solid(new RoundedBoxGeometry(1.15, 1.15, 0.7, 4, 0.2), COLORS.sky);
  diamond.rotation.z = Math.PI / 4;
  diamond.position.set(2.6, 1.55, 0);
  const circleGeo = new SphereGeometry(0.72, 32, 24);
  const circle = solid(circleGeo, COLORS.sun);
  circle.scale.z = 0.62;
  circle.position.set(-2.45, -1.55, 0.6);
  const square = solid(new RoundedBoxGeometry(1.2, 1.2, 0.75, 4, 0.22), COLORS.mint);
  square.position.set(2.5, -1.45, 0.3);
  const shapes: Record<'triangle' | 'diamond' | 'circle' | 'square', Group> = { triangle, diamond, circle, square };
  const baseScale = new Map<Group, Vector3>();
  for (const g of Object.values(shapes)) {
    rig.add(g);
    baseScale.set(g, g.scale.clone());
  }

  /* ---- floating question card, text drawn on a canvas ---- */
  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = 1024;
  cardCanvas.height = 576;
  const drawCard = () => {
    const c = cardCanvas.getContext('2d')!;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 1024, 576);
    c.fillStyle = '#1a1033';
    c.font = '800 66px "Bricolage Grotesque Variable", system-ui, sans-serif';
    c.textBaseline = 'top';
    const words = opts.question.split(' ');
    let line = '';
    let y = 70;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (c.measureText(test).width > 900 && line) {
        c.fillText(line, 62, y);
        line = w;
        y += 82;
      } else line = test;
    }
    c.fillText(line, 62, y);
    c.fillStyle = '#4d4670';
    c.font = '700 40px "Inter Variable", system-ui, sans-serif';
    c.fillText('Question 3 of 15  ·  14s', 62, 470);
    c.fillStyle = '#c9a0ff';
    c.beginPath();
    c.arc(930, 504, 40, 0, Math.PI * 2);
    c.fill();
  };
  drawCard();
  const cardTex = track(new CanvasTexture(cardCanvas)) as CanvasTexture;
  cardTex.colorSpace = SRGBColorSpace;
  cardTex.anisotropy = 4;
  document.fonts?.ready.then(() => {
    drawCard();
    cardTex.needsUpdate = true;
    renderOnce();
  });
  const card = new Group();
  const cardBody = new Mesh(track(new RoundedBoxGeometry(3.3, 1.85, 0.16, 4, 0.1)), [
    toon(0xffffff),
    toon(0xffffff),
    toon(0xffffff),
    toon(0xffffff),
    track(new MeshBasicMaterial({ map: cardTex })),
    toon(0xf2ecff),
  ]);
  const cardOutline = new Mesh(cardBody.geometry, outlineMat);
  cardOutline.scale.set(1.03, 1.05, 1.5);
  card.add(cardBody, cardOutline);
  card.position.set(0, 2.15, -1.0);
  card.rotation.set(-0.06, 0, -0.05);
  rig.add(card);

  /* ---- Hoot the owl ---- */
  const owl = new Group();
  const body = solid(new SphereGeometry(1.05, 40, 32), COLORS.lilac, 1.05);
  body.scale.set(1, 1.08, 0.95);
  const belly = new Mesh(track(new SphereGeometry(0.66, 32, 24)), toon(COLORS.belly));
  belly.position.set(0, -0.28, 0.62);
  belly.scale.set(1, 1.05, 0.55);
  const eyes: { white: Mesh; pupil: Mesh }[] = [-1, 1].map((side) => {
    const white = new Mesh(track(new SphereGeometry(0.3, 28, 20)), toon(0xffffff));
    white.position.set(side * 0.38, 0.32, 0.8);
    const rim2 = new Mesh(white.geometry, outlineMat);
    rim2.scale.setScalar(1.12);
    white.add(rim2);
    const pupil = new Mesh(track(new SphereGeometry(0.14, 20, 16)), track(new MeshBasicMaterial({ color: INK })));
    pupil.position.set(0, 0, 0.26);
    white.add(pupil);
    return { white, pupil };
  });
  const beak = solid(new ConeGeometry(0.17, 0.34, 20), COLORS.sun, 1.12);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.0, 1.02);
  const ears = [-1, 1].map((side) => {
    const ear = solid(new ConeGeometry(0.28, 0.6, 4), COLORS.lilacDark, 1.1);
    ear.position.set(side * 0.62, 1.0, 0.1);
    ear.rotation.z = -side * 0.5;
    return ear;
  });
  const hat = solid(new ConeGeometry(0.34, 0.8, 24), COLORS.sun, 1.1);
  hat.position.set(0, 1.28, 0.1);
  hat.rotation.z = 0.12;
  const pom = new Mesh(track(new SphereGeometry(0.11, 16, 12)), toon(COLORS.pink));
  pom.position.set(0.03, 0.46, 0);
  hat.add(pom);
  const wings = [-1, 1].map((side) => {
    const w = solid(new SphereGeometry(0.34, 20, 16), COLORS.lilacDark, 1.1);
    w.scale.set(0.55, 1.1, 0.6);
    w.position.set(side * 1.0, -0.15, 0.1);
    w.rotation.z = side * 0.35;
    return w;
  });
  owl.add(body, belly, beak, hat, ...ears, ...wings, ...eyes.map((e) => e.white));
  owl.position.set(0, -0.75, 0.8);
  owl.scale.setScalar(1.6);
  rig.add(owl);

  /* ---- soft shadow under everything ---- */
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const sc = shadowCanvas.getContext('2d')!;
  const grad = sc.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(26,16,51,0.55)');
  grad.addColorStop(1, 'rgba(26,16,51,0)');
  sc.fillStyle = grad;
  sc.fillRect(0, 0, 128, 128);
  const shadowTex = track(new CanvasTexture(shadowCanvas)) as Texture;
  const shadow = new Mesh(
    track(new PlaneGeometry(7, 3.2)),
    track(new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -2.4, 0.3);
  scene.add(shadow);

  /* ---- interaction ---- */
  const pointer = new Vector2(0, 0); // smoothed, -1..1
  const target = new Vector2(0, 0);
  const ray = new Raycaster();
  const hover = new Map<Object3D, number>();
  let hovered: Group | null = null;
  let dragging = false;
  let lastX = 0;
  let spin = 0; // rig yaw velocity (inertia)
  let yaw = 0;
  let downOn: Group | null = null;
  let downAt = { x: 0, y: 0 };

  const pickables: [Group, 'triangle' | 'diamond' | 'circle' | 'square' | 'owl'][] = [
    [triangle, 'triangle'],
    [diamond, 'diamond'],
    [circle, 'circle'],
    [square, 'square'],
    [owl, 'owl'],
  ];
  const pick = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(
      new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1),
      camera,
    );
    for (const [group, name] of pickables) {
      if (ray.intersectObject(group, true).length) return { group, name };
    }
    return null;
  };

  const squash = (g: Group, strength = 0.28) => {
    const base = baseScale.get(g) ?? g.scale.clone();
    gsap.killTweensOf(g.scale);
    gsap
      .timeline()
      .to(g.scale, { x: base.x * (1 + strength), y: base.y * (1 - strength), duration: 0.09, ease: 'power2.out' })
      .to(g.scale, { x: base.x, y: base.y, z: base.z, duration: 0.7, ease: 'elastic.out(1.1, 0.35)' });
  };

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    target.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    if (dragging) {
      spin = (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
      return;
    }
    const hit = e.pointerType === 'mouse' ? pick(e.clientX, e.clientY) : null;
    hovered = hit && hit.name !== 'owl' ? hit.group : null;
    canvas.style.cursor = hit ? 'pointer' : 'grab';
  };
  const onDown = (e: PointerEvent) => {
    downAt = { x: e.clientX, y: e.clientY };
    const hit = pick(e.clientX, e.clientY);
    downOn = hit ? hit.group : null;
    dragging = !hit;
    lastX = e.clientX;
    if (dragging) canvas.style.cursor = 'grabbing';
  };
  const onUp = (e: PointerEvent) => {
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    dragging = false;
    canvas.style.cursor = 'grab';
    if (!downOn || moved > 8) return;
    const hit = pick(e.clientX, e.clientY);
    if (!hit || hit.group !== downOn) return;
    if (hit.name === 'owl') {
      squash(owl, 0.22);
      gsap.fromTo(owl.rotation, { z: -0.25 }, { z: 0, duration: 0.9, ease: 'elastic.out(1, 0.3)' });
      opts.onOwlClick?.();
    } else {
      squash(hit.group, 0.35);
      gsap.to(hit.group.rotation, { y: hit.group.rotation.y + Math.PI * 2, duration: 0.95, ease: 'power3.out' });
      opts.onShapeClick?.(hit.name);
    }
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', () => {
    target.set(0, 0);
    hovered = null;
  });

  /* ---- sizing: fit the whole scene at any aspect ratio ---- */
  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const narrow = camera.aspect < 1.15;
    camera.position.z = narrow ? 12.5 + (1.15 - camera.aspect) * 9 : 12.5;
    camera.updateProjectionMatrix();
    renderOnce();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /* ---- intro: everything drops in with a bounce ---- */
  const introTargets: [Object3D, number][] = [
    [card, 0],
    [owl, 0.15],
    [triangle, 0.3],
    [diamond, 0.4],
    [circle, 0.5],
    [square, 0.6],
  ];
  if (!opts.reducedMotion) {
    for (const [obj, delay] of introTargets) {
      const y = obj.position.y;
      const s = obj.scale.clone();
      obj.position.y = y + 7;
      obj.scale.setScalar(0.01);
      gsap.to(obj.position, { y, duration: 1.3, delay, ease: 'bounce.out' });
      gsap.to(obj.scale, { x: s.x, y: s.y, z: s.z, duration: 0.6, delay, ease: 'back.out(2)' });
      gsap.from(obj.rotation, {
        z: obj.rotation.z + (Math.random() - 0.5) * 3,
        duration: 1.2,
        delay,
        ease: 'power3.out',
      });
    }
  }

  /* ---- render loop: idle float, pointer parallax, eye tracking ---- */
  let raf = 0;
  let running = false;
  let visible = true;
  const start = performance.now();
  // Adaptive quality: if frames are slow, render at lower resolution (down to 0.75x) rather than stutter.
  let lastT = performance.now();
  let slow = 0;
  let ratio = renderer.getPixelRatio();
  const frame = () => {
    const nowMs = performance.now();
    if (nowMs - lastT > 45 && running) slow++;
    else slow = Math.max(0, slow - 1);
    lastT = nowMs;
    if (slow > 12 && ratio > 0.75) {
      ratio = Math.max(0.75, ratio - 0.5);
      renderer.setPixelRatio(ratio);
      renderer.setSize(container.clientWidth, container.clientHeight, false);
      slow = 0;
    }
    const t = (nowMs - start) / 1000;
    pointer.lerp(target, 0.07);
    if (!dragging) {
      spin *= 0.94; // inertia after a fling
      yaw += spin;
      yaw *= 0.995;
      yaw += (0 - yaw) * 0.012; // slowly drifts back to the front
    } else yaw += spin;
    rig.rotation.y = yaw + pointer.x * 0.28;
    rig.rotation.x = -pointer.y * 0.12;
    camera.position.x = pointer.x * 0.6;
    camera.lookAt(0, 0.5, 0);
    key.position.set(3 + pointer.x * 5, 5 + pointer.y * 3, 6);

    if (!opts.reducedMotion) {
      triangle.position.y = 1.35 + Math.sin(t * 1.3) * 0.18;
      triangle.rotation.z = Math.sin(t * 0.9) * 0.12;
      diamond.position.y = 1.55 + Math.sin(t * 1.1 + 1) * 0.2;
      diamond.rotation.z = Math.PI / 4 + Math.sin(t * 0.8) * 0.14;
      circle.position.y = -1.55 + Math.sin(t * 1.4 + 2) * 0.16;
      square.position.y = -1.45 + Math.sin(t * 1.0 + 3) * 0.18;
      square.rotation.z = Math.sin(t * 0.7) * 0.1;
      card.position.y = 2.15 + Math.sin(t * 0.9) * 0.1;
      owl.position.y = -0.75 + Math.sin(t * 1.6) * 0.1;
    }

    // Hoot's eyes follow the pointer.
    for (const { pupil } of eyes) pupil.position.set(pointer.x * 0.09, pointer.y * 0.08, 0.26);
    owl.rotation.y = pointer.x * 0.35;
    owl.rotation.x = -pointer.y * 0.15;

    // Gentle hover lift on the shapes.
    for (const g of Object.values(shapes)) {
      const target2 = g === hovered ? 1 : 0;
      const cur = hover.get(g) ?? 0;
      const next = cur + (target2 - cur) * 0.2;
      hover.set(g, next);
      const base = baseScale.get(g)!;
      if (!gsap.isTweening(g.scale))
        g.scale.set(base.x * (1 + next * 0.12), base.y * (1 + next * 0.12), base.z * (1 + next * 0.12));
    }
    renderer.render(scene, camera);
  };
  const renderOnce = () => {
    if (!running) frame();
  };
  const loop = () => {
    raf = requestAnimationFrame(loop);
    frame();
  };
  const startLoop = () => {
    if (running || opts.reducedMotion) return;
    running = true;
    loop();
  };
  const stopLoop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  const sync = () => (visible && !document.hidden ? startLoop() : stopLoop());
  const io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    sync();
  });
  io.observe(container);
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stopLoop();
  });
  canvas.style.touchAction = 'pan-y'; // vertical scrolling still works on phones; horizontal drag spins the scene
  canvas.style.cursor = 'grab';
  resize();
  sync();
  if (opts.reducedMotion) renderOnce();

  return {
    poke() {
      squash(owl, 0.22);
      gsap.fromTo(owl.rotation, { z: 0.25 }, { z: 0, duration: 0.9, ease: 'elastic.out(1, 0.3)' });
    },
    dispose() {
      stopLoop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', sync);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      gsap.killTweensOf([...Object.values(shapes), owl, card].flatMap((o) => [o.position, o.scale, o.rotation]));
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as Material | Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      for (const d of disposables) d.dispose();
    },
  };
}
