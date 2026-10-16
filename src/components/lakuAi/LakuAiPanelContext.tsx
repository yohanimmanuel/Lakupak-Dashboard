'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { GripVertical } from 'lucide-react';
import AutomationCopilot from '@/components/automations/AutomationCopilot';

const WIDTH_KEY = 'laku-ai-panel-width';
const DEFAULT_WIDTH = 384;
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
/** Keep this much main-column width when the panel is docked side-by-side. */
const MIN_CONTENT_WIDTH = 360;
/** Below this parent width, dock as an overlay so dashboard content is not crushed. */
const OVERLAY_PARENT_MIN = MIN_WIDTH + MIN_CONTENT_WIDTH;

type LakuAiPanelContextValue = {
  open: boolean;
  dockEmptyMessage: string | null;
  setOpen: (open: boolean) => void;
  openPanel: (options?: { dockEmptyMessage?: string | null }) => void;
  closePanel: () => void;
  togglePanel: () => void;
};

const LakuAiPanelContext = createContext<LakuAiPanelContextValue | null>(null);

export function useLakuAiPanel() {
  const ctx = useContext(LakuAiPanelContext);
  if (!ctx) {
    throw new Error('useLakuAiPanel must be used within LakuAiPanelProvider');
  }
  return ctx;
}

export function useLakuAiPanelOptional() {
  return useContext(LakuAiPanelContext);
}

function clampWidth(value: number, availableWidth?: number) {
  if (typeof window === 'undefined') {
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
  }
  const available = availableWidth ?? window.innerWidth;
  const overlay = available < OVERLAY_PARENT_MIN;
  // Overlay: cap against viewport. Docked: leave MIN_CONTENT_WIDTH for the dashboard column.
  const max = overlay
    ? Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.92))
    : Math.min(MAX_WIDTH, Math.max(0, Math.floor(available - MIN_CONTENT_WIDTH)));
  const min = Math.min(MIN_WIDTH, max);
  if (max <= 0) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readStoredWidth(availableWidth?: number) {
  if (typeof window === 'undefined') return DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(WIDTH_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_WIDTH;
  return clampWidth(Number.isFinite(parsed) ? parsed : DEFAULT_WIDTH, availableWidth);
}

export function LakuAiPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [dockEmptyMessage, setDockEmptyMessage] = useState<string | null>(null);

  const openPanel = useCallback((options?: { dockEmptyMessage?: string | null }) => {
    setDockEmptyMessage(options?.dockEmptyMessage ?? null);
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  const togglePanel = useCallback(() => {
    setOpen((current) => {
      if (current) return false;
      setDockEmptyMessage(null);
      return true;
    });
  }, []);

  const value = useMemo(
    () => ({
      open,
      dockEmptyMessage,
      setOpen,
      openPanel,
      closePanel,
      togglePanel,
    }),
    [open, dockEmptyMessage, openPanel, closePanel, togglePanel],
  );

  return <LakuAiPanelContext.Provider value={value}>{children}</LakuAiPanelContext.Provider>;
}

/** Sticky right rail for Laku AI. Place as a sibling of the main scroll area. */
export function LakuAiStickyPanel() {
  const { open, dockEmptyMessage, closePanel } = useLakuAiPanel();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [availableWidth, setAvailableWidth] = useState<number | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const availableRef = useRef<number | undefined>(undefined);
  availableRef.current = availableWidth;

  const overlay = availableWidth != null && availableWidth < OVERLAY_PARENT_MIN;

  useEffect(() => {
    const parent = asideRef.current?.parentElement;
    if (!parent) return;

    const measure = () => {
      const next = parent.clientWidth;
      availableRef.current = next;
      setAvailableWidth(next);
      setWidth((current) => clampWidth(current, next));
    };

    measure();
    setWidth(readStoredWidth(parent.clientWidth));

    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setWidth((current) => clampWidth(current, availableRef.current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = clampWidth(drag.startWidth + (drag.startX - event.clientX), availableRef.current);
      setWidth(next);
    };

    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      setWidth((current) => {
        const next = clampWidth(current, availableRef.current);
        window.localStorage.setItem(WIDTH_KEY, String(next));
        return next;
      });
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging]);

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
  };

  return (
    <>
      {open && overlay ? (
        <button
          type="button"
          className="fixed inset-0 top-16 z-20 bg-black/30"
          aria-label="Close AI panel"
          onClick={closePanel}
        />
      ) : null}
      <aside
        ref={asideRef}
        className={`flex flex-col overflow-hidden border-l border-[#e6e6e6] bg-white ${
          open
            ? overlay
              ? 'fixed bottom-0 right-0 top-16 z-30 shadow-xl'
              : 'relative h-full shrink-0'
            : 'relative h-full w-0 shrink-0 border-l-0'
        } ${dragging ? '' : 'transition-[width] duration-300 ease-in-out'}`}
        style={open ? { width } : { width: 0 }}
        aria-hidden={!open}
        inert={!open}
      >
        {open ? (
          <button
            type="button"
            onPointerDown={startDrag}
            className="absolute inset-y-0 -left-1.5 z-20 flex w-3 cursor-col-resize items-center justify-center"
            aria-label="Resize AI panel"
          >
            <span className="flex h-10 w-3.5 items-center justify-center rounded-full border border-[#e6e6e6] bg-white text-gray-400 shadow-sm">
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          </button>
        ) : null}
        <div className="flex h-full min-h-0 w-full flex-col" style={open ? { width } : undefined}>
          <AutomationCopilot
            surface="dock"
            active={open}
            dockEmptyMessage={dockEmptyMessage}
            onCloseAction={closePanel}
          />
        </div>
      </aside>
    </>
  );
}
