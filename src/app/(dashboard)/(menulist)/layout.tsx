export const metadata = {
  title: 'Laku Laku | Dashboard',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Dynamically require the client layout to avoid client/server boundary issues
  const DashboardClientLayout = require('./DashboardClientLayout').default;
  return <DashboardClientLayout>{children}</DashboardClientLayout>;
}
