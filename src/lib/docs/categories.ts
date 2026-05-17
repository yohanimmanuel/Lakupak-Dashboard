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
      id: 'dashboard',
      title: 'Dashboard',
      description:
        locale === 'id'
          ? 'Kelola produk, pesanan, klien, logistik, dan pengaturan distributor.'
          : 'Manage products, orders, clients, logistics, and distributor settings.',
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
      id: 'driver',
      title: 'Driver',
      description:
        locale === 'id'
          ? 'Aplikasi pengemudi: armada, pengiriman, dan bukti serah.'
          : 'Driver app: fleets, deliveries, and proof of delivery.',
      href: `${base}/driver/overview`,
      icon: 'driver',
    },
    {
      id: 'services',
      title: locale === 'id' ? 'Layanan' : 'Services',
      description:
        locale === 'id'
          ? 'API, autentikasi, realtime, pencarian, dan integrasi.'
          : 'APIs, authentication, realtime, search, and integrations.',
      href: `${base}/services/apis-overview`,
      icon: 'services',
    },
    {
      id: 'operations',
      title: locale === 'id' ? 'Operasi' : 'Operations',
      description:
        locale === 'id'
          ? 'Deploy, variabel lingkungan, database, dan pemeliharaan.'
          : 'Deployment, environment, database, and maintenance.',
      href: `${base}/operations/deployment`,
      icon: 'operations',
    },
  ];
}
