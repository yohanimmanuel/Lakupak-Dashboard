import { create } from 'zustand';

interface Company {
  id: number;
  name: string;
  businessRegistrationNumber?: string;
  taxId?: string;
  logo?: string;
  bannerImage?: string;
  industryType?: string;
  businessDescription?: string;
  yearsInOperation?: string;
  companySize?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  documentVerification: boolean;
  businessLicenseVerification: boolean;
  complianceStatus: string;
  shippingPreferences?: string;
  deliveryTimeSlots?: string;
  preferredDeliveryDays?: string;
  deliveryRadius?: string;
  specialInstructions?: string;
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  bio?: string;
  location?: string;
  avatar?: string;
  companyId?: number;
  company?: Company;
  region?: string;
  currency?: string;
}

interface SessionData {
  user: User;
  timestamp: number;
  expiresAt: number;
}

interface UserStore {
  user: User | null;
  isAuthenticated: boolean;
  sessionExpiry: number | null;
  setUser: (user: User, rememberMe?: boolean) => void;
  updateUser: (updates: Partial<User>) => void;
  clearUser: () => void;
  checkSession: () => boolean;
  extendSession: () => void;
}

const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const REMEMBER_ME_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

const getInitialUser = (): { user: User | null; sessionExpiry: number | null } => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('userSession');
      if (stored) {
        const sessionData: SessionData = JSON.parse(stored);
        const now = Date.now();
        
        // Check if session is still valid
        if (now < sessionData.expiresAt) {
          return { 
            user: sessionData.user, 
            sessionExpiry: sessionData.expiresAt 
          };
        } else {
          // Session expired, clean up
          localStorage.removeItem('userSession');
        }
      }
    } catch (error) {
      localStorage.removeItem('userSession');
    }
  }
  return { user: null, sessionExpiry: null };
};

const { user: initialUser, sessionExpiry: initialExpiry } = getInitialUser();

export const useUserStore = create<UserStore>((set, get) => ({
  user: initialUser,
  isAuthenticated: !!initialUser,
  sessionExpiry: initialExpiry,
  
  setUser: (user, rememberMe = false) => {
    // Clear any existing session first to prevent conflicts
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('userSession');
      } catch (error) {
        // Error clearing user session
      }
    }
    
    const now = Date.now();
    const duration = rememberMe ? REMEMBER_ME_DURATION : SESSION_DURATION;
    const expiresAt = now + duration;
    
    const sessionData: SessionData = {
      user,
      timestamp: now,
      expiresAt
    };
    
    set({ 
      user, 
      isAuthenticated: true,
      sessionExpiry: expiresAt 
    });
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('userSession', JSON.stringify(sessionData));
      } catch (error) {
        // Error storing user session
      }
    }
  },
  
  updateUser: (updates) => {
    const { user, sessionExpiry } = get();
    if (!user) return;
    
    const updatedUser = { ...user, ...updates };
    
    set({ user: updatedUser });
    
    // Update localStorage if available
    if (typeof window !== 'undefined' && sessionExpiry) {
      try {
        const sessionData: SessionData = {
          user: updatedUser,
          timestamp: Date.now(),
          expiresAt: sessionExpiry
        };
        localStorage.setItem('userSession', JSON.stringify(sessionData));
      } catch (error) {
        // Error updating user session
      }
    }
  },
  
  clearUser: () => {
    set({ 
      user: null, 
      isAuthenticated: false,
      sessionExpiry: null 
    });
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('userSession');
      
      // Track logout event
      if (window.gtag) {
        window.gtag('event', 'logout', {
          event_category: 'Authentication',
          event_label: 'User Logout'
        });
      }
    }
  },
  
  checkSession: () => {
    const { user, sessionExpiry } = get();
    
    if (!user || !sessionExpiry) {
      return false;
    }
    
    const now = Date.now();
    if (now >= sessionExpiry) {
      // Session expired
      get().clearUser();
      return false;
    }
    
    return true;
  },
  
  extendSession: () => {
    const { user, checkSession } = get();
    
    if (user && checkSession()) {
      // Extend session by default duration
      const now = Date.now();
      const expiresAt = now + SESSION_DURATION;
      
      const sessionData: SessionData = {
        user,
        timestamp: now,
        expiresAt
      };
      
      set({ sessionExpiry: expiresAt });
      
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('userSession', JSON.stringify(sessionData));
        } catch (error) {
          // Error extending user session
        }
      }
    }
  }
}));

// Auto-cleanup expired sessions on page visibility change
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      useUserStore.getState().checkSession();
    }
  });
}
