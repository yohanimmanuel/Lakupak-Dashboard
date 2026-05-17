import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'content', 'docs');

const enPages = [
  ['introduction.md', 'Overview', 'overview', 1, 'overview', 'What is Laku?', 'A B2B commerce operating platform that modernizes wholesale trade between distributors and small retailers in Indonesia.', null],
  ['glossary.md', 'Overview', 'overview', 2, 'overview', 'Glossary', 'Key terms used across Laku.', null],
  ['getting-started.md', 'Overview', 'overview', 3, 'overview', 'Getting started', 'Choose your module and first steps.', null],
  ['about/mission-and-story.md', 'About Laku', 'about', 1, 'about', 'Mission and story', 'Why Laku exists.', null],
  ['about/who-we-serve.md', 'About Laku', 'about', 2, 'about', 'Who we serve', 'Distributors, buyers, drivers.', null],
  ['about/controlled-marketplace.md', 'About Laku', 'about', 3, 'about', 'Controlled marketplace', 'Distributor-first marketplace model.', null],
  ['about/benefits-by-role.md', 'About Laku', 'about', 4, 'about', 'Benefits by role', 'Outcomes by role.', null],
  ['about/faq.md', 'About Laku', 'about', 5, 'about', 'FAQ', 'Common business questions.', null],
  ['dashboard/overview.md', 'Dashboard', 'dashboard', 10, 'dashboard', 'Dashboard overview', 'Navigation, login, and product tours.', `# Dashboard overview\n\nThe distributor Dashboard is the control center for catalog, orders, CRM, analytics, marketplace presence, and logistics.\n\n## Sign in\n\nUse **Login** with email and password (NextAuth). New distributors register via **Get Started**, then land on **Home**.\n\n## Sidebar navigation\n\n- **Home** — KPIs and shortcuts\n- **Clients** — Buyers and suppliers\n- **Products**, **Orders**, **Offers**\n- **Marketing**, **Analytics**\n- **Marketplace**, **Logistics**, **Settings**\n\n## Product tours\n\nOpen **Settings → Features & Tours** to replay guided walkthroughs. A welcome prompt may appear on first login.`],
  ['dashboard/home.md', 'Dashboard', 'dashboard', 11, 'dashboard', 'Home', 'Dashboard hub and KPIs.', `# Home\n\nThe **Home** page summarizes business health: revenue trends, inventory alerts, and quick links to common tasks.\n\n## Tips\n\n- Use date filters where available to match your reporting period.\n- Follow inventory alerts to restock before stockouts affect orders.`],
  ['dashboard/clients.md', 'Dashboard', 'dashboard', 12, 'dashboard', 'Clients', 'Buyers and suppliers CRM.', `# Clients\n\nManage B2B relationships in two areas:\n\n## Buyers\n\nRetail accounts that purchase from you on the marketplace. View profiles, order history, and restore deleted buyers from **Deleted buyers** when needed.\n\n## Suppliers\n\nUpstream suppliers for your catalog. Track contact details and purchasing relationships.`],
  ['dashboard/products.md', 'Dashboard', 'dashboard', 13, 'dashboard', 'Products', 'Catalog, stock, and marketplace publish.', `# Products\n\n## Catalog management\n\n- **Add Product** — create SKUs with variants, pricing, and images.\n- **Product table** — filter by status (Draft/Published), stock, and offers.\n- **Refresh** — reload catalog data; **Export** — download XLSX.\n\n## Publishing\n\nProducts must be **Published** to appear on the buyer Marketplace. Draft items stay internal.\n\n## Stock\n\nStock is tracked per variant. Low-stock thresholds drive alerts on Home and product cards.`],
  ['dashboard/orders.md', 'Dashboard', 'dashboard', 14, 'dashboard', 'Orders', 'Order list, fulfillment, and export.', `# Orders\n\n## Orders list\n\nView all B2B orders with map overview, summary cards, and filterable table.\n\n## Actions\n\n- **Refresh** — sync latest order data.\n- **Archived Orders** — review archived rows; unarchive when needed.\n- **Export Data** — spreadsheet export for reporting.\n\n## Order details\n\nOpen a row to see line items, buyer info, payment and delivery status, and update fulfillment steps.`],
  ['dashboard/offers.md', 'Dashboard', 'dashboard', 15, 'dashboard', 'Offers', 'Discounts and promotions.', `# Offers\n\nCreate and manage **discounts** and **promotions** linked to your catalog.\n\n## Workflow\n\n1. Click **Create Offer**.\n2. Define discount types, date ranges, and eligible products.\n3. Monitor usage and performance on stat cards.\n4. Filter the table by **All**, **Discounts**, or **Promotions**.\n\nActive offers surface in the buyer Marketplace when configured.`],
  ['dashboard/marketing.md', 'Dashboard', 'dashboard', 16, 'dashboard', 'Marketing', 'Sales team and campaigns.', `# Marketing\n\n## Team\n\nManage sales representatives, territories, and performance (where enabled for your account).\n\n## Campaigns\n\nPlan and track marketing campaigns. Share campaign links for attribution when supported.\n\n> **Note:** Marketing automation may be disabled in the sidebar until released.`],
  ['dashboard/analytics.md', 'Dashboard', 'dashboard', 17, 'dashboard', 'Analytics', 'Financial, sales, and operational reports.', `# Analytics\n\nThree report areas:\n\n- **Financial** — revenue, margins, and payment-related metrics.\n- **Sales** — customer and product sales trends.\n- **Operational** — fulfillment and performance KPIs.\n\nUse consistent date ranges when comparing periods.`],
  ['dashboard/marketplace-admin.md', 'Dashboard', 'dashboard', 18, 'dashboard', 'Marketplace (admin)', 'Storefront metrics and published listings.', `# Marketplace (admin)\n\nThis Dashboard page is **not** the buyer app — it shows how your business performs on the marketplace.\n\n## Features\n\n- Quick stats: published vs total products.\n- **Distributor info** — storefront profile visible to buyers.\n- **Performance** — views, engagement, and sales metrics.\n- **Published products** list with links back to catalog.\n\nUse the time-range selector to change reporting windows.`],
  ['dashboard/logistics.md', 'Dashboard', 'dashboard', 19, 'dashboard', 'Logistics', 'Fleets, drivers, and delivery tracking.', `# Logistics\n\n## Fleet management\n\n- **Add Fleet & Driver** — create delivery runs and assign drivers.\n- **Fleet list** — select a fleet to view details and route map.\n- **Export** — download fleet data for operations.\n\n## Driver accounts\n\nDrivers are provisioned by the distributor (not self-service signup). They use the **Laku Driver** mobile app with credentials you provide.\n\n## Tracking\n\nOpen fleet details for route map, vehicle info, and **Open Details** for full tracking view.`],
  ['dashboard/settings.md', 'Dashboard', 'dashboard', 20, 'dashboard', 'Settings', 'Account, billing, team, security, tours.', `# Settings\n\n| Tab | Purpose |\n|-----|--------|\n| General Info | Profile and contact |\n| Distributor Operations | Company, address, shipping preferences |\n| Features & Tours | Replay product walkthroughs |\n| Team & Sales | Team members |\n| Language & Region | Locale and currency |\n| Billing & Payment | Payment methods and invoices |\n| Security & Password | Password and security options |\n\nKeep company and billing data current to avoid payout or compliance issues.`],
  ['marketplace/overview.md', 'Marketplace', 'marketplace', 30, 'marketplace', 'Marketplace overview', 'Buyer mobile app introduction.', `# Marketplace overview\n\n**Laku Marketplace** is the buyer-facing mobile app (Expo/React Native) for discovering distributor catalogs and placing B2B orders.\n\n## Main tabs\n\n- **Home** — banners, categories, and recommended products\n- **Categories** — browse by category\n- **Orders** — order history and status\n- **Notifications** — alerts and updates\n- **Account** — profile and settings\n\n## Requirements\n\n- Verified buyer account (OTP signup)\n- Network access to your Laku API environment`],
  ['marketplace/account.md', 'Marketplace', 'marketplace', 31, 'marketplace', 'Account', 'Signup, login, and OTP.', `# Account\n\n## Sign up\n\n1. Open the app and start registration.\n2. Verify phone via **OTP** (WhatsApp or SMS, depending on configuration).\n3. Complete business profile fields.\n\n## Sign in\n\nUse username/email and password, or OTP where enabled.\n\n## Suspended accounts\n\nSuspended buyers see a blocking message and cannot place orders until the distributor or platform resolves the issue.`],
  ['marketplace/browse-search.md', 'Marketplace', 'marketplace', 32, 'marketplace', 'Browse and search', 'Categories and Meilisearch-powered search.', `# Browse and search\n\n## Categories\n\nBrowse the distributor catalog by product category from the **Categories** tab.\n\n## Search\n\nFull-text search is powered by **Meilisearch** on the backend. Use filters on the search screen to narrow results.\n\n## Product detail\n\nTap a product to see variants, pricing tiers, offers, and add-to-cart options.`],
  ['marketplace/cart-checkout.md', 'Marketplace', 'marketplace', 33, 'marketplace', 'Cart and checkout', 'Bulk ordering and payment.', `# Cart and checkout\n\n## Cart\n\nAdd line items with quantities (often by carton). Cart syncs via GraphQL while you shop.\n\n## Checkout\n\n1. Review cart and delivery address.\n2. Confirm order; seller bank details may display for transfer payment.\n3. Complete checkout to create the order in the distributor Dashboard.\n\n## After checkout\n\nUse **Payment success** and order detail screens to complete payment steps when required by the distributor.`],
  ['marketplace/orders.md', 'Marketplace', 'marketplace', 34, 'marketplace', 'Orders', 'Tracking, payment, cancel, returns.', `# Orders\n\n## Order list\n\nThe **Orders** tab lists active and past orders with status badges.\n\n## Order detail\n\n- View line items and delivery info\n- **Pay** when payment is pending\n- **Cancel** or **Return/refund** when allowed by policy\n- Open **Delivery information** and map for tracking`],
  ['marketplace/offers-following.md', 'Marketplace', 'marketplace', 35, 'marketplace', 'Offers and following', 'Promotions and distributor networks.', `# Offers and following\n\n## Offers\n\nHome and dedicated **Offers** screens show active promotions from distributors you shop with.\n\n## Following distributors\n\nFollow favorite distributors for faster access in **My networks** and distributor detail pages.\n\n## Reporting\n\nReport inappropriate distributor content via the in-app report flow when available.`],
  ['marketplace/notifications.md', 'Marketplace', 'marketplace', 36, 'marketplace', 'Notifications', 'Push and in-app updates.', `# Notifications\n\n## Push notifications\n\nRegister device push tokens for order updates and platform announcements.\n\n## In-app\n\nThe **Notifications** tab lists recent events. Order status changes may also appear as banners during active sessions.\n\n## Realtime\n\nWebSocket and Supabase realtime channels can refresh orders without manual pull-to-refresh.`],
  ['marketplace/account-settings.md', 'Marketplace', 'marketplace', 37, 'marketplace', 'Account settings', 'Profile, addresses, language.', `# Account settings\n\nFrom **Account**:\n\n- Edit profile and business details\n- Manage **Addresses** for delivery\n- Change **Language** (English / Indonesian)\n- Configure notification preferences\n- View favourites, recently viewed, and buy-again shortcuts`],
  ['driver/overview.md', 'Driver', 'driver', 40, 'driver', 'Driver overview', 'Fleet delivery mobile app.', `# Driver overview\n\n**Laku Driver** helps fleet drivers execute assigned delivery routes for a distributor.\n\n## Access model\n\nDrivers do **not** self-register. The distributor creates driver credentials in **Dashboard → Logistics**.\n\n## Main areas\n\n- **Home** — today’s overview\n- **Tasks** — fleet and delivery list\n- **Notifications** — alerts\n- **Account** — profile and logout`],
  ['driver/login-access.md', 'Driver', 'driver', 41, 'driver', 'Login and access', 'Credentials and profile.', `# Login and access\n\n## Login\n\nUse the username and password issued by your distributor.\n\n## Request access\n\nIf your organization uses the request flow, submit **Request driver access** from the welcome screen; the distributor approves in Dashboard.\n\n## Profile\n\nUpdate profile fields from **Account** when permitted.`],
  ['driver/tasks.md', 'Driver', 'driver', 42, 'driver', 'Tasks', 'Fleet list and filters.', `# Tasks\n\n## Task list\n\n**Tasks** shows fleets assigned to you with status filters (e.g. in transit, completed).\n\n## Fleet detail\n\nTap a fleet to open route summary, stops, and linked orders.\n\n## Refresh\n\nPull to refresh or rely on WebSocket updates when the app is open.`],
  ['driver/deliveries.md', 'Driver', 'driver', 43, 'driver', 'Deliveries', 'Status updates and POD.', `# Deliveries\n\n## Per-stop updates\n\nFor each order stop, update status:\n\n- **Shipped**\n- **Delivered** — attach POD photos when required\n- **Failed** — provide reason and evidence via **Report failure**\n\n## Offline behavior\n\nFailed or delayed syncs may queue in an offline outbox and retry when connectivity returns.`],
  ['driver/location-realtime.md', 'Driver', 'driver', 44, 'driver', 'Location and realtime', 'GPS and WebSocket events.', `# Location and realtime\n\n## GPS sync\n\nWhile logged in, the app periodically sends location to \`POST /api/driver/location\` for live tracking in the Dashboard.\n\n## WebSocket\n\nConnects to the shared marketplace WebSocket for \`order_updated\`, \`fleet_assigned\`, and announcement events.`],
  ['driver/troubleshooting.md', 'Driver', 'driver', 45, 'driver', 'Troubleshooting', 'Common issues.', `# Troubleshooting\n\n| Issue | What to try |\n|-------|-------------|\n| Cannot log in | Confirm credentials with distributor; check API URL |\n| Tasks empty | Wait for fleet assignment; pull to refresh |\n| Upload failed | Check camera permissions and network |\n| Status not saving | App retries offline queue; reopen order detail |\n\nContact your distributor operations team before reinstalling the app.`],
  ['platform/ecosystem.md', 'Platform', 'platform', 50, 'platform', 'Laku ecosystem', 'How Dashboard, Marketplace, and Driver work together.', null],
  ['platform/order-flow.md', 'Platform', 'platform', 51, 'platform', 'How orders flow', 'End-to-end B2B order journey.', null],
  ['platform/trust-and-data.md', 'Platform', 'platform', 52, 'platform', 'Trust, privacy, and data', 'Account standards and data ownership.', null],
  ['platform/help-and-support.md', 'Platform', 'platform', 53, 'platform', 'Help and support', 'Where to get help by role.', null],
];

