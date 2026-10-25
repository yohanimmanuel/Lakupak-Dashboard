import type { DocLocale, DocsCategory } from './types';

export function getDocsCategories(locale: DocLocale): DocsCategory[] {
  const base = `/${locale}/docs`;
  return [
    {
      id: 'overview',
      title: locale === 'id' ? 'Ringkasan' : 'Overview',
      description:
        locale === 'id'
          ? 'Pengenalan platform dan panduan memulai.'
          : 'Platform introduction and getting started.',
      href: `${base}/introduction`,
      icon: 'overview',
    },
    {
      id: 'about',
      title: locale === 'id' ? 'Tentang Lakupak' : 'About Lakupak',
      description:
        locale === 'id'
          ? 'Misi, siapa yang dilayani, pemanfaatan portofolio, dan FAQ.'
          : 'Mission, who we serve, portfolio utilisation, and FAQ.',
      href: `${base}/about/mission-and-story`,
      icon: 'about',
    },
    {
      id: 'dashboard',
      title: 'Dashboard',
      description:
        locale === 'id'
          ? 'Kelola klien, produk, pesanan, penawaran, dan pengaturan distributor.'
          : 'Manage clients, products, orders, offers, and distributor settings.',
      href: `${base}/dashboard/overview`,
      icon: 'dashboard',
    },
    {
      id: 'marketplace',
      title: 'Marketplace',
      description:
        locale === 'id'
          ? 'Aplikasi pembeli: telusuri, pesan, dan lacak pesanan B2B.'
          : 'Buyer app: browse, order, and track B2B purchases.',
      href: `${base}/marketplace/overview`,
      icon: 'marketplace',
    },
    {
      id: 'platform',
      title: locale === 'id' ? 'Platform' : 'Platform',
      description:
        locale === 'id'
          ? 'Ekosistem Lakupak, alur bisnis, kepercayaan, dan bantuan.'
          : 'Lakupak ecosystem, business flows, trust, and support.',
      href: `${base}/platform/ecosystem`,
      icon: 'platform',
    },
  ];
}
