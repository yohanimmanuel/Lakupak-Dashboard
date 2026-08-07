'use client';

import Image from 'next/image';
import Link from 'next/link';
import { MessageCircle, Bell, User, LogOut, Plus, Package, AlertTriangle, Tag, Users, Megaphone, ShoppingBag, Settings, Check, Trash2, X, Truck, Info, Receipt, Bot } from 'lucide-react';
import { Menu as MenuIcon } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useUserStore } from '@/store/userStore';
import { useDashboardNotificationSocket } from '@/hooks/useDashboardNotificationSocket';
import ReactDOM from 'react-dom';
import { useMenuContext } from '@/app/(dashboard)/(menulist)/DashboardClientLayout';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { DashboardSearchBar } from '@/components/dashboard/DashboardSearchBar';
import { NavbarAiAgentPanel } from '@/components/NavbarAiAgentPanel';
import { useTranslations } from 'next-intl';

const DROPDOWN_WIDTH = 300;
const AI_PANEL_ID = 'navbar-ai-agent-panel';

interface SalesAgent {
  id: string;
  name: string;
  avatar?: string | null;
}

type DropdownPortalProps = { anchorRef: React.RefObject<HTMLElement | null>; show: boolean; children: React.ReactNode; dataPortalType?: string };
const DropdownPortal = ({ anchorRef, show, children, dataPortalType }: DropdownPortalProps) => {
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  useEffect(() => {
    if (show && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        left: rect.right - DROPDOWN_WIDTH,
      });
    }
  }, [show, anchorRef]);
  if (!show) return null;
  return ReactDOM.createPortal(
    <div 
      data-dropdown-portal
      {...(dataPortalType ? { 'data-portal-type': dataPortalType } : {})}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: DROPDOWN_WIDTH, zIndex: 50 }} 
      className="border border-gray-200 bg-white rounded-xl shadow-2xl py-0 px-0 mt-1"
    >
      {children}
    </div>,
    document.body
  );
};

const SALES_AGENTS_QUERY = `
  query GetSalesAgents($userId: Int!, $page: Int, $limit: Int) {
    salesAgents(userId: $userId, page: $page, limit: $limit) {
      nodes {
        id
        name
        avatar
      }
    }
  }
`;

const NOTIFICATIONS_QUERY = `
  query GetNotifications($page: Int, $limit: Int) {
    notifications(page: $page, limit: $limit) {
      nodes {
        id
        type
        title
        message
        isRead
        metadata
        actionUrl
        createdAt
      }
      unreadCount
    }
  }
`;

const MARK_NOTIFICATION_READ_MUTATION = `
  mutation MarkNotificationAsRead($id: String!) {
    markNotificationAsRead(id: $id) {
      id
      isRead
    }
  }
`;

const MARK_ALL_NOTIFICATIONS_READ_MUTATION = `
  mutation MarkAllNotificationsAsRead {
    markAllNotificationsAsRead
  }
`;

const DELETE_NOTIFICATION_MUTATION = `
  mutation DeleteNotification($id: String!) {
    deleteNotification(id: $id)
  }
`;

const CLEAR_ALL_NOTIFICATIONS_MUTATION = `
  mutation ClearAllNotifications {
    clearAllNotifications
  }
`;

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  metadata: Record<string, unknown> | null;
  actionUrl: string | null;
  createdAt: string;
}

interface DriverRequestMetadata {
  driverRequestId?: string;
  driverName?: string;
  driverPhone?: string;
  message?: string | null;
}

