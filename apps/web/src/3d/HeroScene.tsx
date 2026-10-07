import { useEffect, useRef, useState } from 'react';
import { IsoStack } from '../components/IsoStack';
import { sfx } from '../lib/sound';
import { createHeroScene, webglAvailable, type HeroSceneHandle } from './sceneEngine';

export interface HeroSceneControls {
  poke: () => void;
}

/**
 * The interactive 3D hero. It is lazy-loaded; if WebGL is missing or the scene fails, the CSS 3D stack takes over.
 * The canvas is decorative (aria-hidden): everything it does is also reachable with the "Roast someone" button.
 */
export default function HeroScene({
  onOwlClick,
  controls,
}: {
  onOwlClick: () => void;
  controls?: React.MutableRefObject<HeroSceneControls | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!box.current || !canvas.current) return;
    if (!webglAvailable()) {
      setFallback(true);
      return;
    }
    let handle: HeroSceneHandle | null = null;
    try {
      handle = createHeroScene(box.current, canvas.current, {
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        question: 'Which planet is known as the Red Planet?',
        onOwlClick: () => {
          sfx.boom();
          onOwlClick();
        },
        onShapeClick: () => sfx.pop(),
      });
      if (controls) controls.current = { poke: () => handle?.poke() };
    } catch {
      setFallback(true);
    }
    return () => {
      handle?.dispose();
      if (controls) controls.current = null;
    };
  }, []);

  if (fallback) return <IsoStack />;
  return (
    <div ref={box} className="hero-3d" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
