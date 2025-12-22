import { useEffect } from 'react';
import { useUserStore } from '@/store/userStore';

export function useAuthHydration() {
  const { hydrate, isHydrated } = useUserStore();

  useEffect(() => {
    if (!isHydrated) {
      hydrate();
    }
  }, [hydrate, isHydrated]);

  // useEffect only runs on client, so if we're here and hydrated, we're good
  // For SSR, isHydrated will be false initially, which is correct
  return { isHydrated };
}
