import { useRef, useCallback, useEffect, useState } from 'react';

// ─── Physics tuning variables ───────────────────────────────────────
export const PHYSICS = {
  // Spring snapping
  SPRING_STIFFNESS: 0.12,       // How aggressively snap pulls toward target (0.05–0.2)
  SPRING_DAMPING: 0.78,         // Damping ratio — 1.0 = critically damped (0.6–0.95)

  // Inertia / momentum
  INERTIA_DECAY: 0.94,          // Velocity multiplier each frame (0.90–0.97) — higher = more glide
  VELOCITY_SCALE: 1.0,          // Amplify flick velocity
  MIN_VELOCITY: 0.3,            // Below this, snap immediately (px/frame)

  // Scroll feel
  OVERSCROLL_RESISTANCE: 0.35,  // Rubber-band factor at edges (0–1)
  SNAP_THRESHOLD: 0.5,          // Fraction of card height to trigger next card

  // Touch
  TOUCH_MULTIPLIER: 1.0,        // Scale raw touch delta
  VELOCITY_SAMPLES: 5,          // Number of recent samples for velocity averaging
} as const;

interface ScrollState {
  position: number;       // current scroll offset (px)
  velocity: number;       // current velocity (px/frame)
  targetIndex: number;    // card index we're snapping toward
}

export function useScrollPhysics(itemCount: number, cardHeight: number, gap: number) {
  const stateRef = useRef<ScrollState>({
    position: 0,
    velocity: 0,
    targetIndex: 0,
  });

  const rafRef = useRef<number>(0);
  const isDragging = useRef(false);
  const lastTouchY = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const isAnimating = useRef(false);
  const velocitySamples = useRef<{ delta: number; time: number }[]>([]);

  const [scrollY, setScrollY] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const stride = cardHeight + gap;
  const maxScroll = (itemCount - 1) * stride;

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

  const getClosestIndex = useCallback((pos: number) => {
    return Math.round(clamp(pos, 0, maxScroll) / stride);
  }, [maxScroll, stride]);

  const getTargetPosition = useCallback((index: number) => {
    return index * stride;
  }, [stride]);

  // ─── Animation loop ─────────────────────────────────────────────
  const animate = useCallback(() => {
    const s = stateRef.current;

    if (isDragging.current) {
      // While dragging, just render current position
      setScrollY(s.position);
      setFocusedIndex(getClosestIndex(s.position));
      rafRef.current = requestAnimationFrame(animate);
      return;
    }

    const targetPos = getTargetPosition(s.targetIndex);
    const distance = targetPos - s.position;

    // Spring force
    const springForce = distance * PHYSICS.SPRING_STIFFNESS;
    s.velocity += springForce;
    s.velocity *= PHYSICS.SPRING_DAMPING;

    s.position += s.velocity;

    // Settle detection
    if (Math.abs(s.velocity) < 0.05 && Math.abs(distance) < 0.5) {
      s.position = targetPos;
      s.velocity = 0;
      isAnimating.current = false;
      setScrollY(s.position);
      setFocusedIndex(s.targetIndex);
      return; // stop loop
    }

    setScrollY(s.position);
    setFocusedIndex(getClosestIndex(s.position));
    rafRef.current = requestAnimationFrame(animate);
  }, [getClosestIndex, getTargetPosition]);

  const startAnimation = useCallback(() => {
    if (!isAnimating.current) {
      isAnimating.current = true;
      rafRef.current = requestAnimationFrame(animate);
    }
  }, [animate]);

  // ─── Calculate flick velocity from recent samples ───────────────
  const calcFlickVelocity = useCallback(() => {
    const samples = velocitySamples.current;
    if (samples.length < 2) return 0;

    // Use last N samples
    const recent = samples.slice(-PHYSICS.VELOCITY_SAMPLES);
    let totalDelta = 0;
    let totalTime = 0;

    for (let i = 1; i < recent.length; i++) {
      totalDelta += recent[i].delta;
      totalTime += recent[i].time - recent[i - 1].time;
    }

    if (totalTime === 0) return 0;
    // Convert to px/frame (~16ms)
    return (totalDelta / totalTime) * 16 * PHYSICS.VELOCITY_SCALE;
  }, []);

  // ─── Inertia phase → find snap target ──────────────────────────
  const release = useCallback(() => {
    const s = stateRef.current;
    let vel = calcFlickVelocity();

    // Project where inertia would take us
    let projected = s.position;
    let v = vel;
    while (Math.abs(v) > PHYSICS.MIN_VELOCITY) {
      projected += v;
      v *= PHYSICS.INERTIA_DECAY;
    }

    // Clamp and find closest index
    projected = clamp(projected, 0, maxScroll);
    const targetIdx = getClosestIndex(projected);

    s.targetIndex = targetIdx;
    s.velocity = vel;

    startAnimation();
  }, [calcFlickVelocity, getClosestIndex, maxScroll, startAnimation, clamp]);

  // ─── Touch handlers ─────────────────────────────────────────────
  const onTouchStart = useCallback((clientY: number) => {
    isDragging.current = true;
    lastTouchY.current = clientY;
    touchStartY.current = clientY;
    touchStartTime.current = performance.now();
    velocitySamples.current = [];

    const s = stateRef.current;
    s.velocity = 0; // kill any in-flight animation

    startAnimation();
  }, [startAnimation]);

  const onTouchMove = useCallback((clientY: number) => {
    if (!isDragging.current) return;

    const now = performance.now();
    const deltaY = (lastTouchY.current - clientY) * PHYSICS.TOUCH_MULTIPLIER;
    lastTouchY.current = clientY;

    const s = stateRef.current;
    let newPos = s.position + deltaY;

    // Rubber-band at edges
    if (newPos < 0) {
      newPos = newPos * PHYSICS.OVERSCROLL_RESISTANCE;
    } else if (newPos > maxScroll) {
      const over = newPos - maxScroll;
      newPos = maxScroll + over * PHYSICS.OVERSCROLL_RESISTANCE;
    }

    s.position = newPos;

    velocitySamples.current.push({ delta: deltaY, time: now });
    // Keep only recent samples
    if (velocitySamples.current.length > PHYSICS.VELOCITY_SAMPLES * 2) {
      velocitySamples.current = velocitySamples.current.slice(-PHYSICS.VELOCITY_SAMPLES);
    }
  }, [maxScroll]);

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    release();
  }, [release]);

  // ─── Mouse wheel support ────────────────────────────────────────
  const onWheel = useCallback((deltaY: number) => {
    const s = stateRef.current;

    // Determine direction: scroll to next/prev card
    const direction = deltaY > 0 ? 1 : -1;
    const currentIdx = getClosestIndex(s.position);
    const nextIdx = clamp(currentIdx + direction, 0, itemCount - 1);

    s.targetIndex = nextIdx;
    startAnimation();
  }, [getClosestIndex, itemCount, startAnimation, clamp]);

  // Navigate to specific index
  const goToIndex = useCallback((index: number) => {
    const s = stateRef.current;
    s.targetIndex = clamp(index, 0, itemCount - 1);
    startAnimation();
  }, [itemCount, startAnimation, clamp]);

  // ─── Keyboard support ───────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIdx = clamp(stateRef.current.targetIndex + 1, 0, itemCount - 1);
        stateRef.current.targetIndex = nextIdx;
        startAnimation();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevIdx = clamp(stateRef.current.targetIndex - 1, 0, itemCount - 1);
        stateRef.current.targetIndex = prevIdx;
        startAnimation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [itemCount, startAnimation, clamp]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    scrollY,
    focusedIndex,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onWheel,
    goToIndex,
  };
}
