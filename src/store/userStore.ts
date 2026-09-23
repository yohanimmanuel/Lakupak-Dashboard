
import { create } from 'zustand';
import { clearAiChatSession } from '@/lib/lakuAi/aiChatSession';

interface Company {
  id: number;
  name: string;
  businessRegistrationNumber?: string | null;
  taxId?: string | null;
  logo?: string | null;
  bannerImage?: string | null;
  industryType?: string | null;
  businessDescription?: string | null;
  yearsInOperation?: string | null;
  deliveryCoverageArea?: string | null;
  fulfillmentNotes?: string | null;
  companySize?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  documentVerification: boolean;
  businessLicenseVerification: boolean;
  complianceStatus: string;
  shippingPreferences?: string | null;
  deliveryTimeSlots?: string | null;
  preferredDeliveryDays?: string | null;
  specialInstructions?: string | null;
  pickupAddress?: string | null;
  defaultDeliveryLeadTimeMinDays?: number | null;
  defaultDeliveryLeadTimeMaxDays?: number | null;
  buyerPaymentTermDays?: number | null;
  /**
   * Non-sensitive reference to the billing profile.
   * Full billing details should be fetched server-side with authenticated calls.
   */
  billingProfileId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface User {
  id: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  bio?: string;
  avatar?: string;
  companyId?: number;
  company?: Company;
  region?: string;
  currency?: string;
  language?: string;
}

interface SessionData {
  user: User;
  timestamp: number;
  expiresAt: number;
}

type PersistedCompany = Omit<
  Company,
  // Nothing sensitive should be persisted to localStorage.
  never
>;

type PersistedUser = Omit<User, 'company'> & {
  company?: PersistedCompany;
};

type PersistedSessionData = Omit<SessionData, 'user'> & {
  user: PersistedUser;
};

function sanitizeUserForStorage(user: User): PersistedUser {
  // Currently we only strip sensitive company billing/contact fields from persistence.
  // If more fields become sensitive later, centralize their redaction here.
  const company = user.company
    ? {
        ...user.company,
        // Ensure any accidentally attached billing fields never persist.
        // (Fields removed from the type above, but keep runtime-safe redaction too.)
        billingProfileId: user.company.billingProfileId ?? null,
      }
    : undefined;

  if (company) {
    const c = company as unknown as Record<string, unknown>;
    delete c.billingBankName;
    delete c.billingBankAccountName;
    delete c.billingBankAccountNumber;
    delete c.billingCompanyName;
    delete c.billingAddressLine1;
    delete c.billingCity;
    delete c.billingState;
    delete c.billingPostalCode;
    delete c.billingCountry;
    delete c.billingContactPhone;
    delete c.billingContactEmail;
  }

  return { ...user, company };
}

interface UserStore {
  user: User | null;
  isAuthenticated: boolean;
  sessionExpiry: number | null;
  isHydrated: boolean;
  setUser: (user: User, rememberMe?: boolean) => void;
  updateUser: (updates: Partial<User>) => void;
  clearUser: () => void;
  checkSession: () => boolean;
  extendSession: () => void;
  hydrate: () => void;
  debugSession: () => void;
  forceClearAllSessions: () => void;
}

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days (default session)
const REMEMBER_ME_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days (with "Remember Me")
const REMEMBER_ME_PREFERENCE_KEY = 'laku.auth.rememberMe';

export function stashRememberMePreference(rememberMe: boolean) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(REMEMBER_ME_PREFERENCE_KEY, rememberMe ? '1' : '0');
  } catch {
    // Ignore unavailable sessionStorage.
  }
}

export function consumeRememberMePreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = sessionStorage.getItem(REMEMBER_ME_PREFERENCE_KEY);
    sessionStorage.removeItem(REMEMBER_ME_PREFERENCE_KEY);
    return value === '1';
  } catch {
    return false;
  }
}

const getInitialUser = (): { user: User | null; sessionExpiry: number | null } => {
  // Always return null during SSR to prevent hydration mismatches
  if (typeof window === 'undefined') {
    return { user: null, sessionExpiry: null };
  }
  
  try {
    const stored = localStorage.getItem('userSession');
    if (stored) {
      const sessionData: PersistedSessionData = JSON.parse(stored);
      const now = Date.now();
      
      // Check if session is still valid
      if (now < sessionData.expiresAt) {
        return { 
          user: sessionData.user as unknown as User, 
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
  return { user: null, sessionExpiry: null };
};

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  sessionExpiry: null,
  isHydrated: false,
  
  setUser: (user, rememberMe = false) => {
    // Simple: just set the user, last login wins
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
    
    const sessionData: PersistedSessionData = {
      user: sanitizeUserForStorage(user),
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
        const sessionData: PersistedSessionData = {
          user: sanitizeUserForStorage(updatedUser),
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
    clearAiChatSession();
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('userSession');
      
      // Clear NextAuth session if it exists
      try {
        // This will trigger NextAuth to clear its session
        fetch('/api/auth/signout', { method: 'POST' }).then(() => {
        });
      } catch (error) {
        // Ignore errors if NextAuth is not available
      }
      
      // Track logout event
      if (window.gtag) {
        window.gtag('event', 'logout', {
          event_category: 'Authentication',
          event_label: 'User Logout'
        });
      }
    }
  },

  hydrate: () => {
    if (typeof window === 'undefined') return;
    
    const { user, sessionExpiry } = getInitialUser();
    set({
      user,
      isAuthenticated: !!user,
      sessionExpiry,
      isHydrated: true
    });
  },

  debugSession: () => {
    if (typeof window === 'undefined') return;
    
    const { user, isAuthenticated, sessionExpiry, isHydrated } = get();
    const stored = localStorage.getItem('userSession');
  },

  forceClearAllSessions: () => {
    if (typeof window === 'undefined') return;
    
    
    // Clear user store
    set({ 
      user: null, 
      isAuthenticated: false,
      sessionExpiry: null 
    });
    clearAiChatSession();
    
    // Clear localStorage
    localStorage.removeItem('userSession');
    
    // Clear NextAuth session
    try {
      fetch('/api/auth/signout', { method: 'POST' }).then(() => {
        // Reload page to ensure clean state
        window.location.reload();
      });
    } catch (error) {
      // Still reload to ensure clean state
      window.location.reload();
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
