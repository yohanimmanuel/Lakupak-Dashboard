'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useRouter } from 'next/navigation';
import { Bell, Check, Flag, Trash2, X } from 'lucide-react';
import { usePlatformAdminInboxSocket } from '@/hooks/usePlatformAdminInboxSocket';

const ALL_NOTIFICATIONS_DIALOG_TITLE_ID = 'admin-all-notifications-dialog-title';

type ReportItem = {
  id: number;
  reasonText: string;
  reasonDetail: string | null;
  imageCount?: number;
  createdAt: string;
  isUnread: boolean;
  reportedDashboardUserId: number;
  distributorLabel: string;
  reporterLabel: string;
};

export default function AdminDistributorReportsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [allItems, setAllItems] = useState<ReportItem[]>([]);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const allNotificationsModalRef = useRef<HTMLDivElement>(null);
  const showAllModalRef = useRef(false);
  showAllModalRef.current = showAllModal;

  /** Escape, focus trap, restore focus — matches accessible dialog pattern */
  useLayoutEffect(() => {
    if (!showAllModal) return;

    const root = allNotificationsModalRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = (): HTMLElement[] => {
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
    };

    const focusInitial = () => {
      const list = getFocusable();
      (list[0] ?? root)?.focus();
    };

    const id = window.requestAnimationFrame(() => {
      focusInitial();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowAllModal(false);
        return;
      }
      if (e.key !== 'Tab' || !root) return;

      const list = getFocusable();
      if (list.length === 0) return;

      if (!root.contains(document.activeElement)) {
        e.preventDefault();
        list[0]?.focus();
        return;
      }

      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [showAllModal]);

  const fetchReports = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    try {
      const r = await fetch('/api/platform-admin/reports/distributor?limit=12');
      const j = (await r.json().catch(() => ({}))) as {
        unreadCount?: number;
        items?: ReportItem[];
        error?: string;
      };
      if (r.ok) {
        setUnreadCount(typeof j.unreadCount === 'number' ? j.unreadCount : 0);
        setItems(Array.isArray(j.items) ? j.items : []);
      }
    } catch {
      setItems([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  /** Full list for “All Notifications” modal only. Badge/unreadCount comes from fetchReports (single source of truth). */
  const fetchAllReports = useCallback(async () => {
    setLoadingAll(true);
    try {
      const r = await fetch('/api/platform-admin/reports/distributor?limit=50');
      const j = (await r.json().catch(() => ({}))) as {
        items?: ReportItem[];
      };
      if (r.ok) {
        setAllItems(Array.isArray(j.items) ? j.items : []);
      }
    } catch {
      setAllItems([]);
    } finally {
      setLoadingAll(false);
    }
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  usePlatformAdminInboxSocket(() => {
    void fetchReports({ silent: true });
    if (showAllModalRef.current) void fetchAllReports();
  });

  useEffect(() => {
    const t = setInterval(() => void fetchReports({ silent: true }), 60000);
    return () => clearInterval(t);
  }, [fetchReports]);

  useEffect(() => {
    if (open) void fetchReports();
  }, [open, fetchReports]);

  useEffect(() => {
    if (showAllModal) void fetchAllReports();
  }, [showAllModal, fetchAllReports]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const markRead = async (id: number) => {
    try {
      const r = await fetch(`/api/platform-admin/reports/distributor/${id}/read`, { method: 'PATCH' });
      if (!r.ok) return;
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, isUnread: false } : x)));
      setAllItems((prev) => prev.map((x) => (x.id === id ? { ...x, isUnread: false } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  };

  const markAllRead = async () => {
    try {
      const r = await fetch('/api/platform-admin/reports/distributor/mark-all-read', { method: 'POST' });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        console.warn('[AdminDistributorReportsBell] mark-all-read failed', r.status, j.error ?? r.statusText);
        return;
      }
      setItems((prev) => prev.map((x) => ({ ...x, isUnread: false })));
      setAllItems((prev) => prev.map((x) => ({ ...x, isUnread: false })));
      setUnreadCount(0);
    } catch (e) {
      console.warn('[AdminDistributorReportsBell] mark-all-read request failed', e);
    }
  };

  const handleClearAll = async () => {
    try {
      const r = await fetch('/api/platform-admin/reports/distributor/clear-all', { method: 'POST' });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        console.warn('[AdminDistributorReportsBell] clear-all failed', r.status, j.error ?? r.statusText);
        return;
      }
      setItems([]);
      setAllItems([]);
      setUnreadCount(0);
    } catch (e) {
      console.warn('[AdminDistributorReportsBell] clear-all request failed', e);
    }
  };

  const handleDeleteReport = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const r = await fetch(`/api/platform-admin/reports/distributor/${id}`, { method: 'DELETE' });
      if (!r.ok) return;
      void fetchReports({ silent: true });
      if (showAllModalRef.current) void fetchAllReports();
    } catch {
      /* ignore */
    }
  };

  const onRowNavigate = async (row: ReportItem) => {
    if (row.isUnread) await markRead(row.id);
    setOpen(false);
    setShowAllModal(false);
    router.push(`/admin/users/dashboard/${row.reportedDashboardUserId}`);
  };

  const reportSubtitle = (row: ReportItem) => {
    const parts = [row.reporterLabel, formatTimeAgo(row.createdAt)];
    if (typeof row.imageCount === 'number' && row.imageCount > 0) {
      parts.push(`${row.imageCount} photo${row.imageCount === 1 ? '' : 's'}`);
    }
    return parts.join(' · ');
  };

  return (
    <div className="relative">
      <button
        type="button"
        ref={anchorRef}
        onClick={() => setOpen((v) => !v)}
        className="p-2 w-9 h-9 rounded-full bg-white flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition border border-gray-200"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-500" />
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-green-500 text-white rounded-full text-[9px] font-semibold px-0.5">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,320px)] rounded-xl border border-gray-200 bg-white shadow-xl z-[80] overflow-hidden"
          data-portal-type="admin-notif"
        >
          <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200">
            <div className="font-semibold text-sm text-gray-800">Notifications</div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  title="Mark all as read"
                >
                  <Check size={12} />
                  Mark all read
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                title="Close"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-gray-500 text-xs text-center">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-gray-500 text-xs text-center flex flex-col items-center gap-2">
                <Bell size={24} className="text-gray-300" />
                <span>No notifications yet</span>
              </div>
            ) : (
              items.map((row) => (
                <div
                  key={row.id}
                  className={`px-3 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition relative group ${
                    row.isUnread ? 'bg-blue-50/50' : ''
                  }`}
                >
                  {row.isUnread ? (
                    <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 z-10" />
                  ) : null}
                  <div className="flex gap-3" onClick={() => void onRowNavigate(row)}>
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <Flag size={16} className="text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-medium text-gray-900 truncate ${row.isUnread ? 'font-semibold' : ''}`}
                      >
                        {row.distributorLabel}
                      </p>
                      <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{row.reasonText}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{reportSubtitle(row)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteReport(row.id, e)}
                    className="absolute top-2 right-2 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 z-10"
                    title="Delete notification"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
          {items.length > 0 ? (
            <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void handleClearAll()}
                className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                title="Clear all notifications"
              >
                <Trash2 size={12} />
                Clear all
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowAllModal(true);
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                View All Notifications
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showAllModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center" data-portal-type="admin-notif-modal">
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowAllModal(false)} aria-hidden />
            <div
              ref={allNotificationsModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={ALL_NOTIFICATIONS_DIALOG_TITLE_ID}
              className="relative z-10 bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col mx-4 outline-none"
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 flex items-center justify-between border-b shrink-0">
                <h2 id={ALL_NOTIFICATIONS_DIALOG_TITLE_ID} className="font-semibold text-base text-gray-800">
                  All Notifications
                </h2>
                <div className="flex items-center gap-2">
                  {allItems.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleClearAll()}
                        className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                        title="Clear all"
                      >
                        <Trash2 size={12} /> Clear all
                      </button>
                      {unreadCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => void markAllRead()}
                          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          title="Mark all as read"
                        >
                          <Check size={12} />
                          Mark all read
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowAllModal(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 min-h-0">
                {loadingAll ? (
                  <div className="px-4 py-8 text-gray-500 text-xs text-center">Loading…</div>
                ) : allItems.length === 0 ? (
                  <div className="px-4 py-8 text-gray-500 text-xs text-center">No notifications</div>
                ) : (
                  allItems.map((row) => (
                    <div
                      key={row.id}
                      className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition relative group ${
                        row.isUnread ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      {row.isUnread ? (
                        <div className="absolute top-3 left-3 w-2 h-2 rounded-full bg-blue-500 z-10" />
                      ) : null}
                      <div className="flex gap-3" onClick={() => void onRowNavigate(row)}>
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <Flag size={16} className="text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0 pr-6">
                          <p
                            className={`text-xs font-medium text-gray-900 truncate ${row.isUnread ? 'font-semibold' : ''}`}
                          >
                            {row.distributorLabel}
                          </p>
                          <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{row.reasonText}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{reportSubtitle(row)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => void handleDeleteReport(row.id, e)}
                        className="absolute top-3 right-3 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 z-10"
                        title="Delete notification"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
