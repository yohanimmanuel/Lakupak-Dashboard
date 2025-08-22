'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import ProductCatalog from "@/components/productscatalogs/ProductCatalog";

export default function ProductCatalogPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const productId = params.id as string;
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Determine mode from URL params or product status
  const getMode = (productStatus: string, urlMode?: string) => {
    // If URL has explicit mode, use it
    if (urlMode) return urlMode;
    
    // Otherwise, determine mode based on product status
    if (productStatus === "Published") {
      return "view";
    } else {
      return "edit";
    }
  };

  useEffect(() => {
    // Simulate fetching product data
    const fetchProduct = async () => {
      setLoading(true);
      
      // Mock API call - in real app, replace with actual API call
      setTimeout(() => {
        // Mock product data - in real app, fetch from API using productId
        // For testing: use different statuses based on product ID
        let mockStatus: 'Published' | 'Draft' | 'Inactive' = 'Draft';
        if (productId.includes('PRD001') || productId.includes('published')) {
          mockStatus = 'Published';
        } else if (productId.includes('PRD002') || productId.includes('draft')) {
          mockStatus = 'Draft';
        } else if (productId.includes('PRD003') || productId.includes('inactive')) {
          mockStatus = 'Inactive';
        }
        
        const mockProduct = {
          id: productId,
          sku: `SKU${productId}`,
          name: "Sample Product",
          description: "This is a sample product description.",
          category: "Foods",
          brand: "Sample Brand",
          supplier: "Sample Supplier",
          stockQuantity: 100,
          purchasePrice: 1000,
          sellingPrice: 1500,
          status: mockStatus,
          catalogType: "Internal" as const,
          catalogName: "Sample Catalog",
          images: [],
          sizes: ["S", "M", "L"],
          gender: "Unisex" as const,
          discount: 0,
          discountType: ""
        };
        
        setProduct(mockProduct);
        setLoading(false);
      }, 500);
    };

    fetchProduct();
  }, [productId]);

  if (loading) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading product...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <p className="text-red-600">Product not found</p>
        </div>
      </div>
    );
  }

  const mode = getMode(product.status, searchParams.get('mode') as string);
  
  // Debug logging
  console.log('Product status:', product.status);
  console.log('URL mode param:', searchParams.get('mode'));
  console.log('Determined mode:', mode);

  return (
    <div className="p-4 w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white">
      <ProductCatalog 
        mode={mode as 'add' | 'view' | 'edit'}
        product={product}
        onSave={(data) => {
          console.log('Product saved:', data);
          // In a real app, this would save to your backend
        }}
        onCancel={() => {
          // Navigate back to products list
          window.history.back();
        }}
      />
    </div>
  );
}