import { Metadata } from 'next';
import DashboardClientLayout from './DashboardClientLayout';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Lakupak | Dashboard',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardClientLayout>{children}</DashboardClientLayout>;
}