const enMeta = {
  sections: [
    { id: 'overview', title: 'Overview', items: [] },
    { id: 'dashboard', title: 'Dashboard', items: [] },
    { id: 'marketplace', title: 'Marketplace', items: [] },
    { id: 'driver', title: 'Driver', items: [] },
    { id: 'platform', title: 'Platform', items: [] },
  ],
};

for (const [file, section, module, order, , title, desc, body] of enPages) {
  if (body === null) continue;
  const slug = file.replace('.md', '');
  const dir = path.dirname(file);
  const fullDir = dir === '.' ? path.join(root, 'en') : path.join(root, 'en', dir);
  fs.mkdirSync(fullDir, { recursive: true });
  const fm = `---\ntitle: ${title}\ndescription: ${desc}\nsection: ${section}\nmodule: ${module}\norder: ${order}\n---\n\n`;
  fs.writeFileSync(path.join(root, 'en', file), fm + body);
  const sec = enMeta.sections.find((s) => s.id === section.toLowerCase() || s.title === section);
  const target = enMeta.sections.find((s) => s.title === section);
  if (target) target.items.push({ slug: file.replace(/\.md$/, '').replace(/\\/g, '/'), title });
}

fs.writeFileSync(path.join(root, 'en', '_meta.json'), JSON.stringify(enMeta, null, 2));

