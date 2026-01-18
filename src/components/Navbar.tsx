'use client';

import Image from "next/image";
import { Search, MessageCircle, Bell, User, LogOut, Plus, Package, AlertTriangle, Tag, Users, Megaphone, ShoppingBag, Settings, Check, Trash2, X } from 'lucide-react';
import { Menu as MenuIcon } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useUserStore } from '@/store/userStore';
import { useDashboardNotificationSocket } from '@/hooks/useDashboardNotificationSocket';
import ReactDOM from 'react-dom';
import { useMenuContext } from '@/app/(dashboard)/(menulist)/DashboardClientLayout';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { fetchGraphQL } from '@/lib/graphqlClient';

const DROPDOWN_WIDTH = 300;

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

const Navbar = () => {
  const user = useUserStore(state => state.user);
  const clearUser = useUserStore(state => state.clearUser);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showMsgDropdown, setShowMsgDropdown] = useState(false);
  const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [showAllNotifModal, setShowAllNotifModal] = useState(false);
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [isLoadingAllNotifications, setIsLoadingAllNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const { toggleMenu, isMobileMenuOpen, toggleMobileMenu } = useMenuContext();
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
    if (notification.actionUrl) {
      setShowNotifDropdown(false);
      setShowAllNotifModal(false);
      router.push(notification.actionUrl);
    }
  };

  // Get icon for notification type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order':
        return <Package size={16} className="text-blue-500" />;
      case 'inventory':
        return <AlertTriangle size={16} className="text-orange-500" />;
      case 'offer':
        return <Tag size={16} className="text-purple-500" />;
      case 'buyer':
        return <Users size={16} className="text-green-500" />;
      case 'campaign':
        return <Megaphone size={16} className="text-pink-500" />;
      case 'product':
        return <ShoppingBag size={16} className="text-indigo-500" />;
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

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
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
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown, showNotifDropdown]);

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
    <div className="flex items-center justify-between px-4 py-3 z-30 relative bg-white border-b border-gray-200 h-16">
      {/* MENU COLLAPSE BUTTON */}
      <button
        className="mr-4 p-2 rounded-lg hover:bg-gray-200 transition-all duration-100 flex-shrink-0 group"
        aria-label="Toggle menu"
        onClick={toggleMenu}
      >
        <MenuIcon size={20} className="text-gray-700 transition-colors duration-100" />
      </button>
      {/* SEARCH BAR - Hidden on Mobile */}
      <div className="hidden sm:flex flex-1 items-left justify-left">
        <div className="relative w-[300px] max-w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={15} />
          </span>
          <input
            type="text"
            placeholder="Quick Search..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0a61d7] text-xs text-black"
          />
        </div>
      </div>
      {/* NAVBAR GROUPS */}
      <div className="flex items-center gap-2 justify-end">
        {/* Salesmen Avatars Group */}
        <div className="flex items-center mr-2 sm:mr-4 pr-2 sm:pr-4 border-r border-gray-200">
          {salesAgents.slice(0, maxAvatars).map((agent, i) => (
            <button
              key={agent.id}
              onClick={() => handleSalesmanClick(agent.id)}
              className={`cursor-pointer hover:opacity-80 transition-opacity relative flex-shrink-0 ${i > 0 ? '-ml-2 sm:-ml-3' : ''}`}
              style={{ zIndex: 10 - i }}
              title={agent.name}
            >
              {agent.avatar ? (
                <img
                  src={agent.avatar}
                  alt={agent.name}
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-white shadow-sm object-cover"
                />
              ) : (
                <div
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-white shadow-sm bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600"
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
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-500 font-semibold -ml-2 sm:-ml-3 cursor-pointer hover:bg-gray-200 transition-colors relative flex-shrink-0"
              style={{ zIndex: 8 }}
              title={`View all ${salesAgents.length} sales agents`}
            >
              +{extraCount}
            </button>
          )}
          <button
            onClick={handleAddSalesman}
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:bg-blue-50 ml-2 sm:ml-2 shadow-sm transition-colors relative flex-shrink-0"
            style={{ zIndex: 7 }}
            title="Add Sales Agent"
          >
            <Plus size={14} className="sm:w-4 sm:h-4" />
          </button>
        </div>
        {/* Message & Notification Group */}
        <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 border-r border-gray-200">
          <div className="p-2 w-9 h-9 rounded-full bg-white flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition" ref={msgRef}>
            <MessageCircle size={20} className="text-gray-500" onClick={() => { setShowMsgDropdown(v => !v); setShowNotifDropdown(false); setShowDropdown(false); }} />
          </div>
          <DropdownPortal anchorRef={msgRef} show={showMsgDropdown}>
            <div className="px-2 pt-2 text-center">
              <div className="font-bold text-xs text-gray-800 mb-2">Your Messages</div>
            </div>
            <div className="border-t border-gray-200" />
            <div className="px-6 py-6 text-gray-500 text-xs text-center">You have no messages</div>
            <div className="border-t border-gray-200" />
            <div className="flex justify-center py-2">
              <button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-2 rounded-full text-xs shadow transition">View All Messages</button>
            </div>
          </DropdownPortal>
          <div className="p-2 w-9 h-9 rounded-full bg-white flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition" ref={notifRef}>
            <Bell size={20} className="text-gray-500" onClick={() => { setShowNotifDropdown(v => !v); setShowMsgDropdown(false); setShowDropdown(false); }} />
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white rounded-full text-[10px] font-semibold px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </div>
          <DropdownPortal anchorRef={notifRef} show={showNotifDropdown} dataPortalType="notif">
            <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200">
              <div className="font-semibold text-sm text-gray-800">Notifications</div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button 
                    onClick={handleMarkAllAsRead}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    title="Mark all as read"
                  >
                    <Check size={12} />
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setShowNotifDropdown(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {isLoadingNotifications ? (
                <div className="px-4 py-8 text-gray-500 text-xs text-center">Loading...</div>
              ) : notifications.length === 0 ? (
                <div className="px-4 py-8 text-gray-500 text-xs text-center flex flex-col items-center gap-2">
                  <Bell size={24} className="text-gray-300" />
                  <span>No notifications yet</span>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`px-3 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition relative group ${
                      !notification.isRead ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    {/* Blue dot indicator - moved to top left */}
                    {!notification.isRead && (
                      <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 z-10" />
                    )}
                    <div className="flex gap-3" onClick={() => handleNotificationClick(notification)}>
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        {getNotificationIcon(notification.type)}
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
                    {/* X button - top right (always visible so deletion works on touch) */}
                    <button
                      onClick={(e) => handleDeleteNotification(notification.id, e)}
                      className="absolute top-2 right-2 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 z-10"
                      title="Delete notification"
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
                  title="Clear all notifications"
                >
                  <Trash2 size={12} />
                  Clear all
                </button>
                <button 
                  onClick={() => {
                    setShowNotifDropdown(false);
                    setShowAllNotifModal(true);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  View All Notifications
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
                  <h2 className="font-semibold text-base text-gray-800">All Notifications</h2>
                  <div className="flex items-center gap-2">
                    {allNotifications.length > 0 && (
                      <>
                        <button onClick={handleClearAllNotifications} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1" title="Clear all">
                          <Trash2 size={12} /> Clear all
                        </button>
                        {unreadCount > 0 && (
                          <button onClick={handleMarkAllAsRead} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1" title="Mark all read">
                            <Check size={12} /> Mark all read
                          </button>
                        )}
                      </>
                    )}
                    <button onClick={() => setShowAllNotifModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" title="Close">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 min-h-0">
                  {isLoadingAllNotifications ? (
                    <div className="px-4 py-8 text-gray-500 text-xs text-center">Loading...</div>
                  ) : allNotifications.length === 0 ? (
                    <div className="px-4 py-8 text-gray-500 text-xs text-center">No notifications</div>
                  ) : (
                    allNotifications.map((n) => (
                      <div key={n.id} className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition relative group ${!n.isRead ? 'bg-blue-50/50' : ''}`}>
                        {!n.isRead && <div className="absolute top-3 left-3 w-2 h-2 rounded-full bg-blue-500 z-10" />}
                        <div className="flex gap-3" onClick={() => handleNotificationClick(n)}>
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">{getNotificationIcon(n.type)}</div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium text-gray-900 truncate ${!n.isRead ? 'font-semibold' : ''}`}>{n.title}</p>
                            <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-gray-400 mt-1">{formatTimeAgo(n.createdAt)}</p>
                          </div>
                        </div>
                        <button onClick={(e) => handleDeleteNotification(n.id, e)} className="absolute top-3 right-3 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 z-10" title="Delete"><X size={14} /></button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
        {/* User Group */}
        <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4">
          <div className="hidden sm:flex flex-col text-black max-w-[80px] truncate text-xs text-right">
            <span className="text-xs leading-3 font-medium truncate">{user?.firstName || 'User'}</span>
            <span className="text-[10px] text-gray-500 text-right truncate">{user?.email || ''}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition overflow-hidden" ref={dropdownRef}>
            <div
              className="w-full h-full flex items-center justify-center"
              onClick={() => { setShowDropdown(v => !v); setShowNotifDropdown(false); setShowMsgDropdown(false); }}
            >
              {user?.avatar && user.avatar !== null && user.avatar.trim() !== '' ? (
                <Image
                  src={user.avatar}
                  alt={`${user.firstName || 'User'} avatar`}
                  width={36}
                  height={36}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <User size={20} className="text-gray-500" />
              )}
            </div>
          </div>
          {/* User dropdown menu using portal */}
          <DropdownPortal anchorRef={dropdownRef} show={showDropdown}>
            <div className="px-4 py-2 border-b">
              <p className="text-xs font-medium text-gray-900 truncate" title={user?.firstName}>{user?.firstName || 'User'}</p>
              <p className="text-xs text-gray-500" title={user?.email}>{user?.email || ''}</p>
            </div>
            <a 
              href="/settings" 
              className="block px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
              onClick={() => {
                setShowDropdown(false);
              }}
            >
              Account Settings
            </a>
            <button 
              className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-gray-100 flex items-center"
              onClick={handleSignOut}
            >
              <LogOut size={16} className="mr-2" />
              Sign out
            </button>
          </DropdownPortal>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
