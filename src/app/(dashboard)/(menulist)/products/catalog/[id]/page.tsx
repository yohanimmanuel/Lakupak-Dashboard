'use client';
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import ProductCatalog from "@/components/productscatalogs/ProductCatalog";

export default function ViewProductPage() {
  const params = useParams();
  const user = useUserStore(state => state.user);
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!user?.id || !params.id) return;
      
      try {
        setLoading(true);
        const response = await fetch(`/api/products?id=${params.id}&userId=${user.id}`);
        
        if (response.ok) {
          const data = await response.json();
          setProduct(data);
        } else {
          setError('Product not found');
        }
      } catch (error) {
        console.error('Error fetching product:', error);
        setError('Failed to load product');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [user?.id, params.id]);

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
    <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen">
      <ProductCatalog mode="view" product={product} />
    </div>
  );
}