// Indonesian: copy structure with id frontmatter titles where simple
for (const [file, section, module, order, , title, desc, body] of enPages) {
  if (body === null) continue;
  const dir = path.dirname(file);
  const fullDir = dir === '.' ? path.join(root, 'id') : path.join(root, 'id', dir);
  fs.mkdirSync(fullDir, { recursive: true });
  const idTitle = title; // keep English titles in v1 stubs; body prefixed
  const idBody = `> **Bahasa Indonesia:** Halaman ini menyediakan panduan yang sama dengan versi Inggris. Konten lengkap dalam Bahasa Indonesia akan dilengkapi secara bertahap.\n\n---\n\n` + body;
  const fm = `---\ntitle: ${idTitle}\ndescription: ${desc}\nsection: ${section}\nmodule: ${module}\norder: ${order}\n---\n\n`;
  fs.writeFileSync(path.join(root, 'id', file), fm + idBody);
}

const idMeta = JSON.parse(JSON.stringify(enMeta));
idMeta.sections.forEach((s) => {
  const map = { Overview: 'Ringkasan', 'About Laku': 'Tentang Laku', Dashboard: 'Dashboard', Marketplace: 'Marketplace', Driver: 'Driver', Platform: 'Platform' };
  if (map[s.title]) s.title = map[s.title];
});
fs.writeFileSync(path.join(root, 'id', '_meta.json'), JSON.stringify(idMeta, null, 2));

console.log('Generated', enPages.length, 'pages per locale');
