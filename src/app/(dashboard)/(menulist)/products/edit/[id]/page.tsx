'use client';
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import ProductCatalog from "@/components/productscatalogs/ProductCatalog";
import { Product } from "@/types/product";
import { fetchGraphQL } from "@/lib/graphqlClient";

export default function EditProductPage() {
  const params = useParams();
  const user = useUserStore(state => state.user);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!params?.id) {
        setError('Invalid product ID');
        setLoading(false);
        return;
      }
      if (!user?.id) {
        // Wait for user authentication - keep loading state
        return;
      }
      
      try {
        setLoading(true);
        
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
              legacyVariants
              createdAt
              updatedAt
              userId
              hasActiveOffer
              offerBadge
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
          setError('Product not found');
        }
      } catch (error) {
        setError('Failed to load product');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [user?.id, params?.id]);

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading product...</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Product not found'}</p>
          <button 
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <ProductCatalog mode="edit" product={product} />
    </div>
  );
}
