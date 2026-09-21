import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lakupak | Verify email',
};

export default function VerifyEmailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
