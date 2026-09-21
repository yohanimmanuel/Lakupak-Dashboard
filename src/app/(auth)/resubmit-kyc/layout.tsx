import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lakupak | Re-upload documents',
};

export default function ResubmitKycLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
