'use client';
import { useParams } from 'next/navigation';
import ProductCatalog from "@/components/productscatalogs/ProductCatalog";

export default function ProductCatalogPage() {
  const params = useParams();
  const productId = params.id as string;

  // For now, we'll use a mock product. In a real app, you'd fetch this from an API
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
    status: "Active" as const,
    catalogType: "Internal" as const,
    catalogName: "Sample Catalog",
    images: [],
    sizes: ["S", "M", "L"],
    gender: "Unisex" as const,
    discount: 0,
    discountType: ""
  };

  return (
    <div className="p-4 w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white">
      <ProductCatalog 
        mode="edit" 
        product={mockProduct}
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