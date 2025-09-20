import { useEffect, useState } from 'react';
import { useUserStore } from '@/store/userStore';

export function useAuthHydration() {
  const { hydrate, isHydrated } = useUserStore();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    if (!isHydrated) {
      hydrate();
    }
  }, [hydrate, isHydrated]);

  return { isHydrated: isClient && isHydrated };
}
