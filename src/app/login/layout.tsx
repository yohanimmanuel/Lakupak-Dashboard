import type { Metadata } from 'next';
import { AuthIntlProvider } from '@/components/auth/AuthIntlProvider';

export const metadata: Metadata = {
  title: 'Laku - Log in'
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthIntlProvider>{children}</AuthIntlProvider>;
}