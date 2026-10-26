'use client';
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import ProductCatalog from "@/components/productscatalogs/ProductCatalog";
import { SkeletonProductDetailPage } from "@/components/skeleton/SkeletonProductDetailPage";
import { Product } from "@/types/product";
import { fetchGraphQL } from "@/lib/graphqlClient";
import { useProductsTranslations } from '@/hooks/useProductsTranslations';

export default function ViewProductPage() {
  const params = useParams();
  const { tDetailsPage } = useProductsTranslations();
  const user = useUserStore(state => state.user);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!user?.id || !params?.id) return;

      setLoading(true);
      try {
        
        const PRODUCT_QUERY = `
          query GetProduct($userId: Int!, $id: String!) {
            product(userId: $userId, id: $id) {
              id
              productId
              sku
              name
              description
              productType
              brand
              supplier
              status
              productCategory
              catalogName
              images
              halalCertified
              bpomApproved
              originalProduct
              returnPolicyDays
              stockQuantity
              lowStockThreshold
              stockStatus
              variantOptions {
                id
                variantName
                sku
                purchasePrice
                sellingPrice
                originalSellingPrice
                moq
                stockQuantity
                lowStockThreshold
                stockStatus
                isDefault
                isActive
                attributes
              }
              variantDefinitions
              createdAt
              updatedAt
              userId
              hasActiveOffer
              offerBadge
              customOfferClientCount
              offerId
              offerName
              discountType
              discountValue
              promotionDetails
              originalPrice
            }
          }
        `;

        const data = await fetchGraphQL<{ product: Product | null }>(PRODUCT_QUERY, {
          userId: user.id,
          id: String(params?.id),
        });
        
        if (data.product) {
          setProduct(data.product);
        } else {
          window.location.href = `/products/list/deleted?id=${params?.id}`;
          return;
        }
      } catch (error) {
        setError(tDetailsPage('loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [user?.id, params?.id]);

  if (loading) {
    return <SkeletonProductDetailPage />;
  }

  if (error || !product) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || tDetailsPage('notFound')}</p>
          <button 
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
          >
            {tDetailsPage('goBack')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <ProductCatalog mode="view" product={product} />
    </div>
  );
}