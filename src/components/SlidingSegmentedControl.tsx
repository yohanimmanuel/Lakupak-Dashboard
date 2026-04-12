'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type SlidingSegmentItem = { key: string; label: string };

type SlidingSegmentedControlProps = {
  items: SlidingSegmentItem[];
  value: string;
  onChange: (key: string) => void;
  /** Outer wrapper classes (e.g. max-w-md) */
  className?: string;
  /** default: ProductTable / announcements style; compact: admin user tabs */
  size?: 'default' | 'compact';
};

export default function SlidingSegmentedControl({
  items,
  value,
  onChange,
  className = '',
  size = 'default',
}: SlidingSegmentedControlProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const btnClass =
    size === 'compact'
      ? 'relative z-10 flex-1 px-3 sm:px-5 py-2 font-medium text-[13px] sm:text-[14px] transition-colors duration-200 focus:outline-none'
      : 'relative z-10 flex-1 px-4 sm:px-6 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none';

  const updateIndicator = useCallback(() => {
    const idx = items.findIndex((t) => t.key === value);
    const node = tabRefs.current[idx >= 0 ? idx : 0];
    if (node) {
      setIndicatorStyle({
        left: node.offsetLeft,
        width: node.offsetWidth,
      });
    }
  }, [items, value]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateIndicator);
      return () => window.removeEventListener('resize', updateIndicator);
    }
    const ro = new ResizeObserver(() => updateIndicator());
    ro.observe(el);
    window.addEventListener('resize', updateIndicator);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateIndicator);
    };
  }, [updateIndicator]);

  return (
    <div className={`relative w-full sm:w-auto flex items-center min-w-0 ${className}`}>
      <div
        ref={containerRef}
        className="flex w-full sm:w-auto bg-gray-100 rounded-lg overflow-hidden relative"
      >
        <div
          className="absolute top-0 h-full transition-all duration-300 ease-out pointer-events-none"
          style={{
            left: indicatorStyle.left,
            width: indicatorStyle.width,
            background: '#0a61d7',
            borderRadius: '0.75rem',
            zIndex: 1,
          }}
          aria-hidden
        />
        {items.map((tab, idx) => (
          <button
            key={tab.key}
            type="button"
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            onClick={() => onChange(tab.key)}
            className={`${btnClass} whitespace-nowrap ${
              value === tab.key ? 'text-white' : 'text-gray-700 hover:text-[#0a61d7]'
            } ${idx === 0 ? 'rounded-l-lg' : idx === items.length - 1 ? 'rounded-r-lg' : ''}`}
            style={{
              background: 'transparent',
              boxShadow: 'none',
              minWidth: 0,
              flex: 'unset',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
