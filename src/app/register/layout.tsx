import { Metadata } from 'next';
import { AuthIntlProvider } from '@/components/auth/AuthIntlProvider';

export const metadata: Metadata = {
    title: 'Laku | Register'
  }
  
  export default function RegisterLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return <AuthIntlProvider>{children}</AuthIntlProvider>;
  }