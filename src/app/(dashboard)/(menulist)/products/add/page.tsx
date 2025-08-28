'use client';
import React from "react";
import ProductCatalog from "@/components/productscatalogs/ProductCatalog";

export default function AddProductPage() {
  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <ProductCatalog mode="add" />
    </div>
  );
}
