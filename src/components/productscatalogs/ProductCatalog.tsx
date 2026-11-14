'use client';

import ProductCatalogView from '@/components/productscatalogs/ProductCatalogView';
import { useProductCatalogController } from '@/components/productscatalogs/useProductCatalogController';
import type { ProductCatalogProps } from '@/components/productscatalogs/productCatalogHelpers';

/** Product catalog entry point. State, mutations and persistence stay centralized in the controller. */
export default function ProductCatalog(props: ProductCatalogProps) {
  const viewProps = useProductCatalogController(props);
  return <ProductCatalogView {...viewProps} />;
}
