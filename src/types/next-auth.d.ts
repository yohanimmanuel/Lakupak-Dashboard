import 'next-auth';
import 'next-auth/jwt';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user?: DefaultSession['user'] & {
      id?: string;
      isSuspended?: boolean;
      suspendedAt?: string | null;
      suspensionReason?: string | null;
    };
  }

  interface User {
    id: string;
    isSuspended?: boolean;
    suspendedAt?: string | null;
    suspensionReason?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    isSuspended?: boolean;
    suspendedAt?: string | null;
    suspensionReason?: string | null;
  }
}