const Navbar = () => {
  const user = useUserStore(state => state.user);
  const tCommon = useTranslations('dashboard.common');
  const tNavbar = useTranslations('dashboard.navbar');
  const clearUser = useUserStore(state => state.clearUser);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showMsgDropdown, setShowMsgDropdown] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [showAllNotifModal, setShowAllNotifModal] = useState(false);
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [isLoadingAllNotifications, setIsLoadingAllNotifications] = useState(false);
  const [driverRequestModalNotif, setDriverRequestModalNotif] = useState<Notification | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLButtonElement>(null);
  const msgRef = useRef<HTMLButtonElement>(null);
  const aiRef = useRef<HTMLButtonElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const { toggleMenu } = useMenuContext();
  const [hasMounted, setHasMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Fetch sales agents for navbar
  useEffect(() => {
    const fetchSalesAgents = async () => {
      if (!user?.id) return;
      try {
        const data = await fetchGraphQL<{
          salesAgents: {
            nodes: SalesAgent[];
          };
        }>(SALES_AGENTS_QUERY, {
          userId: user.id,
          page: 1,
          limit: 4, // Only fetch first 4 for navbar display
        });
        setSalesAgents(data.salesAgents.nodes);
      } catch (error) {
        console.error('Error fetching sales agents:', error);
        // Keep empty array on error
        setSalesAgents([]);
      }
    };
    fetchSalesAgents();
  }, [user?.id]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    setIsLoadingNotifications(true);
    try {
      const data = await fetchGraphQL<{
        notifications: {
          nodes: Notification[];
          unreadCount: number;
        };
      }>(NOTIFICATIONS_QUERY, {
        page: 1,
        limit: 10,
      });
      setNotifications(data.notifications.nodes);
      setUnreadCount(data.notifications.unreadCount);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [user?.id]);

  // Fetch all notifications for the View All modal
  const fetchAllNotifications = useCallback(async () => {
    if (!user?.id) return;
    setIsLoadingAllNotifications(true);
    try {
      const data = await fetchGraphQL<{
        notifications: { nodes: Notification[]; unreadCount: number };
      }>(NOTIFICATIONS_QUERY, { page: 1, limit: 50 });
      setAllNotifications(data.notifications.nodes);
      setUnreadCount(data.notifications.unreadCount);
    } catch (error) {
      console.error('Error fetching all notifications:', error);
      setAllNotifications([]);
    } finally {
      setIsLoadingAllNotifications(false);
    }
  }, [user?.id]);

  // When View All modal opens, fetch the full list
  useEffect(() => {
    if (showAllNotifModal) {
      fetchAllNotifications();
    }
  }, [showAllNotifModal, fetchAllNotifications]);

  // Initial fetch on mount/reload so badge and list are correct without opening the bell
  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
    }
  }, [user?.id, fetchNotifications]);

  // Also fetch when opening the dropdown (for freshness)
  useEffect(() => {
    if (showNotifDropdown && user?.id) {
      fetchNotifications();
    }
  }, [showNotifDropdown, user?.id, fetchNotifications]);

  // Poll for new notifications every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (user?.id && !isLoadingNotifications) {
        fetchNotifications();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [user?.id, isLoadingNotifications, fetchNotifications]);

  // Real-time: WebSocket pushes new notifications so we refetch without reload
  useDashboardNotificationSocket(user?.id ?? undefined, fetchNotifications);

  // Mark notification as read
  const handleMarkAsRead = async (notificationId: string) => {
    if (!user?.id) return;
    try {
      await fetchGraphQL(MARK_NOTIFICATION_READ_MUTATION, {
        id: notificationId,
        userId: user.id,
      });
      // Update local state; only decrement unread when it was previously unread
      setNotifications(prev => {
        const item = prev.find(n => n.id === notificationId);
        const wasUnread = Boolean(item && !item.isRead);
        if (wasUnread) setUnreadCount(c => Math.max(0, c - 1));
        return prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n);
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    if (!user?.id) return;
    try {
      await fetchGraphQL(MARK_ALL_NOTIFICATIONS_READ_MUTATION);
      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  // Delete single notification
  const handleDeleteNotification = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the notification click
    if (!user?.id) return;
    try {
      await fetchGraphQL(DELETE_NOTIFICATION_MUTATION, {
        id: notificationId,
        userId: user.id,
      });
      const deletedNotification = notifications.find(n => n.id === notificationId) ?? allNotifications.find(n => n.id === notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setAllNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (deletedNotification && !deletedNotification.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  // Clear all notifications
  const handleClearAllNotifications = async () => {
    if (!user?.id) return;
    try {
      await fetchGraphQL(CLEAR_ALL_NOTIFICATIONS_MUTATION);
      setNotifications([]);
      setAllNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error('Error clearing all notifications:', error);
    }
  };

  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification.id);
    }
    if (notification.type === 'driver_request') {
      setShowNotifDropdown(false);
      setShowAllNotifModal(false);
      setDriverRequestModalNotif(notification);
      return;
    }
    if (notification.actionUrl) {
      setShowNotifDropdown(false);
      setShowAllNotifModal(false);
      router.push(notification.actionUrl);
    }
  };

  // Get icon for notification type
  const getNotificationIcon = (type: string, metadata?: { restored?: boolean } | null) => {
    switch (type) {
      case 'order':
        return <Package size={16} className="text-blue-500" />;
      case 'inventory':
        // Show checkmark for restored/healthy stock, warning for low/critical/out of stock
        if (metadata?.restored) {
          return <Check size={16} className="text-green-500" />;
        }
        return <AlertTriangle size={16} className="text-orange-500" />;
      case 'offer':
        return <Tag size={16} className="text-purple-500" />;
      case 'buyer':
        return <Users size={16} className="text-green-500" />;
      case 'campaign':
        return <Megaphone size={16} className="text-pink-500" />;
      case 'product':
        return <ShoppingBag size={16} className="text-indigo-500" />;
      case 'driver_request':
        return <Truck size={16} className="text-blue-500" />;
      case 'billing':
        return <Receipt size={16} className="text-[#0a61d7]" />;
      case 'driver':
        // For driver status notifications we want:
        // - Truck icon for in-progress / shipped
        // - Check icon for completed
        // - X icon for failed
        {
          const status = (metadata as { orderStatus?: string } | null)?.orderStatus;
          if (status === 'Delivered') {
            return <Check size={16} className="text-green-500" />;
          }
          if (status === 'Failed') {
            return <X size={16} className="text-red-500" />;
          }
          return <Truck size={16} className="text-blue-500" />;
        }
      case 'system':
        return <Settings size={16} className="text-gray-500" />;
      default:
        return <Bell size={16} className="text-gray-500" />;
    }
  };

  // Format time ago
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return tNavbar('timeJustNow');
    if (diffMins < 60) return tNavbar('timeMinutesAgo', { count: diffMins });
    if (diffHours < 24) return tNavbar('timeHoursAgo', { count: diffHours });
    if (diffDays < 7) return tNavbar('timeDaysAgo', { count: diffDays });
    return date.toLocaleDateString();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is outside user dropdown (including portal content)
      if (showDropdown) {
        const isClickOnAvatar = dropdownRef.current && dropdownRef.current.contains(target);
        const isClickOnPortal = (target as Element).closest('[data-dropdown-portal]');
        if (!isClickOnAvatar && !isClickOnPortal) {
          setShowDropdown(false);
        }
      }
      
      // Only close notif dropdown when click is outside both the bell and the dropdown portal
      if (showNotifDropdown) {
        const isClickOnBell = notifRef.current?.contains(target);
        const isClickOnNotifPortal = (target as Element).closest('[data-portal-type="notif"]');
        if (!isClickOnBell && !isClickOnNotifPortal) {
          setShowNotifDropdown(false);
        }
      }
      if (msgRef.current && !msgRef.current.contains(target)) {
        setShowMsgDropdown(false);
      }

      if (showAiPanel) {
        const isClickOnAiButton = aiRef.current?.contains(target);
        const isClickOnAiPortal = (target as Element).closest('[data-portal-type="ai-agent"]');
        if (!isClickOnAiButton && !isClickOnAiPortal) {
          setShowAiPanel(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown, showNotifDropdown, showAiPanel]);

  const handleSignOut = async () => {
    // Clear NextAuth session first
    await signOut({ redirect: false });
    // Then clear user store
    clearUser();
    router.push('/login');
  };

  const handleAddSalesman = () => {
    router.push('/marketing/team/create');
  };

  const handleSalesmanClick = (agentId: string) => {
    router.push(`/marketing/team/details?id=${agentId}`);
  };

  const handleSalesTeamClick = () => {
    router.push('/marketing/team');
  };

  const formatRole = (role: string) => {
    if (!role) return '';
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  };

  if (!hasMounted) return null;

  const maxAvatars = 3;
  const extraCount = salesAgents.length - maxAvatars;

  return (
    <div className="flex items-center justify-between gap-4 px-4 z-30 relative bg-white border-b border-gray-200 h-16">
      {/* Logo + search (left) */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="flex items-center gap-3 shrink-0">
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-200 transition-all duration-100"
            aria-label={tNavbar('toggleMenu')}
            onClick={toggleMenu}
          >
            <MenuIcon size={20} className="text-gray-700" />
          </button>
          <Link href="/home" className="flex items-center min-w-0 group">
            <img
              src="/LakuTextLogo.svg"
              alt="Laku"
              className="h-9 hidden sm:block w-auto"
            />
            <img
              src="/LakuIcon.svg"
              alt="Laku"
              className="h-9 w-9 sm:hidden"
            />
          </Link>
        </div>
        <div className="hidden sm:flex min-w-0 w-full max-w-xs md:max-w-sm lg:max-w-md" data-tour="quick-search">
          <DashboardSearchBar placeholder={tCommon('searchPlaceholder')} className="relative w-full" />
        </div>
      </div>
      {/* NAVBAR ACTIONS — single group with consistent gap */}
      <div className="flex items-center gap-2 justify-end shrink-0">
        {/* Sales agents */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center">
            {salesAgents.slice(0, maxAvatars).map((agent, i) => (
              <button
                key={agent.id}
                onClick={() => handleSalesmanClick(agent.id)}
                className={`cursor-pointer hover:opacity-80 transition-opacity relative flex-shrink-0 ${i > 0 ? '-ml-2' : ''}`}
                style={{ zIndex: 10 - i }}
                title={agent.name}
              >
                {agent.avatar ? (
                  <img
                    src={agent.avatar}
                    alt={agent.name}
                    className="w-7 h-7 rounded-full border-2 border-white shadow-sm object-cover"
                  />
                ) : (
                  <div
                    className="w-7 h-7 rounded-full border-2 border-white shadow-sm bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600"
                    title={agent.name}
                  >
                    {agent.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                )}
              </button>
            ))}
            {extraCount > 0 && (
              <button
                onClick={handleSalesTeamClick}
                className="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-500 font-semibold -ml-2 cursor-pointer hover:bg-gray-200 transition-colors relative flex-shrink-0"
                style={{ zIndex: 8 }}
                title={tNavbar('viewAllSalesAgents', { count: salesAgents.length })}
              >
                {extraCount}
              </button>
            )}
          </div>
          <button
            onClick={handleAddSalesman}
            className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-blue-50 shadow-sm transition-colors relative flex-shrink-0"
            title={tNavbar('addSalesAgent')}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* AI Agent */}
        <button
          type="button"
          ref={aiRef}
          className={`p-2 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer relative transition border ${
            showAiPanel
              ? 'bg-[#0a61d7] border-[#0a61d7] text-white'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'
          }`}
          onClick={() => {
            setShowAiPanel(v => !v);
            setShowMsgDropdown(false);
            setShowNotifDropdown(false);
            setShowDropdown(false);
          }}
          aria-label={tNavbar('aiAgent')}
          title={tNavbar('aiAgent')}
          aria-haspopup="dialog"
          aria-expanded={showAiPanel}
          aria-controls={AI_PANEL_ID}
        >
          <Bot className="w-5 h-5" />
        </button>

        {/* Messages */}
        <button
          type="button"
          className="p-2 w-9 h-9 rounded-full bg-white flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition border border-gray-200"
          ref={msgRef}
          onClick={() => {
            setShowMsgDropdown(v => !v);
            setShowNotifDropdown(false);
            setShowDropdown(false);
            setShowAiPanel(false);
          }}
          aria-label={tNavbar('messages')}
        >
          <MessageCircle className="w-5 h-5 text-gray-500" />
        </button>
        <DropdownPortal anchorRef={msgRef} show={showMsgDropdown}>
          <div className="px-2 pt-2 text-center">
            <div className="font-bold text-xs text-gray-800 mb-2">{tNavbar('yourMessages')}</div>
          </div>
          <div className="border-t border-gray-200" />
          <div className="px-6 py-6 text-gray-500 text-xs text-center">{tNavbar('noMessages')}</div>
          <div className="border-t border-gray-200" />
          <div className="flex justify-center py-2">
            <button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-2 rounded-full text-xs shadow transition">{tNavbar('viewAllMessages')}</button>
          </div>
        </DropdownPortal>

        {/* Notifications */}
        <button
          type="button"
          className="p-2 w-9 h-9 rounded-full bg-white flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition border border-gray-200"
          ref={notifRef}
          onClick={() => {
            setShowNotifDropdown(v => !v);
            setShowMsgDropdown(false);
            setShowDropdown(false);
            setShowAiPanel(false);
          }}
          aria-label={tNavbar('notifications')}
        >
          <Bell className="w-5 h-5 text-gray-500" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-green-500 text-white rounded-full text-[9px] font-semibold px-0.5">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        <DropdownPortal anchorRef={notifRef} show={showNotifDropdown} dataPortalType="notif">
          <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200">
            <div className="font-semibold text-sm text-gray-800">{tNavbar('notifications')}</div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button 
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  title={tNavbar('markAllRead')}
                >
                  <Check size={12} />
                  {tNavbar('markAllRead')}
                </button>
              )}
              <button
                onClick={() => setShowNotifDropdown(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                title={tNavbar('close')}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {isLoadingNotifications ? (
              <div className="px-4 py-8 text-gray-500 text-xs text-center">{tNavbar('loading')}</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-gray-500 text-xs text-center flex flex-col items-center gap-2">
                <Bell size={24} className="text-gray-300" />
                <span>{tNavbar('noNotificationsYet')}</span>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`px-3 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition relative group ${
                    !notification.isRead ? 'bg-blue-50/50' : ''
                  }`}
                >
                  {!notification.isRead && (
                    <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 z-10" />
                  )}
                  <div className="flex gap-3" onClick={() => handleNotificationClick(notification)}>
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      {getNotificationIcon(notification.type, notification.metadata)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-xs font-medium text-gray-900 truncate ${!notification.isRead ? 'font-semibold' : ''}`}>
                          {notification.title}
                        </p>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">
                        {notification.message}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {formatTimeAgo(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteNotification(notification.id, e)}
                    className="absolute top-2 right-2 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 z-10"
                    title={tNavbar('deleteNotification')}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
          {notifications.length > 0 && (
            <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
              <button 
                onClick={handleClearAllNotifications}
                className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                title={tNavbar('clearAllNotifications')}
              >
                <Trash2 size={12} />
                {tNavbar('clearAll')}
              </button>
              <button 
                onClick={() => {
                  setShowNotifDropdown(false);
                  setShowAllNotifModal(true);
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                {tNavbar('viewAllNotifications')}
              </button>
            </div>
          )}
        </DropdownPortal>

        {/* All Notifications Modal */}
        {showAllNotifModal && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center" data-portal-type="notif-modal">
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowAllNotifModal(false)} aria-hidden />
            <div className="relative z-10 bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
              <div className="px-4 py-3 flex items-center justify-between border-b shrink-0">
                <h2 className="font-semibold text-base text-gray-800">{tNavbar('allNotifications')}</h2>
                <div className="flex items-center gap-2">
                  {allNotifications.length > 0 && (
                    <>
                      <button onClick={handleClearAllNotifications} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1" title={tNavbar('clearAll')}>
                        <Trash2 size={12} /> {tNavbar('clearAll')}
                      </button>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllAsRead} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1" title={tNavbar('markAllRead')}>
                          <Check size={12} /> {tNavbar('markAllRead')}
                        </button>
                      )}
                    </>
                  )}
                  <button onClick={() => setShowAllNotifModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" title={tNavbar('close')}>
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 min-h-0">
                {isLoadingAllNotifications ? (
                  <div className="px-4 py-8 text-gray-500 text-xs text-center">{tNavbar('loading')}</div>
                ) : allNotifications.length === 0 ? (
                  <div className="px-4 py-8 text-gray-500 text-xs text-center">{tNavbar('noNotifications')}</div>
                ) : (
                  allNotifications.map((n) => (
                    <div key={n.id} className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition relative group ${!n.isRead ? 'bg-blue-50/50' : ''}`}>
                      {!n.isRead && <div className="absolute top-3 left-3 w-2 h-2 rounded-full bg-blue-500 z-10" />}
                      <div className="flex gap-3" onClick={() => handleNotificationClick(n)}>
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">{getNotificationIcon(n.type, n.metadata)}</div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium text-gray-900 truncate ${!n.isRead ? 'font-semibold' : ''}`}>{n.title}</p>
                          <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{n.message}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{formatTimeAgo(n.createdAt)}</p>
                        </div>
                      </div>
                      <button onClick={(e) => handleDeleteNotification(n.id, e)} className="absolute top-3 right-3 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 z-10" title={tNavbar('delete')}><X size={14} /></button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Driver request detail modal */}
        {driverRequestModalNotif && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center" data-portal-type="driver-request-modal">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setDriverRequestModalNotif(null)}
              aria-hidden
            />
            <div
              className="relative z-10 bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                    <Truck size={20} className="text-blue-600" />
                  </div>
                  <h2 className="font-semibold text-base text-gray-900">{tNavbar('driverAccessRequest')}</h2>
                </div>
                <button
                  onClick={() => setDriverRequestModalNotif(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                  title={tNavbar('close')}
                >
                  <X size={18} />
                </button>
              </div>
              {(() => {
                const meta = (driverRequestModalNotif.metadata || {}) as DriverRequestMetadata;
                return (
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-gray-500 block text-xs font-medium mb-0.5">{tNavbar('name')}</span>
                      <p className="text-gray-900 font-medium">{meta.driverName ?? '—'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-xs font-medium mb-0.5">{tNavbar('phone')}</span>
                      <p className="text-gray-900">{meta.driverPhone ?? '—'}</p>
                    </div>
                    {meta.message && (
                      <div>
                        <span className="text-gray-500 block text-xs font-medium mb-0.5">{tNavbar('message')}</span>
                        <p className="text-gray-700 whitespace-pre-wrap">{meta.message}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100 flex gap-2">
                <Info size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800">
                  {tNavbar('driverHowToAdd')}
                </p>
              </div>
              <div className="mt-5 flex gap-2 justify-end border-t border-gray-100 pt-4">
                <button
                  onClick={() => setDriverRequestModalNotif(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  {tNavbar('close')}
                </button>
                <button
                  onClick={() => {
                    setDriverRequestModalNotif(null);
                    router.push('/logistics/create');
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#0a61d7] hover:bg-[#084ba6] rounded-lg transition"
                >
                  {tNavbar('addFleetAndDriver')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* User */}
        <div className="flex items-center" data-tour="user-menu">
          <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition overflow-hidden" ref={dropdownRef}>
            <div
              className="w-full h-full flex items-center justify-center"
              onClick={() => {
                setShowDropdown(v => !v);
                setShowNotifDropdown(false);
                setShowMsgDropdown(false);
                setShowAiPanel(false);
              }}
            >
              {user?.avatar && user.avatar !== null && user.avatar.trim() !== '' ? (
                <Image
                  src={user.avatar}
                  alt={`${user.firstName || tNavbar('userFallback')} avatar`}
                  width={36}
                  height={36}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <User size={20} className="text-gray-500" />
              )}
            </div>
          </div>
          <DropdownPortal anchorRef={dropdownRef} show={showDropdown}>
            <div className="px-4 py-2 border-b">
              <p className="text-xs font-medium text-gray-900 truncate" title={user?.firstName}>{user?.firstName || tNavbar('userFallback')}</p>
              <p className="text-xs text-gray-500" title={user?.email}>{user?.email || ''}</p>
            </div>
            <a 
              href="/settings" 
              className="block px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
              onClick={() => {
                setShowDropdown(false);
              }}
            >
              {tNavbar('accountSettings')}
            </a>
            <button 
              className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-gray-100 flex items-center"
              onClick={handleSignOut}
            >
              <LogOut size={16} className="mr-2" />
              {tNavbar('signOut')}
            </button>
          </DropdownPortal>
        </div>
      </div>

      {/* AI Agent chat panel — top right below navbar */}
      {showAiPanel && ReactDOM.createPortal(
        <NavbarAiAgentPanel
          panelId={AI_PANEL_ID}
          panelRef={aiPanelRef}
          onCloseAction={() => setShowAiPanel(false)}
        />,
        document.body
      )}
    </div>
  );
};

export default Navbar;
