import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export interface HomeFx {
  /** Make a sticker draggable and fling-able (with inertia), and slap it onto the page. */
  drag(el: HTMLElement, zone: HTMLElement): void;
  cleanup(): void;
}

/**
 * Home page choreography (GSAP): letters drop in and dodge the cursor, buttons are magnetic, cards tilt up out of
 * the page as you scroll, and callout stickers can be flung around. Loaded after first paint; the page is fully
 * usable (and visible) without it. Skipped entirely for reduced motion.
 */
export function initHomeFx(root: HTMLElement): HomeFx {
  gsap.registerPlugin(ScrollTrigger, Draggable, InertiaPlugin);
  gsap.ticker.lagSmoothing(0);
  let z = 10;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  const ctx = gsap.context(() => {
    root.classList.remove('fx-wait');

    /* --- hero entrance --- */
    const chars = gsap.utils.toArray<HTMLElement>('[data-ch]', root);
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from(
      chars,
      {
        yPercent: -140,
        rotation: () => gsap.utils.random(-28, 28),
        opacity: 0,
        duration: 1,
        stagger: 0.028,
        ease: 'back.out(1.8)',
      },
      0.05,
    )
      .from('.reveal', { y: 34, opacity: 0, duration: 0.7, stagger: 0.09 }, 0.2)
      .from('.hero-3d, .iso-wrap', { scale: 0.85, opacity: 0, duration: 0.9, ease: 'back.out(1.4)' }, 0.3);

    // The gradient word keeps wobbling, each letter on its own beat.
    gsap.utils.toArray<HTMLElement>('[data-ch="g"]', root).forEach((ch, i) => {
      gsap.to(ch, {
        rotation: gsap.utils.random(-5, 5),
        y: -5,
        duration: gsap.utils.random(1.1, 1.8),
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: 1.2 + i * 0.1,
      });
    });

    /* --- letters dodge the cursor --- */
    const headline = root.querySelector<HTMLElement>('[data-split]');
    if (headline && finePointer) {
      let raf = 0;
      const onMove = (e: PointerEvent) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          for (const ch of chars) {
            const r = ch.getBoundingClientRect();
            const dx = r.left + r.width / 2 - e.clientX;
            const dy = r.top + r.height / 2 - e.clientY;
            const d = Math.hypot(dx, dy) || 1;
            const reach = 130;
            if (d < reach)
              gsap.to(ch, {
                x: (dx / d) * (reach - d) * 0.5,
                y: (dy / d) * (reach - d) * 0.5,
                duration: 0.35,
                ease: 'power3.out',
                overwrite: 'auto',
              });
            else gsap.to(ch, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.35)', overwrite: 'auto' });
          }
        });
      };
      const onLeave = () =>
        gsap.to(chars, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)', overwrite: 'auto' });
      headline.addEventListener('pointermove', onMove);
      headline.addEventListener('pointerleave', onLeave);
    }

    /* --- magnetic buttons --- */
    if (finePointer) {
      gsap.utils.toArray<HTMLElement>('[data-magnetic]', root).forEach((el) => {
        const qx = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3.out' });
        const qy = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3.out' });
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          if (Math.abs(dx) < r.width / 2 + 60 && Math.abs(dy) < r.height / 2 + 60) {
            qx(dx * 0.28);
            qy(dy * 0.35);
          } else {
            qx(0);
            qy(0);
          }
        };
        window.addEventListener('pointermove', move);
        el.addEventListener('pointerleave', () => {
          gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
        });
      });
    }

    /* --- cards tilt up out of the page on scroll --- */
    gsap.utils.toArray<HTMLElement>('.step-card', root).forEach((card, i) => {
      gsap.fromTo(
        card,
        { rotateX: 55, y: 90, opacity: 0, transformPerspective: 900, transformOrigin: '50% 100%' },
        {
          rotateX: 0,
          y: 0,
          opacity: 1,
          ease: 'none',
          scrollTrigger: { trigger: card, start: 'top 92%', end: `top ${58 - i * 4}%`, scrub: 0.6 },
        },
      );
    });
    gsap.utils.toArray<HTMLElement>('[data-parallax]', root).forEach((el) => {
      gsap.to(el, {
        yPercent: Number(el.dataset.parallax) || -12,
        ease: 'none',
        scrollTrigger: { trigger: el, scrub: true, start: 'top bottom', end: 'bottom top' },
      });
    });
  }, root);

  return {
    drag(el, zone) {
      gsap.from(el, { scale: 0, rotation: gsap.utils.random(-40, 40), duration: 0.7, ease: 'back.out(2.4)' });
      Draggable.create(el, {
        type: 'x,y',
        bounds: zone,
        inertia: true,
        edgeResistance: 0.85,
        onPress() {
          gsap.to(this.target, { scale: 1.06, zIndex: ++z, duration: 0.2 });
        },
        onDrag() {
          gsap.to(this.target, { rotation: gsap.utils.clamp(-14, 14, this.deltaX * 0.9), duration: 0.2 });
        },
        onThrowUpdate() {
          gsap.to(this.target, {
            rotation: gsap.utils.clamp(-18, 18, this.deltaX * 0.9),
            duration: 0.15,
            overwrite: true,
          });
        },
        onRelease() {
          gsap.to(this.target, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
        },
      });
    },
    cleanup() {
      ctx.revert();
      ScrollTrigger.getAll().forEach((t) => t.kill());
      Draggable.zIndex = 1000;
    },
  };
}
