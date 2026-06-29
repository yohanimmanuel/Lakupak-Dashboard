import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Laku - Log in',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
