import { notFound } from 'next/navigation';
import { FeatureModulePage } from '../FeatureModulePage';
import { getFeatureModule, type FeatureModuleSlug } from '../modules';

export function generateStaticParams() {
  return [
    { slug: 'clients' },
    { slug: 'products' },
    { slug: 'orders' },
    { slug: 'offers' },
    { slug: 'sales' },
    { slug: 'marketplace' },
    { slug: 'analytics' },
    { slug: 'automations' },
  ];
}

export default async function FeatureSlugPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const resolved = await params;
  const moduleDef = getFeatureModule(resolved.slug);

  if (!moduleDef) {
    notFound();
  }

  return <FeatureModulePage slug={moduleDef.slug as FeatureModuleSlug} locale={resolved.locale} />;
}
