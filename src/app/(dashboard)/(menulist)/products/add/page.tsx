'use client';
import ProductCatalog from "@/components/productscatalogs/ProductCatalog";

export default function AddProductPage() {
  return (
    <div className="p-4 w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white">
      <ProductCatalog
        mode="add"
        product={undefined}
        onSave={(data) => {
          console.log('Product saved:', data);
          // In a real app, this would save to your backend
          // After saving, you could redirect to the products list or the new product's catalog page
        }}
        onCancel={() => {
          // Navigate back to products list
          window.history.back();
        }}
      />
    </div>
  );
}
