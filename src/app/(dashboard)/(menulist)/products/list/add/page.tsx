'use client';
import React from "react";
import ProductCatalog from "@/components/productscatalogs/ProductCatalog";

export default function AddProductPage() {
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <ProductCatalog mode="add" />
    </div>
  );
}
