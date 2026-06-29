import type React from 'react';

/**
 * Base skeleton primitive — apply `skeleton-shimmer` for the Meta-style wave animation.
 * All size/shape is controlled via the `className` and `style` props.
 */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton-shimmer rounded-md ${className}`} style={style} aria-hidden />;
}
