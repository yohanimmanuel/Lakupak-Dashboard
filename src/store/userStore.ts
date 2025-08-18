import { create } from 'zustand';

interface User {
  id: number | null;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  address?: string;
}

interface UserStore {
  user: User | null;
  setUser: (user: User) => void;
  clearUser: () => void;
}

const getInitialUser = (): User | null => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('user');
    if (stored) return JSON.parse(stored);
  }
  return null;
};

export const useUserStore = create<UserStore>((set) => ({
  user: getInitialUser(),
  setUser: (user) => {
    set({ user });
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
    }
  },
  clearUser: () => {
    set({ user: null });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
    }
  },
}));
