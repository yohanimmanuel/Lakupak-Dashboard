/**
 * Regenerate docs _meta.json sidebar navigation only.
 * Does NOT overwrite markdown page bodies (hand-written content is preserved).
 *
 * Run: node scripts/generateDocsContent.mjs
 */
import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'content', 'docs');

/** [slug, sectionId, sectionTitleEn, sectionTitleId, itemTitleEn, itemTitleId] */
const sections = [
  {
    id: 'overview',
    titleEn: 'Overview',
    titleId: 'Ringkasan',
    items: [
      ['introduction', 'What is Lakupak?', 'Apa itu Lakupak?'],
      ['glossary', 'Glossary', 'Glosarium'],
      ['getting-started', 'Getting started', 'Memulai'],
    ],
  },
  {
    id: 'about',
    titleEn: 'About Lakupak',
    titleId: 'Tentang Lakupak',
    items: [
      ['about/mission-and-story', 'Mission and story', 'Misi dan cerita'],
      ['about/who-we-serve', 'Who we serve', 'Siapa yang kami layani'],
      ['about/controlled-marketplace', 'Controlled marketplace', 'Marketplace terkendali'],
      ['about/benefits-by-role', 'Benefits by role', 'Manfaat per peran'],
      ['about/faq', 'FAQ', 'FAQ'],
    ],
  },
  {
    id: 'dashboard',
    titleEn: 'Dashboard',
    titleId: 'Dashboard',
    items: [
      ['dashboard/overview', 'Dashboard overview', 'Ringkasan Dashboard'],
      ['dashboard/home', 'Home', 'Beranda'],
      ['dashboard/clients', 'Clients', 'Klien'],
      ['dashboard/products', 'Products', 'Produk'],
      ['dashboard/orders', 'Orders', 'Pesanan'],
      ['dashboard/offers', 'Offers', 'Penawaran'],
      ['dashboard/marketing', 'Marketing', 'Pemasaran'],
      ['dashboard/analytics', 'Analytics', 'Analitik'],
      ['dashboard/marketplace-admin', 'Marketplace (admin)', 'Marketplace (admin)'],
      ['dashboard/logistics', 'Logistics', 'Logistik'],
      ['dashboard/settings', 'Settings', 'Pengaturan'],
    ],
  },
  {
    id: 'marketplace',
    titleEn: 'Marketplace',
    titleId: 'Marketplace',
    items: [
      ['marketplace/overview', 'Marketplace overview', 'Ringkasan Marketplace'],
      ['marketplace/account', 'Account', 'Akun'],
      ['marketplace/browse-search', 'Browse and search', 'Jelajah dan cari'],
      ['marketplace/cart-checkout', 'Cart and checkout', 'Keranjang dan checkout'],
      ['marketplace/orders', 'Orders', 'Pesanan'],
      ['marketplace/offers-following', 'Offers and following', 'Penawaran dan following'],
      ['marketplace/notifications', 'Notifications', 'Notifikasi'],
      ['marketplace/account-settings', 'Account settings', 'Pengaturan akun'],
    ],
  },
  {
    id: 'driver',
    titleEn: 'Driver',
    titleId: 'Driver',
    items: [
      ['driver/overview', 'Driver overview', 'Ringkasan Driver'],
      ['driver/login-access', 'Login and access', 'Login dan akses'],
      ['driver/tasks', 'Tasks', 'Tugas'],
      ['driver/deliveries', 'Deliveries', 'Pengiriman'],
      ['driver/location-realtime', 'Location and realtime', 'Lokasi dan realtime'],
      ['driver/troubleshooting', 'Troubleshooting', 'Pemecahan masalah'],
    ],
  },
  {
    id: 'platform',
    titleEn: 'Platform',
    titleId: 'Platform',
    items: [
      ['platform/ecosystem', 'Lakupak ecosystem', 'Ekosistem Lakupak'],
      ['platform/order-flow', 'How orders flow', 'Alur pesanan'],
      ['platform/trust-and-data', 'Trust, privacy, and data', 'Kepercayaan, privasi, dan data'],
      ['platform/help-and-support', 'Help and support', 'Bantuan dan dukungan'],
    ],
  },
];

function buildMeta(locale) {
  const isId = locale === 'id';
  return {
    sections: sections.map((s) => ({
      id: s.id,
      title: isId ? s.titleId : s.titleEn,
      items: s.items.map(([slug, titleEn, titleId]) => ({
        slug,
        title: isId ? titleId : titleEn,
      })),
    })),
  };
}

fs.writeFileSync(path.join(root, 'en', '_meta.json'), JSON.stringify(buildMeta('en'), null, 2));
fs.writeFileSync(path.join(root, 'id', '_meta.json'), JSON.stringify(buildMeta('id'), null, 2));

console.log('Updated _meta.json for en and id (markdown bodies untouched).');
