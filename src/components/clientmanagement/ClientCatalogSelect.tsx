'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

type Option = { value: string; label: string };

type ClientCatalogSelectProps = {
  value: string;
  placeholder: string;
  options: Option[];
  /** Client-side callback. Kept unknown at the public boundary to avoid Next.js
   * misclassifying this client-to-client callback as a Server Action prop. */
  onChange: unknown;
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
  searchPlaceholder?: string;
};

/** Searchable catalog picker styled consistently with the supplier SKU/product pickers. */
export default function ClientCatalogSelect({
  value,
  placeholder,
  options,
  onChange,
  allowNone = true,
  noneLabel = 'None',
  disabled = false,
  className = '',
  searchPlaceholder = 'Search...',
}: ClientCatalogSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const emitChange = (nextValue: string) => {
    if (typeof onChange === 'function') {
      (onChange as (nextValue: string) => void)(nextValue);
    }
  };
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return options;
    return options.filter((option) => `${option.label} ${option.value}`.toLocaleLowerCase().includes(needle));
  }, [options, query]);

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.max(rect.width, 192);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const estimatedHeight = Math.min(280, 72 + Math.max(1, filtered.length + (allowNone ? 1 : 0)) * 34);
    const openAbove = rect.bottom + estimatedHeight > window.innerHeight - 8 && rect.top > estimatedHeight;
    setMenuPosition({ top: openAbove ? Math.max(8, rect.top - estimatedHeight - 4) : rect.bottom + 4, left, width });
  }, [allowNone, filtered.length]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    };
    const reposition = () => updateMenuPosition();
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, updateMenuPosition]);

  const menu = open && menuPosition ? createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] overflow-hidden rounded-lg border border-[#e6e6e6] bg-white shadow-lg"
      style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}
      role="listbox"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-[#e6e6e6] p-2">
        <div className="flex items-center gap-2 rounded-md border border-[#e6e6e6] px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full min-w-0 bg-transparent text-xs text-black outline-none placeholder:text-gray-400"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto py-1">
        {allowNone ? (
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onClick={(event) => { event.stopPropagation(); emitChange(''); setOpen(false); setQuery(''); }}
            className={`block w-full px-3 py-2 text-left text-xs hover:bg-gray-100 ${!value ? 'bg-gray-50 font-semibold text-[#0a61d7]' : 'text-gray-600'}`}
          >
            {noneLabel}
          </button>
        ) : null}
        {filtered.map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={value === option.value}
            onClick={(event) => { event.stopPropagation(); emitChange(option.value); setOpen(false); setQuery(''); }}
            className={`block w-full px-3 py-2 text-left text-xs hover:bg-gray-100 ${value === option.value ? 'bg-gray-50 font-semibold text-[#0a61d7]' : 'text-gray-700'}`}
          >
            {option.label}
          </button>
        ))}
        {filtered.length === 0 ? <div className="px-3 py-3 text-xs text-gray-500">No matching options</div> : null}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); setOpen((current) => !current); }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-left text-xs text-black transition hover:bg-gray-50 focus:border-[#0a61d7] focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className={`min-w-0 truncate ${selected ? 'text-black' : 'text-gray-500'}`}>{selected?.label || placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {menu}
    </div>
  );
}
