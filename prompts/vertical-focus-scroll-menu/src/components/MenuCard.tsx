import React, { useMemo } from 'react';
import type { MenuItem } from '../data/menuItems';

// ─── Visual tuning ──────────────────────────────────────────────────
const VISUAL = {
  FOCUS_SCALE: 1.08,
  MIN_SCALE: 0.72,
  MAX_BLUR: 6,        // px
  MIN_OPACITY: 0.3,
  DEPTH_RANGE: 2.5,   // how many cards away until min values
  GLOW_INTENSITY: 0.6,
  GLOW_SPREAD: 28,    // px
} as const;

interface MenuCardProps {
  item: MenuItem;
  offsetFromCenter: number; // in px, signed
  cardHeight: number;
  stride: number; // cardHeight + gap
  onClick: () => void;
}

const MenuCard: React.FC<MenuCardProps> = React.memo(({
  item,
  offsetFromCenter,
  cardHeight,
  stride,
  onClick,
}) => {
  const styles = useMemo(() => {
    const normalizedDist = Math.abs(offsetFromCenter) / (stride * VISUAL.DEPTH_RANGE);
    const t = Math.min(normalizedDist, 1); // 0 = center, 1 = far away

    // Smooth easing curve
    const ease = t * t;

    const scale = VISUAL.FOCUS_SCALE - (VISUAL.FOCUS_SCALE - VISUAL.MIN_SCALE) * ease;
    const blur = VISUAL.MAX_BLUR * ease;
    const opacity = 1 - (1 - VISUAL.MIN_OPACITY) * ease;

    // Neon glow only when close to center
    const glowOpacity = Math.max(0, VISUAL.GLOW_INTENSITY * (1 - t * 3));

    return {
      transform: `translate3d(0, 0, 0) scale(${scale.toFixed(4)})`,
      filter: blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : 'none',
      opacity,
      glowOpacity,
      isFocused: t < 0.15,
    };
  }, [offsetFromCenter, stride]);

  return (
    <div
      className="absolute left-0 right-0 mx-auto will-change-transform"
      style={{
        height: cardHeight,
        top: `calc(50% + ${offsetFromCenter}px - ${cardHeight / 2}px)`,
        transform: styles.transform,
        filter: styles.filter,
        opacity: styles.opacity,
        zIndex: styles.isFocused ? 10 : 5 - Math.min(Math.abs(Math.round(offsetFromCenter / stride)), 5),
      }}
      onClick={onClick}
      role="button"
      tabIndex={-1}
      aria-label={item.title}
    >
      {/* Neon glow layer */}
      <div
        className="absolute -inset-3 rounded-3xl transition-opacity duration-200 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, ${item.color}44 0%, ${item.color}00 70%)`,
          boxShadow: styles.glowOpacity > 0.01
            ? `0 0 ${VISUAL.GLOW_SPREAD}px ${item.color}${Math.round(styles.glowOpacity * 99).toString(16).padStart(2, '0')},
               0 0 ${VISUAL.GLOW_SPREAD * 2}px ${item.color}${Math.round(styles.glowOpacity * 40).toString(16).padStart(2, '0')},
               inset 0 0 ${VISUAL.GLOW_SPREAD / 2}px ${item.color}${Math.round(styles.glowOpacity * 30).toString(16).padStart(2, '0')}`
            : 'none',
          opacity: styles.glowOpacity,
        }}
      />

      {/* Glass card */}
      <div
        className="relative h-full rounded-2xl overflow-hidden border cursor-pointer select-none"
        style={{
          background: styles.isFocused
            ? `linear-gradient(135deg, ${item.gradient[0]}18 0%, ${item.gradient[1]}10 100%)`
            : 'rgba(255, 255, 255, 0.04)',
          borderColor: styles.isFocused
            ? `${item.color}55`
            : 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
        }}
      >
        {/* Inner content */}
        <div className="flex items-center h-full px-5 gap-4">
          {/* Icon container */}
          <div
            className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
            style={{
              background: styles.isFocused
                ? `linear-gradient(135deg, ${item.gradient[0]}40, ${item.gradient[1]}25)`
                : 'rgba(255, 255, 255, 0.06)',
              boxShadow: styles.isFocused
                ? `0 0 20px ${item.color}20`
                : 'none',
            }}
          >
            {item.icon}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <h3
              className="text-lg font-semibold tracking-tight truncate"
              style={{
                color: styles.isFocused ? '#fff' : 'rgba(255, 255, 255, 0.6)',
              }}
            >
              {item.title}
            </h3>
            <p
              className="text-sm truncate mt-0.5"
              style={{
                color: styles.isFocused
                  ? `${item.color}`
                  : 'rgba(255, 255, 255, 0.3)',
              }}
            >
              {item.subtitle}
            </p>
          </div>

          {/* Arrow indicator */}
          <div
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
            style={{
              background: styles.isFocused
                ? `${item.color}25`
                : 'rgba(255, 255, 255, 0.04)',
              transform: styles.isFocused ? 'scale(1)' : 'scale(0.8)',
              opacity: styles.isFocused ? 1 : 0.4,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              style={{ color: styles.isFocused ? item.color : 'rgba(255,255,255,0.4)' }}
            >
              <path
                d="M5 3L9 7L5 11"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Top highlight line */}
        {styles.isFocused && (
          <div
            className="absolute top-0 left-4 right-4 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${item.color}60, transparent)`,
            }}
          />
        )}
      </div>
    </div>
  );
});

MenuCard.displayName = 'MenuCard';

export default MenuCard;
