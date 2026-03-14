import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useScrollPhysics } from '../hooks/useScrollPhysics';
import { menuItems } from '../data/menuItems';
import MenuCard from './MenuCard';

// ─── Layout constants ───────────────────────────────────────────────
const CARD_HEIGHT = 84;
const CARD_GAP = 14;
const VISIBLE_PADDING = 3; // render N extra cards outside viewport

const ScrollMenu: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  const {
    scrollY,
    focusedIndex,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onWheel,
    goToIndex,
  } = useScrollPhysics(menuItems.length, CARD_HEIGHT, CARD_GAP);

  const stride = CARD_HEIGHT + CARD_GAP;

  // Measure container
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ─── Touch event handlers ─────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    onTouchStart(e.touches[0].clientY);
  }, [onTouchStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    onTouchMove(e.touches[0].clientY);
  }, [onTouchMove]);

  const handleTouchEnd = useCallback(() => {
    onTouchEnd();
  }, [onTouchEnd]);

  // Mouse drag support
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onTouchStart(e.clientY);

    const moveHandler = (ev: MouseEvent) => onTouchMove(ev.clientY);
    const upHandler = () => {
      onTouchEnd();
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
    };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  // Wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    onWheel(e.deltaY);
  }, [onWheel]);

  // Prevent default touch behavior on the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, []);

  // ─── Compute visible cards ──────────────────────────────────────
  const halfView = containerHeight / 2;
  const visibleCards = menuItems.map((item, index) => {
    const cardCenterY = index * stride;
    const offsetFromCenter = cardCenterY - scrollY;

    // Cull cards far outside viewport
    if (Math.abs(offsetFromCenter) > halfView + stride * VISIBLE_PADDING) {
      return null;
    }

    return (
      <MenuCard
        key={item.id}
        item={item}
        offsetFromCenter={offsetFromCenter}
        cardHeight={CARD_HEIGHT}
        stride={stride}
        onClick={() => goToIndex(index)}
      />
    );
  });

  const focusedItem = menuItems[focusedIndex];

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Animated background glow */}
      <div
        className="absolute inset-0 transition-colors duration-700 ease-out"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% 50%, ${focusedItem?.color ?? '#8b5cf6'}12 0%, transparent 70%),
            radial-gradient(ellipse 60% 80% at 30% 20%, rgba(139, 92, 246, 0.04) 0%, transparent 50%),
            radial-gradient(ellipse 60% 80% at 70% 80%, rgba(59, 130, 246, 0.04) 0%, transparent 50%)
          `,
        }}
      />

      {/* Center line indicator */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[88px] pointer-events-none z-0">
        <div className="absolute inset-y-0 left-3 w-px bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />
        <div className="absolute inset-y-0 right-3 w-px bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />
      </div>

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="relative w-full h-full cursor-grab active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
      >
        {visibleCards}
      </div>

      {/* Top / bottom fade overlays */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#0a0a14] to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a14] to-transparent pointer-events-none z-20" />

      {/* Scroll position indicator dots */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-30">
        {menuItems.map((item, i) => (
          <button
            key={item.id}
            onClick={() => goToIndex(i)}
            className="w-1.5 rounded-full transition-all duration-300"
            style={{
              height: i === focusedIndex ? 16 : 6,
              background: i === focusedIndex ? item.color : 'rgba(255,255,255,0.15)',
              boxShadow: i === focusedIndex ? `0 0 8px ${item.color}60` : 'none',
            }}
            aria-label={`Go to ${item.title}`}
          />
        ))}
      </div>
    </div>
  );
};

export default ScrollMenu;
