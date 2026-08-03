'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export type BuilderSelectOption = {
  value: string;
  label: string;
  /** Optional public image path shown beside the label. */
  iconSrc?: string;
};

export function BuilderSelect({
  value,
  options,
  onChangeAction,
  'aria-label': ariaLabel,
}: {
  value: string;
  options: BuilderSelectOption[];
  onChangeAction: (value: string) => void;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    openUp: boolean;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? value;

  const updatePosition = () => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 180 && rect.top > spaceBelow;
    setMenuPos({
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updatePosition();
    const onReposition = () => updatePosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative w-full" ref={rootRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-1 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs text-black hover:bg-gray-100"
      >
        <span className="flex min-w-0 items-center gap-2 text-left">
          {selected?.iconSrc ? (
            <img
              src={selected.iconSrc}
              alt=""
              className="h-4 w-4 shrink-0 object-contain"
              width={16}
              height={16}
            />
          ) : null}
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[80] max-h-56 overflow-y-auto rounded-lg border border-[#e6e6e6] bg-white shadow"
            style={{
              left: menuPos.left,
              width: menuPos.width,
              ...(menuPos.openUp
                ? { bottom: window.innerHeight - menuPos.top, top: 'auto' }
                : { top: menuPos.top }),
            }}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChangeAction(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-xs first:rounded-t-lg last:rounded-b-lg hover:bg-gray-100 ${
                  option.value === value
                    ? 'font-semibold text-[#0a61d7]'
                    : 'text-gray-700'
                }`}
              >
                {option.iconSrc ? (
                  <img
                    src={option.iconSrc}
                    alt=""
                    className="h-4 w-4 shrink-0 object-contain"
                    width={16}
                    height={16}
                  />
                ) : null}
                <span className="truncate">{option.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
