import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Lakupak | Dashboard',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Dynamically require the client layout to avoid client/server boundary issues
  const DashboardClientLayout = require('./DashboardClientLayout').default;
  return <DashboardClientLayout>{children}</DashboardClientLayout>;
}
